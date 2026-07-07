-- 147 : Référence des consommations de recette (type_appro='PT') = référence du PT
-- FABRIQUÉ (initiales + année, ex. « Sauce Burger » → SB-26), au lieu des initiales de
-- l'article consommé (code précédent) ou du « PT-<date> » posé par le backfill 141.
-- Attribution rétroactive uniquement quand elle est SANS AMBIGUÏTÉ : une seule référence
-- de production ce jour-là dans le périmètre (activité ou labo). Les journées à
-- productions multiples de PT différents sont laissées telles quelles.

-- Activité : articles consommés
UPDATE stock_entreprise_daily sed
   SET ref_facture = prod.ref
  FROM (
    SELECT activite_id, date_appro, MIN(ref_facture) AS ref
    FROM stock_produits_transformes
    WHERE type_appro = 'manuel' AND quantite > 0 AND ref_facture IS NOT NULL AND activite_id IS NOT NULL
    GROUP BY activite_id, date_appro
    HAVING COUNT(DISTINCT ref_facture) = 1
  ) prod
 WHERE sed.type_appro = 'PT' AND sed.quantite < 0
   AND sed.activite_id = prod.activite_id AND sed.date_appro = prod.date_appro
   AND sed.ref_facture IS DISTINCT FROM prod.ref;

-- Activité : sous-PT consommés
UPDATE stock_produits_transformes spt
   SET ref_facture = prod.ref
  FROM (
    SELECT activite_id, date_appro, MIN(ref_facture) AS ref
    FROM stock_produits_transformes
    WHERE type_appro = 'manuel' AND quantite > 0 AND ref_facture IS NOT NULL AND activite_id IS NOT NULL
    GROUP BY activite_id, date_appro
    HAVING COUNT(DISTINCT ref_facture) = 1
  ) prod
 WHERE spt.type_appro = 'PT' AND spt.quantite < 0
   AND spt.activite_id = prod.activite_id AND spt.date_appro = prod.date_appro
   AND spt.ref_facture IS DISTINCT FROM prod.ref;

-- Labo : articles consommés
UPDATE stock_labo_daily sld
   SET ref_facture = prod.ref
  FROM (
    SELECT labo_id, date_appro, MIN(ref_facture) AS ref
    FROM stock_labo_pt_daily
    WHERE type_appro = 'manuel' AND quantite > 0 AND ref_facture IS NOT NULL
    GROUP BY labo_id, date_appro
    HAVING COUNT(DISTINCT ref_facture) = 1
  ) prod
 WHERE sld.type_appro = 'PT' AND sld.quantite < 0
   AND sld.labo_id = prod.labo_id AND sld.date_appro = prod.date_appro
   AND sld.ref_facture IS DISTINCT FROM prod.ref;

-- Labo : sous-PT consommés
UPDATE stock_labo_pt_daily slpt
   SET ref_facture = prod.ref
  FROM (
    SELECT labo_id, date_appro, MIN(ref_facture) AS ref
    FROM stock_labo_pt_daily
    WHERE type_appro = 'manuel' AND quantite > 0 AND ref_facture IS NOT NULL
    GROUP BY labo_id, date_appro
    HAVING COUNT(DISTINCT ref_facture) = 1
  ) prod
 WHERE slpt.type_appro = 'PT' AND slpt.quantite < 0
   AND slpt.labo_id = prod.labo_id AND slpt.date_appro = prod.date_appro
   AND slpt.ref_facture IS DISTINCT FROM prod.ref;
