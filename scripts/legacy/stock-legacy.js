/* ORACLE FIGÉ — lot 1b (spec §8). Copie VERBATIM, par site, des 6 calculs de stock
 * remplacés par src/services/stockService.js et des 3 formules de coût labo, extraite
 * AVANT tout refactor (develop = 779f928). NE JAMAIS MODIFIER : ce fichier sert de
 * référence à scripts/check-invariant-stock.js (0 écart au millième attendu).
 *
 * Sites de STOCK (6) :
 *   [S1] stockUtils.js:15   computeStockCourant('labo')      → legacyStockCourant(db,'labo',…)
 *   [S2] stockUtils.js:85   computeStockCourant('activite')  → legacyStockCourant(db,'activite',…)
 *   [S3] stockUtils.js:137  computeStockPTCourant('labo')    → legacyStockPTCourant(db,'labo',…)
 *   [S4] stockUtils.js:208  computeStockPTCourant('activite')→ legacyStockPTCourant(db,'activite',…)
 *   [S5] laboController.js:341  getLaboStock (articles, baseline + quantité + PMP :530-560)
 *                                                          → legacyLaboArticlesBaseline(db, laboId)
 *   [S6] stockController.js:143 getStockEntreprise (articles, baseline + quantité + PMP :539-570)
 *                                                          → legacyActiviteArticlesBaseline(db, activiteId)
 * Formules de COÛT (3) :
 *   [C1] laboController.js:638-660 getLaboPT.prix_calcule   → legacyPtPrixCalcule(db, laboId, produitId)
 *   [C2] laboController.js:899-929 PMP de déduction (HT/TTC) → legacyPmpDeduction(db, laboId, produitId)
 *   [C3] produitsController.js:1007-1030 buildMpPriceMapLabo → legacyBuildMpPriceMapLabo(db, laboId)
 * Sites CONSERVÉS (reçoivent seulement le correctif de filtre §2.1) :
 *   [K1] inventaireController.js:111 (articles labo, inventaire année courante)
 *                                                          → legacyInventaireLaboArticles(db, laboId)
 *   [K2] inventaireController.js:181 (PT labo net miroir)   → legacyInventaireLaboPT(db, laboId)
 *   [K3] laboController.js:672 (getLaboPT baseline PT net miroir) → legacyGetLaboPTQuantites(db, laboId)
 * `db` = pool ou client pg (les originaux utilisaient le pool module-level).
 */

const round3 = (v) => Math.round(parseFloat(v ?? 0) * 1000) / 1000;

// ─── [S1]/[S2] stockUtils.computeStockCourant ────────────────────────────────
async function legacyStockCourant(db, scope, scopeId, ingredientId) {
  if (scope === 'labo') {
    const r = await db.query(
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
           AND NOT (type_appro = 'manuel' AND quantite < 0)
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
       ),
       ventes_ach AS (
         SELECT
           COALESCE(SUM(cal.quantite_unites) FILTER (
             WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
               AND COALESCE(ca.date_expedition, ca.date_commande) >= (SELECT date_inventaire FROM last_inv)
           ), 0) AS post_qty,
           COALESCE(SUM(cal.quantite_unites), 0) AS all_qty
         FROM commande_acheteur_lignes cal
         JOIN commandes_acheteur ca ON ca.id = cal.commande_id
         WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree')
           AND cal.article_type = 'ingredient' AND cal.article_id = $2
       )
       SELECT CASE
         WHEN (SELECT date_inventaire FROM last_inv) IS NOT NULL
           THEN (SELECT quantite_reelle FROM last_inv)
                + (SELECT post_qty FROM appro)
                - (SELECT post_qty FROM transfers)
                - (SELECT post_qty FROM pertes)
                - (SELECT post_qty FROM ventes_ach)
         ELSE
                (SELECT all_qty FROM appro)
                - (SELECT all_qty FROM transfers)
                - (SELECT all_qty FROM pertes)
                - (SELECT all_qty FROM ventes_ach)
       END AS stock_courant`,
      [scopeId, ingredientId]
    );
    return round3(r.rows[0]?.stock_courant ?? 0);
  }
  const r = await db.query(
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
  return round3(r.rows[0]?.stock_courant ?? 0);
}

// ─── [S3]/[S4] stockUtils.computeStockPTCourant ──────────────────────────────
async function legacyStockPTCourant(db, scope, scopeId, produitId) {
  if (scope === 'labo') {
    const r = await db.query(
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
               AND (quantite > 0 OR type_appro = 'PT')
           ), 0) AS post_qty,
           COALESCE(SUM(quantite) FILTER (WHERE quantite > 0 OR type_appro = 'PT'), 0) AS all_qty
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
       ),
       ventes_ach AS (
         SELECT
           COALESCE(SUM(cal.quantite_unites) FILTER (
             WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
               AND COALESCE(ca.date_expedition, ca.date_commande) >= (SELECT date_inventaire FROM last_inv)
           ), 0) AS post_qty,
           COALESCE(SUM(cal.quantite_unites), 0) AS all_qty
         FROM commande_acheteur_lignes cal
         JOIN commandes_acheteur ca ON ca.id = cal.commande_id
         WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree')
           AND cal.article_type = 'produit' AND cal.article_id = $2
       )
       SELECT CASE
         WHEN (SELECT date_inventaire FROM last_inv) IS NOT NULL
           THEN (SELECT quantite_reelle FROM last_inv)
                + (SELECT post_qty FROM appro)
                - (SELECT post_qty FROM transfers)
                - (SELECT post_qty FROM pertes)
                - (SELECT post_qty FROM ventes_ach)
         ELSE
                (SELECT all_qty FROM appro)
                - (SELECT all_qty FROM transfers)
                - (SELECT all_qty FROM pertes)
                - (SELECT all_qty FROM ventes_ach)
       END AS stock_courant`,
      [scopeId, produitId]
    );
    return round3(r.rows[0]?.stock_courant ?? 0);
  }
  const r = await db.query(
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
  return round3(r.rows[0]?.stock_courant ?? 0);
}

