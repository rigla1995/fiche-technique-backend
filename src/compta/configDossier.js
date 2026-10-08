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

// Résumé pour la fiche du dossier (carte « Configuration ») : journaux et codes de taxe actifs.
const resumeConfiguration = async (db, dossierId) => {
  const [j, t] = await Promise.all([
    db.query('SELECT COUNT(*) FILTER (WHERE actif)::int AS actifs, COUNT(*)::int AS total FROM compta.journaux WHERE dossier_id = $1', [dossierId]),
    db.query('SELECT COUNT(*) FILTER (WHERE actif)::int AS actifs, COUNT(*)::int AS total FROM compta.taxes WHERE dossier_id = $1', [dossierId]),
  ]);
  return { journaux: { nbActifs: j.rows[0].actifs, nbTotal: j.rows[0].total }, taxes: { nbActifs: t.rows[0].actifs, nbTotal: t.rows[0].total } };
};

module.exports = {
  SQL_COPIE, codeCopie, lireDossier, SQL_FEUILLE, choixComptes, presenterCompteCourt, compteDuDossier,
  initialiserJournaux, assurerSousComptes, codesDuPaquet, copierCodes, initialiserTaxes, initialiserJournauxEtTaxes, resumeConfiguration,
};
