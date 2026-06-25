-- Nettoyage du résidu DB de la refonte Espace Produits (revertée le 2026-06-25).
-- Le revert de code ne défait pas les migrations 125/126 déjà appliquées en PROD : on les annule ici.

-- 1) Colonne d'origine (migration 125). DROP COLUMN retire automatiquement l'index
--    idx_produits_origine et la contrainte produits_origine_check qui en dépendent.
--    Les produits gardent leurs lignes (ex. "Cookies" redevient un produit vendable normal,
--    toujours affecté à ses activités via produit_activite_affectation / labo_pt_selections).
ALTER TABLE produits DROP COLUMN IF EXISTS origine;

-- 2) Entrées de base de connaissances IA seedées par la migration 126.
DELETE FROM ai_knowledge_base WHERE lower(titre) IN (
  lower('Origine d''un produit (labo ou activité)'),
  lower('Produit Labo'),
  lower('Produit Utilisable Labo (PU Labo)'),
  lower('Produit Activité'),
  lower('Produit Utilisable Activité (PU Activité)'),
  lower('Réception en activité : transfert uniquement')
);

-- 3) Retire les enregistrements de suivi des migrations 125/126 (leurs fichiers ont été retirés
--    du code par le revert). Ainsi, si la refonte est un jour ré-appliquée depuis feat/, les
--    migrations 125/126 se ré-exécuteront proprement au lieu d'être considérées déjà faites.
DELETE FROM _migrations WHERE filename IN ('125_produit_origine.sql', '126_ai_kb_espace_produits.sql');
