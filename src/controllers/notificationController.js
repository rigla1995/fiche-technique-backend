const pool = require('../config/database');

// Types de notifications « file d'attente admin » : elles RESTENT affichées tant
// que l'entité source n'est pas traitée, puis sont supprimées explicitement au
// traitement (cf. deleteByRef). Toutes les AUTRES sont informatives : supprimées
// dès que le destinataire ouvre le panneau (markSeen), sinon TTL 2 h (cleanupExpired).
const PERSISTENT_EVENT_TYPES = ['demande_acces_recue'];

// Save a notification to DB (called internally)
const saveNotification = async (userId, { eventType, demandeId, type, clientNom, statut, notesAdmin, refId, refKind }) => {
  await pool.query(
    `INSERT INTO notifications (user_id, event_type, demande_id, type, client_nom, statut, notes_admin, ref_id, ref_kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [userId, eventType, demandeId || null, type || null, clientNom || null, statut || null, notesAdmin || null, refId || null, refKind || null]
  );
};

// Save to all admin users
const saveNotificationToAdmins = async (data) => {
  const { eventType, demandeId, type, clientNom, statut, notesAdmin, refId, refKind } = data;
  await pool.query(
    `INSERT INTO notifications (user_id, event_type, demande_id, type, client_nom, statut, notes_admin, ref_id, ref_kind)
     SELECT u.id, $1, $2, $3, $4, $5, $6, $7, $8
     FROM utilisateurs u WHERE u.role = 'super_admin' AND u.actif = true`,
    [eventType, demandeId || null, type || null, clientNom || null, statut || null, notesAdmin || null, refId || null, refKind || null]
  );
};

// Supprime toutes les notifications rattachées à une entité (ref_kind + ref_id),
// tous destinataires confondus — appelé quand l'entité source est traitée.
// (Le push SSE « notif_removed » pour retrait instantané est fait par l'appelant.)
const deleteByRef = async (refKind, refId, eventType = null) => {
  const params = [refKind, refId];
  let sql = 'DELETE FROM notifications WHERE ref_kind = $1 AND ref_id = $2';
  if (eventType) { sql += ' AND event_type = $3'; params.push(eventType); }
  await pool.query(sql, params);
};

// Nettoyage TTL : notifs informatives (non « file d'attente ») de plus de 2 h.
// Renvoie le nombre de lignes supprimées. Appelé par le scheduler périodique.
const cleanupExpired = async () => {
  const r = await pool.query(
    `DELETE FROM notifications
      WHERE event_type <> ALL($1::text[])
        AND created_at < NOW() - INTERVAL '2 hours'`,
    [PERSISTENT_EVENT_TYPES]
  );
  return r.rowCount;
};

// GET /api/notifications — list for current user
const list = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(result.rows.map((r) => ({
      id: r.id,
      eventType: r.event_type,
      demandeId: r.demande_id,
      type: r.type,
      clientNom: r.client_nom,
      statut: r.statut,
      notesAdmin: r.notes_admin,
      refId: r.ref_id,
      refKind: r.ref_kind,
      readAt: r.read_at,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/notifications/seen — le destinataire vient d'ouvrir le panneau :
//   • notifs informatives   → supprimées (règle « ouvertes = supprimées ») ;
//   • notifs « file d'attente » → seulement marquées lues (restent jusqu'au traitement).
const markSeen = async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM notifications WHERE user_id = $1 AND event_type <> ALL($2::text[])`,
      [req.user.id, PERSISTENT_EVENT_TYPES]
    );
    await pool.query(
      `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/notifications[?eventType=xxx] — clear all (or by eventType) for current user
const clearAll = async (req, res) => {
  try {
    const { eventType } = req.query;
    if (eventType) {
      await pool.query('DELETE FROM notifications WHERE user_id = $1 AND event_type = $2', [req.user.id, eventType]);
    } else {
      await pool.query('DELETE FROM notifications WHERE user_id = $1', [req.user.id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/notifications/:id — delete one
const deleteOne = async (req, res) => {
  try {
    await pool.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  saveNotification, saveNotificationToAdmins, deleteByRef, cleanupExpired,
  list, markSeen, clearAll, deleteOne, PERSISTENT_EVENT_TYPES,
};
