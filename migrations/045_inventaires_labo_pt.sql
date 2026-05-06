-- Unique index for labo PT product inventaires
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventaire_labo_prod_date
  ON inventaires (labo_id, produit_id, date_inventaire)
  WHERE labo_id IS NOT NULL AND produit_id IS NOT NULL;
