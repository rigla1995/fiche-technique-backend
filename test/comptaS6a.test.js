// LabFlow Compta, étape S6a « Les écritures en brouillard » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6a, §2,
// §4 ; réponses du client du 08/10 — « ok pour les 8 »). Tests sans base : les montants en millimes (BigInt, jamais de
// flottant), le calcul d'une taxe arrondi au millime, les lecteurs de saisie (lignes, écriture, partie double, filtres,
// aides), l'assiette d'une retenue, le compte d'un code selon le journal, les présentations, la migration 215 (tables,
// index, manuel : gardes md5 des textes de la 214 et de la 213, fiche « Écritures »), les routes, le droit « saisir », les
// hooks « mouvementé » rendus réels, les branchements (fiche, résumé), les refus avant toute requête.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const ecritures = require('../src/compta/ecritures');
const dossiers = require('../src/compta/dossiers');
const est400 = (e) => e.statusCode === 400;
const reponse = () => {
  const res = { statut: 200, corps: null };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  return res;
};

test('montants en millimes (SPEC-SOCLE §0) : lecture en texte, virgule acceptée, jamais de flottant ; texte NUMERIC ; affichage', () => {
  assert.equal(ecritures.lireMontant('1 190,500', 'M'), 1190500n);
  assert.equal(ecritures.lireMontant('1190.5', 'M'), 1190500n);
  assert.equal(ecritures.lireMontant('0,07', 'M'), 70n);
  assert.equal(ecritures.lireMontant(1190.5, 'M'), 1190500n, 'un nombre est relu par son texte');
  assert.equal(ecritures.lireMontant('', 'M'), 0n);
  assert.equal(ecritures.lireMontant(null, 'M'), 0n);
  assert.equal(ecritures.lireMontant('999999999999999.999', 'M'), 999999999999999999n, '15 entiers, 3 décimales : NUMERIC(18,3)');
  assert.equal(ecritures.lireMontant('1\u00a0234\u202f567,89', 'M'), 1234567890n, 'espaces insécables');
  for (const v of ['1.2345', '-1', 'abc', '1,2,3', '1e3', {}, [], '1234567890123456']) assert.throws(() => ecritures.lireMontant(v, 'M'), est400, JSON.stringify(v));
  assert.equal(ecritures.texteMillimes(1190500n), '1190.500');
  assert.equal(ecritures.texteMillimes(0n), '0.000');
  assert.equal(ecritures.texteMillimes(7n), '0.007');
  assert.equal(ecritures.texteMillimes(-17850n), '-17.850');
  assert.equal(ecritures.millimesDe('1234.500'), 1234500n);
  assert.equal(ecritures.fmtMillimes(1190500n), '1 190,500');
  assert.equal(ecritures.fmtMillimes(1234567890n), '1 234 567,890');
  assert.equal(ecritures.fmtMillimes(5n), '0,005');
  assert.equal(ecritures.fmtDate('2026-03-15'), '15/03/2026');
  assert.equal(ecritures.numeroProvisoire(12), 'B-000012');
  assert.equal(ecritures.numeroProvisoire(1234567), 'B-1234567');
});

test('calcul d\'une taxe : base × taux / 100 en entiers, arrondi au millime le plus proche (demi-millime vers le haut)', () => {
  assert.equal(ecritures.milliemesDe('19.000'), 19000n);
  assert.equal(ecritures.milliemesDe('1.5'), 1500n);
  assert.equal(ecritures.milliemesDe('0.500'), 500n);
  assert.equal(ecritures.milliemesDe('100.000'), 100000n);
  assert.equal(ecritures.calculTaxe(1000000n, '19.000'), 190000n, '1 000,000 × 19 % = 190,000');
  assert.equal(ecritures.calculTaxe(1190000n, '1.500'), 17850n, '1 190,000 × 1,5 % = 17,850');
  assert.equal(ecritures.calculTaxe(1190000n, '0.500'), 5950n);
  assert.equal(ecritures.calculTaxe(333333n, '19.000'), 63333n, '63,33327 → 63,333');
  assert.equal(ecritures.calculTaxe(333335n, '19.000'), 63334n, '63,33365 → 63,334');
  assert.equal(ecritures.calculTaxe(5n, '10.000'), 1n, '0,5 millime → 1 (vers le haut)');
  assert.equal(ecritures.calculTaxe(4n, '10.000'), 0n, '0,4 millime → 0');
  assert.equal(ecritures.calculTaxe(2n, '19.000'), 0n);
  assert.equal(ecritures.calculTaxe(3n, '19.000'), 1n);
  assert.equal(ecritures.calculTaxe(-1190000n, '1.500'), -17850n, 'signe de la base conservé');
  assert.equal(ecritures.calculTaxe(0n, '19.000'), 0n);
  // Relecture : un code sans taux (TVAEXO) ne fait jamais tomber le calcul (le refus 400 est pris avant).
  assert.equal(ecritures.milliemesDe(null), 0n);
  assert.equal(ecritures.milliemesDe(''), 0n);
  assert.equal(ecritures.calculTaxe(1000000n, null), 0n);
  assert.equal(ecritures.TOTAL_MAX, 999999999999999999n);
});

