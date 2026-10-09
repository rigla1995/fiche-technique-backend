// LabFlow Compta, étape S7c « Déclaration mensuelle » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne S7c, §2 « S7c »,
// §4 « TVA », « TCL », « Timbre », « Déclaration mensuelle », « Droits » ; réponses du client du 09/10 — « ok pour les 9 » :
// état préparatoire à recopier sur impots.finances.gov.tn (aucun format de fichier officiel), salaires saisis à la main,
// écriture de liquidation de la TVA proposée en brouillard ; question 7 : pas de vente à l'export pour l'instant ;
// recherche-fiscale-tunisie.md §2, §3.3, §3.5). La déclaration mensuelle d'une période d'un dossier :
//   • LECTURE (tout niveau, lectureDossier) : l'état préparatoire, ligne par ligne comme sur le portail — TVA à payer (état de
//     TVA de S7b, écritures VALIDÉES seulement), retenues à la source par nature (paiements du mois : certificats produits et
//     paiements encore à certifier), retenues de TVA opérées, avances facturées, droit de timbre collecté, FODEC collecté, TCL
//     (calculée, corrigeable), lignes saisies à la main (salaires…) — ; le total à payer ; l'échéance ; l'aperçu de
//     l'écriture de liquidation de la TVA ; l'historique de l'exercice ; les signalements ; export Excel et PDF ;
//   • ÉCRITURES (titulaire, Complet — droit « configurer » —, dossier non archivé ; transaction verrouillée du dossier, un
//     état périmé répond 409) : enregistrer les montants saisis à la main et la TCL corrigée (« préparer ») ; proposer
//     l'écriture de liquidation (brouillard du journal OD, à valider sur la page Écritures) ; marquer la déclaration comme
//     déposée (date ; l'état est figé pour l'historique, sans effet comptable) ; retirer la marque.
// Rien n'est passé d'office : la déclaration se recopie sur le portail ; les montants restent recalculés à chaque lecture
// (un écart avec l'état figé au marquage est signalé).
const ExcelJS = require('exceljs');
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { fiscaliteDe } = require('./paquets');
const { droits, dateValide, dansEspaceDuDossier } = require('./dossiers');
const { lectureDossier, presenterDossier } = require('./planComptes');
const { fmtDate, fmtMillimes, numeroProvisoire, lireMontant, texteMillimes, journalDe, periodeDe, controlerDateReelle, resoudreLignes, insererLignes, resumeEcriture } = require('./ecritures');
const { aujourdhuiTunis } = require('./echeances');
const { exercicesDe, ajouterFeuille, nombreExcel, avecGardeExport } = require('./livres');
const { envoyerClasseur, jourTunis } = require('./importExcel');
const { MARGE, LARGEUR, COULEURS, creerDocument, envoyerPdf, nomPdf } = require('./pdf');
const { millimes, texte, paiementsDe } = require('./taxesCalcul');
const { etatTvaDe } = require('./taxesMois');
const { chargerOperations, certificatsDuMois } = require('./certificats');
const { libelleMois, deMois, echeanceDe, tclDe, lignesLiquidation, totalDe, memesLignes } = require('./declarationCalcul');

const MSG_DECLARATION = 'Seul le titulaire ou un gérant de niveau Complet peut préparer, proposer l\'écriture de TVA ou marquer une déclaration';

// ── Requêtes ────────────────────────────────────────────────────────────────────────────────────────────────────────
// La période ($1 dossier, $2 période), avec son exercice.
const SQL_PERIODE = `
  SELECT p.id, p.exercice_id, p.debut::text AS debut, p.fin::text AS fin, p.etat
    FROM compta.periodes p JOIN compta.exercices x ON x.id = p.exercice_id
   WHERE x.dossier_id = $1 AND p.id = $2`;
// Le chiffre d'affaires hors taxes du mois ($1 dossier, $2 période, $3 motifs des comptes « 70% ») : écritures validées,
// hors à-nouveaux.
const SQL_CA = `
  SELECT COALESCE(SUM(l.credit - l.debit), 0)::numeric(18,3)::text AS ca
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.journaux j ON j.id = e.journal_id
    JOIN compta.comptes k ON k.id = l.compte_id
   WHERE l.dossier_id = $1 AND e.periode_id = $2 AND e.etat = 'validee' AND j.type <> 'an' AND k.numero LIKE ANY ($3::text[])`;
// Timbre, FODEC et avances COLLECTÉS du mois ($1 dossier, $2 période) : lignes de ces codes hors comptes de charges, de stocks,
// d'immobilisations et de retenues subies (le côté achat), crédit − débit ; nombre de pièces.
const SQL_TAXES_COLLECTEES = `
  SELECT x.type, COALESCE(SUM(l.credit - l.debit), 0)::numeric(18,3)::text AS montant, COUNT(DISTINCT e.id)::int AS nb
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.journaux j ON j.id = e.journal_id
    JOIN compta.comptes k ON k.id = l.compte_id
    JOIN compta.taxes x ON x.id = l.taxe_id AND x.type IN ('timbre', 'fodec', 'avance')
   WHERE l.dossier_id = $1 AND e.periode_id = $2 AND e.etat = 'validee' AND j.type <> 'an'
     AND k.nature NOT IN ('charges', 'stocks', 'immobilisations', 'retenues_subies')
   GROUP BY x.type`;
// Les soldes des comptes de TVA du mois ($1 dossier, $2 période), lignes codées des écritures validées hors à-nouveaux, comme
// l'état de TVA (collectée, déductible, retenue de TVA subie) : la liquidation les solde.
const SQL_COMPTES_TVA = `
  SELECT k.id AS compte_id, k.numero, k.nature, BOOL_AND(x.type = 'retenue_tva') AS subie, SUM(l.debit - l.credit)::numeric(18,3)::text AS solde
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.journaux j ON j.id = e.journal_id
    JOIN compta.comptes k ON k.id = l.compte_id
    JOIN compta.taxes x ON x.id = l.taxe_id
   WHERE l.dossier_id = $1 AND e.periode_id = $2 AND e.etat = 'validee' AND j.type <> 'an'
     AND ((x.type IN ('tva', 'retenue_tva') AND k.nature = 'tva_collectee') OR (x.type = 'tva' AND k.nature = 'tva_deductible')
          OR (x.type = 'retenue_tva' AND k.nature NOT IN ('tva_collectee', 'retenues_operees')))
   GROUP BY k.id, k.numero, k.nature
  HAVING SUM(l.debit - l.credit) <> 0
   ORDER BY k.numero`;
