-- Schéma de la base de données pour l'application Fiche Technique

CREATE TABLE IF NOT EXISTS utilisateurs (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  mot_de_passe VARCHAR(255) NOT NULL,
  telephone VARCHAR(20),
  role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'client')),
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unites (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(50) NOT NULL,
  client_id INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(nom, client_id)
);

CREATE TABLE IF NOT EXISTS ingredients (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  prix DECIMAL(10, 3) NOT NULL CHECK (prix >= 0),
  unite_id INTEGER NOT NULL REFERENCES unites(id) ON DELETE RESTRICT,
  client_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS produits (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  description TEXT,
  client_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS produit_ingredients (
  id SERIAL PRIMARY KEY,
  produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  portion DECIMAL(10, 3) NOT NULL CHECK (portion > 0),
  unite_id INTEGER NOT NULL REFERENCES unites(id) ON DELETE RESTRICT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(produit_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS produit_sous_produits (
  id SERIAL PRIMARY KEY,
  produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  sous_produit_id INTEGER NOT NULL REFERENCES produits(id) ON DELETE RESTRICT,
  portion DECIMAL(10, 3) NOT NULL CHECK (portion > 0),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT no_self_reference CHECK (produit_id != sous_produit_id),
  UNIQUE(produit_id, sous_produit_id)
);

-- Insérer le Super Admin par défaut (mot de passe: Admin@1234)
INSERT INTO utilisateurs (nom, email, mot_de_passe, role)
VALUES (
  'Super Admin',
  'admin@fiche-technique.tn',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'super_admin'
) ON CONFLICT (email) DO NOTHING;
