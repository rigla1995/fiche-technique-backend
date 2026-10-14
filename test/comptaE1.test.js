// LabFlow Compta, étape E1 « Le bilan et l'état de résultat » (labflow-reprise/achats-compta/PLAN-ETATS-FINANCIERS.md §2
// ligne E1, §3, §5 ; réponses du client du 14/10 — « ok pour les 5 »). Tests sans base : le bloc `etats` du paquet tunisien
// (postes, préfixes, couverture de la nomenclature), les règles pures (plus long préfixe, sens du solde, « moins »,
// résultat, postes à zéro omis, colonne N−1, contrôles, mention de l'arrêté), la sélection, les routes, la migration 242
// (manuel), le PDF.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const C = require('../src/compta/etatsCalcul');
const paquets = require('../src/compta/paquets');
const ETATS = paquets.etatsDe('TN');

const r = (id, numero, libelle, nature, solde) => ({ compteId: id, numero, libelle, nature, solde });
// Un exercice d'essai équilibré : capital 10 000, emprunt 5 000 ; véhicule 5 000 amorti 1 000 ; client 1 000, fournisseur
// 400, client créditeur 100, crédit de TVA 300 ; banque 10 000, seconde banque à découvert 200 ; ventes 1 000, achats 400,
// dotation 1 000 → perte de 400.
const N = [
  r(1, '10131', 'Capital non amorti', 'capitaux', '-10000.000'), r(2, '5321', 'Banque', 'banque', '10000.000'), r(3, '4011', 'Fournisseurs', 'fournisseurs', '-400.000'),
  r(4, '4111', 'Clients', 'clients', '1000.000'), r(5, '607', 'Achats de marchandises', 'charges', '400.000'), r(6, '707', 'Ventes de marchandises', 'produits', '-1000.000'),
  r(7, '43667', 'Crédit de TVA', 'etat', '300.000'), r(8, '2241', 'Matériel de transport', 'immobilisations', '5000.000'), r(9, '2824', 'Amortissements du matériel de transport', 'immobilisations', '-1000.000'),
  r(10, '681', 'Dotations aux amortissements', 'charges', '1000.000'), r(11, '1621', 'Emprunts bancaires', 'capitaux', '-5000.000'), r(12, '4191', 'Clients créditeurs', 'clients', '-100.000'),
  r(13, '5322', 'Banque 2', 'banque', '-200.000'),
];
const somme = (rows) => rows.reduce((t, x) => t + C.versMillimes(x.solde), 0n);
const postesDe = (cote) => { const m = new Map(); for (const g of cote.groupes) for (const ru of g.rubriques) for (const po of ru.postes) m.set(po.code, po); return m; };
const lignesDe = (res) => new Map(res.lignes.filter((l) => l.code).map((l) => [l.code, l]));

