const pool = require('../config/database');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOOL_ITERATIONS = 8;

// ── CTE scope helper ──────────────────────────────────────────────────────────

const CLIENT_SCOPE_CTE = `
  WITH pe AS (SELECT id FROM profil_entreprise WHERE client_id = $1),
  client_activites AS (SELECT id, nom FROM activites WHERE entreprise_id IN (SELECT id FROM pe)),
  client_labos AS (SELECT id, nom FROM labos WHERE entreprise_id IN (SELECT id FROM pe))
`;

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_client_info',
    description: 'Récupère le profil du client : nom, email, liste des activités (id + nom), liste des labos (id + nom). Appeler en premier pour connaître le périmètre disponible.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_stock',
    description: 'Récupère le stock d\'ingrédients. Sans filtre = toutes activités et labos. Supporte filtrage par activité, labo, ingrédient, et période.',
    input_schema: {
      type: 'object',
      properties: {
        activite_id: { type: 'integer', description: 'ID de l\'activité' },
        labo_id: { type: 'integer', description: 'ID du labo' },
        ingredient: { type: 'string', description: 'Nom partiel de l\'ingrédient (recherche ILIKE)' },
        date_from: { type: 'string', description: 'Date de début ISO 8601 (ex: 2025-01-01)' },
        date_to: { type: 'string', description: 'Date de fin ISO 8601 (ex: 2025-12-31)' },
        limit: { type: 'integer', description: 'Max résultats (défaut 50, max 500)' },
      },
      required: [],
    },
  },
  {
    name: 'get_appros',
    description: 'Récupère l\'historique des approvisionnements (achats) avec quantités et prix unitaires en TND. Supporte filtrage par activité, labo, ingrédient, période.',
    input_schema: {
      type: 'object',
      properties: {
        activite_id: { type: 'integer', description: 'ID de l\'activité' },
        labo_id: { type: 'integer', description: 'ID du labo' },
        ingredient: { type: 'string', description: 'Nom partiel de l\'ingrédient' },
        date_from: { type: 'string', description: 'Date de début ISO 8601' },
        date_to: { type: 'string', description: 'Date de fin ISO 8601' },
        limit: { type: 'integer', description: 'Max résultats (défaut 50, max 500)' },
      },
      required: [],
    },
  },
  {
    name: 'get_pertes',
    description: 'Récupère l\'historique des pertes d\'ingrédients. Supporte filtrage par activité, labo, ingrédient, période.',
    input_schema: {
      type: 'object',
      properties: {
        activite_id: { type: 'integer', description: 'ID de l\'activité' },
        labo_id: { type: 'integer', description: 'ID du labo' },
        ingredient: { type: 'string', description: 'Nom partiel de l\'ingrédient' },
        date_from: { type: 'string', description: 'Date de début ISO 8601' },
        date_to: { type: 'string', description: 'Date de fin ISO 8601' },
        limit: { type: 'integer', description: 'Max résultats (défaut 100, max 1000)' },
      },
      required: [],
    },
  },
  {
    name: 'get_inventaires',
    description: 'Récupère l\'historique des inventaires. Supporte filtrage par activité, labo, ingrédient, période.',
    input_schema: {
      type: 'object',
      properties: {
        activite_id: { type: 'integer', description: 'ID de l\'activité' },
        labo_id: { type: 'integer', description: 'ID du labo' },
        ingredient: { type: 'string', description: 'Nom partiel de l\'ingrédient' },
        date_from: { type: 'string', description: 'Date de début ISO 8601' },
        date_to: { type: 'string', description: 'Date de fin ISO 8601' },
        limit: { type: 'integer', description: 'Max résultats (défaut 50, max 500)' },
      },
      required: [],
    },
  },
  {
    name: 'get_transferts',
    description: 'Récupère l\'historique des transferts labo → activité. Supporte filtrage par activité, labo, ingrédient, période.',
    input_schema: {
      type: 'object',
      properties: {
        activite_id: { type: 'integer', description: 'ID de l\'activité destination' },
        labo_id: { type: 'integer', description: 'ID du labo source' },
        ingredient: { type: 'string', description: 'Nom partiel de l\'ingrédient' },
        date_from: { type: 'string', description: 'Date de début ISO 8601' },
        date_to: { type: 'string', description: 'Date de fin ISO 8601' },
        limit: { type: 'integer', description: 'Max résultats (défaut 50, max 500)' },
      },
      required: [],
    },
  },
  {
    name: 'ask_clarification',
    description: 'Envoie une question de clarification au client avant de requêter les données. OBLIGATOIRE si le client a plusieurs activités et n\'a pas précisé laquelle. OBLIGATOIRE si la demande est ambiguë.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Question à poser en français ou darija selon la langue du client' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Options proposées (ex: ["Activité A", "Activité B", "Toutes les activités"])',
        },
      },
      required: ['question'],
    },
  },
];

