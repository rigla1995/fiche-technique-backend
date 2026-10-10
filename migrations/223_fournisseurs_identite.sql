-- 223 — Factures fournisseur, étape F2 : le fournisseur reconnu (labflow-reprise/achats-compta/PLAN-FACTURES.md).
--
-- fournisseurs : identité légale du fournisseur, comme pour le client (lot 3) — raison sociale, matricule fiscal (forme
--   contrôlée par le serveur, normalisée « 1234567A/A/M/000 »), email, ville. Le matricule est UNIQUE par compte : c'est
--   par lui qu'une facture déposée retrouve son fournisseur. Les fiches existantes restent telles quelles (champs vides).
-- factures.lecture : ce que la lecture de la facture déposée a proposé (en-tête : fournisseur, numéro, date, totaux ;
--   source PDF ou image), gardé tel quel à la création de la facture — pour comparer plus tard ce qui a été lu et ce
--   qui a été validé. NULL pour une saisie à la main.
--
-- Additive et idempotente ; aucune donnée existante n'est modifiée. Trois index de références (fournisseur_id) en fin de fichier.

ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS raison_sociale   VARCHAR(200);
ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS matricule_fiscal VARCHAR(30);
ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS email            VARCHAR(200);
ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS ville            VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fournisseurs_matricule
  ON fournisseurs (entreprise_id, matricule_fiscal)
  WHERE matricule_fiscal IS NOT NULL;

ALTER TABLE factures ADD COLUMN IF NOT EXISTS lecture JSONB;

-- Garde « fournisseur utilisé » (suppression refusée) et ON DELETE SET NULL : index des références qui n'en avaient pas.
CREATE INDEX IF NOT EXISTS idx_factures_fournisseur_id ON factures (fournisseur_id) WHERE fournisseur_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spt_fournisseur_id ON stock_produits_transformes (fournisseur_id) WHERE fournisseur_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_slptd_fournisseur_id ON stock_labo_pt_daily (fournisseur_id) WHERE fournisseur_id IS NOT NULL;
