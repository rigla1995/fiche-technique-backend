// GET /api/gerant/dashboard : le filtre ?typeAppro= vient de l'URL et ne doit JAMAIS entrer dans
// le texte SQL (injection) — il passe en paramètre lié. Sans base de données : le pool est remplacé
// par un faux qui enregistre chaque requête et répond par des lignes vides.
//   node --test test/gerantDashboardSql.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const requetes = [];
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push({ texte, params });
    if (texte.includes('FROM activites a')) return { rows: [{ id: 11, nom: 'Activité test', module_vente_actif: true }] };
    if (texte.includes('FROM labos l')) return { rows: [{ id: 21, nom: 'Labo test' }] };
    return { rows: [{ count: 0, valeur: 0, ca: 0, last_date: null }] };
  },
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };

const { getDashboard } = require('../src/controllers/gerantDashboardController');

const INJECTION = "manuel' OR '1'='1";

const appeler = async (type, query) => {
  requetes.length = 0;
  const req = {
    user: { id: 5, gerant_parent_id: 2, gerant_activite_id: type === 'labo' ? 21 : 11, gerant_activite_type: type },
    query,
  };
  const res = {
    statusCode: 200,
    corps: null,
    status(code) { this.statusCode = code; return this; },
    json(corps) { this.corps = corps; return this; },
  };
  await getDashboard(req, res);
  return res;
};

// Chaque $n employé a sa valeur, et aucune valeur n'est en trop (sinon Postgres refuse la requête).
const placeholdersCoherents = () => {
  for (const { texte, params } of requetes) {
    const indices = [...texte.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    const max = indices.length ? Math.max(...indices) : 0;
    assert.equal(params.length, max, `paramètres (${params.length}) ≠ placeholders ($${max}) : ${texte.slice(0, 120)}`);
  }
};

for (const type of ['activite', 'labo']) {
  test(`${type} : typeAppro malveillant reste hors du SQL, en paramètre lié`, async () => {
    const res = await appeler(type, { year: '2026', typeAppro: INJECTION });
    assert.equal(res.statusCode, 200);
    assert.equal(res.corps.type, type);
    assert.ok(requetes.length > 0);
    for (const { texte } of requetes) {
      assert.ok(!texte.includes(INJECTION), `valeur d'URL dans le SQL : ${texte.slice(0, 160)}`);
      assert.ok(!texte.includes("'1'='1"), `valeur d'URL dans le SQL : ${texte.slice(0, 160)}`);
    }
    const filtrees = requetes.filter((r) => r.texte.includes('type_appro = $4'));
    assert.equal(filtrees.length, 2, 'KPI appros et appros mensuels filtrés');
    for (const { params } of filtrees) assert.equal(params[3], INJECTION);
    placeholdersCoherents();
  });

  test(`${type} : sans typeAppro, aucune requête n'a de 4e paramètre`, async () => {
    const res = await appeler(type, { year: '2026', month: '3' });
    assert.equal(res.statusCode, 200);
    for (const { texte, params } of requetes) {
      assert.ok(!texte.includes('$4'), texte.slice(0, 120));
      assert.ok(params.length <= 3);
    }
    placeholdersCoherents();
  });
}