test('paquet tunisien : bloc etats sans défaut, chaque compte de la nomenclature a un poste ou une ligne, codes attendus', () => {
  assert.ok(ETATS, 'bloc etats du paquet TN');
  assert.deepEqual(paquets.controlerPaquet(paquets.PAQUETS.TN), []);
  const index = C.indexer(ETATS);
  for (const c of paquets.PAQUETS.TN.comptes) {
    const gestion = C.CLASSES_GESTION.includes(c.numero[0]);
    assert.ok(gestion ? C.entreeResultat(index, c.numero) : C.candidats(index.bilan, c.numero).length, `${c.numero} rattaché`);
  }
  const postes = new Set();
  for (const cote of C.COTES) for (const g of ETATS.bilan[cote]) for (const ru of g.rubriques) for (const po of ru.postes) postes.add(po.code);
  for (const code of ['immobilisationsIncorporelles', 'immobilisationsCorporelles', 'immobilisationsFinancieres', 'autresActifsNonCourants', 'stocks', 'clients', 'autresActifsCourants', 'placements', 'liquidites', 'capital', 'reserves', 'autresCapitauxPropres', 'resultatsReportes', 'totalAvantResultat', 'resultatExercice', 'emprunts', 'autresPassifsFinanciers', 'provisions', 'fournisseurs', 'autresPassifsCourants', 'concoursBancaires']) assert.ok(postes.has(code), code);
  assert.deepEqual(ETATS.resultat.filter((l) => l.code).map((l) => l.code), ['revenus', 'autresProduitsExploitation', 'productionImmobilisee', 'totalProduitsExploitation', 'variationStocks', 'achatsMarchandises', 'achatsApprovisionnements', 'chargesPersonnel', 'dotations', 'autresChargesExploitation', 'totalChargesExploitation', 'resultatExploitation', 'chargesFinancieres', 'produitsPlacements', 'autresGains', 'autresPertes', 'resultatOrdinaireAvantImpot', 'impot', 'resultatOrdinaireApresImpot', 'extraordinaires', 'resultatNet']);
  // Un paquet dont un préfixe ne couvre rien, ou dont un compte n'est couvert par rien, est refusé.
  const casse = JSON.parse(JSON.stringify(paquets.PAQUETS.TN));
  casse.etats.resultat.find((l) => l.code === 'revenus').comptes.push('76');
  casse.etats.bilan.actifs[1].rubriques[0].postes.find((p) => p.code === 'stocks').comptes = ['31'];
  const defauts = paquets.controlerPaquet(casse);
  assert.ok(defauts.some((d) => d.includes('préfixe 76 sans compte')), defauts.join(' | '));
  assert.ok(defauts.some((d) => d === 'états : compte 32 sans poste ni ligne'), defauts.join(' | '));
});

test('correspondance : plus long préfixe, sens du solde (actif débiteur, passif créditeur), « moins », classes 6 et 7', () => {
  const index = C.indexer(ETATS);
  const bilan = (numero, solde) => { const e = C.entreeBilan(index, numero, solde); return e ? `${e.cote}:${e.poste}${e.moins ? '/moins' : ''}` : null; };
  assert.equal(bilan('4011', -400n), 'passifs:fournisseurs');
  assert.equal(bilan('4091', 50n), 'actifs:autresActifsCourants', 'fournisseur débiteur : à l\'actif');
  assert.equal(bilan('4111', 1000n), 'actifs:clients');
  assert.equal(bilan('4191', -100n), 'passifs:autresPassifsCourants', 'client créditeur : au passif');
  assert.equal(bilan('5321', 9700n), 'actifs:liquidites');
  assert.equal(bilan('5321', -200n), 'passifs:concoursBancaires', 'banque à découvert');
  assert.equal(bilan('2824', -1000n), 'actifs:immobilisationsCorporelles/moins');
  assert.equal(bilan('2813', -10n), 'actifs:immobilisationsIncorporelles/moins', '281 plus long que 28');
  assert.equal(bilan('2311', 10n), 'actifs:immobilisationsIncorporelles', '231 plus long que 23');
  assert.equal(bilan('2321', 10n), 'actifs:immobilisationsCorporelles');
  assert.equal(bilan('3550', 10n), 'actifs:stocks');
  assert.equal(bilan('39', -10n), 'actifs:stocks/moins');
  assert.equal(bilan('4911', -10n), 'actifs:clients/moins');
  assert.equal(bilan('4951', -10n), 'actifs:autresActifsCourants/moins');
  assert.equal(bilan('131', -600n), 'passifs:resultatsReportes', 'résultat précédent non affecté : résultats reportés');
  assert.equal(bilan('121', 50n), 'passifs:resultatsReportes', 'report à nouveau débiteur : au passif, en moins');
  assert.equal(bilan('109', 100n), 'passifs:capital');
  assert.equal(bilan('1621', -5000n), 'passifs:emprunts');
  assert.equal(bilan('505', -300n), 'passifs:concoursBancaires');
  assert.equal(bilan('19', 300n), null, 'hors nomenclature : sans poste');
  const ligne = (numero) => (C.entreeResultat(index, numero) || {}).ligne || null;
  assert.equal(ligne('707'), 'revenus');
  assert.equal(ligne('709'), 'revenus');
  assert.equal(ligne('607'), 'achatsMarchandises');
  assert.equal(ligne('6037'), 'achatsMarchandises');
  assert.equal(ligne('6031'), 'achatsApprovisionnements');
  assert.equal(ligne('601'), 'achatsApprovisionnements');
  assert.equal(ligne('6241'), 'autresChargesExploitation');
  assert.equal(ligne('636'), 'autresPertes');
  assert.equal(ligne('6654'), 'autresChargesExploitation');
  assert.equal(ligne('681'), 'dotations');
  assert.equal(ligne('686'), 'chargesFinancieres');
  assert.equal(ligne('691'), 'impot');
  assert.equal(ligne('697'), 'extraordinaires');
  assert.equal(ligne('736'), 'autresGains');
  assert.equal(ligne('786'), 'produitsPlacements');
  assert.equal(ligne('76'), null);
});

