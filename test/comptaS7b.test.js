// LabFlow Compta, étape S7b « TVA, retenues et certificats » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne S7b, §2
// « S7b », §4 « TVA », « Retenues », « Seuil des retenues sur achats », « Droits », « Paquet pays » ; réponses du client du
// 09/10 — « ok pour les 9 » ; cahier des charges TEJ v2.0). Tests sans base : la fiscalité du paquet (régimes, familles,
// seuil, compte du crédit de TVA, codes TEJ) et son contrôle ; l'état de TVA (report du crédit) ; l'opération d'une pièce
// (TTC hors timbre, TVA, HT, retenue, retenue de TVA, net servi, date du règlement lettré, problèmes) ; les paiements et le
// seuil ; le bénéficiaire et le déclarant exigés par la plateforme ; les textes sans accent ; le fichier XML (structure,
// millimes, taux, rectificatif) ; le PDF des certificats ; les lecteurs des tiers (régime, résidence, identifiant) et des
// codes TEJ ; la retenue proposée d'après le régime ; les colonnes facultatives d'un import ; la forme des requêtes ; la
// migration 219 ; les routes ; les refus avant toute requête.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const paquets = require('../src/compta/paquets');
const calcul = require('../src/compta/taxesCalcul');
const certificats = require('../src/compta/certificats');
const taxesMois = require('../src/compta/taxesMois');
const tiers = require('../src/compta/tiers');
const taxes = require('../src/compta/taxes');
const ecritures = require('../src/compta/ecritures');
const importExcel = require('../src/compta/importExcel');
const routes = require('../src/compta/routes');
const est400 = (e) => e.statusCode === 400;
const reponse = () => {
  const res = { statut: 200, corps: null };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  return res;
};

test('paquet Tunisie : fiscalité (7 régimes et leurs retenues, familles, seuil 1 000 D, crédit 43667, 36 codes TEJ) contrôlée ; un défaut est vu', () => {
  const p = paquets.PAQUETS.TN;
  assert.deepEqual(paquets.controlerPaquet(p), []);
  const f = paquets.fiscaliteDe('TN');
  assert.deepEqual(f.regimesFiscaux.map((r) => `${r.valeur}:${r.personne}:${r.achats}:${r.honoraires}`), [
    'pm_is25:morale:RS_MAR15:RS_HON3', 'pm_is20:morale:RS_MAR1:RS_HON3', 'pm_is15:morale:RS_MAR15:RS_HON3', 'pm_is10:morale:RS_MAR05:RS_HON3',
    'pp_reel:physique:RS_MAR15:RS_HON3', 'pp_deux_tiers:physique:RS_MAR05:RS_HON3', 'pp_forfait:physique:RS_MAR15:RS_HON10',
  ]);
  assert.ok(/^Non confirmé/.test(f.regimesFiscaux.find((r) => r.valeur === 'pm_is15').note), 'IS 15 % : point non confirmé (recherche §3.6, point 2)');
  assert.deepEqual(f.familles, { achats: ['RS_MAR15', 'RS_MAR1', 'RS_MAR05'], honoraires: ['RS_HON10', 'RS_HON3'] });
  assert.equal(f.seuilAchats, '1000.000');
  assert.equal(f.tva.compteCredit, '43667');
  assert.equal(f.tej.versionSchema, '1.0');
  assert.equal(f.tej.codesOperations.length, 36);
  assert.ok(f.tej.codesOperations.every((o) => paquets.RE_CODE_OPERATION_TEJ.test(o.code)));
  assert.equal(paquets.regimeFiscalDe('TN', 'pp_reel').libelle, 'Personne physique au régime réel (carte d\'identification fiscale)');
  assert.equal(paquets.regimeFiscalDe('TN', 'inconnu'), null);
  assert.equal(paquets.regimeFiscalDe('FR', 'pm_is25'), null);
  const casse = JSON.parse(JSON.stringify(p));
  casse.fiscalite.regimesFiscaux[0].achats = 'RS_INCONNU';
  casse.fiscalite.familles.achats.push('TVA19');
  casse.fiscalite.tej.codesOperations[0].code = 'RS1-1';
  casse.fiscalite.tva.compteCredit = '99999';
  const d = paquets.controlerPaquet(casse);
  assert.ok(d.some((x) => /RS_INCONNU/.test(x)) && d.some((x) => /TVA19/.test(x)) && d.some((x) => /RS1-1/.test(x)) && d.some((x) => /crédit de TVA/.test(x)), d.join(' | '));
});

test('état de TVA : collectée − déductible − retenues de TVA subies − crédit reporté ; le crédit d\'un mois passe au suivant ; ouverture = à-nouveaux', () => {
  const periodes = [{ id: 1, debut: '2026-01-01', fin: '2026-01-31', etat: 'close' }, { id: 2, debut: '2026-02-01', fin: '2026-02-28', etat: 'ouverte' }, { id: 3, debut: '2026-03-01', fin: '2026-03-31', etat: 'ouverte' }];
  const r = (periode, { collectee = '0', deductible = '0', immo = '0', subie = '0' }) => ({ periode_id: periode, taxe_id: 9, code: 'TVA19', libelle: 'TVA 19 %', type: 'tva', taux: '19.000', collectee, deductible, deductible_immo: immo, retenue_subie: subie, non_recuperable: '0', base_vente: '0', base_achat: '0', nb_brouillard: 0 });
  const etats = calcul.etatsTva({ periodes, ouverture: '100.000', rangees: [r(1, { collectee: '190.000', deductible: '380.000' }), r(2, { collectee: '1000.000', deductible: '200.000', immo: '50.000', subie: '47.500' })] });
  assert.deepEqual(etats.map((e) => [e.creditReporte, e.resultat, e.aPayer, e.creditAReporter]), [
    ['100.000', '-290.000', '0.000', '290.000'],
    ['290.000', '412.500', '412.500', '0.000'],
    ['0.000', '0.000', '0.000', '0.000'],
  ]);
  assert.equal(etats[1].deductible, '250.000');
  assert.equal(etats[1].retenuesSubies, '47.500');
  assert.equal(calcul.etatsTva({ periodes, rangees: [], jusqua: 2 }).length, 2, 's\'arrête à la période demandée');
  assert.equal(calcul.etatsTva({ periodes, rangees: [], ouverture: '-30.000' })[0].creditReporte, '0.000', 'un à-nouveau créditeur n\'est pas un crédit');
});

