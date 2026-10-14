// LabFlow Compta, étape X2 « La clôture de l'exercice » (labflow-reprise/achats-compta/PLAN-EXERCICES.md §2 ligne X2, §3,
// §5 ; réponses du client du 13/10 — « ok pour les 5 » : exercice clos DÉFINITIF, soldes repris par des à-nouveaux écrits,
// affectation du résultat préparée en brouillard). Les règles PURES de la clôture, partagées par la route (cloture.js), la
// fiche du dossier et les tests ; module SANS DÉPENDANCE (ni base, ni autre module de Compta : modèle exercicesCalcul.js).
// Montants en MILLIMES ENTIERS (BigInt : jamais de flottant) ; textes NUMERIC à 3 décimales. Dates « AAAA-MM-JJ ».
//   • les CONTRÔLES avant la clôture (NC 01 §38 à §43, §54 à §61) : plus rien en brouillard, les mois clos sauf le dernier
//     (la clôture le clôt), balance équilibrée, comptes collectifs détaillés par tiers, exercice précédent clos (dans
//     l'ordre), exercice suivant ouvert (il reçoit les à-nouveaux), journaux OD et AN actifs, compte du résultat imputable ;
//   • le RÉSULTAT de l'exercice : produits − charges (positif = bénéfice, négatif = perte), sur les écritures validées ;
//   • l'écriture de DÉTERMINATION DU RÉSULTAT (journal OD, dernier jour de l'exercice) : chaque compte de charges ou de
//     produits soldé, contrepartie au compte du résultat — 131 bénéficiaire (crédit) ou 135 déficitaire (débit) ;
//   • l'écriture d'À-NOUVEAUX (journal AN, premier jour de l'exercice suivant) : chaque compte de bilan repris pour son solde
//     de fin — après l'écriture de résultat : les classes 6 et 7 sont à zéro, le 131 / 135 porte le résultat en attente
//     d'affectation —, par tiers sur les comptes collectifs (le détail par tiers de l'exercice suivant repart juste) ;
//   • l'AFFECTATION du résultat (formulaire, brouillard dans l'exercice suivant) : réserve légale, réserves, report à
//     nouveau, dividendes, compte de l'exploitant… contre le 131 (débit, bénéfice) ou le 135 (crédit, perte).
const NATURES_GESTION = ['charges', 'produits'];
const RE_MONTANT = /^-?\d{1,15}(\.\d{1,3})?$/;

// « -12.500 » → -12500n ; « 650 » → 650000n (texte NUMERIC(18,3) lu en base, ou montant saisi au point).
const versMillimes = (t) => {
  if (typeof t === 'bigint') return t;
  const s = String(t == null ? '0' : t).trim();
  if (!RE_MONTANT.test(s)) throw new Error(`Montant illisible : ${s}`);
  const neg = s.startsWith('-');
  const [entier, decimales = ''] = (neg ? s.slice(1) : s).split('.');
  const n = BigInt(entier) * 1000n + BigInt(`${decimales}000`.slice(0, 3));
  return neg ? -n : n;
};
// -12500n → « -12.500 » (texte NUMERIC à 3 décimales, signé).
const texteMillimes = (n) => {
  const neg = n < 0n;
  const a = neg ? -n : n;
  return `${neg ? '-' : ''}${a / 1000n}.${String(a % 1000n).padStart(3, '0')}`;
};
// -1234500n → « -1 234,500 » (affichage).
const fmtMillimes = (n) => {
  const neg = n < 0n;
  const a = neg ? -n : n;
  const entier = String(a / 1000n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${entier},${String(a % 1000n).padStart(3, '0')}`;
};
const fmtJour = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—');
const libelleMois = (debut) => new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${debut}T00:00:00Z`));
const pluriel = (n, un, des) => `${n} ${n > 1 ? des : un}`;

// Un exercice se clôture quand il est ouvert et FINI (sa date de fin est passée).
const peutCloturer = (x, aujourdhui) => x.etat === 'ouvert' && x.fin < aujourdhui;

// Le compte du résultat du paquet : bénéficiaire (131) pour un bénéfice ou un résultat nul, déficitaire (135) pour une perte.
const numeroCompteResultat = (cloture, resultat) => {
  const c = cloture || { beneficiaire: '131', deficitaire: '135' };
  return resultat < 0n ? c.deficitaire : c.beneficiaire;
};

