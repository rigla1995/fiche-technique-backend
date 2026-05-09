const pool = require('../config/database');
const { sendInviteEmail } = require('../services/emailService');

// ── Helpers ─────────────────────────────────────────────────────────────────

const mapAbonnement = (row) => ({
  id: row.id,
  clientId: row.client_id,
  clientNom: row.client_nom,
  clientEmail: row.client_email,
  compteType: row.compte_type,
  statutOnboarding: row.statut_onboarding,
  montantOnboarding: row.montant_onboarding,
  dateOnboarding: row.date_onboarding,
  dateDebut: row.date_debut,
  modeCompte: row.mode_compte,
  prolongationJours: row.prolongation_jours,
  notes: row.notes,
  archiveDate: row.archive_date,
  suppressionCascadeDate: row.suppression_cascade_date,
  hasActivePromo: row.has_active_promo ?? false,
  inviteSent: row.invite_sent ?? false,
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
  discountSupplement: row.discount_supplement,
  fixedSupplement: row.fixed_supplement,
  dateDebut: row.date_debut,
  monthsDuration: row.months_duration,
  dateFin: row.date_fin,
  notes: row.notes,
  createdAt: row.created_at,
  isActive: row.is_active ?? null,
});

// Returns the active promo for an abonnement on a given date (ISO string)
const getActivePromo = async (abonnementId, dateStr) => {
  // Only mensualite-applicable promos affect payment amounts
  const result = await pool.query(
    `SELECT * FROM promotions
     WHERE abonnement_id = $1
       AND date_debut <= $2::date
       AND (date_fin IS NULL OR date_fin >= $2::date)
       AND applies_to IN ('mensualite', 'les_deux')
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
  if (promo.type === 'fixed_price' && promo.fixed_mensualite != null) return parseFloat(promo.fixed_mensualite);
  return baseAmount;
};

const applyPromoOnboarding = (baseAmount, promo) => {
  if (!promo || !['onboarding', 'les_deux'].includes(promo.applies_to)) return baseAmount;
  if (promo.type === 'free_months') return 0;
  if (promo.type === 'percent_off' && promo.discount_onboarding != null)
    return Math.round(baseAmount * (1 - promo.discount_onboarding / 100) * 100) / 100;
  if (promo.type === 'fixed_price' && promo.fixed_onboarding != null) return parseFloat(promo.fixed_onboarding);
  return baseAmount;
};

const applyPromoSupplement = (baseAmount, promo) => {
  if (!promo) return baseAmount;
  if (promo.type === 'free_months') return 0;
  if (promo.type === 'percent_off' && promo.discount_supplement != null)
    return Math.round(baseAmount * (1 - promo.discount_supplement / 100) * 100) / 100;
  if (promo.type === 'fixed_price' && promo.fixed_supplement != null) return parseFloat(promo.fixed_supplement);
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
  datePaiement: row.date_paiement,
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

    if (req.query.withPricing) {
      const isEntreprise = abo.compteType === 'entreprise';
      const mensuelKey = isEntreprise ? 'entreprise_mensuel' : 'indep_mensuel';
      const onboardingKey = isEntreprise ? 'entreprise_onboarding' : 'indep_onboarding';
      const tarifsRes = await pool.query(
        'SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)',
        [[mensuelKey, onboardingKey]]
      );
      const tarifsMap = {};
      tarifsRes.rows.forEach((r) => { tarifsMap[r.cle] = parseFloat(r.valeur_dt); });
      const baseMensuel = tarifsMap[mensuelKey] || null;
      const baseOnboarding = tarifsMap[onboardingKey] || null;

      // Find separate active promos per type (raw snake_case for applyPromo* helpers)
      const rawPromoMens = promos.rows.find((p) => p.is_active && ['mensualite', 'les_deux'].includes(p.applies_to)) || null;
      const rawPromoOb = promos.rows.find((p) => p.is_active && ['onboarding', 'les_deux'].includes(p.applies_to)) || null;
      abo.pricing = {
        baseMensuel,
        baseOnboarding,
        effectifMensuel: rawPromoMens ? applyPromoMensualite(baseMensuel || 0, rawPromoMens) : baseMensuel,
        effectifOnboarding: rawPromoOb ? applyPromoOnboarding(baseOnboarding || 0, rawPromoOb) : baseOnboarding,
        activePromoMensuel: rawPromoMens ? abo.promotions.find((p) => p.id === rawPromoMens.id) || null : null,
        activePromoOnboarding: rawPromoOb ? abo.promotions.find((p) => p.id === rawPromoOb.id) || null : null,
      };
    }

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
  const tarifKey = compteType === 'entreprise' ? 'entreprise_mensuel' : 'indep_mensuel';
  const tarifRes = await pool.query('SELECT valeur_dt FROM tarifs_config WHERE cle = $1', [tarifKey]);
  const baseMontant = parseFloat(tarifRes.rows[0]?.valeur_dt || 0);
  const activePromo = await getActivePromo(aboId, firstOfMonth.toISOString().slice(0, 10));
  const montant = activePromo ? applyPromoMensualite(baseMontant, activePromo) : baseMontant;
  const statut = montant === 0 ? 'gratuit' : 'en_attente';
  await pool.query(
    `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut) VALUES ($1, $2, $3, $4)`,
    [aboId, firstOfMonth.toISOString().slice(0, 10), montant, statut]
  );
  return aboId;
};

// Admin: update onboarding payment status + optional date
const updateOnboarding = async (req, res) => {
  const { clientId } = req.params;
  const { datePaiement } = req.body; // admin only declares payment date; statut is computed

  try {
    const aboRes = await pool.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const aboId = aboRes.rows[0].id;

    // Compute statut: free promo → gratuit, admin confirmed date → payé, else → en_attente
    const promoRes = await pool.query(
      `SELECT 1 FROM promotions
       WHERE abonnement_id = $1 AND applies_to IN ('onboarding','les_deux') AND type = 'free_months'
       LIMIT 1`,
      [aboId]
    );
    let statut = 'en_attente';
    if (promoRes.rows.length > 0) statut = 'gratuit';
    else if (datePaiement) statut = 'payé';

    const result = await pool.query(
      `UPDATE abonnements
       SET statut_onboarding = $1,
           date_onboarding = CASE WHEN $2::date IS NOT NULL THEN $2::date ELSE date_onboarding END,
           updated_at = NOW()
       WHERE client_id = $3 RETURNING *`,
      [statut, datePaiement || null, clientId]
    );
    res.json({
      statutOnboarding: result.rows[0].statut_onboarding,
      dateOnboarding: result.rows[0].date_onboarding,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Admin: set prolongation (kept for compatibility)
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
  const allowed = ['actif', 'read_only', 'desactive', 'archive', 'bloque'];
  if (!allowed.includes(mode)) return res.status(400).json({ message: 'Mode invalide' });
  try {
    const client = await pool.query('SELECT id FROM utilisateurs WHERE id = $1', [clientId]);
    if (client.rows.length === 0) return res.status(404).json({ message: 'Client introuvable' });

    await pool.query(
      `UPDATE abonnements SET mode_compte = $1, updated_at = NOW() WHERE client_id = $2`,
      [mode, clientId]
    );

    if (mode === 'bloque') {
      // Block client and all their gérants
      await pool.query('UPDATE utilisateurs SET actif = false WHERE id = $1', [clientId]);
      await pool.query(
        'UPDATE utilisateurs SET actif = false WHERE gerant_parent_id = $1 AND role = $2',
        [clientId, 'gerant']
      );
    } else {
      const actif = mode === 'actif' || mode === 'read_only';
      await pool.query('UPDATE utilisateurs SET actif = $1 WHERE id = $2', [actif, clientId]);
      // Re-activate gérants only when going back to actif
      if (mode === 'actif') {
        await pool.query(
          'UPDATE utilisateurs SET actif = true WHERE gerant_parent_id = $1 AND role = $2',
          [clientId, 'gerant']
        );
      }
    }

    res.json({ mode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Montant mois (compute total for a given month) ───────────────────────────

const getMontantMois = async (req, res) => {
  const { clientId } = req.params;
  const { mois } = req.query; // expects YYYY-MM
  if (!mois || !/^\d{4}-\d{2}$/.test(mois)) {
    return res.status(400).json({ message: 'mois requis (format YYYY-MM)' });
  }
  const moisStr = mois + '-01';

  try {
    const aboRes = await pool.query('SELECT id, compte_type FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const { id: aboId, compte_type: compteType } = aboRes.rows[0];

    // Check for existing payment this month
    const existingRes = await pool.query(
      'SELECT montant_dt, statut, date_paiement FROM paiements WHERE abonnement_id = $1 AND mois = $2',
      [aboId, moisStr]
    );

    // Tarifs
    const isEntreprise = compteType === 'entreprise';
    const tarifsRes = await pool.query(
      'SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)',
      [['indep_mensuel', 'entreprise_mensuel', 'gerant_sup_mensuel', 'labo_sup_mensuel']]
    );
    const tarifs = {};
    tarifsRes.rows.forEach((r) => { tarifs[r.cle] = parseFloat(r.valeur_dt); });

    const baseMensuel = tarifs[isEntreprise ? 'entreprise_mensuel' : 'indep_mensuel'] || 0;

    // Count gérants
    const gerantCountRes = await pool.query(
      'SELECT COUNT(*) FROM utilisateurs WHERE gerant_parent_id = $1 AND role = $2',
      [clientId, 'gerant']
    );
    const hasGerant = parseInt(gerantCountRes.rows[0].count) > 0;

    // Check labo
    const laboCountRes = await pool.query(
      `SELECT COUNT(*) FROM labos l
       JOIN profil_entreprise pe ON pe.id = l.entreprise_id
       WHERE pe.client_id = $1`,
      [clientId]
    );
    const hasLabo = parseInt(laboCountRes.rows[0].count) > 0;

    // Active promos for this month
    const promosRes = await pool.query(
      `SELECT * FROM promotions
       WHERE abonnement_id = $1
         AND date_debut <= $2::date
         AND (date_fin IS NULL OR date_fin >= $2::date)`,
      [aboId, moisStr]
    );
    const promos = promosRes.rows;
    const promoMens = promos.find((p) => ['mensualite', 'les_deux'].includes(p.applies_to)) || null;
    const promoGerant = promos.find((p) => p.applies_to === 'supplement_gerant') || null;
    const promoLabo = promos.find((p) => p.applies_to === 'supplement_labo') || null;

    const effectifMensuel = promoMens ? applyPromoMensualite(baseMensuel, promoMens) : baseMensuel;
    const baseGerant = hasGerant ? (tarifs['gerant_sup_mensuel'] || 0) : 0;
    const effectifGerant = hasGerant ? applyPromoSupplement(baseGerant, promoGerant) : 0;
    const baseLabo = hasLabo ? (tarifs['labo_sup_mensuel'] || 0) : 0;
    const effectifLabo = hasLabo ? applyPromoSupplement(baseLabo, promoLabo) : 0;

    const total = effectifMensuel + effectifGerant + effectifLabo;

    const isGratuit = promoMens?.type === 'free_months';

    res.json({
      moisStr,
      isGratuit,
      existing: existingRes.rows[0]
        ? {
            montantDt: existingRes.rows[0].montant_dt,
            statut: existingRes.rows[0].statut,
            datePaiement: existingRes.rows[0].date_paiement,
          }
        : null,
      breakdown: {
        mensualite: {
          base: baseMensuel, effectif: effectifMensuel, hasPromo: !!promoMens,
          promoType: promoMens?.type || null,
        },
        supplementGerant: {
          base: baseGerant, effectif: effectifGerant, active: hasGerant, hasPromo: !!promoGerant,
          promoType: promoGerant?.type || null,
        },
        supplementLabo: {
          base: baseLabo, effectif: effectifLabo, active: hasLabo, hasPromo: !!promoLabo,
          promoType: promoLabo?.type || null,
        },
      },
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Paiements ────────────────────────────────────────────────────────────────

const upsertPaiement = async (req, res) => {
  const { clientId } = req.params;
  const { mois, statut, montant, notes, datePaiement } = req.body;
  if (!mois || !statut) return res.status(400).json({ message: 'mois et statut requis' });
  const allowed = ['payé', 'impayé', 'en_attente', 'remisé', 'gratuit'];
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
      `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut, saisie_par, date_saisie, date_paiement, notes)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7)
       ON CONFLICT (abonnement_id, mois) DO UPDATE
       SET statut = $4, montant_dt = COALESCE($3, paiements.montant_dt),
           saisie_par = $5, date_saisie = NOW(),
           date_paiement = COALESCE($6, paiements.date_paiement),
           notes = COALESCE($7, paiements.notes)
       RETURNING *`,
      [aboId, moisStr, finalMontant, statut, req.user.id, datePaiement || null, notes || null]
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
    discountSupplement, fixedSupplement,
    dateDebut, monthsDuration,
  } = req.body;

  const validTypes = ['percent_off', 'free_months', 'fixed_price'];
  const validApplies = ['onboarding', 'mensualite', 'les_deux', 'supplement_gerant', 'supplement_labo'];
  if (!validTypes.includes(type)) return res.status(400).json({ message: 'Type invalide' });
  if (!validApplies.includes(appliesTo)) return res.status(400).json({ message: 'applies_to invalide' });
  if (!dateDebut) return res.status(400).json({ message: 'date_debut requis' });

  try {
    const aboRes = await pool.query('SELECT id, date_debut FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const aboId = aboRes.rows[0].id;
    const aboDateDebut = aboRes.rows[0].date_debut;

    // date_debut must be >= subscription start date
    // For mensualite/supplements, compare at month level only (day is irrelevant)
    const aboDateDebutStr = aboDateDebut instanceof Date
      ? aboDateDebut.toISOString().slice(0, 10)
      : aboDateDebut.toString().slice(0, 10);
    const isMonthOnly = appliesTo !== 'onboarding';
    const cmpDateDebut = isMonthOnly ? dateDebut.slice(0, 7) : dateDebut;
    const cmpAboStart  = isMonthOnly ? aboDateDebutStr.slice(0, 7) : aboDateDebutStr;
    if (cmpDateDebut < cmpAboStart) {
      const hint = isMonthOnly ? aboDateDebutStr.slice(0, 7) : aboDateDebutStr;
      return res.status(400).json({ message: `La date de début ne peut pas être antérieure au début de l'abonnement (${hint})` });
    }

    // Compute date_fin from dateDebut + monthsDuration (needed for conflict check)
    let dateFin = null;
    if (monthsDuration && Number(monthsDuration) > 0) {
      const d = new Date(dateDebut);
      d.setMonth(d.getMonth() + Number(monthsDuration));
      d.setDate(d.getDate() - 1); // last day of promotion
      dateFin = d.toISOString().slice(0, 10);
    }

    // Conflict check: date-range overlap with existing promos of same type
    const conflictMap = {
      mensualite:        ['mensualite', 'les_deux'],
      onboarding:        ['onboarding', 'les_deux'],
      les_deux:          ['mensualite', 'onboarding', 'les_deux'],
      supplement_gerant: ['supplement_gerant'],
      supplement_labo:   ['supplement_labo'],
    };
    const conflictTypes = conflictMap[appliesTo];
    // Two date ranges [A,B] and [C,D] overlap when A <= D and C <= B
    // (NULL date_fin = open-ended / infinite)
    const conflictRes = await pool.query(
      `SELECT applies_to, date_fin FROM promotions
       WHERE abonnement_id = $1
         AND applies_to = ANY($2)
         AND date_debut <= COALESCE($3::date, '9999-12-31'::date)
         AND (date_fin IS NULL OR date_fin >= $4::date)
       LIMIT 1`,
      [aboId, conflictTypes, dateFin, dateDebut]
    );
    if (conflictRes.rows.length > 0) {
      const existing = conflictRes.rows[0].applies_to;
      const existingFin = conflictRes.rows[0].date_fin;
      const hint = existingFin
        ? ` Elle se termine le ${new Date(existingFin).toLocaleDateString('fr-FR')}.`
        : ' Elle est permanente.';
      return res.status(409).json({
        message: `Une promotion sur "${existing}" chevauche cette période.${hint}`,
      });
    }

    const result = await pool.query(
      `INSERT INTO promotions
         (abonnement_id, type, applies_to,
          discount_onboarding, discount_mensualite,
          fixed_onboarding, fixed_mensualite,
          discount_supplement, fixed_supplement,
          date_debut, months_duration, date_fin, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *, (date_debut <= CURRENT_DATE AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)) AS is_active`,
      [
        aboId, type, appliesTo,
        discountOnboarding || null, discountMensualite || null,
        fixedOnboarding || null, fixedMensualite || null,
        discountSupplement || null, fixedSupplement || null,
        dateDebut, monthsDuration || null, dateFin,
        req.user.id,
      ]
    );
    const promo = result.rows[0];

    // Sync statut_onboarding when a free onboarding promo is created
    if (type === 'free_months' && ['onboarding', 'les_deux'].includes(appliesTo)) {
      await pool.query(
        `UPDATE abonnements SET statut_onboarding = 'gratuit', updated_at = NOW() WHERE id = $1`,
        [aboId]
      );
    }

    // Update existing en_attente paiements within the promo's date range
    if (['mensualite', 'les_deux'].includes(appliesTo)) {
      const aboTypeRes = await pool.query('SELECT compte_type FROM abonnements WHERE id = $1', [aboId]);
      const compteType = aboTypeRes.rows[0]?.compte_type;
      const tarifKey = compteType === 'entreprise' ? 'entreprise_mensuel' : 'indep_mensuel';
      const tarifRes = await pool.query('SELECT valeur_dt FROM tarifs_config WHERE cle = $1', [tarifKey]);
      const base = parseFloat(tarifRes.rows[0]?.valeur_dt || 0);
      const newMontant = applyPromoMensualite(base, promo);

      const newStatut = newMontant === 0 ? 'gratuit' : 'en_attente';
      const params = [aboId, dateDebut, newMontant, newStatut];
      let sql = `UPDATE paiements SET montant_dt = $3, statut = $4 WHERE abonnement_id = $1 AND statut IN ('en_attente', 'gratuit') AND mois >= $2::date`;
      if (dateFin) { sql += ` AND mois <= $5::date`; params.push(dateFin); }
      await pool.query(sql, params);
    }

    res.status(201).json(mapPromotion(promo));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const deletePromotion = async (req, res) => {
  const { promoId } = req.params;
  try {
    const promoRes = await pool.query('SELECT * FROM promotions WHERE id = $1', [promoId]);
    if (promoRes.rows.length === 0) return res.status(404).json({ message: 'Promotion introuvable' });
    const p = promoRes.rows[0];

    await pool.query('DELETE FROM promotions WHERE id = $1', [promoId]);

    // Reset statut_onboarding if we removed the free ob promo
    if (p.type === 'free_months' && ['onboarding', 'les_deux'].includes(p.applies_to)) {
      await pool.query(
        `UPDATE abonnements
         SET statut_onboarding = CASE WHEN date_onboarding IS NOT NULL THEN 'payé' ELSE 'en_attente' END,
             updated_at = NOW()
         WHERE id = $1`,
        [p.abonnement_id]
      );
    }

    // Reset gratuit paiements back to en_attente when a free mensualite promo is removed
    if (p.type === 'free_months' && ['mensualite', 'les_deux'].includes(p.applies_to)) {
      const params = [p.abonnement_id, p.date_debut];
      let sql = `UPDATE paiements SET statut = 'en_attente'
                 WHERE abonnement_id = $1 AND statut = 'gratuit' AND mois >= $2::date`;
      if (p.date_fin) { sql += ` AND mois <= $3::date`; params.push(p.date_fin); }
      await pool.query(sql, params);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Cron: auto-create monthly payment records ────────────────────────────────

const enforcerStatuts = async () => {
  try {
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
      const statut = montant === 0 ? 'gratuit' : 'en_attente';
      await pool.query(
        `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut) VALUES ($1, $2, $3, $4)`,
        [abo.id, thisMonth, montant, statut]
      );
    }
  } catch (err) {
    console.error('Cron enforcerStatuts error:', err.message);
  }
};

// ── Invite ───────────────────────────────────────────────────────────────────

const confirmInvite = async (req, res) => {
  const { clientId } = req.params;
  try {
    const userRes = await pool.query(
      'SELECT id, nom, email, invite_token, invite_token_expires_at, activated_at FROM utilisateurs WHERE id = $1',
      [clientId]
    );
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'Client introuvable' });
    const u = userRes.rows[0];
    if (u.activated_at) return res.status(400).json({ message: 'Ce compte est déjà activé' });
    if (!u.invite_token) return res.status(400).json({ message: 'Aucun token d\'invitation disponible' });

    // Refresh token expiry (48h from now) before sending
    const newExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await pool.query(
      'UPDATE utilisateurs SET invite_token_expires_at = $1 WHERE id = $2',
      [newExpires, clientId]
    );

    const emailResult = await sendInviteEmail({ to: u.email, nom: u.nom, token: u.invite_token, role: 'client' });

    await pool.query(
      'UPDATE abonnements SET invite_sent = TRUE, updated_at = NOW() WHERE client_id = $1',
      [clientId]
    );

    res.json({ ok: true, inviteUrl: emailResult?.inviteUrl || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Global admin queries ─────────────────────────────────────────────────────

const allPaiements = async (req, res) => {
  const { clientId, statut, mois } = req.query;
  try {
    const conditions = ['1=1'];
    const params = [];
    let i = 1;
    if (clientId) { conditions.push(`a.client_id = $${i++}`); params.push(clientId); }
    if (statut)   { conditions.push(`p.statut = $${i++}`);    params.push(statut); }
    if (mois)     { conditions.push(`DATE_TRUNC('month', p.mois) = DATE_TRUNC('month', $${i++}::date)`); params.push(mois); }
    const result = await pool.query(`
      SELECT p.id, p.mois, p.montant_dt, p.statut, p.date_saisie, p.date_paiement, p.notes,
             a.client_id, a.compte_type,
             u.nom AS client_nom, u.email AS client_email
      FROM paiements p
      JOIN abonnements a ON a.id = p.abonnement_id
      LEFT JOIN utilisateurs u ON u.id = a.client_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.mois DESC, u.nom ASC
    `, params);
    res.json(result.rows.map((r) => ({
      id: r.id,
      mois: r.mois,
      montantDt: r.montant_dt,
      statut: r.statut,
      dateSaisie: r.date_saisie,
      datePaiement: r.date_paiement,
      notes: r.notes,
      clientId: r.client_id,
      compteType: r.compte_type,
      clientNom: r.client_nom,
      clientEmail: r.client_email,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const allPromotions = async (req, res) => {
  const { clientId, type, appliesTo, active } = req.query;
  try {
    const conditions = ['1=1'];
    const params = [];
    let i = 1;
    if (clientId)  { conditions.push(`a.client_id = $${i++}`);  params.push(clientId); }
    if (type)      { conditions.push(`pr.type = $${i++}`);       params.push(type); }
    if (appliesTo) { conditions.push(`pr.applies_to = $${i++}`); params.push(appliesTo); }
    if (active === '1') {
      conditions.push('pr.date_debut <= CURRENT_DATE AND (pr.date_fin IS NULL OR pr.date_fin >= CURRENT_DATE)');
    }
    const result = await pool.query(`
      SELECT pr.*,
             (pr.date_debut <= CURRENT_DATE AND (pr.date_fin IS NULL OR pr.date_fin >= CURRENT_DATE)) AS is_active,
             a.client_id, a.compte_type,
             u.nom AS client_nom, u.email AS client_email
      FROM promotions pr
      JOIN abonnements a ON a.id = pr.abonnement_id
      LEFT JOIN utilisateurs u ON u.id = a.client_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY pr.date_debut DESC, u.nom ASC
    `, params);
    res.json(result.rows.map((r) => ({
      ...mapPromotion(r),
      clientId: r.client_id,
      compteType: r.compte_type,
      clientNom: r.client_nom,
      clientEmail: r.client_email,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getTarifs, updateTarif,
  listAbonnements, getAbonnement, createAbonnement,
  updateOnboarding, updateProlongation, updateNotes, updateMode,
  upsertPaiement,
  getMontantMois,
  listPromotions, createPromotion, deletePromotion,
  confirmInvite,
  allPaiements, allPromotions,
  enforcerStatuts,
};
