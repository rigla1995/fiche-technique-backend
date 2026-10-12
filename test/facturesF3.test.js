// Étape F3 (factures fournisseur, labflow-reprise/achats-compta/PLAN-FACTURES.md) : la facture lue puis validée — clé
// d'apprentissage d'une ligne, répartition du pied (remise globale, FODEC), coût par unité de stock, contrôle de l'envoi.
// Sans base de données.
const test = require('node:test');
const assert = require('node:assert');

const V = require('../src/services/facturesValidees');
const { lireValidation } = require('../src/controllers/factureValideeController');

const aujourdhui = new Date().toISOString().slice(0, 10);
const refus = (fn, code) => assert.throws(fn, (e) => (e.corps?.code ?? e.code) === code, `refus ${code} attendu`);
const donnees = (m = {}) => ({
  cible: { type: 'activite', id: 1 }, dateAppro: aujourdhui, fournisseurId: 2, refFacture: 'FV-1', timbreFiscal: true,
  lignes: [
    { designation: 'Farine T45 sac 25 kg', quantite: 2, unite: 'sac', prixUnitaire: 41.5, tauxTva: 7, montant: 83, articleId: 3, conversion: 25 },
    { designation: 'Transport', quantite: 1, montant: 10, tauxTva: 19, horsStock: 'transport' },
  ],
  ...m,
});

// MÊMES VECTEURS que les écrans (scripts/factures-correspondre.test.mjs) : la clé se calcule des deux côtés.
const VECTEURS = [
  ['Farine pâtissière T45 sac 25 kg', null, 'des:farine patissiere t45 sac 25 kg'],
  ['  EAU MINÉRALE 1,5 L (pack 6) ', '', 'des:eau minerale 1,5 l pack 6'],
  ['Eau minérale 1.5L', null, 'des:eau minerale 1,5l'],
  ['Œufs calibre M — plateau 30', null, 'des:oeufs calibre m plateau 30'],
  ["Thon à l'huile 160 g (carton 48)", null, 'des:thon a l huile 160 g carton 48'],
  ['Barquette alu', ' p 310 ', 'ref:P310'],
  ['Poulet, entier', 'ré-12', 'ref:RE12'],
  ['Eau minérale', 'EAU.15', 'ref:EAU15'],
  ['Tiret seul', ' - ', 'des:tiret seul'],
  ['', '', null],
];

test('cleDeLigne : référence produit d\'abord, sinon désignation normalisée (mêmes vecteurs que les écrans)', () => {
  for (const [designation, reference, attendu] of VECTEURS) {
    assert.strictEqual(V.cleDeLigne({ designation, reference }), attendu, `${designation} / ${reference}`);
  }
});

test('repartir : sans pied — coût = montant ÷ (quantité × conversion), TVA par taux, TTC avec timbre', () => {
  const r = V.repartir([
    { quantite: 2, montant: 83, tauxTva: 7, conversion: 25, article: true },
    { quantite: 1, montant: 10, tauxTva: 19, conversion: null, article: false },
  ], { timbre: 1 });
  assert.deepStrictEqual(r.lignes.map((l) => [l.quantiteStock, l.prixStock]), [[50, 1.66], [null, null]]);
  assert.deepStrictEqual(r.parTaux, [{ taux: 7, base: 83, montant: 5.81 }, { taux: 19, base: 10, montant: 1.9 }]);
  assert.deepStrictEqual([r.ht, r.fodec, r.tva, r.ttc], [93, 0, 7.71, 101.71]);
});

test('repartir : remise globale au prorata (baisse le coût), FODEC au prorata du net (l\'augmente)', () => {
  const r = V.repartir([
    { quantite: 10, montant: 300, tauxTva: 19, conversion: 1, article: true },
    { quantite: 1, montant: 100, tauxTva: 19, conversion: 1, article: true },
  ], { remiseGlobale: 40, fodec: 3.6, timbre: 1 });
  // nets 270 et 90 ; FODEC 2,7 et 0,9 ; coûts 272,7 et 90,9
  assert.deepStrictEqual(r.lignes.map((l) => l.prixStock), [27.27, 90.9]);
  assert.deepStrictEqual([r.ht, r.fodec, r.tva, r.ttc], [360, 3.6, 69.084, 433.684]);
});

