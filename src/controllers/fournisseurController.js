const pool = require('../config/database');

const getEntrepriseId = async (clientId) => {
  const r = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [clientId]);
  return r.rows[0]?.id ?? null;
};

const listFournisseurs = async (req, res) => {
  try {
    const entrepriseId = await getEntrepriseId(req.user.id);
    if (!entrepriseId) return res.json([]);
    const result = await pool.query(
      `SELECT f.id, f.nom, f.adresse, f.telephone, f.created_at,
              COALESCE(
                json_agg(fa.activite_id) FILTER (WHERE fa.activite_id IS NOT NULL),
                '[]'
              ) as activite_ids
       FROM fournisseurs f
       LEFT JOIN fournisseur_activites fa ON fa.fournisseur_id = f.id
       WHERE f.entreprise_id = $1
       GROUP BY f.id
       ORDER BY f.nom`,
      [entrepriseId]
    );
    res.json(result.rows.map((r) => ({
      id: r.id,
      nom: r.nom,
      adresse: r.adresse,
      telephone: r.telephone,
      createdAt: r.created_at,
      activiteIds: r.activite_ids,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getFournisseursForActivite = async (req, res) => {
  const { activiteId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0) return res.json([]);

    const result = await pool.query(
      `SELECT f.id, f.nom, f.telephone
       FROM fournisseurs f
       JOIN fournisseur_activites fa ON fa.fournisseur_id = f.id
       WHERE fa.activite_id = $1
       ORDER BY f.nom`,
      [activiteId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const createFournisseur = async (req, res) => {
  const { nom, adresse, telephone, activiteIds } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });

  try {
    const entrepriseId = await getEntrepriseId(req.user.id);
    if (!entrepriseId) return res.status(403).json({ message: 'Entreprise introuvable' });

    const r = await pool.query(
      `INSERT INTO fournisseurs (entreprise_id, nom, adresse, telephone)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [entrepriseId, nom.trim(), adresse?.trim() || null, telephone?.trim() || null]
    );
    const fournisseur = r.rows[0];

    if (Array.isArray(activiteIds) && activiteIds.length > 0) {
      for (const actId of activiteIds) {
        await pool.query(
          `INSERT INTO fournisseur_activites (fournisseur_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [fournisseur.id, actId]
        );
      }
    }

    res.status(201).json({ id: fournisseur.id, nom: fournisseur.nom, adresse: fournisseur.adresse, telephone: fournisseur.telephone, activiteIds: activiteIds || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateFournisseur = async (req, res) => {
  const { id } = req.params;
  const { nom, adresse, telephone, activiteIds } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });

  try {
    const entrepriseId = await getEntrepriseId(req.user.id);
    const check = await pool.query(
      'SELECT id FROM fournisseurs WHERE id = $1 AND entreprise_id = $2',
      [id, entrepriseId]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Fournisseur introuvable' });

    await pool.query(
      `UPDATE fournisseurs SET nom = $1, adresse = $2, telephone = $3 WHERE id = $4`,
      [nom.trim(), adresse?.trim() || null, telephone?.trim() || null, id]
    );

    await pool.query('DELETE FROM fournisseur_activites WHERE fournisseur_id = $1', [id]);
    if (Array.isArray(activiteIds) && activiteIds.length > 0) {
      for (const actId of activiteIds) {
        await pool.query(
          `INSERT INTO fournisseur_activites (fournisseur_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, actId]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const deleteFournisseur = async (req, res) => {
  const { id } = req.params;
  try {
    const entrepriseId = await getEntrepriseId(req.user.id);
    const check = await pool.query(
      'SELECT id FROM fournisseurs WHERE id = $1 AND entreprise_id = $2',
      [id, entrepriseId]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Fournisseur introuvable' });
    await pool.query('DELETE FROM fournisseurs WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { listFournisseurs, getFournisseursForActivite, createFournisseur, updateFournisseur, deleteFournisseur };
