// Renvoi de l'invitation d'un gérant par le client propriétaire (POST /api/abonnements/gerants/:id/inviter).
// Défaut d'origine : l'écran du client appelait /auth/invite/resend, réservé au super admin (403).
// Sans base de données : le pool est remplacé par un faux qui enregistre chaque requête ; l'email est bouchonné.
//   node --test test/gerantInvitation.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-gerantInvitation-0123456789abcdef0123456789abcdef';

// Gérants connus : id → { parent, activé }.
const GERANTS = new Map([
  [7, { parent: 2, nom: 'Gérant A', email: 'a@example.com', activated_at: null }],
  [8, { parent: 2, nom: 'Gérant B', email: 'b@example.com', activated_at: '2026-09-01T00:00:00Z' }],
  [9, { parent: 3, nom: 'Gérant C', email: 'c@example.com', activated_at: null }],
]);
const requetes = [];
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push({ texte, params });
    if (texte.startsWith('SELECT id, nom, email, activated_at FROM utilisateurs')) {
      const g = GERANTS.get(Number(params[0]));
      return { rows: g && g.parent === Number(params[1]) ? [{ id: Number(params[0]), nom: g.nom, email: g.email, activated_at: g.activated_at }] : [] };
    }
    if (texte.startsWith('UPDATE utilisateurs SET invite_token')) return { rows: [], rowCount: 1 };
    throw new Error(`requête inattendue : ${texte.slice(0, 120)}`);
  },
};
const remplacer = (relatif, exports) => {
  const chemin = require.resolve(relatif);
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports, children: [], paths: [] };
};
remplacer('../src/config/database', fauxPool);
const emails = [];
let emailEnPanne = false;
remplacer('../src/services/emailService', {
  generateInviteToken: () => 'jeton-neuf',
  sendInviteEmail: async (args) => {
    if (emailEnPanne) throw new Error('resend en panne');
    emails.push(args);
    return { success: true };
  },
});

const { inviter } = require('../src/controllers/gerantController');
const { requireClientOwner, requireSuperAdmin } = require('../src/middleware/auth');

const VOC = { marque: 'vocabulaire du compte' };
const appeler = async (user, id) => {
  const res = { code: 200, corps: null, status(c) { this.code = c; return this; }, json(b) { this.corps = b; return this; } };
  await inviter({ params: { id }, user, voc: VOC }, res);
  return res;
};
const CLIENT = { id: 2, role: 'client' };
const raz = () => { requetes.length = 0; emails.length = 0; emailEnPanne = false; };

test('client → son gérant non activé : jeton régénéré (48 h), email envoyé avec le vocabulaire du compte', async () => {
  raz();
  const avant = Date.now();
  const res = await appeler(CLIENT, '7');
  assert.equal(res.code, 200);
  assert.deepEqual(res.corps, { ok: true });
  const maj = requetes.find((r) => r.texte.startsWith('UPDATE utilisateurs SET invite_token'));
  assert.ok(maj, 'jeton écrit');
  assert.match(maj.texte, /WHERE id = \$3 AND role = 'gerant' AND gerant_parent_id = \$4 AND activated_at IS NULL$/);
  assert.equal(maj.params[0], 'jeton-neuf');
  assert.deepEqual(maj.params.slice(2), [7, 2]);
  const duree = maj.params[1].getTime() - avant;
  assert.ok(duree > 47.9 * 3600e3 && duree < 48.1 * 3600e3, 'expiration à 48 h');
  assert.deepEqual(emails, [{ to: 'a@example.com', nom: 'Gérant A', token: 'jeton-neuf', role: 'gerant', voc: VOC }]);
});

test('client → gérant d\'un autre compte : 404, rien n\'est écrit ni envoyé', async () => {
  raz();
  const res = await appeler(CLIENT, '9');
  assert.equal(res.code, 404);
  assert.equal(res.corps.message, '[[Nom:gerant]] introuvable');
  assert.equal(requetes.length, 1, 'une seule requête : la lecture');
  assert.match(requetes[0].texte, /role = 'gerant' AND gerant_parent_id = \$2$/);
  assert.deepEqual(requetes[0].params, ['9', 2]);
  assert.equal(emails.length, 0);
});

test('client → son gérant déjà activé : 409, rien n\'est écrit ni envoyé', async () => {
  raz();
  const res = await appeler(CLIENT, '8');
  assert.equal(res.code, 409);
  assert.equal(res.corps.message, 'Le compte de [[ce:gerant]] est déjà activé');
  assert.equal(requetes.length, 1);
  assert.equal(emails.length, 0);
});

test('identifiant non numérique ou trop long : 404 sans aucune requête', async () => {
  for (const id of ['abc', '7; DROP TABLE utilisateurs', '1234567890', '']) {
    raz();
    const res = await appeler(CLIENT, id);
    assert.equal(res.code, 404, id);
    assert.equal(requetes.length, 0, id);
  }
});

test('email en panne : 502 (jamais 500, que l\'écran redirige vers la page d\'erreur)', async () => {
  raz();
  emailEnPanne = true;
  const res = await appeler(CLIENT, '7');
  assert.equal(res.code, 502);
  assert.ok(res.corps.message);
});

test('gardes de la route : client propriétaire seulement ; la route admin /auth/invite/resend reste au super admin', () => {
  const passe = (garde, role) => { let ok = false; const res = { status() { return this; }, json() { return this; } }; garde({ user: { role } }, res, () => { ok = true; }); return ok; };
  assert.equal(passe(requireClientOwner, 'client'), true);
  for (const role of ['gerant', 'super_admin', 'boss', 'acheteur']) assert.equal(passe(requireClientOwner, role), false, role);
  assert.equal(passe(requireSuperAdmin, 'client'), false);

  const lf = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n');
  const routes = lf('src/routes/abonnements.js');
  assert.ok(routes.includes("router.post('/gerants/:id/inviter', authenticate, requireClientOwner, gerant.inviter);"), 'route du client propriétaire');
  assert.ok(lf('src/routes/auth.js').includes("router.post('/invite/resend/:userId', authenticate, requireSuperAdmin, resendInvite);"), 'route admin inchangée');
});
