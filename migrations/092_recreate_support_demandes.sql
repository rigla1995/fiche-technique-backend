-- Recreate support_demandes and restore notifications columns
-- (migration 091 was incorrectly applied and then reverted at code level,
--  but the DB already ran the DROP. This migration restores everything.)

CREATE TABLE IF NOT EXISTS support_demandes (
  id                SERIAL PRIMARY KEY,
  client_id         INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  client_nom        VARCHAR(255),
  type              VARCHAR(30)  NOT NULL CHECK (type IN ('ingredient_manquant', 'supplement', 'aide')),
  statut            VARCHAR(20)  NOT NULL DEFAULT 'en_attente'
                    CHECK (statut IN ('en_attente', 'validée', 'refusée')),
  domaine_id        INTEGER REFERENCES domaines_activite(id),
  categorie_nom     VARCHAR(255),
  unite_nom         VARCHAR(100),
  nom_ingredient    VARCHAR(255),
  nb_activites_supp INTEGER DEFAULT 0,
  nb_labos_supp     INTEGER DEFAULT 0,
  nb_gerants_supp   INTEGER DEFAULT 0,
  description       TEXT,
  notes_admin       TEXT,
  traite_par        INTEGER REFERENCES utilisateurs(id),
  traite_le         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  created_by        INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_by_nom    VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_support_demandes_client    ON support_demandes(client_id);
CREATE INDEX IF NOT EXISTS idx_support_demandes_statut    ON support_demandes(statut);
CREATE INDEX IF NOT EXISTS idx_support_demandes_traite_par ON support_demandes(traite_par) WHERE traite_par IS NOT NULL;

-- Restore notifications columns dropped by migration 091
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS demande_id  INTEGER REFERENCES support_demandes(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type        VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS client_nom  VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS statut      VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notes_admin TEXT;
