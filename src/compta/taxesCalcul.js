// LabFlow Compta, étape S7b « TVA, retenues et certificats » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne S7b, §2
// « S7b », §4 « TVA », « Retenues », « Seuil des retenues sur achats » ; réponses du client du 09/10 — « ok pour les 9 » :
// date de paiement des retenues = celle du règlement lettré, sinon celle de la facture, modifiable avant de produire ;
// recherche-fiscale-tunisie.md §1.4 — TVA exigible aux débits —, §1.5, §3.1, §3.4, §3.6). Les règles de l'état de TVA d'un
// mois et des retenues opérées, partagées par la page « Taxes du mois » (taxesMois.js), la production des certificats
// (certificats.js) et la fiche du dossier (configDossier.js : carte Taxes) ; module SANS DÉPENDANCE (ni base, ni autre
// module de Compta) pour que la fiche le lise sans cycle de chargement (modèle : echeances.js). Montants en millimes
// entiers (BigInt), jamais de flottant ; sommes SQL transportées en texte.
//   • ÉTAT DE TVA (exigibilité aux débits : la période de l'écriture) : collectée = lignes codées sur un compte de nature
//     « TVA collectée » ; déductible = lignes codées sur un compte « TVA déductible » (sur immobilisations : le compte
//     « immobilisations » du code), hors retenues de TVA ; retenues de TVA subies (RSTVA25) = lignes du code sur son compte
//     « à la vente », qui viennent en moins ; non récupérable (TVANDR) et bases hors taxes = informatifs ; crédit reporté =
//     crédit du mois précédent (premier mois : à-nouveaux du compte de crédit de TVA, donnée du paquet) ; résultat =
//     collectée − déductible − retenues subies − crédit reporté (positif : TVA à payer ; négatif : crédit à reporter). Les
//     lignes de TVA sans code (liquidation, régularisation) ne comptent pas : elles sont signalées. Les à-nouveaux n'entrent
//     jamais dans les mouvements.
//   • RETENUES OPÉRÉES : lignes des codes « retenue » et « retenue de TVA » passées sur le compte « à l'achat » du code (432),
//     hors contre-passations et écritures contre-passées ; une opération par pièce (le bénéficiaire = son seul fournisseur ;
//     TTC hors timbre, TVA, HT = TTC − TVA ; retenue ; retenue de TVA en taxe additionnelle ; net servi = TTC − retenues) ;
//     un PAIEMENT = un bénéficiaire et une date (règlement lettré, sinon facture) : il donne un certificat.
const NATURES_TVA = ['tva_deductible', 'tva_collectee', 'tva_a_payer'];
const TYPES_HORS_TTC = ['timbre', 'retenue', 'retenue_tva', 'avance'];
const NATURES_COLLECTIVES = ['fournisseurs', 'clients'];
const NATURES_BASE_ACHAT = ['charges', 'immobilisations', 'stocks'];

// ── Millimes ────────────────────────────────────────────────────────────────────────────────────────────────────────
// « 1234.500 » ou « -12.500 » (NUMERIC lu en base) → millimes signés ; jamais de flottant.
const millimes = (t) => {
  const s = String(t ?? '0').trim();
  const neg = s.startsWith('-');
  const [e, d = ''] = (neg ? s.slice(1) : s).split('.');
  const v = BigInt(e || '0') * 1000n + BigInt((d + '000').slice(0, 3));
  return neg ? -v : v;
};
const texte = (n) => { const a = n < 0n ? -n : n; return `${n < 0n ? '-' : ''}${a / 1000n}.${String(a % 1000n).padStart(3, '0')}`; };
const zero = (n) => (n < 0n ? 0n : n);

