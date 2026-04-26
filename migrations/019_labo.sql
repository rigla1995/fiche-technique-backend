-- Labo module: central lab per franchise group that transfers stock to activities

CREATE TABLE IF NOT EXISTS labos (
  id SERIAL PRIMARY KEY,
  entreprise_id INTEGER NOT NULL REFERENCES profil_entreprise(id) ON DELETE CASCADE,
  franchise_group TEXT NOT NULL,
  nom VARCHAR(255) NOT NULL,
  referent_tel VARCHAR(50) NOT NULL,
  adresse TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS labo_ingredient_selections (
  labo_id INTEGER NOT NULL REFERENCES labos(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  PRIMARY KEY (labo_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS stock_labo_daily (
  id SERIAL PRIMARY KEY,
  labo_id INTEGER NOT NULL REFERENCES labos(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  date_appro DATE NOT NULL,
  quantite NUMERIC(10, 3),
  prix_unitaire NUMERIC(10, 3),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(labo_id, ingredient_id, date_appro)
);

CREATE TABLE IF NOT EXISTS labo_transfers (
  id SERIAL PRIMARY KEY,
  labo_id INTEGER NOT NULL REFERENCES labos(id) ON DELETE CASCADE,
  activite_id INTEGER NOT NULL REFERENCES activites(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantite NUMERIC(10, 3) NOT NULL,
  date_transfert DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE activites ADD COLUMN IF NOT EXISTS labo_id INTEGER REFERENCES labos(id) ON DELETE SET NULL;