// ── Tool implementations ──────────────────────────────────────────────────────

async function toolGetClientInfo(clientId) {
  const [clientRow, activitesRow, labosRow] = await Promise.all([
    pool.query(
      `SELECT u.nom, u.email, a.mode_compte, ac.nb_activites, ac.nb_labos
       FROM utilisateurs u
       LEFT JOIN abonnements a ON a.client_id = u.id
       LEFT JOIN abonnement_config ac ON ac.abonnement_id = a.id
       WHERE u.id = $1`,
      [clientId]
    ),
    pool.query(
      `SELECT a.id, a.nom
       FROM activites a
       JOIN profil_entreprise pe ON pe.id = a.entreprise_id
       WHERE pe.client_id = $1 ORDER BY a.nom`,
      [clientId]
    ),
    pool.query(
      `SELECT l.id, l.nom
       FROM labos l
       JOIN profil_entreprise pe ON pe.id = l.entreprise_id
       WHERE pe.client_id = $1 ORDER BY l.nom`,
      [clientId]
    ),
  ]);
  const c = clientRow.rows[0] || {};
  return {
    nom: c.nom,
    email: c.email,
    mode_compte: c.mode_compte,
    activites: activitesRow.rows,
    labos: labosRow.rows,
  };
}

async function toolGetStock(clientId, { activite_id, labo_id, ingredient, date_from, date_to, limit = 50 }) {
  const safeLimit = Math.min(parseInt(limit) || 50, 500);
  const params = [clientId];
  const conditions = [];

  if (activite_id) { params.push(activite_id); conditions.push(`s.activite_id = $${params.length}`); }
  if (labo_id && !activite_id) { params.push(labo_id); conditions.push(`s.labo_id = $${params.length}`); }
  if (date_from) { params.push(date_from); conditions.push(`s.date_appro >= $${params.length}`); }
  if (date_to) { params.push(date_to); conditions.push(`s.date_appro <= $${params.length}`); }
  if (ingredient) { params.push(`%${ingredient}%`); conditions.push(`i.nom ILIKE $${params.length}`); }

  const whereExtra = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

  const { rows } = await pool.query(
    `${CLIENT_SCOPE_CTE}
     SELECT i.nom AS ingredient, s.quantite, s.date_appro, s.prix_unitaire,
            COALESCE(a.nom, l.nom, 'Global') AS source
     FROM (
       SELECT sed.ingredient_id, sed.quantite, sed.date_appro, sed.prix_unitaire,
              sed.activite_id, NULL::int AS labo_id
       FROM stock_entreprise_daily sed
       WHERE sed.activite_id IN (SELECT id FROM client_activites)
       UNION ALL
       SELECT sld.ingredient_id, sld.quantite, sld.date_appro, sld.prix_unitaire,
              NULL::int AS activite_id, sld.labo_id
       FROM stock_labo_daily sld
       WHERE sld.labo_id IN (SELECT id FROM client_labos)
       UNION ALL
       SELECT scd.ingredient_id, scd.quantite, scd.date_appro, scd.prix_unitaire,
              NULL::int AS activite_id, NULL::int AS labo_id
       FROM stock_client_daily scd
       WHERE scd.client_id = $1
     ) s
     JOIN articles i ON i.id = s.ingredient_id
     LEFT JOIN activites a ON a.id = s.activite_id
     LEFT JOIN labos l ON l.id = s.labo_id
     WHERE 1=1 ${whereExtra}
     ORDER BY s.date_appro DESC
     LIMIT ${safeLimit}`,
    params
  );
  return rows;
}

