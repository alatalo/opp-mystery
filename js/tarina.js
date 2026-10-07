/* Parser for tarina.txt (format: see the comments at the top of that file and docs/OHJE-TEKSTIT.md).
   Tolerant by design: an error is recorded with its line number and the rest of the story still works.
   ES5 on purpose (old Safari). */
(function () {
  'use strict';
  var G = window.Paita.galaksi;
  var norm = G.norm;

  var KEYWORDS = ['KUN', 'JOS', 'MUUTEN', 'OTSIKKO', 'SÄÄ', 'NÄYTÄ', 'KYSY', 'KIERTOTIE', 'VÄLILLÄ', 'TOISTUU', 'JATKUU',
    'NAYTA', 'VALILLA', 'SAA'];
  var SHOW = { hahmo: 1, kortti: 1, kyltti: 1, kartta: 1, kissa: 1 };
  var ASK = { nimi: 1, klaani: 1, yhteys: 1, viesti: 1, vahvista: 1 };
  var FACTS = { puhelin: 'phone', sahkoposti: 'email', katu: 'street', postinumero: 'postal', avaus: 'openTime', sulkeminen: 'closeTime',
    tilanne: 'status', nimi: 'name', kuu: 'kuu', kellonaika: 'kello', viikonpaiva: 'viikonpaiva', aurinko: 'aurinko', valo: 'valo' };
  var ACTIONS = { puhelin: 'tel', sahko: 'mail', sahkoposti: 'mail', reitti: 'route' };

  function sceneId(s) { return norm(s).replace(/[^a-z0-9~:_-]+/g, '-').replace(/^-+|-+$/g, ''); }

  function parseStory(text) {
    var story = { scenes: {}, order: [], detours: [], texts: {}, errors: [], warnings: [] };
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
      if (/^https?:\/\//i.test(t)) { return { kind: 'url', url: t }; }
      var k = norm(t);
      if (ACTIONS[k]) { return { kind: 'action', action: ACTIONS[k], word: k }; }
      return { kind: 'scene', id: sceneId(t), n: n };
    }
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
      pending = null; last = null; collect = null;
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
      if (lead && lead.cond && lead.cond.error) { /* condition error already recorded; keep item with a never-true condition */ }
      item.needsPhone = !!item.needsPhone;
      assemble(block.items, item.type, item, lead, n);
      if (item.type === 'p' || item.type === 'choice') { last = item; }
    }

    function flush(n) {
      if (!para.length) { return; }
      var txt = para.join(' ').replace(/\s+/g, ' ').replace(/^ | $/g, '');
      var ln = paraLine;
      para = [];
      if (!sec) { err(ln, 'Teksti ennen ensimmäistä kohtausta (== nimi): ohitetaan'); return; }
      if (secKind === 'texts') { return; }
      var nodes = parseNodes(txt, ln);
      addItem({ type: 'p', nodes: nodes, aside: null, line: ln, needsPhone: needsPhone(nodes, null) }, ln);
    }

    var i, raw, line, m, n;
    for (i = 0; i < lines.length; i++) {
      n = i + 1;
      raw = lines[i];
      line = raw.replace(/^\s+|\s+$/g, '');
      try {
        if (line.charAt(0) === '#') { continue; }
        if (line === '') { if (secKind !== 'texts') { flush(n); } collect = null; continue; }

        if ((m = /^==\s*(.+?)\s*=*$/.exec(line))) {
          var id = sceneId(m[1]);
          if (id === 'tekstit') { startSection('texts', id, n); sec.id = 'tekstit'; continue; }
          startSection('scene', id, n);
          if (!id) { err(n, 'Kohtauksen nimi puuttuu'); }
          continue;
        }
        if ((m = /^(KIERTOTIE|KIERTOTEI)\s+(.+)$/.exec(line))) {
          startSection('detour', sceneId(m[2]), n);
          sec.from = '*'; sec.to = '*'; sec.cond = null; sec.condText = ''; sec.repeat = false;
          detourHeader = true;
          continue;
        }
        if (!sec) { err(n, 'Teksti ennen ensimmäistä kohtausta (== nimi): ohitetaan'); continue; }

        if (secKind === 'texts') {
          if ((m = /^([^:]+?)\s*:\s*(.*)$/.exec(line))) { story.texts[norm(m[1])] = m[2]; }
          else { err(n, 'Tekstirivi ilman kaksoispistettä: ' + line); }
          continue;
        }

        if (secKind === 'detour' && detourHeader) {
          if ((m = /^(?:VÄLILLÄ|VALILLA)\s+(.+?)\s*->\s*(.+)$/.exec(line))) { sec.from = m[1] === '*' ? '*' : sceneId(m[1]); sec.to = m[2].replace(/\s+$/, '') === '*' ? '*' : sceneId(m[2]); continue; }
          if (line === 'TOISTUU') { sec.repeat = true; continue; }
          if ((m = /^KUN\s+(.+)$/.exec(line))) { sec.condText = m[1]; sec.cond = cond(m[1], n); continue; }
        }

        if ((m = /^(?:-{3,}|JATKUU)\s*(?:(KUN|JOS)\s+(.+?)|(MUUTEN))?\s*$/.exec(line))) {
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

        if ((m = /^(KUN|JOS)\s+(.+)$/.exec(line))) {
          flush(n); detourHeader = false;
          pending = { kind: m[1].toLowerCase(), cond: cond(m[2], n), condText: m[2], line: n };
          continue;
        }
        if (/^MUUTEN\s*$/.test(line)) { flush(n); detourHeader = false; pending = { kind: 'muuten', line: n }; continue; }

        if ((m = /^OTSIKKO\s*:\s*(.*)$/.exec(line))) {
          flush(n);
          var tl = pending; pending = null;
          if (secKind === 'detour' && detourHeader) { tl = null; }
          assemble(sec.titles, 'title', { nodes: parseNodes(m[1], n) }, tl, n);
          continue;
        }
        if ((m = /^(?:SÄÄ|SAA)\s*:\s*(.*)$/.exec(line))) { sec.weather = norm(m[1]) === 'paalla'; continue; }

        detourHeader = false;

        if ((m = /^(?:NÄYTÄ|NAYTA)\s+(\S+)\s*$/.exec(line))) {
          flush(n);
          var w = norm(m[1]);
          if (!SHOW[w]) { err(n, 'Tuntematon NÄYTÄ-kohde: ' + m[1] + ' (sallitut: hahmo, kortti, kyltti, kartta, kissa)'); pending = null; continue; }
          var it = { type: 'show', what: w, lines: [], line: n };
          addItem(it, n);
          if (w === 'kortti' || w === 'kyltti') { collect = it; }
          continue;
        }
        if ((m = /^KYSY\s+(\S+)\s*$/.exec(line))) {
          flush(n);
          var q = norm(m[1]);
          if (!ASK[q]) { err(n, 'Tuntematon KYSY-kohde: ' + m[1] + ' (sallitut: nimi, klaani, yhteys, viesti, vahvista)'); pending = null; continue; }
          addItem({ type: 'ask', kind: q, line: n }, n);
          continue;
        }
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

        // ordinary text
        if ((m = /^([A-ZÄÖÅ]{4,})(?:\s|:|$)/.exec(line)) && KEYWORDS.indexOf(m[1]) < 0 && /[a-zäöå]/.test(line) && line.indexOf('{') < 0) {
          warn(n, 'Rivi alkaa isolla sanalla "' + m[1] + '", joka ei ole avainsana: käsitelty tavallisena tekstinä');
        }
        if (!para.length) { paraLine = n; }
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
      if (!ids[t.id] && t.id !== 'kierto' ) { story.errors.push({ line: n, msg: 'Kohdetta "' + t.id + '" ei löydy: valinta vie alkuun' }); }
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
              if (it.type === 'p') { walkNodes(it.nodes, it.line); }
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
      if (!dt.beats.length) { story.errors.push({ line: dt.line, msg: 'Kiertotie ' + dt.name + ' on tyhjä' }); }
      walkBeats(dt.beats);
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
    var t, b, i, ba, g, ia, items;
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

  window.Paita.story = { parse: parseStory, resolve: resolve, pick: pick, pickIndex: pickIndex, sceneId: sceneId };
})();
