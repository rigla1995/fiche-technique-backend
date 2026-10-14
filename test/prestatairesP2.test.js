// P2 « Conditions des prestataires et chiffre net » (labflow-reprise/produits-prestataires/PLAN.md §2 ligne P2, §3 ;
// réponses du client du 13/10). Tests sans base : lecture des conditions (activation complète, modification partielle,
// refus), chiffre net (30 → 21,075), code d'un mode de paiement, expressions SQL aux taux figés, migration 238, et les
// contrôleurs (conditions exigées à l'activation, figées sur la vente, refus expliqués, contrôles de propriétaire, tableau
// de bord sans le taux du jour).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const CP = require('../src/utils/conditionsPrestataire');

const refus = (fn, code) => assert.throws(fn, (e) => e.status === 400 && e.code === code);

test('lireConditions : activation complète (textes acceptés, taux à 2 décimales)', () => {
  assert.deepEqual(CP.lireConditions({ taux_commission: 25, taux_tva: 19, mode_paiement_id: 2 }), { tauxCommission: 25, tauxTva: 19, modePaiementId: 2 });
  assert.deepEqual(CP.lireConditions({ taux_commission: '12.345', taux_tva: '0', mode_paiement_id: '1' }), { tauxCommission: 12.35, tauxTva: 0, modePaiementId: 1 });
  refus(() => CP.lireConditions({ taux_commission: 25, taux_tva: 19 }), 'CONDITIONS_REQUISES');
  refus(() => CP.lireConditions({ taux_commission: 25, mode_paiement_id: 2 }), 'CONDITIONS_REQUISES');
  refus(() => CP.lireConditions({ taux_tva: 19, mode_paiement_id: 2 }), 'CONDITIONS_REQUISES');
  refus(() => CP.lireConditions({ taux_commission: '', taux_tva: 19, mode_paiement_id: 2 }), 'CONDITIONS_REQUISES');
  refus(() => CP.lireConditions({ taux_commission: 101, taux_tva: 19, mode_paiement_id: 2 }), 'TAUX_INVALIDE');
  refus(() => CP.lireConditions({ taux_commission: -1, taux_tva: 19, mode_paiement_id: 2 }), 'TAUX_INVALIDE');
  refus(() => CP.lireConditions({ taux_commission: 'abc', taux_tva: 19, mode_paiement_id: 2 }), 'TAUX_INVALIDE');
  refus(() => CP.lireConditions({ taux_commission: 25, taux_tva: 19, mode_paiement_id: 'virement' }), 'MODE_PAIEMENT_INVALIDE');
  refus(() => CP.lireConditions({ taux_commission: 25, taux_tva: 19, mode_paiement_id: 0 }), 'MODE_PAIEMENT_INVALIDE');
});

test('lireConditions : modification partielle (seules les conditions présentes sont lues)', () => {
  assert.deepEqual(CP.lireConditions({ taux_commission: 30 }, { complet: false }), { tauxCommission: 30, tauxTva: undefined, modePaiementId: undefined });
  assert.deepEqual(CP.lireConditions({ actif: false }, { complet: false }), { tauxCommission: undefined, tauxTva: undefined, modePaiementId: undefined });
  assert.deepEqual(CP.lireConditions({ mode_paiement_id: 3, taux_tva: 7 }, { complet: false }), { tauxCommission: undefined, tauxTva: 7, modePaiementId: 3 });
  refus(() => CP.lireConditions({ taux_tva: 250 }, { complet: false }), 'TAUX_INVALIDE');
});

test('netPrestataire : l\'exemple du plan (30 DT, 25 %, TVA 19 % sur la commission → 21,075) et les cas limites', () => {
  assert.deepEqual(CP.netPrestataire(30, 25, 19), { commission: 7.5, tva: 1.425, net: 21.075 });
  assert.deepEqual(CP.netPrestataire(30, 0, 0), { commission: 0, tva: 0, net: 30 });
  assert.deepEqual(CP.netPrestataire('30.000', '25.00', '19.00'), { commission: 7.5, tva: 1.425, net: 21.075 });
  assert.deepEqual(CP.netPrestataire(0, 25, 19), { commission: 0, tva: 0, net: 0 });
  assert.deepEqual(CP.netPrestataire(10, null, null), { commission: 0, tva: 0, net: 10 });
  // Arrondi au millime, comme les montants.
  assert.deepEqual(CP.netPrestataire(33.333, 12.5, 19), { commission: 4.167, tva: 0.792, net: 28.374 });
});

test('codeMode : code stable d\'un libellé', () => {
  assert.equal(CP.codeMode('Espèces'), 'especes');
  assert.equal(CP.codeMode('Chèque bancaire'), 'cheque_bancaire');
  assert.equal(CP.codeMode('  Carte — TPE  '), 'carte_tpe');
  assert.equal(CP.codeMode('???'), '');
  assert.equal(CP.codeMode('x'.repeat(50)).length, 30);
});

test('expressions SQL : commission et TVA aux taux figés sur la vente, jamais ceux du prestataire', () => {
  assert.match(CP.SQL_COMMISSION_LIGNE, /COALESCE\(v\.taux_commission, 0\)/);
  assert.doesNotMatch(CP.SQL_COMMISSION_LIGNE, /ap\.taux_commission/);
  assert.match(CP.SQL_TVA_COMMISSION_LIGNE, /COALESCE\(v\.taux_tva_commission, 0\)/);
  assert.ok(CP.SQL_TVA_COMMISSION_LIGNE.includes(CP.SQL_COMMISSION_LIGNE));
});

