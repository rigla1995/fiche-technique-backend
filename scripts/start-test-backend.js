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
 *   1. vide les clés des services externes (email, IA, Messenger, Telegram, et les anciennes clés DocuSeal,
 *      que plus aucun code ne lit depuis le lot 3, étape 5) — dotenv ne réécrit pas une variable déjà
 *      définie, même vide ;
 *   2. remplace le module `resend` par un bouchon qui journalise « [BOUCHON resend] » ;
 *   3. refuse tout appel réseau sortant (fetch, http.request, https.request) vers autre chose que
 *      localhost, en le journalisant « [BLOQUÉ …] » ;
 *   4. refuse de démarrer si la base de données n'est pas locale (les migrations s'appliquent au
 *      démarrage) — sauf avec --base-distante, à n'employer qu'en connaissance de cause.
 * Rien d'autre ne change : mêmes routes, mêmes migrations, même base que `npm start`.
 *
 * Les bouchons sont posés par scripts/lib/bouchons-test.js (mode « test ») ; le même module
 * sert l'oracle du vocabulaire en mode « capture » (scripts/capture-vocab-baseline.js). */

const path = require('path');
const { installer } = require('./lib/bouchons-test');

installer();
require(path.join(path.resolve(__dirname, '..'), 'src', 'app.js'));
