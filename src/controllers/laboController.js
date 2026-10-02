const pool = require('../config/database');
const ExcelJS = require('exceljs');
const { isoDate, todayStr } = require('../utils/dateUtils');
const { computeStockCourant, computeStockPTCourant, buildAutoRef, ptCategorie, ptCategorieSql, ptTypeSql } = require('../utils/stockUtils');
const { nomFichierSur, ongletSur } = require('../utils/excelNoms');
const { vocabDefaut, libelleCategoriePt } = require('../utils/vocab');
const { brandHeader, headerRow, dataRowStyle, totalRowStyle, brandFooter, finalize, FMT_DT, FMT_QTE } = require('../services/excelBrandService');
const { upsertFacture } = require('../services/facturesService');
const { withTransaction } = require('../utils/db');
const { computeStockBulk, computeStock } = require('../services/stockService');
const unitesOp = require('../services/unitesOperationnellesService');
const transfertService = require('../services/transfertService');
const { TransfertError } = transfertService;
const { checkQuota } = require('../services/quotaService');
const { getTypesPerteForClient } = require('../services/domaineProfilService');
const { gerantAllowsLabo } = require('../middleware/auth');

// Erreur de transfert / verrou de stock → 4xx explicite, sinon rethrow.
function replyTransfertError(res, err) {
  if (transfertService.isTransfertError(err)) {
    res.status(err.status || 400).json({ code: err.code, message: err.message, ...(err.extra || {}) });
    return true;
  }
  const lock = transfertService.mapLockError(err);
  if (lock) {
    res.status(lock.status).json({ code: lock.code, message: lock.message });
    return true;
  }
  return false;
}

// Erreur d'unité opérationnelle (composant, source, cycle…) → 4xx explicite, sinon rethrow.
function replyUniteError(res, err) {
  if (unitesOp.isUniteError(err)) {
    res.status(err.status || 400).json({ code: err.code, message: err.message });
    return true;
  }
  const mapped = unitesOp.mapPgError(err);
  if (mapped) {
    res.status(400).json({ code: mapped.code, message: mapped.message });
    return true;
  }
  return false;
}