test('migration 238 : modes de paiement, conditions du lien, conditions figées sur la vente ; additive', () => {
  const sql = lire('migrations', '238_prestataires_conditions.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS modes_paiement/);
  assert.match(sql, /\('especes', 'Espèces', 1\), \('virement', 'Virement', 2\)/);
  assert.match(sql, /ALTER TABLE activite_prestataires ADD COLUMN IF NOT EXISTS taux_tva NUMERIC\(5, 2\) NOT NULL DEFAULT 0/);
  assert.match(sql, /ALTER TABLE activite_prestataires ADD COLUMN IF NOT EXISTS mode_paiement_id INTEGER REFERENCES modes_paiement\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /CHECK \(taux_commission BETWEEN 0 AND 100 AND taux_tva BETWEEN 0 AND 100\)/);
  for (const col of ['taux_commission NUMERIC(5, 2)', 'taux_tva_commission NUMERIC(5, 2)', 'mode_paiement_id INTEGER REFERENCES modes_paiement(id) ON DELETE SET NULL']) {
    assert.ok(sql.includes(`ALTER TABLE ventes ADD COLUMN IF NOT EXISTS ${col}`), col);
  }
  // Le rattrapage ne touche que les ventes par prestataire sans taux (rejeu sans effet).
  assert.match(sql, /WHERE v\.type_vente = 'prestataire' AND v\.taux_commission IS NULL/);
  assert.doesNotMatch(sql, /DROP (COLUMN|TABLE)|DELETE FROM|TRUNCATE/);
});

test('contrôleur des ventes : conditions exigées à l\'activation, figées sur la vente, refus expliqués, propriétaire', () => {
  const src = lire('src', 'controllers', 'ventesController.js');
  assert.match(src, /const conditions = CP\.lireConditions\(req\.body\);\s+const libelle = await exigerModePaiement\(conditions\.modePaiementId\);/);
  assert.match(src, /INSERT INTO activite_prestataires \(activite_id, prestataire_id, taux_commission, taux_tva, mode_paiement_id, conditions_le, conditions_par, created_by\)/);
  assert.match(src, /CP\.lireConditions\(req\.body, \{ complet: false \}\)/);
  // Vente : taux et mode figés, prestataire activé et conditions renseignées.
  assert.match(src, /INSERT INTO ventes \(activite_id, labo_id, date_vente, type_vente, prestataire_id, statut, notes, created_by,\s+taux_commission, taux_tva_commission, mode_paiement_id\)/);
  for (const code of ['PRESTATAIRE_REQUIS', 'PRESTATAIRE_NON_ACTIVE', 'CONDITIONS_MANQUANTES']) assert.ok(src.includes(`code: '${code}'`), code);
  // Désactiver efface les prix (cascade) et le dit.
  assert.match(src, /SELECT COUNT\(\*\)::int AS n FROM article_prix_prestataire WHERE activite_prestataire_id = \$1/);
  assert.match(src, /prix_effaces: prix\.rows\[0\]\.n/);
  // Contrôles de propriétaire (avant : aucun).
  assert.match(src, /DELETE FROM activite_articles_vendables av WHERE av\.id = \$1 AND \(\$\{sqlDuCompte\('av', '\$2'\)\}\) RETURNING av\.id/);
  assert.match(src, /WHERE ap\.id = \$1 AND \(\$\{sqlDuCompte\('ap', '\$3'\)\}\)/);
  assert.match(src, /EXISTS \(SELECT 1 FROM activites a JOIN profil_entreprise pe ON pe\.id = a\.entreprise_id WHERE a\.id = \$\{alias\}\.activite_id AND pe\.client_id = \$\{n\}\)/);
  // Net servi avec chaque vente (liste, détail, export).
  assert.match(src, /presenterConditionsVente\(row, parseFloat\(row\.total_ca\)\)/);
  assert.match(src, /'Commission \(DT\)', 'TVA commission \(DT\)', 'Net \(DT\)'/);
  assert.match(src, /modePaiementId/);
});

test('tableau de bord v2 : taux figés sur la vente, TVA, net des prestataires, filtre modes de paiement', () => {
  const src = lire('src', 'controllers', 'dashboardV2Controller.js');
  assert.doesNotMatch(src, /ap\.taux_commission/);
  assert.doesNotMatch(src, /JOIN activite_prestataires ap/);
  assert.match(src, /const L_COMMISSION = SQL_COMMISSION_LIGNE;/);
  assert.match(src, /net_prestataires: r3\(v\.caPrestataires - v\.commission - v\.tvaCommission\)/);
  assert.match(src, /const margeApresCom = margeBrute - v\.commission - v\.tvaCommission;/);
  assert.match(src, /parseIntList\(req\.query\.modesPaiement\)/);
  assert.match(src, /modes_paiement: modes\.rows/);
});

test('routes et modes de paiement : admin (liste, ajout, modification), client (actifs)', () => {
  const routes = lire('src', 'routes', 'ventes.js');
  assert.match(routes, /router\.get\('\/admin\/modes-paiement', authenticate, requireSuperAdmin, mp\.lister\)/);
  assert.match(routes, /router\.post\('\/admin\/modes-paiement', authenticate, requireSuperAdmin, mp\.creer\)/);
  assert.match(routes, /router\.put\('\/admin\/modes-paiement\/:id', authenticate, requireSuperAdmin, mp\.modifier\)/);
  assert.match(routes, /router\.get\('\/modes-paiement', authenticate, requireEntreprise, mp\.listerActifs\)/);
  assert.doesNotMatch(routes, /delete\('\/admin\/modes-paiement/);
  const ctrl = lire('src', 'controllers', 'modesPaiementController.js');
  assert.match(ctrl, /MODE_PAIEMENT_EXISTANT/);
  assert.match(ctrl, /WHERE actif = true ORDER BY ordre, libelle/);
});
