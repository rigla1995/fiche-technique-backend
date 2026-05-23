const pool = require('../config/database');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL   = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';

// Shared CTE: resolve all activite_ids and labo_ids for a client
const CLIENT_SCOPE_CTE = `
  WITH pe AS (
    SELECT id FROM profil_entreprise WHERE client_id = $1
  ),
  client_activites AS (
    SELECT id FROM activites WHERE entreprise_id IN (SELECT id FROM pe)
  ),
  client_labos AS (
    SELECT id FROM labos WHERE entreprise_id IN (SELECT id FROM pe)
  )
`;

async function fetchClientContext(clientId) {
  const [stockRows, pertesRows, inventaireRows, transferRows, clientRow] = await Promise.all([

    pool.query(
      `${CLIENT_SCOPE_CTE}
       SELECT i.nom AS ingredient, s.quantite, s.date_appro, s.prix_unitaire
       FROM (
         SELECT sed.ingredient_id, sed.quantite, sed.date_appro, sed.prix_unitaire
         FROM stock_entreprise_daily sed
         WHERE sed.activite_id IN (SELECT id FROM client_activites)
         UNION ALL
         SELECT sld.ingredient_id, sld.quantite, sld.date_appro, sld.prix_unitaire
         FROM stock_labo_daily sld
         WHERE sld.labo_id IN (SELECT id FROM client_labos)
         UNION ALL
         SELECT scd.ingredient_id, scd.quantite, scd.date_appro, scd.prix_unitaire
         FROM stock_client_daily scd
         WHERE scd.client_id = $1
       ) s
       JOIN articles i ON i.id = s.ingredient_id
       ORDER BY s.date_appro DESC LIMIT 100`,
      [clientId]
    ),

    pool.query(
      `${CLIENT_SCOPE_CTE}
       SELECT i.nom AS ingredient, p.quantite, p.type_perte, p.date_perte
       FROM (
         SELECT p.ingredient_id, p.quantite, p.type_perte, p.date_perte
         FROM pertes p
         WHERE p.activite_id IN (SELECT id FROM client_activites)
           AND p.ingredient_id IS NOT NULL
         UNION ALL
         SELECT lp.ingredient_id, lp.quantite, lp.type_perte, lp.date_perte
         FROM labo_pertes lp
         WHERE lp.labo_id IN (SELECT id FROM client_labos)
           AND lp.ingredient_id IS NOT NULL
         UNION ALL
         SELECT cp.ingredient_id, cp.quantite, cp.type_perte, cp.date_perte
         FROM client_pertes cp
         WHERE cp.client_id = $1
       ) p
       JOIN articles i ON i.id = p.ingredient_id
       ORDER BY p.date_perte DESC LIMIT 50`,
      [clientId]
    ),

    pool.query(
      `${CLIENT_SCOPE_CTE}
       SELECT i.nom AS ingredient, inv.quantite_reelle, inv.date_inventaire
       FROM inventaires inv
       JOIN articles i ON i.id = inv.ingredient_id
       WHERE inv.ingredient_id IS NOT NULL
         AND (
           inv.client_id = $1
           OR inv.activite_id IN (SELECT id FROM client_activites)
           OR inv.labo_id IN (SELECT id FROM client_labos)
         )
       ORDER BY inv.date_inventaire DESC LIMIT 50`,
      [clientId]
    ),

    pool.query(
      `${CLIENT_SCOPE_CTE}
       SELECT i.nom AS ingredient, lt.quantite, lt.date_transfert
       FROM labo_transfers lt
       JOIN articles i ON i.id = lt.ingredient_id
       WHERE lt.activite_id IN (SELECT id FROM client_activites)
         AND lt.ingredient_id IS NOT NULL
       ORDER BY lt.date_transfert DESC LIMIT 30`,
      [clientId]
    ),

    pool.query(
      `SELECT u.nom, u.email, a.mode_compte, ac.nb_activites, ac.nb_labos
       FROM utilisateurs u
       LEFT JOIN abonnements a ON a.client_id = u.id
       LEFT JOIN abonnement_config ac ON ac.abonnement_id = a.id
       WHERE u.id = $1`,
      [clientId]
    ),
  ]);

  const clientInfo = clientRow.rows[0] || {};
  const stockByIngredient = stockRows.rows.reduce((acc, r) => {
    if (!acc[r.ingredient]) acc[r.ingredient] = r;
    return acc;
  }, {});

  return {
    clientNom: clientInfo.nom || 'Client',
    clientEmail: clientInfo.email || '',
    modeCompte: clientInfo.mode_compte,
    stock: stockByIngredient,
    pertes: pertesRows.rows,
    inventaires: inventaireRows.rows,
    transferts: transferRows.rows,
    appros: stockRows.rows.slice(0, 30),
  };
}

