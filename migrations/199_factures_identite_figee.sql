-- 199 — Lot 3, étape 8 : identité FIGÉE sur les factures (spec docs/lot-3-spec.md §6).
--
-- Facture de vente (factures_acheteur) : copie de l'identité du VENDEUR (profil_entreprise du compte), posée à
--   l'émission de la facture (vente directe, expédition d'une commande). vendeur_fige_le NON NULL = copie
--   présente : les téléchargements lisent alors la copie, plus la fiche.
-- Facture d'abonnement (paiements) : copie de l'identité du CLIENT, posée au passage du paiement à « payé »
--   (la première copie est gardée). client_fige_le NON NULL = copie présente.
--
-- AUCUNE reprise (décision du client, 05/10/2026) : les factures déjà émises restent sans copie
-- (vendeur_fige_le / client_fige_le NULL) et continuent de lire la fiche à chaque téléchargement, comme avant.
-- La facture d'approvisionnement n'est pas concernée.
--
-- Additive et idempotente : colonnes NULLables « si absentes » ; aucune valeur existante n'est touchée.

ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS vendeur_fige_le          TIMESTAMPTZ;
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS vendeur_nom              VARCHAR(255);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS vendeur_adresse          TEXT;
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS vendeur_telephone        VARCHAR(50);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS vendeur_email            VARCHAR(255);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS vendeur_raison_sociale   VARCHAR(255);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS vendeur_nom_commercial   VARCHAR(255);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS vendeur_forme            VARCHAR(30);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS vendeur_matricule_fiscal VARCHAR(50);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS vendeur_rne              VARCHAR(50);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS vendeur_ville            VARCHAR(120);

ALTER TABLE paiements ADD COLUMN IF NOT EXISTS client_fige_le          TIMESTAMPTZ;
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS client_nom              VARCHAR(255);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS client_email            VARCHAR(255);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS client_raison_sociale   VARCHAR(255);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS client_forme            VARCHAR(30);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS client_matricule_fiscal VARCHAR(50);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS client_rne              VARCHAR(50);
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS client_adresse          TEXT;
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS client_ville            VARCHAR(120);

-- Factures de vente sans copie figée, par compte : leur nombre est lu par GET /api/entreprise. L'index ne porte
-- que ces lignes (une nouvelle facture reçoit sa copie dans la transaction de son émission : elle n'y reste pas).
CREATE INDEX IF NOT EXISTS idx_factures_acheteur_non_figees
  ON factures_acheteur (client_id) WHERE vendeur_fige_le IS NULL;

COMMENT ON COLUMN factures_acheteur.vendeur_fige_le IS
  'Date de la copie figée de l''identité du vendeur ; NULL = facture d''avant la migration 199, lue sur la fiche. Lot 3.';
COMMENT ON COLUMN paiements.client_fige_le IS
  'Date de la copie figée de l''identité du client (passage à « payé ») ; NULL = facture lue sur le compte. Lot 3, migration 199.';
