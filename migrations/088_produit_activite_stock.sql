-- Per-activité PT stock assignment (many-to-many: produit ↔ activite)
CREATE TABLE IF NOT EXISTS produit_activite_stock (
  id          SERIAL PRIMARY KEY,
  produit_id  INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  activite_id INTEGER REFERENCES activites(id) ON DELETE CASCADE,
  labo_id     INTEGER REFERENCES labos(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (produit_id, activite_id)
);

-- Backfill: migrate existing global is_stock_ingredient assignments to the new table
INSERT INTO produit_activite_stock (produit_id, activite_id, labo_id)
SELECT p.id, p.activite_id, a.labo_id
FROM produits p
JOIN activites a ON a.id = p.activite_id
WHERE p.is_stock_ingredient = TRUE
  AND p.activite_id IS NOT NULL
ON CONFLICT DO NOTHING;
