-- Donnees de test pour l'application Fiche Technique
-- A executer dans psql: \i scripts/seed-demo.sql
-- ou via: psql -U postgres -d fiche_technique -f scripts/seed-demo.sql

-- 1. Compte client de test
INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role)
VALUES (
  'Restaurant Demo',
  'demo@restaurant.tn',
  '$2a$10$c3hmO5HKGc0y00uSrKU1kuJt3BRYoPqxCmTgg7FMeHIJjdUTaSmoq',
  '+216 99 000 000',
  'client'
) ON CONFLICT (email) DO NOTHING;

-- 2. Unites
INSERT INTO unites (nom, client_id) VALUES
  ('grammes', NULL),
  ('kg', NULL),
  ('pieces', NULL),
  ('litre', NULL),
  ('cl', NULL),
  ('ml', NULL)
ON CONFLICT DO NOTHING;

-- 3. Categories
INSERT INTO categories (nom) VALUES
  ('Legumes'),
  ('Viandes'),
  ('Sauces et condiments'),
  ('Produits laitiers'),
  ('Epicerie seche'),
  ('Boulangerie')
ON CONFLICT DO NOTHING;

-- 4. Ingredients (lies au client demo)
DO $$
DECLARE
  client_id INTEGER;
  cat_legumes INTEGER;
  cat_viandes INTEGER;
  cat_sauces INTEGER;
  cat_laitiers INTEGER;
  cat_epicerie INTEGER;
  cat_boulangerie INTEGER;
  u_g INTEGER;
  u_kg INTEGER;
  u_pieces INTEGER;
  u_ml INTEGER;
BEGIN
  SELECT id INTO client_id FROM utilisateurs WHERE email = 'demo@restaurant.tn';
  SELECT id INTO cat_legumes FROM categories WHERE nom = 'Legumes';
  SELECT id INTO cat_viandes FROM categories WHERE nom = 'Viandes';
  SELECT id INTO cat_sauces FROM categories WHERE nom = 'Sauces et condiments';
  SELECT id INTO cat_laitiers FROM categories WHERE nom = 'Produits laitiers';
  SELECT id INTO cat_epicerie FROM categories WHERE nom = 'Epicerie seche';
  SELECT id INTO cat_boulangerie FROM categories WHERE nom = 'Boulangerie';
  SELECT id INTO u_g FROM unites WHERE nom = 'grammes';
  SELECT id INTO u_kg FROM unites WHERE nom = 'kg';
  SELECT id INTO u_pieces FROM unites WHERE nom = 'pieces';
  SELECT id INTO u_ml FROM unites WHERE nom = 'ml';

  INSERT INTO ingredients (nom, prix, unite_id, categorie_id, client_id) VALUES
    ('Tomate', 1.200, u_kg, cat_legumes, client_id),
    ('Oignon', 0.800, u_kg, cat_legumes, client_id),
    ('Laitue', 0.500, u_pieces, cat_legumes, client_id),
    ('Viande hachee', 28.000, u_kg, cat_viandes, client_id),
    ('Steak', 35.000, u_kg, cat_viandes, client_id),
    ('Ketchup', 4.500, u_kg, cat_sauces, client_id),
    ('Mayonnaise', 5.000, u_kg, cat_sauces, client_id),
    ('Moutarde', 6.000, u_kg, cat_sauces, client_id),
    ('Fromage cheddar', 18.000, u_kg, cat_laitiers, client_id),
    ('Creme fraiche', 7.500, u_kg, cat_laitiers, client_id),
    ('Sel', 0.500, u_kg, cat_epicerie, client_id),
    ('Poivre', 12.000, u_kg, cat_epicerie, client_id),
    ('Huile de friture', 3.500, u_litre, cat_epicerie, client_id),
    ('Pain burger', 1.200, u_pieces, cat_boulangerie, client_id),
    ('Baguette', 0.800, u_pieces, cat_boulangerie, client_id)
  ON CONFLICT DO NOTHING;
END $$;
