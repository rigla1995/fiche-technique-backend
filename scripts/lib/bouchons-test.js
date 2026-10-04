/* Bouchons du backend LOCAL de test : AUCUN email réel, AUCUN service externe.
 *
 * Extrait de scripts/start-test-backend.js (lot 2b, spec §2.2), qui l'appelle à comportement
 * identique. Deux modes :
 *
 *   installer()                      → mode « test » (lanceur du backend de test) :
 *     1. vide les clés des services externes (email, IA, Messenger, Telegram, et les anciennes clés
 *        DocuSeal, que plus aucun code ne lit depuis le lot 3, étape 5) AVANT dotenv — dotenv ne
 *        réécrit pas une variable déjà définie, même vide ;
 *     2. refuse une base de données non locale (sauf --base-distante) ;
 *     3. remplace le module `resend` par un bouchon qui journalise « [BOUCHON resend] » ;
 *     4. refuse tout appel réseau sortant (fetch, http.request, https.request) vers autre chose
 *        que localhost, en le journalisant « [BLOQUÉ …] » ; http.get / https.get passent par le
 *        même contrôle, et une garde sur net.Socket.prototype.connect refuse toute connexion TCP
 *        ou TLS directe (net.connect, tls.connect…) vers un hôte non local (la base distante
 *        admise par --base-distante exceptée).
 *
 *   installer({ capture: true })     → mode « capture » de l'oracle du vocabulaire
 *     (scripts/capture-vocab-baseline.js). En plus, AVANT dotenv et avant tout require de
 *     l'application :
 *     - fausse RESEND_API_KEY NON vide (sinon 8 fonctions d'email sortent avant l'envoi) ;
 *       APP_URL, APP_NAME, FROM_EMAIL, TZ fixés ; variables PRESTATAIRE_* et FACTURE_* fixées
 *       (FACTURE_STRICT vidée) ; MESSENGER_PAGE_USERNAME fixé (invitation Messenger) ;
 *     - Gemini factice (GEMINI_API_KEY=oracle). Lot 3, étape 5 : PLUS de DocuSeal factice (plus de
 *       contrat, d'avenant ni de résiliation : docusealService et le webhook sont supprimés) ; les
 *       variables DOCUSEAL_* sont posées VIDES (ENV_RETIREES_CAPTURE) pour qu'un .env de poste ne les
 *       rallume pas, et un appel vers un hôte DocuSeal serait REFUSÉ comme tout hôte externe ;
 *     - `resend` remplacé : emails.send POUSSE { to, subject, html, attachments } dans
 *       journal.emails (rien ne part) ;
 *     - fetch : hôte Gemini → réponse fixe sans appel d'outil, corps CAPTÉ (journal.gemini) ;
 *       localhost → appel réel (l'oracle parle HTTP à l'application chargée dans son processus) ;
 *       tout autre hôte REFUSÉ (journal.bloques) ; http/https.request et .get, et toute connexion
 *       TCP/TLS directe : localhost seulement ;
 *     - variables ENV_RETIREES_CAPTURE « retirées » en les posant VIDES avant dotenv, comme les
 *       clés du mode « test » : dotenv (ici, puis src/app.js et src/config/migrate.js, qui le
 *       rappellent) recharge une variable ABSENTE depuis le .env du poste, jamais une variable
 *       définie, même vide. Tous leurs lecteurs testent une valeur (=== '1', vérité) : vide =
 *       absente. controlerEnvCapture() le vérifie avant ET après le require de l'application ;
 *     - sseService.pushTo / pushToAdmins remplacés par des fonctions qui CAPTENT puis appellent
 *       l'original (les contrôleurs les lisent par décomposition au chargement : ce remplacement
 *       précède le require de src/app) ;
 *     - abonnementController.enforcerStatuts remplacé par une fonction vide (job de 01:00).
 *
 *   controlerRequireCache()          → lève si un module node_modules/resend est chargé.
 *   controlerEnvCapture()            → lève si une variable retirée est non vide, ou si une valeur
 *                                      fixée du mode « capture » a changé.
 *
 * Aucun require de l'application ici en mode « test » : le lanceur charge src/app.js ensuite. */
const path = require('path');
const Module = require('module');

const RACINE = path.resolve(__dirname, '..', '..');

