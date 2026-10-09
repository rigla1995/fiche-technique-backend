// LabFlow Compta, étape S7a « Lettrage, échéancier, relevés » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne S7a, §2
// « S7a », §4 « Lettrage », « Échéance », « Relevé et relance », « Droits » ; réponses du client du 09/10 — « ok pour les
// 9 »). Tests sans base : les lettres AAA → ZZZ, la lecture d'une demande de lettrage, le contrôle d'une lettre (un compte,
// écart nul), les propositions (même pièce, puis même montant, la plus ancienne avec la plus ancienne), les règles de
// l'échéance et des tranches, la lecture des paramètres et du texte de la relance, les sommes signées de la balance âgée,
// les deux PDF (relevé, relance), la forme des requêtes (chaque paramètre employé), la migration 218 (schéma, gardes md5 des
// textes de la 215 et de la 217, fiche 1073), les routes, la contre-passation qui délettre, les refus avant toute requête.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const lettrage = require('../src/compta/lettrage');
const echeancier = require('../src/compta/echeancier');
const echeances = require('../src/compta/echeances');
const livres = require('../src/compta/livres');
const routes = require('../src/compta/routes');
const est400 = (e) => e.statusCode === 400;
const reponse = () => {
  const res = { statut: 200, corps: null };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  return res;
};

test('lettres : AAA → ZZZ par tiers, la suivante après la plus haute, puis les premières libres, 409 quand tout est pris', () => {
  assert.deepEqual([0, 1, 25, 26, 675, 676, 17575].map(lettrage.lettreDe), ['AAA', 'AAB', 'AAZ', 'ABA', 'AZZ', 'BAA', 'ZZZ']);
  for (const n of [0, 1, 25, 26, 676, 9999, 17575]) assert.equal(lettrage.rangDeLettre(lettrage.lettreDe(n)), n);
  assert.equal(lettrage.LETTRES_NB, 17576);
  assert.deepEqual(lettrage.lettresSuivantes([], 2), ['AAA', 'AAB']);
  assert.deepEqual(lettrage.lettresSuivantes(['AAA', 'AAC'], 1), ['AAD'], 'après la plus haute (un trou ne se comble pas tant qu\'il reste des lettres au-delà)');
  assert.deepEqual(lettrage.lettresSuivantes(['ZZZ', 'AAA'], 2), ['AAB', 'AAC'], 'au-delà de ZZZ : les premières libres');
  const toutes = Array.from({ length: 17576 }, (_, i) => lettrage.lettreDe(i));
  assert.throws(() => lettrage.lettresSuivantes(toutes, 1), (e) => e.statusCode === 409 && e.code === 'LETTRES_EPUISEES');
  assert.deepEqual(lettrage.lettresSuivantes(toutes.filter((l) => l !== 'MMM'), 1), ['MMM']);
});

test('demande de lettrage : tiers, lignes ou groupes (au moins deux lignes, sans doublon), refus avant toute requête', () => {
  assert.deepEqual(lettrage.lireLettrage({ tiersId: 7, lignes: [3, '4'] }), { tiersId: 7, groupes: [[3, 4]] });
  assert.deepEqual(lettrage.lireLettrage({ tiersId: '7', groupes: [[1, 2], [5, 6, 9]] }), { tiersId: 7, groupes: [[1, 2], [5, 6, 9]] });
  for (const [corps, code] of [
    [null, undefined], [{ lignes: [1, 2] }, 'TIERS_REQUIS'], [{ tiersId: 'x', lignes: [1, 2] }, 'TIERS_REQUIS'], [{ tiersId: 1 }, 'LIGNES_REQUISES'],
    [{ tiersId: 1, lignes: [1] }, 'LIGNES_MIN'], [{ tiersId: 1, lignes: [1, 1] }, 'LIGNE_EN_DOUBLE'], [{ tiersId: 1, groupes: [[1, 2], [2, 3]] }, 'LIGNE_EN_DOUBLE'],
    [{ tiersId: 1, lignes: [1, 'a'] }, undefined], [{ tiersId: 1, lignes: [1, -2] }, undefined], [{ tiersId: 1, groupes: [] }, 'LIGNES_REQUISES'], [{ tiersId: 1, groupes: [5] }, 'LIGNES_REQUISES'],
  ]) assert.throws(() => lettrage.lireLettrage(corps), (e) => est400(e) && (code === undefined || e.code === code), JSON.stringify(corps));
  assert.throws(() => lettrage.lireLettrage({ tiersId: 1, groupes: Array.from({ length: lettrage.GROUPES_MAX + 1 }, (_, i) => [2 * i + 1, 2 * i + 2]) }), est400);
  assert.equal(lettrage.MSG_LETTRER, 'Seul le titulaire ou un gérant de niveau Complet ou Saisie peut lettrer ou délettrer');
});

