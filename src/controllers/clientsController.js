const { validationResult } = require('express-validator');
const pool = require('../config/database');
const { createAbonnement, insertPromoForAbonnement } = require('./abonnementController');
const { generateInviteToken, sendWelcomeWithContractEmail } = require('../services/emailService');
const { generateContratPdf } = require('../services/pdfService');

const mapClient = (row) => ({
  id: row.id,
  name: row.nom,
  email: row.email,
  phone: row.telephone,
  role: row.role,
  compteType: row.compte_type || null,
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

  const nom = req.body.name || req.body.nom;
  const { email, telephone, adresse } = req.body;
  const domaineIds = Array.isArray(req.body.domaineIds) ? req.body.domaineIds.map(Number).filter(Boolean) : [];

  // New config-based fields (new modal flow)
  const nbActivites  = req.body.nbActivites  ? parseInt(req.body.nbActivites)  : null;
  const nbLabos      = req.body.nbLabos      ? parseInt(req.body.nbLabos)      : null;
  const nbGerants    = req.body.nbGerants    ? parseInt(req.body.nbGerants)    : null;
  const montantOnboardingConfig = req.body.montantOnboarding != null ? parseFloat(req.body.montantOnboarding) : null;
  const contractPdfBase64 = req.body.contractPdfBase64 || null;

  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  if (!email) return res.status(400).json({ message: 'Email requis' });

  if (telephone) {
    const telCheck = await pool.query('SELECT id FROM utilisateurs WHERE telephone = $1', [telephone]);
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

    let user;
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      const userResult = await dbClient.query(
        `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, onboarding_step, invite_token, invite_token_expires_at)
         VALUES ($1, $2, NULL, $3, 'client', 1, $4, $5)
         RETURNING id, nom, email, telephone, role, onboarding_step, actif, created_at`,
        [nom, email, telephone || null, inviteToken, inviteExpires]
      );
      user = userResult.rows[0];

      const peResult = await dbClient.query(
        `INSERT INTO profil_entreprise (client_id, nom, email, telephone, adresse)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (client_id) DO NOTHING
         RETURNING id`,
        [user.id, nom, email, telephone || null, adresse || null]
      );

      if (domaineIds.length > 0) {
        await saveClientDomaines(dbClient, user.id, domaineIds);
      }

      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }

    // Create abonnement with config if provided
    const config = nbActivites != null ? {
      nbActivites, nbLabos: nbLabos || 0, nbGerants: nbGerants || 0,
      montantOnboarding: montantOnboardingConfig || 0,
    } : null;

    let montantOnboarding = montantOnboardingConfig;
    if (!config) {
      const tarifRes = await pool.query(`SELECT valeur_dt FROM tarifs_config WHERE cle = 'entreprise_onboarding'`);
      montantOnboarding = tarifRes.rows[0]?.valeur_dt || null;
    }

    const aboId = await createAbonnement(user.id, montantOnboarding, config);

    // Create promotions passed during client creation
    const promotions = Array.isArray(req.body.promotions) ? req.body.promotions : [];
    if (promotions.length > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      for (const promoData of promotions) {
        await insertPromoForAbonnement(aboId, todayStr, promoData, req.user.id);
      }
    }

    // Auto-generate contract PDF and send welcome email
    try {
      const aboConfig = config || {};
      const pdfBase64 = contractPdfBase64 || await generateContratPdf({
        nom,
        email,
        telephone: telephone || null,
        adresse: adresse || null,
        montantMensuel: montantOnboarding || null,
        nbActivites: aboConfig.nbActivites ?? 1,
        nbLabos: aboConfig.nbLabos ?? 0,
        nbGerants: aboConfig.nbGerants ?? 0,
        dateContrat: new Date(),
      });
      await sendWelcomeWithContractEmail({ to: email, nom, token: inviteToken, contractPdfBase64: pdfBase64 });
      await pool.query(`UPDATE utilisateurs SET invite_sent = TRUE WHERE id = $1`, [user.id]).catch(() => {});
    } catch (emailErr) {
      console.error('Welcome email error:', emailErr.message);
    }

    res.status(201).json({ ...mapClient(user), domaineIds });
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
           onboarding_step = COALESCE($5, onboarding_step),
           updated_at = NOW()
       WHERE id = $6 AND role = 'client'
       RETURNING id, nom, email, telephone, role, onboarding_step, actif, created_at`,
      [nom || null, email || null, telephone || null, activeValue !== undefined ? activeValue : null, onboardingStep !== null ? onboardingStep : null, id]
    );
    if (result.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Client introuvable' });
    }

    const updatedUser = result.rows[0];

    // Update domain assignments if provided
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
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const check = await dbClient.query(
      "SELECT id FROM utilisateurs WHERE id = $1 AND role = 'client'",
      [id]
    );
    if (check.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Client introuvable' });
    }

    // Collect all user IDs owned by this client (client + its gérants)
    const usersRes = await dbClient.query(
      "SELECT id FROM utilisateurs WHERE id = $1 OR gerant_parent_id = $1",
      [id]
    );
    const userIds = usersRes.rows.map((r) => r.id);
    const uPlaceholders = userIds.map((_, i) => `$${i + 1}`).join(', ');

    // SET NULL on created_by columns that have no ON DELETE action.
    // Use SAVEPOINT per table so a missing table/column doesn't abort the transaction.
    const auditTables = [
      'stock_client_daily', 'stock_entreprise_daily', 'stock_labo_daily',
      'client_pertes', 'pertes', 'labo_transfers', 'inventaires', 'ventes',
    ];
    for (const t of auditTables) {
      await dbClient.query('SAVEPOINT sp_audit');
      try {
        await dbClient.query(
          `UPDATE ${t} SET created_by = NULL WHERE created_by IN (${uPlaceholders})`,
          userIds
        );
        await dbClient.query('RELEASE SAVEPOINT sp_audit');
      } catch (_) {
        await dbClient.query('ROLLBACK TO SAVEPOINT sp_audit');
      }
    }

    // Delete RESTRICT-blocked tables before cascade reaches articles/produits/unites.
    // produit_ingredients references articles (ingredient_id RESTRICT) and unites (unite_id RESTRICT)
    await dbClient.query(
      `DELETE FROM produit_ingredients WHERE produit_id IN (
         SELECT id FROM produits WHERE client_id = $1
       )`,
      [id]
    );
    // produit_sous_produits references produits (sous_produit_id RESTRICT)
    await dbClient.query(
      `DELETE FROM produit_sous_produits
       WHERE produit_id IN (SELECT id FROM produits WHERE client_id = $1)
          OR sous_produit_id IN (SELECT id FROM produits WHERE client_id = $1)`,
      [id]
    );
    // article_vendable_prix_historique may not exist in all deployments
    await dbClient.query('SAVEPOINT sp_avph');
    try {
      await dbClient.query(
        `DELETE FROM article_vendable_prix_historique
         WHERE article_id IN (SELECT id FROM articles WHERE client_id = $1)`,
        [id]
      );
      await dbClient.query('RELEASE SAVEPOINT sp_avph');
    } catch (_) {
      await dbClient.query('ROLLBACK TO SAVEPOINT sp_avph');
    }

    // Delete the client — all remaining data cascades automatically:
    //   utilisateurs → profil_entreprise → activites/labos/fournisseurs → stock/pertes/ventes/inventaires
    //   utilisateurs → abonnements → paiements/promotions/abonnement_config
    //   utilisateurs → unites/articles/produits/categories/familles/client_domaines/...
    //   utilisateurs → gérant child accounts (gerant_parent_id CASCADE)
    await dbClient.query(
      "DELETE FROM utilisateurs WHERE id = $1 AND role = 'client'",
      [id]
    );

    await dbClient.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Client delete error:', err);
    res.status(500).json({ message: 'Erreur lors de la suppression du client' });
  } finally {
    dbClient.release();
  }
};

module.exports = { list, getById, create, update, remove };
