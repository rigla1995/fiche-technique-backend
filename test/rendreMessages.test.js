// Rendu au bord des messages (lot 2b, spec §5.1) — sans base de données.
//   node --test test/rendreMessages.test.js
//
// 1. rendreCorps : copie jamais modification, même objet sans balise, corps non rendus,
//    erreurs[].message, signalement dédoublonné et borné.
// 2. Middleware rendreMessages : req.voc lu au moment de l'appel, défaut sans req.voc,
//    forme dépréciée res.json(statut, corps) transmise telle quelle.
// 3. Dans une vraie application Express : res.json, res.send(objet), 404 et gestionnaire
//    d'erreurs passent par l'enrobage.
// 4. Les 9 messages balisés de middleware/auth.js rendent EXACTEMENT le texte d'avant par défaut.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const RACINE = path.resolve(__dirname, '..');
const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');
const { creerVocab, vocabDefaut, resoudreLexique } = require('../src/utils/vocab');
const { rendreMessages, rendreCorps, SIGNALEES_MAX } = require('../src/middleware/rendreMessages');

const ESSAIS = JSON.parse(fs.readFileSync(path.join(RACINE, 'test/vocab-lexiques-test.json'), 'utf8'));
const hotellerie = creerVocab(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie));
const miroir = creerVocab(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.miroir));

// console.warn capturé (balises invalides).
const avertissements = [];
const warnOrigine = console.warn;
test.before(() => { console.warn = (...a) => { avertissements.push(a.join(' ')); }; });
test.after(() => { console.warn = warnOrigine; });

// ── 1. rendreCorps ────────────────────────────────────────────────────────────────────────────
test('objet partagé intact après deux rendus avec deux vocabulaires', () => {
  const partage = Object.freeze({ message: '[[Nom:labo]] introuvable', code: 'X' });
  const a = rendreCorps(partage, vocabDefaut);
  const b = rendreCorps(partage, hotellerie);
  assert.deepEqual(a, { message: 'Labo introuvable', code: 'X' });
  assert.deepEqual(b, { message: 'Cuisine centrale introuvable', code: 'X' });
  assert.notEqual(a, partage);
  assert.notEqual(b, partage);
  assert.deepEqual(partage, { message: '[[Nom:labo]] introuvable', code: 'X' }, 'corps partagé non modifié');
  // l'ordre des clés est gardé (mêmes octets que l'ancien texte par défaut)
  const ordre = { code: 'C', message: 'Stock [[court:pt]] insuffisant', n: 1 };
  assert.equal(JSON.stringify(rendreCorps(ordre, vocabDefaut)), '{"code":"C","message":"Stock PT insuffisant","n":1}');
});

test('sans balise : le MÊME objet est renvoyé (mêmes octets)', () => {
  const corps = { message: 'Erreur serveur', erreurs: [{ code: 'A', message: 'Sans balise' }] };
  assert.equal(rendreCorps(corps, hotellerie), corps);
  const sansMessage = { status: 'ok' };
  assert.equal(rendreCorps(sansMessage, hotellerie), sansMessage);
  // une balise invalide reste telle quelle : rien ne change, même objet
  const invalide = { message: 'Texte [[foo:labo]] invalide' };
  assert.equal(rendreCorps(invalide, hotellerie), invalide);
});

test('tableau, Buffer, null, chaîne, message non chaîne, objet non littéral : inchangés', () => {
  const tableau = [{ message: '[[Nom:labo]]' }];
  assert.equal(rendreCorps(tableau, hotellerie), tableau);
  assert.deepEqual(tableau, [{ message: '[[Nom:labo]]' }]);
  const tampon = Buffer.from('[[Nom:labo]]');
  assert.equal(rendreCorps(tampon, hotellerie), tampon);
  assert.equal(rendreCorps(null, hotellerie), null);
  assert.equal(rendreCorps(undefined, hotellerie), undefined);
  assert.equal(rendreCorps('[[Nom:labo]]', hotellerie), '[[Nom:labo]]', 'une chaîne n\'est pas un corps rendu');
  assert.equal(rendreCorps(42, hotellerie), 42);
  for (const message of [42, null, { texte: '[[Nom:labo]]' }, ['[[Nom:labo]]']]) {
    const corps = { message };
    assert.equal(rendreCorps(corps, hotellerie), corps);
  }
  class Reponse { constructor() { this.message = '[[Nom:labo]]'; } }
  const instance = new Reponse();
  assert.equal(rendreCorps(instance, hotellerie), instance, 'instance de classe : jamais copiée');
  const sansProto = Object.assign(Object.create(null), { message: '[[Nom:labo]]' });
  assert.equal(rendreCorps(sansProto, hotellerie).message, 'Cuisine centrale');
});

