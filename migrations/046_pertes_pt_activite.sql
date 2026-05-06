-- Add produit_id to pertes so PT product losses can be tracked for activites
ALTER TABLE pertes ALTER COLUMN ingredient_id DROP NOT NULL;
ALTER TABLE pertes ADD COLUMN IF NOT EXISTS produit_id INTEGER REFERENCES produits(id) ON DELETE CASCADE;
ALTER TABLE pertes ADD CONSTRAINT IF NOT EXISTS pertes_target_check
  CHECK (ingredient_id IS NOT NULL OR produit_id IS NOT NULL);
