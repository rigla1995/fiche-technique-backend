// LabFlow Compta, étape S7b « TVA, retenues et certificats » (labflow-reprise/achats-compta/PLAN-S7.md §2 « S7b », §4
// « TVA », « Retenues », « Seuil des retenues sur achats », « Droits » ; réponses du client du 09/10 — « ok pour les 9 ») :
// la page « Taxes du mois » d'un dossier, en lecture pour tout accès (D3, D4 : lectureDossier) — rien n'est écrit ici :
//   • l'ÉTAT DE TVA de la période (règles : taxesCalcul.js) : collectée par code, déductible (biens et services,
//     immobilisations), retenues de TVA subies, crédit reporté, TVA à payer ou crédit à reporter ; brouillard compris par
//     défaut (retirable), comme les livres ;
//   • les RETENUES OPÉRÉES à certifier, groupées en paiements (un bénéficiaire, une date : règlement lettré, sinon facture)
//     dont la date tombe dans la période, avec ce qui empêche de produire leur certificat (fiche du fournisseur incomplète
//     pour la plateforme, pièce à plusieurs fournisseurs…) ; les pièces en brouillard ; les paiements des autres mois ;
//   • les CERTIFICATS du mois (produits, annulés, déposés dans quel fichier), les FICHIERS TEJ du mois et ce que
//     contiendrait le prochain (dépôt initial ou rectificatif) ;
//   • les RETENUES SUBIES (comptes de nature « retenues subies », 4341) : ce que les clients ont retenu sur le dossier ;
//   • les SIGNALEMENTS, sans rien passer d'office : retenue sous le seuil de 1 000 D par paiement, retenue manquante
//     (achat d'un fournisseur à retenue sans ligne de retenue), taux qui ne suit pas le régime du fournisseur, lignes de
//     TVA sans code, certificat d'une pièce contre-passée.
// Le lot des certificats du mois en PDF et l'export Excel (quatre feuilles) se lisent aussi à tout niveau.
const ExcelJS = require('exceljs');
const pool = require('../config/database');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { TYPES_IDENTIFIANT, TYPES_IDENTIFIANT_LIBELLES, fiscaliteDe, regimeFiscalDe } = require('./paquets');
const { droits } = require('./dossiers');
const { lectureDossier, presenterDossier } = require('./planComptes');
const { fmtDate, fmtMillimes, numeroProvisoire } = require('./ecritures');
const { aujourdhuiTunis } = require('./echeances');
const { exercicesDe, ajouterFeuille, nombreExcel, avecGardeExport } = require('./livres');
const { envoyerClasseur, jourTunis } = require('./importExcel');
const { envoyerPdf, nomPdf } = require('./pdf');
const { millimes, texte, SQL_TVA_PAR_PERIODE, SQL_TVA_SANS_CODE, SQL_CREDIT_OUVERTURE, SQL_EXCLUSIONS_CP, etatsTva, paiementsDe, sousLeSeuil } = require('./taxesCalcul');
const {
  chargerOperations, beneficiaireDe, declarantDe, texteManque, certificatsDuMois, fichiersDuMois, prochainFichier, construireCertificats, presenterCertificat, SQL_CERTIFICAT,
} = require('./certificats');

const SUBIES_MAX = 500;
const MANQUANTES_MAX = 200;

