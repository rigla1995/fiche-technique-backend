-- Migration 123: backfill des factures manquantes pour les transferts EXISTANTS.
-- Avant le fix runtime, createTransfer ne créait pas de facture pour les transferts.
-- On agrège les appros transfert (stock_entreprise_daily.type_appro = 'transfert', côté activité)
-- par (client, ref_facture) et on crée la facture correspondante SANS timbre fiscal,
-- avec exactement les mêmes montants que le calcul runtime (quantité × prix).
-- Idempotent : NOT EXISTS empêche de doublonner si une facture existe déjà pour cette réf
-- (et la migration ne s'exécute qu'une fois via _migrations).

INSERT INTO factures
  (client_id, ref_facture, date_facture, fournisseur_id, activite_id, labo_id,
   type_source, montant_ht, montant_tva, montant_ttc, timbre_fiscal, montant_timbre, created_by)
SELECT
  t.client_id, t.ref_facture, t.date_facture, t.fournisseur_id, t.activite_id, NULL,
  'transfert', t.montant_ht, t.montant_tva, t.montant_ttc, FALSE, 0, t.created_by
FROM (
  SELECT
    pe.client_id,
    sed.ref_facture,
    MIN(sed.date_appro)                                                              AS date_facture,
    (array_agg(sed.fournisseur_id ORDER BY sed.id))[1]                               AS fournisseur_id,
    (array_agg(sed.activite_id ORDER BY sed.id))[1]                                  AS activite_id,
    SUM(sed.quantite * COALESCE(sed.prix_unitaire, 0))                               AS montant_ht,
    SUM(sed.quantite * COALESCE(sed.prix_unitaire, 0) * COALESCE(sed.taux_tva, 0) / 100) AS montant_tva,
    SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire, 0))        AS montant_ttc,
    (array_agg(sed.created_by ORDER BY sed.id))[1]                                   AS created_by
  FROM stock_entreprise_daily sed
  JOIN activites a ON a.id = sed.activite_id
  JOIN profil_entreprise pe ON pe.id = a.entreprise_id
  WHERE sed.type_appro = 'transfert'
    AND sed.ref_facture IS NOT NULL
    AND sed.ref_facture <> ''
  GROUP BY pe.client_id, sed.ref_facture
) t
WHERE NOT EXISTS (
  SELECT 1 FROM factures f
   WHERE f.client_id = t.client_id
     AND f.ref_facture IS NOT DISTINCT FROM t.ref_facture
);
