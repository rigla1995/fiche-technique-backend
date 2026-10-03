const pool = require('../config/database');
const { recordTokenUsage } = require('./aiFormatter');
const { executeToolCall, toolsFor, getClientContextLine } = require('./aiToolHandlers');
const { computeOnboardingEtat, onboardingPromptBlock } = require('./onboardingEtat');
// Lot 2b §7 — vocabulaire du compte dans le prompt, les outils et le glossaire.
const { vocabDefaut, libelleComposant } = require('../utils/vocab');
const { vocabForClient } = require('../utils/vocabCompte');
const { LEXIQUE_DEFAUT, LEXIQUE_CLES } = require('../config/lexiqueDefaut');

// ── Moteur IA UNIQUE de LabFlow : Google Gemini Flash, via l'endpoint
// compatible OpenAI (mêmes messages/tools que l'ancien pipeline — décision
// client 2026-07-24 : Groq et Claude retirés). Tool-calling natif fiable,
// gros contexte (fini les 413 du tier Groq), tier gratuit généreux.
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
// Alias « latest » : suit le modèle Flash stable courant — les modèles datés
// finissent retirés pour les nouvelles clés (vécu avec gemini-2.5-flash).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const MAX_TOOL_ITERATIONS = 8;

// ── Glossaire « Vocabulaire du compte » (lot 2b §7.3) ─────────────────────────────
// Le prompt, les outils et les résultats sont écrits avec les mots du compte ; depuis le lot 2c, la
// base de connaissances et le manuel aussi (rendus par search_knowledge_base), à quelques noms de
// LabFlow près (noms d'offres, « sous-produit » : règle 3). Le glossaire donne au modèle la
// correspondance (les mots de LabFlow restent ceux des noms d'outils, des champs et des codes).
// Absent quand aucune forme ne diffère du lexique par défaut (restauration, café, boulangerie) :
// le prompt y reste identique au caractère près.
// Le glossaire parcourt les clés du lexique : chaque forme est rendue par le moteur sur l'entrée
// résolue du domaine (profil.lexique) et sur celle du lexique par défaut, par voc.avec(entrée).
// Champs de données (paramètres et résultats des outils) qui portent chaque terme.
const CHAMPS_GLOSSAIRE = {
  activite: '`activite_id`, `activites`, `activite`',
  labo: '`labo_id`, `labos`, `labo`, `labo_destinataire`',
  article_ingredient: '`ingredient`',
  appro: '`date_appro`, `type_appro`',
  perte: '`type_perte`, `date_perte`',
  inventaire: '`date_inventaire`, `quantite_reelle`',
  transfert: '`date_transfert`',
  vente: '`nb_ventes`, `prix_vente`',
  food_cost: '`food_cost_pct`, `food_cost_eleve`',
  cout_matiere: '`cout_matiere`, `seuil_cout_matiere_pct`',
  marge: '`marge_brute`',
  prestataire: '`prestataires_livraison`',
  gerant: '`nb_gerants`',
};
// Clés du lexique des composants « unités » du domaine (type technique = clé).
const TYPES_COMPOSANTS = ['activite', 'labo', 'gerant'];
// « ingrédient » : même forme par défaut, deux sens (ligne de stock, recette).
const [CLE_STOCK, CLE_RECETTE] = ['article_ingredient', 'ingredient'];
// [singulier, pluriel, forme courte, forme courte au pluriel] d'une entrée, en minuscules (sigles gardés).
const formesEntree = (voc, e) => [voc.avec(e).nom('_'), voc.avec(e).nom('_', true), voc.avec(e).court('_'), voc.avec(e).court('_', true)];