test('une lettre : un seul compte collectif, total des débits = total des crédits (millimes), sinon l\'écart est dit', () => {
  const l = (compte, debit, credit) => ({ compte_numero: compte, debit, credit });
  assert.equal(lettrage.montantDuGroupe([l('4011', '0.000', '1190.000'), l('4011', '1190.000', '0.000')]), 1190000n);
  assert.equal(lettrage.montantDuGroupe([l('4011', '0.000', '1000.000'), l('4011', '0.000', '190.500'), l('4011', '1190.500', '0.000')]), 1190500n, 'deux factures, un règlement global');
  assert.throws(() => lettrage.montantDuGroupe([l('4011', '0.000', '1190.000'), l('4011', '500.000', '0.000')]), (e) => est400(e) && e.code === 'ECART' && /Écart de 690,000 : débits 500,000 ≠ crédits 1 190,000/.test(e.message) && /règlement partiel reste non lettré/.test(e.message));
  assert.throws(() => lettrage.montantDuGroupe([l('4011', '0.000', '10.000'), l('404', '10.000', '0.000')]), (e) => est400(e) && e.code === 'COMPTES_DIFFERENTS' && /4011 et 404/.test(e.message));
});

test('propositions : même pièce qui se solde, puis même montant (la plus ancienne avec la plus ancienne), compte par compte ; brouillard ignoré', () => {
  let n = 0;
  const ligne = (compte, ref, debit, credit, etat = 'validee') => ({ id: ++n, compte: { id: compte }, debit, credit, ecriture: { reference: ref, etat } });
  const lignes = [
    ligne(1, 'F-1', '0.000', '1190.000'), //  1 facture
    ligne(1, 'F-2', '0.000', '500.000'), //   2 facture
    ligne(1, 'F-3', '0.000', '500.000'), //   3 facture
    ligne(1, 'f-2 ', '500.000', '0.000'), //  4 contre-passation de F-2 (même pièce, casse et blancs ignorés)
    ligne(1, 'RLV-1', '1190.000', '0.000'), // 5 règlement de F-1
    ligne(1, 'RLV-2', '500.000', '0.000'), // 6 règlement de F-3
    ligne(2, 'RLV-3', '500.000', '0.000'), // 7 autre compte : jamais avec le compte 1
    ligne(1, 'F-4', '0.000', '77.000', 'brouillard'), // 8 brouillard : jamais proposé
    ligne(1, 'RLV-4', '77.000', '0.000'), // 9 sans contrepartie validée
  ];
  const p = lettrage.proposer(lignes);
  assert.deepEqual(p.map((x) => [x.motif, x.lignes, x.montant]), [
    ['montant', [5, 1], '1190.000'],
    ['piece', [2, 4], '500.000'],
    ['montant', [6, 3], '500.000'],
  ]);
  assert.equal(p[1].piece, 'F-2');
  assert.deepEqual(lettrage.proposer([]), []);
  // Relecture : après la contre-passation d'un règlement de même pièce que sa facture, la contre-passation s'apparie
  // d'abord avec la ligne qu'elle annule (et non la facture avec l'ancien règlement).
  const l = (id, ecriture, debit, credit, origine = 'saisie', origineId = null) => ({ id, compte: { id: 1 }, debit, credit, ecriture: { id: ecriture, reference: 'F-9', etat: 'validee', origine, origineId } });
  const q = lettrage.proposer([l(1, 10, '0.000', '1190.000'), l(2, 11, '1190.000', '0.000'), l(3, 12, '0.000', '1190.000', 'contrepassation', 11)]);
  assert.deepEqual(q.map((x) => [x.motif, x.lignes]), [['contrepassation', [2, 3]]], 'le règlement avec sa contre-passation ; la facture reste à lettrer');
});

