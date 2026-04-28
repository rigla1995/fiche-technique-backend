const pool = require('../config/database');

// ─── Company Profile ───────────────────────────────────────────────────────

const getEntreprise = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM profil_entreprise WHERE client_id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.json(null);
    res.json(mapEntreprise(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const upsertEntreprise = async (req, res) => {
  const { nom, email, telephone, adresse } = req.body;
  if (!nom || !email) return res.status(400).json({ message: 'Nom et email requis' });
  try {
    const result = await pool.query(
      `INSERT INTO profil_entreprise (client_id, nom, email, telephone, adresse)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (client_id) DO UPDATE
         SET nom = $2, email = $3, telephone = $4, adresse = $5, updated_at = NOW()
       RETURNING *`,
      [req.user.id, nom, email, telephone || null, adresse || null]
    );
    res.json(mapEntreprise(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const mapEntreprise = (row) => ({
  id: row.id,
  clientId: row.client_id,
  nom: row.nom,
  email: row.email,
  telephone: row.telephone,
  adresse: row.adresse,
  memeActivite: row.meme_activite,
  createdAt: row.created_at,
});

// ─── Activities ────────────────────────────────────────────────────────────

const mapActivite = (row) => ({
  id: row.id,
  entrepriseId: row.entreprise_id,
  nom: row.nom,
  adresse: row.adresse,
  telephone: row.telephone,
  email: row.email,
  type: row.type,
  franchiseGroup: row.franchise_group || null,
  laboId: row.labo_id || null,
  laboNom: row.labo_nom || null,
  createdAt: row.created_at,
});

const listActivites = async (req, res) => {
  try {
    const entreprise = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [req.user.id]
    );
    if (entreprise.rows.length === 0) return res.json([]);
    const result = await pool.query(
      `SELECT a.*, l.nom AS labo_nom
       FROM activites a
       LEFT JOIN labos l ON l.id = a.labo_id
       WHERE a.entreprise_id = $1 ORDER BY a.created_at ASC`,
      [entreprise.rows[0].id]
    );
    res.json(result.rows.map(mapActivite));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const createActivite = async (req, res) => {
  // franchiseName is used for franchise batch creation; nom is used for single/distinct
  const { nom, franchiseName, adresse, telephone, email, memeActivite, nombreActivites, type, laboId } = req.body;
  const isFranchise = memeActivite === true || type === 'franchise';
  const baseName = isFranchise && franchiseName ? franchiseName : nom;
  if (!baseName) return res.status(400).json({ message: 'Nom requis' });
  try {
    const entrepriseRes = await pool.query(
      'SELECT id, meme_activite FROM profil_entreprise WHERE client_id = $1',
      [req.user.id]
    );
    if (entrepriseRes.rows.length === 0)
      return res.status(400).json({ message: 'Créez d\'abord votre profil entreprise' });

    const entreprise = entrepriseRes.rows[0];

    const countRes = await pool.query(
      'SELECT COUNT(*) FROM activites WHERE entreprise_id = $1',
      [entreprise.id]
    );
    const isFirst = parseInt(countRes.rows[0].count) === 0;

    if (isFirst && memeActivite !== undefined && memeActivite !== null) {
      await pool.query(
        'UPDATE profil_entreprise SET meme_activite = $1, updated_at = NOW() WHERE id = $2',
        [memeActivite, entreprise.id]
      );
    }

    let activiteType = type || null;
    if (!activiteType && memeActivite !== undefined && memeActivite !== null) {
      activiteType = memeActivite ? 'franchise' : 'distincte';
    }

    const count = isFranchise && parseInt(nombreActivites) > 1
      ? Math.min(parseInt(nombreActivites), 20)
      : 1;
    const franchiseGroupValue = isFranchise ? baseName : null;

    const created = [];
    for (let i = 0; i < count; i++) {
      const activiteName = count > 1 ? `${baseName} ${i + 1}` : (nom || baseName);

      // For franchise activities, if an activity with this exact nom already exists in the
      // franchise group (e.g. from a partial previous attempt), return the existing one
      // instead of failing — makes the creation idempotent on retry.
      if (isFranchise && franchiseGroupValue) {
        const existing = await pool.query(
          'SELECT * FROM activites WHERE entreprise_id = $1 AND LOWER(nom) = LOWER($2) AND LOWER(franchise_group) = LOWER($3)',
          [entreprise.id, activiteName, franchiseGroupValue]
        );
        if (existing.rows.length > 0) {
          created.push(mapActivite(existing.rows[0]));
          continue;
        }
      }

      const result = await pool.query(
        `INSERT INTO activites (entreprise_id, nom, adresse, telephone, email, type, franchise_group, labo_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [entreprise.id, activiteName, adresse || null, telephone || null, email || null, activiteType, franchiseGroupValue, laboId || null]
      );
      created.push(mapActivite(result.rows[0]));
    }
    res.status(201).json(count > 1 ? created : created[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateActivite = async (req, res) => {
  const { id } = req.params;
  const { nom, adresse, telephone, email } = req.body;
  try {
    const entreprise = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [req.user.id]
    );
    if (entreprise.rows.length === 0) return res.status(404).json({ message: 'Entreprise introuvable' });

    const result = await pool.query(
      `UPDATE activites
       SET nom = COALESCE($1, nom),
           adresse = $2,
           telephone = $3,
           email = $4,
           updated_at = NOW()
       WHERE id = $5 AND entreprise_id = $6 RETURNING *`,
      [nom, adresse || null, telephone || null, email || null, id, entreprise.rows[0].id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });
    res.json(mapActivite(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const deleteActivite = async (req, res) => {
  const { id } = req.params;
  try {
    const entreprise = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [req.user.id]
    );
    if (entreprise.rows.length === 0) return res.status(404).json({ message: 'Entreprise introuvable' });

    const result = await pool.query(
      'DELETE FROM activites WHERE id = $1 AND entreprise_id = $2 RETURNING id',
      [id, entreprise.rows[0].id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const duplicateActivite = async (req, res) => {
  const { id } = req.params;
  try {
    const entreprise = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [req.user.id]
    );
    if (entreprise.rows.length === 0) return res.status(404).json({ message: 'Entreprise introuvable' });

    const source = await pool.query(
      'SELECT * FROM activites WHERE id = $1 AND entreprise_id = $2',
      [id, entreprise.rows[0].id]
    );
    if (source.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const src = source.rows[0];
    const result = await pool.query(
      `INSERT INTO activites (entreprise_id, nom, adresse, telephone, email, type)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [src.entreprise_id, src.nom, src.adresse, src.telephone, src.email, src.type]
    );
    res.status(201).json(mapActivite(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const hasActivites = async (req, res) => {
  try {
    const entreprise = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [req.user.id]
    );
    if (entreprise.rows.length === 0) return res.json({ hasActivites: false, count: 0 });

    const count = await pool.query(
      'SELECT COUNT(*) FROM activites WHERE entreprise_id = $1',
      [entreprise.rows[0].id]
    );
    const n = parseInt(count.rows[0].count);
    res.json({ hasActivites: n > 0, count: n });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Per-activity ingredient assignments ────────────────────────────────────

const getActiviteIngredients = async (req, res) => {
  const { id } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id, a.labo_id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const laboId = check.rows[0].labo_id;

    // When the activity belongs to a labo, only expose ingredients that were
    // added to that labo in the Catalogue Global (labo_ingredient_selections).
    // For non-labo activities, expose all admin ingredients.
    const result = laboId
      ? await pool.query(
          `SELECT i.id, i.nom, u.nom as unite, COALESCE(c.nom, 'Sans catégorie') as categorie,
                  i.categorie_id,
                  COALESCE(ipc.prix, i.prix) as prix,
                  ais.prix_unitaire,
                  CASE WHEN ais.ingredient_id IS NOT NULL THEN true ELSE false END as selected
           FROM labo_ingredient_selections lis
           JOIN ingredients i ON i.id = lis.ingredient_id
           JOIN unites u ON i.unite_id = u.id
           LEFT JOIN categories c ON i.categorie_id = c.id
           LEFT JOIN ingredient_prix_client ipc ON ipc.ingredient_id = i.id AND ipc.client_id = $2
           LEFT JOIN activite_ingredient_selections ais ON ais.ingredient_id = i.id AND ais.activite_id = $1
           WHERE lis.labo_id = $3
           ORDER BY c.nom NULLS LAST, i.nom`,
          [id, req.user.id, laboId]
        )
      : await pool.query(
          `SELECT i.id, i.nom, u.nom as unite, COALESCE(c.nom, 'Sans catégorie') as categorie,
                  i.categorie_id,
                  COALESCE(ipc.prix, i.prix) as prix,
                  ais.prix_unitaire,
                  CASE WHEN ais.ingredient_id IS NOT NULL THEN true ELSE false END as selected
           FROM ingredients i
           JOIN unites u ON i.unite_id = u.id
           LEFT JOIN categories c ON i.categorie_id = c.id
           LEFT JOIN ingredient_prix_client ipc ON ipc.ingredient_id = i.id AND ipc.client_id = $2
           LEFT JOIN activite_ingredient_selections ais ON ais.ingredient_id = i.id AND ais.activite_id = $1
           ORDER BY c.nom NULLS LAST, i.nom`,
          [id, req.user.id]
        );

    res.json(result.rows.map((r) => ({
      id: r.id,
      nom: r.nom,
      unite: r.unite,
      categorie: r.categorie,
      categorieId: r.categorie_id ?? null,
      prix: r.prix ? parseFloat(r.prix) : null,
      prixUnitaire: r.prix_unitaire ? parseFloat(r.prix_unitaire) : null,
      selected: r.selected,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const toggleActiviteIngredient = async (req, res) => {
  const { id, ingredientId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const existing = await pool.query(
      'SELECT 1 FROM activite_ingredient_selections WHERE activite_id = $1 AND ingredient_id = $2',
      [id, ingredientId]
    );
    if (existing.rows.length > 0) {
      await pool.query(
        'DELETE FROM activite_ingredient_selections WHERE activite_id = $1 AND ingredient_id = $2',
        [id, ingredientId]
      );
      res.json({ selected: false });
    } else {
      const { prixUnitaire } = req.body;
      await pool.query(
        'INSERT INTO activite_ingredient_selections (activite_id, ingredient_id, prix_unitaire) VALUES ($1, $2, $3)',
        [id, ingredientId, prixUnitaire || null]
      );
      res.json({ selected: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getActiviteTypesSummary = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         BOOL_OR(a.type = 'franchise') AS has_franchise,
         BOOL_OR(a.type IS NULL OR a.type = 'distincte') AS has_distinct,
         BOOL_OR(a.type = 'franchise' AND sel.cnt > 0) AS has_franchise_selections,
         BOOL_OR((a.type IS NULL OR a.type = 'distincte') AND sel.cnt > 0) AS has_distinct_selections
       FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       LEFT JOIN (
         SELECT activite_id, COUNT(*) AS cnt
         FROM activite_ingredient_selections
         GROUP BY activite_id
       ) sel ON sel.activite_id = a.id
       WHERE pe.client_id = $1`,
      [req.user.id]
    );
    const row = result.rows[0];
    res.json({
      hasFranchise: row.has_franchise ?? false,
      hasDistinct: row.has_distinct ?? false,
      hasFranchiseSelections: row.has_franchise_selections ?? false,
      hasDistinctSelections: row.has_distinct_selections ?? false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateIngredientPrice = async (req, res) => {
  const { id, ingredientId } = req.params;
  const { prixUnitaire } = req.body;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    await pool.query(
      `INSERT INTO activite_ingredient_selections (activite_id, ingredient_id, prix_unitaire)
       VALUES ($1, $2, $3)
       ON CONFLICT (activite_id, ingredient_id) DO UPDATE SET prix_unitaire = $3`,
      [id, ingredientId, prixUnitaire ?? null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getEntreprise, upsertEntreprise,
  listActivites, createActivite, updateActivite, deleteActivite, duplicateActivite,
  hasActivites,
  getActiviteIngredients, toggleActiviteIngredient, updateIngredientPrice,
  getActiviteTypesSummary,
};
