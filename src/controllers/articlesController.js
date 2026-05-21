const { validationResult } = require('express-validator');
const pool = require('../config/database');

const mapArticle = (row) => ({
  id: row.id,
  name: row.nom,
  price: row.prix !== undefined && row.prix !== null ? parseFloat(row.prix) : null,
  seuilMin: row.seuil_min !== undefined && row.seuil_min !== null ? parseFloat(row.seuil_min) : null,
  unitId: row.unite_id,
  unitName: row.unite_nom,
  unit: row.unite_id ? { id: row.unite_id, name: row.unite_nom } : null,
  categorieId: row.categorie_id || null,
  categorieName: row.categorie_nom || null,
  familleId: row.famille_id || null,
  familleName: row.famille_nom || null,
  clientId: row.client_id || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const list = async (req, res) => {
  const { categorieId, familleId } = req.query;
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const params = [clientId];
    const wheres = ['a.client_id = $1'];

    if (categorieId) {
      params.push(categorieId);
      wheres.push(`a.categorie_id = $${params.length}`);
    }
    if (familleId) {
      params.push(familleId);
      wheres.push(`c.famille_id = $${params.length}`);
    }

    const result = await pool.query(
      `SELECT a.*, u.nom as unite_nom, c.nom as categorie_nom, f.nom as famille_nom, f.id as famille_id
       FROM articles a
       JOIN unites u ON a.unite_id = u.id
       LEFT JOIN categories c ON a.categorie_id = c.id
       LEFT JOIN familles f ON c.famille_id = f.id
       WHERE ${wheres.join(' AND ')}
       ORDER BY COALESCE(f.nom, 'zzz'), COALESCE(c.nom, 'zzz'), a.nom`,
      params
    );
    res.json(result.rows.map(mapArticle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getById = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const result = await pool.query(
      `SELECT a.*, u.nom as unite_nom, c.nom as categorie_nom, f.nom as famille_nom, f.id as famille_id
       FROM articles a
       JOIN unites u ON a.unite_id = u.id
       LEFT JOIN categories c ON a.categorie_id = c.id
       LEFT JOIN familles f ON c.famille_id = f.id
       WHERE a.id = $1 AND a.client_id = $2`,
      [req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Article introuvable' });
    res.json(mapArticle(result.rows[0]));
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
  const prix = req.body.price !== undefined ? req.body.price : (req.body.prix !== undefined ? req.body.prix : null);
  const unite_id = req.body.unitId || req.body.unite_id;
  const categorie_id = req.body.categorieId || req.body.categorie_id || null;
  const seuil_min = req.body.seuilMin !== undefined ? req.body.seuilMin : (req.body.seuil_min !== undefined ? req.body.seuil_min : null);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const uniteCheck = await client.query('SELECT id FROM unites WHERE id = $1', [unite_id]);
    if (uniteCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Unité invalide' });
    }

    if (categorie_id) {
      const catCheck = await client.query(
        'SELECT id FROM categories WHERE id = $1 AND client_id = $2',
        [categorie_id, clientId]
      );
      if (catCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Catégorie invalide' });
      }
    }

    const inserted = await client.query(
      `INSERT INTO articles (nom, prix, unite_id, client_id, categorie_id, seuil_min)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [nom, prix !== null ? prix : null, unite_id, clientId, categorie_id, seuil_min]
    );
    const newId = inserted.rows[0].id;
    await client.query('COMMIT');

    const result = await pool.query(
      `SELECT a.*, u.nom as unite_nom, c.nom as categorie_nom, f.nom as famille_nom, f.id as famille_id
       FROM articles a JOIN unites u ON a.unite_id = u.id LEFT JOIN categories c ON a.categorie_id = c.id
       LEFT JOIN familles f ON c.famille_id = f.id WHERE a.id = $1`,
      [newId]
    );
    res.status(201).json(mapArticle(result.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    client.release();
  }
};

const update = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const clientId = req.user.gerant_parent_id || req.user.id;
  const nom = req.body.name || req.body.nom;
  const prixVal = req.body.price !== undefined ? req.body.price : req.body.prix;
  const prixStr = prixVal !== undefined && prixVal !== null ? String(prixVal) : null;
  const unite_id = req.body.unitId || req.body.unite_id;
  const categorie_id = req.body.categorieId !== undefined ? req.body.categorieId
    : req.body.categorie_id !== undefined ? req.body.categorie_id : undefined;
  const catChanged = categorie_id !== undefined;
  const seuilMin = req.body.seuilMin !== undefined ? req.body.seuilMin
    : req.body.seuil_min !== undefined ? req.body.seuil_min : undefined;
  const seuilChanged = seuilMin !== undefined;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updated = await client.query(
      `UPDATE articles
       SET nom = COALESCE($1, nom),
           prix = CASE WHEN $2::text IS NOT NULL THEN $2::numeric ELSE prix END,
           unite_id = COALESCE($3, unite_id),
           categorie_id = CASE WHEN $5::boolean THEN $4 ELSE categorie_id END,
           seuil_min = CASE WHEN $7::boolean THEN $6 ELSE seuil_min END,
           updated_at = NOW()
       WHERE id = $8 AND client_id = $9 RETURNING id`,
      [nom, prixStr, unite_id, categorie_id ?? null, catChanged, seuilMin ?? null, seuilChanged, req.params.id, clientId]
    );
    if (updated.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Article introuvable' });
    }
    await client.query('COMMIT');

    const result = await pool.query(
      `SELECT a.*, u.nom as unite_nom, c.nom as categorie_nom, f.nom as famille_nom, f.id as famille_id
       FROM articles a JOIN unites u ON a.unite_id = u.id LEFT JOIN categories c ON a.categorie_id = c.id
       LEFT JOIN familles f ON c.famille_id = f.id WHERE a.id = $1`,
      [updated.rows[0].id]
    );
    res.json(mapArticle(result.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    client.release();
  }
};

const remove = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const result = await pool.query(
      'DELETE FROM articles WHERE id = $1 AND client_id = $2 RETURNING id',
      [req.params.id, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Article introuvable' });
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ message: "Cet article est utilisé dans un produit ou dans le stock et ne peut pas être supprimé" });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Check if client has any articles (for sidebar progressive disclosure)
const hasArticles = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const result = await pool.query(
      'SELECT COUNT(*) FROM articles WHERE client_id = $1',
      [clientId]
    );
    const count = parseInt(result.rows[0].count);
    res.json({ hasArticles: count > 0, count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, getById, create, update, remove, hasArticles };
