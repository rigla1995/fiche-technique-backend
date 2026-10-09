// LabFlow Compta, étape S6a « Les écritures en brouillard » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6a, §2,
// §4 ; réponses du client du 08/10 — « ok pour les 8 » : découpage en trois, numéro définitif à la validation (S6b) et
// provisoire en brouillard, pièce = sa référence, le niveau Saisie saisit en brouillard, aide TVA / retenue sur demande
// calculée au millime et modifiable, dinar seul ; CADRAGE §4 : partie double, pièce justificative, chronologie, date de
// traitement système, montants sans arrondi, piste d'audit ; SPEC-SOCLE §0 : NUMERIC(18,3) transportés en texte, calculés
// en millimes entiers — BigInt, jamais de flottant). Les écritures d'un dossier (compta.ecritures, compta.lignes) :
// lecture par pages (journal, période, état, recherche sur le libellé, la pièce ou un montant), une écriture avec ses
// lignes, créer, modifier et supprimer tant qu'elle est en brouillard (en S6a tout l'est), aide à la saisie : la ligne de
// taxe d'une ligne hors taxes (compte du code selon le journal), la ligne de retenue à la source d'après la retenue par
// défaut du tiers (assiette = TTC hors timbre, recherche fiscale §3.6). Routes (D3) : /api/compta/dossiers/:dossierId/
// ecritures… ; chaque écriture passe par la transaction verrouillée du dossier (dansEspaceDuDossier : comptabilité
// verrouillée, dossier relu sous verrou, garde par comptabilité D4), puis par le droit « saisir » (titulaire, Complet,
// Saisie) et l'état du dossier (archivé : rien ne change). Le dossier étant verrouillé, le numéro provisoire se calcule
// sans course. Les cinq hooks « mouvementé » (dossier, compte, journal, code de taxe, tiers) sont rendus réels dans leurs
// modules par une requête sur ces deux tables.
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { TYPES_TAXES, TYPES_TAXES_LIBELLES, ASSIETTES_LIBELLES, NATURE_PAR_TYPE_TIERS, TYPES_TIERS_LIBELLES } = require('./paquets');
const { droits, dateValide, dansEspaceDuDossier } = require('./dossiers');
const { lectureDossier, presenterDossier, HORS_W1252 } = require('./planComptes');
const { SQL_FEUILLE, presenterCompteCourt } = require('./configDossier');

const MSG_SAISIR = 'Seul le titulaire ou un gérant de niveau Complet ou Saisie peut saisir des écritures';
const REFERENCE_MAX = 80;
const LIBELLE_MAX = 255;
const LIGNES_MIN = 2;
const LIGNES_MAX = 200;
const ETATS_LIBELLES = { brouillard: 'Brouillard', validee: 'Validée' };
const ETATS = Object.keys(ETATS_LIBELLES);
// Natures des comptes collectifs : la ligne porte un tiers du type correspondant (PLAN-S5 §4 : compte collectif + tiers).
const NATURES_COLLECTIVES = Object.values(NATURE_PAR_TYPE_TIERS);
const TYPE_TIERS_PAR_NATURE = Object.fromEntries(Object.entries(NATURE_PAR_TYPE_TIERS).map(([t, n]) => [n, t]));
// Assiette d'une retenue = TTC hors timbre (recherche fiscale §3.6) : les lignes de timbre, de retenue et d'avance n'en
// font pas partie, ni la ligne du tiers (qui porte le TTC lui-même).
const TYPES_HORS_TTC = ['timbre', 'retenue', 'retenue_tva', 'avance'];
// Comptes de TVA : hors d'une assiette hors taxes.
const NATURES_TVA = ['tva_deductible', 'tva_collectee', 'tva_a_payer'];
// Une retenue va du côté opposé à la ligne de base (elle réduit ce qui est dû au tiers) ; TVA, timbre, FODEC et avance
// vont du même côté.
const TYPES_OPPOSES = ['retenue', 'retenue_tva'];

// ── Montants en millimes (SPEC-SOCLE §0 ; NC 01 §62 : aucun arrondi à l'enregistrement) ────────────────────────────
const RE_MONTANT = /^\d{1,15}(\.\d{1,3})?$/;
// « 1 234,5 » (texte ou nombre) → 1234500n ; vide → 0n ; 400 sinon. Jamais parseFloat.
const lireMontant = (v, libelle) => {
  if (v == null || v === '') return 0n;
  if (typeof v !== 'string' && typeof v !== 'number') throw erreur(400, `${libelle} : requête invalide`);
  const s = String(v).replace(/\s/g, '').replace(',', '.');
  if (!RE_MONTANT.test(s)) throw erreur(400, `${libelle} : montant en dinars, 3 décimales au plus (ex. 1 190,500)`);
  const [entiers, decimales = ''] = s.split('.');
  return BigInt(entiers) * 1000n + BigInt(decimales.padEnd(3, '0'));
};
// 1234500n → « 1234.500 » (texte NUMERIC(18,3), celui qui voyage).
const texteMillimes = (n) => {
  const a = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${a / 1000n}.${String(a % 1000n).padStart(3, '0')}`;
};
// « 1234.500 » (texte NUMERIC lu en base) → 1234500n.
const millimesDe = (t) => lireMontant(t, 'Montant');
// Taux « 19.000 » → 19000n (millièmes de pour cent) ; jamais de flottant ; sans taux (TVAEXO) → 0n.
const milliemesDe = (taux) => {
  if (taux == null || String(taux).trim() === '') return 0n;
  const [entiers, decimales = ''] = String(taux).trim().split('.');
  return BigInt(entiers || '0') * 1000n + BigInt(decimales.padEnd(3, '0').slice(0, 3));
};
// Borne d'un total NUMERIC(18,3) : 15 chiffres entiers (une ligne y tient, une somme de lignes peut la dépasser).
const TOTAL_MAX = 999999999999999999n;
// base × taux / 100, arrondi au millime le plus proche (le demi-millime vers le haut) ; signe de la base conservé.
const calculTaxe = (baseMillimes, taux) => {
  const b = baseMillimes < 0n ? -baseMillimes : baseMillimes;
  const r = (b * milliemesDe(taux) + 50000n) / 100000n;
  return baseMillimes < 0n ? -r : r;
};
// Affichage français d'un montant en millimes, pour les messages : « 1 190,500 ».
const fmtMillimes = (n) => {
  const a = n < 0n ? -n : n;
  const entiers = String(a / 1000n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0n ? '-' : ''}${entiers},${String(a % 1000n).padStart(3, '0')}`;
};
const fmtDate = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const numeroProvisoire = (n) => `B-${String(n).padStart(6, '0')}`;

