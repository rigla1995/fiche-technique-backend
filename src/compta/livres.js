// LabFlow Compta, étape S6c « Les livres et les imports » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6c, §2
// « S6c », §4 « Livres » ; réponse 7 du client du 08/10 : grand livre et balance calculés en SQL à la demande, avec les
// index, mesurés sur 50 000 lignes avant S6c — mesure du 08/10 (outils/jeu-50k-s6c.js) : balance de l'exercice 22 ms,
// grand livre d'un collectif entier 20 ms, page Écritures 1 à 4 ms : aucune table de soldes ; CADRAGE §4 point 8, NC 01
// §26 à §45 : le grand livre montre le solde d'ouverture, les cumuls débit / crédit de l'exercice hors à-nouveaux et le
// solde ; contrôles : total du journal = total du grand livre = balance ; SPEC-SOCLE §0 : NUMERIC(18,3) transportés en
// texte, totaux en millimes entiers — BigInt, jamais de flottant). Les livres d'un dossier, lus sur les écritures validées
// ET en brouillard (le brouillard distingué et retirable) : la balance (générale par compte ; auxiliaire par tiers,
// fournisseurs ou clients), le grand livre (un compte, ou un tiers d'un collectif, avec le solde d'ouverture et le solde
// après chaque ligne), le livre-journal (les écritures d'un journal sur une période avec leurs lignes et leurs totaux), et
// leurs exports Excel à la charte (excelBrandService). Sélection commune : un exercice du dossier (l'ouvert par défaut), une
// période mensuelle ou l'exercice entier, brouillard compris ou non. Solde d'ouverture d'un compte = ses à-nouveaux
// (journal de type « an ») + ses mouvements d'avant le début de la sélection ; mouvements = les lignes hors à-nouveaux
// datées dans la sélection. Lecture pour tout accès au dossier (D3, D4 : lectureDossier) ; rien n'est écrit ici.
const ExcelJS = require('exceljs');
const pool = require('../config/database');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { NATURE_PAR_TYPE_TIERS, TYPES_TIERS_LIBELLES, TYPES_JOURNAUX_LIBELLES, clotureDe } = require('./paquets');
// X1 : les exercices du dossier, l'exercice précédent non clos (exercices.js), l'exercice par défaut (règles pures).
const X = require('./exercices');
const XC = require('./exercicesCalcul');
const { droits } = require('./dossiers');
const { lectureDossier, presenterDossier } = require('./planComptes');
const { SQL_FEUILLE, presenterCompteCourt } = require('./configDossier');
const { SQL_ECRITURES, SQL_LIGNES, fmtDate, fmtMillimes, millimesDe, texteMillimes, numeroProvisoire, presenterEcriture, resumeEcritures, LIMITE_MAX, PAGE_MAX } = require('./ecritures');
const { brandHeader, headerRow, dataRowStyle, totalRowStyle, brandFooter, finalize } = require('../services/excelBrandService');
const { envoyerClasseur, jourTunis } = require('./importExcel');

// Pages : 100 lignes de grand livre, 50 écritures de journal par défaut ; exports bornés (une période plus courte au-delà)
// et deux à la fois pour tout le serveur (relecture de S6c : un classeur ExcelJS de 10 000 rangées stylées pèse ~300 Mo en
// mémoire le temps de l'écriture ; 50 000 en pesaient ~1 Go, sur un VPS de 3,7 Go partagé avec LabFlow).
const LIMITE_GRAND_LIVRE = 100;
const LIMITE_JOURNAL = 50;
const EXPORT_MAX = 10000;
const EXPORTS_SIMULTANES = 2;
let exportsEnCours = 0;
// Un export sous la garde de concurrence : 429 au-delà de deux exports en cours ; une erreur après l'envoi des en-têtes
// (client parti pendant l'écriture) ne tente pas de répondre une seconde fois.
const avecGardeExport = async (res, journal, travail) => {
  if (exportsEnCours >= EXPORTS_SIMULTANES) return res.status(429).json({ message: `${EXPORTS_SIMULTANES} exports sont déjà en cours sur le serveur : réessayez dans un instant`, code: 'EXPORTS_EN_COURS' });
  exportsEnCours += 1;
  try {
    await travail();
  } catch (err) {
    if (!res.headersSent) repondreErreur(res, err, journal);
  } finally {
    exportsEnCours -= 1;
  }
  return undefined;
};
const TYPES_BALANCE = ['generale', 'fournisseurs', 'clients'];
const TYPE_TIERS_PAR_BALANCE = { fournisseurs: 'fournisseur', clients: 'client' };
const RE_ENTIER = /^\d{1,6}$/;
// Format Excel des montants (trois décimales, séparateur de milliers) ; la valeur écrite est le nombre lu du texte
// NUMERIC — pour l'affichage dans Excel seulement, aucun calcul n'en part.
const FMT_MONTANT = '#,##0.000';
const nombreExcel = (texte) => (texte == null || texte === '' ? null : Number(texte));

// ── Sélection (exercice, période, brouillard) ───────────────────────────────────────────────────────────────────────
// Les exercices du dossier avec leurs périodes (du plus récent au plus ancien) ; X1 : avec leur millésime (exercices.js).
const exercicesDe = X.exercicesDuDossier;
// X1 : l'exercice du jour, sinon le plus récent des ouverts, sinon le plus récent (deux exercices peuvent être ouverts).
const exerciceParDefaut = (exercices, aujourdhui) => XC.exerciceParDefaut(exercices, aujourdhui);
// Paramètres communs : exercice (identifiant, vide = celui du jour, sinon le plus récent des ouverts), periode (identifiant, vide =
// l'exercice entier), brouillard (« 0 » = écritures validées seulement ; sinon compris). → { exercice, periode, de, a,
// brouillard } ; 404 si l'exercice ou la période n'est pas du dossier, 409 sans exercice.
const lireSelection = (query, exercices) => {
  if (!query || typeof query !== 'object') throw erreur(400, 'Paramètres invalides');
  let exercice;
  if (query.exercice === undefined || query.exercice === '') exercice = exerciceParDefaut(exercices);
  else {
    if (!idValide(query.exercice)) throw erreur(404, 'Exercice introuvable');
    exercice = exercices.find((x) => x.id === Number(query.exercice));
    if (!exercice) throw erreur(404, 'Exercice introuvable');
  }
  if (!exercice) throw erreur(409, 'Aucun exercice dans ce dossier', 'EXERCICE_ABSENT');
  let periode = null;
  if (query.periode !== undefined && query.periode !== '') {
    if (!idValide(query.periode)) throw erreur(404, 'Période introuvable');
    periode = exercice.periodes.find((p) => p.id === Number(query.periode));
    if (!periode) throw erreur(404, 'Période introuvable');
  }
  const brouillard = !(query.brouillard === '0' || query.brouillard === 'false');
  return { exercice, periode, de: periode ? periode.debut : exercice.debut, a: periode ? periode.fin : exercice.fin, brouillard };
};
const lirePage = (query, limiteDefaut) => {
  const page = query.page === undefined || query.page === '' ? 1 : (RE_ENTIER.test(String(query.page)) ? Number(query.page) : NaN);
  if (!Number.isInteger(page) || page < 1 || page > PAGE_MAX) throw erreur(400, 'Page invalide');
  const limite = query.limite === undefined || query.limite === '' ? limiteDefaut : (RE_ENTIER.test(String(query.limite)) ? Number(query.limite) : NaN);
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAX) throw erreur(400, `Limite : entier de 1 à ${LIMITE_MAX}`);
  return { page, limite };
};
const presenterSelection = (s) => ({
  exercice: { id: s.exercice.id, debut: s.exercice.debut, fin: s.exercice.fin, etat: s.exercice.etat, millesime: s.exercice.millesime },
  periode: s.periode ? { id: s.periode.id, debut: s.periode.debut, fin: s.periode.fin, etat: s.periode.etat } : null,
  de: s.de, a: s.a, brouillard: s.brouillard,
});
const libelleSelection = (s) => (s.periode ? `du ${fmtDate(s.periode.debut)} au ${fmtDate(s.periode.fin)}` : `exercice du ${fmtDate(s.exercice.debut)} au ${fmtDate(s.exercice.fin)}`);

