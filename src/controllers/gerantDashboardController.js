const pool = require('../config/database');

/**
 * GET /api/gerant/dashboard
 * KPIs for the gérant's assigned activité or labo (current month + totals).
 */
const getDashboard = async (req, res) => {
  const { id: userId, gerant_activite_id, gerant_activite_type, gerant_parent_id } = req.user;
  const clientId = gerant_parent_id || userId;

  try {
    if (!gerant_activite_id || !gerant_activite_type) {
      return res.json({
        type: null,
        activiteNom: null,
        kpis: null,
      });
    }

    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    if (gerant_activite_type === 'activite') {
      // Verify gerant owns this activite via parent enterprise
      const check = await pool.query(
        `SELECT a.id, a.nom FROM activites a
         JOIN profil_entreprise pe ON a.entreprise_id = pe.id
         WHERE a.id = $1 AND pe.client_id = $2`,
        [gerant_activite_id, clientId]
      );
      if (!check.rows.length) {
        return res.status(403).json({ message: 'Activité non autorisée' });
      }
      const activiteNom = check.rows[0].nom;

      const [appros, pertes, lastInv, stockCount] = await Promise.all([
        // Appros this month
        pool.query(
          `SELECT COUNT(*) AS count, COALESCE(SUM(quantite * prix_unitaire), 0) AS valeur
           FROM stock_entreprise_daily
           WHERE activite_id = $1 AND date_appro >= $2 AND date_appro <= $3`,
          [gerant_activite_id, firstOfMonth, today]
        ),
        // Pertes this month
        pool.query(
          `SELECT COUNT(*) AS count, COALESCE(SUM(quantite * COALESCE(prix_unitaire, 0)), 0) AS valeur
           FROM pertes
           WHERE activite_id = $1 AND date_perte >= $2 AND date_perte <= $3`,
          [gerant_activite_id, firstOfMonth, today]
        ),
        // Last inventory date
        pool.query(
          `SELECT MAX(date_inventaire) AS last_date
           FROM inventaires
           WHERE activite_id = $1`,
          [gerant_activite_id]
        ),
        // Distinct ingredients in stock (ever)
        pool.query(
          `SELECT COUNT(DISTINCT ingredient_id) AS count
           FROM stock_entreprise_daily
           WHERE activite_id = $1`,
          [gerant_activite_id]
        ),
      ]);

      return res.json({
        type: 'activite',
        activiteNom,
        kpis: {
          approsCount: parseInt(appros.rows[0].count, 10),
          approsValeur: parseFloat(appros.rows[0].valeur),
          pertesCount: parseInt(pertes.rows[0].count, 10),
          pertesValeur: parseFloat(pertes.rows[0].valeur),
          dernierInventaire: lastInv.rows[0].last_date || null,
          ingredientsCount: parseInt(stockCount.rows[0].count, 10),
        },
      });
    }

    if (gerant_activite_type === 'labo') {
      // Verify gerant owns this labo via parent enterprise
      const check = await pool.query(
        `SELECT l.id, l.nom FROM labos l
         JOIN profil_entreprise pe ON l.entreprise_id = pe.id
         WHERE l.id = $1 AND pe.client_id = $2`,
        [gerant_activite_id, clientId]
      );
      if (!check.rows.length) {
        return res.status(403).json({ message: 'Labo non autorisé' });
      }
      const activiteNom = check.rows[0].nom;

      const [appros, pertes, lastInv, stockCount] = await Promise.all([
        // Appros labo this month
        pool.query(
          `SELECT COUNT(*) AS count, COALESCE(SUM(quantite * prix_unitaire), 0) AS valeur
           FROM stock_labo_daily
           WHERE labo_id = $1 AND date_appro >= $2 AND date_appro <= $3`,
          [gerant_activite_id, firstOfMonth, today]
        ),
        // Pertes labo this month
        pool.query(
          `SELECT COUNT(*) AS count
           FROM labo_pertes
           WHERE labo_id = $1 AND date_perte >= $2 AND date_perte <= $3`,
          [gerant_activite_id, firstOfMonth, today]
        ),
        // Last inventory date for labo
        pool.query(
          `SELECT MAX(date_inventaire) AS last_date
           FROM inventaires
           WHERE labo_id = $1`,
          [gerant_activite_id]
        ),
        // Distinct ingredients in labo stock
        pool.query(
          `SELECT COUNT(DISTINCT ingredient_id) AS count
           FROM stock_labo_daily
           WHERE labo_id = $1`,
          [gerant_activite_id]
        ),
      ]);

      return res.json({
        type: 'labo',
        activiteNom,
        kpis: {
          approsCount: parseInt(appros.rows[0].count, 10),
          approsValeur: parseFloat(appros.rows[0].valeur),
          pertesCount: parseInt(pertes.rows[0].count, 10),
          pertesValeur: 0, // labo_pertes doesn't store prix_unitaire
          dernierInventaire: lastInv.rows[0].last_date || null,
          ingredientsCount: parseInt(stockCount.rows[0].count, 10),
        },
      });
    }

    return res.json({ type: null, activiteNom: null, kpis: null });
  } catch (err) {
    console.error('gerantDashboard error:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * GET /api/gerant/abonnement
 * Read-only summary of the parent client's subscription for a gérant.
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

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Abonnement introuvable' });
    }

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
