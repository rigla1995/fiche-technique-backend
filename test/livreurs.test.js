// Module « Livreurs », étape L1 — règles pures de src/utils/livreurs.js (sans base).
const test = require('node:test');
const assert = require('node:assert/strict');
const { normaliserTelephone, telephoneAffiche, emailTechnique, estEmailTechnique, motDePasseInitial } = require('../src/utils/livreurs');

// Même règle que authController.isStrongPassword (≥ 8, majuscule, minuscule, chiffre, caractère spécial).
const robuste = (v) => typeof v === 'string' && v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v) && /[@$!%*?&_\-#]/.test(v);

test('normaliserTelephone : numéros tunisiens acceptés, indicatif et séparateurs tolérés', () => {
  assert.equal(normaliserTelephone('22345678'), '22345678');
  assert.equal(normaliserTelephone('22 345 678'), '22345678');
  assert.equal(normaliserTelephone('+216 22 345 678'), '22345678');
  assert.equal(normaliserTelephone('00216-98.765.432'), '98765432');
  assert.equal(normaliserTelephone('21622345678'), '22345678');
  assert.equal(normaliserTelephone('(+216) 54 183 189'), '54183189');
  assert.equal(normaliserTelephone('71 884 210'), '71884210'); // fixe (7) accepté
  assert.equal(normaliserTelephone('42 000 000'), '42000000'); // 4 accepté
});

test('normaliserTelephone : refus des numéros hors format', () => {
  for (const v of [null, undefined, '', '1234567', '123456789', '12345678', '32345678', '62345678', '82345678', 'abcdefgh', '+33612345678', '+216 1234 5678']) {
    assert.equal(normaliserTelephone(v), null, `attendu null pour « ${v} »`);
  }
});

test('telephoneAffiche : « 22 345 678 »', () => {
  assert.equal(telephoneAffiche('22345678'), '22 345 678');
  assert.equal(telephoneAffiche(null), '');
});

test('emailTechnique / estEmailTechnique : adresse de connexion d\'un livreur sans e-mail', () => {
  const e = emailTechnique('22345678');
  assert.equal(e, 'livreur-22345678@livreurs.labflow.local');
  assert.equal(estEmailTechnique(e), true);
  assert.equal(estEmailTechnique(e.toUpperCase()), true);
  assert.equal(estEmailTechnique('karim@societe.tn'), false);
  assert.equal(estEmailTechnique(null), false);
  // forme valide pour les contrôles d'adresse existants (register, profil)
  assert.match(e, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});

test('motDePasseInitial : robuste, lisible, jamais deux fois le même', () => {
  const vus = new Set();
  for (let i = 0; i < 200; i++) {
    const m = motDePasseInitial();
    assert.equal(robuste(m), true, `faible : ${m}`);
    assert.equal(/[0O1lI]/.test(m), false, `caractère ambigu : ${m}`);
    assert.equal(m.length, 12);
    vus.add(m);
  }
  assert.ok(vus.size > 190);
});
