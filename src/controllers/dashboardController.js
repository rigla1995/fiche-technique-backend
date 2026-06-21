const pool = require('../config/database');

// Bornes du mois en cours par défaut, sinon les valeurs fournies (YYYY-MM-DD).
const resolvePeriode = (from, to) => {
  if (from && to) return { from, to };
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(y, m + 1, 0));
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { from: fmt(first), to: fmt(last) };
};

// Période précédente de même durée (pour les évolutions).
const previousPeriode = (from, to) => {
  const f = new Date(from + 'T00:00:00Z');
  const t = new Date(to + 'T00:00:00Z');
  const days = Math.round((t - f) / 86400000) + 1;
  const prevTo = new Date(f); prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setUTCDate(prevFrom.getUTCDate() - days + 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { from: fmt(prevFrom), to: fmt(prevTo) };
};

// Renvoie les ids d'activités du périmètre (client = toutes; gérant = assignées; + filtre).
const resolveScopeActivites = async (req) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const peRes = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [clientId]);
  if (peRes.rows.length === 0) return [];
  const all = await pool.query('SELECT id FROM activites WHERE entreprise_id = $1', [peRes.rows[0].id]);
  let ids = all.rows.map((r) => Number(r.id));
  if (req.user.role === 'gerant') {
    const allowed = new Set(req.user.gerantActiviteIds || []);
    ids = ids.filter((id) => allowed.has(id));
  }
  const filtre = req.query.activiteId ? Number(req.query.activiteId) : null;
  if (filtre) ids = ids.filter((id) => id === filtre);
  return ids;
};

const num = (v) => (v == null ? 0 : parseFloat(v));

