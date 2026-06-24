const pool = require('../config/database');
const { sendWelcomeWithContractEmail, generateInviteToken } = require('../services/emailService');
const { saveNotificationToAdmins, saveNotification } = require('./notificationController');
const { pushToAdmins, pushTo } = require('../services/sseService');
const { verifyDocusealSignature } = require('../utils/webhookSignature');
const logger = require('../utils/logger');

/**
 * POST /api/webhooks/docuseal
 *
 * Docuseal fires this when a submitter completes signing (event_type = "form.completed")
 * or when all submitters have signed (event_type = "submission.completed").
 *
 * We record contrat_accepte_le on the matching abonnement row.
 */
const docusealWebhook = async (req, res) => {
  // ── Authenticate the webhook before doing ANYTHING ────────────────────────────
  // Without this, anyone on the internet could forge a "contract signed" / avenant
  // event and grant subscription capacity without paying. Enforced as soon as
  // DOCUSEAL_WEBHOOK_SECRET is set (in Coolify) + the matching header/secret is
  // configured in Docuseal. Fail-open with a warning until then, so onboarding
  // is not interrupted during rollout.
  const { ok, enforced } = verifyDocusealSignature(
    req.rawBody,
    req.headers,
    process.env.DOCUSEAL_WEBHOOK_SECRET
  );
  if (enforced && !ok) {
    logger.warn('docuseal_webhook_rejected', { reason: 'invalid_signature', ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress });
    return res.status(401).json({ message: 'Invalid signature' });
  }
  if (!enforced) {
    logger.warn('docuseal_webhook_unverified', { reason: 'DOCUSEAL_WEBHOOK_SECRET not set — webhook is NOT authenticated' });
  }

  // Acknowledge immediately — Docuseal retries on non-2xx
  res.status(200).json({ received: true });

  try {
    const { event_type, data } = req.body || {};
    if (!event_type || !data) return;

    // We care about a single signer completing or the whole submission completing
    if (event_type !== 'form.completed' && event_type !== 'submission.completed') return;

    // ── 1) AVENANT ? — une demande de capacité liée à cette soumission ────────────
    // Routage par submission_id : si une demande 'en_attente' correspond, on applique
    // la capacité et on valide automatiquement (idempotent via le filtre statut).
    const submissionId = data.submission_id != null ? String(data.submission_id)
      : (data.id != null ? String(data.id) : null);
    if (submissionId) {
      const dem = await pool.query(
        `UPDATE support_demandes
            SET statut = 'validée', traite_le = NOW()
          WHERE docuseal_submission_id = $1 AND statut = 'en_attente'
          RETURNING *`,
        [submissionId]
      );
      if (dem.rows.length > 0) {
        const d = dem.rows[0];
        // Appliquer la capacité demandée à l'abonnement
        await pool.query(
          `UPDATE abonnement_config ac
              SET nb_activites = nb_activites + $1,
                  nb_labos     = nb_labos     + $2,
                  nb_gerants   = nb_gerants   + $3,
                  updated_at   = NOW()
             FROM abonnements a
            WHERE a.id = ac.abonnement_id AND a.client_id = $4`,
          [d.nb_activites_supp || 0, d.nb_labos_supp || 0, d.nb_gerants_supp || 0, d.client_id]
        );
        // Notifier les super admins
        const payload = { eventType: 'avenant_signe', demandeId: d.id, type: 'supplement', clientNom: d.client_nom || 'Client', statut: 'validée' };
        try { pushToAdmins('avenant_signe', payload); } catch (_) { /* sse best-effort */ }
        saveNotificationToAdmins(payload).catch(() => {});
        // Notifier le CLIENT (instantané + persisté). Redirection au clic selon le type de capacité :
        // activité/labo -> Mes activités ; uniquement gérant(s) -> Gérants.
        const onlyGerant = (d.nb_activites_supp || 0) === 0 && (d.nb_labos_supp || 0) === 0 && (d.nb_gerants_supp || 0) > 0;
        const clientEvent = onlyGerant ? 'demande_gerant_validee' : 'demande_capacite_validee';
        const clientPayload = { eventType: clientEvent, demandeId: d.id, type: 'supplement', clientNom: d.client_nom || 'Client', statut: 'validée' };
        try { pushTo(d.client_id, clientEvent, clientPayload); } catch (_) { /* sse best-effort */ }
        saveNotification(d.client_id, { eventType: clientEvent, demandeId: d.id, type: 'supplement', clientNom: d.client_nom, statut: 'validée' }).catch(() => {});
        console.log(`[docuseal-webhook] Avenant signé → capacité appliquée (demande ${d.id})`);
        return; // ne pas exécuter le flux contrat
      }
    }

    // ── 2) CONTRAT ────────────────────────────────────────────────────────────────
    // Extract signer email — shape differs between event types
    let signerEmail = null;
    if (event_type === 'form.completed') {
      signerEmail = data.email || data.submitter?.email || null;
    } else {
      // submission.completed: find the first submitter with status completed
      const submitters = Array.isArray(data.submitters) ? data.submitters : [];
      const completed = submitters.find((s) => s.status === 'completed' || s.completed_at);
      signerEmail = completed?.email || submitters[0]?.email || null;
    }

    if (!signerEmail) {
      console.warn('[docuseal-webhook] Impossible de déterminer l\'email du signataire', JSON.stringify(data).slice(0, 300));
      return;
    }

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;
    const signedAt = data.completed_at || data.updated_at || new Date().toISOString();

    // Find the abonnement for this client email
    await pool.query(
      `UPDATE abonnements a
          SET contrat_accepte_le = $1,
              contrat_accepte_ip = $2
         FROM utilisateurs u
        WHERE a.client_id = u.id
          AND LOWER(u.email) = LOWER($3)
          AND a.contrat_accepte_le IS NULL`,
      [signedAt, ip, signerEmail]
    );

    // Une fois le contrat signé, on envoie le mail d'activation du compte.
    // Idempotent : `abonnements.invite_sent = FALSE` garantit un seul envoi malgré les
    // événements multiples de Docuseal (form.completed + submission.completed) et ses retries.
    // L'UPDATE atomique « revendique » l'envoi (FALSE → TRUE) et retourne le client.
    const claim = await pool.query(
      `UPDATE abonnements a
          SET invite_sent = TRUE
         FROM utilisateurs u
        WHERE a.client_id = u.id
          AND LOWER(u.email) = LOWER($1)
          AND u.role = 'client'
          AND u.activated_at IS NULL
          AND a.invite_sent = FALSE
        RETURNING u.id, u.nom, u.email`,
      [signerEmail]
    );
    if (claim.rows.length > 0) {
      const u = claim.rows[0];
      // On régénère le token car les 48h initiales peuvent être écoulées entre l'envoi
      // du contrat et la signature.
      const newToken = generateInviteToken();
      const newExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await pool.query(
        `UPDATE utilisateurs SET invite_token = $1, invite_token_expires_at = $2 WHERE id = $3`,
        [newToken, newExpires, u.id]
      );
      try {
        await sendWelcomeWithContractEmail({ to: u.email, nom: u.nom, token: newToken, contractPdfBase64: null });
        console.log(`[docuseal-webhook] Mail d'activation envoyé à ${u.email} après signature`);
      } catch (mailErr) {
        // Échec d'envoi : on remet invite_sent à FALSE pour réessai au prochain événement
        await pool.query(`UPDATE abonnements SET invite_sent = FALSE WHERE client_id = $1`, [u.id]).catch(() => {});
        console.error('[docuseal-webhook] Échec envoi mail activation:', mailErr.message);
      }
    }

    console.log(`[docuseal-webhook] Contrat signé par ${signerEmail} (${event_type})`);
  } catch (err) {
    console.error('[docuseal-webhook] Erreur:', err.message);
  }
};

module.exports = { docusealWebhook };