test('bilan et état de résultat d\'un exercice : montants, « moins », net, totaux égaux, résultat, postes à zéro omis', () => {
  assert.equal(somme(N), 0n, 'jeu équilibré');
  const e = C.calculerEtats(ETATS, { soldesN: N, millesime: 2025 });
  assert.equal(e.pret, true, JSON.stringify(e.controles.filter((c) => !c.ok)));
  const A = postesDe(e.bilan.actifs);
  const P = postesDe(e.bilan.passifs);
  assert.deepEqual([...A.keys()], ['immobilisationsCorporelles', 'clients', 'autresActifsCourants', 'liquidites'], 'postes à zéro omis');
  assert.deepEqual([...P.keys()], ['capital', 'totalAvantResultat', 'resultatExercice', 'emprunts', 'fournisseurs', 'autresPassifsCourants', 'concoursBancaires']);
  const immo = A.get('immobilisationsCorporelles');
  assert.equal(immo.n, '5000.000');
  assert.equal(immo.moins.libelle, 'Moins : amortissements');
  assert.equal(immo.moins.n, '1000.000');
  assert.equal(immo.net.n, '4000.000');
  assert.deepEqual(immo.comptes.map((c) => [c.numero, c.n]), [['2241', '5000.000']]);
  assert.deepEqual(immo.moins.comptes.map((c) => [c.numero, c.n]), [['2824', '1000.000']]);
  assert.equal(A.get('clients').net.n, '1000.000');
  assert.equal(A.get('autresActifsCourants').net.n, '300.000', 'crédit de TVA');
  assert.equal(A.get('liquidites').net.n, '10000.000');
  assert.equal(P.get('capital').n, '10000.000');
  assert.equal(P.get('totalAvantResultat').n, '10000.000');
  assert.equal(P.get('resultatExercice').n, '-400.000', 'perte');
  assert.equal(P.get('emprunts').n, '5000.000');
  assert.equal(P.get('fournisseurs').n, '400.000');
  assert.equal(P.get('autresPassifsCourants').n, '100.000', 'client créditeur');
  assert.equal(P.get('concoursBancaires').n, '200.000', 'banque à découvert');
  assert.equal(e.bilan.actifs.total.n, '15300.000');
  assert.equal(e.bilan.passifs.total.n, '15300.000');
  const groupes = e.bilan.actifs.groupes.map((g) => [g.code, g.total.n, g.rubriques.map((ru) => [ru.code, ru.total ? ru.total.n : null])]);
  assert.deepEqual(groupes, [['actifsNonCourants', '4000.000', [['actifsImmobilises', '4000.000']]], ['actifsCourants', '11300.000', [['actifsCourantsRubrique', null]]]], 'rubrique « autres actifs non courants » vide omise');
  assert.equal(e.bilan.passifs.groupes[0].total.libelle, 'Total des capitaux propres avant affectation');
  assert.equal(e.bilan.passifs.groupes[0].total.n, '9600.000');
  assert.equal(e.bilan.passifs.groupes[1].total.n, '5700.000');
  const L = lignesDe(e.resultat);
  assert.deepEqual([...L.keys()], ['revenus', 'totalProduitsExploitation', 'achatsMarchandises', 'dotations', 'totalChargesExploitation', 'resultatExploitation', 'resultatOrdinaireAvantImpot', 'resultatOrdinaireApresImpot', 'resultatNet'], 'lignes à zéro omises, totaux gardés');
  assert.equal(e.resultat.lignes[0].titre, 'Produits d\'exploitation');
  assert.equal(L.get('revenus').n, '1000.000');
  assert.equal(L.get('achatsMarchandises').n, '-400.000');
  assert.equal(L.get('dotations').n, '-1000.000');
  assert.equal(L.get('totalChargesExploitation').n, '-1400.000');
  assert.equal(L.get('resultatNet').n, '-400.000');
  assert.equal(e.resultat.net.n, '-400.000');
  assert.equal(e.resultats.n, -400000n);
  assert.deepEqual(e.sansPoste, []);
  assert.equal(C.fmtEtat(-400000n), '(400,000)');
  assert.equal(C.fmtEtat(1234500n), '1 234,500');
});

