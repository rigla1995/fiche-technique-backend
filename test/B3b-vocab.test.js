// Lot 2b, B3b (produits et transferts) : vocabulaire du compte dans les messages, la liste des produits et la fiche
// technique (spec docs/lot-2b-spec.md §6.3 à §6.8, §9). Pour un compte restauration, chaque texte rendu est
// IDENTIQUE à l'existant ; hors restauration, il prend les mots du domaine (lexiques d'essai).
// Sans base de données : faux pool (même méthode que test/erreursCodees.test.js).
//   node --test test/B3b-vocab.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const ExcelJS = require('exceljs');

const RACINE = path.join(__dirname, '..');
const { vocabDefaut, creerVocab, resoudreLexique, rendre, balisesInvalides } = require('../src/utils/vocab');
const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');
const ESSAIS = JSON.parse(fs.readFileSync(path.join(RACINE, 'test/vocab-lexiques-test.json'), 'utf8'));
const VOC = {
  hotellerie: creerVocab(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie)),
  ceramique: creerVocab(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.ceramique)),
  miroir: creerVocab(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.miroir)),
};

// ── Faux pool ────────────────────────────────────────────────────────────────
const LISTE = [
  { id: 1, nom: 'Burger', type: 'vendable', is_supplement: false, ref_produit: 'B1', ingredients_count: '3', sub_products_count: '1', total_cost: '4.5', activites_json: [{ id: 1, nom: 'Terrasse' }] },
  { id: 2, nom: 'Sauce maison', type: 'vendable', is_supplement: true, ref_produit: null, ingredients_count: '1', sub_products_count: '0', total_cost: null, activites_json: [{ id: 1, nom: 'Terrasse' }, { id: 2, nom: 'Salon' }] },
];
const PRODUITS = { 5: 'Fond brun', 6: 'Roux' };
const SOUS = { 5: [{ portion: '0.3', sous_produit_id: 6, sous_produit_nom: 'Roux' }], 6: [] };
const ING = { 5: [{ portion: '0.2', ingredient_id: 11, ingredient_nom: 'Sel', unite_nom: 'kg', unite_id: 1, categorie_nom: 'Épices', prix_unitaire: '2' }], 6: [{ portion: '0.1', ingredient_id: 12, ingredient_nom: 'Farine', unite_nom: 'kg', unite_id: 1, categorie_nom: null, prix_unitaire: '1' }] };
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    const id = Number(params[0]);
    if (texte.startsWith('SELECT p.id, p.nom, p.type, p.is_supplement')) return { rows: LISTE };
    if (texte.startsWith('SELECT * FROM produits WHERE id = $1 AND client_id = $2')) return { rows: PRODUITS[id] ? [{ id, nom: PRODUITS[id] }] : [] };
    if (texte.includes('FROM produit_ingredients pi')) return { rows: ING[id] || [] };
    if (texte.includes('FROM produit_sous_produits psp')) return { rows: SOUS[id] || [] };
    if (texte.startsWith('SELECT nom FROM activites WHERE id = $1')) return { rows: [{ nom: 'Terrasse' }] };
    if (texte.startsWith('SELECT 1 FROM labos l')) return { rows: [{ '?column?': 1 }] };
    if (texte.startsWith('SELECT nom FROM labos WHERE id = $1')) return { rows: [{ nom: 'Bloc chaud' }] };
    return { rows: [] };
  },
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };

const produits = require('../src/controllers/produitsController');
const { exportExcel } = require('../src/controllers/exportController');
const transfertService = require('../src/services/transfertService');
const { UniteError } = require('../src/services/unitesOperationnellesService');

