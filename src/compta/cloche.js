// LabFlow Compta, étape S3c (demande du client du 07/10) : la cloche de LabFlow Compta lit les routes des notifications
// avec `?produit=compta` (src/controllers/notificationController.js). Une personne de rôle « comptable » n'utilise que
// LabFlow Compta : toutes ses notifications. Pour les autres (client qui a le module), seuls les types de LabFlow Compta —
// aucun encore : ils seront choisis avec le client, le module fini. Sans paramètre, la cloche de LabFlow est inchangée.
const TYPES_COMPTA = [];

// Filtre SQL à ajouter (son paramètre est TOUJOURS $2), ou null.
const filtreProduit = (req) => {
  if (req.query?.produit !== 'compta' || req.user?.role === 'comptable') return null;
  return { sql: ' AND event_type = ANY($2::text[])', valeur: TYPES_COMPTA };
};

module.exports = { TYPES_COMPTA, filtreProduit };
