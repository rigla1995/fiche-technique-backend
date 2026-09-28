const test = require('node:test');
const assert = require('node:assert');
const {
  TARIF_KEYS_SURCHARGEABLES,
  resolveTarifs, tarifsFor,
  cfgVal, prixBaseActivite,
  computeBaseMensuelFromConfig, computeBaseGerantFromConfig, computeBaseLaboFromConfig,
  palierAcheteurs, computeBaseAcheteursFromConfig, computeMensuelTotalFromConfig,
  computeActiviteSupPrice,
  applyPromoMensualite, applyPromoOnboarding, applyPromoSupplement,
  onboardingPriceFor,
} = require('../src/services/pricingEngine');

// Grille générale de référence (valeurs de tarifs_config en local)
const BASE = {
  prix_base_activite: 200,
  prix_base_activite_premium: 200,
  prix_base_activite_basique: 150,
  remise_2eme_sans_labo: 20,
  remise_3eme_plus_sans_labo: 40,
  remise_avec_labo: 30,
  labo_sup_mensuel: 200,
  gerant_sup_mensuel: 80,
  onboarding_sans_labo: 1000,
  onboarding_avec_labo: 1500,
  acheteurs_palier_10: 50,
  acheteurs_palier_20: 90,
  acheteurs_palier_50: 150,
  acheteurs_palier_100: 220,
};

// ── Ancienne formule (copie conforme d'abonnementController avant le lot 1a) ──
const ancienComputeBaseMensuel = (config, tarifs) => {
  if (!config) return null;
  const nRaw = parseInt(cfgVal(config, 'nb_activites', 'nbActivites'));
  const n   = Number.isFinite(nRaw) && nRaw >= 0 ? nRaw : 1;
  if (n === 0) return 0;
  const nbl = parseInt(cfgVal(config, 'nb_labos', 'nbLabos'))     || 0;
  const base = prixBaseActivite(config, tarifs);
  const hasLabo = nbl > 0;
  if (hasLabo) {
    const rl = parseFloat(tarifs['remise_avec_labo'] ?? 30) / 100;
    return Math.round(n * base * (1 - rl) * 100) / 100;
  }
  const r2 = parseFloat(tarifs['remise_2eme_sans_labo']      ?? 20) / 100;
  const r3 = parseFloat(tarifs['remise_3eme_plus_sans_labo'] ?? 40) / 100;
  let cost = base;
  if (n >= 2) cost += base * (1 - r2);
  if (n >= 3) cost += (n - 2) * base * (1 - r3);
  return Math.round(cost * 100) / 100;
};

// 20 configurations couvrant n = 0…7, ± labo, basique/premium, camelCase/snake_case
const CONFIGS_IDENTITE = [
  { nb_activites: 0, nb_labos: 1, formule_activites: null },
  { nb_activites: 1, nb_labos: 0, formule_activites: 'premium' },
  { nb_activites: 1, nb_labos: 0, formule_activites: 'basique' },
  { nb_activites: 1, nb_labos: 1, formule_activites: 'premium' },
  { nb_activites: 2, nb_labos: 0, formule_activites: 'premium' },
  { nb_activites: 2, nb_labos: 0, formule_activites: 'basique' },
  { nb_activites: 2, nb_labos: 1, formule_activites: 'basique' },
  { nb_activites: 3, nb_labos: 0, formule_activites: 'premium' },
  { nb_activites: 3, nb_labos: 0, formule_activites: 'basique' },
  { nb_activites: 3, nb_labos: 2, formule_activites: 'premium' },
  { nb_activites: 4, nb_labos: 0, formule_activites: 'premium' },
  { nb_activites: 5, nb_labos: 0, formule_activites: 'basique' },
  { nb_activites: 5, nb_labos: 1, formule_activites: 'basique' },
  { nb_activites: 7, nb_labos: 0, formule_activites: 'premium' },
  { nb_activites: 7, nb_labos: 3, formule_activites: 'premium' },
  { nbActivites: 2, nbLabos: 0, formuleActivites: 'premium' },
  { nbActivites: 3, nbLabos: 1, formuleActivites: 'basique' },
  { nbActivites: 'abc', nbLabos: 0 },              // invalide → repli 1 activité
  { nb_activites: -2, nb_labos: 0 },               // négatif → repli 1 activité
  { nb_activites: 6, nb_labos: 0, formule_activites: 'premium' },
];

