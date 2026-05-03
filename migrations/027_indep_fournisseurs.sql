-- Add client_id to fournisseurs for independant accounts (no entreprise link)
ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE;
