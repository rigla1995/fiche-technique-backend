-- Backfill taux_tva = 0 and prix_unitaire_tva = prix_unitaire for existing rows without TVA
UPDATE stock_entreprise_daily
SET taux_tva = 0, prix_unitaire_tva = prix_unitaire
WHERE taux_tva IS NULL AND prix_unitaire IS NOT NULL;

UPDATE stock_labo_daily
SET taux_tva = 0, prix_unitaire_tva = prix_unitaire
WHERE taux_tva IS NULL AND prix_unitaire IS NOT NULL;

UPDATE stock_client_daily
SET taux_tva = 0, prix_unitaire_tva = prix_unitaire
WHERE taux_tva IS NULL AND prix_unitaire IS NOT NULL;

UPDATE labo_transfers
SET taux_tva = 0, prix_unitaire_tva = prix_unitaire
WHERE taux_tva IS NULL AND prix_unitaire IS NOT NULL;
