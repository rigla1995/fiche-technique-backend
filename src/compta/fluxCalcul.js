// LabFlow Compta, étape E2 « Les flux de trésorerie, les notes et le jeu complet » (labflow-reprise/achats-compta/
// PLAN-ETATS-FINANCIERS.md §2 ligne E2 ; réponse 3 du client du 14/10 : méthode indirecte, annexe 5 de la NC 01). Les
// règles PURES de l'état des flux de trésorerie, bâties sur etatsCalcul.js (plus long préfixe, montants en millimes) :
//   • la TRÉSORERIE : les comptes listés par le paquet (banques, caisses, régies, concours bancaires courants), de leur
//     solde d'ouverture (à-nouveaux, report provisoire) à leur solde de fin ;
//   • chaque autre compte des classes 1 à 5 alimente UNE ligne par son plus long préfixe et un mode : « variation »
//     (crédit − débit des mouvements de l'exercice, hors à-nouveaux : l'inverse de la variation du solde ; avec « sens »,
//     le compte va à la ligne de son solde de fin, débiteur ou créditeur, sinon de son solde d'ouverture), « debits » (les
//     débits, en moins : décaissements) et « credits » (les crédits, en plus : encaissements) ;
//   • le RÉSULTAT NET (classes 6 et 7) est donné par l'état de résultat ;
//   • la partition est EXACTE (partie double) : la somme des flux égale la variation de trésorerie dès que tout compte est
//     rattaché — c'est le contrôle ; un compte que rien ne couvre est « sans poste » ;
//   • les lignes à zéro sur les deux exercices ne se présentent pas ; les totaux, toujours.
const { versMillimes, texteMillimes, fmtMillimes, candidats, CLASSES_GESTION } = require('./etatsCalcul');

const MODES = ['variation', 'debits', 'credits'];
// Les entrées (préfixe → ligne, mode, sens) d'un bloc `flux` du paquet, trésorerie comprise (mode « tresorerie »).
const indexerFlux = (flux) => {
  const entrees = [];
  for (const prefixe of (flux.tresorerie && flux.tresorerie.comptes) || []) entrees.push({ prefixe, mode: 'tresorerie', ligne: null, sens: null });
  for (const l of flux.lignes || []) for (const part of l.parts || []) for (const prefixe of part.comptes || []) entrees.push({ prefixe, mode: part.mode, ligne: l.code, sens: part.sens || null });
  return entrees;
};
// Les modes qu'un compte rencontre à son plus long préfixe sont-ils une partition exacte ? (trésorerie seule ; variation
// seule ; variation débit + variation crédit ; débits + crédits ; chacun une fois.)
const partitionValide = (liste) => {
  if (!liste.length) return false;
  const cles = liste.map((e) => `${e.mode}${e.sens ? ':' + e.sens : ''}`).sort();
  const texte = cles.join(',');
  return new Set(cles).size === cles.length && ['tresorerie', 'variation', 'variation:credit,variation:debit', 'credits,debits'].includes(texte);
};

// La ventilation des mouvements d'un exercice : `mouvements` = [{ compteId, numero, libelle, ouverture, debit, credit }]
// (BigInt ou texte signé ; ouverture = solde d'ouverture signé, débit et crédit = mouvements hors à-nouveaux).
// → { parLigne: Map(code → Map(compteId → { compte, montant })), sansPoste, tresorerie: { debut, fin } }.
const m = (v) => (typeof v === 'bigint' ? v : versMillimes(v));
const ventilerFlux = (entrees, mouvements) => {
  const parLigne = new Map();
  const sansPoste = [];
  let debut = 0n;
  let fin = 0n;
  const ajouter = (code, compte, montant) => {
    if (!parLigne.has(code)) parLigne.set(code, new Map());
    const carte = parLigne.get(code);
    const x = carte.get(compte.id);
    if (x) x.montant += montant; else carte.set(compte.id, { compte, montant });
  };
  for (const r of mouvements) {
    if (CLASSES_GESTION.includes(r.numero[0])) continue;
    const ouverture = m(r.ouverture);
    const debit = m(r.debit);
    const credit = m(r.credit);
    if (ouverture === 0n && debit === 0n && credit === 0n) continue;
    const cloture = ouverture + debit - credit;
    const liste = candidats(entrees, r.numero);
    if (!partitionValide(liste)) { sansPoste.push({ id: r.compteId, numero: r.numero, libelle: r.libelle, variation: credit - debit }); continue; }
    if (liste[0].mode === 'tresorerie') { debut += ouverture; fin += cloture; continue; }
    const compte = { id: r.compteId, numero: r.numero, libelle: r.libelle };
    const cote = cloture !== 0n ? (cloture > 0n ? 'debit' : 'credit') : ouverture > 0n ? 'debit' : 'credit';
    for (const e of liste) {
      let montant;
      if (e.mode === 'variation') {
        if (e.sens && e.sens !== cote) continue;
        montant = credit - debit;
      } else montant = e.mode === 'debits' ? -debit : credit;
      if (montant !== 0n) ajouter(e.ligne, compte, montant);
    }
  }
  return { parLigne, sansPoste, tresorerie: { debut, fin } };
};

