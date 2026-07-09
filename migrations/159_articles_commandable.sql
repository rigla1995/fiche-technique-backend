-- 159 — Module Acheteurs : le flag « proposable aux acheteurs » passe des FAMILLES
-- (achetable, migr 153) aux ARTICLES (commandable). Backfill conservateur :
-- les articles des familles achetables et les articles ayant déjà une offre
-- restent proposables, puis la colonne famille disparaît.

ALTER TABLE articles ADD COLUMN IF NOT EXISTS commandable BOOLEAN NOT NULL DEFAULT false;

UPDATE articles a SET commandable = true
FROM categories c
JOIN familles f ON f.id = c.famille_id
WHERE a.categorie_id = c.id AND f.achetable = true;

UPDATE articles a SET commandable = true
WHERE EXISTS (
  SELECT 1 FROM acheteur_offres o
  WHERE o.article_type = 'ingredient' AND o.article_id = a.id AND o.client_id = a.client_id
);

ALTER TABLE familles DROP COLUMN IF EXISTS achetable;
