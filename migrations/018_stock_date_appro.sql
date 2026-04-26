-- Rename date_stock → date_appro in both daily stock tables (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_client_daily' AND column_name = 'date_stock'
  ) THEN
    ALTER TABLE stock_client_daily RENAME COLUMN date_stock TO date_appro;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_entreprise_daily' AND column_name = 'date_stock'
  ) THEN
    ALTER TABLE stock_entreprise_daily RENAME COLUMN date_stock TO date_appro;
  END IF;
END$$;
