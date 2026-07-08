-- 154 — Module Acheteurs (lot 2) : tarifs/offres proposés aux acheteurs.
-- Une offre = un article (famille achetable) ou un produit composé labo, avec
-- DEUX prix TTC : à l'unité et par lot (taille de lot configurable, lot optionnel).
-- Le taux de TVA est porté par l'offre (facture fiscale : HT dérivé du TTC, jamais re-taxé).
-- Activation impossible sans prix unitaire > 0 (contrôle applicatif, même règle que le module ventes).

CREATE TABLE IF NOT EXISTS acheteur_offres (
  id                SERIAL PRIMARY KEY,
  client_id         INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  article_type      VARCHAR(12) NOT NULL CHECK (article_type IN ('ingredient', 'produit')),
  article_id        INTEGER NOT NULL,
  prix_unitaire_ttc NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (prix_unitaire_ttc >= 0),
  taux_tva          NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (taux_tva >= 0 AND taux_tva <= 100),
  taille_lot        NUMERIC(10,3) CHECK (taille_lot IS NULL OR taille_lot > 0),
  prix_lot_ttc      NUMERIC(10,3) CHECK (prix_lot_ttc IS NULL OR prix_lot_ttc >= 0),
  actif             BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, article_type, article_id),
  -- le prix par lot va avec sa taille de lot (les deux ou aucun)
  CHECK ((taille_lot IS NULL) = (prix_lot_ttc IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_acheteur_offres_client ON acheteur_offres(client_id, actif);

-- Historisation des prix (pattern article_vendable_prix_historique) :
-- une ligne à chaque enregistrement d'un prix unitaire > 0.
CREATE TABLE IF NOT EXISTS acheteur_offre_prix_historique (
  id                SERIAL PRIMARY KEY,
  offre_id          INTEGER NOT NULL REFERENCES acheteur_offres(id) ON DELETE CASCADE,
  prix_unitaire_ttc NUMERIC(10,3) NOT NULL,
  taille_lot        NUMERIC(10,3),
  prix_lot_ttc      NUMERIC(10,3),
  taux_tva          NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_by        INTEGER REFERENCES utilisateurs(id),
  saved_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aoph_offre ON acheteur_offre_prix_historique(offre_id, saved_at DESC);
