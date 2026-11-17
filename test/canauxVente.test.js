// C1 « Canaux de vente » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.2). Tests sans base : lecture d'une
// cellule de la grille, règle « une case ne se coche qu'avec un prix », prix copié (majoration, arrondi), réglages de la
// copie, migration 256, et le câblage des contrôleurs (refus d'une ligne hors canal, routes, champs servis).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const CV = require('../src/utils/canauxVente');

const LIEN = '3f2b6c1e-8a4d-4f0b-9c7e-1d2a3b4c5d6e';
const refus = (fn, code, status = 400) => assert.throws(fn, (e) => e instanceof CV.ErreurCanal && e.status === status && e.code === code);

test('lirePrix : nombre positif à deux décimales, virgule acceptée, vide = effacé', () => {
  assert.equal(CV.lirePrix(12), 12);
  assert.equal(CV.lirePrix('7,5'), 7.5);
  assert.equal(CV.lirePrix('8.905'), 8.91);
  assert.equal(CV.lirePrix(0), 0);
  assert.equal(CV.lirePrix(null), null);
  assert.equal(CV.lirePrix(''), null);
  refus(() => CV.lirePrix(-1), 'PRIX_INVALIDE');
  refus(() => CV.lirePrix('abc'), 'PRIX_INVALIDE');
  refus(() => CV.lirePrix(true), 'PRIX_INVALIDE');
  refus(() => CV.lirePrix(1e9), 'PRIX_INVALIDE');
});

test('lireCanal : vente directe ou lien activité–prestataire', () => {
  assert.deepEqual(CV.lireCanal('directe'), { directe: true, lienId: null });
  assert.deepEqual(CV.lireCanal(LIEN.toUpperCase()), { directe: false, lienId: LIEN });
  refus(() => CV.lireCanal('glovo'), 'CANAL_INVALIDE');
  refus(() => CV.lireCanal(12), 'CANAL_INVALIDE');
  refus(() => CV.lireCanal(undefined), 'CANAL_INVALIDE');
});

test('lireCellule : produit ou article, canal, prix et / ou case', () => {
  assert.deepEqual(CV.lireCellule({ article_type: 'produit', article_id: '7', canal: 'directe', prix: '20', en_vente: true }),
    { articleType: 'produit', articleId: 7, canal: { directe: true, lienId: null }, prix: 20, enVente: true });
  assert.deepEqual(CV.lireCellule({ article_type: 'ingredient', article_id: 3, canal: LIEN, en_vente: false }),
    { articleType: 'ingredient', articleId: 3, canal: { directe: false, lienId: LIEN }, prix: undefined, enVente: false });
  assert.equal(CV.lireCellule({ article_type: 'produit', article_id: 7, canal: 'directe', prix: null }).prix, null);
  refus(() => CV.lireCellule({ article_type: 'plat', article_id: 7, canal: 'directe', prix: 1 }), 'CELLULE_INVALIDE');
  refus(() => CV.lireCellule({ article_type: 'produit', article_id: 0, canal: 'directe', prix: 1 }), 'CELLULE_INVALIDE');
  refus(() => CV.lireCellule({ article_type: 'produit', article_id: 7, canal: 'directe' }), 'CELLULE_INVALIDE');
  refus(() => CV.lireCellule({ article_type: 'produit', article_id: 7, canal: 'directe', en_vente: 'oui' }), 'CELLULE_INVALIDE');
  refus(() => CV.lireCellule(null), 'CELLULE_INVALIDE');
});

test('lireCellules : liste non vide, bornée', () => {
  refus(() => CV.lireCellules([]), 'CELLULES_REQUISES');
  refus(() => CV.lireCellules('x'), 'CELLULES_REQUISES');
  const une = { article_type: 'produit', article_id: 1, canal: 'directe', prix: 1 };
  assert.equal(CV.lireCellules([une, une]).length, 2);
  refus(() => CV.lireCellules(Array.from({ length: CV.CELLULES_MAX + 1 }, () => une)), 'CELLULES_TROP');
});

test('appliquer : une case ne se coche qu\'avec un prix > 0 ; un prix effacé décoche', () => {
  const cellule = (c) => ({ prix: undefined, enVente: undefined, ...c });
  // Cocher avec le prix déjà enregistré, ou avec le prix envoyé en même temps.
  assert.deepEqual(CV.appliquer({ prix: 20, enVente: false }, cellule({ enVente: true })), { prix: 20, enVente: true });
  assert.deepEqual(CV.appliquer({ prix: null, enVente: false }, cellule({ prix: 12, enVente: true })), { prix: 12, enVente: true });
  // Sans prix : refus.
  refus(() => CV.appliquer({ prix: null, enVente: false }, cellule({ enVente: true })), 'PRIX_REQUIS');
  refus(() => CV.appliquer({ prix: 20, enVente: false }, cellule({ prix: 0, enVente: true })), 'PRIX_REQUIS');
  // Changer le prix ne touche pas la case ; décocher garde le prix.
  assert.deepEqual(CV.appliquer({ prix: 20, enVente: true }, cellule({ prix: 22 })), { prix: 22, enVente: true });
  assert.deepEqual(CV.appliquer({ prix: 20, enVente: false }, cellule({ prix: 22 })), { prix: 22, enVente: false });
  assert.deepEqual(CV.appliquer({ prix: 20, enVente: true }, cellule({ enVente: false })), { prix: 20, enVente: false });
  // Effacer ou mettre à zéro le prix d'une case cochée la décoche.
  assert.deepEqual(CV.appliquer({ prix: 20, enVente: true }, cellule({ prix: null })), { prix: null, enVente: false });
  assert.deepEqual(CV.appliquer({ prix: 20, enVente: true }, cellule({ prix: 0 })), { prix: 0, enVente: false });
});

