-- Sprint 4: type de produit (utilisable / vendable)

ALTER TABLE produits
  ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'vendable'
  CHECK (type IN ('utilisable', 'vendable'));
