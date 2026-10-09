// LabFlow Compta, étape S5b « Les journaux et les codes de taxe » (labflow-reprise/achats-compta/PLAN-S5.md §1, §4, §5 ;
// réponses du client du 07/10 — « ok pour les 8 » — et du 08/10 — « ok pour les 4 »). Les journaux et les codes de taxe
// d'un dossier naissent avec lui, après son plan (planInit.js) : copie du paquet de son pays — compta.ref_journaux →
// compta.journaux (six journaux) ; compta.ref_taxes → compta.taxes SELON LE RÉGIME enregistré en S4 (réel : TVA et le
// reste ; exportateur total : suspension en plus ; forfaitaire ou non assujetti : aucun code de TVA). La migration 213
// l'a fait pour les dossiers déjà créés. Les trois sous-comptes que la norme NC 01 n'a pas (compta.ref_sous_comptes :
// timbre collecté, FODEC collecté, TVA retenue à la source) sont créés dans le plan du dossier, expliqués, quand un code
// copié les vise (point 2 du 08/10 : créés par défaut ET remplaçables depuis la page Taxes). Module sans dépendance vers
// dossiers.js : appelé par dossiers.creer, dossierLabflow.assurerDossierLabflow, la fiche (resumeConfiguration), les
// pages Journaux et Taxes (choix de comptes, copie d'un code du paquet).
const { journaliser } = require('./journal');
const { SQL_DU, SQL_ECHEANCE, sqlAgregatsAges, millimes, texteMillimesSigne, trancheesImputees, aujourdhuiTunis } = require('./echeances');
// S7b (carte « Taxes ») : règles de l'état de TVA et des retenues (module sans dépendance) et fiscalité du paquet du pays.
const { SQL_TVA_PAR_PERIODE, SQL_TVA_SANS_CODE, SQL_CREDIT_OUVERTURE, SQL_NB_A_PRODUIRE, etatsTva } = require('./taxesCalcul');
const { echeanceDe } = require('./declarationCalcul');
const { fiscaliteDe } = require('./paquets');

// Les codes du paquet copiés dans un dossier selon son régime (PLAN-S5 §1 ligne S5b) : alias `r` = compta.ref_taxes,
// `c` = le dossier (tva, exportateur_total). Même texte dans la migration 213 (test/comptaS5b.test.js).
const SQL_COPIE = "(r.copie = 'tous' OR (r.copie = 'assujetti' AND c.tva = 'reel') OR (r.copie = 'exportateur' AND c.exportateur_total))";
const codeCopie = (copie, { tva, exportateur_total: exportateur }) => copie === 'tous' || (copie === 'assujetti' && tva === 'reel') || (copie === 'exportateur' && !!exportateur);

// Le dossier (paquet, régime), ou null.
const lireDossier = async (db, dossierId) =>
  (await db.query('SELECT id, espace_id, nom, paquet_id, tva, exportateur_total FROM compta.dossiers WHERE id = $1', [dossierId])).rows[0] || null;

// ── Comptes proposés aux journaux et aux taxes ──────────────────────────────────────────────────────────────────────
// Un compte « imputable » recevra des écritures : actif et sans sous-compte actif (PLAN-S5 §4 ; feuille de l'arbre). Les
// pages le montrent (mention « Compte à préciser » quand le compte d'un journal ou d'un code ne l'est pas ou plus — par
// exemple 5321 après sa subdivision par banque) ; rien n'est bloqué en S5.
const SQL_FEUILLE = (alias) => `NOT EXISTS (SELECT 1 FROM compta.comptes f WHERE f.parent_id = ${alias}.id AND f.actif)`;
// Les comptes ACTIFS du dossier offerts au choix, triés par numéro ; `natures` : liste fermée (journaux : banque, caisse),
// null = tous (taxes).
const choixComptes = async (db, dossierId, natures = null) => {
  const r = await db.query(
    `SELECT k.id, k.numero, k.libelle, k.nature, k.actif, ${SQL_FEUILLE('k')} AS feuille
       FROM compta.comptes k
      WHERE k.dossier_id = $1 AND k.actif AND ($2::text[] IS NULL OR k.nature = ANY($2))
      ORDER BY k.numero`,
    [dossierId, natures]
  );
  return r.rows.map(presenterCompteCourt);
};
const presenterCompteCourt = (k) => ({ id: k.id, numero: k.numero, libelle: k.libelle, nature: k.nature, actif: k.actif, feuille: k.feuille, imputable: !!k.actif && !!k.feuille });
// Le compte d'un dossier par identifiant (lecture), ou null.
const compteDuDossier = async (db, dossierId, compteId) => {
  const r = await db.query(`SELECT k.id, k.numero, k.libelle, k.nature, k.actif, ${SQL_FEUILLE('k')} AS feuille FROM compta.comptes k WHERE k.dossier_id = $1 AND k.id = $2`, [dossierId, compteId]);
  return r.rows[0] || null;
};

