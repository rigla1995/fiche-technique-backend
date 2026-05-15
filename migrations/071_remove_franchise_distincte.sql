-- Unify all activités: remove franchise/distincte type distinction
-- All activités are now just activités; labo_id remains for labo linkage

-- Migrate gerant_activite_type before updating constraint
UPDATE utilisateurs
SET gerant_activite_type = 'activite'
WHERE gerant_activite_type IN ('franchise', 'activite_distincte');

ALTER TABLE utilisateurs
  DROP CONSTRAINT IF EXISTS utilisateurs_gerant_activite_type_check;

ALTER TABLE utilisateurs
  ADD CONSTRAINT utilisateurs_gerant_activite_type_check
  CHECK (gerant_activite_type IN ('labo', 'activite'));

-- Drop type/franchise_group from activites
ALTER TABLE activites DROP COLUMN IF EXISTS type;
ALTER TABLE activites DROP COLUMN IF EXISTS franchise_group;

-- Drop activite_type/franchise_group from produits
ALTER TABLE produits DROP COLUMN IF EXISTS activite_type;
ALTER TABLE produits DROP COLUMN IF EXISTS franchise_group;

-- Drop franchise_group from labos
ALTER TABLE labos DROP COLUMN IF EXISTS franchise_group;
