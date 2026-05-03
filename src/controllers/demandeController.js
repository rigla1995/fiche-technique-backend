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
  const allowed = ['gerant_sup', 'labo_sup', 'upgrade_entreprise'];
  if (!allowed.includes(typeDemande)) return res.status(400).json({ message: 'Type invalide' });
  if (typeDemande === 'upgrade_entreprise' && req.user.compteType !== 'independant') {
    return res.status(403).json({ message: 'Réservé aux comptes indépendant' });
  }

  try {
    let montant = null;
    if (typeDemande === 'upgrade_entreprise') {
      const [entrepriseTarif, aboRes] = await Promise.all([
        pool.query(`SELECT valeur_dt FROM tarifs_config WHERE cle = 'entreprise_onboarding'`),
        pool.query(`SELECT montant_onboarding FROM abonnements WHERE client_id = $1`, [req.user.id]),
      ]);
      const tarifEntreprise = entrepriseTarif.rows[0]?.valeur_dt ?? 0;
      const dejaPayé = aboRes.rows[0]?.montant_onboarding ?? 0;
      montant = Math.max(0, tarifEntreprise - dejaPayé);
    } else {
      const cle = typeDemande === 'labo_sup' ? 'labo_sup_mensuel' : 'gerant_sup_mensuel';
      const tarifRes = await pool.query('SELECT valeur_dt FROM tarifs_config WHERE cle = $1', [cle]);
      montant = tarifRes.rows[0]?.valeur_dt || null;
    }

    const result = await pool.query(
      `INSERT INTO demandes (demandeur_id, demandeur_type, type_demande, montant_mensuel_dt, notes_client)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, req.user.compteType, typeDemande, montant, notes || null]
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
  const { statut, notesAdmin, montantMigration } = req.body;
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

    // If validating an upgrade_entreprise demande, run full account migration
    if (statut === 'validée' && type_demande === 'upgrade_entreprise') {
      const userRes = await client.query('SELECT * FROM utilisateurs WHERE id = $1', [demandeur_id]);
      const u = userRes.rows[0];

      // 1. Create profil_entreprise
      const peRes = await client.query(
        `INSERT INTO profil_entreprise (client_id, nom, email, telephone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (client_id) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
        [demandeur_id, u.nom, u.email, u.telephone || null]
      );
      const entrepriseId = peRes.rows[0].id;

      // 2. Create activite (type=NULL — set by user in wizard)
      const actRes = await client.query(
        `INSERT INTO activites (entreprise_id, nom) VALUES ($1, $2) RETURNING id`,
        [entrepriseId, u.nom]
      );
      const activiteId = actRes.rows[0].id;

      // 3. Transfer ingredient selections → activite_ingredient_selections
      await client.query(
        `INSERT INTO activite_ingredient_selections (activite_id, ingredient_id, prix_unitaire)
         SELECT $1, cis.ingredient_id, COALESCE(ipc.prix, i.prix)
         FROM client_ingredient_selections cis
         LEFT JOIN ingredient_prix_client ipc
           ON ipc.ingredient_id = cis.ingredient_id AND ipc.client_id = $2
         LEFT JOIN ingredients i ON i.id = cis.ingredient_id
         WHERE cis.client_id = $2
         ON CONFLICT DO NOTHING`,
        [activiteId, demandeur_id]
      );

      // 4. Transfer stock → stock_entreprise_daily
      await client.query(
        `INSERT INTO stock_entreprise_daily
           (activite_id, ingredient_id, quantite, prix_unitaire, date_appro,
            fournisseur_id, ref_facture, type_appro, updated_at)
         SELECT $1, ingredient_id, quantite, prix_unitaire, date_appro,
                fournisseur_id, ref_facture, type_appro, updated_at
         FROM stock_client_daily
         WHERE client_id = $2
         ON CONFLICT DO NOTHING`,
        [activiteId, demandeur_id]
      );

      // 5. Transfer fournisseurs: client_id → entreprise_id, link to activite
      const fourn = await client.query(
        `UPDATE fournisseurs SET entreprise_id = $1, client_id = NULL
         WHERE client_id = $2 RETURNING id`,
        [entrepriseId, demandeur_id]
      );
      for (const f of fourn.rows) {
        await client.query(
          `INSERT INTO fournisseur_activites (fournisseur_id, activite_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [f.id, activiteId]
        );
      }

      // 6. Update abonnement compte_type
      await client.query(
        `UPDATE abonnements SET compte_type = 'entreprise' WHERE client_id = $1`,
        [demandeur_id]
      );

      // 7. Set user to entreprise + trigger upgrade wizard
      await client.query(
        `UPDATE utilisateurs SET compte_type = 'entreprise', onboarding_step = 50 WHERE id = $1`,
        [demandeur_id]
      );
    }

    // Update demande record
    const result = await client.query(
      `UPDATE demandes
       SET statut = $1, notes_admin = COALESCE($2, notes_admin),
           montant_mensuel_dt = COALESCE($5, montant_mensuel_dt),
           traite_par = $3, traite_le = NOW()
       WHERE id = $4
       RETURNING *`,
      [statut, notesAdmin || null, req.user.id, id, montantMigration ?? null]
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
