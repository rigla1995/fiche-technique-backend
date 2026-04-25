-- Add franchise_group to produits so each franchise product tracks which franchise it belongs to.
-- This allows filtering franchise products by franchise group without joining activites.
ALTER TABLE produits ADD COLUMN IF NOT EXISTS franchise_group TEXT;
