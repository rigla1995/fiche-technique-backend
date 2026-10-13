// P1 « L'unité des produits utilisables » (labflow-reprise/produits-prestataires/PLAN.md §2 ligne P1, §3, §4 question 1 ;
// réponses du client du 13/10). Tests sans base : lecture de l'unité et de la quantité produite, conversion d'une unité à
// l'autre (recettes qui utilisent le produit), arrondi des recettes pour 1 unité, unité du produit en SQL, mouvements de
// stock qui figent l'unité, migration 236, et plus aucun « unité » écrit en dur pour un produit transformé.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const UP = require('../src/utils/uniteProduit');
const { uniteProduitSql, UNITE_PT_DEFAUT } = require('../src/utils/stockUtils');

const refus = (fn, code) => assert.throws(fn, (e) => e.status === 400 && e.code === code);

test('lireUniteProduit : rien de fourni, fourni, nombres en texte, incomplet', () => {
  assert.deepEqual(UP.lireUniteProduit({}), { fournie: false, uniteId: null, quantiteProduite: null });
  assert.deepEqual(UP.lireUniteProduit({ uniteId: 3, quantiteProduite: 4.6 }), { fournie: true, uniteId: 3, quantiteProduite: 4.6 });
  assert.deepEqual(UP.lireUniteProduit({ uniteId: '3', quantiteProduite: '4.6' }), { fournie: true, uniteId: 3, quantiteProduite: 4.6 });
  // Les deux vides : la demande en parle, pour dire « aucune » (refusé en modification si le produit a déjà une unité).
  assert.deepEqual(UP.lireUniteProduit({ uniteId: null, quantiteProduite: null }), { fournie: true, uniteId: null, quantiteProduite: null });
  // Quantité au millième.
  assert.equal(UP.lireUniteProduit({ uniteId: 1, quantiteProduite: 4.6004 }).quantiteProduite, 4.6);
  refus(() => UP.lireUniteProduit({ uniteId: 3 }), 'QUANTITE_PRODUITE_REQUISE');
  refus(() => UP.lireUniteProduit({ uniteId: 3, quantiteProduite: 0 }), 'QUANTITE_PRODUITE_REQUISE');
  refus(() => UP.lireUniteProduit({ uniteId: 3, quantiteProduite: -2 }), 'QUANTITE_PRODUITE_REQUISE');
  refus(() => UP.lireUniteProduit({ uniteId: 3, quantiteProduite: 0.0004 }), 'QUANTITE_PRODUITE_REQUISE');
  refus(() => UP.lireUniteProduit({ quantiteProduite: 4.6 }), 'UNITE_REQUISE');
  refus(() => UP.lireUniteProduit({ uniteId: 'kg', quantiteProduite: 4.6 }), 'UNITE_REQUISE');
});

test('facteurConversion : même matière dans la nouvelle unité (équivalence « 1 recette »)', () => {
  // Produit d'avant (1 recette) → kg, la recette fait 4,6 kg : 0,2 recette = 0,92 kg.
  const f = UP.facteurConversion({ uniteId: null, quantiteProduite: null }, { uniteId: 1, quantiteProduite: 4.6 });
  assert.equal(f, 4.6);
  assert.equal(Math.round(0.2 * f * 1e6) / 1e6, 0.92);
  // kg (4,6) → g (4 600) : × 1 000.
  assert.ok(Math.abs(UP.facteurConversion({ uniteId: 1, quantiteProduite: 4.6 }, { uniteId: 2, quantiteProduite: 4600 }) - 1000) < 1e-9);
  // kg (4,6) → pièces (10) : 0,2 kg = 0,434… pièce.
  assert.ok(Math.abs(0.2 * UP.facteurConversion({ uniteId: 1, quantiteProduite: 4.6 }, { uniteId: 6, quantiteProduite: 10 }) - 0.434782) < 1e-6);
  // Même unité, autre quantité produite : rien à convertir (des kg restent des kg).
  assert.equal(UP.facteurConversion({ uniteId: 1, quantiteProduite: 4.6 }, { uniteId: 1, quantiteProduite: 5 }), null);
  assert.equal(UP.facteurConversion({ uniteId: null }, { uniteId: null }), null);
  // Les quantités lues de la base arrivent en texte.
  assert.ok(Math.abs(UP.facteurConversion({ uniteId: 1, quantiteProduite: '4.600' }, { uniteId: 2, quantiteProduite: '4600' }) - 1000) < 1e-9);
});

test('portionsArrondies : recette pour 1 unité à 6 décimales, une quantité nulle refusée', () => {
  // 2 kg de concentré et 30 g de sel (0,030 kg) pour 4,6 kg de sauce.
  const pour1 = UP.portionsArrondies([{ ingredientId: 1, portion: 2 / 4.6 }, { ingredientId: 2, portion: 0.03 / 4.6 }], 'articles');
  assert.deepEqual(pour1.map((l) => l.portion), [0.434783, 0.006522]);
  assert.equal(pour1[0].ingredientId, 1);
  assert.deepEqual(UP.portionsArrondies(undefined, 'x'), []);
  refus(() => UP.portionsArrondies([{ ingredientId: 1, portion: 0.0000004 }], 'articles'), 'PORTION_TROP_PETITE');
  refus(() => UP.portionsArrondies([{ ingredientId: 1, portion: 0 }], 'articles'), 'PORTION_TROP_PETITE');
  assert.equal(UP.arrondi6(1 / 3), 0.333333);
});

