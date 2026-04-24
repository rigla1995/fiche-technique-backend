const pool = require('../config/database');

// ─── Stock Client ──────────────────────────────────────────────────────────

const getStockClient = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie,
              COALESCE(ipc.prix, i.prix) as prix_unitaire,
              sc.quantite, sc.date_achat, sc.updated_at
       FROM client_ingredient_selections cis
       JOIN ingredients i ON cis.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN ingredient_prix_client ipc ON ipc.ingredient_id = i.id AND ipc.client_id = $1
       LEFT JOIN stock_client sc ON sc.ingredient_id = i.id AND sc.client_id = $1
       WHERE cis.client_id = $1
       ORDER BY c.nom NULLS LAST, i.nom`,
      [req.user.id]
    );
    res.json(result.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite_nom,
      categorie: row.categorie,
      prixUnitaire: row.prix_unitaire ? parseFloat(row.prix_unitaire) : null,
      quantite: row.quantite ? parseFloat(row.quantite) : null,
      dateAchat: row.date_achat,
      updatedAt: row.updated_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockClient = async (req, res) => {
  const { ingredientId } = req.params;
  const { quantite, dateAchat } = req.body;

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    await pool.query(
      `INSERT INTO stock_client (client_id, ingredient_id, quantite, date_achat, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (client_id, ingredient_id)
       DO UPDATE SET quantite = $3, date_achat = $4, updated_at = NOW()`,
      [req.user.id, ingredientId, quantite || null, dateAchat || null]
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
              COALESCE(ipc.prix, i.prix) as prix_unitaire,
              se.quantite, se.date_achat, se.updated_at
       FROM activite_ingredient_selections ais
       JOIN ingredients i ON ais.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN ingredient_prix_client ipc ON ipc.ingredient_id = i.id AND ipc.client_id = $2
       LEFT JOIN stock_entreprise se ON se.ingredient_id = i.id AND se.activite_id = $1
       WHERE ais.activite_id = $1
       ORDER BY c.nom NULLS LAST, i.nom`,
      [activiteId, req.user.id]
    );
    res.json(result.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite_nom,
      categorie: row.categorie,
      prixUnitaire: row.prix_unitaire ? parseFloat(row.prix_unitaire) : null,
      quantite: row.quantite ? parseFloat(row.quantite) : null,
      dateAchat: row.date_achat,
      updatedAt: row.updated_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockEntreprise = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  const { quantite, dateAchat } = req.body;

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
      `INSERT INTO stock_entreprise (activite_id, ingredient_id, quantite, date_achat, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (activite_id, ingredient_id)
       DO UPDATE SET quantite = $3, date_achat = $4, updated_at = NOW()`,
      [activiteId, ingredientId, quantite || null, dateAchat || null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getStockClient, updateStockClient, getStockEntreprise, updateStockEntreprise };
