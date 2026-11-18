// Import d'un fichier de caisse (étape V1a — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis) :
// règles PURES, sans base. Le navigateur lit le fichier et propose ; le serveur REVÉRIFIE tout ce qu'il reçoit.
//   - une ligne du fichier = une désignation, une quantité, un montant réel (brut moins remises), rattachée à UN
//     produit de la carte (ou ignorée) ;
//   - sa quantité est répartie par canal : la vente directe et les prestataires. Le reste est de la vente directe ;
//     dans une catégorie de LIVRAISON, rien ne va en vente directe ;
//   - le prix d'une vente importée = montant ÷ quantité (6 décimales) : le chiffre égale celui de la caisse.
// V1b : la source CSV, le remplacement d'une journée (`remplacer`) et le modèle de fichier à retenir (`colonnes`).
// Tests : test/ventesImport.test.js.
const { normaliserDesignation } = require('../services/facturesValidees');

const CANAL_DIRECT = 'directe';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIGNES_MAX = 1000;
const SOURCES = Object.freeze(['excel', 'pdf', 'csv']);
// Colonnes qu'un utilisateur désigne dans un fichier dont les titres ne se reconnaissent pas seuls (V1b).
const ROLES_COLONNES = Object.freeze(['designation', 'quantite', 'montant', 'prixUnitaire', 'categorie']);

class ErreurImport extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ErreurImport';
    this.status = status;
    this.code = code;
  }
}
const refus = (code, message) => new ErreurImport(400, code, message);

const millime = (v) => Math.round(v * 1000 + 1e-7) / 1000;
const texte = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Clé d'une catégorie du fichier (« DELIVERY », « Delivery » et « delivery » sont la même). */
const cleCategorie = (nom) => normaliserDesignation(nom).slice(0, 130);

/**
 * Clé d'apprentissage d'une ligne de caisse : sa CATÉGORIE et sa désignation. Le même plat existe souvent dans deux
 * cartes du fichier (sur place, livraison) à deux prix : la désignation seule les confondrait.
 */
const cleCorrespondance = (categorie, designation) => `${cleCategorie(categorie)}|${normaliserDesignation(designation)}`.slice(0, 330);

function lireNombre(v, { code, quoi, min = 0, strict = false }) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  if (typeof v === 'boolean' || v === null || v === '' || !Number.isFinite(n) || n < min || (strict && n <= min) || n > 99999999) {
    throw refus(code, `${quoi} invalide.`);
  }
  return millime(n);
}

function lireCanal(v) {
  if (v === CANAL_DIRECT) return CANAL_DIRECT;
  if (typeof v === 'string' && UUID_RE.test(v)) return v.toLowerCase();
  throw refus('CANAL_INVALIDE', 'Canal de [[nom:vente]] inconnu.');
}

/** Une ligne du fichier, telle que vérifiée à l'écran. `livraisons` = clés des catégories de livraison. */
function lireLigne(l, rang, livraisons) {
  if (!l || typeof l !== 'object') throw refus('LIGNE_INVALIDE', `Ligne ${rang} invalide.`);
  const designation = texte(l.designation, 255);
  if (!designation) throw refus('LIGNE_INVALIDE', `Ligne ${rang} : désignation manquante.`);
  const categorie = texte(l.categorie, 120) || null;
  const quantite = lireNombre(l.quantite, { code: 'LIGNE_INVALIDE', quoi: `Ligne ${rang} (« ${designation} ») : quantité`, strict: true });
  const montant = lireNombre(l.montant, { code: 'LIGNE_INVALIDE', quoi: `Ligne ${rang} (« ${designation} ») : montant` });
  const ligne = { rang, categorie, designation, quantite, montant, ignoree: l.ignoree === true, articleType: null, articleId: null, repartition: [] };
  if (ligne.ignoree) return ligne;

  if (l.article_type !== 'produit' && l.article_type !== 'ingredient') throw refus('PRODUIT_REQUIS', `Ligne ${rang} (« ${designation} ») : choisissez ce qui a été vendu, ou ignorez la ligne.`);
  const articleId = Number(l.article_id);
  if (!Number.isInteger(articleId) || articleId <= 0) throw refus('PRODUIT_REQUIS', `Ligne ${rang} (« ${designation} ») : choisissez ce qui a été vendu, ou ignorez la ligne.`);
  ligne.articleType = l.article_type;
  ligne.articleId = articleId;

  if (!Array.isArray(l.repartition) || !l.repartition.length) throw refus('REPARTITION_INVALIDE', `Ligne ${rang} (« ${designation} ») : répartition par canal manquante.`);
  const vus = new Set();
  for (const part of l.repartition) {
    const canal = lireCanal(part?.canal);
    if (vus.has(canal)) throw refus('REPARTITION_INVALIDE', `Ligne ${rang} (« ${designation} ») : un canal est cité deux fois.`);
    vus.add(canal);
    const q = lireNombre(part?.quantite, { code: 'REPARTITION_INVALIDE', quoi: `Ligne ${rang} (« ${designation} ») : quantité d'un canal`, strict: true });
    ligne.repartition.push({ canal, quantite: q });
  }
  const reparti = millime(ligne.repartition.reduce((s, p) => s + p.quantite, 0));
  if (Math.abs(reparti - quantite) > 0.0005) {
    throw refus('REPARTITION_INVALIDE', `Ligne ${rang} (« ${designation} ») : ${reparti} réparti pour ${quantite} dans le fichier.`);
  }
  if (categorie && livraisons.has(cleCategorie(categorie)) && vus.has(CANAL_DIRECT)) {
    throw refus('LIVRAISON_SANS_DIRECTE', `Ligne ${rang} (« ${designation} ») : la catégorie « ${categorie} » est de la livraison, sa quantité se répartit entre les [[nom:prestataire:pl]] seulement.`);
  }
  return ligne;
}

