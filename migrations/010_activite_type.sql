ALTER TABLE activites ADD COLUMN IF NOT EXISTS type VARCHAR(20);

-- Only backfill type for activities that don't have one yet.
-- This migration runs on every server start (via migrate()), so the WHERE type IS NULL
-- guard prevents overwriting explicitly-set types (e.g. 'distincte') with the enterprise default.
UPDATE activites a
SET type = CASE WHEN pe.meme_activite = true THEN 'franchise' ELSE 'distincte' END
FROM profil_entreprise pe
WHERE a.entreprise_id = pe.id AND pe.meme_activite IS NOT NULL AND a.type IS NULL;