test('erreurs[].message rendu ; errors, details, warnings, detail, reply jamais rendus', () => {
  const corps = {
    message: 'Composition invalide',
    erreurs: [
      { code: 'A', message: '[[Un:labo]] au moins' },
      { code: 'B', message: 'Sans balise' },
      { code: 'C', message: 3 },
      '[[Nom:labo]]',
      null,
    ],
    errors: [{ msg: '[[Nom:labo]]', message: '[[Nom:labo]]' }],
    details: [{ message: '[[Nom:labo]]', error: '[[Nom:labo]]' }],
    warnings: ['[[Nom:labo]]'],
    detail: '[[Nom:labo]]',
    reply: '[[Nom:labo]]',
  };
  const avant = JSON.parse(JSON.stringify(corps));
  const r = rendreCorps(corps, hotellerie);
  assert.notEqual(r, corps);
  assert.equal(r.message, 'Composition invalide');
  assert.deepEqual(r.erreurs[0], { code: 'A', message: 'Une cuisine centrale au moins' });
  assert.equal(r.erreurs[1], corps.erreurs[1], 'élément sans balise : même objet');
  assert.equal(r.erreurs[2], corps.erreurs[2]);
  assert.equal(r.erreurs[3], '[[Nom:labo]]');
  assert.equal(r.erreurs[4], null);
  for (const k of ['errors', 'details', 'warnings']) assert.equal(r[k], corps[k], k);
  assert.equal(r.detail, '[[Nom:labo]]');
  assert.equal(r.reply, '[[Nom:labo]]');
  assert.deepEqual(corps, avant, 'corps d\'origine non modifié');
  // message ET erreurs rendus ensemble
  const deux = rendreCorps({ message: '[[Nom:labo]]', erreurs: [{ message: '[[nom:labo:pl]]' }] }, vocabDefaut);
  assert.deepEqual(deux, { message: 'Labo', erreurs: [{ message: 'labos' }] });
  // erreurs sans balise : même tableau, même objet
  const intact = { erreurs: [{ message: 'x' }] };
  assert.equal(rendreCorps(intact, hotellerie), intact);
});

test('vocabulaire par défaut quand aucun n\'est donné', () => {
  assert.deepEqual(rendreCorps({ message: 'Accès réservé [[au:gerant:pl]]' }), { message: 'Accès réservé aux gérants' });
});

test('balise invalide signalée une seule fois par processus ; ensemble borné', () => {
  const debut = avertissements.length;
  const corps = { message: 'A [[zzz:labo]] B' };
  rendreCorps(corps, vocabDefaut);
  rendreCorps(corps, hotellerie);
  rendreCorps({ erreurs: [{ message: '[[zzz:labo]]' }] }, miroir);
  const signales = avertissements.slice(debut).filter((a) => a.includes('[[zzz:labo]]'));
  assert.equal(signales.length, 1, signales.join('\n'));
  assert.match(signales[0], /^\[vocab\] balise invalide \[\[zzz:labo\]\] : /);
  // borne : au-delà de SIGNALEES_MAX balises distinctes, l'ensemble repart de zéro
  for (let i = 0; i < SIGNALEES_MAX; i += 1) rendreCorps({ message: `[[zzz${i}:labo]]` }, vocabDefaut);
  const avantRetour = avertissements.length;
  rendreCorps(corps, vocabDefaut);
  assert.equal(avertissements.length - avantRetour, 1, 'ensemble vidé au-delà de la borne : nouveau signalement');
});

// ── 2. Middleware ─────────────────────────────────────────────────────────────────────────────
const fauxRes = () => {
  const res = { envoye: [], json(b) { this.envoye.push(b); return this; } };
  return res;
};

