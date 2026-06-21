-- Migration: tracer l'auteur des changements de prix de vente (historique config vente).
ALTER TABLE article_vendable_prix_historique
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
