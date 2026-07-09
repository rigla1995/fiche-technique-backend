const pool = require('../config/database');

const mapDemande = (row) => ({
  id: row.id,
  demandeurId: row.demandeur_id,
  demandeurNom: row.demandeur_nom,
  demandeurType: row.demandeur_type,
  typeDemande: row.type_demande,
  statut: row.statut,
  montantMensuelDt: row.montant_mensuel_dt,
  montantOnboardingClient: row.montant_onboarding_client ?? null,
  notesClient: row.notes_client,
  notesAdmin: row.notes_admin,
  traitePar: row.traite_par,
  traiteParNom: row.traite_par_nom,
  traite_le: row.traite_le,
  createdAt: row.created_at,
});

// POST /api/demandes — client creates a request
const create = async (req, res) => {
  const { typeDemande, notes } = req.body;
  const allowed = ['gerant_sup', 'labo_sup', 'activer_module_vente', 'activer_module_acheteurs', 'passer_formule_premium'];
  if (!allowed.includes(typeDemande)) return res.status(400).json({ message: 'Type invalide' });

  try {
    // Une seule demande EN ATTENTE par type et par demandeur
    const pending = await pool.query(
      `SELECT 1 FROM demandes WHERE demandeur_id = $1 AND type_demande = $2 AND statut = 'en_attente' LIMIT 1`,
      [req.user.id, typeDemande]
    );
    if (pending.rows.length > 0) {
      return res.status(409).json({ message: 'Une demande identique est déjà en attente de validation' });
    }
    let cle = null;
    if (typeDemande === 'labo_sup') cle = 'labo_sup_mensuel';
    else if (typeDemande === 'gerant_sup') cle = 'gerant_sup_mensuel';
    else if (typeDemande === 'activer_module_acheteurs') cle = 'acheteurs_palier_10'; // tarif « à partir de »
    // passer_formule_premium : pas de montant affiché (le surcoût réel dépend de la config — delta calculé par l'admin)
    const tarifRes = cle
      ? await pool.query('SELECT valeur_dt FROM tarifs_config WHERE cle = $1', [cle])
      : { rows: [] };
    const montant = tarifRes.rows[0]?.valeur_dt || null;

    const result = await pool.query(
      `INSERT INTO demandes (demandeur_id, demandeur_type, type_demande, montant_mensuel_dt, notes_client)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, 'client', typeDemande, montant, notes || null]
    );
    res.status(201).json(mapDemande(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/demandes — client lists their own requests
const listMine = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.nom AS demandeur_nom, NULL AS traite_par_nom
       FROM demandes d
       LEFT JOIN utilisateurs u ON u.id = d.demandeur_id
       WHERE d.demandeur_id = $1
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows.map(mapDemande));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /admin/demandes — admin lists all
const listAll = async (req, res) => {
  const { statut } = req.query;
  try {
    const params = [];
    let where = '';
    if (statut) { params.push(statut); where = `WHERE d.statut = $1`; }

    const result = await pool.query(
      `SELECT d.*, u.nom AS demandeur_nom, a.nom AS traite_par_nom,
              ab.montant_onboarding AS montant_onboarding_client
       FROM demandes d
       LEFT JOIN utilisateurs u ON u.id = d.demandeur_id
       LEFT JOIN utilisateurs a ON a.id = d.traite_par
       LEFT JOIN abonnements ab ON ab.client_id = d.demandeur_id
       ${where}
       ORDER BY d.created_at DESC`,
      params
    );
    res.json(result.rows.map(mapDemande));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /admin/demandes/:id — admin validates or refuses
const traiter = async (req, res) => {
  const { id } = req.params;
  const { statut, notesAdmin } = req.body;
  if (!['validée', 'refusée'].includes(statut)) {
    return res.status(400).json({ message: 'Statut doit être "validée" ou "refusée"' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check demande exists and get its type
    const demandeCheck = await client.query('SELECT type_demande, demandeur_id FROM demandes WHERE id = $1', [id]);
    if (demandeCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Demande introuvable' });
    }
    const { type_demande, demandeur_id } = demandeCheck.rows[0];

    // If validating an activer_module_vente demande, upsert profil_entreprise and set module_vente_actif
    if (statut === 'validée' && type_demande === 'activer_module_vente') {
      await client.query(
        `INSERT INTO profil_entreprise (client_id, nom, email)
         SELECT $1, nom, email FROM utilisateurs WHERE id = $1
         ON CONFLICT (client_id) DO NOTHING`,
        [demandeur_id]
      );
      await client.query(
        `UPDATE profil_entreprise
         SET module_vente_actif = true,
             module_vente_activated_at = COALESCE(module_vente_activated_at, NOW())
         WHERE client_id = $1`,
        [demandeur_id]
      );
    }

    // Validation d'un passage en formule Premium : la config bascule, le nouveau
    // prix s'applique aux mensualités suivantes (recalcul mensuel par le cron).
    // COALESCE(gerant_parent_id, id) : une demande envoyée par un GÉRANT doit
    // basculer le compte PARENT (sinon UPDATE 0 ligne, silencieux).
    if (statut === 'validée' && type_demande === 'passer_formule_premium') {
      await client.query(
        `UPDATE abonnement_config SET formule_activites = 'premium', updated_at = NOW()
         WHERE nb_activites >= 1 AND abonnement_id = (
           SELECT a.id FROM abonnements a
           WHERE a.client_id = (SELECT COALESCE(gerant_parent_id, id) FROM utilisateurs WHERE id = $1)
           ORDER BY a.id DESC LIMIT 1)`,
        [demandeur_id]
      );
    }

    // Validation d'une demande d'activation du module Acheteurs (même mécanique).
    // NB : le quota nb_acheteurs reste à régler par l'admin dans la config du compte.
    if (statut === 'validée' && type_demande === 'activer_module_acheteurs') {
      await client.query(
        `INSERT INTO profil_entreprise (client_id, nom, email)
         SELECT $1, nom, email FROM utilisateurs WHERE id = $1
         ON CONFLICT (client_id) DO NOTHING`,
        [demandeur_id]
      );
      await client.query(
        `UPDATE profil_entreprise
         SET module_acheteurs_actif = true,
             module_acheteurs_activated_at = COALESCE(module_acheteurs_activated_at, NOW())
         WHERE client_id = $1`,
        [demandeur_id]
      );
    }

    // Update demande record
    const result = await client.query(
      `UPDATE demandes
       SET statut = $1, notes_admin = COALESCE($2, notes_admin),
           traite_par = $3, traite_le = NOW()
       WHERE id = $4
       RETURNING *`,
      [statut, notesAdmin || null, req.user.id, id]
    );

    await client.query('COMMIT');
    res.json(mapDemande(result.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    client.release();
  }
};

module.exports = { create, listMine, listAll, traiter };
