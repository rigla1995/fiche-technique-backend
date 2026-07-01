-- 134: distinguer la CONSOMMATION d'un sous-PT (composant déduit à la production d'un PT parent)
-- des autres mouvements dans les tables de stock PT.
--
-- À la production d'un PT, on déduit désormais AUSSI ses sous-PT de composition (produit_sous_produits),
-- en insérant une ligne à quantité NÉGATIVE. Pour que cette sortie réduise le stock du sous-PT SANS être
-- comptée comme une vente (activité) ni confondue avec un transfert (labo), on la marque type_appro='PT'
-- (même convention que les articles consommés dans stock_labo_daily / stock_entreprise_daily).
--
-- Valeurs de type_appro utilisées : 'production' (appro/fabrication, quantité +), 'PT' (consommation, quantité -).
-- Les lignes existantes restent NULL (traitées comme legacy : appro si +, vente/transfert si -), aucun backfill requis :
-- les filtres ne ciblent QUE 'PT'.

ALTER TABLE stock_produits_transformes ADD COLUMN IF NOT EXISTS type_appro VARCHAR(20);
ALTER TABLE stock_labo_pt_daily        ADD COLUMN IF NOT EXISTS type_appro VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_spt_activite_produit_type ON stock_produits_transformes (activite_id, produit_id, type_appro);
CREATE INDEX IF NOT EXISTS idx_slpt_labo_produit_type    ON stock_labo_pt_daily (labo_id, produit_id, type_appro);
