-- Migration: tracer l'auteur des pertes labo.
ALTER TABLE labo_pertes
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
