CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  event_type  VARCHAR(50) NOT NULL,
  demande_id  INTEGER REFERENCES support_demandes(id) ON DELETE CASCADE,
  type        VARCHAR(50),
  client_nom  VARCHAR(255),
  statut      VARCHAR(50),
  notes_admin TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
