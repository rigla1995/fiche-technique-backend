-- Ensure activite_id in inventaires belongs to the same entreprise as labo_id (when both are set).
-- Application-layer ownership validation is already enforced in inventaireController.js.
-- This migration adds a DB-level trigger as a defense-in-depth measure.

CREATE OR REPLACE FUNCTION check_inventaire_activite_ownership()
RETURNS TRIGGER AS $$
BEGIN
  -- When activite_id is set, verify it belongs to the same enterprise as the authenticated context.
  -- We enforce that activite_id actually exists in activites (FK already does this).
  -- Additionally, if both activite_id and labo_id are set, they must belong to the same entreprise.
  IF NEW.activite_id IS NOT NULL AND NEW.labo_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM activites a
      JOIN labos l ON l.entreprise_id = a.entreprise_id
      WHERE a.id = NEW.activite_id AND l.id = NEW.labo_id
    ) THEN
      RAISE EXCEPTION 'inventaires: activite_id % and labo_id % do not belong to the same entreprise',
        NEW.activite_id, NEW.labo_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventaire_activite_ownership ON inventaires;
CREATE TRIGGER trg_inventaire_activite_ownership
  BEFORE INSERT OR UPDATE ON inventaires
  FOR EACH ROW EXECUTE FUNCTION check_inventaire_activite_ownership();

-- Index to speed up the ownership check join
CREATE INDEX IF NOT EXISTS idx_activites_entreprise_id ON activites(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_labos_entreprise_id ON labos(entreprise_id);