test('lecteurs de saisie : ligne (compte, débit OU crédit, tiers, code, échéance), lignes (2 à 200), écriture (partie double), textes latins', () => {
  const l = ecritures.lireLigne({ compteId: '12', tiersId: '', libelle: '  Facture  ', debit: '1 000,000', credit: '', taxeId: 3, echeance: '2026-04-15' }, 0);
  assert.deepEqual(l, { rang: 1, compteId: 12, tiersId: null, libelle: 'Facture', debit: 1000000n, credit: 0n, taxeId: 3, echeance: '2026-04-15' });
  assert.deepEqual(ecritures.lireLigne({ compteId: 5, credit: '17.850' }, 3), { rang: 4, compteId: 5, tiersId: null, libelle: null, debit: 0n, credit: 17850n, taxeId: null, echeance: null });
  for (const [corps, motif] of [
    [{}, 'sans compte'], [{ compteId: 'x', debit: '1' }, 'compte mal formé'], [{ compteId: 1 }, 'ni débit ni crédit'], [{ compteId: 1, debit: '0', credit: '0' }, 'zéros'],
    [{ compteId: 1, debit: '1', credit: '1' }, 'les deux'], [{ compteId: 1, debit: 'abc' }, 'montant faux'], [{ compteId: 1, debit: '1', echeance: '2026-02-30' }, 'échéance inexistante'],
    [{ compteId: 1, debit: '1', libelle: 'شركة' }, 'libellé en arabe'], [{ compteId: 1, debit: '1', libelle: 'x'.repeat(256) }, 'libellé trop long'], [{ compteId: 1, debit: '1', taxeId: 'x' }, 'code mal formé'],
    [null, 'nul'], ['x', 'texte'],
  ]) assert.throws(() => ecritures.lireLigne(corps, 0), est400, motif);
  assert.throws(() => ecritures.lireLignes([{ compteId: 1, debit: '1' }]), (e) => est400(e) && /au moins 2 lignes/.test(e.message), 'une ligne');
  assert.throws(() => ecritures.lireLignes(Array.from({ length: 201 }, () => ({ compteId: 1, debit: '1' }))), (e) => est400(e) && /200 lignes/.test(e.message));
  assert.throws(() => ecritures.lireLignes('x'), est400);
  const e = ecritures.lireEcriture({
    journalId: '7', date: '2026-03-15', reference: ' F-2026-001 ', libelle: 'Facture STB',
    lignes: [{ compteId: 1, debit: '1000' }, { compteId: 2, debit: '190' }, { compteId: 3, debit: '1,000' }, { compteId: 4, credit: '17,850' }, { compteId: 5, tiersId: 9, credit: '1173.150', echeance: '2026-04-14' }],
  });
  assert.equal(e.journalId, 7);
  assert.equal(e.reference, 'F-2026-001');
  assert.equal(e.total, 1191000n, 'débits = crédits = 1 191,000');
  assert.equal(e.lignes.length, 5);
  assert.equal(e.lignes[4].rang, 5);
  const base = { journalId: 7, date: '2026-03-15', reference: 'P', libelle: 'L' };
  assert.throws(() => ecritures.lireEcriture({ ...base, lignes: [{ compteId: 1, debit: '1000' }, { compteId: 2, credit: '999.999' }] }), (e2) => est400(e2) && e2.code === 'DESEQUILIBRE' && /écart 0,001/.test(e2.message), 'déséquilibre d\'un millime');
  assert.throws(() => ecritures.lireEcriture({ ...base, lignes: [{ compteId: 1, debit: '1' }, { compteId: 2, credit: '1', echeance: '2026-03-14' }] }), (e2) => est400(e2) && /précède la date/.test(e2.message), 'échéance avant la date');
  // Relecture : NC 01 §30, au moins deux comptes (deux tiers d'un même collectif comptent) ; total borné (NUMERIC 18,3).
  assert.throws(() => ecritures.lireEcriture({ ...base, lignes: [{ compteId: 1, debit: '100' }, { compteId: 1, credit: '100' }] }), (e2) => est400(e2) && e2.code === 'COMPTES_IDENTIQUES', 'un seul compte');
  assert.equal(ecritures.lireEcriture({ ...base, lignes: [{ compteId: 5, tiersId: 1, debit: '100' }, { compteId: 5, tiersId: 2, credit: '100' }] }).total, 100000n, 'deux tiers sur le même collectif');
  assert.throws(() => ecritures.lireEcriture({ ...base, lignes: [{ compteId: 1, debit: '999999999999999.999' }, { compteId: 2, debit: '1' }, { compteId: 3, credit: '999999999999999.999' }, { compteId: 4, credit: '1' }] }), (e2) => est400(e2) && e2.code === 'TOTAL_TROP_GRAND', 'total hors NUMERIC(18,3)');
  for (const [corps, motif] of [
    [{ ...base, journalId: '', lignes: [{ compteId: 1, debit: '1' }, { compteId: 2, credit: '1' }] }, 'sans journal'], [{ ...base, date: '15/03/2026', lignes: [{ compteId: 1, debit: '1' }, { compteId: 2, credit: '1' }] }, 'date mal formée'],
    [{ ...base, reference: '', lignes: [{ compteId: 1, debit: '1' }, { compteId: 2, credit: '1' }] }, 'sans pièce'], [{ ...base, reference: 'x'.repeat(81), lignes: [{ compteId: 1, debit: '1' }, { compteId: 2, credit: '1' }] }, 'pièce trop longue'],
    [{ ...base, libelle: ' ', lignes: [{ compteId: 1, debit: '1' }, { compteId: 2, credit: '1' }] }, 'sans libellé'], [{ ...base, lignes: [] }, 'sans ligne'], [{ ...base }, 'lignes absentes'], [null, 'nul'],
  ]) assert.throws(() => ecritures.lireEcriture(corps), est400, motif);
  assert.deepEqual([ecritures.REFERENCE_MAX, ecritures.LIBELLE_MAX, ecritures.LIGNES_MIN, ecritures.LIGNES_MAX], [80, 255, 2, 200]);
  assert.deepEqual(ecritures.ETATS, ['brouillard', 'validee']);
  assert.deepEqual(ecritures.NATURES_COLLECTIVES, ['fournisseurs', 'clients']);
  assert.deepEqual(ecritures.TYPES_HORS_TTC, ['timbre', 'retenue', 'retenue_tva', 'avance']);
  assert.deepEqual(ecritures.TYPES_OPPOSES, ['retenue', 'retenue_tva']);
});

