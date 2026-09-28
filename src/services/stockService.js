// Moteur de stock unique (lot 1b, spec §2.2) — remplace les 6 sites à sémantique identique :
//   stockUtils.computeStockCourant / computeStockPTCourant (labo + activité, ×4),
//   laboController.getLaboStock (articles labo, baseline + PMP), stockController.getStockEntreprise
//   (articles activité, baseline + PMP). Les CTE d'inventaire (année courante) et les CTE PT
//   labo « net miroir » sont CONSERVÉS dans leurs contrôleurs (phase B).
//
//   computeStock(db, scope, id, { articleId | produitId })   → nombre (arrondi au millième)
//   computeStockBulk(db, scope, id)                          → { [articleId]: { stock, pmpHT, pmpTTC, detail } }
//   computePmp(db, scope, id, articleId, { atDate? })        → { pmpHT, pmpTTC, tauxTva }
//
// `db` = pool OU client de transaction (prérequis du verrou de transfertService).
//
// Règle unique côté labo (§2.1) : une ligne stock_labo_daily compte pour le stock si
//   NOT (COALESCE(type_appro,'manuel') = 'manuel' AND quantite < 0)
// (les entrées 'transfert' reçues d'un labo source comptent ; le miroir 'manuel' < 0 d'une
// sortie reste exclu — la sortie est déduite UNE fois par le CTE labo_transfers, filtré sur
// labo_id = unité SOURCE, jamais labo_dest_id). PMP labo (§2.3) : type_appro IN ('manuel','transfert').
const pool = require('../config/database');

const round3 = (v) => Math.round(parseFloat(v ?? 0) * 1000) / 1000;
const num = (v) => parseFloat(v) || 0;
const numOrNull = (v) => (v === null || v === undefined ? null : parseFloat(v));

