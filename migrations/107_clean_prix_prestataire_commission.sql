-- Migration: nettoyer les anciens prix par prestataire issus de la commission.
-- La commission n'existe plus : les prix par prestataire sont désormais saisis manuellement.
-- On supprime uniquement les valeurs qui correspondent au calcul commission
-- (prix_base × (1 - taux/100)), afin de préserver les prix saisis intentionnellement.

DELETE FROM article_prix_prestataire app
USING activite_articles_vendables av, activite_prestataires ap
WHERE app.article_vendable_id = av.id
  AND app.activite_prestataire_id = ap.id
  AND ap.taux_commission > 0
  AND av.prix_vente > 0
  AND ABS(app.prix_vente - ROUND(av.prix_vente * (1 - ap.taux_commission / 100.0), 2)) <= 0.02;
