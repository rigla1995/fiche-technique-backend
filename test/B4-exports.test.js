// Lot 2b, B4 — exports Excel (stock, inventaires, pertes, ventes), données libellées et notifications
// d'inventaire écrites en base (spec docs/lot-2b-spec.md §6.2, §6.3, §6.7, §9).
// Sans base de données : le pool est remplacé par un faux ; sseService.pushTo et saveNotification sont captés.
//  - lexique par défaut : textes IDENTIQUES à l'existant (onglets, titres, en-têtes, types, catégories PT) ;
//  - Hôtellerie : termes du domaine, catégories PT traduites à l'ÉCRITURE de la cellule ;
//  - notification : même charge en base et en SSE, rendue à l'écriture avec le vocabulaire de la requête.
//   node --test test/B4-exports.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const ExcelJS = require('exceljs');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-B4-0123456789abcdef0123456789abcdef';

const reponses = [
  ['SELECT pe.client_id, l.nom as labo_nom', [{ client_id: 2, labo_nom: 'Bloc chaud' }]],
  ['SELECT pe.client_id, a.nom as activite_nom', [{ client_id: 2, activite_nom: 'Terrasse' }]],
  ['SELECT a.id FROM activites a JOIN profil_entreprise pe', [{ id: 11 }, { id: 12 }]],
  ['SELECT id, nom FROM activites WHERE id = ANY', [{ id: 11, nom: 'Terrasse' }, { id: 12, nom: 'Étages' }]],
  ['FROM stock_entreprise_daily sed', [
    { id: 1, activite_id: 11, date_appro: '2026-09-01', quantite: '3', prix_unitaire: '2', type_appro: 'manuel', ref_facture: 'F1', fournisseur_nom: 'Metro', ingredient_nom: 'Tomate', unite_nom: 'kg', categorie_nom: 'Légumes', taux_tva: null, prix_unitaire_tva: null, created_by_nom: null },
    { id: 2, activite_id: 12, date_appro: '2026-09-02', quantite: '5', prix_unitaire: '1', type_appro: 'transfert', ref_facture: null, fournisseur_nom: null, ingredient_nom: 'Oignon', unite_nom: 'kg', categorie_nom: 'Légumes', taux_tva: null, prix_unitaire_tva: null, created_by_nom: null },
    { id: 3, activite_id: 11, date_appro: '2026-09-05', quantite: '1', prix_unitaire: '6', type_appro: 'PT', ref_facture: null, fournisseur_nom: null, ingredient_nom: 'Fond brun', unite_nom: 'l', categorie_nom: 'Légumes', taux_tva: null, prix_unitaire_tva: null, created_by_nom: null },
  ]],
  ['FROM stock_produits_transformes spt', [
    { id: 101, activite_id: 11, date_appro: '2026-09-03', quantite: '2', prix_unitaire: '4', type_appro: 'produit_transforme', fournisseur_nom: null, ref_facture: null, ingredient_nom: 'Sauce maison', categorie_nom: 'Produits Transformés Utilisables', unite_nom: 'unité', taux_tva: null, prix_unitaire_tva: '4', created_by_nom: null },
  ]],
  ['FROM labos l JOIN profil_entreprise pe ON l.entreprise_id', [{ id: 21 }]],
  ['SELECT l.id FROM labos l', [{ id: 21 }]],
  ['SELECT nom FROM labos WHERE id', [{ nom: 'Bloc chaud' }]],
  ['FROM inventaires inv', [
    { id: 7, date_inventaire: '2026-09-10', quantite_reelle: '4', note: 'ok', ingredient_nom: 'Tomate', unite_nom: 'kg', categorie_nom: 'Légumes' },
    { id: 8, date_inventaire: '2026-09-11', quantite_reelle: '2', note: null, ingredient_nom: 'Sauce maison', unite_nom: 'unité', categorie_nom: 'Produits Transformés Utilisables' },
  ]],
  ['SELECT a.id, a.nom FROM activites a', [{ id: 11, nom: 'Terrasse' }]],
  ['SELECT pe.id FROM profil_entreprise pe', [{ id: 1 }]],
  ['FROM pertes p', [
    { id: 31, activite_id: 11, activite_nom: 'Terrasse', ingredient_nom: 'Tomate', unite_nom: 'kg', categorie_nom: 'Produits Composés Valorisés', quantite: '1', prix_unitaire: '2', type_perte: 'avarie', date_perte: '2026-09-12' },
  ]],
  ['FROM labo_pertes lp', [
    { id: 41, ingredient_nom: 'Tomate', unite_nom: 'kg', categorie_nom: 'Légumes', quantite: '2', prix_unitaire: '3', type_perte: 'avarie', date_perte: '2026-09-14' },
  ]],
  ['SELECT pe.client_id FROM activites a', [{ client_id: 2 }]],
  ['SELECT pe.client_id FROM labos l', [{ client_id: 2 }]],
  ['GROUP BY v.id, pl.nom', [
    { id: 51, date_vente: '2026-09-15', type_vente: 'directe', prestataire_nom: null, statut: 'confirmee', total_ca: '20', total_marge: '8' },
    { id: 52, date_vente: '2026-09-16', type_vente: 'prestataire', prestataire_nom: 'Jibli', statut: 'confirmee', total_ca: '30', total_marge: '9' },
  ]],
  ['FROM article_vendable_prix_historique h', [
    { id: 61, prix_vente: '5', saved_at: '2026-09-01T10:00:00Z', article_type: 'ingredient', produit_nom: 'Jus', is_supplement: false },
    { id: 62, prix_vente: '1', saved_at: '2026-09-02T10:00:00Z', article_type: 'produit', produit_nom: 'Sauce', is_supplement: true },
    { id: 63, prix_vente: '12', saved_at: '2026-09-03T10:00:00Z', article_type: 'produit', produit_nom: 'Burger', is_supplement: false },
  ]],
  ['FROM labo_transfers lt', [
    { id: 71, date_transfert: '2026-09-18', quantite: '3', prix_unitaire: '2', activite_nom: 'Terrasse', dest_type: 'activite', dest_nom: 'Terrasse', article_nom: 'Tomate', unite_nom: 'kg', categorie_nom: 'Légumes', valeur: '6', prix_moyen_appro: '1.5' },
    { id: 72, date_transfert: '2026-09-19', quantite: '2', prix_unitaire: '5', activite_nom: null, dest_type: 'labo', dest_nom: 'Pâtisserie', article_nom: 'Sauce maison', unite_nom: null, categorie_nom: 'Produits Transformés Utilisables', valeur: '10', prix_moyen_appro: null },
  ]],
  ['JOIN produit_activite_stock pas', [{ id: 81, nom: 'Plat composé', categorie_produit_id: 3, categorie_produit_nom: 'Plats', av_id: null, prix_vente: null, actif: null }]],
  ['INSERT INTO inventaires', [{ id: 9, ingredient_id: 4, quantite_reelle: '3', date_inventaire: '2026-09-30', note: null, created_at: '2026-09-30' }]],
];
const fauxPool = {
  query: async (sql) => {
    const t = String(sql).replace(/\s+/g, ' ');
    for (const [motif, rows] of reponses) if (t.includes(motif)) return { rows: JSON.parse(JSON.stringify(rows)) };
    return { rows: [] };
  },
  connect: async () => ({ query: fauxPool.query, release() {} }),
};
const remplacer = (chemin, exports) => {
  const p = require.resolve(chemin);
  require.cache[p] = { id: p, filename: p, loaded: true, exports, children: [], paths: [] };
};
remplacer('../src/config/database', fauxPool);
const pousses = []; const enregistrees = [];
remplacer('../src/services/sseService', { pushTo: (id, ev, charge) => pousses.push({ id, ev, charge }), pushToAdmins: () => {} });
remplacer('../src/controllers/notificationController', { saveNotification: async (id, charge) => { enregistrees.push({ id, charge }); } });

