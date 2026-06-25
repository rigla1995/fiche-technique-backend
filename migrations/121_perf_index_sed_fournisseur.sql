-- Migration 121: index (fournisseur_id, activite_id) sur stock_entreprise_daily (suite audit).
-- Accélère les sous-requêtes corrélées de listFournisseurs (appro_count + appro_by_activite,
-- filtrées par sed.fournisseur_id et groupées par activite_id) sans réécrire la requête.
-- CREATE INDEX IF NOT EXISTS (idempotent).

CREATE INDEX IF NOT EXISTS idx_sed_fournisseur_activite
  ON stock_entreprise_daily (fournisseur_id, activite_id);
