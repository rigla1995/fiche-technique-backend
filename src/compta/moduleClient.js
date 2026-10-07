// LabFlow Compta, étape S2c (labflow-reprise/achats-compta/PLAN-S2.md §4) : le module Comptabilité chez un client
// Stock / Vente. Un poste de plus dans SA configuration (D6) : `abonnement_config.module_compta_actif`,
// `module_compta_active_le`, `nb_gerants_compta` (gérants comptables en plus du comptable compris).
// - Activation (admin, ou validation d'une demande du client) : refusée tant que le tarif « Module Comptabilité » vaut 0
//   (décision du client du 06/10) ; à la première activation, l'espace `client_labflow` du client, son accès titulaire
//   et l'accès OBLIGATOIRE « à attribuer » de son comptable (sans personne, désigné en S3).
// - Désactivation : l'espace est fermé, rien n'est effacé (D10) ; une réactivation le rouvre à l'identique.
// - Facturation : à plein tarif, hors promotion, à partir du mois qui suit l'activation (pricingEngine.mensualiteDue,
//   tarifsCompta.configPourMois) ; les mensualités en attente des mois suivants sont recalculées après la transaction.
const pool = require('../config/database');
const { loadTarifs, tarifsFor, recalcPaiementsEnAttente } = require('../controllers/abonnementController');
const { postesCompta, totalPostes, tarif, moisTunis } = require('./tarifsCompta');
const { nomAffiche } = require('../utils/identite');
const { journaliser } = require('./journal');

const NB_GERANTS_MAX = 50;
const MSG_TARIF = 'Le tarif « Module Comptabilité » vaut 0 DT : saisissez-le d\'abord (Tarifs → LabFlow Compta).';

const erreur = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });

// Les tarifs de LabFlow Compta ne sont jamais surchargés par domaine (D7) : grille générale.
const grilleGenerale = async (db = pool) => tarifsFor(await loadTarifs(db), null);

// Le compte visé par une personne : le client lui-même, ou le compte parent d'un gérant.
const compteDe = async (db, userId) => {
  const r = await db.query('SELECT COALESCE(gerant_parent_id, id) AS compte FROM utilisateurs WHERE id = $1', [userId]);
  return r.rows[0]?.compte ?? null;
};

const lire = async (db, clientId) => {
  const r = await db.query(
    `SELECT u.id AS client_id, u.nom AS contact, a.id AS abonnement_id, a.produit,
            ac.abonnement_id IS NOT NULL AS a_config, ac.module_compta_actif, ac.module_compta_active_le,
            ac.nb_gerants_compta, pe.nom_commercial, pe.raison_sociale, pe.nom,
            e.id AS espace_id, e.etat AS espace_etat
       FROM utilisateurs u
       JOIN abonnements a ON a.client_id = u.id
       LEFT JOIN abonnement_config ac ON ac.abonnement_id = a.id
       LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
       LEFT JOIN compta.espaces e ON e.type = 'client_labflow' AND e.titulaire_id = u.id
      WHERE u.id = $1 AND u.role IN ('client', 'comptable')
      ORDER BY a.id DESC
      LIMIT 1`,
    [clientId]
  );
  return r.rows[0] || null;
};

// Mois (AAAA-MM-01) à partir duquel le module est facturé : celui qui suit son activation (heure de Tunis).
const moisFacture = (activeLe) => {
  if (!activeLe) return null;
  const d = new Date(activeLe);
  if (Number.isNaN(d.getTime())) return null;
  const [an, mois] = moisTunis(d).split('-').map(Number);
  return mois === 12 ? `${an + 1}-01-01` : `${an}-${String(mois + 1).padStart(2, '0')}-01`;
};

const presenter = (row, tarifs, demandeEnCours = false) => {
  const actif = row.module_compta_actif === true;
  const nbGerants = actif ? (row.nb_gerants_compta || 0) : 0;
  const prixModule = tarif(tarifs, 'compta_module_mensuel');
  const prixGerant = tarif(tarifs, 'compta_gerant_client_mensuel');
  const postes = actif ? postesCompta({ module_compta_actif: true, nb_gerants_compta: nbGerants }, tarifs) : [];
  return {
    clientId: row.client_id,
    disponible: prixModule > 0,
    actif,
    activeLe: actif ? row.module_compta_active_le : null,
    factureAPartirDe: actif ? moisFacture(row.module_compta_active_le) : null,
    nbGerants,
    nbGerantsMax: NB_GERANTS_MAX,
    prixModule,
    prixGerant,
    postes,
    totalMensuel: totalPostes(postes),
    espace: row.espace_id ? { id: row.espace_id, etat: row.espace_etat } : null,
    demandeEnCours,
  };
};

