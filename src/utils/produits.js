// Les deux produits servis par le même serveur (chantier LabFlow Compta, labflow-reprise/achats-compta/SPEC-SOCLE.md,
// D11, D13, D15) : LabFlow (app.labflow-tn.com) et LabFlow Compta (compta.labflow-tn.com). Liste FERMÉE : une valeur
// reçue d'une requête n'est jamais utilisée sans passer par elle.
const PRODUITS = Object.freeze(['labflow', 'compta']);
const PRODUIT_DEFAUT = 'labflow';

const estProduit = (valeur) => PRODUITS.includes(valeur);

module.exports = { PRODUITS, PRODUIT_DEFAUT, estProduit };
