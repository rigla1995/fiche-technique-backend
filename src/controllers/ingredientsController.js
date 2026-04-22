const { validationResult } = require('express-validator');
const pool = require('../config/database');

const mapIngredient = (row) => ({
  id: row.id,
  name: row.nom,
  price: row.prix !== undefined ? parseFloat(row.prix) : undefined,
  unitId: row.unite_id,
  unitName: row.unite_nom,
  clientId: row.client_id,
  clientName: row.client_nom,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const list = async (req, res) => {
  try {
    let query, params;

    if (req.user.role === 'super_admin') {
      query = `
        SELECT i.*, u.nom as unite_nom, util.nom as client_nom
        FROM ingredients i
        JOIN unites u ON i.unite_id = u.id
        JOIN utilisateurs util ON i.client_id = util.id
        ORDER BY i.nom
      `;
      params = [];
    } else {
      query = `
        SELECT i.*, u.nom as unite_nom
        FROM ingredients i
        JOIN unites u ON i.unite_id = u.id
        WHERE i.client_id = $1
        ORDER BY i.nom
      `;
      params = [req.user.id];
    }

    const result = await pool.query(query, params);
    res.json(result.rows.map(mapIngredient));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT i.*, u.nom as unite_nom
       FROM ingredients i
       JOIN unites u ON i.unite_id = u.id
       WHERE i.id = $1 AND i.client_id = $2`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ingrédient introuvable' });
    }
    res.json(mapIngredient(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const nom = req.body.name || req.body.nom;
  const prix = req.body.price !== undefined ? req.body.price : req.body.prix;
  const unite_id = req.body.unitId || req.body.unite_id;
  const clientId = req.user.id;

  try {
    const uniteCheck = await pool.query(
      'SELECT id FROM unites WHERE id = $1 AND (client_id = $2 OR client_id IS NULL)',
      [unite_id, clientId]
    );
    if (uniteCheck.rows.length === 0) {
      return res.status(400).json({ message: 'Unité invalide' });
    }

    const inserted = await pool.query(
      `INSERT INTO ingredients (nom, prix, unite_id, client_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [nom, prix, unite_id, clientId]
    );
    const result = await pool.query(
      `SELECT i.*, u.nom as unite_nom
       FROM ingredients i
       JOIN unites u ON i.unite_id = u.id
       WHERE i.id = $1`,
      [inserted.rows[0].id]
    );
    res.status(201).json(mapIngredient(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const update = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const nom = req.body.name || req.body.nom;
  const prix = req.body.price !== undefined ? req.body.price : req.body.prix;
  const unite_id = req.body.unitId || req.body.unite_id;
  const clientId = req.user.id;

  try {
    if (unite_id) {
      const uniteCheck = await pool.query(
        'SELECT id FROM unites WHERE id = $1 AND (client_id = $2 OR client_id IS NULL)',
        [unite_id, clientId]
      );
      if (uniteCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Unité invalide' });
      }
    }

    const updated = await pool.query(
      `UPDATE ingredients
       SET nom = COALESCE($1, nom),
           prix = COALESCE($2, prix),
           unite_id = COALESCE($3, unite_id),
           updated_at = NOW()
       WHERE id = $4 AND client_id = $5
       RETURNING id`,
      [nom, prix, unite_id, id, clientId]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ message: 'Ingrédient introuvable' });
    }
    const result = await pool.query(
      `SELECT i.*, u.nom as unite_nom
       FROM ingredients i
       JOIN unites u ON i.unite_id = u.id
       WHERE i.id = $1`,
      [updated.rows[0].id]
    );
    res.json(mapIngredient(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM ingredients WHERE id = $1 AND client_id = $2 RETURNING id',
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ingrédient introuvable' });
    }
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ message: 'Cet ingrédient est utilisé dans un produit et ne peut pas être supprimé' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, getById, create, update, remove };
