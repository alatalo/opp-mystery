/*
 * Oulun Paitapaino - business facts, opening hours and form endpoint.
 * This is the ONE file to edit when the real facts arrive.
 * Currently there are no placeholders left: address and email are verified by the client.
 * Story copy lives in tarina.txt (see docs/OHJE-TEKSTIT.md); this file only holds facts.
 */
window.PAITA_CONFIG = {
  name: 'Oulun Paitapaino',

  email: 'info@oulunpaitapaino.fi',     // verified by the client

  // Phone: real, but the owner has not decided yet whether it is shown on the site.
  // showPhone: false hides the phone everywhere that JS renders it. Static spots (no-JS HTML,
  // JSON-LD) are marked "PHONE: remove if showPhone is false" - see README.
  showPhone: true,
  phone: '045 7834 8307',
  phoneTel: '+3584578348307',
  // Verified by the client.
  street: 'Pikisaarentie 15',
  postal: '90100 Oulu',
  area: 'Pikisaari, Oulu',

  // Verified: the geo coordinates of the current site (used for the route link).
  lat: 65.0190053,
  lng: 25.4528008,

  // Opening hours, evaluated in Europe/Helsinki time whatever the visitor's timezone.
  // days: 0 = Sunday, 1 = Monday ... 6 = Saturday. Currently Tuesday-Friday.
  // NOTE: the card text "TIISTAISTA PERJANTAIHIN" in index.html / tylsa.html is copy;
  // change it by hand if the days change.
  hours: {
    timeZone: 'Europe/Helsinki',
    days: [2, 3, 4, 5],
    open: '12:00',
    close: '18:00'
  },

  // Form endpoint. Production (cPanel): 'api/laheta.php'.
  // Empty string = GitHub Pages demo: the form falls back to opening a mailto: message.
  formEndpoint: '',

  // Minimum time (ms) a visitor must spend on the page before the form is accepted.
  minFillMs: 3000
};
