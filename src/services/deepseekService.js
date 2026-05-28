const pool = require('../config/database');
const { executeToolCall, TOOLS_OPENAI } = require('./aiToolHandlers');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_TOOL_ITERATIONS = 8;

function buildSystemPrompt() {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  return `Tu es l'assistant IA professionnel de LabFlow. Aujourd'hui : ${today}.
Tu communiques via Telegram. Tes réponses doivent être professionnelles, structurées et bien formatées en Markdown Telegram.

## Règles de communication
- Réponds dans la langue du client (français ou darija tunisienne)
- Sois précis et concis : 4-8 lignes pour une réponse normale, plus long si rapport demandé
- Utilise le *gras* pour les titres/sections
- Utilise les emojis de manière professionnelle : 📦 stock, 📉 pertes, 📊 inventaire, 🔄 transferts, 🛒 appros, ⚠️ alertes
- Pour les montants : toujours préciser TND. Pour les quantités : unité si disponible.
- Formate les listes avec des tirets (-)

## Utilisation des outils — règles STRICTES
1. TOUJOURS commencer par get_client_info pour connaître les activités/labos du client
2. Si le client a plusieurs activités et ne précise pas laquelle : utilise ask_clarification AVANT d'appeler les données
3. Si le client dit "toutes" ou n'a qu'une seule activité : procède directement
4. Pour les périodes ("mois actuel", "année dernière") : convertis en dates ISO 8601

## Format de réponse obligatoire
Commence TOUJOURS par [CONF:0.XX] (niveau de confiance 0.00-1.00 selon la complétude des données).

## Alertes proactives
- Si stock < 5 unités pour un ingrédient → signaler avec ⚠️
- Si pertes élevées détectées → signaler avec 📉`;
}

function parseConfidence(rawMessage) {
  const match = rawMessage.match(/^\[CONF:(0\.\d{1,2})\]\s*/);
  if (match) {
    return { confidence: parseFloat(match[1]), message: rawMessage.slice(match[0].length).trim() };
  }
  return { confidence: null, message: rawMessage };
}

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

// Parse LLaMA-style function calls from Groq's failed_generation.
// Handles all observed formats:
//   <function=NAME>{"args":...}</function>
//   <function=NAME{"args":...}</function>  (missing >)
//   <function=NAME({"args":...})</function> (parens wrapper)
function parseLlamaFunctionCall(raw) {
  const m = raw.match(/<function=([a-zA-Z_]+)(>?)\s*([\s\S]*?)\s*<\/function>/);
  if (!m) return null;
  let name = m[1];
  let argsStr = m[3].trim();
  // When > is absent, args may be concatenated directly onto the name
  if (m[2] === '') {
    const firstBrace = name.indexOf('{');
    const firstParen = name.indexOf('(');
    const splitAt = Math.min(
      firstBrace === -1 ? Infinity : firstBrace,
      firstParen === -1 ? Infinity : firstParen
    );
    if (splitAt !== Infinity) {
      argsStr = name.slice(splitAt) + argsStr;
      name = name.slice(0, splitAt);
    }
  }
  // Strip wrapping parentheses: ({"key": val}) → {"key": val}
  argsStr = argsStr.replace(/^\(+/, '').replace(/\)+$/, '').trim();
  try {
    return { name, args: JSON.parse(argsStr || '{}') };
  } catch {
    return null;
  }
}

