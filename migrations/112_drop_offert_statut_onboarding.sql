-- Migration: retirer 'offert' de la contrainte statut_onboarding.
-- 'offert' n'est jamais utilisé par l'application (vestige de la contrainte d'origine 025).
-- Sécurité : on convertit d'éventuelles lignes legacy 'offert' → 'gratuit' avant de resserrer,
-- sinon l'ajout de la contrainte échouerait.
UPDATE abonnements SET statut_onboarding = 'gratuit' WHERE statut_onboarding = 'offert';
ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_statut_onboarding_check;
ALTER TABLE abonnements ADD CONSTRAINT abonnements_statut_onboarding_check
  CHECK (statut_onboarding IN ('payé', 'impayé', 'gratuit', 'en_attente'));
