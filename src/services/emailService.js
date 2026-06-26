const crypto = require('crypto');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY || 're_test_key');
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const APP_NAME = process.env.APP_NAME || 'LabFlow';

// Logo de marque pour les en-têtes d'emails : image PNG hébergée (le même logo losange
// que la page de connexion, rendu blanc sur fond sombre). Une image PNG s'affiche dans
// tous les clients mail (contrairement au SVG/au dégradé CSS). Repli (images bloquées) :
// le texte alt « LabFlow » stylé en blanc. Source : public/logo-email.png du frontend.
const BRAND_LOGO = `<img src="${APP_URL}/logo-email.png" alt="LabFlow" width="138" height="34" style="display:block;margin:0 auto;height:34px;width:138px;border:0;outline:none;text-decoration:none;color:#ffffff;font-size:22px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" />`;

const sendInviteEmail = async ({ to, nom, token, role }) => {
  const inviteUrl = `${APP_URL}/invite/${token}`;

  const roleLabel = role === 'gerant' ? 'gérant' : 'client';

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);padding:32px 40px;border-bottom:4px solid #d97706">
      ${BRAND_LOGO}
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
  const hasContract = !!contractPdfBase64;

  // Sans pièce jointe (activation après signature DocuSeal) : pas de bloc « document joint ».
  const intro = hasContract
    ? `Nous avons le plaisir de vous accueillir sur <strong>${APP_NAME}</strong>. Votre contrat d'abonnement figure en pièce jointe au format PDF.<br>
        Pour accéder à votre espace, il vous suffit d'activer votre compte et de définir votre mot de passe.`
    : `Nous vous remercions pour la signature de votre contrat. Votre espace <strong>${APP_NAME}</strong> est désormais prêt.<br>
        Pour y accéder, il vous suffit d'activer votre compte et de définir votre mot de passe en cliquant ci-dessous.`;

  const contractBlock = hasContract ? `
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 24px;margin-bottom:28px;">
        <p style="margin:0 0 4px;font-size:0.78rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">📎 Document joint</p>
        <p style="margin:0;font-size:0.92rem;color:#1e293b;font-weight:600;">Contrat d'abonnement — ${APP_NAME}</p>
        <p style="margin:4px 0 0;font-size:0.8rem;color:#64748b;">En activant votre compte, vous acceptez les termes de ce contrat.</p>
      </div>` : '';

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);padding:36px 48px;border-bottom:4px solid #d97706">
      ${BRAND_LOGO}
      <p style="margin:8px 0 0;color:#c7d2fe;font-size:0.85rem;">Activation de votre compte</p>
    </div>
    <div style="padding:40px 48px;">
      <h2 style="margin:0 0 10px;color:#111827;font-size:1.2rem;font-weight:700;">Bienvenue, ${nom}</h2>
      <p style="margin:0 0 28px;color:#374151;font-size:0.95rem;line-height:1.7;">
        ${intro}
      </p>
      ${contractBlock}
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${activateUrl}" style="display:inline-block;background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;text-decoration:none;padding:16px 40px;border-radius:10px;font-size:1rem;font-weight:700;letter-spacing:0.01em;box-shadow:0 4px 16px rgba(99,102,241,0.35);">
          Activer mon compte
        </a>
      </div>
      <p style="margin:0 0 6px;color:#6b7280;font-size:0.8rem;">⏳ Ce lien d'activation est valable <strong>48 heures</strong>.</p>
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;word-break:break-all;">Lien direct : ${activateUrl}</p>
    </div>
    <div style="padding:20px 48px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;text-align:center;">
        Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement cet email. &mdash; ${APP_NAME}
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

