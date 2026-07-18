// Facture d'APPROVISIONNEMENT (pages « Factures » activités et labo) :
// l'ÉMETTEUR est le FOURNISSEUR, le destinataire est l'entreprise du client.
// Récapitulatif des lignes de stock rattachées à la facture (facture_id).
//
// Le rendu est délégué au module de charte (docuseal-templates/generate.js,
// buildFactureAppro) : même identité visuelle que les factures acheteurs
// (logo, dégradé, blocs parties, bandes de totaux, pied de page). Sortie
// DÉTERMINISTE (CreationDate = date de facture) → un re-téléchargement est
// identique au byte près.
const { buildFactureAppro } = require('../../docuseal-templates/generate');

// f = ligne SQL (factures + jointures fournisseur/profil_entreprise/contexte),
// lignes = lignes de stock (stock_entreprise_daily ou stock_labo_daily).
const buildFactureApproPdf = (f, lignes) => buildFactureAppro(null, {
  refFacture: f.ref_facture,
  dateFacture: f.date_facture,
  contexte: f.activite_nom ? `Activité : ${f.activite_nom}` : (f.labo_nom ? `Labo : ${f.labo_nom}` : ''),
  typeSource: f.type_source,
  fournisseur: {
    nom: f.fournisseur_nom || 'Fournisseur',
    adresse: f.fournisseur_adresse || null,
    tel: f.fournisseur_tel || null,
  },
  entreprise: {
    nom: f.entreprise_nom || 'Entreprise',
    adresse: f.entreprise_adresse || null,
    tel: f.entreprise_tel || null,
    email: f.entreprise_email || null,
  },
  lignes: (lignes || []).map((l) => ({
    designation: l.ingredient_nom,
    unite: l.unite_nom,
    quantite: l.quantite,
    prixHt: l.prix_unitaire,
    tauxTva: l.taux_tva,
  })),
  montantHt: f.montant_ht,
  montantTva: f.montant_tva,
  montantTtc: f.montant_ttc,
  notes: f.notes || null,
});

module.exports = { buildFactureApproPdf };
