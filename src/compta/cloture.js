// LabFlow Compta, étape X2 « La clôture de l'exercice » (labflow-reprise/achats-compta/PLAN-EXERCICES.md §2 ligne X2, §3,
// §5 ; réponses du client du 13/10 — « ok pour les 5 » : exercice clos DÉFINITIF, sans réouverture ; affectation du résultat
// préparée en brouillard ; états financiers cadrés à part). L'assistant « Clôturer l'exercice » d'un dossier :
//   • GET  …/exercices/:exerciceId/cloture    — les contrôles, le résultat, l'aperçu des deux écritures (rien n'est écrit) ;
//     exercice clos : qui, quand, les écritures passées, l'affectation du résultat ;
//   • POST …/exercices/:exerciceId/cloturer   — TITULAIRE SEUL (réponse 3 : définitif, journalisé) : écriture de détermination
//     du résultat (journal OD, dernier jour, validée, origine « cloture »), périodes closes, exercice clos, écriture
//     d'à-nouveaux dans l'exercice suivant (journal AN, premier jour, validée, origine « cloture » — la seule écriture admise
//     dans une période déjà close : elle reprend les soldes, ce n'est pas une opération du mois) ; journal D16 `exercice_clos` ;
//   • POST …/exercices/:exerciceId/affectation — titulaire ou Complet : l'écriture d'affectation du résultat préparée EN
//     BROUILLARD dans l'exercice suivant (journal OD, origine « saisie » : elle se relit, se modifie et se valide comme toute
//     écriture) ; journal D16 `resultat_affecte`.
// Règles pures : clotureCalcul.js. Tout passe par la transaction verrouillée du dossier (dansEspaceDuDossier) ; les livres
// (livres.js, taxesCalcul.js) cessent d'eux-mêmes le report provisoire dès que l'exercice précédent est clos (X1) et lisent
// les à-nouveaux écrits.
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { droits, dateValide, dansEspaceDuDossier } = require('./dossiers');
const { lectureDossier, presenterDossier } = require('./planComptes');
const { SQL_FEUILLE } = require('./configDossier');
const { clotureDe } = require('./paquets');
const E = require('./ecritures');
const V = require('./validation');
const X = require('./exercices');
const XC = require('./exercicesCalcul');
const C = require('./clotureCalcul');

const MSG_CLOTURER = 'Seul le titulaire peut clôturer un exercice';
const MSG_AFFECTER = 'Seul le titulaire ou un gérant de niveau Complet peut préparer l\'affectation du résultat';
const PARTS_MAX = 20;

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────
const SQL_EXERCICE = `
  SELECT x.id, x.debut::text AS debut, x.fin::text AS fin, x.etat, x.millesime, x.clos_le, x.clos_par, u.nom AS clos_par_nom, x.resultat::text AS resultat,
         x.ecriture_resultat_id, x.ecriture_an_id, x.ecriture_affectation_id
    FROM compta.exercices x
    LEFT JOIN utilisateurs u ON u.id = x.clos_par
   WHERE x.dossier_id = $1 AND x.id = $2`;
// L'exercice, s'il est du dossier (404 sinon) ; verrouillé pour la clôture et l'affectation.
const exerciceDuDossier = async (db, dossierId, exerciceId, verrou = false) => {
  if (!idValide(exerciceId)) throw erreur(404, 'Exercice introuvable');
  if (verrou) await db.query('SELECT 1 FROM compta.exercices WHERE dossier_id = $1 AND id = $2 FOR UPDATE', [dossierId, exerciceId]);
  const x = (await db.query(SQL_EXERCICE, [dossierId, exerciceId])).rows[0];
  if (!x) throw erreur(404, 'Exercice introuvable');
  return x;
};
// Les soldes de fin de l'exercice (écritures VALIDÉES), par compte et par tiers ; exercice clos ($3 : son écriture de résultat) :
// avant la détermination du résultat, pour relire charges et produits tels qu'ils étaient.
const SQL_SOLDES = `
  SELECT k.id AS compte_id, k.numero, k.libelle, k.nature, l.tiers_id, t.code AS tiers_code, t.nom AS tiers_nom,
         SUM(l.debit - l.credit)::numeric(18,3)::text AS solde
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.comptes k ON k.id = l.compte_id
    LEFT JOIN compta.tiers t ON t.id = l.tiers_id
   WHERE l.dossier_id = $1 AND e.exercice_id = $2 AND e.etat = 'validee' AND ($3::int IS NULL OR e.id <> $3)
   GROUP BY k.id, l.tiers_id, t.id
   ORDER BY k.numero, t.code`;