// ── Soldes en millimes ──────────────────────────────────────────────────────────────────────────────────────────────
// Un solde signé (débit − crédit) présenté des deux côtés : { solde (signé, texte), soldeDebit, soldeCredit }.
const cotes = (n) => ({ solde: texteMillimes(n), soldeDebit: texteMillimes(n > 0n ? n : 0n), soldeCredit: texteMillimes(n < 0n ? -n : 0n) });
// Une rangée de balance (texte NUMERIC lu en base) → ouverture, mouvements, solde final, en texte. X1 : `prov` — le report
// PROVISOIRE de l'exercice précédent non clos ({ d, c } en millimes : débit, crédit), ajouté à l'ouverture et dit à part
// (`ouverture.provisoire`, signé) ; il n'entre pas dans le total des lignes (contrôles NC 01 : rien n'est écrit).
const SANS_REPORT = { d: 0n, c: 0n };
const rangeeBalance = (r, prov = SANS_REPORT) => {
  const ouvD = millimesDe(r.ouverture_debit) + prov.d;
  const ouvC = millimesDe(r.ouverture_credit) + prov.c;
  const mvD = millimesDe(r.debit);
  const mvC = millimesDe(r.credit);
  const avecReport = prov.d !== 0n || prov.c !== 0n;
  return {
    ouverture: { debit: avecReport ? texteMillimes(ouvD) : r.ouverture_debit, credit: avecReport ? texteMillimes(ouvC) : r.ouverture_credit, ...cotes(ouvD - ouvC), ...(avecReport ? { provisoire: texteMillimes(prov.d - prov.c) } : {}) },
    // `nbBrouillard` : toutes les lignes comprises (ouverture et mouvements) ; `mouvements.nbBrouillard` : les seuls mouvements.
    mouvements: { debit: r.debit, credit: r.credit, nbLignes: r.nb_lignes, nbBrouillard: r.nb_brouillard_mouvements },
    ...cotes(ouvD + mvD - ouvC - mvC),
    nbBrouillard: r.nb_brouillard,
    _m: { ouvD, ouvC, mvD, mvC, provD: prov.d, provC: prov.c },
  };
};
// Un solde signé (débit − crédit) en report { d, c }, posé de son côté.
const reportDe = (solde) => (solde > 0n ? { d: solde, c: 0n } : { d: 0n, c: -solde });
// Une rangée sans ligne dans la sélection (compte ou tiers qui n'a qu'un report provisoire).
const RANGEE_VIDE = { ouverture_debit: '0.000', ouverture_credit: '0.000', debit: '0.000', credit: '0.000', nb_lignes: 0, nb_brouillard: 0, nb_brouillard_mouvements: 0 };
const totauxBalance = (rangees) => {
  const t = { ouvD: 0n, ouvC: 0n, mvD: 0n, mvC: 0n, sD: 0n, sC: 0n, oD: 0n, oC: 0n, pD: 0n, pC: 0n, nbLignes: 0, nbBrouillard: 0, nbBrouillardMouvements: 0 };
  for (const r of rangees) {
    t.ouvD += r._m.ouvD; t.ouvC += r._m.ouvC; t.mvD += r._m.mvD; t.mvC += r._m.mvC;
    t.pD += r._m.provD || 0n; t.pC += r._m.provC || 0n;
    const o = r._m.ouvD - r._m.ouvC;
    t.oD += o > 0n ? o : 0n; t.oC += o < 0n ? -o : 0n;
    const s = r._m.ouvD + r._m.mvD - r._m.ouvC - r._m.mvC;
    t.sD += s > 0n ? s : 0n; t.sC += s < 0n ? -s : 0n;
    t.nbLignes += r.mouvements.nbLignes; t.nbBrouillard += r.nbBrouillard; t.nbBrouillardMouvements += r.mouvements.nbBrouillard;
  }
  return {
    ouverture: { debit: texteMillimes(t.ouvD), credit: texteMillimes(t.ouvC), soldeDebit: texteMillimes(t.oD), soldeCredit: texteMillimes(t.oC) },
    mouvements: { debit: texteMillimes(t.mvD), credit: texteMillimes(t.mvC), nbLignes: t.nbLignes, nbBrouillard: t.nbBrouillardMouvements },
    soldeDebit: texteMillimes(t.sD), soldeCredit: texteMillimes(t.sC),
    // Le total des lignes comprises (à-nouveaux et mouvements) : égal des deux côtés par la partie double. X1 : sans le
    // report provisoire (aucune ligne ne le porte), dit à part dans `provisoire` (égal des deux côtés lui aussi).
    lignes: { debit: texteMillimes(t.ouvD - t.pD + t.mvD), credit: texteMillimes(t.ouvC - t.pC + t.mvC) },
    ...(t.pD !== 0n || t.pC !== 0n ? { provisoire: { debit: texteMillimes(t.pD), credit: texteMillimes(t.pC) } } : {}),
    nbBrouillard: t.nbBrouillard,
  };
};

// ── Report provisoire (X1) ──────────────────────────────────────────────────────────────────────────────────────────
// PLAN-EXERCICES §2 ligne X1, réponse 2 du client du 13/10 : tant que l'exercice précédent n'est pas clos, la balance et le
// grand livre de l'exercice suivant partent de ses soldes de fin — calculés à la lecture et marqués « provisoires », rien
// n'est écrit (la clôture, étape X2, passera les vrais à-nouveaux). Comptes de bilan : leur solde de fin (à-nouveaux du
// précédent compris) ; comptes de gestion (charges, produits) : rien — leur solde forme le RÉSULTAT du précédent, porté au
// compte du résultat (131 bénéficiaire, 135 déficitaire : paquet du pays, « cloture »). Brouillard compris ou non, comme la
// sélection. Le report est équilibré (partie double du précédent).
const NATURES_GESTION = ['charges', 'produits'];
// Les soldes de fin d'un exercice ($1 dossier, $2 exercice, $3 brouillard compris), par compte.
const SQL_SOLDES_FIN = `
  SELECT k.id, k.numero, k.libelle, k.nature, SUM(l.debit - l.credit)::numeric(18,3)::text AS solde
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.comptes k ON k.id = l.compte_id
   WHERE l.dossier_id = $1 AND e.exercice_id = $2 AND ($3::boolean OR e.etat = 'validee')
   GROUP BY k.id`;
