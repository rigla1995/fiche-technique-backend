-- Add account type to distinguish client (individual) from entreprise (multi-activity)
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS compte_type VARCHAR(20) NOT NULL DEFAULT 'client';