// ─── [S5] laboController.getLaboStock :341-498 (+ :501-526, :530-560) ────────
// Renvoie { [ingredientId]: { quantite, pmpUnitHT, pmpUnitTTC, ...baseline } }
async function legacyLaboArticlesBaseline(db, laboId) {
  const invBaselineRes = await db.query(
    `WITH last_inv AS (
       SELECT DISTINCT ON (ingredient_id)
         ingredient_id, quantite_reelle, date_inventaire
       FROM inventaires
       WHERE labo_id = $1 AND ingredient_id IS NOT NULL
       ORDER BY ingredient_id, date_inventaire DESC, created_at DESC
     ),
     post_appro AS (
       SELECT sld.ingredient_id, SUM(sld.quantite) as qty
       FROM stock_labo_daily sld
       JOIN last_inv li ON li.ingredient_id = sld.ingredient_id AND sld.date_appro >= li.date_inventaire
       WHERE sld.labo_id = $1 AND sld.type_appro != 'transfert'
         AND NOT (sld.type_appro = 'manuel' AND sld.quantite < 0)
       GROUP BY sld.ingredient_id
     ),
     post_transfer AS (
       SELECT lt.ingredient_id, SUM(lt.quantite) as qty
       FROM labo_transfers lt
       JOIN last_inv li ON li.ingredient_id = lt.ingredient_id AND lt.date_transfert >= li.date_inventaire
       WHERE lt.labo_id = $1 AND lt.ingredient_id IS NOT NULL
       GROUP BY lt.ingredient_id
     ),
     post_pertes AS (
       SELECT lp.ingredient_id, SUM(lp.quantite) as qty
       FROM labo_pertes lp
       JOIN last_inv li ON li.ingredient_id = lp.ingredient_id AND lp.date_perte >= li.date_inventaire
       WHERE lp.labo_id = $1 AND lp.ingredient_id IS NOT NULL
       GROUP BY lp.ingredient_id
     ),
     all_appro AS (
       SELECT ingredient_id, SUM(quantite) as qty
       FROM stock_labo_daily
       WHERE labo_id = $1 AND type_appro != 'transfert'
         AND NOT (type_appro = 'manuel' AND quantite < 0)
       GROUP BY ingredient_id
     ),
     all_transfer AS (
       SELECT ingredient_id, SUM(quantite) as qty
       FROM labo_transfers
       WHERE labo_id = $1 AND ingredient_id IS NOT NULL
       GROUP BY ingredient_id
     ),
     all_pertes AS (
       SELECT ingredient_id, SUM(quantite) as qty
       FROM labo_pertes
       WHERE labo_id = $1 AND ingredient_id IS NOT NULL
       GROUP BY ingredient_id
     ),
     post_pt_usage AS (
       SELECT sld.ingredient_id, SUM(ABS(sld.quantite)) as qty
       FROM stock_labo_daily sld
       JOIN last_inv li ON li.ingredient_id = sld.ingredient_id AND sld.date_appro >= li.date_inventaire
       WHERE sld.labo_id = $1 AND sld.quantite < 0 AND sld.type_appro NOT IN ('manuel', 'transfert')
       GROUP BY sld.ingredient_id
     ),
     year_pt_usage AS (
       SELECT ingredient_id, SUM(ABS(quantite)) as qty
       FROM stock_labo_daily
       WHERE labo_id = $1 AND quantite < 0 AND type_appro NOT IN ('manuel', 'transfert')
       GROUP BY ingredient_id
     ),
     post_ventes_ach AS (
       SELECT cal.article_id AS ingredient_id, SUM(cal.quantite_unites) as qty
       FROM commande_acheteur_lignes cal
       JOIN commandes_acheteur ca ON ca.id = cal.commande_id
       JOIN last_inv li ON li.ingredient_id = cal.article_id AND COALESCE(ca.date_expedition, ca.date_commande) >= li.date_inventaire
       WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree') AND cal.article_type = 'ingredient'
       GROUP BY cal.article_id
     ),
     all_ventes_ach AS (
       SELECT cal.article_id AS ingredient_id, SUM(cal.quantite_unites) as qty
       FROM commande_acheteur_lignes cal
       JOIN commandes_acheteur ca ON ca.id = cal.commande_id
       WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree') AND cal.article_type = 'ingredient'
       GROUP BY cal.article_id
     ),
     prev_inv AS (
       SELECT ingredient_id, date_inventaire FROM (
         SELECT ingredient_id, date_inventaire,
           ROW_NUMBER() OVER (PARTITION BY ingredient_id ORDER BY date_inventaire DESC, created_at DESC) as rn
         FROM inventaires WHERE labo_id = $1 AND ingredient_id IS NOT NULL
       ) sub WHERE rn = 2
     ),
     first_appro AS (
       SELECT ingredient_id, MIN(date_appro) as first_date
       FROM stock_labo_daily WHERE labo_id = $1 AND type_appro = 'manuel' AND quantite > 0
       GROUP BY ingredient_id
     ),
     pmp_hist AS (
       SELECT sld.ingredient_id,
         SUM(sld.quantite * sld.prix_unitaire) / NULLIF(SUM(sld.quantite), 0) as pmp_ht,
         SUM(sld.quantite * COALESCE(sld.prix_unitaire_tva, sld.prix_unitaire)) / NULLIF(SUM(sld.quantite), 0) as pmp_tva
       FROM stock_labo_daily sld
       JOIN last_inv li ON li.ingredient_id = sld.ingredient_id
       LEFT JOIN prev_inv pi ON pi.ingredient_id = sld.ingredient_id
       LEFT JOIN first_appro fa ON fa.ingredient_id = sld.ingredient_id
       WHERE sld.labo_id = $1 AND sld.type_appro = 'manuel' AND sld.quantite > 0 AND sld.prix_unitaire IS NOT NULL
         AND sld.date_appro >= COALESCE(pi.date_inventaire, fa.first_date)
         AND sld.date_appro < li.date_inventaire
       GROUP BY sld.ingredient_id
     ),
     appro_cost_post AS (
       SELECT sld.ingredient_id,
         SUM(sld.quantite) as qty,
         SUM(sld.quantite * COALESCE(sld.prix_unitaire, 0)) as cost_ht,
         SUM(sld.quantite * COALESCE(sld.prix_unitaire_tva, sld.prix_unitaire, 0)) as cost_tva
       FROM stock_labo_daily sld
       JOIN last_inv li ON li.ingredient_id = sld.ingredient_id AND sld.date_appro >= li.date_inventaire
       WHERE sld.labo_id = $1 AND sld.type_appro = 'manuel' AND sld.quantite > 0
       GROUP BY sld.ingredient_id
     ),
     appro_cost_all AS (
       SELECT ingredient_id,
         SUM(quantite) as qty,
         SUM(quantite * COALESCE(prix_unitaire, 0)) as cost_ht,
         SUM(quantite * COALESCE(prix_unitaire_tva, prix_unitaire, 0)) as cost_tva
       FROM stock_labo_daily
       WHERE labo_id = $1 AND type_appro = 'manuel' AND quantite > 0
       GROUP BY ingredient_id
     )
     SELECT lis.ingredient_id,
            li.quantite_reelle            as inv_qty,
            li.date_inventaire            as inv_date,
            COALESCE(pa.qty, 0)           as post_appro_qty,
            COALESCE(pt.qty, 0)           as post_transfer_qty,
            COALESCE(pp.qty, 0)           as post_pertes_qty,
            COALESCE(ppu.qty, 0)          as post_pt_usage_qty,
            ph.pmp_ht                     as pmp_hist_ht,
            ph.pmp_tva                    as pmp_hist_tva,
            COALESCE(acp.qty, 0)          as appro_cost_post_qty,
            COALESCE(acp.cost_ht, 0)      as appro_cost_post_ht,
            COALESCE(acp.cost_tva, 0)     as appro_cost_post_tva,
            COALESCE(aa.qty, 0)           as all_appro_qty,
            COALESCE(atr.qty, 0)          as all_transfer_qty,
            COALESCE(ap.qty, 0)           as all_pertes_qty,
            COALESCE(apu.qty, 0)          as all_pt_usage_qty,
            COALESCE(pva.qty, 0)          as post_ventes_ach_qty,
            COALESCE(ava.qty, 0)          as all_ventes_ach_qty,
            COALESCE(aca.qty, 0)          as appro_cost_all_qty,
            COALESCE(aca.cost_ht, 0)      as appro_cost_all_ht,
            COALESCE(aca.cost_tva, 0)     as appro_cost_all_tva
     FROM labo_ingredient_selections lis
     LEFT JOIN last_inv li      ON li.ingredient_id  = lis.ingredient_id
     LEFT JOIN post_appro pa    ON pa.ingredient_id  = lis.ingredient_id
     LEFT JOIN post_transfer pt ON pt.ingredient_id  = lis.ingredient_id
     LEFT JOIN post_pertes pp   ON pp.ingredient_id  = lis.ingredient_id
     LEFT JOIN post_pt_usage ppu ON ppu.ingredient_id = lis.ingredient_id
     LEFT JOIN pmp_hist ph       ON ph.ingredient_id  = lis.ingredient_id
     LEFT JOIN appro_cost_post acp ON acp.ingredient_id = lis.ingredient_id
     LEFT JOIN all_appro aa    ON aa.ingredient_id  = lis.ingredient_id
     LEFT JOIN all_transfer atr ON atr.ingredient_id = lis.ingredient_id
     LEFT JOIN all_pertes ap   ON ap.ingredient_id  = lis.ingredient_id
     LEFT JOIN year_pt_usage apu ON apu.ingredient_id = lis.ingredient_id
     LEFT JOIN post_ventes_ach pva ON pva.ingredient_id = lis.ingredient_id
     LEFT JOIN all_ventes_ach ava ON ava.ingredient_id = lis.ingredient_id
     LEFT JOIN appro_cost_all aca ON aca.ingredient_id = lis.ingredient_id
     WHERE lis.labo_id = $1`,
    [laboId]
  );
  const out = {};
  for (const r of invBaselineRes.rows) {
    const b = {
      hasInv: r.inv_qty !== null,
      invQty: r.inv_qty !== null ? parseFloat(r.inv_qty) : 0,
      postApproQty: parseFloat(r.post_appro_qty) || 0,
      postTransferQty: parseFloat(r.post_transfer_qty) || 0,
      postPertesQty: parseFloat(r.post_pertes_qty) || 0,
      postPtUsageQty: parseFloat(r.post_pt_usage_qty) || 0,
      pmpHistHT: r.pmp_hist_ht !== null ? parseFloat(r.pmp_hist_ht) : null,
      pmpHistTTC: r.pmp_hist_tva !== null ? parseFloat(r.pmp_hist_tva) : null,
      approCostPostQty: parseFloat(r.appro_cost_post_qty) || 0,
      approCostPostHT: parseFloat(r.appro_cost_post_ht) || 0,
      approCostPostTTC: parseFloat(r.appro_cost_post_tva) || 0,
      allApproQty: parseFloat(r.all_appro_qty) || 0,
      allTransferQty: parseFloat(r.all_transfer_qty) || 0,
      allPertesQty: parseFloat(r.all_pertes_qty) || 0,
      allPtUsageQty: parseFloat(r.all_pt_usage_qty) || 0,
      postVentesAchQty: parseFloat(r.post_ventes_ach_qty) || 0,
      allVentesAchQty: parseFloat(r.all_ventes_ach_qty) || 0,
      approCostAllQty: parseFloat(r.appro_cost_all_qty) || 0,
      approCostAllHT: parseFloat(r.appro_cost_all_ht) || 0,
      approCostAllTTC: parseFloat(r.appro_cost_all_tva) || 0,
    };
    // :531-534
    const quantiteRaw = b.hasInv
      ? b.invQty + b.postApproQty - b.postTransferQty - b.postPertesQty - b.postVentesAchQty
      : b.allApproQty - b.allTransferQty - b.allPertesQty - b.allVentesAchQty;
    const quantite = Math.round(quantiteRaw * 1000) / 1000;
    // :541-563
    let pmpUnitHT = null;
    let pmpUnitTTC = null;
    if (b.hasInv) {
      const invValued = b.invQty > 0 && b.pmpHistHT !== null;
      const invQtyForPmp = invValued ? b.invQty : 0;
      const coutInvHT = invValued ? b.invQty * b.pmpHistHT : 0;
      const coutInvTTC = invValued ? b.invQty * (b.pmpHistTTC !== null ? b.pmpHistTTC : b.pmpHistHT) : 0;
      const totalCostInHT = coutInvHT + (b.approCostPostHT || 0);
      const totalCostInTTC = coutInvTTC + (b.approCostPostTTC || 0);
      const totalQtyIn = invQtyForPmp + (b.approCostPostQty || 0);
      pmpUnitHT = totalQtyIn > 0 ? totalCostInHT / totalQtyIn : null;
      pmpUnitTTC = totalQtyIn > 0 ? totalCostInTTC / totalQtyIn : null;
    } else {
      pmpUnitHT = b.approCostAllQty > 0 ? b.approCostAllHT / b.approCostAllQty : null;
      pmpUnitTTC = b.approCostAllQty > 0 ? b.approCostAllTTC / b.approCostAllQty : null;
    }
    out[r.ingredient_id] = { ...b, quantite, pmpUnitHT, pmpUnitTTC };
  }
  return out;
}

