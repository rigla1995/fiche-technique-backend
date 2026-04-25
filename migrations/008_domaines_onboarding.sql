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
-- Only backfill onboarding_step=1 for existing enterprise accounts the FIRST time this migration
-- runs (when the column doesn't exist yet). Running it on every server restart (since migrate()
-- is called on each start) would lock accounts that have already completed onboarding.
DO $$
DECLARE
  col_existed BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'utilisateurs' AND column_name = 'onboarding_step'
  ) INTO col_existed;

  IF NOT col_existed THEN
    ALTER TABLE utilisateurs ADD COLUMN onboarding_step INTEGER NOT NULL DEFAULT 0;
    UPDATE utilisateurs SET onboarding_step = 1 WHERE compte_type = 'entreprise';
  END IF;
END $$;

-- Ensure column exists even if DO block skipped (safe no-op if already present)
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NOT NULL DEFAULT 0;

-- Unique constraint on telephone in profil_entreprise (safe idempotent form)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profil_entreprise_telephone_unique'
  ) THEN
    ALTER TABLE profil_entreprise ADD CONSTRAINT profil_entreprise_telephone_unique UNIQUE (telephone);
  END IF;
END $$;
