-- Drop outdated CHECK constraint on demandeur_type.
-- The independant/entreprise distinction no longer exists — every account is just "client".
ALTER TABLE demandes DROP CONSTRAINT IF EXISTS demandes_demandeur_type_check;

-- Update existing rows that may have stale values
UPDATE demandes SET demandeur_type = 'client' WHERE demandeur_type NOT IN ('client');
