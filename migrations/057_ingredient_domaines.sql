-- Each ingredient can be linked to one or more domaines d'activité.
-- Ingredients with no domaine entries are visible to ALL clients (universal).
-- Ingredients with domaine entries are visible only to clients whose activité domaine matches.
CREATE TABLE IF NOT EXISTS ingredient_domaines (
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  domaine_id    INTEGER NOT NULL REFERENCES domaines_activite(id) ON DELETE CASCADE,
  PRIMARY KEY (ingredient_id, domaine_id)
);

CREATE INDEX IF NOT EXISTS idx_ingredient_domaines_domaine ON ingredient_domaines(domaine_id);