// ── Lecture des saisies ─────────────────────────────────────────────────────────────────────────────────────────────
const texte = (v) => (v == null ? '' : String(v).normalize('NFC').replace(/\s+/g, ' ').trim());
// Un texte imprimable (même table que le plan et les tiers : un libellé s'imprime sur le grand livre) ; vide = null, sauf
// obligatoire.
const lireTexte = (v, libelle, max, obligatoire = false) => {
  if (v != null && typeof v !== 'string' && typeof v !== 'number') throw erreur(400, `${libelle} : requête invalide`);
  const s = texte(v);
  if (!s) {
    if (obligatoire) throw erreur(400, `${libelle} obligatoire`);
    return null;
  }
  if (s.length > max) throw erreur(400, `${libelle} : ${max} caractères au maximum`);
  if (HORS_W1252.test(s)) throw erreur(400, `${libelle} : caractères latins seulement (les lettres arabes et les émojis ne s'impriment pas sur les états)`);
  return s;
};
const lireReference = (v) => lireTexte(v, 'Référence de la pièce', REFERENCE_MAX, true);
const lireLibelle = (v) => lireTexte(v, 'Libellé', LIBELLE_MAX, true);
const lireId = (v, libelle) => {
  if (v == null || v === '') return null;
  if (!idValide(v)) throw erreur(400, `${libelle} : requête invalide`);
  return Number(v);
};
const lireDate = (v, libelle) => {
  if (!dateValide(v)) throw erreur(400, `${libelle} : date invalide (AAAA-MM-JJ)`);
  return v;
};
// Une ligne lue dans le corps (rang = position + 1) : compte, tiers, libellé, débit OU crédit (l'un strictement positif),
// code de taxe, échéance.
const lireLigne = (l, i) => {
  const n = i + 1;
  if (!l || typeof l !== 'object') throw erreur(400, `Ligne ${n} : requête invalide`);
  const compteId = lireId(l.compteId, `Ligne ${n}, compte`);
  if (!compteId) throw erreur(400, `Ligne ${n} : choisissez le compte`);
  const debit = lireMontant(l.debit, `Ligne ${n}, débit`);
  const credit = lireMontant(l.credit, `Ligne ${n}, crédit`);
  if (debit > 0n && credit > 0n) throw erreur(400, `Ligne ${n} : un débit ou un crédit, pas les deux`);
  if (debit === 0n && credit === 0n) throw erreur(400, `Ligne ${n} : indiquez le débit ou le crédit`);
  return {
    rang: n,
    compteId,
    tiersId: lireId(l.tiersId, `Ligne ${n}, tiers`),
    libelle: lireTexte(l.libelle, `Ligne ${n}, libellé`, LIBELLE_MAX),
    debit,
    credit,
    taxeId: lireId(l.taxeId, `Ligne ${n}, code de taxe`),
    echeance: l.echeance == null || l.echeance === '' ? null : lireDate(l.echeance, `Ligne ${n}, échéance`),
  };
};
// S6c : `max` — la saisie admet 200 lignes ; l'écriture d'à-nouveaux d'une balance d'ouverture importée en admet autant que
// le fichier (importEcritures.js : LIGNES_MAX_BALANCE).
const lireLignes = (v, max = LIGNES_MAX) => {
  if (!Array.isArray(v)) throw erreur(400, 'Lignes : requête invalide');
  if (v.length < LIGNES_MIN) throw erreur(400, `Une écriture a au moins ${LIGNES_MIN} lignes`);
  if (v.length > max) throw erreur(400, `${max} lignes au plus par écriture`);
  return v.map(lireLigne);
};
const totaux = (lignes) => lignes.reduce((t, l) => ({ debit: t.debit + l.debit, credit: t.credit + l.credit }), { debit: 0n, credit: 0n });
// L'écriture lue dans le corps : { journalId, date, dateReelle, reference, libelle, lignes, total } ; partie double exigée
// (NC 01 §30), échéance jamais avant la date (ou la vraie date). Tout est contrôlé avant la moindre requête. S6b : la
// vraie date (facultative) d'une opération d'une période close, enregistrée au premier jour de la période ouverte suivante
// (NC 01 §61) ; elle précède toujours la date d'enregistrement.
const lireEcriture = (corps, { lignesMax = LIGNES_MAX } = {}) => {
  if (!corps || typeof corps !== 'object') throw erreur(400, 'Écriture : requête invalide');
  const journalId = lireId(corps.journalId, 'Journal');
  if (!journalId) throw erreur(400, 'Choisissez le journal');
  const date = lireDate(corps.date, 'Date');
  const dateReelle = corps.dateReelle == null || corps.dateReelle === '' ? null : lireDate(corps.dateReelle, 'Vraie date de l\'opération');
  if (dateReelle && dateReelle >= date) throw erreur(400, `La vraie date de l'opération (${fmtDate(dateReelle)}) doit précéder la date d'enregistrement (${fmtDate(date)}) ; sinon, laissez-la vide`, 'DATE_REELLE');
  const reference = lireReference(corps.reference);
  const libelle = lireLibelle(corps.libelle);
  const lignes = lireLignes(corps.lignes, lignesMax);
  for (const l of lignes) if (l.echeance && l.echeance < (dateReelle || date)) throw erreur(400, `Ligne ${l.rang} : l'échéance (${fmtDate(l.echeance)}) précède la date de l'écriture`);
  const t = totaux(lignes);
  if (t.debit !== t.credit) {
    const ecart = t.debit > t.credit ? t.debit - t.credit : t.credit - t.debit;
    throw erreur(400, `Écriture déséquilibrée : débits ${fmtMillimes(t.debit)} ≠ crédits ${fmtMillimes(t.credit)} (écart ${fmtMillimes(ecart)})`, 'DESEQUILIBRE');
  }
  if (t.debit > TOTAL_MAX) throw erreur(400, `Total de l'écriture trop grand (${fmtMillimes(TOTAL_MAX)} au plus)`, 'TOTAL_TROP_GRAND');
  // NC 01 §30 : une écriture touche au moins deux comptes (ou deux tiers d'un même collectif).
  if (new Set(lignes.map((l) => `${l.compteId}/${l.tiersId ?? ''}`)).size < 2) throw erreur(400, 'Une écriture touche au moins deux comptes (ou deux tiers)', 'COMPTES_IDENTIQUES');
  return { journalId, date, dateReelle, reference, libelle, lignes, total: t.debit };
};

// Paramètres de la liste : journal (identifiant, vide = tous), periode (identifiant, vide = toutes), etat (vide = toutes),
// q (100 caractères au plus : libellé, pièce ou montant), page / limite (25 par défaut, 200 au plus).
const LIMITE_DEFAUT = 25;
const LIMITE_MAX = 200;
const PAGE_MAX = 100000;
const RE_ENTIER = /^\d{1,6}$/;
const lireFiltres = (query = {}) => {
  if (!query || typeof query !== 'object') throw erreur(400, 'Paramètres invalides');
  const journalId = lireId(query.journal, 'Journal');
  const periodeId = lireId(query.periode, 'Période');
  const etat = query.etat === undefined || query.etat === '' ? '' : String(query.etat);
  if (etat && !ETATS.includes(etat)) throw erreur(400, 'État inconnu (brouillard, validee)');
  const q = String(query.q ?? '').trim().slice(0, 100);
  const page = query.page === undefined || query.page === '' ? 1 : (RE_ENTIER.test(String(query.page)) ? Number(query.page) : NaN);
  if (!Number.isInteger(page) || page < 1 || page > PAGE_MAX) throw erreur(400, 'Page invalide');
  const limite = query.limite === undefined || query.limite === '' ? LIMITE_DEFAUT : (RE_ENTIER.test(String(query.limite)) ? Number(query.limite) : NaN);
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAX) throw erreur(400, `Limite : entier de 1 à ${LIMITE_MAX}`);
  // Une recherche qui a la forme d'un montant cherche aussi ce montant (total de l'écriture ou l'une de ses lignes).
  const brut = q.replace(/\s/g, '').replace(',', '.');
  const montant = q && RE_MONTANT.test(brut) ? texteMillimes(lireMontant(brut, 'Montant')) : null;
  return { journalId, periodeId, etat, q, montant, page, limite };
};
const motifRecherche = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────
// S6b : l'auteur de la validation, le numéro de l'écriture d'origine d'une contre-passation, et la contre-passation qui
// annule l'écriture (une écriture ne se contre-passe qu'une fois ; index partiel origine_id de la migration 216).
const SQL_ECRITURES = `
  SELECT e.id, e.exercice_id, e.periode_id, e.journal_id, j.code AS journal_code, j.libelle AS journal_libelle, j.type AS journal_type,
         e.date::text AS date, e.date_reelle::text AS date_reelle, e.numero_provisoire, e.numero, e.reference, e.libelle, e.etat,
         e.total_debit::text AS total_debit, e.total_credit::text AS total_credit, e.origine, e.origine_id, o.numero AS origine_numero,
         e.cree_par, u.nom AS cree_par_nom, e.created_at, e.updated_at, e.valide_par, v.nom AS valide_par_nom, e.valide_le,
         (SELECT COUNT(*)::int FROM compta.lignes l WHERE l.ecriture_id = e.id) AS nb_lignes,
         cp.id AS contrepassee_par_id, cp.numero AS contrepassee_par_numero
    FROM compta.ecritures e
    JOIN compta.journaux j ON j.id = e.journal_id
    LEFT JOIN utilisateurs u ON u.id = e.cree_par
    LEFT JOIN utilisateurs v ON v.id = e.valide_par
    LEFT JOIN compta.ecritures o ON o.id = e.origine_id AND o.dossier_id = e.dossier_id
    LEFT JOIN LATERAL (SELECT c.id, c.numero FROM compta.ecritures c WHERE c.origine_id = e.id AND c.dossier_id = e.dossier_id AND c.origine = 'contrepassation' ORDER BY c.id LIMIT 1) cp ON true`;