// ─── [S6] stockController.getStockEntreprise :143-356 (+ :539-570) ───────────
async function legacyActiviteArticlesBaseline(db, activiteId) {
  const invBaselineRes = await db.query(
    `WITH last_inv AS (
       SELECT DISTINCT ON (ingredient_id)
         ingredient_id, quantite_reelle, date_inventaire
       FROM inventaires
       WHERE activite_id = $1 AND ingredient_id IS NOT NULL
       ORDER BY ingredient_id, date_inventaire DESC, created_at DESC
     ),
     post_appro AS (
       SELECT sed.ingredient_id, SUM(sed.quantite) as qty
       FROM stock_entreprise_daily sed
       JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
       WHERE sed.activite_id = $1
       GROUP BY sed.ingredient_id
     ),
     post_pertes AS (
       SELECT p.ingredient_id, SUM(p.quantite) as qty
       FROM pertes p
       JOIN last_inv li ON li.ingredient_id = p.ingredient_id AND p.date_perte >= li.date_inventaire
       WHERE p.activite_id = $1 AND p.ingredient_id IS NOT NULL
       GROUP BY p.ingredient_id
     ),
     post_pt_usage AS (
       SELECT sed.ingredient_id, SUM(ABS(sed.quantite)) as qty
       FROM stock_entreprise_daily sed
       JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
       WHERE sed.activite_id = $1 AND sed.quantite < 0 AND sed.type_appro NOT IN ('vente','annulation_vente')
       GROUP BY sed.ingredient_id
     ),
     post_ventes AS (
       SELECT sed.ingredient_id, GREATEST(-SUM(sed.quantite), 0) as qty
       FROM stock_entreprise_daily sed
       JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
       WHERE sed.activite_id = $1 AND sed.type_appro IN ('vente', 'annulation_vente')
       GROUP BY sed.ingredient_id
     ),
     all_appro AS (
       SELECT ingredient_id, SUM(quantite) as qty
       FROM stock_entreprise_daily
       WHERE activite_id = $1
       GROUP BY ingredient_id
     ),
     all_pertes AS (
       SELECT ingredient_id, SUM(quantite) as qty
       FROM pertes
       WHERE activite_id = $1 AND ingredient_id IS NOT NULL
       GROUP BY ingredient_id
     ),
     all_pt_usage AS (
       SELECT ingredient_id, SUM(ABS(quantite)) as qty
       FROM stock_entreprise_daily
       WHERE activite_id = $1 AND quantite < 0 AND type_appro NOT IN ('vente','annulation_vente')
       GROUP BY ingredient_id
     ),
     all_ventes AS (
       SELECT ingredient_id, GREATEST(-SUM(quantite), 0) as qty
       FROM stock_entreprise_daily
       WHERE activite_id = $1 AND type_appro IN ('vente', 'annulation_vente')
       GROUP BY ingredient_id
     ),
     post_transferts_in AS (
       SELECT sed.ingredient_id, SUM(sed.quantite) as qty
       FROM stock_entreprise_daily sed
       JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
       WHERE sed.activite_id = $1 AND sed.quantite > 0 AND sed.type_appro = 'transfert'
       GROUP BY sed.ingredient_id
     ),
     all_transferts_in AS (
       SELECT ingredient_id, SUM(quantite) as qty
       FROM stock_entreprise_daily
       WHERE activite_id = $1 AND quantite > 0 AND type_appro = 'transfert'
       GROUP BY ingredient_id
     ),
     prev_inv AS (
       SELECT ingredient_id, date_inventaire FROM (
         SELECT ingredient_id, date_inventaire,
           ROW_NUMBER() OVER (PARTITION BY ingredient_id ORDER BY date_inventaire DESC, created_at DESC) as rn
         FROM inventaires WHERE activite_id = $1 AND ingredient_id IS NOT NULL
       ) sub WHERE rn = 2
     ),
     first_appro AS (
       SELECT ingredient_id, MIN(date_appro) as first_date
       FROM stock_entreprise_daily WHERE activite_id = $1 AND quantite > 0
       GROUP BY ingredient_id
     ),
     pmp_hist AS (
       SELECT sed.ingredient_id,
         SUM(sed.quantite * sed.prix_unitaire) / NULLIF(SUM(sed.quantite), 0) as pmp_ht,
         SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire)) / NULLIF(SUM(sed.quantite), 0) as pmp_tva
       FROM stock_entreprise_daily sed
       JOIN last_inv li ON li.ingredient_id = sed.ingredient_id
       LEFT JOIN prev_inv pi ON pi.ingredient_id = sed.ingredient_id
       LEFT JOIN first_appro fa ON fa.ingredient_id = sed.ingredient_id
       WHERE sed.activite_id = $1 AND sed.type_appro = 'manuel' AND sed.quantite > 0 AND sed.prix_unitaire IS NOT NULL
         AND sed.date_appro >= COALESCE(pi.date_inventaire, fa.first_date)
         AND sed.date_appro < li.date_inventaire
       GROUP BY sed.ingredient_id
     ),
     appro_cost_post AS (
       SELECT sed.ingredient_id,
         SUM(sed.quantite) as qty,
         SUM(sed.quantite * COALESCE(sed.prix_unitaire, 0)) as cost_ht,
         SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire, 0)) as cost_tva
       FROM stock_entreprise_daily sed
       JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
       WHERE sed.activite_id = $1 AND sed.type_appro = 'manuel' AND sed.quantite > 0
       GROUP BY sed.ingredient_id
     ),
     appro_cost_all AS (
       SELECT ingredient_id,
         SUM(quantite) as qty,
         SUM(quantite * COALESCE(prix_unitaire, 0)) as cost_ht,
         SUM(quantite * COALESCE(prix_unitaire_tva, prix_unitaire, 0)) as cost_tva
       FROM stock_entreprise_daily
       WHERE activite_id = $1 AND type_appro = 'manuel' AND quantite > 0
       GROUP BY ingredient_id
     ),
     transfer_cost_post AS (
       SELECT sed.ingredient_id,
         SUM(sed.quantite) as qty,
         SUM(sed.quantite * COALESCE(sed.prix_unitaire, 0)) as cost_ht,
         SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire, 0)) as cost_tva
       FROM stock_entreprise_daily sed
       JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
       WHERE sed.activite_id = $1 AND sed.type_appro = 'transfert' AND sed.quantite > 0
       GROUP BY sed.ingredient_id
     ),
     transfer_cost_all AS (
       SELECT ingredient_id,
         SUM(quantite) as qty,
         SUM(quantite * COALESCE(prix_unitaire, 0)) as cost_ht,
         SUM(quantite * COALESCE(prix_unitaire_tva, prix_unitaire, 0)) as cost_tva
       FROM stock_entreprise_daily
       WHERE activite_id = $1 AND type_appro = 'transfert' AND quantite > 0
       GROUP BY ingredient_id
     )
     SELECT ais.ingredient_id,
            li.quantite_reelle        as inv_qty,
            li.date_inventaire        as inv_date,
            COALESCE(pa.qty, 0)       as post_appro_qty,
            COALESCE(pp.qty, 0)       as post_pertes_qty,
            COALESCE(ppu.qty, 0)      as post_pt_usage_qty,
            COALESCE(pv.qty, 0)       as post_vente_qty,
            COALESCE(av.qty, 0)       as all_vente_qty,
            COALESCE(aa.qty, 0)       as all_appro_qty,
            COALESCE(ap.qty, 0)       as all_pertes_qty,
            COALESCE(apu.qty, 0)      as all_pt_usage_qty,
            COALESCE(pti.qty, 0)      as post_transferts_in_qty,
            COALESCE(ati.qty, 0)      as all_transferts_in_qty,
            ph.pmp_ht                 as pmp_hist_ht,
            ph.pmp_tva                as pmp_hist_tva,
            COALESCE(acp.qty, 0)      as appro_cost_post_qty,
            COALESCE(acp.cost_ht, 0)  as appro_cost_post_ht,
            COALESCE(acp.cost_tva, 0) as appro_cost_post_tva,
            COALESCE(aca.qty, 0)      as appro_cost_all_qty,
            COALESCE(aca.cost_ht, 0)  as appro_cost_all_ht,
            COALESCE(aca.cost_tva, 0) as appro_cost_all_tva,
            COALESCE(tcp.qty, 0)      as transfer_cost_post_qty,
            COALESCE(tcp.cost_ht, 0)  as transfer_cost_post_ht,
            COALESCE(tcp.cost_tva, 0) as transfer_cost_post_tva,
            COALESCE(tca.qty, 0)      as transfer_cost_all_qty,
            COALESCE(tca.cost_ht, 0)  as transfer_cost_all_ht,
            COALESCE(tca.cost_tva, 0) as transfer_cost_all_tva
     FROM activite_ingredient_selections ais
     LEFT JOIN last_inv li                ON li.ingredient_id  = ais.ingredient_id
     LEFT JOIN post_appro pa              ON pa.ingredient_id  = ais.ingredient_id
     LEFT JOIN post_pertes pp             ON pp.ingredient_id  = ais.ingredient_id
     LEFT JOIN post_pt_usage ppu          ON ppu.ingredient_id = ais.ingredient_id
     LEFT JOIN post_ventes pv            ON pv.ingredient_id  = ais.ingredient_id
     LEFT JOIN all_ventes av             ON av.ingredient_id  = ais.ingredient_id
     LEFT JOIN all_appro aa              ON aa.ingredient_id  = ais.ingredient_id
     LEFT JOIN all_pertes ap             ON ap.ingredient_id  = ais.ingredient_id
     LEFT JOIN all_pt_usage apu          ON apu.ingredient_id = ais.ingredient_id
     LEFT JOIN post_transferts_in pti    ON pti.ingredient_id = ais.ingredient_id
     LEFT JOIN all_transferts_in ati     ON ati.ingredient_id = ais.ingredient_id
     LEFT JOIN pmp_hist ph               ON ph.ingredient_id  = ais.ingredient_id
     LEFT JOIN appro_cost_post acp       ON acp.ingredient_id = ais.ingredient_id
     LEFT JOIN appro_cost_all aca        ON aca.ingredient_id = ais.ingredient_id
     LEFT JOIN transfer_cost_post tcp    ON tcp.ingredient_id = ais.ingredient_id
     LEFT JOIN transfer_cost_all tca     ON tca.ingredient_id = ais.ingredient_id
     WHERE ais.activite_id = $1`,
    [activiteId]
  );
  const out = {};
  for (const r of invBaselineRes.rows) {
    const b = {
      hasInv: r.inv_qty !== null,
      invQty: r.inv_qty !== null ? parseFloat(r.inv_qty) : 0,
      postApproQty: parseFloat(r.post_appro_qty) || 0,
      postPertesQty: parseFloat(r.post_pertes_qty) || 0,
      postPtUsageQty: parseFloat(r.post_pt_usage_qty) || 0,
      postVenteQty: parseFloat(r.post_vente_qty) || 0,
      allVenteQty: parseFloat(r.all_vente_qty) || 0,
      allApproQty: parseFloat(r.all_appro_qty) || 0,
      allPertesQty: parseFloat(r.all_pertes_qty) || 0,
      allPtUsageQty: parseFloat(r.all_pt_usage_qty) || 0,
      postTransfertsInQty: parseFloat(r.post_transferts_in_qty) || 0,
      allTransfertsInQty: parseFloat(r.all_transferts_in_qty) || 0,
      pmpHistHT: r.pmp_hist_ht !== null ? parseFloat(r.pmp_hist_ht) : null,
      pmpHistTTC: r.pmp_hist_tva !== null ? parseFloat(r.pmp_hist_tva) : null,
      approCostPostQty: parseFloat(r.appro_cost_post_qty) || 0,
      approCostPostHT: parseFloat(r.appro_cost_post_ht) || 0,
      approCostPostTTC: parseFloat(r.appro_cost_post_tva) || 0,
      approCostAllQty: parseFloat(r.appro_cost_all_qty) || 0,
      approCostAllHT: parseFloat(r.appro_cost_all_ht) || 0,
      approCostAllTTC: parseFloat(r.appro_cost_all_tva) || 0,
      transferCostPostQty: parseFloat(r.transfer_cost_post_qty) || 0,
      transferCostPostHT: parseFloat(r.transfer_cost_post_ht) || 0,
      transferCostPostTTC: parseFloat(r.transfer_cost_post_tva) || 0,
      transferCostAllQty: parseFloat(r.transfer_cost_all_qty) || 0,
      transferCostAllHT: parseFloat(r.transfer_cost_all_ht) || 0,
      transferCostAllTTC: parseFloat(r.transfer_cost_all_tva) || 0,
    };
    // :539-541
    const quantite = b.hasInv
      ? b.invQty + b.postApproQty - b.postPertesQty
      : b.allApproQty - b.allPertesQty;
    // :548-570
    let pmpHT = null;
    let pmpTTC = null;
    if (b.hasInv) {
      const invValued = b.invQty > 0 && b.pmpHistHT !== null;
      const invQtyForPmp = invValued ? b.invQty : 0;
      const coutInvHT = invValued ? b.invQty * b.pmpHistHT : 0;
      const coutInvTTC = invValued ? b.invQty * (b.pmpHistTTC !== null ? b.pmpHistTTC : b.pmpHistHT) : 0;
      const totalCostInHT = coutInvHT + (b.approCostPostHT || 0) + (b.transferCostPostHT || 0);
      const totalCostInTTC = coutInvTTC + (b.approCostPostTTC || 0) + (b.transferCostPostTTC || 0);
      const totalQtyIn = invQtyForPmp + (b.approCostPostQty || 0) + (b.transferCostPostQty || 0);
      pmpHT = totalQtyIn > 0 ? totalCostInHT / totalQtyIn : null;
      pmpTTC = totalQtyIn > 0 ? totalCostInTTC / totalQtyIn : null;
    } else {
      const totalQtyIn = (b.approCostAllQty || 0) + (b.transferCostAllQty || 0);
      const totalCostInHT = (b.approCostAllHT || 0) + (b.transferCostAllHT || 0);
      const totalCostInTTC = (b.approCostAllTTC || 0) + (b.transferCostAllTTC || 0);
      pmpHT = totalQtyIn > 0 ? totalCostInHT / totalQtyIn : null;
      pmpTTC = totalQtyIn > 0 ? totalCostInTTC / totalQtyIn : null;
    }
    out[r.ingredient_id] = { ...b, quantite, pmpUnitHT: pmpHT, pmpUnitTTC: pmpTTC };
  }
  return out;
}

