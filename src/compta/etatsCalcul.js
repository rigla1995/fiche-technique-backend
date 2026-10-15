// LabFlow Compta, étape E1 « Le bilan et l'état de résultat » (labflow-reprise/achats-compta/PLAN-ETATS-FINANCIERS.md §2
// ligne E1, §3, §5 ; réponses du client du 14/10 — « ok pour les 5 » : état de résultat par nature (annexe 3), colonne N−1
// calculée, correspondance fixe du paquet). Les règles PURES des états financiers (NC 01, 1ʳᵉ partie et annexes 1 et 3),
// partagées par la page et le PDF (etats.js) ; module sans base, bâti sur clotureCalcul.js (montants en millimes, BigInt).
//   • la CORRESPONDANCE comptes → postes vient du bloc `etats` du paquet du pays : chaque poste (bilan) ou ligne (état de
//     résultat) porte des PRÉFIXES de numéro ; un compte suit son plus long préfixe ; au bilan, à préfixes de même longueur,
//     le « sens » tranche (un compte débiteur à l'actif, créditeur au passif : pas de compensation, §21) ; « moins » :
//     amortissements et provisions déduits sous leur poste ; un compte à solde que rien ne couvre est SANS POSTE (contrôle) ;
//   • les MONTANTS : actif = solde (débit − crédit), passif = crédit − débit, déduction « moins » = ce qu'elle retranche ;
//     état de résultat = crédit − débit (produits en plus, charges en moins) ; le RÉSULTAT de l'exercice (capitaux propres)
//     = la somme des lignes de l'état de résultat (classes 6 et 7), jamais le solde du 13 (résultats reportés) ;
//   • les POSTES À ZÉRO sur les deux exercices ne se présentent pas (§21) ; les totaux, toujours ;
//   • les CONTRÔLES : bilan équilibré (partie double, tout compte rattaché), résultat de l'état de résultat = résultat par
//     nature des comptes (= résultat figé à la clôture), aucun compte sans poste.
const { versMillimes, texteMillimes, fmtMillimes, fmtJour } = require('./clotureCalcul');

const NATURES_GESTION = ['charges', 'produits'];
const CLASSES_GESTION = ['6', '7'];
const COTES = ['actifs', 'passifs'];
const SIGNE = { actifs: 1n, passifs: -1n };
// Un montant d'état financier, à la manière des annexes : « 1 234,500 », négatif entre parenthèses « (1 234,500) ».
const fmtEtat = (n) => (n < 0n ? `(${fmtMillimes(-n)})` : fmtMillimes(n));

// ── L'index d'un bloc `etats` ───────────────────────────────────────────────────────────────────────────────────────
// Les entrées (préfixe → ligne) d'une liste de lignes à comptes (état de résultat ; E2 : soldes intermédiaires de gestion).
const indexerLignes = (lignes) => {
  const entrees = [];
  for (const l of lignes || []) if (l.comptes) for (const prefixe of l.comptes) entrees.push({ prefixe, ligne: l.code });
  return entrees;
};
// → { bilan: [{ prefixe, cote, poste, sens, moins }], resultat: [{ prefixe, ligne }] }.
const indexer = (etats) => {
  const bilan = [];
  for (const cote of COTES) {
    for (const g of etats.bilan[cote]) for (const r of g.rubriques) for (const p of r.postes) {
      if (p.calcul) continue;
      for (const prefixe of p.comptes || []) bilan.push({ prefixe, cote, poste: p.code, sens: p.sens || null, moins: false });
      for (const prefixe of (p.moins && p.moins.comptes) || []) bilan.push({ prefixe, cote, poste: p.code, sens: null, moins: true });
    }
  }
  return { bilan, resultat: indexerLignes(etats.resultat) };
};
// Les entrées au plus long préfixe de `numero`.
const candidats = (entrees, numero) => {
  let longueur = 0;
  let liste = [];
  for (const e of entrees) {
    if (!numero.startsWith(e.prefixe)) continue;
    if (e.prefixe.length > longueur) { longueur = e.prefixe.length; liste = [e]; } else if (e.prefixe.length === longueur) liste.push(e);
  }
  return liste;
};
// Le poste de bilan d'un compte pour son solde signé (≠ 0) : plus long préfixe, puis le sens du solde, sinon un poste sans
// sens ; null = sans poste.
const entreeBilan = (index, numero, solde) => {
  const liste = candidats(index.bilan, numero);
  if (!liste.length) return null;
  const sens = solde > 0n ? 'debit' : 'credit';
  return liste.find((e) => e.sens === sens) || liste.find((e) => e.sens === null) || null;
};
const entreeResultat = (index, numero) => candidats(index.resultat, numero)[0] || null;
const estGestion = (numero) => CLASSES_GESTION.includes(numero[0]);

