-- 167 — Manuel : la fiche du Carnet d'Acheteurs décrit la nouvelle sémantique
-- de suppression (migr 165) : transactions de stock conservées, commandes en
-- attente annulées, compte portail supprimé. REPLACE ciblé sur le bloc
-- :::attention posé par les migrations 157/161 (idempotent : ne matche plus
-- après application).

UPDATE manuel_sections
SET contenu = REPLACE(contenu,
  'Désactiver un acheteur (interrupteur « Actif ») coupe immédiatement son accès au portail. Supprimer sa fiche supprime aussi son compte de connexion.',
  'Désactiver un acheteur (interrupteur « Actif ») coupe immédiatement son accès au portail. Supprimer sa fiche supprime aussi son compte de connexion, **annule ses commandes encore en attente** (transition tracée dans l''historique des états) et **conserve ses commandes expédiées ou livrées avec leurs factures fiscales** : elles restent dans l''historique avec la mention « (supprimé) », le stock ne bouge pas, et le filtre « Acheteurs supprimés » de l''écran Commandes permet de les retrouver.')
WHERE slug = 'acheteurs-carnet';
