-- Migration 266 : V1c « Menus, formules et lots » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §5 bis ; feu vert
-- du client du 19/11/2026). Une ligne de caisse peut valoir PLUSIEURS produits de la carte (un menu, une formule) ou
-- plusieurs unités d'un produit (« Lot de 6 »). Le modèle l'avait prévu dès la migration 262
-- (`correspondances_ventes_cibles` : plusieurs cibles par ligne apprise, chacune avec sa quantité).
--   • ventes_imports_lignes.cibles : ce que la ligne a valu à l'import — [{ article_type, article_id, quantite,
--     montant }] : la quantité de chaque produit POUR UNE ligne vendue, et la part du montant de la ligne qui lui
--     revient. NULL pour une ligne ignorée et pour les imports d'avant V1c (un seul produit : article_type, article_id).
-- « Ignorer toujours » s'appuie sur `correspondances_ventes.ignoree`, déjà en place.
-- Idempotente.
ALTER TABLE ventes_imports_lignes ADD COLUMN IF NOT EXISTS cibles JSONB;