// Conditions de la liste ($1 dossier, $2 journal ou NULL, $3 période ou NULL, $4 état ou '', $5 motif ou '', $6 montant ou NULL).
const SQL_FILTRES = `e.dossier_id = $1 AND ($2::int IS NULL OR e.journal_id = $2) AND ($3::int IS NULL OR e.periode_id = $3) AND ($4::text = '' OR e.etat = $4)
   AND ($5::text = '' OR e.libelle ILIKE $5 OR e.reference ILIKE $5
        OR ($6::numeric IS NOT NULL AND (e.total_debit = $6::numeric OR EXISTS (SELECT 1 FROM compta.lignes l WHERE l.ecriture_id = e.id AND (l.debit = $6::numeric OR l.credit = $6::numeric)))))`;
const SQL_LISTE = `${SQL_ECRITURES}
   WHERE ${SQL_FILTRES}
   ORDER BY e.date DESC, e.id DESC
   LIMIT $7 OFFSET $8`;
const SQL_UNE = `${SQL_ECRITURES} WHERE e.dossier_id = $1 AND e.id = $2`;
const SQL_LIGNES = `
  SELECT l.id, l.ecriture_id, l.rang, l.libelle, l.debit::text AS debit, l.credit::text AS credit, l.echeance::text AS echeance,
         l.compte_id, k.numero AS compte_numero, k.libelle AS compte_libelle, k.nature AS compte_nature,
         l.tiers_id, t.type AS tiers_type, t.code AS tiers_code, t.nom AS tiers_nom,
         l.taxe_id, x.code AS taxe_code, x.libelle AS taxe_libelle, x.type AS taxe_type, lt.lettre
    FROM compta.lignes l
    JOIN compta.comptes k ON k.id = l.compte_id
    LEFT JOIN compta.tiers t ON t.id = l.tiers_id
    LEFT JOIN compta.taxes x ON x.id = l.taxe_id
    LEFT JOIN compta.lettrages lt ON lt.id = l.lettrage_id
   WHERE l.ecriture_id = ANY($1)
   ORDER BY l.ecriture_id, l.rang`;
const presenterLigne = (l) => ({
  id: l.id,
  rang: l.rang,
  compte: { id: l.compte_id, numero: l.compte_numero, libelle: l.compte_libelle, nature: l.compte_nature },
  tiers: l.tiers_id ? { id: l.tiers_id, type: l.tiers_type, code: l.tiers_code, nom: l.tiers_nom } : null,
  libelle: l.libelle,
  debit: l.debit,
  credit: l.credit,
  taxe: l.taxe_id ? { id: l.taxe_id, code: l.taxe_code, libelle: l.taxe_libelle, type: l.taxe_type } : null,
  echeance: l.echeance,
  // S7a : la lettre de la ligne (lettrage d'un tiers, migration 218), ou null.
  lettre: l.lettre ? l.lettre.trim() : null,
});
const presenterEcriture = (e, lignes = null) => ({
  id: e.id,
  numeroProvisoire: numeroProvisoire(e.numero_provisoire),
  numero: e.numero,
  date: e.date,
  dateReelle: e.date_reelle,
  journal: { id: e.journal_id, code: e.journal_code, libelle: e.journal_libelle, type: e.journal_type },
  reference: e.reference,
  libelle: e.libelle,
  etat: e.etat,
  etatLibelle: ETATS_LIBELLES[e.etat] || e.etat,
  total: e.total_debit,
  origine: e.origine,
  origineId: e.origine_id,
  origineNumero: e.origine_numero || null,
  contrepasseePar: e.contrepassee_par_id ? { id: e.contrepassee_par_id, numero: e.contrepassee_par_numero } : null,
  nbLignes: e.nb_lignes,
  creePar: e.cree_par_nom || null,
  creeLe: e.created_at,
  modifieLe: e.updated_at,
  validePar: e.valide_par_nom || null,
  valideLe: e.valide_le,
  ...(lignes ? { lignes: lignes.map(presenterLigne) } : {}),
});
// Les lignes de plusieurs écritures, groupées par écriture.
const lignesDe = async (db, ids) => {
  const parEcriture = new Map(ids.map((id) => [id, []]));
  for (const l of (await db.query(SQL_LIGNES, [ids])).rows) parEcriture.get(l.ecriture_id).push(l);
  return parEcriture;
};
// Comptes rendus du dossier (fiche, bandeau) : écritures en brouillard et validées.
const resumeEcritures = async (db, dossierId) => {
  const r = (await db.query(`SELECT COUNT(*) FILTER (WHERE etat = 'brouillard')::int AS brouillard, COUNT(*) FILTER (WHERE etat = 'validee')::int AS validees FROM compta.ecritures WHERE dossier_id = $1`, [dossierId])).rows[0];
  return { brouillard: r.brouillard, validees: r.validees };
};
// L'exercice ouvert (le plus récent) et ses périodes, ou null.
const exerciceOuvert = async (db, dossierId) => {
  const x = (await db.query(`SELECT id, debut::text AS debut, fin::text AS fin, etat FROM compta.exercices WHERE dossier_id = $1 AND etat = 'ouvert' ORDER BY debut DESC LIMIT 1`, [dossierId])).rows[0];
  if (!x) return null;
  const periodes = (await db.query('SELECT id, debut::text AS debut, fin::text AS fin, etat FROM compta.periodes WHERE exercice_id = $1 ORDER BY debut', [x.id])).rows;
  return { id: x.id, debut: x.debut, fin: x.fin, etat: x.etat, periodes };
};
// Les choix de la saisie : journaux (tous, l'état dit lesquels sont proposés), comptes imputables (actifs, feuilles), codes
// de taxe actifs, tiers actifs (avec leur retenue par défaut et leur délai).
const choixJournaux = async (db, dossierId) =>
  (await db.query('SELECT id, code, libelle, type, actif FROM compta.journaux WHERE dossier_id = $1 ORDER BY id', [dossierId])).rows;
const choixComptesImputables = async (db, dossierId) =>
  (await db.query(`SELECT k.id, k.numero, k.libelle, k.nature, k.actif, true AS feuille FROM compta.comptes k WHERE k.dossier_id = $1 AND k.actif AND ${SQL_FEUILLE('k')} ORDER BY k.numero`, [dossierId])).rows.map(presenterCompteCourt);
