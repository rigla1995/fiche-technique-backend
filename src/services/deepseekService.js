const pool = require('../config/database');
const { routeMessage } = require('./intentRouter');
const { formatWithGroq } = require('./aiFormatter');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

async function getConversation(clientId, sessionId) {
  const { rows } = await pool.query(
    `SELECT id, messages FROM ai_conversations
     WHERE client_id = $1 AND whatsapp_number = $2
     ORDER BY updated_at DESC LIMIT 1`,
    [clientId, sessionId]
  );
  return rows[0] || null;
}

async function saveConversation(clientId, sessionId, conversationId, messages, confidence) {
  if (conversationId) {
    await pool.query(
      `UPDATE ai_conversations
       SET messages = $1, last_confidence = COALESCE($2, last_confidence), updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(messages), confidence, conversationId]
    );
  } else {
    await pool.query(
      `INSERT INTO ai_conversations (client_id, whatsapp_number, messages, last_confidence)
       VALUES ($1, $2, $3, $4)`,
      [clientId, sessionId, JSON.stringify(messages), confidence]
    );
  }
}

// Fallback for general (non-data) messages — simple single Groq call
async function generalChat(history, userMessage, contextLine) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY non configurée');

  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const systemPrompt = `Tu es l'assistant IA professionnel de LabFlow. Aujourd'hui : ${today}.
Contexte client : ${contextLine}
Réponds en français (ou darija), sois concis et professionnel. 4-6 lignes max.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6),
    { role: 'user', content: userMessage },
  ];

  let retries = 3;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: GROQ_MODEL, messages, max_tokens: 400, stream: false }),
    });

    if (response.status === 429) {
      const errText = await response.text();
      const waitMatch = errText.match(/try again in ([\d.]+)s/i);
      const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 200 : 5000;
      if (attempt < retries) { await new Promise(r => setTimeout(r, waitMs)); continue; }
      return 'Service temporairement surchargé. Veuillez réessayer dans quelques secondes.';
    }

    if (!response.ok) throw new Error(`Groq error ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? 'Désolé, je n\'ai pas pu répondre.';
  }
}

async function chatWithDeepSeek(clientId, chatSessionId, userMessage, confidenceThreshold = 0.75) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY non configurée');

  const conv = await getConversation(clientId, chatSessionId);
  const history = (conv?.messages ?? []).slice(-8);

  // Route the message
  const routed = await routeMessage(clientId, userMessage);

  // Context line for prompts
  const { context } = routed;
  const ctxLine = context
    ? `Activités: ${context.activites.map(a => a.nom).join(', ')} | Labos: ${context.labos.map(l => l.nom).join(', ')}`
    : '';

  let assistantMessage;

  if (routed.clarification) {
    // Need more info — no Groq call
    assistantMessage = routed.clarification;
  } else if (routed.intent === 'general') {
    // Conversational message — simple Groq call, no data
    assistantMessage = await generalChat(history, userMessage, ctxLine);
  } else {
    // Data response — format with Groq
    assistantMessage = await formatWithGroq(
      userMessage,
      routed.intent,
      routed.data,
      context,
      routed.dates ?? null
    );
  }

  // Save conversation (only human-readable messages)
  const updatedHistory = [
    ...history,
    { role: 'user', content: userMessage },
    { role: 'assistant', content: assistantMessage },
  ];
  await saveConversation(clientId, chatSessionId, conv?.id ?? null, updatedHistory, null);

  const { rows } = await pool.query('SELECT email, nom FROM utilisateurs WHERE id = $1', [clientId]);
  const { email: clientEmail, nom: clientNom } = rows[0] || {};

  return { assistantMessage, confidence: null, clientEmail, clientNom };
}

module.exports = { chatWithDeepSeek };
