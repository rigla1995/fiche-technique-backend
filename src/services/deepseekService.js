const pool = require('../config/database');
const { recordTokenUsage } = require('./aiFormatter');
const { executeToolCall, TOOLS_OPENAI, getClientContextLine } = require('./aiToolHandlers');
const { buildSystemPrompt, parseConfidence } = require('./claudeService');

// Groq (OpenAI-compatible) agent with NATIVE tool-calling — accède aux mêmes outils que Claude.
// llama-3.3-70b est nettement plus fiable que Haiku pour le tool-use multi-tours (moins
// d'hallucinations, respecte mieux les consignes).
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_TOOL_ITERATIONS = 8;

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

// Single Groq chat call with tools, retrying on 429 rate-limit.
async function groqChat(messages) {
  const retries = 3;
  for (let attempt = 0; attempt <= retries; attempt++) {
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
        max_tokens: 1024,
        temperature: 0.2,
        stream: false,
      }),
    });

    if (response.status === 429) {
      const errText = await response.text();
      const waitMatch = errText.match(/try again in ([\d.]+)s/i);
      const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 200 : 4000;
      if (attempt < retries) { await new Promise(r => setTimeout(r, waitMs)); continue; }
      throw new Error('Groq rate-limited (429)');
    }
    if (!response.ok) {
      const t = await response.text();
      // 413 : la requête dépasse à elle seule la limite tokens/minute du tier
      // Groq — attendre ne changera rien, il faut REDUIRE le contexte envoyé.
      // Remonté à l'appelant qui retente sans l'historique de conversation.
      if (response.status === 413) {
        return { __tooLarge: true };
      }
      // Llama émet parfois son appel d'outil dans un format MALFORMÉ (ex.
      // `<function=search_knowledge_base{"query": …}`) que Groq rejette en 400
      // tool_use_failed. On remonte la génération fautive à l'appelant qui la
      // récupère (parse + exécution manuelle) au lieu de faire planter le chat.
      if (response.status === 400) {
        try {
          const parsed = JSON.parse(t);
          if (parsed?.error?.code === 'tool_use_failed') {
            return { __toolUseFailed: true, failedGeneration: parsed.error.failed_generation || '' };
          }
        } catch (_) { /* corps non JSON : erreur brute ci-dessous */ }
      }
      throw new Error(`Groq error ${response.status}: ${t.slice(0, 300)}`);
    }
    return response.json();
  }
}

// Récupère { name, args } depuis une génération d'appel d'outil malformée
// (`function=nom{…}` avec ou sans chevrons/balises). Seuls les outils CONNUS
// sont récupérés ; les arguments doivent être un JSON valide (accolades équilibrées).
function recoverToolCall(gen) {
  const s = String(gen || '');
  const nameM = s.match(/function=([a-zA-Z0-9_]+)/);
  if (!nameM) return null;
  const name = nameM[1];
  if (!TOOLS_OPENAI.some((t) => t.function.name === name)) return null;
  let args = '{}';
  const after = s.slice(s.indexOf(nameM[0]) + nameM[0].length);
  const start = after.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    for (let j = start; j < after.length; j++) {
      if (after[j] === '{') depth++;
      else if (after[j] === '}' && --depth === 0) {
        const cand = after.slice(start, j + 1);
        try { JSON.parse(cand); args = cand; } catch (_) { /* JSON invalide : args vides */ }
        break;
      }
    }
  }
  return { name, args };
}

async function chatWithDeepSeek(clientId, chatSessionId, userMessage, confidenceThreshold = 0.75) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY non configurée');

  const conv = await getConversation(clientId, chatSessionId);
  const history = (conv?.messages ?? []).slice(-12);

  let ctxLine = null;
  try { ctxLine = (await getClientContextLine(clientId))?.line || null; } catch (_) { /* prompt sans contexte */ }
  let messages = [
    { role: 'system', content: buildSystemPrompt(ctxLine) },
    ...history,
    { role: 'user', content: userMessage },
  ];

  let finalText = null;
  let confidence = null;
  let toolUseFailures = 0;
  let histoAbandonne = false;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await groqChat(messages);

    let msg;
    if (data.__tooLarge) {
      // Requête trop grosse pour le tier Groq : on abandonne l'historique de
      // conversation (system + question seule) et on retente une fois.
      if (!histoAbandonne) {
        histoAbandonne = true;
        messages = [messages[0], { role: 'user', content: userMessage }];
        continue;
      }
      finalText = 'Votre question dépasse la capacité du moteur IA pour le moment — effacez la conversation (🗑️) puis reposez une question plus courte.';
      break;
    }
    if (data.__toolUseFailed) {
      // Appel d'outil malformé : on récupère l'intention (outil + arguments) et on
      // poursuit le tour normalement ; sinon on re-tente (génération stochastique).
      const rec = recoverToolCall(data.failedGeneration);
      if (rec) {
        msg = {
          role: 'assistant', content: null,
          tool_calls: [{ id: `recovered_${i}`, type: 'function', function: { name: rec.name, arguments: rec.args } }],
        };
      } else if (++toolUseFailures <= 2) {
        continue;
      } else {
        finalText = 'Désolé, je n\'ai pas réussi à consulter mes outils — reformulez votre question ou réessayez.';
        break;
      }
    } else {
      if (clientId && data.usage) {
        recordTokenUsage(clientId, data.usage.prompt_tokens, data.usage.completion_tokens);
      }
      msg = data.choices?.[0]?.message;
      if (!msg) { finalText = 'Désolé, je n\'ai pas pu répondre.'; break; }
    }

    // Keep the assistant turn (with its tool_calls) in the running context.
    messages.push(msg);

    const toolCalls = msg.tool_calls || [];
    if (toolCalls.length === 0) {
      const parsed = parseConfidence(msg.content || '');
      finalText = parsed.message || 'Désolé, je n\'ai pas pu répondre.';
      confidence = parsed.confidence;
      break;
    }

    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch (_) { args = {}; }
      const result = await executeToolCall(clientId, tc.function?.name, args);

      if (result?.__clarification) {
        let clarificationText = result.question;
        if (result.options?.length) {
          clarificationText += '\n\n' + result.options.map((o, idx) => `${idx + 1}. ${o}`).join('\n');
        }
        const storable = history.concat(
          { role: 'user', content: userMessage },
          { role: 'assistant', content: clarificationText }
        );
        await saveConversation(clientId, chatSessionId, conv?.id ?? null, storable, null);
        return { assistantMessage: clarificationText, confidence: null, isClarification: true };
      }

      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }

  if (!finalText) finalText = 'Désolé, je n\'ai pas pu traiter votre demande. Veuillez réessayer.';

  const storable = history.concat(
    { role: 'user', content: userMessage },
    { role: 'assistant', content: finalText }
  );
  await saveConversation(clientId, chatSessionId, conv?.id ?? null, storable, confidence);

  const { rows } = await pool.query('SELECT email, nom FROM utilisateurs WHERE id = $1', [clientId]);
  const { email: clientEmail, nom: clientNom } = rows[0] || {};

  return { assistantMessage: finalText, confidence, clientEmail, clientNom };
}

module.exports = { chatWithDeepSeek, recoverToolCall };
