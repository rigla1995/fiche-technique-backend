const { validationResult } = require('express-validator');
const pool = require('../config/database');

const mapCategorie = (row) => ({
  id: row.id,
  name: row.nom,
  createdAt: row.created_at,
});

const list = async (req, res) => {
  const { onlyWithIngredients } = req.query;
  try {
    let query = 'SELECT * FROM categories ORDER BY nom';
    if (onlyWithIngredients === 'true') {
      query = `SELECT c.* FROM categories c
               WHERE EXISTS (SELECT 1 FROM ingredients i WHERE i.categorie_id = c.id)
               ORDER BY c.nom`;
    }
    const result = await pool.query(query);
    res.json(result.rows.map(mapCategorie));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Catégorie introuvable' });
    }
    res.json(mapCategorie(result.rows[0]));
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

  try {
    const result = await pool.query(
      'INSERT INTO categories (nom) VALUES ($1) RETURNING *',
      [nom]
    );
    res.status(201).json(mapCategorie(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Cette catégorie existe déjà' });
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
    const result = await pool.query(
      'UPDATE categories SET nom = $1 WHERE id = $2 RETURNING *',
      [nom, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Catégorie introuvable' });
    }
    res.json(mapCategorie(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Cette catégorie existe déjà' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Catégorie introuvable' });
    }
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ message: 'Cette catégorie est utilisée par des ingrédients et ne peut pas être supprimée' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, getById, create, update, remove };
