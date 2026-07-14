-- 168 — Option Acheteurs dans les demandes de capacité (avenant).
-- Une demande de supplément peut désormais viser un NOUVEAU palier de l'option
-- Acheteurs : nb_acheteurs_cible = QUOTA TOTAL demandé (borne du palier 10/20/50/100),
-- pas un incrément — les paliers ne s'additionnent pas. NULL = pas de changement.
-- À la signature de l'avenant (webhook) : abonnement_config.nb_acheteurs = cible
-- + activation du module si nécessaire (profil_entreprise.module_acheteurs_actif).

ALTER TABLE support_demandes
  ADD COLUMN IF NOT EXISTS nb_acheteurs_cible INTEGER NULL
  CHECK (nb_acheteurs_cible IS NULL OR (nb_acheteurs_cible >= 1 AND nb_acheteurs_cible <= 100));
