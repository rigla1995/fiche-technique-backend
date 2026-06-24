-- Migration 122: stocker l'ID de soumission Docuseal du contrat initial sur l'abonnement.
-- Permet de télécharger le contrat actif (initial) depuis « Mon abonnement », au même titre
-- que les avenants (déjà stockés dans support_demandes.docuseal_submission_id).

ALTER TABLE abonnements ADD COLUMN IF NOT EXISTS contrat_submission_id VARCHAR(64);
