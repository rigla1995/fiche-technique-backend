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
  // 'actif' = date_fin IS NULL or >= today; 'expiré' = date_fin < today
  statutPromo: row.statut_promo ?? (row.is_active ? 'actif' : 'expiré'),
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

// Tiered/degressive pricing model
// Sans labo: 1er=base, 2ème=base*(1-r2%), 3ème+=base*(1-r3%) each
// Avec labo: all = base*(1-rl%) each
const computeBaseMensuelFromConfig = (config, tarifs) => {
  if (!config) return null;
  const n   = parseInt(config.nb_activites) || 1;
  const nbl = parseInt(config.nb_labos)     || 0;
  const base = parseFloat(tarifs['prix_base_activite'] ?? tarifs['activite_1'] ?? 200);
  const hasLabo = nbl > 0;

  if (hasLabo) {
    const rl = parseFloat(tarifs['remise_avec_labo'] ?? 30) / 100;
    return Math.round(n * base * (1 - rl) * 100) / 100;
  }

  // Sans labo: tiered
  const r2 = parseFloat(tarifs['remise_2eme_sans_labo']      ?? 20) / 100;
  const r3 = parseFloat(tarifs['remise_3eme_plus_sans_labo'] ?? 40) / 100;
  let cost = base; // 1st
  if (n >= 2) cost += base * (1 - r2); // 2nd
  if (n >= 3) cost += (n - 2) * base * (1 - r3); // 3rd+
  return Math.round(cost * 100) / 100;
};

const computeBaseGerantFromConfig = (config, tarifs) => {
  if (!config) return null;
  const n = parseInt(config.nb_gerants) || 0;
  if (n === 0) return 0;
  return n * parseFloat(tarifs['gerant_sup_mensuel'] ?? tarifs['gerant_mensuel'] ?? 80);
};

const computeBaseLaboFromConfig = (config, tarifs) => {
  if (!config) return null;
  const n = parseInt(config.nb_labos) || 0;
  if (n === 0) return 0;
  return n * parseFloat(tarifs['labo_sup_mensuel'] ?? tarifs['labo_mensuel'] ?? 160);
};

// Unit price for next supplement activité (tier n+1)
const computeActiviteSupPrice = (config, tarifs) => {
  if (!config) return parseFloat(tarifs['prix_base_activite'] ?? 200);
  const nbl  = parseInt(config.nb_labos)     || 0;
  const base = parseFloat(tarifs['prix_base_activite'] ?? tarifs['activite_1'] ?? 200);
  if (nbl > 0) {
    const rl = parseFloat(tarifs['remise_avec_labo'] ?? 30) / 100;
    return Math.round(base * (1 - rl) * 100) / 100;
  }
  const r3 = parseFloat(tarifs['remise_3eme_plus_sans_labo'] ?? 40) / 100;
  return Math.round(base * (1 - r3) * 100) / 100;
};

const loadAllTarifs = async () => {
  const res = await pool.query('SELECT cle, valeur_dt FROM tarifs_config');
  const t = {};
  res.rows.forEach((r) => { t[r.cle] = parseFloat(r.valeur_dt); });
  return t;
};

