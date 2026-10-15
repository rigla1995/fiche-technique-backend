// D2 (15/10/2026) : acheteurs professionnels (B2B) et particuliers (B2C) — labflow-reprise/PLAN-DOMAINES-ACHETEURS-CODES.md
// §2 ligne D2, réponses du client du 15/10. Le type se choisit à l'ajout de la fiche (obligatoire) et se change ensuite ;
// les fiches d'avant la migration 246 sont « b2b » si elles ont un matricule fiscal, sinon « a_preciser » (bandeau dans
// le carnet). Un professionnel a une raison sociale (colonne entreprise), un matricule fiscal et une adresse ; un
// particulier a un nom et un téléphone : la facture de vente en dépend (B2B sans matricule : refusée ; « à préciser » :
// refusée tant que le type n'est pas choisi). Module PUR ; messages balisés, rendus par l'écran avec le vocabulaire du
// compte.
const TYPES = Object.freeze(['b2b', 'b2c', 'a_preciser']);
const LIBELLES = Object.freeze({ b2b: 'professionnel (B2B)', b2c: 'particulier (B2C)', a_preciser: 'à préciser' });

// Saisie (fiche, cellule d'import) → 'b2b' | 'b2c' ; null si vide ; undefined si inconnue.
const SAISIES = Object.freeze({
  b2b: 'b2b', professionnel: 'b2b', professionnelle: 'b2b', pro: 'b2b', entreprise: 'b2b', societe: 'b2b', 'société': 'b2b',
  b2c: 'b2c', particulier: 'b2c', particuliere: 'b2c', 'particulière': 'b2c', personne: 'b2c',
});
const typeDe = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  return Object.prototype.hasOwnProperty.call(SAISIES, s) ? SAISIES[s] : undefined;
};

const vide = (v) => v == null || String(v).trim() === '';

// Champs obligatoires du type qui manquent à la fiche (libellés pour le message) ; [] si rien ne manque ou type « à préciser ».
const champsManquants = (type, f = {}) => {
  if (type === 'b2b') {
    return [[f.entreprise, 'la raison sociale'], [f.matriculeFiscal, 'le matricule fiscal'], [f.adresse, 'l\'adresse']]
      .filter(([v]) => vide(v)).map(([, libelle]) => libelle);
  }
  if (type === 'b2c') return vide(f.telephone) ? ['le téléphone'] : [];
  return [];
};

const MESSAGE_TYPE_REQUIS = 'précisez si [[le:acheteur]] est un professionnel (B2B) ou un particulier (B2C)';
const messageTypeInconnu = (saisie) => `type « ${String(saisie ?? '').trim()} » inconnu : professionnel (B2B) ou particulier (B2C)`;
const messageManquants = (type, manquants) => (type === 'b2b'
  ? `pour un professionnel (B2B), la raison sociale, le matricule fiscal et l'adresse sont obligatoires (manque : ${manquants.join(', ')})`
  : 'pour un particulier (B2C), le téléphone est obligatoire');
// Première lettre en majuscule (message hors « Ligne n : … »).
const Maj = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Refus d'émettre une facture de vente à cette fiche (vente directe, expédition d'une commande du portail) :
// { code, message } ou null. `a` = ligne d'acheteurs (type, matricule_fiscal) ; une fiche supprimée (null) ne refuse rien.
const refusFacture = (a) => {
  if (!a) return null;
  if (a.type === 'a_preciser') {
    return { code: 'ACHETEUR_TYPE_A_PRECISER', message: 'Précisez d\'abord, dans le carnet, si [[ce:acheteur]] est un professionnel (B2B) ou un particulier (B2C) : la facture en dépend.' };
  }
  if (a.type === 'b2b' && vide(a.matricule_fiscal)) {
    return { code: 'ACHETEUR_MATRICULE_REQUIS', message: 'Facture à un professionnel (B2B) sans matricule fiscal : complétez la fiche de [[ce:acheteur]] dans le carnet.' };
  }
  return null;
};

// Identifiant RNE saisi : majuscules, sans espace, borné à la colonne (50) ; vide → null.
const rneDe = (v) => {
  const s = String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return s ? s.slice(0, 50) : null;
};

module.exports = { TYPES, LIBELLES, typeDe, champsManquants, MESSAGE_TYPE_REQUIS, messageTypeInconnu, messageManquants, Maj, refusFacture, rneDe };
