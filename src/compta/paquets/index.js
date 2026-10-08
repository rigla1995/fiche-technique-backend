// LabFlow Compta, étape S5a « Le paquet Tunisie et le plan de comptes » (labflow-reprise/achats-compta/PLAN-S5.md §1,
// §3.7, §4 ; CADRAGE §7 : tout ce qui dépend du pays est une DONNÉE d'un « paquet pays », jamais du code). Un paquet =
// un fichier JSON versionné et relu (Tunisie : tn-nc01.json, nomenclature de la norme NC 01, 3ᵉ partie, tirée du PDF
// officiel de l'OECT), chargé en base par une migration (212 : compta.ref_paquets, compta.ref_plans) dont les VALUES sont
// produites par `sqlValeursPlan` — test/comptaS5a.test.js vérifie que la migration et le fichier disent la même chose.
// Ce module ne touche pas à la base : il lit, contrôle et transcrit.
const PAQUETS = { TN: require('./tn-nc01.json') };

// Nature d'un compte (liste fermée, réponse du client du 07/10 — PLAN-S5 §1) : informative dans l'arbre, et décisive aux
// étapes suivantes (S5b : un journal de banque ou de caisse pointe un compte de nature banque ou caisse ; S5c : le compte
// collectif d'un tiers est de nature fournisseurs ou clients). Héritée du parent à la subdivision.
const NATURES_LIBELLES = {
  general: 'Général',
  capitaux: 'Capitaux et passifs non courants',
  immobilisations: 'Immobilisations',
  stocks: 'Stocks',
  fournisseurs: 'Fournisseurs',
  clients: 'Clients',
  personnel: 'Personnel',
  etat: 'État',
  retenues_operees: 'Retenues à la source opérées',
  retenues_subies: 'Retenues à la source subies',
  tva_a_payer: 'TVA à payer',
  tva_deductible: 'TVA déductible',
  tva_collectee: 'TVA collectée',
  banque: 'Banque',
  caisse: 'Caisse',
  charges: 'Charges',
  produits: 'Produits',
};
const NATURES = Object.keys(NATURES_LIBELLES);
// Numéro d'un compte : chiffres seulement, 2 à 8 (réponse 3 du client du 07/10 : la norme va à 6, deux de marge).
const NUMERO_MIN = 2;
const NUMERO_MAX = 8;
const RE_NUMERO = /^\d{2,8}$/;
const LIBELLE_MAX = 255;
const NOTE_MAX = 500;

// Le paquet d'un pays (le seul pour l'instant : TN), ou null.
const paquetDe = (pays) => PAQUETS[String(pays || '').toUpperCase()] || null;

// Parent d'un numéro parmi un ensemble de numéros : son plus long préfixe présent (2 chiffres au moins), sinon null.
const parentParmi = (numero, numeros) => {
  for (let k = numero.length - 1; k >= NUMERO_MIN; k--) {
    const p = numero.slice(0, k);
    if (numeros.has(p)) return p;
  }
  return null;
};

// Contrôle d'un paquet (test et outillage) : liste des défauts, vide si tout va bien.
const controlerPaquet = (p) => {
  const defauts = [];
  if (!p || typeof p !== 'object') return ['paquet absent'];
  if (!/^[A-Z]{2}$/.test(p.pays || '')) defauts.push('pays : deux lettres majuscules attendues');
  if (!/^\d{4}\.\d{1,2}$/.test(p.version || '')) defauts.push('version : « AAAA.N » attendu');
  if (!p.libelle || !p.source) defauts.push('libellé et source obligatoires');
  if (!Array.isArray(p.comptes) || !p.comptes.length) return [...defauts, 'comptes : liste vide'];
  const numeros = new Set();
  for (const c of p.comptes) {
    if (!RE_NUMERO.test(c.numero || '')) defauts.push(`${c.numero} : numéro de ${NUMERO_MIN} à ${NUMERO_MAX} chiffres`);
    if (numeros.has(c.numero)) defauts.push(`${c.numero} : en double`);
    numeros.add(c.numero);
    if (typeof c.libelle !== 'string' || !c.libelle.trim() || c.libelle.length > LIBELLE_MAX) defauts.push(`${c.numero} : libellé vide ou trop long`);
    if (c.libelle !== (c.libelle || '').replace(/\s+/g, ' ').trim()) defauts.push(`${c.numero} : espaces en trop dans le libellé`);
    // Point final (sauf abréviation « C.C.P. »), point en milieu de libellé, appel de note, apostrophe courbe : refusés.
    if ((/\.$/.test(c.libelle || '') && !/\b[A-Z]\.[A-Z]\.[A-Z]\.$/.test(c.libelle)) || /\.\s|\[|\]|[’‘]/.test(c.libelle || '')) defauts.push(`${c.numero} : point, appel de note ou apostrophe courbe dans le libellé`);
    if (!NATURES.includes(c.nature)) defauts.push(`${c.numero} : nature inconnue « ${c.nature} »`);
    if (c.note != null && (typeof c.note !== 'string' || !c.note.trim() || c.note.length > NOTE_MAX)) defauts.push(`${c.numero} : note vide ou trop longue`);
    const classe = Number((c.numero || '')[0]);
    if (!(classe >= 1 && classe <= 7)) defauts.push(`${c.numero} : classe hors 1 à 7`);
  }
  for (const c of p.comptes) {
    if (c.numero.length > NUMERO_MIN && !parentParmi(c.numero, numeros)) defauts.push(`${c.numero} : aucun parent dans le paquet`);
  }
  const tries = [...numeros].sort();
  if (p.comptes.some((c, i) => c.numero !== tries[i])) defauts.push('comptes : à trier par numéro');
  return defauts;
};

// Transcription SQL d'une valeur texte (ou NULL).
const sqlTexte = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
// Les lignes VALUES de compta.ref_plans pour la migration : (numero, libelle, nature, parent, note), une par ligne, dans
// l'ordre du fichier. Le parent est le plus long préfixe présent dans le paquet (calculé ici, jamais saisi à la main).
const sqlValeursPlan = (p) => {
  const numeros = new Set(p.comptes.map((c) => c.numero));
  return p.comptes
    .map((c) => `  (${sqlTexte(c.numero)}, ${sqlTexte(c.libelle)}, ${sqlTexte(c.nature)}, ${sqlTexte(parentParmi(c.numero, numeros))}, ${sqlTexte(c.note ?? null)})`)
    .join(',\n');
};

module.exports = { PAQUETS, NATURES, NATURES_LIBELLES, NUMERO_MIN, NUMERO_MAX, RE_NUMERO, LIBELLE_MAX, NOTE_MAX, paquetDe, parentParmi, controlerPaquet, sqlTexte, sqlValeursPlan };
