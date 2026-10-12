// Tests de l'étape F4 (factures fournisseur → LabFlow Compta) : partie pure du pont (src/services/pontCompta.js) —
// montants en millimes, répartition de la remise et du FODEC, lignes de l'écriture d'achat (équilibre, regroupement,
// déconsigne au crédit, taux sans code), comptes par défaut. Le parcours en base est dans scripts/test-factures-f4.js.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../src/services/pontCompta');

const somme = (xs) => xs.reduce((s, x) => s + x, 0n);
const codes = {
  tva: new Map([['19', { taxeId: 19, compteId: 43666 }], ['7', { taxeId: 7, compteId: 43666 }], ['0', { taxeId: 100, compteId: null }]]),
  fodec: { taxeId: 50, compteId: 6651 },
  timbre: { taxeId: 60, compteId: 6654 },
};
const fournisseur = { compteId: 4011, tiersId: 5 };
const base = { codes, fournisseur, libelle: 'Facture FV-1 — SMDA', reference: 'FV-1' };

test('enMillimes : texte NUMERIC (signé) ou nombre → millimes BigInt', () => {
  assert.strictEqual(P.enMillimes('12.340'), 12340n);
  assert.strictEqual(P.enMillimes('-6.000'), -6000n);
  assert.strictEqual(P.enMillimes(1.5), 1500n);
  assert.strictEqual(P.enMillimes(0.1 + 0.2), 300n);
  assert.strictEqual(P.enMillimes(null), 0n);
});

test('repartirProrata : au millime près, plus forts restes, rien sur une ligne nulle ou négative', () => {
  const r = P.repartirProrata(10000n, [100000n, 30000n]);
  assert.deepStrictEqual(r, [7692n, 2308n]);
  assert.strictEqual(somme(r), 10000n);
  assert.deepStrictEqual(P.repartirProrata(1n, [1000n, 1000n, 1000n]), [1n, 0n, 0n], 'à égalité : l\'ordre');
  assert.deepStrictEqual(P.repartirProrata(500n, [1000n, -200n, 0n]), [500n, 0n, 0n]);
  assert.deepStrictEqual(P.repartirProrata(0n, [1000n]), [0n]);
});

