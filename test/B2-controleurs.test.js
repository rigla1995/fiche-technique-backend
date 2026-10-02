// Lot 2b, B2 — vocabulaire des documents et messages des contrôleurs du lot (spec docs/lot-2b-spec.md §8.2, §8.3, §9).
//   node --test test/B2-controleurs.test.js
//
// 1. Origine du vocabulaire de chaque document (§8.2) : aperçu du wizard → vocabDuDomaine(domaine du corps) ;
//    aperçu et traitement d'un avenant legacy → vocabForClient(demande.client_id) ; contrat régénéré →
//    vocabForClient(clientId) ; avenant demandé par le client → req.voc ; création → vocabDuDomaine ; facture
//    d'appro → req.voc. pdfTexte posé SEULEMENT par le contrat régénéré et l'aperçu du wizard.
// 2. Messages balisés (point de rendu `message`) : rendus par défaut à l'identique de l'existant, terme du domaine sinon.
// Sans base de données : pool, documents et vocabulaire du compte sont des faux.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.resolve(__dirname, '..');
const remplacer = (relatif, exports) => {
  const chemin = require.resolve(path.join(RACINE, relatif));
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports, children: [], paths: [] };
};

let repondreA = () => ({ rows: [] });
const requetes = [];
const repondre = async (sql, params = []) => {
  const texte = String(sql).replace(/\s+/g, ' ').trim();
  requetes.push({ texte, params });
  return repondreA(texte, params) || { rows: [] };
};
remplacer('src/config/database', { query: repondre, connect: async () => ({ query: repondre, release: () => {} }), on: () => {} });
const cheminResend = require.resolve('resend', { paths: [RACINE] });
require.cache[cheminResend] = {
  id: cheminResend, filename: cheminResend, loaded: true, children: [], paths: [],
  exports: { Resend: class { constructor() { this.emails = { send: async () => { throw new Error('aucun envoi dans ce test'); } }; } } },
};

// Vocabulaires marqués : on vérifie QUEL vocabulaire chaque document reçoit.
const vocabCompteReel = require('../src/utils/vocabCompte');
const marque = (origine, id) => ({ marque: `${origine}:${id}` });
remplacer('src/utils/vocabCompte', {
  ...vocabCompteReel,
  vocabDuDomaine: async (id) => marque('domaine', id),
  vocabForClient: async (id) => marque('client', id),
});
const appels = [];
remplacer('src/services/contractPdfService', {
  buildContratDocument: async (args) => { appels.push(['buildContratDocument', args]); return { base64: 'JVBE', ref: 'CTR-0', documentName: 'x' }; },
  buildAvenantDocument: async (args) => { appels.push(['buildAvenantDocument', args]); return { base64: 'JVBE', ref: 'AVN-0', documentName: 'x' }; },
  buildResiliationDocument: async () => ({ base64: 'JVBE', ref: 'RES-0', documentName: 'x' }),
  avenantExtraFields: (args) => { appels.push(['avenantExtraFields', args]); return []; },
});
remplacer('src/services/pdfService', {
  generateAvenantPdf: async (donnees, voc) => { appels.push(['generateAvenantPdf', donnees, voc]); return 'JVBE'; },
  generateContratPdf: async (donnees, voc) => { appels.push(['generateContratPdf', donnees, voc]); return 'JVBE'; },
  generateFacturePdf: async () => 'JVBE',
});

const { vocabDefaut, vocabDuLexique, resoudreLexique, rendre } = require('../src/utils/vocab');
const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');
const ESSAIS = JSON.parse(fs.readFileSync(path.join(RACINE, 'test/vocab-lexiques-test.json'), 'utf8'));
const VOC = {
  hotellerie: vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie)),
  ceramique: vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.ceramique)),
  miroir: vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.miroir)),
};

const abonnement = require('../src/controllers/abonnementController');
const support = require('../src/controllers/supportController');

const fauxRes = () => ({
  statusCode: 200, corps: undefined,
  status(code) { this.statusCode = code; return this; },
  json(corps) { this.corps = corps; return this; },
});

