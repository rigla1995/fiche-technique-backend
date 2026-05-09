const { validationResult } = require('express-validator');
const pool = require('../config/database');
const { createAbonnement } = require('./abonnementController');
const { generateInviteToken } = require('../services/emailService');

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
  activatedAt: row.activated_at || null,
  domaineIds: row.domaine_ids || [],
});

const saveClientDomaines = async (client, clientId, domaineIds) => {
  await client.query('DELETE FROM client_domaines WHERE client_id = $1', [clientId]);
  if (domaineIds && domaineIds.length > 0) {
    const values = domaineIds.map((_, i) => `($1, $${i + 2})`).join(', ');
    await client.query(
      `INSERT INTO client_domaines (client_id, domaine_id) VALUES ${values} ON CONFLICT DO NOTHING`,
      [clientId, ...domaineIds]
    );
  }
};

const list = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.nom, u.email, u.telephone, u.role, u.compte_type, u.onboarding_step, u.actif, u.created_at, u.activated_at,
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT cd.domaine_id), NULL) as domaine_ids
       FROM utilisateurs u
       LEFT JOIN client_domaines cd ON cd.client_id = u.id
       WHERE u.role = 'client'
       GROUP BY u.id
       ORDER BY u.nom`
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
      `SELECT u.id, u.nom, u.email, u.telephone, u.role, u.compte_type, u.onboarding_step, u.actif, u.created_at,
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT cd.domaine_id), NULL) as domaine_ids
       FROM utilisateurs u
       LEFT JOIN client_domaines cd ON cd.client_id = u.id
       WHERE u.id = $1 AND u.role = 'client'
       GROUP BY u.id`,
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
  const domaineIds = Array.isArray(req.body.domaineIds) ? req.body.domaineIds.map(Number).filter(Boolean) : [];

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

  try {
    const existing = await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }

    const inviteToken = generateInviteToken();
    const inviteExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // onboarding_step: 0 for independant (no onboarding), 1 for entreprise (must complete onboarding)
    const onboardingStep = compteType === 'entreprise' ? 1 : 0;

    // Transaction: create user + profil + activite + domaines
    let user;
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      const userResult = await dbClient.query(
        `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, compte_type, onboarding_step, invite_token, invite_token_expires_at)
         VALUES ($1, $2, NULL, $3, 'client', $4, $5, $6, $7)
         RETURNING id, nom, email, telephone, role, compte_type, onboarding_step, actif, created_at`,
        [nom, email, telephone || null, compteType, onboardingStep, inviteToken, inviteExpires]
      );
      user = userResult.rows[0];

      const peResult = await dbClient.query(
        `INSERT INTO profil_entreprise (client_id, nom, email, telephone, adresse)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (client_id) DO NOTHING
         RETURNING id`,
        [user.id, nom, email, telephone || null, adresse || null]
      );

      if (compteType === 'independant' && peResult.rows.length > 0) {
        await dbClient.query(
          `INSERT INTO activites (entreprise_id, nom, email, telephone, adresse) VALUES ($1, $2, $3, $4, $5)`,
          [peResult.rows[0].id, nom, email, telephone || null, adresse || null]
        );
      }

      if (compteType === 'independant' && domaineIds.length > 0) {
        await saveClientDomaines(dbClient, user.id, domaineIds);
      }

      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }

    // Outside transaction: subscription (email sent later when admin confirms)
    const tarifCle = compteType === 'entreprise' ? 'entreprise_onboarding' : 'indep_onboarding';
    const tarifRes = await pool.query('SELECT valeur_dt FROM tarifs_config WHERE cle = $1', [tarifCle]);
    const montantOnboarding = tarifRes.rows[0]?.valeur_dt || null;
    await createAbonnement(user.id, compteType, montantOnboarding);

    res.status(201).json({
      ...mapClient(user),
      domaineIds,
    });
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
  const domaineIds = Array.isArray(req.body.domaineIds) ? req.body.domaineIds.map(Number).filter(Boolean) : null;

  // Check tel uniqueness (exclude current user)
  if (telephone) {
    const telCheck = await pool.query(
      'SELECT id FROM utilisateurs WHERE telephone = $1 AND id != $2',
      [telephone, id]
    );
    if (telCheck.rows.length > 0)
      return res.status(409).json({ message: 'Ce numéro de téléphone est déjà utilisé' });
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const result = await dbClient.query(
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
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Client introuvable' });
    }

    const updatedUser = result.rows[0];

    // Sync abonnement compte_type
    if (compteType) {
      await dbClient.query(
        `UPDATE abonnements SET compte_type = $1, updated_at = NOW() WHERE client_id = $2`,
        [compteType, id]
      );
    }

    // Update domain assignments if provided (only meaningful for indép accounts)
    if (domaineIds !== null) {
      await saveClientDomaines(dbClient, id, domaineIds);
    }

    await dbClient.query('COMMIT');

    // Return with fresh domaineIds
    const domainesRes = await pool.query(
      'SELECT domaine_id FROM client_domaines WHERE client_id = $1',
      [id]
    );
    res.json({ ...mapClient(updatedUser), domaineIds: domainesRes.rows.map((r) => r.domaine_id) });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    dbClient.release();
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
