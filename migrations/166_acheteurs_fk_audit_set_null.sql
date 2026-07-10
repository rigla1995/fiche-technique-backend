-- 166 — FK d'audit du module Acheteurs en ON DELETE SET NULL.
-- Les colonnes created_by / traite_par sont de la traçabilité, pas de la
-- propriété : elles ne doivent jamais empêcher la suppression d'un compte.
-- Sans cette migration, supprimer un GÉRANT ayant créé une fiche, saisi un
-- prix d'offre ou traité une commande échoue en 23503 → 500 (constat de
-- revue du chantier suppressions). Les lectures utilisent déjà des LEFT JOIN
-- utilisateurs : un NULL s'affiche proprement. Même pattern que migr 060/162.

ALTER TABLE acheteurs DROP CONSTRAINT IF EXISTS acheteurs_created_by_fkey;
ALTER TABLE acheteurs
  ADD CONSTRAINT acheteurs_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL;

ALTER TABLE commandes_acheteur DROP CONSTRAINT IF EXISTS commandes_acheteur_created_by_fkey;
ALTER TABLE commandes_acheteur
  ADD CONSTRAINT commandes_acheteur_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL;

ALTER TABLE commandes_acheteur DROP CONSTRAINT IF EXISTS commandes_acheteur_traite_par_fkey;
ALTER TABLE commandes_acheteur
  ADD CONSTRAINT commandes_acheteur_traite_par_fkey
  FOREIGN KEY (traite_par) REFERENCES utilisateurs(id) ON DELETE SET NULL;

ALTER TABLE acheteur_offre_prix_historique DROP CONSTRAINT IF EXISTS acheteur_offre_prix_historique_created_by_fkey;
ALTER TABLE acheteur_offre_prix_historique
  ADD CONSTRAINT acheteur_offre_prix_historique_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES utilisateurs(id) ON DELETE SET NULL;
