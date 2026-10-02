// Lot 2b, B3a : exports « Historique des appros du labo » et « Historique des transferts du labo »
// (laboController.js). Sans base de données : le pool est remplacé par un faux qui enregistre chaque requête.
//  - chaque $n employé a sa valeur, aucune valeur en trop (SQL modifié : marqueur « (labo) », spec §6.2) ;
//  - aucun vocabulaire dans le SQL (I8) ;
//  - lexique par défaut : textes du classeur IDENTIQUES à l'existant ; Hôtellerie : termes du domaine.
//   node --test test/B3a-exportsLabo.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const ExcelJS = require('exceljs');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-B3a-0123456789abcdef0123456789abcdef';

const requetes = [];
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push({ texte, params });
    if (texte.includes('FROM labos l JOIN profil_entreprise pe')) return { rows: [{ id: 21 }] };
    if (texte.startsWith('SELECT nom FROM labos WHERE id = $1')) return { rows: [{ nom: 'Bloc chaud' }] };
    if (texte.includes('FROM labo_transfers lt')) {
      return {
        rows: [
          { id: 1, quantite: '2', date_transfert: '2026-09-30', ingredient_nom: 'Farine', unite_nom: 'kg', categorie_nom: 'Épicerie', activite_id: null, activite_nom: null, dest_nom: 'Cuisine froide', dest_labo: true, prix_unitaire: '1', taux_tva: null, prix_unitaire_tva: null, created_by_nom: null },
          { id: 2, quantite: '1', date_transfert: '2026-09-29', ingredient_nom: 'Sauce', unite_nom: 'unité', categorie_nom: 'Produits Transformés Utilisables', activite_id: 11, activite_nom: 'Terrasse', dest_nom: 'Terrasse', dest_labo: false, prix_unitaire: '1', taux_tva: null, prix_unitaire_tva: null, created_by_nom: null },
          { id: 3, quantite: '1', date_transfert: '2026-09-28', ingredient_nom: 'Sel', unite_nom: 'kg', categorie_nom: 'Épicerie', activite_id: null, activite_nom: null, dest_nom: null, dest_labo: true, prix_unitaire: '1', taux_tva: null, prix_unitaire_tva: null, created_by_nom: null },
        ],
      };
    }
    if (texte.includes('FROM stock_labo_pt_daily slpt')) {
      return { rows: [{ id: 9, date_appro: '2026-09-27', quantite: '1', prix_unitaire: '3', ref_facture: null, type_appro: 'produit_transforme', taux_tva: null, prix_unitaire_tva: null, ingredient_nom: 'Sauce', unite_nom: 'unité', categorie_nom: 'Produits Transformés Utilisables', fournisseur_nom: 'AUTO', created_by_nom: null }] };
    }
    if (texte.includes('FROM stock_labo_daily sld')) {
      return {
        rows: [
          { id: 4, date_appro: '2026-09-30', quantite: '5', prix_unitaire: '2', ref_facture: 'F1', type_appro: 'manuel', taux_tva: '19', prix_unitaire_tva: '2.38', ingredient_nom: 'Farine', unite_nom: 'kg', categorie_nom: 'Épicerie', fournisseur_nom: 'Moulin', created_by_nom: null },
          { id: 5, date_appro: '2026-09-29', quantite: '1', prix_unitaire: '2', ref_facture: null, type_appro: 'transfert', taux_tva: null, prix_unitaire_tva: null, ingredient_nom: 'Farine', unite_nom: 'kg', categorie_nom: 'Épicerie', fournisseur_nom: 'Labo central', created_by_nom: null },
          { id: 6, date_appro: '2026-09-28', quantite: '-1', prix_unitaire: '2', ref_facture: null, type_appro: 'PT', taux_tva: null, prix_unitaire_tva: null, ingredient_nom: 'Farine', unite_nom: 'kg', categorie_nom: 'Épicerie', fournisseur_nom: 'AUTO', created_by_nom: null },
        ],
      };
    }
    throw new Error(`requête inattendue : ${texte.slice(0, 120)}`);
  },
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };

const { exportLaboHistoriqueExcel, exportLaboTransferExcel } = require('../src/controllers/laboController');
const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');
const { creerVocab, resoudreLexique } = require('../src/utils/vocab');

const ESSAIS = JSON.parse(fs.readFileSync(path.join(__dirname, 'vocab-lexiques-test.json'), 'utf8'));
const hotellerie = creerVocab(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie));

// Faux res : flux (l'export écrit le classeur dedans) + status/json/setHeader.
const fauxRes = () => {
  const res = new PassThrough();
  const morceaux = [];
  res.on('data', (m) => morceaux.push(m));
  res.fini = new Promise((ok) => res.on('end', ok));
  res.contenu = () => Buffer.concat(morceaux);
  res.statusCode = 200;
  res.corps = null;
  res.entetes = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (corps) => { res.corps = corps; res.end(); return res; };
  res.setHeader = (k, v) => { res.entetes[k.toLowerCase()] = v; };
  return res;
};

const appeler = async (handler, query, voc) => {
  requetes.length = 0;
  const res = fauxRes();
  const req = { params: { laboId: '21' }, query, user: { id: 2, role: 'client', gerant_parent_id: null } };
  if (voc) req.voc = voc;
  await handler(req, res);
  await res.fini;
  assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(res.contenu());
  const ws = wb.worksheets[0];
  const lignes = [];
  ws.eachRow({ includeEmpty: false }, (row) => lignes.push(Array.from(row.values.slice(1), (v) => (v == null ? '' : v))));
  return { res, ws, lignes };
};