// Écritures en brouillard de la période ($1 dossier, $2 période), hors l'écriture de liquidation proposée par une déclaration.
const SQL_BROUILLARD = `
  SELECT COUNT(*)::int AS n FROM compta.ecritures e
   WHERE e.dossier_id = $1 AND e.periode_id = $2 AND e.etat = 'brouillard'
     AND NOT EXISTS (SELECT 1 FROM compta.declarations dc WHERE dc.dossier_id = e.dossier_id AND dc.ecriture_id = e.id)`;
// Les déclarations ($1 dossier, $2 périodes), avec leur écriture de liquidation et leurs auteurs.
const SQL_DECLARATIONS = `
  SELECT dc.id, dc.periode_id, dc.saisies, dc.tcl::text AS tcl, dc.ecriture_id, e.numero AS ecriture_numero, e.numero_provisoire AS ecriture_provisoire,
         e.etat AS ecriture_etat, e.date::text AS ecriture_date, dc.declaree_le::text AS declaree_le, dc.marquee_le, u.nom AS declaree_par_nom,
         dc.montants, dc.total::text AS total, dc.updated_at, um.nom AS modifie_par_nom
    FROM compta.declarations dc
    LEFT JOIN compta.ecritures e ON e.id = dc.ecriture_id
    LEFT JOIN utilisateurs u ON u.id = dc.declaree_par
    LEFT JOIN utilisateurs um ON um.id = dc.modifie_par
   WHERE dc.dossier_id = $1 AND dc.periode_id = ANY($2)`;
// Les comptes du dossier aux numéros donnés ($1 dossier, $2 numéros).
const SQL_COMPTES_NUMEROS = 'SELECT id, numero, libelle FROM compta.comptes WHERE dossier_id = $1 AND numero = ANY($2)';
// Le journal des opérations diverses du dossier ($1 dossier) : le premier actif.
const SQL_JOURNAL_OD = `SELECT id FROM compta.journaux WHERE dossier_id = $1 AND type = 'od' AND actif ORDER BY code LIMIT 1`;
// La première période ouverte d'un exercice ouvert après une date ($1 dossier, $2 date).
const SQL_PERIODE_OUVERTE_APRES = `
  SELECT p.debut::text AS debut FROM compta.periodes p JOIN compta.exercices x ON x.id = p.exercice_id
   WHERE x.dossier_id = $1 AND x.etat = 'ouvert' AND p.etat = 'ouverte' AND p.debut > $2::date
   ORDER BY p.debut LIMIT 1`;

// ── Sélection ───────────────────────────────────────────────────────────────────────────────────────────────────────
// periode (identifiant ; vide = la dernière période finie, sinon celle du jour, sinon la première).
const lireParametres = (query = {}) => {
  if (!query || typeof query !== 'object') throw erreur(400, 'Paramètres invalides');
  const p = query.periode === undefined || query.periode === '' ? null : query.periode;
  if (p != null && !idValide(p)) throw erreur(404, 'Période introuvable');
  return { periodeId: p == null ? null : Number(p) };
};
const periodeParDefaut = (exercices, aujourdhui = aujourdhuiTunis()) => {
  const toutes = exercices.flatMap((x) => x.periodes.map((p) => ({ exercice: x, periode: p })));
  if (!toutes.length) return null;
  const finies = toutes.filter((t) => t.periode.fin < aujourdhui).sort((a, b) => (a.periode.fin < b.periode.fin ? 1 : -1));
  return finies[0] || toutes.find((t) => aujourdhui >= t.periode.debut && aujourdhui <= t.periode.fin) || toutes[0];
};
const selection = async (db, d, periodeId) => {
  const exercices = await exercicesDe(db, d.id);
  if (!exercices.length) throw erreur(409, 'Aucun exercice dans ce dossier', 'EXERCICE_ABSENT');
  if (periodeId == null) {
    const s = periodeParDefaut(exercices);
    if (!s) throw erreur(409, 'Aucune période dans ce dossier', 'EXERCICE_ABSENT');
    return { exercices, ...s };
  }
  for (const x of exercices) {
    const p = x.periodes.find((y) => y.id === periodeId);
    if (p) return { exercices, exercice: x, periode: p };
  }
  throw erreur(404, 'Période introuvable');
};

