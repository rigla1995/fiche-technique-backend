-- 128_produit_origine_v2.sql
-- Re-crée la colonne produits.origine (la 127 l'avait retirée lors du revert de la 1ère refonte).
-- Nouvelle approche : l'origine est déterminée au step "Affectation" de la création
--   'labo'     : le produit est affecté à un/des labo(s) (XOR) -> PT fabriqué au labo, transféré,
--                vendu comme valorisé dans les activités liées ; pas d'appro manuel côté activité.
--   'activite' : le produit est affecté à une/des activité(s) (XOR) -> schéma actuel inchangé.

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
