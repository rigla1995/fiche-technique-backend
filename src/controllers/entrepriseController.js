const pool = require('../config/database');

// ─── Company Profile ───────────────────────────────────────────────────────

const getEntreprise = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const result = await pool.query(
      'SELECT * FROM profil_entreprise WHERE client_id = $1',
      [clientId]
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
  module_vente_actif: row.module_vente_actif ?? false,
  module_vente_activated_at: row.module_vente_activated_at ?? null,
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
  laboId: row.labo_id || null,
  laboNom: row.labo_nom || null,
  laboTel: row.labo_tel || null,
  laboAdresse: row.labo_adresse || null,
  ingredientCount: parseInt(row.ingredient_count) || 0,
  createdAt: row.created_at,
});

const listActivites = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const entreprise = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [clientId]
    );
    if (entreprise.rows.length === 0) return res.json([]);
    const result = await pool.query(
      `SELECT a.*, l.nom AS labo_nom, l.referent_tel AS labo_tel, l.adresse AS labo_adresse,
              CASE WHEN a.labo_id IS NOT NULL THEN COALESCE(lis.cnt, 0)
                   ELSE COALESCE(ais.cnt, 0) END AS ingredient_count
       FROM activites a
       LEFT JOIN labos l ON l.id = a.labo_id
       LEFT JOIN (SELECT activite_id, COUNT(*) AS cnt FROM activite_ingredient_selections GROUP BY activite_id) ais
              ON ais.activite_id = a.id
       LEFT JOIN (SELECT labo_id, COUNT(*) AS cnt FROM labo_ingredient_selections GROUP BY labo_id) lis
              ON lis.labo_id = a.labo_id
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
  const { nom, adresse, telephone, email, laboId } = req.body;
  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const entrepriseRes = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [clientId]
    );
    if (entrepriseRes.rows.length === 0)
      return res.status(400).json({ message: 'Créez d\'abord votre profil entreprise' });

    const entreprise = entrepriseRes.rows[0];

    const nameCheck = await pool.query(
      'SELECT id FROM activites WHERE entreprise_id = $1 AND LOWER(nom) = LOWER($2)',
      [entreprise.id, nom.trim()]
    );
    if (nameCheck.rows.length > 0)
      return res.status(409).json({ message: 'Une activité avec ce nom existe déjà' });

    const result = await pool.query(
      `INSERT INTO activites (entreprise_id, nom, adresse, telephone, email, labo_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [entreprise.id, nom, adresse || null, telephone || null, email || null, laboId || null]
    );
    const newActivite = result.rows[0];

    // If laboId provided, link labo fournisseur to the new activity
    if (laboId) {
      const laboFRes = await pool.query(
        'SELECT id FROM fournisseurs WHERE labo_id = $1 AND is_labo = true LIMIT 1',
        [laboId]
      );
      if (laboFRes.rows.length > 0) {
        await pool.query(
          `INSERT INTO fournisseur_activites (fournisseur_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [laboFRes.rows[0].id, newActivite.id]
        );
      }
    }

    res.status(201).json(mapActivite(newActivite));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateActivite = async (req, res) => {
  const { id } = req.params;
  const { nom, adresse, telephone, email, laboId } = req.body;
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const entreprise = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [clientId]
    );
    if (entreprise.rows.length === 0) return res.status(404).json({ message: 'Entreprise introuvable' });
    const entrepriseId = entreprise.rows[0].id;

    if (nom) {
      const nameCheck = await pool.query(
        'SELECT id FROM activites WHERE entreprise_id = $1 AND LOWER(nom) = LOWER($2) AND id != $3',
        [entrepriseId, nom.trim(), id]
      );
      if (nameCheck.rows.length > 0)
        return res.status(409).json({ message: 'Une activité avec ce nom existe déjà' });
    }

    // Validate laboId belongs to this entreprise if provided
    if (laboId) {
      const laboCheck = await pool.query(
        'SELECT id FROM labos WHERE id = $1 AND entreprise_id = $2',
        [laboId, entrepriseId]
      );
      if (laboCheck.rows.length === 0) return res.status(400).json({ message: 'Labo introuvable' });
    }

    // Build query depending on whether laboId was passed
    let result;
    if (typeof laboId !== 'undefined') {
      result = await pool.query(
        `UPDATE activites
         SET nom = COALESCE($1, nom),
             adresse = $2,
             telephone = $3,
             email = $4,
             labo_id = $5,
             updated_at = NOW()
         WHERE id = $6 AND entreprise_id = $7 RETURNING *`,
        [nom, adresse || null, telephone || null, email || null, laboId || null, id, entrepriseId]
      );
    } else {
      result = await pool.query(
        `UPDATE activites
         SET nom = COALESCE($1, nom),
             adresse = $2,
             telephone = $3,
             email = $4,
             updated_at = NOW()
         WHERE id = $5 AND entreprise_id = $6 RETURNING *`,
        [nom, adresse || null, telephone || null, email || null, id, entrepriseId]
      );
    }
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
    const clientId = req.user.gerant_parent_id || req.user.id;
    const entreprise = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [clientId]
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
    const clientId = req.user.gerant_parent_id || req.user.id;
    const entreprise = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [clientId]
    );
    if (entreprise.rows.length === 0) return res.status(404).json({ message: 'Entreprise introuvable' });

    const source = await pool.query(
      'SELECT * FROM activites WHERE id = $1 AND entreprise_id = $2',
      [id, entreprise.rows[0].id]
    );
    if (source.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const src = source.rows[0];
    const result = await pool.query(
      `INSERT INTO activites (entreprise_id, nom, adresse, telephone, email)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [src.entreprise_id, src.nom, src.adresse, src.telephone, src.email]
    );
    res.status(201).json(mapActivite(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const hasActivites = async (req, res) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const entreprise = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1',
      [clientId]
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
      [id, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const result = await pool.query(
          `SELECT a.id, a.nom, u.nom as unite, COALESCE(c.nom, 'Sans catégorie') as categorie,
                  a.categorie_id,
                  f.id as famille_id, f.nom as famille_nom,
                  ais.prix_unitaire,
                  CASE WHEN ais.ingredient_id IS NOT NULL THEN true ELSE false END as selected
           FROM articles a
           JOIN unites u ON a.unite_id = u.id
           LEFT JOIN categories c ON a.categorie_id = c.id
           LEFT JOIN familles f ON c.famille_id = f.id
           LEFT JOIN activite_ingredient_selections ais ON ais.ingredient_id = a.id AND ais.activite_id = $1
           WHERE a.client_id = $2
             AND (f.id IS NULL OR f.consommable = true)
           ORDER BY f.nom NULLS LAST, c.nom NULLS LAST, a.nom`,
          [id, req.user.gerant_parent_id || req.user.id]
        );

    res.json(result.rows.map((r) => ({
      id: r.id,
      nom: r.nom,
      unite: r.unite,
      categorie: r.categorie,
      categorieId: r.categorie_id ?? null,
      familleId: r.famille_id ?? null,
      familleNom: r.famille_nom ?? null,
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
      [id, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const existing = await pool.query(
      'SELECT 1 FROM activite_ingredient_selections WHERE activite_id = $1 AND ingredient_id = $2',
      [id, ingredientId]
    );
    if (existing.rows.length > 0) {
      const histRes = await pool.query(
        'SELECT COUNT(*) FROM stock_entreprise_daily WHERE activite_id = $1 AND ingredient_id = $2',
        [id, ingredientId]
      );
      const historyCount = parseInt(histRes.rows[0].count);
      await pool.query(
        'DELETE FROM activite_ingredient_selections WHERE activite_id = $1 AND ingredient_id = $2',
        [id, ingredientId]
      );
      res.json({ selected: false, hadHistory: historyCount > 0, historyCount });
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
    const clientId = req.user.gerant_parent_id || req.user.id;
    const [actResult, approResult, fourn, laboIngResult, artResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(a.id) > 0 AS has_activites,
           BOOL_OR(sel.cnt > 0) AS has_selections,
           BOOL_OR(
             a.labo_id IS NULL
             OR EXISTS (SELECT 1 FROM labo_ingredient_selections lis2 WHERE lis2.labo_id = a.labo_id LIMIT 1)
           ) AS has_ready
         FROM activites a
         JOIN profil_entreprise pe ON a.entreprise_id = pe.id
         LEFT JOIN (
           SELECT activite_id, COUNT(*) AS cnt
           FROM activite_ingredient_selections
           GROUP BY activite_id
         ) sel ON sel.activite_id = a.id
         WHERE pe.client_id = $1`,
        [clientId]
      ),
      pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM stock_entreprise_daily sed
           JOIN activites a ON sed.activite_id = a.id
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE pe.client_id = $1
         ) AS has_appro`,
        [clientId]
      ),
      pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM fournisseur_activites fa
           JOIN activites a ON fa.activite_id = a.id
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE pe.client_id = $1
         ) AS has_fournisseurs`,
        [clientId]
      ),
      pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM labo_ingredient_selections lis
           JOIN labos l ON l.id = lis.labo_id
           JOIN profil_entreprise pe ON l.entreprise_id = pe.id
           WHERE pe.client_id = $1
         ) AS has_labo_ingredients`,
        [clientId]
      ),
      pool.query(
        `SELECT EXISTS (SELECT 1 FROM articles WHERE client_id = $1) AS has_articles`,
        [clientId]
      ),
    ]);
    const row = actResult.rows[0];
    const appro = approResult.rows[0];
    const fo = fourn.rows[0];
    const laboIng = laboIngResult.rows[0];
    const art = artResult.rows[0];
    res.json({
      hasActivites: row.has_activites ?? false,
      hasSelections: row.has_selections ?? false,
      hasReady: row.has_ready ?? false,
      hasAppro: appro.has_appro ?? false,
      hasFournisseurs: fo.has_fournisseurs ?? false,
      hasLaboIngredients: laboIng.has_labo_ingredients ?? false,
      hasArticles: art.has_articles ?? false,
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
      [id, req.user.gerant_parent_id || req.user.id]
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


// Returns only SELECTED ingredients for one activité — gérant-compatible
const getActiviteSelectedIngredients = async (req, res) => {
  const { id } = req.params;
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const check = await pool.query(
      `SELECT a.id, a.labo_id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [id, clientId]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const result = await pool.query(
      `SELECT a.id, a.nom, u.nom as unite, COALESCE(c.nom, 'Sans catégorie') as categorie,
              a.categorie_id as "categorieId"
       FROM activite_ingredient_selections ais
       JOIN articles a ON a.id = ais.ingredient_id
       JOIN unites u ON a.unite_id = u.id
       LEFT JOIN categories c ON a.categorie_id = c.id
       WHERE ais.activite_id = $1
       ORDER BY c.nom NULLS LAST, a.nom`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Returns all SELECTED ingredients across all activités
const getTypeSelectedIngredients = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const result = await pool.query(
      `SELECT DISTINCT art.id, art.nom, u.nom as unite, COALESCE(c.nom, 'Sans catégorie') as categorie,
              art.categorie_id as "categorieId"
       FROM activite_ingredient_selections ais
       JOIN activites act ON act.id = ais.activite_id
       JOIN profil_entreprise pe ON pe.id = act.entreprise_id
       JOIN articles art ON art.id = ais.ingredient_id
       JOIN unites u ON art.unite_id = u.id
       LEFT JOIN categories c ON art.categorie_id = c.id
       WHERE pe.client_id = $1
       ORDER BY categorie NULLS LAST, art.nom`,
      [clientId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getCatalogueGlobalIngredients = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const entRes = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [clientId]);
    if (entRes.rows.length === 0) return res.status(404).json({ message: 'Entreprise introuvable' });
    const entrepriseId = entRes.rows[0].id;

    const [ings, acts, labs, actSels, laboSels] = await Promise.all([
      pool.query(
        `SELECT a.id, a.nom, u.nom as unite, COALESCE(c.nom, 'Sans catégorie') as categorie
         FROM articles a
         JOIN unites u ON u.id = a.unite_id
         LEFT JOIN categories c ON c.id = a.categorie_id
         WHERE a.client_id = $1
         ORDER BY COALESCE(c.nom, 'Sans catégorie'), a.nom`,
        [clientId]
      ),
      pool.query('SELECT id, nom FROM activites WHERE entreprise_id = $1 ORDER BY nom', [entrepriseId]),
      pool.query('SELECT id, nom FROM labos WHERE entreprise_id = $1 ORDER BY nom', [entrepriseId]),
      pool.query(
        `SELECT ais.activite_id, ais.ingredient_id
         FROM activite_ingredient_selections ais
         JOIN activites a ON a.id = ais.activite_id
         WHERE a.entreprise_id = $1`,
        [entrepriseId]
      ),
      pool.query(
        `SELECT lis.labo_id, lis.ingredient_id
         FROM labo_ingredient_selections lis
         JOIN labos l ON l.id = lis.labo_id
         WHERE l.entreprise_id = $1`,
        [entrepriseId]
      ),
    ]);

    const actSelSet = new Set(actSels.rows.map((r) => `${r.activite_id}:${r.ingredient_id}`));
    const laboSelSet = new Set(laboSels.rows.map((r) => `${r.labo_id}:${r.ingredient_id}`));

    const result = ings.rows.map((ing) => ({
      id: ing.id,
      nom: ing.nom,
      unite: ing.unite,
      categorie: ing.categorie,
      contexts: [
        ...acts.rows.map((a) => ({ type: 'activite', id: a.id, nom: a.nom, assigned: actSelSet.has(`${a.id}:${ing.id}`) })),
        ...labs.rows.map((l) => ({ type: 'labo', id: l.id, nom: l.nom, assigned: laboSelSet.has(`${l.id}:${ing.id}`) })),
      ],
    }));

    res.json(result);
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
  getActiviteSelectedIngredients, getTypeSelectedIngredients,
  getCatalogueGlobalIngredients,
};
