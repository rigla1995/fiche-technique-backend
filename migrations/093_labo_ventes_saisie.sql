-- ─────────────────────────────────────────────────────────────────────────────
-- 093 — Ventes Labo : support labo_id dans articles_vendables et ventes
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ajouter labo_id optionnel dans activite_articles_vendables
ALTER TABLE activite_articles_vendables
  ADD COLUMN IF NOT EXISTS labo_id INTEGER REFERENCES labos(id) ON DELETE CASCADE;

-- Rendre activite_id nullable (une entrée peut être pour une activité OU un labo)
ALTER TABLE activite_articles_vendables
  ALTER COLUMN activite_id DROP NOT NULL;

-- 2. Ajouter labo_id optionnel dans ventes
ALTER TABLE ventes
  ADD COLUMN IF NOT EXISTS labo_id INTEGER REFERENCES labos(id) ON DELETE CASCADE;

-- Rendre activite_id nullable dans ventes
ALTER TABLE ventes
  ALTER COLUMN activite_id DROP NOT NULL;

-- 3. Ajouter labo_id optionnel dans activite_prestataires (commission par labo)
ALTER TABLE activite_prestataires
  ADD COLUMN IF NOT EXISTS labo_id INTEGER REFERENCES labos(id) ON DELETE CASCADE;

ALTER TABLE activite_prestataires
  ALTER COLUMN activite_id DROP NOT NULL;

-- 4. Charges fixes pour labo
ALTER TABLE charges_fixes
  ADD COLUMN IF NOT EXISTS labo_id INTEGER REFERENCES labos(id) ON DELETE CASCADE UNIQUE;

ALTER TABLE charges_fixes
  ALTER COLUMN activite_id DROP NOT NULL;

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_activite_articles_vendables_labo ON activite_articles_vendables(labo_id) WHERE labo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ventes_labo ON ventes(labo_id) WHERE labo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activite_prestataires_labo ON activite_prestataires(labo_id) WHERE labo_id IS NOT NULL;