// voc : vocabulaire du compte ; profil : profil du domaine (lexique résolu, composants).
function glossaireVocabulaire(voc, profil) {
  const lexique = profil && profil.lexique;
  if (!lexique) return '';
  const ici = (k) => formesEntree(voc, lexique[k] || LEXIQUE_DEFAUT[k]);
  const parDefaut = (k) => formesEntree(vocabDefaut, LEXIQUE_DEFAUT[k]);
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const paire = ([sg, pl]) => (sg === pl ? `« ${sg} »` : `« ${sg} » / « ${pl} »`);
  const court = ([sg, , c]) => (c !== sg ? ` (forme courte « ${c} »)` : '');
  const champs = (k) => (CHAMPS_GLOSSAIRE[k] ? ` — dans les données : ${CHAMPS_GLOSSAIRE[k]}` : '');
  // Une ligne par forme par défaut distincte, pas par clé (hors abréviations *_abr)
  const groupes = new Map();
  for (const k of LEXIQUE_CLES) {
    if (/_abr$/.test(k)) continue;
    const sg = LEXIQUE_DEFAUT[k].sg;
    groupes.set(sg, [...(groupes.get(sg) || []), k]);
  }
  const lignes = [];
  // Clés dérivées par copie (labo_long, labo_desc, activite_desc) : formes par défaut (« laboratoire »,
  // « point de vente ») que le manuel et la base de connaissances employaient avant le lot 2c, et que les
  // données des outils peuvent encore porter → une ligne dès que la forme
  // diffère ici ; les copies d'une même clé qui rendent ici la même chose partagent la ligne
  // (« « laboratoire » / « laboratoires » (« laboratoire de production ») → … »).
  const copies = new Map();
  for (const cles of groupes.values()) {
    if (cles.every((k) => egal(ici(k), parDefaut(k)))) continue;
    const e = LEXIQUE_DEFAUT[cles[0]];
    if (cles.length === 1 && e.mode === 'copie') {
      const cle = `${e.derive_de}|${JSON.stringify(ici(cles[0]))}`;
      if (copies.has(cle)) copies.get(cle).push(cles[0]);
      else {
        const groupe = [cles[0]];
        copies.set(cle, groupe);
        lignes.push(groupe);
      }
      continue;
    }
    if (cles.includes(CLE_STOCK) && cles.includes(CLE_RECETTE) && !egal(ici(CLE_STOCK), ici(CLE_RECETTE))) {
      // « ingrédient » : une seule ligne, ses deux sens (ligne de stock, puis recette)
      lignes.push(`« ${parDefaut(CLE_STOCK)[0]} » (ligne ${voc.de('stock')}, champ \`ingredient\` des données) → « ${ici(CLE_STOCK)[0]} »${court(ici(CLE_STOCK))} ; « ${parDefaut(CLE_RECETTE)[0]} » d'${voc.un('recette')} → « ${ici(CLE_RECETTE)[0]} »${court(ici(CLE_RECETTE))}`);
      continue;
    }
    const k = cles.includes(CLE_STOCK) ? CLE_STOCK : cles[0];
    lignes.push(`${paire(parDefaut(k))}${court(parDefaut(k))} → ${paire(ici(k))}${court(ici(k))}${champs(k)}`);
  }
  if (lignes.length === 0) return '';
  for (let i = 0; i < lignes.length; i++) {
    if (typeof lignes[i] === 'string') continue;
    const [k, ...autres] = lignes[i];
    const variantes = autres.length ? ` (${autres.map((a) => `« ${parDefaut(a)[0]} »`).join(', ')})` : '';
    lignes[i] = `${paire(parDefaut(k))}${variantes} → ${paire(ici(k))}`;
  }
  // « articles vendables » (outil get_config_vente) : tout ce que le compte vend, pas ses articles de stock.
  const regleVendables = egal(ici('article'), parDefaut('article')) ? ''
    : `\n4. « articles vendables » (configuration ${voc.de('vente')}, \`get_config_vente\`) = tout ce que le compte vend (${voc.nom('produit', true)} et articles revendus) : ne le traduis pas par « ${ici('article')[1]} vendables ».`;
  // Composants actifs du domaine dont le libellé n'est pas celui du lexique, une ligne par type technique
  const unites = [];
  for (const k of TYPES_COMPOSANTS) {
    const entree = lexique[k] || LEXIQUE_DEFAUT[k];
    const noms = (profil.composants || [])
      .filter((c) => c && c.actif !== false && (c.typeTechnique ?? c.type_technique) === k)
      .map((c) => libelleComposant(voc, c))
      .filter((n) => n !== voc.avec(entree).Nom('_'));
    if (noms.length) unites.push(`${noms.join(', ')} = ${voc.avec(entree).det('_', 'un', true)}« ${voc.avec(entree).nom('_', true)} » (${parDefaut(k)[1]} dans LabFlow)`);
  }
  return `\n\n## Vocabulaire du compte
Ce compte n'emploie pas tous les mots de LabFlow. Correspondances (mot de LabFlow → mot du compte) :
${lignes.join('\n')}${unites.length ? `\nUnités du compte (composants de son domaine) :\n${unites.join('\n')}` : ''}
Règles :
1. Réponds au client avec les mots du compte (à droite des flèches), jamais avec ceux de LabFlow.
2. Les noms d'outils, les champs et les codes (\`type_appro\`, \`canal\`, \`type_perte\`, \`PT\`) restent ceux de LabFlow : ne les montre pas au client.
3. Le manuel et la base de connaissances sont écrits avec les mots du compte. Quelques noms de LabFlow y restent tels quels (noms d'offres comme « Activité Basique », « sous-produit ») : cite-les sans les traduire.${regleVendables}`;
}

