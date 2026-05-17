-- Ensure standard units exist as global records (client_id = NULL)
-- so they survive client deletion (ON DELETE CASCADE only affects client-specific rows)
INSERT INTO unites (nom, client_id) VALUES
  ('kg',     NULL),
  ('g',      NULL),
  ('L',      NULL),
  ('ml',     NULL),
  ('cl',     NULL),
  ('pièces', NULL),
  ('sachet', NULL),
  ('boîte',  NULL),
  ('rouleau',NULL)
ON CONFLICT (nom, client_id) DO NOTHING;
