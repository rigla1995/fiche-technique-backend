-- Migration 264 : V1b « Tout fichier de caisse, journées et documents » (labflow-reprise/ventes-cartes/
-- PLAN-VENTES-CARTES.md §5 bis ; feu vert du client du 18/11/2026 : « accepter tous mes fichiers, les détecter et
-- demander la correspondance »).
--   • ventes_imports.source : le CSV s'ajoute à l'Excel et au PDF.
--   • caisse_modeles : ce qui est APPRIS d'un modèle de fichier, par activité. Quand les colonnes d'un fichier ne se
--     reconnaissent pas seules, l'utilisateur les désigne (désignation, quantité, montant…) ; la ligne de titres du
--     fichier (`signature`) et ce choix (`colonnes`) sont retenus : le fichier suivant de la même caisse se lit sans
--     question.
--   • ventes_imports : annulation et remplacement d'une journée (`annule_le`, `annule_par`, `remplace_par`) ; le
--     document d'origine conservé avec l'import (`document_cle` dans le stockage des fichiers, privé).
--     `annule_par` et `remplace_par` sont de simples repères, SANS clé étrangère : une seconde clé « ON DELETE SET
--     NULL » sur cette table fait échouer la suppression d'un compte (la ligne, retouchée deux fois dans la même
--     instruction, est recontrôlée alors que son activité vient d'être supprimée).
-- Idempotente.
ALTER TABLE ventes_imports DROP CONSTRAINT IF EXISTS ventes_imports_source_check;
ALTER TABLE ventes_imports ADD CONSTRAINT ventes_imports_source_check CHECK (source IN ('excel', 'pdf', 'csv'));

ALTER TABLE ventes_imports
  ADD COLUMN IF NOT EXISTS annule_le       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS annule_par      INTEGER,
  ADD COLUMN IF NOT EXISTS remplace_par    INTEGER,
  ADD COLUMN IF NOT EXISTS document_cle    VARCHAR(200),
  ADD COLUMN IF NOT EXISTS document_type   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS document_taille INTEGER;

ALTER TABLE ventes_imports DROP CONSTRAINT IF EXISTS ventes_imports_annule_par_fkey;
ALTER TABLE ventes_imports DROP CONSTRAINT IF EXISTS ventes_imports_remplace_par_fkey;

CREATE TABLE IF NOT EXISTS caisse_modeles (
  id          SERIAL PRIMARY KEY,
  activite_id INTEGER NOT NULL REFERENCES activites(id) ON DELETE CASCADE,
  signature   VARCHAR(400) NOT NULL,
  colonnes    JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activite_id, signature)
);
