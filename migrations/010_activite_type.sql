ALTER TABLE activites ADD COLUMN IF NOT EXISTS type VARCHAR(20);

UPDATE activites a
SET type = CASE WHEN pe.meme_activite = true THEN 'franchise' ELSE 'distincte' END
FROM profil_entreprise pe
WHERE a.entreprise_id = pe.id AND pe.meme_activite IS NOT NULL;