// ─── [C1] laboController.getLaboPT :638-660 — prix_calcule d'un PT (scalaire) ─
async function legacyPtPrixCalcule(db, laboId, produitId) {
  const r = await db.query(
    `SELECT (
        COALESCE((SELECT SUM(pi2.portion * (
           SELECT SUM(sld2.quantite * sld2.prix_unitaire) / NULLIF(SUM(sld2.quantite), 0) FROM stock_labo_daily sld2
           WHERE sld2.labo_id = $1 AND sld2.ingredient_id = pi2.ingredient_id
             AND sld2.type_appro = 'manuel' AND sld2.prix_unitaire IS NOT NULL AND sld2.prix_unitaire > 0 AND sld2.quantite > 0
             AND sld2.date_appro >= COALESCE(
               (SELECT date_inventaire FROM inventaires WHERE labo_id = $1 AND ingredient_id = pi2.ingredient_id ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
               (SELECT MIN(date_appro) FROM stock_labo_daily WHERE labo_id = $1 AND ingredient_id = pi2.ingredient_id AND quantite > 0)
             )
        )) FROM produit_ingredients pi2 WHERE pi2.produit_id = p.id), 0)
        +
        COALESCE((SELECT SUM(psp.portion * (
           SELECT COALESCE(SUM(pi3.portion * (
              SELECT SUM(sld3.quantite * sld3.prix_unitaire) / NULLIF(SUM(sld3.quantite), 0) FROM stock_labo_daily sld3
              WHERE sld3.labo_id = $1 AND sld3.ingredient_id = pi3.ingredient_id
                AND sld3.type_appro = 'manuel' AND sld3.prix_unitaire IS NOT NULL AND sld3.prix_unitaire > 0 AND sld3.quantite > 0
                AND sld3.date_appro >= COALESCE(
                  (SELECT date_inventaire FROM inventaires WHERE labo_id = $1 AND ingredient_id = pi3.ingredient_id ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
                  (SELECT MIN(date_appro) FROM stock_labo_daily WHERE labo_id = $1 AND ingredient_id = pi3.ingredient_id AND quantite > 0)
                )
           )), 0) FROM produit_ingredients pi3 WHERE pi3.produit_id = psp.sous_produit_id
        )) FROM produit_sous_produits psp WHERE psp.produit_id = p.id), 0)
      ) as prix_calcule
     FROM produits p WHERE p.id = $2`,
    [laboId, produitId]
  );
  return r.rows[0]?.prix_calcule != null ? parseFloat(r.rows[0].prix_calcule) : null;
}