const presenterTaxeCourte = (x) => ({ id: x.id, code: x.code, libelle: x.libelle, type: x.type, typeLibelle: TYPES_TAXES_LIBELLES[x.type] || x.type, taux: x.taux, montant: x.montant, assiette: x.assiette, assietteLibelle: ASSIETTES_LIBELLES[x.assiette] || x.assiette, actif: x.actif });
const choixTaxes = async (db, dossierId) =>
  (await db.query('SELECT id, code, libelle, type, taux::text AS taux, montant::text AS montant, assiette, actif FROM compta.taxes WHERE dossier_id = $1 AND actif ORDER BY array_position($2::text[], type), id', [dossierId, TYPES_TAXES])).rows.map(presenterTaxeCourte);
const presenterTiersCourt = (t) => ({
  id: t.id, type: t.type, typeLibelle: TYPES_TIERS_LIBELLES[t.type] || t.type, code: t.code, nom: t.nom, compteId: t.compte_id, delaiPaiement: t.delai_paiement,
  retenue: t.retenue_id ? { id: t.retenue_id, code: t.retenue_code, taux: t.retenue_taux, actif: t.retenue_actif } : null,
});
const choixTiers = async (db, dossierId) =>
  (await db.query(
    `SELECT t.id, t.type, t.code, t.nom, t.compte_id, t.delai_paiement, t.retenue_id, x.code AS retenue_code, x.taux::text AS retenue_taux, x.actif AS retenue_actif
       FROM compta.tiers t LEFT JOIN compta.taxes x ON x.id = t.retenue_id
      WHERE t.dossier_id = $1 AND t.actif ORDER BY t.type, t.code`,
    [dossierId]
  )).rows.map(presenterTiersCourt);
// S6b : la période choisie dans les filtres, avec ce qu'elle contient encore en brouillard (« Valider la période »).
const resumePeriode = async (db, dossierId, periodeId) => {
  if (!periodeId) return null;
  const p = (await db.query(
    `SELECT p.id, p.debut::text AS debut, p.fin::text AS fin, p.etat,
            COUNT(e.id) FILTER (WHERE e.etat = 'brouillard')::int AS nb_brouillard, COUNT(e.id) FILTER (WHERE e.etat = 'validee')::int AS nb_validees
       FROM compta.periodes p
       JOIN compta.exercices x ON x.id = p.exercice_id AND x.dossier_id = $1
       LEFT JOIN compta.ecritures e ON e.periode_id = p.id AND e.dossier_id = $1
      WHERE p.id = $2
      GROUP BY p.id`,
    [dossierId, periodeId]
  )).rows[0];
  return p ? { id: p.id, debut: p.debut, fin: p.fin, etat: p.etat, nbBrouillard: p.nb_brouillard, nbValidees: p.nb_validees } : null;
};
// L'état de la page : le dossier, les droits, l'exercice ouvert et ses périodes, les comptes rendus, la page demandée,
// les choix de la saisie, les bornes, l'abonnement.
const etatEcritures = async (db, acces, d, f) => {
  const motif = f.q ? motifRecherche(f.q) : '';
  const params = [d.id, f.journalId, f.periodeId, f.etat, motif, f.montant];
  const [page, total, nb, exercice, journaux, comptes, taxes, tiers, mode, periode] = await Promise.all([
    db.query(SQL_LISTE, [...params, f.limite, (f.page - 1) * f.limite]),
    db.query(`SELECT COUNT(*)::int AS n FROM compta.ecritures e WHERE ${SQL_FILTRES}`, params),
    resumeEcritures(db, d.id),
    exerciceOuvert(db, d.id),
    choixJournaux(db, d.id),
    choixComptesImputables(db, d.id),
    choixTaxes(db, d.id),
    choixTiers(db, d.id),
    modeTitulaire(db, acces.espace_id),
    resumePeriode(db, d.id, f.periodeId),
  ]);
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    exercice,
    nb,
    periode,
    filtres: { journalId: f.journalId, periodeId: f.periodeId, etat: f.etat, q: f.q },
    ecritures: page.rows.map((e) => presenterEcriture(e)),
    total: total.rows[0].n,
    page: f.page,
    limite: f.limite,
    journaux: journaux.map((j) => ({ id: j.id, code: j.code, libelle: j.libelle, type: j.type, actif: j.actif })),
    comptes,
    taxes,
    tiers,
    etats: ETATS.map((valeur) => ({ valeur, libelle: ETATS_LIBELLES[valeur] })),
    bornes: { referenceMax: REFERENCE_MAX, libelleMax: LIBELLE_MAX, lignesMin: LIGNES_MIN, lignesMax: LIGNES_MAX },
    etatAbonnement: etatAbonnement(mode),
  };
};

