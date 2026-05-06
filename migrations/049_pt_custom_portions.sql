ALTER TABLE stock_produits_transformes ADD COLUMN IF NOT EXISTS custom_portions JSONB;
ALTER TABLE stock_labo_pt_daily       ADD COLUMN IF NOT EXISTS custom_portions JSONB;