test('filtres de la liste : journal, période, état, recherche (un montant est aussi cherché comme montant), pages', () => {
  assert.deepEqual(ecritures.lireFiltres({}), { journalId: null, periodeId: null, etat: '', q: '', montant: null, page: 1, limite: 25 });
  assert.deepEqual(ecritures.lireFiltres({ journal: '3', periode: '12', etat: 'brouillard', q: ' facture ', page: '2', limite: '50' }), { journalId: 3, periodeId: 12, etat: 'brouillard', q: 'facture', montant: null, page: 2, limite: 50 });
  assert.deepEqual(ecritures.lireFiltres({ q: '1 191,000' }).montant, '1191.000', 'un montant en texte français');
  assert.equal(ecritures.lireFiltres({ q: '17.85' }).montant, '17.850');
  assert.equal(ecritures.lireFiltres({ q: 'F-2026-001' }).montant, null, 'une référence n\'est pas un montant');
  for (const q of [{ etat: 'x' }, { journal: 'a' }, { periode: '-1' }, { page: '0' }, { limite: '201' }]) assert.throws(() => ecritures.lireFiltres(q), est400, JSON.stringify(q));
  assert.ok(ecritures.SQL_FILTRES.includes('e.libelle ILIKE $5 OR e.reference ILIKE $5') && ecritures.SQL_FILTRES.includes('e.total_debit = $6::numeric') && ecritures.SQL_FILTRES.includes('l.debit = $6::numeric OR l.credit = $6::numeric'));
  assert.ok(ecritures.SQL_ECRITURES.includes('e.total_debit::text AS total_debit') && ecritures.SQL_ECRITURES.includes('e.date::text AS date'), 'montants et dates transportés en texte');
  assert.ok(ecritures.SQL_LIGNES.includes('l.debit::text AS debit') && ecritures.SQL_LIGNES.includes('l.credit::text AS credit'));
});

