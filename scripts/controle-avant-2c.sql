-- Lot 2c — lecture du manuel et de la base de connaissances AVANT le balisage (DEPART-2c §5, point 1).
-- But : prouver que le texte de production est celui des migrations (aucune fiche modifiée dans l'admin),
-- en comparant ces empreintes à celles de la base locale. Une fiche différente sera balisée à partir du
-- texte de production ; sans cette lecture, la garde md5 de la migration la laisserait en mots de la
-- restauration, sans erreur.
-- LECTURE SEULE : tout se passe dans une transaction READ ONLY, annulée à la fin (ROLLBACK).
-- Coller le fichier entier dans psql, connecté à la base de production. Renvoyer TOUTE la sortie.

BEGIN TRANSACTION READ ONLY;

\echo '=== Base lue ==='
SELECT current_database() AS base, now() AS lu_le,
       (SELECT MAX(filename) FROM _migrations WHERE filename LIKE '%.sql') AS derniere_migration;

\echo '=== (1) Empreintes globales (une seule ligne à comparer d abord) ==='
SELECT
  (SELECT count(*) FROM manuel_sections) AS fiches,
  (SELECT count(*) FROM manuel_sections WHERE actif) AS fiches_actives,
  (SELECT md5(string_agg(slug || '|' || titre || '|' || COALESCE(partie, '') || '|'
                         || md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) || '|'
                         || md5(replace(contenu, E'\r', '')) || '|' || COALESCE(mots_cles, ''),
                         E'\n' ORDER BY slug))
     FROM manuel_sections) AS empreinte_manuel,
  (SELECT count(*) FROM ai_knowledge_base) AS entrees_base,
  (SELECT md5(string_agg(lower(titre) || '|' || titre || '|' || md5(replace(contenu, E'\r', '')) || '|'
                         || COALESCE(mots_cles, '') || '|' || actif::text,
                         E'\n' ORDER BY lower(titre)))
     FROM ai_knowledge_base) AS empreinte_base;

\echo '=== (2) Fiches modifiées dans l admin (0 ligne attendue) ==='
SELECT slug, titre, updated_at
  FROM manuel_sections
 WHERE contenu_defaut IS NOT NULL AND contenu IS DISTINCT FROM contenu_defaut
 ORDER BY slug;

\echo '=== (3) Empreintes par fiche ==='
SELECT slug, actif, visible_gerant,
       md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) AS md5_garde,
       md5(replace(contenu, E'\r', '')) AS md5_contenu,
       contenu_defaut IS NULL AS defaut_null,
       md5(titre || '|' || COALESCE(partie, '') || '|' || COALESCE(mots_cles, '')) AS md5_entete,
       updated_at
  FROM manuel_sections
 ORDER BY slug;

\echo '=== (4) Empreintes par entrée de la base de connaissances ==='
SELECT id, titre, actif,
       md5(replace(contenu, E'\r', '')) AS md5_contenu,
       md5(COALESCE(mots_cles, '') || '|' || COALESCE(categorie, '')) AS md5_meta,
       updated_at
  FROM ai_knowledge_base
 ORDER BY lower(titre);

\echo '=== (5) Domaines (pour savoir lesquels existent en production) ==='
SELECT id, slug, nom,
       CASE WHEN jsonb_typeof(lexique) = 'object' THEN (SELECT count(*) FROM jsonb_object_keys(lexique)) ELSE 0 END AS cles_lexique
  FROM domaines_activite
 ORDER BY id;

ROLLBACK;
