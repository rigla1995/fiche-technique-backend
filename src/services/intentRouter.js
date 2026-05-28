const pool = require('../config/database');

// ── Context cache (in-memory, TTL 1h) ────────────────────────────────────────

const CONTEXT_TTL_MS = 60 * 60 * 1000; // 1 hour

async function generateClientContext(clientId) {
  const [activitesRes, labosRes, fournisseursRes, venteRes] = await Promise.all([
    pool.query(
      `SELECT a.id, a.nom
       FROM activites a
       JOIN profil_entreprise pe ON pe.id = a.entreprise_id
       WHERE pe.client_id = $1
       ORDER BY a.nom`,
      [clientId]
    ),
    pool.query(
      `SELECT l.id, l.nom
       FROM labos l
       JOIN profil_entreprise pe ON pe.id = l.entreprise_id
       WHERE pe.client_id = $1
       ORDER BY l.nom`,
      [clientId]
    ),
    pool.query(
      `SELECT DISTINCT f.id, f.nom
       FROM fournisseurs f
       JOIN profil_entreprise pe ON pe.id = f.entreprise_id
       WHERE pe.client_id = $1
       ORDER BY f.nom`,
      [clientId]
    ),
    pool.query(
      `SELECT module_vente_actif FROM abonnements WHERE client_id = $1 LIMIT 1`,
      [clientId]
    ),
  ]);

  const moduleVente = venteRes.rows[0]?.module_vente_actif ?? false;

  const context = {
    activites: activitesRes.rows,
    labos: labosRes.rows,
    fournisseurs: fournisseursRes.rows,
    features: [
      'stock', 'appros', 'pertes', 'transferts', 'inventaires', 'rapports',
      ...(moduleVente ? ['ventes', 'factures'] : []),
    ],
  };

  await pool.query(
    `UPDATE ai_assistant_config
     SET context_json = $1, context_updated_at = NOW()
     WHERE client_id = $2`,
    [JSON.stringify(context), clientId]
  );

  return context;
}

async function getClientContext(clientId) {
  const { rows } = await pool.query(
    `SELECT context_json, context_updated_at FROM ai_assistant_config WHERE client_id = $1`,
    [clientId]
  );
  const row = rows[0];
  if (row?.context_json && row.context_updated_at) {
    const age = Date.now() - new Date(row.context_updated_at).getTime();
    if (age < CONTEXT_TTL_MS) return row.context_json;
  }
  return generateClientContext(clientId);
}

// ── Intent detection ──────────────────────────────────────────────────────────

const INTENTS = [
  {
    name: 'ventes',
    keywords: ['vente', 'ventes', 'ca', 'chiffre affaire', 'ticket', 'commande client',
               'baya3', 'mbi3', 'mabia3'],
  },
  {
    name: 'transferts',
    keywords: ['transfert', 'transfer', 'labo vers', 'envoi labo', 'sortie labo',
               'transafert', 'nahel', 'nahhal'],
  },
  {
    name: 'pertes',
    keywords: ['perte', 'pertes', 'gaspillage', 'jeté', 'avarie', 'déchet',
               'khasara', 'khsara'],
  },
  {
    name: 'appros',
    keywords: ['appro', 'approvisionnement', 'achat', 'commande', 'fournisseur',
               'livraison', 'facture', 'achats', 'appros',
               'chri', 'twassal', 'twassalt'],
  },
  {
    name: 'stock',
    keywords: ['stock', 'niveau', 'disponible', 'reste', 'quantité', 'inventaire',
               'existant', 'réserve',
               'stouk', 'qaddech baqy', 'baqy'],
  },
  {
    name: 'activites',
    keywords: ['activité', 'activités', 'labo', 'mon entreprise', 'mes structures',
               'structure', 'branches', 'activite'],
  },
];

function detectIntent(message) {
  const lower = message.toLowerCase();
  for (const intent of INTENTS) {
    if (intent.keywords.some(kw => lower.includes(kw))) return intent.name;
  }
  return 'general';
}

// ── Parameter extraction ──────────────────────────────────────────────────────

const MONTH_NAMES = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
};

function pad(n) { return String(n).padStart(2, '0'); }

