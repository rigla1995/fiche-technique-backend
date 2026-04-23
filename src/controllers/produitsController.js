const { validationResult } = require('express-validator');
const pool = require('../config/database');

const mapProduit = (row) => ({
  id: row.id,
  name: row.nom,
  description: row.description,
  type: row.type || 'vendable',
  clientId: row.client_id,
  totalCost: row.total_cost !== undefined && row.total_cost !== null ? parseFloat(row.total_cost) : null,
  ingredientsCount: row.ingredients_count !== undefined ? parseInt(row.ingredients_count) : undefined,
  subProductsCount: row.sub_products_count !== undefined ? parseInt(row.sub_products_count) : undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapCout = (data) => ({
  product: data.produit,
  ingredients: data.ingredients.map((i) => ({
    name: i.nom,
    portion: i.portion,
    unit: i.unite,
    unitPrice: i.prix_unitaire,
    cost: i.cout,
  })),
  subProducts: data.sous_produits.map((sp) => ({
    name: sp.nom,
    portion: sp.portion,
    unitCost: sp.cout_unitaire,
    cost: sp.cout,
    details: mapCout(sp.details),
  })),
  ingredientsCost: data.cout_ingredients,
  subProductsCost: data.cout_sous_produits,
  totalCost: data.cout_total,
});

const list = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM produit_ingredients WHERE produit_id = p.id) AS ingredients_count,
        (SELECT COUNT(*) FROM produit_sous_produits WHERE produit_id = p.id) AS sub_products_count,
        ROUND(
          COALESCE((
            SELECT SUM(pi.portion * COALESCE(ipc.prix, i.prix, 0))
            FROM produit_ingredients pi
            JOIN ingredients i ON pi.ingredient_id = i.id
            LEFT JOIN ingredient_prix_client ipc ON ipc.ingredient_id = i.id AND ipc.client_id = p.client_id
            WHERE pi.produit_id = p.id
          ), 0) +
          COALESCE((
            SELECT SUM(psp.portion * (
              SELECT COALESCE(SUM(pi2.portion * COALESCE(ipc2.prix, i2.prix, 0)), 0)
              FROM produit_ingredients pi2
              JOIN ingredients i2 ON pi2.ingredient_id = i2.id
              LEFT JOIN ingredient_prix_client ipc2 ON ipc2.ingredient_id = i2.id AND ipc2.client_id = p.client_id
              WHERE pi2.produit_id = psp.sous_produit_id
            ))
            FROM produit_sous_produits psp
            WHERE psp.produit_id = p.id
          ), 0)
        , 3) AS total_cost
       FROM produits p
       WHERE p.client_id = $1
       ORDER BY p.nom`,
      [req.user.id]
    );
    res.json(result.rows.map(mapProduit));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getById = async (req, res) => {
  const { id } = req.params;
  try {
    const produit = await pool.query(
      'SELECT * FROM produits WHERE id = $1 AND client_id = $2',
      [id, req.user.id]
    );
    if (produit.rows.length === 0) {
      return res.status(404).json({ message: 'Produit introuvable' });
    }

    const ingredients = await pool.query(
      `SELECT pi.id, pi.ingredient_id, pi.portion, pi.unite_id,
              i.nom as ingredient_nom, i.prix as prix_unitaire,
              u.nom as unite_nom
       FROM produit_ingredients pi
       JOIN ingredients i ON pi.ingredient_id = i.id
       JOIN unites u ON pi.unite_id = u.id
       WHERE pi.produit_id = $1`,
      [id]
    );

    const sousProduits = await pool.query(
      `SELECT psp.id, psp.sous_produit_id, psp.portion,
              p.nom as sous_produit_nom,
              ROUND(
                COALESCE((
                  SELECT SUM(pi2.portion * COALESCE(ipc2.prix, i2.prix, 0))
                  FROM produit_ingredients pi2
                  JOIN ingredients i2 ON pi2.ingredient_id = i2.id
                  LEFT JOIN ingredient_prix_client ipc2
                    ON ipc2.ingredient_id = i2.id AND ipc2.client_id = $2
                  WHERE pi2.produit_id = psp.sous_produit_id
                ), 0), 3
              ) AS cout_unitaire
       FROM produit_sous_produits psp
       JOIN produits p ON psp.sous_produit_id = p.id
       WHERE psp.produit_id = $1`,
      [id, req.user.id]
    );

    res.json({
      ...mapProduit(produit.rows[0]),
      ingredients: ingredients.rows.map((r) => ({
        id: r.id,
        ingredientId: r.ingredient_id,
        portion: r.portion,
        unitId: r.unite_id,
        ingredientName: r.ingredient_nom,
        unitPrice: parseFloat(r.prix_unitaire),
        unitName: r.unite_nom,
      })),
      subProducts: sousProduits.rows.map((r) => {
        const unitCost = parseFloat(r.cout_unitaire || 0);
        const portion = parseFloat(r.portion);
        return {
          id: r.id,
          subProductId: r.sous_produit_id,
          portion,
          subProductName: r.sous_produit_nom,
          unitCost,
          totalLineCost: parseFloat((portion * unitCost).toFixed(3)),
        };
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const nom = req.body.name || req.body.nom;
  const { description } = req.body;
  const type = req.body.type === 'utilisable' ? 'utilisable' : 'vendable';
  const ingredients = req.body.ingredients || [];
  const subProducts = req.body.subProducts || [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      'INSERT INTO produits (nom, description, type, client_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [nom, description || null, type, req.user.id]
    );
    const produitId = result.rows[0].id;

    for (const ing of ingredients) {
      const ingredientId = ing.ingredientId || ing.ingredient_id;
      const { portion } = ing;
      const ingRow = await client.query(
        'SELECT unite_id FROM ingredients WHERE id = $1',
        [ingredientId]
      );
      if (ingRow.rows.length === 0) continue;
      const uniteId = ing.unitId || ing.unite_id || ingRow.rows[0].unite_id;
      await client.query(
        `INSERT INTO produit_ingredients (produit_id, ingredient_id, portion, unite_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (produit_id, ingredient_id) DO UPDATE SET portion = $3, unite_id = $4`,
        [produitId, ingredientId, portion, uniteId]
      );
    }

    for (const sp of subProducts) {
      const sousProduitId = sp.subProductId || sp.sous_produit_id || sp.productId;
      const { portion } = sp;
      if (parseInt(produitId) === parseInt(sousProduitId)) continue;
      await client.query(
        `INSERT INTO produit_sous_produits (produit_id, sous_produit_id, portion)
         VALUES ($1, $2, $3)
         ON CONFLICT (produit_id, sous_produit_id) DO UPDATE SET portion = $3`,
        [produitId, sousProduitId, portion]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(mapProduit(result.rows[0]));
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
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const nom = req.body.name || req.body.nom;
  const { description } = req.body;
  const type = req.body.type === 'utilisable' ? 'utilisable' : req.body.type === 'vendable' ? 'vendable' : undefined;
  const ingredients = req.body.ingredients;
  const subProducts = req.body.subProducts;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE produits SET nom = COALESCE($1, nom), description = COALESCE($2, description),
       type = COALESCE($3, type),
       updated_at = NOW() WHERE id = $4 AND client_id = $5 RETURNING *`,
      [nom, description, type || null, id, req.user.id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Produit introuvable' });
    }

    if (ingredients !== undefined) {
      await client.query('DELETE FROM produit_ingredients WHERE produit_id = $1', [id]);
      for (const ing of ingredients) {
        const ingredientId = ing.ingredientId || ing.ingredient_id;
        const { portion } = ing;
        const ingRow = await client.query(
          'SELECT unite_id FROM ingredients WHERE id = $1',
          [ingredientId]
        );
        if (ingRow.rows.length === 0) continue;
        const uniteId = ing.unitId || ing.unite_id || ingRow.rows[0].unite_id;
        await client.query(
          `INSERT INTO produit_ingredients (produit_id, ingredient_id, portion, unite_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (produit_id, ingredient_id) DO UPDATE SET portion = $3, unite_id = $4`,
          [id, ingredientId, portion, uniteId]
        );
      }
    }

    if (subProducts !== undefined) {
      await client.query('DELETE FROM produit_sous_produits WHERE produit_id = $1', [id]);
      for (const sp of subProducts) {
        const sousProduitId = sp.subProductId || sp.sous_produit_id || sp.productId;
        const { portion } = sp;
        if (parseInt(id) === parseInt(sousProduitId)) continue;
        await client.query(
          `INSERT INTO produit_sous_produits (produit_id, sous_produit_id, portion)
           VALUES ($1, $2, $3)
           ON CONFLICT (produit_id, sous_produit_id) DO UPDATE SET portion = $3`,
          [id, sousProduitId, portion]
        );
      }
    }

    await client.query('COMMIT');
    res.json(mapProduit(result.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    client.release();
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM produits WHERE id = $1 AND client_id = $2 RETURNING id',
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Produit introuvable' });
    }
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({ message: 'Ce produit est utilisé comme sous-produit et ne peut pas être supprimé' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const addIngredient = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const ingredient_id = req.body.ingredientId || req.body.ingredient_id;
  const unite_id = req.body.unitId || req.body.unite_id;
  const { portion } = req.body;

  try {
    // Vérifier que le produit appartient au client
    const produit = await pool.query(
      'SELECT id FROM produits WHERE id = $1 AND client_id = $2',
      [id, req.user.id]
    );
    if (produit.rows.length === 0) {
      return res.status(404).json({ message: 'Produit introuvable' });
    }

    const ingredient = await pool.query(
      'SELECT id FROM ingredients WHERE id = $1',
      [ingredient_id]
    );
    if (ingredient.rows.length === 0) {
      return res.status(400).json({ message: 'Ingrédient invalide' });
    }

    const result = await pool.query(
      `INSERT INTO produit_ingredients (produit_id, ingredient_id, portion, unite_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (produit_id, ingredient_id)
       DO UPDATE SET portion = $3, unite_id = $4
       RETURNING *`,
      [id, ingredient_id, portion, unite_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const removeIngredient = async (req, res) => {
  const { id, ingredientId } = req.params;
  try {
    // Verify product ownership
    const produit = await pool.query(
      'SELECT id FROM produits WHERE id = $1 AND client_id = $2',
      [id, req.user.id]
    );
    if (produit.rows.length === 0) {
      return res.status(404).json({ message: 'Produit introuvable' });
    }

    const result = await pool.query(
      'DELETE FROM produit_ingredients WHERE produit_id = $1 AND ingredient_id = $2 RETURNING id',
      [id, ingredientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ingrédient non trouvé dans ce produit' });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const addSousProduit = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const sousProduitId = req.body.productId || req.body.produit_id;
  const { portion } = req.body;

  if (parseInt(id) === parseInt(sousProduitId)) {
    return res.status(400).json({ message: 'Un produit ne peut pas être son propre sous-produit' });
  }

  try {
    const [produit, sousProduit] = await Promise.all([
      pool.query('SELECT id FROM produits WHERE id = $1 AND client_id = $2', [id, req.user.id]),
      pool.query('SELECT id FROM produits WHERE id = $1 AND client_id = $2', [sousProduitId, req.user.id]),
    ]);

    if (produit.rows.length === 0) {
      return res.status(404).json({ message: 'Produit introuvable' });
    }
    if (sousProduit.rows.length === 0) {
      return res.status(400).json({ message: 'Sous-produit invalide' });
    }

    const result = await pool.query(
      `INSERT INTO produit_sous_produits (produit_id, sous_produit_id, portion)
       VALUES ($1, $2, $3)
       ON CONFLICT (produit_id, sous_produit_id)
       DO UPDATE SET portion = $3
       RETURNING *`,
      [id, sousProduitId, portion]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const removeSousProduit = async (req, res) => {
  const { id, sousProduitId } = req.params;
  try {
    const produit = await pool.query(
      'SELECT id FROM produits WHERE id = $1 AND client_id = $2',
      [id, req.user.id]
    );
    if (produit.rows.length === 0) {
      return res.status(404).json({ message: 'Produit introuvable' });
    }

    const result = await pool.query(
      'DELETE FROM produit_sous_produits WHERE produit_id = $1 AND sous_produit_id = $2 RETURNING id',
      [id, sousProduitId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Sous-produit non trouvé dans ce produit' });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Calcul récursif du coût d'un produit
async function calculerCout(produitId, clientId, visited = new Set()) {
  if (visited.has(produitId)) {
    throw new Error('Référence circulaire détectée dans les sous-produits');
  }
  visited.add(produitId);

  const produit = await pool.query(
    'SELECT * FROM produits WHERE id = $1 AND client_id = $2',
    [produitId, clientId]
  );
  if (produit.rows.length === 0) {
    throw new Error('Produit introuvable');
  }

  // Coût des ingrédients directs — prix client prioritaire
  const ingredients = await pool.query(
    `SELECT pi.portion, COALESCE(ipc.prix, i.prix, 0) as prix_unitaire, i.nom as ingredient_nom,
            u.nom as unite_nom, pi.unite_id
     FROM produit_ingredients pi
     JOIN ingredients i ON pi.ingredient_id = i.id
     JOIN unites u ON pi.unite_id = u.id
     LEFT JOIN ingredient_prix_client ipc ON ipc.ingredient_id = i.id AND ipc.client_id = $2
     WHERE pi.produit_id = $1`,
    [produitId, clientId]
  );

  let coutIngredients = 0;
  const lignesIngredients = ingredients.rows.map((row) => {
    const cout = parseFloat(row.portion) * parseFloat(row.prix_unitaire);
    coutIngredients += cout;
    return {
      nom: row.ingredient_nom,
      portion: parseFloat(row.portion),
      unite: row.unite_nom,
      prix_unitaire: parseFloat(row.prix_unitaire),
      cout: parseFloat(cout.toFixed(3)),
    };
  });

  // Coût des sous-produits (récursif)
  const sousProduits = await pool.query(
    `SELECT psp.portion, psp.sous_produit_id, p.nom as sous_produit_nom
     FROM produit_sous_produits psp
     JOIN produits p ON psp.sous_produit_id = p.id
     WHERE psp.produit_id = $1`,
    [produitId]
  );

  let coutSousProduits = 0;
  const lignesSousProduits = [];

  for (const sp of sousProduits.rows) {
    const detailSp = await calculerCout(sp.sous_produit_id, clientId, new Set(visited));
    const coutSp = parseFloat(sp.portion) * detailSp.cout_total;
    coutSousProduits += coutSp;
    lignesSousProduits.push({
      nom: sp.sous_produit_nom,
      portion: parseFloat(sp.portion),
      cout_unitaire: detailSp.cout_total,
      cout: parseFloat(coutSp.toFixed(3)),
      details: detailSp,
    });
  }

  const coutTotal = coutIngredients + coutSousProduits;

  return {
    produit: produit.rows[0].nom,
    ingredients: lignesIngredients,
    sous_produits: lignesSousProduits,
    cout_ingredients: parseFloat(coutIngredients.toFixed(3)),
    cout_sous_produits: parseFloat(coutSousProduits.toFixed(3)),
    cout_total: parseFloat(coutTotal.toFixed(3)),
  };
}

const getCout = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await calculerCout(parseInt(id), req.user.id);
    res.json(mapCout(result));
  } catch (err) {
    if (err.message === 'Produit introuvable') {
      return res.status(404).json({ message: err.message });
    }
    if (err.message.includes('circulaire')) {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  list, getById, create, update, remove,
  addIngredient, removeIngredient,
  addSousProduit, removeSousProduit,
  getCout, calculerCout,
};