// Grilles « tordues » pour éprouver l'arithmétique (centimes, remises non rondes)
const GRILLES = [
  BASE,
  { ...BASE, prix_base_activite_premium: 199.99, prix_base_activite_basique: 133.33, remise_2eme_sans_labo: 17.5, remise_3eme_plus_sans_labo: 42.25, remise_avec_labo: 33.3 },
  { ...BASE, prix_base_activite_premium: 300, prix_base_activite_basique: 225, remise_2eme_sans_labo: 0, remise_3eme_plus_sans_labo: 0, remise_avec_labo: 0 },
  { prix_base_activite: 180 },                     // legacy : seule l'ancienne clé existe
  { ...BASE, prix_base_activite_premium: 0.01, prix_base_activite_basique: 0.03, remise_3eme_plus_sans_labo: 33 },
];

test('identité ancienne / nouvelle formule sur 20 configs × 5 grilles', () => {
  for (const tarifs of GRILLES) {
    for (const cfg of CONFIGS_IDENTITE) {
      assert.strictEqual(
        computeBaseMensuelFromConfig(cfg, tarifs),
        ancienComputeBaseMensuel(cfg, tarifs),
        `config ${JSON.stringify(cfg)} / grille ${JSON.stringify(tarifs)}`
      );
    }
  }
  assert.strictEqual(computeBaseMensuelFromConfig(null, BASE), null);
});

test('resolveTarifs : domaine null, sans surcharge, partielle, à 0, inconnu', () => {
  const overrides = {
    7: { prix_base_activite_premium: 300 },
    8: { labo_sup_mensuel: 0, acheteurs_palier_10: 0 },
  };
  assert.deepStrictEqual(resolveTarifs(BASE, overrides, null), BASE);
  assert.deepStrictEqual(resolveTarifs(BASE, overrides, undefined), BASE);
  assert.deepStrictEqual(resolveTarifs(BASE, null, 7), BASE);
  assert.deepStrictEqual(resolveTarifs(BASE, overrides, 99), BASE);          // domaine inconnu
  const d7 = resolveTarifs(BASE, overrides, 7);
  assert.strictEqual(d7.prix_base_activite_premium, 300);                    // surchargée
  assert.strictEqual(d7.prix_base_activite_basique, 150);                    // héritée
  assert.strictEqual(d7.labo_sup_mensuel, 200);
  const d8 = resolveTarifs(BASE, overrides, '8');                            // id en string (query)
  assert.strictEqual(d8.labo_sup_mensuel, 0);                                // surcharge à 0 respectée
  assert.strictEqual(d8.acheteurs_palier_10, 0);
  // Jamais de mutation de la base
  assert.strictEqual(BASE.prix_base_activite_premium, 200);
  assert.notStrictEqual(resolveTarifs(BASE, overrides, null), BASE);
});

test('tarifsFor : alias { base, overridesByDomaine } + tolérance grille plate', () => {
  const t = { base: BASE, overridesByDomaine: { 7: { gerant_sup_mensuel: 100 } } };
  assert.strictEqual(tarifsFor(t, 7).gerant_sup_mensuel, 100);
  assert.strictEqual(tarifsFor(t, null).gerant_sup_mensuel, 80);
  assert.deepStrictEqual(tarifsFor(BASE, 7), BASE);                          // grille plate
  assert.deepStrictEqual(tarifsFor(null, 7), {});
});

test('TARIF_KEYS_SURCHARGEABLES : 13 clés, sans prix_base_activite', () => {
  assert.strictEqual(TARIF_KEYS_SURCHARGEABLES.length, 13);
  assert.ok(!TARIF_KEYS_SURCHARGEABLES.includes('prix_base_activite'));
  for (const k of Object.keys(BASE)) {
    if (k === 'prix_base_activite') continue;
    assert.ok(TARIF_KEYS_SURCHARGEABLES.includes(k), `clé ${k} manquante`);
  }
  assert.ok(Object.isFrozen(TARIF_KEYS_SURCHARGEABLES));
});

test('activités : n = 0/1/2/3 sans labo, premium', () => {
  const c = (n) => ({ nb_activites: n, nb_labos: 0, formule_activites: 'premium' });
  assert.strictEqual(computeBaseMensuelFromConfig(c(0), BASE), 0);
  assert.strictEqual(computeBaseMensuelFromConfig(c(1), BASE), 200);
  assert.strictEqual(computeBaseMensuelFromConfig(c(2), BASE), 360);         // 200 + 160
  assert.strictEqual(computeBaseMensuelFromConfig(c(3), BASE), 480);         // 200 + 160 + 120
  assert.strictEqual(computeBaseMensuelFromConfig(c(4), BASE), 600);         // + 120
});