// ── Sélection ───────────────────────────────────────────────────────────────────────────────────────────────────────
// periode (identifiant, vide = celle d'aujourd'hui dans l'exercice ouvert, sinon la dernière commencée, sinon la
// première), brouillard (« 0 » = écritures validées seulement).
const lireParametres = (query = {}) => {
  if (!query || typeof query !== 'object') throw erreur(400, 'Paramètres invalides');
  const periode = query.periode === undefined || query.periode === '' ? null : query.periode;
  if (periode != null && !idValide(periode)) throw erreur(404, 'Période introuvable');
  return { periodeId: periode == null ? null : Number(periode), brouillard: !(query.brouillard === '0' || query.brouillard === 'false') };
};
const periodeParDefaut = (exercices, aujourdhui = aujourdhuiTunis()) => {
  const x = exercices.find((e) => e.etat === 'ouvert') || exercices[0];
  if (!x || !x.periodes.length) return null;
  return { exercice: x, periode: x.periodes.find((p) => aujourdhui >= p.debut && aujourdhui <= p.fin) || [...x.periodes].reverse().find((p) => p.debut <= aujourdhui) || x.periodes[0] };
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
const moisDe = (iso) => ({ annee: Number(iso.slice(0, 4)), mois: Number(iso.slice(5, 7)) });

// ── État de TVA ─────────────────────────────────────────────────────────────────────────────────────────────────────
// L'état de TVA de la période (et le report depuis le début de l'exercice).
const etatTvaDe = async (db, d, exercice, periode, brouillard) => {
  const compteCredit = fiscaliteDe(d.pays)?.tva?.compteCredit || null;
  const [rangees, sansCode, ouverture] = await Promise.all([
    db.query(SQL_TVA_PAR_PERIODE, [d.id, exercice.id, brouillard]),
    db.query(SQL_TVA_SANS_CODE, [d.id, exercice.id, brouillard]),
    compteCredit ? db.query(SQL_CREDIT_OUVERTURE, [d.id, exercice.id, compteCredit, brouillard]) : { rows: [{ credit: '0.000' }] },
  ]);
  const etats = etatsTva({ periodes: exercice.periodes, rangees: rangees.rows, sansCode: sansCode.rows, ouverture: ouverture.rows[0].credit, jusqua: periode.id });
  return { ...etats[etats.length - 1], compteCredit, creditOuverture: ouverture.rows[0].credit };
};

// ── Retenues ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Les retenues subies de la période ($1 dossier, $2 période, $3 brouillard compris, $4 borne) : lignes des comptes de
// nature « retenues subies » (4341), hors à-nouveaux, avec le client (ou le fournisseur) de la pièce et le code.
const SQL_SUBIES = `
  SELECT l.id, e.id AS ecriture_id, e.date::text AS date, e.numero, e.numero_provisoire, e.reference, e.etat, COALESCE(l.libelle, e.libelle) AS libelle,
         (l.debit - l.credit)::numeric(18,3)::text AS montant, k.numero AS compte, x.code AS code, x.libelle AS code_libelle,
         tp.code AS tiers_code, tp.nom AS tiers_nom, tp.type AS tiers_type
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.journaux j ON j.id = e.journal_id
    JOIN compta.comptes k ON k.id = l.compte_id
    LEFT JOIN compta.taxes x ON x.id = l.taxe_id
    LEFT JOIN LATERAL (SELECT t.code, t.nom, t.type FROM compta.lignes l2 JOIN compta.tiers t ON t.id = l2.tiers_id WHERE l2.ecriture_id = e.id ORDER BY t.type = 'client' DESC, l2.rang LIMIT 1) tp ON true
   WHERE l.dossier_id = $1 AND e.periode_id = $2 AND k.nature = 'retenues_subies' AND j.type <> 'an' AND ($3::boolean OR e.etat = 'validee')
   ORDER BY e.date, e.id, l.rang
   LIMIT $4`;
const SQL_SUBIES_TOTAL = `
  SELECT COUNT(*)::int AS nb, COALESCE(SUM(l.debit - l.credit), 0)::numeric(18,3)::text AS total
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.journaux j ON j.id = e.journal_id
    JOIN compta.comptes k ON k.id = l.compte_id
   WHERE l.dossier_id = $1 AND e.periode_id = $2 AND k.nature = 'retenues_subies' AND j.type <> 'an' AND ($3::boolean OR e.etat = 'validee')`;
// Les achats de la période d'un fournisseur à retenue (par défaut, ou d'après son régime fiscal) sans ligne de retenue
// ($1 dossier, $2 période, $3 brouillard compris, $4 borne) : le TTC hors timbre de la pièce, la retenue attendue.
const SQL_MANQUANTES = `
  SELECT e.id, e.date::text AS date, e.numero, e.numero_provisoire, e.reference, e.etat, t.id AS tiers_id, t.code AS tiers_code, t.nom AS tiers_nom, t.regime_fiscal, x.code AS retenue_code,
         COALESCE(SUM(l.debit - l.credit) FILTER (WHERE k.nature NOT IN ('fournisseurs', 'clients') AND (lx.type IS NULL OR lx.type NOT IN ('timbre', 'retenue', 'retenue_tva', 'avance'))), 0)::numeric(18,3)::text AS ttc
    FROM compta.ecritures e
    JOIN compta.journaux j ON j.id = e.journal_id AND j.type = 'achats'
    JOIN compta.lignes l ON l.ecriture_id = e.id
    JOIN compta.comptes k ON k.id = l.compte_id
    LEFT JOIN compta.taxes lx ON lx.id = l.taxe_id
    JOIN LATERAL (SELECT lt.tiers_id FROM compta.lignes lt JOIN compta.comptes kt ON kt.id = lt.compte_id WHERE lt.ecriture_id = e.id AND kt.nature = 'fournisseurs' AND lt.tiers_id IS NOT NULL ORDER BY lt.rang LIMIT 1) f ON true
    JOIN compta.tiers t ON t.id = f.tiers_id
    LEFT JOIN compta.taxes x ON x.id = t.retenue_id
   WHERE e.dossier_id = $1 AND e.periode_id = $2 AND ($3::boolean OR e.etat = 'validee') AND (t.retenue_id IS NOT NULL OR t.regime_fiscal IS NOT NULL)
     AND ${SQL_EXCLUSIONS_CP}
     AND NOT EXISTS (SELECT 1 FROM compta.lignes lr JOIN compta.taxes xr ON xr.id = lr.taxe_id WHERE lr.ecriture_id = e.id AND xr.type = 'retenue')
   GROUP BY e.id, t.id, x.code
   ORDER BY e.date, e.id
   LIMIT $4`;
// Les certificats produits dont une pièce a été contre-passée depuis ($1 dossier, $2 premier jour, $3 dernier jour).
const SQL_CERTIFICATS_CONTREPASSES = `
  SELECT DISTINCT c.id, c.reference
    FROM compta.certificats c
    JOIN compta.certificat_lignes cl ON cl.certificat_id = c.id AND cl.actif
    JOIN compta.lignes l ON l.id = cl.ligne_id
    JOIN compta.ecritures cp ON cp.origine_id = l.ecriture_id AND cp.origine = 'contrepassation' AND cp.dossier_id = c.dossier_id
   WHERE c.dossier_id = $1 AND c.etat = 'produit' AND c.date_paiement BETWEEN $2 AND $3
   ORDER BY c.reference`;

const presenterOperation = (o) => ({
  ecritureId: o.ecritureId, etat: o.etat, numero: o.numero, numeroProvisoire: numeroProvisoire(o.numeroProvisoire), reference: o.reference, libelle: o.libelle, journal: o.journal,
  dateFacture: o.dateFacture, tiersId: o.tiersId, code: o.code, libelleCode: o.libelleCode, codeTej: o.codeTej, tauxRs: o.tauxRs, tauxTva: o.tauxTva, plusieursTaux: o.plusieursTaux,
  ht: o.ht, tva: o.tva, ttc: o.ttc, rs: o.rs, rsTva: o.rsTva, net: o.net, dateProposee: o.dateProposee, sourceDate: o.sourceDate, probleme: o.probleme,
});
const presenterTiersBeneficiaire = (t, pays) => {
  if (!t) return null;
  const regime = regimeFiscalDe(pays, t.regime_fiscal);
  return { id: t.id, code: t.code, nom: t.nom, matriculeFiscal: t.matricule_fiscal, regimeFiscal: t.regime_fiscal, regimeFiscalLibelle: regime ? regime.libelle : null, actif: t.actif };
};
// La retenue attendue d'après le régime d'un fournisseur pour une opération : le code de la même famille (achats,
// honoraires) que le régime propose, s'il diffère du code employé ; sinon null.
const ecartRegime = (o, t, fiscalite, pays) => {
  const regime = t ? regimeFiscalDe(pays, t.regime_fiscal) : null;
  if (!regime || !fiscalite) return null;
  for (const famille of ['achats', 'honoraires']) {
    const codes = fiscalite.familles?.[famille] || [];
    if (codes.includes(o.code) && regime[famille] && regime[famille] !== o.code) return { attendu: regime[famille], regime: regime.libelle };
  }
  return null;
};

// L'état complet de la page.
const etatTaxesMois = async (db, acces, d, f) => {
  const { exercices, exercice, periode } = await selection(db, d, f.periodeId);
  const { annee, mois } = moisDe(periode.debut);
  const fiscalite = fiscaliteDe(d.pays);
  const [tva, charge, certificats, fichiers, prochain, subies, subiesTotal, manquantes, contrepasses, mode] = await Promise.all([
    etatTvaDe(db, d, exercice, periode, f.brouillard),
    chargerOperations(db, d.id),
    certificatsDuMois(db, d.id, periode.debut, periode.fin),
    fichiersDuMois(db, d.id, annee, mois),
    prochainFichier(db, d.id, annee, mois),
    db.query(SQL_SUBIES, [d.id, periode.id, f.brouillard, SUBIES_MAX]),
    db.query(SQL_SUBIES_TOTAL, [d.id, periode.id, f.brouillard]),
    db.query(SQL_MANQUANTES, [d.id, periode.id, f.brouillard, MANQUANTES_MAX]),
    db.query(SQL_CERTIFICATS_CONTREPASSES, [d.id, periode.debut, periode.fin]),
    modeTitulaire(db, acces.espace_id),
  ]);
  const { operations, tiers, borne } = charge;
  const dans = (iso) => iso >= periode.debut && iso <= periode.fin;
  const decl = declarantDe(d);
  // Les paiements à certifier (validées, sans problème) dont la date tombe dans la période ; ceux des autres mois, comptés.
  const tous = paiementsDe(operations);
  const signalements = [];
  const paiements = tous.filter((p) => dans(p.date)).map((p) => {
    const t = tiers.get(p.tiersId);
    const b = t ? beneficiaireDe(t, d.pays) : { manque: ['fiche du fournisseur'] };
    const seuil = sousLeSeuil(p, fiscalite?.familles?.achats || [], fiscalite?.seuilAchats);
    const avertissements = [];
    if (seuil) avertissements.push({ code: 'SOUS_SEUIL', message: `Paiement de ${fmtMillimes(millimes(seuil))} D TTC, sous le seuil de ${fmtMillimes(millimes(fiscalite.seuilAchats))} D : la retenue sur achats n'était pas due (vérifiez avant de produire)` });
    for (const o of p.operations) {
      const ecart = ecartRegime(o, t, fiscalite, d.pays);
      if (ecart) avertissements.push({ code: 'TAUX_REGIME', message: `Pièce ${o.numero || o.reference} : ${o.code} appliqué, ${ecart.attendu} attendu (${ecart.regime})` });
      if (o.plusieursTaux) avertissements.push({ code: 'PLUSIEURS_TAUX', message: `Pièce ${o.numero || o.reference} : plusieurs taux de TVA, le principal (${o.tauxTva} %) est déclaré` });
    }
    if (p.sourceDate === 'facture') avertissements.push({ code: 'NON_REGLE', message: 'Facture non lettrée avec un règlement : la date proposée est celle de la facture, corrigez-la si le paiement a eu lieu un autre jour' });
    const bloque = b.manque.length ? `Fiche du fournisseur à compléter pour la plateforme TEJ : ${texteManque(b.manque)}` : null;
    if (bloque) signalements.push({ code: 'BENEFICIAIRE_INCOMPLET', gravite: 'bloquant', message: `${t ? t.code : 'Bénéficiaire'} : ${bloque.charAt(0).toLowerCase()}${bloque.slice(1)}`, tiersId: p.tiersId });
    for (const a of avertissements.filter((x) => x.code === 'SOUS_SEUIL' || x.code === 'TAUX_REGIME')) signalements.push({ ...a, gravite: 'attention', message: `${t ? t.code : ''} — ${a.message}`, tiersId: p.tiersId });
    return { cle: p.cle, tiers: presenterTiersBeneficiaire(t, d.pays), date: p.date, sourceDate: p.sourceDate, operations: p.operations.map(presenterOperation), totaux: p.totaux, bloque, avertissements };
  });
  const autres = new Map();
  for (const p of tous.filter((x) => !dans(x.date))) {
    const m = p.date.slice(0, 7);
    autres.set(m, (autres.get(m) || 0) + 1);
  }
  const brouillard = operations.filter((o) => o.etat !== 'validee' && dans(o.dateFacture)).map(presenterOperation);
  const problemes = operations.filter((o) => o.etat === 'validee' && o.probleme && dans(o.dateFacture)).map(presenterOperation);
  for (const o of problemes) signalements.push({ code: o.probleme.code, gravite: 'bloquant', message: `Pièce ${o.numero || o.reference} : ${o.probleme.message}` });
  if (brouillard.length) signalements.push({ code: 'RETENUES_BROUILLARD', gravite: 'info', message: `${brouillard.length} pièce${brouillard.length > 1 ? 's' : ''} à retenue en brouillard : validez-les (page Écritures) pour produire leur certificat` });
  for (const m of manquantes.rows) {
    const regime = regimeFiscalDe(d.pays, m.regime_fiscal);
    const code = m.retenue_code || regime?.achats || null;
    const famille = fiscalite?.familles?.achats || [];
    const ttc = millimes(m.ttc);
    if (ttc <= 0n || (famille.includes(code) && fiscalite?.seuilAchats && ttc < millimes(fiscalite.seuilAchats))) continue;
    signalements.push({ code: 'RETENUE_MANQUANTE', gravite: 'attention', message: `Pièce ${m.numero || m.reference} du ${fmtDate(m.date)} (${m.tiers_code}, ${fmtMillimes(ttc)} D TTC) : aucune retenue alors que ${code ? `${code} est attendu` : 'le fournisseur en a une'} — à vérifier (exclusions : abonnements, assurances, leasing…)`, ecritureId: m.id, tiersId: m.tiers_id });
  }
  for (const c of contrepasses.rows) signalements.push({ code: 'CERTIFICAT_CONTREPASSE', gravite: 'attention', message: `Certificat ${c.reference} : une de ses pièces a été contre-passée depuis — annulez-le s'il n'est plus juste`, certificatId: c.id });
  if (tva.sansCode.nb) signalements.push({ code: 'TVA_SANS_CODE', gravite: 'info', message: `${tva.sansCode.nb} ligne${tva.sansCode.nb > 1 ? 's' : ''} de TVA sans code de taxe (liquidation, régularisation ?) : non comptée${tva.sansCode.nb > 1 ? 's' : ''} dans l'état` });
  if (decl.manque.length) signalements.unshift({ code: 'DECLARANT_INCOMPLET', gravite: 'bloquant', message: `Identité du dossier à compléter pour la plateforme TEJ : ${texteManque(decl.manque)} (fiche du dossier)` });
  const parNature = new Map();
  const ajouterNature = (o, certifie) => {
    const cle = o.codeTej || o.code;
    if (!parNature.has(cle)) parNature.set(cle, { codeTej: o.codeTej, code: o.code, libelle: o.libelleCode, nb: 0, rs: 0n, aProduire: 0n, certifie: 0n });
    const n = parNature.get(cle);
    n.nb += 1;
    n.rs += millimes(o.rs);
    if (certifie) n.certifie += millimes(o.rs); else n.aProduire += millimes(o.rs);
  };
  for (const p of paiements) for (const o of p.operations) ajouterNature(o, false);
  for (const c of certificats.filter((x) => x.etat === 'produit')) for (const o of c.operations) ajouterNature(o, true);
  const subiesRows = subies.rows.map((s) => ({ id: s.id, ecritureId: s.ecriture_id, date: s.date, numero: s.numero, numeroProvisoire: numeroProvisoire(s.numero_provisoire), reference: s.reference, etat: s.etat, libelle: s.libelle, montant: s.montant, compte: s.compte, code: s.code, codeLibelle: s.code_libelle, tiers: s.tiers_code ? { code: s.tiers_code, nom: s.tiers_nom, type: s.tiers_type } : null }));
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    exercices: exercices.map((x) => ({ id: x.id, debut: x.debut, fin: x.fin, etat: x.etat, periodes: x.periodes })),
    exercice: { id: exercice.id, debut: exercice.debut, fin: exercice.fin, etat: exercice.etat },
    periode, brouillard: f.brouillard, aujourdhui: aujourdhuiTunis(),
    tva,
    retenues: {
      paiements, brouillard, problemes, borne,
      autresMois: [...autres.entries()].sort().map(([m, nb]) => ({ mois: m, nb })),
      parNature: [...parNature.values()].map((n) => ({ ...n, rs: texte(n.rs), aProduire: texte(n.aProduire), certifie: texte(n.certifie) })),
    },
    certificats,
    fichiers,
    prochainFichier: { annee, mois, acte: prochain.acte, nbAjouts: prochain.ajouts.length, nbAnnulations: prochain.annulations.length, nom: decl.fige.identifiant ? `${decl.fige.identifiant}-${annee}-${String(mois).padStart(2, '0')}-${prochain.acte}.xml` : null },
    subies: { lignes: subiesRows, nb: subiesTotal.rows[0].nb, total: subiesTotal.rows[0].total, borne: SUBIES_MAX },
    signalements,
    declarant: { complet: !decl.manque.length, manque: decl.manque, identifiant: decl.fige.identifiant, categorie: decl.fige.categorie },
    tej: { aEssayer: true, versionSchema: fiscalite?.tej?.versionSchema || null, source: fiscalite?.tej?.source || null },
    seuilAchats: fiscalite?.seuilAchats || null,
    typesIdentifiant: TYPES_IDENTIFIANT.map((valeur) => ({ valeur, libelle: TYPES_IDENTIFIANT_LIBELLES[valeur] })),
    etatAbonnement: etatAbonnement(mode),
  };
};

