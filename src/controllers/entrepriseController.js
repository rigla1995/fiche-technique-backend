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
      'SELECT * FROM activites WHERE entreprise_id = $1 ORDER BY created_at ASC',
      [entreprise.rows[0].id]
    );
    res.json(result.rows.map(mapActivite));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const createActivite = async (req, res) => {
  const { nom, adresse, telephone, email, memeActivite, nombreActivites, type } = req.body;
  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  try {
    const entrepriseRes = await pool.query(
      'SELECT id, meme_activite FROM profil_entreprise WHERE client_id = $1',
      [req.user.id]
    );
    if (entrepriseRes.rows.length === 0)
      return res.status(400).json({ message: 'Créez d\'abord votre profil entreprise' });

    const entreprise = entrepriseRes.rows[0];

    // Check if this is the first activity — if so, set meme_activite on the company
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

    // Derive type: explicit payload value takes precedence, then derive from memeActivite
    let activiteType = type || null;
    if (!activiteType && memeActivite !== undefined && memeActivite !== null) {
      activiteType = memeActivite ? 'franchise' : 'distincte';
    }

    const count = parseInt(nombreActivites) > 1 ? Math.min(parseInt(nombreActivites), 20) : 1;
    const created = [];
    for (let i = 0; i < count; i++) {
      const activiteName = count > 1 ? `${nom} ${i + 1}` : nom;
      const result = await pool.query(
        `INSERT INTO activites (entreprise_id, nom, adresse, telephone, email, type)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [entreprise.id, activiteName, adresse || null, telephone || null, email || null, activiteType]
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
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [id, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const result = await pool.query(
      `SELECT i.id, i.nom, u.nom as unite, COALESCE(c.nom, 'Sans catégorie') as categorie,
              COALESCE(ipc.prix, i.prix) as prix,
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
      prix: r.prix ? parseFloat(r.prix) : null,
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
      await pool.query(
        'INSERT INTO activite_ingredient_selections (activite_id, ingredient_id) VALUES ($1, $2)',
        [id, ingredientId]
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
         BOOL_OR(a.type IS NULL OR a.type = 'distincte') AS has_distinct
       FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE pe.client_id = $1`,
      [req.user.id]
    );
    const row = result.rows[0];
    res.json({
      hasFranchise: row.has_franchise ?? false,
      hasDistinct: row.has_distinct ?? false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getEntreprise, upsertEntreprise,
  listActivites, createActivite, updateActivite, deleteActivite, duplicateActivite,
  hasActivites,
  getActiviteIngredients, toggleActiviteIngredient,
  getActiviteTypesSummary,
};