const stock = require('../src/controllers/stockController');
const inventaire = require('../src/controllers/inventaireController');
const pertes = require('../src/controllers/pertesController');
const ventes = require('../src/controllers/ventesController');
const { creerVocab, resoudreLexique } = require('../src/utils/vocab');
const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');
const ESSAIS = require('./vocab-lexiques-test.json');
const hotellerie = creerVocab(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie));

const appeler = async (h, { query = {}, params = {}, body = {}, voc, user = { id: 2, role: 'client' } } = {}) => {
  const res = new PassThrough();
  const morceaux = [];
  res.on('data', (c) => morceaux.push(c));
  res.statusCode = 200; res.entetes = {}; res.corps = null;
  res.setHeader = (k, v) => { res.entetes[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (c) => { res.corps = c; res.end(); return res; };
  const fini = new Promise((ok) => res.on('finish', ok));
  const req = { user, query, params, body };
  if (voc) req.voc = voc;
  await h(req, res);
  await fini;
  const sortie = { statut: res.statusCode, entetes: res.entetes, corps: res.corps };
  const buf = Buffer.concat(morceaux);
  if (buf.length) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    sortie.onglets = wb.worksheets.map((ws) => ws.name);
    sortie.lignes = [];
    wb.worksheets[0].eachRow((row) => {
      const vals = [];
      row.eachCell({ includeEmpty: false }, (c) => { const t = c.text; if (!vals.includes(t)) vals.push(t); });
      sortie.lignes.push(vals);
    });
  }
  return sortie;
};
const contient = (s, ...textes) => {
  const tout = s.lignes.flat();
  for (const t of textes) assert.ok(tout.includes(t), `« ${t} » absent : ${JSON.stringify(s.lignes)}`);
};
const absent = (s, ...textes) => {
  const tout = s.lignes.flat();
  for (const t of textes) assert.ok(!tout.includes(t), `« ${t} » présent`);
};

test('Historique des appros (activités) : défaut inchangé, Hôtellerie traduite', async () => {
  const d = await appeler(stock.exportHistoriqueExcel, { query: { entType: '1' } });
  assert.equal(d.statut, 200);
  assert.deepEqual(d.onglets, ['Historique Appro']);
  assert.equal(d.entetes['Content-Disposition'], `attachment; filename="Historique-Appro-${new Date().getFullYear()}.xlsx"`);
  contient(d, 'Historique des approvisionnements — Activités', 'Activités : Terrasse, Étages', 'Ingrédient', 'Activité', 'Fournisseur',
    'Manuel', 'Transfert', 'PT', 'Prod. Transformé', 'Produits Transformés Utilisables');
  const h = await appeler(stock.exportHistoriqueExcel, { query: { entType: '1' }, voc: hotellerie });
  assert.deepEqual(h.onglets, ['Historique Appro']);
  contient(h, 'Historique des approvisionnements — Services', 'Services : Terrasse, Étages', 'Fourniture', 'Service',
    'Livraison interne', 'Prépa', 'Préparation', 'Consommables');
  absent(h, 'Ingrédient', 'Activité', 'Prod. Transformé', 'Produits Transformés Utilisables', 'Transfert', 'PT');
});

test('Inventaires (labo, activité) : onglet par ongletSur, titres, en-têtes, catégorie PT', async () => {
  const dl = await appeler(inventaire.exportLaboInventaireExcel, { params: { laboId: '21' } });
  assert.deepEqual(dl.onglets, ['Inventaire Bloc chaud']);
  contient(dl, 'Historique des inventaires — Labo', 'Ingrédient', 'Labo', 'Produits Transformés Utilisables');
  const da = await appeler(inventaire.exportActiviteInventaireExcel, { params: { activiteId: '11' } });
  assert.deepEqual(da.onglets, ['Inventaire Terrasse']);
  contient(da, 'Historique des inventaires — Activités', 'Ingrédient', 'Activité');
  const hl = await appeler(inventaire.exportLaboInventaireExcel, { params: { laboId: '21' }, voc: hotellerie });
  contient(hl, 'Historique des inventaires — Cuisine', 'Fourniture', 'Cuisine', 'Consommables');
  absent(hl, 'Labo', 'Ingrédient', 'Produits Transformés Utilisables');
  const ha = await appeler(inventaire.exportActiviteInventaireExcel, { params: { activiteId: '11' }, voc: hotellerie });
  contient(ha, 'Historique des inventaires — Services', 'Service');
});

test('Pertes (activités, labo) : buildExcelPertes reçoit voc', async () => {
  const d = await appeler(pertes.exportEntreprisePertes, { query: { activiteId: '11' } });
  assert.deepEqual(d.onglets, ['Historique Pertes']);
  contient(d, 'Historique des pertes — Activités', 'Activité', 'Ingrédient', 'Produits Composés Valorisés');
  const dl = await appeler(pertes.exportLaboPerteExcel, { params: { laboId: '21' } });
  contient(dl, 'Historique des pertes — Labo', 'Bloc chaud');
  const h = await appeler(pertes.exportEntreprisePertes, { query: { activiteId: '11' }, voc: hotellerie });
  contient(h, 'Historique des pertes — Services', 'Service', 'Fourniture', 'Prestations Catalogue');
  const hl = await appeler(pertes.exportLaboPerteExcel, { params: { laboId: '21' }, voc: hotellerie });
  contient(hl, 'Historique des pertes — Cuisine');
});

test('Historique des ventes : « Directe » / « Prestataire » / « Confirmée », en-têtes', async () => {
  const d = await appeler(ventes.exportVentesExcel, { query: { activiteId: '11', selectedIds: '51' } });
  assert.deepEqual(d.onglets, ['Historique Ventes']);
  contient(d, 'Historique des ventes — Activités', 'Prestataire', 'Marge (DT)', 'Directe', 'Confirmée');
  assert.ok(d.lignes.flat().some((t) => /· 2 vente\(s\) · 1 sélectionnée\(s\) \(surlignées\)$/.test(t)));
  const h = await appeler(ventes.exportVentesExcel, { query: { activiteId: '11' }, voc: hotellerie });
  contient(h, 'Historique des ventes — Services', 'Directe', 'Prestataire', 'Confirmée');
});

test('Configuration des prix : types de ligne', async () => {
  const d = await appeler(ventes.exportPrixHistoriqueConfigExcel, { query: { activiteId: '11' } });
  contient(d, 'Produit / Supplément', 'Produit Valorisé', 'Supplément', 'Produit');
  const h = await appeler(ventes.exportPrixHistoriqueConfigExcel, { query: { activiteId: '11' }, voc: hotellerie });
  contient(h, 'Produit / Supplément', 'Prestation Catalogue');
  absent(h, 'Produit Valorisé');
});

test('Ventes du labo : onglet, titre, en-têtes, marqueur « (labo) », catégorie APRÈS le filtre', async () => {
  const d = await appeler(ventes.exportLaboVentesExcel, { query: { laboId: '21' } });
  assert.deepEqual(d.onglets, ['Ventes Labo']);
  contient(d, 'Ventes du labo — Transferts valorisés', 'Article', 'Val. transfert', 'Val. appro', 'Pâtisserie (labo)', 'Produits Transformés Utilisables');
  // Le filtre compare la valeur de l'API (libellé par défaut), même pour un compte hors restauration.
  const h = await appeler(ventes.exportLaboVentesExcel, { query: { laboId: '21', filterCategorie: 'Produits Transformés Utilisables' }, voc: hotellerie });
  assert.deepEqual(h.onglets, ['Ventes Cuisine']);
  contient(h, 'Ventes de la cuisine centrale — Livraisons internes valorisées', 'Article', 'Val. livraison interne', 'Val. appro', 'Pâtisserie (cuisine)', 'Consommables');
  absent(h, 'Tomate');
});

test('Articles valorisés : « Produits composés (labo) » (forme de l\'API inchangée)', async () => {
  const d = await appeler(ventes.getArticlesValorisés, { query: { activiteId: '11' } });
  assert.equal(d.corps[0].categorie_nom, 'Produits composés (labo)');
  assert.deepEqual(Object.keys(d.corps[0]), ['id', 'nom', 'unite_nom', 'categorie_nom', 'famille_nom', 'categorie_produit_id', 'categorie_produit_nom', 'article_type', 'compose', 'vendable']);
  const h = await appeler(ventes.getArticlesValorisés, { query: { activiteId: '11' }, voc: hotellerie });
  assert.equal(h.corps[0].categorie_nom, 'Produits composés (cuisine)');
});

for (const [nom, fn, params, attenduDefaut, attenduHotellerie] of [
  ['labo', 'saveLaboInventaire', { laboId: '21' }, 'Labo : Bloc chaud — 2026-09-30', 'Cuisine : Bloc chaud — 2026-09-30'],
  ['activité', 'saveActiviteInventaire', { activiteId: '11' }, 'Activité : Terrasse — 2026-09-30', 'Service : Terrasse — 2026-09-30'],
]) {
  test(`notification d'inventaire (${nom}) d'un gérant : rendue à l'écriture, même charge en base et en SSE`, async () => {
    const gerant = { id: 5, role: 'gerant', gerant_parent_id: 2, gerantActiviteIds: [11], gerantLaboIds: [21] };
    for (const [voc, attendu] of [[undefined, attenduDefaut], [hotellerie, attenduHotellerie]]) {
      pousses.length = 0; enregistrees.length = 0;
      const r = await appeler(inventaire[fn], { params, voc, user: gerant, body: { dateInventaire: '2026-09-30', entries: [{ ingredientId: 4, quantiteReelle: 3 }] } });
      assert.equal(r.statut, 200, JSON.stringify(r.corps));
      assert.equal(pousses.length, 1);
      assert.equal(enregistrees.length, 1);
      assert.equal(pousses[0].charge.notesAdmin, attendu);
      assert.equal(enregistrees[0].charge, pousses[0].charge);
      assert.ok(!/\[\[/.test(JSON.stringify(pousses[0].charge)), 'aucune balise en base (I7)');
    }
  });
}