// ─── Articles LABO — baseline (getLaboStock :341-498) + règle unique + PMP §2.3 ───
// mode 'bulk' : tous les articles de labo_ingredient_selections ($1 = laboId)
// mode 'single' : un article quelconque ($2 = articleId), filtre poussé dans chaque CTE
// atDate (optionnel) : tout mouvement / inventaire strictement postérieur est ignoré (PMP « à date »).
function laboArticlesSql(mode, atDate) {
  const single = mode === 'single';
  const ing = (alias) => (single ? ` AND ${alias}.ingredient_id = $2` : '');
  const pDate = single ? '$3' : '$2';
  const d = (expr) => (atDate ? ` AND ${expr} <= ${pDate}` : '');
  const base = single
    ? `(SELECT $2::int AS ingredient_id) lis`
    : `labo_ingredient_selections lis`;
  const baseWhere = single ? 'TRUE' : 'lis.labo_id = $1';
  return `
    WITH last_inv AS (
      SELECT DISTINCT ON (ingredient_id)
        ingredient_id, quantite_reelle, date_inventaire
      FROM inventaires
      WHERE labo_id = $1 AND ingredient_id IS NOT NULL${ing('inventaires')}${d('date_inventaire')}
      ORDER BY ingredient_id, date_inventaire DESC, created_at DESC
    ),
    post_appro AS (
      SELECT sld.ingredient_id, SUM(sld.quantite) as qty
      FROM stock_labo_daily sld
      JOIN last_inv li ON li.ingredient_id = sld.ingredient_id AND sld.date_appro >= li.date_inventaire
      WHERE sld.labo_id = $1${ing('sld')}${d('sld.date_appro')}
        AND NOT (COALESCE(sld.type_appro,'manuel') = 'manuel' AND sld.quantite < 0)
      GROUP BY sld.ingredient_id
    ),
    post_transfer AS (
      SELECT lt.ingredient_id, SUM(lt.quantite) as qty
      FROM labo_transfers lt
      JOIN last_inv li ON li.ingredient_id = lt.ingredient_id AND lt.date_transfert >= li.date_inventaire
      WHERE lt.labo_id = $1 AND lt.ingredient_id IS NOT NULL${ing('lt')}${d('lt.date_transfert')}
      GROUP BY lt.ingredient_id
    ),
    post_pertes AS (
      SELECT lp.ingredient_id, SUM(lp.quantite) as qty
      FROM labo_pertes lp
      JOIN last_inv li ON li.ingredient_id = lp.ingredient_id AND lp.date_perte >= li.date_inventaire
      WHERE lp.labo_id = $1 AND lp.ingredient_id IS NOT NULL${ing('lp')}${d('lp.date_perte')}
      GROUP BY lp.ingredient_id
    ),
    all_appro AS (
      SELECT sld.ingredient_id, SUM(sld.quantite) as qty
      FROM stock_labo_daily sld
      WHERE sld.labo_id = $1${ing('sld')}${d('sld.date_appro')}
        AND NOT (COALESCE(sld.type_appro,'manuel') = 'manuel' AND sld.quantite < 0)
      GROUP BY sld.ingredient_id
    ),
    all_transfer AS (
      SELECT lt.ingredient_id, SUM(lt.quantite) as qty
      FROM labo_transfers lt
      WHERE lt.labo_id = $1 AND lt.ingredient_id IS NOT NULL${ing('lt')}${d('lt.date_transfert')}
      GROUP BY lt.ingredient_id
    ),
    all_pertes AS (
      SELECT lp.ingredient_id, SUM(lp.quantite) as qty
      FROM labo_pertes lp
      WHERE lp.labo_id = $1 AND lp.ingredient_id IS NOT NULL${ing('lp')}${d('lp.date_perte')}
      GROUP BY lp.ingredient_id
    ),
    post_pt_usage AS (
      SELECT sld.ingredient_id, SUM(ABS(sld.quantite)) as qty
      FROM stock_labo_daily sld
      JOIN last_inv li ON li.ingredient_id = sld.ingredient_id AND sld.date_appro >= li.date_inventaire
      WHERE sld.labo_id = $1${ing('sld')}${d('sld.date_appro')} AND sld.quantite < 0 AND sld.type_appro = 'PT'
      GROUP BY sld.ingredient_id
    ),
    year_pt_usage AS (
      SELECT sld.ingredient_id, SUM(ABS(sld.quantite)) as qty
      FROM stock_labo_daily sld
      WHERE sld.labo_id = $1${ing('sld')}${d('sld.date_appro')} AND sld.quantite < 0 AND sld.type_appro = 'PT'
      GROUP BY sld.ingredient_id
    ),
    post_ventes_ach AS (
      SELECT cal.article_id AS ingredient_id, SUM(cal.quantite_unites) as qty
      FROM commande_acheteur_lignes cal
      JOIN commandes_acheteur ca ON ca.id = cal.commande_id
      JOIN last_inv li ON li.ingredient_id = cal.article_id AND COALESCE(ca.date_expedition, ca.date_commande) >= li.date_inventaire
      WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree') AND cal.article_type = 'ingredient'
        ${single ? 'AND cal.article_id = $2' : ''}${d('COALESCE(ca.date_expedition, ca.date_commande)')}
      GROUP BY cal.article_id
    ),
    all_ventes_ach AS (
      SELECT cal.article_id AS ingredient_id, SUM(cal.quantite_unites) as qty
      FROM commande_acheteur_lignes cal
      JOIN commandes_acheteur ca ON ca.id = cal.commande_id
      WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree') AND cal.article_type = 'ingredient'
        ${single ? 'AND cal.article_id = $2' : ''}${d('COALESCE(ca.date_expedition, ca.date_commande)')}
      GROUP BY cal.article_id
    ),
    prev_inv AS (
      SELECT ingredient_id, date_inventaire FROM (
        SELECT ingredient_id, date_inventaire,
          ROW_NUMBER() OVER (PARTITION BY ingredient_id ORDER BY date_inventaire DESC, created_at DESC) as rn
        FROM inventaires WHERE labo_id = $1 AND ingredient_id IS NOT NULL${ing('inventaires')}${d('date_inventaire')}
      ) sub WHERE rn = 2
    ),
    first_appro AS (
      SELECT sld.ingredient_id, MIN(sld.date_appro) as first_date
      FROM stock_labo_daily sld
      WHERE sld.labo_id = $1${ing('sld')}${d('sld.date_appro')} AND sld.type_appro IN ('manuel','transfert') AND sld.quantite > 0
      GROUP BY sld.ingredient_id
    ),
    pmp_hist AS (
      SELECT sld.ingredient_id,
        SUM(sld.quantite * sld.prix_unitaire) / NULLIF(SUM(sld.quantite), 0) as pmp_ht,
        SUM(sld.quantite * COALESCE(sld.prix_unitaire_tva, sld.prix_unitaire)) / NULLIF(SUM(sld.quantite), 0) as pmp_tva
      FROM stock_labo_daily sld
      JOIN last_inv li ON li.ingredient_id = sld.ingredient_id
      LEFT JOIN prev_inv pi ON pi.ingredient_id = sld.ingredient_id
      LEFT JOIN first_appro fa ON fa.ingredient_id = sld.ingredient_id
      WHERE sld.labo_id = $1${ing('sld')} AND sld.type_appro IN ('manuel','transfert') AND sld.quantite > 0 AND sld.prix_unitaire IS NOT NULL
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
      WHERE sld.labo_id = $1${ing('sld')}${d('sld.date_appro')} AND sld.type_appro IN ('manuel','transfert') AND sld.quantite > 0
      GROUP BY sld.ingredient_id
    ),
    appro_cost_all AS (
      SELECT sld.ingredient_id,
        SUM(sld.quantite) as qty,
        SUM(sld.quantite * COALESCE(sld.prix_unitaire, 0)) as cost_ht,
        SUM(sld.quantite * COALESCE(sld.prix_unitaire_tva, sld.prix_unitaire, 0)) as cost_tva
      FROM stock_labo_daily sld
      WHERE sld.labo_id = $1${ing('sld')}${d('sld.date_appro')} AND sld.type_appro IN ('manuel','transfert') AND sld.quantite > 0
      GROUP BY sld.ingredient_id
    ),
    last_tva AS (
      SELECT DISTINCT ON (sld.ingredient_id) sld.ingredient_id, sld.taux_tva
      FROM stock_labo_daily sld
      WHERE sld.labo_id = $1${ing('sld')}${d('sld.date_appro')} AND sld.type_appro IN ('manuel','transfert') AND sld.quantite > 0 AND sld.taux_tva IS NOT NULL
      ORDER BY sld.ingredient_id, sld.date_appro DESC NULLS LAST, sld.id DESC
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
           COALESCE(pva.qty, 0)          as post_ventes_ach_qty,
           COALESCE(ava.qty, 0)          as all_ventes_ach_qty,
           COALESCE(aca.qty, 0)          as appro_cost_all_qty,
           COALESCE(aca.cost_ht, 0)      as appro_cost_all_ht,
           COALESCE(aca.cost_tva, 0)     as appro_cost_all_tva,
           ltv.taux_tva                  as last_taux_tva,
           CASE WHEN li.ingredient_id IS NOT NULL
             THEN li.quantite_reelle + COALESCE(pa.qty, 0) - COALESCE(pt.qty, 0) - COALESCE(pp.qty, 0) - COALESCE(pva.qty, 0)
             ELSE COALESCE(aa.qty, 0) - COALESCE(atr.qty, 0) - COALESCE(ap.qty, 0) - COALESCE(ava.qty, 0)
           END                           as stock_courant
    FROM ${base}
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
    LEFT JOIN post_ventes_ach pva ON pva.ingredient_id = lis.ingredient_id
    LEFT JOIN all_ventes_ach ava ON ava.ingredient_id = lis.ingredient_id
    LEFT JOIN appro_cost_all aca ON aca.ingredient_id = lis.ingredient_id
    LEFT JOIN last_tva ltv    ON ltv.ingredient_id = lis.ingredient_id
    WHERE ${baseWhere}`;
}

