-- TVA fields on appro tables and labo_transfers
ALTER TABLE stock_client_daily ADD COLUMN IF NOT EXISTS taux_tva DECIMAL(5,2);
ALTER TABLE stock_client_daily ADD COLUMN IF NOT EXISTS prix_unitaire_tva DECIMAL(10,3);

ALTER TABLE stock_entreprise_daily ADD COLUMN IF NOT EXISTS taux_tva DECIMAL(5,2);
ALTER TABLE stock_entreprise_daily ADD COLUMN IF NOT EXISTS prix_unitaire_tva DECIMAL(10,3);

ALTER TABLE stock_labo_daily ADD COLUMN IF NOT EXISTS taux_tva DECIMAL(5,2);
ALTER TABLE stock_labo_daily ADD COLUMN IF NOT EXISTS prix_unitaire_tva DECIMAL(10,3);

ALTER TABLE labo_transfers ADD COLUMN IF NOT EXISTS prix_unitaire DECIMAL(10,3);
ALTER TABLE labo_transfers ADD COLUMN IF NOT EXISTS taux_tva DECIMAL(5,2);
ALTER TABLE labo_transfers ADD COLUMN IF NOT EXISTS prix_unitaire_tva DECIMAL(10,3);
