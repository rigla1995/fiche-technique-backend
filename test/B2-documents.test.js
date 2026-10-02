// Lot 2b, B2 — documents : valeurs du contrat, avenant, PDF legacy, facture d'appro (spec docs/lot-2b-spec.md §8.2, §8.3).
//   node --test test/B2-documents.test.js
//
// Référence : les mêmes modules au commit du socle (62288e4), lus par git show. Le texte écrit dans chaque PDF est
// relevé en enregistrant les appels de PDFDocument.prototype.text (après pdfTexte quand l'option est posée).
// 1. Vocabulaire par défaut : valeurs envoyées à DocuSeal et textes des documents IDENTIQUES à la référence
//    (seule différence admise : « → » écrit « › » dans les documents qui prennent pdfTexte, spec §11.1.2).
// 2. Hôtellerie, Céramique, miroir : les VALEURS suivent le domaine ; noms de champs DocuSeal, libellés fixes du
//    contrat (lot 3) et formule inchangés.
// Sans base de données ni envoi : le pool et le module `resend` sont des faux.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');

const RACINE = path.resolve(__dirname, '..');
const REFERENCE = '62288e4';

const remplacer = (relatif, exports) => {
  const chemin = require.resolve(path.join(RACINE, relatif));
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports, children: [], paths: [] };
};
const fauxPool = { query: async () => ({ rows: [], rowCount: 0 }), connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }), on: () => {} };
remplacer('src/config/database', fauxPool);
const cheminResend = require.resolve('resend', { paths: [RACINE] });
require.cache[cheminResend] = {
  id: cheminResend, filename: cheminResend, loaded: true, children: [], paths: [],
  exports: { Resend: class { constructor() { this.emails = { send: async () => { throw new Error('aucun envoi dans ce test'); } }; } } },
};

