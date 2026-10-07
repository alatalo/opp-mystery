/* Oulun Paitapaino v2 - the game engine.
   Loads tarina.txt, resolves variants ("galaxy positions"), splits scenes into beats that fit the screen, types them
   out, handles hash routing, detours, the note form and the fallbacks. ES5 on purpose (old Safari).
   Rule: decoration (js/fx.js) may fail silently; the story and the contact details may not. */
(function () {
  'use strict';
  var P = window.Paita;
  var cfg = P.config;
  var G = P.galaksi, S = P.story;
  var Fx = window.PaitaFx || null;
  // every call into the decoration layer is guarded: an exception there turns the effects off, never the story
  function fx(name, a, b) {
    if (!Fx) { return; }
    try { return Fx[name](a, b); } catch (e) { try { Fx.disable(); } catch (e2) { /* ignore */ } Fx = null; }
  }
  var START = 'alku';
  var pageLoaded = Date.now();
  var $ = function (id) { return document.getElementById(id); };

  var app = $('app'), stage = $('stage'), titleEl = $('otsikko'), beat = $('beat'), asidePanel = $('aside'),
    prevBtn = $('prev'), formHold = $('formhold'), form = $('lappu-form');

  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = !!(mq && mq.matches);
  if (mq && mq.addEventListener) { mq.addEventListener('change', function () { reduced = mq.matches; fx('setReduced', reduced); }); }
  else if (mq && mq.addListener) { mq.addListener(function () { reduced = mq.matches; fx('setReduced', reduced); }); }
  fx('setReduced', reduced);

  var report = { scrollingChoices: [], tooTall: [], errors: [] };
  P.report = report;

  /* ---------- texts ---------- */
  var DEFAULT_TEXTS = {
    'jatka': 'JATKA', 'takaisin': 'Edellinen ruutu', 'ohita': 'OHITA', 'lisatieto': 'Lisätieto', 'piilota lisatieto': 'Piilota lisätieto',
    'tylsa': 'En jaksa pelata', 'tietosuoja': 'Tietosuoja', 'galaksi': 'Galaksin asennot',
    'lomake nimi': 'Nimi', 'lomake klaani': 'Klaani (valinnainen)', 'lomake yhteys': 'Sähkeosoite tai puhelin', 'lomake viesti': 'Viesti',
    'lomake nappi': 'JÄTÄ VIESTI', 'lomake peruuta': 'Ei sittenkään',
    'tulos ok': 'Lappu on oven välissä. Joku, kuka tahansa, löytää sen.',
    'tulos virhe': 'Tuuli vei lapun. Yritä uudestaan tai soita karmiin kaiverrettuun numeroon.',
    'tulos virhe ilman puhelinta': 'Tuuli vei lapun. Yritä uudestaan tai kirjoita sähke suoraan paperin kulmassa olevaan osoitteeseen.',
    'tulos puuttuu': 'Lapusta puuttuu jotain. Nimi, yhteystieto ja viesti tarvitaan.',
    'tulos nopea': 'Raapustat liian nopeasti. Hahmo epäilee jotain. Odota hetki ja yritä uudestaan.',
    'tulos posti': 'Sähke lähtee omasta sähköpostiohjelmastasi. Paina siellä lähetä.',
    'tulos posti uudelleen': 'Ei auennut? Avaa sähke uudelleen.',
    'varakohtaus': 'Tarina ei ladannut. Asiat ovat silti tässä.',
    'kartta sumussa': 'Kartta on sumussa. Osoite ja reitti ovat silti tässä.',
    'kartta ladataan': 'Kartta piirtyy_',
    'reitti perille': 'Reitti perille',
    'hahmo ladataan': 'LADATAAN HAHMOA'
  };
  var texts = {};
  function T(key) { return texts[key] !== undefined && texts[key] !== '' ? texts[key] : (DEFAULT_TEXTS[key] || ''); }

  /* ---------- memory (session + visitor); every access may throw (private mode) ---------- */
  var mem = { seen: {}, flags: {}, detours: {}, returning: false, seed: null, booted: false };
  (function () {
    var s = null;
    try { s = JSON.parse(sessionStorage.getItem('paita.s') || 'null'); } catch (e) { s = null; }
    if (s && s.seed) { mem = s; mem.seen = mem.seen || {}; mem.flags = mem.flags || {}; mem.detours = mem.detours || {}; return; }
    mem.seed = String(Math.floor(Math.random() * 1000000000));
    try {
      var v = JSON.parse(localStorage.getItem('paita.v') || 'null');
      mem.returning = !!(v && v.n > 0);
      localStorage.setItem('paita.v', JSON.stringify({ n: (v && v.n ? v.n : 0) + 1, t: Date.now() }));
    } catch (e2) { mem.returning = false; }
  })();
  function save() { try { sessionStorage.setItem('paita.s', JSON.stringify(mem)); } catch (e) { /* memory only */ } }
  save();

  var PARAMS = {};
  ['kuu', 'aika', 'valo', 'aurinko', 'paiva', 'kausi', 'auki', 'palaava', 'siemen', 'nahty', 'arpa'].forEach(function (k) {
    var v = P.param(k); if (v !== null) { PARAMS[k] = v; }
  });
  var FORCED = {};
  (function () {
    var f = P.param('pakota');
    if (!f) { return; }
    f.split(',').forEach(function (x) { var m = /^(.+):(\d+)$/.exec(x); if (m) { FORCED[m[1]] = parseInt(m[2], 10); } });
  })();

  function ctxFor(sceneId) {
    var pr = {}, k;
    for (k in PARAMS) { pr[k] = PARAMS[k]; }
    return G.context({ params: pr, mem: mem, scene: sceneId || '' });
  }

  /* ---------- story loading ---------- */
  var story = null;
  var FALLBACK_STORY = [
    '== alku', 'OTSIKKO: Asiat tässä', '', '{tilanne}', '', 'Pikisaarentie 15', '',
    '> Kirjoitat sähkeen: {sähköposti} -> sähkö', '', '> Soitat: {puhelin} -> puhelin', '', '> Reitti perille -> reitti', '',
    '> En jaksa pelata -> https://oulunpaitapaino.fi/tylsa.html'
  ].join('\n');

  function loadStory(cb) {
    var done = false;
    function fin(text, failed) {
      if (done) { return; }
      done = true;
      var st = null;
      try { if (text !== null) { st = S.parse(text); } } catch (e) { report.errors.push('parse: ' + e.message); st = null; }
      if (!st || !st.scenes[START]) {
        try { st = S.parse(FALLBACK_STORY); st.fallback = true; st.failed = true; } catch (e2) { st = null; }
      }
      cb(st, failed);
    }
    function xhr() {
      try {
        var r = new XMLHttpRequest();
        r.open('GET', 'tarina.txt?v=' + Date.now());
        r.onload = function () { if (r.status >= 200 && r.status < 300 && r.responseText) { fin(r.responseText); } else { fin(null, true); } };
        r.onerror = function () { fin(null, true); };
        r.send();
      } catch (e) { fin(null, true); }
    }
    // no-cache: the browser revalidates, so an edit of tarina.txt shows up without any clever steps
    if (window.fetch) {
      try {
        fetch('tarina.txt', { cache: 'no-cache' }).then(function (r) {
          if (!r.ok) { throw new Error('http ' + r.status); }
          return r.text();
        }).then(function (t) { fin(t); }, function () { xhr(); });
      } catch (e) { xhr(); }
    } else { xhr(); }
    setTimeout(function () { fin(null, true); }, 10000);
  }

  /* ---------- text helpers ---------- */
  function factText(key, ctx) {
    var d = G.describe(ctx);
    switch (key) {
      case 'phone': return String(cfg.phone).replace(/ /g, '\u00a0');
      case 'email': return cfg.email;
      case 'street': return cfg.street;
      case 'postal': return cfg.postal;
      case 'openTime': return cfg.hours.open;
      case 'closeTime': return cfg.hours.close;
      case 'status': return P.statusText();
      case 'name': return cfg.name;
      case 'kuu': return d.moon;
      case 'kello': return ctx.now.h + ':' + (ctx.now.mi < 10 ? '0' : '') + ctx.now.mi;
      case 'viikonpaiva': return ctx.weekday;
      case 'aurinko': return d.sun;
      case 'valo': return d.light;
    }
    return '';
  }
  // nodes (text/fact/link) -> flat [{t:'text',s}|{t:'link',s,target}]
  function flatten(nodes, ctx) {
    var out = [], i, n, txt;
    function pushText(s) {
      if (!s) { return; }
      var l = out[out.length - 1];
      if (l && l.t === 'text') { l.s += s; } else { out.push({ t: 'text', s: s }); }
    }
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      if (n.t === 'text') { pushText(n.s); }
      else if (n.t === 'fact') { pushText(factText(n.key, ctx)); }
      else if (n.t === 'link') {
        txt = flatten(n.nodes, ctx).map(function (x) { return x.s; }).join('');
        out.push({ t: 'link', s: txt, target: n.target });
      }
    }
    return out;
  }
  function plainOf(flat) { return flat.map(function (x) { return x.s; }).join(''); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.appendChild(document.createTextNode(text)); }
    return e;
  }

  /* ---------- sentence / word splitting for auto-pagination ---------- */
  function cutSentences(str) {
    var out = [], re = /[^.!?…]*[.!?…]+["”»')]*(?:\s+|$)|[^.!?…]+$/g, m;
    while ((m = re.exec(str))) { if (m[0] === '') { break; } out.push(m[0]); }
    return out;
  }
  function sentencesOf(flat) {
    var out = [], cur = [], i, j, pieces;
    for (i = 0; i < flat.length; i++) {
      if (flat[i].t === 'link') { cur.push(flat[i]); continue; }
      pieces = cutSentences(flat[i].s);
      for (j = 0; j < pieces.length; j++) {
        cur.push({ t: 'text', s: pieces[j] });
        if (/[.!?…]["”»')]*\s*$/.test(pieces[j])) { out.push(cur); cur = []; }
      }
    }
    if (cur.length) { out.push(cur); }
    return out;
  }
  function wordsOf(flat) {
    var atoms = [], i, m, re;
    for (i = 0; i < flat.length; i++) {
      if (flat[i].t === 'link') {
        re = /\S+\s*/g;
        while ((m = re.exec(flat[i].s))) { atoms.push({ s: m[0], target: flat[i].target }); }
      } else {
        re = /\S+\s*|\s+/g;
        while ((m = re.exec(flat[i].s))) { atoms.push({ s: m[0], target: null }); }
      }
    }
    return atoms;
  }
  function atomsToFlat(atoms) {
    var out = [], i, l;
    for (i = 0; i < atoms.length; i++) {
      l = out[out.length - 1];
      if (atoms[i].target) {
        if (l && l.t === 'link' && l.target === atoms[i].target) { l.s += atoms[i].s; } else { out.push({ t: 'link', s: atoms[i].s, target: atoms[i].target }); }
      } else if (l && l.t === 'text') { l.s += atoms[i].s; } else { out.push({ t: 'text', s: atoms[i].s }); }
    }
    return out;
  }

  /* ---------- aside (tap-to-reveal joke); shown as a panel over the bottom of the text, never changes the layout ---------- */
  var asideStore = [], asideOpenBtn = null;
  function makeAsideBtn(text) {
    asideStore.push(text);
    var b = el('button', 'asidebtn');
    b.type = 'button';
    b.setAttribute('data-ai', String(asideStore.length - 1));
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', 'aside');
    b.setAttribute('aria-label', T('lisatieto'));
    var s = el('span', null, '?'); s.setAttribute('aria-hidden', 'true');
    b.appendChild(s);
    return b;
  }
  function openAside(btn) {
    closeAside();
    asidePanel.textContent = asideStore[parseInt(btn.getAttribute('data-ai'), 10)] || '';
    asidePanel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', T('piilota lisatieto'));
    asideOpenBtn = btn;
    mem.flags.asides = (mem.flags.asides || 0) + 1; save();
  }
  function closeAside() {
    if (asideOpenBtn) {
      asideOpenBtn.setAttribute('aria-expanded', 'false');
      asideOpenBtn.setAttribute('aria-label', T('lisatieto'));
      asideOpenBtn = null;
    }
    asidePanel.hidden = true;
  }

  /* ---------- rendering of blocks ---------- */
  function appendInline(parent, flat) {
    flat.forEach(function (n) {
      if (n.t === 'text') { parent.appendChild(document.createTextNode(n.s)); return; }
      var a = el('a', null, n.s), tg = n.target;
      if (tg.kind === 'scene') { a.href = '#' + tg.id; a.setAttribute('data-go', tg.id); }
      else if (tg.kind === 'url') { a.href = tg.url; a.target = '_blank'; a.rel = 'noopener'; }
      else { a.href = P.hrefFor(tg.action) || '#'; if (tg.action === 'route') { a.target = '_blank'; a.rel = 'noopener'; } }
      parent.appendChild(a);
    });
  }
  function stashForm() { if (form && form.parentNode !== formHold) { formHold.appendChild(form); } }

  function blockIsChoices(b) { return b.k === 'choices'; }
  function hasChoices(blocks) { return blocks.some(blockIsChoices); }
  function hasAsk(blocks, kind) { return blocks.some(function (b) { return b.k === 'ask' && (!kind || b.kind === kind); }); }

  function renderBlocks(blocks, opts) {
    opts = opts || {};
    stashForm();
    beat.innerHTML = '';
    beat.className = 'beat' + (opts.tight ? ' t' + opts.tight : '') + (opts.scroll ? ' scrolly' : '');
    var i, b, p, ul, li, a;
    var ctxStatic = ctxNow;
    for (i = 0; i < blocks.length; i++) {
      b = blocks[i];
      if (b.k === 'p') {
        p = el('p', 't');
        appendInline(p, b.nodes);
        if (b.aside) { p.appendChild(document.createTextNode(' ')); p.appendChild(makeAsideBtn(plainOf(flatten(b.aside, ctxStatic)))); }
        beat.appendChild(p);
      } else if (b.k === 'choices') {
        ul = el('ul', 'choices');
        b.list.forEach(function (c, idx) {
          li = el('li');
          li.style.animationDelay = (idx * 70) + 'ms';
          a = null;
          var tmp = el('span'); appendInline(tmp, [{ t: 'link', s: plainOf(c.flat), target: c.target }]);
          a = tmp.firstChild; li.appendChild(a);
          if (c.aside) { li.appendChild(makeAsideBtn(plainOf(flatten(c.aside, ctxStatic)))); }
          ul.appendChild(li);
        });
        beat.appendChild(ul);
      } else if (b.k === 'show') {
        beat.appendChild(renderShow(b));
      } else if (b.k === 'ask') {
        showAskField(b.kind);
        form.hidden = false;
        beat.appendChild(form);
        if (b.kind === 'vahvista') { form.querySelector('.formstatus').style.visibility = 'hidden'; }
      }
    }
    if (!hasChoices(blocks) && !opts.noMore) {
      var more = el('button', 'more');
      more.type = 'button';
      more.id = 'more';
      var mk = el('span', 'mk', '>'); mk.setAttribute('aria-hidden', 'true');
      more.appendChild(mk);
      more.appendChild(document.createTextNode(' ' + T('jatka')));
      beat.appendChild(more);
    }
  }

  function renderShow(b) {
    var w = b.what, d, i, p;
    if (w === 'hahmo') {
      d = el('div', 'fig flex');
      var wrap = el('div', 'figwrap');
      var img = el('img'); img.src = 'assets/img/hahmo.jpg'; img.width = 979; img.height = 1089;
      img.alt = 'ASCII-merkeistä koottu kuva: hupullinen hahmo, jonka silmät hehkuvat punaisina, ja henkarissa roikkuva t-paita.';
      wrap.appendChild(img);
      var e1 = el('i', 'eye e1'), e2 = el('i', 'eye e2');
      e1.setAttribute('aria-hidden', 'true'); e2.setAttribute('aria-hidden', 'true');
      wrap.appendChild(e1); wrap.appendChild(e2);
      d.appendChild(wrap);
      return d;
    }
    if (w === 'kortti') {
      d = el('div', 'card');
      var lines = b.lines.length ? b.lines : [[{ t: 'text', s: 'LiikE on avoinna' }], [{ t: 'text', s: 'TIISTAISTA PERJANTAIHIN' }],
        [{ t: 'text', s: 'KELLO ' + cfg.hours.open + ' - ' + cfg.hours.close }], [{ t: 'fact', key: 'status' }]];
      lines.forEach(function (ln, idx) {
        p = el('p', idx === lines.length - 1 && lines.length > 3 ? 'status' : null);
        appendInline(p, flatten(ln, ctxNow));
        d.appendChild(p);
      });
      return d;
    }
    if (w === 'kyltti') {
      d = el('p', 'sign');
      var ls = b.lines.length ? b.lines : [[{ t: 'fact', key: 'street' }], [{ t: 'fact', key: 'postal' }]];
      ls.forEach(function (ln, idx) {
        if (idx) { d.appendChild(document.createElement('br')); }
        appendInline(d, flatten(ln, ctxNow));
      });
      return d;
    }
    if (w === 'kartta') {
      d = el('div', 'mapscreen flex');
      var addr = el('p', 'mapaddr');
      addr.appendChild(document.createTextNode(cfg.street + ', ' + cfg.postal));
      d.appendChild(addr);
      var rt = el('p', 'maproute');
      var ra = el('a', null, T('reitti perille')); ra.href = P.hrefFor('route'); ra.target = '_blank'; ra.rel = 'noopener';
      rt.appendChild(ra); d.appendChild(rt);
      var box = el('div', 'mapbox');
      var fog = el('p', 'mapfog', T('kartta ladataan'));
      box.appendChild(fog);
      d.appendChild(box);
      d.setAttribute('data-map', '1');
      return d;
    }
    if (w === 'kissa') {
      d = el('div', 'catrow');
      var c = el('span', 'cat', '=^..^='); c.setAttribute('aria-hidden', 'true');
      d.appendChild(c);
      return d;
    }
    return el('div');
  }

  var ASK_Q = { nimi: 'nimi', klaani: 'klaani', yhteys: 'yhteys', viesti: 'viesti' };
  function showAskField(kind) {
    var fs = form.querySelectorAll('.field'), i;
    for (i = 0; i < fs.length; i++) { fs[i].hidden = fs[i].getAttribute('data-q') !== kind; }
    var next = $('ask-next'), send = $('ask-send');
    next.hidden = kind === 'vahvista';
    send.hidden = kind !== 'vahvista';
    var optional = kind === 'klaani';
    next.setAttribute('data-optional', optional ? '1' : '0');
    refreshNextLabel();
    form.querySelector('.formstatus').hidden = kind !== 'vahvista';
    form.className = 'note-form' + (kind === 'vahvista' ? ' last' : '');
  }
  function refreshNextLabel() {
    var next = $('ask-next');
    var kind = next.getAttribute('data-kind') || '';
    var empty = true, f = form.elements[curAskKind()];
    if (f && f.value) { empty = false; }
    next.textContent = (next.getAttribute('data-optional') === '1' && empty) ? T('ohita') : T('jatka');
  }
  function curAskKind() {
    var fs = form.querySelectorAll('.field'), i;
    for (i = 0; i < fs.length; i++) { if (!fs[i].hidden) { return fs[i].getAttribute('data-q'); } }
    return '';
  }

  /* ---------- pagination by measurement ---------- */
  var ctxNow = null;   // context of the scene being shown

  function toBlocks(items, ctx) {
    var out = [], lastChoices = null;
    items.forEach(function (it) {
      if (it.type === 'p') { lastChoices = null; out.push({ k: 'p', nodes: flatten(it.nodes, ctx), aside: it.aside }); }
      else if (it.type === 'choice') {
        if (!lastChoices) { lastChoices = { k: 'choices', list: [] }; out.push(lastChoices); }
        lastChoices.list.push({ flat: flatten(it.nodes, ctx), target: it.target, aside: it.aside });
      } else if (it.type === 'show') { lastChoices = null; out.push({ k: 'show', what: it.what, lines: it.lines || [] }); }
      else if (it.type === 'ask') { lastChoices = null; out.push({ k: 'ask', kind: it.kind }); }
    });
    return out;
  }

  function overflows() { return beat.scrollHeight > beat.clientHeight + 1; }
  function fitsBlocks(blocks, tight) {
    renderBlocks(blocks, { tight: tight || 0 });
    return !overflows();
  }
  function mkPage(blocks, tight, scroll) { return { blocks: blocks, tight: tight || 0, scroll: !!scroll, typed: false, released: false }; }

  function splitPara(b, pages) {
    var sents = sentencesOf(b.nodes), cur = [], i, trial, j;
    function pieceBlock(nodes, last) { return { k: 'p', nodes: nodes, aside: last ? b.aside : null }; }
    for (i = 0; i < sents.length; i++) {
      trial = cur.concat(sents[i]);
      if (fitsBlocks([pieceBlock(atomsToFlat(wordsOf(trial)), i === sents.length - 1)])) { cur = trial; continue; }
      if (cur.length) { pages.push(mkPage([pieceBlock(atomsToFlat(wordsOf(cur)), false)])); cur = []; }
      // a single sentence that does not fit: split at word boundaries
      if (!fitsBlocks([pieceBlock(atomsToFlat(wordsOf(sents[i])), i === sents.length - 1)])) {
        var atoms = wordsOf(sents[i]), start = 0, lo, hi, mid;
        while (start < atoms.length) {
          lo = 1; hi = atoms.length - start;
          while (lo < hi) {
            mid = Math.ceil((lo + hi) / 2);
            if (fitsBlocks([pieceBlock(atomsToFlat(atoms.slice(start, start + mid)), false)])) { lo = mid; } else { hi = mid - 1; }
          }
          var rest = start + lo >= atoms.length;
          if (rest && i < sents.length - 1) { cur = sentsToCur(atoms.slice(start)); start = atoms.length; }
          else if (rest) { pages.push(mkPage([pieceBlock(atomsToFlat(atoms.slice(start)), true)])); start = atoms.length; }
          else { pages.push(mkPage([pieceBlock(atomsToFlat(atoms.slice(start, start + lo)), false)])); start += lo; }
        }
        continue;
      }
      cur = sents[i];
    }
    if (cur.length) { pages.push(mkPage([pieceBlock(atomsToFlat(wordsOf(cur)), true)])); }
    function sentsToCur(atoms) { return atomsToFlat(atoms); }
  }

  function pageText(blocks, pages) {
    var cur = [];
    function commit() { if (cur.length) { pages.push(mkPage(cur)); cur = []; } }
    blocks.forEach(function (b) {
      if (b.k === 'p') {
        if (fitsBlocks(cur.concat([b]))) { cur.push(b); return; }
        if (cur.length) { commit(); if (fitsBlocks([b])) { cur.push(b); return; } }
        splitPara(b, pages);
        // the last piece was pushed as a page; keep following paragraphs on their own pages (simple and safe)
      } else if (b.k === 'ask') {
        var t = cur.concat([b]);
        while (!fitsBlocks(t) && t.length > 1) { pages.push(mkPage([t.shift()])); }
        if (!fitsBlocks(t)) { report.tooTall.push(ctxNow.scene + ': ask ' + b.kind); }
        cur = t; commit();
      } else {
        if (fitsBlocks(cur.concat([b]))) { cur.push(b); } else { commit(); cur.push(b); }
      }
    });
    commit();
  }

  function pageChoices(blocks, pages, id) {
    var lv;
    for (lv = 0; lv <= 2; lv++) { if (fitsBlocks(blocks, lv)) { pages.push(mkPage(blocks, lv)); return; } }
    var leads = blocks.filter(function (b) { return !blockIsChoices(b); });
    var ch = blocks.filter(blockIsChoices);
    if (leads.length) { pageText(leads, pages); }
    for (lv = 0; lv <= 2; lv++) { if (fitsBlocks(ch, lv)) { pages.push(mkPage(ch, lv)); return; } }
    pages.push(mkPage(ch, 2, true));
    report.scrollingChoices.push(id + ' @' + window.innerWidth + 'x' + window.innerHeight);
  }

  function paginate(model, id) {
    var pages = [];
    beat.style.visibility = 'hidden';
    try {
      for (var b = 0; b < model.beats.length; b++) {
        var blocks = toBlocks(model.beats[b], ctxNow);
        if (!blocks.length) { continue; }
        if (hasChoices(blocks)) { pageChoices(blocks, pages, id); break; }
        pageText(blocks, pages);
      }
    } finally { beat.style.visibility = ''; }
    return pages;
  }

  /* ---------- palette: colours and mood follow the conditions ---------- */
  function rvar(n) { return (getComputedStyle(document.documentElement).getPropertyValue(n) || '').replace(/^\s+|\s+$/g, ''); }
  function nvar(n, d) { var x = parseFloat(rvar(n)); return isNaN(x) ? d : x; }
  function rgbOf(h) { var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h); return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : null; }
  // The figure picture is white characters on #0000ff. The green channel is 1 on characters and 0 on the background, so
  // output = bg + (fg - bg) * G recolours it to any palette.
  function updateFigFilter() {
    try {
      var bg = rgbOf(rvar('--bg')), fg = rgbOf(rvar('--fg')), m = document.getElementById('figm');
      if (!bg || !fg || !m) { return; }
      var v = [], k;
      for (k = 0; k < 3; k++) { v.push('0 ' + (fg[k] - bg[k]).toFixed(4) + ' 0 0 ' + bg[k].toFixed(4)); }
      v.push('0 0 0 1 0');
      m.setAttribute('values', v.join('  '));
    } catch (e) { /* the figure keeps its own colours */ }
  }
  function applyPalette() {
    try {
      var name = G.paletteNow(), root = document.documentElement;
      if (root.getAttribute('data-paletti') !== name) {
        root.setAttribute('data-paletti', name);
        if (!reduced) { root.classList.add('palanim'); setTimeout(function () { root.classList.remove('palanim'); }, 450); }
      }
      updateFigFilter();
      fx('refresh');
    } catch (e) { /* keep the current palette */ }
  }

  /* ---------- typing (ghost text keeps the layout still while characters appear) ---------- */
  var typing = null;
  function finishTyping() { if (typing) { typing.finish(); } }

  function startTyping(done) {
    var ps = beat.querySelectorAll('p.t'), recs = [], i, w, n, list;
    for (i = 0; i < ps.length; i++) {
      list = [];
      w = document.createTreeWalker(ps[i], NodeFilter.SHOW_TEXT, null, false);
      while ((n = w.nextNode())) {
        if (!n.nodeValue || n.parentNode.className === 'asidebtn' || (n.parentNode.parentNode && n.parentNode.parentNode.className === 'asidebtn')) { continue; }
        list.push(n);
      }
      list.forEach(function (node) {
        var full = node.nodeValue, vis = document.createTextNode(''), gh = el('span', 'gh', full);
        node.parentNode.insertBefore(vis, node);
        node.parentNode.insertBefore(gh, node);
        node.parentNode.removeChild(node);
        recs.push({ vis: vis, gh: gh, full: full });
      });
    }
    if (!recs.length) { done(); return; }
    var cursor = el('span', 'cursor'); cursor.setAttribute('aria-hidden', 'true');
    beat.classList.add('typing');
    beat.setAttribute('aria-busy', 'true');
    var idx = 0, pos = 0, ended = false, t0 = null, shown = 0, raf = null, timer = null;
    var total = recs.reduce(function (s, r) { return s + r.full.length; }, 0);
    function render(count) {
      var left = count, k;
      for (k = 0; k < recs.length; k++) {
        var r = recs[k], take = Math.max(0, Math.min(left, r.full.length));
        r.vis.nodeValue = r.full.slice(0, take);
        r.gh.firstChild.nodeValue = r.full.slice(take);
        left -= take;
        if (take < r.full.length || k === recs.length - 1) {
          if (!ended && take < r.full.length) { r.gh.parentNode.insertBefore(cursor, r.gh); }
          break;
        }
      }
      for (k = k + 1; k < recs.length; k++) { recs[k].vis.nodeValue = ''; recs[k].gh.firstChild.nodeValue = recs[k].full; }
    }
    function finish() {
      if (ended) { return; }
      ended = true;
      if (raf) { cancelAnimationFrame(raf); }
      if (timer) { clearTimeout(timer); }
      recs.forEach(function (r) {
        r.vis.nodeValue = r.full;
        if (r.gh.parentNode) { r.gh.parentNode.removeChild(r.gh); }
      });
      if (cursor.parentNode) { cursor.parentNode.removeChild(cursor); }
      beat.classList.remove('typing');
      beat.removeAttribute('aria-busy');
      typing = null;
      done();
    }
    var CPS = nvar('--cps', 105);
    function frame(ts) {
      if (ended) { return; }
      if (t0 === null) { t0 = ts; }
      var count = Math.floor((ts - t0) * CPS / 1000);
      if (count >= total) { finish(); return; }
      if (count !== shown) { shown = count; render(count); }
      raf = requestAnimationFrame(frame);
    }
    typing = { finish: finish };
    render(0);
    if (window.requestAnimationFrame) { raf = requestAnimationFrame(frame); } else { finish(); }
  }

  /* ---------- the scene being shown ---------- */
  var cur = null;       // {id, kind, model, pages, idx, dest, isDetour}
  var gen = 0;
  var shownOnce = false;

  function setTitle(model, id) {
    var nodes = model.title ? flatten(model.title, ctxNow) : [{ t: 'text', s: id }];
    titleEl.textContent = plainOf(nodes);
    var us = el('span', 'us', '_'); us.setAttribute('aria-hidden', 'true');
    titleEl.appendChild(us);
    document.title = plainOf(nodes) + ' - Oulun Paitapaino';
  }

  function weatherSpec(c) {
    var dark = c.light === 'pimeä', summer = c.season === 'kesä';
    if (c.polar === 'yötön' || (summer && c.tod === 'päivä')) { return { kind: 'none', sun: c.polar === 'yötön' || c.light === 'valoisa', moon: c.moon }; }
    if (c.season === 'talvi') { return { kind: 'snow', density: dark ? 2 : 1, moon: c.moon }; }
    if (dark) { return { kind: 'rain', density: 3, lightning: true, moon: c.moon, moonArt: true }; }
    if (c.light === 'hämärä') { return { kind: 'rain', density: 2, moon: c.moon }; }
    return { kind: 'rain', density: 1, moon: c.moon };
  }

  function enterModel(kind, id, sec, dest) {
    gen++;
    finishTyping(); closeAside();
    applyPalette();
    ctxNow = ctxFor(id);
    var model = S.resolve(sec, ctxNow, FORCED);
    if (!model.beats.length) { model.beats = [[{ type: 'p', nodes: [{ t: 'text', s: '...' }] }]]; }
    // guarantee that a scene ends with a way out
    if (kind === 'scene') {
      var lastItems = model.beats[model.beats.length - 1];
      var hasCh = lastItems.some(function (i) { return i.type === 'choice'; });
      if (!hasCh) {
        model.beats.push([
          { type: 'choice', nodes: [{ t: 'text', s: 'Kirjoitat sähkeen: ' }, { t: 'fact', key: 'email' }], target: { kind: 'action', action: 'mail' } },
          { type: 'choice', nodes: [{ t: 'text', s: 'Palaa alkuun' }], target: { kind: 'scene', id: START } }
        ]);
      }
    }
    setTitle(model, id);
    cur = { id: id, kind: kind, model: model, pages: [], idx: 0, dest: dest, sec: sec };
    cur.pages = paginate(model, id);
    if (!cur.pages.length) { cur.pages = [mkPage([{ k: 'p', nodes: [{ t: 'text', s: '...' }] }])]; }
    if (kind === 'scene') { mem.seen[id] = (mem.seen[id] || 0) + 1; save(); }
    if (kind === 'detour') { mem.detours[id] = 1; save(); }
    // atmosphere
    fx('weather', model.weather ? weatherSpec(ctxNow) : null);
    showPage(0, { wipe: true, focusTitle: shownOnce });
    shownOnce = true;
  }

  var lastKey = false;
  function showPage(i, o) {
    o = o || {};
    finishTyping(); closeAside(); finishFig();
    cur.idx = i;
    var page = cur.pages[i];
    renderBlocks(page.blocks, { tight: page.tight, scroll: page.scroll });
    var isChoices = hasChoices(page.blocks);
    var isAsk = hasAsk(page.blocks);
    var isVahvista = hasAsk(page.blocks, 'vahvista');
    var more = $('more');
    var last = i === cur.pages.length - 1;
    // gate: the ask pages have their own controls; the confirm page releases the prompt after sending
    if (more) {
      more.hidden = false;
      if (isAsk && !(isVahvista && page.released)) { more.hidden = true; }
      if (last && cur.kind !== 'detour' && !isChoices) { more.hidden = true; }
    }
    prevBtn.style.visibility = i > 0 ? 'visible' : 'hidden';
    prevBtn.disabled = i === 0;
    if (o.wipe && !reduced) { retrigger(stage, 'wipe'); }
    if (o.focusTitle) { try { titleEl.focus({ preventScroll: true }); } catch (e) { titleEl.focus(); } }
    afterRender(page, isChoices, isAsk, o);
  }

  function retrigger(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }

  var figTimer = null, figRunning = false;
  function finishFig() {
    if (!figRunning) { return; }
    figRunning = false;
    clearInterval(figTimer);
    var w = beat.querySelector('.figwrap');
    if (w) { w.classList.remove('rev'); w.classList.add('done'); }
    var more = $('more');
    if (more) { more.innerHTML = ''; var mk = el('span', 'mk', '>'); mk.setAttribute('aria-hidden', 'true'); more.appendChild(mk); more.appendChild(document.createTextNode(' ' + T('jatka'))); more.classList.remove('dl'); more.disabled = false; }
  }

  function sizeFig() {
    var fig = beat.querySelector('.fig');
    if (!fig) { return; }
    var wrap = fig.querySelector('.figwrap');
    var h = fig.clientHeight, w = fig.clientWidth;
    var s = Math.min(h, w * 1089 / 979);
    if (s < 20) { s = 20; }
    wrap.style.height = Math.floor(s) + 'px';
    wrap.style.width = Math.floor(s * 979 / 1089) + 'px';
  }

  function afterRender(page, isChoices, isAsk, o) {
    var seen = page.typed || reduced || o.instant;
    var hasText = !!beat.querySelector('p.t');
    var fig = beat.querySelector('.fig');
    var moon = ctxNow.moon;
    var more = $('more');
    if (fig) {
      sizeFig();
      var wrap = fig.querySelector('.figwrap');
      wrap.className = 'figwrap ' + (moon === 'täysi' ? 'moon-full' : moon === 'uusi' ? 'moon-new' : 'moon-mid');
      if (!seen && more) {
        figRunning = true;
        wrap.classList.add('rev');
        more.classList.add('dl'); more.disabled = true;
        var pct = 0;
        more.textContent = T('hahmo ladataan') + ' 0%_';
        figTimer = setInterval(function () {
          pct += 4;
          if (pct >= 100) { finishFig(); return; }
          more.textContent = T('hahmo ladataan') + ' ' + pct + '%_';
        }, 90);
      } else { wrap.classList.add('done'); }
    }
    var mapEl = beat.querySelector('[data-map]');
    if (mapEl) { loadMap(mapEl); }
    if (beat.querySelector('.card') && !seen) { beat.classList.add('stamp'); }
    if (beat.querySelector('.catrow')) { beat.classList.add('catwalk'); }
    if (hasText && !seen) {
      beat.classList.add('hold');
      startTyping(function () { beat.classList.remove('hold'); page.typed = true; focusChoices(isChoices); });
    } else {
      page.typed = true;
      focusChoices(isChoices);
    }
    if (isAsk) {
      var f = form.elements[curAskKind()];
      if (f && !('ontouchstart' in window) && !beat.classList.contains('hold')) { setTimeout(function () { try { f.focus(); } catch (e) { /* ignore */ } }, 30); }
      else if (f) { page.pendingFocus = f; }
    }
  }
  function focusChoices(isChoices) {
    if (isChoices && lastKey) {
      var a = beat.querySelector('.choices a');
      if (a) { try { a.focus({ preventScroll: true }); } catch (e) { a.focus(); } }
    }
    var pg = cur && cur.pages[cur.idx];
    if (pg && pg.pendingFocus && !('ontouchstart' in window)) { try { pg.pendingFocus.focus(); } catch (e2) { /* ignore */ } }
  }

  /* ---------- map: the address and the route link are always there; the iframe is a bonus ---------- */
  function loadMap(d) {
    var box = d.querySelector('.mapbox');
    var fog = box.querySelector('.mapfog');
    var url = 'https://snazzymaps.com/embed/814876';
    var fail = function () { fog.textContent = T('kartta sumussa'); box.className = 'mapbox foggy'; };
    var go = function () {
      var f = el('iframe', 'map');
      f.setAttribute('title', 'Kartta: Oulun Paitapainon sijainti Pikisaaressa');
      f.setAttribute('tabindex', '-1');
      f.setAttribute('loading', 'eager');
      f.setAttribute('referrerpolicy', 'no-referrer');
      f.style.visibility = 'hidden';
      f.onload = function () { f.style.visibility = 'visible'; box.className = 'mapbox ready'; };
      f.src = url;
      box.appendChild(f);
      box.onmouseleave = function () { try { window.focus(); if (document.activeElement && document.activeElement.tagName === 'IFRAME') { document.activeElement.blur(); } } catch (e) { /* ignore */ } };
      setTimeout(function () { if (box.className.indexOf('ready') < 0) { fail(); } }, 9000);
    };
    // a network failure (offline, blocked) is detectable with a probe; a refusal page inside the frame is not, so
    // the frame stays hidden until it reports load and the box keeps its in-voice line meanwhile
    if (window.fetch) {
      try { fetch(url, { mode: 'no-cors', cache: 'force-cache' }).then(go, fail); } catch (e) { go(); }
    } else { go(); }
  }

  /* ---------- hash routing, detours ---------- */
  function hashId() {
    var h = '';
    try { h = decodeURIComponent(location.hash.replace(/^#/, '')); } catch (e) { h = ''; }
    return h;
  }
  function route(initial) {
    var h = hashId(), id;
    if (h.charAt(0) === '~') {
      var name = S.sceneId(h.slice(1)), d = null, k;
      for (k = 0; k < story.detours.length; k++) { if (story.detours[k].name === name) { d = story.detours[k]; } }
      if (d) {
        var dest = pendingDest || (d.to !== '*' && story.scenes[d.to] ? d.to : START);
        pendingDest = null;
        return enterModel('detour', d.name, d, dest);
      }
      id = START;
    } else { id = S.sceneId(h); }
    if (!story.scenes[id] || id === 'kaynnistys') { id = START; }
    if (id === 'auki' && !P.isOpen()) {
      id = START;
      try { history.replaceState(null, '', location.pathname + location.search + '#' + START); } catch (e2) { /* ignore */ }
    }
    pendingDest = null;
    enterModel('scene', id, story.scenes[id], null);
  }
  var pendingDest = null;

  function findDetour(from, to) {
    var best = null, bestSpec = -1, k, d, spec, c;
    c = ctxFor(from);
    for (k = 0; k < story.detours.length; k++) {
      d = story.detours[k];
      if (!d.beats.length) { continue; }
      if (mem.detours[d.name] && !d.repeat) { continue; }
      if (d.from !== '*' && d.from !== from) { continue; }
      if (d.to !== '*' && d.to !== to) { continue; }
      if (d.cond) { spec = G.match(d.cond, c, 'kierto.' + d.name); if (spec < 0) { continue; } } else { spec = 0; }
      if (d.from !== '*') { spec += 0.2; }
      if (d.to !== '*') { spec += 0.2; }
      if (spec > bestSpec) { best = d; bestSpec = spec; }
    }
    return best;
  }

  function leaveDetour() {
    var dest = cur.dest || START;
    try { location.replace(location.pathname + location.search + '#' + dest); } catch (e) { location.hash = dest; }
  }

  window.addEventListener('hashchange', function () { safe(function () { route(false); }); });

  /* ---------- advancing ---------- */
  function advance() {
    if (typing) { finishTyping(); return true; }
    if (figRunning) { finishFig(); return true; }
    if (!cur) { return false; }
    var page = cur.pages[cur.idx];
    var last = cur.idx === cur.pages.length - 1;
    if (hasChoices(page.blocks)) { return false; }
    if (hasAsk(page.blocks) && !(hasAsk(page.blocks, 'vahvista') && page.released)) { return false; }
    if (!last) { showPage(cur.idx + 1, {}); return true; }
    if (cur.kind === 'detour') { leaveDetour(); return true; }
    return false;
  }
  function back() { if (cur && cur.idx > 0) { showPage(cur.idx - 1, { instant: true }); } }

  document.addEventListener('click', function (e) {
    safe(function () {
      var t = e.target;
      if (!t.closest) { return; }
      var ab = t.closest('.asidebtn');
      if (ab) {
        e.preventDefault();
        if (ab === asideOpenBtn) { closeAside(); } else { openAside(ab); }
        return;
      }
      var a = t.closest('a');
      if (a) {
        var go = a.getAttribute('data-go');
        if (go) {
          closeAside();
          if (go === (cur && cur.id)) { e.preventDefault(); route(false); return; }
          var d = cur && cur.kind === 'scene' ? findDetour(cur.id, go) : null;
          if (d) { e.preventDefault(); pendingDest = go; location.hash = '~' + d.name; }
        }
        return;
      }
      if (t.closest('button, input, textarea, label, select, iframe')) {
        if (t.closest('#more')) { advance(); }
        return;
      }
      if (!asidePanel.hidden) { closeAside(); return; }
      if (t.closest('#boot')) { return; }
      if (t.closest('#app') && !t.closest('.foot')) { advance(); }
    });
  });

  document.addEventListener('keydown', function (e) {
    safe(function () {
      if (e.ctrlKey || e.metaKey || e.altKey) { return; }
      lastKey = true;
      var t = e.target, tag = t && t.tagName;
      var inField = /^(INPUT|TEXTAREA|SELECT)$/.test(tag || '');
      if (e.key === 'Escape') { closeAside(); return; }
      if (inField) { return; }
      var onLink = tag === 'A' || tag === 'BUTTON';
      if ((e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter' || e.key === 'ArrowRight') && !(onLink && e.key === 'Enter')) {
        if (tag === 'BUTTON' && t.id !== 'more' && e.key !== 'ArrowRight') { return; }
        if (tag === 'A' && e.key !== 'ArrowRight') { return; }
        if (!asidePanel.hidden) { closeAside(); e.preventDefault(); return; }
        if (advance()) { e.preventDefault(); }
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'Backspace') { if (cur && cur.idx > 0) { e.preventDefault(); back(); } return; }
      if (/^[1-9]$/.test(e.key)) {
        if (typing || !cur) { return; }
        var links = beat.querySelectorAll('.choices a');
        var pick = links[parseInt(e.key, 10) - 1];
        if (pick) { e.preventDefault(); pick.click(); }
      }
    });
  }, true);
  document.addEventListener('pointerdown', function () { lastKey = false; }, true);
  prevBtn.addEventListener('click', function (e) { e.stopPropagation(); back(); });

  /* ---------- the note form ---------- */
  function say(text, href) {
    var status = form.querySelector('.formstatus');
    status.style.visibility = 'visible';
    status.textContent = text;
    if (href) {
      status.appendChild(document.createElement('br'));
      var a = el('a', null, T('tulos posti uudelleen'));
      a.href = href; a.id = 'mailto-retry';
      status.appendChild(a);
    }
  }
  function formValues() {
    var f = form.elements;
    return { nimi: f.nimi.value.replace(/^\s+|\s+$/g, ''), klaani: f.klaani.value.replace(/^\s+|\s+$/g, ''),
      yhteys: f.yhteys.value.replace(/^\s+|\s+$/g, ''), viesti: f.viesti.value.replace(/^\s+|\s+$/g, '') };
  }
  function releaseConfirm() {
    var page = cur.pages[cur.idx];
    page.released = true;
    var more = $('more');
    if (more) { more.hidden = false; }
  }
  function gotoAsk(kind) {
    var i;
    for (i = 0; i < cur.pages.length; i++) { if (hasAsk(cur.pages[i].blocks, kind)) { showPage(i, { instant: true }); return; } }
  }
  function askNext() {
    var kind = curAskKind(), v = formValues();
    if ((kind === 'nimi' || kind === 'yhteys' || kind === 'viesti') && !v[kind]) {
      var f = form.elements[kind];
      f.classList.add('bad'); f.focus();
      setTimeout(function () { f.classList.remove('bad'); }, 700);
      return;
    }
    showPage(cur.idx + 1, {});
  }

  function submitForm() {
    var v = formValues(), f = form.elements, send = $('ask-send');
    if (!v.nimi || !v.yhteys || !v.viesti) {
      say(T('tulos puuttuu'));
      gotoAsk(!v.nimi ? 'nimi' : !v.yhteys ? 'yhteys' : 'viesti');
      return;
    }
    if (f.www.value) { say(T('tulos ok')); releaseConfirm(); return; } // honeypot: pretend, send nothing
    var elapsed = Date.now() - pageLoaded;
    if (elapsed < (cfg.minFillMs || 3000)) { say(T('tulos nopea')); return; }
    f.kesto.value = String(elapsed);
    if (cfg.formEndpoint) {
      send.disabled = true;
      fetch(cfg.formEndpoint, { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json' } })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
        .then(function (res) {
          send.disabled = false;
          if (res.ok) { say(T('tulos ok')); form.reset(); mem.flags.lahetetty = true; save(); releaseConfirm(); }
          else if (res.j && res.j.error === 'nopea') { say(T('tulos nopea')); }
          else { say(T(cfg.showPhone === false ? 'tulos virhe ilman puhelinta' : 'tulos virhe')); }
        })
        .catch(function () { send.disabled = false; say(T(cfg.showPhone === false ? 'tulos virhe ilman puhelinta' : 'tulos virhe')); });
    } else {
      var body = 'Nimi: ' + v.nimi + '\n' + (v.klaani ? 'Klaani: ' + v.klaani + '\n' : '') + 'Yhteystieto: ' + v.yhteys + '\n\n' + v.viesti;
      var url = 'mailto:' + cfg.email + '?subject=' + encodeURIComponent('Heippalappu: ' + v.nimi) + '&body=' + encodeURIComponent(body);
      say(T('tulos posti'), url);
      mem.flags.lahetetty = true; save();
      releaseConfirm();
      window.location.href = url;
    }
  }

  function wireForm() {
    form.addEventListener('submit', function (e) { e.preventDefault(); safe(submitForm); });
    $('ask-cancel').addEventListener('click', function (e) { e.preventDefault(); showPage(cur.pages.length - 1, {}); });
    $('ask-next').addEventListener('click', function (e) { e.preventDefault(); safe(askNext); });
    form.addEventListener('keydown', function (e) {
      var t = e.target;
      if (e.key !== 'Enter') { return; }
      if (t.tagName === 'INPUT' && t.name !== 'www') { e.preventDefault(); if (!$('ask-next').hidden) { safe(askNext); } else { form.dispatchEvent(new Event('submit', { cancelable: true })); } }
      else if (t.tagName === 'TEXTAREA' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); safe(askNext); }
    });
    form.addEventListener('input', refreshNextLabel);
    var f = form.elements;
    f.nimi.setAttribute('enterkeyhint', 'next'); f.klaani.setAttribute('enterkeyhint', 'next'); f.yhteys.setAttribute('enterkeyhint', 'next');
    var q = /[?&]lahetys=(\w+)/.exec(location.search);
    void q;
  }

  /* ---------- text mask for the weather layer ---------- */
  var maskRects = [];
  function updateMask() {
    maskRects.length = 0;
    var els = stage.querySelectorAll('h2, p, .choices li, .card, .sign, form, .more'), i, r;
    for (i = 0; i < els.length; i++) {
      r = els[i].getBoundingClientRect();
      if (r.width && r.height) { maskRects.push({ x: r.left - 4, y: r.top - 2, w: r.width + 8, h: r.height + 4 }); }
    }
  }

  /* ---------- viewport: 100dvh with fallbacks, on-screen keyboard ---------- */
  var resizeTimer = null;
  function setHeight() {
    var vv = window.visualViewport;
    var h = window.innerHeight;
    var top = 0;
    var active = document.activeElement;
    var typingField = active && /^(INPUT|TEXTAREA)$/.test(active.tagName);
    if (vv && typingField && vv.height < h * 0.85) { h = vv.height; top = vv.offsetTop; app.classList.add('kbd'); }
    else { app.classList.remove('kbd'); }
    app.style.height = h + 'px';
    app.style.top = top + 'px';
  }
  function onResize() {
    setHeight();
    var active = document.activeElement;
    if (active && /^(INPUT|TEXTAREA)$/.test(active.tagName)) { return; } // keyboard: do not re-paginate
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      safe(function () {
        if (!cur) { return; }
        var keepKey = pageKey(cur.pages[cur.idx]);
        finishTyping();
        cur.pages = paginate(cur.model, cur.id);
        var i, idx = 0;
        for (i = 0; i < cur.pages.length; i++) { if (pageKey(cur.pages[i]) === keepKey) { idx = i; } }
        var prevTyped = cur.pages[idx].typed;
        cur.pages.forEach(function (p) { p.typed = true; });
        void prevTyped;
        showPage(idx, { instant: true });
      });
    }, 150);
  }
  function pageKey(page) {
    var b = page.blocks[0];
    if (!b) { return ''; }
    if (b.k === 'p') { return 'p:' + plainOf(b.nodes).slice(0, 24); }
    return b.k + (b.what || b.kind || '');
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', function () { setTimeout(onResize, 200); });
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', setHeight); window.visualViewport.addEventListener('scroll', setHeight); }
  document.addEventListener('focusin', function () { setTimeout(setHeight, 50); });
  document.addEventListener('focusout', function () { setTimeout(setHeight, 50); });
  window.addEventListener('scroll', function () { if (window.pageYOffset) { window.scrollTo(0, 0); } });

  /* ---------- fallbacks ---------- */
  var panicked = false;
  function panic(why) {
    if (panicked) { return; }
    panicked = true;
    try { report.errors.push('panic: ' + why); } catch (e) { /* ignore */ }
    try { if (Fx) { Fx.disable(); } } catch (e1) { /* ignore */ }
    try {
      document.documentElement.className += ' panic';
      var h = '<h2>' + esc(T('varakohtaus')) + '</h2><p>' + esc(cfg.street) + ', ' + esc(cfg.postal) + '</p><ul class="choices">';
      h += '<li><a href="' + esc(P.hrefFor('mail')) + '">' + esc(cfg.email) + '</a></li>';
      if (cfg.showPhone !== false) { h += '<li><a href="' + esc(P.hrefFor('tel')) + '">' + esc(cfg.phone) + '</a></li>'; }
      h += '<li><a href="' + esc(P.hrefFor('route')) + '">' + esc(T('reitti perille')) + '</a></li>';
      h += '<li><a href="tylsa.html">' + esc(T('tylsa')) + '</a></li></ul>';
      var b = $('boot'); if (b) { b.hidden = true; }
      stage.innerHTML = h;
      stage.className = 'wrap panicbox';
    } catch (e2) { /* nothing more to do */ }
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
  function safe(fn) { try { return fn(); } catch (e) { try { report.errors.push(String(e && e.stack || e)); } catch (e3) { /* ignore */ } panic(e && e.message); } }
  window.addEventListener('error', function (e) {
    var f = (e && e.filename) || '';
    if (/\/js\/fx\.js/.test(f)) { try { if (Fx) { Fx.disable(); } } catch (x) { /* ignore */ } return; }
    if (/\/js\/(game|tarina|galaksi|facts)\.js/.test(f)) { panic(e.message); }
  });
  window.addEventListener('unhandledrejection', function () { /* promise errors in optional features: ignore */ });

  /* ---------- test hook (used by the test scripts and nothing else) ---------- */
  P.debug = {
    setForced: function (f) { FORCED = f || {}; },
    enter: function (kind, id, dest) {
      var sec = null, k;
      if (kind === 'detour') { for (k = 0; k < story.detours.length; k++) { if (story.detours[k].name === id) { sec = story.detours[k]; } } }
      else { sec = story.scenes[id]; }
      enterModel(kind, id, sec, dest || START);
      return cur.pages.length;
    },
    page: function (i) { showPage(i, { instant: true }); return cur.idx; },
    cur: function () { return cur ? { id: cur.id, idx: cur.idx, n: cur.pages.length, kind: cur.kind } : null; },
    story: function () { return story; }
  };

  /* ---------- start ---------- */
  function applyChrome() {
    var f = $('foot-tylsa'), t = $('foot-tietosuoja'), g = $('foot-galaksi');
    if (f) { f.textContent = T('tylsa'); }
    if (t) { t.textContent = T('tietosuoja'); }
    if (g) { g.setAttribute('aria-label', T('galaksi')); g.setAttribute('title', T('galaksi')); }
    prevBtn.setAttribute('aria-label', T('takaisin'));
    var ov = P.overrides ? P.overrides() : {}, ovp = [], ok2;
    for (ok2 in ov) { if (ov.hasOwnProperty(ok2)) { ovp.push(ok2 + '=' + ov[ok2]); } }
    var note = $('ovnote');
    if (note && ovp.length) { note.hidden = false; note.firstChild.textContent = 'ASENNOT: ' + ovp.join(' ') + ' (galaksi.html)'; note.title = ovp.join(' '); }
    var lab = { nimi: 'lomake nimi', klaani: 'lomake klaani', yhteys: 'lomake yhteys', viesti: 'lomake viesti' }, k;
    for (k in lab) {
      var inp = form.elements[k];
      inp.setAttribute('placeholder', T(lab[k]));
      var lb = form.querySelector('label[for="' + inp.id + '"]'); if (lb) { lb.textContent = T(lab[k]); }
    }
    $('ask-send').textContent = T('lomake nappi');
    $('ask-cancel').textContent = T('lomake peruuta');
    var pv = $('privacy-link'); if (pv) { pv.textContent = T('lomake tietosuoja'); }
  }

  function bootLines() {
    var def = ['OULUN PAITAPAINO KÄYNNISTYY', 'GALAKSIN ASENNOT LUETTU.'];
    try {
      var sec = story.scenes.kaynnistys;
      if (!sec) { return def; }
      var c = ctxFor('kaynnistys');
      var m = S.resolve(sec, c, FORCED), out = [];
      m.beats.forEach(function (items) { items.forEach(function (it) { if (it.type === 'p') { out.push(plainOf(flatten(it.nodes, c))); } }); });
      return out.length ? out : def;
    } catch (e) { return def; }
  }

  function begin() {
    setHeight();
    wireForm();
    var fontsReady = new Promise(function (resolve) {
      var done = false, fin = function () { if (!done) { done = true; resolve(); } };
      setTimeout(fin, 2500);
      try { if (document.fonts && document.fonts.load) { document.fonts.load('26px Silkscreen').then(fin, fin); } else { fin(); } } catch (e) { fin(); }
    });
    var storyReady = new Promise(function (resolve) {
      loadStory(function (st, failed) { story = st; texts = (st && st.texts) || {}; window.Paita.storyData = st; resolve(failed); });
    });
    Promise.all([fontsReady, storyReady]).then(function () {
      safe(function () {
        applyChrome();
        var needBoot = !mem.booted && !reduced && P.param('boot') !== '0' && !story.failed && Fx;
        mem.booted = true; save();
        var go = function () { app.classList.add('ready'); safe(function () { route(true); }); };
        if (needBoot) { var started = false; try { fx('boot', bootLines(), function () { if (!started) { started = true; go(); } }); } catch (eb) { /* ignore */ } if (!Fx && !started) { started = true; go(); } setTimeout(function () { if (!started) { started = true; go(); } }, 4200); } else { go(); }
      });
    }, function () { panic('init'); });
    // watchdog: if nothing is on screen after a while, show the facts
    setTimeout(function () { if (!cur) { panic('timeout'); } }, 12000);
  }
  if (!app || !stage || !form) { return; }
  try { begin(); } catch (e) { panic(e.message); }
})();
