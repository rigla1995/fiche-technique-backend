// Recette propre à un canal (étape C2 — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.3) : règles PURES.
// Une variante est un produit complet, lié à son produit d'origine (produits.variante_de_id) et distingué par un
// libellé (produits.variante_libelle, « Livraison »). Tests : test/variantesProduit.test.js.
const { lireCanal } = require('./canauxVente');

const LIBELLE_MAX = 40; // produits.variante_libelle
const NOM_MAX = 100; // produits.nom
const SEPARATEUR = ' — ';
const CANAUX_MAX = 50;

class ErreurVariante extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ErreurVariante';
    this.status = status;
    this.code = code;
  }
}

/** Libellé de la variante : texte court, espaces ramenés à un seul. */
function lireLibelle(v) {
  const libelle = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  if (!libelle) throw new ErreurVariante(400, 'LIBELLE_REQUIS', 'Donnez un nom à cette variante (par exemple « Livraison »).');
  if (libelle.length > LIBELLE_MAX) throw new ErreurVariante(400, 'LIBELLE_TROP_LONG', `Nom de variante trop long (${LIBELLE_MAX} caractères au plus).`);
  return libelle;
}

/** Nom d'une variante : « Produit — Libellé », le nom du produit raccourci s'il le faut pour tenir dans la colonne. */
function nomVariante(nomParent, libelle) {
  const parent = String(nomParent ?? '').trim();
  const suite = SEPARATEUR + libelle;
  if (parent.length + suite.length <= NOM_MAX) return parent + suite;
  return `${parent.slice(0, Math.max(1, NOM_MAX - suite.length - 1)).trimEnd()}…${suite}`;
}

/** Demande de création : l'activité, le libellé et les canaux où la variante remplace le produit. */
function lireDemande(body = {}) {
  const activiteId = Number(body.activite_id);
  if (!Number.isInteger(activiteId) || activiteId <= 0) throw new ErreurVariante(400, 'ACTIVITE_REQUISE', 'activite_id requis.');
  const libelle = lireLibelle(body.libelle);
  if (!Array.isArray(body.canaux) || body.canaux.length === 0) {
    throw new ErreurVariante(400, 'CANAUX_REQUIS', 'Choisissez au moins un canal pour cette variante.');
  }
  if (body.canaux.length > CANAUX_MAX) throw new ErreurVariante(400, 'CANAUX_REQUIS', 'Trop de canaux.');
  const vus = new Set();
  const canaux = [];
  for (const brut of body.canaux) {
    const canal = lireCanal(brut); // lève ErreurCanal (400 CANAL_INVALIDE) : même forme { status, code, message }
    const cle = canal.directe ? 'directe' : canal.lienId;
    if (vus.has(cle)) continue;
    vus.add(cle);
    canaux.push(canal);
  }
  return { activiteId, libelle, canaux };
}

/** Un produit peut-il recevoir une variante ? Rend null, ou le refus { status, code, message }. */
function refusParent(parent) {
  if (parent.variante_de_id != null) {
    return { status: 400, code: 'VARIANTE_DE_VARIANTE', message: '[[Ce:produit]] est déjà une variante : créez la nouvelle variante depuis [[le:produit]] d\'origine.' };
  }
  if ((parent.type || 'vendable') !== 'vendable' || (parent.origine || 'activite') !== 'activite') {
    return { status: 400, code: 'VARIANTE_IMPOSSIBLE', message: 'Seul [[un:produit_vendable]] ou [[un:supplement]] peut avoir [[un:recette]] propre à un canal.' };
  }
  return null;
}

module.exports = { LIBELLE_MAX, NOM_MAX, SEPARATEUR, ErreurVariante, lireLibelle, nomVariante, lireDemande, refusParent };
