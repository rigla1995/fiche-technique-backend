// LabFlow Compta, étape E2 « Les flux de trésorerie, les notes et le jeu complet » (labflow-reprise/achats-compta/
// PLAN-ETATS-FINANCIERS.md §2 ligne E2 ; réponses 3 et 4 du client du 14/10 : flux en méthode indirecte, notes
// automatiques + texte libre). Tests sans base : les blocs `flux` et `sig` du paquet tunisien (partition exacte des classes
// 1 à 5, couverture des classes 6 et 7), les règles pures des flux (modes, sens, trésorerie, contrôle, comptes sans ligne),
// les soldes intermédiaires de gestion, les notes (corps), la migration 243, la migration 244 (manuel), les routes, le PDF
// complet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const C = require('../src/compta/etatsCalcul');
const F = require('../src/compta/fluxCalcul');
const paquets = require('../src/compta/paquets');
const ETATS = paquets.etatsDe('TN');

// Un mouvement de compte : ouverture (solde signé), débits et crédits de l'exercice.
const m = (id, numero, libelle, ouverture, debit, credit) => ({ compteId: id, numero, libelle, nature: 'general', ouverture, debit, credit });
const soldesDe = (mouvements) => mouvements.map((x) => ({ ...x, solde: C.versMillimes(x.ouverture) + C.versMillimes(x.debit) - C.versMillimes(x.credit) }));
// Exercice d'essai : capital 10 000 (apport), emprunt 5 000, véhicule 5 000, achat 400 à crédit, vente 1 000 à crédit,
// TVA 300 payée, dotation 1 000, résultat précédent 200 affecté en dividendes et payé ; banque 15 000 − 5 500 = 9 500.
const N = [
  m(1, '10131', 'Capital', '0', '0', '10000'), m(2, '1621', 'Emprunt', '0', '0', '5000'), m(3, '224', 'Véhicule', '0', '5000', '0'), m(4, '282', 'Amortissements', '0', '0', '1000'),
  m(5, '4011', 'Fournisseurs', '0', '0', '400'), m(6, '4111', 'Clients', '0', '1000', '0'), m(7, '43667', 'Crédit de TVA', '0', '300', '0'), m(8, '5321', 'Banque', '0', '15000', '5500'),
  m(9, '607', 'Achats', '0', '400', '0'), m(10, '707', 'Ventes', '0', '0', '1000'), m(11, '681', 'Dotation', '0', '1000', '0'),
  m(12, '131', 'Résultat précédent', '-200', '200', '0'), m(13, '447', 'Dividendes à payer', '0', '200', '200'),
];
const lignesDe = (r) => new Map(r.lignes.filter((l) => l.code).map((l) => [l.code, l]));

test('paquet tunisien : flux (trésorerie, lignes, totaux) et soldes intermédiaires sans défaut ; partition exacte des classes 1 à 5, couverture des classes 6 et 7', () => {
  assert.ok(ETATS.flux && ETATS.sig);
  assert.deepEqual(paquets.controlerPaquet(paquets.PAQUETS.TN), []);
  assert.deepEqual(ETATS.flux.tresorerie.comptes, ['53', '54', '55', '506']);
  const entrees = F.indexerFlux(ETATS.flux);
  for (const c of paquets.PAQUETS.TN.comptes) if (!['6', '7'].includes(c.numero[0])) assert.ok(F.partitionValide(C.candidats(entrees, c.numero)), `${c.numero} : partition`);
  const sig = C.indexerLignes(ETATS.sig);
  for (const c of paquets.PAQUETS.TN.comptes) if (['6', '7'].includes(c.numero[0])) assert.ok(C.candidats(sig, c.numero).length, `${c.numero} : ligne SIG`);
  assert.deepEqual(ETATS.flux.lignes.filter((l) => l.code).map((l) => l.code), ['resultatNet', 'amortissementsProvisions', 'stocks', 'creances', 'dettes', 'fluxExploitation', 'acquisitionsImmobilisations', 'cessionsImmobilisations', 'acquisitionsFinancieres', 'cessionsFinancieres', 'fluxInvestissement', 'capitauxPropres', 'dividendes', 'empruntsRecus', 'empruntsRembourses', 'associes', 'fluxFinancement', 'variationTresorerie', 'tresorerieDebut', 'tresorerieFin']);
  assert.deepEqual(ETATS.sig.filter((l) => l.calcul).map((l) => l.code), ['margeCommerciale', 'production', 'margeCoutMatieres', 'valeurAjoutee', 'ebe', 'resultatOrdinaire', 'resultatNet']);
  // Un paquet dont une part manque (dettes sans 41 : les clients créditeurs n'ont plus de ligne crédit) ou dont un compte
  // de gestion n'a plus de ligne SIG est refusé.
  const casse = JSON.parse(JSON.stringify(paquets.PAQUETS.TN));
  casse.etats.flux.lignes.find((l) => l.code === 'dettes').parts[0].comptes = ['40'];
  casse.etats.sig.find((l) => l.code === 'impotsTaxes').comptes = ['661'];
  const defauts = paquets.controlerPaquet(casse);
  assert.ok(defauts.includes('états : flux : compte 41 sans ligne de flux exacte'), defauts.join(' | '));
  assert.ok(defauts.includes('états : soldes intermédiaires : compte 665 sans ligne'), defauts.join(' | '));
});

