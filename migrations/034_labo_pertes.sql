CREATE TABLE IF NOT EXISTS labo_pertes (
  id           SERIAL PRIMARY KEY,
  labo_id      INTEGER NOT NULL REFERENCES labos(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantite     NUMERIC NOT NULL,
  type_perte   VARCHAR(20) NOT NULL DEFAULT 'avarie',
  date_perte   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
