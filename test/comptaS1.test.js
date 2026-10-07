// LabFlow Compta, étape S1 (labflow-reprise/achats-compta/SPEC-SOCLE.md, D13) : le lien de l'email « mot de passe
// oublié » ramène sur l'adresse du produit d'où vient la demande ; le produit est pris dans une liste fermée ; l'email
// de LabFlow est inchangé ; la route /api/compta/acces répond sa forme définitive (vide à cette étape).
// Sans base de données ni envoi d'email : RESEND_API_KEY vide ⇒ mode développement (l'email renvoie son lien).
//   node --test test/comptaS1.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-comptaS1-0123456789abcdef0123456789abcdef0123';
process.env.APP_URL = 'https://app.exemple.tn';
process.env.APP_URL_COMPTA = 'https://compta.exemple.tn';
delete process.env.RESEND_API_KEY;

// Le pool de la base est remplacé : le mot de passe oublié lit un seul compte connu.
const requetes = [];
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push({ texte, params });
    if (texte.startsWith('SELECT id, nom, email FROM utilisateurs')) {
      return { rows: String(params[0]).toLowerCase() === 'connu@exemple.tn' ? [{ id: 5, nom: 'Connu', email: 'connu@exemple.tn' }] : [] };
    }
    if (texte.startsWith('UPDATE utilisateurs SET reset_token')) return { rows: [], rowCount: 1 };
    // Étape S2b : les accès sont lus dans compta.acces (aucun pour ce compte ; groupes remplis : test/comptaS2b.test.js).
    // S3b : + état de l'abonnement du titulaire (ab.mode_compte) ; S3c : + niveau de la personne (a.niveau).
    if (texte.startsWith('SELECT e.id, e.type, e.nom, e.etat, a.role, a.niveau, ab.mode_compte FROM compta.acces a')) return { rows: [] };
    throw new Error(`requête inattendue : ${texte.slice(0, 120)}`);
  },
};
const remplacer = (relatif, exports) => {
  const chemin = require.resolve(relatif);
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports, children: [], paths: [] };
};
remplacer('../src/config/database', fauxPool);

const email = require('../src/services/emailService');
const envois = [];
const vraiEnvoi = email.sendPasswordResetEmail;
email.sendPasswordResetEmail = async (args) => { const r = await vraiEnvoi(args); envois.push({ args, r }); return r; };
const { forgotPassword } = require('../src/controllers/authController');
const { listerAcces } = require('../src/compta/accesController');

const reponse = () => ({ code: 200, corps: null, status(c) { this.code = c; return this; }, json(b) { this.corps = b; return this; } });
const attendre = () => new Promise((r) => setTimeout(r, 20));

test('produitSur : liste fermée, LabFlow par défaut', () => {
  assert.equal(email.produitSur('compta'), 'compta');
  assert.equal(email.produitSur('labflow'), 'labflow');
  for (const v of [undefined, null, '', 'COMPTA', 'app', 'https://evil.tn', 1, {}]) assert.equal(email.produitSur(v), 'labflow');
});

test('urlEcrans : une adresse par produit', () => {
  assert.equal(email.urlEcrans('compta'), 'https://compta.exemple.tn');
  assert.equal(email.urlEcrans('labflow'), 'https://app.exemple.tn');
  assert.equal(email.urlEcrans('autre'), 'https://app.exemple.tn');
});

test('email de réinitialisation : lien et nom du produit', async () => {
  const compta = await vraiEnvoi({ to: 'x@exemple.tn', nom: 'X', token: 'jeton', produit: 'compta' });
  assert.equal(compta.resetUrl, 'https://compta.exemple.tn/reset-password/jeton');
  const labflow = await vraiEnvoi({ to: 'x@exemple.tn', nom: 'X', token: 'jeton' });
  assert.equal(labflow.resetUrl, 'https://app.exemple.tn/reset-password/jeton');
});

test('mot de passe oublié demandé depuis LabFlow Compta : lien vers compta', async () => {
  envois.length = 0;
  const res = reponse();
  await forgotPassword({ body: { email: 'connu@exemple.tn', produit: 'compta' } }, res);
  assert.deepEqual(res.corps, { ok: true });
  await attendre();
  assert.equal(envois.length, 1);
  assert.equal(envois[0].args.produit, 'compta');
  assert.match(envois[0].r.resetUrl, /^https:\/\/compta\.exemple\.tn\/reset-password\/[0-9a-f]{64}$/);
});

test('mot de passe oublié sans produit, ou produit inconnu : lien vers LabFlow (comme avant)', async () => {
  for (const body of [{ email: 'connu@exemple.tn' }, { email: 'connu@exemple.tn', produit: 'https://evil.tn' }]) {
    envois.length = 0;
    await forgotPassword({ body }, reponse());
    await attendre();
    assert.equal(envois.length, 1);
    assert.equal(envois[0].args.produit, 'labflow');
    assert.match(envois[0].r.resetUrl, /^https:\/\/app\.exemple\.tn\/reset-password\//);
  }
});

test('mot de passe oublié : même réponse pour une adresse inconnue, aucun email', async () => {
  envois.length = 0;
  const res = reponse();
  await forgotPassword({ body: { email: 'inconnu@exemple.tn', produit: 'compta' } }, res);
  assert.deepEqual(res.corps, { ok: true });
  await attendre();
  assert.equal(envois.length, 0);
});

test('/api/compta/acces : trois groupes, vides pour un compte sans accès', async () => {
  const res = reponse();
  await listerAcces({ user: { id: 5, role: 'client' } }, res);
  assert.deepEqual(res.corps, { cabinets: [], maComptabilite: [], confiees: [] });
});
