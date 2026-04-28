const pool = require('../config/database');

const createPerte = async (req, res) => {
  const { activiteId } = req.params;
  const { ingredientId, quantite, typePerte, datePerte } = req.body;

  if (!ingredientId || !quantite || !typePerte || !datePerte)
    return res.status(400).json({ message: 'Champs requis: ingredientId, quantite, typePerte, datePerte' });
  if (!['avarie', 'dechet'].includes(typePerte))
    return res.status(400).json({ message: 'typePerte invalide (avarie|dechet)' });

  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const r = await pool.query(
      `INSERT INTO pertes (activite_id, ingredient_id, quantite, type_perte, date_perte)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [activiteId, ingredientId, quantite, typePerte, datePerte]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const listPertes = async (req, res) => {
  const { activiteId } = req.params;
  const { ingredientId } = req.query;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const params = [activiteId];
    let extra = '';
    if (ingredientId) { params.push(ingredientId); extra = `AND p.ingredient_id = $${params.length}`; }

    const result = await pool.query(
      `SELECT p.id, p.ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
              p.quantite, p.type_perte, p.date_perte, p.created_at
       FROM pertes p
       JOIN ingredients i ON i.id = p.ingredient_id
       JOIN unites u ON i.unite_id = u.id
       WHERE p.activite_id = $1 ${extra}
       ORDER BY p.date_perte DESC, p.created_at DESC`,
      params
    );
    res.json(result.rows.map((r) => ({
      id: r.id,
      ingredientId: r.ingredient_id,
      ingredientNom: r.ingredient_nom,
      uniteNom: r.unite_nom,
      quantite: parseFloat(r.quantite),
      typePerte: r.type_perte,
      datePerte: r.date_perte instanceof Date ? r.date_perte.toISOString().slice(0, 10) : String(r.date_perte).slice(0, 10),
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { createPerte, listPertes };
