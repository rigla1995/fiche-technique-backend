const pool = require('../config/database');

const CLIENT_SCOPE_CTE = `
  WITH pe AS (SELECT id FROM profil_entreprise WHERE client_id = $1),
  client_activites AS (SELECT id, nom FROM activites WHERE entreprise_id IN (SELECT id FROM pe)),
  client_labos AS (SELECT id, nom FROM labos WHERE entreprise_id IN (SELECT id FROM pe))
`;

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
      case 'get_client_info':   return await toolGetClientInfo(clientId);
      case 'get_stock':         return await toolGetStock(clientId, toolInput);
      case 'get_appros':        return await toolGetAppros(clientId, toolInput);
      case 'get_pertes':        return await toolGetPertes(clientId, toolInput);
      case 'get_inventaires':   return await toolGetInventaires(clientId, toolInput);
      case 'get_transferts':    return await toolGetTransferts(clientId, toolInput);
      case 'ask_clarification': return { __clarification: true, question: toolInput.question, options: toolInput.options };
      default:                  return { error: `Outil inconnu: ${toolName}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// Tool definitions in Anthropic format (for claudeService)
const TOOLS_ANTHROPIC = [
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
    description: 'Récupère l\'historique des approvisionnements (achats) avec quantités et prix unitaires en TND.',
    input_schema: {
      type: 'object',
      properties: {
        activite_id: { type: 'integer' },
        labo_id: { type: 'integer' },
        ingredient: { type: 'string' },
        date_from: { type: 'string', description: 'Date de début ISO 8601' },
        date_to: { type: 'string', description: 'Date de fin ISO 8601' },
        limit: { type: 'integer' },
      },
      required: [],
    },
  },
  {
    name: 'get_pertes',
    description: 'Récupère l\'historique des pertes d\'ingrédients.',
    input_schema: {
      type: 'object',
      properties: {
        activite_id: { type: 'integer' },
        labo_id: { type: 'integer' },
        ingredient: { type: 'string' },
        date_from: { type: 'string' },
        date_to: { type: 'string' },
        limit: { type: 'integer' },
      },
      required: [],
    },
  },
  {
    name: 'get_inventaires',
    description: 'Récupère l\'historique des inventaires.',
    input_schema: {
      type: 'object',
      properties: {
        activite_id: { type: 'integer' },
        labo_id: { type: 'integer' },
        ingredient: { type: 'string' },
        date_from: { type: 'string' },
        date_to: { type: 'string' },
        limit: { type: 'integer' },
      },
      required: [],
    },
  },
  {
    name: 'get_transferts',
    description: 'Récupère l\'historique des transferts labo → activité.',
    input_schema: {
      type: 'object',
      properties: {
        activite_id: { type: 'integer' },
        labo_id: { type: 'integer' },
        ingredient: { type: 'string' },
        date_from: { type: 'string' },
        date_to: { type: 'string' },
        limit: { type: 'integer' },
      },
      required: [],
    },
  },
  {
    name: 'ask_clarification',
    description: 'Envoie une question de clarification au client avant de requêter les données. OBLIGATOIRE si le client a plusieurs activités et n\'a pas précisé laquelle.',
    input_schema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Question à poser en français ou darija' },
        options: { type: 'array', items: { type: 'string' }, description: 'Options proposées' },
      },
      required: ['question'],
    },
  },
];

// Tool definitions in OpenAI format (for deepseekService / Groq)
const TOOLS_OPENAI = TOOLS_ANTHROPIC.map(t => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}));

module.exports = { executeToolCall, TOOLS_ANTHROPIC, TOOLS_OPENAI };