test('repartir : ligne gratuite (montant 0) → prix de stock 0 ; conversion fractionnaire arrondie au millime', () => {
  const r = V.repartir([
    { quantite: 1, montant: 0, tauxTva: 0, conversion: 12, article: true },
    { quantite: 3, montant: 10, tauxTva: 0, conversion: 0.333333, article: true },
  ]);
  assert.deepStrictEqual(r.lignes.map((l) => [l.quantiteStock, l.prixStock]), [[12, 0], [1, 10]]);
});

test('lireValidation : lignes d\'article et hors stock, pied, calcul ; champs rognés', () => {
  const v = lireValidation(donnees({ fodec: '0,9'.replace(',', '.'), remiseGlobale: 3 }));
  assert.strictEqual(v.lignes.length, 2);
  assert.deepStrictEqual(v.lignes[0], { designation: 'Farine T45 sac 25 kg', reference: null, unite: 'sac', quantite: 2, montant: 83, prixUnitaire: 41.5, remise: 0, tauxTva: 7, articleId: 3, horsStock: null, conversion: 25 });
  assert.deepStrictEqual([v.lignes[1].articleId, v.lignes[1].horsStock, v.lignes[1].conversion], [null, 'transport', null]);
  assert.deepStrictEqual([v.fodec, v.remiseGlobale, v.timbreMontant], [0.9, 3, 1]);
  assert.strictEqual(v.calcul.ht, 90);
});

test('lireValidation : refus — fournisseur, lignes, désignation, choix, aucun article, conversion, pied', () => {
  refus(() => lireValidation(donnees({ fournisseurId: null })), 'FOURNISSEUR_REQUIS');
  refus(() => lireValidation(donnees({ lignes: [] })), 'LIGNES_REQUISES');
  refus(() => lireValidation(donnees({ lignes: [{ designation: ' ', quantite: 1, montant: 1, articleId: 3 }] })), 'LIGNE_INVALIDE');
  refus(() => lireValidation(donnees({ lignes: [{ designation: 'X', quantite: 1, montant: 1 }] })), 'LIGNE_INVALIDE');
  refus(() => lireValidation(donnees({ lignes: [{ designation: 'X', quantite: 1, montant: 1, horsStock: 'cadeau' }] })), 'LIGNE_INVALIDE');
  refus(() => lireValidation(donnees({ lignes: [{ designation: 'X', quantite: 1, montant: 1, horsStock: 'transport' }] })), 'AUCUN_ARTICLE');
  refus(() => lireValidation(donnees({ lignes: [{ designation: 'X', quantite: 1, montant: 1, articleId: 3, conversion: 0 }] })), 'LIGNE_INVALIDE');
  refus(() => lireValidation(donnees({ lignes: [{ designation: 'X', quantite: 0, montant: 1, articleId: 3 }] })), 'LIGNE_INVALIDE');
  refus(() => lireValidation(donnees({ lignes: [{ designation: 'X', quantite: 1, montant: -1, articleId: 3 }] })), 'LIGNE_INVALIDE');
  refus(() => lireValidation(donnees({ lignes: [{ designation: 'X', quantite: 1, montant: 1, articleId: 3, remise: 100 }] })), 'LIGNE_INVALIDE');
  refus(() => lireValidation(donnees({ remiseGlobale: 1000 })), 'PIED_INVALIDE');
  refus(() => lireValidation(donnees({ fodec: -1 })), 'PIED_INVALIDE');
  refus(() => lireValidation(donnees({ refFacture: '' })), 'REF_REQUISE');
});

test('lireValidation : timbre absent = 0 (document hors taxe), conversion par défaut 1', () => {
  const v = lireValidation(donnees({ timbreFiscal: false, lignes: [{ designation: 'Poulet entier', quantite: 12.5, montant: 98.125, articleId: 3 }] }));
  assert.deepStrictEqual([v.timbre, v.timbreMontant, v.lignes[0].conversion, v.calcul.ttc], [false, 0, 1, 98.125]);
});
