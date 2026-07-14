const { validationResult } = require('express-validator');
const pool = require('../config/database');
const { createAbonnement, insertPromoForAbonnement, computeEffectivePricing } = require('./abonnementController');
const { generateInviteToken, sendWelcomeWithContractEmail, sendDocusealSigningEmail } = require('../services/emailService');
const { generateContratPdf } = require('../services/pdfService');
const {
  createContractSubmission, createSubmission, createSubmissionFromPdf,
  isConfigured: docusealConfigured, isConfiguredPdf: docusealPdfConfigured,
} = require('../services/docusealService');
const { buildContratDocument, buildResiliationDocument } = require('../services/contractPdfService');

// Formatage pour les champs Docuseal
const fmtDtC = (n) => (n != null ? `${Math.round(Number(n))} DT` : '—');
const fmtDateC = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

// Construit les champs promo du contrat à partir du détail tarifaire effectif.
// Retourne { montantOnboarding, montantMensuel, extraFields } pour la soumission Docuseal.
const buildContractPricingFields = (pricing) => {
  if (!pricing) return { montantOnboarding: null, montantMensuel: null, extraFields: [] };
  const { baseOnboarding, effOnboarding, baseMensuel, effMensuel, promoMens, promoOb, promoMonths, baseResumeDate, hasPromo } = pricing;

  let detail;
  if (!hasPromo) {
    detail = 'Aucune promotion — tarifs standard.';
  } else {
    const parts = [];
    if (promoOb) {
      parts.push(effOnboarding === 0
        ? "Frais d'activation offerts (au lieu de " + fmtDtC(baseOnboarding) + ')'
        : `Frais d'activation : ${fmtDtC(effOnboarding)} au lieu de ${fmtDtC(baseOnboarding)}`);
    }
    if (promoMens) {
      let m = effMensuel === 0
        ? `Mensualité offerte (au lieu de ${fmtDtC(baseMensuel)})`
        : `Mensualité : ${fmtDtC(effMensuel)} au lieu de ${fmtDtC(baseMensuel)}`;
      if (promoMonths) m += ` pendant ${promoMonths} mois`;
      if (baseResumeDate) m += `, puis ${fmtDtC(baseMensuel)} à partir du ${fmtDateC(baseResumeDate)}`;
      parts.push(m);
    }
    detail = parts.join('  ·  ');
  }

  // Formule d'activités + option Acheteurs : nouvelles lignes du contrat (le
  // template Docuseal doit porter les champs éponymes, cf docuseal-templates/CHAMPS.md ;
  // createSubmission ignore proprement les champs absents d'un template en retard).
  const formuleLabel = pricing.formuleActivites
    ? (pricing.formuleActivites === 'basique' ? 'Activité Basique' : 'Activité Premium')
    : '';
  const acheteursLabel = pricing.palierAcheteurs
    ? `Palier jusqu'à ${pricing.palierAcheteurs} acheteurs`
    : '';

  return {
    montantOnboarding: effOnboarding,
    montantMensuel: effMensuel,
    extraFields: [
      { name: 'Formule', default_value: formuleLabel },
      { name: 'Option Acheteurs', default_value: acheteursLabel },
      { name: 'Détail promotion', default_value: detail },
      { name: 'Mensualité après promo', default_value: hasPromo && promoMens ? fmtDtC(baseMensuel) : '' },
      { name: 'Reprise prix de base', default_value: baseResumeDate ? fmtDateC(baseResumeDate) : '' },
    ],
  };
};

// Soumission Docuseal du contrat : d'abord le flux « PDF rempli » (document généré
// par client, prestataire pré-signé — createSubmissionFromPdf), avec REPLI sur le
// flux template historique si la génération ou l'API échoue, ou si seul le template
// est configuré. Retourne { submissionId, signingUrl } dans les deux cas.
const submitContratForSignature = async ({ aboId, pricing, nom, email, telephone, adresse, config, montantOnboarding }) => {
  if (docusealPdfConfigured() && pricing) {
    try {
      const docu = await buildContratDocument({
        abonnementId: aboId,
        client: { nom, email, telephone, adresse },
        config,
        pricing,
        montantOnboarding,
      });
      return await createSubmissionFromPdf({
        pdfBase64: docu.base64,
        documentName: docu.documentName,
        clientName: nom,
        clientEmail: email,
      });
    } catch (e) {
      console.error('[docuseal] flux PDF rempli échoué, repli sur le template:', e.message);
    }
  }
  const pf = buildContractPricingFields(pricing);
  return createContractSubmission({
    clientName: nom,
    clientEmail: email,
    nbActivites:       config.nbActivites ?? 1,
    nbLabos:           config.nbLabos ?? 0,
    nbGerants:         config.nbGerants ?? 0,
    montantOnboarding: pf.montantOnboarding ?? montantOnboarding ?? null,
    montantMensuel:    pf.montantMensuel ?? null,
    extraFields:       pf.extraFields,
  });
};

