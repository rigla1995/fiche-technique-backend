const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const pool = require('../config/database');
const { sendInviteEmail, generateInviteToken, sendPasswordResetEmail } = require('../services/emailService');
const { encryptPassword } = require('../services/passwordCryptoService');
const { invalidateAuthCache } = require('../middleware/auth');

// Mot de passe robuste : ≥8 car., 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial.
const isStrongPassword = (v) =>
  typeof v === 'string' && v.length >= 8 &&
  /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v) && /[@$!%*?&_\-#]/.test(v);
const WEAK_PWD_MSG = 'Mot de passe trop faible : minimum 8 caractères, avec majuscule, minuscule, chiffre et caractère spécial.';

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
    const needsActivation = !utilisateur.activated_at && utilisateur.role !== 'super_admin' && utilisateur.role !== 'boss' && !utilisateur.mot_de_passe;
    if (needsActivation) {
      return res.status(403).json({ message: 'invite_pending', detail: 'Votre compte n\'est pas encore activé. Consultez votre email d\'invitation.' });
    }

    const isValid = await bcrypt.compare(password, utilisateur.mot_de_passe);

    if (!isValid) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }

    // Check if account is blocked (boss hérite du super_admin : jamais blocable)
    if (utilisateur.role !== 'super_admin' && utilisateur.role !== 'boss') {
      const aboClientId = utilisateur.role === 'gerant' ? utilisateur.gerant_parent_id : utilisateur.id;
      if (aboClientId) {
        const aboCheck = await pool.query(
          'SELECT mode_compte FROM abonnements WHERE client_id = $1',
          [aboClientId]
        );
        if (aboCheck.rows[0]?.mode_compte === 'bloque') {
          return res.status(403).json({ message: 'account_blocked' });
        }
      }
    }

    const token = jwt.sign(
      { userId: utilisateur.id, role: utilisateur.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    const onboardingStep = utilisateur.role === 'gerant' ? 0 : (utilisateur.onboarding_step ?? 0);

    // Affectations + accès acheteurs dès le LOGIN (comme /auth/me) : la sidebar et
    // le guard de l'Espace Acheteurs en dépendent — le front ne rappelle /auth/me
    // qu'au montage, pas après un login SPA. Même chargement (avec repli legacy)
    // que le middleware authenticate.
    let gerantFields = {};
    if (utilisateur.role === 'gerant') {
      const aff = await pool.query(
        'SELECT activite_id, labo_id FROM gerant_affectations WHERE gerant_id = $1',
        [utilisateur.id]
      );
      let gerantActiviteIds = aff.rows.filter((r) => r.activite_id != null).map((r) => Number(r.activite_id));
      let gerantLaboIds = aff.rows.filter((r) => r.labo_id != null).map((r) => Number(r.labo_id));
      if (gerantActiviteIds.length === 0 && gerantLaboIds.length === 0 && utilisateur.gerant_activite_id) {
        if (utilisateur.gerant_activite_type === 'labo') gerantLaboIds = [Number(utilisateur.gerant_activite_id)];
        else gerantActiviteIds = [Number(utilisateur.gerant_activite_id)];
      }
      gerantFields = {
        gerantParentId: utilisateur.gerant_parent_id,
        gerantActiviteId: utilisateur.gerant_activite_id,
        gerantActiviteType: utilisateur.gerant_activite_type,
        gerantActiviteIds,
        gerantLaboIds,
        gerantAccesAcheteurs: utilisateur.gerant_acces_acheteurs === true,
      };
    }

    // Compteurs d'activités/labos dès le LOGIN (comme /auth/me) : la redirection
    // d'accueil du front en dépend — sans eux, un client déjà configuré était
    // envoyé vers « Mes Activités » au lieu du tableau de bord jusqu'au refresh.
    let clientCounts = {};
    if (utilisateur.role === 'client') {
      const entRes = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [utilisateur.id]);
      if (entRes.rows.length > 0) {
        const c = await pool.query(
          `SELECT (SELECT COUNT(*) FROM activites WHERE entreprise_id = $1) AS activites_count,
                  (SELECT COUNT(*) FROM labos WHERE entreprise_id = $1) AS labos_count`,
          [entRes.rows[0].id]
        );
        clientCounts = {
          activitesCount: parseInt(c.rows[0].activites_count) || 0,
          labosCount: parseInt(c.rows[0].labos_count) || 0,
        };
      } else {
        clientCounts = { activitesCount: 0, labosCount: 0 };
      }
    }

    res.json({
      token,
      user: {
        id: utilisateur.id,
        name: utilisateur.nom,
        email: utilisateur.email,
        role: utilisateur.role,
        onboardingStep,
        ...gerantFields,
        ...clientCounts,
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
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, mot_de_passe_enc)
       VALUES ($1, $2, $3, $4, 'client', $5)
       RETURNING id, nom, email, telephone, role, created_at`,
      [nom, email, hash, telephone || null, encryptPassword(mot_de_passe)]
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
              u.onboarding_step,
              u.gerant_parent_id, u.gerant_activite_id, u.gerant_activite_type
       FROM utilisateurs u
       WHERE u.id = $1`,
      [req.user.id]
    );
    const u = result.rows[0];
    const isGerant = u.role === 'gerant';
    // Gérants bypass onboarding entirely — use parent's step if needed but never block them
    let step = isGerant ? 0 : (u.onboarding_step ?? 0);

    const epClientId = isGerant ? u.gerant_parent_id : u.id;
    const aboClientId = isGerant ? u.gerant_parent_id : u.id;

    // Fetch profil_entreprise, abonnement, and gérant activité name in parallel
    const [epRes, aboRes, gerantNomRes] = await Promise.all([
      epClientId
        ? pool.query('SELECT id, nom FROM profil_entreprise WHERE client_id = $1', [epClientId])
        : Promise.resolve({ rows: [] }),
      pool.query('SELECT mode_compte, prolongation_jours FROM abonnements WHERE client_id = $1', [aboClientId]),
      isGerant && u.gerant_activite_id
        ? pool.query(
            u.gerant_activite_type === 'labo'
              ? 'SELECT nom FROM labos WHERE id = $1'
              : 'SELECT nom FROM activites WHERE id = $1',
            [u.gerant_activite_id]
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const entrepriseId = epRes.rows[0]?.id || null;
    let entrepriseName = epRes.rows[0]?.nom || null;
    const modeCompte = aboRes.rows[0]?.mode_compte || 'actif';
    const prolongationJours = aboRes.rows[0]?.prolongation_jours || 0;
    const gerantActiviteNom = gerantNomRes.rows[0]?.nom || null;

    // Auto-heal: advance clients who are blocked at onboarding steps they've already completed.
    // Also collect activitesCount/labosCount in the same query to avoid an extra round trip.
    // Compte « dépôt » (labo + acheteurs, 0 activité) : les sélections LABO débloquent
    // aussi l'étape 3 (sinon un compte sans activité restait coincé pour toujours).
    let activitesCount = 0;
    let labosCount = 0;
    // Onboarding/compteurs : uniquement pour les vrais clients. Un super_admin ou
    // un Boss (ex-client dont le profil_entreprise subsiste) n'exécute jamais cette
    // logique — évite un JOIN d'auto-heal inutile à chaque appel /auth/me.
    if (u.role === 'client' && entrepriseId) {
      if (step > 0) {
        const healRes = await pool.query(
          `SELECT
             COUNT(DISTINCT a.id) > 0 AS has_activities,
             COUNT(DISTINCT l.id) > 0 AS has_labos,
             COUNT(DISTINCT ais.activite_id) > 0 AS has_selections,
             COUNT(DISTINCT lis.labo_id) > 0 AS has_labo_selections,
             COUNT(DISTINCT a.id) AS activites_count,
             COUNT(DISTINCT l.id) AS labos_count
           FROM profil_entreprise pe
           LEFT JOIN activites a ON a.entreprise_id = pe.id
           LEFT JOIN labos l ON l.entreprise_id = pe.id
           LEFT JOIN activite_ingredient_selections ais ON ais.activite_id = a.id
           LEFT JOIN labo_ingredient_selections lis ON lis.labo_id = l.id
           WHERE pe.id = $1`,
          [entrepriseId]
        );
        const row = healRes.rows[0];
        activitesCount = parseInt(row.activites_count) || 0;
        labosCount = parseInt(row.labos_count) || 0;
        const hasActivitiesOrLabos = row.has_activities || row.has_labos;
        if (hasActivitiesOrLabos) {
          step = (row.has_selections || row.has_labo_selections) ? 0 : 3;
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
      } else {
        const actCountRes = await pool.query(
          `SELECT
             (SELECT COUNT(*) FROM activites WHERE entreprise_id = $1) AS activites_count,
             (SELECT COUNT(*) FROM labos WHERE entreprise_id = $1) AS labos_count`,
          [entrepriseId]
        );
        activitesCount = parseInt(actCountRes.rows[0].activites_count) || 0;
        labosCount = parseInt(actCountRes.rows[0].labos_count) || 0;
      }
    }

    const gerantFields = isGerant ? {
      gerantParentId: u.gerant_parent_id,
      gerantActiviteId: u.gerant_activite_id,
      gerantActiviteType: u.gerant_activite_type,
      gerantActiviteNom,
      gerantActiviteIds: req.user.gerantActiviteIds || [],
      gerantLaboIds: req.user.gerantLaboIds || [],
      gerantAccesAcheteurs: req.user.gerant_acces_acheteurs === true,
    } : {};

    res.json({
      id: u.id, name: u.nom, email: u.email, phone: u.telephone,
      role: u.role,
      onboardingStep: step, entrepriseName,
      modeCompte, prolongationJours,
      activitesCount,
      labosCount,
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
      if (!isStrongPassword(newPassword)) {
        return res.status(400).json({ message: WEAK_PWD_MSG });
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
    const encToSave = newPassword ? encryptPassword(newPassword) : null;

    const result = await pool.query(
      `UPDATE utilisateurs
       SET nom = COALESCE($1, nom),
           email = COALESCE($2, email),
           telephone = COALESCE($3, telephone),
           mot_de_passe = COALESCE($4, mot_de_passe),
           mot_de_passe_enc = CASE WHEN $4::text IS NOT NULL THEN $6 ELSE mot_de_passe_enc END,
           password_changed_at = CASE WHEN $4::text IS NOT NULL THEN NOW() ELSE password_changed_at END,
           updated_at = NOW()
       WHERE id = $5
       RETURNING id, nom, email, telephone, role`,
      [nom || null, email || null, telephone || null, hashToSave, req.user.id, encToSave]
    );
    if (newPassword) invalidateAuthCache(req.user.id); // révocation immédiate des anciens JWT

    const u = result.rows[0];
    res.json({ id: u.id, name: u.nom, email: u.email, phone: u.telephone, role: u.role });
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
  if (!token) return res.status(400).json({ message: 'Token requis' });
  if (!isStrongPassword(password)) return res.status(400).json({ message: WEAK_PWD_MSG });

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
       SET mot_de_passe = $1, mot_de_passe_enc = $4, invite_token = NULL, invite_token_expires_at = NULL,
           activated_at = NOW(), onboarding_step = $2, password_changed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [hash, newStep, u.id, encryptPassword(password)]
    );
    // Record digital contract acceptance for main client accounts
    if (u.role === 'client') {
      const clientIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
      await pool.query(
        `UPDATE abonnements SET contrat_accepte_le = NOW(), contrat_accepte_ip = $1, updated_at = NOW()
         WHERE client_id = $2 AND contrat_accepte_le IS NULL`,
        [clientIp, u.id]
      );
    }
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

// ── Mot de passe oublié ───────────────────────────────────────────────────────
// Réponse TOUJOURS identique (200 {ok}) quel que soit l'email : pas d'énumération
// de comptes. Le token (1 h) est distinct du flux d'invitation — un compte non
// activé (sans mot de passe) reste sur le flux invite.

const forgotPassword = async (req, res) => {
  const email = String(req.body?.email || '').trim();
  // Réponse identique ET immédiate quel que soit l'email : sans ça, l'attente de
  // l'envoi Resend (~centaines de ms) trahirait l'existence du compte (timing).
  res.json({ ok: true });
  if (!email) return;
  (async () => {
    const result = await pool.query(
      `SELECT id, nom, email FROM utilisateurs
       WHERE LOWER(email) = LOWER($1) AND actif = true AND mot_de_passe IS NOT NULL`,
      [email]
    );
    if (result.rows.length === 0) return;

    const u = result.rows[0];
    const token = generateInviteToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    await pool.query(
      'UPDATE utilisateurs SET reset_token = $1, reset_token_expires_at = $2, updated_at = NOW() WHERE id = $3',
      [token, expires, u.id]
    );
    await sendPasswordResetEmail({ to: u.email, nom: u.nom, token });
  })().catch((err) => console.error('forgotPassword:', err));
};

const verifyResetToken = async (req, res) => {
  const { token } = req.params;
  try {
    const result = await pool.query(
      `SELECT nom, email FROM utilisateurs
       WHERE reset_token = $1 AND reset_token_expires_at > NOW()`,
      [token]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Lien invalide ou expiré' });
    const u = result.rows[0];
    res.json({ nom: u.nom, email: u.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (!token) return res.status(400).json({ message: 'Token requis' });
  if (!isStrongPassword(password)) return res.status(400).json({ message: WEAK_PWD_MSG });

  try {
    const result = await pool.query(
      `SELECT id FROM utilisateurs
       WHERE reset_token = $1 AND reset_token_expires_at > NOW()`,
      [token]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Lien invalide ou expiré' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE utilisateurs
       SET mot_de_passe = $1, mot_de_passe_enc = $3, reset_token = NULL, reset_token_expires_at = NULL,
           password_changed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [hash, result.rows[0].id, encryptPassword(password)]
    );
    invalidateAuthCache(result.rows[0].id); // révocation immédiate des anciens JWT
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  login, register, me, updateProfile, advanceOnboarding,
  verifyInviteToken, acceptInvite, resendInvite,
  forgotPassword, verifyResetToken, resetPassword,
};
