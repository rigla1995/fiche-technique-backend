-- Migration 138 : traçabilité des écritures de stock PT (fournisseur, référence, TVA).
-- Aligne stock_produits_transformes et stock_labo_pt_daily sur les tables de stock
-- d'articles (020/021/022) : les écritures PT (production, consommation recette,
-- transfert) portent désormais un fournisseur (AUTO généré par le système, ou le
-- fournisseur du labo pour les réceptions de transfert), une référence (règle
-- initiales+YY, ou la réf saisie au transfert) et la paire de prix HT/TTC avec
-- taux_tva (0 pour les PT => HT = TTC, convention COALESCE inchangée).
--
-- Colonnes de prix asymétriques (historique) :
--   stock_produits_transformes.prix_calcule  = TTC  -> on ajoute prix_unitaire (HT)
--   stock_labo_pt_daily.prix_unitaire        = coût -> on ajoute prix_unitaire_tva (TTC)

ALTER TABLE stock_produits_transformes
  ADD COLUMN IF NOT EXISTS fournisseur_id INT REFERENCES fournisseurs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ref_facture VARCHAR(100),
  ADD COLUMN IF NOT EXISTS taux_tva NUMERIC,
  ADD COLUMN IF NOT EXISTS prix_unitaire NUMERIC;

ALTER TABLE stock_labo_pt_daily
  ADD COLUMN IF NOT EXISTS fournisseur_id INT REFERENCES fournisseurs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ref_facture VARCHAR(100),
  ADD COLUMN IF NOT EXISTS taux_tva NUMERIC,
  ADD COLUMN IF NOT EXISTS prix_unitaire_tva NUMERIC;