async function chatWithDeepSeek(clientId, chatSessionId, userMessage, confidenceThreshold = 0.75) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY non configurée');

  const conv = await getConversation(clientId, chatSessionId);
  const history = (conv?.messages ?? []).slice(-16);

  const systemPrompt = buildSystemPrompt();
  // Groq uses system as first message in the messages array
  let messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];

  // Track storable messages (no tool internals)
  const storableHistory = [...history, { role: 'user', content: userMessage }];

  let finalText = null;
  let confidence = null;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        tools: TOOLS_OPENAI,
        tool_choice: 'auto',
        parallel_tool_calls: false,
        max_tokens: 1024,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      // Groq returns 400 with tool_use_failed when the model generates
      // the LLaMA-style <function=NAME{...}</function> format instead of
      // OpenAI tool_calls. Recover by parsing failed_generation and executing.
      let recovered = false;
      try {
        const errJson = JSON.parse(errText);
        const failedGen = errJson?.error?.failed_generation;
        if (errJson?.error?.code === 'tool_use_failed' && failedGen) {
          const parsed = parseLlamaFunctionCall(failedGen);
          if (parsed) {
            console.warn(`[Groq] tool_use_failed — recovering call to ${parsed.name}`);
            const fakeId = `recovered_${Date.now()}`;
            // Inject a synthetic assistant message with tool_calls so the
            // conversation history stays consistent for follow-up turns
            messages.push({
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: fakeId,
                type: 'function',
                function: { name: parsed.name, arguments: JSON.stringify(parsed.args) },
              }],
            });
            const result = await executeToolCall(clientId, parsed.name, parsed.args);
            if (result?.__clarification) {
              let clarificationText = result.question;
              if (result.options?.length) {
                clarificationText += '\n\n' + result.options.map((o, idx) => `${idx + 1}. ${o}`).join('\n');
              }
              const storableMessages = storableHistory.concat({ role: 'assistant', content: clarificationText });
              await saveConversation(clientId, chatSessionId, conv?.id ?? null, storableMessages, null);
              return { assistantMessage: clarificationText, confidence: null, isClarification: true };
            }
            messages.push({ role: 'tool', tool_call_id: fakeId, content: JSON.stringify(result) });
            recovered = true;
          }
        }
      } catch { /* ignore parse errors, fall through to throw */ }
      if (!recovered) throw new Error(`Groq API error ${response.status}: ${errText}`);
      continue;
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const finishReason = choice?.finish_reason;
    const assistantMsg = choice?.message;

    if (!assistantMsg) break;

    messages.push(assistantMsg);

    if (finishReason === 'stop' || finishReason === 'end_turn') {
      const raw = assistantMsg.content ?? 'Désolé, je n\'ai pas pu répondre.';
      const parsed = parseConfidence(raw);
      finalText = parsed.message;
      confidence = parsed.confidence;
      break;
    }

    if (finishReason === 'tool_calls' && assistantMsg.tool_calls?.length) {
      const toolResultMessages = [];

      for (const toolCall of assistantMsg.tool_calls) {
        const toolName = toolCall.function.name;
        let toolInput = {};
        try {
          toolInput = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          toolInput = {};
        }

        const result = await executeToolCall(clientId, toolName, toolInput);

        if (result?.__clarification) {
          let clarificationText = result.question;
          if (result.options?.length) {
            clarificationText += '\n\n' + result.options.map((o, idx) => `${idx + 1}. ${o}`).join('\n');
          }
          const storableMessages = storableHistory.concat({ role: 'assistant', content: clarificationText });
          await saveConversation(clientId, chatSessionId, conv?.id ?? null, storableMessages, null);
          return { assistantMessage: clarificationText, confidence: null, isClarification: true };
        }

        toolResultMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      messages.push(...toolResultMessages);
    }
  }

  if (!finalText) {
    finalText = 'Désolé, je n\'ai pas pu traiter votre demande. Veuillez réessayer.';
  }

  const storableMessages = storableHistory.concat({ role: 'assistant', content: finalText });
  await saveConversation(clientId, chatSessionId, conv?.id ?? null, storableMessages, confidence);

  const { rows } = await pool.query('SELECT email, nom FROM utilisateurs WHERE id = $1', [clientId]);
  const { email: clientEmail, nom: clientNom } = rows[0] || {};

  return { assistantMessage: finalText, confidence, clientEmail, clientNom };
}

module.exports = { chatWithDeepSeek };