// Les soldes de fin par tiers ($4 : type du tiers), et ceux d'un compte et / ou d'un tiers ($4 compte, $5 tiers : grand
// livre) hors comptes de gestion.
const SQL_SOLDES_FIN_TIERS = `
  SELECT t.id, t.type, t.code, t.nom, t.actif, SUM(l.debit - l.credit)::numeric(18,3)::text AS solde
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.tiers t ON t.id = l.tiers_id
   WHERE l.dossier_id = $1 AND e.exercice_id = $2 AND ($3::boolean OR e.etat = 'validee') AND t.type = $4
   GROUP BY t.id`;
const SQL_SOLDE_FIN_CIBLE = `
  SELECT COALESCE(SUM(l.debit - l.credit), 0)::numeric(18,3)::text AS solde
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.comptes k ON k.id = l.compte_id
   WHERE l.dossier_id = $1 AND e.exercice_id = $2 AND ($3::boolean OR e.etat = 'validee')
     AND ($4::int IS NULL OR l.compte_id = $4) AND ($5::int IS NULL OR l.tiers_id = $5) AND k.nature <> ALL($6::text[])`;
// « -12.500 » → -12500n (millimesDe ne lit que les montants positifs).
const signe = (t) => (String(t).startsWith('-') ? -millimesDe(String(t).slice(1)) : millimesDe(t));
const presenterPrecedent = (p) => ({ id: p.id, debut: p.debut, fin: p.fin, millesime: p.millesime });
// Le compte du résultat du dossier : 131 (bénéfice) ou 135 (perte) du paquet, à défaut leur compte parent (13) ; à défaut,
// une rangée sans compte (identifiant null).
const compteResultatDe = async (db, d, benefice) => {
  const c = clotureDe(d.pays) || { beneficiaire: '131', deficitaire: '135' };
  const numero = benefice ? c.beneficiaire : c.deficitaire;
  const k = (await db.query('SELECT id, numero, libelle, nature FROM compta.comptes WHERE dossier_id = $1 AND numero = ANY($2) ORDER BY LENGTH(numero) DESC LIMIT 1', [d.id, [numero, numero.slice(0, 2)]])).rows[0];
  return k ? { id: k.id, numero: k.numero, libelle: k.libelle, nature: k.nature } : { id: null, numero: numero.slice(0, 2), libelle: 'Résultat de l\'exercice', nature: 'capitaux' };
};
// Le report provisoire par compte pour la sélection `s`, ou null (pas d'exercice précédent, ou précédent clos) :
// { precedent, comptes: Map(id → { compte, solde }), resultat (signé débit − crédit : négatif = bénéfice), compteResultat }.
const reportComptes = async (db, d, s) => {
  const p = await X.precedentOuvert(db, d.id, s.exercice);
  if (!p) return null;
  const comptes = new Map();
  let resultat = 0n;
  for (const r of (await db.query(SQL_SOLDES_FIN, [d.id, p.id, s.brouillard])).rows) {
    const solde = signe(r.solde);
    if (NATURES_GESTION.includes(r.nature)) resultat += solde;
    else if (solde !== 0n) comptes.set(r.id, { compte: { id: r.id, numero: r.numero, libelle: r.libelle, nature: r.nature }, solde });
  }
  let compteResultat = null;
  if (resultat !== 0n) {
    compteResultat = await compteResultatDe(db, d, resultat < 0n);
    const cle = compteResultat.id ?? 'resultat';
    comptes.set(cle, { compte: compteResultat, solde: (comptes.get(cle)?.solde || 0n) + resultat });
  }
  return { precedent: p, comptes, resultat, compteResultat };
};
// Ce que les écrans disent du report : l'exercice précédent, son résultat (positif = bénéfice) et le compte qui le porte.
const presenterReport = (rep) => (rep ? {
  precedent: presenterPrecedent(rep.precedent),
  resultat: texteMillimes(-rep.resultat),
  compteResultat: rep.compteResultat ? rep.compteResultat.numero : null,
} : null);
const sansInterne = ({ _m, ...r }) => r;

// ── Balance ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Conditions communes ($1 dossier, $2 exercice, $3 début de la sélection, $4 fin, $5 brouillard compris) : les lignes de
// l'exercice jusqu'à la fin de la sélection ; l'ouverture = à-nouveaux (journal « an », quelle que soit leur date) et
// lignes d'avant le début ; les mouvements = hors à-nouveaux, dans la sélection.
const SQL_OU = `l.dossier_id = $1 AND e.exercice_id = $2 AND l.date <= $4 AND ($5::boolean OR e.etat = 'validee')`;
const SQL_SOMMES = `
         COALESCE(SUM(l.debit) FILTER (WHERE j.type = 'an' OR l.date < $3), 0)::numeric(18,3)::text AS ouverture_debit,
         COALESCE(SUM(l.credit) FILTER (WHERE j.type = 'an' OR l.date < $3), 0)::numeric(18,3)::text AS ouverture_credit,
         COALESCE(SUM(l.debit) FILTER (WHERE j.type <> 'an' AND l.date >= $3), 0)::numeric(18,3)::text AS debit,
         COALESCE(SUM(l.credit) FILTER (WHERE j.type <> 'an' AND l.date >= $3), 0)::numeric(18,3)::text AS credit,
         COUNT(*) FILTER (WHERE j.type <> 'an' AND l.date >= $3)::int AS nb_lignes,
         COUNT(*) FILTER (WHERE e.etat = 'brouillard')::int AS nb_brouillard,
         COUNT(*) FILTER (WHERE e.etat = 'brouillard' AND j.type <> 'an' AND l.date >= $3)::int AS nb_brouillard_mouvements`;
const SQL_DE = `
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.journaux j ON j.id = e.journal_id`;
const SQL_BALANCE = `
  SELECT k.id, k.numero, k.libelle, k.nature, ${SQL_SOMMES}
    ${SQL_DE}
    JOIN compta.comptes k ON k.id = l.compte_id
   WHERE ${SQL_OU}
   GROUP BY k.id
   ORDER BY k.numero`;
const SQL_BALANCE_AUX = `
  SELECT t.id, t.type, t.code, t.nom, t.actif, ${SQL_SOMMES}
    ${SQL_DE}
    JOIN compta.tiers t ON t.id = l.tiers_id
   WHERE ${SQL_OU} AND t.type = $6
   GROUP BY t.id
   ORDER BY t.code`;
// Le solde des comptes collectifs d'une nature (fournisseurs, clients) : la balance auxiliaire doit lui être égale.
const SQL_COLLECTIFS = `
  SELECT ${SQL_SOMMES}
    ${SQL_DE}
    JOIN compta.comptes k ON k.id = l.compte_id
   WHERE ${SQL_OU} AND k.nature = $6`;
