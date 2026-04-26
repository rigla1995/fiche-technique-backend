const pool = require('../config/database');

const todayStr = () => new Date().toISOString().split('T')[0];

// ─── Stock Client (independant) ──────────────────────────────────────────────

// Returns the latest appro entry per ingredient for the client
const getStockClient = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sub.ingredient_id, sub.nom, sub.unite_nom, sub.categorie,
              sub.quantite, sub.prix_unitaire, sub.date_appro, sub.updated_at
       FROM (
         SELECT DISTINCT ON (i.id) i.id as ingredient_id, i.nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie,
                scd.quantite, scd.prix_unitaire, scd.date_appro, scd.updated_at
         FROM client_ingredient_selections cis
         JOIN ingredients i ON cis.ingredient_id = i.id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         LEFT JOIN stock_client_daily scd ON scd.ingredient_id = i.id AND scd.client_id = $1
         WHERE cis.client_id = $1
         ORDER BY i.id, scd.date_appro DESC NULLS LAST
       ) sub
       ORDER BY sub.categorie NULLS LAST, sub.nom`,
      [req.user.id]
    );
    res.json(result.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite_nom,
      categorie: row.categorie,
      prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
      quantite: row.quantite !== null ? parseFloat(row.quantite) : null,
      dateAppro: row.date_appro ? String(row.date_appro).slice(0, 10) : null,
      updatedAt: row.updated_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockClient = async (req, res) => {
  const { ingredientId } = req.params;
  const { quantite, prixUnitaire, dateAppro } = req.body;
  const da = dateAppro || todayStr();

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    await pool.query(
      `INSERT INTO stock_client_daily (client_id, ingredient_id, date_appro, quantite, prix_unitaire, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (client_id, ingredient_id, date_appro)
       DO UPDATE SET quantite = $4, prix_unitaire = $5, updated_at = NOW()`,
      [req.user.id, ingredientId, da, quantite ?? null, prixUnitaire ?? null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Stock Entreprise ──────────────────────────────────────────────────────

// Returns the latest appro entry per ingredient for an activite
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
      `SELECT sub.ingredient_id, sub.nom, sub.unite_nom, sub.categorie,
              sub.quantite, sub.prix_unitaire, sub.date_appro, sub.updated_at
       FROM (
         SELECT DISTINCT ON (i.id) i.id as ingredient_id, i.nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie,
                sed.quantite, sed.prix_unitaire, sed.date_appro, sed.updated_at
         FROM activite_ingredient_selections ais
         JOIN ingredients i ON ais.ingredient_id = i.id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         LEFT JOIN stock_entreprise_daily sed ON sed.ingredient_id = i.id AND sed.activite_id = $1
         WHERE ais.activite_id = $1
         ORDER BY i.id, sed.date_appro DESC NULLS LAST
       ) sub
       ORDER BY sub.categorie NULLS LAST, sub.nom`,
      [activiteId]
    );
    res.json(result.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite_nom,
      categorie: row.categorie,
      prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
      quantite: row.quantite !== null ? parseFloat(row.quantite) : null,
      dateAppro: row.date_appro ? String(row.date_appro).slice(0, 10) : null,
      updatedAt: row.updated_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockEntreprise = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  const { quantite, prixUnitaire, dateAppro } = req.body;
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
      `INSERT INTO stock_entreprise_daily (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (activite_id, ingredient_id, date_appro)
       DO UPDATE SET quantite = $4, prix_unitaire = $5, updated_at = NOW()`,
      [activiteId, ingredientId, da, quantite ?? null, prixUnitaire ?? null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── History ──────────────────────────────────────────────────────────────────

// Last 10 appro entries for a client ingredient
const getHistoryClient = async (req, res) => {
  const { ingredientId } = req.params;
  try {
    const result = await pool.query(
      `SELECT scd.date_appro, scd.quantite, scd.prix_unitaire, scd.updated_at
       FROM stock_client_daily scd
       WHERE scd.client_id = $1 AND scd.ingredient_id = $2
       ORDER BY scd.date_appro DESC
       LIMIT 10`,
      [req.user.id, ingredientId]
    );
    res.json(result.rows.map((r) => ({
      dateAppro: String(r.date_appro).slice(0, 10),
      quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
      prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
      updatedAt: r.updated_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Last 10 appro entries for an entreprise activity ingredient
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
      `SELECT sed.date_appro, sed.quantite, sed.prix_unitaire, sed.updated_at
       FROM stock_entreprise_daily sed
       WHERE sed.activite_id = $1 AND sed.ingredient_id = $2
       ORDER BY sed.date_appro DESC
       LIMIT 10`,
      [activiteId, ingredientId]
    );
    res.json(result.rows.map((r) => ({
      dateAppro: String(r.date_appro).slice(0, 10),
      quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
      prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
      updatedAt: r.updated_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Historique Approvisionnement (filtered, current year) ──────────────────

const getHistoriqueAppro = async (req, res) => {
  const { activiteId, ingredientId, startDate, endDate } = req.query;
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
      if (startDate) { params.push(startDate); extraWhere += ` AND sed.date_appro >= $${params.length}`; }
      if (endDate) { params.push(endDate); extraWhere += ` AND sed.date_appro <= $${params.length}`; }

      const result = await pool.query(
        `SELECT sed.date_appro, sed.quantite, sed.prix_unitaire, sed.updated_at,
                i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_entreprise_daily sed
         JOIN ingredients i ON i.id = sed.ingredient_id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         WHERE sed.activite_id = $1 AND EXTRACT(YEAR FROM sed.date_appro) = $2${extraWhere}
         ORDER BY sed.date_appro DESC, i.nom`,
        params
      );
      res.json(result.rows.map(mapHistEntry));
    } else {
      const params = [req.user.id, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND scd.ingredient_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND scd.date_appro >= $${params.length}`; }
      if (endDate) { params.push(endDate); extraWhere += ` AND scd.date_appro <= $${params.length}`; }

      const result = await pool.query(
        `SELECT scd.date_appro, scd.quantite, scd.prix_unitaire, scd.updated_at,
                i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_client_daily scd
         JOIN ingredients i ON i.id = scd.ingredient_id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         WHERE scd.client_id = $1 AND EXTRACT(YEAR FROM scd.date_appro) = $2${extraWhere}
         ORDER BY scd.date_appro DESC, i.nom`,
        params
      );
      res.json(result.rows.map(mapHistEntry));
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

function mapHistEntry(r) {
  return {
    dateAppro: String(r.date_appro).slice(0, 10),
    quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
    prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
    updatedAt: r.updated_at,
    ingredientId: r.ingredient_id,
    ingredientNom: r.ingredient_nom,
    uniteNom: r.unite_nom,
    categorieNom: r.categorie_nom,
  };
}

// ─── Duplicate Franchise ──────────────────────────────────────────────────────

// Copy LATEST appro entries from one franchise activity to all other franchise activities of the same company
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

    // Get latest stock entry per ingredient from source
    const source = await pool.query(
      `SELECT DISTINCT ON (ingredient_id) ingredient_id, quantite, prix_unitaire, date_appro
       FROM stock_entreprise_daily WHERE activite_id = $1
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
          `INSERT INTO stock_entreprise_daily (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (activite_id, ingredient_id, date_appro) DO UPDATE SET quantite = $4, prix_unitaire = $5, updated_at = NOW()`,
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
  getStockEntreprise, updateStockEntreprise,
  getHistoryClient, getHistoryEntreprise,
  getHistoriqueAppro,
  duplicateStockToFranchise,
};
