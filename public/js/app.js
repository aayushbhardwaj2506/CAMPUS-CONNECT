/* Campus Connect — shell interactions & micro-feedback.
   The app is fully functional without JavaScript; this layer adds polish. */
(function () {
  'use strict';
  var M = window.CCMotion || { reveal: function () {}, countUp: function () {}, enabled: false };

  /* ---- mobile nav drawer ---------------------------------------------- */
  var toggle = document.getElementById('navToggle');
  var scrim = document.getElementById('navScrim');
  function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (toggle) toggle.addEventListener('click', function () { setNav(!document.body.classList.contains('nav-open')); });
  if (scrim) scrim.addEventListener('click', function () { setNav(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });
  document.querySelectorAll('.sidebar .navitem').forEach(function (a) {
    a.addEventListener('click', function () { setNav(false); });
  });

  /* ---- "/" focuses global search ------------------------------------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ''))) {
      var s = document.querySelector('.topsearch input');
      if (s) { e.preventDefault(); s.focus(); s.select(); }
    }
  });

  /* ---- route progress bar on navigation ----------------------------- */
  var bar = document.getElementById('routeProgress');
  function startBar() {
    if (!bar) return;
    bar.classList.add('on'); bar.style.width = '18%';
    setTimeout(function () { bar.style.width = '68%'; }, 120);
    setTimeout(function () { bar.style.width = '88%'; }, 420);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href[0] === '#' || a.target === '_blank' || a.hasAttribute('download')) return;
    if (a.href.indexOf(location.origin) !== 0) return;
    if (a.href === location.href) return;
    startBar();
  }, true);
  document.addEventListener('submit', function (e) {
    if (e.target.method && e.target.method.toLowerCase() === 'post') startBar();
  }, true);
  window.addEventListener('pageshow', function () { if (bar) { bar.classList.remove('on'); bar.style.width = '0'; } });

  /* ---- dismissible flash messages ---------------------------------- */
  document.querySelectorAll('.flash').forEach(function (f) {
    var x = f.querySelector('.flash-x');
    function dismiss() {
      f.style.transition = 'opacity .25s, transform .25s, margin .25s, height .25s';
      f.style.overflow = 'hidden';
      f.style.opacity = 0; f.style.transform = 'translateY(-6px)';
      setTimeout(function () { f.style.height = '0'; f.style.margin = '0'; f.style.padding = '0'; }, 200);
      setTimeout(function () { f.remove(); }, 480);
    }
    if (x) x.addEventListener('click', dismiss);
    if (f.classList.contains('success') || f.classList.contains('info')) setTimeout(dismiss, 5200);
  });

  /* ---- [data-open="id"] opens a <details> and scrolls to it ------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-open]');
    if (!t) return;
    var d = document.getElementById(t.getAttribute('data-open'));
    if (d && d.tagName === 'DETAILS') {
      e.preventDefault(); d.open = true;
      d.scrollIntoView({ behavior: M.enabled ? 'smooth' : 'auto', block: 'nearest' });
      var fi = d.querySelector('input,textarea,select'); if (fi) setTimeout(function () { fi.focus(); }, 120);
    }
  });

  /* ---- confirm destructive actions -------------------------------- */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.matches && f.matches('[data-confirm]') && !window.confirm(f.getAttribute('data-confirm'))) {
      e.preventDefault();
    }
  });

  /* ---- auto-grow textareas & char counters ---------------------- */
  document.querySelectorAll('textarea[data-autogrow]').forEach(function (t) {
    var grow = function () { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 360) + 'px'; };
    t.addEventListener('input', grow); grow();
  });
  document.querySelectorAll('[data-counter-for]').forEach(function (el) {
    var input = document.getElementById(el.getAttribute('data-counter-for'));
    if (!input) return;
    var max = input.getAttribute('maxlength');
    var upd = function () { el.textContent = input.value.length + (max ? ' / ' + max : ''); };
    input.addEventListener('input', upd); upd();
  });

  /* ---- entrance reveals ---------------------------------------- */
  if (M.enabled) {
    var content = document.getElementById('content');
    if (content) {
      var groups = content.querySelectorAll('[data-reveal]');
      if (groups.length) {
        groups.forEach(function (g) { M.reveal(g.children, { max: 12 }); });
      } else {
        var top = Array.prototype.filter.call(content.children, function (c) {
          return c.nodeName !== 'STYLE' && c.nodeName !== 'SCRIPT' && !c.classList.contains('flash-stack');
        });
        /* if the page is one wrapper holding the real cards, reveal those */
        if (top.length === 1 && /^(DIV|SECTION)$/.test(top[0].nodeName) && top[0].children.length > 1
            && !top[0].classList.contains('card')) {
          M.reveal(top[0].children, { max: 12 });
        } else {
          M.reveal(top, { max: 10 });
        }
      }
    }
  }

  /* ---- number count-ups (dashboard stats, leaderboard) ------- */
  if (M.enabled) {
    var io = 'IntersectionObserver' in window
      ? new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) { M.countUp(en.target); io.unobserve(en.target); }
          });
        }, { threshold: 0.6 })
      : null;
    document.querySelectorAll('[data-count], .stat .n, .leader .pts').forEach(function (el) {
      if (io) io.observe(el); else M.countUp(el);
    });
  }

  /* ================= CHAT (direct messages + group discussion) ========= */
  (function () {
    var chat = document.getElementById('chat') || document.getElementById('discussion');
    var scroll = document.getElementById('chatScroll') || document.getElementById('gChatScroll')
      || (chat && chat.querySelector('.chat-scroll'));
    if (!chat || !scroll) return;

    var msgs = Array.prototype.slice.call(scroll.querySelectorAll('.msg[data-mid]'));

    /* soften entrance: only the last few bubbles animate, older ones appear at rest */
    if (M.enabled) {
      var animateFrom = Math.max(0, msgs.length - 8);
      msgs.forEach(function (el, i) {
        var b = el.querySelector('.bubble'); if (!b) return;
        if (i < animateFrom) { b.style.animation = 'none'; }
        else { b.style.animationDelay = ((i - animateFrom) * 28) + 'ms'; }
      });
    } else {
      msgs.forEach(function (el) { var b = el.querySelector('.bubble'); if (b) b.style.animation = 'none'; });
    }

    /* "new messages" divider from a per-conversation last-seen marker (client only) */
    var convKey = chat.getAttribute('data-conv');
    var seenKey = convKey ? 'cc_seen_msg_' + convKey : null;
    var newDivider = null, unseen = 0;
    if (seenKey && msgs.length) {
      var stored = 0;
      try { stored = parseInt(localStorage.getItem(seenKey), 10) || 0; } catch (e) {}
      var lastId = 0;
      msgs.forEach(function (el) { lastId = Math.max(lastId, parseInt(el.getAttribute('data-mid'), 10) || 0); });
      if (stored && stored < lastId) {
        var firstNew = null;
        msgs.forEach(function (el) {
          var id = parseInt(el.getAttribute('data-mid'), 10) || 0;
          if (id > stored && el.getAttribute('data-mine') === '0') {
            if (!firstNew) firstNew = el;
            unseen++;
          }
        });
        if (firstNew) {
          newDivider = document.createElement('div');
          newDivider.className = 'chat-sep chat-sep--new';
          newDivider.innerHTML = '<span>New message' + (unseen > 1 ? 's' : '') + '</span>';
          firstNew.parentNode.insertBefore(newDivider, firstNew);
        }
      }
      try {
        localStorage.setItem(seenKey, String(lastId));
        localStorage.setItem('cc_seen_at_' + convKey, new Date().toISOString());
      } catch (e) {}
    }

    /* scroll: to the "new" divider if there is one, else to newest */
    function toBottom(smooth) {
      try { scroll.scrollTo({ top: scroll.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); }
      catch (e) { scroll.scrollTop = scroll.scrollHeight; }
    }
    function settleScroll() {
      if (newDivider) scroll.scrollTop = Math.max(0, newDivider.offsetTop - 70);
      else scroll.scrollTop = scroll.scrollHeight;
    }
    settleScroll();
    requestAnimationFrame(settleScroll);
    setTimeout(settleScroll, 80);
    setTimeout(settleScroll, 300);
    window.addEventListener('load', settleScroll, { once: true });

    /* jump-to-latest pill */
    var jump = document.getElementById('chatJump');
    var jumpN = document.getElementById('chatJumpN');
    function nearBottom() { return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 120; }
    function updateJump() {
      if (!jump) return;
      if (nearBottom()) { jump.classList.remove('show'); return; }
      jump.classList.add('show');
      if (jumpN) {
        var below = 0, vpBottom = scroll.scrollTop + scroll.clientHeight;
        msgs.forEach(function (el) { if (el.offsetTop > vpBottom - 20) below++; });
        if (below > 0) { jumpN.textContent = below; jumpN.style.display = ''; }
        else { jumpN.style.display = 'none'; }
      }
    }
    if (jump) {
      jump.addEventListener('click', function () { toBottom(true); });
      scroll.addEventListener('scroll', updateJump, { passive: true });
      updateJump();
    }
  })();

  /* ---- composer: Enter to send, Shift+Enter newline, send-btn state --- */
  document.querySelectorAll('.chat-composer').forEach(function (form) {
    var box = form.querySelector('.composer-box');
    var input = form.querySelector('.composer-input');
    if (!input) return;
    function refresh() {
      if (box) box.classList.toggle('is-empty', input.value.trim() === '');
    }
    input.addEventListener('input', refresh);
    refresh();
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (input.value.trim() === '') return;
        if (form.requestSubmit) form.requestSubmit();
        else form.submit();
      }
    });
  });

  /* ---- topbar lifts on scroll ------------------------------- */
  var topbar = document.querySelector('.topbar'), ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      if (topbar) topbar.classList.toggle('is-scrolled', window.scrollY > 6);
      ticking = false;
    });
  }
  if (topbar) { window.addEventListener('scroll', onScroll, { passive: true }); onScroll(); }

  /* ---- notification bell ring (fallback for browsers without :has) --- */
  var bell = document.querySelector('.icon-action');
  if (bell && bell.querySelector('.badge-dot') && M.enabled) bell.classList.add('has-unread');

  /* ---- sidebar: floating tiles + gliding rail ("wheely" feel) ------- */
  var sidebar = document.getElementById('sidebar');
  var rail = document.getElementById('sidebarRail');
  if (sidebar && rail && window.matchMedia('(min-width: 901px)').matches) {
    var items = Array.prototype.slice.call(sidebar.querySelectorAll('.navitem'));
    var activeItem = sidebar.querySelector('.navitem.active') || items[0];

    function placeRail(el, instant) {
      if (!el) { rail.style.opacity = '0'; return; }
      var r = el.getBoundingClientRect(), s = sidebar.getBoundingClientRect();
      if (instant) rail.style.transition = 'none';
      rail.style.opacity = '1';
      rail.style.height = Math.round(r.height - 12) + 'px';
      rail.style.transform = 'translateY(' + Math.round(r.top - s.top + sidebar.scrollTop + 6) + 'px)';
      if (instant) { rail.offsetHeight; rail.style.transition = ''; }
    }

    if (M.enabled) {
      // staggered "deal the cards" entrance, then clean up so hover works
      items.forEach(function (el, i) { el.style.setProperty('--d', i); });
      sidebar.classList.add('nav-in');
      var settle = items.length * 32 + 700;
      setTimeout(function () {
        sidebar.classList.remove('nav-in');
        items.forEach(function (el) {
          el.style.removeProperty('--d');
          el.style.opacity = ''; el.style.transform = '';
        });
      }, settle);
    }
    setTimeout(function () { placeRail(activeItem, true); }, M.enabled ? 520 : 0);

    items.forEach(function (el) {
      el.addEventListener('mouseenter', function () { placeRail(el); });
    });
    sidebar.addEventListener('mouseleave', function () { placeRail(activeItem); });
    window.addEventListener('resize', function () { placeRail(activeItem, true); });
  }
})();
