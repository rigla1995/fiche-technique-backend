const pool = require('../config/database');
const { sendInviteEmail, generateInviteToken } = require('../services/emailService');

const mapGerant = (row) => ({
  id: row.id,
  nom: row.nom,
  email: row.email,
  telephone: row.telephone,
  parentId: row.gerant_parent_id,
  activiteId: row.gerant_activite_id,
  activiteType: row.gerant_activite_type,
  estGratuit: row.gerant_est_gratuit,
  montantMensuel: row.gerant_montant_mensuel,
  actif: row.actif,
  createdAt: row.created_at,
  activatedAt: row.activated_at || null,
});

// GET /api/gerants — list gérants for current user (indep or entreprise)
const list = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nom, email, telephone, gerant_parent_id, gerant_activite_id,
              gerant_activite_type, gerant_est_gratuit, gerant_montant_mensuel, actif, created_at, activated_at
       FROM utilisateurs
       WHERE role = 'gerant' AND gerant_parent_id = $1
       ORDER BY nom`,
      [req.user.id]
    );
    res.json(result.rows.map(mapGerant));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/gerants — create a new gérant account
const create = async (req, res) => {
  const { nom, telephone, email, activiteId, activiteType, estGratuit, montantMensuel } = req.body;
  if (!nom || !telephone || !email) {
    return res.status(400).json({ message: 'Nom, téléphone et email requis' });
  }

  const parentId = req.user.id;
  const parentType = req.user.compteType; // 'independant' | 'entreprise' | null (config-based)

  // Check free gérant limit
  const existing = await pool.query(
    `SELECT COUNT(*) FROM utilisateurs WHERE role = 'gerant' AND gerant_parent_id = $1 AND gerant_est_gratuit = true`,
    [parentId]
  );
  const freeCount = parseInt(existing.rows[0].count, 10);
  const isEntrepriseClass = parentType === 'entreprise' || parentType === null;
  const freeLimit = isEntrepriseClass ? 3 : 1;

  const isGratuit = estGratuit !== false && freeCount < freeLimit;
  const montant = isGratuit ? 0 : (montantMensuel || 80);

  // Check email uniqueness
  const emailCheck = await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
  if (emailCheck.rows.length > 0) return res.status(409).json({ message: 'Email déjà utilisé' });

  const inviteToken = generateInviteToken();
  const inviteExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);

  try {
    const result = await pool.query(
      `INSERT INTO utilisateurs
         (nom, email, mot_de_passe, telephone, role, compte_type,
          gerant_parent_id, gerant_activite_id, gerant_activite_type,
          gerant_est_gratuit, gerant_montant_mensuel, invite_token, invite_token_expires_at)
       VALUES ($1, $2, NULL, $3, 'gerant', $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, nom, email, telephone, gerant_parent_id, gerant_activite_id,
                 gerant_activite_type, gerant_est_gratuit, gerant_montant_mensuel, actif, created_at`,
      [nom, email, telephone, parentType,
       parentId, activiteId || null, activiteType || null,
       isGratuit, montant, inviteToken, inviteExpires]
    );
    await sendInviteEmail({ to: email, nom, token: inviteToken, role: 'gerant' });
    res.status(201).json(mapGerant(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/gerants/:id — update gérant (nom, tel, activite, actif)
const update = async (req, res) => {
  const { id } = req.params;
  const { nom, telephone, activiteId, activiteType, actif } = req.body;

  try {
    const result = await pool.query(
      `UPDATE utilisateurs
       SET nom = COALESCE($1, nom),
           telephone = COALESCE($2, telephone),
           gerant_activite_id = COALESCE($3, gerant_activite_id),
           gerant_activite_type = COALESCE($4, gerant_activite_type),
           actif = COALESCE($5, actif),
           updated_at = NOW()
       WHERE id = $6 AND role = 'gerant' AND gerant_parent_id = $7
       RETURNING id, nom, email, telephone, gerant_parent_id, gerant_activite_id,
                 gerant_activite_type, gerant_est_gratuit, gerant_montant_mensuel, actif, created_at`,
      [nom || null, telephone || null, activiteId || null, activiteType || null,
       actif !== undefined ? actif : null, id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Gérant introuvable' });
    res.json(mapGerant(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/gerants/:id
const remove = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM utilisateurs WHERE id = $1 AND role = 'gerant' AND gerant_parent_id = $2 RETURNING id`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Gérant introuvable' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, create, update, remove };