// ── Calcul ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const regimeDe = (d) => ({ personne: d.personne, teledeclaration: !!d.teledeclaration });
// Les retenues opérées des paiements du mois (écritures validées) : par nature (code TEJ, sinon code) — certifiées
// (certificats produits du mois) et à certifier (paiements du mois sans certificat) — et retenues de TVA opérées par code ;
// les pièces bloquées et en brouillard du mois, comptées à part (non déclarées ici).
const retenuesDuMois = async (db, d, periode, fiscalite) => {
  const [{ operations }, certificats] = await Promise.all([chargerOperations(db, d.id), certificatsDuMois(db, d.id, periode.debut, periode.fin)]);
  const dans = (iso) => iso >= periode.debut && iso <= periode.fin;
  const parNature = new Map();
  const parTva = new Map();
  const libellesTva = new Map((fiscalite?.tej?.codesTaxesAdditionnelles || []).map((o) => [o.code, o.libelle]));
  const ajouter = (o, certifie) => {
    const cle = o.codeTej || o.code;
    if (!parNature.has(cle)) parNature.set(cle, { cle, codeTej: o.codeTej || null, code: o.code, libelle: o.libelleCode || o.code, taux: o.tauxRs, base: 0n, certifie: 0n, aCertifier: 0n, nb: 0 });
    const n = parNature.get(cle);
    n.nb += 1;
    n.base += millimes(o.ttc);
    if (certifie) n.certifie += millimes(o.rs); else n.aCertifier += millimes(o.rs);
    if (o.rsTva) {
      const c = o.rsTva.code || 'RSTVA';
      if (!parTva.has(c)) parTva.set(c, { code: c, libelle: libellesTva.get(c) || 'Retenue à la source de TVA', montant: 0n });
      parTva.get(c).montant += millimes(o.rsTva.montant);
    }
  };
  for (const p of paiementsDe(operations).filter((x) => dans(x.date))) for (const o of p.operations) ajouter(o, false);
  for (const c of certificats.filter((x) => x.etat === 'produit')) for (const o of c.operations) ajouter(o, true);
  const natures = [...parNature.values()].sort((a, b) => String(a.cle).localeCompare(String(b.cle)))
    .map((n) => ({ ...n, base: texte(n.base), certifie: texte(n.certifie), aCertifier: texte(n.aCertifier), montant: texte(n.certifie + n.aCertifier) }));
  const tva = [...parTva.values()].map((t) => ({ ...t, montant: texte(t.montant) }));
  return {
    natures, tva,
    total: texte(natures.reduce((t, n) => t + millimes(n.montant), 0n) + tva.reduce((t, x) => t + millimes(x.montant), 0n)),
    bloquees: operations.filter((o) => o.etat === 'validee' && o.probleme && dans(o.dateProposee)).map((o) => ({ ecritureId: o.ecritureId, reference: o.numero || o.reference, message: o.probleme.message })),
    brouillard: operations.filter((o) => o.etat !== 'validee' && dans(o.dateFacture)).length,
  };
};
const presenterDeclaration = (r) => (r ? {
  id: r.id, saisies: r.saisies || {}, tcl: r.tcl,
  ecriture: r.ecriture_id ? { id: r.ecriture_id, numero: r.ecriture_numero || null, numeroProvisoire: r.ecriture_provisoire != null ? numeroProvisoire(r.ecriture_provisoire) : null, etat: r.ecriture_etat, date: r.ecriture_date } : null,
  marque: r.declaree_le ? { date: r.declaree_le, le: r.marquee_le, par: r.declaree_par_nom || null, total: r.total, lignes: (r.montants || {}).lignes || [] } : null,
  modifieLe: r.updated_at, modifiePar: r.modifie_par_nom || null,
} : null);
// Les lignes de la déclaration (ordre du portail), le total à payer. `declaration` : la ligne en base (saisies, TCL
// corrigée) ; `saisiesDef` : les lignes saisies à la main du paquet.
const lignesDe = ({ tva, retenues, collectees, tcl, declaration, saisiesDef }) => {
  const lignes = [{ cle: 'tva', rubrique: 'TVA', libelle: 'TVA à payer', montant: tva.aPayer }];
  for (const n of retenues.natures) lignes.push({ cle: `rs:${n.cle}`, rubrique: 'Retenues à la source', libelle: `${n.codeTej ? `${n.codeTej} — ` : ''}${n.libelle}`, montant: n.montant });
  for (const t of retenues.tva) lignes.push({ cle: `rstva:${t.code}`, rubrique: 'Retenues à la source de TVA', libelle: `${t.code} — ${t.libelle}`, montant: t.montant });
  if (millimes(collectees.avance.montant) !== 0n) lignes.push({ cle: 'avances', rubrique: 'Avances', libelle: 'Avances facturées (articles 51 quater et 51 septies)', montant: collectees.avance.montant });
  lignes.push({ cle: 'timbre', rubrique: 'Droit de timbre', libelle: `Droit de timbre collecté (${collectees.timbre.nb} pièce${collectees.timbre.nb > 1 ? 's' : ''})`, montant: collectees.timbre.montant });
  if (millimes(collectees.fodec.montant) !== 0n) lignes.push({ cle: 'fodec', rubrique: 'FODEC', libelle: 'FODEC collecté', montant: collectees.fodec.montant });
  if (tcl) {
    const corrigee = declaration && declaration.tcl != null;
    lignes.push({ cle: 'tcl', rubrique: 'TCL', libelle: `TCL (${Number(tcl.taux).toLocaleString('fr-FR')} % du chiffre d'affaires ${tcl.assiette === 'ttc' ? 'brut TTC' : 'hors taxes'})${corrigee ? ' — montant corrigé' : ''}`, montant: corrigee ? texte(millimes(declaration.tcl)) : tcl.montant, corrigee });
  }
  const saisies = (declaration && declaration.saisies) || {};
  for (const s of saisiesDef) lignes.push({ cle: `saisie:${s.cle}`, rubrique: 'Saisi à la main', libelle: s.libelle, montant: saisies[s.cle] != null ? texte(millimes(saisies[s.cle])) : '0.000', saisie: true });
  return lignes;
};