// voc : vocabulaire du compte (lot 2b §7.1), obligatoire ; profil : profil du domaine du compte
// (lexique résolu et composants), pour le glossaire — sans lui, pas de glossaire.
function buildSystemPrompt(contextLine = null, voc, profil = null) {
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const contextBlock = contextLine
    ? `\n\n## Contexte du client (DÉJÀ CONNU — ne rappelle PAS get_client_info, get_abonnement ni get_fournisseurs pour ces infos)\n${contextLine}\nUtilise directement ces IDs ${voc.de('activite', true)}/${voc.pl('labo')} dès que le client nomme ${voc.un('activite')} ou ${voc.un('labo')}. L'abonnement, la capacité souscrite et les compteurs ci-dessus sont déjà à jour : réponds-y directement, sans appeler d'outil.`
    : '';
  // Glossaire du compte, juste après le bloc de contexte (vide par défaut)
  const blocContexte = contextBlock + glossaireVocabulaire(voc, profil);
  return `Tu es l'assistant IA professionnel de LabFlow. Aujourd'hui : ${today}.
Tu communiques avec le client via Messenger ou le chat web de l'application. Tes réponses doivent être professionnelles, structurées et bien formatées (Markdown léger).
Le client utilise l'agent pour CONSULTER ses données comme s'il était dans l'application — en lecture seule. Tu ne modifies, ne crées et ne supprimes JAMAIS de données ; tu réponds aux questions et tu envoies des rapports.${blocContexte}

## Règles de communication
- Réponds dans la langue du client (français ou darija tunisienne)
- Sois précis et concis : 4-8 lignes pour une réponse normale, plus long si rapport/liste demandé
- Utilise le *gras* pour les titres/sections
- Utilise les emojis de manière professionnelle : ${voc.icon('stock')} ${voc.nom('stock')}, 📉 ${voc.nom('perte', true)}, 📊 ${voc.nom('inventaire')}, 🔄 ${voc.nom('transfert', true)}, 🛒 ${voc.court('appro', true)}, 🧾 ${voc.nom('vente', true)}, ${voc.icon('labo')} ${voc.nom('labo')}, ${voc.icon('activite')} ${voc.nom('activite')}, 💳 abonnement, ⚠️ alertes
- Pour les montants : toujours préciser TND. Pour les quantités : unité si disponible.
- Formate les listes avec des tirets (-)

## Données consultables (outils disponibles)
Le client peut tout consulter : profil & périmètre (\`get_client_info\`), ${voc.nom('stock')} (\`get_stock\`), ${voc.nom('appro', true)} (\`get_appros\`), ${voc.nom('perte', true)} (\`get_pertes\`), ${voc.nom('inventaire', true)} (\`get_inventaires\`), ${voc.nom('transfert', true)} ${voc.nom('labo')}→${voc.nom('activite', true)} et cessions ${voc.nom('labo')}→${voc.nom('labo')} (\`get_transferts\`), ${voc.nom('referentiel')} ${voc.de('article', true)} (\`get_referentiel\`), ${voc.nom('fournisseur', true)} (\`get_fournisseurs\`), abonnement & capacité (\`get_abonnement\`), ${voc.nom('vente', true)} / CA / ${voc.nom('food_cost')} / canaux (\`get_ventes\`), ${voc.nom('produit', true)} & ${voc.nom('fiche_technique', true)} (\`get_produits\`), configuration ${voc.de('vente')} : ${voc.nom('prestataire', true)}, charges fixes, articles vendables (\`get_config_vente\`). Choisis l'outil correspondant au flux demandé et applique les filtres (${voc.nom('activite')}, ${voc.nom('labo')}, période, article…).

## Utilisation des outils — règles STRICTES
1. Le périmètre du client (${voc.nom('activite', true)}/${voc.nom('labo', true)} avec leurs IDs) est fourni ci-dessus : n'appelle PAS \`get_client_info\` (sauf si tu as besoin de l'email du compte). Va directement à l'outil de données.
2. Si le client a plusieurs ${voc.nom('activite', true)} et ne précise pas ${voc.acc('activite', 'lequel', 'laquelle')} : utilise \`ask_clarification\` AVANT d'appeler les données. S'il n'a qu'${voc.un('activite')}, procède directement sans demander.
3. Si le client dit "${voc.acc('activite', 'tous', 'toutes')}" ou n'a qu'${voc.det('activite', 'un')}${voc.acc('activite', 'seul', 'seule')} ${voc.nom('activite')} : procède directement
4. Pour les périodes ("mois actuel", "année dernière") : convertis en dates ISO 8601
5. Pour TOUTE question conceptuelle, définition, conseil ou interprétation (ex : « c'est quoi ${voc.un('fiche_technique')} ? », « ${voc.mon('food_cost')} est-${voc.acc('food_cost', 'il', 'elle')} ${voc.acc('food_cost', 'bon', 'bonne')} ? », « comment réduire ${voc.mon('perte', true)} ? ») : appelle d'abord \`search_knowledge_base\` et appuie-toi UNIQUEMENT sur ce qu'elle renvoie pour expliquer. N'invente jamais une définition métier.

## Accès aux données — RÈGLES CRITIQUES (ne jamais enfreindre)
- Les outils \`get_*\` (get_stock, get_appros, get_ventes, get_transferts, get_pertes, get_inventaires, get_referentiel, get_fournisseurs, get_abonnement, get_produits, get_config_vente) SONT ton accès direct à la base de données du client. Pour répondre à TOUTE demande de données, tu DOIS appeler l'outil correspondant.
- Ne dis JAMAIS que tu « n'as pas accès à la base de données » : tu y accèdes précisément via ces outils. Si tu as besoin de données, APPELLE l'outil — ne demande pas au client de le faire.
- Ne mentionne JAMAIS de nom d'outil au client et ne lui demande JAMAIS « d'utiliser un outil » : les outils sont les TIENS, ils sont invisibles pour lui.
- \`search_knowledge_base\` sert UNIQUEMENT à expliquer un concept métier — JAMAIS à récupérer les données du client.
- Si un outil de données renvoie une liste vide, réponds simplement qu'il n'y a aucune donnée pour cette période / ce périmètre. N'invente JAMAIS de valeurs, de lignes, ni de mention « en attente de données ».
- Quand un outil renvoie une LISTE (${voc.court('appro', true)}, ${voc.nom('vente', true)}, ${voc.nom('transfert', true)}, ${voc.nom('perte', true)}, ${voc.nom('inventaire', true)}…), restitue TOUTES les lignes retournées — ne résume ni ne tronque jamais une liste de données. Si elle est longue, structure-la (groupée par article ou par date) mais reste exhaustif ; la règle « 4-8 lignes » ne s'applique PAS aux listes de données.
- Après une réponse de clarification du client (« ${voc.acc('activite', 'tous', 'toutes')} », « 1 », un nom ${voc.de('activite')}/${voc.nom('labo')}) : appelle IMMÉDIATEMENT l'outil de données approprié avec le périmètre choisi. « ${voc.acc('activite', 'tous', 'toutes')} » = ${voc.tous('activite')} (et ${voc.le('labo', true)} si la demande les concerne) — n'appelle PAS \`ask_clarification\` une 2e fois.

## Rapports par email
- Si le client demande un rapport (« envoie-moi le rapport », « rapport excel ») : appelle \`send_report\` (le rapport est un fichier Excel) puis confirme l'envoi et l'email de destination.
- Quand tu fournis une synthèse riche (${voc.nom('stock')} + ${voc.nom('perte', true)} + ${voc.nom('inventaire', true)} + ${voc.nom('transfert', true)}), propose spontanément : « Veux-tu que je te l'envoie en rapport Excel par email ? » et n'appelle \`send_report\` que si le client accepte.

## Format de réponse obligatoire
Commence TOUJOURS par [CONF:0.XX] (niveau de confiance 0.00-1.00 selon la complétude des données).

## Alertes proactives
- Si ${voc.nom('stock')} < 5 unités pour ${voc.un('article_ingredient')} → signaler avec ⚠️
- Si ${voc.nom('perte', true)} ${voc.acc('perte', 'élevé', 'élevée', true)} ${voc.acc('perte', 'détecté', 'détectée', true)} → signaler avec 📉`;
}