// ── La ventilation des soldes d'un exercice ─────────────────────────────────────────────────────────────────────────
// `soldes` : [{ compteId, numero, libelle, nature, solde }] (solde signé débit − crédit, texte ou BigInt ; zéro ignoré).
// → { parPoste: Map(code ou code/moins → Map(compteId → { compte, montant })), parLigne: Map(code → …), sansPoste,
//    resultat (classes 6 et 7, crédit − débit), resultatNature (natures charges et produits) }.
const ajouter = (cartes, cle, compte, montant) => {
  if (!cartes.has(cle)) cartes.set(cle, new Map());
  const m = cartes.get(cle);
  const x = m.get(compte.id);
  if (x) x.montant += montant; else m.set(compte.id, { compte, montant });
};
const ventiler = (index, soldes) => {
  const parPoste = new Map();
  const parLigne = new Map();
  const sansPoste = [];
  let resultat = 0n;
  let resultatNature = 0n;
  for (const r of soldes) {
    const s = typeof r.solde === 'bigint' ? r.solde : versMillimes(r.solde);
    if (s === 0n) continue;
    const compte = { id: r.compteId, numero: r.numero, libelle: r.libelle };
    if (NATURES_GESTION.includes(r.nature)) resultatNature -= s;
    if (estGestion(r.numero)) {
      resultat -= s;
      const e = entreeResultat(index, r.numero);
      if (!e) sansPoste.push({ ...compte, solde: s });
      else ajouter(parLigne, e.ligne, compte, -s);
    } else {
      const e = entreeBilan(index, r.numero, s);
      if (!e) sansPoste.push({ ...compte, solde: s });
      else ajouter(parPoste, `${e.poste}${e.moins ? '/moins' : ''}`, compte, e.moins ? -SIGNE[e.cote] * s : SIGNE[e.cote] * s);
    }
  }
  return { parPoste, parLigne, sansPoste, resultat, resultatNature };
};

// ── Les deux états ──────────────────────────────────────────────────────────────────────────────────────────────────
const t = texteMillimes;
const parNumero = (a, b) => (a.numero < b.numero ? -1 : a.numero > b.numero ? 1 : 0);
// Les comptes d'un poste sur les deux exercices (N, N−1), par numéro : [{ id, numero, libelle, n, n1 }] et les totaux.
const colonnes = (vN, vN1, cartes, cle) => {
  const n = vN[cartes].get(cle) || new Map();
  const n1 = vN1 ? vN1[cartes].get(cle) || new Map() : new Map();
  const ids = new Set([...n.keys(), ...n1.keys()]);
  const comptes = [...ids].map((id) => {
    const a = n.get(id);
    const b = n1.get(id);
    const c = (a || b).compte;
    return { id, numero: c.numero, libelle: c.libelle, n: a ? a.montant : 0n, n1: b ? b.montant : 0n };
  }).sort(parNumero);
  return { comptes, n: comptes.reduce((s, c) => s + c.n, 0n), n1: comptes.reduce((s, c) => s + c.n1, 0n) };
};
const vide = (x) => x.n === 0n && x.n1 === 0n;
const presenterComptes = (comptes) => comptes.map((c) => ({ id: c.id, numero: c.numero, libelle: c.libelle, n: t(c.n), n1: t(c.n1) }));
const total = (libelle, n, n1) => (libelle ? { libelle, n: t(n), n1: t(n1) } : null);

