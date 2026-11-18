// V1a « Importer un fichier de caisse » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis). Tests sans
// base : clés d'apprentissage, contrôle du corps envoyé par l'écran (répartition par canal, catégorie de livraison),
// prix d'une ligne importée, ventes par canal, migration 262 et câblage (service partagé avec la saisie, routes, règle).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const VI = require('../src/utils/ventesImport');

const LIEN_A = '11111111-1111-4111-8111-111111111111';
const LIEN_B = '22222222-2222-4222-8222-222222222222';
const EMPREINTE = 'a'.repeat(64);
const ligne = (plus = {}) => ({
  categorie: 'MENU PRINCIPAL', designation: 'PIZZA REINE', quantite: 10, montant: 200, article_type: 'produit', article_id: 7,
  repartition: [{ canal: 'directe', quantite: 10 }], ...plus,
});
const corps = (plus = {}) => ({
  date_vente: '2026-11-05', source: 'excel', empreinte: EMPREINTE, fichier_nom: 'caisse.xlsx',
  categories: [{ nom: 'MENU PRINCIPAL', livraison: false }, { nom: 'DELIVERY', livraison: true }], lignes: [ligne()], ...plus,
});
const refus = (fn, code) => assert.throws(fn, (e) => e instanceof VI.ErreurImport && e.status === 400 && e.code === code, code);
const lu = (plus) => VI.lireImport(corps(plus), '2026-11-18');

test('clés : la catégorie entre dans la clé d\'une ligne ; casse et accents ne comptent pas', () => {
  assert.equal(VI.cleCategorie(' Delivery '), 'delivery');
  assert.equal(VI.cleCategorie('MENU  PRINCIPAL'), 'menu principal');
  assert.equal(VI.cleCategorie(null), '');
  // Le même plat dans deux cartes du fichier : deux clés (la désignation seule les confondrait).
  assert.equal(VI.cleCorrespondance('DELIVERY', 'Tajine de bœuf'), 'delivery|tajine de boeuf');
  assert.equal(VI.cleCorrespondance('MENU PRINCIPAL', 'TAJINE DE BOEUF'), 'menu principal|tajine de boeuf');
  assert.equal(VI.cleCorrespondance(null, 'Soda 0,33L'), '|soda 0,33l');
  assert.ok(VI.cleCorrespondance('x'.repeat(200), 'y'.repeat(400)).length <= 330);
});

test('lireImport : un corps juste ; le total enregistré ne compte pas les lignes ignorées', () => {
  const d = lu({ total_lu: '663,1', lignes: [
    ligne(),
    ligne({ categorie: 'DELIVERY', designation: ' Pizza   reine ', quantite: 16, montant: 400, repartition: [{ canal: LIEN_A.toUpperCase(), quantite: 12 }, { canal: LIEN_B, quantite: 4 }] }),
    { categorie: 'MENU PRINCIPAL', designation: 'Service', quantite: 1, montant: 2, ignoree: true },
  ] });
  assert.equal(d.dateVente, '2026-11-05');
  assert.equal(d.totalLu, 663.1);
  assert.equal(d.totalEnregistre, 600);
  assert.equal(d.lignes.length, 3);
  assert.deepEqual(d.lignes[1], { rang: 2, categorie: 'DELIVERY', designation: 'Pizza reine', quantite: 16, montant: 400, ignoree: false, articleType: 'produit', articleId: 7,
    repartition: [{ canal: LIEN_A, quantite: 12 }, { canal: LIEN_B, quantite: 4 }] });
  assert.deepEqual(d.lignes[2], { rang: 3, categorie: 'MENU PRINCIPAL', designation: 'Service', quantite: 1, montant: 2, ignoree: true, articleType: null, articleId: null, repartition: [] });
  assert.deepEqual(d.categories, [{ cle: 'menu principal', nom: 'MENU PRINCIPAL', livraison: false }, { cle: 'delivery', nom: 'DELIVERY', livraison: true }]);
  // Sans catégorie, sans total lu : accepté (un fichier peut n'avoir ni l'un ni l'autre).
  const simple = lu({ categories: undefined, lignes: [ligne({ categorie: null })] });
  assert.equal(simple.totalLu, null);
  assert.deepEqual(simple.categories, []);
});