function mapLaboDetail(r) {
  return {
    hasInv: r.inv_qty !== null,
    invQty: r.inv_qty !== null ? parseFloat(r.inv_qty) : 0,
    invDate: r.inv_date ? String(r.inv_date).slice(0, 10) : null,
    postApproQty: num(r.post_appro_qty),
    postTransferQty: num(r.post_transfer_qty),
    postPertesQty: num(r.post_pertes_qty),
    postPtUsageQty: num(r.post_pt_usage_qty),
    pmpHistHT: numOrNull(r.pmp_hist_ht),
    pmpHistTTC: numOrNull(r.pmp_hist_tva),
    approCostPostQty: num(r.appro_cost_post_qty),
    approCostPostHT: num(r.appro_cost_post_ht),
    approCostPostTTC: num(r.appro_cost_post_tva),
    allApproQty: num(r.all_appro_qty),
    allTransferQty: num(r.all_transfer_qty),
    allPertesQty: num(r.all_pertes_qty),
    allPtUsageQty: num(r.all_pt_usage_qty),
    postVentesAchQty: num(r.post_ventes_ach_qty),
    allVentesAchQty: num(r.all_ventes_ach_qty),
    approCostAllQty: num(r.appro_cost_all_qty),
    approCostAllHT: num(r.appro_cost_all_ht),
    approCostAllTTC: num(r.appro_cost_all_tva),
    lastTauxTva: numOrNull(r.last_taux_tva),
  };
}

// PMP labo — formule EXACTE de getLaboStock :541-563 (inventaire valorisé au pmp_hist
// seulement s'il a une base de coût ; sinon exclu du dénominateur).
function pmpLaboFromDetail(b) {
  if (b.hasInv) {
    const invValued = b.invQty > 0 && b.pmpHistHT !== null;
    const invQtyForPmp = invValued ? b.invQty : 0;
    const coutInvHT = invValued ? b.invQty * b.pmpHistHT : 0;
    const coutInvTTC = invValued ? b.invQty * (b.pmpHistTTC !== null ? b.pmpHistTTC : b.pmpHistHT) : 0;
    const totalCostInHT = coutInvHT + (b.approCostPostHT || 0);
    const totalCostInTTC = coutInvTTC + (b.approCostPostTTC || 0);
    const totalQtyIn = invQtyForPmp + (b.approCostPostQty || 0);
    return {
      pmpHT: totalQtyIn > 0 ? totalCostInHT / totalQtyIn : null,
      pmpTTC: totalQtyIn > 0 ? totalCostInTTC / totalQtyIn : null,
    };
  }
  return {
    pmpHT: b.approCostAllQty > 0 ? b.approCostAllHT / b.approCostAllQty : null,
    pmpTTC: b.approCostAllQty > 0 ? b.approCostAllTTC / b.approCostAllQty : null,
  };
}

