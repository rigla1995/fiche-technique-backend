-- Unit price moves from catalogue (activite_ingredient_selections) to stock entries.
-- Each stock entry now records the purchase price for that delivery date.
ALTER TABLE stock_client_daily ADD COLUMN IF NOT EXISTS prix_unitaire DECIMAL(10,3);
ALTER TABLE stock_entreprise_daily ADD COLUMN IF NOT EXISTS prix_unitaire DECIMAL(10,3);
