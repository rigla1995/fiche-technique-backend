-- Révocation des sessions au changement de mot de passe : le middleware
-- authenticate refuse tout JWT émis (iat) avant password_changed_at.
-- NULL pour les comptes existants = aucun impact rétroactif.
ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
