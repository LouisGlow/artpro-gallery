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
    featured: !!r.featured,
    glass: !!r.glass
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
    loc: r.loc || '', featured: !!r.featured, glass: !!r.glass
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
    glass: body.glass ? 1 : 0,
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
         glass INTEGER NOT NULL DEFAULT 0,
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
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_artists_sort ON artists(sort_order, name)`),
    // Editable site content (CMS) — key/value text, and uploaded media blobs.
    // Additive: this never touches the pieces/artists tables.
    db.prepare(
      `CREATE TABLE IF NOT EXISTS site_content (
         key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated INTEGER NOT NULL DEFAULT 0
       )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS site_media (
         key TEXT PRIMARY KEY, blob BLOB, type TEXT, updated INTEGER NOT NULL DEFAULT 0
       )`
    ),
    // PayPal orders — a record of each attempted/completed payment.
    // Additive: never touches pieces/artists.
    db.prepare(
      `CREATE TABLE IF NOT EXISTS orders (
         oid TEXT PRIMARY KEY, piece_id TEXT NOT NULL DEFAULT '', descr TEXT NOT NULL DEFAULT '',
         artist TEXT NOT NULL DEFAULT '', amount TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL DEFAULT '',
         status TEXT NOT NULL DEFAULT '', payer TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '',
         created INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0
       )`
    )
  ]);
  // Add columns to a pre-existing pieces table (idempotent — ignore if present).
  try { await db.prepare(`ALTER TABLE pieces ADD COLUMN featured INTEGER NOT NULL DEFAULT 0`).run(); } catch (e) {}
  try { await db.prepare(`ALTER TABLE pieces ADD COLUMN glass INTEGER NOT NULL DEFAULT 0`).run(); } catch (e) {}
  try { await db.prepare(`ALTER TABLE orders ADD COLUMN provider TEXT NOT NULL DEFAULT ''`).run(); } catch (e) {}
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

// ---- PayPal (server-side order create + capture) ----
// Configured via Cloudflare env: PAYPAL_CLIENT_ID, PAYPAL_SECRET (secret),
// PAYPAL_ENV ('sandbox'|'live'), PAYPAL_CURRENCY (default 'USD'). Until the
// client id + secret are set, payments stay disabled and the page says so.
const PAYPAL_CURRENCIES = ['USD', 'GBP', 'EUR', 'AUD', 'CAD'];
function paypalConfigured(env) { return !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET); }
function paypalBase(env) { return env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; }
async function paypalToken(env) {
  const auth = btoa(env.PAYPAL_CLIENT_ID + ':' + env.PAYPAL_SECRET);
  const r = await fetch(paypalBase(env) + '/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!r.ok) throw new Error('PayPal authentication failed');
  return (await r.json()).access_token;
}
async function paypalApi(env, path, token, body) {
  const r = await fetch(paypalBase(env) + path, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j && j.message) || ('PayPal error ' + r.status));
  return j;
}

// ---- PayFast (South African gateway; charges in ZAR, settles to a SA bank) ----
// Env: PAYFAST_MERCHANT_ID, PAYFAST_MERCHANT_KEY, PAYFAST_PASSPHRASE (secret,
// optional but recommended), PAYFAST_ENV ('sandbox'|'live'). Dormant until set.
function payfastConfigured(env) { return !!(env.PAYFAST_MERCHANT_ID && env.PAYFAST_MERCHANT_KEY); }
function payfastBase(env) { return env.PAYFAST_ENV === 'live' ? 'https://www.payfast.co.za' : 'https://sandbox.payfast.co.za'; }
// PHP urlencode-compatible (spaces as +, encodes ! ' ( ) * ~) for the signature.
function pfEnc(s) {
  return encodeURIComponent(String(s)).replace(/%20/g, '+')
    .replace(/[!'()*~]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); });
}
// MD5 (Paul Johnston's implementation) — Workers' WebCrypto has no MD5.
function md5(str) {
  str = unescape(encodeURIComponent(str));
  function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
  function au(x, y) { var l = (x & 0xFFFF) + (y & 0xFFFF), m = (x >> 16) + (y >> 16) + (l >> 16); return (m << 16) | (l & 0xFFFF); }
  function cm(q, a, b, x, s, t) { return au(rl(au(au(a, q), au(x, t)), s), b); }
  function ff(a, b, c, d, x, s, t) { return cm((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cm((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cm(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cm(c ^ (b | (~d)), a, b, x, s, t); }
  function b2w(s) { var w = [], i; for (i = 0; i < s.length * 8; i += 8) w[i >> 5] |= (s.charCodeAt(i / 8) & 0xFF) << (i % 32); return w; }
  function w2h(w) { var h = '0123456789abcdef', o = '', i; for (i = 0; i < w.length * 4; i++) o += h.charAt((w[i >> 2] >> ((i % 4) * 8 + 4)) & 0xF) + h.charAt((w[i >> 2] >> ((i % 4) * 8)) & 0xF); return o; }
  var x = b2w(str), len = str.length * 8, i;
  x[len >> 5] |= 0x80 << (len % 32); x[(((len + 64) >>> 9) << 4) + 14] = len;
  var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (i = 0; i < x.length; i += 16) {
    var oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586); c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426); c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417); c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101); c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632); c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
    a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083); c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690); c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784); c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463); c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353); c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222); c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835); c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);
    a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415); c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606); c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744); c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379); c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);
    a = au(a, oa); b = au(b, ob); c = au(c, oc); d = au(d, od);
  }
  return w2h([a, b, c, d]);
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
      `SELECT pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, featured, glass, updated
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

  // ---- CMS: editable site content (public read; staff write) ----
  // Public: the whole content map the website hydrates from.
  if (pathname === '/api/public/content') {
    const { results } = await env.DB.prepare(`SELECT key, value FROM site_content`).all();
    const content = {};
    (results || []).forEach(function (r) { content[r.key] = r.value; });
    return new Response(JSON.stringify({ content }), {
      status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=30' }
    });
  }
  // Staff: save a batch of content keys.  Body: { content: { key: value, ... } }
  if (pathname === '/api/content' && method === 'PUT') {
    const body = await request.json().catch(() => ({}));
    const entries = Object.entries((body && body.content) || {});
    const now = Date.now();
    if (entries.length) {
      await env.DB.batch(entries.map(function (kv) {
        return env.DB.prepare(
          `INSERT INTO site_content (key, value, updated) VALUES (?,?,?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated`
        ).bind(String(kv[0]).slice(0, 200), (kv[1] == null ? '' : String(kv[1])), now);
      }));
    }
    return json({ ok: true, saved: entries.length });
  }

  // Uploaded CMS media, e.g. /api/media/home-hero  (public GET, staff PUT)
  const mm = pathname.match(/^\/api\/media\/([a-z0-9._-]+)$/i);
  if (mm) {
    const key = mm[1];
    if (method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT blob, type FROM site_media WHERE key = ?`).bind(key).all();
      const row = results && results[0];
      if (!row || !row.blob) return new Response('Not found', { status: 404 });
      const bytes = row.blob instanceof ArrayBuffer ? new Uint8Array(row.blob) : Uint8Array.from(row.blob);
      return new Response(bytes, { status: 200, headers: { 'content-type': row.type || 'application/octet-stream', 'cache-control': 'public, max-age=31536000' } });
    }
    if (method === 'PUT') {
      const body = await request.json().catch(() => ({}));
      const img = decodeDataUrl(body.photo);
      if (!img) return json({ error: 'Expected an image data URL in { photo }' }, 400);
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO site_media (key, blob, type, updated) VALUES (?,?,?,?)
           ON CONFLICT(key) DO UPDATE SET blob = excluded.blob, type = excluded.type, updated = excluded.updated`
      ).bind(key, img.bytes, img.type, now).run();
      return json({ ok: true, url: '/api/media/' + key + '?v=' + now });
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  // Staff: full JSON backup — pieces + artists (metadata) + content.
  if (pathname === '/api/admin/export' && method === 'GET') {
    const [p, a, c] = await Promise.all([
      env.DB.prepare(`SELECT pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, archived, featured, glass, created, updated FROM pieces ORDER BY created ASC`).all(),
      env.DB.prepare(`SELECT slug, name, photo, bio, represented, sort_order, created, updated FROM artists ORDER BY sort_order ASC, name ASC`).all(),
      env.DB.prepare(`SELECT key, value, updated FROM site_content`).all()
    ]);
    const content = {}; (c.results || []).forEach(function (r) { content[r.key] = r.value; });
    return json({
      exportedAt: new Date().toISOString(),
      counts: { pieces: (p.results || []).length, artists: (a.results || []).length, content: (c.results || []).length },
      pieces: (p.results || []).map(rowToPiece),
      artists: (a.results || []).map(rowToArtist),
      content: content
    });
  }

  // ---- checkout config ----
  // Public: which gateways are on (PayPal for USD/GBP/EUR, PayFast for ZAR).
  if (pathname === '/api/pay/config') {
    return json({
      enabled: paypalConfigured(env),                 // PayPal (kept flat for back-compat)
      clientId: env.PAYPAL_CLIENT_ID || '',
      currency: (env.PAYPAL_CURRENCY || 'USD').toUpperCase(),
      env: env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox',
      currencies: PAYPAL_CURRENCIES,
      payfast: { enabled: payfastConfigured(env), env: env.PAYFAST_ENV === 'live' ? 'live' : 'sandbox' }
    });
  }
  // Public: build a signed PayFast redirect (charges in ZAR). The client posts
  // the returned fields to `action`, which takes the buyer to PayFast.
  if (pathname === '/api/pay/payfast/create' && method === 'POST') {
    if (!payfastConfigured(env)) return json({ error: 'Rand payments are not set up yet.' }, 400);
    const body = await request.json().catch(() => ({}));
    const amount = parseFloat(body.amount);
    if (!(amount > 0) || amount > 5000000) return json({ error: 'Please enter a valid amount.' }, 400);
    const value = amount.toFixed(2);
    const oid = crypto.randomUUID();
    const fields = {
      merchant_id: env.PAYFAST_MERCHANT_ID,
      merchant_key: env.PAYFAST_MERCHANT_KEY,
      return_url: url.origin + '/pay?paid=1',
      cancel_url: url.origin + '/pay?cancelled=1',
      notify_url: url.origin + '/api/pay/payfast/notify',
      m_payment_id: oid,
      amount: value,
      item_name: ('ArtPro Gallery' + (body.desc ? ' - ' + String(body.desc) : '')).slice(0, 100)
    };
    if (body.desc) fields.item_description = String(body.desc).slice(0, 255);
    let sigStr = Object.keys(fields).map(function (k) { return k + '=' + pfEnc(fields[k]); }).join('&');
    if (env.PAYFAST_PASSPHRASE) sigStr += '&passphrase=' + pfEnc(env.PAYFAST_PASSPHRASE);
    fields.signature = md5(sigStr);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO orders (oid, piece_id, descr, artist, amount, currency, status, payer, provider, created, updated)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(oid, String(body.pieceId || ''), String(body.desc || ''), String(body.artist || ''), value, 'ZAR', 'created', '', 'payfast', now, now).run();
    return json({ action: payfastBase(env) + '/eng/process', fields: fields });
  }
  // PayFast ITN (server-to-server). Verify signature + validate with PayFast +
  // check amount + status, then mark the order paid. Always answer 200.
  if (pathname === '/api/pay/payfast/notify' && method === 'POST') {
    if (!payfastConfigured(env)) return new Response('', { status: 200 });
    try {
      const raw = await request.text();
      const parts = raw.split('&').filter(Boolean).map(function (p) {
        const i = p.indexOf('='); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' '))];
      });
      const data = {}; parts.forEach(function (kv) { data[kv[0]] = kv[1]; });
      let sigStr = parts.filter(function (kv) { return kv[0] !== 'signature'; })
        .map(function (kv) { return kv[0] + '=' + pfEnc(kv[1]); }).join('&');
      if (env.PAYFAST_PASSPHRASE) sigStr += '&passphrase=' + pfEnc(env.PAYFAST_PASSPHRASE);
      const sigOk = md5(sigStr) === (data.signature || '');
      let valid = false;
      try {
        const vr = await fetch(payfastBase(env) + '/eng/query/validate', {
          method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: raw
        });
        valid = (await vr.text()).trim() === 'VALID';
      } catch (e) {}
      const oid = data.m_payment_id || '';
      const rows = await env.DB.prepare(`SELECT amount FROM orders WHERE oid = ?`).bind(oid).all();
      const rec = rows.results && rows.results[0];
      const amountOk = rec && data.amount_gross && parseFloat(data.amount_gross).toFixed(2) === rec.amount;
      const ok = sigOk && valid && amountOk && data.payment_status === 'COMPLETE';
      if (oid) {
        await env.DB.prepare(`UPDATE orders SET status=?, payer=?, updated=? WHERE oid=?`)
          .bind(ok ? 'paid' : (data.payment_status || 'failed'),
            JSON.stringify({ email: data.email_address || '', name: ((data.name_first || '') + ' ' + (data.name_last || '')).trim() }),
            Date.now(), oid).run();
      }
    } catch (e) {}
    return new Response('', { status: 200 });
  }
  // Public: create an order for the agreed amount (server sets the amount, so it
  // can't be tampered with after this point), and record it as pending.
  if (pathname === '/api/pay/create' && method === 'POST') {
    if (!paypalConfigured(env)) return json({ error: 'Online payments are not set up yet.' }, 400);
    const body = await request.json().catch(() => ({}));
    const amount = parseFloat(body.amount);
    const currency = String(body.currency || env.PAYPAL_CURRENCY || 'USD').toUpperCase();
    if (!(amount > 0) || amount > 5000000) return json({ error: 'Please enter a valid amount.' }, 400);
    if (PAYPAL_CURRENCIES.indexOf(currency) < 0) return json({ error: 'That currency is not supported.' }, 400);
    const value = amount.toFixed(2);
    const desc = ('ArtPro Gallery' + (body.desc ? ' - ' + String(body.desc) : '')).slice(0, 127);
    try {
      const token = await paypalToken(env);
      const order = await paypalApi(env, '/v2/checkout/orders', token, {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: currency, value: value },
          description: desc,
          custom_id: String(body.pieceId || '').slice(0, 127)
        }]
      });
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO orders (oid, piece_id, descr, artist, amount, currency, status, payer, provider, created, updated)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(order.id, String(body.pieceId || ''), String(body.desc || ''), String(body.artist || ''), value, currency, 'created', '', 'paypal', now, now).run();
      return json({ id: order.id });
    } catch (e) { return json({ error: String((e && e.message) || e) }, 502); }
  }
  // Public: capture the approved order, verify the captured amount matches what
  // we created, and mark it paid.
  if (pathname === '/api/pay/capture' && method === 'POST') {
    if (!paypalConfigured(env)) return json({ error: 'Online payments are not set up yet.' }, 400);
    const body = await request.json().catch(() => ({}));
    const orderId = String(body.orderId || '');
    if (!orderId) return json({ error: 'Missing order reference.' }, 400);
    try {
      const token = await paypalToken(env);
      const cap = await paypalApi(env, '/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', token);
      const { results } = await env.DB.prepare(`SELECT amount, currency FROM orders WHERE oid = ?`).bind(orderId).all();
      const rec = results && results[0];
      let captured = null;
      try { captured = cap.purchase_units[0].payments.captures[0].amount; } catch (e) {}
      const ok = cap.status === 'COMPLETED' && rec && captured &&
        captured.value === rec.amount && captured.currency_code === rec.currency;
      let payer = '';
      try { payer = JSON.stringify({ email: cap.payer.email_address, name: cap.payer.name }); } catch (e) {}
      await env.DB.prepare(`UPDATE orders SET status=?, payer=?, updated=? WHERE oid=?`)
        .bind(ok ? 'paid' : (cap.status || 'failed'), payer, Date.now(), orderId).run();
      if (!ok) return json({ ok: false, error: 'Payment was not completed.' }, 400);
      return json({ ok: true, ref: orderId });
    } catch (e) { return json({ error: String((e && e.message) || e) }, 502); }
  }
  // Staff: recent orders.
  if (pathname === '/api/admin/orders' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT oid, piece_id, descr, artist, amount, currency, status, payer, provider, created, updated FROM orders ORDER BY created DESC LIMIT 200`
    ).all();
    return json({ orders: results || [] });
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
        `SELECT pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, archived, featured, glass, updated
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
        `INSERT INTO pieces (pid, photo, photo_blob, photo_type, art_id, descr, artist, medium, art_size, frame, loc, status, archived, featured, glass, created, updated)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(pid, c.photo, c.photo_blob, c.photo_type, c.art_id, c.descr, c.artist, c.medium, c.art_size, c.frame, c.loc, c.status, c.archived, c.featured, c.glass, now, now).run();
      const { results } = await env.DB.prepare(`SELECT pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, archived, featured, glass, updated FROM pieces WHERE pid = ?`).bind(pid).all();
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
          `UPDATE pieces SET photo=?, photo_blob=?, photo_type=?, art_id=?, descr=?, artist=?, medium=?, art_size=?, frame=?, loc=?, status=?, archived=?, featured=?, glass=?, updated=? WHERE pid=?`
        ).bind(c.photo, c.photo_blob, c.photo_type, c.art_id, c.descr, c.artist, c.medium, c.art_size, c.frame, c.loc, c.status, c.archived, c.featured, c.glass, now, pid).run();
      } else {
        await env.DB.prepare(
          `UPDATE pieces SET photo=?, art_id=?, descr=?, artist=?, medium=?, art_size=?, frame=?, loc=?, status=?, archived=?, featured=?, glass=?, updated=? WHERE pid=?`
        ).bind(c.photo, c.art_id, c.descr, c.artist, c.medium, c.art_size, c.frame, c.loc, c.status, c.archived, c.featured, c.glass, now, pid).run();
      }
      const { results } = await env.DB.prepare(`SELECT pid, photo, art_id, descr, artist, medium, art_size, frame, loc, status, archived, featured, glass, updated FROM pieces WHERE pid = ?`).bind(pid).all();
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
const GATED_PAGES = ['/catalog', '/add-a-piece', '/manage-artists', '/admin'];
function isGatedPage(pathname) {
  return GATED_PAGES.some(function (p) { return pathname === p || pathname === p + '.html'; });
}
function needsAuth(pathname, method) {
  if (pathname === '/api/health') return false;
  if (pathname === '/api/public/pieces' || pathname === '/api/public/artists' || pathname === '/api/public/content') return false; // public reads
  if (method === 'GET' && /^\/api\/(pieces|artists)\/[^/]+\/photo$/.test(pathname)) return false; // public images
  if (method === 'GET' && /^\/api\/media\/[a-z0-9._-]+$/i.test(pathname)) return false;           // public CMS media
  if (pathname.startsWith('/api/pay/')) return false;                           // buyer checkout (config/create/capture/payfast)
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
