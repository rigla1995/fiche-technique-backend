-- New tarif keys for config-based pricing (replaces compte_type-based model)
INSERT INTO tarifs_config (cle, valeur_dt, description) VALUES
  ('activite_1',      200,  '1 activité — forfait mensuel'),
  ('activite_2',      350,  '2 activités — forfait mensuel'),
  ('activite_sup',    120,  'Activité supplémentaire (≥3) — mensuel par activité'),
  ('labo_mensuel',    160,  'Labo — mensuel'),
  ('gerant_mensuel',   80,  'Gérant — mensuel')
ON CONFLICT (cle) DO UPDATE SET
  valeur_dt = EXCLUDED.valeur_dt,
  description = EXCLUDED.description;

-- Configuration souscrite par le client (nb activités, labos, gérants)
CREATE TABLE IF NOT EXISTS abonnement_config (
  id                SERIAL PRIMARY KEY,
  abonnement_id     INTEGER NOT NULL UNIQUE REFERENCES abonnements(id) ON DELETE CASCADE,
  nb_activites      INTEGER NOT NULL DEFAULT 1 CHECK (nb_activites >= 1),
  nb_labos          INTEGER NOT NULL DEFAULT 0 CHECK (nb_labos >= 0),
  nb_gerants        INTEGER NOT NULL DEFAULT 0 CHECK (nb_gerants >= 0),
  montant_onboarding NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abonnement_config_abo ON abonnement_config(abonnement_id);

-- Demandes d'assistance client (Support)
CREATE TABLE IF NOT EXISTS support_demandes (
  id                SERIAL PRIMARY KEY,
  client_id         INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  client_nom        VARCHAR(255),
  type              VARCHAR(30)  NOT NULL CHECK (type IN ('ingredient_manquant', 'supplement', 'aide')),
  statut            VARCHAR(20)  NOT NULL DEFAULT 'en_attente'
                    CHECK (statut IN ('en_attente', 'validée', 'refusée')),
  -- ingredient_manquant
  domaine_id        INTEGER REFERENCES domaines_activite(id),
  categorie_nom     VARCHAR(255),
  unite_nom         VARCHAR(100),
  nom_ingredient    VARCHAR(255),
  -- supplement
  nb_activites_supp INTEGER DEFAULT 0,
  nb_labos_supp     INTEGER DEFAULT 0,
  nb_gerants_supp   INTEGER DEFAULT 0,
  -- aide
  description       TEXT,
  -- admin
  notes_admin       TEXT,
  traite_par        INTEGER REFERENCES utilisateurs(id),
  traite_le         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_demandes_client ON support_demandes(client_id);
CREATE INDEX IF NOT EXISTS idx_support_demandes_statut ON support_demandes(statut);

-- Allow NULL compte_type: new accounts have no "type" (config-based pricing)
ALTER TABLE utilisateurs ALTER COLUMN compte_type DROP NOT NULL;
ALTER TABLE abonnements  ALTER COLUMN compte_type DROP NOT NULL;

-- Track contract acceptance (click-to-sign)
ALTER TABLE abonnements ADD COLUMN IF NOT EXISTS contrat_accepte_le TIMESTAMPTZ;
ALTER TABLE abonnements ADD COLUMN IF NOT EXISTS contrat_accepte_ip VARCHAR(64);
ALTER TABLE abonnements ADD COLUMN IF NOT EXISTS contrat_ref VARCHAR(30);
