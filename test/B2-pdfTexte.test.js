// Lot 2b, B2 — pdfTexte au serveur, EN OPTION (spec docs/lot-2b-spec.md §8.3, §11.1.2).
//   node --test test/B2-pdfTexte.test.js
//
// 1. pdfTexte (docuseal-templates/generate.js) : table du front (src/utils/pdfTexte.ts) ; « → » devient « › »,
//    une donnée hors Windows-1252 devient « ? » ; « () » et « « » » vides retirés SEULEMENT si un signe décoratif
//    a été retiré (« Sauce () » inchangé) ; idempotent.
// 2. Octets : les documents qui ne prennent PAS l'option sont identiques à l'octet à ceux de la référence
//    (generate.js au commit du socle, 62288e4) : facture acheteur avec remise et données hors Windows-1252,
//    facture d'abonnement. Seule exception, depuis le 05/10/2026 : le signe de la ligne « Remise » (voir
//    corrigerSigneRemise). La facture d'appro prend toujours l'option : identique tant que son texte est dans la
//    police, différente sinon.
// Lot 3, étape 5 : buildContrat, buildAvenant et buildResiliation sont retirés de generate.js (plus de contrat,
// d'avenant ni de résiliation) ; leurs 2 tests partent avec eux. Les 3 tests de facture « IDENTIQUE à l'octet »
// restent : ils prouvent que l'élagage n'a touché aucun élément partagé (en-tête, bloc des parties, pied, logo).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');

const RACINE = path.resolve(__dirname, '..');
const REFERENCE = '62288e4'; // socle du lot 2b, avant le balayage B2

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
const { pdfTexte, pdfTexteSur } = generate;
const ref = chargerReference('docuseal-templates/generate.js');

test('pdfTexte : équivalents, « ? » hors police, retraits conditionnels, idempotence', () => {
  assert.equal(pdfTexte('Transfert labo → activité'), 'Transfert labo › activité');
  assert.equal(pdfTexte('Reçu ← X ↔ Y'), 'Reçu ‹ X ‹› Y');
  assert.equal(pdfTexte('− 3 ≤ 4 ≥ 2 ≠ 1 ≈ 0 Σ ∑ ∞ ▲ ▼'), '– 3 <= 4 >= 2 <> 1 ~ 0 Somme Somme infini + –');
  assert.equal(pdfTexte('1 000 €​﻿'), '1 000 €');
  assert.equal(pdfTexte('مطعم'), '????', 'alphabet non latin : « ? » par caractère');
  assert.equal(pdfTexte('Burger 🍔'), 'Burger ?', 'emoji : un « ? » (un point de code)');
  // Windows-1252 complet : inchangé
  const cp1252 = 'Œuvre — « test » … € ’ ‘ “ ” • – ™ š ž Ÿ ‹ › ˆ ˜ ‰ Š Ž ƒ „ † ‡ àéèçôÿ';
  assert.equal(pdfTexte(cp1252), cp1252);
  // Retraits de « () » et « « » » vides : seulement après le retrait d'un signe décoratif
  assert.equal(pdfTexte('Sauce ()'), 'Sauce ()');
  assert.equal(pdfTexte('Citation « »'), 'Citation « »');
  assert.equal(pdfTexte('Validé (✓)'), 'Validé ');
  assert.equal(pdfTexte('État « ● »'), 'État ');
  assert.equal(pdfTexte('✓ Sauce ()'), ' Sauce ', 'un décoratif retiré : tous les () vides de la chaîne partent');
  for (const s of ['a → b (✓)', 'مطعم 🍔 −', 'Sauce ()', '« ✔ » ⇒ ∞']) assert.equal(pdfTexte(pdfTexte(s)), pdfTexte(s), `idempotent : ${s}`);
});

test('pdfTexteSur : text, heightOfString et widthOfString reçoivent le texte sûr ; chaîne et non-chaînes', () => {
  const vus = [];
  const doc = {
    text(s) { vus.push(['text', s]); return this; },
    heightOfString(s) { vus.push(['height', s]); return 10; },
    widthOfString(s) { vus.push(['width', s]); return 20; },
  };
  assert.equal(pdfTexteSur(doc), doc);
  assert.equal(doc.text('a → b').text(42), doc, 'chaînage conservé');
  assert.equal(doc.heightOfString('مطعم'), 10);
  assert.equal(doc.widthOfString('x ✓ ()'), 20);
  assert.deepEqual(vus, [['text', 'a › b'], ['text', 42], ['height', '????'], ['width', 'x  ']]);
});

const factureAcheteur = {
  numero: 'FA-2026-0042', dateFacture: '2026-07-10',
  vendeur: { nom: 'مطعم الكرم — Le Carthage', adresse: 'Rue de Marseille, 1000 Tunis', tel: '+216 22 345 678', email: 'gerant@lecarthage.tn' },
  acheteur: { nom: 'Sami Trabelsi', entreprise: 'Épicerie 🍋 du Lac', adresse: 'Les Berges du Lac → Tunis', mf: '1122334/C/M/000', tel: '+216 55 111 222', email: 'contact@epiceriedulac.tn' },
  lignes: [
    { designation: 'Farine → T45 ✓', quantite: 25, prixHt: 2.4, tauxTva: 7 },
    { designation: 'خبز Σ (pièce)', quantite: 12, prixHt: 14.5, tauxTva: 19 },
  ],
  remisePct: 5, montantHt: 222.3, montantTva: 40.12, timbreFiscal: true, montantTimbre: 1,
  montantTtc: 263.42, notes: 'Livraison ✓ chaque mardi → 9h — bon n° BC-118 ()',
};

