// LabFlow Compta, étape S5a « Le paquet Tunisie et le plan de comptes » (labflow-reprise/achats-compta/PLAN-S5.md §1,
// §3.7, §4 ; CADRAGE §7 : tout ce qui dépend du pays est une DONNÉE d'un « paquet pays », jamais du code). Un paquet =
// un fichier JSON versionné et relu (Tunisie : tn-nc01.json, nomenclature de la norme NC 01, 3ᵉ partie, tirée du PDF
// officiel de l'OECT), chargé en base par une migration (212 : compta.ref_paquets, compta.ref_plans) dont les VALUES sont
// produites par `sqlValeursPlan` — test/comptaS5a.test.js vérifie que la migration et le fichier disent la même chose.
// S5b « Les journaux et les codes de taxe » (PLAN-S5 §5 ; réponses du client du 08/10) : le même fichier porte les
// journaux par défaut, les sous-comptes proposés (créés dans le plan d'un dossier quand un code de taxe copié les vise)
// et les codes de taxe — migration 213 (compta.ref_journaux, ref_sous_comptes, ref_taxes), VALUES produites ici aussi.
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

// ── S5b : journaux ──────────────────────────────────────────────────────────────────────────────────────────────────
// Types de journal (CADRAGE §3 : achats, ventes, banque — un par compte bancaire —, caisse, opérations diverses,
// à-nouveaux). Banque et caisse portent un compte de contrepartie de même nature ; un seul journal d'à-nouveaux par
// dossier (réponse 4 du client du 08/10 : les autres types s'ajoutent librement).
const TYPES_JOURNAUX_LIBELLES = {
  achats: 'Achats',
  ventes: 'Ventes',
  banque: 'Banque',
  caisse: 'Caisse',
  od: 'Opérations diverses',
  an: 'À-nouveaux',
};
const TYPES_JOURNAUX = Object.keys(TYPES_JOURNAUX_LIBELLES);
const TYPES_AVEC_COMPTE = ['banque', 'caisse'];
// Nature du compte de contrepartie exigée par type.
const NATURE_PAR_TYPE = { banque: 'banque', caisse: 'caisse' };
// Code d'un journal : 2 à 4 lettres majuscules ou chiffres, figé après création.
const CODE_JOURNAL_MAX = 4;
const RE_CODE_JOURNAL = /^[A-Z0-9]{2,4}$/;

// ── S5b : codes de taxe ─────────────────────────────────────────────────────────────────────────────────────────────
const TYPES_TAXES_LIBELLES = {
  tva: 'TVA',
  retenue: 'Retenue à la source',
  retenue_tva: 'Retenue de TVA',
  timbre: 'Droit de timbre',
  fodec: 'FODEC',
  avance: 'Avance',
  autre: 'Autre taxe',
};
const TYPES_TAXES = Object.keys(TYPES_TAXES_LIBELLES);
// Assiette : sur quoi le taux s'applique (recherche fiscale §3 : les retenues se calculent sur le TTC hors timbre ; la
// retenue de TVA sur le montant de la TVA ; le timbre est un montant fixe par facture).
const ASSIETTES_LIBELLES = {
  ht: 'Montant hors taxes',
  ttc: 'Montant TTC (hors timbre)',
  tva: 'Montant de la TVA',
  fixe: 'Montant fixe par facture',
};
const ASSIETTES = Object.keys(ASSIETTES_LIBELLES);
// Quels dossiers reçoivent le code à l'initialisation (selon le régime enregistré en S4 : PLAN-S5 §1 ligne S5b).
const COPIES_LIBELLES = {
  tous: 'Tous les régimes',
  assujetti: 'Régime réel de TVA',
  exportateur: 'Exportateur total',
  jamais: 'Sur demande',
};
const COPIES = Object.keys(COPIES_LIBELLES);
// Code d'un code de taxe : 2 à 12 lettres majuscules, chiffres ou « _ ».
const CODE_TAXE_MAX = 12;
const RE_CODE_TAXE = /^[A-Z0-9_]{2,12}$/;
// Taux (0 à 100 %, 3 décimales) et montant fixe (dinar à 3 décimales), toujours en texte (SPEC-SOCLE §0).
const RE_TAUX = /^\d{1,3}\.\d{3}$/;
const RE_MONTANT = /^\d{1,6}\.\d{3}$/;
const RE_CODE_TEJ = /^[A-Z0-9_]{1,20}$/;

