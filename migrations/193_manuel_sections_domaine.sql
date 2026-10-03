-- 193 — Lot 2c : variantes du manuel par domaine d'activité (spec docs/lot-2c-spec.md §4.1, I12).
--
-- Une variante remplace, pour les comptes d'UN domaine, le titre et le contenu d'une fiche du manuel
-- (manuel_sections). Elle est lue par la requête commune de src/utils/manuelRendu.js (requeteManuel, §5.2)
-- seulement si son statut est 'valide' ET si le lexique du domaine du lecteur s'écarte du défaut ;
-- sinon le texte commun est servi.
--   • ciblage par le SLUG du domaine, sans clé étrangère : les ids diffèrent d'une base à l'autre, et un
--     brouillon peut viser un domaine absent (Céramique en production) ;
--   • 'restauration' refusé par contrainte : aucune variante pour le domaine par défaut ;
--   • slug de 1 à 50 caractères [a-z0-9-] (slugify de domainesController en produit 1 à 45) ;
--   • base_md5 = md5 du contenu commun SERVI (manuel_sections.contenu, sans \r) relu par la variante :
--     l'admin montre « à revoir » quand le texte commun a changé depuis ;
--   • une fiche supprimée emporte ses variantes (ON DELETE CASCADE).
-- Pas de colonne partie : la partie reste commune (la navigation du guide regroupe par partie).
--
-- Idempotente : CREATE TABLE IF NOT EXISTS ; aucune donnée écrite ici (les brouillons sont ceux de la 196).
-- Inoffensive pour l'ancien serveur : il ne lit pas cette table. Retour arrière : on la laisse.

CREATE TABLE IF NOT EXISTS manuel_sections_domaine (
  id           SERIAL PRIMARY KEY,
  section_id   INTEGER NOT NULL REFERENCES manuel_sections(id) ON DELETE CASCADE,
  domaine_slug VARCHAR(50) NOT NULL,
  titre        VARCHAR(200),               -- NULL : titre commun
  contenu      TEXT NOT NULL,              -- balisé, rendu avec le vocabulaire du domaine
  mots_cles    TEXT,                       -- NULL : mots-clés communs (jamais balisés)
  statut       VARCHAR(10) NOT NULL DEFAULT 'brouillon',
  base_md5     CHAR(32),                   -- md5 du contenu commun SERVI (manuel_sections.contenu, sans \r) relu
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT manuel_sections_domaine_statut_chk CHECK (statut IN ('brouillon', 'valide')),
  CONSTRAINT manuel_sections_domaine_slug_chk CHECK (domaine_slug ~ '^[a-z0-9-]{1,50}$' AND domaine_slug <> 'restauration'),
  CONSTRAINT manuel_sections_domaine_uq UNIQUE (section_id, domaine_slug)
);

COMMENT ON TABLE manuel_sections_domaine IS
  'Variantes du manuel par domaine (lot 2c, migration 193) : servies seulement si statut = valide et lexique du domaine différent du défaut';
