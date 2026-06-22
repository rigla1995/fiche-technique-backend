const pool = require('../config/database');

const mapKb = (r) => ({
  id: r.id,
  titre: r.titre,
  contenu: r.contenu,
  motsCles: r.mots_cles,
  categorie: r.categorie,
  actif: r.actif,
  updatedAt: r.updated_at,
});

// GET /admin/knowledge-base
const list = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ai_knowledge_base ORDER BY categorie NULLS LAST, titre'
    );
    res.json(rows.map(mapKb));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /admin/knowledge-base
const create = async (req, res) => {
  const { titre, contenu, motsCles, categorie, actif } = req.body;
  if (!titre?.trim() || !contenu?.trim()) {
    return res.status(400).json({ message: 'Titre et contenu requis' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO ai_knowledge_base (titre, contenu, mots_cles, categorie, actif)
       VALUES ($1, $2, $3, $4, COALESCE($5, true)) RETURNING *`,
      [titre.trim(), contenu.trim(), motsCles || null, categorie || null, actif]
    );
    res.status(201).json(mapKb(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Un article avec ce titre existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /admin/knowledge-base/:id
const update = async (req, res) => {
  const { titre, contenu, motsCles, categorie, actif } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE ai_knowledge_base
          SET titre = COALESCE($1, titre),
              contenu = COALESCE($2, contenu),
              mots_cles = $3,
              categorie = $4,
              actif = COALESCE($5, actif),
              updated_at = NOW()
        WHERE id = $6 RETURNING *`,
      [titre || null, contenu || null, motsCles ?? null, categorie ?? null, actif, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Article introuvable' });
    res.json(mapKb(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Un article avec ce titre existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /admin/knowledge-base/:id
const remove = async (req, res) => {
  try {
    await pool.query('DELETE FROM ai_knowledge_base WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, create, update, remove };
