const pool = require('../config/database');

/**
 * Compute current stock for a single ingredient in one scope (labo or activite).
 * Mirrors the exact CTE logic used in getLaboStock / getStockEntreprise.
 * Returns a rounded float (can be negative if data is inconsistent).
 *
 * @param {'labo'|'activite'} scope
 * @param {number}            scopeId    — laboId or activiteId
 * @param {number}            ingredientId
 */
async function computeStockCourant(scope, scopeId, ingredientId) {
  if (scope === 'labo') {
    const r = await pool.query(
      `WITH last_inv AS (
         SELECT quantite_reelle, date_inventaire FROM inventaires
         WHERE labo_id = $1 AND ingredient_id = $2
         ORDER BY date_inventaire DESC, created_at DESC LIMIT 1
       ),
       appro AS (
         SELECT
           COALESCE(SUM(quantite) FILTER (
             WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
               AND date_appro >= (SELECT date_inventaire FROM last_inv)
           ), 0) AS post_qty,
           COALESCE(SUM(quantite), 0) AS all_qty
         FROM stock_labo_daily
         WHERE labo_id = $1 AND ingredient_id = $2 AND type_appro != 'transfert'
       ),
       transfers AS (
         SELECT
           COALESCE(SUM(quantite) FILTER (
             WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
               AND date_transfert >= (SELECT date_inventaire FROM last_inv)
           ), 0) AS post_qty,
           COALESCE(SUM(quantite), 0) AS all_qty
         FROM labo_transfers
         WHERE labo_id = $1 AND ingredient_id = $2
       ),
       pertes AS (
         SELECT
           COALESCE(SUM(quantite) FILTER (
             WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
               AND date_perte >= (SELECT date_inventaire FROM last_inv)
           ), 0) AS post_qty,
           COALESCE(SUM(quantite), 0) AS all_qty
         FROM labo_pertes
         WHERE labo_id = $1 AND ingredient_id = $2
       )
       SELECT CASE
         WHEN (SELECT date_inventaire FROM last_inv) IS NOT NULL
           THEN (SELECT quantite_reelle FROM last_inv)
                + (SELECT post_qty FROM appro)
                - (SELECT post_qty FROM transfers)
                - (SELECT post_qty FROM pertes)
         ELSE
                (SELECT all_qty FROM appro)
                - (SELECT all_qty FROM transfers)
                - (SELECT all_qty FROM pertes)
       END AS stock_courant`,
      [scopeId, ingredientId]
    );
    return Math.round(parseFloat(r.rows[0]?.stock_courant ?? 0) * 1000) / 1000;
  }

  // scope === 'activite'
  const r = await pool.query(
    `WITH last_inv AS (
       SELECT quantite_reelle, date_inventaire FROM inventaires
       WHERE activite_id = $1 AND ingredient_id = $2
       ORDER BY date_inventaire DESC, created_at DESC LIMIT 1
     ),
     appro AS (
       SELECT
         COALESCE(SUM(quantite) FILTER (
           WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
             AND date_appro >= (SELECT date_inventaire FROM last_inv)
         ), 0) AS post_qty,
         COALESCE(SUM(quantite), 0) AS all_qty
       FROM stock_entreprise_daily
       WHERE activite_id = $1 AND ingredient_id = $2
     ),
     pertes AS (
       SELECT
         COALESCE(SUM(quantite) FILTER (
           WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
             AND date_perte >= (SELECT date_inventaire FROM last_inv)
         ), 0) AS post_qty,
         COALESCE(SUM(quantite), 0) AS all_qty
       FROM pertes
       WHERE activite_id = $1 AND ingredient_id = $2
     )
     SELECT CASE
       WHEN (SELECT date_inventaire FROM last_inv) IS NOT NULL
         THEN (SELECT quantite_reelle FROM last_inv)
              + (SELECT post_qty FROM appro)
              - (SELECT post_qty FROM pertes)
       ELSE
              (SELECT all_qty FROM appro)
              - (SELECT all_qty FROM pertes)
     END AS stock_courant`,
    [scopeId, ingredientId]
  );
  return Math.round(parseFloat(r.rows[0]?.stock_courant ?? 0) * 1000) / 1000;
}