// ── 1. Messages balisés : rendu par défaut = texte de l'existant, au caractère près ───────────────────────────
const MESSAGES = [
  ['src/controllers/produitsController.js', '[[Un:supplement]] doit contenir exactement 1 élément ([[un:article]] ou [[un:produit_utilisable]]).', 'Un supplément doit contenir exactement 1 élément (un article ou un produit utilisable).'],
  ['src/controllers/produitsController.js', 'Accès non autorisé à [[ce:activite]]', 'Accès non autorisé à cette activité'],
  ['src/controllers/produitsController.js', 'Accès non autorisé à [[ce:labo]]', 'Accès non autorisé à ce labo'],
  ['src/controllers/produitsController.js', '[[Nom:produit]] introuvable', 'Produit introuvable'],
  ['src/controllers/produitsController.js', 'La catégorie [[de:produit]] est obligatoire pour [[un:produit_vendable]] ou [[un:supplement]]', 'La catégorie de produit est obligatoire pour un produit vendable ou un supplément'],
  ['src/controllers/produitsController.js', '[[Ce:produit]] est [[acc:produit:utilisé:utilisée]] comme sous-produit et ne peut pas être [[acc:produit:supprimé:supprimée]]', 'Ce produit est utilisé comme sous-produit et ne peut pas être supprimé'],
  ['src/controllers/produitsController.js', '[[Nom:ingredient]] invalide', 'Ingrédient invalide'],
  ['src/controllers/produitsController.js', '[[Nom:ingredient]] non [[acc:ingredient:trouvé:trouvée]] dans [[ce:produit]]', 'Ingrédient non trouvé dans ce produit'],
  ['src/controllers/produitsController.js', '[[Un:produit]] ne peut pas être son propre sous-produit', 'Un produit ne peut pas être son propre sous-produit'],
  ['src/controllers/produitsController.js', 'Sous-produit non trouvé dans [[ce:produit]]', 'Sous-produit non trouvé dans ce produit'],
  ['src/controllers/produitTransformeController.js', '[[Nom:produit]] introuvable ou accès refusé', 'Produit introuvable ou accès refusé'],
  ['src/controllers/produitTransformeController.js', '[[Nom:activite]] introuvable ou accès refusé', 'Activité introuvable ou accès refusé'],
  ['src/controllers/produitTransformeController.js', '[[Nom:labo]] introuvable ou accès refusé', 'Labo introuvable ou accès refusé'],
  ['src/controllers/produitTransformeController.js', "[[Ce:produit]] est [[acc:produit:fabriqué:fabriquée]] [[au:labo]] : côté [[nom:activite]] [[acc:produit:il:elle]] s'approvisionne uniquement par [[nom:transfert]], pas par [[court:appro]] [[acc:appro:manuel:manuelle]].", "Ce produit est fabriqué au labo : côté activité il s'approvisionne uniquement par transfert, pas par appro manuel."],
  ['src/controllers/produitTransformeController.js', '[[Nom:stock]] [[acc:stock:insuffisant:insuffisante]] pour "', 'Stock insuffisant pour "'],
  ['src/controllers/produitTransformeController.js', '([[court:recette]]) : disponible', '(recette) : disponible'],
  ['src/controllers/produitTransformeController.js', '[[Nom:produit]] non [[acc:produit:affecté:affectée]] à [[ce:activite]]', 'Produit non affecté à cette activité'],
  ['src/services/transfertService.js', 'Une autre opération [[de:stock]] est en cours sur [[ce:labo]] — réessayez dans un instant.', 'Une autre opération de stock est en cours sur ce labo — réessayez dans un instant.'],
  ['src/services/transfertService.js', '[[Un:labo]] ne peut pas se transférer à [[acc:labo:lui-même:elle-même]]', 'Un labo ne peut pas se transférer à lui-même'],
  ['src/services/transfertService.js', '[[acc:activite:Un:Une]] ou plusieurs [[nom:activite:pl]] invalides', 'Une ou plusieurs activités invalides'],
  ['src/services/transfertService.js', '[[acc:labo:Un:Une]] ou plusieurs [[nom:labo:pl]] destinataires ne sont pas [[acc:labo:alimentés:alimentées]] par [[ce:labo]]', 'Un ou plusieurs labos destinataires ne sont pas alimentés par ce labo'],
  ['src/services/transfertService.js', 'Vous ne pouvez modifier que [[le:transfert:pl]] que vous avez [[acc:transfert:créés:créées]]', 'Vous ne pouvez modifier que les transferts que vous avez créés'],
  ['src/services/transfertService.js', 'Les lignes [[de:stock]] de [[ce:transfert]] sont introuvables — contactez le support.', 'Les lignes de stock de ce transfert sont introuvables — contactez le support.'],
  ['src/services/transfertService.js', '[[Nom:transfert]] introuvable', 'Transfert introuvable'],
  ['src/services/transfertService.js', '[[Nom:stock]] [[acc:stock:insuffisant:insuffisante]] à la source pour augmenter [[ce:transfert]]', 'Stock insuffisant à la source pour augmenter ce transfert'],
  ['src/controllers/categoriesProduitController.js', 'Type [[de:produit]] invalide (vendable, supplement ou valorise)', 'Type de produit invalide (vendable, supplement ou valorise)'],
  ['src/services/unitesOperationnellesService.js', '[[acc:labo:Seul:Seule]] [[un:labo]] peut alimenter une unité.', 'Seul un labo peut alimenter une unité.'],
];

