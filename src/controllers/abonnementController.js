const pool = require('../config/database');
const { sendInviteEmail, sendFactureEmail } = require('../services/emailService');
const { getSubmissionDocuments } = require('../services/docusealService');
const { generateFacturePdf } = require('../services/pdfService');
const { buildContratDocument } = require('../services/contractPdfService');

// ── Facture d'abonnement ──────────────────────────────────────────────────────
// Taux de TVA applicable aux factures (Tunisie : 19 %). Le montant enregistré
// (paiements.montant_dt) est considéré TTC ; HT et TVA en sont déduits afin que
// le TTC affiché corresponde exactement au montant réglé.
const FACTURE_TVA_RATE = Number(process.env.FACTURE_TVA_RATE || 19);

// Construit les données de facture déterministes à partir d'une ligne de paiement.
// Déterministe => la facture jointe à l'email et celle téléchargée sont identiques.
const buildFactureData = (paiement, client) => {
  const moisDate = new Date(paiement.mois);
  const year = moisDate.getFullYear();
  const numero = `LF-${year}-${String(paiement.id).padStart(5, '0')}`;
  const periodeLabel = moisDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const ttc = Math.round((Number(paiement.montant_dt) || 0) * 1000) / 1000;
  const ht = Math.round((ttc / (1 + FACTURE_TVA_RATE / 100)) * 1000) / 1000;
  const tva = Math.round((ttc - ht) * 1000) / 1000;
  // Date déterministe : date de règlement persistée, sinon repli sur le mois facturé
  // (toujours présent) — jamais l'horloge courante, pour que email == téléchargement.
  const dateFacture = paiement.date_paiement || paiement.mois;
  return {
    numero, periodeLabel, ttc, ht, tva, dateFacture,
    pdfParams: {
      numero, dateFacture, periodeLabel,
      clientNom: client?.nom || 'Client',
      clientEmail: client?.email || '',
      montantHt: ht, montantTva: tva, montantTtc: ttc, tvaRate: FACTURE_TVA_RATE,
    },
  };
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const mapAbonnement = (row) => ({
  id: row.id,
  clientId: row.client_id,
  clientNom: row.client_nom,
  clientEmail: row.client_email,
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
  moduleVenteActif: row.module_vente_actif ?? false,
  moduleVenteActivatedAt: row.module_vente_activated_at ?? null,
  moduleAcheteursActif: row.module_acheteurs_actif ?? false,
  moduleAcheteursActivatedAt: row.module_acheteurs_activated_at ?? null,
  contratAccepteLe: row.contrat_accepte_le ?? null,
  contratAccepteIp: row.contrat_accepte_ip ?? null,
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
  isSystem: row.is_system ?? false,   // promo verrouillée (1er mois offert) : non supprimable
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

// Les configs circulent en snake_case (lignes DB) ou camelCase (payloads) selon
// l'appelant — les fonctions de calcul acceptent les deux formes.
const cfgVal = (config, snake, camel) => config?.[snake] ?? config?.[camel];

// Prix de base d'une activité selon la FORMULE du compte (Basique = sans Espace
// Produit, Premium = avec). Compat : l'ancienne clé prix_base_activite sert de
// repli (elle valait le tarif « premium » avant la refonte formules).
const prixBaseActivite = (config, tarifs) => {
  const formule = cfgVal(config, 'formule_activites', 'formuleActivites') === 'basique' ? 'basique' : 'premium';
  return parseFloat(tarifs[`prix_base_activite_${formule}`] ?? tarifs['prix_base_activite'] ?? 200);
};

// Tiered/degressive pricing model
// Sans labo: 1er=base, 2ème=base*(1-r2%), 3ème+=base*(1-r3%) each
// Avec labo: all = base*(1-rl%) each
const computeBaseMensuelFromConfig = (config, tarifs) => {
  if (!config) return null;
  // Compte dépôt : 0 activité est une valeur VALIDE (coût activités = 0),
  // le repli à 1 ne s'applique qu'aux valeurs absentes/invalides.
  const nRaw = parseInt(cfgVal(config, 'nb_activites', 'nbActivites'));
  const n   = Number.isFinite(nRaw) && nRaw >= 0 ? nRaw : 1;
  if (n === 0) return 0;
  const nbl = parseInt(cfgVal(config, 'nb_labos', 'nbLabos'))     || 0;
  const base = prixBaseActivite(config, tarifs);
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
  const n = parseInt(cfgVal(config, 'nb_gerants', 'nbGerants')) || 0;
  if (n === 0) return 0;
  return n * parseFloat(tarifs['gerant_sup_mensuel'] ?? 80);
};

const computeBaseLaboFromConfig = (config, tarifs) => {
  if (!config) return null;
  const n = parseInt(cfgVal(config, 'nb_labos', 'nbLabos')) || 0;
  if (n === 0) return 0;
  return n * parseFloat(tarifs['labo_sup_mensuel'] ?? 160);
};

// Palier de facturation de l'option Acheteurs couvrant un quota donné
// (1-10 / 11-20 / 21-50 / 51-100 ; quota exceptionnel > 100 = prix du palier 100).
const palierAcheteurs = (nbAcheteurs) => {
  const n = parseInt(nbAcheteurs) || 0;
  if (n <= 0) return null;
  return n <= 10 ? 10 : n <= 20 ? 20 : n <= 50 ? 50 : 100;
};

const computeBaseAcheteursFromConfig = (config, tarifs) => {
  if (!config) return null;
  const palier = palierAcheteurs(cfgVal(config, 'nb_acheteurs', 'nbAcheteurs'));
  if (!palier) return 0;
  return Math.round(parseFloat(tarifs[`acheteurs_palier_${palier}`] ?? 0) * 100) / 100;
};

// Mensuel TOTAL d'une config = activités (formule) + labos + gérants + option acheteurs.
// Source unique — remplace les sommes dupliquées de l'ancien modèle.
const computeMensuelTotalFromConfig = (config, tarifs) => {
  if (!config) return null;
  return Math.round((
    (computeBaseMensuelFromConfig(config, tarifs) || 0)
    + (computeBaseLaboFromConfig(config, tarifs) || 0)
    + (computeBaseGerantFromConfig(config, tarifs) || 0)
    + (computeBaseAcheteursFromConfig(config, tarifs) || 0)
  ) * 100) / 100;
};

// Unit price for next supplement activité (tier n+1)
const computeActiviteSupPrice = (config, tarifs) => {
  if (!config) return parseFloat(tarifs['prix_base_activite_premium'] ?? tarifs['prix_base_activite'] ?? 200);
  const nbl  = parseInt(config.nb_labos)     || 0;
  const base = prixBaseActivite(config, tarifs);
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
  nbAcheteurs: row.nb_acheteurs ?? 0,
  formuleActivites: row.formule_activites || null,
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
        pe.module_vente_actif, pe.module_vente_activated_at,
        pe.module_acheteurs_actif, pe.module_acheteurs_activated_at,
        EXISTS(
          SELECT 1 FROM promotions pr
          WHERE pr.abonnement_id = a.id
            AND pr.date_debut <= CURRENT_DATE
            AND (pr.date_fin IS NULL OR pr.date_fin >= CURRENT_DATE)
        ) AS has_active_promo
      FROM abonnements a
      LEFT JOIN utilisateurs u ON u.id = a.client_id
      LEFT JOIN profil_entreprise pe ON pe.client_id = a.client_id
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
        pe.module_vente_actif, pe.module_vente_activated_at,
        pe.module_acheteurs_actif, pe.module_acheteurs_activated_at,
        EXISTS(
          SELECT 1 FROM promotions pr
          WHERE pr.abonnement_id = a.id
            AND pr.date_debut <= CURRENT_DATE
            AND (pr.date_fin IS NULL OR pr.date_fin >= CURRENT_DATE)
        ) AS has_active_promo
      FROM abonnements a
      LEFT JOIN utilisateurs u ON u.id = a.client_id
      LEFT JOIN profil_entreprise pe ON pe.client_id = a.client_id
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
        baseMensuel = computeMensuelTotalFromConfig(config, tarifs);
        baseOnboarding = parseFloat(config.montant_onboarding) || null;
      } else {
        // Compte sans config d'abonnement : rien à facturer (les clés legacy
        // entreprise_* ont été purgées avec l'ancien modèle compte_type)
        baseMensuel = null;
        baseOnboarding = null;
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
        const nbAch = parseInt(config.nb_acheteurs) || 0;
        const activiteCost  = computeBaseMensuelFromConfig(config, tarifs) || 0;
        const laboCost      = computeBaseLaboFromConfig(config, tarifs)    || 0;
        const gerantCost    = computeBaseGerantFromConfig(config, tarifs)  || 0;
        const acheteursCost = computeBaseAcheteursFromConfig(config, tarifs) || 0;
        abo.pricing.configBreakdown = {
          formuleActivites: config.formule_activites || null,
          activite:  { nb: nbA, total: activiteCost },
          labo:      { nb: nbL, total: laboCost },
          gerant:    { nb: nbG, total: gerantCost },
          acheteurs: { nb: nbAch, palier: palierAcheteurs(nbAch), total: acheteursCost },
          prixActiviteSup: computeActiviteSupPrice(config, tarifs),
          prixLaboSup:     parseFloat(tarifs['labo_sup_mensuel'] ?? 160),
          prixGerantSup:   parseFloat(tarifs['gerant_sup_mensuel'] ?? 80),
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
// config: { nbActivites, nbLabos, nbGerants, nbAcheteurs, formuleActivites, montantOnboarding }
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
    const nbActivites = config.nbActivites ?? 1;
    // La formule n'a de sens qu'avec des activités (compte dépôt = NULL)
    const formule = nbActivites >= 1
      ? (config.formuleActivites === 'basique' ? 'basique' : 'premium')
      : null;
    await pool.query(
      `INSERT INTO abonnement_config (abonnement_id, nb_activites, nb_labos, nb_gerants, nb_acheteurs, formule_activites, montant_onboarding)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [aboId, nbActivites, config.nbLabos || 0, config.nbGerants || 0, config.nbAcheteurs || 0, formule, config.montantOnboarding || 0]
    );
  }

  // Auto-create current month payment record
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const moisStr = firstOfMonth.toISOString().slice(0, 10);

  let baseMontant = 0;
  if (config) {
    const tarifs = await loadAllTarifs();
    baseMontant = computeMensuelTotalFromConfig(config, tarifs) || 0;
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
    const aboRes = await pool.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const { id: aboId } = aboRes.rows[0];

    // Check for existing payment this month
    const existingRes = await pool.query(
      'SELECT montant_dt, statut, date_paiement FROM paiements WHERE abonnement_id = $1 AND mois = $2',
      [aboId, moisStr]
    );

    const tarifs = await loadAllTarifs();

    // Try new config-based pricing first
    const configRes = await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId]);
    const config = configRes.rows[0] || null;

    let baseMensuel, baseGerant, baseLabo, baseAcheteurs;
    let hasGerant, hasLabo, hasAcheteurs;

    if (config) {
      baseMensuel   = computeBaseMensuelFromConfig(config, tarifs) || 0;
      baseGerant    = computeBaseGerantFromConfig(config, tarifs) || 0;
      baseLabo      = computeBaseLaboFromConfig(config, tarifs) || 0;
      baseAcheteurs = computeBaseAcheteursFromConfig(config, tarifs) || 0;
      hasGerant     = (config.nb_gerants || 0) > 0;
      hasLabo       = (config.nb_labos || 0) > 0;
      hasAcheteurs  = (config.nb_acheteurs || 0) > 0;
    } else {
      // Compte sans config : rien à facturer (clés legacy entreprise_* purgées)
      baseMensuel = 0;
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
      baseAcheteurs = 0;
      hasAcheteurs = false;
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

    // Mensualité promo applies to the FULL total (activités + labos + gérants + acheteurs)
    const baseTotal = baseMensuel + (hasGerant ? baseGerant : 0) + (hasLabo ? baseLabo : 0)
      + (hasAcheteurs ? baseAcheteurs : 0);

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
          baseAcheteurs: hasAcheteurs ? baseAcheteurs : 0,
        },
        supplementGerant: { base: baseGerant, effectif: 0, active: hasGerant, hasPromo: false, promoType: null },
        supplementLabo:   { base: baseLabo,   effectif: 0, active: hasLabo,   hasPromo: false, promoType: null },
        optionAcheteurs:  { base: baseAcheteurs, effectif: 0, active: hasAcheteurs, palier: palierAcheteurs(config?.nb_acheteurs) },
      };
    } else {
      const effectifGerant = hasGerant ? applyPromoSupplement(baseGerant, promoGerant) : 0;
      const effectifLabo   = hasLabo   ? applyPromoSupplement(baseLabo,   promoLabo)   : 0;
      const effectifAcheteurs = hasAcheteurs ? baseAcheteurs : 0;
      total = baseMensuel + effectifGerant + effectifLabo + effectifAcheteurs;
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
        optionAcheteurs: {
          base: baseAcheteurs, effectif: effectifAcheteurs, active: hasAcheteurs,
          palier: palierAcheteurs(config?.nb_acheteurs),
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
      total: Math.round(total * 100) / 100,
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
    const aboRes = await pool.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const { id: aboId } = aboRes.rows[0];

    // Normalize mois to first of month
    const moisDate = new Date(mois);
    moisDate.setDate(1);
    const moisStr = moisDate.toISOString().slice(0, 10);

    // Statut précédent (pour n'envoyer la facture qu'au PASSAGE à « payé »)
    const prevRes = await pool.query(
      'SELECT statut FROM paiements WHERE abonnement_id = $1 AND mois = $2',
      [aboId, moisStr]
    );
    const prevStatut = prevRes.rows[0]?.statut ?? null;

    // If no montant supplied, compute from config/tarif + promo
    let finalMontant = montant != null ? Number(montant) : null;
    if (finalMontant === null) {
      const tarifs = await loadAllTarifs();
      const configRes = await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId]);
      let base;
      if (configRes.rows.length > 0) {
        base = computeMensuelTotalFromConfig(configRes.rows[0], tarifs) || 0;
      } else {
        base = 0;
      }
      const promo = await getActivePromo(aboId, moisStr);
      finalMontant = applyPromoMensualite(base, promo);
    }

    // Date de règlement : si « payé » sans date explicite, on PERSISTE la date du jour une
    // seule fois (sinon la facture émise par email et celle re-téléchargée porteraient des
    // dates différentes). Une date déjà enregistrée n'est jamais écrasée sans saisie explicite.
    // Casts ::date explicites : deux paramètres inconnus dans un COALESCE sont sinon inférés
    // en text par Postgres → erreur 42804 contre la colonne date.
    const fallbackPayDate = statut === 'payé' ? new Date().toISOString().slice(0, 10) : null;
    const result = await pool.query(
      `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut, saisie_par, date_saisie, date_paiement, notes)
       VALUES ($1, $2, $3, $4, $5, NOW(), COALESCE($6::date, $8::date), $7)
       ON CONFLICT (abonnement_id, mois) DO UPDATE
       SET statut = $4, montant_dt = COALESCE($3, paiements.montant_dt),
           saisie_par = $5, date_saisie = NOW(),
           date_paiement = COALESCE($6::date, paiements.date_paiement, $8::date),
           notes = COALESCE($7, paiements.notes)
       RETURNING *`,
      [aboId, moisStr, finalMontant, statut, req.user.id, datePaiement || null, notes || null, fallbackPayDate]
    );
    const paiement = result.rows[0];

    // Facture pro à la VALIDATION d'un paiement (passage à « payé »).
    // Best-effort : n'impacte pas la réponse ni l'enregistrement du paiement.
    if (statut === 'payé' && prevStatut !== 'payé' && Number(paiement.montant_dt) > 0) {
      (async () => {
        try {
          const u = await pool.query('SELECT nom, email FROM utilisateurs WHERE id = $1', [clientId]);
          const client = u.rows[0];
          if (client?.email) {
            const fac = buildFactureData(paiement, client);
            const pdfBase64 = await generateFacturePdf(fac.pdfParams);
            await sendFactureEmail({
              to: client.email, nom: client.nom || 'Client',
              numero: fac.numero, periodeLabel: fac.periodeLabel,
              montantTtc: fac.ttc, dateReglement: fac.dateFacture, pdfBase64,
            });
            console.log(`[facture] ${fac.numero} envoyée à ${client.email}`);
          }
        } catch (e) {
          console.error('[facture] génération/envoi échoué:', e.message);
        }
      })();
    }

    res.json(mapPaiement(paiement));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET facture PDF d'un paiement payé (téléchargement admin ou client).
// scopeClientId : si fourni (client connecté), restreint au paiement de ce client.
const getFactureForPaiement = async (paiementId, scopeClientId = null) => {
  const params = [paiementId];
  let scopeCond = '';
  if (scopeClientId != null) { params.push(scopeClientId); scopeCond = ' AND a.client_id = $2'; }
  const r = await pool.query(
    `SELECT p.id, p.mois, p.montant_dt, p.statut, p.date_paiement,
            a.client_id, u.nom AS client_nom, u.email AS client_email
       FROM paiements p
       JOIN abonnements a ON a.id = p.abonnement_id
       LEFT JOIN utilisateurs u ON u.id = a.client_id
      WHERE p.id = $1${scopeCond}`,
    params
  );
  if (r.rows.length === 0) return { error: 404 };
  const row = r.rows[0];
  if (row.statut !== 'payé' || !(Number(row.montant_dt) > 0)) return { error: 400 };
  const fac = buildFactureData(
    { id: row.id, mois: row.mois, montant_dt: row.montant_dt, date_paiement: row.date_paiement },
    { nom: row.client_nom, email: row.client_email }
  );
  const pdfBase64 = await generateFacturePdf(fac.pdfParams);
  return { numero: fac.numero, buffer: Buffer.from(pdfBase64, 'base64') };
};

// Route admin : GET /api/abonnements/paiements/:paiementId/facture
const downloadFactureAdmin = async (req, res) => {
  try {
    const out = await getFactureForPaiement(parseInt(req.params.paiementId), null);
    if (out.error === 404) return res.status(404).json({ message: 'Paiement introuvable' });
    if (out.error === 400) return res.status(400).json({ message: 'Facture disponible uniquement pour un paiement réglé' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="facture-${out.numero}.pdf"`);
    res.send(out.buffer);
  } catch (err) {
    console.error('[facture] download admin:', err);
    res.status(500).json({ message: 'Erreur lors de la génération de la facture' });
  }
};

// Route client : GET /api/abonnements/mon-abonnement/paiements/:paiementId/facture
const downloadFactureClient = async (req, res) => {
  try {
    const out = await getFactureForPaiement(parseInt(req.params.paiementId), req.user.id);
    if (out.error === 404) return res.status(404).json({ message: 'Facture introuvable' });
    if (out.error === 400) return res.status(400).json({ message: 'Facture disponible uniquement pour un paiement réglé' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="facture-${out.numero}.pdf"`);
    res.send(out.buffer);
  } catch (err) {
    console.error('[facture] download client:', err);
    res.status(500).json({ message: 'Erreur lors de la génération de la facture' });
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
    isSystem,   // promo système (ex. 1er mois offert) : non supprimable ni éditable
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
        date_debut, months_duration, date_fin, created_by, is_system)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *, (date_debut <= CURRENT_DATE AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)) AS is_active`,
    [
      aboId, type, appliesTo,
      discountOnboarding || null, discountMensualite || null,
      fixedOnboarding || null, fixedMensualite || null,
      discountSupplement || null, fixedSupplement || null,
      dateDebut, monthsDuration || null, dateFin,
      createdById, isSystem === true,
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
      base = computeMensuelTotalFromConfig(config, tarifs) || 0;
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
    if (existing.is_system) return res.status(403).json({ message: 'Cette promotion est offerte par le système (1er mois offert) et ne peut pas être modifiée.' });

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
    if (p.is_system) return res.status(403).json({ message: 'Cette promotion est offerte par le système (1er mois offert) et ne peut pas être supprimée.' });

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

    const aboIds = missingAbo.rows.map((a) => a.id);
    const promoRows = await pool.query(
      `SELECT DISTINCT ON (abonnement_id) abonnement_id, type, discount_mensualite, fixed_mensualite, applies_to
       FROM promotions
       WHERE abonnement_id = ANY($1)
         AND date_debut <= $2::date
         AND (date_fin IS NULL OR date_fin >= $2::date)
         AND applies_to IN ('mensualite', 'les_deux')
       ORDER BY abonnement_id, created_at DESC`,
      [aboIds, thisMonth]
    );
    const promoMap = new Map(promoRows.rows.map((p) => [p.abonnement_id, p]));

    for (const abo of missingAbo.rows) {
      const cfg = configMap.get(abo.id) || null;
      const base = cfg ? (computeMensuelTotalFromConfig(cfg, tarifs) || 0) : 0;
      const promo = promoMap.get(abo.id) || null;
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
  const { clientId, statut, mois, limit, offset } = req.query;
  try {
    const conditions = ['1=1'];
    const params = [];
    let i = 1;
    if (clientId) { conditions.push(`a.client_id = $${i++}`); params.push(clientId); }
    if (statut)   { conditions.push(`p.statut = $${i++}`);    params.push(statut); }
    if (mois)     { conditions.push(`DATE_TRUNC('month', p.mois) = DATE_TRUNC('month', $${i++}::date)`); params.push(mois); }
    const pageSize = Math.min(parseInt(limit) || 200, 500);
    const pageOffset = parseInt(offset) || 0;
    params.push(pageSize, pageOffset);
    const result = await pool.query(`
      SELECT p.id, p.mois, p.montant_dt, p.statut, p.date_saisie, p.date_paiement, p.notes,
             a.client_id,
             u.nom AS client_nom, u.email AS client_email
      FROM paiements p
      JOIN abonnements a ON a.id = p.abonnement_id
      LEFT JOIN utilisateurs u ON u.id = a.client_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.mois DESC, u.nom ASC
      LIMIT $${i} OFFSET $${i + 1}
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
  const { nbActivites, nbLabos, nbGerants, nbAcheteurs, montantOnboarding } = req.body;
  const nA = parseInt(nbActivites, 10);
  if (!Number.isFinite(nA) || nA < 0) return res.status(400).json({ message: 'nb_activites >= 0 requis' });
  // Compte dépôt : 0 activité autorisé SEULEMENT avec au moins un labo
  if (nA === 0 && (parseInt(nbLabos, 10) || 0) < 1) {
    return res.status(400).json({ message: 'Un compte sans activité doit avoir au moins un labo (compte dépôt)' });
  }
  // Formule des activités : préservée si absente du payload ; forcée à NULL si 0 activité ;
  // défaut premium quand des activités apparaissent sur un compte qui n'en avait pas.
  const formuleIn = req.body.formuleActivites !== undefined
    ? (req.body.formuleActivites === 'basique' ? 'basique' : 'premium')
    : null;
  if (req.body.formuleActivites !== undefined && !['basique', 'premium'].includes(req.body.formuleActivites)) {
    return res.status(400).json({ message: 'Formule invalide (basique ou premium)' });
  }
  // Option Acheteurs : mêmes gardes qu'à la création (palier ≤ 100, labo requis)
  const nAch = nbAcheteurs != null ? parseInt(nbAcheteurs, 10) : null;
  if (nAch !== null && (!Number.isFinite(nAch) || nAch < 0 || nAch > 100)) {
    return res.status(400).json({ message: 'Quota acheteurs invalide (paliers de 1 à 100)' });
  }
  if (nAch !== null && nAch > 0 && (parseInt(nbLabos, 10) || 0) < 1) {
    return res.status(400).json({ message: "L'option Acheteurs nécessite au moins un labo" });
  }
  try {
    const aboRes = await pool.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const aboId = aboRes.rows[0].id;
    // Labo seul interdit : 0 activité exige l'option Acheteurs (valeur du payload,
    // sinon quota déjà en base — nb_acheteurs est préservé quand il n'est pas envoyé).
    if (nA === 0) {
      let effAcheteurs = nAch;
      if (effAcheteurs === null) {
        const cur = await pool.query('SELECT nb_acheteurs FROM abonnement_config WHERE abonnement_id = $1', [aboId]);
        effAcheteurs = parseInt(cur.rows[0]?.nb_acheteurs) || 0;
      }
      if (effAcheteurs === 0) {
        return res.status(400).json({ message: "Un labo sans activité nécessite l'option Acheteurs (compte dépôt = labo + acheteurs)" });
      }
    }
    // nb_acheteurs / formule : préservés si le payload ne les envoie pas.
    const result = await pool.query(
      `INSERT INTO abonnement_config (abonnement_id, nb_activites, nb_labos, nb_gerants, nb_acheteurs, formule_activites, montant_onboarding)
       VALUES ($1, $2, $3, $4, COALESCE($5::int, 0),
               CASE WHEN $2::int = 0 THEN NULL ELSE COALESCE($7, 'premium') END, $6)
       ON CONFLICT (abonnement_id) DO UPDATE
       SET nb_activites = EXCLUDED.nb_activites,
           nb_labos = EXCLUDED.nb_labos,
           nb_gerants = EXCLUDED.nb_gerants,
           nb_acheteurs = COALESCE($5::int, abonnement_config.nb_acheteurs),
           formule_activites = CASE WHEN $2::int = 0 THEN NULL
                                    ELSE COALESCE($7, abonnement_config.formule_activites, 'premium') END,
           montant_onboarding = EXCLUDED.montant_onboarding,
           updated_at = NOW()
       RETURNING *`,
      [aboId, nbActivites, nbLabos ?? 0, nbGerants ?? 0, nbAcheteurs ?? null, montantOnboarding ?? 0, formuleIn]
    );
    res.json(mapAbonnementConfig(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Pricing preview (for add-client step 2) ───────────────────────────────────

const getPricingPreview = async (req, res) => {
  const { nbActivites, nbLabos, nbGerants, nbAcheteurs, formuleActivites } = req.query;
  try {
    const tarifs = await loadAllTarifs();
    const nbRaw = parseInt(nbActivites);
    const nb  = Number.isFinite(nbRaw) && nbRaw >= 0 ? nbRaw : 1;
    const nbl = parseInt(nbLabos)     || 0;
    const nbg = parseInt(nbGerants)   || 0;
    const nba = parseInt(nbAcheteurs) || 0;
    const formule = formuleActivites === 'basique' ? 'basique' : 'premium';

    const mockConfig = { nb_activites: nb, nb_labos: nbl, nb_gerants: nbg, nb_acheteurs: nba, formule_activites: formule };
    const activiteCost  = computeBaseMensuelFromConfig(mockConfig, tarifs) || 0;
    const laboCost      = computeBaseLaboFromConfig(mockConfig, tarifs)    || 0;
    const gerantCost    = computeBaseGerantFromConfig(mockConfig, tarifs)  || 0;
    const acheteursCost = computeBaseAcheteursFromConfig(mockConfig, tarifs) || 0;
    const total         = computeMensuelTotalFromConfig(mockConfig, tarifs) || 0;

    const base   = prixBaseActivite(mockConfig, tarifs);
    const pLabo  = parseFloat(tarifs['labo_sup_mensuel']  ?? 160);
    const pGer   = parseFloat(tarifs['gerant_sup_mensuel'] ?? 80);
    const hasLabo = nbl > 0;
    const rl = parseFloat(tarifs['remise_avec_labo']            ?? 30) / 100;
    const r2 = parseFloat(tarifs['remise_2eme_sans_labo']       ?? 20) / 100;
    const r3 = parseFloat(tarifs['remise_3eme_plus_sans_labo']  ?? 40) / 100;
    const formuleLabel = formule === 'basique' ? 'Basique' : 'Premium';

    // Build per-tier activity lines for PricingCard display
    const actLines = [];
    if (hasLabo && nb >= 1) {
      const up = Math.round(base * (1 - rl) * 100) / 100;
      actLines.push({ label: `${nb} activité${nb > 1 ? 's' : ''} ${formuleLabel} × ${up} DT (avec labo −${Math.round(rl*100)}%)`, total: activiteCost });
    } else {
      if (nb >= 1) actLines.push({ label: `1ère activité ${formuleLabel}`, unitPrice: base, total: base });
      if (nb >= 2) { const up2 = Math.round(base*(1-r2)*100)/100; actLines.push({ label: `2ème activité (−${Math.round(r2*100)}%)`, unitPrice: up2, total: up2 }); }
      if (nb >= 3) { const up3 = Math.round(base*(1-r3)*100)/100; actLines.push({ label: `${nb-2} activité${nb-2>1?'s':''} supp. × ${up3} DT (−${Math.round(r3*100)}%)`, total: Math.round((nb-2)*up3*100)/100 }); }
    }

    const onboardingPrice = parseFloat(
      nbl > 0 ? (tarifs['onboarding_avec_labo'] ?? 700) : (tarifs['onboarding_sans_labo'] ?? 500)
    );

    res.json({
      formuleActivites: nb >= 1 ? formule : null,
      activite:  { nb, total: activiteCost, lines: actLines },
      labo:      { nb: nbl, unitPrice: pLabo, total: laboCost },
      gerant:    { nb: nbg, unitPrice: pGer,  total: gerantCost },
      acheteurs: { nb: nba, palier: palierAcheteurs(nba), total: acheteursCost },
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
    const [configRes, promoRes, mensPromoRes] = await Promise.all([
      pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId]),
      pool.query(`SELECT applies_to, type, discount_supplement, fixed_supplement
                  FROM promotions WHERE abonnement_id = $1
                    AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)
                    AND applies_to IN ('supplement_activite','supplement_labo','supplement_gerant')`, [aboId]),
      pool.query(`SELECT type, discount_mensualite, fixed_mensualite, applies_to
                  FROM promotions WHERE abonnement_id = $1
                    AND date_debut <= CURRENT_DATE
                    AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)
                    AND applies_to IN ('mensualite','les_deux')
                  ORDER BY date_debut DESC LIMIT 1`, [aboId]),
    ]);
    const config = configRes.rows[0] || null;
    const mensPromo = mensPromoRes.rows[0] || null;

    const nbA = parseInt(config?.nb_activites) || 0;
    const nbL = parseInt(config?.nb_labos) || 0;
    const nbG = parseInt(config?.nb_gerants) || 0;
    const nbAch = parseInt(config?.nb_acheteurs) || 0;
    const currentMensuel = config ? (computeMensuelTotalFromConfig(config, tarifs) || 0) : 0;

    res.json({
      prixActiviteSup: computeActiviteSupPrice(config, tarifs),
      prixLaboSup:     parseFloat(tarifs['labo_sup_mensuel'] ?? 160),
      prixGerantSup:   parseFloat(tarifs['gerant_sup_mensuel'] ?? 80),
      currentMensuel,
      currentMensuelEffectif: applyPromoMensualite(currentMensuel, mensPromo),
      mensPromo,
      nbActivites: nbA, nbLabos: nbL, nbGerants: nbG,
      // Option Acheteurs : quota/palier actuels + barème des paliers, pour proposer
      // l'activation ou le passage à un palier supérieur depuis la page Demandes.
      nbAcheteurs: nbAch,
      palierAcheteurs: palierAcheteurs(nbAch),
      acheteursCost: config ? (computeBaseAcheteursFromConfig(config, tarifs) || 0) : 0,
      paliersAcheteurs: [10, 20, 50, 100].map((p) => ({
        palier: p,
        prix: Math.round(parseFloat(tarifs[`acheteurs_palier_${p}`] ?? 0) * 100) / 100,
      })),
      formuleActivites: config?.formule_activites || null,
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
    const [configRes, promoRes, mensPromoRes] = await Promise.all([
      pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId]),
      pool.query(`SELECT applies_to, type, discount_supplement, fixed_supplement
                  FROM promotions WHERE abonnement_id = $1
                    AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)
                    AND applies_to IN ('supplement_activite','supplement_labo','supplement_gerant')`, [aboId]),
      pool.query(`SELECT type, discount_mensualite, fixed_mensualite, applies_to
                  FROM promotions WHERE abonnement_id = $1
                    AND date_debut <= CURRENT_DATE
                    AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)
                    AND applies_to IN ('mensualite','les_deux')
                  ORDER BY date_debut DESC LIMIT 1`, [aboId]),
    ]);
    const config = configRes.rows[0] || null;
    const mensPromo = mensPromoRes.rows[0] || null;

    const nbA = parseInt(config?.nb_activites) || 0;
    const nbL = parseInt(config?.nb_labos) || 0;
    const nbG = parseInt(config?.nb_gerants) || 0;
    const nbAch = parseInt(config?.nb_acheteurs) || 0;
    const activiteCost  = config ? (computeBaseMensuelFromConfig(config, tarifs) || 0) : 0;
    const laboCost      = config ? (computeBaseLaboFromConfig(config, tarifs) || 0) : 0;
    const gerantCost    = config ? (computeBaseGerantFromConfig(config, tarifs) || 0) : 0;
    const acheteursCost = config ? (computeBaseAcheteursFromConfig(config, tarifs) || 0) : 0;
    const currentMensuel = Math.round((activiteCost + laboCost + gerantCost + acheteursCost) * 100) / 100;

    res.json({
      prixActiviteSup: computeActiviteSupPrice(config, tarifs),
      prixLaboSup:     parseFloat(tarifs['labo_sup_mensuel'] ?? 160),
      prixGerantSup:   parseFloat(tarifs['gerant_sup_mensuel'] ?? 80),
      currentMensuel, activiteCost, laboCost, gerantCost, acheteursCost,
      currentMensuelEffectif: applyPromoMensualite(currentMensuel, mensPromo),
      mensPromo,
      nbActivites: nbA, nbLabos: nbL, nbGerants: nbG,
      nbAcheteurs: nbAch,
      palierAcheteurs: palierAcheteurs(nbAch),
      paliersAcheteurs: [10, 20, 50, 100].map((p) => ({
        palier: p,
        prix: Math.round(parseFloat(tarifs[`acheteurs_palier_${p}`] ?? 0) * 100) / 100,
      })),
      formuleActivites: config?.formule_activites || null,
      activitePromo: extractSupplPromo(promoRes.rows, 'supplement_activite'),
      laboPromo:     extractSupplPromo(promoRes.rows, 'supplement_labo'),
      gerantPromo:   extractSupplPromo(promoRes.rows, 'supplement_gerant'),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const toggleModuleVente = async (req, res) => {
  const { clientId } = req.params;
  const { actif } = req.body;
  try {
    // UPSERT: create profil_entreprise if missing, then set module_vente_actif
    await pool.query(
      `INSERT INTO profil_entreprise (client_id, nom, email)
       SELECT $1, nom, email FROM utilisateurs WHERE id = $1
       ON CONFLICT (client_id) DO NOTHING`,
      [clientId]
    );
    const r = await pool.query(
      `UPDATE profil_entreprise
       SET module_vente_actif = $1,
           module_vente_activated_at = CASE WHEN $1 THEN COALESCE(module_vente_activated_at, NOW()) ELSE NULL END
       WHERE client_id = $2
       RETURNING module_vente_actif, module_vente_activated_at`,
      [!!actif, clientId]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Client introuvable' });
    res.json({ moduleVenteActif: r.rows[0].module_vente_actif, moduleVenteActivatedAt: r.rows[0].module_vente_activated_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/abonnements/client/:clientId/module-acheteurs — activation admin directe.
// Body { actif, nbAcheteurs? } : nbAcheteurs met à jour le quota de la config (si config existante).
const toggleModuleAcheteurs = async (req, res) => {
  const { clientId } = req.params;
  const { actif, nbAcheteurs } = req.body;
  try {
    await pool.query(
      `INSERT INTO profil_entreprise (client_id, nom, email)
       SELECT $1, nom, email FROM utilisateurs WHERE id = $1
       ON CONFLICT (client_id) DO NOTHING`,
      [clientId]
    );
    const r = await pool.query(
      `UPDATE profil_entreprise
       SET module_acheteurs_actif = $1,
           module_acheteurs_activated_at = CASE WHEN $1 THEN COALESCE(module_acheteurs_activated_at, NOW()) ELSE NULL END
       WHERE client_id = $2
       RETURNING module_acheteurs_actif, module_acheteurs_activated_at`,
      [!!actif, clientId]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Client introuvable' });

    let quota = null;
    // Désactivation du module ⇒ quota remis à 0 (fin de la facturation par palier)
    const nb = actif ? parseInt(nbAcheteurs, 10) : 0;
    if (Number.isFinite(nb) && nb > 100) {
      return res.status(400).json({ message: 'Quota acheteurs invalide (paliers de 1 à 100)' });
    }
    if (Number.isFinite(nb) && nb >= 0) {
      const q = await pool.query(
        `UPDATE abonnement_config SET nb_acheteurs = $1, updated_at = NOW()
         WHERE abonnement_id = (SELECT id FROM abonnements WHERE client_id = $2)
         RETURNING nb_acheteurs`,
        [nb, clientId]
      );
      quota = q.rows[0]?.nb_acheteurs ?? null;
    }
    res.json({
      moduleAcheteursActif: r.rows[0].module_acheteurs_actif,
      moduleAcheteursActivatedAt: r.rows[0].module_acheteurs_activated_at,
      nbAcheteurs: quota,
      palierAcheteurs: palierAcheteurs(quota),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Calcule le détail tarifaire effectif (base + promotion active) d'un client.
// Réutilisé pour les contrats et avenants Docuseal. Lit tout depuis la base.
const computeEffectivePricing = async (clientId) => {
  const tarifs = await loadAllTarifs();
  const aboRes = await pool.query(
    `SELECT id, montant_onboarding FROM abonnements WHERE client_id = $1 ORDER BY id DESC LIMIT 1`,
    [clientId]
  );
  if (aboRes.rows.length === 0) return null;
  const abo = aboRes.rows[0];
  const cfgRes = await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [abo.id]);
  const config = cfgRes.rows[0] || null;

  let baseMensuel, baseOnboarding;
  if (config) {
    baseMensuel = computeMensuelTotalFromConfig(config, tarifs) || 0;
    baseOnboarding = parseFloat(config.montant_onboarding) || parseFloat(abo.montant_onboarding) || 0;
  } else {
    baseMensuel = 0;
    baseOnboarding = parseFloat(abo.montant_onboarding || 0);
  }

  const promoRes = await pool.query(
    `SELECT * FROM promotions
      WHERE abonnement_id = $1
        AND date_debut <= CURRENT_DATE
        AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)
      ORDER BY date_debut DESC`,
    [abo.id]
  );
  const promos = promoRes.rows;
  const promoMens = promos.find((p) => ['mensualite', 'les_deux'].includes(p.applies_to)) || null;
  const promoOb   = promos.find((p) => ['onboarding', 'les_deux'].includes(p.applies_to)) || null;

  const effOnboarding = promoOb ? applyPromoOnboarding(baseOnboarding, promoOb) : baseOnboarding;
  const effMensuel    = promoMens ? applyPromoMensualite(baseMensuel, promoMens) : baseMensuel;

  // Durée promo mensualité + date de reprise du tarif de base
  let promoMonths = null, baseResumeDate = null;
  if (promoMens) {
    promoMonths = promoMens.months_duration || null;
    if (promoMens.date_fin) {
      const d = new Date(promoMens.date_fin);
      d.setDate(d.getDate() + 1);
      baseResumeDate = d;
    }
  }

  return {
    abonnementId: abo.id,
    baseOnboarding, effOnboarding,
    baseMensuel, effMensuel,
    promoMens, promoOb,
    promoMonths, baseResumeDate,
    hasPromo: !!(promoMens || promoOb),
    formuleActivites: config?.formule_activites || null,
    nbAcheteurs: parseInt(config?.nb_acheteurs) || 0,
    palierAcheteurs: palierAcheteurs(config?.nb_acheteurs),
  };
};

// Calcule la tarification d'un avenant : nouvelle config (actuelle + suppléments) et
// nouvelle mensualité effective (promo mensualité active appliquée). Pour l'avenant Docuseal.
// setAcheteurs = QUOTA TOTAL cible de l'option Acheteurs (les paliers ne s'additionnent
// pas) ; null/undefined = quota inchangé.
const computeAvenantPricing = async (clientId, { addActivites = 0, addLabos = 0, addGerants = 0, setAcheteurs = null }) => {
  const tarifs = await loadAllTarifs();
  const aboRes = await pool.query(
    `SELECT id FROM abonnements WHERE client_id = $1 ORDER BY id DESC LIMIT 1`,
    [clientId]
  );
  if (aboRes.rows.length === 0) return null;
  const aboId = aboRes.rows[0].id;
  const cfgRes = await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId]);
  const cur = cfgRes.rows[0] || { nb_activites: 1, nb_labos: 0, nb_gerants: 0, nb_acheteurs: 0, formule_activites: 'premium' };

  const newCfg = {
    nb_activites: (parseInt(cur.nb_activites) || 0) + (addActivites || 0),
    nb_labos:     (parseInt(cur.nb_labos)     || 0) + (addLabos     || 0),
    nb_gerants:   (parseInt(cur.nb_gerants)   || 0) + (addGerants   || 0),
    nb_acheteurs: setAcheteurs != null ? (parseInt(setAcheteurs) || 0) : (parseInt(cur.nb_acheteurs) || 0),
    formule_activites: cur.formule_activites || 'premium',
  };

  const baseMensuel = computeMensuelTotalFromConfig(newCfg, tarifs) || 0;

  const promoRes = await pool.query(
    `SELECT * FROM promotions
      WHERE abonnement_id = $1
        AND date_debut <= CURRENT_DATE
        AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)
        AND applies_to IN ('mensualite', 'les_deux')
      ORDER BY date_debut DESC LIMIT 1`,
    [aboId]
  );
  const promoMens = promoRes.rows[0] || null;
  const effMensuel = promoMens ? applyPromoMensualite(baseMensuel, promoMens) : baseMensuel;

  return {
    abonnementId: aboId,
    nbActivites: newCfg.nb_activites, nbLabos: newCfg.nb_labos, nbGerants: newCfg.nb_gerants,
    formuleActivites: newCfg.formule_activites,
    nbAcheteurs: newCfg.nb_acheteurs,
    palierAcheteurs: palierAcheteurs(newCfg.nb_acheteurs),
    baseMensuel, effMensuel,
    promoMens,
    promoMonths: promoMens ? (promoMens.months_duration || null) : null,
    hasPromo: !!promoMens,
  };
};

// Contrat actif du client = dernier avenant signé, sinon le contrat initial.
const findActiveContract = async (clientId) => {
  const av = await pool.query(
    `SELECT docuseal_submission_id, traite_le
       FROM support_demandes
      WHERE client_id = $1 AND type = 'supplement'
        AND docuseal_submission_id IS NOT NULL AND statut = 'validée'
      ORDER BY traite_le DESC NULLS LAST, id DESC
      LIMIT 1`,
    [clientId]
  );
  if (av.rows[0]?.docuseal_submission_id) {
    return { submissionId: av.rows[0].docuseal_submission_id, date: av.rows[0].traite_le, kind: 'avenant' };
  }
  const ab = await pool.query(
    `SELECT contrat_submission_id, contrat_accepte_le
       FROM abonnements WHERE client_id = $1 ORDER BY id DESC LIMIT 1`,
    [clientId]
  );
  if (ab.rows[0]?.contrat_submission_id) {
    return { submissionId: ab.rows[0].contrat_submission_id, date: ab.rows[0].contrat_accepte_le, kind: 'contrat' };
  }
  return null;
};

// GET /api/abonnements/contrat-actif[?info=1] — info (dispo + date) ou téléchargement du PDF (proxifié).
const getContratActif = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const active = await findActiveContract(clientId);
    if (req.query.info === '1') {
      return res.json({ available: !!active, date: active?.date || null, kind: active?.kind || null });
    }
    if (!active) return res.status(404).json({ message: 'Aucun contrat signé disponible' });
    const docs = await getSubmissionDocuments(active.submissionId);
    if (!docs.length) return res.status(404).json({ message: "Le contrat signé n'est pas encore disponible" });
    const fileRes = await fetch(docs[0].url);
    if (!fileRes.ok) return res.status(502).json({ message: 'Contrat momentanément indisponible' });
    const buf = Buffer.from(await fileRes.arrayBuffer());
    const base = String(docs[0].name || (active.kind === 'avenant' ? 'contrat-avenant' : 'contrat')).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buf.length);
    return res.send(buf);
  } catch (err) {
    console.error('[contrat-actif]', err.message);
    res.status(500).json({ message: 'Erreur lors de la récupération du contrat' });
  }
};

// ── Contrat côté ADMIN ────────────────────────────────────────────────────────

const intOr = (v, d) => (Number.isFinite(parseInt(v)) ? parseInt(v) : d);

// Régénère le document contractuel d'un client depuis sa config réelle — MÊME
// builder (charte contractuelle) que le document envoyé en signature DocuSeal.
const regenerateContratPdf = async (clientId) => {
  const infoRes = await pool.query(
    `SELECT u.nom, u.email, u.telephone, pe.adresse,
            a.created_at AS abo_created_at, a.contrat_accepte_le
       FROM utilisateurs u
       LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
       LEFT JOIN abonnements a ON a.client_id = u.id
      WHERE u.id = $1 AND u.role = 'client'
      ORDER BY a.id DESC
      LIMIT 1`,
    [clientId]
  );
  if (!infoRes.rows.length) return null;
  const info = infoRes.rows[0];
  const pricing = await computeEffectivePricing(clientId);
  if (!pricing) return null;
  const cfgRes = await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [pricing.abonnementId]);
  const cfg = cfgRes.rows[0] || {};
  return buildContratDocument({
    abonnementId: pricing.abonnementId,
    client: { nom: info.nom, email: info.email, telephone: info.telephone, adresse: info.adresse },
    config: {
      nbActivites: intOr(cfg.nb_activites, 1),
      nbLabos: intOr(cfg.nb_labos, 0),
      nbGerants: intOr(cfg.nb_gerants, 0),
      formuleActivites: cfg.formule_activites || null,
    },
    pricing,
    // Régénération d'un contrat EXISTANT : réf avec l'année d'origine (celle que
    // visent les avenants « Contrat initial : CTR-YYYY-NNNNN ») et date d'origine.
    abonnementDate: info.abo_created_at || null,
    dateContrat: info.contrat_accepte_le || info.abo_created_at || null,
    // Téléchargement admin : ne jamais échouer sur le garde placeholders (warn suffit)
    strict: false,
  });
};

// GET /api/abonnements/client/:clientId/contrat-pdf — super admin.
// Renvoie le contrat tel que le client le connaît : le document SIGNÉ DocuSeal
// (contrat initial ou dernier avenant) si disponible, sinon le document
// contractuel régénéré depuis la config courante (même builder que l'envoi).
const getClientContratPdf = async (req, res) => {
  const { clientId } = req.params;
  try {
    const active = await findActiveContract(clientId);
    if (active) {
      try {
        const docs = await getSubmissionDocuments(active.submissionId);
        if (docs.length) {
          const fileRes = await fetch(docs[0].url);
          if (fileRes.ok) {
            const buf = Buffer.from(await fileRes.arrayBuffer());
            const base = String(docs[0].name || 'contrat').replace(/[^a-zA-Z0-9._-]/g, '_');
            const filename = base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Length', buf.length);
            return res.send(buf);
          }
        }
      } catch (e) {
        // Signé momentanément indisponible (DocuSeal) → on sert le régénéré
        console.warn('[contrat-admin] contrat signé indisponible, régénération:', e.message);
      }
    }
    const docu = await regenerateContratPdf(clientId);
    if (!docu) return res.status(404).json({ message: 'Aucun contrat disponible pour ce client' });
    const buf = Buffer.from(docu.base64, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="contrat-${docu.ref}.pdf"`);
    res.setHeader('Content-Length', buf.length);
    return res.send(buf);
  } catch (err) {
    console.error('[contrat-admin]', err.message);
    // 502 (jamais 500) : échec scopé à l'action — la 500 déclencherait la
    // redirection globale /error/500 et éjecterait l'admin de la page Clients.
    res.status(502).json({ message: 'Contrat momentanément indisponible' });
  }
};

// POST /api/abonnements/contrat-preview — super admin (wizard Ajout Client).
// Le client n'existe pas encore : la config arrive dans le body et le document
// est généré avec le MÊME builder que celui envoyé en signature à la création.
// Body : { nom, email, telephone, nbActivites, nbLabos, nbGerants,
//          formuleActivites, nbAcheteurs, montantOnboarding, promotions[] }
// (promotions au format mapPromoForApi du front : appliesTo/type/discount*/fixed*/monthsDuration/dateDebut)
const previewContratPdf = async (req, res) => {
  try {
    const { nom, email, telephone } = req.body;
    const nA = ((v) => (Number.isFinite(v) && v >= 0 ? v : 1))(parseInt(req.body.nbActivites));
    const nbLabos = parseInt(req.body.nbLabos) || 0;
    const nbGerants = parseInt(req.body.nbGerants) || 0;
    const nbAcheteurs = parseInt(req.body.nbAcheteurs) || 0;
    const formule = nA >= 1 ? (req.body.formuleActivites === 'basique' ? 'basique' : 'premium') : null;
    const montantOnboarding = parseFloat(req.body.montantOnboarding) || 0;
    const promotions = Array.isArray(req.body.promotions) ? req.body.promotions : [];

    const tarifs = await loadAllTarifs();
    const mockCfg = { nb_activites: nA, nb_labos: nbLabos, nb_gerants: nbGerants, nb_acheteurs: nbAcheteurs, formule_activites: formule || 'premium' };
    const baseMensuel = computeMensuelTotalFromConfig(mockCfg, tarifs) || 0;

    // Pseudo-rangées promo (clés snake_case de la table promotions) pour réutiliser
    // applyPromoMensualite / applyPromoOnboarding à l'identique du flux réel.
    const toRow = (p) => ({
      type: p.type,
      applies_to: p.appliesTo,
      discount_mensualite: p.discountMensualite ?? null,
      fixed_mensualite: p.fixedMensualite ?? null,
      discount_onboarding: p.discountOnboarding ?? null,
      fixed_onboarding: p.fixedOnboarding ?? null,
    });
    // Miroir de computeEffectivePricing (date_debut <= CURRENT_DATE) : une promo à
    // date FUTURE ne figure pas sur le contrat réel envoyé à la signature — elle ne
    // doit pas non plus figurer sur l'aperçu (sinon l'admin valide un document
    // différent de celui que le client signera).
    const todayStr = new Date().toISOString().slice(0, 10);
    const isActive = (p) => !p.dateDebut || String(p.dateDebut).slice(0, 10) <= todayStr;
    const srcMens = promotions.find((p) => ['mensualite', 'les_deux'].includes(p.appliesTo) && isActive(p)) || null;
    const srcOb = promotions.find((p) => ['onboarding', 'les_deux'].includes(p.appliesTo) && isActive(p)) || null;
    const promoMens = srcMens ? toRow(srcMens) : null;
    const promoOb = srcOb ? toRow(srcOb) : null;
    const effMensuel = promoMens ? applyPromoMensualite(baseMensuel, promoMens) : baseMensuel;
    const effOnboarding = promoOb ? applyPromoOnboarding(montantOnboarding, promoOb) : montantOnboarding;

    // Durée + date de reprise du tarif de base (promo mensualité limitée dans le temps)
    let promoMonths = null;
    let baseResumeDate = null;
    if (srcMens && srcMens.monthsDuration) {
      promoMonths = parseInt(srcMens.monthsDuration) || null;
      if (promoMonths && srcMens.dateDebut) {
        const d = new Date(srcMens.dateDebut);
        if (!Number.isNaN(d.getTime())) {
          d.setMonth(d.getMonth() + promoMonths);
          baseResumeDate = d;
        }
      }
    }

    const pricing = {
      abonnementId: 0,
      baseOnboarding: montantOnboarding, effOnboarding,
      baseMensuel, effMensuel,
      promoMens, promoOb, promoMonths, baseResumeDate,
      hasPromo: !!(promoMens || promoOb),
      formuleActivites: formule,
      nbAcheteurs,
      palierAcheteurs: palierAcheteurs(nbAcheteurs),
    };
    const docu = await buildContratDocument({
      abonnementId: 0,
      client: { nom: nom || 'Client', email, telephone },
      config: { nbActivites: nA, nbLabos, nbGerants, formuleActivites: formule },
      pricing,
      // Aperçu wizard : ne jamais bloquer la création de client sur le garde placeholders
      strict: false,
    });
    res.json({ pdfBase64: docu.base64 });
  } catch (err) {
    console.error('[contrat-preview]', err.message);
    // 422 (jamais 500) : l'intercepteur front redirige toute 500 vers /error/500,
    // ce qui détruirait le wizard et la saisie de l'admin — ici l'échec doit rester
    // inline (pdfError) et ne pas empêcher la création (repli backend).
    res.status(422).json({ message: 'Erreur lors de la génération du contrat' });
  }
};

module.exports = {
  getContratActif, getClientContratPdf, previewContratPdf,
  getTarifs, updateTarif,
  computeEffectivePricing, computeAvenantPricing,
  listAbonnements, getAbonnement, createAbonnement,
  updateOnboarding, updateProlongation, updateNotes, updateMode, toggleModuleVente, toggleModuleAcheteurs,
  upsertPaiement,
  downloadFactureAdmin, downloadFactureClient,
  getMontantMois,
  listPromotions, createPromotion, updatePromotion, deletePromotion, insertPromoForAbonnement,
  getAbonnementConfig, updateAbonnementConfig, getPricingPreview, getSupplementPricing, getClientSupplementPricing,
  confirmInvite,
  allPaiements, allPromotions,
  enforcerStatuts,
  runSyncPromoStatuts,
  computeBaseMensuelFromConfig, computeBaseGerantFromConfig, computeBaseLaboFromConfig,
  computeBaseAcheteursFromConfig, computeMensuelTotalFromConfig, palierAcheteurs,
  computeActiviteSupPrice, loadAllTarifs,
};
