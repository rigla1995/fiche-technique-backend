ALTER TABLE client_pertes ADD COLUMN IF NOT EXISTS prix_unitaire NUMERIC(10,3);
ALTER TABLE pertes         ADD COLUMN IF NOT EXISTS prix_unitaire NUMERIC(10,3);
ALTER TABLE labo_pertes    ADD COLUMN IF NOT EXISTS prix_unitaire NUMERIC(10,3);
