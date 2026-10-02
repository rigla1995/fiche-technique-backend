// Lot 2b, B4 — tableaux de bord v2 et v1 : libellés hors du SQL (spec docs/lot-2b-spec.md §6.1, §6.2, §9).
// Sans base de données : le pool est remplacé par un faux qui enregistre chaque requête et répond par des
// lignes fixes. On vérifie :
//   - chaque $n employé a sa valeur et aucune n'est en trop (sinon Postgres refuse la requête) ;
//   - le repli « Prestataire » et le marqueur « (labo) » passent en paramètre PROPRE à la requête (jamais
//     dans le tableau partagé par les autres requêtes) ;
//   - aucun libellé du lexique n'est écrit dans le texte SQL des requêtes réécrites ;
//   - les libellés rendus par défaut sont ceux d'avant le lot (préfixes de catégorie, sites des pertes) ;
//   - avec le lexique Hôtellerie, les mêmes lignes portent les termes du domaine.
//   node --test test/B4-dashboardsSql.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const requetes = [];
const ligneGenerique = { count: 0, cnt: 0, valeur: 0, ca: 0, cout: 0, commission: 0, nb: 0, total: 0, qte: 0, marge: 0, cm: 0 };
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push({ texte, params });
    if (texte.includes('FROM profil_entreprise')) return { rows: [{ id: 1, module_vente_actif: true, module_acheteurs_actif: false }] };
    if (texte.startsWith('SELECT id FROM activites')) return { rows: [{ id: 11 }] };
    if (texte.startsWith('SELECT id FROM labos')) return { rows: [{ id: 21 }] };
    if (texte.startsWith('SELECT l.id FROM labos l')) return { rows: [{ id: 21 }] };
    if (texte.includes('cpn.nom AS categorie_nom')) {
      return { rows: [
        { categorie_nom: 'Burgers', categorie_type: 'vendable', ca: '40', cout: '10', commission: '0', qte: '4' },
        { categorie_nom: 'Sauces', categorie_type: 'supplement', ca: '30', cout: '5', commission: '0', qte: '3' },
        { categorie_nom: 'Jus', categorie_type: 'valorise', ca: '20', cout: '5', commission: '0', qte: '2' },
        { categorie_nom: 'Divers', categorie_type: null, ca: '15', cout: '5', commission: '0', qte: '2' },
        { categorie_nom: null, categorie_type: null, ca: '10', cout: '5', commission: '0', qte: '1' },
      ] };
    }
    if (texte.includes("'activite' AS site_type")) {
      return { rows: [
        { site: 'Terrasse', site_type: 'activite', type_perte: 'avarie', categorie: 'Viandes', article: 'Boeuf', bucket: '2026-09-01', valeur: '5' },
        { site: 'Bloc chaud', site_type: 'activite', type_perte: 'avarie', categorie: 'Viandes', article: 'Boeuf', bucket: '2026-09-01', valeur: '2' },
      ] };
    }
    if (texte.includes("'labo' AS site_type")) {
      return { rows: [{ site: 'Bloc chaud', site_type: 'labo', type_perte: 'dechet', categorie: 'Viandes', article: 'Veau', bucket: '2026-09-02', valeur: '7' }] };
    }
    return { rows: [ligneGenerique] };
  },
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };
const cheminProfil = require.resolve('../src/services/domaineProfilService');
require.cache[cheminProfil] = {
  id: cheminProfil, filename: cheminProfil, loaded: true, children: [], paths: [],
  exports: { getSeuilCoutMatiereForClient: async () => 30, getTypesPerteForClient: async () => ['avarie', 'dechet'] },
};

const { getDashboardV2 } = require('../src/controllers/dashboardV2Controller');
const { getClientDashboard, getLaboDashboard, getRapportVentes } = require('../src/controllers/dashboardController');
const { creerVocab, resoudreLexique } = require('../src/utils/vocab');
const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');
const ESSAIS = require('./vocab-lexiques-test.json');

const hotellerie = creerVocab(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie));

