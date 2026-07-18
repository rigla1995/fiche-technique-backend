-- 171 — Traçabilité « créé par » sur TOUS les mouvements et objets métier.
-- Chaque écriture doit porter son auteur, quel que soit le contexte (demande
-- client 2026-07-18). Colonnes ajoutées là où elles manquent ; convention FK :
-- REFERENCES utilisateurs(id) ON DELETE SET NULL (pattern migr 110/166 — la
-- suppression d'un gérant/compte ne doit jamais casser l'historique).
-- Les lignes historiques restent à NULL (auteur inconnu, pas de backfill).

-- Stock PT labo (production, déduction sous-PT, miroir de transfert)
ALTER TABLE stock_labo_pt_daily
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;

-- Stock PT activité (production, déduction sous-PT, réception transfert, déduction vente)
ALTER TABLE stock_produits_transformes
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;

-- Créations du référentiel et des produits
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE fournisseurs
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;

-- Configuration vente
ALTER TABLE activite_articles_vendables
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE activite_prestataires
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE article_prix_prestataire
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE charges_fixes
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;

-- Module acheteurs (offres + factures ; commandes/statuts/carnet déjà tracés)
ALTER TABLE acheteur_offres
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE factures_acheteur
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
