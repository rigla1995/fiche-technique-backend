-- Add fournisseur_id to labo_transfers (optional: records the fournisseur for a batch transfer)
ALTER TABLE labo_transfers ADD COLUMN IF NOT EXISTS fournisseur_id INT REFERENCES fournisseurs(id) ON DELETE SET NULL;
