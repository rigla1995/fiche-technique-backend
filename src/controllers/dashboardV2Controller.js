const pool = require('../config/database');
const { ptCategorie, ptCategorieSql } = require('../utils/stockUtils');

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard v2 — endpoint unique multi-filtres à onglets.
// GET /api/dashboard/v2?tab=overview|ventes|achats|pertes|labo|filtres
// Filtres (listes séparées par des virgules) :
//   activites, labos, canaux (directe|prestataire), prestataires (uuid),
//   catProduits, typesProduit (produit|supplement|valorise),
//   catArticles, familles, fournisseurs, typesPerte (avarie|dechet)
// Tout en TTC. Marge à 3 étages : brute (CA − coût matière figé par ligne),
// après commissions (taux prestataire par activité), nette estimée
// (− prorata des charges fixes ANNUELLES sur la période).
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => (v == null ? 0 : parseFloat(v));
const r3 = (v) => Math.round(v * 1000) / 1000;
const parseIntList = (s) => String(s || '').split(',').map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
const parseStrList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const resolvePeriode = (from, to) => {
  if (from && to) return { from, to };
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { from: fmt(first), to: fmt(last) };
};

const daysBetween = (from, to) =>
  Math.round((new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000) + 1;

const previousPeriode = (from, to) => {
  const days = daysBetween(from, to);
  const prevTo = new Date(from + 'T00:00:00Z'); prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setUTCDate(prevFrom.getUTCDate() - days + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { from: fmt(prevFrom), to: fmt(prevTo) };
};

// Grain temporel adaptatif pour les séries.
const resolveGrain = (from, to) => {
  const d = daysBetween(from, to);
  return d <= 31 ? 'day' : d <= 120 ? 'week' : 'month';
};

const deltaPct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

// ── Périmètre : activités et labos du compte, restreints (gérant) puis filtrés ──
const resolveContext = async (req) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const pe = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [clientId]);
  if (pe.rows.length === 0) return null;
  const entrepriseId = pe.rows[0].id;
  const [acts, labs] = await Promise.all([
    pool.query('SELECT id FROM activites WHERE entreprise_id = $1', [entrepriseId]),
    pool.query('SELECT id FROM labos WHERE entreprise_id = $1', [entrepriseId]),
  ]);
  let actIds = acts.rows.map((r) => Number(r.id));
  let laboIds = labs.rows.map((r) => Number(r.id));
  if (req.user.role === 'gerant') {
    const aOk = new Set(req.user.gerantActiviteIds || []);
    const lOk = new Set(req.user.gerantLaboIds || []);
    actIds = actIds.filter((id) => aOk.has(id));
    laboIds = laboIds.filter((id) => lOk.has(id));
  }
  const fActs = parseIntList(req.query.activites);
  if (fActs.length) actIds = actIds.filter((id) => fActs.includes(id));
  const fLabos = parseIntList(req.query.labos);
  if (fLabos.length) laboIds = laboIds.filter((id) => fLabos.includes(id));
  return { clientId, entrepriseId, actIds, laboIds };
};

// ── Expressions partagées des requêtes ventes ────────────────────────────────
const VENTE_FROM = `
   FROM ventes v
   JOIN vente_lignes vl ON vl.vente_id = v.id
   LEFT JOIN produits p ON vl.article_type = 'produit' AND p.id = vl.article_id
   LEFT JOIN articles art ON vl.article_type = 'ingredient' AND art.id = vl.article_id
   LEFT JOIN prestataires_livraison pl ON pl.id = v.prestataire_id
   LEFT JOIN activite_prestataires ap ON ap.activite_id = v.activite_id AND ap.prestataire_id = v.prestataire_id`;

const L_CA = 'vl.quantite * vl.prix_unitaire';
const L_COUT = 'vl.quantite * COALESCE(vl.cout_unitaire, 0)';
const L_COMMISSION = `CASE WHEN v.type_vente = 'prestataire' THEN vl.quantite * vl.prix_unitaire * COALESCE(ap.taux_commission, 0) / 100 ELSE 0 END`;
const L_TYPE = `CASE WHEN vl.article_type = 'ingredient' OR p.origine = 'labo' THEN 'valorise' WHEN COALESCE(p.is_supplement, FALSE) THEN 'supplement' ELSE 'produit' END`;
const L_NOM = `COALESCE(p.nom, art.nom, '—')`;
const L_CANAL = `CASE WHEN v.type_vente = 'directe' THEN 'Direct' ELSE COALESCE(pl.nom, 'Prestataire') END`;
// Catégorie de produit : celle du produit, sinon celle du catalogue vendable
// (couvre les valorisés vendus en direct). Sous-requête scalaire = pas de fanout.
const L_CAT_ID = `COALESCE(p.categorie_produit_id, (
    SELECT aav.categorie_produit_id FROM activite_articles_vendables aav
    WHERE aav.activite_id = v.activite_id AND aav.article_type = vl.article_type AND aav.article_id = vl.article_id
    LIMIT 1))`;