// Chaque $n employé a sa valeur, et aucune valeur n'est en trop (sinon Postgres refuse la requête).
const placeholdersCoherents = () => {
  assert.ok(requetes.length > 0);
  for (const { texte, params } of requetes) {
    const indices = [...texte.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    const max = indices.length ? Math.max(...indices) : 0;
    assert.equal(params.length, max, `paramètres (${params.length}) ≠ placeholders ($${max}) : ${texte.slice(0, 120)}`);
  }
};
// I8 : ni balise, ni marqueur, ni terme rendu dans le SQL.
const sansVocabulaire = () => {
  for (const { texte } of requetes) {
    assert.ok(!texte.includes('[['), texte.slice(0, 120));
    assert.ok(!texte.includes('(labo)'), texte.slice(0, 120));
    assert.ok(!/cuisine/i.test(texte), texte.slice(0, 120));
  }
};

const ligneEnTetes = (lignes) => lignes.find((l) => l[0] === 'Date');
const lignesDonnees = (lignes) => lignes.slice(lignes.indexOf(ligneEnTetes(lignes)) + 1).filter((l) => l[0] !== 'TOTAL' && /\d\d\/\d\d\/\d{4}/.test(String(l[0])));
const textes = (lignes) => lignes.flat().map(String);

const FILTRES_TRANSFERTS = [{}, { startDate: '2026-09-01', endDate: '2026-09-30' }, { startDate: '2026-09-01', activiteId: '11' }, { endDate: '2026-09-30', laboDestId: '22' }, { activiteId: '11', laboDestId: '22' }];
const FILTRES_APPROS = [{}, { startDate: '2026-09-01', endDate: '2026-09-30', ptProduitId: '5', ptType: 'utilisable' }, { startDate: '2026-09-01', ingredientId: '3', categorieId: '4', fournisseurId: '5', refFacture: 'F' }, { ptOnly: 'true', endDate: '2026-09-30', ptProduitId: '5' }];

for (const query of FILTRES_TRANSFERTS) {
  test(`transferts ${JSON.stringify(query)} : $n cohérents, SQL sans vocabulaire`, async () => {
    for (const voc of [undefined, hotellerie]) {
      await appeler(exportLaboTransferExcel, query, voc);
      placeholdersCoherents();
      sansVocabulaire();
    }
  });
}

for (const query of FILTRES_APPROS) {
  test(`appros ${JSON.stringify(query)} : $n cohérents, SQL sans vocabulaire`, async () => {
    for (const voc of [undefined, hotellerie]) {
      await appeler(exportLaboHistoriqueExcel, query, voc);
      placeholdersCoherents();
      sansVocabulaire();
    }
  });
}

test('transferts, défaut (sans req.voc) : textes identiques à l\'existant', async () => {
  const { ws, lignes, res } = await appeler(exportLaboTransferExcel, {});
  assert.equal(ws.name, 'Hist Transferts Bloc chaud');
  assert.ok(textes(lignes).includes('Historique des transferts — Labo'));
  assert.deepEqual(ligneEnTetes(lignes).slice(0, 4), ['Date', 'Destination', 'Ingrédient', 'Catégorie']);
  const donnees = lignesDonnees(lignes);
  assert.deepEqual(donnees.map((l) => l[1]), ['Cuisine froide (labo)', 'Terrasse', '']);
  assert.equal(donnees[1][3], 'Produits Transformés Utilisables');
  assert.equal(res.entetes['content-disposition'], 'attachment; filename="Historique-Transferts-Bloc chaud.xlsx"');
});

test('transferts, Hôtellerie : termes du domaine', async () => {
  const { ws, lignes, res } = await appeler(exportLaboTransferExcel, {}, hotellerie);
  assert.equal(ws.name, 'Hist Livraisons internes Bloc c');
  assert.ok(textes(lignes).includes('Historique des livraisons internes — Cuisine'));
  assert.deepEqual(ligneEnTetes(lignes).slice(0, 4), ['Date', 'Destination', 'Fourniture', 'Catégorie']);
  const donnees = lignesDonnees(lignes);
  assert.deepEqual(donnees.map((l) => l[1]), ['Cuisine froide (cuisine)', 'Terrasse', '']);
  assert.equal(donnees[1][3], 'Consommables');
  assert.equal(res.entetes['content-disposition'], 'attachment; filename="Historique-Transferts-Bloc chaud.xlsx"');
});

test('appros, défaut (sans req.voc) : textes identiques à l\'existant', async () => {
  const { ws, lignes, res } = await appeler(exportLaboHistoriqueExcel, {});
  assert.equal(ws.name, 'Hist Appro Bloc chaud');
  assert.ok(textes(lignes).includes('Historique des approvisionnements — Labo'));
  const entetes = ligneEnTetes(lignes);
  assert.equal(entetes[1], 'Ingrédient');
  assert.equal(entetes[11], 'Fournisseur');
  const donnees = lignesDonnees(lignes);
  assert.deepEqual(donnees.map((l) => l[3]), ['Manuel', 'Transfert reçu', 'PT', 'Prod. Transformé']);
  assert.deepEqual(donnees.map((l) => l[2]), ['Épicerie', 'Épicerie', 'Épicerie', 'Produits Transformés Utilisables']);
  assert.equal(res.entetes['content-disposition'], 'attachment; filename="Historique-Labo-Bloc chaud.xlsx"');
});

test('appros, Hôtellerie : termes du domaine', async () => {
  const { ws, lignes } = await appeler(exportLaboHistoriqueExcel, {}, hotellerie);
  assert.equal(ws.name, 'Hist Appro Bloc chaud');
  assert.ok(textes(lignes).includes('Historique des approvisionnements — Cuisine'));
  const entetes = ligneEnTetes(lignes);
  assert.equal(entetes[1], 'Fourniture');
  assert.equal(entetes[11], 'Fournisseur');
  const donnees = lignesDonnees(lignes);
  assert.deepEqual(donnees.map((l) => l[3]), ['Manuel', 'Livraison interne reçue', 'Prépa', 'Préparation']);
  assert.deepEqual(donnees.map((l) => l[2]), ['Épicerie', 'Épicerie', 'Épicerie', 'Consommables']);
});
