-- ─────────────────────────────────────────────────────────────────────────────
-- 078 — Catalogue global : domaines d'activité + catégories + ingrédients
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Table des domaines d'activité
CREATE TABLE IF NOT EXISTS domaines_activite (
  id          SERIAL PRIMARY KEY,
  nom         VARCHAR(100) NOT NULL,
  slug        VARCHAR(50)  NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  CONSTRAINT domaines_activite_slug_key UNIQUE (slug)
);

-- Patch tables créées avant la structure complète
ALTER TABLE domaines_activite ADD COLUMN IF NOT EXISTS slug        VARCHAR(50);
ALTER TABLE domaines_activite ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE domaines_activite ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS domaines_activite_slug_key ON domaines_activite(slug);

-- 2. Lien domaine sur les catégories (NULL = toutes catégories confondues)
ALTER TABLE categories  ADD COLUMN IF NOT EXISTS domaine_id INT REFERENCES domaines_activite(id) ON DELETE SET NULL;

-- 3. Domaine client sur le profil entreprise
ALTER TABLE profil_entreprise ADD COLUMN IF NOT EXISTS domaine_id INT REFERENCES domaines_activite(id) ON DELETE SET NULL;

-- ─── Domaines ────────────────────────────────────────────────────────────────
INSERT INTO domaines_activite (nom, slug, description) VALUES
  ('Restauration', 'restauration', 'Restaurants, traiteurs, cafétérias, food court'),
  ('Boulangerie',  'boulangerie',  'Boulangeries, pâtisseries, viennoiseries'),
  ('Café',         'cafe',         'Cafés, salons de thé, espresso bars')
ON CONFLICT (slug) DO NOTHING;

-- ─── Unités globales (si pas encore créées par 077) ─────────────────────────
INSERT INTO unites (nom, client_id) VALUES
  ('kg',     NULL), ('g',       NULL), ('L',       NULL), ('ml',     NULL),
  ('cl',     NULL), ('pièces',  NULL), ('sachet',  NULL), ('boîte',  NULL),
  ('rouleau',NULL), ('litre',   NULL), ('portion', NULL), ('barquette', NULL)
ON CONFLICT (nom, client_id) DO NOTHING;

-- ─── Catégories globales par domaine ─────────────────────────────────────────
-- Restauration
INSERT INTO categories (nom, domaine_id)
SELECT cat, d.id FROM (VALUES
  ('Farines & Féculents'),
  ('Viandes & Volailles'),
  ('Poissons & Fruits de mer'),
  ('Légumes frais'),
  ('Légumineuses'),
  ('Épices & Condiments'),
  ('Corps gras'),
  ('Produits laitiers & Œufs'),
  ('Pâtes & Céréales'),
  ('Sauces & Conserves'),
  ('Emballages restauration'),
  ('Boissons')
) AS t(cat)
CROSS JOIN domaines_activite d
WHERE d.slug = 'restauration'
ON CONFLICT (nom) DO UPDATE SET domaine_id = EXCLUDED.domaine_id;

-- Boulangerie
INSERT INTO categories (nom, domaine_id)
SELECT cat, d.id FROM (VALUES
  ('Farines & Céréales'),
  ('Sucres & Confiseries'),
  ('Corps gras'),
  ('Produits laitiers & Œufs'),
  ('Levures & Agents levants'),
  ('Épices & Arômes'),
  ('Chocolat & Cacao'),
  ('Fruits secs & Oléagineux'),
  ('Emballages'),
  ('Produits frais'),
  ('Divers')
) AS t(cat)
CROSS JOIN domaines_activite d
WHERE d.slug = 'boulangerie'
ON CONFLICT (nom) DO UPDATE SET domaine_id = EXCLUDED.domaine_id;