// Les faits des contrôles : écritures en brouillard, équilibre des lignes validées, lignes sans tiers sur un collectif.
const SQL_FAITS = `
  SELECT COUNT(DISTINCT e.id) FILTER (WHERE e.etat = 'brouillard')::int AS brouillard,
         COALESCE(SUM(l.debit) FILTER (WHERE e.etat = 'validee'), 0)::numeric(18,3)::text AS debit,
         COALESCE(SUM(l.credit) FILTER (WHERE e.etat = 'validee'), 0)::numeric(18,3)::text AS credit,
         COUNT(l.id) FILTER (WHERE e.etat = 'validee' AND l.tiers_id IS NULL AND k.nature = ANY($3::text[]))::int AS sans_tiers
    FROM compta.ecritures e
    LEFT JOIN compta.lignes l ON l.ecriture_id = e.id
    LEFT JOIN compta.comptes k ON k.id = l.compte_id
   WHERE e.dossier_id = $1 AND e.exercice_id = $2`;
const SQL_PERIODES = 'SELECT id, debut::text AS debut, fin::text AS fin, etat FROM compta.periodes WHERE exercice_id = $1 ORDER BY debut';
const SQL_JOURNAUX = `SELECT id, code, libelle, type FROM compta.journaux WHERE dossier_id = $1 AND type IN ('od', 'an') AND actif ORDER BY type, id`;
const SQL_COMPTE = `SELECT k.id, k.numero, k.libelle, k.nature, k.actif, ${SQL_FEUILLE('k')} AS feuille FROM compta.comptes k WHERE k.dossier_id = $1 AND k.numero = $2`;
const SQL_COMPTES_AFFECTATION = `SELECT k.id, k.numero, k.libelle FROM compta.comptes k WHERE k.dossier_id = $1 AND k.numero = ANY($2::text[]) AND k.actif AND ${SQL_FEUILLE('k')} ORDER BY k.numero`;

// Le bilan de la clôture d'un exercice : exercices voisins, journaux, compte du résultat, plan des écritures, contrôles.
const bilanCloture = async (db, d, x) => {
  const exercices = await X.exercicesSeuls(db, d.id);
  const suivant = exercices.find((y) => y.debut === XC.lendemain(x.fin)) || null;
  const precedent = XC.precedentDe(exercices, x);
  const [soldes, faits, periodes, journaux] = await Promise.all([
    db.query(SQL_SOLDES, [d.id, x.id, x.ecriture_resultat_id || null]),
    db.query(SQL_FAITS, [d.id, x.id, E.NATURES_COLLECTIVES]),
    db.query(SQL_PERIODES, [x.id]),
    db.query(SQL_JOURNAUX, [d.id]),
  ]);
  const rows = soldes.rows.map((r) => ({ compteId: r.compte_id, numero: r.numero, libelle: r.libelle, nature: r.nature, tiersId: r.tiers_id, tiersCode: r.tiers_code, tiersNom: r.tiers_nom, solde: r.solde }));
  // Exercice clos : le résultat est celui de la clôture (les comptes de gestion sont soldés depuis) — il décide du compte
  // (131 / 135) de l'affectation ; exercice ouvert : celui des soldes du jour.
  const resultat = x.etat === 'clos' ? C.versMillimes(x.resultat || '0') : C.resultatDe(rows).resultat;
  const numeroResultat = C.numeroCompteResultat(clotureDe(d.pays), resultat);
  const compteResultat = (await db.query(SQL_COMPTE, [d.id, numeroResultat])).rows[0] || null;
  const imputable = !!(compteResultat && compteResultat.actif && compteResultat.feuille);
  const plan = C.planCloture(rows, imputable ? compteResultat : null);
  const f = faits.rows[0];
  const journalOD = journaux.rows.find((j) => j.type === 'od') || null;
  const journalAN = journaux.rows.find((j) => j.type === 'an') || null;
  const controles = C.controlesDe({
    brouillard: f.brouillard,
    periodes: periodes.rows,
    desequilibre: C.versMillimes(f.debit) - C.versMillimes(f.credit),
    lignesSansTiers: f.sans_tiers,
    precedent, suivant, journalOD, journalAN,
    resultat, numeroResultat, compteResultat,
  });
  return { exercices, suivant, precedent, periodes: periodes.rows, journalOD, journalAN, compteResultat, numeroResultat, plan, controles };
};

