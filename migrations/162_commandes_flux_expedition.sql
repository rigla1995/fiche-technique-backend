-- 162 — Flux de commande acheteur en 4 états + historique des états.
--   en_attente → expediee (STOCK DÉDUIT + FACTURE, date_expedition)
--              → livree (date_livraison) ; annulee possible à tout moment.
--   • Le stock/flux compte désormais statut IN ('expediee','livree').
--   • Les commandes 'validee' existantes deviennent 'livree' (elles étaient
--     entièrement traitées sous l'ancien modèle : stock déduit + facturées).
--   • Table commande_acheteur_statuts : trace de chaque transition
--     (date_effet = date métier saisie : expédition / livraison).

-- L'ancien CHECK statut (nom auto) doit sauter avant le nouveau
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'commandes_acheteur'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%statut%'
  LOOP
    EXECUTE format('ALTER TABLE commandes_acheteur DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

UPDATE commandes_acheteur SET statut = 'livree' WHERE statut = 'validee';

ALTER TABLE commandes_acheteur
  ADD COLUMN IF NOT EXISTS date_expedition DATE,
  ADD COLUMN IF NOT EXISTS date_livraison DATE;

ALTER TABLE commandes_acheteur
  ADD CONSTRAINT commandes_acheteur_statut_check
  CHECK (statut IN ('en_attente', 'expediee', 'livree', 'annulee'));

UPDATE commandes_acheteur
  SET date_expedition = COALESCE(traite_le::date, date_commande),
      date_livraison  = COALESCE(traite_le::date, date_commande)
  WHERE statut = 'livree';

CREATE TABLE IF NOT EXISTS commande_acheteur_statuts (
  id SERIAL PRIMARY KEY,
  commande_id UUID NOT NULL REFERENCES commandes_acheteur(id) ON DELETE CASCADE,
  statut VARCHAR(12) NOT NULL CHECK (statut IN ('en_attente', 'expediee', 'livree', 'annulee')),
  date_effet DATE,
  motif TEXT,
  created_by INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commande_acheteur_statuts_commande
  ON commande_acheteur_statuts(commande_id);

-- Seed FIDÈLE de l'historique des commandes existantes (l'ordre des INSERT donne
-- l'ordre d'affichage à timestamp égal) :
--   1. en_attente : uniquement les commandes PORTAIL (les ventes manuelles
--      étaient créées « validées d'office » et ne sont jamais passées par là) ;
--   2. expediee : les commandes backfillées 'livree' (leur stock était sorti) ;
--   3. l'état courant (livree / annulee) avec sa date et son motif.
INSERT INTO commande_acheteur_statuts (commande_id, statut, date_effet, created_by, created_at)
SELECT id, 'en_attente', date_commande, created_by, created_at
FROM commandes_acheteur WHERE source = 'portail';

INSERT INTO commande_acheteur_statuts (commande_id, statut, date_effet, created_by, created_at)
SELECT id, 'expediee', date_expedition, traite_par, COALESCE(traite_le, created_at)
FROM commandes_acheteur WHERE statut = 'livree';

INSERT INTO commande_acheteur_statuts (commande_id, statut, date_effet, motif, created_by, created_at)
SELECT id, statut, COALESCE(traite_le::date, date_commande), motif_annulation, traite_par, COALESCE(traite_le, created_at)
FROM commandes_acheteur
WHERE statut <> 'en_attente';
