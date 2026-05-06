-- Add produit_id to client_pertes so PT product losses can be tracked for indep clients
ALTER TABLE client_pertes ALTER COLUMN ingredient_id DROP NOT NULL;
ALTER TABLE client_pertes ADD COLUMN IF NOT EXISTS produit_id INTEGER REFERENCES produits(id) ON DELETE CASCADE;
DO $$ BEGIN
  ALTER TABLE client_pertes ADD CONSTRAINT client_pertes_target_check
    CHECK (ingredient_id IS NOT NULL OR produit_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;