async function toolGetAppros(clientId, { activite_id, labo_id, ingredient, date_from, date_to, limit = 50 }) {
  const safeLimit = Math.min(parseInt(limit) || 50, 500);
  const params = [clientId];
  const conditions = [];

  if (activite_id) { params.push(activite_id); conditions.push(`s.activite_id = $${params.length}`); }
  if (labo_id && !activite_id) { params.push(labo_id); conditions.push(`s.labo_id = $${params.length}`); }
  if (date_from) { params.push(date_from); conditions.push(`s.date_appro >= $${params.length}`); }
  if (date_to) { params.push(date_to); conditions.push(`s.date_appro <= $${params.length}`); }
  if (ingredient) { params.push(`%${ingredient}%`); conditions.push(`i.nom ILIKE $${params.length}`); }

  const whereExtra = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

  const { rows } = await pool.query(
    `${CLIENT_SCOPE_CTE}
     SELECT i.nom AS ingredient, s.quantite, s.date_appro, s.prix_unitaire,
            COALESCE(a.nom, l.nom, 'Global') AS source
     FROM (
       SELECT sed.ingredient_id, sed.quantite, sed.date_appro, sed.prix_unitaire,
              sed.activite_id, NULL::int AS labo_id
       FROM stock_entreprise_daily sed
       WHERE sed.activite_id IN (SELECT id FROM client_activites)
         AND sed.prix_unitaire IS NOT NULL
       UNION ALL
       SELECT sld.ingredient_id, sld.quantite, sld.date_appro, sld.prix_unitaire,
              NULL::int AS activite_id, sld.labo_id
       FROM stock_labo_daily sld
       WHERE sld.labo_id IN (SELECT id FROM client_labos)
         AND sld.prix_unitaire IS NOT NULL
     ) s
     JOIN articles i ON i.id = s.ingredient_id
     LEFT JOIN activites a ON a.id = s.activite_id
     LEFT JOIN labos l ON l.id = s.labo_id
     WHERE 1=1 ${whereExtra}
     ORDER BY s.date_appro DESC
     LIMIT ${safeLimit}`,
    params
  );
  return rows;
}

async function toolGetPertes(clientId, { activite_id, labo_id, ingredient, date_from, date_to, limit = 100 }) {
  const safeLimit = Math.min(parseInt(limit) || 100, 1000);
  const params = [clientId];
  const conditions = [];

  if (activite_id) { params.push(activite_id); conditions.push(`p.activite_id = $${params.length}`); }
  if (labo_id && !activite_id) { params.push(labo_id); conditions.push(`p.labo_id = $${params.length}`); }
  if (date_from) { params.push(date_from); conditions.push(`p.date_perte >= $${params.length}`); }
  if (date_to) { params.push(date_to); conditions.push(`p.date_perte <= $${params.length}`); }
  if (ingredient) { params.push(`%${ingredient}%`); conditions.push(`i.nom ILIKE $${params.length}`); }

  const whereExtra = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

  const { rows } = await pool.query(
    `${CLIENT_SCOPE_CTE}
     SELECT i.nom AS ingredient, p.quantite, p.type_perte, p.date_perte,
            COALESCE(a.nom, l.nom, 'Global') AS source
     FROM (
       SELECT pt.ingredient_id, pt.quantite, pt.type_perte, pt.date_perte,
              pt.activite_id, NULL::int AS labo_id
       FROM pertes pt
       WHERE pt.activite_id IN (SELECT id FROM client_activites)
         AND pt.ingredient_id IS NOT NULL
       UNION ALL
       SELECT lp.ingredient_id, lp.quantite, lp.type_perte, lp.date_perte,
              NULL::int AS activite_id, lp.labo_id
       FROM labo_pertes lp
       WHERE lp.labo_id IN (SELECT id FROM client_labos)
         AND lp.ingredient_id IS NOT NULL
       UNION ALL
       SELECT cp.ingredient_id, cp.quantite, cp.type_perte, cp.date_perte,
              NULL::int AS activite_id, NULL::int AS labo_id
       FROM client_pertes cp
       WHERE cp.client_id = $1
     ) p
     JOIN articles i ON i.id = p.ingredient_id
     LEFT JOIN activites a ON a.id = p.activite_id
     LEFT JOIN labos l ON l.id = p.labo_id
     WHERE 1=1 ${whereExtra}
     ORDER BY p.date_perte DESC
     LIMIT ${safeLimit}`,
    params
  );
  return rows;
}

async function toolGetInventaires(clientId, { activite_id, labo_id, ingredient, date_from, date_to, limit = 50 }) {
  const safeLimit = Math.min(parseInt(limit) || 50, 500);
  const params = [clientId];
  const conditions = [];

  if (activite_id) {
    params.push(activite_id);
    conditions.push(`inv.activite_id = $${params.length}`);
  } else if (labo_id) {
    params.push(labo_id);
    conditions.push(`inv.labo_id = $${params.length}`);
  } else {
    conditions.push(
      `(inv.client_id = $1 OR inv.activite_id IN (SELECT id FROM client_activites) OR inv.labo_id IN (SELECT id FROM client_labos))`
    );
  }

  if (date_from) { params.push(date_from); conditions.push(`inv.date_inventaire >= $${params.length}`); }
  if (date_to) { params.push(date_to); conditions.push(`inv.date_inventaire <= $${params.length}`); }
  if (ingredient) { params.push(`%${ingredient}%`); conditions.push(`i.nom ILIKE $${params.length}`); }

  const { rows } = await pool.query(
    `${CLIENT_SCOPE_CTE}
     SELECT i.nom AS ingredient, inv.quantite_reelle, inv.date_inventaire,
            COALESCE(a.nom, l.nom, 'Global') AS source
     FROM inventaires inv
     JOIN articles i ON i.id = inv.ingredient_id
     LEFT JOIN activites a ON a.id = inv.activite_id
     LEFT JOIN labos l ON l.id = inv.labo_id
     WHERE inv.ingredient_id IS NOT NULL
       AND ${conditions.join(' AND ')}
     ORDER BY inv.date_inventaire DESC
     LIMIT ${safeLimit}`,
    params
  );
  return rows;
}

