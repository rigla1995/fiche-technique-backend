ALTER TABLE labo_transfers   ADD COLUMN IF NOT EXISTS created_by INTEGER;
ALTER TABLE stock_labo_daily ADD COLUMN IF NOT EXISTS created_by INTEGER;