// La centralisation des journaux sur la sélection (toutes les lignes comprises, à-nouveaux compris) et le total des
// écritures : total des journaux = total du grand livre (balance) = total des écritures (NC 01 §37, §40).
const SQL_JOURNAUX = `
  SELECT j.id, j.code, j.libelle, j.type, COUNT(DISTINCT e.id)::int AS nb_ecritures,
         COALESCE(SUM(l.debit), 0)::numeric(18,3)::text AS debit, COALESCE(SUM(l.credit), 0)::numeric(18,3)::text AS credit
    ${SQL_DE}
   WHERE l.dossier_id = $1 AND e.exercice_id = $2 AND l.date <= $3 AND ($4::boolean OR e.etat = 'validee')
   GROUP BY j.id
   ORDER BY j.id`;
const SQL_TOTAL_ECRITURES = `
  SELECT COUNT(*)::int AS nb, COALESCE(SUM(e.total_debit), 0)::numeric(18,3)::text AS total, COUNT(*) FILTER (WHERE e.etat = 'brouillard')::int AS nb_brouillard
    FROM compta.ecritures e
   WHERE e.dossier_id = $1 AND e.exercice_id = $2 AND e.date <= $3 AND ($4::boolean OR e.etat = 'validee')`;
const lireTypeBalance = (v) => {
  const t = v === undefined || v === '' ? 'generale' : String(v);
  if (!TYPES_BALANCE.includes(t)) throw erreur(400, 'Type de balance inconnu (generale, fournisseurs, clients)');
  return t;
};
// Les contrôles NC 01 de la balance générale : centralisation des journaux, total des écritures, total des lignes.
const controlesDe = async (db, dossierId, s, totaux) => {
  const params = [dossierId, s.exercice.id, s.a, s.brouillard];
  const [j, e] = await Promise.all([db.query(SQL_JOURNAUX, params), db.query(SQL_TOTAL_ECRITURES, params)]);
  let jd = 0n;
  let jc = 0n;
  for (const x of j.rows) { jd += millimesDe(x.debit); jc += millimesDe(x.credit); }
  const journaux = { debit: texteMillimes(jd), credit: texteMillimes(jc) };
  const ecritures = { nb: e.rows[0].nb, total: e.rows[0].total, nbBrouillard: e.rows[0].nb_brouillard };
  return {
    journaux: j.rows.map((x) => ({ id: x.id, code: x.code, libelle: x.libelle, type: x.type, typeLibelle: TYPES_JOURNAUX_LIBELLES[x.type] || x.type, nbEcritures: x.nb_ecritures, debit: x.debit, credit: x.credit })),
    totalJournaux: journaux,
    totalEcritures: ecritures,
    totalLignes: totaux.lignes,
    coherent: journaux.debit === journaux.credit && journaux.debit === totaux.lignes.debit && totaux.lignes.debit === totaux.lignes.credit && millimesDe(ecritures.total) === jd,
  };
};
// La balance d'un dossier sur une sélection : → { type, selection, rangees, totaux, controles, provisoire }. X1 : les
// comptes (ou les tiers) qui n'ont qu'un report provisoire ont leur rangée ; `provisoire` : null, ou ce qui a été reporté.
const parNumero = (a, b) => (a.compte.numero < b.compte.numero ? -1 : a.compte.numero > b.compte.numero ? 1 : 0);
const parCode = (a, b) => (a.tiers.code < b.tiers.code ? -1 : a.tiers.code > b.tiers.code ? 1 : 0);
const balanceDe = async (db, d, s, type) => {
  const params = [d.id, s.exercice.id, s.de, s.a, s.brouillard];
  const report = await reportComptes(db, d, s);
  if (type === 'generale') {
    const lues = (await db.query(SQL_BALANCE, params)).rows;
    const vus = new Set(lues.map((r) => r.id));
    const rows = lues.map((r) => ({ compte: { id: r.id, numero: r.numero, libelle: r.libelle, nature: r.nature }, ...rangeeBalance(r, report?.comptes.has(r.id) ? reportDe(report.comptes.get(r.id).solde) : SANS_REPORT) }));
    for (const [cle, x] of report ? report.comptes : []) if (!vus.has(cle)) rows.push({ compte: x.compte, ...rangeeBalance(RANGEE_VIDE, reportDe(x.solde)) });
    rows.sort(parNumero);
    const totaux = totauxBalance(rows);
    return { type, selection: presenterSelection(s), rangees: rows.map(sansInterne), totaux, controles: await controlesDe(db, d.id, s, totaux), provisoire: presenterReport(report) };
  }
  const typeTiers = TYPE_TIERS_PAR_BALANCE[type];
  const nature = NATURE_PAR_TYPE_TIERS[typeTiers];
  const [aux, col, finTiers] = await Promise.all([
    db.query(SQL_BALANCE_AUX, [...params, typeTiers]),
    db.query(SQL_COLLECTIFS, [...params, nature]),
    report ? db.query(SQL_SOLDES_FIN_TIERS, [d.id, report.precedent.id, s.brouillard, typeTiers]) : { rows: [] },
  ]);
  // Le report par tiers ; celui des collectifs = la somme des reports des tiers, chacun de son côté (une ligne sur un
  // collectif porte toujours son tiers : les deux balances restent égales).
  const reportTiers = new Map(finTiers.rows.map((t) => [t.id, { tiers: t, solde: signe(t.solde) }]).filter(([, x]) => x.solde !== 0n));
  const reportCollectifs = { d: 0n, c: 0n };
  for (const x of reportTiers.values()) { const r = reportDe(x.solde); reportCollectifs.d += r.d; reportCollectifs.c += r.c; }
  const presenterTiers = (r) => ({ id: r.id, type: r.type, typeLibelle: TYPES_TIERS_LIBELLES[r.type] || r.type, code: r.code, nom: r.nom, actif: r.actif });
  const vus = new Set(aux.rows.map((r) => r.id));
  const rows = aux.rows.map((r) => ({ tiers: presenterTiers(r), ...rangeeBalance(r, reportTiers.has(r.id) ? reportDe(reportTiers.get(r.id).solde) : SANS_REPORT) }));
  for (const [id, x] of reportTiers) if (!vus.has(id)) rows.push({ tiers: presenterTiers(x.tiers), ...rangeeBalance(RANGEE_VIDE, reportDe(x.solde)) });
  rows.sort(parCode);
  const totaux = totauxBalance(rows);
  const collectifs = sansInterne(rangeeBalance(col.rows[0], reportCollectifs));
  return {
    type, selection: presenterSelection(s), rangees: rows.map(sansInterne), totaux, provisoire: presenterReport(report),
    // Balance auxiliaire = comptes collectifs de la nature (une ligne sur un collectif porte toujours son tiers).
    controles: { collectifs, nature, coherent: collectifs.solde === cotes(millimesDe(totaux.ouverture.debit) + millimesDe(totaux.mouvements.debit) - millimesDe(totaux.ouverture.credit) - millimesDe(totaux.mouvements.credit)).solde && collectifs.ouverture.debit === totaux.ouverture.debit && collectifs.mouvements.debit === totaux.mouvements.debit && collectifs.mouvements.credit === totaux.mouvements.credit },
  };
};

