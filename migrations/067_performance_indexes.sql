-- Performance indexes for commonly-queried columns

-- stock_client_daily: "last row per ingredient" lookups (ORDER BY date_appro DESC LIMIT 1)
CREATE INDEX IF NOT EXISTS idx_scd_client_ing_date
  ON stock_client_daily (client_id, ingredient_id, date_appro DESC);

-- stock_entreprise_daily: same pattern for activite
CREATE INDEX IF NOT EXISTS idx_sed_activite_ing_date
  ON stock_entreprise_daily (activite_id, ingredient_id, date_appro DESC);

-- stock_labo_daily: labo ingredient lookups
CREATE INDEX IF NOT EXISTS idx_sld_labo_ing_date
  ON stock_labo_daily (labo_id, ingredient_id, date_appro DESC)
  WHERE ingredient_id IS NOT NULL;

-- stock_labo_pt_daily: labo PT product lookups
CREATE INDEX IF NOT EXISTS idx_slptd_labo_prod_date
  ON stock_labo_pt_daily (labo_id, produit_id, date_appro DESC);

-- stock_produits_transformes: last-row lookups per produit + context
CREATE INDEX IF NOT EXISTS idx_spt_produit_client_date
  ON stock_produits_transformes (produit_id, client_id, date_appro DESC)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_spt_produit_activite_date
  ON stock_produits_transformes (produit_id, activite_id, date_appro DESC)
  WHERE activite_id IS NOT NULL;

-- inventaires: client-scoped lookups
CREATE INDEX IF NOT EXISTS idx_inv_client_ing_date
  ON inventaires (client_id, ingredient_id, date_inventaire DESC)
  WHERE client_id IS NOT NULL AND ingredient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_client_prod_date
  ON inventaires (client_id, produit_id, date_inventaire DESC)
  WHERE client_id IS NOT NULL AND produit_id IS NOT NULL;

-- notifications: composite for selective clearing
CREATE INDEX IF NOT EXISTS idx_notifications_user_event
  ON notifications (user_id, event_type);