const demandeEnAttente = async (db, clientId) => {
  const r = await db.query(
    `SELECT 1 FROM demandes d JOIN utilisateurs u ON u.id = d.demandeur_id
      WHERE d.type_demande = 'activer_module_compta' AND d.statut = 'en_attente'
        AND COALESCE(u.gerant_parent_id, u.id) = $1
      LIMIT 1`,
    [clientId]
  );
  return r.rows.length > 0;
};

const etat = async (db, clientId) => {
  const row = await lire(db, clientId);
  if (!row) return null;
  return presenter(row, await grilleGenerale(db), await demandeEnAttente(db, clientId));
};

// Gérants comptables reçus : absent → undefined (le nombre réglé est gardé) ; invalide (booléen, texte, hors bornes)
// → null (refus).
const nbGerantsDe = (v) => {
  if (v === undefined) return undefined;
  if (typeof v === 'boolean' || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= NB_GERANTS_MAX ? n : null;
};
const idValide = (v) => /^\d{1,9}$/.test(String(v));

/**
 * Active (ou règle les gérants comptables) / désactive le module d'un client, dans la transaction `db` de l'appelant.
 * Lève une erreur { statusCode, code } pour un refus. Renvoie { abonnementId, change }.
 */
const basculer = async (db, { clientId, actif, nbGerants, auteurId }) => {
  // Verrou sur la configuration du compte : deux bascules (double clic, bascule admin pendant la validation d'une
  // demande) se suivent au lieu de se croiser ; la lecture qui suit voit l'état validé par la précédente.
  await db.query(
    `SELECT 1 FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1 FOR UPDATE OF ac`,
    [clientId]
  );
  const row = await lire(db, clientId);
  if (!row) throw erreur(404, 'Client introuvable');
  if (row.produit !== 'labflow') throw erreur(400, 'Un cabinet comptable n\'a pas de module : son abonnement est LabFlow Compta.');
  if (!row.a_config) throw erreur(409, 'Configurez d\'abord l\'abonnement du client (onglet Configuration).');
  // nbGerants absent (validation d'une demande, réglage sans ce champ) : le nombre déjà réglé est gardé ; à la
  // désactivation aussi (une réactivation le retrouve).
  const nb = actif && nbGerants !== undefined ? nbGerants : (row.nb_gerants_compta || 0);
  if (nb == null) throw erreur(400, `Gérants comptables supplémentaires : entier de 0 à ${NB_GERANTS_MAX}`);
  if (actif && tarif(await grilleGenerale(db), 'compta_module_mensuel') <= 0) throw erreur(400, MSG_TARIF, 'TARIF_COMPTA_MANQUANT');
  // S3b : la limite ne descend pas sous les gérants comptables supplémentaires que le client a déjà désignés.
  if (actif && row.espace_id) {
    const enPlace = (await db.query(
      `SELECT COUNT(*)::int AS n FROM compta.acces WHERE espace_id = $1 AND role = 'gerant' AND NOT obligatoire`,
      [row.espace_id]
    )).rows[0].n;
    if (nb < enPlace) {
      throw erreur(409, `${enPlace} gérant${enPlace > 1 ? 's' : ''} comptable${enPlace > 1 ? 's' : ''} supplémentaire${enPlace > 1 ? 's sont' : ' est'} en place chez ce client : il doit d'abord en retirer pour descendre à ${nb}.`, 'GERANTS_COMPTA_EN_PLACE');
    }
  }

  const etaitActif = row.module_compta_actif === true;
  const change = etaitActif !== actif || (actif && (row.nb_gerants_compta || 0) !== nb);
  // Dates (configPourMois) : facturé du mois qui suit l'activation jusqu'au mois de la désactivation compris. Une
  // désactivation garde la date d'activation et pose la sienne ; une réactivation dans le mois même de la désactivation
  // reprend la période en cours (date d'activation gardée), sinon elle repart du jour.
  if (change) {
    await db.query(
      `UPDATE abonnement_config
          SET module_compta_actif = $2,
              module_compta_active_le = CASE
                WHEN NOT $2 OR module_compta_actif THEN module_compta_active_le
                WHEN module_compta_active_le IS NOT NULL AND module_compta_desactive_le IS NOT NULL
                     AND date_trunc('month', module_compta_desactive_le AT TIME ZONE 'Africa/Tunis')
                       = date_trunc('month', NOW() AT TIME ZONE 'Africa/Tunis') THEN module_compta_active_le
                ELSE NOW() END,
              module_compta_desactive_le = CASE WHEN $2 THEN NULL WHEN module_compta_actif THEN NOW() ELSE module_compta_desactive_le END,
              nb_gerants_compta = $3,
              updated_at = NOW()
        WHERE abonnement_id = $1`,
      [row.abonnement_id, actif, nb]
    );
  }

  let espaceId = row.espace_id;
  if (actif && !espaceId) {
    const nom = (nomAffiche({ ...row, contact: row.contact }) || row.contact || 'Ma comptabilité').slice(0, 200);
    espaceId = (await db.query(
      `INSERT INTO compta.espaces (type, titulaire_id, nom) VALUES ('client_labflow', $1, $2) RETURNING id`,
      [clientId, nom]
    )).rows[0].id;
    await db.query(
      `INSERT INTO compta.acces (espace_id, personne_id, role, niveau, tous_dossiers, obligatoire, etat)
       VALUES ($1, $2, 'titulaire', 'complet', true, false, 'actif'),
              ($1, NULL, 'gerant', 'complet', true, true, 'a_attribuer')`,
      [espaceId, clientId]
    );
    await journaliser(db, espaceId, auteurId, 'espace_cree', { titulaire: clientId, type: 'client_labflow' });
  } else if (actif && row.espace_etat !== 'actif') {
    await db.query(`UPDATE compta.espaces SET etat = 'actif', updated_at = NOW() WHERE id = $1`, [espaceId]);
    await journaliser(db, espaceId, auteurId, 'espace_rouvert', { titulaire: clientId });
  } else if (!actif && espaceId && row.espace_etat === 'actif') {
    await db.query(`UPDATE compta.espaces SET etat = 'ferme', updated_at = NOW() WHERE id = $1`, [espaceId]);
    await journaliser(db, espaceId, auteurId, 'espace_ferme', { titulaire: clientId });
  }
  // Activation : une demande du client encore en attente (lui ou un de ses gérants) est réglée du même coup.
  if (actif && !etaitActif) {
    await db.query(
      `UPDATE demandes d SET statut = 'validée', traite_par = $2, traite_le = NOW(),
              notes_admin = COALESCE(d.notes_admin, 'Module activé par l''équipe LabFlow')
         FROM utilisateurs u
        WHERE u.id = d.demandeur_id AND COALESCE(u.gerant_parent_id, u.id) = $1
          AND d.type_demande = 'activer_module_compta' AND d.statut = 'en_attente'`,
      [clientId, auteurId ?? null]
    );
  }
  if (change) {
    const type = !actif ? 'module_desactive' : etaitActif ? 'module_gerants' : 'module_active';
    await journaliser(db, espaceId, auteurId, type, { titulaire: clientId, nbGerants: nb });
  }
  return { abonnementId: row.abonnement_id, change };
};

// ── Demande d'ajout de gérants comptables (étape S3b, support_demandes.nb_gerants_compta_supp, migration 205) ────────

// Nombre demandé : absent → 0 ; entier de 0 à NB_GERANTS_MAX ; sinon null (refus).
const nbGerantsDemandes = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= NB_GERANTS_MAX ? n : null;
};
const MSG_NB_DEMANDES = `Gérants comptables : entier de 0 à ${NB_GERANTS_MAX}`;