// ── Journaux ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Copie les journaux du paquet dans un dossier qui n'en a encore aucun (idempotent) ; compte de contrepartie résolu par
// numéro dans le plan du dossier ; journal « journaux_initialises ». Dans la transaction de l'appelant.
const initialiserJournaux = async (db, { dossierId, espaceId, auteurId = null, nom = null, details = {} }) => {
  const deja = await db.query('SELECT 1 FROM compta.journaux WHERE dossier_id = $1 LIMIT 1', [dossierId]);
  if (deja.rows.length) return { journaux: 0 };
  const d = await lireDossier(db, dossierId);
  if (!d?.paquet_id) throw new Error(`Dossier ${dossierId} sans paquet : son plan de comptes s'initialise d'abord`);
  // Contrepartie résolue par numéro parmi les comptes ACTIFS du plan (un 5321 désactivé laisse le journal « à choisir »).
  const ins = await db.query(
    `INSERT INTO compta.journaux (dossier_id, code, libelle, type, compte_id, origine)
     SELECT $1, r.code, r.libelle, r.type, (SELECT k.id FROM compta.comptes k WHERE k.dossier_id = $1 AND k.numero = r.compte_numero AND k.actif), 'paquet'
       FROM compta.ref_journaux r
      WHERE r.paquet_id = $2
      ORDER BY r.ordre`,
    [dossierId, d.paquet_id]
  );
  await journaliser(db, espaceId, auteurId, 'journaux_initialises', { dossier: dossierId, ...(nom ? { nom } : {}), journaux: ins.rowCount, ...details });
  return { journaux: ins.rowCount };
};

// ── Sous-comptes proposés et codes de taxe ──────────────────────────────────────────────────────────────────────────
// Crée dans le plan du dossier les sous-comptes proposés par le paquet parmi `numeros` qui n'y sont pas encore (origine
// « ajout », explication du paquet, actif si le parent l'est) ; journal « compte_ajoute » (propose : true). Un compte
// de même numéro déjà créé par le cabinet est gardé tel quel (le code s'y rattache). → nombre de comptes créés.
const assurerSousComptes = async (db, { dossierId, espaceId, paquetId, numeros, auteurId = null, details = {} }) => {
  const voulus = [...new Set(numeros.filter(Boolean))];
  if (!voulus.length) return 0;
  const r = await db.query(
    `SELECT s.numero, s.libelle, s.nature, s.parent_numero, s.explication
       FROM compta.ref_sous_comptes s
      WHERE s.paquet_id = $1 AND s.numero = ANY($2)
        AND NOT EXISTS (SELECT 1 FROM compta.comptes k WHERE k.dossier_id = $3 AND k.numero = s.numero)
      ORDER BY s.numero`,
    [paquetId, voulus, dossierId]
  );
  let n = 0;
  for (const s of r.rows) {
    const parent = (await db.query('SELECT id, actif FROM compta.comptes WHERE dossier_id = $1 AND numero = $2', [dossierId, s.parent_numero])).rows[0] || null;
    const ins = await db.query(
      `INSERT INTO compta.comptes (dossier_id, numero, libelle, classe, parent_id, nature, origine, explication, actif, cree_par)
       VALUES ($1, $2, $3, $4, $5, $6, 'ajout', $7, $8, $9) RETURNING id`,
      [dossierId, s.numero, s.libelle, Number(s.numero[0]), parent?.id ?? null, s.nature, s.explication, parent ? parent.actif : true, auteurId]
    );
    // Même invariant que planComptes.ajouter : les comptes du cabinet que le nouveau numéro préfixe (43751 sous 437) passent sous lui.
    if (parent) {
      await db.query(
        'UPDATE compta.comptes SET parent_id = $3, updated_at = NOW() WHERE dossier_id = $1 AND parent_id = $2 AND id <> $3 AND LEFT(numero, LENGTH($4)) = $4',
        [dossierId, parent.id, ins.rows[0].id, s.numero]
      );
    }
    await journaliser(db, espaceId, auteurId, 'compte_ajoute', { dossier: dossierId, compte: ins.rows[0].id, numero: s.numero, libelle: s.libelle, parent: s.parent_numero, nature: s.nature, explication: s.explication, propose: true, ...details });
    n += 1;
  }
  return n;
};