test('messages balisés : présents dans leur fichier, rendu par défaut identique, aucune balise invalide ni clé inconnue', () => {
  const sources = {};
  for (const [fichier, balise, attendu] of MESSAGES) {
    sources[fichier] ??= fs.readFileSync(path.join(RACINE, fichier), 'utf8');
    assert.ok(sources[fichier].includes(balise), `${fichier} : ${balise}`);
    assert.deepEqual(balisesInvalides(balise), [], balise);
    assert.equal(rendre(vocabDefaut, balise), attendu);
    for (const [nom, voc] of Object.entries(VOC)) {
      const r = rendre(voc, balise);
      assert.ok(!r.includes('[[') && !r.includes('‹'), `${nom} : ${r}`);
    }
  }
});

test('messages : rendus hors restauration (accords, pronoms, élision)', () => {
  const h = VOC.hotellerie;
  const c = VOC.ceramique;
  const m = VOC.miroir;
  assert.equal(rendre(h, '[[Un:labo]] ne peut pas se transférer à [[acc:labo:lui-même:elle-même]]'), 'Une cuisine centrale ne peut pas se transférer à elle-même');
  assert.equal(rendre(h, '[[acc:activite:Un:Une]] ou plusieurs [[nom:activite:pl]] invalides'), 'Un ou plusieurs services invalides');
  assert.equal(rendre(c, "[[Ce:produit]] est [[acc:produit:fabriqué:fabriquée]] [[au:labo]] : côté [[nom:activite]] [[acc:produit:il:elle]] s'approvisionne uniquement par [[nom:transfert]], pas par [[court:appro]] [[acc:appro:manuel:manuelle]]."),
    "Ce produit est fabriqué au site de production : côté point de vente il s'approvisionne uniquement par livraison interne, pas par réception manuelle.");
  assert.equal(rendre(m, '[[Ce:produit]] est [[acc:produit:utilisé:utilisée]] comme sous-produit et ne peut pas être [[acc:produit:supprimé:supprimée]]'),
    'Cette invention est utilisée comme sous-produit et ne peut pas être supprimée');
  assert.equal(rendre(c, '[[Un:supplement]] doit contenir exactement 1 élément ([[un:article]] ou [[un:produit_utilisable]]).'),
    'Une option doit contenir exactement 1 élément (une matière première ou un semi-fini).');
});

// ── 2. Erreurs levées (TransfertError, UniteError) ──────────────────────────────────────────────────────────
const fauxDb = (repondre) => ({ connect: async () => { throw new Error('pas de transaction attendue'); }, query: async (sql, p) => repondre(String(sql), p) });

test('createTransfert : un labo vers lui-même → DESTINATION_INVALIDE, texte rendu au bord', async () => {
  const db = fauxDb(() => ({ rows: [] }));
  await assert.rejects(
    transfertService.createTransfert(db, { sourceLaboId: 5, clientId: 2, userId: 2, dateTransfert: '2026-10-01', transfers: [{ laboDestId: 5, ingredientId: 3, quantite: 1 }] }),
    (err) => {
      assert.equal(err.code, 'DESTINATION_INVALIDE');
      assert.equal(err.status, 400);
      assert.equal(rendre(vocabDefaut, err.message), 'Un labo ne peut pas se transférer à lui-même');
      assert.equal(rendre(VOC.hotellerie, err.message), 'Une cuisine centrale ne peut pas se transférer à elle-même');
      return true;
    }
  );
});

