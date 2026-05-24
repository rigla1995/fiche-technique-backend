-- Remove ingredient_manquant / support demandes flow
-- notifications.demande_id has ON DELETE CASCADE from support_demandes
ALTER TABLE notifications DROP COLUMN IF EXISTS demande_id;
ALTER TABLE notifications DROP COLUMN IF EXISTS type;
ALTER TABLE notifications DROP COLUMN IF EXISTS client_nom;
ALTER TABLE notifications DROP COLUMN IF EXISTS statut;
ALTER TABLE notifications DROP COLUMN IF EXISTS notes_admin;

DROP TABLE IF EXISTS support_demandes CASCADE;
