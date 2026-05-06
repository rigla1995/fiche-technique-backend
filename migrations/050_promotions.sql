CREATE TABLE IF NOT EXISTS promotions (
  id                   SERIAL PRIMARY KEY,
  abonnement_id        INTEGER NOT NULL REFERENCES abonnements(id) ON DELETE CASCADE,
  type                 VARCHAR(20) NOT NULL CHECK (type IN ('percent_off','free_months','fixed_price')),
  applies_to           VARCHAR(20) NOT NULL CHECK (applies_to IN ('onboarding','mensualite','les_deux')),
  discount_onboarding  NUMERIC(5,2),
  discount_mensualite  NUMERIC(5,2),
  fixed_onboarding     NUMERIC(10,2),
  fixed_mensualite     NUMERIC(10,2),
  date_debut           DATE NOT NULL,
  months_duration      INTEGER,
  date_fin             DATE,
  notes                TEXT,
  created_by           INTEGER REFERENCES utilisateurs(id),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_abonnement ON promotions(abonnement_id);
CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(date_debut, date_fin);
