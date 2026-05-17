const crypto = require('crypto');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY || 're_test_key');
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const APP_NAME = process.env.APP_NAME || 'Fiche Technique';

const sendInviteEmail = async ({ to, nom, token, role }) => {
  const inviteUrl = `${APP_URL}/invite/${token}`;

  const roleLabel = role === 'gerant' ? 'gérant' : 'client';

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);padding:32px 40px;">
      <h1 style="margin:0;color:#fff;font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;">${APP_NAME}</h1>
    </div>
    <div style="padding:36px 40px;">
      <h2 style="margin:0 0 12px;color:#111827;font-size:1.15rem;font-weight:700;">Bonjour ${nom},</h2>
      <p style="margin:0 0 24px;color:#374151;font-size:0.95rem;line-height:1.6;">
        Vous avez été invité(e) à rejoindre <strong>${APP_NAME}</strong> en tant que <strong>${roleLabel}</strong>.
        Cliquez sur le bouton ci-dessous pour activer votre compte et choisir votre mot de passe.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${inviteUrl}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:0.95rem;font-weight:700;letter-spacing:0.01em;">
          Activer mon compte
        </a>
      </div>
      <p style="margin:0 0 8px;color:#6b7280;font-size:0.8rem;">
        Ce lien est valable <strong>48 heures</strong>. S'il a expiré, contactez votre administrateur.
      </p>
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;word-break:break-all;">
        Ou copiez ce lien : ${inviteUrl}
      </p>
    </div>
    <div style="padding:20px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;text-align:center;">
        Si vous n'attendiez pas cette invitation, ignorez cet email.
      </p>
    </div>
  </div>
</body>
</html>`;

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Invite email to ${to}: ${inviteUrl}`);
    return { success: true, dev: true, inviteUrl };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Invitation à rejoindre ${APP_NAME}`,
    html,
  });

  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
};

const sendWelcomeWithContractEmail = async ({ to, nom, token, contractPdfBase64 }) => {
  const activateUrl = `${APP_URL}/invite/${token}`;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);padding:36px 48px;">
      <h1 style="margin:0 0 6px;color:#fff;font-size:1.5rem;font-weight:800;letter-spacing:-0.02em;">${APP_NAME}</h1>
      <p style="margin:0;color:#c7d2fe;font-size:0.85rem;">Plateforme de gestion des fiches techniques</p>
    </div>
    <div style="padding:40px 48px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:1.2rem;font-weight:700;">Bienvenue, ${nom} !</h2>
      <p style="margin:0 0 28px;color:#374151;font-size:0.95rem;line-height:1.7;">
        Votre espace <strong>${APP_NAME}</strong> est prêt. Votre contrat d'abonnement est joint à cet email en PDF.<br>
        Cliquez sur le bouton ci-dessous pour activer votre compte et définir votre mot de passe.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 24px;margin-bottom:28px;">
        <p style="margin:0 0 4px;font-size:0.78rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">📎 Document joint</p>
        <p style="margin:0;font-size:0.92rem;color:#1e293b;font-weight:600;">Contrat d'abonnement — ${APP_NAME}</p>
        <p style="margin:4px 0 0;font-size:0.8rem;color:#64748b;">En activant votre compte, vous acceptez les termes de ce contrat.</p>
      </div>
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${activateUrl}" style="display:inline-block;background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;text-decoration:none;padding:16px 40px;border-radius:10px;font-size:1rem;font-weight:700;letter-spacing:0.01em;box-shadow:0 4px 16px rgba(99,102,241,0.35);">
          Activer mon compte &amp; signer le contrat
        </a>
      </div>
      <p style="margin:0 0 6px;color:#6b7280;font-size:0.8rem;">⏳ Ce lien est valable <strong>48 heures</strong>.</p>
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;word-break:break-all;">Lien direct : ${activateUrl}</p>
    </div>
    <div style="padding:20px 48px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;text-align:center;">
        Si vous n'avez pas demandé ce compte, ignorez cet email. &mdash; ${APP_NAME}
      </p>
    </div>
  </div>
</body>
</html>`;

  const attachments = contractPdfBase64 ? [{
    filename: `contrat-abonnement-${nom.replace(/\s+/g, '-').toLowerCase()}.pdf`,
    content: contractPdfBase64,
  }] : [];

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Welcome+contract email to ${to}: ${activateUrl}`);
    return { success: true, dev: true, activateUrl };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Bienvenue sur ${APP_NAME} — Activez votre compte`,
    html,
    attachments,
  });

  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
};