// ─── Articles ACTIVITÉ — baseline (getStockEntreprise :143-322) + PMP :548-570 ───
function activiteArticlesSql(mode, atDate) {
  const single = mode === 'single';
  const ing = (alias) => (single ? ` AND ${alias}.ingredient_id = $2` : '');
  const pDate = single ? '$3' : '$2';
  const d = (expr) => (atDate ? ` AND ${expr} <= ${pDate}` : '');
  const base = single
    ? `(SELECT $2::int AS ingredient_id) ais`
    : `activite_ingredient_selections ais`;
  const baseWhere = single ? 'TRUE' : 'ais.activite_id = $1';
  return `
    WITH last_inv AS (
      SELECT DISTINCT ON (ingredient_id)
        ingredient_id, quantite_reelle, date_inventaire
      FROM inventaires
      WHERE activite_id = $1 AND ingredient_id IS NOT NULL${ing('inventaires')}${d('date_inventaire')}
      ORDER BY ingredient_id, date_inventaire DESC, created_at DESC
    ),
    post_appro AS (
      SELECT sed.ingredient_id, SUM(sed.quantite) as qty
      FROM stock_entreprise_daily sed
      JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')}
      GROUP BY sed.ingredient_id
    ),
    post_pertes AS (
      SELECT p.ingredient_id, SUM(p.quantite) as qty
      FROM pertes p
      JOIN last_inv li ON li.ingredient_id = p.ingredient_id AND p.date_perte >= li.date_inventaire
      WHERE p.activite_id = $1 AND p.ingredient_id IS NOT NULL${ing('p')}${d('p.date_perte')}
      GROUP BY p.ingredient_id
    ),
    post_pt_usage AS (
      SELECT sed.ingredient_id, SUM(ABS(sed.quantite)) as qty
      FROM stock_entreprise_daily sed
      JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')} AND sed.quantite < 0 AND sed.type_appro NOT IN ('vente','annulation_vente')
      GROUP BY sed.ingredient_id
    ),
    post_ventes AS (
      SELECT sed.ingredient_id, GREATEST(-SUM(sed.quantite), 0) as qty
      FROM stock_entreprise_daily sed
      JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')} AND sed.type_appro IN ('vente', 'annulation_vente')
      GROUP BY sed.ingredient_id
    ),
    all_appro AS (
      SELECT sed.ingredient_id, SUM(sed.quantite) as qty
      FROM stock_entreprise_daily sed
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')}
      GROUP BY sed.ingredient_id
    ),
    all_pertes AS (
      SELECT p.ingredient_id, SUM(p.quantite) as qty
      FROM pertes p
      WHERE p.activite_id = $1 AND p.ingredient_id IS NOT NULL${ing('p')}${d('p.date_perte')}
      GROUP BY p.ingredient_id
    ),
    all_pt_usage AS (
      SELECT sed.ingredient_id, SUM(ABS(sed.quantite)) as qty
      FROM stock_entreprise_daily sed
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')} AND sed.quantite < 0 AND sed.type_appro NOT IN ('vente','annulation_vente')
      GROUP BY sed.ingredient_id
    ),
    all_ventes AS (
      SELECT sed.ingredient_id, GREATEST(-SUM(sed.quantite), 0) as qty
      FROM stock_entreprise_daily sed
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')} AND sed.type_appro IN ('vente', 'annulation_vente')
      GROUP BY sed.ingredient_id
    ),
    post_transferts_in AS (
      SELECT sed.ingredient_id, SUM(sed.quantite) as qty
      FROM stock_entreprise_daily sed
      JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')} AND sed.quantite > 0 AND sed.type_appro = 'transfert'
      GROUP BY sed.ingredient_id
    ),
    all_transferts_in AS (
      SELECT sed.ingredient_id, SUM(sed.quantite) as qty
      FROM stock_entreprise_daily sed
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')} AND sed.quantite > 0 AND sed.type_appro = 'transfert'
      GROUP BY sed.ingredient_id
    ),
    prev_inv AS (
      SELECT ingredient_id, date_inventaire FROM (
        SELECT ingredient_id, date_inventaire,
          ROW_NUMBER() OVER (PARTITION BY ingredient_id ORDER BY date_inventaire DESC, created_at DESC) as rn
        FROM inventaires WHERE activite_id = $1 AND ingredient_id IS NOT NULL${ing('inventaires')}${d('date_inventaire')}
      ) sub WHERE rn = 2
    ),
    first_appro AS (
      SELECT sed.ingredient_id, MIN(sed.date_appro) as first_date
      FROM stock_entreprise_daily sed WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')} AND sed.quantite > 0
      GROUP BY sed.ingredient_id
    ),
    pmp_hist AS (
      SELECT sed.ingredient_id,
        SUM(sed.quantite * sed.prix_unitaire) / NULLIF(SUM(sed.quantite), 0) as pmp_ht,
        SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire)) / NULLIF(SUM(sed.quantite), 0) as pmp_tva
      FROM stock_entreprise_daily sed
      JOIN last_inv li ON li.ingredient_id = sed.ingredient_id
      LEFT JOIN prev_inv pi ON pi.ingredient_id = sed.ingredient_id
      LEFT JOIN first_appro fa ON fa.ingredient_id = sed.ingredient_id
      WHERE sed.activite_id = $1${ing('sed')} AND sed.type_appro = 'manuel' AND sed.quantite > 0 AND sed.prix_unitaire IS NOT NULL
        AND sed.date_appro >= COALESCE(pi.date_inventaire, fa.first_date)
        AND sed.date_appro < li.date_inventaire
      GROUP BY sed.ingredient_id
    ),
    appro_cost_post AS (
      SELECT sed.ingredient_id,
        SUM(sed.quantite) as qty,
        SUM(sed.quantite * COALESCE(sed.prix_unitaire, 0)) as cost_ht,
        SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire, 0)) as cost_tva
      FROM stock_entreprise_daily sed
      JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')} AND sed.type_appro = 'manuel' AND sed.quantite > 0
      GROUP BY sed.ingredient_id
    ),
    appro_cost_all AS (
      SELECT sed.ingredient_id,
        SUM(sed.quantite) as qty,
        SUM(sed.quantite * COALESCE(sed.prix_unitaire, 0)) as cost_ht,
        SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire, 0)) as cost_tva
      FROM stock_entreprise_daily sed
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')} AND sed.type_appro = 'manuel' AND sed.quantite > 0
      GROUP BY sed.ingredient_id
    ),
    transfer_cost_post AS (
      SELECT sed.ingredient_id,
        SUM(sed.quantite) as qty,
        SUM(sed.quantite * COALESCE(sed.prix_unitaire, 0)) as cost_ht,
        SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire, 0)) as cost_tva
      FROM stock_entreprise_daily sed
      JOIN last_inv li ON li.ingredient_id = sed.ingredient_id AND sed.date_appro >= li.date_inventaire
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')} AND sed.type_appro = 'transfert' AND sed.quantite > 0
      GROUP BY sed.ingredient_id
    ),
    transfer_cost_all AS (
      SELECT sed.ingredient_id,
        SUM(sed.quantite) as qty,
        SUM(sed.quantite * COALESCE(sed.prix_unitaire, 0)) as cost_ht,
        SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire, 0)) as cost_tva
      FROM stock_entreprise_daily sed
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')} AND sed.type_appro = 'transfert' AND sed.quantite > 0
      GROUP BY sed.ingredient_id
    ),
    last_tva AS (
      SELECT DISTINCT ON (sed.ingredient_id) sed.ingredient_id, sed.taux_tva
      FROM stock_entreprise_daily sed
      WHERE sed.activite_id = $1${ing('sed')}${d('sed.date_appro')} AND sed.type_appro IN ('manuel','transfert') AND sed.quantite > 0 AND sed.taux_tva IS NOT NULL
      ORDER BY sed.ingredient_id, sed.date_appro DESC NULLS LAST, sed.id DESC
    )
    SELECT ais.ingredient_id,
           li.quantite_reelle        as inv_qty,
           li.date_inventaire        as inv_date,
           COALESCE(pa.qty, 0)       as post_appro_qty,
           COALESCE(pp.qty, 0)       as post_pertes_qty,
           COALESCE(ppu.qty, 0)      as post_pt_usage_qty,
           COALESCE(pv.qty, 0)       as post_vente_qty,
           COALESCE(av.qty, 0)       as all_vente_qty,
           COALESCE(aa.qty, 0)       as all_appro_qty,
           COALESCE(ap.qty, 0)       as all_pertes_qty,
           COALESCE(apu.qty, 0)      as all_pt_usage_qty,
           COALESCE(pti.qty, 0)      as post_transferts_in_qty,
           COALESCE(ati.qty, 0)      as all_transferts_in_qty,
           ph.pmp_ht                 as pmp_hist_ht,
           ph.pmp_tva                as pmp_hist_tva,
           COALESCE(acp.qty, 0)      as appro_cost_post_qty,
           COALESCE(acp.cost_ht, 0)  as appro_cost_post_ht,
           COALESCE(acp.cost_tva, 0) as appro_cost_post_tva,
           COALESCE(aca.qty, 0)      as appro_cost_all_qty,
           COALESCE(aca.cost_ht, 0)  as appro_cost_all_ht,
           COALESCE(aca.cost_tva, 0) as appro_cost_all_tva,
           COALESCE(tcp.qty, 0)      as transfer_cost_post_qty,
           COALESCE(tcp.cost_ht, 0)  as transfer_cost_post_ht,
           COALESCE(tcp.cost_tva, 0) as transfer_cost_post_tva,
           COALESCE(tca.qty, 0)      as transfer_cost_all_qty,
           COALESCE(tca.cost_ht, 0)  as transfer_cost_all_ht,
           COALESCE(tca.cost_tva, 0) as transfer_cost_all_tva,
           ltv.taux_tva              as last_taux_tva,
           CASE WHEN li.ingredient_id IS NOT NULL
             THEN li.quantite_reelle + COALESCE(pa.qty, 0) - COALESCE(pp.qty, 0)
             ELSE COALESCE(aa.qty, 0) - COALESCE(ap.qty, 0)
           END                       as stock_courant
    FROM ${base}
    LEFT JOIN last_inv li                ON li.ingredient_id  = ais.ingredient_id
    LEFT JOIN post_appro pa              ON pa.ingredient_id  = ais.ingredient_id
    LEFT JOIN post_pertes pp             ON pp.ingredient_id  = ais.ingredient_id
    LEFT JOIN post_pt_usage ppu          ON ppu.ingredient_id = ais.ingredient_id
    LEFT JOIN post_ventes pv            ON pv.ingredient_id  = ais.ingredient_id
    LEFT JOIN all_ventes av             ON av.ingredient_id  = ais.ingredient_id
    LEFT JOIN all_appro aa              ON aa.ingredient_id  = ais.ingredient_id
    LEFT JOIN all_pertes ap             ON ap.ingredient_id  = ais.ingredient_id
    LEFT JOIN all_pt_usage apu          ON apu.ingredient_id = ais.ingredient_id
    LEFT JOIN post_transferts_in pti    ON pti.ingredient_id = ais.ingredient_id
    LEFT JOIN all_transferts_in ati     ON ati.ingredient_id = ais.ingredient_id
    LEFT JOIN pmp_hist ph               ON ph.ingredient_id  = ais.ingredient_id
    LEFT JOIN appro_cost_post acp       ON acp.ingredient_id = ais.ingredient_id
    LEFT JOIN appro_cost_all aca        ON aca.ingredient_id = ais.ingredient_id
    LEFT JOIN transfer_cost_post tcp    ON tcp.ingredient_id = ais.ingredient_id
    LEFT JOIN transfer_cost_all tca     ON tca.ingredient_id = ais.ingredient_id
    LEFT JOIN last_tva ltv              ON ltv.ingredient_id = ais.ingredient_id
    WHERE ${baseWhere}`;
}

