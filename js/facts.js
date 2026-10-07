/* Shared: fills business facts from config.js into the page and answers "is the shop open now?". */
(function () {
  'use strict';
  var cfg = window.PAITA_CONFIG || {};
  var DAYS_ESSIVE = ['sunnuntaina', 'maanantaina', 'tiistaina', 'keskiviikkona', 'torstaina', 'perjantaina', 'lauantaina'];

  function toMin(hhmm) {
    var p = String(hhmm).split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  // ---- URL overrides (testing) ----
  // Rule: a URL that carries any of these parameters REPLACES the active set and it is kept in sessionStorage for this
  // browser tab, so the settings survive navigation, reloads and a trip to tylsa.html/tietosuoja.html and back.
  // ?ov=0 (or the "clear" button in galaksi.html) removes them. Without storage they apply to the current URL only.
  var OV_NAMES = ['nyt', 'kuu', 'aika', 'valo', 'aurinko', 'paiva', 'kausi', 'auki', 'palaava', 'siemen', 'nahty', 'arpa', 'puhelin', 'paletti'];
  function urlParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    if (!m) { return null; }
    try { return decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { return m[1]; }
  }
  var overrides = {};
  (function () {
    var got = {}, any = false, i, v;
    for (i = 0; i < OV_NAMES.length; i++) { v = urlParam(OV_NAMES[i]); if (v !== null) { got[OV_NAMES[i]] = v; any = true; } }
    var clear = urlParam('ov') === '0';
    try {
      if (clear) { sessionStorage.removeItem('paita.ov'); overrides = got; }
      else if (any) { overrides = got; sessionStorage.setItem('paita.ov', JSON.stringify(got)); }
      else { var s = sessionStorage.getItem('paita.ov'); overrides = s ? (JSON.parse(s) || {}) : {}; }
    } catch (e) { overrides = any ? got : {}; }
  })();
  function param(name) {
    if (overrides.hasOwnProperty(name)) { return overrides[name]; }
    if (OV_NAMES.indexOf(name) >= 0) { return null; }
    return urlParam(name);
  }
  if (param('puhelin') === '0') { cfg.showPhone = false; }
  if (param('puhelin') === '1') { cfg.showPhone = true; }

  // Fixed-rule Finnish DST (EU rule, valid indefinitely): UTC+3 from the last Sunday of March 01:00 UTC
  // to the last Sunday of October 01:00 UTC, otherwise UTC+2.
  function lastSunday(y, mo) { // mo 0-based; returns day of month
    var d = new Date(Date.UTC(y, mo + 1, 0));
    return d.getUTCDate() - d.getUTCDay();
  }
  function fiOffsetHours(utcMs) {
    var y = new Date(utcMs).getUTCFullYear();
    var s = Date.UTC(y, 2, lastSunday(y, 2), 1), e = Date.UTC(y, 9, lastSunday(y, 9), 1);
    return (utcMs >= s && utcMs < e) ? 3 : 2;
  }
  function wallToUtc(y, mo, d, h, mi) { // Helsinki wall clock (mo 1-based) -> UTC ms
    var guess = Date.UTC(y, mo - 1, d, h, mi);
    return guess - fiOffsetHours(guess - 2 * 3600000) * 3600000;
  }
  function fromUtc(utc, fake) {
    var o = fiOffsetHours(utc);
    var w = new Date(utc + o * 3600000);
    return { y: w.getUTCFullYear(), mo: w.getUTCMonth() + 1, d: w.getUTCDate(), h: w.getUTCHours(), mi: w.getUTCMinutes(),
      dow: w.getUTCDay(), min: w.getUTCHours() * 60 + w.getUTCMinutes(), utc: utc, fake: !!fake };
  }

  // Current time in Helsinki. ?nyt=YYYY-MM-DDTHH:MM overrides (read as Helsinki wall time).
  // Normal path: Intl time zone lookup; if that fails, the fixed-rule calculation above (which only needs a
  // correct clock). If the clock itself is wrong there is nothing to be done and nothing breaks.
  function helsinkiNow() {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(param('nyt') || '');
    if (m) { return fromUtc(wallToUtc(+m[1], +m[2], +m[3], +m[4], +m[5]), true); }
    var utc = Date.now();
    var r = fromUtc(utc, false);
    try {
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: (cfg.hours && cfg.hours.timeZone) || 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(utc));
      var o = {};
      parts.forEach(function (p) { o[p.type] = p.value; });
      var min = (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10);
      if (!isNaN(min) && min === r.min) { return r; }
      if (!isNaN(min)) { // Intl and the fixed rule disagree (rule change?): trust Intl for the clock, keep the date from the rule
        r.min = min; r.h = Math.floor(min / 60); r.mi = min % 60;
      }
    } catch (e) { /* fixed rule result stands */ }
    return r;
  }

  function isOpen(now) {
    var ov = param('auki');
    if (ov === '1') { return true; }
    if (ov === '0') { return false; }
    now = now || helsinkiNow();
    var h = cfg.hours;
    if (!h) { return false; }
    return h.days.indexOf(now.dow) !== -1 && now.min >= toMin(h.open) && now.min < toMin(h.close);
  }

  // Returns a Finnish phrase such as "tiistaina kello 12:00".
  function nextOpenPhrase(now) {
    now = now || helsinkiNow();
    var h = cfg.hours;
    for (var off = 0; off <= 7; off++) {
      var dow = (now.dow + off) % 7;
      if (h.days.indexOf(dow) === -1) { continue; }
      if (off === 0 && now.min >= toMin(h.open)) { continue; }
      var when = off === 0 ? 'tänään' : (off === 1 ? 'huomenna' : DAYS_ESSIVE[dow]);
      return when + ' kello ' + h.open;
    }
    return '';
  }

  function statusText() {
    var now = helsinkiNow();
    if (isOpen(now)) { return 'Ovi on raollaan nyt kello ' + cfg.hours.close + ' asti.'; }
    return 'Ovi aukeaa seuraavan kerran ' + nextOpenPhrase(now) + '.';
  }

  function derived(key) {
    if (key === 'openTime') { return cfg.hours.open; }
    if (key === 'closeTime') { return cfg.hours.close; }
    return cfg[key];
  }

  function hrefFor(kind) {
    if (kind === 'tel') { return 'tel:' + (cfg.phoneTel || String(cfg.phone).replace(/[^0-9+]/g, '')); }
    if (kind === 'mail') { return 'mailto:' + cfg.email; }
    if (kind === 'route') { return 'https://www.google.com/maps/dir/?api=1&destination=' + cfg.lat + ',' + cfg.lng; }
    return null;
  }

  function fill(root) {
    root = root || document;
    var i, els = root.querySelectorAll('[data-config]');
    for (i = 0; i < els.length; i++) {
      var v = derived(els[i].getAttribute('data-config'));
      if (v !== undefined && v !== null) { els[i].textContent = v; }
    }
    els = root.querySelectorAll('[data-config-href]');
    for (i = 0; i < els.length; i++) {
      var h = hrefFor(els[i].getAttribute('data-config-href'));
      if (h) { els[i].setAttribute('href', h); }
    }
    // data-phone="on" is shown only when showPhone; data-phone="off" only when it is not.
    els = root.querySelectorAll('[data-phone]');
    for (i = 0; i < els.length; i++) {
      els[i].hidden = (els[i].getAttribute('data-phone') === 'on') !== (cfg.showPhone !== false);
    }
    els = root.querySelectorAll('[data-hours-status]');
    for (i = 0; i < els.length; i++) { els[i].textContent = statusText(); }
  }

  window.Paita = { config: cfg, param: param, overrides: function () { return overrides; }, OV_NAMES: OV_NAMES, wallToUtc: wallToUtc, fromUtc: fromUtc, fiOffsetHours: fiOffsetHours, helsinkiNow: helsinkiNow, hrefFor: hrefFor, derived: derived, isOpen: isOpen, statusText: statusText, fill: fill };

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', function () { fill(); }); } else { fill(); }
})();
