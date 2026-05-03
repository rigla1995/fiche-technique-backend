-- Backfill abonnements for existing clients who were created before migration 025.
-- Uses 1st of current month as date_debut. Tarif amounts are taken from tarifs_config.
-- A paiement record for the current month is also inserted as 'en_attente'.

INSERT INTO abonnements (client_id, compte_type, statut_onboarding, montant_onboarding, date_debut, mode_compte)
SELECT
  u.id,
  COALESCE(u.compte_type, 'independant'),
  'impayé',
  tc.valeur_dt,
  DATE_TRUNC('month', CURRENT_DATE)::DATE,
  'actif'
FROM utilisateurs u
LEFT JOIN abonnements a ON a.client_id = u.id
JOIN tarifs_config tc ON tc.cle = CASE WHEN u.compte_type = 'entreprise' THEN 'entreprise_onboarding' ELSE 'indep_onboarding' END
WHERE u.role = 'client'
  AND a.id IS NULL;

-- Insert current-month payment record for each newly created abonnement
INSERT INTO paiements (abonnement_id, mois, montant_dt, statut)
SELECT
  a.id,
  DATE_TRUNC('month', CURRENT_DATE)::DATE,
  tc.valeur_dt,
  'en_attente'
FROM abonnements a
JOIN utilisateurs u ON u.id = a.client_id
JOIN tarifs_config tc ON tc.cle = CASE WHEN u.compte_type = 'entreprise' THEN 'entreprise_mensuel' ELSE 'indep_mensuel' END
WHERE NOT EXISTS (
  SELECT 1 FROM paiements p
  WHERE p.abonnement_id = a.id
    AND p.mois = DATE_TRUNC('month', CURRENT_DATE)::DATE
);