// ── Résolution d'une écriture dans la transaction ───────────────────────────────────────────────────────────────────
// Le journal du dossier, actif.
const journalDe = async (db, dossierId, journalId) => {
  const j = (await db.query('SELECT id, code, libelle, type, actif, compte_id FROM compta.journaux WHERE dossier_id = $1 AND id = $2', [dossierId, journalId])).rows[0];
  if (!j) throw erreur(404, 'Journal introuvable');
  if (!j.actif) throw erreur(409, `Le journal ${j.code} est désactivé : réactivez-le (page Journaux) ou choisissez-en un autre`, 'JOURNAL_DESACTIVE');
  return j;
};
// L'exercice ouvert et la période ouverte qui contiennent la date (chronologie : une écriture se date dans une période
// ouverte de l'exercice ouvert ; NC 01 §57 à §61).
const periodeDe = async (db, dossierId, date) => {
  const ouverts = (await db.query(`SELECT id, debut::text AS debut, fin::text AS fin FROM compta.exercices WHERE dossier_id = $1 AND etat = 'ouvert' ORDER BY debut DESC`, [dossierId])).rows;
  if (!ouverts.length) throw erreur(409, 'Aucun exercice ouvert dans ce dossier', 'EXERCICE_CLOS');
  const x = ouverts.find((e) => date >= e.debut && date <= e.fin);
  if (!x) throw erreur(409, `La date ${fmtDate(date)} est hors de l'exercice ouvert (du ${fmtDate(ouverts[0].debut)} au ${fmtDate(ouverts[0].fin)})`, 'DATE_HORS_EXERCICE');
  const p = (await db.query('SELECT id, debut::text AS debut, fin::text AS fin, etat FROM compta.periodes WHERE exercice_id = $1 AND $2::date BETWEEN debut AND fin', [x.id, date])).rows[0];
  if (!p) throw erreur(409, `Aucune période mensuelle pour le ${fmtDate(date)} : vérifiez l'exercice (fiche du dossier)`, 'PERIODE_ABSENTE');
  if (p.etat !== 'ouverte') throw erreur(409, `La période du ${fmtDate(p.debut)} au ${fmtDate(p.fin)} est close : saisissez l'opération au premier jour de la période ouverte suivante, avec sa vraie date`, 'PERIODE_CLOSE');
  return { exercice: x, periode: p };
};
// S6c (relecture) : le journal de type « an » (à-nouveaux) ne reçoit que des écritures datées du premier jour de l'exercice —
// à la saisie, à la modification, à la contre-passation et à l'import d'écritures ; le solde d'ouverture des livres (livres.js)
// repose dessus, et « un seul à-nouveaux par exercice » (import d'une balance d'ouverture) ne se contourne pas par une autre voie.
const exigerDateAN = (journal, exercice, date) => {
  if (journal.type === 'an' && date !== exercice.debut) throw erreur(409, `Le journal ${journal.code} (à-nouveaux) ne reçoit que des écritures datées du premier jour de l'exercice (${fmtDate(exercice.debut)}) : la balance d'ouverture s'importe depuis la page Écritures`, 'AN_DATE');
};
// S6b (NC 01 §61, relecture) : la vraie date d'une opération enregistrée plus tard ne sert qu'à une opération d'une période
// CLOSE (ou d'avant l'exercice ouvert) ; si la période de la vraie date est ouverte, l'écriture se date tout simplement à sa
// vraie date — la chronologie ne s'altère pas sans raison.
const controlerDateReelle = async (db, dossierId, dateReelle) => {
  if (!dateReelle) return;
  const p = (await db.query(
    `SELECT p.etat, p.debut::text AS debut, p.fin::text AS fin FROM compta.periodes p JOIN compta.exercices x ON x.id = p.exercice_id
      WHERE x.dossier_id = $1 AND x.etat = 'ouvert' AND $2::date BETWEEN p.debut AND p.fin`,
    [dossierId, dateReelle]
  )).rows[0];
  if (p && p.etat === 'ouverte') throw erreur(400, `La période du ${fmtDate(p.debut)} au ${fmtDate(p.fin)} est ouverte : datez l'écriture à sa vraie date (${fmtDate(dateReelle)}) au lieu de la reporter`, 'DATE_REELLE_OUVERTE');
};
const comptesDe = async (db, dossierId, ids) => new Map(
  (await db.query(`SELECT k.id, k.numero, k.libelle, k.nature, k.actif, ${SQL_FEUILLE('k')} AS feuille FROM compta.comptes k WHERE k.dossier_id = $1 AND k.id = ANY($2)`, [dossierId, ids])).rows.map((k) => [k.id, k])
);
// Un compte imputable : du dossier, actif, sans sous-compte actif (PLAN-S5 §4 : les feuilles reçoivent les écritures).
const exigerImputable = (k, ou) => {
  if (!k) throw erreur(404, `${ou} : compte introuvable`);
  if (!k.actif) throw erreur(409, `${ou} : le compte ${k.numero} est désactivé`, 'COMPTE_NON_IMPUTABLE');
  if (!k.feuille) throw erreur(409, `${ou} : le compte ${k.numero} a des sous-comptes actifs, choisissez le sous-compte`, 'COMPTE_NON_IMPUTABLE');
  return k;
};
const tiersDe = async (db, dossierId, ids) => new Map(
  (await db.query('SELECT id, type, code, nom, actif, compte_id, retenue_id, delai_paiement FROM compta.tiers WHERE dossier_id = $1 AND id = ANY($2)', [dossierId, ids])).rows.map((t) => [t.id, t])
);
const taxesDe = async (db, dossierId, ids) => new Map(
  (await db.query('SELECT id, code, libelle, type, taux::text AS taux, montant::text AS montant, assiette, actif, compte_achat_id, compte_vente_id, compte_immo_id FROM compta.taxes WHERE dossier_id = $1 AND id = ANY($2)', [dossierId, ids])).rows.map((x) => [x.id, x])
);
// Le code de taxe d'une ligne : du dossier, actif.
const exigerTaxe = (x, ou) => {
  if (!x) throw erreur(404, `${ou} : code de taxe introuvable`);
  if (!x.actif) throw erreur(409, `${ou} : le code ${x.code} est désactivé (page Taxes)`, 'TAXE_DESACTIVEE');
  return x;
};
// Contrôle des lignes contre le dossier : comptes imputables, tiers obligatoire sur un collectif (du type de la nature)
// et interdit ailleurs, codes de taxe actifs. `tiersToleres` : tiers désactivés que l'écriture portait déjà (une
// modification ne bloque pas sur un fournisseur parti entre-temps). → { comptes, tiers, taxes } (cartes par identifiant).
// S6c : `controlerLignes` ne lève pas et rend chaque refus avec le rang de sa ligne (un import rapporte toutes les rangées
// fausses d'un coup) ; `resoudreLignes` (la saisie) lève le premier.
const controlerLignes = async (db, d, lignes, tiersToleres = new Set()) => {
  const [comptes, tiers, taxes] = await Promise.all([
    comptesDe(db, d.id, [...new Set(lignes.map((l) => l.compteId))]),
    tiersDe(db, d.id, [...new Set(lignes.map((l) => l.tiersId).filter(Boolean))]),
    taxesDe(db, d.id, [...new Set(lignes.map((l) => l.taxeId).filter(Boolean))]),
  ]);
  const erreurs = [];
  for (const l of lignes) {
    try {
    const ou = `Ligne ${l.rang}`;
    const k = exigerImputable(comptes.get(l.compteId), ou);
    if (NATURES_COLLECTIVES.includes(k.nature)) {
      const type = TYPE_TIERS_PAR_NATURE[k.nature];
      if (!l.tiersId) throw erreur(400, `${ou} : indiquez le ${TYPES_TIERS_LIBELLES[type].toLowerCase()} (le compte ${k.numero} est un compte collectif)`, 'TIERS_REQUIS');
      const t = tiers.get(l.tiersId);
      if (!t) throw erreur(404, `${ou} : tiers introuvable`);
      if (t.type !== type) throw erreur(400, `${ou} : ${t.code} est un ${TYPES_TIERS_LIBELLES[t.type].toLowerCase()}, le compte ${k.numero} attend un ${TYPES_TIERS_LIBELLES[type].toLowerCase()}`, 'TIERS_TYPE');
      if (!t.actif && !tiersToleres.has(t.id)) throw erreur(409, `${ou} : le ${TYPES_TIERS_LIBELLES[t.type].toLowerCase()} ${t.code} est désactivé (page Tiers)`, 'TIERS_DESACTIVE');
    } else if (l.tiersId) {
      throw erreur(400, `${ou} : un tiers ne se porte que sur un compte collectif (fournisseurs ou clients), pas sur ${k.numero}`, 'TIERS_INTERDIT');
    }
    if (l.taxeId) exigerTaxe(taxes.get(l.taxeId), ou);
    } catch (e) {
      if (!e.statusCode) throw e;
      erreurs.push({ rang: l.rang, erreur: e });
    }
  }
  return { comptes, tiers, taxes, erreurs };
};
const resoudreLignes = async (db, d, lignes, tiersToleres = new Set()) => {
  const { comptes, tiers, taxes, erreurs } = await controlerLignes(db, d, lignes, tiersToleres);
  if (erreurs.length) throw erreurs[0].erreur;
  return { comptes, tiers, taxes };
};
// Les lignes telles que le journal des événements les garde (D16) : tout ce qu'il faut pour relire une écriture disparue.
const resumeLignes = (lignes, { comptes, tiers, taxes }) => lignes.map((l) => ({
  rang: l.rang, compte: comptes.get(l.compteId).numero, tiers: l.tiersId ? tiers.get(l.tiersId).code : null, libelle: l.libelle,
  debit: texteMillimes(l.debit), credit: texteMillimes(l.credit), taxe: l.taxeId ? taxes.get(l.taxeId).code : null, echeance: l.echeance,
}));
const resumeEcriture = (e, journal, lignes, cartes) => ({ journal: journal.code, date: e.date, dateReelle: e.dateReelle ?? null, reference: e.reference, libelle: e.libelle, total: texteMillimes(e.total), lignes: resumeLignes(lignes, cartes) });
// Ce qu'une écriture en base vaut pour le journal des événements (avant une modification, contenu d'une suppression) :
// de quoi la rejouer seule (auteur et date de traitement compris). `lignes` : ses lignes déjà lues.
const resumeEnBase = (e, lignes) => ({
  journal: e.journal_code, date: e.date, dateReelle: e.date_reelle ?? null, reference: e.reference, libelle: e.libelle, total: e.total_debit,
  lignes: lignes.map((l) => ({ rang: l.rang, compte: l.compte_numero, tiers: l.tiers_code || null, libelle: l.libelle, debit: l.debit, credit: l.credit, taxe: l.taxe_code || null, echeance: l.echeance })),
  creePar: e.cree_par_nom || null, creeLe: e.created_at,
});
// Le contenu comparable d'une écriture (sans l'auteur ni la date de traitement) : une modification sans changement
// n'écrit rien, ni en base ni au journal.
const contenuComparable = ({ creePar: _a, creeLe: _b, ...reste }) => JSON.stringify(reste);
const insererLignes = async (db, d, ecritureId, date, lignes) => {
  const valeurs = [];
  const params = [ecritureId, d.id, date];
  for (const l of lignes) {
    const base = params.length;
    params.push(l.rang, l.compteId, l.tiersId, l.libelle, texteMillimes(l.debit), texteMillimes(l.credit), l.taxeId, l.echeance);
    valeurs.push(`($1, $2, $3, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`);
  }
  await db.query(`INSERT INTO compta.lignes (ecriture_id, dossier_id, date, rang, compte_id, tiers_id, libelle, debit, credit, taxe_id, echeance) VALUES ${valeurs.join(', ')}`, params);
};
// L'écriture, si elle est dans le dossier ; verrouillée (modification, suppression).
const ecritureDe = async (db, dossierId, ecritureId) => {
  if (!idValide(ecritureId)) throw erreur(404, 'Écriture introuvable');
  await db.query('SELECT 1 FROM compta.ecritures WHERE dossier_id = $1 AND id = $2 FOR UPDATE', [dossierId, ecritureId]);
  const e = (await db.query(SQL_UNE, [dossierId, ecritureId])).rows[0];
  if (!e) throw erreur(404, 'Écriture introuvable');
  return e;
};
// Validation = définitif (NC 01 §54, §56) : une écriture validée ne se modifie ni ne se supprime (S6b la produit).
const exigerBrouillard = (e) => {
  if (e.etat !== 'brouillard') throw erreur(409, `L'écriture ${e.numero || numeroProvisoire(e.numero_provisoire)} est validée : elle ne se modifie ni ne se supprime (contre-passez-la)`, 'ECRITURE_VALIDEE');
};
const uneEcriture = async (db, dossierId, ecritureId) => {
  const e = (await db.query(SQL_UNE, [dossierId, ecritureId])).rows[0];
  if (!e) throw erreur(404, 'Écriture introuvable');
  return presenterEcriture(e, (await lignesDe(db, [e.id])).get(e.id));
};

