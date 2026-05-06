const pool = require('../config/database');

// ── Helpers ─────────────────────────────────────────────────────────────────

const mapAbonnement = (row) => ({
  id: row.id,
  clientId: row.client_id,
  clientNom: row.client_nom,
  clientEmail: row.client_email,
  compteType: row.compte_type,
  statutOnboarding: row.statut_onboarding,
  montantOnboarding: row.montant_onboarding,
  dateDebut: row.date_debut,
  modeCompte: row.mode_compte,
  prolongationJours: row.prolongation_jours,
  notes: row.notes,
  archiveDate: row.archive_date,
  suppressionCascadeDate: row.suppression_cascade_date,
  hasActivePromo: row.has_active_promo ?? false,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPromotion = (row) => ({
  id: row.id,
  abonnementId: row.abonnement_id,
  type: row.type,
  appliesTo: row.applies_to,
  discountOnboarding: row.discount_onboarding,
  discountMensualite: row.discount_mensualite,
  fixedOnboarding: row.fixed_onboarding,
  fixedMensualite: row.fixed_mensualite,
  dateDebut: row.date_debut,
  monthsDuration: row.months_duration,
  dateFin: row.date_fin,
  notes: row.notes,
  createdAt: row.created_at,
  isActive: row.is_active ?? null,
});

// Returns the active promo for an abonnement on a given date (ISO string)
const getActivePromo = async (abonnementId, dateStr) => {
  const result = await pool.query(
    `SELECT * FROM promotions
     WHERE abonnement_id = $1
       AND date_debut <= $2::date
       AND (date_fin IS NULL OR date_fin >= $2::date)
     ORDER BY created_at DESC LIMIT 1`,
    [abonnementId, dateStr]
  );
  return result.rows[0] || null;
};

const applyPromoMensualite = (baseAmount, promo) => {
  if (!promo || !['mensualite', 'les_deux'].includes(promo.applies_to)) return baseAmount;
  if (promo.type === 'free_months') return 0;
  if (promo.type === 'percent_off' && promo.discount_mensualite != null)
    return Math.round(baseAmount * (1 - promo.discount_mensualite / 100) * 100) / 100;
  if (promo.type === 'fixed_price' && promo.fixed_mensualite != null) return promo.fixed_mensualite;
  return baseAmount;
};

const applyPromoOnboarding = (baseAmount, promo) => {
  if (!promo || !['onboarding', 'les_deux'].includes(promo.applies_to)) return baseAmount;
  if (promo.type === 'free_months') return 0;
  if (promo.type === 'percent_off' && promo.discount_onboarding != null)
    return Math.round(baseAmount * (1 - promo.discount_onboarding / 100) * 100) / 100;
  if (promo.type === 'fixed_price' && promo.fixed_onboarding != null) return promo.fixed_onboarding;
  return baseAmount;
};

const mapPaiement = (row) => ({
  id: row.id,
  abonnementId: row.abonnement_id,
  mois: row.mois,
  montantDt: row.montant_dt,
  statut: row.statut,
  saisiePar: row.saisie_par,
  dateSaisie: row.date_saisie,
  notes: row.notes,
  createdAt: row.created_at,
});

// ── Tarifs ───────────────────────────────────────────────────────────────────

const getTarifs = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tarifs_config ORDER BY id');
    const tarifs = {};
    result.rows.forEach((r) => { tarifs[r.cle] = { id: r.id, valeur: r.valeur_dt, description: r.description }; });
    res.json(tarifs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateTarif = async (req, res) => {
  const { cle } = req.params;
  const { valeur } = req.body;
  if (valeur === undefined || isNaN(Number(valeur))) {
    return res.status(400).json({ message: 'Valeur numérique requise' });
  }
  try {
    const result = await pool.query(
      `UPDATE tarifs_config SET valeur_dt = $1, updated_at = NOW() WHERE cle = $2 RETURNING *`,
      [Number(valeur), cle]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Tarif introuvable' });
    res.json({ cle, valeur: result.rows[0].valeur_dt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Abonnements ──────────────────────────────────────────────────────────────

const listAbonnements = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.nom AS client_nom, u.email AS client_email,
        EXISTS(
          SELECT 1 FROM promotions pr
          WHERE pr.abonnement_id = a.id
            AND pr.date_debut <= CURRENT_DATE
            AND (pr.date_fin IS NULL OR pr.date_fin >= CURRENT_DATE)
        ) AS has_active_promo
      FROM abonnements a
      LEFT JOIN utilisateurs u ON u.id = a.client_id
      ORDER BY a.created_at DESC
    `);
    res.json(result.rows.map(mapAbonnement));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getAbonnement = async (req, res) => {
  const { clientId } = req.params;
  try {
    const result = await pool.query(`
      SELECT a.*, u.nom AS client_nom, u.email AS client_email,
        EXISTS(
          SELECT 1 FROM promotions pr
          WHERE pr.abonnement_id = a.id
            AND pr.date_debut <= CURRENT_DATE
            AND (pr.date_fin IS NULL OR pr.date_fin >= CURRENT_DATE)
        ) AS has_active_promo
      FROM abonnements a
      LEFT JOIN utilisateurs u ON u.id = a.client_id
      WHERE a.client_id = $1
    `, [clientId]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });

    const abo = mapAbonnement(result.rows[0]);

    const paiements = await pool.query(
      'SELECT * FROM paiements WHERE abonnement_id = $1 ORDER BY mois DESC',
      [abo.id]
    );
    abo.paiements = paiements.rows.map(mapPaiement);

    const promos = await pool.query(
      `SELECT *, (date_debut <= CURRENT_DATE AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)) AS is_active
       FROM promotions WHERE abonnement_id = $1 ORDER BY date_debut DESC`,
      [abo.id]
    );
    abo.promotions = promos.rows.map(mapPromotion);

    res.json(abo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Called internally when admin creates a client account
const createAbonnement = async (clientId, compteType, montantOnboarding) => {
  const result = await pool.query(
    `INSERT INTO abonnements (client_id, compte_type, montant_onboarding, date_debut)
     VALUES ($1, $2, $3, CURRENT_DATE)
     RETURNING id`,
    [clientId, compteType, montantOnboarding]
  );
  // Auto-create current month payment record
  const aboId = result.rows[0].id;
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  await pool.query(
    `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut)
     VALUES ($1, $2, (SELECT valeur_dt FROM tarifs_config WHERE cle = $3), 'en_attente')`,
    [aboId, firstOfMonth.toISOString().slice(0, 10), compteType === 'entreprise' ? 'entreprise_mensuel' : 'indep_mensuel']
  );
  return aboId;
};

// Admin: update onboarding payment status
const updateOnboarding = async (req, res) => {
  const { clientId } = req.params;
  const { statut, notes } = req.body;
  const allowed = ['payé', 'impayé', 'offert'];
  if (!allowed.includes(statut)) return res.status(400).json({ message: 'Statut invalide' });
  try {
    const result = await pool.query(
      `UPDATE abonnements SET statut_onboarding = $1, notes = COALESCE($2, notes), updated_at = NOW()
       WHERE client_id = $3 RETURNING *`,
      [statut, notes || null, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    res.json({ statutOnboarding: result.rows[0].statut_onboarding });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Admin: set prolongation (max 30 days total)
const updateProlongation = async (req, res) => {
  const { clientId } = req.params;
  const { jours } = req.body;
  const j = Number(jours);
  if (isNaN(j) || j < 0 || j > 30) return res.status(400).json({ message: 'Prolongation entre 0 et 30 jours' });
  try {
    const result = await pool.query(
      `UPDATE abonnements SET prolongation_jours = $1, updated_at = NOW()
       WHERE client_id = $2 RETURNING prolongation_jours`,
      [j, clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    res.json({ prolongationJours: result.rows[0].prolongation_jours });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Admin: update notes
const updateNotes = async (req, res) => {
  const { clientId } = req.params;
  const { notes } = req.body;
  try {
    await pool.query(
      'UPDATE abonnements SET notes = $1, updated_at = NOW() WHERE client_id = $2',
      [notes || null, clientId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Admin: manually set mode_compte
const updateMode = async (req, res) => {
  const { clientId } = req.params;
  const { mode } = req.body;
  const allowed = ['actif', 'read_only', 'desactive', 'archive'];
  if (!allowed.includes(mode)) return res.status(400).json({ message: 'Mode invalide' });
  try {
    const client = await pool.query('SELECT id FROM utilisateurs WHERE id = $1', [clientId]);
    if (client.rows.length === 0) return res.status(404).json({ message: 'Client introuvable' });

    await pool.query(
      `UPDATE abonnements SET mode_compte = $1, updated_at = NOW() WHERE client_id = $2`,
      [mode, clientId]
    );
    // Also sync actif on utilisateurs
    const actif = mode === 'actif' || mode === 'read_only';
    await pool.query('UPDATE utilisateurs SET actif = $1 WHERE id = $2', [actif, clientId]);
    res.json({ mode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Paiements ────────────────────────────────────────────────────────────────

const upsertPaiement = async (req, res) => {
  const { clientId } = req.params;
  const { mois, statut, montant, notes } = req.body;
  if (!mois || !statut) return res.status(400).json({ message: 'mois et statut requis' });
  const allowed = ['payé', 'impayé', 'en_attente', 'remisé'];
  if (!allowed.includes(statut)) return res.status(400).json({ message: 'Statut invalide' });

  try {
    const aboRes = await pool.query('SELECT id, compte_type FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const { id: aboId, compte_type: compteType } = aboRes.rows[0];

    // Normalize mois to first of month
    const moisDate = new Date(mois);
    moisDate.setDate(1);
    const moisStr = moisDate.toISOString().slice(0, 10);

    // If no montant supplied, compute from tarif + promo
    let finalMontant = montant != null ? Number(montant) : null;
    if (finalMontant === null) {
      const tarifKey = compteType === 'entreprise' ? 'entreprise_mensuel' : 'indep_mensuel';
      const tarifRes = await pool.query('SELECT valeur_dt FROM tarifs_config WHERE cle = $1', [tarifKey]);
      const base = tarifRes.rows[0]?.valeur_dt || 0;
      const promo = await getActivePromo(aboId, moisStr);
      finalMontant = applyPromoMensualite(base, promo);
    }

    const result = await pool.query(
      `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut, saisie_par, date_saisie, notes)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)
       ON CONFLICT (abonnement_id, mois) DO UPDATE
       SET statut = $4, montant_dt = COALESCE($3, paiements.montant_dt),
           saisie_par = $5, date_saisie = NOW(), notes = COALESCE($6, paiements.notes)
       RETURNING *`,
      [aboId, moisStr, finalMontant, statut, req.user.id, notes || null]
    );
    res.json(mapPaiement(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Promotions ────────────────────────────────────────────────────────────────

const listPromotions = async (req, res) => {
  const { clientId } = req.params;
  try {
    const aboRes = await pool.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const result = await pool.query(
      `SELECT *, (date_debut <= CURRENT_DATE AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)) AS is_active
       FROM promotions WHERE abonnement_id = $1 ORDER BY date_debut DESC`,
      [aboRes.rows[0].id]
    );
    res.json(result.rows.map(mapPromotion));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const createPromotion = async (req, res) => {
  const { clientId } = req.params;
  const {
    type, appliesTo,
    discountOnboarding, discountMensualite,
    fixedOnboarding, fixedMensualite,
    dateDebut, monthsDuration, notes,
  } = req.body;

  const validTypes = ['percent_off', 'free_months', 'fixed_price'];
  const validApplies = ['onboarding', 'mensualite', 'les_deux'];
  if (!validTypes.includes(type)) return res.status(400).json({ message: 'Type invalide' });
  if (!validApplies.includes(appliesTo)) return res.status(400).json({ message: 'applies_to invalide' });
  if (!dateDebut) return res.status(400).json({ message: 'date_debut requis' });

  try {
    const aboRes = await pool.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const aboId = aboRes.rows[0].id;

    // Compute date_fin from dateDebut + monthsDuration
    let dateFin = null;
    if (monthsDuration && Number(monthsDuration) > 0) {
      const d = new Date(dateDebut);
      d.setMonth(d.getMonth() + Number(monthsDuration));
      d.setDate(d.getDate() - 1); // last day of promotion
      dateFin = d.toISOString().slice(0, 10);
    }

    const result = await pool.query(
      `INSERT INTO promotions
         (abonnement_id, type, applies_to,
          discount_onboarding, discount_mensualite,
          fixed_onboarding, fixed_mensualite,
          date_debut, months_duration, date_fin, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *, (date_debut <= CURRENT_DATE AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)) AS is_active`,
      [
        aboId, type, appliesTo,
        discountOnboarding || null, discountMensualite || null,
        fixedOnboarding || null, fixedMensualite || null,
        dateDebut, monthsDuration || null, dateFin,
        notes || null, req.user.id,
      ]
    );
    res.status(201).json(mapPromotion(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const deletePromotion = async (req, res) => {
  const { promoId } = req.params;
  try {
    const result = await pool.query('DELETE FROM promotions WHERE id = $1 RETURNING id', [promoId]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Promotion introuvable' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Cron: enforce payment deadlines ─────────────────────────────────────────

const enforcerStatuts = async () => {
  const today = new Date();
  const firstOfToday = new Date(today.getFullYear(), today.getMonth(), 1);

  try {
    // Get all active/read_only subscriptions with unpaid months
    const result = await pool.query(`
      SELECT a.id, a.client_id, a.prolongation_jours, a.mode_compte,
             p.mois, p.statut
      FROM abonnements a
      JOIN paiements p ON p.abonnement_id = a.id
      WHERE p.statut = 'impayé'
        AND a.mode_compte NOT IN ('archive')
        AND p.mois < $1
    `, [firstOfToday.toISOString().slice(0, 10)]);

    for (const row of result.rows) {
      const endOfMonth = new Date(row.mois);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);
      endOfMonth.setDate(1);
      // Add prolongation
      const extraMs = (row.prolongation_jours || 0) * 86400000;

      const day7  = new Date(endOfMonth.getTime() + 7  * 86400000 + extraMs);
      const day14 = new Date(endOfMonth.getTime() + 14 * 86400000 + extraMs);
      const day90 = new Date(endOfMonth.getTime() + 90 * 86400000 + extraMs);
      // 6 months after archive
      const day180 = new Date(endOfMonth.getTime() + 180 * 86400000 + extraMs);

      let newMode = row.mode_compte;

      if (today >= day90) {
        // Archive — real cascade deletion scheduled 6 months later
        if (row.mode_compte !== 'archive') {
          newMode = 'archive';
          await pool.query(
            `UPDATE abonnements SET mode_compte = 'archive', archive_date = NOW(),
             suppression_cascade_date = $1, updated_at = NOW()
             WHERE id = $2`,
            [day180.toISOString(), row.id]
          );
          await pool.query(`UPDATE utilisateurs SET actif = false WHERE id = $1`, [row.client_id]);
        }
      } else if (today >= day14) {
        if (row.mode_compte !== 'desactive' && row.mode_compte !== 'archive') {
          newMode = 'desactive';
          await pool.query(
            `UPDATE abonnements SET mode_compte = 'desactive', updated_at = NOW() WHERE id = $1`,
            [row.id]
          );
          await pool.query(`UPDATE utilisateurs SET actif = false WHERE id = $1`, [row.client_id]);
        }
      } else if (today >= day7) {
        if (row.mode_compte === 'actif') {
          newMode = 'read_only';
          await pool.query(
            `UPDATE abonnements SET mode_compte = 'read_only', updated_at = NOW() WHERE id = $1`,
            [row.id]
          );
        }
      }
    }

    // Hard cascade delete: accounts archived more than 6 months ago
    const archivesToDelete = await pool.query(`
      SELECT client_id FROM abonnements
      WHERE mode_compte = 'archive' AND suppression_cascade_date <= NOW()
    `);
    for (const row of archivesToDelete.rows) {
      if (row.client_id) {
        await pool.query('DELETE FROM utilisateurs WHERE id = $1', [row.client_id]);
      }
    }

    // Auto-create next month payment record if missing (apply promo if active)
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const missingAbo = await pool.query(`
      SELECT a.id, a.compte_type,
             (SELECT valeur_dt FROM tarifs_config WHERE cle = CASE a.compte_type WHEN 'entreprise' THEN 'entreprise_mensuel' ELSE 'indep_mensuel' END) AS base_montant
      FROM abonnements a
      WHERE a.mode_compte NOT IN ('archive')
        AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.abonnement_id = a.id AND p.mois = $1)
    `, [thisMonth]);
    for (const abo of missingAbo.rows) {
      const promo = await getActivePromo(abo.id, thisMonth);
      const montant = applyPromoMensualite(parseFloat(abo.base_montant || 0), promo);
      await pool.query(
        `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut) VALUES ($1, $2, $3, 'en_attente')`,
        [abo.id, thisMonth, montant]
      );
    }

  } catch (err) {
    console.error('Cron enforcerStatuts error:', err.message);
  }
};

module.exports = {
  getTarifs, updateTarif,
  listAbonnements, getAbonnement, createAbonnement,
  updateOnboarding, updateProlongation, updateNotes, updateMode,
  upsertPaiement,
  listPromotions, createPromotion, deletePromotion,
  enforcerStatuts,
};
