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

const getLaboDashboard = async (req, res) => {
  try {
    const laboId = req.query.laboId ? Number(req.query.laboId) : null;
    if (!laboId) return res.status(400).json({ message: 'laboId requis' });
    // Vérifier la propriété / le périmètre.
    const clientId = req.user.gerant_parent_id || req.user.id;
    const own = await pool.query(
      `SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE l.id = $1 AND pe.client_id = $2`,
      [laboId, clientId]
    );
    if (own.rows.length === 0) return res.status(404).json({ message: 'Labo introuvable' });
    if (req.user.role === 'gerant' && !(req.user.gerantLaboIds || []).includes(laboId)) {
      return res.status(403).json({ message: 'Accès non autorisé à ce labo' });
    }
    const { from, to } = resolvePeriode(req.query.from, req.query.to);

    // Valeur du stock labo (dernier prix par article)
    const stockRes = await pool.query(
      `SELECT sld.ingredient_id, SUM(sld.quantite) AS quantite,
              (SELECT s2.prix_unitaire FROM stock_labo_daily s2
               WHERE s2.labo_id = sld.labo_id AND s2.ingredient_id = sld.ingredient_id
                 AND s2.prix_unitaire IS NOT NULL ORDER BY s2.date_appro DESC LIMIT 1) AS prix
       FROM stock_labo_daily sld WHERE sld.labo_id = $1
       GROUP BY sld.labo_id, sld.ingredient_id`,
      [laboId]
    );
    let valeurStock = 0;
    for (const r of stockRes.rows) valeurStock += num(r.quantite) * num(r.prix);

    const approsRes = await pool.query(
      `SELECT COALESCE(SUM(quantite * COALESCE(prix_unitaire,0)),0) AS valeur, COUNT(*) AS nb
       FROM stock_labo_daily WHERE labo_id = $1 AND date_appro >= $2 AND date_appro <= $3`,
      [laboId, from, to]
    );
    const pertesRes = await pool.query(
      `SELECT COALESCE(SUM(quantite * COALESCE(prix_unitaire,0)),0) AS valeur
       FROM labo_pertes WHERE labo_id = $1 AND date_perte >= $2 AND date_perte <= $3`,
      [laboId, from, to]
    );
    const transRes = await pool.query(
      `SELECT COALESCE(SUM(quantite * COALESCE(prix_unitaire,0)),0) AS valeur, COUNT(*) AS nb
       FROM labo_transfers WHERE labo_id = $1 AND date_transfert >= $2 AND date_transfert <= $3`,
      [laboId, from, to]
    );
    // Top articles transférés (par valeur)
    const topTransRes = await pool.query(
      `SELECT i.nom, SUM(lt.quantite) AS qte, SUM(lt.quantite * COALESCE(lt.prix_unitaire,0)) AS valeur
       FROM labo_transfers lt JOIN articles i ON i.id = lt.ingredient_id
       WHERE lt.labo_id = $1 AND lt.date_transfert >= $2 AND lt.date_transfert <= $3
       GROUP BY i.nom ORDER BY valeur DESC LIMIT 8`,
      [laboId, from, to]
    );
    // Transferts par activité destinataire
    const parActiviteRes = await pool.query(
      `SELECT a.nom AS activite, COALESCE(SUM(lt.quantite * COALESCE(lt.prix_unitaire,0)),0) AS valeur
       FROM labo_transfers lt JOIN activites a ON a.id = lt.activite_id
       WHERE lt.labo_id = $1 AND lt.date_transfert >= $2 AND lt.date_transfert <= $3
       GROUP BY a.nom ORDER BY valeur DESC`,
      [laboId, from, to]
    );

    res.json({
      periode: { from, to },
      kpis: {
        valeur_stock: Math.round(valeurStock * 1000) / 1000,
        appros: num(approsRes.rows[0].valeur),
        nb_appros: parseInt(approsRes.rows[0].nb, 10) || 0,
        pertes: num(pertesRes.rows[0].valeur),
        transferts: num(transRes.rows[0].valeur),
        nb_transferts: parseInt(transRes.rows[0].nb, 10) || 0,
      },
      top_transferts: topTransRes.rows.map((r) => ({ nom: r.nom, qte: num(r.qte), valeur: num(r.valeur) })),
      transferts_par_activite: parActiviteRes.rows.map((r) => ({ activite: r.activite, valeur: num(r.valeur) })),
    });
  } catch (err) {
    console.error('[getLaboDashboard]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getRapportVentes = async (req, res) => {
  try {
    const { from, to } = resolvePeriode(req.query.from, req.query.to);
    const actIds = await resolveScopeActivites(req);
    if (actIds.length === 0) return res.json({ periode: { from, to }, vide: true });

    const canal = req.query.canal || null; // 'directe' | 'prestataire' | null
    const cond = [`v.activite_id = ANY($1::int[])`, `v.statut = 'confirmee'`, `v.date_vente >= $2`, `v.date_vente <= $3`];
    const params = [actIds, from, to];
    if (canal === 'directe') cond.push(`v.type_vente = 'directe'`);
    else if (canal === 'prestataire') cond.push(`v.type_vente = 'prestataire'`);
    if (req.query.categorieId) {
      params.push(Number(req.query.categorieId));
      cond.push(`EXISTS (SELECT 1 FROM produits pc WHERE pc.id = vl.article_id AND vl.article_type = 'produit' AND pc.categorie_produit_id = $${params.length})`);
    }
    const where = cond.join(' AND ');

    const kpiRes = await pool.query(
      `SELECT COALESCE(SUM(vl.quantite * vl.prix_unitaire),0) AS ca,
              COALESCE(SUM(vl.quantite * COALESCE(vl.cout_unitaire,0)),0) AS cm,
              COUNT(DISTINCT v.id) AS nb
       FROM ventes v JOIN vente_lignes vl ON vl.vente_id = v.id WHERE ${where}`,
      params
    );
    const ca = num(kpiRes.rows[0].ca);
    const cm = num(kpiRes.rows[0].cm);
    const nb = parseInt(kpiRes.rows[0].nb, 10) || 0;

    const prodRes = await pool.query(
      `SELECT COALESCE(p.nom, a.nom, '—') AS nom,
              COALESCE(p.is_supplement, FALSE) AS is_supplement,
              COALESCE(p.origine, '') AS origine,
              vl.article_type,
              SUM(vl.quantite) AS qte,
              SUM(vl.quantite * vl.prix_unitaire) AS ca,
              SUM(vl.quantite * COALESCE(vl.cout_unitaire,0)) AS cm
       FROM ventes v JOIN vente_lignes vl ON vl.vente_id = v.id
       LEFT JOIN produits p ON vl.article_type = 'produit' AND p.id = vl.article_id
       LEFT JOIN articles a ON vl.article_type = 'ingredient' AND a.id = vl.article_id
       WHERE ${where}
       GROUP BY 1,2,3,4 ORDER BY ca DESC`,
      params
    );
    const canalRes = await pool.query(
      `SELECT CASE WHEN v.type_vente='directe' THEN 'Direct' ELSE COALESCE(pl.nom,'Prestataire') END AS canal,
              COALESCE(SUM(vl.quantite * vl.prix_unitaire),0) AS total
       FROM ventes v JOIN vente_lignes vl ON vl.vente_id = v.id
       LEFT JOIN prestataires_livraison pl ON pl.id = v.prestataire_id
       WHERE ${where} GROUP BY 1 ORDER BY total DESC`,
      params
    );

    res.json({
      periode: { from, to },
      kpis: {
        ca, cout_matiere: cm, marge: ca - cm,
        food_cost_pct: ca > 0 ? Math.round((cm / ca) * 100) : null,
        taux_marge_pct: ca > 0 ? Math.round(((ca - cm) / ca) * 100) : null,
        nb_ventes: nb, panier_moyen: nb > 0 ? Math.round((ca / nb) * 100) / 100 : 0,
      },
      produits: prodRes.rows.map((r) => {
        const pca = num(r.ca); const pcm = num(r.cm);
        return {
          nom: r.nom, type: (r.article_type === 'ingredient' || r.origine === 'labo') ? 'valorise' : (r.is_supplement ? 'supplement' : 'produit'),
          qte: num(r.qte), ca: pca, marge: pca - pcm,
          food_cost_pct: pca > 0 ? Math.round((pcm / pca) * 100) : null,
        };
      }),
      ca_par_canal: canalRes.rows.map((r) => ({ canal: r.canal, total: num(r.total) })),
    });
  } catch (err) {
    console.error('[getRapportVentes]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getActivitesDashboard = async (req, res) => {
  try {
    const { from, to } = resolvePeriode(req.query.from, req.query.to);
    const actIds = await resolveScopeActivites(req);
    if (actIds.length === 0) return res.json({ periode: { from, to }, vide: true });
    const catId = req.query.categorieId ? Number(req.query.categorieId) : null;
    const catCond = catId ? ` AND i.categorie_id = ${catId}` : '';

    // Stock : valeur + articles en alerte (sous seuil) + valeur par catégorie
    const stockRes = await pool.query(
      `SELECT i.nom AS article, COALESCE(c.nom,'Sans catégorie') AS categorie, ais.seuil_min,
              SUM(sed.quantite) AS quantite,
              (SELECT s2.prix_unitaire FROM stock_entreprise_daily s2
               WHERE s2.activite_id = sed.activite_id AND s2.ingredient_id = sed.ingredient_id
                 AND s2.prix_unitaire IS NOT NULL ORDER BY s2.date_appro DESC LIMIT 1) AS prix
       FROM stock_entreprise_daily sed
       JOIN articles i ON i.id = sed.ingredient_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN activite_ingredient_selections ais ON ais.activite_id = sed.activite_id AND ais.ingredient_id = sed.ingredient_id
       WHERE sed.activite_id = ANY($1::int[])${catCond}
       GROUP BY sed.activite_id, sed.ingredient_id, i.nom, c.nom, ais.seuil_min`,
      [actIds]
    );
    let valeurStock = 0; const stockParCat = {}; const alertes = [];
    for (const r of stockRes.rows) {
      const q = num(r.quantite); const v = q * num(r.prix);
      valeurStock += v;
      stockParCat[r.categorie] = (stockParCat[r.categorie] || 0) + v;
      if (r.seuil_min != null && q <= num(r.seuil_min)) alertes.push({ article: r.article, categorie: r.categorie, quantite: q, seuil: num(r.seuil_min) });
    }

    // Achats (appros) sur la période + par catégorie
    const approRes = await pool.query(
      `SELECT COALESCE(c.nom,'Sans catégorie') AS categorie,
              COALESCE(SUM(sed.quantite * COALESCE(sed.prix_unitaire,0)),0) AS valeur, COUNT(*) AS nb
       FROM stock_entreprise_daily sed JOIN articles i ON i.id = sed.ingredient_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       WHERE sed.activite_id = ANY($1::int[]) AND sed.date_appro >= $2 AND sed.date_appro <= $3${catCond}
       GROUP BY 1 ORDER BY valeur DESC`,
      [actIds, from, to]
    );
    const achats = approRes.rows.reduce((s, r) => s + num(r.valeur), 0);

    // Pertes sur la période : total + par type + par catégorie + top articles
    const pertesRes = await pool.query(
      `SELECT p.type_perte, COALESCE(c.nom,'Sans catégorie') AS categorie, i.nom AS article,
              COALESCE(SUM(p.quantite * COALESCE(p.prix_unitaire,0)),0) AS valeur
       FROM pertes p JOIN articles i ON i.id = p.ingredient_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       WHERE p.activite_id = ANY($1::int[]) AND p.date_perte >= $2 AND p.date_perte <= $3${catCond}
       GROUP BY p.type_perte, c.nom, i.nom`,
      [actIds, from, to]
    );
    let pertesTotal = 0; const pertesParType = {}; const pertesParCat = {}; const pertesArt = {};
    for (const r of pertesRes.rows) {
      const v = num(r.valeur); pertesTotal += v;
      pertesParType[r.type_perte] = (pertesParType[r.type_perte] || 0) + v;
      pertesParCat[r.categorie] = (pertesParCat[r.categorie] || 0) + v;
      pertesArt[r.article] = (pertesArt[r.article] || 0) + v;
    }

    const toArr = (obj, kName) => Object.entries(obj).map(([k, v]) => ({ [kName]: k, valeur: Math.round(v * 1000) / 1000 })).sort((a, b) => b.valeur - a.valeur);

    res.json({
      periode: { from, to },
      kpis: {
        valeur_stock: Math.round(valeurStock * 1000) / 1000,
        achats,
        nb_appros: approRes.rows.reduce((s, r) => s + (parseInt(r.nb, 10) || 0), 0),
        pertes: Math.round(pertesTotal * 1000) / 1000,
        stock_bas: alertes.length,
      },
      stock_par_categorie: toArr(stockParCat, 'categorie'),
      achats_par_categorie: approRes.rows.map((r) => ({ categorie: r.categorie, valeur: num(r.valeur) })),
      pertes_par_type: toArr(pertesParType, 'type'),
      pertes_par_categorie: toArr(pertesParCat, 'categorie'),
      top_pertes: toArr(pertesArt, 'article').slice(0, 8),
      alertes_stock: alertes.sort((a, b) => a.quantite - b.quantite).slice(0, 15),
    });
  } catch (err) {
    console.error('[getActivitesDashboard]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getClientDashboard, getLaboDashboard, getRapportVentes, getActivitesDashboard };
