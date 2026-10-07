// LabFlow Compta — D10 (SPEC-SOCLE) : rien de comptable ne disparaît. Un titulaire (cabinet ou client LabFlow) dont une
// comptabilité contient un dossier ne se supprime pas ; l'admin archive son compte à la place (étape S4a). La contrainte
// RESTRICT de compta.dossiers → compta.espaces le garantit aussi ; ce module dit pourquoi, avant d'essayer. Textes rangés
// sous src/compta : vocabulaire comptable fixe, hors du moteur de vocabulaire des comptes Stock / Vente (les contrôleurs
// de LabFlow n'écrivent aucun texte : ils appellent une fonction par cas).
const CODE_DOSSIERS_EN_PLACE = 'DOSSIERS_EN_PLACE';

// Dossiers (archivés compris) des comptabilités dont la personne est titulaire.
const nbDossiersDuTitulaire = async (db, titulaireId) =>
  (await db.query(
    'SELECT COUNT(*)::int AS n FROM compta.dossiers d JOIN compta.espaces e ON e.id = d.espace_id WHERE e.titulaire_id = $1',
    [titulaireId]
  )).rows[0].n;

// `n` inconnu (course : dossier créé pendant la suppression, contrainte RESTRICT levée) : « des dossiers ».
const pluriel = (n) => (n == null ? 'des dossiers' : `${n} dossier${n > 1 ? 's' : ''}`);
// Corps de la réponse 409 : un cabinet (page Comptables) ; un client LabFlow (page Clients).
const refusCabinetAvecDossiers = (n) => ({
  message: `Ce cabinet a ${pluriel(n)} : il ne peut pas être supprimé (rien de comptable ne disparaît). Archivez-le plutôt (page Abonnements, mode du compte).`,
  code: CODE_DOSSIERS_EN_PLACE,
});
const refusClientAvecDossiers = (n) => ({
  message: `Ce client a ${pluriel(n)} dans LabFlow Compta : il ne peut pas être supprimé (rien de comptable ne disparaît). Archivez son compte plutôt (mode du compte).`,
  code: CODE_DOSSIERS_EN_PLACE,
});

// Course : un dossier créé pendant la suppression retient la comptabilité (contrainte RESTRICT de compta.dossiers →
// compta.espaces, erreur 23503 de PostgreSQL : schéma « compta », table « dossiers », contrainte
// « dossiers_espace_id_fkey ») — même refus que le contrôle d'avant.
const estRetenuParDossiers = (err) => err?.code === '23503'
  && (err.schema === 'compta' || /^dossiers(?:_|$)/.test(String(err.table || err.constraint || '')));

module.exports = { CODE_DOSSIERS_EN_PLACE, nbDossiersDuTitulaire, refusCabinetAvecDossiers, refusClientAvecDossiers, estRetenuParDossiers };
