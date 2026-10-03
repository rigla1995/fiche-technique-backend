const isoDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

const todayStr = () => new Date().toISOString().split('T')[0];

// Calendrier des mensualités : UTC, comme les tableaux de bord (Date.UTC) et la promo « 1er mois offert »
// (clientsController : premier du mois tiré de toISOString). Ne jamais mélanger setDate()/getMonth() (heure
// locale) et toISOString() (UTC) : sur un serveur hors UTC, le « premier du mois » sortait la veille (« …-30 »).
// Les colonnes DATE arrivent en chaînes 'YYYY-MM-DD' (src/config/database.js), lues à minuit UTC par new Date().

// 'YYYY-MM-01' du mois UTC de l'instant donné.
const premierDuMoisUTC = (d = new Date()) => `${d.toISOString().slice(0, 7)}-01`;

// Ramène une date (chaîne ou Date) au premier de son mois UTC. Date invalide : RangeError, comme toISOString().
const normaliserMoisUTC = (valeur) => {
  const d = new Date(valeur);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
};

// Dernier jour d'une période de nbMois commençant à dateDebut : dateDebut + nbMois mois - 1 jour, en UTC.
const finDePeriodeUTC = (dateDebut, nbMois) => {
  const d = new Date(dateDebut);
  d.setUTCMonth(d.getUTCMonth() + Number(nbMois));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

// Premiers jours ('YYYY-MM-01') des mois de debut à fin inclus (mois de fin compris dès qu'il est atteint).
const moisCouvertsUTC = (debut, fin) => {
  const cle = (x) => isoDate(x instanceof Date ? x : new Date(x)).slice(0, 7);
  const [y0, m0] = cle(debut).split('-').map(Number);
  const [y1, m1] = cle(fin).split('-').map(Number);
  const mois = [];
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? (y += 1, m = 1) : (m += 1)) {
    mois.push(`${y}-${String(m).padStart(2, '0')}-01`);
  }
  return mois;
};

module.exports = { isoDate, todayStr, premierDuMoisUTC, normaliserMoisUTC, finDePeriodeUTC, moisCouvertsUTC };
