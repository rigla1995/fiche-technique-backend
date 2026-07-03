-- Migration 139 : seuil d'alerte des PT PAR ACTIVITÉ (aligné sur les articles et
-- sur le labo, où le seuil PT est déjà par labo via labo_pt_selections.seuil_min).
-- produits.seuil_min_pt (global au produit) devient le REPLI legacy : les écrans
-- lisent COALESCE(pas.seuil_min, p.seuil_min_pt).
ALTER TABLE produit_activite_stock ADD COLUMN IF NOT EXISTS seuil_min NUMERIC;