-- Café
INSERT INTO categories (nom, domaine_id)
SELECT cat, d.id FROM (VALUES
  ('Cafés & Thés'),
  ('Sirops & Arômes'),
  ('Produits laitiers'),
  ('Sucres & Édulcorants'),
  ('Snacking & Viennoiseries'),
  ('Emballages café'),
  ('Consommables')
) AS t(cat)
CROSS JOIN domaines_activite d
WHERE d.slug = 'cafe'
ON CONFLICT (nom) DO UPDATE SET domaine_id = EXCLUDED.domaine_id;

-- ─── 50 Ingrédients globaux — domaine Restauration (Tunisie) ─────────────────
-- Format : (nom, prix_ref, unite_nom, categorie_nom)
-- client_id = NULL → global, partagé par tous les clients Restauration

DO $$
DECLARE
  v_unite_id    INT;
  v_cat_id      INT;
  v_client_id   INT := NULL;
BEGIN

  -- Helper interne
  -- INSERT IGNORE pattern : on tente l'insert, ON CONFLICT skip

  -- ── Farines & Féculents (5) ────────────────────────────────────────────────
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'kg' AND c.nom = 'Farines & Féculents' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Farine blanche T55',    1.050, v_unite_id, v_client_id, v_cat_id),
      ('Semoule fine',          0.950, v_unite_id, v_client_id, v_cat_id),
      ('Semoule grosse',        0.920, v_unite_id, v_client_id, v_cat_id),
      ('Fécule de maïs',        2.800, v_unite_id, v_client_id, v_cat_id),
      ('Farine de blé complet', 1.300, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- ── Viandes & Volailles (8) ────────────────────────────────────────────────
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'kg' AND c.nom = 'Viandes & Volailles' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Poulet entier',          8.500, v_unite_id, v_client_id, v_cat_id),
      ('Escalopes de poulet',   11.000, v_unite_id, v_client_id, v_cat_id),
      ('Bœuf haché',            22.000, v_unite_id, v_client_id, v_cat_id),
      ('Côtelettes d''agneau',  28.000, v_unite_id, v_client_id, v_cat_id),
      ('Merguez fraîche',       14.000, v_unite_id, v_client_id, v_cat_id),
      ('Escalopes de veau',     32.000, v_unite_id, v_client_id, v_cat_id),
      ('Foie de veau',          18.000, v_unite_id, v_client_id, v_cat_id),
      ('Kefta (viande hachée épicée)', 20.000, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- ── Poissons & Fruits de mer (4) ───────────────────────────────────────────
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'kg' AND c.nom = 'Poissons & Fruits de mer' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Sardines fraîches',  6.000, v_unite_id, v_client_id, v_cat_id),
      ('Crevettes fraîches', 32.000, v_unite_id, v_client_id, v_cat_id),
      ('Loup de mer',        28.000, v_unite_id, v_client_id, v_cat_id),
      ('Calamars',           18.000, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- Thon conserve (boîte)
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'boîte' AND c.nom = 'Poissons & Fruits de mer' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Thon en conserve', 4.200, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- ── Légumes frais (10) ─────────────────────────────────────────────────────
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'kg' AND c.nom = 'Légumes frais' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Pommes de terre',   0.900, v_unite_id, v_client_id, v_cat_id),
      ('Tomates fraîches',  1.200, v_unite_id, v_client_id, v_cat_id),
      ('Oignons',           0.700, v_unite_id, v_client_id, v_cat_id),
      ('Carottes',          0.800, v_unite_id, v_client_id, v_cat_id),
      ('Poivrons rouges',   1.800, v_unite_id, v_client_id, v_cat_id),
      ('Courgettes',        1.100, v_unite_id, v_client_id, v_cat_id),
      ('Ail',               4.500, v_unite_id, v_client_id, v_cat_id),
      ('Piment rouge frais',3.000, v_unite_id, v_client_id, v_cat_id),
      ('Navets',            0.600, v_unite_id, v_client_id, v_cat_id),
      ('Choux blanc',       0.750, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- ── Légumineuses (4) ───────────────────────────────────────────────────────
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'kg' AND c.nom = 'Légumineuses' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Pois chiches',    2.800, v_unite_id, v_client_id, v_cat_id),
      ('Lentilles corail',3.200, v_unite_id, v_client_id, v_cat_id),
      ('Haricots blancs', 2.500, v_unite_id, v_client_id, v_cat_id),
      ('Fèves sèches',    2.200, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- ── Épices & Condiments (7) ────────────────────────────────────────────────
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'kg' AND c.nom = 'Épices & Condiments' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Sel fin',           0.250, v_unite_id, v_client_id, v_cat_id),
      ('Cumin moulu',      12.000, v_unite_id, v_client_id, v_cat_id),
      ('Coriandre moulue', 10.000, v_unite_id, v_client_id, v_cat_id),
      ('Paprika doux',     14.000, v_unite_id, v_client_id, v_cat_id),
      ('Curcuma',          18.000, v_unite_id, v_client_id, v_cat_id),
      ('Poivre noir moulu',22.000, v_unite_id, v_client_id, v_cat_id),
      ('Tabel (mélange d''épices tunisien)', 16.000, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- Harissa (boîte)
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'boîte' AND c.nom = 'Épices & Condiments' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Harissa (conserve)', 3.500, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- ── Corps gras (3) ─────────────────────────────────────────────────────────
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'L' AND c.nom = 'Corps gras' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Huile végétale',            2.800, v_unite_id, v_client_id, v_cat_id),
      ('Huile d''olive extra vierge', 7.500, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'kg' AND c.nom = 'Corps gras' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Beurre doux', 12.500, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- ── Produits laitiers & Œufs (4) ──────────────────────────────────────────
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'L' AND c.nom = 'Produits laitiers & Œufs' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Lait entier',      1.050, v_unite_id, v_client_id, v_cat_id),
      ('Crème fraîche 35%',6.800, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'pièces' AND c.nom = 'Produits laitiers & Œufs' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Œufs frais', 0.450, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'boîte' AND c.nom = 'Produits laitiers & Œufs' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Fromage fondu (Kiri)', 4.200, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- ── Pâtes & Céréales (3) ──────────────────────────────────────────────────
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'kg' AND c.nom = 'Pâtes & Céréales' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Riz long grain',   1.400, v_unite_id, v_client_id, v_cat_id),
      ('Pâtes (spaghetti)',1.100, v_unite_id, v_client_id, v_cat_id),
      ('Couscous moyen',   1.200, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- ── Sauces & Conserves (2) ────────────────────────────────────────────────
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'kg' AND c.nom = 'Sauces & Conserves' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Concentré de tomate', 3.500, v_unite_id, v_client_id, v_cat_id),
      ('Olives noires',       8.000, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- ── Emballages restauration (3) ────────────────────────────────────────────
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'pièces' AND c.nom = 'Emballages restauration' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Boîtes à emporter (small)',  0.350, v_unite_id, v_client_id, v_cat_id),
      ('Boîtes à emporter (large)',  0.550, v_unite_id, v_client_id, v_cat_id),
      ('Couverts jetables (set)',    0.200, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- Sacs kraft (sachet)
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'sachet' AND c.nom = 'Emballages restauration' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Sacs kraft (emporter)', 0.180, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

  -- ── Boissons (3) ──────────────────────────────────────────────────────────
  FOR v_unite_id, v_cat_id IN
    SELECT u.id, c.id FROM unites u, categories c
    WHERE u.nom = 'L' AND c.nom = 'Boissons' LIMIT 1
  LOOP
    INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES
      ('Eau minérale (bidon)',  0.350, v_unite_id, v_client_id, v_cat_id),
      ('Jus d''orange pur',     2.800, v_unite_id, v_client_id, v_cat_id),
      ('Limonade (sirop)',      3.200, v_unite_id, v_client_id, v_cat_id)
    ON CONFLICT (nom, client_id) DO NOTHING;
  END LOOP;

END $$;
