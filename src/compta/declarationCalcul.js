// LabFlow Compta, étape S7c « Déclaration mensuelle » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne S7c, §2 « S7c »,
// §4 « TCL », « Déclaration mensuelle », « Droits » ; réponses du client du 09/10 — « ok pour les 9 » : état préparatoire à
// recopier, salaires à la main, écriture de TVA proposée ; question 7 : pas de vente à l'export pour l'instant ;
// recherche-fiscale-tunisie.md §2, §3.3, §3.5). Les règles de la déclaration mensuelle, partagées par la page
// (declarations.js) et la fiche du dossier (configDossier.js : carte Taxes) ; module SANS DÉPENDANCE hors taxesCalcul.js
// (lui-même sans dépendance) : la fiche le lit sans cycle de chargement. Montants en millimes entiers (BigInt).
//   • ÉCHÉANCE : au mois qui suit la période, le 15 (personne physique), le 20 (personne morale télédéclarante) ou le 28
//     (autre personne morale) — données du paquet — ; reportée au lundi quand elle tombe un samedi ou un dimanche.
//   • TCL : taux du paquet (0,2 %, 0,1 % pour un exportateur total) sur le chiffre d'affaires du mois (comptes du paquet :
//     70…), toutes taxes comprises si l'assiette du paquet l'est (TVA collectée du mois ajoutée) ; arrondi au millime.
//   • LIQUIDATION DE LA TVA : chaque compte de TVA du mois (lignes codées, comme l'état de TVA) se solde ; le crédit reporté
//     sort du compte du crédit ; le résultat va au compte de la TVA à payer, ou revient au compte du crédit (à reporter) —
//     une seule ligne nette sur le compte du crédit (relecture) ; sans solde de TVA dans le mois, rien à liquider.
const { millimes, texte } = require('./taxesCalcul');

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// « 2026-09-30 » → « septembre 2026 » ; « de septembre 2026 », « d'octobre 2026 ».
const libelleMois = (iso) => `${MOIS[Number(String(iso).slice(5, 7)) - 1]} ${String(iso).slice(0, 4)}`;
const deMois = (iso) => { const m = libelleMois(iso); return /^[aeiouyàâéèêh]/i.test(m) ? `d'${m}` : `de ${m}`; };
const iso = (dt) => dt.toISOString().slice(0, 10);

// L'échéance de la déclaration d'une période : → { date, jour, reportee } (date AAAA-MM-JJ). `regime` : { personne,
// teledeclaration } du dossier ; `fin` : dernier jour de la période ; `echeances` : { physique, moraleTeledeclaration, morale }.
const echeanceDe = (regime, fin, echeances) => {
  if (!echeances || !fin) return null;
  const jour = regime.personne === 'physique' ? echeances.physique : regime.teledeclaration ? echeances.moraleTeledeclaration : echeances.morale;
  const a = Number(fin.slice(0, 4));
  const m = Number(fin.slice(5, 7)); // le mois suivant (index 0) = m
  const dernier = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const dt = new Date(Date.UTC(a, m, Math.min(jour, dernier)));
  const legale = iso(dt);
  const j = dt.getUTCDay();
  if (j === 6) dt.setUTCDate(dt.getUTCDate() + 2);
  if (j === 0) dt.setUTCDate(dt.getUTCDate() + 1);
  return { date: iso(dt), legale, jour, reportee: iso(dt) !== legale };
};

// Taux « 0.200 » → 200n (millièmes de pour cent).
const milliemes = (taux) => {
  const [e, d = ''] = String(taux ?? '0').trim().split('.');
  return BigInt(e || '0') * 1000n + BigInt((d + '000').slice(0, 3));
};
// base × taux / 100, arrondi au millime le plus proche (demi vers le haut) ; base négative → 0.
const appliquerTaux = (base, taux) => (base <= 0n ? 0n : (base * milliemes(taux) + 50000n) / 100000n);

