// Erreurs reconnues par leur CODE, jamais par leur texte (spec docs/lot-2b-spec.md §5.2) : un texte balisé n'est
// jamais comparé. Les 4 throw de calculerCout / calculerCoutAvecPrixMap portent PRODUIT_INTROUVABLE ou
// REFERENCE_CIRCULAIRE ; les 5 catch (getCout, getFtContextes, exportExcel) lisent ce code. Statuts et corps
// inchangés : 404 « Produit introuvable », 400 « Référence circulaire détectée dans les sous-produits ».
// Sans base de données : faux pool (produit 99 absent ; produit 1 sous-produit de lui-même ; 2 → 3 → 2).
//   node --test test/erreursCodees.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const PRODUITS = new Set([1, 2, 3, 4]);
const SOUS = { 1: [1], 2: [3], 3: [2], 4: [99] };
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    const id = Number(params[0]);
    if (texte.startsWith('SELECT * FROM produits WHERE id = $1 AND client_id = $2')
      || texte.startsWith('SELECT id, nom, origine FROM produits WHERE id = $1')) {
      return { rows: PRODUITS.has(id) ? [{ id, nom: `Produit ${id}`, origine: 'activite' }] : [] };
    }
    if (texte.includes('FROM produit_sous_produits psp')) {
      return { rows: (SOUS[id] || []).map((s) => ({ portion: '1', sous_produit_id: s, sous_produit_nom: `Produit ${s}` })) };
    }
    return { rows: [] };
  },
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };

const produits = require('../src/controllers/produitsController');
const { exportExcel } = require('../src/controllers/exportController');

const INTROUVABLE = { code: 'PRODUIT_INTROUVABLE', message: 'Produit introuvable' };
const CIRCULAIRE = { code: 'REFERENCE_CIRCULAIRE', message: 'Référence circulaire détectée dans les sous-produits' };

test('calculerCout lève avec un code (introuvable, circulaire direct et indirect, sous-produit absent)', async () => {
  await assert.rejects(produits.calculerCout(99, 2), INTROUVABLE);
  await assert.rejects(produits.calculerCout(1, 2), CIRCULAIRE);
  await assert.rejects(produits.calculerCout(2, 2), CIRCULAIRE);
  await assert.rejects(produits.calculerCout(4, 2), INTROUVABLE);
});

test('calculerCoutAvecPrixMap lève avec un code', async () => {
  await assert.rejects(produits.calculerCoutAvecPrixMap(99, 2, {}), INTROUVABLE);
  await assert.rejects(produits.calculerCoutAvecPrixMap(1, 2, {}), CIRCULAIRE);
  await assert.rejects(produits.calculerCoutAvecPrixMap(3, 2, {}), CIRCULAIRE);
});

const fausseReponse = () => ({
  statusCode: 200,
  corps: null,
  entetes: {},
  status(code) { this.statusCode = code; return this; },
  json(corps) { this.corps = corps; return this; },
  setHeader(nom, valeur) { this.entetes[nom] = valeur; },
  end() {},
});

async function appeler(handler, id, query = {}) {
  const res = fausseReponse();
  const original = console.error;
  const journal = [];
  console.error = (...a) => { journal.push(a); };
  try {
    await handler({ params: { id: String(id) }, query, user: { id: 2, role: 'client' } }, res);
  } finally {
    console.error = original;
  }
  return { statut: res.statusCode, corps: res.corps, journal };
}

const ATTENDU_404 = { statut: 404, corps: { message: 'Produit introuvable' }, journal: [] };
const ATTENDU_400 = { statut: 400, corps: { message: 'Référence circulaire détectée dans les sous-produits' }, journal: [] };

test('getCout : 404 et 400 inchangés, quel que soit le mode', async () => {
  for (const query of [{}, { mode: 'manual' }, { mode: 'stock', activiteId: '5' }]) {
    assert.deepEqual(await appeler(produits.getCout, 99, query), ATTENDU_404, JSON.stringify(query));
    assert.deepEqual(await appeler(produits.getCout, 1, query), ATTENDU_400, JSON.stringify(query));
    assert.deepEqual(await appeler(produits.getCout, 4, query), ATTENDU_404, `sous-produit absent ${JSON.stringify(query)}`);
  }
});

test('getFtContextes : 400 inchangé sur une référence circulaire', async () => {
  assert.deepEqual(await appeler(produits.getFtContextes, 1), ATTENDU_400);
  assert.deepEqual(await appeler(produits.getFtContextes, 2), ATTENDU_400);
  assert.deepEqual(await appeler(produits.getFtContextes, 99), ATTENDU_404, 'garde 404 propre, avant le calcul');
});

test('exportExcel (fiche technique) : 404 et 400 inchangés', async () => {
  for (const query of [{}, { mode: 'manual' }, { mode: 'stock', activiteId: '5' }, { mode: 'stock', pricingMethod: 'both', activiteId: '5' }]) {
    assert.deepEqual(await appeler(exportExcel, 99, query), ATTENDU_404, JSON.stringify(query));
    assert.deepEqual(await appeler(exportExcel, 1, query), ATTENDU_400, JSON.stringify(query));
  }
});

test('une autre erreur reste un 500, même si son texte contient « circulaire » ou vaut « Produit introuvable »', async () => {
  const query = fauxPool.query;
  try {
    for (const message of ['circulaire', 'Produit introuvable']) {
      fauxPool.query = async () => { throw new Error(message); };
      const r = await appeler(produits.getCout, 1);
      assert.equal(r.statut, 500, message);
      assert.deepEqual(r.corps, { message: 'Erreur serveur' });
      const e = await appeler(exportExcel, 1);
      assert.equal(e.statut, 500, message);
      assert.deepEqual(e.corps, { message: 'Erreur lors de la génération du fichier Excel' });
    }
  } finally {
    fauxPool.query = query;
  }
});
