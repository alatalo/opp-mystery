/* Oulun Paitapaino v3 - the game engine.
   Loads tarina.txt, resolves variants ("galaxy positions"), splits scenes into beats that fit the screen, types them
   out, handles hash routing, detours, pictures with hotspots, conversations, dice, sanity, endings, exits and the note form.
   ES5 on purpose (old Safari).
   Rule: decoration (js/fx.js) may fail silently; the story and the contact details may not. */
(function () {
  'use strict';
  var P = window.Paita;
  var cfg = P.config;
  var G = P.galaksi, S = P.story;
  var Fx = window.PaitaFx || null;
  // every call into the decoration layer is guarded: an exception there turns the effects off, never the story
  function fx(name, a, b, c) {
    if (!Fx) { return; }
    try { return Fx[name](a, b, c); } catch (e) { try { Fx.disable(); } catch (e2) { /* ignore */ } Fx = null; }
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
    'lomake nappi': 'JÄTÄ VIESTI', 'lomake peruuta': 'Ei sittenkään', 'lomake tietosuoja': 'Tietosuoja: minne lappu menee',
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
    'hahmo ladataan': 'LADATAAN HAHMOA',
    'lisaa vaihtoehtoja': 'Lisää vaihtoehtoja',
    'ohita testit': 'OHITA TESTIT',
    'leima': 'PRINTED IN PIKISAARI 1992',
    'jarki': 'JÄRKI', 'loput': 'LOPUT', 'loppu': 'LOPPU', 'loydetty': 'Löydetty', 'loppu kehote': 'Joku toinen reitti voi olla olemassa.',
    'esine lauta': 'LAUTA', 'esine kyna': 'LYIJYKYNÄ',
    'mene': 'MENE', 'sulje': 'SULJE', 'kuva ohje': 'KOSKETA', 'katso ei mitaan': 'Ei mitään erityistä.',
    'hyvasti': 'Hyvästi', 'puhut': 'Puhut: ', 'puhu otsikko': 'Puhutaan',
    'alt avaus': 'Vanha tiilitehdas yöllä märän pihan takana. Yksi ikkuna on valaistu.',
    'alt hahmo': 'ASCII-merkeistä koottu kuva: hupullinen hahmo lasin takana.',
    'alt kaytava': 'Käytävä, jonka katossa palaa loisteputki. Päässä on liian pieni oviaukko.', 'alt ovi': 'Ovi ja sen ikkuna kaarevan katoksen alla.',
    'alt leima': 'Pyöreä leima.', 'alt henkilo': 'Henkilö rintakuvana, kasvot peittyvät.', 'alt kuva': 'Kuva',
    'heitto': 'heitto', 'varavalinta sahko': 'Kirjoitat sähkeen:', 'varavalinta alkuun': 'Palaa alkuun', 'tyhja': '...'
  };
  var texts = {};
  function T(key) { return texts[key] !== undefined && texts[key] !== '' ? texts[key] : (DEFAULT_TEXTS[key] || ''); }

  /* ---------- memory (session + visitor); every access may throw (private mode); every value is checked ---------- */
  var sessionFound = {};
  var mem = { seen: {}, flags: {}, detours: {}, returning: false, seed: null, booted: false, win: 0, stage: 1, last: '', sanity: null,
    applied: {}, inv: { lauta: 1 }, found: {}, asked: {}, spotn: {}, rc: {}, away: null, exitFrom: '' };
  function isObj(x) { return x && typeof x === 'object' && !(x instanceof Array); }
  (function () {
    var s = null;
    try { s = JSON.parse(sessionStorage.getItem('paita.s') || 'null'); } catch (e) { s = null; }
    if (isObj(s) && typeof s.seed === 'string' && s.seed) {
      var k;
      for (k in { seen: 1, flags: 1, detours: 1, applied: 1, inv: 1, found: 1, asked: 1, spotn: 1, rc: 1 }) { if (isObj(s[k])) { mem[k] = s[k]; } }
      sessionFound = isObj(s.found) ? s.found : {};
      mem.returning = !!s.returning; mem.seed = s.seed; mem.booted = !!s.booted;
      mem.win = typeof s.win === 'number' ? s.win : 0; mem.stage = typeof s.stage === 'number' ? s.stage : 1;
      mem.last = typeof s.last === 'string' ? s.last : ''; mem.sanity = typeof s.sanity === 'number' ? s.sanity : null;
      mem.away = isObj(s.away) ? s.away : null; mem.exitFrom = typeof s.exitFrom === 'string' ? s.exitFrom : '';
      if (!mem.inv.lauta) { mem.inv.lauta = 1; }
    } else {
      mem.seed = String(Math.floor(Math.random() * 1000000000));
      try {
        var v = JSON.parse(localStorage.getItem('paita.v') || 'null');
        mem.returning = !!(isObj(v) && v.n > 0);
        localStorage.setItem('paita.v', JSON.stringify({ n: (isObj(v) && v.n ? v.n : 0) + 1, t: Date.now() }));
      } catch (e2) { mem.returning = false; }
    }
    // endings found are remembered across visits (localStorage). Without working storage they live in the session only.
    try {
      localStorage.setItem('paita.t', '1'); localStorage.removeItem('paita.t');
      var ef = JSON.parse(localStorage.getItem('paita.e') || 'null');
      mem.found = {};
      if (ef instanceof Array) { ef.forEach(function (id) { if (typeof id === 'string') { mem.found[id] = 1; } }); }
    } catch (e3) { mem.found = sessionFound; }
  })();
  function save() { try { sessionStorage.setItem('paita.s', JSON.stringify(mem)); } catch (e) { /* memory only */ } }
  function saveEndings() {
    try { localStorage.setItem('paita.e', JSON.stringify(Object.keys(mem.found))); } catch (e) { /* session only */ }
  }
  save();

  var PARAMS = {};
  ['kuu', 'aika', 'valo', 'aurinko', 'paiva', 'kausi', 'auki', 'palaava', 'siemen', 'nahty', 'arpa', 'hahmo', 'vuoro', 'jarki', 'kauhu'].forEach(function (k) {
    var v = P.param(k); if (v !== null) { PARAMS[k] = v; }
  });
  var FORCED = {};
  (function () {
    var f = P.param('pakota');
    if (!f) { return; }
    f.split(',').forEach(function (x) { var m = /^(.+):(\d+)$/.exec(x); if (m) { FORCED[m[1]] = parseInt(m[2], 10); } });
  })();
  var FORCE_AVAUS = P.param('avaus') === '1';
  // sanity: a seeded arbitrary start; an explicit override wins
  if (mem.sanity === null || (PARAMS.jarki && mem.flags.jarkiOv !== PARAMS.jarki)) {
    mem.sanity = G.startSanity(PARAMS.siemen || mem.seed, PARAMS.jarki);
    if (PARAMS.jarki) { mem.flags.jarkiOv = PARAMS.jarki; }
    save();
  }

  function ctxFor(sceneId, asked) {
    var pr = {}, k;
    for (k in PARAMS) { pr[k] = PARAMS[k]; }
    var c = G.context({ params: pr, mem: mem, scene: sceneId || '', asked: asked });
    if (FORCE_AVAUS && sceneId === START) { delete c.seen[START]; }
    c.yard = yardCount(c);
    return c;
  }

  // who is standing in the yard under these galaxy positions (the HAHMO lines of the start scene)
  function yardCasts(c) {
    var out = [];
    try {
      var sec = story && story.scenes[START];
      if (!sec) { return out; }
      var saved = c.scene; c.scene = START;
      var m = S.resolve(sec, c, FORCED);
      c.scene = saved;
      m.beats.forEach(function (items) { items.forEach(function (it) { if (it.type === 'cast' && story.people[it.who]) { out.push({ who: it.who, place: it.place }); } }); });
    } catch (e) { /* nobody */ }
    return out;
  }
  function yardCount(c) { return story ? yardCasts(c).length : 0; }

  /* ---------- story loading ---------- */
  var story = null;
  var FALLBACK_STORY = [
    '== alku', 'OTSIKKO: Asiat tässä', '', '{tilanne}', '', '{katu}', '', '{postinumero}', '',
    '> Kirjoitat sähkeen: {sähköposti} -> sähkö', '', '> Soitat: {puhelin} -> puhelin', '', '> Reitti perille -> reitti', '',
    '> En jaksa pelata -> tylsa.html'
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
  function endingsFound() { var n = 0, i; if (!story) { return 0; } for (i = 0; i < story.endings.length; i++) { if (mem.found[story.endings[i]]) { n++; } } return n; }
  function currentPassword(ctx) { return G.passwordFor(ctx, story && story.passwords); }
  function factText(key, ctx) {
    var d = G.describe(ctx);
    switch (key) {
      case 'phone': return String(cfg.phone).replace(/ /g, ' ');
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
      case 'jarki': return String(ctx.sanity);
      case 'salasana': return currentPassword(ctx);
      case 'instagram': return 'oulunpaitapaino';
      case 'loput': return endingsFound() + '/' + (story ? story.endings.length : 0);
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
  function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }


  /* ---------- pictures: loaded on demand, existence checked before the layout is measured ---------- */
  var imgOk = {}, imgDim = {};
  var IMG = 'assets/img/';
  function loadImg(src, cb) {
    if (imgOk[src] !== undefined) { cb(imgOk[src]); return; }
    var im = new Image(), done = false;
    function f(ok) {
      if (done) { return; }
      done = true; imgOk[src] = ok;
      if (ok) { imgDim[src] = { w: im.naturalWidth || 1, h: im.naturalHeight || 1 }; }
      cb(ok);
    }
    im.onload = function () { f(true); };
    im.onerror = function () { f(false); };
    im.src = src;
    setTimeout(function () { f(false); }, 6000);
  }
  function loadAll(list, cb) {
    var n = list.length, finished = false;
    if (!n) { cb(); return; }
    function one() { n--; if (n <= 0 && !finished) { finished = true; cb(); } }
    list.forEach(function (s) { loadImg(s, one); });
    setTimeout(function () { if (!finished) { finished = true; cb(); } }, 2500);
  }
  function portraitView() { return window.innerHeight > window.innerWidth; }
  function sceneImages(what, stageNo) {
    if (what === 'avaus' || what === 'kaytava') { return portraitView() ? [IMG + what + '-pysty.jpg', IMG + what + '.jpg'] : [IMG + what + '.jpg', IMG + what + '-pysty.jpg']; }
    if (what === 'hahmo') { return [IMG + 'hahmo-' + stageNo + '.jpg', IMG + 'hahmo.jpg']; }
    if (what === 'leima') { return [IMG + 'leima.jpg']; }
    if (what === 'ovi') { return [IMG + 'ovi.jpg']; }
    return [];
  }
  function bestImage(list) {
    var i;
    for (i = 0; i < list.length; i++) { if (imgOk[list[i]]) { return list[i]; } }
    return null;
  }
  // images a model wants (first the ones in the current orientation; the other orientation is only fetched when needed)
  function imagesOf(model, ctx) {
    var out = [], seenSrc = {};
    function add(s) { if (!seenSrc[s]) { seenSrc[s] = 1; out.push(s); } }
    model.beats.forEach(function (items) {
      items.forEach(function (it) {
        if (it.type === 'show' && (it.what === 'avaus' || it.what === 'kaytava' || it.what === 'hahmo' || it.what === 'leima' || it.what === 'ovi')) {
          var l = sceneImages(it.what, ctx.stage), i;
          for (i = 0; i < l.length; i++) { add(l[i]); if (it.what !== 'hahmo' || i === 0) { if (it.what === 'avaus' || it.what === 'kaytava') { break; } } }
        }
        if (it.type === 'show' && it.what === 'portrait' && it.person) { add(IMG + it.person.img + '.jpg'); }
        if (it.type === 'show' && it.what === 'omistaja') { add(IMG + 'omistaja.jpg'); }
        if (it.type === 'ending') { add(IMG + 'leima.jpg'); }
      });
    });
    (model.casts || []).forEach(function (c) { var p = story.people[c.who]; if (p) { add(IMG + p.img + '-koko-pieni.png'); } });
    return out;
  }

  /* ---------- hotspots, cast and conversation data of a picture ---------- */
  function spotsFor(what, ctx) {
    var pic = story.pictures[what], out = [];
    if (!pic) { return out; }
    pic.spots.forEach(function (sp) {
      if (sp.cond && G.match(sp.cond, ctx, 'kohta.' + what + '.' + sp.id) < 0) { return; }
      if (portraitView() && sp.rects.p === false) { return; }
      var r = (what === 'hahmo' && sp.rects['s' + ctx.stage]) || (portraitView() && sp.rects.p) || sp.r;
      out.push({ id: sp.id, name: sp.name, look: sp.look, looks: sp.looks, third: sp.third, action: sp.action, hidden: sp.hidden, soft: sp.soft, go: sp.go, r: r });
    });
    return out;
  }
  function castsFor(what, ctx, model) {
    var pic = story.pictures[what], out = [];
    if (!pic || !model || !model.casts) { return out; }
    model.casts.forEach(function (c) {
      var p = story.people[c.who], pl = pic.places[c.place];
      if (!p || !pl || !imgOk[IMG + p.img + '-koko-pieni.png']) { return; }
      var pos = portraitView() ? pl.p : (pl.l || pl.p);
      if (!pos) { return; }
      out.push({ who: c.who, person: p, x: pos[0], y: pos[1], h: pos[2], src: IMG + p.img + '-koko-pieni.png' });
    });
    return out;
  }
  var FIG_EYES = { 1: [[49.6, 51.9], [52.3, 51.8], 0.8], 2: [[48.3, 48.8], [53.4, 48.7], 1.2], 3: [[44.8, 53.3], [56.5, 53.1], 2], 4: [[42.2, 33.7], [60.7, 33.5], 3.2] };

  /* ---------- aside (tap-to-reveal joke); shown as a panel over the bottom of the text, never changes the layout ---------- */
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
  var asideBox = null, asideCls = '';
  function setLevel(lv) { var i; for (i = 1; i <= 4; i++) { beat.classList.remove('t' + i); } if (lv) { beat.classList.add('t' + lv); } }
  // The joke opens inside the text, right after the paragraph it belongs to (the layout tightens if needed).
  // Only when even the tightest layout has no room does it use the overlay panel, which has the same close button.
  function openAside(btn) {
    closeAside();
    var text = asideStore[parseInt(btn.getAttribute('data-ai'), 10)] || '';
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', T('piilota lisatieto'));
    asideOpenBtn = btn;
    mem.flags.asides = (mem.flags.asides || 0) + 1; save();
    var box = el('div', 'asidebox');
    box.appendChild(el('p', 'asidetext', text));
    var cl = el('button', 'asideclose', T('sulje')); cl.type = 'button'; box.appendChild(cl);
    var owner = btn.closest ? btn.closest('p, li') : null, host = owner && owner.tagName === 'LI' ? owner.parentNode : owner;
    if (host && host.parentNode) {
      asideCls = beat.className;
      host.parentNode.insertBefore(box, host.nextSibling);
      var lv, fits = !overflows();
      for (lv = 1; !fits && lv <= 4; lv++) { setLevel(lv); fits = !overflows(); }
      if (fits) { asideBox = box; return; }
      host.parentNode.removeChild(box); beat.className = asideCls;
    }
    asidePanel.textContent = '';
    asidePanel.appendChild(el('p', 'asidetext', text));
    var cl2 = el('button', 'asideclose', T('sulje')); cl2.type = 'button'; asidePanel.appendChild(cl2);
    asidePanel.hidden = false;
  }
  function closeAside() {
    if (asideOpenBtn) {
      asideOpenBtn.setAttribute('aria-expanded', 'false');
      asideOpenBtn.setAttribute('aria-label', T('lisatieto'));
      asideOpenBtn = null;
    }
    if (asideBox) { if (asideBox.parentNode) { asideBox.parentNode.removeChild(asideBox); } asideBox = null; if (asideCls) { beat.className = asideCls; } }
    asidePanel.hidden = true;
  }


  /* ---------- rendering of blocks ---------- */
  var ENDING_OF_ACTION = { tel: 'puhelin', mail: 'sahko', route: 'reitti' };
  var curExitId = '';
  function linkEl(text, tg) {
    var a = el('a', null, text);
    if (tkey(tg)) { a.setAttribute('data-k', tkey(tg)); }
    if (tg.kind === 'scene') { a.href = '#' + tg.id; a.setAttribute('data-go', tg.id); }
    else if (tg.kind === 'url') { a.href = tg.url; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-exit', tg.exit); }
    else if (tg.kind === 'exitgo') {
      a.href = story.exits[curExitId] || '#'; a.target = '_blank'; a.rel = 'noopener'; a.setAttribute('data-away', curExitId);
    }
    else if (tg.kind === 'back') { a.href = '#' + (mem.exitFrom || START); a.setAttribute('data-go', mem.exitFrom || START); }
    else if (tg.kind === 'person') { a.href = '#puhu-' + tg.id; a.setAttribute('data-go', 'puhu-' + tg.id); }
    else if (tg.kind === 'topic') { a.href = '#'; a.setAttribute('data-topic', tg.id); }
    else {
      a.href = P.hrefFor(tg.action) || '#';
      if (tg.action === 'route') { a.target = '_blank'; a.rel = 'noopener'; }
      if (ENDING_OF_ACTION[tg.action]) { a.setAttribute('data-end', ENDING_OF_ACTION[tg.action]); }
    }
    return a;
  }
  function appendInline(parent, flat) {
    flat.forEach(function (n) {
      if (n.t === 'text') { parent.appendChild(document.createTextNode(n.s)); return; }
      parent.appendChild(linkEl(n.s, n.target));
    });
  }
  function stashForm() { if (form && form.parentNode !== formHold) { formHold.appendChild(form); } }

  function blockIsChoices(b) { return b.k === 'choices'; }
  function hasChoices(blocks) { return blocks.some(blockIsChoices); }
  function hasAsk(blocks, kind) { return blocks.some(function (b) { return b.k === 'ask' && (!kind || b.kind === kind); }); }

  var picState = null;   // {sel: index of the selected hotspot or -1}
  var curSpots = [];

  function stampText(ctx) {
    var d = G.describe(ctx);
    var wd = G.WD_SHORT[ctx.dow].toUpperCase();
    return wd + ' ' + factText('kello', ctx) + '  ' + ctx.tod.toUpperCase() + '  ' + d.moon.toUpperCase() + '  ' + ctx.season.toUpperCase();
  }

  // the key that links a hotspot to the text choice with the same target
  function tkey(tg) {
    if (!tg) { return ''; }
    if (tg.kind === 'scene') { return tg.id; }
    if (tg.kind === 'person') { return 'puhu-' + tg.id; }
    if (tg.kind === 'url') { return tg.exit; }
    if (tg.kind === 'action') { return 'a:' + tg.action; }
    if (tg.kind === 'next') { return 'next'; }
    return '';
  }
  // the action button says exactly what the matching text choice says
  function spotActionLabel(sp) {
    if (!sp.go) { return ''; }
    var k = sp.key, found = '', lastChoices = null;
    if (curModel) {
      curModel.beats.forEach(function (items) {
        items.forEach(function (it) {
          if (it.type !== 'choice') { return; }
          if (!found && k !== 'next' && tkey(it.target) === k) { found = plainOf(flatten(it.nodes, ctxNow)); }
        });
        if (items.some(function (it) { return it.type === 'choice'; })) { lastChoices = items; }
      });
      if (!found && k === 'next' && lastChoices) {
        var first = lastChoices.filter(function (it) { return it.type === 'choice'; })[0];
        if (first) { found = plainOf(flatten(first.nodes, ctxNow)); }
      }
    }
    return found || sp.action || T('mene');
  }

  function renderPicture(b) {
    var ctx = ctxNow, what = b.what, srcList, src;
    if (what === 'portrait') { srcList = [IMG + b.person.img + '.jpg']; } else { srcList = sceneImages(what, ctx.stage); }
    src = bestImage(srcList);
    if (!src) {
      if (what === 'avaus') { return el('p', 'stampline', stampText(ctx)); }
      return null;
    }
    var dim = imgDim[src] || { w: 1200, h: 800 };
    var d = el('div', 'pic flex pic-' + what + (b.optional ? ' opt' : '') + (what === 'portrait' ? ' person' : ''));
    var wrap = el('div', 'picwrap'), img = el('img', 'picimg');
    wrap.setAttribute('data-w', String(dim.w)); wrap.setAttribute('data-h', String(dim.h));
    img.src = src; img.width = dim.w; img.height = dim.h;
    img.alt = what === 'portrait' ? (b.person.alt || b.person.name || T('alt henkilo')) : T('alt ' + what);
    if (b.owner) { d.className += ' owner'; }
    var fb = what === 'hahmo' && src === IMG + 'hahmo.jpg';
    if (fb) { wrap.className += ' fb s' + ctx.stage; }
    if (what === 'hahmo') { wrap.className += ' st' + ctx.stage + (ctx.moon === 'täysi' ? ' moon-full' : ctx.moon === 'uusi' ? ' moon-new' : ' moon-mid'); }
    wrap.appendChild(img);
    // decoration that lives over the picture
    if (what === 'avaus') {
      var mc = el('canvas', 'moon'); mc.width = 23; mc.height = 23; mc.setAttribute('aria-hidden', 'true');
      mc.setAttribute('data-age', ctx.moonAge.toFixed(3)); mc.setAttribute('data-full', ctx.moon === 'täysi' ? '1' : '0');
      wrap.appendChild(mc);
      var st = el('p', 'stamp', stampText(ctx)); st.setAttribute('aria-hidden', 'true'); wrap.appendChild(st);
      var win = (story.pictures.avaus && story.pictures.avaus.spots.filter(function (s) { return s.id === 'ikkuna'; })[0]) || null;
      if (win) {
        var wr = (portraitView() && win.rects.p) || win.r;
        var lamp = el('i', 'lamp' + (ctx.open ? '' : ' bad'));
        lamp.style.left = (wr[0] + wr[2] * 0.12) + '%'; lamp.style.top = (wr[1] + wr[3] * 0.12) + '%';
        lamp.style.width = (wr[2] * 0.76) + '%'; lamp.style.height = (wr[3] * 0.76) + '%';
        lamp.setAttribute('aria-hidden', 'true'); wrap.appendChild(lamp);
      }
      var chOn = ctx.chance === 'kaikki' ? true : (ctx.chance === 'ei' ? false : G.roll(ctx.seed, 'piha') < 14);
      if (chOn) { var bag = el('i', 'bag'); bag.setAttribute('aria-hidden', 'true'); wrap.appendChild(bag); }
    }
    if ((what === 'avaus' || what === 'hahmo') && ctx.spoopy) {
      var pk = el('span', 'pumpkin', ' \\|/ \n(v v)\n( W )'); pk.setAttribute('aria-hidden', 'true'); wrap.appendChild(pk);
    }
    if (what === 'hahmo') {
      var eg = fb ? [[48, 26.4 + 0.4], [55.2, 26.8], 1.6] : FIG_EYES[ctx.stage], k;
      for (k = 0; k < 2; k++) {
        var ey = el('i', 'eye e' + (k + 1)); ey.setAttribute('aria-hidden', 'true');
        ey.style.left = (eg[k][0] - eg[2] / 2) + '%'; ey.style.top = eg[k][1] + '%'; ey.style.width = eg[2] + '%'; ey.style.height = (eg[2] * 0.5) + '%';
        wrap.appendChild(ey);
      }
    }
    // standing figures: cut-outs pasted over the picture, popping in one by one
    var spots = (b.spots || []).slice(), casts = b.casts || [];
    casts.forEach(function (c, ci) {
      var ci2 = el('img', 'cast'); ci2.src = c.src; ci2.alt = ''; ci2.setAttribute('aria-hidden', 'true');
      ci2.style.left = c.x + '%'; ci2.style.bottom = (100 - c.y) + '%'; ci2.style.height = c.h + '%';
      ci2.style.animationDelay = (500 + ci * 450) + 'ms';
      wrap.appendChild(ci2);
      spots.push({ id: 'hahmo-' + c.who, name: c.person.name, look: c.person.look, looks: c.person.looks || [c.person.look], go: { kind: 'person', id: c.who },
        r: [c.x - c.h * 0.2, c.y - c.h, c.h * 0.4, c.h], cast: true, person: c.person, ar: dim.w / dim.h });
    });
    // hotspots (buttons: keyboard and touch work the same way). A tap only selects: the caption panel under the picture
    // names it, shows its look line and offers ONE action button; the action is a second, clearly labelled tap.
    // stacking order: background hotspots (furniture) lowest, then characters, then everything else (window, door win taps)
    spots.sort(function (x, y) { var d = (x.soft ? 0 : x.cast ? 1 : 2) - (y.soft ? 0 : y.cast ? 1 : 2); return d || (y.r[2] * y.r[3] - x.r[2] * x.r[3]); });
    spots.forEach(function (sp) {
      sp.key = tkey(sp.go);
      sp.label = spotActionLabel(sp);
      curSpots.push(sp);
      var bt = el('button', 'spot' + (sp.cast ? ' castspot' : '') + (sp.hidden ? ' secret' : ''));
      bt.type = 'button'; bt.setAttribute('data-si', String(curSpots.length - 1)); bt.setAttribute('data-k', sp.key || '');
      bt.setAttribute('aria-label', sp.name);
      bt.style.left = sp.r[0] + '%'; bt.style.top = sp.r[1] + '%'; bt.style.width = sp.r[2] + '%'; bt.style.height = sp.r[3] + '%';
      wrap.appendChild(bt);
    });
    d.appendChild(wrap);
    if (spots.length) {
      var panel = el('div', 'cappanel');
      panel.appendChild(el('p', 'capname', T('kuva ohje')));
      panel.appendChild(el('p', 'caplook', ''));
      var act = el('button', 'capact'); act.type = 'button'; act.hidden = true;
      panel.appendChild(act);
      d.appendChild(panel);
      picState = { sel: -1 };
      d.setAttribute('data-spots', String(spots.length));
    }
    return d;
  }

  function renderEnding(b) {
    var d = el('div', 'ending');
    var n = story.endings.indexOf(b.id) + 1, total = story.endings.length;
    var seal = bestImage(sceneImages('leima'));
    if (seal) { var si = el('img', 'enseal'); si.src = seal; si.alt = ''; si.width = 44; si.height = 44; d.appendChild(si); }
    d.appendChild(el('p', 'en1', T('loppu') + ' ' + n + '/' + total + ': ' + (story.endingNames[b.id] || b.id)));
    d.appendChild(el('p', 'en2', T('leima')));
    d.appendChild(el('p', 'en3', T('loydetty') + ' ' + endingsFoundWith(b.id) + '/' + total + '. ' + T('loppu kehote')));
    return d;
  }
  function endingsFoundWith(id) { return endingsFound() + (mem.found[id] ? 0 : 1); }

  function renderBlocks(blocks, opts) {
    opts = opts || {};
    stashForm();
    beat.innerHTML = '';
    beat.className = 'beat' + (opts.tight ? ' t' + opts.tight : '') + (opts.scroll ? ' scrolly' : '');
    curSpots = []; picState = null;
    var i, b, p, ul, li, a;
    var ctxStatic = ctxNow;
    for (i = 0; i < blocks.length; i++) {
      b = blocks[i];
      if (b.k === 'p') {
        p = el('p', 't' + (b.say ? ' say' : ''));
        appendInline(p, b.nodes);
        if (b.aside) { p.appendChild(document.createTextNode(' ')); p.appendChild(makeAsideBtn(plainOf(flatten(b.aside, ctxStatic)))); }
        beat.appendChild(p);
      } else if (b.k === 'choices') {
        ul = el('ul', 'choices');
        b.list.forEach(function (c, idx) {
          li = el('li', c.asked ? 'asked' : null);
          li.style.animationDelay = (idx * 70) + 'ms';
          var tmp = el('span'); appendInline(tmp, [{ t: 'link', s: plainOf(c.flat), target: c.target }]);
          a = tmp.firstChild; li.appendChild(a);
          if (c.aside) { li.appendChild(makeAsideBtn(plainOf(flatten(c.aside, ctxStatic)))); }
          ul.appendChild(li);
        });
        if (b.more) {
          li = el('li', 'morech'); a = el('a', null, T('lisaa vaihtoehtoja')); a.href = '#'; a.setAttribute('data-more', '1'); li.appendChild(a); ul.appendChild(li);
        }
        beat.appendChild(ul);
      } else if (b.k === 'show') {
        var sh = renderShow(b);
        if (sh) { beat.appendChild(sh); reservePanel(sh); }
      } else if (b.k === 'dice') {
        p = el('p', 'dice');
        p.appendChild(el('span', 'dl', (T('heitto ' + b.key) || (cap1(b.key) + T('heitto'))) + ': '));
        var dn = el('span', 'dn', String(b.value)); dn.setAttribute('data-v', String(b.value)); dn.setAttribute('data-key', b.key); p.appendChild(dn);
        beat.appendChild(p);
      } else if (b.k === 'ending') {
        beat.appendChild(renderEnding(b));
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
    if (w === 'hahmo' || w === 'avaus' || w === 'kaytava' || w === 'ovi' || w === 'portrait') { return renderPicture(b); }
    if (w === 'leima') {
      var ls = bestImage(sceneImages('leima'));
      if (!ls) { return el('p', 'sealtxt', T('leima')); }
      d = el('div', 'seal'); var im = el('img'); im.src = ls; im.alt = T('alt leima'); im.width = 96; im.height = 96; d.appendChild(im); return d;
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
      var ls2 = b.lines.length ? b.lines : [[{ t: 'fact', key: 'street' }], [{ t: 'fact', key: 'postal' }]];
      ls2.forEach(function (ln, idx) {
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
      var ra = el('a', null, T('reitti perille')); ra.href = P.hrefFor('route'); ra.target = '_blank'; ra.rel = 'noopener'; ra.setAttribute('data-end', 'reitti');
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
  var curModel = null;

  function isFresh(id) { return !mem.found[id] || !!(cur && cur.fresh && cur.fresh[id]); }

  // the narrator gets unreliable when sanity is very low: one word repeats (cosmetic only)
  function glitch(flat, key, ctx) {
    if (ctx.sanity >= 25) { return flat; }
    var i, words, k;
    for (i = 0; i < flat.length; i++) {
      if (flat[i].t !== 'text') { continue; }
      words = flat[i].s.split(' ');
      if (words.length < 5) { continue; }
      k = 1 + Math.floor(G.hash(ctx.seed + '|g|' + key) * (words.length - 2));
      if (words[k]) { words.splice(k, 0, words[k]); flat[i] = { t: 'text', s: words.join(' ') }; return flat; }
    }
    return flat;
  }

  function toBlocks(items, ctx) {
    var out = [], lastChoices = null, fxp = [], skipP = false;
    function push(b) { if (fxp.length) { b.fx = fxp; fxp = []; } out.push(b); }
    items.forEach(function (it) {
      if (skipP && (it.type === 'p' || it.type === 'say')) { skipP = false; return; }
      if (it.type === 'p' || it.type === 'say') { lastChoices = null; push({ k: 'p', say: it.type === 'say', nodes: glitch(flatten(it.nodes, ctx), it.line, ctx), aside: it.aside }); }
      else if (it.type === 'choice') {
        if (!lastChoices) { lastChoices = { k: 'choices', list: [] }; push(lastChoices); }
        lastChoices.list.push({ flat: flatten(it.nodes, ctx), target: it.target, aside: it.aside, asked: it.asked });
      } else if (it.type === 'show') {
        lastChoices = null;
        var sb = { k: 'show', what: it.what, lines: it.lines || [], person: it.person };
        if (it.what === 'omistaja') { sb.what = 'portrait'; sb.owner = true; sb.person = { img: 'omistaja', name: '', alt: T('alt omistaja') }; }
        if (it.what === 'avaus' || it.what === 'hahmo' || it.what === 'kaytava' || it.what === 'ovi') { sb.spots = spotsFor(it.what, ctx); sb.casts = castsFor(it.what, ctx, curModel); }
        if (it.what === 'avaus' || it.what === 'kaytava' || it.what === 'ovi') { sb.optional = true; }
        push(sb);
      }
      else if (it.type === 'ask') { lastChoices = null; push({ k: 'ask', kind: it.kind }); }
      else if (it.type === 'roll') {
        lastChoices = null;
        // the roll is an event: it tumbles the first time only; on later visits the roll and its line are left out
        if (cur && cur.skipDice && cur.skipDice[it.key]) { skipP = true; } else { push({ k: 'dice', key: it.key, value: ctx.dice(it.key) }); }
      }
      else if (it.type === 'ending') { if (isFresh(it.id)) { lastChoices = null; push({ k: 'ending', id: it.id }); } }
      else if (it.type === 'sanity') { fxp.push({ t: 'sanity', d: it.d, key: ctx.scene + ':' + it.line }); }
      else if (it.type === 'take') { fxp.push({ t: 'take', item: it.item === 'lyijykyna' ? 'kyna' : it.item }); }
    });
    if (fxp.length && out.length) { out[out.length - 1].fx = (out[out.length - 1].fx || []).concat(fxp); }
    return out;
  }

  function overflows() { return beat.scrollHeight > beat.clientHeight + 1; }
  function fitsBlocks(blocks, tight) {
    renderBlocks(blocks, { tight: tight || 0 });
    return !overflows();
  }
  function mkPage(blocks, tight, scroll) { return { blocks: blocks, tight: tight || 0, scroll: !!scroll, typed: false, released: false }; }
  var MAXLV = 4;
  function mkPageFit(blocks, from) {
    var lv;
    for (lv = from || 0; lv <= MAXLV; lv++) { if (fitsBlocks(blocks, lv)) { return mkPage(blocks, lv); } }
    report.tooTall.push((ctxNow && ctxNow.scene) + ' @' + window.innerWidth + 'x' + window.innerHeight);
    return mkPage(blocks, MAXLV);
  }

  function splitPara(b, pages) {
    var sents = sentencesOf(b.nodes), cur2 = [], i, trial, firstDone = false;
    function pieceBlock(nodes, last) {
      var pb = { k: 'p', say: b.say, nodes: nodes, aside: last ? b.aside : null };
      if (!firstDone && b.fx) { pb.fx = b.fx; }
      firstDone = true;
      return pb;
    }
    function probe(nodes, last) { return { k: 'p', say: b.say, nodes: nodes, aside: last ? b.aside : null }; }
    for (i = 0; i < sents.length; i++) {
      trial = cur2.concat(sents[i]);
      if (fitsBlocks([probe(atomsToFlat(wordsOf(trial)), i === sents.length - 1)])) { cur2 = trial; continue; }
      if (cur2.length) { pages.push(mkPage([pieceBlock(atomsToFlat(wordsOf(cur2)), false)])); cur2 = []; }
      // a single sentence that does not fit: split at word boundaries
      if (!fitsBlocks([probe(atomsToFlat(wordsOf(sents[i])), i === sents.length - 1)])) {
        var atoms = wordsOf(sents[i]), start = 0, lo, hi, mid;
        while (start < atoms.length) {
          lo = 1; hi = atoms.length - start;
          while (lo < hi) {
            mid = Math.ceil((lo + hi) / 2);
            if (fitsBlocks([probe(atomsToFlat(atoms.slice(start, start + mid)), false)])) { lo = mid; } else { hi = mid - 1; }
          }
          var rest = start + lo >= atoms.length;
          if (rest && i < sents.length - 1) { cur2 = atomsToFlat(atoms.slice(start)); start = atoms.length; }
          else if (rest) { pages.push(mkPage([pieceBlock(atomsToFlat(atoms.slice(start)), true)])); start = atoms.length; }
          else { pages.push(mkPage([pieceBlock(atomsToFlat(atoms.slice(start, start + lo)), false)])); start += lo; }
        }
        continue;
      }
      cur2 = sents[i];
    }
    if (cur2.length) { pages.push(mkPage([pieceBlock(atomsToFlat(wordsOf(cur2)), true)])); }
  }

  function pageText(blocks, pages) {
    var cb = [];
    function commit() { if (cb.length) { pages.push(mkPageFit(cb)); cb = []; } }
    var afterDice = false;
    blocks.forEach(function (b) {
      if (b.k === 'dice') { commit(); cb = [b]; afterDice = true; return; }
      if (afterDice) { afterDice = false; if (b.k === 'p') { cb.push(b); commit(); return; } commit(); }
      if (b.k === 'p') {
        if (fitsBlocks(cb.concat([b]))) { cb.push(b); return; }
        if (cb.length) { commit(); if (fitsBlocks([b])) { cb.push(b); return; } }
        splitPara(b, pages);
      } else if (b.k === 'ask') {
        var t = cb.concat([b]);
        while (!fitsBlocks(t) && t.length > 1) { pages.push(mkPageFit([t.shift()])); }
        cb = t; commit();
      } else {
        if (fitsBlocks(cb.concat([b]))) { cb.push(b); } else { commit(); cb.push(b); }
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
    for (lv = 0; lv <= MAXLV; lv++) { if (fitsBlocks(ch, lv)) { pages.push(mkPage(ch, lv)); return; } }
    // too many choices for one screen: spread them over pages ("lisää vaihtoehtoja"), never scroll
    var list = [], k, start = 0, cnt, total;
    ch.forEach(function (b) { list = list.concat(b.list); });
    total = list.length;
    while (start < total) {
      cnt = total - start;
      while (cnt > 1 && !fitsBlocks([{ k: 'choices', list: list.slice(start, start + cnt), more: start + cnt < total }], 2)) { cnt--; }
      pages.push(mkPage([{ k: 'choices', list: list.slice(start, start + cnt), more: start + cnt < total }], 2));
      start += cnt;
    }
    k = pages.length;
    report.scrollingChoices.push(id + ' paged @' + window.innerWidth + 'x' + window.innerHeight + ' (' + k + ')');
  }

  function dropPictures(blocks) { return blocks.filter(function (b) { return !(b.k === 'show' && b.optional); }); }
  function hasOptionalPic(blocks) { return blocks.some(function (b) { return b.k === 'show' && b.optional; }); }
  function paginateBeat(blocks, id) {
    var pg = [];
    if (hasChoices(blocks)) { pageChoices(blocks, pg, id); } else { pageText(blocks, pg); }
    return pg;
  }
  function paginate(model, id) {
    var pages = [];
    beat.style.visibility = 'hidden';
    try {
      for (var b = 0; b < model.beats.length; b++) {
        var blocks = toBlocks(model.beats[b], ctxNow);
        if (!blocks.length) { continue; }
        var best = paginateBeat(blocks, id);
        // a decorative picture may never make the way to a choice or to the contact details longer
        if (hasOptionalPic(blocks) && best.length > 1) {
          var alt = paginateBeat(dropPictures(blocks), id);
          if (alt.length < best.length) { best = alt; }
        }
        pages = pages.concat(best);
        if (hasChoices(blocks)) { break; }
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
      if (mem.flags.xpal && !(P.overrides && P.overrides().paletti)) { name = mem.flags.xpal; }
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
  var cur = null;       // {id, kind, model, pages, idx, dest, fresh, person}
  var gen = 0;
  var shownOnce = false;
  var pendingFresh = {};
  var pendingDest = null;

  function setTitle(model, id) {
    var nodes = model.title ? flatten(model.title, ctxNow) : [{ t: 'text', s: id }];
    titleEl.textContent = plainOf(nodes);
    var us = el('span', 'us', '_'); us.setAttribute('aria-hidden', 'true');
    titleEl.appendChild(us);
    document.title = plainOf(nodes) + ' - Oulun Paitapaino';
  }

  function weatherSpec(c) {
    var dark = c.light === 'pimeä', summer = c.season === 'kesä';
    var moonArt = !bestImage(sceneImages('avaus'));
    var leaves = c.season === 'syksy';
    if (c.polar === 'yötön' || (summer && c.tod === 'päivä')) { return { kind: 'none', sun: c.polar === 'yötön' || c.light === 'valoisa', moon: c.moon }; }
    if (c.season === 'talvi') { return { kind: 'snow', density: dark ? 2 : 1, moon: c.moon }; }
    if (dark) { return { kind: 'rain', density: 3, lightning: true, moon: c.moon, moonArt: moonArt, leaves: leaves }; }
    if (c.light === 'hämärä') { return { kind: 'rain', density: 2, moon: c.moon, leaves: leaves }; }
    return { kind: 'rain', density: 1, moon: c.moon, leaves: leaves };
  }

  // the sign: every call is optional decoration
  function logo(name, a) { try { if (window.PaitaLogo && window.PaitaLogo.enabled) { window.PaitaLogo[name](a); } } catch (e) { /* plain logo */ } }
  function showNote(text) {
    closeAside();
    var box = el('div', 'asidebox');
    box.appendChild(el('p', 'asidetext', text));
    var cl = el('button', 'asideclose', T('sulje')); cl.type = 'button'; box.appendChild(cl);
    asideCls = beat.className;
    beat.insertBefore(box, beat.firstChild);
    var lv, fits = !overflows();
    for (lv = 1; !fits && lv <= 4; lv++) { setLevel(lv); fits = !overflows(); }
    if (fits) { asideBox = box; return; }
    beat.removeChild(box); beat.className = asideCls;
    asidePanel.textContent = ''; asidePanel.appendChild(el('p', 'asidetext', text));
    var cl2 = el('button', 'asideclose', T('sulje')); cl2.type = 'button'; asidePanel.appendChild(cl2); asidePanel.hidden = false;
  }
  if (window.PaitaLogo) {
    window.PaitaLogo.onSecret = function () {
      mem.sanity = sanityClamp(mem.sanity - 1); updateHud('jarki');
      var rare = G.roll(mem.seed, 'xpal') < 12 && !mem.flags.xpal;
      if (rare) { mem.flags.xpal = 'outo'; applyPalette(); }
      save();
      showNote(rare ? T('logo x harvinainen') : T('logo x'));
    };
  }
  if (Fx) { Fx.boltHook = function () { logo('flash'); }; }

  function sanityClamp(n) { return Math.max(1, Math.min(99, n)); }

  // ---- HUD: sanity, the two things you carry, endings found ----
  var hudBlink = null;
  function updateHud(what) {
    var h = $('hud');
    if (!h) { return; }
    var j = $('hud-jarki'), l = $('hud-loput'), inv = $('hud-inv');
    if (j) { j.textContent = T('jarki') + ': ' + mem.sanity; }
    if (l && story) { l.textContent = T('loput') + ': ' + endingsFound() + '/' + story.endings.length; l.title = T('loppu kehote'); }
    if (inv) {
      var b1 = $('hud-lauta'), b2 = $('hud-kyna');
      if (b1) { b1.textContent = T('esine lauta'); b1.hidden = !mem.inv.lauta; }
      if (b2) { b2.textContent = T('esine kyna'); b2.hidden = !mem.inv.kyna; }
    }
    app.classList.toggle('low', mem.sanity < 25);
    h.hidden = false;
    if (what && !reduced) {
      var tgt = what === 'jarki' ? j : (what === 'loput' ? l : $('hud-' + what));
      if (tgt) { tgt.classList.remove('hit'); void tgt.offsetWidth; tgt.classList.add('hit'); }
    }
  }
  function applyFx(page) {
    var changed = false;
    page.blocks.forEach(function (b) {
      if (b.k === 'ending') { markEnding(b.id, true); }
      (b.fx || []).forEach(function (f) {
        var key = f.t + ':' + (f.key || f.item);
        if (mem.applied[key]) { return; }
        mem.applied[key] = 1; changed = true;
        if (f.t === 'sanity') { mem.sanity = sanityClamp(mem.sanity + f.d); updateHud('jarki'); }
        if (f.t === 'take') { mem.inv[f.item] = 1; updateHud(f.item); }
      });
    });
    if (changed) { save(); }
  }
  function markEnding(id, onPage) {
    if (!story || story.endings.indexOf(id) < 0 || mem.found[id]) { return; }
    mem.found[id] = 1;
    if (onPage && cur) { cur.fresh[id] = 1; } else { pendingFresh[id] = 1; }
    saveEndings(); save(); updateHud('loput');
  }

  function buildModel(kind, sec) {
    var model = S.resolve(sec, ctxNow, FORCED);
    if (!model.beats.length) { model.beats = [[{ type: 'p', nodes: [{ t: 'text', s: T('tyhja') }] }]]; }
    // who stands in the yard today (HAHMO lines): picture figures and one text choice each
    model.casts = [];
    if (sec.yard) { model.casts = yardCasts(ctxNow); }
    model.beats.forEach(function (items) {
      var keep = [];
      items.forEach(function (it) { if (it.type === 'cast') { if (story.people[it.who]) { model.casts.push({ who: it.who, place: it.place }); } } else { keep.push(it); } });
      items.length = 0; keep.forEach(function (k) { items.push(k); });
    });
    model.beats = model.beats.filter(function (items) { return items.length; });
    if (!model.beats.length) { model.beats = [[{ type: 'p', nodes: [{ t: 'text', s: T('tyhja') }] }]]; }
    // guarantee that a scene ends with a way out
    if (kind === 'scene') {
      var lastItems = model.beats[model.beats.length - 1];
      var hasCh = lastItems.some(function (i) { return i.type === 'choice'; });
      if (!hasCh) {
        model.beats.push([
          { type: 'choice', nodes: [{ t: 'text', s: T('varavalinta sahko') + ' ' }, { t: 'fact', key: 'email' }], target: { kind: 'action', action: 'mail' } },
          { type: 'choice', nodes: [{ t: 'text', s: T('varavalinta alkuun') }], target: { kind: 'scene', id: START } }
        ]);
      } else if (model.casts.length) {
        model.casts.forEach(function (c) {
          var pe = story.people[c.who];
          lastItems.push({ type: 'choice', nodes: [{ t: 'text', s: T('puhut').replace(/\s+$/, '') + ' ' + pe.name }], target: { kind: 'person', id: c.who } });
        });
      }
    }
    return model;
  }

  function enterModel(kind, id, sec, dest, hist) {
    var my = ++gen;
    finishTyping(); closeAside();
    applyPalette();
    if (kind === 'scene' && !hist && id === 'ikkuna' && mem.last !== 'ikkuna') { mem.win = (mem.win || 0) + 1; mem.stage = Math.min(4, mem.win); save(); }
    ctxNow = ctxFor(id);
    var model = buildModel(kind, sec);
    var imgs = imagesOf(model, ctxNow);
    var go = function () {
      if (my !== gen) { return; }
      showModel(kind, id, model, sec, dest, { hist: hist });
    };
    if (imgs.length) { loadAll(imgs, go); } else { go(); }
  }

  function showModel(kind, id, model, sec, dest, o) {
    o = o || {};
    curModel = model;
    setTitle(model, id);
    cur = { id: id, kind: kind, model: model, pages: [], idx: 0, dest: dest, sec: sec, fresh: pendingFresh, person: o.person || null, skipDice: {} };
    model.beats.forEach(function (items) { items.forEach(function (it) { if (it.type === 'roll' && mem.applied['dice:' + id + ':' + it.key]) { cur.skipDice[it.key] = true; } }); });
    pendingFresh = {};
    cur.pages = paginate(model, id);
    if (!cur.pages.length) { cur.pages = [mkPage([{ k: 'p', nodes: [{ t: 'text', s: T('tyhja') }] }])]; }
    navId[stateN()] = id;
    if (kind === 'scene' && !o.keep && !o.hist) { mem.seen[id] = (mem.seen[id] || 0) + 1; mem.last = id; save(); }
    if (kind === 'conv' && !o.keep && !o.hist) { mem.seen[id] = (mem.seen[id] || 0) + 1; save(); }
    if (kind === 'detour') { mem.detours[id] = 1; save(); }
    fx('weather', model.weather ? weatherSpec(ctxNow) : null);
    try { if (window.PaitaLogo) { window.PaitaLogo.setMood({ dark: ctxNow.light === 'pimeä', low: mem.sanity < 25, seed: mem.seed }); } } catch (el0) { /* plain logo */ }
    if (shownOnce && !o.keep && kind !== 'conv') { logo('tick'); }
    showPage((o.hist && mem.rc[id]) ? cur.pages.length - 1 : 0, { wipe: !o.keep, focusTitle: shownOnce && !o.keep, instant: !!(o.hist && mem.rc[id]) });
    shownOnce = true;
    updateMask();
  }

  var lastKey = false;
  function showPage(i, o) {
    o = o || {};
    finishTyping(); closeAside(); finishFig(); finishDice();
    cur.idx = i;
    var page = cur.pages[i];
    renderBlocks(page.blocks, { tight: page.tight, scroll: page.scroll });
    sizePics();
    var isChoices = hasChoices(page.blocks);
    if (isChoices && cur.kind === 'scene') { mem.rc[cur.id] = 1; }
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
    applyFx(page);
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
    var w = beat.querySelector('.picwrap');
    if (w) { w.classList.remove('rev'); w.classList.add('done'); }
    var more = $('more');
    if (more) { more.innerHTML = ''; var mk = el('span', 'mk', '>'); mk.setAttribute('aria-hidden', 'true'); more.appendChild(mk); more.appendChild(document.createTextNode(' ' + T('jatka'))); more.classList.remove('dl'); more.disabled = false; }
  }

  /* ---------- picture sizing, moon, hotspots ---------- */
  function sizePics() {
    var pics = beat.querySelectorAll('.pic'), i, k;
    for (i = 0; i < pics.length; i++) {
      var pic = pics[i], wrap = pic.querySelector('.picwrap');
      if (!wrap) { continue; }
      var bar = pic.querySelector('.cappanel');
      var availH = pic.clientHeight - (bar ? bar.offsetHeight + 2 : 0), availW = pic.clientWidth;
      if (pic.classList.contains('person')) { availH = Math.min(availH, 330); availW = Math.min(availW, 300); }
      var iw = parseFloat(wrap.getAttribute('data-w')) || 1, ih = parseFloat(wrap.getAttribute('data-h')) || 1;
      var sc = Math.min(availH / ih, availW / iw);
      if (!(sc > 0)) { sc = 0.05; }
      var ww = Math.floor(iw * sc), hh = Math.floor(ih * sc);
      wrap.style.width = ww + 'px'; wrap.style.height = hh + 'px';
      var stp = wrap.querySelector('.stamp'); if (stp) { stp.style.fontSize = Math.max(7, Math.min(13, Math.round(ww / 28))) + 'px'; }
      if (portraitView()) { wrap.classList.add('port'); } else { wrap.classList.remove('port'); }
      // every hotspot is at least 44 x 44 CSS pixels (the invisible hit area grows around the drawn one); then overlaps are removed:
      // a character never takes taps from another hotspot, and neighbouring hotspots split their shared zone down the middle
      var sp = wrap.querySelectorAll('.spot'), items = [];
      for (k = 0; k < sp.length; k++) {
        var s = curSpots[parseInt(sp[k].getAttribute('data-si'), 10)];
        if (!s) { continue; }
        var px = s.r[2] * ww / 100, py = s.r[3] * hh / 100, cx = (s.r[0] + s.r[2] / 2) * ww / 100, cy = (s.r[1] + s.r[3] / 2) * hh / 100;
        var w2 = Math.min(Math.max(px, 44), ww), h2 = Math.min(Math.max(py, 44), hh);
        var l2 = Math.max(0, Math.min(ww - w2, cx - w2 / 2)), t2 = Math.max(0, Math.min(hh - h2, cy - h2 / 2));
        items.push({ el: sp[k], cast: !!s.cast, soft: !!s.soft, l: l2, t: t2, r: l2 + w2, b: t2 + h2, cx: cx, cy: cy });
      }
      resolveHits(items);
      // squeezed sideways (a window next to a door): make up for it in height so the tap area stays comfortable
      for (k = 0; k < items.length; k++) {
        var q = items[k], qw = q.r - q.l, qh = q.b - q.t;
        if (q.soft || q.cast || qw >= 44 || qw * qh >= 44 * 44) { continue; }
        var want = Math.min(hh, Math.ceil(44 * 44 / Math.max(qw, 1))), grow = (want - qh) / 2, test = { l: q.l, r: q.r, t: Math.max(0, q.t - grow), b: Math.min(hh, q.b + grow) }, clash = false, m2;
        for (m2 = 0; m2 < items.length; m2++) { if (m2 !== k && !items[m2].soft && !items[m2].cast && hitOverlap(test, items[m2])) { clash = true; } }
        if (!clash) { q.t = test.t; q.b = test.b; }
      }
      resolveHits(items);
      for (k = 0; k < items.length; k++) {
        var it = items[k];
        it.el.style.left = it.l + 'px'; it.el.style.top = it.t + 'px'; it.el.style.width = Math.max(1, it.r - it.l) + 'px'; it.el.style.height = Math.max(1, it.b - it.t) + 'px';
      }
    }
  }
  // one hotspot lying (almost) entirely inside another (a small thing on a door): the small one is drawn later and wins inside it
  function nested(a, b) {
    var ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    if (ox <= 0 || oy <= 0) { return false; }
    var sa = (a.r - a.l) * (a.b - a.t), sb = (b.r - b.l) * (b.b - b.t);
    return ox * oy >= 0.85 * Math.min(sa, sb);
  }
  function hitOverlap(a, b) { return Math.min(a.r, b.r) > Math.max(a.l, b.l) && Math.min(a.b, b.b) > Math.max(a.t, b.t); }
  function cutApart(keep, cut, both) {
    var ox = Math.min(keep.r, cut.r) - Math.max(keep.l, cut.l), oy = Math.min(keep.b, cut.b) - Math.max(keep.t, cut.t);
    if (ox <= oy) {
      if (both) { var mx = ((keep.cx < cut.cx) ? (keep.r + cut.l) : (keep.l + cut.r)) / 2; if (keep.cx < cut.cx) { keep.r = mx; cut.l = mx; } else { keep.l = mx; cut.r = mx; } }
      else if (cut.cx < keep.cx) { cut.r = keep.l; } else { cut.l = keep.r; }
    } else {
      if (both) { var my = ((keep.cy < cut.cy) ? (keep.b + cut.t) : (keep.t + cut.b)) / 2; if (keep.cy < cut.cy) { keep.b = my; cut.t = my; } else { keep.t = my; cut.b = my; } }
      else if (cut.cy < keep.cy) { cut.b = keep.t; } else { cut.t = keep.b; }
    }
  }
  function resolveHits(items) {
    var i, j;
    for (i = 0; i < items.length; i++) { if (!items[i].cast) { continue; } for (j = 0; j < items.length; j++) { if (!items[j].cast && !items[j].soft && hitOverlap(items[i], items[j]) && !nested(items[i], items[j])) { cutApart(items[j], items[i], false); } } }
    for (i = 0; i < items.length; i++) { for (j = i + 1; j < items.length; j++) { if (!items[i].soft && !items[j].soft && hitOverlap(items[i], items[j]) && !nested(items[i], items[j])) { cutApart(items[i], items[j], true); } } }
  }
  function rgba(hex, a) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    return m ? 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')' : hex;
  }
  function drawMoons() {
    var cs = beat.querySelectorAll('canvas.moon'), i;
    for (i = 0; i < cs.length; i++) {
      var full = cs[i].getAttribute('data-full') === '1';
      fx('moon', cs[i], parseFloat(cs[i].getAttribute('data-age')), G.SYN, rvar(full ? '--eye' : '--head') || '#ffff00', rgba(rvar('--fg') || '#ffffff', 0.45));
    }
  }
  var revealTimer = null;
  function revealSpots(page) {
    var pw = beat.querySelector('.pic .picwrap');
    if (!pw || !beat.querySelector('.spot')) { return; }
    var pic = pw.parentNode;
    if (page.revealed) { return; }
    page.revealed = true;
    pic.classList.add('reveal');
    clearTimeout(revealTimer);
    revealTimer = setTimeout(function () { pic.classList.remove('reveal'); }, reduced ? 2600 : 2200);
  }
  // ---- selection: the caption panel always has the height of its longest content, so nothing shifts or is covered ----
  function lookFor(sp, n) {
    if (n === 3 && sp.third) { return sp.third; }
    var l = sp.looks && sp.looks.length ? sp.looks : [sp.look];
    return l[(n - 1) % l.length] || sp.look || T('katso ei mitaan');
  }
  function fillPanel(panel, sp, text) {
    var nm = panel.querySelector('.capname'), lk = panel.querySelector('.caplook'), ab = panel.querySelector('.capact');
    if (!sp) { nm.textContent = T('kuva ohje'); lk.textContent = ''; ab.hidden = true; return; }
    nm.textContent = sp.name;
    lk.textContent = text || sp.look || T('katso ei mitaan');
    if (sp.go) { ab.hidden = false; ab.textContent = '> ' + sp.label; } else { ab.hidden = true; }
  }
  function reservePanel(pic) {
    var panel = pic.querySelector('.cappanel');
    if (!panel) { return; }
    var i, max = 0;
    panel.style.height = 'auto';
    var mine = pic.querySelectorAll('.spot');
    fillPanel(panel, null); max = panel.offsetHeight;
    for (i = 0; i < mine.length; i++) {
      var s = curSpots[parseInt(mine[i].getAttribute('data-si'), 10)], j, alts = (s.looks || []).concat(s.third ? [s.third] : []);
      fillPanel(panel, s); if (panel.offsetHeight > max) { max = panel.offsetHeight; }
      for (j = 0; j < alts.length; j++) { fillPanel(panel, s, alts[j]); if (panel.offsetHeight > max) { max = panel.offsetHeight; } }
    }
    fillPanel(panel, null);
    panel.style.height = max + 'px';
    pic.style.setProperty('--panelh', max + 'px');
  }
  function setSelection(idx) {
    if (!picState) { return; }
    var pic = beat.querySelector('.pic[data-spots]'), i;
    if (!pic) { return; }
    picState.sel = idx;
    if (idx >= 0) { logo('react'); }
    var sp = idx >= 0 ? curSpots[idx] : null, txt = '';
    if (sp) { var cnt = mem.spotn[sp.id] = (mem.spotn[sp.id] || 0) + 1; txt = lookFor(sp, cnt); save(); }
    fillPanel(pic.querySelector('.cappanel'), sp, txt);
    var all = pic.querySelectorAll('.spot');
    for (i = 0; i < all.length; i++) { all[i].classList.toggle('sel', parseInt(all[i].getAttribute('data-si'), 10) === idx); }
    // the matching text choice lights up
    var lis = beat.querySelectorAll('.choices li');
    for (i = 0; i < lis.length; i++) { lis[i].classList.remove('hl'); }
    if (sp && sp.key) {
      var as = beat.querySelectorAll('.choices a');
      for (i = 0; i < as.length; i++) { if (as[i].getAttribute('data-k') === sp.key) { as[i].parentNode.classList.add('hl'); } }
    }
  }
  function outlineSpot(key, on) {
    var sps = beat.querySelectorAll('.spot'), i;
    for (i = 0; i < sps.length; i++) { if (key && sps[i].getAttribute('data-k') === key) { sps[i].classList.toggle('on', on); } }
  }
  function followTarget(tg) {
    if (!tg) { return; }
    if (tg.kind === 'scene') { var fake = { id: tg.id }; goScene(fake.id); }
    else if (tg.kind === 'person') { goScene('puhu-' + tg.id); }
    else if (tg.kind === 'url') { exitVia(tg.exit); }
    else if (tg.kind === 'action') {
      var h = P.hrefFor(tg.action);
      if (ENDING_OF_ACTION[tg.action] && !mem.found[ENDING_OF_ACTION[tg.action]]) { endClick(ENDING_OF_ACTION[tg.action]); }
      if (tg.action === 'route') { window.open(h, '_blank', 'noopener'); } else if (h) { window.location.href = h; }
    }
    else if (tg.kind === 'next') { var a = beat.querySelector('.choices a'); if (a) { a.click(); } else { advance(); } }
  }
  function spotAct(btn) {
    var idx = parseInt(btn.getAttribute('data-si'), 10);
    if (!curSpots[idx]) { return; }
    closeAside();
    setSelection(picState && picState.sel === idx ? -1 : idx);
  }
  /* ---------- history: one rule. Back goes to the previous SCENE (its choices screen if the visitor had reached it).
     Transient screens (detour beats, conversations, exit beats, return lines, ending screens) are replaced, never left behind in the history. ---------- */
  var navId = [];
  function stateN() { var s = null; try { s = history.state; } catch (e) { s = null; } return s && typeof s.n === 'number' ? s.n : 0; }
  function isTransient(c) { return !!c && (c.kind === 'detour' || c.kind === 'conv' || /^(ulos-|paluu|loppu-)/.test(c.id)); }
  var routedHref = '';
  function nav(id, mode) {
    var url = location.pathname + location.search + '#' + id;
    try {
      if (mode === 'replace') { history.replaceState({ n: stateN() }, '', url); } else { history.pushState({ n: stateN() + 1 }, '', url); }
    } catch (e) { location.hash = id; return; }
    route(false, false);
  }
  function goTo(id) {
    if (isTransient(cur)) {
      if (stateN() > 0 && navId[stateN() - 1] === id) { history.back(); return; }
      nav(id, 'replace'); return;
    }
    nav(id, 'push');
  }
  function goScene(id) {
    closeAside();
    var d = cur && cur.kind === 'scene' && !isTransient(cur) ? findDetour(cur.id, id) : null;
    if (id === (cur && cur.id)) { route(false, false); return; }
    if (d) { pendingDest = id; goTo('~' + d.name); } else { goTo(id); }
  }
  function exitVia(exitId) {
    if (!story.scenes.ulos && !story.scenes[exitId]) { window.open(story.exits[exitId], '_blank', 'noopener'); return; }
    mem.exitFrom = cur && cur.kind === 'scene' ? cur.id : START; save();
    goTo(exitId);
  }
  function endClick(id) {
    markEnding(id, false);
    if (story.scenes['loppu-' + id]) { setTimeout(function () { safe(function () { goTo('loppu-' + id); }); }, 150); }
  }
  /* ---------- dice: a stepped roll, then the narrator reads the result ---------- */
  var diceRun = null;
  function finishDice() { if (diceRun) { diceRun.finish(); } }
  function rollAnim(node, done) {
    var final = node.getAttribute('data-v'), steps = 0, timer = null, ended = false;
    function finish() {
      if (ended) { return; }
      ended = true; clearInterval(timer); node.textContent = final; node.className = 'dn set'; diceRun = null;
      if (cur) { mem.applied['dice:' + cur.id + ':' + (node.getAttribute('data-key') || '')] = 1; save(); }
      done();
    }
    diceRun = { finish: finish };
    logo('react');
    node.className = 'dn rolling';
    timer = setInterval(function () {
      steps++;
      if (steps >= 16) { finish(); return; }
      node.textContent = String(1 + Math.floor(Math.random() * 20));
    }, 95);
  }

  function afterRender(page, isChoices, isAsk, o) {
    var seen = page.typed || reduced || o.instant;
    var hasText = !!beat.querySelector('p.t');
    var wrap = beat.querySelector('.pic-hahmo .picwrap');
    var more = $('more');
    drawMoons();
    revealSpots(page);
    if (beat.querySelector('.pic.owner')) { logo('react'); }
    if (wrap && !seen && more && false) { /* the old line-by-line reveal is not used for the new pictures */ }
    var mapEl = beat.querySelector('[data-map]');
    if (mapEl) { loadMap(mapEl); }
    if (beat.querySelector('.card') && !seen) { beat.classList.add('stamp'); }
    if (beat.querySelector('.catrow')) { beat.classList.add('catwalk'); }
    var dn = beat.querySelector('.dice .dn');
    var content = function () {
      beat.classList.remove('rollhold');
      if (hasText && !seen) {
        beat.classList.add('hold');
        startTyping(function () { beat.classList.remove('hold'); page.typed = true; focusChoices(isChoices); updateMask(); });
      } else {
        page.typed = true;
        focusChoices(isChoices);
      }
    };
    if (dn && !seen) { if (hasText) { beat.classList.add('hold'); beat.classList.add('rollhold'); } rollAnim(dn, content); } else { content(); }
    if (isAsk) {
      var f = form.elements[curAskKind()];
      if (f && !('ontouchstart' in window) && !beat.classList.contains('hold')) { setTimeout(function () { try { f.focus(); } catch (e) { /* ignore */ } }, 30); }
      else if (f) { page.pendingFocus = f; }
    }
    updateMask();
  }
  function focusChoices(isChoices) {
    if (isChoices && lastKey) {
      var a = beat.querySelector('.choices a');
      if (a) { try { a.focus({ preventScroll: true }); } catch (e) { a.focus(); } }
    }
    var pg = cur && cur.pages[cur.idx];
    if (pg && pg.pendingFocus && !('ontouchstart' in window)) { try { pg.pendingFocus.focus(); } catch (e2) { /* ignore */ } }
  }

  /* ---------- conversation: a close-up of the person, topics instead of sentences ---------- */
  function enterConv(personId, line, hist) {
    var pe = story.people[personId];
    if (!pe) { nav(START, 'replace'); return; }
    var my = ++gen;
    finishTyping(); closeAside();
    applyPalette();
    var asked = mem.asked[personId] = mem.asked[personId] || {};
    ctxNow = ctxFor('puhu-' + personId, asked);
    var items = [];
    var greet = line !== undefined ? line : (pe.greeting || '');
    items.push({ type: 'show', what: 'portrait', person: pe, line: 0 });
    if (greet) { items.push({ type: 'say', nodes: parseLine(greet), aside: null, line: 1 }); }
    pe.topics.forEach(function (tp) {
      if (tp.cond && G.match(tp.cond, ctxNow, 'aihe.' + personId + '.' + tp.id) < 0) { return; }
      items.push({ type: 'choice', nodes: [{ t: 'text', s: tp.label }], target: { kind: 'topic', id: tp.id }, asked: !!asked[tp.id] });
    });
    items.push({ type: 'choice', nodes: [{ t: 'text', s: T('hyvasti') }], target: { kind: 'scene', id: pe.leave } });
    var model = { title: [{ t: 'text', s: pe.name || T('puhu otsikko') }], beats: [items], weather: false, casts: [] };
    var go = function () {
      if (my !== gen) { return; }
      var same = cur && cur.kind === 'conv' && cur.id === 'puhu-' + personId;
      showModel('conv', 'puhu-' + personId, model, null, START, { person: pe, keep: same && line !== undefined, hist: hist });
    };
    loadAll([IMG + pe.img + '.jpg'], go);
  }
  var FK = { 'jarki': 'jarki', 'avaus': 'openTime', 'sulkeminen': 'closeTime', 'viikonpaiva': 'viikonpaiva', 'kuu': 'kuu', 'kellonaika': 'kello', 'salasana': 'salasana', 'tilanne': 'status', 'puhelin': 'phone', 'sahkoposti': 'email', 'katu': 'street' };
  function parseLine(s) {
    var out = [], re = /\{([^{}]+)\}/g, m, p = 0;
    while ((m = re.exec(s))) {
      if (m.index > p) { out.push({ t: 'text', s: s.slice(p, m.index) }); }
      var k = FK[G.norm(m[1])];
      if (k) { out.push({ t: 'fact', key: k }); } else { out.push({ t: 'text', s: m[0] }); }
      p = m.index + m[0].length;
    }
    if (p < s.length) { out.push({ t: 'text', s: s.slice(p) }); }
    return out;
  }
  function askTopic(id) {
    if (!cur || cur.kind !== 'conv') { return; }
    var pe = cur.person, tp = null, i;
    for (i = 0; i < pe.topics.length; i++) { if (pe.topics[i].id === id) { tp = pe.topics[i]; } }
    if (!tp) { return; }
    mem.asked[pe.id] = mem.asked[pe.id] || {};
    mem.asked[pe.id][id] = 1;
    if (tp.sanity) { mem.sanity = sanityClamp(mem.sanity + tp.sanity); updateHud('jarki'); }
    save();
    enterConv(pe.id, tp.text);
  }

  /* ---------- hash routing, detours, exits ---------- */
  function hashId() {
    var h = '';
    try { h = decodeURIComponent(location.hash.replace(/^#/, '')); } catch (e) { h = ''; }
    return h;
  }
  function route(initial, hist) {
    var h = hashId(), id;
    routedHref = location.href;
    if (h.charAt(0) === '~') {
      var name = S.sceneId(h.slice(1)), d = null, k;
      for (k = 0; k < story.detours.length; k++) { if (story.detours[k].name === name) { d = story.detours[k]; } }
      if (d) {
        var dest = d.goal && story.scenes[d.goal] ? d.goal : (pendingDest || (d.to !== '*' && story.scenes[d.to] ? d.to : START));
        pendingDest = null;
        return enterModel('detour', d.name, d, dest, hist);
      }
      id = START;
    } else { id = S.sceneId(h); }
    if (id.indexOf('puhu-') === 0 && story.people[id.slice(5)]) { pendingDest = null; return enterConv(id.slice(5), undefined, hist); }
    if (id.indexOf('ulos-') === 0) {
      if (story.exits[id] && (story.scenes[id] || story.scenes.ulos)) {
        curExitId = id; pendingDest = null;
        return enterModel('scene', id, story.scenes[id] || story.scenes.ulos, null, hist);
      }
      id = START;
    }
    if (!story.scenes[id] || id === 'kaynnistys') { id = START; }
    if (id === 'auki' && !P.isOpen()) {
      id = START;
      try { history.replaceState({ n: stateN() }, '', location.pathname + location.search + '#' + START); } catch (e2) { /* ignore */ }
    }
    pendingDest = null;
    enterModel('scene', id, story.scenes[id], null, hist);
  }

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
    nav(dest, 'replace');
  }

  window.addEventListener('popstate', function () { safe(function () { route(false, true); }); });
  window.addEventListener('hashchange', function () { if (location.href !== routedHref) { safe(function () { route(false, true); }); } });

  // coming back to the tab after an exit: the game notices
  function onReturn() {
    if (!mem.away || !story || story.failed) { return; }
    if (Date.now() - mem.away.t < 1200) { return; }
    var id = mem.away.id; mem.away = null; save();
    var rid = 'paluu-' + id.slice(5);
    if (!story.scenes[rid]) { rid = 'paluu'; }
    if (!story.scenes[rid]) { return; }
    goTo(rid);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { safe(onReturn); } });
  window.addEventListener('focus', function () { safe(onReturn); });
  window.addEventListener('pageshow', function () { safe(onReturn); });

  /* ---------- advancing ---------- */
  function advance() {
    if (typing) { finishTyping(); return true; }
    if (diceRun) { finishDice(); return true; }
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
      if (Fx && Fx.bootEndedAt && Date.now() - Fx.bootEndedAt < 500) { e.preventDefault(); return; }  // the tap that closed the boot screen
      var ab = t.closest('.asidebtn');
      if (ab) {
        e.preventDefault();
        if (ab === asideOpenBtn) { closeAside(); } else { openAside(ab); }
        return;
      }
      var sp = t.closest('.spot');
      if (sp) { e.preventDefault(); spotAct(sp); return; }
      var ca = t.closest('.capact');
      if (ca) { e.preventDefault(); if (picState && picState.sel >= 0) { followTarget(curSpots[picState.sel].go); } return; }
      var acl = t.closest('.asideclose');
      if (acl) { e.preventDefault(); closeAside(); return; }
      if (t.closest('.picwrap') && picState && picState.sel >= 0) { setSelection(-1); return; }
      var a = t.closest('a');
      if (a) {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) { return; }
        if (a.getAttribute('data-more')) { e.preventDefault(); if (cur && cur.idx < cur.pages.length - 1) { showPage(cur.idx + 1, {}); } return; }
        var tp = a.getAttribute('data-topic');
        if (tp) { e.preventDefault(); askTopic(tp); return; }
        var en = a.getAttribute('data-end');
        if (en && !mem.found[en]) { endClick(en); return; }
        var away = a.getAttribute('data-away');
        if (away) { mem.away = { id: away, t: Date.now() }; save(); return; }
        var ex = a.getAttribute('data-exit');
        if (ex && (story.scenes.ulos || story.scenes[ex])) { e.preventDefault(); exitVia(ex); return; }
        var go = a.getAttribute('data-go');
        if (go) { e.preventDefault(); goScene(go); }
        return;
      }
      if (t.closest('button, input, textarea, label, select, iframe')) {
        if (t.closest('#more')) { advance(); }
        return;
      }
      if (asideBox || !asidePanel.hidden) { closeAside(); return; }
      if (t.closest('#boot')) { return; }
      if (t.closest('#app') && !t.closest('.foot') && !t.closest('.pic')) { advance(); }
    });
  });

  // a text choice and its hotspot are the same thing: pointing at (or focusing) one outlines the other
  function pairEvent(on) {
    return function (e) {
      var a = e.target && e.target.closest ? e.target.closest('.choices a') : null;
      if (a) { outlineSpot(a.getAttribute('data-k'), on); }
    };
  }
  document.addEventListener('mouseover', pairEvent(true));
  document.addEventListener('mouseout', pairEvent(false));
  document.addEventListener('focusin', pairEvent(true));
  document.addEventListener('focusout', pairEvent(false));

  document.addEventListener('keydown', function (e) {
    safe(function () {
      if (e.ctrlKey || e.metaKey || e.altKey) { return; }
      if (Fx && Fx.bootEndedAt && Date.now() - Fx.bootEndedAt < 300) { return; }
      lastKey = true;
      var t = e.target, tag = t && t.tagName;
      var inField = /^(INPUT|TEXTAREA|SELECT)$/.test(tag || '');
      if (e.key === 'Escape') { closeAside(); return; }
      if (inField) { return; }
      var onLink = tag === 'A' || tag === 'BUTTON';
      if ((e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter' || e.key === 'ArrowRight') && !(onLink && e.key === 'Enter')) {
        if (tag === 'BUTTON' && t.id !== 'more' && e.key !== 'ArrowRight') { return; }
        if (tag === 'A' && e.key !== 'ArrowRight') { return; }
        if (asideBox || !asidePanel.hidden) { closeAside(); e.preventDefault(); return; }
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
    var page = cur.pages[cur.idx], keep = cur.idx;
    // the story depends on "has sent a note": resolve the scene again so that the lines after the form appear
    try {
      ctxNow = ctxFor(cur.id);
      var model = buildModel(cur.kind, cur.sec);
      curModel = model; cur.model = model;
      var fresh = paginate(model, cur.id), i;
      for (i = 0; i < fresh.length; i++) { if (hasAsk(fresh[i].blocks, 'vahvista')) { keep = i; fresh[i].released = true; fresh[i].typed = true; } else { fresh[i].typed = true; } }
      cur.pages = fresh;
      showPage(keep, { instant: true });
      form.querySelector('.formstatus').style.visibility = 'visible';
      return;
    } catch (e) { page.released = true; }
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


  /* ---------- text mask for the weather layer: rain stays everywhere but dims where it would sit on text ---------- */
  var maskRects = [];
  function updateMask() {
    try {
      maskRects.length = 0;
      var els = stage.querySelectorAll('h2, p, .choices li, .card, .sign, form, .more, .ending, .verbs'), i, r;
      for (i = 0; i < els.length; i++) {
        r = els[i].getBoundingClientRect();
        if (r.width && r.height) { maskRects.push({ x: r.left - 6, y: r.top - 4, w: r.width + 12, h: r.height + 8 }); }
      }
      fx('setMask', maskRects);
    } catch (e) { /* decoration only */ }
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
        finishTyping(); finishDice();
        loadAll(imagesOf(cur.model, ctxNow), function () {
          safe(function () {
            curModel = cur.model;
            cur.pages = paginate(cur.model, cur.id);
            var i, idx = 0;
            for (i = 0; i < cur.pages.length; i++) { if (pageKey(cur.pages[i]) === keepKey) { idx = i; break; } }
            cur.pages.forEach(function (p) { p.typed = true; p.revealed = true; });
            showPage(idx, { instant: true });
          });
        });
      });
    }, 150);
  }
  function pageKey(page) {
    var i, b;
    for (i = 0; i < page.blocks.length; i++) { if (page.blocks[i].k === 'ask') { return 'ask' + page.blocks[i].kind; } }
    b = page.blocks[0];
    if (!b) { return ''; }
    if (b.k === 'p') { return 'p:' + plainOf(b.nodes).slice(0, 24); }
    if (b.k === 'choices') { return 'c:' + (b.list[0] ? plainOf(b.list[0].flat).slice(0, 16) : ''); }
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
    var skip = document.querySelector('.skip');
    if (skip) { skip.addEventListener('click', function (e) { e.preventDefault(); var m = $('sisalto'); if (m) { try { m.focus({ preventScroll: true }); } catch (x) { m.focus(); } } }); }
    updateHud();
  }

  function bootLines() {
    var def = ['OULUN PAITAPAINO KÄYNNISTYY', 'GALAKSIN ASENNOT LUETTU.'];
    try {
      var sec = story.scenes.kaynnistys;
      if (!sec) { return def; }
      var c = ctxFor('kaynnistys');
      var m = S.resolve(sec, c, FORCED), out = [];
      m.beats.forEach(function (items) { items.forEach(function (it) { if (it.type === 'p' || it.type === 'say') { out.push(plainOf(flatten(it.nodes, c))); } }); });
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
        var forceBoot = P.param('boot') === '1';
        var needBoot = (!mem.booted || forceBoot) && !reduced && P.param('boot') !== '0' && !story.failed && Fx;
        mem.booted = true; save();
        var go = function () { app.classList.add('ready'); safe(function () { route(true); }); };
        if (needBoot) {
          var started = false;
          try { fx('boot', bootLines(), function () { if (!started) { started = true; go(); } }, { skip: T('ohita testit'), stamp: T('leima') }); } catch (eb) { /* ignore */ }
          if (!Fx && !started) { started = true; go(); }
          setTimeout(function () { if (!started) { started = true; go(); } }, 14000);
        } else { go(); }
      });
    }, function () { panic('init'); });
    // watchdog: if nothing is on screen after a while, show the facts
    setTimeout(function () { if (!cur) { panic('timeout'); } }, 20000);
  }
  if (!app || !stage || !form) { return; }
  try { begin(); } catch (e) { panic(e.message); }
})();
