-- Module vente activé par défaut pour chaque client.
-- 1) Nouveau défaut pour les futurs profils d'entreprise.
ALTER TABLE profil_entreprise ALTER COLUMN module_vente_actif SET DEFAULT true;
-- 2) Activation pour tous les clients existants qui ne l'avaient pas encore.
UPDATE profil_entreprise
   SET module_vente_actif = true,
       module_vente_activated_at = COALESCE(module_vente_activated_at, NOW())
 WHERE module_vente_actif IS DISTINCT FROM true;
