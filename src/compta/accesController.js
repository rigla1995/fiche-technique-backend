// LabFlow Compta — comptabilités accessibles à la personne connectée (SPEC-SOCLE D11bis, CADRAGE §2).
// Trois groupes, toujours distincts à l'écran :
//   cabinets       — cabinets dont la personne est titulaire ou gérant ;
//   maComptabilite — comptabilité de la personne en tant que client LabFlow qui a le module ;
//   confiees       — comptabilités que des clients LabFlow lui ont confiées (accès de gérant comptable).
// Étape S1 : aucune comptabilité n'existe encore (les espaces et les accès arrivent à l'étape S2) ; la réponse a déjà
// sa forme définitive, pour que l'accueil de LabFlow Compta n'ait pas à changer.
const listerAcces = (_req, res) => res.json({ cabinets: [], maComptabilite: [], confiees: [] });

module.exports = { listerAcces };
