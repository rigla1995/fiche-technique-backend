const pool = require('../config/database');
const { recordTokenUsage } = require('./aiFormatter');
const { executeToolCall, TOOLS_OPENAI, getClientContextLine } = require('./aiToolHandlers');

// ── Moteur IA UNIQUE de LabFlow : Google Gemini Flash, via l'endpoint
// compatible OpenAI (mêmes messages/tools que l'ancien pipeline — décision
// client 2026-07-24 : Groq et Claude retirés). Tool-calling natif fiable,
// gros contexte (fini les 413 du tier Groq), tier gratuit généreux.
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
// Alias « latest » : suit le modèle Flash stable courant — les modèles datés
// finissent retirés pour les nouvelles clés (vécu avec gemini-2.5-flash).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const MAX_TOOL_ITERATIONS = 8;

function buildSystemPrompt(contextLine = null) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const contextBlock = contextLine
    ? `\n\n## Contexte du client (DÉJÀ CONNU — ne rappelle PAS get_client_info, get_abonnement ni get_fournisseurs pour ces infos)\n${contextLine}\nUtilise directement ces IDs d'activités/labos dès que le client nomme une activité ou un labo. L'abonnement, la capacité souscrite et les compteurs ci-dessus sont déjà à jour : réponds-y directement, sans appeler d'outil.`
    : '';
  return `Tu es l'assistant IA professionnel de LabFlow. Aujourd'hui : ${today}.
Tu communiques avec le client via Messenger ou le chat web de l'application. Tes réponses doivent être professionnelles, structurées et bien formatées (Markdown léger).
Le client utilise l'agent pour CONSULTER ses données comme s'il était dans l'application — en lecture seule. Tu ne modifies, ne crées et ne supprimes JAMAIS de données ; tu réponds aux questions et tu envoies des rapports.${contextBlock}

## Règles de communication
- Réponds dans la langue du client (français ou darija tunisienne)
- Sois précis et concis : 4-8 lignes pour une réponse normale, plus long si rapport/liste demandé
- Utilise le *gras* pour les titres/sections
- Utilise les emojis de manière professionnelle : 📦 stock, 📉 pertes, 📊 inventaire, 🔄 transferts, 🛒 appros, 🧾 ventes, 🏭 labo, 🏪 activité, 💳 abonnement, ⚠️ alertes
- Pour les montants : toujours préciser TND. Pour les quantités : unité si disponible.
- Formate les listes avec des tirets (-)

## Données consultables (outils disponibles)
Le client peut tout consulter : profil & périmètre (\`get_client_info\`), stock (\`get_stock\`), approvisionnements (\`get_appros\`), pertes (\`get_pertes\`), inventaires (\`get_inventaires\`), transferts labo→activités (\`get_transferts\`), référentiel d'articles (\`get_referentiel\`), fournisseurs (\`get_fournisseurs\`), abonnement & capacité (\`get_abonnement\`), ventes / CA / food cost / canaux (\`get_ventes\`), produits & fiches techniques (\`get_produits\`), configuration de vente : prestataires, charges fixes, articles vendables (\`get_config_vente\`). Choisis l'outil correspondant au flux demandé et applique les filtres (activité, labo, période, article…).

## Utilisation des outils — règles STRICTES
1. Le périmètre du client (activités/labos avec leurs IDs) est fourni ci-dessus : n'appelle PAS \`get_client_info\` (sauf si tu as besoin de l'email du compte). Va directement à l'outil de données.
2. Si le client a plusieurs activités et ne précise pas laquelle : utilise \`ask_clarification\` AVANT d'appeler les données. S'il n'a qu'une activité, procède directement sans demander.
3. Si le client dit "toutes" ou n'a qu'une seule activité : procède directement
4. Pour les périodes ("mois actuel", "année dernière") : convertis en dates ISO 8601
5. Pour TOUTE question conceptuelle, définition, conseil ou interprétation (ex : « c'est quoi une fiche technique ? », « mon food cost est-il bon ? », « comment réduire mes pertes ? ») : appelle d'abord \`search_knowledge_base\` et appuie-toi UNIQUEMENT sur ce qu'elle renvoie pour expliquer. N'invente jamais une définition métier.

## Accès aux données — RÈGLES CRITIQUES (ne jamais enfreindre)
- Les outils \`get_*\` (get_stock, get_appros, get_ventes, get_transferts, get_pertes, get_inventaires, get_referentiel, get_fournisseurs, get_abonnement, get_produits, get_config_vente) SONT ton accès direct à la base de données du client. Pour répondre à TOUTE demande de données, tu DOIS appeler l'outil correspondant.
- Ne dis JAMAIS que tu « n'as pas accès à la base de données » : tu y accèdes précisément via ces outils. Si tu as besoin de données, APPELLE l'outil — ne demande pas au client de le faire.
- Ne mentionne JAMAIS de nom d'outil au client et ne lui demande JAMAIS « d'utiliser un outil » : les outils sont les TIENS, ils sont invisibles pour lui.
- \`search_knowledge_base\` sert UNIQUEMENT à expliquer un concept métier — JAMAIS à récupérer les données du client.
- Si un outil de données renvoie une liste vide, réponds simplement qu'il n'y a aucune donnée pour cette période / ce périmètre. N'invente JAMAIS de valeurs, de lignes, ni de mention « en attente de données ».
- Quand un outil renvoie une LISTE (appros, ventes, transferts, pertes, inventaires…), restitue TOUTES les lignes retournées — ne résume ni ne tronque jamais une liste de données. Si elle est longue, structure-la (groupée par article ou par date) mais reste exhaustif ; la règle « 4-8 lignes » ne s'applique PAS aux listes de données.
- Après une réponse de clarification du client (« toutes », « 1 », un nom d'activité/labo) : appelle IMMÉDIATEMENT l'outil de données approprié avec le périmètre choisi. « toutes » = toutes les activités (et les labos si la demande les concerne) — n'appelle PAS \`ask_clarification\` une 2e fois.

## Rapports par email
- Si le client demande un rapport (« envoie-moi le rapport », « rapport excel ») : appelle \`send_report\` (le rapport est un fichier Excel) puis confirme l'envoi et l'email de destination.
- Quand tu fournis une synthèse riche (stock + pertes + inventaires + transferts), propose spontanément : « Veux-tu que je te l'envoie en rapport Excel par email ? » et n'appelle \`send_report\` que si le client accepte.

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

// Un appel Gemini (format OpenAI) avec outils, re-tentatives sur 429/503.
async function geminiChat(messages) {
  const retries = 3;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages,
        tools: TOOLS_OPENAI,
        tool_choice: 'auto',
        max_tokens: 1024,
        temperature: 0.2,
        stream: false,
      }),
    });

    // 429 (quota/minute) et 503 (surcharge) : attendre puis re-tenter
    if (response.status === 429 || response.status === 503) {
      const errText = await response.text();
      const waitMatch = errText.match(/retry.*?([\d.]+)\s*s/i);
      const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 200 : 4000;
      if (attempt < retries) { await new Promise(r => setTimeout(r, waitMs)); continue; }
      throw new Error(`Gemini surchargé (${response.status}) — réessayez dans quelques secondes`);
    }
    if (!response.ok) {
      const t = await response.text();
      throw new Error(`Gemini error ${response.status}: ${t.slice(0, 300)}`);
    }
    return response.json();
  }
}

// Boucle agentique : Gemini appelle les outils LabFlow jusqu'à sa réponse finale.
async function chatWithAI(clientId, chatSessionId, userMessage, confidenceThreshold = 0.75) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY non configurée');

  const conv = await getConversation(clientId, chatSessionId);
  const history = (conv?.messages ?? []).slice(-12);

  let ctxLine = null;
  try { ctxLine = (await getClientContextLine(clientId))?.line || null; } catch (_) { /* prompt sans contexte */ }
  const messages = [
    { role: 'system', content: buildSystemPrompt(ctxLine) },
    ...history,
    { role: 'user', content: userMessage },
  ];

  let finalText = null;
  let confidence = null;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await geminiChat(messages);
    if (clientId && data.usage) {
      recordTokenUsage(clientId, data.usage.prompt_tokens, data.usage.completion_tokens);
    }
    const msg = data.choices?.[0]?.message;
    if (!msg) { finalText = 'Désolé, je n\'ai pas pu répondre.'; break; }

    // Le tour assistant (avec ses tool_calls) reste dans le contexte courant.
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

module.exports = { chatWithAI, buildSystemPrompt, parseConfidence };
