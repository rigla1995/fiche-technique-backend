-- Suppression de la notion entreprise/indépendant.
-- Un compte client gère 1..N activités et 1..N labos, sans distinction de type.
-- La colonne compte_type ne pilote plus aucun comportement : le backend ne la lit
-- plus nulle part (chemins indép retirés : upgrade, fournisseurs, stock /client/*,
-- rapports/IA). On peut donc la supprimer des deux tables qui la portaient.
ALTER TABLE utilisateurs DROP COLUMN IF EXISTS compte_type;
ALTER TABLE abonnements  DROP COLUMN IF EXISTS compte_type;
