-- Allow multiple PT appro entries per (labo_id, produit_id, date_appro)
-- so each save creates a distinct row instead of accumulating into one
ALTER TABLE stock_labo_pt_daily DROP CONSTRAINT IF EXISTS stock_labo_pt_daily_labo_id_produit_id_date_appro_key;
