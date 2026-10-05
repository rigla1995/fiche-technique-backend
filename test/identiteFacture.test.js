// Lot 3, étape 8 — identité FIGÉE sur les factures (spec docs/lot-3-spec.md §1.3 et §6, décisions du client du 05/10/2026).
//   node --test test/identiteFacture.test.js
//
// Sans base de données. Prouve :
// 1. les fonctions pures de src/utils/identiteFacture.js (libelleForme, vendeurFacture, clientFacture) et
//    matriculeAcheteur (src/utils/matriculeFiscal.js) ;
// 2. le rendu PDF de docuseal-templates/generate.js :
//    - SANS copie figée, ou avec une copie sans aucune mention légale : octets IDENTIQUES à ceux de la référence
//      (generate.js de develop avant l'étape 8, chargé par « git show », comme test/B2-pdfTexte.test.js) ;
//    - AVEC copie : les lignes attendues, dans l'ordre, chacune omise quand sa valeur est vide ;
//    - côté acheteur de la facture de vente, émetteur de la facture d'abonnement, facture d'approvisionnement :
//      inchangés.
// Le texte d'un PDF est lu comme le fait scripts/capture-vocab-baseline.js (pdfsDe) : les chaînes passées à
// PDFDocument.prototype.text, et les métadonnées du document à sa fermeture.
// Toutes les valeurs sont fictives.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const PDFDocument = require('pdfkit');

const RACINE = path.resolve(__dirname, '..');
const REFERENCE = '5815e93'; // develop avant l'étape 8 du lot 3 (fusion de l'étape 6)

// Correctif du 05/10/2026 (hors lot) : le signe moins de la ligne « Remise » de la facture de vente était le signe
// mathématique U+2212, absent de la police standard (il s'imprimait « " ») ; c'est maintenant le tiret « – » (U+2013).
// La référence est donc lue avec ce SEUL signe corrigé : tout le reste doit rester identique à l'octet.
const MOINS_MATH = String.fromCodePoint(0x2212);
const TIRET = String.fromCodePoint(0x2013);
const corrigerSigneRemise = (source) => {
  const morceaux = source.split(`\`${MOINS_MATH} \${fmt(remiseVal)}\``);
  if (morceaux.length !== 2) throw new Error('référence : ligne « Remise » introuvable (signe U+2212 attendu une fois)');
  return morceaux.join(`\`${TIRET} \${fmt(remiseVal)}\``);
};

