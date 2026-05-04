const pool = require('../config/database');

// ─── toggleStockIngredient ────────────────────────────────────────────────────
// POST /api/produits/:id/toggle-stock-ingredient
const toggleStockIngredient = async (req, res) => {
  const produitId = parseInt(req.params.id);
  const userId = req.user.id;

  try {
    // Verify product ownership (indép: client_id = userId)
    const ownerRes = await pool.query(
      `SELECT id, is_stock_ingredient, client_id FROM produits WHERE id = $1 AND client_id = $2`,
      [produitId, userId]
    );
    if (ownerRes.rows.length === 0) {
      return res.status(403).json({ message: 'Produit introuvable ou accès refusé' });
    }

    const current = ownerRes.rows[0].is_stock_ingredient;
    const newValue = !current;

    await pool.query(
      `UPDATE produits SET is_stock_ingredient = $1 WHERE id = $2`,
      [newValue, produitId]
    );

    if (!newValue) {
      // Toggling OFF — check existing stock history
      const countRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM stock_produits_transformes WHERE produit_id = $1 AND client_id = $2`,
        [produitId, userId]
      );
      const historyCount = parseInt(countRes.rows[0].cnt);
      return res.json({ isStockIngredient: false, hadHistory: historyCount > 0, historyCount });
    }

    return res.json({ isStockIngredient: true, hadHistory: false, historyCount: 0 });
  } catch (err) {
    console.error('[toggleStockIngredient]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── deleteStockPTHistory ─────────────────────────────────────────────────────
// DELETE /api/produits/:id/stock-pt-history
const deleteStockPTHistory = async (req, res) => {
  const produitId = parseInt(req.params.id);
  const userId = req.user.id;

  try {
    // Verify ownership
    const ownerRes = await pool.query(
      `SELECT id FROM produits WHERE id = $1 AND client_id = $2`,
      [produitId, userId]
    );
    if (ownerRes.rows.length === 0) {
      return res.status(403).json({ message: 'Produit introuvable ou accès refusé' });
    }

    // Delete history — indép: client_id, or activite belonging to user
    await pool.query(
      `DELETE FROM stock_produits_transformes
       WHERE produit_id = $1
         AND (
           client_id = $2
           OR activite_id IN (
             SELECT a.id FROM activites a
             JOIN profil_entreprise pe ON a.entreprise_id = pe.id
             WHERE pe.client_id = $2
           )
         )`,
      [produitId, userId]
    );

    res.json({ deleted: true });
  } catch (err) {
    console.error('[deleteStockPTHistory]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── getStockPT ───────────────────────────────────────────────────────────────
// GET /api/stock/pt
// Query params: activiteId (optional, for entreprise)
const getStockPT = async (req, res) => {
  const userId = req.user.id;
  const { activiteId } = req.query;
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  try {
    let rows;

    if (activiteId) {
      // Entreprise mode
      const actId = parseInt(activiteId);

      // Verify activite ownership
      const actOwner = await pool.query(
        `SELECT a.id FROM activites a
         JOIN profil_entreprise pe ON a.entreprise_id = pe.id
         WHERE a.id = $1 AND pe.client_id = $2`,
        [actId, userId]
      );
      if (actOwner.rows.length === 0) {
        return res.status(403).json({ message: 'Activité introuvable ou accès refusé' });
      }

      const result = await pool.query(
        `SELECT
           p.id AS produit_id,
           p.nom,
           p.seuil_min_pt AS seuil_min,
           COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM spt.date_appro) = $2 AND EXTRACT(YEAR FROM spt.date_appro) = $3 THEN spt.quantite ELSE 0 END), 0) AS total_quantite,
           (SELECT spt2.date_appro FROM stock_produits_transformes spt2
            WHERE spt2.produit_id = p.id AND spt2.activite_id = $1
            ORDER BY spt2.date_appro DESC LIMIT 1) AS last_date_appro,
           (SELECT spt2.prix_calcule FROM stock_produits_transformes spt2
            WHERE spt2.produit_id = p.id AND spt2.activite_id = $1
            ORDER BY spt2.date_appro DESC LIMIT 1) AS last_prix_calcule
         FROM produits p
         LEFT JOIN stock_produits_transformes spt ON spt.produit_id = p.id AND spt.activite_id = $1
         WHERE p.activite_id = $1 AND p.is_stock_ingredient = TRUE
         GROUP BY p.id, p.nom, p.seuil_min_pt`,
        [actId, currentMonth, currentYear]
      );
      rows = result.rows;
    } else {
      // Indép mode
      const result = await pool.query(
        `SELECT
           p.id AS produit_id,
           p.nom,
           p.seuil_min_pt AS seuil_min,
           COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM spt.date_appro) = $2 AND EXTRACT(YEAR FROM spt.date_appro) = $3 THEN spt.quantite ELSE 0 END), 0) AS total_quantite,
           (SELECT spt2.date_appro FROM stock_produits_transformes spt2
            WHERE spt2.produit_id = p.id AND spt2.client_id = $1
            ORDER BY spt2.date_appro DESC LIMIT 1) AS last_date_appro,
           (SELECT spt2.prix_calcule FROM stock_produits_transformes spt2
            WHERE spt2.produit_id = p.id AND spt2.client_id = $1
            ORDER BY spt2.date_appro DESC LIMIT 1) AS last_prix_calcule
         FROM produits p
         LEFT JOIN stock_produits_transformes spt ON spt.produit_id = p.id AND spt.client_id = $1
         WHERE p.client_id = $1 AND p.is_stock_ingredient = TRUE
         GROUP BY p.id, p.nom, p.seuil_min_pt`,
        [userId, currentMonth, currentYear]
      );
      rows = result.rows;
    }

    const data = rows.map((r) => ({
      produitId: r.produit_id,
      nom: r.nom,
      totalQuantite: parseFloat(r.total_quantite) || 0,
      lastDateAppro: r.last_date_appro ? new Date(r.last_date_appro).toISOString().slice(0, 10) : null,
      lastPrixCalcule: r.last_prix_calcule !== null ? parseFloat(r.last_prix_calcule) : null,
      seuilMin: r.seuil_min !== null ? parseFloat(r.seuil_min) : null,
      prixPartiel: false, // not stored per-row; returned per-save
    }));

    res.json(data);
  } catch (err) {
    console.error('[getStockPT]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── getStockPTHistory ────────────────────────────────────────────────────────
// GET /api/stock/pt/:produitId/history
// Query params: activiteId (optional)
const getStockPTHistory = async (req, res) => {
  const userId = req.user.id;
  const produitId = parseInt(req.params.produitId);
  const { activiteId } = req.query;

  try {
    let result;

    if (activiteId) {
      const actId = parseInt(activiteId);
      result = await pool.query(
        `SELECT spt.id, spt.produit_id, spt.activite_id, spt.client_id,
                spt.date_appro, spt.quantite, spt.prix_calcule, spt.created_at
         FROM stock_produits_transformes spt
         WHERE spt.produit_id = $1 AND spt.activite_id = $2
         ORDER BY spt.date_appro DESC`,
        [produitId, actId]
      );
    } else {
      result = await pool.query(
        `SELECT spt.id, spt.produit_id, spt.activite_id, spt.client_id,
                spt.date_appro, spt.quantite, spt.prix_calcule, spt.created_at
         FROM stock_produits_transformes spt
         WHERE spt.produit_id = $1 AND spt.client_id = $2
         ORDER BY spt.date_appro DESC`,
        [produitId, userId]
      );
    }

    res.json(result.rows);
  } catch (err) {
    console.error('[getStockPTHistory]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── saveStockPT ──────────────────────────────────────────────────────────────
// PUT /api/stock/pt/:produitId
// Body: { quantite, dateAppro, activiteId? }
const saveStockPT = async (req, res) => {
  const userId = req.user.id;
  const produitId = parseInt(req.params.produitId);
  const { quantite, dateAppro, activiteId } = req.body;

  if (!quantite || !dateAppro) {
    return res.status(400).json({ message: 'quantite et dateAppro sont requis' });
  }

  const qty = parseFloat(quantite);
  const actId = activiteId ? parseInt(activiteId) : null;

  try {
    // 1. Verify product ownership
    let ownerCheck;
    if (actId) {
      ownerCheck = await pool.query(
        `SELECT p.id FROM produits p
         JOIN activites a ON a.id = p.activite_id
         JOIN profil_entreprise pe ON pe.id = a.entreprise_id
         WHERE p.id = $1 AND pe.client_id = $2`,
        [produitId, userId]
      );
    } else {
      ownerCheck = await pool.query(
        `SELECT id FROM produits WHERE id = $1 AND client_id = $2`,
        [produitId, userId]
      );
    }
    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Produit introuvable ou accès refusé' });
    }

    // Fetch produit name for type_appro
    const produitRes = await pool.query(`SELECT nom FROM produits WHERE id = $1`, [produitId]);
    const produitNom = produitRes.rows[0]?.nom ?? 'PT';

    // 2. Calculate prix_calcule from recipe ingredients
    let ingRows;
    if (actId) {
      const ingRes = await pool.query(
        `SELECT pi.ingredient_id, pi.portion, i.nom as nom,
           COALESCE(
             (SELECT prix_unitaire FROM stock_entreprise_daily
              WHERE ingredient_id = pi.ingredient_id AND activite_id = $2
              ORDER BY date_appro DESC LIMIT 1),
             (SELECT spt.prix_calcule FROM stock_produits_transformes spt
              JOIN produits p ON p.id = spt.produit_id
              WHERE p.linked_ingredient_id = pi.ingredient_id AND spt.activite_id = $2
              ORDER BY spt.date_appro DESC LIMIT 1)
           ) AS last_prix
         FROM produit_ingredients pi
         JOIN ingredients i ON i.id = pi.ingredient_id
         WHERE pi.produit_id = $1`,
        [produitId, actId]
      );
      ingRows = ingRes.rows;
    } else {
      const ingRes = await pool.query(
        `SELECT pi.ingredient_id, pi.portion, i.nom as nom,
           COALESCE(
             (SELECT prix_unitaire FROM stock_client_daily
              WHERE ingredient_id = pi.ingredient_id AND client_id = $2
              ORDER BY date_appro DESC LIMIT 1),
             (SELECT spt.prix_calcule FROM stock_produits_transformes spt
              JOIN produits p ON p.id = spt.produit_id
              WHERE p.linked_ingredient_id = pi.ingredient_id AND spt.client_id = $2
              ORDER BY spt.date_appro DESC LIMIT 1)
           ) AS last_prix
         FROM produit_ingredients pi
         JOIN ingredients i ON i.id = pi.ingredient_id
         WHERE pi.produit_id = $1`,
        [produitId, userId]
      );
      ingRows = ingRes.rows;
    }

    let prixCalcule = 0;
    let prixPartiel = false;
    for (const ing of ingRows) {
      if (ing.last_prix === null) {
        prixPartiel = true;
      } else {
        prixCalcule += parseFloat(ing.portion) * parseFloat(ing.last_prix);
      }
    }

    // 3. UPSERT into stock_produits_transformes
    let upsertResult;
    if (actId) {
      upsertResult = await pool.query(
        `INSERT INTO stock_produits_transformes (produit_id, activite_id, date_appro, quantite, prix_calcule)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (produit_id, COALESCE(activite_id, 0), COALESCE(client_id, 0), date_appro)
         DO UPDATE SET quantite = EXCLUDED.quantite, prix_calcule = EXCLUDED.prix_calcule
         RETURNING id`,
        [produitId, actId, dateAppro, qty, prixCalcule]
      );
    } else {
      upsertResult = await pool.query(
        `INSERT INTO stock_produits_transformes (produit_id, client_id, date_appro, quantite, prix_calcule)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (produit_id, COALESCE(activite_id, 0), COALESCE(client_id, 0), date_appro)
         DO UPDATE SET quantite = EXCLUDED.quantite, prix_calcule = EXCLUDED.prix_calcule
         RETURNING id`,
        [produitId, userId, dateAppro, qty, prixCalcule]
      );
    }
    const sptId = upsertResult.rows[0].id;

    // 4. Create consumption entries in ingredient stock (negative quantities)
    // Resolve or create AUTO fournisseur
    let autoFournisseurId = null;
    if (actId) {
      const entRes = await pool.query(
        `SELECT pe.id as entreprise_id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id WHERE a.id = $1`,
        [actId]
      );
      if (entRes.rows.length > 0) {
        const entrepriseId = entRes.rows[0].entreprise_id;
        const foRes = await pool.query(
          `SELECT f.id FROM fournisseurs f LEFT JOIN fournisseur_activites fa ON fa.fournisseur_id = f.id WHERE f.entreprise_id = $1 AND f.nom = 'AUTO' LIMIT 1`,
          [entrepriseId]
        );
        if (foRes.rows.length > 0) {
          autoFournisseurId = foRes.rows[0].id;
          await pool.query(
            `INSERT INTO fournisseur_activites (fournisseur_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [autoFournisseurId, actId]
          );
        } else {
          const newFo = await pool.query(
            `INSERT INTO fournisseurs (entreprise_id, nom) VALUES ($1, 'AUTO') RETURNING id`,
            [entrepriseId]
          );
          autoFournisseurId = newFo.rows[0].id;
          await pool.query(
            `INSERT INTO fournisseur_activites (fournisseur_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [autoFournisseurId, actId]
          );
        }
      }
    } else {
      const foRes = await pool.query(
        `SELECT id FROM fournisseurs WHERE client_id = $1 AND nom = 'AUTO' LIMIT 1`,
        [userId]
      );
      if (foRes.rows.length > 0) {
        autoFournisseurId = foRes.rows[0].id;
      } else {
        const newFo = await pool.query(
          `INSERT INTO fournisseurs (client_id, nom) VALUES ($1, 'AUTO') RETURNING id`,
          [userId]
        );
        autoFournisseurId = newFo.rows[0].id;
      }
    }

    const yearStr = String(new Date().getFullYear()).slice(-2);

    for (const ing of ingRows) {
      const quantiteConsumed = -(parseFloat(ing.portion) * qty);

      if (actId) {
        await pool.query(
          `INSERT INTO stock_entreprise_daily (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (activite_id, ingredient_id, date_appro, type_appro)
           DO UPDATE SET quantite = stock_entreprise_daily.quantite + EXCLUDED.quantite, fournisseur_id = EXCLUDED.fournisseur_id, ref_facture = EXCLUDED.ref_facture`,
          [actId, ing.ingredient_id, dateAppro, quantiteConsumed, ing.last_prix || 0, produitNom, autoFournisseurId, `${ing.nom}-${yearStr}`]
        );
      } else {
        await pool.query(
          `INSERT INTO stock_client_daily (client_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (client_id, ingredient_id, date_appro, type_appro)
           DO UPDATE SET quantite = stock_client_daily.quantite + EXCLUDED.quantite, fournisseur_id = EXCLUDED.fournisseur_id, ref_facture = EXCLUDED.ref_facture`,
          [userId, ing.ingredient_id, dateAppro, quantiteConsumed, ing.last_prix || 0, produitNom, autoFournisseurId, `${ing.nom}-${yearStr}`]
        );
      }
    }

    // 5. Recalculate totalQuantite for current month
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let totalRes;
    if (actId) {
      totalRes = await pool.query(
        `SELECT COALESCE(SUM(quantite), 0) AS total
         FROM stock_produits_transformes
         WHERE produit_id = $1 AND activite_id = $2
           AND EXTRACT(MONTH FROM date_appro) = $3 AND EXTRACT(YEAR FROM date_appro) = $4`,
        [produitId, actId, currentMonth, currentYear]
      );
    } else {
      totalRes = await pool.query(
        `SELECT COALESCE(SUM(quantite), 0) AS total
         FROM stock_produits_transformes
         WHERE produit_id = $1 AND client_id = $2
           AND EXTRACT(MONTH FROM date_appro) = $3 AND EXTRACT(YEAR FROM date_appro) = $4`,
        [produitId, userId, currentMonth, currentYear]
      );
    }

    res.json({
      id: sptId,
      produitId,
      dateAppro,
      quantite: qty,
      prixCalcule,
      prixPartiel,
      totalQuantite: parseFloat(totalRes.rows[0].total),
    });
  } catch (err) {
    console.error('[saveStockPT]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── updateSeuilMinPT ─────────────────────────────────────────────────────────
// PUT /api/stock/pt/:produitId/seuil-min
// Body: { seuilMin }
const updateSeuilMinPT = async (req, res) => {
  const userId = req.user.id;
  const produitId = parseInt(req.params.produitId);
  const { seuilMin } = req.body;

  try {
    const result = await pool.query(
      `UPDATE produits SET seuil_min_pt = $1 WHERE id = $2 AND client_id = $3 RETURNING id, seuil_min_pt`,
      [seuilMin !== undefined ? seuilMin : null, produitId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ message: 'Produit introuvable ou accès refusé' });
    }

    res.json({ produitId, seuilMin: result.rows[0].seuil_min_pt });
  } catch (err) {
    console.error('[updateSeuilMinPT]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const setLinkedIngredient = async (req, res) => {
  const produitId = parseInt(req.params.id);
  const { ingredientId } = req.body;
  try {
    const ownerRes = await pool.query(
      `SELECT id FROM produits WHERE id = $1 AND (client_id = $2 OR activite_id IN (SELECT id FROM activites WHERE entreprise_id IN (SELECT id FROM profil_entreprise WHERE client_id = $2)))`,
      [produitId, req.user.id]
    );
    if (ownerRes.rows.length === 0) return res.status(403).json({ message: 'Produit introuvable ou accès refusé' });
    await pool.query(
      `UPDATE produits SET linked_ingredient_id = $1 WHERE id = $2`,
      [ingredientId ?? null, produitId]
    );
    res.json({ produitId, linkedIngredientId: ingredientId ?? null });
  } catch (err) {
    console.error('[setLinkedIngredient]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  toggleStockIngredient,
  deleteStockPTHistory,
  getStockPT,
  getStockPTHistory,
  saveStockPT,
  updateSeuilMinPT,
  setLinkedIngredient,
};
