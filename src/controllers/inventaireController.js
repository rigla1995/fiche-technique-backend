const pool = require('../config/database');
const { ptCategorie } = require('../utils/stockUtils');
const ExcelJS = require('exceljs');
const { pushTo } = require('../services/sseService');
const { saveNotification } = require('./notificationController');
const { isoDate } = require('../utils/dateUtils');
const { buildInventaireHistoriquePdf } = require('../services/histoPdfService');

async function checkLaboOwner(laboId, userId) {
  const r = await pool.query(
    `SELECT l.id FROM labos l JOIN profil_entreprise pe ON l.entreprise_id = pe.id
     WHERE l.id = $1 AND pe.client_id = $2`,
    [laboId, userId]
  );
  return r.rows.length > 0;
}

async function checkActiviteOwner(activiteId, userId) {
  const r = await pool.query(
    `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id
     WHERE a.id = $1 AND pe.client_id = $2
     UNION
     SELECT a.id FROM activites a WHERE a.id = $1 AND a.client_id = $3`,
    [activiteId, userId, userId]
  );
  return r.rows.length > 0;
}

// ─── GET labo inventaire stock ────────────────────────────────────────────────

const getLaboInventaireStock = async (req, res) => {
  const { laboId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const ingRes = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie, lis.seuil_min
       FROM labo_ingredient_selections lis
       JOIN articles i ON lis.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE lis.labo_id = $1
       ORDER BY categorie NULLS LAST, i.nom`,
      [laboId]
    );

    // Last 5 inventaires per ingredient (for collapsible history)
    const recentInvRes = await pool.query(
      `SELECT id, ingredient_id, quantite_reelle, date_inventaire
       FROM inventaires
       WHERE labo_id = $1 AND ingredient_id IS NOT NULL
       ORDER BY ingredient_id, date_inventaire DESC, created_at DESC`,
      [laboId]
    );
    const recentInvMap = {};
    for (const r of recentInvRes.rows) {
      if (!recentInvMap[r.ingredient_id]) recentInvMap[r.ingredient_id] = [];
      if (recentInvMap[r.ingredient_id].length < 5) {
        recentInvMap[r.ingredient_id].push({
          id: r.id,
          qty: parseFloat(r.quantite_reelle),
          date: isoDate(r.date_inventaire),
        });
      }
    }
    // All distinct inventaire dates per ingredient (for alarm on any date)
    const allDatesRes = await pool.query(
      `SELECT ingredient_id, ARRAY_AGG(DISTINCT date_inventaire::text) as dates
       FROM inventaires
       WHERE labo_id = $1 AND ingredient_id IS NOT NULL
       GROUP BY ingredient_id`,
      [laboId]
    );
    const allDatesMap = {};
    for (const r of allDatesRes.rows) {
      allDatesMap[r.ingredient_id] = (r.dates || []).map(isoDate).filter(Boolean);
    }

    // PT products assigned to this labo via labo_pt_selections
    const ptRes = await pool.query(
      `SELECT lps.produit_id, p.nom, p.type, p.origine FROM labo_pt_selections lps
       JOIN produits p ON p.id = lps.produit_id
       WHERE lps.labo_id = $1 ORDER BY p.nom`,
      [laboId]
    );
    const recentPTInvRes = await pool.query(
      `SELECT id, produit_id, quantite_reelle, date_inventaire
       FROM inventaires WHERE labo_id = $1 AND produit_id IS NOT NULL
       ORDER BY produit_id, date_inventaire DESC, created_at DESC`,
      [laboId]
    );
    const recentPTInvMap = {};
    for (const r of recentPTInvRes.rows) {
      if (!recentPTInvMap[r.produit_id]) recentPTInvMap[r.produit_id] = [];
      if (recentPTInvMap[r.produit_id].length < 5)
        recentPTInvMap[r.produit_id].push({ id: r.id, qty: parseFloat(r.quantite_reelle), date: isoDate(r.date_inventaire) });
    }
    const allPTDatesRes = await pool.query(
      `SELECT produit_id, ARRAY_AGG(DISTINCT date_inventaire::text) as dates
       FROM inventaires WHERE labo_id = $1 AND produit_id IS NOT NULL GROUP BY produit_id`,
      [laboId]
    );
    const allPTDatesMap = {};
    for (const r of allPTDatesRes.rows)
      allPTDatesMap[r.produit_id] = (r.dates || []).map(isoDate).filter(Boolean);

    // Total stock per ingredient — unified formula (same as getLaboStock)
    const totalStockRes = await pool.query(
      `WITH last_inv AS (
         SELECT DISTINCT ON (ingredient_id)
           ingredient_id, quantite_reelle, date_inventaire
         FROM inventaires
         WHERE labo_id = $1 AND ingredient_id IS NOT NULL
           AND date_trunc('year', date_inventaire) = date_trunc('year', CURRENT_DATE)
         ORDER BY ingredient_id, date_inventaire DESC, created_at DESC
       ),
       post_appro AS (
         SELECT sld.ingredient_id, SUM(sld.quantite) as qty
         FROM stock_labo_daily sld
         JOIN last_inv li ON li.ingredient_id = sld.ingredient_id AND sld.date_appro >= li.date_inventaire
         WHERE sld.labo_id = $1 AND sld.type_appro != 'transfert'
           AND NOT (sld.type_appro = 'manuel' AND sld.quantite < 0)
         GROUP BY sld.ingredient_id
       ),
       post_transfer AS (
         SELECT lt.ingredient_id, SUM(lt.quantite) as qty
         FROM labo_transfers lt
         JOIN last_inv li ON li.ingredient_id = lt.ingredient_id AND lt.date_transfert >= li.date_inventaire
         WHERE lt.labo_id = $1 AND lt.ingredient_id IS NOT NULL
         GROUP BY lt.ingredient_id
       ),
       post_pertes AS (
         SELECT lp.ingredient_id, SUM(lp.quantite) as qty
         FROM labo_pertes lp
         JOIN last_inv li ON li.ingredient_id = lp.ingredient_id AND lp.date_perte >= li.date_inventaire
         WHERE lp.labo_id = $1 AND lp.ingredient_id IS NOT NULL
         GROUP BY lp.ingredient_id
       ),
       all_appro AS (
         SELECT ingredient_id, SUM(quantite) as qty
         FROM stock_labo_daily
         WHERE labo_id = $1 AND type_appro != 'transfert'
           AND NOT (type_appro = 'manuel' AND quantite < 0)
         GROUP BY ingredient_id
       ),
       all_transfer AS (
         SELECT ingredient_id, SUM(quantite) as qty
         FROM labo_transfers
         WHERE labo_id = $1 AND ingredient_id IS NOT NULL
         GROUP BY ingredient_id
       ),
       all_pertes AS (
         SELECT ingredient_id, SUM(quantite) as qty
         FROM labo_pertes
         WHERE labo_id = $1 AND ingredient_id IS NOT NULL
         GROUP BY ingredient_id
       )
       SELECT lis.ingredient_id,
         CASE WHEN li.ingredient_id IS NOT NULL
           THEN li.quantite_reelle + COALESCE(pa.qty,0) - COALESCE(pt.qty,0) - COALESCE(pp.qty,0)
           ELSE COALESCE(aa.qty,0) - COALESCE(atr.qty,0) - COALESCE(ap.qty,0)
         END as total_stock
       FROM labo_ingredient_selections lis
       LEFT JOIN last_inv li    ON li.ingredient_id  = lis.ingredient_id
       LEFT JOIN post_appro pa  ON pa.ingredient_id  = lis.ingredient_id
       LEFT JOIN post_transfer pt ON pt.ingredient_id = lis.ingredient_id
       LEFT JOIN post_pertes pp ON pp.ingredient_id  = lis.ingredient_id
       LEFT JOIN all_appro aa   ON aa.ingredient_id  = lis.ingredient_id
       LEFT JOIN all_transfer atr ON atr.ingredient_id = lis.ingredient_id
       LEFT JOIN all_pertes ap  ON ap.ingredient_id  = lis.ingredient_id
       WHERE lis.labo_id = $1`,
      [laboId]
    );
    const totalStockMap = {};
    for (const r of totalStockRes.rows) totalStockMap[r.ingredient_id] = parseFloat(r.total_stock) || 0;

    // Total stock for labo PT — unified formula
    const totalStockPTRes = await pool.query(
      `WITH last_inv AS (
         SELECT DISTINCT ON (produit_id)
           produit_id, quantite_reelle, date_inventaire
         FROM inventaires
         WHERE labo_id = $1 AND produit_id IS NOT NULL
           AND date_trunc('year', date_inventaire) = date_trunc('year', CURRENT_DATE)
         ORDER BY produit_id, date_inventaire DESC, created_at DESC
       ),
       post_appro AS (
         SELECT slpt.produit_id, SUM(slpt.quantite) as qty
         FROM stock_labo_pt_daily slpt
         JOIN last_inv li ON li.produit_id = slpt.produit_id AND slpt.date_appro >= li.date_inventaire
         WHERE slpt.labo_id = $1
         GROUP BY slpt.produit_id
       ),
       post_pertes AS (
         SELECT lp.produit_id, SUM(lp.quantite) as qty
         FROM labo_pertes lp
         JOIN last_inv li ON li.produit_id = lp.produit_id AND lp.date_perte >= li.date_inventaire
         WHERE lp.labo_id = $1 AND lp.produit_id IS NOT NULL
         GROUP BY lp.produit_id
       ),
       all_appro AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM stock_labo_pt_daily
         WHERE labo_id = $1
         GROUP BY produit_id
       ),
       all_pertes AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM labo_pertes
         WHERE labo_id = $1 AND produit_id IS NOT NULL
         GROUP BY produit_id
       )
       SELECT lps.produit_id,
         CASE WHEN li.produit_id IS NOT NULL
           THEN li.quantite_reelle + COALESCE(pa.qty,0) - COALESCE(pp.qty,0)
           ELSE COALESCE(aa.qty,0) - COALESCE(ap.qty,0)
         END as total_stock
       FROM labo_pt_selections lps
       LEFT JOIN last_inv li   ON li.produit_id  = lps.produit_id
       LEFT JOIN post_appro pa ON pa.produit_id  = lps.produit_id
       LEFT JOIN post_pertes pp ON pp.produit_id = lps.produit_id
       LEFT JOIN all_appro aa ON aa.produit_id  = lps.produit_id
       LEFT JOIN all_pertes ap ON ap.produit_id = lps.produit_id
       WHERE lps.labo_id = $1`,
      [laboId]
    );
    const totalStockPTMap = {};
    for (const r of totalStockPTRes.rows) totalStockPTMap[r.produit_id] = parseFloat(r.total_stock) || 0;

    const ingRows = ingRes.rows.map((r) => ({
      ingredientId: r.ingredient_id,
      nom: r.nom,
      unite: r.unite_nom,
      categorie: r.categorie,
      seuilMin: r.seuil_min !== null ? parseFloat(r.seuil_min) : null,
      totalStock: totalStockMap[r.ingredient_id] ?? null,
      recentInventaires: recentInvMap[r.ingredient_id] || [],
      inventaireDates: allDatesMap[r.ingredient_id] || [],
    }));
    const ptRows = ptRes.rows.map((r) => ({
      ingredientId: -(r.produit_id),
      produitId: r.produit_id,
      isPT: true,
      nom: r.nom,
      unite: 'unité',
      categorie: ptCategorie(r.type, r.origine),
      seuilMin: null,
      totalStock: totalStockPTMap[r.produit_id] ?? null,
      recentInventaires: recentPTInvMap[r.produit_id] || [],
      inventaireDates: allPTDatesMap[r.produit_id] || [],
    }));
    res.json([...ingRows, ...ptRows]);
  } catch (err) {
    console.error('[getLaboInventaireStock]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── POST save labo inventaire ────────────────────────────────────────────────

const saveLaboInventaire = async (req, res) => {
  const { laboId } = req.params;
  const { dateInventaire, entries } = req.body;
  if (!dateInventaire || !Array.isArray(entries) || entries.length === 0)
    return res.status(400).json({ message: 'dateInventaire et entries[] requis' });
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const ingEntries = entries.filter((e) => e.ingredientId >= 0);
    const ptEntries  = entries.filter((e) => e.ingredientId < 0);

    const client = await pool.connect();
    let upserted = [];
    try {
      await client.query('BEGIN');

      if (ingEntries.length > 0) {
        const r = await client.query(
          `INSERT INTO inventaires (labo_id, ingredient_id, quantite_reelle, date_inventaire, note, created_by)
           SELECT $1, UNNEST($2::int[]), UNNEST($3::numeric[]), $4, UNNEST($5::text[]), $6
           ON CONFLICT (labo_id, ingredient_id, date_inventaire)
             WHERE labo_id IS NOT NULL AND ingredient_id IS NOT NULL
           DO UPDATE SET quantite_reelle = EXCLUDED.quantite_reelle, note = EXCLUDED.note,
                         updated_at = NOW(), created_by = EXCLUDED.created_by
           RETURNING id, ingredient_id, quantite_reelle, date_inventaire, note, created_at`,
          [
            laboId,
            ingEntries.map((e) => e.ingredientId),
            ingEntries.map((e) => e.quantiteReelle),
            dateInventaire,
            ingEntries.map((e) => e.note || null),
            req.user.id,
          ]
        );
        upserted = upserted.concat(r.rows);
      }

      if (ptEntries.length > 0) {
        const r = await client.query(
          `INSERT INTO inventaires (labo_id, produit_id, quantite_reelle, date_inventaire, note, created_by)
           SELECT $1, UNNEST($2::int[]), UNNEST($3::numeric[]), $4, UNNEST($5::text[]), $6
           ON CONFLICT (labo_id, produit_id, date_inventaire)
             WHERE labo_id IS NOT NULL AND produit_id IS NOT NULL
           DO UPDATE SET quantite_reelle = EXCLUDED.quantite_reelle, note = EXCLUDED.note,
                         updated_at = NOW(), created_by = EXCLUDED.created_by
           RETURNING id, produit_id, quantite_reelle, date_inventaire, note, created_at`,
          [
            laboId,
            ptEntries.map((e) => -(e.ingredientId)),
            ptEntries.map((e) => e.quantiteReelle),
            dateInventaire,
            ptEntries.map((e) => e.note || null),
            req.user.id,
          ]
        );
        upserted = upserted.concat(r.rows.map((row) => ({ ...row, ingredient_id: -(row.produit_id) })));
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (req.user.role === 'gerant' && req.user.gerant_parent_id) {
      const clientRes = await pool.query(
        `SELECT pe.client_id, l.nom as labo_nom FROM labos l
         JOIN profil_entreprise pe ON l.entreprise_id = pe.id WHERE l.id = $1`,
        [laboId]
      );
      if (clientRes.rows.length > 0) {
        const { client_id, labo_nom } = clientRes.rows[0];
        const payload = { eventType: 'new_inventaire', type: 'labo', notesAdmin: `Labo : ${labo_nom} — ${dateInventaire}` };
        pushTo(client_id, 'new_inventaire', payload);
        saveNotification(client_id, payload).catch(console.error);
      }
    }

    res.json(upserted.map((r) => ({
      id: r.id,
      ingredientId: r.ingredient_id,
      quantiteReelle: parseFloat(r.quantite_reelle),
      dateInventaire: isoDate(r.date_inventaire),
      note: r.note,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error('[saveLaboInventaire]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── GET activite inventaire stock ───────────────────────────────────────────

const getActiviteInventaireStock = async (req, res) => {
  const { activiteId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    const ingRes = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie, ais.seuil_min
       FROM activite_ingredient_selections ais
       JOIN articles i ON ais.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE ais.activite_id = $1
       ORDER BY categorie NULLS LAST, i.nom`,
      [activiteId]
    );

    const recentInvRes = await pool.query(
      `SELECT id, ingredient_id, quantite_reelle, date_inventaire
       FROM inventaires
       WHERE activite_id = $1 AND ingredient_id IS NOT NULL
       ORDER BY ingredient_id, date_inventaire DESC, created_at DESC`,
      [activiteId]
    );
    const recentInvMap = {};
    for (const r of recentInvRes.rows) {
      if (!recentInvMap[r.ingredient_id]) recentInvMap[r.ingredient_id] = [];
      if (recentInvMap[r.ingredient_id].length < 5) {
        recentInvMap[r.ingredient_id].push({
          id: r.id, qty: parseFloat(r.quantite_reelle), date: isoDate(r.date_inventaire),
        });
      }
    }
    const allDatesRes = await pool.query(
      `SELECT ingredient_id, ARRAY_AGG(DISTINCT date_inventaire::text) as dates
       FROM inventaires
       WHERE activite_id = $1 AND ingredient_id IS NOT NULL
       GROUP BY ingredient_id`,
      [activiteId]
    );
    const allDatesMap = {};
    for (const r of allDatesRes.rows) {
      allDatesMap[r.ingredient_id] = (r.dates || []).map(isoDate).filter(Boolean);
    }

    // PT products assigned to this activité's stock
    const ptRes = await pool.query(
      `SELECT p.id AS produit_id, p.nom, p.type, p.origine FROM produits p
       JOIN produit_activite_stock pas ON pas.produit_id = p.id AND pas.activite_id = $1
       ORDER BY p.nom`,
      [activiteId]
    );
    const recentPTInvRes = await pool.query(
      `SELECT id, produit_id, quantite_reelle, date_inventaire
       FROM inventaires
       WHERE activite_id = $1 AND produit_id IS NOT NULL
       ORDER BY produit_id, date_inventaire DESC, created_at DESC`,
      [activiteId]
    );
    const recentPTInvMap = {};
    for (const r of recentPTInvRes.rows) {
      if (!recentPTInvMap[r.produit_id]) recentPTInvMap[r.produit_id] = [];
      if (recentPTInvMap[r.produit_id].length < 5)
        recentPTInvMap[r.produit_id].push({ id: r.id, qty: parseFloat(r.quantite_reelle), date: isoDate(r.date_inventaire) });
    }
    const allPTDatesRes = await pool.query(
      `SELECT produit_id, ARRAY_AGG(DISTINCT date_inventaire::text) as dates
       FROM inventaires WHERE activite_id = $1 AND produit_id IS NOT NULL GROUP BY produit_id`,
      [activiteId]
    );
    const allPTDatesMap = {};
    for (const r of allPTDatesRes.rows)
      allPTDatesMap[r.produit_id] = (r.dates || []).map(isoDate).filter(Boolean);

    // Total stock per ingredient — unified formula (same as getStockEntreprise)
    const totalStockActRes = await pool.query(
      `WITH last_inv AS (
         SELECT DISTINCT ON (ingredient_id)
           ingredient_id, quantite_reelle, date_inventaire
         FROM inventaires
         WHERE activite_id = $1 AND ingredient_id IS NOT NULL
           AND date_trunc('year', date_inventaire) = date_trunc('year', CURRENT_DATE)
         ORDER BY ingredient_id, date_inventaire DESC, created_at DESC
       ),
       post_appro AS (
         SELECT sed.ingredient_id, SUM(sed.quantite) as qty
         FROM stock_entreprise_daily sed
         JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
         WHERE sed.activite_id = $1
         GROUP BY sed.ingredient_id
       ),
       post_pertes AS (
         SELECT p.ingredient_id, SUM(p.quantite) as qty
         FROM pertes p
         JOIN last_inv li ON li.ingredient_id = p.ingredient_id AND p.date_perte >= li.date_inventaire
         WHERE p.activite_id = $1 AND p.ingredient_id IS NOT NULL
         GROUP BY p.ingredient_id
       ),
       all_appro AS (
         SELECT ingredient_id, SUM(quantite) as qty
         FROM stock_entreprise_daily
         WHERE activite_id = $1
         GROUP BY ingredient_id
       ),
       all_pertes AS (
         SELECT ingredient_id, SUM(quantite) as qty
         FROM pertes
         WHERE activite_id = $1 AND ingredient_id IS NOT NULL
         GROUP BY ingredient_id
       )
       SELECT ais.ingredient_id,
         CASE WHEN li.ingredient_id IS NOT NULL
           THEN li.quantite_reelle + COALESCE(pa.qty,0) - COALESCE(pp.qty,0)
           ELSE COALESCE(aa.qty,0) - COALESCE(ap.qty,0)
         END as total_stock
       FROM activite_ingredient_selections ais
       LEFT JOIN last_inv li   ON li.ingredient_id = ais.ingredient_id
       LEFT JOIN post_appro pa ON pa.ingredient_id = ais.ingredient_id
       LEFT JOIN post_pertes pp ON pp.ingredient_id = ais.ingredient_id
       LEFT JOIN all_appro aa ON aa.ingredient_id = ais.ingredient_id
       LEFT JOIN all_pertes ap ON ap.ingredient_id = ais.ingredient_id
       WHERE ais.activite_id = $1`,
      [activiteId]
    );
    const totalStockActMap = {};
    for (const r of totalStockActRes.rows) totalStockActMap[r.ingredient_id] = parseFloat(r.total_stock) || 0;

    // Total stock for PT — unified formula (same as getStockEntreprise)
    const totalStockPTActRes = await pool.query(
      `WITH last_inv AS (
         SELECT DISTINCT ON (produit_id)
           produit_id, quantite_reelle, date_inventaire
         FROM inventaires
         WHERE activite_id = $1 AND produit_id IS NOT NULL
           AND date_trunc('year', date_inventaire) = date_trunc('year', CURRENT_DATE)
         ORDER BY produit_id, date_inventaire DESC, created_at DESC
       ),
       post_appro AS (
         SELECT spt.produit_id, SUM(spt.quantite) as qty
         FROM stock_produits_transformes spt
         JOIN last_inv li ON li.produit_id = spt.produit_id AND spt.date_appro >= li.date_inventaire
         WHERE spt.activite_id = $1
         GROUP BY spt.produit_id
       ),
       post_pertes AS (
         SELECT p.produit_id, SUM(p.quantite) as qty
         FROM pertes p
         JOIN last_inv li ON li.produit_id = p.produit_id AND p.date_perte >= li.date_inventaire
         WHERE p.activite_id = $1 AND p.produit_id IS NOT NULL
         GROUP BY p.produit_id
       ),
       all_appro AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM stock_produits_transformes
         WHERE activite_id = $1
         GROUP BY produit_id
       ),
       all_pertes AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM pertes
         WHERE activite_id = $1 AND produit_id IS NOT NULL
         GROUP BY produit_id
       ),
       pt_list AS (
         SELECT p.id AS produit_id FROM produits p
         JOIN produit_activite_stock pas ON pas.produit_id = p.id AND pas.activite_id = $1
       )
       SELECT pl.produit_id,
         CASE WHEN li.produit_id IS NOT NULL
           THEN li.quantite_reelle + COALESCE(pa.qty,0) - COALESCE(pp.qty,0)
           ELSE COALESCE(aa.qty,0) - COALESCE(ap.qty,0)
         END as total_stock
       FROM pt_list pl
       LEFT JOIN last_inv li   ON li.produit_id = pl.produit_id
       LEFT JOIN post_appro pa ON pa.produit_id = pl.produit_id
       LEFT JOIN post_pertes pp ON pp.produit_id = pl.produit_id
       LEFT JOIN all_appro aa ON aa.produit_id = pl.produit_id
       LEFT JOIN all_pertes ap ON ap.produit_id = pl.produit_id`,
      [activiteId]
    );
    const totalStockPTActMap = {};
    for (const r of totalStockPTActRes.rows) totalStockPTActMap[r.produit_id] = parseFloat(r.total_stock) || 0;

    const ingRows = ingRes.rows.map((r) => ({
      ingredientId: r.ingredient_id,
      nom: r.nom,
      unite: r.unite_nom,
      categorie: r.categorie,
      seuilMin: r.seuil_min !== null ? parseFloat(r.seuil_min) : null,
      totalStock: totalStockActMap[r.ingredient_id] ?? null,
      recentInventaires: recentInvMap[r.ingredient_id] || [],
      inventaireDates: allDatesMap[r.ingredient_id] || [],
    }));
    const ptRows = ptRes.rows.map((r) => ({
      ingredientId: -(r.produit_id),
      produitId: r.produit_id,
      isPT: true,
      nom: r.nom,
      unite: 'unité',
      categorie: ptCategorie(r.type, r.origine),
      seuilMin: null,
      totalStock: totalStockPTActMap[r.produit_id] ?? null,
      recentInventaires: recentPTInvMap[r.produit_id] || [],
      inventaireDates: allPTDatesMap[r.produit_id] || [],
    }));
    res.json([...ingRows, ...ptRows]);
  } catch (err) {
    console.error('[getActiviteInventaireStock]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── POST save activite inventaire ───────────────────────────────────────────

const saveActiviteInventaire = async (req, res) => {
  const { activiteId } = req.params;
  const { dateInventaire, entries } = req.body;
  if (!dateInventaire || !Array.isArray(entries) || entries.length === 0)
    return res.status(400).json({ message: 'dateInventaire et entries[] requis' });
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    const ingEntries = entries.filter((e) => e.ingredientId >= 0);
    const ptEntries  = entries.filter((e) => e.ingredientId < 0);

    const client = await pool.connect();
    let upserted = [];
    try {
      await client.query('BEGIN');

      if (ingEntries.length > 0) {
        const r = await client.query(
          `INSERT INTO inventaires (activite_id, ingredient_id, quantite_reelle, date_inventaire, note, created_by)
           SELECT $1, UNNEST($2::int[]), UNNEST($3::numeric[]), $4, UNNEST($5::text[]), $6
           ON CONFLICT (activite_id, ingredient_id, date_inventaire)
             WHERE activite_id IS NOT NULL AND ingredient_id IS NOT NULL
           DO UPDATE SET quantite_reelle = EXCLUDED.quantite_reelle, note = EXCLUDED.note,
                         updated_at = NOW(), created_by = EXCLUDED.created_by
           RETURNING id, ingredient_id, quantite_reelle, date_inventaire, note, created_at`,
          [
            activiteId,
            ingEntries.map((e) => e.ingredientId),
            ingEntries.map((e) => e.quantiteReelle),
            dateInventaire,
            ingEntries.map((e) => e.note || null),
            req.user.id,
          ]
        );
        upserted = upserted.concat(r.rows);
      }

      if (ptEntries.length > 0) {
        const r = await client.query(
          `INSERT INTO inventaires (activite_id, produit_id, quantite_reelle, date_inventaire, note, created_by)
           SELECT $1, UNNEST($2::int[]), UNNEST($3::numeric[]), $4, UNNEST($5::text[]), $6
           ON CONFLICT (activite_id, produit_id, date_inventaire)
             WHERE activite_id IS NOT NULL AND produit_id IS NOT NULL
           DO UPDATE SET quantite_reelle = EXCLUDED.quantite_reelle, note = EXCLUDED.note,
                         updated_at = NOW(), created_by = EXCLUDED.created_by
           RETURNING id, produit_id, quantite_reelle, date_inventaire, note, created_at`,
          [
            activiteId,
            ptEntries.map((e) => -(e.ingredientId)),
            ptEntries.map((e) => e.quantiteReelle),
            dateInventaire,
            ptEntries.map((e) => e.note || null),
            req.user.id,
          ]
        );
        upserted = upserted.concat(r.rows.map((row) => ({ ...row, ingredient_id: -(row.produit_id) })));
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (req.user.role === 'gerant' && req.user.gerant_parent_id) {
      const clientRes = await pool.query(
        `SELECT pe.client_id, a.nom as activite_nom FROM activites a
         JOIN profil_entreprise pe ON a.entreprise_id = pe.id WHERE a.id = $1`,
        [activiteId]
      );
      if (clientRes.rows.length > 0) {
        const { client_id, activite_nom } = clientRes.rows[0];
        const payload = { eventType: 'new_inventaire', type: 'activite', notesAdmin: `Activité : ${activite_nom} — ${dateInventaire}` };
        pushTo(client_id, 'new_inventaire', payload);
        saveNotification(client_id, payload).catch(console.error);
      }
    }

    res.json(upserted.map((r) => ({
      id: r.id,
      ingredientId: r.ingredient_id,
      quantiteReelle: parseFloat(r.quantite_reelle),
      dateInventaire: isoDate(r.date_inventaire),
      note: r.note,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error('[saveActiviteInventaire]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── GET historique inventaire (labo) ────────────────────────────────────────

const getLaboInventaireHistorique = async (req, res) => {
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId } = req.query;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const ingIdNumL = ingredientId ? Number(ingredientId) : null;
    const conditions = ['inv.labo_id = $1'];
    const params = [laboId];
    let idx = 2;
    if (startDate) { conditions.push(`inv.date_inventaire >= $${idx++}`); params.push(startDate); }
    if (endDate)   { conditions.push(`inv.date_inventaire <= $${idx++}`); params.push(endDate); }
    if (ingIdNumL && ingIdNumL > 0) { conditions.push(`inv.ingredient_id = $${idx++}`); params.push(ingIdNumL); }
    else if (ingIdNumL && ingIdNumL < 0) { conditions.push(`inv.produit_id = $${idx++}`); params.push(-ingIdNumL); }

    const result = await pool.query(
      `SELECT inv.id, inv.date_inventaire, inv.quantite_reelle, inv.note, inv.created_at, inv.updated_at, inv.created_by,
              inv.ingredient_id, inv.produit_id,
              COALESCE(i.nom, p.nom) as ingredient_nom,
              COALESCE(u.nom, 'unité') as unite_nom,
              COALESCE(c.nom, CASE WHEN inv.produit_id IS NOT NULL THEN (SELECT CASE WHEN pp.type = 'utilisable' THEN 'Produits Transformés Utilisables' WHEN pp.origine = 'labo' THEN 'Produits Composés Valorisés' ELSE 'Produits Transformés Vendables' END FROM produits pp WHERE pp.id = inv.produit_id) ELSE 'Sans catégorie' END) as categorie_nom,
              l.nom as labo_nom, ub.nom as created_by_nom
       FROM inventaires inv
       LEFT JOIN articles i ON i.id = inv.ingredient_id
       LEFT JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN produits p ON p.id = inv.produit_id
       LEFT JOIN labos l ON l.id = inv.labo_id
       LEFT JOIN utilisateurs ub ON ub.id = inv.created_by
       WHERE ${conditions.join(' AND ')} AND (inv.ingredient_id IS NOT NULL OR inv.produit_id IS NOT NULL)
       ORDER BY inv.date_inventaire DESC, inv.created_at DESC`,
      params
    );

    res.json(result.rows.map((r) => ({
      id: r.id,
      dateInventaire: isoDate(r.date_inventaire),
      quantiteReelle: parseFloat(r.quantite_reelle),
      note: r.note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      createdBy: r.created_by ?? null,
      createdByNom: r.created_by_nom ?? null,
      ingredientId: r.ingredient_id !== null ? r.ingredient_id : -(r.produit_id),
      isPT: r.produit_id !== null,
      ingredientNom: r.ingredient_nom,
      unite: r.unite_nom,
      categorie: r.categorie_nom,
      laboNom: r.labo_nom,
    })));
  } catch (err) {
    console.error('[getLaboInventaireHistorique]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── GET historique inventaire (activite) ────────────────────────────────────

const getActiviteInventaireHistorique = async (req, res) => {
  const { activiteId } = req.params;
  const { startDate, endDate, ingredientId } = req.query;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    const ingIdNum = ingredientId ? Number(ingredientId) : null;
    const conditions = ['inv.activite_id = $1'];
    const params = [activiteId];
    let idx = 2;
    if (startDate) { conditions.push(`inv.date_inventaire >= $${idx++}`); params.push(startDate); }
    if (endDate)   { conditions.push(`inv.date_inventaire <= $${idx++}`); params.push(endDate); }
    // PT product filter uses negative ingredientId convention
    if (ingIdNum && ingIdNum > 0) { conditions.push(`inv.ingredient_id = $${idx++}`); params.push(ingIdNum); }
    else if (ingIdNum && ingIdNum < 0) { conditions.push(`inv.produit_id = $${idx++}`); params.push(-ingIdNum); }
    // item filter: when no specific selection, include both ingredients and PT
    const itemFilter = (!ingIdNum || ingIdNum > 0) && (!ingIdNum || ingIdNum < 0)
      ? `(inv.ingredient_id IS NOT NULL OR inv.produit_id IS NOT NULL)`
      : ingIdNum > 0 ? `inv.ingredient_id IS NOT NULL` : `inv.produit_id IS NOT NULL`;

    const result = await pool.query(
      `SELECT inv.id, inv.date_inventaire, inv.quantite_reelle, inv.note, inv.created_at, inv.updated_at, inv.created_by,
              inv.ingredient_id, inv.produit_id,
              COALESCE(i.nom, p.nom) as ingredient_nom,
              COALESCE(u.nom, 'unité') as unite_nom,
              COALESCE(c.nom, CASE WHEN inv.produit_id IS NOT NULL THEN (SELECT CASE WHEN pp.type = 'utilisable' THEN 'Produits Transformés Utilisables' WHEN pp.origine = 'labo' THEN 'Produits Composés Valorisés' ELSE 'Produits Transformés Vendables' END FROM produits pp WHERE pp.id = inv.produit_id) ELSE 'Sans catégorie' END) as categorie_nom,
              a.nom as activite_nom, ub.nom as created_by_nom
       FROM inventaires inv
       LEFT JOIN articles i ON i.id = inv.ingredient_id
       LEFT JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN produits p ON p.id = inv.produit_id
       LEFT JOIN activites a ON a.id = inv.activite_id
       LEFT JOIN utilisateurs ub ON ub.id = inv.created_by
       WHERE ${conditions.join(' AND ')} AND (inv.ingredient_id IS NOT NULL OR inv.produit_id IS NOT NULL)
       ORDER BY inv.date_inventaire DESC, inv.created_at DESC`,
      params
    );

    res.json(result.rows.map((r) => ({
      id: r.id,
      dateInventaire: isoDate(r.date_inventaire),
      quantiteReelle: parseFloat(r.quantite_reelle),
      note: r.note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      createdBy: r.created_by ?? null,
      createdByNom: r.created_by_nom ?? null,
      ingredientId: r.ingredient_id !== null ? r.ingredient_id : -(r.produit_id),
      isPT: r.produit_id !== null,
      ingredientNom: r.ingredient_nom,
      unite: r.unite_nom,
      categorie: r.categorie_nom,
      activiteNom: r.activite_nom,
    })));
  } catch (err) {
    console.error('[getActiviteInventaireHistorique]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── PUT update inventaire entry ─────────────────────────────────────────────

const updateInventaireEntry = async (req, res) => {
  const { inventaireId } = req.params;
  const { quantiteReelle, note } = req.body;
  if (quantiteReelle === undefined || quantiteReelle === null)
    return res.status(400).json({ message: 'quantiteReelle requis' });
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const check = await pool.query(
      `SELECT inv.id, inv.created_by FROM inventaires inv
       LEFT JOIN labos l ON l.id = inv.labo_id
       LEFT JOIN activites a ON a.id = inv.activite_id
       LEFT JOIN profil_entreprise pe1 ON l.entreprise_id = pe1.id
       LEFT JOIN profil_entreprise pe2 ON a.entreprise_id = pe2.id
       WHERE inv.id = $1 AND (pe1.client_id = $2 OR pe2.client_id = $2 OR inv.client_id = $2)`,
      [inventaireId, clientId]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Inventaire introuvable' });
    if (req.user.role === 'gerant' && check.rows[0].created_by !== req.user.id)
      return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres enregistrements.' });

    const r = await pool.query(
      `UPDATE inventaires SET quantite_reelle = $1, note = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, ingredient_id, quantite_reelle, date_inventaire, note, updated_at`,
      [quantiteReelle, note !== undefined ? note : null, inventaireId]
    );
    const row = r.rows[0];
    res.json({
      id: row.id,
      ingredientId: row.ingredient_id,
      quantiteReelle: parseFloat(row.quantite_reelle),
      dateInventaire: isoDate(row.date_inventaire),
      note: row.note,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('[updateInventaireEntry]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Export Excel — labo inventaire historique ────────────────────────────────

const exportLaboInventaireExcel = async (req, res) => {
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').filter(Boolean) : []);

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const ingIdNumLE = ingredientId ? Number(ingredientId) : null;
    const conditions = ['inv.labo_id = $1'];
    const params = [laboId];
    let idx = 2;
    if (startDate) { conditions.push(`inv.date_inventaire >= $${idx++}`); params.push(startDate); }
    if (endDate)   { conditions.push(`inv.date_inventaire <= $${idx++}`); params.push(endDate); }
    if (ingIdNumLE && ingIdNumLE > 0) { conditions.push(`inv.ingredient_id = $${idx++}`); params.push(ingIdNumLE); }
    else if (ingIdNumLE && ingIdNumLE < 0) { conditions.push(`inv.produit_id = $${idx++}`); params.push(-ingIdNumLE); }

    const laboRes = await pool.query('SELECT nom FROM labos WHERE id = $1', [laboId]);
    const laboNom = laboRes.rows[0]?.nom || 'Labo';

    const result = await pool.query(
      `SELECT inv.id, inv.date_inventaire, inv.quantite_reelle, inv.note,
              COALESCE(i.nom, p.nom) as ingredient_nom,
              COALESCE(u.nom, 'unité') as unite_nom,
              COALESCE(c.nom, CASE WHEN inv.produit_id IS NOT NULL THEN (SELECT CASE WHEN pp.type = 'utilisable' THEN 'Produits Transformés Utilisables' WHEN pp.origine = 'labo' THEN 'Produits Composés Valorisés' ELSE 'Produits Transformés Vendables' END FROM produits pp WHERE pp.id = inv.produit_id) ELSE 'Sans catégorie' END) as categorie_nom
       FROM inventaires inv
       LEFT JOIN articles i ON i.id = inv.ingredient_id
       LEFT JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN produits p ON p.id = inv.produit_id
       WHERE ${conditions.join(' AND ')} AND (inv.ingredient_id IS NOT NULL OR inv.produit_id IS NOT NULL)
       ORDER BY inv.date_inventaire DESC, inv.created_at DESC`,
      params
    );

    const rows = result.rows;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    const sheet = workbook.addWorksheet(`Inventaire ${laboNom}`, { pageSetup: { paperSize: 9, orientation: 'landscape' } });

    const BLUE = '1F3864'; const WHITE = 'FFFFFF'; const ORANGE = 'F59E0B';
    const ALT = 'FFF7ED'; const GOLD = 'FFD700'; const TITLE_BG = '2E4A7A';
    const thin = { style: 'thin', color: { argb: 'B8CCE4' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const hdrFont = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
    const bodyFont = { name: 'Calibri', size: 10 };
    const fmtD = (d) => d ? d.split('-').reverse().join('/') : '—';

    const cols = [
      { header: 'Date', width: 12 },
      { header: 'Ingrédient', width: 26 },
      { header: 'Catégorie', width: 18 },
      { header: 'Qté réelle', width: 13 },
      { header: 'Unité', width: 9 },
      { header: 'Labo', width: 18 },
      { header: 'Note', width: 24 },
    ];
    sheet.columns = cols.map((c) => ({ width: c.width }));

    const titleText = `Historique Inventaire — ${laboNom}  —  DU : ${fmtD(startDate)}   AU : ${fmtD(endDate)}`;
    const titleRow = sheet.addRow([titleText, ...Array(cols.length - 1).fill('')]);
    sheet.mergeCells(1, 1, 1, cols.length);
    titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    const hdrRow = sheet.addRow(cols.map((c) => c.header));
    hdrRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = hdrFont;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    });
    hdrRow.height = 22;
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    rows.forEach((r, i) => {
      const qty = parseFloat(r.quantite_reelle);
      const isSelected = selectedSet.has(String(r.id));
      const dateStr = r.date_inventaire ? isoDate(r.date_inventaire).split('-').reverse().join('/') : '';
      const dataRow = sheet.addRow([dateStr, r.ingredient_nom, r.categorie_nom, qty, r.unite_nom, laboNom, r.note || '']);
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: c <= 3 ? 'left' : (c === 5 ? 'center' : c === 4 ? 'right' : 'left') };
      }
      dataRow.getCell(4).numFmt = '#,##0.000';
      dataRow.height = 16;
    });

    const totalRow = sheet.addRow(['TOTAL', '', '', rows.reduce((s, r) => s + parseFloat(r.quantite_reelle), 0), '', '', '']);
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(4).numFmt = '#,##0.000';
    totalRow.height = 18;

    sheet.addRow([]);
    const footerRow = sheet.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — Labo : ${laboNom} — ${rows.length} enregistrement(s)`]);
    footerRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };
    if (selectedSet.size > 0) {
      const noteRow = sheet.addRow([`⚠ ${selectedSet.size} inventaire(s) en surbrillance = sélectionnés`]);
      noteRow.getCell(1).font = { name: 'Calibri', bold: true, size: 9, color: { argb: ORANGE } };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Inventaire-${laboNom}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exportLaboInventaireExcel]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Export Excel — activite inventaire historique ────────────────────────────

const exportActiviteInventaireExcel = async (req, res) => {
  const { activiteId } = req.params;
  const { startDate, endDate, ingredientId, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').filter(Boolean) : []);

  try {
    const check = await pool.query(
      `SELECT a.id, a.nom FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });
    const activiteNom = check.rows[0].nom;

    const ingIdNum2 = ingredientId ? Number(ingredientId) : null;
    const conditions = ['inv.activite_id = $1'];
    const params = [activiteId];
    let idx = 2;
    if (startDate) { conditions.push(`inv.date_inventaire >= $${idx++}`); params.push(startDate); }
    if (endDate)   { conditions.push(`inv.date_inventaire <= $${idx++}`); params.push(endDate); }
    if (ingIdNum2 && ingIdNum2 > 0) { conditions.push(`inv.ingredient_id = $${idx++}`); params.push(ingIdNum2); }
    else if (ingIdNum2 && ingIdNum2 < 0) { conditions.push(`inv.produit_id = $${idx++}`); params.push(-ingIdNum2); }

    const result = await pool.query(
      `SELECT inv.id, inv.date_inventaire, inv.quantite_reelle, inv.note,
              COALESCE(i.nom, p.nom) as ingredient_nom,
              COALESCE(u.nom, 'unité') as unite_nom,
              COALESCE(c.nom, CASE WHEN inv.produit_id IS NOT NULL THEN (SELECT CASE WHEN pp.type = 'utilisable' THEN 'Produits Transformés Utilisables' WHEN pp.origine = 'labo' THEN 'Produits Composés Valorisés' ELSE 'Produits Transformés Vendables' END FROM produits pp WHERE pp.id = inv.produit_id) ELSE 'Sans catégorie' END) as categorie_nom
       FROM inventaires inv
       LEFT JOIN articles i ON i.id = inv.ingredient_id
       LEFT JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN produits p ON p.id = inv.produit_id
       WHERE ${conditions.join(' AND ')} AND (inv.ingredient_id IS NOT NULL OR inv.produit_id IS NOT NULL)
       ORDER BY inv.date_inventaire DESC, inv.created_at DESC`,
      params
    );

    const rows = result.rows;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    const sheet = workbook.addWorksheet(`Inventaire ${activiteNom}`, { pageSetup: { paperSize: 9, orientation: 'landscape' } });

    const BLUE = '1F3864'; const WHITE = 'FFFFFF'; const ORANGE = 'F59E0B';
    const ALT = 'FFF7ED'; const GOLD = 'FFD700'; const TITLE_BG = '2E4A7A';
    const thin = { style: 'thin', color: { argb: 'B8CCE4' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const hdrFont = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
    const bodyFont = { name: 'Calibri', size: 10 };
    const fmtD = (d) => d ? d.split('-').reverse().join('/') : '—';

    const cols = [
      { header: 'Date', width: 12 },
      { header: 'Ingrédient', width: 26 },
      { header: 'Catégorie', width: 18 },
      { header: 'Qté réelle', width: 13 },
      { header: 'Unité', width: 9 },
      { header: 'Activité', width: 20 },
      { header: 'Note', width: 24 },
    ];
    sheet.columns = cols.map((c) => ({ width: c.width }));

    const titleText = `Historique Inventaire — ${activiteNom}  —  DU : ${fmtD(startDate)}   AU : ${fmtD(endDate)}`;
    const titleRow = sheet.addRow([titleText, ...Array(cols.length - 1).fill('')]);
    sheet.mergeCells(1, 1, 1, cols.length);
    titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    const hdrRow = sheet.addRow(cols.map((c) => c.header));
    hdrRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = hdrFont;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    });
    hdrRow.height = 22;
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    rows.forEach((r, i) => {
      const qty = parseFloat(r.quantite_reelle);
      const isSelected = selectedSet.has(String(r.id));
      const dateStr = r.date_inventaire ? isoDate(r.date_inventaire).split('-').reverse().join('/') : '';
      const dataRow = sheet.addRow([dateStr, r.ingredient_nom, r.categorie_nom, qty, r.unite_nom, activiteNom, r.note || '']);
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: c <= 3 ? 'left' : (c === 5 ? 'center' : c === 4 ? 'right' : 'left') };
      }
      dataRow.getCell(4).numFmt = '#,##0.000';
      dataRow.height = 16;
    });

    const totalRow = sheet.addRow(['TOTAL', '', '', rows.reduce((s, r) => s + parseFloat(r.quantite_reelle), 0), '', '', '']);
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(4).numFmt = '#,##0.000';
    totalRow.height = 18;

    sheet.addRow([]);
    const footerRow = sheet.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — Activité : ${activiteNom} — ${rows.length} enregistrement(s)`]);
    footerRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Inventaire-${activiteNom}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exportActiviteInventaireExcel]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const inventaireHistoriqueQuery = async (pool, conditions, params) => {
  const result = await pool.query(
    `SELECT inv.id, inv.date_inventaire, inv.quantite_reelle, inv.note,
            COALESCE(i.nom, p.nom) as ingredient_nom,
            COALESCE(u.nom, 'unité') as unite_nom,
            COALESCE(c.nom, CASE WHEN inv.produit_id IS NOT NULL THEN (SELECT CASE WHEN pp.type = 'utilisable' THEN 'Produits Transformés Utilisables' WHEN pp.origine = 'labo' THEN 'Produits Composés Valorisés' ELSE 'Produits Transformés Vendables' END FROM produits pp WHERE pp.id = inv.produit_id) ELSE 'Sans catégorie' END) as categorie_nom
     FROM inventaires inv
     LEFT JOIN articles i ON i.id = inv.ingredient_id
     LEFT JOIN unites u ON u.id = i.unite_id
     LEFT JOIN categories c ON c.id = i.categorie_id
     LEFT JOIN produits p ON p.id = inv.produit_id
     WHERE ${conditions.join(' AND ')} AND (inv.ingredient_id IS NOT NULL OR inv.produit_id IS NOT NULL)
     ORDER BY inv.date_inventaire DESC, inv.created_at DESC`,
    params
  );
  return result.rows;
};

const exportLaboInventaireHistoriquePdf = async (req, res) => {
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').filter(Boolean) : []);
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });
    const laboRes = await pool.query('SELECT nom FROM labos WHERE id = $1', [laboId]);
    const laboNom = laboRes.rows[0]?.nom || 'Labo';
    const ingIdNum = ingredientId ? Number(ingredientId) : null;
    const conditions = ['inv.labo_id = $1'];
    const params = [laboId];
    let idx = 2;
    if (startDate) { conditions.push(`inv.date_inventaire >= $${idx++}`); params.push(startDate); }
    if (endDate)   { conditions.push(`inv.date_inventaire <= $${idx++}`); params.push(endDate); }
    if (ingIdNum && ingIdNum > 0) { conditions.push(`inv.ingredient_id = $${idx++}`); params.push(ingIdNum); }
    else if (ingIdNum && ingIdNum < 0) { conditions.push(`inv.produit_id = $${idx++}`); params.push(-ingIdNum); }
    let rows = await inventaireHistoriqueQuery(pool, conditions, params);
    if (selectedSet.size > 0) rows = rows.filter((r) => selectedSet.has(String(r.id)));
    await buildInventaireHistoriquePdf(res, rows, laboNom, { startDate, endDate });
  } catch (err) {
    console.error('[exportLaboInventaireHistoriquePdf]', err);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur serveur' });
  }
};

const exportActiviteInventaireHistoriquePdf = async (req, res) => {
  const { activiteId } = req.params;
  const { startDate, endDate, ingredientId, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').filter(Boolean) : []);
  try {
    const actRes = await pool.query(
      `SELECT a.nom FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    const activiteNom = actRes.rows[0]?.nom || 'Activité';
    const ingIdNum = ingredientId ? Number(ingredientId) : null;
    const conditions = ['inv.activite_id = $1'];
    const params = [activiteId];
    let idx = 2;
    if (startDate) { conditions.push(`inv.date_inventaire >= $${idx++}`); params.push(startDate); }
    if (endDate)   { conditions.push(`inv.date_inventaire <= $${idx++}`); params.push(endDate); }
    if (ingIdNum && ingIdNum > 0) { conditions.push(`inv.ingredient_id = $${idx++}`); params.push(ingIdNum); }
    else if (ingIdNum && ingIdNum < 0) { conditions.push(`inv.produit_id = $${idx++}`); params.push(-ingIdNum); }
    let rows = await inventaireHistoriqueQuery(pool, conditions, params);
    if (selectedSet.size > 0) rows = rows.filter((r) => selectedSet.has(String(r.id)));
    await buildInventaireHistoriquePdf(res, rows, activiteNom, { startDate, endDate });
  } catch (err) {
    console.error('[exportActiviteInventaireHistoriquePdf]', err);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getLaboInventaireStock,
  saveLaboInventaire,
  getActiviteInventaireStock,
  saveActiviteInventaire,
  getLaboInventaireHistorique,
  getActiviteInventaireHistorique,
  updateInventaireEntry,
  exportLaboInventaireExcel,
  exportActiviteInventaireExcel,
  exportLaboInventaireHistoriquePdf,
  exportActiviteInventaireHistoriquePdf,
};
