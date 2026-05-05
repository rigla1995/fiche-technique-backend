-- Add type_appro to stock_labo_daily so PT consumption entries are separate from regular appros
ALTER TABLE stock_labo_daily ADD COLUMN IF NOT EXISTS type_appro VARCHAR(100) DEFAULT 'manuel';
UPDATE stock_labo_daily SET type_appro = 'manuel' WHERE type_appro IS NULL;

-- Drop old unique constraint and replace with one that includes type_appro
ALTER TABLE stock_labo_daily DROP CONSTRAINT IF EXISTS stock_labo_daily_labo_id_ingredient_id_date_appro_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_labo_daily
  ON stock_labo_daily (labo_id, ingredient_id, date_appro, type_appro);
