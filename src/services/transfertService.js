// Transferts entre unités (lot 1b, spec §2.4) : labo → activité (comportement historique,
// écritures INCHANGÉES) et labo → labo (nouveau). Une ligne labo_transfers par article / PT ;
// les lignes de stock générées portent transfert_id (fin des heuristiques date + quantité).
//
//   createTransfert(db, { sourceLaboId, clientId, userId, dateTransfert, note, refFacture, tauxTva,
//                         transfers: [{ activiteId? | laboDestId?, ingredientId (< 0 = PT), quantite, prixUnitaire? }] })
//   updateTransfert(db, { laboId, transferId, quantite, requester })
//   deleteTransfert(db, { laboId, transferId, requester })
//   getTransferPrix(db, laboId, transferId)      → { pmpHT, pmpTTC, dernierAchatHT, prixUnitaire }
//   lockStockLabo(client, laboId)                → pg_advisory_xact_lock(1001, laboId) (espace 1001 = stock)
//   recalcFacture(client, factureId)             → montants = SUM des lignes liées, DELETE si plus aucune
//   TransfertError { status, code, message, extra } / isTransfertError / mapLockError
//
// Verrou : pris en DÉBUT de transaction sur le labo source (et le labo destinataire, ids croissants),
// puis contrôle de stock via stockService.computeStock(client, …) DANS la transaction. Le même verrou
// est pris par la production PT, les pertes labo, l'expédition acheteurs et l'édition/suppression
// d'une ligne d'historique labo (laboController / acheteurVentesController).
//
// Règles de stock (§2.1) rappelées : la sortie est déduite UNE fois par le CTE labo_transfers filtré
// sur labo_id = source ; le miroir stock_labo_daily 'manuel' < 0 reste exclu ; l'entrée 'transfert'
// (+) chez un labo destinataire compte comme réception et porte prix HT / TVA / TTC non NULL (§2.3).
const pool = require('../config/database');
const stockService = require('./stockService');
const { upsertFacture } = require('./facturesService');

const LOCK_NS_STOCK = 1001;
const MIGRATION_188 = '188_unites_operationnelles_transferts.sql';

