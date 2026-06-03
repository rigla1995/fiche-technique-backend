const DOCUSEAL_URL = () => process.env.DOCUSEAL_URL || 'https://sign.labflow-tn.com';
const DOCUSEAL_TOKEN = () => process.env.DOCUSEAL_API_TOKEN;
const DOCUSEAL_TEMPLATE_ID = () => process.env.DOCUSEAL_TEMPLATE_ID ? parseInt(process.env.DOCUSEAL_TEMPLATE_ID) : null;

const isConfigured = () => !!(DOCUSEAL_URL() && DOCUSEAL_TOKEN() && DOCUSEAL_TEMPLATE_ID());

/**
 * Creates a Docuseal submission from a pre-existing template so the client
 * receives a signing request by email.
 *
 * Requires env vars: DOCUSEAL_URL, DOCUSEAL_API_TOKEN, DOCUSEAL_TEMPLATE_ID
 * Returns { templateId, submissionId } or throws on failure.
 */
const createContractSubmission = async ({ clientName, clientEmail }) => {
  if (!isConfigured()) {
    throw new Error(
      'Docuseal non configuré — vérifiez DOCUSEAL_URL, DOCUSEAL_API_TOKEN et DOCUSEAL_TEMPLATE_ID'
    );
  }

  const token = DOCUSEAL_TOKEN();
  const baseUrl = DOCUSEAL_URL();
  const templateId = DOCUSEAL_TEMPLATE_ID();

  const subRes = await fetch(`${baseUrl}/api/submissions`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template_id: templateId,
      send_email: true,
      submitters: [
        { role: 'First Party', email: clientEmail, name: clientName },
      ],
    }),
  });

  if (!subRes.ok) {
    const errText = await subRes.text();
    throw new Error(`Docuseal submission error ${subRes.status}: ${errText}`);
  }

  const subData = await subRes.json();
  const submissionId = Array.isArray(subData)
    ? (subData[0]?.submission_id ?? subData[0]?.id)
    : subData.id;

  return { templateId, submissionId };
};

module.exports = { createContractSubmission, isConfigured };
