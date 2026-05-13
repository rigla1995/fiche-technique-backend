-- Track who actually created the support request (could be gérant or client)
ALTER TABLE support_demandes ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE support_demandes ADD COLUMN IF NOT EXISTS created_by_nom VARCHAR(255);

-- Backfill: creator was always the client_id owner
UPDATE support_demandes sd
SET created_by = sd.client_id,
    created_by_nom = u.nom
FROM utilisateurs u
WHERE u.id = sd.client_id AND sd.created_by IS NULL;