function mapActiviteDetail(r) {
  return {
    hasInv: r.inv_qty !== null,
    invQty: r.inv_qty !== null ? parseFloat(r.inv_qty) : 0,
    invDate: r.inv_date ? String(r.inv_date).slice(0, 10) : null,
    postApproQty: num(r.post_appro_qty),
    postPertesQty: num(r.post_pertes_qty),
    postPtUsageQty: num(r.post_pt_usage_qty),
    postVenteQty: num(r.post_vente_qty),
    allVenteQty: num(r.all_vente_qty),
    allApproQty: num(r.all_appro_qty),
    allPertesQty: num(r.all_pertes_qty),
    allPtUsageQty: num(r.all_pt_usage_qty),
    postTransfertsInQty: num(r.post_transferts_in_qty),
    allTransfertsInQty: num(r.all_transferts_in_qty),
    pmpHistHT: numOrNull(r.pmp_hist_ht),
    pmpHistTTC: numOrNull(r.pmp_hist_tva),
    approCostPostQty: num(r.appro_cost_post_qty),
    approCostPostHT: num(r.appro_cost_post_ht),
    approCostPostTTC: num(r.appro_cost_post_tva),
    approCostAllQty: num(r.appro_cost_all_qty),
    approCostAllHT: num(r.appro_cost_all_ht),
    approCostAllTTC: num(r.appro_cost_all_tva),
    transferCostPostQty: num(r.transfer_cost_post_qty),
    transferCostPostHT: num(r.transfer_cost_post_ht),
    transferCostPostTTC: num(r.transfer_cost_post_tva),
    transferCostAllQty: num(r.transfer_cost_all_qty),
    transferCostAllHT: num(r.transfer_cost_all_ht),
    transferCostAllTTC: num(r.transfer_cost_all_tva),
    lastTauxTva: numOrNull(r.last_taux_tva),
  };
}

