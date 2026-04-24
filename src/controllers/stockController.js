const pool = require('../config/database');

const todayStr = () => new Date().toISOString().split('T')[0];

// ─── Stock Client (independant) ─────────────────────────────────────────────

const getStockClient = async (req, res) => {
  const dateStock = req.query.date || todayStr();
  try {
    const result = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie,
              scd.quantite, scd.prix_unitaire, scd.updated_at
       FROM client_ingredient_selections cis
       JOIN ingredients i ON cis.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN stock_client_daily scd ON scd.ingredient_id = i.id AND scd.client_id = $1 AND scd.date_stock = $2
       WHERE cis.client_id = $1
       ORDER BY c.nom NULLS LAST, i.nom`,
      [req.user.id, dateStock]
    );
    res.json(result.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite_nom,
      categorie: row.categorie,
      prixUnitaire: row.prix_unitaire ? parseFloat(row.prix_unitaire) : null,
      quantite: row.quantite ? parseFloat(row.quantite) : null,
      updatedAt: row.updated_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockClient = async (req, res) => {
  const { ingredientId } = req.params;
  const { quantite, prixUnitaire, dateStock } = req.body;
  const ds = dateStock || todayStr();

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    await pool.query(
      `INSERT INTO stock_client_daily (client_id, ingredient_id, date_stock, quantite, prix_unitaire, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (client_id, ingredient_id, date_stock)
       DO UPDATE SET quantite = $4, prix_unitaire = $5, updated_at = NOW()`,
      [req.user.id, ingredientId, ds, quantite ?? null, prixUnitaire ?? null]
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
  const dateStock = req.query.date || todayStr();
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
              sed.quantite, sed.prix_unitaire, sed.updated_at
       FROM activite_ingredient_selections ais
       JOIN ingredients i ON ais.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN stock_entreprise_daily sed ON sed.ingredient_id = i.id AND sed.activite_id = $1 AND sed.date_stock = $3
       WHERE ais.activite_id = $1
       ORDER BY c.nom NULLS LAST, i.nom`,
      [activiteId, req.user.id, dateStock]
    );
    res.json(result.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite_nom,
      categorie: row.categorie,
      prixUnitaire: row.prix_unitaire ? parseFloat(row.prix_unitaire) : null,
      quantite: row.quantite ? parseFloat(row.quantite) : null,
      updatedAt: row.updated_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockEntreprise = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  const { quantite, prixUnitaire, dateStock } = req.body;
  const ds = dateStock || todayStr();

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
      `INSERT INTO stock_entreprise_daily (activite_id, ingredient_id, date_stock, quantite, prix_unitaire, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (activite_id, ingredient_id, date_stock)
       DO UPDATE SET quantite = $4, prix_unitaire = $5, updated_at = NOW()`,
      [activiteId, ingredientId, ds, quantite ?? null, prixUnitaire ?? null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Copy all stock entries from one franchise activity to all other franchise activities of the same company
const duplicateStockToFranchise = async (req, res) => {
  const { activiteId } = req.params;
  const dateStock = req.query.date || todayStr();
  try {
    const check = await pool.query(
      `SELECT a.id, a.entreprise_id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2 AND a.type = 'franchise'`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité franchise introuvable' });

    const entrepriseId = check.rows[0].entreprise_id;

    const source = await pool.query(
      'SELECT ingredient_id, quantite, prix_unitaire FROM stock_entreprise_daily WHERE activite_id = $1 AND date_stock = $2',
      [activiteId, dateStock]
    );

    const others = await pool.query(
      "SELECT id FROM activites WHERE entreprise_id = $1 AND type = 'franchise' AND id != $2",
      [entrepriseId, activiteId]
    );

    for (const act of others.rows) {
      for (const row of source.rows) {
        await pool.query(
          `INSERT INTO stock_entreprise_daily (activite_id, ingredient_id, date_stock, quantite, prix_unitaire, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (activite_id, ingredient_id, date_stock) DO UPDATE SET quantite = $4, prix_unitaire = $5, updated_at = NOW()`,
          [act.id, row.ingredient_id, dateStock, row.quantite, row.prix_unitaire]
        );
      }
    }

    res.json({ duplicatedTo: others.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getStockClient, updateStockClient, getStockEntreprise, updateStockEntreprise, duplicateStockToFranchise };
