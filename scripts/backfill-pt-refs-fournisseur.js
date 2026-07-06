/**
 * backfill-pt-refs-fournisseur.js
 *
 * Pose le fournisseur AUTO et la référence auto (règle métier buildAutoRef :
 * initiales+YY ou 3 lettres+YY selon le nom du PT) sur les lignes de PRODUCTION
 * et de CONSOMMATION PT créées AVANT la migration 138 — les nouvelles écritures
 * portent déjà tout.
 *
 * Périmètre :
 *  - stock_labo_pt_daily : type 'manuel'/'PT' + legacy positives (au labo, une
 *    ligne positive sans type = production) sans fournisseur ou sans réf.
 *  - stock_produits_transformes : type 'manuel'/'PT' (les legacy NULL positives
 *    d'activité sont ambiguës production/réception → traitées par la migr 140
 *    quand elles correspondent à un transfert, laissées telles quelles sinon).
 *
 * Run : node scripts/backfill-pt-refs-fournisseur.js
 * Également exécuté UNE FOIS au boot par src/config/migrate.js
 * (clé _migrations « 141_backfill_pt_refs_fournisseur.js »).
 */

require('dotenv').config();
const pool = require('../src/config/database');

async function run() {
  // requires inline : modules au cœur du graphe (cycles connus)
  const { buildAutoRef } = require('../src/utils/stockUtils');

  // Fournisseur AUTO par entreprise (get-or-create, mis en cache)
  const autoByEntreprise = new Map();
  const getAuto = async (entrepriseId) => {
    if (!entrepriseId) return null;
    if (autoByEntreprise.has(entrepriseId)) return autoByEntreprise.get(entrepriseId);
    const f = await pool.query(
      `SELECT id FROM fournisseurs WHERE entreprise_id = $1 AND nom = 'AUTO' LIMIT 1`, [entrepriseId]
    );
    let id = f.rows[0]?.id;
    if (!id) {
      const n = await pool.query(
        `INSERT INTO fournisseurs (entreprise_id, nom) VALUES ($1, 'AUTO') RETURNING id`, [entrepriseId]
      );
      id = n.rows[0].id;
    }
    autoByEntreprise.set(entrepriseId, id);
    return id;
  };

  let updated = 0;

  // ── Labo : productions + consommations sous-PT ──
  const labo = await pool.query(
    `SELECT slpt.id, slpt.date_appro, slpt.fournisseur_id, slpt.ref_facture, p.nom, l.entreprise_id
       FROM stock_labo_pt_daily slpt
       JOIN produits p ON p.id = slpt.produit_id
       JOIN labos l ON l.id = slpt.labo_id
      WHERE (slpt.type_appro IN ('manuel', 'PT') OR (slpt.type_appro IS NULL AND slpt.quantite > 0))
        AND (slpt.fournisseur_id IS NULL OR slpt.ref_facture IS NULL)`
  );
  for (const r of labo.rows) {
    const autoId = r.fournisseur_id || await getAuto(r.entreprise_id);
    const u = await pool.query(
      `UPDATE stock_labo_pt_daily
          SET fournisseur_id = COALESCE(fournisseur_id, $1), ref_facture = COALESCE(ref_facture, $2)
        WHERE id = $3`,
      [autoId, buildAutoRef(r.nom, r.date_appro), r.id]
    );
    updated += u.rowCount;
  }

  // ── Activité : productions + consommations sous-PT (types explicites) ──
  const act = await pool.query(
    `SELECT spt.id, spt.date_appro, spt.fournisseur_id, spt.ref_facture, p.nom, pe.id AS entreprise_id
       FROM stock_produits_transformes spt
       JOIN produits p ON p.id = spt.produit_id
       JOIN activites a ON a.id = spt.activite_id
       JOIN profil_entreprise pe ON pe.id = a.entreprise_id
      WHERE spt.type_appro IN ('manuel', 'PT')
        AND (spt.fournisseur_id IS NULL OR spt.ref_facture IS NULL)`
  );
  for (const r of act.rows) {
    const autoId = r.fournisseur_id || await getAuto(r.entreprise_id);
    const u = await pool.query(
      `UPDATE stock_produits_transformes
          SET fournisseur_id = COALESCE(fournisseur_id, $1), ref_facture = COALESCE(ref_facture, $2)
        WHERE id = $3`,
      [autoId, buildAutoRef(r.nom, r.date_appro), r.id]
    );
    updated += u.rowCount;
  }

  console.log(`Backfill réf/fournisseur PT terminé : ${updated} lignes complétées.`);
  return { updated };
}

module.exports = { run };

if (require.main === module) {
  run().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
}
