// Tests de l'étape F5 (factures fournisseur : scans et photos mieux lus) — partie pure de la mise en page apprise
// (src/services/misesEnPage.js) : contrôle de la forme reçue (partagée entre les comptes), identifiant du matricule, et
// lecture reçue avec la facture (approFactureController.lireDonnees). Le parcours en base est dans scripts/test-factures-f5.js.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../src/services/misesEnPage');
const { lireDonnees } = require('../src/controllers/approFactureController');

const bonne = { colonnes: [{ genre: 'montant', x0: 0.85, x1: 0.95 }, { genre: 'des', x0: 0.066666, x1: 0.2 }, { genre: 'qte', x0: 0.55, x1: 0.6 }] };

test('lireMiseEnPage : colonnes contrôlées, arrondies au dix-millième, triées de gauche à droite', () => {
  assert.deepStrictEqual(M.lireMiseEnPage(bonne), { colonnes: [
    { genre: 'des', x0: 0.0667, x1: 0.2 }, { genre: 'qte', x0: 0.55, x1: 0.6 }, { genre: 'montant', x0: 0.85, x1: 0.95 },
  ] });
});

test('lireMiseEnPage : forme fausse refusée (null) — genre inconnu, bornes hors de la page, trop ou trop peu de colonnes', () => {
  const avec = (c) => ({ colonnes: [...bonne.colonnes.slice(0, 2), c] });
  for (const m of [
    null, 'texte', {}, { colonnes: 'x' }, { colonnes: [bonne.colonnes[0]] },
    avec({ genre: 'pirate', x0: 0.3, x1: 0.4 }), avec({ genre: 'pu', x0: -0.1, x1: 0.4 }), avec({ genre: 'pu', x0: 0.5, x1: 1.2 }),
    avec({ genre: 'pu', x0: 0.5, x1: 0.5 }), avec({ genre: 'pu', x0: '0.5', x1: 0.6 }), avec({ genre: 'pu', x0: Number.NaN, x1: 0.6 }),
    { colonnes: [...Array(15)].map((_, i) => ({ genre: i ? 'pu' : 'des', x0: i / 20, x1: i / 20 + 0.01 })) },
    { colonnes: [{ genre: 'des', x0: 0.1, x1: 0.2 }, { genre: 'ref', x0: 0.3, x1: 0.4 }] }, // aucune colonne chiffrée
    { colonnes: [{ genre: 'qte', x0: 0.1, x1: 0.2 }, { genre: 'montant', x0: 0.3, x1: 0.4 }] }, // sans désignation
  ]) assert.strictEqual(M.lireMiseEnPage(m), null, JSON.stringify(m));
});

test('identifiantMatricule : les 7 chiffres, quelle que soit l\'écriture ; illisible → null', () => {
  assert.strictEqual(M.identifiantMatricule('1234567A/A/M/000'), '1234567');
  assert.strictEqual(M.identifiantMatricule('MF : 1234567 a'), '1234567');
  assert.strictEqual(M.identifiantMatricule('846003D'), null, 'six chiffres : pas un identifiant sûr');
  assert.strictEqual(M.identifiantMatricule(''), null);
  assert.strictEqual(M.identifiantMatricule(null), null);
});

test('lecture reçue avec une facture : la mise en page est gardée contrôlée, une forme fausse devient null', () => {
  const donnees = (lecture) => JSON.stringify({
    cible: { type: 'activite', id: 1 }, dateAppro: '2026-10-01', fournisseurId: 2, refFacture: 'F-1',
    lignes: [{ articleId: 3, quantite: 1, prixUnitaire: 1, tva: 19 }], lecture,
  });
  assert.deepStrictEqual(lireDonnees(donnees({ source: 'ocr', miseEnPage: bonne })).lecture.miseEnPage.colonnes.map((c) => c.genre), ['des', 'qte', 'montant']);
  assert.strictEqual(lireDonnees(donnees({ source: 'ocr', miseEnPage: { colonnes: [{ genre: 'x' }] } })).lecture.miseEnPage, null);
  assert.strictEqual(lireDonnees(donnees({ source: 'pdf' })).lecture.miseEnPage, null);
});
