const pool = require('../config/database');
const ExcelJS = require('exceljs');
const { isoDate, todayStr } = require('../utils/dateUtils');
const { computeStockCourant, computeStockPTCourant } = require('../utils/stockUtils');
const { buildLaboHistoriqueApproPdf, buildTransferHistoriquePdf } = require('../services/histoPdfService');
const { upsertFacture } = require('../services/facturesService');

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
  const { nom, refLabo, referentTel, adresse, activityIds } = req.body;
  if (!nom || !refLabo)
    return res.status(400).json({ message: 'nom et refLabo requis' });
  try {
    const peRes = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [req.user.id]
    );
    if (peRes.rows.length === 0)
      return res.status(400).json({ message: 'Profil entreprise introuvable' });
    const entrepriseId = peRes.rows[0].id;

    // Check nom uniqueness
    const nomCheck = await pool.query(
      'SELECT id FROM labos WHERE entreprise_id = $1 AND LOWER(nom) = LOWER($2)',
      [entrepriseId, nom.trim()]
    );
    if (nomCheck.rows.length > 0)
      return res.status(409).json({ message: 'Un labo avec ce nom existe déjà' });

    // Check refLabo uniqueness
    const refCheck = await pool.query(
      'SELECT id FROM labos WHERE entreprise_id = $1 AND LOWER(ref_labo) = LOWER($2)',
      [entrepriseId, refLabo.trim()]
    );
    if (refCheck.rows.length > 0)
      return res.status(409).json({ message: 'Un labo avec cette référence existe déjà' });

    const tel = referentTel?.trim() || null;
    const result = await pool.query(
      `INSERT INTO labos (entreprise_id, nom, referent_tel, adresse, ref_labo)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [entrepriseId, nom.trim(), tel, adresse?.trim() || null, refLabo.trim()]
    );
    const labo = result.rows[0];

    // Auto-create a labo fournisseur
    const existingFournisseur = await pool.query(
      'SELECT id FROM fournisseurs WHERE labo_id = $1', [labo.id]
    );
    if (existingFournisseur.rows.length === 0) {
      const fRes = await pool.query(
        `INSERT INTO fournisseurs (entreprise_id, nom, telephone, adresse, is_labo, labo_id)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
        [entrepriseId, nom.trim(), tel, adresse?.trim() || null, labo.id]
      );
      const fournisseurId = fRes.rows[0].id;
      // Assign manually selected activities to this labo (standalone creation)
      if (activityIds && activityIds.length > 0) {
        await pool.query(
          'UPDATE activites SET labo_id = $1 WHERE id = ANY($2::int[]) AND entreprise_id = $3',
          [labo.id, activityIds, entrepriseId]
        );
        await pool.query(
          `INSERT INTO fournisseur_activites (fournisseur_id, activite_id)
           SELECT $1, id FROM activites WHERE id = ANY($2::int[]) AND entreprise_id = $3
           ON CONFLICT DO NOTHING`,
          [fournisseurId, activityIds, entrepriseId]
        );
        // Auto-import ingredients from assigned activities into the labo
        await pool.query(
          `INSERT INTO labo_ingredient_selections (labo_id, ingredient_id)
           SELECT DISTINCT $1::integer, ais.ingredient_id
           FROM activite_ingredient_selections ais
           WHERE ais.activite_id = ANY($2::int[])
           ON CONFLICT DO NOTHING`,
          [labo.id, activityIds]
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
    const clientId = req.user.gerant_parent_id || req.user.id;
    const peRes = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [clientId]
    );
    if (peRes.rows.length === 0) return res.json([]);
    const result = await pool.query(
      `SELECT l.*, COUNT(fl.fournisseur_id)::int AS fournisseur_count
       FROM labos l
       LEFT JOIN fournisseur_labos fl ON fl.labo_id = l.id
       WHERE l.entreprise_id = $1
       GROUP BY l.id
       ORDER BY l.nom`,
      [peRes.rows[0].id]
    );
    res.json(result.rows.map((r) => ({ ...mapLabo(r), fournisseurCount: r.fournisseur_count })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getLaboById = async (req, res) => {
  const { laboId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });
    const r = await pool.query('SELECT * FROM labos WHERE id = $1', [laboId]);
    // Also return activities linked to this labo
    const acts = await pool.query(
      'SELECT id, nom FROM activites WHERE labo_id = $1 ORDER BY nom',
      [laboId]
    );
    res.json({
      ...mapLabo(r.rows[0]),
      activites: acts.rows.map((a) => ({ id: a.id, nom: a.nom })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

function mapLabo(row) {
  return {
    id: row.id,
    entrepriseId: row.entreprise_id,
    nom: row.nom,
    refLabo: row.ref_labo || null,
    referentTel: row.referent_tel,
    adresse: row.adresse,
    createdAt: row.created_at,
  };
}

// ─── Labo Ingredient Selections ───────────────────────────────────────────────

const getLaboIngredients = async (req, res) => {
  const { laboId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const result = await pool.query(
      `SELECT i.id, i.nom, u.nom as unite, COALESCE(c.nom, 'Sans catégorie') as categorie,
              i.categorie_id,
              CASE WHEN lis.ingredient_id IS NOT NULL THEN true ELSE false END as selected
       FROM articles i
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
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
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
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
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
              sub.quantite_totale, sub.prix_unitaire, sub.taux_tva, sub.date_appro, sub.seuil_min,
              sub.cout_total, sub.recent_dates, sub.recent_transfer_dates,
              COALESCE(tr.total_transfere, 0) as total_transfere,
              (SELECT sld2.fournisseur_id FROM stock_labo_daily sld2
               WHERE sld2.labo_id = $1 AND sld2.ingredient_id = sub.ingredient_id AND sld2.type_appro = 'manuel' AND sld2.quantite > 0
               ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as last_fournisseur_id,
              (SELECT sld2.ref_facture FROM stock_labo_daily sld2
               WHERE sld2.labo_id = $1 AND sld2.ingredient_id = sub.ingredient_id AND sld2.type_appro = 'manuel' AND sld2.quantite > 0
               ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as last_ref_facture
       FROM (
         SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie,
                SUM(sld.quantite) as quantite_totale,
                (SELECT sld2.prix_unitaire FROM stock_labo_daily sld2
                 WHERE sld2.labo_id = $1 AND sld2.ingredient_id = i.id AND sld2.type_appro = 'manuel' AND sld2.quantite > 0
                 ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as prix_unitaire,
                (SELECT sld2.taux_tva FROM stock_labo_daily sld2
                 WHERE sld2.labo_id = $1 AND sld2.ingredient_id = i.id AND sld2.type_appro = 'manuel' AND sld2.quantite > 0 AND sld2.taux_tva IS NOT NULL
                 ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as taux_tva,
                (SELECT sld2.date_appro FROM stock_labo_daily sld2
                 WHERE sld2.labo_id = $1 AND sld2.ingredient_id = i.id AND sld2.type_appro = 'manuel' AND sld2.quantite > 0
                 ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as date_appro,
                ARRAY(SELECT DISTINCT sld2.date_appro FROM stock_labo_daily sld2
                      WHERE sld2.labo_id = $1 AND sld2.ingredient_id = i.id
                      ORDER BY sld2.date_appro DESC LIMIT 30) as recent_dates,
                ARRAY(SELECT DISTINCT lt2.date_transfert FROM labo_transfers lt2
                      WHERE lt2.labo_id = $1 AND lt2.ingredient_id = i.id
                      ORDER BY lt2.date_transfert DESC LIMIT 30) as recent_transfer_dates,
                lis.seuil_min,
                COALESCE(
                  AVG(sld.prix_unitaire) FILTER (WHERE date_trunc('month', sld.date_appro) = date_trunc('month', CURRENT_DATE))
                  * SUM(sld.quantite) FILTER (WHERE date_trunc('month', sld.date_appro) = date_trunc('month', CURRENT_DATE))
                , 0) as cout_total
         FROM labo_ingredient_selections lis
         JOIN articles i ON lis.ingredient_id = i.id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         LEFT JOIN stock_labo_daily sld ON sld.ingredient_id = i.id AND sld.labo_id = $1
         WHERE lis.labo_id = $1 ${assignedFilter}
         GROUP BY i.id, i.nom, u.nom, c.nom, lis.seuil_min
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
    // ── Ingredient baseline: last current-year inv + post-inv flows + year fallback ──
    const invBaselineRes = await pool.query(
      `WITH last_inv AS (
         SELECT DISTINCT ON (ingredient_id)
           ingredient_id, quantite_reelle, date_inventaire
         FROM inventaires
         WHERE labo_id = $1 AND ingredient_id IS NOT NULL
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
       ),
       post_pt_usage AS (
         SELECT sld.ingredient_id, SUM(ABS(sld.quantite)) as qty
         FROM stock_labo_daily sld
         JOIN last_inv li ON li.ingredient_id = sld.ingredient_id AND sld.date_appro >= li.date_inventaire
         WHERE sld.labo_id = $1 AND sld.quantite < 0 AND sld.type_appro NOT IN ('manuel', 'transfert')
         GROUP BY sld.ingredient_id
       ),
       year_pt_usage AS (
         SELECT ingredient_id, SUM(ABS(quantite)) as qty
         FROM stock_labo_daily
         WHERE labo_id = $1 AND quantite < 0 AND type_appro NOT IN ('manuel', 'transfert')
         GROUP BY ingredient_id
       ),
       prev_inv AS (
         SELECT ingredient_id, date_inventaire FROM (
           SELECT ingredient_id, date_inventaire,
             ROW_NUMBER() OVER (PARTITION BY ingredient_id ORDER BY date_inventaire DESC, created_at DESC) as rn
           FROM inventaires WHERE labo_id = $1 AND ingredient_id IS NOT NULL
         ) sub WHERE rn = 2
       ),
       first_appro AS (
         SELECT ingredient_id, MIN(date_appro) as first_date
         FROM stock_labo_daily WHERE labo_id = $1 AND type_appro = 'manuel' AND quantite > 0
         GROUP BY ingredient_id
       ),
       pmp_hist AS (
         SELECT sld.ingredient_id,
           SUM(sld.quantite * sld.prix_unitaire) / NULLIF(SUM(sld.quantite), 0) as pmp_ht,
           SUM(sld.quantite * COALESCE(sld.prix_unitaire_tva, sld.prix_unitaire)) / NULLIF(SUM(sld.quantite), 0) as pmp_tva
         FROM stock_labo_daily sld
         JOIN last_inv li ON li.ingredient_id = sld.ingredient_id
         LEFT JOIN prev_inv pi ON pi.ingredient_id = sld.ingredient_id
         LEFT JOIN first_appro fa ON fa.ingredient_id = sld.ingredient_id
         WHERE sld.labo_id = $1 AND sld.type_appro = 'manuel' AND sld.quantite > 0 AND sld.prix_unitaire IS NOT NULL
           AND sld.date_appro >= COALESCE(pi.date_inventaire, fa.first_date)
           AND sld.date_appro < li.date_inventaire
         GROUP BY sld.ingredient_id
       ),
       appro_cost_post AS (
         SELECT sld.ingredient_id,
           SUM(sld.quantite) as qty,
           SUM(sld.quantite * COALESCE(sld.prix_unitaire, 0)) as cost_ht,
           SUM(sld.quantite * COALESCE(sld.prix_unitaire_tva, sld.prix_unitaire, 0)) as cost_tva
         FROM stock_labo_daily sld
         JOIN last_inv li ON li.ingredient_id = sld.ingredient_id AND sld.date_appro >= li.date_inventaire
         WHERE sld.labo_id = $1 AND sld.type_appro = 'manuel' AND sld.quantite > 0
         GROUP BY sld.ingredient_id
       ),
       appro_cost_all AS (
         SELECT ingredient_id,
           SUM(quantite) as qty,
           SUM(quantite * COALESCE(prix_unitaire, 0)) as cost_ht,
           SUM(quantite * COALESCE(prix_unitaire_tva, prix_unitaire, 0)) as cost_tva
         FROM stock_labo_daily
         WHERE labo_id = $1 AND type_appro = 'manuel' AND quantite > 0
         GROUP BY ingredient_id
       )
       SELECT lis.ingredient_id,
              li.quantite_reelle            as inv_qty,
              li.date_inventaire            as inv_date,
              COALESCE(pa.qty, 0)           as post_appro_qty,
              COALESCE(pt.qty, 0)           as post_transfer_qty,
              COALESCE(pp.qty, 0)           as post_pertes_qty,
              COALESCE(ppu.qty, 0)          as post_pt_usage_qty,
              ph.pmp_ht                     as pmp_hist_ht,
              ph.pmp_tva                    as pmp_hist_tva,
              COALESCE(acp.qty, 0)          as appro_cost_post_qty,
              COALESCE(acp.cost_ht, 0)      as appro_cost_post_ht,
              COALESCE(acp.cost_tva, 0)     as appro_cost_post_tva,
              COALESCE(aa.qty, 0)           as all_appro_qty,
              COALESCE(atr.qty, 0)          as all_transfer_qty,
              COALESCE(ap.qty, 0)           as all_pertes_qty,
              COALESCE(apu.qty, 0)          as all_pt_usage_qty,
              COALESCE(aca.qty, 0)          as appro_cost_all_qty,
              COALESCE(aca.cost_ht, 0)      as appro_cost_all_ht,
              COALESCE(aca.cost_tva, 0)     as appro_cost_all_tva
       FROM labo_ingredient_selections lis
       LEFT JOIN last_inv li      ON li.ingredient_id  = lis.ingredient_id
       LEFT JOIN post_appro pa    ON pa.ingredient_id  = lis.ingredient_id
       LEFT JOIN post_transfer pt ON pt.ingredient_id  = lis.ingredient_id
       LEFT JOIN post_pertes pp   ON pp.ingredient_id  = lis.ingredient_id
       LEFT JOIN post_pt_usage ppu ON ppu.ingredient_id = lis.ingredient_id
       LEFT JOIN pmp_hist ph       ON ph.ingredient_id  = lis.ingredient_id
       LEFT JOIN appro_cost_post acp ON acp.ingredient_id = lis.ingredient_id
       LEFT JOIN all_appro aa    ON aa.ingredient_id  = lis.ingredient_id
       LEFT JOIN all_transfer atr ON atr.ingredient_id = lis.ingredient_id
       LEFT JOIN all_pertes ap   ON ap.ingredient_id  = lis.ingredient_id
       LEFT JOIN year_pt_usage apu ON apu.ingredient_id = lis.ingredient_id
       LEFT JOIN appro_cost_all aca ON aca.ingredient_id = lis.ingredient_id
       WHERE lis.labo_id = $1`,
      [laboId]
    );
    const invBaselineMap = {};
    for (const r of invBaselineRes.rows) {
      invBaselineMap[r.ingredient_id] = {
        hasInv: r.inv_qty !== null,
        invQty: r.inv_qty !== null ? parseFloat(r.inv_qty) : 0,
        invDate: r.inv_date ? isoDate(r.inv_date) : null,
        postApproQty: parseFloat(r.post_appro_qty) || 0,
        postTransferQty: parseFloat(r.post_transfer_qty) || 0,
        postPertesQty: parseFloat(r.post_pertes_qty) || 0,
        postPtUsageQty: parseFloat(r.post_pt_usage_qty) || 0,
        pmpHistHT: r.pmp_hist_ht !== null ? parseFloat(r.pmp_hist_ht) : null,
        pmpHistTTC: r.pmp_hist_tva !== null ? parseFloat(r.pmp_hist_tva) : null,
        approCostPostQty: parseFloat(r.appro_cost_post_qty) || 0,
        approCostPostHT: parseFloat(r.appro_cost_post_ht) || 0,
        approCostPostTTC: parseFloat(r.appro_cost_post_tva) || 0,
        allApproQty: parseFloat(r.all_appro_qty) || 0,
        allTransferQty: parseFloat(r.all_transfer_qty) || 0,
        allPertesQty: parseFloat(r.all_pertes_qty) || 0,
        allPtUsageQty: parseFloat(r.all_pt_usage_qty) || 0,
        approCostAllQty: parseFloat(r.appro_cost_all_qty) || 0,
        approCostAllHT: parseFloat(r.appro_cost_all_ht) || 0,
        approCostAllTTC: parseFloat(r.appro_cost_all_tva) || 0,
      };
    }

    const ingredientRows = result.rows.map((row) => {
      const totalTransfere = parseFloat(row.total_transfere);
      const b = invBaselineMap[row.ingredient_id] || {};
      const quantiteRaw = b.hasInv
        ? b.invQty + b.postApproQty - b.postTransferQty - b.postPertesQty
        : b.allApproQty - b.allTransferQty - b.allPertesQty;
      const quantite = Math.round(quantiteRaw * 1000) / 1000;
      const pertesDepuisInv = b.hasInv ? b.postPertesQty : b.allPertesQty;
      const ptUsageDepuisInv = b.hasInv ? b.postPtUsageQty : b.allPtUsageQty;
      const transfertsDepuisInv = b.hasInv ? b.postTransferQty : b.allTransferQty;
      let coutTotal = 0;
      let coutTotalTTC = 0;
      let pmpUnitHT = null;
      if (b.hasInv) {
        const coutInvHT = (b.invQty > 0 && b.pmpHistHT !== null) ? b.invQty * b.pmpHistHT : 0;
        const coutInvTTC = (b.invQty > 0 && b.pmpHistTTC !== null) ? b.invQty * b.pmpHistTTC : (b.invQty > 0 && b.pmpHistHT !== null) ? b.invQty * b.pmpHistHT : 0;
        const totalCostInHT = coutInvHT + (b.approCostPostHT || 0);
        const totalCostInTTC = coutInvTTC + (b.approCostPostTTC || 0);
        const totalQtyIn = b.invQty + (b.approCostPostQty || 0);
        const pmpHT = totalQtyIn > 0 ? totalCostInHT / totalQtyIn : null;
        const pmpTTC = totalQtyIn > 0 ? totalCostInTTC / totalQtyIn : null;
        pmpUnitHT = pmpHT;
        coutTotal = pmpHT !== null && quantite > 0 ? Math.round(quantite * pmpHT * 1000) / 1000 : 0;
        coutTotalTTC = pmpTTC !== null && quantite > 0 ? Math.round(quantite * pmpTTC * 1000) / 1000 : 0;
      } else {
        const pmpHT = b.approCostAllQty > 0 ? b.approCostAllHT / b.approCostAllQty : null;
        const pmpTTC = b.approCostAllQty > 0 ? b.approCostAllTTC / b.approCostAllQty : null;
        pmpUnitHT = pmpHT;
        coutTotal = pmpHT !== null && quantite > 0 ? Math.round(quantite * pmpHT * 1000) / 1000 : 0;
        coutTotalTTC = pmpTTC !== null && quantite > 0 ? Math.round(quantite * pmpTTC * 1000) / 1000 : 0;
      }
      return {
        ingredientId: row.ingredient_id,
        nom: row.nom,
        unite: row.unite_nom,
        categorie: row.categorie,
        quantite,
        prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
        tauxTva: row.taux_tva !== null ? parseFloat(row.taux_tva) : null,
        pmpUnitHT: pmpUnitHT !== null ? Math.round(pmpUnitHT * 1000) / 1000 : null,
        dateAppro: isoDate(row.date_appro),
        seuilMin: row.seuil_min !== null ? parseFloat(row.seuil_min) : null,
        coutTotal,
        coutTotalTTC,
        totalTransfere,
        lastFournisseurId: row.last_fournisseur_id ?? null,
        lastRefFacture: row.last_ref_facture ?? null,
        recentDates: (row.recent_dates || []).map(isoDate).filter(Boolean),
        recentTransferDates: (row.recent_transfer_dates || []).map(isoDate).filter(Boolean),
        isPT: false,
        lastInvDate: b.hasInv ? b.invDate : null,
        lastInvQty: b.hasInv ? b.invQty : null,
        pertesDepuisInv,
        ptUsageDepuisInv,
        transfertsDepuisInv,
      };
    });

    // ── PT products for this labo ──────────────────────────────────────────────
    const ptResult = await pool.query(`
      SELECT p.id as produit_id, p.nom,
        a.id as activite_id, a.nom as activite_nom,
        lps.seuil_min,
        COALESCE(SUM(slpt.quantite) FILTER (WHERE date_trunc('year', slpt.date_appro) = date_trunc('year', CURRENT_DATE)), 0) as total_quantite,
        COALESCE(
          AVG(slpt.prix_unitaire) FILTER (WHERE date_trunc('year', slpt.date_appro) = date_trunc('year', CURRENT_DATE) AND slpt.quantite > 0)
          * SUM(slpt.quantite) FILTER (WHERE date_trunc('year', slpt.date_appro) = date_trunc('year', CURRENT_DATE))
        , 0) as cout_total,
        (SELECT slpt2.prix_unitaire FROM stock_labo_pt_daily slpt2 WHERE slpt2.labo_id = $1 AND slpt2.produit_id = p.id ORDER BY slpt2.date_appro DESC LIMIT 1) as prix_unitaire,
        (SELECT slpt2.date_appro FROM stock_labo_pt_daily slpt2 WHERE slpt2.labo_id = $1 AND slpt2.produit_id = p.id ORDER BY slpt2.date_appro DESC LIMIT 1) as date_appro,
        ARRAY(SELECT DISTINCT slpt2.date_appro FROM stock_labo_pt_daily slpt2
              WHERE slpt2.labo_id = $1 AND slpt2.produit_id = p.id
              ORDER BY slpt2.date_appro DESC LIMIT 30) as recent_dates,
        ARRAY(SELECT DISTINCT lt2.date_transfert FROM labo_transfers lt2
              WHERE lt2.labo_id = $1 AND lt2.produit_id = p.id
              ORDER BY lt2.date_transfert DESC LIMIT 30) as recent_transfer_dates,
        (
          COALESCE((SELECT SUM(pi2.portion * (
             SELECT sld2.prix_unitaire FROM stock_labo_daily sld2
             WHERE sld2.labo_id = $1 AND sld2.ingredient_id = pi2.ingredient_id
               AND sld2.type_appro = 'manuel' AND sld2.prix_unitaire IS NOT NULL
             ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1
          )) FROM produit_ingredients pi2 WHERE pi2.produit_id = p.id), 0)
          +
          COALESCE((SELECT SUM(psp.portion * (
             SELECT COALESCE(SUM(pi3.portion * (
                SELECT sld3.prix_unitaire FROM stock_labo_daily sld3
                WHERE sld3.labo_id = $1 AND sld3.ingredient_id = pi3.ingredient_id
                  AND sld3.type_appro = 'manuel' AND sld3.prix_unitaire IS NOT NULL
                ORDER BY sld3.date_appro DESC NULLS LAST LIMIT 1
             )), 0) FROM produit_ingredients pi3 WHERE pi3.produit_id = psp.sous_produit_id
          )) FROM produit_sous_produits psp WHERE psp.produit_id = p.id), 0)
        ) as prix_calcule
      FROM labo_pt_selections lps
      JOIN produits p ON p.id = lps.produit_id
      LEFT JOIN activites a ON a.id = p.activite_id
      LEFT JOIN stock_labo_pt_daily slpt ON slpt.produit_id = p.id AND slpt.labo_id = $1
      WHERE lps.labo_id = $1
      GROUP BY p.id, p.nom, a.id, a.nom, lps.seuil_min
      ORDER BY p.nom
    `, [laboId]);

    // PT baseline: last current-year inv + post-inv appros - post-inv pertes (or year fallback)
    const ptBaselineRes = await pool.query(
      `WITH last_inv AS (
         SELECT DISTINCT ON (produit_id)
           produit_id, quantite_reelle, date_inventaire
         FROM inventaires
         WHERE labo_id = $1 AND produit_id IS NOT NULL
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
       ),
       avg_prix_post AS (
         SELECT slpt.produit_id, AVG(slpt.prix_unitaire) as avg_prix
         FROM stock_labo_pt_daily slpt
         JOIN last_inv li ON li.produit_id = slpt.produit_id AND slpt.date_appro >= li.date_inventaire
         WHERE slpt.labo_id = $1 AND slpt.prix_unitaire IS NOT NULL
         GROUP BY slpt.produit_id
       ),
       avg_prix_all AS (
         SELECT produit_id, AVG(prix_unitaire) as avg_prix
         FROM stock_labo_pt_daily
         WHERE labo_id = $1 AND prix_unitaire IS NOT NULL
         GROUP BY produit_id
       )
       SELECT lps.produit_id,
              li.quantite_reelle       as inv_qty,
              li.date_inventaire       as inv_date,
              COALESCE(pa.qty, 0)      as post_appro_qty,
              COALESCE(pp.qty, 0)      as post_pertes_qty,
              app.avg_prix             as avg_prix_post,
              COALESCE(aa.qty, 0)      as all_appro_qty,
              COALESCE(ap.qty, 0)      as all_pertes_qty,
              apy.avg_prix             as avg_prix_all
       FROM labo_pt_selections lps
       LEFT JOIN last_inv li        ON li.produit_id  = lps.produit_id
       LEFT JOIN post_appro pa      ON pa.produit_id  = lps.produit_id
       LEFT JOIN post_pertes pp     ON pp.produit_id  = lps.produit_id
       LEFT JOIN avg_prix_post app  ON app.produit_id = lps.produit_id
       LEFT JOIN all_appro aa      ON aa.produit_id  = lps.produit_id
       LEFT JOIN all_pertes ap     ON ap.produit_id  = lps.produit_id
       LEFT JOIN avg_prix_all apy  ON apy.produit_id = lps.produit_id
       WHERE lps.labo_id = $1`,
      [laboId]
    );
    const ptBaselineMap = {};
    for (const r of ptBaselineRes.rows) {
      ptBaselineMap[r.produit_id] = {
        hasInv: r.inv_qty !== null,
        invQty: r.inv_qty !== null ? parseFloat(r.inv_qty) : 0,
        invDate: r.inv_date ? isoDate(r.inv_date) : null,
        postApproQty: parseFloat(r.post_appro_qty) || 0,
        postPertesQty: parseFloat(r.post_pertes_qty) || 0,
        avgPrixPost: r.avg_prix_post !== null ? parseFloat(r.avg_prix_post) : null,
        allApproQty: parseFloat(r.all_appro_qty) || 0,
        allPertesQty: parseFloat(r.all_pertes_qty) || 0,
        avgPrixAll: r.avg_prix_all !== null ? parseFloat(r.avg_prix_all) : null,
      };
    }

    const ptRows = ptResult.rows.map((row) => {
      const prixCalcule = row.prix_calcule !== null ? parseFloat(row.prix_calcule) : null;
      const prixUnitaire = row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : (prixCalcule && prixCalcule > 0 ? prixCalcule : null);
      const pb = ptBaselineMap[row.produit_id] || {};
      const quantite = pb.hasInv
        ? pb.invQty + pb.postApproQty - pb.postPertesQty
        : pb.allApproQty - pb.allPertesQty;
      const avgPrix = pb.hasInv ? (pb.avgPrixPost ?? pb.avgPrixAll ?? null) : (pb.avgPrixAll ?? null);
      const pertesDepuisInv = pb.hasInv ? pb.postPertesQty : pb.allPertesQty;
      return {
        ingredientId: -(row.produit_id),
        produitId: row.produit_id,
        isPT: true,
        nom: row.nom,
        unite: 'unité',
        categorie: 'Produits Transformés',
        activite: row.activite_nom || null,
        activiteId: row.activite_id ?? null,
        quantite,
        prixUnitaire,
        prixCalcule: prixCalcule && prixCalcule > 0 ? prixCalcule : null,
        dateAppro: isoDate(row.date_appro),
        seuilMin: row.seuil_min !== null ? parseFloat(row.seuil_min) : null,
        coutTotal: avgPrix !== null && quantite > 0 ? quantite * avgPrix : (prixCalcule && prixCalcule > 0 && quantite > 0 ? prixCalcule * quantite : 0),
        totalTransfere: 0,
        lastFournisseurId: null,
        lastRefFacture: null,
        recentDates: (row.recent_dates || []).map(isoDate).filter(Boolean),
        recentTransferDates: (row.recent_transfer_dates || []).map(isoDate).filter(Boolean),
        lastInvDate: pb.hasInv ? pb.invDate : null,
        lastInvQty: pb.hasInv ? pb.invQty : null,
        pertesDepuisInv,
        ptUsageDepuisInv: 0,
      };
    });

    res.json([...ingredientRows, ...ptRows]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateLaboStock = async (req, res) => {
  const { laboId } = req.params;
  const ingredientIdRaw = parseInt(req.params.ingredientId);
  const { quantite, prixUnitaire, dateAppro, fournisseurId, refFacture, customPortions, tauxTva, timbreFiscal = false } = req.body;
  const da = dateAppro || todayStr();

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    if (ingredientIdRaw < 0) {
      // PT product appro — auto-calculate prix from recipe using last labo ingredient prices
      const produitId = -ingredientIdRaw;
      const qty = parseFloat(quantite) || 0;

      // Get product name for type_appro label and recipe ingredients with last labo prices
      const [prodRes, ingRes] = await Promise.all([
        pool.query(`SELECT nom FROM produits WHERE id = $1`, [produitId]),
        pool.query(
          `SELECT pi.ingredient_id, pi.portion, i.nom as ing_nom,
             (SELECT SUM(sld.quantite * sld.prix_unitaire) / NULLIF(SUM(sld.quantite), 0)
              FROM stock_labo_daily sld
              WHERE sld.labo_id = $2 AND sld.ingredient_id = pi.ingredient_id
                AND sld.quantite > 0 AND sld.prix_unitaire IS NOT NULL
                AND sld.type_appro = 'manuel'
                AND sld.date_appro >= COALESCE(
                  (SELECT date_inventaire FROM inventaires
                   WHERE labo_id = $2 AND ingredient_id = pi.ingredient_id
                   ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
                  (SELECT MIN(date_appro) FROM stock_labo_daily
                   WHERE labo_id = $2 AND ingredient_id = pi.ingredient_id AND quantite > 0)
                )
             ) AS last_prix
           FROM produit_ingredients pi
           JOIN articles i ON i.id = pi.ingredient_id
           WHERE pi.produit_id = $1`,
          [produitId, laboId]
        ),
      ]);
      const produitNom = prodRes.rows[0]?.nom ?? 'PT';

      // Build custom portions map
      const customPortionsMap = {};
      if (Array.isArray(customPortions)) {
        for (const cp of customPortions) { customPortionsMap[cp.ingredientId] = parseFloat(cp.portionCustom); }
      }

      let prixCalcule = 0;
      for (const ing of ingRes.rows) {
        const portion = customPortionsMap[ing.ingredient_id] ?? parseFloat(ing.portion);
        if (ing.last_prix !== null) {
          prixCalcule += portion * parseFloat(ing.last_prix);
        }
      }
      const finalPrix = prixCalcule > 0 ? prixCalcule : (prixUnitaire ? parseFloat(prixUnitaire) : null);
      const customPortionsJson = Object.keys(customPortionsMap).length > 0 ? JSON.stringify(customPortions) : null;

      // Vérifier que chaque ingrédient de la recette a assez de stock
      if (ingRes.rows.length > 0 && qty > 0) {
        for (const ing of ingRes.rows) {
          const portion = customPortionsMap[ing.ingredient_id] ?? parseFloat(ing.portion);
          const needed  = portion * qty;
          const stockCourant = await computeStockCourant('labo', laboId, ing.ingredient_id);
          if (needed > stockCourant) {
            return res.status(422).json({
              message: `Stock insuffisant pour "${ing.ing_nom}" (recette)`,
              disponible: Math.max(0, stockCourant),
              demande: needed,
            });
          }
        }
      }

      // Save PT appro — always insert a new row (multiple rows per day allowed)
      await pool.query(
        `INSERT INTO stock_labo_pt_daily (labo_id, produit_id, date_appro, quantite, prix_unitaire, custom_portions, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [laboId, produitId, da, qty, finalPrix, customPortionsJson]
      );

      // Deduct recipe ingredients from labo ingredient stock (negative entries)
      if (ingRes.rows.length > 0 && qty > 0) {
        // Find or create AUTO fournisseur for this labo
        const laboEntRes = await pool.query(`SELECT entreprise_id FROM labos WHERE id = $1`, [laboId]);
        let autoFournisseurId = null;
        if (laboEntRes.rows.length > 0) {
          const entrepriseId = laboEntRes.rows[0].entreprise_id;
          const foRes = await pool.query(
            `SELECT id FROM fournisseurs WHERE entreprise_id = $1 AND nom = 'AUTO' LIMIT 1`, [entrepriseId]
          );
          if (foRes.rows.length > 0) {
            autoFournisseurId = foRes.rows[0].id;
          } else {
            const newFo = await pool.query(
              `INSERT INTO fournisseurs (entreprise_id, nom) VALUES ($1, 'AUTO') RETURNING id`, [entrepriseId]
            );
            autoFournisseurId = newFo.rows[0].id;
          }
        }
        const yearStr = String(new Date().getFullYear()).slice(-2);
        for (const ing of ingRes.rows) {
          const portion = customPortionsMap[ing.ingredient_id] ?? parseFloat(ing.portion);
          const consumed = -(portion * qty);
          await pool.query(
            `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, fournisseur_id, ref_facture, type_appro, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [laboId, ing.ingredient_id, da, consumed, ing.last_prix || 0, autoFournisseurId, `${ing.ing_nom}-${yearStr}`, 'PT']
          );
        }
      }

      return res.json({ success: true, prixCalcule: finalPrix });
    }

    const tva = tauxTva != null ? parseFloat(tauxTva) : 0;
    const prixUnitaireTva = prixUnitaire != null ? parseFloat(prixUnitaire) * (1 + tva / 100) : null;
    const laboInsRes = await pool.query(
      `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, fournisseur_id, ref_facture, taux_tva, prix_unitaire_tva, type_appro, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manuel', NOW())
       RETURNING id`,
      [laboId, ingredientIdRaw, da, quantite ?? null, prixUnitaire ?? null, fournisseurId || null, refFacture || null, tva, prixUnitaireTva]
    );
    if (refFacture) {
      const laboClientRes = await pool.query(
        `SELECT pe.client_id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE l.id = $1`,
        [laboId]
      );
      if (laboClientRes.rows.length > 0) {
        const laboClientId = laboClientRes.rows[0].client_id;
        const qty = parseFloat(quantite) || 0;
        const pu = parseFloat(prixUnitaire) || 0;
        const puTva = prixUnitaireTva != null ? parseFloat(prixUnitaireTva) : pu;
        const montantHT = qty * pu;
        const montantTva = tva != null ? qty * pu * (tva / 100) : 0;
        const montantTTC = qty * puTva;
        await upsertFacture(laboClientId, {
          refFacture,
          dateAppro: da,
          fournisseurId: fournisseurId || null,
          activiteId: null,
          laboId: parseInt(laboId),
          typeSource: 'manuel',
          montantHT,
          montantTva,
          montantTTC,
          timbreFiscal: !!timbreFiscal,
          createdBy: req.user.id,
          stockTable: 'stock_labo_daily',
          stockRowId: laboInsRes.rows[0].id,
        });
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getLaboStockHistory = async (req, res) => {
  const { laboId } = req.params;
  const ingredientIdRaw = parseInt(req.params.ingredientId);
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    if (ingredientIdRaw < 0) {
      const produitId = -ingredientIdRaw;
      const result = await pool.query(
        `SELECT date_appro, quantite, prix_unitaire
         FROM stock_labo_pt_daily
         WHERE labo_id = $1 AND produit_id = $2
         ORDER BY date_appro DESC LIMIT 10`,
        [laboId, produitId]
      );
      return res.json(result.rows.map((r) => ({
        dateAppro: isoDate(r.date_appro),
        quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
        prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
        refFacture: null,
        fournisseurNom: null,
      })));
    }

    const result = await pool.query(
      `SELECT sld.date_appro, sld.quantite, sld.prix_unitaire, sld.ref_facture,
              sld.type_appro, f.nom as fournisseur_nom, sld.taux_tva, sld.prix_unitaire_tva
       FROM stock_labo_daily sld
       LEFT JOIN fournisseurs f ON f.id = sld.fournisseur_id
       WHERE sld.labo_id = $1 AND sld.ingredient_id = $2
       ORDER BY sld.date_appro DESC LIMIT 10`,
      [laboId, ingredientIdRaw]
    );
    res.json(result.rows.map((r) => ({
      dateAppro: isoDate(r.date_appro),
      quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
      prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
      refFacture: r.ref_facture || null,
      typeAppro: r.type_appro || null,
      fournisseurNom: r.fournisseur_nom || null,
      tauxTva: r.taux_tva != null ? parseFloat(r.taux_tva) : null,
      prixUnitaireTva: r.prix_unitaire_tva != null ? parseFloat(r.prix_unitaire_tva) : null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Returns non-labo fournisseurs assigned to this labo (via fournisseur_labos)
const getLaboFournisseurs = async (req, res) => {
  const { laboId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const result = await pool.query(
      `SELECT f.id, f.nom, f.telephone
       FROM fournisseurs f
       JOIN fournisseur_labos fl ON fl.fournisseur_id = f.id
       WHERE fl.labo_id = $1 AND f.is_labo = false
       ORDER BY f.nom`,
      [laboId]
    );
    res.json(result.rows.map((r) => ({ id: r.id, nom: r.nom, telephone: r.telephone })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/labo/:laboId/fournisseurs/sync
// Body: { fournisseurIds: number[] }
const syncLaboFournisseurs = async (req, res) => {
  const { laboId } = req.params;
  const { fournisseurIds } = req.body;
  if (!Array.isArray(fournisseurIds)) return res.status(400).json({ message: 'fournisseurIds requis' });
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    await pool.query('DELETE FROM fournisseur_labos WHERE labo_id = $1', [laboId]);
    if (fournisseurIds.length > 0) {
      await pool.query(
        'INSERT INTO fournisseur_labos (fournisseur_id, labo_id) SELECT UNNEST($1::int[]), $2 ON CONFLICT DO NOTHING',
        [fournisseurIds, laboId]
      );
    }
    res.json({ ok: true });
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
  const { dateTransfert, note, refFacture, tauxTva, transfers } = req.body;

  if (!dateTransfert || !Array.isArray(transfers) || transfers.length === 0)
    return res.status(400).json({ message: 'dateTransfert et transfers requis' });

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
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

    // Vérification stock labo avant transaction (ingrédients + PT)
    const ingQtyMap = {};
    const ptQtyMap  = {};
    for (const t of transfers) {
      const ingId = parseInt(t.ingredientId);
      const qty   = parseFloat(t.quantite) || 0;
      if (qty <= 0) continue;
      if (ingId < 0) {
        const produitId = -ingId;
        ptQtyMap[produitId] = (ptQtyMap[produitId] || 0) + qty;
      } else {
        ingQtyMap[ingId] = (ingQtyMap[ingId] || 0) + qty;
      }
    }
    // Ingrédients
    for (const [ingId, totalQty] of Object.entries(ingQtyMap)) {
      const stockCourant = await computeStockCourant('labo', laboId, parseInt(ingId));
      if (totalQty > stockCourant) {
        const ingRow = await pool.query('SELECT nom FROM articles WHERE id = $1', [ingId]);
        const ingNom = ingRow.rows[0]?.nom ?? `ingrédient #${ingId}`;
        return res.status(422).json({
          message: `Stock insuffisant pour "${ingNom}"`,
          disponible: Math.max(0, stockCourant),
          demande: totalQty,
        });
      }
    }
    // Produits transformés
    for (const [produitId, totalQty] of Object.entries(ptQtyMap)) {
      const ptStock = await computeStockPTCourant('labo', laboId, parseInt(produitId));
      if (totalQty > ptStock) {
        const ptRow = await pool.query('SELECT nom FROM produits WHERE id = $1', [produitId]);
        const ptNom = ptRow.rows[0]?.nom ?? `PT #${produitId}`;
        return res.status(422).json({
          message: `Stock PT insuffisant pour "${ptNom}"`,
          disponible: Math.max(0, ptStock),
          demande: totalQty,
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const t of transfers) {
        const qty = parseFloat(t.quantite);
        if (!qty || qty <= 0) continue;

        const ingId = parseInt(t.ingredientId);

        if (ingId < 0) {
          // PT product transfer: deduct from stock_labo_pt_daily, add to stock_produits_transformes
          const produitId = -ingId;

          const latestPtRes = await client.query(
            `SELECT quantite, prix_unitaire FROM stock_labo_pt_daily
             WHERE labo_id = $1 AND produit_id = $2
             ORDER BY date_appro DESC LIMIT 1`,
            [laboId, produitId]
          );
          const ptPrix = latestPtRes.rows.length > 0 ? parseFloat(latestPtRes.rows[0].prix_unitaire || 0) : 0;

          // Deduct from labo PT stock (negative entry)
          await client.query(
            `INSERT INTO stock_labo_pt_daily (labo_id, produit_id, date_appro, quantite, updated_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [laboId, produitId, dateTransfert, -qty]
          );

          // Add to activité PT stock (stock_produits_transformes)
          await client.query(
            `INSERT INTO stock_produits_transformes (produit_id, activite_id, date_appro, quantite, prix_calcule)
             VALUES ($1, $2, $3, $4, $5)`,
            [produitId, t.activiteId, dateTransfert, qty, ptPrix]
          );

          // Record PT transfer
          await client.query(
            `INSERT INTO labo_transfers (labo_id, activite_id, produit_id, quantite, date_transfert, note, ref_facture, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [laboId, t.activiteId, produitId, qty, dateTransfert, note || null, refFacture || null, req.user.id]
          );
          continue;
        }

        // Regular ingredient transfer
        const prixUnit = t.prixUnitaire != null ? parseFloat(t.prixUnitaire) : null;
        const tva = tauxTva != null ? parseFloat(tauxTva) : 0;
        const prixUnitaireTva = prixUnit != null ? prixUnit * (1 + tva / 100) : null;

        await client.query(
          `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, type_appro, ref_facture, updated_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'manuel', $8, NOW(), $9)`,
          [laboId, ingId, dateTransfert, -qty, prixUnit, tva, prixUnitaireTva, refFacture || null, req.user.id]
        );

        await client.query(
          `INSERT INTO stock_entreprise_daily
             (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture, taux_tva, prix_unitaire_tva, updated_at, created_by)
           VALUES ($1, $2, $3, $4, $5, 'transfert', $6, $7, $8, $9, NOW(), $10)`,
          [t.activiteId, ingId, dateTransfert, qty, prixUnit, laboFournisseurId, refFacture || null, tva, prixUnitaireTva, req.user.id]
        );

        await client.query(
          `INSERT INTO labo_transfers (labo_id, activite_id, ingredient_id, quantite, date_transfert, note, ref_facture, prix_unitaire, taux_tva, prix_unitaire_tva, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [laboId, t.activiteId, ingId, qty, dateTransfert, note || null, refFacture || null, prixUnit, tva, prixUnitaireTva, req.user.id]
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
  const { startDate, endDate, ingredientId, activiteId, limit } = req.query;
  const currentYear = new Date().getFullYear();

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const ingIdNum = ingredientId ? parseInt(ingredientId, 10) : null;
    const isPTQuery = ingIdNum !== null && ingIdNum < 0;

    const params = [laboId, currentYear];
    let extraWhere = '';

    if (isPTQuery) {
      // Negative ingredientId means PT product with produit_id = ABS(ingredientId)
      const produitId = -ingIdNum;
      params.push(produitId);
      extraWhere += ` AND lt.produit_id = $${params.length}`;
    } else {
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND lt.ingredient_id = $${params.length}`; }
    }
    if (activiteId) { params.push(activiteId); extraWhere += ` AND lt.activite_id = $${params.length}`; }
    if (startDate) { params.push(startDate); extraWhere += ` AND lt.date_transfert >= $${params.length}`; }
    if (endDate) { params.push(endDate); extraWhere += ` AND lt.date_transfert <= $${params.length}`; }

    let result;
    if (isPTQuery) {
      result = await pool.query(
        `SELECT lt.id, lt.quantite, lt.date_transfert, lt.note, lt.ref_facture, lt.created_at,
                p.id as produit_id, p.nom as produit_nom,
                a.id as activite_id, a.nom as activite_nom
         FROM labo_transfers lt
         JOIN produits p ON p.id = lt.produit_id
         JOIN activites a ON a.id = lt.activite_id
         WHERE lt.labo_id = $1 AND EXTRACT(YEAR FROM lt.date_transfert) = $2${extraWhere}
         ORDER BY lt.date_transfert DESC, lt.created_at DESC${limit ? ` LIMIT ${parseInt(limit, 10)}` : ''}`,
        params
      );
      return res.json(result.rows.map((r) => ({
        id: r.id,
        quantite: parseFloat(r.quantite),
        dateTransfert: isoDate(r.date_transfert),
        note: r.note,
        refFacture: r.ref_facture,
        createdAt: r.created_at,
        ingredientId: -(r.produit_id),
        ingredientNom: r.produit_nom,
        uniteNom: 'unité',
        categorieNom: 'Produits Transformés',
        activiteId: r.activite_id,
        activiteNom: r.activite_nom,
      })));
    }

    result = await pool.query(
      `SELECT lt.id, lt.quantite, lt.date_transfert, lt.note, lt.ref_facture, lt.created_at,
              lt.prix_unitaire, lt.taux_tva, lt.prix_unitaire_tva,
              lt.created_by, ub.nom as created_by_nom,
              i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
              a.id as activite_id, a.nom as activite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom
       FROM labo_transfers lt
       JOIN articles i ON i.id = lt.ingredient_id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       JOIN activites a ON a.id = lt.activite_id
       LEFT JOIN utilisateurs ub ON ub.id = lt.created_by
       WHERE lt.labo_id = $1 AND EXTRACT(YEAR FROM lt.date_transfert) = $2${extraWhere}
       ORDER BY lt.date_transfert DESC, lt.created_at DESC${limit ? ` LIMIT ${parseInt(limit, 10)}` : ''}`,
      params
    );

    res.json(result.rows.map((r) => ({
      id: r.id,
      quantite: parseFloat(r.quantite),
      dateTransfert: isoDate(r.date_transfert),
      note: r.note,
      refFacture: r.ref_facture,
      createdAt: r.created_at,
      createdBy: r.created_by ?? null,
      createdByNom: r.created_by_nom ?? null,
      prixUnitaire: r.prix_unitaire != null ? parseFloat(r.prix_unitaire) : null,
      tauxTva: r.taux_tva != null ? parseFloat(r.taux_tva) : null,
      prixUnitaireTva: r.prix_unitaire_tva != null ? parseFloat(r.prix_unitaire_tva) : null,
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

// GET /api/labo/:laboId/historique
const getLaboHistorique = async (req, res) => {
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId, categorieId, fournisseurId, activiteId, typeFilter, refFacture, limit, offset } = req.query;
  const parsedLimit = parseInt(limit, 10) || null;
  const parsedOffset = parseInt(offset, 10) || 0;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    // activiteId implies we only care about transfers
    const includeManuel = (!typeFilter || typeFilter === 'manuel') && !activiteId;
    const includeTransfert = !typeFilter || typeFilter === 'transfert';

    const manuelConds = [`sld.labo_id = $1`, `sld.type_appro != 'transfert'`, `NOT (sld.type_appro = 'manuel' AND sld.quantite < 0)`];
    const transferConds = [`lt.labo_id = $1`];
    const params = [laboId];
    let idx = 2;

    if (startDate) {
      params.push(startDate);
      manuelConds.push(`sld.date_appro >= $${idx}`);
      transferConds.push(`lt.date_transfert >= $${idx}`);
      idx++;
    }
    if (endDate) {
      params.push(endDate);
      manuelConds.push(`sld.date_appro <= $${idx}`);
      transferConds.push(`lt.date_transfert <= $${idx}`);
      idx++;
    }
    if (ingredientId) {
      params.push(ingredientId);
      manuelConds.push(`sld.ingredient_id = $${idx}`);
      transferConds.push(`lt.ingredient_id = $${idx}`);
      idx++;
    }
    if (categorieId) {
      params.push(categorieId);
      manuelConds.push(`i.categorie_id = $${idx}`);
      transferConds.push(`i.categorie_id = $${idx}`);
      idx++;
    }
    if (fournisseurId) {
      params.push(fournisseurId);
      manuelConds.push(`sld.fournisseur_id = $${idx}`);
      idx++;
    }
    if (refFacture) {
      params.push(`%${refFacture}%`);
      manuelConds.push(`sld.ref_facture ILIKE $${idx}`);
      transferConds.push(`lt.ref_facture ILIKE $${idx}`);
      idx++;
    }
    if (activiteId) {
      params.push(activiteId);
      transferConds.push(`lt.activite_id = $${idx}`);
      idx++;
    }

    const manuelSql = `
      SELECT sld.id, sld.ingredient_id, sld.date_appro, sld.quantite, sld.prix_unitaire,
             sld.ref_facture, sld.type_appro, sld.updated_at, sld.created_by,
             sld.taux_tva, sld.prix_unitaire_tva,
             i.nom as ingredient_nom, u.nom as unite_nom,
             COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
             f.nom as fournisseur_nom, f.id as fournisseur_id,
             NULL::int as activite_id, NULL::text as activite_nom
      FROM stock_labo_daily sld
      JOIN articles i ON i.id = sld.ingredient_id
      JOIN unites u ON u.id = i.unite_id
      LEFT JOIN categories c ON c.id = i.categorie_id
      LEFT JOIN fournisseurs f ON f.id = sld.fournisseur_id
      WHERE ${manuelConds.join(' AND ')}`;

    const transferSql = `
      SELECT lt.id, lt.ingredient_id, lt.date_transfert as date_appro, lt.quantite, lt.prix_unitaire,
             lt.ref_facture, 'transfert'::text as type_appro, lt.created_at as updated_at, lt.created_by,
             lt.taux_tva, lt.prix_unitaire_tva,
             i.nom as ingredient_nom, u.nom as unite_nom,
             COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
             NULL::text as fournisseur_nom, NULL::int as fournisseur_id,
             lt.activite_id, a.nom as activite_nom
      FROM labo_transfers lt
      JOIN articles i ON i.id = lt.ingredient_id
      JOIN unites u ON u.id = i.unite_id
      LEFT JOIN categories c ON c.id = i.categorie_id
      JOIN activites a ON a.id = lt.activite_id
      WHERE ${transferConds.join(' AND ')}`;

    const parts = [];
    if (includeManuel) parts.push(manuelSql);
    if (includeTransfert) parts.push(transferSql);

    const sql = `SELECT * FROM (${parts.join(' UNION ALL ')}) combined
                 ORDER BY date_appro DESC, updated_at DESC
                 ${parsedLimit ? `LIMIT ${parsedLimit} OFFSET ${parsedOffset}` : ''}`;

    const result = await pool.query(sql, params);

    res.json(result.rows.map((r) => ({
      id: r.id,
      ingredientId: r.ingredient_id,
      ingredientNom: r.ingredient_nom,
      uniteNom: r.unite_nom,
      categorieNom: r.categorie_nom,
      dateAppro: isoDate(r.date_appro),
      quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
      prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
      tauxTva: r.taux_tva !== null ? parseFloat(r.taux_tva) : null,
      prixUnitaireTva: r.prix_unitaire_tva !== null ? parseFloat(r.prix_unitaire_tva) : null,
      refFacture: r.ref_facture || null,
      typeAppro: r.type_appro || null,
      fournisseurId: r.fournisseur_id || null,
      fournisseurNom: r.fournisseur_nom || null,
      activiteId: r.activite_id || null,
      activiteNom: r.activite_nom || null,
      updatedAt: r.updated_at,
      createdBy: r.created_by ?? null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/labo/:laboId/historique/:entryId
const updateLaboHistoriqueEntry = async (req, res) => {
  const { laboId, entryId } = req.params;
  const { quantite, prixUnitaire, fournisseurId, refFacture } = req.body;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const check = await pool.query(
      'SELECT id, created_by FROM stock_labo_daily WHERE id = $1 AND labo_id = $2',
      [entryId, laboId]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
    if (req.user.role === 'gerant' && check.rows[0].created_by !== req.user.id)
      return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres enregistrements.' });

    const result = await pool.query(
      `UPDATE stock_labo_daily
       SET quantite = $1, prix_unitaire = $2, fournisseur_id = $3, ref_facture = $4, updated_at = NOW()
       WHERE id = $5 AND labo_id = $6
       RETURNING id, quantite, prix_unitaire, fournisseur_id, ref_facture`,
      [quantite ?? null, prixUnitaire ?? null, fournisseurId || null, refFacture || null, entryId, laboId]
    );
    const r = result.rows[0];
    res.json({
      id: r.id,
      quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
      prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
      fournisseurId: r.fournisseur_id,
      refFacture: r.ref_facture,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/labo/:laboId/historique/:entryId
const deleteLaboHistoriqueEntry = async (req, res) => {
  const { laboId, entryId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const checkDel = await pool.query(
      'SELECT created_by FROM stock_labo_daily WHERE id = $1 AND labo_id = $2',
      [entryId, laboId]
    );
    if (checkDel.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
    if (req.user.role === 'gerant' && checkDel.rows[0].created_by !== req.user.id)
      return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres enregistrements.' });
    const result = await pool.query(
      'DELETE FROM stock_labo_daily WHERE id = $1 RETURNING id',
      [entryId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Labo Ingredient Seuil Min ───────────────────────────────────────────────

const updateLaboSeuilMin = async (req, res) => {
  const { laboId } = req.params;
  const ingredientIdRaw = parseInt(req.params.ingredientId);
  const { seuilMin } = req.body;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    if (ingredientIdRaw < 0) {
      const produitId = -ingredientIdRaw;
      await pool.query(
        `UPDATE labo_pt_selections SET seuil_min = $1 WHERE labo_id = $2 AND produit_id = $3`,
        [seuilMin ?? null, laboId, produitId]
      );
      return res.json({ success: true });
    }

    await pool.query(
      `UPDATE labo_ingredient_selections SET seuil_min = $1
       WHERE labo_id = $2 AND ingredient_id = $3`,
      [seuilMin ?? null, laboId, ingredientIdRaw]
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
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const ingRes = await pool.query(
      `SELECT i.id, i.nom, u.nom as unite, COALESCE(c.nom, 'Sans catégorie') as categorie
       FROM labo_ingredient_selections lis
       JOIN articles i ON lis.ingredient_id = i.id
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

    // PT products assigned to this labo and their activité assignments
    const ptRes = await pool.query(
      `SELECT p.id, p.nom FROM labo_pt_selections lps
       JOIN produits p ON p.id = lps.produit_id
       WHERE lps.labo_id = $1 ORDER BY p.nom`,
      [laboId]
    );
    const ptAssignRes = await pool.query(
      `SELECT pas.produit_id, pas.activite_id
       FROM produit_activite_stock pas
       JOIN activites a ON a.id = pas.activite_id
       WHERE a.labo_id = $1`,
      [laboId]
    );
    const ptAssigned = new Set(ptAssignRes.rows.map((r) => `${r.activite_id}:${r.produit_id}`));

    res.json({
      activites: actRes.rows.map((a) => ({ id: a.id, nom: a.nom, type: a.type })),
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
      produits: ptRes.rows.map((pt) => ({
        ingredientId: -(pt.id),
        nom: pt.nom,
        activities: actRes.rows.map((act) => ({
          activiteId: act.id,
          nom: act.nom,
          assigned: ptAssigned.has(`${act.id}:${pt.id}`),
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
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
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

// ─── Export Excel Historique Labo ────────────────────────────────────────────
const exportLaboHistoriqueExcel = async (req, res) => {
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId, categorieId, fournisseurId, refFacture, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').map(Number).filter(Boolean) : []);

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const conditions = ['sld.labo_id = $1'];
    const params = [laboId];
    let idx = 2;
    if (startDate)    { conditions.push(`sld.date_appro >= $${idx++}`); params.push(startDate); }
    if (endDate)      { conditions.push(`sld.date_appro <= $${idx++}`); params.push(endDate); }
    if (ingredientId) { conditions.push(`sld.ingredient_id = $${idx++}`); params.push(ingredientId); }
    if (categorieId)  { conditions.push(`i.categorie_id = $${idx++}`); params.push(categorieId); }
    if (fournisseurId){ conditions.push(`sld.fournisseur_id = $${idx++}`); params.push(fournisseurId); }
    if (refFacture)   { conditions.push(`sld.ref_facture ILIKE $${idx++}`); params.push(`%${refFacture}%`); }

    const laboRes = await pool.query('SELECT nom FROM labos WHERE id = $1', [laboId]);
    const laboNom = laboRes.rows[0]?.nom || 'Labo';

    const result = await pool.query(
      `SELECT sld.id, sld.ingredient_id, sld.date_appro, sld.quantite, sld.prix_unitaire,
              sld.ref_facture, sld.type_appro, sld.taux_tva, sld.prix_unitaire_tva,
              i.nom as ingredient_nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
              f.nom as fournisseur_nom, ub.nom as created_by_nom
       FROM stock_labo_daily sld
       JOIN articles i ON i.id = sld.ingredient_id JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id LEFT JOIN fournisseurs f ON f.id = sld.fournisseur_id
       LEFT JOIN utilisateurs ub ON ub.id = sld.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY sld.date_appro DESC, sld.updated_at DESC`, params
    );
    const rows = result.rows;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    const sheet = workbook.addWorksheet(`Hist Appro ${laboNom}`, { pageSetup: { paperSize: 9, orientation: 'landscape' } });

    const BLUE = '1F3864'; const WHITE = 'FFFFFF'; const ORANGE = 'FF6B00'; const ALT = 'EEF4FF'; const GOLD = 'FFD700';
    const TITLE_BG = '2E4A7A';
    const thin = { style: 'thin', color: { argb: 'B8CCE4' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const hdrFont = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
    const bodyFont = { name: 'Calibri', size: 10 };

    // cols: Date | Ingrédient | Catégorie | Type | Quantité | Unité | Prix U. HT | TVA % | Prix U. TTC | Coût HT | Coût TTC | Fournisseur | Réf. Facture | Créé par
    const cols = [
      { header: 'Date', width: 12 }, { header: 'Ingrédient', width: 26 }, { header: 'Catégorie', width: 18 },
      { header: 'Type', width: 10 }, { header: 'Quantité', width: 11 }, { header: 'Unité', width: 9 },
      { header: 'Prix U. HT', width: 13 }, { header: 'TVA %', width: 9 }, { header: 'Prix U. TTC', width: 13 },
      { header: 'Coût HT', width: 14 }, { header: 'Coût TTC', width: 14 },
      { header: 'Fournisseur', width: 18 }, { header: 'Réf. Facture', width: 16 }, { header: 'Créé par', width: 16 },
    ];
    sheet.columns = cols.map((c) => ({ width: c.width }));

    // Title row
    const fmtD = (d) => d ? d.split('-').reverse().join('/') : '—';
    const titleText = `Historique Appro — ${laboNom}  —  DU : ${fmtD(startDate)}   AU : ${fmtD(endDate)}`;
    const titleRow = sheet.addRow([titleText, ...Array(cols.length - 1).fill('')]);
    sheet.mergeCells(1, 1, 1, cols.length);
    titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    // Header row (now row 2)
    const hdrRow = sheet.addRow(cols.map((c) => c.header));
    hdrRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = hdrFont;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    });
    hdrRow.height = 22;
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    // col5=Quantité, col7=Prix HT, col9=Prix TTC, col10=Coût HT, col11=Coût TTC
    let totalHT = 0; let totalTTC = 0;
    rows.forEach((r, i) => {
      const qty = r.quantite !== null ? parseFloat(r.quantite) : 0;
      const prix = r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : 0;
      const prixTtc = r.prix_unitaire_tva !== null ? parseFloat(r.prix_unitaire_tva) : prix;
      const tva = r.taux_tva !== null ? parseFloat(r.taux_tva) : null;
      const coutHt = qty * prix;
      const coutTtc = qty * prixTtc;
      totalHT += coutHt; totalTTC += coutTtc;
      const isSelected = selectedSet.has(Number(r.id));
      const dateStr = r.date_appro ? new Date(r.date_appro).toISOString().slice(0, 10).split('-').reverse().join('/') : '';
      const typeLabel = (() => { const t = r.type_appro || 'manuel'; return t === 'produit_transforme' ? 'Prod. Transformé' : t === 'transfert' ? 'Transfert' : t === 'PT' ? 'PT' : 'Manuel'; })();
      const dataRow = sheet.addRow([
        dateStr, r.ingredient_nom, r.categorie_nom, typeLabel,
        qty, r.unite_nom, prix, tva !== null ? tva : '', prixTtc,
        coutHt, coutTtc,
        r.fournisseur_nom || '', r.ref_facture || '', r.created_by_nom || '',
      ]);
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: (c <= 4 || c === cols.length) ? 'left' : (c === 6 ? 'center' : 'right') };
      }
      const numFmt = '#,##0.000';
      dataRow.getCell(5).numFmt = numFmt;
      dataRow.getCell(7).numFmt = numFmt + ' "DT"';
      dataRow.getCell(9).numFmt = numFmt + ' "DT"';
      dataRow.getCell(10).numFmt = numFmt + ' "DT"';
      dataRow.getCell(11).numFmt = numFmt + ' "DT"';
      dataRow.height = 16;
    });

    const totalRow = sheet.addRow(['TOTAL', '', '', '', '', '', '', '', '', totalHT, totalTTC, '', '', '']);
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(10).numFmt = '#,##0.000 "DT"';
    totalRow.getCell(11).numFmt = '#,##0.000 "DT"';
    totalRow.height = 18;

    sheet.addRow([]);
    const footerRow = sheet.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — Labo : ${laboNom} — ${rows.length} enregistrement(s)`]);
    footerRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };
    if (selectedSet.size > 0) {
      const noteRow = sheet.addRow([`⚠ ${selectedSet.size} appro(s) en surbrillance orange = sélectionnés`]);
      noteRow.getCell(1).font = { name: 'Calibri', bold: true, size: 9, color: { argb: ORANGE } };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Historique-Labo-${laboNom}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur génération Excel' });
  }
};

// ─── createLaboPerte ──────────────────────────────────────────────────────────
const createLaboPerte = async (req, res) => {
  const { laboId, ingredientId } = req.params;
  const { quantite, typePerte, datePerte } = req.body;
  if (!quantite || parseFloat(quantite) <= 0) return res.status(400).json({ message: 'Quantité invalide' });
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const ingredientIdRaw = parseInt(ingredientId);
    const effectiveDate = datePerte || new Date().toISOString().split('T')[0];
    if (ingredientIdRaw < 0) {
      // PT product perte
      const produitId = -ingredientIdRaw;
      const ptStock = await computeStockPTCourant('labo', laboId, produitId);
      const qtyPT = parseFloat(quantite);
      if (qtyPT > ptStock) {
        return res.status(422).json({
          message: `Stock PT insuffisant`,
          disponible: Math.max(0, ptStock),
          demande: qtyPT,
        });
      }
      await pool.query(
        `INSERT INTO labo_pertes (labo_id, produit_id, quantite, type_perte, date_perte)
         VALUES ($1, $2, $3, $4, $5)`,
        [laboId, produitId, qtyPT, typePerte || 'avarie', effectiveDate]
      );
    } else {
      const minRow = await pool.query(
        `SELECT MIN(date_appro) AS min_date FROM stock_labo_daily WHERE labo_id = $1 AND ingredient_id = $2`,
        [laboId, ingredientIdRaw]
      );
      const minAppro = minRow.rows[0]?.min_date;
      if (!minAppro) return res.status(400).json({ message: 'Aucun approvisionnement enregistré pour cet ingrédient.' });
      const minApproStr = minAppro instanceof Date ? minAppro.toISOString().slice(0, 10) : String(minAppro).slice(0, 10);
      if (effectiveDate < minApproStr) return res.status(400).json({ message: `La date de perte doit être >= au premier appro (${minApproStr.split('-').reverse().join('/')}).` });

      const priceRow = await pool.query(
        `SELECT prix_unitaire FROM stock_labo_daily
         WHERE labo_id = $1 AND ingredient_id = $2
           AND prix_unitaire IS NOT NULL AND prix_unitaire > 0
           AND date_appro <= $3
         ORDER BY date_appro DESC, id DESC LIMIT 1`,
        [laboId, ingredientIdRaw, effectiveDate]
      );
      const prixUnitaire = priceRow.rows.length > 0 ? parseFloat(priceRow.rows[0].prix_unitaire) : null;
      const stockCourant = await computeStockCourant('labo', laboId, ingredientIdRaw);
      const qtyDemandee = parseFloat(quantite);
      if (qtyDemandee > stockCourant) {
        return res.status(422).json({
          message: `Stock insuffisant`,
          disponible: Math.max(0, stockCourant),
          demande: qtyDemandee,
        });
      }

      await pool.query(
        `INSERT INTO labo_pertes (labo_id, ingredient_id, quantite, type_perte, date_perte, prix_unitaire)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [laboId, ingredientIdRaw, parseFloat(quantite), typePerte || 'avarie', effectiveDate, prixUnitaire]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[createLaboPerte]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── getLaboPTRecipe ──────────────────────────────────────────────────────────
const getLaboPTRecipe = async (req, res) => {
  const { laboId, produitId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const r = await pool.query(
      `SELECT pi.ingredient_id, pi.portion AS portion_standard,
              i.nom, u.nom AS unite, COALESCE(c.nom, 'Sans catégorie') AS categorie, i.categorie_id,
              (SELECT sld.prix_unitaire FROM stock_labo_daily sld
               WHERE sld.labo_id = $2 AND sld.ingredient_id = pi.ingredient_id AND sld.quantite > 0
               ORDER BY sld.date_appro DESC LIMIT 1) AS last_prix
       FROM produit_ingredients pi
       JOIN articles i ON i.id = pi.ingredient_id
       JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       WHERE pi.produit_id = $1
       ORDER BY COALESCE(c.nom,''), i.nom`,
      [produitId, laboId]
    );

    res.json(r.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite,
      categorie: row.categorie,
      categorieId: row.categorie_id,
      portionStandard: parseFloat(row.portion_standard),
      lastPrix: row.last_prix != null ? parseFloat(row.last_prix) : null,
    })));
  } catch (err) {
    console.error('[getLaboPTRecipe]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const deleteLabo = async (req, res) => {
  const { laboId } = req.params;
  try {
    const peRes = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1', [req.user.id]
    );
    if (peRes.rows.length === 0)
      return res.status(400).json({ message: 'Profil entreprise introuvable' });
    const entrepriseId = peRes.rows[0].id;

    const laboRes = await pool.query(
      'SELECT id FROM labos WHERE id = $1 AND entreprise_id = $2', [laboId, entrepriseId]
    );
    if (laboRes.rows.length === 0)
      return res.status(404).json({ message: 'Labo introuvable' });

    // Unassign labo from activities
    await pool.query(
      'UPDATE activites SET labo_id = NULL WHERE labo_id = $1 AND entreprise_id = $2',
      [laboId, entrepriseId]
    );
    // Delete auto-created labo fournisseur and its activity links
    const fRes = await pool.query('SELECT id FROM fournisseurs WHERE labo_id = $1', [laboId]);
    if (fRes.rows.length > 0) {
      const fId = fRes.rows[0].id;
      await pool.query('DELETE FROM fournisseur_activites WHERE fournisseur_id = $1', [fId]);
      await pool.query('DELETE FROM fournisseur_labos WHERE fournisseur_id = $1', [fId]);
      await pool.query('DELETE FROM fournisseurs WHERE id = $1', [fId]);
    }
    await pool.query('DELETE FROM labos WHERE id = $1', [laboId]);

    res.json({ message: 'Labo supprimé' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateLabo = async (req, res) => {
  const { laboId } = req.params;
  const { nom, referentTel, adresse } = req.body;
  if (!nom)
    return res.status(400).json({ message: 'nom requis' });
  try {
    const peRes = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1', [req.user.id]
    );
    if (peRes.rows.length === 0)
      return res.status(400).json({ message: 'Profil entreprise introuvable' });
    const entrepriseId = peRes.rows[0].id;

    const nomCheck = await pool.query(
      'SELECT id FROM labos WHERE entreprise_id = $1 AND LOWER(nom) = LOWER($2) AND id != $3',
      [entrepriseId, nom.trim(), laboId]
    );
    if (nomCheck.rows.length > 0)
      return res.status(409).json({ message: 'Un labo avec ce nom existe déjà' });

    const tel = referentTel?.trim() || null;
    const result = await pool.query(
      `UPDATE labos SET nom = $1, referent_tel = $2, adresse = $3, updated_at = NOW()
       WHERE id = $4 AND entreprise_id = $5 RETURNING *`,
      [nom.trim(), tel, adresse?.trim() || null, laboId, entrepriseId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Labo introuvable' });
    // Sync the auto-created labo fournisseur name/tel
    await pool.query(
      `UPDATE fournisseurs SET nom = $1, telephone = $2 WHERE labo_id = $3 AND is_labo = true`,
      [nom.trim(), tel, laboId]
    );
    res.json(mapLabo(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Transfer history — export Excel ──────────────────────────────────────────

const exportLaboTransferExcel = async (req, res) => {
  const { laboId } = req.params;
  const { startDate, endDate, activiteId, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').map(Number).filter(Boolean) : []);

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const laboRes = await pool.query('SELECT nom FROM labos WHERE id = $1', [laboId]);
    const laboNom = laboRes.rows[0]?.nom || 'Labo';

    const conditions = ['lt.labo_id = $1'];
    const params = [laboId];
    let idx = 2;
    if (startDate)  { conditions.push(`lt.date_transfert >= $${idx++}`); params.push(startDate); }
    if (endDate)    { conditions.push(`lt.date_transfert <= $${idx++}`); params.push(endDate); }
    if (activiteId) { conditions.push(`lt.activite_id = $${idx++}`); params.push(activiteId); }

    const result = await pool.query(
      `SELECT lt.id, lt.quantite, lt.date_transfert, lt.note,
              lt.ingredient_id, i.nom AS ingredient_nom, u.nom AS unite_nom,
              COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
              lt.activite_id, a.nom AS activite_nom,
              lt.prix_unitaire, lt.taux_tva, lt.prix_unitaire_tva,
              ub.nom AS created_by_nom
       FROM labo_transfers lt
       JOIN articles i ON i.id = lt.ingredient_id
       JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       JOIN activites a ON a.id = lt.activite_id
       LEFT JOIN utilisateurs ub ON ub.id = lt.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY lt.date_transfert DESC, lt.id DESC`,
      params
    );
    const rows = result.rows;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    const sheet = workbook.addWorksheet(`Hist Transferts ${laboNom}`, { pageSetup: { paperSize: 9, orientation: 'landscape' } });

    const PURPLE = '4C1D95'; const LIGHT_PURPLE = '7C3AED'; const WHITE = 'FFFFFF';
    const ALT = 'F5F3FF'; const ORANGE = 'FF6B00'; const GOLD = 'FFD700';
    const thin = { style: 'thin', color: { argb: 'DDD6FE' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const hdrFont = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
    const bodyFont = { name: 'Calibri', size: 10 };

    // Date | Activité | Ingrédient | Catégorie | Quantité | Unité | Prix U. HT | TVA % | Prix U. TTC | Coût HT | Coût TTC | Créé par
    const cols = [
      { header: 'Date', width: 12 }, { header: 'Activité', width: 20 },
      { header: 'Ingrédient', width: 26 }, { header: 'Catégorie', width: 18 },
      { header: 'Quantité', width: 11 }, { header: 'Unité', width: 9 },
      { header: 'Prix U. HT', width: 13 }, { header: 'TVA %', width: 9 }, { header: 'Prix U. TTC', width: 13 },
      { header: 'Coût HT', width: 14 }, { header: 'Coût TTC', width: 14 },
      { header: 'Créé par', width: 16 },
    ];
    sheet.columns = cols.map((c) => ({ width: c.width }));

    const fmtD = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
    const titleText = `Historique Transferts — ${laboNom}  —  DU : ${fmtD(startDate)}   AU : ${fmtD(endDate)}`;
    const titleRow = sheet.addRow([titleText, ...Array(cols.length - 1).fill('')]);
    sheet.mergeCells(1, 1, 1, cols.length);
    titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PURPLE } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    const hdrRow = sheet.addRow(cols.map((c) => c.header));
    hdrRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = hdrFont;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_PURPLE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    });
    hdrRow.height = 22;
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    // col5=Quantité, col7=Prix HT, col9=Prix TTC, col10=Coût HT, col11=Coût TTC
    let totalHT = 0; let totalTTC = 0;
    rows.forEach((r, i) => {
      const qty = parseFloat(r.quantite);
      const prix = r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : 0;
      const prixTtc = r.prix_unitaire_tva !== null ? parseFloat(r.prix_unitaire_tva) : prix;
      const tva = r.taux_tva !== null ? parseFloat(r.taux_tva) : null;
      const coutHt = qty * prix;
      const coutTtc = qty * prixTtc;
      totalHT += coutHt; totalTTC += coutTtc;
      const isSelected = selectedSet.has(Number(r.id));
      const dateStr = fmtD(r.date_transfert);
      const dataRow = sheet.addRow([
        dateStr, r.activite_nom, r.ingredient_nom, r.categorie_nom,
        qty, r.unite_nom,
        prix, tva !== null ? tva : '', prixTtc,
        coutHt, coutTtc,
        r.created_by_nom || '',
      ]);
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: (c <= 4 || c >= 12) ? 'left' : (c === 6 ? 'center' : 'right') };
      }
      const numFmt = '#,##0.000';
      dataRow.getCell(5).numFmt = numFmt;
      dataRow.getCell(7).numFmt = numFmt + ' "DT"';
      dataRow.getCell(9).numFmt = numFmt + ' "DT"';
      dataRow.getCell(10).numFmt = numFmt + ' "DT"';
      dataRow.getCell(11).numFmt = numFmt + ' "DT"';
      dataRow.height = 16;
    });

    const totalRow = sheet.addRow(['TOTAL', '', '', '', '', '', '', '', '', totalHT, totalTTC, '']);
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(10).numFmt = '#,##0.000 "DT"';
    totalRow.getCell(11).numFmt = '#,##0.000 "DT"';
    totalRow.height = 18;

    sheet.addRow([]);
    const footerRow = sheet.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — Labo : ${laboNom} — ${rows.length} transfert(s)`]);
    footerRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Historique-Transferts-${laboNom}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur génération Excel' });
  }
};

// PATCH /api/labo/:laboId/transfers/:transferId
const updateTransfer = async (req, res) => {
  const { laboId, transferId } = req.params;
  const { quantite } = req.body;
  const newQty = parseFloat(quantite);
  if (!newQty || newQty <= 0)
    return res.status(400).json({ message: 'quantite requise et doit être > 0' });

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const tRes = await pool.query(
      `SELECT id, ingredient_id, produit_id, activite_id, quantite, date_transfert
       FROM labo_transfers WHERE id = $1 AND labo_id = $2`,
      [transferId, laboId]
    );
    if (tRes.rows.length === 0) return res.status(404).json({ message: 'Transfert introuvable' });
    const t = tRes.rows[0];
    const oldQty = parseFloat(t.quantite);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'UPDATE labo_transfers SET quantite = $1 WHERE id = $2',
        [newQty, transferId]
      );

      if (t.ingredient_id) {
        await client.query(
          `UPDATE stock_labo_daily SET quantite = $1, updated_at = NOW()
           WHERE id = (
             SELECT id FROM stock_labo_daily
             WHERE labo_id = $2 AND ingredient_id = $3 AND type_appro = 'manuel' AND quantite < 0
               AND date_appro = $4 AND quantite = $5
             ORDER BY id ASC LIMIT 1
           )`,
          [-newQty, laboId, t.ingredient_id, t.date_transfert, -oldQty]
        );
        await client.query(
          `UPDATE stock_entreprise_daily SET quantite = $1, updated_at = NOW()
           WHERE id = (
             SELECT id FROM stock_entreprise_daily
             WHERE activite_id = $2 AND ingredient_id = $3 AND type_appro = 'transfert'
               AND date_appro = $4 AND quantite = $5
             ORDER BY id ASC LIMIT 1
           )`,
          [newQty, t.activite_id, t.ingredient_id, t.date_transfert, oldQty]
        );
      } else if (t.produit_id) {
        await client.query(
          `UPDATE stock_labo_pt_daily SET quantite = $1, updated_at = NOW()
           WHERE id = (
             SELECT id FROM stock_labo_pt_daily
             WHERE labo_id = $2 AND produit_id = $3 AND date_appro = $4 AND quantite = $5
             ORDER BY id ASC LIMIT 1
           )`,
          [-newQty, laboId, t.produit_id, t.date_transfert, -oldQty]
        );
        await client.query(
          `UPDATE stock_produits_transformes SET quantite = $1
           WHERE id = (
             SELECT id FROM stock_produits_transformes
             WHERE activite_id = $2 AND produit_id = $3 AND date_appro = $4 AND quantite = $5
             ORDER BY id ASC LIMIT 1
           )`,
          [newQty, t.activite_id, t.produit_id, t.date_transfert, oldQty]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true, quantite: newQty });
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

// DELETE /api/labo/:laboId/transfers/:transferId
const deleteTransfer = async (req, res) => {
  const { laboId, transferId } = req.params;

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const tRes = await pool.query(
      `SELECT id, ingredient_id, produit_id, activite_id, quantite, date_transfert
       FROM labo_transfers WHERE id = $1 AND labo_id = $2`,
      [transferId, laboId]
    );
    if (tRes.rows.length === 0) return res.status(404).json({ message: 'Transfert introuvable' });
    const t = tRes.rows[0];
    const qty = parseFloat(t.quantite);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM labo_transfers WHERE id = $1', [transferId]);

      if (t.ingredient_id) {
        await client.query(
          `DELETE FROM stock_labo_daily
           WHERE id = (
             SELECT id FROM stock_labo_daily
             WHERE labo_id = $1 AND ingredient_id = $2 AND type_appro = 'manuel' AND quantite < 0
               AND date_appro = $3 AND quantite = $4
             ORDER BY id ASC LIMIT 1
           )`,
          [laboId, t.ingredient_id, t.date_transfert, -qty]
        );
        await client.query(
          `DELETE FROM stock_entreprise_daily
           WHERE id = (
             SELECT id FROM stock_entreprise_daily
             WHERE activite_id = $1 AND ingredient_id = $2 AND type_appro = 'transfert'
               AND date_appro = $3 AND quantite = $4
             ORDER BY id ASC LIMIT 1
           )`,
          [t.activite_id, t.ingredient_id, t.date_transfert, qty]
        );
      } else if (t.produit_id) {
        await client.query(
          `DELETE FROM stock_labo_pt_daily
           WHERE id = (
             SELECT id FROM stock_labo_pt_daily
             WHERE labo_id = $1 AND produit_id = $2 AND date_appro = $3 AND quantite = $4
             ORDER BY id ASC LIMIT 1
           )`,
          [laboId, t.produit_id, t.date_transfert, -qty]
        );
        await client.query(
          `DELETE FROM stock_produits_transformes
           WHERE id = (
             SELECT id FROM stock_produits_transformes
             WHERE activite_id = $1 AND produit_id = $2 AND date_appro = $3 AND quantite = $4
             ORDER BY id ASC LIMIT 1
           )`,
          [t.activite_id, t.produit_id, t.date_transfert, qty]
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

// GET /api/labo/:laboId/transfers/:transferId/prix
const getTransferPrix = async (req, res) => {
  const { laboId, transferId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const tRes = await pool.query(
      'SELECT ingredient_id, date_transfert FROM labo_transfers WHERE id = $1 AND labo_id = $2',
      [transferId, laboId]
    );
    if (tRes.rows.length === 0) return res.status(404).json({ message: 'Transfert introuvable' });
    const { ingredient_id, date_transfert } = tRes.rows[0];

    if (!ingredient_id) return res.json({ prixUnitaire: null });

    const pRes = await pool.query(
      `SELECT prix_unitaire FROM stock_labo_daily
       WHERE labo_id = $1 AND ingredient_id = $2 AND date_appro <= $3
         AND type_appro = 'manuel' AND quantite > 0 AND prix_unitaire IS NOT NULL
       ORDER BY date_appro DESC LIMIT 1`,
      [laboId, ingredient_id, date_transfert]
    );
    res.json({ prixUnitaire: pRes.rows.length > 0 ? parseFloat(pRes.rows[0].prix_unitaire) : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  createLabo, updateLabo, deleteLabo, listLabos, getLaboById,
  getLaboIngredients, toggleLaboIngredient,
  getLaboStock, updateLaboStock, getLaboStockHistory,
  getLaboFournisseurs, syncLaboFournisseurs,
  updateLaboSeuilMin,
  createTransfer, getTransferHistory, updateTransfer, deleteTransfer, getTransferPrix,
  getActivityAssignments, toggleActivityAssignment,
  getLaboHistorique, updateLaboHistoriqueEntry, deleteLaboHistoriqueEntry,
  exportLaboHistoriqueExcel, exportLaboHistoriquePdf,
  createLaboPerte,
  getLaboPTRecipe,
  exportLaboTransferExcel,
  exportLaboTransferHistoriquePdf,
};

// ── Labo appro — export PDF ────────────────────────────────────────────────────
// (declared after module.exports to allow hoisting reference; attach directly)
async function exportLaboHistoriquePdf(req, res) {
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId, categorieId, fournisseurId, refFacture } = req.query;

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const laboRes = await pool.query('SELECT nom FROM labos WHERE id = $1', [laboId]);
    const laboNom = laboRes.rows[0]?.nom || 'Labo';

    const conditions = ['sld.labo_id = $1'];
    const params = [laboId];
    let idx = 2;
    if (startDate)    { conditions.push(`sld.date_appro >= $${idx++}`); params.push(startDate); }
    if (endDate)      { conditions.push(`sld.date_appro <= $${idx++}`); params.push(endDate); }
    if (ingredientId) { conditions.push(`sld.ingredient_id = $${idx++}`); params.push(ingredientId); }
    if (categorieId)  { conditions.push(`i.categorie_id = $${idx++}`); params.push(categorieId); }
    if (fournisseurId){ conditions.push(`sld.fournisseur_id = $${idx++}`); params.push(fournisseurId); }
    if (refFacture)   { conditions.push(`sld.ref_facture ILIKE $${idx++}`); params.push(`%${refFacture}%`); }

    const result = await pool.query(
      `SELECT sld.id, sld.ingredient_id, sld.date_appro, sld.quantite, sld.prix_unitaire,
              sld.ref_facture, sld.type_appro, sld.taux_tva, sld.prix_unitaire_tva,
              i.nom as ingredient_nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom, f.nom as fournisseur_nom
       FROM stock_labo_daily sld
       JOIN articles i ON i.id = sld.ingredient_id JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id LEFT JOIN fournisseurs f ON f.id = sld.fournisseur_id
       WHERE ${conditions.join(' AND ')} ORDER BY sld.date_appro DESC, sld.updated_at DESC`,
      params
    );
    await buildLaboHistoriqueApproPdf(res, result.rows, laboNom, { startDate, endDate });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur génération PDF' });
  }
}

// ── Labo transfer — export PDF ─────────────────────────────────────────────────
async function exportLaboTransferHistoriquePdf(req, res) {
  const { laboId } = req.params;
  const { startDate, endDate, activiteId, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').map(Number).filter(Boolean) : []);
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });
    const laboRes = await pool.query('SELECT nom FROM labos WHERE id = $1', [laboId]);
    const laboNom = laboRes.rows[0]?.nom || 'Labo';
    const conditions = ['lt.labo_id = $1'];
    const params = [laboId];
    let idx = 2;
    if (startDate)  { conditions.push(`lt.date_transfert >= $${idx++}`); params.push(startDate); }
    if (endDate)    { conditions.push(`lt.date_transfert <= $${idx++}`); params.push(endDate); }
    if (activiteId) { conditions.push(`lt.activite_id = $${idx++}`); params.push(activiteId); }
    const result = await pool.query(
      `SELECT lt.id, lt.quantite, lt.date_transfert, lt.note,
              lt.ingredient_id, i.nom AS ingredient_nom, u.nom AS unite_nom,
              COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
              lt.activite_id, a.nom AS activite_nom,
              lt.prix_unitaire, lt.taux_tva, lt.prix_unitaire_tva
       FROM labo_transfers lt
       JOIN articles i ON i.id = lt.ingredient_id
       JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       JOIN activites a ON a.id = lt.activite_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY lt.date_transfert DESC, lt.id DESC`,
      params
    );
    let rows = result.rows;
    if (selectedSet.size > 0) rows = rows.filter((r) => selectedSet.has(r.id));
    await buildTransferHistoriquePdf(res, rows, laboNom, { startDate, endDate });
  } catch (err) {
    console.error('[exportLaboTransferHistoriquePdf]', err);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur génération PDF' });
  }
}
