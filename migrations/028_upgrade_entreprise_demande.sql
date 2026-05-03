-- Allow upgrade_entreprise as a demande type
ALTER TABLE demandes DROP CONSTRAINT IF EXISTS demandes_type_demande_check;
ALTER TABLE demandes ADD CONSTRAINT demandes_type_demande_check
  CHECK (type_demande IN ('gerant_sup', 'labo_sup', 'upgrade_entreprise'));
