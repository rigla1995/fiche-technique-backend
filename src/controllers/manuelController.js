const pool = require('../config/database');
const { buildManuelContexte, manuelSectionVisible } = require('../utils/manuelVisibilite');
// Lot 2c (spec docs/lot-2c-spec.md §5) : le manuel dans les mots du domaine du lecteur.
// Le texte en base peut porter des balises [[méthode:clé:args]] (titre, partie, contenu, contenu_defaut ; I7 révisée).
// Seul listPublic les REND (avec req.voc, variante du domaine du lecteur, mots-clés enrichis) ; les routes admin
// (adminList, create, update, restore, variantes) lisent et écrivent le texte BRUT, jamais rendu.
const { vocabDefaut, vocabDuLexique } = require('../utils/vocab');
const { getProfil, resolveLexique } = require('../services/domaineProfilService');
const {
  requeteManuel, slugVariantes, rendreFiche, verifierBalises, refuserBalises, sansBalisesDesLignes, CHAMPS_BALISES,
} = require('../utils/manuelRendu');
const { PRODUIT_DEFAUT, estProduit } = require('../utils/produits');
const MSG_PRODUIT = 'Manuel inconnu : labflow ou compta';
// Une fiche de LabFlow Compta (vocabulaire comptable fixe) ne porte aucune balise ; la contrainte de la migration 201
// le garantit en base, la création le contrôle avant d'écrire.
const CONTRAINTE_COMPTA_SANS_BALISE = 'manuel_sections_compta_sans_balise';
const REFUS_COMPTA_BALISE = { code: 'BALISE_INTERDITE', message: 'Une fiche de LabFlow Compta est en vocabulaire comptable fixe : aucune balise de vocabulaire' };
const violeComptaSansBalise = (err) => err.code === '23514' && err.constraint === CONTRAINTE_COMPTA_SANS_BALISE;

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

