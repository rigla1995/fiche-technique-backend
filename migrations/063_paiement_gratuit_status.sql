-- Add 'gratuit' as a valid paiement statut
ALTER TABLE paiements DROP CONSTRAINT IF EXISTS paiements_statut_check;
ALTER TABLE paiements ADD CONSTRAINT paiements_statut_check
  CHECK (statut IN ('payé', 'impayé', 'en_attente', 'remisé', 'gratuit'));

-- Mark existing 0-DT en_attente payments as gratuit
UPDATE paiements SET statut = 'gratuit' WHERE montant_dt = 0 AND statut = 'en_attente';

-- Ensure tarifs_config base data exists
INSERT INTO tarifs_config (cle, valeur_dt, description) VALUES
  ('indep_mensuel',         200,  'Abonnement mensuel Indépendant'),
  ('indep_onboarding',      1000, 'Frais onboarding Indépendant'),
  ('entreprise_mensuel',    400,  'Abonnement mensuel Entreprise'),
  ('entreprise_onboarding', 1500, 'Frais onboarding Entreprise'),
  ('gerant_sup_mensuel',    80,   'Gérant supplémentaire mensuel'),
  ('labo_sup_mensuel',      150,  'Labo supplémentaire mensuel')
ON CONFLICT (cle) DO NOTHING;
