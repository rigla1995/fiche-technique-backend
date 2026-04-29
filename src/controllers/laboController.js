const pool = require('../config/database');

const isoDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

const todayStr = () => new Date().toISOString().split('T')[0];

// ─── Ownership check helper ───────────────────────────────────────────────────

async function checkLaboOwner(laboId, userId) {
  const r = await pool.query(
    `SELECT l.id FROM labos l
     JOIN profil_entreprise pe ON l.entreprise_id = pe.id
     WHERE l.id = $1 AND pe.client_id = $2`,
    [laboId, userId]
  );
  return r.rows.length > 0;
}

// ─── Labo CRUD ────────────────────────────────────────────────────────────────

const createLabo = async (req, res) => {
  const { franchiseGroup, nom, referentTel, adresse } = req.body;
  if (!franchiseGroup || !nom || !referentTel)
    return res.status(400).json({ message: 'franchiseGroup, nom et referentTel requis' });
  try {
    const peRes = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [req.user.id]
    );
    if (peRes.rows.length === 0)
      return res.status(400).json({ message: 'Profil entreprise introuvable' });
    const entrepriseId = peRes.rows[0].id;

    const dup = await pool.query(
      'SELECT * FROM labos WHERE entreprise_id = $1 AND LOWER(franchise_group) = LOWER($2)',
      [entrepriseId, franchiseGroup]
    );
    // If a labo already exists for this franchise group (e.g. orphaned from a previous
    // failed attempt), return it so the caller can reuse it instead of being blocked.
    if (dup.rows.length > 0)
      return res.status(200).json(mapLabo(dup.rows[0]));

    const result = await pool.query(
      `INSERT INTO labos (entreprise_id, franchise_group, nom, referent_tel, adresse)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [entrepriseId, franchiseGroup, nom, referentTel, adresse || null]
    );
    const labo = result.rows[0];

    // Auto-create a labo fournisseur linked to all activities of this franchise group
    const existingFournisseur = await pool.query(
      'SELECT id FROM fournisseurs WHERE labo_id = $1', [labo.id]
    );
    if (existingFournisseur.rows.length === 0) {
      const fRes = await pool.query(
        `INSERT INTO fournisseurs (entreprise_id, nom, telephone, adresse, is_labo, labo_id)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
        [entrepriseId, nom, referentTel, adresse || null, labo.id]
      );
      const fournisseurId = fRes.rows[0].id;
      // Link to all existing franchise activities
      const acts = await pool.query(
        `SELECT id FROM activites WHERE entreprise_id = $1 AND LOWER(franchise_group) = LOWER($2)`,
        [entrepriseId, franchiseGroup]
      );
      for (const act of acts.rows) {
        await pool.query(
          `INSERT INTO fournisseur_activites (fournisseur_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [fournisseurId, act.id]
        );
      }
    }

    res.status(201).json(mapLabo(labo));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const listLabos = async (req, res) => {
  try {
    const peRes = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [req.user.id]
    );
    if (peRes.rows.length === 0) return res.json([]);
    const result = await pool.query(
      'SELECT * FROM labos WHERE entreprise_id = $1 ORDER BY nom',
      [peRes.rows[0].id]
    );
    res.json(result.rows.map(mapLabo));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getLaboById = async (req, res) => {
  const { laboId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });
    const r = await pool.query('SELECT * FROM labos WHERE id = $1', [laboId]);
    // Also return activities linked to this labo
    const acts = await pool.query(
      'SELECT id, nom, telephone, email, adresse FROM activites WHERE labo_id = $1 ORDER BY nom',
      [laboId]
    );
    res.json({ ...mapLabo(r.rows[0]), activites: acts.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

function mapLabo(row) {
  return {
    id: row.id,
    entrepriseId: row.entreprise_id,
    franchiseGroup: row.franchise_group,
    nom: row.nom,
    referentTel: row.referent_tel,
    adresse: row.adresse,
    createdAt: row.created_at,
  };
}

// ─── Labo Ingredient Selections ───────────────────────────────────────────────

const getLaboIngredients = async (req, res) => {
  const { laboId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const result = await pool.query(
      `SELECT i.id, i.nom, u.nom as unite, COALESCE(c.nom, 'Sans catégorie') as categorie,
              i.categorie_id,
              CASE WHEN lis.ingredient_id IS NOT NULL THEN true ELSE false END as selected
       FROM ingredients i
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN labo_ingredient_selections lis ON lis.ingredient_id = i.id AND lis.labo_id = $1
       ORDER BY c.nom NULLS LAST, i.nom`,
      [laboId]
    );
    res.json(result.rows.map((r) => ({
      id: r.id,
      nom: r.nom,
      unite: r.unite,
      categorie: r.categorie,
      categorieId: r.categorie_id ?? null,
      selected: r.selected,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const toggleLaboIngredient = async (req, res) => {
  const { laboId, ingredientId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const existing = await pool.query(
      'SELECT 1 FROM labo_ingredient_selections WHERE labo_id = $1 AND ingredient_id = $2',
      [laboId, ingredientId]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        'DELETE FROM labo_ingredient_selections WHERE labo_id = $1 AND ingredient_id = $2',
        [laboId, ingredientId]
      );
      res.json({ selected: false });
    } else {
      await pool.query(
        'INSERT INTO labo_ingredient_selections (labo_id, ingredient_id) VALUES ($1, $2)',
        [laboId, ingredientId]
      );
      res.json({ selected: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Labo Stock ───────────────────────────────────────────────────────────────

const getLaboStock = async (req, res) => {
  const { laboId } = req.params;
  const assignedOnly = req.query.assignedOnly === 'true';
  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const assignedFilter = assignedOnly
      ? `AND EXISTS (
           SELECT 1 FROM activite_ingredient_selections ais
           JOIN activites a ON ais.activite_id = a.id
           WHERE a.labo_id = $1 AND ais.ingredient_id = i.id
         )`
      : '';

    const result = await pool.query(
      `SELECT sub.ingredient_id, sub.nom, sub.unite_nom, sub.categorie,
              sub.quantite, sub.prix_unitaire, sub.date_appro, sub.seuil_min,
              COALESCE(tr.total_transfere, 0) as total_transfere,
              (SELECT sld2.fournisseur_id FROM stock_labo_daily sld2
               WHERE sld2.labo_id = $1 AND sld2.ingredient_id = sub.ingredient_id
               ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as last_fournisseur_id,
              (SELECT sld2.ref_facture FROM stock_labo_daily sld2
               WHERE sld2.labo_id = $1 AND sld2.ingredient_id = sub.ingredient_id
               ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as last_ref_facture
       FROM (
         SELECT DISTINCT ON (i.id) i.id as ingredient_id, i.nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie,
                sld.quantite, sld.prix_unitaire, sld.date_appro,
                lis.seuil_min
         FROM labo_ingredient_selections lis
         JOIN ingredients i ON lis.ingredient_id = i.id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         LEFT JOIN stock_labo_daily sld ON sld.ingredient_id = i.id AND sld.labo_id = $1
         WHERE lis.labo_id = $1 ${assignedFilter}
         ORDER BY i.id, sld.date_appro DESC NULLS LAST
       ) sub
       LEFT JOIN (
         SELECT ingredient_id, SUM(quantite) as total_transfere
         FROM labo_transfers
         WHERE labo_id = $1
         GROUP BY ingredient_id
       ) tr ON tr.ingredient_id = sub.ingredient_id
       ORDER BY sub.categorie NULLS LAST, sub.nom`,
      [laboId]
    );
    res.json(result.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite_nom,
      categorie: row.categorie,
      quantite: row.quantite !== null ? parseFloat(row.quantite) : null,
      prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
      dateAppro: isoDate(row.date_appro),
      seuilMin: row.seuil_min !== null ? parseFloat(row.seuil_min) : null,
      totalTransfere: parseFloat(row.total_transfere),
      lastFournisseurId: row.last_fournisseur_id ?? null,
      lastRefFacture: row.last_ref_facture ?? null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateLaboStock = async (req, res) => {
  const { laboId, ingredientId } = req.params;
  const { quantite, prixUnitaire, dateAppro, fournisseurId, refFacture } = req.body;
  const da = dateAppro || todayStr();

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    await pool.query(
      `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, fournisseur_id, ref_facture, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (labo_id, ingredient_id, date_appro)
       DO UPDATE SET quantite = $4, prix_unitaire = $5, fournisseur_id = $6, ref_facture = $7, updated_at = NOW()`,
      [laboId, ingredientId, da, quantite ?? null, prixUnitaire ?? null, fournisseurId || null, refFacture || null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getLaboStockHistory = async (req, res) => {
  const { laboId, ingredientId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const result = await pool.query(
      `SELECT date_appro, quantite, prix_unitaire, updated_at
       FROM stock_labo_daily
       WHERE labo_id = $1 AND ingredient_id = $2
       ORDER BY date_appro DESC LIMIT 10`,
      [laboId, ingredientId]
    );
    res.json(result.rows.map((r) => ({
      dateAppro: isoDate(r.date_appro),
      quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
      prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Transfers ────────────────────────────────────────────────────────────────

// POST /api/labo/:laboId/transfer
// Body: { dateTransfert, note, refFacture, transfers: [{ activiteId, ingredientId, quantite }] }
const createTransfer = async (req, res) => {
  const { laboId } = req.params;
  const { dateTransfert, note, refFacture, transfers } = req.body;

  if (!dateTransfert || !Array.isArray(transfers) || transfers.length === 0)
    return res.status(400).json({ message: 'dateTransfert et transfers requis' });

  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    // Verify all activites belong to this labo
    const activiteIds = [...new Set(transfers.map((t) => t.activiteId))];
    const actCheck = await pool.query(
      'SELECT id FROM activites WHERE labo_id = $1 AND id = ANY($2::int[])',
      [laboId, activiteIds]
    );
    if (actCheck.rows.length !== activiteIds.length)
      return res.status(400).json({ message: 'Une ou plusieurs activités invalides' });

    // Look up the labo fournisseur (is_labo=true for this labo)
    const laboFournisseurRes = await pool.query(
      'SELECT id FROM fournisseurs WHERE labo_id = $1 AND is_labo = true LIMIT 1',
      [laboId]
    );
    const laboFournisseurId = laboFournisseurRes.rows.length > 0 ? laboFournisseurRes.rows[0].id : null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const t of transfers) {
        const qty = parseFloat(t.quantite);
        if (!qty || qty <= 0) continue;

        // Get latest labo stock for this ingredient
        const latestRes = await client.query(
          `SELECT quantite, prix_unitaire FROM stock_labo_daily
           WHERE labo_id = $1 AND ingredient_id = $2
           ORDER BY date_appro DESC LIMIT 1`,
          [laboId, t.ingredientId]
        );
        const currentQty = latestRes.rows.length > 0 && latestRes.rows[0].quantite !== null
          ? parseFloat(latestRes.rows[0].quantite) : 0;
        const prixUnitaire = latestRes.rows.length > 0 ? latestRes.rows[0].prix_unitaire : null;

        // Deduct from labo stock for the transfer date.
        // On new entry: set to currentQty - qty. On conflict (same date): subtract qty.
        await client.query(
          `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (labo_id, ingredient_id, date_appro)
           DO UPDATE SET quantite = stock_labo_daily.quantite - $6, updated_at = NOW()`,
          [laboId, t.ingredientId, dateTransfert, currentQty - qty, prixUnitaire, qty]
        );

        // Add to activity stock (type=transfert) with labo fournisseur ref
        await client.query(
          `INSERT INTO stock_entreprise_daily
             (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'transfert', $6, $7, NOW())
           ON CONFLICT (activite_id, ingredient_id, date_appro, type_appro)
           DO UPDATE SET quantite = COALESCE(stock_entreprise_daily.quantite, 0) + $4,
                         fournisseur_id = $6, ref_facture = $7, updated_at = NOW()`,
          [t.activiteId, t.ingredientId, dateTransfert, qty, prixUnitaire, laboFournisseurId, refFacture || null]
        );

        // Record transfer
        await client.query(
          `INSERT INTO labo_transfers (labo_id, activite_id, ingredient_id, quantite, date_transfert, note, ref_facture)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [laboId, t.activiteId, t.ingredientId, qty, dateTransfert, note || null, refFacture || null]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getTransferHistory = async (req, res) => {
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId, activiteId } = req.query;
  const currentYear = new Date().getFullYear();

  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const params = [laboId, currentYear];
    let extraWhere = '';
    if (ingredientId) { params.push(ingredientId); extraWhere += ` AND lt.ingredient_id = $${params.length}`; }
    if (activiteId) { params.push(activiteId); extraWhere += ` AND lt.activite_id = $${params.length}`; }
    if (startDate) { params.push(startDate); extraWhere += ` AND lt.date_transfert >= $${params.length}`; }
    if (endDate) { params.push(endDate); extraWhere += ` AND lt.date_transfert <= $${params.length}`; }

    const result = await pool.query(
      `SELECT lt.id, lt.quantite, lt.date_transfert, lt.note, lt.ref_facture, lt.created_at,
              i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
              a.id as activite_id, a.nom as activite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom
       FROM labo_transfers lt
       JOIN ingredients i ON i.id = lt.ingredient_id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       JOIN activites a ON a.id = lt.activite_id
       WHERE lt.labo_id = $1 AND EXTRACT(YEAR FROM lt.date_transfert) = $2${extraWhere}
       ORDER BY lt.date_transfert DESC, lt.created_at DESC`,
      params
    );

    res.json(result.rows.map((r) => ({
      id: r.id,
      quantite: parseFloat(r.quantite),
      dateTransfert: isoDate(r.date_transfert),
      note: r.note,
      refFacture: r.ref_facture,
      createdAt: r.created_at,
      ingredientId: r.ingredient_id,
      ingredientNom: r.ingredient_nom,
      uniteNom: r.unite_nom,
      categorieNom: r.categorie_nom,
      activiteId: r.activite_id,
      activiteNom: r.activite_nom,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Labo Ingredient Seuil Min ───────────────────────────────────────────────

const updateLaboSeuilMin = async (req, res) => {
  const { laboId, ingredientId } = req.params;
  const { seuilMin } = req.body;
  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    await pool.query(
      `UPDATE labo_ingredient_selections SET seuil_min = $1
       WHERE labo_id = $2 AND ingredient_id = $3`,
      [seuilMin ?? null, laboId, ingredientId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Activity Ingredient Assignments ─────────────────────────────────────────

const getActivityAssignments = async (req, res) => {
  const { laboId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const ingRes = await pool.query(
      `SELECT i.id, i.nom, u.nom as unite, COALESCE(c.nom, 'Sans catégorie') as categorie
       FROM labo_ingredient_selections lis
       JOIN ingredients i ON lis.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE lis.labo_id = $1
       ORDER BY c.nom NULLS LAST, i.nom`,
      [laboId]
    );
    const actRes = await pool.query(
      'SELECT id, nom FROM activites WHERE labo_id = $1 ORDER BY nom',
      [laboId]
    );
    const assignRes = await pool.query(
      `SELECT ais.activite_id, ais.ingredient_id
       FROM activite_ingredient_selections ais
       JOIN activites a ON ais.activite_id = a.id
       WHERE a.labo_id = $1`,
      [laboId]
    );
    const assigned = new Set(assignRes.rows.map((r) => `${r.activite_id}:${r.ingredient_id}`));

    res.json({
      activites: actRes.rows.map((a) => ({ id: a.id, nom: a.nom })),
      ingredients: ingRes.rows.map((ing) => ({
        ingredientId: ing.id,
        nom: ing.nom,
        unite: ing.unite,
        categorie: ing.categorie,
        activities: actRes.rows.map((act) => ({
          activiteId: act.id,
          nom: act.nom,
          assigned: assigned.has(`${act.id}:${ing.id}`),
        })),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const toggleActivityAssignment = async (req, res) => {
  const { laboId, ingredientId } = req.params;
  const { activiteId } = req.body;
  if (!activiteId) return res.status(400).json({ message: 'activiteId requis' });
  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const actCheck = await pool.query(
      'SELECT id FROM activites WHERE id = $1 AND labo_id = $2',
      [activiteId, laboId]
    );
    if (actCheck.rows.length === 0)
      return res.status(400).json({ message: 'Activité invalide' });

    const existing = await pool.query(
      'SELECT 1 FROM activite_ingredient_selections WHERE activite_id = $1 AND ingredient_id = $2',
      [activiteId, ingredientId]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        'DELETE FROM activite_ingredient_selections WHERE activite_id = $1 AND ingredient_id = $2',
        [activiteId, ingredientId]
      );
      res.json({ assigned: false });
    } else {
      await pool.query(
        'INSERT INTO activite_ingredient_selections (activite_id, ingredient_id) VALUES ($1, $2)',
        [activiteId, ingredientId]
      );
      res.json({ assigned: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  createLabo, listLabos, getLaboById,
  getLaboIngredients, toggleLaboIngredient,
  getLaboStock, updateLaboStock, getLaboStockHistory,
  updateLaboSeuilMin,
  createTransfer, getTransferHistory,
  getActivityAssignments, toggleActivityAssignment,
};
