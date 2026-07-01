const pool = require('../config/database');
const { withTransaction } = require('../utils/db');

// ─── toggleStockIngredient ────────────────────────────────────────────────────
// POST /api/produits/:id/toggle-stock-ingredient
// Body: { activiteId? }  — if provided, toggle per-activité; otherwise toggle global boolean (indép)
const toggleStockIngredient = async (req, res) => {
  const produitId = parseInt(req.params.id);
  const clientId = req.user.gerant_parent_id || req.user.id;
  const { activiteId } = req.body;
  const actId = activiteId ? parseInt(activiteId) : null;

  try {
    // Verify product belongs to this client
    const ownerRes = await pool.query(
      `SELECT id, is_stock_ingredient FROM produits WHERE id = $1 AND client_id = $2`,
      [produitId, clientId]
    );
    if (ownerRes.rows.length === 0) {
      return res.status(403).json({ message: 'Produit introuvable ou accès refusé' });
    }

    if (actId) {
      // ── Entreprise mode: per-activité toggle via produit_activite_stock ──
      // Un produit géré par le stock d'activité (PT / composé valorisé) ne doit pas
      // figurer aussi dans l'affectation d'affichage (réservée aux vendables d'activité).
      // Les deux tables restent ainsi mutuellement exclusives pour un même couple.
      await pool.query(
        `DELETE FROM produit_activite_affectation WHERE produit_id = $1 AND activite_id = $2`,
        [produitId, actId]
      );
      const existing = await pool.query(
        `SELECT id FROM produit_activite_stock WHERE produit_id = $1 AND activite_id = $2`,
        [produitId, actId]
      );

      if (existing.rows.length > 0) {
        // Toggle OFF — remove assignment for this activité
        await pool.query(
          `DELETE FROM produit_activite_stock WHERE produit_id = $1 AND activite_id = $2`,
          [produitId, actId]
        );
        // Remove from labo_pt_selections only if no other activité of that labo still has this PT
        const laboRow = await pool.query(
          `SELECT labo_id FROM activites WHERE id = $1 AND labo_id IS NOT NULL`,
          [actId]
        );
        if (laboRow.rows.length > 0) {
          const laboId = laboRow.rows[0].labo_id;
          const otherAct = await pool.query(
            `SELECT COUNT(*) AS cnt FROM produit_activite_stock pas
             JOIN activites a ON a.id = pas.activite_id
             WHERE pas.produit_id = $1 AND a.labo_id = $2`,
            [produitId, laboId]
          );
          if (parseInt(otherAct.rows[0].cnt) === 0) {
            await pool.query(
              `DELETE FROM labo_pt_selections WHERE produit_id = $1 AND labo_id = $2`,
              [produitId, laboId]
            );
          }
        }
        const countRes = await pool.query(
          `SELECT COUNT(*) AS cnt FROM stock_produits_transformes WHERE produit_id = $1 AND activite_id = $2`,
          [produitId, actId]
        );
        const historyCount = parseInt(countRes.rows[0].cnt);
        return res.json({ isStockIngredient: false, hadHistory: historyCount > 0, historyCount });
      } else {
        // Toggle ON — assign PT to this activité's stock
        const laboRes = await pool.query(
          `SELECT labo_id FROM activites WHERE id = $1 AND labo_id IS NOT NULL`,
          [actId]
        );
        const laboId = laboRes.rows.length > 0 ? laboRes.rows[0].labo_id : null;
        await pool.query(
          `INSERT INTO produit_activite_stock (produit_id, activite_id, labo_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [produitId, actId, laboId]
        );
        if (laboId) {
          await pool.query(
            `INSERT INTO labo_pt_selections (labo_id, produit_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [laboId, produitId]
          );
        }
        return res.json({ isStockIngredient: true, hadHistory: false, historyCount: 0 });
      }
    } else {
      // ── Indépendant mode: global boolean toggle ──
      const current = ownerRes.rows[0].is_stock_ingredient;
      const newValue = !current;
      await pool.query(`UPDATE produits SET is_stock_ingredient = $1 WHERE id = $2`, [newValue, produitId]);

      if (!newValue) {
        await pool.query(`DELETE FROM labo_pt_selections WHERE produit_id = $1`, [produitId]);
        const countRes = await pool.query(
          `SELECT COUNT(*) AS cnt FROM stock_produits_transformes WHERE produit_id = $1 AND client_id = $2`,
          [produitId, clientId]
        );
        const historyCount = parseInt(countRes.rows[0].cnt);
        return res.json({ isStockIngredient: false, hadHistory: historyCount > 0, historyCount });
      }

      const prodCtx = await pool.query(`SELECT activite_id FROM produits WHERE id = $1`, [produitId]);
      const activiteId = prodCtx.rows[0]?.activite_id;
      if (activiteId) {
        const laboRes = await pool.query(
          `SELECT labo_id FROM activites WHERE id = $1 AND labo_id IS NOT NULL`,
          [activiteId]
        );
        if (laboRes.rows.length > 0) {
          await pool.query(
            `INSERT INTO labo_pt_selections (labo_id, produit_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [laboRes.rows[0].labo_id, produitId]
          );
        }
      }
      return res.json({ isStockIngredient: true, hadHistory: false, historyCount: 0 });
    }
  } catch (err) {
    console.error('[toggleStockIngredient]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── deleteStockPTHistory ─────────────────────────────────────────────────────
// DELETE /api/produits/:id/stock-pt-history
// Query param: activiteId — if provided, scope cleanup to that activité only
const deleteStockPTHistory = async (req, res) => {
  const produitId = parseInt(req.params.id);
  const clientId = req.user.gerant_parent_id || req.user.id;
  const activiteId = req.query.activiteId ? parseInt(req.query.activiteId) : null;

  try {
    // Verify ownership
    const ownerRes = await pool.query(
      `SELECT id FROM produits WHERE id = $1 AND client_id = $2`,
      [produitId, clientId]
    );
    if (ownerRes.rows.length === 0) {
      return res.status(403).json({ message: 'Produit introuvable ou accès refusé' });
    }

    // Get product name (used as type_appro for consumption entries)
    const nomRes = await pool.query(`SELECT nom FROM produits WHERE id = $1`, [produitId]);
    const produitNom = nomRes.rows[0]?.nom;

    if (activiteId) {
      // ── Scoped to one activité ──
      await pool.query(
        `DELETE FROM stock_produits_transformes WHERE produit_id = $1 AND activite_id = $2`,
        [produitId, activiteId]
      );
      await pool.query(
        `DELETE FROM stock_entreprise_daily
         WHERE activite_id = $1
           AND ingredient_id IN (SELECT ingredient_id FROM produit_ingredients WHERE produit_id = $2)
           AND quantite < 0
           AND type_appro = 'PT'`,
        [activiteId, produitId]
      );
      // Labo PT stock for the labo linked to this activité
      const laboRes = await pool.query(
        `SELECT labo_id FROM activites WHERE id = $1 AND labo_id IS NOT NULL`,
        [activiteId]
      );
      if (laboRes.rows.length > 0) {
        const laboId = laboRes.rows[0].labo_id;
        await pool.query(
          `DELETE FROM stock_labo_pt_daily WHERE produit_id = $1 AND labo_id = $2`,
          [produitId, laboId]
        );
        await pool.query(
          `DELETE FROM labo_pt_selections WHERE produit_id = $1 AND labo_id = $2`,
          [produitId, laboId]
        );
      }
      await pool.query(
        `DELETE FROM produit_activite_stock WHERE produit_id = $1 AND activite_id = $2`,
        [produitId, activiteId]
      );
      await pool.query(
        `DELETE FROM inventaires WHERE produit_id = $1 AND activite_id = $2`,
        [produitId, activiteId]
      );
    } else {
      // ── Full cleanup across all activités ──
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
        [produitId, clientId]
      );
      await pool.query(
        `DELETE FROM stock_entreprise_daily
         WHERE activite_id IN (
           SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE pe.client_id = $1
         )
           AND ingredient_id IN (SELECT ingredient_id FROM produit_ingredients WHERE produit_id = $2)
           AND quantite < 0
           AND type_appro = 'PT'`,
        [clientId, produitId]
      );
      await pool.query(`DELETE FROM stock_labo_pt_daily WHERE produit_id = $1`, [produitId]);
      await pool.query(`DELETE FROM produit_activite_stock WHERE produit_id = $1`, [produitId]);
      await pool.query(`DELETE FROM labo_pt_selections WHERE produit_id = $1`, [produitId]);
      await pool.query(`DELETE FROM inventaires WHERE produit_id = $1`, [produitId]);
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error('[deleteStockPTHistory]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── getStockActivites ───────────────────────────────────────────────────────
// GET /api/produits/:id/stock-activites
const getStockActivites = async (req, res) => {
  const produitId = parseInt(req.params.id);
  const userId = req.user.id;
  try {
    const ownerRes = await pool.query(
      `SELECT id FROM produits WHERE id = $1 AND client_id = $2`,
      [produitId, userId]
    );
    if (ownerRes.rows.length === 0) {
      return res.status(403).json({ message: 'Produit introuvable ou accès refusé' });
    }
    const result = await pool.query(
      `SELECT activite_id FROM produit_activite_stock WHERE produit_id = $1 AND activite_id IS NOT NULL`,
      [produitId]
    );
    res.json(result.rows.map(r => r.activite_id));
  } catch (err) {
    console.error('[getStockActivites]', err);
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
            WHERE spt2.produit_id = p.id AND spt2.activite_id = $1 AND spt2.quantite > 0 AND spt2.prix_calcule IS NOT NULL
            ORDER BY spt2.date_appro DESC, spt2.id DESC LIMIT 1) AS last_date_appro,
           (SELECT spt2.prix_calcule FROM stock_produits_transformes spt2
            WHERE spt2.produit_id = p.id AND spt2.activite_id = $1 AND spt2.quantite > 0 AND spt2.prix_calcule IS NOT NULL
            ORDER BY spt2.date_appro DESC, spt2.id DESC LIMIT 1) AS last_prix_calcule
         FROM produits p
         JOIN produit_activite_stock pas ON pas.produit_id = p.id AND pas.activite_id = $1
         LEFT JOIN stock_produits_transformes spt ON spt.produit_id = p.id AND spt.activite_id = $1
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
            WHERE spt2.produit_id = p.id AND spt2.client_id = $1 AND spt2.quantite > 0 AND spt2.prix_calcule IS NOT NULL
            ORDER BY spt2.date_appro DESC, spt2.id DESC LIMIT 1) AS last_date_appro,
           (SELECT spt2.prix_calcule FROM stock_produits_transformes spt2
            WHERE spt2.produit_id = p.id AND spt2.client_id = $1 AND spt2.quantite > 0 AND spt2.prix_calcule IS NOT NULL
            ORDER BY spt2.date_appro DESC, spt2.id DESC LIMIT 1) AS last_prix_calcule
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
      // Mouvements de stock PT (gestion de stock) : production/consommation/transfert/vente
      // (stock_produits_transformes) + pertes (table séparée). type_appro pour la colonne TYPE ;
      // repli sur le signe pour les lignes legacy (négatif = vente, positif = transfert/réception).
      result = await pool.query(
        `SELECT * FROM (
           SELECT spt.date_appro AS d, spt.quantite, spt.prix_calcule AS prix,
                  COALESCE(spt.type_appro, CASE WHEN spt.quantite < 0 THEN 'vente' ELSE 'transfert' END) AS type
           FROM stock_produits_transformes spt
           WHERE spt.produit_id = $1 AND spt.activite_id = $2
           UNION ALL
           SELECT p.date_perte AS d, -p.quantite AS quantite, NULL::numeric AS prix, 'perte' AS type
           FROM pertes p
           WHERE p.produit_id = $1 AND p.activite_id = $2
         ) h
         ORDER BY d DESC, type LIMIT 30`,
        [produitId, actId]
      );
    } else {
      result = await pool.query(
        `SELECT spt.date_appro AS d, spt.quantite, spt.prix_calcule AS prix,
                COALESCE(spt.type_appro, CASE WHEN spt.quantite < 0 THEN 'vente' ELSE 'manuel' END) AS type
         FROM stock_produits_transformes spt
         WHERE spt.produit_id = $1 AND spt.client_id = $2
         ORDER BY spt.date_appro DESC`,
        [produitId, userId]
      );
    }

    res.json(result.rows.map(r => ({
      dateAppro: r.d,
      quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
      prixCalcule: r.prix !== null ? parseFloat(r.prix) : null,
      prixUnitaire: r.prix !== null ? parseFloat(r.prix) : null,
      typeAppro: r.type,
    })));
  } catch (err) {
    console.error('[getStockPTHistory]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── getPTRecipe ──────────────────────────────────────────────────────────────
// GET /api/stock/pt/:produitId/recipe?activiteId=X
const getPTRecipe = async (req, res) => {
  const userId = req.user.id;
  const produitId = parseInt(req.params.produitId);
  const actId = req.query.activiteId ? parseInt(req.query.activiteId) : null;

  try {
    let rows = [];
    if (actId) {
      const r = await pool.query(
        `SELECT pi.ingredient_id, pi.portion AS portion_standard,
                i.nom, u.nom AS unite, COALESCE(c.nom, 'Sans catégorie') AS categorie, i.categorie_id,
                (SELECT SUM(sed.quantite * sed.prix_unitaire) / NULLIF(SUM(sed.quantite), 0)
                 FROM stock_entreprise_daily sed
                 WHERE sed.ingredient_id = pi.ingredient_id AND sed.activite_id = $2
                   AND sed.quantite > 0 AND sed.prix_unitaire IS NOT NULL
                   AND sed.type_appro IN ('manuel', 'transfert')
                   AND sed.date_appro >= COALESCE(
                     (SELECT date_inventaire FROM inventaires
                      WHERE activite_id = $2 AND ingredient_id = pi.ingredient_id
                      ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
                     (SELECT MIN(date_appro) FROM stock_entreprise_daily
                      WHERE activite_id = $2 AND ingredient_id = pi.ingredient_id AND quantite > 0)
                   )
                ) AS last_prix
         FROM produit_ingredients pi
         JOIN articles i ON i.id = pi.ingredient_id
         JOIN unites u ON u.id = i.unite_id
         LEFT JOIN categories c ON c.id = i.categorie_id
         WHERE pi.produit_id = $1
         ORDER BY COALESCE(c.nom,''), i.nom`,
        [produitId, actId]
      );
      rows = r.rows;
    }

    res.json(rows.map((r) => ({
      ingredientId: r.ingredient_id,
      nom: r.nom,
      unite: r.unite,
      categorie: r.categorie,
      categorieId: r.categorie_id,
      portionStandard: parseFloat(r.portion_standard),
      lastPrix: r.last_prix != null ? parseFloat(r.last_prix) : null,
    })));
  } catch (err) {
    console.error('[getPTRecipe]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── saveStockPT ──────────────────────────────────────────────────────────────
// PUT /api/stock/pt/:produitId
// Body: { quantite, dateAppro, activiteId?, customPortions? }
const saveStockPT = async (req, res) => {
  const userId = req.user.id;
  const produitId = parseInt(req.params.produitId);
  const { quantite, dateAppro, activiteId, customPortions } = req.body;

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

    // Garde-fou (refonte Espace Produits) : un produit d'ORIGINE LABO s'approvisionne en activité
    // UNIQUEMENT par transfert depuis le labo — pas de fabrication / appro manuel côté activité.
    // (La fabrication au labo passe par updateLaboStock, qui reste autorisée.)
    if (actId) {
      const origineRes = await pool.query('SELECT origine FROM produits WHERE id = $1', [produitId]);
      if (origineRes.rows[0]?.origine === 'labo') {
        return res.status(400).json({
          message: "Ce produit est fabriqué au labo : côté activité il s'approvisionne uniquement par transfert, pas par appro manuel.",
        });
      }
    }

    // Fetch produit name for type_appro
    const produitRes = await pool.query(`SELECT nom FROM produits WHERE id = $1`, [produitId]);
    const produitNom = produitRes.rows[0]?.nom ?? 'PT';

    // 2. Calculate prix_calcule from recipe ingredients
    let ingRows = [];
    if (actId) {
      const ingRes = await pool.query(
        `SELECT pi.ingredient_id, pi.portion, i.nom as nom,
           (SELECT SUM(sed.quantite * sed.prix_unitaire) / NULLIF(SUM(sed.quantite), 0)
            FROM stock_entreprise_daily sed
            WHERE sed.ingredient_id = pi.ingredient_id AND sed.activite_id = $2
              AND sed.quantite > 0 AND sed.prix_unitaire IS NOT NULL
              AND sed.type_appro IN ('manuel', 'transfert')
              AND sed.date_appro >= COALESCE(
                (SELECT date_inventaire FROM inventaires
                 WHERE activite_id = $2 AND ingredient_id = pi.ingredient_id
                 ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
                (SELECT MIN(date_appro) FROM stock_entreprise_daily
                 WHERE activite_id = $2 AND ingredient_id = pi.ingredient_id AND quantite > 0)
              )
           ) AS last_prix
         FROM produit_ingredients pi
         JOIN articles i ON i.id = pi.ingredient_id
         WHERE pi.produit_id = $1`,
        [produitId, actId]
      );
      ingRows = ingRes.rows;
    }

    // Sous-PT de composition + dernier prix courant (réception/production positive) du sous-PT en activité
    let spRows = [];
    if (actId) {
      const spRes = await pool.query(
        `SELECT psp.sous_produit_id, psp.portion, p.nom AS sp_nom,
           (SELECT spt.prix_calcule FROM stock_produits_transformes spt
             WHERE spt.produit_id = psp.sous_produit_id AND spt.activite_id = $2
               AND spt.quantite > 0 AND spt.prix_calcule IS NOT NULL
             ORDER BY spt.date_appro DESC, spt.id DESC LIMIT 1) AS last_prix
         FROM produit_sous_produits psp
         JOIN produits p ON p.id = psp.sous_produit_id
         WHERE psp.produit_id = $1`,
        [produitId, actId]
      );
      spRows = spRes.rows;
    }

    // Build custom portions maps (articles ET sous-PT cohabitent dans le même tableau customPortions)
    const customPortionsMap = {};
    const customSpMap = {};
    if (Array.isArray(customPortions)) {
      for (const cp of customPortions) {
        if (cp.sousProduitId != null) customSpMap[cp.sousProduitId] = parseFloat(cp.portionCustom);
        else if (cp.ingredientId != null) customPortionsMap[cp.ingredientId] = parseFloat(cp.portionCustom);
      }
    }

    let prixCalcule = 0;
    let prixPartiel = false;
    for (const ing of ingRows) {
      const portion = customPortionsMap[ing.ingredient_id] ?? parseFloat(ing.portion);
      if (ing.last_prix === null) {
        prixPartiel = true;
      } else {
        prixCalcule += portion * parseFloat(ing.last_prix);
      }
    }
    // Le coût du PT inclut aussi ses sous-PT de composition (dernier prix courant du sous-PT).
    for (const sp of spRows) {
      const portion = customSpMap[sp.sous_produit_id] ?? parseFloat(sp.portion);
      if (sp.last_prix === null) {
        prixPartiel = true;
      } else {
        prixCalcule += portion * parseFloat(sp.last_prix);
      }
    }

    // Override: prix = coût recette RÉCURSIF au PMP activité (source de vérité = affichage getStockEntreprise,
    // qui prend le prix de la dernière réception = cette ligne de production). On calcule aussi le coût
    // récursif de chaque sous-PT pour valoriser sa ligne de consommation. Repli sur le calcul par boucles.
    const spCosts = {};
    if (actId) {
      const { buildMpPriceMap, calculerCoutAvecPrixMap } = require('./produitsController');
      const ownerId = req.user.gerant_parent_id || req.user.id;
      try {
        const mpMap = await buildMpPriceMap(actId, ownerId);
        const [parentCout, ...spCoutList] = await Promise.all([
          calculerCoutAvecPrixMap(produitId, ownerId, mpMap),
          ...spRows.map((sp) => calculerCoutAvecPrixMap(sp.sous_produit_id, ownerId, mpMap)),
        ]);
        const rc = parentCout && parentCout.cout_total != null ? parseFloat(parentCout.cout_total) : 0;
        if (rc > 0) prixCalcule = rc;
        spRows.forEach((sp, i) => {
          const c = spCoutList[i] && spCoutList[i].cout_total != null ? parseFloat(spCoutList[i].cout_total) : null;
          spCosts[sp.sous_produit_id] = c != null && c > 0 ? c : null;
        });
      } catch { /* repli sur prixCalcule des boucles */ }
    }

    const customPortionsJson = (Object.keys(customPortionsMap).length > 0 || Object.keys(customSpMap).length > 0)
      ? JSON.stringify(customPortions)
      : null;

    // 3. Résoudre/créer le fournisseur AUTO (idempotent) — avant la transaction.
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

    // 4. Écritures de stock ATOMIQUES : appro du PT (+) puis déductions des articles et
    //    des sous-PT de composition (-). Tout-ou-rien pour éviter un stock incohérent.
    let sptId;
    await withTransaction(async (client) => {
      const upsertResult = actId
        ? await client.query(
            `INSERT INTO stock_produits_transformes (produit_id, activite_id, date_appro, quantite, prix_calcule, custom_portions, type_appro)
             VALUES ($1, $2, $3, $4, $5, $6, 'manuel')
             RETURNING id`,
            [produitId, actId, dateAppro, qty, prixCalcule, customPortionsJson]
          )
        : await client.query(
            `INSERT INTO stock_produits_transformes (produit_id, client_id, date_appro, quantite, prix_calcule, custom_portions, type_appro)
             VALUES ($1, $2, $3, $4, $5, $6, 'manuel')
             RETURNING id`,
            [produitId, userId, dateAppro, qty, prixCalcule, customPortionsJson]
          );
      sptId = upsertResult.rows[0].id;

      if (actId) {
        // Déduction des ARTICLES de la recette (lignes négatives dans le stock d'articles).
        for (const ing of ingRows) {
          const portion = customPortionsMap[ing.ingredient_id] ?? parseFloat(ing.portion);
          const quantiteConsumed = -(portion * qty);
          await client.query(
            `INSERT INTO stock_entreprise_daily (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, type_appro, fournisseur_id, ref_facture, created_by)
             VALUES ($1, $2, $3, $4, $5, 0, $5, 'PT', $6, $7, $8)`,
            [actId, ing.ingredient_id, dateAppro, quantiteConsumed, ing.last_prix || 0, autoFournisseurId, `PT-${dateAppro}`, userId]
          );
        }
        // Déduction des SOUS-PT de composition (un seul niveau) : ligne négative, prix = coût récursif
        // du sous-PT, type_appro='PT' → réduit le stock du sous-PT sans être comptée comme une vente
        // (le prix n'entre pas dans le PMP : les CTE de moyenne filtrent quantite > 0).
        for (const sp of spRows) {
          const portion = customSpMap[sp.sous_produit_id] ?? parseFloat(sp.portion);
          const consumed = -(portion * qty);
          await client.query(
            `INSERT INTO stock_produits_transformes (produit_id, activite_id, date_appro, quantite, prix_calcule, type_appro)
             VALUES ($1, $2, $3, $4, $5, 'PT')`,
            [sp.sous_produit_id, actId, dateAppro, consumed, spCosts[sp.sous_produit_id] ?? null]
          );
        }
      }
    });

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

// ─── affecterActivites ────────────────────────────────────────────────────────
// POST /api/produits/:id/affecter-activites
// Body: { activiteIds: number[] }
// Links a vendable product to activités (display only — no stock effect)
const affecterActivites = async (req, res) => {
  const produitId = parseInt(req.params.id);
  const clientId = req.user.gerant_parent_id || req.user.id;
  const { activiteIds } = req.body;
  if (!Array.isArray(activiteIds)) return res.status(400).json({ message: 'activiteIds requis' });

  try {
    const ownerRes = await pool.query(
      `SELECT id FROM produits WHERE id = $1 AND client_id = $2`,
      [produitId, clientId]
    );
    if (ownerRes.rows.length === 0) return res.status(403).json({ message: 'Produit introuvable ou accès refusé' });

    // Replace full set: delete existing then insert new ones
    await pool.query(`DELETE FROM produit_activite_affectation WHERE produit_id = $1`, [produitId]);
    if (activiteIds.length > 0) {
      await pool.query(
        `INSERT INTO produit_activite_affectation (produit_id, activite_id)
         SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
        [produitId, activiteIds.map((a) => parseInt(a))]
      );
    }
    res.json({ ok: true, activiteIds });
  } catch (err) {
    console.error('[affecterActivites]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/produits/:id/parent-products
// Returns vendable products that include this PT as a sous-produit, with portions
const getParentProducts = async (req, res) => {
  const produitId = parseInt(req.params.id);
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const result = await pool.query(
      `SELECT p.id, p.nom as name, psp.portion
       FROM produit_sous_produits psp
       JOIN produits p ON p.id = psp.produit_id
       WHERE psp.sous_produit_id = $1 AND p.client_id = $2
       ORDER BY p.nom`,
      [produitId, clientId]
    );
    res.json(result.rows.map((r) => ({ id: r.id, name: r.name, portion: parseFloat(r.portion) })));
  } catch (err) {
    console.error('[getParentProducts]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/produits/:id/toggle-affectation  { activiteId }
// Toggle une activité dans produit_activite_affectation (produits vendables/suppléments).
// Maintient produits.activite_id cohérent avec l'ensemble d'affectation.
const toggleAffectation = async (req, res) => {
  const produitId = parseInt(req.params.id);
  const clientId = req.user.gerant_parent_id || req.user.id;
  const actId = req.body.activiteId ? parseInt(req.body.activiteId) : null;
  if (!actId) return res.status(400).json({ message: 'activiteId requis' });

  try {
    const ownerRes = await pool.query(
      `SELECT id FROM produits WHERE id = $1 AND client_id = $2`,
      [produitId, clientId]
    );
    if (ownerRes.rows.length === 0) return res.status(403).json({ message: 'Produit introuvable ou accès refusé' });

    const existing = await pool.query(
      `SELECT 1 FROM produit_activite_affectation WHERE produit_id = $1 AND activite_id = $2`,
      [produitId, actId]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        `DELETE FROM produit_activite_affectation WHERE produit_id = $1 AND activite_id = $2`,
        [produitId, actId]
      );
    } else {
      await pool.query(
        `INSERT INTO produit_activite_affectation (produit_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [produitId, actId]
      );
    }

    // Garder produits.activite_id aligné sur l'ensemble d'affectation
    await pool.query(
      `UPDATE produits
       SET activite_id = (SELECT MIN(activite_id) FROM produit_activite_affectation WHERE produit_id = $1)
       WHERE id = $1`,
      [produitId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[toggleAffectation]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Assignation produit ↔ labo (indicateur stock labo), calqué sur toggleAffectation.
const toggleLabo = async (req, res) => {
  const produitId = parseInt(req.params.id);
  const clientId = req.user.gerant_parent_id || req.user.id;
  const laboId = req.body.laboId ? parseInt(req.body.laboId) : null;
  if (!laboId) return res.status(400).json({ message: 'laboId requis' });

  try {
    const ownerRes = await pool.query(
      `SELECT id FROM produits WHERE id = $1 AND client_id = $2`,
      [produitId, clientId]
    );
    if (ownerRes.rows.length === 0) return res.status(403).json({ message: 'Produit introuvable ou accès refusé' });

    const laboRes = await pool.query(
      `SELECT l.id FROM labos l JOIN profil_entreprise pe ON l.entreprise_id = pe.id WHERE l.id = $1 AND pe.client_id = $2`,
      [laboId, clientId]
    );
    if (laboRes.rows.length === 0) return res.status(403).json({ message: 'Labo introuvable ou accès refusé' });

    const existing = await pool.query(
      `SELECT 1 FROM labo_pt_selections WHERE produit_id = $1 AND labo_id = $2`,
      [produitId, laboId]
    );
    if (existing.rows.length > 0) {
      await pool.query(`DELETE FROM labo_pt_selections WHERE produit_id = $1 AND labo_id = $2`, [produitId, laboId]);
    } else {
      await pool.query(`INSERT INTO labo_pt_selections (labo_id, produit_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [laboId, produitId]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[toggleLabo]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  toggleStockIngredient,
  deleteStockPTHistory,
  getStockActivites,
  getStockPT,
  getStockPTHistory,
  getPTRecipe,
  saveStockPT,
  updateSeuilMinPT,
  affecterActivites,
  toggleAffectation,
  toggleLabo,
  getParentProducts,
};
