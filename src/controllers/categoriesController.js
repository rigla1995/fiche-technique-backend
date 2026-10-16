const { validationResult } = require('express-validator');
const pool = require('../config/database');
// D3 (16/10/2026) : code unique des articles, préfixe des catégories (src/utils/codesArticles.js = la règle).
const CS = require('../services/codesArticlesService');

const mapCategorie = (row) => ({
  id: row.id,
  name: row.nom,
  // D3 : préfixe des codes de ses articles (« FAR » → FAR-0001), unique dans le compte
  prefixeCode: row.prefixe_code || null,
  familleId: row.famille_id || null,
  familleName: row.famille_nom || null,
  clientId: row.client_id || null,
  hasAppros: row.has_appros === true,
  nbArticles: row.nb_articles != null ? parseInt(row.nb_articles, 10) : 0,
  createdAt: row.created_at,
});

const list = async (req, res) => {
  const { onlyWithArticles, familleId } = req.query;
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const params = [clientId];
    let where = 'WHERE c.client_id = $1';

    if (familleId) {
      params.push(familleId);
      where += ` AND c.famille_id = $${params.length}`;
    }
    if (onlyWithArticles === 'true') {
      where += ' AND EXISTS (SELECT 1 FROM articles a WHERE a.categorie_id = c.id)';
    }

    const result = await pool.query(
      `SELECT c.*, f.nom as famille_nom,
              EXISTS (
                SELECT 1 FROM articles a WHERE a.categorie_id = c.id AND a.client_id = $1
                AND (EXISTS (SELECT 1 FROM stock_entreprise_daily   WHERE ingredient_id = a.id) OR
                     EXISTS (SELECT 1 FROM stock_labo_daily         WHERE ingredient_id = a.id))
              ) AS has_appros,
              (SELECT COUNT(*)::int FROM articles a2 WHERE a2.categorie_id = c.id AND a2.client_id = $1) AS nb_articles
       FROM categories c
       LEFT JOIN familles f ON f.id = c.famille_id
       ${where}
       ORDER BY COALESCE(f.nom, 'zzz'), c.nom`,
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
      `SELECT c.*, f.nom as famille_nom
       FROM categories c LEFT JOIN familles f ON f.id = c.famille_id
       WHERE c.id = $1 AND c.client_id = $2`,
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
  const nom = req.body.name || req.body.nom;
  const famille_id = req.body.familleId || req.body.famille_id || null;

  try {
    // D3 : préfixe saisi (contrôlé) ou proposé d'après le nom, unique entre toutes les catégories du compte.
    let prefixe;
    try {
      prefixe = await CS.prefixePourCategorie(pool, clientId, { prefixe: req.body.prefixeCode, nom });
    } catch (e) {
      if (CS.repondreRefus(res, e)) return;
      throw e;
    }
    const result = await pool.query(
      'INSERT INTO categories (nom, client_id, famille_id, prefixe_code) VALUES ($1, $2, $3, $4) RETURNING *',
      [nom, clientId, famille_id, prefixe]
    );
    const row = result.rows[0];
    if (famille_id) {
      const f = await pool.query('SELECT nom FROM familles WHERE id = $1', [famille_id]);
      row.famille_nom = f.rows[0]?.nom || null;
    }
    res.status(201).json(mapCategorie(row));
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
  const nom = req.body.name || req.body.nom;
  const famille_id = req.body.familleId !== undefined ? req.body.familleId
    : req.body.famille_id !== undefined ? req.body.famille_id : undefined;
  const familleChanged = famille_id !== undefined;

  try {
    // D3 : préfixe modifiable (contrôlé, unique) ; vide ou absent = inchangé ; les codes déjà posés ne bougent pas.
    let prefixe = null;
    if (req.body.prefixeCode != null && String(req.body.prefixeCode).trim() !== '') {
      try {
        prefixe = await CS.verifierPrefixe(pool, clientId, req.body.prefixeCode, { table: 'categories', id: req.params.id });
      } catch (e) {
        if (CS.repondreRefus(res, e)) return;
        throw e;
      }
    }
    const result = await pool.query(
      `UPDATE categories
       SET nom = COALESCE($1, nom),
           famille_id = CASE WHEN $3::boolean THEN $2 ELSE famille_id END,
           prefixe_code = COALESCE($6, prefixe_code)
       WHERE id = $4 AND client_id = $5 RETURNING *`,
      [nom, famille_id ?? null, familleChanged, req.params.id, clientId, prefixe]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    const row = result.rows[0];
    if (row.famille_id) {
      const f = await pool.query('SELECT nom FROM familles WHERE id = $1', [row.famille_id]);
      row.famille_nom = f.rows[0]?.nom || null;
    }
    res.json(mapCategorie(row));
  } catch (err) {
    if (CS.repondreDoublon(res, err)) return;
    if (err.code === '23505') return res.status(409).json({ message: 'Cette catégorie existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/categories/prefixe-propose?nom=&exclureId= — D3 : le préfixe libre proposé pour ce nom.
const prefixePropose = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const exclure = req.query.exclureId ? { table: 'categories', id: Number(req.query.exclureId) } : null;
    res.json({ prefixe: await CS.prefixePourNom(pool, clientId, String(req.query.nom || ''), exclure) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const remove = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    // Une catégorie assignée à des articles ne se supprime pas (le front désactive
    // le bouton ; garde serveur en défense en profondeur).
    const lies = await pool.query(
      `SELECT COUNT(*)::int AS n FROM articles WHERE categorie_id = $1 AND client_id = $2`,
      [req.params.id, clientId]
    );
    if (lies.rows[0].n > 0) {
      return res.status(409).json({
        message: `Cette catégorie est assignée à ${lies.rows[0].n} ${lies.rows[0].n > 1 ? '[[nom:article:pl]]' : '[[nom:article]]'} — supprimez-les ou changez leur catégorie avant`,
      });
    }
    const result = await pool.query(
      'DELETE FROM categories WHERE id = $1 AND client_id = $2 RETURNING id',
      [req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ message: 'Cette catégorie est utilisée par [[un:article:pl]] et ne peut pas être supprimée' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, getById, create, update, remove, prefixePropose };