test('facture acheteur (remise, données hors Windows-1252) : IDENTIQUE à l\'octet à la référence, au signe de la remise près', { skip: !ref && 'git indisponible' }, async () => {
  const avant = await ref.buildFactureAcheteur(null, factureAcheteur);
  const apres = await generate.buildFactureAcheteur(null, factureAcheteur);
  assert.ok(Buffer.isBuffer(apres) && apres.length > 1000);
  assert.ok(avant.equals(apres), 'octets identiques');
  // Et la facture acheteur du service (factureAcheteurPdf.js, inchangé) passe par le même builder
  const { buildFactureAcheteurPdf } = require('../src/services/factureAcheteurPdf');
  const f = {
    numero: 'FA-1', date_facture: '2026-07-10', vendeur_nom: 'مطعم', acheteur_nom: 'Client 🍋', remise_pct: 10,
    montant_ht: 90, montant_tva: 17.1, timbre_fiscal: true, montant_timbre: 1, montant_ttc: 108.1, notes: 'a → b',
  };
  const lignes = [{ designation: 'Plat → du jour', quantite: 2, prix_ht: 50, taux_tva: 19 }];
  const viaRef = await ref.buildFactureAcheteur(null, {
    numero: 'FA-1', dateFacture: '2026-07-10',
    vendeur: { nom: 'مطعم', adresse: null, tel: null, email: null },
    acheteur: { nom: 'Client 🍋', entreprise: null, adresse: null, mf: null, tel: null, email: null },
    lignes: [{ designation: 'Plat → du jour', quantite: 2, prixHt: 50, tauxTva: 19 }],
    remisePct: 10, montantHt: 90, montantTva: 17.1, timbreFiscal: true, montantTimbre: 1, montantTtc: 108.1, notes: 'a → b',
  });
  assert.ok((await buildFactureAcheteurPdf(f, lignes)).equals(viaRef));
});

test('facture d\'abonnement : IDENTIQUE à l\'octet à la référence', { skip: !ref && 'git indisponible' }, async () => {
  const data = {
    numero: 'LF-2026-00123', dateFacture: '2026-06-27', periodeLabel: 'juin 2026 → juillet',
    clientNom: 'مطعم 🍔 Le Carthage', clientEmail: 'gerant@lecarthage.tn',
    montantHt: 319.328, montantTva: 60.672, montantTtc: 380, tvaRate: 19,
  };
  assert.ok((await ref.buildFacture(null, data)).equals(await generate.buildFacture(null, data)));
});

// Lot 3, étape 5 : les documents à signer n'existent plus dans generate.js (garde : un retour de l'un d'eux doit
// ramener son test).
test('generate.js : plus de contrat, d\'avenant ni de résiliation ; les 3 factures et pdfTexte restent exportés', () => {
  assert.deepEqual(Object.keys(generate).sort(), ['LIBELLES_FACTURE_APPRO', 'PRESTATAIRE', 'buildFacture', 'buildFactureAcheteur', 'buildFactureAppro', 'pdfTexte', 'pdfTexteSur']);
});

test('facture d\'appro : toujours l\'option ; libellés par défaut = textes d\'avant le lot', { skip: !ref && 'git indisponible' }, async () => {
  const { libellesFactureAppro } = require('../src/services/factureApproPdf');
  const { vocabDefaut } = require('../src/utils/vocab');
  const data = {
    refFacture: 'FAC-12', dateFacture: '2026-09-30', contexte: 'Activité : Terrasse', typeSource: 'manuel',
    fournisseur: { nom: 'Metro', adresse: 'Tunis', tel: '+216' },
    entreprise: { nom: 'Le Carthage', adresse: 'Rue', tel: '1', email: 'a@b.tn' },
    lignes: [{ designation: 'Poulet entier', unite: 'kg', quantite: 3.5, prixHt: 12, tauxTva: 7 }],
    montantHt: 42, montantTva: 2.94, montantTtc: 44.94, notes: 'RAS',
  };
  const avant = await ref.buildFactureAppro(null, data);
  assert.ok((await generate.buildFactureAppro(null, data)).equals(avant), 'sans libellés : mêmes octets');
  const libelles = libellesFactureAppro({ activite_id: 7, labo_id: null }, vocabDefaut);
  assert.ok((await generate.buildFactureAppro(null, { ...data, libelles })).equals(avant), 'libellés par défaut : mêmes octets');
  // Donnée hors police : l'option s'applique (défaut ancien corrigé, spec §11.1.2)
  const arabe = { ...data, lignes: [{ ...data.lignes[0], designation: 'دجاج' }] };
  assert.ok(!(await generate.buildFactureAppro(null, arabe)).equals(await ref.buildFactureAppro(null, arabe)));
});
