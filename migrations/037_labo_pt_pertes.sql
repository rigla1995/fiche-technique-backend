-- Allow labo_pertes to track PT product losses (produit_id) as well as ingredient losses
ALTER TABLE labo_pertes ALTER COLUMN ingredient_id DROP NOT NULL;
ALTER TABLE labo_pertes ADD COLUMN IF NOT EXISTS produit_id INTEGER REFERENCES produits(id) ON DELETE CASCADE;
-- At least one of ingredient_id or produit_id must be set
ALTER TABLE labo_pertes ADD CONSTRAINT labo_pertes_target_check
  CHECK (ingredient_id IS NOT NULL OR produit_id IS NOT NULL);
