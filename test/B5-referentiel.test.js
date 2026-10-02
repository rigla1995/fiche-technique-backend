// Lot 2b, B5 — import du référentiel (spec docs/lot-2b-spec.md §6.3, §11.1.6).
// Sans base de données : le pool est remplacé par un faux qui enregistre chaque requête.
//   node --test test/B5-referentiel.test.js
//
// 1. Modèle d'import : par défaut, onglet, titre, sous-titre, en-têtes et ligne d'exemple identiques à
//    l'existant ; en Hôtellerie, en-tête « Fourniture » et exemples neutres (préfixe « Exemple : » gardé).
// 2. Lecteur à 3 replis (15 premières lignes, sans casse) : en-têtes du domaine, puis par défaut (ancien
//    modèle « Article »), puis colonne 1 renommée ; sans en-tête reconnu, ligne 1 comme avant.
// 3. Aucune ligne parasite : ni le bandeau, ni la ligne d'en-têtes, ni la ligne d'exemple ne sont importés.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const ExcelJS = require('exceljs');

const RACINE = path.resolve(__dirname, '..');
const ESSAIS = JSON.parse(fs.readFileSync(path.join(RACINE, 'test/vocab-lexiques-test.json'), 'utf8'));

// ── Faux pool : aucune entreprise (pas d'affectation automatique), tout est créé ─────────────────
const requetes = [];
const normal = (sql) => String(sql).replace(/\s+/g, ' ').trim();
const repondre = async (sql, params = []) => {
  const texte = normal(sql);
  requetes.push({ texte, params });
  if (texte.startsWith('SELECT id FROM profil_entreprise')) return { rows: [] };
  if (texte.startsWith('INSERT INTO familles')) return { rows: [{ id: 1 }] };
  if (texte.startsWith('INSERT INTO categories')) return { rows: [{ id: 2, inserted: true }] };
  if (texte.startsWith('INSERT INTO unites')) return { rows: [{ id: 3 }] };
  if (texte.startsWith('INSERT INTO articles')) return { rows: [{ id: 4 }] };
  return { rows: [] };
};
const fauxPool = {
  query: repondre,
  connect: async () => ({ query: repondre, release: () => {} }),
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };

const { vocabDefaut, vocabDuLexique } = require('../src/utils/vocab');
const { brandTemplate } = require('../src/services/excelBrandService');
const { getTemplate, importReferentiel } = require('../src/controllers/referentielController');

const VOC = { defaut: vocabDefaut, hotellerie: vocabDuLexique(ESSAIS.hotellerie), miroir: vocabDuLexique(ESSAIS.miroir) };

// Chaque $n employé a sa valeur, et aucune valeur n'est en trop.
const placeholdersCoherents = () => {
  for (const { texte, params } of requetes) {
    const indices = [...texte.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    const max = indices.length ? Math.max(...indices) : 0;
    assert.equal(params.length, max, `paramètres (${params.length}) ≠ placeholders ($${max}) : ${texte.slice(0, 120)}`);
  }
};

// GET /api/referentiel/template → classeur relu.
const modele = async (voc) => {
  const flux = new PassThrough();
  const morceaux = [];
  flux.on('data', (m) => morceaux.push(m));
  flux.setHeader = () => {};
  flux.status = () => flux;
  flux.json = (corps) => { throw new Error(`réponse JSON inattendue : ${JSON.stringify(corps)}`); };
  const fini = new Promise((ok) => flux.on('end', ok));
  await getTemplate({ voc, user: { id: 7 } }, flux);
  await fini;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.concat(morceaux));
  return wb;
};

const lignesTexte = (ws) => {
  const out = [];
  ws.eachRow((row, n) => { out.push({ n, cellules: [1, 2, 3, 4].map((i) => String(row.getCell(i).text || '')) }); });
  return out;
};

// POST /api/referentiel/import avec ce classeur, vocabulaire du compte `voc`.
const importer = async (wb, voc) => {
  requetes.length = 0;
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const req = { file: { buffer }, voc, user: { id: 7 } };
  const res = {
    statusCode: 200,
    corps: null,
    status(code) { this.statusCode = code; return this; },
    json(corps) { this.corps = corps; return this; },
  };
  await importReferentiel[1](req, res);
  placeholdersCoherents();
  return res;
};

// Classeur au gabarit de marque (bandeau au-dessus des en-têtes, ligne d'exemple), puis les données.
const DONNEES = [['Farine T55', 'kg', 'Épicerie', 'Sec'], ['Lait entier', 'L', 'Crèmerie', 'Frais']];
const classeurMarque = (enTetes, exemple) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Feuille');
  const idx = brandTemplate(wb, ws, { titre: "Modèle d'import — Référentiel", sousTitre: 'Bandeau', meta: 'Méta', headers: enTetes, widths: [28, 16, 22, 22], exemple });
  DONNEES.forEach((d, i) => { ws.getRow(idx + 2 + i).values = d; });
  return wb;
};
const nomsImportes = (res) => res.corps.details.map((d) => d.article);

