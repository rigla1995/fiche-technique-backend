-- Activity domains (restauration, café, etc.)
CREATE TABLE IF NOT EXISTS domaines_activite (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO domaines_activite (nom) VALUES
  ('Restauration'),
  ('Café / Coffee shop'),
  ('Pâtisserie / Boulangerie'),
  ('Traiteur / Catering'),
  ('Fast food'),
  ('Hôtellerie'),
  ('Autre')
ON CONFLICT (nom) DO NOTHING;

-- Add domain FK to activites
ALTER TABLE activites ADD COLUMN IF NOT EXISTS domaine_id INTEGER REFERENCES domaines_activite(id) ON DELETE SET NULL;

-- Rename compte_type 'client' -> 'independant' for clarity
UPDATE utilisateurs SET compte_type = 'independant' WHERE compte_type = 'client';

-- Onboarding step tracking (0=done, 1=change password, 2=activites, 3=catalogue, 4=stock)
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0;

-- Set onboarding_step=1 for entreprise accounts (they need to complete onboarding)
UPDATE utilisateurs SET onboarding_step = 1 WHERE compte_type = 'entreprise';

-- Unique constraints on telephone and adresse in profil_entreprise
ALTER TABLE profil_entreprise ADD CONSTRAINT IF NOT EXISTS profil_entreprise_telephone_unique UNIQUE (telephone);

-- Note: address uniqueness is enforced at application level (text normalization issues)