test('majorer : pourcentage puis arrondi au pas, jamais sous un centième', () => {
  assert.equal(CV.majorer(20, 0, 0.01), 20);
  assert.equal(CV.majorer(20, 20, 0.01), 24);
  assert.equal(CV.majorer(8.9, 20, 0.01), 10.68);
  assert.equal(CV.majorer(8.9, 20, 0.1), 10.7);
  assert.equal(CV.majorer(8.9, 20, 0.5), 10.5);
  assert.equal(CV.majorer(8.9, 20, 1), 11);
  assert.equal(CV.majorer(7.5, 15, 0.5), 8.5); // 8,625 → 8,5
  assert.equal(CV.majorer(7.5, 20, 0.1), 9); // pas de 9,000000000000002
  assert.equal(CV.majorer(10, -10, 0.01), 9);
  assert.equal(CV.majorer(0.2, 0, 1), 0.01); // l'arrondi au dinar ne rend jamais un prix nul
  assert.equal(CV.majorer(8.9, 20, 0.3), 10.68); // pas inconnu : au centième
});

test('lireCopie : deux canaux différents, majoration et arrondi bornés', () => {
  assert.deepEqual(CV.lireCopie({ source: 'directe', cible: LIEN }),
    { source: { directe: true, lienId: null }, cible: { directe: false, lienId: LIEN }, pct: 0, pas: 0.01, retirerAbsents: false });
  assert.deepEqual(CV.lireCopie({ source: LIEN, cible: 'directe', majoration_pct: '20', arrondi: 0.5, retirer_absents: true }),
    { source: { directe: false, lienId: LIEN }, cible: { directe: true, lienId: null }, pct: 20, pas: 0.5, retirerAbsents: true });
  refus(() => CV.lireCopie({ source: 'directe', cible: 'directe' }), 'CANAUX_IDENTIQUES');
  refus(() => CV.lireCopie({ source: LIEN, cible: LIEN.toUpperCase() }), 'CANAUX_IDENTIQUES');
  refus(() => CV.lireCopie({ source: 'directe', cible: LIEN, majoration_pct: 900 }), 'MAJORATION_INVALIDE');
  refus(() => CV.lireCopie({ source: 'directe', cible: LIEN, majoration_pct: -95 }), 'MAJORATION_INVALIDE');
  refus(() => CV.lireCopie({ source: 'directe', cible: LIEN, arrondi: 0.3 }), 'ARRONDI_INVALIDE');
  refus(() => CV.lireCopie({ source: 'directe' }), 'CANAL_INVALIDE');
});

test('migration 256 : deux colonnes, reprise des prix prestataire, rejouable', () => {
  const sql = lire('migrations', '256_canaux_vente.sql');
  assert.match(sql, /ALTER TABLE activite_articles_vendables\s+ADD COLUMN IF NOT EXISTS directe BOOLEAN NOT NULL DEFAULT true/);
  assert.match(sql, /ALTER TABLE article_prix_prestataire\s+ADD COLUMN IF NOT EXISTS en_vente BOOLEAN NOT NULL DEFAULT true/);
  assert.match(sql, /SET en_vente = false\s+WHERE en_vente\s+AND \(prix_vente IS NULL OR prix_vente <= 0\)/);
  assert.ok(!/DROP |DELETE /i.test(sql), 'la migration ne supprime rien');
});

test('contrôleurs : la saisie refuse une ligne hors canal ; les listes servent les cases', () => {
  const ventes = lire('src', 'controllers', 'ventesController.js');
  assert.match(ventes, /canauxVente\.exigerLignesEnVente\(pool, \{ activiteId: activite_id, typeVente: type_vente, prestataireId: prestataire_id, lignes \}\)/);
  assert.ok(ventes.indexOf('exigerLignesEnVente') < ventes.indexOf("await client.query('BEGIN');\n\n    const vRes"), 'contrôle avant la transaction de la vente');
  assert.match(ventes, /av\.prix_vente, av\.portion, av\.actif, av\.directe,/);
  assert.match(ventes, /app\.prix_vente, app\.en_vente, app\.updated_at,/);
  assert.equal(ventes.split('directe: row.directe !== false,').length - 1, 2, 'valorisés : articles et composés');
  assert.match(ventes, /produits_retires: retires/);
  const service = lire('src', 'services', 'canauxVente.js');
  assert.match(service, /'PAS_EN_VENTE'/);
  assert.match(service, /av\.activite_id = \$1 AND av\.actif AND av\.directe`/);
  assert.match(service, /av\.actif AND app\.en_vente AND app\.prix_vente > 0`/);
  const routes = lire('src', 'routes', 'ventes.js');
  assert.match(routes, /router\.put\('\/canaux-vente', authenticate, requireEntreprise, cv\.modifier\)/);
  assert.match(routes, /router\.post\('\/canaux-vente\/copier', authenticate, requireEntreprise, cv\.copier\)/);
});
