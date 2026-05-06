-- Unique index for client (indep) PT product inventaires
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventaire_client_prod_date
  ON inventaires (client_id, produit_id, date_inventaire)
  WHERE client_id IS NOT NULL AND produit_id IS NOT NULL;
