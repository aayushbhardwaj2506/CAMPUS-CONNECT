/* CCMotion — a tiny requestAnimationFrame tween helper (Anime.js-style API,
   ~1KB). Used for entrance staggers, number count-ups and small feedback.
   Honours prefers-reduced-motion: when motion is off, everything applies
   instantly. */
(function (w) {
  'use strict';
  var MOTION = document.documentElement.classList.contains('anim');

  var EASE = {
    linear: function (t) { return t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    outQuart: function (t) { return 1 - Math.pow(1 - t, 4); },
    outBack: function (t) { var c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  };

  function tween(opts) {
    var dur = MOTION ? (opts.duration == null ? 400 : opts.duration) : 0;
    var delay = MOTION ? (opts.delay || 0) : 0;
    var ease = EASE[opts.easing] || EASE.outCubic;
    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var elapsed = now - start - delay;
      if (elapsed < 0) { requestAnimationFrame(frame); return; }
      var p = dur === 0 ? 1 : Math.min(1, elapsed / dur);
      opts.update(ease(p), p);
      if (p < 1) requestAnimationFrame(frame);
      else if (opts.complete) opts.complete();
    }
    requestAnimationFrame(frame);
  }

  /* animate one element. props: {opacity:[from,to], y:[from,to], x, scale} */
  function animate(el, props, opts) {
    opts = opts || {};
    var keys = Object.keys(props);
    tween({
      duration: opts.duration, delay: opts.delay, easing: opts.easing,
      update: function (e) {
        var tr = '';
        keys.forEach(function (k) {
          var a = props[k][0], b = props[k][1], v = a + (b - a) * e;
          if (k === 'opacity') el.style.opacity = v;
          else if (k === 'y') tr += ' translateY(' + v + 'px)';
          else if (k === 'x') tr += ' translateX(' + v + 'px)';
          else if (k === 'scale') tr += ' scale(' + v + ')';
        });
        if (tr) el.style.transform = tr.trim();
      },
      complete: function () {
        if (props.y || props.x || props.scale) el.style.transform = '';
        if (props.opacity) el.style.opacity = '';
        if (opts.complete) opts.complete();
      }
    });
  }

  /* reveal a set of elements with a CSS-driven stagger (throttle-proof).
     Adds .cc-reveal + a --i index; the keyframe is forwards-filled so an
     element can never be left hidden. */
  function reveal(nodes, opts) {
    opts = opts || {};
    if (!MOTION) return;
    var list = typeof nodes === 'string' ? document.querySelectorAll(nodes) : nodes;
    var max = opts.max == null ? 12 : opts.max;
    var arr = Array.prototype.slice.call(list);
    arr.forEach(function (el, i) {
      el.style.setProperty('--i', Math.min(i, max));
      el.classList.add('cc-reveal');
    });
    /* hard safety net: whatever happens, show everything after 1.6s */
    setTimeout(function () {
      arr.forEach(function (el) {
        el.classList.remove('cc-reveal');
        el.style.removeProperty('--i');
        el.style.opacity = '';
        el.style.transform = '';
      });
    }, 1600);
  }

  /* number count-up. Reads the element's current numeric text as the target
     unless `to` is given. */
  function countUp(el, opts) {
    opts = opts || {};
    var finalText = el.textContent;
    var raw = (opts.to != null ? opts.to : parseFloat((finalText || '').replace(/[^0-9.\-]/g, ''))) || 0;
    if (!MOTION || raw === 0 || raw > 100000) { return; }
    var prefix = opts.prefix || '';
    var suffix = opts.suffix || '';
    tween({
      duration: opts.duration || 850, easing: 'outQuart',
      update: function (e) { el.textContent = prefix + Math.round(raw * e).toLocaleString() + suffix; },
      complete: function () { el.textContent = finalText; }
    });
    /* safety net if rAF is throttled mid-count */
    setTimeout(function () { el.textContent = finalText; }, 1400);
  }

  w.CCMotion = { animate: animate, reveal: reveal, countUp: countUp, tween: tween, enabled: MOTION };
})(window);
