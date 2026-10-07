/* Galaksin asennot: all conditions of the story, computed locally with plain maths. No network, no tables that expire.
   Moon: synodic month. Sun: simple solar position for Oulu. Chance: seeded hash. Everything follows ?nyt= and the
   other URL overrides (see docs/OHJE-TEKSTIT.md). ES5 on purpose (old Safari). */
(function () {
  'use strict';
  var P = window.Paita;
  var LAT = 65.01, LON = 25.47;
  var SYN = 29.530588853;
  var RAD = Math.PI / 180;

  function norm(s) {
    return String(s).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a').replace(/\s+/g, ' ').replace(/^ | $/g, '');
  }

  /* ---------- moon ---------- */
  // Time of the k-th new moon (Meeus, truncated series: good to a few hours), as a Julian date
  function newMoonJd(k) {
    var T = k / 1236.85;
    var jde = 2451550.09766 + SYN * k + 0.00015437 * T * T;
    var M = (2.5534 + 29.10535670 * k) * RAD, Mp = (201.5643 + 385.81693528 * k) * RAD, F = (160.7108 + 390.67050284 * k) * RAD;
    return jde - 0.40720 * Math.sin(Mp) + 0.17241 * Math.sin(M) + 0.01608 * Math.sin(2 * Mp) + 0.01039 * Math.sin(2 * F) +
      0.00739 * Math.sin(Mp - M) - 0.00514 * Math.sin(Mp + M);
  }
  function moonAge(utcMs) { // days since the last new moon
    var jd = utcMs / 86400000 + 2440587.5;
    var k = Math.floor((jd - 2451550.09766) / SYN);
    var n = newMoonJd(k);
    if (n > jd) { n = newMoonJd(k - 1); } else if (newMoonJd(k + 1) <= jd) { n = newMoonJd(k + 1); }
    return jd - n;
  }
  function moonPhase(age) {
    if (age < 1.85 || age >= 27.68) { return 'uusi'; }
    if (age < 12.92) { return 'kasvava'; }
    if (age < 16.61) { return 'täysi'; }
    return 'vähenevä';
  }

  /* ---------- sun ---------- */
  function sunAlt(utcMs) {
    var n = utcMs / 86400000 + 2440587.5 - 2451545.0;
    var L = (280.460 + 0.9856474 * n) % 360;
    var g = ((357.528 + 0.9856003 * n) % 360) * RAD;
    var lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
    var eps = (23.439 - 0.0000004 * n) * RAD;
    var dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
    var gmst = (280.46061837 + 360.98564736629 * n) % 360;
    var H = (gmst + LON) * RAD - ra;
    return Math.asin(Math.sin(LAT * RAD) * Math.sin(dec) + Math.cos(LAT * RAD) * Math.cos(dec) * Math.cos(H)) / RAD;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }

  // Scan the Helsinki calendar day in 5-minute steps: highest and lowest altitude, sunrise, sunset.
  function sunDay(y, mo, d) {
    var max = -90, min = 90, rise = null, set = null, prev = null, t, a, m;
    for (m = 0; m <= 1440; m += 5) {
      t = P.wallToUtc(y, mo, d, 0, 0) + m * 60000;
      a = sunAlt(t);
      if (a > max) { max = a; }
      if (a < min) { min = a; }
      if (prev !== null) {
        if (prev < -0.833 && a >= -0.833 && rise === null) { rise = m; }
        if (prev >= -0.833 && a < -0.833 && set === null) { set = m; }
      }
      prev = a;
    }
    return { max: max, min: min, rise: rise, set: set };
  }

  var WEEKDAYS = ['sunnuntai', 'maanantai', 'tiistai', 'keskiviikko', 'torstai', 'perjantai', 'lauantai'];
  var WD_SHORT = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
  var MONTHS = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu', 'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];

  function seasonOf(mo) { return (mo >= 3 && mo <= 5) ? 'kevät' : (mo >= 6 && mo <= 8) ? 'kesä' : (mo >= 9 && mo <= 11) ? 'syksy' : 'talvi'; }
  function todOf(h) { return (h >= 5 && h < 10) ? 'aamu' : (h >= 10 && h < 17) ? 'päivä' : (h >= 17 && h < 22) ? 'ilta' : 'yö'; }

  /* ---------- seeded chance ---------- */
  function hash(str) { // cyrb53-style mix; Math.imul is available in every supported browser
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57, i, ch;
    for (i = 0; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ((h2 >>> 0) % 1048576 * 4294967296 + (h1 >>> 0)) / 4503599627370496;
  }
  function roll(seed, key) { return hash(String(seed) + '|' + key) * 100; }

  /* ---------- context ---------- */
  var OV_KUU = { uusi: 'uusi', uusikuu: 'uusi', kasvava: 'kasvava', taysi: 'täysi', taysikuu: 'täysi', vaheneva: 'vähenevä' };
  var OV_AIKA = { aamu: 'aamu', paiva: 'päivä', ilta: 'ilta', yo: 'yö' };
  var OV_VALO = { pimea: 'pimeä', pimeaa: 'pimeä', hamara: 'hämärä', valoisa: 'valoisa', valoisaa: 'valoisa' };
  var OV_KAUSI = { kevat: 'kevät', kesa: 'kesä', syksy: 'syksy', talvi: 'talvi' };
  var OV_SUN = { yoton: 'yötön', kaamos: 'kaamos', normaali: 'normaali' };

  // opts: { params: {name: value} overrides (strings), mem: {seen, flags, returning, seed, uusi}, scene: id }
  function context(opts) {
    opts = opts || {};
    var pr = opts.params || {};
    var mem = opts.mem || {};
    var now = pr.now || P.helsinkiNow();
    var c = { now: now };
    var age = moonAge(now.utc);
    c.moonAge = age;
    c.moon = OV_KUU[norm(pr.kuu || '')] || moonPhase(age);
    c.moonOverride = !!OV_KUU[norm(pr.kuu || '')];
    c.moonIllum = (1 - Math.cos(2 * Math.PI * age / SYN)) / 2;
    var day = sunDay(now.y, now.mo, now.d);
    c.sunDay = day;
    c.sunAlt = sunAlt(now.utc);
    c.sunRise = day.rise === null ? null : hm(day.rise);
    c.sunSet = day.set === null ? null : hm(day.set);
    var light = c.sunAlt >= -0.833 ? 'valoisa' : (c.sunAlt >= -4 ? 'hämärä' : 'pimeä');
    c.light = OV_VALO[norm(pr.valo || '')] || light;
    var polar = day.min >= -4 ? 'yötön' : (day.max < 3 ? 'kaamos' : 'normaali');
    c.polar = OV_SUN[norm(pr.aurinko || '')] || polar;
    c.tod = OV_AIKA[norm(pr.aika || '')] || todOf(now.h);
    var wd = now.dow;
    if (pr.paiva) {
      var pv = norm(pr.paiva), i;
      for (i = 0; i < 7; i++) { if (norm(WEEKDAYS[i]) === pv || WD_SHORT[i] === pv) { wd = i; } }
    }
    c.dow = wd;
    c.weekday = WEEKDAYS[wd];
    c.month = now.mo;
    c.season = OV_KAUSI[norm(pr.kausi || '')] || seasonOf(now.mo);
    c.open = pr.auki === '1' ? true : pr.auki === '0' ? false : P.isOpen(now);
    c.returning = pr.palaava === '1' ? true : pr.palaava === '0' ? false : !!mem.returning;
    c.seed = pr.siemen ? pr.siemen : (mem.seed || '1');
    c.chance = pr.arpa === 'kaikki' ? 'kaikki' : pr.arpa === 'ei' ? 'ei' : null;
    c.seen = {};
    var k;
    for (k in (mem.seen || {})) { if (mem.seen[k]) { c.seen[k] = mem.seen[k]; } }
    if (pr.nahty) { pr.nahty.split(',').forEach(function (x) { if (x) { c.seen[norm(x)] = 1; } }); }
    c.sent = !!(mem.flags && mem.flags.lahetetty);
    c.phone = P.config.showPhone !== false;
    c.paletti = pr.paletti ? norm(pr.paletti) : '';
    c.scene = opts.scene || '';
    c.mem = mem;
    return c;
  }

  // Dates for the named days (Helsinki calendar)
  function isJuhannus(n) { return n.mo === 6 && n.d >= 19 && n.d <= 26; }
  function isJoulu(n) { return n.mo === 12 && n.d >= 22 && n.d <= 26; }
  function isVappu(n) { return (n.mo === 4 && n.d === 30) || (n.mo === 5 && n.d === 1); }

  /* ---------- conditions ---------- */
  // atom name (normalized) -> function(ctx, arg, key)
  var SIMPLE = {
    'uusikuu': function (c) { return c.moon === 'uusi'; },
    'kasvava kuu': function (c) { return c.moon === 'kasvava'; },
    'taysikuu': function (c) { return c.moon === 'täysi'; },
    'vaheneva kuu': function (c) { return c.moon === 'vähenevä'; },
    'aamu': function (c) { return c.tod === 'aamu'; },
    'paiva': function (c) { return c.tod === 'päivä'; },
    'ilta': function (c) { return c.tod === 'ilta'; },
    'yo': function (c) { return c.tod === 'yö'; },
    'pimeaa': function (c) { return c.light === 'pimeä'; },
    'valoisaa': function (c) { return c.light !== 'pimeä'; },
    'hamara': function (c) { return c.light === 'hämärä'; },
    'aurinko ylhaalla': function (c) { return c.light === 'valoisa'; },
    'yoton yo': function (c) { return c.polar === 'yötön'; },
    'kaamos': function (c) { return c.polar === 'kaamos'; },
    'arki': function (c) { return c.dow >= 1 && c.dow <= 5; },
    'viikonloppu': function (c) { return c.dow === 0 || c.dow === 6; },
    'kevat': function (c) { return c.season === 'kevät'; },
    'kesa': function (c) { return c.season === 'kesä'; },
    'syksy': function (c) { return c.season === 'syksy'; },
    'talvi': function (c) { return c.season === 'talvi'; },
    'juhannus': function (c) { return isJuhannus(c.now); },
    'joulu': function (c) { return isJoulu(c.now); },
    'vappu': function (c) { return isVappu(c.now); },
    'auki': function (c) { return c.open; },
    'kiinni': function (c) { return !c.open; },
    'palaava': function (c) { return c.returning; },
    'uusi kavija': function (c) { return !c.returning; },
    'nahty': function (c) { return !!c.seen[norm(c.scene)]; },
    'lahettanyt': function (c) { return c.sent; },
    'puhelin esilla': function (c) { return c.phone; }
  };
  var i;
  for (i = 0; i < 7; i++) { (function (idx) { SIMPLE[norm(WEEKDAYS[idx])] = function (c) { return c.dow === idx; }; })(i); }
  for (i = 0; i < 12; i++) { (function (idx) { SIMPLE[norm(MONTHS[idx])] = function (c) { return c.month === idx + 1; }; })(i); }

  var ALL_ATOMS = [];
  (function () { var k; for (k in SIMPLE) { ALL_ATOMS.push(k); } })();

  function parseAtom(txt) {
    var t = norm(txt), neg = false, m;
    if (/^ei /.test(t)) { neg = true; t = t.slice(3); }
    if (SIMPLE[t]) { return { neg: neg, name: t }; }
    if ((m = /^arpa (\d{1,3}(?:[.,]\d+)?) ?%?$/.exec(t))) { return { neg: neg, name: 'arpa', arg: parseFloat(m[1].replace(',', '.')) }; }
    if ((m = /^nahty (.+)$/.exec(t))) { return { neg: neg, name: 'nahty x', arg: m[1] }; }
    return null;
  }

  // "yö JA täysikuu TAI talvi" -> OR of ANDs. Returns {branches, error?}
  function parseCond(text) {
    var out = { branches: [], error: null, text: text };
    var ors = String(text).split(/\s+TAI\s+/);
    var o, a, ands, atoms, at;
    for (o = 0; o < ors.length; o++) {
      ands = ors[o].split(/\s+JA\s+|\s*,\s*/);
      atoms = [];
      for (a = 0; a < ands.length; a++) {
        if (!/\S/.test(ands[a])) { continue; }
        at = parseAtom(ands[a]);
        if (!at) { out.error = 'Tuntematon ehto: "' + ands[a].replace(/^\s+|\s+$/g, '') + '"'; return out; }
        atoms.push(at);
      }
      if (!atoms.length) { out.error = 'Tyhjä ehto'; return out; }
      out.branches.push(atoms);
    }
    return out;
  }

  function evalAtom(at, c, key) {
    var r;
    if (at.name === 'arpa') {
      if (c.chance === 'kaikki') { r = true; } else if (c.chance === 'ei') { r = false; } else { r = roll(c.seed, key) < at.arg; }
    } else if (at.name === 'nahty x') {
      r = !!c.seen[at.arg];
    } else {
      r = SIMPLE[at.name](c);
    }
    return at.neg ? !r : r;
  }

  // Returns the number of atoms of the best matching branch, or -1 if the condition does not hold.
  function match(cond, c, key) {
    if (!cond || cond.error) { return -1; }
    var best = -1, b, a, ok, branch;
    for (b = 0; b < cond.branches.length; b++) {
      branch = cond.branches[b]; ok = true;
      for (a = 0; a < branch.length; a++) { if (!evalAtom(branch[a], c, key + '#' + b + '.' + a)) { ok = false; break; } }
      if (ok && branch.length > best) { best = branch.length; }
    }
    return best;
  }

  /* ---------- text for the story's voice ---------- */
  function describe(c) {
    var moon = { 'uusi': 'uusikuu', 'kasvava': 'kasvava kuu', 'täysi': 'täysikuu', 'vähenevä': 'vähenevä kuu' }[c.moon];
    var sun;
    if (c.polar === 'yötön') { sun = 'aurinko ei oikeastaan laske'; }
    else if (c.polar === 'kaamos') { sun = 'aurinko ei oikeastaan nouse'; }
    else { sun = c.light === 'valoisa' ? 'aurinko on ylhäällä' : c.light === 'hämärä' ? 'on hämärää' : 'on pimeää'; }
    return { moon: moon, sun: sun, light: c.light === 'pimeä' ? 'pimeä' : (c.light === 'hämärä' ? 'hämärä' : 'valoisa') };
  }

  /* ---------- palette (colour scheme) chosen from the conditions; the CSS lives in css/style.css ---------- */
  var PALETTES = [
    ['oletus', 'Oletus: sininen, valkoinen, keltainen, syaani. Tavallinen ilta ja yö, ja aina kun ei ole syytä muuhun.'],
    ['ylivalotus', 'Ylivalotus: valkoinen tausta, tummansininen teksti. Yötön yö (kesän valoisat yöt) tai hyvin korkea aurinko.'],
    ['kuutamo', 'Kuutamo: musta tausta, valkoinen ja vaalea teksti. Täysikuu ja pimeää.'],
    ['kaamos', 'Kaamos: tumma laivastonsininen, oletusvärit. Talven lyhyet päivät kun on hämärää tai pimeää.'],
    ['valaistu', 'Valaistu: oletus, mutta keltainen korostuu (linkit, kortti). Liike on auki juuri nyt.'],
    ['outo', 'Outo: magenta ja vihreä. Harvinainen (noin 3 % vierailuista, arvonta pysyy samana koko vierailun).']
  ];
  function palette(c) {
    var i;
    if (c.paletti) { for (i = 0; i < PALETTES.length; i++) { if (PALETTES[i][0] === c.paletti) { return c.paletti; } } }
    if (c.chance === 'kaikki' ? false : (c.chance === 'ei' ? false : roll(c.seed, 'paletti') < 3)) { return 'outo'; }
    if (c.moon === 'täysi' && c.light === 'pimeä') { return 'kuutamo'; }
    if (c.polar === 'kaamos' && c.light !== 'valoisa') { return 'kaamos'; }
    if (c.polar === 'yötön' || (c.light === 'valoisa' && c.sunAlt >= 40)) { return 'ylivalotus'; }
    if (c.open) { return 'valaistu'; }
    return 'oletus';
  }
  // Called from the <head> before the first paint (no flash of the wrong palette)
  function paletteNow() {
    var pr = {}, ov = P.overrides ? P.overrides() : {}, k, seed;
    for (k in ov) { if (ov.hasOwnProperty(k)) { pr[k] = ov[k]; } }
    seed = pr.siemen;
    if (!seed) {
      try {
        seed = sessionStorage.getItem('paita.ps');
        if (!seed) { seed = String(Math.floor(Math.random() * 1000000000)); sessionStorage.setItem('paita.ps', seed); }
      } catch (e) { seed = String(Math.floor(Date.now() / 3600000)); }
    }
    return palette(context({ params: pr, mem: { seed: seed } }));
  }

  window.Paita.galaksi = {
    PALETTES: PALETTES, palette: palette, paletteNow: paletteNow,
    norm: norm, context: context, parseCond: parseCond, match: match, roll: roll, hash: hash,
    moonAge: moonAge, moonPhase: moonPhase, sunAlt: sunAlt, sunDay: sunDay, hm: hm,
    WEEKDAYS: WEEKDAYS, WD_SHORT: WD_SHORT, MONTHS: MONTHS, ALL_ATOMS: ALL_ATOMS, describe: describe, todOf: todOf
  };
})();
