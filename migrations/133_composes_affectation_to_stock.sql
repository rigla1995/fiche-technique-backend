-- 133: Les composés valorisés (produits.origine='labo') doivent vivre dans le circuit
-- stock PT au niveau de l'activité (produit_activite_stock), et non dans l'affectation
-- d'affichage (produit_activite_affectation, réservée aux vendables d'activité).
--
-- Depuis la refonte Espace Produit, le toggle « activité » d'un composé passait à tort
-- par produit_activite_affectation. On rebascule ces liens vers le stock d'activité :
-- comme le produit a origine='labo', il y apparaît en mode « transfert uniquement »
-- (badge dérivé, pas d'appro manuel côté activité).

-- 1) Déplacer les affectations des composés labo vers le stock d'activité
INSERT INTO produit_activite_stock (produit_id, activite_id, labo_id)
SELECT paa.produit_id, paa.activite_id, a.labo_id
FROM produit_activite_affectation paa
JOIN produits p   ON p.id = paa.produit_id
JOIN activites a  ON a.id = paa.activite_id
WHERE p.origine = 'labo'
ON CONFLICT (produit_id, activite_id) DO NOTHING;

-- 2) Assurer le lien labo (labo_pt_selections) pour ces composés
INSERT INTO labo_pt_selections (labo_id, produit_id)
SELECT DISTINCT a.labo_id, paa.produit_id
FROM produit_activite_affectation paa
JOIN produits p   ON p.id = paa.produit_id
JOIN activites a  ON a.id = paa.activite_id
WHERE p.origine = 'labo' AND a.labo_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3) Supprimer les affectations d'affichage obsolètes des composés labo
DELETE FROM produit_activite_affectation paa
USING produits p
WHERE p.id = paa.produit_id AND p.origine = 'labo';