// ── Routes de lecture ───────────────────────────────────────────────────────────────────────────────────────────────
// GET /api/compta/dossiers/:dossierId/taxes-mois?periode=&brouillard= — la page (lecture : tout niveau).
const lire = async (req, res) => {
  try {
    const f = lireParametres(req.query);
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatTaxesMois(pool, acces, d, f));
  } catch (err) {
    repondreErreur(res, err, '[compta.taxesMois.lire]');
  }
};
// GET …/taxes-mois/certificats.pdf?periode= — les certificats produits du mois de paiement, en un PDF (lecture).
const lot = async (req, res) => {
  try {
    const f = lireParametres(req.query);
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const { periode } = await selection(pool, d, f.periodeId);
    const certificats = (await pool.query(`${SQL_CERTIFICAT} WHERE c.dossier_id = $1 AND c.etat = 'produit' AND c.date_paiement BETWEEN $2 AND $3 ORDER BY c.annee, c.numero`, [d.id, periode.debut, periode.fin])).rows.map(presenterCertificat);
    if (!certificats.length) throw erreur(409, `Aucun certificat produit pour les paiements du ${fmtDate(periode.debut)} au ${fmtDate(periode.fin)}`, 'AUCUN_CERTIFICAT');
    envoyerPdf(res, await construireCertificats(certificats, { dossier: d }), nomPdf('certificats', d.nom, periode.debut.slice(0, 7)));
  } catch (err) {
    repondreErreur(res, err, '[compta.taxesMois.lot]');
  }
};
// GET …/taxes-mois/export?periode=&brouillard= — État de TVA, retenues à certifier, certificats, retenues subies, à la
// charte (une feuille chacun), sous la garde des exports.
const exporter = (req, res) => avecGardeExport(res, '[compta.taxesMois.exporter]', async () => {
  const f = lireParametres(req.query);
  const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
  const e = await etatTaxesMois(pool, acces, d, f);
  const p = e.periode;
  const meta = `du ${fmtDate(p.debut)} au ${fmtDate(p.fin)} · ${e.brouillard ? 'écritures validées et en brouillard' : 'écritures validées seulement'} · exporté le ${jourTunis()}`;
  const wb = new ExcelJS.Workbook();
  const t = e.tva;
  const codes = t.codes.filter((c) => [c.collectee, c.deductible, c.deductibleImmo, c.retenueSubie, c.nonRecuperable, c.baseVente, c.baseAchat].some((v) => millimes(v) !== 0n));
  ajouterFeuille(wb, {
    feuille: 'État de TVA', titre: 'État de TVA', sousTitre: d.nom, metaTexte: meta,
    enTetes: ['Code', 'Libellé', 'Taux', 'Base ventes', 'TVA collectée', 'Base achats', 'TVA déductible', 'Sur immobilisations', 'Retenue de TVA subie', 'Non récupérable'],
    largeurs: [12, 34, 9, 16, 16, 16, 16, 16, 16, 16],
    montants: [4, 5, 6, 7, 8, 9, 10],
    rangees: [
      ...codes.map((c) => [c.code, c.libelle, c.taux != null ? Number(c.taux) : '', nombreExcel(c.baseVente), nombreExcel(c.collectee), nombreExcel(c.baseAchat), nombreExcel(c.deductible), nombreExcel(c.deductibleImmo), nombreExcel(c.retenueSubie), nombreExcel(c.nonRecuperable)]),
      ['Total', '', '', null, nombreExcel(t.collectee), null, nombreExcel(t.deductibleBs), nombreExcel(t.deductibleImmo), nombreExcel(t.retenuesSubies), nombreExcel(t.nonRecuperable)],
      ['', 'Crédit reporté du mois précédent', '', null, null, null, nombreExcel(t.creditReporte), null, null, null],
      ['', millimes(t.resultat) >= 0n ? 'TVA à payer' : 'Crédit à reporter', '', null, nombreExcel(millimes(t.resultat) >= 0n ? t.aPayer : t.creditAReporter), null, null, null, null, null],
    ],
    total: null,
  });
  const lignesRetenues = [
    ...e.retenues.paiements.flatMap((x) => x.operations.map((o) => ['À produire', '', fmtDate(x.date), x.tiers ? x.tiers.code : '', x.tiers ? x.tiers.nom : '', o.numero || o.numeroProvisoire, o.reference, fmtDate(o.dateFacture), o.code, o.codeTej, nombreExcel(o.ht), nombreExcel(o.tva), nombreExcel(o.ttc), Number(o.tauxRs), nombreExcel(o.rs), nombreExcel(o.net)])),
    ...e.certificats.flatMap((c) => c.operations.map((o) => [c.etat === 'annule' ? 'Annulé' : (c.fichier ? `Déposé (${c.fichier.nom})` : 'Produit'), c.reference, fmtDate(c.datePaiement), c.tiers.code, c.tiers.nom, o.numero, o.reference, fmtDate(o.dateFacture), o.code, o.codeTej, nombreExcel(o.ht), nombreExcel(o.tva), nombreExcel(o.ttc), Number(o.tauxRs), nombreExcel(o.rs), nombreExcel(o.net)])),
  ];
  ajouterFeuille(wb, {
    feuille: 'Retenues opérées', titre: 'Retenues opérées et certificats', sousTitre: d.nom, metaTexte: `paiements ${meta}`,
    enTetes: ['État', 'Certificat', 'Date du paiement', 'Code', 'Bénéficiaire', 'Écriture', 'Pièce', 'Facture du', 'Retenue', 'Code TEJ', 'Hors taxes', 'TVA', 'TTC', 'Taux (%)', 'Retenue (D)', 'Net servi'],
    largeurs: [18, 14, 13, 10, 30, 17, 14, 12, 11, 12, 15, 14, 15, 9, 14, 15],
    montants: [11, 12, 13, 15, 16],
    rangees: lignesRetenues,
    total: null,
  });
  ajouterFeuille(wb, {
    feuille: 'Retenues subies', titre: 'Retenues subies (créances sur l\'État)', sousTitre: d.nom, metaTexte: meta,
    enTetes: ['Date', 'Écriture', 'Pièce', 'Tiers', 'Nom', 'Code', 'Compte', 'Libellé', 'Montant', 'État'],
    largeurs: [12, 17, 14, 10, 30, 11, 10, 36, 15, 11],
    montants: [9],
    rangees: e.subies.lignes.map((s) => [fmtDate(s.date), s.numero || s.numeroProvisoire, s.reference, s.tiers ? s.tiers.code : '', s.tiers ? s.tiers.nom : '', s.code || '', s.compte, s.libelle, nombreExcel(s.montant), s.etat === 'validee' ? 'Validée' : 'Brouillard']),
    total: ['Total', '', '', '', '', '', '', `${e.subies.nb} ligne${e.subies.nb > 1 ? 's' : ''}`, nombreExcel(e.subies.total), ''],
  });
  ajouterFeuille(wb, {
    feuille: 'Signalements', titre: 'Signalements', sousTitre: d.nom, metaTexte: meta,
    enTetes: ['Gravité', 'Signalement'],
    largeurs: [12, 120],
    montants: [],
    rangees: e.signalements.map((s) => [s.gravite === 'bloquant' ? 'Bloquant' : s.gravite === 'attention' ? 'À vérifier' : 'Information', s.message]),
    total: null,
  });
  await envoyerClasseur(res, wb, nomPdf('taxes', d.nom, p.debut.slice(0, 7)).replace(/\.pdf$/, '.xlsx'));
});

module.exports = {
  SUBIES_MAX, MANQUANTES_MAX, lireParametres, periodeParDefaut, selection, ecartRegime,
  SQL_SUBIES, SQL_SUBIES_TOTAL, SQL_MANQUANTES, SQL_CERTIFICATS_CONTREPASSES,
  etatTvaDe, etatTaxesMois, lire, lot, exporter,
};
