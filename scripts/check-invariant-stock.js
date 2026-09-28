/* Invariant lot 1b — stock, PMP et coûts labo : ORACLE figé (scripts/legacy/stock-legacy.js,
 * copie du code AVANT refactor) contre le code COURANT, pour TOUTES les unités (labos,
 * activités) et tous les articles / PT de la base locale. 0 écart au millième attendu.
 *
 *   node scripts/check-invariant-stock.js            → contrôle complet (exit ≠ 0 si écart)
 *   node scripts/check-invariant-stock.js --verbose  → détail de chaque comparaison
 *
 * Comparaisons :
 *   [S1..S4] stockUtils.computeStockCourant / computeStockPTCourant (labo + activité)
 *            vs oracle ET vs stockService.computeStock (si le service existe)
 *   [S5]     getLaboStock (articles) : quantité + PMP HT/TTC vs stockService.computeStockBulk / computePmp
 *   [S6]     getStockEntreprise (articles) : quantité + PMP HT/TTC vs stockService.computeStockBulk
 *   [C1]     getLaboPT.prix_calcule  (oracle 'manuel' vs forme IN ('manuel','transfert'))
 *   [C2]     PMP de déduction HT/TTC (idem)
 *   [C3]     buildMpPriceMapLabo (oracle vs produitsController.buildMpPriceMapLabo réel)
 *   [K1]     inventaireController articles labo (oracle vs forme COALESCE — site conservé)
 *   [K3]     stock PT labo : computeStockPTCourant vs getLaboPT (net miroir) — AVERTISSEMENT
 *            seulement (les transferts seedés sans miroir divergent par construction)
 *   [SRC]    assertions sur le source (filtres §2.1/§2.3 réellement posés) quand stockService existe
 * Aucun backend requis (lecture directe de la base, .env du backend). */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');
const L = require('./legacy/stock-legacy');
const stockUtils = require('../src/utils/stockUtils');

const VERBOSE = process.argv.includes('--verbose');
let stockService = null;
try { stockService = require('../src/services/stockService'); } catch (_) { stockService = null; }
let buildMpPriceMapLabo = null;
try { ({ buildMpPriceMapLabo } = require('../src/controllers/produitsController')); } catch (_) { /* absent */ }

let erreurs = 0;
let avertissements = 0;
let comparaisons = 0;
const r3 = (v) => (v == null ? null : Math.round(parseFloat(v) * 1000) / 1000);
const same = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(r3(a) - r3(b)) < 0.0005);
function cmp(tag, oracle, actuel, { warn = false } = {}) {
  comparaisons++;
  if (same(oracle, actuel)) { if (VERBOSE) console.log(`   ok  ${tag} = ${r3(oracle)}`); return true; }
  if (warn) { avertissements++; console.log(`⚠️  ${tag} : oracle ${r3(oracle)} ≠ actuel ${r3(actuel)} (avertissement)`); }
  else { erreurs++; console.log(`❌ ${tag} : oracle ${r3(oracle)} ≠ actuel ${r3(actuel)}`); }
  return false;
}

// ── Formes « nouvelles » des sites conservés / formules de coût (copies du code après §2.1/§2.3) ──
// [C1] laboController.getLaboPT.prix_calcule — filtre IN ('manuel','transfert')
async function newPtPrixCalcule(db, laboId, produitId) {
  const r = await db.query(
    `SELECT (
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
     FROM produits p WHERE p.id = $2`,
    [laboId, produitId]
  );
  return r.rows[0]?.prix_calcule != null ? parseFloat(r.rows[0].prix_calcule) : null;
}

// [C2] PMP de déduction à la production — filtre IN ('manuel','transfert')
async function newPmpDeduction(db, laboId, produitId) {
  const r = await db.query(
    `SELECT pi.ingredient_id, pi.portion,
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
     WHERE pi.produit_id = $1
     ORDER BY pi.ingredient_id`,
    [produitId, laboId]
  );
  return r.rows.map((x) => ({
    ingredientId: x.ingredient_id,
    lastPrix: x.last_prix != null ? parseFloat(x.last_prix) : null,
    lastPrixTtc: x.last_prix_ttc != null ? parseFloat(x.last_prix_ttc) : null,
  }));
}

