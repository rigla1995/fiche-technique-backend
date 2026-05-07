-- Add invitation token fields and make password nullable (set on invite acceptance)
ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Allow NULL password for accounts pending invitation acceptance
ALTER TABLE utilisateurs ALTER COLUMN mot_de_passe DROP NOT NULL;

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_utilisateurs_invite_token ON utilisateurs(invite_token) WHERE invite_token IS NOT NULL;
