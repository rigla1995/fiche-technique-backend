// Assainisseurs de noms des exports Excel (lot 2b, spec docs/lot-2b-spec.md §5.5).
//
// ongletSur(wb, texte) : nom d'onglet sûr et UNIQUE dans le classeur. nomOnglet (moteur de vocabulaire,
//   module généré src/utils/vocab.js) remplace par une espace les caractères qu'Excel refuse (* ? : \ / [ ]),
//   resserre les blancs, coupe à 31 caractères et retire les apostrophes de bord ; si le nom existe déjà dans
//   le classeur (sans tenir compte de la casse, comme ExcelJS qui LÈVE sinon), on ajoute un suffixe « 2 »,
//   « 3 »… tenu dans les 31 caractères.
//
// nomFichierSur(nom) : un nom saisi interpolé dans un en-tête Content-Disposition. Remplace par « - » les
//   SEULS caractères que Node refuse dans un en-tête (hors \t, \x20-\x7E et \x80-\xFF ; sinon
//   ERR_INVALID_CHAR, donc une erreur 500), et le guillemet « " » qui fermerait filename="…". Tout autre
//   caractère reste tel quel : « Labo Central », « Café & Co », « Resto N°1 » ressortent à l'identique,
//   « Dar Yasmine — Salon » donne « Dar Yasmine - Salon ». Ce n'est PAS la règle de
//   facturesController.js (référence de facture), qui reste inchangée (I2). Un caractère hors du plan de
//   base (emoji) compte pour UN caractère : un seul « - ».
const { nomOnglet } = require('./vocab');

const LONGUEUR_MAX_ONGLET = 31;

/** Coupe à `max` unités sans laisser une moitié de paire de substitution (emoji) en fin de chaîne. */
function couper(texte, max) {
  let coupe = texte.slice(0, max);
  if (coupe.length === max && /[\uD800-\uDBFF]$/.test(coupe)) coupe = coupe.slice(0, -1);
  return coupe;
}

/** Nom d'onglet sûr (nomOnglet) et absent du classeur `wb`, sans tenir compte de la casse. */
function ongletSur(wb, texte) {
  const base = nomOnglet(texte);
  const pris = new Set(((wb && wb.worksheets) || []).map((ws) => String(ws.name).toLowerCase()));
  if (!pris.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const suffixe = ` ${n}`;
    const nom = `${couper(base, LONGUEUR_MAX_ONGLET - suffixe.length).trimEnd()}${suffixe}`;
    if (!pris.has(nom.toLowerCase())) return nom;
  }
}

const INTERDITS_EN_TETE = /[^\t\x20-\x7E\x80-\xFF]|"/gu;

/** Nom saisi sûr dans un en-tête HTTP (Content-Disposition) : seuls les caractères refusés par Node et « " » deviennent « - ». */
function nomFichierSur(nom) {
  return String(nom).replace(INTERDITS_EN_TETE, '-');
}

module.exports = { ongletSur, nomFichierSur };
