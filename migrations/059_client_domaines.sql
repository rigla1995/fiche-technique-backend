-- Domains assigned to independant client accounts by the super admin.
-- Used to filter which ingredients are visible in the client's global catalogue.
-- Enterprise accounts use activites.domaine_id instead (per-activite, set by the enterprise itself).
CREATE TABLE IF NOT EXISTS client_domaines (
  client_id  INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  domaine_id INTEGER NOT NULL REFERENCES domaines_activite(id) ON DELETE CASCADE,
  PRIMARY KEY (client_id, domaine_id)
);

CREATE INDEX IF NOT EXISTS idx_client_domaines_client ON client_domaines(client_id);
