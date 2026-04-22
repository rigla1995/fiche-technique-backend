const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const pool = require('../config/database');

const mapClient = (row) => ({
  id: row.id,
  name: row.nom,
  email: row.email,
  phone: row.telephone,
  role: row.role,
  active: row.actif,
  createdAt: row.created_at,
});

const list = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nom, email, telephone, role, actif, created_at
       FROM utilisateurs WHERE role = 'client' ORDER BY nom`
    );
    res.json(result.rows.map(mapClient));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, nom, email, telephone, role, actif, created_at
       FROM utilisateurs WHERE id = $1 AND role = 'client'`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Client introuvable' });
    }
    res.json(mapClient(result.rows[0]));
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
  const { email } = req.body;
  const telephone = req.body.telephone || req.body.phone;
  const providedPassword = req.body.password || req.body.mot_de_passe;
  const tempPassword = providedPassword || crypto.randomBytes(8).toString('hex');

  try {
    const existing = await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }

    const hash = await bcrypt.hash(tempPassword, 10);
    const result = await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role)
       VALUES ($1, $2, $3, $4, 'client')
       RETURNING id, nom, email, telephone, role, actif, created_at`,
      [nom, email, hash, telephone || null]
    );
    const responseData = mapClient(result.rows[0]);
    if (!providedPassword) responseData.temporaryPassword = tempPassword;
    res.status(201).json(responseData);
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
  const { email, active, actif } = req.body;
  const telephone = req.body.telephone || req.body.phone;
  const activeValue = active !== undefined ? active : actif;

  try {
    const result = await pool.query(
      `UPDATE utilisateurs
       SET nom = COALESCE($1, nom),
           email = COALESCE($2, email),
           telephone = COALESCE($3, telephone),
           actif = COALESCE($4, actif),
           updated_at = NOW()
       WHERE id = $5 AND role = 'client'
       RETURNING id, nom, email, telephone, role, actif, created_at`,
      [nom || null, email || null, telephone || null, activeValue !== undefined ? activeValue : null, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Client introuvable' });
    }
    res.json(mapClient(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM utilisateurs WHERE id = $1 AND role = 'client' RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Client introuvable' });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, getById, create, update, remove };