test('createTransfert : PT non affecté (nom connu, puis repli « PT # »), variable cible balisée', async () => {
  for (const [nom, attenduDefaut, attenduHotel] of [
    ['Sauce', 'Le produit "Sauce" n\'est pas affecté à cette activité — transfert refusé.', 'Le produit "Sauce" n\'est pas affecté à ce service — livraison interne refusée.'],
    [null, 'Le produit "PT #12" n\'est pas affecté à cette activité — transfert refusé.', 'Le produit "prépa #12" n\'est pas affecté à ce service — livraison interne refusée.'],
  ]) {
    const db = fauxDb((sql) => {
      if (sql.startsWith('SELECT id FROM activites WHERE labo_id')) return { rows: [{ id: 7 }] };
      if (sql.startsWith('SELECT nom FROM produits WHERE id')) return { rows: nom ? [{ nom }] : [] };
      return { rows: [] };
    });
    await assert.rejects(
      transfertService.createTransfert(db, { sourceLaboId: 5, clientId: 2, userId: 2, dateTransfert: '2026-10-01', transfers: [{ activiteId: 7, ingredientId: -12, quantite: 1 }] }),
      (err) => {
        assert.equal(err.code, 'PT_NON_AFFECTE');
        assert.equal(rendre(vocabDefaut, err.message), attenduDefaut);
        assert.equal(rendre(VOC.hotellerie, err.message), attenduHotel);
        return true;
      }
    );
  }
});

test('UniteError SOURCE_NON_LABO : message par défaut de la table CODES, rendu au bord', () => {
  const e = new UniteError('SOURCE_NON_LABO');
  assert.equal(rendre(vocabDefaut, e.message), 'Seul un labo peut alimenter une unité.');
  assert.equal(rendre(VOC.hotellerie, e.message), 'Seule une cuisine centrale peut alimenter une unité.');
});

// ── 3. Exports Excel : classeur relu ────────────────────────────────────────────────────────────────────────
async function telecharger(handler, req) {
  const res = new PassThrough();
  const morceaux = [];
  res.on('data', (c) => morceaux.push(c));
  res.statusCode = 200;
  res.entetes = {};
  res.corps = null;
  res.setHeader = (n, v) => { res.entetes[n] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.corps = b; return res; };
  await handler(req, res);
  await new Promise((ok) => setImmediate(ok));
  assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.concat(morceaux));
  const feuilles = wb.worksheets.map((ws) => {
    const lignes = [];
    ws.eachRow((row) => { lignes.push(row.values.slice(1).map((v) => (v == null ? '' : String(v)))); });
    return { nom: ws.name, lignes, texte: lignes.map((l) => l.join(' | ')).join('\n') };
  });
  return { feuilles, entetes: res.entetes, creator: wb.creator };
}

const reqListe = (voc, query) => ({ query, user: { id: 2, role: 'client' }, ...(voc ? { voc } : {}) });

test('Liste des produits : restauration identique à l\'existant (onglets, titre, en-têtes, types, pluriels)', async () => {
  const { feuilles, entetes } = await telecharger(produits.exportListExcel, reqListe(null, { type: 'vendable', isSupplement: 'false', withOtherSubTab: 'true' }));
  assert.deepEqual(feuilles.map((f) => f.nom), ['Produits vendables', 'Suppléments vendables']);
  assert.equal(entetes['Content-Disposition'], 'attachment; filename="labflow-produits-vendables.xlsx"');
  const t = feuilles[0].texte;
  assert.match(t, /Liste des produits/);
  assert.match(t, /· 2 produits/);
  assert.match(t, /Produit \| Type \| Activités \| Référence \| Coût estimé \(DT\) \| Articles \| Produits util\./);
  assert.match(t, /Burger \| Produit vendable \| Terrasse/);
  assert.match(t, /Sauce maison \| Supplément vendable \| Salon/);
  assert.match(t, /Salon {2}— {2}1 produit\b/);
  assert.match(t, /Terrasse {2}— {2}2 produits/);
  assert.match(t, /Total : 3 produits/);
  const u = await telecharger(produits.exportListExcel, reqListe(vocabDefaut, { type: 'utilisable' }));
  assert.deepEqual(u.feuilles.map((f) => f.nom), ['Produits utilisables']);
  assert.match(u.feuilles[0].texte, /Produit \| Type \| Activités \| Référence \| Coût estimé \(DT\) \| Articles$/m);
  assert.match(u.feuilles[0].texte, /Burger \| Produit vendable/);
});