// À la création de la demande : le module doit être actif et la limite resterait sous le plafond. Lève { statusCode }.
const controlerDemandeGerants = async (db, clientId, n) => {
  const r = await db.query(
    `SELECT ac.module_compta_actif, ac.nb_gerants_compta FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id
      WHERE a.client_id = $1 AND a.produit = 'labflow' ORDER BY a.id DESC LIMIT 1`,
    [clientId]
  );
  if (r.rows[0]?.module_compta_actif !== true) throw erreur(400, 'Le module Comptabilité n\'est pas activé sur votre compte');
  if ((Number(r.rows[0].nb_gerants_compta) || 0) + n > NB_GERANTS_MAX) throw erreur(400, `Au plus ${NB_GERANTS_MAX} gérants comptables supplémentaires`);
  // Une demande à la fois (relecture de S3b : deux demandes validées l'une après l'autre s'additionneraient).
  const enAttente = await db.query(
    `SELECT 1 FROM support_demandes WHERE client_id = $1 AND statut = 'en_attente' AND nb_gerants_compta_supp > 0 LIMIT 1`,
    [clientId]
  );
  if (enAttente.rows.length) throw erreur(409, 'Une demande de gérants comptables attend déjà la validation de l\'équipe LabFlow');
};

// À la validation par l'admin, dans sa transaction (`cur` : configuration verrouillée du compte) : le module doit être
// encore actif ; la limite augmente (facturée à partir du mois suivant, par le recalcul de l'appelant) ; journal.
const ajouterGerantsDemandes = async (db, { cur, clientId, n, auteurId, demandeId }) => {
  if (cur.module_compta_actif !== true) throw erreur(409, 'Le module Comptabilité n\'est plus actif sur ce compte : refusez cette demande');
  const nbApres = (Number(cur.nb_gerants_compta) || 0) + n;
  if (nbApres > NB_GERANTS_MAX) throw erreur(409, `Au plus ${NB_GERANTS_MAX} gérants comptables supplémentaires : refusez cette demande`);
  await db.query('UPDATE abonnement_config SET nb_gerants_compta = $2, updated_at = NOW() WHERE abonnement_id = $1', [cur.abonnement_id, nbApres]);
  const espace = await db.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [clientId]);
  await journaliser(db, espace.rows[0]?.id ?? null, auteurId, 'module_gerants', { titulaire: clientId, nbGerants: nbApres, demande: demandeId });
};