// ── Aide à la saisie (PLAN-S6 §4 : proposée sur demande, calculée au millime, jamais imposée) ───────────────────────
// Compte d'un code selon le journal : achats → compte à l'achat (sur immobilisations si la ligne de base en est une et que
// le code en a un) ; ventes → compte à la vente ; autre journal → selon le côté de la ligne de base (débit : achat).
const compteDuCode = (x, journal, ligne, compteBase) => {
  const achat = journal.type === 'achats' || (journal.type !== 'ventes' && ligne.debit > 0n);
  if (achat && compteBase && compteBase.nature === 'immobilisations' && x.compte_immo_id) return { id: x.compte_immo_id, cote: 'sur immobilisations' };
  return achat ? { id: x.compte_achat_id, cote: 'à l\'achat' } : { id: x.compte_vente_id, cote: 'à la vente' };
};
// La ligne de taxe d'une ligne de base : { ligne (compteId, libelle, debit, credit, taxeId), compte, taxe, base }.
// Assiette « ht » ou « fixe » : depuis la ligne hors taxes ; « tva » (retenue de TVA) : depuis une ligne de TVA ; « ttc »
// (retenues, avances) : par « Ajouter la retenue », qui lit toute l'écriture.
const ligneDeTaxe = async (db, d, journal, ligne) => {
  if (!ligne.taxeId) throw erreur(400, 'Cette ligne ne porte pas de code de taxe', 'LIGNE_SANS_CODE');
  const [taxes, comptes] = await Promise.all([taxesDe(db, d.id, [ligne.taxeId]), comptesDe(db, d.id, [ligne.compteId])]);
  const x = exigerTaxe(taxes.get(ligne.taxeId), 'Code de taxe');
  const compteBase = exigerImputable(comptes.get(ligne.compteId), 'Ligne');
  if (x.assiette === 'ttc') throw erreur(400, `Le code ${x.code} se calcule sur le TTC de l'écriture : employez « Ajouter la retenue » avec ce code`, 'ASSIETTE_TTC');
  if (x.assiette === 'tva' && !NATURES_TVA.includes(compteBase.nature)) throw erreur(400, `Le code ${x.code} se calcule sur la TVA : employez « Ajouter la retenue » avec ce code, ou posez-le sur la ligne de TVA`, 'ASSIETTE_TVA');
  if (x.assiette !== 'fixe' && x.taux == null) throw erreur(400, `Le code ${x.code} n'a pas de taux : il ne donne aucune ligne de taxe`, 'MONTANT_NUL');
  const base = ligne.debit > 0n ? ligne.debit : ligne.credit;
  const montant = x.assiette === 'fixe' ? millimesDe(x.montant) : calculTaxe(base, x.taux);
  if (montant <= 0n) throw erreur(400, `Le code ${x.code} ne donne aucun montant (taux ${x.taux ?? '—'} %)`, 'MONTANT_NUL');
  const cible = compteDuCode(x, journal, ligne, compteBase);
  if (!cible.id) throw erreur(409, `Le code ${x.code} n'a pas de compte ${cible.cote} : réglez-le (page Taxes)`, 'TAXE_SANS_COMPTE');
  const k = (await comptesDe(db, d.id, [cible.id])).get(cible.id);
  if (!k || !k.actif || !k.feuille) throw erreur(409, `Le compte ${k ? k.numero : '?'} du code ${x.code} (${cible.cote}) est à préciser : désactivé ou avec des sous-comptes actifs (page Taxes)`, 'COMPTE_NON_IMPUTABLE');
  const memeCote = !TYPES_OPPOSES.includes(x.type);
  const auDebit = ligne.debit > 0n ? memeCote : !memeCote;
  return {
    ligne: { compteId: k.id, tiersId: null, libelle: null, debit: auDebit ? texteMillimes(montant) : '0.000', credit: auDebit ? '0.000' : texteMillimes(montant), taxeId: x.id, echeance: null },
    compte: presenterCompteCourt(k),
    taxe: presenterTaxeCourte(x),
    base: texteMillimes(base),
  };
};
// L'assiette d'une retenue parmi les lignes de l'écriture : TTC hors timbre (toutes les lignes sauf celles d'un compte
// collectif, du timbre, des retenues et des avances) ; hors taxes (assiette « ht ») : sans les lignes de TVA non plus ;
// « tva » (retenue de TVA) : les seules lignes de TVA. Côté : achats = débits − crédits ; ventes = crédits − débits.
const assietteRetenue = (lignes, cartes, journal, assiette) => {
  let base = 0n;
  for (const l of lignes) {
    const k = cartes.comptes.get(l.compteId);
    const x = l.taxeId ? cartes.taxes.get(l.taxeId) : null;
    if (NATURES_COLLECTIVES.includes(k.nature)) continue;
    if (x && TYPES_HORS_TTC.includes(x.type)) continue;
    if (assiette === 'ht' && NATURES_TVA.includes(k.nature)) continue;
    if (assiette === 'tva' && !NATURES_TVA.includes(k.nature)) continue;
    base += journal.type === 'achats' ? l.debit - l.credit : l.credit - l.debit;
  }
  return base;
};
// Codes que « Ajouter la retenue » calcule sur l'écriture entière : retenue à la source (TTC hors timbre, ou HT), retenue
// de TVA (sur la TVA), avance (TTC hors timbre, du même côté que la pièce : elle s'ajoute à ce que le tiers doit).
const TYPES_RETENUE = ['retenue', 'retenue_tva', 'avance'];
// La ligne de retenue à la source : { ligne, compte, taxe, base } ; code = celui demandé, sinon la retenue par défaut du tiers.
const ligneDeRetenue = async (db, d, journal, { tiersId, taxeId, lignes }) => {
  if (journal.type !== 'achats' && journal.type !== 'ventes') throw erreur(400, 'La retenue à la source se propose sur un journal d\'achats ou de ventes', 'JOURNAL_SANS_RETENUE');
  let codeId = taxeId;
  let t = null;
  if (tiersId) {
    t = (await tiersDe(db, d.id, [tiersId])).get(tiersId);
    if (!t) throw erreur(404, 'Tiers introuvable');
    if (!t.actif) throw erreur(409, `Le ${TYPES_TIERS_LIBELLES[t.type].toLowerCase()} ${t.code} est désactivé (page Tiers)`, 'TIERS_DESACTIVE');
    if (!codeId) codeId = t.retenue_id;
  }
  if (!codeId) throw erreur(409, t ? `Le ${TYPES_TIERS_LIBELLES[t.type].toLowerCase()} ${t.code} n'a pas de retenue par défaut : choisissez le code de retenue` : 'Choisissez le code de retenue', 'RETENUE_ABSENTE');
  const x = exigerTaxe((await taxesDe(db, d.id, [codeId])).get(codeId), 'Code de retenue');
  if (!TYPES_RETENUE.includes(x.type)) throw erreur(400, `${x.code} n'est pas un code de retenue à la source, de retenue de TVA ni d'avance : employez « Ajouter la TVA » sur la ligne qui le porte`, 'CODE_NON_RETENUE');
  if (x.taux == null) throw erreur(400, `Le code ${x.code} n'a pas de taux`, 'MONTANT_NUL');
  const cartes = await resoudreLignes(db, d, lignes);
  const base = assietteRetenue(lignes, cartes, journal, x.assiette);
  if (base <= 0n) throw erreur(400, x.assiette === 'tva' ? 'Aucune assiette : ajoutez d\'abord la ligne de TVA (« Ajouter la TVA »)' : 'Aucune assiette : saisissez d\'abord les lignes hors taxes et de TVA de la pièce', 'ASSIETTE_NULLE');
  const montant = calculTaxe(base, x.taux);
  if (montant <= 0n) throw erreur(400, `Le code ${x.code} ne donne aucun montant`, 'MONTANT_NUL');
  const cible = journal.type === 'achats' ? { id: x.compte_achat_id, cote: 'à l\'achat' } : { id: x.compte_vente_id, cote: 'à la vente' };
  if (!cible.id) throw erreur(409, `Le code ${x.code} n'a pas de compte ${cible.cote} : réglez-le (page Taxes)`, 'TAXE_SANS_COMPTE');
  const k = (await comptesDe(db, d.id, [cible.id])).get(cible.id);
  if (!k || !k.actif || !k.feuille) throw erreur(409, `Le compte ${k ? k.numero : '?'} du code ${x.code} est à préciser : désactivé ou avec des sous-comptes actifs (page Taxes)`, 'COMPTE_NON_IMPUTABLE');
  // Retenue : achats → la retenue opérée est une dette envers l'État (crédit) ; ventes → la retenue subie, une créance
  // (débit). Avance : du même côté que la pièce (débit à l'achat : avance supportée ; crédit à la vente : avance facturée).
  const auDebit = TYPES_OPPOSES.includes(x.type) ? journal.type === 'ventes' : journal.type === 'achats';
  return {
    ligne: { compteId: k.id, tiersId: null, libelle: null, debit: auDebit ? texteMillimes(montant) : '0.000', credit: auDebit ? '0.000' : texteMillimes(montant), taxeId: x.id, echeance: null },
    compte: presenterCompteCourt(k),
    taxe: presenterTaxeCourte(x),
    base: texteMillimes(base),
  };
};
// Lecture du corps des aides : { journalId, ligne } et { journalId, tiersId?, taxeId?, lignes } (lignes incomplètes
// admises : une seule ligne, montants nuls refusés par lireLigne — l'aide travaille sur des lignes déjà chiffrées).
const lireAideTaxe = (corps) => {
  if (!corps || typeof corps !== 'object') throw erreur(400, 'Aide : requête invalide');
  const journalId = lireId(corps.journalId, 'Journal');
  if (!journalId) throw erreur(400, 'Choisissez le journal');
  return { journalId, ligne: lireLigne(corps.ligne, 0) };
};
const lireAideRetenue = (corps) => {
  if (!corps || typeof corps !== 'object') throw erreur(400, 'Aide : requête invalide');
  const journalId = lireId(corps.journalId, 'Journal');
  if (!journalId) throw erreur(400, 'Choisissez le journal');
  if (!Array.isArray(corps.lignes) || !corps.lignes.length) throw erreur(400, 'Lignes : saisissez d\'abord les lignes de la pièce');
  if (corps.lignes.length > LIGNES_MAX) throw erreur(400, `${LIGNES_MAX} lignes au plus par écriture`);
  return { journalId, tiersId: lireId(corps.tiersId, 'Tiers'), taxeId: lireId(corps.taxeId, 'Code de retenue'), lignes: corps.lignes.map(lireLigne) };
};

