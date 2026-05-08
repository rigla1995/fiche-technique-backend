-- Fix cascade behaviour when a client account is deleted
-- 1. abonnements.client_id: SET NULL → CASCADE  (delete subscription with client)
-- 2. promotions.created_by: no action → SET NULL (keep promotions, clear author ref)

-- ── abonnements ──────────────────────────────────────────────────────────────
ALTER TABLE abonnements
  DROP CONSTRAINT IF EXISTS abonnements_client_id_fkey;

ALTER TABLE abonnements
  ADD CONSTRAINT abonnements_client_id_fkey
  FOREIGN KEY (client_id) REFERENCES utilisateurs(id) ON DELETE CASCADE;

-- ── promotions ───────────────────────────────────────────────────────────────
ALTER TABLE promotions
  DROP CONSTRAINT IF EXISTS promotions_created_by_fkey;

ALTER TABLE promotions
  ADD CONSTRAINT promotions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL;
