// LabFlow Compta, étape S2c (labflow-reprise/achats-compta/PLAN-S2.md §4) : le module Comptabilité chez un client
// Stock / Vente — facturé à plein tarif, hors promotion (décision du client du 06/10), à partir du mois qui suit son
// activation. Tests purs (aucune base).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { configPourMois, cleMois } = require('../src/compta/tarifsCompta');
const {
  computeMensuelTotalFromConfig, applyPromoMensualite, mensualiteDue, lignesMensualite,
} = require('../src/services/pricingEngine');
const { moisFacture } = require('../src/compta/moduleClient');

const TARIFS = {
  prix_base_activite_premium: 200, prix_base_activite_basique: 150, remise_2eme_sans_labo: 20, remise_3eme_plus_sans_labo: 40,
  remise_avec_labo: 30, labo_sup_mensuel: 160, gerant_sup_mensuel: 80,
  compta_cabinet_mensuel: 120, compta_gerant_cabinet_mensuel: 30, compta_mise_en_route: 250,
  compta_module_mensuel: 60, compta_gerant_client_mensuel: 20,
};
const LABFLOW = { nb_activites: 2, nb_labos: 1, nb_gerants: 1, nb_acheteurs: 0, formule_activites: 'premium' };
const AVEC_MODULE = { ...LABFLOW, module_compta_actif: true, module_compta_active_le: '2026-10-06T10:00:00Z', nb_gerants_compta: 1 };
const PROMOS = [
  null,
  { type: 'percent_off', applies_to: 'mensualite', discount_mensualite: 50 },
  { type: 'percent_off', applies_to: 'les_deux', discount_mensualite: 33 },
  { type: 'fixed_price', applies_to: 'mensualite', fixed_mensualite: 100 },
  { type: 'fixed_price', applies_to: 'mensualite', fixed_mensualite: 999 },
  { type: 'free_months', applies_to: 'mensualite' },
  { type: 'percent_off', applies_to: 'onboarding', discount_onboarding: 50 },
];
const somme = (l) => Math.round(l.reduce((s, x) => s + x.montant, 0) * 100) / 100;

test('compte LabFlow sans le module : mensualité due identique à avant, quelle que soit la promotion', () => {
  const total = computeMensuelTotalFromConfig(LABFLOW, TARIFS);
  for (const promo of PROMOS) {
    assert.equal(mensualiteDue(LABFLOW, TARIFS, promo), applyPromoMensualite(total, promo), JSON.stringify(promo));
    assert.equal(lignesMensualite(LABFLOW, TARIFS, promo), null, 'aucune ligne figée : facture d\'avant à l\'octet');
  }
});

test('client avec le module : la promotion ne porte que sur la partie Stock / Vente, le module reste à plein tarif', () => {
  const labflow = computeMensuelTotalFromConfig(LABFLOW, TARIFS);
  const module = 60 + 20;
  assert.equal(mensualiteDue(AVEC_MODULE, TARIFS, null), Math.round((labflow + module) * 100) / 100);
  assert.equal(mensualiteDue(AVEC_MODULE, TARIFS, PROMOS[1]), Math.round((labflow / 2 + module) * 100) / 100, '−50 %');
  assert.equal(mensualiteDue(AVEC_MODULE, TARIFS, PROMOS[3]), 100 + module, 'prix fixe : le module s\'ajoute');
  assert.equal(mensualiteDue(AVEC_MODULE, TARIFS, PROMOS[5]), module, 'mois offert : le module reste dû');
  for (const promo of PROMOS) {
    const lignes = lignesMensualite(AVEC_MODULE, TARIFS, promo);
    assert.equal(somme(lignes), mensualiteDue(AVEC_MODULE, TARIFS, promo), `somme des lignes = montant dû (${JSON.stringify(promo)})`);
    assert.equal(lignes[0].libelle, 'Abonnement LabFlow');
    assert.deepEqual(lignes.slice(-2).map((l) => l.libelle), ['Module Comptabilité', 'Gérant comptable supplémentaire × 1'], 'module en dernier, à plein tarif');
  }
  const remise = lignesMensualite(AVEC_MODULE, TARIFS, PROMOS[1]);
  assert.deepEqual(remise.map((l) => l.libelle), ['Abonnement LabFlow', 'Remise (promotion)', 'Module Comptabilité', 'Gérant comptable supplémentaire × 1']);
  assert.equal(remise[1].montant, -Math.round(labflow / 2 * 100) / 100, 'la remise porte sur la partie Stock / Vente seulement');
  assert.equal(lignesMensualite(AVEC_MODULE, TARIFS, PROMOS[4])[1].libelle, 'Ajustement (prix convenu)');
  assert.equal(lignesMensualite({ ...AVEC_MODULE, nb_gerants_compta: 2 }, TARIFS, null)[2].libelle, 'Gérants comptables supplémentaires × 2');
});

test('cabinet : promotion sur tout son total, comme à l\'étape S2b', () => {
  const cabinet = { produit: 'compta', nb_gerants_compta: 2 };
  for (const promo of PROMOS) {
    assert.equal(mensualiteDue(cabinet, TARIFS, promo), applyPromoMensualite(180, promo));
    const lignes = lignesMensualite(cabinet, TARIFS, promo);
    assert.equal(somme(lignes), applyPromoMensualite(180, promo));
    assert.equal(lignes[0].libelle, 'LabFlow Compta — abonnement mensuel');
  }
});

