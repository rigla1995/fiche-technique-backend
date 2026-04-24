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
  compteType: row.compte_type || 'independant',
  onboardingStep: row.onboarding_step ?? 0,
  active: row.actif,
  createdAt: row.created_at,
});

const list = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nom, email, telephone, role, compte_type, onboarding_step, actif, created_at
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
      `SELECT id, nom, email, telephone, role, compte_type, onboarding_step, actif, created_at
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

  const compteType = req.body.compteType || req.body.compte_type || 'independant';
  const nom = req.body.name || req.body.nom;
  const { email, telephone, adresse } = req.body;
  const domaineId = req.body.domaineId || req.body.domaine_id || null;

  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  if (!email) return res.status(400).json({ message: 'Email requis' });

  // Check tel uniqueness
  if (telephone) {
    const telCheck = await pool.query(
      'SELECT id FROM utilisateurs WHERE telephone = $1',
      [telephone]
    );
    if (telCheck.rows.length > 0)
      return res.status(409).json({ message: 'Ce numéro de téléphone est déjà utilisé' });
  }

  const tempPassword = crypto.randomBytes(8).toString('hex');

  try {
    const existing = await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }

    const hash = await bcrypt.hash(tempPassword, 10);

    // onboarding_step: 0 for independant (no onboarding), 1 for entreprise (must complete onboarding)
    const onboardingStep = compteType === 'entreprise' ? 1 : 0;

    const userResult = await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, compte_type, onboarding_step)
       VALUES ($1, $2, $3, $4, 'client', $5, $6)
       RETURNING id, nom, email, telephone, role, compte_type, onboarding_step, actif, created_at`,
      [nom, email, hash, telephone || null, compteType, onboardingStep]
    );

    const user = userResult.rows[0];

    // Create profil_entreprise with the provided info
    await pool.query(
      `INSERT INTO profil_entreprise (client_id, nom, email, telephone, adresse)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_id) DO NOTHING`,
      [user.id, nom, email, telephone || null, adresse || null]
    );

    // For independant: also create the first activity immediately
    if (compteType === 'independant') {
      const entrepriseResult = await pool.query(
        'SELECT id FROM profil_entreprise WHERE client_id = $1',
        [user.id]
      );
      if (entrepriseResult.rows.length > 0) {
        await pool.query(
          `INSERT INTO activites (entreprise_id, nom, email, telephone, adresse, domaine_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [entrepriseResult.rows[0].id, nom, email, telephone || null, adresse || null, domaineId || null]
        );
      }
    }

    const responseData = mapClient(user);
    responseData.temporaryPassword = tempPassword;
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
  const compteType = req.body.compteType || req.body.compte_type;
  const onboardingStep = req.body.onboardingStep !== undefined ? req.body.onboardingStep : null;

  // Check tel uniqueness (exclude current user)
  if (telephone) {
    const telCheck = await pool.query(
      'SELECT id FROM utilisateurs WHERE telephone = $1 AND id != $2',
      [telephone, id]
    );
    if (telCheck.rows.length > 0)
      return res.status(409).json({ message: 'Ce numéro de téléphone est déjà utilisé' });
  }

  try {
    const result = await pool.query(
      `UPDATE utilisateurs
       SET nom = COALESCE($1, nom),
           email = COALESCE($2, email),
           telephone = COALESCE($3, telephone),
           actif = COALESCE($4, actif),
           compte_type = COALESCE($5, compte_type),
           onboarding_step = COALESCE($6, onboarding_step),
           updated_at = NOW()
       WHERE id = $7 AND role = 'client'
       RETURNING id, nom, email, telephone, role, compte_type, onboarding_step, actif, created_at`,
      [nom || null, email || null, telephone || null, activeValue !== undefined ? activeValue : null, compteType || null, onboardingStep !== null ? onboardingStep : null, id]
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
