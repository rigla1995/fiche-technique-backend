-- Cycle de vie des notifications :
--   • ref_id / ref_kind : rattache une notif à l'entité source SANS FK dure.
--     (notifications.demande_id est une FK sur support_demandes ; impossible d'y
--      loger l'id d'une demande d'accès. On utilise donc ref_kind='demande_acces'
--      + ref_id = demandes_acces.id pour pouvoir la retrouver/supprimer au traitement.)
--   • read_at : horodatage « vue par le destinataire » (avant, l'état lu était
--     purement local au front et se réinitialisait à chaque rechargement).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ref_id   INTEGER;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ref_kind VARCHAR(40);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at  TIMESTAMPTZ;

-- Retrouver rapidement toutes les notifs d'une entité (suppression au traitement).
CREATE INDEX IF NOT EXISTS idx_notifications_ref ON notifications(ref_kind, ref_id);
-- Balayage du TTL 2 h des notifs informatives.
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
