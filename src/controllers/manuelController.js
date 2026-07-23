const pool = require('../config/database');
const { buildManuelContexte, manuelSectionVisible } = require('../utils/manuelVisibilite');

const parseId = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const mapSection = (r) => ({
  id: r.id,
  slug: r.slug,
  titre: r.titre,
  icone: r.icone,
  partie: r.partie,
  ordre: r.ordre,
  contenu: r.contenu,
  motsCles: r.mots_cles,
  ecran: r.ecran,
  visibleGerant: r.visible_gerant,
  actif: r.actif,
  updatedAt: r.updated_at,
  ...(r.modifie !== undefined ? { modifie: r.modifie } : {}),
});

// GET /api/manuel — lecture du manuel (client, gérant, super_admin).
// Filtré selon la CONFIG du compte (manuelVisibilite) : les fiches d'espaces
// absents sont masquées, les fiches « vitrines » restent. Le PDF du manuel suit
// automatiquement (généré côté front depuis cette réponse).
const listPublic = async (req, res) => {
  try {
    const gerant = req.user.role === 'gerant';
    const [{ rows }, ctx] = await Promise.all([
      pool.query(
        `SELECT id, slug, titre, icone, partie, ordre, contenu, mots_cles, ecran, visible_gerant, actif, updated_at
           FROM manuel_sections
          WHERE actif = true ${gerant ? 'AND visible_gerant = true' : ''}
          ORDER BY ordre, id`
      ),
      buildManuelContexte(req.user),
    ]);
    res.json(rows.filter((r) => manuelSectionVisible(r.slug, ctx)).map(mapSection));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /admin/manuel — toutes les sections (y compris inactives) + drapeau « modifié »
const adminList = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT *, (contenu_defaut IS NOT NULL AND contenu <> contenu_defaut) AS modifie
         FROM manuel_sections
        ORDER BY ordre, id`
    );
    res.json(rows.map(mapSection));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /admin/manuel
const create = async (req, res) => {
  const { slug, titre, icone, partie, ordre, contenu, motsCles, ecran, visibleGerant, actif } = req.body;
  if (!slug?.trim() || !titre?.trim() || !partie?.trim() || !contenu?.trim()) {
    return res.status(400).json({ message: 'Slug, titre, partie et contenu requis' });
  }
  if (!/^[a-z0-9-]+$/.test(slug.trim())) {
    return res.status(400).json({ message: 'Slug invalide : minuscules, chiffres et tirets uniquement' });
  }
  if (ordre !== undefined && ordre !== null && !Number.isInteger(Number(ordre))) {
    return res.status(400).json({ message: 'Ordre invalide : nombre entier requis' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif)
       VALUES ($1, $2, $3, $4, COALESCE($5, 0), $6, $6, $7, $8, COALESCE($9, true), COALESCE($10, true))
       RETURNING *`,
      [slug.trim(), titre.trim(), icone || null, partie.trim(), ordre, contenu, motsCles || null, ecran || null, visibleGerant, actif]
    );
    res.status(201).json(mapSection(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Une section avec ce slug existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /admin/manuel/:id — mise à jour partielle (seuls les champs fournis sont modifiés)
const update = async (req, res) => {
  const cols = {
    slug: 'slug', titre: 'titre', icone: 'icone', partie: 'partie', ordre: 'ordre',
    contenu: 'contenu', motsCles: 'mots_cles', ecran: 'ecran', visibleGerant: 'visible_gerant', actif: 'actif',
  };
  if (req.body.slug !== undefined && !/^[a-z0-9-]+$/.test(String(req.body.slug).trim())) {
    return res.status(400).json({ message: 'Slug invalide : minuscules, chiffres et tirets uniquement' });
  }
  if (req.body.ordre !== undefined && !Number.isInteger(Number(req.body.ordre))) {
    return res.status(400).json({ message: 'Ordre invalide : nombre entier requis' });
  }
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  const sets = [];
  const vals = [];
  for (const [key, col] of Object.entries(cols)) {
    if (req.body[key] !== undefined) {
      vals.push(req.body[key]);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (sets.length === 0) return res.status(400).json({ message: 'Aucun champ à modifier' });
  vals.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE manuel_sections SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Section introuvable' });
    res.json(mapSection(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Une section avec ce slug existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /admin/manuel/:id/restore — restaure la version d'origine du contenu
const restore = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    const { rows } = await pool.query(
      `UPDATE manuel_sections SET contenu = contenu_defaut, updated_at = NOW()
        WHERE id = $1 AND contenu_defaut IS NOT NULL RETURNING *`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Section introuvable ou sans version d\'origine' });
    res.json(mapSection(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /admin/manuel/:id
const remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    await pool.query('DELETE FROM manuel_sections WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { listPublic, adminList, create, update, restore, remove };
