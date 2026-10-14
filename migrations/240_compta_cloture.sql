-- Migration 240 : LabFlow Compta, étape X2 « La clôture de l'exercice » (labflow-reprise/achats-compta/PLAN-EXERCICES.md §2
-- ligne X2, §3, §5 ; réponses du client du 13/10 — « ok pour les 5 » : exercice clos DÉFINITIF, affectation du résultat
-- préparée en brouillard). Migration additive : aucun exercice ne change d'état, aucune écriture ne change de sens.
-- 1) L'exercice clos : qui l'a clos et quand, son résultat (positif = bénéfice, négatif = perte), ses deux écritures de
--    clôture (détermination du résultat dans l'exercice clos, à-nouveaux dans l'exercice suivant) et l'écriture
--    d'affectation du résultat préparée en brouillard (SET NULL si ce brouillard est supprimé : une autre se prépare alors).
--    L'état « clos » existe depuis la migration 208 ; rien ne le posait jusqu'ici.
ALTER TABLE compta.exercices ADD COLUMN IF NOT EXISTS clos_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE compta.exercices ADD COLUMN IF NOT EXISTS clos_le TIMESTAMPTZ;
ALTER TABLE compta.exercices ADD COLUMN IF NOT EXISTS resultat NUMERIC(18,3);
ALTER TABLE compta.exercices ADD COLUMN IF NOT EXISTS ecriture_resultat_id INTEGER REFERENCES compta.ecritures(id) ON DELETE SET NULL;
ALTER TABLE compta.exercices ADD COLUMN IF NOT EXISTS ecriture_an_id INTEGER REFERENCES compta.ecritures(id) ON DELETE SET NULL;
ALTER TABLE compta.exercices ADD COLUMN IF NOT EXISTS ecriture_affectation_id INTEGER REFERENCES compta.ecritures(id) ON DELETE SET NULL;

-- 2) L'origine « cloture » des deux écritures de clôture : validées d'office, exclues du lettrage et de l'échéancier (les
--    factures de l'exercice clos restent les pièces à lettrer ; les à-nouveaux d'une balance importée — origine « import » —
--    y comptent toujours : seules traces des factures d'avant). Liste complète de la migration 228, étendue.
ALTER TABLE compta.ecritures DROP CONSTRAINT IF EXISTS ecritures_origine_check;
ALTER TABLE compta.ecritures ADD CONSTRAINT ecritures_origine_check
  CHECK (origine IN ('saisie', 'import', 'contrepassation', 'labflow', 'cloture'));
CREATE INDEX IF NOT EXISTS idx_compta_ecritures_cloture ON compta.ecritures (dossier_id, exercice_id) WHERE origine = 'cloture';
