const pool = require('../config/database');
const { pushToAdmins } = require('../services/sseService');
const { saveNotificationToAdmins } = require('./notificationController');

// Réponse de succès TOUJOURS identique (anti-énumération : impossible de savoir
// si l'email avait déjà une demande ouverte, ou si le honeypot a filtré l'envoi).
const REPONSE_OK = { message: 'Votre demande a bien été reçue — nous vous recontactons sous 24 h.' };
// Message d'erreur volontairement générique (pas de détail exploitable par un bot).
const REPONSE_INVALIDE = { message: 'Demande invalide. Vérifiez les champs du formulaire.' };

const TYPES_ACTIVITE = ['restaurant', 'cafe_bar', 'patisserie_boulangerie', 'boucherie', 'traiteur', 'labo_depot', 'autre'];

const estTelephoneTunisienValide = (val) => /^(\+216[\s-]?)?[2579]\d{7}$/.test(String(val).replace(/\s/g, ''));
const estEmailValide = (val) => typeof val === 'string' && val.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);

// POST /api/public/demande-acces — formulaire public du site vitrine (rate-limité)
const creerDemandeAcces = async (req, res) => {
  try {
    const b = req.body || {};

    // Honeypot : champ « website » caché sur le site — un bot qui le remplit
    // reçoit la réponse de succès uniforme, sans aucune insertion.
    if (typeof b.website === 'string' && b.website.trim() !== '') {
      return res.json(REPONSE_OK);
    }

    const nom = typeof b.nom === 'string' ? b.nom.trim() : '';
    const email = typeof b.email === 'string' ? b.email.trim() : '';
    const telephone = typeof b.telephone === 'string' ? b.telephone.trim() : '';
    const ville = typeof b.ville === 'string' ? b.ville.trim() : null;
    const typeActivite = b.typeActivite ?? b.type_activite ?? null;
    const nbPointsVenteRaw = b.nbPointsVente ?? b.nb_points_vente ?? null;
    const aLabo = b.aLabo ?? b.a_labo ?? null;
    const interetB2b = b.interetB2b ?? b.interet_b2b ?? null;
    const message = typeof b.message === 'string' ? b.message.trim() : null;
    const configCalculateur = b.configCalculateur ?? b.config_calculateur ?? null;

    // ── Validation serveur (400 générique en cas d'échec) ────────────────────
    if (nom.length < 2 || nom.length > 150) return res.status(400).json(REPONSE_INVALIDE);
    if (!estEmailValide(email)) return res.status(400).json(REPONSE_INVALIDE);
    if (!estTelephoneTunisienValide(telephone) || telephone.length > 30) return res.status(400).json(REPONSE_INVALIDE);
    if (ville !== null && ville.length > 100) return res.status(400).json(REPONSE_INVALIDE);
    if (typeActivite !== null && !TYPES_ACTIVITE.includes(typeActivite)) return res.status(400).json(REPONSE_INVALIDE);
    let nbPointsVente = null;
    if (nbPointsVenteRaw !== null && nbPointsVenteRaw !== undefined && nbPointsVenteRaw !== '') {
      nbPointsVente = Number(nbPointsVenteRaw);
      if (!Number.isInteger(nbPointsVente) || nbPointsVente < 0 || nbPointsVente > 50) {
        return res.status(400).json(REPONSE_INVALIDE);
      }
    }
    if (aLabo !== null && typeof aLabo !== 'boolean') return res.status(400).json(REPONSE_INVALIDE);
    if (interetB2b !== null && typeof interetB2b !== 'boolean') return res.status(400).json(REPONSE_INVALIDE);
    if (message !== null && message.length > 2000) return res.status(400).json(REPONSE_INVALIDE);
    let configJson = null;
    if (configCalculateur !== null && configCalculateur !== undefined) {
      if (typeof configCalculateur !== 'object' || Array.isArray(configCalculateur)) {
        return res.status(400).json(REPONSE_INVALIDE);
      }
      configJson = JSON.stringify(configCalculateur);
      if (configJson.length > 2048) return res.status(400).json(REPONSE_INVALIDE);
    }

    // ── Insertion — dédup silencieuse des demandes OUVERTES (index unique
    // partiel demandes_acces_email_ouverte, cf. migration 173) ───────────────
    const result = await pool.query(
      `INSERT INTO demandes_acces
         (nom, email, telephone, ville, type_activite, nb_points_vente, a_labo, interet_b2b, message, config_calculateur, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (LOWER(email)) WHERE statut IN ('nouvelle', 'contactee') DO NOTHING
       RETURNING id`,
      [
        nom, email, telephone, ville || null, typeActivite, nbPointsVente,
        aLabo, interetB2b, message || null, configJson,
        (req.ip || '').slice(0, 60) || null,
        (req.get('user-agent') || '').slice(0, 1000) || null,
      ]
    );

    // Réponse uniforme AVANT le travail annexe (et identique en cas de dédup).
    res.json(REPONSE_OK);

    // Notification temps réel + persistante aux admins — best-effort, uniquement
    // si une ligne a réellement été insérée. NB : notifications.demande_id
    // référence support_demandes (FK) → on ne le renseigne pas ici.
    if (result.rows.length > 0) {
      try {
        const demandeId = result.rows[0].id;
        pushToAdmins('demande_acces_recue', { demandeId, nom });
        saveNotificationToAdmins({ eventType: 'demande_acces_recue', clientNom: nom })
          .catch((e) => console.error('[site] notification demande accès:', e.message));
      } catch (e) {
        console.error('[site] notification demande accès:', e.message);
      }
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/public/partenaires — logos des clients partenaires opt-in (site vitrine)
const listPartenaires = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pe.nom, pe.logo_site
       FROM profil_entreprise pe
       JOIN utilisateurs u ON u.id = pe.client_id
       WHERE pe.site_partenaire_actif = true
         AND pe.logo_site IS NOT NULL
         AND u.actif = true
         AND u.activated_at IS NOT NULL
       ORDER BY pe.nom`
    );
    res.set('Cache-Control', 'public, max-age=300');
    res.json(result.rows.map((r) => ({ nom: r.nom, logo: r.logo_site })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Seules ces clés de tarifs_config sont exposées publiquement (calculateur du site).
const CLES_TARIFS_PUBLIQUES = [
  'prix_base_activite_basique',
  'prix_base_activite_premium',
  'remise_2eme_sans_labo',
  'remise_3eme_plus_sans_labo',
  'remise_avec_labo',
  'labo_sup_mensuel',
  'gerant_sup_mensuel',
  'acheteurs_palier_10',
  'acheteurs_palier_20',
  'acheteurs_palier_50',
  'acheteurs_palier_100',
  'onboarding_sans_labo',
  'onboarding_avec_labo',
];

// GET /api/public/tarifs-reference — barème public pour le calculateur du site
const getTarifsReference = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)',
      [CLES_TARIFS_PUBLIQUES]
    );
    const tarifs = {};
    for (const row of result.rows) tarifs[row.cle] = parseFloat(row.valeur_dt);
    res.set('Cache-Control', 'public, max-age=300');
    res.json(tarifs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { creerDemandeAcces, listPartenaires, getTarifsReference };
