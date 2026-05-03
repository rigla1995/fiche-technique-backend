-- Module abonnements: tarifs_config, abonnements, paiements, demandes
-- Gérant role + parent link on utilisateurs

-- Extend role constraint to include 'gerant'
ALTER TABLE utilisateurs DROP CONSTRAINT IF EXISTS utilisateurs_role_check;
ALTER TABLE utilisateurs ADD CONSTRAINT utilisateurs_role_check
  CHECK (role IN ('super_admin', 'client', 'gerant'));

-- Gérant parent link (for gerant accounts)
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS gerant_parent_id INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE;
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS gerant_activite_id INTEGER;
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS gerant_activite_type VARCHAR(30) CHECK (gerant_activite_type IN ('franchise', 'labo', 'activite_distincte'));
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS gerant_est_gratuit BOOLEAN DEFAULT true;
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS gerant_montant_mensuel NUMERIC(10,2) DEFAULT 0;

-- Tarifs configurables par le super admin
CREATE TABLE IF NOT EXISTS tarifs_config (
  id SERIAL PRIMARY KEY,
  cle VARCHAR(50) UNIQUE NOT NULL,
  valeur_dt NUMERIC(10,2) NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO tarifs_config (cle, valeur_dt, description) VALUES
  ('indep_mensuel',       200,  'Abonnement mensuel Indépendant'),
  ('indep_onboarding',    1000, 'Frais onboarding Indépendant (formation + 7j support)'),
  ('entreprise_mensuel',  400,  'Abonnement mensuel Entreprise'),
  ('entreprise_onboarding', 1500, 'Frais onboarding Entreprise (formation + 7j support)'),
  ('gerant_sup_mensuel',  80,   'Gérant supplémentaire mensuel'),
  ('labo_sup_mensuel',    150,  'Labo supplémentaire mensuel')
ON CONFLICT (cle) DO NOTHING;

-- Abonnement principal d'un compte
CREATE TABLE IF NOT EXISTS abonnements (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  compte_type VARCHAR(20) NOT NULL CHECK (compte_type IN ('independant', 'entreprise')),
  statut_onboarding VARCHAR(20) DEFAULT 'impayé' CHECK (statut_onboarding IN ('payé', 'impayé', 'offert')),
  montant_onboarding NUMERIC(10,2),
  date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
  mode_compte VARCHAR(20) DEFAULT 'actif' CHECK (mode_compte IN ('actif', 'read_only', 'desactive', 'archive')),
  prolongation_jours INTEGER DEFAULT 0 CHECK (prolongation_jours >= 0 AND prolongation_jours <= 30),
  notes TEXT,
  archive_date TIMESTAMPTZ,
  suppression_cascade_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historique des paiements mensuels
CREATE TABLE IF NOT EXISTS paiements (
  id SERIAL PRIMARY KEY,
  abonnement_id INTEGER NOT NULL REFERENCES abonnements(id) ON DELETE CASCADE,
  mois DATE NOT NULL,
  montant_dt NUMERIC(10,2),
  statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('payé', 'impayé', 'en_attente', 'remisé')),
  saisie_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  date_saisie TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (abonnement_id, mois)
);

-- Demandes de gérants supplémentaires ou labos supplémentaires
CREATE TABLE IF NOT EXISTS demandes (
  id SERIAL PRIMARY KEY,
  demandeur_id INTEGER REFERENCES utilisateurs(id) ON DELETE CASCADE,
  demandeur_type VARCHAR(20) NOT NULL CHECK (demandeur_type IN ('independant', 'entreprise')),
  type_demande VARCHAR(20) NOT NULL CHECK (type_demande IN ('gerant_sup', 'labo_sup')),
  statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'validée', 'refusée')),
  montant_mensuel_dt NUMERIC(10,2),
  notes_client TEXT,
  notes_admin TEXT,
  traite_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  traite_le TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
