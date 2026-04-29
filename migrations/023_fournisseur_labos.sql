-- Add ref_labo (unique reference per enterprise) to labos
ALTER TABLE labos ADD COLUMN IF NOT EXISTS ref_labo VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS labos_entreprise_ref_unique ON labos(entreprise_id, ref_labo) WHERE ref_labo IS NOT NULL;

-- Many-to-many: non-labo fournisseurs can be assigned to labos
CREATE TABLE IF NOT EXISTS fournisseur_labos (
  fournisseur_id INT NOT NULL REFERENCES fournisseurs(id) ON DELETE CASCADE,
  labo_id        INT NOT NULL REFERENCES labos(id) ON DELETE CASCADE,
  PRIMARY KEY (fournisseur_id, labo_id)
);
