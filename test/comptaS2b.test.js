// LabFlow Compta, étape S2b (labflow-reprise/achats-compta/PLAN-S2.md) : postes du cabinet et du module, mensualité
// d'un compte LabFlow inchangée, postes figés (D8), facture à N lignes, périmètre du rôle « comptable » (D5),
// migration 202. Sans base de données (l'essai de bout en bout est scripts/test-compta-s2b.js).
//   node --test test/comptaS2b.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-comptaS2b-0123456789abcdef0123456789abcdef0123';
const jwt = require('jsonwebtoken');
const { postesCompta, totalPostes, CLES_TARIFS_COMPTA } = require('../src/compta/tarifsCompta');
const { computeMensuelTotalFromConfig, lignesMensualite, TARIF_KEYS_SURCHARGEABLES } = require('../src/services/pricingEngine');
const { perimetreComptable } = require('../src/compta/perimetre');
const { buildFacture } = require('../docuseal-templates/generate');

const TARIFS = {
  prix_base_activite_premium: 200, prix_base_activite_basique: 150, remise_2eme_sans_labo: 20, remise_3eme_plus_sans_labo: 40,
  remise_avec_labo: 30, labo_sup_mensuel: 160, gerant_sup_mensuel: 80,
  compta_cabinet_mensuel: 120, compta_gerant_cabinet_mensuel: 30, compta_mise_en_route: 250,
  compta_module_mensuel: 60, compta_gerant_client_mensuel: 20,
};
const LABFLOW = { nb_activites: 2, nb_labos: 1, nb_gerants: 1, nb_acheteurs: 0, formule_activites: 'premium' };

test('compte LabFlow sans le module : total inchangé, aucun poste Compta, aucune ligne figée', () => {
  const avant = computeMensuelTotalFromConfig(LABFLOW, TARIFS);
  // Mêmes champs que la lecture « config + produit » (migration 202 : module inactif, 0 gérant comptable).
  const lue = { ...LABFLOW, produit: 'labflow', module_compta_actif: false, nb_gerants_compta: 0 };
  assert.equal(computeMensuelTotalFromConfig(lue, TARIFS), avant);
  assert.deepEqual(postesCompta(lue, TARIFS), []);
  assert.equal(lignesMensualite(lue, TARIFS, { type: 'percent_off', applies_to: 'mensualite', discount_mensualite: 50 }), null);
});

test('cabinet : abonnement + gérants achetés, rien de LabFlow', () => {
  const cabinet = { produit: 'compta', nb_activites: 1, nb_labos: 3, nb_gerants: 4, nb_gerants_compta: 2 };
  const postes = postesCompta(cabinet, TARIFS);
  assert.deepEqual(postes.map((p) => [p.code, p.montant]), [['compta_cabinet', 120], ['compta_gerants_cabinet', 60]]);
  assert.equal(postes[1].libelle, 'Gérants supplémentaires × 2');
  assert.equal(computeMensuelTotalFromConfig(cabinet, TARIFS), 180, 'activités, labos et gérants LabFlow ignorés');
  assert.deepEqual(postesCompta({ produit: 'compta', nb_gerants_compta: 1 }, TARIFS)[1].libelle, 'Gérant supplémentaire × 1');
  assert.equal(computeMensuelTotalFromConfig({ produit: 'compta' }, {}), 0, 'tarifs absents : 0, jamais NaN');
});

test('client avec le module (S2c) : mensualité LabFlow + module + gérants comptables', () => {
  const avecModule = { ...LABFLOW, module_compta_actif: true, nb_gerants_compta: 1 };
  const labflow = computeMensuelTotalFromConfig(LABFLOW, TARIFS);
  assert.equal(computeMensuelTotalFromConfig(avecModule, TARIFS), Math.round((labflow + 60 + 20) * 100) / 100);
  const lignes = lignesMensualite(avecModule, TARIFS, null);
  assert.deepEqual(lignes.map((l) => l.libelle), ['Abonnement LabFlow', 'Module Comptabilité', 'Gérant supplémentaire × 1']);
  assert.equal(lignes[0].montant, labflow);
});

test('postes figés : la somme des lignes égale le montant dû, remise comprise', () => {
  const cabinet = { produit: 'compta', nb_gerants_compta: 2 };
  const somme = (l) => Math.round(l.reduce((s, x) => s + x.montant, 0) * 100) / 100;
  assert.deepEqual(lignesMensualite(cabinet, TARIFS, null).map((l) => l.montant), [120, 60]);
  for (const promo of [
    { type: 'percent_off', applies_to: 'mensualite', discount_mensualite: 33 },
    { type: 'fixed_price', applies_to: 'les_deux', fixed_mensualite: 99.99 },
    { type: 'free_months', applies_to: 'mensualite' },
  ]) {
    const lignes = lignesMensualite(cabinet, TARIFS, promo);
    assert.equal(lignes[lignes.length - 1].libelle, 'Remise (promotion)');
    const du = promo.type === 'free_months' ? 0 : promo.type === 'fixed_price' ? 99.99 : Math.round(180 * 0.67 * 100) / 100;
    assert.equal(somme(lignes), du, promo.type);
  }
  assert.equal(lignesMensualite(cabinet, TARIFS, { type: 'percent_off', applies_to: 'onboarding', discount_onboarding: 50 }).length, 2,
    'une promotion sur la mise en route ne touche pas la mensualité');
  const auDessus = lignesMensualite(cabinet, TARIFS, { type: 'fixed_price', applies_to: 'mensualite', fixed_mensualite: 200 });
  assert.deepEqual(auDessus[2], { libelle: 'Ajustement (prix convenu)', montant: 20 }, 'un prix convenu au-dessus du total n\'est pas une remise');
  assert.equal(somme(auDessus), 200);
});

