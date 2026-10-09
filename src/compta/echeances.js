// LabFlow Compta, étape S7a « Lettrage, échéancier, relevés » (labflow-reprise/achats-compta/PLAN-S7.md §4 « Échéance » ;
// réponses du client du 09/10 — « ok pour les 9 »). Les règles de l'échéance d'une ligne non lettrée et des tranches de
// retard, partagées par l'échéancier (echeancier.js) et la fiche du dossier (configDossier.js : carte Tenue) ; module sans
// dépendance (ni base, ni autre module de Compta) pour que la fiche le lise sans cycle de chargement.
//   • le DÛ d'une ligne, côté du tiers : fournisseur = crédit − débit (ce que le dossier lui doit) ; client = débit − crédit
//     (ce qu'il doit au dossier) ; une ligne qui réduit le dû (règlement, avoir, contre-passation) est négative ;
//   • son ÉCHÉANCE : pour une ligne qui augmente le dû (facture), celle de la ligne, à défaut la date de la pièce (sa vraie
//     date si l'opération a été enregistrée plus tard, NC 01 §61) + le délai de paiement du tiers ; une ligne qui le réduit
//     échoit TOUJOURS à sa date (relecture de S7a : une échéance posée par la saisie sur un règlement est ignorée) ;
//   • son RETARD : jours écoulés de l'échéance au jour de la lecture (à Tunis) ; les tranches : non échu (retard ≤ 0),
//     1 à 30, 31 à 60, 61 à 90, plus de 90 jours ;
//   • la BALANCE ÂGÉE d'un tiers : ses factures non lettrées réparties par tranche, puis ses règlements et avoirs non lettrés
//     IMPUTÉS sur les tranches les plus anciennes d'abord (relecture de S7a : la part échue ne dépasse jamais le dû, et une
//     relance ne réclame jamais ce qui est déjà payé) ; un reste de règlement (avance, trop-perçu) vient en moins du non échu.
// Fragments SQL sur les alias `l` (compta.lignes), `e` (compta.ecritures), `t` (compta.tiers).
const SQL_DU = `(CASE WHEN t.type = 'fournisseur' THEN l.credit - l.debit ELSE l.debit - l.credit END)`;
const SQL_ECHEANCE = `(CASE WHEN ${SQL_DU} > 0 THEN COALESCE(l.echeance, COALESCE(e.date_reelle, e.date) + t.delai_paiement::int) ELSE COALESCE(e.date_reelle, e.date) END)`;
const TRANCHES = [
  { cle: 'nonEchu', libelle: 'Non échu', min: null, max: 0 },
  { cle: 'j30', libelle: '1 à 30 jours', min: 1, max: 30 },
  { cle: 'j60', libelle: '31 à 60 jours', min: 31, max: 60 },
  { cle: 'j90', libelle: '61 à 90 jours', min: 61, max: 90 },
  { cle: 'plus90', libelle: 'Plus de 90 jours', min: 91, max: null },
];
const CLES_TRANCHES = TRANCHES.map((x) => x.cle);
const CLES_ECHUES = CLES_TRANCHES.filter((c) => c !== 'nonEchu');
// La condition SQL d'une tranche sur un retard (expression entière).
const sqlTranche = (x, retard) => [x.min != null ? `${retard} >= ${x.min}` : null, x.max != null ? `${retard} <= ${x.max}` : null].filter(Boolean).join(' AND ');
// Les colonnes agrégées d'une balance âgée sur une sous-requête `n` (du, retard) : les factures (du > 0) par tranche, en
// colonnes « nonechu », « j30 »… (noms en minuscules), et les règlements et avoirs (du < 0) en « credits », positifs.
const sqlAgregatsAges = (n = 'n') => [
  ...TRANCHES.map((x) => `COALESCE(SUM(${n}.du) FILTER (WHERE ${n}.du > 0 AND ${sqlTranche(x, `${n}.retard`)}), 0)::numeric(18,3)::text AS ${x.cle.toLowerCase()}`),
  `COALESCE(SUM(-${n}.du) FILTER (WHERE ${n}.du < 0), 0)::numeric(18,3)::text AS credits`,
].join(',\n         ');
// La tranche d'un retard en jours (entier) — la même règle que sqlTranche.
const trancheDe = (retard) => TRANCHES.find((x) => (x.min == null || retard >= x.min) && (x.max == null || retard <= x.max)).cle;
// « 1234.500 » ou « -12.500 » (NUMERIC lu en base) → millimes signés ; jamais de flottant.
const millimes = (t) => {
  const s = String(t ?? '0').trim();
  const neg = s.startsWith('-');
  const [e, d = ''] = (neg ? s.slice(1) : s).split('.');
  const v = BigInt(e || '0') * 1000n + BigInt((d + '000').slice(0, 3));
  return neg ? -v : v;
};
const texteMillimesSigne = (n) => { const a = n < 0n ? -n : n; return `${n < 0n ? '-' : ''}${a / 1000n}.${String(a % 1000n).padStart(3, '0')}`; };
// L'imputation des règlements : `dettes` (millimes par tranche, factures seules), `credits` (millimes positifs) → les
// tranches après imputation sur les plus anciennes d'abord ; un reste de crédit vient en moins du non échu.
const ORDRE_IMPUTATION = ['plus90', 'j90', 'j60', 'j30', 'nonEchu'];
const imputer = (dettes, credits) => {
  const m = Object.fromEntries(CLES_TRANCHES.map((c) => [c, dettes[c] || 0n]));
  let reste = credits > 0n ? credits : 0n;
  for (const c of ORDRE_IMPUTATION) {
    const x = m[c] < reste ? m[c] : reste;
    m[c] -= x;
    reste -= x;
  }
  if (reste > 0n) m.nonEchu -= reste;
  return m;
};
// Une rangée agrégée (colonnes de sqlAgregatsAges, textes) → { tranches (millimes imputés), echu, total }.
const trancheesImputees = (r) => {
  const m = imputer(Object.fromEntries(CLES_TRANCHES.map((c) => [c, millimes(r[c.toLowerCase()])])), millimes(r.credits));
  const echu = CLES_ECHUES.reduce((s, c) => s + m[c], 0n);
  return { tranches: m, echu, total: CLES_TRANCHES.reduce((s, c) => s + m[c], 0n) };
};
// Le jour à Tunis (AAAA-MM-JJ) : date de lecture de l'échéancier, du relevé et de la relance.
const aujourdhuiTunis = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

module.exports = {
  SQL_DU, SQL_ECHEANCE, TRANCHES, CLES_TRANCHES, CLES_ECHUES, ORDRE_IMPUTATION, sqlTranche, sqlAgregatsAges, trancheDe,
  millimes, texteMillimesSigne, imputer, trancheesImputees, aujourdhuiTunis,
};
