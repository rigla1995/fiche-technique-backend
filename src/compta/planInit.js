// LabFlow Compta, étape S5a « Le paquet Tunisie et le plan de comptes » (labflow-reprise/achats-compta/PLAN-S5.md §1,
// §4 ; réponse 2 du client du 07/10 : les dossiers déjà créés reçoivent le paquet par la migration 212, les dossiers
// neufs à leur création). Le plan de comptes d'un dossier = copie complète du paquet de son pays (compta.ref_plans →
// compta.comptes, tous actifs, origine « paquet », libellé du paquet gardé pour « Rétablir »), le dossier retenant la
// version qui l'a initialisé (compta.dossiers.paquet_id). Module sans dépendance vers dossiers.js : appelé par
// dossiers.creer, dossierLabflow.assurerDossierLabflow et la fiche (resumePlan).
const { journaliser } = require('./journal');

// Le paquet le plus récent d'un pays (celui de la dernière migration qui en a posé un), ou null.
const paquetCourant = async (db, pays) => {
  const r = await db.query('SELECT id, pays, version, libelle FROM compta.ref_paquets WHERE pays = $1 ORDER BY id DESC LIMIT 1', [pays]);
  return r.rows[0] || null;
};

// Copie le paquet dans un dossier qui n'a encore aucun compte (idempotent : un dossier déjà initialisé est laissé tel
// quel) ; parents résolus par numéro ; journal « plan_initialise ». Dans la transaction de l'appelant.
// → { paquet: { id, version }, comptes: nombre de comptes copiés } ou { paquet: null, comptes: 0 } si rien n'a été fait.
const initialiserPlan = async (db, { dossierId, espaceId, pays = 'TN', auteurId = null, nom = null, details = {} }) => {
  const deja = await db.query('SELECT 1 FROM compta.comptes WHERE dossier_id = $1 LIMIT 1', [dossierId]);
  if (deja.rows.length) return { paquet: null, comptes: 0 };
  const paquet = await paquetCourant(db, pays);
  if (!paquet) throw new Error(`Aucun paquet pays pour ${pays} : migration manquante`);
  const ins = await db.query(
    `INSERT INTO compta.comptes (dossier_id, numero, libelle, classe, nature, origine, libelle_paquet, note)
     SELECT $1, r.numero, r.libelle, LEFT(r.numero, 1)::smallint, r.nature, 'paquet', r.libelle, r.note
       FROM compta.ref_plans r
      WHERE r.paquet_id = $2
      ORDER BY r.numero`,
    [dossierId, paquet.id]
  );
  await db.query(
    `UPDATE compta.comptes c
        SET parent_id = p.id
       FROM compta.ref_plans r
       JOIN compta.comptes p ON p.dossier_id = $1 AND p.numero = r.parent_numero
      WHERE c.dossier_id = $1 AND c.numero = r.numero AND r.paquet_id = $2 AND r.parent_numero IS NOT NULL`,
    [dossierId, paquet.id]
  );
  await db.query('UPDATE compta.dossiers SET paquet_id = $2 WHERE id = $1', [dossierId, paquet.id]);
  await journaliser(db, espaceId, auteurId, 'plan_initialise', { dossier: dossierId, ...(nom ? { nom } : {}), paquet: `${paquet.pays} ${paquet.version}`, comptes: ins.rowCount, ...details });
  return { paquet: { id: paquet.id, version: paquet.version }, comptes: ins.rowCount };
};

// Résumé du plan pour la fiche du dossier (carte « Configuration ») : comptes actifs, ajoutés, désactivés, paquet.
const resumePlan = async (db, dossierId) => {
  const [c, p] = await Promise.all([
    db.query(
      `SELECT COUNT(*) FILTER (WHERE actif)::int AS actifs, COUNT(*) FILTER (WHERE origine = 'ajout')::int AS ajoutes,
              COUNT(*) FILTER (WHERE NOT actif)::int AS desactives
         FROM compta.comptes WHERE dossier_id = $1`,
      [dossierId]
    ),
    db.query('SELECT p.pays, p.version, p.libelle FROM compta.dossiers d JOIN compta.ref_paquets p ON p.id = d.paquet_id WHERE d.id = $1', [dossierId]),
  ]);
  const n = c.rows[0];
  return { nbActifs: n.actifs, nbAjoutes: n.ajoutes, nbDesactives: n.desactives, paquet: p.rows[0] ? { pays: p.rows[0].pays, version: p.rows[0].version, libelle: p.rows[0].libelle } : null };
};

module.exports = { paquetCourant, initialiserPlan, resumePlan };
