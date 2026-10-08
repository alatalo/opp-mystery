/* Parser for tarina.txt (format: see the comments at the top of that file and docs/OHJE-TEKSTIT.md).
   Tolerant by design: an error is recorded with its line number and the rest of the story still works.
   Keywords are case-insensitive. ES5 on purpose (old Safari). */
(function () {
  'use strict';
  var P = window.Paita;
  var G = P.galaksi;
  var norm = G.norm;

  var KEYWORDS = ['KUN', 'JOS', 'MUUTEN', 'OTSIKKO', 'SÄÄ', 'NÄYTÄ', 'KYSY', 'KIERTOTIE', 'VÄLILLÄ', 'TOISTUU', 'JATKUU', 'PERILLE',
    'PUHE', 'HEITTO', 'JÄRKI', 'LOPPU', 'OTA', 'HAHMO', 'KUVA', 'HENKILÖ', 'KOHTA', 'PAIKKA', 'AIHE', 'EHTO', 'NIMI', 'KATSO', 'MENE', 'VERBI',
    'PYSTY', 'RAJA', 'RAJAUS', 'TAIVAS', 'TERVEHDYS', 'POISTUU', 'TIEDOSTO', 'KOLMAS', 'PIILOSSA', 'TOIMI', 'TAUSTA', 'PIHA'];
  var SHOW = { hahmo: 1, kortti: 1, kyltti: 1, kartta: 1, kissa: 1, avaus: 1, kaytava: 1, leima: 1, omistaja: 1, ovi: 1 };
  var ASK = { nimi: 1, klaani: 1, yhteys: 1, viesti: 1, vahvista: 1 };
  var FACTS = { puhelin: 'phone', sahkoposti: 'email', katu: 'street', postinumero: 'postal', avaus: 'openTime', sulkeminen: 'closeTime',
    tilanne: 'status', nimi: 'name', kuu: 'kuu', aika: 'aika', kellonaika: 'kello', viikonpaiva: 'viikonpaiva', aurinko: 'aurinko', valo: 'valo',
    jarki: 'jarki', salasana: 'salasana', instagram: 'instagram', loput: 'loput' };
  var ACTIONS = { puhelin: 'tel', sahko: 'mail', sahkoposti: 'mail', reitti: 'route' };

  function sceneId(s) { return norm(s).replace(/[^a-z0-9~:_-]+/g, '-').replace(/^-+|-+$/g, ''); }
  function exitId(url) {
    var m = /^https?:\/\/(?:www\.)?([^\/?#]+)(?:\/([^\/?#]*))?/i.exec(url) || [];
    var host = m[1] || 'ulos', seg = /instagram\.com$/i.test(host) ? (m[2] || '') : '';
    return 'ulos-' + sceneId(host + (seg ? '-' + seg : ''));
  }
  function lev(a, b) {
    var i, j, d = [], c;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 1; j <= b.length; j++) { d[0][j] = j; }
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        c = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      }
    }
    return d[a.length][b.length];
  }
  function nearKeyword(tok) {
    var up = tok.toUpperCase(), i, lim = up.length < 6 ? 1 : 2, best = null;
    if (up.length < 3) { return null; }
    for (i = 0; i < KEYWORDS.length; i++) {
      if (KEYWORDS[i] === up) { return null; }
      if (Math.abs(KEYWORDS[i].length - up.length) <= lim && lev(KEYWORDS[i], up) <= lim) { best = KEYWORDS[i]; }
    }
    return best;
  }
  function numbers(str, n) {
    var m = String(str).replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/g) || [], out = [], i;
    if (m.length < n) { return null; }
    for (i = 0; i < n; i++) { out.push(parseFloat(m[i])); }
    return out;
  }

  function parseStory(text) {
    var story = { scenes: {}, order: [], detours: [], texts: {}, errors: [], warnings: [], endings: [], endingNames: {}, passwords: [], pictures: {}, people: {}, exits: {}, bootLines: [] };
    var lines = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    var sec = null;           // current scene or detour
    var secKind = null;
    var block = null;         // current beat block
    var para = [];            // buffered text lines
    var paraLine = 0;
    var pending = null;       // {kind, cond, condText, line}
    var last = null;          // last p or choice item (aside target)
    var collect = null;       // show item collecting lines
    var detourHeader = false;
    var gc = 0;
    var cur = null;           // current picture spot / person topic being filled

    function err(n, msg) { story.errors.push({ line: n, msg: msg }); }
    function warn(n, msg) { story.warnings.push({ line: n, msg: msg }); }

    function cond(txt, n) {
      var c = G.parseCond(txt);
      if (c.error) { err(n, c.error + ' (ehto: ' + txt + ')'); }
      return c;
    }

    function parseNodes(str, n) {
      var nodes = [];
      var re = /\[([^\[\]]*?)\s*->\s*([^\[\]]*?)\s*\]/g, m, pos = 0;
      function plain(s) {
        var re2 = /\{([^{}]+)\}/g, mm, p = 0;
        while ((mm = re2.exec(s))) {
          if (mm.index > p) { nodes_push({ t: 'text', s: s.slice(p, mm.index) }); }
          var key = norm(mm[1]);
          if (FACTS[key]) { nodes_push({ t: 'fact', key: FACTS[key] }); } else { warn(n, 'Tuntematon {' + mm[1] + '}: näytetään sellaisenaan'); nodes_push({ t: 'text', s: mm[0] }); }
          p = mm.index + mm[0].length;
        }
        if (p < s.length) { nodes_push({ t: 'text', s: s.slice(p) }); }
      }
      var target = nodes;
      function nodes_push(x) { target.push(x); }
      while ((m = re.exec(str))) {
        if (m.index > pos) { target = nodes; plain(str.slice(pos, m.index)); }
        var link = { t: 'link', nodes: [], target: parseTarget(m[2], n) };
        target = link.nodes; plain(m[1]); target = nodes;
        nodes.push(link);
        pos = m.index + m[0].length;
      }
      if (pos < str.length) { target = nodes; plain(str.slice(pos)); }
      if (/\[[^\]]*$|^[^\[]*\]/.test(str.replace(/\[[^\[\]]*->[^\[\]]*\]/g, ''))) { warn(n, 'Hakasulku ilman nuolta (->): teksti näytetään sellaisenaan'); }
      return nodes;
    }
    function parseTarget(t, n) {
      t = String(t).replace(/^\s+|\s+$/g, '');
      var k = norm(t);
      if (k === 'instagram' || k === 'kahvila') {
        t = k === 'instagram' ? (P.config.instagram || '') : (P.config.cafeUrl || '');
        if (!t) { return { kind: 'scene', id: START_ID, n: n }; }
      }
      if (/^https?:\/\//i.test(t)) { var id = exitId(t); story.exits[id] = t; return { kind: 'url', url: t, exit: id }; }
      if (ACTIONS[k]) { return { kind: 'action', action: ACTIONS[k], word: k }; }
      if (k === 'ulos') { return { kind: 'exitgo' }; }
      if (k === 'takaisin') { return { kind: 'back' }; }
      if (k === 'jatka') { return { kind: 'next' }; }
      return { kind: 'scene', id: sceneId(t), n: n };
    }
    var START_ID = 'alku';
    function needsPhone(nodes, target) {
      var i;
      if (target && target.kind === 'action' && target.action === 'tel') { return true; }
      for (i = 0; i < nodes.length; i++) {
        if (nodes[i].t === 'fact' && nodes[i].key === 'phone') { return true; }
        if (nodes[i].t === 'link' && needsPhone(nodes[i].nodes, nodes[i].target)) { return true; }
      }
      return false;
    }

    // ---- group assembly: plain starts a group, KUN replaces within it, JOS starts an optional group, MUUTEN is its fallback ----
    function newGroup(list, type) {
      gc++;
      var g = { id: sec.id + '.' + gc, type: type, alts: [] };
      list.push(g);
      return g;
    }
    function assemble(list, type, data, lead, n) {
      var alt = { data: data, cond: null, condText: '', line: n };
      var g;
      if (lead && (lead.kind === 'kun' || lead.kind === 'jos')) { alt.cond = lead.cond; alt.condText = lead.condText; }
      var kind = lead ? lead.kind : 'plain';
      if (kind === 'kun' || kind === 'muuten') {
        g = list[list.length - 1];
        if (!g || g.type !== type) {
          err(n, (kind === 'kun' ? 'KUN' : 'MUUTEN') + ' ilman edeltävää samanlaista kohtaa: käsitellään kuin JOS');
          g = null;
        } else if (kind === 'muuten' && g.alts[0] && g.alts[0].cond === null) {
          err(n, 'MUUTEN-kohtaa edeltää jo oletusteksti: tämä jätetään pois'); return null;
        }
        if (g) { g.alts.push(alt); return g; }
        kind = 'jos';
      }
      g = newGroup(list, type);
      g.alts.push(alt);
      return g;
    }

    function startSection(kindName, id, n) {
      flush(n);
      endSection(n);
      secKind = kindName;
      gc = 0;
      sec = { id: id, line: n, titles: [], beats: [], weather: false, texts: null };
      block = { lead: { kind: 'plain' }, items: [], line: n };
      pending = null; last = null; collect = null; cur = null;
    }
    function endSection(n) {
      if (!sec) { return; }
      flush(n);
      commitBlock(sec.blockLead || null);
      sec.blockLead = null;
      try {
        if (secKind === 'scene') {
          if (story.scenes[sec.id]) { err(sec.line, 'Kohtaus "' + sec.id + '" on määritelty kahdesti: jälkimmäinen jätetään pois'); }
          else { story.scenes[sec.id] = sec; story.order.push(sec.id); }
        } else if (secKind === 'detour') {
          sec.name = sec.id;
          story.detours.push(sec);
        }
      } catch (e) { err(sec.line, 'Kohtauksen lukeminen epäonnistui: ' + e.message); }
      sec = null; block = null;
    }
    function commitBlock(lead) {
      if (!sec || !block) { return; }
      if (block.items.length || block.lead.kind !== 'plain') {
        assemble(sec.beats, 'beat', { items: block.items }, block.lead, block.line);
      }
    }

    function addItem(item, n) {
      if (!sec) { err(n, 'Teksti ennen ensimmäistä kohtausta (== nimi): ohitetaan'); pending = null; return; }
      var lead = pending; pending = null;
      item.needsPhone = !!item.needsPhone;
      assemble(block.items, item.type, item, lead, n);
      if (item.type === 'p' || item.type === 'choice' || item.type === 'say') { last = item; }
    }

    function flush(n) {
      if (!para.length) { return; }
      var txt = para.join(' ').replace(/\s+/g, ' ').replace(/^ | $/g, '');
      var ln = paraLine;
      para = [];
      if (!sec) { err(ln, 'Teksti ennen ensimmäistä kohtausta (== nimi): ohitetaan'); return; }
      if (secKind === 'texts' || secKind === 'ends' || secKind === 'pw' || secKind === 'pic' || secKind === 'person') { return; }
      var nodes = parseNodes(txt, ln);
      addItem({ type: para.say ? 'say' : 'p', nodes: nodes, aside: null, line: ln, needsPhone: needsPhone(nodes, null) }, ln);
    }
    var paraSay = false;

    function flushText(n) {
      if (!para.length) { return; }
      var txt = para.join(' ').replace(/\s+/g, ' ').replace(/^ | $/g, '');
      var ln = paraLine, say = paraSay;
      para = []; paraSay = false;
      if (!sec) { err(ln, 'Teksti ennen ensimmäistä kohtausta (== nimi): ohitetaan'); return; }
      var nodes = parseNodes(txt, ln);
      addItem({ type: say ? 'say' : 'p', nodes: nodes, aside: null, line: ln, needsPhone: needsPhone(nodes, null) }, ln);
    }
    flush = function (n) {
      if (secKind === 'texts' || secKind === 'ends' || secKind === 'pw' || secKind === 'pic' || secKind === 'person') { para = []; return; }
      flushText(n);
    };

    // a condition line written in a case-insensitive way; returns the parsed condition or null if the line is prose
    function softCond(word, rest, n, exact) {
      var c = G.parseCond(rest);
      if (!c.error) { return c; }
      if (exact) { return cond(rest, n); }
      if (!/[.!?,]/.test(rest) && rest.length <= 50) { warn(n, 'Rivi alkaa sanalla "' + word + '" mutta ehtoa ei tunnistettu (' + c.error + '): näytetään tekstinä'); }
      return null;
    }

    var i, raw, line, m, n;
    for (i = 0; i < lines.length; i++) {
      n = i + 1;
      raw = lines[i];
      line = raw.replace(/^\s+|\s+$/g, '');
      try {
        if (line.charAt(0) === '#') { continue; }
        if (line === '') { if (secKind !== 'texts') { flush(n); } collect = null; cur = null; continue; }
        if (line.indexOf('�') >= 0) { warn(n, 'Rivillä on rikkinäinen merkki (�): tallenna tiedosto UTF-8-muodossa'); }

        if ((m = /^==\s*(.+?)\s*=*$/.exec(line))) {
          var id = sceneId(m[1]);
          if (id === 'tekstit') { startSection('texts', id, n); sec.id = 'tekstit'; continue; }
          if (id === 'loput') { startSection('ends', id, n); continue; }
          if (id === 'salasanat') { startSection('pw', id, n); continue; }
          startSection('scene', id, n);
          if (!id) { err(n, 'Kohtauksen nimi puuttuu'); }
          continue;
        }
        if ((m = /^(KIERTOTIE|KIERTOTEI)\s+(.+)$/i.exec(line))) {
          startSection('detour', sceneId(m[2]), n);
          sec.from = '*'; sec.to = '*'; sec.cond = null; sec.condText = ''; sec.repeat = false; sec.goal = null;
          detourHeader = true;
          continue;
        }
        if ((m = /^KUVA\s+(\S+)\s*$/i.exec(line))) {
          startSection('pic', sceneId(m[1]), n);
          sec.pic = story.pictures[sec.id] = story.pictures[sec.id] || { id: sec.id, spots: [], places: {}, focus: {}, sky: {} };
          continue;
        }
        if ((m = /^HENKIL[ÖO]\s+(\S+)\s*$/i.exec(line))) {
          startSection('person', sceneId(m[1]), n);
          sec.person = story.people[sec.id] = { id: sec.id, name: '', img: sec.id, look: '', greeting: '', topics: [], leave: 'alku', uses: {} };
          continue;
        }
        if (!sec) { err(n, 'Teksti ennen ensimmäistä kohtausta (== nimi): ohitetaan'); continue; }

        if (secKind === 'texts') {
          if ((m = /^([^:]+?)\s*:\s*(.*)$/.exec(line))) { story.texts[norm(m[1])] = m[2]; }
          else { err(n, 'Tekstirivi ilman kaksoispistettä: ' + line); }
          continue;
        }
        if (secKind === 'ends') {
          if ((m = /^([^:]+?)\s*:\s*(.+)$/.exec(line))) { story.endings.push(sceneId(m[1])); story.endingNames[sceneId(m[1])] = m[2]; }
          else { err(n, 'Loppu: kirjoita "tunnus: Nimi"'); }
          continue;
        }
        if (secKind === 'pw') { story.passwords.push(line); continue; }

        if (secKind === 'pic') {
          var pic = sec.pic;
          if ((m = /^KOHTA\s+(\S+?)\s*:\s*(.+)$/i.exec(line))) {
            var r = numbers(m[2], 4);
            cur = { id: sceneId(m[1]), r: r, rects: {}, name: m[1], look: '', looks: [], third: '', action: '', hidden: false, soft: false, go: null, cond: null };
            if (!r) { err(n, 'KOHTA tarvitsee neljä lukua: x y leveys korkeus (prosentteja)'); cur.r = [0, 0, 10, 10]; }
            pic.spots.push(cur); continue;
          }
          if ((m = /^PAIKKA\s+(\d+)(\s+PYSTY)?\s*:\s*(.+)$/i.exec(line))) {
            var pn = numbers(m[3], 3);
            if (!pn) { err(n, 'PAIKKA tarvitsee kolme lukua: jalkojen x, maan y, korkeus (prosentteja)'); continue; }
            var pl = pic.places[m[1]] = pic.places[m[1]] || {};
            pl[m[2] ? 'p' : 'l'] = pn; continue;
          }
          if ((m = /^TIEDOSTO\s*:\s*(\S+)$/i.exec(line))) { pic.file = m[1]; continue; }
          // TAIVAS: x y w h = the empty sky of the picture (percentages): the moon is only ever drawn inside it. TAIVAS PYSTY for the portrait picture.
          if ((m = /^TAIVAS(\s+PYSTY)?\s*:\s*(.+)$/i.exec(line))) {
            var sk = numbers(m[2], 4);
            if (sk) { pic.sky[m[1] ? 'p' : 'l'] = sk; } else { err(n, 'TAIVAS tarvitsee neljä lukua: x y leveys korkeus (prosentteja)'); }
            continue;
          }
          // RAJAUS: x y w h  = the part of the picture that must stay visible on small screens (percentages). PYSTY / 1-4 for the other pictures.
          if ((m = /^RAJAUS(?:\s+(PYSTY|[1-4]))?\s*:\s*(.+)$/i.exec(line))) {
            var fb = numbers(m[2], 4);
            if (fb) { pic.focus[!m[1] ? 'l' : (/^PYSTY$/i.test(m[1]) ? 'p' : 's' + m[1])] = fb; } else { err(n, 'RAJAUS tarvitsee neljä lukua: x y leveys korkeus (prosentteja)'); }
            continue;
          }
          if (!cur) { err(n, 'Rivi kuuluu KOHTA-lohkoon (aloita rivillä KOHTA nimi: x y w h): ' + line); continue; }
          if ((m = /^NIMI\s*:\s*(.+)$/i.exec(line))) { cur.name = m[1]; continue; }
          if ((m = /^KATSO\s*:\s*(.+)$/i.exec(line))) { cur.looks.push(m[1]); if (!cur.look) { cur.look = m[1]; } continue; }
          if ((m = /^KOLMAS\s*:\s*(.+)$/i.exec(line))) { cur.third = m[1]; continue; }
          if ((m = /^TAUSTA\s*:\s*(.+)$/i.exec(line))) { cur.soft = /^(kyllä|kylla|1|on)$/i.test(m[1].replace(/\s+$/, '')); continue; }
          if ((m = /^PIILOSSA\s*:\s*(.+)$/i.exec(line))) { cur.hidden = /^(kyllä|kylla|1|on)$/i.test(m[1].replace(/\s+$/, '')); continue; }
          if ((m = /^TOIMI\s*:\s*(.+)$/i.exec(line))) { cur.action = m[1]; continue; }
          if ((m = /^MENE\s*:\s*(.+)$/i.exec(line))) { cur.go = parseTarget(m[1], n); continue; }
          if ((m = /^VERBI\s*:\s*(.+)$/i.exec(line))) { continue; }
          if ((m = /^EHTO\s*:\s*(.+)$/i.exec(line))) { cur.cond = cond(m[1], n); continue; }
          if ((m = /^PYSTY\s*:\s*(.+)$/i.exec(line))) { if (/^(ei|-)\s*$/i.test(m[1])) { cur.rects.p = false; continue; } var pr2 = numbers(m[1], 4); if (pr2) { cur.rects.p = pr2; } else { err(n, 'PYSTY tarvitsee neljä lukua (tai sanan ei, jos kohtaa ei ole pystykuvassa)'); } continue; }
          if ((m = /^RAJA\s*([1-4])\s*:\s*(.+)$/i.exec(line))) { var rr = numbers(m[2], 4); if (rr) { cur.rects['s' + m[1]] = rr; } else { err(n, 'RAJA tarvitsee neljä lukua'); } continue; }
          if ((m = /^K[ÄA]YT[ÄA]\s+(\S+)\s*:\s*(.+)$/i.exec(line))) { continue; }
          err(n, 'Tuntematon rivi kuva-osiossa: ' + line);
          continue;
        }

        if (secKind === 'person') {
          var ps = sec.person;
          if ((m = /^NIMI\s*:\s*(.+)$/i.exec(line))) { ps.name = m[1]; cur = null; continue; }
          if ((m = /^KUVA\s*:\s*(\S+)$/i.exec(line))) { ps.img = m[1]; cur = null; continue; }
          if ((m = /^RAJAUS\s*:\s*(.+)$/i.exec(line))) { var pf = numbers(m[1], 4); if (pf) { ps.focus = pf; } else { err(n, 'RAJAUS tarvitsee neljä lukua'); } cur = null; continue; }
          if ((m = /^KATSO\s*:\s*(.+)$/i.exec(line))) { ps.look = m[1]; ps.looks = (ps.looks || []).concat([m[1]]); cur = null; continue; }
          if ((m = /^TERVEHDYS\s*:\s*(.+)$/i.exec(line))) { ps.greeting = m[1]; cur = null; continue; }
          if ((m = /^POISTUU\s*:\s*(\S+)$/i.exec(line))) { ps.leave = sceneId(m[1]); cur = null; continue; }
          if ((m = /^K[ÄA]YT[ÄA]\s+(\S+)\s*:\s*(.+)$/i.exec(line))) { cur = null; continue; }
          if ((m = /^AIHE\s+(\S+)\s*:\s*(.+)$/i.exec(line))) { cur = { id: sceneId(m[1]), label: m[2], text: '', cond: null, sanity: 0 }; ps.topics.push(cur); continue; }
          if (cur && (m = /^EHTO\s*:\s*(.+)$/i.exec(line))) { cur.cond = cond(m[1], n); continue; }
          if (cur && (m = /^J[ÄA]RKI\s*:\s*([+-]?\s*\d+)$/i.exec(line))) { cur.sanity = parseInt(m[1].replace(/\s+/g, ''), 10); continue; }
          if (cur) { cur.text += (cur.text ? ' ' : '') + line; continue; }
          err(n, 'Tuntematon rivi henkilö-osiossa: ' + line);
          continue;
        }

        if (secKind === 'detour' && detourHeader) {
          if ((m = /^(?:VÄLILLÄ|VALILLA)\s+(.+?)\s*->\s*(.+)$/i.exec(line))) { sec.from = m[1] === '*' ? '*' : sceneId(m[1]); sec.to = m[2].replace(/\s+$/, '') === '*' ? '*' : sceneId(m[2]); continue; }
          if (/^TOISTUU\s*$/i.test(line)) { sec.repeat = true; continue; }
          if ((m = /^PERILLE\s+(\S+)\s*$/i.exec(line))) { sec.goal = sceneId(m[1]); continue; }
          if ((m = /^KUN\s+(.+)$/i.exec(line))) { sec.condText = m[1]; sec.cond = cond(m[1], n); continue; }
        }

        if ((m = /^(?:-{3,}|JATKUU)\s*(?:(KUN|JOS)\s+(.+?)|(MUUTEN))?\s*$/i.exec(line))) {
          flush(n);
          detourHeader = false;
          commitBlock();
          var lead = { kind: 'plain' };
          if (m[1]) { lead = { kind: m[1].toLowerCase(), cond: cond(m[2], n), condText: m[2] }; }
          else if (m[3]) { lead = { kind: 'muuten' }; }
          block = { lead: lead, items: [], line: n };
          pending = null; last = null; collect = null;
          continue;
        }

        if (collect) { collect.lines.push(parseNodes(line, n)); continue; }

        // a backslash at the start of a line makes the rest plain text (use it if a sentence has to start with a reserved character or keyword)
        if (line.charAt(0) === '\\') {
          if (!para.length) { paraLine = n; paraSay = false; }
          para.push(line.slice(1).replace(/^\s+/, ''));
          continue;
        }

        if ((m = /^(KUN|JOS)\s+(.+)$/i.exec(line))) {
          var exact = m[1] === m[1].toUpperCase();
          var cc = softCond(m[1], m[2], n, exact);
          if (cc) {
            flush(n); detourHeader = false;
            pending = { kind: m[1].toLowerCase(), cond: cc, condText: m[2], line: n };
            continue;
          }
        } else if (/^MUUTEN\s*$/i.test(line)) { flush(n); detourHeader = false; pending = { kind: 'muuten', line: n }; continue; }

        if ((m = /^OTSIKKO\s*:\s*(.*)$/i.exec(line))) {
          flush(n);
          var tl = pending; pending = null;
          if (secKind === 'detour' && detourHeader) { tl = null; }
          assemble(sec.titles, 'title', { nodes: parseNodes(m[1], n) }, tl, n);
          continue;
        }
        if ((m = /^(?:SÄÄ|SAA)\s*:\s*(.*)$/i.exec(line))) { sec.weather = norm(m[1]) === 'paalla'; continue; }
        if ((m = /^PIHA\s*:\s*(.*)$/i.exec(line))) { sec.yard = /^(kyllä|kylla|1|on)$/i.test(m[1].replace(/\s+$/, '')); continue; }

        detourHeader = false;

        if ((m = /^PUHE\s*:\s*(.+)$/i.exec(line))) {
          flush(n);
          paraLine = n; paraSay = true; para.push(m[1]);
          continue;
        }
        if ((m = /^(?:NÄYTÄ|NAYTA)\s+(\S+)\s*$/i.exec(line))) {
          var w = norm(m[1]);
          if (SHOW[w] || m[0].indexOf('NÄYTÄ') === 0 || m[0].indexOf('NAYTA') === 0) {
            flush(n);
            if (!SHOW[w]) { err(n, 'Tuntematon NÄYTÄ-kohde: ' + m[1] + ' (sallitut: hahmo, kortti, kyltti, kartta, kissa, avaus, kaytava, ovi, omistaja, leima)'); pending = null; continue; }
            var it = { type: 'show', what: w, lines: [], line: n };
            addItem(it, n);
            if (w === 'kortti' || w === 'kyltti') { collect = it; }
            continue;
          }
        }
        if ((m = /^KYSY\s+(\S+)\s*$/i.exec(line))) {
          var q = norm(m[1]);
          if (ASK[q] || m[0].indexOf('KYSY') === 0) {
            flush(n);
            if (!ASK[q]) { err(n, 'Tuntematon KYSY-kohde: ' + m[1] + ' (sallitut: nimi, klaani, yhteys, viesti, vahvista)'); pending = null; continue; }
            addItem({ type: 'ask', kind: q, line: n }, n);
            continue;
          }
        }
        if ((m = /^HEITTO\s+(\S+)\s*$/i.exec(line))) { flush(n); addItem({ type: 'roll', key: norm(m[1]), line: n }, n); continue; }
        if ((m = /^J[ÄA]RKI\s+([+-])\s*(\d{1,2})\s*$/i.exec(line))) { flush(n); addItem({ type: 'sanity', d: (m[1] === '-' ? -1 : 1) * parseInt(m[2], 10), line: n }, n); continue; }
        if ((m = /^LOPPU\s+(\S+)\s*$/i.exec(line))) { flush(n); addItem({ type: 'ending', id: sceneId(m[1]), line: n }, n); continue; }
        if ((m = /^OTA\s+(\S+)\s*$/i.exec(line))) { flush(n); addItem({ type: 'take', item: norm(m[1]), line: n }, n); continue; }
        if ((m = /^HAHMO\s+(\S+)\s+PAIKKA\s+(\d+)\s*$/i.exec(line))) { flush(n); addItem({ type: 'cast', who: sceneId(m[1]), place: m[2], line: n }, n); continue; }
        if (line.charAt(0) === '>') {
          flush(n);
          var body = line.replace(/^>\s*/, '');
          var idx = body.lastIndexOf('->');
          if (idx < 0) { err(n, 'Valinnalta puuttuu kohde: kirjoita "-> kohde" rivin loppuun'); pending = null; continue; }
          var label = body.slice(0, idx).replace(/\s+$/, ''), tg = body.slice(idx + 2);
          if (!label || !/\S/.test(tg)) { err(n, 'Valinta on vajaa (teksti -> kohde)'); pending = null; continue; }
          var cn = parseNodes(label, n), tgt = parseTarget(tg, n);
          addItem({ type: 'choice', nodes: cn, target: tgt, aside: null, line: n, needsPhone: needsPhone(cn, tgt) }, n);
          continue;
        }
        if (line.charAt(0) === '?') {
          flush(n);
          if (!last) { err(n, 'Lisätieto (?) ilman edeltävää kappaletta tai valintaa'); continue; }
          last.aside = parseNodes(line.replace(/^\?\s*/, ''), n);
          continue;
        }

        // ordinary text. Warn about lines that look like a mistyped keyword.
        if ((m = /^([A-Za-zÄÖÅäöå]+)(\s|:|$)/.exec(line)) && !para.length && line.indexOf(' | ') < 0) {
          var tok = m[1], near = nearKeyword(tok);
          if (near && ((tok === tok.toUpperCase() && tok.length >= 3) || m[2] === ':')) {
            warn(n, 'Rivi alkaa sanalla "' + tok + '". Tarkoititko avainsanaa ' + near + '? Rivi näytetään tavallisena tekstinä.');
          } else if (!near && /^[A-ZÄÖÅ]{4,}$/.test(tok) && KEYWORDS.indexOf(tok) < 0 && /[a-zäöå]/.test(line) && line.indexOf('{') < 0) {
            warn(n, 'Rivi alkaa isolla sanalla "' + tok + '", joka ei ole avainsana: käsitelty tavallisena tekstinä');
          }
        }
        if (!para.length) { paraLine = n; paraSay = false; }
        para.push(line);
      } catch (e) {
        err(n, 'Rivin lukeminen epäonnistui: ' + (e && e.message));
      }
    }
    flush(lines.length);
    endSection(lines.length);
    validate(story);
    return story;
  }

  function validate(story) {
    var ids = story.scenes;
    function checkTarget(t, n) {
      if (t.kind !== 'scene') { return; }
      if (!ids[t.id] && t.id !== 'kierto') { story.errors.push({ line: n, msg: 'Kohdetta "' + t.id + '" ei löydy: valinta vie alkuun' }); }
    }
    function walkNodes(nodes, n) {
      var k;
      for (k = 0; k < nodes.length; k++) { if (nodes[k].t === 'link') { checkTarget(nodes[k].target, n); } }
    }
    function walkBeats(beats) {
      var a, b, c, g, it;
      for (a = 0; a < beats.length; a++) {
        for (b = 0; b < beats[a].alts.length; b++) {
          var items = beats[a].alts[b].data.items;
          for (c = 0; c < items.length; c++) {
            for (g = 0; g < items[c].alts.length; g++) {
              it = items[c].alts[g].data;
              if (it.type === 'choice') { checkTarget(it.target, it.line); walkNodes(it.nodes, it.line); }
              if (it.type === 'p' || it.type === 'say') { walkNodes(it.nodes, it.line); }
              if (it.type === 'ending' && story.endings.indexOf(it.id) < 0) { story.errors.push({ line: it.line, msg: 'Loppua "' + it.id + '" ei ole määritelty osiossa == loput' }); }
              if (it.type === 'cast' && !story.people[it.who]) { story.errors.push({ line: it.line, msg: 'Henkilöä "' + it.who + '" ei ole määritelty (HENKILÖ ' + it.who + ')' }); }
            }
          }
        }
      }
    }
    var k, d;
    for (k in ids) {
      if (!ids[k].titles.length && k !== 'kaynnistys') { story.warnings.push({ line: ids[k].line, msg: 'Kohtaukselta "' + k + '" puuttuu OTSIKKO' }); }
      if (!ids[k].beats.length) { story.errors.push({ line: ids[k].line, msg: 'Kohtaus "' + k + '" on tyhjä' }); }
      walkBeats(ids[k].beats);
    }
    for (d = 0; d < story.detours.length; d++) {
      var dt = story.detours[d];
      if (dt.from !== '*' && !ids[dt.from]) { story.errors.push({ line: dt.line, msg: 'Kiertotie ' + dt.name + ': lähtökohtausta "' + dt.from + '" ei löydy' }); }
      if (dt.to !== '*' && !ids[dt.to]) { story.errors.push({ line: dt.line, msg: 'Kiertotie ' + dt.name + ': kohdekohtausta "' + dt.to + '" ei löydy' }); }
      if (dt.goal && !ids[dt.goal]) { story.errors.push({ line: dt.line, msg: 'Kiertotie ' + dt.name + ': PERILLE-kohtausta "' + dt.goal + '" ei löydy' }); }
      if (!dt.beats.length) { story.errors.push({ line: dt.line, msg: 'Kiertotie ' + dt.name + ' on tyhjä' }); }
      walkBeats(dt.beats);
    }
    for (k in story.people) {
      var pe = story.people[k];
      if (!ids[pe.leave]) { story.errors.push({ line: 0, msg: 'Henkilö ' + k + ': POISTUU-kohtausta "' + pe.leave + '" ei löydy' }); }
      if (!pe.topics.length) { story.warnings.push({ line: 0, msg: 'Henkilöllä ' + k + ' ei ole aiheita (AIHE)' }); }
    }
    if (!ids.alku) { story.errors.push({ line: 0, msg: 'Kohtaus "alku" puuttuu: sivu käyttää varakohtausta' }); }
  }

  /* ---------- resolution: pick the winning alternative of each group ---------- */
  // forced: {"scene.N": altIndex}
  function pick(group, ctx, forced) {
    if (forced && forced[group.id] !== undefined) { return group.alts[forced[group.id]] || null; }
    var best = null, bestSpec = -1, def = null, a, alt, s;
    for (a = 0; a < group.alts.length; a++) {
      alt = group.alts[a];
      if (alt.data && alt.data.needsPhone && !ctx.phone) { continue; }
      if (alt.cond === null) { if (!def) { def = alt; } continue; }
      s = G.match(alt.cond, ctx, group.id + '.' + a);
      if (s > bestSpec) { best = alt; bestSpec = s; }
    }
    return best && bestSpec >= 0 ? best : def;
  }
  function pickIndex(group, ctx, forced) {
    var alt = pick(group, ctx, forced);
    return alt ? group.alts.indexOf(alt) : -1;
  }

  // Resolve a scene or detour to {title, beats:[[item,...]]} for the given context.
  function resolve(sec, ctx, forced) {
    var out = { title: null, beats: [], weather: !!sec.weather };
    var t, b, i, ba, ia, items;
    for (t = 0; t < sec.titles.length; t++) {
      ba = pick(sec.titles[t], ctx, forced);
      if (ba) { out.title = ba.data.nodes; }
    }
    for (b = 0; b < sec.beats.length; b++) {
      ba = pick(sec.beats[b], ctx, forced);
      if (!ba) { continue; }
      items = [];
      for (i = 0; i < ba.data.items.length; i++) {
        ia = pick(ba.data.items[i], ctx, forced);
        if (ia && !(ia.data.needsPhone && !ctx.phone)) { items.push(ia.data); }
      }
      if (items.length) { out.beats.push(items); }
    }
    return out;
  }

  window.Paita.story = { parse: parseStory, resolve: resolve, pick: pick, pickIndex: pickIndex, sceneId: sceneId, exitId: exitId };
})();