const sendDocusealSigningEmail = async ({ to, nom, signingUrl, avenant = null, type = null }) => {
  // kind ∈ 'contrat' | 'avenant' | 'resiliation' (avenant prioritaire pour rétro-compat)
  const kind = avenant ? 'avenant' : (type || 'contrat');
  const isAvenant = kind === 'avenant';
  const isResiliation = kind === 'resiliation';
  // Rappel de la capacité demandée (uniquement pour un avenant)
  const supParts = [];
  if (isAvenant) {
    const n = (v) => parseInt(v, 10) || 0;
    if (n(avenant.addActivites) > 0) supParts.push(`${n(avenant.addActivites)} activité${n(avenant.addActivites) > 1 ? 's' : ''}`);
    if (n(avenant.addLabos) > 0) supParts.push(`${n(avenant.addLabos)} labo${n(avenant.addLabos) > 1 ? 's' : ''}`);
    if (n(avenant.addGerants) > 0) supParts.push(`${n(avenant.addGerants)} gérant${n(avenant.addGerants) > 1 ? 's' : ''}`);
  }
  const supText = supParts.join(', ') || 'capacité supplémentaire';

  let subtitle, intro, cardTitle, cardSub, buttonText, footerText, subject, cardIcon;
  if (isAvenant) {
    subtitle = 'Signature électronique de votre avenant';
    intro = `Suite à votre demande d'ajout de <strong>${supText}</strong>, votre <strong>avenant au contrat d'abonnement ${APP_NAME}</strong> est prêt à être signé électroniquement.<br>
        Cliquez sur le bouton ci-dessous pour le consulter et le signer — <strong>dès la signature, votre nouvelle capacité sera immédiatement disponible dans votre espace</strong>.`;
    cardTitle = `Avenant au contrat d'abonnement — ${APP_NAME}`;
    cardSub = "Ce document acte l'ajout de capacité demandé et votre nouvelle tarification.";
    buttonText = 'Consulter et signer mon avenant';
    footerText = "Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement cet email.";
    subject = `${APP_NAME} — Signature de votre avenant d'abonnement`;
    cardIcon = '✍️ Signature requise';
  } else if (isResiliation) {
    subtitle = "Acte de résiliation de votre abonnement";
    intro = `Nous vous confirmons la clôture de votre abonnement <strong>${APP_NAME}</strong>.<br>
        Pour finaliser la résiliation dans les règles, il vous suffit de signer électroniquement votre acte de résiliation ci-dessous. Nous vous remercions sincèrement de la confiance que vous nous avez accordée.`;
    cardTitle = `Acte de résiliation — ${APP_NAME}`;
    cardSub = "Ce document formalise la fin de votre abonnement. Signature 100 % en ligne et sécurisée.";
    buttonText = "Consulter et signer l'acte";
    footerText = "Une question sur votre résiliation ? Notre équipe reste à votre disposition.";
    subject = `${APP_NAME} — Acte de résiliation de votre abonnement`;
    cardIcon = '📄 Document à signer';
  } else {
    subtitle = 'Signature électronique de votre contrat';
    intro = `Nous avons le plaisir de vous accueillir sur <strong>${APP_NAME}</strong>.<br>
        Pour lancer la mise en service de votre espace, il ne reste qu'une étape : la signature électronique de votre contrat d'abonnement. Une fois le contrat signé, vous recevrez votre lien d'activation pour configurer votre accès.`;
    cardTitle = `Contrat d'abonnement — ${APP_NAME}`;
    cardSub = 'Document personnalisé avec votre configuration et votre tarification. Signature 100 % en ligne et sécurisée.';
    buttonText = 'Consulter et signer mon contrat';
    footerText = "Vous n'êtes pas à l'origine de cette demande ? Ignorez simplement cet email.";
    subject = `${APP_NAME} — Signature de votre contrat d'abonnement`;
    cardIcon = '✍️ Signature requise';
  }

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);padding:36px 48px;border-bottom:4px solid #d97706">
      ${BRAND_LOGO}
      <p style="margin:0;color:#c7d2fe;font-size:0.85rem;">${subtitle}</p>
    </div>
    <div style="padding:40px 48px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:1.2rem;font-weight:700;">Bonjour ${nom},</h2>
      <p style="margin:0 0 24px;color:#374151;font-size:0.95rem;line-height:1.7;">
        ${intro}
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 24px;margin-bottom:28px;">
        <p style="margin:0 0 4px;font-size:0.78rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">${cardIcon}</p>
        <p style="margin:0;font-size:0.92rem;color:#1e293b;font-weight:600;">${cardTitle}</p>
        <p style="margin:4px 0 0;font-size:0.8rem;color:#64748b;">${cardSub}</p>
      </div>
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${signingUrl}" style="display:inline-block;background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;text-decoration:none;padding:16px 40px;border-radius:10px;font-size:1rem;font-weight:700;letter-spacing:0.01em;box-shadow:0 4px 16px rgba(99,102,241,0.35);">
          ${buttonText}
        </a>
      </div>
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;word-break:break-all;">Lien direct : ${signingUrl}</p>
    </div>
    <div style="padding:20px 48px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;text-align:center;">
        ${footerText} &mdash; ${APP_NAME}
      </p>
    </div>
  </div>
