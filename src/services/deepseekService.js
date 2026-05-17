const pool = require('../config/database');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // Groq free tier

async function fetchClientContext(clientId) {
  const [stockRows, pertesRows, inventaireRows, clientRow] = await Promise.all([
    pool.query(
      `SELECT i.nom AS ingredient, scd.quantite, scd.date_appro, scd.prix_unitaire
       FROM stock_client_daily scd
       JOIN ingredients i ON i.id = scd.ingredient_id
       WHERE scd.client_id = $1
       ORDER BY scd.date_appro DESC LIMIT 100`,
      [clientId]
    ),
    pool.query(
      `SELECT i.nom AS ingredient, cp.quantite, cp.type_perte, cp.date_perte
       FROM client_pertes cp
       JOIN ingredients i ON i.id = cp.ingredient_id
       WHERE cp.client_id = $1
       ORDER BY cp.date_perte DESC LIMIT 50`,
      [clientId]
    ),
    pool.query(
      `SELECT i.nom AS ingredient, inv.quantite_reelle, inv.date_inventaire
       FROM inventaires inv
       JOIN ingredients i ON i.id = inv.ingredient_id
       WHERE inv.client_id = $1
       ORDER BY inv.date_inventaire DESC LIMIT 50`,
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
    appros: stockRows.rows.slice(0, 30), // last appros from same table
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

  return `Tu es l'assistant IA de LabFlow pour le client "${context.clientNom}". Aujourd'hui : ${today}.
Tu réponds via Telegram — sois concis (max 4-5 lignes), pratique, en français.
Tu as accès aux données réelles du client ci-dessous.

STOCK ACTUEL :
${stockLines}

PERTES RÉCENTES :
${pertesLines}

INVENTAIRES RÉCENTS :
${inventaireLines}

APPROS RÉCENTS :
${approLines}

IMPORTANT — Format de réponse obligatoire :
Commence TOUJOURS ta réponse par [CONF:0.XX] où XX est ton niveau de confiance de 0.00 à 1.00 basé sur la disponibilité et la précision des données fournies.
Exemples : [CONF:0.92] si données complètes et réponse certaine. [CONF:0.45] si données manquantes ou réponse incertaine.

Règles :
- Si on te demande un rapport par email, réponds "Je vais envoyer le rapport par email à ${context.clientEmail}" puis génère un résumé clair.
- Si tu identifies stock bas ou pertes élevées, signale-le proactivement.
- Réponds toujours en français, de façon courte et actionnable.`;
}

async function getConversation(clientId, whatsappNumber) {
  const result = await pool.query(
    `SELECT id, messages FROM ai_conversations
     WHERE client_id = $1 AND whatsapp_number = $2
     ORDER BY updated_at DESC LIMIT 1`,
    [clientId, whatsappNumber]
  );
  return result.rows[0] || null;
}

async function saveConversation(clientId, whatsappNumber, conversationId, messages) {
  if (conversationId) {
    await pool.query(
      'UPDATE ai_conversations SET messages = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(messages), conversationId]
    );
  } else {
    await pool.query(
      'INSERT INTO ai_conversations (client_id, whatsapp_number, messages) VALUES ($1, $2, $3)',
      [clientId, whatsappNumber, JSON.stringify(messages)]
    );
  }
}

// Parse [CONF:0.XX] tag from DeepSeek response
function parseConfidence(rawMessage) {
  const match = rawMessage.match(/^\[CONF:(0\.\d{1,2})\]\s*/);
  if (match) {
    return {
      confidence: parseFloat(match[1]),
      message: rawMessage.slice(match[0].length).trim(),
    };
  }
  return { confidence: null, message: rawMessage };
}

// telegramChatId is used as the session key (reuses whatsapp_number column)
async function chatWithDeepSeek(clientId, telegramChatId, userMessage, confidenceThreshold = 0.75) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY non configurée');

  const context = await fetchClientContext(clientId);
  const systemPrompt = buildSystemPrompt(context);

  const conv = await getConversation(clientId, telegramChatId);
  const history = (conv?.messages ?? []).slice(-16);
  history.push({ role: 'user', content: userMessage });

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      max_tokens: 512,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content ?? 'Désolé, je n\'ai pas pu répondre.';
  const { confidence, message: assistantMessage } = parseConfidence(raw);

  const updatedMessages = history.concat({ role: 'assistant', content: assistantMessage });
  await saveConversation(clientId, telegramChatId, conv?.id ?? null, updatedMessages);

  return { assistantMessage, confidence, clientEmail: context.clientEmail, clientNom: context.clientNom };
}

module.exports = { chatWithDeepSeek, fetchClientContext, buildSystemPrompt };