// Une pièce d'achat : 607 base, 43666 TVA, timbre, retenue, fournisseur.
const ligne = (o) => ({ id: o.id, ecriture_id: 50, tiers_id: o.tiers ?? null, debit: o.d || '0.000', credit: o.c || '0.000', lettrage_id: o.lettre ?? null, compte_id: o.compte, nature: o.nature, taxe_id: o.taxe?.id ?? null, taxe_code: o.taxe?.code ?? null, taxe_libelle: o.taxe?.libelle ?? null, taxe_type: o.taxe?.type ?? null, taxe_taux: o.taxe?.taux ?? null, code_tej: o.taxe?.tej ?? null, compte_achat_id: o.taxe?.achat ?? null, compte_vente_id: o.taxe?.vente ?? null, compte_immo_id: o.taxe?.immo ?? null, date: '2026-09-05', date_reelle: null, etat: 'validee', reference: 'F-0905', ecriture_libelle: 'Facture', numero: 'AC-2026-000002', numero_provisoire: 3, periode_id: 9, journal_code: 'AC', journal_type: 'achats' });
const TVA19 = { id: 1, code: 'TVA19', type: 'tva', taux: '19.000', achat: 20, vente: 21, immo: 22 };
const RS15 = { id: 2, code: 'RS_MAR15', libelle: 'Retenue achats', type: 'retenue', taux: '1.500', tej: 'RS7_000001', achat: 30 };
const RSTVA100 = { id: 3, code: 'RSTVA100', type: 'retenue_tva', taux: '100.000', tej: 'RSTVA100', achat: 30 };
const TIMBRE = { id: 4, code: 'TIMBRE', type: 'timbre', achat: 40 };
const piece = (extra = []) => [
  ligne({ id: 1, compte: 10, nature: 'charges', d: '1000.000', taxe: TVA19 }),
  ligne({ id: 2, compte: 20, nature: 'tva_deductible', d: '190.000', taxe: TVA19 }),
  ligne({ id: 3, compte: 40, nature: 'charges', d: '1.000', taxe: TIMBRE }),
  ligne({ id: 4, compte: 30, nature: 'retenues_operees', c: '17.850', taxe: RS15 }),
  ligne({ id: 5, compte: 50, nature: 'fournisseurs', c: '1173.150', tiers: 7, lettre: 70 }),
  ...extra,
];

test('opération d\'une pièce : TTC hors timbre, TVA, HT, retenue, net servi ; date du règlement lettré, sinon de la facture', () => {
  const lettres = new Map([[70, [{ lettrage_id: 70, ecriture_id: 50, date: '2026-09-05', debit: '0.000', credit: '1173.150' }, { lettrage_id: 70, ecriture_id: 60, date: '2026-09-20', debit: '1173.150', credit: '0.000' }]]]);
  const o = calcul.operationDe(piece(), lettres);
  assert.deepEqual([o.ht, o.tva, o.ttc, o.rs, o.net, o.tauxRs, o.tauxTva, o.codeTej, o.tiersId, o.dateProposee, o.sourceDate, o.anneeFacturation, o.probleme], ['1000.000', '190.000', '1190.000', '17.850', '1172.150', '1.500', '19.000', 'RS7_000001', 7, '2026-09-20', 'reglement', 2026, null]);
  assert.deepEqual(o.lignes, [4]);
  const sans = calcul.operationDe(piece().map((l) => ({ ...l, lettrage_id: null })));
  assert.deepEqual([sans.dateProposee, sans.sourceDate], ['2026-09-05', 'facture']);
  const reelle = calcul.operationDe(piece().map((l) => ({ ...l, lettrage_id: null, date_reelle: '2026-08-30' })));
  assert.equal(reelle.dateProposee, '2026-08-30', 'la vraie date d\'une opération enregistrée plus tard');
  // Retenue de TVA (non-résident) : taxe additionnelle, déduite du net servi.
  const nr = calcul.operationDe(piece([ligne({ id: 6, compte: 30, nature: 'retenues_operees', c: '190.000', taxe: RSTVA100 })]));
  assert.deepEqual(nr.rsTva, { code: 'RSTVA100', taux: '100.000', montant: '190.000' });
  assert.equal(nr.net, '982.150');
  assert.deepEqual(nr.lignes, [4, 6]);
});

test('opération : les problèmes qui empêchent le certificat (bénéficiaire, retenue de TVA seule, deux codes, code sans TEJ)', () => {
  const p = (lignes) => calcul.operationDe(lignes).probleme?.code ?? null;
  assert.equal(p(piece().filter((l) => l.nature !== 'fournisseurs')), 'BENEFICIAIRE');
  assert.equal(p(piece([ligne({ id: 9, compte: 50, nature: 'fournisseurs', c: '1.000', tiers: 8 })])), 'BENEFICIAIRE');
  assert.equal(p(piece().filter((l) => l.id !== 4).concat([ligne({ id: 6, compte: 30, nature: 'retenues_operees', c: '190.000', taxe: RSTVA100 })])), 'RETENUE_TVA_SEULE');
  assert.equal(p(piece([ligne({ id: 7, compte: 30, nature: 'retenues_operees', c: '10.000', taxe: { ...RS15, id: 12, code: 'RS_HON10', tej: 'RS2_000001' } })])), 'PLUSIEURS_CODES');
  assert.equal(p(piece().map((l) => (l.id === 4 ? { ...l, code_tej: null } : l))), 'CODE_TEJ');
  const deuxTaux = calcul.operationDe(piece([ligne({ id: 8, compte: 20, nature: 'tva_deductible', d: '7.000', taxe: { ...TVA19, id: 11, taux: '7.000' } })]));
  assert.equal(deuxTaux.plusieursTaux, true);
  assert.equal(deuxTaux.tauxTva, '19.000', 'le taux le plus lourd');
});

