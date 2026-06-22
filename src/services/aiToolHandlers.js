const pool = require('../config/database');
const { generateAndSendReport } = require('./reportService');

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

// ── Base de connaissances LabFlow (RAG simple, recherche par mots-clés) ────────
const normalizeKb = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
async function toolSearchKnowledge(toolInput) {
  const query = (toolInput?.query || '').trim();
  const { rows } = await pool.query('SELECT titre, contenu, mots_cles FROM ai_knowledge_base WHERE actif = true');
  if (rows.length === 0) return { results: [], note: 'Base de connaissances vide.' };
  const terms = normalizeKb(query).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const scored = rows.map((r) => {
    const titreN = normalizeKb(r.titre);
    const hay = normalizeKb(`${r.titre} ${r.mots_cles || ''} ${r.contenu}`);
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += 1;
      if (titreN.includes(t)) score += 2; // boost si le terme est dans le titre
    }
    return { titre: r.titre, contenu: r.contenu, score };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
  if (scored.length === 0) {
    return { results: [], disponibles: rows.map((r) => r.titre).slice(0, 25) };
  }
  return { results: scored.map(({ titre, contenu }) => ({ titre, contenu })) };
}

// ── Référentiel articles (ingrédients : nom, prix de référence, unité) ─────────
async function toolGetReferentiel(clientId, { search, limit = 100 } = {}) {
  const safeLimit = Math.min(parseInt(limit) || 100, 300);
  const params = [clientId];
  let extra = '';
  if (search) { params.push(`%${search}%`); extra = `AND i.nom ILIKE $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT i.nom, i.prix, u.nom AS unite
     FROM articles i
     LEFT JOIN unites u ON u.id = i.unite_id
     WHERE i.client_id = $1 ${extra}
     ORDER BY i.nom
     LIMIT ${safeLimit}`,
    params
  );
  return rows;
}

// ── Fournisseurs de l'entreprise ──────────────────────────────────────────────
async function toolGetFournisseurs(clientId, { search } = {}) {
  const params = [clientId];
  let extra = '';
  if (search) { params.push(`%${search}%`); extra = `AND f.nom ILIKE $${params.length}`; }
  const { rows } = await pool.query(
    `WITH pe AS (SELECT id FROM profil_entreprise WHERE client_id = $1)
     SELECT f.nom, f.adresse, f.telephone
     FROM fournisseurs f
     WHERE f.entreprise_id IN (SELECT id FROM pe) ${extra}
     ORDER BY f.nom
     LIMIT 200`,
    params
  );
  return rows;
}

// ── Abonnement & capacité souscrite ───────────────────────────────────────────
async function toolGetAbonnement(clientId) {
  const { rows } = await pool.query(
    `SELECT a.mode_compte, a.contrat_accepte_le,
            ac.nb_activites, ac.nb_labos, ac.nb_gerants, ac.montant_onboarding
     FROM abonnements a
     LEFT JOIN abonnement_config ac ON ac.abonnement_id = a.id
     WHERE a.client_id = $1
     ORDER BY a.id DESC
     LIMIT 1`,
    [clientId]
  );
  return rows[0] || { note: 'Aucun abonnement trouvé.' };
}

// ── Ventes : CA, coût matière, food cost, panier moyen, canaux ────────────────
async function toolGetVentes(clientId, { activite_id, date_from, date_to, canal } = {}) {
  const params = [clientId];
  const cond = [`v.activite_id IN (SELECT id FROM client_activites)`, `v.statut = 'confirmee'`];
  if (activite_id) { params.push(activite_id); cond.push(`v.activite_id = $${params.length}`); }
  if (date_from) { params.push(date_from); cond.push(`v.date_vente >= $${params.length}`); }
  if (date_to) { params.push(date_to); cond.push(`v.date_vente <= $${params.length}`); }
  if (canal === 'directe' || canal === 'prestataire') { params.push(canal); cond.push(`v.type_vente = $${params.length}`); }
  const where = cond.join(' AND ');

  const totRes = await pool.query(
    `${CLIENT_SCOPE_CTE}
     SELECT COUNT(DISTINCT v.id) AS nb_ventes,
            COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) AS ca_ttc,
            COALESCE(SUM(vl.quantite * COALESCE(vl.cout_unitaire, 0)), 0) AS cout_matiere
     FROM ventes v JOIN vente_lignes vl ON vl.vente_id = v.id
     WHERE ${where}`,
    params
  );
  const canalRes = await pool.query(
    `${CLIENT_SCOPE_CTE}
     SELECT CASE WHEN v.type_vente = 'directe' THEN 'Direct' ELSE COALESCE(pl.nom, 'Prestataire') END AS canal,
            COUNT(DISTINCT v.id) AS nb_ventes,
            COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) AS ca_ttc
     FROM ventes v JOIN vente_lignes vl ON vl.vente_id = v.id
     LEFT JOIN prestataires_livraison pl ON pl.id = v.prestataire_id
     WHERE ${where}
     GROUP BY 1 ORDER BY ca_ttc DESC`,
    params
  );
  const t = totRes.rows[0] || {};
  const ca = parseFloat(t.ca_ttc) || 0;
  const cm = parseFloat(t.cout_matiere) || 0;
  const nb = parseInt(t.nb_ventes) || 0;
  return {
    nb_ventes: nb,
    ca_ttc: Math.round(ca * 1000) / 1000,
    cout_matiere: Math.round(cm * 1000) / 1000,
    food_cost_pct: ca > 0 ? Math.round((cm / ca) * 1000) / 10 : null,
    marge_brute: Math.round((ca - cm) * 1000) / 1000,
    panier_moyen: nb > 0 ? Math.round((ca / nb) * 1000) / 1000 : null,
    par_canal: canalRes.rows,
  };
}

// ── Produits / fiches techniques du client ────────────────────────────────────
async function toolGetProduits(clientId, { search, limit = 100 } = {}) {
  const safeLimit = Math.min(parseInt(limit) || 100, 300);
  const params = [clientId];
  let extra = '';
  if (search) { params.push(`%${search}%`); extra = `AND p.nom ILIKE $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT p.nom, p.description
     FROM produits p
     WHERE p.client_id = $1 ${extra}
     ORDER BY p.nom
     LIMIT ${safeLimit}`,
    params
  );
  return rows;
}

// ── Configuration de vente : prestataires, charges fixes, articles vendables ──
async function toolGetConfigVente(clientId, { activite_id } = {}) {
  const presta = await pool.query(
    `WITH pe AS (SELECT id FROM profil_entreprise WHERE client_id = $1)
     SELECT pl.nom, pl.commission_pct
     FROM entreprise_prestataires ep
     JOIN prestataires_livraison pl ON pl.id = ep.prestataire_id
     WHERE ep.entreprise_id IN (SELECT id FROM pe) AND pl.actif = true
     ORDER BY pl.nom`,
    [clientId]
  );

  const chParams = [clientId];
  let chExtra = '';
  if (activite_id) { chParams.push(activite_id); chExtra = `AND cf.activite_id = $${chParams.length}`; }
  const charges = await pool.query(
    `${CLIENT_SCOPE_CTE}
     SELECT a.nom AS activite, cf.mode, cf.montant_global, cf.loyer,
            cf.charges_personnel, cf.electricite_gaz, cf.eau
     FROM charges_fixes cf
     JOIN activites a ON a.id = cf.activite_id
     WHERE cf.activite_id IN (SELECT id FROM client_activites) ${chExtra}
     ORDER BY a.nom`,
    chParams
  );

  const vParams = [clientId];
  let vExtra = '';
  if (activite_id) { vParams.push(activite_id); vExtra = `AND aav.activite_id = $${vParams.length}`; }
  const vendables = await pool.query(
    `${CLIENT_SCOPE_CTE}
     SELECT a.nom AS activite, aav.article_type,
            COALESCE(pr.nom, art.nom) AS article, aav.prix_vente, aav.actif
     FROM activite_articles_vendables aav
     JOIN activites a ON a.id = aav.activite_id
     LEFT JOIN produits pr ON aav.article_type = 'produit' AND pr.id = aav.article_id
     LEFT JOIN articles art ON aav.article_type = 'ingredient' AND art.id = aav.article_id
     WHERE aav.activite_id IN (SELECT id FROM client_activites) ${vExtra}
     ORDER BY a.nom, article
     LIMIT 300`,
    vParams
  );

  return {
    prestataires_livraison: presta.rows,
    charges_fixes: charges.rows,
    articles_vendables: vendables.rows,
  };
}

// ── Génération + envoi d'un rapport par email ─────────────────────────────────
async function toolSendReport(clientId, { format } = {}) {
  const { rows } = await pool.query(
    `SELECT COALESCE(aic.report_email, u.email) AS email, u.nom
     FROM utilisateurs u
     LEFT JOIN ai_assistant_config aic ON aic.client_id = u.id
     WHERE u.id = $1`,
    [clientId]
  );
  const dest = rows[0] || {};
  if (!dest.email) return { error: "Aucun email configuré pour l'envoi du rapport." };
  const fmt = format === 'pdf' ? 'pdf' : 'excel';
  const filename = await generateAndSendReport(clientId, dest.email, dest.nom || 'Client', fmt);
  return { sent: true, email: dest.email, format: fmt, filename };
}

async function executeToolCall(clientId, toolName, toolInput) {
  try {
    switch (toolName) {
      case 'get_client_info':      return await toolGetClientInfo(clientId);
      case 'get_stock':            return await toolGetStock(clientId, toolInput);
      case 'get_appros':           return await toolGetAppros(clientId, toolInput);
      case 'get_pertes':           return await toolGetPertes(clientId, toolInput);
      case 'get_inventaires':      return await toolGetInventaires(clientId, toolInput);
      case 'get_transferts':       return await toolGetTransferts(clientId, toolInput);
      case 'get_referentiel':      return await toolGetReferentiel(clientId, toolInput);
      case 'get_fournisseurs':     return await toolGetFournisseurs(clientId, toolInput);
      case 'get_abonnement':       return await toolGetAbonnement(clientId);
      case 'get_ventes':           return await toolGetVentes(clientId, toolInput);
      case 'get_produits':         return await toolGetProduits(clientId, toolInput);
      case 'get_config_vente':     return await toolGetConfigVente(clientId, toolInput);
      case 'send_report':          return await toolSendReport(clientId, toolInput);
      case 'search_knowledge_base': return await toolSearchKnowledge(toolInput);
      case 'ask_clarification':    return { __clarification: true, question: toolInput.question, options: toolInput.options };
      default:                     return { error: `Outil inconnu: ${toolName}` };
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
    name: 'get_referentiel',
    description: 'Récupère le référentiel des articles/ingrédients du client : nom, prix de référence (TND), unité. Pour répondre aux questions sur le catalogue d\'articles.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Nom partiel d\'article (recherche ILIKE)' },
        limit: { type: 'integer', description: 'Max résultats (défaut 100, max 300)' },
      },
      required: [],
    },
  },
  {
    name: 'get_fournisseurs',
    description: 'Récupère la liste des fournisseurs de l\'entreprise (nom, adresse, téléphone).',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Nom partiel de fournisseur (recherche ILIKE)' },
      },
      required: [],
    },
  },
  {
    name: 'get_abonnement',
    description: 'Récupère l\'abonnement et la capacité souscrite du client : mode du compte, nombre d\'activités/labos/gérants, montant d\'onboarding, date d\'acceptation du contrat.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_ventes',
    description: 'Récupère un résumé des ventes : nombre de ventes, CA TTC (TND), coût matière, food cost %, marge brute, panier moyen, et répartition par canal (direct / prestataire). Filtrable par activité, période et canal.',
    input_schema: {
      type: 'object',
      properties: {
        activite_id: { type: 'integer', description: 'ID de l\'activité' },
        date_from: { type: 'string', description: 'Date de début ISO 8601' },
        date_to: { type: 'string', description: 'Date de fin ISO 8601' },
        canal: { type: 'string', enum: ['directe', 'prestataire'], description: 'Filtrer par canal de vente' },
      },
      required: [],
    },
  },
  {
    name: 'get_produits',
    description: 'Récupère la liste des produits / fiches techniques du client (nom, description).',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Nom partiel de produit (recherche ILIKE)' },
        limit: { type: 'integer', description: 'Max résultats (défaut 100, max 300)' },
      },
      required: [],
    },
  },
  {
    name: 'get_config_vente',
    description: 'Récupère la configuration de vente : prestataires de livraison actifs (avec commission %), charges fixes par activité, et articles vendables par activité (avec prix de vente). Filtrable par activité.',
    input_schema: {
      type: 'object',
      properties: {
        activite_id: { type: 'integer', description: 'ID de l\'activité' },
      },
      required: [],
    },
  },
  {
    name: 'send_report',
    description: "Génère et envoie par email un rapport (Excel ou PDF) récapitulant stock, pertes, inventaires et transferts du client. À utiliser quand le client demande explicitement un rapport, ou propose-le toi-même quand c'est pertinent (l'email de destination est celui configuré pour l'agent).",
    input_schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['excel', 'pdf'], description: 'Format du rapport (défaut excel)' },
      },
      required: [],
    },
  },
  {
    name: 'search_knowledge_base',
    description: "Recherche dans la base de connaissances métier LabFlow pour comprendre/expliquer un concept (fiche technique, food cost, coût matière, stock, approvisionnements, pertes, inventaire, transferts, articles valorisés, produits vendables/utilisables, seuil minimum, TVA, marge, panier moyen…). À utiliser DÈS QUE le client pose une question conceptuelle, demande une définition, un conseil ou une interprétation — AVANT de répondre.",
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Mots-clés ou question du concept à rechercher (ex: "fiche technique", "comment est calculé le food cost")' },
      },
      required: ['query'],
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
