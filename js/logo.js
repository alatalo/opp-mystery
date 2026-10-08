/* The wordmark as an old sign. Everything here is decoration: small overlay elements in percentages over the unmodified
   logo picture (so they stay registered with the letters at every size), stepped, occasional, paused when the tab is hidden,
   switched off under reduced motion. Any failure leaves the plain logo. ES5 on purpose (old Safari). */
(function () {
  'use strict';
  var Logo = { enabled: true };
  window.PaitaLogo = Logo;
  var wrap = null, ready = false;
  // glyph boxes in pixels of logo.png (1024 x 61): the slashed O, thirteen letters, the boxed X
  var G = [[1, 57], [70, 57], [139, 48], [199, 57], [268, 57], [364, 57], [433, 57], [502, 47], [561, 57], [630, 57], [699, 57], [768, 57], [837, 48], [896, 58], [965, 57]];
  var W = 1024;
  var mood = { dark: false, low: false, seed: '1' };
  var lastEffect = 0, timer = null, secretTaps = 0, secretDone = false, reduced = false, quiet = false;
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  reduced = !!(mq && mq.matches);

  function css(name) { return (getComputedStyle(document.documentElement).getPropertyValue(name) || '').replace(/^\s+|\s+$/g, ''); }
  function inverted() { return /invert/.test(css('--logo-filter')); }
  function hash(str) { var h = 0, i; for (i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; } return Math.abs(h); }
  function small() { return wrap && wrap.clientWidth < 360; }

  // an overlay that hides glyph `at` (background colour) and optionally shows a slice of glyph `g` in its place
  function overlay(at, g, opts) {
    opts = opts || {};
    var d = document.createElement('i'); d.className = 'lo'; d.setAttribute('aria-hidden', 'true');
    var a = G[at], b = g === null || g === undefined ? null : G[g];
    var cx = a[0] + a[1] / 2, w = b ? b[1] : a[1];
    d.style.left = ((cx - w / 2) / W * 100) + '%'; d.style.width = (w / W * 100) + '%';
    d.style.top = '0'; d.style.height = '100%';
    if (b) {
      var s = document.createElement('i'); s.className = 'lo-i';
      s.style.backgroundSize = (W / b[1] * 100) + '% 100%';
      s.style.backgroundPosition = (b[0] / (W - b[1]) * 100) + '% 0';
      if (opts.flip) { s.style.webkitTransform = 'scaleX(-1)'; s.style.transform = 'scaleX(-1)'; }
      if (opts.rot) { s.style.webkitTransform = 'rotate(' + opts.rot + 'deg)'; s.style.transform = 'rotate(' + opts.rot + 'deg)'; }
      d.appendChild(s);
    }
    if (opts.bar) { var r = document.createElement('i'); r.className = 'lo-bar'; r.style.background = inverted() ? '#fff' : '#000'; d.appendChild(r); }
    wrap.appendChild(d);
    return d;
  }
  function gone(list) { var i; for (i = 0; i < list.length; i++) { if (list[i] && list[i].parentNode) { list[i].parentNode.removeChild(list[i]); } } }
  function steps(list, ms) { // list of functions, one per frame
    var i = 0;
    (function next() {
      if (i >= list.length) { return; }
      try { list[i++](); } catch (e) { /* plain logo */ }
      setTimeout(next, ms);
    })();
  }

  Logo.blink = function () { // the eye closes: the slash flips, a bar, the slash flips back
    if (!ready) { return; }
    var o1 = null, o2 = null;
    steps([function () { o1 = overlay(0, 0, { flip: true }); }, function () { gone([o1]); o2 = overlay(0, 0, { bar: true }); }, function () { gone([o2]); o1 = overlay(0, 0, { flip: true }); }, function () { gone([o1, o2]); }], 110);
  };
  Logo.tube = function (k) { // a failing neon letter
    if (!ready || small()) { return; }
    k = typeof k === 'number' ? k : 1 + (hash(mood.seed + 'tube') % 13);
    var o = null;
    steps([function () { o = overlay(k, null); }, function () { gone([o]); }, function () { o = overlay(k, null); }, function () { gone([o]); o = overlay(k, null); }, function () { gone([o]); }], 75);
  };
  Logo.tick = function () { // the boxed X turns one step
    if (!ready) { return; }
    var o = null;
    steps([function () { o = overlay(14, 14, { rot: 45 }); }, function () { gone([o]); }], 170);
  };
  Logo.swap = function () { // two letters trade places for a moment, then correct themselves
    if (!ready || small()) { return; }
    var i = 1 + (hash(mood.seed + 'swap') % 5), j = i + 2 + (hash(mood.seed + 'sw2') % 4), a = null, b = null;
    steps([function () { a = overlay(i, j); b = overlay(j, i); }, function () {}, function () {}, function () { gone([a, b]); }], 220);
  };
  Logo.flash = function () { // lightning: the logo inverts for one frame
    if (!wrap) { return; }
    var img = wrap.querySelector('img'); if (!img) { return; }
    var prev = img.style.filter, prevW = img.style.webkitFilter, v = inverted() ? 'none' : 'invert(1)';
    img.style.filter = v; img.style.webkitFilter = v;
    setTimeout(function () { img.style.filter = prev; img.style.webkitFilter = prevW; }, 90);
  };
  Logo.react = function () { // a moment that matters: a one-off two-frame blink
    if (reduced || !ready) { return; }
    var now = Date.now(); if (now - lastEffect < 2500) { return; }
    lastEffect = now;
    var o = null;
    steps([function () { o = overlay(0, 0, { bar: true }); }, function () { gone([o]); }], 120);
  };
  Logo.test = function (what) {
    ready = true;
    if (what === 'blink') { Logo.blink(); } else if (what === 'tube') { Logo.tube(1 + Math.floor(Math.random() * 13)); } else if (what === 'tick') { Logo.tick(); }
    else if (what === 'swap') { Logo.swap(); } else if (what === 'flash') { Logo.flash(); } else if (what === 'react') { lastEffect = 0; Logo.react(); }
  };
  Logo.setMood = function (m) { var k; for (k in m) { mood[k] = m[k]; } };

  // the scheduler: one effect every 20-45 seconds at most, never while the first beat is typing, never while hidden
  function schedule() {
    clearTimeout(timer);
    var wait = 20000 + (hash(mood.seed + Date.now()) % 25000);
    timer = setTimeout(function () {
      try {
        var typing = document.getElementById('beat') && document.getElementById('beat').classList.contains('typing');
        if (!document.hidden && !typing && !reduced && ready && Date.now() - lastEffect > 12000) {
          lastEffect = Date.now();
          var r = hash(mood.seed + Date.now()) % 100;
          if (mood.low && r < 35) { Logo.swap(); }
          else if (mood.dark && r < 60) { Logo.tube(); }
          else if (r < 80) { Logo.blink(); }
          else { Logo.tube(); }
        }
      } catch (e) { /* plain logo */ }
      schedule();
    }, wait);
  }

  // the secret: the boxed X itself, tapped a few times
  Logo.onSecret = null;
  function wireX() {
    var bt = wrap.querySelector('.lo-xbtn');
    if (!bt) { return; }
    bt.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      secretTaps++;
      Logo.tick();
      if (secretTaps >= 3 && !secretDone) { secretDone = true; try { if (Logo.onSecret) { Logo.onSecret(); } } catch (x) { /* nothing happens */ } }
    });
  }

  function init() {
    try {
      wrap = document.querySelector('.logowrap');
      if (!wrap) { return; }
      ready = !reduced;
      wireX();
      if (!reduced) { schedule(); }
      document.addEventListener('visibilitychange', function () { if (!document.hidden) { schedule(); } });
      if (mq && mq.addEventListener) { mq.addEventListener('change', function () { reduced = mq.matches; ready = !reduced; }); }
    } catch (e) { Logo.enabled = false; }
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
