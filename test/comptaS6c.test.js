// LabFlow Compta, étape S6c « Les livres et les imports » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6c, §2
// « S6c », §4 « Livres » et « Imports » ; réponse 7 du 08/10). Tests sans base : la sélection des livres (exercice,
// période, brouillard), les soldes en millimes (côtés débit / crédit, totaux), la forme des requêtes (à-nouveaux hors
// mouvements, fenêtre du cumul), les lecteurs des imports (dates, montants, référentiels, groupes d'écritures, rapport
// rangée par rangée), la borne des lignes d'une écriture (200 à la saisie, autant que le fichier pour les à-nouveaux), la
// migration 217 (manuel seul : gardes md5 des textes de la 216, fiche « Grand livre et balance »), les routes (2 imports
// sous la limite de la saisie, 7 lectures des livres dont 3 exports sous leur limite, modèles avant /:ecritureId), les
// refus avant toute requête.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const livres = require('../src/compta/livres');
const imports = require('../src/compta/importEcritures');
const ecritures = require('../src/compta/ecritures');
const est400 = (e) => e.statusCode === 400;
const est404 = (e) => e.statusCode === 404;
const EXERCICES = [
  { id: 2, debut: '2027-01-01', fin: '2027-12-31', etat: 'ouvert', periodes: [{ id: 21, debut: '2027-01-01', fin: '2027-01-31', etat: 'ouverte' }, { id: 22, debut: '2027-02-01', fin: '2027-02-28', etat: 'ouverte' }] },
  { id: 1, debut: '2026-01-01', fin: '2026-12-31', etat: 'clos', periodes: [{ id: 11, debut: '2026-01-01', fin: '2026-01-31', etat: 'close' }] },
];

test('sélection des livres : exercice ouvert par défaut, période de l\'exercice ou exercice entier, brouillard compris sauf « 0 » ; inconnus refusés sans requête', () => {
  const s = livres.lireSelection({}, EXERCICES);
  assert.deepEqual([s.exercice.id, s.periode, s.de, s.a, s.brouillard], [2, null, '2027-01-01', '2027-12-31', true]);
  const p = livres.lireSelection({ exercice: '1', periode: '11', brouillard: '0' }, EXERCICES);
  assert.deepEqual([p.exercice.id, p.periode.id, p.de, p.a, p.brouillard], [1, 11, '2026-01-01', '2026-01-31', false]);
  assert.equal(livres.lireSelection({ periode: '22' }, EXERCICES).a, '2027-02-28');
  assert.throws(() => livres.lireSelection({ exercice: '9' }, EXERCICES), est404, 'exercice d\'un autre dossier');
  assert.throws(() => livres.lireSelection({ periode: '11' }, EXERCICES), est404, 'période d\'un autre exercice');
  assert.throws(() => livres.lireSelection({ periode: 'x' }, EXERCICES), est404);
  assert.throws(() => livres.lireSelection({}, []), (e) => e.statusCode === 409 && e.code === 'EXERCICE_ABSENT');
  assert.equal(livres.exerciceParDefaut([EXERCICES[1]]).id, 1, 'sans exercice ouvert : le plus récent');
  assert.deepEqual(livres.presenterSelection(p).periode, { id: 11, debut: '2026-01-01', fin: '2026-01-31', etat: 'close' });
  assert.equal(livres.libelleSelection(s), 'exercice du 01/01/2027 au 31/12/2027');
  assert.equal(livres.libelleSelection(p), 'du 01/01/2026 au 31/01/2026');
  assert.deepEqual(livres.lirePage({}, 100), { page: 1, limite: 100 });
  assert.deepEqual(livres.lirePage({ page: '3', limite: '50' }, 100), { page: 3, limite: 50 });
  for (const q of [{ page: '0' }, { page: 'a' }, { limite: '201' }, { limite: '0' }]) assert.throws(() => livres.lirePage(q, 100), est400, JSON.stringify(q));
  assert.equal(livres.lireTypeBalance(undefined), 'generale');
  assert.equal(livres.lireTypeBalance('clients'), 'clients');
  assert.throws(() => livres.lireTypeBalance('tiers'), est400);
  assert.deepEqual(livres.TYPES_BALANCE, ['generale', 'fournisseurs', 'clients']);
});