</body>
</html>`;

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Docuseal signing email (${kind}) to ${to}: ${signingUrl}`);
    return { success: true, dev: true, signingUrl };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });

  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
};

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
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);padding:36px 48px;border-bottom:4px solid #d97706">
      ${BRAND_LOGO}
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

// Email professionnel envoyé au client à la validation d'un paiement, avec la facture PDF jointe.
const sendFactureEmail = async ({ to, nom, numero, periodeLabel, montantTtc, dateReglement, pdfBase64 }) => {
  const fmtDt = (n) => (n != null ? `${Number(n).toFixed(3)} DT` : '—');
  const dateStr = dateReglement
    ? new Date(dateReglement).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);padding:36px 48px;border-bottom:4px solid #d97706">
      ${BRAND_LOGO}
      <p style="margin:0;color:#c7d2fe;font-size:0.85rem;">Facture de votre abonnement</p>
    </div>
    <div style="padding:40px 48px;">
      <h2 style="margin:0 0 8px;color:#111827;font-size:1.2rem;font-weight:700;">Bonjour ${nom},</h2>
      <p style="margin:0 0 24px;color:#374151;font-size:0.95rem;line-height:1.7;">
        Nous vous confirmons la bonne réception de votre paiement. Vous trouverez ci-joint votre <strong>facture acquittée</strong> pour la période <strong>${periodeLabel}</strong>. Nous vous remercions pour votre confiance.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 22px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
          <tr>
            <td style="padding:6px 0;color:#6b7280;">N° de facture</td>
            <td style="padding:6px 0;text-align:right;font-weight:700;color:#111827;">${numero}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;">Période</td>
            <td style="padding:6px 0;text-align:right;font-weight:700;color:#111827;">${periodeLabel}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;">Réglée le</td>
            <td style="padding:6px 0;text-align:right;font-weight:700;color:#111827;">${dateStr}</td>
          </tr>
          <tr>
            <td style="padding:10px 0 2px;font-weight:800;color:#1e40af;">Montant TTC</td>
            <td style="padding:10px 0 2px;text-align:right;font-weight:900;color:#1e40af;font-size:1.05rem;">${fmtDt(montantTtc)}</td>
          </tr>
        </table>
      </div>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 20px;margin-bottom:24px;">
        <p style="margin:0 0 4px;font-size:0.78rem;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:0.05em;">📎 Document joint</p>
        <p style="margin:0;font-size:0.9rem;color:#14532d;font-weight:600;">Facture ${numero} (PDF)</p>
        <p style="margin:4px 0 0;font-size:0.8rem;color:#3f6212;">Retrouvez également toutes vos factures dans votre espace, rubrique « Historique paiements ».</p>
      </div>

      <p style="margin:0;color:#6b7280;font-size:0.82rem;line-height:1.6;">
        Pour toute question relative à cette facture, notre équipe reste à votre disposition.
      </p>
    </div>
    <div style="padding:20px 48px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;text-align:center;">${APP_NAME} · Facture ${numero}</p>
    </div>
  </div>