test('aperçu du contrat (wizard) : vocabulaire du domaine du CORPS, pdfTexte posé', async () => {
  appels.length = 0;
  repondreA = (texte, params) => (texte.startsWith('SELECT id, nom, slug FROM domaines_activite') ? { rows: [{ id: params[0], nom: 'Hôtellerie', slug: 'hotellerie' }] } : { rows: [] });
  const res = fauxRes();
  await abonnement.previewContratPdf({ body: { nom: 'X', email: 'x@test.invalid', nbActivites: 1, domaineId: 5 } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
  const [, args] = appels.find(([n]) => n === 'buildContratDocument');
  assert.deepEqual(args.voc, marque('domaine', 5));
  assert.equal(args.pdfTexte, true);
});

const DEMANDE = { id: 3, client_id: 42, type: 'supplement', nb_activites_supp: 1, nb_labos_supp: 1, nb_gerants_supp: 0, nb_acheteurs_cible: 20, client_nom: 'Compte' };
test('aperçu d\'un avenant legacy (admin) : vocabulaire du compte DESTINATAIRE', async () => {
  appels.length = 0;
  repondreA = (texte) => {
    if (texte.includes('FROM support_demandes sd')) return { rows: [DEMANDE] };
    if (texte.includes('FROM abonnement_config ac')) return { rows: [{ nb_activites: 1, nb_labos: 1, nb_gerants: 0, nb_acheteurs: 0, domaine_id: null, formule_activites: 'premium' }] };
    return { rows: [] };
  };
  const res = fauxRes();
  await support.previewAvenant({ params: { id: '3' }, user: { id: 1, role: 'super_admin' } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
  const appel = appels.find(([n]) => n === 'generateAvenantPdf');
  assert.ok(appel, 'generateAvenantPdf appelé');
  assert.deepEqual(appel[2], marque('client', 42));
});

// ── Lecture des sources : origine du vocabulaire et option pdfTexte aux sites qui ne s'exécutent pas sans base ──
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8').replace(/\r\n/g, '\n');
const corpsDe = (src, debut) => {
  const i = src.indexOf(debut);
  assert.ok(i >= 0, `introuvable : ${debut}`);
  const fin = src.indexOf('\n};\n', i);
  return src.slice(i, fin);
};
const fichiersJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return fichiersJs(p);
  return e.name.endsWith('.js') ? [p] : [];
});

test('sources : vocabulaire de chaque document et option pdfTexte (spec §8.2, §8.3)', () => {
  const ab = lire('src/controllers/abonnementController.js');
  const regen = corpsDe(ab, 'const regenerateContratPdf = async (clientId) => {');
  assert.match(regen, /voc: await vocabForClient\(clientId\),/);
  assert.match(regen, /pdfTexte: true,/);
  assert.match(corpsDe(ab, 'const previewContratPdf = async (req, res) => {'), /voc: await vocabDuDomaine\(domaineId\),\n\s*pdfTexte: true,/);
  // pdfTexte posé nulle part ailleurs dans src/ (documents à signer, factures acheteur et d'abonnement : jamais)
  const poses = fichiersJs(path.join(RACINE, 'src')).flatMap((f) => {
    const n = (fs.readFileSync(f, 'utf8').match(/pdfTexte: true/g) || []).length;
    return n ? [[path.relative(RACINE, f).replace(/\\/g, '/'), n]] : [];
  });
  assert.deepEqual(poses, [['src/controllers/abonnementController.js', 2]]);

  const cl = lire('src/controllers/clientsController.js');
  const soumission = corpsDe(cl, 'const submitContratForSignature = async (');
  assert.match(soumission, /montantOnboarding,\n\s*voc,\n\s*\}\);\n\s*return await createSubmissionFromPdf/, 'contrat à signer : voc, sans pdfTexte');
  assert.doesNotMatch(soumission, /pdfTexte/);
  assert.match(soumission, /buildContractPricingFields\(pricing, config\?\.domaineNom \|\| null, voc\)/);
  const creation = corpsDe(cl, 'const create = async (req, res) => {');
  assert.match(creation, /const voc = await vocabDuDomaine\(domaineId\);\n\s*const aboConfig = config \|\| \{\};/);
  assert.match(creation, /dateContrat: new Date\(\),\n\s*\}, voc\);/, 'contrat legacy : vocabulaire du compte créé');
  assert.match(creation, /montantOnboarding,\n\s*voc,\n\s*\}\)/, 'soumission : vocabulaire du compte créé');

  const su = lire('src/controllers/supportController.js');
  const soumAv = corpsDe(su, 'const submitAvenantForSignature = async (');
  assert.match(soumAv, /abonnementDate: info\.abo_created_at,\n\s*voc,\n\s*\}\)/);
  assert.match(soumAv, /avenantExtraFields\(\{ ajouts, abonnementId: info\.abo_id, abonnementDate: info\.abo_created_at, pricing, voc \}\)/);
  assert.match(corpsDe(su, 'const create = async (req, res) => {'), /submitAvenantForSignature\(\{ demandeId: demande\.id, info, pricing, ajouts, voc: req\.voc \?\? vocabDefaut \}\)/);
  assert.match(corpsDe(su, 'const traiter = async (req, res) => {'), /const voc = await vocabForClient\(demande\.client_id\);\n\s*const pdfBase64 = await generateAvenantPdf\(pdfData, voc\)/);

  const fa = lire('src/controllers/facturesController.js');
  assert.match(corpsDe(fa, 'const downloadPdf = async (req, res) => {'), /const voc = req\.voc \?\? vocabDefaut;\n\s*const buffer = await buildFactureApproPdf\(facture, lignes, voc\);/);
});

