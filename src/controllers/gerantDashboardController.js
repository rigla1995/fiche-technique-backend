const pool = require('../config/database');

const buildMonthlyArray = (rows, key) => {
  const arr = new Array(12).fill(0);
  rows.forEach((r) => { arr[parseInt(r.mois, 10) - 1] = parseFloat(r[key]) || 0; });
  return arr;
};

/**
 * GET /api/gerant/dashboard?year=2026&month=5&typeAppro=manuel
 */
const getDashboard = async (req, res) => {
  const { id: userId, gerant_activite_id, gerant_activite_type, gerant_parent_id } = req.user;
  const clientId = gerant_parent_id || userId;
  const year  = parseInt(req.query.year, 10) || new Date().getFullYear();
  const month = req.query.month ? parseInt(req.query.month, 10) : null;
  const typeApproFilter = req.query.typeAppro || null;

  // Date range
  let dateFrom, dateTo;
  if (month) {
    const lastDay = new Date(year, month, 0).getDate();
    dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    dateTo   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else {
    dateFrom = `${year}-01-01`;
    dateTo   = `${year}-12-31`;
  }

  try {
    if (!gerant_activite_id || !gerant_activite_type) {
      return res.json({ type: null, activiteNom: null, kpis: null, monthly: null, year, month, hasVente: false });
    }

    if (gerant_activite_type === 'activite') {
      const check = await pool.query(
        `SELECT a.id, a.nom, pe.module_vente_actif
         FROM activites a
         JOIN profil_entreprise pe ON a.entreprise_id = pe.id
         WHERE a.id = $1 AND pe.client_id = $2`,
        [gerant_activite_id, clientId]
      );
      if (!check.rows.length) return res.status(403).json({ message: 'Activité non autorisée' });
      const { nom: activiteNom, module_vente_actif: hasVente } = check.rows[0];

      // Build type_appro WHERE clause
      const typeWhere = typeApproFilter ? `AND type_appro = '${typeApproFilter}'` : '';

      const [approsKpi, pertesKpi, invKpi, stockCount, approsParType,
             approsMonthly, pertesMonthly, venteKpi, venteMonthly] = await Promise.all([
        // Appros (filtered period + optional type)
        pool.query(
          `SELECT COUNT(*) AS count, COALESCE(SUM(quantite * prix_unitaire), 0) AS valeur
           FROM stock_entreprise_daily
           WHERE activite_id = $1 AND date_appro BETWEEN $2 AND $3 ${typeWhere}`,
          [gerant_activite_id, dateFrom, dateTo]
        ),
        // Pertes
        pool.query(
          `SELECT COUNT(*) AS count, COALESCE(SUM(quantite * COALESCE(prix_unitaire, 0)), 0) AS valeur
           FROM pertes
           WHERE activite_id = $1 AND date_perte BETWEEN $2 AND $3`,
          [gerant_activite_id, dateFrom, dateTo]
        ),
        // Inventaires
        pool.query(
          `SELECT COUNT(*) AS count, MAX(date_inventaire) AS last_date
           FROM inventaires
           WHERE activite_id = $1 AND date_inventaire BETWEEN $2 AND $3`,
          [gerant_activite_id, dateFrom, dateTo]
        ),
        // Articles distincts (all time)
        pool.query(
          `SELECT COUNT(DISTINCT ingredient_id) AS count FROM stock_entreprise_daily WHERE activite_id = $1`,
          [gerant_activite_id]
        ),
        // Appros breakdown by type (full period, no type filter)
        pool.query(
          `SELECT type_appro, COUNT(*) AS count, COALESCE(SUM(quantite * prix_unitaire), 0) AS valeur
           FROM stock_entreprise_daily
           WHERE activite_id = $1 AND date_appro BETWEEN $2 AND $3
           GROUP BY type_appro ORDER BY count DESC`,
          [gerant_activite_id, dateFrom, dateTo]
        ),
        // Monthly appros (12 months, full year, optional type)
        pool.query(
          `SELECT EXTRACT(MONTH FROM date_appro) AS mois,
                  COUNT(*) AS count, COALESCE(SUM(quantite * prix_unitaire), 0) AS valeur
           FROM stock_entreprise_daily
           WHERE activite_id = $1 AND date_appro BETWEEN $4 AND $5 ${typeWhere}
           GROUP BY mois ORDER BY mois`,
          [gerant_activite_id, dateFrom, dateTo, `${year}-01-01`, `${year}-12-31`]
        ),
        // Monthly pertes (12 months)
        pool.query(
          `SELECT EXTRACT(MONTH FROM date_perte) AS mois,
                  COUNT(*) AS count, COALESCE(SUM(quantite * COALESCE(prix_unitaire, 0)), 0) AS valeur
           FROM pertes
           WHERE activite_id = $1 AND date_perte BETWEEN $2 AND $3
           GROUP BY mois ORDER BY mois`,
          [gerant_activite_id, `${year}-01-01`, `${year}-12-31`]
        ),
        // Vente KPIs (if active)
        hasVente ? pool.query(
          `SELECT COUNT(v.id) AS count,
                  COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) AS ca
           FROM ventes v
           LEFT JOIN vente_lignes vl ON vl.vente_id = v.id
           WHERE v.activite_id = $1 AND v.statut = 'confirmee'
             AND v.date_vente BETWEEN $2 AND $3`,
          [gerant_activite_id, dateFrom, dateTo]
        ) : Promise.resolve({ rows: [{ count: 0, ca: 0 }] }),
        // Monthly vente (12 months)
        hasVente ? pool.query(
          `SELECT EXTRACT(MONTH FROM v.date_vente) AS mois,
                  COUNT(v.id) AS count,
                  COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) AS ca
           FROM ventes v
           LEFT JOIN vente_lignes vl ON vl.vente_id = v.id
           WHERE v.activite_id = $1 AND v.statut = 'confirmee'
             AND v.date_vente BETWEEN $2 AND $3
           GROUP BY mois ORDER BY mois`,
          [gerant_activite_id, `${year}-01-01`, `${year}-12-31`]
        ) : Promise.resolve({ rows: [] }),
      ]);

      // Build per-type map
      const approsParTypeMap = {};
      approsParType.rows.forEach((r) => {
        approsParTypeMap[r.type_appro || 'manuel'] = {
          count: parseInt(r.count, 10),
          valeur: parseFloat(r.valeur),
        };
      });

      return res.json({
        type: 'activite',
        activiteNom,
        year,
        month,
        hasVente: !!hasVente,
        kpis: {
          approsCount: parseInt(approsKpi.rows[0].count, 10),
          approsValeur: parseFloat(approsKpi.rows[0].valeur),
          approsParType: approsParTypeMap,
          pertesCount: parseInt(pertesKpi.rows[0].count, 10),
          pertesValeur: parseFloat(pertesKpi.rows[0].valeur),
          inventairesCount: parseInt(invKpi.rows[0].count, 10),
          dernierInventaire: invKpi.rows[0].last_date || null,
          articlesCount: parseInt(stockCount.rows[0].count, 10),
          venteCount: hasVente ? parseInt(venteKpi.rows[0].count, 10) : null,
          venteCA: hasVente ? parseFloat(venteKpi.rows[0].ca) : null,
        },
        monthly: {
          approsCount: buildMonthlyArray(approsMonthly.rows, 'count'),
          approsValeur: buildMonthlyArray(approsMonthly.rows, 'valeur'),
          pertesCount: buildMonthlyArray(pertesMonthly.rows, 'count'),
          pertesValeur: buildMonthlyArray(pertesMonthly.rows, 'valeur'),
          venteCount: buildMonthlyArray(venteMonthly.rows, 'count'),
          venteCA: buildMonthlyArray(venteMonthly.rows, 'ca'),
        },
      });
    }

    if (gerant_activite_type === 'labo') {
      const check = await pool.query(
        `SELECT l.id, l.nom FROM labos l
         JOIN profil_entreprise pe ON l.entreprise_id = pe.id
         WHERE l.id = $1 AND pe.client_id = $2`,
        [gerant_activite_id, clientId]
      );
      if (!check.rows.length) return res.status(403).json({ message: 'Labo non autorisé' });
      const activiteNom = check.rows[0].nom;

      const typeWhere = typeApproFilter ? `AND type_appro = '${typeApproFilter}'` : '';

      const [approsKpi, pertesKpi, invKpi, stockCount, approsParType, approsMonthly, pertesMonthly] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS count, COALESCE(SUM(quantite * prix_unitaire), 0) AS valeur
           FROM stock_labo_daily
           WHERE labo_id = $1 AND date_appro BETWEEN $2 AND $3 ${typeWhere}`,
          [gerant_activite_id, dateFrom, dateTo]
        ),
        pool.query(
          `SELECT COUNT(*) AS count
           FROM labo_pertes
           WHERE labo_id = $1 AND date_perte BETWEEN $2 AND $3`,
          [gerant_activite_id, dateFrom, dateTo]
        ),
        pool.query(
          `SELECT COUNT(*) AS count, MAX(date_inventaire) AS last_date
           FROM inventaires
           WHERE labo_id = $1 AND date_inventaire BETWEEN $2 AND $3`,
          [gerant_activite_id, dateFrom, dateTo]
        ),
        pool.query(
          `SELECT COUNT(DISTINCT ingredient_id) AS count FROM stock_labo_daily WHERE labo_id = $1`,
          [gerant_activite_id]
        ),
        pool.query(
          `SELECT type_appro, COUNT(*) AS count, COALESCE(SUM(quantite * prix_unitaire), 0) AS valeur
           FROM stock_labo_daily
           WHERE labo_id = $1 AND date_appro BETWEEN $2 AND $3
           GROUP BY type_appro ORDER BY count DESC`,
          [gerant_activite_id, dateFrom, dateTo]
        ),
        pool.query(
          `SELECT EXTRACT(MONTH FROM date_appro) AS mois,
                  COUNT(*) AS count, COALESCE(SUM(quantite * prix_unitaire), 0) AS valeur
           FROM stock_labo_daily
           WHERE labo_id = $1 AND date_appro BETWEEN $2 AND $3 ${typeWhere}
           GROUP BY mois ORDER BY mois`,
          [gerant_activite_id, `${year}-01-01`, `${year}-12-31`]
        ),
        pool.query(
          `SELECT EXTRACT(MONTH FROM date_perte) AS mois, COUNT(*) AS count
           FROM labo_pertes
           WHERE labo_id = $1 AND date_perte BETWEEN $2 AND $3
           GROUP BY mois ORDER BY mois`,
          [gerant_activite_id, `${year}-01-01`, `${year}-12-31`]
        ),
      ]);

      const approsParTypeMap = {};
      approsParType.rows.forEach((r) => {
        approsParTypeMap[r.type_appro || 'manuel'] = {
          count: parseInt(r.count, 10),
          valeur: parseFloat(r.valeur),
        };
      });

      return res.json({
        type: 'labo',
        activiteNom,
        year,
        month,
        hasVente: false,
        kpis: {
          approsCount: parseInt(approsKpi.rows[0].count, 10),
          approsValeur: parseFloat(approsKpi.rows[0].valeur),
          approsParType: approsParTypeMap,
          pertesCount: parseInt(pertesKpi.rows[0].count, 10),
          pertesValeur: 0,
          inventairesCount: parseInt(invKpi.rows[0].count, 10),
          dernierInventaire: invKpi.rows[0].last_date || null,
          articlesCount: parseInt(stockCount.rows[0].count, 10),
          venteCount: null,
          venteCA: null,
        },
        monthly: {
          approsCount: buildMonthlyArray(approsMonthly.rows, 'count'),
          approsValeur: buildMonthlyArray(approsMonthly.rows, 'valeur'),
          pertesCount: buildMonthlyArray(pertesMonthly.rows, 'count'),
          pertesValeur: new Array(12).fill(0),
          venteCount: new Array(12).fill(0),
          venteCA: new Array(12).fill(0),
        },
      });
    }

    return res.json({ type: null, activiteNom: null, kpis: null, monthly: null, year, month, hasVente: false });
  } catch (err) {
    console.error('gerantDashboard error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * GET /api/gerant/abonnement
 */
const getAbonnementResume = async (req, res) => {
  const { gerant_parent_id, id: userId } = req.user;
  const clientId = gerant_parent_id || userId;
  try {
    const result = await pool.query(
      `SELECT a.mode_compte, a.date_debut, a.prolongation_jours,
              ac.nb_activites, ac.nb_labos, ac.nb_gerants, u.nom AS client_nom
       FROM abonnements a
       LEFT JOIN abonnement_config ac ON ac.abonnement_id = a.id
       LEFT JOIN utilisateurs u ON u.id = a.client_id
       WHERE a.client_id = $1`,
      [clientId]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'Abonnement introuvable' });
    const row = result.rows[0];
    return res.json({
      modeCompte: row.mode_compte,
      dateDebut: row.date_debut,
      prolongationJours: row.prolongation_jours,
      nbActivites: row.nb_activites,
      nbLabos: row.nb_labos,
      nbGerants: row.nb_gerants,
      clientNom: row.client_nom,
    });
  } catch (err) {
    console.error('gerantAbonnement error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getDashboard, getAbonnementResume };
