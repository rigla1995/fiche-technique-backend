-- 197 — Lot 3, étape 1 : identité légale du client (spec docs/lot-3-spec.md §1.1, §2).
--
-- Colonnes ajoutées à profil_entreprise, toutes NULLables (aucune valeur existante n'est touchée) :
--   raison_sociale, nom_commercial (enseigne si elle diffère), forme_juridique (liste fermée, CHECK),
--   matricule_fiscal (normalisé par le serveur, src/utils/matriculeFiscal.js ; PAS d'unicité : groupes et
--   franchises), rne, ville (adresse = rue), representant_nom, representant_qualite.
-- profil_entreprise.nom garde son sens (copie du nom du contact, NOT NULL).
-- Nom affiché = nom commercial, sinon raison sociale, sinon nom du contact (src/utils/identite.js).
--
-- Idempotente : colonnes, contrainte et index « si absents ». Un second passage ne change rien.

ALTER TABLE profil_entreprise ADD COLUMN IF NOT EXISTS raison_sociale       VARCHAR(255);
ALTER TABLE profil_entreprise ADD COLUMN IF NOT EXISTS nom_commercial       VARCHAR(255);
ALTER TABLE profil_entreprise ADD COLUMN IF NOT EXISTS forme_juridique      VARCHAR(30);
ALTER TABLE profil_entreprise ADD COLUMN IF NOT EXISTS matricule_fiscal     VARCHAR(50);
ALTER TABLE profil_entreprise ADD COLUMN IF NOT EXISTS rne                  VARCHAR(50);
ALTER TABLE profil_entreprise ADD COLUMN IF NOT EXISTS ville                VARCHAR(120);
ALTER TABLE profil_entreprise ADD COLUMN IF NOT EXISTS representant_nom     VARCHAR(150);
ALTER TABLE profil_entreprise ADD COLUMN IF NOT EXISTS representant_qualite VARCHAR(80);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'profil_entreprise'::regclass
       AND conname = 'profil_entreprise_forme_juridique_check'
  ) THEN
    ALTER TABLE profil_entreprise
      ADD CONSTRAINT profil_entreprise_forme_juridique_check CHECK (
        forme_juridique IS NULL
        OR forme_juridique IN ('SARL', 'SUARL', 'SA', 'SNC', 'EI', 'AUTO_ENTREPRENEUR', 'ASSOCIATION', 'AUTRE')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profil_entreprise_mf
  ON profil_entreprise (matricule_fiscal) WHERE matricule_fiscal IS NOT NULL;

COMMENT ON COLUMN profil_entreprise.raison_sociale IS
  'Raison sociale légale du client (patente). Lot 3, migration 197.';
COMMENT ON COLUMN profil_entreprise.matricule_fiscal IS
  'Matricule fiscal normalisé (1234567A/A/M/000 ou 1234567A) ; vide autorisé ; pas d''unicité. Lot 3, migration 197.';