function extractDateRange(message) {
  const lower = message.toLowerCase();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based

  if (/mois actuel|ce mois|mois en cours/.test(lower)) {
    return { date_from: `${y}-${pad(m + 1)}-01`, date_to: `${y}-${pad(m + 1)}-${new Date(y, m + 1, 0).getDate()}` };
  }
  if (/mois dernier|mois précédent|mois passé/.test(lower)) {
    const pm = m === 0 ? 11 : m - 1;
    const py = m === 0 ? y - 1 : y;
    return { date_from: `${py}-${pad(pm + 1)}-01`, date_to: `${py}-${pad(pm + 1)}-${new Date(py, pm + 1, 0).getDate()}` };
  }
  if (/année dernière|l'an dernier|année passée|an dernier/.test(lower)) {
    return { date_from: `${y - 1}-01-01`, date_to: `${y - 1}-12-31` };
  }
  if (/cette année|année actuelle|année en cours/.test(lower)) {
    return { date_from: `${y}-01-01`, date_to: `${y}-12-31` };
  }
  if (/semaine|7 jours|cette semaine/.test(lower)) {
    const from = new Date(now); from.setDate(now.getDate() - 7);
    return { date_from: from.toISOString().slice(0, 10), date_to: now.toISOString().slice(0, 10) };
  }
  if (/30 jours|dernier mois|30 derniers/.test(lower)) {
    const from = new Date(now); from.setDate(now.getDate() - 30);
    return { date_from: from.toISOString().slice(0, 10), date_to: now.toISOString().slice(0, 10) };
  }

  // Named month: "janvier 2025" or just "janvier"
  for (const [name, idx] of Object.entries(MONTH_NAMES)) {
    const re = new RegExp(`${name}\\s*(\\d{4})?`, 'i');
    const mm = lower.match(re);
    if (mm) {
      const my = mm[1] ? parseInt(mm[1]) : y;
      const lastDay = new Date(my, idx, 0).getDate();
      return { date_from: `${my}-${pad(idx)}-01`, date_to: `${my}-${pad(idx)}-${lastDay}` };
    }
  }

  // Explicit range "du 01/01 au 31/03"
  const rangeMatch = lower.match(/du\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?\s*au\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?/);
  if (rangeMatch) {
    const fy = rangeMatch[3] ? parseInt(rangeMatch[3]) : y;
    const ty = rangeMatch[6] ? parseInt(rangeMatch[6]) : y;
    return {
      date_from: `${fy}-${pad(parseInt(rangeMatch[2]))}-${pad(parseInt(rangeMatch[1]))}`,
      date_to: `${ty}-${pad(parseInt(rangeMatch[5]))}-${pad(parseInt(rangeMatch[4]))}`,
    };
  }

  // Default: current month
  return { date_from: `${y}-${pad(m + 1)}-01`, date_to: now.toISOString().slice(0, 10) };
}

function extractEntityRefs(message, context) {
  const lower = message.toLowerCase();

  const activiteId = context.activites.find(a => lower.includes(a.nom.toLowerCase()))?.id ?? null;
  const laboId = context.labos.find(l => lower.includes(l.nom.toLowerCase()))?.id ?? null;
  const fournisseurId = context.fournisseurs.find(f => lower.includes(f.nom.toLowerCase()))?.id ?? null;

  return { activiteId, laboId, fournisseurId };
}

function needsClarification(intent, refs, context) {
  const { activiteId, laboId } = refs;

  if (intent === 'ventes' || intent === 'appros' || intent === 'pertes' || intent === 'stock') {
    if (activiteId === null && context.activites.length > 1) {
      // Check "toutes" keyword
      return !/toutes|tout|tous|ensemble|global/.test(context._message ?? '');
    }
  }
  if (intent === 'transferts') {
    if (laboId === null && context.labos.length > 1) return true;
    if (laboId === null && context.labos.length === 0) return false;
  }
  return false;
}

function buildClarificationMessage(intent, context) {
  const labels = {
    appros: 'les approvisionnements',
    pertes: 'les pertes',
    stock: 'le stock',
    ventes: 'les ventes',
    transferts: 'les transferts',
  };
  const label = labels[intent] || 'les données';

  if (intent === 'transferts' && context.labos.length > 1) {
    return `Pour quel labo souhaitez-vous voir ${label} ?\n\n` +
      context.labos.map((l, i) => `${i + 1}. ${l.nom}`).join('\n') +
      '\n\nOu répondez "tous" pour tous les labos.';
  }

  return `Pour quelle activité souhaitez-vous voir ${label} ?\n\n` +
    context.activites.map((a, i) => `${i + 1}. ${a.nom}`).join('\n') +
    '\n\nOu répondez "toutes" pour toutes les activités.';
}

// ── Data fetchers (direct DB queries) ────────────────────────────────────────

