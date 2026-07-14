// Facture fiscale du module Acheteurs : l'ÉMETTEUR est le compte client LabFlow
// (profil_entreprise), le destinataire est l'acheteur B2B. Prix saisis HT,
// remise appliquée sur le HT, TVA calculée par ligne, timbre fiscal optionnel.
//
// Le rendu est délégué au module de charte (docuseal-templates/generate.js,
// buildFactureAcheteur) : même identité visuelle que la facture de mensualité
// (logo, dégradé, blocs parties, pied de page). Sortie DÉTERMINISTE
// (CreationDate = date de facture, jamais l'horloge) → un re-téléchargement
// est identique au byte près, y compris après suppression de l'acheteur
// (les lectures passent alors par le snapshot figé de la facture).
const { buildFactureAcheteur } = require('../../docuseal-templates/generate');

// f = ligne SQL (factures_acheteur + jointures vendeur/acheteur snapshot-aware),
// lignes = commande_acheteur_lignes. Signature et données inchangées — seul le
// moteur de rendu a changé.
const buildFactureAcheteurPdf = (f, lignes) => {
  const remisePct = Number(f.remise_pct || 0);
  return buildFactureAcheteur(null, {
    numero: f.numero,
    dateFacture: f.date_facture,
    vendeur: {
      nom: f.vendeur_nom || 'Vendeur',
      adresse: f.vendeur_adresse || null,
      tel: f.vendeur_tel || null,
      email: f.vendeur_email || null,
    },
    acheteur: {
      nom: f.acheteur_nom || null,
      entreprise: f.acheteur_entreprise || null,
      adresse: f.acheteur_adresse || null,
      mf: f.acheteur_mf || null,
      tel: f.acheteur_tel || null,
      email: f.acheteur_email || null,
    },
    lignes: (lignes || []).map((l) => ({
      designation: l.designation,
      quantite: l.quantite,
      prixHt: l.prix_ht,
      tauxTva: l.taux_tva,
    })),
    remisePct,
    montantHt: f.montant_ht,
    montantTva: f.montant_tva,
    timbreFiscal: !!f.timbre_fiscal,
    montantTimbre: f.montant_timbre,
    montantTtc: f.montant_ttc,
    notes: f.notes || null,
  });
};

module.exports = { buildFactureAcheteurPdf };
