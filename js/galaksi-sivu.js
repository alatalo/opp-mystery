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
    ['kauhu', 'Kammokausi (lokakuu, halloween, perjantai 13)', ['', 'spoopy', 'halloween', 'pe13', 'ei']],
    ['paletti', 'Väripaletti (pakotus)', ['', 'oletus', 'ylivalotus', 'kuutamo', 'kaamos', 'valaistu', 'outo', 'hamara', 'paiva', 'halloween']],
    ['auki', 'Liike', ['', '1', '0']],
    ['palaava', 'Kävijä', ['', '1', '0']],
    ['hahmo', 'Hahmon etäisyys (ikkunalla käynti 1-4)', ['', '1', '2', '3', '4']],
    ['vuoro', 'Hahmon työvuoro', ['', 'kahvi', 'lounas', 'sulku', 'maanantai', 'yo', 'ei']],
    ['jarki', 'JÄRKI-luvun alkuarvo (1-99)', 'text'],
    ['arpa', 'Arpa', ['', 'oikea', 'kaikki', 'ei']],
    ['siemen', 'Siemen (arpa, JÄRKI ja salasana pysyvät samana)', 'text'],
    ['nahty', 'Nähdyt kohtaukset (pilkulla eroteltuina)', 'text']
  ];
  var VALUE_LABELS = {
    auki: { '1': 'auki', '0': 'kiinni' }, palaava: { '1': 'palaava kävijä', '0': 'uusi kävijä' },
    arpa: { '': 'automaattinen (ei arpaa kun asentoja on päällä)', oikea: 'oikea arvonta (siemenellä)', kaikki: 'kaikki arvonnat onnistuvat', ei: 'mikään arvonta ei onnistu' },
    vuoro: { '': 'automaattinen (kello)', kahvi: 'kahvitauko', lounas: 'lounas', sulku: 'sulkemishetki (viimeinen vartti)', maanantai: 'maanantai (kiinni, hahmo silti paikalla)', yo: 'yövuoro', ei: 'ei vuoroa' },
    kauhu: { '': 'automaattinen (lokakuu / 28.-31.10. / pe 13.)', spoopy: 'lokakuu (kurpitsa)', halloween: 'halloween (28.-31.10.)', pe13: 'perjantai 13.', ei: 'ei kammoa' },
    hahmo: { '': 'automaattinen (monesko käynti ikkunalla)', '1': '1 kaukana', '2': '2 lähempänä', '3': '3 lähellä', '4': '4 lasin takana' }
  };
  var LABELS = {};
  var vals = {};

  function opts(key, v) {
    if (VALUE_LABELS[key] && VALUE_LABELS[key][v] !== undefined) { return VALUE_LABELS[key][v]; }
    return v === '' ? 'automaattinen' : v;
  }

  // One short line per control: what the setting changes in the opening of the game (and elsewhere)
  var HINT = {
    nyt: 'Muuttaa kaiken: kuun, valon, vuodenajan, viikonpäivän, aukiolon, työvuoron ja palettin.',
    kuu: 'Muuttaa kuun kuvaa avauskuvassa ja leimaa sekä yhtä lausetta avauksessa (pimeällä). Täysikuu antaa kuutamo-paletin.',
    aika: 'Muuttaa otsikon viimeistä sanaa (aamu, päivä, ilta, yö).',
    valo: 'Muuttaa paletin: pimeä = tavallinen sininen, hämärä = violetti, valoisa = vaalea syaani. Säätä sade ja otsikko mukana.',
    aurinko: 'Yötön yö = valkoinen ylivalotus ja uusi otsikko, kaamos = tumma kaamos-paletti ja uusi otsikko, normaali = ei muutosta.',
    paiva: 'Muuttaa avauskuvan leimaa (MA, TI, ...). Päivä kertoo myös onko liike auki (ti-pe 12-18) ja onko hahmo maanantaivuorossa.',
    kausi: 'Muuttaa toista kappaletta avauksessa, leimaa ja säätä (talvella lumi, syksyllä lehtiä).',
    kauhu: 'Kurpitsa avauskuvaan ja yksi lause (lokakuu). Halloween ja perjantai 13. antavat myös mustan ja oranssin paletin ja oman otsikon.',
    paletti: 'Pakottaa värit. Muut asennot pysyvät.',
    auki: 'Auki: ikkunan valo palaa tasaisesti, valaistu-paletti pimeällä ja ensimmäinen valinta vie sisään. Kiinni: valo vilkkuu.',
    palaava: 'Palaava: otsikko "On taas ..." ja uusi lause avauksessa.',
    hahmo: 'Näkyy ikkunalla: hahmon kuva, asento ja rivit vaihtuvat. 4 + liike auki: huppu laskeutuu ja salasana löytyy.',
    vuoro: 'Näkyy ikkunalla: hahmon työvuoron rivi (kahvitauko, lounas, sulku, maanantai, yö).',
    jarki: 'Näkyy heti: JÄRKI-luku alareunassa. Alle 25: kertoja alkaa toistaa sanoja ja alaviiva liikkuu.',
    arpa: 'Oikea: arvonta siemenellä (esim. 4 % rivi, outo-paletti, väärä ovi). Kaikki: kaikki arvonnat onnistuvat. Ei: mikään ei onnistu.',
    siemen: 'Muuttaa JÄRKI-luvun alkuarvoa, salasanaa ja sitä mitä arvonnat antavat.',
    nahty: 'Nähty: avaus käyttää "nähty"-versioita (esim. "Nouset taas märkänä").'
  };
  var CUR = {
    kuu: function (c) { return 'nyt: ' + G.describe(c).moon + ', ikä ' + c.moonAge.toFixed(1) + ' vrk'; },
    aika: function (c) { return 'nyt: ' + c.tod; },
    valo: function (c) { return 'nyt: ' + c.light + ', paletti ' + G.palette(c); },
    aurinko: function (c) { return 'nyt: ' + c.polar; },
    paiva: function (c) { return 'nyt: ' + c.weekday + ', liike ' + (c.open ? 'auki' : 'kiinni'); },
    kausi: function (c) { return 'nyt: ' + c.season; },
    kauhu: function (c) { return 'nyt: ' + (c.fri13 ? 'perjantai 13.' : c.halloween ? 'halloween' : c.spoopy ? 'lokakuu' : 'ei kammoa'); },
    paletti: function (c) { return 'nyt: ' + G.palette(c); },
    auki: function (c) { return 'nyt: ' + (c.open ? 'auki' : 'kiinni'); },
    palaava: function (c) { return 'nyt: ' + (c.returning ? 'palaava' : 'uusi'); },
    hahmo: function (c) { return 'nyt: vaihe ' + c.stage; },
    vuoro: function (c) { return 'nyt: ' + (c.shift || 'ei vuoroa'); },
    jarki: function (c) { return 'nyt: ' + c.sanity; },
    arpa: function (c) { return 'nyt: ' + (c.chance === null ? 'oikea arvonta' : c.chance); },
    siemen: function (c) { return 'nyt: ' + c.seed; }
  };

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
      var hint = document.createElement('p'); hint.className = 'hint'; hint.id = 'h-' + c[0]; hint.textContent = HINT[c[0]] || '';
      var curl = document.createElement('p'); curl.className = 'hint cur'; curl.id = 'hc-' + c[0];
      d.appendChild(lab); d.appendChild(inp); d.appendChild(hint); d.appendChild(curl); box.appendChild(d);
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
    return G.context({ params: pr, tool: true, mem: { seen: {}, flags: {}, returning: false, inv: { lauta: 1 }, found: {}, seed: (function () { try { return sessionStorage.getItem('paita.ps') || '1'; } catch (e) { return '1'; } })() }, scene: scene || '' });
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
      'Väripaletti: ' + G.palette(c) + '.',
      'Hahmo: vaihe ' + c.stage + ' (1 kaukana, 4 lasin takana). Työvuoro: ' + (c.shift || 'ei vuoroa') + '.',
      'Kammokausi: ' + (c.fri13 ? 'perjantai 13.' : c.halloween ? 'halloween (28.-31.10.)' : c.spoopy ? 'lokakuu' : 'ei') + '.',
      'JÄRKI alkaa luvusta ' + c.sanity + '. Salasana tälle siemenelle ja kuulle: ' + (G.passwordFor(c, story.passwords) || '(lista tyhjä)') + '.'
    ];
    var box = $('now'); box.innerHTML = '';
    lines.forEach(function (l) { var p = document.createElement('p'); p.textContent = l; box.appendChild(p); });
    drawSwatches(G.palette(c));
    var cr = $('ctlresult'); if (cr) { cr.textContent = 'Nyt voimassa: ' + (lines[0] || '') + (lines[1] ? ' / ' + lines[1] : '') + ' / paletti ' + G.palette(c) + ' (korostettu Väripaleteissa ylhäällä)'; }
    CONTROLS.forEach(function (ct) { var e = $('hc-' + ct[0]); if (e) { e.textContent = CUR[ct[0]] ? CUR[ct[0]](c) : ''; } });
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
    if (it.type === 'choice') { return '> ' + rawText(it.nodes) + ' -> ' + (it.target.id || it.target.url || it.target.action || it.target.kind); }
    if (it.type === 'title') { return 'OTSIKKO: ' + rawText(it.nodes); }
    if (it.type === 'show') { return 'NÄYTÄ ' + it.what; }
    if (it.type === 'ask') { return 'KYSY ' + it.kind; }
    if (it.type === 'say') { return 'PUHE: ' + rawText(it.nodes); }
    if (it.type === 'roll') { return 'HEITTO ' + it.key; }
    if (it.type === 'sanity') { return 'JÄRKI ' + (it.d > 0 ? '+' : '') + it.d; }
    if (it.type === 'ending') { return 'LOPPU ' + it.id; }
    if (it.type === 'take') { return 'OTA ' + it.item; }
    if (it.type === 'cast') { return 'HAHMO ' + it.who + ' PAIKKA ' + it.place; }
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
    renderExtras();
    var sum = document.createElement('p'); sum.className = 'small'; sum.textContent = 'Vaihtoehtoja yhteensä: ' + variants + ', kiertoteitä: ' + total + '.';
    sb.insertBefore(sum, sb.firstChild);
  }


  /* ---------- endings, passwords, boot replay, picture overlays ---------- */
  function foundList() { try { var f = JSON.parse(localStorage.getItem('paita.e') || '[]'); return f instanceof Array ? f : []; } catch (e) { return []; } }
  function renderExtras() {
    var box = $('extras'); box.innerHTML = '';
    var base = readParams(), f = foundList();
    var p = document.createElement('p');
    p.textContent = 'Löydetyt loput tässä selaimessa: ' + f.length + '/' + story.endings.length + (f.length ? ' (' + f.join(', ') + ')' : '') + '.';
    box.appendChild(p);
    var ol = document.createElement('ol'); ol.className = 'small';
    story.endings.forEach(function (id) { var li = document.createElement('li'); li.textContent = id + ': ' + story.endingNames[id] + (f.indexOf(id) >= 0 ? '  (löydetty)' : ''); ol.appendChild(li); });
    box.appendChild(ol);
    var b = document.createElement('button'); b.type = 'button'; b.id = 'reset-loput'; b.textContent = 'Nollaa löydetyt loput';
    b.addEventListener('click', function () { try { localStorage.removeItem('paita.e'); } catch (e) { /* ignore */ } renderExtras(); });
    box.appendChild(b);
    var row = document.createElement('div'); row.className = 'row';
    row.appendChild(link('index.html?boot=1&' + (base.qs.length ? base.qs.join('&') : 'ov=0'), 'Toista käynnistysruutu'));
    row.appendChild(link('index.html?' + (base.qs.length ? base.qs.join('&') + '&' : '') + 'hahmo=4&auki=1#ikkuna', 'Huppu laskeutuu (hahmo 4, auki)'));
    box.appendChild(row);
    var pw = document.createElement('p'); pw.className = 'small';
    var cc = makeCtx('');
    pw.textContent = 'Salasanalista (' + story.passwords.length + '): ' + story.passwords.join(' / ') + '. Tälle siemenelle ja kuulle valitaan: ' + (G.passwordFor(cc, story.passwords) || '-') + '.';
    box.appendChild(pw);
    renderPictures();
  }

  var PIC_FILES = { avaus: ['avaus.jpg', 'avaus-pysty.jpg'], kaytava: ['kaytava.jpg', 'kaytava-pysty.jpg'], ovi: ['ovi.jpg'], hahmo: ['hahmo-1.jpg', 'hahmo-2.jpg', 'hahmo-3.jpg', 'hahmo-4.jpg'] };
  function renderPictures() {
    var box = $('pics'); box.innerHTML = '';
    var name, i;
    function addPic(file, label, rects, places, skyBox) {
      var h = document.createElement('h3'); h.textContent = label; box.appendChild(h);
      var w = document.createElement('div'); w.className = 'picov';
      var im = document.createElement('img'); im.src = 'assets/img/' + file; im.alt = ''; w.appendChild(im);
      rects.forEach(function (r) {
        var d = document.createElement('div'); d.className = 'ov'; d.style.left = r.r[0] + '%'; d.style.top = r.r[1] + '%'; d.style.width = r.r[2] + '%'; d.style.height = r.r[3] + '%';
        var sp = document.createElement('span'); sp.textContent = r.name; d.appendChild(sp); w.appendChild(d);
      });
      if (skyBox) { var sd = document.createElement('div'); sd.className = 'ov sky'; sd.style.left = skyBox[0] + '%'; sd.style.top = skyBox[1] + '%'; sd.style.width = skyBox[2] + '%'; sd.style.height = skyBox[3] + '%'; var ss = document.createElement('span'); ss.textContent = 'TAIVAS (kuu vain tähän)'; sd.appendChild(ss); w.appendChild(sd); }
      (places || []).forEach(function (pl) {
        var d = document.createElement('div'); d.className = 'ov place'; d.style.left = (pl.x - pl.h * 0.2) + '%'; d.style.top = (pl.y - pl.h) + '%'; d.style.width = (pl.h * 0.4) + '%'; d.style.height = pl.h + '%';
        var sp = document.createElement('span'); sp.textContent = 'PAIKKA ' + pl.n; d.appendChild(sp); w.appendChild(d);
      });
      // character hit areas: at least 44 x 44 px, drawn dashed once the picture has its size
      im.onload = function () {
        var W = w.clientWidth, H = w.clientHeight;
        (places || []).forEach(function (pl) {
          var bw = Math.max(pl.h * 0.4, 44 / W * 100 + 0), bh = Math.max(pl.h, 44 / H * 100);
          var d = document.createElement('div'); d.className = 'ov place hit';
          d.style.left = (pl.x - bw / 2) + '%'; d.style.top = (pl.y - bh) + '%'; d.style.width = bw + '%'; d.style.height = bh + '%'; d.style.borderStyle = 'dashed';
          var sp = document.createElement('span'); sp.textContent = 'OSUMA ' + pl.n; sp.style.left = 'auto'; sp.style.right = '0'; d.appendChild(sp); w.appendChild(d);
        });
      };
      box.appendChild(w);
    }
    for (name in PIC_FILES) {
      var pic = story.pictures[name];
      if (!pic) { continue; }
      for (i = 0; i < PIC_FILES[name].length; i++) {
        var portrait = /pysty/.test(PIC_FILES[name][i]), stageNo = name === 'hahmo' ? i + 1 : 0;
        var rects = [];
        pic.spots.forEach(function (sp) {
          var r = (stageNo && sp.rects['s' + stageNo]) || (portrait && sp.rects.p) || sp.r;
          if (sp.cond) { var cx = makeCtx(''); cx.stage = stageNo || cx.stage; if (G.match(sp.cond, cx, 'x') < 0) { return; } }
          rects.push({ r: r, name: sp.id });
        });
        var pls = [], k;
        for (k in pic.places) { var pos = (portrait && pic.places[k].p) || pic.places[k].l; if (pos) { pls.push({ n: k, x: pos[0], y: pos[1], h: pos[2] }); } }
        addPic(PIC_FILES[name][i], name + ' (' + PIC_FILES[name][i] + (stageNo ? ', vaihe ' + stageNo : '') + ')', rects, pls, (pic.sky && pic.sky[portrait ? 'p' : 'l']) || null);
      }
    }
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
  (function () {
    var fb = document.getElementById('logofx'), st = document.getElementById('logostatus'), mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null, tm = null;
    if (!fb) { return; }
    fb.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.getAttribute || !t.getAttribute('data-fx')) { return; }
      var all = fb.querySelectorAll('button'), i;
      for (i = 0; i < all.length; i++) { all[i].className = ''; }
      if (mq && mq.matches) { st.textContent = 'Tehosteet ovat pois päältä, koska laite pyytää vähemmän liikettä. Siksi logossa ei tapahdu mitään.'; return; }
      var ok = window.PaitaLogo && window.PaitaLogo.test(t.getAttribute('data-fx'));
      st.textContent = ok ? 'Laukaistu: ' + t.getAttribute('data-d') + '.' : 'Tehostetta ei voitu ajaa tässä selaimessa.';
      t.className = 'on'; clearTimeout(tm); tm = setTimeout(function () { t.className = ''; }, 1500);
    });
    if (mq && mq.matches) { st.textContent = 'Tehosteet ovat pois päältä, koska laite pyytää vähemmän liikettä. Painikkeet eivät tee mitään.'; }
  })();
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