// Le bilan (annexe 1) : les deux côtés, groupes → rubriques → postes (brut, moins, net), les totaux ; postes, rubriques et
// groupes à zéro sur les deux exercices omis ; les postes calculés (sous-total, résultat) toujours présents.
const bilanDe = (etats, vN, vN1, resultatN, resultatN1) => {
  const cotes = {};
  const totaux = {};
  for (const cote of COTES) {
    let cN = 0n;
    let cN1 = 0n;
    const groupes = [];
    for (const g of etats.bilan[cote]) {
      let gN = 0n;
      let gN1 = 0n;
      const rubriques = [];
      for (const r of g.rubriques) {
        let rN = 0n;
        let rN1 = 0n;
        const postes = [];
        for (const p of r.postes) {
          if (p.calcul === 'sousTotal') { postes.push({ code: p.code, libelle: p.libelle, calcul: p.calcul, n: t(rN), n1: t(rN1) }); continue; }
          if (p.calcul === 'resultat') {
            rN += resultatN; rN1 += resultatN1;
            postes.push({ code: p.code, libelle: p.libelle, calcul: p.calcul, n: t(resultatN), n1: t(resultatN1) });
            continue;
          }
          const brut = colonnes(vN, vN1, 'parPoste', p.code);
          const moins = p.moins ? colonnes(vN, vN1, 'parPoste', `${p.code}/moins`) : null;
          const netN = brut.n - (moins ? moins.n : 0n);
          const netN1 = brut.n1 - (moins ? moins.n1 : 0n);
          rN += netN; rN1 += netN1;
          if (vide(brut) && (!moins || vide(moins))) continue;
          postes.push({
            code: p.code, libelle: p.libelle, n: t(brut.n), n1: t(brut.n1), comptes: presenterComptes(brut.comptes),
            moins: moins && !vide(moins) ? { libelle: p.moins.libelle, n: t(moins.n), n1: t(moins.n1), comptes: presenterComptes(moins.comptes) } : null,
            net: { n: t(netN), n1: t(netN1) },
          });
        }
        gN += rN; gN1 += rN1;
        if (postes.length) rubriques.push({ code: r.code, libelle: r.libelle || null, postes, total: total(r.total, rN, rN1) });
      }
      cN += gN; cN1 += gN1;
      if (rubriques.length) groupes.push({ code: g.code, libelle: g.libelle, rubriques, total: total(g.total, gN, gN1) });
    }
    cotes[cote] = { groupes, total: total(cote === 'actifs' ? etats.bilan.totalActifs : etats.bilan.totalPassifs, cN, cN1) };
    totaux[cote] = { n: cN, n1: cN1 };
  }
  return { bilan: cotes, totaux };
};

// L'état de résultat (annexe 3) : titres, lignes (comptes) et totaux dans l'ordre du paquet ; lignes à zéro sur les deux
// exercices omises, titres et totaux toujours présents. → { lignes, valeurs: Map(code → { n, n1 }) }.
const resultatDe = (etats, vN, vN1) => {
  const valeurs = new Map();
  const lignes = [];
  for (const l of etats.resultat) {
    if (l.titre) { lignes.push({ titre: l.titre }); continue; }
    if (l.calcul === 'total') {
      const n = l.de.reduce((s, code) => s + ((valeurs.get(code) || {}).n || 0n), 0n);
      const n1 = l.de.reduce((s, code) => s + ((valeurs.get(code) || {}).n1 || 0n), 0n);
      valeurs.set(l.code, { n, n1 });
      lignes.push({ code: l.code, libelle: l.libelle, calcul: 'total', n: t(n), n1: t(n1) });
      continue;
    }
    const c = colonnes(vN, vN1, 'parLigne', l.code);
    valeurs.set(l.code, { n: c.n, n1: c.n1 });
    if (vide(c)) continue;
    lignes.push({ code: l.code, libelle: l.libelle, n: t(c.n), n1: t(c.n1), comptes: presenterComptes(c.comptes) });
  }
  return { lignes, valeurs };
};

// ── Les contrôles ───────────────────────────────────────────────────────────────────────────────────────────────────
const pluriel = (n, un, des) => `${n} ${n > 1 ? des : un}`;
const controlesDe = ({ totaux, vN, vN1, resultatFige, millesime, millesimePrecedent }) => {
  const c = [];
  const ecartN = totaux.actifs.n - totaux.passifs.n;
  const ecartN1 = totaux.actifs.n1 - totaux.passifs.n1;
  const desequilibres = [ecartN !== 0n ? `exercice ${millesime} : actifs ${fmtMillimes(totaux.actifs.n)}, capitaux propres et passifs ${fmtMillimes(totaux.passifs.n)}` : null, ecartN1 !== 0n ? `exercice ${millesimePrecedent} : actifs ${fmtMillimes(totaux.actifs.n1)}, capitaux propres et passifs ${fmtMillimes(totaux.passifs.n1)}` : null].filter(Boolean);
  c.push({
    code: 'equilibre', libelle: 'Bilan équilibré', ok: !desequilibres.length,
    detail: desequilibres.length ? `${desequilibres.join(' ; ')} — un compte sans poste, ou une écriture déséquilibrée` : `Total des actifs = total des capitaux propres et des passifs (${fmtMillimes(totaux.actifs.n)})`,
  });
  const ecarts = [];
  if (vN.resultat !== vN.resultatNature) ecarts.push(`exercice ${millesime} : état de résultat ${fmtMillimes(vN.resultat)}, comptes de charges et de produits ${fmtMillimes(vN.resultatNature)}`);
  if (resultatFige != null && vN.resultat !== resultatFige) ecarts.push(`exercice ${millesime} : état de résultat ${fmtMillimes(vN.resultat)}, résultat figé à la clôture ${fmtMillimes(resultatFige)}`);
  if (vN1 && vN1.resultat !== vN1.resultatNature) ecarts.push(`exercice ${millesimePrecedent} : état de résultat ${fmtMillimes(vN1.resultat)}, comptes de charges et de produits ${fmtMillimes(vN1.resultatNature)}`);
  c.push({
    code: 'resultat', libelle: 'Résultat cohérent', ok: !ecarts.length,
    detail: ecarts.length ? `${ecarts.join(' ; ')} — un compte de classe 6 ou 7 hors des natures charges et produits, ou l'inverse (page Plan de comptes)` : `Résultat de l'état de résultat = résultat du bilan = résultat des comptes (${fmtMillimes(vN.resultat)})${resultatFige != null ? ', figé à la clôture' : ''}`,
  });
  const sans = [...vN.sansPoste.map((x) => ({ ...x, millesime })), ...(vN1 ? vN1.sansPoste.map((x) => ({ ...x, millesime: millesimePrecedent })) : [])];
  c.push({
    code: 'sansPoste', libelle: 'Tous les comptes rattachés à un poste', ok: !sans.length,
    detail: sans.length
      ? `${pluriel(sans.length, 'compte à solde sans poste', 'comptes à solde sans poste')} : ${sans.map((x) => `${x.numero} ${x.libelle} (${fmtMillimes(x.solde)}, ${x.millesime})`).join(', ')} — remplacez-les par un compte de la nomenclature ou un de ses sous-comptes (page Plan de comptes)`
      : 'Chaque compte à solde a son poste du bilan ou sa ligne de l\'état de résultat',
  });
  return c;
};

