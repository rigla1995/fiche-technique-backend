-- Activation date for module vente
ALTER TABLE profil_entreprise ADD COLUMN IF NOT EXISTS module_vente_activated_at TIMESTAMP WITH TIME ZONE;

-- Set tarif module_vente to 100 DT (was 0 as placeholder)
UPDATE tarifs_config SET valeur_dt = 100 WHERE cle = 'module_vente';