test('partition : trésorerie seule, variation seule, variation débit + crédit, débits + crédits ; rien d\'autre', () => {
  const e = (mode, sens = null) => ({ prefixe: '4', ligne: 'x', mode, sens });
  assert.equal(F.partitionValide([e('tresorerie')]), true);
  assert.equal(F.partitionValide([e('variation')]), true);
  assert.equal(F.partitionValide([e('variation', 'debit'), e('variation', 'credit')]), true);
  assert.equal(F.partitionValide([e('credits'), e('debits')]), true);
  assert.equal(F.partitionValide([]), false);
  assert.equal(F.partitionValide([e('variation', 'debit')]), false, 'un seul sens');
  assert.equal(F.partitionValide([e('debits')]), false, 'les débits sans les crédits');
  assert.equal(F.partitionValide([e('variation'), e('variation')]), false, 'en double');
  assert.equal(F.partitionValide([e('variation'), e('debits'), e('credits')]), false);
});

test('flux de trésorerie (méthode indirecte) : exploitation, investissement, financement, trésorerie ; somme = variation', () => {
  const r = F.calculerFlux(ETATS.flux, { mouvementsN: N, resultat: { n: -400000n, n1: 0n }, millesime: 2025 });
  const L = lignesDe(r);
  assert.equal(L.get('resultatNet').n, '-400.000');
  assert.equal(L.get('amortissementsProvisions').n, '1000.000', 'dotation : non décaissée');
  assert.equal(L.get('creances').n, '-1300.000', 'client 1 000 et crédit de TVA 300 non encaissés');
  assert.equal(L.get('dettes').n, '400.000', 'fournisseur non payé');
  assert.equal(L.has('stocks'), false, 'ligne à zéro omise');
  assert.equal(L.get('fluxExploitation').n, '-300.000');
  assert.equal(L.get('acquisitionsImmobilisations').n, '-5000.000');
  assert.equal(L.get('fluxInvestissement').n, '-5000.000');
  assert.equal(L.get('capitauxPropres').n, '10000.000', 'apport ; l\'affectation du résultat précédent en dividendes est neutre');
  assert.equal(L.get('dividendes').n, '-200.000', 'dividende payé');
  assert.equal(L.get('empruntsRecus').n, '5000.000');
  assert.equal(L.has('empruntsRembourses'), false);
  assert.equal(L.get('fluxFinancement').n, '14800.000');
  assert.equal(L.get('variationTresorerie').n, '9500.000');
  assert.deepEqual([L.get('tresorerieDebut').n, L.get('tresorerieFin').n], ['0.000', '9500.000']);
  assert.deepEqual(r.tresorerie.variation, { n: '9500.000', n1: '0.000' });
  assert.equal(r.controle.ok, true, r.controle.detail);
  assert.match(r.controle.detail, /Somme des flux = variation de trésorerie \(9 500,000 : de 0,000 à 9 500,000\)/);
  assert.deepEqual(L.get('creances').comptes.map((c) => [c.numero, c.n]), [['4111', '-1000.000'], ['43667', '-300.000']]);
  assert.equal(r.lignes[0].titre, 'Flux de trésorerie liés à l\'exploitation');
  assert.deepEqual(r.sansPoste, []);
});