function buildSystemPrompt(context) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const stockLines = Object.values(context.stock)
    .map(r => `  - ${r.ingredient}: ${r.quantite} (au ${new Date(r.date_appro).toLocaleDateString('fr-FR')})`)
    .join('\n') || '  Aucune donnée.';

  const pertesLines = context.pertes.slice(0, 20)
    .map(r => `  - ${r.ingredient}: ${r.quantite} (${r.type_perte}) le ${new Date(r.date_perte).toLocaleDateString('fr-FR')}`)
    .join('\n') || '  Aucune perte récente.';

  const inventaireLines = context.inventaires.slice(0, 15)
    .map(r => `  - ${r.ingredient}: réel=${r.quantite_reelle} (le ${new Date(r.date_inventaire).toLocaleDateString('fr-FR')})`)
    .join('\n') || '  Aucun inventaire récent.';

  const approLines = context.appros.slice(0, 10)
    .map(r => `  - ${r.ingredient}: ${r.quantite} le ${new Date(r.date_appro).toLocaleDateString('fr-FR')}${r.prix_unitaire ? ` à ${r.prix_unitaire} TND/u` : ''}`)
    .join('\n') || '  Aucun appro récent.';

  const transfertLines = context.transferts.slice(0, 10)
    .map(r => `  - ${r.ingredient}: ${r.quantite} le ${new Date(r.date_transfert).toLocaleDateString('fr-FR')}`)
    .join('\n') || '  Aucun transfert récent.';

  return `Tu es l'assistant IA de LabFlow pour le client "${context.clientNom}". Aujourd'hui : ${today}.
Tu réponds via Telegram — sois concis (max 4-5 lignes), pratique.
Tu as accès aux données réelles du client ci-dessous.

LANGUE : Réponds dans la même langue que le client. Si le client écrit en arabe tunisien (darija), réponds en darija tunisienne. Si en français, réponds en français. Tu comprends et parles couramment le dialecte tunisien.

STOCK ACTUEL (activités + labos) :
${stockLines}

PERTES RÉCENTES (activités + labos) :
${pertesLines}

INVENTAIRES RÉCENTS :
${inventaireLines}

APPROS RÉCENTS :
${approLines}

TRANSFERTS LABO → ACTIVITÉ :
${transfertLines}

IMPORTANT — Format de réponse obligatoire :
Commence TOUJOURS ta réponse par [CONF:0.XX] où XX est ton niveau de confiance de 0.00 à 1.00 basé sur la disponibilité et la précision des données fournies.
Exemples : [CONF:0.92] si données complètes et réponse certaine. [CONF:0.45] si données manquantes ou réponse incertaine.

Règles :
- Si on te demande un rapport par email, réponds "Je vais envoyer le rapport par email à ${context.clientEmail}" puis génère un résumé clair.
- Si tu identifies stock bas ou pertes élevées, signale-le proactivement.
- Sois court et actionnable.`;
}

function parseConfidence(rawMessage) {
  const match = rawMessage.match(/^\[CONF:(0\.\d{1,2})\]\s*/);
  if (match) {
    return { confidence: parseFloat(match[1]), message: rawMessage.slice(match[0].length).trim() };
  }
  return { confidence: null, message: rawMessage };
}

async function getConversation(clientId, sessionId) {
  const result = await pool.query(
    `SELECT id, messages FROM ai_conversations
     WHERE client_id = $1 AND whatsapp_number = $2
     ORDER BY updated_at DESC LIMIT 1`,
    [clientId, sessionId]
  );
  return result.rows[0] || null;
}

async function saveConversation(clientId, sessionId, conversationId, messages) {
  if (conversationId) {
    await pool.query(
      'UPDATE ai_conversations SET messages = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(messages), conversationId]
    );
  } else {
    await pool.query(
      'INSERT INTO ai_conversations (client_id, whatsapp_number, messages) VALUES ($1, $2, $3)',
      [clientId, sessionId, JSON.stringify(messages)]
    );
  }
}

async function chatWithClaude(clientId, chatSessionId, userMessage, confidenceThreshold = 0.75) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY non configurée');

  const context = await fetchClientContext(clientId);
  const systemPrompt = buildSystemPrompt(context);

  const conv = await getConversation(clientId, chatSessionId);
  const history = (conv?.messages ?? []).slice(-16);
  history.push({ role: 'user', content: userMessage });

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: systemPrompt,
      messages: history,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const raw = data.content?.[0]?.text ?? 'Désolé, je n\'ai pas pu répondre.';
  const { confidence, message: assistantMessage } = parseConfidence(raw);

  const updatedMessages = history.concat({ role: 'assistant', content: assistantMessage });
  await saveConversation(clientId, chatSessionId, conv?.id ?? null, updatedMessages);

  return { assistantMessage, confidence, clientEmail: context.clientEmail, clientNom: context.clientNom };
}

module.exports = { chatWithClaude, fetchClientContext, buildSystemPrompt };