const chargerReference = (relatif) => {
  let source;
  try {
    source = execFileSync('git', ['-C', RACINE, 'show', `${REFERENCE}:${relatif}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  } catch {
    return null;
  }
  const chemin = path.join(RACINE, path.dirname(relatif), `__reference_${path.basename(relatif)}`);
  const m = new Module(chemin, module);
  m.filename = chemin;
  m.paths = Module._nodeModulePaths(path.dirname(chemin));
  m._compile(source, chemin);
  return m.exports;
};

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

const { pdfTexte, LIBELLES_FACTURE_APPRO } = require('../docuseal-templates/generate');
const contrat = require('../src/services/contractPdfService');
const pdfService = require('../src/services/pdfService');
const { buildFactureApproPdf, libellesFactureAppro } = require('../src/services/factureApproPdf');
const { buildContractPricingFields } = require('../src/controllers/clientsController');
const ref = {
  contrat: chargerReference('src/services/contractPdfService.js'),
  pdf: chargerReference('src/services/pdfService.js'),
  clients: chargerReference('src/controllers/clientsController.js'),
};
const sansRef = !ref.contrat || !ref.pdf || !ref.clients;

// Les références et dates du jour varient d'une génération à l'autre : écartées de la comparaison.
const stables = (textes) => textes.filter((t) => !/^Réf\. |^(Émis|Établi) le |généré le /.test(t));

const PRICING = {
  abonnementId: 12, baseOnboarding: 600, effOnboarding: 600, baseMensuel: 300, effMensuel: 240,
  promoMens: { type: 'percent' }, promoOb: null, promoMonths: 3, baseResumeDate: new Date('2026-12-01'), hasPromo: true,
  formuleActivites: 'premium', nbAcheteurs: 20, palierAcheteurs: 20, nbActivites: 2, nbLabos: 1, nbGerants: 2,
};
const AJOUTS = { addActivites: 2, addLabos: 1, addGerants: 1, setAcheteurs: 50 };

test('défaut : valeurs DocuSeal identiques à la référence (contrat et avenant, flux template)', { skip: sansRef && 'git indisponible' }, () => {
  for (const p of [PRICING, { ...PRICING, palierAcheteurs: null, hasPromo: false, formuleActivites: null }, null]) {
    assert.deepEqual(buildContractPricingFields(p, 'Restauration', vocabDefaut), ref.clients.buildContractPricingFields(p, 'Restauration'));
    assert.deepEqual(buildContractPricingFields(p, null), ref.clients.buildContractPricingFields(p, null), 'sans voc : défaut');
  }
  for (const ajouts of [AJOUTS, { addActivites: 1 }, { addLabos: 2, addGerants: 2 }, {}]) {
    const args = { ajouts, abonnementId: 12, abonnementDate: '2026-03-01', pricing: PRICING };
    assert.deepEqual(contrat.avenantExtraFields({ ...args, voc: vocabDefaut }), ref.contrat.avenantExtraFields(args));
    assert.deepEqual(contrat.avenantExtraFields(args), ref.contrat.avenantExtraFields(args), 'sans voc : défaut');
  }
});

test('domaines : VALEURS du domaine, noms de champs et formule inchangés', () => {
  const attendus = {
    hotellerie: ['Palier jusqu\'à 20 clients professionnels', '+2 services   ·   +1 cuisine centrale   ·   +1 compte responsable de service   ·   Option Clients professionnels → palier jusqu\'à 50'],
    ceramique: ['Palier jusqu\'à 20 revendeurs', '+2 points de vente   ·   +1 site de production   ·   +1 compte responsable de site   ·   Option Revendeurs → palier jusqu\'à 50'],
    miroir: ['Palier jusqu\'à 20 clientes', '+2 locaux   ·   +1 usine centrale   ·   +1 compte animatrice   ·   Option Clientes → palier jusqu\'à 50'],
  };
  for (const [domaine, [palier, ajout]] of Object.entries(attendus)) {
    const voc = VOC[domaine];
    const pf = buildContractPricingFields(PRICING, 'Domaine X', voc);
    assert.deepEqual(pf.extraFields.map((f) => f.name), ['Formule', 'Option Acheteurs', 'Détail promotion', 'Mensualité après promo', 'Reprise prix de base', 'Domaine']);
    assert.equal(pf.extraFields[0].default_value, 'Activité Premium', 'formule : nom commercial inchangé');
    assert.equal(pf.extraFields[1].default_value, palier);
    const champs = contrat.avenantExtraFields({ ajouts: AJOUTS, pricing: PRICING, voc });
    assert.deepEqual(champs, [
      { name: 'Capacité ajoutée', default_value: ajout },
      { name: 'Formule', default_value: 'Activité Premium' },
      { name: 'Option Acheteurs', default_value: palier },
    ]);
  }
});

const CLIENT = { nom: 'Le Carthage → Lac', email: 'a@b.tn', telephone: '+216', adresse: 'Rue' };
const CONFIG = { nbActivites: 2, nbLabos: 1, nbGerants: 2, formuleActivites: 'premium', composants: [], domaineNom: 'Restauration', domaineSlug: 'restauration' };

test('défaut : contrat et avenant PDF rempli identiques à la référence ; pdfTexte seulement sur option', { skip: sansRef && 'git indisponible' }, async () => {
  const args = { abonnementId: 12, client: CLIENT, config: CONFIG, pricing: PRICING, strict: false, abonnementDate: '2026-03-01', dateContrat: '2026-03-02' };
  const avant = await releve(() => ref.contrat.buildContratDocument(args));
  assert.ok(avant.includes('palier jusqu\'à 20 acheteurs'), 'non-vacuité : la valeur est relevée');
  assert.deepEqual(stables(await releve(() => contrat.buildContratDocument({ ...args, voc: vocabDefaut }))), stables(avant), 'document à signer : identique');
  assert.deepEqual(stables(await releve(() => contrat.buildContratDocument(args))), stables(avant), 'sans voc : défaut');
  // Régénéré / aperçu : pdfTexte (« → » du nom saisi écrit « › »), mêmes textes sinon
  assert.deepEqual(stables(await releve(() => contrat.buildContratDocument({ ...args, voc: vocabDefaut, pdfTexte: true }))), stables(avant).map(pdfTexte));
  assert.ok(!stables(avant).every((t) => t === pdfTexte(t)), 'non-vacuité : le nom saisi porte un « → »');

  const argsAv = { demandeId: 7, client: CLIENT, pricing: PRICING, ajouts: AJOUTS, abonnementId: 12, abonnementDate: '2026-03-01' };
  const avantAv = await releve(() => ref.contrat.buildAvenantDocument(argsAv));
  assert.deepEqual(stables(await releve(() => contrat.buildAvenantDocument({ ...argsAv, voc: vocabDefaut }))), stables(avantAv), 'avenant à signer : identique, jamais pdfTexte');
});

test('domaines : valeurs du contrat et de l\'avenant PDF rempli ; libellés fixes (lot 3) inchangés', async () => {
  const voc = VOC.hotellerie;
  const textes = await releve(() => contrat.buildContratDocument({ abonnementId: 1, client: CLIENT, config: CONFIG, pricing: PRICING, strict: false, voc }));
  assert.ok(textes.includes('palier jusqu\'à 20 clients professionnels'));
  for (const fixe of ['Option Acheteurs', 'Points de vente (activités)', 'Laboratoires de production', 'Comptes gérants', 'Activité Premium']) {
    assert.ok(textes.includes(fixe), `texte fixe ou formule inchangé : ${fixe}`);
  }
  const av = await releve(() => contrat.buildAvenantDocument({ demandeId: 2, client: CLIENT, pricing: PRICING, ajouts: AJOUTS, voc }));
  assert.ok(av.includes('+2 services   ·   +1 cuisine centrale   ·   +1 compte responsable de service   ·   Option Clients professionnels → palier jusqu\'à 50'), av.join(' | '));
});

const AVENANT_LEGACY = {
  nom: 'Le Carthage', notesAdmin: 'Note', nbActivitesAdded: 2, nbLabosAdded: 1, nbGerantsAdded: 1, acheteursCible: 50,
  nbActivites: 3, nbLabos: 2, nbGerants: 1, activiteCost: 10, laboCost: 20, gerantCost: 5, newMensuel: 60,
  formuleActivites: 'premium', nbAcheteurs: 50, acheteursCost: 25, promoApplied: false, effectifMensuel: 60,
  dateAvenant: '2026-10-01T10:00:00.000Z', ancienMensuel: 40,
};
const CONTRAT_LEGACY = {
  nom: 'Le Carthage', email: 'a@b.tn', telephone: '+216', adresse: 'Rue', montantMensuel: 300,
  nbActivites: 2, nbLabos: 1, nbGerants: 2, formuleActivites: 'basique', nbAcheteurs: 15, dateContrat: '2026-10-01',
};

test('défaut : avenant et contrat legacy (pdfService) identiques à la référence, « → » écrit « › »', { skip: sansRef && 'git indisponible' }, async () => {
  for (const [nom, donnees] of [['generateAvenantPdf', AVENANT_LEGACY], ['generateContratPdf', CONTRAT_LEGACY]]) {
    const avant = stables(await releve(() => ref.pdf[nom](donnees)));
    assert.ok(avant.length > 20, `non-vacuité (${nom})`);
    assert.deepEqual(stables(await releve(() => pdfService[nom](donnees, vocabDefaut))), avant.map(pdfTexte), nom);
    assert.deepEqual(stables(await releve(() => pdfService[nom](donnees))), avant.map(pdfTexte), `${nom} sans voc : défaut`);
  }
  assert.ok((await releve(() => ref.pdf.generateAvenantPdf(AVENANT_LEGACY))).includes('+2 activités   ·   +1 labo   ·   +1 gérant   ·   Option Acheteurs → palier jusqu\'à 50'));
});

test('domaines : avenant legacy en vocabulaire complet ; contrat legacy, la valeur seulement', async () => {
  const attendus = {
    hotellerie: ['+2 services   ·   +1 cuisine centrale   ·   +1 responsable de service   ·   Option Clients professionnels › palier jusqu\'à 50',
      ['Services (Premium)', 'Cuisines centrales', 'Responsables de service', 'Option Clients professionnels'], 'palier jusqu\'à 20 clients professionnels'],
    ceramique: ['+2 points de vente   ·   +1 site de production   ·   +1 responsable de site   ·   Option Revendeurs › palier jusqu\'à 50',
      ['Points de vente (Premium)', 'Sites de production', 'Responsables de site', 'Option Revendeurs'], 'palier jusqu\'à 20 revendeurs'],
    miroir: ['+2 locaux   ·   +1 usine   ·   +1 animatrice   ·   Option Clientes › palier jusqu\'à 50',
      ['Locaux (Premium)', 'Usines', 'Animatrices', 'Option Clientes'], 'palier jusqu\'à 20 clientes'],
  };
  for (const [domaine, [ajout, lignes, palier]] of Object.entries(attendus)) {
    const voc = VOC[domaine];
    const av = await releve(() => pdfService.generateAvenantPdf(AVENANT_LEGACY, voc));
    assert.ok(av.includes(ajout), `${domaine} : ${av.join(' | ')}`);
    for (const l of lignes) assert.ok(av.includes(l), `${domaine} : ligne ${l}`);
    const ct = await releve(() => pdfService.generateContratPdf(CONTRAT_LEGACY, voc));
    assert.ok(ct.includes(palier), `${domaine} : ${ct.join(' | ')}`);
    for (const fixe of ['Activités', 'Formule d\'activités', 'Activité Basique', 'Labos', 'Gérants', 'Option Acheteurs']) {
      assert.ok(ct.includes(fixe), `${domaine} : libellé du contrat legacy inchangé (lot 3) : ${fixe}`);
    }
  }
});

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