test('lireImport : date, source, empreinte, lignes', () => {
  refus(() => lu({ date_vente: '05/11/2026' }), 'DATE_INVALIDE');
  refus(() => lu({ date_vente: '2026-02-30' }), 'DATE_INVALIDE');
  refus(() => lu({ date_vente: '2026-11-20' }), 'DATE_FUTURE');
  assert.equal(lu({ date_vente: '2026-11-19' }).dateVente, '2026-11-19'); // un jour d'avance toléré (fuseau)
  refus(() => lu({ source: 'photo' }), 'SOURCE_INVALIDE');
  refus(() => lu({ empreinte: 'abc' }), 'EMPREINTE_INVALIDE');
  refus(() => lu({ lignes: [] }), 'LIGNES_REQUISES');
  refus(() => lu({ lignes: [{ designation: 'Service', quantite: 1, montant: 2, ignoree: true }] }), 'LIGNES_REQUISES');
  refus(() => lu({ lignes: new Array(VI.LIGNES_MAX + 1).fill(ligne()) }), 'LIGNES_TROP');
  refus(() => lu({ lignes: [ligne({ designation: '  ' })] }), 'LIGNE_INVALIDE');
  refus(() => lu({ lignes: [ligne({ quantite: 0 })] }), 'LIGNE_INVALIDE');
  refus(() => lu({ lignes: [ligne({ montant: -1 })] }), 'LIGNE_INVALIDE');
  refus(() => lu({ lignes: [ligne({ article_id: undefined })] }), 'PRODUIT_REQUIS');
  refus(() => lu({ lignes: [ligne({ article_type: 'vente' })] }), 'PRODUIT_REQUIS');
  refus(() => lu({ total_lu: 'beaucoup' }), 'TOTAL_INVALIDE');
});

test('lireImport : la répartition par canal égale la quantité du fichier ; livraison = prestataires seulement', () => {
  refus(() => lu({ lignes: [ligne({ repartition: [] })] }), 'REPARTITION_INVALIDE');
  refus(() => lu({ lignes: [ligne({ repartition: [{ canal: 'directe', quantite: 9 }] })] }), 'REPARTITION_INVALIDE');
  refus(() => lu({ lignes: [ligne({ repartition: [{ canal: 'directe', quantite: 6 }, { canal: 'directe', quantite: 4 }] })] }), 'REPARTITION_INVALIDE');
  refus(() => lu({ lignes: [ligne({ repartition: [{ canal: 'directe', quantite: 10 }, { canal: LIEN_A, quantite: 0 }] })] }), 'REPARTITION_INVALIDE');
  refus(() => lu({ lignes: [ligne({ repartition: [{ canal: 'glovo', quantite: 10 }] })] }), 'CANAL_INVALIDE');
  // Le reste en vente directe : 100 vendus, 36 chez un prestataire, 14 chez l'autre, 50 en direct (exemple du client).
  const d = lu({ lignes: [ligne({ quantite: 100, montant: 2000, repartition: [{ canal: LIEN_A, quantite: 36 }, { canal: LIEN_B, quantite: 14 }, { canal: 'directe', quantite: 50 }] })] });
  assert.equal(d.lignes[0].repartition.length, 3);
  // Catégorie de livraison : rien en vente directe (la casse du nom ne compte pas).
  refus(() => lu({ lignes: [ligne({ categorie: 'Delivery', repartition: [{ canal: 'directe', quantite: 1 }, { canal: LIEN_A, quantite: 9 }] })] }), 'LIVRAISON_SANS_DIRECTE');
  assert.equal(lu({ lignes: [ligne({ categorie: 'Delivery', repartition: [{ canal: LIEN_A, quantite: 10 }] })] }).lignes[0].repartition[0].canal, LIEN_A);
  // Une ligne ignorée d'une catégorie de livraison n'a pas à être répartie.
  assert.equal(lu({ lignes: [ligne(), { categorie: 'DELIVERY', designation: 'Frais', quantite: 1, montant: 3, ignoree: true }] }).lignes[1].ignoree, true);
  // Quantités décimales (au millime).
  assert.equal(lu({ lignes: [ligne({ quantite: 2.5, repartition: [{ canal: 'directe', quantite: 1.25 }, { canal: LIEN_A, quantite: 1.25 }] })] }).lignes[0].quantite, 2.5);
});

test('prix d\'une ligne importée : montant ÷ quantité, le chiffre retombe sur celui du fichier au millime', () => {
  assert.equal(VI.prixUnitaire(400, 16), 25);
  assert.equal(VI.prixUnitaire(145.62, 7), 20.802857);
  assert.equal(VI.millime(7 * VI.prixUnitaire(145.62, 7)), 145.62);
  assert.equal(VI.millime(5 * VI.prixUnitaire(94.38, 5)), 94.38);
  // Répartie entre trois canaux, la ligne garde son chiffre.
  const p = VI.prixUnitaire(61.1, 7);
  assert.equal(VI.millime(3 * p + 2 * p + 2 * p), 61.1);
  for (const [montant, quantite] of [[999.999, 997], [0.001, 3], [12345.678, 13]]) {
    assert.ok(Math.abs(quantite * VI.prixUnitaire(montant, quantite) - montant) < 0.0005, `${montant} ÷ ${quantite}`);
  }
});

