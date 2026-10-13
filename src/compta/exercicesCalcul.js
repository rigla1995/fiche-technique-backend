// LabFlow Compta, étape X1 « L'exercice suivant » (labflow-reprise/achats-compta/PLAN-EXERCICES.md §2 ligne X1, §3 ;
// réponses du client du 13/10 — « ok pour les 5 » : ouverture automatique à la première écriture de la nouvelle année et
// bouton pour ouvrir avant ; soldes de l'exercice précédent repris en provisoire tant qu'il n'est pas clos). Les règles
// PURES des exercices d'un dossier, partagées par la fiche (dossiers.js), l'ouverture (exercices.js), la saisie
// (ecritures.js), les livres, les périodes et les taxes ; module SANS DÉPENDANCE (ni base, ni autre module de Compta) pour
// que chacun le lise sans cycle de chargement (modèle : echeances.js). Dates en texte « AAAA-MM-JJ ».
//   • l'exercice SUIVANT proposé : le lendemain de la fin du dernier exercice, 12 mois (fin au dernier jour d'un mois) ;
//     ouvrable tant qu'aucun exercice autre que le dernier n'est ouvert (deux exercices ouverts au plus : on n'ouvre pas
//     2028 tant que 2026 n'est pas clos) ;
//   • l'OUVERTURE AUTOMATIQUE : une écriture datée après le dernier exercice l'ouvre si sa date est d'aujourd'hui ou d'avant
//     et tombe dans l'exercice proposé (une faute de frappe sur l'année — 2028 — n'ouvre rien : elle est refusée) ;
//   • le MILLÉSIME (numéros définitifs AC-2027-000001, unique dans le dossier) : l'année du début ; s'il est déjà pris (premier
//     exercice court, de janvier à mars 2026 par exemple), l'année de la fin ;
//   • l'exercice PAR DÉFAUT d'une page : celui qui contient la date du jour, sinon le plus récent des ouverts, sinon le plus
//     récent.
const pad = (n) => String(n).padStart(2, '0');
const dernierJour = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate(); // m : 1 à 12
const FORMAT_JOUR_TUNIS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' });
// Le jour à Tunis.
const aujourdhuiTunis = (d = new Date()) => FORMAT_JOUR_TUNIS.format(d);
const decaler = (s, jours) => {
  const t = new Date(`${s}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + jours);
  return t.toISOString().slice(0, 10);
};
const lendemain = (s) => decaler(s, 1);
const veille = (s) => decaler(s, -1);
// Fin d'un exercice de 12 mois commençant à `debut` : le dernier jour de son douzième mois.
const finDouzeMois = (debut) => {
  const [a0, m0] = debut.split('-').map(Number);
  const k = m0 - 1 + 11;
  const a = a0 + Math.floor(k / 12);
  const m = (k % 12) + 1;
  return `${a}-${pad(m)}-${pad(dernierJour(a, m))}`;
};
const fmtJour = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const libelleExercice = (x) => `du ${fmtJour(x.debut)} au ${fmtJour(x.fin)}`;

// Les exercices du plus ancien au plus récent (copie).
const croissants = (exercices) => [...exercices].sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));

// Le millésime d'un exercice : l'année du début, sinon celle de la fin ; null si les deux sont déjà pris (`pris` : les
// millésimes des autres exercices du dossier).
const millesimeDe = (debut, fin, pris = []) => {
  const p = new Set(pris.map(Number));
  const a = Number(debut.slice(0, 4));
  if (!p.has(a)) return a;
  const b = Number(fin.slice(0, 4));
  return p.has(b) ? null : b;
};

// L'exercice suivant d'un dossier (`exercices` : { debut, fin, etat, millesime }, dans n'importe quel ordre), ou null sans
// exercice : { debut, fin, millesime, possible, bloquant } — `bloquant` : l'exercice ouvert (autre que le dernier) qui
// empêche d'en ouvrir un troisième.
const exerciceSuivant = (exercices) => {
  const tries = croissants(exercices);
  const dernier = tries[tries.length - 1];
  if (!dernier) return null;
  const debut = lendemain(dernier.fin);
  const fin = finDouzeMois(debut);
  const bloquant = tries.slice(0, -1).find((x) => x.etat === 'ouvert') || null;
  const millesime = millesimeDe(debut, fin, tries.map((x) => x.millesime).filter((m) => m != null));
  return { debut, fin, millesime, possible: !bloquant && millesime != null, bloquant };
};

// L'ouverture automatique pour une écriture datée `date`, le jour `aujourdhui` : l'exercice suivant à ouvrir, ou null.
const ouvertureAutoPour = (exercices, date, aujourdhui) => {
  const s = exerciceSuivant(exercices);
  if (!s || !s.possible) return null;
  if (date < s.debut || date > s.fin || date > aujourdhui) return null;
  return s;
};

// L'exercice par défaut d'une page : l'exercice ouvert du jour, sinon le plus récent des ouverts, sinon le plus récent ; null
// sans exercice.
const exerciceParDefaut = (exercices, aujourdhui = aujourdhuiTunis()) => {
  const recents = croissants(exercices).reverse();
  const ouverts = recents.filter((x) => x.etat === 'ouvert');
  return ouverts.find((x) => aujourdhui >= x.debut && aujourdhui <= x.fin) || ouverts[0] || recents[0] || null;
};

// L'exercice qui précède `exercice` dans le dossier (le plus récent qui finit avant son début), ou null.
const precedentDe = (exercices, exercice) => croissants(exercices).filter((x) => x.fin < exercice.debut).pop() || null;

// Ce que les écrans savent de l'exercice suivant : ses dates, son millésime, s'il peut s'ouvrir, et la fenêtre de
// l'ouverture automatique (`auto` : la date du jour a dépassé la fin du dernier exercice ; une écriture datée de `debut` à
// `jusqua` l'ouvre). null sans exercice.
const presenterSuivant = (exercices, aujourdhui = aujourdhuiTunis()) => {
  const s = exerciceSuivant(exercices);
  if (!s) return null;
  const auto = s.possible && aujourdhui >= s.debut;
  return {
    debut: s.debut, fin: s.fin, millesime: s.millesime, possible: s.possible,
    bloquant: s.bloquant ? { id: s.bloquant.id, debut: s.bloquant.debut, fin: s.bloquant.fin, millesime: s.bloquant.millesime } : null,
    auto, jusqua: auto ? (aujourdhui < s.fin ? aujourdhui : s.fin) : null,
  };
};

module.exports = {
  aujourdhuiTunis, lendemain, veille, finDouzeMois, fmtJour, libelleExercice, croissants,
  millesimeDe, exerciceSuivant, ouvertureAutoPour, exerciceParDefaut, precedentDe, presenterSuivant,
};
