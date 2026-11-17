-- ─────────────────────────────────────────────────────────────────────────────
-- 259 — Recette propre à un canal (étape C2 — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.3)
--
-- Un même produit peut se préparer autrement pour un canal de vente (portion, emballage…). Sa recette « du canal » est
-- une VARIANTE : un produit à part entière (sa recette, son coût, sa sortie de stock, sa marge), lié à son produit
-- d'origine. Aucun calcul existant ne change : tout ce qui lit un produit lit une variante de la même façon.
--   variante_de_id    le produit d'origine (NULL : produit ordinaire) ;
--   variante_libelle  ce qui distingue la variante (« Livraison »), affiché en badge.
-- Règles tenues par l'application : pas de variante de variante ; un produit qui a des variantes ne se supprime pas
-- avant elles. ON DELETE SET NULL ne sert qu'à la purge d'un compte (toutes ses lignes partent d'un seul coup).
-- Rejouable.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS variante_de_id INTEGER REFERENCES produits(id) ON DELETE SET NULL;

ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS variante_libelle VARCHAR(40);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_produits_variante_pas_soi') THEN
    ALTER TABLE produits
      ADD CONSTRAINT ck_produits_variante_pas_soi CHECK (variante_de_id IS NULL OR variante_de_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_produits_variante_de
  ON produits (variante_de_id) WHERE variante_de_id IS NOT NULL;
