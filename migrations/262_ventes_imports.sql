-- Migration 262 : V1a « Importer un fichier de caisse » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et
-- §5 bis ; feu vert du client du 18/11/2026). Les ventes d'une journée se créent depuis l'export de la caisse (Excel,
-- PDF) : chaque ligne du fichier est rattachée à un produit de la carte, ses quantités réparties par canal.
--   • vente_lignes.prix_unitaire : 6 décimales. Le prix d'une vente importée est le montant réel de la ligne divisé par
--     sa quantité (145,620 ÷ 7) ; à 2 décimales le chiffre de LabFlow ne retombait pas sur celui de la caisse.
--     Les prix saisis à la main gardent leur valeur.
--   • ventes_imports : un import = une activité, une journée, un fichier (empreinte). Une journée ne s'importe qu'une
--     fois, un fichier aussi (le remplacement d'une journée est l'étape V1b).
--   • ventes_imports_lignes : les lignes telles que lues et ce qui en a été fait (produit, répartition par canal).
--   • ventes.import_id : la vente créée par un import (NULL : saisie à la main).
--   • correspondances_ventes + _cibles : ce qui est APPRIS, par activité — une ligne de caisse (catégorie + désignation)
--     vaut un produit de la carte. Le modèle prévoit plusieurs cibles (menus et formules, étape V1c).
--   • caisse_categories : nature apprise d'une catégorie du fichier (livraison : prestataires seulement).
--   • règle de domaine « caisse » (vraie par défaut dans le code) posée à FAUX hors restauration, comme la règle
--     « prestataires » (migration 245), seulement si elle n'y est pas déjà réglée.
-- Idempotente.
ALTER TABLE vente_lignes ALTER COLUMN prix_unitaire TYPE NUMERIC(14,6);

CREATE TABLE IF NOT EXISTS ventes_imports (
  id               SERIAL PRIMARY KEY,
  activite_id      INTEGER NOT NULL REFERENCES activites(id) ON DELETE CASCADE,
  date_vente       DATE NOT NULL,
  source           VARCHAR(10) NOT NULL CHECK (source IN ('excel', 'pdf')),
  fichier_nom      VARCHAR(255),
  empreinte        CHAR(64) NOT NULL,
  modele           VARCHAR(80),
  total_lu         NUMERIC(14,3),
  total_enregistre NUMERIC(14,3) NOT NULL,
  nb_lignes        INTEGER NOT NULL,
  statut           VARCHAR(12) NOT NULL DEFAULT 'enregistre' CHECK (statut IN ('enregistre', 'annule')),
  created_by       INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ventes_imports_jour ON ventes_imports (activite_id, date_vente) WHERE statut = 'enregistre';
CREATE UNIQUE INDEX IF NOT EXISTS ux_ventes_imports_fichier ON ventes_imports (activite_id, empreinte) WHERE statut = 'enregistre';

CREATE TABLE IF NOT EXISTS ventes_imports_lignes (
  id           SERIAL PRIMARY KEY,
  import_id    INTEGER NOT NULL REFERENCES ventes_imports(id) ON DELETE CASCADE,
  rang         INTEGER NOT NULL,
  categorie    VARCHAR(120),
  designation  VARCHAR(255) NOT NULL,
  quantite     NUMERIC(12,3) NOT NULL,
  montant      NUMERIC(14,3) NOT NULL,
  ignoree      BOOLEAN NOT NULL DEFAULT false,
  article_type VARCHAR(20),
  article_id   INTEGER,
  repartition  JSONB
);
CREATE INDEX IF NOT EXISTS idx_ventes_imports_lignes_import ON ventes_imports_lignes (import_id);

ALTER TABLE ventes ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES ventes_imports(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ventes_import ON ventes (import_id) WHERE import_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS correspondances_ventes (
  id          SERIAL PRIMARY KEY,
  activite_id INTEGER NOT NULL REFERENCES activites(id) ON DELETE CASCADE,
  cle         VARCHAR(330) NOT NULL,
  categorie   VARCHAR(120),
  designation VARCHAR(255) NOT NULL,
  ignoree     BOOLEAN NOT NULL DEFAULT false,
  created_by  INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activite_id, cle)
);

CREATE TABLE IF NOT EXISTS correspondances_ventes_cibles (
  id                SERIAL PRIMARY KEY,
  correspondance_id INTEGER NOT NULL REFERENCES correspondances_ventes(id) ON DELETE CASCADE,
  article_type      VARCHAR(20) NOT NULL CHECK (article_type IN ('produit', 'ingredient')),
  article_id        INTEGER NOT NULL,
  quantite          NUMERIC(12,3) NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_correspondances_ventes_cibles ON correspondances_ventes_cibles (correspondance_id);

CREATE TABLE IF NOT EXISTS caisse_categories (
  id          SERIAL PRIMARY KEY,
  activite_id INTEGER NOT NULL REFERENCES activites(id) ON DELETE CASCADE,
  cle         VARCHAR(130) NOT NULL,
  nom         VARCHAR(120) NOT NULL,
  livraison   BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activite_id, cle)
);

UPDATE domaines_activite
   SET regles = COALESCE(regles, '{}'::jsonb) || '{"caisse": false}'::jsonb
 WHERE slug IN ('hotellerie', 'ceramique', 'usine')
   AND NOT (COALESCE(regles, '{}'::jsonb) ? 'caisse');
