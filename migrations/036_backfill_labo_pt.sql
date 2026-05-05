-- Backfill labo_pt_selections for PT products already marked is_stock_ingredient = true
-- Case 1: product linked via franchise_group
INSERT INTO labo_pt_selections (labo_id, produit_id)
SELECT DISTINCT a.labo_id, p.id
FROM produits p
JOIN activites a ON a.franchise_group = p.franchise_group
WHERE p.is_stock_ingredient = TRUE
  AND p.franchise_group IS NOT NULL
  AND a.labo_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Case 2: product linked via activite_id directly (activité has a labo)
INSERT INTO labo_pt_selections (labo_id, produit_id)
SELECT a.labo_id, p.id
FROM produits p
JOIN activites a ON a.id = p.activite_id
WHERE p.is_stock_ingredient = TRUE
  AND p.activite_id IS NOT NULL
  AND a.labo_id IS NOT NULL
ON CONFLICT DO NOTHING;