// Les codes du paquet d'un dossier (lignes de compta.ref_taxes), par code ; `codes` : liste, null = tous.
const codesDuPaquet = async (db, paquetId, codes = null) =>
  (await db.query('SELECT * FROM compta.ref_taxes r WHERE r.paquet_id = $1 AND ($2::text[] IS NULL OR r.code = ANY($2)) ORDER BY r.ordre', [paquetId, codes])).rows;

// Copie dans le dossier les codes `refs` (lignes de ref_taxes) : sous-comptes proposés assurés, comptes résolus par numéro
// dans le plan (un numéro absent : aucun compte, à préciser depuis la page), origine « paquet ». → nombre copiés.
const copierCodes = async (db, { dossierId, espaceId, paquetId, refs, auteurId = null, details = {} }) => {
  if (!refs.length) return 0;
  await assurerSousComptes(db, { dossierId, espaceId, paquetId, auteurId, details, numeros: refs.flatMap((r) => [r.compte_achat_numero, r.compte_vente_numero, r.compte_immo_numero]) });
  const ins = await db.query(
    `INSERT INTO compta.taxes (dossier_id, code, libelle, type, taux, montant, assiette, compte_achat_id, compte_vente_id, compte_immo_id, origine, code_tej)
     SELECT $1, r.code, r.libelle, r.type, r.taux, r.montant, r.assiette,
            (SELECT k.id FROM compta.comptes k WHERE k.dossier_id = $1 AND k.numero = r.compte_achat_numero),
            (SELECT k.id FROM compta.comptes k WHERE k.dossier_id = $1 AND k.numero = r.compte_vente_numero),
            (SELECT k.id FROM compta.comptes k WHERE k.dossier_id = $1 AND k.numero = r.compte_immo_numero),
            'paquet', r.code_tej
       FROM compta.ref_taxes r
      WHERE r.paquet_id = $2 AND r.code = ANY($3)
      ORDER BY r.ordre`,
    [dossierId, paquetId, refs.map((r) => r.code)]
  );
  return ins.rowCount;
};

// Copie les codes de taxe du paquet selon le régime du dossier, dans un dossier qui n'en a encore aucun (idempotent) ;
// journal « taxes_initialisees ». Dans la transaction de l'appelant.
const initialiserTaxes = async (db, { dossierId, espaceId, auteurId = null, nom = null, details = {} }) => {
  const deja = await db.query('SELECT 1 FROM compta.taxes WHERE dossier_id = $1 LIMIT 1', [dossierId]);
  if (deja.rows.length) return { codes: 0 };
  const d = await lireDossier(db, dossierId);
  if (!d?.paquet_id) throw new Error(`Dossier ${dossierId} sans paquet : son plan de comptes s'initialise d'abord`);
  const refs = (await codesDuPaquet(db, d.paquet_id)).filter((r) => codeCopie(r.copie, d));
  const n = await copierCodes(db, { dossierId, espaceId, paquetId: d.paquet_id, refs, auteurId, details });
  await journaliser(db, espaceId, auteurId, 'taxes_initialisees', { dossier: dossierId, ...(nom ? { nom } : {}), regime: { tva: d.tva, exportateurTotal: d.exportateur_total }, codes: n, ...details });
  return { codes: n };
};

