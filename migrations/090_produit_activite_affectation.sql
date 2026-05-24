-- Many-to-many: vendable products ↔ activités (display only, not stock)
CREATE TABLE IF NOT EXISTS produit_activite_affectation (
  produit_id  INTEGER NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  activite_id INTEGER NOT NULL REFERENCES activites(id) ON DELETE CASCADE,
  PRIMARY KEY (produit_id, activite_id)
);
