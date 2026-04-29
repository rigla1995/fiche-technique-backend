-- Migration 022: add fournisseur_id and ref_facture to stock_labo_daily

ALTER TABLE stock_labo_daily ADD COLUMN IF NOT EXISTS fournisseur_id INT REFERENCES fournisseurs(id) ON DELETE SET NULL;
ALTER TABLE stock_labo_daily ADD COLUMN IF NOT EXISTS ref_facture VARCHAR(100);
