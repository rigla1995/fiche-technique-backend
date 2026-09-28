// Moteur de tarification — module PUR (aucun accès base, email ou PDF).
// Source unique des calculs de mensualité / onboarding / promotions, déplacé tel
// quel depuis abonnementController (lot 1a) : aucun calcul ne change ici.
//
// Grille par domaine : `resolveTarifs(base, overridesByDomaine, domaineId)` fusionne
// la grille générale (tarifs_config) et les surcharges du domaine (tarifs_domaine).
// Une surcharge à 0 est respectée (spread, jamais `||`).

// Toutes les clés de tarifs_config surchargeables par domaine — SAUF
// prix_base_activite (clé legacy, repli du prix Premium avant la refonte formules).
const TARIF_KEYS_SURCHARGEABLES = Object.freeze([
  'prix_base_activite_basique',
  'prix_base_activite_premium',
  'remise_2eme_sans_labo',
  'remise_3eme_plus_sans_labo',
  'remise_avec_labo',
  'labo_sup_mensuel',
  'gerant_sup_mensuel',
  'onboarding_sans_labo',
  'onboarding_avec_labo',
  'acheteurs_palier_10',
  'acheteurs_palier_20',
  'acheteurs_palier_50',
  'acheteurs_palier_100',
]);

// Grille effective d'un domaine = grille générale + surcharges de ce domaine.
// domaineId null/inconnu → grille générale (copie).
const resolveTarifs = (base, overridesByDomaine, domaineId) => {
  const b = base || {};
  const key = domaineId == null ? null : String(domaineId);
  const ov = (key != null && overridesByDomaine && overridesByDomaine[key]) || null;
  return { ...b, ...(ov || {}) };
};

// Alias : t = { base, overridesByDomaine } (résultat de loadTarifs). Tolère aussi une
// grille plate (ancien loadAllTarifs) pour les appelants non migrés.
const tarifsFor = (t, domaineId) => {
  if (!t) return {};
  if (t.base && typeof t.base === 'object') return resolveTarifs(t.base, t.overridesByDomaine, domaineId);
  return resolveTarifs(t, null, domaineId);
};

// ── Promotions ───────────────────────────────────────────────────────────────

const applyPromoMensualite = (baseAmount, promo) => {
  if (!promo || !['mensualite', 'les_deux'].includes(promo.applies_to)) return baseAmount;
  if (promo.type === 'free_months') return 0;
  if (promo.type === 'percent_off' && promo.discount_mensualite != null)
    return Math.round(baseAmount * (1 - promo.discount_mensualite / 100) * 100) / 100;
  if (promo.type === 'fixed_price' && promo.fixed_mensualite != null) return parseFloat(promo.fixed_mensualite);
  return baseAmount;
};

const applyPromoOnboarding = (baseAmount, promo) => {
  if (!promo || !['onboarding', 'les_deux'].includes(promo.applies_to)) return baseAmount;
  if (promo.type === 'free_months') return 0;
  if (promo.type === 'percent_off' && promo.discount_onboarding != null)
    return Math.round(baseAmount * (1 - promo.discount_onboarding / 100) * 100) / 100;
  if (promo.type === 'fixed_price' && promo.fixed_onboarding != null) return parseFloat(promo.fixed_onboarding);
  return baseAmount;
};

const applyPromoSupplement = (baseAmount, promo) => {
  if (!promo) return baseAmount;
  if (promo.type === 'free_months') return 0;
  if (promo.type === 'percent_off' && promo.discount_supplement != null)
    return Math.round(baseAmount * (1 - promo.discount_supplement / 100) * 100) / 100;
  if (promo.type === 'fixed_price' && promo.fixed_supplement != null) return parseFloat(promo.fixed_supplement);
  return baseAmount;
};

// ── Bases mensuelles ─────────────────────────────────────────────────────────

// Les configs circulent en snake_case (lignes DB) ou camelCase (payloads) selon
// l'appelant — les fonctions de calcul acceptent les deux formes.
const cfgVal = (config, snake, camel) => config?.[snake] ?? config?.[camel];

// Prix de base d'une activité selon la FORMULE du compte (Basique = sans Espace
// Produit, Premium = avec). Compat : l'ancienne clé prix_base_activite sert de
// repli (elle valait le tarif « premium » avant la refonte formules).
const prixBaseActivite = (config, tarifs) => {
  const formule = cfgVal(config, 'formule_activites', 'formuleActivites') === 'basique' ? 'basique' : 'premium';
  return parseFloat(tarifs[`prix_base_activite_${formule}`] ?? tarifs['prix_base_activite'] ?? 200);
};