const mapAbonnementConfig = (row) => row ? ({
  id: row.id,
  abonnementId: row.abonnement_id,
  nbActivites: row.nb_activites,
  nbLabos: row.nb_labos,
  nbGerants: row.nb_gerants,
  montantOnboarding: row.montant_onboarding,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}) : null;

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

    const promoYearStart = `${new Date().getFullYear()}-01-01`;
    const promoYearEnd   = `${new Date().getFullYear()}-12-31`;
    const promos = await pool.query(
      `SELECT *,
         (date_debut <= CURRENT_DATE AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)) AS is_active,
         CASE WHEN date_fin IS NULL OR date_fin >= CURRENT_DATE THEN 'actif' ELSE 'expiré' END AS statut_promo
       FROM promotions
       WHERE abonnement_id = $1
         AND date_debut <= $3::date
         AND (date_fin IS NULL OR date_fin >= $2::date)
       ORDER BY date_debut DESC`,
      [abo.id, promoYearStart, promoYearEnd]
    );
    abo.promotions = promos.rows.map(mapPromotion);

    // Include abonnement_config
    const configRes = await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [abo.id]);
    abo.config = configRes.rows.length > 0 ? mapAbonnementConfig(configRes.rows[0]) : null;

    if (req.query.withPricing) {
      const tarifs = await loadAllTarifs();
      const config = configRes.rows[0] || null;

      let baseMensuel, baseOnboarding;
      if (config) {
        baseMensuel = (computeBaseMensuelFromConfig(config, tarifs) || 0)
                    + (computeBaseLaboFromConfig(config, tarifs)    || 0)
                    + (computeBaseGerantFromConfig(config, tarifs)  || 0);
        baseOnboarding = parseFloat(config.montant_onboarding) || null;
      } else {
        baseMensuel = tarifs['entreprise_mensuel'] || null;
        baseOnboarding = tarifs['entreprise_onboarding'] || null;
      }

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
      if (config) {
        const nbA = parseInt(config.nb_activites) || 0;
        const nbL = parseInt(config.nb_labos) || 0;
        const nbG = parseInt(config.nb_gerants) || 0;
        const activiteCost = computeBaseMensuelFromConfig(config, tarifs) || 0;
        const laboCost     = computeBaseLaboFromConfig(config, tarifs)    || 0;
        const gerantCost   = computeBaseGerantFromConfig(config, tarifs)  || 0;
        abo.pricing.configBreakdown = {
          activite: { nb: nbA, total: activiteCost },
          labo:     { nb: nbL, total: laboCost },
          gerant:   { nb: nbG, total: gerantCost },
          prixActiviteSup: computeActiviteSupPrice(config, tarifs),
          prixLaboSup:     parseFloat(tarifs['labo_sup_mensuel'] ?? tarifs['labo_mensuel'] ?? 160),
          prixGerantSup:   parseFloat(tarifs['gerant_sup_mensuel'] ?? tarifs['gerant_mensuel'] ?? 80),
        };
      }
    }

    res.json(abo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Called internally when admin creates a client account
// config: { nbActivites, nbLabos, nbGerants, montantOnboarding } — if provided, uses new pricing model
const createAbonnement = async (clientId, montantOnboarding, config = null) => {
  const result = await pool.query(
    `INSERT INTO abonnements (client_id, montant_onboarding, date_debut)
     VALUES ($1, $2, CURRENT_DATE)
     RETURNING id`,
    [clientId, config ? config.montantOnboarding : montantOnboarding]
  );
  const aboId = result.rows[0].id;

  // Save config if provided
  if (config) {
    await pool.query(
      `INSERT INTO abonnement_config (abonnement_id, nb_activites, nb_labos, nb_gerants, montant_onboarding)
       VALUES ($1, $2, $3, $4, $5)`,
      [aboId, config.nbActivites || 1, config.nbLabos || 0, config.nbGerants || 0, config.montantOnboarding || 0]
    );
  }

  // Auto-create current month payment record
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const moisStr = firstOfMonth.toISOString().slice(0, 10);

  let baseMontant = 0;
  if (config) {
    const tarifs = await loadAllTarifs();
    baseMontant = (computeBaseMensuelFromConfig(config, tarifs) || 0)
      + (computeBaseGerantFromConfig(config, tarifs) || 0)
      + (computeBaseLaboFromConfig(config, tarifs) || 0);
  }

  const activePromo = await getActivePromo(aboId, moisStr);
  const montant = activePromo ? applyPromoMensualite(baseMontant, activePromo) : baseMontant;
  const statut = montant === 0 ? 'gratuit' : 'en_attente';
  await pool.query(
    `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut) VALUES ($1, $2, $3, $4)`,
    [aboId, moisStr, montant, statut]
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

    const tarifs = await loadAllTarifs();

    // Try new config-based pricing first
    const configRes = await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId]);
    const config = configRes.rows[0] || null;

    let baseMensuel, baseGerant, baseLabo;
    let hasGerant, hasLabo;

    if (config) {
      baseMensuel = computeBaseMensuelFromConfig(config, tarifs) || 0;
      baseGerant  = computeBaseGerantFromConfig(config, tarifs) || 0;
      baseLabo    = computeBaseLaboFromConfig(config, tarifs) || 0;
      hasGerant   = (config.nb_gerants || 0) > 0;
      hasLabo     = (config.nb_labos || 0) > 0;
    } else {
      // Legacy fallback for accounts without config
      baseMensuel = tarifs['entreprise_mensuel'] || 0;
      const gerantCountRes = await pool.query(
        'SELECT COUNT(*) FROM utilisateurs WHERE gerant_parent_id = $1 AND role = $2',
        [clientId, 'gerant']
      );
      hasGerant = parseInt(gerantCountRes.rows[0].count) > 0;
      const laboCountRes = await pool.query(
        `SELECT COUNT(*) FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE pe.client_id = $1`,
        [clientId]
      );
      hasLabo = parseInt(laboCountRes.rows[0].count) > 0;
      baseGerant = hasGerant ? (tarifs['gerant_sup_mensuel'] || 0) : 0;
      baseLabo   = hasLabo   ? (tarifs['labo_sup_mensuel']   || 0) : 0;
    }

    // Active promos for this month
    const promosRes = await pool.query(
      `SELECT * FROM promotions
       WHERE abonnement_id = $1
         AND date_debut <= $2::date
         AND (date_fin IS NULL OR date_fin >= $2::date)`,
      [aboId, moisStr]
    );
    const promos = promosRes.rows;
    const promoMens   = promos.find((p) => ['mensualite', 'les_deux'].includes(p.applies_to)) || null;
    const promoGerant = promos.find((p) => p.applies_to === 'supplement_gerant') || null;
    const promoLabo   = promos.find((p) => p.applies_to === 'supplement_labo') || null;

    // Mensualité promo applies to the FULL total (activités + labos + gérants)
    const baseTotal = baseMensuel + (hasGerant ? baseGerant : 0) + (hasLabo ? baseLabo : 0);

    let total, breakdown;
    if (promoMens) {
      const effectifTotal = applyPromoMensualite(baseTotal, promoMens);
      total = effectifTotal;
      breakdown = {
        mensualite: {
          base: baseTotal, effectif: effectifTotal, hasPromo: true,
          promoType: promoMens.type, coversAll: true,
          // individual component bases for detailed display
          baseActivite: baseMensuel,
          baseGerant: hasGerant ? baseGerant : 0,
          baseLabo: hasLabo ? baseLabo : 0,
        },
        supplementGerant: { base: baseGerant, effectif: 0, active: hasGerant, hasPromo: false, promoType: null },
        supplementLabo:   { base: baseLabo,   effectif: 0, active: hasLabo,   hasPromo: false, promoType: null },
      };
    } else {
      const effectifGerant = hasGerant ? applyPromoSupplement(baseGerant, promoGerant) : 0;
      const effectifLabo   = hasLabo   ? applyPromoSupplement(baseLabo,   promoLabo)   : 0;
      total = baseMensuel + effectifGerant + effectifLabo;
      breakdown = {
        mensualite: {
          base: baseMensuel, effectif: baseMensuel, hasPromo: false,
          promoType: null, coversAll: false,
        },
        supplementGerant: {
          base: baseGerant, effectif: effectifGerant, active: hasGerant, hasPromo: !!promoGerant,
          promoType: promoGerant?.type || null,
        },
        supplementLabo: {
          base: baseLabo, effectif: effectifLabo, active: hasLabo, hasPromo: !!promoLabo,
          promoType: promoLabo?.type || null,
        },
      };
    }

    const isGratuit = promoMens?.type === 'free_months';

    res.json({
      moisStr,
      isGratuit,
      config: config ? mapAbonnementConfig(config) : null,
      existing: existingRes.rows[0]
        ? {
            montantDt: existingRes.rows[0].montant_dt,
            statut: existingRes.rows[0].statut,
            datePaiement: existingRes.rows[0].date_paiement,
          }
        : null,
      breakdown,
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

    // If no montant supplied, compute from config/tarif + promo
    let finalMontant = montant != null ? Number(montant) : null;
    if (finalMontant === null) {
      const tarifs = await loadAllTarifs();
      const configRes = await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId]);
      let base;
      if (configRes.rows.length > 0) {
        const cfg = configRes.rows[0];
        base = (computeBaseMensuelFromConfig(cfg, tarifs) || 0)
          + (computeBaseGerantFromConfig(cfg, tarifs) || 0)
          + (computeBaseLaboFromConfig(cfg, tarifs) || 0);
      } else {
        base = tarifs['entreprise_mensuel'] || 0;
      }
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
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearEnd   = `${new Date().getFullYear()}-12-31`;
  try {
    const aboRes = await pool.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const result = await pool.query(
      `SELECT *,
         (date_debut <= CURRENT_DATE AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)) AS is_active,
         CASE WHEN date_fin IS NULL OR date_fin >= CURRENT_DATE THEN 'actif' ELSE 'expiré' END AS statut_promo
       FROM promotions
       WHERE abonnement_id = $1
         AND date_debut <= $3::date
         AND (date_fin IS NULL OR date_fin >= $2::date)
       ORDER BY date_debut DESC`,
      [aboRes.rows[0].id, yearStart, yearEnd]
    );
    res.json(result.rows.map(mapPromotion));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Core promo insertion logic — reusable from both the HTTP route and internal client creation
const insertPromoForAbonnement = async (aboId, aboDateDebutStr, promoData, createdById) => {
  const {
    type, appliesTo,
    discountOnboarding, discountMensualite,
    fixedOnboarding, fixedMensualite,
    discountSupplement, fixedSupplement,
    dateDebut, monthsDuration,
  } = promoData;

  const isMonthOnly = appliesTo !== 'onboarding';
  const cmpDateDebut = isMonthOnly ? dateDebut.slice(0, 7) : dateDebut;
  const cmpAboStart  = isMonthOnly ? aboDateDebutStr.slice(0, 7) : aboDateDebutStr;
  if (cmpDateDebut < cmpAboStart) {
    const hint = isMonthOnly ? aboDateDebutStr.slice(0, 7) : aboDateDebutStr;
    const err = new Error(`La date de début ne peut pas être antérieure au début de l'abonnement (${hint})`);
    err.statusCode = 400;
    throw err;
  }

  let dateFin = null;
  if (monthsDuration && Number(monthsDuration) > 0) {
    const d = new Date(dateDebut);
    d.setMonth(d.getMonth() + Number(monthsDuration));
    d.setDate(d.getDate() - 1);
    dateFin = d.toISOString().slice(0, 10);
  }

  const conflictMap = {
    mensualite:          ['mensualite', 'les_deux'],
    onboarding:          ['onboarding', 'les_deux'],
    les_deux:            ['mensualite', 'onboarding', 'les_deux'],
    supplement_gerant:   ['supplement_gerant'],
    supplement_labo:     ['supplement_labo'],
    supplement_activite: ['supplement_activite'],
  };
  const conflictTypes = conflictMap[appliesTo] || [appliesTo];
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
    const err = new Error(`Une promotion sur "${existing}" chevauche cette période.${hint}`);
    err.statusCode = 409;
    throw err;
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
      createdById,
    ]
  );
  const promo = result.rows[0];

  if (type === 'free_months' && ['onboarding', 'les_deux'].includes(appliesTo)) {
    await pool.query(
      `UPDATE abonnements SET statut_onboarding = 'gratuit', updated_at = NOW() WHERE id = $1`,
      [aboId]
    );
  }

  if (['mensualite', 'les_deux'].includes(appliesTo)) {
    const configRes = await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId]);
    const config = configRes.rows[0] || null;
    let base = 0;
    if (config) {
      const tarifs = await loadAllTarifs();
      base = (computeBaseMensuelFromConfig(config, tarifs) || 0)
        + (computeBaseGerantFromConfig(config, tarifs) || 0)
        + (computeBaseLaboFromConfig(config, tarifs) || 0);
    } else {
      const tarifRes = await pool.query(`SELECT valeur_dt FROM tarifs_config WHERE cle = 'entreprise_mensuel'`);
      base = parseFloat(tarifRes.rows[0]?.valeur_dt || 0);
    }
    const newMontant = applyPromoMensualite(base, promo);
    const newStatut = newMontant === 0 ? 'gratuit' : 'en_attente';
    const params = [aboId, dateDebut, newMontant, newStatut];
    let sql = `UPDATE paiements SET montant_dt = $3, statut = $4 WHERE abonnement_id = $1 AND statut IN ('en_attente', 'gratuit') AND mois >= $2::date`;
    if (dateFin) { sql += ` AND mois <= $5::date`; params.push(dateFin); }
    await pool.query(sql, params);
  }

  return promo;
};