test('uniteProduitSql : le nom de l\'unité du produit, « unité » pour un produit d\'avant', () => {
  assert.equal(UNITE_PT_DEFAUT, 'unité');
  const sql = uniteProduitSql('p');
  assert.match(sql, /u_pt\.id = p\.unite_id/);
  assert.match(sql, /'unité'\)$/);
});

test('aDesMouvements : production, réception, transfert, pertes (labo, activité) et inventaires', async () => {
  for (const table of ['stock_produits_transformes', 'stock_labo_pt_daily', 'labo_transfers', 'labo_pertes', 'pertes', 'inventaires']) {
    assert.match(UP.SQL_MOUVEMENTS, new RegExp(`FROM ${table} WHERE produit_id = \\$1`));
  }
  const db = (v) => ({ query: async (sql, p) => { assert.deepEqual(p, [42]); return { rows: [{ a_mouvements: v }] }; } });
  assert.equal(await UP.aDesMouvements(db(true), 42), true);
  assert.equal(await UP.aDesMouvements(db(false), 42), false);
});

test('migration 236 : colonnes additives, unité et quantité ensemble, recettes élargies sans échelle fixe', () => {
  const sql = lire('migrations', '236_produits_unite.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS unite_id INTEGER REFERENCES unites\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS quantite_produite NUMERIC\(12, 3\)/);
  assert.match(sql, /CHECK \(\(unite_id IS NULL\) = \(quantite_produite IS NULL\)\)/);
  assert.match(sql, /CHECK \(quantite_produite IS NULL OR quantite_produite > 0\)/);
  assert.match(sql, /ALTER TABLE produit_ingredients ALTER COLUMN portion TYPE NUMERIC;/);
  assert.match(sql, /ALTER TABLE produit_sous_produits ALTER COLUMN portion TYPE NUMERIC;/);
  assert.doesNotMatch(sql, /^\s*(UPDATE|DELETE FROM|TRUNCATE)\b|DROP (COLUMN|TABLE)/m);
});

test('plus aucun « unité » écrit en dur pour un produit transformé (stock, labo, pertes, inventaires, rapports)', () => {
  for (const f of ['stockController', 'laboController', 'pertesController', 'inventaireController', 'rapportsController', 'produitTransformeController']) {
    const src = lire('src', 'controllers', `${f}.js`);
    assert.doesNotMatch(src, /'unité'/, `${f} : « unité » écrit en dur`);
    assert.match(src, /uniteProduitSql/, `${f} : unité du produit`);
  }
});

test('produits : création, modification (unité figée, recettes converties), lecture, export, coût', () => {
  const src = lire('src', 'controllers', 'produitsController.js');
  // Création : unité lue pour un produit utilisable (l'assistant l'exige ; sans unité : compté à la recette, comme avant),
  // recette arrondie, unité du client ou commune.
  assert.match(src, /unite = type === 'utilisable' \? UP\.lireUniteProduit\(req\.body\)/);
  assert.match(src, /INSERT INTO produits \([^)]*unite_id, quantite_produite\)/);
  assert.match(src, /SELECT 1 FROM unites WHERE id = \$1 AND \(client_id IS NULL OR client_id = \$2\)/);
  // Modification : unité figée au premier mouvement (409), recettes parentes converties, unité non effaçable.
  assert.match(src, /UNITE_FIGEE/);
  assert.match(src, /UP\.aDesMouvements\(client, id\)/);
  assert.match(src, /UPDATE produit_sous_produits SET portion = GREATEST\(ROUND\(portion \* \$2::numeric, \$\{UP\.DECIMALES\}\), 0\.000001\)::float8::numeric\s+WHERE sous_produit_id = \$1/);
  assert.match(src, /'UNITE_PU_SEULEMENT'/);
  // Lecture : unité figée signalée à l'écran ; coût et fiche pour 1 unité.
  assert.match(src, /uniteFigee,/);
  assert.match(src, /unit: data\.unite \?\? null/);
  assert.match(src, /unite: detailSp\.unite \|\| UNITE_PT_DEFAUT/);
  const exp = lire('src', 'controllers', 'exportController.js');
  assert.match(exp, /COÛT TOTAL \(1 \$\{coutData\.unite\}\)/);
});

test('unités : une unité portée par un produit utilisable ne se supprime pas', () => {
  const src = lire('src', 'controllers', 'unitesController.js');
  assert.match(src, /FROM produits WHERE unite_id = \$1 AND client_id = \$2/);
  assert.match(src, /nbProduits:/);
});
