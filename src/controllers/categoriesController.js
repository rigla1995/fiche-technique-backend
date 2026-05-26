const { validationResult } = require('express-validator');
const pool = require('../config/database');

const mapCategorie = (row) => ({
  id: row.id,
  name: row.nom,
  familleId: row.famille_id || null,
  familleName: row.famille_nom || null,
  clientId: row.client_id || null,
  createdAt: row.created_at,
});

const list = async (req, res) => {
  const { onlyWithArticles, familleId } = req.query;
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const params = [clientId];
    let where = 'WHERE c.client_id = $1';

    if (familleId) {
      params.push(familleId);
      where += ` AND c.famille_id = $${params.length}`;
    }
    if (onlyWithArticles === 'true') {
      where += ' AND EXISTS (SELECT 1 FROM articles a WHERE a.categorie_id = c.id)';
    }

    const result = await pool.query(
      `SELECT c.*, f.nom as famille_nom
       FROM categories c
       LEFT JOIN familles f ON f.id = c.famille_id
       ${where}
       ORDER BY COALESCE(f.nom, 'zzz'), c.nom`,
      params
    );
    res.json(result.rows.map(mapCategorie));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getById = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const result = await pool.query(
      `SELECT c.*, f.nom as famille_nom
       FROM categories c LEFT JOIN familles f ON f.id = c.famille_id
       WHERE c.id = $1 AND c.client_id = $2`,
      [req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.json(mapCategorie(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const clientId = req.user.gerant_parent_id || req.user.id;
  const nom = req.body.name || req.body.nom;
  const famille_id = req.body.familleId || req.body.famille_id || null;

  try {
    const result = await pool.query(
      'INSERT INTO categories (nom, client_id, famille_id) VALUES ($1, $2, $3) RETURNING *',
      [nom, clientId, famille_id]
    );
    const row = result.rows[0];
    if (famille_id) {
      const f = await pool.query('SELECT nom FROM familles WHERE id = $1', [famille_id]);
      row.famille_nom = f.rows[0]?.nom || null;
    }
    res.status(201).json(mapCategorie(row));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Cette catégorie existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const update = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const clientId = req.user.gerant_parent_id || req.user.id;
  const nom = req.body.name || req.body.nom;
  const famille_id = req.body.familleId !== undefined ? req.body.familleId
    : req.body.famille_id !== undefined ? req.body.famille_id : undefined;
  const familleChanged = famille_id !== undefined;

  try {
    const result = await pool.query(
      `UPDATE categories
       SET nom = COALESCE($1, nom),
           famille_id = CASE WHEN $3::boolean THEN $2 ELSE famille_id END
       WHERE id = $4 AND client_id = $5 RETURNING *`,
      [nom, famille_id ?? null, familleChanged, req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    const row = result.rows[0];
    if (row.famille_id) {
      const f = await pool.query('SELECT nom FROM familles WHERE id = $1', [row.famille_id]);
      row.famille_nom = f.rows[0]?.nom || null;
    }
    res.json(mapCategorie(row));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Cette catégorie existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const remove = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const appro = await pool.query(
      `SELECT 1 FROM articles a WHERE a.categorie_id = $1 AND a.client_id = $2
       AND (
         EXISTS (SELECT 1 FROM stock_client_daily       WHERE ingredient_id = a.id LIMIT 1)
         OR EXISTS (SELECT 1 FROM stock_entreprise_daily WHERE ingredient_id = a.id LIMIT 1)
         OR EXISTS (SELECT 1 FROM stock_labo_daily       WHERE ingredient_id = a.id LIMIT 1)
       ) LIMIT 1`,
      [req.params.id, clientId]
    );
    if (appro.rows.length > 0) {
      return res.status(409).json({ message: "Cette catégorie contient des articles avec des approvisionnements et ne peut pas être supprimée" });
    }
    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1 AND client_id = $2 RETURNING id',
      [req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ message: "Cette catégorie est utilisée par des articles et ne peut pas être supprimée" });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, getById, create, update, remove };