async function toolGetTransferts(clientId, { activite_id, labo_id, ingredient, date_from, date_to, limit = 50 }) {
  const safeLimit = Math.min(parseInt(limit) || 50, 500);
  const params = [clientId];
  const conditions = [];

  if (activite_id) { params.push(activite_id); conditions.push(`lt.activite_id = $${params.length}`); }
  if (labo_id) { params.push(labo_id); conditions.push(`lt.labo_id = $${params.length}`); }
  if (date_from) { params.push(date_from); conditions.push(`lt.date_transfert >= $${params.length}`); }
  if (date_to) { params.push(date_to); conditions.push(`lt.date_transfert <= $${params.length}`); }
  if (ingredient) { params.push(`%${ingredient}%`); conditions.push(`i.nom ILIKE $${params.length}`); }

  const whereExtra = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

  const { rows } = await pool.query(
    `${CLIENT_SCOPE_CTE}
     SELECT i.nom AS ingredient, lt.quantite, lt.date_transfert,
            a.nom AS activite, l.nom AS labo
     FROM labo_transfers lt
     JOIN articles i ON i.id = lt.ingredient_id
     LEFT JOIN activites a ON a.id = lt.activite_id
     LEFT JOIN labos l ON l.id = lt.labo_id
     WHERE lt.activite_id IN (SELECT id FROM client_activites)
       AND lt.ingredient_id IS NOT NULL
       ${whereExtra}
     ORDER BY lt.date_transfert DESC
     LIMIT ${safeLimit}`,
    params
  );
  return rows;
}

async function executeToolCall(clientId, toolName, toolInput) {
  try {
    switch (toolName) {
      case 'get_client_info':    return await toolGetClientInfo(clientId);
      case 'get_stock':          return await toolGetStock(clientId, toolInput);
      case 'get_appros':         return await toolGetAppros(clientId, toolInput);
      case 'get_pertes':         return await toolGetPertes(clientId, toolInput);
      case 'get_inventaires':    return await toolGetInventaires(clientId, toolInput);
      case 'get_transferts':     return await toolGetTransferts(clientId, toolInput);
      case 'ask_clarification':  return { __clarification: true, question: toolInput.question, options: toolInput.options };
      default:                   return { error: `Outil inconnu: ${toolName}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// ── Conversation persistence ──────────────────────────────────────────────────

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

// ── System prompt ─────────────────────────────────────────────────────────────

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
- Pour un rapport ou une liste longue, utilise des sections avec titre en gras

## Utilisation des outils — règles STRICTES
1. TOUJOURS commencer par \`get_client_info\` pour connaître les activités/labos du client
2. Si le client a plusieurs activités et ne précise pas laquelle : utilise \`ask_clarification\` AVANT d'appeler les données, en proposant les options
3. Si le client dit "toutes" ou n'a qu'une seule activité : procède directement
4. Pour les périodes ("mois actuel", "année dernière", "mois de mars") : convertis en dates ISO 8601
5. Pour une demande de rapport annuel : utilise date_from + date_to sur l'année concernée avec limit élevé (500)

## Format de réponse obligatoire
Commence TOUJOURS par [CONF:0.XX] (niveau de confiance 0.00-1.00 selon la complétude des données retournées).

## Alertes proactives
- Si stock < 5 unités pour un ingrédient → signaler avec ⚠️
- Si pertes élevées détectées → signaler avec 📉`;
}

// ── Confidence parsing ────────────────────────────────────────────────────────

function parseConfidence(rawMessage) {
  const match = rawMessage.match(/^\[CONF:(0\.\d{1,2})\]\s*/);
  if (match) {
    return { confidence: parseFloat(match[1]), message: rawMessage.slice(match[0].length).trim() };
  }
  return { confidence: null, message: rawMessage };
}

// ── Main chat function ────────────────────────────────────────────────────────

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
        tools: TOOLS,
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

module.exports = { chatWithClaude };