test('modèle par défaut : identique à l\'existant (onglet, titre, sous-titre, en-têtes, exemple)', async () => {
  const wb = await modele(undefined);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Référentiel']);
  const lignes = lignesTexte(wb.worksheets[0]);
  const textes = lignes.map((l) => l.cellules[0]);
  assert.ok(textes.includes("Modèle d'import — Référentiel"));
  assert.ok(textes.includes('Ajout dynamique des articles : une ligne = un article'));
  const iEnTetes = lignes.findIndex((l) => l.cellules.join('|') === 'Article|Unité|Catégorie|Famille');
  assert.ok(iEnTetes >= 0, 'en-têtes par défaut');
  assert.deepEqual(lignes[iEnTetes + 1].cellules, ['Exemple : Poulet rôti', 'kg', 'Viandes', 'Food']);
});

test('modèle Hôtellerie : terme du domaine, exemples neutres, préfixe « Exemple : » gardé', async () => {
  const wb = await modele(VOC.hotellerie);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Référentiel']);
  const lignes = lignesTexte(wb.worksheets[0]);
  const textes = lignes.map((l) => l.cellules[0]);
  assert.ok(textes.includes('Ajout dynamique des fournitures : une ligne = une fourniture'));
  const iEnTetes = lignes.findIndex((l) => l.cellules.join('|') === 'Fourniture|Unité|Catégorie|Famille');
  assert.ok(iEnTetes >= 0, 'en-têtes du domaine');
  assert.deepEqual(lignes[iEnTetes + 1].cellules, ['Exemple : Fourniture A', 'kg', 'Catégorie A', 'Famille A']);
});

test('modèle miroir : onglet et titre au terme du domaine', async () => {
  const wb = await modele(VOC.miroir);
  const nom = wb.worksheets[0].name;
  assert.notEqual(nom, 'Référentiel');
  assert.equal(nom, VOC.miroir.Court('referentiel'));
  const textes = lignesTexte(wb.worksheets[0]).map((l) => l.cellules[0]);
  assert.ok(textes.includes(`Modèle d'import — ${VOC.miroir.Court('referentiel')}`));
});

for (const [nomVoc, voc] of Object.entries(VOC)) {
  test(`${nomVoc} : le modèle du domaine se réimporte sans ligne parasite`, async () => {
    const wb = await modele(voc);
    const ws = wb.worksheets[0];
    const derniere = ws.rowCount;
    DONNEES.forEach((d, i) => { ws.getRow(derniere + 1 + i).values = d; });
    const res = await importer(wb, voc);
    assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
    assert.deepEqual(nomsImportes(res), DONNEES.map((d) => d[0]));
    assert.equal(res.corps.stats.articles, 2);
  });

  test(`${nomVoc} : ancien modèle « Article » (en-têtes par défaut) reconnu`, async () => {
    const res = await importer(classeurMarque(['Article', 'Unité', 'Catégorie', 'Famille'], ['Exemple : Poulet rôti', 'kg', 'Viandes', 'Food']), voc);
    assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
    assert.deepEqual(nomsImportes(res), DONNEES.map((d) => d[0]));
  });

  test(`${nomVoc} : colonne 1 renommée (sans casse) reconnue, bandeau non importé`, async () => {
    const res = await importer(classeurMarque(['Désignation', 'UNITÉ', 'catégorie', 'Famille'], ['Exemple : Truc', 'kg', 'X', 'Y']), voc);
    assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
    assert.deepEqual(nomsImportes(res), DONNEES.map((d) => d[0]));
  });
}

test('modèle d\'un autre domaine (« Fourniture ») importé par un compte restauration : 3e repli', async () => {
  const wb = await modele(VOC.hotellerie);
  const ws = wb.worksheets[0];
  const derniere = ws.rowCount;
  DONNEES.forEach((d, i) => { ws.getRow(derniere + 1 + i).values = d; });
  const res = await importer(wb, vocabDefaut);
  assert.deepEqual(nomsImportes(res), DONNEES.map((d) => d[0]));
});

test('sans en-tête reconnu : la ligne 1 reste l\'en-tête (comportement existant)', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Feuille');
  ws.getRow(1).values = ['Nom', 'U', 'Cat', 'Fam'];
  DONNEES.forEach((d, i) => { ws.getRow(2 + i).values = d; });
  const res = await importer(wb, VOC.hotellerie);
  assert.deepEqual(nomsImportes(res), DONNEES.map((d) => d[0]));
});

test('jetons de details : codes inchangés quel que soit le domaine', async () => {
  const res = await importer(classeurMarque(['Article', 'Unité', 'Catégorie', 'Famille'], ['Exemple : Poulet rôti', 'kg', 'Viandes', 'Food']), VOC.miroir);
  for (const d of res.corps.details) {
    assert.deepEqual(d.created, ['famille', 'catégorie', 'unité', 'article']);
  }
});