const compteDe = (r) => ({ id: r.compteId, numero: r.numero, libelle: r.libelle, nature: r.nature });
const parNumero = (a, b) => (a.compte.numero < b.compte.numero ? -1 : a.compte.numero > b.compte.numero ? 1 : 0);
const parNumeroTiers = (a, b) => parNumero(a, b) || ((a.tiers?.code || '') < (b.tiers?.code || '') ? -1 : (a.tiers?.code || '') > (b.tiers?.code || '') ? 1 : 0);
const ligne = (compte, tiers, debit, credit) => ({ compte: { id: compte.id, numero: compte.numero, libelle: compte.libelle }, tiers: tiers ? { id: tiers.id, code: tiers.code, nom: tiers.nom } : null, debit, credit });
const total = (lignes) => lignes.reduce((t, l) => t + l.debit, 0n);

// Le résultat des soldes d'un exercice (`rows` : par compte et par tiers — { compteId, numero, libelle, nature, tiersId,
// tiersCode, tiersNom, solde (débit − crédit, texte ou millimes) }) : { charges, produits, resultat } en millimes ;
// résultat = produits − charges (positif = bénéfice).
const resultatDe = (rows) => {
  let charges = 0n;
  let produits = 0n;
  for (const r of rows) {
    if (r.nature === 'charges') charges += versMillimes(r.solde);
    else if (r.nature === 'produits') produits -= versMillimes(r.solde);
  }
  return { charges, produits, resultat: produits - charges };
};

// Le plan de la clôture d'après les soldes de l'exercice (écritures validées) et le compte du résultat (null : résultat nul,
// ou compte absent — les lignes de contrepartie manquent alors, ce que les contrôles refusent) :
// { charges, produits, resultat, benefice, lignesResultat, totalResultat, lignesAN, totalAN } — lignes { compte, tiers,
// debit, credit } en millimes, dans l'ordre des numéros (puis des codes de tiers).
const planCloture = (rows, compteResultat) => {
  const gestion = new Map();
  const bilan = new Map();
  for (const r of rows) {
    const s = versMillimes(r.solde);
    if (NATURES_GESTION.includes(r.nature)) {
      const g = gestion.get(r.compteId) || { compte: compteDe(r), solde: 0n };
      g.solde += s;
      gestion.set(r.compteId, g);
    } else {
      const cle = `${r.compteId}/${r.tiersId ?? ''}`;
      const b = bilan.get(cle) || { compte: compteDe(r), tiers: r.tiersId ? { id: r.tiersId, code: r.tiersCode, nom: r.tiersNom } : null, solde: 0n };
      b.solde += s;
      bilan.set(cle, b);
    }
  }
  const { charges, produits, resultat } = resultatDe(rows);
  // Détermination du résultat : chaque compte de gestion soldé (un solde débiteur se crédite), contrepartie au 131 / 135.
  const lignesResultat = [];
  for (const g of [...gestion.values()].sort(parNumero)) if (g.solde !== 0n) lignesResultat.push(ligne(g.compte, null, g.solde < 0n ? -g.solde : 0n, g.solde > 0n ? g.solde : 0n));
  if (resultat !== 0n && compteResultat) {
    lignesResultat.push(ligne(compteResultat, null, resultat < 0n ? -resultat : 0n, resultat > 0n ? resultat : 0n));
    // Les à-nouveaux reprennent le bilan APRÈS cette écriture : le compte du résultat porte le résultat (crédit = bénéfice).
    const cle = `${compteResultat.id}/`;
    const b = bilan.get(cle) || { compte: compteResultat, tiers: null, solde: 0n };
    b.solde -= resultat;
    bilan.set(cle, b);
  }
  const lignesAN = [];
  for (const b of [...bilan.values()].sort(parNumeroTiers)) if (b.solde !== 0n) lignesAN.push(ligne(b.compte, b.tiers, b.solde > 0n ? b.solde : 0n, b.solde < 0n ? -b.solde : 0n));
  return { charges, produits, resultat, benefice: resultat > 0n, lignesResultat, totalResultat: total(lignesResultat), lignesAN, totalAN: total(lignesAN) };
};