test('colonne N−1 : l\'exercice précédent calculé pareil, comptes fusionnés par poste, totaux des deux exercices', () => {
  const N1 = [r(1, '10131', 'Capital non amorti', 'capitaux', '-10000.000'), r(2, '5321', 'Banque', 'banque', '9400.000'), r(6, '707', 'Ventes', 'produits', '-1500.000'), r(5, '607', 'Achats', 'charges', '900.000'), r(14, '4012', 'Autres fournisseurs', 'fournisseurs', '-200.000'), r(15, '3711', 'Marchandises', 'stocks', '1400.000')];
  assert.equal(somme(N1), 0n);
  const e = C.calculerEtats(ETATS, { soldesN: N, soldesN1: N1, millesime: 2025, millesimePrecedent: 2024 });
  assert.equal(e.pret, true, JSON.stringify(e.controles.filter((c) => !c.ok)));
  const A = postesDe(e.bilan.actifs);
  const P = postesDe(e.bilan.passifs);
  assert.deepEqual([...A.keys()], ['immobilisationsCorporelles', 'stocks', 'clients', 'autresActifsCourants', 'liquidites'], 'stocks : présent en N−1 seulement');
  assert.deepEqual([A.get('stocks').n, A.get('stocks').n1], ['0.000', '1400.000']);
  assert.deepEqual([A.get('liquidites').n, A.get('liquidites').n1], ['10000.000', '9400.000']);
  assert.deepEqual(P.get('fournisseurs').comptes.map((c) => [c.numero, c.n, c.n1]), [['4011', '400.000', '0.000'], ['4012', '0.000', '200.000']]);
  assert.deepEqual([P.get('resultatExercice').n, P.get('resultatExercice').n1], ['-400.000', '600.000']);
  assert.deepEqual([e.bilan.actifs.total.n1, e.bilan.passifs.total.n1], ['10800.000', '10800.000']);
  const L = lignesDe(e.resultat);
  assert.deepEqual([L.get('revenus').n, L.get('revenus').n1], ['1000.000', '1500.000']);
  assert.deepEqual([L.get('resultatNet').n, L.get('resultatNet').n1], ['-400.000', '600.000']);
  assert.equal(e.resultats.n1, 600000n);
});

