-- fiche_technique_manual_prices.activite_id uses 0 for indép (no real activité),
-- so a FK constraint can't be used directly. Use a trigger instead.
CREATE OR REPLACE FUNCTION delete_ftmp_on_activite_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM fiche_technique_manual_prices WHERE activite_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_ftmp_activite_delete ON activites;
CREATE TRIGGER trg_ftmp_activite_delete
  BEFORE DELETE ON activites
  FOR EACH ROW EXECUTE FUNCTION delete_ftmp_on_activite_delete();
