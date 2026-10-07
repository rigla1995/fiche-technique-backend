// LabFlow Compta, étape S3b « Le comptable du client » (labflow-reprise/achats-compta/PLAN-S3b.md) : emails propres à
// la comptabilité (vocabulaire comptable fixe, hors du moteur de vocabulaire comme tout src/compta). Même charte que les
// emails de LabFlow (src/services/emailService.js : logo, adresses et nom de chaque produit).
const { Resend } = require('resend');
const { vocabDefaut } = require('../utils/vocab');
const { urlEcrans, nomProduit, BRAND_LOGO } = require('../services/emailService');

const resend = new Resend(process.env.RESEND_API_KEY || 're_test_key');
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const APP_NAME = nomProduit('labflow');

// Textes saisis par un client (nom de son comptable, nom de son entreprise) échappés.
const echapper = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cadreEmail = (sousTitre, corps, pied) => `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);">
    <div style="background:linear-gradient(135deg,#1e1b4b 0%,#4338ca 100%);padding:36px 48px;border-bottom:4px solid #d97706">
      ${BRAND_LOGO}
      <p style="margin:8px 0 0;color:#c7d2fe;font-size:0.85rem;">${sousTitre}</p>
    </div>
    <div style="padding:40px 48px;">${corps}</div>
    <div style="padding:20px 48px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;text-align:center;">${pied}</p>
    </div>
  </div>
</body>
</html>`;
const boutonEmail = (url, libelle) => `<div style="text-align:center;margin:0 0 28px;">
        <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#4338ca,#6366f1);color:#fff;text-decoration:none;padding:16px 40px;border-radius:10px;font-size:1rem;font-weight:700;letter-spacing:0.01em;box-shadow:0 4px 16px rgba(99,102,241,0.35);">${libelle}</a>
      </div>`;
const envoyer = async ({ to, subject, html, trace }) => {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[DEV] ${trace} to ${to}`);
    return { success: true, dev: true };
  }
  const { data, error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
  if (error) throw new Error(error.message);
  return { success: true, id: data?.id };
};

/**
 * LabFlow Compta, étape S3b (SPEC-SOCLE D14) : un client LabFlow confie sa comptabilité à `to`. Avec `token` (personne
 * nouvelle, ou compte LabFlow Compta jamais activé) : invitation à activer son compte sur LabFlow Compta (48 h) ; sans
 * `token` (personne existante) : l'accès est déjà ouvert, l'email la prévient. `clientNom` : nom affiché du client.
 */
const sendAccesComptaEmail = async ({ to, nom, clientNom, token = null }) => {
  const base = urlEcrans('compta');
  const nomApp = nomProduit('compta');
  const url = token ? `${base}/invite/${token}` : `${base}/login`;
  const intro = `<strong>${echapper(clientNom)}</strong> vous a confié l'accès à sa comptabilité sur <strong>${nomApp}</strong>.`;
  const suite = token
    ? `Pour y accéder, activez votre compte et choisissez votre mot de passe en cliquant ci-dessous.`
    : `Connectez-vous avec votre adresse et votre mot de passe habituels : vous la trouverez dans le groupe <strong>Comptabilités confiées par des clients LabFlow</strong>. Vous pouvez quitter cet accès à tout moment depuis sa page.`;
  const corps = `
      <h2 style="margin:0 0 10px;color:#111827;font-size:1.2rem;font-weight:700;">Bonjour ${echapper(nom)},</h2>
      <p style="margin:0 0 28px;color:#374151;font-size:0.95rem;line-height:1.7;">${intro}<br>${suite}</p>
      ${boutonEmail(url, token ? 'Activer mon compte' : `Ouvrir ${nomApp}`)}
      ${token ? '<p style="margin:0 0 6px;color:#6b7280;font-size:0.8rem;">⏳ Ce lien d\'activation est valable <strong>48 heures</strong>.</p>' : ''}
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;word-break:break-all;">Lien direct : ${url}</p>`;
  return envoyer({
    to,
    subject: `${nomApp} — ${String(clientNom || '').replace(/[\r\n]+/g, ' ').slice(0, 120)} vous confie sa comptabilité`,
    html: cadreEmail('Une comptabilité vous est confiée', corps, `Vous ne connaissez pas ce client ? Ignorez cet email ou quittez l'accès depuis ${nomApp}. &mdash; ${nomApp}`),
    trace: token ? `Acces compta (invitation) ${url}` : 'Acces compta (compte existant)',
  });
};

/**
 * LabFlow Compta, étape S3b (réponse du client du 07/10) : le comptable d'un client a quitté l'accès à sa comptabilité ;
 * le client est prévenu (en plus de la cloche) et invité à en désigner un autre dans LabFlow, page des gérants (nom de
 * la page dans le vocabulaire du compte : `voc` du client, défaut sinon).
 */
const sendComptablePartiEmail = async ({ to, nom, comptableNom, voc = vocabDefaut }) => {
  const page = echapper(voc.Pl('gerant'));
  const url = `${urlEcrans('labflow')}/client/gerants`;
  const corps = `
      <h2 style="margin:0 0 10px;color:#111827;font-size:1.2rem;font-weight:700;">Bonjour ${echapper(nom)},</h2>
      <p style="margin:0 0 28px;color:#374151;font-size:0.95rem;line-height:1.7;">
        <strong>${echapper(comptableNom)}</strong> a quitté l'accès à votre comptabilité sur <strong>${nomProduit('compta')}</strong>.<br>
        Vous pouvez désigner une autre personne dans ${APP_NAME}, page <strong>${page}</strong>, partie <strong>Gérants Comptabilité</strong>.
      </p>
      ${boutonEmail(url, `Ouvrir la page ${page}`)}
      <p style="margin:0;color:#9ca3af;font-size:0.75rem;word-break:break-all;">Lien direct : ${url}</p>`;
  return envoyer({
    to,
    subject: `${APP_NAME} — Votre comptable a quitté l'accès à votre comptabilité`,
    html: cadreEmail('Accès à votre comptabilité', corps, APP_NAME),
    trace: 'Comptable parti',
  });
};

// Libellé d'un ajout de gérants comptables (email « ajout de capacité validé », demandes).
const libelleAjoutGerantsCompta = (n) => (n > 0 ? `+${n} gérant${n > 1 ? 's' : ''} comptable${n > 1 ? 's' : ''}` : null);

module.exports = { echapper, sendAccesComptaEmail, sendComptablePartiEmail, libelleAjoutGerantsCompta };
