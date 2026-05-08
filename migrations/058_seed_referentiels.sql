-- ══════════════════════════════════════════════════════════════════════════════
-- SEED: Référentiels pour la restauration
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Unités ─────────────────────────────────────────────────────────────────
-- unites has UNIQUE(nom, client_id) not UNIQUE(nom), so ON CONFLICT (nom) won't work.
-- Use WHERE NOT EXISTS to avoid duplicating global (client_id IS NULL) rows.
INSERT INTO unites (nom)
SELECT v FROM (VALUES
  ('g'), ('kg'), ('ml'), ('L'), ('pièce'), ('portion'), ('sachet'),
  ('boîte'), ('bouteille'), ('plateau'), ('tranche'), ('bouquet'),
  ('botte'), ('cuillère à soupe'), ('cuillère à café')
) AS t(v)
WHERE NOT EXISTS (SELECT 1 FROM unites u WHERE u.nom = t.v AND u.client_id IS NULL);

-- ── 2. Domaines d'activité ────────────────────────────────────────────────────
INSERT INTO domaines_activite (nom) VALUES
  ('Restauration'),
  ('Café')
ON CONFLICT (nom) DO NOTHING;

-- ── 3. Catégories ─────────────────────────────────────────────────────────────
INSERT INTO categories (nom) VALUES
  ('Viandes & Volailles'),
  ('Poissons & Fruits de mer'),
  ('Légumes & Salades'),
  ('Fruits'),
  ('Produits laitiers & Œufs'),
  ('Épices & Condiments'),
  ('Huiles & Graisses'),
  ('Farines & Céréales'),
  ('Légumineuses'),
  ('Pâtes & Riz'),
  ('Sauces & Accompagnements'),
  ('Pain & Viennoiseries'),
  ('Desserts & Sucreries'),
  ('Boissons')
ON CONFLICT (nom) DO NOTHING;

