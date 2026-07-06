-- Migration 140 : backfill de traçabilité des lignes PT créées AVANT la migration 138.
-- Demande client (test PROD) : l'historique PT doit afficher TVA/TTC (TVA absente ⇒
-- taux 0 et TTC = valeur HT stockée), le fournisseur (le labo émetteur pour les
-- transferts) et la réf. Les nouvelles écritures portent déjà tout (migr 138) ;
-- on complète l'existant.

-- 1) Sorties de transfert côté labo (lignes négatives, type NULL) : réf + prix de
--    cession retrouvés depuis labo_transfers (produit/labo/date) — AVANT la complétion
--    générique pour que le prix de cession soit repris.
UPDATE stock_labo_pt_daily slpt
   SET ref_facture       = COALESCE(slpt.ref_facture, lt.ref_facture),
       prix_unitaire     = COALESCE(slpt.prix_unitaire, lt.prix_unitaire),
       prix_unitaire_tva = COALESCE(slpt.prix_unitaire_tva, lt.prix_unitaire_tva, lt.prix_unitaire)
  FROM labo_transfers lt
 WHERE slpt.type_appro IS NULL AND slpt.quantite < 0
   AND lt.produit_id = slpt.produit_id
   AND lt.labo_id = slpt.labo_id
   AND lt.date_transfert = slpt.date_appro
   AND (slpt.ref_facture IS NULL OR slpt.prix_unitaire IS NULL OR slpt.prix_unitaire_tva IS NULL);

-- 2) Réceptions de transfert côté activité : fournisseur = labo émetteur + réf saisie,
--    retrouvés depuis labo_transfers (produit/activité/date).
UPDATE stock_produits_transformes spt
   SET fournisseur_id = COALESCE(spt.fournisseur_id, f.id),
       ref_facture    = COALESCE(spt.ref_facture, lt.ref_facture)
  FROM labo_transfers lt
  LEFT JOIN fournisseurs f ON f.labo_id = lt.labo_id AND f.is_labo = TRUE
 WHERE spt.type_appro IS NULL AND spt.quantite > 0
   AND lt.produit_id = spt.produit_id
   AND lt.activite_id = spt.activite_id
   AND lt.date_transfert = spt.date_appro
   AND (spt.fournisseur_id IS NULL OR spt.ref_facture IS NULL);

-- 3) Complétion générique de la paire de prix + taux (PT : TVA 0 ⇒ HT = TTC).
UPDATE stock_produits_transformes
   SET prix_unitaire = prix_calcule
 WHERE prix_unitaire IS NULL AND prix_calcule IS NOT NULL;
UPDATE stock_produits_transformes
   SET taux_tva = 0
 WHERE taux_tva IS NULL;

UPDATE stock_labo_pt_daily
   SET prix_unitaire_tva = prix_unitaire
 WHERE prix_unitaire_tva IS NULL AND prix_unitaire IS NOT NULL;
UPDATE stock_labo_pt_daily
   SET taux_tva = 0
 WHERE taux_tva IS NULL;