test('paiements (un bénéficiaire, une date ; validées sans problème) et seuil des retenues sur achats par paiement', () => {
  const o = (id, tiersId, date, ttc, code = 'RS_MAR15', etat = 'validee', probleme = null) => ({ ecritureId: id, tiersId, dateProposee: date, sourceDate: 'facture', etat, probleme, code, ht: ttc, tva: '0.000', ttc, rs: '1.000', net: ttc, rsTva: null });
  const ps = calcul.paiementsDe([o(1, 7, '2026-09-20', '600.000'), o(2, 7, '2026-09-20', '300.000'), o(3, 7, '2026-09-02', '952.000'), o(4, 8, '2026-09-02', '5000.000', 'RS_HON10'), o(5, 8, '2026-09-03', '1.000', 'RS_MAR15', 'brouillard'), o(6, 8, '2026-09-03', '1.000', 'RS_MAR15', 'validee', { code: 'X' })]);
  assert.deepEqual(ps.map((p) => [p.tiersId, p.date, p.operations.map((x) => x.ecritureId)]), [[7, '2026-09-02', [3]], [8, '2026-09-02', [4]], [7, '2026-09-20', [1, 2]]]);
  assert.equal(ps[2].totaux.ttc, '900.000');
  const famille = paquets.fiscaliteDe('TN').familles.achats;
  assert.equal(calcul.sousLeSeuil(ps[2], famille, '1000.000'), '900.000', 'deux factures payées ensemble : 900 D, sous le seuil');
  assert.equal(calcul.sousLeSeuil(ps[1], famille, '1000.000'), null, 'honoraires : pas de seuil');
  assert.equal(calcul.sousLeSeuil({ operations: [o(9, 1, 'x', '1000.000')] }, famille, '1000.000'), null, '1 000 D : la retenue est due');
});

test('textes pour la plateforme : sans accent ni signe interdit ; taux 999.99 ; dates JJ/MM/AAAA ; millimes entiers', () => {
  assert.equal(certificats.texteTej('Société Tunisienne de Boissons'), 'Societe Tunisienne de Boissons');
  assert.equal(certificats.texteTej('L\'Œuvre ; café & thé * -- /* « Ah »'), 'L OEuvre cafe the - / Ah');
  assert.equal(certificats.texteTej('  12, rue de l\'Orange '), '12, rue de l Orange', 'pas de « \'OR »');
  assert.ok(!/[^\x20-\x7e]/.test(certificats.texteTej('Ibn Khaldoun — المنزه ✓')));
  assert.deepEqual(['1.500', '10.000', '0.500', '19.000', '100.000', null].map(certificats.tauxTej), ['1.50', '10.00', '0.50', '19.00', '100.00', '0.00']);
  assert.equal(certificats.tauxTej('1.005'), '1.01', 'arrondi au centième, demi vers le haut');
  assert.equal(certificats.dateTej('2026-09-05'), '05/09/2026');
  assert.deepEqual(['1190.000', '17.850', '0.001'].map(certificats.millimesEntiers), ['1190000', '17850', '1']);
});

const T = (o = {}) => ({ id: 7, code: 'F0001', nom: 'Société Essai', matricule_fiscal: '7654321B/A/M/000', adresse: '12 rue de Marseille', ville: 'Tunis', telephone: '71 123 456', email: 'compta@essai.tn', regime_fiscal: 'pm_is25', resident: true, id_type: null, id_numero: null, id_naissance: null, id_pays: null, ...o });
test('bénéficiaire exigé par la plateforme : matricule avec sa clé et catégorie, ou CIN (8 chiffres, naissance), passeport (naissance, pays), autre (pays, catégorie) ; nom, adresse, email, téléphone', () => {
  let b = certificats.beneficiaireDe(T(), 'TN');
  assert.deepEqual(b.manque, []);
  assert.deepEqual(b.fige.identifiant, { type: 'mf', typeTej: 1, valeur: '7654321B', matricule: '7654321B/A/M/000', naissance: null, pays: null, categorie: 'PM' });
  assert.equal(b.fige.adresse, '12 rue de Marseille, Tunis');
  assert.deepEqual(certificats.beneficiaireDe(T({ regime_fiscal: null }), 'TN').manque, ['régime fiscal (personne morale ou physique)']);
  assert.deepEqual(certificats.beneficiaireDe(T({ matricule_fiscal: '7654321' }), 'TN').manque, ['matricule fiscal avec sa lettre de clé (1234567A…)']);
  assert.deepEqual(certificats.beneficiaireDe(T({ matricule_fiscal: null }), 'TN').manque, ['matricule fiscal ou, à défaut, CIN, passeport ou carte de séjour']);
  b = certificats.beneficiaireDe(T({ matricule_fiscal: null, regime_fiscal: 'pp_reel', id_type: 'cin', id_numero: '01234567', id_naissance: '1980-05-12' }), 'TN');
  assert.deepEqual(b.manque, []);
  assert.deepEqual([b.fige.identifiant.typeTej, b.fige.identifiant.categorie], [2, 'PP']);
  assert.deepEqual(certificats.beneficiaireDe(T({ matricule_fiscal: null, id_type: 'cin', id_numero: '1234' }), 'TN').manque, ['numéro de CIN (8 chiffres)', 'date de naissance']);
  assert.deepEqual(certificats.beneficiaireDe(T({ matricule_fiscal: null, id_type: 'passeport', id_numero: 'K1', id_naissance: '1980-01-01' }), 'TN').manque, ['pays de l\'identifiant']);
  assert.deepEqual(certificats.beneficiaireDe(T({ matricule_fiscal: null, regime_fiscal: null, id_type: 'autre', id_numero: 'X', id_pays: 'FR' }), 'TN').manque, ['régime fiscal (personne morale ou physique)']);
  assert.deepEqual(certificats.beneficiaireDe(T({ adresse: null, ville: null, email: 'pas-un-email', telephone: '' }), 'TN').manque, ['adresse', 'email', 'téléphone']);
  assert.equal(certificats.beneficiaireDe(T({ resident: false }), 'TN').fige.resident, false);
  const d = certificats.declarantDe({ nom: 'A', raison_sociale: 'Hôtel A', matricule_fiscal: '1234567A/A/M/000', personne: 'physique', adresse: '5 rue', ville: 'Tunis' });
  assert.deepEqual([d.manque, d.fige.identifiant, d.fige.categorie, d.fige.nom], [[], '1234567A', 'PP', 'Hôtel A']);
  assert.deepEqual(certificats.declarantDe({ nom: 'B', matricule_fiscal: '', personne: 'morale' }).manque, ['matricule fiscal du dossier']);
});

