// Identité légale du client (lot 3, spec docs/lot-3-spec.md §1) : lecture d'une saisie, nom affiché,
// identité complète. Une seule définition, partagée par l'admin (étape 1), la création (étape 2), le profil
// client (étape 3) et les factures (étape 5).

const { controlerMatriculeFiscal } = require('./matriculeFiscal');

const FORMES_JURIDIQUES = ['SARL', 'SUARL', 'SA', 'SNC', 'EI', 'AUTO_ENTREPRENEUR', 'ASSOCIATION', 'AUTRE'];

// Champ de l'API (camelCase) → colonne de profil_entreprise, longueur maximale (= taille de la colonne, migration 197 ;
// adresse : TEXT, bornée ici pour rester imprimable).
const CHAMPS_IDENTITE = [
  { champ: 'raisonSociale',       colonne: 'raison_sociale',       max: 255, libelle: 'Raison sociale' },
  { champ: 'nomCommercial',       colonne: 'nom_commercial',       max: 255, libelle: 'Nom commercial' },
  { champ: 'formeJuridique',      colonne: 'forme_juridique',      max: 30,  libelle: 'Forme juridique' },
  { champ: 'matriculeFiscal',     colonne: 'matricule_fiscal',     max: 50,  libelle: 'Matricule fiscal' },
  { champ: 'rne',                 colonne: 'rne',                  max: 50,  libelle: 'RNE' },
  { champ: 'adresse',             colonne: 'adresse',              max: 300, libelle: 'Adresse' },
  { champ: 'ville',               colonne: 'ville',                max: 120, libelle: 'Ville' },
  { champ: 'representantNom',     colonne: 'representant_nom',     max: 150, libelle: 'Représentant' },
  { champ: 'representantQualite', colonne: 'representant_qualite', max: 80,  libelle: 'Qualité du représentant' },
];

// Caractères que les polices standard des PDF (pdfkit, Windows-1252) savent écrire : même table que HORS_POLICE de
// docuseal-templates/generate.js, sans tabulation ni retour à la ligne (réduits en espace par `texte`), sans le
// drapeau g (un .test() sur une regex /g garde un état) ; test/identite.test.js vérifie que les deux tables concordent. Une identité est imprimée telle quelle sur les contrats et les factures (jamais
// passée par pdfTexte) : un caractère hors de cette table sortirait illisible, il est donc refusé à la saisie.
const HORS_W1252 = /[^\x20-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/u;

// Nettoyage AVANT le contrôle des caractères : un texte latin copié d'un PDF ou d'un Mac ne doit pas être refusé.
// Accents décomposés recomposés (NFC), ligatures typographiques défaites, caractères invisibles retirés, tirets et
// moins Unicode ramenés au trait d'union, espaces (insécables comprises) réduits à une seule.
const LIGATURES = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'st', 'ﬆ': 'st' };
const texte = (v) => (v == null ? '' : String(v)
  .normalize('NFC')
  .replace(/[ﬀ-ﬆ]/g, (c) => LIGATURES[c])
  .replace(/[­​-‍⁠﻿]/g, '')
  .replace(/[‐-‒−]/g, '-')
  .replace(/\s+/g, ' ')
  .trim());

// Lit les champs d'identité PRÉSENTS dans le corps (un champ absent n'est pas touché ; chaîne vide = NULL).
// → { valeurs: { colonne: valeur|null }, erreurs: [{ champ, message }], avertissements: [string] }
const lireIdentite = (body = {}) => {
  const valeurs = {};
  const erreurs = [];
  const avertissements = [];
  for (const { champ, colonne, max, libelle } of CHAMPS_IDENTITE) {
    if (!Object.prototype.hasOwnProperty.call(body, champ)) continue;
    let v = texte(body[champ]);
    if (champ === 'matriculeFiscal') {
      const mf = controlerMatriculeFiscal(v);
      if (!mf.ok) { erreurs.push({ champ, message: mf.erreur }); continue; }
      if (mf.avertissement) avertissements.push(mf.avertissement);
      v = mf.valeur;
    }
    if (champ === 'formeJuridique') v = v.toUpperCase();
    if (!v) { valeurs[colonne] = null; continue; }
    if (v.length > max) { erreurs.push({ champ, message: `${libelle} : ${max} caractères au maximum` }); continue; }
    if (HORS_W1252.test(v)) {
      erreurs.push({ champ, message: `${libelle} : caractères latins seulement (les lettres arabes et les émojis ne s'impriment pas sur les contrats et les factures)` });
      continue;
    }
    if (champ === 'formeJuridique' && !FORMES_JURIDIQUES.includes(v)) {
      erreurs.push({ champ, message: 'Forme juridique inconnue' });
      continue;
    }
    valeurs[colonne] = v;
  }
  return { valeurs, erreurs, avertissements };
};

const vide = (v) => v == null || String(v).trim() === '';

// Nom affiché = nom commercial, sinon raison sociale, sinon nom du contact.
// `row` : colonnes de profil_entreprise + `contact` (utilisateurs.nom), repli sur pe.nom.
const nomAffiche = (row = {}) => {
  for (const v of [row.nom_commercial, row.raison_sociale, row.contact, row.nom]) {
    if (!vide(v)) return String(v).trim();
  }
  return '';
};

// Identité complète = raison sociale + matricule fiscal + adresse + ville (mentions obligatoires d'une facture :
// nom, adresse complète, matricule fiscal ; `adresse` ne porte que la rue).
const identiteComplete = (row = {}) => !vide(row.raison_sociale) && !vide(row.matricule_fiscal) && !vide(row.adresse) && !vide(row.ville);

// Colonnes de profil_entreprise → objet de l'API (camelCase), null si absent.
const mapIdentite = (row = {}) => Object.fromEntries(CHAMPS_IDENTITE.map(({ champ, colonne }) => [champ, row[colonne] ?? null]));

module.exports = { FORMES_JURIDIQUES, CHAMPS_IDENTITE, HORS_W1252, lireIdentite, nomAffiche, identiteComplete, mapIdentite };
