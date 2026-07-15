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
  return {
    pid: r.pid,
    photo: r.photo || '',
    id: r.art_id || '',
    desc: r.descr || '',
    artist: r.artist || '',
    medium: r.medium || '',
    art: r.art_size || '',
    frame: r.frame || '',
    loc: r.loc || '',
    status: r.status || '',
    archived: !!r.archived
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
    now
  };
}

async function handleApi(request, env, url) {
  const { pathname } = url;
  const method = request.method.toUpperCase();

  if (pathname === '/api/health') return json({ ok: true });

  if (!env.DB) return json({ error: 'Database not configured' }, 500);

  // /api/pieces
  if (pathname === '/api/pieces') {
    if (method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, archived
           FROM pieces ORDER BY created ASC, rowid ASC`
      ).all();
      return json({ pieces: (results || []).map(rowToPiece) });
    }
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const pid = crypto.randomUUID();
      const now = Date.now();
      const c = pieceColumns(body, pid, now);
      await env.DB.prepare(
        `INSERT INTO pieces (pid, photo, photo_blob, photo_type, art_id, descr, artist, medium, art_size, frame, loc, status, archived, created, updated)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(pid, c.photo, c.photo_blob, c.photo_type, c.art_id, c.descr, c.artist, c.medium, c.art_size, c.frame, c.loc, c.status, c.archived, now, now).run();
      const { results } = await env.DB.prepare(`SELECT pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, archived FROM pieces WHERE pid = ?`).bind(pid).all();
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
      return new Response(row.photo_blob, {
        status: 200,
        headers: { 'content-type': row.photo_type || 'application/octet-stream', 'cache-control': 'public, max-age=31536000' }
      });
    }

    if (method === 'PUT') {
      const body = await request.json().catch(() => ({}));
      const now = Date.now();
      const c = pieceColumns(body, pid, now);
      // If no new image was sent (photo is a plain URL/path, e.g. the existing
      // /api/pieces/:pid/photo), keep the stored blob untouched.
      if (c.hasImage) {
        await env.DB.prepare(
          `UPDATE pieces SET photo=?, photo_blob=?, photo_type=?, art_id=?, descr=?, artist=?, medium=?, art_size=?, frame=?, loc=?, status=?, archived=?, updated=? WHERE pid=?`
        ).bind(c.photo, c.photo_blob, c.photo_type, c.art_id, c.descr, c.artist, c.medium, c.art_size, c.frame, c.loc, c.status, c.archived, now, pid).run();
      } else {
        await env.DB.prepare(
          `UPDATE pieces SET photo=?, art_id=?, descr=?, artist=?, medium=?, art_size=?, frame=?, loc=?, status=?, archived=?, updated=? WHERE pid=?`
        ).bind(c.photo, c.art_id, c.descr, c.artist, c.medium, c.art_size, c.frame, c.loc, c.status, c.archived, now, pid).run();
      }
      const { results } = await env.DB.prepare(`SELECT pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, archived FROM pieces WHERE pid = ?`).bind(pid).all();
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