// WHERE des requêtes ventes selon les filtres de la requête HTTP.
const buildVenteFilters = (req, actIds, from, to) => {
  const params = [actIds, from, to];
  const cond = [`v.activite_id = ANY($1::int[])`, `v.statut = 'confirmee'`, `v.date_vente >= $2`, `v.date_vente <= $3`];
  const canaux = parseStrList(req.query.canaux).filter((c) => ['directe', 'prestataire'].includes(c));
  if (canaux.length === 1) { params.push(canaux[0]); cond.push(`v.type_vente = $${params.length}`); }
  const prests = parseStrList(req.query.prestataires).filter(isUuid);
  if (prests.length) { params.push(prests); cond.push(`v.prestataire_id = ANY($${params.length}::uuid[])`); }
  const cats = parseIntList(req.query.catProduits);
  if (cats.length) { params.push(cats); cond.push(`${L_CAT_ID} = ANY($${params.length}::int[])`); }
  const types = parseStrList(req.query.typesProduit).filter((t) => ['produit', 'supplement', 'valorise'].includes(t));
  if (types.length && types.length < 3) { params.push(types); cond.push(`${L_TYPE} = ANY($${params.length}::text[])`); }
  return { where: cond.join(' AND '), params };
};

// Agrégat ventes (CA, coût matière, commissions, nb) sur une période.
const venteAgg = async (req, actIds, from, to) => {
  if (actIds.length === 0) return { ca: 0, cout: 0, commission: 0, nb: 0 };
  const { where, params } = buildVenteFilters(req, actIds, from, to);
  const r = await pool.query(
    `SELECT COALESCE(SUM(${L_CA}),0) AS ca, COALESCE(SUM(${L_COUT}),0) AS cout,
            COALESCE(SUM(${L_COMMISSION}),0) AS commission, COUNT(DISTINCT v.id) AS nb
     ${VENTE_FROM} WHERE ${where}`,
    params
  );
  const row = r.rows[0];
  return { ca: num(row.ca), cout: num(row.cout), commission: num(row.commission), nb: parseInt(row.nb, 10) || 0 };
};