test('les 5 tarifs de LabFlow Compta ne sont jamais surchargeables par domaine', () => {
  assert.equal(CLES_TARIFS_COMPTA.length, 5);
  for (const cle of CLES_TARIFS_COMPTA) assert.ok(!TARIF_KEYS_SURCHARGEABLES.includes(cle), cle);
  assert.equal(totalPostes([]), 0);
});

test('facture d\'un cabinet : PDF à N lignes, déterministe', async () => {
  const data = {
    numero: 'LF-2026-00042', dateFacture: '2026-10-06', periodeLabel: 'octobre 2026', clientNom: 'Cabinet Essai',
    clientEmail: 'cabinet@example.com', montantHt: 75.630, montantTva: 14.370, montantTtc: 90, tvaRate: 19,
    produit: 'compta',
    lignes: [{ libelle: 'LabFlow Compta — abonnement mensuel', montant: 120 }, { libelle: 'Gérants supplémentaires × 2', montant: 60 }, { libelle: 'Remise (promotion)', montant: -90 }],
  };
  const a = await buildFacture(null, data);
  const b = await buildFacture(null, data);
  assert.ok(Buffer.isBuffer(a) && a.slice(0, 4).toString() === '%PDF');
  assert.ok(a.equals(b), 'même facture à l\'email et au téléchargement');
  const sansLignes = await buildFacture(null, { ...data, lignes: undefined });
  assert.ok(!a.equals(sansLignes), 'les lignes changent la facture');
});

test('périmètre du rôle comptable (D5) : Compta, manuel et notifications seulement', () => {
  const jeton = (role) => jwt.sign({ userId: 7, role }, process.env.JWT_SECRET);
  const passer = (role, chemin, enAdresse = false) => {
    let suivi = false;
    let code = null;
    const req = { path: chemin, headers: enAdresse ? {} : { authorization: `Bearer ${jeton(role)}` }, query: enAdresse ? { token: jeton(role) } : {} };
    const res = { status(c) { code = c; return this; }, json() { return this; } };
    perimetreComptable(req, res, () => { suivi = true; });
    return suivi ? 'suivi' : code;
  };
  for (const chemin of ['/compta/acces', '/compta', '/manuel', '/notifications', '/notifications/stream']) assert.equal(passer('comptable', chemin), 'suivi', chemin);
  for (const chemin of ['/unites', '/abonnements/mon-abonnement', '/entreprise', '/comptabilite', '/manuels', '/ai-assistant/chat']) assert.equal(passer('comptable', chemin), 403, chemin);
  assert.equal(passer('comptable', '/unites', true), 403, 'jeton dans l\'adresse');
  for (const role of ['client', 'gerant', 'super_admin', 'boss', 'acheteur']) assert.equal(passer(role, '/unites'), 'suivi', role);
  let suivi = false;
  perimetreComptable({ path: '/unites', headers: { authorization: 'Bearer jeton.invalide.ici' }, query: {} }, {}, () => { suivi = true; });
  assert.ok(suivi, 'jeton invalide : la route répond elle-même (401)');
});

test('migration 202 : rôle, adresses sans casse, produit, postes, tarifs à 0, schéma compta, fiches du manuel', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '202_compta_comptes_abonnements.sql'), 'utf8');
  assert.ok(!sql.includes('\r'), 'migration en LF');
  assert.match(sql, /ARRAY\['super_admin','client','gerant','acheteur','boss','comptable'\]/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS utilisateurs_email_lower_key ON utilisateurs \(LOWER\(email\)\)/);
  assert.match(sql, /RAISE NOTICE/, 'doublons de casse : un avis, jamais un échec');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS produit VARCHAR\(10\) NOT NULL DEFAULT 'labflow'/);
  assert.match(sql, /ALTER TABLE paiements ADD COLUMN IF NOT EXISTS lignes JSONB;/);
  for (const cle of CLES_TARIFS_COMPTA) assert.match(sql, new RegExp(`\\('${cle}', 0, '`), cle);
  assert.match(sql, /'activer_module_compta'/);
  assert.match(sql, /titulaire_id INTEGER NOT NULL REFERENCES utilisateurs\(id\) ON DELETE RESTRICT/);
  assert.match(sql, /personne_id    INTEGER REFERENCES utilisateurs\(id\) ON DELETE SET NULL/);
  for (const slug of ['compta-cabinet', 'compta-abonnement']) assert.match(sql, new RegExp(`'${slug}'`));
  assert.ok(!/\[\[/.test(sql), 'fiches de LabFlow Compta jamais balisées');
});