test('middleware : req.voc lu au MOMENT de l\'appel ; défaut sans req.voc', () => {
  const req = {};
  const res = fauxRes();
  let suivant = false;
  rendreMessages(req, res, () => { suivant = true; });
  assert.equal(suivant, true);
  res.json({ message: '[[Nom:labo]] introuvable' });
  assert.deepEqual(res.envoye[0], { message: 'Labo introuvable' }, 'sans req.voc : défaut');
  req.voc = hotellerie; // posé APRÈS le montage (authenticate)
  res.json({ message: '[[Nom:labo]] introuvable' });
  assert.deepEqual(res.envoye[1], { message: 'Cuisine centrale introuvable' });
  const partage = { message: 'Rien' };
  assert.equal(res.json(partage), res, 'renvoie ce que renvoie le res.json d\'origine');
  assert.equal(res.envoye[2], partage);
});

test('middleware : forme dépréciée res.json(statut, corps) transmise telle quelle', () => {
  const req = { voc: hotellerie };
  const recu = [];
  const res = { json(...a) { recu.push(a); return this; } };
  rendreMessages(req, res, () => {});
  const corps = { message: '[[Nom:labo]]' };
  res.json(400, corps);
  assert.deepEqual(recu[0], [400, corps]);
  assert.equal(recu[0][1], corps);
});

test('middleware : res.locals.vocabBrut = true → corps transmis tel quel (donnée saisie) ; clé inconnue rendue « ‹clé› »', () => {
  const req = { voc: hotellerie };
  const recu = [];
  const res = { locals: {}, json(b) { recu.push(b); return this; } };
  rendreMessages(req, res, () => {});
  const donnee = Object.freeze({ id: 4, message: 'Bonjour [[nom:inconnue]] et [[Nom:labo]]' });
  res.json(donnee);
  // sans sortie explicite : la balise de clé inconnue n'est PAS laissée telle quelle, le moteur rend « ‹clé› »
  assert.deepEqual(recu[0], { id: 4, message: 'Bonjour ‹inconnue› et Cuisine centrale' });
  res.locals.vocabBrut = true;
  res.json(donnee);
  assert.equal(recu[1], donnee, 'même objet, aucun rendu');
  // res.locals absent (faux res des autres tests) : rendu normal
  const res2 = { json(b) { recu.push(b); return this; } };
  rendreMessages(req, res2, () => {});
  res2.json({ message: '[[Nom:labo]]' });
  assert.deepEqual(recu[2], { message: 'Cuisine centrale' });
});

test('adminSiteController.updateDemandeAcces : sortie explicite du rendu avant de renvoyer le message du visiteur', () => {
  const src = fs.readFileSync(path.join(RACINE, 'src/controllers/adminSiteController.js'), 'utf8');
  assert.match(src, /res\.locals\.vocabBrut = true;\r?\n\s*res\.json\(mapDemande\(updated\.rows\[0\]\)\);/);
});

