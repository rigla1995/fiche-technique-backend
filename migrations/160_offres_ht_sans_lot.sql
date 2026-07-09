-- 160 — Tarifs acheteurs saisis en HT (+ taux de TVA) et suppression de la vente
-- par lot (on ne garde que le prix à l'unité).
--   • acheteur_offres : prix_unitaire_ht remplace prix_unitaire_ttc (backfill
--     détaxé : HT = TTC / (1 + TVA/100)), colonnes de lot supprimées.
--   • historique des prix : même traitement.
--   • commande_acheteur_lignes : les anciennes lignes « lot » sont normalisées en
--     unités (prix unitaire recalculé, quantite = quantite_unites), prix_ht ajouté
--     (figé à la commande), colonnes mode/taille_lot supprimées.
-- Les CHECK liés aux colonnes supprimées tombent avec elles.

ALTER TABLE acheteur_offres
  ADD COLUMN IF NOT EXISTS prix_unitaire_ht NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (prix_unitaire_ht >= 0);
UPDATE acheteur_offres
  SET prix_unitaire_ht = ROUND(prix_unitaire_ttc / (1 + COALESCE(taux_tva, 0) / 100), 3);
ALTER TABLE acheteur_offres
  DROP COLUMN IF EXISTS prix_unitaire_ttc,
  DROP COLUMN IF EXISTS taille_lot,
  DROP COLUMN IF EXISTS prix_lot_ttc;

ALTER TABLE acheteur_offre_prix_historique
  ADD COLUMN IF NOT EXISTS prix_unitaire_ht NUMERIC(10,3);
UPDATE acheteur_offre_prix_historique
  SET prix_unitaire_ht = ROUND(prix_unitaire_ttc / (1 + COALESCE(taux_tva, 0) / 100), 3);
ALTER TABLE acheteur_offre_prix_historique
  DROP COLUMN IF EXISTS prix_unitaire_ttc,
  DROP COLUMN IF EXISTS taille_lot,
  DROP COLUMN IF EXISTS prix_lot_ttc;

-- Normalisation des anciennes lignes « lot » : tout redevient de l'unité.
UPDATE commande_acheteur_lignes
  SET prix_ttc = ROUND(prix_ttc / NULLIF(taille_lot, 0), 3),
      quantite = quantite_unites
  WHERE mode = 'lot';

ALTER TABLE commande_acheteur_lignes ADD COLUMN IF NOT EXISTS prix_ht NUMERIC(10,3);
UPDATE commande_acheteur_lignes
  SET prix_ht = ROUND(prix_ttc / (1 + COALESCE(taux_tva, 0) / 100), 3)
  WHERE prix_ht IS NULL;
ALTER TABLE commande_acheteur_lignes ALTER COLUMN prix_ht SET NOT NULL;
ALTER TABLE commande_acheteur_lignes
  ADD CONSTRAINT commande_acheteur_lignes_prix_ht_check CHECK (prix_ht >= 0);
ALTER TABLE commande_acheteur_lignes
  DROP COLUMN IF EXISTS mode,
  DROP COLUMN IF EXISTS taille_lot;
