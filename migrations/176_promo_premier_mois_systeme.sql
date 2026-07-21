-- Promo « 1er mois offert » créée automatiquement à la création d'un client,
-- et NON supprimable par l'admin. On ajoute un verrou système sur promotions.
-- L'admin peut toujours ajouter/supprimer d'AUTRES promos (is_system = false).
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN promotions.is_system IS
  'true = promo créée par le système (ex. 1er mois offert à la création du client), non supprimable ni éditable par l''admin.';