/**
 * Le modèle de fichier à retenir (V1b) : la ligne de titres du fichier (`signature`) et les colonnes désignées par
 * l'utilisateur. Rend null si le corps n'en porte pas (colonnes reconnues seules).
 */
function lireModeleColonnes(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw refus('MODELE_INVALIDE', 'Modèle de fichier invalide.');
  const signature = texte(v.signature, 400);
  if (!signature) throw refus('MODELE_INVALIDE', 'Modèle de fichier invalide.');
  const colonnes = {};
  const vues = new Set();
  for (const role of ROLES_COLONNES) {
    const n = v.colonnes?.[role];
    if (n === null || n === undefined) continue;
    if (!Number.isInteger(n) || n < 1 || n > 200 || vues.has(n)) throw refus('MODELE_INVALIDE', 'Modèle de fichier invalide : colonnes.');
    vues.add(n);
    colonnes[role] = n;
  }
  if (!colonnes.designation || !colonnes.quantite || !(colonnes.montant || colonnes.prixUnitaire)) {
    throw refus('MODELE_INVALIDE', 'Modèle de fichier invalide : désignation, quantité et montant (ou prix) requis.');
  }
  return { signature, colonnes };
}

/** Le corps de POST /api/ventes/imports, contrôlé. `aujourdHui` (AAAA-MM-JJ) borne la date. */
function lireImport(body, aujourdHui = new Date().toISOString().slice(0, 10)) {
  const b = body && typeof body === 'object' ? body : {};
  const date = String(b.date_vente ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw refus('DATE_INVALIDE', 'Date de la journée invalide.');
  }
  // Un jour d'avance toléré (fuseau du navigateur) ; au-delà, la journée n'a pas encore eu lieu.
  const demain = new Date(Date.parse(`${aujourdHui}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (date > demain) throw refus('DATE_FUTURE', 'Cette journée n\'a pas encore eu lieu.');
  if (!SOURCES.includes(b.source)) throw refus('SOURCE_INVALIDE', 'Type de fichier inconnu (Excel, PDF ou CSV attendu).');
  const empreinte = String(b.empreinte ?? '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(empreinte)) throw refus('EMPREINTE_INVALIDE', 'Empreinte du fichier manquante.');

  const categories = [];
  const clesVues = new Set();
  for (const c of Array.isArray(b.categories) ? b.categories : []) {
    const nom = texte(c?.nom, 120);
    const cle = cleCategorie(nom);
    if (!cle || clesVues.has(cle)) continue;
    clesVues.add(cle);
    categories.push({ cle, nom, livraison: c?.livraison === true });
  }
  const livraisons = new Set(categories.filter((c) => c.livraison).map((c) => c.cle));

  if (!Array.isArray(b.lignes) || !b.lignes.length) throw refus('LIGNES_REQUISES', 'Aucune ligne à importer.');
  if (b.lignes.length > LIGNES_MAX) throw refus('LIGNES_TROP', `Trop de lignes dans ce fichier (${LIGNES_MAX} au plus).`);
  const lignes = b.lignes.map((l, i) => lireLigne(l, i + 1, livraisons));
  if (lignes.every((l) => l.ignoree)) throw refus('LIGNES_REQUISES', 'Toutes les lignes sont ignorées : rien à importer.');

  const totalLu = b.total_lu === null || b.total_lu === undefined || b.total_lu === '' ? null : lireNombre(b.total_lu, { code: 'TOTAL_INVALIDE', quoi: 'Total du fichier' });
  return {
    dateVente: date, source: b.source, empreinte, remplacer: b.remplacer === true, modeleColonnes: lireModeleColonnes(b.colonnes), fichierNom: texte(b.fichier_nom, 255) || null, modele: texte(b.modele, 80) || null,
    totalLu, totalEnregistre: millime(lignes.filter((l) => !l.ignoree).reduce((s, l) => s + l.montant, 0)), categories, lignes,
  };
}

/** Prix unitaire d'une ligne importée : montant ÷ quantité, à 6 décimales (quantité × prix retombe sur le montant). */
const prixUnitaire = (montant, quantite) => Math.round((montant / quantite) * 1e6) / 1e6;

/**
 * Les ventes à créer : une par canal. Rend une Map canal → lignes de vente ({ article_type, article_id, quantite,
 * prix_unitaire }), dans l'ordre du fichier, la vente directe d'abord.
 */
function ventesParCanal(lignes) {
  const parCanal = new Map();
  for (const l of lignes) {
    if (l.ignoree) continue;
    const prix = prixUnitaire(l.montant, l.quantite);
    for (const part of l.repartition) {
      if (!parCanal.has(part.canal)) parCanal.set(part.canal, []);
      parCanal.get(part.canal).push({ article_type: l.articleType, article_id: l.articleId, quantite: part.quantite, prix_unitaire: prix });
    }
  }
  return new Map([...parCanal.entries()].sort((a, b) => (a[0] === CANAL_DIRECT ? -1 : b[0] === CANAL_DIRECT ? 1 : a[0].localeCompare(b[0]))));
}

module.exports = {
  CANAL_DIRECT, LIGNES_MAX, SOURCES, ROLES_COLONNES, ErreurImport, lireModeleColonnes, millime, cleCategorie, cleCorrespondance, lireCanal, lireLigne, lireImport, prixUnitaire, ventesParCanal,
};