const createPromotion = async (req, res) => {
  const { clientId } = req.params;
  const { type, appliesTo, dateDebut } = req.body;

  const validTypes = ['percent_off', 'free_months', 'fixed_price'];
  const validApplies = ['onboarding', 'mensualite', 'les_deux', 'supplement_gerant', 'supplement_labo', 'supplement_activite'];
  if (!validTypes.includes(type)) return res.status(400).json({ message: 'Type invalide' });
  if (!validApplies.includes(appliesTo)) return res.status(400).json({ message: 'applies_to invalide' });
  if (!dateDebut) return res.status(400).json({ message: 'date_debut requis' });

  try {
    const aboRes = await pool.query('SELECT id, date_debut FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const aboId = aboRes.rows[0].id;
    const aboDateDebut = aboRes.rows[0].date_debut;
    const aboDateDebutStr = aboDateDebut instanceof Date
      ? aboDateDebut.toISOString().slice(0, 10)
      : aboDateDebut.toString().slice(0, 10);

    const promo = await insertPromoForAbonnement(aboId, aboDateDebutStr, req.body, req.user.id);
    res.status(201).json(mapPromotion(promo));
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updatePromotion = async (req, res) => {
  const { promoId } = req.params;
  const {
    type, appliesTo,
    discountOnboarding, discountMensualite,
    fixedOnboarding, fixedMensualite,
    discountSupplement, fixedSupplement,
    dateDebut, monthsDuration,
  } = req.body;

  const validTypes = ['percent_off', 'free_months', 'fixed_price'];
  const validApplies = ['onboarding', 'mensualite', 'les_deux', 'supplement_gerant', 'supplement_labo', 'supplement_activite'];
  if (!validTypes.includes(type)) return res.status(400).json({ message: 'Type invalide' });
  if (!validApplies.includes(appliesTo)) return res.status(400).json({ message: 'applies_to invalide' });
  if (!dateDebut) return res.status(400).json({ message: 'date_debut requis' });

  try {
    const promoRes = await pool.query('SELECT * FROM promotions WHERE id = $1', [promoId]);
    if (promoRes.rows.length === 0) return res.status(404).json({ message: 'Promotion introuvable' });
    const existing = promoRes.rows[0];

    // Compute date_fin
    let dateFin = null;
    if (monthsDuration && Number(monthsDuration) > 0) {
      const d = new Date(dateDebut);
      d.setMonth(d.getMonth() + Number(monthsDuration));
      d.setDate(d.getDate() - 1);
      dateFin = d.toISOString().slice(0, 10);
    }

    // Conflict check (exclude self)
    const conflictMap = {
      mensualite:          ['mensualite', 'les_deux'],
      onboarding:          ['onboarding', 'les_deux'],
      les_deux:            ['mensualite', 'onboarding', 'les_deux'],
      supplement_gerant:   ['supplement_gerant'],
      supplement_labo:     ['supplement_labo'],
      supplement_activite: ['supplement_activite'],
    };
    const conflictTypes = conflictMap[appliesTo];
    const conflictRes = await pool.query(
      `SELECT applies_to, date_fin FROM promotions
       WHERE abonnement_id = $1
         AND id <> $2
         AND applies_to = ANY($3)
         AND date_debut <= COALESCE($4::date, '9999-12-31'::date)
         AND (date_fin IS NULL OR date_fin >= $5::date)
       LIMIT 1`,
      [existing.abonnement_id, promoId, conflictTypes, dateFin, dateDebut]
    );
    if (conflictRes.rows.length > 0) {
      const cf = conflictRes.rows[0];
      const hint = cf.date_fin
        ? ` Elle se termine le ${new Date(cf.date_fin).toLocaleDateString('fr-FR')}.`
        : ' Elle est permanente.';
      return res.status(409).json({
        message: `Une promotion sur "${cf.applies_to}" chevauche cette période.${hint}`,
      });
    }

    const result = await pool.query(
      `UPDATE promotions
       SET type = $1, applies_to = $2,
           discount_onboarding = $3, discount_mensualite = $4,
           fixed_onboarding = $5, fixed_mensualite = $6,
           discount_supplement = $7, fixed_supplement = $8,
           date_debut = $9, months_duration = $10, date_fin = $11,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *, (date_debut <= CURRENT_DATE AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)) AS is_active`,
      [
        type, appliesTo,
        discountOnboarding || null, discountMensualite || null,
        fixedOnboarding || null, fixedMensualite || null,
        discountSupplement || null, fixedSupplement || null,
        dateDebut, monthsDuration || null, dateFin,
        promoId,
      ]
    );
    const updated = result.rows[0];

    // Sync statut_onboarding for free_months onboarding type changes
    if (type === 'free_months' && ['onboarding', 'les_deux'].includes(appliesTo)) {
      await pool.query(
        `UPDATE abonnements SET statut_onboarding = 'gratuit', updated_at = NOW() WHERE id = $1`,
        [existing.abonnement_id]
      );
    } else if (existing.type === 'free_months' && ['onboarding', 'les_deux'].includes(existing.applies_to)) {
      // Was a free onboarding promo, now changed — reset statut
      await pool.query(
        `UPDATE abonnements
         SET statut_onboarding = CASE WHEN date_onboarding IS NOT NULL THEN 'payé' ELSE 'en_attente' END,
             updated_at = NOW()
         WHERE id = $1`,
        [existing.abonnement_id]
      );
    }

    res.json(mapPromotion(updated));
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

const syncPromoStatuts = async () => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // 1. For active free mensualite promos: ensure all covered months have gratuit paiements
    const activeFreeMens = await pool.query(
      `SELECT p.* FROM promotions p
       WHERE p.type = 'free_months'
         AND p.applies_to IN ('mensualite', 'les_deux')
         AND p.date_debut <= $1::date
         AND (p.date_fin IS NULL OR p.date_fin >= $1::date)`,
      [today]
    );
    for (const promo of activeFreeMens.rows) {
      const startDate = new Date(promo.date_debut);
      const endDate = promo.date_fin ? new Date(promo.date_fin) : new Date(today);
      const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      while (cur <= endDate) {
        const moisStr = cur.toISOString().slice(0, 10);
        await pool.query(
          `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut)
           VALUES ($1, $2, 0, 'gratuit')
           ON CONFLICT (abonnement_id, mois) DO UPDATE
             SET statut = 'gratuit', montant_dt = 0
           WHERE paiements.statut NOT IN ('payé')`,
          [promo.abonnement_id, moisStr]
        );
        cur.setMonth(cur.getMonth() + 1);
      }
    }

    // 2. Sync statut_onboarding for accounts with active free ob promos
    await pool.query(
      `UPDATE abonnements a SET statut_onboarding = 'gratuit'
       WHERE EXISTS (
         SELECT 1 FROM promotions p
         WHERE p.abonnement_id = a.id
           AND p.type = 'free_months'
           AND p.applies_to IN ('onboarding', 'les_deux')
       ) AND statut_onboarding <> 'payé'`
    );

    // 3. Reset gratuit paiements beyond expired free promos back to en_attente
    const expiredFreePromos = await pool.query(
      `SELECT * FROM promotions
       WHERE type = 'free_months'
         AND applies_to IN ('mensualite', 'les_deux')
         AND date_fin IS NOT NULL
         AND date_fin < $1::date`,
      [today]
    );
    for (const promo of expiredFreePromos.rows) {
      // Check there's no other free promo covering the same period
      const coverage = await pool.query(
        `SELECT 1 FROM promotions
         WHERE abonnement_id = $1
           AND id <> $2
           AND type = 'free_months'
           AND applies_to IN ('mensualite', 'les_deux')
           AND (date_fin IS NULL OR date_fin >= $3::date)
         LIMIT 1`,
        [promo.abonnement_id, promo.id, promo.date_fin]
      );
      if (coverage.rows.length === 0) {
        await pool.query(
          `UPDATE paiements SET statut = 'en_attente'
           WHERE abonnement_id = $1
             AND statut = 'gratuit'
             AND mois > $2::date`,
          [promo.abonnement_id, promo.date_fin]
        );
      }
    }
  } catch (err) {
    console.error('syncPromoStatuts error:', err.message);
  }
};

const enforcerStatuts = async () => {
  try {
    // Sync promo statuts first
    await syncPromoStatuts();

    // Auto-create monthly payment record if missing (apply promo if active)
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const tarifs = await loadAllTarifs();
    const missingAbo = await pool.query(`
      SELECT a.id
      FROM abonnements a
      WHERE a.mode_compte NOT IN ('archive')
        AND NOT EXISTS (SELECT 1 FROM paiements p WHERE p.abonnement_id = a.id AND p.mois = $1)
    `, [thisMonth]);
    // Fetch all configs at once to avoid N+1
    const configRows = await pool.query(
      'SELECT * FROM abonnement_config WHERE abonnement_id = ANY($1)',
      [missingAbo.rows.map(a => a.id)]
    );
    const configMap = new Map(configRows.rows.map(c => [c.abonnement_id, c]));

    for (const abo of missingAbo.rows) {
      const cfg = configMap.get(abo.id) || null;
      let base;
      if (cfg) {
        base = (computeBaseMensuelFromConfig(cfg, tarifs) || 0)
          + (computeBaseGerantFromConfig(cfg, tarifs) || 0)
          + (computeBaseLaboFromConfig(cfg, tarifs) || 0);
      } else {
        base = tarifs['entreprise_mensuel'] || 0;
      }
      const promo = await getActivePromo(abo.id, thisMonth);
      const montant = applyPromoMensualite(base, promo);
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
             a.client_id,
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
             a.client_id,
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
      clientNom: r.client_nom,
      clientEmail: r.client_email,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Admin: manually trigger promo sync (fixes existing data)
const runSyncPromoStatuts = async (req, res) => {
  try {
    await syncPromoStatuts();
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Abonnement Config ─────────────────────────────────────────────────────────

const getAbonnementConfig = async (req, res) => {
  const { clientId } = req.params;
  try {
    const aboRes = await pool.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const configRes = await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboRes.rows[0].id]);
    res.json(configRes.rows.length > 0 ? mapAbonnementConfig(configRes.rows[0]) : null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateAbonnementConfig = async (req, res) => {
  const { clientId } = req.params;
  const { nbActivites, nbLabos, nbGerants, montantOnboarding } = req.body;
  if (!nbActivites || nbActivites < 1) return res.status(400).json({ message: 'nb_activites >= 1 requis' });
  try {
    const aboRes = await pool.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const aboId = aboRes.rows[0].id;
    const result = await pool.query(
      `INSERT INTO abonnement_config (abonnement_id, nb_activites, nb_labos, nb_gerants, montant_onboarding)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (abonnement_id) DO UPDATE
       SET nb_activites = EXCLUDED.nb_activites,
           nb_labos = EXCLUDED.nb_labos,
           nb_gerants = EXCLUDED.nb_gerants,
           montant_onboarding = EXCLUDED.montant_onboarding,
           updated_at = NOW()
       RETURNING *`,
      [aboId, nbActivites, nbLabos ?? 0, nbGerants ?? 0, montantOnboarding ?? 0]
    );
    res.json(mapAbonnementConfig(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Pricing preview (for add-client step 2) ───────────────────────────────────

const getPricingPreview = async (req, res) => {
  const { nbActivites, nbLabos, nbGerants } = req.query;
  try {
    const tarifs = await loadAllTarifs();
    const nb  = parseInt(nbActivites) || 1;
    const nbl = parseInt(nbLabos)     || 0;
    const nbg = parseInt(nbGerants)   || 0;

    const mockConfig = { nb_activites: nb, nb_labos: nbl, nb_gerants: nbg };
    const activiteCost = computeBaseMensuelFromConfig(mockConfig, tarifs) || 0;
    const laboCost     = computeBaseLaboFromConfig(mockConfig, tarifs)    || 0;
    const gerantCost   = computeBaseGerantFromConfig(mockConfig, tarifs)  || 0;
    const total        = activiteCost + laboCost + gerantCost;

    const base   = parseFloat(tarifs['prix_base_activite'] ?? tarifs['activite_1'] ?? 200);
    const pLabo  = parseFloat(tarifs['labo_sup_mensuel']  ?? tarifs['labo_mensuel']   ?? 160);
    const pGer   = parseFloat(tarifs['gerant_sup_mensuel'] ?? tarifs['gerant_mensuel'] ?? 80);
    const hasLabo = nbl > 0;
    const rl = parseFloat(tarifs['remise_avec_labo']            ?? 30) / 100;
    const r2 = parseFloat(tarifs['remise_2eme_sans_labo']       ?? 20) / 100;
    const r3 = parseFloat(tarifs['remise_3eme_plus_sans_labo']  ?? 40) / 100;

    // Build per-tier activity lines for PricingCard display
    const actLines = [];
    if (hasLabo) {
      const up = Math.round(base * (1 - rl) * 100) / 100;
      actLines.push({ label: `${nb} activité${nb > 1 ? 's' : ''} × ${up} DT (avec labo −${Math.round(rl*100)}%)`, total: activiteCost });
    } else {
      if (nb >= 1) actLines.push({ label: `1ère activité`, unitPrice: base, total: base });
      if (nb >= 2) { const up2 = Math.round(base*(1-r2)*100)/100; actLines.push({ label: `2ème activité (−${Math.round(r2*100)}%)`, unitPrice: up2, total: up2 }); }
      if (nb >= 3) { const up3 = Math.round(base*(1-r3)*100)/100; actLines.push({ label: `${nb-2} activité${nb-2>1?'s':''} supp. × ${up3} DT (−${Math.round(r3*100)}%)`, total: Math.round((nb-2)*up3*100)/100 }); }
    }

    const onboardingPrice = parseFloat(
      nbl > 0 ? (tarifs['onboarding_avec_labo'] ?? 700) : (tarifs['onboarding_sans_labo'] ?? 500)
    );

    res.json({
      activite: { nb, total: activiteCost, lines: actLines },
      labo:     { nb: nbl, unitPrice: pLabo, total: laboCost },
      gerant:   { nb: nbg, unitPrice: pGer,  total: gerantCost },
      totalMensuel: total,
      onboardingPrice,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Extract active supplement promo info for a given applies_to type
// promoRows must be pre-filtered to active rows (date_fin IS NULL OR date_fin >= CURRENT_DATE)
const extractSupplPromo = (promoRows, appliesTo) => {
  const p = promoRows.find((r) => r.applies_to === appliesTo);
  if (!p) return null;
  return {
    type: p.type,
    discount: p.discount_supplement != null ? parseFloat(p.discount_supplement) : null,
    fixed: p.fixed_supplement != null ? parseFloat(p.fixed_supplement) : null,
  };
};

// Client: get supplement unit prices + current config for cost preview
const getSupplementPricing = async (req, res) => {
  const clientId = req.user.id;
  try {
    const tarifs = await loadAllTarifs();
    const aboRes = await pool.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId]);
    if (!aboRes.rows.length) return res.status(404).json({ message: 'Abonnement introuvable' });
    const aboId = aboRes.rows[0].id;
    const [configRes, promoRes] = await Promise.all([
      pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId]),
      pool.query(`SELECT applies_to, type, discount_supplement, fixed_supplement
                  FROM promotions WHERE abonnement_id = $1
                    AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)
                    AND applies_to IN ('supplement_activite','supplement_labo','supplement_gerant')`, [aboId]),
    ]);
    const config = configRes.rows[0] || null;

    const nbA = parseInt(config?.nb_activites) || 0;
    const nbL = parseInt(config?.nb_labos) || 0;
    const nbG = parseInt(config?.nb_gerants) || 0;
    const currentMensuel = config
      ? (computeBaseMensuelFromConfig(config, tarifs) || 0)
        + (computeBaseLaboFromConfig(config, tarifs) || 0)
        + (computeBaseGerantFromConfig(config, tarifs) || 0)
      : 0;

    res.json({
      prixActiviteSup: computeActiviteSupPrice(config, tarifs),
      prixLaboSup:     parseFloat(tarifs['labo_sup_mensuel'] ?? tarifs['labo_mensuel'] ?? 160),
      prixGerantSup:   parseFloat(tarifs['gerant_sup_mensuel'] ?? tarifs['gerant_mensuel'] ?? 80),
      currentMensuel,
      nbActivites: nbA, nbLabos: nbL, nbGerants: nbG,
      activitePromo: extractSupplPromo(promoRes.rows, 'supplement_activite'),
      laboPromo:     extractSupplPromo(promoRes.rows, 'supplement_labo'),
      gerantPromo:   extractSupplPromo(promoRes.rows, 'supplement_gerant'),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Admin version of getSupplementPricing — uses clientId from params
const getClientSupplementPricing = async (req, res) => {
  const { clientId } = req.params;
  try {
    const tarifs = await loadAllTarifs();
    const aboRes = await pool.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId]);
    if (!aboRes.rows.length) return res.status(404).json({ message: 'Abonnement introuvable' });
    const aboId = aboRes.rows[0].id;
    const [configRes, promoRes] = await Promise.all([
      pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId]),
      pool.query(`SELECT applies_to, type, discount_supplement, fixed_supplement
                  FROM promotions WHERE abonnement_id = $1
                    AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)
                    AND applies_to IN ('supplement_activite','supplement_labo','supplement_gerant')`, [aboId]),
    ]);
    const config = configRes.rows[0] || null;

    const nbA = parseInt(config?.nb_activites) || 0;
    const nbL = parseInt(config?.nb_labos) || 0;
    const nbG = parseInt(config?.nb_gerants) || 0;
    const activiteCost = config ? (computeBaseMensuelFromConfig(config, tarifs) || 0) : 0;
    const laboCost     = config ? (computeBaseLaboFromConfig(config, tarifs) || 0) : 0;
    const gerantCost   = config ? (computeBaseGerantFromConfig(config, tarifs) || 0) : 0;
    const currentMensuel = activiteCost + laboCost + gerantCost;

    res.json({
      prixActiviteSup: computeActiviteSupPrice(config, tarifs),
      prixLaboSup:     parseFloat(tarifs['labo_sup_mensuel'] ?? tarifs['labo_mensuel'] ?? 160),
      prixGerantSup:   parseFloat(tarifs['gerant_sup_mensuel'] ?? tarifs['gerant_mensuel'] ?? 80),
      currentMensuel, activiteCost, laboCost, gerantCost,
      nbActivites: nbA, nbLabos: nbL, nbGerants: nbG,
      activitePromo: extractSupplPromo(promoRes.rows, 'supplement_activite'),
      laboPromo:     extractSupplPromo(promoRes.rows, 'supplement_labo'),
      gerantPromo:   extractSupplPromo(promoRes.rows, 'supplement_gerant'),
    });
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
  listPromotions, createPromotion, updatePromotion, deletePromotion, insertPromoForAbonnement,
  getAbonnementConfig, updateAbonnementConfig, getPricingPreview, getSupplementPricing, getClientSupplementPricing,
  confirmInvite,
  allPaiements, allPromotions,
  enforcerStatuts,
  runSyncPromoStatuts,
  computeBaseMensuelFromConfig, computeBaseGerantFromConfig, computeBaseLaboFromConfig, computeActiviteSupPrice, loadAllTarifs,
};
