-- Per-activity price override on ingredient selections
ALTER TABLE activite_ingredient_selections ADD COLUMN IF NOT EXISTS prix_unitaire DECIMAL(10,3);

-- Date-keyed stock for individual (independant) clients
CREATE TABLE IF NOT EXISTS stock_client_daily (
  client_id   INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  date_stock  DATE NOT NULL DEFAULT CURRENT_DATE,
  quantite    DECIMAL(10,3),
  updated_at  TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (client_id, ingredient_id, date_stock)
);

-- Date-keyed stock for entreprise activities
CREATE TABLE IF NOT EXISTS stock_entreprise_daily (
  activite_id   INTEGER REFERENCES activites(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  date_stock    DATE NOT NULL DEFAULT CURRENT_DATE,
  quantite      DECIMAL(10,3),
  updated_at    TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (activite_id, ingredient_id, date_stock)
);

-- Migrate existing non-null stock to today's date
-- Wrapped in exception handlers: if date_stock was already renamed to date_appro
-- by a later migration (018), the column reference fails harmlessly since the
-- data migration already ran on the first server start.
DO $$
BEGIN
  INSERT INTO stock_client_daily (client_id, ingredient_id, date_stock, quantite, updated_at)
  SELECT client_id, ingredient_id, CURRENT_DATE, quantite, NOW()
  FROM stock_client WHERE quantite IS NOT NULL
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_column OR undefined_table THEN
  NULL; -- already migrated
END$$;

DO $$
BEGIN
  INSERT INTO stock_entreprise_daily (activite_id, ingredient_id, date_stock, quantite, updated_at)
  SELECT activite_id, ingredient_id, CURRENT_DATE, quantite, NOW()
  FROM stock_entreprise WHERE quantite IS NOT NULL
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN undefined_column OR undefined_table THEN
  NULL; -- already migrated
END$$;
