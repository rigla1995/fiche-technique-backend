// GET /api/rapports/filters : les catégories renvoyées sont celles du compte seulement.
// Avant le correctif, la requête lisait la table categories sans filtre (catégories de tous les comptes).
// Sans base de données : le pool est remplacé par un faux qui enregistre chaque requête.
//   node --test test/rapportsFiltres.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const requetes = [];
const fauxPool = {
  query: async (sql, params = []) => {
    requetes.push({ texte: String(sql).replace(/\s+/g, ' ').trim(), params });
    return { rows: [] };
  },
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };

const { getRapportFilters } = require('../src/controllers/rapportsController');

test('les catégories sont filtrées par le compte, comme les fournisseurs et les activités', async () => {
  const res = { statusCode: 200, corps: null, status(c) { this.statusCode = c; return this; }, json(b) { this.corps = b; return this; } };
  await getRapportFilters({ user: { id: 5, role: 'client' }, query: {} }, res);
  assert.equal(res.statusCode, 200);
  const cat = requetes.find((r) => r.texte.includes('FROM categories'));
  assert.ok(cat, 'requête des catégories');
  assert.match(cat.texte, /WHERE client_id = \$1/);
  assert.deepEqual(cat.params, [5]);
  for (const { texte, params } of requetes) {
    const max = Math.max(0, ...[...texte.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    assert.equal(params.length, max, texte.slice(0, 100));
  }
});
