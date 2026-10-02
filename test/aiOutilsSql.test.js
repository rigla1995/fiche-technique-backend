// Outils de l'assistant get_referentiel et get_config_vente : ils lisaient des colonnes supprimées
// (articles.prix, prestataires_livraison.commission_pct) et renvoyaient une erreur SQL à chaque appel.
// Sans base de données : le pool est remplacé par un faux qui enregistre chaque requête.
//   node --test test/aiOutilsSql.test.js
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

const { executeToolCall } = require('../src/services/aiToolHandlers');

// Chaque $n employé a sa valeur, et aucune valeur n'est en trop (sinon Postgres refuse la requête).
const placeholdersCoherents = () => {
  for (const { texte, params } of requetes) {
    const indices = [...texte.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    const max = indices.length ? Math.max(...indices) : 0;
    assert.equal(params.length, max, `paramètres (${params.length}) ≠ placeholders ($${max}) : ${texte.slice(0, 120)}`);
  }
};

const appeler = async (nom, args) => {
  requetes.length = 0;
  const r = await executeToolCall(42, nom, args);
  assert.ok(!(r && r.error), `${nom} : ${r && r.error}`);
  return r;
};

test('get_referentiel : plus de colonne prix, paramètres cohérents', async () => {
  await appeler('get_referentiel', {});
  await appeler('get_referentiel', { search: 'ail', limit: 5 });
  for (const { texte } of requetes) assert.ok(!/\bi\.prix\b/.test(texte), texte.slice(0, 120));
  placeholdersCoherents();
});

for (const args of [{}, { activite_id: 7 }]) {
  test(`get_config_vente ${JSON.stringify(args)} : prestataires par activité, sans commission, paramètres cohérents`, async () => {
    const r = await appeler('get_config_vente', args);
    assert.deepEqual(Object.keys(r), ['prestataires_livraison', 'charges_fixes', 'articles_vendables']);
    assert.equal(requetes.length, 3);
    for (const { texte } of requetes) assert.ok(!/commission_pct|entreprise_prestataires/.test(texte), texte.slice(0, 120));
    assert.ok(requetes[0].texte.includes('FROM activite_prestataires ap'));
    placeholdersCoherents();
  });
}