-- ── 4. Ingrédients avec domaine Restauration ──────────────────────────────────
-- Procedure must be created outside the DO block (PostgreSQL limitation)
CREATE OR REPLACE PROCEDURE _seed_add_ing(
  p_nom       TEXT,
  p_unite_id  INTEGER,
  p_cat_id    INTEGER,
  p_domaine_id INTEGER
) LANGUAGE plpgsql AS $$
DECLARE v_id INTEGER;
BEGIN
  -- ingredients has no UNIQUE(nom) constraint; use WHERE NOT EXISTS for idempotency
  INSERT INTO ingredients (nom, unite_id, categorie_id)
  SELECT p_nom, p_unite_id, p_cat_id
  WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE nom = p_nom AND client_id IS NULL)
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    -- ingredient_domaines has PK(ingredient_id, domaine_id) so ON CONFLICT DO NOTHING is safe
    INSERT INTO ingredient_domaines (ingredient_id, domaine_id)
    VALUES (v_id, p_domaine_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

DO $$
DECLARE
  v_domaine_id      INTEGER;
  v_unite_g         INTEGER;
  v_unite_kg        INTEGER;
  v_unite_ml        INTEGER;
  v_unite_l         INTEGER;
  v_unite_piece     INTEGER;
  v_unite_sachet    INTEGER;
  v_unite_boite     INTEGER;
  v_unite_bouteille INTEGER;
  v_unite_tranche   INTEGER;
  v_unite_bouquet   INTEGER;
  v_unite_botte     INTEGER;
  v_unite_css       INTEGER;
  v_unite_csc       INTEGER;

  v_cat_viandes      INTEGER;
  v_cat_poissons     INTEGER;
  v_cat_legumes      INTEGER;
  v_cat_fruits       INTEGER;
  v_cat_laitiers     INTEGER;
  v_cat_epices       INTEGER;
  v_cat_huiles       INTEGER;
  v_cat_farines      INTEGER;
  v_cat_legumineuses INTEGER;
  v_cat_pates        INTEGER;
  v_cat_sauces       INTEGER;
  v_cat_pain         INTEGER;
  v_cat_desserts     INTEGER;
  v_cat_boissons     INTEGER;
BEGIN
  -- Resolve IDs
  SELECT id INTO v_domaine_id FROM domaines_activite WHERE nom = 'Restauration';
  SELECT id INTO v_unite_g         FROM unites WHERE nom = 'g';
  SELECT id INTO v_unite_kg        FROM unites WHERE nom = 'kg';
  SELECT id INTO v_unite_ml        FROM unites WHERE nom = 'ml';
  SELECT id INTO v_unite_l         FROM unites WHERE nom = 'L';
  SELECT id INTO v_unite_piece     FROM unites WHERE nom = 'pièce';
  SELECT id INTO v_unite_sachet    FROM unites WHERE nom = 'sachet';
  SELECT id INTO v_unite_boite     FROM unites WHERE nom = 'boîte';
  SELECT id INTO v_unite_bouteille FROM unites WHERE nom = 'bouteille';
  SELECT id INTO v_unite_tranche   FROM unites WHERE nom = 'tranche';
  SELECT id INTO v_unite_bouquet   FROM unites WHERE nom = 'bouquet';
  SELECT id INTO v_unite_botte     FROM unites WHERE nom = 'botte';
  SELECT id INTO v_unite_css       FROM unites WHERE nom = 'cuillère à soupe';
  SELECT id INTO v_unite_csc       FROM unites WHERE nom = 'cuillère à café';

  SELECT id INTO v_cat_viandes      FROM categories WHERE nom = 'Viandes & Volailles';
  SELECT id INTO v_cat_poissons     FROM categories WHERE nom = 'Poissons & Fruits de mer';
  SELECT id INTO v_cat_legumes      FROM categories WHERE nom = 'Légumes & Salades';
  SELECT id INTO v_cat_fruits       FROM categories WHERE nom = 'Fruits';
  SELECT id INTO v_cat_laitiers     FROM categories WHERE nom = 'Produits laitiers & Œufs';
  SELECT id INTO v_cat_epices       FROM categories WHERE nom = 'Épices & Condiments';
  SELECT id INTO v_cat_huiles       FROM categories WHERE nom = 'Huiles & Graisses';
  SELECT id INTO v_cat_farines      FROM categories WHERE nom = 'Farines & Céréales';
  SELECT id INTO v_cat_legumineuses FROM categories WHERE nom = 'Légumineuses';
  SELECT id INTO v_cat_pates        FROM categories WHERE nom = 'Pâtes & Riz';
  SELECT id INTO v_cat_sauces       FROM categories WHERE nom = 'Sauces & Accompagnements';
  SELECT id INTO v_cat_pain         FROM categories WHERE nom = 'Pain & Viennoiseries';
  SELECT id INTO v_cat_desserts     FROM categories WHERE nom = 'Desserts & Sucreries';
  SELECT id INTO v_cat_boissons     FROM categories WHERE nom = 'Boissons';

  -- ─ Viandes & Volailles ─
  CALL _seed_add_ing('Poulet entier',         v_unite_kg,      v_cat_viandes,   v_domaine_id);
  CALL _seed_add_ing('Blanc de poulet',       v_unite_kg,      v_cat_viandes,   v_domaine_id);
  CALL _seed_add_ing('Cuisse de poulet',      v_unite_kg,      v_cat_viandes,   v_domaine_id);
  CALL _seed_add_ing('Dinde (escalope)',      v_unite_kg,      v_cat_viandes,   v_domaine_id);
  CALL _seed_add_ing('Bœuf haché',           v_unite_kg,      v_cat_viandes,   v_domaine_id);
  CALL _seed_add_ing('Steak de bœuf',        v_unite_kg,      v_cat_viandes,   v_domaine_id);
  CALL _seed_add_ing('Merguez',              v_unite_kg,      v_cat_viandes,   v_domaine_id);
  CALL _seed_add_ing('Côtelettes d''agneau', v_unite_kg,      v_cat_viandes,   v_domaine_id);
  CALL _seed_add_ing('Gigot d''agneau',      v_unite_kg,      v_cat_viandes,   v_domaine_id);
  CALL _seed_add_ing('Escalope de veau',     v_unite_kg,      v_cat_viandes,   v_domaine_id);
  CALL _seed_add_ing('Foie de veau',         v_unite_kg,      v_cat_viandes,   v_domaine_id);
  CALL _seed_add_ing('Saucisses',            v_unite_kg,      v_cat_viandes,   v_domaine_id);

  -- ─ Poissons & Fruits de mer ─
  CALL _seed_add_ing('Filet de loup',        v_unite_kg,      v_cat_poissons,  v_domaine_id);
  CALL _seed_add_ing('Filet de daurade',     v_unite_kg,      v_cat_poissons,  v_domaine_id);
  CALL _seed_add_ing('Crevettes',            v_unite_kg,      v_cat_poissons,  v_domaine_id);
  CALL _seed_add_ing('Calamars',             v_unite_kg,      v_cat_poissons,  v_domaine_id);
  CALL _seed_add_ing('Thon en boîte',        v_unite_boite,   v_cat_poissons,  v_domaine_id);
  CALL _seed_add_ing('Sardines fraîches',    v_unite_kg,      v_cat_poissons,  v_domaine_id);
  CALL _seed_add_ing('Moules',               v_unite_kg,      v_cat_poissons,  v_domaine_id);
  CALL _seed_add_ing('Homard',               v_unite_piece,   v_cat_poissons,  v_domaine_id);

  -- ─ Légumes & Salades ─
  CALL _seed_add_ing('Tomates',              v_unite_kg,      v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Oignons',              v_unite_kg,      v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Pommes de terre',      v_unite_kg,      v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Poivrons rouges',      v_unite_kg,      v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Poivrons verts',       v_unite_kg,      v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Courgettes',           v_unite_kg,      v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Carottes',             v_unite_kg,      v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Aubergines',           v_unite_kg,      v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Ail',                  v_unite_kg,      v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Salade verte',         v_unite_piece,   v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Laitue',               v_unite_piece,   v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Persil',               v_unite_bouquet, v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Coriandre fraîche',    v_unite_bouquet, v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Menthe fraîche',       v_unite_botte,   v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Épinards',             v_unite_kg,      v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Brocolis',             v_unite_kg,      v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Champignons',          v_unite_kg,      v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Céleri',               v_unite_botte,   v_cat_legumes,   v_domaine_id);
  CALL _seed_add_ing('Concombre',            v_unite_piece,   v_cat_legumes,   v_domaine_id);

  -- ─ Fruits ─
  CALL _seed_add_ing('Citron',               v_unite_piece,   v_cat_fruits,    v_domaine_id);
  CALL _seed_add_ing('Citron vert',          v_unite_piece,   v_cat_fruits,    v_domaine_id);
  CALL _seed_add_ing('Orange',               v_unite_piece,   v_cat_fruits,    v_domaine_id);
  CALL _seed_add_ing('Pomme',                v_unite_piece,   v_cat_fruits,    v_domaine_id);
  CALL _seed_add_ing('Banane',               v_unite_piece,   v_cat_fruits,    v_domaine_id);
  CALL _seed_add_ing('Fraises',              v_unite_kg,      v_cat_fruits,    v_domaine_id);
  CALL _seed_add_ing('Ananas',               v_unite_piece,   v_cat_fruits,    v_domaine_id);
  CALL _seed_add_ing('Dattes',               v_unite_kg,      v_cat_fruits,    v_domaine_id);

  -- ─ Produits laitiers & Œufs ─
  CALL _seed_add_ing('Œufs',                 v_unite_piece,   v_cat_laitiers,  v_domaine_id);
  CALL _seed_add_ing('Lait entier',          v_unite_l,       v_cat_laitiers,  v_domaine_id);
  CALL _seed_add_ing('Crème fraîche',        v_unite_l,       v_cat_laitiers,  v_domaine_id);
  CALL _seed_add_ing('Beurre',               v_unite_kg,      v_cat_laitiers,  v_domaine_id);
  CALL _seed_add_ing('Fromage râpé',         v_unite_kg,      v_cat_laitiers,  v_domaine_id);
  CALL _seed_add_ing('Mozzarella',           v_unite_kg,      v_cat_laitiers,  v_domaine_id);
  CALL _seed_add_ing('Yaourt nature',        v_unite_piece,   v_cat_laitiers,  v_domaine_id);

  -- ─ Épices & Condiments ─
  CALL _seed_add_ing('Sel',                  v_unite_kg,      v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Poivre noir',          v_unite_g,       v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Cumin',                v_unite_g,       v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Curcuma',              v_unite_g,       v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Harissa',              v_unite_kg,      v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Paprika',              v_unite_g,       v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Cannelle',             v_unite_g,       v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Menthe séchée',        v_unite_g,       v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Piment fort',          v_unite_g,       v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Laurier',              v_unite_sachet,  v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Thym',                 v_unite_g,       v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Romarin',              v_unite_g,       v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Ras el-hanout',        v_unite_g,       v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Tabil',                v_unite_g,       v_cat_epices,    v_domaine_id);
  CALL _seed_add_ing('Safran',               v_unite_g,       v_cat_epices,    v_domaine_id);

  -- ─ Huiles & Graisses ─
  CALL _seed_add_ing('Huile d''olive',       v_unite_l,       v_cat_huiles,    v_domaine_id);
  CALL _seed_add_ing('Huile végétale',       v_unite_l,       v_cat_huiles,    v_domaine_id);
  CALL _seed_add_ing('Ghee (beurre clarifié)', v_unite_kg,    v_cat_huiles,    v_domaine_id);

  -- ─ Farines & Céréales ─
  CALL _seed_add_ing('Farine de blé',        v_unite_kg,      v_cat_farines,   v_domaine_id);
  CALL _seed_add_ing('Semoule fine',         v_unite_kg,      v_cat_farines,   v_domaine_id);
  CALL _seed_add_ing('Semoule moyenne',      v_unite_kg,      v_cat_farines,   v_domaine_id);
  CALL _seed_add_ing('Semoule grossière',    v_unite_kg,      v_cat_farines,   v_domaine_id);
  CALL _seed_add_ing('Farine de maïs',       v_unite_kg,      v_cat_farines,   v_domaine_id);
  CALL _seed_add_ing('Pain de mie',          v_unite_piece,   v_cat_farines,   v_domaine_id);
  CALL _seed_add_ing('Chapelure',            v_unite_kg,      v_cat_farines,   v_domaine_id);

  -- ─ Légumineuses ─
  CALL _seed_add_ing('Lentilles rouges',     v_unite_kg,      v_cat_legumineuses, v_domaine_id);
  CALL _seed_add_ing('Lentilles vertes',     v_unite_kg,      v_cat_legumineuses, v_domaine_id);
  CALL _seed_add_ing('Pois chiches',         v_unite_kg,      v_cat_legumineuses, v_domaine_id);
  CALL _seed_add_ing('Haricots blancs',      v_unite_kg,      v_cat_legumineuses, v_domaine_id);
  CALL _seed_add_ing('Fèves',                v_unite_kg,      v_cat_legumineuses, v_domaine_id);

  -- ─ Pâtes & Riz ─
  CALL _seed_add_ing('Riz long grain',       v_unite_kg,      v_cat_pates,     v_domaine_id);
  CALL _seed_add_ing('Riz basmati',          v_unite_kg,      v_cat_pates,     v_domaine_id);
  CALL _seed_add_ing('Pâtes (spaghetti)',    v_unite_kg,      v_cat_pates,     v_domaine_id);
  CALL _seed_add_ing('Pâtes (macaroni)',     v_unite_kg,      v_cat_pates,     v_domaine_id);
  CALL _seed_add_ing('Vermicelles',          v_unite_kg,      v_cat_pates,     v_domaine_id);
  CALL _seed_add_ing('Couscous',             v_unite_kg,      v_cat_pates,     v_domaine_id);

  -- ─ Sauces & Accompagnements ─
  CALL _seed_add_ing('Concentré de tomate',  v_unite_boite,   v_cat_sauces,    v_domaine_id);
  CALL _seed_add_ing('Sauce tomate',         v_unite_boite,   v_cat_sauces,    v_domaine_id);
  CALL _seed_add_ing('Mayonnaise',           v_unite_kg,      v_cat_sauces,    v_domaine_id);
  CALL _seed_add_ing('Ketchup',              v_unite_kg,      v_cat_sauces,    v_domaine_id);
  CALL _seed_add_ing('Moutarde',             v_unite_kg,      v_cat_sauces,    v_domaine_id);
  CALL _seed_add_ing('Vinaigre blanc',       v_unite_l,       v_cat_sauces,    v_domaine_id);
  CALL _seed_add_ing('Sucre',                v_unite_kg,      v_cat_sauces,    v_domaine_id);
  CALL _seed_add_ing('Miel',                 v_unite_kg,      v_cat_sauces,    v_domaine_id);

  -- ─ Pain & Viennoiseries ─
  CALL _seed_add_ing('Baguette',             v_unite_piece,   v_cat_pain,      v_domaine_id);
  CALL _seed_add_ing('Pain arabe (kesra)',   v_unite_piece,   v_cat_pain,      v_domaine_id);
  CALL _seed_add_ing('Pain burger',          v_unite_piece,   v_cat_pain,      v_domaine_id);
  CALL _seed_add_ing('Croissant',            v_unite_piece,   v_cat_pain,      v_domaine_id);

  -- ─ Desserts & Sucreries ─
  CALL _seed_add_ing('Chocolat noir',        v_unite_kg,      v_cat_desserts,  v_domaine_id);
  CALL _seed_add_ing('Pâte feuilletée',      v_unite_kg,      v_cat_desserts,  v_domaine_id);
  CALL _seed_add_ing('Crème pâtissière',     v_unite_kg,      v_cat_desserts,  v_domaine_id);
  CALL _seed_add_ing('Eau de fleur d''oranger', v_unite_ml,   v_cat_desserts,  v_domaine_id);
  CALL _seed_add_ing('Eau de rose',          v_unite_ml,      v_cat_desserts,  v_domaine_id);
  CALL _seed_add_ing('Amandes',              v_unite_kg,      v_cat_desserts,  v_domaine_id);
  CALL _seed_add_ing('Pistaches',            v_unite_kg,      v_cat_desserts,  v_domaine_id);
  CALL _seed_add_ing('Pignons de pin',       v_unite_kg,      v_cat_desserts,  v_domaine_id);

  -- ─ Boissons ─
  CALL _seed_add_ing('Eau minérale',         v_unite_bouteille, v_cat_boissons, v_domaine_id);
  CALL _seed_add_ing('Jus d''orange',        v_unite_l,         v_cat_boissons, v_domaine_id);
  CALL _seed_add_ing('Sirop de menthe',      v_unite_bouteille, v_cat_boissons, v_domaine_id);
  CALL _seed_add_ing('Café moulu',           v_unite_kg,        v_cat_boissons, v_domaine_id);
  CALL _seed_add_ing('Thé vert',             v_unite_g,         v_cat_boissons, v_domaine_id);

END;
$$;

DROP PROCEDURE IF EXISTS _seed_add_ing(TEXT, INTEGER, INTEGER, INTEGER);