// ── Messages balisés ─────────────────────────────────────────────────────────────────────────────────────────
const MESSAGES = {
  palierInvalide: {
    defaut: 'Palier acheteurs invalide (10, 20, 50 ou 100)',
    hotellerie: 'Palier clients professionnels invalide (10, 20, 50 ou 100)',
    ceramique: 'Palier revendeurs invalide (10, 20, 50 ou 100)',
    miroir: 'Palier clientes invalide (10, 20, 50 ou 100)',
  },
  palierInferieur: {
    defaut: 'Le palier demandé doit être supérieur au palier actuel (jusqu\'à 50 acheteurs)',
    hotellerie: 'Le palier demandé doit être supérieur au palier actuel (jusqu\'à 50 clients professionnels)',
    ceramique: 'Le palier demandé doit être supérieur au palier actuel (jusqu\'à 50 revendeurs)',
    miroir: 'Le palier demandé doit être supérieur au palier actuel (jusqu\'à 50 clientes)',
  },
  sansLabo: {
    defaut: 'L\'option Acheteurs nécessite au moins un labo (ajoutez-en un à la demande)',
    hotellerie: 'L\'option Clients professionnels nécessite au moins une cuisine centrale (ajoutez-en une à la demande)',
    ceramique: 'L\'option Revendeurs nécessite au moins un site de production (ajoutez-en un à la demande)',
    miroir: 'L\'option Clientes nécessite au moins une usine (ajoutez-en une à la demande)',
  },
};
const verifierRendus = (message, attendus) => {
  assert.equal(rendre(vocabDefaut, message), attendus.defaut, 'défaut : texte de l\'existant');
  for (const d of ['hotellerie', 'ceramique', 'miroir']) assert.equal(rendre(VOC[d], message), attendus[d], d);
};

test('demande de capacité (client) : messages de l\'option Acheteurs balisés', async () => {
  const cas = [
    ['palierInvalide', 30, { nb_acheteurs: 0, nb_labos: 1 }],
    ['palierInferieur', 50, { nb_acheteurs: 40, nb_labos: 1 }],
    ['sansLabo', 20, { nb_acheteurs: 0, nb_labos: 0 }],
  ];
  for (const [cle, cible, cfg] of cas) {
    repondreA = (texte) => (texte.startsWith('SELECT ac.nb_acheteurs, ac.nb_labos FROM abonnement_config') ? { rows: [cfg] } : { rows: [] });
    const res = fauxRes();
    await support.create({ user: { id: 42, role: 'client' }, body: { type: 'supplement', nbAcheteursCible: cible } }, res);
    assert.equal(res.statusCode, 400, cle);
    verifierRendus(res.corps.message, MESSAGES[cle]);
  }
});

test('quota acheteurs (admin) : même balise que configComposantsService (besoin B5)', async () => {
  const attendus = {
    defaut: 'Quota acheteurs invalide (paliers de 1 à 100)',
    hotellerie: 'Quota clients professionnels invalide (paliers de 1 à 100)',
    ceramique: 'Quota revendeurs invalide (paliers de 1 à 100)',
    miroir: 'Quota clientes invalide (paliers de 1 à 100)',
  };
  repondreA = (texte) => (texte.startsWith('UPDATE profil_entreprise') ? { rows: [{ module_acheteurs_actif: true }] } : { rows: [] });
  const res = fauxRes();
  await abonnement.toggleModuleAcheteurs({ params: { clientId: '42' }, body: { actif: true, nbAcheteurs: 150 }, user: { id: 1, role: 'super_admin' } }, res);
  assert.equal(res.statusCode, 400);
  verifierRendus(res.corps.message, attendus);
  // Même texte à updateAbonnementConfig (:1594) : lu dans la source, même balise
  const ab = lire('src/controllers/abonnementController.js');
  assert.equal((ab.match(/'Quota \[\[court:acheteur:pl\]\] invalide \(paliers de 1 à 100\)'/g) || []).length, 2);
  assert.ok(lire('src/services/configComposantsService.js').includes('Quota [[court:acheteur:pl]] invalide (paliers de 1 à 100)'));
});