// ─── [C2] laboController.updateLaboStock :898-930 — PMP de déduction HT/TTC ──
// Renvoie [{ ingredientId, portion, lastPrix, lastPrixTtc }] pour la recette du PT.
async function legacyPmpDeduction(db, laboId, produitId) {
  const r = await db.query(
    `SELECT pi.ingredient_id, pi.portion, i.nom as ing_nom,
       (SELECT SUM(sld.quantite * sld.prix_unitaire) / NULLIF(SUM(sld.quantite), 0)
        FROM stock_labo_daily sld
        WHERE sld.labo_id = $2 AND sld.ingredient_id = pi.ingredient_id
          AND sld.quantite > 0 AND sld.prix_unitaire IS NOT NULL
          AND sld.type_appro = 'manuel'
          AND sld.date_appro >= COALESCE(
            (SELECT date_inventaire FROM inventaires
             WHERE labo_id = $2 AND ingredient_id = pi.ingredient_id
             ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
            (SELECT MIN(date_appro) FROM stock_labo_daily
             WHERE labo_id = $2 AND ingredient_id = pi.ingredient_id AND quantite > 0)
          )
       ) AS last_prix,
       (SELECT SUM(sld.quantite * COALESCE(sld.prix_unitaire_tva, sld.prix_unitaire)) / NULLIF(SUM(sld.quantite), 0)
        FROM stock_labo_daily sld
        WHERE sld.labo_id = $2 AND sld.ingredient_id = pi.ingredient_id
          AND sld.quantite > 0 AND sld.prix_unitaire IS NOT NULL
          AND sld.type_appro = 'manuel'
          AND sld.date_appro >= COALESCE(
            (SELECT date_inventaire FROM inventaires
             WHERE labo_id = $2 AND ingredient_id = pi.ingredient_id
             ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
            (SELECT MIN(date_appro) FROM stock_labo_daily
             WHERE labo_id = $2 AND ingredient_id = pi.ingredient_id AND quantite > 0)
          )
       ) AS last_prix_ttc
     FROM produit_ingredients pi
     JOIN articles i ON i.id = pi.ingredient_id
     WHERE pi.produit_id = $1
     ORDER BY pi.ingredient_id`,
    [produitId, laboId]
  );
  return r.rows.map((x) => ({
    ingredientId: x.ingredient_id,
    portion: parseFloat(x.portion),
    lastPrix: x.last_prix != null ? parseFloat(x.last_prix) : null,
    lastPrixTtc: x.last_prix_ttc != null ? parseFloat(x.last_prix_ttc) : null,
  }));
}