// ── Les états d'un exercice ─────────────────────────────────────────────────────────────────────────────────────────
// `etats` : le bloc du paquet ; `soldesN` et `soldesN1` (null sans exercice précédent) : les soldes par compte ;
// `resultatFige` : le résultat figé à la clôture (BigInt), ou null. → { bilan, resultat, resultats: { n, n1 }, controles,
// sansPoste, pret (tous les contrôles au vert) }.
const calculerEtats = (etats, { soldesN, soldesN1 = null, resultatFige = null, millesime, millesimePrecedent = null }) => {
  const index = indexer(etats);
  const vN = ventiler(index, soldesN);
  const vN1 = soldesN1 ? ventiler(index, soldesN1) : null;
  const resultatN1 = vN1 ? vN1.resultat : 0n;
  const { bilan, totaux } = bilanDe(etats, vN, vN1, vN.resultat, resultatN1);
  const resultat = resultatDe(etats, vN, vN1);
  const controles = controlesDe({ totaux, vN, vN1, resultatFige, millesime, millesimePrecedent });
  // E2 : les soldes intermédiaires de gestion (annexe 8) — les mêmes soldes, ventilés sur les lignes du bloc `sig`.
  let sig = null;
  if (etats.sig) {
    const indexSig = { bilan: index.bilan, resultat: indexerLignes(etats.sig) };
    sig = { lignes: resultatDe({ resultat: etats.sig }, ventiler(indexSig, soldesN), soldesN1 ? ventiler(indexSig, soldesN1) : null).lignes };
  }
  return {
    bilan,
    resultat: { lignes: resultat.lignes, net: { n: t(vN.resultat), n1: t(resultatN1) } },
    resultats: { n: vN.resultat, n1: resultatN1 },
    sig,
    controles,
    pret: controles.every((c) => c.ok),
    sansPoste: vN.sansPoste.map((x) => ({ id: x.id, numero: x.numero, libelle: x.libelle, solde: t(x.solde) })),
  };
};

// La mention de l'arrêté (NC 01 §19) : exercice clos, ou situation provisoire.
const mentionArrete = (x, { brouillard = false, precedentOuvert = false } = {}) => {
  if (x.etat === 'clos' && !brouillard) return `Exercice clos le ${fmtJour(x.fin)}`;
  const motifs = [x.etat !== 'clos' ? 'exercice non clos' : null, brouillard ? 'brouillard compris' : null, precedentOuvert ? 'exercice précédent non clos' : null].filter(Boolean);
  return `Situation provisoire au ${fmtJour(x.fin)} (${motifs.join(', ')})`;
};

module.exports = {
  NATURES_GESTION, CLASSES_GESTION, COTES, fmtEtat, indexerLignes, indexer, candidats, entreeBilan, entreeResultat, ventiler, bilanDe, resultatDe, controlesDe, calculerEtats, mentionArrete,
  versMillimes, texteMillimes, fmtMillimes, fmtJour,
};
