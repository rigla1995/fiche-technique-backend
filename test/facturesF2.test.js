// Étape F2 (factures fournisseur, labflow-reprise/achats-compta/PLAN-FACTURES.md) : fiche du fournisseur (identité
// légale, matricule fiscal contrôlé), montant du timbre et lecture gardée sur la facture. Sans base de données.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { lireFiche } = require('../src/controllers/fournisseurController');
const { lireDonnees } = require('../src/controllers/approFactureController');

const aujourdhui = new Date().toISOString().slice(0, 10);
const donnees = (m = {}) => ({
  cible: { type: 'activite', id: 1 }, dateAppro: aujourdhui, fournisseurId: 2, refFacture: 'F-1', timbreFiscal: true,
  lignes: [{ articleId: 3, quantite: 1, prixUnitaire: 2, tauxTva: 19 }], ...m,
});
const refus = (fn, code) => assert.throws(fn, (e) => (e.corps?.code ?? e.code) === code, `refus ${code} attendu`);

test('lireFiche : nom obligatoire, champs rognés, matricule normalisé, email contrôlé', () => {
  const f = lireFiche({ nom: '  Ben  Salem ', matriculeFiscal: 'mf : 0897514e b m 000', email: 'a@b.tn', ville: ' Tunis ', telephone: '', adresse: null });
  assert.deepStrictEqual(f, { nom: 'Ben Salem', telephone: null, adresse: null, raisonSociale: null, email: 'a@b.tn', ville: 'Tunis', matriculeFiscal: '0897514E/B/M/000' });
  refus(() => lireFiche({ nom: ' ' }), 'NOM_REQUIS');
  refus(() => lireFiche({ nom: 'X', email: 'pas un email' }), 'EMAIL_INVALIDE');
  refus(() => lireFiche({ nom: 'X', matriculeFiscal: '123456A' }), 'MATRICULE_INVALIDE');
  refus(() => lireFiche({ nom: 'X', ville: 'v'.repeat(101) }), 'TROP_LONG');
  refus(() => lireFiche({ nom: 'n'.repeat(256) }), 'TROP_LONG');
  assert.strictEqual(lireFiche({ nom: 'X', matriculeFiscal: '' }).matriculeFiscal, null, 'matricule vide → null');
});

test('lireFiche partiel : seuls les champs présents ; le nom ne s\'efface pas', () => {
  assert.deepStrictEqual(lireFiche({ email: 'x@y.tn' }, { partiel: true }), { email: 'x@y.tn' });
  assert.deepStrictEqual(lireFiche({ matriculeFiscal: '1384297X/A/M/000' }, { partiel: true }), { matriculeFiscal: '1384297X/A/M/000' });
  refus(() => lireFiche({ nom: '' }, { partiel: true }), 'NOM_REQUIS');
  assert.deepStrictEqual(lireFiche({}, { partiel: true }), {});
});

test('lireDonnees : montant du timbre — 1 par défaut, 1,5 et 2 admis, autre refusé, ignoré sans timbre', () => {
  assert.strictEqual(lireDonnees(donnees()).timbreMontant, 1);
  assert.strictEqual(lireDonnees(donnees({ timbreMontant: 1.5 })).timbreMontant, 1.5);
  assert.strictEqual(lireDonnees(donnees({ timbreMontant: '2' })).timbreMontant, 2);
  refus(() => lireDonnees(donnees({ timbreMontant: 0.6 })), 'TIMBRE_INVALIDE');
  refus(() => lireDonnees(donnees({ timbreMontant: 'x' })), 'TIMBRE_INVALIDE');
  const sans = lireDonnees(donnees({ timbreFiscal: false, timbreMontant: 2 }));
  assert.deepStrictEqual([sans.timbre, sans.timbreMontant], [false, 0]);
});

test('lireDonnees : lecture gardée — champs connus seulement, bornés ; source inconnue → rien', () => {
  const v = lireDonnees(donnees({ lecture: {
    source: 'pdf', matricule: '1384297X/A/M/000', nom: 'N'.repeat(500), numero: 'F-1', date: aujourdhui, fournisseur: 'reconnu', duree: 0.4,
    totaux: { ht: 2, tva: 0.38, timbre: 1, ttc: 3.38, fodec: null, remise: 'x', autre: 5 }, injection: '<script>',
  } }));
  assert.deepStrictEqual(Object.keys(v.lecture).sort(), ['date', 'duree', 'fournisseur', 'matricule', 'nom', 'numero', 'source', 'totaux']);
  assert.strictEqual(v.lecture.nom.length, 200);
  assert.deepStrictEqual(v.lecture.totaux, { ht: 2, tva: 0.38, timbre: 1, ttc: 3.38, fodec: null, remise: null });
  assert.strictEqual(lireDonnees(donnees({ lecture: { source: 'scanner' } })).lecture, null);
  assert.strictEqual(lireDonnees(donnees({ lecture: 'texte' })).lecture, null);
  assert.strictEqual(lireDonnees(donnees({ lecture: { source: 'ocr', fournisseur: 'pirate' } })).lecture.fournisseur, null);
  assert.strictEqual(lireDonnees(donnees()).lecture, null);
});

test('migration 223 : additive, matricule unique par compte, lecture sur la facture', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '223_fournisseurs_identite.sql'), 'utf8');
  for (const c of ['raison_sociale', 'matricule_fiscal', 'email', 'ville']) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c}`));
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ux_fournisseurs_matricule\s+ON fournisseurs \(entreprise_id, matricule_fiscal\)\s+WHERE matricule_fiscal IS NOT NULL/);
  assert.match(sql, /ALTER TABLE factures ADD COLUMN IF NOT EXISTS lecture JSONB/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ''), /\b(DROP|DELETE|UPDATE)\b/i, 'aucune donnée existante modifiée');
  for (const t of ['factures', 'stock_produits_transformes', 'stock_labo_pt_daily']) {
    assert.match(sql, new RegExp(`CREATE INDEX IF NOT EXISTS \\w+ ON ${t} \\(fournisseur_id\\)`), `index des références : ${t}`);
  }
});