// ─── [C3] produitsController.buildMpPriceMapLabo :1007-1030 ───────────────────
async function legacyBuildMpPriceMapLabo(db, laboId) {
  const priceMap = {};
  if (!laboId) return priceMap;
  const r = await db.query(
    `WITH last_inv AS (
       SELECT DISTINCT ON (ingredient_id) ingredient_id, date_inventaire
       FROM inventaires
       WHERE labo_id = $1 AND ingredient_id IS NOT NULL
       ORDER BY ingredient_id, date_inventaire DESC, created_at DESC
     )
     SELECT sld.ingredient_id,
            SUM(sld.quantite * COALESCE(sld.prix_unitaire_tva, sld.prix_unitaire)) / NULLIF(SUM(sld.quantite), 0) AS avg_prix
     FROM stock_labo_daily sld
     LEFT JOIN last_inv li ON li.ingredient_id = sld.ingredient_id
     WHERE sld.labo_id = $1
       AND COALESCE(sld.prix_unitaire_tva, sld.prix_unitaire) IS NOT NULL AND COALESCE(sld.prix_unitaire_tva, sld.prix_unitaire) > 0
       AND sld.quantite > 0 AND sld.type_appro = 'manuel'
       AND (li.date_inventaire IS NULL OR sld.date_appro >= li.date_inventaire)
     GROUP BY sld.ingredient_id`,
    [laboId]
  );
  r.rows.forEach((row) => { priceMap[row.ingredient_id] = parseFloat(row.avg_prix); });
  return priceMap;
}

