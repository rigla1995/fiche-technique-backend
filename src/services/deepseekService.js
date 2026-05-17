const pool = require('../config/database');

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat'; // DeepSeek-V3 — free tier

async function fetchClientContext(clientId) {
  const [stockRows, pertesRows, inventaireRows, clientRow, approRows] = await Promise.all([
    pool.query(
      `SELECT i.nom AS ingredient, scd.quantite, scd.date
       FROM stock_client_daily scd
       JOIN ingredients i ON i.id = scd.ingredient_id
       WHERE scd.client_id = $1
       ORDER BY scd.date DESC LIMIT 100`,
      [clientId]
    ),
    pool.query(
      `SELECT i.nom AS ingredient, cp.quantite, cp.raison, cp.date_perte
       FROM client_pertes cp
       JOIN ingredients i ON i.id = cp.ingredient_id
       WHERE cp.client_id = $1
       ORDER BY cp.date_perte DESC LIMIT 50`,
      [clientId]
    ),
    pool.query(
      `SELECT i.nom AS ingredient, inv.quantite_reelle, inv.ecart, inv.created_at
       FROM inventaires inv
       JOIN ingredients i ON i.id = inv.ingredient_id
       WHERE inv.client_id = $1
       ORDER BY inv.created_at DESC LIMIT 50`,
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
    pool.query(
      `SELECT i.nom AS ingredient, sa.quantite, sa.date_appro, sa.prix_unitaire
       FROM stock_appros sa
       JOIN ingredients i ON i.id = sa.ingredient_id
       WHERE sa.client_id = $1
       ORDER BY sa.date_appro DESC LIMIT 30`,
      [clientId]
    ).catch(() => ({ rows: [] })),
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
    appros: approRows.rows,
  };
}

function buildSystemPrompt(context) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const stockLines = Object.values(context.stock)
    .map(r => `  - ${r.ingredient}: ${r.quantite} (au ${new Date(r.date).toLocaleDateString('fr-FR')})`)
    .join('\n') || '  Aucune donnée.';

  const pertesLines = context.pertes.slice(0, 20)
    .map(r => `  - ${r.ingredient}: ${r.quantite}${r.raison ? ` (${r.raison})` : ''} le ${new Date(r.date_perte).toLocaleDateString('fr-FR')}`)
    .join('\n') || '  Aucune perte récente.';

  const inventaireLines = context.inventaires.slice(0, 15)
    .map(r => `  - ${r.ingredient}: réel=${r.quantite_reelle}, écart=${r.ecart >= 0 ? '+' : ''}${r.ecart}`)
    .join('\n') || '  Aucun inventaire récent.';

  const approLines = context.appros.slice(0, 10)
    .map(r => `  - ${r.ingredient}: ${r.quantite} le ${new Date(r.date_appro).toLocaleDateString('fr-FR')}${r.prix_unitaire ? ` à ${r.prix_unitaire} TND/u` : ''}`)
    .join('\n') || '  Aucun appro récent.';

  return `Tu es l'assistant IA de LabFlow pour le client "${context.clientNom}". Aujourd'hui : ${today}.
Tu réponds via WhatsApp — sois concis (max 3-4 lignes), pratique, en français.
Tu as accès aux données réelles du client ci-dessous.

STOCK ACTUEL :
${stockLines}

PERTES RÉCENTES :
${pertesLines}

INVENTAIRES RÉCENTS (écarts) :
${inventaireLines}

APPROS RÉCENTS :
${approLines}

Règles :
- Si on te demande un rapport par email, réponds "Je vais envoyer le rapport par email à ${context.clientEmail}" puis génère un résumé clair.
- Ne génère pas de tableaux complexes (WhatsApp ne les affiche pas bien).
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

async function chatWithDeepSeek(clientId, whatsappNumber, userMessage) {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY non configurée');

  const context = await fetchClientContext(clientId);
  const systemPrompt = buildSystemPrompt(context);

  const conv = await getConversation(clientId, whatsappNumber);
  const history = (conv?.messages ?? []).slice(-16);
  history.push({ role: 'user', content: userMessage });

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      max_tokens: 512,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const assistantMessage = data.choices?.[0]?.message?.content ?? 'Désolé, je n\'ai pas pu répondre.';
  const updatedMessages = history.concat({ role: 'assistant', content: assistantMessage });

  await saveConversation(clientId, whatsappNumber, conv?.id ?? null, updatedMessages);

  return { assistantMessage, clientEmail: context.clientEmail, clientNom: context.clientNom };
}

module.exports = { chatWithDeepSeek, fetchClientContext, buildSystemPrompt };