// L'état complet d'une déclaration (lecture et contrôles des écritures). `db` : pool ou client de la transaction.
const etatDeclaration = async (db, d, sel, { avecHistorique = true } = {}) => {
  const { exercices, exercice, periode } = sel;
  const fiscalite = fiscaliteDe(d.pays);
  const dec = fiscalite?.declaration || null;
  const aujourdhui = aujourdhuiTunis();
  const prefixes = (dec?.tcl?.comptes || []).map((c) => `${c}%`);
  const numeros = [fiscalite?.tva?.compteCredit, fiscalite?.tva?.compteAPayer].filter(Boolean);
  const periodesExercice = exercice.periodes.map((p) => p.id);
  const [tva, retenues, ca, collectees, comptesTva, brouillard, rangees, comptes, journalOd] = await Promise.all([
    etatTvaDe(db, d, exercice, periode, false, exercices),
    retenuesDuMois(db, d, periode, fiscalite),
    prefixes.length ? db.query(SQL_CA, [d.id, periode.id, prefixes]) : { rows: [{ ca: '0.000' }] },
    db.query(SQL_TAXES_COLLECTEES, [d.id, periode.id]),
    db.query(SQL_COMPTES_TVA, [d.id, periode.id]),
    db.query(SQL_BROUILLARD, [d.id, periode.id]),
    db.query(SQL_DECLARATIONS, [d.id, periodesExercice]),
    numeros.length ? db.query(SQL_COMPTES_NUMEROS, [d.id, numeros]) : { rows: [] },
    db.query(SQL_JOURNAL_OD, [d.id]),
  ]);
  const col = (type) => { const r = collectees.rows.find((x) => x.type === type); return { montant: r ? r.montant : '0.000', nb: r ? r.nb : 0 }; };
  const taxesCollectees = { timbre: col('timbre'), fodec: col('fodec'), avance: col('avance') };
  const tcl = tclDe({ ca: ca.rows[0].ca, tvaCollectee: tva.collectee, tcl: dec?.tcl, exportateur: !!d.exportateur_total });
  const ligneDec = rangees.rows.find((r) => r.periode_id === periode.id) || null;
  const declaration = presenterDeclaration(ligneDec);
  const saisiesDef = dec?.saisies || [];
  const lignes = lignesDe({ tva, retenues, collectees: taxesCollectees, tcl, declaration, saisiesDef });
  const total = totalDe(lignes);
  const echeance = echeanceDe(regimeDe(d), periode.fin, dec?.echeances);
  const finie = aujourdhui > periode.fin;

  // L'écriture de liquidation : aperçu et ce qui l'empêche.
  const parNumero = new Map(comptes.rows.map((k) => [k.numero, k]));
  const kCredit = parNumero.get(fiscalite?.tva?.compteCredit);
  const kAPayer = parNumero.get(fiscalite?.tva?.compteAPayer);
  let liquidation = { lignes: [], total: '0.000', date: null, dateReelle: null, possible: false, raison: null };
  const ecriture = declaration && declaration.ecriture;
  if (ecriture) liquidation.raison = 'DEJA';
  else if (!finie) liquidation.raison = 'PERIODE_EN_COURS';
  else if (brouillard.rows[0].n) liquidation.raison = 'BROUILLARD';
  else if (!kCredit || !kAPayer) liquidation.raison = 'COMPTES';
  else if (!journalOd.rows.length) liquidation.raison = 'JOURNAL';
  if (kCredit && kAPayer) {
    const l = lignesLiquidation({ comptes: comptesTva.rows, collectee: tva.collectee, deductible: tva.deductible, retenuesSubies: tva.retenuesSubies, creditReporte: tva.creditReporte, resultat: tva.resultat, compteCredit: kCredit, compteAPayer: kAPayer, mois: periode.fin });
    liquidation.lignes = l.lignes.map((x) => ({ compteId: x.compteId, numero: x.numero, libelle: x.libelle, debit: texte(x.debit), credit: texte(x.credit) }));
    liquidation.total = texte(l.total);
    if (!liquidation.raison && l.ecart) liquidation.raison = 'ECART';
    if (!liquidation.raison && !l.lignes.length) liquidation.raison = 'RIEN';
  }
  if (!liquidation.raison) {
    if (periode.etat === 'ouverte') liquidation = { ...liquidation, date: periode.fin, dateReelle: null };
    else {
      const suivante = (await db.query(SQL_PERIODE_OUVERTE_APRES, [d.id, periode.fin])).rows[0];
      if (suivante) liquidation = { ...liquidation, date: suivante.debut, dateReelle: periode.fin };
      else liquidation.raison = 'PAS_DE_PERIODE_OUVERTE';
    }
  }
  liquidation.possible = !liquidation.raison;

  // Les signalements, sans rien passer d'office.
  const signalements = [];
  const marque = declaration && declaration.marque;
  if (!finie) signalements.push({ code: 'PERIODE_EN_COURS', gravite: 'info', message: `Le mois n'est pas fini (jusqu'au ${fmtDate(periode.fin)}) : les montants vont encore changer` });
  else if (periode.etat === 'ouverte') signalements.push({ code: 'PERIODE_OUVERTE', gravite: 'attention', message: 'Période encore ouverte : clôturez-la (page Périodes) avant de déclarer, sinon une écriture ajoutée changera les montants' });
  if (brouillard.rows[0].n) signalements.push({ code: 'BROUILLARD', gravite: 'attention', message: `${brouillard.rows[0].n} écriture${brouillard.rows[0].n > 1 ? 's' : ''} en brouillard dans la période : non comptée${brouillard.rows[0].n > 1 ? 's' : ''} (validez-les ou supprimez-les, page Écritures)` });
  if (retenues.bloquees.length) signalements.push({ code: 'RETENUES_BLOQUEES', gravite: 'attention', message: `${retenues.bloquees.length} pièce${retenues.bloquees.length > 1 ? 's' : ''} à retenue bloquée${retenues.bloquees.length > 1 ? 's' : ''} non comptée${retenues.bloquees.length > 1 ? 's' : ''} (${retenues.bloquees.slice(0, 5).map((b) => b.reference).join(', ')}${retenues.bloquees.length > 5 ? '…' : ''}) : à corriger, page Taxes du mois` });
  if (tva.sansCode.nb) signalements.push({ code: 'TVA_SANS_CODE', gravite: 'attention', message: `${tva.sansCode.nb} ligne${tva.sansCode.nb > 1 ? 's' : ''} de TVA sans code de taxe dans la période (collectée ${fmtMillimes(millimes(tva.sansCode.collectee))} D, déductible ${fmtMillimes(millimes(tva.sansCode.deductible))} D) : non comptée${tva.sansCode.nb > 1 ? 's' : ''}` });
  if (tva.creditNonRepris) signalements.push({ code: 'CREDIT_NON_REPRIS', gravite: 'attention', message: `Crédit de TVA de l'exercice précédent non repris : ${fmtMillimes(millimes(tva.creditNonRepris.montant))} D calculés au ${fmtDate(tva.creditNonRepris.fin)}, aucun à-nouveau sur le compte ${tva.compteCredit || 'du crédit de TVA'}` });
  if (echeance && !marque && aujourdhui > echeance.date) signalements.push({ code: 'ECHEANCE_DEPASSEE', gravite: 'attention', message: `Échéance du ${fmtDate(echeance.date)} dépassée et déclaration non marquée comme déposée` });
  const ecart = !!marque && !memesLignes(marque.lignes, lignes);
  if (ecart) signalements.push({ code: 'ECART_DECLARATION', gravite: 'attention', message: `Les montants ont changé depuis la déclaration du ${fmtDate(marque.date)} (total déclaré ${fmtMillimes(millimes(marque.total))} D, recalculé ${fmtMillimes(millimes(total))} D) : une déclaration rectificative peut être nécessaire` });
  if (tcl) signalements.push({ code: 'TCL', gravite: 'info', message: `TCL calculée sur ${fmtMillimes(millimes(tcl.base))} D (${tcl.assiette === 'ttc' ? 'chiffre d\'affaires brut TTC' : 'chiffre d\'affaires hors taxes'}) : le minimum (taxe sur les immeubles bâtis) et le plafond annuel de 100 000 D ne sont pas calculés — corrigez le montant si besoin ; assiette à valider par un comptable` });
  if (millimes(tva.creditAReporter) > 0n) signalements.push({ code: 'CREDIT_A_REPORTER', gravite: 'info', message: `Crédit de TVA à reporter : ${fmtMillimes(millimes(tva.creditAReporter))} D (il ne s'impute pas sur les autres impôts de la déclaration)` });

  // L'historique de l'exercice : chaque période, son échéance, sa marque, son écriture.
  const historique = avecHistorique ? exercice.periodes.map((p) => {
    const r = presenterDeclaration(rangees.rows.find((x) => x.periode_id === p.id));
    return { periodeId: p.id, debut: p.debut, fin: p.fin, etat: p.etat, echeance: echeanceDe(regimeDe(d), p.fin, dec?.echeances), marque: r?.marque ? { date: r.marque.date, total: r.marque.total, par: r.marque.par } : null, ecriture: r?.ecriture || null, preparee: !!r };
  }) : [];

  return {
    exercices: exercices.map((x) => ({ id: x.id, debut: x.debut, fin: x.fin, etat: x.etat, periodes: x.periodes })),
    exercice: { id: exercice.id, debut: exercice.debut, fin: exercice.fin, etat: exercice.etat },
    periode, aujourdhui, finie, echeance,
    tva: {
      collectee: tva.collectee, deductibleBs: tva.deductibleBs, deductibleImmo: tva.deductibleImmo, deductible: tva.deductible, retenuesSubies: tva.retenuesSubies,
      creditReporte: tva.creditReporte, resultat: tva.resultat, aPayer: tva.aPayer, creditAReporter: tva.creditAReporter, compteCredit: tva.compteCredit,
      codes: tva.codes.filter((c) => c.type === 'tva' && [c.collectee, c.deductible, c.deductibleImmo, c.baseVente, c.baseAchat].some((v) => millimes(v) !== 0n)),
    },
    retenues: { natures: retenues.natures, tva: retenues.tva, total: retenues.total, bloquees: retenues.bloquees, brouillard: retenues.brouillard },
    collectees: taxesCollectees, tcl,
    saisies: saisiesDef.map((s) => ({ cle: s.cle, libelle: s.libelle, montant: declaration && declaration.saisies[s.cle] != null ? texte(millimes(declaration.saisies[s.cle])) : null })),
    lignes, total, declaration, ecart, liquidation, historique, signalements,
    nbBrouillard: brouillard.rows[0].n,
    regime: { personne: d.personne, teledeclaration: !!d.teledeclaration, tva: d.tva, exportateurTotal: !!d.exportateur_total },
    source: dec?.note || null,
  };
};

