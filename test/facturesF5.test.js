// Tests de l'étape F5 (factures fournisseur : scans et photos mieux lus) — partie pure de la mise en page apprise
// (src/services/misesEnPage.js) : contrôle de la forme reçue, identifiant du matricule, mises en page semblables, et
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

test('lireMiseEnPage : forme fausse refusée (null)', () => {
  const avec = (c) => ({ colonnes: [...bonne.colonnes.slice(0, 2), c] });
  for (const [m, pourquoi] of [
    [null, 'rien'], ['texte', 'texte'], [{}, 'sans colonnes'], [{ colonnes: 'x' }, 'colonnes pas en liste'], [{ colonnes: [bonne.colonnes[0]] }, 'une seule colonne'],
    [avec({ genre: 'pirate', x0: 0.3, x1: 0.4 }), 'genre inconnu'], [avec({ genre: 'pu', x0: -0.1, x1: 0.4 }), 'hors de la page'],
    [avec({ genre: 'pu', x0: 0.5, x1: 1.2 }), 'hors de la page'], [avec({ genre: 'pu', x0: 0.5, x1: 0.5 }), 'largeur nulle'],
    [avec({ genre: 'pu', x0: 0.12341, x1: 0.12344 }), 'largeur nulle après arrondi'], [avec({ genre: 'pu', x0: '0.5', x1: 0.6 }), 'texte'],
    [avec({ genre: 'pu', x0: Number.NaN, x1: 0.6 }), 'NaN'], [avec({ genre: 'pu', x0: 0.21, x1: 0.9 }), 'plus de 60 % de la page'],
    [avec({ genre: 'des', x0: 0.3, x1: 0.4 }), 'genre en double'], [avec({ genre: 'pu', x0: 0.15, x1: 0.3 }), 'chevauche la désignation'],
    [{ colonnes: [...Array(15)].map((_, i) => ({ genre: M.GENRES[i % 11], x0: i / 20, x1: i / 20 + 0.01 })) }, 'trop de colonnes'],
    [{ colonnes: [{ genre: 'des', x0: 0.1, x1: 0.2 }, { genre: 'ref', x0: 0.3, x1: 0.4 }] }, 'aucune colonne chiffrée'],
    [{ colonnes: [{ genre: 'qte', x0: 0.1, x1: 0.2 }, { genre: 'montant', x0: 0.3, x1: 0.4 }] }, 'sans désignation'],
  ]) assert.strictEqual(M.lireMiseEnPage(m), null, pourquoi);
});

test('identifiantMatricule : les 7 chiffres d\'un matricule de forme valide ; tout autre numéro → null', () => {
  assert.strictEqual(M.identifiantMatricule('1234567A/A/M/000'), '1234567');
  assert.strictEqual(M.identifiantMatricule('MF : 1234567 a'), '1234567');
  assert.strictEqual(M.identifiantMatricule('1234567'), '1234567', 'sans lettre-clé : forme admise');
  assert.strictEqual(M.identifiantMatricule('846003D'), null, 'six chiffres : pas un identifiant sûr');
  assert.strictEqual(M.identifiantMatricule('12345678'), null, 'CIN, téléphone : huit chiffres');
  assert.strictEqual(M.identifiantMatricule('1234567890123'), null, 'RIB');
  assert.strictEqual(M.identifiantMatricule(''), null);
  assert.strictEqual(M.identifiantMatricule(null), null);
});

test('semblables : mêmes genres dans le même ordre, places à 3 % près', () => {
  const a = M.lireMiseEnPage(bonne);
  const proche = { colonnes: a.colonnes.map((c) => ({ ...c, x0: c.x0 + 0.02, x1: c.x1 + 0.02 })) };
  const loin = { colonnes: a.colonnes.map((c, i) => (i === 1 ? { ...c, x0: c.x0 + 0.05, x1: c.x1 + 0.05 } : c)) };
  const autreGenre = { colonnes: a.colonnes.map((c, i) => (i === 1 ? { ...c, genre: 'pu' } : c)) };
  assert.strictEqual(M.semblables(a, proche), true);
  assert.strictEqual(M.semblables(a, loin), false);
  assert.strictEqual(M.semblables(a, autreGenre), false);
  assert.strictEqual(M.semblables(a, { colonnes: a.colonnes.slice(0, 2) }), false);
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