// À la création d'un dossier (assistant, « Mon entreprise »), après son plan : journaux puis codes de taxe.
const initialiserJournauxEtTaxes = async (db, opts) => {
  const j = await initialiserJournaux(db, opts);
  const t = await initialiserTaxes(db, opts);
  return { journaux: j.journaux, codes: t.codes };
};

// S7a (carte « Tenue » : lignes Lettrage et Échéancier) : par tiers, les lignes validées à lettrer, le dû non lettré
// (brouillard compris, comme l'échéancier) et ses agrégats d'âge ; la part échue se calcule tiers par tiers après
// imputation des règlements sur les échéances les plus anciennes (règles : echeances.js), puis se somme par type.
const SQL_RESUME_TENUE = `
  SELECT n.type, n.tiers_id, COUNT(*) FILTER (WHERE n.etat = 'validee')::int AS a_lettrer,
         COALESCE(SUM(n.du), 0)::numeric(18,3)::text AS du,
         ${sqlAgregatsAges('n')}
    FROM (
      SELECT t.type, l.tiers_id, e.etat, ${SQL_DU} AS du, ($2::date - ${SQL_ECHEANCE})::int AS retard
        FROM compta.lignes l
        JOIN compta.ecritures e ON e.id = l.ecriture_id
        JOIN compta.tiers t ON t.id = l.tiers_id
       WHERE l.dossier_id = $1 AND l.tiers_id IS NOT NULL AND l.lettrage_id IS NULL
    ) n
   GROUP BY n.type, n.tiers_id`;
// S7b (carte « Taxes ») : la période du jour dans l'exercice ouvert (sinon la dernière commencée, sinon la première), son
// état de TVA (brouillard compris, report du crédit depuis le début de l'exercice), les pièces à retenue validées qui
// attendent leur certificat, les certificats produits pour les paiements du mois.
// S7c : la déclaration mensuelle à faire — la dernière période finie du dossier, son échéance, sa date de déclaration.
const SQL_A_DECLARER = `
  SELECT p.id, p.debut::text AS debut, p.fin::text AS fin, dc.declaree_le::text AS declaree_le
    FROM compta.periodes p JOIN compta.exercices x ON x.id = p.exercice_id
    LEFT JOIN compta.declarations dc ON dc.periode_id = p.id AND dc.dossier_id = x.dossier_id
   WHERE x.dossier_id = $1 AND p.fin < $2::date
   ORDER BY p.fin DESC LIMIT 1`;