async function fetchAppros(clientId, refs, dates, limit = 50) {
  const { activiteId } = refs;
  const { date_from, date_to } = dates;

  const activiteIds = activiteId
    ? [activiteId]
    : (await pool.query(
        `SELECT a.id FROM activites a JOIN profil_entreprise pe ON pe.id = a.entreprise_id WHERE pe.client_id = $1`,
        [clientId]
      )).rows.map(r => r.id);

  if (!activiteIds.length) return [];

  const { rows } = await pool.query(
    `SELECT
       sed.date_appro                             AS date,
       art.nom                                    AS article,
       sed.quantite,
       u.symbole                                  AS unite,
       sed.prix_unitaire,
       ROUND((sed.quantite * COALESCE(sed.prix_unitaire,0))::numeric, 3) AS total,
       f.nom                                      AS fournisseur,
       a.nom                                      AS activite,
       sed.ref_facture
     FROM stock_entreprise_daily sed
     JOIN articles art ON art.id = sed.ingredient_id
     LEFT JOIN unites u ON u.id = art.unite_id
     LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
     JOIN activites a ON a.id = sed.activite_id
     WHERE sed.activite_id = ANY($1)
       AND sed.date_appro BETWEEN $2 AND $3
     ORDER BY sed.date_appro DESC
     LIMIT $4`,
    [activiteIds, date_from, date_to, limit]
  );
  return rows;
}

async function fetchPertes(clientId, refs, dates, limit = 50) {
  const { activiteId, laboId } = refs;
  const { date_from, date_to } = dates;
  const results = [];

  // Activité pertes
  if (!laboId) {
    const activiteIds = activiteId
      ? [activiteId]
      : (await pool.query(
          `SELECT a.id FROM activites a JOIN profil_entreprise pe ON pe.id = a.entreprise_id WHERE pe.client_id = $1`,
          [clientId]
        )).rows.map(r => r.id);

    if (activiteIds.length) {
      const { rows } = await pool.query(
        `SELECT
           p.date_perte   AS date,
           art.nom        AS article,
           p.quantite,
           u.symbole      AS unite,
           p.type_perte,
           a.nom          AS activite
         FROM pertes p
         JOIN articles art ON art.id = p.ingredient_id
         LEFT JOIN unites u ON u.id = art.unite_id
         JOIN activites a ON a.id = p.activite_id
         WHERE p.activite_id = ANY($1)
           AND p.date_perte BETWEEN $2 AND $3
         ORDER BY p.date_perte DESC
         LIMIT $4`,
        [activiteIds, date_from, date_to, limit]
      );
      results.push(...rows);
    }
  }

  // Labo pertes
  if (laboId || !activiteId) {
    const laboIds = laboId
      ? [laboId]
      : (await pool.query(
          `SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE pe.client_id = $1`,
          [clientId]
        )).rows.map(r => r.id);

    if (laboIds.length) {
      const { rows } = await pool.query(
        `SELECT
           lp.date_perte AS date,
           art.nom       AS article,
           lp.quantite,
           u.symbole     AS unite,
           lp.type_perte,
           l.nom         AS activite
         FROM labo_pertes lp
         JOIN articles art ON art.id = lp.ingredient_id
         LEFT JOIN unites u ON u.id = art.unite_id
         JOIN labos l ON l.id = lp.labo_id
         WHERE lp.labo_id = ANY($1)
           AND lp.date_perte BETWEEN $2 AND $3
         ORDER BY lp.date_perte DESC
         LIMIT $4`,
        [laboIds, date_from, date_to, limit]
      );
      results.push(...rows);
    }
  }

  return results;
}

async function fetchTransferts(clientId, refs, dates, limit = 50) {
  const { laboId } = refs;
  const { date_from, date_to } = dates;

  const laboIds = laboId
    ? [laboId]
    : (await pool.query(
        `SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE pe.client_id = $1`,
        [clientId]
      )).rows.map(r => r.id);

  if (!laboIds.length) return [];

  const { rows } = await pool.query(
    `SELECT
       lt.date_transfert          AS date,
       art.nom                    AS article,
       lt.quantite,
       u.symbole                  AS unite,
       l.nom                      AS labo,
       a.nom                      AS activite_destination
     FROM labo_transfers lt
     JOIN articles art ON art.id = lt.ingredient_id
     LEFT JOIN unites u ON u.id = art.unite_id
     JOIN labos l ON l.id = lt.labo_id
     JOIN activites a ON a.id = lt.activite_id
     WHERE lt.labo_id = ANY($1)
       AND lt.date_transfert BETWEEN $2 AND $3
     ORDER BY lt.date_transfert DESC
     LIMIT $4`,
    [laboIds, date_from, date_to, limit]
  );
  return rows;
}