function parseConfidence(rawMessage) {
  // Accepte 0.xx ET 1.00 / 1 (le préfixe restait visible quand le modèle
  // répondait [CONF:1.00])
  const match = rawMessage.match(/^\[CONF:([01](?:\.\d{1,2})?)\]\s*/);
  if (match) {
    return { confidence: Math.min(parseFloat(match[1]), 1), message: rawMessage.slice(match[0].length).trim() };
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
// tools : définitions dans le vocabulaire du compte (toolsFor(voc), lot 2b §7.2).
async function geminiChat(messages, tools) {
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
        tools,
        tool_choice: 'auto',
        // Le prompt exige de restituer TOUTES les lignes d'une liste de données
        // (appros, ventes…) : 1024 tronquait les réponses en plein milieu.
        max_tokens: 8192,
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

  // Vocabulaire du compte (lot 2b §7.1) : une requête par message, jamais req.voc (Messenger n'a
  // pas de requête, et un appelant admin passerait le défaut).
  const voc = await vocabForClient(clientId);
  // Profil du domaine (lexique résolu et composants, pour le glossaire et la recherche du lot 2c) : seulement hors
  // vocabulaire par défaut.
  let profil = null;
  if (!voc.estDefaut) {
    try {
      const { getProfilForClient } = require('./domaineProfilService');
      profil = await getProfilForClient(clientId);
    } catch (_) { /* prompt sans glossaire */ }
  }

  const conv = await getConversation(clientId, chatSessionId);
  const history = (conv?.messages ?? []).slice(-12);

  let ctxLine = null;
  try { ctxLine = (await getClientContextLine(clientId, voc))?.line || null; } catch (_) { /* prompt sans contexte */ }
  // En phase de mise en route, le bot devient un GUIDE : son prompt reçoit
  // l'avancement réel des étapes (aucun effet une fois l'onboarding terminé —
  // cas de l'agent Messenger, qui sert aussi des clients en régime permanent).
  let onboardingBlock = '';
  try { onboardingBlock = onboardingPromptBlock(await computeOnboardingEtat(clientId), voc); } catch (_) { /* guide sans avancement */ }
  const messages = [
    { role: 'system', content: buildSystemPrompt(ctxLine, voc, profil) + onboardingBlock },
    ...history,
    { role: 'user', content: userMessage },
  ];

  let finalText = null;
  let confidence = null;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const data = await geminiChat(messages, toolsFor(voc));
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
      // Réponse coupée par le plafond de tokens : on le signale au lieu de
      // laisser une phrase en suspens.
      if (data.choices?.[0]?.finish_reason === 'length') {
        finalText += '\n\n… _(réponse tronquée — demandez une période plus courte ou un rapport Excel par email)_';
      }
      confidence = parsed.confidence;
      break;
    }

    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.function?.arguments || '{}'); } catch (_) { args = {}; }
      // Lot 2c (R5.3.3) : le profil du domaine sert à la recherche (variantes, composants), sans requête de plus.
      const result = await executeToolCall(clientId, tc.function?.name, args, voc, profil);

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

module.exports = { chatWithAI, buildSystemPrompt, glossaireVocabulaire, parseConfidence };