// Charges fixes ANNUELLES des activités du périmètre → prorata sur la période.
const chargesProrata = async (actIds, from, to) => {
  if (actIds.length === 0) return 0;
  const r = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN mode = 'global' THEN COALESCE(montant_global, 0)
                              ELSE COALESCE(loyer,0)+COALESCE(charges_personnel,0)+COALESCE(electricite_gaz,0)+COALESCE(eau,0) END), 0) AS annuel
     FROM charges_fixes WHERE activite_id = ANY($1::int[])`,
    [actIds]
  );
  return num(r.rows[0].annuel) * (daysBetween(from, to) / 365.25);
};

// Pertes consolidées (activités + labos) — totaux sur une période.
const pertesTotal = async (actIds, laboIds, from, to) => {
  const [a, l] = await Promise.all([
    actIds.length
      ? pool.query(
          `SELECT COALESCE(SUM(quantite * COALESCE(prix_unitaire_tva, prix_unitaire, 0)),0) AS v
           FROM pertes WHERE activite_id = ANY($1::int[]) AND date_perte >= $2 AND date_perte <= $3`,
          [actIds, from, to]
        )
      : { rows: [{ v: 0 }] },
    laboIds.length
      ? pool.query(
          `SELECT COALESCE(SUM(quantite * COALESCE(prix_unitaire_tva, prix_unitaire, 0)),0) AS v
           FROM labo_pertes WHERE labo_id = ANY($1::int[]) AND date_perte >= $2 AND date_perte <= $3`,
          [laboIds, from, to]
        )
      : { rows: [{ v: 0 }] },
  ]);
  return num(a.rows[0].v) + num(l.rows[0].v);
};

// KPIs de marge à 3 étages (+ deltas vs période précédente).
const margesKpis = async (req, ctx, from, to) => {
  const prev = previousPeriode(from, to);
  const [cur, prv, charges, chargesPrev, pertesCur, pertesPrev] = await Promise.all([
    venteAgg(req, ctx.actIds, from, to),
    venteAgg(req, ctx.actIds, prev.from, prev.to),
    chargesProrata(ctx.actIds, from, to),
    chargesProrata(ctx.actIds, prev.from, prev.to),
    pertesTotal(ctx.actIds, ctx.laboIds, from, to),
    pertesTotal(ctx.actIds, ctx.laboIds, prev.from, prev.to),
  ]);
  const build = (v, ch, pertes) => {
    const margeBrute = v.ca - v.cout;
    const margeApresCom = margeBrute - v.commission;
    const margeNette = margeApresCom - ch;
    return {
      ca: r3(v.ca), cout_matiere: r3(v.cout), commissions: r3(v.commission),
      charges: r3(ch), marge_brute: r3(margeBrute), marge_apres_com: r3(margeApresCom),
      marge_nette: r3(margeNette),
      food_cost_pct: v.ca > 0 ? Math.round((v.cout / v.ca) * 100) : null,
      taux_marge_pct: v.ca > 0 ? Math.round((margeBrute / v.ca) * 100) : null,
      taux_marge_nette_pct: v.ca > 0 ? Math.round((margeNette / v.ca) * 100) : null,
      nb_ventes: v.nb,
      panier_moyen: v.nb > 0 ? Math.round((v.ca / v.nb) * 100) / 100 : 0,
      pertes: r3(pertes),
      pertes_pct_ca: v.ca > 0 ? Math.round((pertes / v.ca) * 1000) / 10 : null,
    };
  };
  const kpis = build(cur, charges, pertesCur);
  const kprev = build(prv, chargesPrev, pertesPrev);
  kpis.deltas = {
    ca: deltaPct(kpis.ca, kprev.ca),
    marge_brute: deltaPct(kpis.marge_brute, kprev.marge_brute),
    marge_apres_com: deltaPct(kpis.marge_apres_com, kprev.marge_apres_com),
    // Un delta en % n'a de sens que sur une base strictement positive.
    marge_nette: deltaPct(kpis.marge_nette, kprev.marge_nette),
    pertes: deltaPct(kpis.pertes, kprev.pertes),
    nb_ventes: deltaPct(kpis.nb_ventes, kprev.nb_ventes),
    panier_moyen: deltaPct(kpis.panier_moyen, kprev.panier_moyen),
    food_cost_pts: kpis.food_cost_pct != null && kprev.food_cost_pct != null ? kpis.food_cost_pct - kprev.food_cost_pct : null,
  };
  return kpis;
};

// Valeur du stock (articles + PT) et alertes de seuil pour les activités.
const stockActivites = async (actIds, { avecDetail = false } = {}) => {
  if (actIds.length === 0) return { valeur: 0, parCategorie: [], alertes: [] };
  const [artRes, ptRes] = await Promise.all([
    pool.query(
      `SELECT i.nom AS article, COALESCE(c.nom, 'Sans catégorie') AS categorie, ais.seuil_min,
              SUM(sed.quantite) AS quantite,
              (SELECT COALESCE(s2.prix_unitaire_tva, s2.prix_unitaire) FROM stock_entreprise_daily s2
               WHERE s2.activite_id = sed.activite_id AND s2.ingredient_id = sed.ingredient_id
                 AND COALESCE(s2.prix_unitaire_tva, s2.prix_unitaire) IS NOT NULL ORDER BY s2.date_appro DESC LIMIT 1) AS prix
       FROM stock_entreprise_daily sed
       JOIN articles i ON i.id = sed.ingredient_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN activite_ingredient_selections ais ON ais.activite_id = sed.activite_id AND ais.ingredient_id = sed.ingredient_id
       WHERE sed.activite_id = ANY($1::int[])
       GROUP BY sed.activite_id, sed.ingredient_id, i.nom, c.nom, ais.seuil_min`,
      [actIds]
    ),
    pool.query(
      `SELECT p.nom AS article, p.type, p.origine, COALESCE(pas.seuil_min, p.seuil_min_pt) AS seuil_min,
              SUM(spt.quantite) AS quantite,
              (SELECT s2.prix_calcule FROM stock_produits_transformes s2
               WHERE s2.activite_id = spt.activite_id AND s2.produit_id = spt.produit_id
                 AND s2.quantite > 0 AND s2.prix_calcule IS NOT NULL
               ORDER BY s2.date_appro DESC, s2.id DESC LIMIT 1) AS prix
       FROM stock_produits_transformes spt
       JOIN produits p ON p.id = spt.produit_id
       LEFT JOIN produit_activite_stock pas ON pas.produit_id = spt.produit_id AND pas.activite_id = spt.activite_id
       WHERE spt.activite_id = ANY($1::int[])
       GROUP BY spt.activite_id, spt.produit_id, p.nom, p.type, p.origine, p.seuil_min_pt, pas.seuil_min`,
      [actIds]
    ),
  ]);
  let valeur = 0;
  const parCat = {};
  const alertes = [];
  const collect = (rows, catOf) => {
    for (const r of rows) {
      const q = num(r.quantite);
      const v = q * num(r.prix);
      const cat = catOf(r);
      valeur += v;
      parCat[cat] = (parCat[cat] || 0) + v;
      if (r.seuil_min != null && q <= num(r.seuil_min)) {
        alertes.push({ article: r.article, categorie: cat, quantite: r3(q), seuil: num(r.seuil_min) });
      }
    }
  };
  collect(artRes.rows, (r) => r.categorie);
  collect(ptRes.rows, (r) => ptCategorie(r.type, r.origine));
  return {
    valeur: r3(valeur),
    parCategorie: Object.entries(parCat).map(([categorie, v]) => ({ categorie, valeur: r3(v) })).sort((a, b) => b.valeur - a.valeur),
    alertes: avecDetail ? alertes.sort((a, b) => a.quantite - b.quantite).slice(0, 30) : alertes,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Onglets
// ─────────────────────────────────────────────────────────────────────────────

const tabOverview = async (req, ctx, from, to) => {
  const grain = resolveGrain(from, to);
  const { where, params } = buildVenteFilters(req, ctx.actIds, from, to);
  const [kpis, stock, evoRes, fcRes, invRes] = await Promise.all([
    margesKpis(req, ctx, from, to),
    stockActivites(ctx.actIds),
    ctx.actIds.length
      ? pool.query(
          `SELECT to_char(date_trunc('${grain}', v.date_vente), 'YYYY-MM-DD') AS bucket,
                  COALESCE(SUM(${L_CA}),0) AS ca,
                  COALESCE(SUM(${L_CA} - ${L_COUT}),0) AS marge,
                  COALESCE(SUM(${L_COMMISSION}),0) AS commission
           ${VENTE_FROM} WHERE ${where} GROUP BY 1 ORDER BY 1`,
          params
        )
      : { rows: [] },
    ctx.actIds.length
      ? pool.query(
          `SELECT COUNT(*) AS cnt FROM (
             SELECT vl.article_id
             ${VENTE_FROM} WHERE ${where} AND vl.article_type = 'produit'
             GROUP BY vl.article_id
             HAVING SUM(${L_CA}) > 0 AND SUM(${L_COUT}) / SUM(${L_CA}) > 0.40
           ) t`,
          params
        )
      : { rows: [{ cnt: 0 }] },
    ctx.actIds.length
      ? pool.query(`SELECT MAX(date_inventaire) AS last FROM inventaires WHERE activite_id = ANY($1::int[])`, [ctx.actIds])
      : { rows: [{ last: null }] },
  ]);
  const last = invRes.rows[0].last;
  return {
    kpis: { ...kpis, valeur_stock: stock.valeur },
    alertes: {
      stock_bas: stock.alertes.length,
      food_cost_eleve: parseInt(fcRes.rows[0].cnt, 10) || 0,
      jours_inventaire: last ? Math.round((Date.now() - new Date(last).getTime()) / 86400000) : null,
    },
    grain,
    evolution: evoRes.rows.map((r) => ({
      bucket: r.bucket, ca: r3(num(r.ca)), marge: r3(num(r.marge)), marge_apres_com: r3(num(r.marge) - num(r.commission)),
    })),
  };
};

const tabVentes = async (req, ctx, from, to) => {
  if (ctx.actIds.length === 0) return { vide: true };
  const kpis = await margesKpis(req, ctx, from, to);
  const { where, params } = buildVenteFilters(req, ctx.actIds, from, to);
  const sums = `SUM(${L_CA}) AS ca, SUM(${L_COUT}) AS cout, SUM(${L_COMMISSION}) AS commission, SUM(vl.quantite) AS qte`;
  const mapRow = (r) => {
    const ca = num(r.ca); const cout = num(r.cout); const com = num(r.commission);
    return {
      ca: r3(ca), cout: r3(cout), commissions: r3(com), qte: r3(num(r.qte)),
      marge_brute: r3(ca - cout), marge_apres_com: r3(ca - cout - com),
      food_cost_pct: ca > 0 ? Math.round((cout / ca) * 100) : null,
    };
  };
  const [canalRes, catRes, typeRes, prodRes] = await Promise.all([
    pool.query(`SELECT ${L_CANAL} AS canal, ${sums} ${VENTE_FROM} WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`, params),
    pool.query(
      `SELECT COALESCE(cpn.nom, 'Sans catégorie') AS categorie, SUM(t.ca) AS ca, SUM(t.cout) AS cout, SUM(t.commission) AS commission, SUM(t.qte) AS qte
       FROM (
         SELECT ${L_CAT_ID} AS cat_id, ${L_CA} AS ca, ${L_COUT} AS cout, ${L_COMMISSION} AS commission, vl.quantite AS qte
         ${VENTE_FROM} WHERE ${where}
       ) t
       LEFT JOIN categories_produit cpn ON cpn.id = t.cat_id
       GROUP BY 1 ORDER BY 2 DESC`,
      params
    ),
    pool.query(`SELECT ${L_TYPE} AS type, ${sums} ${VENTE_FROM} WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`, params),
    pool.query(
      `SELECT ${L_NOM} AS nom, ${L_TYPE} AS type, ${sums} ${VENTE_FROM} WHERE ${where} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 300`,
      params
    ),
  ]);
  const totalCa = num(kpis.ca) || 1;
  const produits = prodRes.rows.map((r) => ({
    nom: r.nom, type: r.type, ...mapRow(r),
    part_ca_pct: Math.round((num(r.ca) / totalCa) * 1000) / 10,
  }));
  const parMarge = [...produits].sort((a, b) => b.marge_brute - a.marge_brute);
  return {
    kpis,
    waterfall: {
      ca: kpis.ca, cout_matiere: kpis.cout_matiere, commissions: kpis.commissions,
      charges: kpis.charges, marge_nette: kpis.marge_nette,
    },
    par_canal: canalRes.rows.map((r) => ({ canal: r.canal, ...mapRow(r) })),
    par_categorie: catRes.rows.map((r) => ({ categorie: r.categorie, ...mapRow(r) })),
    par_type: typeRes.rows.map((r) => ({ type: r.type, ...mapRow(r) })),
    top_marge: parMarge.slice(0, 8),
    flop_marge: parMarge.filter((p) => p.ca > 0).slice(-8).reverse(),
    produits,
  };
};

// Filtres articles (achats / pertes) : catégories, familles, fournisseurs.
const buildArticleFilters = (req, params, cond, { fournisseurCol = null, categorieAlias = 'c', articleAlias = 'i' } = {}) => {
  const cats = parseIntList(req.query.catArticles);
  if (cats.length) { params.push(cats); cond.push(`${articleAlias}.categorie_id = ANY($${params.length}::int[])`); }
  const fams = parseIntList(req.query.familles);
  if (fams.length) { params.push(fams); cond.push(`${categorieAlias}.famille_id = ANY($${params.length}::int[])`); }
  if (fournisseurCol) {
    const fs = parseIntList(req.query.fournisseurs);
    if (fs.length) { params.push(fs); cond.push(`${fournisseurCol} = ANY($${params.length}::int[])`); }
  }
  return cats.length > 0 || fams.length > 0;
};

const tabAchatsStock = async (req, ctx, from, to) => {
  if (ctx.actIds.length === 0) return { vide: true };
  const grain = resolveGrain(from, to);

  // Achats = approvisionnements manuels positifs (les transferts sont comptés à part).
  const params = [ctx.actIds, from, to];
  const cond = [`sed.activite_id = ANY($1::int[])`, `sed.date_appro >= $2`, `sed.date_appro <= $3`, `sed.quantite > 0`];
  const filtreArticles = buildArticleFilters(req, params, cond, { fournisseurCol: 'sed.fournisseur_id' });
  const whereBase = cond.join(' AND ');

  const [catRes, fournRes, evoRes, transfRes, stock, invRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(c.nom, 'Sans catégorie') AS categorie,
              COALESCE(SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire, 0)),0) AS valeur, COUNT(*) AS nb
       FROM stock_entreprise_daily sed
       JOIN articles i ON i.id = sed.ingredient_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       WHERE ${whereBase} AND sed.type_appro = 'manuel'
       GROUP BY 1 ORDER BY valeur DESC`,
      params
    ),
    pool.query(
      `SELECT COALESCE(fo.nom, '—') AS fournisseur,
              COALESCE(SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire, 0)),0) AS valeur, COUNT(*) AS nb
       FROM stock_entreprise_daily sed
       JOIN articles i ON i.id = sed.ingredient_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN fournisseurs fo ON fo.id = sed.fournisseur_id
       WHERE ${whereBase} AND sed.type_appro = 'manuel'
       GROUP BY 1 ORDER BY valeur DESC LIMIT 12`,
      params
    ),
    pool.query(
      `SELECT to_char(date_trunc('${grain}', sed.date_appro), 'YYYY-MM-DD') AS bucket,
              COALESCE(SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire, 0)),0) AS valeur
       FROM stock_entreprise_daily sed
       JOIN articles i ON i.id = sed.ingredient_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       WHERE ${whereBase} AND sed.type_appro = 'manuel'
       GROUP BY 1 ORDER BY 1`,
      params
    ),
    pool.query(
      `SELECT COALESCE(SUM(sed.quantite * COALESCE(sed.prix_unitaire_tva, sed.prix_unitaire, 0)),0) AS valeur, COUNT(*) AS nb
       FROM stock_entreprise_daily sed
       JOIN articles i ON i.id = sed.ingredient_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       WHERE ${whereBase} AND sed.type_appro = 'transfert'`,
      params
    ),
    stockActivites(ctx.actIds, { avecDetail: true }),
    pool.query(
      `SELECT a.nom AS activite, MAX(inv.date_inventaire) AS dernier
       FROM activites a LEFT JOIN inventaires inv ON inv.activite_id = a.id
       WHERE a.id = ANY($1::int[]) GROUP BY a.nom ORDER BY a.nom`,
      [ctx.actIds]
    ),
  ]);

  // Appros PT (productions/réceptions positives) — hors filtres d'articles.
  const achatsParCategorie = catRes.rows.map((r) => ({ categorie: r.categorie, valeur: r3(num(r.valeur)), nb: parseInt(r.nb, 10) || 0 }));
  if (!filtreArticles && parseIntList(req.query.fournisseurs).length === 0) {
    const ptRes = await pool.query(
      `SELECT ${ptCategorieSql('p')} AS categorie,
              COALESCE(SUM(spt.quantite * COALESCE(spt.prix_calcule, 0)),0) AS valeur, COUNT(*) AS nb
       FROM stock_produits_transformes spt
       JOIN produits p ON p.id = spt.produit_id
       WHERE spt.activite_id = ANY($1::int[]) AND spt.date_appro >= $2 AND spt.date_appro <= $3 AND spt.quantite > 0
       GROUP BY 1`,
      [ctx.actIds, from, to]
    );
    for (const r of ptRes.rows) {
      if (num(r.valeur) > 0) achatsParCategorie.push({ categorie: r.categorie, valeur: r3(num(r.valeur)), nb: parseInt(r.nb, 10) || 0 });
    }
    achatsParCategorie.sort((a, b) => b.valeur - a.valeur);
  }
  const achats = achatsParCategorie.reduce((s, r) => s + r.valeur, 0);

  return {
    kpis: {
      achats: r3(achats),
      nb_appros: achatsParCategorie.reduce((s, r) => s + r.nb, 0),
      receptions_transferts: r3(num(transfRes.rows[0].valeur)),
      nb_transferts: parseInt(transfRes.rows[0].nb, 10) || 0,
      valeur_stock: stock.valeur,
      stock_bas: stock.alertes.length,
    },
    grain,
    achats_par_categorie: achatsParCategorie,
    achats_par_fournisseur: fournRes.rows.map((r) => ({ fournisseur: r.fournisseur, valeur: r3(num(r.valeur)), nb: parseInt(r.nb, 10) || 0 })),
    evolution_achats: evoRes.rows.map((r) => ({ bucket: r.bucket, valeur: r3(num(r.valeur)) })),
    stock_par_categorie: stock.parCategorie,
    alertes_stock: stock.alertes,
    inventaires: invRes.rows.map((r) => ({
      activite: r.activite,
      dernier: r.dernier,
      jours: r.dernier ? Math.round((Date.now() - new Date(r.dernier).getTime()) / 86400000) : null,
    })),
  };
};

