-- Mot de passe oublié : token de réinitialisation dédié.
-- On n'utilise PAS invite_token : le flux d'invitation exige activated_at IS NULL
-- et acceptInvite pose activated_at + l'acceptation du contrat — un compte déjà
-- activé doit passer par un token distinct, à durée courte (1 h).
ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS reset_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_utilisateurs_reset_token
  ON utilisateurs (reset_token) WHERE reset_token IS NOT NULL;