const presenterExerciceCourt = (x) => (x ? { id: x.id, debut: x.debut, fin: x.fin, etat: x.etat, millesime: x.millesime } : null);
const presenterLigne = (l) => ({ compte: l.compte, tiers: l.tiers, debit: C.texteMillimes(l.debit), credit: C.texteMillimes(l.credit) });
const libelleResultat = (x) => `Détermination du résultat de l'exercice ${x.millesime}`;
const libelleAN = (x, suivant) => `À-nouveaux au ${C.fmtJour(suivant.debut)} — clôture de l'exercice ${x.millesime}`;
const libelleAffectation = (x) => `Affectation du résultat de l'exercice ${x.millesime}`;
// Les comptes d'affectation du paquet présents et imputables dans le plan du dossier, avec leur usage (bénéfice seulement,
// ou tous : report à nouveau, compte de l'exploitant).
const comptesAffectation = async (db, d) => {
  const liste = (clotureDe(d.pays) || {}).affectation || [];
  if (!liste.length) return [];
  const usages = new Map(liste.map((a) => [a.numero, a.usage || 'tous']));
  return (await db.query(SQL_COMPTES_AFFECTATION, [d.id, liste.map((a) => a.numero)])).rows.map((k) => ({ id: k.id, numero: k.numero, libelle: k.libelle, usage: usages.get(k.numero) || 'tous' }));
};

// L'état de l'assistant (GET, et rendu après la clôture ou l'affectation) : exercice ouvert — contrôles, résultat, aperçu des
// deux écritures ; exercice clos — la clôture faite, ses écritures, l'affectation du résultat (faite ou à faire).
const etatCloture = async (db, acces, d, exerciceId) => {
  const x = await exerciceDuDossier(db, d.id, exerciceId);
  const b = await bilanCloture(db, d, x);
  const mode = await modeTitulaire(db, acces.espace_id);
  const aujourdhui = XC.aujourdhuiTunis();
  const clos = x.etat === 'clos';
  const resultat = clos ? C.versMillimes(x.resultat || '0') : b.plan.resultat;
  const ecritureDe = async (id) => (id ? E.uneEcriture(db, d.id, id) : null);
  const affectationPossible = clos && resultat !== 0n && !x.ecriture_affectation_id && !!b.suivant && b.suivant.etat === 'ouvert' && d.etat === 'actif';
  const compteResultat = b.compteResultat ? { id: b.compteResultat.id, numero: b.compteResultat.numero, libelle: b.compteResultat.libelle } : null;
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    etatAbonnement: etatAbonnement(mode),
    exercice: {
      ...presenterExerciceCourt(x),
      fini: x.fin < aujourdhui,
      clos: clos ? { le: x.clos_le, par: x.clos_par_nom || null, resultat: x.resultat } : null,
    },
    suivant: presenterExerciceCourt(b.suivant),
    precedent: presenterExerciceCourt(b.precedent),
    controles: clos ? [] : b.controles,
    pret: !clos && x.fin < aujourdhui && b.controles.every((c) => c.ok),
    resultat: {
      charges: C.texteMillimes(b.plan.charges), produits: C.texteMillimes(b.plan.produits), resultat: C.texteMillimes(resultat), benefice: resultat > 0n,
      compte: compteResultat, numeroCompte: b.numeroResultat,
    },
    apercu: clos ? null : {
      resultat: { journal: b.journalOD ? b.journalOD.code : 'OD', date: x.fin, reference: `CLOT-${x.millesime}`, libelle: libelleResultat(x), lignes: b.plan.lignesResultat.map(presenterLigne), total: C.texteMillimes(b.plan.totalResultat) },
      anouveaux: { journal: b.journalAN ? b.journalAN.code : 'AN', date: b.suivant ? b.suivant.debut : XC.lendemain(x.fin), reference: `AN-${b.suivant ? b.suivant.millesime : Number(XC.lendemain(x.fin).slice(0, 4))}`, libelle: b.suivant ? libelleAN(x, b.suivant) : '', lignes: b.plan.lignesAN.map(presenterLigne), total: C.texteMillimes(b.plan.totalAN) },
    },
    ecritures: clos ? { resultat: await ecritureDe(x.ecriture_resultat_id), anouveaux: await ecritureDe(x.ecriture_an_id) } : null,
    affectation: {
      possible: affectationPossible,
      resultat: C.texteMillimes(resultat),
      benefice: resultat > 0n,
      compte: compteResultat,
      comptes: clos ? await comptesAffectation(db, d) : [],
      ecriture: await ecritureDe(x.ecriture_affectation_id),
      dateProposee: b.suivant ? (aujourdhui < b.suivant.debut ? b.suivant.debut : aujourdhui > b.suivant.fin ? b.suivant.fin : aujourdhui) : null,
    },
  };
};

