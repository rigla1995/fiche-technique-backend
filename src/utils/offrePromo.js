// Promotions sur les tarifs acheteurs (migration 174).
//
// Règle unique, partagée par le portail (catalogue + commande) et les ventes
// manuelles : le prix de référence `prix_unitaire_ht` n'est JAMAIS écrasé ;
// quand `promo_active` est vrai et `promo_pct` > 0, le prix effectivement
// appliqué est `prix_unitaire_ht × (1 − promo_pct / 100)`.
//
// Les prix sont figés sur les lignes de commande au moment de la commande :
// arrêter une promo ne rétro-modifie donc aucune commande ni facture existante.

const round3 = (v) => Math.round(v * 1000) / 1000;

/** Taux de promo RÉELLEMENT applicable d'une offre (0 si inactive ou hors bornes). */
const promoDe = (offre) => {
  if (!offre || offre.promo_active !== true) return 0;
  const pct = Number(offre.promo_pct);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.min(100, pct);
};

/** Prix HT effectif d'une offre, promo appliquée le cas échéant. */
const prixEffectifHt = (offre) => {
  const base = Number(offre?.prix_unitaire_ht) || 0;
  const pct = promoDe(offre);
  return pct > 0 ? round3(base * (1 - pct / 100)) : round3(base);
};

module.exports = { promoDe, prixEffectifHt };