// ── Grand livre ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Un compte ($6) et / ou un tiers ($7) ; l'un des deux au moins. Lignes dans l'ordre chronologique (date, écriture, rang)
// avec le cumul des débits et des crédits depuis le début de la sélection (fenêtre SQL : la page n lit le bon cumul).
const SQL_GL_OU = `l.dossier_id = $1 AND e.exercice_id = $2 AND l.date <= $4 AND ($5::boolean OR e.etat = 'validee') AND ($6::int IS NULL OR l.compte_id = $6) AND ($7::int IS NULL OR l.tiers_id = $7)`;
const SQL_GRAND_LIVRE = `
  SELECT l.id, l.date::text AS date, l.rang, l.libelle, l.debit::text AS debit, l.credit::text AS credit,
         e.id AS ecriture_id, e.numero, e.numero_provisoire, e.etat, e.reference, e.libelle AS ecriture_libelle, e.date_reelle::text AS date_reelle, e.origine,
         j.id AS journal_id, j.code AS journal_code, k.id AS compte_id, k.numero AS compte_numero, k.libelle AS compte_libelle,
         t.id AS tiers_id, t.type AS tiers_type, t.code AS tiers_code, t.nom AS tiers_nom, x.code AS taxe_code, l.echeance::text AS echeance,
         lt.lettre,
         SUM(l.debit) OVER w::text AS cumul_debit, SUM(l.credit) OVER w::text AS cumul_credit
    ${SQL_DE}
    JOIN compta.comptes k ON k.id = l.compte_id
    LEFT JOIN compta.tiers t ON t.id = l.tiers_id
    LEFT JOIN compta.taxes x ON x.id = l.taxe_id
    LEFT JOIN compta.lettrages lt ON lt.id = l.lettrage_id
   WHERE ${SQL_GL_OU} AND j.type <> 'an' AND l.date >= $3
  WINDOW w AS (ORDER BY l.date, e.numero NULLS LAST, e.numero_provisoire, l.rang ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
   ORDER BY l.date, e.numero NULLS LAST, e.numero_provisoire, l.rang
   LIMIT $8 OFFSET $9`;
const SQL_GL_SOMMES = `SELECT ${SQL_SOMMES} ${SQL_DE} WHERE ${SQL_GL_OU}`;
// Les paramètres propres au grand livre : compte (identifiant du dossier), tiers (identifiant du dossier) ; l'un au moins.
const lireCible = async (db, dossierId, query) => {
  const compteId = query.compte === undefined || query.compte === '' ? null : (idValide(query.compte) ? Number(query.compte) : NaN);
  const tiersId = query.tiers === undefined || query.tiers === '' ? null : (idValide(query.tiers) ? Number(query.tiers) : NaN);
  if (Number.isNaN(compteId)) throw erreur(404, 'Compte introuvable');
  if (Number.isNaN(tiersId)) throw erreur(404, 'Tiers introuvable');
  if (!compteId && !tiersId) throw erreur(400, 'Choisissez le compte (ou le tiers) du grand livre', 'CIBLE_REQUISE');
  const [k, t] = await Promise.all([
    compteId ? db.query(`SELECT k.id, k.numero, k.libelle, k.nature, k.actif, ${SQL_FEUILLE('k')} AS feuille FROM compta.comptes k WHERE k.dossier_id = $1 AND k.id = $2`, [dossierId, compteId]) : { rows: [] },
    tiersId ? db.query('SELECT id, type, code, nom, actif, compte_id FROM compta.tiers WHERE dossier_id = $1 AND id = $2', [dossierId, tiersId]) : { rows: [] },
  ]);
  if (compteId && !k.rows[0]) throw erreur(404, 'Compte introuvable');
  if (tiersId && !t.rows[0]) throw erreur(404, 'Tiers introuvable');
  return { compteId, tiersId, compte: k.rows[0] ? presenterCompteCourt(k.rows[0]) : null, tiers: t.rows[0] ? { id: t.rows[0].id, type: t.rows[0].type, typeLibelle: TYPES_TIERS_LIBELLES[t.rows[0].type] || t.rows[0].type, code: t.rows[0].code, nom: t.rows[0].nom, actif: t.rows[0].actif, compteId: t.rows[0].compte_id } : null };
};
const presenterLigneLivre = (l, ouverture) => {
  const solde = ouverture + millimesDe(l.cumul_debit) - millimesDe(l.cumul_credit);
  return {
    id: l.id, date: l.date, rang: l.rang, libelle: l.libelle || l.ecriture_libelle, debit: l.debit, credit: l.credit, echeance: l.echeance, taxe: l.taxe_code || null,
    // S7a : la lettre de la ligne (lettrage d'un tiers), ou null.
    lettre: l.lettre ? l.lettre.trim() : null,
    ecriture: { id: l.ecriture_id, numero: l.numero, numeroProvisoire: numeroProvisoire(l.numero_provisoire), etat: l.etat, reference: l.reference, libelle: l.ecriture_libelle, dateReelle: l.date_reelle, origine: l.origine, journal: { id: l.journal_id, code: l.journal_code } },
    compte: { id: l.compte_id, numero: l.compte_numero, libelle: l.compte_libelle },
    tiers: l.tiers_id ? { id: l.tiers_id, type: l.tiers_type, code: l.tiers_code, nom: l.tiers_nom } : null,
    ...cotes(solde),
  };
};
// X1 : le report provisoire d'une cible du grand livre (signé débit − crédit) et ce qu'en disent les écrans, ou null :
// un tiers (ou un compte et un tiers) — ses lignes de fin du précédent hors gestion ; un compte seul — son report de la
// balance (le compte du résultat y reçoit le résultat du précédent).
const reportCible = async (db, d, s, cible) => {
  if (cible.tiersId) {
    const p = await X.precedentOuvert(db, d.id, s.exercice);
    if (!p) return null;
    const r = (await db.query(SQL_SOLDE_FIN_CIBLE, [d.id, p.id, s.brouillard, cible.compteId, cible.tiersId, NATURES_GESTION])).rows[0];
    return { solde: signe(r.solde), presente: { precedent: presenterPrecedent(p), resultat: null, compteResultat: null } };
  }
  const rep = await reportComptes(db, d, s);
  if (!rep) return null;
  return { solde: rep.comptes.get(cible.compteId)?.solde || 0n, presente: presenterReport(rep) };
};
// Le grand livre d'un compte ou d'un tiers : → { compte, tiers, selection, ouverture, lignes (page), total, page, limite, totaux,
// provisoire }. `sommes` : la rangée de SQL_GL_SOMMES déjà lue (export), sinon lue ici ; `report` : reportCible déjà lu.
const grandLivreDe = async (db, d, s, cible, { page, limite }, sommes = null, report = undefined) => {
  const params = [d.id, s.exercice.id, s.de, s.a, s.brouillard, cible.compteId, cible.tiersId];
  const [sommesLues, lignes, rep] = await Promise.all([
    sommes ? Promise.resolve({ rows: [sommes] }) : db.query(SQL_GL_SOMMES, params),
    db.query(SQL_GRAND_LIVRE, [...params, limite, (page - 1) * limite]),
    report === undefined ? reportCible(db, d, s, cible) : Promise.resolve(report),
  ]);
  const r = rangeeBalance(sommesLues.rows[0], rep && rep.solde !== 0n ? reportDe(rep.solde) : SANS_REPORT);
  const ouverture = r._m.ouvD - r._m.ouvC;
  return {
    provisoire: rep ? rep.presente : null,
    compte: cible.compte, tiers: cible.tiers, selection: presenterSelection(s),
    // Le brouillard de l'ouverture (à-nouveaux, mouvements antérieurs) se dit sur sa rangée ; celui des mouvements, au pied.
    ouverture: { ...r.ouverture, nbBrouillard: r.nbBrouillard - r.mouvements.nbBrouillard },
    lignes: lignes.rows.map((l) => presenterLigneLivre(l, ouverture)),
    total: r.mouvements.nbLignes, page, limite,
    totaux: { debit: r.mouvements.debit, credit: r.mouvements.credit, nbLignes: r.mouvements.nbLignes, nbBrouillard: r.mouvements.nbBrouillard, solde: r.solde, soldeDebit: r.soldeDebit, soldeCredit: r.soldeCredit },
  };
};