test('activités : n = 1/2/3 avec labo (−30 % sur toutes), basique', () => {
  const c = (n) => ({ nb_activites: n, nb_labos: 1, formule_activites: 'basique' });
  assert.strictEqual(computeBaseMensuelFromConfig(c(1), BASE), 105);         // 150 × 0,7
  assert.strictEqual(computeBaseMensuelFromConfig(c(2), BASE), 210);
  assert.strictEqual(computeBaseMensuelFromConfig(c(3), BASE), 315);
});

test('formule : basique vs premium, repli legacy prix_base_activite, défaut 200', () => {
  assert.strictEqual(prixBaseActivite({ formule_activites: 'basique' }, BASE), 150);
  assert.strictEqual(prixBaseActivite({ formule_activites: 'premium' }, BASE), 200);
  assert.strictEqual(prixBaseActivite({ formule_activites: null }, BASE), 200);   // NULL → premium
  assert.strictEqual(prixBaseActivite({ formuleActivites: 'basique' }, BASE), 150);
  assert.strictEqual(prixBaseActivite({}, { prix_base_activite: 180 }), 180);     // legacy
  assert.strictEqual(prixBaseActivite({ formule_activites: 'basique' }, { prix_base_activite: 180 }), 180);
  assert.strictEqual(prixBaseActivite({}, {}), 200);                              // défaut codé
});

test('paliers acheteurs 0…150 et coût de l’option', () => {
  const attendu = (n) => (n <= 0 ? null : n <= 10 ? 10 : n <= 20 ? 20 : n <= 50 ? 50 : 100);
  for (let n = 0; n <= 150; n++) {
    assert.strictEqual(palierAcheteurs(n), attendu(n), `palier(${n})`);
  }
  assert.strictEqual(palierAcheteurs(null), null);
  assert.strictEqual(palierAcheteurs('12'), 20);
  assert.strictEqual(computeBaseAcheteursFromConfig({ nb_acheteurs: 0 }, BASE), 0);
  assert.strictEqual(computeBaseAcheteursFromConfig({ nb_acheteurs: 10 }, BASE), 50);
  assert.strictEqual(computeBaseAcheteursFromConfig({ nb_acheteurs: 11 }, BASE), 90);
  assert.strictEqual(computeBaseAcheteursFromConfig({ nbAcheteurs: 50 }, BASE), 150);
  assert.strictEqual(computeBaseAcheteursFromConfig({ nb_acheteurs: 150 }, BASE), 220);
  assert.strictEqual(computeBaseAcheteursFromConfig({ nb_acheteurs: 10 }, {}), 0);
});

test('labos / gérants : n × prix, défauts codés', () => {
  assert.strictEqual(computeBaseLaboFromConfig({ nb_labos: 0 }, BASE), 0);
  assert.strictEqual(computeBaseLaboFromConfig({ nb_labos: 2 }, BASE), 400);
  assert.strictEqual(computeBaseLaboFromConfig({ nbLabos: 1 }, {}), 160);
  assert.strictEqual(computeBaseGerantFromConfig({ nb_gerants: 3 }, BASE), 240);
  assert.strictEqual(computeBaseGerantFromConfig({ nbGerants: 1 }, {}), 80);
  assert.strictEqual(computeBaseGerantFromConfig(null, BASE), null);
});

test('total mensuel = activités + labos + gérants + acheteurs (config locale 2/1/1/10)', () => {
  const cfg = { nb_activites: 2, nb_labos: 1, nb_gerants: 1, nb_acheteurs: 10, formule_activites: 'premium' };
  // 2 × 200 × 0,7 = 280 ; labo 200 ; gérant 80 ; palier 10 = 50
  assert.strictEqual(computeMensuelTotalFromConfig(cfg, BASE), 610);
  assert.strictEqual(computeMensuelTotalFromConfig(null, BASE), null);
});

test('arrondis au centime (remises non rondes)', () => {
  const t = { ...BASE, prix_base_activite_premium: 199.99, remise_2eme_sans_labo: 17.5, remise_3eme_plus_sans_labo: 42.25 };
  const c3 = { nb_activites: 3, nb_labos: 0, formule_activites: 'premium' };
  // 199.99 + 164.99175 + 115.494225 = 480.475975 → 480.48
  assert.strictEqual(computeBaseMensuelFromConfig(c3, t), 480.48);
  const tl = { ...BASE, prix_base_activite_basique: 133.33, remise_avec_labo: 33.3 };
  // 2 × 133.33 × 0,667 = 177.86222 → 177.86
  assert.strictEqual(computeBaseMensuelFromConfig({ nb_activites: 2, nb_labos: 1, formule_activites: 'basique' }, tl), 177.86);
  assert.strictEqual(computeActiviteSupPrice({ nb_labos: 0, formule_activites: 'premium' }, t), 115.49);
  assert.strictEqual(computeActiviteSupPrice({ nb_labos: 1, formule_activites: 'premium' }, BASE), 140);
  assert.strictEqual(computeActiviteSupPrice(null, BASE), 200);
});