const certificat = (o = {}) => ({
  reference: '2026-000001', datePaiement: '2026-09-20', produitLe: '2026-10-09T10:00:00Z', etat: 'produit',
  beneficiaire: certificats.beneficiaireDe(T(), 'TN').fige,
  declarant: certificats.declarantDe({ nom: 'Hôtel Essai', raison_sociale: 'Hôtel Essai', matricule_fiscal: '1234567A/A/M/000', personne: 'morale', adresse: '5 rue des Jasmins', ville: 'Tunis' }).fige,
  operations: [{ reference: 'F-0905', numero: 'AC-2026-000002', dateFacture: '2026-09-05', anneeFacturation: 2026, code: 'RS_MAR15', libelleCode: 'Retenue achats', codeTej: 'RS7_000001', tauxRs: '1.500', tauxTva: '19.000', ht: '1000.000', tva: '190.000', ttc: '1190.000', rs: '17.850', rsTva: null, net: '1172.150' }],
  totaux: { ht: '1000.000', tva: '190.000', ttc: '1190.000', rs: '17.850', taxes: '0.000', net: '1172.150' },
  ...o,
});
test('fichier XML : nom MATRICULE-AAAA-MM-acte.xml, déclarant, référence, certificat (bénéficiaire, opération en millimes, totaux) ; rectificatif avec annulation ; taxe additionnelle', () => {
  const declarant = certificat().declarant;
  const { nom, contenu } = certificats.construireXml({ declarant, annee: 2026, mois: 9, acte: 0, ajouts: [certificat()], annulations: [] });
  assert.equal(nom, '1234567A-2026-09-0.xml');
  const lignes = contenu.split('\n');
  assert.equal(lignes[0], '<?xml version="1.0" encoding="UTF-8"?>');
  assert.equal(lignes[1], '<DeclarationsRS VersionSchema="1.0">');
  assert.equal(lignes[2], '<Declarant><TypeIdentifiant>1</TypeIdentifiant><Identifiant>1234567A</Identifiant><CategorieContribuable>PM</CategorieContribuable></Declarant>');
  assert.equal(lignes[3], '<ReferenceDeclaration><ActeDepot>0</ActeDepot><AnneeDepot>2026</AnneeDepot><MoisDepot>09</MoisDepot></ReferenceDeclaration>');
  assert.equal(lignes[4], '<AjouterCertificats>');
  assert.equal(lignes[5], '<Certificat><Beneficiaire><IdTaxpayer><MatriculeFiscal><TypeIdentifiant>1</TypeIdentifiant><Identifiant>7654321B</Identifiant><CategorieContribuable>PM</CategorieContribuable></MatriculeFiscal></IdTaxpayer><Resident>1</Resident><NometprenonOuRaisonsociale>Societe Essai</NometprenonOuRaisonsociale><Adresse>12 rue de Marseille, Tunis</Adresse><InfosContact><AdresseMail>compta@essai.tn</AdresseMail><NumTel>71 123 456</NumTel></InfosContact></Beneficiaire><DatePayement>20/09/2026</DatePayement><Ref_certif_chez_declarant>2026-000001</Ref_certif_chez_declarant><ListeOperations><Operation IdTypeOperation="RS7_000001"><AnneeFacturation>2026</AnneeFacturation><CNPC>0</CNPC><P_Charge>0</P_Charge><MontantHT>1000000</MontantHT><TauxRS>1.50</TauxRS><TauxTVA>19.00</TauxTVA><MontantTVA>190000</MontantTVA><MontantTTC>1190000</MontantTTC><MontantRS>17850</MontantRS><MontantNetServi>1172150</MontantNetServi></Operation></ListeOperations><TotalPayement><TotalMontantHT>1000000</TotalMontantHT><TotalMontantTVA>190000</TotalMontantTVA><TotalMontantTTC>1190000</TotalMontantTTC><TotalMontantRS>17850</TotalMontantRS><TotalMontantNetServi>1172150</TotalMontantNetServi></TotalPayement></Certificat>');
  assert.equal(lignes[6], '</AjouterCertificats>');
  assert.equal(lignes[7], '</DeclarationsRS>');
  assert.ok(!contenu.includes('<!--'), 'aucun commentaire');
  // Rectificatif : un ajout avec CIN et retenue de TVA (taxe additionnelle), une annulation.
  const cin = certificats.beneficiaireDe(T({ matricule_fiscal: null, regime_fiscal: 'pp_reel', id_type: 'cin', id_numero: '01234567', id_naissance: '1980-05-12' }), 'TN').fige;
  const ops = [{ ...certificat().operations[0], rsTva: { code: 'RSTVA100', taux: '100.000', montant: '190.000' }, net: '982.150' }];
  const r = certificats.construireXml({ declarant, annee: 2026, mois: 9, acte: 1, ajouts: [certificat({ reference: '2026-000004', beneficiaire: cin, operations: ops, totaux: { ...certificat().totaux, taxes: '190.000', net: '982.150' } })], annulations: [certificat({ reference: '2026-000003' })] });
  assert.equal(r.nom, '1234567A-2026-09-1.xml');
  assert.ok(r.contenu.includes('<ActeDepot>1</ActeDepot>'));
  assert.ok(r.contenu.includes('<IdTaxpayer><CIN><TypeIdentifiant>2</TypeIdentifiant><Identifiant>01234567</Identifiant><DateNaissance>12/05/1980</DateNaissance><CategorieContribuable>PP</CategorieContribuable></CIN></IdTaxpayer>'));
  assert.ok(r.contenu.includes('<MontantRS>17850</MontantRS><TaxeAdditionnelle Code="RSTVA100" Taux="100.00">190000</TaxeAdditionnelle><MontantNetServi>982150</MontantNetServi>'));
  assert.ok(r.contenu.includes('<TotalMontantRS>17850</TotalMontantRS><TotalTaxes><TotalTaxeAdditionnelle Code="RSTVA100" Montant="190000"/></TotalTaxes><TotalMontantNetServi>982150</TotalMontantNetServi>'));
  assert.ok(r.contenu.includes('<AnnulerCertificats>\n<Certificat><Ref_certif_chez_declarant>2026-000003</Ref_certif_chez_declarant></Certificat>\n</AnnulerCertificats>'));
  // Passeport et autre identifiant : pays ; autre : catégorie du régime.
  const pass = certificats.beneficiaireDe(T({ matricule_fiscal: null, id_type: 'passeport', id_numero: 'K1234567', id_naissance: '1980-05-12', id_pays: 'FR' }), 'TN').fige;
  const autre = certificats.beneficiaireDe(T({ matricule_fiscal: null, id_type: 'autre', id_numero: 'FR-998877', id_pays: 'FR', resident: false }), 'TN').fige;
  const x = certificats.construireXml({ declarant, annee: 2026, mois: 1, acte: 0, ajouts: [certificat({ beneficiaire: pass }), certificat({ beneficiaire: autre })], annulations: [] }).contenu;
  assert.ok(x.includes('<Passeport><TypeIdentifiant>3</TypeIdentifiant><Identifiant>K1234567</Identifiant><DateNaissance>12/05/1980</DateNaissance><Pays>FR</Pays><CategorieContribuable>PP</CategorieContribuable></Passeport>'));
  assert.ok(x.includes('<AutreIdentifiantFiscal><TypeIdentifiant>5</TypeIdentifiant><Identifiant>FR-998877</Identifiant><Pays>FR</Pays><CategorieContribuable>PM</CategorieContribuable></AutreIdentifiantFiscal></IdTaxpayer><Resident>0</Resident>'));
  assert.ok(x.includes('<MoisDepot>01</MoisDepot>'));
});