// ── Écritures (routes) ──────────────────────────────────────────────────────────────────────────────────────────────
// Toute écriture : transaction verrouillée du dossier (comptabilité verrouillée, dossier relu sous verrou, garde par
// comptabilité), droit « saisir » (titulaire, Complet ou Saisie — réponse 4 du 08/10), dossier non archivé ; puis ce que
// le travail rend (la liste est paginée : chaque écriture rend l'écriture touchée et les comptes rendus, la page relit ce
// qu'il lui faut). Les aides passent par la même porte : elles lisent la configuration du dossier sans rien écrire.
const ecritureEcritures = (req, travail, droit = 'saisir') => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces)[droit]) throw erreur(403, MSG_SAISIR, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  return travail(db, acces, d);
});

// GET /api/compta/dossiers/:dossierId/ecritures?journal=&periode=&etat=&q=&page=&limite= — une page (lecture : tout niveau).
const lire = async (req, res) => {
  try {
    const f = lireFiltres(req.query);
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatEcritures(pool, acces, d, f));
  } catch (err) {
    repondreErreur(res, err, '[compta.ecritures.lire]');
  }
};

// GET /api/compta/dossiers/:dossierId/ecritures/:ecritureId — une écriture et ses lignes (lecture : tout niveau).
const une = async (req, res) => {
  try {
    if (!idValide(req.params.ecritureId)) throw erreur(404, 'Écriture introuvable');
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    res.json({ ecriture: await uneEcriture(pool, d.id, req.params.ecritureId) });
  } catch (err) {
    repondreErreur(res, err, '[compta.ecritures.une]');
  }
};