const generateInviteToken = () => crypto.randomBytes(32).toString('hex');

/**
 * Supplement validation email — serves as the amendment contract (avenant).
 * Includes the added capacity, full new pricing breakdown, and admin note.
 * Only sent when a supplement request is validated (not for other types).
 */
const sendAvenantEmail = async ({
  to, nom, notesAdmin,
  // Added supplements
  nbActivitesAdded, nbLabosAdded, nbGerantsAdded,
  // New config after supplement
  nbActivites, nbLabos, nbGerants,
  // New pricing breakdown
  activiteCost, laboCost, gerantCost, newMensuel,
  // Optional promo
  promoApplied, effectifMensuel,
  // Date
  dateAvenant,
  // PDF contract attachment (base64)
  pdfBase64,
}) => {
  const fmtDt = (n) => (n != null ? `${Number(n).toFixed(2)} DT` : '—');
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const addedParts = [
    nbActivitesAdded > 0 && `+${nbActivitesAdded} activité${nbActivitesAdded > 1 ? 's' : ''}`,
    nbLabosAdded > 0     && `+${nbLabosAdded} labo${nbLabosAdded > 1 ? 's' : ''}`,
    nbGerantsAdded > 0   && `+${nbGerantsAdded} gérant${nbGerantsAdded > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ');

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);padding:36px 48px;">
      <h1 style="margin:0 0 4px;color:#fff;font-size:1.4rem;font-weight:800;letter-spacing:-0.02em;">${APP_NAME}</h1>
      <p style="margin:0;color:#c7d2fe;font-size:0.82rem;">Contrat Avenant — Ajout de capacité</p>
    </div>

    <!-- Body -->
    <div style="padding:40px 48px;">
      <h2 style="margin:0 0 6px;color:#111827;font-size:1.1rem;font-weight:700;">Bonjour ${nom},</h2>
      <p style="margin:0 0 28px;color:#374151;font-size:0.9rem;line-height:1.7;">
        Votre demande d'ajout de capacité a été <strong style="color:#16a34a;">validée</strong>.
        Cet email constitue votre avenant de contrat daté du <strong>${fmtDate(dateAvenant)}</strong>.
      </p>

      <!-- Capacité ajoutée -->
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:18px 22px;margin-bottom:24px;">
        <div style="font-size:0.72rem;font-weight:800;color:#15803d;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;">✅ Capacité ajoutée</div>
        <div style="font-size:1rem;font-weight:700;color:#14532d;">${addedParts}</div>
      </div>

      <!-- Nouvelle configuration -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 22px;margin-bottom:24px;">
        <div style="font-size:0.72rem;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:14px;">Votre configuration après avenant</div>
        <table style="width:100%;border-collapse:collapse;font-size:0.88rem;">
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 0;color:#6b7280;">Activités</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#111827;">${nbActivites}</td>
            <td style="padding:8px 0;text-align:right;color:#4c1d95;font-weight:600;">${fmtDt(activiteCost)}</td>
          </tr>
          ${nbLabos > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 0;color:#6b7280;">Labos</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#111827;">${nbLabos}</td>
            <td style="padding:8px 0;text-align:right;color:#4c1d95;font-weight:600;">${fmtDt(laboCost)}</td>
          </tr>` : ''}
          ${nbGerants > 0 ? `<tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:8px 0;color:#6b7280;">Gérants</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#111827;">${nbGerants}</td>
            <td style="padding:8px 0;text-align:right;color:#4c1d95;font-weight:600;">${fmtDt(gerantCost)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:12px 0 4px;font-weight:800;color:#1e40af;" colspan="2">Nouveau mensuel de base</td>
            <td style="padding:12px 0 4px;text-align:right;font-weight:900;color:#1e40af;font-size:1rem;">${fmtDt(newMensuel)}/mois</td>
          </tr>
          ${promoApplied && effectifMensuel != null && effectifMensuel !== newMensuel ? `<tr>
            <td style="padding:4px 0;font-size:0.78rem;color:#7c3aed;" colspan="2">🎉 Promotion appliquée</td>
            <td style="padding:4px 0;text-align:right;font-weight:900;color:#7c3aed;font-size:1.05rem;">${fmtDt(effectifMensuel)}/mois</td>
          </tr>` : ''}
        </table>
      </div>

      ${notesAdmin ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
        <div style="font-size:0.72rem;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Note de l'administration</div>
        <div style="font-size:0.88rem;color:#1e3a5f;line-height:1.6;">${notesAdmin}</div>
      </div>` : ''}

      <p style="margin:0;color:#6b7280;font-size:0.82rem;line-height:1.6;">
        Votre espace est déjà mis à jour. Connectez-vous pour consulter votre nouvelle configuration.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 48px;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:0.75rem;">${APP_NAME} · Avenant du ${fmtDate(dateAvenant)}</p>
    </div>
  </div>
</body>
</html>`;

  const attachments = pdfBase64 ? [{
    filename: `avenant-${nom.replace(/\s+/g, '-').toLowerCase()}-${new Date(dateAvenant).toISOString().slice(0, 10)}.pdf`,
    content: pdfBase64,
  }] : [];

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Avenant email to ${to} (PDF attached: ${!!pdfBase64})`);
    return { success: true, dev: true };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${APP_NAME} — Avenant validé : ${addedParts}`,
    html,
    attachments,
  });
  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
};

const sendRapportEmail = async ({ to, clientNom, rapportText }) => {
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${APP_NAME} — Rapport IA pour ${clientNom}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:auto">
      <h2 style="color:#6366f1">Rapport IA — ${clientNom}</h2>
      <p style="color:#374151;line-height:1.6;white-space:pre-wrap">${rapportText.replace(/\n/g, '<br>')}</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:12px;color:#94a3b8">Généré par l'assistant IA LabFlow · ${APP_NAME}</p>
    </div>`,
  });
  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
};

