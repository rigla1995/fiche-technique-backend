const pool = require('../config/database');

// Save a notification to DB (called internally)
const saveNotification = async (userId, { eventType, demandeId, type, clientNom, statut, notesAdmin }) => {
  await pool.query(
    `INSERT INTO notifications (user_id, event_type, demande_id, type, client_nom, statut, notes_admin)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, eventType, demandeId || null, type || null, clientNom || null, statut || null, notesAdmin || null]
  );
};

// Save to all admin users
const saveNotificationToAdmins = async (data) => {
  const { eventType, demandeId, type, clientNom, statut, notesAdmin } = data;
  await pool.query(
    `INSERT INTO notifications (user_id, event_type, demande_id, type, client_nom, statut, notes_admin)
     SELECT u.id, $1, $2, $3, $4, $5, $6
     FROM utilisateurs u WHERE u.role = 'super_admin' AND u.actif = true`,
    [eventType, demandeId || null, type || null, clientNom || null, statut || null, notesAdmin || null]
  );
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
      createdAt: r.created_at,
    })));
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

module.exports = { saveNotification, saveNotificationToAdmins, list, clearAll, deleteOne };