const declarationAFaire = async (db, d, dossierId, jour) => {
  const p = (await db.query(SQL_A_DECLARER, [dossierId, jour])).rows[0];
  if (!p) return null;
  const e = echeanceDe({ personne: d.personne, teledeclaration: !!d.teledeclaration }, p.fin, fiscaliteDe(d.pays)?.declaration?.echeances);
  return { periode: { id: p.id, debut: p.debut, fin: p.fin }, echeance: e ? e.date : null, declareeLe: p.declaree_le || null };
};
const resumeFiscalite = async (db, dossierId) => {
  const d = (await db.query('SELECT pays, personne, teledeclaration FROM compta.dossiers WHERE id = $1', [dossierId])).rows[0];
  const x = (await db.query(`SELECT id FROM compta.exercices WHERE dossier_id = $1 ORDER BY (etat = 'ouvert') DESC, debut DESC LIMIT 1`, [dossierId])).rows[0];
  const aProduire = (await db.query(SQL_NB_A_PRODUIRE, [dossierId])).rows[0].n;
  const declaration = d ? await declarationAFaire(db, d, dossierId, aujourdhuiTunis()) : null;
  if (!d || !x) return { periode: null, tva: null, aProduire, certificatsMois: 0, declaration };
  const periodes = (await db.query('SELECT id, debut::text AS debut, fin::text AS fin, etat FROM compta.periodes WHERE exercice_id = $1 ORDER BY debut', [x.id])).rows;
  if (!periodes.length) return { periode: null, tva: null, aProduire, certificatsMois: 0, declaration };
  const jour = aujourdhuiTunis();
  const p = periodes.find((y) => jour >= y.debut && jour <= y.fin) || [...periodes].reverse().find((y) => y.debut <= jour) || periodes[0];
  const compteCredit = fiscaliteDe(d.pays)?.tva?.compteCredit || null;
  const [rangees, sansCode, ouverture, certificats] = await Promise.all([
    db.query(SQL_TVA_PAR_PERIODE, [dossierId, x.id, true]),
    db.query(SQL_TVA_SANS_CODE, [dossierId, x.id, true]),
    compteCredit ? db.query(SQL_CREDIT_OUVERTURE, [dossierId, x.id, compteCredit, true]) : { rows: [{ credit: '0.000' }] },
    db.query(`SELECT COUNT(*)::int AS n FROM compta.certificats WHERE dossier_id = $1 AND etat = 'produit' AND date_paiement BETWEEN $2 AND $3`, [dossierId, p.debut, p.fin]),
  ]);
  const etats = etatsTva({ periodes, rangees: rangees.rows, sansCode: sansCode.rows, ouverture: ouverture.rows[0].credit, jusqua: p.id });
  const t = etats[etats.length - 1];
  return { periode: { id: p.id, debut: p.debut, fin: p.fin, etat: p.etat }, tva: { aPayer: t.aPayer, creditAReporter: t.creditAReporter, nbBrouillard: t.nbBrouillard }, aProduire, certificatsMois: certificats.rows[0].n, declaration };
};
// Résumé pour la fiche du dossier (carte « Configuration ») : journaux et codes de taxe actifs ; S5c : tiers (fournisseurs,
// clients) actifs ; S6a (carte « Tenue ») : écritures en brouillard et validées ; S7a : lettrage et échéancier ; S7b (carte
// « Taxes ») : taxes du mois.
const resumeConfiguration = async (db, dossierId) => {
  const [j, t, x, e, n, fiscalite] = await Promise.all([
    db.query('SELECT COUNT(*) FILTER (WHERE actif)::int AS actifs, COUNT(*)::int AS total FROM compta.journaux WHERE dossier_id = $1', [dossierId]),
    db.query('SELECT COUNT(*) FILTER (WHERE actif)::int AS actifs, COUNT(*)::int AS total FROM compta.taxes WHERE dossier_id = $1', [dossierId]),
    db.query('SELECT type, COUNT(*) FILTER (WHERE actif)::int AS actifs, COUNT(*)::int AS total FROM compta.tiers WHERE dossier_id = $1 GROUP BY type', [dossierId]),
    db.query(`SELECT COUNT(*) FILTER (WHERE etat = 'brouillard')::int AS brouillard, COUNT(*) FILTER (WHERE etat = 'validee')::int AS validees FROM compta.ecritures WHERE dossier_id = $1`, [dossierId]),
    db.query(SQL_RESUME_TENUE, [dossierId, aujourdhuiTunis()]),
    resumeFiscalite(db, dossierId),
  ]);
  const tiersDe = (type) => { const r = x.rows.find((y) => y.type === type); return { nbActifs: r ? r.actifs : 0, nbTotal: r ? r.total : 0 }; };
  const tenueDe = (type) => {
    let aLettrer = 0;
    let du = 0n;
    let echu = 0n;
    for (const r of n.rows.filter((y) => y.type === type)) {
      aLettrer += r.a_lettrer;
      du += millimes(r.du);
      echu += trancheesImputees(r).echu;
    }
    return { aLettrer, du: texteMillimesSigne(du), echu: texteMillimesSigne(echu) };
  };
  return {
    journaux: { nbActifs: j.rows[0].actifs, nbTotal: j.rows[0].total },
    taxes: { nbActifs: t.rows[0].actifs, nbTotal: t.rows[0].total },
    tiers: { fournisseurs: tiersDe('fournisseur'), clients: tiersDe('client') },
    ecritures: { nbBrouillard: e.rows[0].brouillard, nbValidees: e.rows[0].validees },
    tenue: { fournisseurs: tenueDe('fournisseur'), clients: tenueDe('client') },
    fiscalite,
  };
};

module.exports = {
  SQL_COPIE, codeCopie, lireDossier, SQL_FEUILLE, choixComptes, presenterCompteCourt, compteDuDossier,
  initialiserJournaux, assurerSousComptes, codesDuPaquet, copierCodes, initialiserTaxes, initialiserJournauxEtTaxes, resumeConfiguration, resumeFiscalite, SQL_A_DECLARER,
};
