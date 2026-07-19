/* ArtPro CMS — hydrates public pages from editable site content.
 *
 * The page's hardcoded HTML is always the fallback: if the API is unreachable or a
 * key isn't set, nothing changes. When a key IS set in the admin, it replaces the
 * matching element(s).
 *
 * Mark up an element with:
 *   data-cms="key"        -> replaces its text
 *   data-cms-html="key"   -> replaces its HTML (newlines become <br>, text escaped)
 *   data-cms-src="key"    -> replaces an <img> src
 *   data-cms-href="key"   -> replaces an <a> href
 *   data-cms-paras="key"  -> replaces the element's HTML with <p> paragraphs
 *                            (blank line = new paragraph, single newline = <br>)
 *   data-cms-list="key"   -> replaces a <ul>/<ol>'s items, one <li> per line
 *   data-cms-email="1|2"  -> a mailto link kept in sync with contact.email / contact.email2
 * Plus: every tel: link on the page is kept in sync with contact.phone.
 */
(function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  fetch('/api/public/content', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (res) {
      var C = (res && res.content) || {};
      window.ARTPRO_CONTENT = C;
      function has(k) { return Object.prototype.hasOwnProperty.call(C, k) && C[k] !== ''; }
      var v = function (k) { return C[k]; };

      document.querySelectorAll('[data-cms]').forEach(function (el) {
        var k = el.getAttribute('data-cms'); if (has(k)) el.textContent = v(k);
      });
      document.querySelectorAll('[data-cms-html]').forEach(function (el) {
        var k = el.getAttribute('data-cms-html'); if (has(k)) el.innerHTML = esc(v(k)).replace(/\n/g, '<br>');
      });
      document.querySelectorAll('[data-cms-src]').forEach(function (el) {
        var k = el.getAttribute('data-cms-src'); if (has(k)) el.setAttribute('src', v(k));
      });
      document.querySelectorAll('[data-cms-href]').forEach(function (el) {
        var k = el.getAttribute('data-cms-href'); if (has(k)) el.setAttribute('href', v(k));
      });
      document.querySelectorAll('[data-cms-paras]').forEach(function (el) {
        var k = el.getAttribute('data-cms-paras'); if (!has(k)) return;
        el.innerHTML = String(v(k)).split(/\n\s*\n/).map(function (para) {
          var t = para.trim(); return t ? '<p>' + esc(t).replace(/\n/g, '<br>') + '</p>' : '';
        }).join('');
      });
      document.querySelectorAll('[data-cms-list]').forEach(function (el) {
        var k = el.getAttribute('data-cms-list'); if (!has(k)) return;
        el.innerHTML = String(v(k)).split(/\n/).map(function (li) {
          var t = li.trim(); return t ? '<li>' + esc(t) + '</li>' : '';
        }).join('');
      });

      // Site-wide contact — updates every footer/contact block on the page.
      if (has('contact.phone')) {
        var phone = v('contact.phone'), tel = 'tel:' + phone.replace(/[^0-9+]/g, '');
        document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
          a.setAttribute('href', tel); if (!a.children.length) a.textContent = phone;
        });
      }
      [['1', 'contact.email'], ['2', 'contact.email2']].forEach(function (pair) {
        if (!has(pair[1])) return;
        var mail = v(pair[1]);
        document.querySelectorAll('a[data-cms-email="' + pair[0] + '"]').forEach(function (a) {
          a.setAttribute('href', 'mailto:' + mail); a.textContent = mail;
        });
      });
    })
    .catch(function () {});
})();
