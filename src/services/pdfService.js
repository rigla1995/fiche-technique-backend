// Facture mensuelle d'abonnement (générée à la validation d'un paiement).
// Prestataire & identifiants fiscaux configurables par env (valeurs d'exemple par défaut).
// Facture pro — déléguée au module de charte (docuseal-templates/generate.js,
// buildFacture) : logo, dégradé, blocs parties, pied légal env-driven. Sortie
// DÉTERMINISTE conservée (CreationDate = date de facture, jamais l'horloge) →
// copie email == copie re-téléchargée.
const generateFacturePdf = async (params) => {
  // require inline : évite de charger pdfkit/le module de charte deux fois au boot
  const { buildFacture } = require('../../docuseal-templates/generate');
  const buffer = await buildFacture(null, params);
  return buffer.toString('base64');
};

module.exports = { generateFacturePdf };
