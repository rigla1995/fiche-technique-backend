const pool = require('../config/database');
const { premierDuMoisUTC, normaliserMoisUTC, finDePeriodeUTC, moisCouvertsUTC } = require('../utils/dateUtils');
const { sendInviteEmail, sendFactureEmail } = require('../services/emailService');
const { generateFacturePdf } = require('../services/pdfService');
const { figerClientPaiement, clientFacture } = require('../utils/identiteFacture');
const { vocabForClient } = require('../utils/vocabCompte');
const { oublierConversationsIA } = require('../services/clientConfigService');
// Moteur de tarification PUR (lot 1a) : les calculs vivent dans pricingEngine et
// sont RÉ-EXPORTÉS en bas de ce fichier (les autres contrôleurs importent d'ici).
const {
  TARIF_KEYS_SURCHARGEABLES,
  resolveTarifs, tarifsFor,
  cfgVal, prixBaseActivite,
  computeBaseMensuelFromConfig, computeBaseGerantFromConfig, computeBaseLaboFromConfig,
  palierAcheteurs, computeBaseAcheteursFromConfig, computeMensuelTotalFromConfig,
  computeActiviteSupPrice,
  applyPromoMensualite, applyPromoOnboarding, applyPromoSupplement,
  onboardingPriceFor,
} = require('../services/pricingEngine');
// Config par composant (lot 1a) : applyComposants = SEUL écrivain des compteurs nb_*.
const {
  CompositionError, deriveCompteurs, validerComposition, normCompteurs, erreursIntroduites,
  resolveComposants, composantsDepuisCompteurs, composantsDelta, applyComposants, invaliderProfilApresCommit, listComposantsConfig,
} = require('../services/configComposantsService');
// getDomaineDefautId (slug 'restauration') = source unique dans domaineProfilService (ré-exporté ici)
const { getProfil, REGLES_DEFAUT, getDomaineDefautId } = require('../services/domaineProfilService');

// ── Facture d'abonnement ──────────────────────────────────────────────────────
// Taux de TVA applicable aux factures (Tunisie : 19 %). Le montant enregistré
// (paiements.montant_dt) est considéré TTC ; HT et TVA en sont déduits afin que
// le TTC affiché corresponde exactement au montant réglé.
const FACTURE_TVA_RATE = Number(process.env.FACTURE_TVA_RATE || 19);

