const pool = require('../config/database');

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
              COALESCE(SUM(scd.quantite), 0) as total_quantite,
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
               ORDER BY scd2.date_appro DESC LIMIT 1) as last_ref_facture
       FROM client_ingredient_selections cis
       JOIN ingredients i ON cis.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN stock_client_daily scd ON scd.ingredient_id = i.id AND scd.client_id = $1
       WHERE cis.client_id = $1
       GROUP BY i.id, i.nom, u.nom, c.nom
       ORDER BY categorie NULLS LAST, i.nom`,
      [req.user.id]
    );
    res.json(result.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite_nom,
      categorie: row.categorie,
      prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
      quantite: parseFloat(row.total_quantite),
      totalQuantite: parseFloat(row.total_quantite),
      dateAppro: isoDate(row.date_appro),
      seuilMin: null,
      lastFournisseurId: row.last_fournisseur_id ?? null,
      lastRefFacture: row.last_ref_facture ?? null,
    })));
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
       VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, NOW())
       ON CONFLICT (client_id, ingredient_id, date_appro, type_appro)
       DO UPDATE SET quantite = $4, prix_unitaire = $5, fournisseur_id = $6, ref_facture = $7, updated_at = NOW()`,
      [req.user.id, ingredientId, da, quantite ?? null, prixUnitaire ?? null,
       fournisseurId ?? null, refFacture ?? null]
    );
    res.json({ success: true });
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
              COALESCE(SUM(sed.quantite), 0) as total_quantite,
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
               ORDER BY sed2.date_appro DESC LIMIT 1) as last_type_appro
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
    res.json(result.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite_nom,
      categorie: row.categorie,
      seuilMin: row.seuil_min !== null ? parseFloat(row.seuil_min) : null,
      prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
      quantite: parseFloat(row.total_quantite),
      totalQuantite: parseFloat(row.total_quantite),
      dateAppro: isoDate(row.date_appro),
      lastFournisseurId: row.last_fournisseur_id ?? null,
      lastRefFacture: row.last_ref_facture ?? null,
      lastTypeAppro: row.last_type_appro ?? null,
    })));
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
       VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, NOW())
       ON CONFLICT (activite_id, ingredient_id, date_appro, type_appro)
       DO UPDATE SET quantite = $4, prix_unitaire = $5, fournisseur_id = $6, ref_facture = $7, updated_at = NOW()`,
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
  const { activiteId, ingredientId, categorieId, startDate, endDate, fournisseurId, refFacture } = req.query;
  const currentYear = new Date().getFullYear();

  try {
    if (activiteId) {
      const check = await pool.query(
        `SELECT a.id FROM activites a
         JOIN profil_entreprise pe ON a.entreprise_id = pe.id
         WHERE a.id = $1 AND pe.client_id = $2`,
        [activiteId, req.user.id]
      );
      if (check.rows.length === 0)
        return res.status(404).json({ message: 'Activité introuvable' });

      const params = [activiteId, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND sed.ingredient_id = $${params.length}`; }
      else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND sed.date_appro >= $${params.length}`; }
      if (endDate) { params.push(endDate); extraWhere += ` AND sed.date_appro <= $${params.length}`; }
      if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND sed.fournisseur_id = $${params.length}`; }
      if (refFacture) { params.push(`%${refFacture}%`); extraWhere += ` AND sed.ref_facture ILIKE $${params.length}`; }

      const result = await pool.query(
        `SELECT sed.date_appro, sed.quantite, sed.prix_unitaire, sed.type_appro,
                sed.ref_facture, sed.fournisseur_id, f.nom as fournisseur_nom, sed.updated_at,
                i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_entreprise_daily sed
         JOIN ingredients i ON i.id = sed.ingredient_id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
         WHERE sed.activite_id = $1 AND EXTRACT(YEAR FROM sed.date_appro) = $2${extraWhere}
         ORDER BY sed.date_appro DESC, i.nom`,
        params
      );
      res.json(result.rows.map(mapHistoriqueEntry));
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
        `SELECT scd.date_appro, scd.quantite, scd.prix_unitaire, scd.type_appro,
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
      res.json(result.rows.map(mapHistoriqueEntry));
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

function mapHistEntry(r) {
  return {
    dateAppro: isoDate(r.date_appro),
    quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
    prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
    typeAppro: r.type_appro || 'manuel',
    fournisseurNom: r.fournisseur_nom || null,
    refFacture: r.ref_facture || null,
    updatedAt: r.updated_at,
  };
}

function mapHistoriqueEntry(r) {
  return {
    dateAppro: isoDate(r.date_appro),
    quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
    prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
    typeAppro: r.type_appro || 'manuel',
    fournisseurId: r.fournisseur_id || null,
    fournisseurNom: r.fournisseur_nom || null,
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
           VALUES ($1, $2, $3, $4, $5, 'manuel', NOW())
           ON CONFLICT (activite_id, ingredient_id, date_appro, type_appro)
           DO UPDATE SET quantite = $4, prix_unitaire = $5, updated_at = NOW()`,
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

module.exports = {
  getStockClient, updateStockClient,
  getStockEntreprise, updateStockEntreprise, updateSeuilMin,
  getHistoryClient, getHistoryEntreprise,
  getHistoriqueAppro,
  duplicateStockToFranchise,
};