// ─── Fournisseur système « AUTO » ─────────────────────────────────────────────
// Get-or-create du fournisseur AUTO de l'entreprise du labo, porté par les écritures
// générées par le système (consommations recette à la production, sortie de transfert
// PT). db = pool ou client de transaction.
async function getAutoFournisseurIdForLabo(db, laboId, userId = null) {
  const entRes = await db.query('SELECT entreprise_id FROM labos WHERE id = $1', [laboId]);
  if (entRes.rows.length === 0) return null;
  const entrepriseId = entRes.rows[0].entreprise_id;
  const foRes = await db.query(
    `SELECT id FROM fournisseurs WHERE entreprise_id = $1 AND nom = 'AUTO' LIMIT 1`, [entrepriseId]
  );
  if (foRes.rows.length > 0) return foRes.rows[0].id;
  const newFo = await db.query(
    `INSERT INTO fournisseurs (entreprise_id, nom, created_by) VALUES ($1, 'AUTO', $2) RETURNING id`, [entrepriseId, userId]
  );
  return newFo.rows[0].id;
}

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
  const { nom, refLabo, referentTel, adresse, activityIds, composantId, laboParentId } = req.body;
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

    // Lot 1b §3.4 : quota de labos du dernier abonnement (409 LIMITE_ATTEINTE).
    const quota = await checkQuota(pool, req.user.id, 'labo');
    if (quota) return res.status(409).json(quota);

    // Lot 1b : composant (∈ domaine du compte, type labo, actif) et labo source (∈ entreprise)
    // validés AVANT l'insertion pour ne jamais laisser un labo à moitié configuré.
    if (composantId != null) {
      await unitesOp.validateComposant(pool, entrepriseId, 'labo', composantId);
    }
    const parentIdNum = laboParentId != null ? parseInt(laboParentId, 10) : null;
    if (laboParentId != null) {
      if (!Number.isInteger(parentIdNum) || parentIdNum <= 0) return res.status(400).json({ message: '[[Nom:labo]] source introuvable' });
      const parentCheck = await pool.query(
        'SELECT id FROM labos WHERE id = $1 AND entreprise_id = $2',
        [parentIdNum, entrepriseId]
      );
      if (parentCheck.rows.length === 0) return res.status(400).json({ message: '[[Nom:labo]] source introuvable' });
    }

    // Check nom uniqueness
    const nomCheck = await pool.query(
      'SELECT id FROM labos WHERE entreprise_id = $1 AND LOWER(nom) = LOWER($2)',
      [entrepriseId, nom.trim()]
    );
    if (nomCheck.rows.length > 0)
      return res.status(409).json({ message: '[[Un:labo]] avec ce nom existe déjà' });

    // Check refLabo uniqueness
    const refCheck = await pool.query(
      'SELECT id FROM labos WHERE entreprise_id = $1 AND LOWER(ref_labo) = LOWER($2)',
      [entrepriseId, refLabo.trim()]
    );
    if (refCheck.rows.length > 0)
      return res.status(409).json({ message: '[[Un:labo]] avec cette référence existe déjà' });

    const tel = referentTel?.trim() || null;
    // INSERT → fournisseur interne → affectations → composant → source dans UNE transaction : un
    // 400 (cycle, composant…) ne laisse jamais un labo créé à moitié configuré.
    const labo = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO labos (entreprise_id, nom, referent_tel, adresse, ref_labo)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [entrepriseId, nom.trim(), tel, adresse?.trim() || null, refLabo.trim()]
      );
      const created = result.rows[0];

      // Auto-create a labo fournisseur
      const existingFournisseur = await client.query(
        'SELECT id FROM fournisseurs WHERE labo_id = $1', [created.id]
      );
      if (existingFournisseur.rows.length === 0) {
        const fRes = await client.query(
          `INSERT INTO fournisseurs (entreprise_id, nom, telephone, adresse, is_labo, labo_id, created_by)
           VALUES ($1, $2, $3, $4, true, $5, $6) RETURNING id`,
          [entrepriseId, nom.trim(), tel, adresse?.trim() || null, created.id, req.user.id]
        );
        const fournisseurId = fRes.rows[0].id;
        // Assign manually selected activities to this labo (standalone creation)
        if (activityIds && activityIds.length > 0) {
          await client.query(
            'UPDATE activites SET labo_id = $1 WHERE id = ANY($2::int[]) AND entreprise_id = $3',
            [created.id, activityIds, entrepriseId]
          );
          await client.query(
            `INSERT INTO fournisseur_activites (fournisseur_id, activite_id)
             SELECT $1, id FROM activites WHERE id = ANY($2::int[]) AND entreprise_id = $3
             ON CONFLICT DO NOTHING`,
            [fournisseurId, activityIds, entrepriseId]
          );
          // Auto-import ingredients from assigned activities into the labo
          await client.query(
            `INSERT INTO labo_ingredient_selections (labo_id, ingredient_id)
             SELECT DISTINCT $1::integer, ais.ingredient_id
             FROM activite_ingredient_selections ais
             WHERE ais.activite_id = ANY($2::int[])
             ON CONFLICT DO NOTHING`,
            [created.id, activityIds]
          );
        }
      }

      // Lot 1b : l'unité opérationnelle est créée par trigger (composant par défaut du domaine) ;
      // composant explicite → flags du composant ; labo source → labo_parent_id (lien synchronisé),
      // fournisseur interne + import des sélections d'articles de la source.
      const unite = await unitesOp.getUniteByRef(client, 'labo', created.id);
      if (unite && composantId != null) await unitesOp.setComposant(client, unite.id, composantId);
      if (unite && parentIdNum != null) {
        const srcUnite = await unitesOp.getUniteByRef(client, 'labo', parentIdNum);
        if (srcUnite) await unitesOp.setSource(client, unite.id, srcUnite.id);
      }
      return created;
    });

    const fresh = await pool.query('SELECT * FROM labos WHERE id = $1', [labo.id]);
    await unitesOp.enrichRows(pool, 'labo', fresh.rows);
    res.status(201).json(mapLabo(fresh.rows[0]));
  } catch (err) {
    if (replyUniteError(res, err)) return;
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
    // Gérant : restreindre aux labos affectés
    const params = [peRes.rows[0].id];
    let gerantClause = '';
    if (req.user.role === 'gerant') {
      const laboIds = req.user.gerantLaboIds || [];
      params.push(laboIds.length ? laboIds : [-1]);
      gerantClause = ` AND l.id = ANY($${params.length}::int[])`;
    }
    const result = await pool.query(
      `SELECT l.*, COUNT(DISTINCT fl.fournisseur_id)::int AS fournisseur_count,
              COUNT(DISTINCT lis.ingredient_id)::int AS ingredient_count
       FROM labos l
       LEFT JOIN fournisseur_labos fl ON fl.labo_id = l.id
       LEFT JOIN labo_ingredient_selections lis ON lis.labo_id = l.id
       WHERE l.entreprise_id = $1${gerantClause}
       GROUP BY l.id
       ORDER BY l.nom`,
      params
    );
    await unitesOp.enrichRows(pool, 'labo', result.rows);
    res.json(result.rows.map((r) => ({ ...mapLabo(r), fournisseurCount: r.fournisseur_count, ingredientCount: r.ingredient_count })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getLaboById = async (req, res) => {
  const { laboId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });
    const r = await pool.query('SELECT * FROM labos WHERE id = $1', [laboId]);
    await unitesOp.enrichRows(pool, 'labo', r.rows);
    // Also return activities linked to this labo
    const acts = await pool.query(
      'SELECT id, nom FROM activites WHERE labo_id = $1 ORDER BY nom',
      [laboId]
    );
    // Lot 1b : destinations rattachées (activités ET labos enfants) — `activites` conservé
    // pour TransferHistoriquePage / LaboFacturesApproPage.
    const destinations = await unitesOp.getDestinations(pool, laboId);
    res.json({
      ...mapLabo(r.rows[0]),
      activites: acts.rows.map((a) => ({ id: a.id, nom: a.nom })),
      destinations,
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
    laboParentId: row.labo_parent_id ?? null,
    createdAt: row.created_at,
    // Lot 1b — unité opérationnelle (colonnes uo_* posées par unitesOp.enrichRows ; défauts sûrs sinon)
    ...unitesOp.uniteFields(row),
  };
}

// ─── Labo Ingredient Selections ───────────────────────────────────────────────

const getLaboIngredients = async (req, res) => {
  const { laboId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

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

// GET /api/labo/:laboId/pt — liste des produits transformés rattachés au labo (pour les filtres)
const getLaboPT = async (req, res) => {
  const { laboId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });
    const result = await pool.query(
      `SELECT p.id as produit_id, p.nom
       FROM labo_pt_selections lps
       JOIN produits p ON p.id = lps.produit_id
       WHERE lps.labo_id = $1
       ORDER BY p.nom`,
      [laboId]
    );
    res.json(result.rows.map((r) => ({ produitId: r.produit_id, nom: r.nom })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const toggleLaboIngredient = async (req, res) => {
  const { laboId, ingredientId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

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
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

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
               WHERE sld2.labo_id = $1 AND sld2.ingredient_id = sub.ingredient_id AND sld2.type_appro IN ('manuel','transfert') AND sld2.quantite > 0
               ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as last_fournisseur_id,
              (SELECT sld2.ref_facture FROM stock_labo_daily sld2
               WHERE sld2.labo_id = $1 AND sld2.ingredient_id = sub.ingredient_id AND sld2.type_appro IN ('manuel','transfert') AND sld2.quantite > 0
               ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as last_ref_facture
       FROM (
         SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie,
                SUM(sld.quantite) as quantite_totale,
                (SELECT sld2.prix_unitaire FROM stock_labo_daily sld2
                 WHERE sld2.labo_id = $1 AND sld2.ingredient_id = i.id AND sld2.type_appro IN ('manuel','transfert') AND sld2.quantite > 0
                 ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as prix_unitaire,
                (SELECT sld2.taux_tva FROM stock_labo_daily sld2
                 WHERE sld2.labo_id = $1 AND sld2.ingredient_id = i.id AND sld2.type_appro IN ('manuel','transfert') AND sld2.quantite > 0 AND sld2.taux_tva IS NOT NULL
                 ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1) as taux_tva,
                (SELECT sld2.date_appro FROM stock_labo_daily sld2
                 WHERE sld2.labo_id = $1 AND sld2.ingredient_id = i.id AND sld2.type_appro IN ('manuel','transfert') AND sld2.quantite > 0
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
    // ── Baseline articles (lot 1b) : moteur unique stockService.computeStockBulk (§2.2) ──
    // { [ingredientId]: { stock, pmpHT, pmpTTC, detail } } — même CTE (règle unique §2.1,
    // PMP §2.3 : réceptions 'transfert' comptées), même formule PMP que l'ancien bloc.
    const bulk = await computeStockBulk(pool, 'labo', laboId);

    const ingredientRows = result.rows.map((row) => {
      const totalTransfere = parseFloat(row.total_transfere);
      const e = bulk[row.ingredient_id] || null;
      const b = e ? e.detail : {};
      const quantite = e ? e.stock : 0;
      const pertesDepuisInv = b.hasInv ? b.postPertesQty : b.allPertesQty;
      const ptUsageDepuisInv = b.hasInv ? b.postPtUsageQty : b.allPtUsageQty;
      const transfertsDepuisInv = b.hasInv ? b.postTransferQty : b.allTransferQty;
      // PMP HT/TTC = stockService (inventaire valorisé au pmp_hist seulement s'il a une base
      // de coût — sinon exclu du dénominateur, cf. stockService.pmpLaboFromDetail).
      const pmpUnitHT = e ? e.pmpHT : null;
      const pmpTTC = e ? e.pmpTTC : null;
      const coutTotal = pmpUnitHT !== null && quantite > 0 ? Math.round(quantite * pmpUnitHT * 1000) / 1000 : 0;
      const coutTotalTTC = pmpTTC !== null && quantite > 0 ? Math.round(quantite * pmpTTC * 1000) / 1000 : 0;
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
        ventesAcheteursDepuisInv: b.hasInv ? (b.postVentesAchQty ?? 0) : (b.allVentesAchQty ?? 0),
        // Appros positives (mêmes quantités que la base de coût PMP) pour la ventilation.
        approDepuisInv: b.hasInv ? (b.approCostPostQty ?? 0) : (b.approCostAllQty ?? 0),
      };
    });

    // ── PT products for this labo ──────────────────────────────────────────────
    const ptResult = await pool.query(`
      SELECT p.id as produit_id, p.nom, p.type, p.origine,
        a.id as activite_id, a.nom as activite_nom,
        lps.seuil_min,
        COALESCE(SUM(slpt.quantite) FILTER (WHERE date_trunc('year', slpt.date_appro) = date_trunc('year', CURRENT_DATE)), 0) as total_quantite,
        COALESCE(
          AVG(slpt.prix_unitaire) FILTER (WHERE date_trunc('year', slpt.date_appro) = date_trunc('year', CURRENT_DATE) AND slpt.quantite > 0)
          * SUM(slpt.quantite) FILTER (WHERE date_trunc('year', slpt.date_appro) = date_trunc('year', CURRENT_DATE))
        , 0) as cout_total,
        (SELECT slpt2.prix_unitaire FROM stock_labo_pt_daily slpt2 WHERE slpt2.labo_id = $1 AND slpt2.produit_id = p.id AND slpt2.quantite > 0 AND slpt2.prix_unitaire IS NOT NULL ORDER BY slpt2.date_appro DESC, slpt2.id DESC LIMIT 1) as prix_unitaire,
        (SELECT slpt2.date_appro FROM stock_labo_pt_daily slpt2 WHERE slpt2.labo_id = $1 AND slpt2.produit_id = p.id AND slpt2.quantite > 0 AND slpt2.prix_unitaire IS NOT NULL ORDER BY slpt2.date_appro DESC, slpt2.id DESC LIMIT 1) as date_appro,
        ARRAY(SELECT DISTINCT slpt2.date_appro FROM stock_labo_pt_daily slpt2
              WHERE slpt2.labo_id = $1 AND slpt2.produit_id = p.id AND slpt2.quantite > 0
              ORDER BY slpt2.date_appro DESC LIMIT 30) as recent_dates,
        ARRAY(SELECT DISTINCT lt2.date_transfert FROM labo_transfers lt2
              WHERE lt2.labo_id = $1 AND lt2.produit_id = p.id
              ORDER BY lt2.date_transfert DESC LIMIT 30) as recent_transfer_dates,
        -- Prix partiel : au moins un composant de la recette sans prix au labo (article via
        -- la fenêtre PMP, ou sous-PT sans prix courant). Le front masque alors le prix.
        (
          EXISTS (
            SELECT 1 FROM produit_ingredients pip
            WHERE pip.produit_id = p.id
              AND (SELECT SUM(sldp.quantite * sldp.prix_unitaire) / NULLIF(SUM(sldp.quantite), 0)
                   FROM stock_labo_daily sldp
                   WHERE sldp.labo_id = $1 AND sldp.ingredient_id = pip.ingredient_id
                     AND sldp.type_appro IN ('manuel','transfert') AND sldp.prix_unitaire IS NOT NULL AND sldp.quantite > 0
                     AND sldp.date_appro >= COALESCE(
                       (SELECT date_inventaire FROM inventaires WHERE labo_id = $1 AND ingredient_id = pip.ingredient_id ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
                       (SELECT MIN(date_appro) FROM stock_labo_daily WHERE labo_id = $1 AND ingredient_id = pip.ingredient_id AND quantite > 0)
                     )
                  ) IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM produit_sous_produits pspp
            WHERE pspp.produit_id = p.id
              AND (SELECT slpt3.prix_unitaire FROM stock_labo_pt_daily slpt3
                    WHERE slpt3.labo_id = $1 AND slpt3.produit_id = pspp.sous_produit_id
                      AND slpt3.quantite > 0 AND slpt3.prix_unitaire IS NOT NULL
                    ORDER BY slpt3.date_appro DESC, slpt3.id DESC LIMIT 1) IS NULL
          )
        ) as prix_partiel,
        (
          COALESCE((SELECT SUM(pi2.portion * (
             SELECT SUM(sld2.quantite * sld2.prix_unitaire) / NULLIF(SUM(sld2.quantite), 0) FROM stock_labo_daily sld2
             WHERE sld2.labo_id = $1 AND sld2.ingredient_id = pi2.ingredient_id
               AND sld2.type_appro IN ('manuel','transfert') AND sld2.prix_unitaire IS NOT NULL AND sld2.prix_unitaire > 0 AND sld2.quantite > 0
               AND sld2.date_appro >= COALESCE(
                 (SELECT date_inventaire FROM inventaires WHERE labo_id = $1 AND ingredient_id = pi2.ingredient_id ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
                 (SELECT MIN(date_appro) FROM stock_labo_daily WHERE labo_id = $1 AND ingredient_id = pi2.ingredient_id AND quantite > 0)
               )
          )) FROM produit_ingredients pi2 WHERE pi2.produit_id = p.id), 0)
          +
          COALESCE((SELECT SUM(psp.portion * (
             SELECT COALESCE(SUM(pi3.portion * (
                SELECT SUM(sld3.quantite * sld3.prix_unitaire) / NULLIF(SUM(sld3.quantite), 0) FROM stock_labo_daily sld3
                WHERE sld3.labo_id = $1 AND sld3.ingredient_id = pi3.ingredient_id
                  AND sld3.type_appro IN ('manuel','transfert') AND sld3.prix_unitaire IS NOT NULL AND sld3.prix_unitaire > 0 AND sld3.quantite > 0
                  AND sld3.date_appro >= COALESCE(
                    (SELECT date_inventaire FROM inventaires WHERE labo_id = $1 AND ingredient_id = pi3.ingredient_id ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
                    (SELECT MIN(date_appro) FROM stock_labo_daily WHERE labo_id = $1 AND ingredient_id = pi3.ingredient_id AND quantite > 0)
                  )
             )), 0) FROM produit_ingredients pi3 WHERE pi3.produit_id = psp.sous_produit_id
          )) FROM produit_sous_produits psp WHERE psp.produit_id = p.id), 0)
        ) as prix_calcule
      FROM labo_pt_selections lps
      JOIN produits p ON p.id = lps.produit_id
      LEFT JOIN activites a ON a.id = p.activite_id
      LEFT JOIN stock_labo_pt_daily slpt ON slpt.produit_id = p.id AND slpt.labo_id = $1
      WHERE lps.labo_id = $1
      GROUP BY p.id, p.nom, p.type, p.origine, a.id, a.nom, lps.seuil_min
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
         -- qty = mouvement net (productions + conso 'PT' + miroirs négatifs de transfert) ;
         -- pos_qty = entrées positives seules (productions/réceptions) pour la ventilation affichée.
         SELECT slpt.produit_id, SUM(slpt.quantite) as qty,
                COALESCE(SUM(slpt.quantite) FILTER (WHERE slpt.quantite > 0), 0) as pos_qty
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
       post_transfers AS (
         SELECT lt.produit_id, SUM(lt.quantite) as qty
         FROM labo_transfers lt
         JOIN last_inv li ON li.produit_id = lt.produit_id AND lt.date_transfert >= li.date_inventaire
         WHERE lt.labo_id = $1 AND lt.produit_id IS NOT NULL
         GROUP BY lt.produit_id
       ),
       all_appro AS (
         SELECT produit_id, SUM(quantite) as qty,
                COALESCE(SUM(quantite) FILTER (WHERE quantite > 0), 0) as pos_qty
         FROM stock_labo_pt_daily
         WHERE labo_id = $1
         GROUP BY produit_id
       ),
       all_transfers AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM labo_transfers
         WHERE labo_id = $1 AND produit_id IS NOT NULL
         GROUP BY produit_id
       ),
       all_pertes AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM labo_pertes
         WHERE labo_id = $1 AND produit_id IS NOT NULL
         GROUP BY produit_id
       ),
       avg_prix_post AS (
         -- quantite > 0 : n'agrège que les entrées valorisées (production/réception), pas les consommations 'PT' (négatives, désormais valorisées).
         SELECT slpt.produit_id, AVG(slpt.prix_unitaire) as avg_prix
         FROM stock_labo_pt_daily slpt
         JOIN last_inv li ON li.produit_id = slpt.produit_id AND slpt.date_appro >= li.date_inventaire
         WHERE slpt.labo_id = $1 AND slpt.prix_unitaire IS NOT NULL AND slpt.quantite > 0
         GROUP BY slpt.produit_id
       ),
       avg_prix_all AS (
         SELECT produit_id, AVG(prix_unitaire) as avg_prix
         FROM stock_labo_pt_daily
         WHERE labo_id = $1 AND prix_unitaire IS NOT NULL AND quantite > 0
         GROUP BY produit_id
       ),
       post_ventes_ach AS (
         -- Ventes aux acheteurs (module Acheteurs) : flux des commandes VALIDÉES
         SELECT cal.article_id AS produit_id, SUM(cal.quantite_unites) as qty
         FROM commande_acheteur_lignes cal
         JOIN commandes_acheteur ca ON ca.id = cal.commande_id
         JOIN last_inv li ON li.produit_id = cal.article_id AND COALESCE(ca.date_expedition, ca.date_commande) >= li.date_inventaire
         WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree') AND cal.article_type = 'produit'
         GROUP BY cal.article_id
       ),
       all_ventes_ach AS (
         SELECT cal.article_id AS produit_id, SUM(cal.quantite_unites) as qty
         FROM commande_acheteur_lignes cal
         JOIN commandes_acheteur ca ON ca.id = cal.commande_id
         WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree') AND cal.article_type = 'produit'
         GROUP BY cal.article_id
       )
       SELECT lps.produit_id,
              li.quantite_reelle       as inv_qty,
              li.date_inventaire       as inv_date,
              COALESCE(pa.qty, 0)      as post_appro_qty,
              COALESCE(pa.pos_qty, 0)  as post_pos_appro_qty,
              COALESCE(pp.qty, 0)      as post_pertes_qty,
              COALESCE(pt.qty, 0)      as post_transfers_qty,
              app.avg_prix             as avg_prix_post,
              COALESCE(aa.qty, 0)      as all_appro_qty,
              COALESCE(aa.pos_qty, 0)  as all_pos_appro_qty,
              COALESCE(ap.qty, 0)      as all_pertes_qty,
              COALESCE(atr.qty, 0)     as all_transfers_qty,
              COALESCE(pva.qty, 0)     as post_ventes_ach_qty,
              COALESCE(ava.qty, 0)     as all_ventes_ach_qty,
              apy.avg_prix             as avg_prix_all
       FROM labo_pt_selections lps
       LEFT JOIN last_inv li        ON li.produit_id  = lps.produit_id
       LEFT JOIN post_appro pa      ON pa.produit_id  = lps.produit_id
       LEFT JOIN post_pertes pp     ON pp.produit_id  = lps.produit_id
       LEFT JOIN post_transfers pt  ON pt.produit_id  = lps.produit_id
       LEFT JOIN avg_prix_post app  ON app.produit_id = lps.produit_id
       LEFT JOIN all_appro aa      ON aa.produit_id  = lps.produit_id
       LEFT JOIN all_pertes ap     ON ap.produit_id  = lps.produit_id
       LEFT JOIN all_transfers atr ON atr.produit_id = lps.produit_id
       LEFT JOIN post_ventes_ach pva ON pva.produit_id = lps.produit_id
       LEFT JOIN all_ventes_ach ava ON ava.produit_id = lps.produit_id
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
        postPosApproQty: parseFloat(r.post_pos_appro_qty) || 0,
        postPertesQty: parseFloat(r.post_pertes_qty) || 0,
        postTransfersQty: parseFloat(r.post_transfers_qty) || 0,
        avgPrixPost: r.avg_prix_post !== null ? parseFloat(r.avg_prix_post) : null,
        allApproQty: parseFloat(r.all_appro_qty) || 0,
        allPosApproQty: parseFloat(r.all_pos_appro_qty) || 0,
        allPertesQty: parseFloat(r.all_pertes_qty) || 0,
        allTransfersQty: parseFloat(r.all_transfers_qty) || 0,
        postVentesAchQty: parseFloat(r.post_ventes_ach_qty) || 0,
        allVentesAchQty: parseFloat(r.all_ventes_ach_qty) || 0,
        avgPrixAll: r.avg_prix_all !== null ? parseFloat(r.avg_prix_all) : null,
      };
    }

    const ptRows = ptResult.rows.map((row) => {
      const prixCalcule = row.prix_calcule !== null ? parseFloat(row.prix_calcule) : null;
      const prixUnitaire = row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : (prixCalcule && prixCalcule > 0 ? prixCalcule : null);
      const pb = ptBaselineMap[row.produit_id] || {};
      const quantite = pb.hasInv
        ? pb.invQty + pb.postApproQty - pb.postPertesQty - pb.postVentesAchQty
        : pb.allApproQty - pb.allPertesQty - pb.allVentesAchQty;
      const avgPrix = pb.hasInv ? (pb.avgPrixPost ?? pb.avgPrixAll ?? null) : (pb.avgPrixAll ?? null);
      const pertesDepuisInv = pb.hasInv ? pb.postPertesQty : pb.allPertesQty;
      return {
        ingredientId: -(row.produit_id),
        produitId: row.produit_id,
        isPT: true,
        type: row.type || 'vendable',
        origine: row.origine || 'activite',
        nom: row.nom,
        unite: 'unité',
        categorie: ptCategorie(row.type, row.origine),
        prixPartiel: row.prix_partiel === true,
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
        // Ventilation du stock actuel (comme le stock activité) : appros positives,
        // transferts sortants (affichés en négatif par le front).
        approDepuisInv: pb.hasInv ? (pb.postPosApproQty ?? 0) : (pb.allPosApproQty ?? 0),
        transfertsDepuisInv: pb.hasInv ? (pb.postTransfersQty ?? 0) : (pb.allTransfersQty ?? 0),
        ventesAcheteursDepuisInv: pb.hasInv ? (pb.postVentesAchQty ?? 0) : (pb.allVentesAchQty ?? 0),
      };
    });

    // Source de vérité UNIQUE du coût d'un PT composé : on recalcule prixCalcule avec la
    // MÊME fonction que la fiche technique (mode MP) → stock/transfert == FT-MP garanti.
    // = PMP pondéré des appros manuels (prix>0) de chaque article de la recette depuis le
    // dernier inventaire du labo.
    if (ptRows.length > 0) {
      try {
        const { buildMpPriceMapLabo, calculerCoutAvecPrixMap } = require('./produitsController');
        const ownerId = req.user.gerant_parent_id || req.user.id;
        const mpMap = await buildMpPriceMapLabo(laboId);
        await Promise.all(ptRows.map(async (row) => {
          try {
            const r = await calculerCoutAvecPrixMap(row.produitId, ownerId, mpMap);
            const c = r && r.cout_total != null ? parseFloat(r.cout_total) : null;
            if (c != null && c > 0) {
              row.prixCalcule = c;
              if (row.prixUnitaire == null) row.prixUnitaire = c;
            }
          } catch { /* repli sur la valeur SQL */ }
        }));
      } catch { /* repli sur les valeurs SQL */ }
    }

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
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

    if (ingredientIdRaw < 0) {
      // Lot 1b §3.3 : un labo dont l'unité est production_active = false ne fabrique pas de PT.
      const uniteProd = await unitesOp.getUniteByRef(pool, 'labo', laboId);
      if (uniteProd && uniteProd.productionActive === false) {
        return res.status(400).json({ code: 'PRODUCTION_INACTIVE', message: 'La production [[de:pt:pl]] est désactivée pour [[ce:labo]].' });
      }
      // PT product appro — auto-calculate prix from recipe using last labo ingredient prices
      const produitId = -ingredientIdRaw;
      const qty = parseFloat(quantite) || 0;

      // Get product name for type_appro label and recipe ingredients with last labo prices
      const [prodRes, ingRes, spRes] = await Promise.all([
        pool.query(`SELECT nom FROM produits WHERE id = $1`, [produitId]),
        // PMP de déduction : HT ET TTC (COALESCE — TVA absente ⇒ TTC = HT), mêmes filtres.
        pool.query(
          `SELECT pi.ingredient_id, pi.portion, i.nom as ing_nom,
             (SELECT SUM(sld.quantite * sld.prix_unitaire) / NULLIF(SUM(sld.quantite), 0)
              FROM stock_labo_daily sld
              WHERE sld.labo_id = $2 AND sld.ingredient_id = pi.ingredient_id
                AND sld.quantite > 0 AND sld.prix_unitaire IS NOT NULL
                AND sld.type_appro IN ('manuel','transfert')
                AND sld.date_appro >= COALESCE(
                  (SELECT date_inventaire FROM inventaires
                   WHERE labo_id = $2 AND ingredient_id = pi.ingredient_id
                   ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
                  (SELECT MIN(date_appro) FROM stock_labo_daily
                   WHERE labo_id = $2 AND ingredient_id = pi.ingredient_id AND quantite > 0)
                )
             ) AS last_prix,
             (SELECT SUM(sld.quantite * COALESCE(sld.prix_unitaire_tva, sld.prix_unitaire)) / NULLIF(SUM(sld.quantite), 0)
              FROM stock_labo_daily sld
              WHERE sld.labo_id = $2 AND sld.ingredient_id = pi.ingredient_id
                AND sld.quantite > 0 AND sld.prix_unitaire IS NOT NULL
                AND sld.type_appro IN ('manuel','transfert')
                AND sld.date_appro >= COALESCE(
                  (SELECT date_inventaire FROM inventaires
                   WHERE labo_id = $2 AND ingredient_id = pi.ingredient_id
                   ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
                  (SELECT MIN(date_appro) FROM stock_labo_daily
                   WHERE labo_id = $2 AND ingredient_id = pi.ingredient_id AND quantite > 0)
                )
             ) AS last_prix_ttc
           FROM produit_ingredients pi
           JOIN articles i ON i.id = pi.ingredient_id
           WHERE pi.produit_id = $1`,
          [produitId, laboId]
        ),
        // Sous-PT de composition + dernier prix d'appro (positif) du sous-PT au labo
        pool.query(
          `SELECT psp.sous_produit_id, psp.portion, p.nom AS sp_nom,
             (SELECT slpt.prix_unitaire FROM stock_labo_pt_daily slpt
               WHERE slpt.labo_id = $2 AND slpt.produit_id = psp.sous_produit_id
                 AND slpt.quantite > 0 AND slpt.prix_unitaire IS NOT NULL
               ORDER BY slpt.date_appro DESC, slpt.id DESC LIMIT 1) AS last_prix
           FROM produit_sous_produits psp
           JOIN produits p ON p.id = psp.sous_produit_id
           WHERE psp.produit_id = $1`,
          [produitId, laboId]
        ),
      ]);
      const produitNom = prodRes.rows[0]?.nom ?? 'PT';

      // Build custom portions map (articles ET sous-PT cohabitent dans le même tableau customPortions)
      const customPortionsMap = {};
      const customSpMap = {};
      if (Array.isArray(customPortions)) {
        for (const cp of customPortions) {
          if (cp.sousProduitId != null) customSpMap[cp.sousProduitId] = parseFloat(cp.portionCustom);
          else if (cp.ingredientId != null) customPortionsMap[cp.ingredientId] = parseFloat(cp.portionCustom);
        }
      }

      let prixCalcule = 0;
      for (const ing of ingRes.rows) {
        const portion = customPortionsMap[ing.ingredient_id] ?? parseFloat(ing.portion);
        if (ing.last_prix !== null) {
          // Repli du prix PT en TTC (la ligne PT est TTC par convention) — plus de repli HT.
          prixCalcule += portion * parseFloat(ing.last_prix_ttc ?? ing.last_prix);
        }
      }
      // Le coût du PT inclut aussi ses sous-PT de composition (dernier prix d'appro du sous-PT).
      for (const sp of spRes.rows) {
        const portion = customSpMap[sp.sous_produit_id] ?? parseFloat(sp.portion);
        if (sp.last_prix !== null) {
          prixCalcule += portion * parseFloat(sp.last_prix);
        }
      }
      // Prix du PT = coût recette RÉCURSIF au PMP (même source de vérité que l'affichage getLaboPT
      // et la fiche technique). On calcule aussi le coût récursif de chaque sous-PT pour valoriser
      // sa ligne de consommation. Repli sur le calcul par boucles (prixCalcule) puis prix manuel.
      const spCosts = {};
      {
        const { buildMpPriceMapLabo, calculerCoutAvecPrixMap } = require('./produitsController');
        const ownerId = req.user.gerant_parent_id || req.user.id;
        try {
          const mpMap = await buildMpPriceMapLabo(laboId);
          const [parentCout, ...spCoutList] = await Promise.all([
            calculerCoutAvecPrixMap(produitId, ownerId, mpMap),
            ...spRes.rows.map((sp) => calculerCoutAvecPrixMap(sp.sous_produit_id, ownerId, mpMap)),
          ]);
          const rc = parentCout && parentCout.cout_total != null ? parseFloat(parentCout.cout_total) : 0;
          if (rc > 0) prixCalcule = rc;
          spRes.rows.forEach((sp, i) => {
            const c = spCoutList[i] && spCoutList[i].cout_total != null ? parseFloat(spCoutList[i].cout_total) : null;
            spCosts[sp.sous_produit_id] = c != null && c > 0 ? c : null;
          });
        } catch { /* repli sur prixCalcule des boucles */ }
      }
      const finalPrix = prixCalcule > 0 ? prixCalcule : (prixUnitaire ? parseFloat(prixUnitaire) : null);
      const customPortionsJson = (Object.keys(customPortionsMap).length > 0 || Object.keys(customSpMap).length > 0) ? JSON.stringify(customPortions) : null;

      // Atomic: producing a PT (insert PT row + deduct each recipe ingredient) must be
      // all-or-nothing, else the PT is recorded while ingredients are only partly deducted.
      // Référence auto du PT FABRIQUÉ (initiales + YY) — portée par la ligne de production
      // ET par toutes les lignes de consommation, pour identifier la production d'origine.
      const ptRef = buildAutoRef(produitNom, da);
      await withTransaction(async (client) => {
        // Lot 1b §2.4 : verrou stock du labo (même espace que les transferts) PUIS contrôle de
        // stock DANS la transaction (stockService sur le client) — plus de course avec un transfert.
        await transfertService.lockStockLabo(client, laboId);
        if (ingRes.rows.length > 0 && qty > 0) {
          for (const ing of ingRes.rows) {
            const portion = customPortionsMap[ing.ingredient_id] ?? parseFloat(ing.portion);
            const needed  = portion * qty;
            const stockCourant = await computeStock(client, 'labo', laboId, { articleId: ing.ingredient_id });
            if (needed > stockCourant) {
              throw new TransfertError(422, 'STOCK_INSUFFISANT',
                `[[Nom:stock]] [[acc:stock:insuffisant:insuffisante]] pour "${ing.ing_nom}" ([[court:recette]]) : disponible ${Math.max(0, stockCourant)}, nécessaire ${Math.round(needed * 1000) / 1000}`,
                { disponible: Math.max(0, stockCourant), demande: needed });
            }
          }
        }
        if (spRes.rows.length > 0 && qty > 0) {
          for (const sp of spRes.rows) {
            const portion = customSpMap[sp.sous_produit_id] ?? parseFloat(sp.portion);
            const needed = portion * qty;
            const stockSp = await computeStock(client, 'labo', laboId, { produitId: sp.sous_produit_id });
            if (needed > stockSp) {
              throw new TransfertError(422, 'STOCK_INSUFFISANT',
                `[[Nom:stock]] [[acc:stock:insuffisant:insuffisante]] pour le sous-produit "${sp.sp_nom}" ([[court:recette]]) : disponible ${Math.max(0, stockSp)}, nécessaire ${Math.round(needed * 1000) / 1000}`,
                { disponible: Math.max(0, stockSp), demande: needed });
            }
          }
        }

        // Traçabilité (migr 138) : fournisseur AUTO ; TVA 0 pour un PT → TTC = coût.
        const autoFournisseurId = await getAutoFournisseurIdForLabo(client, laboId, req.user.id);

        // Save PT appro — always insert a new row (multiple rows per day allowed)
        await client.query(
          `INSERT INTO stock_labo_pt_daily (labo_id, produit_id, date_appro, quantite, prix_unitaire, custom_portions, type_appro, fournisseur_id, ref_facture, taux_tva, prix_unitaire_tva, updated_at, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'manuel', $7, $8, 0, $5, NOW(), $9)`,
          [laboId, produitId, da, qty, finalPrix, customPortionsJson, autoFournisseurId, ptRef, req.user.id]
        );

        // Deduct recipe ingredients from labo ingredient stock (negative entries),
        // valorisées à la PMP réelle HT ET TTC (TVA absente ⇒ taux 0, TTC = HT) ;
        // taux dérivé du ratio TTC/HT pour la cohérence arithmétique de la ligne.
        if (ingRes.rows.length > 0 && qty > 0) {
          for (const ing of ingRes.rows) {
            const portion = customPortionsMap[ing.ingredient_id] ?? parseFloat(ing.portion);
            const consumed = -(portion * qty);
            const pmpHt = parseFloat(ing.last_prix) || 0;
            const pmpTtc = ing.last_prix_ttc != null ? parseFloat(ing.last_prix_ttc) : pmpHt;
            const tauxEff = pmpHt > 0 ? Math.round(((pmpTtc / pmpHt) - 1) * 10000) / 100 : 0;
            await client.query(
              `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, fournisseur_id, ref_facture, type_appro, updated_at, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PT', NOW(), $10)`,
              [laboId, ing.ingredient_id, da, consumed, pmpHt, tauxEff, pmpTtc, autoFournisseurId, ptRef, req.user.id]
            );
          }
        }

        // Déduire les sous-PT de composition (un seul niveau) du stock PT du labo.
        // Ligne de consommation : quantité négative, prix = coût récursif du sous-PT, type_appro='PT'
        // (réduit le stock du sous-PT sans être comptée comme appro/transfert/vente ; le prix
        //  n'entre pas dans le PMP car les CTE de moyenne filtrent quantite > 0).
        if (spRes.rows.length > 0 && qty > 0) {
          for (const sp of spRes.rows) {
            const portion = customSpMap[sp.sous_produit_id] ?? parseFloat(sp.portion);
            const consumed = -(portion * qty);
            await client.query(
              `INSERT INTO stock_labo_pt_daily (labo_id, produit_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture, taux_tva, prix_unitaire_tva, updated_at, created_by)
               VALUES ($1, $2, $3, $4, $5, 'PT', $6, $7, 0, $5, NOW(), $8)`,
              [laboId, sp.sous_produit_id, da, consumed, spCosts[sp.sous_produit_id] ?? null, autoFournisseurId, ptRef, req.user.id]
            );
          }
        }
      });

      return res.json({ success: true, prixCalcule: finalPrix });
    }

    const tva = tauxTva != null ? parseFloat(tauxTva) : 0;
    const prixUnitaireTva = prixUnitaire != null ? parseFloat(prixUnitaire) * (1 + tva / 100) : null;
    // Atomic: the labo stock row and its linked facture are written together (or not at all).
    await withTransaction(async (client) => {
      const laboInsRes = await client.query(
        `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, fournisseur_id, ref_facture, taux_tva, prix_unitaire_tva, type_appro, updated_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manuel', NOW(), $10)
         RETURNING id`,
        [laboId, ingredientIdRaw, da, quantite ?? null, prixUnitaire ?? null, fournisseurId || null, refFacture || null, tva, prixUnitaireTva, req.user.id]
      );
      if (refFacture) {
        const laboClientRes = await client.query(
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
          }, client);
        }
      }
    });
    res.json({ success: true });
  } catch (err) {
    if (replyTransfertError(res, err)) return;
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getLaboStockHistory = async (req, res) => {
  const { laboId } = req.params;
  const ingredientIdRaw = parseInt(req.params.ingredientId);
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

    if (ingredientIdRaw < 0) {
      const produitId = -ingredientIdRaw;
      // Historique complet des mouvements PT (gestion de stock) : production/consommation (stock_labo_pt_daily),
      // transferts (labo_transfers) et pertes (labo_pertes), avec leur type_appro pour la colonne TYPE.
      const result = await pool.query(
        `SELECT * FROM (
           SELECT slpt.date_appro AS d, slpt.quantite, slpt.prix_unitaire AS prix, COALESCE(slpt.type_appro, 'manuel') AS type,
                  slpt.ref_facture AS ref, COALESCE(slpt.taux_tva, 0) AS tva,
                  COALESCE(slpt.prix_unitaire_tva, slpt.prix_unitaire) AS ttc,
                  CASE WHEN slpt.type_appro = 'transfert' THEN COALESCE(lsrc.nom, f.nom) ELSE f.nom END AS fournisseur,
                  CASE WHEN slpt.type_appro = 'transfert' THEN 'entree' ELSE NULL END AS sens
           FROM stock_labo_pt_daily slpt
           LEFT JOIN fournisseurs f ON f.id = slpt.fournisseur_id
           LEFT JOIN labo_transfers ltx ON ltx.id = slpt.transfert_id
           LEFT JOIN labos lsrc ON lsrc.id = ltx.labo_id
           WHERE slpt.labo_id = $1 AND slpt.produit_id = $2
             AND (slpt.type_appro IN ('manuel','PT','transfert') OR (slpt.type_appro IS NULL AND slpt.quantite > 0))
           UNION ALL
           SELECT lt.date_transfert AS d, -lt.quantite AS quantite, lt.prix_unitaire AS prix, 'transfert' AS type,
                  lt.ref_facture AS ref, lt.taux_tva AS tva, lt.prix_unitaire_tva AS ttc, COALESCE(a.nom, ld.nom) AS fournisseur,
                  'sortie' AS sens
           FROM labo_transfers lt
           LEFT JOIN activites a ON a.id = lt.activite_id
           LEFT JOIN labos ld ON ld.id = lt.labo_dest_id
           WHERE lt.labo_id = $1 AND lt.produit_id = $2
           UNION ALL
           SELECT lp.date_perte AS d, -lp.quantite AS quantite, lp.prix_unitaire AS prix, 'perte' AS type,
                  NULL::text AS ref, NULL::numeric AS tva, lp.prix_unitaire_tva AS ttc, NULL::text AS fournisseur, NULL::text AS sens
           FROM labo_pertes lp
           WHERE lp.labo_id = $1 AND lp.produit_id = $2
           UNION ALL
           SELECT COALESCE(ca.date_expedition, ca.date_commande) AS d, -cal.quantite_unites AS quantite, cal.cout_unitaire_ttc AS prix, 'vente' AS type,
                  fa.numero AS ref, cal.taux_tva AS tva, cal.cout_unitaire_ttc AS ttc, COALESCE(ach.nom, ca.acheteur_nom) AS fournisseur, NULL::text AS sens
           FROM commande_acheteur_lignes cal
           JOIN commandes_acheteur ca ON ca.id = cal.commande_id
           LEFT JOIN acheteurs ach ON ach.id = ca.acheteur_id
           LEFT JOIN factures_acheteur fa ON fa.commande_id = ca.id
           WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree')
             AND cal.article_type = 'produit' AND cal.article_id = $2
         ) h
         ORDER BY d DESC, type LIMIT 15`,
        [laboId, produitId]
      );
      return res.json(result.rows.map((r) => ({
        dateAppro: isoDate(r.d),
        quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
        prixUnitaire: r.prix !== null ? parseFloat(r.prix) : null,
        typeAppro: r.type,
        refFacture: r.ref,
        fournisseurNom: r.fournisseur,
        tauxTva: r.tva !== null ? parseFloat(r.tva) : null,
        prixUnitaireTva: r.ttc !== null ? parseFloat(r.ttc) : null,
        // Lot 1b : sens d'un transfert ('entree' reçue d'un labo source | 'sortie') + contrepartie
        sens: r.sens || null,
        contrepartieNom: r.sens ? (r.fournisseur || null) : null,
      })));
    }

    // Lot 1b : sens / contrepartie des lignes de transfert — entrée 'transfert' (labo source via
    // transfert_id, sinon fournisseur is_labo) ; miroir de sortie ('manuel' < 0, transfert_id posé) →
    // activité ou labo destinataire.
    const result = await pool.query(
      `SELECT * FROM (
         SELECT sld.date_appro, sld.quantite, sld.prix_unitaire, sld.ref_facture,
                sld.type_appro, f.nom as fournisseur_nom, sld.taux_tva, sld.prix_unitaire_tva,
                CASE WHEN sld.type_appro = 'transfert' THEN 'entree'
                     WHEN sld.transfert_id IS NOT NULL AND sld.quantite < 0 THEN 'sortie' ELSE NULL END AS sens,
                CASE WHEN sld.type_appro = 'transfert' THEN COALESCE(lsrc.nom, fl.nom)
                     WHEN sld.transfert_id IS NOT NULL AND sld.quantite < 0 THEN COALESCE(ad.nom, ld.nom) ELSE NULL END AS contrepartie_nom
         FROM stock_labo_daily sld
         LEFT JOIN fournisseurs f ON f.id = sld.fournisseur_id
         LEFT JOIN labos fl ON fl.id = f.labo_id
         LEFT JOIN labo_transfers ltx ON ltx.id = sld.transfert_id
         LEFT JOIN labos lsrc ON lsrc.id = ltx.labo_id
         LEFT JOIN activites ad ON ad.id = ltx.activite_id
         LEFT JOIN labos ld ON ld.id = ltx.labo_dest_id
         WHERE sld.labo_id = $1 AND sld.ingredient_id = $2
         UNION ALL
         SELECT COALESCE(ca.date_expedition, ca.date_commande) AS date_appro, -cal.quantite_unites AS quantite,
                cal.cout_unitaire_ttc AS prix_unitaire, fa.numero AS ref_facture,
                'vente' AS type_appro, COALESCE(ach.nom, ca.acheteur_nom) AS fournisseur_nom,
                cal.taux_tva, cal.cout_unitaire_ttc AS prix_unitaire_tva,
                NULL::text AS sens, NULL::text AS contrepartie_nom
         FROM commande_acheteur_lignes cal
         JOIN commandes_acheteur ca ON ca.id = cal.commande_id
         LEFT JOIN acheteurs ach ON ach.id = ca.acheteur_id
         LEFT JOIN factures_acheteur fa ON fa.commande_id = ca.id
         WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree')
           AND cal.article_type = 'ingredient' AND cal.article_id = $2
       ) h
       ORDER BY date_appro DESC LIMIT 10`,
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
      sens: r.sens || null,
      contrepartieNom: r.contrepartie_nom || null,
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
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

    // Lot 1b : le fournisseur is_labo du labo SOURCE (labo_parent_id) est renvoyé en plus, marqué
    // isLabo (affiché « Transfert reçu de X », jamais éditable — fournisseurController refuse déjà).
    const result = await pool.query(
      `SELECT f.id, f.nom, f.telephone, f.is_labo
       FROM fournisseurs f
       JOIN fournisseur_labos fl ON fl.fournisseur_id = f.id
       WHERE fl.labo_id = $1
         AND (f.is_labo = false
              OR (f.is_labo = true AND f.labo_id = (SELECT l.labo_parent_id FROM labos l WHERE l.id = $1)))
       ORDER BY f.is_labo, f.nom`,
      [laboId]
    );
    res.json(result.rows.map((r) => ({ id: r.id, nom: r.nom, telephone: r.telephone, isLabo: r.is_labo === true })));
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
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

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
// Body: { dateTransfert, note, refFacture, tauxTva,
//         transfers: [{ activiteId? | laboDestId?, ingredientId (< 0 = PT), quantite, prixUnitaire? }] }
// Lot 1b : destination par ligne (activité = comportement historique à l'identique ; labo enfant =
// cession interne). Gardes, verrou pg_advisory_xact_lock, contrôle de stock en transaction et
// écritures dans transfertService (§2.4).
const createTransfer = async (req, res) => {
  const { laboId } = req.params;
  const { dateTransfert, note, refFacture, tauxTva, transfers } = req.body;

  if (!dateTransfert || !Array.isArray(transfers) || transfers.length === 0)
    return res.status(400).json({ message: 'dateTransfert et transfers requis' });

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });
    // Gérant : la source doit être dans son périmètre.
    if (!gerantAllowsLabo(req, laboId)) return res.status(403).json({ message: '[[Nom:labo]] hors de votre périmètre' });

    const out = await transfertService.createTransfert(pool, {
      sourceLaboId: parseInt(laboId, 10),
      clientId: req.user.gerant_parent_id || req.user.id,
      userId: req.user.id,
      dateTransfert,
      note,
      refFacture,
      tauxTva,
      transfers,
    });
    res.json(out);
  } catch (err) {
    if (replyTransfertError(res, err)) return;
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getTransferHistory = async (req, res) => {
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId, activiteId, laboDestId, limit } = req.query;
  const currentYear = new Date().getFullYear();

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

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
    const actIdNum = activiteId ? parseInt(activiteId, 10) : null;
    const laboDestIdNum = laboDestId ? parseInt(laboDestId, 10) : null;
    if ((activiteId && !Number.isInteger(actIdNum)) || (laboDestId && !Number.isInteger(laboDestIdNum))) {
      return res.status(400).json({ code: 'DESTINATION_INVALIDE', message: 'activiteId / laboDestId invalide' });
    }
    if (actIdNum != null) { params.push(actIdNum); extraWhere += ` AND lt.activite_id = $${params.length}`; }
    // Lot 1b : filtre sur un labo destinataire (cession interne labo → labo)
    if (laboDestIdNum != null) { params.push(laboDestIdNum); extraWhere += ` AND lt.labo_dest_id = $${params.length}`; }
    if (startDate) { params.push(startDate); extraWhere += ` AND lt.date_transfert >= $${params.length}`; }
    if (endDate) { params.push(endDate); extraWhere += ` AND lt.date_transfert <= $${params.length}`; }

    // Lot 1b : destination = activité OU labo enfant (LEFT JOIN — un JOIN strict ferait disparaître
    // les cessions labo → labo) ; destType/destNom exposés, activiteId/activiteNom conservés.
    const destCols = `a.id as activite_id, a.nom as activite_nom, lt.labo_dest_id, ld.nom as labo_dest_nom,
                CASE WHEN lt.labo_dest_id IS NOT NULL THEN 'labo' ELSE 'activite' END as dest_type,
                COALESCE(a.nom, ld.nom) as dest_nom`;
    const destJoins = `LEFT JOIN activites a ON a.id = lt.activite_id
         LEFT JOIN labos ld ON ld.id = lt.labo_dest_id`;
    const mapDest = (r) => ({
      activiteId: r.activite_id,
      activiteNom: r.activite_nom,
      laboDestId: r.labo_dest_id ?? null,
      destType: r.dest_type,
      destNom: r.dest_nom ?? null,
      destKey: r.labo_dest_id != null ? `l-${r.labo_dest_id}` : (r.activite_id != null ? `a-${r.activite_id}` : null),
    });

    let result;
    if (isPTQuery) {
      result = await pool.query(
        `SELECT lt.id, lt.quantite, lt.date_transfert, lt.note, lt.ref_facture, lt.created_at,
                lt.prix_unitaire, lt.taux_tva, lt.prix_unitaire_tva,
                p.id as produit_id, p.nom as produit_nom, p.type, p.origine,
                ${destCols}
         FROM labo_transfers lt
         JOIN produits p ON p.id = lt.produit_id
         ${destJoins}
         WHERE lt.labo_id = $1 AND lt.date_transfert >= make_date($2::int, 1, 1) AND lt.date_transfert < make_date($2::int + 1, 1, 1)${extraWhere}
         ORDER BY lt.date_transfert DESC, lt.created_at DESC LIMIT ${limit ? parseInt(limit, 10) : 2000}`,
        params
      );
      return res.json(result.rows.map((r) => ({
        id: r.id,
        quantite: parseFloat(r.quantite),
        dateTransfert: isoDate(r.date_transfert),
        note: r.note,
        refFacture: r.ref_facture,
        createdAt: r.created_at,
        // Prix de cession du transfert (PT : TVA 0 → HT = TTC)
        prixUnitaire: r.prix_unitaire != null ? parseFloat(r.prix_unitaire) : null,
        tauxTva: r.taux_tva != null ? parseFloat(r.taux_tva) : null,
        prixUnitaireTva: r.prix_unitaire_tva != null ? parseFloat(r.prix_unitaire_tva) : null,
        ingredientId: -(r.produit_id),
        ingredientNom: r.produit_nom,
        uniteNom: 'unité',
        categorieNom: ptCategorie(r.type, r.origine),
        ...mapDest(r),
      })));
    }

    // LEFT JOIN articles + produits : inclut aussi les transferts de Produits Transformés
    // (ligne PT : produit_id renseigné, ingredient_id NULL → exclus par un JOIN articles strict).
    result = await pool.query(
      `SELECT lt.id, lt.quantite, lt.date_transfert, lt.note, lt.ref_facture, lt.created_at,
              lt.prix_unitaire, lt.taux_tva, lt.prix_unitaire_tva,
              lt.created_by, ub.nom as created_by_nom,
              lt.ingredient_id, lt.produit_id,
              COALESCE(i.nom, p.nom) as ingredient_nom,
              COALESCE(u.nom, 'unité') as unite_nom,
              ${destCols},
              COALESCE(c.nom, CASE WHEN lt.produit_id IS NOT NULL THEN (SELECT ${ptCategorieSql('pp')} FROM produits pp WHERE pp.id = lt.produit_id) ELSE 'Sans catégorie' END) as categorie_nom
       FROM labo_transfers lt
       LEFT JOIN articles i ON i.id = lt.ingredient_id
       LEFT JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN produits p ON p.id = lt.produit_id
       ${destJoins}
       LEFT JOIN utilisateurs ub ON ub.id = lt.created_by
       WHERE lt.labo_id = $1 AND lt.date_transfert >= make_date($2::int, 1, 1) AND lt.date_transfert < make_date($2::int + 1, 1, 1)${extraWhere}
       ORDER BY lt.date_transfert DESC, lt.created_at DESC LIMIT ${limit ? parseInt(limit, 10) : 2000}`,
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
      ingredientId: r.produit_id != null ? -(r.produit_id) : r.ingredient_id,
      ingredientNom: r.ingredient_nom,
      uniteNom: r.unite_nom,
      categorieNom: r.categorie_nom,
      ...mapDest(r),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/labo/:laboId/historique
const getLaboHistorique = async (req, res) => {
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId, categorieId, fournisseurId, activiteId, typeFilter, refFacture, limit, offset, ptOnly, ptProduitId, ptType } = req.query;
  const parsedLimit = parseInt(limit, 10) || null;
  const parsedOffset = parseInt(offset, 10) || 0;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

    // activiteId implies we only care about transfers
    const includeManuel = (!typeFilter || typeFilter === 'manuel') && !activiteId;
    const includeTransfert = !typeFilter || typeFilter === 'transfert';
    // Ventes acheteurs (module Acheteurs) : sorties de stock, sans fournisseur ni activité
    const includeVentes = (!typeFilter || typeFilter === 'vente') && !activiteId && !fournisseurId;
    // Lot 1b : ENTRÉES reçues d'un labo source (lignes stock_labo_daily type 'transfert', sens 'entree') —
    // branche indépendante d'includeManuel, incluse quand typeFilter ∈ {vide, 'transfert'} ; jamais
    // quand un filtre activité est posé (une entrée n'a pas d'activité destinataire).
    const includeEntrees = (!typeFilter || typeFilter === 'transfert') && !activiteId;

    // Règle unique §2.1 (NULL-safe) : le miroir 'manuel' < 0 d'une sortie reste masqué ; les entrées
    // 'transfert' sont servies par entreesSql (pas par manuelSql) pour porter sens/contrepartie.
    const manuelConds = [`sld.labo_id = $1`, `COALESCE(sld.type_appro,'manuel') <> 'transfert'`, `NOT (COALESCE(sld.type_appro,'manuel') = 'manuel' AND sld.quantite < 0)`];
    const transferConds = [`lt.labo_id = $1`];
    const venteConds = [`ca.labo_id = $1`, `ca.statut IN ('expediee', 'livree')`];
    const params = [laboId];
    let idx = 2;

    if (startDate) {
      params.push(startDate);
      manuelConds.push(`sld.date_appro >= $${idx}`);
      transferConds.push(`lt.date_transfert >= $${idx}`);
      venteConds.push(`COALESCE(ca.date_expedition, ca.date_commande) >= $${idx}`);
      idx++;
    }
    if (endDate) {
      params.push(endDate);
      manuelConds.push(`sld.date_appro <= $${idx}`);
      transferConds.push(`lt.date_transfert <= $${idx}`);
      venteConds.push(`COALESCE(ca.date_expedition, ca.date_commande) <= $${idx}`);
      idx++;
    }
    if (ingredientId) {
      params.push(ingredientId);
      manuelConds.push(`sld.ingredient_id = $${idx}`);
      transferConds.push(`lt.ingredient_id = $${idx}`);
      venteConds.push(`(cal.article_type = 'ingredient' AND cal.article_id = $${idx})`);
      idx++;
    }
    if (categorieId) {
      params.push(categorieId);
      manuelConds.push(`i.categorie_id = $${idx}`);
      transferConds.push(`i.categorie_id = $${idx}`);
      venteConds.push(`i.categorie_id = $${idx}`);
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
      venteConds.push(`fa.numero ILIKE $${idx}`);
      idx++;
    }
    if (activiteId) {
      params.push(activiteId);
      transferConds.push(`lt.activite_id = $${idx}`);
      idx++;
    }

    // Mêmes filtres (dates, article, catégorie, fournisseur, réf) que manuelSql, base différente.
    const entreesConds = [`sld.labo_id = $1`, `sld.type_appro = 'transfert'`, ...manuelConds.slice(3)];

    const manuelSql = `
      SELECT sld.id, sld.ingredient_id, sld.date_appro, sld.quantite, sld.prix_unitaire,
             sld.ref_facture, sld.type_appro, sld.updated_at, sld.created_by,
             sld.taux_tva, sld.prix_unitaire_tva,
             i.nom as ingredient_nom, u.nom as unite_nom,
             COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
             f.nom as fournisseur_nom, f.id as fournisseur_id,
             NULL::int as activite_id, NULL::text as activite_nom,
             NULL::text as sens, NULL::text as contrepartie_nom, NULL::text as dest_type, NULL::int as labo_dest_id
      FROM stock_labo_daily sld
      JOIN articles i ON i.id = sld.ingredient_id
      JOIN unites u ON u.id = i.unite_id
      LEFT JOIN categories c ON c.id = i.categorie_id
      LEFT JOIN fournisseurs f ON f.id = sld.fournisseur_id
      WHERE ${manuelConds.join(' AND ')}`;

    // Entrées reçues d'un labo source : contrepartie = labo source (via transfert_id, sinon le
    // fournisseur is_labo porté par la ligne).
    const entreesSql = `
      SELECT sld.id, sld.ingredient_id, sld.date_appro, sld.quantite, sld.prix_unitaire,
             sld.ref_facture, 'transfert'::text as type_appro, sld.updated_at, sld.created_by,
             sld.taux_tva, sld.prix_unitaire_tva,
             i.nom as ingredient_nom, u.nom as unite_nom,
             COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
             f.nom as fournisseur_nom, f.id as fournisseur_id,
             NULL::int as activite_id, NULL::text as activite_nom,
             'entree'::text as sens, COALESCE(lsrc.nom, fl.nom) as contrepartie_nom, NULL::text as dest_type, NULL::int as labo_dest_id
      FROM stock_labo_daily sld
      JOIN articles i ON i.id = sld.ingredient_id
      JOIN unites u ON u.id = i.unite_id
      LEFT JOIN categories c ON c.id = i.categorie_id
      LEFT JOIN fournisseurs f ON f.id = sld.fournisseur_id
      LEFT JOIN labos fl ON fl.id = f.labo_id
      LEFT JOIN labo_transfers ltx ON ltx.id = sld.transfert_id
      LEFT JOIN labos lsrc ON lsrc.id = ltx.labo_id
      WHERE ${entreesConds.join(' AND ')}`;

    const transferSql = `
      SELECT lt.id, lt.ingredient_id, lt.date_transfert as date_appro, lt.quantite, lt.prix_unitaire,
             lt.ref_facture, 'transfert'::text as type_appro, lt.created_at as updated_at, lt.created_by,
             lt.taux_tva, lt.prix_unitaire_tva,
             i.nom as ingredient_nom, u.nom as unite_nom,
             COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
             NULL::text as fournisseur_nom, NULL::int as fournisseur_id,
             lt.activite_id, a.nom as activite_nom,
             'sortie'::text as sens, COALESCE(a.nom, ld.nom) as contrepartie_nom,
             CASE WHEN lt.labo_dest_id IS NOT NULL THEN 'labo' ELSE 'activite' END as dest_type, lt.labo_dest_id
      FROM labo_transfers lt
      JOIN articles i ON i.id = lt.ingredient_id
      JOIN unites u ON u.id = i.unite_id
      LEFT JOIN categories c ON c.id = i.categorie_id
      LEFT JOIN activites a ON a.id = lt.activite_id
      LEFT JOIN labos ld ON ld.id = lt.labo_dest_id
      WHERE ${transferConds.join(' AND ')}`;

    // Ventes acheteurs — ligne article OU produit composé (ids négatifs, convention front).
    // Le « fournisseur » affiché = l'acheteur (destinataire) ; prix = coût matière TTC figé.
    const venteSql = `
      SELECT cal.id, CASE WHEN cal.article_type = 'produit' THEN -cal.article_id ELSE cal.article_id END as ingredient_id,
             COALESCE(ca.date_expedition, ca.date_commande) as date_appro, -cal.quantite_unites as quantite, cal.cout_unitaire_ttc as prix_unitaire,
             fa.numero as ref_facture, 'vente'::text as type_appro, ca.created_at as updated_at, ca.created_by,
             cal.taux_tva, cal.cout_unitaire_ttc as prix_unitaire_tva,
             cal.designation as ingredient_nom, COALESCE(u.nom, 'unité') as unite_nom,
             CASE WHEN cal.article_type = 'produit' THEN ${ptCategorieSql('p')}
                  ELSE COALESCE(c.nom, 'Sans catégorie') END as categorie_nom,
             COALESCE(ach.nom, ca.acheteur_nom) as fournisseur_nom, NULL::int as fournisseur_id,
             NULL::int as activite_id, NULL::text as activite_nom,
             NULL::text as sens, NULL::text as contrepartie_nom, NULL::text as dest_type, NULL::int as labo_dest_id
      FROM commande_acheteur_lignes cal
      JOIN commandes_acheteur ca ON ca.id = cal.commande_id
      LEFT JOIN acheteurs ach ON ach.id = ca.acheteur_id
      LEFT JOIN factures_acheteur fa ON fa.commande_id = ca.id
      LEFT JOIN articles i ON cal.article_type = 'ingredient' AND i.id = cal.article_id
      LEFT JOIN unites u ON u.id = i.unite_id
      LEFT JOIN categories c ON c.id = i.categorie_id
      LEFT JOIN produits p ON cal.article_type = 'produit' AND p.id = cal.article_id
      WHERE ${venteConds.join(' AND ')}`;

    const parts = [];
    if (includeManuel) parts.push(manuelSql);
    if (includeEntrees) parts.push(entreesSql);
    if (includeTransfert) parts.push(transferSql);
    if (includeVentes) parts.push(venteSql);
    if (parts.length === 0) return res.json([]);

    const sql = `SELECT combined.*, ub.nom as created_by_nom
                 FROM (${parts.join(' UNION ALL ')}) combined
                 LEFT JOIN utilisateurs ub ON ub.id = combined.created_by
                 ORDER BY date_appro DESC, updated_at DESC
                 ${parsedLimit ? `LIMIT ${parsedLimit} OFFSET ${parsedOffset}` : ''}`;

    const result = await pool.query(sql, params);

    let rows = result.rows.map((r) => ({
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
      // Lot 1b : sens du transfert ('entree' reçue d'un labo source | 'sortie' vers une activité ou
      // un labo destinataire) et contrepartie (labo source | activité ou labo destinataire).
      sens: r.sens || null,
      contrepartieNom: r.contrepartie_nom || null,
      destType: r.dest_type || null,
      laboDestId: r.labo_dest_id || null,
      updatedAt: r.updated_at,
      createdBy: r.created_by ?? null,
      createdByNom: r.created_by_nom ?? null,
    }));

    // Fabrications de produits transformés (table séparée stock_labo_pt_daily) — incluses
    // par défaut quand aucun filtre article/catégorie/fournisseur, ou seules si ptOnly.
    // Convention front : ingredientId = -(produitId), catégorie « Produits Transformés ».
    const includePt = ptOnly === 'true'
      || (includeManuel && !ingredientId && !categorieId && !fournisseurId && !refFacture);
    if (includePt) {
      const ptParams = [laboId];
      let ptWhere = `slpt.labo_id = $1`;
      if (startDate) { ptParams.push(startDate); ptWhere += ` AND slpt.date_appro >= $${ptParams.length}`; }
      if (endDate) { ptParams.push(endDate); ptWhere += ` AND slpt.date_appro <= $${ptParams.length}`; }
      if (ptProduitId) { ptParams.push(ptProduitId); ptWhere += ` AND slpt.produit_id = $${ptParams.length}`; }
      if (ptType) ptWhere += ` AND ${ptTypeSql('p', ptType)}`;
      const ptRes = await pool.query(
        `SELECT slpt.id, slpt.produit_id, slpt.date_appro, slpt.quantite, slpt.prix_unitaire, slpt.updated_at, p.nom as produit_nom, p.type, p.origine,
                slpt.taux_tva, slpt.prix_unitaire_tva, slpt.ref_facture, slpt.fournisseur_id, f.nom AS fournisseur_nom, slpt.type_appro
         FROM stock_labo_pt_daily slpt
         JOIN produits p ON p.id = slpt.produit_id
         LEFT JOIN fournisseurs f ON f.id = slpt.fournisseur_id
         WHERE ${ptWhere}
         ORDER BY slpt.date_appro DESC`,
        ptParams
      );
      // Lot 1b : un PT REÇU d'un labo source (type_appro 'transfert') est servi comme une entrée de
      // transfert (typeAppro 'transfert', sens 'entree', contrepartie = labo source = fournisseur
      // is_labo), comme les articles — puce « Reçu » du front ; les productions restent 'produit_transformé'.
      const ptEntries = ptRes.rows.map((spt) => ({
        id: spt.id,
        ingredientId: -(spt.produit_id),
        ingredientNom: spt.produit_nom,
        uniteNom: 'unité',
        categorieNom: ptCategorie(spt.type, spt.origine),
        dateAppro: isoDate(spt.date_appro),
        quantite: spt.quantite !== null ? parseFloat(spt.quantite) : null,
        prixUnitaire: spt.prix_unitaire !== null ? parseFloat(spt.prix_unitaire) : null,
        tauxTva: spt.taux_tva !== null ? parseFloat(spt.taux_tva) : null,
        prixUnitaireTva: spt.prix_unitaire_tva !== null ? parseFloat(spt.prix_unitaire_tva) : null,
        refFacture: spt.ref_facture || null,
        typeAppro: spt.type_appro === 'transfert' ? 'transfert' : 'produit_transformé',
        fournisseurId: spt.fournisseur_id || null,
        fournisseurNom: spt.fournisseur_nom || null,
        activiteId: null,
        activiteNom: null,
        sens: spt.type_appro === 'transfert' ? 'entree' : null,
        contrepartieNom: spt.type_appro === 'transfert' ? (spt.fournisseur_nom || null) : null,
        destType: null,
        laboDestId: null,
        updatedAt: spt.updated_at,
        createdBy: null,
        createdByNom: null,
      }));
      rows = ptOnly === 'true'
        ? ptEntries
        : [...rows, ...ptEntries].sort((a, b) => (b.dateAppro || '').localeCompare(a.dateAppro || ''));
    }

    res.json(rows);
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
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

    const check = await pool.query(
      'SELECT id, created_by, type_appro, transfert_id FROM stock_labo_daily WHERE id = $1 AND labo_id = $2',
      [entryId, laboId]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
    if (req.user.role === 'gerant' && check.rows[0].created_by !== req.user.id)
      return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres enregistrements.' });
    // Lot 1b §2.4 : une ligne générée par un transfert (entrée 'transfert' ou miroir lié) ne se
    // modifie que via le transfert lui-même.
    if (check.rows[0].type_appro === 'transfert' || check.rows[0].transfert_id != null)
      return res.status(409).json({ code: 'LIGNE_DE_TRANSFERT', message: 'Modifiez ou supprimez [[le:transfert]]' });

    const r = await withTransaction(async (client) => {
      await transfertService.lockStockLabo(client, laboId);
      const result = await client.query(
        `UPDATE stock_labo_daily
         SET quantite = $1, prix_unitaire = $2, fournisseur_id = $3, ref_facture = $4, updated_at = NOW()
         WHERE id = $5 AND labo_id = $6
         RETURNING id, quantite, prix_unitaire, fournisseur_id, ref_facture`,
        [quantite ?? null, prixUnitaire ?? null, fournisseurId || null, refFacture || null, entryId, laboId]
      );
      return result.rows[0];
    });
    res.json({
      id: r.id,
      quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
      prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
      fournisseurId: r.fournisseur_id,
      refFacture: r.ref_facture,
    });
  } catch (err) {
    if (replyTransfertError(res, err)) return;
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/labo/:laboId/historique/:entryId
const deleteLaboHistoriqueEntry = async (req, res) => {
  const { laboId, entryId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

    const checkDel = await pool.query(
      'SELECT created_by, type_appro, transfert_id FROM stock_labo_daily WHERE id = $1 AND labo_id = $2',
      [entryId, laboId]
    );
    if (checkDel.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
    if (req.user.role === 'gerant' && checkDel.rows[0].created_by !== req.user.id)
      return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres enregistrements.' });
    if (checkDel.rows[0].type_appro === 'transfert' || checkDel.rows[0].transfert_id != null)
      return res.status(409).json({ code: 'LIGNE_DE_TRANSFERT', message: 'Modifiez ou supprimez [[le:transfert]]' });
    const deleted = await withTransaction(async (client) => {
      await transfertService.lockStockLabo(client, laboId);
      const result = await client.query('DELETE FROM stock_labo_daily WHERE id = $1 RETURNING id', [entryId]);
      return result.rows.length;
    });
    if (!deleted) return res.status(404).json({ message: 'Entrée introuvable' });
    res.json({ ok: true });
  } catch (err) {
    if (replyTransfertError(res, err)) return;
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
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

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
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

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

    // Lot 1b : labos enfants (alimentés par ce labo) — assigned = labo_ingredient_selections /
    // labo_pt_selections du labo enfant (convention ingredientId négatif pour un PT).
    const enfants = await unitesOp.getLabosEnfants(pool, laboId);
    const enfantIds = enfants.map((e) => e.laboId);
    const [enfantIngRes, enfantPtRes] = enfantIds.length
      ? await Promise.all([
          pool.query('SELECT labo_id, ingredient_id FROM labo_ingredient_selections WHERE labo_id = ANY($1::int[])', [enfantIds]),
          pool.query('SELECT labo_id, produit_id FROM labo_pt_selections WHERE labo_id = ANY($1::int[])', [enfantIds]),
        ])
      : [{ rows: [] }, { rows: [] }];
    const enfantIng = new Set(enfantIngRes.rows.map((r) => `${r.labo_id}:${r.ingredient_id}`));
    const enfantPt = new Set(enfantPtRes.rows.map((r) => `${r.labo_id}:${r.produit_id}`));
    const labosOut = enfants.map((e) => ({
      laboId: e.laboId,
      nom: e.nom,
      ingredients: ingRes.rows.map((ing) => ({ ingredientId: ing.id, assigned: enfantIng.has(`${e.laboId}:${ing.id}`) })),
      produits: ptRes.rows.map((pt) => ({ ingredientId: -(pt.id), assigned: enfantPt.has(`${e.laboId}:${pt.id}`) })),
    }));

    res.json({
      activites: actRes.rows.map((a) => ({ id: a.id, nom: a.nom, type: a.type })),
      labos: labosOut,
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
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

    const actCheck = await pool.query(
      'SELECT id FROM activites WHERE id = $1 AND labo_id = $2',
      [activiteId, laboId]
    );
    if (actCheck.rows.length === 0)
      return res.status(400).json({ message: '[[Nom:activite]] invalide' });

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
  const voc = req.voc ?? vocabDefaut;
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId, categorieId, fournisseurId, refFacture, selectedIds: selectedIdsParam, ptOnly, ptProduitId, ptType } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').map(Number).filter(Boolean) : []);

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

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
    const laboNom = laboRes.rows[0]?.nom || voc.Nom('labo');

    const result = await pool.query(
      `SELECT sld.id, sld.ingredient_id, sld.date_appro, sld.quantite, sld.prix_unitaire,
              sld.ref_facture, sld.type_appro, sld.taux_tva, sld.prix_unitaire_tva,
              i.nom as ingredient_nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
              CASE WHEN sld.type_appro = 'transfert' THEN COALESCE(lsrc.nom, f.nom) ELSE f.nom END as fournisseur_nom,
              CASE WHEN sld.type_appro = 'transfert' THEN 'entree' ELSE NULL END AS sens,
              ub.nom as created_by_nom
       FROM stock_labo_daily sld
       JOIN articles i ON i.id = sld.ingredient_id JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id LEFT JOIN fournisseurs f ON f.id = sld.fournisseur_id
       LEFT JOIN labo_transfers ltx ON ltx.id = sld.transfert_id
       LEFT JOIN labos lsrc ON lsrc.id = ltx.labo_id
       LEFT JOIN utilisateurs ub ON ub.id = sld.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY sld.date_appro DESC, sld.updated_at DESC`, params
    );
    let rows = result.rows;

    // Append des fabrications de produits transformés (table séparée), même règle que la liste.
    const includePt = ptOnly === 'true' || (!ingredientId && !categorieId && !fournisseurId && !refFacture);
    if (includePt) {
      const ptParams = [laboId];
      let ptWhere = `slpt.labo_id = $1`;
      if (startDate) { ptParams.push(startDate); ptWhere += ` AND slpt.date_appro >= $${ptParams.length}`; }
      if (endDate) { ptParams.push(endDate); ptWhere += ` AND slpt.date_appro <= $${ptParams.length}`; }
      if (ptProduitId) { ptParams.push(ptProduitId); ptWhere += ` AND slpt.produit_id = $${ptParams.length}`; }
      if (ptType) ptWhere += ` AND ${ptTypeSql('p', ptType)}`;
      const ptRes = await pool.query(
        `SELECT slpt.id, -(slpt.produit_id) as ingredient_id, slpt.date_appro, slpt.quantite, slpt.prix_unitaire,
                slpt.ref_facture, 'produit_transforme'::text as type_appro, slpt.taux_tva, slpt.prix_unitaire_tva,
                p.nom as ingredient_nom, 'unité'::text as unite_nom, ${ptCategorieSql('p')} as categorie_nom,
                f.nom as fournisseur_nom, NULL::text as created_by_nom
         FROM stock_labo_pt_daily slpt JOIN produits p ON p.id = slpt.produit_id
         LEFT JOIN fournisseurs f ON f.id = slpt.fournisseur_id
         WHERE ${ptWhere}
         ORDER BY slpt.date_appro DESC`, ptParams
      );
      rows = ptOnly === 'true' ? ptRes.rows
        : [...rows, ...ptRes.rows].sort((a, b) => new Date(b.date_appro) - new Date(a.date_appro));
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    const sheet = workbook.addWorksheet(ongletSur(workbook, `Hist ${voc.Court('appro')} ${laboNom}`), { pageSetup: { paperSize: 9, orientation: 'landscape' } });

    // cols: Date | Ingrédient | Catégorie | Type | Quantité | Unité | Prix U. HT | TVA % | Prix U. TTC | Coût HT | Coût TTC | Fournisseur | Réf. Facture | Créé par
    const labels = ['Date', voc.Nom('article_ingredient'), 'Catégorie', 'Type', 'Quantité', 'Unité', 'Prix U. HT', 'TVA %', 'Prix U. TTC', 'Coût HT', 'Coût TTC', voc.Court('fournisseur'), 'Réf. Facture', 'Créé par'];
    const widths = [12, 26, 18, 10, 11, 9, 13, 9, 13, 14, 14, 18, 16, 16];
    const colCount = labels.length;

    const fmtD = (d) => d ? d.split('-').reverse().join('/') : '—';
    const headerIdx = brandHeader(workbook, sheet, {
      titre: `Historique ${voc.du('appro', true)} — ${voc.Court('labo')}`,
      sousTitre: laboNom,
      meta: `Exporté le ${new Date().toLocaleDateString('fr-FR')} · Période ${fmtD(startDate)} → ${fmtD(endDate)} · ${rows.length} ligne(s)`,
      colCount,
    });
    headerRow(sheet, headerIdx, labels, { widths });

    // col5=Quantité, col7=Prix HT, col9=Prix TTC, col10=Coût HT, col11=Coût TTC
    let totalHT = 0; let totalTTC = 0;
    let lastDataRow = headerIdx;
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
      // Lot 1b : entrée 'transfert' (reçue d'un labo source) = « Transfert reçu » ; les autres
      // libellés (Manuel / PT / Prod. Transformé) sont inchangés pour l'existant.
      const typeLabel = (() => {
        const t = r.type_appro || 'manuel';
        if (t === 'produit_transforme') return voc.Nom('pt_abr');
        if (t === 'transfert') return `${voc.Nom('transfert')} ${voc.acc('transfert', 'reçu', 'reçue')}`;
        return t === 'PT' ? voc.Court('pt') : 'Manuel';
      })();
      const dataRow = sheet.addRow([
        dateStr, r.ingredient_nom, libelleCategoriePt(voc, r.categorie_nom), typeLabel,
        qty, r.unite_nom, prix, tva !== null ? tva : '', prixTtc,
        coutHt, coutTtc,
        r.fournisseur_nom || '', r.ref_facture || '', r.created_by_nom || '',
      ]);
      dataRowStyle(dataRow, { index: i, selected: isSelected, colCount });
      for (let c = 1; c <= colCount; c++) {
        dataRow.getCell(c).alignment = { vertical: 'middle', horizontal: (c <= 4 || c === colCount) ? 'left' : (c === 6 ? 'center' : 'right') };
      }
      dataRow.getCell(5).numFmt = FMT_QTE;
      [7, 9, 10, 11].forEach((c) => { dataRow.getCell(c).numFmt = FMT_DT; });
      dataRow.height = 16;
      lastDataRow = dataRow.number;
    });

    const totalRow = sheet.addRow(['TOTAL', '', '', '', '', '', '', '', '', totalHT, totalTTC, '', '', '']);
    totalRowStyle(totalRow, { colCount });
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(10).numFmt = FMT_DT;
    totalRow.getCell(11).numFmt = FMT_DT;

    brandFooter(sheet, colCount);
    finalize(sheet, { headerRowIdx: headerIdx, colCount, lastDataRow });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Historique-Labo-${nomFichierSur(laboNom)}.xlsx"`);
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
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });
    // Lot 1b §5 — type ∈ regles.types_perte du compte (absent → avarie, sinon 1er type du domaine).
    const typesPerte = await getTypesPerteForClient(req.user.gerant_parent_id || req.user.id);
    const typePerteEff = typePerte || (typesPerte.includes('avarie') ? 'avarie' : typesPerte[0]);
    if (!typesPerte.includes(typePerteEff)) return res.status(400).json({ message: `typePerte invalide (${typesPerte.join('|')})` });

    const ingredientIdRaw = parseInt(ingredientId);
    const effectiveDate = datePerte || new Date().toISOString().split('T')[0];
    if (ingredientIdRaw < 0) {
      // PT product perte
      const produitId = -ingredientIdRaw;
      const qtyPT = parseFloat(quantite);
      // Valoriser la perte au coût recette TTC du PT (buildMpPriceMapLabo = TTC), pour rapports/exports.
      let coutPt = null;
      try {
        const { buildMpPriceMapLabo, calculerCoutAvecPrixMap } = require('./produitsController');
        const ownerId = req.user.gerant_parent_id || req.user.id;
        const map = await buildMpPriceMapLabo(parseInt(laboId));
        const c = await calculerCoutAvecPrixMap(produitId, ownerId, map);
        coutPt = c && c.cout_total != null && parseFloat(c.cout_total) > 0 ? parseFloat(c.cout_total) : null;
      } catch { /* coût indisponible → prix null */ }
      // Lot 1b §2.4 : verrou stock + contrôle DANS la transaction (même espace que les transferts).
      await withTransaction(async (client) => {
        await transfertService.lockStockLabo(client, laboId);
        const ptStock = await computeStock(client, 'labo', laboId, { produitId });
        if (qtyPT > ptStock) {
          throw new TransfertError(422, 'STOCK_INSUFFISANT', '[[Nom:stock]] [[court:pt]] [[acc:stock:insuffisant:insuffisante]]', { disponible: Math.max(0, ptStock), demande: qtyPT });
        }
        await client.query(
          `INSERT INTO labo_pertes (labo_id, produit_id, quantite, type_perte, date_perte, prix_unitaire, prix_unitaire_tva, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $6, $7)`,
          [laboId, produitId, qtyPT, typePerteEff, effectiveDate, coutPt, req.user.id]
        );
      });
    } else {
      const minRow = await pool.query(
        `SELECT MIN(date_appro) AS min_date FROM stock_labo_daily WHERE labo_id = $1 AND ingredient_id = $2`,
        [laboId, ingredientIdRaw]
      );
      const minAppro = minRow.rows[0]?.min_date;
      if (!minAppro) return res.status(400).json({ message: '[[Aucun:appro]] [[acc:appro:enregistré:enregistrée]] pour [[ce:article_ingredient]].' });
      const minApproStr = minAppro instanceof Date ? minAppro.toISOString().slice(0, 10) : String(minAppro).slice(0, 10);
      if (effectiveDate < minApproStr) return res.status(400).json({ message: `La date [[de:perte]] doit être >= [[acc:appro:au premier:à la première]] [[court:appro]] (${minApproStr.split('-').reverse().join('/')}).` });

      const priceRow = await pool.query(
        `SELECT prix_unitaire, COALESCE(prix_unitaire_tva, prix_unitaire) AS prix_ttc FROM stock_labo_daily
         WHERE labo_id = $1 AND ingredient_id = $2
           AND prix_unitaire IS NOT NULL AND prix_unitaire > 0
           AND date_appro <= $3
         ORDER BY date_appro DESC, id DESC LIMIT 1`,
        [laboId, ingredientIdRaw, effectiveDate]
      );
      const prixUnitaire = priceRow.rows.length > 0 ? parseFloat(priceRow.rows[0].prix_unitaire) : null;
      const prixUnitaireTva = priceRow.rows.length > 0 && priceRow.rows[0].prix_ttc != null ? parseFloat(priceRow.rows[0].prix_ttc) : null;
      const qtyDemandee = parseFloat(quantite);
      // Lot 1b §2.4 : verrou stock + contrôle DANS la transaction (même espace que les transferts).
      await withTransaction(async (client) => {
        await transfertService.lockStockLabo(client, laboId);
        const stockCourant = await computeStock(client, 'labo', laboId, { articleId: ingredientIdRaw });
        if (qtyDemandee > stockCourant) {
          throw new TransfertError(422, 'STOCK_INSUFFISANT', '[[Nom:stock]] [[acc:stock:insuffisant:insuffisante]]', { disponible: Math.max(0, stockCourant), demande: qtyDemandee });
        }
        await client.query(
          `INSERT INTO labo_pertes (labo_id, ingredient_id, quantite, type_perte, date_perte, prix_unitaire, prix_unitaire_tva, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [laboId, ingredientIdRaw, qtyDemandee, typePerteEff, effectiveDate, prixUnitaire, prixUnitaireTva, req.user.id]
        );
      });
    }
    res.json({ success: true });
  } catch (err) {
    if (replyTransfertError(res, err)) return;
    console.error('[createLaboPerte]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── getLaboPTRecipe ──────────────────────────────────────────────────────────
const getLaboPTRecipe = async (req, res) => {
  const { laboId, produitId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

    const [r, spR] = await Promise.all([
      pool.query(
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
      ),
      // Sous-PT de composition : nécessaires au contrôle de stock dynamique du front
      // (mêmes chiffres que la garde 422 d'updateLaboStock).
      pool.query(
        `SELECT psp.sous_produit_id, psp.portion AS portion_standard, p.nom,
                (SELECT slpt.prix_unitaire FROM stock_labo_pt_daily slpt
                  WHERE slpt.labo_id = $2 AND slpt.produit_id = psp.sous_produit_id
                    AND slpt.quantite > 0 AND slpt.prix_unitaire IS NOT NULL
                  ORDER BY slpt.date_appro DESC, slpt.id DESC LIMIT 1) AS last_prix
         FROM produit_sous_produits psp
         JOIN produits p ON p.id = psp.sous_produit_id
         WHERE psp.produit_id = $1
         ORDER BY p.nom`,
        [produitId, laboId]
      ),
    ]);
    // Stock courant SERVEUR de chaque composant (même calcul que la garde de production).
    const [stocksArt, stocksSp] = await Promise.all([
      Promise.all(r.rows.map((row) => computeStockCourant('labo', Number(laboId), row.ingredient_id))),
      Promise.all(spR.rows.map((row) => computeStockPTCourant('labo', Number(laboId), row.sous_produit_id))),
    ]);

    res.json([
      ...r.rows.map((row, i) => ({
        type: 'article',
        ingredientId: row.ingredient_id,
        nom: row.nom,
        unite: row.unite,
        categorie: row.categorie,
        categorieId: row.categorie_id,
        portionStandard: parseFloat(row.portion_standard),
        lastPrix: row.last_prix != null ? parseFloat(row.last_prix) : null,
        stockCourant: stocksArt[i] ?? 0,
      })),
      ...spR.rows.map((row, i) => ({
        type: 'sous_pt',
        sousProduitId: row.sous_produit_id,
        nom: row.nom,
        unite: 'unité',
        categorie: 'Sous-produit',
        categorieId: null,
        portionStandard: parseFloat(row.portion_standard),
        lastPrix: row.last_prix != null ? parseFloat(row.last_prix) : null,
        stockCourant: stocksSp[i] ?? 0,
      })),
    ]);
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
      return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

    // Lot 1b §2.4 : un labo source ou destinataire d'un transfert, ou source d'un lien vers un
    // labo enfant, ne se supprime pas (la cascade labo_dest_id effacerait des transferts en
    // laissant le miroir source). Évalué AVANT la garde « articles affectés » (contrat 409
    // LABO_UTILISE quel que soit l'état des sélections d'articles).
    const utilise = await pool.query(
      `SELECT
         EXISTS (SELECT 1 FROM labo_transfers lt WHERE lt.labo_id = $1 OR lt.labo_dest_id = $1) AS transferts,
         EXISTS (SELECT 1 FROM unites_operationnelles us
                 JOIN unites_operationnelles_liens li ON li.source_unite_id = us.id
                 JOIN unites_operationnelles ud ON ud.id = li.dest_unite_id AND ud.type_technique = 'labo'
                 WHERE us.labo_id = $1) AS enfants`,
      [laboId]
    );
    if (utilise.rows[0].transferts || utilise.rows[0].enfants) {
      return res.status(409).json({
        code: 'LABO_UTILISE',
        message: utilise.rows[0].transferts
          ? 'Suppression impossible : [[ce:labo]] a [[un:transfert:pl]] [[acc:transfert:enregistré:enregistrée:pl]] (source ou destinataire).'
          : 'Suppression impossible : [[ce:labo]] alimente d\'autres [[nom:labo:pl]] — détachez-les d\'abord.',
      });
    }
    // Suppression impossible si des articles sont affectés au labo (garde préexistante).
    const used = await pool.query(
      'SELECT 1 FROM labo_ingredient_selections WHERE labo_id = $1 LIMIT 1', [laboId]
    );
    if (used.rows.length > 0) {
      return res.status(409).json({ code: 'ARTICLES_AFFECTES', message: "Suppression impossible : [[un:article:pl]] sont [[acc:article:affecté:affectée:pl]] à [[ce:labo]]." });
    }

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

    res.json({ message: '[[Nom:labo]] [[acc:labo:supprimé:supprimée]]' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateLabo = async (req, res) => {
  const { laboId } = req.params;
  const { nom, referentTel, adresse, composantId, laboParentId } = req.body;
  if (!nom)
    return res.status(400).json({ message: 'nom requis' });
  try {
    const peRes = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1', [req.user.id]
    );
    if (peRes.rows.length === 0)
      return res.status(400).json({ message: 'Profil entreprise introuvable' });
    const entrepriseId = peRes.rows[0].id;

    // Lot 1b : laboParentId absent = inchangé ; null = détaché ; id = labo source ∈ entreprise, ≠ lui-même.
    const parentGiven = typeof laboParentId !== 'undefined';
    const parentIdNum = parentGiven && laboParentId != null ? parseInt(laboParentId, 10) : null;
    if (parentGiven && laboParentId != null) {
      if (!Number.isInteger(parentIdNum) || parentIdNum <= 0) return res.status(400).json({ message: '[[Nom:labo]] source introuvable' });
      if (parentIdNum === parseInt(laboId, 10))
        return res.status(400).json({ code: 'CYCLE_INTERDIT', message: unitesOp.CODES.CYCLE_INTERDIT });
      const parentCheck = await pool.query(
        'SELECT id FROM labos WHERE id = $1 AND entreprise_id = $2',
        [parentIdNum, entrepriseId]
      );
      if (parentCheck.rows.length === 0) return res.status(400).json({ message: '[[Nom:labo]] source introuvable' });
    }
    if (composantId != null) {
      await unitesOp.validateComposant(pool, entrepriseId, 'labo', composantId);
    }

    const nomCheck = await pool.query(
      'SELECT id FROM labos WHERE entreprise_id = $1 AND LOWER(nom) = LOWER($2) AND id != $3',
      [entrepriseId, nom.trim(), laboId]
    );
    if (nomCheck.rows.length > 0)
      return res.status(409).json({ message: '[[Un:labo]] avec ce nom existe déjà' });

    const tel = referentTel?.trim() || null;
    // UPDATE → fournisseur → composant → source dans UNE transaction (un 400 cycle/composant
    // n'enregistre ni le nom ni le composant à moitié).
    const found = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE labos SET nom = $1, referent_tel = $2, adresse = $3, updated_at = NOW()
         WHERE id = $4 AND entreprise_id = $5 RETURNING *`,
        [nom.trim(), tel, adresse?.trim() || null, laboId, entrepriseId]
      );
      if (result.rows.length === 0) return false;
      // Sync the auto-created labo fournisseur name/tel
      await client.query(
        `UPDATE fournisseurs SET nom = $1, telephone = $2 WHERE labo_id = $3 AND is_labo = true`,
        [nom.trim(), tel, laboId]
      );

      // Lot 1b : composant et labo source (cycle / entreprise / type → 400 avec code).
      const unite = await unitesOp.getUniteByRef(client, 'labo', laboId);
      if (unite && composantId != null) await unitesOp.setComposant(client, unite.id, composantId);
      if (unite && parentGiven) {
        if (parentIdNum == null) {
          await unitesOp.setSource(client, unite.id, null);
        } else {
          const srcUnite = await unitesOp.getUniteByRef(client, 'labo', parentIdNum);
          if (srcUnite) await unitesOp.setSource(client, unite.id, srcUnite.id);
        }
      }
      return true;
    });
    if (!found) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

    const fresh = await pool.query('SELECT * FROM labos WHERE id = $1', [laboId]);
    await unitesOp.enrichRows(pool, 'labo', fresh.rows);
    res.json(mapLabo(fresh.rows[0]));
  } catch (err) {
    if (replyUniteError(res, err)) return;
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Transfer history — export Excel ──────────────────────────────────────────

const exportLaboTransferExcel = async (req, res) => {
  const voc = req.voc ?? vocabDefaut;
  const { laboId } = req.params;
  const { startDate, endDate, activiteId, laboDestId, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').map(Number).filter(Boolean) : []);

  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });

    const laboRes = await pool.query('SELECT nom FROM labos WHERE id = $1', [laboId]);
    const laboNom = laboRes.rows[0]?.nom || voc.Nom('labo');

    const conditions = ['lt.labo_id = $1'];
    const params = [laboId];
    let idx = 2;
    if (startDate)  { conditions.push(`lt.date_transfert >= $${idx++}`); params.push(startDate); }
    if (endDate)    { conditions.push(`lt.date_transfert <= $${idx++}`); params.push(endDate); }
    const actIdNum = activiteId ? parseInt(activiteId, 10) : null;
    const laboDestIdNum = laboDestId ? parseInt(laboDestId, 10) : null;
    if ((activiteId && !Number.isInteger(actIdNum)) || (laboDestId && !Number.isInteger(laboDestIdNum))) {
      return res.status(400).json({ code: 'DESTINATION_INVALIDE', message: 'activiteId / laboDestId invalide' });
    }
    if (actIdNum != null) { conditions.push(`lt.activite_id = $${idx++}`); params.push(actIdNum); }
    if (laboDestIdNum != null) { conditions.push(`lt.labo_dest_id = $${idx++}`); params.push(laboDestIdNum); }

    const result = await pool.query(
      `SELECT lt.id, lt.quantite, lt.date_transfert, lt.note,
              lt.ingredient_id, COALESCE(i.nom, p.nom) AS ingredient_nom, COALESCE(u.nom, 'unité') AS unite_nom,
              COALESCE(c.nom, CASE WHEN lt.produit_id IS NOT NULL THEN (SELECT ${ptCategorieSql('pp')} FROM produits pp WHERE pp.id = lt.produit_id) ELSE 'Sans catégorie' END) AS categorie_nom,
              lt.activite_id, a.nom AS activite_nom,
              CASE WHEN lt.labo_dest_id IS NOT NULL THEN ld.nom ELSE a.nom END AS dest_nom,
              (lt.labo_dest_id IS NOT NULL) AS dest_labo,
              lt.prix_unitaire, lt.taux_tva, lt.prix_unitaire_tva,
              ub.nom AS created_by_nom
       FROM labo_transfers lt
       LEFT JOIN articles i ON i.id = lt.ingredient_id
       LEFT JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN produits p ON p.id = lt.produit_id
       LEFT JOIN activites a ON a.id = lt.activite_id
       LEFT JOIN labos ld ON ld.id = lt.labo_dest_id
       LEFT JOIN utilisateurs ub ON ub.id = lt.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY lt.date_transfert DESC, lt.id DESC`,
      params
    );
    const rows = result.rows;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    const sheet = workbook.addWorksheet(ongletSur(workbook, `Hist ${voc.Court('transfert', true)} ${laboNom}`), { pageSetup: { paperSize: 9, orientation: 'landscape' } });

    // Date | Destination | Ingrédient | Catégorie | Quantité | Unité | Prix U. HT | TVA % | Prix U. TTC | Coût HT | Coût TTC | Créé par
    const labels = ['Date', 'Destination', voc.Nom('article_ingredient'), 'Catégorie', 'Quantité', 'Unité', 'Prix U. HT', 'TVA %', 'Prix U. TTC', 'Coût HT', 'Coût TTC', 'Créé par'];
    const widths = [12, 20, 26, 18, 11, 9, 13, 9, 13, 14, 14, 16];
    const colCount = labels.length;

    const fmtD = (d) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
    const headerIdx = brandHeader(workbook, sheet, {
      titre: `Historique ${voc.du('transfert', true)} — ${voc.Court('labo')}`,
      sousTitre: laboNom,
      meta: `Exporté le ${new Date().toLocaleDateString('fr-FR')} · Période ${fmtD(startDate)} → ${fmtD(endDate)} · ${rows.length} ligne(s)`,
      colCount,
    });
    headerRow(sheet, headerIdx, labels, { widths });

    // col5=Quantité, col7=Prix HT, col9=Prix TTC, col10=Coût HT, col11=Coût TTC
    let totalHT = 0; let totalTTC = 0;
    let lastDataRow = headerIdx;
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
      // Marqueur « (labo) » (spec lot 2b §6.2) : drapeau SQL, assemblage ici.
      const destNom = r.dest_labo && r.dest_nom != null ? `${r.dest_nom} (${voc.court('labo')})` : r.dest_nom;
      const dataRow = sheet.addRow([
        dateStr, destNom, r.ingredient_nom, libelleCategoriePt(voc, r.categorie_nom),
        qty, r.unite_nom,
        prix, tva !== null ? tva : '', prixTtc,
        coutHt, coutTtc,
        r.created_by_nom || '',
      ]);
      dataRowStyle(dataRow, { index: i, selected: isSelected, colCount });
      for (let c = 1; c <= colCount; c++) {
        dataRow.getCell(c).alignment = { vertical: 'middle', horizontal: (c <= 4 || c >= 12) ? 'left' : (c === 6 ? 'center' : 'right') };
      }
      dataRow.getCell(5).numFmt = FMT_QTE;
      [7, 9, 10, 11].forEach((c) => { dataRow.getCell(c).numFmt = FMT_DT; });
      dataRow.height = 16;
      lastDataRow = dataRow.number;
    });

    const totalRow = sheet.addRow(['TOTAL', '', '', '', '', '', '', '', '', totalHT, totalTTC, '']);
    totalRowStyle(totalRow, { colCount });
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(10).numFmt = FMT_DT;
    totalRow.getCell(11).numFmt = FMT_DT;

    brandFooter(sheet, colCount);
    finalize(sheet, { headerRowIdx: headerIdx, colCount, lastDataRow });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Historique-Transferts-${nomFichierSur(laboNom)}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur génération Excel' });
  }
};

// PATCH /api/labo/:laboId/transfers/:transferId — lignes retrouvées par transfert_id (repli
// heuristique uniquement pour un transfert antérieur à la migration 188), facture liée recalculée.
const updateTransfer = async (req, res) => {
  const { laboId, transferId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });
    const out = await transfertService.updateTransfert(pool, {
      laboId: parseInt(laboId, 10),
      transferId: parseInt(transferId, 10),
      quantite: req.body.quantite,
      requester: { id: req.user.id, role: req.user.role },
    });
    res.json(out);
  } catch (err) {
    if (replyTransfertError(res, err)) return;
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/labo/:laboId/transfers/:transferId — ordre obligatoire : lignes (par transfert_id)
// PUIS labo_transfers ; facture liée recalculée (supprimée si plus aucune ligne).
const deleteTransfer = async (req, res) => {
  const { laboId, transferId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });
    const out = await transfertService.deleteTransfert(pool, {
      laboId: parseInt(laboId, 10),
      transferId: parseInt(transferId, 10),
      requester: { id: req.user.id, role: req.user.role },
    });
    res.json(out);
  } catch (err) {
    if (replyTransfertError(res, err)) return;
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/labo/:laboId/transfers/:transferId/prix — référence d'ÉDITION à la date du transfert :
// { pmpHT, pmpTTC, dernierAchatHT, prixUnitaire: pmpHT ?? dernierAchatHT } (computePmp à date).
const getTransferPrix = async (req, res) => {
  const { laboId, transferId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.gerant_parent_id || req.user.id);
    if (!ok) return res.status(404).json({ message: '[[Nom:labo]] introuvable' });
    res.json(await transfertService.getTransferPrix(pool, parseInt(laboId, 10), parseInt(transferId, 10)));
  } catch (err) {
    if (replyTransfertError(res, err)) return;
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Articles consommables affectés à TOUS les labos fournis (intersection).
// Alimente l'étape "Articles" du wizard de création des Produits Labo / PU Labo (origine = labo).
// Query: ?laboIds=1,2  → article présent si sélectionné dans CHACUN des labos, famille consommable.
const getLabosArticlesConsommables = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const ids = String(req.query.laboIds || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return res.json([]);
  try {
    // Garde-fou : tous les labos doivent appartenir au client.
    // Lot 1b §3.3 : seuls les labos dont l'unité est production_active fabriquent des PT.
    const own = await pool.query(
      `SELECT l.id FROM labos l
       JOIN profil_entreprise pe ON l.entreprise_id = pe.id
       LEFT JOIN unites_operationnelles uo ON uo.labo_id = l.id
       WHERE pe.client_id = $1 AND l.id = ANY($2::int[]) AND COALESCE(uo.production_active, true)`,
      [clientId, ids]
    );
    const ownedIds = own.rows.map((r) => r.id);
    if (ownedIds.length === 0) return res.json([]);

    const result = await pool.query(
      `SELECT a.id, a.nom, u.nom AS unite, COALESCE(c.nom, 'Sans catégorie') AS categorie,
              a.categorie_id, f.id AS famille_id, f.nom AS famille_nom
       FROM articles a
       JOIN unites u ON a.unite_id = u.id
       LEFT JOIN categories c ON a.categorie_id = c.id
       LEFT JOIN familles f ON c.famille_id = f.id
       JOIN labo_ingredient_selections lis ON lis.ingredient_id = a.id AND lis.labo_id = ANY($2::int[])
       WHERE a.client_id = $1
         AND (f.id IS NULL OR f.consommable = true)
       GROUP BY a.id, a.nom, u.nom, c.nom, a.categorie_id, f.id, f.nom
       HAVING COUNT(DISTINCT lis.labo_id) = $3
       ORDER BY f.nom NULLS LAST, c.nom NULLS LAST, a.nom`,
      [clientId, ownedIds, ownedIds.length]
    );

    res.json(result.rows.map((r) => ({
      id: r.id,
      nom: r.nom,
      unite: r.unite,
      categorie: r.categorie,
      categorieId: r.categorie_id ?? null,
      familleId: r.famille_id ?? null,
      familleNom: r.famille_nom ?? null,
      prixUnitaire: null,
      selected: true,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  createLabo, updateLabo, deleteLabo, listLabos, getLaboById,
  getLaboIngredients, getLaboPT, toggleLaboIngredient, getLabosArticlesConsommables,
  getLaboStock, updateLaboStock, getLaboStockHistory,
  getLaboFournisseurs, syncLaboFournisseurs,
  updateLaboSeuilMin,
  createTransfer, getTransferHistory, updateTransfer, deleteTransfer, getTransferPrix,
  getActivityAssignments, toggleActivityAssignment,
  getLaboHistorique, updateLaboHistoriqueEntry, deleteLaboHistoriqueEntry,
  exportLaboHistoriqueExcel,
  createLaboPerte,
  getLaboPTRecipe,
  exportLaboTransferExcel,
};