test('ecritureDeFacture : HT net de remise par compte et taux, FODEC, TVA par taux, timbre ; fournisseur au crédit du TTC', () => {
  const { lignes, total } = P.ecritureDeFacture({
    ...base,
    lignes: [{ montant: 100000n, tauxTva: '19', compteId: 601 }, { montant: 30000n, tauxTva: '7.00', compteId: 607 }],
    remiseGlobale: 10000n, fodec: 1200n, timbre: 1000n,
    tvaParTaux: new Map([['19', 17708n], ['7', 1985n]]),
  });
  const debit = somme(lignes.map((l) => l.debit));
  const credit = somme(lignes.map((l) => l.credit));
  assert.strictEqual(debit, credit, 'équilibrée');
  assert.strictEqual(total, debit);
  // HT net : 120,000 (remise 10 répartie 7,692 / 2,308) ; TTC = 120 + 1,2 + 19,693 + 1 = 141,893.
  assert.deepStrictEqual(lignes.map((l) => [l.compteId, l.taxeId, l.debit, l.credit, l.tiersId]), [
    [601, 19, 92308n, 0n, null],
    [607, 7, 27692n, 0n, null],
    [6651, 50, 1200n, 0n, null],
    [43666, 7, 1985n, 0n, null],
    [43666, 19, 17708n, 0n, null],
    [6654, 60, 1000n, 0n, null],
    [4011, null, 0n, 141893n, 5],
  ]);
  assert.deepStrictEqual(lignes.map((l) => l.rang), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(lignes.every((l) => (l.debit > 0n) !== (l.credit > 0n)), 'débit OU crédit');
});

test('ecritureDeFacture : lignes d\'un même compte et d\'un même taux regroupées ; TVA calculée sans la validation', () => {
  const { lignes } = P.ecritureDeFacture({
    ...base,
    lignes: [{ montant: 41500n, tauxTva: '7', compteId: 601 }, { montant: 43500n, tauxTva: '7', compteId: 601 }, { montant: 0n, tauxTva: '7', compteId: 601 }],
  });
  assert.deepStrictEqual(lignes.map((l) => [l.compteId, l.debit, l.credit]), [[601, 85000n, 0n], [43666, 5950n, 0n], [4011, 0n, 90950n]]);
});

test('ecritureDeFacture : déconsigne (montant négatif) au crédit de son compte, hors remise et FODEC', () => {
  const { lignes } = P.ecritureDeFacture({
    ...base,
    lignes: [
      { montant: 100000n, tauxTva: '0', compteId: 601 },
      { montant: 30000n, tauxTva: '0', compteId: 4096, tiersId: 5 },
      { montant: -24000n, tauxTva: '0', compteId: 4096, tiersId: 5 },
    ],
    remiseGlobale: 10000n,
  });
  assert.deepStrictEqual(lignes.map((l) => [l.compteId, l.taxeId, l.debit, l.credit, l.tiersId]), [
    [601, 100, 92308n, 0n, null],
    [4096, 100, 27692n, 0n, 5],
    [4096, 100, 0n, 24000n, 5],
    [4011, null, 0n, 96000n, 5],
  ]);
  assert.strictEqual(somme(lignes.map((l) => l.debit)), somme(lignes.map((l) => l.credit)));
});

test('ecritureDeFacture : taux sans code de TVA actif refusé ; total nul refusé', () => {
  assert.throws(() => P.ecritureDeFacture({ ...base, lignes: [{ montant: 10000n, tauxTva: '12', compteId: 601 }] }),
    (e) => e instanceof P.RefusCompta && e.code === 'TAUX_SANS_CODE' && /12 %/.test(e.message));
  assert.throws(() => P.ecritureDeFacture({ ...base, lignes: [{ montant: 10000n, tauxTva: '0', compteId: 601 }, { montant: -10000n, tauxTva: '0', compteId: 4096, tiersId: 5 }] }),
    (e) => e.code === 'MONTANT_NUL');
});

test('compteParDefaut : revendu en l\'état 607, fournitures 6022, ingrédients et sans famille 601 ; natures hors stock', () => {
  assert.strictEqual(P.compteParDefaut({}), '601', 'sans famille');
  assert.strictEqual(P.compteParDefaut({ vendable: true, consommable: true }), '601', 'famille par défaut : ingrédient');
  assert.strictEqual(P.compteParDefaut({ vendable: false, consommable: true }), '601');
  assert.strictEqual(P.compteParDefaut({ vendable: true, consommable: false }), '607', 'revendu en l\'état');
  assert.strictEqual(P.compteParDefaut({ vendable: false, consommable: false }), '6022', 'fournitures');
  assert.deepStrictEqual(['transport', 'livraison', 'consigne', 'service', 'autre'].map((n) => P.compteParDefaut({ natureHorsStock: n })), ['6241', '6241', '4096', '604', '606']);
});

test('texteCompta : caractères hors Windows-1252 retirés, longueur bornée', () => {
  assert.strictEqual(P.texteCompta('Facture FV-1 — Société Méditerranéenne', 80), 'Facture FV-1 — Société Méditerranéenne');
  assert.strictEqual(P.texteCompta('مخبزة Les Délices 🍞', 80), 'Les Délices');
  assert.strictEqual(P.texteCompta('x'.repeat(100), 80).length, 80);
});

test('ecritureDeFacture : TVA négative d\'un taux (retour au même taux) au crédit du compte de TVA', () => {
  const { lignes } = P.ecritureDeFacture({
    ...base,
    lignes: [{ montant: 50000n, tauxTva: '19', compteId: 601 }, { montant: 30000n, tauxTva: '7', compteId: 601 }, { montant: -40000n, tauxTva: '7', compteId: 4096, tiersId: 5 }],
  });
  // TVA 19 % : 9,500 au débit ; TVA 7 % : (30 − 40) × 7 % = −0,700 au crédit ; fournisseur : 50 + 30 − 40 + 9,5 − 0,7 = 48,800.
  assert.deepStrictEqual(lignes.map((l) => [l.compteId, l.taxeId, l.debit, l.credit]), [
    [601, 19, 50000n, 0n],
    [601, 7, 30000n, 0n],
    [43666, 19, 9500n, 0n],
    [4096, 7, 0n, 40000n],
    [43666, 7, 0n, 700n],
    [4011, null, 0n, 48800n],
  ]);
  assert.strictEqual(somme(lignes.map((l) => l.debit)), somme(lignes.map((l) => l.credit)));
});

test('ecritureDeFacture : écart avec le TTC de la facture refusé (ECART_TTC) ; égalité acceptée', () => {
  const args = { ...base, lignes: [{ montant: 100000n, tauxTva: '19', compteId: 601 }], timbre: 1000n };
  assert.doesNotThrow(() => P.ecritureDeFacture({ ...args, ttcAttendu: 120000n }));
  assert.throws(() => P.ecritureDeFacture({ ...args, ttcAttendu: 120001n }), (e) => e.code === 'ECART_TTC' && /120,000/.test(e.message) && /120,001/.test(e.message));
});

test('ecritureDeFacture : TVA non récupérable (forfait, non assujetti) dans les lignes, au millime ; aucun code de TVA', () => {
  const { lignes } = P.ecritureDeFacture({
    ...base, tvaRecuperable: false, ttcAttendu: 136334n,
    lignes: [{ montant: 33333n, tauxTva: '19', compteId: 601 }, { montant: 33334n, tauxTva: '19', compteId: 607 }, { montant: 50000n, tauxTva: '12', compteId: 601 }],
    tvaParTaux: new Map([['19', 12667n], ['12', 6000n]]), timbre: 1000n,
  });
  // 19 % : 6,333 + 6,333 = 12,666 → 1 millime ajouté à la plus grande part (à égalité : la première) ; 12 % sans code : accepté (non
  // récupérable). TTC : 116,667 + 18,667 + 1 = 136,334 ; les deux lignes du 601 (sans code) regroupées.
  assert.deepStrictEqual(lignes.map((l) => [l.compteId, l.taxeId, l.debit, l.credit]), [
    [601, null, 39667n + 56000n, 0n],
    [607, null, 39667n, 0n],
    [6654, 60, 1000n, 0n],
    [4011, null, 0n, 136334n],
  ]);
  assert.ok(!lignes.some((l) => l.compteId === 43666), 'pas de TVA déductible');
});

test('ecritureDeFacture : ligne sans taux connu (prix TTC seul) sans code de TVA', () => {
  const { lignes } = P.ecritureDeFacture({ ...base, lignes: [{ montant: 11900n, tauxTva: null, compteId: 601 }, { montant: 10000n, tauxTva: '19', compteId: 601 }] });
  assert.deepStrictEqual(lignes.map((l) => [l.compteId, l.taxeId, l.debit, l.credit]), [[601, null, 11900n, 0n], [601, 19, 10000n, 0n], [43666, 19, 1900n, 0n], [4011, null, 0n, 23800n]]);
});

test('ajusterAuPlusGrand : l\'écart d\'arrondi va au plus grand montant (en valeur absolue)', () => {
  assert.deepStrictEqual(P.ajusterAuPlusGrand([100n, -300n, 200n], 2n), [100n, -298n, 200n]);
  assert.deepStrictEqual(P.ajusterAuPlusGrand([100n], 0n), [100n]);
  assert.deepStrictEqual(P.ajusterAuPlusGrand([], 5n), []);
});

test('identifiantMF : les 7 chiffres du matricule fiscal, quelle que soit la forme', () => {
  assert.strictEqual(P.identifiantMF('1234567A/A/M/000'), '1234567');
  assert.strictEqual(P.identifiantMF('1234567 a'), '1234567');
  assert.strictEqual(P.identifiantMF('MF : 1234567/A/M/000'), '1234567');
  assert.strictEqual(P.identifiantMF('ABC'), 'ABC');
  assert.strictEqual(P.identifiantMF(''), null);
});
