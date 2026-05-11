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

const sendSupportValidationEmail = async ({ to, nom, type, statut, details, notesAdmin }) => {
  const typeLabels = {
    ingredient_manquant: 'Ingrédient manquant',
    supplement: 'Ajout de capacité',
    aide: 'Besoin d\'aide',
  };
  const statutLabel = statut === 'validée' ? '✅ Validée' : '❌ Refusée';
  const statutColor = statut === 'validée' ? '#16a34a' : '#dc2626';

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);padding:28px 36px;">
      <h1 style="margin:0;color:#fff;font-size:1.3rem;font-weight:800;">${APP_NAME}</h1>
    </div>
    <div style="padding:32px 36px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:1.05rem;font-weight:700;">Bonjour ${nom},</h2>
      <p style="margin:0 0 20px;color:#374151;font-size:0.9rem;line-height:1.6;">
        Votre demande de type <strong>${typeLabels[type] || type}</strong> a été traitée.
      </p>
      <div style="background:#f8fafc;border-radius:10px;padding:16px 20px;margin-bottom:20px;border-left:4px solid ${statutColor};">
        <div style="font-size:0.88rem;font-weight:800;color:${statutColor};margin-bottom:8px;">${statutLabel}</div>
        ${details ? `<div style="font-size:0.85rem;color:#374151;">${details}</div>` : ''}
      </div>
      ${notesAdmin ? `<div style="background:#eff6ff;border-radius:8px;padding:14px 18px;margin-bottom:20px;">
        <div style="font-size:0.75rem;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Message de l'administration</div>
        <div style="font-size:0.85rem;color:#374151;">${notesAdmin}</div>
      </div>` : ''}
      <p style="margin:0;color:#6b7280;font-size:0.82rem;">
        Connectez-vous à votre espace pour plus de détails.
      </p>
    </div>
  </div>
</body>
</html>`;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${APP_NAME} — Demande ${statut === 'validée' ? 'validée' : 'refusée'} : ${typeLabels[type] || type}`,
    html,
  });
  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
};

module.exports = { sendInviteEmail, sendWelcomeWithContractEmail, generateInviteToken, sendSupportValidationEmail };
