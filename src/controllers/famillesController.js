const { validationResult } = require('express-validator');
const pool = require('../config/database');

const mapFamille = (row) => ({
  id: row.id,
  name: row.nom,
  clientId: row.client_id,
  createdAt: row.created_at,
});

const list = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const result = await pool.query(
      'SELECT * FROM familles WHERE client_id = $1 ORDER BY nom',
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
  try {
    const result = await pool.query(
      'INSERT INTO familles (nom, client_id) VALUES ($1, $2) RETURNING *',
      [nom, clientId]
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
  try {
    const result = await pool.query(
      'UPDATE familles SET nom = $1 WHERE id = $2 AND client_id = $3 RETURNING *',
      [nom, req.params.id, clientId]
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
