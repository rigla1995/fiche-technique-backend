-- ─────────────────────────────────────────────────────────────────────────────
-- 079 — Module Vente : prestataires + articles vendables + ventes
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Prestataires de livraison (admin)
CREATE TABLE IF NOT EXISTS prestataires_livraison (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom            VARCHAR(100) NOT NULL,
  logo_url       TEXT,
  commission_pct NUMERIC(5,2) DEFAULT 0,
  actif          BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Activation par entreprise
CREATE TABLE IF NOT EXISTS entreprise_prestataires (
  entreprise_id  INTEGER REFERENCES profil_entreprise(id) ON DELETE CASCADE,
  prestataire_id UUID REFERENCES prestataires_livraison(id) ON DELETE CASCADE,
  PRIMARY KEY (entreprise_id, prestataire_id)
);

-- 3. Articles vendables par activité (produits fiches techniques + ingrédients)
CREATE TABLE IF NOT EXISTS activite_articles_vendables (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activite_id  INTEGER REFERENCES activites(id) ON DELETE CASCADE,
  article_type VARCHAR(20) NOT NULL CHECK (article_type IN ('produit','ingredient')),
  article_id   INTEGER NOT NULL,
  prix_vente   NUMERIC(10,2) NOT NULL DEFAULT 0,
  actif        BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (activite_id, article_type, article_id)
);

-- 4. Ventes
CREATE TABLE IF NOT EXISTS ventes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activite_id    INTEGER REFERENCES activites(id) ON DELETE CASCADE NOT NULL,
  date_vente     DATE NOT NULL DEFAULT CURRENT_DATE,
  type_vente     VARCHAR(20) NOT NULL CHECK (type_vente IN ('directe','prestataire')),
  prestataire_id UUID REFERENCES prestataires_livraison(id),
  statut         VARCHAR(20) DEFAULT 'confirmee' CHECK (statut IN ('brouillon','confirmee','annulee')),
  notes          TEXT,
  created_by     INTEGER REFERENCES utilisateurs(id),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vente_lignes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vente_id      UUID REFERENCES ventes(id) ON DELETE CASCADE,
  article_type  VARCHAR(20) NOT NULL CHECK (article_type IN ('produit','ingredient')),
  article_id    INTEGER NOT NULL,
  quantite      NUMERIC(10,3) NOT NULL,
  prix_unitaire NUMERIC(10,2) NOT NULL,
  cout_unitaire NUMERIC(10,2)
);

-- Seed prestataires par défaut
INSERT INTO prestataires_livraison (nom, commission_pct, actif) VALUES
  ('Uber Eats', 30.00, true),
  ('Talabat',   25.00, true),
  ('Glovo',     25.00, true)
ON CONFLICT DO NOTHING;
