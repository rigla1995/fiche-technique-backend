-- Migration: catégorie de produit (globale, par article) pour les articles valorisés.
-- La catégorie d'un article valorisé est désormais assignée par article (et non par activité).

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS categorie_produit_id INTEGER REFERENCES categories_produit(id) ON DELETE SET NULL;
