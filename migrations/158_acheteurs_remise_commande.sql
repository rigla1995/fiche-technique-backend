-- 158 — Module Acheteurs : la remise n'est plus portée par la fiche acheteur.
-- Elle se saisit désormais À CHAQUE commande (vente manuelle ou validation d'une
-- commande portail) et reste figée sur commandes_acheteur.remise_pct / factures_acheteur.remise_pct.

ALTER TABLE acheteurs DROP COLUMN IF EXISTS remise_pct;