const appeler = async (handler, query, voc) => {
  requetes.length = 0;
  const req = { user: { id: 2, role: 'client' }, query };
  if (voc) req.voc = voc;
  const res = {
    statusCode: 200,
    corps: null,
    status(code) { this.statusCode = code; return this; },
    json(corps) { this.corps = corps; return this; },
  };
  await handler(req, res);
  return res;
};

const placeholdersCoherents = () => {
  assert.ok(requetes.length > 0);
  for (const { texte, params } of requetes) {
    const indices = [...texte.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    const max = indices.length ? Math.max(...indices) : 0;
    assert.equal(params.length, max, `paramètres (${params.length}) ≠ placeholders ($${max}) : ${texte.slice(0, 160)}`);
  }
};

// Aucun libellé du lexique écrit dans le SQL des requêtes réécrites (I8).
const LIBELLES_INTERDITS = ["'Prestataire'", "' (labo)'", "'P. Vendable / '", "'Supplément / '", "'P. Valorisé / '", "'Activité' AS", "'Labo' AS"];
const sansLibelleSql = () => {
  for (const { texte } of requetes) {
    for (const l of LIBELLES_INTERDITS) assert.ok(!texte.includes(l), `libellé ${l} dans le SQL : ${texte.slice(0, 160)}`);
  }
};

const requete = (motif) => {
  const r = requetes.filter((q) => q.texte.includes(motif));
  assert.equal(r.length, 1, `une seule requête attendue pour « ${motif} » (${r.length})`);
  return r[0];
};

// ─── Tableau de bord v2 ─────────────────────────────────────────────────────

for (const filtres of [{}, { canaux: 'prestataire' }, { canaux: 'directe', prestataires: '123e4567-e89b-12d3-a456-426614174000' }, { catProduits: '3', typesProduit: 'produit,supplement' }]) {
  test(`v2 ventes ${JSON.stringify(filtres)} : repli « Prestataire » en $n propre à la requête canal`, async () => {
    const res = await appeler(getDashboardV2, { tab: 'ventes', from: '2026-09-01', to: '2026-09-30', ...filtres });
    assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
    placeholdersCoherents();
    sansLibelleSql();
    const canal = requete('AS canal');
    assert.equal(canal.params[canal.params.length - 1], 'Prestataire');
    assert.match(canal.texte, new RegExp(`COALESCE\\(pl\\.nom, \\$${canal.params.length}\\)`));
    // Les autres requêtes ventes n'ont PAS reçu le paramètre de libellé.
    const cat = requete('cpn.nom AS categorie_nom');
    assert.equal(cat.params.length, canal.params.length - 1);
    assert.ok(!cat.params.includes('Prestataire'));
    assert.match(cat.texte, /ORDER BY SUM\(t\.ca\) DESC$/);
  });
}

test('v2 ventes : préfixes de catégorie identiques par défaut, termes du domaine en Hôtellerie', async () => {
  const defaut = await appeler(getDashboardV2, { tab: 'ventes', from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(defaut.corps.par_categorie.map((c) => c.categorie),
    ['P. Vendable / Burgers', 'Supplément / Sauces', 'P. Valorisé / Jus', 'Divers', 'Sans catégorie']);
  assert.deepEqual(Object.keys(defaut.corps.par_categorie[0]),
    ['categorie', 'ca', 'cout', 'commissions', 'qte', 'marge_brute', 'marge_apres_com', 'food_cost_pct']);
  const hot = await appeler(getDashboardV2, { tab: 'ventes', from: '2026-09-01', to: '2026-09-30' }, hotellerie);
  assert.deepEqual(hot.corps.par_categorie.map((c) => c.categorie),
    ['Prestation vendue / Burgers', 'Supplément / Sauces', 'Prestation catalogue / Jus', 'Divers', 'Sans catégorie']);
  assert.equal(requete('AS canal').params.at(-1), 'Prestataire');
  placeholdersCoherents();
});

for (const filtres of [{}, { typesPerte: 'avarie' }, { catArticles: '4', familles: '5' }]) {
  test(`v2 pertes ${JSON.stringify(filtres)} : sites en codes, regroupement code|nom, libellé après regroupement`, async () => {
    const defaut = await appeler(getDashboardV2, { tab: 'pertes', from: '2026-09-01', to: '2026-09-30', ...filtres });
    assert.equal(defaut.statusCode, 200, JSON.stringify(defaut.corps));
    placeholdersCoherents();
    sansLibelleSql();
    // « Bloc chaud » existe comme activité ET comme labo : deux lignes distinctes.
    assert.deepEqual(defaut.corps.par_site, [
      { site: 'Labo · Bloc chaud', valeur: 7 },
      { site: 'Activité · Terrasse', valeur: 5 },
      { site: 'Activité · Bloc chaud', valeur: 2 },
    ]);
    const hot = await appeler(getDashboardV2, { tab: 'pertes', from: '2026-09-01', to: '2026-09-30', ...filtres }, hotellerie);
    assert.deepEqual(hot.corps.par_site.map((s) => s.site), ['Cuisine · Bloc chaud', 'Service · Terrasse', 'Service · Bloc chaud']);
  });
}

test('v2 labo : marqueur « (labo) » en $4 propre à la requête des transferts par destination', async () => {
  const res = await appeler(getDashboardV2, { tab: 'labo', from: '2026-09-01', to: '2026-09-30' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
  placeholdersCoherents();
  sansLibelleSql();
  const dest = requete('THEN ld.nom || $4 ELSE a.nom END AS activite');
  assert.deepEqual(dest.params.slice(1), ['2026-09-01', '2026-09-30', ' (labo)']);
  await appeler(getDashboardV2, { tab: 'labo', from: '2026-09-01', to: '2026-09-30' }, hotellerie);
  assert.equal(requete('THEN ld.nom || $4 ELSE a.nom END AS activite').params[3], ' (cuisine)');
  placeholdersCoherents();
});

for (const tab of ['overview', 'achats', 'acheteurs', 'filtres']) {
  test(`v2 ${tab} : paramètres cohérents, aucun libellé du lexique dans le SQL`, async () => {
    const res = await appeler(getDashboardV2, { tab, from: '2026-09-01', to: '2026-09-30' });
    assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
    placeholdersCoherents();
    sansLibelleSql();
  });
}

// ─── Tableau de bord v1 (routes encore servies) ─────────────────────────────

test('v1 client : repli « Prestataire » en $4', async () => {
  const res = await appeler(getClientDashboard, { from: '2026-09-01', to: '2026-09-30' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
  placeholdersCoherents();
  sansLibelleSql();
  assert.deepEqual(requete('AS canal').params.slice(1), ['2026-09-01', '2026-09-30', 'Prestataire']);
});

test('v1 labo : marqueur « (labo) » en $4', async () => {
  const res = await appeler(getLaboDashboard, { laboId: '21', from: '2026-09-01', to: '2026-09-30' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
  placeholdersCoherents();
  sansLibelleSql();
  assert.deepEqual(requete('THEN ld.nom || $4 ELSE a.nom END AS activite').params, [21, '2026-09-01', '2026-09-30', ' (labo)']);
  await appeler(getLaboDashboard, { laboId: '21', from: '2026-09-01', to: '2026-09-30' }, hotellerie);
  assert.equal(requete('THEN ld.nom || $4 ELSE a.nom END AS activite').params[3], ' (cuisine)');
});

for (const query of [{}, { canal: 'prestataire' }, { categorieId: '7' }]) {
  test(`v1 rapport ventes ${JSON.stringify(query)} : repli « Prestataire » en $n propre à la requête canal`, async () => {
    const res = await appeler(getRapportVentes, { from: '2026-09-01', to: '2026-09-30', ...query });
    assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
    placeholdersCoherents();
    sansLibelleSql();
    const canal = requete('AS canal');
    assert.equal(canal.params.at(-1), 'Prestataire');
    for (const autre of requetes.filter((q) => q !== canal)) assert.ok(!autre.params.includes('Prestataire'));
  });
}