// ── Routes de lecture ───────────────────────────────────────────────────────────────────────────────────────────────
// GET /api/compta/dossiers/:dossierId/declaration?periode= — la page (lecture : tout niveau).
const lire = async (req, res) => {
  try {
    const f = lireParametres(req.query);
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    const sel = await selection(pool, d, f.periodeId);
    const [e, mode] = await Promise.all([etatDeclaration(pool, d, sel), modeTitulaire(pool, acces.espace_id)]);
    res.json({ dossier: presenterDossier(acces, d), droits: droits(acces), ...e, etatAbonnement: etatAbonnement(mode) });
  } catch (err) {
    repondreErreur(res, err, '[compta.declarations.lire]');
  }
};

const titreDe = (e) => `Déclaration mensuelle ${deMois(e.periode.fin)}`;
const metaDe = (d, e) => `${d.raison_sociale || d.nom}${d.matricule_fiscal ? ` · matricule ${d.matricule_fiscal}` : ''} · du ${fmtDate(e.periode.debut)} au ${fmtDate(e.periode.fin)}${e.echeance ? ` · échéance le ${fmtDate(e.echeance.date)}` : ''} · écritures validées · ${jourTunis()}`;
// GET …/declaration/export?periode= — l'état préparatoire à la charte (Excel ; trois feuilles), sous la garde des exports.
const exporter = (req, res) => avecGardeExport(res, '[compta.declarations.exporter]', async () => {
  const f = lireParametres(req.query);
  const { d } = await lectureDossier(req.user, req.params.dossierId);
  const e = await etatDeclaration(pool, d, await selection(pool, d, f.periodeId), { avecHistorique: false });
  const meta = metaDe(d, e);
  const wb = new ExcelJS.Workbook();
  ajouterFeuille(wb, {
    feuille: 'Déclaration', titre: titreDe(e), sousTitre: d.nom, metaTexte: meta,
    enTetes: ['Rubrique', 'Ligne', 'Montant (D)'], largeurs: [28, 70, 18], montants: [3],
    rangees: e.lignes.map((l) => [l.rubrique, l.libelle, nombreExcel(l.montant)]),
    total: ['Total à payer', e.declaration?.marque ? `Déclarée le ${fmtDate(e.declaration.marque.date)}` : '', nombreExcel(e.total)],
  });
  const t = e.tva;
  ajouterFeuille(wb, {
    feuille: 'TVA', titre: 'TVA du mois', sousTitre: d.nom, metaTexte: meta,
    enTetes: ['Code', 'Libellé', 'Taux', 'Base ventes', 'TVA collectée', 'Base achats', 'TVA déductible', 'Sur immobilisations'], largeurs: [12, 34, 9, 16, 16, 16, 16, 16], montants: [4, 5, 6, 7, 8],
    rangees: [
      ...t.codes.map((c) => [c.code, c.libelle, c.taux != null ? Number(c.taux) : '', nombreExcel(c.baseVente), nombreExcel(c.collectee), nombreExcel(c.baseAchat), nombreExcel(c.deductible), nombreExcel(c.deductibleImmo)]),
      ['', 'TVA collectée', '', null, nombreExcel(t.collectee), null, null, null],
      ['', 'TVA déductible (biens et services, immobilisations)', '', null, null, null, nombreExcel(t.deductibleBs), nombreExcel(t.deductibleImmo)],
      ['', 'Retenues de TVA subies', '', null, null, null, nombreExcel(t.retenuesSubies), null],
      ['', 'Crédit reporté', '', null, null, null, nombreExcel(t.creditReporte), null],
      ['', millimes(t.resultat) >= 0n ? 'TVA à payer' : 'Crédit à reporter', '', null, nombreExcel(millimes(t.resultat) >= 0n ? t.aPayer : t.creditAReporter), null, null, null],
    ],
    total: null,
  });
  ajouterFeuille(wb, {
    feuille: 'Retenues', titre: 'Retenues à la source par nature (paiements du mois)', sousTitre: d.nom, metaTexte: meta,
    enTetes: ['Code TEJ', 'Nature', 'Taux (%)', 'Pièces', 'Base TTC', 'Certifiées', 'À certifier', 'Retenue'], largeurs: [14, 50, 9, 9, 16, 16, 16, 16], montants: [5, 6, 7, 8],
    rangees: [
      ...e.retenues.natures.map((n) => [n.codeTej || '', `${n.code} — ${n.libelle}`, n.taux != null ? Number(n.taux) : '', n.nb, nombreExcel(n.base), nombreExcel(n.certifie), nombreExcel(n.aCertifier), nombreExcel(n.montant)]),
      ...e.retenues.tva.map((x) => [x.code, x.libelle, '', '', null, null, null, nombreExcel(x.montant)]),
    ],
    total: ['Total', '', '', '', null, null, null, nombreExcel(e.retenues.total)],
  });
  await envoyerClasseur(res, wb, nomPdf('declaration', d.nom, e.periode.debut.slice(0, 7)).replace(/\.pdf$/, '.xlsx'));
});

