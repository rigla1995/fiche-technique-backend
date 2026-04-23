const pool = require('../config/database');

const list = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM domaines_activite ORDER BY nom');
    res.json(result.rows.map((r) => ({ id: r.id, nom: r.nom })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const create = async (req, res) => {
  const { nom } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });
  try {
    const result = await pool.query(
      'INSERT INTO domaines_activite (nom) VALUES ($1) RETURNING *',
      [nom.trim()]
    );
    res.status(201).json({ id: result.rows[0].id, nom: result.rows[0].nom });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Ce domaine existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, create };