test('flux : cession à la valeur d\'origine, remboursement d\'emprunt, découvert, sens du solde de fin, report provisoire à l\'ouverture, colonne N−1', () => {
  // N−1 (= N ci-dessus) puis N : vente du véhicule 5 000 (amortissements 1 000 repris, prix 3 500, moins-value 500 au 636),
  // machine achetée comptant 900, emprunt remboursé 2 000, client encaissé 1 000, fournisseur payé 400, frais 12 000 ;
  // banque : 9 500 + (3 500 + 1 000) − (900 + 2 000 + 400 + 12 000) = −1 300 (découvert).
  const N2 = [
    m(1, '10131', 'Capital', '-10000', '0', '0'), m(2, '1621', 'Emprunt', '-5000', '2000', '0'), m(3, '224', 'Véhicule', '5000', '0', '5000'), m(4, '282', 'Amortissements', '-1000', '1000', '0'),
    m(5, '4011', 'Fournisseurs', '-400', '400', '0'), m(6, '4111', 'Clients', '1000', '0', '1000'), m(7, '43667', 'Crédit de TVA', '300', '0', '0'),
    m(8, '5321', 'Banque', '9500', '4500', '15300'), m(14, '636', 'Moins-value', '0', '500', '0'), m(15, '6271', 'Frais bancaires', '0', '12000', '0'), m(16, '131', 'Résultat précédent', '-400', '0', '0'),
    m(17, '2234', 'Machine', '0', '900', '0'),
  ];
  assert.equal(N2.reduce((s, x) => s + C.versMillimes(x.credit) - C.versMillimes(x.debit), 0n), 0n, 'mouvements équilibrés');
  const resultatN2 = -(500000n + 12000000n); // moins-value 500 + frais 12 000
  const r = F.calculerFlux(ETATS.flux, { mouvementsN: N2, mouvementsN1: N, resultat: { n: resultatN2, n1: -400000n }, millesime: 2026, millesimePrecedent: 2025 });
  const L = lignesDe(r);
  assert.equal(L.get('resultatNet').n, '-12500.000');
  assert.equal(L.get('amortissementsProvisions').n, '-1000.000', 'amortissements repris à la cession');
  assert.equal(L.get('creances').n, '1000.000', 'client encaissé ; le crédit de TVA inchangé');
  assert.equal(L.get('dettes').n, '-400.000');
  assert.equal(L.get('fluxExploitation').n, '-12900.000');
  assert.equal(L.get('acquisitionsImmobilisations').n, '-900.000');
  assert.equal(L.get('cessionsImmobilisations').n, '5000.000', 'à la valeur d\'origine (la moins-value est dans le résultat)');
  assert.equal(L.get('fluxInvestissement').n, '4100.000');
  assert.equal(L.get('empruntsRembourses').n, '-2000.000');
  assert.equal(L.get('fluxFinancement').n, '-2000.000');
  assert.equal(L.get('variationTresorerie').n, '-10800.000');
  assert.deepEqual([L.get('tresorerieDebut').n, L.get('tresorerieFin').n], ['9500.000', '-1300.000'], 'découvert : trésorerie négative');
  assert.equal(r.controle.ok, true, r.controle.detail);
  // La colonne N−1 : l'exercice d'essai précédent.
  assert.deepEqual([L.get('capitauxPropres').n, L.get('capitauxPropres').n1], ['0.000', '10000.000']);
  assert.deepEqual([L.get('tresorerieFin').n1, L.get('variationTresorerie').n1], ['9500.000', '9500.000']);
  // Sens du solde de fin : un fournisseur devenu débiteur (avance) va en créances pour toute sa variation.
  const r2 = F.calculerFlux(ETATS.flux, { mouvementsN: [m(5, '4011', 'Fournisseurs', '-400', '700', '0'), m(8, '5321', 'Banque', '9500', '0', '700')], resultat: { n: 0n, n1: 0n }, millesime: 2026 });
  const L2 = lignesDe(r2);
  assert.equal(L2.get('creances').n, '-700.000');
  assert.equal(L2.has('dettes'), false);
  assert.equal(r2.controle.ok, true);
  // Ouverture par report provisoire seul (pas de mouvement) : la trésorerie de début le porte.
  const r3 = F.calculerFlux(ETATS.flux, { mouvementsN: [m(8, '5321', 'Banque', '2500', '0', '0'), m(1, '10131', 'Capital', '-2500', '0', '0')], resultat: { n: 0n, n1: 0n }, millesime: 2026 });
  assert.deepEqual(lignesDe(r3).get('tresorerieDebut').n, '2500.000');
  assert.equal(r3.lignes.filter((l) => l.code && !l.calcul).length, 0);
});

test('flux : un compte hors nomenclature ou une écriture déséquilibrée casse le contrôle, avec le détail', () => {
  const r = F.calculerFlux(ETATS.flux, { mouvementsN: [...N, m(18, '19', 'Essai', '0', '300', '0')], resultat: { n: -400000n, n1: 0n }, millesime: 2025 });
  assert.equal(r.controle.ok, false);
  assert.match(r.controle.detail, /19 Essai sans ligne de flux \(2025\)/);
  assert.deepEqual(r.sansPoste, [{ id: 18, numero: '19', libelle: 'Essai', variation: '-300.000' }]);
  const r2 = F.calculerFlux(ETATS.flux, { mouvementsN: [m(8, '5321', 'Banque', '0', '100', '0')], resultat: { n: 0n, n1: 0n }, millesime: 2025 });
  assert.equal(r2.controle.ok, false);
  assert.match(r2.controle.detail, /exercice 2025 : somme des flux 0,000, trésorerie de 0,000 à 100,000/);
});