test('échéance et tranches : non échu (≤ 0), 1-30, 31-60, 61-90, plus de 90 ; la même règle en SQL ; dû côté du tiers ; jour à Tunis', () => {
  const t = echeances.trancheDe;
  assert.deepEqual([-40, -1, 0, 1, 30, 31, 60, 61, 90, 91, 400].map(t), ['nonEchu', 'nonEchu', 'nonEchu', 'j30', 'j30', 'j60', 'j60', 'j90', 'j90', 'plus90', 'plus90']);
  assert.deepEqual(echeances.CLES_TRANCHES, ['nonEchu', 'j30', 'j60', 'j90', 'plus90']);
  assert.deepEqual(echeances.TRANCHES.map((x) => echeances.sqlTranche(x, 'r')), ['r <= 0', 'r >= 1 AND r <= 30', 'r >= 31 AND r <= 60', 'r >= 61 AND r <= 90', 'r >= 91']);
  assert.equal(echeances.SQL_DU, "(CASE WHEN t.type = 'fournisseur' THEN l.credit - l.debit ELSE l.debit - l.credit END)");
  assert.equal(echeances.SQL_ECHEANCE, `(CASE WHEN ${echeances.SQL_DU} > 0 THEN COALESCE(l.echeance, COALESCE(e.date_reelle, e.date) + t.delai_paiement::int) ELSE COALESCE(e.date_reelle, e.date) END)`,
    'facture : échéance de la ligne, sinon date (vraie date) + délai ; règlement ou avoir : toujours sa date (relecture : une échéance posée par la saisie sur un règlement est ignorée)');
  assert.equal(echeances.aujourdhuiTunis(new Date('2026-10-08T23:30:00Z')), '2026-10-09', 'minuit passé à Tunis (UTC+1)');
  assert.match(echeances.aujourdhuiTunis(), /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!/require\(/.test(lire('src', 'compta', 'echeances.js')), 'module sans dépendance (fiche du dossier sans cycle de chargement)');
});

test('échéancier : type, brouillard, texte de la relance (texte type par défaut, paragraphes gardés, bornes, caractères latins)', () => {
  assert.equal(echeancier.lireType(undefined), 'fournisseur');
  assert.equal(echeancier.lireType('client'), 'client');
  assert.throws(() => echeancier.lireType('clients'), est400);
  assert.equal(echeancier.lireBrouillard(undefined), true);
  assert.equal(echeancier.lireBrouillard('0'), false);
  assert.equal(echeancier.lireTexteRelance(undefined), echeancier.TEXTE_RELANCE);
  assert.equal(echeancier.lireTexteRelance('   '), echeancier.TEXTE_RELANCE);
  assert.equal(echeancier.lireTexteRelance('Madame,\r\n\r\n  Merci   de régler.  \r\nCordialement'), 'Madame,\n\n Merci de régler.\nCordialement');
  assert.throws(() => echeancier.lireTexteRelance('x'.repeat(2001)), (e) => est400(e) && e.code === 'TEXTE_TROP_LONG');
  assert.throws(() => echeancier.lireTexteRelance(Array.from({ length: 41 }, () => 'a').join('\n')), (e) => est400(e) && e.code === 'TEXTE_TROP_LONG');
  assert.throws(() => echeancier.lireTexteRelance('Merci 🙏'), (e) => est400(e) && e.code === 'TEXTE_ILLISIBLE');
  assert.throws(() => echeancier.lireTexteRelance(['a']), est400);
  assert.ok(/^Madame, Monsieur,\n\nSauf erreur ou omission de notre part/.test(echeancier.TEXTE_RELANCE) && /salutations distinguées\.$/.test(echeancier.TEXTE_RELANCE));
});

test('imputation des règlements (relecture) : sur les tranches les plus anciennes d\'abord ; l\'échu ne dépasse jamais le dû ; un reste de crédit en moins du non échu', () => {
  const t = (o) => ({ nonEchu: 0n, j30: 0n, j60: 0n, j90: 0n, plus90: 0n, ...o });
  assert.deepEqual(echeances.imputer(t({ plus90: 1190000n }), 500000n), t({ plus90: 690000n }), 'facture de 1 190 en retard de 100 jours, acompte de 500 : échu 690 (et non 1 190)');
  assert.deepEqual(echeances.imputer(t({ plus90: 300000n, j30: 500000n, nonEchu: 200000n }), 600000n), t({ plus90: 0n, j30: 200000n, nonEchu: 200000n }));
  assert.deepEqual(echeances.imputer(t({ j30: 595000n }), 1190000n), t({ j30: 0n, nonEchu: -595000n }), 'contre-passation du jour : rien d\'échu, 595 en faveur du tiers');
  assert.deepEqual(echeances.imputer(t({ j60: 1000n }), 0n), t({ j60: 1000n }));
  assert.deepEqual(echeances.ORDRE_IMPUTATION, ['plus90', 'j90', 'j60', 'j30', 'nonEchu']);
  const r = echeances.trancheesImputees({ nonechu: '100.000', j30: '0.000', j60: '1190.000', j90: '0.000', plus90: '0.000', credits: '500.000' });
  assert.deepEqual([r.echu, r.total, r.tranches.j60, r.tranches.nonEchu], [690000n, 790000n, 690000n, 100000n]);
  assert.equal(echeances.millimes('-12.5'), -12500n);
  assert.equal(echeances.texteMillimesSigne(-12500n), '-12.500');
  assert.ok(echeances.sqlAgregatsAges('n').includes('COALESCE(SUM(n.du) FILTER (WHERE n.du > 0 AND n.retard >= 1 AND n.retard <= 30), 0)::numeric(18,3)::text AS j30') && echeances.sqlAgregatsAges('n').includes('COALESCE(SUM(-n.du) FILTER (WHERE n.du < 0), 0)::numeric(18,3)::text AS credits'), 'les factures par tranche, les crédits à part');
});

test('balance âgée : factures par tranche, règlements imputés, totaux, part échue ; jamais de flottant', () => {
  assert.equal(echeancier.millimesSigne('-12.500'), -12500n);
  assert.equal(echeancier.millimesSigne('1190.000'), 1190000n);
  const r1 = echeancier.rangeeAgee({ id: 1, code: 'C0001', nom: 'A', actif: true, delai_paiement: 30, total: '690.000', nonechu: '0.000', j30: '0.000', j60: '1190.000', j90: '0.000', plus90: '0.000', credits: '500.000', nb_lignes: 2, nb_brouillard: 0, retard_max: 45 });
  const r2 = echeancier.rangeeAgee({ id: 2, code: 'C0002', nom: 'B', actif: true, delai_paiement: 0, total: '100.250', nonechu: '100.250', j30: '0.000', j60: '0.000', j90: '0.000', plus90: '0.000', credits: '0.000', nb_lignes: 1, nb_brouillard: 1, retard_max: null });
  assert.equal(r1.echu, '690.000');
  assert.deepEqual(r1.tranches, { nonEchu: '0.000', j30: '0.000', j60: '690.000', j90: '0.000', plus90: '0.000' });
  assert.equal(r1.credits, '500.000');
  assert.equal(r2.echu, '0.000');
  const t = echeancier.totauxAgee([r1, r2]);
  assert.deepEqual(t, { total: '790.250', tranches: { nonEchu: '100.250', j30: '0.000', j60: '690.000', j90: '0.000', plus90: '0.000' }, echu: '690.000', nbLignes: 3, nbBrouillard: 1, nbTiers: 2 });
  assert.equal(echeancier.presenterLigne({ du: '-200.000', retard: 100, numero_provisoire: 1 }).tranche, null, 'un règlement n\'a pas de tranche : il s\'impute');
  assert.equal(echeancier.presenterLigne({ du: '200.000', retard: 100, numero_provisoire: 1 }).tranche, 'plus90');
  for (const f of ['echeancier.js', 'lettrage.js', 'echeances.js', 'pdf.js']) {
    const code = lire('src', 'compta', f);
    assert.ok(!/parseFloat|Number\(l\.|Number\(r\.|toFixed/.test(code), `${f} : jamais de flottant sur un montant`);
    assert.ok(!/gerant_parent_id|requireClient|requireEntreprise/.test(code), `${f} : règles du chantier`);
  }
});

test('requêtes : chaque paramètre employé ; lignes non lettrées seulement ; validées seulement à lettrer ; brouillard retirable ; verrou des lignes', () => {
  const tous = { ...Object.fromEntries(Object.entries(lettrage).filter(([k]) => k.startsWith('SQL_'))), ...Object.fromEntries(Object.entries(echeancier).filter(([k]) => k.startsWith('SQL_')).map(([k, v]) => [`E_${k}`, v])) };
  for (const [nom, sql] of Object.entries(tous)) {
    const n = Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    for (let i = 1; i <= n; i += 1) assert.ok(sql.includes(`$${i}`), `${nom} : $${i} employé`);
  }
  assert.ok(lettrage.SQL_NON_LETTREES.includes('l.lettrage_id IS NULL') && lettrage.SQL_NON_LETTREES.includes('ORDER BY l.date, e.numero NULLS LAST, e.numero_provisoire, l.rang') && lettrage.SQL_NON_LETTREES.includes('LIMIT $3'));
  assert.ok(lettrage.SQL_TIERS.includes("COUNT(*) FILTER (WHERE l.lettrage_id IS NULL AND e.etat = 'validee')::int AS nb_a_lettrer"));
  assert.ok(echeancier.SQL_NON_LETTREES.includes("l.lettrage_id IS NULL AND t.type = $3 AND ($4::boolean OR e.etat = 'validee') AND ($5::int IS NULL OR l.tiers_id = $5)"));
  assert.ok(echeancier.SQL_NON_LETTREES.includes(`${echeances.SQL_DU} AS du, ${echeances.SQL_ECHEANCE} AS echeance, ($2::date - ${echeances.SQL_ECHEANCE})::int AS retard`));
  assert.ok(echeancier.SQL_BALANCE_AGEE.includes(echeances.sqlAgregatsAges('n')) && echeancier.SQL_BALANCE_AGEE.includes('AS nonechu') && echeancier.SQL_BALANCE_AGEE.includes('AS plus90') && echeancier.SQL_BALANCE_AGEE.includes('AS credits'));
  assert.ok(lettrage.SQL_LIGNES_DES_LETTRES.includes('LIMIT $3') && lettrage.LIGNES_DES_LETTRES_MAX === 2000, 'lignes des lettres bornées (relecture)');
  assert.ok(lire('src', 'compta', 'configDossier.js').includes("${sqlAgregatsAges('n')}") && lire('src', 'compta', 'configDossier.js').includes('echu += trancheesImputees(r).echu;'), 'fiche du dossier : échu tiers par tiers, après imputation');
  const code = lire('src', 'compta', 'lettrage.js');
  assert.ok(code.includes('WHERE l.dossier_id = $1 AND l.id = ANY($2) FOR UPDATE OF l'), 'les lignes cochées verrouillées');
  assert.ok(code.includes("if (l.etat !== 'validee') throw erreur(409") && code.includes("'LIGNE_BROUILLARD'") && code.includes("'DEJA_LETTREE'") && code.includes("'TIERS_DIFFERENT'"), 'validées, non lettrées, du tiers');
  assert.ok(code.includes("await journaliser(db, acces.espace_id, req.user.id, 'lettrage_fait'") && code.includes("'lettrage_defait', { dossier: d.id, motif: 'demande'") && code.includes("'lettrage_defait', { dossier: dossierId, motif: 'contrepassation'"), 'journal D16');
  assert.ok(code.includes("if (!droits(acces).saisir) throw erreur(403, MSG_LETTRER, 'NIVEAU_INSUFFISANT');") && code.includes("if (d.etat === 'archive')"), 'droit « saisir », dossier non archivé');
  const ech = lire('src', 'compta', 'echeancier.js');
  assert.ok(!ech.includes('dansEspaceDuDossier') && (ech.match(/await lectureDossier\(req\.user, req\.params\.dossierId\)/g) || []).length === 5, 'échéancier : lecture seule, rien n\'est écrit');
  assert.ok(ech.includes("avecGardeExport(res, '[compta.echeancier.exporter]'"), 'export sous la garde de concurrence des livres');
});

test('grand livre et écritures : la lettre de chaque ligne (dernière colonne de l\'export) ; contre-passation qui délettre ; fiche du dossier', () => {
  assert.ok(livres.SQL_GRAND_LIVRE.includes('LEFT JOIN compta.lettrages lt ON lt.id = l.lettrage_id') && livres.SQL_GRAND_LIVRE.includes('lt.lettre'));
  const lv = lire('src', 'compta', 'livres.js');
  assert.ok(lv.includes("'Solde débit', 'Solde crédit', 'État', 'Lettre'],") && lv.includes("l.ecriture.etat === 'validee' ? 'Validée' : 'Brouillard', l.lettre || '']"), 'la lettre en dernière colonne (S6c inchangé)');
  assert.ok(lv.includes('const ajouterFeuille = (wb, {') && lv.includes('ajouterFeuille(wb, options);'), 'classeur d\'une feuille = ajouterFeuille');
  const ec = require('../src/compta/ecritures');
  assert.ok(ec.SQL_LIGNES.includes('LEFT JOIN compta.lettrages lt ON lt.id = l.lettrage_id'));
  assert.equal(ec.presenterLigne({ id: 1, rang: 1, compte_id: 2, lettre: 'AAB' }).lettre, 'AAB');
  assert.equal(ec.presenterLigne({ id: 1, rang: 1, compte_id: 2, lettre: null }).lettre, null);
  const va = lire('src', 'compta', 'validation.js');
  const cp = va.slice(va.indexOf('const contrepasser = async'));
  assert.ok(cp.indexOf('await delettrerEcriture(db, { espaceId: acces.espace_id, auteurId: req.user.id, dossierId: d.id }, e);') > cp.indexOf('await insererLignes(db, d, ins.rows[0].id, date, lignes);') && cp.includes('...(delettrees.length ? { delettrees } : {}),'), 'l\'origine délettrée dans la transaction, avant le journal');
  const cd = lire('src', 'compta', 'configDossier.js');
  assert.ok(cd.includes('tenue: { fournisseurs: tenueDe(\'fournisseur\'), clients: tenueDe(\'client\') },') && cd.includes("db.query(SQL_RESUME_TENUE, [dossierId, aujourdhuiTunis()])"));
  assert.ok(lire('src', 'compta', 'dossiers.js').includes('tenue: configuration.tenue,'));
});

test('PDF : relevé de compte et lettre de relance construits entiers (accents, plusieurs pages, numérotées)', async () => {
  const dossier = { nom: 'Hôtel Les Jasmins', raison_sociale: 'Société Hôtelière des Jasmins', matricule_fiscal: '1234567A/A/M/000', adresse: '5 rue des Jasmins', ville: '1002 Tunis' };
  const tiers = { id: 1, type: 'client', code: 'C0001', nom: 'Voyages Méditerranée', matricule_fiscal: null, adresse: 'Avenue Habib Bourguiba', ville: 'Sousse' };
  const lignes = Array.from({ length: 120 }, (_, i) => ({
    id: i + 1, date: '2026-03-05', libelle: `Séjour n° ${i + 1} — chambre double`, debit: '119.000', credit: '0.000', du: '119.000', echeance: '2026-04-19', retard: 120 - i, tranche: 'plus90', compte: '4111',
    ecriture: { numero: `VT-2026-${String(i + 1).padStart(6, '0')}`, numeroProvisoire: 'B-000001', etat: i === 0 ? 'brouillard' : 'validee', reference: `FV-${i + 1}`, journal: 'VT' }, tiers: { id: 1, code: 'C0001', nom: 'x' },
  }));
  // Un règlement non lettré, déduit dans la relance (relecture).
  lignes.push({ ...lignes[1], id: 999, libelle: 'Acompte', debit: '0.000', credit: '500.000', du: '-500.000', retard: 3, tranche: null, ecriture: { ...lignes[1].ecriture, reference: 'RLV-1' } });
  const etat = { au: '2026-10-09', lignes, total: 121, totaux: { du: '13780.000', echu: '13780.000', credits: '500.000', tranches: { nonEchu: '0.000', j30: '3570.000', j60: '3570.000', j90: '3570.000', plus90: '3070.000' }, debit: '14280.000', credit: '500.000', nbBrouillard: 1 } };
  const releve = await echeancier.construireReleve({ dossier, tiers, etat });
  const relance = await echeancier.construireRelance({ dossier, tiers, etat, texte: echeancier.TEXTE_RELANCE });
  for (const [nom, pdf] of [['relevé', releve], ['relance', relance]]) {
    assert.ok(Buffer.isBuffer(pdf) && pdf.slice(0, 5).toString() === '%PDF-', `${nom} : un PDF`);
    const pages = (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
    assert.ok(pages >= 3, `${nom} : plusieurs pages (${pages})`);
  }
  const vide = await echeancier.construireReleve({ dossier, tiers: { ...tiers, type: 'fournisseur' }, etat: { au: '2026-10-09', lignes: [], total: 0, totaux: { du: '0.000', echu: '0.000', tranches: { nonEchu: '0.000', j30: '0.000', j60: '0.000', j90: '0.000', plus90: '0.000' }, debit: '0.000', credit: '0.000', nbBrouillard: 0 } } });
  assert.ok(vide.slice(0, 5).toString() === '%PDF-', 'compte soldé : un relevé quand même');
  assert.equal(echeancier.dateLongue('2026-10-09'), '9 octobre 2026');
  assert.deepEqual(echeancier.identiteDossier(dossier), ['Société Hôtelière des Jasmins', 'Matricule fiscal 1234567A/A/M/000', '5 rue des Jasmins', '1002 Tunis']);
  assert.deepEqual(echeancier.identiteTiers(tiers), ['Voyages Méditerranée', 'Client C0001', 'Avenue Habib Bourguiba', 'Sousse']);
});

test('migration 218 : lettrages (lettre unique par tiers, CASCADE sur le dossier), lignes.lettrage_id, index partiels ; manuel sous gardes md5 (215, 217), fiche 1073', () => {
  const sql = lire('migrations', '218_compta_lettrage.sql');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS compta.lettrages (') && sql.includes('dossier_id  INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE') && sql.includes('tiers_id    INTEGER NOT NULL REFERENCES compta.tiers(id),') && sql.includes("lettre      CHAR(3) NOT NULL CHECK (lettre ~ '^[A-Z]{3}$')") && sql.includes('montant     NUMERIC(18,3) NOT NULL CHECK (montant > 0)') && sql.includes('UNIQUE (tiers_id, lettre)'));
  assert.ok(sql.includes('ALTER TABLE compta.lignes ADD COLUMN IF NOT EXISTS lettrage_id INTEGER REFERENCES compta.lettrages(id) ON DELETE SET NULL;'));
  assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS idx_compta_lignes_non_lettrees ON compta.lignes (dossier_id, tiers_id, date) WHERE tiers_id IS NOT NULL AND lettrage_id IS NULL;') && sql.includes('WHERE lettrage_id IS NOT NULL;'));
  assert.ok(!/DROP |DELETE FROM|TRUNCATE|UPDATE compta\./.test(sql), 'additive');
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.match(sql, /SET contenu = CASE WHEN contenu = contenu_defaut THEN f\.texte ELSE contenu END/);
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  const texteDe = (fichier, marque) => {
    const src = lire('migrations', fichier);
    const debut = src.indexOf(marque) + marque.length;
    return src.slice(debut, src.indexOf(marque, debut));
  };
  const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
  for (const [marque, slug, origine, marqueOrigine, attendus] of [
    ['$f218a$', 'compta-tiers', '215_compta_ecritures.sql', '$f215e$', ['6. **Lettrage**', 'page **Échéancier**', 'celle de l\'échéancier quand la ligne n\'en porte pas']],
    ['$f218b$', 'compta-dossier', '217_compta_livres_imports.sql', '$f217b$', ['le **lettrage** (lignes validées à lettrer)', 'l\'**échéancier**', '**Livres**, **Lettrage** et **Échéancier**']],
    ['$f218c$', 'compta-livres', '217_compta_livres_imports.sql', '$f217c$', ['**lettre** (la marque du lettrage, page **Lettrage**)', 'les soldes successifs et la lettre']],
  ]) {
    const avant = texteDe(origine, marqueOrigine);
    assert.ok(sql.includes(`${marque}, '${slug}', '${md5(avant)}')`), `${slug} : garde = md5 du texte de ${origine}`);
    const t = texteDe('218_compta_lettrage.sql', marque);
    for (const a of attendus) assert.ok(t.includes(a), `${slug} : « ${a} »`);
    assert.ok(t.length > avant.length, `${slug} : complété`);
  }
  assert.ok(sql.includes("('compta-lettrage', 'Lettrage et échéancier', '🔗', 1073, $f218d$## 🔗 Lettrage et échéancier") && sql.includes("'/lettrage')"), 'nouvelle fiche, écran /lettrage');
  const fiche = texteDe('218_compta_lettrage.sql', '$f218d$');
  for (const a of ['**Lettrer**', '**Proposer**', '**Délettrer**', '**Relevé de compte (PDF)**', '**Lettre de relance (PDF)**', '**Exporter (Excel)**', '**non échu**', '**plus de 90 jours**', 'écritures **validées**', 'délettrée d\'office', 'n\'envoie rien par email', '**Brouillard compris**', 'jamais une écriture (NC 01)', 'règlement partiel']) assert.ok(fiche.includes(a), `fiche Lettrage : « ${a} »`);
  assert.ok(sql.includes('ON CONFLICT (slug) DO NOTHING'), 'idempotente');
});

test('routes : 4 du lettrage (2 écritures sous la limite de la saisie), 5 de l\'échéancier (PDF sous la limite des PDF, export sous celle des livres)', () => {
  const src = lire('src', 'compta', 'routes.js');
  for (const r of [
    "router.get('/dossiers/:dossierId/lettrage', authenticate, lettrage.lire);",
    "router.get('/dossiers/:dossierId/lettrage/tiers/:tiersId', authenticate, lettrage.unTiers);",
    "router.post('/dossiers/:dossierId/lettrage', authenticate, limiteEcritures, lettrage.lettrer);",
    "router.delete('/dossiers/:dossierId/lettrage/:lettrageId', authenticate, limiteEcritures, lettrage.delettrer);",
    "router.get('/dossiers/:dossierId/echeancier', authenticate, echeancier.lire);",
    "router.get('/dossiers/:dossierId/echeancier/export', authenticate, limiteLivres, echeancier.exporter);",
    "router.get('/dossiers/:dossierId/echeancier/tiers/:tiersId', authenticate, echeancier.unTiers);",
    "router.get('/dossiers/:dossierId/echeancier/tiers/:tiersId/releve.pdf', authenticate, limiteDocuments, echeancier.releve);",
    "router.post('/dossiers/:dossierId/echeancier/tiers/:tiersId/relance.pdf', authenticate, limiteDocuments, echeancier.relance);",
  ]) assert.ok(src.includes(r), r);
  assert.ok(src.indexOf("lettrage/tiers/:tiersId'") < src.indexOf("lettrage/:lettrageId'"), 'adresse fixe avant /:lettrageId');
  assert.ok(src.includes("message: { message: 'Trop de documents PDF demandés en peu de temps, réessayez dans un quart d\\'heure.' },"));
  assert.ok(src.includes('max: 120,\n  keyGenerator: (req) => `documents:${req.user.id}`'), 'relevés et relances : leur propre limite (relecture)');
  assert.ok(routes.ECRITURES_SANS_GARDE.includes('POST /dossiers/:dossierId/echeancier/tiers/:tiersId/relance.pdf'), 'la relance en POST n\'écrit rien : sans garde, comme le relevé');
  assert.ok(!src.includes("router.get('/dossiers/:dossierId/echeancier/tiers/:tiersId/relance.pdf'"), 'plus de relance en GET (le texte ne voyage plus dans l\'adresse)');
});

test('refus avant toute requête : tiers ou lettre invalides (404), demande illisible (400), texte de relance trop long (400)', async () => {
  const user = { id: 1 };
  for (const [fn, req, statut] of [
    [lettrage.unTiers, { user, params: { dossierId: '1', tiersId: 'x' } }, 404],
    [lettrage.lettrer, { user, params: { dossierId: '1' }, body: { tiersId: 1, lignes: [1] } }, 400],
    [echeancier.unTiers, { user, params: { dossierId: '1', tiersId: '-1' }, query: {} }, 404],
    [echeancier.releve, { user, params: { dossierId: '1', tiersId: 'a' }, query: {} }, 404],
    [echeancier.relance, { user, params: { dossierId: '1', tiersId: '3' }, query: {}, body: { texte: 'x'.repeat(2001) } }, 400],
    [lettrage.delettrer, { user, params: { dossierId: '1', lettrageId: 'abc' } }, 404],
    [echeancier.lire, { user, params: { dossierId: '1' }, query: { type: 'tiers' } }, 400],
  ]) {
    const res = reponse();
    await fn(req, res);
    assert.equal(res.statut, statut, `${fn.name} ${JSON.stringify(req.params)} ${JSON.stringify(res.corps)}`);
  }
});
