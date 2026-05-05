-- Allow multiple manual appro entries per (activite/client/labo, ingredient, date)
-- Each save creates a distinct row; popup warns user if entries already exist for that date
DROP INDEX IF EXISTS stock_entreprise_daily_uniq;
DROP INDEX IF EXISTS stock_client_daily_uniq;
DROP INDEX IF EXISTS uq_stock_labo_daily;