// ── Livre-journal ───────────────────────────────────────────────────────────────────────────────────────────────────
// Les écritures d'un journal ($6) sur la sélection, dans l'ordre chronologique puis des numéros (définitifs d'abord, puis
// provisoires), avec leurs lignes ; les totaux portent sur toute la sélection, pas seulement la page.
const SQL_JOURNAL_OU = `e.dossier_id = $1 AND e.exercice_id = $2 AND e.date >= $3 AND e.date <= $4 AND ($5::boolean OR e.etat = 'validee') AND e.journal_id = $6`;
const SQL_JOURNAL = `${SQL_ECRITURES}
   WHERE ${SQL_JOURNAL_OU}
   ORDER BY e.date, e.numero NULLS LAST, e.numero_provisoire
   LIMIT $7 OFFSET $8`;
const SQL_JOURNAL_TOTAUX = `
  SELECT COUNT(*)::int AS nb, COALESCE(SUM(e.total_debit), 0)::numeric(18,3)::text AS total, COUNT(*) FILTER (WHERE e.etat = 'brouillard')::int AS nb_brouillard
    FROM compta.ecritures e WHERE ${SQL_JOURNAL_OU}`;
const journalDuDossier = async (db, dossierId, v) => {
  if (v === undefined || v === '') throw erreur(400, 'Choisissez le journal', 'JOURNAL_REQUIS');
  if (!idValide(v)) throw erreur(404, 'Journal introuvable');
  const j = (await db.query('SELECT id, code, libelle, type, actif FROM compta.journaux WHERE dossier_id = $1 AND id = $2', [dossierId, v])).rows[0];
  if (!j) throw erreur(404, 'Journal introuvable');
  return { id: j.id, code: j.code, libelle: j.libelle, type: j.type, typeLibelle: TYPES_JOURNAUX_LIBELLES[j.type] || j.type, actif: j.actif };
};
const livreJournalDe = async (db, d, s, journal, { page, limite }) => {
  const params = [d.id, s.exercice.id, s.de, s.a, s.brouillard, journal.id];
  const [ecritures, totaux] = await Promise.all([db.query(SQL_JOURNAL, [...params, limite, (page - 1) * limite]), db.query(SQL_JOURNAL_TOTAUX, params)]);
  const lignesPar = new Map(ecritures.rows.map((e) => [e.id, []]));
  if (ecritures.rows.length) for (const l of (await db.query(SQL_LIGNES, [ecritures.rows.map((e) => e.id)])).rows) lignesPar.get(l.ecriture_id).push(l);
  const t = totaux.rows[0];
  return {
    journal, selection: presenterSelection(s),
    ecritures: ecritures.rows.map((e) => presenterEcriture(e, lignesPar.get(e.id))),
    total: t.nb, page, limite,
    totaux: { nbEcritures: t.nb, debit: t.total, credit: t.total, nbBrouillard: t.nb_brouillard },
  };
};

// ── État de la page ─────────────────────────────────────────────────────────────────────────────────────────────────
// Les comptes et les tiers qui ont des lignes dans le dossier (choix du grand livre), les journaux, les exercices.
const choixComptesMouvementes = async (db, dossierId) =>
  (await db.query(`SELECT k.id, k.numero, k.libelle, k.nature, k.actif, ${SQL_FEUILLE('k')} AS feuille FROM compta.comptes k WHERE k.dossier_id = $1 AND EXISTS (SELECT 1 FROM compta.lignes l WHERE l.dossier_id = $1 AND l.compte_id = k.id) ORDER BY k.numero`, [dossierId])).rows.map(presenterCompteCourt);
const choixTiersMouvementes = async (db, dossierId) =>
  (await db.query('SELECT t.id, t.type, t.code, t.nom, t.actif, t.compte_id FROM compta.tiers t WHERE t.dossier_id = $1 AND EXISTS (SELECT 1 FROM compta.lignes l WHERE l.dossier_id = $1 AND l.tiers_id = t.id) ORDER BY t.type, t.code', [dossierId])).rows
    .map((t) => ({ id: t.id, type: t.type, typeLibelle: TYPES_TIERS_LIBELLES[t.type] || t.type, code: t.code, nom: t.nom, actif: t.actif, compteId: t.compte_id, delaiPaiement: 0, retenue: null }));
const etatLivres = async (db, acces, d) => {
  const [exercices, journaux, comptes, tiers, nb, mode] = await Promise.all([
    exercicesDe(db, d.id),
    db.query('SELECT id, code, libelle, type, actif FROM compta.journaux WHERE dossier_id = $1 ORDER BY id', [d.id]),
    choixComptesMouvementes(db, d.id),
    choixTiersMouvementes(db, d.id),
    resumeEcritures(db, d.id),
    modeTitulaire(db, acces.espace_id),
  ]);
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    exercices,
    exerciceParDefaut: exerciceParDefaut(exercices)?.id ?? null,
    journaux: journaux.rows.map((j) => ({ id: j.id, code: j.code, libelle: j.libelle, type: j.type, typeLibelle: TYPES_JOURNAUX_LIBELLES[j.type] || j.type, actif: j.actif })),
    comptes,
    tiers,
    nb,
    bornes: { grandLivre: LIMITE_GRAND_LIVRE, journal: LIMITE_JOURNAL, exportMax: EXPORT_MAX },
    etatAbonnement: etatAbonnement(mode),
  };
};

