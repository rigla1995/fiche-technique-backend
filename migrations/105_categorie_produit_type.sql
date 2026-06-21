-- Migration: typer les catégories de produit
-- Chaque catégorie est rattachée à un type: 'vendable' | 'supplement' | 'valorise'.

ALTER TABLE categories_produit
  ADD COLUMN IF NOT EXISTS type_produit VARCHAR(20) NOT NULL DEFAULT 'vendable';

-- Le nom n'a plus à être unique globalement par client, mais par (client, type).
ALTER TABLE categories_produit DROP CONSTRAINT IF EXISTS categories_produit_client_id_nom_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_produit_client_type_nom
  ON categories_produit (client_id, type_produit, nom);

-- La migration 104 a affecté un 'Non classé' (devenu type 'vendable') à TOUS les produits
-- vendables, suppléments inclus. On crée un 'Non classé' de type 'supplement' et on y
-- rebascule les suppléments pour cohérence avec le typage.
INSERT INTO categories_produit (client_id, nom, type_produit)
SELECT DISTINCT client_id, 'Non classé', 'supplement'
FROM produits
WHERE type = 'vendable' AND is_supplement = TRUE
ON CONFLICT (client_id, type_produit, nom) DO NOTHING;

UPDATE produits p
SET categorie_produit_id = cp.id
FROM categories_produit cp
WHERE cp.client_id = p.client_id
  AND cp.nom = 'Non classé'
  AND cp.type_produit = 'supplement'
  AND p.type = 'vendable'
  AND p.is_supplement = TRUE;