// Le PDF de l'état préparatoire : identité, échéance, lignes par rubrique, total, TVA, retenues par nature, mentions.
const construirePdf = (d, e) => {
  const p = creerDocument({ titre: `${titreDe(e)} - ${d.nom}`, suite: titreDe(e) });
  p.texte(titreDe(e).toUpperCase(), MARGE, p.y, { taille: 14, gras: true, couleur: COULEURS.indigo });
  p.y += 20;
  p.paragraphe(`${d.raison_sociale || d.nom}${d.matricule_fiscal ? ` — matricule fiscal ${d.matricule_fiscal}` : ''}`, { taille: 10, gras: true });
  p.paragraphe(`Période du ${fmtDate(e.periode.debut)} au ${fmtDate(e.periode.fin)}${e.periode.etat === 'close' ? ' (close)' : ' (ouverte)'}${e.echeance ? ` · échéance le ${fmtDate(e.echeance.date)}` : ''} · écritures validées`, { taille: 8.5, couleur: COULEURS.gris });
  if (e.declaration?.marque) p.paragraphe(`Déclarée le ${fmtDate(e.declaration.marque.date)}${e.declaration.marque.par ? ` (marquée par ${e.declaration.marque.par})` : ''} — total déclaré ${fmtMillimes(millimes(e.declaration.marque.total))} D`, { taille: 9, gras: true, couleur: COULEURS.indigo });
  p.y += 4;
  const COL = [120, LARGEUR - 220, 100];
  const enTete = () => { p.rangee([{ t: 'Rubrique' }, { t: 'Ligne' }, { t: 'Montant (D)', aligner: 'right' }], COL, { taille: 8, gras: true, couleur: COULEURS.gris }); p.filet(p.y); };
  enTete();
  for (const l of e.lignes) {
    const cellules = [{ t: l.rubrique }, { t: l.libelle }, { t: fmtMillimes(millimes(l.montant)), aligner: 'right' }];
    p.assurer(p.hauteurRangee(cellules, COL, 8.5), enTete);
    p.rangee(cellules, COL, { taille: 8.5 });
  }
  p.filet(p.y);
  p.rangee([{ t: 'Total à payer' }, { t: '' }, { t: fmtMillimes(millimes(e.total)), aligner: 'right' }], COL, { taille: 9.5, gras: true, fond: COULEURS.bande });
  p.y += 10;
  const t = e.tva;
  p.paragraphe('TVA du mois', { taille: 10, gras: true });
  const COLT = [LARGEUR - 120, 120];
  for (const [libelle, v] of [['TVA collectée', t.collectee], ['TVA déductible sur biens et services', t.deductibleBs], ['TVA déductible sur immobilisations', t.deductibleImmo], ['Retenues de TVA subies', t.retenuesSubies], ['Crédit reporté', t.creditReporte], [millimes(t.resultat) >= 0n ? 'TVA à payer' : 'Crédit à reporter', millimes(t.resultat) >= 0n ? t.aPayer : t.creditAReporter]]) {
    p.assurer(14);
    p.rangee([{ t: libelle }, { t: fmtMillimes(millimes(v)), aligner: 'right' }], COLT, { taille: 8.5 });
  }
  if (e.retenues.natures.length || e.retenues.tva.length) {
    p.y += 8;
    p.paragraphe('Retenues à la source par nature (paiements du mois)', { taille: 10, gras: true });
    const COLR = [80, LARGEUR - 320, 80, 80, 80];
    const enTeteR = () => { p.rangee([{ t: 'Code TEJ' }, { t: 'Nature' }, { t: 'Base TTC', aligner: 'right' }, { t: 'À certifier', aligner: 'right' }, { t: 'Retenue', aligner: 'right' }], COLR, { taille: 8, gras: true, couleur: COULEURS.gris }); p.filet(p.y); };
    enTeteR();
    for (const n of e.retenues.natures) {
      const c = [{ t: n.codeTej || '' }, { t: `${n.code} — ${n.libelle}` }, { t: fmtMillimes(millimes(n.base)), aligner: 'right' }, { t: millimes(n.aCertifier) ? fmtMillimes(millimes(n.aCertifier)) : '', aligner: 'right' }, { t: fmtMillimes(millimes(n.montant)), aligner: 'right' }];
      p.assurer(p.hauteurRangee(c, COLR, 8.5), enTeteR);
      p.rangee(c, COLR, { taille: 8.5 });
    }
    for (const x of e.retenues.tva) p.rangee([{ t: x.code }, { t: x.libelle }, { t: '' }, { t: '' }, { t: fmtMillimes(millimes(x.montant)), aligner: 'right' }], COLR, { taille: 8.5 });
  }
  p.y += 10;
  for (const s of e.signalements.filter((x) => x.gravite !== 'info')) p.paragraphe(`À vérifier : ${s.message}.`, { taille: 8, couleur: COULEURS.alerte });
  p.paragraphe('État préparatoire établi par LabFlow Compta à partir des écritures validées : il se recopie sur le portail de la Direction générale des impôts (impots.finances.gov.tn), qui ne propose pas de dépôt par fichier. Les lignes saisies à la main (salaires…) et la TCL sont sous la responsabilité de l\'utilisateur.', { taille: 7.5, couleur: COULEURS.gris });
  return p.finir(`LabFlow Compta · ${d.nom} · ${titreDe(e).toLowerCase()} · ${jourTunis()}`);
};
// GET …/declaration/pdf?periode= — l'état préparatoire en PDF (lecture : tout niveau).
const pdf = async (req, res) => {
  try {
    const f = lireParametres(req.query);
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const e = await etatDeclaration(pool, d, await selection(pool, d, f.periodeId), { avecHistorique: false });
    envoyerPdf(res, await construirePdf(d, e), nomPdf('declaration', d.nom, e.periode.debut.slice(0, 7)));
  } catch (err) {
    repondreErreur(res, err, '[compta.declarations.pdf]');
  }
};

