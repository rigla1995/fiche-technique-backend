// Lot 2c, M0 (spec §3.2, R3.2.1-R3.2.3) : instantané d'origine, lu sur les fichiers (aucune base).
// Lancer : node --test scripts/manuel/test/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../lib/commun');

const { fiches, entrees } = C.lireOrigine();

test('R3.2.2 : empreintes globales recalculées sur les fichiers = celles du 02/10', () => {
  assert.equal(C.empreinteManuel(fiches), '67737956d92ba0e1d836c17747d66f5c');
  assert.equal(C.empreinteBase(entrees), '8779fd652a4a4dd50531e9e3323aaad6');
  assert.deepEqual(C.EMPREINTES_ATTENDUES, { manuel: '67737956d92ba0e1d836c17747d66f5c', base: '8779fd652a4a4dd50531e9e3323aaad6' });
});

test('R3.2.1 : 61 fiches (60 actives, 12 parties), 32 entrées actives', () => {
  assert.equal(fiches.length, 61);
  assert.equal(fiches.filter((f) => f.actif).length, 60);
  assert.deepEqual(fiches.filter((f) => !f.actif).map((f) => f.slug), ['dashboard-gerant']);
  assert.equal(new Set(fiches.map((f) => f.partie)).size, 12);
  assert.equal(entrees.length, 32);
  assert.ok(entrees.every((e) => e.actif === true));
});

test('R3.2.1 : champs du .json d\'une fiche, dans l\'ordre de la spec', () => {
  const attendus = ['slug', 'titre', 'icone', 'partie', 'ordre', 'mots_cles', 'ecran', 'actif', 'visible_gerant', 'updated_at', 'defautNull', 'md5Garde', 'md5Contenu'];
  for (const f of fiches) {
    const json = C.lireJson(path.join(C.CHEMINS.origineManuel, `${f.slug}.json`));
    assert.deepEqual(Object.keys(json), attendus, f.slug);
    assert.match(json.updated_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/, f.slug);
  }
  for (const e of entrees) {
    const json = C.lireJson(path.join(C.CHEMINS.origineBase, `${e.fichier}.json`));
    assert.deepEqual(Object.keys(json), ['cle', 'titre', 'mots_cles', 'categorie', 'actif', 'md5Contenu'], e.fichier);
    assert.equal(json.cle, json.titre.toLowerCase(), e.fichier);
  }
});

test('R3.2.1 : 5 fiches à défaut NULL (Espace Acheteurs), md5Garde = md5Contenu partout (aucune fiche modifiée)', () => {
  assert.deepEqual(fiches.filter((f) => f.defautNull).map((f) => f.slug),
    ['acheteurs-carnet', 'acheteurs-module', 'acheteurs-portail', 'acheteurs-tarifs', 'acheteurs-ventes']);
  for (const f of fiches) {
    assert.equal(f.md5Contenu, C.md5(f.contenu), f.slug);
    assert.equal(f.md5Garde, f.md5Contenu, f.slug);
  }
});

test('R3.2.1 : nom de fichier d\'une entrée = titre translittéré ; noms uniques', () => {
  assert.equal(C.nomFichierBase('Labo central'), 'labo-central');
  assert.equal(C.nomFichierBase('TVA (HT / TTC)'), 'tva-ht-ttc');
  assert.equal(C.nomFichierBase("Famille et catégorie d'article"), 'famille-et-categorie-d-article');
  assert.equal(new Set(entrees.map((e) => e.fichier)).size, 32);
});

test('§3.8 : aucun « \\r » dans scripts/manuel/ (origine, outils, données)', () => {
  const fautifs = [];
  const parcourir = (d) => {
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, n.name);
      if (n.isDirectory()) { if (n.name !== 'rendus' && n.name !== 'node_modules') parcourir(p); continue; }
      if (fs.readFileSync(p).includes(13)) fautifs.push(path.relative(C.RACINE, p));
    }
  };
  parcourir(C.DOSSIER);
  assert.deepEqual(fautifs, []);
});

test('§0.1 : aucun « [[ », « ]] », « {{ », « $ », « \\r », espace insécable, « ’ » ni « ‹ » dans les textes d\'origine', () => {
  const interdits = ['[[', ']]', '{{', '}}', '$', '\r', '\u00a0', '’', '‹'];
  for (const f of fiches) for (const champ of ['titre', 'partie', 'contenu']) {
    for (const x of interdits) assert.ok(!String(f[champ]).includes(x), `${f.slug} › ${champ} : ${JSON.stringify(x)}`);
  }
  for (const e of entrees) for (const champ of ['titre', 'contenu']) {
    for (const x of interdits) assert.ok(!String(e[champ]).includes(x), `${e.fichier} › ${champ} : ${JSON.stringify(x)}`);
  }
});

test('lireOrigine refuse un .md retouché (md5 ≠ md5Contenu) et un « \\r »', () => {
  const os = require('os');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'origine-'));
  try {
    const ch = C.chemins(d);
    fs.mkdirSync(ch.origineManuel, { recursive: true });
    const f = fiches.find((x) => x.slug === 'support');
    const { contenu, ...meta } = f;
    C.ecrireJson(path.join(ch.origineManuel, 'support.json'), meta);
    fs.writeFileSync(path.join(ch.origineManuel, 'support.md'), `${contenu} `);
    assert.throws(() => C.lireOrigine(d), /md5 du \.md/);
    fs.writeFileSync(path.join(ch.origineManuel, 'support.md'), contenu.replace(/\n/g, '\r\n'));
    assert.throws(() => C.lireOrigine(d), /« \\r »/);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});
