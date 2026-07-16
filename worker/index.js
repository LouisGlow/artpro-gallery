/* ArtPro Worker — serves the static site (via the ASSETS binding) and a small
 * JSON API backed by a D1 database (the DB binding).
 *
 * Routes:
 *   GET    /api/health              -> { ok: true }
 *   GET    /api/pieces              -> { pieces: [...] }         (no image bytes)
 *   POST   /api/pieces              -> create; returns the piece (with pid)
 *   PUT    /api/pieces/:pid         -> update; returns the piece
 *   DELETE /api/pieces/:pid         -> { ok: true }
 *   GET    /api/pieces/:pid/photo   -> the uploaded image bytes
 *   (everything else)               -> the static site
 *
 * A "piece" in JSON is:
 *   { pid, photo, id, desc, artist, medium, art, frame, loc, status, archived }
 * where `photo` is a display URL. On create/update, `photo` may be a data: URL
 * (an uploaded image) — the Worker stores the bytes and rewrites `photo` to
 * /api/pieces/<pid>/photo. A plain path/URL is stored as-is.
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

// D1 row -> API piece (never includes the blob)
function rowToPiece(r) {
  // Version internal photo URLs by the row's updated time so a replaced image
  // (or a previously bad cache) always busts the browser cache.
  let photo = r.photo || '';
  if (photo.startsWith('/api/pieces/')) {
    photo += (photo.indexOf('?') < 0 ? '?' : '&') + 'v=' + (r.updated || 0);
  }
  return {
    pid: r.pid,
    photo: photo,
    id: r.art_id || '',
    desc: r.descr || '',
    artist: r.artist || '',
    medium: r.medium || '',
    art: r.art_size || '',
    frame: r.frame || '',
    loc: r.loc || '',
    status: r.status || '',
    archived: !!r.archived,
    featured: !!r.featured
  };
}

// Public-safe view of a piece — excludes internal fields like location.
function publicPiece(r) {
  let photo = r.photo || '';
  if (photo.startsWith('/api/pieces/')) {
    photo += (photo.indexOf('?') < 0 ? '?' : '&') + 'v=' + (r.updated || 0);
  }
  return {
    pid: r.pid, photo: photo,
    id: r.art_id || '', desc: r.descr || '', artist: r.artist || '',
    medium: r.medium || '', art: r.art_size || '', frame: r.frame || '', status: r.status || '',
    loc: r.loc || '', featured: !!r.featured
  };
}

// Decode a data: URL into { bytes: Uint8Array, type } or null for a plain URL/path.
function decodeDataUrl(photo) {
  if (typeof photo !== 'string' || !photo.startsWith('data:')) return null;
  const comma = photo.indexOf(',');
  if (comma < 0) return null;
  const meta = photo.slice(5, comma);           // e.g. "image/jpeg;base64"
  const isB64 = /;base64/i.test(meta);
  const type = (meta.split(';')[0] || 'application/octet-stream');
  const raw = photo.slice(comma + 1);
  let bytes;
  if (isB64) {
    const bin = atob(raw);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(raw));
  }
  return { bytes, type };
}

// Build the column values for a piece body. `pid` fixed; returns {cols, vals}.
function pieceColumns(body, pid, now) {
  const img = decodeDataUrl(body.photo);
  const photo = img ? `/api/pieces/${pid}/photo` : (typeof body.photo === 'string' ? body.photo : '');
  return {
    photo,
    photo_blob: img ? img.bytes : null,
    photo_type: img ? img.type : null,
    hasImage: !!img,
    art_id: (body.id || '').toString(),
    descr: (body.desc || '').toString(),
    artist: (body.artist || '').toString(),
    medium: (body.medium || '').toString(),
    art_size: (body.art || '').toString(),
    frame: (body.frame || '').toString(),
    loc: (body.loc || '').toString(),
    status: (body.status || '').toString(),
    archived: body.archived ? 1 : 0,
    featured: body.featured ? 1 : 0,
    now
  };
}

// Create the table on first use so no CLI migration step is needed. Idempotent
// (CREATE ... IF NOT EXISTS); runs once per Worker instance.
let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS pieces (
         pid TEXT PRIMARY KEY,
         photo TEXT NOT NULL DEFAULT '', photo_blob BLOB, photo_type TEXT,
         art_id TEXT NOT NULL DEFAULT '', descr TEXT NOT NULL DEFAULT '',
         artist TEXT NOT NULL DEFAULT '', medium TEXT NOT NULL DEFAULT '',
         art_size TEXT NOT NULL DEFAULT '', frame TEXT NOT NULL DEFAULT '',
         loc TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT '',
         archived INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0,
         created INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0
       )`
    ),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pieces_archived ON pieces(archived)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_pieces_created ON pieces(created)`),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS artists (
         slug TEXT PRIMARY KEY,
         name TEXT NOT NULL DEFAULT '',
         photo TEXT NOT NULL DEFAULT '', photo_blob BLOB, photo_type TEXT,
         bio TEXT NOT NULL DEFAULT '',
         represented INTEGER NOT NULL DEFAULT 1,
         sort_order INTEGER NOT NULL DEFAULT 0,
         created INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0
       )`
    ),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_artists_sort ON artists(sort_order, name)`)
  ]);
  // Add columns to a pre-existing pieces table (idempotent — ignore if present).
  try { await db.prepare(`ALTER TABLE pieces ADD COLUMN featured INTEGER NOT NULL DEFAULT 0`).run(); } catch (e) {}
  schemaReady = true;
}

// slugify a name into a url-safe id
function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'artist';
}

// artists DB row -> API artist (with versioned photo url)
function rowToArtist(r) {
  let photo = r.photo || '';
  if (photo.startsWith('/api/artists/')) {
    photo += (photo.indexOf('?') < 0 ? '?' : '&') + 'v=' + (r.updated || 0);
  }
  return {
    slug: r.slug, name: r.name || '', photo: photo, bio: r.bio || '',
    represented: !!r.represented, sortOrder: r.sort_order || 0
  };
}

// Build artist column values from a request body. If photo is a data: URL, store
// the bytes and point photo at the /api/artists/:slug/photo endpoint.
function artistColumns(body, slug, now) {
  const img = decodeDataUrl(body.photo);
  const photo = img ? `/api/artists/${slug}/photo` : (typeof body.photo === 'string' ? body.photo : '');
  return {
    photo, photo_blob: img ? img.bytes : null, photo_type: img ? img.type : null, hasImage: !!img,
    name: (body.name || '').toString(),
    bio: (body.bio || '').toString(),
    represented: body.represented === false ? 0 : 1,
    sort_order: Number.isFinite(body.sortOrder) ? body.sortOrder : 0,
    now
  };
}

async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method.toUpperCase();

  if (pathname === '/api/health') return json({ ok: true });

  if (!env.DB) return json({ error: 'Database not configured' }, 500);
  await ensureSchema(env.DB);

  // Public read for the website's own pages — non-archived pieces, no location.
  if (pathname === '/api/public/pieces') {
    const { results } = await env.DB.prepare(
      `SELECT pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, featured, updated
         FROM pieces WHERE archived = 0 ORDER BY artist ASC, created ASC, rowid ASC`
    ).all();
    return json({ pieces: (results || []).map(publicPiece) });
  }

  // Public read — artist profiles for the website's pages.
  if (pathname === '/api/public/artists') {
    const { results } = await env.DB.prepare(
      `SELECT slug, name, photo, bio, represented, sort_order, updated FROM artists ORDER BY sort_order ASC, name ASC`
    ).all();
    return json({ artists: (results || []).map(rowToArtist) });
  }

  // /api/artists (staff list + create)
  if (pathname === '/api/artists') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT slug, name, photo, bio, represented, sort_order, updated FROM artists ORDER BY sort_order ASC, name ASC`
      ).all();
      return json({ artists: (results || []).map(rowToArtist) });
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const now = Date.now();
      const base = slugify(body.slug || body.name);
      let slug = base, n = 2;
      while (true) {
        const { results } = await env.DB.prepare(`SELECT slug FROM artists WHERE slug = ?`).bind(slug).all();
        if (!results || !results.length) break;
        slug = base + '-' + (n++);
      }
      const c = artistColumns(body, slug, now);
      await env.DB.prepare(
        `INSERT INTO artists (slug, name, photo, photo_blob, photo_type, bio, represented, sort_order, created, updated)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(slug, c.name, c.photo, c.photo_blob, c.photo_type, c.bio, c.represented, c.sort_order, now, now).run();
      const { results } = await env.DB.prepare(`SELECT slug, name, photo, bio, represented, sort_order, updated FROM artists WHERE slug = ?`).bind(slug).all();
      return json({ artist: rowToArtist(results[0]) }, 201);
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  // /api/artists/:slug  and  /api/artists/:slug/photo
  const am = pathname.match(/^\/api\/artists\/([^/]+)(\/photo)?$/);
  if (am) {
    const slug = decodeURIComponent(am[1]);
    const isPhoto = !!am[2];

    if (isPhoto) {
      if (method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const { results } = await env.DB.prepare(`SELECT photo_blob, photo_type FROM artists WHERE slug = ?`).bind(slug).all();
      const row = results && results[0];
      if (!row || !row.photo_blob) return new Response('Not found', { status: 404 });
      const bytes = row.photo_blob instanceof ArrayBuffer ? new Uint8Array(row.photo_blob) : Uint8Array.from(row.photo_blob);
      return new Response(bytes, { status: 200, headers: { 'content-type': row.photo_type || 'application/octet-stream', 'cache-control': 'public, max-age=31536000' } });
    }

    if (method === 'PUT') {
      const body = await request.json().catch(() => ({}));
      const now = Date.now();
      const c = artistColumns(body, slug, now);
      if (c.hasImage) {
        await env.DB.prepare(`UPDATE artists SET name=?, photo=?, photo_blob=?, photo_type=?, bio=?, represented=?, sort_order=?, updated=? WHERE slug=?`)
          .bind(c.name, c.photo, c.photo_blob, c.photo_type, c.bio, c.represented, c.sort_order, now, slug).run();
      } else {
        await env.DB.prepare(`UPDATE artists SET name=?, photo=?, bio=?, represented=?, sort_order=?, updated=? WHERE slug=?`)
          .bind(c.name, c.photo, c.bio, c.represented, c.sort_order, now, slug).run();
      }
      const { results } = await env.DB.prepare(`SELECT slug, name, photo, bio, represented, sort_order, updated FROM artists WHERE slug = ?`).bind(slug).all();
      if (!results || !results.length) return json({ error: 'Not found' }, 404);
      return json({ artist: rowToArtist(results[0]) });
    }

    if (method === 'DELETE') {
      await env.DB.prepare(`DELETE FROM artists WHERE slug = ?`).bind(slug).run();
      return json({ ok: true });
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  // /api/pieces
  if (pathname === '/api/pieces') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, archived, featured, updated
           FROM pieces ORDER BY created ASC, rowid ASC`
      ).all();
      return json({ pieces: (results || []).map(rowToPiece) });
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pid = crypto.randomUUID();
      const now = Date.now();
      const c = pieceColumns(body, pid, now);
      if (c.art_id) {
        const dup = await env.DB.prepare(`SELECT pid FROM pieces WHERE art_id = ? LIMIT 1`).bind(c.art_id).all();
        if (dup.results && dup.results.length) return json({ error: 'ID "' + c.art_id + '" is already used by another piece.' }, 409);
      }
      await env.DB.prepare(
        `INSERT INTO pieces (pid, photo, photo_blob, photo_type, art_id, descr, artist, medium, art_size, frame, loc, status, archived, featured, created, updated)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(pid, c.photo, c.photo_blob, c.photo_type, c.art_id, c.descr, c.artist, c.medium, c.art_size, c.frame, c.loc, c.status, c.archived, c.featured, now, now).run();
      const { results } = await env.DB.prepare(`SELECT pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, archived, featured, updated FROM pieces WHERE pid = ?`).bind(pid).all();
      return json({ piece: rowToPiece(results[0]) }, 201);
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  // /api/pieces/:pid  and  /api/pieces/:pid/photo
  const m = pathname.match(/^\/api\/pieces\/([^/]+)(\/photo)?$/);
  if (m) {
    const pid = decodeURIComponent(m[1]);
    const isPhoto = !!m[2];

    if (isPhoto) {
      if (method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const { results } = await env.DB.prepare(`SELECT photo_blob, photo_type FROM pieces WHERE pid = ?`).bind(pid).all();
      const row = results && results[0];
      if (!row || !row.photo_blob) return new Response('Not found', { status: 404 });
      // D1 may hand back the BLOB as an ArrayBuffer or a number[]; normalise to bytes.
      const bytes = row.photo_blob instanceof ArrayBuffer ? new Uint8Array(row.photo_blob) : Uint8Array.from(row.photo_blob);
      return new Response(bytes, {
        status: 200,
        headers: { 'content-type': row.photo_type || 'application/octet-stream', 'cache-control': 'public, max-age=31536000' }
      });
    }

    if (method === 'PUT') {
      const body = await request.json().catch(() => ({}));
      const now = Date.now();
      const c = pieceColumns(body, pid, now);
      if (c.art_id) {
        const dup = await env.DB.prepare(`SELECT pid FROM pieces WHERE art_id = ? AND pid != ? LIMIT 1`).bind(c.art_id, pid).all();
        if (dup.results && dup.results.length) return json({ error: 'ID "' + c.art_id + '" is already used by another piece.' }, 409);
      }
      // If no new image was sent (photo is a plain URL/path, e.g. the existing
      // /api/pieces/:pid/photo), keep the stored blob untouched.
      if (c.hasImage) {
        await env.DB.prepare(
          `UPDATE pieces SET photo=?, photo_blob=?, photo_type=?, art_id=?, descr=?, artist=?, medium=?, art_size=?, frame=?, loc=?, status=?, archived=?, featured=?, updated=? WHERE pid=?`
        ).bind(c.photo, c.photo_blob, c.photo_type, c.art_id, c.descr, c.artist, c.medium, c.art_size, c.frame, c.loc, c.status, c.archived, c.featured, now, pid).run();
      } else {
        await env.DB.prepare(
          `UPDATE pieces SET photo=?, art_id=?, descr=?, artist=?, medium=?, art_size=?, frame=?, loc=?, status=?, archived=?, featured=?, updated=? WHERE pid=?`
        ).bind(c.photo, c.art_id, c.descr, c.artist, c.medium, c.art_size, c.frame, c.loc, c.status, c.archived, c.featured, now, pid).run();
      }
      const { results } = await env.DB.prepare(`SELECT pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, archived, featured, updated FROM pieces WHERE pid = ?`).bind(pid).all();
      if (!results || !results.length) return json({ error: 'Not found' }, 404);
      return json({ piece: rowToPiece(results[0]) });
    }

    if (method === 'DELETE') {
      await env.DB.prepare(`DELETE FROM pieces WHERE pid = ?`).bind(pid).run();
      return json({ ok: true });
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  return json({ error: 'Not found' }, 404);
}

// ---- staff auth (HTTP Basic) ----
// Gate the staff catalog, the capture form, and the API behind a password.
// The password comes from the STAFF_PASSWORD secret (set in the Cloudflare
// dashboard). Until it's set, nothing is locked (avoids locking ourselves out
// before setup). /api/health stays open so the client can detect the API.
// The username is ignored — staff just need the password.
const GATED_PAGES = ['/catalog', '/add-a-piece', '/manage-artists'];
function isGatedPage(pathname) {
  return GATED_PAGES.some(function (p) { return pathname === p || pathname === p + '.html'; });
}
function needsAuth(pathname, method) {
  if (pathname === '/api/health') return false;
  if (pathname === '/api/public/pieces' || pathname === '/api/public/artists') return false; // public reads
  if (method === 'GET' && /^\/api\/(pieces|artists)\/[^/]+\/photo$/.test(pathname)) return false; // public images
  if (pathname.startsWith('/api/')) return true;                                // staff reads + all writes
  return isGatedPage(pathname);                                                 // staff HTML pages
}
function checkAuth(request, env) {
  const expected = env.STAFF_PASSWORD;
  if (!expected) return true;                 // not configured yet -> don't lock
  const h = request.headers.get('Authorization') || '';
  if (!h.startsWith('Basic ')) return false;
  let decoded = '';
  try { decoded = atob(h.slice(6)); } catch (e) { return false; }
  const pass = decoded.slice(decoded.indexOf(':') + 1);
  return pass === expected;
}
function unauthorized() {
  return new Response('Staff access only — enter the catalog password.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="ArtPro Staff", charset="UTF-8"' }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (needsAuth(url.pathname, request.method.toUpperCase()) && !checkAuth(request, env)) {
      return unauthorized();
    }

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ error: 'Server error', detail: String(err && err.message || err) }, 500);
      }
    }
    // Everything else is the static site.
    return env.ASSETS.fetch(request);
  }
};
