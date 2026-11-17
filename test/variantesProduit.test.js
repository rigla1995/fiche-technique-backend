// C2 « Recette propre à un canal » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.3). Tests sans base :
// libellé et nom d'une variante, lecture de la demande, produits qui peuvent en recevoir une, migration 259, câblage.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const V = require('../src/utils/variantesProduit');

const LIEN = '3f2b6c1e-8a4d-4f0b-9c7e-1d2a3b4c5d6e';
const refus = (fn, code, status = 400) => assert.throws(fn, (e) => e.status === status && e.code === code);

test('lireLibelle : texte court, espaces ramenés à un seul', () => {
  assert.equal(V.lireLibelle('  Livraison  '), 'Livraison');
  assert.equal(V.lireLibelle('Grand   format'), 'Grand format');
  refus(() => V.lireLibelle(''), 'LIBELLE_REQUIS');
  refus(() => V.lireLibelle('   '), 'LIBELLE_REQUIS');
  refus(() => V.lireLibelle(null), 'LIBELLE_REQUIS');
  refus(() => V.lireLibelle('x'.repeat(V.LIBELLE_MAX + 1)), 'LIBELLE_TROP_LONG');
  assert.equal(V.lireLibelle('x'.repeat(V.LIBELLE_MAX)).length, V.LIBELLE_MAX);
});

test('nomVariante : « Produit — Libellé », raccourci pour tenir dans 100 caractères', () => {
  assert.equal(V.nomVariante('Pizza Margherita', 'Livraison'), 'Pizza Margherita — Livraison');
  assert.equal(V.nomVariante('  Pizza  ', 'Livraison'), 'Pizza — Livraison');
  const long = V.nomVariante('P'.repeat(98), 'Livraison');
  assert.ok(long.length <= V.NOM_MAX, `${long.length} caractères`);
  assert.ok(long.endsWith('… — Livraison'));
  assert.equal(V.nomVariante('P'.repeat(88), 'Livraison').length, 100); // 88 + 3 + 9 : tient tout juste
});

test('lireDemande : activité, libellé, canaux sans doublon', () => {
  assert.deepEqual(V.lireDemande({ activite_id: '12', libelle: ' Livraison ', canaux: [LIEN, 'directe', LIEN.toUpperCase()] }), {
    activiteId: 12, libelle: 'Livraison',
    canaux: [{ directe: false, lienId: LIEN }, { directe: true, lienId: null }],
  });
  refus(() => V.lireDemande({ libelle: 'Livraison', canaux: [LIEN] }), 'ACTIVITE_REQUISE');
  refus(() => V.lireDemande({ activite_id: 12, canaux: [LIEN] }), 'LIBELLE_REQUIS');
  refus(() => V.lireDemande({ activite_id: 12, libelle: 'Livraison', canaux: [] }), 'CANAUX_REQUIS');
  refus(() => V.lireDemande({ activite_id: 12, libelle: 'Livraison' }), 'CANAUX_REQUIS');
  refus(() => V.lireDemande({ activite_id: 12, libelle: 'Livraison', canaux: ['glovo'] }), 'CANAL_INVALIDE');
});

test('refusParent : un produit vendable d\'activité, pas déjà variante', () => {
  assert.equal(V.refusParent({ type: 'vendable', origine: 'activite', variante_de_id: null }), null);
  assert.equal(V.refusParent({ type: 'vendable' }), null); // origine absente = activité
  assert.equal(V.refusParent({ type: 'vendable', origine: 'activite', variante_de_id: 7 }).code, 'VARIANTE_DE_VARIANTE');
  assert.equal(V.refusParent({ type: 'utilisable', origine: 'activite' }).code, 'VARIANTE_IMPOSSIBLE');
  assert.equal(V.refusParent({ type: 'vendable', origine: 'labo' }).code, 'VARIANTE_IMPOSSIBLE');
});

test('migration 259 : deux colonnes, garde-fou, rejouable, rien de supprimé', () => {
  const sql = lire('migrations', '259_produits_variantes.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS variante_de_id INTEGER REFERENCES produits\(id\) ON DELETE SET NULL/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS variante_libelle VARCHAR\(40\)/);
  assert.match(sql, /IF NOT EXISTS \(SELECT 1 FROM pg_constraint WHERE conname = 'ck_produits_variante_pas_soi'\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_produits_variante_de/);
  assert.ok(!/DROP |DELETE /.test(sql.replace(/ON DELETE SET NULL/g, '')), 'la migration ne supprime rien');
});

test('câblage : route gardée comme la création d\'un produit ; suppression et renommage tiennent compte des variantes', () => {
  const routes = lire('src', 'routes', 'produits.js');
  assert.match(routes, /router\.post\('\/:id\/variantes', authenticate, requireClientOwner, requireFormulePremium, creerVariante\)/);
  const c = lire('src', 'controllers', 'produitsController.js');
  assert.match(c, /code: 'PRODUIT_A_VARIANTES'/);
  assert.ok(c.indexOf("code: 'PRODUIT_A_VARIANTES'") < c.indexOf("'DELETE FROM produits WHERE id = $1 AND client_id = $2 RETURNING id'"), 'contrôle avant la suppression');
  assert.match(c, /variantes\.renommerVariantes\(client, id, nomAvant, result\.rows\[0\]\.nom\)/);
  assert.match(c, /varianteDeId: row\.variante_de_id \|\| null/);
  assert.equal(c.split('AS variantes_count').length - 1, 2, 'liste et lecture servent le nombre de variantes');
  const s = lire('src', 'services', 'variantesProduit.js');
  assert.match(s, /INSERT INTO produit_ingredients \(produit_id, ingredient_id, portion, unite_id\)\s+SELECT \$1, ingredient_id, portion, unite_id FROM produit_ingredients WHERE produit_id = \$2/);
  assert.match(s, /INSERT INTO produit_sous_produits \(produit_id, sous_produit_id, portion\)\s+SELECT \$1, sous_produit_id, portion FROM produit_sous_produits WHERE produit_id = \$2/);
  assert.match(s, /canaux\.modifierCellules\(db, \{ activiteId, clientId, userId, cellules \}\)/);
});
