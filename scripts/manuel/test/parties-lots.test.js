// Lot 2c, M0 : parties.json (§3.3, les 12 parties balisées par l'intégrateur) et lots.json (§9.2, qui fait foi).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require('../lib/commun');
const V = require('../lib/vocabulaires');
const { rendre } = require(path.join(C.RACINE, 'src', 'utils', 'vocab'));
const { formesParDefaut, verifierBalises } = require(path.join(C.RACINE, 'src', 'utils', 'manuelRendu'));

const muet = () => {};
const { fiches, entrees } = C.lireOrigine();
const { parties } = C.lireParties();
const lots = C.lireLots().lots;

test('parties.json : les 12 parties de l\'origine, une fois chacune, dans l\'ordre du guide', () => {
  const origine = [...new Set([...fiches].sort((a, b) => a.ordre - b.ordre).map((f) => f.partie))];
  assert.deepEqual(parties.map((p) => p.origine), origine);
  for (const p of parties) {
    assert.equal(p.ordre, Math.min(...fiches.filter((f) => f.partie === p.origine).map((f) => f.ordre)), p.origine);
  }
});

test('parties.json : I10 (rendu par défaut = origine, octets), I11, aucune forme hors balise, ≤ 60 caractères', () => {
  let formes = 0;
  for (const p of parties) {
    formes += formesParDefaut(p.origine).length;
    assert.ok(Buffer.from(rendre(V.vocabDefaut, p.balisee, muet)).equals(Buffer.from(p.origine)), p.origine);
    assert.deepEqual(verifierBalises(p.balisee), [], p.origine);
    assert.deepEqual(formesParDefaut(p.balisee), [], p.origine);
    assert.ok(p.balisee.length <= 60, p.origine);
    assert.equal(C.partieBalisee(p.origine), p.balisee);
  }
  assert.equal(formes, 6, 'spec §0.1 : 6 formes dans les parties');
  assert.equal(parties.filter((p) => p.balisee.includes('[[')).length, 5, '5 parties porteuses');
});

test('parties.json : 12 rendus distincts dans chaque domaine (GuidePage regroupe par texte de partie)', () => {
  const vocs = { defaut: V.vocabDefaut, hotellerie: V.vocabDuDomaine('hotellerie'), ceramique: V.vocabDuDomaine('ceramique'), miroir: V.vocabulairesEssai().miroir };
  for (const [nom, voc] of Object.entries(vocs)) {
    const rendus = parties.map((p) => rendre(voc, p.balisee, muet));
    assert.equal(new Set(rendus).size, 12, nom);
    for (const r of rendus) assert.ok(!r.includes('[[') && !/‹[a-z0-9_]+›/.test(r), `${nom} : ${r}`);
  }
  assert.equal(rendre(V.vocabDuDomaine('ceramique'), '[[Nom:stock]] & [[Court:appro]]', muet), 'Stock & Réception');
});

test('lots.json : chaque fiche dans exactement un lot (L1 à L8), les 32 entrées dans L9', () => {
  const vues = new Map();
  for (const [lot, l] of Object.entries(lots)) for (const s of l.fiches || []) {
    assert.ok(!vues.has(s), `${s} dans ${vues.get(s)} et ${lot}`);
    vues.set(s, lot);
  }
  assert.deepEqual([...vues.keys()].sort(), fiches.map((f) => f.slug).sort());
  assert.deepEqual([...lots.L9.base].sort(), entrees.map((e) => e.fichier).sort());
  assert.deepEqual(Object.keys(lots).filter((k) => lots[k].fiches).sort(), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8']);
});

test('lots.json : formes et tailles = tableau du §9.2 (3 341 formes dans les fiches, 249 dans la base)', () => {
  const parSlug = new Map(fiches.map((f) => [f.slug, f]));
  const parFichier = new Map(entrees.map((e) => [e.fichier, e]));
  let total = 0;
  for (const [lot, l] of Object.entries(lots)) {
    if (!l.fiches && !l.base) continue;
    const textes = [...(l.fiches || []).map((s) => parSlug.get(s)), ...(l.base || []).map((f) => parFichier.get(f))];
    const formes = textes.reduce((n, x) => n + formesParDefaut(x.contenu).length + formesParDefaut(x.titre).length, 0);
    const taille = textes.reduce((n, x) => n + x.contenu.length, 0);
    assert.equal(formes, l.formes, `${lot} : formes`);
    assert.equal(taille, l.taille, `${lot} : taille`);
    if (l.fiches) total += formes;
  }
  assert.equal(total, 3341);
  assert.deepEqual(
    Object.fromEntries(Object.entries(lots).filter(([, l]) => l.formes).map(([k, l]) => [k, l.formes])),
    { L1: 398, L2: 413, L3: 421, L8: 406, L4: 448, L5: 418, L6: 413, L7: 424, L9: 249 },
  );
});

test('lots.json : vagues et relecteurs du §9.4 ; les 8 fiches des variantes sont dans la vague 1', () => {
  const vague1 = ['L1', 'L2', 'L3', 'L8'];
  for (const l of vague1) assert.equal(lots[l].vague, 1, l);
  for (const l of ['L4', 'L5', 'L6', 'L7', 'L9']) assert.equal(lots[l].vague, 2, l);
  const relecteur = Object.fromEntries(Object.entries(lots).map(([k, l]) => [k, l.relecteur]));
  assert.deepEqual(relecteur, {
    L1: 'L2', L2: 'L1', L3: 'L8', L8: 'L3',
    L4: 'L9', L5: 'L4', L6: 'L5', L7: 'L6', L9: 'L7',
    'V-H1': 'V-C1', 'V-C1': 'V-H1', 'V-H2': 'V-C2', 'V-C2': 'V-H2',
  });
  const huit = ['decouvrir-labflow', 'compte-activites-labos', 'demarrage', 'roles', 'lexique', 'lexique-pt', 'onboarding-configuration', 'calc-cout-recette'];
  for (const s of huit) assert.ok(vague1.includes(C.lotDe(s)), s);
  for (const d of ['hotellerie', 'ceramique']) {
    const v = Object.values(lots).filter((l) => l.domaine === d).flatMap((l) => l.variantes);
    assert.deepEqual(v.sort(), [...huit].sort(), d);
  }
});
