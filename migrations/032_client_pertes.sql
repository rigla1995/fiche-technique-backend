-- Migration 032: Pertes for independent (indep) clients + client ingredient seuil_min

CREATE TABLE IF NOT EXISTS client_pertes (
  id            SERIAL PRIMARY KEY,
  client_id     INT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  ingredient_id INT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantite      NUMERIC(10,3) NOT NULL,
  type_perte    VARCHAR(20) NOT NULL CHECK (type_perte IN ('avarie','dechet')),
  date_perte    DATE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_pertes_client_idx ON client_pertes (client_id);

-- seuil_min for indep client ingredient selections
ALTER TABLE client_ingredient_selections
  ADD COLUMN IF NOT EXISTS seuil_min NUMERIC(10,3);
