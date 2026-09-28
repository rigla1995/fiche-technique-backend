const pool = require('../config/database');

// ─── Stock courant (lot 1b) : délégué à stockService (moteur unique, spec §2.2) ──
// Les 4 calculs historiques (labo/activité × article/PT) vivent désormais dans
// src/services/stockService.js avec une signature (db, scope, id, ref) ; ces wrappers
// conservent l'API module-level (pool) des ~20 appelants existants. Oracle figé :
// scripts/legacy/stock-legacy.js ; invariant : scripts/check-invariant-stock.js.
const { computeStock } = require('../services/stockService');

/**
 * Compute current stock for a single ingredient in one scope (labo or activite).
 * Returns a rounded float (can be negative if data is inconsistent).
 *
 * @param {'labo'|'activite'} scope
 * @param {number}            scopeId    — laboId or activiteId
 * @param {number}            ingredientId
 */
async function computeStockCourant(scope, scopeId, ingredientId) {
  return computeStock(pool, scope, scopeId, { articleId: ingredientId });
}

/**
 * Compute current PT stock for a single produit in a given scope.
 * - Labo: stock_labo_pt_daily (appro) - labo_transfers (sortants PT) - labo_pertes (PT)
 * - Activite: stock_produits_transformes (entrants) - pertes (PT)
 * Both with last inventory as baseline if it exists.
 *
 * @param {'labo'|'activite'} scope
 * @param {number}            scopeId
 * @param {number}            produitId
 */
async function computeStockPTCourant(scope, scopeId, produitId) {
  return computeStock(pool, scope, scopeId, { produitId });
}

/**
 * Référence auto d'une écriture de stock liée à un PT (règle métier) :
 *   nom multi-mots    → initiale de chaque mot + année YY   (« Crème Pâtissière » → CP-26)
 *   nom d'un seul mot → 3 premières lettres + année YY      (« Cookies » → COO-26)
 * Majuscules, sans accents ; l'année (YY, pas YYYY) est celle de la date d'appro.
 */
function buildAutoRef(nom, when) {
  const clean = String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const base = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] || 'PT').slice(0, 3);
  const d = when ? new Date(when) : new Date();
  const year = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  return `${base.toUpperCase()}-${String(year).slice(-2)}`;
}

/**
 * Catégorie virtuelle d'un produit transformé (stocks, historiques, exports, rapports) :
 *   type 'utilisable'              → « Produits Transformés Utilisables »
 *   type 'vendable' origine 'labo' → « Produits Composés Valorisés »
 *   type 'vendable' (activité)     → « Produits Transformés Vendables »
 * Une catégorie n'apparaît à l'écran que si elle contient au moins un produit
 * (les regroupements se font sur les lignes réelles).
 */
function ptCategorie(type, origine) {
  if (type === 'utilisable') return 'Produits Transformés Utilisables';
  return origine === 'labo' ? 'Produits Composés Valorisés' : 'Produits Transformés Vendables';
}

// Même règle en SQL — `alias` = alias de la table produits dans la requête.
function ptCategorieSql(alias) {
  return `CASE WHEN ${alias}.type = 'utilisable' THEN 'Produits Transformés Utilisables' ` +
         `WHEN ${alias}.origine = 'labo' THEN 'Produits Composés Valorisés' ` +
         `ELSE 'Produits Transformés Vendables' END`;
}

// Prédicat SQL du filtre par sous-type de PT (param ptType des historiques/exports) :
// 'utilisable' | 'vendable' | 'valorise' — sinon pas de restriction.
function ptTypeSql(alias, ptType) {
  if (ptType === 'utilisable') return `${alias}.type = 'utilisable'`;
  if (ptType === 'valorise') return `(${alias}.type = 'vendable' AND ${alias}.origine = 'labo')`;
  if (ptType === 'vendable') return `(${alias}.type = 'vendable' AND ${alias}.origine <> 'labo')`;
  return '1=1';
}

module.exports = { computeStockCourant, computeStockPTCourant, buildAutoRef, ptCategorie, ptCategorieSql, ptTypeSql };
