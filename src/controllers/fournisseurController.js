const pool = require('../config/database');

const getEntrepriseId = async (clientId) => {
  const r = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [clientId]);
  return r.rows[0]?.id ?? null;
};

const listFournisseurs = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const isGerant = req.user.role === 'gerant';
  const gerantActiviteId = req.user.gerant_activite_id;
  const gerantActiviteType = req.user.gerant_activite_type;
  try {
    const entrepriseId = await getEntrepriseId(clientId);
    if (!entrepriseId) return res.json([]);

    // Gérant scoping: only show fournisseurs for their specific activité or labo
    if (isGerant && gerantActiviteId) {
      let scopedResult;
      if (gerantActiviteType === 'labo') {
        scopedResult = await pool.query(
          `SELECT f.id, f.nom, f.adresse, f.telephone, f.is_labo, f.created_at,
                  ARRAY[${gerantActiviteId}]::integer[] as activite_ids,
                  ARRAY[${gerantActiviteId}]::integer[] as labo_ids,
                  0 as appro_count, '[]'::json as appro_by_activite
           FROM fournisseurs f
           JOIN fournisseur_labos fl ON fl.fournisseur_id = f.id
           WHERE f.entreprise_id = $1 AND f.nom != 'AUTO' AND fl.labo_id = $2
           ORDER BY f.nom`,
          [entrepriseId, gerantActiviteId]
        );
      } else {
        scopedResult = await pool.query(
          `SELECT f.id, f.nom, f.adresse, f.telephone, f.is_labo, f.created_at,
                  ARRAY[${gerantActiviteId}]::integer[] as activite_ids,
                  '[]'::json as labo_ids,
                  0 as appro_count, '[]'::json as appro_by_activite
           FROM fournisseurs f
           JOIN fournisseur_activites fa ON fa.fournisseur_id = f.id
           WHERE f.entreprise_id = $1 AND f.nom != 'AUTO' AND fa.activite_id = $2
           ORDER BY f.nom`,
          [entrepriseId, gerantActiviteId]
        );
      }
      return res.json(scopedResult.rows.map((r) => ({
        id: r.id, nom: r.nom, adresse: r.adresse, telephone: r.telephone,
        isLabo: r.is_labo ?? false, createdAt: r.created_at,
        activiteIds: r.activite_ids ?? [], laboIds: r.labo_ids ?? [],
        hasAppros: false, approCount: 0, approByActivite: [],
      })));
    }

    const result = await pool.query(
      `SELECT f.id, f.nom, f.adresse, f.telephone, f.is_labo, f.created_at,
              COALESCE(
                json_agg(DISTINCT fa.activite_id) FILTER (WHERE fa.activite_id IS NOT NULL),
                '[]'
              ) as activite_ids,
              COALESCE(
                json_agg(DISTINCT fl.labo_id) FILTER (WHERE fl.labo_id IS NOT NULL),
                '[]'
              ) as labo_ids,
              (SELECT COUNT(*) FROM stock_entreprise_daily sed WHERE sed.fournisseur_id = f.id AND sed.quantite > 0) AS appro_count,
              (SELECT COALESCE(json_agg(json_build_object('activiteId', sub.activite_id, 'nom', a.nom, 'count', sub.cnt)), '[]')
               FROM (
                 SELECT sed2.activite_id, COUNT(*) AS cnt
                 FROM stock_entreprise_daily sed2
                 WHERE sed2.fournisseur_id = f.id AND sed2.quantite > 0
                 GROUP BY sed2.activite_id
               ) sub
               JOIN activites a ON a.id = sub.activite_id
              ) AS appro_by_activite
       FROM fournisseurs f
       LEFT JOIN fournisseur_activites fa ON fa.fournisseur_id = f.id
       LEFT JOIN fournisseur_labos fl ON fl.fournisseur_id = f.id
       WHERE f.entreprise_id = $1 AND f.nom != 'AUTO'
       GROUP BY f.id
       ORDER BY f.is_labo DESC, f.nom`,
      [entrepriseId]
    );
    res.json(result.rows.map((r) => ({
      id: r.id,
      nom: r.nom,
      adresse: r.adresse,
      telephone: r.telephone,
      isLabo: r.is_labo ?? false,
      createdAt: r.created_at,
      activiteIds: r.activite_ids,
      laboIds: r.labo_ids,
      hasAppros: Number(r.appro_count) > 0,
      approCount: Number(r.appro_count),
      approByActivite: r.appro_by_activite ?? [],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getFournisseursForActivite = async (req, res) => {
  const { activiteId } = req.params;
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, clientId]
    );
    if (check.rows.length === 0) return res.json([]);

    const result = await pool.query(
      `SELECT f.id, f.nom, f.telephone, f.is_labo
       FROM fournisseurs f
       JOIN fournisseur_activites fa ON fa.fournisseur_id = f.id
       WHERE f.nom != 'AUTO' AND fa.activite_id = $1 AND f.is_labo = false
       ORDER BY f.nom`,
      [activiteId]
    );
    res.json(result.rows.map((r) => ({ id: r.id, nom: r.nom, telephone: r.telephone, isLabo: r.is_labo ?? false })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const createFournisseur = async (req, res) => {
  const { nom, adresse, telephone, activiteIds, laboIds } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });
  const clientId = req.user.gerant_parent_id || req.user.id;
  const isGerant = req.user.role === 'gerant';
  const gerantActiviteId = req.user.gerant_activite_id;
  const gerantActiviteType = req.user.gerant_activite_type;
  try {
    const entrepriseId = await getEntrepriseId(clientId);
    if (!entrepriseId) return res.status(403).json({ message: 'Entreprise introuvable' });

    const r = await pool.query(
      `INSERT INTO fournisseurs (entreprise_id, nom, adresse, telephone)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [entrepriseId, nom.trim(), adresse?.trim() || null, telephone?.trim() || null]
    );
    const fournisseur = r.rows[0];

    // Gérant: auto-assign to their activité/labo only
    if (isGerant && gerantActiviteId) {
      if (gerantActiviteType === 'labo') {
        await pool.query(
          `INSERT INTO fournisseur_labos (fournisseur_id, labo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [fournisseur.id, gerantActiviteId]
        );
      } else {
        await pool.query(
          `INSERT INTO fournisseur_activites (fournisseur_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [fournisseur.id, gerantActiviteId]
        );
      }
      return res.status(201).json({ id: fournisseur.id, nom: fournisseur.nom, adresse: fournisseur.adresse, telephone: fournisseur.telephone, activiteIds: gerantActiviteType !== 'labo' ? [gerantActiviteId] : [], laboIds: gerantActiviteType === 'labo' ? [gerantActiviteId] : [] });
    }

    if (Array.isArray(activiteIds) && activiteIds.length > 0) {
      for (const actId of activiteIds) {
        await pool.query(
          `INSERT INTO fournisseur_activites (fournisseur_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [fournisseur.id, actId]
        );
      }
    }

    if (Array.isArray(laboIds) && laboIds.length > 0) {
      for (const laboId of laboIds) {
        await pool.query(
          `INSERT INTO fournisseur_labos (fournisseur_id, labo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [fournisseur.id, laboId]
        );
      }
    }

    res.status(201).json({ id: fournisseur.id, nom: fournisseur.nom, adresse: fournisseur.adresse, telephone: fournisseur.telephone, activiteIds: activiteIds || [], laboIds: laboIds || [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateFournisseur = async (req, res) => {
  const { id } = req.params;
  const { nom, adresse, telephone, activiteIds, laboIds } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });
  const clientId = req.user.gerant_parent_id || req.user.id;
  const isGerant = req.user.role === 'gerant';
  const gerantActiviteId = req.user.gerant_activite_id;
  const gerantActiviteType = req.user.gerant_activite_type;
  try {
    const entrepriseId = await getEntrepriseId(clientId);
    const check = await pool.query(
      'SELECT id, is_labo FROM fournisseurs WHERE id = $1 AND entreprise_id = $2',
      [id, entrepriseId]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Fournisseur introuvable' });
    if (check.rows[0].is_labo) return res.status(403).json({ message: 'Ce fournisseur est géré automatiquement par le labo.' });

    // Gérant: verify this fournisseur belongs to their activité/labo
    if (isGerant && gerantActiviteId) {
      const scopeCheck = gerantActiviteType === 'labo'
        ? await pool.query('SELECT fournisseur_id FROM fournisseur_labos WHERE fournisseur_id = $1 AND labo_id = $2', [id, gerantActiviteId])
        : await pool.query('SELECT fournisseur_id FROM fournisseur_activites WHERE fournisseur_id = $1 AND activite_id = $2', [id, gerantActiviteId]);
      if (scopeCheck.rows.length === 0) return res.status(403).json({ message: 'Accès refusé' });
    }

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

    await pool.query('DELETE FROM fournisseur_labos WHERE fournisseur_id = $1', [id]);
    if (Array.isArray(laboIds) && laboIds.length > 0) {
      for (const laboId of laboIds) {
        await pool.query(
          `INSERT INTO fournisseur_labos (fournisseur_id, labo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, laboId]
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
  const clientId = req.user.gerant_parent_id || req.user.id;
  const isGerant = req.user.role === 'gerant';
  const gerantActiviteId = req.user.gerant_activite_id;
  const gerantActiviteType = req.user.gerant_activite_type;
  try {
    const entrepriseId = await getEntrepriseId(clientId);
    const check = await pool.query(
      'SELECT id, is_labo FROM fournisseurs WHERE id = $1 AND entreprise_id = $2',
      [id, entrepriseId]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Fournisseur introuvable' });
    if (check.rows[0].is_labo) return res.status(403).json({ message: 'Ce fournisseur est géré automatiquement par le labo.' });

    // Gérant: verify this fournisseur belongs to their activité/labo
    if (isGerant && gerantActiviteId) {
      const scopeCheck = gerantActiviteType === 'labo'
        ? await pool.query('SELECT fournisseur_id FROM fournisseur_labos WHERE fournisseur_id = $1 AND labo_id = $2', [id, gerantActiviteId])
        : await pool.query('SELECT fournisseur_id FROM fournisseur_activites WHERE fournisseur_id = $1 AND activite_id = $2', [id, gerantActiviteId]);
      if (scopeCheck.rows.length === 0) return res.status(403).json({ message: 'Accès refusé' });
    }
    await pool.query('DELETE FROM fournisseurs WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Indépendant fournisseurs (linked directly to client_id) ──────────────────

const listFournisseursIndep = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const result = await pool.query(
      `SELECT f.id, f.nom, f.adresse, f.telephone, f.created_at,
              (SELECT COUNT(*) FROM stock_client_daily scd WHERE scd.fournisseur_id = f.id AND scd.quantite > 0) AS appro_count
       FROM fournisseurs f
       WHERE f.client_id = $1 AND f.nom != 'AUTO' ORDER BY f.nom`,
      [clientId]
    );
    res.json(result.rows.map((r) => ({
      id: r.id, nom: r.nom, adresse: r.adresse, telephone: r.telephone,
      isLabo: false, activiteIds: [], laboIds: [], createdAt: r.created_at,
      hasAppros: Number(r.appro_count) > 0,
      approCount: Number(r.appro_count),
      approByActivite: [],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const createFournisseurIndep = async (req, res) => {
  const { nom, adresse, telephone } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });
  try {
    const r = await pool.query(
      `INSERT INTO fournisseurs (client_id, nom, adresse, telephone)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, nom.trim(), adresse?.trim() || null, telephone?.trim() || null]
    );
    const f = r.rows[0];
    res.status(201).json({ id: f.id, nom: f.nom, adresse: f.adresse, telephone: f.telephone, isLabo: false, activiteIds: [], laboIds: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateFournisseurIndep = async (req, res) => {
  const { id } = req.params;
  const { nom, adresse, telephone } = req.body;
  if (!nom?.trim()) return res.status(400).json({ message: 'Nom requis' });
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const check = await pool.query('SELECT id FROM fournisseurs WHERE id = $1 AND client_id = $2', [id, clientId]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Fournisseur introuvable' });
    await pool.query(
      `UPDATE fournisseurs SET nom = $1, adresse = $2, telephone = $3 WHERE id = $4`,
      [nom.trim(), adresse?.trim() || null, telephone?.trim() || null, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const deleteFournisseurIndep = async (req, res) => {
  const { id } = req.params;
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const check = await pool.query('SELECT id FROM fournisseurs WHERE id = $1 AND client_id = $2', [id, clientId]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Fournisseur introuvable' });
    await pool.query('DELETE FROM fournisseurs WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  listFournisseurs, getFournisseursForActivite, createFournisseur, updateFournisseur, deleteFournisseur,
  listFournisseursIndep, createFournisseurIndep, updateFournisseurIndep, deleteFournisseurIndep,
};
