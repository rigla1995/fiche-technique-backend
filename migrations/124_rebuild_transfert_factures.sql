-- Migration 124: reconstruction propre des factures de type 'transfert'.
-- Le backfill 123 groupait par (client, réf) seulement, alors que upsertFacture clé
-- par (client, réf, date, fournisseur, activité, type) → une facture PAR ACTIVITÉ.
-- De plus les lignes transfert n'étaient pas reliées (facture_id) → "Aucune ligne trouvée".
-- On repart de zéro pour les transferts : on délie, on supprime les factures transfert,
-- puis on recrée 1 facture par (client, activité, réf, date, fournisseur) avec montants
-- resommés (sans timbre) ET on relie chaque ligne stock via facture_id.

-- 1) Délier les lignes transfert (sinon la FK bloque la suppression des factures)
UPDATE stock_entreprise_daily SET facture_id = NULL WHERE type_appro = 'transfert';

-- 2) Supprimer les factures transfert (créées par 123 ou le runtime, potentiellement partielles)
DELETE FROM factures WHERE type_source = 'transfert';

-- 3) Recréer les factures transfert (1 par activité) + relier les lignes stock
WITH ins AS (
  INSERT INTO factures
    (client_id, ref_facture, date_facture, fournisseur_id, activite_id, labo_id,
     type_source, montant_ht, montant_tva, montant_ttc, timbre_fiscal, montant_timbre, created_by)
  SELECT g.client_id, g.ref_facture, g.date_appro, g.fournisseur_id, g.activite_id, NULL,
         'transfert', g.ht, g.tva, g.ttc, FALSE, 0, g.created_by
  FROM (
    SELECT pe.client_id, sed.activite_id, sed.ref_facture, sed.date_appro, sed.fournisseur_id,
           SUM(sed.quantite * COALESCE(sed.prix_unitaire, 0))                                   AS ht,
           SUM(sed.quantite * COALESCE(sed.prix_unitaire, 0) * COALESCE(sed.taux_tva, 0) / 100) AS tva,
           SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire, 0))            AS ttc,
           (array_agg(sed.created_by ORDER BY sed.id))[1]                                       AS created_by
    FROM stock_entreprise_daily sed
    JOIN activites a ON a.id = sed.activite_id
    JOIN profil_entreprise pe ON pe.id = a.entreprise_id
    WHERE sed.type_appro = 'transfert'
      AND sed.ref_facture IS NOT NULL
      AND sed.ref_facture <> ''
    GROUP BY pe.client_id, sed.activite_id, sed.ref_facture, sed.date_appro, sed.fournisseur_id
  ) g
  RETURNING id, activite_id, ref_facture, date_facture, fournisseur_id
)
UPDATE stock_entreprise_daily sed
SET facture_id = ins.id
FROM ins
WHERE sed.type_appro = 'transfert'
  AND sed.activite_id   IS NOT DISTINCT FROM ins.activite_id
  AND sed.ref_facture   IS NOT DISTINCT FROM ins.ref_facture
  AND sed.date_appro    = ins.date_facture
  AND sed.fournisseur_id IS NOT DISTINCT FROM ins.fournisseur_id;