test('soldes intermédiaires de gestion (annexe 8) : marge commerciale, valeur ajoutée, excédent brut, résultat des activités ordinaires, résultat net', () => {
  const e = C.calculerEtats(ETATS, { soldesN: soldesDe(N), millesime: 2025 });
  assert.ok(e.sig);
  const L = lignesDe(e.sig);
  assert.deepEqual([...L.keys()], ['ventesMarchandises', 'coutAchatMarchandises', 'margeCommerciale', 'production', 'margeCoutMatieres', 'valeurAjoutee', 'ebe', 'autresChargesOrdinaires', 'resultatOrdinaire', 'resultatNet']);
  assert.equal(L.get('margeCommerciale').n, '600.000');
  assert.equal(L.get('valeurAjoutee').n, '600.000');
  assert.equal(L.get('ebe').n, '600.000');
  assert.equal(L.get('autresChargesOrdinaires').n, '-1000.000');
  assert.equal(L.get('resultatOrdinaire').n, '-400.000');
  assert.equal(L.get('resultatNet').n, e.resultat.net.n, 'même résultat net que l\'état de résultat');
  assert.equal(e.sig.lignes[0].titre, 'Activité de négoce');
  // Une entreprise de production : production vendue, achats consommés, marge sur coût matières.
  const prod = C.calculerEtats(ETATS, { soldesN: soldesDe([m(1, '705', 'Prestations', '0', '0', '2000'), m(2, '601', 'Matières', '0', '500', '0'), m(3, '613', 'Loyer', '0', '300', '0'), m(4, '640', 'Salaires', '0', '700', '0'), m(5, '5321', 'Banque', '0', '2000', '1500')]), millesime: 2025 });
  const P = lignesDe(prod.sig);
  assert.deepEqual([P.get('productionVendue').n, P.get('production').n, P.get('achatsConsommes').n, P.get('margeCoutMatieres').n, P.get('autresChargesExternes').n, P.get('valeurAjoutee').n, P.get('chargesPersonnel').n, P.get('ebe').n, P.get('resultatNet').n], ['2000.000', '2000.000', '-500.000', '1500.000', '-300.000', '1200.000', '-700.000', '500.000', '500.000']);
  assert.equal(C.calculerEtats({ ...ETATS, sig: undefined }, { soldesN: [], millesime: 2025 }).sig, null, 'sans bloc sig : pas de soldes intermédiaires');
});

test('notes : le corps { texte } — texte, 20 000 caractères au plus, retours normalisés, vide permis', () => {
  const etats = require('../src/compta/etats');
  assert.equal(etats.NOTES_MAX, 20000);
  assert.equal(etats.lireNotes({ texte: '  Méthodes\r\ncomptables \n' }), 'Méthodes\ncomptables');
  assert.equal(etats.lireNotes({}), '');
  assert.equal(etats.lireNotes({ texte: null }), '');
  assert.throws(() => etats.lireNotes(null), /Requête invalide/);
  assert.throws(() => etats.lireNotes({ texte: 12 }), /un texte est attendu/);
  assert.throws(() => etats.lireNotes({ texte: 'x'.repeat(20001) }), /20000 caractères au plus/);
});