// Les contrôles de la clôture, d'après les faits lus en base : [{ code, libelle, ok, detail }] — `detail` dit quoi faire
// quand le contrôle échoue. `f` : { brouillard (nombre), periodes ([{ debut, fin, etat }], dans l'ordre), desequilibre
// (millimes, débits − crédits validés), lignesSansTiers (nombre), precedent ({ millesime, etat } | null), suivant ({ millesime,
// etat } | null), journalOD ({ code } | null : actif seulement), journalAN (idem), resultat (millimes), numeroResultat,
// compteResultat ({ numero, actif, feuille } | null) }.
const controlesDe = (f) => {
  const ouvertes = (f.periodes || []).slice(0, -1).filter((p) => p.etat === 'ouverte');
  const k = f.compteResultat;
  const compteOk = f.resultat === 0n || !!(k && k.actif && k.feuille);
  return [
    {
      code: 'brouillard', libelle: 'Toutes les écritures de l\'exercice sont validées', ok: f.brouillard === 0,
      detail: f.brouillard ? `${pluriel(f.brouillard, 'écriture en brouillard', 'écritures en brouillard')} : validez-les ou supprimez-les (page Écritures)` : '',
    },
    {
      code: 'periodes', libelle: 'Les périodes sont closes (la dernière peut rester ouverte : la clôture la clôt)', ok: ouvertes.length === 0,
      detail: ouvertes.length ? `${pluriel(ouvertes.length, 'période encore ouverte', 'périodes encore ouvertes')} : ${ouvertes.map((p) => libelleMois(p.debut)).join(', ')} (page Périodes)` : '',
    },
    {
      code: 'equilibre', libelle: 'La balance est équilibrée (débits = crédits)', ok: f.desequilibre === 0n,
      detail: f.desequilibre !== 0n ? `Écart de ${fmtMillimes(f.desequilibre)} entre les débits et les crédits validés` : '',
    },
    {
      code: 'tiers', libelle: 'Les comptes collectifs (fournisseurs, clients) sont détaillés par tiers', ok: f.lignesSansTiers === 0,
      detail: f.lignesSansTiers ? `${pluriel(f.lignesSansTiers, 'ligne validée', 'lignes validées')} sur un compte collectif sans tiers` : '',
    },
    {
      code: 'precedent', libelle: 'L\'exercice précédent est clos', ok: !f.precedent || f.precedent.etat === 'clos',
      detail: f.precedent && f.precedent.etat !== 'clos' ? `Clôturez d'abord l'exercice ${f.precedent.millesime} : les exercices se clôturent dans l'ordre` : '',
    },
    {
      code: 'suivant', libelle: 'L\'exercice suivant est ouvert (il reçoit les à-nouveaux)', ok: !!f.suivant && f.suivant.etat === 'ouvert',
      detail: !f.suivant ? 'Ouvrez l\'exercice suivant depuis la fiche du dossier (carte Exercices)' : f.suivant.etat !== 'ouvert' ? `L'exercice suivant (${f.suivant.millesime}) est clos` : '',
    },
    {
      code: 'journalOD', libelle: 'Un journal d\'opérations diverses est actif (écriture de résultat)', ok: !!f.journalOD,
      detail: f.journalOD ? '' : 'Créez ou réactivez un journal de type Opérations diverses (page Journaux)',
    },
    {
      code: 'journalAN', libelle: 'Le journal d\'à-nouveaux est actif', ok: !!f.journalAN,
      detail: f.journalAN ? '' : 'Créez ou réactivez le journal de type À-nouveaux (page Journaux)',
    },
    {
      code: 'compteResultat', libelle: `Le compte du résultat (${f.numeroResultat}) est imputable`, ok: compteOk,
      detail: compteOk ? '' : !k ? `Le compte ${f.numeroResultat} manque au plan du dossier (page Plan de comptes)` : !k.actif ? `Le compte ${k.numero} est désactivé (page Plan de comptes)` : `Le compte ${k.numero} a des sous-comptes actifs : la clôture impute le compte lui-même`,
    },
  ];
};

// Les lignes de l'écriture d'affectation du résultat : `parts` ([{ compte, montant }], montants en millimes, somme égale à
// |résultat|) contre le compte du résultat — un bénéfice (131 au crédit depuis les à-nouveaux) se débite, les parts se
// créditent ; une perte (135 au débit) se crédite, les parts se débitent (report à nouveau déficitaire, compte de
// l'exploitant). → [{ compte, tiers: null, debit, credit }].
const lignesAffectation = (resultat, compteResultat, parts) => {
  const benefice = resultat > 0n;
  const montant = benefice ? resultat : -resultat;
  const lignes = [];
  if (benefice) lignes.push(ligne(compteResultat, null, montant, 0n));
  for (const p of parts) lignes.push(ligne(p.compte, null, benefice ? 0n : p.montant, benefice ? p.montant : 0n));
  if (!benefice) lignes.push(ligne(compteResultat, null, 0n, montant));
  return lignes;
};

module.exports = {
  NATURES_GESTION, versMillimes, texteMillimes, fmtMillimes, fmtJour, libelleMois, pluriel,
  peutCloturer, numeroCompteResultat, resultatDe, planCloture, controlesDe, lignesAffectation,
};
