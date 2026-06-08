const DOCUSEAL_URL = () => process.env.DOCUSEAL_URL || 'https://sign.labflow-tn.com';
const DOCUSEAL_TOKEN = () => process.env.DOCUSEAL_API_TOKEN;

const templateIdFor = (type = 'contrat') => {
  const map = {
    contrat:     process.env.DOCUSEAL_TEMPLATE_ID,
    resiliation: process.env.DOCUSEAL_TEMPLATE_RESILIATION_ID,
    avenant:     process.env.DOCUSEAL_TEMPLATE_AVENANT_ID,
  };
  const v = map[type];
  return v ? parseInt(v) : null;
};

const isConfigured = (type = 'contrat') =>
  !!(DOCUSEAL_URL() && DOCUSEAL_TOKEN() && templateIdFor(type));

const fmtDt = (v) => (v != null ? `${v} DT` : '—');
const fmtDate = (d) =>
  new Date(d || Date.now()).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

/**
 * Creates a Docuseal submission from a pre-existing template so the client
 * receives a signing request by email, with fields pre-filled.
 *
 * @param {object} params
 *   clientName, clientEmail — required
 *   nbActivites, nbLabos, nbGerants, montantOnboarding, montantMensuel — pricing
 *   type — 'contrat' | 'resiliation' | 'avenant' (default: 'contrat')
 *   extraFields — array of { name, default_value } for additional overrides
 *
 * Requires env vars: DOCUSEAL_URL, DOCUSEAL_API_TOKEN, DOCUSEAL_TEMPLATE_ID (+ variants)
 * Returns { templateId, submissionId } or throws on failure.
 */
const createSubmission = async ({
  clientName,
  clientEmail,
  nbActivites,
  nbLabos,
  nbGerants,
  montantOnboarding,
  montantMensuel,
  type = 'contrat',
  extraFields = [],
}) => {
  if (!isConfigured(type)) {
    throw new Error(
      `Docuseal non configuré pour le type "${type}" — vérifiez DOCUSEAL_URL, DOCUSEAL_API_TOKEN et la variable template correspondante`
    );
  }

  const token = DOCUSEAL_TOKEN();
  const baseUrl = DOCUSEAL_URL();
  const templateId = templateIdFor(type);

  const fields = [
    { name: 'Nom du client',       default_value: clientName },
    { name: 'Email',               default_value: clientEmail },
    { name: 'Date du contrat',     default_value: fmtDate(new Date()) },
    { name: 'Nb activités',        default_value: String(nbActivites ?? '') },
    { name: 'Nb labos',            default_value: String(nbLabos ?? '') },
    { name: 'Nb gérants',          default_value: String(nbGerants ?? '') },
    { name: 'Montant onboarding',  default_value: fmtDt(montantOnboarding) },
    { name: 'Montant mensuel',     default_value: fmtDt(montantMensuel) },
    ...extraFields,
  ].filter((f) => f.default_value !== '' && f.default_value !== '—');

  const subRes = await fetch(`${baseUrl}/api/submissions`, {
    method: 'POST',
    headers: {
      'X-Auth-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template_id: templateId,
      send_email: false,
      submitters: [
        { role: 'Première partie', email: clientEmail, name: clientName, fields },
      ],
    }),
  });

  if (!subRes.ok) {
    const errText = await subRes.text();
    throw new Error(`Docuseal submission error ${subRes.status}: ${errText}`);
  }

  const subData = await subRes.json();
  const firstSubmitter = Array.isArray(subData) ? subData[0] : subData?.submitters?.[0];
  const submissionId = firstSubmitter?.submission_id ?? firstSubmitter?.id ?? (Array.isArray(subData) ? null : subData.id);
  const signingSlug = firstSubmitter?.slug ?? null;
  const signingUrl = signingSlug ? `${baseUrl}/s/${signingSlug}` : null;

  return { templateId, submissionId, signingUrl };
};

// Backward-compat alias used in clientsController
const createContractSubmission = ({ clientName, clientEmail, ...rest }) =>
  createSubmission({ clientName, clientEmail, type: 'contrat', ...rest });

module.exports = { createSubmission, createContractSubmission, isConfigured };