test('PDF : un certificat, un lot de plusieurs pages, un certificat annulé', async () => {
  const dossier = { nom: 'Hôtel Essai', ville: '1002 Tunis' };
  for (const liste of [[certificat()], [certificat(), certificat({ reference: '2026-000002' }), certificat({ etat: 'annule', annulation: { le: '2026-10-09T09:00:00Z', motif: 'Date erronée' } })]]) {
    const pdf = await certificats.construireCertificats(liste, { dossier });
    assert.ok(Buffer.isBuffer(pdf) && pdf.slice(0, 5).toString() === '%PDF-');
    assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= liste.length);
  }
  const beaucoup = certificat({ operations: Array.from({ length: 60 }, () => certificat().operations[0]) });
  const pdf = await certificats.construireCertificats([beaucoup], { dossier });
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 2, 'soixante pièces : plusieurs pages');
});

test('demandes : paiements (bénéficiaire, date passée, pièces sans doublon), motif d\'annulation, mois du fichier — refus avant toute requête', () => {
  assert.deepEqual(certificats.lirePaiements({ paiements: [{ tiersId: '7', date: '2026-09-20', ecritures: [5, '6'] }] }, '2026-10-09'), [{ tiersId: 7, date: '2026-09-20', ecritures: [5, 6] }]);
  for (const [corps, code] of [
    [{}, 'PAIEMENTS_REQUIS'], [{ paiements: [] }, 'PAIEMENTS_REQUIS'], [{ paiements: [{ tiersId: 'x', date: '2026-09-20', ecritures: [1] }] }, undefined],
    [{ paiements: [{ tiersId: 7, date: '2026-13-01', ecritures: [1] }] }, 'DATE_PAIEMENT'], [{ paiements: [{ tiersId: 7, date: '2026-10-10', ecritures: [1] }] }, 'DATE_PAIEMENT'],
    [{ paiements: [{ tiersId: 7, date: '2026-09-20', ecritures: [] }] }, undefined], [{ paiements: [{ tiersId: 7, date: '2026-09-20', ecritures: [1] }, { tiersId: 8, date: '2026-09-21', ecritures: [1] }] }, 'PIECE_EN_DOUBLE'],
  ]) assert.throws(() => certificats.lirePaiements(corps, '2026-10-09'), (e) => est400(e) && (code === undefined || e.code === code), JSON.stringify(corps));
  assert.throws(() => certificats.lirePaiements({ paiements: Array.from({ length: 201 }, (_, i) => ({ tiersId: 1, date: '2026-01-01', ecritures: [i + 1] })) }, '2026-10-09'), est400);
  assert.equal(certificats.lireMotif('  Date   erronée '), 'Date erronée');
  assert.throws(() => certificats.lireMotif(''), (e) => est400(e) && e.code === 'MOTIF_REQUIS');
  assert.throws(() => certificats.lireMotif('x'.repeat(256)), est400);
  assert.throws(() => certificats.lireMotif('Erreur 🙏'), est400);
  assert.deepEqual(certificats.lireMois({ annee: '2026', mois: '9' }), { annee: 2026, mois: 9 });
  for (const c of [{}, { annee: 2026, mois: 13 }, { annee: 1999, mois: 1 }, { annee: 2026.5, mois: 1 }]) assert.throws(() => certificats.lireMois(c), (e) => est400(e) && e.code === 'MOIS_INVALIDE');
  assert.deepEqual(certificats.bornesDuMois(2026, 2), { debut: '2026-02-01', fin: '2026-02-28', mm: '02' });
  assert.deepEqual(certificats.bornesDuMois(2028, 2).fin, '2028-02-29');
});

