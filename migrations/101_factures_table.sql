-- Migration 101: Dedicated factures table

CREATE TABLE IF NOT EXISTS factures (
  id SERIAL PRIMARY KEY,
  client_id INT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  ref_facture VARCHAR(100),
  date_facture DATE NOT NULL,
  fournisseur_id INT REFERENCES fournisseurs(id) ON DELETE SET NULL,
  activite_id INT REFERENCES activites(id) ON DELETE SET NULL,
  labo_id INT REFERENCES labos(id) ON DELETE SET NULL,
  type_source VARCHAR(20) NOT NULL DEFAULT 'manuel',
  montant_ht NUMERIC(12,3) NOT NULL DEFAULT 0,
  montant_tva NUMERIC(12,3) NOT NULL DEFAULT 0,
  montant_ttc NUMERIC(12,3) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INT REFERENCES utilisateurs(id)
);

CREATE INDEX IF NOT EXISTS idx_factures_client_id ON factures(client_id);
CREATE INDEX IF NOT EXISTS idx_factures_activite_id ON factures(activite_id);
CREATE INDEX IF NOT EXISTS idx_factures_labo_id ON factures(labo_id);
CREATE INDEX IF NOT EXISTS idx_factures_date ON factures(date_facture DESC);

-- Add facture_id FK to stock tables
ALTER TABLE stock_client_daily ADD COLUMN IF NOT EXISTS facture_id INT REFERENCES factures(id) ON DELETE SET NULL;
ALTER TABLE stock_entreprise_daily ADD COLUMN IF NOT EXISTS facture_id INT REFERENCES factures(id) ON DELETE SET NULL;
ALTER TABLE stock_labo_daily ADD COLUMN IF NOT EXISTS facture_id INT REFERENCES factures(id) ON DELETE SET NULL;

-- Backfill: stock_client_daily
-- Group by (client_id, ref_facture, date_appro::date, fournisseur_id, type_appro) where ref_facture IS NOT NULL
WITH groups AS (
  SELECT
    client_id,
    ref_facture,
    date_appro::date AS date_facture,
    fournisseur_id,
    type_appro,
    COALESCE(SUM(CASE WHEN quantite IS NOT NULL AND prix_unitaire IS NOT NULL THEN quantite * prix_unitaire ELSE 0 END), 0) AS montant_ht,
    COALESCE(SUM(CASE WHEN quantite IS NOT NULL AND prix_unitaire_tva IS NOT NULL THEN quantite * prix_unitaire_tva
                      WHEN quantite IS NOT NULL AND prix_unitaire IS NOT NULL THEN quantite * prix_unitaire
                      ELSE 0 END), 0) AS montant_ttc,
    COALESCE(SUM(CASE WHEN quantite IS NOT NULL AND taux_tva IS NOT NULL AND taux_tva > 0
                        AND prix_unitaire IS NOT NULL
                       THEN quantite * prix_unitaire * (taux_tva / 100.0)
                       ELSE 0 END), 0) AS montant_tva,
    MIN(created_by) AS created_by
  FROM stock_client_daily
  WHERE ref_facture IS NOT NULL
  GROUP BY client_id, ref_facture, date_appro::date, fournisseur_id, type_appro
),
inserted AS (
  INSERT INTO factures (client_id, ref_facture, date_facture, fournisseur_id, type_source, montant_ht, montant_tva, montant_ttc, created_by)
  SELECT client_id, ref_facture, date_facture, fournisseur_id, COALESCE(type_appro, 'manuel'), montant_ht, montant_tva, montant_ttc, created_by
  FROM groups
  ON CONFLICT DO NOTHING
  RETURNING id, client_id, ref_facture, date_facture, fournisseur_id, type_source
)
UPDATE stock_client_daily scd
SET facture_id = ins.id
FROM inserted ins
WHERE scd.client_id = ins.client_id
  AND scd.ref_facture = ins.ref_facture
  AND scd.date_appro::date = ins.date_facture
  AND (scd.fournisseur_id = ins.fournisseur_id OR (scd.fournisseur_id IS NULL AND ins.fournisseur_id IS NULL))
  AND COALESCE(scd.type_appro, 'manuel') = ins.type_source;