test('aides à la saisie : lecture des corps, assiette d\'une retenue (TTC hors timbre, hors tiers et retenues), compte du code selon le journal', () => {
  const a = ecritures.lireAideTaxe({ journalId: 2, ligne: { compteId: 1, debit: '1000', taxeId: 4 } });
  assert.deepEqual(a, { journalId: 2, ligne: { rang: 1, compteId: 1, tiersId: null, libelle: null, debit: 1000000n, credit: 0n, taxeId: 4, echeance: null } });
  assert.throws(() => ecritures.lireAideTaxe({ ligne: { compteId: 1, debit: '1' } }), est400, 'sans journal');
  assert.throws(() => ecritures.lireAideTaxe({ journalId: 2 }), est400, 'sans ligne');
  const r = ecritures.lireAideRetenue({ journalId: 2, tiersId: '9', lignes: [{ compteId: 1, debit: '1000' }] });
  assert.deepEqual([r.journalId, r.tiersId, r.taxeId, r.lignes.length], [2, 9, null, 1]);
  assert.throws(() => ecritures.lireAideRetenue({ journalId: 2, lignes: [] }), est400, 'sans ligne');
  assert.throws(() => ecritures.lireAideRetenue({ journalId: 2, lignes: 'x' }), est400);
  // Assiette : achats = débits − crédits des lignes hors collectif, hors timbre / retenue / avance.
  const comptes = new Map([[1, { nature: 'charges' }], [2, { nature: 'tva_deductible' }], [3, { nature: 'charges' }], [4, { nature: 'retenues_operees' }], [5, { nature: 'fournisseurs' }], [6, { nature: 'produits' }], [7, { nature: 'clients' }], [8, { nature: 'tva_collectee' }]]);
  const taxes = new Map([[10, { type: 'tva' }], [11, { type: 'timbre' }], [12, { type: 'retenue' }], [13, { type: 'fodec' }]]);
  const cartes = { comptes, taxes };
  const achat = [
    { compteId: 1, debit: 1000000n, credit: 0n, taxeId: 10 }, { compteId: 2, debit: 190000n, credit: 0n, taxeId: 10 }, { compteId: 3, debit: 1000n, credit: 0n, taxeId: 11 },
    { compteId: 4, debit: 0n, credit: 17850n, taxeId: 12 }, { compteId: 5, debit: 0n, credit: 1173150n, taxeId: null },
  ];
  assert.equal(ecritures.assietteRetenue(achat, cartes, { type: 'achats' }, 'ttc'), 1190000n, 'TTC hors timbre : HT + TVA');
  assert.equal(ecritures.assietteRetenue(achat, cartes, { type: 'achats' }, 'ht'), 1000000n, 'hors taxes : sans la TVA');
  const vente = [{ compteId: 7, debit: 1190000n, credit: 0n, taxeId: null }, { compteId: 6, debit: 0n, credit: 1000000n, taxeId: 10 }, { compteId: 8, debit: 0n, credit: 190000n, taxeId: 10 }];
  assert.equal(ecritures.assietteRetenue(vente, cartes, { type: 'ventes' }, 'ttc'), 1190000n, 'ventes : crédits − débits');
  const fodec = [{ compteId: 1, debit: 1000000n, credit: 0n, taxeId: 10 }, { compteId: 3, debit: 10000n, credit: 0n, taxeId: 13 }];
  assert.equal(ecritures.assietteRetenue(fodec, cartes, { type: 'achats' }, 'ttc'), 1010000n, 'le FODEC entre dans le TTC');
  // Relecture : une retenue de TVA (assiette « tva ») se calcule sur les seules lignes de TVA.
  assert.equal(ecritures.assietteRetenue(achat, cartes, { type: 'achats' }, 'tva'), 190000n, 'assiette tva : la TVA seule');
  assert.equal(ecritures.assietteRetenue(vente, cartes, { type: 'ventes' }, 'tva'), 190000n);
  assert.deepEqual(ecritures.TYPES_RETENUE, ['retenue', 'retenue_tva', 'avance'], '« Ajouter la retenue » sert aux retenues, retenues de TVA et avances');
  assert.deepEqual(ecritures.NATURES_TVA, ['tva_deductible', 'tva_collectee', 'tva_a_payer']);
  // Une modification sans changement se reconnaît (auteur et date de traitement à part).
  const contenu = { journal: 'AC', date: '2026-03-15', reference: 'P', libelle: 'L', total: '1.000', lignes: [{ rang: 1, compte: '607', tiers: null, libelle: null, debit: '1.000', credit: '0.000', taxe: null, echeance: null }] };
  assert.equal(ecritures.contenuComparable({ ...contenu, creePar: 'A', creeLe: 'x' }), ecritures.contenuComparable(contenu));
  assert.notEqual(ecritures.contenuComparable({ ...contenu, libelle: 'M' }), ecritures.contenuComparable(contenu));
  // Compte du code : achats → achat (immobilisations si la ligne en est une et que le code en a un) ; ventes → vente ; OD → selon le côté.
  const x = { compte_achat_id: 21, compte_vente_id: 22, compte_immo_id: 23 };
  assert.deepEqual(ecritures.compteDuCode(x, { type: 'achats' }, { debit: 1n, credit: 0n }, { nature: 'charges' }), { id: 21, cote: 'à l\'achat' });
  assert.deepEqual(ecritures.compteDuCode(x, { type: 'achats' }, { debit: 1n, credit: 0n }, { nature: 'immobilisations' }), { id: 23, cote: 'sur immobilisations' });
  assert.deepEqual(ecritures.compteDuCode({ ...x, compte_immo_id: null }, { type: 'achats' }, { debit: 1n, credit: 0n }, { nature: 'immobilisations' }), { id: 21, cote: 'à l\'achat' }, 'sans compte sur immobilisations : celui de l\'achat');
  assert.deepEqual(ecritures.compteDuCode(x, { type: 'ventes' }, { debit: 0n, credit: 1n }, { nature: 'produits' }), { id: 22, cote: 'à la vente' });
  assert.deepEqual(ecritures.compteDuCode(x, { type: 'od' }, { debit: 1n, credit: 0n }, { nature: 'charges' }), { id: 21, cote: 'à l\'achat' }, 'OD au débit : achat');
  assert.deepEqual(ecritures.compteDuCode(x, { type: 'od' }, { debit: 0n, credit: 1n }, { nature: 'produits' }), { id: 22, cote: 'à la vente' }, 'OD au crédit : vente');
});

