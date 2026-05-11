const pool = require('../config/database');

const list = async (req, res) => {
  try {
    const { hasIngredients } = req.query;
    const isSuperAdmin = req.user?.role === 'super_admin';

    let query, params = [];

    if (isSuperAdmin) {
      query = hasIngredients === 'true'
        ? `SELECT d.* FROM domaines_activite d
           WHERE EXISTS (SELECT 1 FROM ingredient_domaines id WHERE id.domaine_id = d.id)
           ORDER BY d.nom`
        : 'SELECT * FROM domaines_activite ORDER BY nom';
    } else {
      // Return only domaines linked to the client:
      // - independant: via client_domaines
      // - entreprise: via activites.domaine_id (where activite belongs to client's entreprise)
      const clientId = req.user.gerant_parent_id || req.user.id;
      query = `
        SELECT DISTINCT d.id, d.nom
        FROM domaines_activite d
        WHERE d.id IN (
          SELECT cd.domaine_id FROM client_domaines cd WHERE cd.client_id = $1
          UNION
          SELECT a.domaine_id FROM activites a
          JOIN profil_entreprise pe ON pe.id = a.entreprise_id
          WHERE pe.client_id = $1 AND a.domaine_id IS NOT NULL
        )
        ORDER BY d.nom
      `;
      params = [clientId];
    }

    const result = await pool.query(query, params);
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

const update = async (req, res) => {
  const { id } = req.params;
  const { nom } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });
  try {
    const result = await pool.query(
      'UPDATE domaines_activite SET nom = $1 WHERE id = $2 RETURNING *',
      [nom.trim(), id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Domaine introuvable' });
    res.json({ id: result.rows[0].id, nom: result.rows[0].nom });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Ce domaine existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM domaines_activite WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Domaine introuvable' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, create, update, remove };
