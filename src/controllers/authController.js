const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const pool = require('../config/database');

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
    const isValid = await bcrypt.compare(password, utilisateur.mot_de_passe);

    if (!isValid) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    const token = jwt.sign(
      { userId: utilisateur.id, role: utilisateur.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      token,
      user: {
        id: utilisateur.id,
        name: utilisateur.nom,
        email: utilisateur.email,
        role: utilisateur.role,
        compteType: utilisateur.compte_type || 'independant',
        onboardingStep: utilisateur.onboarding_step ?? 0,
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
      'SELECT id, nom, email, telephone, role, compte_type, onboarding_step FROM utilisateurs WHERE id = $1',
      [req.user.id]
    );
    const u = result.rows[0];
    let step = u.onboarding_step ?? 0;

    // Auto-heal: advance enterprise users who are blocked at onboarding steps they've already completed.
    // Uses profil_entreprise directly to avoid a JOIN that fails when the row doesn't exist.
    if (step > 0 && u.compte_type === 'entreprise') {
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
          // Has company profile but no activities yet → password was already changed, advance to step 2
          step = 2;
          await pool.query(
            'UPDATE utilisateurs SET onboarding_step = 2, updated_at = NOW() WHERE id = $1',
            [u.id]
          );
        }
      }
    }

    let entrepriseName = null;
    if (u.compte_type === 'entreprise') {
      const epRes = await pool.query('SELECT nom FROM profil_entreprise WHERE client_id = $1', [u.id]);
      if (epRes.rows.length > 0) entrepriseName = epRes.rows[0].nom;
    }
    res.json({ id: u.id, name: u.nom, email: u.email, phone: u.telephone, role: u.role, compteType: u.compte_type || 'independant', onboardingStep: step, entrepriseName });
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

module.exports = { login, register, me, updateProfile, upgradeToEntreprise, advanceOnboarding };
