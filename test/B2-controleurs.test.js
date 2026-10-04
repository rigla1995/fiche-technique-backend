// Lot 2b, B2 — vocabulaire des documents et messages des contrôleurs du lot (spec docs/lot-2b-spec.md §8.2, §8.3, §9).
//   node --test test/B2-controleurs.test.js
//
// 1. Origine du vocabulaire de chaque document (§8.2) : facture d'appro → req.voc.
//    Lot 3, étape 3 : plus de contrat (aperçu du wizard, contrat régénéré et contrat de création retirés) —
//    la création envoie l'email de bienvenue, sans contrat ; pdfTexte n'est plus posé nulle part dans src/.
//    Lot 3, étape 4 : plus d'avenant (aperçu, avenant à signer, avenant legacy et contrat signé retirés) — une demande
//    de supplément attend la validation de l'équipe LabFlow ; traiter() valide en UNE transaction, seulement une
//    demande « en_attente » (sinon 409, 404 si absente), puis envoie l'email de confirmation
//    sendSupplementValideEmail avec le vocabulaire du compte DESTINATAIRE, vocabForClient(demande.client_id).
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

// Lot 3, étape 4 : l'email de confirmation d'un supplément validé est capté (vocabulaire reçu, arguments).
const emailReel = require('../src/services/emailService');
remplacer('src/services/emailService', {
  ...emailReel,
  sendSupplementValideEmail: async (args) => { appels.push(['sendSupplementValideEmail', args]); return { success: true }; },
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

const DEMANDE = { id: 3, client_id: 42, type: 'supplement', nb_activites_supp: 1, nb_labos_supp: 1, nb_gerants_supp: 0, nb_acheteurs_cible: 20, client_nom: 'Compte' };

// ── Lot 3, étape 4 : traitement admin d'une demande (plus d'avenant) ──────────────────────────────────────────
// L'email part en tâche de fond APRÈS la réponse : on laisse passer quelques tours de boucle.
const laisserFiler = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const traiterDemande = async (statut, repondeur) => {
  appels.length = 0;
  requetes.length = 0;
  repondreA = repondeur;
  const res = fauxRes();
  await support.traiter({ params: { id: '3' }, body: { statut, notesAdmin: 'Bienvenue' }, user: { id: 1, role: 'super_admin' } }, res);
  await laisserFiler();
  return res;
};
const indice = (debut) => requetes.findIndex((r) => r.texte.startsWith(debut));
const CFG_APRES = { nb_activites: 2, nb_labos: 2, nb_gerants: 0, nb_acheteurs: 20, domaine_id: null, formule_activites: 'premium' };

test('validation d\'un supplément (admin) : une transaction, puis email de confirmation au vocabulaire du compte DESTINATAIRE', async () => {
  const res = await traiterDemande('validée', (texte) => {
    if (texte.startsWith('UPDATE support_demandes')) return { rows: [{ ...DEMANDE, statut: 'validée' }] };
    if (texte.startsWith('SELECT email AS client_email')) return { rows: [{ client_email: 'compte@test.invalid', client_nom_u: 'Compte' }] };
    if (texte.startsWith('SELECT ac.nb_acheteurs FROM abonnement_config')) return { rows: [{ nb_acheteurs: 0 }] };
    if (texte.startsWith('SELECT ac.* FROM abonnement_config')) return { rows: [CFG_APRES] };
    return { rows: [] };
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
  assert.equal(res.corps.statut, 'validée');
  assert.equal(res.corps.avenantEmailSent, undefined);
  // Statut posé seulement si la demande est encore en attente ; tout dans la même transaction
  const maj = requetes[indice('UPDATE support_demandes')];
  assert.match(maj.texte, /WHERE id = \$4 AND statut = 'en_attente' RETURNING \*$/);
  assert.deepEqual(maj.params, ['validée', 'Bienvenue', 1, '3']);
  const [debut, statut, module_, fin] = ['BEGIN', 'UPDATE support_demandes', 'UPDATE profil_entreprise', 'COMMIT'].map(indice);
  assert.ok(debut === 0 && debut < statut && statut < module_ && module_ < fin, `ordre BEGIN < statut < option Acheteurs < COMMIT : ${requetes.map((r) => r.texte.slice(0, 30)).join(' | ')}`);
  assert.equal(indice('ROLLBACK'), -1);
  assert.ok(indice('SELECT a.id, ac.domaine_id FROM abonnements a') > statut && indice('SELECT a.id, ac.domaine_id FROM abonnements a') < fin, 'capacité appliquée dans la transaction');
  // Email de confirmation : vocabulaire du compte destinataire, sans PDF ni avenant
  const envois = appels.filter(([n]) => n === 'sendSupplementValideEmail');
  assert.equal(envois.length, 1, 'un email de confirmation');
  const [, args] = envois[0];
  assert.deepEqual(args.voc, marque('client', 42));
  assert.equal(args.to, 'compte@test.invalid');
  assert.equal(args.nom, 'Compte');
  assert.equal(args.notesAdmin, 'Bienvenue');
  assert.deepEqual([args.nbActivitesAdded, args.nbLabosAdded, args.nbGerantsAdded, args.acheteursCible], [1, 1, 0, 20]);
  assert.deepEqual([args.nbActivites, args.nbLabos, args.nbGerants, args.nbAcheteurs], [2, 2, 0, 20]);
  assert.ok(!Number.isNaN(Date.parse(args.dateValidation)), 'date de validation');
  assert.ok(!('pdfBase64' in args) && !('dateAvenant' in args), 'plus de PDF ni de date d\'avenant');
  assert.ok(!appels.some(([n]) => n === 'generateAvenantPdf' || n === 'buildAvenantDocument' || n === 'avenantExtraFields'), 'aucun document d\'avenant');
});

test('2e validation d\'une demande déjà traitée : 409, rien d\'appliqué, aucun email', async () => {
  const res = await traiterDemande('validée', (texte) => {
    if (texte.startsWith('SELECT statut FROM support_demandes')) return { rows: [{ statut: 'validée' }] };
    return { rows: [] }; // UPDATE … AND statut = 'en_attente' : aucune ligne
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.corps.message, 'Cette demande a déjà été traitée (validée)');
  assert.ok(indice('ROLLBACK') > indice('UPDATE support_demandes'));
  assert.equal(indice('COMMIT'), -1);
  for (const ecriture of ['SELECT a.id, ac.domaine_id FROM abonnements a', 'UPDATE profil_entreprise', 'INSERT INTO notifications']) {
    assert.equal(indice(ecriture), -1, `rien d'appliqué : ${ecriture}`);
  }
  assert.deepEqual(appels, [], 'aucun email');
});

test('demande absente : 404 ; demande refusée : aucune capacité, aucun email', async () => {
  let res = await traiterDemande('validée', () => ({ rows: [] }));
  assert.equal(res.statusCode, 404);
  assert.deepEqual(appels, []);
  res = await traiterDemande('refusée', (texte) => {
    if (texte.startsWith('UPDATE support_demandes')) return { rows: [{ ...DEMANDE, statut: 'refusée' }] };
    if (texte.startsWith('SELECT email AS client_email')) return { rows: [{ client_email: 'compte@test.invalid', client_nom_u: 'Compte' }] };
    return { rows: [] };
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.corps.statut, 'refusée');
  assert.ok(indice('COMMIT') > indice('UPDATE support_demandes'));
  for (const ecriture of ['SELECT a.id, ac.domaine_id FROM abonnements a', 'UPDATE profil_entreprise', 'SELECT ac.nb_acheteurs FROM abonnement_config']) {
    assert.equal(indice(ecriture), -1, `refusée : rien d'appliqué (${ecriture})`);
  }
  assert.deepEqual(appels, [], 'refusée : aucun email de confirmation');
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
  // Lot 3, étape 3 : contrat régénéré et aperçu du wizard retirés — pdfTexte n'est plus posé nulle part dans src/
  // (documents à signer, factures acheteur et d'abonnement : jamais ; facture d'appro : option de generate.js).
  const poses = fichiersJs(path.join(RACINE, 'src')).flatMap((f) => {
    const n = (fs.readFileSync(f, 'utf8').match(/pdfTexte: true/g) || []).length;
    return n ? [[path.relative(RACINE, f).replace(/\\/g, '/'), n]] : [];
  });
  assert.deepEqual(poses, []);
  const ab = lire('src/controllers/abonnementController.js');
  for (const retire of ['const regenerateContratPdf', 'const previewContratPdf', 'const getClientContratPdf', 'const getContratActif']) {
    assert.ok(!ab.includes(retire), `retiré : ${retire}`);
  }

  // Création : email de bienvenue (activation) tout de suite, plus aucun contrat ni soumission DocuSeal.
  const cl = lire('src/controllers/clientsController.js');
  const creation = corpsDe(cl, 'const create = async (req, res) => {');
  assert.match(creation, /await sendWelcomeEmail\(\{ to: email, nom, token: inviteToken \}\);\n\s*await pool\.query\(`UPDATE abonnements SET invite_sent = TRUE WHERE client_id = \$1`/);
  assert.doesNotMatch(creation, /submitContratForSignature|generateContratPdf|sendDocusealSigningEmail|contractPdfBase64/);
  assert.doesNotMatch(corpsDe(cl, 'const remove = async (req, res) => {'), /résiliation|resiliation|DocusealSigning/i, 'suppression : plus d\'acte de résiliation');

  // Lot 3, étape 4 : plus d'avenant. La demande de supplément ne crée plus de soumission DocuSeal ni d'email de
  // signature ; traiter() pose le statut seulement sur une demande en attente et envoie l'email de confirmation avec
  // le vocabulaire du compte DESTINATAIRE.
  const su = lire('src/controllers/supportController.js');
  for (const retire of ['const submitAvenantForSignature', 'const previewAvenant', 'const getContratSigne', 'generateAvenantPdf', 'sendAvenantEmail', 'sendDocusealSigningEmail', 'docusealService', 'contractPdfService', 'computeAvenantPricing']) {
    assert.ok(!su.includes(retire), `retiré : ${retire}`);
  }
  const creationSu = corpsDe(su, 'const create = async (req, res) => {');
  assert.doesNotMatch(creationSu, /submitAvenantForSignature|sendDocusealSigningEmail|docuseal_submission_id|avenantEmailSent/);
  assert.match(creationSu, /res\.status\(201\)\.json\(demande\);/);
  const traiterSu = corpsDe(su, 'const traiter = async (req, res) => {');
  assert.match(traiterSu, /WHERE id = \$4 AND statut = 'en_attente' RETURNING \*`/);
  assert.match(traiterSu, /const voc = await vocabForClient\(demande\.client_id\);\n\s*await sendSupplementValideEmail\(\{[\s\S]*?\n\s*voc,\n\s*\}\);/);
  assert.doesNotMatch(traiterSu, /docuseal_submission_id|pdfBase64|generateAvenantPdf/);
  assert.match(su, /module\.exports = \{ listMine, create, listAll, traiter, deleteMine \};/);
  assert.doesNotMatch(lire('src/routes/abonnements.js'), /avenant-preview|contrat-signe|previewAvenant|getContratSigne/, 'routes retirées');

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