async function fetchStock(clientId, refs) {
  const { activiteId, laboId } = refs;
  const results = [];

  if (!laboId) {
    const activiteIds = activiteId
      ? [activiteId]
      : (await pool.query(
          `SELECT a.id FROM activites a JOIN profil_entreprise pe ON pe.id = a.entreprise_id WHERE pe.client_id = $1`,
          [clientId]
        )).rows.map(r => r.id);

    if (activiteIds.length) {
      const { rows } = await pool.query(
        `SELECT
           art.nom     AS article,
           u.symbole   AS unite,
           SUM(sed.quantite) AS quantite_totale,
           a.nom       AS activite,
           MAX(sed.date_appro) AS derniere_entree
         FROM stock_entreprise_daily sed
         JOIN articles art ON art.id = sed.ingredient_id
         LEFT JOIN unites u ON u.id = art.unite_id
         JOIN activites a ON a.id = sed.activite_id
         WHERE sed.activite_id = ANY($1)
           AND sed.date_appro >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months'
         GROUP BY art.nom, u.symbole, a.nom
         ORDER BY quantite_totale DESC
         LIMIT 30`,
        [activiteIds]
      );
      results.push(...rows);
    }
  }

  if (laboId) {
    const { rows } = await pool.query(
      `SELECT
         art.nom     AS article,
         u.symbole   AS unite,
         SUM(sld.quantite) AS quantite_totale,
         l.nom       AS activite,
         MAX(sld.date_appro) AS derniere_entree
       FROM stock_labo_daily sld
       JOIN articles art ON art.id = sld.ingredient_id
       LEFT JOIN unites u ON u.id = art.unite_id
       JOIN labos l ON l.id = sld.labo_id
       WHERE sld.labo_id = $1
         AND sld.date_appro >= date_trunc('month', CURRENT_DATE) - INTERVAL '3 months'
       GROUP BY art.nom, u.symbole, l.nom
       ORDER BY quantite_totale DESC
       LIMIT 30`,
      [laboId]
    );
    results.push(...rows);
  }

  return results;
}

async function fetchVentes(clientId, refs, dates, limit = 50) {
  const { activiteId } = refs;
  const { date_from, date_to } = dates;

  const activiteIds = activiteId
    ? [activiteId]
    : (await pool.query(
        `SELECT a.id FROM activites a JOIN profil_entreprise pe ON pe.id = a.entreprise_id WHERE pe.client_id = $1`,
        [clientId]
      )).rows.map(r => r.id);

  if (!activiteIds.length) return [];

  const { rows } = await pool.query(
    `SELECT
       v.date_vente                              AS date,
       a.nom                                     AS activite,
       v.type_vente,
       SUM(vl.quantite * vl.prix_unitaire)       AS total_ttc,
       COUNT(DISTINCT v.id)                      AS nb_tickets
     FROM ventes v
     JOIN vente_lignes vl ON vl.vente_id = v.id
     JOIN activites a ON a.id = v.activite_id
     WHERE v.activite_id = ANY($1)
       AND v.date_vente BETWEEN $2 AND $3
       AND v.statut = 'confirmee'
     GROUP BY v.date_vente, a.nom, v.type_vente
     ORDER BY v.date_vente DESC
     LIMIT $4`,
    [activiteIds, date_from, date_to, limit]
  );
  return rows;
}

// ── Main router ───────────────────────────────────────────────────────────────

async function routeMessage(clientId, message) {
  const context = await getClientContext(clientId);
  context._message = message.toLowerCase();

  const intent = detectIntent(message);

  if (intent === 'activites') {
    return {
      intent,
      data: { activites: context.activites, labos: context.labos },
      clarification: null,
      context,
    };
  }

  if (intent === 'general') {
    return { intent, data: null, clarification: null, context };
  }

  const refs = extractEntityRefs(message, context);
  const dates = extractDateRange(message);

  if (needsClarification(intent, refs, context)) {
    return {
      intent,
      data: null,
      clarification: buildClarificationMessage(intent, context),
      context,
    };
  }

  let data = null;
  if (intent === 'appros')    data = await fetchAppros(clientId, refs, dates);
  if (intent === 'pertes')    data = await fetchPertes(clientId, refs, dates);
  if (intent === 'transferts') data = await fetchTransferts(clientId, refs, dates);
  if (intent === 'stock')     data = await fetchStock(clientId, refs);
  if (intent === 'ventes')    data = await fetchVentes(clientId, refs, dates);

  return { intent, data, dates, refs, clarification: null, context };
}

module.exports = { routeMessage, generateClientContext, getClientContext };
