/* ArtPro data layer — the single place the catalog reads/writes its pieces.
 *
 * Primary mode: the JSON API served by the Worker (same origin, /api/pieces),
 * backed by the D1 database — shared across all staff and devices.
 *
 * Fallback mode: if the API isn't reachable (e.g. previewing the static files
 * without the Worker, or a network blip), it uses this browser's localStorage
 * so the pages still work. Local edits are per-device and don't sync.
 *
 * A "piece" is: { pid, photo, id, desc, artist, medium, art, frame, loc, status, archived }
 * `photo` is a display URL; on create/update it may be a data: URL (an uploaded
 * image), which the API stores and serves back at /api/pieces/<pid>/photo.
 */
(function (window) {
  var KEY = 'artpro:pieces:v2';
  var apiUp = null;                 // null = unknown, true/false once probed

  function uid() {
    try { return window.crypto.randomUUID(); }
    catch (e) { return 'p-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36); }
  }

  // ---- API availability probe (cached) ----
  function probe() {
    if (apiUp !== null) return Promise.resolve(apiUp);
    return fetch('/api/health', { method: 'GET' })
      .then(function (r) { apiUp = r.ok; return apiUp; })
      .catch(function () { apiUp = false; return false; });
  }

  // ---- localStorage fallback backend ----
  function lsRead() {
    var raw;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { return null; }
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function lsWrite(list) { try { window.localStorage.setItem(KEY, JSON.stringify(list || [])); } catch (e) {} }
  function lsSeed() {
    var seed = (window.ARTPRO_SEED || []).map(function (p) {
      var q = {}; for (var k in p) q[k] = p[k]; if (!q.pid) q.pid = uid(); return q;
    });
    lsWrite(seed);
    return seed;
  }
  var local = {
    list: function () { var l = lsRead(); if (l == null) l = lsSeed(); return Promise.resolve(l); },
    create: function (piece) { return this.list().then(function (l) { var p = {}; for (var k in piece) p[k] = piece[k]; p.pid = uid(); l.push(p); lsWrite(l); return p; }); },
    update: function (pid, piece) { return this.list().then(function (l) { for (var i = 0; i < l.length; i++) if (l[i].pid === pid) { var p = {}; for (var k in piece) p[k] = piece[k]; p.pid = pid; l[i] = p; lsWrite(l); return p; } return null; }); },
    remove: function (pid) { return this.list().then(function (l) { lsWrite(l.filter(function (p) { return p.pid !== pid; })); }); }
  };

  // ---- remote (API) backend ----
  function req(path, opts) {
    return fetch(path, opts).then(function (r) {
      if (!r.ok) throw new Error('API ' + r.status);
      return r.status === 204 ? null : r.json();
    });
  }
  var remote = {
    list: function () { return req('/api/pieces').then(function (d) { return d.pieces || []; }); },
    create: function (piece) { return req('/api/pieces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(piece) }).then(function (d) { return d.piece; }); },
    update: function (pid, piece) { return req('/api/pieces/' + encodeURIComponent(pid), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(piece) }).then(function (d) { return d.piece; }); },
    remove: function (pid) { return req('/api/pieces/' + encodeURIComponent(pid), { method: 'DELETE' }); }
  };

  function backend() { return probe().then(function (up) { return up ? remote : local; }); }

  // Read an <input type=file> image, downscale it (phone photos are huge), and
  // return a JPEG data: URL suitable for upload. Resolves '' for no file.
  function readPhoto(file, maxDim, quality) {
    maxDim = maxDim || 1600; quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      if (!file) { resolve(''); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) { var s = Math.min(maxDim / w, maxDim / h); w = Math.round(w * s); h = Math.round(h * s); }
        try {
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(cv.toDataURL('image/jpeg', quality));
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
      img.src = url;
    });
  }

  // ---- artists (API-only; the admin needs the server) ----
  function jreq(path, method, bodyObj) {
    var opts = { method: method };
    if (bodyObj) { opts.headers = { 'content-type': 'application/json' }; opts.body = JSON.stringify(bodyObj); }
    return fetch(path, opts).then(function (r) { if (!r.ok) throw new Error('API ' + r.status); return r.status === 204 ? null : r.json(); });
  }
  window.ArtProArtists = {
    list:   function ()          { return fetch('/api/public/artists').then(function (r) { return r.json(); }).then(function (d) { return d.artists || []; }); },
    create: function (a)         { return jreq('/api/artists', 'POST', a).then(function (d) { return d.artist; }); },
    update: function (slug, a)   { return jreq('/api/artists/' + encodeURIComponent(slug), 'PUT', a).then(function (d) { return d.artist; }); },
    remove: function (slug)      { return jreq('/api/artists/' + encodeURIComponent(slug), 'DELETE'); }
  };

  window.ArtProStore = {
    // True once probed and the API answered; useful for UI hints.
    isRemote: function () { return apiUp === true; },
    readPhoto: readPhoto,
    list:   function ()          { return backend().then(function (b) { return b.list(); }); },
    create: function (piece)     { return backend().then(function (b) { return b.create(piece); }); },
    update: function (pid, p)    { return backend().then(function (b) { return b.update(pid, p); }); },
    remove: function (pid)       { return backend().then(function (b) { return b.remove(pid); }); }
  };
})(window);
