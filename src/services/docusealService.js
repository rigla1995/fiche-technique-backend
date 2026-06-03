const APP_NAME = process.env.APP_NAME || 'Fiche Technique';

const DOCUSEAL_URL = () => process.env.DOCUSEAL_URL || 'https://sign.labflow-tn.com';
const DOCUSEAL_TOKEN = () => process.env.DOCUSEAL_API_TOKEN;

const isConfigured = () => !!(DOCUSEAL_URL() && DOCUSEAL_TOKEN());

/**
 * Uploads a contract PDF to Docuseal as a new template, then creates a
 * submission so the client receives a signing request by email.
 *
 * Returns { templateId, submissionId } or throws on failure.
 */
const createContractSubmission = async ({ pdfBase64, clientName, clientEmail }) => {
  if (!isConfigured()) throw new Error('Docuseal non configuré (DOCUSEAL_URL / DOCUSEAL_API_TOKEN manquants)');

  const token = DOCUSEAL_TOKEN();
  const baseUrl = DOCUSEAL_URL();
  const templateName = `Contrat ${APP_NAME} — ${clientName}`;

  // ── Step 1: Create template from PDF ──────────────────────────────────────
  const pdfBuffer = Buffer.from(pdfBase64, 'base64');

  const form = new FormData();
  form.append('pdf[name]', templateName);
  form.append('pdf[submitters][0][name]', 'Client');
  form.append('pdf[submitters][0][uuid]', 'client');
  form.append('pdf[documents][0][name]', 'Contrat');
  // Signature field placed at bottom of page 1 (covers the "Signature client" zone in the PDF)
  form.append('pdf[fields][0][name]', 'Signature Client');
  form.append('pdf[fields][0][type]', 'signature');
  form.append('pdf[fields][0][required]', 'true');
  form.append('pdf[fields][0][submitter_uuid]', 'client');
  form.append('pdf[fields][0][areas][0][page]', '1');
  form.append('pdf[fields][0][areas][0][x]', '0.05');
  form.append('pdf[fields][0][areas][0][y]', '0.82');
  form.append('pdf[fields][0][areas][0][w]', '0.42');
  form.append('pdf[fields][0][areas][0][h]', '0.07');

  const pdfFile = new File([pdfBuffer], 'contrat.pdf', { type: 'application/pdf' });
  form.append('pdf[documents][0][file]', pdfFile);

  const tplRes = await fetch(`${baseUrl}/api/templates/pdf`, {
    method: 'POST',
    headers: { Authorization: `Token ${token}` },
    body: form,
  });

  if (!tplRes.ok) {
    const errText = await tplRes.text();
    throw new Error(`Docuseal template error ${tplRes.status}: ${errText}`);
  }

  const template = await tplRes.json();
  const templateId = template.id;
  if (!templateId) throw new Error(`Docuseal: template ID manquant dans la réponse`);

  // ── Step 2: Create submission ──────────────────────────────────────────────
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
        { role: 'Client', email: clientEmail, name: clientName },
      ],
    }),
  });

  if (!subRes.ok) {
    const errText = await subRes.text();
    throw new Error(`Docuseal submission error ${subRes.status}: ${errText}`);
  }

  const subData = await subRes.json();
  // API returns array of submitters or a submission object depending on version
  const submissionId = Array.isArray(subData) ? subData[0]?.submission_id ?? subData[0]?.id : subData.id;

  return { templateId, submissionId };
};

module.exports = { createContractSubmission, isConfigured };
