/* ArtPro shared lightbox - the same fullscreen "stage" look as the virtual
 * gallery (interactive-gallery.html). Self-contained: injects its own CSS and
 * markup, and exposes window.ArtProLightbox.open(items, startIndex).
 *
 * items: [{ url, title, meta, artist }]
 * Clicking an artwork opens the image large with prev/next within that set.
 */
(function (window, document) {
  var CSS =
    '.lb-stage{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;}' +
    '.lb-stage[hidden]{display:none;}' +
    '.lb-stage__scrim{position:absolute;inset:0;background:rgba(18,15,11,.82);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);}' +
    '.lb-stage__inner{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,340px);gap:36px;align-items:center;width:min(92vw,1100px);}' +
    '.lb-stage__figure{margin:0;display:flex;justify-content:center;min-width:0;}' +
    '.lb-stage__img{max-width:100%;max-height:80vh;object-fit:contain;background:#0d0b08;box-shadow:0 40px 120px rgba(0,0,0,.6);transition:opacity .25s ease;}' +
    '.lb-stage__caption{color:#ece7df;font-family:"Montserrat",-apple-system,"Segoe UI",system-ui,sans-serif;}' +
    '.lb-stage__eyebrow{font-family:"Barlow Condensed","Oswald",sans-serif;font-weight:600;font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:#b8912f;margin:0 0 14px;}' +
    '.lb-stage__title{font-family:"Barlow Condensed","Oswald",sans-serif;font-weight:600;font-size:clamp(28px,3vw,44px);letter-spacing:.03em;text-transform:uppercase;line-height:1;margin:0 0 12px;color:#f4efe6;}' +
    '.lb-stage__meta{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#c9c0b1;margin:0 0 18px;}' +
    '.lb-stage__artist{font-size:14px;line-height:1.6;color:#d8cfbf;margin:0 0 24px;}' +
    '.lb-stage__artist a{color:#f4efe6;text-decoration:underline;text-underline-offset:3px;transition:color .2s;}' +
    '.lb-stage__artist a:hover{color:#b8912f;}' +
    '.lb-stage__cta{display:inline-block;font-family:"Barlow Condensed","Oswald",sans-serif;font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:13px;text-decoration:none;padding:13px 24px;background:#b8912f;color:#14110d;border-radius:2px;transition:background .2s;}' +
    '.lb-stage__cta:hover{background:#cda43a;}' +
    '.lb-stage__btn{position:absolute;z-index:2;cursor:pointer;background:rgba(255,255,255,.1);color:#f4efe6;border:1px solid rgba(255,255,255,.35);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:background .2s,color .2s;}' +
    '.lb-stage__btn:hover{background:#b8912f;color:#211d18;border-color:#b8912f;}' +
    '.lb-stage__close{top:20px;right:20px;width:42px;height:42px;border-radius:2px;font-size:18px;}' +
    '.lb-stage__nav{top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:50%;font-size:28px;line-height:1;display:grid;place-items:center;}' +
    '.lb-stage__prev{left:24px;}.lb-stage__next{right:24px;}' +
    '.lb-stage__nav[hidden]{display:none;}' +
    '@media(max-width:1024px){.lb-stage__inner{grid-template-columns:1fr;gap:18px;text-align:center;}.lb-stage__img{max-height:56vh;}.lb-stage__nav{width:44px;height:44px;font-size:24px;}.lb-stage__prev{left:10px;}.lb-stage__next{right:10px;}}';

  var stage, img, indexEl, titleEl, metaEl, artistEl, cta, prevBtn, nextBtn;
  var items = [], idx = 0;

  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }

  function build() {
    if (stage) { return; }
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    stage = document.createElement('div');
    stage.className = 'lb-stage';
    stage.setAttribute('role', 'dialog');
    stage.setAttribute('aria-modal', 'true');
    stage.setAttribute('aria-label', 'Artwork viewer');
    stage.tabIndex = -1;
    stage.hidden = true;
    stage.innerHTML =
      '<div class="lb-stage__scrim" data-lb="close"></div>' +
      '<div class="lb-stage__inner">' +
        '<figure class="lb-stage__figure"><img class="lb-stage__img" src="" alt="" decoding="async"></figure>' +
        '<div class="lb-stage__caption">' +
          '<p class="lb-stage__eyebrow"><span class="lb-stage__index">1 / 1</span></p>' +
          '<h2 class="lb-stage__title">-</h2>' +
          '<p class="lb-stage__meta">-</p>' +
          '<p class="lb-stage__artist">-</p>' +
          '<a class="lb-stage__cta" href="contact.html">Enquire about this piece</a>' +
        '</div>' +
      '</div>' +
      '<button class="lb-stage__btn lb-stage__close" type="button" aria-label="Close viewer" data-lb="close">&#10005;</button>' +
      '<button class="lb-stage__btn lb-stage__nav lb-stage__prev" type="button" aria-label="Previous artwork" data-lb="prev">&lsaquo;</button>' +
      '<button class="lb-stage__btn lb-stage__nav lb-stage__next" type="button" aria-label="Next artwork" data-lb="next">&rsaquo;</button>';
    document.body.appendChild(stage);

    img      = stage.querySelector('.lb-stage__img');
    indexEl  = stage.querySelector('.lb-stage__index');
    titleEl  = stage.querySelector('.lb-stage__title');
    metaEl   = stage.querySelector('.lb-stage__meta');
    artistEl = stage.querySelector('.lb-stage__artist');
    cta      = stage.querySelector('.lb-stage__cta');
    prevBtn  = stage.querySelector('.lb-stage__prev');
    nextBtn  = stage.querySelector('.lb-stage__next');

    stage.addEventListener('click', function (e) {
      var t = e.target.closest('[data-lb]');
      if (!t) { return; }
      var a = t.getAttribute('data-lb');
      if (a === 'close') { close(); }
      else if (a === 'prev') { step(-1); }
      else if (a === 'next') { step(1); }
    });
    document.addEventListener('keydown', function (e) {
      if (!stage || stage.hidden) { return; }
      if (e.key === 'Escape') { close(); }
      else if (e.key === 'ArrowRight') { step(1); }
      else if (e.key === 'ArrowLeft') { step(-1); }
    });
  }

  function render() {
    var it = items[idx];
    if (!it) { return; }
    img.src = it.url || '';
    img.alt = it.title || 'Artwork';
    indexEl.textContent = (idx + 1) + ' / ' + items.length;
    titleEl.textContent = it.title || 'Untitled';
    metaEl.textContent = it.meta || 'ArtPro Gallery';
    if (it.artist && it.artistSlug) {
      artistEl.innerHTML = 'By <a href="artist.html?a=' + encodeURIComponent(it.artistSlug) + '">' + esc(it.artist) + '</a>';
    } else {
      artistEl.textContent = it.artist ? ('By ' + it.artist) : 'ArtPro Collection';
    }
    cta.setAttribute('href', 'contact.html?artist=' + encodeURIComponent(it.artist || '') + '&piece=' + encodeURIComponent(it.title || ''));
    var multi = items.length > 1;
    prevBtn.hidden = !multi;
    nextBtn.hidden = !multi;
  }

  function step(d) { idx = (idx + d + items.length) % items.length; render(); }

  function open(list, start) {
    build();
    items = list || [];
    if (!items.length) { return; }
    idx = Math.max(0, Math.min(start || 0, items.length - 1));
    render();
    stage.hidden = false;
    document.body.style.overflow = 'hidden';
    stage.focus();
  }

  function close() {
    if (!stage) { return; }
    stage.hidden = true;
    document.body.style.overflow = '';
  }

  window.ArtProLightbox = { open: open, close: close };
})(window, document);
