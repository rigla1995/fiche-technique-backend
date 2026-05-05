-- PT products in labo stock (franchise with labo)
CREATE TABLE IF NOT EXISTS labo_pt_selections (
  labo_id   INTEGER NOT NULL REFERENCES labos(id) ON DELETE CASCADE,
  produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  seuil_min  NUMERIC,
  PRIMARY KEY (labo_id, produit_id)
);

-- Labo-level appros for PT products
CREATE TABLE IF NOT EXISTS stock_labo_pt_daily (
  id           SERIAL PRIMARY KEY,
  labo_id      INTEGER NOT NULL REFERENCES labos(id) ON DELETE CASCADE,
  produit_id   INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  date_appro   DATE NOT NULL DEFAULT CURRENT_DATE,
  quantite     NUMERIC NOT NULL,
  prix_unitaire NUMERIC,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(labo_id, produit_id, date_appro)
);

-- Extend labo_transfers to support PT product transfers
ALTER TABLE labo_transfers ADD COLUMN IF NOT EXISTS produit_id INTEGER REFERENCES produits(id) ON DELETE CASCADE;
ALTER TABLE labo_transfers ALTER COLUMN ingredient_id DROP NOT NULL;