test('le module compte à partir du mois qui suit son activation (heure de Tunis)', () => {
  assert.equal(configPourMois(AVEC_MODULE, '2026-10-01').module_compta_actif, false, 'mois d\'activation : pas facturé');
  assert.equal(configPourMois(AVEC_MODULE, '2026-09-01').module_compta_actif, false);
  assert.equal(configPourMois(AVEC_MODULE, '2026-11-01'), AVEC_MODULE, 'mois suivant : facturé');
  assert.equal(configPourMois(AVEC_MODULE, '2027-01-01'), AVEC_MODULE);
  const auMois = mensualiteDue(configPourMois(AVEC_MODULE, '2026-10-01'), TARIFS, null);
  assert.equal(auMois, computeMensuelTotalFromConfig(LABFLOW, TARIFS), 'mois d\'activation = mensualité d\'avant');
  assert.equal(lignesMensualite(configPourMois(AVEC_MODULE, '2026-10-01'), TARIFS, null), null);
  // Activé le 1er novembre à 0 h 30 à Tunis (31 octobre 23 h 30 UTC) : facturé à partir de décembre.
  const nuit = { ...AVEC_MODULE, module_compta_active_le: new Date('2026-10-31T23:30:00Z') };
  assert.equal(configPourMois(nuit, '2026-11-01').module_compta_actif, false);
  assert.equal(configPourMois(nuit, '2026-12-01'), nuit);
  // Cabinet, client sans le module : configuration inchangée.
  const cabinet = { produit: 'compta', nb_gerants_compta: 1 };
  assert.equal(configPourMois(cabinet, '2026-10-01'), cabinet);
  assert.equal(configPourMois(LABFLOW, '2026-10-01'), LABFLOW);
  assert.equal(configPourMois(null, '2026-10-01'), null);
});

test('désactivation : le module reste dû jusqu\'au mois de sa désactivation compris', () => {
  // Activé le 6 octobre (facturé à partir de novembre), désactivé le 10 janvier : novembre, décembre et janvier dus.
  const desactive = { ...AVEC_MODULE, module_compta_actif: false, module_compta_desactive_le: '2027-01-10T09:00:00Z' };
  assert.equal(configPourMois(desactive, '2026-10-01'), desactive, 'mois d\'activation : rien');
  for (const mois of ['2026-11-01', '2026-12-01', '2027-01-01']) {
    const cfg = configPourMois(desactive, mois);
    assert.equal(cfg.module_compta_actif, true, mois);
    assert.equal(mensualiteDue(cfg, TARIFS, null), Math.round((computeMensuelTotalFromConfig(LABFLOW, TARIFS) + 80) * 100) / 100, `${mois} : module et gérant dus`);
  }
  assert.equal(configPourMois(desactive, '2027-02-01'), desactive, 'après le mois de désactivation : plus rien');
  // Activé et désactivé le même mois : jamais facturé.
  const meme = { ...AVEC_MODULE, module_compta_actif: false, module_compta_desactive_le: '2026-10-20T09:00:00Z' };
  for (const mois of ['2026-10-01', '2026-11-01']) assert.equal(configPourMois(meme, mois), meme, mois);
  // Jamais activé (dates absentes) : configuration inchangée.
  const jamais = { ...LABFLOW, module_compta_actif: false, nb_gerants_compta: 3 };
  assert.equal(configPourMois(jamais, '2026-11-01'), jamais);
  assert.equal(lignesMensualite(configPourMois(jamais, '2026-11-01'), TARIFS, null), null);
  // Horodatage reçu en texte : lu à l'heure de Tunis, comme un objet Date.
  assert.equal(cleMois('2026-10-31T23:30:00Z'), '2026-11');
  assert.equal(cleMois('2026-10-01'), '2026-10');
});

test('mois de première facturation du module', () => {
  assert.equal(moisFacture('2026-10-06T10:00:00Z'), '2026-11-01');
  assert.equal(moisFacture('2026-12-15T10:00:00Z'), '2027-01-01');
  assert.equal(moisFacture(new Date('2026-10-31T23:30:00Z')), '2026-12-01', 'heure de Tunis');
  assert.equal(moisFacture(null), null);
});

test('migration 203 : fiche « Ma comptabilité » du manuel de LabFlow Compta, sans balise', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '203_compta_module_client.sql'), 'utf8');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  assert.match(sql, /'compta-ma-comptabilite', 'Ma comptabilité'/);
  assert.match(sql, /'\/ma-comptabilite'\)/);
  assert.match(sql, /false, true, 'compta'/);
  assert.match(sql, /ON CONFLICT \(slug\) DO NOTHING/);
  assert.match(sql, /ALTER TABLE abonnement_config ADD COLUMN IF NOT EXISTS module_compta_desactive_le TIMESTAMPTZ;/);
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  for (const encadre of sql.match(/:::[a-z]+/g)) assert.ok([':::attention', ':::astuce'].includes(encadre), encadre);
});
