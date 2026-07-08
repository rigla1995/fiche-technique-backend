-- 156 — Compte « dépôt » (module Acheteurs, lot 3) : autoriser 0 activité.
-- Un compte peut être composé de labo(s) + carnet d'acheteurs, sans aucune
-- activité (dépôt/grossiste). Le contrôle métier « au moins une activité OU un
-- labo » est appliqué côté application (création client + config admin).

ALTER TABLE abonnement_config DROP CONSTRAINT IF EXISTS abonnement_config_nb_activites_check;
ALTER TABLE abonnement_config ADD CONSTRAINT abonnement_config_nb_activites_check
  CHECK (nb_activites >= 0);
