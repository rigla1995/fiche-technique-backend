const pool = require('../config/database');

const mapDemande = (row) => ({
  id: row.id,
  demandeurId: row.demandeur_id,
  demandeurNom: row.demandeur_nom,
  demandeurType: row.demandeur_type,
  typeDemande: row.type_demande,
  statut: row.statut,
  montantMensuelDt: row.montant_mensuel_dt,
  notesClient: row.notes_client,
  notesAdmin: row.notes_admin,
  traitePar: row.traite_par,
  traiteParNom: row.traite_par_nom,
  traite_le: row.traite_le,
  createdAt: row.created_at,
});

// POST /api/demandes — client creates a request
const create = async (req, res) => {
  const { typeDemande, notes } = req.body;
  const allowed = ['gerant_sup', 'labo_sup'];
  if (!allowed.includes(typeDemande)) return res.status(400).json({ message: 'Type invalide' });

  try {
    // Fetch tarif
    const cle = typeDemande === 'labo_sup' ? 'labo_sup_mensuel' : 'gerant_sup_mensuel';
    const tarifRes = await pool.query('SELECT valeur_dt FROM tarifs_config WHERE cle = $1', [cle]);
    const montant = tarifRes.rows[0]?.valeur_dt || null;

    const result = await pool.query(
      `INSERT INTO demandes (demandeur_id, demandeur_type, type_demande, montant_mensuel_dt, notes_client)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, req.user.compteType, typeDemande, montant, notes || null]
    );
    res.status(201).json(mapDemande(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/demandes — client lists their own requests
const listMine = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.nom AS demandeur_nom, NULL AS traite_par_nom
       FROM demandes d
       LEFT JOIN utilisateurs u ON u.id = d.demandeur_id
       WHERE d.demandeur_id = $1
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows.map(mapDemande));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /admin/demandes — admin lists all
const listAll = async (req, res) => {
  const { statut } = req.query;
  try {
    const params = [];
    let where = '';
    if (statut) { params.push(statut); where = `WHERE d.statut = $1`; }

    const result = await pool.query(
      `SELECT d.*, u.nom AS demandeur_nom, a.nom AS traite_par_nom
       FROM demandes d
       LEFT JOIN utilisateurs u ON u.id = d.demandeur_id
       LEFT JOIN utilisateurs a ON a.id = d.traite_par
       ${where}
       ORDER BY d.created_at DESC`,
      params
    );
    res.json(result.rows.map(mapDemande));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /admin/demandes/:id — admin validates or refuses
const traiter = async (req, res) => {
  const { id } = req.params;
  const { statut, notesAdmin } = req.body;
  if (!['validée', 'refusée'].includes(statut)) {
    return res.status(400).json({ message: 'Statut doit être "validée" ou "refusée"' });
  }
  try {
    const result = await pool.query(
      `UPDATE demandes
       SET statut = $1, notes_admin = COALESCE($2, notes_admin),
           traite_par = $3, traite_le = NOW()
       WHERE id = $4
       RETURNING *`,
      [statut, notesAdmin || null, req.user.id, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Demande introuvable' });
    res.json(mapDemande(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { create, listMine, listAll, traiter };
