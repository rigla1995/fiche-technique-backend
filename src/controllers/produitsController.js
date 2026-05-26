const { validationResult } = require('express-validator');
const pool = require('../config/database');

const mapProduit = (row) => ({
  id: row.id,
  name: row.nom,
  description: row.description,
  refProduit: row.ref_produit || null,
  type: row.type || 'vendable',
  clientId: row.client_id,
  activiteId: row.activite_id || null,
  activites: row.activites_list || [],
  isStockIngredient: !!row.is_stock_ingredient,
  isSupplement: !!row.is_supplement,
  totalCost: row.total_cost !== undefined && row.total_cost !== null ? parseFloat(row.total_cost) : null,
  ingredientsCount: row.ingredients_count !== undefined ? parseInt(row.ingredients_count) : undefined,
  subProductsCount: row.sub_products_count !== undefined ? parseInt(row.sub_products_count) : undefined,
  parentProductsCount: row.parent_products_count !== undefined ? parseInt(row.parent_products_count) : undefined,
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

// Returns the most recent stock price (current year) for an ingredient for a given client.
// Tries enterprise stock (any activity) then client stock, then falls back to catalogue price.
const stockPriceLookup = (ingAlias, productAlias) => `COALESCE(
    (SELECT sed.prix_unitaire FROM stock_entreprise_daily sed
     JOIN activites a_s ON sed.activite_id = a_s.id
     JOIN profil_entreprise pe_s ON a_s.entreprise_id = pe_s.id
     WHERE sed.ingredient_id = ${ingAlias}.id AND pe_s.client_id = ${productAlias}.client_id
       AND sed.prix_unitaire IS NOT NULL
       AND EXTRACT(YEAR FROM sed.date_appro) = EXTRACT(YEAR FROM CURRENT_DATE)
     ORDER BY sed.date_appro DESC LIMIT 1),
    (SELECT scd.prix_unitaire FROM stock_client_daily scd
     WHERE scd.ingredient_id = ${ingAlias}.id AND scd.client_id = ${productAlias}.client_id
       AND scd.prix_unitaire IS NOT NULL
       AND EXTRACT(YEAR FROM scd.date_appro) = EXTRACT(YEAR FROM CURRENT_DATE)
     ORDER BY scd.date_appro DESC LIMIT 1),
    0
  )`;

const costSubquery = (alias = 'p') => `
  ROUND(
    COALESCE((
      SELECT SUM(pi.portion * ${stockPriceLookup('i', alias)})
      FROM produit_ingredients pi
      JOIN articles i ON pi.ingredient_id = i.id
      WHERE pi.produit_id = ${alias}.id
    ), 0) +
    COALESCE((
      SELECT SUM(psp.portion * (
        SELECT COALESCE(SUM(pi2.portion * ${stockPriceLookup('i2', alias)}), 0)
        FROM produit_ingredients pi2
        JOIN articles i2 ON pi2.ingredient_id = i2.id
        WHERE pi2.produit_id = psp.sous_produit_id
      ))
      FROM produit_sous_produits psp
      WHERE psp.produit_id = ${alias}.id
    ), 0)
  , 3) AS total_cost`;

const list = async (req, res) => {
  const { activiteId, type, laboId } = req.query;
  const isLaboGerant = req.user.role === 'gerant' && req.user.gerant_activite_type === 'labo';
  const isActiviteGerant = req.user.role === 'gerant' && req.user.gerant_activite_type === 'activite';

  try {
    let whereExtra = '';
    const params = [req.user.gerant_parent_id || req.user.id];

    // For non-gérant users: apply standard query filters
    if (!isLaboGerant && !isActiviteGerant) {
      if (type === 'vendable' || type === 'utilisable') {
        params.push(type);
        whereExtra += ` AND p.type = $${params.length}`;
      }
      if (activiteId) {
        params.push(activiteId);
        const aIdx = params.length;
        whereExtra += ` AND (p.activite_id = $${aIdx} OR EXISTS (SELECT 1 FROM produit_activite_stock pas WHERE pas.produit_id = p.id AND pas.activite_id = $${aIdx}) OR EXISTS (SELECT 1 FROM produit_activite_affectation paa WHERE paa.produit_id = p.id AND paa.activite_id = $${aIdx}))`;
      }
      if (laboId) {
        params.push(laboId);
        whereExtra += ` AND p.activite_id IN (SELECT a.id FROM activites a WHERE a.labo_id = $${params.length})`;
      }
    }

    // Gérant labo: utilisable products scoped to their labo's activités
    if (isLaboGerant) {
      whereExtra += ` AND p.type = 'utilisable'`;
      params.push(req.user.gerant_activite_id);
      const laboIdx = params.length;
      whereExtra += ` AND p.activite_id IN (SELECT a.id FROM activites a WHERE a.labo_id = $${laboIdx})`;
    }

    // Gérant activité: restrict to their specific activité only
    if (isActiviteGerant) {
      if (type === 'vendable' || type === 'utilisable') {
        params.push(type);
        whereExtra += ` AND p.type = $${params.length}`;
      }
      params.push(req.user.gerant_activite_id);
      const gIdx = params.length;
      whereExtra += ` AND (p.activite_id = $${gIdx} OR EXISTS (SELECT 1 FROM produit_activite_stock pas WHERE pas.produit_id = p.id AND pas.activite_id = $${gIdx}) OR EXISTS (SELECT 1 FROM produit_activite_affectation paa WHERE paa.produit_id = p.id AND paa.activite_id = $${gIdx}))`;
    }

    // When filtering by activite, compute isStockIngredient from per-activité table
    const stockIngSubquery = activiteId
      ? `EXISTS (SELECT 1 FROM produit_activite_stock pas WHERE pas.produit_id = p.id AND pas.activite_id = ${parseInt(activiteId)}) AS is_stock_ingredient`
      : `p.is_stock_ingredient`;

    const result = await pool.query(
      `SELECT p.*,
        (SELECT COUNT(*) FROM produit_ingredients WHERE produit_id = p.id) AS ingredients_count,
        (SELECT COUNT(*) FROM produit_sous_produits WHERE produit_id = p.id) AS sub_products_count,
        (SELECT COUNT(*) FROM produit_sous_produits WHERE sous_produit_id = p.id) AS parent_products_count,
        ${stockIngSubquery},
        ${costSubquery()},
        (SELECT JSON_AGG(JSON_BUILD_OBJECT('id', t.id, 'nom', t.nom) ORDER BY t.nom)
         FROM (
           SELECT DISTINCT a.id, a.nom
           FROM activites a
           WHERE a.id = p.activite_id
           UNION
           SELECT DISTINCT a.id, a.nom
           FROM produit_activite_stock pas
           JOIN activites a ON a.id = pas.activite_id
           WHERE pas.produit_id = p.id
           UNION
           SELECT DISTINCT a.id, a.nom
           FROM produit_activite_affectation paa
           JOIN activites a ON a.id = paa.activite_id
           WHERE paa.produit_id = p.id
         ) t) AS activites_list
       FROM produits p
       WHERE p.client_id = $1${whereExtra}
       ORDER BY p.created_at DESC`,
      params
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
      [id, req.user.gerant_parent_id || req.user.id]
    );
    if (produit.rows.length === 0) {
      return res.status(404).json({ message: 'Produit introuvable' });
    }

    const ingredients = await pool.query(
      `SELECT pi.id, pi.ingredient_id, pi.portion, pi.unite_id,
              i.nom as ingredient_nom, NULL::numeric as prix_unitaire,
              u.nom as unite_nom,
              c.nom as categorie_nom
       FROM produit_ingredients pi
       JOIN articles i ON pi.ingredient_id = i.id
       JOIN unites u ON pi.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE pi.produit_id = $1`,
      [id]
    );

    const sousProduits = await pool.query(
      `SELECT psp.id, psp.sous_produit_id, psp.portion,
              p.nom as sous_produit_nom,
              ROUND(
                COALESCE((
                  SELECT SUM(pi2.portion * 0)
                  FROM produit_ingredients pi2
                  JOIN articles i2 ON pi2.ingredient_id = i2.id
                  WHERE pi2.produit_id = psp.sous_produit_id
                ), 0), 3
              ) AS cout_unitaire
       FROM produit_sous_produits psp
       JOIN produits p ON psp.sous_produit_id = p.id
       WHERE psp.produit_id = $1`,
      [id]
    );

    res.json({
      ...mapProduit(produit.rows[0]),
      refProduit: produit.rows[0].ref_produit || null,
      ingredients: ingredients.rows.map((r) => ({
        id: r.id,
        ingredientId: r.ingredient_id,
        portion: r.portion,
        unitId: r.unite_id,
        ingredientName: r.ingredient_nom,
        unitPrice: parseFloat(r.prix_unitaire),
        unitName: r.unite_nom,
        categorieName: r.categorie_nom || null,
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
  const refProduit = req.body.refProduit || req.body.ref_produit || null;
  const type = req.body.type === 'utilisable' ? 'utilisable' : 'vendable';
  const isSupplement = req.body.isSupplement === true || req.body.isSupplement === 'true';
  const ingredients = req.body.ingredients || [];
  const subProducts = req.body.subProducts || [];
  const activiteId = req.body.activiteId || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const isStockIngredient = type === 'utilisable' ? true : false;
    const clientId = req.user.gerant_parent_id || req.user.id;
    const result = await client.query(
      'INSERT INTO produits (nom, description, ref_produit, type, is_supplement, is_stock_ingredient, client_id, activite_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [nom, description || null, refProduit, type, isSupplement, isStockIngredient, clientId, activiteId]
    );
    const produitId = result.rows[0].id;

    for (const ing of ingredients) {
      const ingredientId = ing.ingredientId || ing.ingredient_id;
      const { portion } = ing;
      const ingRow = await client.query(
        'SELECT unite_id FROM articles WHERE id = $1',
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
  const refProduit = req.body.refProduit !== undefined ? (req.body.refProduit || null) : req.body.ref_produit !== undefined ? (req.body.ref_produit || null) : undefined;
  const type = req.body.type === 'utilisable' ? 'utilisable' : req.body.type === 'vendable' ? 'vendable' : undefined;
  const isSupplement = req.body.isSupplement !== undefined ? (req.body.isSupplement === true || req.body.isSupplement === 'true') : undefined;
  const ingredients = req.body.ingredients;
  const subProducts = req.body.subProducts;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE produits SET nom = COALESCE($1, nom), description = COALESCE($2, description),
       ref_produit = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE ref_produit END,
       type = COALESCE($4, type),
       is_supplement = COALESCE($7, is_supplement),
       updated_at = NOW() WHERE id = $5 AND client_id = $6 RETURNING *`,
      [nom, description, refProduit !== undefined ? refProduit : null, type || null, id, req.user.id, isSupplement !== undefined ? isSupplement : null]
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
          'SELECT unite_id FROM articles WHERE id = $1',
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
      [id, req.user.gerant_parent_id || req.user.id]
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
      [id, req.user.gerant_parent_id || req.user.id]
    );
    if (produit.rows.length === 0) {
      return res.status(404).json({ message: 'Produit introuvable' });
    }

    const ingredient = await pool.query(
      'SELECT id FROM articles WHERE id = $1',
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
      [id, req.user.gerant_parent_id || req.user.id]
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
      pool.query('SELECT id FROM produits WHERE id = $1 AND client_id = $2', [id, req.user.gerant_parent_id || req.user.id]),
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
      [id, req.user.gerant_parent_id || req.user.id]
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

  // Coût des ingrédients directs — prix stock le plus récent en priorité
  const ingredients = await pool.query(
    `SELECT pi.portion, i.nom as ingredient_nom,
            u.nom as unite_nom, pi.unite_id, c.nom as categorie_nom,
            COALESCE(
              (SELECT sed.prix_unitaire FROM stock_entreprise_daily sed
               JOIN activites a_s ON sed.activite_id = a_s.id
               JOIN profil_entreprise pe_s ON a_s.entreprise_id = pe_s.id
               WHERE sed.ingredient_id = i.id AND pe_s.client_id = $2
                 AND sed.prix_unitaire IS NOT NULL
               ORDER BY sed.date_appro DESC LIMIT 1),
              (SELECT scd.prix_unitaire FROM stock_client_daily scd
               WHERE scd.ingredient_id = i.id AND scd.client_id = $2
                 AND scd.prix_unitaire IS NOT NULL
               ORDER BY scd.date_appro DESC LIMIT 1),
              0
            ) as prix_unitaire
     FROM produit_ingredients pi
     JOIN articles i ON pi.ingredient_id = i.id
     JOIN unites u ON pi.unite_id = u.id
     LEFT JOIN categories c ON i.categorie_id = c.id
     WHERE pi.produit_id = $1
     ORDER BY COALESCE(c.nom, 'zzz'), i.nom`,
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
      categorie: row.categorie_nom || null,
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

async function buildDpPriceMap(actId, clientId) {
  const priceMap = {};
  if (actId) {
    const r1 = await pool.query(
      `SELECT DISTINCT ON (ingredient_id) ingredient_id, prix_unitaire
       FROM stock_entreprise_daily sed
       JOIN activites a ON sed.activite_id = a.id
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE sed.activite_id = $1 AND pe.client_id = $2
         AND sed.prix_unitaire IS NOT NULL AND sed.prix_unitaire > 0
       ORDER BY ingredient_id, date_appro DESC`,
      [actId, clientId]
    );
    r1.rows.forEach((row) => { priceMap[row.ingredient_id] = parseFloat(row.prix_unitaire); });
    const actRes = await pool.query('SELECT labo_id FROM activites WHERE id = $1', [actId]);
    const laboId = actRes.rows[0]?.labo_id;
    if (laboId) {
      const r2 = await pool.query(
        `SELECT DISTINCT ON (ingredient_id) ingredient_id, prix_unitaire
         FROM stock_labo_daily
         WHERE labo_id = $1 AND prix_unitaire IS NOT NULL AND prix_unitaire > 0
         ORDER BY ingredient_id, date_appro DESC`,
        [laboId]
      );
      r2.rows.forEach((row) => { if (!priceMap[row.ingredient_id]) priceMap[row.ingredient_id] = parseFloat(row.prix_unitaire); });
    }
  } else {
    const r = await pool.query(
      `SELECT DISTINCT ON (ingredient_id) ingredient_id, prix_unitaire
       FROM stock_client_daily
       WHERE client_id = $1 AND prix_unitaire IS NOT NULL AND prix_unitaire > 0
       ORDER BY ingredient_id, date_appro DESC`,
      [clientId]
    );
    r.rows.forEach((row) => { priceMap[row.ingredient_id] = parseFloat(row.prix_unitaire); });
  }
  return priceMap;
}

async function buildMpPriceMap(actId, clientId) {
  const priceMap = {};
  if (actId) {
    const r1 = await pool.query(
      `WITH last_inv AS (
        SELECT DISTINCT ON (ingredient_id) ingredient_id, date_inventaire
        FROM inventaires
        WHERE activite_id = $1 AND ingredient_id IS NOT NULL
        ORDER BY ingredient_id, date_inventaire DESC, created_at DESC
      )
      SELECT sed.ingredient_id, AVG(sed.prix_unitaire) AS avg_prix
      FROM stock_entreprise_daily sed
      JOIN activites a ON sed.activite_id = a.id
      JOIN profil_entreprise pe ON a.entreprise_id = pe.id
      LEFT JOIN last_inv li ON li.ingredient_id = sed.ingredient_id
      WHERE sed.activite_id = $1 AND pe.client_id = $2
        AND sed.prix_unitaire IS NOT NULL AND sed.prix_unitaire > 0
        AND (li.date_inventaire IS NULL OR sed.date_appro >= li.date_inventaire)
      GROUP BY sed.ingredient_id`,
      [actId, clientId]
    );
    r1.rows.forEach((row) => { priceMap[row.ingredient_id] = parseFloat(row.avg_prix); });
    const actRes = await pool.query('SELECT labo_id FROM activites WHERE id = $1', [actId]);
    const laboId = actRes.rows[0]?.labo_id;
    if (laboId) {
      const r2 = await pool.query(
        `SELECT ingredient_id, AVG(prix_unitaire) AS avg_prix
         FROM stock_labo_daily
         WHERE labo_id = $1 AND prix_unitaire IS NOT NULL AND prix_unitaire > 0
         GROUP BY ingredient_id`,
        [laboId]
      );
      r2.rows.forEach((row) => { if (!priceMap[row.ingredient_id]) priceMap[row.ingredient_id] = parseFloat(row.avg_prix); });
    }
  } else {
    const r = await pool.query(
      `WITH last_inv AS (
        SELECT DISTINCT ON (ingredient_id) ingredient_id, date_inventaire
        FROM inventaires
        WHERE client_id = $1 AND ingredient_id IS NOT NULL
        ORDER BY ingredient_id, date_inventaire DESC, created_at DESC
      )
      SELECT scd.ingredient_id, AVG(scd.prix_unitaire) AS avg_prix
      FROM stock_client_daily scd
      LEFT JOIN last_inv li ON li.ingredient_id = scd.ingredient_id
      WHERE scd.client_id = $1
        AND scd.prix_unitaire IS NOT NULL AND scd.prix_unitaire > 0
        AND (li.date_inventaire IS NULL OR scd.date_appro >= li.date_inventaire)
      GROUP BY scd.ingredient_id`,
      [clientId]
    );
    r.rows.forEach((row) => { priceMap[row.ingredient_id] = parseFloat(row.avg_prix); });
  }
  return priceMap;
}

const getCout = async (req, res) => {
  const { id } = req.params;
  const { mode, activiteId, pricingMethod } = req.query;
  try {
    if (mode === 'manual') {
      const actId = parseInt(activiteId) || 0;
      const pricesResult = await pool.query(
        `SELECT ingredient_id, prix_unitaire FROM fiche_technique_manual_prices
         WHERE produit_id = $1 AND client_id = $2 AND activite_id = $3`,
        [id, req.user.id, actId]
      );
      const priceMap = {};
      for (const row of pricesResult.rows) {
        priceMap[row.ingredient_id] = parseFloat(row.prix_unitaire);
      }
      const result = await calculerCoutAvecPrixMap(parseInt(id), req.user.id, priceMap);
      return res.json(mapCout(result));
    }
    if (mode === 'stock') {
      const actId = parseInt(activiteId) || 0;
      const clientId = actId ? req.user.id : (req.user.gerant_parent_id || req.user.id);
      const priceMap = pricingMethod === 'mp'
        ? await buildMpPriceMap(actId, clientId)
        : await buildDpPriceMap(actId, clientId);
      const result = await calculerCoutAvecPrixMap(parseInt(id), req.user.id, priceMap);
      return res.json(mapCout(result));
    }
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

// Calcul du coût avec une map de prix explicites { ingredientId → prixUnitaire }
async function calculerCoutAvecPrixMap(produitId, clientId, priceMap, visited = new Set()) {
  if (visited.has(produitId)) throw new Error('Référence circulaire détectée dans les sous-produits');
  visited.add(produitId);

  const produit = await pool.query('SELECT * FROM produits WHERE id = $1 AND client_id = $2', [produitId, clientId]);
  if (produit.rows.length === 0) throw new Error('Produit introuvable');

  const ingredients = await pool.query(
    `SELECT pi.portion, i.id as ingredient_id, i.nom as ingredient_nom,
            u.nom as unite_nom, c.nom as categorie_nom
     FROM produit_ingredients pi
     JOIN articles i ON pi.ingredient_id = i.id
     JOIN unites u ON pi.unite_id = u.id
     LEFT JOIN categories c ON i.categorie_id = c.id
     WHERE pi.produit_id = $1
     ORDER BY COALESCE(c.nom, 'zzz'), i.nom`,
    [produitId]
  );

  let coutIngredients = 0;
  const lignesIngredients = ingredients.rows.map((row) => {
    const prix = priceMap[row.ingredient_id] !== undefined ? parseFloat(priceMap[row.ingredient_id]) : 0;
    const cout = parseFloat(row.portion) * prix;
    coutIngredients += cout;
    return {
      nom: row.ingredient_nom,
      portion: parseFloat(row.portion),
      unite: row.unite_nom,
      prix_unitaire: prix,
      cout: parseFloat(cout.toFixed(3)),
      categorie: row.categorie_nom || null,
    };
  });

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
    const detailSp = await calculerCoutAvecPrixMap(sp.sous_produit_id, clientId, priceMap, new Set(visited));
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

// GET /products/:id/stock-dates?activiteId=:aid&month=YYYY-MM
// Omit month to get all available dates (not limited to current month)
const getStockDates = async (req, res) => {
  const { id } = req.params;
  const { activiteId, month } = req.query;

  try {
    let rows;
    if (activiteId) {
      if (month) {
        const monthDate = `${month}-01`;
        const result = await pool.query(
          `SELECT DISTINCT date_appro::text FROM stock_entreprise_daily sed
           JOIN activites a ON sed.activite_id = a.id
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE sed.activite_id = $1 AND pe.client_id = $2 AND sed.prix_unitaire IS NOT NULL
             AND DATE_TRUNC('month', sed.date_appro) = DATE_TRUNC('month', $3::date)
           ORDER BY date_appro`,
          [activiteId, req.user.id, monthDate]
        );
        rows = result.rows;
      } else {
        const result = await pool.query(
          `SELECT DISTINCT date_appro::text FROM stock_entreprise_daily sed
           JOIN activites a ON sed.activite_id = a.id
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE sed.activite_id = $1 AND pe.client_id = $2 AND sed.prix_unitaire IS NOT NULL
           ORDER BY date_appro DESC`,
          [activiteId, req.user.id]
        );
        rows = result.rows;
      }
    } else {
      if (month) {
        const monthDate = `${month}-01`;
        const result = await pool.query(
          `SELECT DISTINCT date_appro::text FROM stock_client_daily
           WHERE client_id = $1 AND prix_unitaire IS NOT NULL
             AND DATE_TRUNC('month', date_appro) = DATE_TRUNC('month', $2::date)
           ORDER BY date_appro`,
          [req.user.id, monthDate]
        );
        rows = result.rows;
      } else {
        const result = await pool.query(
          `SELECT DISTINCT date_appro::text FROM stock_client_daily
           WHERE client_id = $1 AND prix_unitaire IS NOT NULL
           ORDER BY date_appro DESC`,
          [req.user.gerant_parent_id || req.user.id]
        );
        rows = result.rows;
      }
    }
    res.json({ dates: rows.map((r) => r.date_appro.slice(0, 10)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Recursively collect ingredients grouped by their source product/sub-product.
// Returns: [{ label, depth, ingredientIds: [{ ingredientId, nom, unite }] }, ...]
// seenIngs prevents the same ingredient appearing in multiple groups.
async function collectIngredientsStructured(produitId, label, depth, visitedProds = new Set(), seenIngs = new Set(), clientId = null) {
  if (visitedProds.has(produitId)) return [];
  visitedProds.add(produitId);

  const direct = await pool.query(
    `SELECT pi.ingredient_id, i.nom AS ingredient_nom, u.nom AS unite_nom, c.nom AS categorie_nom
     FROM produit_ingredients pi
     JOIN articles i ON i.id = pi.ingredient_id
     LEFT JOIN unites u ON i.unite_id = u.id
     LEFT JOIN categories c ON i.categorie_id = c.id
     WHERE pi.produit_id = $1
     ORDER BY c.nom NULLS LAST, i.nom`,
    [produitId]
  );

  const groups = [];
  const newIngredients = direct.rows.filter((r) => !seenIngs.has(r.ingredient_id));
  newIngredients.forEach((r) => seenIngs.add(r.ingredient_id));

  if (newIngredients.length > 0) {
    groups.push({
      label,
      depth,
      ingredients: newIngredients.map((r) => ({
        ingredientId: r.ingredient_id,
        nom: r.ingredient_nom,
        unite: r.unite_nom,
        categorie: r.categorie_nom || null,
      })),
    });
  }

  const subsQuery = clientId
    ? `SELECT psp.sous_produit_id, p.nom
       FROM produit_sous_produits psp
       JOIN produits p ON p.id = psp.sous_produit_id
       WHERE psp.produit_id = $1 AND p.client_id = $2`
    : `SELECT psp.sous_produit_id, p.nom
       FROM produit_sous_produits psp
       JOIN produits p ON p.id = psp.sous_produit_id
       WHERE psp.produit_id = $1`;
  const subs = await pool.query(subsQuery, clientId ? [produitId, clientId] : [produitId]);
  for (const sp of subs.rows) {
    const subGroups = await collectIngredientsStructured(sp.sous_produit_id, sp.nom, depth + 1, visitedProds, seenIngs, clientId);
    groups.push(...subGroups);
  }

  return groups;
}

// GET /products/:id/stock-check?activiteId=:aid
// Returns { complete, missing: [{ ingredientId, nom, unite, lastQty, lastPrice, lastDate }], groups }
const getStockCheck = async (req, res) => {
  const { id } = req.params;
  const actId = parseInt(req.query.activiteId) || 0;

  try {
    const prod = await pool.query('SELECT id, nom FROM produits WHERE id = $1 AND client_id = $2', [id, req.user.gerant_parent_id || req.user.id]);
    if (prod.rows.length === 0) return res.status(404).json({ message: 'Produit introuvable' });

    const groups = await collectIngredientsStructured(parseInt(id), prod.rows[0].nom, 0, new Set(), new Set(), req.user.id);
    const allIngredients = groups.flatMap((g) => g.ingredients);

    if (allIngredients.length === 0) return res.json({ complete: true, missing: [], groups: [] });

    const ingredientIds = allIngredients.map((i) => i.ingredientId);

    // Fetch valid stock — check only the chosen activity's stock (activity-specific, no labo fallback)
    const validIdsSet = new Set();

    if (actId) {
      // Only check stock_entreprise_daily for the chosen activity
      const r1 = await pool.query(
        `SELECT DISTINCT ON (ingredient_id) ingredient_id
         FROM stock_entreprise_daily
         WHERE activite_id = $1 AND ingredient_id = ANY($2::int[])
           AND prix_unitaire IS NOT NULL AND prix_unitaire > 0
           AND quantite IS NOT NULL AND quantite > 0
         ORDER BY ingredient_id, date_appro DESC`,
        [actId, ingredientIds]
      );
      r1.rows.forEach((r) => validIdsSet.add(r.ingredient_id));
    } else {
      const r = await pool.query(
        `SELECT DISTINCT ON (ingredient_id) ingredient_id
         FROM stock_client_daily
         WHERE client_id = $1 AND ingredient_id = ANY($2::int[])
           AND prix_unitaire IS NOT NULL AND prix_unitaire > 0
           AND quantite IS NOT NULL AND quantite > 0
         ORDER BY ingredient_id, date_appro DESC`,
        [req.user.id, ingredientIds]
      );
      r.rows.forEach((row) => validIdsSet.add(row.ingredient_id));
    }

    const missingIngredients = allIngredients.filter((ing) => !validIdsSet.has(ing.ingredientId));

    // For missing: get last known values (any year) for prefilling the popup
    let lastKnownMap = {};
    if (missingIngredients.length > 0) {
      const missingIds = missingIngredients.map((i) => i.ingredientId);
      let lkRows = [];
      if (actId) {
        const r = await pool.query(
          `SELECT DISTINCT ON (ingredient_id) ingredient_id, quantite, prix_unitaire, date_appro
           FROM stock_entreprise_daily
           WHERE activite_id = $1 AND ingredient_id = ANY($2::int[])
           ORDER BY ingredient_id, date_appro DESC`,
          [actId, missingIds]
        );
        lkRows = r.rows;
      } else {
        const r = await pool.query(
          `SELECT DISTINCT ON (ingredient_id) ingredient_id, quantite, prix_unitaire, date_appro
           FROM stock_client_daily
           WHERE client_id = $1 AND ingredient_id = ANY($2::int[])
           ORDER BY ingredient_id, date_appro DESC`,
          [req.user.id, missingIds]
        );
        lkRows = r.rows;
      }
      for (const r of lkRows) lastKnownMap[r.ingredient_id] = r;
    }

    const missing = missingIngredients.map((ing) => {
      const lk = lastKnownMap[ing.ingredientId];
      return {
        ingredientId: ing.ingredientId,
        nom: ing.nom,
        unite: ing.unite,
        categorie: ing.categorie || null,
        lastQty: lk && lk.quantite !== null ? parseFloat(lk.quantite) : null,
        lastPrice: lk && lk.prix_unitaire !== null ? parseFloat(lk.prix_unitaire) : null,
        lastDate: lk ? String(lk.date_appro).slice(0, 10) : null,
      };
    });

    const missingIdsSet = new Set(missingIngredients.map((i) => i.ingredientId));
    const missingGroups = groups
      .map((g) => ({ ...g, ingredients: g.ingredients.filter((i) => missingIdsSet.has(i.ingredientId)) }))
      .filter((g) => g.ingredients.length > 0);

    res.json({ complete: missing.length === 0, missing, groups: missingGroups });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /products/:id/manual-prices?activiteId=:aid
const getManualPrices = async (req, res) => {
  const { id } = req.params;
  const actId = parseInt(req.query.activiteId) || 0;

  try {
    const prod = await pool.query('SELECT id, nom FROM produits WHERE id = $1 AND client_id = $2', [id, req.user.gerant_parent_id || req.user.id]);
    if (prod.rows.length === 0) return res.status(404).json({ message: 'Produit introuvable' });

    // Collect ingredients grouped by source (product → sub-products → …), deduplicated across levels
    const groups = await collectIngredientsStructured(parseInt(id), prod.rows[0].nom, 0, new Set(), new Set(), req.user.id);

    // Flat list of all ingredients (already deduplicated by collectIngredientsStructured)
    const allIngredients = groups.flatMap((g) => g.ingredients);

    // Fetch saved manual prices
    const ingredientIds = allIngredients.map((r) => r.ingredientId);
    const priceMap = {};
    if (ingredientIds.length > 0) {
      const pricesResult = await pool.query(
        `SELECT ingredient_id, prix_unitaire, updated_at
         FROM fiche_technique_manual_prices
         WHERE produit_id = $1 AND client_id = $2 AND activite_id = $3
           AND ingredient_id = ANY($4::int[])`,
        [id, req.user.id, actId, ingredientIds]
      );
      for (const row of pricesResult.rows) {
        priceMap[row.ingredient_id] = { prixUnitaire: row.prix_unitaire, updatedAt: row.updated_at };
      }
    }

    const savedEntry = Object.values(priceMap).find((v) => v.updatedAt);
    const updatedAt = savedEntry ? savedEntry.updatedAt : null;

    // Attach saved prices to each group's ingredients
    const groupsWithPrices = groups.map((g) => ({
      label: g.label,
      depth: g.depth,
      ingredients: g.ingredients.map((ing) => ({
        ingredientId: ing.ingredientId,
        nom: ing.nom,
        unite: ing.unite,
        prixUnitaire: priceMap[ing.ingredientId]?.prixUnitaire != null
          ? parseFloat(priceMap[ing.ingredientId].prixUnitaire)
          : null,
      })),
    }));

    // Flat prices array kept for save flow
    const prices = allIngredients.map((ing) => ({
      ingredientId: ing.ingredientId,
      nom: ing.nom,
      unite: ing.unite,
      prixUnitaire: priceMap[ing.ingredientId]?.prixUnitaire != null
        ? parseFloat(priceMap[ing.ingredientId].prixUnitaire)
        : null,
    }));

    res.json({ groups: groupsWithPrices, prices, updatedAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /products/:id/manual-prices
const saveManualPrices = async (req, res) => {
  const { id } = req.params;
  const { activiteId, prices } = req.body;
  const actId = parseInt(activiteId) || 0;

  if (!Array.isArray(prices)) {
    return res.status(400).json({ message: 'Le champ prices doit être un tableau' });
  }
  if (prices.length === 0) {
    return res.json({ updatedAt: null });
  }

  try {
    const prod = await pool.query('SELECT id FROM produits WHERE id = $1 AND client_id = $2', [id, req.user.gerant_parent_id || req.user.id]);
    if (prod.rows.length === 0) return res.status(404).json({ message: 'Produit introuvable' });

    const now = new Date();
    for (const p of prices) {
      await pool.query(
        `INSERT INTO fiche_technique_manual_prices (produit_id, ingredient_id, client_id, activite_id, prix_unitaire, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (produit_id, ingredient_id, client_id, activite_id)
         DO UPDATE SET prix_unitaire = $5, updated_at = $6`,
        [id, p.ingredientId, req.user.id, actId, p.prixUnitaire, now]
      );
    }
    res.json({ updatedAt: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const ExcelJS = require('exceljs');

const XCOLORS = {
  navy: '1F3864', navyMid: '2E5597', white: 'FFFFFF',
  altRow: 'EEF4FB', sectionBg: 'CFE2F3', totalBg: 'D9E1F2',
  dateBg: 'F0F5FA', border: 'B8CCE4',
};

const exportListExcel = async (req, res) => {
  const { activiteId, type, search, isSupplement, withOtherSubTab } = req.query;
  const clientId = req.user.gerant_parent_id || req.user.id;
  const isVendable = type === 'vendable';

  try {
    const fetchRows = async (isSupplFilter) => {
      const params = [clientId];
      let whereExtra = '';
      if (type === 'vendable' || type === 'utilisable') {
        params.push(type); whereExtra += ` AND p.type = $${params.length}`;
      }
      if (activiteId) {
        params.push(activiteId);
        const ai = params.length;
        whereExtra += ` AND (p.activite_id = $${ai} OR EXISTS (SELECT 1 FROM produit_activite_stock pas WHERE pas.produit_id = p.id AND pas.activite_id = $${ai}) OR EXISTS (SELECT 1 FROM produit_activite_affectation paa WHERE paa.produit_id = p.id AND paa.activite_id = $${ai}))`;
      }
      if (isSupplFilter === 'true') whereExtra += ' AND p.is_supplement = TRUE';
      else if (isSupplFilter === 'false') whereExtra += ' AND p.is_supplement = FALSE';

      const { rows } = await pool.query(
        `SELECT p.id, p.nom, p.type, p.is_supplement, p.ref_produit,
          (SELECT COUNT(*) FROM produit_ingredients WHERE produit_id = p.id) AS ingredients_count,
          (SELECT COUNT(*) FROM produit_sous_produits WHERE produit_id = p.id) AS sub_products_count,
          ${costSubquery()},
          COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT('id', t.id, 'nom', t.nom) ORDER BY t.nom)
           FROM (
             SELECT DISTINCT a.id, a.nom FROM activites a WHERE a.id = p.activite_id
             UNION SELECT DISTINCT a.id, a.nom FROM produit_activite_stock pas JOIN activites a ON a.id = pas.activite_id WHERE pas.produit_id = p.id
             UNION SELECT DISTINCT a.id, a.nom FROM produit_activite_affectation paa JOIN activites a ON a.id = paa.activite_id WHERE paa.produit_id = p.id
           ) t), '[]'::json) AS activites_json
         FROM produits p WHERE p.client_id = $1${whereExtra} ORDER BY p.nom`,
        params
      );
      if (search) {
        const q = search.toLowerCase();
        return rows.filter(r => r.nom.toLowerCase().includes(q));
      }
      return rows;
    };

    const thin = { style: 'thin', color: { argb: XCOLORS.border } };
    const brd = { top: thin, left: thin, bottom: thin, right: thin };

    const buildSheet = (ws, rows, sheetTitle) => {
      const colDefs = [
        { key: 'a', width: 36 }, { key: 'b', width: 22 }, { key: 'c', width: 32 },
        { key: 'd', width: 18 }, { key: 'e', width: 18 }, { key: 'f', width: 12 },
        ...(isVendable ? [{ key: 'g', width: 14 }] : []),
      ];
      ws.columns = colDefs;
      const colCount = colDefs.length;
      const lastCol = String.fromCharCode(64 + colCount);
      let r = 1;

      const mergedRow = (text, bg, fontOpts, height) => {
        ws.mergeCells(`A${r}:${lastCol}${r}`);
        const cell = ws.getCell(`A${r}`);
        cell.value = text;
        cell.font = { name: 'Calibri', ...fontOpts };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.getRow(r).height = height;
        r++;
      };

      mergedRow('LabFlow', XCOLORS.navy, { bold: true, size: 16, color: { argb: XCOLORS.white } }, 32);
      mergedRow(sheetTitle, XCOLORS.navyMid, { bold: true, size: 12, color: { argb: XCOLORS.white } }, 24);
      const now = new Date();
      mergedRow(
        `Généré le ${now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
        XCOLORS.dateBg, { italic: true, size: 9, color: { argb: '4A5568' } }, 16
      );
      ws.getRow(r).height = 8; r++; // spacer

      // Column header row
      const colHeaders = ['Produit', 'Type', 'Activités', 'Référence', 'Coût estimé (DT)', 'Articles', ...(isVendable ? ['Produits util.'] : [])];
      const hRow = ws.getRow(r);
      hRow.height = 22;
      colHeaders.forEach((h, i) => {
        const cell = hRow.getCell(i + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: XCOLORS.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XCOLORS.navy } };
        cell.alignment = { horizontal: i === 0 || i === 2 ? 'left' : 'center', vertical: 'middle' };
        cell.border = brd;
      });
      const headerRowNum = r;
      ws.views = [{ state: 'frozen', ySplit: r }];
      r++;

      let altIdx = 0;
      let totalRowsWritten = 0;
      const addDataRow = (product, overrideActivite = null) => {
        const acts = product.activites_json || [];
        const activitesStr = overrideActivite !== null ? overrideActivite : acts.map(a => a.nom).join(', ');
        const typeLabel = product.is_supplement ? 'Supplément vendable' : product.type === 'vendable' ? 'Produit vendable' : 'Produit utilisable';
        const values = [
          product.nom, typeLabel, activitesStr, product.ref_produit || '',
          product.total_cost !== null ? parseFloat(product.total_cost) : 0,
          parseInt(product.ingredients_count),
          ...(isVendable ? [parseInt(product.sub_products_count)] : []),
        ];
        const dataRow = ws.getRow(r);
        dataRow.height = 17;
        const bg = altIdx % 2 === 0 ? XCOLORS.white : XCOLORS.altRow;
        values.forEach((val, i) => {
          const cell = dataRow.getCell(i + 1);
          cell.value = val;
          cell.font = { name: 'Calibri', size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
          cell.border = brd;
          cell.alignment = { vertical: 'middle', horizontal: i === 0 || i === 2 ? 'left' : 'center' };
        });
        if (product.total_cost !== null) dataRow.getCell(5).numFmt = '#,##0.000';
        altIdx++; totalRowsWritten++; r++;
      };

      if (!activiteId && rows.length > 0) {
        // Group by activity
        const actMap = new Map();
        rows.forEach(p => (p.activites_json || []).forEach(a => actMap.set(a.id, a.nom)));
        const sorted = [...actMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));

        if (sorted.length > 0) {
          sorted.forEach(([actId, actNom]) => {
            const actProducts = rows.filter(p => (p.activites_json || []).some(a => a.id === actId));
            if (actProducts.length === 0) return;
            ws.mergeCells(`A${r}:${lastCol}${r}`);
            const secCell = ws.getCell(`A${r}`);
            secCell.value = `  ${actNom}  —  ${actProducts.length} produit${actProducts.length !== 1 ? 's' : ''}`;
            secCell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: XCOLORS.navy } };
            secCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XCOLORS.sectionBg } };
            secCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
            secCell.border = brd;
            ws.getRow(r).height = 20; r++;
            altIdx = 0;
            // Pass activity name so "Activités" column only shows this activity
            actProducts.forEach(p => addDataRow(p, actNom));
            ws.getRow(r).height = 8; r++; // gap between sections
          });
        } else {
          rows.forEach(p => addDataRow(p));
        }
      } else {
        rows.forEach(p => addDataRow(p));
      }

      // Summary — count all written rows (a product in 2 activities = 2 rows)
      ws.mergeCells(`A${r}:${lastCol}${r}`);
      const totCell = ws.getCell(`A${r}`);
      totCell.value = `Total : ${totalRowsWritten} produit${totalRowsWritten !== 1 ? 's' : ''}`;
      totCell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: XCOLORS.navy } };
      totCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XCOLORS.totalBg } };
      totCell.alignment = { horizontal: 'center', vertical: 'middle' };
      totCell.border = brd;
      ws.getRow(r).height = 20;

      ws.autoFilter = { from: { row: headerRowNum, column: 1 }, to: { row: headerRowNum, column: colCount } };
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'LabFlow';
    wb.created = new Date();

    const isCurrentSupp = isSupplement === 'true';
    const mainTitle = isCurrentSupp ? 'SUPPLÉMENTS VENDABLES' : (isVendable ? 'PRODUITS VENDABLES' : 'PRODUITS UTILISABLES');
    const mainSheetName = isCurrentSupp ? 'Suppléments vendables' : (isVendable ? 'Produits vendables' : 'Produits utilisables');

    buildSheet(wb.addWorksheet(mainSheetName), await fetchRows(isSupplement), mainTitle);

    if (withOtherSubTab === 'true' && isVendable) {
      const otherSupp = isCurrentSupp ? 'false' : 'true';
      const otherTitle = otherSupp === 'true' ? 'SUPPLÉMENTS VENDABLES' : 'PRODUITS VENDABLES';
      const otherSheet = otherSupp === 'true' ? 'Suppléments vendables' : 'Produits vendables';
      buildSheet(wb.addWorksheet(otherSheet), await fetchRows(otherSupp), otherTitle);
    }

    const filename = `labflow-${isCurrentSupp ? 'supplements' : isVendable ? 'produits-vendables' : 'produits-utilisables'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur export' });
  }
};

module.exports = {
  list, getById, create, update, remove,
  addIngredient, removeIngredient,
  addSousProduit, removeSousProduit,
  getCout, calculerCout, calculerCoutAvecPrixMap,
  buildDpPriceMap, buildMpPriceMap,
  getStockDates, getStockCheck, getManualPrices, saveManualPrices,
  exportListExcel,
};
