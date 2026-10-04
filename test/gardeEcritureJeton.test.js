// Garde d'écriture globale (src/app.js) et jeton dans l'adresse : la garde s'applique dès qu'un jeton accompagne la
// requête, en-tête Authorization OU ?token= (jetonPresent, src/middleware/auth.js). Défaut d'origine : elle ne
// regardait que l'en-tête, et l'écriture d'un compte en lecture seule passait avec « ?token= » seul.
// Sans base de données : le pool est remplacé par un faux qui répond la ligne d'un compte.
//   node --test test/gardeEcritureJeton.test.js        (parcours complet : scripts/test-garde-ecriture.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-gardeEcriture-0123456789abcdef0123456789abcdef';

const COMPTES = new Map();
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    if (texte.includes('FROM utilisateurs u')) {
      const u = COMPTES.get(params[0]);
      return { rows: u ? [{ ...u }] : [] };
    }
    throw new Error(`requête inattendue : ${texte.slice(0, 120)}`);
  },
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };

const jwt = require('jsonwebtoken');
const { authenticate, requireWriteAccess, jetonPresent } = require('../src/middleware/auth');

const compte = (id, mode) => ({
  id, nom: `C${id}`, email: `c${id}@example.com`, role: 'client', actif: true, password_changed_at: null,
  gerant_parent_id: null, gerant_activite_id: null, gerant_activite_type: null, gerant_acces_acheteurs: false,
  acheteur_id: null, acheteur_client_id: null, acheteur_actif: null, mode_compte: mode, domaine_id: null,
});
const MODES = [[101, 'actif', null], [102, 'read_only', 'READ_ONLY'], [103, 'desactive', 'SUSPENDED'], [104, 'archive', 'SUSPENDED'], [105, 'bloque', 'BLOCKED']];
for (const [id, mode] of MODES) COMPTES.set(id, compte(id, mode));
const jeton = (id) => jwt.sign({ userId: id, role: 'client' }, process.env.JWT_SECRET, { expiresIn: '1h' });

// La garde de app.js, telle qu'elle y est écrite (le fichier charge toute l'application : on rejoue ses deux lignes).
const garde = (req, res, next) => {
  if (!jetonPresent(req)) return next();
  return authenticate(req, res, () => requireWriteAccess(req, res, next));
};
// Un passage de la garde : { suivant: true } si la requête continue, sinon { code, corps } de la réponse.
const passer = (req) => new Promise((fin, echec) => {
  const res = {
    code: 200,
    status(c) { this.code = c; return this; },
    json(b) { fin({ suivant: false, code: this.code, corps: b }); return this; },
  };
  Promise.resolve(garde({ method: 'POST', headers: {}, query: {}, ...req }, res, () => fin({ suivant: true }))).catch(echec);
});

test('jetonPresent : en-tête OU adresse', () => {
  assert.equal(jetonPresent({ headers: {}, query: {} }), false);
  assert.equal(jetonPresent({ headers: {} }), false, 'requête sans query');
  assert.equal(jetonPresent({ headers: { authorization: 'Bearer x.y.z' }, query: {} }), true);
  assert.equal(jetonPresent({ headers: {}, query: { token: 'x.y.z' } }), true);
  assert.equal(jetonPresent({ headers: { authorization: 'Bearer x.y.z' }, query: { token: 'x.y.z' } }), true);
  assert.equal(jetonPresent({ headers: {}, query: { token: '' } }), false, 'jeton vide = pas de jeton');
});

test('garde d\'écriture : même refus que le jeton soit dans l\'en-tête ou dans l\'adresse', async () => {
  for (const [id, mode, code] of MODES) {
    const t = jeton(id);
    for (const [ou, req] of [['en-tête', { headers: { authorization: `Bearer ${t}` } }], ['adresse', { query: { token: t } }], ['les deux', { headers: { authorization: `Bearer ${t}` }, query: { token: t } }]]) {
      const r = await passer(req);
      if (code) {
        assert.equal(r.suivant, false, `${mode} / ${ou} : la requête ne passe pas`);
        assert.equal(r.code, 403, `${mode} / ${ou}`);
        assert.equal(r.corps.code, code, `${mode} / ${ou}`);
      } else {
        assert.equal(r.suivant, true, `${mode} / ${ou} : un compte actif écrit`);
      }
    }
  }
});

test('garde d\'écriture : sans jeton elle laisse la route répondre ; jeton illisible → 401', async () => {
  let r = await passer({});
  assert.equal(r.suivant, true, 'sans jeton : la route (authenticate) répondra 401');
  r = await passer({ query: { token: 'pas.un.jeton' } });
  assert.equal(r.suivant, false);
  assert.equal(r.code, 401);
  r = await passer({ query: { token: ['a.b.c', 'd.e.f'] } });
  assert.equal(r.suivant, false, 'jeton répété dans l\'adresse');
  assert.equal(r.code, 401);
});

test('src/app.js : la garde globale lit jetonPresent (plus seulement l\'en-tête)', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(app.includes('if (!jetonPresent(req)) return next();\n  authenticate(req, res, () => requireWriteAccess(req, res, next));'), 'garde globale');
  assert.equal(/if \(!authHeader\) return next\(\);/.test(app), false, 'l\'ancienne condition a disparu');
});