test('Liste des produits : vocabulaire du compte (Céramique, miroir)', async () => {
  const c = await telecharger(produits.exportListExcel, reqListe(VOC.ceramique, { type: 'vendable', isSupplement: 'true', withOtherSubTab: 'true' }));
  assert.deepEqual(c.feuilles.map((f) => f.nom), ['Options vendables', 'Produits finis']);
  assert.match(c.feuilles[0].texte, /Produit \| Type \| Points de vente \| Référence \| Coût estimé \(DT\) \| Matières premières \| Semi-finis/);
  assert.match(c.feuilles[0].texte, /Sauce maison \| Option vendable/);
  assert.match(c.feuilles[0].texte, /Burger \| Produit fini/);
  const m = await telecharger(produits.exportListExcel, reqListe(VOC.miroir, { type: 'vendable' }));
  assert.deepEqual(m.feuilles.map((f) => f.nom), ['Inventions vendues']);
  assert.match(m.feuilles[0].texte, /Liste des inventions/);
  assert.match(m.feuilles[0].texte, /Total : 3 inventions/);
  assert.ok(!/\bProduits?\b/.test(m.feuilles[0].texte), m.feuilles[0].texte);
});

const reqFt = (voc, query) => ({ params: { id: '5' }, query, user: { id: 2, role: 'client' }, ...(voc ? { voc } : {}) });

test('Fiche technique : restauration identique à l\'existant', async () => {
  const a = await telecharger(exportExcel, reqFt(null, { activiteId: '1' }));
  assert.deepEqual(a.feuilles.map((f) => f.nom), ['FT-Terrasse-Fond-brun']);
  assert.equal(a.entetes['Content-Disposition'], 'attachment; filename="FT-Terrasse-Fond-brun.xlsx"');
  assert.equal(a.creator, 'Fiche Technique App');
  const t = a.feuilles[0].texte;
  for (const attendu of ['Fiche technique — Fond brun', 'Activité : Terrasse', 'Désignation | Portion | Unité | Prix Unit. (DT) | Coût (DT)',
    'INGRÉDIENTS', 'PRODUITS UTILISABLES', '↳ Roux (portion : 0.3)', 'Coût ingrédients :', 'Coût produits utilisables :', 'COÛT TOTAL :']) {
    assert.ok(t.includes(attendu), `${attendu}\n${t}`);
  }
  const l = await telecharger(exportExcel, reqFt(vocabDefaut, { laboId: '3', mode: 'stock', pricingMethod: 'both' }));
  assert.deepEqual(l.feuilles.map((f) => f.nom), ['FT-Bloc-chaud-Fond-brun — DP', 'FT-Bloc-chaud-Fond-brun — PMP']);
  assert.ok(l.feuilles[0].texte.includes('Labo : Bloc chaud'));
  assert.ok(l.feuilles[0].texte.includes('Type : Stock (DP — Dernier Prix)'));
  assert.ok(l.feuilles[1].texte.includes('Type : Stock (PMP — Prix Moyen Pondéré)'));
});

test('Fiche technique : vocabulaire du compte (Hôtellerie, Céramique, miroir) ; nom de fichier inchangé', async () => {
  const h = await telecharger(exportExcel, reqFt(VOC.hotellerie, { laboId: '3' }));
  assert.deepEqual(h.feuilles.map((f) => f.nom), ['FT-Bloc-chaud-Fond-brun']);
  for (const attendu of ['Cuisine : Bloc chaud', 'COMPOSANTS', 'CONSOMMABLES', 'Coût composants :', 'Coût consommables :']) {
    assert.ok(h.feuilles[0].texte.includes(attendu), attendu);
  }
  const c = await telecharger(exportExcel, reqFt(VOC.ceramique, { activiteId: '1', mode: 'stock' }));
  assert.deepEqual(c.feuilles.map((f) => f.nom), ['FCR-Terrasse-Fond-brun']);
  assert.equal(c.entetes['Content-Disposition'], 'attachment; filename="FT-Terrasse-Fond-brun.xlsx"');
  for (const attendu of ['Fiche de coût de revient — Fond brun', 'Point de vente : Terrasse', 'Désignation | Quantité par unité | Unité', '↳ Roux (quantité par unité : 0.3)', 'SEMI-FINIS']) {
    assert.ok(c.feuilles[0].texte.includes(attendu), attendu);
  }
  const m = await telecharger(exportExcel, reqFt(VOC.miroir, { activiteId: '1', mode: 'stock' }));
  assert.deepEqual(m.feuilles.map((f) => f.nom), ['ET-Terrasse-Fond-brun']);
  assert.ok(m.feuilles[0].texte.includes('Type : Armoire (DP — Dernier Prix)'));
  assert.ok(m.feuilles[0].texte.includes('INVENTIONS UTILES'));
});
