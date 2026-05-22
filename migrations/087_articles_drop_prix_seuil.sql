-- Migration 087: Supprimer prix et seuil_min des articles
-- Ces champs sont désormais gérés par stock (prix_unitaire) par activité/labo
ALTER TABLE articles DROP COLUMN IF EXISTS prix;
ALTER TABLE articles DROP COLUMN IF EXISTS seuil_min;
