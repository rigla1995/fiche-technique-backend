const { validationResult } = require('express-validator');
const pool = require('../config/database');

const mapCategorie = (row) => ({
  id: row.id,
  name: row.nom,
  clientId: row.client_id || null,
  produitsCount: row.produits_count !== undefined ? Number(row.produits_count) : undefined,
  createdAt: row.created_at,
});

const list = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const result = await pool.query(
      `SELECT cp.*,
              (SELECT COUNT(*) FROM produits p WHERE p.categorie_produit_id = cp.id) AS produits_count
       FROM categories_produit cp
       WHERE cp.client_id = $1
       ORDER BY cp.nom`,
      [clientId]
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
      'SELECT * FROM categories_produit WHERE id = $1 AND client_id = $2',
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
  const nom = (req.body.name || req.body.nom || '').trim();

  try {
    const result = await pool.query(
      'INSERT INTO categories_produit (nom, client_id) VALUES ($1, $2) RETURNING *',
      [nom, clientId]
    );
    res.status(201).json(mapCategorie(result.rows[0]));
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
  const nom = (req.body.name || req.body.nom || '').trim();

  try {
    const result = await pool.query(
      'UPDATE categories_produit SET nom = $1 WHERE id = $2 AND client_id = $3 RETURNING *',
      [nom, req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.json(mapCategorie(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Cette catégorie existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const remove = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    // categorie_produit_id sur produits et activite_articles_vendables est ON DELETE SET NULL,
    // donc la suppression est toujours possible (les produits deviennent sans catégorie).
    const result = await pool.query(
      'DELETE FROM categories_produit WHERE id = $1 AND client_id = $2 RETURNING id',
      [req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, getById, create, update, remove };