const tabPertes = async (req, ctx, from, to) => {
  const grain = resolveGrain(from, to);
  const typesPerte = parseStrList(req.query.typesPerte).filter((t) => ['avarie', 'dechet'].includes(t));

  const queries = [];
  if (ctx.actIds.length) {
    const params = [ctx.actIds, from, to];
    const cond = [`p.activite_id = ANY($1::int[])`, `p.date_perte >= $2`, `p.date_perte <= $3`];
    buildArticleFilters(req, params, cond);
    if (typesPerte.length === 1) { params.push(typesPerte[0]); cond.push(`p.type_perte = $${params.length}`); }
    queries.push(pool.query(
      `SELECT a.nom AS site, 'Activité' AS site_type, p.type_perte,
              CASE WHEN p.produit_id IS NOT NULL THEN ${ptCategorieSql('pr')} ELSE COALESCE(c.nom, 'Sans catégorie') END AS categorie,
              COALESCE(i.nom, pr.nom, '—') AS article,
              to_char(date_trunc('${grain}', p.date_perte), 'YYYY-MM-DD') AS bucket,
              COALESCE(SUM(p.quantite * COALESCE(p.prix_unitaire_tva, p.prix_unitaire, 0)),0) AS valeur
       FROM pertes p
       JOIN activites a ON a.id = p.activite_id
       LEFT JOIN articles i ON i.id = p.ingredient_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN produits pr ON pr.id = p.produit_id
       WHERE ${cond.join(' AND ')}
       GROUP BY 1,2,3,4,5,6`,
      params
    ));
  }
  if (ctx.laboIds.length) {
    const params = [ctx.laboIds, from, to];
    const cond = [`p.labo_id = ANY($1::int[])`, `p.date_perte >= $2`, `p.date_perte <= $3`];
    buildArticleFilters(req, params, cond);
    if (typesPerte.length === 1) { params.push(typesPerte[0]); cond.push(`p.type_perte = $${params.length}`); }
    queries.push(pool.query(
      `SELECT l.nom AS site, 'Labo' AS site_type, p.type_perte,
              CASE WHEN p.produit_id IS NOT NULL THEN ${ptCategorieSql('pr')} ELSE COALESCE(c.nom, 'Sans catégorie') END AS categorie,
              COALESCE(i.nom, pr.nom, '—') AS article,
              to_char(date_trunc('${grain}', p.date_perte), 'YYYY-MM-DD') AS bucket,
              COALESCE(SUM(p.quantite * COALESCE(p.prix_unitaire_tva, p.prix_unitaire, 0)),0) AS valeur
       FROM labo_pertes p
       JOIN labos l ON l.id = p.labo_id
       LEFT JOIN articles i ON i.id = p.ingredient_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN produits pr ON pr.id = p.produit_id
       WHERE ${cond.join(' AND ')}
       GROUP BY 1,2,3,4,5,6`,
      params
    ));
  }
  const results = await Promise.all(queries);
  const rows = results.flatMap((r) => r.rows);

  let total = 0;
  const parType = {}; const parCat = {}; const parSite = {}; const parArticle = {}; const parBucket = {};
  for (const r of rows) {
    const v = num(r.valeur);
    total += v;
    parType[r.type_perte] = (parType[r.type_perte] || 0) + v;
    parCat[r.categorie] = (parCat[r.categorie] || 0) + v;
    parSite[`${r.site_type} · ${r.site}`] = (parSite[`${r.site_type} · ${r.site}`] || 0) + v;
    parArticle[r.article] = (parArticle[r.article] || 0) + v;
    parBucket[r.bucket] = (parBucket[r.bucket] || 0) + v;
  }
  const toArr = (obj, key) =>
    Object.entries(obj).map(([k, v]) => ({ [key]: k, valeur: r3(v) })).sort((a, b) => b.valeur - a.valeur);

  const ventes = await venteAgg(req, ctx.actIds, from, to);
  return {
    kpis: {
      total: r3(total),
      pct_ca: ventes.ca > 0 ? Math.round((total / ventes.ca) * 1000) / 10 : null,
    },
    grain,
    par_type: toArr(parType, 'type'),
    par_categorie: toArr(parCat, 'categorie'),
    par_site: toArr(parSite, 'site'),
    top_articles: toArr(parArticle, 'article').slice(0, 10),
    evolution: Object.entries(parBucket).map(([bucket, v]) => ({ bucket, valeur: r3(v) })).sort((a, b) => (a.bucket < b.bucket ? -1 : 1)),
  };
};