class TransfertError extends Error {
  constructor(status, code, message, extra = null) {
    super(message || code);
    this.name = 'TransfertError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const isTransfertError = (e) => e instanceof TransfertError;

// Erreur PG de verrou / timeout (statement_timeout 30 s, lock_not_available, deadlock) → 409.
const mapLockError = (err) => {
  if (err && (err.code === '57014' || err.code === '55P03' || err.code === '40P01')) {
    return new TransfertError(409, 'STOCK_VERROUILLE', 'Une autre opération [[de:stock]] est en cours sur [[ce:labo]] — réessayez dans un instant.');
  }
  return null;
};

async function lockStockLabo(client, laboId) {
  await client.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [LOCK_NS_STOCK, Number(laboId)]);
}

// Verrouille plusieurs labos dans un ordre déterministe (ids croissants) — évite les inter-blocages.
async function lockStockLabos(client, laboIds) {
  const ids = [...new Set(laboIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  for (const id of ids) await lockStockLabo(client, id);
}

const num = (v) => (v === null || v === undefined || v === '' ? null : parseFloat(v));
const round3 = (v) => Math.round(parseFloat(v ?? 0) * 1000) / 1000;

// createTransfert / updateTransfert / deleteTransfert ouvrent leur propre transaction : ils attendent un
// pool (connect() → PoolClient), jamais un client déjà en transaction (dont connect() casserait).
function assertPool(d, fn) {
  if (!d || typeof d.connect !== 'function' || typeof d.release === 'function') {
    throw new Error(`${fn} attend un pool pg (pas un client de transaction)`);
  }
}

async function laboFournisseurId(db, laboId) {
  const r = await db.query('SELECT id FROM fournisseurs WHERE labo_id = $1 AND is_labo = true LIMIT 1', [laboId]);
  return r.rows[0]?.id ?? null;
}

// Fournisseur système « AUTO » de l'entreprise du labo (get-or-create) — sortie de transfert PT.
async function autoFournisseurId(db, laboId, userId) {
  const entRes = await db.query('SELECT entreprise_id FROM labos WHERE id = $1', [laboId]);
  if (!entRes.rows.length) return null;
  const entrepriseId = entRes.rows[0].entreprise_id;
  const fo = await db.query(`SELECT id FROM fournisseurs WHERE entreprise_id = $1 AND nom = 'AUTO' LIMIT 1`, [entrepriseId]);
  if (fo.rows.length) return fo.rows[0].id;
  const ins = await db.query(`INSERT INTO fournisseurs (entreprise_id, nom, created_by) VALUES ($1, 'AUTO', $2) RETURNING id`, [entrepriseId, userId]);
  return ins.rows[0].id;
}

async function uniteIdByLabo(db, laboId) {
  const r = await db.query('SELECT id FROM unites_operationnelles WHERE labo_id = $1', [laboId]);
  return r.rows[0]?.id ?? null;
}
async function uniteIdByActivite(db, activiteId) {
  const r = await db.query('SELECT id FROM unites_operationnelles WHERE activite_id = $1', [activiteId]);
  return r.rows[0]?.id ?? null;
}

// ─── Normalisation des lignes ─────────────────────────────────────────────────
function normalizeLines(sourceLaboId, transfers) {
  const out = [];
  for (const t of transfers) {
    const ingredientId = parseInt(t.ingredientId, 10);
    if (!Number.isInteger(ingredientId) || ingredientId === 0) {
      throw new TransfertError(400, 'LIGNE_INVALIDE', 'ingredientId invalide');
    }
    const activiteId = t.activiteId != null && t.activiteId !== '' ? parseInt(t.activiteId, 10) : null;
    const laboDestId = t.laboDestId != null && t.laboDestId !== '' ? parseInt(t.laboDestId, 10) : null;
    const validId = (v) => v === null || (Number.isInteger(v) && v > 0);
    if (!validId(activiteId) || !validId(laboDestId) || (activiteId == null) === (laboDestId == null)) {
      throw new TransfertError(400, 'DESTINATION_INVALIDE', 'Chaque ligne doit indiquer exactement une destination (activiteId ou laboDestId)');
    }
    if (laboDestId != null && laboDestId === Number(sourceLaboId)) {
      throw new TransfertError(400, 'DESTINATION_INVALIDE', '[[Un:labo]] ne peut pas se transférer à [[acc:labo:lui-même:elle-même]]');
    }
    const quantite = parseFloat(t.quantite) || 0;
    const prixUnitaire = t.prixUnitaire != null && t.prixUnitaire !== '' ? parseFloat(t.prixUnitaire) : null;
    out.push({ ingredientId, activiteId, laboDestId, quantite, prixUnitaire, isPT: ingredientId < 0, produitId: ingredientId < 0 ? -ingredientId : null });
  }
  return out;
}

// ─── Création ─────────────────────────────────────────────────────────────────
/**
 * @param {object} db POOL uniquement (une transaction dédiée est ouverte ici via d.connect()) — jamais
 *   un client de transaction : un PoolClient (release) est refusé explicitement.
 * @returns {Promise<{ success: true, transferIds: number[] }>}
 */
async function createTransfert(db, { sourceLaboId, clientId, userId, dateTransfert, note, refFacture, tauxTva, transfers }) {
  const d = db || pool;
  assertPool(d, 'createTransfert');
  const laboId = Number(sourceLaboId);
  if (!dateTransfert || !Array.isArray(transfers) || transfers.length === 0) {
    throw new TransfertError(400, 'PARAMETRES_REQUIS', 'dateTransfert et transfers requis');
  }
  const lines = normalizeLines(laboId, transfers);
  const tva = tauxTva != null && tauxTva !== '' ? parseFloat(tauxTva) : 0;

  // 1) Destinations rattachées à la source.
  const actIds = [...new Set(lines.filter((l) => l.activiteId != null).map((l) => l.activiteId))];
  if (actIds.length) {
    const actCheck = await d.query('SELECT id FROM activites WHERE labo_id = $1 AND id = ANY($2::int[])', [laboId, actIds]);
    if (actCheck.rows.length !== actIds.length) {
      throw new TransfertError(400, 'DESTINATION_NON_RATTACHEE', '[[acc:activite:Un:Une]] ou plusieurs [[nom:activite:pl]] invalides');
    }
  }
  const laboDestIds = [...new Set(lines.filter((l) => l.laboDestId != null).map((l) => l.laboDestId))];
  if (laboDestIds.length) {
    const lienCheck = await d.query(
      `SELECT ud.labo_id
         FROM unites_operationnelles us
         JOIN unites_operationnelles_liens li ON li.source_unite_id = us.id
         JOIN unites_operationnelles ud ON ud.id = li.dest_unite_id AND ud.type_technique = 'labo'
        WHERE us.labo_id = $1 AND ud.labo_id = ANY($2::int[])`,
      [laboId, laboDestIds]
    );
    if (lienCheck.rows.length !== laboDestIds.length) {
      throw new TransfertError(400, 'DESTINATION_NON_RATTACHEE', '[[acc:labo:Un:Une]] ou plusieurs [[nom:labo:pl]] destinataires ne sont pas [[acc:labo:alimentés:alimentées]] par [[ce:labo]]');
    }
  }

  // 2) PT affecté à la destination (activité : produit_activite_stock ; labo : labo_pt_selections).
  const ptLines = lines.filter((l) => l.isPT && l.quantite > 0);
  if (ptLines.length) {
    const ptIds = [...new Set(ptLines.map((l) => l.produitId))];
    const [pas, lps] = await Promise.all([
      actIds.length
        ? d.query('SELECT produit_id, activite_id FROM produit_activite_stock WHERE produit_id = ANY($1::int[]) AND activite_id = ANY($2::int[])', [ptIds, actIds])
        : { rows: [] },
      laboDestIds.length
        ? d.query('SELECT produit_id, labo_id FROM labo_pt_selections WHERE produit_id = ANY($1::int[]) AND labo_id = ANY($2::int[])', [ptIds, laboDestIds])
        : { rows: [] },
    ]);
    const okAct = new Set(pas.rows.map((r) => `${r.produit_id}-a${r.activite_id}`));
    const okLabo = new Set(lps.rows.map((r) => `${r.produit_id}-l${r.labo_id}`));
    const missing = ptLines.find((l) => (l.activiteId != null ? !okAct.has(`${l.produitId}-a${l.activiteId}`) : !okLabo.has(`${l.produitId}-l${l.laboDestId}`)));
    if (missing) {
      const nomRes = await d.query('SELECT nom FROM produits WHERE id = $1', [missing.produitId]);
      const cible = missing.activiteId != null ? '[[ce:activite]]' : '[[ce:labo]]';
      throw new TransfertError(400, 'PT_NON_AFFECTE', `[[Le:produit]] "${nomRes.rows[0]?.nom ?? `[[court:pt]] #${missing.produitId}`}" n'est pas [[acc:produit:affecté:affectée]] à ${cible} — [[nom:transfert]] [[acc:transfert:refusé:refusée]].`);
    }
  }

  const client = await d.connect();
  const transferIds = [];
  try {
    await client.query('BEGIN');
    // 3) Verrou stock (source + labos destinataires, ids croissants) puis contrôle DANS la transaction.
    await lockStockLabos(client, [laboId, ...laboDestIds]);

    // 4) Écritures préparatoires DANS la transaction (annulées avec elle en cas de 422) : import
    // automatique des sélections d'articles chez un labo destinataire (ON CONFLICT DO NOTHING),
    // fournisseur AUTO, unité source, client de la facture interne labo→labo.
    for (const destId of laboDestIds) {
      const ings = [...new Set(lines.filter((l) => !l.isPT && l.laboDestId === destId && l.quantite > 0).map((l) => l.ingredientId))];
      if (ings.length) {
        await client.query(
          `INSERT INTO labo_ingredient_selections (labo_id, ingredient_id)
           SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
          [destId, ings]
        );
      }
    }
    const srcFournisseurId = await laboFournisseurId(client, laboId);
    const autoFId = ptLines.length ? await autoFournisseurId(client, laboId, userId) : null;
    const srcUniteId = await uniteIdByLabo(client, laboId);
    // clientId de la facture interne labo→labo : client de l'entreprise du labo source (même dérivation
    // que l'appro labo) ; labo→activité : clientId de l'appelant (inchangé).
    let laboClientId = null;
    if (laboDestIds.length) {
      const lc = await client.query('SELECT pe.client_id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE l.id = $1', [laboId]);
      laboClientId = lc.rows[0]?.client_id ?? clientId;
    }

    const ingQty = {};
    const ptQty = {};
    for (const l of lines) {
      if (l.quantite <= 0) continue;
      if (l.isPT) ptQty[l.produitId] = (ptQty[l.produitId] || 0) + l.quantite;
      else ingQty[l.ingredientId] = (ingQty[l.ingredientId] || 0) + l.quantite;
    }
    for (const [ingId, total] of Object.entries(ingQty)) {
      const dispo = await stockService.computeStock(client, 'labo', laboId, { articleId: parseInt(ingId, 10) });
      if (total > dispo) {
        const n = await client.query('SELECT nom FROM articles WHERE id = $1', [ingId]);
        throw new TransfertError(422, 'STOCK_INSUFFISANT', `[[Nom:stock]] [[acc:stock:insuffisant:insuffisante]] pour "${n.rows[0]?.nom ?? `[[nom:article_ingredient]] #${ingId}`}"`, { disponible: Math.max(0, dispo), demande: total });
      }
    }
    for (const [produitId, total] of Object.entries(ptQty)) {
      const dispo = await stockService.computeStock(client, 'labo', laboId, { produitId: parseInt(produitId, 10) });
      if (total > dispo) {
        const n = await client.query('SELECT nom FROM produits WHERE id = $1', [produitId]);
        throw new TransfertError(422, 'STOCK_INSUFFISANT', `[[Nom:stock]] [[court:pt]] [[acc:stock:insuffisant:insuffisante]] pour "${n.rows[0]?.nom ?? `[[court:pt]] #${produitId}`}"`, { disponible: Math.max(0, dispo), demande: total });
      }
    }

    // 5) Écritures.
    const destUniteCache = new Map();
    const destUnite = async (l) => {
      const key = l.activiteId != null ? `a${l.activiteId}` : `l${l.laboDestId}`;
      if (!destUniteCache.has(key)) {
        destUniteCache.set(key, l.activiteId != null ? await uniteIdByActivite(client, l.activiteId) : await uniteIdByLabo(client, l.laboDestId));
      }
      return destUniteCache.get(key);
    };

    for (const l of lines) {
      const qty = l.quantite;
      if (!qty || qty <= 0) continue;
      const dUnite = await destUnite(l);

      if (l.isPT) {
        const produitId = l.produitId;
        const latest = await client.query(
          `SELECT prix_unitaire FROM stock_labo_pt_daily
            WHERE labo_id = $1 AND produit_id = $2 AND quantite > 0 AND prix_unitaire IS NOT NULL
            ORDER BY date_appro DESC, id DESC LIMIT 1`,
          [laboId, produitId]
        );
        const laboCost = latest.rows.length ? parseFloat(latest.rows[0].prix_unitaire || 0) : 0;
        // Prix de cession SAISI (HT ; TTC = HT × (1 + TVA)) ; à défaut coût de fabrication labo
        // (convention legacy : laboCost porté tel quel en HT et en TTC côté activité, TVA PT = 0).
        const ptPrixUnit = l.prixUnitaire != null && l.prixUnitaire > 0 ? l.prixUnitaire : null;
        const ptPrixTtc = ptPrixUnit != null ? ptPrixUnit * (1 + tva / 100) : null;
        const receptionPrice = ptPrixTtc != null ? ptPrixTtc : laboCost;
        // Entrée chez un LABO destinataire (§2.3 : HT / TVA / TTC cohérents) : sans prix saisi, le TTC
        // vaut laboCost × (1 + TVA) — identique à laboCost avec la TVA 0 envoyée par le front pour un PT.
        const receptionPriceLabo = ptPrixTtc != null ? ptPrixTtc : laboCost * (1 + tva / 100);

        const lt = await client.query(
          `INSERT INTO labo_transfers (labo_id, activite_id, labo_dest_id, source_unite_id, dest_unite_id, produit_id, quantite, date_transfert, note, ref_facture, prix_unitaire, taux_tva, prix_unitaire_tva, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
          [laboId, l.activiteId, l.laboDestId, srcUniteId, dUnite, produitId, qty, dateTransfert, note || null, refFacture || null, ptPrixUnit, tva, ptPrixTtc, userId]
        );
        const transferId = lt.rows[0].id;
        transferIds.push(transferId);

        // Sortie PT au labo source : type_appro NULL — INCHANGÉ (la déduction passe par le CTE
        // labo_transfers ; cette ligne est le miroir comptable). Fournisseur AUTO, réf, prix de cession.
        await client.query(
          `INSERT INTO stock_labo_pt_daily (labo_id, produit_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, fournisseur_id, ref_facture, updated_at, created_by, transfert_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11)`,
          [laboId, produitId, dateTransfert, -qty, ptPrixUnit ?? laboCost, tva, receptionPrice, autoFId, refFacture || null, userId, transferId]
        );
        if (l.activiteId != null) {
          // Entrée PT à l'activité (inchangée) — fournisseur = le labo source.
          await client.query(
            `INSERT INTO stock_produits_transformes (produit_id, activite_id, date_appro, quantite, prix_calcule, prix_unitaire, taux_tva, fournisseur_id, ref_facture, created_by, transfert_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [produitId, l.activiteId, dateTransfert, qty, receptionPrice, ptPrixUnit ?? laboCost, tva, srcFournisseurId, refFacture || null, userId, transferId]
          );
        } else {
          // Entrée PT chez le labo destinataire : type_appro 'transfert', prix HT / TVA / TTC non NULL.
          await client.query(
            `INSERT INTO stock_labo_pt_daily (labo_id, produit_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, type_appro, fournisseur_id, ref_facture, updated_at, created_by, transfert_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'transfert', $8, $9, NOW(), $10, $11)`,
            [l.laboDestId, produitId, dateTransfert, qty, ptPrixUnit ?? laboCost, tva, receptionPriceLabo, srcFournisseurId, refFacture || null, userId, transferId]
          );
        }
        continue;
      }

      // ── Article ──
      const ingId = l.ingredientId;
      let prixUnit = l.prixUnitaire;
      if (prixUnit == null && l.laboDestId != null) {
        // L'entrée chez un labo destinataire doit être valorisée : PMP HT de la source à la date, sinon 0.
        const pmp = await stockService.computePmp(client, 'labo', laboId, ingId, { atDate: dateTransfert });
        prixUnit = pmp.pmpHT != null ? round3(pmp.pmpHT) : 0;
      }
      const prixUnitaireTva = prixUnit != null ? prixUnit * (1 + tva / 100) : null;

      const lt = await client.query(
        `INSERT INTO labo_transfers (labo_id, activite_id, labo_dest_id, source_unite_id, dest_unite_id, ingredient_id, quantite, date_transfert, note, ref_facture, prix_unitaire, taux_tva, prix_unitaire_tva, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [laboId, l.activiteId, l.laboDestId, srcUniteId, dUnite, ingId, qty, dateTransfert, note || null, refFacture || null, prixUnit, tva, prixUnitaireTva, userId]
      );
      const transferId = lt.rows[0].id;
      transferIds.push(transferId);

      // Miroir de sortie au labo source ('manuel', −qty) — identique, + transfert_id.
      await client.query(
        `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, type_appro, ref_facture, updated_at, created_by, transfert_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'manuel', $8, NOW(), $9, $10)`,
        [laboId, ingId, dateTransfert, -qty, prixUnit, tva, prixUnitaireTva, refFacture || null, userId, transferId]
      );

      if (l.activiteId != null) {
        const sed = await client.query(
          `INSERT INTO stock_entreprise_daily
             (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture, taux_tva, prix_unitaire_tva, updated_at, created_by, transfert_id)
           VALUES ($1, $2, $3, $4, $5, 'transfert', $6, $7, $8, $9, NOW(), $10, $11)
           RETURNING id`,
          [l.activiteId, ingId, dateTransfert, qty, prixUnit, srcFournisseurId, refFacture || null, tva, prixUnitaireTva, userId, transferId]
        );
        if (refFacture) {
          await upsertFacture(clientId, {
            refFacture,
            dateAppro: dateTransfert,
            fournisseurId: srcFournisseurId,
            activiteId: l.activiteId,
            laboId: null,
            typeSource: 'transfert',
            montantHT: qty * (prixUnit || 0),
            montantTva: prixUnit != null ? qty * (prixUnit || 0) * (tva / 100) : 0,
            montantTTC: qty * (prixUnitaireTva != null ? prixUnitaireTva : (prixUnit || 0)),
            timbreFiscal: false,
            createdBy: userId,
            stockTable: 'stock_entreprise_daily',
            stockRowId: sed.rows[0].id,
          }, client);
        }
      } else {
        // Entrée chez le labo destinataire : 'transfert', fournisseur = is_labo de la source, prix HT/TVA/TTC.
        const sld = await client.query(
          `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, type_appro, fournisseur_id, ref_facture, updated_at, created_by, transfert_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'transfert', $8, $9, NOW(), $10, $11)
           RETURNING id`,
          [l.laboDestId, ingId, dateTransfert, qty, prixUnit, tva, prixUnitaireTva, srcFournisseurId, refFacture || null, userId, transferId]
        );
        if (refFacture) {
          await upsertFacture(laboClientId, {
            refFacture,
            dateAppro: dateTransfert,
            fournisseurId: srcFournisseurId,
            activiteId: null,
            laboId: l.laboDestId,
            typeSource: 'transfert',
            montantHT: qty * (prixUnit || 0),
            montantTva: qty * (prixUnit || 0) * (tva / 100),
            montantTTC: qty * (prixUnitaireTva != null ? prixUnitaireTva : (prixUnit || 0)),
            timbreFiscal: false,
            createdBy: userId,
            stockTable: 'stock_labo_daily',
            stockRowId: sld.rows[0].id,
          }, client);
        }
      }
    }

    await client.query('COMMIT');
    return { success: true, transferIds };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* connexion cassée */ }
    const lock = mapLockError(err);
    if (lock) throw lock;
    throw err;
  } finally {
    client.release();
  }
}

// ─── Facture liée : recalcul depuis les lignes ────────────────────────────────
// montants = SUM des lignes stock_*_daily WHERE facture_id = f.id (+ timbre) ; plus aucune ligne → DELETE.
async function recalcFacture(client, factureId) {
  if (!factureId) return;
  const f = await client.query('SELECT id, timbre_fiscal, montant_timbre FROM factures WHERE id = $1', [factureId]);
  if (!f.rows.length) return;
  const sums = await client.query(
    `SELECT COUNT(*)::int AS nb,
            COALESCE(SUM(quantite * COALESCE(prix_unitaire, 0)), 0) AS ht,
            COALESCE(SUM(quantite * COALESCE(prix_unitaire, 0) * COALESCE(taux_tva, 0) / 100), 0) AS tva,
            COALESCE(SUM(quantite * COALESCE(prix_unitaire_tva, prix_unitaire, 0)), 0) AS ttc
       FROM (
         SELECT quantite, prix_unitaire, taux_tva, prix_unitaire_tva FROM stock_entreprise_daily WHERE facture_id = $1
         UNION ALL
         SELECT quantite, prix_unitaire, taux_tva, prix_unitaire_tva FROM stock_labo_daily WHERE facture_id = $1
       ) l`,
    [factureId]
  );
  const s = sums.rows[0];
  if (!s.nb) {
    await client.query('DELETE FROM factures WHERE id = $1', [factureId]);
    return;
  }
  const timbre = f.rows[0].timbre_fiscal ? parseFloat(f.rows[0].montant_timbre || 0) : 0;
  // Sommes brutes, comme upsertFacture (pas d'arrondi JS : la colonne numeric(…,3) arrondit seule).
  await client.query(
    'UPDATE factures SET montant_ht = $1, montant_tva = $2, montant_ttc = $3 WHERE id = $4',
    [parseFloat(s.ht), parseFloat(s.tva), parseFloat(s.ttc) + timbre, factureId]
  );
}

// ─── Lignes d'un transfert ────────────────────────────────────────────────────
const STOCK_TABLES = ['stock_labo_daily', 'stock_entreprise_daily', 'stock_labo_pt_daily', 'stock_produits_transformes'];

async function findLinkedRows(client, transferId) {
  const out = {};
  for (const t of STOCK_TABLES) {
    const hasFacture = t === 'stock_labo_daily' || t === 'stock_entreprise_daily';
    const r = await client.query(
      `SELECT id, quantite${hasFacture ? ', facture_id' : ', NULL::int AS facture_id'} FROM ${t} WHERE transfert_id = $1 ORDER BY id`,
      [transferId]
    );
    out[t] = r.rows;
  }
  return out;
}

// Fenêtre de grâce après la 188 : au déploiement, l'ancien conteneur (sans transfert_id) sert encore
// des requêtes pendant que le nouveau a déjà appliqué la migration — ses transferts doivent rester
// modifiables par repli heuristique.
const GRACE_188 = '1 hour';

// Transfert « historique » = créé avant l'application de la 188 (+ grâce), ou 188 absente (base non
// migrée). Comparaison faite EN SQL (created_at TIMESTAMP vs applied_at TIMESTAMPTZ : même session TZ),
// jamais en JS (dépendrait des TZ des deux conteneurs).
async function isTransfertHistorique(client, transferId) {
  const r = await client.query(
    `SELECT (m.applied_at IS NULL OR lt.created_at::timestamptz < m.applied_at + $3::interval) AS historique
       FROM labo_transfers lt
       LEFT JOIN _migrations m ON m.filename = $2
      WHERE lt.id = $1`,
    [transferId, MIGRATION_188, GRACE_188]
  );
  return r.rows.length ? r.rows[0].historique === true : true;
}

// Repli heuristique (transferts antérieurs à la 188, jamais liés) : mêmes requêtes qu'avant,
// restreintes à transfert_id IS NULL. Renvoie { table: [{ id, quantite, facture_id }] }.
async function findHeuristicRows(client, t) {
  const qty = parseFloat(t.quantite);
  const out = {};
  for (const tb of STOCK_TABLES) out[tb] = [];
  if (t.ingredient_id) {
    const m = await client.query(
      `SELECT id, quantite, facture_id FROM stock_labo_daily
        WHERE labo_id = $1 AND ingredient_id = $2 AND type_appro = 'manuel' AND quantite < 0
          AND date_appro = $3 AND quantite = $4 AND transfert_id IS NULL
        ORDER BY id ASC LIMIT 1`,
      [t.labo_id, t.ingredient_id, t.date_transfert, -qty]
    );
    out.stock_labo_daily = m.rows;
    if (t.activite_id) {
      const e = await client.query(
        `SELECT id, quantite, facture_id FROM stock_entreprise_daily
          WHERE activite_id = $1 AND ingredient_id = $2 AND type_appro = 'transfert'
            AND date_appro = $3 AND quantite = $4 AND transfert_id IS NULL
          ORDER BY id ASC LIMIT 1`,
        [t.activite_id, t.ingredient_id, t.date_transfert, qty]
      );
      out.stock_entreprise_daily = e.rows;
    }
  } else if (t.produit_id) {
    const m = await client.query(
      `SELECT id, quantite, NULL::int AS facture_id FROM stock_labo_pt_daily
        WHERE labo_id = $1 AND produit_id = $2 AND date_appro = $3 AND quantite = $4
          AND type_appro IS DISTINCT FROM 'PT' AND transfert_id IS NULL
        ORDER BY id ASC LIMIT 1`,
      [t.labo_id, t.produit_id, t.date_transfert, -qty]
    );
    out.stock_labo_pt_daily = m.rows;
    if (t.activite_id) {
      const e = await client.query(
        `SELECT id, quantite, NULL::int AS facture_id FROM stock_produits_transformes
          WHERE activite_id = $1 AND produit_id = $2 AND date_appro = $3 AND quantite = $4 AND transfert_id IS NULL
          ORDER BY id ASC LIMIT 1`,
        [t.activite_id, t.produit_id, t.date_transfert, qty]
      );
      out.stock_produits_transformes = e.rows;
    }
  }
  return out;
}

async function loadTransfert(db, laboId, transferId) {
  const r = await db.query(
    `SELECT id, labo_id, ingredient_id, produit_id, activite_id, labo_dest_id, quantite, date_transfert, created_by, created_at
       FROM labo_transfers WHERE id = $1 AND labo_id = $2`,
    [transferId, laboId]
  );
  return r.rows[0] || null;
}

function assertRequester(t, requester) {
  if (requester && requester.role === 'gerant' && t.created_by !== requester.id) {
    throw new TransfertError(403, 'TRANSFERT_NON_PROPRIETAIRE', 'Vous ne pouvez modifier que [[le:transfert:pl]] que vous avez [[acc:transfert:créés:créées]]');
  }
}

// Lignes liées (transfert_id). Transfert POSTÉRIEUR à la 188 (+ grâce) : lignes liées seulement, 409
// TRANSFERT_INCOHERENT si aucune. Transfert HISTORIQUE (antérieur à la 188) : le backfill 188 a lié
// chaque table indépendamment (bijectif) — une table peut être liée et l'autre ambiguë (ex. deux
// transferts PT identiques vers deux activités : entrées uniques liées, miroirs ambigus NULL) ; le repli
// heuristique complète donc TABLE PAR TABLE (uniquement les tables sans ligne liée, lignes
// transfert_id IS NULL), sinon un miroir orphelin fausserait le stock PT « net miroir » (getLaboPT,
// inventaire). 0 ligne sur un transfert seedé n'est pas une erreur.
async function resolveRows(client, t) {
  const rows = await findLinkedRows(client, t.id);
  const total = STOCK_TABLES.reduce((n, tb) => n + rows[tb].length, 0);
  const historique = await isTransfertHistorique(client, t.id);
  if (!historique) {
    if (total === 0) {
      throw new TransfertError(409, 'TRANSFERT_INCOHERENT', 'Les lignes [[de:stock]] de [[ce:transfert]] sont introuvables — contactez le support.');
    }
    return { rows, mode: 'transfert_id' };
  }
  const heur = await findHeuristicRows(client, t);
  let completed = 0;
  for (const tb of STOCK_TABLES) {
    if (rows[tb].length === 0 && heur[tb].length > 0) { rows[tb] = heur[tb]; completed += heur[tb].length; }
  }
  return { rows, mode: total === 0 ? 'heuristique' : (completed ? 'mixte' : 'transfert_id') };
}

// Stock disponible à la source pour un transfert (article ou PT) — sur le client de transaction.
async function stockSource(client, t) {
  return t.ingredient_id
    ? stockService.computeStock(client, 'labo', t.labo_id, { articleId: t.ingredient_id })
    : stockService.computeStock(client, 'labo', t.labo_id, { produitId: t.produit_id });
}

// ─── Modification de la quantité ──────────────────────────────────────────────
async function updateTransfert(db, { laboId, transferId, quantite, requester }) {
  const d = db || pool;
  assertPool(d, 'updateTransfert');
  const newQty = parseFloat(quantite);
  if (!newQty || newQty <= 0) throw new TransfertError(400, 'QUANTITE_INVALIDE', 'quantite requise et doit être > 0');
  const t = await loadTransfert(d, laboId, transferId);
  if (!t) throw new TransfertError(404, 'TRANSFERT_INTROUVABLE', '[[Nom:transfert]] introuvable');
  assertRequester(t, requester);

  const client = await d.connect();
  try {
    await client.query('BEGIN');
    await lockStockLabos(client, [t.labo_id, t.labo_dest_id].filter(Boolean));
    // Hausse de quantité : le supplément doit être disponible à la source (le stock courant déduit
    // déjà ce transfert via le CTE labo_transfers) → 422 STOCK_INSUFFISANT sinon.
    const delta = newQty - parseFloat(t.quantite);
    if (delta > 0) {
      const dispo = await stockSource(client, t);
      if (delta > dispo) {
        throw new TransfertError(422, 'STOCK_INSUFFISANT', '[[Nom:stock]] [[acc:stock:insuffisant:insuffisante]] à la source pour augmenter [[ce:transfert]]', { disponible: Math.max(0, dispo), demande: delta });
      }
    }
    const { rows } = await resolveRows(client, t);
    const factures = new Set();
    for (const tb of STOCK_TABLES) {
      for (const r of rows[tb]) {
        const signed = parseFloat(r.quantite) < 0 ? -newQty : newQty;
        const setUpd = tb === 'stock_produits_transformes' ? '' : ', updated_at = NOW()';
        await client.query(`UPDATE ${tb} SET quantite = $1${setUpd} WHERE id = $2`, [signed, r.id]);
        if (r.facture_id) factures.add(r.facture_id);
      }
    }
    await client.query('UPDATE labo_transfers SET quantite = $1 WHERE id = $2', [newQty, t.id]);
    for (const fId of factures) await recalcFacture(client, fId);
    await client.query('COMMIT');
    return { success: true, quantite: newQty };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
    const lock = mapLockError(err);
    if (lock) throw lock;
    throw err;
  } finally {
    client.release();
  }
}

// ─── Suppression ──────────────────────────────────────────────────────────────
// Ordre OBLIGATOIRE : (1) SELECT des lignes par transfert_id (+ factures), (2) DELETE des lignes,
// (3) DELETE labo_transfers — jamais l'inverse (la FK SET NULL effacerait la piste).
async function deleteTransfert(db, { laboId, transferId, requester }) {
  const d = db || pool;
  assertPool(d, 'deleteTransfert');
  const t = await loadTransfert(d, laboId, transferId);
  if (!t) throw new TransfertError(404, 'TRANSFERT_INTROUVABLE', '[[Nom:transfert]] introuvable');
  assertRequester(t, requester);

  const client = await d.connect();
  try {
    await client.query('BEGIN');
    await lockStockLabos(client, [t.labo_id, t.labo_dest_id].filter(Boolean));
    const { rows } = await resolveRows(client, t);
    const factures = new Set();
    for (const tb of STOCK_TABLES) {
      const ids = rows[tb].map((r) => r.id);
      for (const r of rows[tb]) if (r.facture_id) factures.add(r.facture_id);
      if (ids.length) await client.query(`DELETE FROM ${tb} WHERE id = ANY($1::int[])`, [ids]);
    }
    await client.query('DELETE FROM labo_transfers WHERE id = $1', [t.id]);
    for (const fId of factures) await recalcFacture(client, fId);
    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
    const lock = mapLockError(err);
    if (lock) throw lock;
    throw err;
  } finally {
    client.release();
  }
}

// ─── Prix de référence pour l'ÉDITION d'un transfert (à sa date) ─────────────
async function getTransferPrix(db, laboId, transferId) {
  const d = db || pool;
  const t = await loadTransfert(d, laboId, transferId);
  if (!t) throw new TransfertError(404, 'TRANSFERT_INTROUVABLE', '[[Nom:transfert]] introuvable');
  if (!t.ingredient_id) return { prixUnitaire: null, pmpHT: null, pmpTTC: null, dernierAchatHT: null };
  const [pmp, dernier] = await Promise.all([
    stockService.computePmp(d, 'labo', laboId, t.ingredient_id, { atDate: t.date_transfert }),
    d.query(
      `SELECT prix_unitaire FROM stock_labo_daily
        WHERE labo_id = $1 AND ingredient_id = $2 AND date_appro <= $3
          AND type_appro IN ('manuel','transfert') AND quantite > 0 AND prix_unitaire IS NOT NULL
        ORDER BY date_appro DESC, id DESC LIMIT 1`,
      [laboId, t.ingredient_id, t.date_transfert]
    ),
  ]);
  const dernierAchatHT = dernier.rows.length ? num(dernier.rows[0].prix_unitaire) : null;
  const pmpHT = pmp.pmpHT != null ? round3(pmp.pmpHT) : null;
  const pmpTTC = pmp.pmpTTC != null ? round3(pmp.pmpTTC) : null;
  return { pmpHT, pmpTTC, dernierAchatHT, prixUnitaire: pmpHT ?? dernierAchatHT };
}

module.exports = {
  TransfertError,
  isTransfertError,
  mapLockError,
  lockStockLabo,
  lockStockLabos,
  recalcFacture,
  createTransfert,
  updateTransfert,
  deleteTransfert,
  getTransferPrix,
  LOCK_NS_STOCK,
};
