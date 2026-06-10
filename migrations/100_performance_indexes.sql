-- Performance indexes for high-frequency stock price lookups
-- Replaces EXTRACT(YEAR) with range scans — these indexes enable index-only scans

CREATE INDEX IF NOT EXISTS idx_stock_entreprise_daily_ing_date
  ON stock_entreprise_daily(ingredient_id, date_appro DESC);

CREATE INDEX IF NOT EXISTS idx_stock_entreprise_daily_activite_ing
  ON stock_entreprise_daily(activite_id, ingredient_id, date_appro DESC);

CREATE INDEX IF NOT EXISTS idx_stock_client_daily_client_ing_date
  ON stock_client_daily(client_id, ingredient_id, date_appro DESC);

-- Labo stock daily lookups
CREATE INDEX IF NOT EXISTS idx_stock_labo_daily_labo_ing
  ON stock_labo_daily(labo_id, ingredient_id);

-- Frequently joined in me() and auth checks
CREATE INDEX IF NOT EXISTS idx_profil_entreprise_client_id
  ON profil_entreprise(client_id);

CREATE INDEX IF NOT EXISTS idx_activites_entreprise_id
  ON activites(entreprise_id);

CREATE INDEX IF NOT EXISTS idx_labos_entreprise_id
  ON labos(entreprise_id);

-- Produits lookups by client
CREATE INDEX IF NOT EXISTS idx_produits_client_id
  ON produits(client_id);

-- Promotions active lookup (used in abonnement pricing)
CREATE INDEX IF NOT EXISTS idx_promotions_abonnement_dates
  ON promotions(abonnement_id, date_debut, date_fin);

-- Paiements monthly lookup (used in cron enforcer)
CREATE INDEX IF NOT EXISTS idx_paiements_abonnement_mois
  ON paiements(abonnement_id, mois);
