-- Client ingredient selections: tracks which ingredients a client chose to work with
CREATE TABLE IF NOT EXISTS client_ingredient_selections (
  client_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, ingredient_id)
);
