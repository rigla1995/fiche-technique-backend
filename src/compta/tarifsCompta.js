// LabFlow Compta — postes de la mensualité (labflow-reprise/achats-compta/SPEC-SOCLE.md, D6-D8). Module PUR (ni base,
// ni email, ni PDF), employé par le moteur de prix (src/services/pricingEngine.js).
//
// Deux formes (D6) :
//   - cabinet comptable (abonnement `produit = 'compta'`) : abonnement du cabinet (titulaire compris) + gérants achetés ;
//   - client Stock / Vente qui a le module (`module_compta_actif`, étape S2c) : module (son comptable compris) + gérants
//     comptables supplémentaires, en plus de sa mensualité LabFlow.
// Les 5 tarifs sont des clés de la grille générale (tarifs_config, migration 202), jamais surchargées par domaine.
// Libellés en vocabulaire comptable fixe : ils sont figés sur la mensualité (paiements.lignes) et imprimés sur la facture.

const CLES_TARIFS_COMPTA = Object.freeze([
  'compta_cabinet_mensuel',
  'compta_gerant_cabinet_mensuel',
  'compta_mise_en_route',
  'compta_module_mensuel',
  'compta_gerant_client_mensuel',
]);

const LIBELLE_CABINET = 'LabFlow Compta — abonnement mensuel';
const LIBELLE_MODULE = 'Module Comptabilité';
const LIBELLE_ABONNEMENT_LABFLOW = 'Abonnement LabFlow';
const LIBELLE_REMISE = 'Remise (promotion)';
// Prix fixe convenu au-dessus du total des postes : l'écart n'est pas une remise.
const LIBELLE_AJUSTEMENT = 'Ajustement (prix convenu)';

const arrondi = (n) => Math.round(n * 100) / 100;
const tarif = (tarifs, cle) => {
  const v = parseFloat(tarifs?.[cle]);
  return Number.isFinite(v) && v > 0 ? v : 0;
};
const entier = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const valeur = (config, snake, camel) => config?.[snake] ?? config?.[camel];

// La configuration est-elle celle d'un cabinet ? (produit de son abonnement, joint à la lecture de la config)
const estCabinet = (config) => valeur(config, 'produit', 'produit') === 'compta';
const moduleActif = (config) => valeur(config, 'module_compta_actif', 'moduleComptaActif') === true;

const libelleGerants = (nb) => `Gérant${nb > 1 ? 's' : ''} supplémentaire${nb > 1 ? 's' : ''} × ${nb}`;

/**
 * Postes LabFlow Compta d'une configuration : [{ code, libelle, montant }] (montants en DT, 2 décimales), vide pour un
 * compte LabFlow sans le module.
 */
const postesCompta = (config, tarifs) => {
  if (!config) return [];
  const nbGerants = entier(valeur(config, 'nb_gerants_compta', 'nbGerantsCompta'));
  if (estCabinet(config)) {
    const postes = [{ code: 'compta_cabinet', libelle: LIBELLE_CABINET, montant: arrondi(tarif(tarifs, 'compta_cabinet_mensuel')) }];
    if (nbGerants > 0) {
      postes.push({ code: 'compta_gerants_cabinet', libelle: libelleGerants(nbGerants), montant: arrondi(nbGerants * tarif(tarifs, 'compta_gerant_cabinet_mensuel')) });
    }
    return postes;
  }
  if (!moduleActif(config)) return [];
  const postes = [{ code: 'compta_module', libelle: LIBELLE_MODULE, montant: arrondi(tarif(tarifs, 'compta_module_mensuel')) }];
  if (nbGerants > 0) {
    postes.push({ code: 'compta_gerants_client', libelle: libelleGerants(nbGerants), montant: arrondi(nbGerants * tarif(tarifs, 'compta_gerant_client_mensuel')) });
  }
  return postes;
};

const totalPostes = (postes) => arrondi(postes.reduce((s, p) => s + p.montant, 0));

module.exports = {
  CLES_TARIFS_COMPTA, LIBELLE_CABINET, LIBELLE_MODULE, LIBELLE_ABONNEMENT_LABFLOW, LIBELLE_REMISE, LIBELLE_AJUSTEMENT,
  estCabinet, moduleActif, postesCompta, totalPostes, tarif,
};
