/* Story viewer — opens a story in a small in-page window.
   Click a story tile: image, who posted it, caption and age. Auto-advances every 5s
   (hold to pause), ← / → or tap the sides to move, Esc or × to close. */
(function () {
  'use strict';
  var DURATION = 5000;
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var items = [], idx = 0, overlay = null, timer = null, startedAt = 0, remaining = DURATION, paused = false;
  var els = {};

  function collect() {
    items = [].slice.call(document.querySelectorAll('.story [data-story]')).map(function (el) {
      return {
        el: el,
        img: el.getAttribute('data-img') || '',
        who: el.getAttribute('data-who') || '',
        cap: el.getAttribute('data-cap') || '',
        when: el.getAttribute('data-when') || '',
        hue: el.getAttribute('data-hue') || '260'
      };
    });
  }

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'sv';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Story');
    overlay.innerHTML =
      '<button type="button" class="sv-arrow sv-prev" aria-label="Previous story">‹</button>' +
      '<div class="sv-card">' +
        '<img class="sv-img" alt="" referrerpolicy="no-referrer" hidden>' +
        '<div class="sv-fallback"><div><div class="sv-fb-ic">🖼️</div><p class="sv-fb-cap"></p><a class="sv-fb-open" target="_blank" rel="noopener noreferrer" hidden>Open original image ↗</a></div></div>' +
        '<div class="sv-top"><div class="sv-bars"></div>' +
          '<div class="sv-who"><span class="sv-av"></span><span class="sv-name"></span><small class="sv-when"></small></div>' +
        '</div>' +
        '<button type="button" class="sv-x" aria-label="Close">×</button>' +
        '<div class="sv-tap sv-tap-l"></div><div class="sv-tap sv-tap-r"></div>' +
        '<div class="sv-cap"></div>' +
      '</div>' +
      '<button type="button" class="sv-arrow sv-next" aria-label="Next story">›</button>';
    document.body.appendChild(overlay);

    els = {
      card: overlay.querySelector('.sv-card'),
      img: overlay.querySelector('.sv-img'),
      fb: overlay.querySelector('.sv-fallback'),
      fbCap: overlay.querySelector('.sv-fb-cap'),
      fbOpen: overlay.querySelector('.sv-fb-open'),
      bars: overlay.querySelector('.sv-bars'),
      av: overlay.querySelector('.sv-av'),
      name: overlay.querySelector('.sv-name'),
      when: overlay.querySelector('.sv-when'),
      cap: overlay.querySelector('.sv-cap')
    };

    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.sv-x').addEventListener('click', close);
    overlay.querySelector('.sv-prev').addEventListener('click', function () { go(-1); });
    overlay.querySelector('.sv-next').addEventListener('click', function () { go(1); });
    overlay.querySelector('.sv-tap-l').addEventListener('click', function () { go(-1); });
    overlay.querySelector('.sv-tap-r').addEventListener('click', function () { go(1); });
    // hold to pause
    ['mousedown', 'touchstart'].forEach(function (ev) { els.card.addEventListener(ev, pause, { passive: true }); });
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (ev) { els.card.addEventListener(ev, resume, { passive: true }); });

    els.img.addEventListener('load', function () { els.img.hidden = false; els.fb.style.display = 'none'; });
    els.img.addEventListener('error', function () { showFallback(items[idx], true); });
  }

  function showFallback(it, failed) {
    els.img.hidden = true;
    els.fb.style.display = 'grid';
    els.fb.style.setProperty('--h', it.hue);
    els.fbCap.textContent = it.cap || (failed ? "This image couldn't be loaded." : '');
    if (it.img && failed) { els.fbOpen.href = it.img; els.fbOpen.hidden = false; } else { els.fbOpen.hidden = true; }
  }

  function paintBars() {
    els.bars.innerHTML = '';
    items.forEach(function (_, i) {
      var b = document.createElement('div');
      b.className = 'sv-bar' + (i < idx ? ' done' : '') + (i === idx ? ' cur' : '');
      b.innerHTML = '<i></i>';
      els.bars.appendChild(b);
    });
  }

  function schedule(ms) {
    clearTimeout(timer);
    if (reduce) return;                       // no autoplay for reduced-motion users
    remaining = ms; startedAt = Date.now();
    timer = setTimeout(function () { go(1); }, ms);
  }
  function pause() {
    if (paused || reduce) return;
    paused = true; clearTimeout(timer);
    remaining = Math.max(300, remaining - (Date.now() - startedAt));
    overlay.classList.add('is-paused');
  }
  function resume() {
    if (!paused) return;
    paused = false; overlay.classList.remove('is-paused');
    schedule(remaining);
  }

  function show(i) {
    idx = i; paused = false; overlay.classList.remove('is-paused');
    var it = items[idx];
    paintBars();
    els.av.textContent = (it.who || '?').charAt(0).toUpperCase();
    els.av.style.background = 'hsl(' + it.hue + ' 55% 45%)';
    els.name.textContent = it.who;
    els.when.textContent = it.when;
    els.cap.textContent = it.cap;
    els.cap.style.display = it.cap ? 'block' : 'none';
    overlay.querySelector('.sv-prev').style.visibility = idx > 0 ? 'visible' : 'hidden';
    overlay.querySelector('.sv-next').style.visibility = idx < items.length - 1 ? 'visible' : 'hidden';
    if (it.img) {
      els.fb.style.display = 'none';
      els.img.hidden = true;
      els.img.src = it.img;
      if (els.img.complete && els.img.naturalWidth > 0) { els.img.hidden = false; }
    } else {
      showFallback(it, false);
    }
    schedule(DURATION);
  }

  function go(d) {
    var n = idx + d;
    if (n < 0) return;
    if (n >= items.length) { close(); return; }
    show(n);
  }

  function open(i) {
    collect();
    if (!items.length) return;
    if (!overlay) build();
    overlay.classList.add('is-open');
    document.documentElement.classList.add('sv-open');
    show(Math.max(0, Math.min(i, items.length - 1)));
    els.card.focus && els.card.setAttribute('tabindex', '-1');
  }

  function close() {
    clearTimeout(timer);
    if (overlay) overlay.classList.remove('is-open');
    document.documentElement.classList.remove('sv-open');
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('.story [data-story]') : null;
    if (!t) return;
    e.preventDefault();
    collect();
    var i = items.map(function (x) { return x.el; }).indexOf(t);
    open(i < 0 ? 0 : i);
  });
  document.addEventListener('keydown', function (e) {
    if (overlay && overlay.classList.contains('is-open')) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      return;
    }
    var t = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && t && t.matches && t.matches('.story [data-story][role=button]')) {
      e.preventDefault(); t.click();
    }
  });
})();
