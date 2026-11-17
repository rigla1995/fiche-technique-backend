// Canaux de vente (étape C1 — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.2) : règles PURES, sans base.
// Un canal = la vente directe ('directe') ou un prestataire activé sur l'activité (l'identifiant du lien
// activite_prestataires). Un produit est « en vente » sur un canal quand sa case est cochée ET qu'il y a un prix > 0.
// Tests : test/canauxVente.test.js.

const CANAL_DIRECT = 'directe';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIX_MAX = 99999999.99; // NUMERIC(10,2)
const CELLULES_MAX = 2000;

/** Pas d'arrondi proposés à la copie d'un canal (en dinars) : au centième, à 100 millimes, à 500 millimes, au dinar. */
const PAS_ARRONDI = Object.freeze([0.01, 0.1, 0.5, 1]);
const MAJORATION_MIN = -90;
const MAJORATION_MAX = 500;

class ErreurCanal extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ErreurCanal';
    this.status = status;
    this.code = code;
  }
}

const centimes = (v) => Math.round(v * 100 + 1e-7) / 100;

/** Prix d'une cellule : nombre ≥ 0 ramené à deux décimales ; null ou '' = prix effacé. */
function lirePrix(v) {
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  if (typeof v === 'boolean' || !Number.isFinite(n) || n < 0 || n > PRIX_MAX) {
    throw new ErreurCanal(400, 'PRIX_INVALIDE', 'Prix invalide : un nombre positif est attendu.');
  }
  return centimes(n);
}

/** Canal reçu de l'écran : 'directe' ou l'identifiant d'un lien activité–prestataire. */
function lireCanal(v) {
  if (v === CANAL_DIRECT) return { directe: true, lienId: null };
  if (typeof v === 'string' && UUID_RE.test(v)) return { directe: false, lienId: v.toLowerCase() };
  throw new ErreurCanal(400, 'CANAL_INVALIDE', 'Canal de [[nom:vente]] inconnu.');
}

/** Une cellule de la grille : un produit (ou un article valorisé), un canal, et ce qui change (prix, case). */
function lireCellule(c) {
  if (!c || typeof c !== 'object') throw new ErreurCanal(400, 'CELLULE_INVALIDE', 'Cellule invalide.');
  const articleType = c.article_type;
  if (articleType !== 'produit' && articleType !== 'ingredient') {
    throw new ErreurCanal(400, 'CELLULE_INVALIDE', "article_type doit être 'produit' ou 'ingredient'.");
  }
  const articleId = Number(c.article_id);
  if (!Number.isInteger(articleId) || articleId <= 0) throw new ErreurCanal(400, 'CELLULE_INVALIDE', 'article_id invalide.');
  const cellule = { articleType, articleId, canal: lireCanal(c.canal), prix: undefined, enVente: undefined };
  if (c.prix !== undefined) cellule.prix = lirePrix(c.prix);
  if (c.en_vente !== undefined) {
    if (typeof c.en_vente !== 'boolean') throw new ErreurCanal(400, 'CELLULE_INVALIDE', 'en_vente doit être vrai ou faux.');
    cellule.enVente = c.en_vente;
  }
  if (cellule.prix === undefined && cellule.enVente === undefined) {
    throw new ErreurCanal(400, 'CELLULE_INVALIDE', 'Rien à modifier dans cette cellule.');
  }
  return cellule;
}

function lireCellules(liste) {
  if (!Array.isArray(liste) || liste.length === 0) throw new ErreurCanal(400, 'CELLULES_REQUISES', 'Aucune cellule à enregistrer.');
  if (liste.length > CELLULES_MAX) throw new ErreurCanal(400, 'CELLULES_TROP', `Trop de cellules en une fois (${CELLULES_MAX} au plus).`);
  return liste.map(lireCellule);
}

/**
 * État d'une cellule après une modification. `avant` = { prix, enVente } tels qu'enregistrés (prix null = aucun).
 * Règles : une case ne se coche qu'avec un prix > 0 ; effacer ou mettre à zéro le prix d'une case cochée la décoche.
 */
