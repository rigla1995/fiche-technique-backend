// LabFlow Compta — journal des événements (SPEC-SOCLE D16, table compta.evenements, migration 202) : qui a fait quoi,
// quand (horodatage du serveur). `db` : pool ou client d'une transaction (l'événement suit alors le sort de l'action).
const journaliser = (db, espaceId, auteurId, type, details = {}) =>
  db.query(
    'INSERT INTO compta.evenements (espace_id, auteur_id, type, details) VALUES ($1, $2, $3, $4::jsonb)',
    [espaceId ?? null, auteurId ?? null, type, JSON.stringify(details)]
  );

module.exports = { journaliser };
