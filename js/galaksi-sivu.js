/* galaksi.html: the owner's testing tool. Shows today's conditions, lets you set them, lists every variant and detour. */
(function () {
  'use strict';
  var P = window.Paita, G = P.galaksi, S = P.story;
  var $ = function (id) { return document.getElementById(id); };
  var story = null;

  var CONTROLS = [
    ['nyt', 'Päivä ja kello (Helsingin aika)', 'dt'],
    ['kuu', 'Kuu', ['', 'uusikuu', 'kasvava', 'taysikuu', 'vaheneva']],
    ['aika', 'Vuorokaudenaika', ['', 'aamu', 'paiva', 'ilta', 'yo']],
    ['valo', 'Valo (onko pimeää)', ['', 'pimea', 'hamara', 'valoisa']],
    ['aurinko', 'Aurinko (yötön yö / kaamos)', ['', 'yoton', 'kaamos', 'normaali']],
    ['paiva', 'Viikonpäivä', ['', 'ma', 'ti', 'ke', 'to', 'pe', 'la', 'su']],
    ['kausi', 'Vuodenaika', ['', 'kevat', 'kesa', 'syksy', 'talvi']],
    ['paletti', 'Väripaletti (pakotus)', ['', 'oletus', 'ylivalotus', 'kuutamo', 'kaamos', 'valaistu', 'outo']],
    ['auki', 'Liike', ['', '1', '0']],
    ['palaava', 'Kävijä', ['', '1', '0']],
    ['arpa', 'Arpa', ['', 'kaikki', 'ei']],
    ['siemen', 'Siemen (arpa pysyy samana)', 'text'],
    ['nahty', 'Nähdyt kohtaukset (pilkulla eroteltuina)', 'text']
  ];
  var LABELS = { '': 'automaattinen', '1': 'auki / palaava', '0': 'kiinni / uusi' };
  var vals = {};

  function opts(key, v) {
    if (key === 'auki') { return v === '' ? 'automaattinen' : (v === '1' ? 'auki' : 'kiinni'); }
    if (key === 'palaava') { return v === '' ? 'automaattinen' : (v === '1' ? 'palaava kävijä' : 'uusi kävijä'); }
    if (key === 'arpa') { return v === '' ? 'oikea arvonta' : (v === 'kaikki' ? 'kaikki arvonnat onnistuvat' : 'mikään arvonta ei onnistu'); }
    return v === '' ? 'automaattinen' : v;
  }

  function buildControls() {
    var box = $('ctl');
    CONTROLS.forEach(function (c) {
      var d = document.createElement('div'), lab = document.createElement('label'), inp;
      lab.setAttribute('for', 'c-' + c[0]); lab.textContent = c[1];
      if (c[2] === 'dt') { inp = document.createElement('input'); inp.type = 'datetime-local'; }
      else if (c[2] === 'text') { inp = document.createElement('input'); inp.type = 'text'; inp.autocomplete = 'off'; }
      else {
        inp = document.createElement('select');
        c[2].forEach(function (v) { var o = document.createElement('option'); o.value = v; o.textContent = opts(c[0], v); inp.appendChild(o); });
      }
      inp.id = 'c-' + c[0];
      inp.addEventListener('change', refresh); inp.addEventListener('input', refresh);
      d.appendChild(lab); d.appendChild(inp); box.appendChild(d);
    });
    var q = location.search;
    CONTROLS.forEach(function (c) {
      var v = P.param(c[0]);
      if (v !== null) { $('c-' + c[0]).value = v; }
    });
    void q;
  }

  function readParams() {
    var pr = {}, qs = [];
    CONTROLS.forEach(function (c) {
      var v = $('c-' + c[0]).value;
      if (v) { pr[c[0]] = v; qs.push(c[0] + '=' + encodeURIComponent(v)); }
    });
    return { pr: pr, qs: qs };
  }

  function makeCtx(scene) {
    var r = readParams(), pr = {}, k;
    for (k in r.pr) { pr[k] = r.pr[k]; }
    if (pr.nyt) {
      var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(pr.nyt);
      if (m) { pr.now = P.fromUtc(P.wallToUtc(+m[1], +m[2], +m[3], +m[4], +m[5]), true); }
    }
    return G.context({ params: pr, mem: { seen: {}, flags: {}, returning: false, seed: (function () { try { return sessionStorage.getItem('paita.ps') || '1'; } catch (e) { return '1'; } })() }, scene: scene || '' });
  }

  function describeNow() {
    var c = makeCtx(''), d = G.describe(c), n = c.now;
    function p2(x) { return (x < 10 ? '0' : '') + x; }
    var lines = [
      'Päivä on ' + n.d + '.' + n.mo + '.' + n.y + ' ja kello on ' + p2(n.h) + ':' + p2(n.mi) + '. On ' + c.weekday + '.',
      'Kuu on ' + d.moon + ' (ikä ' + c.moonAge.toFixed(1) + ' vrk, valaistus ' + Math.round(c.moonIllum * 100) + ' %).',
      'Vuorokaudenaika: ' + c.tod + '. Vuodenaika: ' + c.season + '.',
      'Aurinko on ' + c.sunAlt.toFixed(1) + ' astetta horisontin ' + (c.sunAlt >= 0 ? 'yläpuolella' : 'alapuolella') + '. Valo: ' + c.light + '. ' + d.sun.charAt(0).toUpperCase() + d.sun.slice(1) + '.',
      'Oulussa aurinko nousee ' + (c.sunRise || '(ei nouse)') + ' ja laskee ' + (c.sunSet || '(ei laske)') + (c.polar !== 'normaali' ? ' (' + (c.polar === 'yötön' ? 'yötön yö' : 'kaamos') + ')' : '') + '.',
      'Liike on ' + (c.open ? 'auki' : 'kiinni') + '. Kävijä on ' + (c.returning ? 'palaava' : 'uusi') + '.',
      'Väripaletti: ' + G.palette(c) + '.'
    ];
    var box = $('now'); box.innerHTML = '';
    lines.forEach(function (l) { var p = document.createElement('p'); p.textContent = l; box.appendChild(p); });
    drawSwatches(G.palette(c));
    return c;
  }

  function drawSwatches(now) {
    var box = $('swatches');
    if (!box.firstChild) {
      G.PALETTES.forEach(function (p) {
        var d = document.createElement('div'); d.className = 'sw'; d.id = 'sw-' + p[0]; d.setAttribute('data-paletti', p[0]);
        d.innerHTML = '<div class="sample"><b>OTSIKKO_</b> TEKSTI <u>LINKKI</u><i>KELLO 12:00</i></div><div class="name"></div>';
        d.lastChild.textContent = p[1];
        box.appendChild(d);
      });
    }
    G.PALETTES.forEach(function (p) { var e = $('sw-' + p[0]); if (e) { e.className = 'sw' + (p[0] === now ? ' now' : ''); } });
  }

  function rawText(nodes) {
    return (nodes || []).map(function (n) {
      if (n.t === 'text') { return n.s; }
      if (n.t === 'fact') { return '{' + n.key + '}'; }
      return '[' + rawText(n.nodes) + ' -> ' + (n.target.id || n.target.url || n.target.action) + ']';
    }).join('');
  }
  function itemText(it) {
    if (it.type === 'p') { return rawText(it.nodes); }
    if (it.type === 'choice') { return '> ' + rawText(it.nodes) + ' -> ' + (it.target.id || it.target.url || it.target.action); }
    if (it.type === 'title') { return 'OTSIKKO: ' + rawText(it.nodes); }
    if (it.type === 'show') { return 'NÄYTÄ ' + it.what; }
    if (it.type === 'ask') { return 'KYSY ' + it.kind; }
    return '';
  }
  function cut(s) { return s.length > 150 ? s.slice(0, 147) + '...' : s; }

  function link(href, text) { var a = document.createElement('a'); a.href = href; a.textContent = text; return a; }

  function altRow(group, ai, picked, base, sceneId, text) {
    var alt = group.alts[ai];
    var d = document.createElement('div');
    d.className = 'alt' + (picked === ai ? ' on' : '');
    var c = document.createElement('span'); c.className = 'c';
    c.textContent = alt.cond === null ? (alt.condText === '' && ai === 0 ? 'oletus' : 'muuten') : (alt.condText);
    d.appendChild(c);
    d.appendChild(document.createTextNode(': ' + cut(text) + (picked === ai ? '  <- NYT' : '')));
    var qs = base.qs.slice(); qs.push('pakota=' + encodeURIComponent(group.id + ':' + ai));
    d.appendChild(link('index.html?' + qs.join('&') + '#' + sceneId, '[Näytä]'));
    d.appendChild(document.createTextNode(' (rivi ' + alt.line + ')'));
    return d;
  }

  function render() {
    var c = describeNow(), base = readParams();
    $('play').href = 'index.html?' + (base.qs.length ? base.qs.join('&') : 'ov=0');
    showBanner();
    // errors
    var eb = $('errors'); eb.innerHTML = '';
    if (story.failed) { var f = document.createElement('p'); f.className = 'err'; f.textContent = 'tarina.txt ei latautunut. Peli käyttää varakohtausta.'; eb.appendChild(f); }
    story.errors.forEach(function (e) { var p = document.createElement('p'); p.className = 'err'; p.textContent = 'VIRHE rivi ' + e.line + ': ' + e.msg; eb.appendChild(p); });
    story.warnings.forEach(function (e) { var p = document.createElement('p'); p.textContent = 'Huomautus rivi ' + e.line + ': ' + e.msg; eb.appendChild(p); });
    if (!story.errors.length && !story.warnings.length && !story.failed) { var ok = document.createElement('p'); ok.textContent = 'Ei virheitä. Tarina on kunnossa.'; eb.appendChild(ok); }
    // detours
    var db = $('detours'); db.innerHTML = '';
    var total = 0;
    story.detours.forEach(function (d) {
      var h = document.createElement('h3'); h.textContent = d.name + ': ' + d.from + ' -> ' + d.to;
      db.appendChild(h);
      var cc = makeCtx(d.from === '*' ? '' : d.from);
      var fires = d.cond ? G.match(d.cond, cc, 'kierto.' + d.name) >= 0 : true;
      var row = document.createElement('div'); row.className = 'alt' + (fires ? ' on' : '');
      var span = document.createElement('span'); span.className = 'c'; span.textContent = d.condText || '(ei ehtoa)';
      row.appendChild(span);
      var txt = '';
      d.beats.forEach(function (bg) { bg.alts.forEach(function (a) { a.data.items.forEach(function (ig) { ig.alts.forEach(function (ia) { if (ia.data.type === 'p') { txt += rawText(ia.data.nodes) + ' '; } }); }); }); });
      row.appendChild(document.createTextNode(': ' + cut(txt) + (fires ? '  <- laukeaisi NYT' : '') + (d.repeat ? ' (toistuu)' : ' (kerran vierailussa)')));
      var qs = base.qs.slice();
      row.appendChild(link('index.html?' + qs.join('&') + '#~' + d.name, '[Näytä]'));
      db.appendChild(row);
      total++;
    });
    // scenes
    var sb = $('scenes'); sb.innerHTML = '';
    var variants = 0;
    story.order.forEach(function (id) {
      var sc = story.scenes[id];
      var cs = makeCtx(id);
      var h = document.createElement('h3');
      h.appendChild(document.createTextNode('== ' + id + ' '));
      h.appendChild(link('index.html?' + base.qs.join('&') + '#' + id, '[Avaa]'));
      sb.appendChild(h);
      var groups = [];
      sc.titles.forEach(function (g) { groups.push({ g: g, txt: function (a) { return 'OTSIKKO: ' + rawText(a.data.nodes); } }); });
      sc.beats.forEach(function (bg) {
        if (bg.alts.length > 1 || bg.alts[0].cond) { groups.push({ g: bg, txt: function (a) { return a.data.items.map(function (ig) { return ig.alts[0] ? itemText(ig.alts[0].data) : ''; }).join(' | '); } }); }
        bg.alts.forEach(function (ba) {
          ba.data.items.forEach(function (ig) { groups.push({ g: ig, txt: function (a) { return itemText(a.data); } }); });
        });
      });
      groups.forEach(function (o) {
        var g = o.g;
        if (g.alts.length < 2 && !g.alts[0].cond) { return; }
        variants += g.alts.length - (g.alts[0].cond === null ? 1 : 0);
        var picked = S.pickIndex(g, cs, {});
        g.alts.forEach(function (a, ai) { sb.appendChild(altRow(g, ai, picked, base, id, o.txt(a))); });
        var sep = document.createElement('div'); sep.style.height = '10px'; sb.appendChild(sep);
      });
    });
    var sum = document.createElement('p'); sum.className = 'small'; sum.textContent = 'Vaihtoehtoja yhteensä: ' + variants + ', kiertoteitä: ' + total + '.';
    sb.insertBefore(sum, sb.firstChild);
  }

  function stored() { try { return JSON.parse(sessionStorage.getItem('paita.ov') || 'null') || {}; } catch (e) { return {}; } }
  function showBanner() {
    var st = stored(), k, parts = [], b = $('ovbanner');
    for (k in st) { if (st.hasOwnProperty(k)) { parts.push(k + '=' + st[k]); } }
    if (!parts.length) { b.hidden = true; return; }
    b.hidden = false; b.innerHTML = '';
    b.appendChild(document.createTextNode('Asennot ovat päällä pelissä tässä välilehdessä: ' + parts.join(' ') + '. '));
    var a = document.createElement('a'); a.href = '#'; a.textContent = 'Tyhjennä asennot';
    a.addEventListener('click', function (e) { e.preventDefault(); try { sessionStorage.removeItem('paita.ov'); } catch (x) { /* ignore */ } CONTROLS.forEach(function (c) { $('c-' + c[0]).value = ''; }); refresh(); });
    b.appendChild(a);
  }

  function refresh() { try { render(); } catch (e) { var p = document.createElement('p'); p.className = 'err'; p.textContent = 'Sivun piirto epäonnistui: ' + e.message; $('errors').appendChild(p); } }

  buildControls();
  $('reset').addEventListener('click', function () { CONTROLS.forEach(function (c) { $('c-' + c[0]).value = ''; }); refresh(); });
  function loaded(text, failed) {
    try { story = S.parse(text); } catch (e) { story = { scenes: {}, order: [], detours: [], errors: [{ line: 0, msg: 'Jäsennys kaatui: ' + e.message }], warnings: [] }; }
    story.failed = !!failed;
    refresh();
  }
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'tarina.txt?v=' + Date.now());
  xhr.onload = function () { if (xhr.status >= 200 && xhr.status < 300) { loaded(xhr.responseText, false); } else { loaded('', true); } };
  xhr.onerror = function () { loaded('', true); };
  xhr.send();
})();
