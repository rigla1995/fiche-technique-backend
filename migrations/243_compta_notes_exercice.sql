-- Migration 243 : LabFlow Compta, étape E2 « Les flux de trésorerie, les notes et le jeu complet » (labflow-reprise/
-- achats-compta/PLAN-ETATS-FINANCIERS.md §2 ligne E2 ; réponse 4 du client du 14/10 : notes automatiques — soldes
-- intermédiaires de gestion, détail des postes — ET un texte libre par exercice). Le texte libre des notes aux états
-- financiers (méthodes comptables, faits marquants), un par exercice, saisi par le titulaire ou un gérant de niveau
-- Complet ; qui, quand. Les flux de trésorerie et les soldes intermédiaires de gestion sont calculés (rien à stocker).
-- Idempotente (IF NOT EXISTS) ; rien n'est modifié ailleurs.
CREATE TABLE IF NOT EXISTS compta.notes_exercice (
  id          SERIAL PRIMARY KEY,
  dossier_id  INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  exercice_id INTEGER NOT NULL REFERENCES compta.exercices(id) ON DELETE CASCADE,
  texte       TEXT NOT NULL DEFAULT '' CHECK (char_length(texte) <= 20000),
  modifie_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  modifie_le  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exercice_id)
);
CREATE INDEX IF NOT EXISTS idx_compta_notes_exercice_dossier ON compta.notes_exercice (dossier_id);