test('migration 243 : la table des notes par exercice (texte borné, qui, quand, une par exercice), rejouable', () => {
  const sql = lire('migrations', '243_compta_notes_exercice.sql');
  assert.ok(!sql.includes('\r'));
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS compta.notes_exercice ('));
  assert.ok(sql.includes('exercice_id INTEGER NOT NULL REFERENCES compta.exercices(id) ON DELETE CASCADE'));
  assert.ok(sql.includes("texte       TEXT NOT NULL DEFAULT '' CHECK (char_length(texte) <= 20000)"));
  assert.ok(sql.includes('modifie_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL'));
  assert.ok(sql.includes('UNIQUE (exercice_id)'));
  assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS idx_compta_notes_exercice_dossier'));
  assert.ok(!/^(DROP|DELETE|UPDATE)/m.test(sql), 'rien n\'est modifié ailleurs');
});

test('migration 244 : manuel seul — fiche « États financiers » gardée par l\'empreinte de la 242, flux et notes décrits, mots-clés, sans balise, en LF', () => {
  const brut = fs.readFileSync(path.join(RACINE, 'migrations', '244_manuel_compta_etats_flux.sql'), 'utf8');
  assert.ok(!brut.includes('\r'), 'LF');
  assert.ok(!/CREATE TABLE|ALTER TABLE|INSERT INTO compta\./.test(brut), 'manuel seul');
  assert.ok(brut.includes("WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'"));
  assert.ok(brut.includes("md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde"));
  assert.ok(brut.includes('mots_cles = f.mots'));
  const crypto = require('crypto');
  const m242 = lire('migrations', '242_manuel_compta_etats.sql');
  const texte242 = m242.split('$f242d$')[1];
  const md5 = crypto.createHash('md5').update(texte242, 'utf8').digest('hex');
  assert.ok(brut.includes(`'compta-etats', '${md5}'`), 'garde = empreinte du texte de la 242');
  for (const attendu in { '**L\'état des flux de trésorerie**': 1, '**Les notes**': 1, 'soldes intermédiaires de gestion': 1, '**Jeu complet (PDF)**': 1, '**Rédiger les notes**': 1 }) assert.ok(brut.includes(attendu), attendu);
  assert.ok(!/\[\[[a-z]+:/.test(brut), 'vocabulaire comptable fixe : aucune balise');
});

test('routes E2 : les notes en PUT (droit « configurer », transaction du dossier, limite de la saisie) ; le PDF complet', () => {
  const src = lire('src', 'compta', 'routes.js');
  assert.ok(src.includes("router.put('/dossiers/:dossierId/etats/:exerciceId/notes', authenticate, limiteEcritures, etats.notes);"));
  const ctrl = lire('src', 'compta', 'etats.js');
  assert.ok(ctrl.includes('const ecritureEtats = (req, travail) => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {\n  if (!droits(acces).configurer) throw erreur(403, MSG_NOTES, \'NIVEAU_INSUFFISANT\');'));
  assert.ok(ctrl.includes('ON CONFLICT (exercice_id) DO UPDATE SET texte = EXCLUDED.texte'));
  assert.ok(ctrl.includes("journaliser(db, acces.espace_id, req.user.id, 'notes_exercice',"));
  assert.ok(ctrl.includes("const complet = req.query.complet === '1' || req.query.complet === 'true';"));
  assert.ok(ctrl.includes('F.calculerFlux(etats.flux, { mouvementsN: n.mouvements, mouvementsN1: n1 ? n1.mouvements : null, resultat: calc.resultats'), 'les flux sur les mouvements, le résultat de l\'état de résultat');
});

test('PDF complet : bilan, état de résultat, flux, notes (SIG, détail des postes, texte libre) — au moins quatre pages', async () => {
  const etats = require('../src/compta/etats');
  const soldes = soldesDe(N);
  const e = C.calculerEtats(ETATS, { soldesN: soldes, millesime: 2025 });
  const flux = F.calculerFlux(ETATS.flux, { mouvementsN: N, resultat: e.resultats, millesime: 2025 });
  const etat = {
    exercice: { id: 1, millesime: 2025, etat: 'clos' }, precedent: null,
    entete: { entreprise: 'Hôtel Essai', matricule: '1234567A/A/M/000', forme: 'SARL', arrete: 'Exercice clos le 31/12/2025', provisoire: false, unite: etats.UNITE, colonnes: { n: 'Exercice 2025', n1: 'Premier exercice' } },
    brouillard: { nb: 0, compris: false }, bilan: e.bilan, resultat: e.resultat, sig: e.sig, flux: { lignes: flux.lignes, tresorerie: flux.tresorerie },
    notes: { texte: 'Méthodes comptables : coût historique.\n\nFaits marquants : achat d\'un véhicule.', modifiePar: 'Ali Essai', modifieLe: '2026-10-15T10:00:00.000Z', longueurMax: 20000 },
    controles: [...e.controles, flux.controle],
  };
  const court = await etats.construirePdf({ nom: 'Hôtel Essai' }, etat);
  const complet = await etats.construirePdf({ nom: 'Hôtel Essai' }, etat, { complet: true });
  const pages = (pdf) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  assert.equal(complet.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pages(court) >= 2 && pages(complet) >= 4, `${pages(court)} / ${pages(complet)} pages`);
  assert.ok(complet.length > court.length);
  const sansNotes = await etats.construirePdf({ nom: 'Hôtel Essai' }, { ...etat, notes: { texte: '', modifiePar: null, modifieLe: null, longueurMax: 20000 } }, { complet: true });
  assert.ok(pages(sansNotes) >= 4);
});
