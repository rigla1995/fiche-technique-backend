-- 125_produit_origine.sql
-- Refonte Espace Produits : distingue l'ORIGINE d'un produit.
--   'activite' : produit créé au niveau d'une / plusieurs activités (recette consommée sur place).
--   'labo'     : produit créé au niveau d'un / plusieurs labos (Produit Transformé). Il est fabriqué
--                au labo (l'appro déstocke les articles du labo selon les portions), transféré vers les
--                activités liées (déstocke le PT labo, stocke le PT activité), puis vendu à l'activité.
--                Côté activité : réception PAR TRANSFERT UNIQUEMENT (pas d'appro manuel).
-- L'ensemble des labos d'un produit labo est porté par labo_pt_selections (M:N labo<->produit).
-- L'ensemble des activités d'un produit activité est porté par produit_activite_affectation / _stock.

ALTER TABLE produits ADD COLUMN IF NOT EXISTS origine VARCHAR(20);

-- Backfill conservateur : tout l'existant = 'activite' (le modèle historique est activité-centré).
-- On ne reclasse PAS automatiquement les PT labo existants en 'labo' pour ne pas activer
-- rétroactivement le garde-fou "transfert uniquement" sur des données en production.
UPDATE produits SET origine = 'activite' WHERE origine IS NULL;

ALTER TABLE produits ALTER COLUMN origine SET DEFAULT 'activite';
ALTER TABLE produits ALTER COLUMN origine SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produits_origine_check') THEN
    ALTER TABLE produits ADD CONSTRAINT produits_origine_check CHECK (origine IN ('labo', 'activite'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_produits_origine ON produits(client_id, origine);