// ── Transaction ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Transaction verrouillée du dossier, droit demandé, dossier non archivé.
const transaction = (req, droit, message, travail) => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces)[droit]) throw erreur(403, message, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  return travail(db, acces, d);
});
// Une écriture de clôture, validée d'office : numéro définitif suivant du journal dans l'exercice (série au millésime),
// numéro provisoire du dossier, origine « cloture », auteur et heure. `lignes` : { compte, tiers, debit, credit } en millimes.
const insererValidee = async (db, d, { exercice, periodeId, journal, date, reference, libelle, lignes, auteurId }) => {
  const rang = await V.prochainRang(db, d.id, journal.id, exercice.id);
  if (rang > V.NUMERO_MAX) throw erreur(409, `La série ${journal.code}-${exercice.millesime} est pleine (${V.NUMERO_MAX} écritures) : ouvrez un autre journal`, 'SERIE_PLEINE');
  const numero = V.numeroDefinitif(journal.code, exercice.millesime, rang);
  const provisoire = (await db.query('UPDATE compta.dossiers SET prochain_provisoire = prochain_provisoire + 1 WHERE id = $1 RETURNING prochain_provisoire - 1 AS n', [d.id])).rows[0].n;
  const total = lignes.reduce((t, l) => t + l.debit, 0n);
  const ins = await db.query(
    `INSERT INTO compta.ecritures (dossier_id, exercice_id, periode_id, journal_id, date, numero_provisoire, numero, reference, libelle, etat, total_debit, total_credit, origine, cree_par, valide_par, valide_le)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'validee', $10, $10, 'cloture', $11, $11, NOW()) RETURNING id`,
    [d.id, exercice.id, periodeId, journal.id, date, provisoire, numero, reference, libelle, C.texteMillimes(total), auteurId]
  );
  await E.insererLignes(db, d, ins.rows[0].id, date, lignes.map((l, i) => ({ rang: i + 1, compteId: l.compte.id, tiersId: l.tiers ? l.tiers.id : null, libelle: null, debit: l.debit, credit: l.credit, taxeId: null, echeance: null })));
  return { id: ins.rows[0].id, numero, lignes: lignes.length, total: C.texteMillimes(total) };
};

// ── Routes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// GET /api/compta/dossiers/:dossierId/exercices/:exerciceId/cloture — pour tout accès au dossier. Rien n'est écrit.
const lire = async (req, res) => {
  try {
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatCloture(pool, acces, d, req.params.exerciceId));
  } catch (err) {
    repondreErreur(res, err, '[compta.cloture.lire]');
  }
};