test('présentations : écriture (numéro provisoire B-000012, total en texte, journal), ligne (compte, tiers, code), tiers et taxe courts', () => {
  const e = ecritures.presenterEcriture({
    id: 5, journal_id: 2, journal_code: 'AC', journal_libelle: 'Achats', journal_type: 'achats', date: '2026-03-15', date_reelle: null, numero_provisoire: 12, numero: null, reference: 'F-1', libelle: 'Facture', etat: 'brouillard',
    total_debit: '1191.000', total_credit: '1191.000', origine: 'saisie', origine_id: null, cree_par: 3, cree_par_nom: 'Leïla', created_at: 'c', updated_at: 'u', valide_par: null, valide_le: null, nb_lignes: 5,
  }, [{ id: 9, ecriture_id: 5, rang: 1, libelle: null, debit: '1000.000', credit: '0.000', echeance: null, compte_id: 1, compte_numero: '607', compte_libelle: 'Achats de marchandises', compte_nature: 'charges', tiers_id: null, taxe_id: 4, taxe_code: 'TVA19', taxe_libelle: 'TVA 19 %', taxe_type: 'tva' }]);
  assert.deepEqual(e, {
    id: 5, numeroProvisoire: 'B-000012', numero: null, date: '2026-03-15', dateReelle: null, journal: { id: 2, code: 'AC', libelle: 'Achats', type: 'achats' }, reference: 'F-1', libelle: 'Facture', etat: 'brouillard', etatLibelle: 'Brouillard',
    total: '1191.000', origine: 'saisie', origineId: null, nbLignes: 5, creePar: 'Leïla', creeLe: 'c', modifieLe: 'u', valideLe: null,
    lignes: [{ id: 9, rang: 1, compte: { id: 1, numero: '607', libelle: 'Achats de marchandises', nature: 'charges' }, tiers: null, libelle: null, debit: '1000.000', credit: '0.000', taxe: { id: 4, code: 'TVA19', libelle: 'TVA 19 %', type: 'tva' }, echeance: null }],
  });
  assert.equal(ecritures.presenterEcriture({ id: 1, numero_provisoire: 1, journal_id: 1, etat: 'brouillard', total_debit: '1.000' }).lignes, undefined, 'la liste va sans les lignes');
  assert.deepEqual(ecritures.presenterLigne({ id: 2, rang: 5, libelle: 'x', debit: '0.000', credit: '1173.150', echeance: '2026-04-14', compte_id: 7, compte_numero: '4011', compte_libelle: 'F', compte_nature: 'fournisseurs', tiers_id: 3, tiers_type: 'fournisseur', tiers_code: 'F0001', tiers_nom: 'STB', taxe_id: null }).tiers, { id: 3, type: 'fournisseur', code: 'F0001', nom: 'STB' });
  assert.deepEqual(ecritures.presenterTiersCourt({ id: 3, type: 'fournisseur', code: 'F0001', nom: 'STB', compte_id: 7, delai_paiement: 30, retenue_id: 8, retenue_code: 'RS_MAR15', retenue_taux: '1.500', retenue_actif: true }), { id: 3, type: 'fournisseur', typeLibelle: 'Fournisseur', code: 'F0001', nom: 'STB', compteId: 7, delaiPaiement: 30, retenue: { id: 8, code: 'RS_MAR15', taux: '1.500', actif: true } });
  assert.deepEqual(ecritures.presenterTaxeCourte({ id: 4, code: 'TIMBRE', libelle: 'Droit de timbre', type: 'timbre', taux: null, montant: '1.000', assiette: 'fixe', actif: true }), { id: 4, code: 'TIMBRE', libelle: 'Droit de timbre', type: 'timbre', typeLibelle: 'Droit de timbre', taux: null, montant: '1.000', assiette: 'fixe', assietteLibelle: 'Montant fixe par facture', actif: true });
  assert.equal(ecritures.ETATS_LIBELLES.validee, 'Validée');
});