// ─── [K1] inventaireController.getLaboInventaireStock :110-177 (articles) ─────
async function legacyInventaireLaboArticles(db, laboId) {
  const totalStockRes = await db.query(
    `WITH last_inv AS (
       SELECT DISTINCT ON (ingredient_id)
         ingredient_id, quantite_reelle, date_inventaire
       FROM inventaires
       WHERE labo_id = $1 AND ingredient_id IS NOT NULL
         AND date_trunc('year', date_inventaire) = date_trunc('year', CURRENT_DATE)
       ORDER BY ingredient_id, date_inventaire DESC, created_at DESC
     ),
     post_appro AS (
       SELECT sld.ingredient_id, SUM(sld.quantite) as qty
       FROM stock_labo_daily sld
       JOIN last_inv li ON li.ingredient_id = sld.ingredient_id AND sld.date_appro >= li.date_inventaire
       WHERE sld.labo_id = $1 AND sld.type_appro != 'transfert'
         AND NOT (sld.type_appro = 'manuel' AND sld.quantite < 0)
       GROUP BY sld.ingredient_id
     ),
     post_transfer AS (
       SELECT lt.ingredient_id, SUM(lt.quantite) as qty
       FROM labo_transfers lt
       JOIN last_inv li ON li.ingredient_id = lt.ingredient_id AND lt.date_transfert >= li.date_inventaire
       WHERE lt.labo_id = $1 AND lt.ingredient_id IS NOT NULL
       GROUP BY lt.ingredient_id
     ),
     post_pertes AS (
       SELECT lp.ingredient_id, SUM(lp.quantite) as qty
       FROM labo_pertes lp
       JOIN last_inv li ON li.ingredient_id = lp.ingredient_id AND lp.date_perte >= li.date_inventaire
       WHERE lp.labo_id = $1 AND lp.ingredient_id IS NOT NULL
       GROUP BY lp.ingredient_id
     ),
     all_appro AS (
       SELECT ingredient_id, SUM(quantite) as qty
       FROM stock_labo_daily
       WHERE labo_id = $1 AND type_appro != 'transfert'
         AND NOT (type_appro = 'manuel' AND quantite < 0)
       GROUP BY ingredient_id
     ),
     all_transfer AS (
       SELECT ingredient_id, SUM(quantite) as qty
       FROM labo_transfers
       WHERE labo_id = $1 AND ingredient_id IS NOT NULL
       GROUP BY ingredient_id
     ),
     all_pertes AS (
       SELECT ingredient_id, SUM(quantite) as qty
       FROM labo_pertes
       WHERE labo_id = $1 AND ingredient_id IS NOT NULL
       GROUP BY ingredient_id
     )
     SELECT lis.ingredient_id,
       CASE WHEN li.ingredient_id IS NOT NULL
         THEN li.quantite_reelle + COALESCE(pa.qty,0) - COALESCE(pt.qty,0) - COALESCE(pp.qty,0)
         ELSE COALESCE(aa.qty,0) - COALESCE(atr.qty,0) - COALESCE(ap.qty,0)
       END as total_stock
     FROM labo_ingredient_selections lis
     LEFT JOIN last_inv li    ON li.ingredient_id  = lis.ingredient_id
     LEFT JOIN post_appro pa  ON pa.ingredient_id  = lis.ingredient_id
     LEFT JOIN post_transfer pt ON pt.ingredient_id = lis.ingredient_id
     LEFT JOIN post_pertes pp ON pp.ingredient_id  = lis.ingredient_id
     LEFT JOIN all_appro aa   ON aa.ingredient_id  = lis.ingredient_id
     LEFT JOIN all_transfer atr ON atr.ingredient_id = lis.ingredient_id
     LEFT JOIN all_pertes ap  ON ap.ingredient_id  = lis.ingredient_id
     WHERE lis.labo_id = $1`,
    [laboId]
  );
  const map = {};
  for (const r of totalStockRes.rows) map[r.ingredient_id] = parseFloat(r.total_stock) || 0;
  return map;
}