// POST /api/compta/dossiers/:dossierId/exercices/:exerciceId/cloturer — titulaire seul ; exercice ouvert et fini ; tous les
// contrôles au vert (relus sous verrou). → 201 l'état de l'assistant (exercice clos).
const cloturer = async (req, res) => {
  try {
    const etat = await transaction(req, 'archiver', MSG_CLOTURER, async (db, acces, d) => {
      const x = await exerciceDuDossier(db, d.id, req.params.exerciceId, true);
      if (x.etat !== 'ouvert') throw erreur(409, `L'exercice ${x.millesime} est déjà clos`, 'DEJA_CLOS');
      if (!C.peutCloturer(x, XC.aujourdhuiTunis())) throw erreur(409, `L'exercice ${x.millesime} (du ${C.fmtJour(x.debut)} au ${C.fmtJour(x.fin)}) n'est pas fini : il se clôture après le ${C.fmtJour(x.fin)}`, 'EXERCICE_EN_COURS');
      const b = await bilanCloture(db, d, x);
      const ko = b.controles.filter((c) => !c.ok);
      if (ko.length) throw erreur(409, `Clôture impossible : ${ko.map((c) => c.detail || c.libelle).join(' ; ')}`, 'CONTROLES');
      const derniere = b.periodes[b.periodes.length - 1];
      if (!derniere) throw erreur(409, 'Aucune période dans cet exercice : vérifiez l\'exercice (fiche du dossier)', 'PERIODE_ABSENTE');
      const periodeAN = (await db.query('SELECT id FROM compta.periodes WHERE exercice_id = $1 AND $2::date BETWEEN debut AND fin', [b.suivant.id, b.suivant.debut])).rows[0];
      if (!periodeAN) throw erreur(409, `Aucune période mensuelle pour le ${C.fmtJour(b.suivant.debut)} dans l'exercice ${b.suivant.millesime} : vérifiez l'exercice (fiche du dossier)`, 'PERIODE_ABSENTE');
      // 1) La détermination du résultat, dans l'exercice clos (dernier jour, journal OD, validée).
      const resultat = b.plan.lignesResultat.length
        ? await insererValidee(db, d, { exercice: x, periodeId: derniere.id, journal: b.journalOD, date: x.fin, reference: `CLOT-${x.millesime}`, libelle: libelleResultat(x), lignes: b.plan.lignesResultat, auteurId: req.user.id })
        : null;
      // 2) Les périodes encore ouvertes (la dernière, au plus) sont closes ; l'exercice est clos.
      const closes = await db.query(`UPDATE compta.periodes SET etat = 'close', clos_par = $2, clos_le = NOW(), rouvert_par = NULL, rouvert_le = NULL WHERE exercice_id = $1 AND etat = 'ouverte' RETURNING id`, [x.id, req.user.id]);
      // 3) Les à-nouveaux dans l'exercice suivant (premier jour, journal AN, validée ; période close ou non).
      const an = b.plan.lignesAN.length
        ? await insererValidee(db, d, { exercice: b.suivant, periodeId: periodeAN.id, journal: b.journalAN, date: b.suivant.debut, reference: `AN-${b.suivant.millesime}`, libelle: libelleAN(x, b.suivant), lignes: b.plan.lignesAN, auteurId: req.user.id })
        : null;
      await db.query(
        `UPDATE compta.exercices SET etat = 'clos', clos_par = $2, clos_le = NOW(), resultat = $3, ecriture_resultat_id = $4, ecriture_an_id = $5 WHERE id = $1`,
        [x.id, req.user.id, C.texteMillimes(b.plan.resultat), resultat ? resultat.id : null, an ? an.id : null]
      );
      await db.query('UPDATE compta.dossiers SET updated_at = NOW() WHERE id = $1', [d.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'exercice_clos', {
        dossier: d.id, nom: d.nom, exercice: x.id, millesime: x.millesime, debut: x.debut, fin: x.fin,
        resultat: C.texteMillimes(b.plan.resultat), charges: C.texteMillimes(b.plan.charges), produits: C.texteMillimes(b.plan.produits), compteResultat: b.numeroResultat,
        periodesCloses: closes.rowCount,
        ecritureResultat: resultat ? { id: resultat.id, numero: resultat.numero, lignes: resultat.lignes, total: resultat.total } : null,
        aNouveaux: an ? { id: an.id, numero: an.numero, exercice: b.suivant.id, millesime: b.suivant.millesime, lignes: an.lignes, total: an.total } : null,
      });
      return etatCloture(db, acces, d, x.id);
    });
    res.status(201).json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.cloture.cloturer]');
  }
};

