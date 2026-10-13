-- Migration 234 : LabFlow Compta, étape X1 « L'exercice suivant » (labflow-reprise/achats-compta/PLAN-EXERCICES.md §2
-- ligne X1, §5 ; réponses du client du 13/10 — « ok pour les 5 »). Un dossier tient deux exercices ouverts au plus ; le
-- suivant s'ouvre à la main (fiche du dossier) ou de lui-même à la première écriture de la nouvelle année. Migration
-- additive : aucun exercice, aucune période, aucune écriture ne change de dates ni de numéro.
-- 1) Le MILLÉSIME de l'exercice : l'année de ses numéros définitifs (AC-2027-000001), unique dans le dossier — l'année du
--    début, sinon (déjà prise : premier exercice court) celle de la fin. Rempli pour l'existant avec l'année du début (un
--    seul exercice par dossier jusqu'ici : les numéros déjà donnés ne changent pas) ; garde au cas où deux exercices d'un
--    dossier commenceraient la même année (le plus récent prend l'année de sa fin).
ALTER TABLE compta.exercices ADD COLUMN IF NOT EXISTS millesime SMALLINT;
UPDATE compta.exercices x
   SET millesime = CASE
         WHEN EXISTS (SELECT 1 FROM compta.exercices y
                       WHERE y.dossier_id = x.dossier_id AND y.id <> x.id AND y.debut < x.debut
                         AND EXTRACT(YEAR FROM y.debut) = EXTRACT(YEAR FROM x.debut))
         THEN EXTRACT(YEAR FROM x.fin)::int
         ELSE EXTRACT(YEAR FROM x.debut)::int
       END
 WHERE x.millesime IS NULL;
ALTER TABLE compta.exercices ALTER COLUMN millesime SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE compta.exercices ADD CONSTRAINT ck_compta_exercices_millesime CHECK (millesime BETWEEN 1 AND 9999);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_compta_exercices_millesime ON compta.exercices (dossier_id, millesime);

-- 2) Comment l'exercice est né : à la création du dossier, ouvert à la main (titulaire ou Complet) ou de lui-même (première
--    écriture de la nouvelle année) ; et par qui (NULL : création, ou auteur disparu). Le journal des événements garde le
--    détail (exercice_ouvert : mode, déclencheur).
ALTER TABLE compta.exercices ADD COLUMN IF NOT EXISTS ouverture VARCHAR(10) NOT NULL DEFAULT 'creation';
DO $$ BEGIN
  ALTER TABLE compta.exercices ADD CONSTRAINT ck_compta_exercices_ouverture CHECK (ouverture IN ('creation', 'manuelle', 'auto'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE compta.exercices ADD COLUMN IF NOT EXISTS ouvert_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