// PMP activité — formule EXACTE de getStockEntreprise :548-570 (appros + transferts reçus).
function pmpActiviteFromDetail(b) {
  if (b.hasInv) {
    const invValued = b.invQty > 0 && b.pmpHistHT !== null;
    const invQtyForPmp = invValued ? b.invQty : 0;
    const coutInvHT = invValued ? b.invQty * b.pmpHistHT : 0;
    const coutInvTTC = invValued ? b.invQty * (b.pmpHistTTC !== null ? b.pmpHistTTC : b.pmpHistHT) : 0;
    const totalCostInHT = coutInvHT + (b.approCostPostHT || 0) + (b.transferCostPostHT || 0);
    const totalCostInTTC = coutInvTTC + (b.approCostPostTTC || 0) + (b.transferCostPostTTC || 0);
    const totalQtyIn = invQtyForPmp + (b.approCostPostQty || 0) + (b.transferCostPostQty || 0);
    return {
      pmpHT: totalQtyIn > 0 ? totalCostInHT / totalQtyIn : null,
      pmpTTC: totalQtyIn > 0 ? totalCostInTTC / totalQtyIn : null,
    };
  }
  const totalQtyIn = (b.approCostAllQty || 0) + (b.transferCostAllQty || 0);
  const totalCostInHT = (b.approCostAllHT || 0) + (b.transferCostAllHT || 0);
  const totalCostInTTC = (b.approCostAllTTC || 0) + (b.transferCostAllTTC || 0);
  return {
    pmpHT: totalQtyIn > 0 ? totalCostInHT / totalQtyIn : null,
    pmpTTC: totalQtyIn > 0 ? totalCostInTTC / totalQtyIn : null,
  };
}

