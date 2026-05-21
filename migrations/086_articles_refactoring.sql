-- Migration 086: Refonte ingrédients → articles
-- Chaque client gère son propre référentiel : Famille > Catégorie > Article
-- Le catalogue global admin est supprimé.

-- 1. Nouvelle table familles (niveau intermédiaire au-dessus de catégorie)
CREATE TABLE IF NOT EXISTS familles (
  id         SERIAL PRIMARY KEY,
  nom        VARCHAR(100) NOT NULL,
  client_id  INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(nom, client_id)
);

-- 2. Ajout famille_id et client_id sur categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS famille_id INTEGER REFERENCES familles(id) ON DELETE SET NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS client_id  INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE;

-- 3. Supprimer la contrainte UNIQUE globale sur categories.nom et créer une par client
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_nom_key;
CREATE UNIQUE INDEX IF NOT EXISTS categories_nom_client_uniq
  ON categories(nom, client_id)
  WHERE client_id IS NOT NULL;

-- 4. Supprimer domaine_id de categories (plus de filtrage par domaine sur les articles)
ALTER TABLE categories DROP COLUMN IF EXISTS domaine_id;

-- 5. Renommer ingredients → articles (PostgreSQL propage toutes les FK automatiquement)
ALTER TABLE ingredients RENAME TO articles;

-- 6. Ajouter seuil_min sur articles (remplace client_ingredient_selections.seuil_min pour clients indép)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS seuil_min NUMERIC(10,3);

-- 7. Supprimer ingredient_domaines (plus de filtrage par domaine)
DROP TABLE IF EXISTS ingredient_domaines;

-- 8. Supprimer client_ingredient_selections (modèle "sélection catalogue admin" supprimé)
--    Les clients possèdent directement leurs articles (WHERE articles.client_id = client_id)
DROP TABLE IF EXISTS client_ingredient_selections;