test('tiers : régime fiscal, résidence, identifiant de secours (CIN 8 chiffres, passeport, carte de séjour, autre ; naissance, pays) ; journal et import', () => {
  assert.equal(tiers.lireRegimeFiscal(''), null);
  assert.equal(tiers.lireRegimeFiscal('pm_is20'), 'pm_is20');
  for (const v of ['PM IS 20', 'x', 3]) assert.throws(() => tiers.lireRegimeFiscal(v), est400, String(v));
  assert.deepEqual([undefined, '', 'Oui', 'non', 'NON RÉSIDENT', true, false].map(tiers.lireResident), [true, true, true, false, false, true, false]);
  assert.throws(() => tiers.lireResident('peut-être'), est400);
  const vide = { id_type: null, id_numero: null, id_naissance: null, id_pays: null };
  assert.deepEqual(tiers.lireIdentifiant(null), vide);
  assert.deepEqual(tiers.lireIdentifiant({ type: '' , numero: '123' }), vide);
  assert.deepEqual(tiers.lireIdentifiant({ type: 'cin', numero: '01 234 567', naissance: '12/05/1980' }), { id_type: 'cin', id_numero: '01234567', id_naissance: '1980-05-12', id_pays: null });
  assert.deepEqual(tiers.lireIdentifiant({ type: 'Passeport', numero: 'k1234567', naissance: '1980-05-12', pays: 'fr' }), { id_type: 'passeport', id_numero: 'K1234567', id_naissance: '1980-05-12', id_pays: 'FR' });
  assert.equal(tiers.lireIdentifiant({ type: 'Carte de séjour', numero: 'CS-1' }).id_type, 'carte_sejour');
  assert.equal(tiers.lireIdentifiant({ type: 'Autre identifiant (non-résident)', numero: 'FR-1', pays: 'FR' }).id_type, 'autre');
  for (const v of [{ type: 'cin', numero: '1234567' }, { type: 'cin' }, { type: 'permis', numero: '1' }, { type: 'passeport', numero: 'AB', pays: 'France' }, { type: 'cin', numero: '12345678', naissance: '31/02/1990' }, { type: 'cin', numero: '12345678', naissance: '2999-01-01' }, { type: 'autre', numero: 'é' }, 'cin']) {
    assert.throws(() => tiers.lireIdentifiant(v), est400, JSON.stringify(v));
  }
  const c = tiers.lireChamps({ nom: 'A', identifiant: { type: 'cin', numero: '12345678' }, regimeFiscal: 'pp_reel', resident: 'non' });
  assert.deepEqual([c.valeurs.id_type, c.valeurs.regime_fiscal, c.valeurs.resident], ['cin', 'pp_reel', false]);
  assert.deepEqual(Object.keys(tiers.lireChamps({ nom: 'B' }, true).valeurs), ['nom'], 'modification : seuls les champs envoyés');
  assert.ok(Object.keys(tiers.lireChamps({ identifiant: null }, true).valeurs).join() === 'id_type,id_numero,id_naissance,id_pays', 'l\'identifiant voyage d\'un bloc');
  const t = tiers.presenterTiers({ id: 1, type: 'fournisseur', code: 'F0001', nom: 'x', regime_tva: 'assujetti', delai_paiement: 0, origine: 'saisi', actif: true, compte_id: null, retenue_id: null, regime_fiscal: 'pm_is20', resident: true, id_type: 'cin', id_numero: '01234567', id_naissance: '1980-05-12', id_pays: null }, 'TN');
  assert.deepEqual([t.regimeFiscal, t.regimeFiscalLibelle, t.personne, t.identifiant], ['pm_is20', 'Personne morale à l\'IS de 20 %', 'morale', { type: 'cin', typeLibelle: 'Carte d\'identité nationale', numero: '01234567', naissance: '1980-05-12', pays: null }]);
  const mots = tiers.regimesParMot('TN');
  assert.equal(mots.get('personne morale a l\'is de 20 %'), 'pm_is20');
  assert.equal(mots.get('pp forfait'), 'pp_forfait');
  assert.deepEqual(tiers.FACULTATIFS_IMPORT, ['Régime fiscal', 'Résident', 'Type d\'identifiant', 'Numéro d\'identifiant', 'Date de naissance', 'Pays de l\'identifiant']);
  assert.deepEqual(tiers.COLONNES_EXPORT.slice(-8), [...tiers.FACULTATIFS_IMPORT, 'État', 'Origine']);
  // Une ligne d'import : colonnes facultatives absentes (ancien modèle) ou présentes.
  const ctx = () => ({ type: 'fournisseur', codesPris: new Set(), codesFichier: new Set(), collectifs: new Map([['4011', { id: 3, actif: true }]]), collectifDefaut: { id: 3, actif: true }, retenues: new Map(), matricules: new Map(), regimesFiscaux: mots });
  const ancien = tiers.controlerLigne({ ligne: 5, cellules: ['', 'Nom', '', '', '', '', '', '', '', '', ''] }, ctx());
  assert.deepEqual([ancien.erreurs, ancien.valeurs.regime_fiscal, ancien.valeurs.resident, ancien.valeurs.id_type], [[], null, true, null]);
  const nouveau = tiers.controlerLigne({ ligne: 6, cellules: ['', 'Nom', '', '', '', '', '', '', '', '', '', 'Personne physique au régime forfaitaire', 'Non', 'CIN', '12345678', '01/02/1970', ''] }, ctx());
  assert.deepEqual([nouveau.erreurs, nouveau.valeurs.regime_fiscal, nouveau.valeurs.resident, nouveau.valeurs.id_numero, nouveau.valeurs.id_naissance], [[], 'pp_forfait', false, '12345678', '1970-02-01']);
  const faux = tiers.controlerLigne({ ligne: 7, cellules: ['', 'Nom', '', '', '', '', '', '', '', '', '', 'Régime inventé', 'peut-être', 'CIN', '12', '', ''] }, ctx());
  assert.equal(faux.erreurs.length, 3, faux.erreurs.join(' | '));
  const src = lire('src', 'compta', 'tiers.js');
  assert.ok(src.includes("const CLES_JOURNAL = { matricule_fiscal: 'matricule', regime_tva: 'regimeTva', delai_paiement: 'delaiPaiement', regime_fiscal: 'regimeFiscal', id_type: 'identifiantType'") && src.includes('exigerRegimeFiscal(d, valeurs.regime_fiscal);') && src.includes("if (hasOwn(valeurs, 'regime_fiscal')) exigerRegimeFiscal(d, valeurs.regime_fiscal);"));
});

test('import Excel : colonnes facultatives lues si leur en-tête est à sa place, vides sinon', async () => {
  const classeur = async (enTetes, lignes) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('F');
    ws.addRow(enTetes);
    for (const l of lignes) ws.addRow(l);
    return Buffer.from(await wb.xlsx.writeBuffer());
  };
  const oblig = ['Code', 'Nom'];
  const fac = ['Régime fiscal', 'Résident'];
  let l = await importExcel.lireClasseur(await classeur(oblig, [['F1', 'A']]), { enTetes: oblig, facultatifs: fac });
  assert.deepEqual(l[0].cellules, ['F1', 'A', '', '']);
  l = await importExcel.lireClasseur(await classeur([...oblig, ...fac], [['F1', 'A', 'pm_is25', 'Non']]), { enTetes: oblig, facultatifs: fac });
  assert.deepEqual(l[0].cellules, ['F1', 'A', 'pm_is25', 'Non']);
  l = await importExcel.lireClasseur(await classeur([...oblig, 'Autre chose'], [['F1', 'A', 'x']]), { enTetes: oblig, facultatifs: fac });
  assert.deepEqual(l[0].cellules, ['F1', 'A', '', ''], 'une colonne inconnue n\'est pas lue');
  l = await importExcel.lireClasseur(await classeur(oblig, [['F1', 'A']]), { enTetes: oblig });
  assert.deepEqual(l[0].cellules, ['F1', 'A'], 'sans facultatives : comme avant');
});

test('codes TEJ : retenue (liste du paquet), retenue de TVA (RSTVA25, RSTVA100), aucun autre type ; code du paquet figé', () => {
  assert.equal(taxes.lireCodeTej('', 'retenue', 'TN'), null);
  assert.equal(taxes.lireCodeTej('rs2_000001', 'retenue', 'TN'), 'RS2_000001');
  assert.equal(taxes.lireCodeTej('RSTVA100', 'retenue_tva', 'TN'), 'RSTVA100');
  for (const [v, type] of [['RS99_000001', 'retenue'], ['RS7_000001', 'retenue_tva'], ['RS7_000001', 'tva'], [3, 'retenue']]) assert.throws(() => taxes.lireCodeTej(v, type, 'TN'), est400, `${v} ${type}`);
  const src = lire('src', 'compta', 'taxes.js');
  assert.ok(src.includes("if (t.origine !== 'ajout') throw erreur(409, `Le code TEJ du code ${t.code} (paquet) ne se modifie pas`, 'TAXE_PAQUET');"));
  assert.ok(src.includes("codesTejTva: CODES_TEJ_TVA,") && src.includes('code_tej)\n         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, \'ajout\', $11, $12)'));
});