// ─── Produits transformés — stock courant d'un PT (stockUtils :137 / :208) ────
// Labo : lignes stock_labo_pt_daily (quantite > 0 OR type_appro = 'PT') − labo_transfers
// (labo_id = source) − pertes − ventes acheteurs ; le miroir NULL < 0 est exclu (compté par
// labo_transfers) ; l'entrée 'transfert' (+) d'un labo destinataire compte comme réception.
async function computeStockPT(db, scope, scopeId, produitId) {
  if (scope === 'labo') {
    const r = await db.query(
      `WITH last_inv AS (
         SELECT quantite_reelle, date_inventaire FROM inventaires
         WHERE labo_id = $1 AND produit_id = $2
         ORDER BY date_inventaire DESC, created_at DESC LIMIT 1
       ),
       appro AS (
         SELECT
           COALESCE(SUM(quantite) FILTER (
             WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
               AND date_appro >= (SELECT date_inventaire FROM last_inv)
               AND (quantite > 0 OR type_appro = 'PT')
           ), 0) AS post_qty,
           COALESCE(SUM(quantite) FILTER (WHERE quantite > 0 OR type_appro = 'PT'), 0) AS all_qty
         FROM stock_labo_pt_daily
         WHERE labo_id = $1 AND produit_id = $2
       ),
       transfers AS (
         SELECT
           COALESCE(SUM(quantite) FILTER (
             WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
               AND date_transfert >= (SELECT date_inventaire FROM last_inv)
           ), 0) AS post_qty,
           COALESCE(SUM(quantite), 0) AS all_qty
         FROM labo_transfers
         WHERE labo_id = $1 AND produit_id = $2
       ),
       pertes AS (
         SELECT
           COALESCE(SUM(quantite) FILTER (
             WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
               AND date_perte >= (SELECT date_inventaire FROM last_inv)
           ), 0) AS post_qty,
           COALESCE(SUM(quantite), 0) AS all_qty
         FROM labo_pertes
         WHERE labo_id = $1 AND produit_id = $2
       ),
       ventes_ach AS (
         SELECT
           COALESCE(SUM(cal.quantite_unites) FILTER (
             WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
               AND COALESCE(ca.date_expedition, ca.date_commande) >= (SELECT date_inventaire FROM last_inv)
           ), 0) AS post_qty,
           COALESCE(SUM(cal.quantite_unites), 0) AS all_qty
         FROM commande_acheteur_lignes cal
         JOIN commandes_acheteur ca ON ca.id = cal.commande_id
         WHERE ca.labo_id = $1 AND ca.statut IN ('expediee', 'livree')
           AND cal.article_type = 'produit' AND cal.article_id = $2
       )
       SELECT CASE
         WHEN (SELECT date_inventaire FROM last_inv) IS NOT NULL
           THEN (SELECT quantite_reelle FROM last_inv)
                + (SELECT post_qty FROM appro)
                - (SELECT post_qty FROM transfers)
                - (SELECT post_qty FROM pertes)
                - (SELECT post_qty FROM ventes_ach)
         ELSE
                (SELECT all_qty FROM appro)
                - (SELECT all_qty FROM transfers)
                - (SELECT all_qty FROM pertes)
                - (SELECT all_qty FROM ventes_ach)
       END AS stock_courant`,
      [scopeId, produitId]
    );
    return round3(r.rows[0]?.stock_courant ?? 0);
  }
  const r = await db.query(
    `WITH last_inv AS (
       SELECT quantite_reelle, date_inventaire FROM inventaires
       WHERE activite_id = $1 AND produit_id = $2
       ORDER BY date_inventaire DESC, created_at DESC LIMIT 1
     ),
     appro AS (
       SELECT
         COALESCE(SUM(quantite) FILTER (
           WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
             AND date_appro >= (SELECT date_inventaire FROM last_inv)
         ), 0) AS post_qty,
         COALESCE(SUM(quantite), 0) AS all_qty
       FROM stock_produits_transformes
       WHERE activite_id = $1 AND produit_id = $2
     ),
     pertes AS (
       SELECT
         COALESCE(SUM(quantite) FILTER (
           WHERE (SELECT date_inventaire FROM last_inv) IS NOT NULL
             AND date_perte >= (SELECT date_inventaire FROM last_inv)
         ), 0) AS post_qty,
         COALESCE(SUM(quantite), 0) AS all_qty
       FROM pertes
       WHERE activite_id = $1 AND produit_id = $2
     )
     SELECT CASE
       WHEN (SELECT date_inventaire FROM last_inv) IS NOT NULL
         THEN (SELECT quantite_reelle FROM last_inv)
              + (SELECT post_qty FROM appro)
              - (SELECT post_qty FROM pertes)
       ELSE
              (SELECT all_qty FROM appro)
              - (SELECT all_qty FROM pertes)
     END AS stock_courant`,
    [scopeId, produitId]
  );
  return round3(r.rows[0]?.stock_courant ?? 0);
}

