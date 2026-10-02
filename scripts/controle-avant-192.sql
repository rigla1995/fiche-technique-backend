-- Lot 2b — lecture de la base AVANT le déploiement de la migration 192 (spec docs/lot-2b-spec.md §13.2).
-- Même contenu que scripts/controle-avant-192.js, pour le terminal psql du service Postgres de Coolify
-- (le script node n'existe pas dans le conteneur de production avant la bascule).
-- LECTURE SEULE : tout se passe dans une transaction READ ONLY, annulée à la fin (ROLLBACK).
-- Coller le fichier entier dans psql, connecté à la base de production. Garder la sortie avec le compte rendu.
-- Une ligne en (2), (3) ou (6) : à corriger AVANT le déploiement (noter la valeur avant et après).
-- (5) : à relancer APRÈS chaque bascule et chaque redéploiement (avant la 192 : la colonne genre est absente,
-- la lecture rend 0 ligne).

BEGIN TRANSACTION READ ONLY;

\echo '=== Base lue (avant la bascule, la production attend 191 ; 192 = base locale ou déjà basculée) ==='
SELECT current_database() AS base, current_user AS utilisateur,
       host(inet_server_addr()) AS hote_serveur, inet_server_port() AS port_serveur, now() AS lu_le,
       (SELECT MAX(filename) FROM _migrations WHERE filename LIKE '%.sql') AS derniere_migration;

\echo '=== (1) Composants identité renommés (pour information : ils gardent leur libellé) ==='
SELECT d.slug, dc.code, dc.libelle, dc.libelle_pluriel
  FROM domaine_composants dc
  JOIN domaines_activite d ON d.id = dc.domaine_id
 WHERE dc.code = dc.type_technique
   AND (dc.libelle, COALESCE(dc.libelle_pluriel, '')) NOT IN
       (('Activité','Activités'), ('Labo','Labos'), ('Gérant','Gérants'), ('Base acheteurs','Base acheteurs'))
 ORDER BY d.slug, dc.code;

\echo '=== (2) Entrées de lexique qui contiennent < ou > (À CORRIGER avant le déploiement) ==='
SELECT d.slug, e.key AS cle, e.value AS entree
  FROM domaines_activite d
 CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(d.lexique) = 'object' THEN d.lexique ELSE '{}'::jsonb END) e
 WHERE e.value::text ~ '[<>]'
 ORDER BY d.slug, e.key;

\echo '=== (3) Libellés de composant qui contiennent [ ] | (À CORRIGER avant le déploiement) ==='
SELECT d.slug, dc.code, dc.libelle, dc.libelle_pluriel
  FROM domaine_composants dc
  JOIN domaines_activite d ON d.id = dc.domaine_id
 WHERE strpos(dc.libelle, '[') > 0 OR strpos(dc.libelle, ']') > 0 OR strpos(dc.libelle, '|') > 0
    OR strpos(COALESCE(dc.libelle_pluriel, ''), '[') > 0 OR strpos(COALESCE(dc.libelle_pluriel, ''), ']') > 0
    OR strpos(COALESCE(dc.libelle_pluriel, ''), '|') > 0
 ORDER BY d.slug, dc.code;

\echo '=== (4) Composants de tous les domaines : genre et élision à poser dans l''admin après le déploiement ==='
-- genre_actuel / elision_actuelle : vides tant que la 192 n'est pas passée (colonnes absentes).
SELECT d.slug, dc.code, dc.type_technique AS type, dc.libelle, dc.libelle_pluriel AS pluriel, dc.actif,
       to_jsonb(dc) ->> 'genre' AS genre_actuel, to_jsonb(dc) ->> 'elision' AS elision_actuelle,
       CASE WHEN (dc.code, dc.type_technique, dc.libelle) IN (('activite', 'activite', 'Activité'), ('acheteurs', 'acheteurs', 'Base acheteurs'))
              OR (dc.code = 'cuisine' AND dc.type_technique = 'labo' AND dc.libelle = 'Cuisine' AND d.slug = 'hotellerie')
            THEN 'f (posé par la 192)' ELSE 'inchangé (m par défaut) : à vérifier' END AS apres_192
  FROM domaine_composants dc
  JOIN domaines_activite d ON d.id = dc.domaine_id
 ORDER BY d.slug, dc.ordre, dc.id;

\echo '=== (5) APRÈS la bascule : composants identité Activité / Base acheteurs restés masculins (À CORRIGER dans l''admin) ==='
SELECT d.slug, dc.id, dc.code, dc.libelle, to_jsonb(dc) ->> 'genre' AS genre
  FROM domaine_composants dc
  JOIN domaines_activite d ON d.id = dc.domaine_id
 WHERE dc.code = dc.type_technique AND to_jsonb(dc) ->> 'genre' = 'm'
   AND (dc.code, dc.libelle) IN (('activite', 'Activité'), ('acheteurs', 'Base acheteurs'))
 ORDER BY d.slug, dc.id;

\echo '=== (6) Noms saisis qui contiennent [[ ou ]] (spec §5.1, À RENOMMER avant le déploiement) ==='
SELECT 'articles' AS table_, id::text AS id, nom FROM articles WHERE strpos(nom, '[[') > 0 OR strpos(nom, ']]') > 0
UNION ALL SELECT 'produits', id::text, nom FROM produits WHERE strpos(nom, '[[') > 0 OR strpos(nom, ']]') > 0
UNION ALL SELECT 'labos', id::text, nom FROM labos WHERE strpos(nom, '[[') > 0 OR strpos(nom, ']]') > 0
UNION ALL SELECT 'activites', id::text, nom FROM activites WHERE strpos(nom, '[[') > 0 OR strpos(nom, ']]') > 0
UNION ALL SELECT 'fournisseurs', id::text, nom FROM fournisseurs WHERE strpos(nom, '[[') > 0 OR strpos(nom, ']]') > 0
UNION ALL SELECT 'categories', id::text, nom FROM categories WHERE strpos(nom, '[[') > 0 OR strpos(nom, ']]') > 0
UNION ALL SELECT 'categories_produit', id::text, nom FROM categories_produit WHERE strpos(nom, '[[') > 0 OR strpos(nom, ']]') > 0
UNION ALL SELECT 'familles', id::text, nom FROM familles WHERE strpos(nom, '[[') > 0 OR strpos(nom, ']]') > 0
UNION ALL SELECT 'prestataires_livraison', id::text, nom FROM prestataires_livraison WHERE strpos(nom, '[[') > 0 OR strpos(nom, ']]') > 0
UNION ALL SELECT 'acheteurs', id::text, nom FROM acheteurs WHERE strpos(nom, '[[') > 0 OR strpos(nom, ']]') > 0
UNION ALL SELECT 'utilisateurs', id::text, nom FROM utilisateurs WHERE strpos(nom, '[[') > 0 OR strpos(nom, ']]') > 0
ORDER BY 1, 2;

ROLLBACK;
