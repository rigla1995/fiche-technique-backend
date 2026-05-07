-- Track which user (client or gérant) performed each action
ALTER TABLE stock_client_daily    ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE stock_entreprise_daily ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE client_pertes          ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE pertes                 ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE inventaires            ADD COLUMN IF NOT EXISTS created_by INTEGER;
