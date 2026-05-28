const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const INTENT_LABELS = {
  appros:     'Approvisionnements',
  pertes:     'Pertes',
  transferts: 'Transferts labo',
  stock:      'Stock',
  ventes:     'Ventes',
  activites:  'Activités & Labos',
  general:    'Question générale',
};

function buildContextLine(context) {
  const acts = context.activites.map(a => a.nom).join(', ') || 'aucune';
  const labs = context.labos.map(l => l.nom).join(', ') || 'aucun';
  const feats = context.features.join(', ');
  return `Activités: ${acts} | Labos: ${labs} | Modules: ${feats}`;
}

function compactData(data, intent, limit = 40) {
  if (!data || (Array.isArray(data) && !data.length)) return 'Aucun résultat pour la période demandée.';
  if (!Array.isArray(data)) return JSON.stringify(data).slice(0, 1500);

  const rows = data.slice(0, limit);
  const header = Object.keys(rows[0] || {}).join(' | ');
  const lines = rows.map(r => Object.values(r).map(v =>
    v === null ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  ).join(' | '));
  return [header, ...lines].join('\n').slice(0, 2000);
}

const SYSTEM_PROMPT = `Tu es l'assistant LabFlow. Tu reçois des données brutes d'une base de données et tu dois les formater en réponse professionnelle et lisible pour le client.

Règles STRICTES :
- Réponds en français (ou darija si le client l'utilise)
- 6-12 lignes maximum sauf si c'est un rapport long
- Utilise des emojis utiles : 📦 stock, 🛒 appros, 📉 pertes, 🔄 transferts, 💰 ventes, ⚠️ alertes
- Montants toujours en TND avec 2 décimales
- Calcule et affiche les totaux (total TND, nb entrées) quand pertinent
- Si données vides → dis-le clairement, ne fabrique rien
- NE PAS inventer de données ni d'articles
- Formatage texte simple (pas de Markdown complexe, le client lit sur mobile)`;

async function formatWithGroq(userMessage, intent, data, context, dates) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY non configurée');

  const intentLabel = INTENT_LABELS[intent] || intent;
  const ctxLine = buildContextLine(context);
  const dataStr = compactData(data, intent);
  const periodStr = dates ? `Période: ${dates.date_from} → ${dates.date_to}` : '';

  const userContent = [
    `Question client: "${userMessage}"`,
    `Contexte client: ${ctxLine}`,
    periodStr,
    `Type de données: ${intentLabel}`,
    `Données:`,
    dataStr,
  ].filter(Boolean).join('\n');

  let retries = 3;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(`${GROQ_API_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 700,
        stream: false,
      }),
    });

    if (response.status === 429) {
      const errText = await response.text();
      const waitMatch = errText.match(/try again in ([\d.]+)s/i);
      const waitMs = waitMatch ? Math.ceil(parseFloat(waitMatch[1]) * 1000) + 200 : 5000;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw new Error('Service temporairement surchargé. Veuillez réessayer dans quelques secondes.');
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Groq error ${response.status}: ${err}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content ?? 'Désolé, je n\'ai pas pu générer une réponse.';
  }
}

module.exports = { formatWithGroq };
