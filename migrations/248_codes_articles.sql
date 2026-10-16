-- Migration 248 : D3 « Code des articles par catégorie » (labflow-reprise/PLAN-DOMAINES-ACHETEURS-CODES.md §2 ligne D3 ;
-- réponses du client du 15/10 : « plutôt par catégorie, attention à la confusion »).
--   • categories.prefixe_code et categories_produit.prefixe_code : 2 à 4 lettres ou chiffres, tirés du nom, uniques dans
--     le compte entre toutes les catégories des deux sortes (ART et PRD réservés aux fiches sans catégorie) ;
--   • articles.code : « PRÉFIXE-NNNN », unique dans le compte ; posé sur tous les articles existants, dans l'ordre de
--     création de chaque catégorie, sans heurter une référence de produit déjà numérotée avec le même préfixe ;
--   • produits.ref_produit : remplie quand elle est vide (préfixe de la catégorie de produits, sinon PRD), jamais
--     modifiée quand elle existe.
-- Idempotente : colonnes et index « si absents » ; reprise sur les lignes sans préfixe ou sans code seulement.
ALTER TABLE categories         ADD COLUMN IF NOT EXISTS prefixe_code VARCHAR(4);
ALTER TABLE categories_produit ADD COLUMN IF NOT EXISTS prefixe_code VARCHAR(4);
ALTER TABLE articles           ADD COLUMN IF NOT EXISTS code         VARCHAR(20);

-- 1. Les préfixes des catégories qui n'en ont pas (compte par compte, catégories d'articles puis de produits, par id).
DO $d3$
DECLARE
  c RECORD;
  lettres TEXT;
  cand TEXT;
  k INTEGER;
  pris TEXT[];
BEGIN
  FOR c IN
    SELECT 'c' AS t, id, client_id, nom FROM categories WHERE prefixe_code IS NULL AND client_id IS NOT NULL
    UNION ALL
    SELECT 'p' AS t, id, client_id, nom FROM categories_produit WHERE prefixe_code IS NULL
    ORDER BY client_id, t, id
  LOOP
    lettres := regexp_replace(translate(upper(c.nom), 'ÀÂÄÁÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑÝŸŒÆ', 'AAAAAAEEEEIIIIOOOOOUUUUCNYYOA'), '[^A-Z0-9]', '', 'g');
    IF length(lettres) < 2 THEN lettres := rpad(lettres, 2, 'X'); END IF;
    SELECT COALESCE(array_agg(upper(p)), '{}') INTO pris FROM (
      SELECT prefixe_code AS p FROM categories WHERE client_id = c.client_id AND prefixe_code IS NOT NULL
      UNION ALL
      SELECT prefixe_code FROM categories_produit WHERE client_id = c.client_id AND prefixe_code IS NOT NULL
    ) s;
    pris := pris || ARRAY['ART', 'PRD'];
    cand := substr(lettres, 1, 3);
    IF cand = ANY (pris) AND length(lettres) >= 4 THEN cand := substr(lettres, 1, 4); END IF;
    k := 2;
    WHILE cand = ANY (pris) AND k <= 99 LOOP
      IF k <= 9 THEN cand := substr(lettres, 1, 3) || k::text; ELSE cand := substr(lettres, 1, 2) || k::text; END IF;
      k := k + 1;
    END LOOP;
    IF c.t = 'c' THEN UPDATE categories SET prefixe_code = cand WHERE id = c.id;
    ELSE UPDATE categories_produit SET prefixe_code = cand WHERE id = c.id;
    END IF;
  END LOOP;
END
$d3$;

-- 2. Les codes des articles qui n'en ont pas : PRÉFIXE-NNNN par ordre d'id dans la catégorie, après le plus grand numéro
--    déjà porté par ce préfixe (références de produits déjà saisies sous cette forme).
WITH existants AS (
  SELECT client_id, upper(split_part(btrim(ref_produit), '-', 1)) AS pre,
         max((regexp_match(btrim(ref_produit), '^[A-Za-z0-9]+-(\d{1,6})$'))[1]::int) AS maxn
    FROM produits WHERE ref_produit ~ '^\s*[A-Za-z0-9]+-\d{1,6}\s*$'
   GROUP BY client_id, upper(split_part(btrim(ref_produit), '-', 1))
), num AS (
  SELECT a.id, a.client_id, COALESCE(c.prefixe_code, 'ART') AS pre,
         row_number() OVER (PARTITION BY a.client_id, COALESCE(c.prefixe_code, 'ART') ORDER BY a.id) AS rn
    FROM articles a LEFT JOIN categories c ON c.id = a.categorie_id
   WHERE a.code IS NULL
)
UPDATE articles a
   SET code = num.pre || '-' || lpad((num.rn + COALESCE(e.maxn, 0))::text, 4, '0')
  FROM num LEFT JOIN existants e ON e.client_id = num.client_id AND e.pre = num.pre
 WHERE a.id = num.id;

-- 3. Les références de produits vides : préfixe de la catégorie de produits (PRD sans catégorie), même numérotation.
WITH existants AS (
  SELECT client_id, upper(split_part(btrim(ref_produit), '-', 1)) AS pre,
         max((regexp_match(btrim(ref_produit), '^[A-Za-z0-9]+-(\d{1,6})$'))[1]::int) AS maxn
    FROM produits WHERE ref_produit ~ '^\s*[A-Za-z0-9]+-\d{1,6}\s*$'
   GROUP BY client_id, upper(split_part(btrim(ref_produit), '-', 1))
), num AS (
  SELECT p.id, p.client_id, COALESCE(cp.prefixe_code, 'PRD') AS pre,
         row_number() OVER (PARTITION BY p.client_id, COALESCE(cp.prefixe_code, 'PRD') ORDER BY p.id) AS rn
    FROM produits p LEFT JOIN categories_produit cp ON cp.id = p.categorie_produit_id
   WHERE NULLIF(BTRIM(p.ref_produit), '') IS NULL
)
UPDATE produits p
   SET ref_produit = num.pre || '-' || lpad((num.rn + COALESCE(e.maxn, 0))::text, 4, '0')
  FROM num LEFT JOIN existants e ON e.client_id = num.client_id AND e.pre = num.pre
 WHERE p.id = num.id;

-- 4. Unicité : un code par compte (articles) ; un préfixe par compte dans chaque table (entre les deux tables, le
--    serveur veille).
CREATE UNIQUE INDEX IF NOT EXISTS uq_articles_client_code ON articles (client_id, UPPER(code)) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_client_prefixe ON categories (client_id, UPPER(prefixe_code)) WHERE prefixe_code IS NOT NULL AND client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_produit_client_prefixe ON categories_produit (client_id, UPPER(prefixe_code)) WHERE prefixe_code IS NOT NULL;
