/* Decoration only: boot sequence and the text-character weather layer. Everything here is optional.
   Any exception disables the effects and the game carries on. Only the existing palette, only the pixel font,
   only stepped motion, nothing smooth. ES5 on purpose (old Safari). */
(function () {
  'use strict';
  var Fx = {};
  var disabled = false, reduced = false;
  var canvas = null, c2 = null, W = 0, H = 0, dpr = 1;
  var spec = null, drops = [], mask = [], raf = null, last = 0, tick = 0;
  var bolt = null, lastBolt = 0, forcedBolt = /[?&]salama=1/.test(location.search), boltDone = false, started = 0;
  var CW = 11, CH = 17;
  // colours and "mood" come from the CSS variables of the active palette (css/style.css), so there is one place to edit
  var cache = {};
  function cv(name) {
    if (cache[name] === undefined) { cache[name] = (getComputedStyle(document.documentElement).getPropertyValue(name) || '').replace(/^\s+|\s+$/g, ''); }
    return cache[name];
  }
  function nv(name, def) { var n = parseFloat(cv(name)); return isNaN(n) ? def : n; }
  Fx.refresh = function () { cache = {}; if (spec && !disabled) { try { seedDrops(); } catch (e) { disable(); } } };

  function disable() {
    disabled = true;
    try { if (raf) { cancelAnimationFrame(raf); } } catch (e) { /* ignore */ }
    try { if (c2) { c2.clearRect(0, 0, W * dpr, H * dpr); } } catch (e2) { /* ignore */ }
    var b = document.getElementById('boot'); if (b) { b.hidden = true; }
  }
  Fx.disable = disable;
  Fx.setReduced = function (r) { reduced = !!r; if (reduced) { clear(); } else if (spec) { startLoop(); } };
  Fx.setMask = function (m) { mask = m || []; };

  function clear() { try { if (c2) { c2.clearRect(0, 0, canvas.width, canvas.height); } } catch (e) { /* ignore */ } }

  function size() {
    if (!canvas) { return; }
    W = window.innerWidth; H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }

  function seedDrops() {
    drops = [];
    if (!spec || spec.kind === 'none') { return; }
    var cols = Math.floor(W / CW), rows = Math.floor(H / CH), n = Math.floor(cols * rows * [0, 0.005, 0.009, 0.014][spec.density || 1] * nv('--rain', 1)), i;
    for (i = 0; i < n; i++) {
      drops.push({ x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * (H / CH)), v: spec.kind === 'snow' ? 1 : 1 + Math.floor(Math.random() * 2), c: Math.random() });
    }
  }

  Fx.weather = function (s) {
    if (disabled) { return; }
    try {
      spec = s && (s.kind !== 'none' || s.sun) ? s : null;
      if (!canvas) {
        canvas = document.getElementById('fx');
        if (!canvas || !canvas.getContext) { disable(); return; }
        c2 = canvas.getContext('2d');
        if (!c2) { disable(); return; }
        size();
        window.addEventListener('resize', function () { try { size(); seedDrops(); } catch (e) { disable(); } });
        document.addEventListener('visibilitychange', function () { if (!document.hidden && spec) { startLoop(); } });
      }
      if (!spec) { clear(); return; }
      seedDrops();
      started = Date.now();
      startLoop();
    } catch (e) { disable(); }
  };

  function startLoop() {
    if (disabled || reduced || raf || !spec) { return; }
    raf = requestAnimationFrame(loop);
  }

  function masked(px, py) {
    var i, r;
    for (i = 0; i < mask.length; i++) {
      r = mask[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) { return true; }
    }
    return false;
  }

  function loop(ts) {
    raf = null;
    if (disabled || reduced || !spec) { return; }
    if (document.hidden) { return; }   // resumes on visibilitychange
    try {
      if (ts - last >= 75) {
        last = ts; tick++;
        draw(ts);
      }
    } catch (e) { disable(); return; }
    raf = requestAnimationFrame(loop);
  }

  function draw(ts) {
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    c2.clearRect(0, 0, W, H);
    c2.font = '16px Silkscreen, monospace';
    c2.textBaseline = 'top';
    var i, d, px, py, rows = Math.ceil(H / CH), cols = Math.floor(W / CW);
    var rain = spec.kind === 'rain', snow = spec.kind === 'snow';
    c2.fillStyle = cv('--fg') || '#ffffff';
    var wind = nv('--wind', 0);
    for (i = 0; i < drops.length; i++) {
      d = drops[i];
      d.y += d.v;
      if (snow) { d.x += (tick % 6 < 3 ? 0 : (d.c < 0.5 ? 1 : -1)); }
      if (wind && tick % 3 === 0) { d.x += wind > 0 ? 1 : -1; }
      if (d.y >= rows) { d.y = -1; d.x = Math.floor(Math.random() * cols); }
      if (d.x < 0) { d.x = cols - 1; }
      if (d.x >= cols) { d.x = 0; }
      px = d.x * CW; py = d.y * CH;
      // the rain stays on the whole screen but is dimmed where it would sit on text
      c2.globalAlpha = masked(px, py) ? 0.14 : 1;
      if (snow) { c2.fillText(d.c < 0.5 ? '*' : '.', px, py); }
      else {
        c2.fillText('|', px, py);
        c2.fillText('\'', px - (spec.density >= 2 ? 2 : 0), py - CH);
        if (spec.density >= 2) { c2.fillText('.', px - 4, py - 2 * CH); }
      }
      c2.globalAlpha = 1;
    }
    if (spec.sun) {
      c2.fillStyle = cv('--sun') || '#ffff00';
      var sx = W - 9 * CW - 6, sy = 8, on = Math.floor(ts / 900) % 2;
      var art = on ? [' \\ | / ', '- (O) -', ' / | \\ '] : ['  \\|/  ', '-- O --', '  /|\\  '];
      art.forEach(function (l, k) { c2.fillText(l, sx, sy + k * CH); });
    }
    if (spec.moonArt && !spec.sun) {
      var MO = { 'täysi': [' ,-. ', '( @ )', " `-' "], 'uusi': [' . . ', '.   .', " ' ' "], 'kasvava': [' ,-. ', '(  ) ', " `-' "], 'vähenevä': [' ,-. ', ' (  )', " `-' "] }[spec.moon];
      if (MO) { c2.fillStyle = cv('--fg') || '#ffffff'; var mx = W - 7 * CW - 10, my = W >= 700 ? 64 : H - 7 * CH; MO.forEach(function (l, k) { c2.fillText(l, mx, my + k * CH); }); }
    }
    // a rare single flash of lightning: drawn once, a few characters wide, never more than one per half minute
    if (spec.lightning && !bolt) {
      var now = Date.now();
      var go = forcedBolt ? (!boltDone && now - started > 1500) : (now - lastBolt > 30000 && now - started > 8000 && Math.random() < 0.0035 * nv('--bolt', 1));
      if (go) { boltDone = true; lastBolt = now; makeBolt(); try { if (Fx.boltHook) { Fx.boltHook(); } } catch (eh) { /* ignore */ } }
    }
    if (bolt) {
      bolt.t++;
      c2.fillStyle = bolt.t === 1 ? (cv('--fg') || '#ffffff') : (cv('--sun') || '#ffff00');
      bolt.cells.forEach(function (c) { c2.fillText(c.ch, c.x, c.y); });
      if (bolt.t >= 2) { bolt = null; }
    }
  }

  function makeBolt() {
    var x = Math.floor((0.1 + Math.random() * 0.8) * W / CW) * CW, y = 0, cells = [], steps = Math.floor(H / CH * 0.5), s, dir;
    for (s = 0; s < steps; s++) {
      dir = Math.floor(Math.random() * 3) - 1;
      cells.push({ x: x, y: y, ch: dir === 0 ? '|' : (dir < 0 ? '/' : '\\') });
      x += dir * CW; y += CH;
    }
    bolt = { cells: cells, t: 0 };
  }
  Fx.bolt = function () { if (!disabled) { try { makeBolt(); } catch (e) { disable(); } } };

  /* ---------- pixel moon in its real phase (age in days since the new moon) ---------- */
  Fx.moon = function (cv2, age, syn, lit, dim) {
    try {
      var N = 23, R = 10.5, ctx = cv2.getContext('2d'), p = (age % syn) / syn, x, y, nx, ny, w, on, edge, k;
      cv2.width = N; cv2.height = N;
      ctx.clearRect(0, 0, N, N);
      for (y = 0; y < N; y++) {
        for (x = 0; x < N; x++) {
          nx = (x - (N - 1) / 2) / R; ny = (y - (N - 1) / 2) / R;
          if (nx * nx + ny * ny > 1) { continue; }
          w = Math.sqrt(1 - ny * ny);
          if (p < 0.5) { k = Math.cos(2 * Math.PI * p); on = nx > k * w; }
          else { k = Math.cos(2 * Math.PI * (1 - p)); on = nx < -k * w; }
          edge = nx * nx + ny * ny > 0.78;
          if (on) { ctx.fillStyle = lit; ctx.fillRect(x, y, 1, 1); }
          else if (edge) { ctx.fillStyle = dim; ctx.fillRect(x, y, 1, 1); }
        }
      }
    } catch (e) { /* no moon, the picture is still there */ }
  };
  Fx.cssVar = cv;

  /* ---------- boot: self-tests that appear line by line ---------- */
  // lines: "LABEL | RESULT" (result appears after a few dots) or plain text. opts: {skip: label of the button, stamp: closing line}
  Fx.boot = function (lines, done, opts) {
    opts = opts || {};
    var finished = false, timers = [];
    function fin() {
      if (finished) { return; }
      finished = true;
      Fx.bootEndedAt = Date.now();
      document.removeEventListener('keydown', fin, true);
      document.removeEventListener('pointerdown', onDown, true);
      var k;
      for (k = 0; k < timers.length; k++) { clearTimeout(timers[k]); }
      var b = document.getElementById('boot');
      try { if (b) { b.hidden = true; b.innerHTML = ''; } } catch (e) { /* ignore */ }
      done();
    }
    function onDown(e) { fin(e); }
    function later(fn, ms) { timers.push(setTimeout(function () { if (!finished) { try { fn(); } catch (e) { fin(); } } }, ms)); }
    try {
      var b = document.getElementById('boot');
      if (!b || disabled || reduced) { done(); return; }
      b.innerHTML = '';
      b.hidden = false;
      document.addEventListener('keydown', fin, true);
      document.addEventListener('pointerdown', onDown, true);
      var list = lines.slice(0, 10), li = 0;
      var box = document.createElement('div'); box.className = 'bootbox'; b.appendChild(box);
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'bootskip'; btn.id = 'bootskip';
      btn.textContent = opts.skip || 'OHITA TESTIT';
      btn.addEventListener('click', function (e) { e.stopPropagation(); fin(); });
      b.appendChild(btn);
      later(fin, 12500);
      var cursor = document.createElement('span');
      cursor.className = 'cursor'; cursor.setAttribute('aria-hidden', 'true');
      function nextLine() {
        if (li >= list.length) {
          if (opts.stamp) { var st = document.createElement('p'); st.className = 'bl stampline'; st.textContent = opts.stamp; box.appendChild(st); }
          later(fin, 1100); return;
        }
        var txt = list[li], parts = txt.split('|'), label = parts[0].replace(/\s+$/, ''), res = parts.length > 1 ? parts[1].replace(/^\s+/, '') : '';
        var p = document.createElement('p'); p.className = 'bl';
        var tn = document.createTextNode(''); p.appendChild(tn); p.appendChild(cursor); box.appendChild(p);
        var ci = 0, dots = 0, nd = res ? 3 + (li % 4) : 0;
        li++;
        (function typeStep() {
          ci += 2;
          tn.nodeValue = label.slice(0, ci);
          if (ci < label.length) { later(typeStep, 22); return; }
          tn.nodeValue = label;
          if (!res) { later(nextLine, 520); return; }
          (function dotStep() {
            if (dots < nd) { dots++; tn.nodeValue = label + ' ' + new Array(dots + 1).join('.'); later(dotStep, 130); return; }
            tn.nodeValue = label + ' ' + new Array(nd + 1).join('.') + ' ';
            var r = document.createElement('span'); r.className = 'res';
            p.insertBefore(r, cursor);
            if (res.charAt(0) === '~') { // the sign switches on letter by letter
              var word = res.slice(1), wi = 0;
              (function lit() { wi++; r.textContent = word.slice(0, wi); if (wi < word.length) { later(lit, 70); } else { later(nextLine, 380); } })();
            } else { r.textContent = res; later(nextLine, 380); }
          })();
        })();
      }
      nextLine();
    } catch (e) { fin(); }
  };

  window.PaitaFx = Fx;
})();
