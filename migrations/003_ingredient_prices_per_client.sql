-- Sprint 3: per-client ingredient pricing + global ingredient catalogue

-- 1. Allow admin to create ingredients without a price (global catalogue)
ALTER TABLE ingredients ALTER COLUMN prix DROP NOT NULL;
ALTER TABLE ingredients ALTER COLUMN client_id DROP NOT NULL;

-- 2. Per-client ingredient prices
CREATE TABLE IF NOT EXISTS ingredient_prix_client (
  id SERIAL PRIMARY KEY,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  prix DECIMAL(10, 3) NOT NULL CHECK (prix >= 0),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(ingredient_id, client_id)
);

-- 3. Migrate existing prices: copy current prix into the per-client table
--    for ingredients that already have both a prix and a client_id
INSERT INTO ingredient_prix_client (ingredient_id, client_id, prix)
SELECT id, client_id, prix
FROM ingredients
WHERE prix IS NOT NULL AND client_id IS NOT NULL
ON CONFLICT (ingredient_id, client_id) DO NOTHING;