const tabLabo = async (req, ctx, from, to) => {
  if (ctx.laboIds.length === 0) return { vide: true };
  const laboIds = ctx.laboIds;

  const [stockArt, stockPt, approsRes, prodRes, prodTopRes, pertesRes, transRes, topTransRes, parActRes, ventesRes] = await Promise.all([
    pool.query(
      `SELECT sld.ingredient_id, SUM(sld.quantite) AS quantite,
              (SELECT COALESCE(s2.prix_unitaire_tva, s2.prix_unitaire) FROM stock_labo_daily s2
               WHERE s2.labo_id = sld.labo_id AND s2.ingredient_id = sld.ingredient_id
                 AND COALESCE(s2.prix_unitaire_tva, s2.prix_unitaire) IS NOT NULL ORDER BY s2.date_appro DESC LIMIT 1) AS prix
       FROM stock_labo_daily sld WHERE sld.labo_id = ANY($1::int[])
       GROUP BY sld.labo_id, sld.ingredient_id`,
      [laboIds]
    ),
    pool.query(
      `SELECT slpt.produit_id, SUM(slpt.quantite) AS quantite,
              (SELECT COALESCE(s2.prix_unitaire_tva, s2.prix_unitaire) FROM stock_labo_pt_daily s2
               WHERE s2.labo_id = slpt.labo_id AND s2.produit_id = slpt.produit_id
                 AND s2.quantite > 0 AND s2.prix_unitaire IS NOT NULL
               ORDER BY s2.date_appro DESC, s2.id DESC LIMIT 1) AS prix
       FROM stock_labo_pt_daily slpt WHERE slpt.labo_id = ANY($1::int[])
       GROUP BY slpt.labo_id, slpt.produit_id`,
      [laboIds]
    ),
    pool.query(
      `SELECT COALESCE(SUM(quantite * COALESCE(prix_unitaire_tva, prix_unitaire, 0)),0) AS valeur, COUNT(*) AS nb
       FROM stock_labo_daily WHERE labo_id = ANY($1::int[]) AND date_appro >= $2 AND date_appro <= $3 AND quantite > 0 AND type_appro = 'manuel'`,
      [laboIds, from, to]
    ),
    pool.query(
      `SELECT COALESCE(SUM(quantite * COALESCE(prix_unitaire_tva, prix_unitaire, 0)),0) AS valeur, COUNT(*) AS nb
       FROM stock_labo_pt_daily
       WHERE labo_id = ANY($1::int[]) AND date_appro >= $2 AND date_appro <= $3 AND quantite > 0 AND type_appro = 'manuel'`,
      [laboIds, from, to]
    ),
    pool.query(
      `SELECT p.nom, COALESCE(SUM(slpt.quantite),0) AS qte, COALESCE(SUM(slpt.quantite * COALESCE(slpt.prix_unitaire_tva, slpt.prix_unitaire, 0)),0) AS valeur
       FROM stock_labo_pt_daily slpt JOIN produits p ON p.id = slpt.produit_id
       WHERE slpt.labo_id = ANY($1::int[]) AND slpt.date_appro >= $2 AND slpt.date_appro <= $3 AND slpt.quantite > 0 AND slpt.type_appro = 'manuel'
       GROUP BY p.nom ORDER BY valeur DESC LIMIT 8`,
      [laboIds, from, to]
    ),
    pool.query(
      `SELECT type_perte, COALESCE(SUM(quantite * COALESCE(prix_unitaire_tva, prix_unitaire, 0)),0) AS valeur
       FROM labo_pertes WHERE labo_id = ANY($1::int[]) AND date_perte >= $2 AND date_perte <= $3
       GROUP BY type_perte`,
      [laboIds, from, to]
    ),
    pool.query(
      `SELECT COALESCE(SUM(quantite * COALESCE(prix_unitaire_tva, prix_unitaire, 0)),0) AS valeur, COUNT(*) AS nb
       FROM labo_transfers WHERE labo_id = ANY($1::int[]) AND date_transfert >= $2 AND date_transfert <= $3`,
      [laboIds, from, to]
    ),
    pool.query(
      `SELECT i.nom, SUM(lt.quantite) AS qte, SUM(lt.quantite * COALESCE(lt.prix_unitaire_tva, lt.prix_unitaire, 0)) AS valeur
       FROM labo_transfers lt JOIN articles i ON i.id = lt.ingredient_id
       WHERE lt.labo_id = ANY($1::int[]) AND lt.date_transfert >= $2 AND lt.date_transfert <= $3
       GROUP BY i.nom ORDER BY valeur DESC LIMIT 8`,
      [laboIds, from, to]
    ),
    pool.query(
      `SELECT a.nom AS activite, COALESCE(SUM(lt.quantite * COALESCE(lt.prix_unitaire_tva, lt.prix_unitaire, 0)),0) AS valeur
       FROM labo_transfers lt JOIN activites a ON a.id = lt.activite_id
       WHERE lt.labo_id = ANY($1::int[]) AND lt.date_transfert >= $2 AND lt.date_transfert <= $3
       GROUP BY a.nom ORDER BY valeur DESC`,
      [laboIds, from, to]
    ),
    pool.query(
      `SELECT COALESCE(SUM(vl.quantite * vl.prix_unitaire),0) AS ca, COUNT(DISTINCT v.id) AS nb
       FROM ventes v JOIN vente_lignes vl ON vl.vente_id = v.id
       WHERE v.labo_id = ANY($1::int[]) AND v.statut = 'confirmee' AND v.date_vente >= $2 AND v.date_vente <= $3`,
      [laboIds, from, to]
    ),
  ]);

  let valeurStock = 0;
  for (const r of stockArt.rows) valeurStock += num(r.quantite) * num(r.prix);
  for (const r of stockPt.rows) valeurStock += num(r.quantite) * num(r.prix);
  const pertesTotalLabo = pertesRes.rows.reduce((s, r) => s + num(r.valeur), 0);

  return {
    kpis: {
      valeur_stock: r3(valeurStock),
      appros: r3(num(approsRes.rows[0].valeur)),
      nb_appros: parseInt(approsRes.rows[0].nb, 10) || 0,
      production_pt: r3(num(prodRes.rows[0].valeur)),
      nb_productions: parseInt(prodRes.rows[0].nb, 10) || 0,
      transferts: r3(num(transRes.rows[0].valeur)),
      nb_transferts: parseInt(transRes.rows[0].nb, 10) || 0,
      pertes: r3(pertesTotalLabo),
      ventes_labo: r3(num(ventesRes.rows[0].ca)),
      nb_ventes_labo: parseInt(ventesRes.rows[0].nb, 10) || 0,
    },
    production_par_produit: prodTopRes.rows.map((r) => ({ nom: r.nom, qte: r3(num(r.qte)), valeur: r3(num(r.valeur)) })),
    pertes_par_type: pertesRes.rows.map((r) => ({ type: r.type_perte, valeur: r3(num(r.valeur)) })),
    top_transferts: topTransRes.rows.map((r) => ({ nom: r.nom, qte: r3(num(r.qte)), valeur: r3(num(r.valeur)) })),
    transferts_par_activite: parActRes.rows.map((r) => ({ activite: r.activite, valeur: r3(num(r.valeur)) })),
  };
};