test('migration 215 : écritures et lignes (partie double, un seul côté, clés sans action, CASCADE du dossier), index, manuel (gardes md5, fiche « Écritures »)', () => {
  const sql = lire('migrations', '215_compta_ecritures.sql');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  for (const t of [
    'CREATE TABLE IF NOT EXISTS compta.ecritures', 'dossier_id        INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE',
    'exercice_id       INTEGER NOT NULL REFERENCES compta.exercices(id),', 'periode_id        INTEGER NOT NULL REFERENCES compta.periodes(id),', 'journal_id        INTEGER NOT NULL REFERENCES compta.journaux(id),',
    'numero_provisoire INTEGER NOT NULL CHECK (numero_provisoire >= 1)', 'reference         VARCHAR(80) NOT NULL', "etat              VARCHAR(10) NOT NULL DEFAULT 'brouillard' CHECK (etat IN ('brouillard', 'validee'))",
    'total_debit       NUMERIC(18,3) NOT NULL CHECK (total_debit >= 0)', "origine           VARCHAR(16) NOT NULL DEFAULT 'saisie' CHECK (origine IN ('saisie', 'import', 'contrepassation'))", 'origine_id        INTEGER REFERENCES compta.ecritures(id)',
    'CHECK (total_debit = total_credit)', "CHECK ((etat = 'validee') = (numero IS NOT NULL))", 'UNIQUE (dossier_id, numero_provisoire)',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_compta_ecritures_numero ON compta.ecritures (dossier_id, numero) WHERE numero IS NOT NULL',
    'CREATE INDEX IF NOT EXISTS idx_compta_ecritures_date ON compta.ecritures (dossier_id, date, id)', 'CREATE INDEX IF NOT EXISTS idx_compta_ecritures_journal ON compta.ecritures (dossier_id, journal_id, date)',
    'CREATE TABLE IF NOT EXISTS compta.lignes', 'ecriture_id INTEGER NOT NULL REFERENCES compta.ecritures(id) ON DELETE CASCADE', 'dossier_id  INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE',
    'compte_id   INTEGER NOT NULL REFERENCES compta.comptes(id),', 'tiers_id    INTEGER REFERENCES compta.tiers(id),', 'taxe_id     INTEGER REFERENCES compta.taxes(id),',
    'debit       NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (debit >= 0)', 'credit      NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (credit >= 0)', 'CHECK ((debit > 0) <> (credit > 0))', 'UNIQUE (ecriture_id, rang)',
    'CREATE INDEX IF NOT EXISTS idx_compta_lignes_compte ON compta.lignes (dossier_id, compte_id, date)', 'CREATE INDEX IF NOT EXISTS idx_compta_lignes_tiers ON compta.lignes (dossier_id, tiers_id, date) WHERE tiers_id IS NOT NULL',
  ]) assert.ok(sql.includes(t), t);
  assert.ok(sql.includes('ALTER TABLE compta.dossiers ADD COLUMN IF NOT EXISTS prochain_provisoire INTEGER NOT NULL DEFAULT 1 CHECK (prochain_provisoire >= 1);'), 'compteur du numéro provisoire sur le dossier');
  assert.ok(!/DROP |DELETE FROM|TRUNCATE/.test(sql) && (sql.match(/ALTER TABLE/g) || []).length === 1, 'additive : une colonne ajoutée, rien d\'autre ne change');
  assert.ok(!/ON DELETE SET NULL/.test(sql.slice(sql.indexOf('compte_id   INTEGER'), sql.indexOf('UNIQUE (ecriture_id, rang)'))), 'compte, tiers, code : clés sans action (les hooks refusent)');
  // Manuel : gardes md5 des textes de la 214 (fiche du dossier, plan, taxes, tiers) et de la 213 (journaux) ; nouvelle fiche.
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.match(sql, /SET contenu = CASE WHEN contenu = contenu_defaut THEN f\.texte ELSE contenu END/, 'une fiche retouchée garde sa retouche');
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  const texteDe = (fichier, marque) => {
    const src = lire('migrations', fichier);
    const debut = src.indexOf(marque) + marque.length;
    return src.slice(debut, src.indexOf(marque, debut));
  };
  const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
  for (const [marque, slug, fichierOrigine, marqueOrigine, attendu, disparu] of [
    ['$f215a$', 'compta-dossier', '214_compta_tiers.sql', '$f214a$', '- **Tenue** : les **écritures** du dossier (en brouillard, validées)', 'toutes ouvertes pour l\'instant'],
    ['$f215b$', 'compta-plan-comptes', '214_compta_tiers.sql', '$f214c$', 'reçoivent des écritures (page **Écritures**)', 'la saisie arrivera'],
    ['$f215c$', 'compta-journaux', '213_compta_journaux_taxes.sql', '$f213d$', 'chaque écriture choisit son journal parmi les journaux actifs', 'la saisie arrivera'],
    ['$f215d$', 'compta-taxes', '214_compta_tiers.sql', '$f214d$', 'bouton **Ajouter la retenue**', 's\'appliqueront à la saisie'],
    ['$f215e$', 'compta-tiers', '214_compta_tiers.sql', '$f214e$', 'le tiers se choisit sur chaque ligne passée sur un compte collectif', 'la saisie arrivera'],
  ]) {
    const garde = md5(texteDe(fichierOrigine, marqueOrigine));
    assert.ok(sql.includes(`${marque}, '${slug}', '${garde}')`), `${slug} : garde ${garde}`);
    const texte = texteDe('215_compta_ecritures.sql', marque);
    assert.ok(texte.includes(attendu), `${slug} : ${attendu}`);
    assert.ok(!texte.includes(disparu), `${slug} : plus « ${disparu} »`);
  }
  assert.ok(sql.includes("('compta-ecritures', 'Écritures', '✍️', 1070, $f215f$## ✍️ Écritures"));
  assert.ok(sql.includes("'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'") && sql.includes('ON CONFLICT (slug) DO NOTHING'));
  assert.ok(sql.includes("'/ecritures')"), 'écran de la fiche');
  const fiche = texteDe('215_compta_ecritures.sql', '$f215f$');
  for (const mot of ['+ Écriture', 'B-000012', 'Ajouter la TVA', 'Ajouter la retenue', 'TTC hors timbre', 'partie double', 'écart nul', 'Afficher plus', 'Saisie', 'Consultation', 'numéro définitif', 'AC-2026-000001', 'Modifier', 'Supprimer', 'date de traitement', 'retenues de TVA', 'avances', 'un seul compte', 'il se désactive']) assert.ok(fiche.includes(mot), mot);
  assert.ok(texteDe('215_compta_ecritures.sql', '$f215d$').includes('le seuil reste à votre appréciation'), 'fiche Taxes : le seuil n\'est pas calculé');
  assert.ok(!/étape suivante\s*:/.test(sql.replace(/arrivent à l'étape suivante|à l'étape suivante, avec/g, '')), 'les fiches retouchées ne renvoient plus la saisie à une étape suivante');
});