// ─── [K2] inventaireController.getLaboInventaireStock :180-… (PT net miroir) ──
async function legacyInventaireLaboPT(db, laboId) {
  const r = await db.query(
    `WITH last_inv AS (
       SELECT DISTINCT ON (produit_id)
         produit_id, quantite_reelle, date_inventaire
       FROM inventaires
       WHERE labo_id = $1 AND produit_id IS NOT NULL
         AND date_trunc('year', date_inventaire) = date_trunc('year', CURRENT_DATE)
       ORDER BY produit_id, date_inventaire DESC, created_at DESC
     ),
     post_appro AS (
       SELECT slpt.produit_id, SUM(slpt.quantite) as qty
       FROM stock_labo_pt_daily slpt
       JOIN last_inv li ON li.produit_id = slpt.produit_id AND slpt.date_appro >= li.date_inventaire
       WHERE slpt.labo_id = $1
       GROUP BY slpt.produit_id
     ),
     post_pertes AS (
       SELECT lp.produit_id, SUM(lp.quantite) as qty
       FROM labo_pertes lp
       JOIN last_inv li ON li.produit_id = lp.produit_id AND lp.date_perte >= li.date_inventaire
       WHERE lp.labo_id = $1 AND lp.produit_id IS NOT NULL
       GROUP BY lp.produit_id
     ),
     all_appro AS (
       SELECT produit_id, SUM(quantite) as qty
       FROM stock_labo_pt_daily
       WHERE labo_id = $1
       GROUP BY produit_id
     ),
     all_pertes AS (
       SELECT produit_id, SUM(quantite) as qty
       FROM labo_pertes
       WHERE labo_id = $1 AND produit_id IS NOT NULL
       GROUP BY produit_id
     )
     SELECT lps.produit_id,
       CASE WHEN li.produit_id IS NOT NULL
         THEN li.quantite_reelle + COALESCE(pa.qty,0) - COALESCE(pp.qty,0)
         ELSE COALESCE(aa.qty,0) - COALESCE(ap.qty,0)
       END as total_stock
     FROM labo_pt_selections lps
     LEFT JOIN last_inv li  ON li.produit_id = lps.produit_id
     LEFT JOIN post_appro pa ON pa.produit_id = lps.produit_id
     LEFT JOIN post_pertes pp ON pp.produit_id = lps.produit_id
     LEFT JOIN all_appro aa ON aa.produit_id = lps.produit_id
     LEFT JOIN all_pertes ap ON ap.produit_id = lps.produit_id
     WHERE lps.labo_id = $1`,
    [laboId]
  );
  const map = {};
  for (const x of r.rows) map[x.produit_id] = parseFloat(x.total_stock) || 0;
  return map;
}

// ─── [K3] laboController.getLaboStock :671-809 — quantité PT (net miroir) ─────
async function legacyGetLaboPTQuantites(db, laboId) {
  const r = await db.query(
    `WITH last_inv AS (
       SELECT DISTINCT ON (produit_id)
         produit_id, quantite_reelle, date_inventaire
       FROM inventaires
       WHERE labo_id = $1 AND produit_id IS NOT NULL
       ORDER BY produit_id, date_inventaire DESC, created_at DESC
     ),
     post_appro AS (
       SELECT slpt.produit_id, SUM(slpt.quantite) as qty
       FROM stock_labo_pt_daily slpt
       JOIN last_inv li ON li.produit_id = slpt.produit_id AND slpt.date_appro >= li.date_inventaire
       WHERE slpt.labo_id = $1
       GROUP BY slpt.produit_id
     ),
     post_pertes AS (
       SELECT lp.produit_id, SUM(lp.quantite) as qty
       FROM labo_pertes lp
       JOIN last_inv li ON li.produit_id = lp.produit_id AND lp.date_perte >= li.date_inventaire
       WHERE lp.labo_id = $1 AND lp.produit_id IS NOT NULL
       GROUP BY lp.produit_id
     ),
     all_appro AS (
       SELECT produit_id, SUM(quantite) as qty
       FROM stock_labo_pt_daily
       WHERE labo_id = $1
       GROUP BY produit_id
     ),
     all_pertes AS (
       SELECT produit_id, SUM(quantite) as qty
       FROM labo_pertes
       WHERE labo_id = $1 AND produit_id IS NOT NULL
       GROUP BY produit_id
     ),
     post_ventes_ach AS (
       SELECT cal.article_id AS produit_id, SUM(cal.quantite_unites) as qty
       FROM commande_acheteur_lignes cal
       JOIN commandes_acheteur ca ON ca.id = cal.commande_id
       JOIN last_inv li ON li.produit_id = cal.article_id AND COALESCE(ca.date_expedition, ca.date_commande) >= li.date_inventaire
       WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree') AND cal.article_type = 'produit'
       GROUP BY cal.article_id
     ),
     all_ventes_ach AS (
       SELECT cal.article_id AS produit_id, SUM(cal.quantite_unites) as qty
       FROM commande_acheteur_lignes cal
       JOIN commandes_acheteur ca ON ca.id = cal.commande_id
       WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree') AND cal.article_type = 'produit'
       GROUP BY cal.article_id
     )
     SELECT lps.produit_id,
            li.quantite_reelle       as inv_qty,
            COALESCE(pa.qty, 0)      as post_appro_qty,
            COALESCE(pp.qty, 0)      as post_pertes_qty,
            COALESCE(aa.qty, 0)      as all_appro_qty,
            COALESCE(ap.qty, 0)      as all_pertes_qty,
            COALESCE(pva.qty, 0)     as post_ventes_ach_qty,
            COALESCE(ava.qty, 0)     as all_ventes_ach_qty
     FROM labo_pt_selections lps
     LEFT JOIN last_inv li        ON li.produit_id  = lps.produit_id
     LEFT JOIN post_appro pa      ON pa.produit_id  = lps.produit_id
     LEFT JOIN post_pertes pp     ON pp.produit_id  = lps.produit_id
     LEFT JOIN all_appro aa      ON aa.produit_id  = lps.produit_id
     LEFT JOIN all_pertes ap     ON ap.produit_id  = lps.produit_id
     LEFT JOIN post_ventes_ach pva ON pva.produit_id = lps.produit_id
     LEFT JOIN all_ventes_ach ava ON ava.produit_id = lps.produit_id
     WHERE lps.labo_id = $1`,
    [laboId]
  );
  const map = {};
  for (const x of r.rows) {
    const hasInv = x.inv_qty !== null;
    // :807-809
    map[x.produit_id] = hasInv
      ? parseFloat(x.inv_qty) + (parseFloat(x.post_appro_qty) || 0) - (parseFloat(x.post_pertes_qty) || 0) - (parseFloat(x.post_ventes_ach_qty) || 0)
      : (parseFloat(x.all_appro_qty) || 0) - (parseFloat(x.all_pertes_qty) || 0) - (parseFloat(x.all_ventes_ach_qty) || 0);
  }
  return map;
}

module.exports = {
  legacyStockCourant,
  legacyStockPTCourant,
  legacyLaboArticlesBaseline,
  legacyActiviteArticlesBaseline,
  legacyPtPrixCalcule,
  legacyPmpDeduction,
  legacyBuildMpPriceMapLabo,
  legacyInventaireLaboArticles,
  legacyInventaireLaboPT,
  legacyGetLaboPTQuantites,
};
