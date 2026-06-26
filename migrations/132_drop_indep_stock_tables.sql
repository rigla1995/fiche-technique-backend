-- Suppression des tables de l'ancien modèle « indépendant » (stock et pertes au
-- niveau client, sans activité). Plus aucune référence dans le code applicatif
-- (tous les chemins indép ont été retirés). Tables vides en production.
-- CASCADE pour retirer d'éventuelles contraintes FK pointant vers ces tables.
DROP TABLE IF EXISTS stock_client_daily CASCADE;
DROP TABLE IF EXISTS client_pertes CASCADE;