// ── 3. Application Express ───────────────────────────────────────────────────────────────────
test('Express : res.json, res.send(objet), 404 et gestionnaire d\'erreurs passent par l\'enrobage', async () => {
  const express = require('express');
  const app = express();
  app.use(rendreMessages);
  app.use((req, _res, next) => { if (req.headers['x-domaine'] === 'hotellerie') req.voc = hotellerie; next(); });
  const PARTAGE = { message: '[[Nom:labo]] introuvable' };
  app.get('/json', (_req, res) => res.status(404).json(PARTAGE));
  app.get('/send', (_req, res) => res.status(429).send({ message: 'Trop de [[nom:labo:pl]]' }));
  app.get('/ok', (_req, res) => res.json({ message: 'Commande annulée — [[le:stock]] a été réintégré' }));
  app.get('/boum', () => { throw new Error('boum'); });
  app.get('/tableau', (_req, res) => res.json([{ message: '[[Nom:labo]]' }]));
  app.use((_req, res) => res.status(404).json({ message: 'Route [[nom:labo]] introuvable' }));
  // eslint-disable-next-line no-unused-vars
  app.use((_err, _req, res, _next) => res.status(500).json({ message: 'Erreur [[compl:labo]]' }));

  const serveur = http.createServer(app);
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  const { port } = serveur.address();
  const get = (chemin, domaine) => new Promise((resolve, reject) => {
    const r = http.get({ host: '127.0.0.1', port, path: chemin, headers: domaine ? { 'x-domaine': domaine } : {} }, (res) => {
      let corps = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { corps += d; });
      res.on('end', () => resolve({ statut: res.statusCode, corps }));
    });
    r.on('error', reject);
  });
  try {
    assert.deepEqual(await get('/json'), { statut: 404, corps: '{"message":"Labo introuvable"}' });
    assert.deepEqual(await get('/json', 'hotellerie'), { statut: 404, corps: '{"message":"Cuisine centrale introuvable"}' });
    assert.deepEqual(PARTAGE, { message: '[[Nom:labo]] introuvable' }, 'corps partagé intact entre requêtes');
    assert.deepEqual(await get('/send', 'hotellerie'), { statut: 429, corps: '{"message":"Trop de cuisines centrales"}' });
    assert.deepEqual(await get('/ok'), { statut: 200, corps: '{"message":"Commande annulée — le stock a été réintégré"}' });
    assert.deepEqual(await get('/inconnue', 'hotellerie'), { statut: 404, corps: '{"message":"Route cuisine centrale introuvable"}' });
    assert.deepEqual(await get('/boum', 'hotellerie'), { statut: 500, corps: '{"message":"Erreur de la cuisine centrale"}' });
    assert.deepEqual(await get('/tableau', 'hotellerie'), { statut: 200, corps: '[{"message":"[[Nom:labo]]"}]' });
  } finally {
    await new Promise((r) => serveur.close(r));
  }
});

// ── 4. middleware/auth.js : 9 messages balisés, identiques par défaut ────────────────────────
test('middleware/auth.js : les 9 messages à terme rendent par défaut le texte d\'avant le lot 2b', () => {
  const source = fs.readFileSync(path.join(RACINE, 'src/middleware/auth.js'), 'utf8');
  const ATTENDUS = {
    'Compte [[nom:acheteur]] désactivé': 'Compte acheteur désactivé',
    'Action réservée au compte client (lecture seule pour [[le:gerant:pl]])': 'Action réservée au compte client (lecture seule pour les gérants)',
    'Accès réservé [[au:gerant:pl]]': 'Accès réservé aux gérants',
    'Module [[Court:vente]] non activé': 'Module Vente non activé',
    'Module [[Court:acheteur:pl]] non activé': 'Module Acheteurs non activé',
    '[[Nom:espace_acheteurs]] non [[acc:espace_acheteurs:autorisé:autorisée]] pour [[ce:gerant]]': 'Espace Acheteurs non autorisé pour ce gérant',
    '[[Le:espace_produits:Nom]] est [[acc:espace_produits:réservé:réservée]] à la formule Activité Premium': 'L\'Espace Produit est réservé à la formule Activité Premium',
    'Accès réservé [[au:acheteur:pl]]': 'Accès réservé aux acheteurs',
    'Accès non autorisé à [[ce:activite]]': 'Accès non autorisé à cette activité',
  };
  const balises = [...source.matchAll(/message: '([^'\n]*\[\[[^'\n]*)'/g)].map((m) => m[1]);
  assert.deepEqual([...balises].sort(), Object.keys(ATTENDUS).sort(), 'exactement les 9 messages balisés');
  const debut = avertissements.length;
  for (const [balise, texte] of Object.entries(ATTENDUS)) {
    assert.equal(rendreCorps({ message: balise }).message, texte);
    assert.notEqual(rendreCorps({ message: balise }, hotellerie).message, balise, 'balise valide');
  }
  assert.equal(avertissements.length, debut, 'aucune balise invalide');
  // exemples hors restauration
  assert.equal(rendreCorps({ message: 'Accès réservé [[au:gerant:pl]]' }, hotellerie).message, 'Accès réservé aux responsables de service');
  assert.equal(
    rendreCorps({ message: '[[Le:espace_produits:Nom]] est [[acc:espace_produits:réservé:réservée]] à la formule Activité Premium' }, miroir).message,
    'La Zone Invention est réservée à la formule Activité Premium',
  );
});
