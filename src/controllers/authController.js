const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const pool = require('../config/database');
const { sendInviteEmail, generateInviteToken } = require('../services/emailService');

const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email } = req.body;
  const password = req.body.password || req.body.mot_de_passe;

  try {
    const result = await pool.query(
      'SELECT * FROM utilisateurs WHERE email = $1 AND actif = true',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const utilisateur = result.rows[0];

    // super_admin and pre-invite accounts (have a password but no activated_at) bypass the invite check
    const needsActivation = !utilisateur.activated_at && utilisateur.role !== 'super_admin' && !utilisateur.mot_de_passe;
    if (needsActivation) {
      return res.status(403).json({ message: 'invite_pending', detail: 'Votre compte n\'est pas encore activé. Consultez votre email d\'invitation.' });
    }

    const isValid = await bcrypt.compare(password, utilisateur.mot_de_passe);

    if (!isValid) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const token = jwt.sign(
      { userId: utilisateur.id, role: utilisateur.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // For gérants, resolve compte_type from the parent client
    let compteType = utilisateur.compte_type || 'independant';
    let onboardingStep = utilisateur.onboarding_step ?? 0;
    if (utilisateur.role === 'gerant' && utilisateur.gerant_parent_id) {
      const parentRes = await pool.query(
        'SELECT compte_type FROM utilisateurs WHERE id = $1',
        [utilisateur.gerant_parent_id]
      );
      compteType = parentRes.rows[0]?.compte_type || 'independant';
      onboardingStep = 0; // gérants skip onboarding
    }

    res.json({
      token,
      user: {
        id: utilisateur.id,
        name: utilisateur.nom,
        email: utilisateur.email,
        role: utilisateur.role,
        compteType,
        onboardingStep,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { nom, email, mot_de_passe, telephone } = req.body;

  try {
    const existing = await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }

    const hash = await bcrypt.hash(mot_de_passe, 10);
    const result = await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role)
       VALUES ($1, $2, $3, $4, 'client')
       RETURNING id, nom, email, telephone, role, created_at`,
      [nom, email, hash, telephone || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const me = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.nom, u.email, u.telephone, u.role,
              COALESCE(u.compte_type, p.compte_type) AS compte_type,
              u.onboarding_step,
              u.gerant_parent_id, u.gerant_activite_id, u.gerant_activite_type
       FROM utilisateurs u
       LEFT JOIN utilisateurs p ON p.id = u.gerant_parent_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    const u = result.rows[0];
    const isGerant = u.role === 'gerant';
    // Gérants bypass onboarding entirely — use parent's step if needed but never block them
    let step = isGerant ? 0 : (u.onboarding_step ?? 0);

    // Auto-heal: advance enterprise users who are blocked at onboarding steps they've already completed.
    if (!isGerant && step > 0 && u.compte_type === 'entreprise') {
      const epRes = await pool.query(
        'SELECT id FROM profil_entreprise WHERE client_id = $1',
        [u.id]
      );
      if (epRes.rows.length > 0) {
        const entrepriseId = epRes.rows[0].id;
        const actRes = await pool.query(
          'SELECT COUNT(*) FROM activites WHERE entreprise_id = $1',
          [entrepriseId]
        );
        const hasActivities = parseInt(actRes.rows[0].count) > 0;
        if (hasActivities) {
          const selRes = await pool.query(
            `SELECT COUNT(*) FROM activite_ingredient_selections ais
             JOIN activites a ON ais.activite_id = a.id
             WHERE a.entreprise_id = $1`,
            [entrepriseId]
          );
          const hasSelections = parseInt(selRes.rows[0].count) > 0;
          step = hasSelections ? 0 : 3;
          await pool.query(
            'UPDATE utilisateurs SET onboarding_step = $1, updated_at = NOW() WHERE id = $2',
            [step, u.id]
          );
        } else if (step === 1) {
          step = 2;
          await pool.query(
            'UPDATE utilisateurs SET onboarding_step = 2, updated_at = NOW() WHERE id = $1',
            [u.id]
          );
        }
      }
    }

    // entrepriseName: use parent's profil_entreprise for gérants
    let entrepriseName = null;
    if (u.compte_type === 'entreprise') {
      const clientId = isGerant ? u.gerant_parent_id : u.id;
      const epRes = await pool.query('SELECT nom FROM profil_entreprise WHERE client_id = $1', [clientId]);
      if (epRes.rows.length > 0) entrepriseName = epRes.rows[0].nom;
    }

    // Abonnement: use parent's abonnement for gérants
    const aboClientId = isGerant ? u.gerant_parent_id : u.id;
    const aboRes = await pool.query(
      'SELECT mode_compte, prolongation_jours FROM abonnements WHERE client_id = $1',
      [aboClientId]
    );
    const modeCompte = aboRes.rows[0]?.mode_compte || 'actif';
    const prolongationJours = aboRes.rows[0]?.prolongation_jours || 0;

    const gerantFields = isGerant ? {
      gerantParentId: u.gerant_parent_id,
      gerantActiviteId: u.gerant_activite_id,
      gerantActiviteType: u.gerant_activite_type,
    } : {};

    res.json({
      id: u.id, name: u.nom, email: u.email, phone: u.telephone,
      role: u.role, compteType: u.compte_type || 'independant',
      onboardingStep: step, entrepriseName,
      modeCompte, prolongationJours,
      ...gerantFields,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const advanceOnboarding = async (req, res) => {
  const { step } = req.body;
  if (typeof step !== 'number') return res.status(400).json({ message: 'step requis' });
  try {
    await pool.query(
      'UPDATE utilisateurs SET onboarding_step = $1, updated_at = NOW() WHERE id = $2',
      [step, req.user.id]
    );
    res.json({ onboardingStep: step });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const upgradeToEntreprise = async (req, res) => {
  if (req.user.compte_type === 'entreprise') {
    return res.json({ compteType: 'entreprise', message: 'Déjà un compte entreprise' });
  }
  try {
    await pool.query(
      `UPDATE utilisateurs SET compte_type = 'entreprise', updated_at = NOW() WHERE id = $1`,
      [req.user.id]
    );
    await pool.query(
      `INSERT INTO profil_entreprise (client_id, nom, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (client_id) DO NOTHING`,
      [req.user.id, req.user.nom, req.user.email]
    );
    res.json({ compteType: 'entreprise' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateProfile = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const nom = req.body.name || req.body.nom;
  const { email } = req.body;
  const telephone = req.body.telephone || req.body.phone;
  const newPassword = req.body.password || req.body.mot_de_passe;
  const currentPassword = req.body.currentPassword || req.body.mot_de_passe_actuel;

  try {
    const userResult = await pool.query(
      'SELECT * FROM utilisateurs WHERE id = $1',
      [req.user.id]
    );
    const user = userResult.rows[0];

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Mot de passe actuel requis pour changer le mot de passe' });
      }
      const isValid = await bcrypt.compare(currentPassword, user.mot_de_passe);
      if (!isValid) {
        return res.status(400).json({ message: 'Mot de passe actuel incorrect' });
      }
    }

    if (email && email !== user.email) {
      const existing = await pool.query('SELECT id FROM utilisateurs WHERE email = $1 AND id != $2', [email, req.user.id]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ message: 'Cet email est déjà utilisé' });
      }
    }

    const hashToSave = newPassword ? await bcrypt.hash(newPassword, 10) : null;

    const result = await pool.query(
      `UPDATE utilisateurs
       SET nom = COALESCE($1, nom),
           email = COALESCE($2, email),
           telephone = COALESCE($3, telephone),
           mot_de_passe = COALESCE($4, mot_de_passe),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, nom, email, telephone, role`,
      [nom || null, email || null, telephone || null, hashToSave, req.user.id]
    );

    const u = result.rows[0];
    res.json({ id: u.id, name: u.nom, email: u.email, phone: u.telephone, role: u.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const completeUpgradeWizard = async (req, res) => {
  const { activiteType, franchiseGroup, activiteNom } = req.body;
  if (!['franchise', 'distincte'].includes(activiteType)) {
    return res.status(400).json({ message: 'activiteType doit être "franchise" ou "distincte"' });
  }
  try {
    // Find the entreprise + the activite created during migration
    const peRes = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [req.user.id]);
    if (peRes.rows.length === 0) return res.status(404).json({ message: 'Profil entreprise introuvable' });
    const entrepriseId = peRes.rows[0].id;

    await pool.query(
      `UPDATE activites
       SET type = $1, franchise_group = $2, nom = COALESCE($3, nom), updated_at = NOW()
       WHERE entreprise_id = $4 AND type IS NULL`,
      [activiteType, franchiseGroup || null, activiteNom || null, entrepriseId]
    );

    await pool.query(
      'UPDATE utilisateurs SET onboarding_step = 0, updated_at = NOW() WHERE id = $1',
      [req.user.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Invitation helpers ────────────────────────────────────────────────────────

const verifyInviteToken = async (req, res) => {
  const { token } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, nom, email, role FROM utilisateurs
       WHERE invite_token = $1 AND invite_token_expires_at > NOW() AND activated_at IS NULL`,
      [token]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Lien invalide ou expiré' });
    const u = result.rows[0];
    res.json({ nom: u.nom, email: u.email, role: u.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const acceptInvite = async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 8)
    return res.status(400).json({ message: 'Token et mot de passe (8 caractères min) requis' });

  try {
    const result = await pool.query(
      `SELECT id, onboarding_step FROM utilisateurs
       WHERE invite_token = $1 AND invite_token_expires_at > NOW() AND activated_at IS NULL`,
      [token]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Lien invalide ou expiré' });

    const u = result.rows[0];
    const hash = await bcrypt.hash(password, 10);
    // If entreprise client was at step 1 (forced password change), skip it — invite flow already handles it
    const newStep = u.onboarding_step === 1 ? 2 : u.onboarding_step;
    await pool.query(
      `UPDATE utilisateurs
       SET mot_de_passe = $1, invite_token = NULL, invite_token_expires_at = NULL,
           activated_at = NOW(), onboarding_step = $2, updated_at = NOW()
       WHERE id = $3`,
      [hash, newStep, u.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const resendInvite = async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, nom, email, role FROM utilisateurs WHERE id = $1 AND activated_at IS NULL',
      [userId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Utilisateur introuvable ou déjà activé' });

    const u = result.rows[0];
    const token = generateInviteToken();
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await pool.query(
      'UPDATE utilisateurs SET invite_token = $1, invite_token_expires_at = $2, updated_at = NOW() WHERE id = $3',
      [token, expires, u.id]
    );
    await sendInviteEmail({ to: u.email, nom: u.nom, token, role: u.role });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  login, register, me, updateProfile, upgradeToEntreprise, advanceOnboarding, completeUpgradeWizard,
  verifyInviteToken, acceptInvite, resendInvite,
};