// Charge la version de référence d'un fichier du dépôt (git show), compilée à côté du vrai fichier : ses
// require relatifs et ses paquets se résolvent comme ceux du fichier courant. null si git est indisponible.
const chargerReference = (relatif) => {
  let source;
  try {
    source = execFileSync('git', ['-C', RACINE, 'show', `${REFERENCE}:${relatif}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  } catch {
    return null;
  }
  if (relatif === 'docuseal-templates/generate.js') source = corrigerSigneRemise(source);
  const chemin = path.join(RACINE, path.dirname(relatif), `__reference_${path.basename(relatif)}`);
  const m = new Module(chemin, module);
  m.filename = chemin;
  m.paths = Module._nodeModulePaths(path.dirname(chemin));
  m._compile(source, chemin);
  return m.exports;
};

const generate = require('../docuseal-templates/generate');
const ref = chargerReference('docuseal-templates/generate.js');
const sansGit = !ref && 'git indisponible';
const { buildFactureAcheteurPdf } = require('../src/services/factureAcheteurPdf');
const identiteFacture = require('../src/utils/identiteFacture');
const { libelleForme, vendeurFacture, clientFacture, figerVendeurFacture, figerClientPaiement, VENDEUR_FACTURE_SQL } = identiteFacture;
const { matriculeAcheteur, controlerMatriculeFiscal } = require('../src/utils/matriculeFiscal');

// Rend un PDF et capte, pendant le rendu, les chaînes écrites et les métadonnées du document.
const rendre = async (fn) => {
  const textes = [];
  let info = null;
  const textOrigine = PDFDocument.prototype.text;
  const endOrigine = PDFDocument.prototype.end;
  PDFDocument.prototype.text = function texteCapte(t, ...reste) {
    if (t != null && typeof t !== 'object') textes.push(String(t));
    return textOrigine.call(this, t, ...reste);
  };
  PDFDocument.prototype.end = function finCaptee(...a) {
    info = { ...this.info };
    return endOrigine.apply(this, a);
  };
  try {
    const buf = await fn();
    return { buf, textes, info };
  } finally {
    PDFDocument.prototype.text = textOrigine;
    PDFDocument.prototype.end = endOrigine;
  }
};
// Lignes d'un bloc : ce qui est écrit après l'étiquette `debut` et avant l'étiquette `fin`.
const bloc = (textes, debut, fin) => {
  const i = textes.indexOf(debut);
  const j = textes.indexOf(fin, i + 1);
  assert.ok(i >= 0 && j > i, `bloc « ${debut} » … « ${fin} » introuvable`);
  return textes.slice(i + 1, j);
};
const SEP = '  ·  '; // séparateur de la charte : deux espaces, point médian, deux espaces

// ── 1. Fonctions pures ──────────────────────────────────────────────────────────────────────────────────────

test('libelleForme : libellés de l\'écran, « Autre » et les valeurs inconnues ne s\'impriment pas', () => {
  assert.equal(libelleForme('SARL'), 'SARL');
  assert.equal(libelleForme('SUARL'), 'SUARL');
  assert.equal(libelleForme('SA'), 'SA');
  assert.equal(libelleForme('SNC'), 'SNC');
  assert.equal(libelleForme('EI'), 'Entreprise individuelle');
  assert.equal(libelleForme('AUTO_ENTREPRENEUR'), 'Auto-entrepreneur');
  assert.equal(libelleForme('ASSOCIATION'), 'Association');
  for (const v of ['AUTRE', '', null, undefined, 'GIE', 'sarl', 'Sarl', ' SARL', 0, 1]) {
    assert.equal(libelleForme(v), null, `forme ${JSON.stringify(v)} : non imprimée`);
  }
});

// Garde (défaut relevé à l'écriture de ce test, corrigé depuis dans libelleForme) : un code égal à un nom de
// propriété héritée d'Object.prototype rendait une FONCTION (ou un objet), que le bloc des parties aurait imprimée
// telle quelle. Non atteignable par l'application (profil_entreprise.forme_juridique porte un CHECK à 8 valeurs et
// les colonnes vendeur_forme / client_forme ne sont écrites que par copie de cette colonne), mais la fonction ne
// doit lire que ses propres libellés.
test('libelleForme : un code qui est un nom de propriété héritée (« toString », « constructor »…) ne s\'imprime pas', () => {
  for (const v of ['toString', 'constructor', 'valueOf', 'hasOwnProperty', '__proto__']) {
    assert.equal(libelleForme(v), null, `forme ${JSON.stringify(v)} : non imprimée`);
  }
});

test('matriculeAcheteur : remis au format quand il en a la forme, jamais refusé, vide → null', () => {
  // Formes reconnues → « 1234567A/A/M/000 » (ou « 1234567A » pour un identifiant seul)
  for (const saisie of ['1234567A/A/M/000', '1234567a/a/m/000', '1234567AAM000', '1234567/A/A/M/000', '1234567 A/A/M/000',
    '1234567-A-A-M-000', '1234567.A.A.M.000', '  1234567aam000  ', 'MF : 1234567A/A/M/000', 'M.F. 1234567aam000']) {
    assert.equal(matriculeAcheteur(saisie), '1234567A/A/M/000', `saisie ${JSON.stringify(saisie)}`);
  }
  assert.equal(matriculeAcheteur('7654321 b'), '7654321B');
  assert.equal(matriculeAcheteur('7654321/B'), '7654321B');
  assert.equal(matriculeAcheteur('Matricule fiscal: 7654321b'), '7654321B');
  // Sans lettre de clé : forme admise (avertissement côté compte), gardée normalisée
  assert.equal(matriculeAcheteur('1234567/A/M/000'), '1234567/A/M/000');
  assert.equal(matriculeAcheteur('1234567am000'), '1234567/A/M/000');
  assert.equal(matriculeAcheteur('1234567'), '1234567');
  // Saisie non reconnue : gardée telle qu'elle a été tapée, rognée — jamais refusée, jamais mise en majuscules
  for (const saisie of ['B0123452024', 'abc', '123456A/A/M/000', '12345678A', '1234567AB', '1234567A/A/M/00', 'en cours', 'n° 12 / 2026',
    'MF : 123456A/A/M/000', 'x'.repeat(50)]) {
    assert.equal(matriculeAcheteur(saisie), saisie, `saisie ${JSON.stringify(saisie)} gardée`);
    assert.equal(matriculeAcheteur(`  ${saisie}\t `), saisie, `saisie ${JSON.stringify(saisie)} rognée`);
  }
  // Saisie non reconnue plus longue que la colonne (VARCHAR(50)) : bornée à 50 caractères, sans espace au bout —
  // la base refusait sinon la fiche, le lot ou le fichier d'import entier (erreur 500).
  assert.equal(matriculeAcheteur('x'.repeat(80)), 'x'.repeat(50));
  assert.equal(matriculeAcheteur(`${'y'.repeat(49)} ${'z'.repeat(30)}`), 'y'.repeat(49));
  // Une forme reconnue n'est jamais bornée (17 caractères au plus)
  assert.equal(matriculeAcheteur(`MF : ${' '.repeat(60)}1234567aam000`), '1234567A/A/M/000');
  // Vide → null
  for (const vide of ['', '   ', '\t\n', null, undefined]) assert.equal(matriculeAcheteur(vide), null, `vide ${JSON.stringify(vide)}`);
  // Jamais d'exception, toujours null ou une chaîne non vide sans espace autour
  for (const v of [0, 1234567, 12.5, true, false, {}, [], ['1234567A'], NaN, new Date(0)]) {
    const r = matriculeAcheteur(v);
    assert.ok(r === null || (typeof r === 'string' && r.length > 0 && r === r.trim()), `valeur ${String(v)} → ${JSON.stringify(r)}`);
  }
  assert.equal(matriculeAcheteur(1234567), '1234567');
  // 0 et false : null, comme avant l'étape 8 (String(valeur || ''))
  assert.equal(matriculeAcheteur(0), null);
  assert.equal(matriculeAcheteur(false), null);
});

test('matriculeAcheteur : mêmes vecteurs que le matricule du compte (accepté → normalisé, refusé → gardé tel quel)', () => {
  const { vecteurs } = require('./matricule-fiscal-vecteurs.json');
  assert.ok(vecteurs.length >= 25);
  for (const v of vecteurs) {
    const controle = controlerMatriculeFiscal(v.entree);
    const attendu = controle.ok
      ? (controle.valeur || null)                       // forme reconnue : la même valeur que pour un compte
      : String(v.entree).trim();                        // refusée pour un compte : gardée telle quelle pour un acheteur
    assert.equal(matriculeAcheteur(v.entree), attendu, `entrée ${JSON.stringify(v.entree)}`);
  }
});

// Ligne SQL d'une facture de vente telle que les deux téléchargements la lisent (alias de VENDEUR_FACTURE_SQL).
const FIGE = new Date('2026-10-05T10:00:00Z');
const COPIE_VENDEUR = {
  vendeur_fige_le: FIGE,
  vendeur_nom: 'Contact Essai', vendeur_adresse: '12 rue des Essais', vendeur_tel: '+216 20 000 001', vendeur_email: 'vendeur@example.com',
  vendeur_raison_sociale: 'Les Essais du Dar', vendeur_nom_commercial: 'Le Jasmin Fictif', vendeur_forme: 'SARL',
  vendeur_matricule_fiscal: '1234567A/A/M/000', vendeur_rne: '7654321B', vendeur_ville: '1000 Tunis',
};
const SANS_MENTION = {
  vendeur_raison_sociale: null, vendeur_nom_commercial: null, vendeur_forme: null,
  vendeur_matricule_fiscal: null, vendeur_rne: null, vendeur_ville: null,
};

test('vendeurFacture : sans copie → nom, adresse, téléphone, email, et RIEN d\'autre', () => {
  const f = { vendeur_nom: 'Contact Essai', vendeur_adresse: '12 rue des Essais', vendeur_tel: '+216 20 000 001', vendeur_email: 'vendeur@example.com' };
  const attendu = { nom: 'Contact Essai', adresse: '12 rue des Essais', tel: '+216 20 000 001', email: 'vendeur@example.com' };
  assert.deepEqual(vendeurFacture({ ...f, vendeur_fige_le: null }), attendu);
  assert.deepEqual(vendeurFacture(f), attendu, 'colonne vendeur_fige_le absente = sans copie');
  // Une facture d'avant ne gagne aucune mention légale, même si la ligne en portait (fiche renseignée depuis)
  assert.deepEqual(vendeurFacture({ ...COPIE_VENDEUR, vendeur_fige_le: null }), attendu);
  // Valeurs vides : repli « Vendeur », null ailleurs (comme avant l'étape 8)
  assert.deepEqual(vendeurFacture({ vendeur_nom: '', vendeur_adresse: '', vendeur_tel: '', vendeur_email: '' }), { nom: 'Vendeur', adresse: null, tel: null, email: null });
  assert.deepEqual(vendeurFacture({}), { nom: 'Vendeur', adresse: null, tel: null, email: null });
  assert.deepEqual(vendeurFacture(), { nom: 'Vendeur', adresse: null, tel: null, email: null });
});

test('vendeurFacture : avec copie → raison sociale, nom commercial, forme, matricule, RNE, ville', () => {
  assert.deepEqual(vendeurFacture(COPIE_VENDEUR), {
    nom: 'Les Essais du Dar', adresse: '12 rue des Essais', tel: '+216 20 000 001', email: 'vendeur@example.com',
    nomCommercial: 'Le Jasmin Fictif', forme: 'SARL', matricule: '1234567A/A/M/000', autoEntrepreneur: false, rne: '7654321B', ville: '1000 Tunis',
  });
  // Copie figée par une date en texte (pg peut être configuré ainsi) : même résultat
  assert.equal(vendeurFacture({ ...COPIE_VENDEUR, vendeur_fige_le: '2026-10-05T10:00:00.000Z' }).nom, 'Les Essais du Dar');
});

test('vendeurFacture : cas limites de la copie', () => {
  // Auto-entrepreneur : identifiant unique ; le RNE égal au matricule n'est pas répété
  let v = vendeurFacture({ ...COPIE_VENDEUR, vendeur_forme: 'AUTO_ENTREPRENEUR', vendeur_matricule_fiscal: '1234567A', vendeur_rne: '1234567A' });
  assert.equal(v.autoEntrepreneur, true);
  assert.equal(v.forme, 'Auto-entrepreneur');
  assert.equal(v.matricule, '1234567A');
  assert.equal(v.rne, null, 'RNE égal au matricule : omis');
  // RNE égal au matricule, aux espaces près
  v = vendeurFacture({ ...COPIE_VENDEUR, vendeur_matricule_fiscal: '1234567A', vendeur_rne: ' 1234567A ' });
  assert.equal(v.rne, null);
  // RNE seul (pas de matricule) : imprimé
  v = vendeurFacture({ ...COPIE_VENDEUR, vendeur_matricule_fiscal: null, vendeur_rne: '7654321B' });
  assert.equal(v.matricule, null);
  assert.equal(v.rne, '7654321B');
  // Nom commercial égal à la raison sociale : omis
  v = vendeurFacture({ ...COPIE_VENDEUR, vendeur_nom_commercial: 'Les Essais du Dar' });
  assert.equal(v.nom, 'Les Essais du Dar');
  assert.equal(v.nomCommercial, null);
  v = vendeurFacture({ ...COPIE_VENDEUR, vendeur_nom_commercial: '  Les Essais du Dar ' });
  assert.equal(v.nomCommercial, null, 'égalité après rognage');
  // Sans raison sociale : le nom du contact ; le nom commercial s'imprime s'il en diffère
  v = vendeurFacture({ ...COPIE_VENDEUR, vendeur_raison_sociale: null });
  assert.equal(v.nom, 'Contact Essai');
  assert.equal(v.nomCommercial, 'Le Jasmin Fictif');
  v = vendeurFacture({ ...COPIE_VENDEUR, vendeur_raison_sociale: '   ', vendeur_nom_commercial: 'Contact Essai' });
  assert.equal(v.nom, 'Contact Essai', 'raison sociale en espaces = absente');
  assert.equal(v.nomCommercial, null, 'nom commercial égal au nom imprimé : omis');
  // Forme « Autre » ou inconnue : non imprimée, le matricule reste un « matricule fiscal »
  for (const forme of ['AUTRE', 'GIE', '', null]) {
    v = vendeurFacture({ ...COPIE_VENDEUR, vendeur_forme: forme });
    assert.equal(v.forme, null, `forme ${JSON.stringify(forme)}`);
    assert.equal(v.autoEntrepreneur, false);
    assert.equal(v.matricule, '1234567A/A/M/000');
  }
  // Ville sans adresse, adresse sans ville
  v = vendeurFacture({ ...COPIE_VENDEUR, vendeur_adresse: null });
  assert.equal(v.adresse, null);
  assert.equal(v.ville, '1000 Tunis');
  v = vendeurFacture({ ...COPIE_VENDEUR, vendeur_ville: '  ' });
  assert.equal(v.adresse, '12 rue des Essais');
  assert.equal(v.ville, null);
});

test('vendeurFacture : copie vide ou sans mention légale → les 4 champs d\'avant, aucune mention', () => {
  const aucune = { nomCommercial: null, forme: null, matricule: null, autoEntrepreneur: false, rne: null, ville: null };
  // Compte sans fiche d'entreprise : tout est NULL, la facture est figée quand même
  assert.deepEqual(vendeurFacture({ vendeur_fige_le: FIGE }), { nom: 'Vendeur', adresse: null, tel: null, email: null, ...aucune });
  assert.deepEqual(vendeurFacture({ vendeur_fige_le: FIGE, vendeur_nom: null, vendeur_adresse: null, vendeur_tel: null, vendeur_email: null, ...SANS_MENTION }),
    { nom: 'Vendeur', adresse: null, tel: null, email: null, ...aucune });
  // Identité non renseignée : nom du contact, adresse, téléphone, email
  assert.deepEqual(vendeurFacture({ ...COPIE_VENDEUR, ...SANS_MENTION }),
    { nom: 'Contact Essai', adresse: '12 rue des Essais', tel: '+216 20 000 001', email: 'vendeur@example.com', ...aucune });
});

const COPIE_CLIENT = {
  id: 42, client_fige_le: FIGE, client_nom: 'Contact Essai', client_email: 'client@example.com',
  client_raison_sociale: 'Les Essais du Dar', client_forme: 'SARL', client_matricule_fiscal: '1234567A/A/M/000',
  client_rne: '7654321B', client_adresse: '12 rue des Essais', client_ville: '1000 Tunis',
};
const COMPTE = { nom: 'Contact Du Jour', email: 'dujour@example.com' };

test('clientFacture : sans copie → nom et email du compte, et RIEN d\'autre', () => {
  assert.deepEqual(clientFacture({ id: 1, client_fige_le: null }, COMPTE), { clientNom: 'Contact Du Jour', clientEmail: 'dujour@example.com' });
  assert.deepEqual(clientFacture({ id: 1 }, COMPTE), { clientNom: 'Contact Du Jour', clientEmail: 'dujour@example.com' });
  // Un paiement d'avant ne gagne aucune mention, même si la ligne en portait
  assert.deepEqual(clientFacture({ ...COPIE_CLIENT, client_fige_le: null }, COMPTE), { clientNom: 'Contact Du Jour', clientEmail: 'dujour@example.com' });
  // Compte null (compte supprimé : LEFT JOIN), compte vide, aucun argument
  assert.deepEqual(clientFacture({ id: 1 }, null), { clientNom: 'Client', clientEmail: '' });
  assert.deepEqual(clientFacture({ id: 1 }), { clientNom: 'Client', clientEmail: '' });
  assert.deepEqual(clientFacture({ id: 1 }, { nom: null, email: null }), { clientNom: 'Client', clientEmail: '' });
  assert.deepEqual(clientFacture(), { clientNom: 'Client', clientEmail: '' });
});

test('clientFacture : avec copie → raison sociale, email copié, mentions ; le compte du jour est ignoré', () => {
  const attendu = {
    clientNom: 'Les Essais du Dar', clientEmail: 'client@example.com',
    client: { forme: 'SARL', matricule: '1234567A/A/M/000', autoEntrepreneur: false, rne: '7654321B', ville: '1000 Tunis', adresse: '12 rue des Essais' },
  };
  assert.deepEqual(clientFacture(COPIE_CLIENT, COMPTE), attendu);
  assert.deepEqual(clientFacture(COPIE_CLIENT, null), attendu, 'compte null : la copie suffit');
  assert.deepEqual(clientFacture(COPIE_CLIENT), attendu);
});

test('clientFacture : cas limites de la copie', () => {
  const aucune = { forme: null, matricule: null, autoEntrepreneur: false, rne: null, ville: null, adresse: null };
  // Sans raison sociale : le nom copié ; sans rien : « Client »
  assert.equal(clientFacture({ ...COPIE_CLIENT, client_raison_sociale: null }, COMPTE).clientNom, 'Contact Essai');
  assert.equal(clientFacture({ ...COPIE_CLIENT, client_raison_sociale: '  ' }, COMPTE).clientNom, 'Contact Essai');
  assert.deepEqual(clientFacture({ client_fige_le: FIGE }, COMPTE), { clientNom: 'Client', clientEmail: '', client: aucune });
  // Copie sans mention légale : nom et email COPIÉS (pas ceux du jour), aucune mention
  assert.deepEqual(clientFacture({ client_fige_le: FIGE, client_nom: 'Contact Essai', client_email: 'client@example.com' }, COMPTE),
    { clientNom: 'Contact Essai', clientEmail: 'client@example.com', client: aucune });
  // Auto-entrepreneur, RNE égal au matricule
  let c = clientFacture({ ...COPIE_CLIENT, client_forme: 'AUTO_ENTREPRENEUR', client_matricule_fiscal: '1234567A', client_rne: '1234567A' }, COMPTE).client;
  assert.deepEqual(c, { forme: 'Auto-entrepreneur', matricule: '1234567A', autoEntrepreneur: true, rne: null, ville: '1000 Tunis', adresse: '12 rue des Essais' });
  // Forme « Autre » : non imprimée
  c = clientFacture({ ...COPIE_CLIENT, client_forme: 'AUTRE' }, COMPTE).client;
  assert.equal(c.forme, null);
  assert.equal(c.autoEntrepreneur, false);
  // Ville sans adresse
  c = clientFacture({ ...COPIE_CLIENT, client_adresse: ' ' }, COMPTE).client;
  assert.equal(c.adresse, null);
  assert.equal(c.ville, '1000 Tunis');
});

test('requêtes de copie : une requête paramétrée chacune ; la première copie d\'un paiement est gardée', async () => {
  const appels = [];
  const db = (rows) => ({ query: async (sql, params) => { appels.push({ sql: sql.replace(/\s+/g, ' ').trim(), params }); return { rows }; } });
  await figerVendeurFacture(db([]), 77);
  assert.equal(appels.length, 1);
  assert.deepEqual(appels[0].params, [77]);
  assert.match(appels[0].sql, /^UPDATE factures_acheteur fa SET vendeur_fige_le = NOW\(\)/);
  for (const colonne of ['vendeur_nom = pe.nom', 'vendeur_adresse = pe.adresse', 'vendeur_telephone = pe.telephone', 'vendeur_email = pe.email',
    'vendeur_raison_sociale = pe.raison_sociale', 'vendeur_nom_commercial = pe.nom_commercial', 'vendeur_forme = pe.forme_juridique',
    'vendeur_matricule_fiscal = pe.matricule_fiscal', 'vendeur_rne = pe.rne', 'vendeur_ville = pe.ville']) {
    assert.ok(appels[0].sql.includes(colonne), `copie de ${colonne}`);
  }
  assert.match(appels[0].sql, /LEFT JOIN profil_entreprise pe ON pe\.client_id = u\.id WHERE fa\.id = \$1 AND u\.id = fa\.client_id$/, 'compte sans fiche : figée quand même');

  appels.length = 0;
  const ligne = { id: 5, client_fige_le: FIGE };
  assert.equal(await figerClientPaiement(db([ligne]), 5), ligne, 'copie posée : la ligne à jour');
  assert.equal(await figerClientPaiement(db([]), 5), null, 'copie déjà présente : null');
  assert.equal(appels.length, 2);
  assert.deepEqual(appels[0].params, [5]);
  assert.match(appels[0].sql, /^UPDATE paiements p SET client_fige_le = NOW\(\)/);
  assert.ok(appels[0].sql.includes('p.client_fige_le IS NULL'), 'ne remplace jamais une copie existante');
  for (const colonne of ['client_nom = u.nom', 'client_email = u.email', 'client_raison_sociale = pe.raison_sociale', 'client_forme = pe.forme_juridique',
    'client_matricule_fiscal = pe.matricule_fiscal', 'client_rne = pe.rne', 'client_adresse = pe.adresse', 'client_ville = pe.ville']) {
    assert.ok(appels[0].sql.includes(colonne), `copie de ${colonne}`);
  }
  assert.match(appels[0].sql, /RETURNING p\.\*$/);

  // Lecture d'une facture de vente : la copie si elle existe, sinon la fiche — 4 alias, ceux que lit vendeurFacture
  const sql = VENDEUR_FACTURE_SQL.replace(/\s+/g, ' ');
  for (const [colonneFiche, colonneCopie, alias] of [['pe.nom', 'fa.vendeur_nom', 'vendeur_nom'], ['pe.adresse', 'fa.vendeur_adresse', 'vendeur_adresse'],
    ['pe.telephone', 'fa.vendeur_telephone', 'vendeur_tel'], ['pe.email', 'fa.vendeur_email', 'vendeur_email']]) {
    assert.ok(sql.includes(`CASE WHEN fa.vendeur_fige_le IS NULL THEN ${colonneFiche} ELSE ${colonneCopie} END AS ${alias}`), `alias ${alias}`);
  }
  assert.equal((sql.match(/ AS /g) || []).length, 4, 'aucune mention légale lue sur la fiche');
});

// ── 2. Facture de vente : rendu PDF ─────────────────────────────────────────────────────────────────────────

// Ligne SQL complète d'une facture de vente + lignes de la commande (service src/services/factureAcheteurPdf.js).
const LIGNE_FACTURE = {
  numero: 'FA-2026-0007', date_facture: '2026-10-05', remise_pct: 5,
  montant_ht: 45.6, montant_tva: 3.192, timbre_fiscal: true, montant_timbre: 1, montant_ttc: 49.792, notes: 'Livraison le mardi',
  acheteur_nom: 'Sami Fictif', acheteur_entreprise: 'Epicerie des Essais', acheteur_adresse: '3 rue des Tests, Sfax',
  acheteur_mf: '1122334C/A/M/000', acheteur_tel: '+216 55 000 111', acheteur_email: 'acheteur@example.com',
};
const LIGNES_COMMANDE = [
  { designation: 'Semoule fine', quantite: 20, prix_ht: 2.4, taux_tva: 7 },
];
const ACHETEUR_ATTENDU = ['Epicerie des Essais — Sami Fictif', 'MF 1122334C/A/M/000', 'acheteur@example.com', '+216 55 000 111', '3 rue des Tests, Sfax'];
// Données du builder telles que le service les construisait AVANT l'étape 8 (vendeur = 4 champs lus sur la fiche).
const donneesAvant = (f, vendeur) => ({
  numero: f.numero, dateFacture: f.date_facture, vendeur,
  acheteur: { nom: f.acheteur_nom || null, entreprise: f.acheteur_entreprise || null, adresse: f.acheteur_adresse || null, mf: f.acheteur_mf || null, tel: f.acheteur_tel || null, email: f.acheteur_email || null },
  lignes: LIGNES_COMMANDE.map((l) => ({ designation: l.designation, quantite: l.quantite, prixHt: l.prix_ht, tauxTva: l.taux_tva })),
  remisePct: Number(f.remise_pct || 0), montantHt: f.montant_ht, montantTva: f.montant_tva, timbreFiscal: f.timbre_fiscal,
  montantTimbre: f.montant_timbre, montantTtc: f.montant_ttc, notes: f.notes || null,
});
const FICHE = { vendeur_nom: 'Contact Essai', vendeur_adresse: '12 rue des Essais', vendeur_tel: '+216 20 000 001', vendeur_email: 'vendeur@example.com' };
const VENDEUR_AVANT = { nom: 'Contact Essai', adresse: '12 rue des Essais', tel: '+216 20 000 001', email: 'vendeur@example.com' };

test('facture de vente : le signe de la ligne « Remise » est dans la police (« – »), plus le signe U+2212', async () => {
  const f = { ...LIGNE_FACTURE, vendeur_fige_le: null, ...FICHE };
  const { textes } = await rendre(() => buildFactureAcheteurPdf(f, LIGNES_COMMANDE));
  // 20 × 2.400 = 48.000 brut ; net 45.600 ; remise 2.400
  assert.ok(textes.includes('Remise 5 %'), 'ligne de remise présente');
  assert.ok(textes.includes(`${TIRET} 2.400 DT`), `montant de la remise précédé de « ${TIRET} » : ${JSON.stringify(textes.filter((t) => t.includes('2.400 DT')))}`);
  assert.ok(!textes.some((t) => t.includes(MOINS_MATH)), 'plus aucun signe U+2212 (hors police) sur la facture');
  // Sans remise : aucune ligne « Remise », donc aucun signe
  const sans = await rendre(() => buildFactureAcheteurPdf({ ...f, remise_pct: 0 }, LIGNES_COMMANDE));
  assert.ok(!sans.textes.some((t) => t.startsWith('Remise') || t.startsWith(TIRET)));
});

test('facture de vente SANS copie : IDENTIQUE à l\'octet à la référence, même si la fiche porte des mentions', { skip: sansGit }, async () => {
  const avant = await ref.buildFactureAcheteur(null, donneesAvant(LIGNE_FACTURE, VENDEUR_AVANT));
  assert.ok(Buffer.isBuffer(avant) && avant.length > 1000);
  // Facture d'avant : vendeur_fige_le NULL, colonnes vendeur_* de la facture NULL (fa.*), fiche lue par les alias
  const f = { ...LIGNE_FACTURE, ...SANS_MENTION, vendeur_fige_le: null, vendeur_telephone: null, ...FICHE };
  assert.ok((await buildFactureAcheteurPdf(f, LIGNES_COMMANDE)).equals(avant), 'octets identiques');
  // Garde : même si la ligne portait des mentions légales, une facture sans copie n'en imprime aucune
  const fMentions = { ...LIGNE_FACTURE, ...COPIE_VENDEUR, vendeur_fige_le: null, ...FICHE };
  assert.ok((await buildFactureAcheteurPdf(fMentions, LIGNES_COMMANDE)).equals(avant), 'octets identiques malgré des colonnes de mention renseignées');
  // Fiche vide (compte sans fiche d'entreprise) : « Vendeur », comme avant
  const fVide = { ...LIGNE_FACTURE, vendeur_fige_le: null, vendeur_nom: null, vendeur_adresse: null, vendeur_tel: null, vendeur_email: null };
  assert.ok((await buildFactureAcheteurPdf(fVide, LIGNES_COMMANDE)).equals(
    await ref.buildFactureAcheteur(null, donneesAvant(LIGNE_FACTURE, { nom: 'Vendeur', adresse: null, tel: null, email: null }))));
  // Et le builder lui-même, appelé comme avant (vendeur à 4 champs), n'a pas bougé
  assert.ok((await generate.buildFactureAcheteur(null, donneesAvant(LIGNE_FACTURE, VENDEUR_AVANT))).equals(avant));
});

test('facture de vente avec une copie SANS mention légale : IDENTIQUE à l\'octet à l\'ancienne présentation', { skip: sansGit }, async () => {
  // Identité non renseignée à l'émission : la copie porte nom, adresse, téléphone, email seulement
  const f = { ...LIGNE_FACTURE, ...COPIE_VENDEUR, ...SANS_MENTION };
  const avant = await ref.buildFactureAcheteur(null, donneesAvant(LIGNE_FACTURE, VENDEUR_AVANT));
  assert.ok((await buildFactureAcheteurPdf(f, LIGNES_COMMANDE)).equals(avant), 'nom, adresse, email · téléphone : octets identiques');
  // Mentions en chaînes vides ou en espaces : même chose
  const fEspaces = { ...f, vendeur_raison_sociale: '', vendeur_nom_commercial: '  ', vendeur_forme: '', vendeur_matricule_fiscal: ' ', vendeur_rne: '', vendeur_ville: '   ' };
  assert.ok((await buildFactureAcheteurPdf(fEspaces, LIGNES_COMMANDE)).equals(avant), 'mentions vides : octets identiques');
  // Forme « Autre » seule : rien ne s'imprime
  assert.ok((await buildFactureAcheteurPdf({ ...f, vendeur_forme: 'AUTRE' }, LIGNES_COMMANDE)).equals(avant), 'forme Autre seule : octets identiques');
  // Copie entièrement vide (compte sans fiche) : « Vendeur » seul
  const fVide = { ...LIGNE_FACTURE, vendeur_fige_le: FIGE, vendeur_nom: null, vendeur_adresse: null, vendeur_tel: null, vendeur_email: null, ...SANS_MENTION };
  assert.ok((await buildFactureAcheteurPdf(fVide, LIGNES_COMMANDE)).equals(
    await ref.buildFactureAcheteur(null, donneesAvant(LIGNE_FACTURE, { nom: 'Vendeur', adresse: null, tel: null, email: null }))), 'copie vide : octets identiques');
});

test('facture de vente AVEC copie : bloc ÉMETTEUR, pied de page, métadonnées ; côté acheteur inchangé', async () => {
  const r = await rendre(() => buildFactureAcheteurPdf({ ...LIGNE_FACTURE, ...COPIE_VENDEUR }, LIGNES_COMMANDE));
  assert.ok(Buffer.isBuffer(r.buf) && r.buf.subarray(0, 5).toString() === '%PDF-');
  assert.deepEqual(bloc(r.textes, 'ÉMETTEUR', 'FACTURÉ À'), [
    'Les Essais du Dar',
    'Nom commercial : Le Jasmin Fictif',
    `SARL${SEP}Matricule fiscal : 1234567A/A/M/000`,
    'RNE : 7654321B',
    '12 rue des Essais, 1000 Tunis',
    `vendeur@example.com${SEP}+216 20 000 001`,
  ]);
  assert.deepEqual(bloc(r.textes, 'FACTURÉ À', 'DÉTAIL'), ACHETEUR_ATTENDU, 'côté acheteur : inchangé');
  assert.ok(r.textes.includes('Les Essais du Dar — vente professionnelle, émise via la plateforme LabFlow'), 'sous-titre : raison sociale');
  assert.ok(r.textes.includes(`Les Essais du Dar${SEP}MF 1234567A/A/M/000${SEP}12 rue des Essais, 1000 Tunis`), `pied de page : ${JSON.stringify(r.textes.slice(-3))}`);
  assert.equal(r.info.Author, 'Les Essais du Dar');
  assert.equal(r.info.Title, 'Facture FA-2026-0007');
  // Le nom du contact n'apparaît plus nulle part quand la raison sociale est copiée
  assert.ok(!r.textes.some((t) => t.includes('Contact Essai')), 'nom du contact absent');
  // Déterministe : deux rendus de la même ligne donnent les mêmes octets
  assert.ok((await buildFactureAcheteurPdf({ ...LIGNE_FACTURE, ...COPIE_VENDEUR }, LIGNES_COMMANDE)).equals(r.buf));
});

test('facture de vente AVEC copie : auto-entrepreneur, RNE = matricule, nom commercial = raison sociale, forme Autre, ville sans adresse', async () => {
  const emetteur = async (surcharge) => {
    const r = await rendre(() => buildFactureAcheteurPdf({ ...LIGNE_FACTURE, ...COPIE_VENDEUR, ...surcharge }, LIGNES_COMMANDE));
    assert.deepEqual(bloc(r.textes, 'FACTURÉ À', 'DÉTAIL'), ACHETEUR_ATTENDU, 'côté acheteur : inchangé');
    return { lignes: bloc(r.textes, 'ÉMETTEUR', 'FACTURÉ À'), pied: r.textes[r.textes.length - 3], textes: r.textes };
  };
  const contact = `vendeur@example.com${SEP}+216 20 000 001`;

  // Auto-entrepreneur : « Identifiant unique », « ID » au pied ; RNE égal au matricule omis
  let e = await emetteur({ vendeur_forme: 'AUTO_ENTREPRENEUR', vendeur_matricule_fiscal: '1234567A', vendeur_rne: '1234567A', vendeur_nom_commercial: null });
  assert.deepEqual(e.lignes, ['Les Essais du Dar', `Auto-entrepreneur${SEP}Identifiant unique : 1234567A`, '12 rue des Essais, 1000 Tunis', contact]);
  assert.equal(e.pied, `Les Essais du Dar${SEP}ID 1234567A${SEP}12 rue des Essais, 1000 Tunis`);
  assert.ok(!e.textes.some((t) => /Matricule fiscal|RNE|MF 1234567A/.test(t)), 'ni « Matricule fiscal », ni « RNE », ni « MF » du vendeur');

  // RNE égal au matricule (société) : omis ; différent : imprimé
  e = await emetteur({ vendeur_rne: '1234567A/A/M/000' });
  assert.ok(!e.lignes.some((t) => t.startsWith('RNE')), 'RNE égal au matricule : omis');
  e = await emetteur({ vendeur_matricule_fiscal: null });
  assert.deepEqual(e.lignes, ['Les Essais du Dar', 'Nom commercial : Le Jasmin Fictif', 'SARL', 'RNE : 7654321B', '12 rue des Essais, 1000 Tunis', contact]);
  assert.equal(e.pied, `Les Essais du Dar${SEP}12 rue des Essais, 1000 Tunis`, 'pied sans matricule');

  // Nom commercial égal à la raison sociale : une seule ligne de nom
  e = await emetteur({ vendeur_nom_commercial: 'Les Essais du Dar' });
  assert.ok(!e.lignes.some((t) => t.startsWith('Nom commercial')), 'nom commercial égal : omis');
  assert.equal(e.lignes[0], 'Les Essais du Dar');

  // Sans raison sociale : le nom du contact, puis le nom commercial
  e = await emetteur({ vendeur_raison_sociale: null });
  assert.deepEqual(e.lignes.slice(0, 2), ['Contact Essai', 'Nom commercial : Le Jasmin Fictif']);
  assert.ok(e.pied.startsWith(`Contact Essai${SEP}MF 1234567A/A/M/000`));

  // Forme « Autre » : non imprimée, pas de séparateur orphelin
  e = await emetteur({ vendeur_forme: 'AUTRE' });
  assert.equal(e.lignes[2], 'Matricule fiscal : 1234567A/A/M/000');
  assert.ok(!e.textes.some((t) => /AUTRE|Autre/.test(t)), '« Autre » n\'est écrit nulle part');
  // Forme seule, sans matricule
  e = await emetteur({ vendeur_forme: 'EI', vendeur_matricule_fiscal: '', vendeur_rne: '' });
  assert.equal(e.lignes[2], 'Entreprise individuelle');

  // Ville sans adresse, adresse sans ville : pas de virgule orpheline
  e = await emetteur({ vendeur_adresse: null });
  assert.ok(e.lignes.includes('1000 Tunis') && !e.lignes.some((t) => t.startsWith(',') || t.endsWith(', ')), JSON.stringify(e.lignes));
  assert.equal(e.pied, `Les Essais du Dar${SEP}MF 1234567A/A/M/000${SEP}1000 Tunis`);
  e = await emetteur({ vendeur_ville: null });
  assert.ok(e.lignes.includes('12 rue des Essais'));
  assert.equal(e.pied, `Les Essais du Dar${SEP}MF 1234567A/A/M/000${SEP}12 rue des Essais`);

  // Email sans téléphone, téléphone sans email, ni l'un ni l'autre
  e = await emetteur({ vendeur_tel: null });
  assert.equal(e.lignes[e.lignes.length - 1], 'vendeur@example.com');
  e = await emetteur({ vendeur_email: null });
  assert.equal(e.lignes[e.lignes.length - 1], '+216 20 000 001');
  e = await emetteur({ vendeur_email: null, vendeur_tel: null });
  assert.equal(e.lignes[e.lignes.length - 1], '12 rue des Essais, 1000 Tunis');
});

test('facture de vente AVEC copie : chaque ligne du bloc ÉMETTEUR est omise si vide (128 combinaisons)', { skip: sansGit }, async () => {
  const champs = [
    ['vendeur_raison_sociale', 'Les Essais du Dar'], ['vendeur_nom_commercial', 'Le Jasmin Fictif'], ['vendeur_forme', 'SUARL'],
    ['vendeur_matricule_fiscal', '1234567A/A/M/000'], ['vendeur_rne', '7654321B'], ['vendeur_adresse', '12 rue des Essais'], ['vendeur_ville', '1000 Tunis'],
  ];
  let identiques = 0;
  for (let masque = 0; masque < (1 << champs.length); masque += 1) {
    const f = { ...LIGNE_FACTURE, ...COPIE_VENDEUR };
    champs.forEach(([colonne, valeur], i) => { f[colonne] = (masque >> i) & 1 ? valeur : null; });
    const r = await rendre(() => buildFactureAcheteurPdf(f, LIGNES_COMMANDE));
    const nom = f.vendeur_raison_sociale || 'Contact Essai';
    const attendu = [
      nom,
      f.vendeur_nom_commercial && `Nom commercial : ${f.vendeur_nom_commercial}`,
      [f.vendeur_forme, f.vendeur_matricule_fiscal && `Matricule fiscal : ${f.vendeur_matricule_fiscal}`].filter(Boolean).join(SEP),
      f.vendeur_rne && `RNE : ${f.vendeur_rne}`,
      [f.vendeur_adresse, f.vendeur_ville].filter(Boolean).join(', '),
      `vendeur@example.com${SEP}+216 20 000 001`,
    ].filter(Boolean);
    assert.deepEqual(bloc(r.textes, 'ÉMETTEUR', 'FACTURÉ À'), attendu, `combinaison ${masque.toString(2).padStart(7, '0')}`);
    assert.deepEqual(bloc(r.textes, 'FACTURÉ À', 'DÉTAIL'), ACHETEUR_ATTENDU, 'côté acheteur : inchangé');
    // Sans aucune mention légale (seule l'adresse varie) : les octets de l'ancienne présentation
    const sansMention = ['vendeur_raison_sociale', 'vendeur_nom_commercial', 'vendeur_forme', 'vendeur_matricule_fiscal', 'vendeur_rne', 'vendeur_ville'].every((c) => !f[c]);
    const avant = await ref.buildFactureAcheteur(null, donneesAvant(LIGNE_FACTURE, { ...VENDEUR_AVANT, adresse: f.vendeur_adresse }));
    assert.equal(r.buf.equals(avant), sansMention, `octets ${sansMention ? 'identiques' : 'différents'} de l'ancienne présentation, combinaison ${masque.toString(2).padStart(7, '0')}`);
    if (sansMention) identiques += 1;
  }
  assert.equal(identiques, 2, 'avec et sans adresse');
});

// ── 3. Facture d'abonnement : rendu PDF ─────────────────────────────────────────────────────────────────────

const FACTURE_ABO = { numero: 'LF-2026-00042', dateFacture: '2026-10-05', periodeLabel: 'octobre 2026', montantHt: 100.84, montantTva: 19.16, montantTtc: 120, tvaRate: 19 };

test('facture d\'abonnement SANS copie, ou avec une copie sans mention : IDENTIQUE à l\'octet à la référence', { skip: sansGit }, async () => {
  const avant = await ref.buildFacture(null, { ...FACTURE_ABO, clientNom: 'Contact Du Jour', clientEmail: 'dujour@example.com' });
  // Paiement d'avant : nom et email du compte lus en direct
  assert.ok((await generate.buildFacture(null, { ...FACTURE_ABO, ...clientFacture({ id: 42, client_fige_le: null }, COMPTE) })).equals(avant));
  assert.ok((await generate.buildFacture(null, { ...FACTURE_ABO, ...clientFacture({ ...COPIE_CLIENT, client_fige_le: null }, COMPTE) })).equals(avant),
    'sans copie : aucune mention, même si la ligne en portait');
  // Copie sans mention légale : nom et email copiés, présentation d'avant
  const copieNue = { client_fige_le: FIGE, client_nom: 'Contact Du Jour', client_email: 'dujour@example.com' };
  assert.ok((await generate.buildFacture(null, { ...FACTURE_ABO, ...clientFacture(copieNue, { nom: 'Autre Nom', email: 'autre@example.com' }) })).equals(avant),
    'copie sans mention : octets de l\'ancienne présentation, avec le nom et l\'email copiés');
  assert.ok((await generate.buildFacture(null, { ...FACTURE_ABO, ...clientFacture({ ...copieNue, client_forme: 'AUTRE', client_rne: ' ', client_ville: '' }, null) })).equals(avant));
  // Compte null sans copie : « Client », sans email — comme avant
  assert.ok((await generate.buildFacture(null, { ...FACTURE_ABO, ...clientFacture({ id: 42 }, null) })).equals(
    await ref.buildFacture(null, { ...FACTURE_ABO, clientNom: 'Client', clientEmail: '' })));
});

test('facture d\'abonnement AVEC copie : bloc « FACTURÉ À » ; émetteur (prestataire) inchangé', { skip: sansGit }, async () => {
  const avant = await rendre(() => ref.buildFacture(null, { ...FACTURE_ABO, clientNom: 'Contact Du Jour', clientEmail: 'dujour@example.com' }));
  const emetteurAvant = bloc(avant.textes, 'ÉMETTEUR', 'FACTURÉ À');
  assert.deepEqual(bloc(avant.textes, 'FACTURÉ À', 'OBJET'), ['Contact Du Jour', 'dujour@example.com']);

  const facture = async (paiement, compte = COMPTE) => {
    const r = await rendre(() => generate.buildFacture(null, { ...FACTURE_ABO, ...clientFacture(paiement, compte) }));
    assert.deepEqual(bloc(r.textes, 'ÉMETTEUR', 'FACTURÉ À'), emetteurAvant, 'émetteur : inchangé');
    // Hors du bloc « FACTURÉ À », le texte est celui d'avant
    const i = r.textes.indexOf('FACTURÉ À');
    const j = r.textes.indexOf('OBJET');
    assert.deepEqual([...r.textes.slice(0, i), ...r.textes.slice(j)], [...avant.textes.slice(0, avant.textes.indexOf('FACTURÉ À')), ...avant.textes.slice(avant.textes.indexOf('OBJET'))]);
    return r.textes.slice(i + 1, j);
  };
  assert.deepEqual(await facture(COPIE_CLIENT), [
    'Les Essais du Dar',
    `SARL${SEP}Matricule fiscal : 1234567A/A/M/000`,
    'RNE : 7654321B',
    'client@example.com',
    '12 rue des Essais, 1000 Tunis',
  ]);
  // Compte null : la copie suffit
  assert.equal((await facture(COPIE_CLIENT, null))[0], 'Les Essais du Dar');
  // Auto-entrepreneur : identifiant unique, RNE égal omis
  assert.deepEqual(await facture({ ...COPIE_CLIENT, client_forme: 'AUTO_ENTREPRENEUR', client_matricule_fiscal: '1234567A', client_rne: '1234567A' }), [
    'Les Essais du Dar', `Auto-entrepreneur${SEP}Identifiant unique : 1234567A`, 'client@example.com', '12 rue des Essais, 1000 Tunis',
  ]);
  // Forme « Autre » : non imprimée
  assert.deepEqual(await facture({ ...COPIE_CLIENT, client_forme: 'AUTRE' }), [
    'Les Essais du Dar', 'Matricule fiscal : 1234567A/A/M/000', 'RNE : 7654321B', 'client@example.com', '12 rue des Essais, 1000 Tunis',
  ]);
  // Sans raison sociale : le nom copié ; ville sans adresse ; adresse sans ville
  assert.deepEqual(await facture({ ...COPIE_CLIENT, client_raison_sociale: null, client_adresse: null, client_rne: null }), [
    'Contact Essai', `SARL${SEP}Matricule fiscal : 1234567A/A/M/000`, 'client@example.com', '1000 Tunis',
  ]);
  assert.deepEqual(await facture({ ...COPIE_CLIENT, client_forme: null, client_matricule_fiscal: null, client_rne: null, client_ville: null }), [
    'Les Essais du Dar', 'client@example.com', '12 rue des Essais',
  ]);
});

test('facture d\'abonnement AVEC copie : chaque ligne de « FACTURÉ À » est omise si vide (64 combinaisons)', async () => {
  const champs = [
    ['client_raison_sociale', 'Les Essais du Dar'], ['client_forme', 'SA'], ['client_matricule_fiscal', '1234567A/A/M/000'],
    ['client_rne', '7654321B'], ['client_adresse', '12 rue des Essais'], ['client_ville', '1000 Tunis'],
  ];
  for (let masque = 0; masque < (1 << champs.length); masque += 1) {
    const p = { ...COPIE_CLIENT };
    champs.forEach(([colonne, valeur], i) => { p[colonne] = (masque >> i) & 1 ? valeur : null; });
    const r = await rendre(() => generate.buildFacture(null, { ...FACTURE_ABO, ...clientFacture(p, COMPTE) }));
    const attendu = [
      p.client_raison_sociale || 'Contact Essai',
      [p.client_forme, p.client_matricule_fiscal && `Matricule fiscal : ${p.client_matricule_fiscal}`].filter(Boolean).join(SEP),
      p.client_rne && `RNE : ${p.client_rne}`,
      'client@example.com',
      [p.client_adresse, p.client_ville].filter(Boolean).join(', '),
    ].filter(Boolean);
    assert.deepEqual(bloc(r.textes, 'FACTURÉ À', 'OBJET'), attendu, `combinaison ${masque.toString(2).padStart(6, '0')}`);
  }
});

// ── 4. Facture d'approvisionnement : rien ne change ─────────────────────────────────────────────────────────

test('facture d\'approvisionnement : IDENTIQUE à l\'octet à la référence (décision du client : non touchée)', { skip: sansGit }, async () => {
  const { buildFactureApproPdf, libellesFactureAppro } = require('../src/services/factureApproPdf');
  const { vocabDefaut } = require('../src/utils/vocab');
  const f = {
    ref_facture: 'FAC-0012', date_facture: '2026-09-30', activite_id: 7, activite_nom: 'Terrasse des Essais', labo_nom: null, type_source: 'manuel',
    fournisseur_nom: 'Grossiste Fictif', fournisseur_adresse: 'Zone des Essais, Tunis', fournisseur_tel: '+216 70 000 002',
    entreprise_nom: 'Contact Essai', entreprise_adresse: '12 rue des Essais', entreprise_tel: '+216 20 000 001', entreprise_email: 'vendeur@example.com',
    montant_ht: 42, montant_tva: 2.94, montant_ttc: 44.94, notes: 'RAS',
    // Colonnes d'identité qu'une lecture de la fiche pourrait porter : la facture d'appro ne les imprime pas
    raison_sociale: 'Les Essais du Dar', matricule_fiscal: '1234567A/A/M/000', rne: '7654321B', ville: '1000 Tunis', forme_juridique: 'SARL',
  };
  const lignes = [{ ingredient_nom: 'Poulet entier', unite_nom: 'kg', quantite: 3.5, prix_unitaire: 12, taux_tva: 7 }];
  const data = {
    refFacture: 'FAC-0012', dateFacture: '2026-09-30', contexte: `${vocabDefaut.Court('activite')} : Terrasse des Essais`, typeSource: 'manuel',
    fournisseur: { nom: 'Grossiste Fictif', adresse: 'Zone des Essais, Tunis', tel: '+216 70 000 002' },
    entreprise: { nom: 'Contact Essai', adresse: '12 rue des Essais', tel: '+216 20 000 001', email: 'vendeur@example.com' },
    lignes: [{ designation: 'Poulet entier', unite: 'kg', quantite: 3.5, prixHt: 12, tauxTva: 7 }],
    montantHt: 42, montantTva: 2.94, montantTtc: 44.94, notes: 'RAS',
  };
  assert.ok((await generate.buildFactureAppro(null, data)).equals(await ref.buildFactureAppro(null, data)), 'builder : mêmes octets');
  // Le service (src/services/factureApproPdf.js, non modifié) rendu par le générateur courant = les mêmes données
  // rendues par le générateur de référence
  const r = await rendre(() => buildFactureApproPdf(f, lignes, vocabDefaut));
  assert.ok(r.buf.equals(await ref.buildFactureAppro(null, { ...data, libelles: libellesFactureAppro(f, vocabDefaut) })), 'service : mêmes octets');
  assert.deepEqual(bloc(r.textes, 'FACTURÉ À', 'DÉTAIL DES LIGNES'), ['Contact Essai', 'vendeur@example.com', '+216 20 000 001', '12 rue des Essais']);
  assert.ok(!r.textes.some((t) => /Les Essais du Dar|1234567A|7654321B|1000 Tunis|RNE/.test(t)), 'aucune mention légale sur la facture d\'appro');
});

// ── 5. Rien n'est imprimé deux fois (retouches du 05/10/2026, après la relecture des écrans) ────────────────
// Forme omise quand la raison sociale se termine déjà par elle ; RNE omis quand il égale le matricule aux
// séparateurs et à la casse près ; ville non accolée quand l'adresse la contient déjà ; nom commercial omis quand il
// égale le nom imprimé sans tenir compte de la casse ; sous-titre de la facture de vente borné à la largeur de la page.

test('forme juridique : omise quand la raison sociale se termine déjà par elle, imprimée sinon', async () => {
  const forme = (raisonSociale, code) => vendeurFacture({ ...COPIE_VENDEUR, vendeur_raison_sociale: raisonSociale, vendeur_forme: code }).forme;
  // Dans le nom : omise (sans tenir compte de la casse ni des espaces multiples)
  assert.equal(forme('Dar Fictif SARL', 'SARL'), null);
  assert.equal(forme('Dar Fictif sarl', 'SARL'), null, 'sans tenir compte de la casse');
  assert.equal(forme('  Dar   Fictif   SARL ', 'SARL'), null);
  assert.equal(forme('SARL', 'SARL'), null, 'raison sociale égale à la forme');
  assert.equal(forme('Dar Fictif SUARL', 'SUARL'), null);
  assert.equal(forme('Dar Fictif SA', 'SA'), null);
  assert.equal(forme('Comptoir Fictif SNC', 'SNC'), null);
  assert.equal(forme('Les Amis du Dar Association', 'ASSOCIATION'), null);
  assert.equal(forme('Sami Fictif Entreprise Individuelle', 'EI'), null);
  assert.equal(forme('Sami Fictif auto-entrepreneur', 'AUTO_ENTREPRENEUR'), null);
  // Hors du nom : imprimée
  assert.equal(forme('Dar Fictif', 'SARL'), 'SARL');
  assert.equal(forme('Dar Fictif SARL', 'SUARL'), 'SUARL', 'le nom finit par une AUTRE forme');
  assert.equal(forme('Dar Fictif SUARL', 'SARL'), 'SARL');
  assert.equal(forme('Dar Fictif SARL', 'SA'), 'SA');
  assert.equal(forme('SARL Dar Fictif', 'SARL'), 'SARL', 'forme en tête du nom');
  assert.equal(forme('Pâtisserie Elyssa', 'SA'), 'SA', 'le nom finit par les lettres « sa », pas par le mot « SA »');
  assert.equal(forme('Dar FictifSARL', 'SARL'), 'SARL', 'pas de mot séparé');
  assert.equal(forme('Sami Fictif', 'EI'), 'Entreprise individuelle');
  assert.equal(forme(null, 'SARL'), 'SARL', 'sans raison sociale');
  assert.equal(forme('   ', 'SARL'), 'SARL');
  // « Autre » ne s'imprime jamais ; l'auto-entrepreneur garde son « identifiant unique » même quand la forme est omise
  assert.equal(forme('Dar Fictif Autre', 'AUTRE'), null);
  const ae = vendeurFacture({ ...COPIE_VENDEUR, vendeur_raison_sociale: 'Sami Fictif Auto-entrepreneur', vendeur_forme: 'AUTO_ENTREPRENEUR', vendeur_matricule_fiscal: '7654321B', vendeur_rne: null });
  assert.equal(ae.forme, null);
  assert.equal(ae.autoEntrepreneur, true);
  // Même règle pour le client de la facture d'abonnement
  assert.equal(clientFacture({ ...COPIE_CLIENT, client_raison_sociale: 'Dar Fictif SARL' }, COMPTE).client.forme, null);
  assert.equal(clientFacture({ ...COPIE_CLIENT, client_raison_sociale: 'Dar Fictif' }, COMPTE).client.forme, 'SARL');
  // Sans raison sociale, le nom du contact copié ne compte pas : la forme s'imprime
  assert.equal(clientFacture({ ...COPIE_CLIENT, client_raison_sociale: null, client_nom: 'Dar Fictif SARL' }, COMPTE).client.forme, 'SARL');

  // PDF — facture de vente : la ligne ne porte que le matricule ; sans matricule, elle disparaît
  let r = await rendre(() => buildFactureAcheteurPdf({ ...LIGNE_FACTURE, ...COPIE_VENDEUR, vendeur_raison_sociale: 'Dar Fictif SARL' }, LIGNES_COMMANDE));
  assert.deepEqual(bloc(r.textes, 'ÉMETTEUR', 'FACTURÉ À'), [
    'Dar Fictif SARL', 'Nom commercial : Le Jasmin Fictif', 'Matricule fiscal : 1234567A/A/M/000', 'RNE : 7654321B',
    '12 rue des Essais, 1000 Tunis', `vendeur@example.com${SEP}+216 20 000 001`,
  ]);
  assert.ok(!r.textes.some((t) => t.startsWith(`SARL${SEP}`) || t === 'SARL'), 'la forme n\'est écrite qu\'une fois, dans le nom');
  r = await rendre(() => buildFactureAcheteurPdf({ ...LIGNE_FACTURE, ...COPIE_VENDEUR, vendeur_raison_sociale: 'Dar Fictif SARL', vendeur_matricule_fiscal: null, vendeur_rne: null }, LIGNES_COMMANDE));
  assert.deepEqual(bloc(r.textes, 'ÉMETTEUR', 'FACTURÉ À'), ['Dar Fictif SARL', 'Nom commercial : Le Jasmin Fictif', '12 rue des Essais, 1000 Tunis', `vendeur@example.com${SEP}+216 20 000 001`]);
  r = await rendre(() => buildFactureAcheteurPdf({ ...LIGNE_FACTURE, ...COPIE_VENDEUR, vendeur_raison_sociale: 'Sami Fictif Auto-entrepreneur', vendeur_forme: 'AUTO_ENTREPRENEUR', vendeur_matricule_fiscal: '7654321B', vendeur_rne: '7654321B' }, LIGNES_COMMANDE));
  assert.equal(bloc(r.textes, 'ÉMETTEUR', 'FACTURÉ À')[2], 'Identifiant unique : 7654321B');
  // PDF — facture d'abonnement
  r = await rendre(() => generate.buildFacture(null, { ...FACTURE_ABO, ...clientFacture({ ...COPIE_CLIENT, client_raison_sociale: 'Dar Fictif SARL' }, COMPTE) }));
  assert.deepEqual(bloc(r.textes, 'FACTURÉ À', 'OBJET'), ['Dar Fictif SARL', 'Matricule fiscal : 1234567A/A/M/000', 'RNE : 7654321B', 'client@example.com', '12 rue des Essais, 1000 Tunis']);
  r = await rendre(() => generate.buildFacture(null, { ...FACTURE_ABO, ...clientFacture({ ...COPIE_CLIENT, client_raison_sociale: 'Dar Fictif' }, COMPTE) }));
  assert.equal(bloc(r.textes, 'FACTURÉ À', 'OBJET')[1], `SARL${SEP}Matricule fiscal : 1234567A/A/M/000`);
});

test('RNE : omis quand il égale le matricule aux séparateurs et à la casse près (« 7654321 b » = « 7654321B »)', async () => {
  const rne = (matricule, saisi) => vendeurFacture({ ...COPIE_VENDEUR, vendeur_matricule_fiscal: matricule, vendeur_rne: saisi }).rne;
  assert.equal(rne('7654321B', '7654321 b'), null);
  assert.equal(rne('7654321B', '7654321-B'), null);
  assert.equal(rne('7654321B', ' 7654321.b '), null);
  assert.equal(rne('1234567A/A/M/000', '1234567AAM000'), null);
  assert.equal(rne('1234567A/A/M/000', '1234567 a/a/m/000'), null);
  assert.equal(rne('1234567A/A/M/000', '1234567-A_A.M/000'), null);
  // Différent : imprimé tel qu'il a été saisi (rogné)
  assert.equal(rne('1234567A/A/M/000', '1234567A'), '1234567A', 'le RNE n\'est que le début du matricule : imprimé');
  assert.equal(rne('7654321B', ' 7654321 c '), '7654321 c');
  assert.equal(rne('7654321B', '7654321BB'), '7654321BB');
  assert.equal(rne(null, '7654321 b'), '7654321 b', 'sans matricule : imprimé');
  assert.equal(rne('7654321B', null), null);
  // Même règle pour le client de la facture d'abonnement
  assert.equal(clientFacture({ ...COPIE_CLIENT, client_matricule_fiscal: '7654321B', client_rne: '7654321 b' }, COMPTE).client.rne, null);
  assert.equal(clientFacture({ ...COPIE_CLIENT, client_matricule_fiscal: '7654321B', client_rne: '7654321 c' }, COMPTE).client.rne, '7654321 c');
  // PDF : aucune ligne « RNE » sur les deux factures
  let r = await rendre(() => buildFactureAcheteurPdf({ ...LIGNE_FACTURE, ...COPIE_VENDEUR, vendeur_forme: 'AUTO_ENTREPRENEUR', vendeur_matricule_fiscal: '7654321B', vendeur_rne: '7654321 b' }, LIGNES_COMMANDE));
  assert.ok(!r.textes.some((t) => /RNE/.test(t)), JSON.stringify(bloc(r.textes, 'ÉMETTEUR', 'FACTURÉ À')));
  assert.ok(bloc(r.textes, 'ÉMETTEUR', 'FACTURÉ À').includes(`Auto-entrepreneur${SEP}Identifiant unique : 7654321B`));
  r = await rendre(() => generate.buildFacture(null, { ...FACTURE_ABO, ...clientFacture({ ...COPIE_CLIENT, client_matricule_fiscal: '7654321B', client_rne: '7654321 b' }, COMPTE) }));
  assert.ok(!r.textes.some((t) => /RNE/.test(t)), JSON.stringify(bloc(r.textes, 'FACTURÉ À', 'OBJET')));
});

test('ville : non accolée quand l\'adresse la contient déjà (sans tenir compte de la casse), accolée sinon', async () => {
  const ville = (adresse, v) => vendeurFacture({ ...COPIE_VENDEUR, vendeur_adresse: adresse, vendeur_ville: v }).ville;
  assert.equal(ville('5 rue des Essais, 2080 Ariana', '2080 Ariana'), null);
  assert.equal(ville('5 RUE DES ESSAIS, 2080 ARIANA', '2080 ariana'), null, 'sans tenir compte de la casse');
  assert.equal(ville('5 rue des Essais, 2080  Ariana', ' 2080 Ariana '), null, 'espaces multiples');
  assert.equal(ville('5 rue des Essais - Ariana', 'Ariana'), null);
  // Absente de l'adresse : accolée
  assert.equal(ville('5 rue des Essais', '2080 Ariana'), '2080 Ariana');
  assert.equal(ville('5 rue des Essais, 2081 Ariana', '2080 Ariana'), '2080 Ariana', 'autre code postal');
  assert.equal(ville(null, '2080 Ariana'), '2080 Ariana', 'sans adresse');
  assert.equal(ville('', '2080 Ariana'), '2080 Ariana');
  assert.equal(ville('5 rue des Essais, 2080 Ariana', null), null);
  // Même règle pour le client de la facture d'abonnement
  assert.equal(clientFacture({ ...COPIE_CLIENT, client_adresse: '5 rue des Essais, 2080 Ariana', client_ville: '2080 ARIANA' }, COMPTE).client.ville, null);
  assert.equal(clientFacture({ ...COPIE_CLIENT, client_adresse: '5 rue des Essais', client_ville: '2080 Ariana' }, COMPTE).client.ville, '2080 Ariana');

  // PDF — facture de vente : l'adresse seule, dans le bloc et au pied de page
  let r = await rendre(() => buildFactureAcheteurPdf({ ...LIGNE_FACTURE, ...COPIE_VENDEUR, vendeur_adresse: '5 rue des Essais, 2080 Ariana', vendeur_ville: '2080 ARIANA' }, LIGNES_COMMANDE));
  const emetteur = bloc(r.textes, 'ÉMETTEUR', 'FACTURÉ À');
  assert.equal(emetteur[emetteur.length - 2], '5 rue des Essais, 2080 Ariana');
  assert.equal(r.textes[r.textes.length - 3], `Les Essais du Dar${SEP}MF 1234567A/A/M/000${SEP}5 rue des Essais, 2080 Ariana`, 'pied de page');
  assert.ok(!r.textes.some((t) => /ARIANA|Ariana.*Ariana/.test(t)), 'la ville n\'est écrite qu\'une fois');
  // PDF — facture d'abonnement
  r = await rendre(() => generate.buildFacture(null, { ...FACTURE_ABO, ...clientFacture({ ...COPIE_CLIENT, client_adresse: '5 rue des Essais, 2080 Ariana', client_ville: '2080 Ariana' }, COMPTE) }));
  const facture = bloc(r.textes, 'FACTURÉ À', 'OBJET');
  assert.equal(facture[facture.length - 1], '5 rue des Essais, 2080 Ariana');
});

// DÉFAUT du code applicatif (test laissé ROUGE, code non corrigé) : la règle « l'adresse contient déjà la ville »
// est une recherche de sous-chaîne (plat(adresse).includes(plat(ville)), src/utils/identiteFacture.js, mentions).
// Un MOT de l'adresse qui contient le nom de la ville (« Tunisie » ⊃ « Tunis », « Mariana » ⊃ « Ariana ») suffit à
// retirer la ville : la facture s'imprime alors SANS ville, alors que l'adresse ne la porte pas.
// Ne se produit que si la ville est saisie sans code postal (avec « 1053 Tunis », la recherche ne trouve rien).
test('ville : un mot de l\'adresse qui CONTIENT le nom de la ville n\'est pas la ville (« Tunisie » n\'est pas « Tunis »)', () => {
  const ville = (adresse, v) => vendeurFacture({ ...COPIE_VENDEUR, vendeur_adresse: adresse, vendeur_ville: v }).ville;
  assert.equal(ville('Immeuble Tunisie Leasing, rue du Lac', 'Tunis'), 'Tunis');
  assert.equal(ville('12 rue Mariana', 'Ariana'), 'Ariana');
  assert.equal(clientFacture({ ...COPIE_CLIENT, client_adresse: 'Immeuble Tunisie Leasing, rue du Lac', client_ville: 'Tunis' }, COMPTE).client.ville, 'Tunis');
});

test('nom commercial : omis quand il égale le nom imprimé sans tenir compte de la casse', async () => {
  const nc = (raisonSociale, nomCommercial, contact = 'Contact Essai') => vendeurFacture({ ...COPIE_VENDEUR, vendeur_nom: contact, vendeur_raison_sociale: raisonSociale, vendeur_nom_commercial: nomCommercial }).nomCommercial;
  assert.equal(nc('Les Essais du Dar', 'LES ESSAIS DU DAR'), null);
  assert.equal(nc('Les Essais du Dar', 'les  essais   du dar'), null, 'espaces multiples');
  assert.equal(nc(null, 'contact essai'), null, 'égal au nom du contact imprimé');
  assert.equal(nc('Les Essais du Dar', 'Les Essais'), 'Les Essais');
  assert.equal(nc('Les Essais du Dar', 'Le Jasmin Fictif'), 'Le Jasmin Fictif');
  const r = await rendre(() => buildFactureAcheteurPdf({ ...LIGNE_FACTURE, ...COPIE_VENDEUR, vendeur_nom_commercial: 'LES ESSAIS DU DAR' }, LIGNES_COMMANDE));
  assert.ok(!r.textes.some((t) => t.startsWith('Nom commercial')), JSON.stringify(bloc(r.textes, 'ÉMETTEUR', 'FACTURÉ À')));
});

test('facture de vente : sous-titre borné à la largeur de la page quand le nom est très long ; nom entier dans le bloc ÉMETTEUR', { skip: sansGit }, async () => {
  const LARGEUR = 595.28 - 2 * 56; // largeur du contenu (CW de generate.js)
  const largeur = (s) => new PDFDocument().fontSize(9).font('Helvetica').widthOfString(s);
  const long = 'Société Fictive des Essais Vraiment Très Longs et Associés '.repeat(4).trim(); // 235 caractères
  assert.ok(long.length > 200 && long.length <= 255);
  const fin = ' — vente professionnelle, émise via la plateforme LabFlow';
  const sousTitre = (textes) => textes[textes.indexOf('Facture de vente') + 1];

  // Nom long (copie figée) : tronqué avec « … », jamais plus large que la page
  let r = await rendre(() => buildFactureAcheteurPdf({ ...LIGNE_FACTURE, ...COPIE_VENDEUR, vendeur_raison_sociale: long }, LIGNES_COMMANDE));
  let st = sousTitre(r.textes);
  assert.ok(largeur(`${long}${fin}`) > LARGEUR, 'le sous-titre entier dépasserait la page');
  assert.ok(st.endsWith('…') && long.startsWith(st.slice(0, -1).trimEnd()), `sous-titre tronqué : ${st}`);
  assert.ok(largeur(st) <= LARGEUR, `largeur ${largeur(st)} ≤ ${LARGEUR}`);
  assert.ok(largeur(st) > LARGEUR * 0.9, 'tronqué au plus près de la largeur');
  assert.equal(bloc(r.textes, 'ÉMETTEUR', 'FACTURÉ À')[0], long, 'nom entier dans le bloc ÉMETTEUR');
  assert.equal(r.info.Author, long);
  // Nom long sans copie (nom du contact de la fiche) : même borne
  r = await rendre(() => buildFactureAcheteurPdf({ ...LIGNE_FACTURE, vendeur_fige_le: null, ...FICHE, vendeur_nom: long }, LIGNES_COMMANDE));
  st = sousTitre(r.textes);
  assert.ok(st.endsWith('…') && largeur(st) <= LARGEUR);
  // Nom qui tient : sous-titre entier, et pas un octet de changé par rapport à la référence
  r = await rendre(() => buildFactureAcheteurPdf({ ...LIGNE_FACTURE, vendeur_fige_le: null, ...FICHE }, LIGNES_COMMANDE));
  assert.equal(sousTitre(r.textes), `Contact Essai${fin}`);
  assert.ok(r.buf.equals(await ref.buildFactureAcheteur(null, donneesAvant(LIGNE_FACTURE, VENDEUR_AVANT))));
  // Le plus long nom dont le sous-titre tient encore : non tronqué
  let juste = 'M';
  while (largeur(`${juste}M${fin}`) <= LARGEUR) juste += 'M';
  r = await rendre(() => buildFactureAcheteurPdf({ ...LIGNE_FACTURE, ...COPIE_VENDEUR, vendeur_raison_sociale: juste }, LIGNES_COMMANDE));
  assert.equal(sousTitre(r.textes), `${juste}${fin}`, 'sous-titre qui tient tout juste : entier');
});