// L'état des flux (annexe 5) d'un exercice et de son précédent. `resultat` : { n, n1 } (BigInt) de l'état de résultat.
// → { lignes, tresorerie: { libelle, debut, fin, variation }, controle, sansPoste }.
const t = texteMillimes;
const parNumero = (a, b) => (a.numero < b.numero ? -1 : a.numero > b.numero ? 1 : 0);
const calculerFlux = (flux, { mouvementsN, mouvementsN1 = null, resultat, millesime, millesimePrecedent = null }) => {
  const entrees = indexerFlux(flux);
  const vN = ventilerFlux(entrees, mouvementsN);
  const vN1 = mouvementsN1 ? ventilerFlux(entrees, mouvementsN1) : null;
  const colonnes = (code) => {
    const n = vN.parLigne.get(code) || new Map();
    const n1 = vN1 ? vN1.parLigne.get(code) || new Map() : new Map();
    const ids = new Set([...n.keys(), ...n1.keys()]);
    const comptes = [...ids].map((id) => { const a = n.get(id); const b = n1.get(id); const c = (a || b).compte; return { id, numero: c.numero, libelle: c.libelle, n: a ? a.montant : 0n, n1: b ? b.montant : 0n }; }).sort(parNumero);
    return { comptes, n: comptes.reduce((s, c) => s + c.n, 0n), n1: comptes.reduce((s, c) => s + c.n1, 0n) };
  };
  const valeurs = new Map();
  const lignes = [];
  const tres = { debut: { n: vN.tresorerie.debut, n1: vN1 ? vN1.tresorerie.debut : 0n }, fin: { n: vN.tresorerie.fin, n1: vN1 ? vN1.tresorerie.fin : 0n } };
  for (const l of flux.lignes) {
    if (l.titre) { lignes.push({ titre: l.titre }); continue; }
    if (l.calcul === 'resultat') { valeurs.set(l.code, { n: resultat.n, n1: resultat.n1 }); lignes.push({ code: l.code, libelle: l.libelle, calcul: l.calcul, n: t(resultat.n), n1: t(resultat.n1) }); continue; }
    if (l.calcul === 'total') {
      const n = l.de.reduce((s, code) => s + ((valeurs.get(code) || {}).n || 0n), 0n);
      const n1 = l.de.reduce((s, code) => s + ((valeurs.get(code) || {}).n1 || 0n), 0n);
      valeurs.set(l.code, { n, n1 });
      lignes.push({ code: l.code, libelle: l.libelle, calcul: 'total', n: t(n), n1: t(n1) });
      continue;
    }
    if (l.calcul === 'tresorerieDebut' || l.calcul === 'tresorerieFin') {
      const v = l.calcul === 'tresorerieDebut' ? tres.debut : tres.fin;
      valeurs.set(l.code, v);
      lignes.push({ code: l.code, libelle: l.libelle, calcul: l.calcul, n: t(v.n), n1: t(v.n1) });
      continue;
    }
    const c = colonnes(l.code);
    valeurs.set(l.code, { n: c.n, n1: c.n1 });
    if (c.n === 0n && c.n1 === 0n) continue;
    lignes.push({ code: l.code, libelle: l.libelle, n: t(c.n), n1: t(c.n1), comptes: c.comptes.map((x) => ({ id: x.id, numero: x.numero, libelle: x.libelle, n: t(x.n), n1: t(x.n1) })) });
  }
  const variation = valeurs.get('variationTresorerie') || { n: 0n, n1: 0n };
  const ecarts = [];
  if (variation.n !== tres.fin.n - tres.debut.n) ecarts.push(`exercice ${millesime} : somme des flux ${fmtMillimes(variation.n)}, trésorerie de ${fmtMillimes(tres.debut.n)} à ${fmtMillimes(tres.fin.n)}`);
  if (vN1 && variation.n1 !== tres.fin.n1 - tres.debut.n1) ecarts.push(`exercice ${millesimePrecedent} : somme des flux ${fmtMillimes(variation.n1)}, trésorerie de ${fmtMillimes(tres.debut.n1)} à ${fmtMillimes(tres.fin.n1)}`);
  const sans = [...vN.sansPoste.map((x) => ({ ...x, millesime })), ...(vN1 ? vN1.sansPoste.map((x) => ({ ...x, millesime: millesimePrecedent })) : [])];
  const controle = {
    code: 'flux', libelle: 'Flux de trésorerie bouclés', ok: !ecarts.length && !sans.length,
    detail: ecarts.length || sans.length
      ? `${[...ecarts, ...sans.map((x) => `${x.numero} ${x.libelle} sans ligne de flux (${x.millesime})`)].join(' ; ')} — un compte hors nomenclature, ou une écriture déséquilibrée`
      : `Somme des flux = variation de trésorerie (${fmtMillimes(variation.n)} : de ${fmtMillimes(tres.debut.n)} à ${fmtMillimes(tres.fin.n)})`,
  };
  return {
    lignes,
    tresorerie: { libelle: flux.tresorerie.libelle, debut: { n: t(tres.debut.n), n1: t(tres.debut.n1) }, fin: { n: t(tres.fin.n), n1: t(tres.fin.n1) }, variation: { n: t(tres.fin.n - tres.debut.n), n1: t(tres.fin.n1 - tres.debut.n1) } },
    controle,
    sansPoste: vN.sansPoste.map((x) => ({ id: x.id, numero: x.numero, libelle: x.libelle, variation: t(x.variation) })),
  };
};

module.exports = { MODES, indexerFlux, partitionValide, ventilerFlux, calculerFlux };
