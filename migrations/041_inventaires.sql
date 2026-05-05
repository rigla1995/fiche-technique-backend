-- Physical stock inventory entries
-- Each inventaire entry sets a new baseline for stock calculation from date_inventaire onwards
CREATE TABLE IF NOT EXISTS inventaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labo_id INTEGER REFERENCES labos(id) ON DELETE CASCADE,
  activite_id INTEGER REFERENCES activites(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  produit_id INTEGER REFERENCES produits(id) ON DELETE CASCADE,
  quantite_reelle NUMERIC(15, 3) NOT NULL,
  date_inventaire DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT inv_context CHECK (labo_id IS NOT NULL OR activite_id IS NOT NULL),
  CONSTRAINT inv_item CHECK (
    (ingredient_id IS NOT NULL AND produit_id IS NULL) OR
    (ingredient_id IS NULL AND produit_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_inventaires_labo_ing
  ON inventaires(labo_id, ingredient_id, date_inventaire DESC)
  WHERE labo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventaires_act_ing
  ON inventaires(activite_id, ingredient_id, date_inventaire DESC)
  WHERE activite_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventaires_act_prod
  ON inventaires(activite_id, produit_id, date_inventaire DESC)
  WHERE produit_id IS NOT NULL;
