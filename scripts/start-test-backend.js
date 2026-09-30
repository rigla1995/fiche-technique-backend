/* Lanceur du backend LOCAL pour les tests E2E (scripts/test-*.js, scripts/check-invariant-*.js) :
 * AUCUN email réel, AUCUN service externe, quelle que soit la configuration du fichier .env.
 *
 *   node scripts/start-test-backend.js            → backend sur le port du .env (3000 par défaut)
 *   PORT=3100 node scripts/start-test-backend.js  → autre port
 *
 * Pourquoi : les scripts E2E créent des comptes par POST /admin/clients, qui envoie l'email de
 * bienvenue dès que RESEND_API_KEY est renseignée. Le .env d'un poste de développement contient
 * de vraies clés : un `npm start` ordinaire enverrait de vrais emails à des adresses de test.
 *
 * Ce que fait ce lanceur, AVANT de charger l'application :
 *   1. vide les clés des services externes (email, IA, Messenger, DocuSeal, Telegram) — dotenv ne
 *      réécrit pas une variable déjà définie, même vide ;
 *   2. remplace le module `resend` par un bouchon qui journalise « [BOUCHON resend] » ;
 *   3. refuse tout appel réseau sortant (fetch, http.request, https.request) vers autre chose que
 *      localhost, en le journalisant « [BLOQUÉ …] » ;
 *   4. refuse de démarrer si la base de données n'est pas locale (les migrations s'appliquent au
 *      démarrage) — sauf avec --base-distante, à n'employer qu'en connaissance de cause.
 * Rien d'autre ne change : mêmes routes, mêmes migrations, même base que `npm start`. */
const path = require('path');
const Module = require('module');

const RACINE = path.resolve(__dirname, '..');
process.chdir(RACINE);

// 1. Clés externes vidées avant dotenv.
const CLES_EXTERNES = [
  'RESEND_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'TELEGRAM_BOT_TOKEN',
  'MESSENGER_PAGE_ACCESS_TOKEN', 'MESSENGER_APP_SECRET', 'MESSENGER_VERIFY_TOKEN',
  'DOCUSEAL_API_TOKEN', 'DOCUSEAL_URL', 'DOCUSEAL_WEBHOOK_SECRET',
];
for (const cle of CLES_EXTERNES) process.env[cle] = '';
require('dotenv').config({ path: path.join(RACINE, '.env') });

const estLocal = (hote) => /^(localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(String(hote || '').trim());

// 4. Base de données locale seulement.
const hoteBase = process.env.DB_HOST || 'localhost';
if (!estLocal(hoteBase) && !process.argv.includes('--base-distante')) {
  console.error(`[start-test-backend] base de données non locale (DB_HOST = ${hoteBase}) : démarrage refusé.`);
  console.error('  Les migrations s\'appliquent au démarrage. Pointer le .env sur une base locale, ou ajouter --base-distante.');
  process.exit(2);
}

// 2. Module `resend` bouchonné : aucun email ne part.
const chargerOrigine = Module._load;
Module._load = function chargerBouchonne(request, parent, isMain) {
  if (request === 'resend') {
    return {
      Resend: class ResendBouchon {
        constructor() {
          this.emails = {
            send: async (m) => {
              console.log('[BOUCHON resend] email NON envoyé →', m && m.to, '|', m && m.subject);
              return { data: { id: 'bouchon' }, error: null };
            },
          };
        }
      },
    };
  }
  return chargerOrigine.apply(this, arguments);
};

// 3. Réseau sortant : localhost seulement.
const fetchOrigine = global.fetch;
global.fetch = async (url, opts) => {
  let hote = '';
  try { hote = new URL(typeof url === 'string' ? url : url.url).hostname; } catch (_) { /* URL relative ou invalide */ }
  if (!estLocal(hote)) {
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
      console.log(`[BLOQUÉ ${nom}.request]`, hote);
      throw new Error('réseau externe bloqué (backend de test)');
    }
    return requeteOrigine.apply(this, args);
  };
}

console.log(`[start-test-backend] clés externes vidées (${CLES_EXTERNES.length}), resend bouchonné, réseau externe bloqué — base ${hoteBase}`);
require(path.join(RACINE, 'src', 'app.js'));