// ── Routes de lecture ───────────────────────────────────────────────────────────────────────────────────────────────
// GET /api/compta/dossiers/:dossierId/livres — l'état de la page (lecture : tout niveau).
const lire = async (req, res) => {
  try {
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatLivres(pool, acces, d));
  } catch (err) {
    repondreErreur(res, err, '[compta.livres.lire]');
  }
};
// GET …/livres/balance?exercice=&periode=&brouillard=&type=generale|fournisseurs|clients
const balance = async (req, res) => {
  try {
    const type = lireTypeBalance(req.query.type);
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const s = lireSelection(req.query, await exercicesDe(pool, d.id));
    res.json(await balanceDe(pool, d, s, type));
  } catch (err) {
    repondreErreur(res, err, '[compta.livres.balance]');
  }
};
// GET …/livres/grand-livre?exercice=&periode=&brouillard=&compte=&tiers=&page=&limite=
const grandLivre = async (req, res) => {
  try {
    const p = lirePage(req.query, LIMITE_GRAND_LIVRE);
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const s = lireSelection(req.query, await exercicesDe(pool, d.id));
    const cible = await lireCible(pool, d.id, req.query);
    res.json(await grandLivreDe(pool, d, s, cible, p));
  } catch (err) {
    repondreErreur(res, err, '[compta.livres.grandLivre]');
  }
};
// GET …/livres/journal?exercice=&periode=&brouillard=&journal=&page=&limite=
const journal = async (req, res) => {
  try {
    const p = lirePage(req.query, LIMITE_JOURNAL);
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const s = lireSelection(req.query, await exercicesDe(pool, d.id));
    const j = await journalDuDossier(pool, d.id, req.query.journal);
    res.json(await livreJournalDe(pool, d, s, j, p));
  } catch (err) {
    repondreErreur(res, err, '[compta.livres.journal]');
  }
};

