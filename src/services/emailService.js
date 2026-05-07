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
    return { success: true, dev: true };
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

const generateInviteToken = () => crypto.randomBytes(32).toString('hex');

module.exports = { sendInviteEmail, generateInviteToken };
