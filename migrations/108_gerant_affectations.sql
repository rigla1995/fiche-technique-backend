-- Migration: affectations multiples pour les gérants.
-- Un gérant peut être affecté à plusieurs activités ET/OU plusieurs labos.
-- Remplace l'affectation unique (utilisateurs.gerant_activite_id / gerant_activite_type),
-- qui reste en place pour compatibilité ascendante.

CREATE TABLE IF NOT EXISTS gerant_affectations (
  id SERIAL PRIMARY KEY,
  gerant_id   INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  activite_id INTEGER REFERENCES activites(id) ON DELETE CASCADE,
  labo_id     INTEGER REFERENCES labos(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  -- exactement un des deux est renseigné
  CONSTRAINT chk_gerant_aff_one CHECK ((activite_id IS NOT NULL) <> (labo_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_gerant_aff_gerant ON gerant_affectations(gerant_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gerant_aff_act ON gerant_affectations(gerant_id, activite_id) WHERE activite_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_gerant_aff_labo ON gerant_affectations(gerant_id, labo_id) WHERE labo_id IS NOT NULL;

-- Backfill: convertir l'affectation unique existante en une ligne.
INSERT INTO gerant_affectations (gerant_id, activite_id, labo_id)
SELECT u.id,
       CASE WHEN u.gerant_activite_type = 'labo' THEN NULL ELSE u.gerant_activite_id END,
       CASE WHEN u.gerant_activite_type = 'labo' THEN u.gerant_activite_id ELSE NULL END
FROM utilisateurs u
WHERE u.role = 'gerant' AND u.gerant_activite_id IS NOT NULL
ON CONFLICT DO NOTHING;
