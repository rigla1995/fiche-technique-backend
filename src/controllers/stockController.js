const pool = require('../config/database');
const ExcelJS = require('exceljs');
const { isoDate, todayStr } = require('../utils/dateUtils');
const { buildHistoriqueApproPdf } = require('../services/histoPdfService');

// ─── Stock Client (independant) ──────────────────────────────────────────────

const getStockClient = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie,
              i.seuil_min,
              COALESCE(SUM(scd.quantite) FILTER (WHERE date_trunc('month', scd.date_appro) = date_trunc('month', CURRENT_DATE)), 0) as total_quantite,
              last_scd.prix_unitaire,
              last_scd.date_appro,
              last_scd.fournisseur_id as last_fournisseur_id,
              last_scd.ref_facture    as last_ref_facture,
              COALESCE(
                AVG(scd.prix_unitaire) FILTER (WHERE date_trunc('month', scd.date_appro) = date_trunc('month', CURRENT_DATE) AND scd.quantite > 0)
                * SUM(scd.quantite) FILTER (WHERE date_trunc('month', scd.date_appro) = date_trunc('month', CURRENT_DATE))
              , 0) as cout_total
       FROM articles i
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN stock_client_daily scd ON scd.ingredient_id = i.id AND scd.client_id = $1
       LEFT JOIN LATERAL (
         SELECT prix_unitaire, date_appro, fournisseur_id, ref_facture
         FROM stock_client_daily
         WHERE client_id = $1 AND ingredient_id = i.id
         ORDER BY date_appro DESC, id DESC LIMIT 1
       ) last_scd ON true
       WHERE i.client_id = $1
       GROUP BY i.id, i.nom, u.nom, c.nom, i.seuil_min,
                last_scd.prix_unitaire, last_scd.date_appro, last_scd.fournisseur_id, last_scd.ref_facture
       ORDER BY categorie NULLS LAST, i.nom`,
      [req.user.gerant_parent_id || req.user.id]
    );

    // Fetch PT products for this client — using PMP since last inventory
    const ptPrixRes = await pool.query(`
      SELECT pi.produit_id,
        BOOL_OR(lp.prix_unitaire IS NULL AND pi.portion > 0) as prix_partiel,
        SUM(pi.portion * COALESCE(lp.prix_unitaire, 0)) as prix_dtu
      FROM produit_ingredients pi
      LEFT JOIN LATERAL (
        SELECT SUM(scd.quantite * scd.prix_unitaire) / NULLIF(SUM(scd.quantite), 0) as prix_unitaire
        FROM stock_client_daily scd
        WHERE scd.client_id = $1
          AND scd.ingredient_id = pi.ingredient_id
          AND scd.quantite > 0
          AND scd.prix_unitaire IS NOT NULL
          AND scd.type_appro IN ('manuel', 'transfert')
          AND scd.date_appro >= COALESCE(
            (SELECT date_inventaire FROM inventaires
             WHERE client_id = $1 AND ingredient_id = pi.ingredient_id
             ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
            (SELECT MIN(date_appro) FROM stock_client_daily
             WHERE client_id = $1 AND ingredient_id = pi.ingredient_id AND quantite > 0)
          )
      ) lp ON true
      WHERE pi.produit_id IN (SELECT id FROM produits WHERE client_id = $1 AND is_stock_ingredient = TRUE)
      GROUP BY pi.produit_id
    `, [req.user.gerant_parent_id || req.user.id]);
    const ptPrixMap = {};
    for (const r of ptPrixRes.rows) {
      ptPrixMap[r.produit_id] = { prixDtu: parseFloat(r.prix_dtu) || 0, prixPartiel: r.prix_partiel };
    }

    const ptRes = await pool.query(`
      SELECT p.id as produit_id, p.nom, p.seuil_min_pt,
             last_spt.date_appro   as last_date_appro,
             last_spt.prix_calcule as last_prix_calcule
      FROM produits p
      LEFT JOIN LATERAL (
        SELECT date_appro, prix_calcule FROM stock_produits_transformes
        WHERE produit_id = p.id AND client_id = $1
        ORDER BY date_appro DESC LIMIT 1
      ) last_spt ON true
      WHERE p.client_id = $1 AND p.is_stock_ingredient = TRUE
      ORDER BY p.nom
    `, [req.user.gerant_parent_id || req.user.id]);

    // ── Ingredient baseline: last current-year inv + post-inv appros - pertes ──
    const invBaselineCliRes = await pool.query(
      `WITH last_inv AS (
         SELECT DISTINCT ON (ingredient_id)
           ingredient_id, quantite_reelle, date_inventaire
         FROM inventaires
         WHERE client_id = $1 AND ingredient_id IS NOT NULL
         ORDER BY ingredient_id, date_inventaire DESC, created_at DESC
       ),
       post_appro AS (
         SELECT scd.ingredient_id, SUM(scd.quantite) as qty
         FROM stock_client_daily scd
         JOIN last_inv li ON li.ingredient_id = scd.ingredient_id AND scd.date_appro >= li.date_inventaire
         WHERE scd.client_id = $1
         GROUP BY scd.ingredient_id
       ),
       post_pertes AS (
         SELECT cp.ingredient_id, SUM(cp.quantite) as qty
         FROM client_pertes cp
         JOIN last_inv li ON li.ingredient_id = cp.ingredient_id AND cp.date_perte >= li.date_inventaire
         WHERE cp.client_id = $1 AND cp.ingredient_id IS NOT NULL
         GROUP BY cp.ingredient_id
       ),
       post_pt_usage AS (
         SELECT scd.ingredient_id, SUM(ABS(scd.quantite)) as qty
         FROM stock_client_daily scd
         JOIN last_inv li ON li.ingredient_id = scd.ingredient_id AND scd.date_appro >= li.date_inventaire
         WHERE scd.client_id = $1 AND scd.quantite < 0
         GROUP BY scd.ingredient_id
       ),
       avg_prix_post AS (
         SELECT scd.ingredient_id, AVG(scd.prix_unitaire) as avg_prix
         FROM stock_client_daily scd
         JOIN last_inv li ON li.ingredient_id = scd.ingredient_id AND scd.date_appro >= li.date_inventaire
         WHERE scd.client_id = $1 AND scd.quantite > 0 AND scd.prix_unitaire IS NOT NULL
         GROUP BY scd.ingredient_id
       ),
       all_appro AS (
         SELECT ingredient_id, SUM(quantite) as qty
         FROM stock_client_daily
         WHERE client_id = $1
         GROUP BY ingredient_id
       ),
       all_pertes AS (
         SELECT ingredient_id, SUM(quantite) as qty
         FROM client_pertes
         WHERE client_id = $1 AND ingredient_id IS NOT NULL
         GROUP BY ingredient_id
       ),
       all_pt_usage AS (
         SELECT ingredient_id, SUM(ABS(quantite)) as qty
         FROM stock_client_daily
         WHERE client_id = $1 AND quantite < 0
         GROUP BY ingredient_id
       ),
       avg_prix_all AS (
         SELECT ingredient_id, AVG(prix_unitaire) as avg_prix
         FROM stock_client_daily
         WHERE client_id = $1 AND quantite > 0 AND prix_unitaire IS NOT NULL
         GROUP BY ingredient_id
       )
       SELECT a.id AS ingredient_id,
              li.quantite_reelle        as inv_qty,
              li.date_inventaire        as inv_date,
              COALESCE(pa.qty, 0)       as post_appro_qty,
              COALESCE(pp.qty, 0)       as post_pertes_qty,
              COALESCE(ppu.qty, 0)      as post_pt_usage_qty,
              app.avg_prix              as avg_prix_post,
              COALESCE(aa.qty, 0)       as all_appro_qty,
              COALESCE(ap.qty, 0)       as all_pertes_qty,
              COALESCE(apu.qty, 0)      as all_pt_usage_qty,
              apy.avg_prix              as avg_prix_all
       FROM articles a
       LEFT JOIN last_inv li        ON li.ingredient_id = a.id
       LEFT JOIN post_appro pa      ON pa.ingredient_id = a.id
       LEFT JOIN post_pertes pp     ON pp.ingredient_id = a.id
       LEFT JOIN post_pt_usage ppu  ON ppu.ingredient_id = a.id
       LEFT JOIN avg_prix_post app  ON app.ingredient_id = a.id
       LEFT JOIN all_appro aa      ON aa.ingredient_id = a.id
       LEFT JOIN all_pertes ap     ON ap.ingredient_id = a.id
       LEFT JOIN all_pt_usage apu  ON apu.ingredient_id = a.id
       LEFT JOIN avg_prix_all apy  ON apy.ingredient_id = a.id
       WHERE a.client_id = $1`,
      [req.user.gerant_parent_id || req.user.id]
    );
    const invBaselineCliMap = {};
    for (const r of invBaselineCliRes.rows) {
      invBaselineCliMap[r.ingredient_id] = {
        hasInv: r.inv_qty !== null,
        invQty: r.inv_qty !== null ? parseFloat(r.inv_qty) : 0,
        invDate: r.inv_date ? isoDate(r.inv_date) : null,
        postApproQty: parseFloat(r.post_appro_qty) || 0,
        postPertesQty: parseFloat(r.post_pertes_qty) || 0,
        postPtUsageQty: parseFloat(r.post_pt_usage_qty) || 0,
        avgPrixPost: r.avg_prix_post !== null ? parseFloat(r.avg_prix_post) : null,
        allApproQty: parseFloat(r.all_appro_qty) || 0,
        allPertesQty: parseFloat(r.all_pertes_qty) || 0,
        allPtUsageQty: parseFloat(r.all_pt_usage_qty) || 0,
        avgPrixAll: r.avg_prix_all !== null ? parseFloat(r.avg_prix_all) : null,
      };
    }

    // ── PT baseline for client ────────────────────────────────────────────────
    const ptBaselineCliRes = await pool.query(
      `WITH last_inv AS (
         SELECT DISTINCT ON (produit_id)
           produit_id, quantite_reelle, date_inventaire
         FROM inventaires
         WHERE client_id = $1 AND produit_id IS NOT NULL
         ORDER BY produit_id, date_inventaire DESC, created_at DESC
       ),
       post_appro AS (
         SELECT spt.produit_id, SUM(spt.quantite) as qty
         FROM stock_produits_transformes spt
         JOIN last_inv li ON li.produit_id = spt.produit_id AND spt.date_appro >= li.date_inventaire
         WHERE spt.client_id = $1
         GROUP BY spt.produit_id
       ),
       post_pertes AS (
         SELECT cp.produit_id, SUM(cp.quantite) as qty
         FROM client_pertes cp
         JOIN last_inv li ON li.produit_id = cp.produit_id AND cp.date_perte >= li.date_inventaire
         WHERE cp.client_id = $1 AND cp.produit_id IS NOT NULL
         GROUP BY cp.produit_id
       ),
       avg_prix_post AS (
         SELECT spt.produit_id, AVG(spt.prix_calcule) as avg_prix
         FROM stock_produits_transformes spt
         JOIN last_inv li ON li.produit_id = spt.produit_id AND spt.date_appro >= li.date_inventaire
         WHERE spt.client_id = $1 AND spt.prix_calcule IS NOT NULL
         GROUP BY spt.produit_id
       ),
       all_appro AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM stock_produits_transformes
         WHERE client_id = $1
         GROUP BY produit_id
       ),
       all_pertes AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM client_pertes
         WHERE client_id = $1 AND produit_id IS NOT NULL
         GROUP BY produit_id
       ),
       avg_prix_all AS (
         SELECT produit_id, AVG(prix_calcule) as avg_prix
         FROM stock_produits_transformes
         WHERE client_id = $1 AND prix_calcule IS NOT NULL
         GROUP BY produit_id
       )
       SELECT p.id as produit_id,
              li.quantite_reelle        as inv_qty,
              li.date_inventaire        as inv_date,
              COALESCE(pa.qty, 0)       as post_appro_qty,
              COALESCE(pp.qty, 0)       as post_pertes_qty,
              app.avg_prix              as avg_prix_post,
              COALESCE(aa.qty, 0)       as all_appro_qty,
              COALESCE(ap.qty, 0)       as all_pertes_qty,
              apy.avg_prix              as avg_prix_all
       FROM produits p
       LEFT JOIN last_inv li        ON li.produit_id = p.id
       LEFT JOIN post_appro pa      ON pa.produit_id = p.id
       LEFT JOIN post_pertes pp     ON pp.produit_id = p.id
       LEFT JOIN avg_prix_post app  ON app.produit_id = p.id
       LEFT JOIN all_appro aa      ON aa.produit_id = p.id
       LEFT JOIN all_pertes ap     ON ap.produit_id = p.id
       LEFT JOIN avg_prix_all apy  ON apy.produit_id = p.id
       WHERE p.client_id = $1 AND p.is_stock_ingredient = TRUE`,
      [req.user.gerant_parent_id || req.user.id]
    );
    const ptBaselineCliMap = {};
    for (const r of ptBaselineCliRes.rows) {
      ptBaselineCliMap[r.produit_id] = {
        hasInv: r.inv_qty !== null,
        invQty: r.inv_qty !== null ? parseFloat(r.inv_qty) : 0,
        invDate: r.inv_date ? isoDate(r.inv_date) : null,
        postApproQty: parseFloat(r.post_appro_qty) || 0,
        postPertesQty: parseFloat(r.post_pertes_qty) || 0,
        avgPrixPost: r.avg_prix_post !== null ? parseFloat(r.avg_prix_post) : null,
        allApproQty: parseFloat(r.all_appro_qty) || 0,
        allPertesQty: parseFloat(r.all_pertes_qty) || 0,
        avgPrixAll: r.avg_prix_all !== null ? parseFloat(r.avg_prix_all) : null,
      };
    }

    const ptRows = ptRes.rows.map((r) => {
      const pInfo = ptPrixMap[r.produit_id] || { prixDtu: 0, prixPartiel: false };
      const pb = ptBaselineCliMap[r.produit_id] || {};
      const quantite = pb.hasInv
        ? pb.invQty + pb.postApproQty - pb.postPertesQty
        : pb.allApproQty - pb.allPertesQty;
      const avgPrix = pb.hasInv ? (pb.avgPrixPost ?? pb.avgPrixAll ?? null) : (pb.avgPrixAll ?? null);
      const pertesDepuisInv = pb.hasInv ? pb.postPertesQty : pb.allPertesQty;
      return {
        ingredientId: -(r.produit_id),
        produitId: r.produit_id,
        isPT: true,
        nom: r.nom,
        unite: 'unité',
        categorie: 'Produits Transformés',
        prixUnitaire: pInfo.prixDtu,
        prixPartiel: pInfo.prixPartiel,
        quantite,
        totalQuantite: quantite,
        dateAppro: isoDate(r.last_date_appro),
        seuilMin: r.seuil_min_pt !== null ? parseFloat(r.seuil_min_pt) : null,
        coutTotal: avgPrix !== null && quantite > 0 ? quantite * avgPrix : (pInfo.prixDtu > 0 && quantite > 0 ? pInfo.prixDtu * quantite : 0),
        lastFournisseurId: null,
        lastRefFacture: null,
        lastInvDate: pb.hasInv ? pb.invDate : null,
        lastInvQty: pb.hasInv ? pb.invQty : null,
        pertesDepuisInv,
        ptUsageDepuisInv: 0,
      };
    });

    res.json([...result.rows.map((row) => {
      const b = invBaselineCliMap[row.ingredient_id] || {};
      const quantite = b.hasInv
        ? b.invQty + b.postApproQty - b.postPertesQty
        : b.allApproQty - b.allPertesQty;
      const avgPrix = b.hasInv ? (b.avgPrixPost ?? b.avgPrixAll ?? null) : (b.avgPrixAll ?? null);
      const pertesDepuisInv = b.hasInv ? b.postPertesQty : b.allPertesQty;
      const ptUsageDepuisInv = b.hasInv ? b.postPtUsageQty : b.allPtUsageQty;
      return {
        ingredientId: row.ingredient_id,
        nom: row.nom,
        unite: row.unite_nom,
        categorie: row.categorie,
        prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
        quantite,
        totalQuantite: quantite,
        coutTotal: avgPrix !== null && quantite > 0 ? quantite * avgPrix : null,
        dateAppro: isoDate(row.date_appro),
        seuilMin: row.seuil_min !== null ? parseFloat(row.seuil_min) : null,
        lastFournisseurId: row.last_fournisseur_id ?? null,
        lastRefFacture: row.last_ref_facture ?? null,
        lastInvDate: b.hasInv ? b.invDate : null,
        lastInvQty: b.hasInv ? b.invQty : null,
        pertesDepuisInv,
        ptUsageDepuisInv,
      };
    }), ...ptRows]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockClient = async (req, res) => {
  const { ingredientId } = req.params;
  const { quantite, prixUnitaire, dateAppro, fournisseurId, refFacture, tauxTva } = req.body;
  const da = dateAppro || todayStr();
  const tva = tauxTva != null ? parseFloat(tauxTva) : null;
  const prixUnitaireTva = tva != null && prixUnitaire != null ? parseFloat(prixUnitaire) * (1 + tva / 100) : null;

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    await pool.query(
      `INSERT INTO stock_client_daily
         (client_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture, taux_tva, prix_unitaire_tva, updated_at, created_by)
       VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, $8, $9, NOW(), $10)`,
      [req.user.gerant_parent_id || req.user.id, ingredientId, da, quantite ?? null, prixUnitaire ?? null,
       fournisseurId ?? null, refFacture ?? null, tva, prixUnitaireTva, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getStockClientSummary = async (req, res) => {
  try {
    const [fourn, appro] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM fournisseurs WHERE client_id = $1`, [req.user.gerant_parent_id || req.user.id]),
      pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM stock_client_daily WHERE client_id = $1
         ) AS has_appros`,
        [req.user.gerant_parent_id || req.user.id]
      ),
    ]);
    res.json({
      hasFournisseurs: parseInt(fourn.rows[0].count) > 0,
      hasAppros: appro.rows[0].has_appros ?? false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Stock Entreprise ──────────────────────────────────────────────────────

const getStockEntreprise = async (req, res) => {
  const { activiteId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    const result = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie,
              ais.seuil_min,
              COALESCE(SUM(sed.quantite) FILTER (WHERE date_trunc('month', sed.date_appro) = date_trunc('month', CURRENT_DATE)), 0) as total_quantite,
              last_sed.prix_unitaire,
              last_sed.date_appro,
              last_sed.fournisseur_id as last_fournisseur_id,
              last_sed.ref_facture    as last_ref_facture,
              last_sed.type_appro     as last_type_appro,
              COALESCE(
                AVG(sed.prix_unitaire) FILTER (WHERE date_trunc('month', sed.date_appro) = date_trunc('month', CURRENT_DATE) AND sed.quantite > 0)
                * SUM(sed.quantite) FILTER (WHERE date_trunc('month', sed.date_appro) = date_trunc('month', CURRENT_DATE))
              , 0) as cout_total
       FROM activite_ingredient_selections ais
       JOIN articles i ON ais.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN stock_entreprise_daily sed ON sed.ingredient_id = i.id AND sed.activite_id = $1
       LEFT JOIN LATERAL (
         SELECT prix_unitaire, date_appro, fournisseur_id, ref_facture, type_appro
         FROM stock_entreprise_daily
         WHERE activite_id = $1 AND ingredient_id = i.id
         ORDER BY date_appro DESC, id DESC LIMIT 1
       ) last_sed ON true
       WHERE ais.activite_id = $1
       GROUP BY i.id, i.nom, u.nom, c.nom, ais.seuil_min,
                last_sed.prix_unitaire, last_sed.date_appro, last_sed.fournisseur_id,
                last_sed.ref_facture, last_sed.type_appro
       ORDER BY categorie NULLS LAST, i.nom`,
      [activiteId]
    );

    // Fetch PT products for this activite (prix only) — using PMP since last inventory
    const ptPrixRes = await pool.query(`
      SELECT pi.produit_id,
        BOOL_OR(lp.prix_unitaire IS NULL AND pi.portion > 0) as prix_partiel,
        SUM(pi.portion * COALESCE(lp.prix_unitaire, 0)) as prix_dtu
      FROM produit_ingredients pi
      LEFT JOIN LATERAL (
        SELECT SUM(sed.quantite * sed.prix_unitaire) / NULLIF(SUM(sed.quantite), 0) as prix_unitaire
        FROM stock_entreprise_daily sed
        WHERE sed.activite_id = $1
          AND sed.ingredient_id = pi.ingredient_id
          AND sed.quantite > 0
          AND sed.prix_unitaire IS NOT NULL
          AND sed.type_appro IN ('manuel', 'transfert')
          AND sed.date_appro >= COALESCE(
            (SELECT date_inventaire FROM inventaires
             WHERE activite_id = $1 AND ingredient_id = pi.ingredient_id
             ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
            (SELECT MIN(date_appro) FROM stock_entreprise_daily
             WHERE activite_id = $1 AND ingredient_id = pi.ingredient_id AND quantite > 0)
          )
      ) lp ON true
      WHERE pi.produit_id IN (
        SELECT pas.produit_id FROM produit_activite_stock pas
        JOIN produits p ON p.id = pas.produit_id
        WHERE pas.activite_id = $1 AND p.is_stock_ingredient = TRUE
      )
      GROUP BY pi.produit_id
    `, [activiteId]);
    const ptPrixMap = {};
    for (const r of ptPrixRes.rows) {
      ptPrixMap[r.produit_id] = { prixDtu: parseFloat(r.prix_dtu) || 0, prixPartiel: r.prix_partiel };
    }

    const ptRes = await pool.query(`
      SELECT p.id as produit_id, p.nom, p.seuil_min_pt,
             last_spt.date_appro   as last_date_appro,
             last_spt.prix_calcule as last_prix_calcule
      FROM produits p
      LEFT JOIN LATERAL (
        SELECT date_appro, prix_calcule FROM stock_produits_transformes
        WHERE produit_id = p.id AND activite_id = $1
        ORDER BY date_appro DESC LIMIT 1
      ) last_spt ON true
      JOIN produit_activite_stock pas ON pas.produit_id = p.id AND pas.activite_id = $1
      ORDER BY p.nom
    `, [activiteId]);

    // ── Ingredient baseline: last current-year inv + post-inv flows + pertes ──
    const invBaselineRes = await pool.query(
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
         SELECT sed.ingredient_id, SUM(ABS(sed.quantite)) as qty
         FROM stock_entreprise_daily sed
         JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
         WHERE sed.activite_id = $1 AND sed.type_appro = 'vente'
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
         SELECT ingredient_id, SUM(ABS(quantite)) as qty
         FROM stock_entreprise_daily
         WHERE activite_id = $1 AND type_appro = 'vente'
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
    const invBaselineMap = {};
    for (const r of invBaselineRes.rows) {
      invBaselineMap[r.ingredient_id] = {
        hasInv: r.inv_qty !== null,
        invQty: r.inv_qty !== null ? parseFloat(r.inv_qty) : 0,
        invDate: r.inv_date ? isoDate(r.inv_date) : null,
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
    }

    // ── PT baseline: last current-year inv + post-inv appros - pertes ─────────
    const ptBaselineRes = await pool.query(
      `WITH last_inv AS (
         SELECT DISTINCT ON (produit_id)
           produit_id, quantite_reelle, date_inventaire
         FROM inventaires
         WHERE activite_id = $1 AND produit_id IS NOT NULL
         ORDER BY produit_id, date_inventaire DESC, created_at DESC
       ),
       post_appro AS (
         SELECT spt.produit_id, SUM(spt.quantite) as qty
         FROM stock_produits_transformes spt
         JOIN last_inv li ON li.produit_id = spt.produit_id AND spt.date_appro >= li.date_inventaire
         WHERE spt.activite_id = $1
         GROUP BY spt.produit_id
       ),
       post_pertes AS (
         SELECT p.produit_id, SUM(p.quantite) as qty
         FROM pertes p
         JOIN last_inv li ON li.produit_id = p.produit_id AND p.date_perte >= li.date_inventaire
         WHERE p.activite_id = $1 AND p.produit_id IS NOT NULL
         GROUP BY p.produit_id
       ),
       post_ventes AS (
         SELECT spt.produit_id, SUM(ABS(spt.quantite)) as qty
         FROM stock_produits_transformes spt
         JOIN last_inv li ON li.produit_id = spt.produit_id AND spt.date_appro >= li.date_inventaire
         WHERE spt.activite_id = $1 AND spt.quantite < 0
         GROUP BY spt.produit_id
       ),
       avg_prix_post AS (
         SELECT spt.produit_id, AVG(spt.prix_calcule) as avg_prix
         FROM stock_produits_transformes spt
         JOIN last_inv li ON li.produit_id = spt.produit_id AND spt.date_appro >= li.date_inventaire
         WHERE spt.activite_id = $1 AND spt.prix_calcule IS NOT NULL
         GROUP BY spt.produit_id
       ),
       all_appro AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM stock_produits_transformes
         WHERE activite_id = $1
         GROUP BY produit_id
       ),
       all_ventes AS (
         SELECT produit_id, SUM(ABS(quantite)) as qty
         FROM stock_produits_transformes
         WHERE activite_id = $1 AND quantite < 0
         GROUP BY produit_id
       ),
       all_pertes AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM pertes
         WHERE activite_id = $1 AND produit_id IS NOT NULL
         GROUP BY produit_id
       ),
       avg_prix_all AS (
         SELECT produit_id, AVG(prix_calcule) as avg_prix
         FROM stock_produits_transformes
         WHERE activite_id = $1 AND prix_calcule IS NOT NULL
         GROUP BY produit_id
       ),
       pt_list AS (
         SELECT pas.produit_id FROM produit_activite_stock pas
         JOIN produits p ON p.id = pas.produit_id
         WHERE pas.activite_id = $1 AND p.is_stock_ingredient = TRUE
       )
       SELECT pl.produit_id,
              li.quantite_reelle        as inv_qty,
              li.date_inventaire        as inv_date,
              COALESCE(pa.qty, 0)       as post_appro_qty,
              COALESCE(pp.qty, 0)       as post_pertes_qty,
              COALESCE(pv.qty, 0)       as post_vente_qty,
              app.avg_prix              as avg_prix_post,
              COALESCE(aa.qty, 0)       as all_appro_qty,
              COALESCE(av.qty, 0)       as all_vente_qty,
              COALESCE(ap.qty, 0)       as all_pertes_qty,
              apy.avg_prix              as avg_prix_all
       FROM pt_list pl
       LEFT JOIN last_inv li        ON li.produit_id = pl.produit_id
       LEFT JOIN post_appro pa      ON pa.produit_id = pl.produit_id
       LEFT JOIN post_pertes pp     ON pp.produit_id = pl.produit_id
       LEFT JOIN post_ventes pv     ON pv.produit_id = pl.produit_id
       LEFT JOIN avg_prix_post app  ON app.produit_id = pl.produit_id
       LEFT JOIN all_appro aa       ON aa.produit_id = pl.produit_id
       LEFT JOIN all_ventes av      ON av.produit_id = pl.produit_id
       LEFT JOIN all_pertes ap      ON ap.produit_id = pl.produit_id
       LEFT JOIN avg_prix_all apy   ON apy.produit_id = pl.produit_id`,
      [activiteId]
    );
    const ptBaselineMap = {};
    for (const r of ptBaselineRes.rows) {
      ptBaselineMap[r.produit_id] = {
        hasInv: r.inv_qty !== null,
        invQty: r.inv_qty !== null ? parseFloat(r.inv_qty) : 0,
        invDate: r.inv_date ? isoDate(r.inv_date) : null,
        postApproQty: parseFloat(r.post_appro_qty) || 0,
        postPertesQty: parseFloat(r.post_pertes_qty) || 0,
        postVenteQty: parseFloat(r.post_vente_qty) || 0,
        avgPrixPost: r.avg_prix_post !== null ? parseFloat(r.avg_prix_post) : null,
        allApproQty: parseFloat(r.all_appro_qty) || 0,
        allVenteQty: parseFloat(r.all_vente_qty) || 0,
        allPertesQty: parseFloat(r.all_pertes_qty) || 0,
        avgPrixAll: r.avg_prix_all !== null ? parseFloat(r.avg_prix_all) : null,
      };
    }

    const ptRows = ptRes.rows.map((r) => {
      const pInfo = ptPrixMap[r.produit_id] || { prixDtu: 0, prixPartiel: false };
      const pb = ptBaselineMap[r.produit_id] || {};
      const quantite = pb.hasInv
        ? pb.invQty + pb.postApproQty - pb.postPertesQty
        : pb.allApproQty - pb.allPertesQty;
      const avgPrix = pb.hasInv ? (pb.avgPrixPost ?? pb.avgPrixAll ?? null) : (pb.avgPrixAll ?? null);
      const pertesDepuisInv = pb.hasInv ? pb.postPertesQty : pb.allPertesQty;
      const venteDepuisInv = pb.hasInv ? pb.postVenteQty : pb.allVenteQty;
      return {
        ingredientId: -(r.produit_id),
        produitId: r.produit_id,
        isPT: true,
        nom: r.nom,
        unite: 'unité',
        categorie: 'Produits Transformés',
        prixUnitaire: pInfo.prixDtu,
        prixPartiel: pInfo.prixPartiel,
        quantite,
        totalQuantite: quantite,
        dateAppro: isoDate(r.last_date_appro),
        seuilMin: r.seuil_min_pt !== null ? parseFloat(r.seuil_min_pt) : null,
        coutTotal: avgPrix !== null && quantite > 0 ? quantite * avgPrix : (pInfo.prixDtu > 0 && quantite > 0 ? pInfo.prixDtu * quantite : 0),
        lastFournisseurId: null,
        lastRefFacture: null,
        lastInvDate: pb.hasInv ? pb.invDate : null,
        lastInvQty: pb.hasInv ? pb.invQty : null,
        pertesDepuisInv,
        ptUsageDepuisInv: 0,
        venteDepuisInv,
      };
    });

    res.json([...result.rows.map((row) => {
      const b = invBaselineMap[row.ingredient_id] || {};
      const quantite = b.hasInv
        ? b.invQty + b.postApproQty - b.postPertesQty
        : b.allApproQty - b.allPertesQty;
      const pertesDepuisInv = b.hasInv ? b.postPertesQty : b.allPertesQty;
      const ptUsageDepuisInv = b.hasInv ? b.postPtUsageQty : b.allPtUsageQty;
      const venteDepuisInv = b.hasInv ? b.postVenteQty : b.allVenteQty;
      const transfertsDepuisAppro = b.hasInv ? b.postTransfertsInQty : b.allTransfertsInQty;
      let coutTotal = 0;
      let coutTotalTTC = 0;
      if (b.hasInv) {
        const coutInvHT = (b.invQty > 0 && b.pmpHistHT !== null) ? b.invQty * b.pmpHistHT : 0;
        const coutInvTTC = (b.invQty > 0 && b.pmpHistTTC !== null) ? b.invQty * b.pmpHistTTC : (b.invQty > 0 && b.pmpHistHT !== null) ? b.invQty * b.pmpHistHT : 0;
        const totalCostInHT = coutInvHT + (b.approCostPostHT || 0) + (b.transferCostPostHT || 0);
        const totalCostInTTC = coutInvTTC + (b.approCostPostTTC || 0) + (b.transferCostPostTTC || 0);
        const totalQtyIn = b.invQty + (b.approCostPostQty || 0) + (b.transferCostPostQty || 0);
        const pmpHT = totalQtyIn > 0 ? totalCostInHT / totalQtyIn : null;
        const pmpTTC = totalQtyIn > 0 ? totalCostInTTC / totalQtyIn : null;
        coutTotal = pmpHT !== null && quantite > 0 ? Math.round(quantite * pmpHT * 1000) / 1000 : 0;
        coutTotalTTC = pmpTTC !== null && quantite > 0 ? Math.round(quantite * pmpTTC * 1000) / 1000 : 0;
      } else {
        const totalQtyIn = (b.approCostAllQty || 0) + (b.transferCostAllQty || 0);
        const totalCostInHT = (b.approCostAllHT || 0) + (b.transferCostAllHT || 0);
        const totalCostInTTC = (b.approCostAllTTC || 0) + (b.transferCostAllTTC || 0);
        const pmpHT = totalQtyIn > 0 ? totalCostInHT / totalQtyIn : null;
        const pmpTTC = totalQtyIn > 0 ? totalCostInTTC / totalQtyIn : null;
        coutTotal = pmpHT !== null && quantite > 0 ? Math.round(quantite * pmpHT * 1000) / 1000 : 0;
        coutTotalTTC = pmpTTC !== null && quantite > 0 ? Math.round(quantite * pmpTTC * 1000) / 1000 : 0;
      }
      return {
        ingredientId: row.ingredient_id,
        nom: row.nom,
        unite: row.unite_nom,
        categorie: row.categorie,
        seuilMin: row.seuil_min !== null ? parseFloat(row.seuil_min) : null,
        prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
        quantite,
        totalQuantite: quantite,
        coutTotal,
        coutTotalTTC,
        dateAppro: isoDate(row.date_appro),
        lastFournisseurId: row.last_fournisseur_id ?? null,
        lastRefFacture: row.last_ref_facture ?? null,
        lastTypeAppro: row.last_type_appro ?? null,
        lastInvDate: b.hasInv ? b.invDate : null,
        lastInvQty: b.hasInv ? b.invQty : null,
        pertesDepuisInv,
        ptUsageDepuisInv,
        venteDepuisInv,
        transfertsDepuisAppro,
      };
    }), ...ptRows]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockEntreprise = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  const { quantite, prixUnitaire, dateAppro, fournisseurId, refFacture, tauxTva } = req.body;
  const da = dateAppro || todayStr();
  const tva = tauxTva != null ? parseFloat(tauxTva) : null;
  const prixUnitaireTva = tva != null && prixUnitaire != null ? parseFloat(prixUnitaire) * (1 + tva / 100) : null;

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    await pool.query(
      `INSERT INTO stock_entreprise_daily
         (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture, taux_tva, prix_unitaire_tva, updated_at, created_by)
       VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, $8, $9, NOW(), $10)`,
      [activiteId, ingredientId, da, quantite ?? null, prixUnitaire ?? null,
       fournisseurId ?? null, refFacture ?? null, tva, prixUnitaireTva, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateSeuilMin = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  const { seuilMin } = req.body;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    await pool.query(
      `UPDATE activite_ingredient_selections
       SET seuil_min = $1
       WHERE activite_id = $2 AND ingredient_id = $3`,
      [seuilMin ?? null, activiteId, ingredientId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── History ──────────────────────────────────────────────────────────────────

const getHistoryClient = async (req, res) => {
  const { ingredientId } = req.params;
  try {
    const result = await pool.query(
      `SELECT scd.date_appro, scd.quantite, scd.prix_unitaire, scd.type_appro,
              scd.ref_facture, f.nom as fournisseur_nom, scd.updated_at,
              scd.taux_tva, scd.prix_unitaire_tva
       FROM stock_client_daily scd
       LEFT JOIN fournisseurs f ON f.id = scd.fournisseur_id
       WHERE scd.client_id = $1 AND scd.ingredient_id = $2
       ORDER BY scd.date_appro DESC
       LIMIT 5`,
      [req.user.gerant_parent_id || req.user.id, ingredientId]
    );
    res.json(result.rows.map(mapHistEntry));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getHistoryEntreprise = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    const result = await pool.query(
      `SELECT sed.date_appro, sed.quantite, sed.prix_unitaire, sed.type_appro,
              sed.ref_facture, f.nom as fournisseur_nom, sed.updated_at,
              sed.taux_tva, sed.prix_unitaire_tva
       FROM stock_entreprise_daily sed
       LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
       WHERE sed.activite_id = $1 AND sed.ingredient_id = $2
       ORDER BY sed.date_appro DESC
       LIMIT 5`,
      [activiteId, ingredientId]
    );
    res.json(result.rows.map(mapHistEntry));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Historique Approvisionnement ─────────────────────────────────────────────

const getHistoriqueAppro = async (req, res) => {
  // Enforce activiteId scope for gérant accounts
  if (req.user.role === 'gerant' && req.user.gerant_activite_id) {
    req.query.activiteId = String(req.user.gerant_activite_id);
    delete req.query.activiteIds;
    delete req.query.entType;
  }
  const { activiteId, activiteIds: activiteIdsParam, entType, ingredientId, categorieId, startDate, endDate, fournisseurId, refFacture, ptOnly, ptProduitId } = req.query;
  const currentYear = new Date().getFullYear();

  try {
    if (activiteId || activiteIdsParam || entType) {
      // Resolve activiteIds list
      let activiteIds = [];
      if (activiteId) {
        const check = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE a.id = $1 AND pe.client_id = $2`,
          [activiteId, req.user.gerant_parent_id || req.user.id]
        );
        if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });
        activiteIds = [activiteId];
      } else if (activiteIdsParam) {
        // Comma-separated list of activiteIds
        const requested = activiteIdsParam.split(',').map(Number).filter(Boolean);
        const check = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE a.id = ANY($1) AND pe.client_id = $2`,
          [requested, req.user.gerant_parent_id || req.user.id]
        );
        activiteIds = check.rows.map((r) => r.id);
        if (activiteIds.length === 0) return res.json([]);
      } else if (entType) {
        // All activités for this client (optionally filtered by laboId)
        const clientId = req.user.gerant_parent_id || req.user.id;
        const entTypeParams = [clientId];
        let laboFilter = '';
        if (req.query.laboId) {
          entTypeParams.push(req.query.laboId);
          laboFilter = ` AND a.labo_id = $${entTypeParams.length}`;
        }
        const allRes = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE pe.client_id = $1${laboFilter}`,
          entTypeParams
        );
        activiteIds = allRes.rows.map((r) => r.id);
        if (activiteIds.length === 0) return res.json([]);
      }

      const idList = activiteIds.map((_, i) => `$${i + 1}`).join(',');
      const params = [...activiteIds, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND sed.ingredient_id = $${params.length}`; }
      else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND sed.date_appro >= $${params.length}`; }
      if (endDate) { params.push(endDate); extraWhere += ` AND sed.date_appro <= $${params.length}`; }
      if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND sed.fournisseur_id = $${params.length}`; }
      if (refFacture) { params.push(`%${refFacture}%`); extraWhere += ` AND sed.ref_facture ILIKE $${params.length}`; }

      const result = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.date_appro, sed.quantite, sed.prix_unitaire, sed.type_appro,
                sed.ref_facture, sed.fournisseur_id, f.nom as fournisseur_nom, sed.updated_at,
                sed.created_by, ub.nom as created_by_nom,
                sed.taux_tva, sed.prix_unitaire_tva,
                i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_entreprise_daily sed
         JOIN articles i ON i.id = sed.ingredient_id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
         LEFT JOIN utilisateurs ub ON ub.id = sed.created_by
         WHERE sed.activite_id IN (${idList}) AND EXTRACT(YEAR FROM sed.date_appro) = $${activiteIds.length + 1}${extraWhere}
         ORDER BY sed.date_appro DESC, i.nom`,
        params
      );

      let regularRows = result.rows.map(mapHistoriqueEntry);

      // Append PT entries if no category filter is active or ptOnly is requested
      if (ptOnly === 'true' || (!categorieId && !ingredientId)) {
        const ptParams = [...activiteIds];
        let ptWhere = `spt.activite_id IN (${idList})`;
        if (startDate) { ptParams.push(startDate); ptWhere += ` AND spt.date_appro >= $${ptParams.length}`; }
        if (endDate) { ptParams.push(endDate); ptWhere += ` AND spt.date_appro <= $${ptParams.length}`; }
        if (ptProduitId) { ptParams.push(ptProduitId); ptWhere += ` AND spt.produit_id = $${ptParams.length}`; }
        const ptResult = await pool.query(
          `SELECT spt.id, spt.activite_id, spt.date_appro, spt.quantite, spt.prix_calcule, spt.created_at, p.nom as produit_nom, p.id as produit_id
           FROM stock_produits_transformes spt
           JOIN produits p ON p.id = spt.produit_id
           WHERE ${ptWhere}
           ORDER BY spt.date_appro DESC`,
          ptParams
        );
        const ptEntries = ptResult.rows.map((spt) => ({
          id: spt.id,
          activiteId: spt.activite_id,
          dateAppro: isoDate(spt.date_appro),
          quantite: spt.quantite !== null ? parseFloat(spt.quantite) : null,
          prixUnitaire: spt.prix_calcule !== null ? parseFloat(spt.prix_calcule) : null,
          typeAppro: 'produit_transformé',
          refFacture: null,
          fournisseurId: null,
          fournisseurNom: null,
          updatedAt: spt.created_at,
          ingredientId: -(spt.produit_id),
          ingredientNom: spt.produit_nom,
          uniteNom: 'unité',
          categorieNom: 'Produits Transformés',
        }));
        if (ptOnly === 'true') {
          regularRows = ptEntries;
        } else {
          regularRows = [...regularRows, ...ptEntries].sort((a, b) => {
            if (!a.dateAppro) return 1;
            if (!b.dateAppro) return -1;
            return b.dateAppro.localeCompare(a.dateAppro);
          });
        }
      }

      res.json(regularRows);
    } else {
      const params = [req.user.gerant_parent_id || req.user.id, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND scd.ingredient_id = $${params.length}`; }
      else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND scd.date_appro >= $${params.length}`; }
      if (endDate) { params.push(endDate); extraWhere += ` AND scd.date_appro <= $${params.length}`; }
      if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND scd.fournisseur_id = $${params.length}`; }
      if (refFacture) { params.push(`%${refFacture}%`); extraWhere += ` AND scd.ref_facture ILIKE $${params.length}`; }

      const result = await pool.query(
        `SELECT scd.id, scd.date_appro, scd.quantite, scd.prix_unitaire, scd.type_appro,
                scd.ref_facture, scd.fournisseur_id, f.nom as fournisseur_nom, scd.updated_at,
                scd.created_by, ub.nom as created_by_nom,
                scd.taux_tva, scd.prix_unitaire_tva,
                i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_client_daily scd
         JOIN articles i ON i.id = scd.ingredient_id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         LEFT JOIN fournisseurs f ON f.id = scd.fournisseur_id
         LEFT JOIN utilisateurs ub ON ub.id = scd.created_by
         WHERE scd.client_id = $1 AND EXTRACT(YEAR FROM scd.date_appro) = $2${extraWhere}
         ORDER BY scd.date_appro DESC, i.nom`,
        params
      );

      let regularRows = result.rows.map(mapHistoriqueEntry);

      // Append PT entries if no category filter is active or ptOnly is requested
      if (ptOnly === 'true' || (!categorieId && !ingredientId)) {
        const ptParams = [req.user.gerant_parent_id || req.user.id];
        let ptWhere = `spt.client_id = $1`;
        if (startDate) { ptParams.push(startDate); ptWhere += ` AND spt.date_appro >= $${ptParams.length}`; }
        if (endDate) { ptParams.push(endDate); ptWhere += ` AND spt.date_appro <= $${ptParams.length}`; }
        if (ptProduitId) { ptParams.push(ptProduitId); ptWhere += ` AND spt.produit_id = $${ptParams.length}`; }
        const ptResult = await pool.query(
          `SELECT spt.id, spt.client_id, spt.date_appro, spt.quantite, spt.prix_calcule, spt.created_at, p.nom as produit_nom, p.id as produit_id
           FROM stock_produits_transformes spt
           JOIN produits p ON p.id = spt.produit_id
           WHERE ${ptWhere}
           ORDER BY spt.date_appro DESC`,
          ptParams
        );
        const ptEntries = ptResult.rows.map((spt) => ({
          id: spt.id,
          activiteId: null,
          dateAppro: isoDate(spt.date_appro),
          quantite: spt.quantite !== null ? parseFloat(spt.quantite) : null,
          prixUnitaire: spt.prix_calcule !== null ? parseFloat(spt.prix_calcule) : null,
          typeAppro: 'produit_transformé',
          refFacture: null,
          fournisseurId: null,
          fournisseurNom: null,
          updatedAt: spt.created_at,
          ingredientId: -(spt.produit_id),
          ingredientNom: spt.produit_nom,
          uniteNom: 'unité',
          categorieNom: 'Produits Transformés',
        }));
        if (ptOnly === 'true') {
          regularRows = ptEntries;
        } else {
          regularRows = [...regularRows, ...ptEntries].sort((a, b) => {
            if (!a.dateAppro) return 1;
            if (!b.dateAppro) return -1;
            return b.dateAppro.localeCompare(a.dateAppro);
          });
        }
      }

      res.json(regularRows);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/stock/historique/:id  (activiteId required for entreprise, clientId for independant)
const updateHistoriqueEntry = async (req, res) => {
  const { id } = req.params;
  const { quantite, prixUnitaire, fournisseurId, refFacture, isEntreprise } = req.body;
  try {
    if (isEntreprise) {
      // Verify ownership
      const check = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.ingredient_id, sed.quantite as old_quantite, sed.type_appro, sed.date_appro, sed.created_by
         FROM stock_entreprise_daily sed
         JOIN activites a ON a.id = sed.activite_id
         JOIN profil_entreprise pe ON pe.id = a.entreprise_id
         WHERE sed.id = $1 AND pe.client_id = $2`,
        [id, req.user.gerant_parent_id || req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
      const entry = check.rows[0];
      if (req.user.role === 'gerant' && entry.created_by !== req.user.id)
        return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres enregistrements.' });
      await pool.query(
        `UPDATE stock_entreprise_daily SET quantite=$1, prix_unitaire=$2, fournisseur_id=$3, ref_facture=$4, updated_at=NOW()
         WHERE id=$5`,
        [quantite ?? null, prixUnitaire ?? null, fournisseurId || null, refFacture || null, id]
      );
      // If transfert, adjust labo stock
      if (entry.type_appro === 'transfert') {
        const oldQty = parseFloat(entry.old_quantite) || 0;
        const newQty = parseFloat(quantite) || 0;
        const delta = oldQty - newQty;
        if (delta !== 0) {
          await pool.query(
            `UPDATE stock_labo_daily SET quantite = COALESCE(quantite,0) + $1, updated_at=NOW()
             WHERE ingredient_id=$2 AND date_appro=$3 AND labo_id=(
               SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id=l.entreprise_id
               JOIN activites a ON a.entreprise_id=pe.id WHERE a.id=$4 LIMIT 1)`,
            [delta, entry.ingredient_id, entry.date_appro, entry.activite_id]
          );
        }
      }
    } else {
      const check = await pool.query(
        `SELECT id, created_by FROM stock_client_daily WHERE id=$1 AND client_id=$2`,
        [id, req.user.gerant_parent_id || req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
      if (req.user.role === 'gerant' && check.rows[0].created_by !== req.user.id)
        return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres enregistrements.' });
      await pool.query(
        `UPDATE stock_client_daily SET quantite=$1, prix_unitaire=$2, fournisseur_id=$3, ref_facture=$4, updated_at=NOW()
         WHERE id=$5`,
        [quantite ?? null, prixUnitaire ?? null, fournisseurId || null, refFacture || null, id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/stock/historique/:id
const deleteHistoriqueEntry = async (req, res) => {
  const { id } = req.params;
  const { isEntreprise } = req.query;
  try {
    if (isEntreprise === 'true') {
      const check = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.ingredient_id, sed.quantite, sed.type_appro, sed.date_appro, sed.created_by
         FROM stock_entreprise_daily sed
         JOIN activites a ON a.id = sed.activite_id
         JOIN profil_entreprise pe ON pe.id = a.entreprise_id
         WHERE sed.id = $1 AND pe.client_id = $2`,
        [id, req.user.gerant_parent_id || req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
      if (check.rows[0].type_appro === 'vente' || check.rows[0].type_appro === 'annulation_vente')
        return res.status(403).json({ message: 'Cette entrée est liée à une vente et ne peut pas être supprimée.' });
      if (req.user.role === 'gerant' && check.rows[0].created_by !== req.user.id)
        return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres enregistrements.' });
      const entry = check.rows[0];
      await pool.query('DELETE FROM stock_entreprise_daily WHERE id=$1', [id]);
      // If transfert, restore labo stock
      if (entry.type_appro === 'transfert') {
        const qty = parseFloat(entry.quantite) || 0;
        await pool.query(
          `UPDATE stock_labo_daily SET quantite = COALESCE(quantite,0) + $1, updated_at=NOW()
           WHERE ingredient_id=$2 AND date_appro=$3 AND labo_id=(
             SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id=l.entreprise_id
             JOIN activites a ON a.entreprise_id=pe.id WHERE a.id=$4 LIMIT 1)`,
          [qty, entry.ingredient_id, entry.date_appro, entry.activite_id]
        );
      }
    } else {
      const check = await pool.query(
        `SELECT id, created_by FROM stock_client_daily WHERE id=$1 AND client_id=$2`,
        [id, req.user.gerant_parent_id || req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
      if (req.user.role === 'gerant' && check.rows[0].created_by !== req.user.id)
        return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres enregistrements.' });
      await pool.query('DELETE FROM stock_client_daily WHERE id=$1', [id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

function resolveAutoFournisseur(fournisseurNom, quantite) {
  // Show "AUTO" for PT consumption entries (negative qty), hide for others
  if (fournisseurNom === 'AUTO') {
    return (quantite !== null && parseFloat(quantite) < 0) ? 'AUTO' : null;
  }
  return fournisseurNom || null;
}

function mapHistEntry(r) {
  return {
    dateAppro: isoDate(r.date_appro),
    quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
    prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
    typeAppro: r.type_appro || 'manuel',
    fournisseurNom: resolveAutoFournisseur(r.fournisseur_nom, r.quantite),
    refFacture: r.ref_facture || null,
    updatedAt: r.updated_at,
    tauxTva: r.taux_tva != null ? parseFloat(r.taux_tva) : null,
    prixUnitaireTva: r.prix_unitaire_tva != null ? parseFloat(r.prix_unitaire_tva) : null,
  };
}

function mapHistoriqueEntry(r) {
  return {
    id: r.id,
    activiteId: r.activite_id || null,
    dateAppro: isoDate(r.date_appro),
    quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
    prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
    typeAppro: r.type_appro || 'manuel',
    fournisseurId: r.fournisseur_id || null,
    fournisseurNom: resolveAutoFournisseur(r.fournisseur_nom, r.quantite),
    refFacture: r.ref_facture || null,
    updatedAt: r.updated_at,
    ingredientId: r.ingredient_id,
    ingredientNom: r.ingredient_nom,
    uniteNom: r.unite_nom,
    categorieNom: r.categorie_nom,
    createdBy: r.created_by ?? null,
    createdByNom: r.created_by_nom ?? null,
    tauxTva: r.taux_tva != null ? parseFloat(r.taux_tva) : null,
    prixUnitaireTva: r.prix_unitaire_tva != null ? parseFloat(r.prix_unitaire_tva) : null,
  };
}

// ─── Export Excel Historique Appro ───────────────────────────────────────────
const exportHistoriqueExcel = async (req, res) => {
  const { activiteId, activiteIds: activiteIdsParam, entType, ingredientId, categorieId, startDate, endDate, fournisseurId, refFacture, selectedIds: selectedIdsParam, ptOnly, ptProduitId } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').map(Number).filter(Boolean) : []);
  const currentYear = new Date().getFullYear();
  const isEntreprise = !!(activiteId || activiteIdsParam || entType);

  try {
    let rows = [];
    let activiteNames = {};

    if (isEntreprise) {
      let activiteIds = [];
      if (activiteId) {
        activiteIds = [activiteId];
      } else if (activiteIdsParam) {
        activiteIds = activiteIdsParam.split(',').map(Number).filter(Boolean);
      } else if (entType) {
        const allRes = await pool.query(
          `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id WHERE pe.client_id = $1`,
          [req.user.gerant_parent_id || req.user.id]
        );
        activiteIds = allRes.rows.map((r) => r.id);
      }
      if (activiteIds.length === 0) return res.status(404).json({ message: 'Aucune activité' });

      // Load activite names
      const actRes = await pool.query('SELECT id, nom FROM activites WHERE id = ANY($1)', [activiteIds]);
      actRes.rows.forEach((r) => { activiteNames[r.id] = r.nom; });

      const idList = activiteIds.map((_, i) => `$${i + 1}`).join(',');
      const params = [...activiteIds, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND sed.ingredient_id = $${params.length}`; }
      else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND sed.date_appro >= $${params.length}`; }
      if (endDate) { params.push(endDate); extraWhere += ` AND sed.date_appro <= $${params.length}`; }
      if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND sed.fournisseur_id = $${params.length}`; }
      if (refFacture) { params.push(`%${refFacture}%`); extraWhere += ` AND sed.ref_facture ILIKE $${params.length}`; }
      const result = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.date_appro, sed.quantite, sed.prix_unitaire, sed.type_appro,
                sed.ref_facture, f.nom as fournisseur_nom, i.nom as ingredient_nom,
                u.nom as unite_nom, COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
                sed.taux_tva, sed.prix_unitaire_tva, ub.nom as created_by_nom
         FROM stock_entreprise_daily sed
         JOIN articles i ON i.id = sed.ingredient_id JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
         LEFT JOIN utilisateurs ub ON ub.id = sed.created_by
         WHERE sed.activite_id IN (${idList}) AND EXTRACT(YEAR FROM sed.date_appro) = $${activiteIds.length + 1}${extraWhere}
         ORDER BY sed.date_appro DESC, i.nom`, params
      );
      rows = result.rows;

      // Append PT rows for entreprise
      const ptParamsEnt = [currentYear, ...activiteIds];
      let ptWhereEnt = `EXTRACT(YEAR FROM spt.date_appro) = $1 AND spt.activite_id IN (${activiteIds.map((_, i) => `$${i + 2}`).join(',')})`;
      if (ptProduitId) { ptParamsEnt.push(ptProduitId); ptWhereEnt += ` AND spt.produit_id = $${ptParamsEnt.length}`; }
      if (startDate) { ptParamsEnt.push(startDate); ptWhereEnt += ` AND spt.date_appro >= $${ptParamsEnt.length}`; }
      if (endDate) { ptParamsEnt.push(endDate); ptWhereEnt += ` AND spt.date_appro <= $${ptParamsEnt.length}`; }
      const ptResultEnt = await pool.query(
        `SELECT spt.id, spt.activite_id, spt.date_appro, spt.quantite, spt.prix_calcule AS prix_unitaire,
                'produit_transforme' AS type_appro,
                NULL AS fournisseur_nom, NULL AS ref_facture,
                p.nom AS ingredient_nom,
                'Produits Transformés' AS categorie_nom,
                'unité' AS unite_nom,
                NULL AS taux_tva, NULL AS prix_unitaire_tva, NULL AS created_by_nom
         FROM stock_produits_transformes spt
         JOIN produits p ON p.id = spt.produit_id
         WHERE ${ptWhereEnt}
         ORDER BY spt.date_appro DESC, p.nom`,
        ptParamsEnt
      );
      if (ptOnly === 'true') rows = ptResultEnt.rows;
      else rows = rows.concat(ptResultEnt.rows);
    } else {
      if (ptOnly !== 'true') {
        const params = [req.user.gerant_parent_id || req.user.id, currentYear];
        let extraWhere = '';
        if (ingredientId) { params.push(ingredientId); extraWhere += ` AND scd.ingredient_id = $${params.length}`; }
        else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
        if (startDate) { params.push(startDate); extraWhere += ` AND scd.date_appro >= $${params.length}`; }
        if (endDate) { params.push(endDate); extraWhere += ` AND scd.date_appro <= $${params.length}`; }
        if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND scd.fournisseur_id = $${params.length}`; }
        if (refFacture) { params.push(`%${refFacture}%`); extraWhere += ` AND scd.ref_facture ILIKE $${params.length}`; }
        const result = await pool.query(
          `SELECT scd.id, scd.date_appro, scd.quantite, scd.prix_unitaire, scd.type_appro,
                  scd.ref_facture, f.nom as fournisseur_nom, i.nom as ingredient_nom,
                  u.nom as unite_nom, COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
                  scd.taux_tva, scd.prix_unitaire_tva, ub.nom as created_by_nom
           FROM stock_client_daily scd
           JOIN articles i ON i.id = scd.ingredient_id JOIN unites u ON i.unite_id = u.id
           LEFT JOIN categories c ON i.categorie_id = c.id LEFT JOIN fournisseurs f ON f.id = scd.fournisseur_id
           LEFT JOIN utilisateurs ub ON ub.id = scd.created_by
           WHERE scd.client_id = $1 AND EXTRACT(YEAR FROM scd.date_appro) = $2${extraWhere}
           ORDER BY scd.date_appro DESC, i.nom`, params
        );
        rows = result.rows;
      }

      // Append PT rows for indép
      const ptParamsIndep = [req.user.id, currentYear];
      let ptWhereIndep = `spt.client_id = $1 AND EXTRACT(YEAR FROM spt.date_appro) = $2`;
      if (ptProduitId) { ptParamsIndep.push(ptProduitId); ptWhereIndep += ` AND spt.produit_id = $${ptParamsIndep.length}`; }
      if (startDate) { ptParamsIndep.push(startDate); ptWhereIndep += ` AND spt.date_appro >= $${ptParamsIndep.length}`; }
      if (endDate) { ptParamsIndep.push(endDate); ptWhereIndep += ` AND spt.date_appro <= $${ptParamsIndep.length}`; }
      const ptResultIndep = await pool.query(
        `SELECT spt.id, spt.date_appro, spt.quantite, spt.prix_calcule AS prix_unitaire,
                'produit_transforme' AS type_appro,
                NULL AS fournisseur_nom, NULL AS ref_facture,
                p.nom AS ingredient_nom,
                'Produits Transformés' AS categorie_nom,
                'unité' AS unite_nom,
                NULL AS taux_tva, NULL AS prix_unitaire_tva, NULL AS created_by_nom
         FROM stock_produits_transformes spt
         JOIN produits p ON p.id = spt.produit_id
         WHERE ${ptWhereIndep}
         ORDER BY spt.date_appro DESC, p.nom`,
        ptParamsIndep
      );
      rows = rows.concat(ptResultIndep.rows);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    const sheet = workbook.addWorksheet('Historique Appro', { pageSetup: { paperSize: 9, orientation: 'landscape' } });

    const BLUE = '1F3864'; const WHITE = 'FFFFFF'; const ORANGE = 'FF6B00'; const ALT = 'EEF4FF'; const GOLD = 'FFD700';
    const TITLE_BG = '2E4A7A';
    const thin = { style: 'thin', color: { argb: 'B8CCE4' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const hdrFont = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
    const bodyFont = { name: 'Calibri', size: 10 };

    const cols = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Ingrédient', key: 'ing', width: 26 },
      { header: 'Catégorie', key: 'cat', width: 18 },
      { header: 'Quantité', key: 'qty', width: 11 },
      { header: 'Unité', key: 'unit', width: 9 },
      { header: 'Prix U. HT', key: 'prix', width: 13 },
      { header: 'TVA %', key: 'tva', width: 9 },
      { header: 'Prix U. TTC', key: 'prixTtc', width: 13 },
      { header: 'Coût HT', key: 'coutHt', width: 14 },
      { header: 'Coût TTC', key: 'coutTtc', width: 14 },
      ...(isEntreprise ? [
        { header: 'Activité', key: 'act', width: 18 },
        { header: 'Fournisseur', key: 'fourn', width: 18 },
        { header: 'Réf. Facture', key: 'ref', width: 16 },
        { header: 'Type', key: 'type', width: 12 },
      ] : [
        { header: 'Fournisseur', key: 'fourn', width: 18 },
        { header: 'Réf. Facture', key: 'ref', width: 16 },
      ]),
      { header: 'Créé par', key: 'createdBy', width: 16 },
    ];
    sheet.columns = cols.map((c) => ({ width: c.width }));

    // Title row
    const fmtD = (d) => d ? d.split('-').reverse().join('/') : '—';
    const titleText = `Historique Appro  —  DU : ${fmtD(startDate)}   AU : ${fmtD(endDate)}`;
    const titleRow = sheet.addRow([titleText, ...Array(cols.length - 1).fill('')]);
    sheet.mergeCells(1, 1, 1, cols.length);
    titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    // Header row (now row 2)
    const hdrRow = sheet.addRow(cols.map((c) => c.header));
    hdrRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = hdrFont;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    });
    hdrRow.height = 22;
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    // Data rows
    // cols 1-10 are fixed; 11+ depend on isEntreprise
    // col9 = Coût HT, col10 = Coût TTC (both fixed positions)
    let totalHT = 0; let totalTTC = 0;
    rows.forEach((r, i) => {
      const qty = r.quantite !== null ? parseFloat(r.quantite) : 0;
      const prix = r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : 0;
      const prixTtc = r.prix_unitaire_tva !== null ? parseFloat(r.prix_unitaire_tva) : prix;
      const tva = r.taux_tva !== null ? parseFloat(r.taux_tva) : null;
      const coutHt = qty * prix;
      const coutTtc = qty * prixTtc;
      totalHT += coutHt; totalTTC += coutTtc;
      const isSelected = selectedSet.has(Number(r.id));
      const dateStr = r.date_appro ? new Date(r.date_appro).toISOString().slice(0, 10).split('-').reverse().join('/') : '';
      const typeLabel = (() => { const t = r.type_appro || 'manuel'; return t === 'produit_transforme' ? 'Prod. Transformé' : t === 'transfert' ? 'Transfert' : 'Manuel'; })();
      const rowData = [
        dateStr,
        r.ingredient_nom,
        r.categorie_nom,
        qty,
        r.unite_nom,
        prix,
        tva !== null ? tva : '',
        prixTtc,
        coutHt,
        coutTtc,
        ...(isEntreprise ? [activiteNames[r.activite_id] || '', r.fournisseur_nom || '', r.ref_facture || '', typeLabel] : [r.fournisseur_nom || '', r.ref_facture || '']),
        r.created_by_nom || '',
      ];
      const dataRow = sheet.addRow(rowData);
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: (c <= 3 || c === cols.length) ? 'left' : (c === 5 ? 'center' : 'right') };
      }
      const numFmt = '#,##0.000';
      dataRow.getCell(4).numFmt = numFmt;
      dataRow.getCell(6).numFmt = numFmt + ' "DT"';
      dataRow.getCell(8).numFmt = numFmt + ' "DT"';
      dataRow.getCell(9).numFmt = numFmt + ' "DT"';
      dataRow.getCell(10).numFmt = numFmt + ' "DT"';
      dataRow.height = 16;
    });

    // Total row — qty at col4, Coût HT at col9, Coût TTC at col10
    const totalRowData = ['TOTAL', '', '', '', '', '', '', '', totalHT, totalTTC, ...Array(cols.length - 10).fill('')];
    const totalRow = sheet.addRow(totalRowData);
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(9).numFmt = '#,##0.000 "DT"';
    totalRow.getCell(10).numFmt = '#,##0.000 "DT"';
    totalRow.height = 18;

    // Footer
    sheet.addRow([]);
    const footerRow = sheet.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — ${rows.length} enregistrement(s) — Prix en Dinars Tunisiens (DT)`]);
    footerRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };
    if (selectedSet.size > 0) {
      const noteRow = sheet.addRow([`⚠ ${selectedSet.size} appro(s) en surbrillance orange = sélectionnés`]);
      noteRow.getCell(1).font = { name: 'Calibri', bold: true, size: 9, color: { argb: ORANGE } };
    }

    const dateRange = startDate && endDate ? `${startDate}_${endDate}` : currentYear;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Historique-Appro-${dateRange}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur génération Excel' });
  }
};

const getCascadeInfoClient = async (req, res) => {
  const { ingredientId } = req.params;
  try {
    const [appros, inv] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM stock_client_daily WHERE client_id = $1 AND ingredient_id = $2', [req.user.gerant_parent_id || req.user.id, ingredientId]),
      pool.query('SELECT COUNT(*) FROM inventaires WHERE client_id = $1 AND ingredient_id = $2', [req.user.gerant_parent_id || req.user.id, ingredientId]),
    ]);
    res.json({ approCount: Number(appros.rows[0].count), inventaireCount: Number(inv.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getCascadeInfoEntreprise = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });
    const [appros, inv] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM stock_entreprise_daily WHERE activite_id = $1 AND ingredient_id = $2', [activiteId, ingredientId]),
      pool.query('SELECT COUNT(*) FROM inventaires WHERE activite_id = $1 AND ingredient_id = $2', [activiteId, ingredientId]),
    ]);
    res.json({ approCount: Number(appros.rows[0].count), inventaireCount: Number(inv.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const deleteClientIngredientHistory = async (req, res) => {
  const { ingredientId } = req.params;
  try {
    await pool.query('DELETE FROM stock_client_daily WHERE client_id = $1 AND ingredient_id = $2', [req.user.gerant_parent_id || req.user.id, ingredientId]);
    await pool.query('DELETE FROM inventaires WHERE client_id = $1 AND ingredient_id = $2', [req.user.gerant_parent_id || req.user.id, ingredientId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const deleteEntrepriseIngredientHistory = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });
    await pool.query('DELETE FROM stock_entreprise_daily WHERE activite_id = $1 AND ingredient_id = $2', [activiteId, ingredientId]);
    await pool.query('DELETE FROM inventaires WHERE activite_id = $1 AND ingredient_id = $2', [activiteId, ingredientId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateSeuilMinClient = async (req, res) => {
  const { ingredientId } = req.params;
  const { seuilMin } = req.body;
  try {
    await pool.query(
      `UPDATE articles SET seuil_min = $1 WHERE id = $2 AND client_id = $3`,
      [seuilMin ?? null, ingredientId, req.user.gerant_parent_id || req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const createClientPerte = async (req, res) => {
  const { ingredientId, quantite, typePerte, datePerte } = req.body;
  if (!ingredientId || !quantite || !typePerte || !datePerte)
    return res.status(400).json({ message: 'Champs requis: ingredientId, quantite, typePerte, datePerte' });
  if (!['avarie', 'dechet'].includes(typePerte))
    return res.status(400).json({ message: 'typePerte invalide (avarie|dechet)' });
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;

    const minRow = await pool.query(
      `SELECT MIN(date_appro) AS min_date FROM stock_client_daily WHERE client_id = $1 AND ingredient_id = $2`,
      [clientId, ingredientId]
    );
    const minAppro = minRow.rows[0]?.min_date;
    if (!minAppro) return res.status(400).json({ message: 'Aucun approvisionnement enregistré pour cet ingrédient.' });
    const minApproStr = minAppro instanceof Date ? minAppro.toISOString().slice(0, 10) : String(minAppro).slice(0, 10);
    if (datePerte < minApproStr) return res.status(400).json({ message: `La date de perte doit être >= au premier appro (${minApproStr.split('-').reverse().join('/')}).` });

    const priceRow = await pool.query(
      `SELECT prix_unitaire FROM stock_client_daily
       WHERE client_id = $1 AND ingredient_id = $2
         AND prix_unitaire IS NOT NULL AND prix_unitaire > 0
         AND date_appro <= $3
       ORDER BY date_appro DESC, id DESC LIMIT 1`,
      [clientId, ingredientId, datePerte]
    );
    const prixUnitaire = priceRow.rows.length > 0 ? parseFloat(priceRow.rows[0].prix_unitaire) : null;

    const r = await pool.query(
      `INSERT INTO client_pertes (client_id, ingredient_id, quantite, type_perte, date_perte, prix_unitaire, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [clientId, ingredientId, quantite, typePerte, datePerte, prixUnitaire, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getClientIngredientSelections = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const result = await pool.query(
      `SELECT a.id, a.nom, u.nom as unite, COALESCE(c.nom, 'Sans catégorie') as categorie,
              a.categorie_id as "categorieId"
       FROM articles a
       JOIN unites u ON a.unite_id = u.id
       LEFT JOIN categories c ON a.categorie_id = c.id
       WHERE a.client_id = $1
       ORDER BY c.nom NULLS LAST, a.nom`,
      [clientId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Historique Appro — export PDF ─────────────────────────────────────────────

const exportHistoriquePdf = async (req, res) => {
  const { activiteId, activiteIds: activiteIdsParam, entType, ingredientId, categorieId,
          startDate, endDate, fournisseurId, refFacture, ptOnly, ptProduitId } = req.query;
  const currentYear = new Date().getFullYear();
  const isEntreprise = !!(activiteId || activiteIdsParam || entType);

  try {
    let rows = [];

    if (isEntreprise) {
      let activiteIds = [];
      if (activiteId) activiteIds = [activiteId];
      else if (activiteIdsParam) activiteIds = activiteIdsParam.split(',').map(Number).filter(Boolean);
      else if (entType) {
        const allRes = await pool.query(
          `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id WHERE pe.client_id = $1`,
          [req.user.gerant_parent_id || req.user.id]
        );
        activiteIds = allRes.rows.map((r) => r.id);
      }
      if (activiteIds.length === 0) return res.status(404).json({ message: 'Aucune activité' });

      const actRes = await pool.query('SELECT id, nom FROM activites WHERE id = ANY($1)', [activiteIds]);
      const activiteNames = {};
      actRes.rows.forEach((r) => { activiteNames[r.id] = r.nom; });

      const idList = activiteIds.map((_, i) => `$${i + 1}`).join(',');
      const params = [...activiteIds, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND sed.ingredient_id = $${params.length}`; }
      else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND sed.date_appro >= $${params.length}`; }
      if (endDate)   { params.push(endDate);   extraWhere += ` AND sed.date_appro <= $${params.length}`; }
      if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND sed.fournisseur_id = $${params.length}`; }
      if (refFacture)    { params.push(`%${refFacture}%`); extraWhere += ` AND sed.ref_facture ILIKE $${params.length}`; }
      const result = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.date_appro, sed.quantite, sed.prix_unitaire, sed.type_appro,
                sed.ref_facture, f.nom as fournisseur_nom, i.nom as ingredient_nom,
                u.nom as unite_nom, COALESCE(c.nom,'Sans catégorie') as categorie_nom,
                sed.taux_tva, sed.prix_unitaire_tva
         FROM stock_entreprise_daily sed
         JOIN articles i ON i.id = sed.ingredient_id JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
         WHERE sed.activite_id IN (${idList}) AND EXTRACT(YEAR FROM sed.date_appro) = $${activiteIds.length + 1}${extraWhere}
         ORDER BY sed.date_appro DESC, i.nom`, params
      );
      rows = result.rows.map((r) => ({ ...r, activite_nom: activiteNames[r.activite_id] || '' }));
    } else {
      const params = [req.user.gerant_parent_id || req.user.id, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND scd.ingredient_id = $${params.length}`; }
      else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND scd.date_appro >= $${params.length}`; }
      if (endDate)   { params.push(endDate);   extraWhere += ` AND scd.date_appro <= $${params.length}`; }
      if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND scd.fournisseur_id = $${params.length}`; }
      if (refFacture)    { params.push(`%${refFacture}%`); extraWhere += ` AND scd.ref_facture ILIKE $${params.length}`; }
      const result = await pool.query(
        `SELECT scd.id, scd.date_appro, scd.quantite, scd.prix_unitaire, scd.type_appro,
                scd.ref_facture, f.nom as fournisseur_nom, i.nom as ingredient_nom,
                u.nom as unite_nom, COALESCE(c.nom,'Sans catégorie') as categorie_nom,
                scd.taux_tva, scd.prix_unitaire_tva
         FROM stock_client_daily scd
         JOIN articles i ON i.id = scd.ingredient_id JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id LEFT JOIN fournisseurs f ON f.id = scd.fournisseur_id
         WHERE scd.client_id = $1 AND EXTRACT(YEAR FROM scd.date_appro) = $2${extraWhere}
         ORDER BY scd.date_appro DESC, i.nom`, params
      );
      rows = result.rows;
    }

    await buildHistoriqueApproPdf(res, rows, { startDate, endDate });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur génération PDF' });
  }
};

module.exports = {
  getStockClient, updateStockClient, getStockClientSummary,
  getStockEntreprise, updateStockEntreprise, updateSeuilMin,
  updateSeuilMinClient, createClientPerte,
  getHistoryClient, getHistoryEntreprise,
  getHistoriqueAppro, updateHistoriqueEntry, deleteHistoriqueEntry,
  exportHistoriqueExcel, exportHistoriquePdf,
  deleteClientIngredientHistory, deleteEntrepriseIngredientHistory,
  getCascadeInfoClient, getCascadeInfoEntreprise,
  getClientIngredientSelections,
};