// Après la transaction : les mensualités en attente des mois suivants suivent le module (best effort, comme les
// autres options).
const recalculer = (abonnementId) =>
  recalcPaiementsEnAttente(pool, abonnementId).catch((e) => console.error('[module-compta] recalc paiements:', e.message));

// ── Routes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// GET /api/abonnements/client/:clientId/module-compta (admin)
const lireAdmin = async (req, res) => {
  if (!idValide(req.params.clientId)) return res.status(404).json({ message: 'Client introuvable' });
  try {
    const e = await etat(pool, req.params.clientId);
    if (!e) return res.status(404).json({ message: 'Client introuvable' });
    res.json(e);
  } catch (err) {
    console.error('[module-compta.lire]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/abonnements/client/:clientId/module-compta (admin) — { actif, nbGerantsCompta }
const basculerAdmin = async (req, res) => {
  if (!idValide(req.params.clientId)) return res.status(404).json({ message: 'Client introuvable' });
  if (typeof req.body?.actif !== 'boolean') return res.status(400).json({ message: '« actif » attendu : true ou false' });
  const { actif } = req.body;
  const nbGerants = nbGerantsDe(req.body.nbGerantsCompta);
  if (nbGerants === null) return res.status(400).json({ message: `Gérants comptables supplémentaires : entier de 0 à ${NB_GERANTS_MAX}` });
  const db = await pool.connect();
  let resultat;
  try {
    await db.query('BEGIN');
    resultat = await basculer(db, { clientId: req.params.clientId, actif, nbGerants, auteurId: req.user.id });
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    if (err.statusCode) return res.status(err.statusCode).json({ message: err.message, ...(err.code ? { code: err.code } : {}) });
    console.error('[module-compta.basculer]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
  if (resultat.change) await recalculer(resultat.abonnementId);
  try {
    res.json(await etat(pool, req.params.clientId));
  } catch (err) {
    console.error('[module-compta.basculer] relecture', err);
    res.status(500).json({ message: 'Enregistré, mais la relecture a échoué : rechargez la page' });
  }
};

// GET /api/abonnements/module-compta (client ou gérant : le module de son compte)
const lireClient = async (req, res) => {
  try {
    const compte = await compteDe(pool, req.user.id);
    const e = compte ? await etat(pool, compte) : null;
    if (!e) return res.status(404).json({ message: 'Abonnement introuvable' });
    res.json(e);
  } catch (err) {
    console.error('[module-compta.client]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  NB_GERANTS_MAX, MSG_TARIF, grilleGenerale, compteDe, lire, etat, basculer, recalculer, moisFacture,
  nbGerantsDemandes, MSG_NB_DEMANDES, controlerDemandeGerants, ajouterGerantsDemandes,
  lireAdmin, basculerAdmin, lireClient,
};
