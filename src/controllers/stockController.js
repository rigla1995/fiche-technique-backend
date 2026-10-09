const pool = require('../config/database');
const { ptCategorie, ptCategorieSql, ptTypeSql } = require('../utils/stockUtils');
const ExcelJS = require('exceljs');
const { scopeGerantActivite } = require('../middleware/auth');
const { isoDate, todayStr } = require('../utils/dateUtils');
const { brandHeader, headerRow, dataRowStyle, totalRowStyle, brandFooter, finalize, FMT_DT, FMT_QTE } = require('../services/excelBrandService');
const { upsertFacture } = require('../services/facturesService');
const { withTransaction } = require('../utils/db');
const { computeStockBulk } = require('../services/stockService');
const { recalculerFacture, apresRetraitDeLigne, gardeDerniereLigne } = require('../services/facturesAppro');
const stockage = require('../services/stockageFichiers');
const { vocabDefaut, libelleCategoriePt } = require('../utils/vocab');
const { ongletSur } = require('../utils/excelNoms');


// ─── Stock Entreprise ──────────────────────────────────────────────────────

const getStockEntreprise = async (req, res) => {
  const { activiteId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: '[[Nom:activite]] introuvable' });

    const result = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie,
              ais.seuil_min,
              COALESCE(SUM(sed.quantite) FILTER (WHERE date_trunc('month', sed.date_appro) = date_trunc('month', CURRENT_DATE)), 0) as total_quantite,
              last_sed.prix_unitaire,
              last_sed.taux_tva       as last_taux_tva,
              last_sed.date_appro,
              last_sed.fournisseur_id as last_fournisseur_id,
              last_sed.ref_facture    as last_ref_facture,
              last_sed.type_appro     as last_type_appro,
              COALESCE(
                AVG(sed.prix_unitaire) FILTER (WHERE date_trunc('month', sed.date_appro) = date_trunc('month', CURRENT_DATE) AND sed.quantite > 0)
                * SUM(sed.quantite) FILTER (WHERE date_trunc('month', sed.date_appro) = date_trunc('month', CURRENT_DATE))
              , 0) as cout_total
       FROM activite_ingredient_selections ais
       JOIN articles i ON ais.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN stock_entreprise_daily sed ON sed.ingredient_id = i.id AND sed.activite_id = $1
       LEFT JOIN LATERAL (
         SELECT prix_unitaire, taux_tva, date_appro, fournisseur_id, ref_facture, type_appro
         FROM stock_entreprise_daily
         WHERE activite_id = $1 AND ingredient_id = i.id
           AND type_appro IN ('manuel', 'transfert')
         ORDER BY date_appro DESC, id DESC LIMIT 1
       ) last_sed ON true
       WHERE ais.activite_id = $1
       GROUP BY i.id, i.nom, u.nom, c.nom, ais.seuil_min,
                last_sed.prix_unitaire, last_sed.taux_tva, last_sed.date_appro, last_sed.fournisseur_id,
                last_sed.ref_facture, last_sed.type_appro
       ORDER BY categorie NULLS LAST, i.nom`,
      [activiteId]
    );

    // Fetch PT products prix_calcule — last price × portion (same logic as labo, using stock_entreprise_daily)
    const ptPrixRes = await pool.query(`
      SELECT p.id as produit_id,
        (
          COALESCE((SELECT SUM(pi2.portion * (
             SELECT COALESCE(sld2.prix_unitaire_tva, sld2.prix_unitaire) FROM stock_entreprise_daily sld2
             WHERE sld2.activite_id = $1 AND sld2.ingredient_id = pi2.ingredient_id
               AND sld2.type_appro IN ('manuel', 'transfert') AND COALESCE(sld2.prix_unitaire_tva, sld2.prix_unitaire) IS NOT NULL
             ORDER BY sld2.date_appro DESC NULLS LAST LIMIT 1
          )) FROM produit_ingredients pi2 WHERE pi2.produit_id = p.id), 0)
          +
          COALESCE((SELECT SUM(psp.portion * (
             SELECT COALESCE(SUM(pi3.portion * (
                SELECT COALESCE(sld3.prix_unitaire_tva, sld3.prix_unitaire) FROM stock_entreprise_daily sld3
                WHERE sld3.activite_id = $1 AND sld3.ingredient_id = pi3.ingredient_id
                  AND sld3.type_appro IN ('manuel', 'transfert') AND COALESCE(sld3.prix_unitaire_tva, sld3.prix_unitaire) IS NOT NULL
                ORDER BY sld3.date_appro DESC NULLS LAST LIMIT 1
             )), 0) FROM produit_ingredients pi3 WHERE pi3.produit_id = psp.sous_produit_id
          )) FROM produit_sous_produits psp WHERE psp.produit_id = p.id), 0)
        ) as prix_calcule
      FROM produits p
      WHERE p.id IN (
        SELECT pas.produit_id FROM produit_activite_stock pas
        WHERE pas.activite_id = $1
      )
    `, [activiteId]);
    const ptPrixMap = {};
    for (const r of ptPrixRes.rows) {
      const pc = parseFloat(r.prix_calcule) || 0;
      ptPrixMap[r.produit_id] = { prixCalcule: pc > 0 ? pc : null };
    }

    const ptRes = await pool.query(`
      SELECT p.id as produit_id, p.nom, p.type, COALESCE(pas.seuil_min, p.seuil_min_pt) AS seuil_min_pt, p.origine,
             last_spt.date_appro   as last_date_appro,
             last_spt.prix_calcule as last_prix_calcule,
             -- Prix partiel : au moins un composant de la recette sans prix (article via la
             -- fenêtre PMP de l'activité, ou sous-PT sans prix courant). Le front masque
             -- alors le prix unitaire (un coût partiel serait trompeur). Sans objet pour les
             -- PT d'origine labo : ils sont valorisés à la PMP des transferts reçus.
             (
               p.origine IS DISTINCT FROM 'labo'
               AND (
               EXISTS (
                 SELECT 1 FROM produit_ingredients pi
                 WHERE pi.produit_id = p.id
                   AND (SELECT SUM(sed.quantite * sed.prix_unitaire) / NULLIF(SUM(sed.quantite), 0)
                        FROM stock_entreprise_daily sed
                        WHERE sed.ingredient_id = pi.ingredient_id AND sed.activite_id = $1
                          AND sed.quantite > 0 AND sed.prix_unitaire IS NOT NULL
                          AND sed.type_appro IN ('manuel', 'transfert')
                          AND sed.date_appro >= COALESCE(
                            (SELECT date_inventaire FROM inventaires
                             WHERE activite_id = $1 AND ingredient_id = pi.ingredient_id
                             ORDER BY date_inventaire DESC, created_at DESC LIMIT 1),
                            (SELECT MIN(date_appro) FROM stock_entreprise_daily
                             WHERE activite_id = $1 AND ingredient_id = pi.ingredient_id AND quantite > 0)
                          )
                       ) IS NULL
               )
               OR EXISTS (
                 SELECT 1 FROM produit_sous_produits psp
                 WHERE psp.produit_id = p.id
                   AND (SELECT spt3.prix_calcule FROM stock_produits_transformes spt3
                         WHERE spt3.produit_id = psp.sous_produit_id AND spt3.activite_id = $1
                           AND spt3.quantite > 0 AND spt3.prix_calcule IS NOT NULL
                         ORDER BY spt3.date_appro DESC, spt3.id DESC LIMIT 1) IS NULL
               )
               )
             ) AS prix_partiel
      FROM produits p
      LEFT JOIN LATERAL (
        -- Dernière réception valorisée (appro/transfert, quantité +) : exclut les consommations de sous-PT (quantité -, prix NULL).
        SELECT date_appro, prix_calcule FROM stock_produits_transformes
        WHERE produit_id = p.id AND activite_id = $1 AND quantite > 0 AND prix_calcule IS NOT NULL
        ORDER BY date_appro DESC, id DESC LIMIT 1
      ) last_spt ON true
      JOIN produit_activite_stock pas ON pas.produit_id = p.id AND pas.activite_id = $1
      ORDER BY p.nom
    `, [activiteId]);

    // ── Baseline articles (lot 1b) : moteur unique stockService.computeStockBulk (§2.2) ──
    // { [ingredientId]: { stock, pmpHT, pmpTTC, detail } } — même CTE et même formule PMP
    // (appros manuels + transferts reçus) que l'ancien bloc.
    const bulk = await computeStockBulk(pool, 'activite', activiteId);

    // ── PT baseline: last current-year inv + post-inv appros - pertes ─────────
    const ptBaselineRes = await pool.query(
      `WITH last_inv AS (
         SELECT DISTINCT ON (produit_id)
           produit_id, quantite_reelle, date_inventaire
         FROM inventaires
         WHERE activite_id = $1 AND produit_id IS NOT NULL
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
       post_ventes AS (
         -- Exclut les consommations de sous-PT à la production (type_appro='PT') : ce ne sont pas des ventes.
         SELECT spt.produit_id, SUM(ABS(spt.quantite)) as qty
         FROM stock_produits_transformes spt
         JOIN last_inv li ON li.produit_id = spt.produit_id AND spt.date_appro >= li.date_inventaire
         WHERE spt.activite_id = $1 AND spt.quantite < 0 AND spt.type_appro IS DISTINCT FROM 'PT'
         GROUP BY spt.produit_id
       ),
       avg_prix_post AS (
         -- quantite > 0 : ne valorise que les entrées (appro/transfert), pas les consommations/ventes (prix éventuel).
         SELECT spt.produit_id, AVG(spt.prix_calcule) as avg_prix
         FROM stock_produits_transformes spt
         JOIN last_inv li ON li.produit_id = spt.produit_id AND spt.date_appro >= li.date_inventaire
         WHERE spt.activite_id = $1 AND spt.prix_calcule IS NOT NULL AND spt.quantite > 0
         GROUP BY spt.produit_id
       ),
       all_appro AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM stock_produits_transformes
         WHERE activite_id = $1
         GROUP BY produit_id
       ),
       all_ventes AS (
         -- Exclut les consommations de sous-PT à la production (type_appro='PT') : ce ne sont pas des ventes.
         SELECT produit_id, SUM(ABS(quantite)) as qty
         FROM stock_produits_transformes
         WHERE activite_id = $1 AND quantite < 0 AND type_appro IS DISTINCT FROM 'PT'
         GROUP BY produit_id
       ),
       all_pertes AS (
         SELECT produit_id, SUM(quantite) as qty
         FROM pertes
         WHERE activite_id = $1 AND produit_id IS NOT NULL
         GROUP BY produit_id
       ),
       avg_prix_all AS (
         -- quantite > 0 : ne valorise que les entrées (appro/transfert), pas les consommations/ventes (prix éventuel).
         SELECT produit_id, AVG(prix_calcule) as avg_prix
         FROM stock_produits_transformes
         WHERE activite_id = $1 AND prix_calcule IS NOT NULL AND quantite > 0
         GROUP BY produit_id
       ),
       wavg_prix_post AS (
         -- PMP PONDÉRÉE des réceptions depuis le dernier inventaire : prix affiché des PT
         -- d'origine labo (reçus uniquement par transfert — pas de coût recette côté activité).
         SELECT spt.produit_id, SUM(spt.quantite * spt.prix_calcule) / NULLIF(SUM(spt.quantite), 0) as wavg_prix
         FROM stock_produits_transformes spt
         JOIN last_inv li ON li.produit_id = spt.produit_id AND spt.date_appro >= li.date_inventaire
         WHERE spt.activite_id = $1 AND spt.prix_calcule IS NOT NULL AND spt.quantite > 0
         GROUP BY spt.produit_id
       ),
       wavg_prix_all AS (
         SELECT produit_id, SUM(quantite * prix_calcule) / NULLIF(SUM(quantite), 0) as wavg_prix
         FROM stock_produits_transformes
         WHERE activite_id = $1 AND prix_calcule IS NOT NULL AND quantite > 0
         GROUP BY produit_id
       ),
       pt_list AS (
         SELECT pas.produit_id FROM produit_activite_stock pas
         WHERE pas.activite_id = $1
       )
       SELECT pl.produit_id,
              li.quantite_reelle        as inv_qty,
              li.date_inventaire        as inv_date,
              COALESCE(pa.qty, 0)       as post_appro_qty,
              COALESCE(pp.qty, 0)       as post_pertes_qty,
              COALESCE(pv.qty, 0)       as post_vente_qty,
              app.avg_prix              as avg_prix_post,
              COALESCE(aa.qty, 0)       as all_appro_qty,
              COALESCE(av.qty, 0)       as all_vente_qty,
              COALESCE(ap.qty, 0)       as all_pertes_qty,
              apy.avg_prix              as avg_prix_all,
              wpp.wavg_prix             as wavg_prix_post,
              wpa.wavg_prix             as wavg_prix_all
       FROM pt_list pl
       LEFT JOIN last_inv li        ON li.produit_id = pl.produit_id
       LEFT JOIN post_appro pa      ON pa.produit_id = pl.produit_id
       LEFT JOIN post_pertes pp     ON pp.produit_id = pl.produit_id
       LEFT JOIN post_ventes pv     ON pv.produit_id = pl.produit_id
       LEFT JOIN avg_prix_post app  ON app.produit_id = pl.produit_id
       LEFT JOIN all_appro aa       ON aa.produit_id = pl.produit_id
       LEFT JOIN all_ventes av      ON av.produit_id = pl.produit_id
       LEFT JOIN all_pertes ap      ON ap.produit_id = pl.produit_id
       LEFT JOIN avg_prix_all apy   ON apy.produit_id = pl.produit_id
       LEFT JOIN wavg_prix_post wpp ON wpp.produit_id = pl.produit_id
       LEFT JOIN wavg_prix_all wpa  ON wpa.produit_id = pl.produit_id`,
      [activiteId]
    );
    const ptBaselineMap = {};
    for (const r of ptBaselineRes.rows) {
      ptBaselineMap[r.produit_id] = {
        hasInv: r.inv_qty !== null,
        invQty: r.inv_qty !== null ? parseFloat(r.inv_qty) : 0,
        invDate: r.inv_date ? isoDate(r.inv_date) : null,
        postApproQty: parseFloat(r.post_appro_qty) || 0,
        postPertesQty: parseFloat(r.post_pertes_qty) || 0,
        postVenteQty: parseFloat(r.post_vente_qty) || 0,
        avgPrixPost: r.avg_prix_post !== null ? parseFloat(r.avg_prix_post) : null,
        allApproQty: parseFloat(r.all_appro_qty) || 0,
        allVenteQty: parseFloat(r.all_vente_qty) || 0,
        allPertesQty: parseFloat(r.all_pertes_qty) || 0,
        avgPrixAll: r.avg_prix_all !== null ? parseFloat(r.avg_prix_all) : null,
        wavgPrixPost: r.wavg_prix_post !== null ? parseFloat(r.wavg_prix_post) : null,
        wavgPrixAll: r.wavg_prix_all !== null ? parseFloat(r.wavg_prix_all) : null,
      };
    }

    const ptRows = ptRes.rows.map((r) => {
      const pInfo = ptPrixMap[r.produit_id] || { prixCalcule: null };
      const pb = ptBaselineMap[r.produit_id] || {};
      const quantite = pb.hasInv
        ? pb.invQty + pb.postApproQty - pb.postPertesQty
        : pb.allApproQty - pb.allPertesQty;
      const avgPrix = pb.hasInv ? (pb.avgPrixPost ?? pb.avgPrixAll ?? null) : (pb.avgPrixAll ?? null);
      const pertesDepuisInv = pb.hasInv ? pb.postPertesQty : pb.allPertesQty;
      const venteDepuisInv = pb.hasInv ? pb.postVenteQty : pb.allVenteQty;
      // Prix affiché = DERNIER prix de réception (transfert/appro) depuis le dernier inventaire ;
      // repli sur le coût recette (ptPrixMap) si aucune réception depuis l'inventaire.
      const lastRecepDate = r.last_date_appro ? String(r.last_date_appro).slice(0, 10) : null;
      const invDate = pb.hasInv && pb.invDate ? String(pb.invDate).slice(0, 10) : null;
      const lastRecepPrice = (r.last_prix_calcule != null && lastRecepDate && (!invDate || lastRecepDate >= invDate))
        ? parseFloat(r.last_prix_calcule) : null;
      // PT d'origine labo (transfert uniquement) : prix affiché = PMP PONDÉRÉE des
      // transferts reçus (le coût recette côté activité n'a pas de sens pour eux).
      const pmpReceptions = pb.hasInv ? (pb.wavgPrixPost ?? pb.wavgPrixAll ?? null) : (pb.wavgPrixAll ?? null);
      const ptPrix = (r.origine === 'labo' && pmpReceptions != null && pmpReceptions > 0)
        ? Math.round(pmpReceptions * 1000) / 1000
        : ((lastRecepPrice != null && lastRecepPrice > 0) ? lastRecepPrice : pInfo.prixCalcule);
      return {
        ingredientId: -(r.produit_id),
        produitId: r.produit_id,
        isPT: true,
        // origine='labo' => PT reçu UNIQUEMENT par transfert côté activité (pas d'appro manuel).
        // Le front bloque alors la saisie de quantité et affiche un indicateur (garde-fou aligné sur saveStockPT).
        origine: r.origine || 'activite',
        nom: r.nom,
        unite: 'unité',
        categorie: ptCategorie(r.type, r.origine),
        prixPartiel: r.prix_partiel === true,
        prixUnitaire: ptPrix,
        prixCalcule: ptPrix,
        quantite,
        totalQuantite: quantite,
        dateAppro: isoDate(r.last_date_appro),
        seuilMin: r.seuil_min_pt !== null ? parseFloat(r.seuil_min_pt) : null,
        coutTotal: avgPrix !== null && quantite > 0 ? quantite * avgPrix : (ptPrix != null && ptPrix > 0 && quantite > 0 ? ptPrix * quantite : 0),
        lastFournisseurId: null,
        lastRefFacture: null,
        lastInvDate: pb.hasInv ? pb.invDate : null,
        lastInvQty: pb.hasInv ? pb.invQty : null,
        pertesDepuisInv,
        ptUsageDepuisInv: 0,
        venteDepuisInv,
      };
    });

    res.json([...result.rows.map((row) => {
      const e = bulk[row.ingredient_id] || null;
      const b = e ? e.detail : {};
      const quantite = e ? e.stock : 0;
      const pertesDepuisInv = b.hasInv ? b.postPertesQty : b.allPertesQty;
      const ptUsageDepuisInv = b.hasInv ? b.postPtUsageQty : b.allPtUsageQty;
      const venteDepuisInv = b.hasInv ? b.postVenteQty : b.allVenteQty;
      const transfertsDepuisAppro = b.hasInv ? b.postTransfertsInQty : b.allTransfertsInQty;
      // PMP HT/TTC = stockService (inventaire valorisé au pmp_hist seulement s'il a une base de
      // coût — sinon exclu du dénominateur, cf. stockService.pmpActiviteFromDetail).
      const pmpHT = e ? e.pmpHT : null;
      const pmpTTC = e ? e.pmpTTC : null;
      const coutTotal = pmpHT !== null && quantite > 0 ? Math.round(quantite * pmpHT * 1000) / 1000 : 0;
      const coutTotalTTC = pmpTTC !== null && quantite > 0 ? Math.round(quantite * pmpTTC * 1000) / 1000 : 0;
      return {
        ingredientId: row.ingredient_id,
        nom: row.nom,
        unite: row.unite_nom,
        categorie: row.categorie,
        seuilMin: row.seuil_min !== null ? parseFloat(row.seuil_min) : null,
        prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
        lastTauxTva: row.last_taux_tva !== null ? parseFloat(row.last_taux_tva) : null,
        quantite,
        totalQuantite: quantite,
        coutTotal,
        coutTotalTTC,
        dateAppro: isoDate(row.date_appro),
        lastFournisseurId: row.last_fournisseur_id ?? null,
        lastRefFacture: row.last_ref_facture ?? null,
        lastTypeAppro: row.last_type_appro ?? null,
        lastInvDate: b.hasInv ? b.invDate : null,
        lastInvQty: b.hasInv ? b.invQty : null,
        pertesDepuisInv,
        ptUsageDepuisInv,
        venteDepuisInv,
        transfertsDepuisAppro,
        approDepuisInv: b.hasInv ? b.approCostPostQty : b.approCostAllQty,
      };
    }), ...ptRows]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockEntreprise = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  const { quantite, prixUnitaire, dateAppro, fournisseurId, refFacture, tauxTva, timbreFiscal = false } = req.body;
  const da = dateAppro || todayStr();
  const tva = tauxTva != null ? parseFloat(tauxTva) : 0;
  const prixUnitaireTva = prixUnitaire != null ? parseFloat(prixUnitaire) * (1 + tva / 100) : null;

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: '[[Nom:activite]] introuvable' });

    const clientId = req.user.gerant_parent_id || req.user.id;
    // Atomic: the stock row and its linked facture are written together (or not at all).
    await withTransaction(async (client) => {
      const insRes = await client.query(
        `INSERT INTO stock_entreprise_daily
           (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture, taux_tva, prix_unitaire_tva, updated_at, created_by)
         VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, $8, $9, NOW(), $10)
         RETURNING id`,
        [activiteId, ingredientId, da, quantite ?? null, prixUnitaire ?? null,
         fournisseurId ?? null, refFacture ?? null, tva, prixUnitaireTva, req.user.id]
      );
      if (refFacture) {
        const qty = parseFloat(quantite) || 0;
        const pu = parseFloat(prixUnitaire) || 0;
        const puTva = prixUnitaireTva != null ? parseFloat(prixUnitaireTva) : pu;
        const montantHT = qty * pu;
        const montantTva = tva != null ? qty * pu * (tva / 100) : 0;
        const montantTTC = qty * puTva;
        await upsertFacture(clientId, {
          refFacture,
          dateAppro: da,
          fournisseurId: fournisseurId ?? null,
          activiteId: parseInt(activiteId),
          laboId: null,
          typeSource: 'manuel',
          montantHT,
          montantTva,
          montantTTC,
          timbreFiscal: !!timbreFiscal,
          createdBy: req.user.id,
          stockTable: 'stock_entreprise_daily',
          stockRowId: insRes.rows[0].id,
        }, client);
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateSeuilMin = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  const { seuilMin } = req.body;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: '[[Nom:activite]] introuvable' });

    await pool.query(
      `UPDATE activite_ingredient_selections
       SET seuil_min = $1
       WHERE activite_id = $2 AND ingredient_id = $3`,
      [seuilMin ?? null, activiteId, ingredientId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── History ──────────────────────────────────────────────────────────────────

const getHistoryEntreprise = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: '[[Nom:activite]] introuvable' });

    const result = await pool.query(
      `SELECT sed.date_appro, sed.quantite, sed.prix_unitaire, sed.type_appro,
              sed.ref_facture, f.nom as fournisseur_nom, sed.updated_at,
              sed.taux_tva, sed.prix_unitaire_tva
       FROM stock_entreprise_daily sed
       LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
       WHERE sed.activite_id = $1 AND sed.ingredient_id = $2
       ORDER BY sed.date_appro DESC
       LIMIT 5`,
      [activiteId, ingredientId]
    );
    res.json(result.rows.map(mapHistEntry));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Historique Approvisionnement ─────────────────────────────────────────────

const getHistoriqueAppro = async (req, res) => {
  // Enforce activité scope for gérant accounts (multi-affectations)
  if (req.user.role === 'gerant') {
    if (!scopeGerantActivite(req, res)) return;
    delete req.query.entType;
  }
  const { activiteId, activiteIds: activiteIdsParam, entType, ingredientId, categorieId, startDate, endDate, fournisseurId, refFacture, ptOnly, ptProduitId, ptType, limit, offset } = req.query;
  const parsedLimit = parseInt(limit, 10) || null;
  const parsedOffset = parseInt(offset, 10) || 0;
  const currentYear = new Date().getFullYear();

  try {
    if (activiteId || activiteIdsParam || entType) {
      // Resolve activiteIds list
      let activiteIds = [];
      if (activiteId) {
        const check = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE a.id = $1 AND pe.client_id = $2`,
          [activiteId, req.user.gerant_parent_id || req.user.id]
        );
        if (check.rows.length === 0) return res.status(404).json({ message: '[[Nom:activite]] introuvable' });
        activiteIds = [activiteId];
      } else if (activiteIdsParam) {
        // Comma-separated list of activiteIds
        const requested = activiteIdsParam.split(',').map(Number).filter(Boolean);
        const check = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE a.id = ANY($1) AND pe.client_id = $2`,
          [requested, req.user.gerant_parent_id || req.user.id]
        );
        activiteIds = check.rows.map((r) => r.id);
        if (activiteIds.length === 0) return res.json([]);
      } else if (entType) {
        // All activités for this client (optionally filtered by laboId)
        const clientId = req.user.gerant_parent_id || req.user.id;
        const entTypeParams = [clientId];
        let laboFilter = '';
        if (req.query.laboId) {
          entTypeParams.push(req.query.laboId);
          laboFilter = ` AND a.labo_id = $${entTypeParams.length}`;
        }
        const allRes = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE pe.client_id = $1${laboFilter}`,
          entTypeParams
        );
        activiteIds = allRes.rows.map((r) => r.id);
        if (activiteIds.length === 0) return res.json([]);
      }

      const idList = activiteIds.map((_, i) => `$${i + 1}`).join(',');
      const params = [...activiteIds, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND sed.ingredient_id = $${params.length}`; }
      else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND sed.date_appro >= $${params.length}`; }
      if (endDate) { params.push(endDate); extraWhere += ` AND sed.date_appro <= $${params.length}`; }
      if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND sed.fournisseur_id = $${params.length}`; }
      if (refFacture) { params.push(`%${refFacture}%`); extraWhere += ` AND sed.ref_facture ILIKE $${params.length}`; }

      const result = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.date_appro, sed.quantite, sed.prix_unitaire, sed.type_appro,
                sed.ref_facture, sed.fournisseur_id, f.nom as fournisseur_nom, sed.updated_at,
                sed.created_by, ub.nom as created_by_nom,
                sed.taux_tva, sed.prix_unitaire_tva,
                i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_entreprise_daily sed
         JOIN articles i ON i.id = sed.ingredient_id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
         LEFT JOIN utilisateurs ub ON ub.id = sed.created_by
         WHERE sed.activite_id IN (${idList}) AND sed.date_appro >= make_date($${activiteIds.length + 1}::int, 1, 1) AND sed.date_appro < make_date($${activiteIds.length + 1}::int + 1, 1, 1)${extraWhere}
         ORDER BY sed.date_appro DESC, i.nom
         ${parsedLimit ? `LIMIT ${parsedLimit} OFFSET ${parsedOffset}` : ''}`,
        params
      );

      let regularRows = result.rows.map(mapHistoriqueEntry);

      // Append PT entries if no category filter is active or ptOnly is requested
      if (ptOnly === 'true' || (!categorieId && !ingredientId)) {
        const ptParams = [...activiteIds];
        let ptWhere = `spt.activite_id IN (${idList})`;
        if (startDate) { ptParams.push(startDate); ptWhere += ` AND spt.date_appro >= $${ptParams.length}`; }
        if (endDate) { ptParams.push(endDate); ptWhere += ` AND spt.date_appro <= $${ptParams.length}`; }
        if (ptProduitId) { ptParams.push(ptProduitId); ptWhere += ` AND spt.produit_id = $${ptParams.length}`; }
        if (ptType) ptWhere += ` AND ${ptTypeSql('p', ptType)}`;
        const ptResult = await pool.query(
          `SELECT spt.id, spt.activite_id, spt.date_appro, spt.quantite, spt.prix_calcule, spt.created_at, p.nom as produit_nom, p.id as produit_id, p.type, p.origine,
                  spt.ref_facture, spt.fournisseur_id, f.nom AS fournisseur_nom
           FROM stock_produits_transformes spt
           JOIN produits p ON p.id = spt.produit_id
           LEFT JOIN fournisseurs f ON f.id = spt.fournisseur_id
           WHERE ${ptWhere} AND spt.type_appro IS DISTINCT FROM 'PT'
           ORDER BY spt.date_appro DESC`,
          ptParams
        );
        const ptEntries = ptResult.rows.map((spt) => ({
          id: spt.id,
          activiteId: spt.activite_id,
          dateAppro: isoDate(spt.date_appro),
          quantite: spt.quantite !== null ? parseFloat(spt.quantite) : null,
          prixUnitaire: spt.prix_calcule !== null ? parseFloat(spt.prix_calcule) : null,
          typeAppro: 'produit_transformé',
          refFacture: spt.ref_facture || null,
          fournisseurId: spt.fournisseur_id || null,
          fournisseurNom: spt.fournisseur_nom || null,
          updatedAt: spt.created_at,
          ingredientId: -(spt.produit_id),
          ingredientNom: spt.produit_nom,
          uniteNom: 'unité',
          categorieNom: ptCategorie(spt.type, spt.origine),
        }));
        if (ptOnly === 'true') {
          regularRows = ptEntries;
        } else {
          regularRows = [...regularRows, ...ptEntries].sort((a, b) => {
            if (!a.dateAppro) return 1;
            if (!b.dateAppro) return -1;
            return b.dateAppro.localeCompare(a.dateAppro);
          });
        }
      }

      res.json(regularRows);
    } else {
      // Aucun filtre activité/labo (cas indép supprimé) : rien à retourner.
      res.json([]);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/stock/historique/:id  (activiteId required for entreprise, clientId for independant)
const updateHistoriqueEntry = async (req, res) => {
  const { id } = req.params;
  const { quantite, prixUnitaire, fournisseurId, refFacture, isEntreprise } = req.body;
  try {
    if (isEntreprise) {
      // Verify ownership
      const check = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.ingredient_id, sed.quantite as old_quantite, sed.type_appro, sed.date_appro, sed.created_by, sed.transfert_id, sed.facture_id
         FROM stock_entreprise_daily sed
         JOIN activites a ON a.id = sed.activite_id
         JOIN profil_entreprise pe ON pe.id = a.entreprise_id
         WHERE sed.id = $1 AND pe.client_id = $2`,
        [id, req.user.gerant_parent_id || req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
      const entry = check.rows[0];
      if (req.user.role === 'gerant' && entry.created_by !== req.user.id)
        return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres enregistrements.' });
      // Lot 1b §2.4 : une ligne générée par un transfert ne se modifie que via le transfert
      // (fin de l'ajustement heuristique du miroir labo).
      if (entry.type_appro === 'transfert' || entry.transfert_id != null)
        return res.status(409).json({ code: 'LIGNE_DE_TRANSFERT', message: 'Modifiez ou supprimez [[le:transfert]]' });
      // Atomic: the stock_entreprise update and the compensating labo-stock adjustment
      // must both succeed or both roll back (else the quantities silently desync).
      await withTransaction(async (client) => {
        // Étape F1 (factures fournisseur) : le TTC de la ligne suit son nouveau prix HT (même taux de TVA), et la facture
        // de la ligne est recalculée (avant, ses montants restaient ceux de la saisie).
        await client.query(
          `UPDATE stock_entreprise_daily SET quantite=$1, prix_unitaire=$2, fournisseur_id=$3, ref_facture=$4, updated_at=NOW(),
                  prix_unitaire_tva = CASE WHEN $2::numeric IS NULL THEN NULL ELSE ROUND($2::numeric * (1 + COALESCE(taux_tva, 0) / 100), 3) END
           WHERE id=$5`,
          [quantite ?? null, prixUnitaire ?? null, fournisseurId || null, refFacture || null, id]
        );
        if (entry.facture_id) await recalculerFacture(client, entry.facture_id);
        // If transfert, adjust labo stock
        if (entry.type_appro === 'transfert') {
          const oldQty = parseFloat(entry.old_quantite) || 0;
          const newQty = parseFloat(quantite) || 0;
          const delta = oldQty - newQty;
          if (delta !== 0) {
            await client.query(
              `UPDATE stock_labo_daily SET quantite = COALESCE(quantite,0) + $1, updated_at=NOW()
               WHERE ingredient_id=$2 AND date_appro=$3 AND labo_id=(
                 SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id=l.entreprise_id
                 JOIN activites a ON a.entreprise_id=pe.id WHERE a.id=$4 LIMIT 1)`,
              [delta, entry.ingredient_id, entry.date_appro, entry.activite_id]
            );
          }
        }
      });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/stock/historique/:id
const deleteHistoriqueEntry = async (req, res) => {
  const { id } = req.params;
  const { isEntreprise } = req.query;
  try {
    if (isEntreprise === 'true') {
      const check = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.ingredient_id, sed.quantite, sed.type_appro, sed.date_appro, sed.created_by, sed.transfert_id, sed.facture_id
         FROM stock_entreprise_daily sed
         JOIN activites a ON a.id = sed.activite_id
         JOIN profil_entreprise pe ON pe.id = a.entreprise_id
         WHERE sed.id = $1 AND pe.client_id = $2`,
        [id, req.user.gerant_parent_id || req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
      if (check.rows[0].type_appro === 'vente' || check.rows[0].type_appro === 'annulation_vente')
        return res.status(403).json({ message: 'Cette entrée est liée à [[un:vente]] et ne peut pas être supprimée.' });
      // Lot 1b §2.4 : ligne de transfert → 409 (à supprimer via le transfert).
      if (check.rows[0].type_appro === 'transfert' || check.rows[0].transfert_id != null)
        return res.status(409).json({ code: 'LIGNE_DE_TRANSFERT', message: 'Modifiez ou supprimez [[le:transfert]]' });
      if (req.user.role === 'gerant' && check.rows[0].created_by !== req.user.id)
        return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres enregistrements.' });
      const entry = check.rows[0];
      // Étape F1 (factures fournisseur) : la dernière ligne d'une facture qui a une pièce jointe emporte la facture et sa
      // pièce — à confirmer (?confirmerFacture=1) ; sinon la facture est recalculée, ou supprimée si elle est vide.
      const garde = await gardeDerniereLigne(pool, { factureId: entry.facture_id, table: 'stock_entreprise_daily', confirme: req.query.confirmerFacture === '1' });
      if (garde) return res.status(409).json(garde);
      // Atomic: deleting the stock row and restoring the labo stock must not desync.
      const retrait = await withTransaction(async (client) => {
        await client.query('DELETE FROM stock_entreprise_daily WHERE id=$1', [id]);
        const apres = await apresRetraitDeLigne(client, { factureId: entry.facture_id, clientId: req.user.gerant_parent_id || req.user.id, auteurId: req.user.id });
        // If transfert, restore labo stock
        if (entry.type_appro === 'transfert') {
          const qty = parseFloat(entry.quantite) || 0;
          await client.query(
            `UPDATE stock_labo_daily SET quantite = COALESCE(quantite,0) + $1, updated_at=NOW()
             WHERE ingredient_id=$2 AND date_appro=$3 AND labo_id=(
               SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id=l.entreprise_id
               JOIN activites a ON a.entreprise_id=pe.id WHERE a.id=$4 LIMIT 1)`,
            [qty, entry.ingredient_id, entry.date_appro, entry.activite_id]
          );
        }
        return apres;
      });
      await stockage.supprimerSansErreur(retrait.clesAEffacer, 'facture supprimée avec sa dernière ligne');
      return res.json({ success: true, factureSupprimee: retrait.supprimee });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

function resolveAutoFournisseur(fournisseurNom, quantite) {
  // Show "AUTO" for PT consumption entries (negative qty), hide for others
  if (fournisseurNom === 'AUTO') {
    return (quantite !== null && parseFloat(quantite) < 0) ? 'AUTO' : null;
  }
  return fournisseurNom || null;
}

function mapHistEntry(r) {
  return {
    dateAppro: isoDate(r.date_appro),
    quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
    prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
    typeAppro: r.type_appro || 'manuel',
    fournisseurNom: resolveAutoFournisseur(r.fournisseur_nom, r.quantite),
    refFacture: r.ref_facture || null,
    updatedAt: r.updated_at,
    tauxTva: r.taux_tva != null ? parseFloat(r.taux_tva) : null,
    prixUnitaireTva: r.prix_unitaire_tva != null ? parseFloat(r.prix_unitaire_tva) : null,
  };
}

function mapHistoriqueEntry(r) {
  return {
    id: r.id,
    activiteId: r.activite_id || null,
    dateAppro: isoDate(r.date_appro),
    quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
    prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
    typeAppro: r.type_appro || 'manuel',
    fournisseurId: r.fournisseur_id || null,
    fournisseurNom: resolveAutoFournisseur(r.fournisseur_nom, r.quantite),
    refFacture: r.ref_facture || null,
    updatedAt: r.updated_at,
    ingredientId: r.ingredient_id,
    ingredientNom: r.ingredient_nom,
    uniteNom: r.unite_nom,
    categorieNom: r.categorie_nom,
    createdBy: r.created_by ?? null,
    createdByNom: r.created_by_nom ?? null,
    tauxTva: r.taux_tva != null ? parseFloat(r.taux_tva) : null,
    prixUnitaireTva: r.prix_unitaire_tva != null ? parseFloat(r.prix_unitaire_tva) : null,
  };
}

// ─── Export Excel Historique Appro ───────────────────────────────────────────
const exportHistoriqueExcel = async (req, res) => {
  const { activiteId, activiteIds: activiteIdsParam, entType, ingredientId, categorieId, startDate, endDate, fournisseurId, refFacture, selectedIds: selectedIdsParam, ptOnly, ptProduitId, ptType } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').map(Number).filter(Boolean) : []);
  const currentYear = new Date().getFullYear();
  const isEntreprise = !!(activiteId || activiteIdsParam || entType);
  const voc = req.voc ?? vocabDefaut;

  try {
    let rows = [];
    let activiteNames = {};

    if (isEntreprise) {
      let activiteIds = [];
      if (activiteId) {
        activiteIds = [activiteId];
      } else if (activiteIdsParam) {
        activiteIds = activiteIdsParam.split(',').map(Number).filter(Boolean);
      } else if (entType) {
        const allRes = await pool.query(
          `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id WHERE pe.client_id = $1`,
          [req.user.gerant_parent_id || req.user.id]
        );
        activiteIds = allRes.rows.map((r) => r.id);
      }
      if (activiteIds.length === 0) return res.status(404).json({ message: '[[Aucun:activite]]' });

      // Load activite names
      const actRes = await pool.query('SELECT id, nom FROM activites WHERE id = ANY($1)', [activiteIds]);
      actRes.rows.forEach((r) => { activiteNames[r.id] = r.nom; });

      const idList = activiteIds.map((_, i) => `$${i + 1}`).join(',');
      const params = [...activiteIds, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND sed.ingredient_id = $${params.length}`; }
      else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND sed.date_appro >= $${params.length}`; }
      if (endDate) { params.push(endDate); extraWhere += ` AND sed.date_appro <= $${params.length}`; }
      if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND sed.fournisseur_id = $${params.length}`; }
      if (refFacture) { params.push(`%${refFacture}%`); extraWhere += ` AND sed.ref_facture ILIKE $${params.length}`; }
      const result = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.date_appro, sed.quantite, sed.prix_unitaire, sed.type_appro,
                sed.ref_facture, f.nom as fournisseur_nom, i.nom as ingredient_nom,
                u.nom as unite_nom, COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
                sed.taux_tva, sed.prix_unitaire_tva, ub.nom as created_by_nom
         FROM stock_entreprise_daily sed
         JOIN articles i ON i.id = sed.ingredient_id JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
         LEFT JOIN utilisateurs ub ON ub.id = sed.created_by
         WHERE sed.activite_id IN (${idList}) AND sed.date_appro >= make_date($${activiteIds.length + 1}::int, 1, 1) AND sed.date_appro < make_date($${activiteIds.length + 1}::int + 1, 1, 1)${extraWhere}
         ORDER BY sed.date_appro DESC, i.nom`, params
      );
      rows = result.rows;

      // Append PT rows for entreprise
      const ptParamsEnt = [currentYear, ...activiteIds];
      let ptWhereEnt = `spt.date_appro >= make_date($1::int, 1, 1) AND spt.date_appro < make_date($1::int + 1, 1, 1) AND spt.activite_id IN (${activiteIds.map((_, i) => `$${i + 2}`).join(',')})`;
      if (ptProduitId) { ptParamsEnt.push(ptProduitId); ptWhereEnt += ` AND spt.produit_id = $${ptParamsEnt.length}`; }
        if (ptType) ptWhereEnt += ` AND ${ptTypeSql('p', ptType)}`;
      if (startDate) { ptParamsEnt.push(startDate); ptWhereEnt += ` AND spt.date_appro >= $${ptParamsEnt.length}`; }
      if (endDate) { ptParamsEnt.push(endDate); ptWhereEnt += ` AND spt.date_appro <= $${ptParamsEnt.length}`; }
      const ptResultEnt = await pool.query(
        `SELECT spt.id, spt.activite_id, spt.date_appro, spt.quantite, spt.prix_calcule AS prix_unitaire,
                'produit_transforme' AS type_appro,
                f.nom AS fournisseur_nom, spt.ref_facture,
                p.nom AS ingredient_nom,
                ${ptCategorieSql('p')} AS categorie_nom,
                'unité' AS unite_nom,
                spt.taux_tva, spt.prix_calcule AS prix_unitaire_tva, NULL AS created_by_nom
         FROM stock_produits_transformes spt
         JOIN produits p ON p.id = spt.produit_id
         LEFT JOIN fournisseurs f ON f.id = spt.fournisseur_id
         WHERE ${ptWhereEnt} AND spt.type_appro IS DISTINCT FROM 'PT'
         ORDER BY spt.date_appro DESC, p.nom`,
        ptParamsEnt
      );
      if (ptOnly === 'true') rows = ptResultEnt.rows;
      else rows = rows.concat(ptResultEnt.rows);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    const sheet = workbook.addWorksheet(ongletSur(workbook, `Historique ${voc.Court('appro')}`), { pageSetup: { paperSize: 9, orientation: 'landscape' } });

    const cols = [
      { header: 'Date', key: 'date', width: 12 },
      { header: voc.Nom('article_ingredient'), key: 'ing', width: 26 },
      { header: 'Catégorie', key: 'cat', width: 18 },
      { header: 'Quantité', key: 'qty', width: 11 },
      { header: 'Unité', key: 'unit', width: 9 },
      { header: 'Prix U. HT', key: 'prix', width: 13 },
      { header: 'TVA %', key: 'tva', width: 9 },
      { header: 'Prix U. TTC', key: 'prixTtc', width: 13 },
      { header: 'Coût HT', key: 'coutHt', width: 14 },
      { header: 'Coût TTC', key: 'coutTtc', width: 14 },
      ...(isEntreprise ? [
        { header: voc.Court('activite'), key: 'act', width: 18 },
        { header: voc.Court('fournisseur'), key: 'fourn', width: 18 },
        { header: 'Réf. Facture', key: 'ref', width: 16 },
        { header: 'Type', key: 'type', width: 12 },
      ] : [
        { header: voc.Court('fournisseur'), key: 'fourn', width: 18 },
        { header: 'Réf. Facture', key: 'ref', width: 16 },
      ]),
      { header: 'Créé par', key: 'createdBy', width: 16 },
    ];
    const colCount = cols.length;

    // Bandeau charte + en-têtes
    const fmtD = (d) => d ? d.split('-').reverse().join('/') : '—';
    const periode = (startDate || endDate) ? `Période du ${fmtD(startDate)} au ${fmtD(endDate)}` : `Année ${currentYear}`;
    let meta = `Exporté le ${new Date().toLocaleDateString('fr-FR')} · ${periode} · ${rows.length} ligne(s)`;
    if (selectedSet.size > 0) meta += ` · ${selectedSet.size} sélectionnée(s) en surbrillance`;
    const actNoms = Object.values(activiteNames);
    const sousTitre = actNoms.length === 1 ? `${voc.Court('activite')} : ${actNoms[0]}`
      : actNoms.length > 1 ? `${voc.Court('activite', true)} : ${actNoms.join(', ')}` : '';
    const headerIdx = brandHeader(workbook, sheet, {
      titre: `Historique ${voc.du('appro', true)} — ${voc.Court('activite', true)}`,
      sousTitre, meta, colCount,
    });
    headerRow(sheet, headerIdx, cols.map((c) => c.header), { widths: cols.map((c) => c.width) });

    // Data rows
    // cols 1-10 are fixed; 11+ depend on isEntreprise
    // col9 = Coût HT, col10 = Coût TTC (both fixed positions)
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
      const typeLabel = (() => { const t = r.type_appro || 'manuel'; return t === 'produit_transforme' ? voc.Nom('pt_abr') : t === 'transfert' ? voc.Nom('transfert') : t === 'PT' ? voc.Court('pt') : 'Manuel'; })();
      const rowData = [
        dateStr,
        r.ingredient_nom,
        libelleCategoriePt(voc, r.categorie_nom),
        qty,
        r.unite_nom,
        prix,
        tva !== null ? tva : '',
        prixTtc,
        coutHt,
        coutTtc,
        ...(isEntreprise ? [activiteNames[r.activite_id] || '', r.fournisseur_nom || '', r.ref_facture || '', typeLabel] : [r.fournisseur_nom || '', r.ref_facture || '']),
        r.created_by_nom || '',
      ];
      const dataRow = sheet.addRow(rowData);
      dataRowStyle(dataRow, { index: i, selected: isSelected, colCount });
      for (let c = 1; c <= colCount; c++) {
        dataRow.getCell(c).alignment = { vertical: 'middle', horizontal: (c <= 3 || c === colCount) ? 'left' : (c === 5 ? 'center' : 'right') };
      }
      dataRow.getCell(4).numFmt = FMT_QTE;
      dataRow.getCell(6).numFmt = FMT_DT;
      dataRow.getCell(8).numFmt = FMT_DT;
      dataRow.getCell(9).numFmt = FMT_DT;
      dataRow.getCell(10).numFmt = FMT_DT;
      dataRow.height = 16;
    });
    const lastDataRow = headerIdx + rows.length;

    // Total row — qty at col4, Coût HT at col9, Coût TTC at col10
    const totalRowData = ['TOTAL', '', '', '', '', '', '', '', totalHT, totalTTC, ...Array(colCount - 10).fill('')];
    const totalRow = sheet.addRow(totalRowData);
    totalRowStyle(totalRow, { colCount });
    for (let c = 2; c <= colCount; c++) totalRow.getCell(c).alignment = { vertical: 'middle', horizontal: 'right' };
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(9).numFmt = FMT_DT;
    totalRow.getCell(10).numFmt = FMT_DT;

    brandFooter(sheet, colCount);
    finalize(sheet, { headerRowIdx: headerIdx, colCount, lastDataRow });

    const dateRange = startDate && endDate ? `${startDate}_${endDate}` : currentYear;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Historique-Appro-${dateRange}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur génération Excel' });
  }
};

const getCascadeInfoEntreprise = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: '[[Nom:activite]] introuvable' });
    const [appros, inv] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM stock_entreprise_daily WHERE activite_id = $1 AND ingredient_id = $2', [activiteId, ingredientId]),
      pool.query('SELECT COUNT(*) FROM inventaires WHERE activite_id = $1 AND ingredient_id = $2', [activiteId, ingredientId]),
    ]);
    res.json({ approCount: Number(appros.rows[0].count), inventaireCount: Number(inv.rows[0].count) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const deleteEntrepriseIngredientHistory = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: '[[Nom:activite]] introuvable' });
    await pool.query('DELETE FROM stock_entreprise_daily WHERE activite_id = $1 AND ingredient_id = $2', [activiteId, ingredientId]);
    await pool.query('DELETE FROM inventaires WHERE activite_id = $1 AND ingredient_id = $2', [activiteId, ingredientId]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getStockEntreprise, updateStockEntreprise, updateSeuilMin,
  getHistoryEntreprise,
  getHistoriqueAppro, updateHistoriqueEntry, deleteHistoriqueEntry,
  exportHistoriqueExcel,
  deleteEntrepriseIngredientHistory,
  getCascadeInfoEntreprise,
};
