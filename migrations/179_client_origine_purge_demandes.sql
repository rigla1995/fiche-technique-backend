-- Flux demandes d'accès v2 :
--   • Une demande REFUSÉE est supprimée (email de courtoisie) et une demande
--     CONVERTIE est supprimée après création du client → la table ne garde que
--     les demandes OUVERTES (nouvelle / contactee).
--   • La trace de provenance vit désormais sur le CLIENT : utilisateurs.origine
--     ('site' = venu d'une demande du site vitrine, 'manuel' = ajout admin).
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS origine VARCHAR(20) NOT NULL DEFAULT 'manuel';

-- Backfill : clients issus d'une conversion historique (avant suppression des lignes).
UPDATE utilisateurs u
   SET origine = 'site'
 WHERE u.role = 'client'
   AND EXISTS (SELECT 1 FROM demandes_acces da WHERE da.converted_client_id = u.id);

-- Purge des demandes déjà traitées : l'interface n'affiche plus que nouvelle/contactee.
DELETE FROM demandes_acces WHERE statut IN ('convertie', 'refusee');
