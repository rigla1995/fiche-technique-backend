const pool = require('../config/database');
const { executeToolCall, TOOLS_ANTHROPIC } = require('./aiToolHandlers');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOOL_ITERATIONS = 8;

function buildSystemPrompt() {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  return `Tu es l'assistant IA professionnel de LabFlow. Aujourd'hui : ${today}.
Tu communiques avec le client via Telegram, Messenger ou le chat web. Tes réponses doivent être professionnelles, structurées et bien formatées (Markdown léger).
Le client utilise l'agent pour CONSULTER ses données comme s'il était dans l'application — en lecture seule. Tu ne modifies, ne crées et ne supprimes JAMAIS de données ; tu réponds aux questions et tu envoies des rapports.

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
1. TOUJOURS commencer par \`get_client_info\` pour connaître les activités/labos du client
2. Si le client a plusieurs activités et ne précise pas laquelle : utilise \`ask_clarification\` AVANT d'appeler les données
3. Si le client dit "toutes" ou n'a qu'une seule activité : procède directement
4. Pour les périodes ("mois actuel", "année dernière") : convertis en dates ISO 8601
5. Pour TOUTE question conceptuelle, définition, conseil ou interprétation (ex : « c'est quoi une fiche technique ? », « mon food cost est-il bon ? », « comment réduire mes pertes ? ») : appelle d'abord \`search_knowledge_base\` et appuie-toi UNIQUEMENT sur ce qu'elle renvoie pour expliquer. N'invente jamais une définition métier.

## Accès aux données — RÈGLES CRITIQUES (ne jamais enfreindre)
- Les outils \`get_*\` (get_stock, get_appros, get_ventes, get_transferts, get_pertes, get_inventaires, get_referentiel, get_fournisseurs, get_abonnement, get_produits, get_config_vente) SONT ton accès direct à la base de données du client. Pour répondre à TOUTE demande de données, tu DOIS appeler l'outil correspondant.
- Ne dis JAMAIS que tu « n'as pas accès à la base de données » : tu y accèdes précisément via ces outils. Si tu as besoin de données, APPELLE l'outil — ne demande pas au client de le faire.
- Ne mentionne JAMAIS de nom d'outil au client et ne lui demande JAMAIS « d'utiliser un outil » : les outils sont les TIENS, ils sont invisibles pour lui.
- \`search_knowledge_base\` sert UNIQUEMENT à expliquer un concept métier — JAMAIS à récupérer les données du client.
- Si un outil de données renvoie une liste vide, réponds simplement qu'il n'y a aucune donnée pour cette période / ce périmètre. N'invente JAMAIS de valeurs, de lignes, ni de mention « en attente de données ».
- Après une réponse de clarification du client (« toutes », « 1 », un nom d'activité/labo) : appelle IMMÉDIATEMENT l'outil de données approprié avec le périmètre choisi. « toutes » = toutes les activités (et les labos si la demande les concerne) — n'appelle PAS \`ask_clarification\` une 2e fois.

## Rapports par email
- Si le client demande un rapport (« envoie-moi le rapport », « rapport excel/pdf ») : appelle \`send_report\` avec le format demandé (excel par défaut) puis confirme l'envoi et l'email de destination.
- Quand tu fournis une synthèse riche (stock + pertes + inventaires + transferts), propose spontanément : « Veux-tu que je te l'envoie en rapport Excel ou PDF par email ? » et n'appelle \`send_report\` que si le client accepte.

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

async function chatWithClaude(clientId, chatSessionId, userMessage, confidenceThreshold = 0.75) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY non configurée');

  const conv = await getConversation(clientId, chatSessionId);
  const history = (conv?.messages ?? []).slice(-16);
  history.push({ role: 'user', content: userMessage });

  const systemPrompt = buildSystemPrompt();
  let messages = [...history];
  let finalText = null;
  let confidence = null;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS_ANTHROPIC,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const stopReason = data.stop_reason;
    const content = data.content || [];

    messages.push({ role: 'assistant', content });

    if (stopReason === 'end_turn') {
      const textBlock = content.find(b => b.type === 'text');
      const raw = textBlock?.text ?? 'Désolé, je n\'ai pas pu répondre.';
      const parsed = parseConfidence(raw);
      finalText = parsed.message;
      confidence = parsed.confidence;
      break;
    }

    if (stopReason === 'tool_use') {
      const toolUseBlocks = content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        const result = await executeToolCall(clientId, toolUse.name, toolUse.input);

        if (result?.__clarification) {
          let clarificationText = result.question;
          if (result.options?.length) {
            clarificationText += '\n\n' + result.options.map((o, idx) => `${idx + 1}. ${o}`).join('\n');
          }
          const storableMessages = history.concat({ role: 'assistant', content: clarificationText });
          await saveConversation(clientId, chatSessionId, conv?.id ?? null, storableMessages, null);
          return { assistantMessage: clarificationText, confidence: null, isClarification: true };
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }

  if (!finalText) {
    finalText = 'Désolé, je n\'ai pas pu traiter votre demande. Veuillez réessayer.';
  }

  const storableMessages = history.concat({ role: 'assistant', content: finalText });
  await saveConversation(clientId, chatSessionId, conv?.id ?? null, storableMessages, confidence);

  const { rows } = await pool.query('SELECT email, nom FROM utilisateurs WHERE id = $1', [clientId]);
  const { email: clientEmail, nom: clientNom } = rows[0] || {};

  return { assistantMessage: finalText, confidence, clientEmail, clientNom };
}

module.exports = { chatWithClaude, buildSystemPrompt, parseConfidence };
