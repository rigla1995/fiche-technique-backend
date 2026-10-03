const pool = require('../config/database');
// Lot 2c (spec docs/lot-2c-spec.md §5.7) : le titre et le contenu d'une entrée peuvent porter des balises
// [[méthode:clé:args]] (I7 révisée), rendues seulement par la recherche de l'assistant (aiToolHandlers). Ces routes
// admin lisent et écrivent le texte BRUT ; seul le contrôle des titres en double le rend, par défaut (R4.3.2).
const { vocabDefaut, rendre } = require('../utils/vocab');
const { verifierBalises, refuserBalises, sansBalisesDesLignes, CHAMPS_BALISES } = require('../utils/manuelRendu');

const mapKb = (r) => ({
  id: r.id,
  titre: r.titre,
  contenu: r.contenu,
  motsCles: r.mots_cles,
  categorie: r.categorie,
  actif: r.actif,
  updatedAt: r.updated_at,
});

// ── Validation des écritures (R5.7.1) ─────────────────────────────────────────────────────────────────────────
// Balises admises dans titre et contenu (contrôlées seulement s'ils sont présents : l'écran envoie { actif } seul
// pour activer ou désactiver) ; toute balise refusée dans les mots-clés et la catégorie.
const INTERDITS_BASE = { motsCles: 'mots_cles', categorie: 'categorie' };
const RE_CROCHETS = /\[\[/;
const TITRE_MAX = 200; // varchar(200), compté en caractères comme PostgreSQL
const titreTropLong = (titre) => titre != null && [...String(titre)].length > TITRE_MAX;
const MSG_DOUBLON = 'Un article avec ce titre existe déjà';
const MSG_TITRE_LONG = `Titre trop long (${TITRE_MAX} caractères au plus)`;

// → true si la réponse 400 est partie (vocabBrut posé par refuserBalises).
const refuserSiBalises = (res, corps) => {
  const interdites = Object.entries(INTERDITS_BASE)
    .filter(([cle]) => typeof corps[cle] === 'string' && RE_CROCHETS.test(corps[cle]))
    .map(([, champ]) => ({ champ, interdite: true }));
  if (interdites.length) { refuserBalises(res, interdites); return true; }
  const erreurs = CHAMPS_BALISES.ai_knowledge_base
    .filter((champ) => corps[champ] !== undefined && corps[champ] !== null)
    .flatMap((champ) => verifierBalises(corps[champ]).map((e) => ({ champ, ...e })));
  if (erreurs.length) { refuserBalises(res, erreurs); return true; }
  return false;
};

// Deux titres de même rendu par défaut (sans tenir compte de la casse) : après le balisage, l'index unique sur
// lower(titre) BRUT ne voit plus « Transferts » contre sa forme balisée (R4.3.2). saufId : l'entrée modifiée.
const titreRenduPris = async (titre, saufId = null) => {
  const cle = String(rendre(vocabDefaut, titre)).toLowerCase();
  const { rows } = await pool.query('SELECT id, titre FROM ai_knowledge_base');
  return rows.some((r) => String(r.id) !== String(saufId) && String(rendre(vocabDefaut, r.titre)).toLowerCase() === cle);
};

// GET /admin/knowledge-base
// Lot 2c (R5.7.2) : + `sansBalises` (titre ou contenu avec une forme par défaut et sans balise) ; faux partout
// tant qu'aucune entrée n'a de balise en base.
const list = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM ai_knowledge_base ORDER BY categorie NULLS LAST, titre'
    );
    const sans = sansBalisesDesLignes(rows, 'ai_knowledge_base');
    res.json(rows.map((r, i) => ({ ...mapKb(r), sansBalises: sans[i].length > 0 })));
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
  if (refuserSiBalises(res, req.body)) return;
  if (titreTropLong(titre.trim())) return res.status(400).json({ message: MSG_TITRE_LONG });
  try {
    if (await titreRenduPris(titre.trim())) return res.status(409).json({ message: MSG_DOUBLON });
    const { rows } = await pool.query(
      `INSERT INTO ai_knowledge_base (titre, contenu, mots_cles, categorie, actif)
       VALUES ($1, $2, $3, $4, COALESCE($5, true)) RETURNING *`,
      [titre.trim(), contenu.trim(), motsCles || null, categorie || null, actif]
    );
    res.status(201).json(mapKb(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: MSG_DOUBLON });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /admin/knowledge-base/:id
// Lot 2c (question 6 du §14, R5.7.1) : mots_cles et categorie ne sont écrits que s'ils sont PRÉSENTS dans le corps
// (l'écran envoie { actif } seul pour activer ou désactiver : ils étaient effacés).
const update = async (req, res) => {
  const { titre, contenu, motsCles, categorie, actif } = req.body;
  if (refuserSiBalises(res, req.body)) return;
  if (titre && titreTropLong(titre)) return res.status(400).json({ message: MSG_TITRE_LONG });
  try {
    if (titre && await titreRenduPris(titre, req.params.id)) return res.status(409).json({ message: MSG_DOUBLON });
    const { rows } = await pool.query(
      `UPDATE ai_knowledge_base
          SET titre = COALESCE($1, titre),
              contenu = COALESCE($2, contenu),
              mots_cles = CASE WHEN $7::boolean THEN $3 ELSE mots_cles END,
              categorie = CASE WHEN $8::boolean THEN $4 ELSE categorie END,
              actif = COALESCE($5, actif),
              updated_at = NOW()
        WHERE id = $6 RETURNING *`,
      [titre || null, contenu || null, motsCles ?? null, categorie ?? null, actif, req.params.id,
        motsCles !== undefined, categorie !== undefined]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Article introuvable' });
    res.json(mapKb(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: MSG_DOUBLON });
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