// POST /api/compta/dossiers/:dossierId/ecritures — { journalId, date, reference, libelle, lignes: [{ compteId, tiersId?,
// libelle?, debit, credit, taxeId?, echeance? }] } : tout est contrôlé avant la moindre requête (forme, partie double),
// puis contre le dossier (journal actif, date dans une période ouverte de l'exercice ouvert, comptes imputables, tiers,
// codes) ; numéro provisoire suivant du dossier ; état brouillard ; date de traitement = NOW() du serveur. → 201
// { ecriture (avec lignes), nb }.
const creer = async (req, res) => {
  try {
    const e = lireEcriture(req.body || {});
    const resultat = await ecritureEcritures(req, async (db, acces, d) => {
      const journal = await journalDe(db, d.id, e.journalId);
      const { exercice, periode } = await periodeDe(db, d.id, e.date);
      exigerDateAN(journal, exercice, e.date);
      await controlerDateReelle(db, d.id, e.dateReelle);
      const cartes = await resoudreLignes(db, d, e.lignes);
      // Compteur du dossier (verrouillé par la transaction) : un brouillard supprimé ne rend pas son numéro.
      const numero = (await db.query('UPDATE compta.dossiers SET prochain_provisoire = prochain_provisoire + 1 WHERE id = $1 RETURNING prochain_provisoire - 1 AS n', [d.id])).rows[0].n;
      const ins = await db.query(
        `INSERT INTO compta.ecritures (dossier_id, exercice_id, periode_id, journal_id, date, date_reelle, numero_provisoire, reference, libelle, total_debit, total_credit, origine, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, 'saisie', $11) RETURNING id`,
        [d.id, exercice.id, periode.id, journal.id, e.date, e.dateReelle, numero, e.reference, e.libelle, texteMillimes(e.total), req.user.id]
      );
      await insererLignes(db, d, ins.rows[0].id, e.date, e.lignes);
      await journaliser(db, acces.espace_id, req.user.id, 'ecriture_creee', { dossier: d.id, ecriture: ins.rows[0].id, numeroProvisoire: numeroProvisoire(numero), ...resumeEcriture(e, journal, e.lignes, cartes) });
      return { ecriture: await uneEcriture(db, d.id, ins.rows[0].id), nb: await resumeEcritures(db, d.id) };
    });
    res.status(201).json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.ecritures.creer]');
  }
};

// PUT /api/compta/dossiers/:dossierId/ecritures/:ecritureId — même corps que la création ; écriture en brouillard
// seulement ; les lignes sont refaites ; le journal garde l'écriture d'avant et celle d'après (D16). → { ecriture, nb }.
const modifier = async (req, res) => {
  try {
    const e = lireEcriture(req.body || {});
    const resultat = await ecritureEcritures(req, async (db, acces, d) => {
      const avant = await ecritureDe(db, d.id, req.params.ecritureId);
      exigerBrouillard(avant);
      const journal = await journalDe(db, d.id, e.journalId);
      const { exercice, periode } = await periodeDe(db, d.id, e.date);
      exigerDateAN(journal, exercice, e.date);
      await controlerDateReelle(db, d.id, e.dateReelle);
      const lignesAvant = (await lignesDe(db, [avant.id])).get(avant.id);
      // Un tiers désactivé depuis la saisie ne bloque pas la correction d'une écriture qui le portait déjà.
      const cartes = await resoudreLignes(db, d, e.lignes, new Set(lignesAvant.map((l) => l.tiers_id).filter(Boolean)));
      const contenuAvant = resumeEnBase(avant, lignesAvant);
      const apres = resumeEcriture(e, journal, e.lignes, cartes);
      // Rien ne change : ni écriture ni ligne de journal.
      if (contenuComparable(contenuAvant) === contenuComparable(apres)) return { ecriture: await uneEcriture(db, d.id, avant.id), nb: await resumeEcritures(db, d.id) };
      await db.query('DELETE FROM compta.lignes WHERE ecriture_id = $1', [avant.id]);
      await db.query(
        `UPDATE compta.ecritures SET exercice_id = $2, periode_id = $3, journal_id = $4, date = $5, date_reelle = $9, reference = $6, libelle = $7, total_debit = $8, total_credit = $8, updated_at = NOW() WHERE id = $1`,
        [avant.id, exercice.id, periode.id, journal.id, e.date, e.reference, e.libelle, texteMillimes(e.total), e.dateReelle]
      );
      await insererLignes(db, d, avant.id, e.date, e.lignes);
      await journaliser(db, acces.espace_id, req.user.id, 'ecriture_modifiee', { dossier: d.id, ecriture: avant.id, numeroProvisoire: numeroProvisoire(avant.numero_provisoire), avant: contenuAvant, apres });
      return { ecriture: await uneEcriture(db, d.id, avant.id), nb: await resumeEcritures(db, d.id) };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.ecritures.modifier]');
  }
};

// DELETE /api/compta/dossiers/:dossierId/ecritures/:ecritureId — une écriture en brouillard (ses lignes suivent) ; le
// journal garde tout son contenu (rien ne disparaît sans trace). → { supprime, nb }.
const supprimer = async (req, res) => {
  try {
    const resultat = await ecritureEcritures(req, async (db, acces, d) => {
      const e = await ecritureDe(db, d.id, req.params.ecritureId);
      exigerBrouillard(e);
      const contenu = resumeEnBase(e, (await lignesDe(db, [e.id])).get(e.id));
      await db.query('DELETE FROM compta.ecritures WHERE id = $1', [e.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'ecriture_supprimee', { dossier: d.id, ecriture: e.id, numeroProvisoire: numeroProvisoire(e.numero_provisoire), contenu });
      return { supprime: { id: e.id, numeroProvisoire: numeroProvisoire(e.numero_provisoire) }, nb: await resumeEcritures(db, d.id) };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.ecritures.supprimer]');
  }
};

// POST /api/compta/dossiers/:dossierId/ecritures/aide/taxe — { journalId, ligne } : la ligne de taxe proposée pour une
// ligne hors taxes qui porte un code (TVA, timbre, FODEC…), calculée au millime ; rien n'est écrit. → { ligne, compte, taxe, base }.
const aideTaxe = async (req, res) => {
  try {
    const a = lireAideTaxe(req.body || {});
    const resultat = await ecritureEcritures(req, async (db, acces, d) => ligneDeTaxe(db, d, await journalDe(db, d.id, a.journalId), a.ligne));
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.ecritures.aideTaxe]');
  }
};

// POST /api/compta/dossiers/:dossierId/ecritures/aide/retenue — { journalId, tiersId?, taxeId?, lignes } : la ligne de
// retenue à la source proposée (retenue par défaut du tiers, ou code choisi) sur le TTC hors timbre ; rien n'est écrit.
// → { ligne, compte, taxe, base }.
const aideRetenue = async (req, res) => {
  try {
    const a = lireAideRetenue(req.body || {});
    const resultat = await ecritureEcritures(req, async (db, acces, d) => ligneDeRetenue(db, d, await journalDe(db, d.id, a.journalId), a));
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.ecritures.aideRetenue]');
  }
};

module.exports = {
  MSG_SAISIR, REFERENCE_MAX, LIBELLE_MAX, LIGNES_MIN, LIGNES_MAX, TOTAL_MAX, ETATS, ETATS_LIBELLES, NATURES_COLLECTIVES, NATURES_TVA, TYPES_HORS_TTC, TYPES_OPPOSES, TYPES_RETENUE, contenuComparable,
  lireMontant, texteMillimes, millimesDe, milliemesDe, calculTaxe, fmtMillimes, fmtDate, numeroProvisoire,
  lireTexte, lireReference, lireLibelle, lireLigne, lireLignes, lireEcriture, lireFiltres, lireAideTaxe, lireAideRetenue, totaux,
  SQL_ECRITURES, SQL_FILTRES, SQL_LIGNES, SQL_UNE, presenterLigne, presenterEcriture, presenterTaxeCourte, presenterTiersCourt, resumeEcritures, resumePeriode, assietteRetenue, compteDuCode,
  // S6b (validation.js, periodes.js) : les outils de la transaction du dossier, réemployés tels quels.
  journalDe, periodeDe, exerciceOuvert, ecritureDe, exigerBrouillard, uneEcriture, lignesDe, insererLignes, resumeEnBase,
  // S6c (livres.js, importEcritures.js) : le contrôle des lignes contre le dossier, la vraie date, le résumé D16, le motif de recherche.
  resoudreLignes, controlerLignes, controlerDateReelle, exigerDateAN, resumeEcriture, motifRecherche, LIMITE_MAX, PAGE_MAX,
  lire, une, creer, modifier, supprimer, aideTaxe, aideRetenue,
};
