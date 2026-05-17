const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../config/database');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Fetch client context: stock, losses, inventory snapshots, recent orders
async function fetchClientContext(clientId) {
  const [stockRows, pertesRows, inventaireRows, abonnementRow] = await Promise.all([
    pool.query(
      `SELECT i.nom AS ingredient, scd.quantite, scd.date
       FROM stock_client_daily scd
       JOIN ingredients i ON i.id = scd.ingredient_id
       WHERE scd.client_id = $1
       ORDER BY scd.date DESC
       LIMIT 100`,
      [clientId]
    ),
    pool.query(
      `SELECT i.nom AS ingredient, cp.quantite, cp.raison, cp.date_perte
       FROM client_pertes cp
       JOIN ingredients i ON i.id = cp.ingredient_id
       WHERE cp.client_id = $1
       ORDER BY cp.date_perte DESC
       LIMIT 50`,
      [clientId]
    ),
    pool.query(
      `SELECT i.nom AS ingredient, inv.quantite_reelle, inv.ecart, inv.created_at
       FROM inventaires inv
       JOIN ingredients i ON i.id = inv.ingredient_id
       WHERE inv.client_id = $1
       ORDER BY inv.created_at DESC
       LIMIT 50`,
      [clientId]
    ),
    pool.query(
      `SELECT u.nom, a.mode_compte, ac.nb_activites, ac.nb_labos
       FROM utilisateurs u
       LEFT JOIN abonnements a ON a.client_id = u.id
       LEFT JOIN abonnement_config ac ON ac.abonnement_id = a.id
       WHERE u.id = $1`,
      [clientId]
    ),
  ]);

  const clientInfo = abonnementRow.rows[0] || {};

  const stockSummary = stockRows.rows.reduce((acc, row) => {
    if (!acc[row.ingredient]) acc[row.ingredient] = [];
    acc[row.ingredient].push({ quantite: row.quantite, date: row.date });
    return acc;
  }, {});

  const pertesSummary = pertesRows.rows.map(r => ({
    ingredient: r.ingredient,
    quantite: r.quantite,
    raison: r.raison,
    date: r.date_perte,
  }));

  const inventaireSummary = inventaireRows.rows.map(r => ({
    ingredient: r.ingredient,
    quantiteReelle: r.quantite_reelle,
    ecart: r.ecart,
    date: r.created_at,
  }));

  return {
    clientNom: clientInfo.nom || 'Client',
    modeCompte: clientInfo.mode_compte,
    nbActivites: clientInfo.nb_activites,
    nbLabos: clientInfo.nb_labos,
    stock: stockSummary,
    pertes: pertesSummary,
    inventaires: inventaireSummary,
  };
}

function buildSystemPrompt(context) {
  const stockLines = Object.entries(context.stock)
    .map(([name, entries]) => {
      const latest = entries[0];
      return `  - ${name}: ${latest?.quantite ?? 'N/A'} (dernier relevé: ${latest?.date ? new Date(latest.date).toLocaleDateString('fr-FR') : 'N/A'})`;
    })
    .join('\n');

  const pertesLines = context.pertes
    .slice(0, 20)
    .map(p => `  - ${p.ingredient}: ${p.quantite} (${p.raison || 'N/A'}) le ${new Date(p.date).toLocaleDateString('fr-FR')}`)
    .join('\n');

  const inventaireLines = context.inventaires
    .slice(0, 20)
    .map(i => `  - ${i.ingredient}: réel=${i.quantiteReelle}, écart=${i.ecart}`)
    .join('\n');

  return `Tu es l'assistant IA de LabFlow, une plateforme de gestion pour restaurants et cafés.
Tu aides le client "${context.clientNom}" à optimiser sa gestion : stock, approvisionnements, pertes, inventaires.

Données actuelles du client :

STOCK (derniers relevés) :
${stockLines || '  Aucune donnée de stock disponible.'}

PERTES RÉCENTES :
${pertesLines || '  Aucune perte enregistrée récemment.'}

INVENTAIRES RÉCENTS :
${inventaireLines || '  Aucun inventaire récent.'}

Réponds en français. Sois concis, pratique et orienté action. Si tu identifies des problèmes (stock bas, pertes élevées, écarts d'inventaire importants), propose des suggestions concrètes. Ne génère pas de tableaux ou listes trop longs — favorise les réponses courtes et actionnables.`;
}

async function chat(clientId, conversationMessages, userMessage) {
  const context = await fetchClientContext(clientId);
  const systemPrompt = buildSystemPrompt(context);

  // Keep last 20 messages for context window efficiency
  const history = conversationMessages.slice(-20).map(m => ({
    role: m.role,
    content: m.content,
  }));

  history.push({ role: 'user', content: userMessage });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: history,
  });

  const assistantMessage = response.content[0]?.text || '';
  return { assistantMessage, updatedMessages: history.concat({ role: 'assistant', content: assistantMessage }) };
}

module.exports = { chat };
