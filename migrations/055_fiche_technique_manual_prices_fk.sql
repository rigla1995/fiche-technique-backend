-- 1. Clear orphaned data first (before adding FK constraints)
TRUNCATE TABLE fiche_technique_manual_prices;

-- 2. Now add FK so future client deletes cascade to their manual price configs
ALTER TABLE fiche_technique_manual_prices
  ADD CONSTRAINT fk_ftmp_client
    FOREIGN KEY (client_id) REFERENCES utilisateurs(id) ON DELETE CASCADE;

-- 3. Clear ingredients first (references unites + categories; cascades to labo/activite selections)
TRUNCATE TABLE ingredients CASCADE;

-- 4. Now safe to clear unites and categories
TRUNCATE TABLE categories CASCADE;
TRUNCATE TABLE unites CASCADE;

-- 5. Clear config/reference tables
TRUNCATE TABLE tarifs_config CASCADE;
TRUNCATE TABLE domaines_activite CASCADE;
