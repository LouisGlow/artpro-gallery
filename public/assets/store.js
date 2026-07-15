/* ArtPro data layer — the single place the catalog reads/writes its pieces.
 *
 * TODAY: persists to the browser's localStorage (per-device, no server).
 * LATER: this is the ONLY file that changes. Swap the bodies of load()/saveAll()
 * for fetch() calls against the Cloudflare Worker + D1 API, e.g.
 *     load:    return fetch('/api/pieces').then(r => r.json());
 *     saveAll: return fetch('/api/pieces', {method:'PUT', body: JSON.stringify(list)});
 * The catalog page never touches localStorage or fetch directly, so nothing else
 * needs to move when the real database goes live.
 *
 * A "piece" is a plain object:
 *   { photo, id, desc, artist, medium, art, frame, loc, status, archived }
 */
(function (window) {
  var KEY = 'artpro:pieces:v1';

  function read() {
    var raw = null;
    try { raw = window.localStorage.getItem(KEY); } catch (e) { return null; }
    if (raw == null) { return null; }          // null => never seeded (distinct from [])
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  window.ArtProStore = {
    // Returns the array of pieces, or null if the catalog has never been seeded.
    load: function () { return read(); },

    // Replace the whole collection. Simple and matches how the catalog serialises
    // its table on every change; fine at gallery scale (hundreds of rows).
    saveAll: function (list) {
      try { window.localStorage.setItem(KEY, JSON.stringify(list || [])); return true; }
      catch (e) { return false; }              // e.g. quota exceeded on big base64 images
    },

    // Wipe local data (handy for testing / "reset to samples").
    clear: function () { try { window.localStorage.removeItem(KEY); } catch (e) {} }
  };
})(window);
