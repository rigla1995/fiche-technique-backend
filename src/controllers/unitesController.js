const { validationResult } = require('express-validator');
const pool = require('../config/database');

const mapUnite = (row) => ({
  id: row.id,
  name: row.nom,
  clientId: row.client_id,
  clientName: row.client_nom,
  hasAppros: row.has_appros === true,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const list = async (req, res) => {
  try {
    let query, params;

    if (req.user.role === 'super_admin') {
      query = `
        SELECT u.*, util.nom as client_nom
        FROM unites u
        LEFT JOIN utilisateurs util ON u.client_id = util.id
        ORDER BY u.nom
      `;
      params = [];
    } else if (req.query.all === 'true') {
      // All units (for support forms / ingredient lookup) — read-only, no client data exposed
      query = 'SELECT * FROM unites ORDER BY nom';
      params = [];
    } else {
      query = `SELECT u.*,
               EXISTS (
                 SELECT 1 FROM articles a WHERE a.unite_id = u.id AND a.client_id = $1
                 AND (EXISTS (SELECT 1 FROM stock_entreprise_daily   WHERE ingredient_id = a.id) OR
                      EXISTS (SELECT 1 FROM stock_labo_daily         WHERE ingredient_id = a.id))
               ) AS has_appros
               FROM unites u WHERE u.client_id = $1 ORDER BY u.nom`;
      params = [req.user.gerant_parent_id || req.user.id];
    }

    const result = await pool.query(query, params);
    res.json(result.rows.map(mapUnite));
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
  const clientId = req.user.role === 'super_admin' ? (req.body.clientId || req.body.client_id || null) : (req.user.gerant_parent_id || req.user.id);

  try {
    const result = await pool.query(
      'INSERT INTO unites (nom, client_id) VALUES ($1, $2) RETURNING *',
      [nom, clientId]
    );
    res.status(201).json(mapUnite(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Cette unité existe déjà' });
    }
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

  try {
    let query, params;
    if (req.user.role === 'super_admin') {
      query = 'UPDATE unites SET nom = $1, updated_at = NOW() WHERE id = $2 RETURNING *';
      params = [nom, id];
    } else {
      query = 'UPDATE unites SET nom = $1, updated_at = NOW() WHERE id = $2 AND client_id = $3 RETURNING *';
      params = [nom, id, req.user.gerant_parent_id || req.user.id];
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Unité introuvable' });
    }
    res.json(mapUnite(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Cette unité existe déjà' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  const clientId = req.user.gerant_parent_id || req.user.id;

  try {
    if (req.user.role !== 'super_admin') {
      const appro = await pool.query(
        `SELECT 1 FROM articles a WHERE a.unite_id = $1 AND a.client_id = $2
         AND (
           EXISTS (SELECT 1 FROM stock_entreprise_daily WHERE ingredient_id = a.id LIMIT 1)
           OR EXISTS (SELECT 1 FROM stock_labo_daily     WHERE ingredient_id = a.id LIMIT 1)
         ) LIMIT 1`,
        [id, clientId]
      );
      if (appro.rows.length > 0) {
        return res.status(409).json({ message: "Cette unité est utilisée par des articles avec des approvisionnements et ne peut pas être supprimée" });
      }
    }

    let query, params;
    if (req.user.role === 'super_admin') {
      query = 'DELETE FROM unites WHERE id = $1 RETURNING id';
      params = [id];
    } else {
      query = 'DELETE FROM unites WHERE id = $1 AND client_id = $2 RETURNING id';
      params = [id, clientId];
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Unité introuvable' });
    }
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ message: 'Cette unité est utilisée et ne peut pas être supprimée' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, create, update, remove };