-- Backfill: stock_entreprise_daily
-- Derive client_id via activites → profil_entreprise; group by (client_id, activite_id, ref_facture, date_appro::date, fournisseur_id, type_appro)
WITH groups AS (
  SELECT
    pe.client_id,
    sed.activite_id,
    sed.ref_facture,
    sed.date_appro::date AS date_facture,
    sed.fournisseur_id,
    sed.type_appro,
    COALESCE(SUM(CASE WHEN sed.quantite IS NOT NULL AND sed.prix_unitaire IS NOT NULL THEN sed.quantite * sed.prix_unitaire ELSE 0 END), 0) AS montant_ht,
    COALESCE(SUM(CASE WHEN sed.quantite IS NOT NULL AND sed.prix_unitaire_tva IS NOT NULL THEN sed.quantite * sed.prix_unitaire_tva
                      WHEN sed.quantite IS NOT NULL AND sed.prix_unitaire IS NOT NULL THEN sed.quantite * sed.prix_unitaire
                      ELSE 0 END), 0) AS montant_ttc,
    COALESCE(SUM(CASE WHEN sed.quantite IS NOT NULL AND sed.taux_tva IS NOT NULL AND sed.taux_tva > 0
                        AND sed.prix_unitaire IS NOT NULL
                       THEN sed.quantite * sed.prix_unitaire * (sed.taux_tva / 100.0)
                       ELSE 0 END), 0) AS montant_tva,
    MIN(sed.created_by) AS created_by
  FROM stock_entreprise_daily sed
  JOIN activites a ON a.id = sed.activite_id
  JOIN profil_entreprise pe ON pe.id = a.entreprise_id
  WHERE sed.ref_facture IS NOT NULL
  GROUP BY pe.client_id, sed.activite_id, sed.ref_facture, sed.date_appro::date, sed.fournisseur_id, sed.type_appro
),
inserted AS (
  INSERT INTO factures (client_id, activite_id, ref_facture, date_facture, fournisseur_id, type_source, montant_ht, montant_tva, montant_ttc, created_by)
  SELECT client_id, activite_id, ref_facture, date_facture, fournisseur_id, COALESCE(type_appro, 'manuel'), montant_ht, montant_tva, montant_ttc, created_by
  FROM groups
  ON CONFLICT DO NOTHING
  RETURNING id, activite_id, ref_facture, date_facture, fournisseur_id, type_source
)
UPDATE stock_entreprise_daily sed
SET facture_id = ins.id
FROM inserted ins
WHERE sed.activite_id = ins.activite_id
  AND sed.ref_facture = ins.ref_facture
  AND sed.date_appro::date = ins.date_facture
  AND (sed.fournisseur_id = ins.fournisseur_id OR (sed.fournisseur_id IS NULL AND ins.fournisseur_id IS NULL))
  AND COALESCE(sed.type_appro, 'manuel') = ins.type_source;

-- Backfill: stock_labo_daily
-- Derive client_id via labos → profil_entreprise; group by (client_id, labo_id, ref_facture, date_appro::date, fournisseur_id, type_appro)
WITH groups AS (
  SELECT
    pe.client_id,
    sld.labo_id,
    sld.ref_facture,
    sld.date_appro::date AS date_facture,
    sld.fournisseur_id,
    sld.type_appro,
    COALESCE(SUM(CASE WHEN sld.quantite IS NOT NULL AND sld.prix_unitaire IS NOT NULL THEN sld.quantite * sld.prix_unitaire ELSE 0 END), 0) AS montant_ht,
    COALESCE(SUM(CASE WHEN sld.quantite IS NOT NULL AND sld.prix_unitaire_tva IS NOT NULL THEN sld.quantite * sld.prix_unitaire_tva
                      WHEN sld.quantite IS NOT NULL AND sld.prix_unitaire IS NOT NULL THEN sld.quantite * sld.prix_unitaire
                      ELSE 0 END), 0) AS montant_ttc,
    COALESCE(SUM(CASE WHEN sld.quantite IS NOT NULL AND sld.taux_tva IS NOT NULL AND sld.taux_tva > 0
                        AND sld.prix_unitaire IS NOT NULL
                       THEN sld.quantite * sld.prix_unitaire * (sld.taux_tva / 100.0)
                       ELSE 0 END), 0) AS montant_tva,
    MIN(sld.created_by) AS created_by
  FROM stock_labo_daily sld
  JOIN labos l ON l.id = sld.labo_id
  JOIN profil_entreprise pe ON pe.id = l.entreprise_id
  WHERE sld.ref_facture IS NOT NULL
  GROUP BY pe.client_id, sld.labo_id, sld.ref_facture, sld.date_appro::date, sld.fournisseur_id, sld.type_appro
),
inserted AS (
  INSERT INTO factures (client_id, labo_id, ref_facture, date_facture, fournisseur_id, type_source, montant_ht, montant_tva, montant_ttc, created_by)
  SELECT client_id, labo_id, ref_facture, date_facture, fournisseur_id, COALESCE(type_appro, 'manuel'), montant_ht, montant_tva, montant_ttc, created_by
  FROM groups
  ON CONFLICT DO NOTHING
  RETURNING id, labo_id, ref_facture, date_facture, fournisseur_id, type_source
)
UPDATE stock_labo_daily sld
SET facture_id = ins.id
FROM inserted ins
WHERE sld.labo_id = ins.labo_id
  AND sld.ref_facture = ins.ref_facture
  AND sld.date_appro::date = ins.date_facture
  AND (sld.fournisseur_id = ins.fournisseur_id OR (sld.fournisseur_id IS NULL AND ins.fournisseur_id IS NULL))
  AND COALESCE(sld.type_appro, 'manuel') = ins.type_source;
