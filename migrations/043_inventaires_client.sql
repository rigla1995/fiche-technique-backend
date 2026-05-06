-- Add client_id column to inventaires for independent clients
ALTER TABLE inventaires ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE;

-- Relax context constraint to also allow client_id-only rows (indep accounts)
ALTER TABLE inventaires DROP CONSTRAINT IF EXISTS inv_context;
ALTER TABLE inventaires ADD CONSTRAINT inv_context CHECK (
  labo_id IS NOT NULL OR activite_id IS NOT NULL OR client_id IS NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventaire_client_ing_date
  ON inventaires (client_id, ingredient_id, date_inventaire)
  WHERE client_id IS NOT NULL AND ingredient_id IS NOT NULL;