function appliquer(avant, cellule) {
  const prix = cellule.prix !== undefined ? cellule.prix : (avant.prix ?? null);
  let enVente = cellule.enVente !== undefined ? cellule.enVente : Boolean(avant.enVente);
  const avecPrix = prix != null && prix > 0;
  if (cellule.enVente === true && !avecPrix) {
    throw new ErreurCanal(400, 'PRIX_REQUIS', 'Saisissez un prix supérieur à 0 avant de mettre [[ce:produit]] en [[nom:vente]] sur ce canal.');
  }
  if (!avecPrix) enVente = false;
  return { prix, enVente };
}

/** Prix copié d'un canal vers un autre : majoré de `pct` %, arrondi au pas choisi, jamais sous un centième. */
function majorer(prix, pct = 0, pas = 0.01) {
  const p = PAS_ARRONDI.includes(pas) ? pas : 0.01;
  const pasCentimes = Math.round(p * 100);
  const enCentimes = prix * (100 + pct);
  const arrondi = Math.round(enCentimes / pasCentimes + 1e-7) * pasCentimes;
  return Math.max(1, arrondi) / 100;
}

/** Réglages de la copie d'un canal vers un autre. */
function lireCopie(body = {}) {
  const source = lireCanal(body.source);
  const cible = lireCanal(body.cible);
  if (source.directe === cible.directe && source.lienId === cible.lienId) {
    throw new ErreurCanal(400, 'CANAUX_IDENTIQUES', 'Choisissez deux canaux différents.');
  }
  const pct = body.majoration_pct === undefined || body.majoration_pct === null || body.majoration_pct === '' ? 0 : Number(body.majoration_pct);
  if (!Number.isFinite(pct) || pct < MAJORATION_MIN || pct > MAJORATION_MAX) {
    throw new ErreurCanal(400, 'MAJORATION_INVALIDE', `Majoration invalide : entre ${MAJORATION_MIN} % et ${MAJORATION_MAX} %.`);
  }
  const pas = body.arrondi === undefined || body.arrondi === null || body.arrondi === '' ? 0.01 : Number(body.arrondi);
  if (!PAS_ARRONDI.includes(pas)) throw new ErreurCanal(400, 'ARRONDI_INVALIDE', 'Arrondi inconnu.');
  return { source, cible, pct, pas, retirerAbsents: body.retirer_absents === true };
}

/**
 * Copie d'un canal vers un autre : ce qu'il faut écrire. `source` et `cible` = lignes vendables en vente sur chaque
 * canal ([{ id, prix }]) ; `familles` = Map id de ligne → { produitId, origineId } pour les lignes « produit »
 * (origineId = le produit d'origine d'une variante, sinon null).
 * Recette propre à un canal (C2) : un produit et sa variante ne se remplacent pas par copie. Si le canal d'arrivée vend
 * déjà l'autre, la ligne est laissée telle quelle : ni copiée, ni retirée.
 * Rend { aCopier: [lignes de la source], laisses, aRetirer: [id de lignes de la cible] }.
 */
function planCopie(source, cible, familles, retirerAbsents) {
  const enCible = new Set(cible.map((x) => x.id));
  const ligneDuProduit = new Map();
  const variantesDe = new Map();
  for (const [id, f] of familles) {
    ligneDuProduit.set(f.produitId, id);
    if (f.origineId != null) variantesDe.set(f.origineId, [...(variantesDe.get(f.origineId) || []), id]);
  }
  const proches = (id) => {
    const moi = familles.get(id);
    if (!moi) return [];
    if (moi.origineId == null) return variantesDe.get(moi.produitId) || [];
    return ligneDuProduit.has(moi.origineId) ? [ligneDuProduit.get(moi.origineId)] : [];
  };

  const aCopier = [];
  const gardees = new Set();
  let laisses = 0;
  for (const ligne of source) {
    const enPlace = proches(ligne.id).filter((id) => enCible.has(id));
    if (!enPlace.length) { aCopier.push(ligne); continue; }
    laisses++;
    for (const id of enPlace) gardees.add(id);
  }
  const vendues = new Set(source.map((x) => x.id));
  const aRetirer = retirerAbsents ? cible.map((x) => x.id).filter((id) => !vendues.has(id) && !gardees.has(id)) : [];
  return { aCopier, laisses, aRetirer };
}

module.exports = {
  CANAL_DIRECT, PAS_ARRONDI, MAJORATION_MIN, MAJORATION_MAX, CELLULES_MAX, ErreurCanal,
  lirePrix, lireCanal, lireCellule, lireCellules, appliquer, majorer, lireCopie, planCopie,
};
