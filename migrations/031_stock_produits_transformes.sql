CREATE TABLE IF NOT EXISTS stock_produits_transformes (
  id           SERIAL PRIMARY KEY,
  produit_id   INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  activite_id  INTEGER REFERENCES activites(id) ON DELETE CASCADE,
  client_id    INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE,
  date_appro   DATE NOT NULL,
  quantite     NUMERIC,
  prix_calcule NUMERIC,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_pt_ctx CHECK (activite_id IS NOT NULL OR client_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_spt ON stock_produits_transformes (produit_id, COALESCE(activite_id, 0), COALESCE(client_id, 0), date_appro);

-- seuil_min for PT products
ALTER TABLE produits ADD COLUMN IF NOT EXISTS seuil_min_pt NUMERIC;