// Modèle dégressif par rang, écrit en « liste de bases » : la liste A contient une
// base par activité (n fois la base du domaine — un prix par composant viendra
// remplir cette liste plus tard), triée par ordre décroissant, puis remisée par
// rang :
//   Sans labo : rang 1 = base, rang 2 = base × (1 − r2 %), rang ≥ 3 = base × (1 − r3 %)
//   Avec labo : tous les rangs = base × (1 − rl %)
// Identique au centime à l'ancienne formule (test d'identité dans
// test/pricingEngine.test.js) : la queue « rang ≥ 3 » est sommée par valeur
// distincte (k × v × (1 − r3)) pour conserver la même arithmétique flottante.
const computeBaseMensuelFromConfig = (config, tarifs) => {
  if (!config) return null;
  // Compte dépôt : 0 activité est une valeur VALIDE (coût activités = 0),
  // le repli à 1 ne s'applique qu'aux valeurs absentes/invalides.
  const nRaw = parseInt(cfgVal(config, 'nb_activites', 'nbActivites'));
  const n   = Number.isFinite(nRaw) && nRaw >= 0 ? nRaw : 1;
  if (n === 0) return 0;
  const nbl = parseInt(cfgVal(config, 'nb_labos', 'nbLabos'))     || 0;
  const base = prixBaseActivite(config, tarifs);
  const hasLabo = nbl > 0;

  // Liste des bases (une par activité), triée décroissante
  const bases = Array.from({ length: n }, () => base).sort((a, b) => b - a);
  // Σ k × v par valeur distincte (bases uniformes ⇒ n × base, même arithmétique qu'avant)
  const sommeParValeur = (liste) => {
    const parValeur = new Map();
    for (const b of liste) parValeur.set(b, (parValeur.get(b) || 0) + 1);
    let s = 0;
    for (const [v, k] of parValeur) s += k * v;
    return s;
  };

  if (hasLabo) {
    const rl = parseFloat(tarifs['remise_avec_labo'] ?? 30) / 100;
    return Math.round(sommeParValeur(bases) * (1 - rl) * 100) / 100;
  }

  // Sans labo : remise par rang
  const r2 = parseFloat(tarifs['remise_2eme_sans_labo']      ?? 20) / 100;
  const r3 = parseFloat(tarifs['remise_3eme_plus_sans_labo'] ?? 40) / 100;
  let cost = bases[0]; // rang 1 : plein tarif
  if (n >= 2) cost += bases[1] * (1 - r2); // rang 2
  if (n >= 3) {
    // rang ≥ 3 : k × v × (1 − r3) par valeur distincte de base
    const parValeur = new Map();
    for (const b of bases.slice(2)) parValeur.set(b, (parValeur.get(b) || 0) + 1);
    for (const [v, k] of parValeur) cost += k * v * (1 - r3);
  }
  return Math.round(cost * 100) / 100;
};

const computeBaseGerantFromConfig = (config, tarifs) => {
  if (!config) return null;
  const n = parseInt(cfgVal(config, 'nb_gerants', 'nbGerants')) || 0;
  if (n === 0) return 0;
  return n * parseFloat(tarifs['gerant_sup_mensuel'] ?? 80);
};

const computeBaseLaboFromConfig = (config, tarifs) => {
  if (!config) return null;
  const n = parseInt(cfgVal(config, 'nb_labos', 'nbLabos')) || 0;
  if (n === 0) return 0;
  return n * parseFloat(tarifs['labo_sup_mensuel'] ?? 160);
};

// Palier de facturation de l'option Acheteurs couvrant un quota donné
// (1-10 / 11-20 / 21-50 / 51-100 ; quota exceptionnel > 100 = prix du palier 100).
const palierAcheteurs = (nbAcheteurs) => {
  const n = parseInt(nbAcheteurs) || 0;
  if (n <= 0) return null;
  return n <= 10 ? 10 : n <= 20 ? 20 : n <= 50 ? 50 : 100;
};

const computeBaseAcheteursFromConfig = (config, tarifs) => {
  if (!config) return null;
  const palier = palierAcheteurs(cfgVal(config, 'nb_acheteurs', 'nbAcheteurs'));
  if (!palier) return 0;
  return Math.round(parseFloat(tarifs[`acheteurs_palier_${palier}`] ?? 0) * 100) / 100;
};

// Mensuel TOTAL d'une config = activités (formule) + labos + gérants + option acheteurs.
// Source unique — remplace les sommes dupliquées de l'ancien modèle.
const computeMensuelTotalFromConfig = (config, tarifs) => {
  if (!config) return null;
  return Math.round((
    (computeBaseMensuelFromConfig(config, tarifs) || 0)
    + (computeBaseLaboFromConfig(config, tarifs) || 0)
    + (computeBaseGerantFromConfig(config, tarifs) || 0)
    + (computeBaseAcheteursFromConfig(config, tarifs) || 0)
  ) * 100) / 100;
};

// Unit price for next supplement activité (tier n+1)
const computeActiviteSupPrice = (config, tarifs) => {
  if (!config) return parseFloat(tarifs['prix_base_activite_premium'] ?? tarifs['prix_base_activite'] ?? 200);
  const nbl  = parseInt(config.nb_labos)     || 0;
  const base = prixBaseActivite(config, tarifs);
  if (nbl > 0) {
    const rl = parseFloat(tarifs['remise_avec_labo'] ?? 30) / 100;
    return Math.round(base * (1 - rl) * 100) / 100;
  }
  const r3 = parseFloat(tarifs['remise_3eme_plus_sans_labo'] ?? 40) / 100;
  return Math.round(base * (1 - r3) * 100) / 100;
};

// Prix d'onboarding proposé pour une config (avec / sans labo).
const onboardingPriceFor = (config, tarifs) => {
  const nbl = parseInt(cfgVal(config, 'nb_labos', 'nbLabos')) || 0;
  return parseFloat(
    nbl > 0 ? (tarifs['onboarding_avec_labo'] ?? 700) : (tarifs['onboarding_sans_labo'] ?? 500)
  );
};

module.exports = {
  TARIF_KEYS_SURCHARGEABLES,
  resolveTarifs, tarifsFor,
  cfgVal, prixBaseActivite,
  computeBaseMensuelFromConfig, computeBaseGerantFromConfig, computeBaseLaboFromConfig,
  palierAcheteurs, computeBaseAcheteursFromConfig, computeMensuelTotalFromConfig,
  computeActiviteSupPrice,
  applyPromoMensualite, applyPromoOnboarding, applyPromoSupplement,
  onboardingPriceFor,
};