// ── État de TVA ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Par période de l'exercice et par code ($1 dossier, $2 exercice, $3 brouillard compris) : collectée, déductible (biens et
// services, immobilisations), retenue de TVA subie, non récupérable, bases hors taxes (ventes, achats), lignes en brouillard.
const somme = (expr, cond) => `COALESCE(SUM(${expr}) FILTER (WHERE ${cond}), 0)::numeric(18,3)::text`;
const SQL_COMPTES_DU_CODE = 'l.compte_id IN (COALESCE(x.compte_achat_id, 0), COALESCE(x.compte_vente_id, 0), COALESCE(x.compte_immo_id, 0))';
const SQL_TVA_PAR_PERIODE = `
  SELECT e.periode_id, x.id AS taxe_id, x.code, x.libelle, x.type, x.taux::text AS taux,
         ${somme('l.credit - l.debit', "k.nature = 'tva_collectee'")} AS collectee,
         ${somme('l.debit - l.credit', "k.nature = 'tva_deductible' AND x.type <> 'retenue_tva' AND NOT (x.type = 'tva' AND l.compte_id = x.compte_immo_id)")} AS deductible,
         ${somme('l.debit - l.credit', "k.nature = 'tva_deductible' AND x.type = 'tva' AND l.compte_id = x.compte_immo_id")} AS deductible_immo,
         ${somme('l.debit - l.credit', "x.type = 'retenue_tva' AND l.compte_id = x.compte_vente_id")} AS retenue_subie,
         ${somme('l.debit - l.credit', "x.type = 'tva' AND l.compte_id = x.compte_achat_id AND k.nature = 'charges'")} AS non_recuperable,
         ${somme('l.credit - l.debit', `x.type = 'tva' AND NOT (${SQL_COMPTES_DU_CODE}) AND k.nature = 'produits'`)} AS base_vente,
         ${somme('l.debit - l.credit', `x.type = 'tva' AND NOT (${SQL_COMPTES_DU_CODE}) AND k.nature IN ('charges', 'immobilisations', 'stocks')`)} AS base_achat,
         COUNT(*) FILTER (WHERE e.etat = 'brouillard')::int AS nb_brouillard
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.journaux j ON j.id = e.journal_id
    JOIN compta.comptes k ON k.id = l.compte_id
    JOIN compta.taxes x ON x.id = l.taxe_id AND x.type IN ('tva', 'retenue_tva')
   WHERE l.dossier_id = $1 AND e.exercice_id = $2 AND j.type <> 'an' AND ($3::boolean OR e.etat = 'validee')
   GROUP BY e.periode_id, x.id
   ORDER BY e.periode_id, x.type, x.taux DESC NULLS LAST, x.id`;
// Les lignes de TVA sans code de taxe ($1 dossier, $2 exercice, $3 brouillard compris), par période : liquidation,
// régularisation, saisie sans code — elles ne comptent pas dans l'état (signalées).
const SQL_TVA_SANS_CODE = `
  SELECT e.periode_id, COUNT(*)::int AS nb,
         ${somme('l.credit - l.debit', "k.nature = 'tva_collectee'")} AS collectee,
         ${somme('l.debit - l.credit', "k.nature = 'tva_deductible'")} AS deductible
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.journaux j ON j.id = e.journal_id
    JOIN compta.comptes k ON k.id = l.compte_id
   WHERE l.dossier_id = $1 AND e.exercice_id = $2 AND j.type <> 'an' AND l.taxe_id IS NULL AND k.nature IN ('tva_collectee', 'tva_deductible') AND ($3::boolean OR e.etat = 'validee')
   GROUP BY e.periode_id`;
// Le crédit de TVA à l'ouverture de l'exercice ($1 dossier, $2 exercice, $3 numéro du compte de crédit — et ses
// sous-comptes —, $4 brouillard compris) : solde débiteur des à-nouveaux.
const SQL_CREDIT_OUVERTURE = `
  SELECT COALESCE(SUM(l.debit - l.credit), 0)::numeric(18,3)::text AS credit
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.journaux j ON j.id = e.journal_id
    JOIN compta.comptes k ON k.id = l.compte_id
   WHERE l.dossier_id = $1 AND e.exercice_id = $2 AND j.type = 'an' AND LEFT(k.numero, LENGTH($3::text)) = $3::text AND ($4::boolean OR e.etat = 'validee')`;

