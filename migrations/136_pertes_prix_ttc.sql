-- 136: pertes valorisées en TTC (règle métier : rapports/dashboard en TTC).
-- Ajoute prix_unitaire_tva aux tables de pertes ; renseigné à la création d'une perte
-- (prix TTC de l'article au moment de la perte). L'historique sans TTC retombe sur le HT
-- via COALESCE(prix_unitaire_tva, prix_unitaire) dans les rapports/dashboard.
ALTER TABLE pertes      ADD COLUMN IF NOT EXISTS prix_unitaire_tva NUMERIC;
ALTER TABLE labo_pertes ADD COLUMN IF NOT EXISTS prix_unitaire_tva NUMERIC;
