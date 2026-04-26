const { validationResult } = require('express-validator');
const pool = require('../config/database');

const mapIngredient = (row) => ({
  id: row.id,
  name: row.nom,
  price: row.prix !== undefined && row.prix !== null ? parseFloat(row.prix) : null,
  clientPrice: row.client_prix !== undefined && row.client_prix !== null ? parseFloat(row.client_prix) : null,
  effectivePrice: row.effective_prix !== undefined && row.effective_prix !== null ? parseFloat(row.effective_prix) : null,
  selected: !!row.selected,
  selected: !!row.selected,
  unitId: row.unite_id,
  unitName: row.unite_nom,
  unit: row.unite_id ? { id: row.unite_id, name: row.unite_nom } : null,
  categorieId: row.categorie_id || null,
  categorieName: row.categorie_nom || null,
  clientId: row.client_id || null,
  clientName: row.client_nom || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const list = async (req, res) => {
  const { categorieId } = req.query;
  try {
    let query, params;
    if (req.user.role === 'super_admin') {
      params = [];
      let where = categorieId ? `WHERE i.categorie_id = $${params.push(categorieId)}` : '';
      query = `
        SELECT i.*, u.nom as unite_nom, util.nom as client_nom, c.nom as categorie_nom,
               NULL::numeric as client_prix, i.prix as effective_prix
        FROM ingredients i
        JOIN unites u ON i.unite_id = u.id
        LEFT JOIN utilisateurs util ON i.client_id = util.id
        LEFT JOIN categories c ON i.categorie_id = c.id
        ${where}
        ORDER BY COALESCE(c.nom, 'zzz'), i.nom
      `;
    } else {
      params = [req.user.id];
      let where = categorieId ? `AND i.categorie_id = $${params.push(categorieId)}` : '';
      query = `
        SELECT i.*, u.nom as unite_nom, c.nom as categorie_nom,
               ipc.prix as client_prix,
               COALESCE(ipc.prix, i.prix) as effective_prix,
               (cis.ingredient_id IS NOT NULL) as selected
        FROM ingredients i
        JOIN unites u ON i.unite_id = u.id
        LEFT JOIN categories c ON i.categorie_id = c.id
        LEFT JOIN ingredient_prix_client ipc ON ipc.ingredient_id = i.id AND ipc.client_id = $1
        LEFT JOIN client_ingredient_selections cis ON cis.ingredient_id = i.id AND cis.client_id = $1
        WHERE 1=1 ${where}
        ORDER BY COALESCE(c.nom, 'zzz'), i.nom
      `;
    }
    const result = await pool.query(query, params);
    res.json(result.rows.map(mapIngredient));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `SELECT i.*, u.nom as unite_nom, c.nom as categorie_nom,
              ipc.prix as client_prix,
              COALESCE(ipc.prix, i.prix) as effective_prix
       FROM ingredients i
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN ingredient_prix_client ipc ON ipc.ingredient_id = i.id AND ipc.client_id = $2
       WHERE i.id = $1`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Ingrédient introuvable' });
    res.json(mapIngredient(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const nom = req.body.name || req.body.nom;
  const prix = req.body.price !== undefined ? req.body.price : (req.body.prix !== undefined ? req.body.prix : null);
  const unite_id = req.body.unitId || req.body.unite_id;
  const categorie_id = req.body.categorieId || req.body.categorie_id || null;
  const clientId = req.user.role === 'super_admin' ? null : req.user.id;

  try {
    const uniteCheck = await pool.query('SELECT id FROM unites WHERE id = $1', [unite_id]);
    if (uniteCheck.rows.length === 0) return res.status(400).json({ message: 'Unité invalide' });

    const inserted = await pool.query(
      `INSERT INTO ingredients (nom, prix, unite_id, client_id, categorie_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [nom, prix !== null ? prix : null, unite_id, clientId, categorie_id]
    );
    const result = await pool.query(
      `SELECT i.*, u.nom as unite_nom, c.nom as categorie_nom,
              NULL::numeric as client_prix, i.prix as effective_prix
       FROM ingredients i JOIN unites u ON i.unite_id = u.id LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE i.id = $1`,
      [inserted.rows[0].id]
    );
    res.status(201).json(mapIngredient(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const update = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { id } = req.params;
  const nom = req.body.name || req.body.nom;
  const prixVal = req.body.price !== undefined ? req.body.price : req.body.prix;
  const prixStr = prixVal !== undefined && prixVal !== null ? String(prixVal) : null;
  const unite_id = req.body.unitId || req.body.unite_id;
  const categorie_id = req.body.categorieId !== undefined
    ? req.body.categorieId
    : req.body.categorie_id !== undefined ? req.body.categorie_id : undefined;
  const catChanged = categorie_id !== undefined;

  try {
    const isSuperAdmin = req.user.role === 'super_admin';
    const params = isSuperAdmin
      ? [nom, prixStr, unite_id, categorie_id ?? null, id, catChanged]
      : [nom, prixStr, unite_id, categorie_id ?? null, id, req.user.id, catChanged];

    const catPlaceholder = isSuperAdmin ? '$6' : '$7';
    const whereClause = isSuperAdmin ? 'WHERE id = $5' : 'WHERE id = $5 AND client_id = $6';

    const updated = await pool.query(
      `UPDATE ingredients
       SET nom = COALESCE($1, nom),
           prix = CASE WHEN $2::text IS NOT NULL THEN $2::numeric ELSE prix END,
           unite_id = COALESCE($3, unite_id),
           categorie_id = CASE WHEN ${catPlaceholder}::boolean THEN $4 ELSE categorie_id END,
           updated_at = NOW()
       ${whereClause} RETURNING id`,
      params
    );
    if (updated.rows.length === 0) return res.status(404).json({ message: 'Ingrédient introuvable' });

    const result = await pool.query(
      `SELECT i.*, u.nom as unite_nom, c.nom as categorie_nom,
              NULL::numeric as client_prix, i.prix as effective_prix
       FROM ingredients i JOIN unites u ON i.unite_id = u.id LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE i.id = $1`,
      [updated.rows[0].id]
    );
    res.json(mapIngredient(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  try {
    const isSuperAdmin = req.user.role === 'super_admin';
    const whereClause = isSuperAdmin ? 'WHERE id = $1' : 'WHERE id = $1 AND client_id = $2';
    const params = isSuperAdmin ? [id] : [id, req.user.id];
    const result = await pool.query(`DELETE FROM ingredients ${whereClause} RETURNING id`, params);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Ingrédient introuvable' });
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ message: 'Cet ingrédient est utilisé dans un produit et ne peut pas être supprimé' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const setClientPrice = async (req, res) => {
  const { id } = req.params;
  const prix = req.body.price !== undefined ? req.body.price : req.body.prix;
  if (prix === undefined || prix === null || isNaN(parseFloat(prix)) || parseFloat(prix) < 0) {
    return res.status(400).json({ message: 'Prix invalide' });
  }
  try {
    const ingCheck = await pool.query('SELECT id FROM ingredients WHERE id = $1', [id]);
    if (ingCheck.rows.length === 0) return res.status(404).json({ message: 'Ingrédient introuvable' });

    await pool.query(
      `INSERT INTO ingredient_prix_client (ingredient_id, client_id, prix)
       VALUES ($1, $2, $3)
       ON CONFLICT (ingredient_id, client_id) DO UPDATE SET prix = $3, updated_at = NOW()`,
      [id, req.user.id, parseFloat(prix)]
    );
    const result = await pool.query(
      `SELECT i.*, u.nom as unite_nom, c.nom as categorie_nom,
              ipc.prix as client_prix, COALESCE(ipc.prix, i.prix) as effective_prix
       FROM ingredients i JOIN unites u ON i.unite_id = u.id LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN ingredient_prix_client ipc ON ipc.ingredient_id = i.id AND ipc.client_id = $2
       WHERE i.id = $1`,
      [id, req.user.id]
    );
    res.json(mapIngredient(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};


const toggleSelection = async (req, res) => {
  const clientId = req.user.id;
  const ingredientId = parseInt(req.params.id);
  try {
    const existing = await pool.query(
      'SELECT 1 FROM client_ingredient_selections WHERE client_id = $1 AND ingredient_id = $2',
      [clientId, ingredientId]
    );
    if (existing.rows.length > 0) {
      await pool.query('DELETE FROM client_ingredient_selections WHERE client_id = $1 AND ingredient_id = $2', [clientId, ingredientId]);
      return res.json({ selected: false });
    } else {
      await pool.query('INSERT INTO client_ingredient_selections (client_id, ingredient_id) VALUES ($1, $2)', [clientId, ingredientId]);
      return res.json({ selected: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const hasSelections = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM client_ingredient_selections WHERE client_id = $1',
      [req.user.id]
    );
    const count = parseInt(result.rows[0].count);
    res.json({ hasSelections: count > 0, count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, getById, create, update, remove, setClientPrice, toggleSelection, hasSelections };
