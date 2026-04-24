CREATE TABLE IF NOT EXISTS fiche_technique_manual_prices (
  produit_id   INTEGER NOT NULL,
  ingredient_id INTEGER NOT NULL,
  client_id    INTEGER NOT NULL,
  activite_id  INTEGER NOT NULL DEFAULT 0,
  prix_unitaire DECIMAL(10,3) NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (produit_id, ingredient_id, client_id, activite_id)
);
