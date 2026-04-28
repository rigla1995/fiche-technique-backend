-- Migration 020: Fournisseurs, Pertes, Stock schema refactor

-- ─── Fournisseurs ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fournisseurs (
  id            SERIAL PRIMARY KEY,
  entreprise_id INT NOT NULL REFERENCES profil_entreprise(id) ON DELETE CASCADE,
  nom           VARCHAR(255) NOT NULL,
  adresse       TEXT,
  telephone     VARCHAR(50),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fournisseur_activites (
  fournisseur_id INT NOT NULL REFERENCES fournisseurs(id) ON DELETE CASCADE,
  activite_id    INT NOT NULL REFERENCES activites(id) ON DELETE CASCADE,
  PRIMARY KEY (fournisseur_id, activite_id)
);

-- ─── Pertes ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pertes (
  id            SERIAL PRIMARY KEY,
  activite_id   INT NOT NULL REFERENCES activites(id) ON DELETE CASCADE,
  ingredient_id INT NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantite      NUMERIC(10,3) NOT NULL,
  type_perte    VARCHAR(20) NOT NULL CHECK (type_perte IN ('avarie','dechet')),
  date_perte    DATE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── stock_entreprise_daily: add id PK + type_appro + fournisseur + ref ───────

DO $$
BEGIN
  -- Add SERIAL id column if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_entreprise_daily' AND column_name = 'id'
  ) THEN
    ALTER TABLE stock_entreprise_daily ADD COLUMN id BIGSERIAL;
    -- Drop old composite PK (was (activite_id, ingredient_id, date_appro))
    ALTER TABLE stock_entreprise_daily DROP CONSTRAINT IF EXISTS stock_entreprise_daily_pkey;
    ALTER TABLE stock_entreprise_daily ADD PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_entreprise_daily' AND column_name = 'type_appro'
  ) THEN
    ALTER TABLE stock_entreprise_daily ADD COLUMN type_appro VARCHAR(20) DEFAULT 'manuel';
    -- Try to tag existing rows that came from labo transfers
    UPDATE stock_entreprise_daily sed
    SET type_appro = 'transfert'
    WHERE EXISTS (
      SELECT 1 FROM labo_transfers lt
      WHERE lt.activite_id = sed.activite_id
        AND lt.ingredient_id = sed.ingredient_id
        AND lt.date_transfert = sed.date_appro
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_entreprise_daily' AND column_name = 'fournisseur_id'
  ) THEN
    ALTER TABLE stock_entreprise_daily
      ADD COLUMN fournisseur_id INT REFERENCES fournisseurs(id) ON DELETE SET NULL,
      ADD COLUMN ref_facture    VARCHAR(100);
  END IF;
END$$;

-- Unique index replacing the old composite PK (allows one manuel + one transfert per day)
CREATE UNIQUE INDEX IF NOT EXISTS stock_entreprise_daily_uniq
  ON stock_entreprise_daily (activite_id, ingredient_id, date_appro, type_appro);

-- ─── stock_client_daily: same additions ───────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_client_daily' AND column_name = 'id'
  ) THEN
    ALTER TABLE stock_client_daily ADD COLUMN id BIGSERIAL;
    ALTER TABLE stock_client_daily DROP CONSTRAINT IF EXISTS stock_client_daily_pkey;
    ALTER TABLE stock_client_daily ADD PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_client_daily' AND column_name = 'type_appro'
  ) THEN
    ALTER TABLE stock_client_daily ADD COLUMN type_appro VARCHAR(20) DEFAULT 'manuel';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_client_daily' AND column_name = 'fournisseur_id'
  ) THEN
    ALTER TABLE stock_client_daily
      ADD COLUMN fournisseur_id INT REFERENCES fournisseurs(id) ON DELETE SET NULL,
      ADD COLUMN ref_facture    VARCHAR(100);
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS stock_client_daily_uniq
  ON stock_client_daily (client_id, ingredient_id, date_appro, type_appro);

-- ─── activite_ingredient_selections: add seuil_min ───────────────────────────

ALTER TABLE activite_ingredient_selections
  ADD COLUMN IF NOT EXISTS seuil_min NUMERIC(10,3);
