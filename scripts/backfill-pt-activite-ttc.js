/**
 * backfill-pt-activite-ttc.js
 *
 * Recalcule en TTC le prix_calcule des lignes de PRODUCTION d'un PT en activité
 * (stock_produits_transformes) qui avaient été stockées en HT avant le passage des
 * maps de prix activité en TTC.
 *
 * Sécurité : on ne touche QUE les lignes type_appro='manuel' (productions non ambiguës).
 *   - Les réceptions par TRANSFERT (positives, type_appro NULL) sont DÉJÀ en TTC (prix de
 *     cession) et ne doivent pas être écrasées → exclues.
 *   - Les consommations ('PT', quantité < 0) sont exclues.
 *   - Les lignes legacy NULL positives (avant migration 134) sont ambiguës (production HT vs
 *     réception transfert TTC) → laissées telles quelles ; elles se corrigent naturellement
 *     à la prochaine réception (l'affichage prend la dernière réception).
 *
 * Le recalcul réutilise la logique canonique (buildMpPriceMap = TTC + calculerCoutAvecPrixMap),
 * avec les prix d'articles COURANTS de l'activité (le coût historique exact à la date de
 * production n'est pas reconstituable).
 *
 * Run : node scripts/backfill-pt-activite-ttc.js
 */

require('dotenv').config();
const pool = require('../src/config/database');
const { buildMpPriceMap, calculerCoutAvecPrixMap } = require('../src/controllers/produitsController');

async function main() {
  const cibles = await pool.query(
    `SELECT DISTINCT spt.produit_id, spt.activite_id, pe.client_id
       FROM stock_produits_transformes spt
       JOIN activites a ON a.id = spt.activite_id
       JOIN profil_entreprise pe ON pe.id = a.entreprise_id
      WHERE spt.activite_id IS NOT NULL AND spt.quantite > 0 AND spt.type_appro = 'manuel'`
  );
  console.log(`${cibles.rows.length} couples (produit, activité) à recalculer…`);

  const mapCache = new Map();
  let updatedRows = 0;
  let recalcules = 0;
  for (const r of cibles.rows) {
    const key = `${r.activite_id}:${r.client_id}`;
    if (!mapCache.has(key)) mapCache.set(key, await buildMpPriceMap(r.activite_id, r.client_id));
    const mpMap = mapCache.get(key);
    let ttc = null;
    try {
      const cout = await calculerCoutAvecPrixMap(r.produit_id, r.client_id, mpMap);
      ttc = cout && cout.cout_total != null ? parseFloat(cout.cout_total) : null;
    } catch (e) {
      console.warn(`  ! produit ${r.produit_id} / activité ${r.activite_id}: coût non calculable (${e.message})`);
    }
    if (ttc != null && ttc > 0) {
      const u = await pool.query(
        `UPDATE stock_produits_transformes SET prix_calcule = $1
          WHERE produit_id = $2 AND activite_id = $3 AND quantite > 0 AND type_appro = 'manuel'`,
        [ttc, r.produit_id, r.activite_id]
      );
      updatedRows += u.rowCount;
      recalcules += 1;
    }
  }
  console.log(`Backfill terminé : ${recalcules} PT recalculés, ${updatedRows} lignes de production mises à jour en TTC.`);
}

main().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
