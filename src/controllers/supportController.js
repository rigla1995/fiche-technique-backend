const pool = require('../config/database');

const mapDemande = (row) => ({
  id: row.id,
  clientId: row.client_id,
  clientNom: row.client_nom || row.nom || null,
  clientEmail: row.client_email || row.email || null,
  type: row.type,
  statut: row.statut,
  // ingredient_manquant
  domaineId: row.domaine_id,
  domaineNom: row.domaine_nom || null,
  categorieNom: row.categorie_nom,
  uniteNom: row.unite_nom,
  nomIngredient: row.nom_ingredient,
  // supplement
  nbActivitesSupp: row.nb_activites_supp,
  nbLabosSupp: row.nb_labos_supp,
  nbGerantsSupp: row.nb_gerants_supp,
  // aide
  description: row.description,
  // admin
  notesAdmin: row.notes_admin,
  traitePar: row.traite_par,
  traiteParNom: row.traite_par_nom || null,
  traiteLe: row.traite_le,
  createdAt: row.created_at,
});

// Client: list my support requests
const listMine = async (req, res) => {
  const clientId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT sd.*, da.nom AS domaine_nom
       FROM support_demandes sd
       LEFT JOIN domaines_activite da ON da.id = sd.domaine_id
       WHERE sd.client_id = $1
       ORDER BY sd.created_at DESC`,
      [clientId]
    );
    res.json(result.rows.map(mapDemande));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Client: create a support request
const create = async (req, res) => {
  const clientId = req.user.id;
  const { type } = req.body;
  const validTypes = ['ingredient_manquant', 'supplement', 'aide'];
  if (!validTypes.includes(type)) return res.status(400).json({ message: 'Type invalide' });

  try {
    // Fetch client name for denorm
    const clientRes = await pool.query('SELECT nom FROM utilisateurs WHERE id = $1', [clientId]);
    const clientNom = clientRes.rows[0]?.nom || null;

    let params;
    let sql;

    if (type === 'ingredient_manquant') {
      const { domaineId, categorieNom, uniteNom, nomIngredient } = req.body;
      if (!nomIngredient) return res.status(400).json({ message: 'Nom de l\'ingrédient requis' });
      sql = `INSERT INTO support_demandes
             (client_id, client_nom, type, domaine_id, categorie_nom, unite_nom, nom_ingredient)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`;
      params = [clientId, clientNom, type, domaineId || null, categorieNom || null, uniteNom || null, nomIngredient];
    } else if (type === 'supplement') {
      const { nbActivitesSupp, nbLabosSupp, nbGerantsSupp } = req.body;
      const total = (nbActivitesSupp || 0) + (nbLabosSupp || 0) + (nbGerantsSupp || 0);
      if (total === 0) return res.status(400).json({ message: 'Indiquez au moins un supplément' });
      sql = `INSERT INTO support_demandes
             (client_id, client_nom, type, nb_activites_supp, nb_labos_supp, nb_gerants_supp)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`;
      params = [clientId, clientNom, type, nbActivitesSupp || 0, nbLabosSupp || 0, nbGerantsSupp || 0];
    } else {
      const { description } = req.body;
      if (!description?.trim()) return res.status(400).json({ message: 'Description requise' });
      sql = `INSERT INTO support_demandes (client_id, client_nom, type, description) VALUES ($1,$2,$3,$4) RETURNING *`;
      params = [clientId, clientNom, type, description.trim()];
    }

    const result = await pool.query(sql, params);
    res.status(201).json(mapDemande(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Admin: list all support requests
const listAll = async (req, res) => {
  const { statut, type } = req.query;
  try {
    const conditions = ['1=1'];
    const params = [];
    let i = 1;
    if (statut) { conditions.push(`sd.statut = $${i++}`); params.push(statut); }
    if (type)   { conditions.push(`sd.type = $${i++}`);   params.push(type); }

    const result = await pool.query(
      `SELECT sd.*,
              u.nom AS client_nom, u.email AS client_email,
              da.nom AS domaine_nom,
              admin.nom AS traite_par_nom
       FROM support_demandes sd
       LEFT JOIN utilisateurs u     ON u.id = sd.client_id
       LEFT JOIN domaines_activite da ON da.id = sd.domaine_id
       LEFT JOIN utilisateurs admin  ON admin.id = sd.traite_par
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE sd.statut WHEN 'en_attente' THEN 0 WHEN 'validée' THEN 1 ELSE 2 END,
         sd.created_at DESC`,
      params
    );
    res.json(result.rows.map(mapDemande));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Admin: process (validate/refuse) a support request
const traiter = async (req, res) => {
  const { id } = req.params;
  const { statut, notesAdmin } = req.body;
  if (!['validée', 'refusée'].includes(statut)) return res.status(400).json({ message: 'Statut invalide' });

  try {
    const demandeRes = await pool.query('SELECT * FROM support_demandes WHERE id = $1', [id]);
    if (demandeRes.rows.length === 0) return res.status(404).json({ message: 'Demande introuvable' });
    const demande = demandeRes.rows[0];

    const result = await pool.query(
      `UPDATE support_demandes
       SET statut = $1, notes_admin = $2, traite_par = $3, traite_le = NOW()
       WHERE id = $4 RETURNING *`,
      [statut, notesAdmin || null, req.user.id, id]
    );

    // If validated ingredient request: add ingredient to global catalogue
    if (statut === 'validée' && demande.type === 'ingredient_manquant' && demande.nom_ingredient) {
      // Find or create unit
      let uniteId = null;
      if (demande.unite_nom) {
        const uniteRes = await pool.query(
          `INSERT INTO unites (nom) VALUES ($1) ON CONFLICT (nom) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
          [demande.unite_nom]
        );
        uniteId = uniteRes.rows[0].id;
      }

      // Find or create category
      let categorieId = null;
      if (demande.categorie_nom) {
        const catRes = await pool.query(
          `INSERT INTO categories (nom) VALUES ($1) ON CONFLICT (nom) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
          [demande.categorie_nom]
        );
        categorieId = catRes.rows[0].id;
      }

      if (uniteId) {
        await pool.query(
          `INSERT INTO ingredients (nom, unite_id, categorie_id, domaine_id, prix)
           VALUES ($1, $2, $3, $4, NULL)
           ON CONFLICT DO NOTHING`,
          [demande.nom_ingredient, uniteId, categorieId, demande.domaine_id]
        ).catch(() => {});
      }
    }

    // If validated supplement: update abonnement_config
    if (statut === 'validée' && demande.type === 'supplement') {
      await pool.query(
        `UPDATE abonnement_config ac
         SET nb_activites = nb_activites + $1,
             nb_labos = nb_labos + $2,
             nb_gerants = nb_gerants + $3,
             updated_at = NOW()
         FROM abonnements a
         WHERE a.id = ac.abonnement_id AND a.client_id = $4`,
        [demande.nb_activites_supp || 0, demande.nb_labos_supp || 0, demande.nb_gerants_supp || 0, demande.client_id]
      );
    }

    res.json(mapDemande(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { listMine, create, listAll, traiter };
