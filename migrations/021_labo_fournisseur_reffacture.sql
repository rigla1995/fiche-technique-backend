-- Migration 021: labo fournisseur auto-link, ref_facture on transfers, seuil_min on labo stock

-- 1. Add ref_facture to labo_transfers
ALTER TABLE labo_transfers ADD COLUMN IF NOT EXISTS ref_facture VARCHAR(100);

-- 2. Add is_labo and labo_id to fournisseurs
ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS is_labo BOOLEAN DEFAULT FALSE;
ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS labo_id INT REFERENCES labos(id) ON DELETE CASCADE;

-- 3. Add seuil_min to labo_ingredient_selections
ALTER TABLE labo_ingredient_selections ADD COLUMN IF NOT EXISTS seuil_min NUMERIC(10,3);

-- 4. Add fournisseur_id and ref_facture to stock_entreprise_daily (ref_facture via createTransfer)
--    fournisseur_id already added in 020, ref_facture already added in 020 — skip if already present

-- Index for fast lookup of labo fournisseur
CREATE INDEX IF NOT EXISTS idx_fournisseurs_labo_id ON fournisseurs(labo_id);
