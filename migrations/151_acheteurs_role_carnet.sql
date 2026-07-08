-- 151 — Module Acheteurs (lot 1) : rôle 'acheteur' + carnet d'acheteurs.
-- Un acheteur est un client B2B du compte LabFlow (carnet client-scoped).
-- Il peut optionnellement avoir un compte de connexion (utilisateurs.role='acheteur',
-- lié par acheteurs.user_id) pour le futur portail de commande.

ALTER TABLE utilisateurs DROP CONSTRAINT IF EXISTS utilisateurs_role_check;
ALTER TABLE utilisateurs ADD CONSTRAINT utilisateurs_role_check
  CHECK (role IN ('super_admin', 'client', 'gerant', 'acheteur'));

CREATE TABLE IF NOT EXISTS acheteurs (
  id                SERIAL PRIMARY KEY,
  client_id         INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  nom               VARCHAR(150) NOT NULL,
  entreprise        VARCHAR(150),
  email             VARCHAR(255),
  telephone         VARCHAR(30),
  adresse           TEXT,
  matricule_fiscal  VARCHAR(50),
  remise_pct        NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (remise_pct >= 0 AND remise_pct <= 100),
  notes             TEXT,
  actif             BOOLEAN NOT NULL DEFAULT true,
  user_id           INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_by        INTEGER REFERENCES utilisateurs(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acheteurs_client ON acheteurs(client_id);
-- E-mail unique par carnet (insensible à la casse) ; e-mail facultatif sans compte.
CREATE UNIQUE INDEX IF NOT EXISTS uq_acheteurs_client_email
  ON acheteurs (client_id, LOWER(email)) WHERE email IS NOT NULL;
-- Un compte utilisateur ne porte qu'UNE fiche acheteur (l'authentification s'y appuie).
CREATE UNIQUE INDEX IF NOT EXISTS uq_acheteurs_user
  ON acheteurs (user_id) WHERE user_id IS NOT NULL;