test('contrôles : compte sans poste (bilan déséquilibré du même montant), résultat ≠ nature, résultat ≠ figé ; au vert sinon', () => {
  const e = C.calculerEtats(ETATS, { soldesN: [...N.filter((x) => x.numero !== '5321'), r(2, '5321', 'Banque', 'banque', '9700.000'), r(14, '19', 'Essai hors nomenclature', 'capitaux', '300.000')], millesime: 2025 });
  assert.equal(e.pret, false);
  const c = Object.fromEntries(e.controles.map((x) => [x.code, x]));
  assert.equal(c.sansPoste.ok, false);
  assert.match(c.sansPoste.detail, /^1 compte à solde sans poste : 19 Essai hors nomenclature \(300,000, 2025\)/);
  assert.equal(c.equilibre.ok, false);
  assert.match(c.equilibre.detail, /actifs 15 000,000, capitaux propres et passifs 15 300,000/);
  assert.equal(c.resultat.ok, true);
  assert.deepEqual(e.sansPoste, [{ id: 14, numero: '19', libelle: 'Essai hors nomenclature', solde: '300.000' }]);
  const f = C.calculerEtats(ETATS, { soldesN: N, resultatFige: -400000n, millesime: 2025 });
  assert.equal(f.pret, true);
  assert.match(f.controles[1].detail, /figé à la clôture/);
  const g = C.calculerEtats(ETATS, { soldesN: N, resultatFige: 600000n, millesime: 2025 });
  assert.equal(g.controles[1].ok, false);
  assert.match(g.controles[1].detail, /état de résultat -400,000, résultat figé à la clôture 600,000/);
  const h = C.calculerEtats(ETATS, { soldesN: [...N.filter((x) => x.numero !== '5321'), r(2, '5321', 'Banque', 'banque', '9950.000'), r(16, '4571', 'Débiteur divers (nature charges par erreur)', 'charges', '50.000')], millesime: 2025 });
  assert.equal(h.controles[1].ok, false, 'un compte de classe 4 en nature charges');
  assert.match(h.controles[1].detail, /état de résultat -400,000, comptes de charges et de produits -450,000/);
  const nul = C.calculerEtats(ETATS, { soldesN: [], millesime: 2026 });
  assert.equal(nul.pret, true);
  assert.deepEqual([nul.bilan.actifs.groupes.length, nul.bilan.passifs.groupes.map((g) => g.code)], [0, ['capitauxPropres']], 'rien : seuls le sous-total et le résultat (à zéro) restent');
  assert.equal(nul.resultat.lignes.filter((l) => l.code && !l.calcul).length, 0);
});

test('mention de l\'arrêté (NC 01 §19) : exercice clos, situation provisoire et ses motifs', () => {
  const x = { etat: 'clos', fin: '2025-12-31' };
  assert.equal(C.mentionArrete(x), 'Exercice clos le 31/12/2025');
  assert.equal(C.mentionArrete(x, { brouillard: true }), 'Situation provisoire au 31/12/2025 (brouillard compris)');
  assert.equal(C.mentionArrete({ etat: 'ouvert', fin: '2026-12-31' }), 'Situation provisoire au 31/12/2026 (exercice non clos)');
  assert.equal(C.mentionArrete({ etat: 'ouvert', fin: '2026-12-31' }, { brouillard: true, precedentOuvert: true }), 'Situation provisoire au 31/12/2026 (exercice non clos, brouillard compris, exercice précédent non clos)');
});

test('sélection : exercice du jour par défaut, identifiant du dossier seulement, brouillard « 1 », aucun exercice 409', () => {
  const etats = require('../src/compta/etats');
  const X = [{ id: 2, debut: '2026-01-01', fin: '2026-12-31', etat: 'ouvert', millesime: 2026 }, { id: 1, debut: '2025-01-01', fin: '2025-12-31', etat: 'clos', millesime: 2025 }];
  assert.deepEqual(etats.lireSelection({}, X), { exercice: X[0], brouillard: false });
  assert.deepEqual(etats.lireSelection({ exercice: '1', brouillard: '1' }, X), { exercice: X[1], brouillard: true });
  assert.equal(etats.lireSelection({ brouillard: '0' }, X).brouillard, false);
  assert.throws(() => etats.lireSelection({ exercice: '9' }, X), /Exercice introuvable/);
  assert.throws(() => etats.lireSelection({ exercice: 'abc' }, X), /Exercice introuvable/);
  assert.throws(() => etats.lireSelection({}, []), /Aucun exercice/);
  assert.equal(etats.SQL_SOLDES.includes("($3::boolean OR e.etat = 'validee') AND ($4::int IS NULL OR e.id <> $4)"), true, 'brouillard sur demande, écriture de résultat exclue');
});