test('ventesParCanal : une vente par canal, la vente directe d\'abord, les lignes ignorées écartées', () => {
  const d = lu({ lignes: [
    ligne({ quantite: 100, montant: 2000, repartition: [{ canal: LIEN_B, quantite: 14 }, { canal: 'directe', quantite: 50 }, { canal: LIEN_A, quantite: 36 }] }),
    ligne({ designation: 'SALADE', article_id: 8, quantite: 7, montant: 61.1, repartition: [{ canal: 'directe', quantite: 7 }] }),
    { designation: 'Service', quantite: 1, montant: 2, ignoree: true },
  ] });
  const v = VI.ventesParCanal(d.lignes);
  assert.deepEqual([...v.keys()], ['directe', LIEN_A, LIEN_B]);
  assert.deepEqual(v.get('directe'), [
    { article_type: 'produit', article_id: 7, quantite: 50, prix_unitaire: 20 },
    { article_type: 'produit', article_id: 8, quantite: 7, prix_unitaire: 8.728571 },
  ]);
  assert.deepEqual(v.get(LIEN_A), [{ article_type: 'produit', article_id: 7, quantite: 36, prix_unitaire: 20 }]);
  assert.deepEqual(v.get(LIEN_B), [{ article_type: 'produit', article_id: 7, quantite: 14, prix_unitaire: 20 }]);
});

test('migration 262 : prix à 6 décimales, une journée et un fichier une seule fois, règle « caisse » hors restauration', () => {
  const sql = lire('migrations', '262_ventes_imports.sql');
  assert.ok(!sql.includes('\r'));
  assert.match(sql, /ALTER TABLE vente_lignes ALTER COLUMN prix_unitaire TYPE NUMERIC\(14,6\);/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ux_ventes_imports_jour ON ventes_imports \(activite_id, date_vente\) WHERE statut = 'enregistre';/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ux_ventes_imports_fichier ON ventes_imports \(activite_id, empreinte\) WHERE statut = 'enregistre';/);
  assert.match(sql, /ALTER TABLE ventes ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES ventes_imports\(id\) ON DELETE SET NULL;/);
  for (const table of ['ventes_imports', 'ventes_imports_lignes', 'correspondances_ventes', 'correspondances_ventes_cibles', 'caisse_categories']) {
    assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS ${table} (`), table);
  }
  assert.match(sql, /'\{"caisse": false\}'::jsonb\s+WHERE slug IN \('hotellerie', 'ceramique', 'usine'\)\s+AND NOT \(COALESCE\(regles, '\{\}'::jsonb\) \? 'caisse'\);/);
});

test('câblage : l\'import crée ses ventes par le service de la saisie ; routes avant /ventes/:id ; règle de domaine', () => {
  const service = lire('src', 'services', 'ventesImport.js');
  assert.match(service, /const \{ verifierVente, ecrireVente \} = require\('\.\/ventesEcriture'\);/);
  assert.match(service, /const \{ conditions, moduleVenteActif \} = await verifierVente\(db, vente\);\s+const ecrite = await ecrireVente\(db, \{ \.\.\.vente, userId, conditions, moduleVenteActif, importId: importe\.id \}\);/);
  for (const code of ['FICHIER_DEJA_IMPORTE', 'JOUR_DEJA_IMPORTE', 'ARTICLE_INTROUVABLE', 'CANAL_INTROUVABLE']) assert.ok(service.includes(`'${code}'`), code);
  const ecriture = lire('src', 'services', 'ventesEcriture.js');
  assert.match(ecriture, /async function ecrireVente\(client, \{ [^}]*importId = null \}\)/);
  assert.ok(!/\breq\.|\bres\./.test(ecriture), 'le service ne connaît ni la requête ni la réponse');

  const routes = lire('src', 'routes', 'ventes.js');
  const contexte = routes.indexOf("router.get('/ventes/imports/contexte', authenticate, requireEntreprise, vi.contexte);");
  const creer = routes.indexOf("router.post('/ventes/imports', authenticate, requireEntreprise, vi.creer);");
  assert.ok(contexte > 0 && creer > contexte && creer < routes.indexOf("router.get('/ventes/:id'"));

  const ctrl = lire('src', 'controllers', 'ventesImportController.js');
  assert.match(ctrl, /if \(regles\.caisse === false\) \{\s+throw new VI\.ErreurImport\(403, 'CAISSE_DESACTIVEE'/);
  assert.match(ctrl, /await db\.query\('BEGIN'\);\s+const resultat = await ventesImport\.enregistrer\(db, \{ clientId, userId: req\.user\.id, activiteId, donnees \}\);\s+await db\.query\('COMMIT'\);/);
  const P = require('../src/services/domaineProfilService');
  assert.equal(P.REGLES_DEFAUT.caisse, true);
  assert.ok(P.REGLES_CLES.includes('caisse'));
  assert.equal(P.resolveRegles({ caisse: false }).caisse, false);
  assert.ok(lire('src', 'controllers', 'domainesController.js').includes("'prestataires', 'caisse'].includes(k) && typeof v !== 'boolean'"));
});