// ── Lecture des demandes ────────────────────────────────────────────────────────────────────────────────────────────
// { saisies: { cle: montant | '' | null }, tcl: montant | '' | null } : chaque clé du paquet, montant positif ou nul (vide =
// rien) ; la TCL vide reprend le calcul. Tout est contrôlé avant la moindre requête. → { saisies (texte), tcl (texte|null) }.
const lirePreparation = (corps, saisiesDef) => {
  if (!corps || typeof corps !== 'object') throw erreur(400, 'Requête invalide');
  const s = corps.saisies == null ? {} : corps.saisies;
  if (typeof s !== 'object' || Array.isArray(s)) throw erreur(400, 'Montants saisis : requête invalide');
  const connues = new Map(saisiesDef.map((x) => [x.cle, x]));
  const saisies = {};
  for (const [cle, v] of Object.entries(s)) {
    const def = connues.get(cle);
    if (!def) throw erreur(400, `Ligne inconnue : ${String(cle).slice(0, 30)}`);
    if (v == null || v === '') continue;
    const m = lireMontant(v, def.libelle);
    saisies[cle] = texteMillimes(m);
  }
  const tcl = corps.tcl == null || corps.tcl === '' ? null : texteMillimes(lireMontant(corps.tcl, 'TCL'));
  return { saisies, tcl };
};
// { date, attendu } — date du dépôt sur le portail (AAAA-MM-JJ, après la fin de la période, jamais après aujourd'hui) ;
// `attendu` : le total montré à la confirmation (409 s'il a changé).
const lireMarque = (corps, periode, aujourdhui = aujourdhuiTunis()) => {
  if (!corps || typeof corps !== 'object') throw erreur(400, 'Requête invalide');
  if (!dateValide(corps.date)) throw erreur(400, 'Date du dépôt invalide (AAAA-MM-JJ)', 'DATE_DEPOT');
  if (corps.date > aujourdhui) throw erreur(400, `La date du dépôt (${fmtDate(corps.date)}) est postérieure à aujourd'hui`, 'DATE_DEPOT');
  if (periode && corps.date <= periode.fin) throw erreur(400, `La déclaration se dépose après la fin de la période (${fmtDate(periode.fin)})`, 'DATE_DEPOT');
  const attendu = corps.attendu == null ? null : texteMillimes(lireMontant(corps.attendu, 'Total attendu'));
  return { date: corps.date, attendu };
};

// ── Écritures ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Transaction verrouillée du dossier, droit « configurer », dossier non archivé ; la période du dossier (409 si elle a
// disparu : dans la transaction, un 404 deviendrait « Dossier introuvable »).
const ecritureDeclaration = (req, travail) => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces).configurer) throw erreur(403, MSG_DECLARATION, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  const periode = (await db.query(SQL_PERIODE, [d.id, req.params.periodeId])).rows[0];
  if (!periode) throw erreur(409, 'Période introuvable : relisez la page', 'PERIODE_INTROUVABLE');
  const ligne = (await db.query('SELECT * FROM compta.declarations WHERE dossier_id = $1 AND periode_id = $2 FOR UPDATE', [d.id, periode.id])).rows[0] || null;
  return travail(db, acces, d, periode, ligne);
});
const exigerPeriode = (req) => { if (!idValide(req.params.periodeId)) throw erreur(404, 'Période introuvable'); };
const selectionDe = async (db, d, periode) => {
  const exercices = await exercicesDe(db, d.id);
  const exercice = exercices.find((x) => x.id === periode.exercice_id);
  return { exercices, exercice, periode: exercice.periodes.find((p) => p.id === periode.id) };
};

// PUT /api/compta/dossiers/:dossierId/declaration/:periodeId — { saisies, tcl } : les montants saisis à la main et la TCL
// corrigée (vide = calculée) ; refusé sur une déclaration marquée (retirez la marque d'abord). Journal D16.
const preparer = async (req, res) => {
  try {
    exigerPeriode(req);
    const resultat = await ecritureDeclaration(req, async (db, acces, d, periode, ligne) => {
      const saisiesDef = fiscaliteDe(d.pays)?.declaration?.saisies || [];
      const { saisies, tcl } = lirePreparation(req.body || {}, saisiesDef);
      if (ligne && ligne.declaree_le) throw erreur(409, `Déclaration marquée comme déposée le ${fmtDate(String(ligne.declaree_le).slice(0, 10))} : retirez la marque pour la modifier`, 'DECLAREE');
      const avant = ligne ? { saisies: ligne.saisies || {}, tcl: ligne.tcl } : { saisies: {}, tcl: null };
      await db.query(
        `INSERT INTO compta.declarations (dossier_id, periode_id, saisies, tcl, modifie_par) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (dossier_id, periode_id) DO UPDATE SET saisies = EXCLUDED.saisies, tcl = EXCLUDED.tcl, modifie_par = EXCLUDED.modifie_par, updated_at = NOW()`,
        [d.id, periode.id, JSON.stringify(saisies), tcl, req.user.id]
      );
      await journaliser(db, acces.espace_id, req.user.id, 'declaration_preparee', { dossier: d.id, periode: periode.id, mois: periode.debut.slice(0, 7), avant, apres: { saisies, tcl } });
      return { prepare: { periodeId: periode.id, saisies, tcl } };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.declarations.preparer]');
  }
};

// POST …/declaration/:periodeId/ecriture-tva — l'écriture de liquidation de la TVA de la période, en BROUILLARD dans le
// journal des opérations diverses (à vérifier puis valider sur la page Écritures) : datée du dernier jour de la période si
// elle est ouverte, sinon du premier jour de la période ouverte suivante avec sa vraie date. Une seule par période (tant
// qu'elle existe) ; refusée si la période n'est pas finie, porte des brouillards, ou si rien n'est à liquider. → 201.
const proposerEcriture = async (req, res) => {
  try {
    exigerPeriode(req);
    const resultat = await ecritureDeclaration(req, async (db, acces, d, periode) => {
      const e = await etatDeclaration(db, d, await selectionDe(db, d, periode), { avecHistorique: false });
      const l = e.liquidation;
      const motifs = {
        DEJA: `L'écriture de liquidation de cette période existe déjà (${e.declaration?.ecriture?.numero || e.declaration?.ecriture?.numeroProvisoire || ''}) : supprimez-la (brouillard) pour en proposer une autre`,
        PERIODE_EN_COURS: 'Le mois n\'est pas fini : la TVA se liquide après la fin de la période',
        BROUILLARD: 'La période porte des écritures en brouillard : validez-les ou supprimez-les d\'abord',
        COMPTES: 'Compte du crédit de TVA ou de la TVA à payer absent du plan du dossier',
        JOURNAL: 'Aucun journal des opérations diverses actif dans ce dossier (page Journaux)',
        ECART: 'Les comptes de TVA ne rejoignent pas l\'état de TVA de la période : vérifiez les codes de taxe des écritures',
        RIEN: 'Aucune TVA à liquider pour cette période',
        PAS_DE_PERIODE_OUVERTE: 'La période est close et aucune période ouverte ne la suit : rouvrez-la ou ouvrez l\'exercice suivant',
      };
      if (!l.possible) throw erreur(409, motifs[l.raison] || 'Écriture impossible', l.raison === 'DEJA' ? 'DEJA_PROPOSEE' : l.raison);
      const journal = await journalDe(db, d.id, (await db.query(SQL_JOURNAL_OD, [d.id])).rows[0].id);
      const { exercice, periode: pEcriture } = await periodeDe(db, d.id, l.date);
      await controlerDateReelle(db, d.id, l.dateReelle);
      const lignes = l.lignes.map((x, i) => ({ rang: i + 1, compteId: x.compteId, tiersId: null, libelle: x.libelle, debit: millimes(x.debit), credit: millimes(x.credit), taxeId: null, echeance: null }));
      const cartes = await resoudreLignes(db, d, lignes);
      const total = lignes.reduce((t, x) => t + x.debit, 0n);
      const ecr = { date: l.date, dateReelle: l.dateReelle, reference: `TVA-${periode.fin.slice(0, 7)}`, libelle: `Liquidation de la TVA ${deMois(periode.fin)}`, total };
      const numero = (await db.query('UPDATE compta.dossiers SET prochain_provisoire = prochain_provisoire + 1 WHERE id = $1 RETURNING prochain_provisoire - 1 AS n', [d.id])).rows[0].n;
      const ins = await db.query(
        `INSERT INTO compta.ecritures (dossier_id, exercice_id, periode_id, journal_id, date, date_reelle, numero_provisoire, reference, libelle, total_debit, total_credit, origine, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, 'saisie', $11) RETURNING id`,
        [d.id, exercice.id, pEcriture.id, journal.id, ecr.date, ecr.dateReelle, numero, ecr.reference, ecr.libelle, texteMillimes(total), req.user.id]
      );
      const id = ins.rows[0].id;
      await insererLignes(db, d, id, ecr.date, lignes);
      await db.query(
        `INSERT INTO compta.declarations (dossier_id, periode_id, ecriture_id, modifie_par) VALUES ($1, $2, $3, $4)
         ON CONFLICT (dossier_id, periode_id) DO UPDATE SET ecriture_id = EXCLUDED.ecriture_id, modifie_par = EXCLUDED.modifie_par, updated_at = NOW()`,
        [d.id, periode.id, id, req.user.id]
      );
      await journaliser(db, acces.espace_id, req.user.id, 'ecriture_creee', { dossier: d.id, ecriture: id, numeroProvisoire: numeroProvisoire(numero), ...resumeEcriture(ecr, journal, lignes, cartes) });
      await journaliser(db, acces.espace_id, req.user.id, 'ecriture_tva_proposee', { dossier: d.id, periode: periode.id, mois: periode.debut.slice(0, 7), ecriture: id, numeroProvisoire: numeroProvisoire(numero), resultat: e.tva.resultat, total: texteMillimes(total) });
      return { ecriture: { id, numeroProvisoire: numeroProvisoire(numero), date: ecr.date, dateReelle: ecr.dateReelle, reference: ecr.reference, total: texteMillimes(total), lignes: l.lignes } };
    });
    res.status(201).json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.declarations.proposerEcriture]');
  }
};

