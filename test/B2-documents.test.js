// Lot 2b, B2 — documents : facture d'appro (spec docs/lot-2b-spec.md §8.2, §8.3).
//   node --test test/B2-documents.test.js
//
// Le texte écrit dans chaque PDF est relevé en enregistrant les appels de PDFDocument.prototype.text (après pdfTexte,
// que la facture d'appro prend toujours).
// 1. Vocabulaire par défaut : libellés de la facture d'appro = textes d'avant le lot 2b, sauf le sous-titre
//    labo→labo (spec §11.1.1).
// 2. Hôtellerie, Céramique, miroir : le document suit le vocabulaire du compte.
// Lot 3, étape 5 : plus de contrat, d'avenant ni de résiliation (LabFlow est sans engagement). Les 6 tests des
// documents de contrat sont retirés avec leur code (contractPdfService supprimé ; generateAvenantPdf et
// generateContratPdf retirées de pdfService) : valeurs DocuSeal de l'avenant, contrat et avenant PDF remplis, avenant
// et contrat legacy. Les factures restent comparées à l'octet dans test/B2-pdfTexte.test.js.
// Sans base de données ni envoi : factureApproPdf ne charge ni le pool ni `resend`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.resolve(__dirname, '..');

// Relevé des textes écrits : installé AVANT toute création de document.
const PDFDocument = require('pdfkit');
const ecrits = [];
const textOrigine = PDFDocument.prototype.text;
PDFDocument.prototype.text = function texteReleve(s, ...reste) {
  if (typeof s === 'string') ecrits.push(s);
  return textOrigine.call(this, s, ...reste);
};
const releve = async (fn) => { ecrits.length = 0; await fn(); return [...ecrits]; };

const { vocabDefaut, vocabDuLexique, resoudreLexique } = require('../src/utils/vocab');
const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');
const ESSAIS = JSON.parse(fs.readFileSync(path.join(RACINE, 'test/vocab-lexiques-test.json'), 'utf8'));
const VOC = {
  hotellerie: vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie)),
  ceramique: vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.ceramique)),
  miroir: vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.miroir)),
};

const { LIBELLES_FACTURE_APPRO } = require('../docuseal-templates/generate');
const { buildFactureApproPdf, libellesFactureAppro } = require('../src/services/factureApproPdf');

test('facture d\'appro : libellés par défaut = textes d\'avant le lot, sauf le sous-titre labo→labo (§11.1.1)', () => {
  const versActivite = libellesFactureAppro({ activite_id: 3, labo_id: null }, vocabDefaut);
  assert.deepEqual(versActivite, LIBELLES_FACTURE_APPRO);
  const versLabo = libellesFactureAppro({ activite_id: null, labo_id: 4 }, vocabDefaut);
  assert.deepEqual(versLabo, { ...LIBELLES_FACTURE_APPRO, sousTitreTransfert: 'Transfert labo → labo' });
  assert.deepEqual(libellesFactureAppro({ activite_id: 3 }), versActivite, 'sans voc : défaut');
});

test('facture d\'appro : document rendu dans le vocabulaire du compte (req.voc), pdfTexte toujours', async () => {
  const f = {
    ref_facture: 'FAC-1', date_facture: '2026-09-30', type_source: 'transfert', activite_id: null, labo_id: 4,
    activite_nom: null, labo_nom: 'Bloc chaud', fournisseur_nom: null, entreprise_nom: 'Le Carthage',
    montant_ht: 10, montant_tva: 1.9, montant_ttc: 11.9,
  };
  const lignes = [{ ingredient_nom: 'Sauce', unite_nom: 'kg', quantite: 1, prix_unitaire: 10, taux_tva: 19 }];
  const defaut = await releve(() => buildFactureApproPdf(f, lignes, vocabDefaut));
  assert.ok(defaut.includes('Transfert labo › labo  ·  Labo : Bloc chaud'), defaut.join(' | '));
  for (const t of ['FACTURE D\'APPROVISIONNEMENT', 'Facture d\'approvisionnement', 'FOURNISSEUR ET CLIENT', 'FOURNISSEUR', 'Fournisseur']) assert.ok(defaut.includes(t), t);
  const hot = await releve(() => buildFactureApproPdf({ ...f, activite_id: 9, labo_id: null, activite_nom: 'Terrasse' }, lignes, VOC.hotellerie));
  assert.ok(hot.includes('Livraison interne cuisine › service  ·  Service : Terrasse'), hot.join(' | '));
  const cer = await releve(() => buildFactureApproPdf({ ...f, type_source: 'manuel', fournisseur_nom: 'Metro' }, lignes, VOC.ceramique));
  for (const t of ['FACTURE DE RÉCEPTION', 'Facture de réception', 'Réception fournisseur — Metro  ·  Site : Bloc chaud']) assert.ok(cer.includes(t), `${t} : ${cer.join(' | ')}`);
  const mir = await releve(() => buildFactureApproPdf({ ...f, type_source: 'manuel' }, lignes, VOC.miroir));
  for (const t of ['FACTURE DE RENTRÉE', 'ENSEIGNE ET CLIENT', 'ENSEIGNE', 'Enseigne', 'Rentrée enseigne — Enseigne  ·  Usine : Bloc chaud']) assert.ok(mir.includes(t), `${t} : ${mir.join(' | ')}`);
  assert.ok(mir.some((t) => t.includes('lignes d\'armoire saisies — il ne remplace pas la facture originale de l\'enseigne.')));
});
