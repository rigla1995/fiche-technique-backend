-- Add client_id column to inventaires for independent clients
ALTER TABLE inventaires ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventaire_client_ing_date
  ON inventaires (client_id, ingredient_id, date_inventaire)
  WHERE client_id IS NOT NULL AND ingredient_id IS NOT NULL;