// Corps de l'affectation : { date?, lignes: [{ compteId, montant }] } — une part par compte, montants positifs au point.
const lireAffectation = (corps) => {
  if (!corps || typeof corps !== 'object') throw erreur(400, 'Affectation : requête invalide');
  let date = null;
  if (corps.date != null && corps.date !== '') {
    if (!dateValide(corps.date)) throw erreur(400, 'Date : date invalide (AAAA-MM-JJ)');
    date = corps.date;
  }
  if (!Array.isArray(corps.lignes) || !corps.lignes.length) throw erreur(400, 'Affectation : indiquez au moins une part (réserve, report à nouveau, dividendes…)', 'PARTS_REQUISES');
  if (corps.lignes.length > PARTS_MAX) throw erreur(400, `Affectation : ${PARTS_MAX} parts au plus`);
  const vus = new Set();
  const lignes = corps.lignes.map((l, i) => {
    const n = i + 1;
    if (!l || typeof l !== 'object') throw erreur(400, `Part ${n} : requête invalide`);
    const compteId = Number(l.compteId);
    if (!Number.isInteger(compteId) || compteId <= 0) throw erreur(400, `Part ${n} : choisissez le compte`);
    if (vus.has(compteId)) throw erreur(400, `Part ${n} : ce compte a déjà une part`, 'COMPTE_EN_DOUBLE');
    vus.add(compteId);
    const montant = E.lireMontant(l.montant, `Part ${n}, montant`);
    if (montant <= 0n) throw erreur(400, `Part ${n} : indiquez un montant`);
    return { compteId, montant };
  });
  return { date, lignes };
};