// L'état de TVA de chaque période d'un exercice, de la première à `jusqua` (identifiant, null = toutes), avec le report du
// crédit d'un mois sur l'autre. `periodes` : celles de l'exercice dans l'ordre ; `rangees` : SQL_TVA_PAR_PERIODE ;
// `sansCode` : SQL_TVA_SANS_CODE ; `ouverture` : crédit à l'ouverture (texte). → [{ periodeId, codes, totaux… }] (texte).
const etatsTva = ({ periodes, rangees, sansCode = [], ouverture = '0', jusqua = null }) => {
  const res = [];
  let report = zero(millimes(ouverture));
  for (const p of periodes) {
    const codes = rangees.filter((r) => r.periode_id === p.id);
    const s = (cle) => codes.reduce((t, r) => t + millimes(r[cle]), 0n);
    const collectee = s('collectee');
    const deductibleBs = s('deductible');
    const deductibleImmo = s('deductible_immo');
    const retenuesSubies = s('retenue_subie');
    const deductible = deductibleBs + deductibleImmo;
    const resultat = collectee - deductible - retenuesSubies - report;
    const sc = sansCode.find((r) => r.periode_id === p.id);
    res.push({
      periodeId: p.id, debut: p.debut, fin: p.fin, etat: p.etat,
      codes: codes.map((r) => ({
        id: r.taxe_id, code: r.code, libelle: r.libelle, type: r.type, taux: r.taux,
        collectee: r.collectee, deductible: r.deductible, deductibleImmo: r.deductible_immo, retenueSubie: r.retenue_subie, nonRecuperable: r.non_recuperable,
        baseVente: r.base_vente, baseAchat: r.base_achat, nbBrouillard: r.nb_brouillard,
      })),
      collectee: texte(collectee), deductibleBs: texte(deductibleBs), deductibleImmo: texte(deductibleImmo), deductible: texte(deductible),
      retenuesSubies: texte(retenuesSubies), nonRecuperable: texte(s('non_recuperable')), creditReporte: texte(report),
      resultat: texte(resultat), aPayer: texte(zero(resultat)), creditAReporter: texte(zero(-resultat)),
      nbBrouillard: codes.reduce((t, r) => t + r.nb_brouillard, 0),
      sansCode: sc ? { nb: sc.nb, collectee: sc.collectee, deductible: sc.deductible } : { nb: 0, collectee: '0.000', deductible: '0.000' },
    });
    report = zero(-resultat);
    if (jusqua != null && p.id === jusqua) break;
  }
  return res;
};

// ── Retenues opérées ────────────────────────────────────────────────────────────────────────────────────────────────
// Les écritures ($1 dossier) qui portent une retenue OPÉRÉE (code « retenue » ou « retenue de TVA » sur son compte à
// l'achat) dont aucune ligne n'est encore dans un certificat actif, hors contre-passations et écritures contre-passées.
// `$2` : identifiants d'écritures (NULL = toutes). Bornées ($3).
const SQL_EXCLUSIONS_CP = `e.origine <> 'contrepassation'
     AND NOT EXISTS (SELECT 1 FROM compta.ecritures c WHERE c.origine_id = e.id AND c.origine = 'contrepassation' AND c.dossier_id = e.dossier_id)`;
const SQL_ECRITURES_A_RETENUE = `
  SELECT DISTINCT e.id
    FROM compta.lignes l
    JOIN compta.taxes x ON x.id = l.taxe_id AND x.type IN ('retenue', 'retenue_tva')
    JOIN compta.ecritures e ON e.id = l.ecriture_id
   WHERE l.dossier_id = $1 AND l.compte_id = x.compte_achat_id AND ($2::int[] IS NULL OR e.id = ANY($2))
     AND ${SQL_EXCLUSIONS_CP}
     AND NOT EXISTS (SELECT 1 FROM compta.certificat_lignes cl WHERE cl.ligne_id = l.id AND cl.actif)
   ORDER BY e.id
   LIMIT $3`;
// Toutes les lignes de ces écritures ($1 dossier, $2 écritures), avec ce que le calcul d'une opération lit.
const SQL_LIGNES_DES_PIECES = `
  SELECT l.id, l.ecriture_id, l.tiers_id, l.debit::text AS debit, l.credit::text AS credit, l.lettrage_id, l.compte_id,
         k.numero AS compte_numero, k.nature,
         x.id AS taxe_id, x.code AS taxe_code, x.libelle AS taxe_libelle, x.type AS taxe_type, x.taux::text AS taxe_taux, x.code_tej,
         x.compte_achat_id, x.compte_vente_id, x.compte_immo_id,
         e.date::text AS date, e.date_reelle::text AS date_reelle, e.etat, e.reference, e.libelle AS ecriture_libelle, e.numero, e.numero_provisoire, e.periode_id,
         j.code AS journal_code, j.type AS journal_type
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.journaux j ON j.id = e.journal_id
    JOIN compta.comptes k ON k.id = l.compte_id
    LEFT JOIN compta.taxes x ON x.id = l.taxe_id
   WHERE l.dossier_id = $1 AND l.ecriture_id = ANY($2)
   ORDER BY l.ecriture_id, l.rang`;
// Les lignes des lettres ($1 dossier, $2 lettres) : les règlements lettrés avec les factures.
const SQL_LIGNES_DES_LETTRES = `
  SELECT l.lettrage_id, l.ecriture_id, l.date::text AS date, l.debit::text AS debit, l.credit::text AS credit
    FROM compta.lignes l
   WHERE l.dossier_id = $1 AND l.lettrage_id = ANY($2)`;
