// Rendu au bord des messages (lot 2b, spec §5.1).
//
// Monté EN PREMIER dans app.js, juste après `app.set('trust proxy', 1)` : il enveloppe ainsi
// cors, les analyseurs, /api/public, le garde d'écriture, /auth, les webhooks, la 404, le
// gestionnaire d'erreurs et les limiteurs (express-rate-limit répond par res.send(objet), qui
// passe par res.json).
//
// Il remplace `res.json` de chaque requête. Au moment de l'appel, il lit `req.voc` (posé par
// authenticate : vocabulaire du compte lecteur, I6) ou, à défaut, le vocabulaire par défaut
// (route publique, 401 d'authenticate, requête non authentifiée), et rend les balises `[[…]]` :
//   - de `body.message` (chaîne) ;
//   - de `body.erreurs[].message` (chaînes).
// Rien d'autre : ni `errors` (tableau express-validator ou compteur d'import), ni `details`,
// `warnings`, `detail`, `reply`, ni un corps tableau, Buffer, null ou objet non littéral.
//
// COPIE, jamais modification : des corps sont partagés entre requêtes (REPONSE_INVALIDE de
// publicSiteController). Sans balise rendue, le MÊME objet est passé à res.json : mêmes octets.
// La copie `{ ...body, message }` garde la position de la clé `message`, donc l'ordre des clés.
// Tous les statuts sont rendus, 2xx compris.
//
// Sortie explicite : une route dont le `message` est une DONNÉE saisie pose `res.locals.vocabBrut = true`
// avant de répondre ; le corps part alors tel quel. Sinon une donnée de la forme d'une balise serait rendue.
// Deux sites : PUT /admin/site/demandes-acces/:id (message d'un visiteur du site public) et refuserBalises
// de src/utils/manuelRendu.js (refus 400 d'une balise saisie dans le manuel, la base ou une variante, lot 2c).
//
// Une balise de syntaxe invalide reste telle quelle et n'est signalée qu'une fois par processus
// (ensemble borné à SIGNALEES_MAX entrées, vidé au-delà). Une balise de forme valide dont la CLÉ est
// inconnue (« [[nom:xyz]] ») n'est pas laissée telle quelle : le moteur la rend « ‹xyz› » et la signale
// lui-même (ensemble du vocabulaire, borné lui aussi).
const { rendre, vocabDefaut } = require('../utils/vocab');

const SIGNALEES_MAX = 500;
const signalees = new Set();

const signaler = (balise, raison) => {
  const cle = `${balise} ${raison}`;
  if (signalees.has(cle)) return;
  if (signalees.size >= SIGNALEES_MAX) signalees.clear();
  signalees.add(cle);
  console.warn(`[vocab] balise invalide ${balise} : ${raison}`);
};

// Objet littéral seulement (prototype Object.prototype ou null) : une copie par décomposition
// d'une instance de classe perdrait son prototype (toJSON compris).
const estObjetLitteral = (v) => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * Corps rendu avec `voc` : le MÊME objet si rien ne change, sinon une copie superficielle
 * (et une copie du tableau `erreurs` et de ses éléments rendus). Jamais de modification de `body`.
 */
const rendreCorps = (body, voc = vocabDefaut) => {
  if (!estObjetLitteral(body)) return body;
  let copie = null;

  if (typeof body.message === 'string') {
    const message = rendre(voc, body.message, signaler);
    if (message !== body.message) copie = { ...body, message };
  }

  if (Array.isArray(body.erreurs)) {
    let change = false;
    const erreurs = body.erreurs.map((e) => {
      if (!estObjetLitteral(e) || typeof e.message !== 'string') return e;
      const message = rendre(voc, e.message, signaler);
      if (message === e.message) return e;
      change = true;
      return { ...e, message };
    });
    if (change) copie = { ...(copie || body), erreurs };
  }

  return copie || body;
};

const rendreMessages = (req, res, next) => {
  const jsonOrigine = res.json;
  res.json = function json(body) {
    // Forme dépréciée d'Express 4 res.json(statut, corps) : transmise telle quelle (aucun emploi).
    if (arguments.length !== 1) return jsonOrigine.apply(this, arguments);
    // Corps porteur d'une donnée saisie : jamais rendu (sortie explicite de la route).
    if (res.locals && res.locals.vocabBrut === true) return jsonOrigine.call(this, body);
    return jsonOrigine.call(this, rendreCorps(body, req.voc || vocabDefaut));
  };
  next();
};

module.exports = { rendreMessages, rendreCorps, SIGNALEES_MAX };