test('retenue proposée d\'après le régime (saisie) : code « achats » du régime s\'il est actif, marqué ; sinon rien', () => {
  const choix = [{ id: 1, code: 'RS_MAR15', taux: '1.500', actif: true }, { id: 2, code: 'RS_MAR1', taux: '1.000', actif: true }, { id: 3, code: 'RS_MAR05', taux: '0.500', actif: false }];
  assert.deepEqual(ecritures.retenueSelonRegime('TN', 'pm_is20', choix), { id: 2, code: 'RS_MAR1', taux: '1.000', actif: true, selonRegime: true });
  assert.equal(ecritures.retenueSelonRegime('TN', 'pm_is10', choix), null, 'code désactivé : rien');
  assert.equal(ecritures.retenueSelonRegime('TN', null, choix), null);
  const src = lire('src', 'compta', 'ecritures.js');
  assert.ok(src.includes("tiers: tiers.map((t) => (t.retenue || t.type !== 'fournisseur' ? t : { ...t, retenue: retenueSelonRegime(d.pays, t.regimeFiscal, taxes) })),"));
  assert.ok(src.includes("if (!codeId && t.type === 'fournisseur' && t.regime_fiscal) {"), 'l\'aide aussi');
});

test('requêtes : chaque paramètre employé ; retenues opérées (compte à l\'achat, hors contre-passations, pas déjà certifiées) ; TVA codée hors à-nouveaux', () => {
  const tous = {
    ...Object.fromEntries(Object.entries(calcul).filter(([k]) => k.startsWith('SQL_') && k !== 'SQL_EXCLUSIONS_CP')),
    ...Object.fromEntries(Object.entries(taxesMois).filter(([k]) => k.startsWith('SQL_')).map(([k, v]) => [`M_${k}`, v])),
    C_SQL_A_AJOUTER: certificats.SQL_A_AJOUTER, C_SQL_A_ANNULER: certificats.SQL_A_ANNULER, C_SQL_TIERS: certificats.SQL_TIERS,
  };
  for (const [nom, sql] of Object.entries(tous)) {
    const n = Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    for (let i = 1; i <= n; i += 1) assert.ok(sql.includes(`$${i}`), `${nom} : $${i} employé`);
  }
  assert.ok(calcul.SQL_ECRITURES_A_RETENUE.includes("x.type IN ('retenue', 'retenue_tva')") && calcul.SQL_ECRITURES_A_RETENUE.includes('l.compte_id = x.compte_achat_id') && calcul.SQL_ECRITURES_A_RETENUE.includes("e.origine <> 'contrepassation'") && calcul.SQL_ECRITURES_A_RETENUE.includes('cl.ligne_id = l.id AND cl.actif'));
  assert.ok(calcul.SQL_TVA_PAR_PERIODE.includes("j.type <> 'an'") && calcul.SQL_TVA_PAR_PERIODE.includes("x.type IN ('tva', 'retenue_tva')") && calcul.SQL_TVA_PAR_PERIODE.includes("($3::boolean OR e.etat = 'validee')"));
  assert.ok(calcul.SQL_CREDIT_OUVERTURE.includes("j.type = 'an'") && calcul.SQL_TVA_SANS_CODE.includes('l.taxe_id IS NULL'));
  assert.ok(taxesMois.SQL_SUBIES.includes("k.nature = 'retenues_subies'") && taxesMois.SQL_MANQUANTES.includes("xr.type = 'retenue'") && taxesMois.SQL_MANQUANTES.includes("j.type = 'achats'"));
  for (const f of ['taxesCalcul.js', 'certificats.js', 'taxesMois.js']) {
    const code = lire('src', 'compta', f);
    assert.ok(!/parseFloat|toFixed/.test(code), `${f} : jamais de flottant sur un montant`);
    assert.ok(!/gerant_parent_id|requireClient|requireEntreprise/.test(code), `${f} : règles du chantier`);
  }
  assert.ok(!/require\(/.test(lire('src', 'compta', 'taxesCalcul.js')), 'module sans dépendance (fiche du dossier sans cycle)');
  const cert = lire('src', 'compta', 'certificats.js');
  assert.ok(cert.includes("if (!droits(acces).configurer) throw erreur(403, MSG_CERTIFICATS, 'NIVEAU_INSUFFISANT');") && cert.includes("if (d.etat === 'archive')"));
  assert.ok(cert.includes("'certificats_produits'") && cert.includes("'certificat_annule'") && cert.includes("'fichier_tej_produit'"), 'journal D16');
  assert.ok(cert.includes("SELECT COALESCE(MAX(numero), 0)::int + 1 AS n FROM compta.certificats WHERE dossier_id = $1 AND annee = $2"), 'numéro suivant sous le verrou du dossier');
  const mois = lire('src', 'compta', 'taxesMois.js');
  assert.ok(!mois.includes('dansEspaceDuDossier') && (mois.match(/await lectureDossier\(req\.user, req\.params\.dossierId\)/g) || []).length === 3, 'taxes du mois : lecture seule');
  const cd = lire('src', 'compta', 'configDossier.js');
  assert.ok(cd.includes('fiscalite,\n  };') && lire('src', 'compta', 'dossiers.js').includes('fiscalite: configuration.fiscalite,'), 'carte Taxes de la fiche');
});

test('migration 219 : tiers complétés, fichiers TEJ (un dépôt initial par mois), certificats (numéro unique par année), lignes certifiées (une seule active) ; manuel sous gardes md5 (218, 215), fiche 1074', () => {
  const sql = lire('migrations', '219_compta_taxes_certificats.sql');
  assert.ok(!fs.readFileSync(path.join(RACINE, 'migrations', '219_compta_taxes_certificats.sql'), 'utf8').includes('\r'), 'fins de ligne LF');
  for (const c of ['regime_fiscal VARCHAR(20)', 'resident BOOLEAN NOT NULL DEFAULT true', "id_type VARCHAR(12) CHECK (id_type IS NULL OR id_type IN ('cin', 'passeport', 'carte_sejour', 'autre'))", 'id_numero VARCHAR(30)', 'id_naissance DATE', "id_pays CHAR(2) CHECK (id_pays IS NULL OR id_pays ~ '^[A-Z]{2}$')"]) assert.ok(sql.includes(`ALTER TABLE compta.tiers ADD COLUMN IF NOT EXISTS ${c}`), c);
  assert.ok(sql.includes('CHECK ((id_type IS NULL) = (id_numero IS NULL)'));
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS compta.fichiers_tej (') && sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_compta_fichiers_tej_initial ON compta.fichiers_tej (dossier_id, annee, mois) WHERE acte = 0;'));
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS compta.certificats (') && sql.includes('UNIQUE (dossier_id, annee, numero)') && sql.includes('total_rs               NUMERIC(18,3) NOT NULL CHECK (total_rs > 0)') && sql.includes("CHECK ((etat = 'annule') = (annule_le IS NOT NULL))"));
  assert.ok(sql.indexOf('compta.fichiers_tej (') < sql.indexOf('compta.certificats ('), 'les fichiers avant les certificats (clés)');
  assert.ok(sql.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_compta_certificat_lignes_actives ON compta.certificat_lignes (ligne_id) WHERE actif;'));
  assert.ok(!/DROP |DELETE FROM|TRUNCATE|UPDATE compta\./.test(sql), 'additive');
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  const texteDe = (fichier, marque) => {
    const src = lire('migrations', fichier);
    const debut = src.indexOf(marque) + marque.length;
    return src.slice(debut, src.indexOf(marque, debut));
  };
  const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
  for (const [marque, slug, origine, marqueOrigine, attendus] of [
    ['$f219a$', 'compta-tiers', '218_compta_lettrage.sql', '$f218a$', ['**régime fiscal**', '**résident**', 'CIN (8 chiffres)', 'colonnes facultatives', 'la plateforme TEJ exige du fournisseur']],
    ['$f219b$', 'compta-dossier', '218_compta_lettrage.sql', '$f218b$', ['- **Taxes** : les **taxes du mois**', 'fiche « Taxes du mois et certificats »']],
    ['$f219c$', 'compta-taxes', '215_compta_ecritures.sql', '$f215d$', ['son **code TEJ**', 'RSTVA25 ou RSTVA100', 'page **Taxes du mois** signale', 'Un code sans code TEJ ne donne pas de certificat']],
  ]) {
    const avant = texteDe(origine, marqueOrigine);
    assert.ok(sql.includes(`${marque}, '${slug}', '${md5(avant)}')`), `${slug} : garde = md5 du texte de ${origine}`);
    const t = texteDe('219_compta_taxes_certificats.sql', marque);
    for (const a of attendus) assert.ok(t.includes(a), `${slug} : « ${a} »`);
    assert.ok(t.length > avant.length, `${slug} : complété`);
  }
  assert.ok(sql.includes("('compta-taxes-mois', 'Taxes du mois et certificats', '🧾', 1074, $f219d$## 🧾 Taxes du mois et certificats") && sql.includes("'/taxes-mois')"));
  const fiche = texteDe('219_compta_taxes_certificats.sql', '$f219d$');
  for (const a of ['**état de TVA**', '**crédit reporté**', '**TVA à payer**', '**règlement lettré**', '**Produire les certificats**', '**Fichier TEJ (XML)**', '**rectificatif**', '**Annuler**', 'à essayer sur la plateforme', 'seuil de 1 000 D TTC par paiement', 'retenue manquante', 'Complet', 'article 55']) assert.ok(fiche.includes(a), `fiche Taxes du mois : « ${a} »`);
  assert.ok(sql.includes('ON CONFLICT (slug) DO NOTHING'));
});

test('routes : taxes du mois (lecture, export, lot PDF), certificats (produire, PDF, annuler), fichiers TEJ (produire, retélécharger) ; 3 écritures sous la limite de la saisie', () => {
  const src = lire('src', 'compta', 'routes.js');
  for (const r of [
    "router.get('/dossiers/:dossierId/taxes-mois', authenticate, taxesMois.lire);",
    "router.get('/dossiers/:dossierId/taxes-mois/export', authenticate, limiteLivres, taxesMois.exporter);",
    "router.get('/dossiers/:dossierId/taxes-mois/certificats.pdf', authenticate, limiteDocuments, taxesMois.lot);",
    "router.post('/dossiers/:dossierId/certificats', authenticate, limiteEcritures, certificats.produire);",
    "router.get('/dossiers/:dossierId/certificats/:certificatId/pdf', authenticate, limiteDocuments, certificats.pdf);",
    "router.post('/dossiers/:dossierId/certificats/:certificatId/annuler', authenticate, limiteEcritures, certificats.annuler);",
    "router.post('/dossiers/:dossierId/fichiers-tej', authenticate, limiteEcritures, certificats.produireFichier);",
    "router.get('/dossiers/:dossierId/fichiers-tej/:fichierId', authenticate, limiteDocuments, certificats.telechargerFichier);",
  ]) assert.ok(src.includes(r), r);
  assert.ok(src.indexOf('const limiteDocuments') < src.indexOf("taxesMois.lot);"), 'limite des documents déclarée avant');
  assert.ok(!routes.ECRITURES_SANS_GARDE.some((r) => /certificats|fichiers-tej/.test(r)), 'les trois écritures passent par la garde');
});

test('refus avant toute requête : certificat, fichier ou période invalides (404), demandes illisibles (400)', async () => {
  const user = { id: 1 };
  for (const [fn, req, statut] of [
    [certificats.pdf, { user, params: { dossierId: '1', certificatId: 'x' } }, 404],
    [certificats.annuler, { user, params: { dossierId: '1', certificatId: '-1' }, body: { motif: 'x' } }, 404],
    [certificats.annuler, { user, params: { dossierId: '1', certificatId: '3' }, body: {} }, 400],
    [certificats.produire, { user, params: { dossierId: '1' }, body: { paiements: [] } }, 400],
    [certificats.produireFichier, { user, params: { dossierId: '1' }, body: { annee: 2026, mois: 0 } }, 400],
    [certificats.telechargerFichier, { user, params: { dossierId: '1', fichierId: 'abc' } }, 404],
    [taxesMois.lire, { user, params: { dossierId: '1' }, query: { periode: 'x' } }, 404],
    [taxesMois.lot, { user, params: { dossierId: '1' }, query: { periode: '-2' } }, 404],
  ]) {
    const res = reponse();
    await fn(req, res);
    assert.equal(res.statut, statut, `${fn.name} ${JSON.stringify(req.params)} ${JSON.stringify(res.corps)}`);
  }
});