const getClientDashboard = async (req, res) => {
  try {
    const { from, to } = resolvePeriode(req.query.from, req.query.to);
    const prev = previousPeriode(from, to);
    const actIds = await resolveScopeActivites(req);
    if (actIds.length === 0) {
      return res.json({ periode: { from, to }, vide: true });
    }

    // ── Ventes (CA, coût matière, nb ventes) période + précédente ──
    const venteAgg = async (f, t) => {
      const r = await pool.query(
        `SELECT COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) AS ca,
                COALESCE(SUM(vl.quantite * COALESCE(vl.cout_unitaire, 0)), 0) AS cout_matiere,
                COUNT(DISTINCT v.id) AS nb_ventes
         FROM ventes v
         JOIN vente_lignes vl ON vl.vente_id = v.id
         WHERE v.activite_id = ANY($1::int[]) AND v.statut = 'confirmee'
           AND v.date_vente >= $2 AND v.date_vente <= $3`,
        [actIds, f, t]
      );
      return r.rows[0];
    };
    const cur = await venteAgg(from, to);
    const prv = await venteAgg(prev.from, prev.to);

    const ca = num(cur.ca);
    const coutMatiere = num(cur.cout_matiere);
    const marge = ca - coutMatiere;
    const caPrev = num(prv.ca);
    const nbVentes = parseInt(cur.nb_ventes, 10) || 0;

    // ── Pertes (valeur) sur la période ──
    const pertesRes = await pool.query(
      `SELECT COALESCE(SUM(p.quantite * COALESCE(p.prix_unitaire, 0)), 0) AS valeur
       FROM pertes p
       WHERE p.activite_id = ANY($1::int[]) AND p.date_perte >= $2 AND p.date_perte <= $3`,
      [actIds, from, to]
    );
    const pertes = num(pertesRes.rows[0].valeur);

    // ── Stock : valeur + nombre d'articles en alerte (sous seuil min) ──
    const stockRes = await pool.query(
      `SELECT sed.ingredient_id, ais.seuil_min,
              SUM(sed.quantite) AS quantite,
              (SELECT s2.prix_unitaire FROM stock_entreprise_daily s2
               WHERE s2.activite_id = sed.activite_id AND s2.ingredient_id = sed.ingredient_id
                 AND s2.prix_unitaire IS NOT NULL ORDER BY s2.date_appro DESC LIMIT 1) AS prix
       FROM stock_entreprise_daily sed
       LEFT JOIN activite_ingredient_selections ais
         ON ais.activite_id = sed.activite_id AND ais.ingredient_id = sed.ingredient_id
       WHERE sed.activite_id = ANY($1::int[])
       GROUP BY sed.activite_id, sed.ingredient_id, ais.seuil_min`,
      [actIds]
    );
    let valeurStock = 0;
    let stockBas = 0;
    for (const r of stockRes.rows) {
      const q = num(r.quantite);
      valeurStock += q * num(r.prix);
      if (r.seuil_min != null && q <= num(r.seuil_min)) stockBas += 1;
    }

    // ── Évolution hebdomadaire (CA + marge) ──
    const evoRes = await pool.query(
      `SELECT to_char(date_trunc('week', v.date_vente), 'YYYY-MM-DD') AS semaine,
              COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) AS ca,
              COALESCE(SUM(vl.quantite * (vl.prix_unitaire - COALESCE(vl.cout_unitaire,0))), 0) AS marge
       FROM ventes v JOIN vente_lignes vl ON vl.vente_id = v.id
       WHERE v.activite_id = ANY($1::int[]) AND v.statut = 'confirmee'
         AND v.date_vente >= $2 AND v.date_vente <= $3
       GROUP BY 1 ORDER BY 1`,
      [actIds, from, to]
    );

    // ── Top produits (CA) ──
    const topRes = await pool.query(
      `SELECT COALESCE(p.nom, a.nom, '—') AS nom,
              SUM(vl.quantite) AS qte,
              SUM(vl.quantite * vl.prix_unitaire) AS ca,
              SUM(vl.quantite * (vl.prix_unitaire - COALESCE(vl.cout_unitaire,0))) AS marge
       FROM ventes v JOIN vente_lignes vl ON vl.vente_id = v.id
       LEFT JOIN produits p ON vl.article_type = 'produit' AND p.id = vl.article_id
       LEFT JOIN articles a ON vl.article_type = 'ingredient' AND a.id = vl.article_id
       WHERE v.activite_id = ANY($1::int[]) AND v.statut = 'confirmee'
         AND v.date_vente >= $2 AND v.date_vente <= $3
       GROUP BY 1 ORDER BY ca DESC LIMIT 8`,
      [actIds, from, to]
    );

    // ── CA par canal (direct vs prestataires) ──
    const canalRes = await pool.query(
      `SELECT CASE WHEN v.type_vente = 'directe' THEN 'Direct' ELSE COALESCE(pl.nom, 'Prestataire') END AS canal,
              COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) AS total
       FROM ventes v JOIN vente_lignes vl ON vl.vente_id = v.id
       LEFT JOIN prestataires_livraison pl ON pl.id = v.prestataire_id
       WHERE v.activite_id = ANY($1::int[]) AND v.statut = 'confirmee'
         AND v.date_vente >= $2 AND v.date_vente <= $3
       GROUP BY 1 ORDER BY total DESC`,
      [actIds, from, to]
    );

    // ── CA par catégorie de produit ──
    const catRes = await pool.query(
      `SELECT COALESCE(cp.nom, 'Sans catégorie') AS categorie,
              COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) AS total
       FROM ventes v JOIN vente_lignes vl ON vl.vente_id = v.id
       LEFT JOIN produits p ON vl.article_type = 'produit' AND p.id = vl.article_id
       LEFT JOIN categories_produit cp ON cp.id = p.categorie_produit_id
       WHERE v.activite_id = ANY($1::int[]) AND v.statut = 'confirmee'
         AND v.date_vente >= $2 AND v.date_vente <= $3
       GROUP BY 1 ORDER BY total DESC`,
      [actIds, from, to]
    );

    // ── Jours depuis le dernier inventaire ──
    const invRes = await pool.query(
      `SELECT MAX(date_inventaire) AS last FROM inventaires WHERE activite_id = ANY($1::int[])`,
      [actIds]
    );
    let joursInventaire = null;
    if (invRes.rows[0].last) {
      joursInventaire = Math.round((Date.now() - new Date(invRes.rows[0].last).getTime()) / 86400000);
    }

    // ── Produits à food cost élevé (>40%) sur la période ──
    const fcEleveRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT vl.article_id,
                SUM(vl.quantite * vl.prix_unitaire) AS ca,
                SUM(vl.quantite * COALESCE(vl.cout_unitaire,0)) AS cm
         FROM ventes v JOIN vente_lignes vl ON vl.vente_id = v.id
         WHERE v.activite_id = ANY($1::int[]) AND v.statut = 'confirmee'
           AND v.date_vente >= $2 AND v.date_vente <= $3 AND vl.article_type = 'produit'
         GROUP BY vl.article_id
         HAVING SUM(vl.quantite * vl.prix_unitaire) > 0
            AND SUM(vl.quantite * COALESCE(vl.cout_unitaire,0)) / SUM(vl.quantite * vl.prix_unitaire) > 0.40
       ) t`,
      [actIds, from, to]
    );

    res.json({
      periode: { from, to },
      kpis: {
        ca,
        ca_delta_pct: caPrev > 0 ? Math.round(((ca - caPrev) / caPrev) * 100) : null,
        cout_matiere: coutMatiere,
        food_cost_pct: ca > 0 ? Math.round((coutMatiere / ca) * 100) : null,
        marge,
        taux_marge_pct: ca > 0 ? Math.round((marge / ca) * 100) : null,
        valeur_stock: Math.round(valeurStock * 1000) / 1000,
        pertes,
        pertes_pct_ca: ca > 0 ? Math.round((pertes / ca) * 1000) / 10 : null,
        nb_ventes: nbVentes,
        panier_moyen: nbVentes > 0 ? Math.round((ca / nbVentes) * 100) / 100 : 0,
      },
      alertes: {
        stock_bas: stockBas,
        food_cost_eleve: parseInt(fcEleveRes.rows[0].cnt, 10) || 0,
        jours_inventaire: joursInventaire,
      },
      evolution: evoRes.rows.map((r) => ({ semaine: r.semaine, ca: num(r.ca), marge: num(r.marge) })),
      top_produits: topRes.rows.map((r) => ({ nom: r.nom, qte: num(r.qte), ca: num(r.ca), marge: num(r.marge) })),
      ca_par_canal: canalRes.rows.map((r) => ({ canal: r.canal, total: num(r.total) })),
      ca_par_categorie: catRes.rows.map((r) => ({ categorie: r.categorie, total: num(r.total) })),
    });
  } catch (err) {
    console.error('[getClientDashboard]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getClientDashboard };
