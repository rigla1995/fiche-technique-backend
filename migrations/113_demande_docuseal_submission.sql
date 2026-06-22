-- Migration: lier une demande d'ajout de capacité à sa soumission Docuseal (avenant).
-- Permet au webhook de retrouver la demande à signer et de l'appliquer automatiquement.
ALTER TABLE support_demandes ADD COLUMN IF NOT EXISTS docuseal_submission_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_support_demandes_docuseal
  ON support_demandes(docuseal_submission_id) WHERE docuseal_submission_id IS NOT NULL;