// Options des filtres (listes déroulantes) — dérivées des données du compte.
const tabFiltres = async (req, ctx) => {
  const [acts, labs, prests, catsP, catsA, fams, fourn] = await Promise.all([
    pool.query(`SELECT id, nom FROM activites WHERE id = ANY($1::int[]) ORDER BY nom`, [ctx.actIds.length ? ctx.actIds : [-1]]),
    pool.query(`SELECT id, nom FROM labos WHERE id = ANY($1::int[]) ORDER BY nom`, [ctx.laboIds.length ? ctx.laboIds : [-1]]),
    ctx.actIds.length
      ? pool.query(
          `SELECT DISTINCT pl.id, pl.nom FROM activite_prestataires ap
           JOIN prestataires_livraison pl ON pl.id = ap.prestataire_id
           WHERE ap.activite_id = ANY($1::int[]) ORDER BY pl.nom`,
          [ctx.actIds]
        )
      : { rows: [] },
    pool.query(
      `SELECT DISTINCT cp.id, cp.nom FROM categories_produit cp
       JOIN produits p ON p.categorie_produit_id = cp.id WHERE p.client_id = $1 ORDER BY cp.nom`,
      [ctx.clientId]
    ),
    pool.query(
      `SELECT DISTINCT c.id, c.nom FROM categories c
       JOIN articles a ON a.categorie_id = c.id WHERE a.client_id = $1 ORDER BY c.nom`,
      [ctx.clientId]
    ),
    pool.query(
      `SELECT DISTINCT f.id, f.nom FROM familles f
       JOIN categories c ON c.famille_id = f.id
       JOIN articles a ON a.categorie_id = c.id WHERE a.client_id = $1 ORDER BY f.nom`,
      [ctx.clientId]
    ),
    ctx.actIds.length
      ? pool.query(
          `SELECT DISTINCT fo.id, fo.nom FROM stock_entreprise_daily sed
           JOIN fournisseurs fo ON fo.id = sed.fournisseur_id
           WHERE sed.activite_id = ANY($1::int[]) ORDER BY fo.nom`,
          [ctx.actIds]
        )
      : { rows: [] },
  ]);
  return {
    activites: acts.rows,
    labos: labs.rows,
    prestataires: prests.rows,
    categories_produit: catsP.rows,
    categories_articles: catsA.rows,
    familles: fams.rows,
    fournisseurs: fourn.rows,
    role: req.user.role,
  };
};

const getDashboardV2 = async (req, res) => {
  try {
    const ctx = await resolveContext(req);
    if (!ctx) return res.json({ vide: true });
    const { from, to } = resolvePeriode(req.query.from, req.query.to);
    const tab = String(req.query.tab || 'overview');

    let data;
    switch (tab) {
      case 'overview': data = await tabOverview(req, ctx, from, to); break;
      case 'ventes': data = await tabVentes(req, ctx, from, to); break;
      case 'achats': data = await tabAchatsStock(req, ctx, from, to); break;
      case 'pertes': data = await tabPertes(req, ctx, from, to); break;
      case 'labo': data = await tabLabo(req, ctx, from, to); break;
      case 'filtres': data = await tabFiltres(req, ctx); break;
      default: return res.status(400).json({ message: `Onglet inconnu : ${tab}` });
    }
    res.json({ periode: { from, to }, tab, ...data });
  } catch (err) {
    console.error('[getDashboardV2]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getDashboardV2 };
