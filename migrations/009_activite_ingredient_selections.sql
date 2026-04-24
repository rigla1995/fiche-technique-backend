-- Per-activity ingredient selections (each activity has its own ingredient list)
CREATE TABLE IF NOT EXISTS activite_ingredient_selections (
  activite_id INTEGER REFERENCES activites(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  PRIMARY KEY (activite_id, ingredient_id)
);

-- Migrate existing entreprise ingredient selections into activite_ingredient_selections
-- For each entreprise client, copy their global selections to all their activities
INSERT INTO activite_ingredient_selections (activite_id, ingredient_id)
SELECT a.id, cis.ingredient_id
FROM activites a
JOIN profil_entreprise pe ON a.entreprise_id = pe.id
JOIN client_ingredient_selections cis ON cis.client_id = pe.client_id
ON CONFLICT DO NOTHING;