// Construit les données de facture déterministes à partir d'une ligne de paiement.
// Déterministe => la facture jointe à l'email et celle téléchargée sont identiques.
// « Facturé à » (lot 3, étape 8) : l'identité du client copiée sur le paiement à son passage à « payé » si elle
// existe (colonnes client_*), sinon le compte lu en direct (`client` : nom, email), comme avant.
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
      ...clientFacture(paiement, client),
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
const getActivePromo = async (abonnementId, dateStr, db = pool) => {
  // Only mensualite-applicable promos affect payment amounts
  const result = await db.query(
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

// ── Grille tarifaire ────────────────────────────────────────────────────────
// loadTarifs() → { base: {cle: valeur}, overridesByDomaine: {domaineId: {cle: valeur}} }
// (2 requêtes). Les consommateurs résolvent la grille d'un compte avec
// tarifsFor(t, cfg.domaine_id) : tarifs_domaine VIDE ⇒ grille générale, à l'identique.
const loadTarifs = async (db = pool) => {
  const [baseRes, ovRes] = await Promise.all([
    db.query('SELECT cle, valeur_dt FROM tarifs_config'),
    db.query('SELECT domaine_id, cle, valeur_dt FROM tarifs_domaine'),
  ]);
  const base = {};
  baseRes.rows.forEach((r) => { base[r.cle] = parseFloat(r.valeur_dt); });
  const overridesByDomaine = {};
  ovRes.rows.forEach((r) => {
    const k = String(r.domaine_id);
    if (!overridesByDomaine[k]) overridesByDomaine[k] = {};
    overridesByDomaine[k][r.cle] = parseFloat(r.valeur_dt);
  });
  return { base, overridesByDomaine };
};

// Compat : grille générale seule (ancienne signature).
const loadAllTarifs = async () => (await loadTarifs()).base;

const mapAbonnementConfig = (row) => row ? ({
  id: row.id,
  abonnementId: row.abonnement_id,
  nbActivites: row.nb_activites,
  nbLabos: row.nb_labos,
  nbGerants: row.nb_gerants,
  nbAcheteurs: row.nb_acheteurs ?? 0,
  formuleActivites: row.formule_activites || null,
  montantOnboarding: row.montant_onboarding,
  domaineId: row.domaine_id ?? null,
  domaineSlug: row.domaine_slug ?? null,
  domaineNom: row.domaine_nom ?? null,
  // [{ composantId, code, libelle, libellePluriel, icone, typeTechnique, nb }]
  composants: Array.isArray(row.composants) ? row.composants : [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}) : null;

// Ligne abonnement_config + domaine (slug/nom) + détail par composant — forme
// attendue par mapAbonnementConfig. null si le compte n'a pas de config.
const loadConfigComplete = async (aboId, db = pool) => {
  const r = await db.query(
    `SELECT ac.*, da.slug AS domaine_slug, da.nom AS domaine_nom
       FROM abonnement_config ac
       LEFT JOIN domaines_activite da ON da.id = ac.domaine_id
      WHERE ac.abonnement_id = $1`,
    [aboId]
  );
  if (!r.rows.length) return null;
  const row = r.rows[0];
  row.composants = await listComposantsConfig(aboId, db);
  return row;
};

// Erreur de composition (400 { message, code, erreurs }) ou 500 — jamais 5xx pour
// les 400 métier du wizard.
const sendCompositionOrServerError = (res, err, tag = '') => {
  if (err instanceof CompositionError || err?.status === 400) {
    return res.status(400).json({ message: err.message, code: err.code || 'COMPOSITION_INVALIDE', erreurs: err.erreurs || [] });
  }
  console.error(tag, err);
  return res.status(500).json({ message: 'Erreur serveur' });
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

// Nombre de comptes dont la grille dépend d'un domaine (re-tarifés dès le prochain paiement).
const countClientsImpactes = async (domaineId) => {
  const r = await pool.query('SELECT COUNT(*)::int AS n FROM abonnement_config WHERE domaine_id = $1', [domaineId]);
  return r.rows[0]?.n ?? 0;
};

const parseDomaineIdParam = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : NaN;
};

// GET /api/abonnements/tarifs[?domaineId=] → { [cle]: { id, valeur, valeurGenerale, surcharge, description } }
// Sans domaineId : surcharge = null, valeur = valeurGenerale.
// Grille { [cle]: { id, valeur, valeurGenerale, surcharge, description } } — générale
// (domaineId null) ou vue depuis un domaine (surcharges tarifs_domaine appliquées).
// Réutilisée par GET /api/domaines/:id (tarifs). Le domaine doit exister (vérifié par l'appelant).
const buildTarifsPourDomaine = async (domaineId = null) => {
  const result = await pool.query('SELECT * FROM tarifs_config ORDER BY id');
  const surcharges = {};
  if (domaineId != null) {
    const ov = await pool.query('SELECT cle, valeur_dt FROM tarifs_domaine WHERE domaine_id = $1', [domaineId]);
    ov.rows.forEach((r) => { surcharges[r.cle] = parseFloat(r.valeur_dt); });
  }
  const tarifs = {};
  result.rows.forEach((r) => {
    const valeurGenerale = parseFloat(r.valeur_dt);
    const surcharge = Object.prototype.hasOwnProperty.call(surcharges, r.cle) ? surcharges[r.cle] : null;
    tarifs[r.cle] = {
      id: r.id,
      valeur: surcharge != null ? surcharge : valeurGenerale, // number homogène (type TS TarifsConfig.valeur)
      valeurGenerale,
      surcharge,
      description: r.description,
    };
  });
  return tarifs;
};

const getTarifs = async (req, res) => {
  const domaineId = parseDomaineIdParam(req.query.domaineId);
  if (Number.isNaN(domaineId)) return res.status(400).json({ message: 'domaineId invalide' });
  try {
    if (domaineId != null) {
      const dom = await pool.query('SELECT id FROM domaines_activite WHERE id = $1', [domaineId]);
      if (dom.rows.length === 0) return res.status(404).json({ message: 'Domaine introuvable' });
    }
    res.json(await buildTarifsPourDomaine(domaineId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/abonnements/tarifs/:cle  body { valeur, domaineId? }
// Sans domaineId : grille générale (comportement historique). Avec domaineId :
// surcharge du domaine (clé ∈ TARIF_KEYS_SURCHARGEABLES) → { cle, domaineId, valeur, clientsImpactes }.
const updateTarif = async (req, res) => {
  const { cle } = req.params;
  const { valeur } = req.body;
  if (valeur === undefined || valeur === null || valeur === '' || isNaN(Number(valeur))) {
    return res.status(400).json({ message: 'Valeur numérique requise' });
  }
  const domaineId = parseDomaineIdParam(req.body.domaineId);
  if (Number.isNaN(domaineId)) return res.status(400).json({ message: 'domaineId invalide' });
  try {
    if (domaineId == null) {
      const result = await pool.query(
        `UPDATE tarifs_config SET valeur_dt = $1, updated_at = NOW() WHERE cle = $2 RETURNING *`,
        [Number(valeur), cle]
      );
      if (result.rows.length === 0) return res.status(404).json({ message: 'Tarif introuvable' });
      return res.json({ cle, valeur: result.rows[0].valeur_dt });
    }
    if (!TARIF_KEYS_SURCHARGEABLES.includes(cle)) {
      return res.status(400).json({ message: `La clé « ${cle} » n'est pas surchargeable par domaine` });
    }
    const exists = await pool.query('SELECT 1 FROM tarifs_config WHERE cle = $1', [cle]);
    if (exists.rows.length === 0) return res.status(404).json({ message: 'Tarif introuvable' });
    const dom = await pool.query('SELECT id FROM domaines_activite WHERE id = $1', [domaineId]);
    if (dom.rows.length === 0) return res.status(404).json({ message: 'Domaine introuvable' });
    const up = await pool.query(
      `INSERT INTO tarifs_domaine (domaine_id, cle, valeur_dt)
       VALUES ($1, $2, $3)
       ON CONFLICT (domaine_id, cle) DO UPDATE SET valeur_dt = EXCLUDED.valeur_dt, updated_at = NOW()
       RETURNING valeur_dt`,
      [domaineId, cle, Number(valeur)]
    );
    const clientsImpactes = await countClientsImpactes(domaineId);
    res.json({ cle, domaineId, valeur: parseFloat(up.rows[0].valeur_dt), clientsImpactes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/abonnements/tarifs/:cle?domaineId=  → supprime la surcharge (retour à l'héritage).
const deleteTarifDomaine = async (req, res) => {
  const { cle } = req.params;
  const domaineId = parseDomaineIdParam(req.query.domaineId);
  if (domaineId == null || Number.isNaN(domaineId)) {
    return res.status(400).json({ message: 'domaineId requis (la grille générale ne se supprime pas)' });
  }
  try {
    const del = await pool.query(
      'DELETE FROM tarifs_domaine WHERE domaine_id = $1 AND cle = $2 RETURNING cle',
      [domaineId, cle]
    );
    const clientsImpactes = await countClientsImpactes(domaineId);
    res.json({ cle, domaineId, supprimee: del.rows.length > 0, clientsImpactes });
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

    // Include abonnement_config (+ domaine + composants, lot 1a)
    const configRow = await loadConfigComplete(abo.id);
    abo.config = mapAbonnementConfig(configRow);

    if (req.query.withPricing) {
      const config = configRow;
      const tarifs = tarifsFor(await loadTarifs(), config?.domaine_id);

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
// config: { nbActivites, nbLabos, nbGerants, nbAcheteurs, formuleActivites, montantOnboarding, domaineId? }
// domaineId absent/inconnu → domaine par défaut (restauration) : jamais NULL en base.
// config.composants ([{ code | composantId, nb }]) : détail par composant (lot 1a) ;
// absent → dérivé des compteurs (1er composant actif de chaque type du domaine).
// TRANSACTIONNEL : abonnement + config + composants (applyComposants = écrivain des
// compteurs) + paiement du mois (total résolu sur la grille du domaine) — tout ou rien.
const createAbonnement = async (clientId, montantOnboarding, config = null) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query(
      `INSERT INTO abonnements (client_id, montant_onboarding, date_debut)
       VALUES ($1, $2, CURRENT_DATE)
       RETURNING id`,
      [clientId, config ? config.montantOnboarding : montantOnboarding]
    );
    const aboId = result.rows[0].id;

    let cfgRow = null;
    let resultatComposants = null;
    if (config) {
      const nbActivites = config.nbActivites ?? 1;
      // La formule n'a de sens qu'avec des activités (compte dépôt = NULL)
      const formule = nbActivites >= 1
        ? (config.formuleActivites === 'basique' ? 'basique' : 'premium')
        : null;
      const domReq = parseInt(config.domaineId, 10);
      const cfgIns = await db.query(
        `INSERT INTO abonnement_config (abonnement_id, nb_activites, nb_labos, nb_gerants, nb_acheteurs, formule_activites, montant_onboarding, domaine_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7,
                 COALESCE((SELECT id FROM domaines_activite WHERE id = $8::int),
                          (SELECT id FROM domaines_activite WHERE slug = 'restauration' LIMIT 1)))
         RETURNING domaine_id`,
        [aboId, nbActivites, config.nbLabos || 0, config.nbGerants || 0, config.nbAcheteurs || 0, formule, config.montantOnboarding || 0,
         Number.isFinite(domReq) ? domReq : null]
      );
      const domaineIdEffectif = cfgIns.rows[0]?.domaine_id ?? null;
      if (domaineIdEffectif == null) {
        // Aucun domaine résolu (domaine demandé inconnu ET slug 'restauration' absent) :
        // erreur métier explicite (400 côté appelant), jamais un INSERT NULL puis un 500.
        const e = new Error("Aucun domaine d'activité disponible (domaine par défaut « restauration » introuvable)");
        e.status = 400; e.code = 'DOMAINE_INTROUVABLE';
        throw e;
      }
      const composants = Array.isArray(config.composants) && config.composants.length
        ? config.composants
        : await composantsDepuisCompteurs(domaineIdEffectif, {
            nbActivites, nbLabos: config.nbLabos || 0, nbGerants: config.nbGerants || 0, nbAcheteurs: config.nbAcheteurs || 0,
          }, db);
      resultatComposants = await applyComposants(db, aboId, { domaineId: domaineIdEffectif, composants, mode: 'set' });
      // Formule explicite (applyComposants ne pose que le défaut premium / NULL)
      if (formule) {
        await db.query('UPDATE abonnement_config SET formule_activites = $2 WHERE abonnement_id = $1 AND nb_activites >= 1', [aboId, formule]);
      }
      cfgRow = (await db.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId])).rows[0];
    }

    // Auto-create current month payment record
    const moisStr = premierDuMoisUTC();

    let baseMontant = 0;
    if (cfgRow) {
      const tarifs = tarifsFor(await loadTarifs(db), cfgRow.domaine_id);
      baseMontant = computeMensuelTotalFromConfig(cfgRow, tarifs) || 0;
    }

    const activePromo = await getActivePromo(aboId, moisStr, db);
    const montant = activePromo ? applyPromoMensualite(baseMontant, activePromo) : baseMontant;
    const statut = montant === 0 ? 'gratuit' : 'en_attente';
    await db.query(
      `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut) VALUES ($1, $2, $3, $4)`,
      [aboId, moisStr, montant, statut]
    );
    await db.query('COMMIT');
    // Composant identité créé à la volée : le profil du domaine en cache ne l'a pas (spec §5.4)
    invaliderProfilApresCommit(resultatComposants);
    return aboId;
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }
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

    // Try new config-based pricing first (config complète : domaine + composants, comme les autres réponses)
    const config = await loadConfigComplete(aboId);
    const tarifs = tarifsFor(await loadTarifs(), config?.domaine_id);

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
    const moisStr = normaliserMoisUTC(mois);

    // If no montant supplied, compute from config/tarif + promo
    let finalMontant = montant != null ? Number(montant) : null;
    if (finalMontant === null) {
      const configRes = await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId]);
      let base;
      if (configRes.rows.length > 0) {
        const tarifs = tarifsFor(await loadTarifs(), configRes.rows[0].domaine_id);
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
    // Au PASSAGE à « payé », l'identité du client est copiée sur le paiement dans la même transaction : la facture
    // ne suivra plus la fiche (lot 3, étape 8). Ne sont PAS repris : un paiement déjà « payé » qu'on enregistre de
    // nouveau, et un paiement déjà réglé une fois avant la copie figée (il porte une date de règlement sans copie)
    // qu'on repasse à « payé » après une correction — leur facture reste telle qu'elle était.
    let paiement;
    let prevStatut = null; // statut précédent (la facture ne part par email qu'au PASSAGE à « payé »)
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const prevRes = await db.query(
        'SELECT statut, date_paiement, client_fige_le FROM paiements WHERE abonnement_id = $1 AND mois = $2 FOR UPDATE',
        [aboId, moisStr]
      );
      const prev = prevRes.rows[0] || null;
      prevStatut = prev?.statut ?? null;
      const factureDAvant = !!prev && prev.date_paiement != null && prev.client_fige_le == null;
      const result = await db.query(
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
      paiement = result.rows[0];
      if (statut === 'payé' && prevStatut !== 'payé' && !factureDAvant) {
        paiement = (await figerClientPaiement(db, paiement.id)) || paiement;
      }
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      db.release();
    }

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
            p.client_fige_le, p.client_nom, p.client_email, p.client_raison_sociale, p.client_forme,
            p.client_matricule_fiscal, p.client_rne, p.client_adresse, p.client_ville,
            a.client_id, u.nom AS compte_nom, u.email AS compte_email
       FROM paiements p
       JOIN abonnements a ON a.id = p.abonnement_id
       LEFT JOIN utilisateurs u ON u.id = a.client_id
      WHERE p.id = $1${scopeCond}`,
    params
  );
  if (r.rows.length === 0) return { error: 404 };
  const row = r.rows[0];
  if (row.statut !== 'payé' || !(Number(row.montant_dt) > 0)) return { error: 400 };
  const fac = buildFactureData(row, { nom: row.compte_nom, email: row.compte_email });
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

// Recalcule les paiements NON réglés (en_attente / gratuit) d'un abonnement à partir
// du mois courant (défaut) ou de la fenêtre [fromMois, toMois] : montant = total de la
// config × promo mensualité active CE MOIS-LÀ (la plus récente qui couvre le mois).
// Appelé après tout changement de composants / formule / domaine et à l'insertion d'une
// promo. `db` = pool ou client de transaction. Renvoie { base, updated }.
// Un paiement SAISI PAR UN ADMIN (saisie_par non nul : montant/statut posés via
// upsertPaiement) n'est pas recalculé par défaut — l'admin garde la main sur ce
// qu'il a saisi ; `inclureSaisiesManuelles: true` (insertion d'une promo, comportement
// historique) recalcule tout.
// Sans fromMois : recalcul à partir du MOIS SUIVANT uniquement (« dès le prochain paiement »,
// règle historique : un changement de config/formule/domaine ne re-tarife pas le mois en cours).
// L'insertion d'une promo passe fromMois = date_debut (mois courant inclus, comme avant).
const recalcPaiementsEnAttente = async (db, aboId, { fromMois = null, toMois = null, inclureSaisiesManuelles = false } = {}) => {
  const cfgRes = await db.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId]);
  const cfg = cfgRes.rows[0] || null;
  let base = 0;
  if (cfg) {
    const tarifs = tarifsFor(await loadTarifs(db), cfg.domaine_id);
    base = computeMensuelTotalFromConfig(cfg, tarifs) || 0;
  }
  const params = [aboId, fromMois];
  let sql = `
    SELECT p.id, pr.type, pr.applies_to, pr.discount_mensualite, pr.fixed_mensualite
      FROM paiements p
      LEFT JOIN LATERAL (
        SELECT x.type, x.applies_to, x.discount_mensualite, x.fixed_mensualite
          FROM promotions x
         WHERE x.abonnement_id = p.abonnement_id
           AND x.date_debut <= p.mois
           AND (x.date_fin IS NULL OR x.date_fin >= p.mois)
           AND x.applies_to IN ('mensualite', 'les_deux')
         ORDER BY x.created_at DESC
         LIMIT 1
      ) pr ON true
     WHERE p.abonnement_id = $1
       AND p.statut IN ('en_attente', 'gratuit')
       AND p.mois >= COALESCE($2::date, (date_trunc('month', CURRENT_DATE) + interval '1 month')::date)`;
  if (!inclureSaisiesManuelles) sql += ' AND p.saisie_par IS NULL';
  if (toMois) { sql += ` AND p.mois <= $${params.length + 1}::date`; params.push(toMois); }
  const rows = await db.query(sql, params);
  let updated = 0;
  for (const p of rows.rows) {
    const promo = p.type ? { type: p.type, applies_to: p.applies_to, discount_mensualite: p.discount_mensualite, fixed_mensualite: p.fixed_mensualite } : null;
    const montant = applyPromoMensualite(base, promo);
    const statut = montant === 0 ? 'gratuit' : 'en_attente';
    await db.query('UPDATE paiements SET montant_dt = $1, statut = $2 WHERE id = $3', [montant, statut, p.id]);
    updated++;
  }
  return { base, updated };
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
    dateFin = finDePeriodeUTC(dateDebut, monthsDuration);
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
    // Paiements non réglés de la fenêtre de la promo : total résolu (grille du domaine)
    // × promo active ce mois-là (= la promo qui vient d'être insérée, sans chevauchement).
    await recalcPaiementsEnAttente(pool, aboId, { fromMois: dateDebut, toMois: dateFin, inclureSaisiesManuelles: true });
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
      dateFin = finDePeriodeUTC(dateDebut, monthsDuration);
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
      for (const moisStr of moisCouvertsUTC(promo.date_debut, promo.date_fin || today)) {
        await pool.query(
          `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut)
           VALUES ($1, $2, 0, 'gratuit')
           ON CONFLICT (abonnement_id, mois) DO UPDATE
             SET statut = 'gratuit', montant_dt = 0
           WHERE paiements.statut NOT IN ('payé')`,
          [promo.abonnement_id, moisStr]
        );
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
    const thisMonth = premierDuMoisUTC();
    // Grille chargée UNE fois, résolue par abonnement (domaine du compte)
    const t = await loadTarifs();
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
      const base = cfg ? (computeMensuelTotalFromConfig(cfg, tarifsFor(t, cfg.domaine_id)) || 0) : 0;
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

    const emailResult = await sendInviteEmail({ to: u.email, nom: u.nom, token: u.invite_token, role: 'client', voc: await vocabForClient(clientId) });

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
    res.json(mapAbonnementConfig(await loadConfigComplete(aboRes.rows[0].id)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Composants existants d'un abonnement re-projetés sur un (autre) domaine : même code
// s'il existe et est actif dans le domaine cible, sinon 1er composant actif du type
// (code = type ⇒ identité créée par applyComposants). Renvoie [{ code, nb }].
const remapperComposants = async (db, aboId, domaineCible, compteursRepli = null) => {
  const actuels = await listComposantsConfig(aboId, db);
  if (!actuels.length) {
    const k = compteursRepli || (await db.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboId])).rows[0] || {};
    return composantsDepuisCompteurs(domaineCible, k, db);
  }
  const cibles = (await db.query(
    'SELECT code, type_technique FROM domaine_composants WHERE domaine_id = $1 AND actif = true ORDER BY ordre, id',
    [domaineCible]
  )).rows;
  const out = [];
  for (const c of actuels) {
    const memeCode = cibles.find((x) => x.code === c.code && x.type_technique === c.typeTechnique);
    const premier = cibles.find((x) => x.type_technique === c.typeTechnique);
    out.push({ code: memeCode ? memeCode.code : (premier ? premier.code : c.typeTechnique), nb: c.nb });
  }
  return out;
};

// PUT /api/abonnements/client/:clientId/config
// Nouveau payload : { domaineId?, composants?: [{ code, nb }], formuleActivites?, montantOnboarding? }
// OU ancien payload : { nbActivites, nbLabos, nbGerants, nbAcheteurs?, formuleActivites?, montantOnboarding }
// (compat : 9 scripts E2E + AbonnementsManagement). Composition validée (règles du
// domaine) → 400 { message, code } ; applyComposants(set) puis recalcPaiementsEnAttente.
const updateAbonnementConfig = async (req, res) => {
  const { clientId } = req.params;
  const { nbActivites, nbLabos, nbGerants, nbAcheteurs, montantOnboarding } = req.body;
  const composantsIn = req.body.composants;
  const legacy = nbActivites !== undefined && nbActivites !== null;
  if (composantsIn !== undefined && !Array.isArray(composantsIn)) {
    return res.status(400).json({ message: 'composants : tableau [{ code, nb }] attendu' });
  }
  const nA = legacy ? parseInt(nbActivites, 10) : null;
  if (legacy && (!Number.isFinite(nA) || nA < 0)) return res.status(400).json({ message: 'nb_activites >= 0 requis' });
  // Formule des activités : préservée si absente du payload ; forcée à NULL si 0 activité ;
  // défaut premium quand des activités apparaissent sur un compte qui n'en avait pas.
  if (req.body.formuleActivites !== undefined && !['basique', 'premium'].includes(req.body.formuleActivites)) {
    return res.status(400).json({ message: 'Formule invalide (basique ou premium)' });
  }
  const formuleIn = req.body.formuleActivites !== undefined ? req.body.formuleActivites : null;
  // Option Acheteurs (ancien payload) : quota ≤ 100 (le reste des règles = validerComposition)
  const nAch = legacy && nbAcheteurs != null ? parseInt(nbAcheteurs, 10) : null;
  if (nAch !== null && (!Number.isFinite(nAch) || nAch < 0 || nAch > 100)) {
    return res.status(400).json({ message: 'Quota [[court:acheteur:pl]] invalide (paliers de 1 à 100)' });
  }
  if (montantOnboarding !== undefined && montantOnboarding !== null && !Number.isFinite(Number(montantOnboarding))) {
    return res.status(400).json({ message: 'montantOnboarding invalide' });
  }
  // Domaine du compte : absent du payload → PRÉSERVÉ ; `domaineId: null` explicite →
  // repli sur le domaine par défaut (restauration) ; inconnu → 400.
  const domaineIdIn = req.body.domaineId;
  let domaineIdEff = null; // null = ne pas toucher
  const domaineExplicite = domaineIdIn !== undefined;
  if (domaineExplicite && domaineIdIn !== null && domaineIdIn !== '') {
    const d = parseInt(domaineIdIn, 10);
    if (!Number.isFinite(d) || d <= 0) return res.status(400).json({ message: 'domaineId invalide' });
    domaineIdEff = d;
  }
  const db = await pool.connect();
  try {
    const aboRes = await db.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId]);
    if (aboRes.rows.length === 0) return res.status(404).json({ message: 'Abonnement introuvable' });
    const aboId = aboRes.rows[0].id;
    if (domaineExplicite) {
      if (domaineIdEff == null) {
        domaineIdEff = await getDomaineDefautId();
      } else {
        const dom = await db.query('SELECT id FROM domaines_activite WHERE id = $1', [domaineIdEff]);
        if (dom.rows.length === 0) return res.status(400).json({ message: 'Domaine inconnu' });
      }
    }

    await db.query('BEGIN');
    // Config existante (créée si absente — même comportement que l'ancien upsert)
    let cur = (await db.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1 FOR UPDATE', [aboId])).rows[0];
    if (!cur) {
      cur = (await db.query(
        `INSERT INTO abonnement_config (abonnement_id, nb_activites, nb_labos, nb_gerants, nb_acheteurs, formule_activites, montant_onboarding, domaine_id)
         VALUES ($1, 0, 0, 0, 0, NULL, 0, COALESCE($2::int, (SELECT id FROM domaines_activite WHERE slug = 'restauration' LIMIT 1)))
         RETURNING *`,
        [aboId, domaineIdEff]
      )).rows[0];
    }
    const domaineFinal = domaineIdEff ?? cur.domaine_id ?? (await getDomaineDefautId(db));
    const domaineChange = domaineFinal !== cur.domaine_id;

    // Composition cible : composants du payload > compteurs legacy > existant (re-mappé si le domaine change)
    const actuels = await listComposantsConfig(aboId, db);
    let composants;
    if (Array.isArray(composantsIn)) {
      composants = composantsIn;
    } else if (legacy) {
      const cibles = {
        nbActivites: nA, nbLabos: parseInt(nbLabos, 10) || 0, nbGerants: parseInt(nbGerants, 10) || 0,
        // nb_acheteurs préservé quand il n'est pas envoyé (comportement historique)
        nbAcheteurs: nAch !== null ? nAch : (parseInt(cur.nb_acheteurs, 10) || 0),
      };
      const kCible = normCompteurs(cibles);
      const kCur = normCompteurs(cur);
      const compteursInchanges = ['nb_activites', 'nb_labos', 'nb_gerants', 'nb_acheteurs'].every((f) => kCible[f] === kCur[f]);
      if (domaineChange) {
        // Nouveau domaine : re-projection du détail (même code sinon 1er du type), puis delta
        const remap = await remapperComposants(db, aboId, domaineFinal, cibles);
        composants = compteursInchanges ? remap : await composantsDelta(domaineFinal, cibles, await resolveComposants(db, domaineFinal, remap, { creer: false }), db);
      } else if (compteursInchanges && actuels.length) {
        // Ancien payload aux compteurs inchangés (ex. changement de formule seul) :
        // le détail par composant est CONSERVÉ tel quel.
        composants = null;
      } else if (actuels.length) {
        // Compteurs modifiés : DELTA par type sur le détail existant (jamais un remplacement total)
        composants = await composantsDelta(domaineFinal, cibles, actuels, db);
      } else {
        composants = await composantsDepuisCompteurs(domaineFinal, cibles, db);
      }
    } else {
      composants = domaineChange ? await remapperComposants(db, aboId, domaineFinal) : null;
    }

    // Validation (règles du domaine + bornes des composants) AVANT écriture — seules les
    // erreurs INTRODUITES par la demande bloquent (un compte hérité hors règles reste modifiable)
    const profil = await getProfil(domaineFinal);
    if (composants) {
      const resolus = await resolveComposants(db, domaineFinal, composants, { creer: false, actuels });
      const erreursAvant = validerComposition({ compteurs: normCompteurs(cur), regles: profil?.regles, composants: actuels });
      const erreurs = erreursIntroduites(erreursAvant, validerComposition({ compteurs: deriveCompteurs(resolus), regles: profil?.regles, composants: resolus }));
      if (erreurs.length) throw new CompositionError(erreurs);
    }

    await db.query(
      `UPDATE abonnement_config
          SET formule_activites = COALESCE($2, formule_activites),
              montant_onboarding = COALESCE($3::numeric, montant_onboarding),
              domaine_id = $4,
              updated_at = NOW()
        WHERE abonnement_id = $1`,
      [aboId, formuleIn, montantOnboarding != null ? Number(montantOnboarding) : null, domaineFinal]
    );
    let resultatComposants = null;
    if (composants) resultatComposants = await applyComposants(db, aboId, { domaineId: domaineFinal, composants, mode: 'set' });
    else if (formuleIn) {
      // Formule seule : NULL sans activité (même règle que les écrivains)
      await db.query('UPDATE abonnement_config SET formule_activites = NULL WHERE abonnement_id = $1 AND nb_activites = 0', [aboId]);
    }
    await db.query('COMMIT');
    // Composant identité créé à la volée : le profil du domaine en cache ne l'a pas (spec §5.4)
    invaliderProfilApresCommit(resultatComposants);
    // Domaine changé : l'assistant oublie les conversations dites dans l'ancien vocabulaire
    // (lot 2b, spec §5.6) — au mieux, jamais un 500 ; rien sans changement de domaine.
    // Une config sans domaine (antérieure au backfill de la 187) parle déjà restauration : l'y rattacher n'est
    // pas un changement de vocabulaire, rien n'est purgé.
    const domaineAvant = cur.domaine_id ?? (await getDomaineDefautId().catch(() => null));
    if (domaineChange && domaineFinal !== domaineAvant) {
      await oublierConversationsIA(clientId).catch((e) => console.error('[config] purge assistant:', e.message));
    }
    // Les paiements non réglés (mois courant et suivants, hors saisies admin) suivent la
    // nouvelle config / grille — best-effort : la config est déjà écrite, jamais un 500 ici
    await recalcPaiementsEnAttente(pool, aboId).catch((e) => console.error('[config] recalc paiements:', e.message));
    res.json(mapAbonnementConfig(await loadConfigComplete(aboId)));
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    sendCompositionOrServerError(res, err, '[config]');
  } finally {
    db.release();
  }
};

// ── Pricing preview (for add-client step 2) ───────────────────────────────────

const getPricingPreview = async (req, res) => {
  const { nbActivites, nbLabos, nbGerants, nbAcheteurs, formuleActivites } = req.query;
  // domaineId (optionnel) : grille du domaine ; absent → grille générale ; invalide → 400 ; inconnu → 404
  const domReq = parseDomaineIdParam(req.query.domaineId);
  if (Number.isNaN(domReq)) return res.status(400).json({ message: 'domaineId invalide' });
  try {
    let domaine = null;
    if (domReq != null) {
      const d = await pool.query('SELECT id, slug, nom FROM domaines_activite WHERE id = $1', [domReq]);
      if (!d.rows[0]) return res.status(404).json({ message: 'Domaine introuvable' });
      domaine = { id: d.rows[0].id, slug: d.rows[0].slug, nom: d.rows[0].nom };
    }
    const tarifs = tarifsFor(await loadTarifs(), domaine?.id ?? null);
    // composants (JSON encodé : [{ code, nb }]) → compteurs dérivés (sinon anciens params)
    let composantsOut = [];
    let compteursDerives = null;
    if (req.query.composants !== undefined && req.query.composants !== '') {
      let parsed;
      try { parsed = JSON.parse(req.query.composants); } catch (_) { parsed = null; }
      if (!Array.isArray(parsed)) return res.status(400).json({ message: 'composants : JSON [{ code, nb }] attendu' });
      if (!domaine) return res.status(400).json({ message: 'domaineId requis avec composants' });
      try {
        const resolus = await resolveComposants(pool, domaine.id, parsed, { creer: false });
        compteursDerives = deriveCompteurs(resolus);
        composantsOut = resolus.map((c) => ({
          code: c.code, libelle: c.libelle, libellePluriel: c.libellePluriel, icone: c.icone, typeTechnique: c.typeTechnique, nb: c.nb,
        }));
      } catch (err) {
        if (err instanceof CompositionError) return res.status(400).json({ message: err.message, code: err.code, erreurs: err.erreurs });
        throw err;
      }
    }
    const profil = domaine ? await getProfil(domaine.id) : null;
    const regles = profil?.regles || { ...REGLES_DEFAUT };
    const nbRaw = compteursDerives ? compteursDerives.nb_activites : parseInt(nbActivites);
    const nb  = Number.isFinite(nbRaw) && nbRaw >= 0 ? nbRaw : 1;
    const nbl = compteursDerives ? compteursDerives.nb_labos : (parseInt(nbLabos) || 0);
    const nbg = compteursDerives ? compteursDerives.nb_gerants : (parseInt(nbGerants) || 0);
    const nba = compteursDerives ? compteursDerives.nb_acheteurs : (parseInt(nbAcheteurs) || 0);
    const formule = formuleActivites === 'basique' ? 'basique' : 'premium';

    const mockConfig = { nb_activites: nb, nb_labos: nbl, nb_gerants: nbg, nb_acheteurs: nba, formule_activites: formule, domaine_id: domaine?.id ?? null };
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

    const onboardingPrice = onboardingPriceFor(mockConfig, tarifs);

    res.json({
      formuleActivites: nb >= 1 ? formule : null,
      activite:  { nb, total: activiteCost, lines: actLines },
      labo:      { nb: nbl, unitPrice: pLabo, total: laboCost },
      gerant:    { nb: nbg, unitPrice: pGer,  total: gerantCost },
      acheteurs: { nb: nba, palier: palierAcheteurs(nba), total: acheteursCost },
      totalMensuel: total,
      onboardingPrice,
      domaine,
      // Lot 1a : détail par composant (mots du domaine) + règles résolues du domaine
      composants: composantsOut,
      regles,
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
    const t = await loadTarifs();
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
    const tarifs = tarifsFor(t, config?.domaine_id);

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
    const t = await loadTarifs();
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
    const tarifs = tarifsFor(t, config?.domaine_id);

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
      return res.status(400).json({ message: 'Quota [[court:acheteur:pl]] invalide (paliers de 1 à 100)' });
    }
    if (Number.isFinite(nb) && nb >= 0) {
      const aboRes = await pool.query('SELECT id FROM abonnements WHERE client_id = $1 ORDER BY id DESC LIMIT 1', [clientId]);
      const aboId = aboRes.rows[0]?.id;
      const cfgRes = aboId ? await pool.query('SELECT domaine_id FROM abonnement_config WHERE abonnement_id = $1', [aboId]) : { rows: [] };
      if (aboId && cfgRes.rows.length) {
        // Quota acheteurs via applyComposants (mode add : un composant acheteurs REMPLACE
        // le quota ; 0 = plus aucune ligne acheteurs) — seul écrivain de nb_acheteurs.
        // Désactivation (0) sans ligne acheteurs souscrite : rien à écrire (et surtout
        // aucune création d'un composant identité dans le domaine par effet de bord).
        const ligneAch = (await listComposantsConfig(aboId)).find((c) => c.typeTechnique === 'acheteurs') || null;
        if (nb === 0 && !ligneAch) {
          quota = 0;
        } else {
          const db = await pool.connect();
          try {
            await db.query('BEGIN');
            // Ligne souscrite (même inactive : tolérée tant que le quota ne monte pas) sinon 1er composant actif
            const composants = ligneAch && (nb === 0 || nb <= ligneAch.nb)
              ? [{ composantId: ligneAch.composantId, nb }]
              : (await composantsDepuisCompteurs(cfgRes.rows[0].domaine_id, { nbAcheteurs: nb > 0 ? nb : 1 }, db)).map((c) => ({ code: c.code, nb }));
            const r2 = await applyComposants(db, aboId, { composants, mode: 'add' });
            await db.query('COMMIT');
            invaliderProfilApresCommit(r2); // composant identité créé à la volée (spec §5.4)
            quota = r2.compteurs.nb_acheteurs;
          } catch (e) {
            await db.query('ROLLBACK').catch(() => {});
            throw e;
          } finally {
            db.release();
          }
          await recalcPaiementsEnAttente(pool, aboId).catch((e) => console.error('[module-acheteurs] recalc paiements:', e.message));
        }
      }
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
// Lit tout depuis la base.
const computeEffectivePricing = async (clientId) => {
  const aboRes = await pool.query(
    `SELECT id, montant_onboarding FROM abonnements WHERE client_id = $1 ORDER BY id DESC LIMIT 1`,
    [clientId]
  );
  if (aboRes.rows.length === 0) return null;
  const abo = aboRes.rows[0];
  const cfgRes = await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [abo.id]);
  const config = cfgRes.rows[0] || null;
  const tarifs = tarifsFor(await loadTarifs(), config?.domaine_id);

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
    nbActivites: config ? (parseInt(config.nb_activites) || 0) : null,
    nbAcheteurs: parseInt(config?.nb_acheteurs) || 0,
    palierAcheteurs: palierAcheteurs(config?.nb_acheteurs),
  };
};

module.exports = {
  getTarifs, updateTarif, deleteTarifDomaine,
  computeEffectivePricing,
  // Grille par domaine (lot 1a)
  loadTarifs, tarifsFor, resolveTarifs, TARIF_KEYS_SURCHARGEABLES, getDomaineDefautId,
  recalcPaiementsEnAttente, buildTarifsPourDomaine, loadConfigComplete, remapperComposants,
  // Ré-exports du moteur pur (les autres contrôleurs importent d'ici)
  cfgVal, prixBaseActivite, applyPromoMensualite, applyPromoOnboarding, applyPromoSupplement, onboardingPriceFor,
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
