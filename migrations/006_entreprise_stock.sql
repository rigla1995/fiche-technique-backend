-- Company profile (one per client)
CREATE TABLE IF NOT EXISTS profil_entreprise (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL UNIQUE REFERENCES utilisateurs(id) ON DELETE CASCADE,
  nom VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  telephone VARCHAR(50),
  adresse TEXT,
  meme_activite BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Activities (restaurants/cafés) belonging to a company
CREATE TABLE IF NOT EXISTS activites (
  id SERIAL PRIMARY KEY,
  entreprise_id INTEGER NOT NULL REFERENCES profil_entreprise(id) ON DELETE CASCADE,
  nom VARCHAR(255) NOT NULL,
  adresse TEXT,
  telephone VARCHAR(50),
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Client stock (per selected ingredient)
CREATE TABLE IF NOT EXISTS stock_client (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantite DECIMAL(10, 3),
  date_achat DATE,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(client_id, ingredient_id)
);

-- Enterprise stock (per activity, per ingredient)
CREATE TABLE IF NOT EXISTS stock_entreprise (
  id SERIAL PRIMARY KEY,
  activite_id INTEGER NOT NULL REFERENCES activites(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantite DECIMAL(10, 3),
  date_achat DATE,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(activite_id, ingredient_id)
);
