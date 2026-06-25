-- Migration 120: index ingredient_id sur les 3 tables de stock (suite audit, lot 5 partiel).
-- Les index composites existants débutent par client_id/activite_id/labo_id, donc inutilisables
-- pour les EXISTS 'has_appros' (articles/catégories/familles) qui filtrent par ingredient_id seul.
-- Exclus du lot 1 par prudence (coût d'écriture sur tables chaudes) ; appliqués ici car pas
-- encore de charge en production. CREATE INDEX IF NOT EXISTS (idempotent).

CREATE INDEX IF NOT EXISTS idx_sed_ingredient_id
  ON stock_entreprise_daily (ingredient_id);

CREATE INDEX IF NOT EXISTS idx_sld_ingredient_id
  ON stock_labo_daily (ingredient_id);

CREATE INDEX IF NOT EXISTS idx_scd_ingredient_id
  ON stock_client_daily (ingredient_id);
