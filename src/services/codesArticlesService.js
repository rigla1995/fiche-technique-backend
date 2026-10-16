// D3 (16/10/2026) : préfixes des catégories et codes des articles — la base (src/utils/codesArticles.js = la règle).
// `db` = pool ou client de transaction. Les refus portent { status, code, message } (messages balisés, rendus par l'écran).
const C = require('../utils/codesArticles');

const refus = (status, code, message) => Object.assign(new Error(message), { status, code });

// Préfixes déjà pris dans le compte, toutes catégories confondues (articles ET produits), sauf la catégorie exclue
// ({ table: 'categories' | 'categories_produit', id }) quand on la modifie.
const prefixesPris = async (db, clientId, exclure = null) => {
  const r = await db.query(
    `SELECT 'categories' AS t, id, prefixe_code AS p FROM categories WHERE client_id = $1 AND prefixe_code IS NOT NULL
     UNION ALL
     SELECT 'categories_produit' AS t, id, prefixe_code AS p FROM categories_produit WHERE client_id = $1 AND prefixe_code IS NOT NULL`,
    [clientId]
  );
  return r.rows
    .filter((x) => !(exclure && exclure.table === x.t && Number(exclure.id) === Number(x.id)))
    .map((x) => x.p);
};

// Préfixe proposé pour un nom de catégorie (libre dans le compte).
const prefixePourNom = async (db, clientId, nom, exclure = null) => C.prefixeLibre(nom, await prefixesPris(db, clientId, exclure));

// Préfixe saisi : forme, réserve, unicité dans le compte. Renvoie le préfixe normalisé.
const verifierPrefixe = async (db, clientId, prefixe, exclure = null) => {
  const p = C.normaliserPrefixe(prefixe);
  if (!C.PREFIXE_RE.test(p)) throw refus(400, 'PREFIXE_INVALIDE', 'Préfixe de code : 2 à 4 lettres ou chiffres (ex. FAR).');
  if (C.RESERVES.includes(p)) throw refus(409, 'PREFIXE_RESERVE', `Le préfixe ${p} est réservé aux fiches sans catégorie.`);
  const pris = (await prefixesPris(db, clientId, exclure)).map((x) => String(x).toUpperCase());
  if (pris.includes(p)) throw refus(409, 'PREFIXE_EXISTANT', `Le préfixe ${p} est déjà celui d'une autre catégorie : choisissez-en un autre, pour qu'aucun code ne prête à confusion.`);
  return p;
};
// Préfixe à poser sur une catégorie : celui saisi (contrôlé) ou proposé d'après le nom.
const prefixePourCategorie = async (db, clientId, { prefixe, nom, exclure = null }) =>
  (prefixe != null && String(prefixe).trim() !== '' ? verifierPrefixe(db, clientId, prefixe, exclure) : prefixePourNom(db, clientId, nom, exclure));

// Codes déjà portés dans le compte : codes des articles et références des produits.
const codesPris = async (db, clientId) => {
  const r = await db.query(
    `SELECT code AS c FROM articles WHERE client_id = $1 AND code IS NOT NULL
     UNION ALL
     SELECT ref_produit AS c FROM produits WHERE client_id = $1 AND NULLIF(BTRIM(ref_produit), '') IS NOT NULL`,
    [clientId]
  );
  return r.rows.map((x) => x.c);
};

const prefixeDeCategorie = async (db, clientId, categorieId, table) => {
  if (!categorieId) return null;
  const r = await db.query(`SELECT prefixe_code FROM ${table} WHERE id = $1 AND client_id = $2`, [categorieId, clientId]);
  return r.rows[0]?.prefixe_code || null;
};

// Prochain code libre d'un article (genre 'article', catégorie d'articles) ou d'un produit (genre 'produit', catégorie
// de produits) : { prefixe, code }.
const proposerCode = async (db, clientId, { categorieId = null, genre = 'article' } = {}) => {
  const table = genre === 'produit' ? 'categories_produit' : 'categories';
  const prefixe = (await prefixeDeCategorie(db, clientId, categorieId, table)) || C.PREFIXE_SANS_CATEGORIE[genre] || 'ART';
  return { prefixe, code: C.prochainCode(prefixe, await codesPris(db, clientId)) };
};

// Code saisi : forme et unicité dans le compte (articles et produits), sauf la fiche exclue. Renvoie le code normalisé.
const verifierCode = async (db, clientId, code, { exclureArticleId = null, exclureProduitId = null } = {}) => {
  const c = C.normaliserCode(code);
  if (!C.CODE_RE.test(c)) throw refus(400, 'CODE_INVALIDE', 'Code : 2 à 20 caractères, lettres, chiffres et tirets (ex. FAR-0001).');
  const r = await db.query(
    `SELECT 1 FROM articles WHERE client_id = $1 AND UPPER(code) = $2 AND id IS DISTINCT FROM $3::int
     UNION ALL
     SELECT 1 FROM produits WHERE client_id = $1 AND UPPER(BTRIM(ref_produit)) = $2 AND id IS DISTINCT FROM $4::int
     LIMIT 1`,
    [clientId, c, exclureArticleId, exclureProduitId]
  );
  if (r.rows.length) throw refus(409, 'CODE_EXISTANT', `Le code ${c} est déjà pris dans [[votre:referentiel]] : choisissez-en un autre.`);
  return c;
};

// Code à poser à la création ou à la modification : celui saisi (contrôlé) ou proposé d'après la catégorie.
const codePourFiche = async (db, clientId, { code, categorieId = null, genre = 'article', exclureArticleId = null, exclureProduitId = null }) =>
  (code != null && String(code).trim() !== ''
    ? verifierCode(db, clientId, code, { exclureArticleId, exclureProduitId })
    : (await proposerCode(db, clientId, { categorieId, genre })).code);

// Un refus de ce service → réponse HTTP ; true s'il a répondu.
const repondreRefus = (res, e) => {
  if (e && e.status && e.code) { res.status(e.status).json({ code: e.code, message: e.message }); return true; }
  return false;
};
// Violation d'un index unique de D3 (course entre deux créations) → 409 lisible ; true s'il a répondu.
const repondreDoublon = (res, e) => {
  if (e && e.code === '23505' && /uq_articles_client_code/.test(e.constraint || '')) { res.status(409).json({ code: 'CODE_EXISTANT', message: 'Ce code vient d\'être pris : réessayez.' }); return true; }
  if (e && e.code === '23505' && /prefixe/.test(e.constraint || '')) { res.status(409).json({ code: 'PREFIXE_EXISTANT', message: 'Ce préfixe vient d\'être pris : choisissez-en un autre.' }); return true; }
  return false;
};

module.exports = { prefixesPris, prefixePourNom, verifierPrefixe, prefixePourCategorie, codesPris, proposerCode, verifierCode, codePourFiche, repondreRefus, repondreDoublon };
