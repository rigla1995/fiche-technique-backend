-- 174 — Promotions sur les tarifs acheteurs.
--   Le client fixe un taux de remise par article/produit dans « Tarifs Acheteurs »
--   et l'active indépendamment : le prix effectif devient
--     prix_unitaire_ht × (1 − promo_pct / 100)
--   dès que promo_active = true ET promo_pct > 0.
--   Le prix de RÉFÉRENCE (prix_unitaire_ht) n'est jamais écrasé : il reste la base
--   du calcul et sert à afficher le prix barré dans le catalogue du portail.
--   Le prix figé sur les lignes de commande reste celui du moment de la commande
--   (commande_acheteur_lignes.prix_unitaire_ht), donc une promo qui s'arrête ne
--   rétro-modifie aucune commande ni facture existante.

ALTER TABLE acheteur_offres
  ADD COLUMN IF NOT EXISTS promo_pct NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (promo_pct >= 0 AND promo_pct <= 100),
  ADD COLUMN IF NOT EXISTS promo_active BOOLEAN NOT NULL DEFAULT false;

-- Une promo active sans taux n'a pas de sens : on la neutralise à l'écriture
-- côté API, et on garde ici l'invariant au niveau base.
ALTER TABLE acheteur_offres
  DROP CONSTRAINT IF EXISTS acheteur_offres_promo_coherente;
ALTER TABLE acheteur_offres
  ADD CONSTRAINT acheteur_offres_promo_coherente
  CHECK (promo_active = false OR promo_pct > 0);