// Acte de résiliation : même logique PDF rempli → repli template.
const submitResiliationForSignature = async ({ id, nom, email }) => {
  const clientName = nom || 'Client';
  if (docusealPdfConfigured()) {
    try {
      const docu = await buildResiliationDocument({ clientId: id, client: { nom: clientName, email } });
      return await createSubmissionFromPdf({
        pdfBase64: docu.base64,
        documentName: docu.documentName,
        clientName,
        clientEmail: email,
      });
    } catch (e) {
      console.error('[resiliation] flux PDF rempli échoué, repli sur le template:', e.message);
    }
  }
  return createSubmission({ type: 'resiliation', clientName, clientEmail: email });
};

const mapClient = (row) => ({
  id: row.id,
  name: row.nom,
  email: row.email,
  phone: row.telephone,
  role: row.role,
  onboardingStep: row.onboarding_step ?? 0,
  active: row.actif,
  createdAt: row.created_at,
  activatedAt: row.activated_at || null,
  domaineIds: row.domaine_ids || [],
  // Adresse portée par profil_entreprise (fiche « Consulter » côté admin)
  adresse: row.adresse ?? null,
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
      `SELECT u.id, u.nom, u.email, u.telephone, u.role, u.onboarding_step, u.actif, u.created_at, u.activated_at,
              pe.adresse,
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT cd.domaine_id), NULL) as domaine_ids
       FROM utilisateurs u
       LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
       LEFT JOIN client_domaines cd ON cd.client_id = u.id
       WHERE u.role = 'client'
       GROUP BY u.id, pe.adresse
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
      `SELECT u.id, u.nom, u.email, u.telephone, u.role, u.onboarding_step, u.actif, u.created_at,
              pe.adresse,
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT cd.domaine_id), NULL) as domaine_ids
       FROM utilisateurs u
       LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
       LEFT JOIN client_domaines cd ON cd.client_id = u.id
       WHERE u.id = $1 AND u.role = 'client'
       GROUP BY u.id, pe.adresse`,
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

  // New config-based fields (new modal flow).
  // != null (et pas truthy) : 0 activité est valide (compte dépôt = labo + acheteurs).
  const nbActivites  = req.body.nbActivites  != null ? parseInt(req.body.nbActivites)  : null;
  const nbLabos      = req.body.nbLabos      != null ? parseInt(req.body.nbLabos)      : null;
  const nbGerants    = req.body.nbGerants    != null ? parseInt(req.body.nbGerants)    : null;
  // Option Acheteurs à la création : quota = borne du palier (0 = pas d'option)
  const nbAcheteurs  = req.body.nbAcheteurs  != null ? parseInt(req.body.nbAcheteurs)  : 0;
  // Formule des activités : basique | premium (défaut premium quand il y a des activités)
  const formuleActivites = req.body.formuleActivites === 'basique' ? 'basique' : 'premium';
  const montantOnboardingConfig = req.body.montantOnboarding != null ? parseFloat(req.body.montantOnboarding) : null;
  const contractPdfBase64 = req.body.contractPdfBase64 || null;

  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  if (!email) return res.status(400).json({ message: 'Email requis' });
  if (nbActivites === 0 && (nbLabos || 0) < 1) {
    return res.status(400).json({ message: 'Un compte sans activité doit avoir au moins un labo (compte dépôt)' });
  }
  // Un labo seul n'est pas une composition valide : la base Labo se combine avec
  // des activités et/ou l'option Acheteurs (labo+activités / labo+acheteurs / les trois).
  if (nbActivites === 0 && nbAcheteurs === 0) {
    return res.status(400).json({ message: "Un labo sans activité nécessite l'option Acheteurs (compte dépôt = labo + acheteurs)" });
  }
  if (nbAcheteurs > 0 && (nbLabos || 0) < 1) {
    return res.status(400).json({ message: "L'option Acheteurs nécessite au moins un labo (les ventes partent du stock labo)" });
  }
  if (nbAcheteurs < 0 || nbAcheteurs > 100) {
    return res.status(400).json({ message: 'Quota acheteurs invalide (paliers de 1 à 100)' });
  }

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

      // Option Acheteurs choisie dès la création : module activé immédiatement
      if (nbAcheteurs > 0) {
        await dbClient.query(
          `UPDATE profil_entreprise SET module_acheteurs_actif = true, module_acheteurs_activated_at = NOW()
           WHERE client_id = $1`,
          [user.id]
        );
      }

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
      nbAcheteurs, formuleActivites,
      montantOnboarding: montantOnboardingConfig || 0,
    } : null;

    // Plus de repli tarifaire legacy (entreprise_onboarding purgé avec l'ancien modèle)
    const montantOnboarding = montantOnboardingConfig;

    const aboId = await createAbonnement(user.id, montantOnboarding, config);

    // Create promotions passed during client creation
    const promotions = Array.isArray(req.body.promotions) ? req.body.promotions : [];
    if (promotions.length > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      for (const promoData of promotions) {
        await insertPromoForAbonnement(aboId, todayStr, promoData, req.user.id);
      }
    }

    // Auto-generate contract PDF, send via Docuseal (e-signature) + welcome email
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
        formuleActivites: (aboConfig.nbActivites ?? 1) >= 1 ? formuleActivites : null,
        nbAcheteurs,
        dateContrat: new Date(),
      });

      // Contrat e-signature : PDF rempli par client (prioritaire) ou template Docuseal.
      if (docusealPdfConfigured() || docusealConfigured()) {
        const aboConfigForDocuseal = config || {};
        const pricing = await computeEffectivePricing(user.id).catch(() => null);
        submitContratForSignature({
          aboId,
          pricing,
          nom,
          email,
          telephone: telephone || null,
          adresse: adresse || null,
          config: aboConfigForDocuseal,
          montantOnboarding,
        })
          .then(({ submissionId, signingUrl }) => {
            console.log(`[docuseal] Contrat soumis: ${submissionId} pour ${email}`);
            if (submissionId) {
              pool.query('UPDATE abonnements SET contrat_submission_id = $1 WHERE client_id = $2', [String(submissionId), user.id])
                .catch((e) => console.error('[docuseal] Stockage contrat_submission_id échoué:', e.message));
            }
            if (signingUrl) {
              sendDocusealSigningEmail({ to: email, nom, signingUrl })
                .then(() => console.log(`[docuseal] Email de signature envoyé à ${email}`))
                .catch((err) => console.error('[docuseal] Erreur envoi email signature:', err.message));
            }
          })
          .catch((err) => console.error('[docuseal] Erreur création contrat:', err.message));
        // Mail d'activation DIFFÉRÉ : envoyé par le webhook Docuseal une fois le contrat signé.
      } else {
        // Fallback (Docuseal non configuré) : on envoie l'activation immédiatement avec le PDF en pièce jointe
        await sendWelcomeWithContractEmail({ to: email, nom, token: inviteToken, contractPdfBase64: pdfBase64 });
        await pool.query(`UPDATE abonnements SET invite_sent = TRUE WHERE client_id = $1`, [user.id]).catch(() => {});
      }
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
      "SELECT id, nom, email FROM utilisateurs WHERE id = $1 AND role = 'client'",
      [id]
    );
    if (check.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Client introuvable' });
    }
    const deletedClient = check.rows[0];

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
      'stock_entreprise_daily', 'stock_labo_daily',
      'pertes', 'labo_transfers', 'inventaires', 'ventes',
      'acheteurs', 'commandes_acheteur', 'acheteur_offre_prix_historique',
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
    // commandes_acheteur.traite_par référence aussi utilisateurs sans ON DELETE
    await dbClient.query('SAVEPOINT sp_audit');
    try {
      await dbClient.query(
        `UPDATE commandes_acheteur SET traite_par = NULL WHERE traite_par IN (${uPlaceholders})`,
        userIds
      );
      await dbClient.query('RELEASE SAVEPOINT sp_audit');
    } catch (_) {
      await dbClient.query('ROLLBACK TO SAVEPOINT sp_audit');
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

    // Les comptes portail acheteurs ne cascadent pas (aucun lien gerant_parent_id) :
    // balayage d'existence APRÈS le pivot — la fiche acheteurs a cascadé, le compte
    // devenu orphelin est purgé (sinon son email resterait verrouillé à jamais).
    // Étanche aux créations concurrentes (une fiche committée pendant la fenêtre a
    // cascadé aussi) et nettoie au passage les orphelins historiques.
    await dbClient.query(
      `DELETE FROM utilisateurs u
       WHERE u.role = 'acheteur'
         AND NOT EXISTS (SELECT 1 FROM acheteurs a WHERE a.user_id = u.id)`
    );

    await dbClient.query('COMMIT');

    // Le client est supprimé. On lui envoie son acte de résiliation Docuseal pour
    // archive/formalité (best-effort, n'impacte pas la suppression déjà effectuée).
    if (deletedClient.email && (docusealPdfConfigured() || docusealConfigured('resiliation'))) {
      submitResiliationForSignature(deletedClient)
        .then(({ signingUrl }) => signingUrl
          ? sendDocusealSigningEmail({ to: deletedClient.email, nom: deletedClient.nom || 'Client', signingUrl, type: 'resiliation' })
          : null)
        .then(() => console.log(`[resiliation] acte envoyé à ${deletedClient.email}`))
        .catch((e) => console.error('[resiliation] envoi échoué:', e.message));
    }

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