test('promotions : mensualité / onboarding / supplément', () => {
  assert.strictEqual(applyPromoMensualite(610, null), 610);
  assert.strictEqual(applyPromoMensualite(610, { type: 'free_months', applies_to: 'mensualite' }), 0);
  assert.strictEqual(applyPromoMensualite(610, { type: 'percent_off', applies_to: 'les_deux', discount_mensualite: 15 }), 518.5);
  assert.strictEqual(applyPromoMensualite(610, { type: 'fixed_price', applies_to: 'mensualite', fixed_mensualite: '499.90' }), 499.9);
  assert.strictEqual(applyPromoMensualite(610, { type: 'percent_off', applies_to: 'onboarding', discount_mensualite: 15 }), 610); // hors périmètre
  assert.strictEqual(applyPromoMensualite(610, { type: 'percent_off', applies_to: 'mensualite', discount_mensualite: null }), 610);
  assert.strictEqual(applyPromoOnboarding(1500, { type: 'percent_off', applies_to: 'onboarding', discount_onboarding: 50 }), 750);
  assert.strictEqual(applyPromoOnboarding(1500, { type: 'free_months', applies_to: 'les_deux' }), 0);
  assert.strictEqual(applyPromoOnboarding(1500, { type: 'fixed_price', applies_to: 'mensualite', fixed_onboarding: 100 }), 1500);
  assert.strictEqual(applyPromoSupplement(200, null), 200);
  assert.strictEqual(applyPromoSupplement(200, { type: 'percent_off', discount_supplement: 33 }), 134);
  assert.strictEqual(applyPromoSupplement(200, { type: 'fixed_price', fixed_supplement: '99' }), 99);
  assert.strictEqual(applyPromoSupplement(200, { type: 'free_months' }), 0);
});

test('onboardingPriceFor : avec / sans labo, défauts codés', () => {
  assert.strictEqual(onboardingPriceFor({ nb_labos: 0 }, BASE), 1000);
  assert.strictEqual(onboardingPriceFor({ nbLabos: 2 }, BASE), 1500);
  assert.strictEqual(onboardingPriceFor({ nb_labos: 0 }, {}), 500);
  assert.strictEqual(onboardingPriceFor({ nb_labos: 1 }, {}), 700);
});

test('cas Hôtellerie : prix de base Premium surchargé à 300 DT, le reste hérité', () => {
  const t = { base: BASE, overridesByDomaine: { 42: { prix_base_activite_premium: 300 } } };
  const hotel = tarifsFor(t, 42);
  const general = tarifsFor(t, null);
  const c1 = { nb_activites: 1, nb_labos: 0, nb_gerants: 0, nb_acheteurs: 0, formule_activites: 'premium' };
  assert.strictEqual(computeMensuelTotalFromConfig(c1, hotel), 300);
  assert.strictEqual(computeMensuelTotalFromConfig(c1, general), 200);
  const c2 = { nb_activites: 2, nb_labos: 1, nb_gerants: 1, nb_acheteurs: 10, formule_activites: 'premium' };
  // 2 × 300 × 0,7 = 420 ; labo 200 ; gérant 80 ; acheteurs 50
  assert.strictEqual(computeMensuelTotalFromConfig(c2, hotel), 750);
  assert.strictEqual(computeMensuelTotalFromConfig(c2, general), 610);
  // La formule Basique n'est pas surchargée → héritée
  const cb = { ...c1, formule_activites: 'basique' };
  assert.strictEqual(computeMensuelTotalFromConfig(cb, hotel), 150);
  assert.strictEqual(computeActiviteSupPrice({ nb_labos: 0, formule_activites: 'premium' }, hotel), 180);
});

test('invariant : total(cfg, tarifsFor(t, null)) === total(cfg, base) pour toutes les configs', () => {
  const t = { base: BASE, overridesByDomaine: { 42: { prix_base_activite_premium: 300, labo_sup_mensuel: 0 } } };
  for (const cfg of CONFIGS_IDENTITE) {
    const full = { nb_gerants: 1, nb_acheteurs: 20, ...cfg };
    assert.strictEqual(
      computeMensuelTotalFromConfig(full, tarifsFor(t, null)),
      computeMensuelTotalFromConfig(full, BASE),
      JSON.stringify(full)
    );
    // Sans surcharge pour ce domaine : identique aussi
    assert.strictEqual(
      computeMensuelTotalFromConfig(full, tarifsFor(t, 1585)),
      computeMensuelTotalFromConfig(full, BASE)
    );
  }
});