// Clés vidées en mode « test » (ordre et liste inchangés depuis start-test-backend.js ; les 3 clés DocuSeal ne
// sont plus lues par aucun code depuis le lot 3, étape 5 : les vider reste sans effet et sans risque).
const CLES_EXTERNES = [
  'RESEND_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'TELEGRAM_BOT_TOKEN',
  'MESSENGER_PAGE_ACCESS_TOKEN', 'MESSENGER_APP_SECRET', 'MESSENGER_VERIFY_TOKEN',
  'DOCUSEAL_API_TOKEN', 'DOCUSEAL_URL', 'DOCUSEAL_WEBHOOK_SECRET',
];

// Valeurs du mode « capture » : fixes, pour des sorties identiques d'un passage à l'autre.
const HOTE_GEMINI = 'generativelanguage.googleapis.com';
const ENV_CAPTURE = {
  RESEND_API_KEY: 're_oracle_bouchon',
  FROM_EMAIL: 'oracle@labflow.invalid',
  APP_URL: 'http://app.oracle.invalid',
  APP_NAME: 'LabFlow',
  TZ: 'Africa/Tunis',
  // Gemini factice
  GEMINI_API_KEY: 'oracle',
  GEMINI_MODEL: 'gemini-oracle',
  // Invitation Messenger (lien m.me, aucun appel)
  MESSENGER_PAGE_USERNAME: 'labflow.oracle',
  // Identité du prestataire et facturation : valeurs non fictives et fixes, lues par les FACTURES
  // (docuseal-templates/generate.js). Lot 3, étape 5 : PRESTATAIRE_VILLE et PRESTATAIRE_SIGNATAIRE retirées
  // (lues seulement par le bloc des signatures des contrats, supprimé).
  FACTURE_PRESTATAIRE_NOM: 'LabFlow Oracle',
  FACTURE_ADRESSE: '12 rue des Essais, 1000 Tunis',
  FACTURE_MATRICULE_FISCAL: '7654321/B/A/000',
  FACTURE_TVA_RATE: '19',
  PRESTATAIRE_NOM: 'LabFlow Oracle',
  PRESTATAIRE_FORME: 'SARL',
  PRESTATAIRE_RAISON_SOCIALE: 'LabFlow Oracle SARL',
  PRESTATAIRE_MATRICULE: '7654321/B/A/000',
  PRESTATAIRE_RC: 'B9999992026',
  PRESTATAIRE_CAPITAL: '5 000 DT',
  PRESTATAIRE_ADRESSE: '12 rue des Essais, 1000 Tunis',
  PRESTATAIRE_EMAIL: 'contact@oracle.invalid',
  PRESTATAIRE_TEL: '+216 70 000 001',
};
// Variables retirées en mode « capture » : posées VIDES avant dotenv (une variable supprimée serait
// rechargée depuis le .env du poste par chaque dotenv.config(), src/app.js compris — mesuré).
// Lecteurs : MESSENGER_* par vérité : vide équivaut à absente. Lot 3, étape 5 : toutes les variables DOCUSEAL_*
// (URL, jeton, 3 modèles, secret de webhook, flux PDF) et FACTURE_STRICT n'ont plus AUCUN lecteur (code des
// contrats supprimé) ; elles restent posées vides pour qu'un .env de poste ne puisse rien rallumer si du code
// DocuSeal revenait — controlerEnvCapture() le vérifie avant et après le chargement de l'application.
const ENV_RETIREES_CAPTURE = [
  'DOCUSEAL_PDF_FLOW', 'DOCUSEAL_URL', 'DOCUSEAL_API_TOKEN', 'DOCUSEAL_TEMPLATE_ID',
  'DOCUSEAL_TEMPLATE_AVENANT_ID', 'DOCUSEAL_TEMPLATE_RESILIATION_ID', 'DOCUSEAL_WEBHOOK_SECRET',
  'FACTURE_STRICT', 'GROQ_API_KEY', 'TELEGRAM_BOT_TOKEN',
  'MESSENGER_PAGE_ACCESS_TOKEN', 'MESSENGER_APP_SECRET', 'MESSENGER_VERIFY_TOKEN',
];

const estLocal = (hote) => /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(String(hote || '').trim());