const sendRapportWithAttachment = async ({ to, clientNom, buffer, filename, mimeType, format }) => {
  const formatLabel = format === 'excel' ? 'Excel' : 'PDF';
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${APP_NAME} — Rapport ${formatLabel} pour ${clientNom}`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
        <div style="font-size:36px;margin-bottom:8px">${format === 'excel' ? '📊' : '📄'}</div>
        <h1 style="color:#fff;margin:0;font-size:20px">Rapport ${formatLabel} — ${clientNom}</h1>
      </div>
      <p style="color:#374151;font-size:14px;line-height:1.6">
        Votre rapport <strong>${formatLabel}</strong> est disponible en pièce jointe.<br>
        Il contient votre stock actuel, vos pertes récentes et vos inventaires.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
      <p style="font-size:11px;color:#94a3b8;text-align:center">Généré par l'assistant IA LabFlow · ${APP_NAME}</p>
    </div>`,
    attachments: [{
      filename,
      content: buffer.toString('base64'),
      contentType: mimeType,
    }],
  });
  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
};

const sendAiAgentInviteEmail = async ({ to, clientNom, inviteLink, appName }) => {
  const name = appName || APP_NAME;
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${name} — Votre assistant IA est activé ! 🤖`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px">
      <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
        <div style="font-size:40px;margin-bottom:8px">🤖</div>
        <h1 style="color:#fff;margin:0;font-size:22px">Votre agent IA ${name} est prêt !</h1>
      </div>
      <p style="color:#374151;font-size:15px;line-height:1.6">Bonjour <strong>${clientNom}</strong>,</p>
      <p style="color:#374151;font-size:14px;line-height:1.6">
        Votre assistant IA personnel vient d'être activé. Il peut répondre à vos questions sur votre <strong>stock</strong>, vos <strong>inventaires</strong>, vos <strong>pertes</strong> et vous envoyer des <strong>rapports par email</strong> — directement depuis Telegram.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:20px 0">
        <p style="margin:0 0 12px;font-size:13px;color:#374151;font-weight:600">Pour démarrer, cliquez sur le bouton ci-dessous :</p>
        <a href="${inviteLink}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">
          💬 Ouvrir mon assistant IA
        </a>
        <p style="margin:12px 0 0;font-size:11px;color:#94a3b8">Lien : ${inviteLink}</p>
      </div>
      <ol style="color:#374151;font-size:13px;line-height:1.8;padding-left:20px">
        <li>Cliquez sur le bouton ci-dessus</li>
        <li>Telegram s'ouvre — cliquez <strong>"Démarrer"</strong></li>
        <li>L'agent vous répond instantanément ✅</li>
      </ol>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="font-size:11px;color:#94a3b8;text-align:center">${name} · Votre assistant IA personnel</p>
    </div>`,
  });
  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
};

module.exports = { sendInviteEmail, sendWelcomeWithContractEmail, generateInviteToken, sendAvenantEmail, sendRapportEmail, sendRapportWithAttachment, sendAiAgentInviteEmail };