// ─── API publique ─────────────────────────────────────────────────────────────

function assertScope(scope) {
  if (scope !== 'labo' && scope !== 'activite') throw new Error(`stockService: scope invalide « ${scope} »`);
}

// Ligne de baseline d'UN article (labo ou activité), à date optionnelle.
async function loadSingle(db, scope, scopeId, articleId, atDate) {
  const sql = scope === 'labo' ? laboArticlesSql('single', atDate) : activiteArticlesSql('single', atDate);
  const params = atDate ? [scopeId, articleId, atDate] : [scopeId, articleId];
  const r = await db.query(sql, params);
  return r.rows[0] || null;
}

/**
 * Stock courant d'un article ({ articleId }) ou d'un PT ({ produitId }) dans une unité.
 * @param {object} db  pool ou client de transaction
 * @param {'labo'|'activite'} scope
 * @param {number} id  laboId | activiteId
 * @param {{ articleId?: number, produitId?: number }} ref
 * @returns {Promise<number>} arrondi au millième (peut être négatif si données incohérentes)
 */
async function computeStock(db, scope, id, ref = {}) {
  assertScope(scope);
  const d = db || pool;
  if (ref.produitId != null) return computeStockPT(d, scope, id, ref.produitId);
  if (ref.articleId == null) throw new Error('stockService.computeStock: articleId ou produitId requis');
  const row = await loadSingle(d, scope, id, ref.articleId, null);
  return round3(row?.stock_courant ?? 0);
}

/**
 * Stock + PMP de TOUS les articles sélectionnés d'une unité (labo_ingredient_selections /
 * activite_ingredient_selections). `detail` = baseline complète (mêmes champs que les
 * contrôleurs : hasInv, invQty, invDate, postApproQty, allApproQty …) pour la ventilation affichée.
 * @returns {Promise<Record<number, { stock: number, pmpHT: number|null, pmpTTC: number|null, detail: object }>>}
 */
async function computeStockBulk(db, scope, id) {
  assertScope(scope);
  const d = db || pool;
  const sql = scope === 'labo' ? laboArticlesSql('bulk', null) : activiteArticlesSql('bulk', null);
  const r = await d.query(sql, [id]);
  const out = {};
  for (const row of r.rows) {
    const detail = scope === 'labo' ? mapLaboDetail(row) : mapActiviteDetail(row);
    const pmp = scope === 'labo' ? pmpLaboFromDetail(detail) : pmpActiviteFromDetail(detail);
    out[row.ingredient_id] = { stock: round3(row.stock_courant ?? 0), pmpHT: pmp.pmpHT, pmpTTC: pmp.pmpTTC, detail };
  }
  return out;
}

/**
 * PMP d'un article dans une unité — formule EXACTE de getLaboStock (labo) / getStockEntreprise
 * (activité). `atDate` : calcul « à date » (mouvements et inventaires ≤ atDate), pour
 * l'édition d'un transfert existant (getTransferPrix).
 * @returns {Promise<{ pmpHT: number|null, pmpTTC: number|null, tauxTva: number|null }>}
 */
async function computePmp(db, scope, id, articleId, { atDate = null } = {}) {
  assertScope(scope);
  const d = db || pool;
  const row = await loadSingle(d, scope, id, articleId, atDate);
  if (!row) return { pmpHT: null, pmpTTC: null, tauxTva: null };
  const detail = scope === 'labo' ? mapLaboDetail(row) : mapActiviteDetail(row);
  const pmp = scope === 'labo' ? pmpLaboFromDetail(detail) : pmpActiviteFromDetail(detail);
  return { pmpHT: pmp.pmpHT, pmpTTC: pmp.pmpTTC, tauxTva: detail.lastTauxTva };
}

module.exports = { computeStock, computeStockBulk, computePmp };
