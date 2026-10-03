// Lot 2c, M0 (spec §7, §3.1) : GUIDE-BALISAGE.md porte les exemples AVANT → APRÈS rendus par le vrai moteur.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const C = require('../lib/commun');
const G = require('../lib/exemples-guide');
const { verifierBalises } = require(path.join(C.RACINE, 'src', 'utils', 'manuelRendu'));

const guide = C.lireTexte(path.join(C.DOSSIER, 'GUIDE-BALISAGE.md'));
const exemples = G.exemples();

test('chaque exemple « juste » rend l\'origine par défaut (I10) avec des balises valides (I11)', () => {
  for (const x of exemples.filter((e) => e.verdict === 'juste')) {
    assert.ok(Buffer.from(x.defaut).equals(Buffer.from(x.origine)), x.id);
    assert.deepEqual(verifierBalises(x.balise), [], x.id);
  }
  assert.ok(exemples.some((e) => e.verdict === 'faux' && !e.identique), 'un exemple faux casse l\'identité (14 faux)');
});

test('l\'origine d\'un exemple tiré du manuel ou de la base est un passage exact du texte d\'origine', () => {
  const origine = C.lireOrigine();
  const parties = C.lireParties().parties.map((p) => p.origine);
  for (const x of exemples) {
    if (x.source === 'construit') continue;
    if (x.source === 'partie') { assert.ok(parties.includes(x.origine), x.id); continue; }
    const t = G.texteSource(x.source, origine);
    assert.equal(typeof t, 'string', `${x.id} : source ${x.source} introuvable`);
    if (x.source.includes('titre/')) assert.equal(t, x.origine, x.id);
    else assert.ok(t.includes(x.origine), `${x.id} : « ${x.origine} » absent de ${x.source}`);
  }
});

test('le guide contient le tableau à jour (balisé, rendus Hôtellerie, Céramique et miroir de chaque exemple)', () => {
  for (const x of exemples) {
    for (const champ of ['balise', 'hotellerie', 'ceramique', 'miroir']) {
      assert.ok(guide.includes(G.cellule(x[champ])), `exemple ${x.id} : ${champ} absent du guide (relancer node scripts/manuel/lib/exemples-guide.js)`);
    }
  }
  assert.ok(guide.includes(G.tableMarkdown(exemples)), 'tableau des exemples du guide différent de la sortie de exemples-guide.js');
  assert.ok(guide.includes(G.tableAide()), 'aide-mémoire de la grammaire à régénérer (--guide)');
  assert.ok(guide.includes(G.tableCles()), 'tableau des 47 clés à régénérer (--guide)');
  assert.equal(G.guideAJour(guide), guide, 'node scripts/manuel/lib/exemples-guide.js --guide changerait le guide');
});

test('R3.1.1 dans le guide : exemple 8 = « Espace Cuisine » en Hôtellerie', () => {
  const ex8 = exemples.find((x) => x.id === '8');
  assert.ok(ex8.hotellerie.startsWith('| Espace Cuisine |'));
  assert.ok(guide.includes('\\| Espace Cuisine \\|'));
});

test('le guide cite les 6 types d\'exclusion et la décision du client sur « sous-produit »', () => {
  for (const type of ['homonyme', 'locution', 'nom-fige', 'capitales', 'exemple', 'glose']) assert.ok(guide.includes(`\`${type}\``), type);
  assert.match(guide, /sous-produit/);
  assert.match(guide, /décision 2 du client/);
});