test('routes S6a : lecture pour tout accès, cinq écritures (aides comprises) sous leur limite, adresses fixes avant /:ecritureId, droit « saisir »', () => {
  const src = lire('src', 'compta', 'routes.js');
  for (const r of [
    "router.get('/dossiers/:dossierId/ecritures', authenticate, ecritures.lire);",
    "router.post('/dossiers/:dossierId/ecritures/aide/taxe', authenticate, limiteEcritures, ecritures.aideTaxe);",
    "router.post('/dossiers/:dossierId/ecritures/aide/retenue', authenticate, limiteEcritures, ecritures.aideRetenue);",
    "router.post('/dossiers/:dossierId/ecritures', authenticate, limiteEcritures, ecritures.creer);",
    "router.get('/dossiers/:dossierId/ecritures/:ecritureId', authenticate, ecritures.une);",
    "router.put('/dossiers/:dossierId/ecritures/:ecritureId', authenticate, limiteEcritures, ecritures.modifier);",
    "router.delete('/dossiers/:dossierId/ecritures/:ecritureId', authenticate, limiteEcritures, ecritures.supprimer);",
  ]) assert.ok(src.includes(r), r);
  assert.ok(src.indexOf("'/dossiers/:dossierId/ecritures/aide/taxe'") < src.indexOf("'/dossiers/:dossierId/ecritures/:ecritureId'"), 'les aides avant /:ecritureId');
  assert.ok(src.includes('max: 600,\n  keyGenerator: (req) => `ecritures:${req.user.id}`'), '600 écritures par quart d\'heure et par personne');
  for (const f of ['lire', 'une', 'creer', 'modifier', 'supprimer', 'aideTaxe', 'aideRetenue']) assert.equal(typeof ecritures[f], 'function', `ecritures.${f}`);
  const ctrl = lire('src', 'compta', 'ecritures.js');
  assert.ok(ctrl.includes("const ecritureEcritures = (req, travail, droit = 'saisir') => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {\n  if (!droits(acces)[droit]) throw erreur(403, MSG_SAISIR, 'NIVEAU_INSUFFISANT');\n  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\\'abord', 'DOSSIER_ARCHIVE');"));
  assert.equal((ctrl.match(/await ecritureEcritures\(req, async \(db, acces, d\) => /g) || []).length, 5, 'créer, modifier, supprimer, aide taxe, aide retenue dans la transaction du dossier');
  assert.ok(ctrl.includes('FOR UPDATE'), 'écriture relue sous verrou');
  assert.equal((ctrl.match(/exigerBrouillard\(/g) || []).length, 2, 'modifier et supprimer exigent le brouillard (définition comprise)');
  assert.ok(ctrl.includes("UPDATE compta.dossiers SET prochain_provisoire = prochain_provisoire + 1 WHERE id = $1 RETURNING prochain_provisoire - 1 AS n"), 'numéro provisoire : compteur du dossier, sous son verrou, jamais réemployé');
  assert.ok(ctrl.includes("'ecriture_creee'") && ctrl.includes("'ecriture_modifiee'") && ctrl.includes("'ecriture_supprimee'"), 'journal D16');
  assert.ok(ctrl.includes('avant: contenuAvant, apres }') && ctrl.includes('contenu }'), 'avant / après et contenu supprimé');
  assert.ok(ctrl.includes('if (contenuComparable(contenuAvant) === contenuComparable(apres)) return'), 'une modification sans changement n\'écrit rien');
  assert.ok(ctrl.includes("creePar: e.cree_par_nom || null, creeLe: e.created_at"), 'le contenu journalisé porte l\'auteur et la date de traitement');
  assert.ok(ctrl.includes("new Set(lignesAvant.map((l) => l.tiers_id).filter(Boolean))"), 'un tiers désactivé déjà porté est toléré en modification');
  for (const code of ["'LIGNE_SANS_CODE'", "'TIERS_TYPE'", "'CODE_NON_RETENUE'", "'ASSIETTE_TVA'", "'COMPTES_IDENTIQUES'", "'TOTAL_TROP_GRAND'"]) assert.ok(ctrl.includes(code), `code de refus ${code}`);
  assert.ok(ctrl.includes("if (x.assiette !== 'fixe' && x.taux == null) throw erreur(400"), 'code sans taux refusé avant le calcul');
  const code = ctrl.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/parseFloat|Number\(.*(debit|credit|montant|taux)/.test(code), 'jamais de flottant sur un montant');
  assert.ok(!/gerant_parent_id|requireClient|requireEntreprise/.test(code), 'règles du chantier');
  assert.equal(ecritures.MSG_SAISIR, 'Seul le titulaire ou un gérant de niveau Complet ou Saisie peut saisir des écritures');
});

test('droit « saisir » (réponse 4 du 08/10), hooks « mouvementé » réels, fiche et résumé avec les écritures', () => {
  assert.equal(dossiers.droits({ role: 'titulaire', niveau: 'complet' }).saisir, true);
  assert.equal(dossiers.droits({ role: 'gerant', niveau: 'complet' }).saisir, true);
  assert.equal(dossiers.droits({ role: 'gerant', niveau: 'saisie' }).saisir, true);
  assert.equal(dossiers.droits({ role: 'gerant', niveau: 'saisie' }).configurer, false);
  assert.equal(dossiers.droits({ role: 'gerant', niveau: 'consultation' }).saisir, false);
  for (const [fichier, fonction, requete] of [
    ['dossiers.js', 'const dossierMouvemente = async (db, dossierId) =>', "'SELECT 1 FROM compta.ecritures WHERE dossier_id = $1 LIMIT 1'"],
    ['planComptes.js', 'const compteMouvemente = async (db, compteId) =>', "'SELECT 1 FROM compta.lignes WHERE dossier_id = (SELECT dossier_id FROM compta.comptes WHERE id = $1) AND compte_id = $1 LIMIT 1'"],
    ['journaux.js', 'const journalMouvemente = async (db, journalId) =>', "'SELECT 1 FROM compta.ecritures WHERE dossier_id = (SELECT dossier_id FROM compta.journaux WHERE id = $1) AND journal_id = $1 LIMIT 1'"],
    ['taxes.js', 'const taxeMouvementee = async (db, taxeId) =>', "'SELECT 1 FROM compta.lignes WHERE taxe_id = $1 LIMIT 1'"],
    ['tiers.js', 'const tiersMouvemente = async (db, tiersId) =>', "'SELECT 1 FROM compta.lignes WHERE dossier_id = (SELECT dossier_id FROM compta.tiers WHERE id = $1) AND tiers_id = $1 LIMIT 1'"],
  ]) {
    const src = lire('src', 'compta', fichier);
    const debut = src.indexOf(fonction);
    assert.ok(debut > 0, fonction);
    assert.ok(src.slice(debut, src.indexOf('\n', debut)).includes(requete), `${fichier} : ${requete}`);
    assert.ok(!src.includes('=> false;'), `${fichier} : plus de hook « toujours faux »`);
  }
  const fiche = lire('src', 'compta', 'dossiers.js');
  assert.ok(fiche.includes('\n    tiers: configuration.tiers,\n    ecritures: configuration.ecritures,\n    mouvemente: await dossierMouvemente(db, d.id),\n'), 'résumé des écritures dans la fiche');
  const config = lire('src', 'compta', 'configDossier.js');
  assert.ok(config.includes("ecritures: { nbBrouillard: e.rows[0].brouillard, nbValidees: e.rows[0].validees }"));
  assert.ok(config.includes("COUNT(*) FILTER (WHERE etat = 'brouillard')::int AS brouillard"));
});

test('saisies refusées avant toute requête : création, modification, aides (400), identifiants (404 sans requête)', async () => {
  const user = { id: 1, role: 'comptable' };
  for (const [gestionnaire, params, body, motif] of [
    ['creer', { dossierId: '1' }, {}, 'corps vide'], ['creer', { dossierId: '1' }, { journalId: 1, date: '2026-03-15', reference: 'P', libelle: 'L', lignes: [{ compteId: 1, debit: '1' }, { compteId: 2, credit: '2' }] }, 'déséquilibre'],
    ['modifier', { dossierId: '1', ecritureId: '1' }, { journalId: 1, date: 'x', reference: 'P', libelle: 'L', lignes: [] }, 'date'],
    ['aideTaxe', { dossierId: '1' }, { journalId: 1 }, 'sans ligne'], ['aideRetenue', { dossierId: '1' }, { journalId: 1, lignes: [] }, 'sans lignes'],
  ]) {
    const res = reponse();
    await ecritures[gestionnaire]({ user, params, body, query: {} }, res);
    assert.equal(res.statut, 400, motif);
  }
  let res = reponse();
  await ecritures.lire({ user, params: { dossierId: '1' }, body: {}, query: { etat: 'x' } }, res);
  assert.equal(res.statut, 400, 'état inconnu');
  for (const [gestionnaire, params] of [['une', { dossierId: '1', ecritureId: 'x' }], ['une', { dossierId: 'abc', ecritureId: '1' }], ['lire', { dossierId: '1; DROP' }], ['supprimer', { dossierId: '-1', ecritureId: '1' }]]) {
    res = reponse();
    await ecritures[gestionnaire]({ user, params, body: {}, query: {} }, res);
    assert.equal(res.statut, 404, `${gestionnaire} ${JSON.stringify(params)}`);
  }
});
