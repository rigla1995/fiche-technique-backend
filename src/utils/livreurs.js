// Module « Livreurs », étape L1 (labflow-reprise/livreurs/PLAN-LIVREURS.md) : règles pures, sans base.
//
//   normaliserTelephone('+216 22 345 678') → '22345678' ; invalide → null.
//     Numéro tunisien : 8 chiffres, premier chiffre 2, 4, 5, 7 ou 9, indicatif +216 / 00216 / 216 toléré.
//   emailTechnique('22345678') → 'livreur-22345678@livreurs.labflow.local'
//     Un livreur sans adresse e-mail garde une ligne `utilisateurs` valide (email NOT NULL UNIQUE) : cette adresse
//     technique n'est jamais affichée ni écrite à personne (estEmailTechnique la reconnaît).
//   motDePasseInitial() → mot de passe robuste (isStrongPassword de authController : ≥ 8, majuscule, minuscule,
//     chiffre, caractère spécial), lisible et dictable au téléphone : pas de 0/O ni de 1/l/I.
const crypto = require('crypto');

const DOMAINE_TECHNIQUE = 'livreurs.labflow.local';

const normaliserTelephone = (brut) => {
  if (brut == null) return null;
  let s = String(brut).replace(/[\s.\-()]/g, '');
  if (s.startsWith('+216')) s = s.slice(4);
  else if (s.startsWith('00216')) s = s.slice(5);
  else if (s.startsWith('216') && s.length === 11) s = s.slice(3);
  return /^[24579]\d{7}$/.test(s) ? s : null;
};

// Forme affichée : « 22 345 678 ».
const telephoneAffiche = (norm) => (norm && norm.length === 8 ? `${norm.slice(0, 2)} ${norm.slice(2, 5)} ${norm.slice(5)}` : norm || '');

const emailTechnique = (telephoneNorm) => `livreur-${telephoneNorm}@${DOMAINE_TECHNIQUE}`;
const estEmailTechnique = (email) => typeof email === 'string' && email.toLowerCase().endsWith(`@${DOMAINE_TECHNIQUE}`);

const MAJ = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MIN = 'abcdefghijkmnpqrstuvwxyz';
const CHIFFRES = '23456789';
const SPECIAUX = '!#$%&*?@';
const tirer = (alphabet, n) => {
  let s = '';
  const octets = crypto.randomBytes(n);
  for (let i = 0; i < n; i++) s += alphabet[octets[i] % alphabet.length];
  return s;
};
const motDePasseInitial = () => `${tirer(MAJ, 2)}${tirer(MIN, 4)}-${tirer(CHIFFRES, 4)}${tirer(SPECIAUX, 1)}`;

module.exports = { normaliserTelephone, telephoneAffiche, emailTechnique, estEmailTechnique, motDePasseInitial, DOMAINE_TECHNIQUE };