// Nombre de lignes de retenue opérée VALIDÉES qui attendent leur certificat ($1 dossier) : la carte Taxes de la fiche.
const SQL_NB_A_PRODUIRE = `
  SELECT COUNT(DISTINCT e.id)::int AS n
    FROM compta.lignes l
    JOIN compta.taxes x ON x.id = l.taxe_id AND x.type = 'retenue'
    JOIN compta.ecritures e ON e.id = l.ecriture_id
   WHERE l.dossier_id = $1 AND l.compte_id = x.compte_achat_id AND e.etat = 'validee'
     AND ${SQL_EXCLUSIONS_CP}
     AND NOT EXISTS (SELECT 1 FROM compta.certificat_lignes cl WHERE cl.ligne_id = l.id AND cl.actif)`;

const annee = (iso) => Number(String(iso).slice(0, 4));
// Une opération par pièce (écriture) : → { ecritureId, …, tiersId (ou null), dateFacture, montants (texte), probleme }.
// `lignes` : SQL_LIGNES_DES_PIECES d'une seule écriture ; `lettres` : Map lettrage → lignes (SQL_LIGNES_DES_LETTRES).
// Problèmes qui empêchent le certificat : aucun ou plusieurs fournisseurs dans la pièce, plusieurs codes de retenue, une
// retenue de TVA sans retenue à la source (rare : à déclarer à la main), code sans code d'opération TEJ.
const operationDe = (lignes, lettres = new Map()) => {
  const e = lignes[0];
  const retenues = lignes.filter((l) => l.taxe_type === 'retenue' && l.compte_id === l.compte_achat_id);
  const retenuesTva = lignes.filter((l) => l.taxe_type === 'retenue_tva' && l.compte_id === l.compte_achat_id);
  const fournisseurs = [...new Set(lignes.filter((l) => l.nature === 'fournisseurs' && l.tiers_id).map((l) => l.tiers_id))];
  let ttc = 0n;
  let tva = 0n;
  const taux = new Map();
  for (const l of lignes) {
    if (NATURES_COLLECTIVES.includes(l.nature)) continue;
    if (l.taxe_type && TYPES_HORS_TTC.includes(l.taxe_type)) continue;
    const m = millimes(l.debit) - millimes(l.credit);
    ttc += m;
    const ligneTva = (l.taxe_type === 'tva' && [l.compte_achat_id, l.compte_vente_id, l.compte_immo_id].includes(l.compte_id)) || (!l.taxe_id && NATURES_TVA.includes(l.nature));
    if (ligneTva) {
      tva += m;
      if (l.taxe_type === 'tva' && l.taxe_taux != null) taux.set(l.taxe_taux, (taux.get(l.taxe_taux) || 0n) + m);
    }
  }
  const rs = retenues.reduce((t, l) => t + millimes(l.credit) - millimes(l.debit), 0n);
  const rsTva = retenuesTva.reduce((t, l) => t + millimes(l.credit) - millimes(l.debit), 0n);
  const codes = [...new Set(retenues.map((l) => l.taxe_id))];
  const premiere = retenues[0] || null;
  const tvaCode = retenuesTva[0] || null;
  // Le taux de TVA : celui des lignes de TVA de la pièce ; plusieurs : le plus lourd (signalé).
  const tauxTries = [...taux.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  // La date du paiement : les lignes du fournisseur dans la pièce, toutes lettrées ⇒ la date la plus récente des lignes de
  // ces lettres prises AILLEURS au débit (les règlements) ; sinon la date de la facture (sa vraie date si elle en a une).
  const lignesTiers = lignes.filter((l) => l.nature === 'fournisseurs' && fournisseurs.length === 1 && l.tiers_id === fournisseurs[0]);
  let dateReglement = null;
  if (lignesTiers.length && lignesTiers.every((l) => l.lettrage_id)) {
    for (const l of lignesTiers) {
      for (const r of lettres.get(l.lettrage_id) || []) {
        if (r.ecriture_id === e.ecriture_id || millimes(r.debit) <= 0n) continue;
        if (!dateReglement || r.date > dateReglement) dateReglement = r.date;
      }
    }
  }
  const dateFacture = e.date_reelle || e.date;
  let probleme = null;
  if (fournisseurs.length !== 1) probleme = { code: 'BENEFICIAIRE', message: fournisseurs.length ? 'Plusieurs fournisseurs dans la pièce : un certificat ne vise qu\'un bénéficiaire' : 'Aucun fournisseur dans la pièce (ligne du compte collectif) : bénéficiaire inconnu' };
  else if (!retenues.length) probleme = { code: 'RETENUE_TVA_SEULE', message: 'Retenue de TVA sans retenue à la source : à déclarer à la main sur la plateforme TEJ' };
  else if (codes.length > 1) probleme = { code: 'PLUSIEURS_CODES', message: 'Plusieurs codes de retenue dans la même pièce : séparez-les en deux pièces' };
  else if (!premiere.code_tej) probleme = { code: 'CODE_TEJ', message: `Le code ${premiere.taxe_code} n'a pas de code d'opération TEJ (page Taxes)` };
  else if (rs <= 0n) probleme = { code: 'RETENUE_NULLE', message: 'Retenue nulle ou négative dans la pièce' };
  return {
    ecritureId: e.ecriture_id, etat: e.etat, numero: e.numero, numeroProvisoire: e.numero_provisoire, reference: e.reference, libelle: e.ecriture_libelle,
    journal: e.journal_code, dateFacture, anneeFacturation: annee(dateFacture), periodeId: e.periode_id,
    tiersId: fournisseurs.length === 1 ? fournisseurs[0] : null,
    code: premiere ? premiere.taxe_code : (tvaCode ? tvaCode.taxe_code : null), taxeId: premiere ? premiere.taxe_id : null, libelleCode: premiere ? premiere.taxe_libelle : null,
    codeTej: premiere ? premiere.code_tej : null, tauxRs: premiere ? premiere.taxe_taux : null,
    tauxTva: tauxTries.length ? tauxTries[0][0] : null, plusieursTaux: tauxTries.length > 1,
    ht: texte(ttc - tva), tva: texte(tva), ttc: texte(ttc), rs: texte(rs),
    rsTva: tvaCode ? { code: tvaCode.code_tej || tvaCode.taxe_code, taux: tvaCode.taxe_taux, montant: texte(rsTva) } : null,
    net: texte(ttc - rs - rsTva),
    lignes: [...retenues, ...retenuesTva].map((l) => l.id),
    dateProposee: dateReglement || dateFacture, sourceDate: dateReglement ? 'reglement' : 'facture',
    probleme,
  };
};
// Les opérations groupées en PAIEMENTS (un bénéficiaire, une date) : → [{ tiersId, date, sourceDate, operations, totaux }],
// triés par date puis bénéficiaire. Seules les opérations validées et sans problème y entrent.
const paiementsDe = (operations) => {
  const parCle = new Map();
  for (const o of operations) {
    if (o.etat !== 'validee' || o.probleme) continue;
    const cle = `${o.tiersId}|${o.dateProposee}`;
    if (!parCle.has(cle)) parCle.set(cle, { cle, tiersId: o.tiersId, date: o.dateProposee, sourceDate: o.sourceDate, operations: [] });
    const p = parCle.get(cle);
    if (o.sourceDate !== p.sourceDate) p.sourceDate = 'reglement';
    p.operations.push(o);
  }
  return [...parCle.values()].map((p) => ({ ...p, totaux: totauxDe(p.operations) })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.tiersId - b.tiersId));
};
const totauxDe = (operations) => {
  const s = (cle) => operations.reduce((t, o) => t + millimes(o[cle]), 0n);
  const taxes = operations.reduce((t, o) => t + (o.rsTva ? millimes(o.rsTva.montant) : 0n), 0n);
  return { ht: texte(s('ht')), tva: texte(s('tva')), ttc: texte(s('ttc')), rs: texte(s('rs')), taxes: texte(taxes), net: texte(s('net')) };
};
// Le seuil des retenues sur achats (1 000 D TTC par paiement, donnée du paquet) : les opérations de la famille « achats »
// d'un paiement dont le TTC cumulé est sous le seuil (la retenue n'était pas due) → message, sinon null.
const sousLeSeuil = (paiement, famille, seuil) => {
  const ops = paiement.operations.filter((o) => famille.includes(o.code));
  if (!ops.length || !seuil) return null;
  const ttc = ops.reduce((t, o) => t + millimes(o.ttc), 0n);
  return ttc < millimes(seuil) ? texte(ttc) : null;
};

module.exports = {
  NATURES_TVA, TYPES_HORS_TTC, NATURES_BASE_ACHAT, millimes, texte, zero,
  SQL_TVA_PAR_PERIODE, SQL_TVA_SANS_CODE, SQL_CREDIT_OUVERTURE, etatsTva,
  SQL_EXCLUSIONS_CP, SQL_ECRITURES_A_RETENUE, SQL_LIGNES_DES_PIECES, SQL_LIGNES_DES_LETTRES, SQL_NB_A_PRODUIRE,
  operationDe, paiementsDe, totauxDe, sousLeSeuil,
};