// ── Validation des écritures admin (R5.7.1) ───────────────────────────────────────────────────────────────────
// Champs du corps qui peuvent porter des balises (même nom que la colonne) et champs où toute balise est refusée
// (nom dans le corps → colonne, cité dans le message). Seuls les champs PRÉSENTS dans le corps sont contrôlés :
// l'écran envoie { actif } seul pour activer ou désactiver une fiche.
const INTERDITS_MANUEL = { motsCles: 'mots_cles', slug: 'slug', icone: 'icone', ecran: 'ecran' };
const RE_CROCHETS = /\[\[/;
// Longueur comme PostgreSQL la compte (caractères, pas unités UTF-16) : varchar(200) et varchar(60).
const LONGUEUR_MAX = { titre: 200, partie: 60 };
const longueur = (s) => [...String(s)].length;
const tropLong = (champs) => {
  if (champs.titre != null && longueur(champs.titre) > LONGUEUR_MAX.titre) return `Titre trop long (${LONGUEUR_MAX.titre} caractères au plus)`;
  if (champs.partie != null && longueur(champs.partie) > LONGUEUR_MAX.partie) return `Partie trop longue (${LONGUEUR_MAX.partie} caractères au plus)`;
  return null;
};

/**
 * Refus 400 des balises (R5.7.1) : « [[ » dans un champ interdit → BALISE_INTERDITE ; balise invalide ou à clé
 * inconnue dans un champ balisable → BALISE_INVALIDE. `res.locals.vocabBrut` est posé par refuserBalises (le message
 * cite la saisie, il n'est jamais rendu). → true si la réponse est partie.
 */
const refuserSiBalises = (res, corps, balisables, interdits) => {
  const interdites = Object.entries(interdits)
    .filter(([cle]) => typeof corps[cle] === 'string' && RE_CROCHETS.test(corps[cle]))
    .map(([, champ]) => ({ champ, interdite: true }));
  if (interdites.length) { refuserBalises(res, interdites); return true; }
  const erreurs = balisables
    .filter((champ) => corps[champ] !== undefined && corps[champ] !== null)
    .flatMap((champ) => verifierBalises(corps[champ]).map((e) => ({ champ, ...e })));
  if (erreurs.length) { refuserBalises(res, erreurs); return true; }
  return false;
};

// GET /api/manuel — lecture du manuel (client, gérant, super_admin).
// Filtré selon la CONFIG du compte (manuelVisibilite) : les fiches d'espaces
// absents sont masquées, les fiches « vitrines » restent. Le PDF du manuel suit
// automatiquement (généré côté front depuis cette réponse).
// Lot 2c (R5.3.1) : 1. domaine du lecteur (variantes, composants), seulement hors vocabulaire par défaut ;
// 2. requête commune (§5.2) et contexte de visibilité ; 3. filtre ; 4. rendu avec req.voc ; 5. mapSection.
// Vocabulaire par défaut (admin, boss, restauration, café, boulangerie) : aucun profil lu, aucune variante,
// rendu identité — la réponse est celle d'avant le lot, au caractère près (I1).
// LabFlow Compta (SPEC-SOCLE D15, étape S2a) : `?produit=compta` (liste fermée, `labflow` par défaut) sert les
// seules fiches de LabFlow Compta, en vocabulaire comptable fixe : ni domaine, ni variante, ni filtre de
// configuration. Sans paramètre, tout lecteur reçoit les seules fiches de LabFlow, comme avant l'étape.
const listPublic = async (req, res) => {
  // Étape S2b : une personne de rôle « comptable » n'utilise que LabFlow Compta ; elle ne lit que ses fiches.
  const produit = req.user?.role === 'comptable' ? 'compta' : (req.query?.produit ?? PRODUIT_DEFAUT);
  if (!estProduit(produit)) return res.status(400).json({ message: MSG_PRODUIT });
  const compta = produit === 'compta';
  try {
    const voc = compta ? vocabDefaut : (req.voc ?? vocabDefaut);
    let profil = null;
    if (!voc.estDefaut) {
      try { profil = await getProfil(req.user.domaine_id); } catch (_) { profil = null; /* texte commun */ }
    }
    // « visible_gerant » est une notion de LabFlow (Stock / Vente) : un gérant à qui une comptabilité est confiée (S3b)
    // lit toutes les fiches de LabFlow Compta.
    const gerant = req.user.role === 'gerant' && !compta;
    const { text, values } = requeteManuel(slugVariantes(voc, profil), { gerant, produit });
    const [{ rows }, ctx] = await Promise.all([
      pool.query(text, values),
      compta ? null : buildManuelContexte(req.user),
    ]);
    const composants = profil ? profil.composants : undefined;
    res.json(rows.filter((r) => manuelSectionVisible(r.slug, ctx)).map((r) => mapSection(rendreFiche(voc, r, composants))));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /admin/manuel — toutes les sections (y compris inactives) + drapeau « modifié »
// Lot 2c (R5.7.2) : + `sansBalises` (un champ porte une forme par défaut sans aucune balise) ; faux partout tant
// qu'aucune fiche n'a de balise en base (manuel pas encore balisé). Texte BRUT (édition), jamais rendu.
// LabFlow Compta (S2a) : + `produit` ; une fiche `compta` (vocabulaire comptable fixe, jamais balisée) n'est
// jamais « sans balises ».
const adminList = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT *, (contenu_defaut IS NOT NULL AND contenu <> contenu_defaut) AS modifie
         FROM manuel_sections
        ORDER BY ordre, id`
    );
    const sans = sansBalisesDesLignes(rows.map((r) => (r.produit === 'compta' ? {} : r)), 'manuel_sections');
    // Champs propres à l'admin en fin de fiche (lot 2c §10.2) : produit, modifie, sansBalises.
    res.json(rows.map((r, i) => {
      const { modifie, ...fiche } = mapSection(r);
      return { ...fiche, produit: r.produit ?? PRODUIT_DEFAUT, modifie, sansBalises: sans[i].length > 0 };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /admin/manuel — `produit` : `labflow` par défaut, ou `compta` (S2a).
const create = async (req, res) => {
  const { slug, titre, icone, partie, ordre, contenu, motsCles, ecran, visibleGerant, actif } = req.body;
  const produit = req.body.produit ?? PRODUIT_DEFAUT;
  if (!slug?.trim() || !titre?.trim() || !partie?.trim() || !contenu?.trim()) {
    return res.status(400).json({ message: 'Slug, titre, partie et contenu requis' });
  }
  if (!estProduit(produit)) return res.status(400).json({ message: MSG_PRODUIT });
  if (produit === 'compta' && [titre, partie, contenu].some((t) => RE_CROCHETS.test(t))) {
    return res.status(400).json(REFUS_COMPTA_BALISE);
  }
  if (refuserSiBalises(res, req.body, CHAMPS_BALISES.manuel_sections, INTERDITS_MANUEL)) return;
  if (!/^[a-z0-9-]+$/.test(slug.trim())) {
    return res.status(400).json({ message: 'Slug invalide : minuscules, chiffres et tirets uniquement' });
  }
  if (ordre !== undefined && ordre !== null && !Number.isInteger(Number(ordre))) {
    return res.status(400).json({ message: 'Ordre invalide : nombre entier requis' });
  }
  const long = tropLong({ titre: titre.trim(), partie: partie.trim() });
  if (long) return res.status(400).json({ message: long });
  try {
    const { rows } = await pool.query(
      `INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
       VALUES ($1, $2, $3, $4, COALESCE($5, 0), $6, $6, $7, $8, COALESCE($9, true), COALESCE($10, true), $11)
       RETURNING *`,
      [slug.trim(), titre.trim(), icone || null, partie.trim(), ordre, contenu, motsCles || null, ecran || null, visibleGerant, actif, produit]
    );
    res.status(201).json({ ...mapSection(rows[0]), produit: rows[0].produit });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Une section avec ce slug existe déjà' });
    if (violeComptaSansBalise(err)) return res.status(400).json(REFUS_COMPTA_BALISE);
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /admin/manuel/:id — mise à jour partielle (seuls les champs fournis sont modifiés)
const update = async (req, res) => {
  const cols = {
    slug: 'slug', titre: 'titre', icone: 'icone', partie: 'partie', ordre: 'ordre',
    contenu: 'contenu', motsCles: 'mots_cles', ecran: 'ecran', visibleGerant: 'visible_gerant', actif: 'actif',
    produit: 'produit',
  };
  if (req.body.produit !== undefined && !estProduit(req.body.produit)) return res.status(400).json({ message: MSG_PRODUIT });
  if (refuserSiBalises(res, req.body, CHAMPS_BALISES.manuel_sections, INTERDITS_MANUEL)) return;
  if (req.body.slug !== undefined && !/^[a-z0-9-]+$/.test(String(req.body.slug).trim())) {
    return res.status(400).json({ message: 'Slug invalide : minuscules, chiffres et tirets uniquement' });
  }
  if (req.body.ordre !== undefined && !Number.isInteger(Number(req.body.ordre))) {
    return res.status(400).json({ message: 'Ordre invalide : nombre entier requis' });
  }
  const long = tropLong(req.body);
  if (long) return res.status(400).json({ message: long });
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
    res.json({ ...mapSection(rows[0]), produit: rows[0].produit });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Une section avec ce slug existe déjà' });
    if (violeComptaSansBalise(err)) return res.status(400).json(REFUS_COMPTA_BALISE);
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

// ── Variantes par domaine (R5.7.3, table manuel_sections_domaine de la migration 193) ─────────────────────────
// Une variante remplace le contenu (et le titre, s'il est posé) d'une fiche pour les comptes d'un domaine, ciblé
// par son SLUG (sans clé étrangère). Servie seulement si `valide` ET si le lexique du domaine s'écarte du défaut
// (I12 : slugVariantes). Texte BRUT ici (édition) ; `aRevoir` = le texte commun servi a changé depuis la dernière
// relecture (md5 sans \r de manuel_sections.contenu ≠ base_md5).
const SLUG_DOMAINE = /^[a-z0-9-]{1,50}$/;
const SLUG_DEFAUT = 'restauration';
const STATUTS = ['brouillon', 'valide'];
const LECTURE_VARIANTES = `SELECT d.id, d.section_id, s.slug, d.domaine_slug, d.titre, d.contenu, d.mots_cles, d.statut, d.updated_at,
         md5(replace(s.contenu, E'\\r', '')) IS DISTINCT FROM d.base_md5 AS a_revoir,
         da.id AS domaine_id, da.lexique AS domaine_lexique
    FROM manuel_sections_domaine d
    JOIN manuel_sections s ON s.id = d.section_id
    LEFT JOIN domaines_activite da ON da.slug = d.domaine_slug`;

// Le lexique (écarts stockés) d'un domaine s'écarte-t-il du défaut ? Même règle que le vocabulaire de ses comptes
// (vocabDuDomaine → vocabDuLexique du lexique résolu : `estDefaut`).
const avecEcart = (lexique) => !vocabDuLexique(resolveLexique(lexique)).estDefaut;

const mapVariante = (r) => ({
  id: r.id,
  sectionId: r.section_id,
  slug: r.slug,
  domaineSlug: r.domaine_slug,
  domaineExiste: r.domaine_id != null,
  domaineAvecEcart: r.domaine_id != null && avecEcart(r.domaine_lexique),
  titre: r.titre,
  contenu: r.contenu,
  motsCles: r.mots_cles,
  statut: r.statut,
  aRevoir: r.a_revoir === true,
  updatedAt: r.updated_at,
});

const slugDomaineValide = (s) => SLUG_DOMAINE.test(s) && s !== SLUG_DEFAUT;
const MSG_SLUG_DOMAINE = 'Slug de domaine invalide (minuscules, chiffres et tirets, 50 caractères au plus ; jamais « restauration »)';
const MSG_CONTENU_REQUIS = 'Contenu requis';
const texteOuNull = (v) => (v != null && String(v).trim() ? v : null);

// GET /admin/manuel/variantes — toutes les variantes, dans l'ordre du manuel.
const listVariantes = async (req, res) => {
  try {
    const { rows } = await pool.query(`${LECTURE_VARIANTES} ORDER BY s.ordre, s.id, d.domaine_slug`);
    res.json(rows.map(mapVariante));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /admin/manuel/:id/variantes/:domaineSlug { titre?, contenu, motsCles?, statut } — création ou mise à jour.
// Création : contenu requis ; le domaine doit exister (DOMAINE_INCONNU) et avoir un lexique propre
// (VARIANTE_DOMAINE_SANS_ECART, I12). Une variante EXISTANTE reste modifiable même si son domaine manque ou n'a pas
// de lexique (brouillons Céramique en production, §8.6) : elle n'est de toute façon pas servie. Champ absent : valeur
// gardée (statut « brouillon » à la création). Enregistrer vaut relecture : base_md5 reprend le texte commun servi.
const putVariante = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  const domaineSlug = String(req.params.domaineSlug || '');
  if (!slugDomaineValide(domaineSlug)) {
    return res.status(400).json({ message: MSG_SLUG_DOMAINE });
  }
  const b = req.body || {};
  if (refuserSiBalises(res, b, ['titre', 'contenu'], { motsCles: 'mots_cles' })) return;
  if (b.statut !== undefined && !STATUTS.includes(b.statut)) {
    return res.status(400).json({ message: 'Statut invalide : brouillon ou valide' });
  }
  if (b.contenu !== undefined && (typeof b.contenu !== 'string' || !b.contenu.trim())) {
    return res.status(400).json({ message: MSG_CONTENU_REQUIS });
  }
  const long = tropLong({ titre: texteOuNull(b.titre) });
  if (long) return res.status(400).json({ message: long });
  try {
    const [section, domaine, existante] = await Promise.all([
      pool.query('SELECT id, produit FROM manuel_sections WHERE id = $1', [id]),
      pool.query('SELECT id, lexique FROM domaines_activite WHERE slug = $1', [domaineSlug]),
      pool.query('SELECT * FROM manuel_sections_domaine WHERE section_id = $1 AND domaine_slug = $2', [id, domaineSlug]),
    ]);
    if (section.rows.length === 0) return res.status(404).json({ message: 'Section introuvable' });
    // LabFlow Compta (S2a) : vocabulaire comptable fixe, jamais de variante par domaine.
    if (section.rows[0].produit === 'compta') {
      return res.status(400).json({ code: 'VARIANTE_COMPTA', message: 'Une fiche de LabFlow Compta n\'a pas de variante par domaine' });
    }
    const actuelle = existante.rows[0] || null;
    const dom = domaine.rows[0] || null;
    if (!actuelle) {
      if (!dom) {
        return res.status(400).json({ code: 'DOMAINE_INCONNU', message: `Aucun domaine de slug « ${domaineSlug} » : la variante ne peut pas être créée` });
      }
      if (!avecEcart(dom.lexique)) {
        return res.status(400).json({
          code: 'VARIANTE_DOMAINE_SANS_ECART',
          message: `Le domaine « ${domaineSlug} » n'a pas de lexique propre : une variante n'y serait jamais servie`,
        });
      }
      if (b.contenu === undefined) return res.status(400).json({ message: MSG_CONTENU_REQUIS });
    }
    const garder = (cle, colonne = cle) => (b[cle] !== undefined ? texteOuNull(b[cle]) : (actuelle ? actuelle[colonne] : null));
    const valeurs = [
      id, domaineSlug,
      garder('titre'),
      b.contenu !== undefined ? b.contenu : actuelle.contenu,
      garder('motsCles', 'mots_cles'),
      b.statut !== undefined ? b.statut : (actuelle ? actuelle.statut : STATUTS[0]),
    ];
    const { rows } = await pool.query(
      `INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
       SELECT s.id, $2, $3, $4, $5, $6, md5(replace(s.contenu, E'\\r', ''))
         FROM manuel_sections s WHERE s.id = $1
       ON CONFLICT (section_id, domaine_slug) DO UPDATE SET
         titre = EXCLUDED.titre, contenu = EXCLUDED.contenu, mots_cles = EXCLUDED.mots_cles,
         statut = EXCLUDED.statut, base_md5 = EXCLUDED.base_md5, updated_at = NOW()
       RETURNING id`,
      valeurs
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Section introuvable' });
    const lue = await pool.query(`${LECTURE_VARIANTES} WHERE d.id = $1`, [rows[0].id]);
    res.status(actuelle ? 200 : 201).json(mapVariante(lue.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /admin/manuel/:id/variantes/:domaineSlug
const removeVariante = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  const domaineSlug = String(req.params.domaineSlug || '');
  if (!slugDomaineValide(domaineSlug)) {
    return res.status(400).json({ message: MSG_SLUG_DOMAINE });
  }
  try {
    const r = await pool.query('DELETE FROM manuel_sections_domaine WHERE section_id = $1 AND domaine_slug = $2', [id, domaineSlug]);
    if (!r.rowCount) return res.status(404).json({ message: 'Variante introuvable' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { listPublic, adminList, create, update, restore, remove, listVariantes, putVariante, removeVariante };