// Réponse fixe de Gemini (format OpenAI) : aucune demande d'outil, aucun usage (rien n'est
// écrit dans ai_token_usage).
const REPONSE_GEMINI = {
  id: 'oracle',
  object: 'chat.completion',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '[CONF:0.90] Réponse fixe de l\'oracle.' } }],
};

const reponseJson = (corps, status = 200) => new Response(JSON.stringify(corps), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

function installer({ capture = false, argv = process.argv } = {}) {
  process.chdir(RACINE);
  const journal = { emails: [], gemini: [], sse: [], bloques: [] };

  // 1. Variables d'environnement, AVANT dotenv.
  if (capture) {
    for (const cle of ENV_RETIREES_CAPTURE) process.env[cle] = '';
    for (const [cle, valeur] of Object.entries(ENV_CAPTURE)) process.env[cle] = valeur;
  } else {
    for (const cle of CLES_EXTERNES) process.env[cle] = '';
  }
  require('dotenv').config({ path: path.join(RACINE, '.env') });
  if (capture) controlerEnvCapture();

  // 2. Base de données locale seulement.
  const hoteBase = process.env.DB_HOST || 'localhost';
  if (!estLocal(hoteBase) && (capture || !argv.includes('--base-distante'))) {
    console.error(`[start-test-backend] base de données non locale (DB_HOST = ${hoteBase}) : démarrage refusé.`);
    console.error('  Les migrations s\'appliquent au démarrage. Pointer le .env sur une base locale, ou ajouter --base-distante.');
    process.exit(2);
  }

  // 3. Module `resend` bouchonné : aucun email ne part.
  const chargerOrigine = Module._load;
  Module._load = function chargerBouchonne(request, parent, isMain) {
    if (request === 'resend') {
      return {
        Resend: class ResendBouchon {
          constructor() {
            this.emails = {
              send: async (m) => {
                if (capture) {
                  journal.emails.push({
                    to: m && m.to,
                    subject: m && m.subject,
                    html: m && m.html,
                    attachments: (m && m.attachments) || [],
                  });
                } else {
                  console.log('[BOUCHON resend] email NON envoyé →', m && m.to, '|', m && m.subject);
                }
                return { data: { id: 'bouchon' }, error: null };
              },
            };
          }
        },
      };
    }
    return chargerOrigine.apply(this, arguments);
  };

  // 4. Réseau sortant : localhost seulement (et, en capture, Gemini factice).
  const fetchOrigine = global.fetch;
  global.fetch = async (url, opts) => {
    let hote = '';
    let urlTexte = '';
    try {
      // Mode « test » : même lecture que l'ancien lanceur (objet Request : url.url).
      urlTexte = typeof url === 'string' ? url : (capture && url instanceof URL ? url.href : url.url);
      hote = new URL(urlTexte).hostname;
    } catch (_) { /* URL relative ou invalide */ }
    if (capture && hote === HOTE_GEMINI) {
      let corps = null;
      try { corps = opts && opts.body ? JSON.parse(opts.body) : null; } catch (_) { corps = opts && opts.body; }
      journal.gemini.push(corps);
      return reponseJson(REPONSE_GEMINI);
    }
    if (!estLocal(hote)) {
      if (capture) journal.bloques.push(hote || String(url).slice(0, 80));
      console.log('[BLOQUÉ fetch]', hote || String(url).slice(0, 80));
      throw new Error('réseau externe bloqué (backend de test)');
    }
    return fetchOrigine(url, opts);
  };
  for (const nom of ['http', 'https']) {
    const module_ = require(nom);
    const requeteOrigine = module_.request;
    module_.request = function requeteLocale(...args) {
      const a = args[0];
      const hote = typeof a === 'string' ? new URL(a).hostname : a instanceof URL ? a.hostname : (a && (a.hostname || a.host)) || '';
      if (!estLocal(String(hote).split(':')[0])) {
        if (capture) journal.bloques.push(String(hote));
        console.log(`[BLOQUÉ ${nom}.request]`, hote);
        throw new Error('réseau externe bloqué (backend de test)');
      }
      return requeteOrigine.apply(this, args);
    };
    // http.get appelle la fonction request INTERNE du module, pas module.request : on la
    // redirige vers la version contrôlée ci-dessus (même comportement que l'original).
    module_.get = function getLocal(...args) {
      const req = module_.request(...args);
      req.end();
      return req;
    };
  }
  // Dernière garde : toute connexion TCP/TLS directe (net.connect, tls.connect, client d'une
  // bibliothèque) vers un hôte non local est refusée. La base distante explicitement admise
  // (--base-distante, mode « test ») reste joignable.
  const net = require('net');
  const connectOrigine = net.Socket.prototype.connect;
  const hotesAdmis = new Set();
  if (!capture && argv.includes('--base-distante')) hotesAdmis.add(String(hoteBase).trim().toLowerCase());
  net.Socket.prototype.connect = function connectLocal(...args) {
    const a = Array.isArray(args[0]) ? args[0][0] : args[0];
    let hote = 'localhost';
    if (a && typeof a === 'object') {
      if (a.path) return connectOrigine.apply(this, args); // tube ou socket local
      hote = a.host || a.hostname || 'localhost';
    } else if (typeof a === 'string' && !/^d+$/.test(a)) {
      return connectOrigine.apply(this, args); // tube ou socket local (chemin)
    } else if (typeof args[1] === 'string') {
      hote = args[1];
    }
    const h = String(hote).trim().toLowerCase();
    if (!estLocal(h) && !hotesAdmis.has(h)) {
      if (capture) journal.bloques.push(h);
      console.log('[BLOQUÉ net.connect]', h);
      const err = new Error('réseau externe bloqué (backend de test)');
      process.nextTick(() => this.destroy(err));
      return this;
    }
    return connectOrigine.apply(this, args);
  };

  if (capture) {
    // 5. SSE : capte puis appelle l'original (remplacement AVANT tout require d'un contrôleur).
    const sse = require(path.join(RACINE, 'src', 'services', 'sseService'));
    const pushToOrigine = sse.pushTo;
    const pushToAdminsOrigine = sse.pushToAdmins;
    sse.pushTo = (userId, eventType, data) => {
      journal.sse.push({ vers: 'client', userId, eventType, data });
      return pushToOrigine(userId, eventType, data);
    };
    sse.pushToAdmins = (eventType, data) => {
      journal.sse.push({ vers: 'admins', eventType, data });
      return pushToAdminsOrigine(eventType, data);
    };
    // 6. Job quotidien de 01:00 neutralisé (lu par app.js après les migrations).
    const abonnement = require(path.join(RACINE, 'src', 'controllers', 'abonnementController'));
    abonnement.enforcerStatuts = () => {};
    console.log(`[bouchons-test] mode capture : resend capté, Gemini factice, réseau externe bloqué, SSE capté, enforcerStatuts neutralisé — base ${hoteBase}`);
  } else {
    console.log(`[start-test-backend] clés externes vidées (${CLES_EXTERNES.length}), resend bouchonné, réseau externe bloqué — base ${hoteBase}`);
  }
  return { journal, hoteBase, ENV_CAPTURE, HOTE_GEMINI };
}

// Contrôle du mode « capture » : variables retirées vides, valeurs fixées intactes. Appelé par
// installer() après dotenv, puis par l'oracle avant et après le require de l'application.
function controlerEnvCapture() {
  const presentes = ENV_RETIREES_CAPTURE.filter((cle) => process.env[cle]); // non vide
  const changees = Object.entries(ENV_CAPTURE).filter(([cle, v]) => process.env[cle] !== v).map(([cle]) => cle);
  if (presentes.length || changees.length) {
    throw new Error(`environnement de capture invalide : variable(s) retirée(s) définie(s) [${presentes.join(', ')}], valeur(s) fixée(s) modifiée(s) [${changees.join(', ')}]`);
  }
  return true;
}

// Contrôle final : le vrai client Resend n'a jamais été chargé.
function controlerRequireCache() {
  const charges = Object.keys(require.cache).filter((p) => /[\\/]node_modules[\\/]resend[\\/]/i.test(p));
  if (charges.length) {
    throw new Error(`module resend réel chargé (${charges.length} fichier(s)) : ${charges[0]}`);
  }
  return true;
}

module.exports = { installer, controlerRequireCache, controlerEnvCapture, CLES_EXTERNES, ENV_RETIREES_CAPTURE, ENV_CAPTURE, HOTE_GEMINI, estLocal };
