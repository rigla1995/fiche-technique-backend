const pool = require('../config/database');
const ExcelJS = require('exceljs');

const todayStr = () => new Date().toISOString().split('T')[0];
const isoDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

// ─── Stock Client (independant) ──────────────────────────────────────────────

const getStockClient = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie,
              cis.seuil_min,
              COALESCE(SUM(scd.quantite) FILTER (WHERE date_trunc('month', scd.date_appro) = date_trunc('month', CURRENT_DATE)), 0) as total_quantite,
              (SELECT scd2.prix_unitaire FROM stock_client_daily scd2
               WHERE scd2.client_id = $1 AND scd2.ingredient_id = i.id
               ORDER BY scd2.date_appro DESC LIMIT 1) as prix_unitaire,
              (SELECT scd2.date_appro FROM stock_client_daily scd2
               WHERE scd2.client_id = $1 AND scd2.ingredient_id = i.id
               ORDER BY scd2.date_appro DESC LIMIT 1) as date_appro,
              (SELECT scd2.fournisseur_id FROM stock_client_daily scd2
               WHERE scd2.client_id = $1 AND scd2.ingredient_id = i.id
               ORDER BY scd2.date_appro DESC LIMIT 1) as last_fournisseur_id,
              (SELECT scd2.ref_facture FROM stock_client_daily scd2
               WHERE scd2.client_id = $1 AND scd2.ingredient_id = i.id
               ORDER BY scd2.date_appro DESC LIMIT 1) as last_ref_facture,
              COALESCE(
                AVG(scd.prix_unitaire) FILTER (WHERE date_trunc('month', scd.date_appro) = date_trunc('month', CURRENT_DATE) AND scd.quantite > 0)
                * SUM(scd.quantite) FILTER (WHERE date_trunc('month', scd.date_appro) = date_trunc('month', CURRENT_DATE))
              , 0) as cout_total
       FROM client_ingredient_selections cis
       JOIN ingredients i ON cis.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN stock_client_daily scd ON scd.ingredient_id = i.id AND scd.client_id = $1
       WHERE cis.client_id = $1
       GROUP BY i.id, i.nom, u.nom, c.nom, cis.seuil_min
       ORDER BY categorie NULLS LAST, i.nom`,
      [req.user.id]
    );

    // Fetch PT products for this client
    const ptPrixRes = await pool.query(`
      SELECT pi.produit_id,
        BOOL_OR(lp.prix_unitaire IS NULL AND pi.portion > 0) as prix_partiel,
        SUM(pi.portion * COALESCE(lp.prix_unitaire, 0)) as prix_dtu
      FROM produit_ingredients pi
      LEFT JOIN LATERAL (
        SELECT prix_unitaire FROM stock_client_daily
        WHERE client_id = $1 AND ingredient_id = pi.ingredient_id AND quantite > 0
        ORDER BY date_appro DESC LIMIT 1
      ) lp ON true
      WHERE pi.produit_id IN (SELECT id FROM produits WHERE client_id = $1 AND is_stock_ingredient = TRUE)
      GROUP BY pi.produit_id
    `, [req.user.id]);
    const ptPrixMap = {};
    for (const r of ptPrixRes.rows) {
      ptPrixMap[r.produit_id] = { prixDtu: parseFloat(r.prix_dtu) || 0, prixPartiel: r.prix_partiel };
    }

    const ptRes = await pool.query(`
      SELECT p.id as produit_id, p.nom, p.seuil_min_pt,
        COALESCE(SUM(spt.quantite) FILTER (WHERE date_trunc('month', spt.date_appro) = date_trunc('month', CURRENT_DATE)), 0) as total_quantite,
        (SELECT spt2.date_appro FROM stock_produits_transformes spt2 WHERE spt2.produit_id = p.id AND spt2.client_id = $1 ORDER BY spt2.date_appro DESC LIMIT 1) as last_date_appro,
        (SELECT spt2.prix_calcule FROM stock_produits_transformes spt2 WHERE spt2.produit_id = p.id AND spt2.client_id = $1 ORDER BY spt2.date_appro DESC LIMIT 1) as last_prix_calcule,
        COALESCE(
          AVG(spt.prix_calcule) FILTER (WHERE date_trunc('month', spt.date_appro) = date_trunc('month', CURRENT_DATE))
          * SUM(spt.quantite) FILTER (WHERE date_trunc('month', spt.date_appro) = date_trunc('month', CURRENT_DATE))
        , 0) as cout_total
      FROM produits p
      LEFT JOIN stock_produits_transformes spt ON spt.produit_id = p.id AND spt.client_id = $1
      WHERE p.client_id = $1 AND p.is_stock_ingredient = TRUE
      GROUP BY p.id, p.nom, p.seuil_min_pt
      ORDER BY p.nom
    `, [req.user.id]);

    const ptRows = ptRes.rows.map((r) => {
      const pInfo = ptPrixMap[r.produit_id] || { prixDtu: 0, prixPartiel: false };
      return {
        ingredientId: -(r.produit_id),  // negative ID = PT product
        produitId: r.produit_id,
        isPT: true,
        nom: r.nom,
        unite: 'unité',
        categorie: 'Produits Transformés',
        prixUnitaire: pInfo.prixDtu,
        prixPartiel: pInfo.prixPartiel,
        quantite: parseFloat(r.total_quantite),
        totalQuantite: parseFloat(r.total_quantite),
        dateAppro: isoDate(r.last_date_appro),
        seuilMin: r.seuil_min_pt !== null ? parseFloat(r.seuil_min_pt) : null,
        coutTotal: parseFloat(r.total_quantite) > 0 ? pInfo.prixDtu * parseFloat(r.total_quantite) : 0,
        lastFournisseurId: null,
        lastRefFacture: null,
      };
    });

    res.json([...result.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite_nom,
      categorie: row.categorie,
      prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
      quantite: parseFloat(row.total_quantite),
      totalQuantite: parseFloat(row.total_quantite),
      coutTotal: row.cout_total !== null ? parseFloat(row.cout_total) : null,
      dateAppro: isoDate(row.date_appro),
      seuilMin: row.seuil_min !== null ? parseFloat(row.seuil_min) : null,
      lastFournisseurId: row.last_fournisseur_id ?? null,
      lastRefFacture: row.last_ref_facture ?? null,
    })), ...ptRows]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockClient = async (req, res) => {
  const { ingredientId } = req.params;
  const { quantite, prixUnitaire, dateAppro, fournisseurId, refFacture } = req.body;
  const da = dateAppro || todayStr();

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    await pool.query(
      `INSERT INTO stock_client_daily
         (client_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, NOW())`,
      [req.user.id, ingredientId, da, quantite ?? null, prixUnitaire ?? null,
       fournisseurId ?? null, refFacture ?? null]
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
      pool.query(`SELECT COUNT(*) FROM fournisseurs WHERE client_id = $1`, [req.user.id]),
      pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM stock_client_daily WHERE client_id = $1
         ) AS has_appros`,
        [req.user.id]
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
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    const result = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie,
              ais.seuil_min,
              COALESCE(SUM(sed.quantite) FILTER (WHERE date_trunc('month', sed.date_appro) = date_trunc('month', CURRENT_DATE)), 0) as total_quantite,
              (SELECT sed2.prix_unitaire FROM stock_entreprise_daily sed2
               WHERE sed2.activite_id = $1 AND sed2.ingredient_id = i.id
               ORDER BY sed2.date_appro DESC LIMIT 1) as prix_unitaire,
              (SELECT sed2.date_appro FROM stock_entreprise_daily sed2
               WHERE sed2.activite_id = $1 AND sed2.ingredient_id = i.id
               ORDER BY sed2.date_appro DESC LIMIT 1) as date_appro,
              (SELECT sed2.fournisseur_id FROM stock_entreprise_daily sed2
               WHERE sed2.activite_id = $1 AND sed2.ingredient_id = i.id
               ORDER BY sed2.date_appro DESC LIMIT 1) as last_fournisseur_id,
              (SELECT sed2.ref_facture FROM stock_entreprise_daily sed2
               WHERE sed2.activite_id = $1 AND sed2.ingredient_id = i.id
               ORDER BY sed2.date_appro DESC LIMIT 1) as last_ref_facture,
              (SELECT sed2.type_appro FROM stock_entreprise_daily sed2
               WHERE sed2.activite_id = $1 AND sed2.ingredient_id = i.id
               ORDER BY sed2.date_appro DESC LIMIT 1) as last_type_appro,
              COALESCE(
                AVG(sed.prix_unitaire) FILTER (WHERE date_trunc('month', sed.date_appro) = date_trunc('month', CURRENT_DATE) AND sed.quantite > 0)
                * SUM(sed.quantite) FILTER (WHERE date_trunc('month', sed.date_appro) = date_trunc('month', CURRENT_DATE))
              , 0) as cout_total
       FROM activite_ingredient_selections ais
       JOIN ingredients i ON ais.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN stock_entreprise_daily sed ON sed.ingredient_id = i.id AND sed.activite_id = $1
       WHERE ais.activite_id = $1
       GROUP BY i.id, i.nom, u.nom, c.nom, ais.seuil_min
       ORDER BY categorie NULLS LAST, i.nom`,
      [activiteId]
    );

    // Fetch PT products for this activite
    const ptPrixRes = await pool.query(`
      SELECT pi.produit_id,
        BOOL_OR(lp.prix_unitaire IS NULL AND pi.portion > 0) as prix_partiel,
        SUM(pi.portion * COALESCE(lp.prix_unitaire, 0)) as prix_dtu
      FROM produit_ingredients pi
      LEFT JOIN LATERAL (
        SELECT prix_unitaire FROM stock_entreprise_daily
        WHERE activite_id = $1 AND ingredient_id = pi.ingredient_id AND quantite > 0
        ORDER BY date_appro DESC LIMIT 1
      ) lp ON true
      WHERE pi.produit_id IN (
        SELECT id FROM produits
        WHERE is_stock_ingredient = TRUE
        AND (
          activite_id = $1
          OR (franchise_group IS NOT NULL AND franchise_group = (SELECT a2.franchise_group FROM activites a2 WHERE a2.id = $1))
        )
      )
      GROUP BY pi.produit_id
    `, [activiteId]);
    const ptPrixMap = {};
    for (const r of ptPrixRes.rows) {
      ptPrixMap[r.produit_id] = { prixDtu: parseFloat(r.prix_dtu) || 0, prixPartiel: r.prix_partiel };
    }

    const ptRes = await pool.query(`
      SELECT p.id as produit_id, p.nom, p.seuil_min_pt,
        COALESCE(SUM(spt.quantite) FILTER (WHERE date_trunc('month', spt.date_appro) = date_trunc('month', CURRENT_DATE)), 0) as total_quantite,
        (SELECT spt2.date_appro FROM stock_produits_transformes spt2 WHERE spt2.produit_id = p.id AND spt2.activite_id = $1 ORDER BY spt2.date_appro DESC LIMIT 1) as last_date_appro,
        (SELECT spt2.prix_calcule FROM stock_produits_transformes spt2 WHERE spt2.produit_id = p.id AND spt2.activite_id = $1 ORDER BY spt2.date_appro DESC LIMIT 1) as last_prix_calcule,
        COALESCE(
          AVG(spt.prix_calcule) FILTER (WHERE date_trunc('month', spt.date_appro) = date_trunc('month', CURRENT_DATE))
          * SUM(spt.quantite) FILTER (WHERE date_trunc('month', spt.date_appro) = date_trunc('month', CURRENT_DATE))
        , 0) as cout_total
      FROM produits p
      LEFT JOIN stock_produits_transformes spt ON spt.produit_id = p.id AND spt.activite_id = $1
      WHERE p.is_stock_ingredient = TRUE
      AND (
        p.activite_id = $1
        OR (p.franchise_group IS NOT NULL AND p.franchise_group = (SELECT a2.franchise_group FROM activites a2 WHERE a2.id = $1))
      )
      GROUP BY p.id, p.nom, p.seuil_min_pt
      ORDER BY p.nom
    `, [activiteId]);

    const ptRows = ptRes.rows.map((r) => {
      const pInfo = ptPrixMap[r.produit_id] || { prixDtu: 0, prixPartiel: false };
      return {
        ingredientId: -(r.produit_id),  // negative ID = PT product
        produitId: r.produit_id,
        isPT: true,
        nom: r.nom,
        unite: 'unité',
        categorie: 'Produits Transformés',
        prixUnitaire: pInfo.prixDtu,
        prixPartiel: pInfo.prixPartiel,
        quantite: parseFloat(r.total_quantite),
        totalQuantite: parseFloat(r.total_quantite),
        dateAppro: isoDate(r.last_date_appro),
        seuilMin: r.seuil_min_pt !== null ? parseFloat(r.seuil_min_pt) : null,
        coutTotal: parseFloat(r.total_quantite) > 0 ? pInfo.prixDtu * parseFloat(r.total_quantite) : 0,
        lastFournisseurId: null,
        lastRefFacture: null,
      };
    });

    // Apply inventaire baseline for activite stock
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
         JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro > li.date_inventaire
         WHERE sed.activite_id = $1
         GROUP BY sed.ingredient_id
       )
       SELECT li.ingredient_id,
              li.quantite_reelle as inv_qty,
              COALESCE(pa.qty, 0) as post_appro_qty
       FROM last_inv li
       LEFT JOIN post_appro pa ON pa.ingredient_id = li.ingredient_id`,
      [activiteId]
    );
    const invBaselineMap = {};
    for (const r of invBaselineRes.rows) {
      invBaselineMap[r.ingredient_id] = {
        invQty: parseFloat(r.inv_qty),
        postApproQty: parseFloat(r.post_appro_qty),
      };
    }

    res.json([...result.rows.map((row) => {
      const inv = invBaselineMap[row.ingredient_id];
      const quantite = inv
        ? inv.invQty + inv.postApproQty
        : parseFloat(row.total_quantite);
      return {
        ingredientId: row.ingredient_id,
        nom: row.nom,
        unite: row.unite_nom,
        categorie: row.categorie,
        seuilMin: row.seuil_min !== null ? parseFloat(row.seuil_min) : null,
        prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
        quantite,
        totalQuantite: quantite,
        coutTotal: row.cout_total !== null ? parseFloat(row.cout_total) : null,
        dateAppro: isoDate(row.date_appro),
        lastFournisseurId: row.last_fournisseur_id ?? null,
        lastRefFacture: row.last_ref_facture ?? null,
        lastTypeAppro: row.last_type_appro ?? null,
      };
    }), ...ptRows]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockEntreprise = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  const { quantite, prixUnitaire, dateAppro, fournisseurId, refFacture } = req.body;
  const da = dateAppro || todayStr();

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    await pool.query(
      `INSERT INTO stock_entreprise_daily
         (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, NOW())`,
      [activiteId, ingredientId, da, quantite ?? null, prixUnitaire ?? null,
       fournisseurId ?? null, refFacture ?? null]
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
      [activiteId, req.user.id]
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
              scd.ref_facture, f.nom as fournisseur_nom, scd.updated_at
       FROM stock_client_daily scd
       LEFT JOIN fournisseurs f ON f.id = scd.fournisseur_id
       WHERE scd.client_id = $1 AND scd.ingredient_id = $2
       ORDER BY scd.date_appro DESC
       LIMIT 5`,
      [req.user.id, ingredientId]
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
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    const result = await pool.query(
      `SELECT sed.date_appro, sed.quantite, sed.prix_unitaire, sed.type_appro,
              sed.ref_facture, f.nom as fournisseur_nom, sed.updated_at
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
  const { activiteId, franchiseGroup, activiteIds: activiteIdsParam, entType, ingredientId, categorieId, startDate, endDate, fournisseurId, refFacture, ptOnly, ptProduitId } = req.query;
  const currentYear = new Date().getFullYear();

  try {
    if (activiteId || franchiseGroup || activiteIdsParam || entType) {
      // Resolve activiteIds list
      let activiteIds = [];
      if (activiteId) {
        const check = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE a.id = $1 AND pe.client_id = $2`,
          [activiteId, req.user.id]
        );
        if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });
        activiteIds = [activiteId];
      } else if (franchiseGroup) {
        const gRes = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE pe.client_id = $1 AND a.franchise_group = $2`,
          [req.user.id, franchiseGroup]
        );
        activiteIds = gRes.rows.map((r) => r.id);
        if (activiteIds.length === 0) return res.json([]);
      } else if (activiteIdsParam) {
        // Comma-separated list of activiteIds
        const requested = activiteIdsParam.split(',').map(Number).filter(Boolean);
        const check = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE a.id = ANY($1) AND pe.client_id = $2`,
          [requested, req.user.id]
        );
        activiteIds = check.rows.map((r) => r.id);
        if (activiteIds.length === 0) return res.json([]);
      } else if (entType) {
        // All activities of a given type for this client
        const typeFilter = entType === 'franchise' ? `a.type = 'franchise'` : `(a.type = 'distincte' OR a.type IS NULL)`;
        const allRes = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE pe.client_id = $1 AND ${typeFilter}`,
          [req.user.id]
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
                i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_entreprise_daily sed
         JOIN ingredients i ON i.id = sed.ingredient_id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
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
      const params = [req.user.id, currentYear];
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
                i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_client_daily scd
         JOIN ingredients i ON i.id = scd.ingredient_id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         LEFT JOIN fournisseurs f ON f.id = scd.fournisseur_id
         WHERE scd.client_id = $1 AND EXTRACT(YEAR FROM scd.date_appro) = $2${extraWhere}
         ORDER BY scd.date_appro DESC, i.nom`,
        params
      );

      let regularRows = result.rows.map(mapHistoriqueEntry);

      // Append PT entries if no category filter is active or ptOnly is requested
      if (ptOnly === 'true' || (!categorieId && !ingredientId)) {
        const ptParams = [req.user.id];
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
        `SELECT sed.id, sed.activite_id, sed.ingredient_id, sed.quantite as old_quantite, sed.type_appro, sed.date_appro
         FROM stock_entreprise_daily sed
         JOIN activites a ON a.id = sed.activite_id
         JOIN profil_entreprise pe ON pe.id = a.entreprise_id
         WHERE sed.id = $1 AND pe.client_id = $2`,
        [id, req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
      const entry = check.rows[0];
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
        `SELECT id FROM stock_client_daily WHERE id=$1 AND client_id=$2`,
        [id, req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
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
        `SELECT sed.id, sed.activite_id, sed.ingredient_id, sed.quantite, sed.type_appro, sed.date_appro
         FROM stock_entreprise_daily sed
         JOIN activites a ON a.id = sed.activite_id
         JOIN profil_entreprise pe ON pe.id = a.entreprise_id
         WHERE sed.id = $1 AND pe.client_id = $2`,
        [id, req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
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
        `SELECT id FROM stock_client_daily WHERE id=$1 AND client_id=$2`,
        [id, req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
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
  };
}

// ─── Duplicate Franchise ──────────────────────────────────────────────────────

const duplicateStockToFranchise = async (req, res) => {
  const { activiteId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id, a.entreprise_id, a.franchise_group FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2 AND a.type = 'franchise'`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité franchise introuvable' });

    const { entreprise_id: entrepriseId, franchise_group: franchiseGroup } = check.rows[0];

    const source = await pool.query(
      `SELECT DISTINCT ON (ingredient_id) ingredient_id, quantite, prix_unitaire, date_appro
       FROM stock_entreprise_daily WHERE activite_id = $1 AND type_appro = 'manuel'
       ORDER BY ingredient_id, date_appro DESC`,
      [activiteId]
    );

    const others = await pool.query(
      `SELECT id FROM activites
       WHERE entreprise_id = $1 AND type = 'franchise' AND franchise_group = $2 AND id != $3`,
      [entrepriseId, franchiseGroup, activiteId]
    );

    for (const act of others.rows) {
      const targetSel = await pool.query(
        'SELECT ingredient_id FROM activite_ingredient_selections WHERE activite_id = $1',
        [act.id]
      );
      const targetIngSet = new Set(targetSel.rows.map((r) => r.ingredient_id));
      for (const row of source.rows) {
        if (!targetIngSet.has(row.ingredient_id)) continue;
        await pool.query(
          `INSERT INTO stock_entreprise_daily
             (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'manuel', NOW())`,
          [act.id, row.ingredient_id, row.date_appro, row.quantite, row.prix_unitaire]
        );
      }
    }

    res.json({ duplicatedTo: others.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Export Excel Historique Appro ───────────────────────────────────────────
const exportHistoriqueExcel = async (req, res) => {
  const { activiteId, franchiseGroup, activiteIds: activiteIdsParam, entType, ingredientId, categorieId, startDate, endDate, fournisseurId, refFacture, selectedIds: selectedIdsParam, ptOnly, ptProduitId } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').map(Number).filter(Boolean) : []);
  const currentYear = new Date().getFullYear();
  const isEntreprise = !!(activiteId || franchiseGroup || activiteIdsParam || entType);

  try {
    let rows = [];
    let activiteNames = {};

    if (isEntreprise) {
      let activiteIds = [];
      if (activiteId) {
        activiteIds = [activiteId];
      } else if (franchiseGroup) {
        const gRes = await pool.query(
          `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id WHERE pe.client_id = $1 AND a.franchise_group = $2`,
          [req.user.id, franchiseGroup]
        );
        activiteIds = gRes.rows.map((r) => r.id);
      } else if (activiteIdsParam) {
        activiteIds = activiteIdsParam.split(',').map(Number).filter(Boolean);
      } else if (entType) {
        const typeFilter = entType === 'franchise' ? `a.type = 'franchise'` : `(a.type = 'distincte' OR a.type IS NULL)`;
        const allRes = await pool.query(`SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id WHERE pe.client_id = $1 AND ${typeFilter}`, [req.user.id]);
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
                u.nom as unite_nom, COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_entreprise_daily sed
         JOIN ingredients i ON i.id = sed.ingredient_id JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
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
                'unité' AS unite_nom
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
        const params = [req.user.id, currentYear];
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
                  u.nom as unite_nom, COALESCE(c.nom, 'Sans catégorie') as categorie_nom
           FROM stock_client_daily scd
           JOIN ingredients i ON i.id = scd.ingredient_id JOIN unites u ON i.unite_id = u.id
           LEFT JOIN categories c ON i.categorie_id = c.id LEFT JOIN fournisseurs f ON f.id = scd.fournisseur_id
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
                'unité' AS unite_nom
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
      { header: 'Prix/DT', key: 'prix', width: 11 },
      { header: 'Coût total DT', key: 'cout', width: 14 },
      ...(isEntreprise ? [
        { header: 'Activité', key: 'act', width: 18 },
        { header: 'Fournisseur', key: 'fourn', width: 18 },
        { header: 'Réf. Facture', key: 'ref', width: 16 },
        { header: 'Type', key: 'type', width: 10 },
      ] : [
        { header: 'Fournisseur', key: 'fourn', width: 18 },
        { header: 'Réf. Facture', key: 'ref', width: 16 },
      ]),
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
    let totalQty = 0; let totalCout = 0;
    rows.forEach((r, i) => {
      const qty = r.quantite !== null ? parseFloat(r.quantite) : 0;
      const prix = r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : 0;
      const cout = qty * prix;
      totalQty += qty; totalCout += cout;
      const isSelected = selectedSet.has(Number(r.id));
      const dateStr = r.date_appro ? new Date(r.date_appro).toISOString().slice(0, 10).split('-').reverse().join('/') : '';
      const rowData = [
        dateStr,
        r.ingredient_nom,
        r.categorie_nom,
        qty,
        r.unite_nom,
        prix,
        cout,
        ...(isEntreprise ? [activiteNames[r.activite_id] || '', r.fournisseur_nom || '', r.ref_facture || '', (() => { const t = r.type_appro || 'manuel'; return t === 'produit_transforme' ? 'Prod. Transformé' : t === 'transfert' ? 'Transfert' : t; })()] : [r.fournisseur_nom || '', r.ref_facture || '']),
      ];
      const dataRow = sheet.addRow(rowData);
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      // Use getCell loop to ensure ALL cells (including empty) get the fill
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: c <= 3 ? 'left' : (c === 5 ? 'center' : 'right') };
      }
      const numFmt = '#,##0.000';
      dataRow.getCell(4).numFmt = numFmt;
      dataRow.getCell(6).numFmt = numFmt + ' "DT"';
      dataRow.getCell(7).numFmt = numFmt + ' "DT"';
      dataRow.height = 16;
    });

    // Total row
    const totalRow = sheet.addRow([
      'TOTAL', '', '',
      totalQty, '', '',
      totalCout,
      ...(isEntreprise ? ['', '', '', ''] : ['', '']),
    ]);
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(4).numFmt = '#,##0.000';
    totalRow.getCell(7).numFmt = '#,##0.000 "DT"';
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

const deleteClientIngredientHistory = async (req, res) => {
  const { ingredientId } = req.params;
  try {
    await pool.query(
      'DELETE FROM stock_client_daily WHERE client_id = $1 AND ingredient_id = $2',
      [req.user.id, ingredientId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const deleteEntrepriseIngredientHistory = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  try {
    // Verify ownership
    const check = await pool.query(
      `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });
    await pool.query(
      'DELETE FROM stock_entreprise_daily WHERE activite_id = $1 AND ingredient_id = $2',
      [activiteId, ingredientId]
    );
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
      `UPDATE client_ingredient_selections SET seuil_min = $1 WHERE client_id = $2 AND ingredient_id = $3`,
      [seuilMin ?? null, req.user.id, ingredientId]
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
    const r = await pool.query(
      `INSERT INTO client_pertes (client_id, ingredient_id, quantite, type_perte, date_perte)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, ingredientId, quantite, typePerte, datePerte]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getStockClient, updateStockClient, getStockClientSummary,
  getStockEntreprise, updateStockEntreprise, updateSeuilMin,
  updateSeuilMinClient, createClientPerte,
  getHistoryClient, getHistoryEntreprise,
  getHistoriqueAppro, updateHistoriqueEntry, deleteHistoriqueEntry,
  duplicateStockToFranchise,
  exportHistoriqueExcel,
  deleteClientIngredientHistory, deleteEntrepriseIngredientHistory,
};
