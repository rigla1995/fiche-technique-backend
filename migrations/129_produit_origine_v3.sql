-- 129_produit_origine_v3.sql
-- Assure la colonne produits.origine ('labo' | 'activite'). Idempotente : la colonne peut déjà
-- exister en PROD (migration 128 appliquée, fichier retiré par un revert). Sert de source de vérité.
--   'labo'     : produit fabriqué au labo (appros), transféré vers les activités cochées (PT, pas
--                d'appro manuel), vendu comme valorisé. Concerne les PU labo et les produits
--                valorisés composés.
--   'activite' : produit géré dans l'activité (schéma de base).

ALTER TABLE produits ADD COLUMN IF NOT EXISTS origine VARCHAR(20);
UPDATE produits SET origine = 'activite' WHERE origine IS NULL;
ALTER TABLE produits ALTER COLUMN origine SET DEFAULT 'activite';
ALTER TABLE produits ALTER COLUMN origine SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'produits_origine_check') THEN
    ALTER TABLE produits ADD CONSTRAINT produits_origine_check CHECK (origine IN ('labo', 'activite'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_produits_origine ON produits(client_id, origine);
