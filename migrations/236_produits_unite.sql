-- Migration 236 : P1 « L'unité des produits utilisables » (labflow-reprise/produits-prestataires/PLAN.md §2 ligne P1, §3 ;
-- réponses du client du 13/10). Un produit utilisable choisit son UNITÉ FINALE (kg, pièce… une unité de la table unites)
-- et la QUANTITÉ que produit sa recette (4,6 kg) ; sa recette s'enregistre POUR 1 UNITÉ (2 kg de concentré pour 4,6 kg
-- → 0,434783 kg pour 1 kg), si bien que la production, le stock, les coûts et les transferts se comptent dans cette
-- unité sans autre changement (portion × quantité). Migration additive : aucune recette ni aucun stock ne change.
-- 1) Unité et quantité produite : NULL pour les produits d'avant (comptés « à la recette », 1 unité = 1 recette) ; les
--    deux ensemble ou aucune.
ALTER TABLE produits ADD COLUMN IF NOT EXISTS unite_id INTEGER REFERENCES unites(id) ON DELETE RESTRICT;
ALTER TABLE produits ADD COLUMN IF NOT EXISTS quantite_produite NUMERIC(12, 3);
DO $$ BEGIN
  ALTER TABLE produits ADD CONSTRAINT ck_produits_quantite_produite CHECK (quantite_produite IS NULL OR quantite_produite > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE produits ADD CONSTRAINT ck_produits_unite_quantite CHECK ((unite_id IS NULL) = (quantite_produite IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_produits_unite ON produits (unite_id) WHERE unite_id IS NOT NULL;

-- 2) Les quantités des recettes jusqu'à 6 décimales (le serveur arrondit à 6, les écrans affichent 3) : ramenées à
--    1 unité, 30 g de sel dans 4,6 kg (0,006522 kg) ne doivent pas tomber à l'arrondi. NUMERIC sans échelle fixe : les
--    valeurs existantes gardent leur écriture (« 2.000 »), sans zéros ajoutés à l'affichage. Élargissement seul.
ALTER TABLE produit_ingredients ALTER COLUMN portion TYPE NUMERIC;
ALTER TABLE produit_sous_produits ALTER COLUMN portion TYPE NUMERIC;