test('soldes en millimes : côtés débit / crédit d\'un solde signé, rangée de balance (ouverture + mouvements), totaux par colonne ; jamais de flottant', () => {
  assert.deepEqual(livres.cotes(1500n), { solde: '1.500', soldeDebit: '1.500', soldeCredit: '0.000' });
  assert.deepEqual(livres.cotes(-1500n), { solde: '-1.500', soldeDebit: '0.000', soldeCredit: '1.500' });
  assert.deepEqual(livres.cotes(0n), { solde: '0.000', soldeDebit: '0.000', soldeCredit: '0.000' });
  const r = livres.rangeeBalance({ ouverture_debit: '0.000', ouverture_credit: '1173.150', debit: '1173.150', credit: '2142.000', nb_lignes: 2, nb_brouillard: 1, nb_brouillard_mouvements: 1 });
  assert.deepEqual(r.ouverture, { debit: '0.000', credit: '1173.150', solde: '-1173.150', soldeDebit: '0.000', soldeCredit: '1173.150' });
  assert.deepEqual(r.mouvements, { debit: '1173.150', credit: '2142.000', nbLignes: 2, nbBrouillard: 1 });
  assert.deepEqual([r.solde, r.soldeDebit, r.soldeCredit, r.nbBrouillard], ['-2142.000', '0.000', '2142.000', 1]);
  const r2 = livres.rangeeBalance({ ouverture_debit: '500.000', ouverture_credit: '0.000', debit: '1000.000', credit: '250.250', nb_lignes: 3, nb_brouillard: 2, nb_brouillard_mouvements: 0 });
  const t = livres.totauxBalance([r, r2]);
  assert.deepEqual(t.ouverture, { debit: '500.000', credit: '1173.150', soldeDebit: '500.000', soldeCredit: '1173.150' });
  assert.deepEqual(t.mouvements, { debit: '2173.150', credit: '2392.250', nbLignes: 5, nbBrouillard: 1 }, 'brouillard des seuls mouvements');
  assert.deepEqual([t.soldeDebit, t.soldeCredit, t.nbBrouillard], ['1249.750', '2142.000', 3], 'chaque solde compte de son côté ; brouillard de toutes les lignes comprises');
  assert.deepEqual(t.lignes, { debit: '2673.150', credit: '3565.400' }, 'total des lignes comprises (à-nouveaux et mouvements)');
  const code = lire('src', 'compta', 'livres.js');
  assert.ok(!/parseFloat/.test(code), 'jamais parseFloat');
  const usages = [...code.matchAll(/Number\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(usages.length > 0 && usages.every((u) => /^query\./.test(u) || u === 'texte'), `Number(…) sur des identifiants de l'adresse ou dans nombreExcel seulement : ${usages.join(', ')}`);
  assert.ok(code.includes("const nombreExcel = (texte) => (texte == null || texte === '' ? null : Number(texte));"));
  assert.equal(livres.FMT_MONTANT, '#,##0.000');
});

test('requêtes des livres : à-nouveaux (journal « an ») dans l\'ouverture et jamais dans les mouvements, brouillard retirable, fenêtre du cumul avant la page, contrôles NC 01', () => {
  for (const sql of [livres.SQL_BALANCE, livres.SQL_BALANCE_AUX, livres.SQL_COLLECTIFS, livres.SQL_GL_SOMMES]) {
    assert.ok(sql.includes("FILTER (WHERE j.type = 'an' OR l.date < $3)") && sql.includes("FILTER (WHERE j.type <> 'an' AND l.date >= $3)"), 'ouverture = à-nouveaux + avant ; mouvements = hors à-nouveaux dans la sélection');
    assert.ok(sql.includes("($5::boolean OR e.etat = 'validee')") && sql.includes('e.exercice_id = $2') && sql.includes('l.date <= $4'), 'brouillard compris ou validées seulement ; l\'exercice ; jusqu\'à la fin de la sélection');
    assert.ok(sql.includes("COUNT(*) FILTER (WHERE e.etat = 'brouillard')::int AS nb_brouillard") && sql.includes("AND j.type <> 'an' AND l.date >= $3)::int AS nb_brouillard_mouvements"), 'le brouillard distingué (toutes les lignes ; les seuls mouvements)');
  }
  assert.ok(livres.SQL_BALANCE.includes('GROUP BY k.id') && livres.SQL_BALANCE.includes('ORDER BY k.numero'));
  assert.ok(livres.SQL_BALANCE_AUX.includes('t.type = $6') && livres.SQL_BALANCE_AUX.includes('GROUP BY t.id') && livres.SQL_COLLECTIFS.includes('k.nature = $6'));
  assert.ok(livres.SQL_GRAND_LIVRE.includes("j.type <> 'an' AND l.date >= $3") && livres.SQL_GRAND_LIVRE.includes('WINDOW w AS (ORDER BY l.date, e.numero NULLS LAST, e.numero_provisoire, l.rang ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)') && livres.SQL_GRAND_LIVRE.includes('LIMIT $8 OFFSET $9'), 'cumul calculé sur toute la sélection (même ordre que le livre-journal), puis la page');
  assert.ok(livres.SQL_GRAND_LIVRE.includes('($6::int IS NULL OR l.compte_id = $6) AND ($7::int IS NULL OR l.tiers_id = $7)'), 'un compte et / ou un tiers');
  assert.ok(livres.SQL_JOURNAL.includes('ORDER BY e.date, e.numero NULLS LAST, e.numero_provisoire') && livres.SQL_JOURNAL.includes('e.journal_id = $6'));
  assert.ok(livres.SQL_JOURNAUX.includes('COUNT(DISTINCT e.id)::int AS nb_ecritures') && livres.SQL_JOURNAUX.includes('GROUP BY j.id') && livres.SQL_JOURNAUX.includes("l.date <= $3 AND ($4::boolean OR e.etat = 'validee')"), 'centralisation des journaux sur la sélection (ses quatre paramètres)');
  // Toute requête emploie chacun de ses paramètres (sinon PostgreSQL refuse : « could not determine data type »).
  for (const [nom, sql] of Object.entries(livres).filter(([k]) => k.startsWith('SQL_'))) {
    const n = Math.max(...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    for (let i = 1; i <= n; i += 1) assert.ok(sql.includes(`$${i}`), `${nom} : $${i} employé`);
  }
  const code = lire('src', 'compta', 'livres.js');
  assert.ok(code.includes('coherent: journaux.debit === journaux.credit && journaux.debit === totaux.lignes.debit && totaux.lignes.debit === totaux.lignes.credit && millimesDe(ecritures.total) === jd'), 'total des journaux = total du grand livre = total des écritures (NC 01 §37, §40)');
  assert.ok(code.includes('await lectureDossier(req.user, req.params.dossierId)') && !code.includes('dansEspaceDuDossier'), 'lecture seule : rien n\'est écrit');
  assert.ok(!/gerant_parent_id|requireClient|requireEntreprise/.test(code), 'règles du chantier');
  assert.deepEqual([livres.LIMITE_GRAND_LIVRE, livres.LIMITE_JOURNAL, livres.EXPORT_MAX, livres.EXPORTS_SIMULTANES], [100, 50, 10000, 2], 'exports bornés (relecture : mémoire) et deux à la fois');
  assert.ok(code.includes('const avecGardeExport = async (res, journal, travail) => {') && code.includes('if (exportsEnCours >= EXPORTS_SIMULTANES) return res.status(429)') && code.includes('if (!res.headersSent) repondreErreur(res, err, journal);') && (code.match(/avecGardeExport\(res, '\[compta\.livres\.exporter/g) || []).length === 3, 'les trois exports sous la garde de concurrence');
  assert.ok(code.includes('nombreExcel(r.ouverture.soldeDebit), nombreExcel(r.ouverture.soldeCredit)') && code.includes('nombreExcel(b.totaux.ouverture.soldeDebit), nombreExcel(b.totaux.ouverture.soldeCredit)'), 'export de la balance : soldes d\'ouverture, comme l\'écran (relecture)');
  assert.ok(code.includes('ouverture: { ...r.ouverture, nbBrouillard: r.nbBrouillard - r.mouvements.nbBrouillard }') && code.includes('nbBrouillard: r.mouvements.nbBrouillard, solde: r.solde'), 'grand livre : brouillard de l\'ouverture et des mouvements distingués (relecture)');
  assert.equal(livres.nomFichier('balance', { nom: 'Hôtel Les Jasmins' }, { exercice: { debut: '2026-01-01' }, periode: { debut: '2026-03-01' } }), 'balance-Hotel-Les-Jasmins-2026-03.xlsx');
  assert.equal(livres.nomFichier('grand-livre-4011', { nom: 'Société « X »' }, { exercice: { debut: '2026-07-01' }, periode: null }), 'grand-livre-4011-Societe-X-2026.xlsx');
});

test('grand livre : compte ou tiers exigé (400 sans requête), identifiants invalides (404 sans requête)', async () => {
  await assert.rejects(() => livres.lireCible(null, 1, {}), (e) => est400(e) && e.code === 'CIBLE_REQUISE');
  await assert.rejects(() => livres.lireCible(null, 1, { compte: 'x' }), est404);
  await assert.rejects(() => livres.lireCible(null, 1, { tiers: '-1' }), est404);
  await assert.rejects(() => livres.journalDuDossier(null, 1, ''), (e) => est400(e) && e.code === 'JOURNAL_REQUIS');
  await assert.rejects(() => livres.journalDuDossier(null, 1, 'abc'), est404);
});

test('imports : dates (JJ/MM/AAAA ou ISO), montants (virgule, un côté), référentiels (compte par numéro, tiers par code et type, code de taxe), rangée d\'un message', () => {
  assert.equal(imports.lireDateCellule('05/03/2026', 'Date'), '2026-03-05');
  assert.equal(imports.lireDateCellule('5/3/2026', 'Date'), '2026-03-05');
  assert.equal(imports.lireDateCellule('2026-03-05', 'Date'), '2026-03-05');
  assert.equal(imports.lireDateCellule('', 'Date'), null);
  for (const d of ['31/02/2026', '2026-13-01', '05.03.2026', 'mars']) assert.throws(() => imports.lireDateCellule(d, 'Date'), est400, d);
  assert.equal(imports.lireMontantCellule('1 190,5', 'Débit'), '1190.500');
  assert.equal(imports.lireMontantCellule('', 'Débit'), '0.000');
  assert.throws(() => imports.lireMontantCellule('abc', 'Débit'), (e) => est400(e) && /Débit/.test(e.message));
  const refs = {
    comptes: new Map([['607', { id: 1, numero: '607', nature: 'charges' }], ['4011', { id: 2, numero: '4011', nature: 'fournisseurs' }], ['4111', { id: 3, numero: '4111', nature: 'clients' }]]),
    tiers: new Map([['F0001', [{ id: 10, type: 'fournisseur', code: 'F0001' }]], ['X1', [{ id: 11, type: 'fournisseur', code: 'X1' }, { id: 12, type: 'client', code: 'X1' }]]]),
    taxes: new Map([['TVA19', { id: 20, code: 'TVA19' }]]),
    journaux: new Map([['AC', { id: 30, code: 'AC', type: 'achats' }]]),
  };
  assert.deepEqual(imports.resoudreRangee(refs, { compte: '607', tiers: '', taxe: 'tva19' }), { compteId: 1, tiersId: null, taxeId: 20, erreurs: [] });
  assert.deepEqual(imports.resoudreRangee(refs, { compte: '4011', tiers: 'f0001', taxe: '' }), { compteId: 2, tiersId: 10, taxeId: null, erreurs: [] });
  assert.equal(imports.resoudreRangee(refs, { compte: '4111', tiers: 'X1', taxe: '' }).tiersId, 12, 'un code porté par deux types : celui de la nature du compte');
  assert.equal(imports.resoudreRangee(refs, { compte: '4011', tiers: 'X1', taxe: '' }).tiersId, 11);
  const r = imports.resoudreRangee(refs, { compte: '999', tiers: 'Z', taxe: 'TVA7' });
  assert.deepEqual(r.erreurs, ['Compte : 999 n\'est pas dans le plan de comptes du dossier', 'Tiers : Z n\'est pas un tiers du dossier (page Tiers)', 'Code de taxe : TVA7 n\'est pas un code du dossier (page Taxes)']);
  assert.deepEqual(imports.resoudreRangee(refs, { compte: '', tiers: '', taxe: '' }).erreurs, ['Compte : indiquez le numéro du compte']);
  const rangs = [{ ligne: 8 }, { ligne: 9 }, { ligne: 10 }];
  assert.equal(imports.rangeeDuMessage('Ligne 2, débit : montant en dinars', rangs).ligne, 9);
  assert.equal(imports.rangeeDuMessage('Ligne 3 : choisissez le compte', rangs).ligne, 10);
  assert.equal(imports.rangeeDuMessage('Écriture déséquilibrée : …', rangs).ligne, 8, 'un refus de l\'ensemble : la première rangée');
  assert.equal(imports.rangeeDuMessage('Ligne 7 : …', rangs).ligne, 8, 'rang inconnu : la première rangée');
  assert.deepEqual(imports.rapport([{ ligne: 9, repere: 'b', erreurs: ['x'] }, { ligne: 8, repere: 'a', erreurs: ['y'] }, { ligne: 9, repere: 'b', erreurs: ['x', 'z'] }]), [{ ligne: 8, repere: 'a', erreurs: ['y'] }, { ligne: 9, repere: 'b', erreurs: ['x', 'z'] }], 'une entrée par rangée, triée, messages réunis sans doublon');
  assert.deepEqual(imports.EN_TETES_ECRITURES, ['Écriture', 'Journal', 'Date', 'Pièce', 'Libellé', 'Compte', 'Tiers', 'Libellé de la ligne', 'Débit', 'Crédit', 'Code de taxe', 'Échéance']);
  assert.deepEqual(imports.EN_TETES_BALANCE, ['Compte', 'Tiers', 'Libellé', 'Débit', 'Crédit']);
  assert.ok(/^Exemple : /.test(imports.EXEMPLE_ECRITURES[0]) && /^Exemple : /.test(imports.EXEMPLE_BALANCE[0]), 'la rangée d\'exemple est reconnue et sautée');
  assert.equal(imports.MSG_IMPORTER, 'Seul le titulaire ou un gérant de niveau Complet peut importer des écritures');
});

test('imports : les rangées groupées par écriture (même repère qui se suit, repère vide = la même), corps d\'une écriture et rapport rangée par rangée', () => {
  const refs = {
    comptes: new Map([['607', { id: 1, numero: '607', nature: 'charges' }], ['43666', { id: 4, numero: '43666', nature: 'tva_deductible' }], ['4011', { id: 2, numero: '4011', nature: 'fournisseurs' }]]),
    tiers: new Map([['F0001', [{ id: 10, type: 'fournisseur', code: 'F0001' }]]]),
    taxes: new Map([['TVA19', { id: 20, code: 'TVA19' }]]),
    journaux: new Map([['AC', { id: 30, code: 'AC', type: 'achats' }]]),
  };
  const rangee = (ligne, c) => ({ ligne, cellules: c });
  const lignes = [
    rangee(8, ['1', 'AC', '05/03/2026', 'F-1', 'Facture STB', '607', '', 'Boissons', '1000', '', 'TVA19', '']),
    rangee(9, ['', '', '', '', '', '43666', '', '', '190', '', 'TVA19', '']),
    rangee(10, ['1', '', '', '', '', '4011', 'F0001', '', '', '1190', '', '30/04/2026']),
    rangee(11, ['2', 'AC', '2026-03-06', 'F-2', 'Déséquilibrée', '607', '', '', '100', '', '', '']),
    rangee(12, ['2', '', '', '', '', '4011', 'F0001', '', '', '90', '', '']),
    rangee(13, ['3', 'VT', '06/03/2026', 'F-3', 'Journal inconnu, compte inconnu', '999', '', '', '10', '', '', '']),
    rangee(14, ['3', 'AC', '', 'F-X', '', '607', '', '', '', 'abc', '', '']),
    rangee(15, ['1', 'AC', '07/03/2026', 'F-4', 'Repère repris', '607', '', '', '5', '', '', '']),
    rangee(16, ['', '', '', '', '', '4011', 'F0001', '', '', '5', '', '']),
  ];
  const groupes = imports.grouper(lignes);
  assert.deepEqual(groupes.map((g) => [g.repere, g.premiere, g.rangs.length, g.erreurs.length]), [['1', 8, 3, 0], ['2', 11, 2, 0], ['3', 13, 2, 0], ['1', 15, 2, 1]]);
  assert.match(groupes[3].erreurs[0], /repère « 1 » est déjà employé/);
  const [g1, g2, g3, g4] = groupes.map((g) => imports.corpsDuGroupe(g, refs));
  assert.equal(g1.fausses.length, 0);
  assert.deepEqual([g1.ecriture.journalId, g1.ecriture.date, g1.ecriture.reference, g1.ecriture.libelle, g1.ecriture.total, g1.ecriture.lignes.length, g1.repere], [30, '2026-03-05', 'F-1', 'Facture STB', 1190000n, 3, '1 — F-1']);
  assert.deepEqual(g1.ecriture.lignes[2], { rang: 3, compteId: 2, tiersId: 10, libelle: null, debit: 0n, credit: 1190000n, taxeId: null, echeance: '2026-04-30' });
  assert.equal(g1.ecriture.lignes[0].libelle, 'Boissons');
  assert.equal(g2.ecriture, null);
  assert.deepEqual(g2.fausses.map((f) => [f.ligne, f.repere]), [[11, '2 — F-2']]);
  assert.match(g2.fausses[0].erreurs[0], /^Écriture déséquilibrée : débits 100,000 ≠ crédits 90,000/);
  assert.deepEqual(imports.rapport(g3.fausses).map((f) => [f.ligne, f.erreurs]), [
    [13, ['Journal : VT n\'est pas un journal du dossier (page Journaux)', 'Compte : 999 n\'est pas dans le plan de comptes du dossier']],
    [14, ['Journal : AC diffère de la première rangée de l\'écriture (VT)', 'Pièce : F-X diffère de la première rangée de l\'écriture (F-3)', 'Crédit : montant en dinars, 3 décimales au plus (ex. 1 190,500)', 'Indiquez le débit ou le crédit']],
  ]);
  // Relecture : dates comparées une fois lues (cellule date Excel en ISO, texte en JJ/MM/AAAA) ; pièce et libellé exigés ;
  // échéance jugée par rangée ; clé de doublon (journal, date, pièce).
  const [g6] = imports.grouper([rangee(30, ['9', 'AC', '05/03/2026', '', '', '607', '', '', '10', '', '', '']), rangee(31, ['9', '', '2026-03-05', '', '', '4011', 'F0001', '', '', '10', '', '01/03/2026'])]).map((g) => imports.corpsDuGroupe(g, refs));
  assert.deepEqual(imports.rapport(g6.fausses).map((f) => [f.ligne, f.erreurs]), [[30, ['Pièce : indiquez la référence de la pièce justificative', 'Libellé : indiquez le libellé de l\'écriture']], [31, ['L\'échéance (01/03/2026) précède la date de l\'écriture (05/03/2026)']]], 'la date ISO de la rangée 31 est la même que le 05/03/2026 ; pièce, libellé et échéance rapportés d\'un coup');
  assert.equal(g1.cle, `30\u00002026-03-05\u0000F-1`, 'clé de doublon : journal, date ISO, pièce');
  assert.equal(g6.cle, null);
  assert.deepEqual(g1.reperes, ['1 — F-1 · rangée 1', '1 — F-1 · rangée 2', '1 — F-1 · rangée 3']);
  assert.equal(imports.sansPrefixe('Ligne 3 : indiquez le fournisseur (le compte 4011 est un compte collectif)'), 'Indiquez le fournisseur (le compte 4011 est un compte collectif)');
  assert.equal(imports.sansPrefixe('Ligne 2, débit : montant en dinars'), 'Débit : montant en dinars');
  assert.equal(imports.sansPrefixe('Écriture déséquilibrée : x'), 'Écriture déséquilibrée : x');
  assert.equal(imports.controlerCote({ debit: '1.000', credit: '2.000' }), 'Un débit ou un crédit, pas les deux');
  assert.equal(imports.controlerCote({ debit: '0.000', credit: '0.000' }), 'Indiquez le débit ou le crédit');
  assert.equal(imports.controlerCote({ debit: '0.000', credit: '2.000' }), null);
  assert.equal(g4.ecriture, null, 'un repère repris : écriture refusée');
  assert.match(g4.fausses[0].erreurs[0], /déjà employé plus haut/);
  // Sans repère sur la première rangée : repère = la rangée ; une rangée sans journal ni date est fausse.
  const [g5] = imports.grouper([rangee(20, ['', '', '', 'F-5', 'L', '607', '', '', '1', '', '', '']), rangee(21, ['', '', '', '', '', '4011', 'F0001', '', '', '1', '', ''])]).map((g) => imports.corpsDuGroupe(g, refs));
  assert.equal(g5.repere, 'rangée 20 — F-5');
  assert.deepEqual(imports.rapport(g5.fausses)[0].erreurs, ['Journal : indiquez le code du journal (AC, VT, BQ…)', 'Date : indiquez la date de l\'écriture']);
});

test('bornes des lignes : 200 à la saisie (lireLignes, lireEcriture), autant que le fichier (2 000) pour l\'écriture d\'à-nouveaux', () => {
  assert.throws(() => ecritures.lireLignes(Array.from({ length: 201 }, () => ({ compteId: 1, debit: '1' }))), (e) => est400(e) && /200 lignes/.test(e.message));
  assert.equal(ecritures.lireLignes(Array.from({ length: 201 }, () => ({ compteId: 1, debit: '1' })), 2000).length, 201);
  const base = { journalId: 1, date: '2026-01-01', reference: 'AN-2026', libelle: 'À-nouveaux' };
  const lignes = [...Array.from({ length: 499 }, (_, i) => ({ compteId: i + 2, debit: '1' })), { compteId: 1, credit: '499' }];
  assert.throws(() => ecritures.lireEcriture({ ...base, lignes }), (e) => est400(e) && /200 lignes/.test(e.message));
  assert.equal(ecritures.lireEcriture({ ...base, lignes }, { lignesMax: imports.LIGNES_MAX_BALANCE }).lignes.length, 500);
  assert.equal(imports.LIGNES_MAX_BALANCE, 2000);
  const code = lire('src', 'compta', 'importEcritures.js');
  assert.ok(code.includes('lireEcriture(corps, { lignesMax: LIGNES_MAX_BALANCE })') && code.includes("ecriture = lireEcriture(corps);"), 'écritures importées : 200 lignes ; à-nouveaux : le fichier');
  assert.ok(code.includes("ORDER BY e.date, e.numero NULLS LAST, e.numero_provisoire") === false, 'rien du livre-journal ici');
  assert.ok(code.includes("if (deja.n > 0) throw erreur(409,") && code.includes("'AN_EXISTANT'"), 'un exercice qui a déjà des à-nouveaux refuse l\'import');
  assert.ok(code.includes("throw erreurImport(fausses, lignes.length)") && code.includes('await ecritureImport(req, async (db, acces, d) => {'), 'tout ou rien dans la transaction du dossier');
  assert.ok(code.includes('await controlerLignes(db, d, g.ecriture.lignes)') && code.includes('await controlerLignes(db, d, saines)'), 'toutes les rangées fausses rapportées d\'un coup (contrôle sans lever)');
  assert.ok(code.includes('exigerDateAN(journal, periode.exercice, g.ecriture.date);') && code.includes("IN (SELECT * FROM unnest($2::int[], $3::date[], $4::text[]))") && code.includes('Écriture en double dans le fichier'), 'relecture : à-nouveaux au premier jour, doublons dans le fichier et dans le dossier');
  assert.ok(code.includes('déjà présent à la rangée') && code.includes("rouvrez-la (page Périodes) avant d'importer la balance d'ouverture"), 'relecture : doublon de la balance, période close dite autrement');
  const saisie = lire('src', 'compta', 'ecritures.js');
  assert.equal((saisie.match(/exigerDateAN\(journal, exercice, e\.date\);/g) || []).length, 2, 'à-nouveaux au premier jour : création et modification');
  assert.ok(lire('src', 'compta', 'validation.js').includes('exigerDateAN(journal, exercice, date);'), '… et contre-passation');
  assert.throws(() => ecritures.exigerDateAN({ type: 'an', code: 'AN' }, { debut: '2026-01-01' }, '2026-03-05'), (e) => e.statusCode === 409 && e.code === 'AN_DATE');
  assert.doesNotThrow(() => ecritures.exigerDateAN({ type: 'an', code: 'AN' }, { debut: '2026-01-01' }, '2026-01-01'));
  assert.doesNotThrow(() => ecritures.exigerDateAN({ type: 'achats', code: 'AC' }, { debut: '2026-01-01' }, '2026-03-05'));
  assert.equal(typeof ecritures.controlerLignes, 'function');
  assert.ok(code.includes("'ecritures_importees'") && code.includes("'balance_importee'") && code.includes("'ecriture_creee'"), 'journal D16');
  assert.ok(code.includes("'import', $10) RETURNING id") && !code.includes("'saisie'"), 'origine « import »');
  assert.ok(!/parseFloat|Number\(.*(debit|credit|montant|taux)/.test(code), 'jamais de flottant sur un montant');
});

test('migration 217 : manuel seul (gardes md5 des textes de la 216, fiche « Grand livre et balance » /livres, imports dans la fiche « Écritures », livres dans la fiche du dossier)', () => {
  const sql = lire('migrations', '217_compta_livres_imports.sql');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  assert.ok(!/ALTER TABLE|CREATE TABLE|CREATE INDEX|DROP |DELETE FROM|TRUNCATE|UPDATE compta\./.test(sql), 'manuel seul : aucune table ne change (mesure du 08/10 : aucune table de soldes)');
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.match(sql, /SET contenu = CASE WHEN contenu = contenu_defaut THEN f\.texte ELSE contenu END/, 'une fiche retouchée garde sa retouche');
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  const texteDe = (fichier, marque) => {
    const src = lire('migrations', fichier);
    const debut = src.indexOf(marque) + marque.length;
    return src.slice(debut, src.indexOf(marque, debut));
  };
  const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
  for (const [marque, slug, marqueOrigine, attendus, disparus] of [
    ['$f217a$', 'compta-ecritures', '$f216a$', ['9. **Importer (Excel)**', '10. **Importer une balance d\'ouverture**', 'journal **AN**', 'contre-passent et **importent**', 'page **Livres** (fiche « Grand livre et balance »)', '2 000 rangées au plus par fichier', 'rien n\'est importé'], []],
    ['$f217b$', 'compta-dossier', '$f216b$', ['ses **livres** — grand livre, balance, journaux', 'pages **Écritures**, **Périodes** et **Livres**'], ['arrivent à l\'étape des livres']],
  ]) {
    const garde = md5(texteDe('216_compta_validation_periodes.sql', marqueOrigine));
    assert.ok(sql.includes(`${marque}, '${slug}', '${garde}')`), `${slug} : garde = md5 du texte de la 216`);
    const t = texteDe('217_compta_livres_imports.sql', marque);
    for (const a of attendus) assert.ok(t.includes(a), `${slug} : « ${a} »`);
    for (const d of disparus) assert.ok(!t.includes(d), `${slug} : « ${d} » disparu`);
    assert.ok(!/étape (suivante|des livres)\b/.test(t), `${slug} : plus de renvoi à une étape à venir`);
  }
  assert.ok(sql.includes("('compta-livres', 'Grand livre et balance', '📚', 1072, $f217c$## 📚 Grand livre et balance") && sql.includes("'/livres')"), 'nouvelle fiche, écran /livres');
  assert.ok(sql.includes('10 000 lignes au plus par export') && !sql.includes('50 000 lignes au plus'), 'borne des exports (relecture)');
  const fiche = texteDe('217_compta_livres_imports.sql', '$f217c$');
  for (const a of ['**Brouillard compris**', '**solde d\'ouverture**', '**solde après la ligne**', 'NC 01 §37, §40', 'NC 01 §35, §36', '**Exporter (Excel)**', '10 000 lignes au plus par export', 'pages de 100', 'pages de 50', 'actions 9 et 10']) assert.ok(fiche.includes(a), `fiche Livres : « ${a} »`);
  assert.ok(sql.includes('ON CONFLICT (slug) DO NOTHING'), 'idempotente');
});

test('routes S6c : 2 imports (tout ou rien, droit « configurer », sous la limite de la saisie, après téléversement), modèles avant /:ecritureId, 7 lectures des livres dont 3 exports sous leur limite', () => {
  const src = lire('src', 'compta', 'routes.js');
  const lignes = src.split('\n');
  const idx = (motif) => lignes.findIndex((l) => l.includes(motif));
  assert.ok(idx("router.get('/dossiers/:dossierId/ecritures/modele-import', authenticate, importEcritures.modeleEcritures);") > 0);
  assert.ok(idx("router.get('/dossiers/:dossierId/ecritures/modele-balance-ouverture', authenticate, importEcritures.modeleBalance);") > 0);
  assert.ok(idx("router.post('/dossiers/:dossierId/ecritures/import', authenticate, limiteImports, televersement, importEcritures.importerEcritures);") > 0);
  assert.ok(idx("router.post('/dossiers/:dossierId/ecritures/import-balance-ouverture', authenticate, limiteImports, televersement, importEcritures.importerBalance);") > 0);
  assert.ok(src.includes("keyGenerator: (req) => `imports:${req.user.id}`") && src.includes('max: 30,'), 'imports : 30 par quart d\'heure et par personne (relecture)');
  assert.ok(idx("/ecritures/modele-balance-ouverture'") < idx("router.get('/dossiers/:dossierId/ecritures/:ecritureId'"), 'adresses fixes avant /:ecritureId');
  for (const r of [
    "router.get('/dossiers/:dossierId/livres', authenticate, livres.lire);",
    "router.get('/dossiers/:dossierId/livres/balance', authenticate, livres.balance);",
    "router.get('/dossiers/:dossierId/livres/balance/export', authenticate, limiteLivres, livres.exporterBalance);",
    "router.get('/dossiers/:dossierId/livres/grand-livre', authenticate, livres.grandLivre);",
    "router.get('/dossiers/:dossierId/livres/grand-livre/export', authenticate, limiteLivres, livres.exporterGrandLivre);",
    "router.get('/dossiers/:dossierId/livres/journal', authenticate, livres.journal);",
    "router.get('/dossiers/:dossierId/livres/journal/export', authenticate, limiteLivres, livres.exporterJournal);",
  ]) assert.ok(src.includes(r), r);
  assert.ok(src.includes("keyGenerator: (req) => `livres:${req.user.id}`") && src.includes('max: 60,'), 'exports : 60 par quart d\'heure et par personne');
  assert.equal(lignes.filter((l) => /^router\.(post|put|patch|delete)\(/.test(l)).length, 53, '53 routes d\'écriture (51 + 2 imports)');
  const code = lire('src', 'compta', 'importEcritures.js');
  assert.ok(code.includes("if (!droits(acces).configurer) throw erreur(403, MSG_IMPORTER, 'NIVEAU_INSUFFISANT');") && code.includes("if (d.etat === 'archive') throw erreur(409,"), 'droit configurer, dossier non archivé');
  assert.ok(code.includes('const ecritureImport = (req, travail) => dansEspaceDuDossier(req.user, req.params.dossierId,'), 'transaction verrouillée du dossier');
  assert.ok(code.includes('await exigerImport(req);') && code.includes('await lectureDossier(req.user, req.params.dossierId);'), 'accès, droit et état jugés avant d\'analyser le classeur');
});

test('ecritures.js : les outils de S6c exportés (lignes contrôlées contre le dossier, résumé D16) ; la liste de S6a inchangée', () => {
  for (const f of ['resoudreLignes', 'controlerDateReelle', 'resumeEcriture', 'motifRecherche', 'journalDe', 'periodeDe', 'insererLignes', 'uneEcriture', 'exerciceOuvert', 'presenterEcriture', 'SQL_ECRITURES', 'SQL_LIGNES']) assert.equal(typeof ecritures[f], f === f.toUpperCase() ? 'string' : 'function', f);
  assert.deepEqual([ecritures.LIMITE_MAX, ecritures.PAGE_MAX, ecritures.LIGNES_MAX], [200, 100000, 200]);
});