test('routes E1 : la page et le PDF en lecture (tout accès), le PDF sous la limite des documents ; aucune écriture', () => {
  const src = lire('src', 'compta', 'routes.js');
  assert.ok(src.includes("const etats = require('./etats');"));
  assert.ok(src.includes("router.get('/dossiers/:dossierId/etats', authenticate, etats.lire);"));
  assert.ok(src.includes("router.get('/dossiers/:dossierId/etats.pdf', authenticate, limiteDocuments, etats.pdf);"));
  assert.equal((src.match(/etats\.(lire|pdf)\)/g) || []).length, 2, 'deux routes, toutes en GET');
  const ctrl = lire('src', 'compta', 'etats.js');
  assert.ok(!/INSERT|UPDATE|DELETE/.test(ctrl), 'rien n\'est écrit');
  assert.ok(ctrl.includes('reportComptes(db, d, { exercice: x, brouillard })'), 'report provisoire de X1 comme à la balance');
  assert.ok(ctrl.includes("x.etat === 'clos' ? x.ecriture_resultat_id : null"), 'écriture de résultat exclue');
});

test('migration 242 : manuel seul — trois fiches gardées par empreinte (textes de la 241), nouvelle fiche « États financiers », sans balise, en LF', () => {
  const brut = fs.readFileSync(path.join(RACINE, 'migrations', '242_manuel_compta_etats.sql'), 'utf8');
  assert.ok(!brut.includes('\r'), 'LF');
  assert.ok(!/CREATE TABLE|ALTER TABLE|INSERT INTO compta\./.test(brut), 'manuel seul');
  assert.ok(brut.includes("WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'"));
  assert.ok(brut.includes("md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde"));
  for (const slug of ['compta-dossier', 'compta-livres', 'compta-cloture']) assert.ok(brut.includes(`'${slug}', '`), slug);
  assert.ok(brut.includes("('compta-etats', 'États financiers', '📊', 1077, $f242d$## 📊 États financiers"));
  assert.ok(brut.includes("'/etats')"));
  assert.ok(brut.includes('ON CONFLICT (slug) DO NOTHING'));
  assert.ok(!/\[\[[a-z]+:/.test(brut), 'vocabulaire comptable fixe : aucune balise');
  // La garde de chaque fiche retouchée est l'empreinte de son texte de la 241.
  const crypto = require('crypto');
  const m241 = lire('migrations', '241_manuel_compta_cloture.sql');
  for (const [tag, slug] of [['a', 'compta-dossier'], ['c', 'compta-livres'], ['d', 'compta-cloture']]) {
    const texte = m241.split(`$f241${tag}$`)[1];
    const md5 = crypto.createHash('md5').update(texte, 'utf8').digest('hex');
    assert.ok(brut.includes(`'${slug}', '${md5}')`), `${slug} : garde = empreinte du texte de la 241`);
  }
  assert.ok(brut.includes('**États financiers**'), 'fiche du dossier : la ligne Tenue mène aux états financiers');
});

test('PDF : bilan puis état de résultat, mentions de la NC 01 sur chaque page, document complet', async () => {
  const etats = require('../src/compta/etats');
  const e = C.calculerEtats(ETATS, { soldesN: N, millesime: 2025 });
  const etat = {
    exercice: { id: 1, millesime: 2025, etat: 'clos' }, precedent: null,
    entete: { entreprise: 'Hôtel Essai', matricule: '1234567A/A/M/000', forme: 'SARL', arrete: 'Exercice clos le 31/12/2025', provisoire: false, unite: etats.UNITE, colonnes: { n: 'Exercice 2025', n1: 'Premier exercice' } },
    brouillard: { nb: 0, compris: false }, bilan: e.bilan, resultat: e.resultat, controles: e.controles,
  };
  const pdf = await etats.construirePdf({ nom: 'Hôtel Essai' }, etat);
  assert.ok(Buffer.isBuffer(pdf) && pdf.length > 2000);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.subarray(-6).toString().includes('%%EOF'), 'document fini');
  assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 2, 'au moins deux pages (bilan, état de résultat)');
});
