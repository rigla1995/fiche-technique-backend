const pool = require('../config/database');
const ExcelJS = require('exceljs');

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
  const { nom, refLabo, referentTel, adresse, franchiseGroup } = req.body;
  if (!nom || !refLabo || !referentTel)
    return res.status(400).json({ message: 'nom, refLabo et referentTel requis' });
  try {
    const peRes = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [req.user.id]
    );
    if (peRes.rows.length === 0)
      return res.status(400).json({ message: 'Profil entreprise introuvable' });
    const entrepriseId = peRes.rows[0].id;

    // Check refLabo uniqueness
    const refCheck = await pool.query(
      'SELECT id FROM labos WHERE entreprise_id = $1 AND LOWER(ref_labo) = LOWER($2)',
      [entrepriseId, refLabo.trim()]
    );
    if (refCheck.rows.length > 0)
      return res.status(409).json({ message: 'Un labo avec cette référence existe déjà' });

    // If franchiseGroup provided: return existing labo for that group (idempotent)
    if (franchiseGroup) {
      const dup = await pool.query(
        'SELECT * FROM labos WHERE entreprise_id = $1 AND LOWER(franchise_group) = LOWER($2)',
        [entrepriseId, franchiseGroup]
      );
      if (dup.rows.length > 0)
        return res.status(200).json(mapLabo(dup.rows[0]));
    }

    const result = await pool.query(
      `INSERT INTO labos (entreprise_id, franchise_group, nom, referent_tel, adresse, ref_labo)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [entrepriseId, franchiseGroup || null, nom.trim(), referentTel.trim(), adresse?.trim() || null, refLabo.trim()]
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
        [entrepriseId, nom.trim(), referentTel.trim(), adresse?.trim() || null, labo.id]
      );
      const fournisseurId = fRes.rows[0].id;
      // Link to all existing activities of this franchise group (if applicable)
      if (franchiseGroup) {
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
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });
    const r = await pool.query('SELECT * FROM labos WHERE id = $1', [laboId]);
    // Also return activities linked to this labo
    const acts = await pool.query(
      'SELECT id, nom, type, franchise_group FROM activites WHERE labo_id = $1 ORDER BY nom',
      [laboId]
    );
    res.json({
      ...mapLabo(r.rows[0]),
      activites: acts.rows.map((a) => ({ id: a.id, nom: a.nom, type: a.type, franchiseGroup: a.franchise_group })),
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
    franchiseGroup: row.franchise_group,
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
              sub.quantite_totale, sub.prix_unitaire, sub.date_appro, sub.seuil_min,
              sub.cout_total, sub.recent_dates, sub.recent_transfer_dates,
              COALESCE(tr.total_transfere, 0) as total_transfere,
              (SELECT sld2.fournisseur_id FROM stock_labo_daily sld2
               WHERE sld2.labo_id = $1 AND sld2.ingredient_id = sub.ingredient_id AND sld2.type_appro = 'manuel'
               ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as last_fournisseur_id,
              (SELECT sld2.ref_facture FROM stock_labo_daily sld2
               WHERE sld2.labo_id = $1 AND sld2.ingredient_id = sub.ingredient_id AND sld2.type_appro = 'manuel'
               ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as last_ref_facture
       FROM (
         SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie,
                SUM(sld.quantite) as quantite_totale,
                (SELECT sld2.prix_unitaire FROM stock_labo_daily sld2
                 WHERE sld2.labo_id = $1 AND sld2.ingredient_id = i.id AND sld2.type_appro = 'manuel'
                 ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as prix_unitaire,
                (SELECT sld2.date_appro FROM stock_labo_daily sld2
                 WHERE sld2.labo_id = $1 AND sld2.ingredient_id = i.id AND sld2.type_appro = 'manuel'
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
         JOIN ingredients i ON lis.ingredient_id = i.id
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
           AND date_trunc('year', date_inventaire) = date_trunc('year', CURRENT_DATE)
         ORDER BY ingredient_id, date_inventaire DESC, created_at DESC
       ),
       post_appro AS (
         SELECT sld.ingredient_id, SUM(sld.quantite) as qty
         FROM stock_labo_daily sld
         JOIN last_inv li ON li.ingredient_id = sld.ingredient_id AND sld.date_appro > li.date_inventaire
         WHERE sld.labo_id = $1
         GROUP BY sld.ingredient_id
       ),
       post_transfer AS (
         SELECT lt.ingredient_id, SUM(lt.quantite) as qty
         FROM labo_transfers lt
         JOIN last_inv li ON li.ingredient_id = lt.ingredient_id AND lt.date_transfert > li.date_inventaire
         WHERE lt.labo_id = $1 AND lt.ingredient_id IS NOT NULL
         GROUP BY lt.ingredient_id
       ),
       post_pertes AS (
         SELECT lp.ingredient_id, SUM(lp.quantite) as qty
         FROM labo_pertes lp
         JOIN last_inv li ON li.ingredient_id = lp.ingredient_id AND lp.date_perte > li.date_inventaire
         WHERE lp.labo_id = $1 AND lp.ingredient_id IS NOT NULL
         GROUP BY lp.ingredient_id
       ),
       year_appro AS (
         SELECT ingredient_id, SUM(quantite) as qty
         FROM stock_labo_daily
         WHERE labo_id = $1 AND date_trunc('year', date_appro) = date_trunc('year', CURRENT_DATE)
         GROUP BY ingredient_id
       ),
       year_transfer AS (
         SELECT ingredient_id, SUM(quantite) as qty
         FROM labo_transfers
         WHERE labo_id = $1 AND ingredient_id IS NOT NULL
           AND date_trunc('year', date_transfert) = date_trunc('year', CURRENT_DATE)
         GROUP BY ingredient_id
       ),
       year_pertes AS (
         SELECT ingredient_id, SUM(quantite) as qty
         FROM labo_pertes
         WHERE labo_id = $1 AND ingredient_id IS NOT NULL
           AND date_trunc('year', date_perte) = date_trunc('year', CURRENT_DATE)
         GROUP BY ingredient_id
       ),
       post_pt_usage AS (
         SELECT sld.ingredient_id, SUM(ABS(sld.quantite)) as qty
         FROM stock_labo_daily sld
         JOIN last_inv li ON li.ingredient_id = sld.ingredient_id AND sld.date_appro > li.date_inventaire
         WHERE sld.labo_id = $1 AND sld.quantite < 0 AND sld.type_appro NOT IN ('manuel', 'transfert')
         GROUP BY sld.ingredient_id
       ),
       avg_prix_post AS (
         SELECT sld.ingredient_id, AVG(sld.prix_unitaire) as avg_prix
         FROM stock_labo_daily sld
         JOIN last_inv li ON li.ingredient_id = sld.ingredient_id AND sld.date_appro > li.date_inventaire
         WHERE sld.labo_id = $1 AND sld.quantite > 0 AND sld.prix_unitaire IS NOT NULL
         GROUP BY sld.ingredient_id
       ),
       year_pt_usage AS (
         SELECT ingredient_id, SUM(ABS(quantite)) as qty
         FROM stock_labo_daily
         WHERE labo_id = $1 AND quantite < 0 AND type_appro NOT IN ('manuel', 'transfert')
           AND date_trunc('year', date_appro) = date_trunc('year', CURRENT_DATE)
         GROUP BY ingredient_id
       ),
       avg_prix_year AS (
         SELECT ingredient_id, AVG(prix_unitaire) as avg_prix
         FROM stock_labo_daily
         WHERE labo_id = $1 AND quantite > 0 AND prix_unitaire IS NOT NULL
           AND date_trunc('year', date_appro) = date_trunc('year', CURRENT_DATE)
         GROUP BY ingredient_id
       )
       SELECT lis.ingredient_id,
              li.quantite_reelle            as inv_qty,
              li.date_inventaire            as inv_date,
              COALESCE(pa.qty, 0)           as post_appro_qty,
              COALESCE(pt.qty, 0)           as post_transfer_qty,
              COALESCE(pp.qty, 0)           as post_pertes_qty,
              COALESCE(ppu.qty, 0)          as post_pt_usage_qty,
              app.avg_prix                  as avg_prix_post,
              COALESCE(ya.qty, 0)           as year_appro_qty,
              COALESCE(ytr.qty, 0)          as year_transfer_qty,
              COALESCE(yp.qty, 0)           as year_pertes_qty,
              COALESCE(ypu.qty, 0)          as year_pt_usage_qty,
              apy.avg_prix                  as avg_prix_year
       FROM labo_ingredient_selections lis
       LEFT JOIN last_inv li      ON li.ingredient_id  = lis.ingredient_id
       LEFT JOIN post_appro pa    ON pa.ingredient_id  = lis.ingredient_id
       LEFT JOIN post_transfer pt ON pt.ingredient_id  = lis.ingredient_id
       LEFT JOIN post_pertes pp   ON pp.ingredient_id  = lis.ingredient_id
       LEFT JOIN post_pt_usage ppu ON ppu.ingredient_id = lis.ingredient_id
       LEFT JOIN avg_prix_post app ON app.ingredient_id = lis.ingredient_id
       LEFT JOIN year_appro ya    ON ya.ingredient_id  = lis.ingredient_id
       LEFT JOIN year_transfer ytr ON ytr.ingredient_id = lis.ingredient_id
       LEFT JOIN year_pertes yp   ON yp.ingredient_id  = lis.ingredient_id
       LEFT JOIN year_pt_usage ypu ON ypu.ingredient_id = lis.ingredient_id
       LEFT JOIN avg_prix_year apy ON apy.ingredient_id = lis.ingredient_id
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
        avgPrixPost: r.avg_prix_post !== null ? parseFloat(r.avg_prix_post) : null,
        yearApproQty: parseFloat(r.year_appro_qty) || 0,
        yearTransferQty: parseFloat(r.year_transfer_qty) || 0,
        yearPertesQty: parseFloat(r.year_pertes_qty) || 0,
        yearPtUsageQty: parseFloat(r.year_pt_usage_qty) || 0,
        avgPrixYear: r.avg_prix_year !== null ? parseFloat(r.avg_prix_year) : null,
      };
    }

    const ingredientRows = result.rows.map((row) => {
      const totalTransfere = parseFloat(row.total_transfere);
      const b = invBaselineMap[row.ingredient_id] || {};
      const quantite = b.hasInv
        ? b.invQty + b.postApproQty - b.postTransferQty - b.postPertesQty
        : b.yearApproQty - b.yearTransferQty - b.yearPertesQty;
      const avgPrix = b.hasInv ? (b.avgPrixPost ?? b.avgPrixYear ?? null) : (b.avgPrixYear ?? null);
      const pertesDepuisInv = b.hasInv ? b.postPertesQty : b.yearPertesQty;
      const ptUsageDepuisInv = b.hasInv ? b.postPtUsageQty : b.yearPtUsageQty;
      return {
        ingredientId: row.ingredient_id,
        nom: row.nom,
        unite: row.unite_nom,
        categorie: row.categorie,
        quantite,
        prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
        dateAppro: isoDate(row.date_appro),
        seuilMin: row.seuil_min !== null ? parseFloat(row.seuil_min) : null,
        coutTotal: avgPrix !== null && quantite > 0 ? quantite * avgPrix : 0,
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
      };
    });

    // ── PT products for this labo ──────────────────────────────────────────────
    const ptResult = await pool.query(`
      SELECT p.id as produit_id, p.nom, p.franchise_group,
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
        (SELECT COALESCE(SUM(pi2.portion * (
           SELECT sld2.prix_unitaire FROM stock_labo_daily sld2
           WHERE sld2.labo_id = $1 AND sld2.ingredient_id = pi2.ingredient_id AND sld2.quantite > 0
           ORDER BY sld2.date_appro DESC LIMIT 1
        )), 0)
         FROM produit_ingredients pi2 WHERE pi2.produit_id = p.id) as prix_calcule
      FROM labo_pt_selections lps
      JOIN produits p ON p.id = lps.produit_id
      LEFT JOIN activites a ON a.id = p.activite_id
      LEFT JOIN stock_labo_pt_daily slpt ON slpt.produit_id = p.id AND slpt.labo_id = $1
      WHERE lps.labo_id = $1
      GROUP BY p.id, p.nom, p.franchise_group, a.id, a.nom, lps.seuil_min
      ORDER BY p.nom
    `, [laboId]);

    // PT baseline: last current-year inv + post-inv appros - post-inv pertes (or year fallback)
    const ptBaselineRes = await pool.query(
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
         JOIN last_inv li ON li.produit_id = slpt.produit_id AND slpt.date_appro > li.date_inventaire
         WHERE slpt.labo_id = $1
         GROUP BY slpt.produit_id
       ),
       post_pertes AS (
         SELECT lp.produit_id, SUM(lp.quantite) as qty
         FROM labo_pertes lp
         JOIN last_inv li ON li.produit_id = lp.produit_id AND lp.date_perte > li.date_inventaire
         WHERE lp.labo_id = $1 AND lp.produit_id IS NOT NULL
         GROUP BY lp.produit_id
       ),
       year_appro AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM stock_labo_pt_daily
         WHERE labo_id = $1 AND date_trunc('year', date_appro) = date_trunc('year', CURRENT_DATE)
         GROUP BY produit_id
       ),
       year_pertes AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM labo_pertes
         WHERE labo_id = $1 AND produit_id IS NOT NULL
           AND date_trunc('year', date_perte) = date_trunc('year', CURRENT_DATE)
         GROUP BY produit_id
       ),
       avg_prix_post AS (
         SELECT slpt.produit_id, AVG(slpt.prix_unitaire) as avg_prix
         FROM stock_labo_pt_daily slpt
         JOIN last_inv li ON li.produit_id = slpt.produit_id AND slpt.date_appro > li.date_inventaire
         WHERE slpt.labo_id = $1 AND slpt.prix_unitaire IS NOT NULL
         GROUP BY slpt.produit_id
       ),
       avg_prix_year AS (
         SELECT produit_id, AVG(prix_unitaire) as avg_prix
         FROM stock_labo_pt_daily
         WHERE labo_id = $1 AND prix_unitaire IS NOT NULL
           AND date_trunc('year', date_appro) = date_trunc('year', CURRENT_DATE)
         GROUP BY produit_id
       )
       SELECT lps.produit_id,
              li.quantite_reelle       as inv_qty,
              li.date_inventaire       as inv_date,
              COALESCE(pa.qty, 0)      as post_appro_qty,
              COALESCE(pp.qty, 0)      as post_pertes_qty,
              app.avg_prix             as avg_prix_post,
              COALESCE(ya.qty, 0)      as year_appro_qty,
              COALESCE(yp.qty, 0)      as year_pertes_qty,
              apy.avg_prix             as avg_prix_year
       FROM labo_pt_selections lps
       LEFT JOIN last_inv li        ON li.produit_id  = lps.produit_id
       LEFT JOIN post_appro pa      ON pa.produit_id  = lps.produit_id
       LEFT JOIN post_pertes pp     ON pp.produit_id  = lps.produit_id
       LEFT JOIN avg_prix_post app  ON app.produit_id = lps.produit_id
       LEFT JOIN year_appro ya      ON ya.produit_id  = lps.produit_id
       LEFT JOIN year_pertes yp     ON yp.produit_id  = lps.produit_id
       LEFT JOIN avg_prix_year apy  ON apy.produit_id = lps.produit_id
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
        yearApproQty: parseFloat(r.year_appro_qty) || 0,
        yearPertesQty: parseFloat(r.year_pertes_qty) || 0,
        avgPrixYear: r.avg_prix_year !== null ? parseFloat(r.avg_prix_year) : null,
      };
    }

    const ptRows = ptResult.rows.map((row) => {
      const prixCalcule = row.prix_calcule !== null ? parseFloat(row.prix_calcule) : null;
      const prixUnitaire = row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : (prixCalcule && prixCalcule > 0 ? prixCalcule : null);
      const pb = ptBaselineMap[row.produit_id] || {};
      const quantite = pb.hasInv
        ? pb.invQty + pb.postApproQty - pb.postPertesQty
        : pb.yearApproQty - pb.yearPertesQty;
      const avgPrix = pb.hasInv ? (pb.avgPrixPost ?? pb.avgPrixYear ?? null) : (pb.avgPrixYear ?? null);
      const pertesDepuisInv = pb.hasInv ? pb.postPertesQty : pb.yearPertesQty;
      return {
        ingredientId: -(row.produit_id),
        produitId: row.produit_id,
        isPT: true,
        nom: row.nom,
        unite: 'unité',
        categorie: 'Produits Transformés',
        activite: row.franchise_group || row.activite_nom || null,
        activiteId: row.activite_id ?? null,
        ptFranchiseGroup: row.franchise_group || null,
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
  const { quantite, prixUnitaire, dateAppro, fournisseurId, refFacture } = req.body;
  const da = dateAppro || todayStr();

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
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
             (SELECT sld.prix_unitaire FROM stock_labo_daily sld
              WHERE sld.labo_id = $2 AND sld.ingredient_id = pi.ingredient_id AND sld.quantite > 0
              ORDER BY sld.date_appro DESC LIMIT 1) AS last_prix
           FROM produit_ingredients pi
           JOIN ingredients i ON i.id = pi.ingredient_id
           WHERE pi.produit_id = $1`,
          [produitId, laboId]
        ),
      ]);
      const produitNom = prodRes.rows[0]?.nom ?? 'PT';

      let prixCalcule = 0;
      for (const ing of ingRes.rows) {
        if (ing.last_prix !== null) {
          prixCalcule += parseFloat(ing.portion) * parseFloat(ing.last_prix);
        }
      }
      const finalPrix = prixCalcule > 0 ? prixCalcule : (prixUnitaire ? parseFloat(prixUnitaire) : null);

      // Save PT appro — always insert a new row (multiple rows per day allowed)
      await pool.query(
        `INSERT INTO stock_labo_pt_daily (labo_id, produit_id, date_appro, quantite, prix_unitaire, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [laboId, produitId, da, qty, finalPrix]
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
          const consumed = -(parseFloat(ing.portion) * qty);
          await pool.query(
            `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, fournisseur_id, ref_facture, type_appro, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [laboId, ing.ingredient_id, da, consumed, ing.last_prix || 0, autoFournisseurId, `${ing.ing_nom}-${yearStr}`, produitNom]
          );
        }
      }

      return res.json({ success: true, prixCalcule: finalPrix });
    }

    await pool.query(
      `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, fournisseur_id, ref_facture, type_appro, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manuel', NOW())`,
      [laboId, ingredientIdRaw, da, quantite ?? null, prixUnitaire ?? null, fournisseurId || null, refFacture || null]
    );
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
    const ok = await checkLaboOwner(laboId, req.user.id);
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
              f.nom as fournisseur_nom
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
      fournisseurNom: r.fournisseur_nom || null,
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
    const ok = await checkLaboOwner(laboId, req.user.id);
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
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    await pool.query('DELETE FROM fournisseur_labos WHERE labo_id = $1', [laboId]);
    for (const fId of fournisseurIds) {
      await pool.query(
        'INSERT INTO fournisseur_labos (fournisseur_id, labo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [fId, laboId]
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
            `INSERT INTO labo_transfers (labo_id, activite_id, produit_id, quantite, date_transfert, note, ref_facture)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [laboId, t.activiteId, produitId, qty, dateTransfert, note || null, refFacture || null]
          );
          continue;
        }

        // Regular ingredient transfer
        const latestRes = await client.query(
          `SELECT quantite, prix_unitaire FROM stock_labo_daily
           WHERE labo_id = $1 AND ingredient_id = $2
           ORDER BY date_appro DESC LIMIT 1`,
          [laboId, ingId]
        );
        const prixUnitaire = latestRes.rows.length > 0 ? latestRes.rows[0].prix_unitaire : null;

        await client.query(
          `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'transfert', NOW())`,
          [laboId, ingId, dateTransfert, -qty, prixUnitaire]
        );

        await client.query(
          `INSERT INTO stock_entreprise_daily
             (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'transfert', $6, $7, NOW())`,
          [t.activiteId, ingId, dateTransfert, qty, prixUnitaire, laboFournisseurId, refFacture || null]
        );

        await client.query(
          `INSERT INTO labo_transfers (labo_id, activite_id, ingredient_id, quantite, date_transfert, note, ref_facture)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [laboId, t.activiteId, ingId, qty, dateTransfert, note || null, refFacture || null]
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
    const ok = await checkLaboOwner(laboId, req.user.id);
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
              i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
              a.id as activite_id, a.nom as activite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom
       FROM labo_transfers lt
       JOIN ingredients i ON i.id = lt.ingredient_id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       JOIN activites a ON a.id = lt.activite_id
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
  const { startDate, endDate, ingredientId, categorieId, fournisseurId, refFacture } = req.query;
  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
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

    const result = await pool.query(
      `SELECT sld.id, sld.ingredient_id, sld.date_appro, sld.quantite, sld.prix_unitaire,
              sld.ref_facture, sld.updated_at,
              i.nom as ingredient_nom,
              u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
              f.nom as fournisseur_nom, f.id as fournisseur_id
       FROM stock_labo_daily sld
       JOIN ingredients i ON i.id = sld.ingredient_id
       JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN fournisseurs f ON f.id = sld.fournisseur_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY sld.date_appro DESC, sld.updated_at DESC`,
      params
    );

    res.json(result.rows.map((r) => ({
      id: r.id,
      ingredientId: r.ingredient_id,
      ingredientNom: r.ingredient_nom,
      uniteNom: r.unite_nom,
      categorieNom: r.categorie_nom,
      dateAppro: isoDate(r.date_appro),
      quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
      prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
      refFacture: r.ref_facture || null,
      fournisseurId: r.fournisseur_id || null,
      fournisseurNom: r.fournisseur_nom || null,
      updatedAt: r.updated_at,
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
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const check = await pool.query(
      'SELECT id FROM stock_labo_daily WHERE id = $1 AND labo_id = $2',
      [entryId, laboId]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });

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
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const result = await pool.query(
      'DELETE FROM stock_labo_daily WHERE id = $1 AND labo_id = $2 RETURNING id',
      [entryId, laboId]
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
    const ok = await checkLaboOwner(laboId, req.user.id);
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
      'SELECT id, nom, type, franchise_group FROM activites WHERE labo_id = $1 ORDER BY nom',
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
      activites: actRes.rows.map((a) => ({ id: a.id, nom: a.nom, type: a.type, franchiseGroup: a.franchise_group })),
      ingredients: ingRes.rows.map((ing) => ({
        ingredientId: ing.id,
        nom: ing.nom,
        unite: ing.unite,
        categorie: ing.categorie,
        activities: actRes.rows.map((act) => ({
          activiteId: act.id,
          nom: act.nom,
          type: act.type,
          franchiseGroup: act.franchise_group,
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

// ─── Export Excel Historique Labo ────────────────────────────────────────────
const exportLaboHistoriqueExcel = async (req, res) => {
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId, categorieId, fournisseurId, refFacture, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').map(Number).filter(Boolean) : []);

  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
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
              sld.ref_facture, i.nom as ingredient_nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
              f.nom as fournisseur_nom
       FROM stock_labo_daily sld
       JOIN ingredients i ON i.id = sld.ingredient_id JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id LEFT JOIN fournisseurs f ON f.id = sld.fournisseur_id
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

    const cols = [
      { header: 'Date', width: 12 }, { header: 'Ingrédient', width: 26 }, { header: 'Catégorie', width: 18 },
      { header: 'Quantité', width: 11 }, { header: 'Unité', width: 9 }, { header: 'Prix/DT', width: 11 },
      { header: 'Coût total DT', width: 14 }, { header: 'Fournisseur', width: 18 }, { header: 'Réf. Facture', width: 16 },
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

    let totalQty = 0; let totalCout = 0;
    rows.forEach((r, i) => {
      const qty = r.quantite !== null ? parseFloat(r.quantite) : 0;
      const prix = r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : 0;
      const cout = qty * prix;
      totalQty += qty; totalCout += cout;
      const isSelected = selectedSet.has(Number(r.id));
      const dateStr = r.date_appro ? new Date(r.date_appro).toISOString().slice(0, 10).split('-').reverse().join('/') : '';
      const dataRow = sheet.addRow([dateStr, r.ingredient_nom, r.categorie_nom, qty, r.unite_nom, prix, cout, r.fournisseur_nom || '', r.ref_facture || '']);
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      // Use getCell loop to ensure ALL cells (including empty) get the fill
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: c <= 3 ? 'left' : (c === 5 ? 'center' : 'right') };
      }
      dataRow.getCell(4).numFmt = '#,##0.000';
      dataRow.getCell(6).numFmt = '#,##0.000 "DT"';
      dataRow.getCell(7).numFmt = '#,##0.000 "DT"';
      dataRow.height = 16;
    });

    const totalRow = sheet.addRow(['TOTAL', '', '', totalQty, '', '', totalCout, '', '']);
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(4).numFmt = '#,##0.000';
    totalRow.getCell(7).numFmt = '#,##0.000 "DT"';
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
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const ingredientIdRaw = parseInt(ingredientId);
    if (ingredientIdRaw < 0) {
      // PT product perte
      const produitId = -ingredientIdRaw;
      await pool.query(
        `INSERT INTO labo_pertes (labo_id, produit_id, quantite, type_perte, date_perte)
         VALUES ($1, $2, $3, $4, $5)`,
        [laboId, produitId, parseFloat(quantite), typePerte || 'avarie', datePerte || new Date().toISOString().split('T')[0]]
      );
    } else {
      await pool.query(
        `INSERT INTO labo_pertes (labo_id, ingredient_id, quantite, type_perte, date_perte)
         VALUES ($1, $2, $3, $4, $5)`,
        [laboId, ingredientIdRaw, parseFloat(quantite), typePerte || 'avarie', datePerte || new Date().toISOString().split('T')[0]]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[createLaboPerte]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  createLabo, listLabos, getLaboById,
  getLaboIngredients, toggleLaboIngredient,
  getLaboStock, updateLaboStock, getLaboStockHistory,
  getLaboFournisseurs, syncLaboFournisseurs,
  updateLaboSeuilMin,
  createTransfer, getTransferHistory,
  getActivityAssignments, toggleActivityAssignment,
  getLaboHistorique, updateLaboHistoriqueEntry, deleteLaboHistoriqueEntry,
  exportLaboHistoriqueExcel,
  createLaboPerte,
};
