-- Make fournisseurs.entreprise_id nullable to support indépendant fournisseurs (client_id only)
ALTER TABLE fournisseurs ALTER COLUMN entreprise_id DROP NOT NULL;