// La TCL du mois : → { ca, tvaCollectee, base, assiette, taux, montant } (texte). `ca` : chiffre d'affaires hors taxes du mois
// (crédit − débit des comptes du paquet) ; `tvaCollectee` : TVA collectée du mois (assiette TTC) ; `exportateur` : taux export.
const tclDe = ({ ca, tvaCollectee, tcl, exportateur = false }) => {
  if (!tcl) return null;
  const caM = millimes(ca);
  const tva = tcl.assiette === 'ttc' ? millimes(tvaCollectee) : 0n;
  const base = caM + tva;
  const taux = exportateur ? tcl.tauxExport : tcl.taux;
  return { ca: texte(caM), tvaCollectee: texte(tva), base: texte(base), assiette: tcl.assiette, taux, exportateur, montant: texte(appliquerTaux(base, taux)) };
};

// Les lignes de l'écriture de liquidation de la TVA d'une période. `comptes` : [{ compte_id, numero, nature, subie, solde }]
// (solde = débit − crédit des lignes de TVA codées du mois, par compte ; `subie` : rien que des retenues de TVA subies) ; `creditReporte`, `resultat` : de l'état de TVA (texte) ;
// `compteCredit`, `compteAPayer` : { id, numero } ; `mois` : fin de la période. → { lignes: [{ compteId, numero, libelle,
// debit, credit }] (BigInt), total, ecart } — `ecart` : la somme des soldes ne rejoint pas l'état (refus).
const lignesLiquidation = ({ comptes, collectee, deductible, retenuesSubies, creditReporte, resultat, compteCredit, compteAPayer, mois }) => {
  const m = deMois(mois);
  const lignes = [];
  let somme = 0n;
  for (const c of comptes) {
    const s = millimes(c.solde);
    if (s === 0n) continue;
    somme += s;
    const libelle = c.subie ? `Retenue de TVA subie ${m}` : c.nature === 'tva_collectee' ? `TVA collectée ${m}` : c.nature === 'tva_deductible' ? `TVA déductible ${m}` : `Retenue de TVA subie ${m}`;
    lignes.push({ compteId: c.compte_id, numero: c.numero, libelle, debit: s < 0n ? -s : 0n, credit: s > 0n ? s : 0n });
  }
  const attendu = -(millimes(collectee) - millimes(deductible) - millimes(retenuesSubies));
  const report = millimes(creditReporte);
  const r = millimes(resultat);
  if (!lignes.length) return { lignes: [], total: 0n, ecart: somme !== attendu };
  // Le compte du crédit : le crédit reporté en sort (crédit), le crédit à reporter y revient (débit) — en une ligne nette.
  const net = (r < 0n ? -r : 0n) - report;
  if (net !== 0n) {
    const libelle = report > 0n && r < 0n
      ? (net > 0n ? `Crédit de TVA à reporter ${m} (net du crédit reporté)` : `Crédit de TVA reporté imputé ${m} (net du crédit à reporter)`)
      : r < 0n ? `Crédit de TVA à reporter ${m}` : `Crédit de TVA reporté imputé ${m}`;
    lignes.push({ compteId: compteCredit.id, numero: compteCredit.numero, libelle, debit: net > 0n ? net : 0n, credit: net < 0n ? -net : 0n });
  }
  if (r > 0n) lignes.push({ compteId: compteAPayer.id, numero: compteAPayer.numero, libelle: `TVA à payer ${m}`, debit: 0n, credit: r });
  const debit = lignes.reduce((t, l) => t + l.debit, 0n);
  const credit = lignes.reduce((t, l) => t + l.credit, 0n);
  return { lignes, total: debit, ecart: somme !== attendu || debit !== credit };
};

// Le total à payer d'une déclaration (somme des lignes, texte) et la comparaison de deux états de lignes (déclaration figée
// au marquage / recalculée) : mêmes clés, mêmes montants.
const totalDe = (lignes) => texte(lignes.reduce((t, l) => t + millimes(l.montant), 0n));
const memesLignes = (a, b) => {
  const cle = (ls) => JSON.stringify((ls || []).filter((l) => millimes(l.montant) !== 0n).map((l) => [l.cle, texte(millimes(l.montant))]).sort());
  return cle(a) === cle(b);
};

module.exports = { MOIS, libelleMois, deMois, echeanceDe, milliemes, appliquerTaux, tclDe, lignesLiquidation, totalDe, memesLignes };
