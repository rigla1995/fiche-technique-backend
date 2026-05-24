-- Remove ingredient_manquant / support demandes flow only
-- demande_id was an FK to support_demandes (ON DELETE CASCADE) — safe to drop
-- type, client_nom, statut, notes_admin are still used by inventaireController for new_inventaire notifications
ALTER TABLE notifications DROP COLUMN IF EXISTS demande_id;

DROP TABLE IF EXISTS support_demandes CASCADE;
