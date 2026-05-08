const pool = require('../config/database');

const getRapportsStats = async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const [
      clientsRes,
      aboRes,
      paiementsMonthRes,
      paiementsTrendRes,
      demandesRes,
      newClientsRes,
    ] = await Promise.all([
      // Client counts by type + activation status
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE role = 'client') AS total,
          COUNT(*) FILTER (WHERE role = 'client' AND compte_type = 'independant') AS indep,
          COUNT(*) FILTER (WHERE role = 'client' AND compte_type = 'entreprise') AS entreprise,
          COUNT(*) FILTER (WHERE role = 'client' AND activated_at IS NOT NULL) AS activated,
          COUNT(*) FILTER (WHERE role = 'client' AND activated_at IS NULL AND mot_de_passe IS NULL) AS pending_invite
        FROM utilisateurs
      `),

      // Abonnements by mode
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE mode_compte = 'actif') AS actif,
          COUNT(*) FILTER (WHERE mode_compte = 'read_only') AS read_only,
          COUNT(*) FILTER (WHERE mode_compte = 'desactive') AS desactive,
          COUNT(*) FILTER (WHERE mode_compte = 'archive') AS archive
        FROM abonnements
      `),

      // Paiements current month breakdown
      pool.query(`
        SELECT
          COALESCE(SUM(montant_dt) FILTER (WHERE statut = 'payé'), 0) AS paye_dt,
          COALESCE(SUM(montant_dt) FILTER (WHERE statut = 'impayé'), 0) AS impaye_dt,
          COALESCE(SUM(montant_dt) FILTER (WHERE statut = 'en_attente'), 0) AS en_attente_dt,
          COALESCE(SUM(montant_dt) FILTER (WHERE statut = 'remisé'), 0) AS remise_dt,
          COUNT(*) FILTER (WHERE statut = 'payé') AS paye_count,
          COUNT(*) FILTER (WHERE statut = 'impayé') AS impaye_count,
          COUNT(*) FILTER (WHERE statut = 'en_attente') AS en_attente_count
        FROM paiements
        WHERE mois = $1
      `, [currentMonth]),

      // Monthly revenue trend: last 6 months
      pool.query(`
        SELECT
          TO_CHAR(mois, 'YYYY-MM') AS mois,
          COALESCE(SUM(montant_dt) FILTER (WHERE statut = 'payé'), 0) AS paye_dt,
          COALESCE(SUM(montant_dt) FILTER (WHERE statut = 'impayé'), 0) AS impaye_dt,
          COALESCE(SUM(montant_dt), 0) AS total_dt
        FROM paiements
        WHERE mois >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
        GROUP BY mois
        ORDER BY mois ASC
      `),

      // Demandes pending
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE type_demande = 'gerant_sup') AS gerant_sup,
          COUNT(*) FILTER (WHERE type_demande = 'labo_sup') AS labo_sup
        FROM demandes
        WHERE statut = 'en_attente'
      `),

      // New clients per month: last 6 months
      pool.query(`
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS mois,
          COUNT(*) AS count
        FROM utilisateurs
        WHERE role = 'client'
          AND created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY 1 ASC
      `),
    ]);

    res.json({
      clients: {
        total: parseInt(clientsRes.rows[0].total),
        indep: parseInt(clientsRes.rows[0].indep),
        entreprise: parseInt(clientsRes.rows[0].entreprise),
        activated: parseInt(clientsRes.rows[0].activated),
        pendingInvite: parseInt(clientsRes.rows[0].pending_invite),
      },
      abonnements: {
        total: parseInt(aboRes.rows[0].total),
        actif: parseInt(aboRes.rows[0].actif),
        readOnly: parseInt(aboRes.rows[0].read_only),
        desactive: parseInt(aboRes.rows[0].desactive),
        archive: parseInt(aboRes.rows[0].archive),
      },
      paiementsMonth: {
        payeDt: parseFloat(paiementsMonthRes.rows[0].paye_dt),
        impayeDt: parseFloat(paiementsMonthRes.rows[0].impaye_dt),
        enAttenteDt: parseFloat(paiementsMonthRes.rows[0].en_attente_dt),
        remiseDt: parseFloat(paiementsMonthRes.rows[0].remise_dt),
        payeCount: parseInt(paiementsMonthRes.rows[0].paye_count),
        impayeCount: parseInt(paiementsMonthRes.rows[0].impaye_count),
        enAttenteCount: parseInt(paiementsMonthRes.rows[0].en_attente_count),
      },
      revenueTrend: paiementsTrendRes.rows.map((r) => ({
        mois: r.mois,
        payeDt: parseFloat(r.paye_dt),
        impayeDt: parseFloat(r.impaye_dt),
        totalDt: parseFloat(r.total_dt),
      })),
      newClientsTrend: newClientsRes.rows.map((r) => ({
        mois: r.mois,
        count: parseInt(r.count),
      })),
      demandes: {
        total: parseInt(demandesRes.rows[0].total),
        gerantSup: parseInt(demandesRes.rows[0].gerant_sup),
        laboSup: parseInt(demandesRes.rows[0].labo_sup),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { getRapportsStats };
