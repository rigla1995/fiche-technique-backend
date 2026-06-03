const pool = require('../config/database');

/**
 * GET /api/gerant/dashboard?year=2026
 * Year-based KPIs + monthly breakdown for the gérant's activité or labo.
 */
const getDashboard = async (req, res) => {
  const { id: userId, gerant_activite_id, gerant_activite_type, gerant_parent_id } = req.user;
  const clientId = gerant_parent_id || userId;
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  try {
    if (!gerant_activite_id || !gerant_activite_type) {
      return res.json({ type: null, activiteNom: null, kpis: null, monthly: null, year });
    }

    const buildMonthlyArray = (rows, key) => {
      const arr = new Array(12).fill(0);
      rows.forEach((r) => { arr[parseInt(r.mois, 10) - 1] = parseFloat(r[key]) || 0; });
      return arr;
    };

    if (gerant_activite_type === 'activite') {
      const check = await pool.query(
        `SELECT a.id, a.nom FROM activites a
         JOIN profil_entreprise pe ON a.entreprise_id = pe.id
         WHERE a.id = $1 AND pe.client_id = $2`,
        [gerant_activite_id, clientId]
      );
      if (!check.rows.length) return res.status(403).json({ message: 'Activité non autorisée' });
      const activiteNom = check.rows[0].nom;

      const [approsKpi, pertesKpi, invKpi, stockCount, approsMonthly, pertesMonthly] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS count, COALESCE(SUM(quantite * prix_unitaire), 0) AS valeur
           FROM stock_entreprise_daily
           WHERE activite_id = $1 AND date_appro BETWEEN $2 AND $3`,
          [gerant_activite_id, yearStart, yearEnd]
        ),
        pool.query(
          `SELECT COUNT(*) AS count, COALESCE(SUM(quantite * COALESCE(prix_unitaire, 0)), 0) AS valeur
           FROM pertes
           WHERE activite_id = $1 AND date_perte BETWEEN $2 AND $3`,
          [gerant_activite_id, yearStart, yearEnd]
        ),
        pool.query(
          `SELECT COUNT(*) AS count, MAX(date_inventaire) AS last_date
           FROM inventaires
           WHERE activite_id = $1 AND date_inventaire BETWEEN $2 AND $3`,
          [gerant_activite_id, yearStart, yearEnd]
        ),
        pool.query(
          `SELECT COUNT(DISTINCT ingredient_id) AS count
           FROM stock_entreprise_daily WHERE activite_id = $1`,
          [gerant_activite_id]
        ),
        pool.query(
          `SELECT EXTRACT(MONTH FROM date_appro) AS mois,
                  COUNT(*) AS count,
                  COALESCE(SUM(quantite * prix_unitaire), 0) AS valeur
           FROM stock_entreprise_daily
           WHERE activite_id = $1 AND date_appro BETWEEN $2 AND $3
           GROUP BY mois ORDER BY mois`,
          [gerant_activite_id, yearStart, yearEnd]
        ),
        pool.query(
          `SELECT EXTRACT(MONTH FROM date_perte) AS mois,
                  COUNT(*) AS count,
                  COALESCE(SUM(quantite * COALESCE(prix_unitaire, 0)), 0) AS valeur
           FROM pertes
           WHERE activite_id = $1 AND date_perte BETWEEN $2 AND $3
           GROUP BY mois ORDER BY mois`,
          [gerant_activite_id, yearStart, yearEnd]
        ),
      ]);

      return res.json({
        type: 'activite',
        activiteNom,
        year,
        kpis: {
          approsCount: parseInt(approsKpi.rows[0].count, 10),
          approsValeur: parseFloat(approsKpi.rows[0].valeur),
          pertesCount: parseInt(pertesKpi.rows[0].count, 10),
          pertesValeur: parseFloat(pertesKpi.rows[0].valeur),
          inventairesCount: parseInt(invKpi.rows[0].count, 10),
          dernierInventaire: invKpi.rows[0].last_date || null,
          articlesCount: parseInt(stockCount.rows[0].count, 10),
        },
        monthly: {
          approsCount: buildMonthlyArray(approsMonthly.rows, 'count'),
          approsValeur: buildMonthlyArray(approsMonthly.rows, 'valeur'),
          pertesCount: buildMonthlyArray(pertesMonthly.rows, 'count'),
          pertesValeur: buildMonthlyArray(pertesMonthly.rows, 'valeur'),
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

      const [approsKpi, pertesKpi, invKpi, stockCount, approsMonthly, pertesMonthly] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS count, COALESCE(SUM(quantite * prix_unitaire), 0) AS valeur
           FROM stock_labo_daily
           WHERE labo_id = $1 AND date_appro BETWEEN $2 AND $3`,
          [gerant_activite_id, yearStart, yearEnd]
        ),
        pool.query(
          `SELECT COUNT(*) AS count
           FROM labo_pertes
           WHERE labo_id = $1 AND date_perte BETWEEN $2 AND $3`,
          [gerant_activite_id, yearStart, yearEnd]
        ),
        pool.query(
          `SELECT COUNT(*) AS count, MAX(date_inventaire) AS last_date
           FROM inventaires
           WHERE labo_id = $1 AND date_inventaire BETWEEN $2 AND $3`,
          [gerant_activite_id, yearStart, yearEnd]
        ),
        pool.query(
          `SELECT COUNT(DISTINCT ingredient_id) AS count
           FROM stock_labo_daily WHERE labo_id = $1`,
          [gerant_activite_id]
        ),
        pool.query(
          `SELECT EXTRACT(MONTH FROM date_appro) AS mois,
                  COUNT(*) AS count,
                  COALESCE(SUM(quantite * prix_unitaire), 0) AS valeur
           FROM stock_labo_daily
           WHERE labo_id = $1 AND date_appro BETWEEN $2 AND $3
           GROUP BY mois ORDER BY mois`,
          [gerant_activite_id, yearStart, yearEnd]
        ),
        pool.query(
          `SELECT EXTRACT(MONTH FROM date_perte) AS mois, COUNT(*) AS count
           FROM labo_pertes
           WHERE labo_id = $1 AND date_perte BETWEEN $2 AND $3
           GROUP BY mois ORDER BY mois`,
          [gerant_activite_id, yearStart, yearEnd]
        ),
      ]);

      return res.json({
        type: 'labo',
        activiteNom,
        year,
        kpis: {
          approsCount: parseInt(approsKpi.rows[0].count, 10),
          approsValeur: parseFloat(approsKpi.rows[0].valeur),
          pertesCount: parseInt(pertesKpi.rows[0].count, 10),
          pertesValeur: 0,
          inventairesCount: parseInt(invKpi.rows[0].count, 10),
          dernierInventaire: invKpi.rows[0].last_date || null,
          articlesCount: parseInt(stockCount.rows[0].count, 10),
        },
        monthly: {
          approsCount: buildMonthlyArray(approsMonthly.rows, 'count'),
          approsValeur: buildMonthlyArray(approsMonthly.rows, 'valeur'),
          pertesCount: buildMonthlyArray(pertesMonthly.rows, 'count'),
          pertesValeur: new Array(12).fill(0),
        },
      });
    }

    return res.json({ type: null, activiteNom: null, kpis: null, monthly: null, year });
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
              ac.nb_activites, ac.nb_labos, ac.nb_gerants,
              u.nom AS client_nom
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
