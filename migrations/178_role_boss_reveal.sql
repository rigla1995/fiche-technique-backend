-- Compte « Boss » : super-rôle qui hérite de super_admin et peut gérer les
-- super_admins + consulter/révéler les identifiants clients/gérants/acheteurs.

-- 1) Autoriser le rôle 'boss' dans la contrainte CHECK existante.
ALTER TABLE utilisateurs DROP CONSTRAINT IF EXISTS utilisateurs_role_check;
ALTER TABLE utilisateurs ADD CONSTRAINT utilisateurs_role_check
  CHECK ((role)::text = ANY ((ARRAY['super_admin','client','gerant','acheteur','boss'])::text[]));

-- 2) Copie chiffrée RÉVERSIBLE du mot de passe (AES-256-GCM, clé env PASSWORD_ENC_KEY).
--    Renseignée UNIQUEMENT aux prochains set/reset de mot de passe → les comptes
--    existants restent « non récupérables » (seul leur hash bcrypt existe).
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS mot_de_passe_enc TEXT;

-- 3) Codes de révélation à usage unique (2FA envoyée au mail du Boss).
CREATE TABLE IF NOT EXISTS boss_reveal_codes (
  id             SERIAL PRIMARY KEY,
  boss_id        INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  target_user_id INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  code_hash      TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  consumed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_boss_reveal_boss ON boss_reveal_codes(boss_id, created_at);

-- 4) Compte Boss (idempotent) : si l'email existe déjà → promotion en boss SANS
--    toucher au mot de passe ; sinon → création avec le mot de passe généré
--    (communiqué une fois, à changer dans l'application).
UPDATE utilisateurs
   SET role = 'boss', actif = true, updated_at = NOW()
 WHERE LOWER(email) = LOWER('m.khelil.prof@gmail.com');

INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, activated_at, onboarding_step)
SELECT 'Boss', 'm.khelil.prof@gmail.com',
       '$2a$10$K2GUIw24r/BPlstWXfCPzuRPbk6RHA4CCVJceNJ7N40hcBQdp/D8m',
       'boss', true, NOW(), 0
 WHERE NOT EXISTS (
   SELECT 1 FROM utilisateurs WHERE LOWER(email) = LOWER('m.khelil.prof@gmail.com')
 );
