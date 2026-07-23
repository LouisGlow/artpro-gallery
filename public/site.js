// ArtPro Gallery - shared behaviour
(function () {
  // back button - sits to the left of the logo on every page (except home)
  var inner = document.querySelector('.site-header__inner');
  var brand = inner && inner.querySelector('.brand');
  var path = location.pathname.replace(/\/+$/, '');
  var isHome = path === '' || /\/index(\.html)?$/.test(path) || path === '/index';
  if (inner && brand && !isHome) {
    var back = document.createElement('button');
    back.className = 'nav-back';
    back.type = 'button';
    back.setAttribute('aria-label', 'Go back');
    back.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    back.addEventListener('click', function () {
      if (history.length > 1) history.back(); else location.href = 'index.html';
    });
    var group = document.createElement('div');
    group.className = 'header-left';
    inner.insertBefore(group, brand);
    group.appendChild(back);
    group.appendChild(brand);
  }

  // mobile nav
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('primary-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
  }

  // reveal on scroll
  var els = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && els.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add('in'); });
  }

  // shop filter (art-for-sale)
  var chips = document.querySelectorAll('[data-filter]');
  var cards = document.querySelectorAll('[data-medium]');
  if (chips.length && cards.length) {
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        var f = chip.getAttribute('data-filter');
        chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        cards.forEach(function (card) {
          var show = f === 'all' || card.getAttribute('data-medium') === f;
          card.style.display = show ? '' : 'none';
        });
      });
    });
  }
})();