// ── Exports Excel (charte : excelBrandService ; un onglet ; montants en nombres à trois décimales) ─────────────────
const nomFichier = (prefixe, d, s) => `${prefixe}-${String(d.nom).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'dossier'}-${s.periode ? s.periode.debut.slice(0, 7) : s.exercice.debut.slice(0, 4)}.xlsx`;
const meta = (s, suite) => `${libelleSelection(s)} · ${s.brouillard ? 'écritures validées et en brouillard' : 'écritures validées seulement'} · ${suite} · exporté le ${jourTunis()}`;
// Une feuille de classeur : bandeau, en-têtes, rangées (tableaux de valeurs), ligne de total facultative, colonnes de
// montants au format. `montants` : index (1-based) des colonnes de montants. S7a : ajoutée à un classeur existant
// (l'échéancier en a deux : balance âgée et détail).
const ajouterFeuille = (wb, { feuille, titre, sousTitre, metaTexte, enTetes, largeurs, montants, rangees, total }) => {
  const ws = wb.addWorksheet(feuille);
  const n = enTetes.length;
  const enTete = brandHeader(wb, ws, { titre, sousTitre, meta: metaTexte, colCount: n });
  headerRow(ws, enTete, enTetes, { widths: largeurs });
  for (const c of montants) ws.getColumn(c).numFmt = FMT_MONTANT;
  let ligne = enTete;
  rangees.forEach((valeurs, i) => {
    ligne += 1;
    const row = ws.getRow(ligne);
    row.values = valeurs;
    dataRowStyle(row, { index: i, colCount: n });
  });
  if (total) {
    ligne += 1;
    const row = ws.getRow(ligne);
    row.values = total;
    totalRowStyle(row, { colCount: n });
  }
  brandFooter(ws, n);
  finalize(ws, { headerRowIdx: enTete, colCount: n, lastDataRow: ligne });
  return ws;
};
// Un classeur d'une feuille.
const classeur = (options) => {
  const wb = new ExcelJS.Workbook();
  ajouterFeuille(wb, options);
  return wb;
};
const exigerExportable = (nb) => {
  if (nb > EXPORT_MAX) throw erreur(400, `${EXPORT_MAX} lignes au plus par export (${nb} dans la sélection) : choisissez une période plus courte`, 'EXPORT_TROP_GRAND');
};
// GET …/livres/balance/export — mêmes paramètres que la balance.
const exporterBalance = (req, res) => avecGardeExport(res, '[compta.livres.exporterBalance]', async () => {
  {
    const type = lireTypeBalance(req.query.type);
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const s = lireSelection(req.query, await exercicesDe(pool, d.id));
    const b = await balanceDe(pool, d, s, type);
    const generale = type === 'generale';
    const titre = generale ? 'Balance générale' : `Balance auxiliaire — ${type}`;
    const premieres = generale ? ['Compte', 'Libellé'] : ['Code', 'Nom'];
    const wb = classeur({
      feuille: generale ? 'Balance' : `Balance ${type}`,
      titre, sousTitre: d.nom,
      metaTexte: meta(s, `${b.rangees.length} ${generale ? 'compte' : 'tiers'}${b.rangees.length > 1 && generale ? 's' : ''}${b.totaux.nbBrouillard ? ` · ${b.totaux.nbBrouillard} ligne${b.totaux.nbBrouillard > 1 ? 's' : ''} en brouillard comprise${b.totaux.nbBrouillard > 1 ? 's' : ''}` : ''}${b.provisoire ? ` · soldes d'ouverture PROVISOIRES : exercice ${b.provisoire.precedent.millesime} non clos` : ''}`),
      enTetes: [...premieres, 'Ouverture débit', 'Ouverture crédit', 'Mouvements débit', 'Mouvements crédit', 'Solde débit', 'Solde crédit', 'En brouillard'],
      largeurs: [14, 44, 18, 18, 18, 18, 18, 18, 13],
      montants: [3, 4, 5, 6, 7, 8],
      // Les mêmes colonnes que l'écran : solde d'ouverture posé de son côté, mouvements, solde (relecture des écrans).
      rangees: b.rangees.map((r) => [...(generale ? [r.compte.numero, r.compte.libelle] : [r.tiers.code, r.tiers.nom]), nombreExcel(r.ouverture.soldeDebit), nombreExcel(r.ouverture.soldeCredit), nombreExcel(r.mouvements.debit), nombreExcel(r.mouvements.credit), nombreExcel(r.soldeDebit), nombreExcel(r.soldeCredit), r.nbBrouillard || '']),
      total: ['Total', '', nombreExcel(b.totaux.ouverture.soldeDebit), nombreExcel(b.totaux.ouverture.soldeCredit), nombreExcel(b.totaux.mouvements.debit), nombreExcel(b.totaux.mouvements.credit), nombreExcel(b.totaux.soldeDebit), nombreExcel(b.totaux.soldeCredit), b.totaux.nbBrouillard || ''],
    });
    await envoyerClasseur(res, wb, nomFichier(generale ? 'balance' : `balance-${type}`, d, s));
  }
});
// GET …/livres/grand-livre/export — mêmes paramètres que le grand livre (toutes les lignes, bornées).
const exporterGrandLivre = (req, res) => avecGardeExport(res, '[compta.livres.exporterGrandLivre]', async () => {
  {
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const s = lireSelection(req.query, await exercicesDe(pool, d.id));
    const cible = await lireCible(pool, d.id, req.query);
    const sommesLues = (await pool.query(SQL_GL_SOMMES, [d.id, s.exercice.id, s.de, s.a, s.brouillard, cible.compteId, cible.tiersId])).rows[0];
    const sommes = rangeeBalance(sommesLues);
    exigerExportable(sommes.mouvements.nbLignes);
    const g = await grandLivreDe(pool, d, s, cible, { page: 1, limite: Math.max(1, sommes.mouvements.nbLignes) }, sommesLues);
    const qui = [cible.compte ? `${cible.compte.numero} ${cible.compte.libelle}` : null, cible.tiers ? `${cible.tiers.code} ${cible.tiers.nom}` : null].filter(Boolean).join(' · ');
    const wb = classeur({
      feuille: 'Grand livre',
      titre: `Grand livre — ${qui}`, sousTitre: d.nom,
      metaTexte: meta(s, `solde d'ouverture ${fmtMillimes(millimesDe(g.ouverture.debit) - millimesDe(g.ouverture.credit))} · ${g.total} ligne${g.total > 1 ? 's' : ''}${g.totaux.nbBrouillard ? ` · ${g.totaux.nbBrouillard} en brouillard` : ''}`),
      // S7a : la lettre en dernière colonne (les colonnes de S6c gardent leur place).
      enTetes: ['Date', 'Journal', 'Numéro', 'Pièce', 'Libellé', 'Compte', 'Tiers', 'Débit', 'Crédit', 'Solde débit', 'Solde crédit', 'État', 'Lettre'],
      largeurs: [12, 9, 17, 16, 40, 10, 12, 16, 16, 16, 16, 11, 8],
      montants: [8, 9, 10, 11],
      rangees: [
        ['', '', '', '', g.provisoire ? `Solde d'ouverture — provisoire : exercice ${g.provisoire.precedent.millesime} non clos (soldes de fin repris, rien n'est écrit)` : 'Solde d\'ouverture (à-nouveaux et mouvements antérieurs)', '', '', nombreExcel(g.ouverture.debit), nombreExcel(g.ouverture.credit), nombreExcel(g.ouverture.soldeDebit), nombreExcel(g.ouverture.soldeCredit), '', ''],
        ...g.lignes.map((l) => [fmtDate(l.date), l.ecriture.journal.code, l.ecriture.numero || l.ecriture.numeroProvisoire, l.ecriture.reference, l.libelle, l.compte.numero, l.tiers ? l.tiers.code : '', millimesDe(l.debit) > 0n ? nombreExcel(l.debit) : null, millimesDe(l.credit) > 0n ? nombreExcel(l.credit) : null, nombreExcel(l.soldeDebit), nombreExcel(l.soldeCredit), l.ecriture.etat === 'validee' ? 'Validée' : 'Brouillard', l.lettre || '']),
      ],
      total: ['Total', '', '', '', `Mouvements de la sélection (${g.total}) et solde`, '', '', nombreExcel(g.totaux.debit), nombreExcel(g.totaux.credit), nombreExcel(g.totaux.soldeDebit), nombreExcel(g.totaux.soldeCredit), '', ''],
    });
    await envoyerClasseur(res, wb, nomFichier(`grand-livre-${cible.compte ? cible.compte.numero : cible.tiers.code}`, d, s));
  }
});
// GET …/livres/journal/export — mêmes paramètres que le livre-journal (une rangée par ligne d'écriture, bornées).
const exporterJournal = (req, res) => avecGardeExport(res, '[compta.livres.exporterJournal]', async () => {
  {
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const s = lireSelection(req.query, await exercicesDe(pool, d.id));
    const j = await journalDuDossier(pool, d.id, req.query.journal);
    const nb = (await pool.query(`SELECT COUNT(*)::int AS n FROM compta.lignes l JOIN compta.ecritures e ON e.id = l.ecriture_id WHERE ${SQL_JOURNAL_OU}`, [d.id, s.exercice.id, s.de, s.a, s.brouillard, j.id])).rows[0].n;
    exigerExportable(nb);
    const livre = await livreJournalDe(pool, d, s, j, { page: 1, limite: EXPORT_MAX });
    const rangees = [];
    for (const e of livre.ecritures) {
      for (const l of e.lignes) rangees.push([fmtDate(e.date), e.numero || e.numeroProvisoire, e.reference, l.compte.numero, l.compte.libelle, l.tiers ? l.tiers.code : '', l.libelle || e.libelle, millimesDe(l.debit) > 0n ? nombreExcel(l.debit) : null, millimesDe(l.credit) > 0n ? nombreExcel(l.credit) : null, l.taxe ? l.taxe.code : '', l.echeance ? fmtDate(l.echeance) : '', e.etat === 'validee' ? 'Validée' : 'Brouillard']);
    }
    const wb = classeur({
      feuille: `Journal ${j.code}`,
      titre: `Journal ${j.code} — ${j.libelle}`, sousTitre: d.nom,
      metaTexte: meta(s, `${livre.totaux.nbEcritures} écriture${livre.totaux.nbEcritures > 1 ? 's' : ''}${livre.totaux.nbBrouillard ? ` dont ${livre.totaux.nbBrouillard} en brouillard` : ''} · ${rangees.length} ligne${rangees.length > 1 ? 's' : ''}`),
      enTetes: ['Date', 'Numéro', 'Pièce', 'Compte', 'Libellé du compte', 'Tiers', 'Libellé', 'Débit', 'Crédit', 'Code de taxe', 'Échéance', 'État'],
      largeurs: [12, 17, 16, 10, 30, 12, 40, 16, 16, 12, 12, 11],
      montants: [8, 9],
      rangees,
      total: ['Total', '', '', '', '', '', `${livre.totaux.nbEcritures} écriture${livre.totaux.nbEcritures > 1 ? 's' : ''}`, nombreExcel(livre.totaux.debit), nombreExcel(livre.totaux.credit), '', '', ''],
    });
    await envoyerClasseur(res, wb, nomFichier(`journal-${j.code}`, d, s));
  }
});

module.exports = {
  LIMITE_GRAND_LIVRE, LIMITE_JOURNAL, EXPORT_MAX, EXPORTS_SIMULTANES, TYPES_BALANCE, FMT_MONTANT,
  exercicesDe, exerciceParDefaut, lireSelection, lirePage, lireTypeBalance, presenterSelection, libelleSelection, cotes, rangeeBalance, totauxBalance,
  // X1 : le report provisoire de l'exercice précédent non clos.
  NATURES_GESTION, SANS_REPORT, reportDe, reportComptes, reportCible, presenterReport, SQL_SOLDES_FIN, SQL_SOLDES_FIN_TIERS, SQL_SOLDE_FIN_CIBLE,
  SQL_BALANCE, SQL_BALANCE_AUX, SQL_COLLECTIFS, SQL_JOURNAUX, SQL_GRAND_LIVRE, SQL_GL_SOMMES, SQL_JOURNAL, balanceDe, grandLivreDe, livreJournalDe, journalDuDossier, lireCible, etatLivres, nomFichier,
  // S7a (echeancier.js) : une feuille dans un classeur, la valeur Excel d'un montant, la garde des exports.
  ajouterFeuille, classeur, nombreExcel, avecGardeExport,
  lire, balance, grandLivre, journal, exporterBalance, exporterGrandLivre, exporterJournal,
};
