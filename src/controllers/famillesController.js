const { validationResult } = require('express-validator');
const pool = require('../config/database');

const mapFamille = (row) => ({
  id: row.id,
  name: row.nom,
  consommable: row.consommable !== false,
  vendable: row.vendable !== false,
  hasAppros: row.has_appros === true,
  clientId: row.client_id,
  createdAt: row.created_at,
});

const list = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const result = await pool.query(
      `SELECT f.*,
              EXISTS (
                SELECT 1 FROM articles a
                JOIN categories c ON c.id = a.categorie_id
                WHERE c.famille_id = f.id AND a.client_id = $1
                AND (EXISTS (SELECT 1 FROM stock_entreprise_daily   WHERE ingredient_id = a.id) OR
                     EXISTS (SELECT 1 FROM stock_labo_daily         WHERE ingredient_id = a.id))
              ) AS has_appros
       FROM familles f WHERE f.client_id = $1 ORDER BY f.nom`,
      [clientId]
    );
    res.json(result.rows.map(mapFamille));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getById = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const result = await pool.query(
      'SELECT * FROM familles WHERE id = $1 AND client_id = $2',
      [req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Famille introuvable' });
    res.json(mapFamille(result.rows[0]));
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
  const consommable = req.body.consommable !== false;
  const vendable = req.body.vendable !== false;
  try {
    const result = await pool.query(
      'INSERT INTO familles (nom, client_id, consommable, vendable) VALUES ($1, $2, $3, $4) RETURNING *',
      [nom, clientId, consommable, vendable]
    );
    res.status(201).json(mapFamille(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Cette famille existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const update = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const clientId = req.user.gerant_parent_id || req.user.id;
  const nom = req.body.name || req.body.nom;
  const consommable = req.body.consommable !== undefined ? req.body.consommable !== false : undefined;
  const vendable = req.body.vendable !== undefined ? req.body.vendable !== false : undefined;
  try {
    const result = await pool.query(
      `UPDATE familles
       SET nom = $1,
           consommable = CASE WHEN $3::boolean THEN $2 ELSE consommable END,
           vendable = CASE WHEN $5::boolean THEN $4 ELSE vendable END
       WHERE id = $6 AND client_id = $7 RETURNING *`,
      [nom, consommable ?? true, consommable !== undefined, vendable ?? true, vendable !== undefined,
       req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Famille introuvable' });
    res.json(mapFamille(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Cette famille existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const remove = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const appro = await pool.query(
      `SELECT 1 FROM articles a
       JOIN categories c ON c.id = a.categorie_id
       WHERE c.famille_id = $1 AND a.client_id = $2
       AND (
         EXISTS (SELECT 1 FROM stock_entreprise_daily WHERE ingredient_id = a.id LIMIT 1)
         OR EXISTS (SELECT 1 FROM stock_labo_daily       WHERE ingredient_id = a.id LIMIT 1)
       ) LIMIT 1`,
      [req.params.id, clientId]
    );
    if (appro.rows.length > 0) {
      return res.status(409).json({ message: "Cette famille contient des articles avec des approvisionnements et ne peut pas être supprimée" });
    }
    const result = await pool.query(
      'DELETE FROM familles WHERE id = $1 AND client_id = $2 RETURNING id',
      [req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Famille introuvable' });
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ message: 'Cette famille est utilisée par des catégories' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, getById, create, update, remove };
