-- Migration: Catégories de produit (distinctes des catégories d'articles/ingrédients)
-- Concerne les produits vendables/suppléments et les articles valorisés (config vente).

CREATE TABLE IF NOT EXISTS categories_produit (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  nom VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (client_id, nom)
);

CREATE INDEX IF NOT EXISTS idx_categories_produit_client ON categories_produit(client_id);

-- Lien sur les produits (vendables/suppléments). Nullable: les utilisables n'en ont pas.
ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS categorie_produit_id INTEGER REFERENCES categories_produit(id) ON DELETE SET NULL;

-- Lien sur les articles vendables (pour les valorisés, affecté à la config du prix de vente).
ALTER TABLE activite_articles_vendables
  ADD COLUMN IF NOT EXISTS categorie_produit_id INTEGER REFERENCES categories_produit(id) ON DELETE SET NULL;

-- Backfill: créer une catégorie 'Non classé' par client ayant des produits vendables,
-- puis l'affecter aux produits vendables/suppléments sans catégorie.
INSERT INTO categories_produit (client_id, nom)
SELECT DISTINCT client_id, 'Non classé'
FROM produits
WHERE type = 'vendable'
ON CONFLICT (client_id, nom) DO NOTHING;

UPDATE produits p
SET categorie_produit_id = cp.id
FROM categories_produit cp
WHERE cp.client_id = p.client_id
  AND cp.nom = 'Non classé'
  AND p.type = 'vendable'
  AND p.categorie_produit_id IS NULL;