// POST /api/compta/dossiers/:dossierId/exercices/:exerciceId/affectation — titulaire ou Complet ; exercice clos à résultat
// non nul, sans affectation déjà préparée ; parts égales au résultat ; brouillard dans l'exercice suivant (journal OD, date
// du jour ou choisie, dans une période ouverte). → 201 l'état de l'assistant.
const affecter = async (req, res) => {
  try {
    const a = lireAffectation(req.body);
    const etat = await transaction(req, 'configurer', MSG_AFFECTER, async (db, acces, d) => {
      const x = await exerciceDuDossier(db, d.id, req.params.exerciceId, true);
      if (x.etat !== 'clos') throw erreur(409, `L'exercice ${x.millesime} n'est pas clos : clôturez-le d'abord, l'affectation du résultat vient ensuite`, 'EXERCICE_OUVERT');
      const resultat = C.versMillimes(x.resultat || '0');
      if (resultat === 0n) throw erreur(409, `L'exercice ${x.millesime} a un résultat nul : rien à affecter`, 'RESULTAT_NUL');
      if (x.ecriture_affectation_id) {
        const deja = await E.uneEcriture(db, d.id, x.ecriture_affectation_id);
        throw erreur(409, `L'affectation du résultat ${x.millesime} est déjà préparée (écriture ${deja ? deja.numero || deja.numeroProvisoire : ''}) : modifiez-la ou supprimez-la (page Écritures) avant d'en préparer une autre`, 'AFFECTATION_EXISTANTE');
      }
      const b = await bilanCloture(db, d, x);
      if (!b.suivant || b.suivant.etat !== 'ouvert') throw erreur(409, `L'exercice suivant n'est pas ouvert : l'affectation du résultat ${x.millesime} s'y enregistre`, 'SUIVANT_ABSENT');
      if (!b.journalOD) throw erreur(409, 'Aucun journal d\'opérations diverses actif : créez-le ou réactivez-le (page Journaux)', 'JOURNAL_OD_ABSENT');
      const k = b.compteResultat;
      if (!k || !k.actif || !k.feuille) throw erreur(409, `Le compte du résultat (${b.numeroResultat}) n'est pas imputable (page Plan de comptes)`, 'COMPTE_NON_IMPUTABLE');
      const somme = a.lignes.reduce((t, l) => t + l.montant, 0n);
      const montant = resultat > 0n ? resultat : -resultat;
      if (somme !== montant) throw erreur(400, `Les parts (${C.fmtMillimes(somme)}) doivent égaler le résultat (${C.fmtMillimes(montant)}) : ${somme < montant ? `il reste ${C.fmtMillimes(montant - somme)} à affecter` : `${C.fmtMillimes(somme - montant)} de trop`}`, 'AFFECTATION_INEGALE');
      const date = a.date || XC.aujourdhuiTunis();
      if (date < b.suivant.debut || date > b.suivant.fin) throw erreur(400, `La date ${C.fmtJour(date)} est hors de l'exercice ${b.suivant.millesime} (du ${C.fmtJour(b.suivant.debut)} au ${C.fmtJour(b.suivant.fin)}) : l'affectation s'y enregistre`, 'DATE_HORS_SUIVANT');
      const { exercice, periode } = await E.periodeDe(db, d.id, date);
      if (exercice.id !== b.suivant.id) throw erreur(409, `La date ${C.fmtJour(date)} n'est pas dans l'exercice ${b.suivant.millesime}`, 'DATE_HORS_SUIVANT');
      const comptes = new Map((await db.query('SELECT id, numero, libelle FROM compta.comptes WHERE dossier_id = $1 AND id = ANY($2)', [d.id, a.lignes.map((l) => l.compteId)])).rows.map((c) => [c.id, c]));
      for (const l of a.lignes) if (!comptes.has(l.compteId)) throw erreur(404, 'Part : compte introuvable');
      if (comptes.has(k.id)) throw erreur(400, `Le compte du résultat (${k.numero}) ne reçoit pas de part : il est la contrepartie de l'affectation`, 'COMPTE_RESULTAT');
      const plan = C.lignesAffectation(resultat, k, a.lignes.map((l) => ({ compte: comptes.get(l.compteId), montant: l.montant })));
      const lignes = plan.map((l, i) => ({ rang: i + 1, compteId: l.compte.id, tiersId: null, libelle: null, debit: l.debit, credit: l.credit, taxeId: null, echeance: null }));
      const cartes = await E.resoudreLignes(db, d, lignes);
      const journal = await E.journalDe(db, d.id, b.journalOD.id);
      const e = { journalId: journal.id, date, dateReelle: null, reference: `AFF-${x.millesime}`, libelle: libelleAffectation(x), lignes, total: montant };
      const numero = (await db.query('UPDATE compta.dossiers SET prochain_provisoire = prochain_provisoire + 1 WHERE id = $1 RETURNING prochain_provisoire - 1 AS n', [d.id])).rows[0].n;
      const ins = await db.query(
        `INSERT INTO compta.ecritures (dossier_id, exercice_id, periode_id, journal_id, date, numero_provisoire, reference, libelle, total_debit, total_credit, origine, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 'saisie', $10) RETURNING id`,
        [d.id, exercice.id, periode.id, journal.id, date, numero, e.reference, e.libelle, C.texteMillimes(montant), req.user.id]
      );
      await E.insererLignes(db, d, ins.rows[0].id, date, lignes);
      await db.query('UPDATE compta.exercices SET ecriture_affectation_id = $2 WHERE id = $1', [x.id, ins.rows[0].id]);
      await journaliser(db, acces.espace_id, req.user.id, 'resultat_affecte', {
        dossier: d.id, exercice: x.id, millesime: x.millesime, resultat: C.texteMillimes(resultat), ecriture: ins.rows[0].id, numeroProvisoire: E.numeroProvisoire(numero),
        ...E.resumeEcriture(e, journal, lignes, cartes),
      });
      return etatCloture(db, acces, d, x.id);
    });
    res.status(201).json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.cloture.affecter]');
  }
};

module.exports = {
  MSG_CLOTURER, MSG_AFFECTER, PARTS_MAX, SQL_SOLDES, SQL_FAITS, exerciceDuDossier, bilanCloture, etatCloture, comptesAffectation, lireAffectation, insererValidee,
  lire, cloturer, affecter,
};