// ── S5c : tiers ────────────────────────────────────────────────────────────────────────────────────────────────────
// Fournisseurs et clients d'un dossier (PLAN-S5 §4 ; réponses 4 et 5 du client du 07/10, « ok pour les 4 » du 08/10) :
// le compte collectif d'un tiers est de la nature de son type (fournisseurs, clients) ; code = préfixe (0 à 3 lettres ou
// chiffres) + numéro (3 à 7 chiffres), 10 caractères au plus, réglable par dossier ; régime de TVA du tiers ; délai de
// paiement en jours. Les comptes collectifs par défaut sont une DONNÉE du paquet (tiers.collectifs : 4011 / 4111).
const TYPES_TIERS_LIBELLES = { fournisseur: 'Fournisseur', client: 'Client' };
const TYPES_TIERS = Object.keys(TYPES_TIERS_LIBELLES);
const NATURE_PAR_TYPE_TIERS = { fournisseur: 'fournisseurs', client: 'clients' };
const REGIMES_TVA_TIERS_LIBELLES = { assujetti: 'Assujetti', non_assujetti: 'Non assujetti', exonere: 'Exonéré', suspension: 'En suspension de TVA' };
const REGIMES_TVA_TIERS = Object.keys(REGIMES_TVA_TIERS_LIBELLES);
const CODE_TIERS_MIN = 2;
const CODE_TIERS_MAX = 10;
const RE_CODE_TIERS = /^[A-Z0-9]{2,10}$/;
const PREFIXE_TIERS_MAX = 3;
const RE_PREFIXE_TIERS = /^[A-Z0-9]{0,3}$/;
const CHIFFRES_TIERS_MIN = 3;
const CHIFFRES_TIERS_MAX = 7;
const DELAI_PAIEMENT_MAX = 365;
// S7b : le régime fiscal d'un fournisseur (valeur d'une liste du paquet : fiscalite.regimesFiscaux) et l'identifiant de
// secours d'un bénéficiaire sans matricule fiscal (cahier des charges TEJ v2.0 : IdTaxpayer = matricule fiscal, CIN,
// passeport, carte de séjour ou autre identifiant ; les types 2 à 5 de la plateforme).
const RE_REGIME_FISCAL = /^[a-z0-9_]{2,20}$/;
const PERSONNES = ['morale', 'physique'];
const TYPES_IDENTIFIANT_LIBELLES = { cin: 'Carte d\'identité nationale', passeport: 'Passeport', carte_sejour: 'Carte de séjour', autre: 'Autre identifiant (non-résident)' };
const TYPES_IDENTIFIANT = Object.keys(TYPES_IDENTIFIANT_LIBELLES);
const RE_CODE_OPERATION_TEJ = /^RS\d{1,2}_\d{6}$/;

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

