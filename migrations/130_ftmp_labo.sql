-- Fiche technique des produits valorisés composés : prix manuels saisis dans le
-- contexte d'un LABO (et non d'une activité). On ajoute une colonne labo_id à la
-- table des prix manuels et on l'intègre à la clé primaire pour distinguer
-- proprement le contexte labo (activite_id = 0, labo_id = L) du contexte activité
-- (activite_id = A, labo_id = 0).
ALTER TABLE fiche_technique_manual_prices
  ADD COLUMN IF NOT EXISTS labo_id INTEGER NOT NULL DEFAULT 0;

ALTER TABLE fiche_technique_manual_prices
  DROP CONSTRAINT IF EXISTS fiche_technique_manual_prices_pkey;

ALTER TABLE fiche_technique_manual_prices
  ADD PRIMARY KEY (produit_id, ingredient_id, client_id, activite_id, labo_id);

-- labo_id utilise 0 pour « pas de labo » (pas de FK possible). On nettoie via trigger,
-- en miroir du trigger activité (voir 056_ftmp_activite_cascade.sql).
CREATE OR REPLACE FUNCTION delete_ftmp_on_labo_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM fiche_technique_manual_prices WHERE labo_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_ftmp_labo_delete ON labos;
CREATE TRIGGER trg_ftmp_labo_delete
  BEFORE DELETE ON labos
  FOR EACH ROW EXECUTE FUNCTION delete_ftmp_on_labo_delete();