</body>
</html>`;

  const attachments = pdfBase64 ? [{
    filename: `facture-${numero}.pdf`,
    content: pdfBase64,
  }] : [];

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Facture email to ${to}: ${numero} (PDF attached: ${!!pdfBase64})`);
    return { success: true, dev: true };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${APP_NAME} — Votre facture ${periodeLabel}`,
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

const sendMessengerInviteEmail = async ({ to, clientNom, inviteLink, appName }) => {
  const name = appName || APP_NAME;
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <!-- Header marque : logo en valeur -->
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);padding:40px 48px 34px;border-bottom:4px solid #d97706;text-align:center;">
      ${BRAND_LOGO}
      <p style="margin:14px 0 0;color:#c7d2fe;font-size:0.9rem;font-weight:600;">🤖 Votre assistant IA est prêt sur Messenger</p>
    </div>
    <div style="padding:40px 48px;">
      <h2 style="margin:0 0 10px;color:#111827;font-size:1.2rem;font-weight:700;">Bonjour ${clientNom},</h2>
      <p style="margin:0 0 22px;color:#374151;font-size:0.95rem;line-height:1.7;">
        Votre assistant IA <strong>${name}</strong> vient d'être activé sur <strong>Facebook Messenger</strong>.
        Vous pouvez l'utiliser comme l'application — en consultation — pour interroger toutes vos données :
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 22px;margin-bottom:26px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;font-size:0.9rem;color:#1e293b;line-height:1.9;">
          <tr><td style="width:50%;">🏪 Activités &amp; labos</td><td>🧾 Ventes &amp; CA</td></tr>
          <tr><td>📦 Stock &amp; seuils</td><td>🛒 Approvisionnements</td></tr>
          <tr><td>🔄 Transferts</td><td>📉 Pertes &amp; inventaires</td></tr>
          <tr><td>📚 Référentiel &amp; fournisseurs</td><td>💳 Abonnement &amp; produits</td></tr>
        </table>
        <p style="margin:12px 0 0;font-size:0.82rem;color:#64748b;">Filtrez par activité, labo ou période — et demandez un <strong>rapport Excel/PDF par email</strong> quand vous voulez.</p>
      </div>
      <div style="text-align:center;margin:0 0 26px;">
        <a href="${inviteLink}" style="display:inline-block;background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;text-decoration:none;padding:16px 40px;border-radius:10px;font-size:1rem;font-weight:700;letter-spacing:0.01em;box-shadow:0 4px 16px rgba(99,102,241,0.35);">
          💬 Ouvrir mon assistant sur Messenger
        </a>
      </div>
      <ol style="margin:0 0 8px;color:#374151;font-size:0.85rem;line-height:1.9;padding-left:20px;">
        <li>Cliquez sur le bouton ci-dessus</li>
        <li>Messenger s'ouvre — envoyez votre premier message</li>
        <li>L'agent vous répond et vous accueille instantanément ✅</li>
      </ol>
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;word-break:break-all;">Lien direct : ${inviteLink}</p>
    </div>
    <div style="padding:20px 48px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;text-align:center;">
        Si vous n'attendiez pas cette activation, ignorez cet email. &mdash; ${name}
      </p>
    </div>
  </div>
</body>
</html>`;

  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] Messenger invite email to ${to}: ${inviteLink}`);
    return { success: true, dev: true, inviteLink };
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${name} — Votre assistant IA Messenger est activé ! 🤖`,
    html,
  });
  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
};

module.exports = { sendInviteEmail, sendWelcomeWithContractEmail, generateInviteToken, sendAvenantEmail, sendFactureEmail, sendRapportEmail, sendRapportWithAttachment, sendAiAgentInviteEmail, sendMessengerInviteEmail, sendDocusealSigningEmail };
