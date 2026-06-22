-- Migration: corriger la contrainte abonnements_statut_onboarding_check.
-- La contrainte d'origine (025) n'autorisait que ('payé','impayé','offert'), mais le code
-- utilise aussi 'gratuit' (promo free_months onboarding) et 'en_attente'. Une création de
-- client avec promotion gratuite échouait donc avec une violation de contrainte (23514).
ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_statut_onboarding_check;
ALTER TABLE abonnements ADD CONSTRAINT abonnements_statut_onboarding_check
  CHECK (statut_onboarding IN ('payé', 'impayé', 'offert', 'gratuit', 'en_attente'));