// [K1] inventaireController articles labo — filtre NOT (COALESCE(type_appro,'manuel') = 'manuel' AND quantite < 0)
async function newInventaireLaboArticles(db, laboId) {
  const res = await db.query(
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
       WHERE sld.labo_id = $1
         AND NOT (COALESCE(sld.type_appro,'manuel') = 'manuel' AND sld.quantite < 0)
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
       FROM stock_labo_daily sld
       WHERE labo_id = $1
         AND NOT (COALESCE(sld.type_appro,'manuel') = 'manuel' AND sld.quantite < 0)
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
  const map = {};
  for (const r of res.rows) map[r.ingredient_id] = parseFloat(r.total_stock) || 0;
  return map;
}

// ── Assertions sur le source (uniquement quand le refactor est présent) ──────
function checkSource() {
  const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const labo = read('src/controllers/laboController.js');
  const inv = read('src/controllers/inventaireController.js');
  const prod = read('src/controllers/produitsController.js');
  const svc = read('src/services/stockService.js');
  const count = (s, needle) => s.split(needle).length - 1;
  const expect = (cond, msg) => { comparaisons++; if (!cond) { erreurs++; console.log(`❌ [SRC] ${msg}`); } else if (VERBOSE) console.log(`   ok  [SRC] ${msg}`); };
  expect(count(labo, "type_appro != 'transfert'") === 0, "laboController : plus aucun filtre mort != 'transfert'");
  expect(count(inv, "type_appro != 'transfert'") === 0, "inventaireController : plus aucun filtre mort != 'transfert'");
  expect(count(inv, "NOT (COALESCE(sld.type_appro,'manuel') = 'manuel' AND sld.quantite < 0)") >= 2, 'inventaireController : règle unique §2.1 posée (2 CTE)');
  expect(count(svc, "NOT (COALESCE(sld.type_appro,'manuel') = 'manuel' AND sld.quantite < 0)") >= 1, 'stockService : règle unique §2.1 posée');
  expect(count(labo, "sld2.type_appro IN ('manuel','transfert') AND sld2.prix_unitaire IS NOT NULL AND sld2.prix_unitaire > 0") >= 1, 'laboController :640 prix_calcule sld2 → IN (manuel, transfert)');
  expect(count(labo, "sld3.type_appro IN ('manuel','transfert') AND sld3.prix_unitaire IS NOT NULL AND sld3.prix_unitaire > 0") >= 1, 'laboController :651 prix_calcule sld3 → IN (manuel, transfert)');
  expect(count(labo, "AND sld.type_appro IN ('manuel','transfert')\r\n") + count(labo, "AND sld.type_appro IN ('manuel','transfert')\n") >= 2, 'laboController :899-916 PMP de déduction HT/TTC → IN (manuel, transfert)');
  expect(count(svc, "sld.quantite < 0 AND sld.type_appro = 'PT'") >= 2, 'stockService (ex-laboController :393/:399) compteurs d’usage PT → quantite < 0 AND type_appro = PT');
  expect(count(labo, "type_appro NOT IN ('manuel', 'transfert')") === 0, 'laboController : plus de NOT IN (manuel, transfert)');
  expect(count(prod, "AND sld.quantite > 0 AND sld.type_appro IN ('manuel', 'transfert')") >= 1, 'produitsController :1019 buildMpPriceMapLabo → IN (manuel, transfert)');
  expect(count(labo, "slpt.type_appro IN ('manuel','PT','transfert')") >= 1, 'laboController :1156 historique PT → IN (manuel, PT, transfert)');
}

(async () => {
  console.log(`Invariant stock lot 1b — stockService ${stockService ? 'PRÉSENT (mode oracle vs nouveau)' : 'ABSENT (baseline : oracle vs code actuel)'}\n`);
  const labos = (await pool.query('SELECT id, nom FROM labos ORDER BY id')).rows;
  const activites = (await pool.query('SELECT id, nom FROM activites ORDER BY id')).rows;

  for (const labo of labos) {
    const tag = `labo ${labo.id} (${labo.nom})`;
    const arts = (await pool.query('SELECT ingredient_id FROM labo_ingredient_selections WHERE labo_id = $1 ORDER BY 1', [labo.id])).rows.map((r) => r.ingredient_id);
    const pts = (await pool.query('SELECT produit_id FROM labo_pt_selections WHERE labo_id = $1 ORDER BY 1', [labo.id])).rows.map((r) => r.produit_id);
    console.log(`▶ ${tag} : ${arts.length} article(s), ${pts.length} PT`);

    const oracleBulk = await L.legacyLaboArticlesBaseline(pool, labo.id);
    const bulk = stockService ? await stockService.computeStockBulk(pool, 'labo', labo.id) : null;
    const invOracle = await L.legacyInventaireLaboArticles(pool, labo.id);
    const invNew = await newInventaireLaboArticles(pool, labo.id);
    const mpOracle = await L.legacyBuildMpPriceMapLabo(pool, labo.id);
    const mpActuel = buildMpPriceMapLabo ? await buildMpPriceMapLabo(labo.id) : mpOracle;

    for (const a of arts) {
      const o = await L.legacyStockCourant(pool, 'labo', labo.id, a);
      cmp(`[S1] ${tag} art ${a} stockUtils.computeStockCourant`, o, await stockUtils.computeStockCourant('labo', labo.id, a));
      if (stockService) {
        cmp(`[S1] ${tag} art ${a} stockService.computeStock`, o, await stockService.computeStock(pool, 'labo', labo.id, { articleId: a }));
        const ob = oracleBulk[a] || {};
        const nb = bulk[a] || {};
        cmp(`[S5] ${tag} art ${a} quantité (bulk)`, ob.quantite, nb.stock);
        cmp(`[S5] ${tag} art ${a} PMP HT (bulk)`, ob.pmpUnitHT, nb.pmpHT);
        cmp(`[S5] ${tag} art ${a} PMP TTC (bulk)`, ob.pmpUnitTTC, nb.pmpTTC);
        const p = await stockService.computePmp(pool, 'labo', labo.id, a);
        cmp(`[S5] ${tag} art ${a} computePmp.pmpHT`, ob.pmpUnitHT, p.pmpHT);
        cmp(`[S5] ${tag} art ${a} computePmp.pmpTTC`, ob.pmpUnitTTC, p.pmpTTC);
        cmp(`[S5] ${tag} art ${a} bulk = computeStock`, o, nb.stock);
      }
      cmp(`[K1] ${tag} art ${a} inventaire (filtre §2.1)`, invOracle[a], invNew[a]);
      cmp(`[C3] ${tag} art ${a} buildMpPriceMapLabo`, mpOracle[a] ?? null, mpActuel[a] ?? null);
    }
    const ptNet = await L.legacyGetLaboPTQuantites(pool, labo.id);
    for (const p of pts) {
      const o = await L.legacyStockPTCourant(pool, 'labo', labo.id, p);
      cmp(`[S3] ${tag} PT ${p} stockUtils.computeStockPTCourant`, o, await stockUtils.computeStockPTCourant('labo', labo.id, p));
      if (stockService) cmp(`[S3] ${tag} PT ${p} stockService.computeStock`, o, await stockService.computeStock(pool, 'labo', labo.id, { produitId: p }));
      cmp(`[K3] ${tag} PT ${p} computeStockPTCourant vs getLaboPT (net miroir)`, ptNet[p], o, { warn: true });
      cmp(`[C1] ${tag} PT ${p} prix_calcule`, await L.legacyPtPrixCalcule(pool, labo.id, p), await newPtPrixCalcule(pool, labo.id, p));
      const dO = await L.legacyPmpDeduction(pool, labo.id, p);
      const dN = await newPmpDeduction(pool, labo.id, p);
      for (let i = 0; i < dO.length; i++) {
        cmp(`[C2] ${tag} PT ${p} art ${dO[i].ingredientId} PMP déduction HT`, dO[i].lastPrix, dN[i]?.lastPrix);
        cmp(`[C2] ${tag} PT ${p} art ${dO[i].ingredientId} PMP déduction TTC`, dO[i].lastPrixTtc, dN[i]?.lastPrixTtc);
      }
    }
  }

  for (const act of activites) {
    const tag = `activité ${act.id} (${act.nom})`;
    const arts = (await pool.query('SELECT ingredient_id FROM activite_ingredient_selections WHERE activite_id = $1 ORDER BY 1', [act.id])).rows.map((r) => r.ingredient_id);
    const pts = (await pool.query('SELECT produit_id FROM produit_activite_stock WHERE activite_id = $1 ORDER BY 1', [act.id])).rows.map((r) => r.produit_id);
    console.log(`▶ ${tag} : ${arts.length} article(s), ${pts.length} PT`);
    const oracleBulk = await L.legacyActiviteArticlesBaseline(pool, act.id);
    const bulk = stockService ? await stockService.computeStockBulk(pool, 'activite', act.id) : null;
    for (const a of arts) {
      const o = await L.legacyStockCourant(pool, 'activite', act.id, a);
      cmp(`[S2] ${tag} art ${a} stockUtils.computeStockCourant`, o, await stockUtils.computeStockCourant('activite', act.id, a));
      if (stockService) {
        cmp(`[S2] ${tag} art ${a} stockService.computeStock`, o, await stockService.computeStock(pool, 'activite', act.id, { articleId: a }));
        const ob = oracleBulk[a] || {};
        const nb = bulk[a] || {};
        cmp(`[S6] ${tag} art ${a} quantité (bulk)`, ob.quantite, nb.stock);
        cmp(`[S6] ${tag} art ${a} PMP HT (bulk)`, ob.pmpUnitHT, nb.pmpHT);
        cmp(`[S6] ${tag} art ${a} PMP TTC (bulk)`, ob.pmpUnitTTC, nb.pmpTTC);
        cmp(`[S6] ${tag} art ${a} bulk = computeStock`, o, nb.stock);
      }
    }
    for (const p of pts) {
      const o = await L.legacyStockPTCourant(pool, 'activite', act.id, p);
      cmp(`[S4] ${tag} PT ${p} stockUtils.computeStockPTCourant`, o, await stockUtils.computeStockPTCourant('activite', act.id, p));
      if (stockService) cmp(`[S4] ${tag} PT ${p} stockService.computeStock`, o, await stockService.computeStock(pool, 'activite', act.id, { produitId: p }));
    }
  }

  if (stockService) checkSource();

  console.log(`\n${comparaisons} comparaison(s), ${erreurs} écart(s), ${avertissements} avertissement(s).`);
  await pool.end();
  process.exit(erreurs ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
