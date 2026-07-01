-- 135: uniformiser le libellé du type de production des PT sur 'manuel' (comme les articles),
-- pour l'affichage de la colonne TYPE dans l'historique PT. La valeur 'production' posée par la
-- migration 134 (déployée le même jour) devient 'manuel'. Les consommations restent 'PT'.
UPDATE stock_produits_transformes SET type_appro = 'manuel' WHERE type_appro = 'production';
UPDATE stock_labo_pt_daily        SET type_appro = 'manuel' WHERE type_appro = 'production';