// Libellé propre : non vide, pas trop long, espaces simples, pas de point final (sauf abréviation « C.C.P. »), de point
// en milieu de libellé, d'appel de note ni d'apostrophe courbe.
const defautsLibelle = (l, strict = true) => {
  const d = [];
  if (typeof l !== 'string' || !l.trim() || l.length > LIBELLE_MAX) d.push('libellé vide ou trop long');
  else {
    if (l !== l.replace(/\s+/g, ' ').trim()) d.push('espaces en trop dans le libellé');
    if ((/\.$/.test(l) && !/\b[A-Z]\.[A-Z]\.[A-Z]\.$/.test(l)) || (strict && /\.\s/.test(l)) || /\[|\]|[’‘]/.test(l)) d.push('point, appel de note ou apostrophe courbe dans le libellé');
  }
  return d;
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
  const parNumero = new Map();
  for (const c of p.comptes) {
    if (!RE_NUMERO.test(c.numero || '')) defauts.push(`${c.numero} : numéro de ${NUMERO_MIN} à ${NUMERO_MAX} chiffres`);
    if (numeros.has(c.numero)) defauts.push(`${c.numero} : en double`);
    numeros.add(c.numero);
    parNumero.set(c.numero, c);
    for (const d of defautsLibelle(c.libelle)) defauts.push(`${c.numero} : ${d}`);
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

  // S5b : journaux, sous-comptes proposés, codes de taxe (facultatifs dans un paquet ; contrôlés s'ils sont là).
  const journaux = p.journaux || [];
  const sousComptes = p.sousComptes || [];
  const taxes = p.taxes || [];
  if (!Array.isArray(journaux) || !Array.isArray(sousComptes) || !Array.isArray(taxes)) return [...defauts, 'journaux, sousComptes et taxes : listes attendues'];
  const codesJournaux = new Set();
  for (const j of journaux) {
    const id = `journal ${j.code}`;
    if (!RE_CODE_JOURNAL.test(j.code || '')) defauts.push(`${id} : code de 2 à ${CODE_JOURNAL_MAX} lettres majuscules ou chiffres`);
    if (codesJournaux.has(j.code)) defauts.push(`${id} : en double`);
    codesJournaux.add(j.code);
    for (const d of defautsLibelle(j.libelle)) defauts.push(`${id} : ${d}`);
    if (!TYPES_JOURNAUX.includes(j.type)) defauts.push(`${id} : type inconnu « ${j.type} »`);
    if (TYPES_AVEC_COMPTE.includes(j.type)) {
      const c = parNumero.get(j.compte);
      if (!c) defauts.push(`${id} : compte de contrepartie absent du paquet`);
      else if (c.nature !== NATURE_PAR_TYPE[j.type]) defauts.push(`${id} : compte ${j.compte} de nature ${c.nature}, ${NATURE_PAR_TYPE[j.type]} attendue`);
    } else if (j.compte != null) defauts.push(`${id} : un journal ${j.type} n'a pas de compte de contrepartie`);
  }
  if (journaux.filter((j) => j.type === 'an').length > 1) defauts.push('journaux : un seul journal d\'à-nouveaux');
  const numerosProposes = new Set();
  for (const s of sousComptes) {
    const id = `sous-compte ${s.numero}`;
    if (!RE_NUMERO.test(s.numero || '')) defauts.push(`${id} : numéro de ${NUMERO_MIN} à ${NUMERO_MAX} chiffres`);
    if (numeros.has(s.numero)) defauts.push(`${id} : déjà dans la nomenclature`);
    if (numerosProposes.has(s.numero)) defauts.push(`${id} : en double`);
    numerosProposes.add(s.numero);
    if (!parentParmi(s.numero || '', numeros)) defauts.push(`${id} : aucun parent dans le paquet`);
    for (const d of defautsLibelle(s.libelle)) defauts.push(`${id} : ${d}`);
    if (!NATURES.includes(s.nature)) defauts.push(`${id} : nature inconnue « ${s.nature} »`);
    if (typeof s.explication !== 'string' || !s.explication.trim() || s.explication.length > NOTE_MAX) defauts.push(`${id} : explication obligatoire (${NOTE_MAX} caractères au plus)`);
  }
  const codesTaxes = new Set();
  const compteConnu = (n) => n == null || numeros.has(n) || numerosProposes.has(n);
  for (const t of taxes) {
    const id = `taxe ${t.code}`;
    if (!RE_CODE_TAXE.test(t.code || '')) defauts.push(`${id} : code de 2 à ${CODE_TAXE_MAX} lettres majuscules, chiffres ou _`);
    if (codesTaxes.has(t.code)) defauts.push(`${id} : en double`);
    codesTaxes.add(t.code);
    // Un libellé de taxe peut contenir une abréviation suivie d'un espace (« Art. 51 ») : contrôle non strict.
    for (const d of defautsLibelle(t.libelle, false)) defauts.push(`${id} : ${d}`);
    if (!TYPES_TAXES.includes(t.type)) defauts.push(`${id} : type inconnu « ${t.type} »`);
    if (!ASSIETTES.includes(t.assiette)) defauts.push(`${id} : assiette inconnue « ${t.assiette} »`);
    if (t.taux != null && !RE_TAUX.test(t.taux)) defauts.push(`${id} : taux « ${t.taux} » (texte à 3 décimales attendu)`);
    if (t.taux != null && Number(t.taux) > 100) defauts.push(`${id} : taux supérieur à 100 %`);
    if (t.montant != null && !RE_MONTANT.test(t.montant)) defauts.push(`${id} : montant « ${t.montant} » (texte à 3 décimales attendu)`);
    if ((t.assiette === 'fixe') !== (t.montant != null)) defauts.push(`${id} : un montant fixe va avec l'assiette « fixe », et seulement elle`);
    if (t.assiette === 'fixe' && t.taux != null) defauts.push(`${id} : un montant fixe n'a pas de taux`);
    for (const [cle, n] of [['achat', t.achat], ['vente', t.vente], ['immobilisations', t.immobilisations]]) {
      if (!compteConnu(n)) defauts.push(`${id} : compte ${cle} ${n} absent du paquet et des sous-comptes proposés`);
    }
    if (!COPIES.includes(t.copie)) defauts.push(`${id} : copie inconnue « ${t.copie} »`);
    if (t.codeTej != null && !RE_CODE_TEJ.test(t.codeTej)) defauts.push(`${id} : code TEJ « ${t.codeTej} »`);
    if (t.note != null && (typeof t.note !== 'string' || !t.note.trim() || t.note.length > NOTE_MAX)) defauts.push(`${id} : note vide ou trop longue`);
  }
  // Un sous-compte proposé doit servir à au moins un code (sinon il n'a pas lieu d'être).
  for (const s of sousComptes) {
    if (!taxes.some((t) => [t.achat, t.vente, t.immobilisations].includes(s.numero))) defauts.push(`sous-compte ${s.numero} : visé par aucun code de taxe`);
  }
  // S5c : comptes collectifs par défaut des tiers (facultatifs dans un paquet ; contrôlés s'ils sont là) : un compte du
  // paquet, de la nature du type (fournisseurs, clients).
  if (p.tiers != null) {
    const collectifs = (p.tiers && p.tiers.collectifs) || {};
    for (const type of TYPES_TIERS) {
      const c = parNumero.get(collectifs[type]);
      if (!c) defauts.push(`tiers : compte collectif par défaut des ${type}s absent du paquet`);
      else if (c.nature !== NATURE_PAR_TYPE_TIERS[type]) defauts.push(`tiers : compte collectif ${collectifs[type]} de nature ${c.nature}, ${NATURE_PAR_TYPE_TIERS[type]} attendue`);
    }
  }
  // S7b : la fiscalité (facultative dans un paquet ; contrôlée si elle est là) : régimes fiscaux des fournisseurs et codes de
  // retenue qu'ils proposent (des codes de retenue du paquet), familles, seuil des retenues sur achats, compte du crédit de
  // TVA, codes d'opération TEJ (ceux des codes du paquet en font partie).
  if (p.fiscalite != null) {
    const f = p.fiscalite || {};
    const retenue = (code) => taxes.find((t) => t.code === code && t.type === 'retenue');
    const valeurs = new Set();
    for (const r of f.regimesFiscaux || []) {
      const id = `régime fiscal ${r.valeur}`;
      if (!RE_REGIME_FISCAL.test(r.valeur || '')) defauts.push(`${id} : valeur de 2 à 20 minuscules, chiffres ou _`);
      if (valeurs.has(r.valeur)) defauts.push(`${id} : en double`);
      valeurs.add(r.valeur);
      for (const d of defautsLibelle(r.libelle, false)) defauts.push(`${id} : ${d}`);
      if (!PERSONNES.includes(r.personne)) defauts.push(`${id} : personne « ${r.personne} » (morale ou physique)`);
      for (const cle of ['achats', 'honoraires']) if (!retenue(r[cle])) defauts.push(`${id} : retenue ${cle} « ${r[cle]} » absente des codes de retenue du paquet`);
    }
    if (!(f.regimesFiscaux || []).length) defauts.push('fiscalité : aucun régime fiscal');
    for (const cle of ['achats', 'honoraires']) {
      const codes = (f.familles || {})[cle] || [];
      if (!codes.length) defauts.push(`fiscalité : famille ${cle} vide`);
      for (const c of codes) if (!retenue(c)) defauts.push(`fiscalité : famille ${cle}, code ${c} absent des codes de retenue du paquet`);
      for (const r of f.regimesFiscaux || []) if (r[cle] && !codes.includes(r[cle])) defauts.push(`régime fiscal ${r.valeur} : ${r[cle]} hors de la famille ${cle}`);
    }
    if (!RE_MONTANT.test(f.seuilAchats || '')) defauts.push('fiscalité : seuil des achats « 1000.000 » attendu (texte à 3 décimales)');
    if (!parNumero.get((f.tva || {}).compteCredit)) defauts.push('fiscalité : compte du crédit de TVA absent du paquet');
    const tej = f.tej || {};
    if (!tej.versionSchema || !tej.source) defauts.push('fiscalité : version du schéma TEJ et source obligatoires');
    const codesTej = new Set();
    for (const o of tej.codesOperations || []) {
      if (!RE_CODE_OPERATION_TEJ.test(o.code || '')) defauts.push(`code TEJ « ${o.code} » : forme RSn_00000n attendue`);
      if (codesTej.has(o.code)) defauts.push(`code TEJ ${o.code} : en double`);
      codesTej.add(o.code);
      for (const d of defautsLibelle(o.libelle, false)) defauts.push(`code TEJ ${o.code} : ${d}`);
    }
    for (const t of taxes) if (t.type === 'retenue' && t.codeTej && !codesTej.has(t.codeTej)) defauts.push(`taxe ${t.code} : code TEJ ${t.codeTej} absent de la liste des codes d'opération`);
    const codesTva = new Set((tej.codesTaxesAdditionnelles || []).map((o) => o.code));
    if (!codesTva.size) defauts.push('fiscalité : codes des taxes additionnelles TEJ (retenues de TVA) absents');
    for (const o of tej.codesTaxesAdditionnelles || []) for (const d of defautsLibelle(o.libelle, false)) defauts.push(`taxe additionnelle ${o.code} : ${d}`);
    for (const t of taxes) if (t.type === 'retenue_tva' && t.codeTej && !codesTva.has(t.codeTej)) defauts.push(`taxe ${t.code} : code TEJ ${t.codeTej} absent des taxes additionnelles`);
  }
  return defauts;
};
// S7b : la fiscalité d'un pays (régimes fiscaux, familles, seuil, crédit de TVA, TEJ), ou null.
const fiscaliteDe = (pays) => paquetDe(pays)?.fiscalite || null;
// Le régime fiscal d'un fournisseur (valeur de la liste du paquet), ou null.
const regimeFiscalDe = (pays, valeur) => (valeur ? (fiscaliteDe(pays)?.regimesFiscaux || []).find((r) => r.valeur === valeur) || null : null);

// Transcription SQL d'une valeur texte (ou NULL) et d'un nombre à 3 décimales transporté en texte (ou NULL).
const sqlTexte = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const sqlNombre = (v) => (v == null ? 'NULL' : String(v));
// Les lignes VALUES de compta.ref_plans pour la migration : (numero, libelle, nature, parent, note), une par ligne, dans
// l'ordre du fichier. Le parent est le plus long préfixe présent dans le paquet (calculé ici, jamais saisi à la main).
const sqlValeursPlan = (p) => {
  const numeros = new Set(p.comptes.map((c) => c.numero));
  return p.comptes
    .map((c) => `  (${sqlTexte(c.numero)}, ${sqlTexte(c.libelle)}, ${sqlTexte(c.nature)}, ${sqlTexte(parentParmi(c.numero, numeros))}, ${sqlTexte(c.note ?? null)})`)
    .join(',\n');
};
// S5b — compta.ref_journaux : (code, libelle, type, compte, ordre), l'ordre étant celui du fichier.
const sqlValeursJournaux = (p) => (p.journaux || [])
  .map((j, i) => `  (${sqlTexte(j.code)}, ${sqlTexte(j.libelle)}, ${sqlTexte(j.type)}, ${sqlTexte(j.compte ?? null)}, ${i + 1})`)
  .join(',\n');
// S5b — compta.ref_sous_comptes : (numero, libelle, nature, parent, explication), parent = plus long préfixe du paquet.
const sqlValeursSousComptes = (p) => {
  const numeros = new Set(p.comptes.map((c) => c.numero));
  return (p.sousComptes || [])
    .map((s) => `  (${sqlTexte(s.numero)}, ${sqlTexte(s.libelle)}, ${sqlTexte(s.nature)}, ${sqlTexte(parentParmi(s.numero, numeros))}, ${sqlTexte(s.explication)})`)
    .join(',\n');
};
// S5b — compta.ref_taxes : (code, libelle, type, taux, montant, assiette, achat, vente, immobilisations, copie, code_tej,
// note, ordre) ; taux et montant en littéraux numériques (NUMERIC), l'ordre étant celui du fichier.
const sqlValeursTaxes = (p) => (p.taxes || [])
  .map((t, i) => `  (${sqlTexte(t.code)}, ${sqlTexte(t.libelle)}, ${sqlTexte(t.type)}, ${sqlNombre(t.taux)}, ${sqlNombre(t.montant)}, ${sqlTexte(t.assiette)}, ${sqlTexte(t.achat ?? null)}, ${sqlTexte(t.vente ?? null)}, ${sqlTexte(t.immobilisations ?? null)}, ${sqlTexte(t.copie)}, ${sqlTexte(t.codeTej ?? null)}, ${sqlTexte(t.note ?? null)}, ${i + 1})`)
  .join(',\n');

module.exports = {
  PAQUETS, NATURES, NATURES_LIBELLES, NUMERO_MIN, NUMERO_MAX, RE_NUMERO, LIBELLE_MAX, NOTE_MAX, paquetDe, parentParmi, controlerPaquet, sqlTexte, sqlValeursPlan,
  TYPES_JOURNAUX, TYPES_JOURNAUX_LIBELLES, TYPES_AVEC_COMPTE, NATURE_PAR_TYPE, CODE_JOURNAL_MAX, RE_CODE_JOURNAL,
  TYPES_TAXES, TYPES_TAXES_LIBELLES, ASSIETTES, ASSIETTES_LIBELLES, COPIES, COPIES_LIBELLES, CODE_TAXE_MAX, RE_CODE_TAXE, RE_TAUX, RE_MONTANT, RE_CODE_TEJ,
  sqlNombre, sqlValeursJournaux, sqlValeursSousComptes, sqlValeursTaxes,
  TYPES_TIERS, TYPES_TIERS_LIBELLES, NATURE_PAR_TYPE_TIERS, REGIMES_TVA_TIERS, REGIMES_TVA_TIERS_LIBELLES,
  CODE_TIERS_MIN, CODE_TIERS_MAX, RE_CODE_TIERS, PREFIXE_TIERS_MAX, RE_PREFIXE_TIERS, CHIFFRES_TIERS_MIN, CHIFFRES_TIERS_MAX, DELAI_PAIEMENT_MAX,
  RE_REGIME_FISCAL, PERSONNES, TYPES_IDENTIFIANT, TYPES_IDENTIFIANT_LIBELLES, RE_CODE_OPERATION_TEJ, fiscaliteDe, regimeFiscalDe,
};