// POST …/declaration/:periodeId/marquer — { date, attendu } : la déclaration est marquée comme déposée (date, auteur) ;
// l'état est FIGÉ (lignes, total) pour l'historique ; sans effet comptable. Refusé avant la fin de la période, sur une
// déclaration déjà marquée, ou si le total a changé depuis l'affichage. Journal D16.
const marquer = async (req, res) => {
  try {
    exigerPeriode(req);
    const resultat = await ecritureDeclaration(req, async (db, acces, d, periode, ligne) => {
      const m = lireMarque(req.body || {}, periode);
      if (ligne && ligne.declaree_le) throw erreur(409, `Déclaration déjà marquée comme déposée le ${fmtDate(String(ligne.declaree_le).slice(0, 10))} : relisez la page`, 'DEJA_DECLAREE');
      if (aujourdhuiTunis() <= periode.fin) throw erreur(409, 'Le mois n\'est pas fini : la déclaration se dépose le mois suivant', 'PERIODE_EN_COURS');
      const e = await etatDeclaration(db, d, await selectionDe(db, d, periode), { avecHistorique: false });
      if (m.attendu != null && m.attendu !== e.total) throw erreur(409, `Le total a changé depuis l'affichage (${fmtMillimes(millimes(e.total))} D) : relisez la page`, 'PERIME');
      const montants = { lignes: e.lignes.map(({ cle, rubrique, libelle, montant }) => ({ cle, rubrique, libelle, montant })), tva: e.tva, echeance: e.echeance };
      await db.query(
        `INSERT INTO compta.declarations (dossier_id, periode_id, declaree_le, declaree_par, marquee_le, montants, total, modifie_par) VALUES ($1, $2, $3, $4, NOW(), $5, $6, $4)
         ON CONFLICT (dossier_id, periode_id) DO UPDATE SET declaree_le = EXCLUDED.declaree_le, declaree_par = EXCLUDED.declaree_par, marquee_le = NOW(), montants = EXCLUDED.montants, total = EXCLUDED.total, modifie_par = EXCLUDED.modifie_par, updated_at = NOW()`,
        [d.id, periode.id, m.date, req.user.id, JSON.stringify(montants), e.total]
      );
      await journaliser(db, acces.espace_id, req.user.id, 'declaration_marquee', { dossier: d.id, periode: periode.id, mois: periode.debut.slice(0, 7), date: m.date, total: e.total, lignes: montants.lignes });
      return { marque: { periodeId: periode.id, date: m.date, total: e.total } };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.declarations.marquer]');
  }
};

// POST …/declaration/:periodeId/demarquer — la marque se retire (déclaration à refaire ou marquée par erreur) ; l'état figé
// part au journal. Journal D16.
const demarquer = async (req, res) => {
  try {
    exigerPeriode(req);
    const resultat = await ecritureDeclaration(req, async (db, acces, d, periode, ligne) => {
      if (!ligne || !ligne.declaree_le) throw erreur(409, 'Cette déclaration n\'est pas marquée comme déposée : relisez la page', 'NON_DECLAREE');
      await db.query('UPDATE compta.declarations SET declaree_le = NULL, declaree_par = NULL, marquee_le = NULL, montants = NULL, total = NULL, modifie_par = $2, updated_at = NOW() WHERE id = $1', [ligne.id, req.user.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'declaration_demarquee', { dossier: d.id, periode: periode.id, mois: periode.debut.slice(0, 7), date: String(ligne.declaree_le).slice(0, 10), total: ligne.total, montants: ligne.montants });
      return { demarque: { periodeId: periode.id } };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.declarations.demarquer]');
  }
};

module.exports = {
  MSG_DECLARATION, SQL_PERIODE, SQL_CA, SQL_TAXES_COLLECTEES, SQL_COMPTES_TVA, SQL_BROUILLARD, SQL_DECLARATIONS, SQL_COMPTES_NUMEROS, SQL_JOURNAL_OD, SQL_PERIODE_OUVERTE_APRES,
  lireParametres, periodeParDefaut, selection, lignesDe, lirePreparation, lireMarque, etatDeclaration, construirePdf,
  lire, exporter, pdf, preparer, proposerEcriture, marquer, demarquer,
};
