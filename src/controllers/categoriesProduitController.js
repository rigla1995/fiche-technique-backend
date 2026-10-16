const { validationResult } = require('express-validator');
const pool = require('../config/database');
// D3 (16/10/2026) : code unique des articles, préfixe des catégories (src/utils/codesArticles.js = la règle).
const CS = require('../services/codesArticlesService');

const TYPES = ['vendable', 'supplement', 'valorise'];

const mapCategorie = (row) => ({
  id: row.id,
  name: row.nom,
  // D3 : préfixe des références de ses produits (« GAT » → GAT-0001), unique dans le compte avec les catégories d'articles
  prefixeCode: row.prefixe_code || null,
  typeProduit: row.type_produit || 'vendable',
  clientId: row.client_id || null,
  produitsCount: row.produits_count !== undefined ? Number(row.produits_count) : undefined,
  createdAt: row.created_at,
});

const list = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const params = [clientId];
    let where = 'WHERE cp.client_id = $1';
    if (req.query.type && TYPES.includes(req.query.type)) {
      params.push(req.query.type);
      where += ` AND cp.type_produit = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT cp.*,
              (SELECT COUNT(*) FROM produits p WHERE p.categorie_produit_id = cp.id) AS produits_count
       FROM categories_produit cp
       ${where}
       ORDER BY cp.type_produit, cp.nom`,
      params
    );
    res.json(result.rows.map(mapCategorie));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getById = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const result = await pool.query(
      'SELECT * FROM categories_produit WHERE id = $1 AND client_id = $2',
      [req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.json(mapCategorie(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const clientId = req.user.gerant_parent_id || req.user.id;
  const nom = (req.body.name || req.body.nom || '').trim();
  const typeProduit = req.body.typeProduit || req.body.type_produit;
  if (!TYPES.includes(typeProduit)) {
    return res.status(400).json({ message: "Type [[de:produit]] invalide (vendable, supplement ou valorise)" });
  }

  try {
    let prefixe;
    try {
      prefixe = await CS.prefixePourCategorie(pool, clientId, { prefixe: req.body.prefixeCode, nom });
    } catch (e) {
      if (CS.repondreRefus(res, e)) return;
      throw e;
    }
    const result = await pool.query(
      'INSERT INTO categories_produit (nom, client_id, type_produit, prefixe_code) VALUES ($1, $2, $3, $4) RETURNING *',
      [nom, clientId, typeProduit, prefixe]
    );
    res.status(201).json(mapCategorie(result.rows[0]));
  } catch (err) {
    if (CS.repondreDoublon(res, err)) return;
    if (err.code === '23505') return res.status(409).json({ message: 'Cette catégorie existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const update = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const clientId = req.user.gerant_parent_id || req.user.id;
  const nom = (req.body.name || req.body.nom || '').trim();
  const rawType = req.body.typeProduit || req.body.type_produit;
  const typeProduit = TYPES.includes(rawType) ? rawType : null;

  try {
    let prefixe = null;
    if (req.body.prefixeCode != null && String(req.body.prefixeCode).trim() !== '') {
      try {
        prefixe = await CS.verifierPrefixe(pool, clientId, req.body.prefixeCode, { table: 'categories_produit', id: req.params.id });
      } catch (e) {
        if (CS.repondreRefus(res, e)) return;
        throw e;
      }
    }
    const result = await pool.query(
      `UPDATE categories_produit
       SET nom = $1,
           type_produit = COALESCE($2, type_produit),
           prefixe_code = COALESCE($5, prefixe_code)
       WHERE id = $3 AND client_id = $4 RETURNING *`,
      [nom, typeProduit, req.params.id, clientId, prefixe]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.json(mapCategorie(result.rows[0]));
  } catch (err) {
    if (CS.repondreDoublon(res, err)) return;
    if (err.code === '23505') return res.status(409).json({ message: 'Cette catégorie existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/categories-produit/prefixe-propose?nom=&exclureId= — D3 : le préfixe libre proposé pour ce nom.
const prefixePropose = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const exclure = req.query.exclureId ? { table: 'categories_produit', id: Number(req.query.exclureId) } : null;
    res.json({ prefixe: await CS.prefixePourNom(pool, clientId, String(req.query.nom || ''), exclure) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const remove = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    // categorie_produit_id sur produits et activite_articles_vendables est ON DELETE SET NULL,
    // donc la suppression est toujours possible (les produits deviennent sans catégorie).
    const result = await pool.query(
      'DELETE FROM categories_produit WHERE id = $1 AND client_id = $2 RETURNING id',
      [req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, getById, create, update, remove, prefixePropose };