/**
 * Compute current PT stock for a single produit in a given scope.
 * - Labo: stock_labo_pt_daily (appro) - labo_transfers (sortants PT) - labo_pertes (PT)
 * - Activite: stock_produits_transformes (entrants) - pertes (PT)
 * Both with last inventory as baseline if it exists.
 *
 * @param {'labo'|'activite'} scope
 * @param {number}            scopeId
 * @param {number}            produitId
 */
async function computeStockPTCourant(scope, scopeId, produitId) {
  if (scope === 'labo') {
    const r = await pool.query(
      `WITH last_inv AS (
         SELECT quantite_reelle, date_inventaire FROM inventaires
         WHERE labo_id = $1 AND produit_id = $2
         ORDER BY date_inventaire DESC, created_at DESC LIMIT 1
       ),
       appro AS (
         SELECT
           COALESCE(SUM(quantite) FILTER (
             WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
               AND date_appro >= (SELECT date_inventaire FROM last_inv)
               AND quantite > 0
           ), 0) AS post_qty,
           COALESCE(SUM(quantite) FILTER (WHERE quantite > 0), 0) AS all_qty
         FROM stock_labo_pt_daily
         WHERE labo_id = $1 AND produit_id = $2
       ),
       transfers AS (
         SELECT
           COALESCE(SUM(quantite) FILTER (
             WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
               AND date_transfert >= (SELECT date_inventaire FROM last_inv)
           ), 0) AS post_qty,
           COALESCE(SUM(quantite), 0) AS all_qty
         FROM labo_transfers
         WHERE labo_id = $1 AND produit_id = $2
       ),
       pertes AS (
         SELECT
           COALESCE(SUM(quantite) FILTER (
             WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
               AND date_perte >= (SELECT date_inventaire FROM last_inv)
           ), 0) AS post_qty,
           COALESCE(SUM(quantite), 0) AS all_qty
         FROM labo_pertes
         WHERE labo_id = $1 AND produit_id = $2
       )
       SELECT CASE
         WHEN (SELECT date_inventaire FROM last_inv) IS NOT NULL
           THEN (SELECT quantite_reelle FROM last_inv)
                + (SELECT post_qty FROM appro)
                - (SELECT post_qty FROM transfers)
                - (SELECT post_qty FROM pertes)
         ELSE
                (SELECT all_qty FROM appro)
                - (SELECT all_qty FROM transfers)
                - (SELECT all_qty FROM pertes)
       END AS stock_courant`,
      [scopeId, produitId]
    );
    return Math.round(parseFloat(r.rows[0]?.stock_courant ?? 0) * 1000) / 1000;
  }

  // scope === 'activite'
  const r = await pool.query(
    `WITH last_inv AS (
       SELECT quantite_reelle, date_inventaire FROM inventaires
       WHERE activite_id = $1 AND produit_id = $2
       ORDER BY date_inventaire DESC, created_at DESC LIMIT 1
     ),
     appro AS (
       SELECT
         COALESCE(SUM(quantite) FILTER (
           WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
             AND date_appro >= (SELECT date_inventaire FROM last_inv)
         ), 0) AS post_qty,
         COALESCE(SUM(quantite), 0) AS all_qty
       FROM stock_produits_transformes
       WHERE activite_id = $1 AND produit_id = $2
     ),
     pertes AS (
       SELECT
         COALESCE(SUM(quantite) FILTER (
           WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
             AND date_perte >= (SELECT date_inventaire FROM last_inv)
         ), 0) AS post_qty,
         COALESCE(SUM(quantite), 0) AS all_qty
       FROM pertes
       WHERE activite_id = $1 AND produit_id = $2
     )
     SELECT CASE
       WHEN (SELECT date_inventaire FROM last_inv) IS NOT NULL
         THEN (SELECT quantite_reelle FROM last_inv)
              + (SELECT post_qty FROM appro)
              - (SELECT post_qty FROM pertes)
       ELSE
              (SELECT all_qty FROM appro)
              - (SELECT all_qty FROM pertes)
     END AS stock_courant`,
    [scopeId, produitId]
  );
  return Math.round(parseFloat(r.rows[0]?.stock_courant ?? 0) * 1000) / 1000;
}

module.exports = { computeStockCourant, computeStockPTCourant };
