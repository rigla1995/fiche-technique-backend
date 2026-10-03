// Lot 2c, M0 (spec §3.1, R3.1.1) : un lexique lu est une liste d'ÉCARTS, toujours résolu avant usage.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require('../lib/commun');
const V = require('../lib/vocabulaires');
const { rendre, vocabDuLexique } = require(path.join(C.RACINE, 'src', 'utils', 'vocab'));

const muet = () => {};
// Exemple 8 du §7.7 (decouvrir-labflow).
const EX8 = '| [[Nom:espace_labo]] | [[Nom:stock]] [[du:labo]], production, [[nom:transfert:pl]] vers [[le:activite:pl]] |';
const EX8_ORIGINE = '| Espace Labo | Stock du labo, production, transferts vers les activités |';

test('R3.1.1 (test de M0) : exemple 8 du §7.7 rendu en Hôtellerie = « Espace Cuisine »', () => {
  const H = V.vocabDuDomaine('hotellerie');
  assert.equal(rendre(H, EX8, muet), '| Espace Cuisine | Stock de la cuisine centrale, production, livraisons internes vers les services |');
  assert.equal(rendre(V.vocabDuDomaine('ceramique'), EX8, muet), '| Espace Site | Stock du site de production, production, livraisons internes vers les points de vente |');
  assert.equal(rendre(V.vocabDefaut, EX8, muet), EX8_ORIGINE);
  // Même chose avec le lexique d'essai (copie du front), résolu.
  assert.ok(rendre(V.vocabulairesEssai().hotellerie, EX8, muet).startsWith('| Espace Cuisine | '));
});

test('R3.1.1 : sans résolution, les clés dérivées sortent fausses sans erreur (le piège que la lib évite)', () => {
  const ecarts = C.lireDomaines().domaines.hotellerie.ecarts;
  assert.match(rendre(vocabDuLexique(ecarts), EX8, muet), /^\| Espace Labo \|/);
  const brut = vocabDuLexique(ecarts);
  const resolu = V.vocabDuDomaine('hotellerie');
  assert.equal(brut.Nom('espace_labo'), 'Espace Labo');
  assert.equal(resolu.Nom('espace_labo'), 'Espace Cuisine');
  assert.equal(resolu.nom('labo_long'), 'cuisine centrale');
  assert.equal(resolu.Nom('activite_desc'), 'Service');
});

test('§3.1 : domaines.json cohérent avec le moteur et avec test/vocab-lexiques-test.json (H et C)', () => {
  assert.deepEqual(V.verifierLexiques(), []);
  const d = C.lireDomaines().domaines;
  assert.deepEqual(Object.keys(d).sort(), ['ceramique', 'hotellerie']);
  for (const slug of ['hotellerie', 'ceramique']) {
    assert.ok(V.memeLexique(V.resoudre(d[slug].ecarts), d[slug].lexique), slug);
    assert.equal(Object.keys(d[slug].lexique).length, 47, slug);
    assert.equal(V.vocabDuDomaine(slug).estDefaut, false, slug);
    assert.ok(typeof d[slug].description === 'string' && d[slug].description.length > 10, slug);
  }
  assert.equal(Object.keys(d.hotellerie.ecarts).length, 13);
  assert.equal(Object.keys(d.ceramique.ecarts).length, 18);
});

test('§3.1 : composants actifs de domaines.json (libellé, pluriel, type technique, genre)', () => {
  const H = V.composantsDuDomaine('hotellerie');
  const Ce = V.composantsDuDomaine('ceramique');
  assert.equal(H.length, 9);
  assert.equal(Ce.length, 6);
  for (const c of [...H, ...Ce]) {
    assert.ok(c.libelle && c.typeTechnique && ['m', 'f'].includes(c.genre) && c.actif === true, JSON.stringify(c));
    assert.ok(['activite', 'labo', 'gerant', 'acheteurs'].includes(c.typeTechnique), c.typeTechnique);
  }
  assert.ok(H.some((c) => c.libelle === 'Cuisine' && c.genre === 'f' && c.typeTechnique === 'labo'));
});

test('md5Lexique reproduit md5(lexique::text) de PostgreSQL (champ md5Lexique de domaines.json, lecture (7))', () => {
  const d = C.lireDomaines();
  for (const slug of ['hotellerie', 'ceramique']) {
    assert.match(d.domaines[slug].md5Lexique, /^[0-9a-f]{32}$/);
    assert.equal(V.md5Lexique(d.domaines[slug].ecarts), d.domaines[slug].md5Lexique, slug);
  }
  // Clés triées par longueur en octets, puis par octets ; « , » et « : » suivis d'une espace.
  assert.equal(V.jsonbTexte({ pt: { sg: 'é', g: 'f' }, a: [1, true, null] }), '{"a": [1, true, null], "pt": {"g": "f", "sg": "é"}}');
});

test('verifierLexiques signale un lexique résolu retouché à la main', () => {
  const d = JSON.parse(JSON.stringify(C.lireDomaines()));
  d.domaines.hotellerie.lexique.labo.sg = 'Cuisine';
  const problemes = V.verifierLexiques(d);
  assert.equal(problemes.length, 1);
  assert.match(problemes[0], /hotellerie : lexique résolu/);
});
