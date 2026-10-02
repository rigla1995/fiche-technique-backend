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
const { vocabDefaut } = require('../utils/vocab');

// Libellés de la facture dans le vocabulaire du compte (lot 2b, spec §8.3), passés à buildFactureAppro
// (data.libelles) ; generate.js garde les textes d'avant le lot comme valeurs par défaut. Par défaut, mêmes
// textes, sauf le sous-titre d'un transfert labo→labo (facture portée par le labo destinataire,
// activite_id NULL), qui disait « Transfert labo → activité » (spec §11.1.1).
const libellesFactureAppro = (f, voc = vocabDefaut) => ({
  sujet: `Facture ${voc.de('appro')}`,
  surtitre: `FACTURE ${/^d'/.test(voc.de('appro')) ? "D'" : 'DE '}${voc.MAJ('appro')}`,
  titre: `Facture ${voc.de('appro')}`,
  sousTitreTransfert: `${voc.Nom('transfert')} ${voc.court('labo')} → ${f.activite_id != null ? voc.court('activite') : voc.court('labo')}`,
  approFournisseur: `${voc.Nom('appro')} ${voc.nom('fournisseur')}`,
  fournisseur: voc.nom('fournisseur'),
  partiesTitre: `${voc.MAJ('fournisseur')} ET CLIENT`,
  partiesEmetteur: voc.MAJ('fournisseur'),
  mentions: `Montants exprimés en dinars tunisiens (DT), prix saisis hors taxes. Récapitulatif ${voc.de('appro')} généré électroniquement via la plateforme LabFlow à partir des lignes ${voc.de('stock')} saisies — il ne remplace pas la facture originale ${voc.du('fournisseur')}.`,
  notePied: `Facture ${voc.de('appro')} — générée via la plateforme LabFlow`,
});

// f = ligne SQL (factures + jointures fournisseur/profil_entreprise/contexte),
// lignes = lignes de stock (stock_entreprise_daily ou stock_labo_daily),
// voc = vocabulaire du compte (req.voc de facturesController.downloadPdf).
const buildFactureApproPdf = (f, lignes, voc = vocabDefaut) => buildFactureAppro(null, {
  refFacture: f.ref_facture,
  dateFacture: f.date_facture,
  contexte: f.activite_nom ? `${voc.Court('activite')} : ${f.activite_nom}` : (f.labo_nom ? `${voc.Court('labo')} : ${f.labo_nom}` : ''),
  typeSource: f.type_source,
  libelles: libellesFactureAppro(f, voc),
  fournisseur: {
    nom: f.fournisseur_nom || voc.Nom('fournisseur'),
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

module.exports = { buildFactureApproPdf, libellesFactureAppro };
