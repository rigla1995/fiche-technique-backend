-- One inventaire per (context, ingredient, date) — newer save replaces the old one
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventaire_labo_ing_date
  ON inventaires (labo_id, ingredient_id, date_inventaire)
  WHERE labo_id IS NOT NULL AND ingredient_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventaire_act_ing_date
  ON inventaires (activite_id, ingredient_id, date_inventaire)
  WHERE activite_id IS NOT NULL AND ingredient_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventaire_act_prod_date
  ON inventaires (activite_id, produit_id, date_inventaire)
  WHERE activite_id IS NOT NULL AND produit_id IS NOT NULL;
