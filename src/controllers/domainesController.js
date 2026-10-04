// Domaines d'activité = PROFILS administrables (lot 1a) : composants (menu de
// configuration), lexique, règles, grille tarifaire (surcharges tarifs_domaine).
//   GET    /api/domaines        admin/boss → tous (profil résolu + nbClients) ; client/gérant → le sien ;
//                               acheteur → celui de son client VENDEUR, réduit à { id, slug, nom, lexique }
//                               (non admin : lexique allégé, null pour le vocabulaire par défaut — lot 2b §5.7)
//   GET    /api/domaines/:id    profil résolu + composants (tous) + tarifs (= GET tarifs?domaineId)
//   POST   /api/domaines        { nom, slug?, description? } → domaine + 4 composants identité
//   PUT    /api/domaines/:id    { nom?, slug?, description?, lexique?, regles?, composants? }
//                               composants[] : genre ('m' | 'f') et elision (true | false | null | 'auto'),
//                               facultatifs : absents = valeurs stockées gardées (lot 2b §5.4)
//   DELETE /api/domaines/:id    409 DOMAINE_UTILISE si référencé
// Lexique (lot 2) : les réponses portent `lexique` = lexique RÉSOLU v2 (défaut + écarts, clés
// dérivées comprises). Pour l'admin s'y ajoute `lexiqueEcarts` = les écarts STOCKÉS tels quels
// (ce que l'onglet Lexique édite et renvoie au PUT). Le PUT valide les écarts (spec §1.4) :
// 400 + code LEXIQUE_* (src/utils/lexiqueValidation.js).
// Le domaine par défaut (« restauration ») est la RÉFÉRENCE de l'invariant I1 : son lexique est le
// lexique par défaut en code, il ne reçoit aucun écart (400 LEXIQUE_DOMAINE_DEFAUT). Un compte sans
// domaine reçoit ce profil par /auth/me alors que req.voc prend le défaut en code, sans requête :
// les deux ne coïncident que si ce lexique reste vide.
const { isDeepStrictEqual } = require('node:util');
const pool = require('../config/database');
const profilService = require('../services/domaineProfilService');
const { buildTarifsPourDomaine } = require('./abonnementController');
const { validerLexique, nettoyerLexique } = require('../utils/lexiqueValidation');

const {
  TYPES_TECHNIQUES, COMPOSANTS_IDENTITE, REGLES_CLES, TYPE_PERTE_RE, normaliserTypesPerte,
  resolveProfil, invalidate, getProfilForClient,
} = profilService;

const isSuperAdmin = (u) => u?.role === 'super_admin' || u?.role === 'boss';
const parseId = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };
// Domaine par défaut (getDomaineDefautId) : slug protégé (ni renommé ni supprimé)
const SLUG_DEFAUT = 'restauration';

// Slug depuis un nom : minuscules, accents translittérés, [^a-z0-9]+ → '-', trim.
const slugify = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .slice(0, 45);

const mapDomaine = (profil, extra = {}) => ({
  id: profil.id,
  slug: profil.slug,
  nom: profil.nom,
  description: profil.description,
  ...extra,
  composants: profil.composants,
  lexique: profil.lexique,
  regles: profil.regles,
});

// Écarts de lexique STOCKÉS d'une ligne domaines_activite (JSONB ; texte toléré).
const ecartsLexique = (row) => {
  let v = row?.lexique;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (_) { v = null; } }
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
};

// Tous les domaines + composants + nbClients (COUNT DISTINCT clients via abonnement_config.domaine_id)
const loadAll = async () => {
  const [doms, comps, counts] = await Promise.all([
    pool.query('SELECT * FROM domaines_activite ORDER BY nom'),
    pool.query('SELECT * FROM domaine_composants ORDER BY domaine_id, ordre, id'),
    pool.query(
      `SELECT ac.domaine_id, COUNT(DISTINCT a.client_id)::int AS n
         FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id
        WHERE ac.domaine_id IS NOT NULL GROUP BY ac.domaine_id`
    ),
  ]);
  const compsBy = new Map();
  for (const c of comps.rows) {
    if (!compsBy.has(c.domaine_id)) compsBy.set(c.domaine_id, []);
    compsBy.get(c.domaine_id).push(c);
  }
  const nbBy = new Map(counts.rows.map((r) => [r.domaine_id, r.n]));
  return doms.rows.map((d) => mapDomaine(resolveProfil(d, compsBy.get(d.id) || []), { nbClients: nbBy.get(d.id) || 0, lexiqueEcarts: ecartsLexique(d) }));
};

const list = async (req, res) => {
  try {
    if (isSuperAdmin(req.user)) return res.json(await loadAll());
    // Client, gérant, acheteur : lexique allégé (lot 2b §5.7), le même que /auth/me ; chaque branche garde
    // sa forme. Import tardif : authController charge l'email et le chiffrement des mots de passe.
    const { lexiquePourCompte } = require('./authController');
    // Acheteur : ce n'est pas un compte. Il lit les MOTS de son client vendeur, comme dans /auth/me
    // (spec §2.4) — jamais ses composants ni ses règles (configuration commerciale du vendeur), et
    // jamais le repli « restauration » qu'aurait donné son propre identifiant, sans abonnement.
    if (req.user.role === 'acheteur') {
      if (!req.user.acheteurClientId) return res.json([]);
      const p = await getProfilForClient(req.user.acheteurClientId);
      return res.json(p && p.id != null ? [{ id: p.id, slug: p.slug, nom: p.nom, lexique: lexiquePourCompte(p) }] : []);
    }
    // Client / gérant : le domaine de leur compte (profil résolu, forme mapDomaine avec description ;
    // seul le lexique change, à sa place dans l'objet)
    const profil = await getProfilForClient(req.user.id);
    res.json(profil && profil.id != null ? [{ ...mapDomaine(profil), lexique: lexiquePourCompte(profil) }] : []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getOne = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    const rows = await profilService.loadDomaineRows(id);
    if (!rows) return res.status(404).json({ message: 'Domaine introuvable' });
    const profil = resolveProfil(rows.row, rows.composants);
    const [nb, tarifs] = await Promise.all([
      pool.query(
        `SELECT COUNT(DISTINCT a.client_id)::int AS n
           FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id
          WHERE ac.domaine_id = $1`,
        [id]
      ),
      buildTarifsPourDomaine(id),
    ]);
    res.json(mapDomaine(profil, { nbClients: nb.rows[0]?.n || 0, tarifs, lexiqueEcarts: ecartsLexique(rows.row) }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Validations ──────────────────────────────────────────────────────────────
const CODE_RE = /^[a-z0-9_]{2,30}$/;

const validateComposant = (c, i) => {
  if (!c || typeof c !== 'object') return `composants[${i}] : objet attendu`;
  const code = typeof c.code === 'string' ? c.code.trim() : '';
  if (!CODE_RE.test(code)) return `composants[${i}] : code invalide (a-z, 0-9, _ ; 2 à 30 caractères)`;
  if (!c.libelle || !String(c.libelle).trim()) return `composants[${i}] (${code}) : libellé requis`;
  if (String(c.libelle).trim().length > 80) return `composants[${i}] (${code}) : libellé trop long (80 max)`;
  if (c.libellePluriel != null && String(c.libellePluriel).length > 80) return `composants[${i}] (${code}) : pluriel trop long (80 max)`;
  // Lot 2b §5.4 : `[`, `]` et `|` sont réservés aux balises du vocabulaire ; un libellé de composant est
  // interpolé dans des textes rendus (guide de mise en route).
  if (/[[\]|]/.test(String(c.libelle)) || (c.libellePluriel != null && /[[\]|]/.test(String(c.libellePluriel)))) {
    return `composants[${i}] (${code}) : caractères [ ] | interdits dans le libellé et le pluriel`;
  }
  if (c.icone != null && String(c.icone).length > 8) return `composants[${i}] (${code}) : icône trop longue (8 max)`;
  // Genre : 'm' ou 'f' ; absent ou null = inchangé (défaut 'm' à la création).
  if (c.genre != null && c.genre !== 'm' && c.genre !== 'f') return `composants[${i}] (${code}) : genre invalide (m ou f)`;
  // Élision : true, false, null ou 'auto' (null et 'auto' = déduite du libellé) ; absente = inchangée.
  if ('elision' in c && ![true, false, null, 'auto'].includes(c.elision)) return `composants[${i}] (${code}) : élision invalide (true, false, null ou auto)`;
  if (!TYPES_TECHNIQUES.includes(c.typeTechnique)) return `composants[${i}] (${code}) : type technique invalide (${TYPES_TECHNIQUES.join(', ')})`;
  const min = c.nbMin == null ? 0 : parseInt(c.nbMin, 10);
  if (!Number.isFinite(min) || min < 0) return `composants[${i}] (${code}) : minimum invalide`;
  if (c.nbMax != null && c.nbMax !== '') {
    const max = parseInt(c.nbMax, 10);
    if (!Number.isFinite(max) || max < min) return `composants[${i}] (${code}) : maximum invalide (≥ minimum)`;
  }
  if (c.ordre != null && !Number.isFinite(parseInt(c.ordre, 10))) return `composants[${i}] (${code}) : ordre invalide`;
  return null;
};

// Lexique : validation §1.4 et nettoyage dans src/utils/lexiqueValidation.js (module pur, testé
// par test/vocab.test.js).

const validateRegles = (regles) => {
  if (regles == null) return null;
  if (typeof regles !== 'object' || Array.isArray(regles)) return 'regles : objet attendu';
  for (const [k, v] of Object.entries(regles)) {
    if (!REGLES_CLES.includes(k)) return `regles : clé inconnue « ${k} » (${REGLES_CLES.join(', ')})`;
    if (v == null) continue;
    if (['acheteurs_requiert_labo', 'depot_exige_acheteurs', 'espace_produit_verrou_basique_sans_labo', 'b2b_depuis_activite'].includes(k) && typeof v !== 'boolean') return `regles.${k} : booléen attendu`;
    if (['seuil_cout_matiere_pct', 'supplement_max_composants'].includes(k) && !(Number.isFinite(Number(v)) && Number(v) >= 0)) return `regles.${k} : nombre ≥ 0 attendu`;
    if (k === 'formules' && !(Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim()))) return `regles.${k} : liste de textes attendue`;
    if (k === 'formules' && !v.every((x) => ['basique', 'premium'].includes(x))) return 'regles.formules : valeurs autorisées basique, premium';
    // Lot 1b §5 — types de perte : codes ^[a-z0-9_]{2,20}$ (colonne VARCHAR(20)), liste non vide
    // après normalisation (minuscules, dédoublonnage). Tableau ou texte « avarie, dechet ».
    if (k === 'types_perte') {
      if (!(Array.isArray(v) || typeof v === 'string')) return 'regles.types_perte : liste de codes attendue';
      const codes = normaliserTypesPerte(v);
      if (!codes.length) return 'regles.types_perte : au moins un type de perte';
      const bad = codes.find((c) => !TYPE_PERTE_RE.test(c));
      if (bad) return `regles.types_perte : code invalide « ${bad} » (minuscules, chiffres, _ ; 2 à 20 caractères)`;
    }
    // Lot 1b §5 — seeds à la création du compte : listes de noms (unités de mesure ≤ 50, canaux ≤ 100).
    if (k === 'unites_seed' || k === 'prestataires_seed') {
      if (!Array.isArray(v)) return `regles.${k} : liste de textes attendue`;
      const max = k === 'unites_seed' ? 50 : 100;
      const bad = v.find((x) => typeof x !== 'string' || !x.trim() || x.trim().length > max);
      if (bad !== undefined) return `regles.${k} : chaque nom doit être un texte de 1 à ${max} caractères`;
    }
  }
  return null;
};

const nettoyerRegles = (regles) => {
  const out = {};
  for (const [k, v] of Object.entries(regles || {})) {
    if (v == null) continue;
    if (k === 'types_perte') out[k] = normaliserTypesPerte(v);                 // minuscules, dédoublonnés
    else if (k === 'unites_seed' || k === 'prestataires_seed') {
      const seen = new Set();
      out[k] = v.map((x) => String(x).trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
    } else out[k] = v;
  }
  return out;
};

// ── Écritures ────────────────────────────────────────────────────────────────

const create = async (req, res) => {
  const nom = typeof req.body.nom === 'string' ? req.body.nom.trim() : '';
  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  if (nom.length > 100) return res.status(400).json({ message: 'Nom trop long (100 max)' });
  const slug = slugify(req.body.slug && String(req.body.slug).trim() ? req.body.slug : nom);
  if (!slug) return res.status(400).json({ message: 'Slug invalide' });
  const description = req.body.description != null ? String(req.body.description).trim() || null : null;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const ins = await db.query(
      'INSERT INTO domaines_activite (nom, slug, description) VALUES ($1, $2, $3) RETURNING *',
      [nom, slug, description]
    );
    const dom = ins.rows[0];
    // 4 composants identité, genre compris (lot 2b §5.4) ; élision NULL = déduite du libellé.
    for (const type of TYPES_TECHNIQUES) {
      const c = COMPOSANTS_IDENTITE[type];
      await db.query(
        `INSERT INTO domaine_composants (domaine_id, code, libelle, libelle_pluriel, icone, type_technique, ordre, genre)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [dom.id, c.code, c.libelle, c.libellePluriel, c.icone, type, c.ordre, c.genre]
      );
    }
    await db.query('COMMIT');
    const rows = await profilService.loadDomaineRows(dom.id);
    res.status(201).json(mapDomaine(resolveProfil(rows.row, rows.composants), { nbClients: 0, lexiqueEcarts: ecartsLexique(rows.row) }));
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ message: 'Ce domaine (nom ou slug) existe déjà' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

const update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  const b = req.body || {};
  // Validations (avant toute écriture)
  if (b.nom !== undefined && (typeof b.nom !== 'string' || !b.nom.trim())) return res.status(400).json({ message: 'Nom requis' });
  if (b.nom !== undefined && b.nom.trim().length > 100) return res.status(400).json({ message: 'Nom trop long (100 max)' });
  if (b.slug !== undefined && (typeof b.slug !== 'string' || !slugify(b.slug))) return res.status(400).json({ message: 'Slug invalide' });
  // Lexique (spec §1.4) : sg surchargé ⇒ pl, g, el obligatoires ; derive_de / mode / gabarit
  // non surchargeables ; caractères interdits dans sg, pl, forme courte.
  const lexErr = validerLexique(b.lexique);
  if (lexErr) return res.status(400).json(lexErr);
  const regErr = validateRegles(b.regles);
  if (regErr) return res.status(400).json({ message: regErr });
  let composants = null;
  if (b.composants !== undefined) {
    if (!Array.isArray(b.composants)) return res.status(400).json({ message: 'composants : tableau attendu' });
    for (let i = 0; i < b.composants.length; i++) {
      const e = validateComposant(b.composants[i], i);
      if (e) return res.status(400).json({ message: e });
    }
    const codes = b.composants.map((c) => c.code.trim());
    const dup = codes.find((c, i) => codes.indexOf(c) !== i);
    if (dup) return res.status(400).json({ message: `composants : code en double « ${dup} »` });
    composants = b.composants;
  }

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const cur = await db.query('SELECT * FROM domaines_activite WHERE id = $1 FOR UPDATE', [id]);
    if (!cur.rows.length) { await db.query('ROLLBACK'); return res.status(404).json({ message: 'Domaine introuvable' }); }
    // Le domaine par défaut (slug 'restauration') est le repli de tous les flux (création de
    // compte, config sans domaine, profil client) : son slug ne se change pas.
    if (cur.rows[0].slug === SLUG_DEFAUT && b.slug !== undefined && slugify(b.slug) !== SLUG_DEFAUT) {
      await db.query('ROLLBACK');
      return res.status(400).json({ message: `Le slug du domaine par défaut « ${SLUG_DEFAUT} » ne peut pas être modifié` });
    }
    // Invariant I1 : le lexique du domaine par défaut EST le lexique par défaut. Aucun écart n'y est
    // ajouté ni modifié (des écarts déjà stockés peuvent être renvoyés tels quels, ou retirés).
    if (cur.rows[0].slug === SLUG_DEFAUT && b.lexique !== undefined) {
      const demande = nettoyerLexique(b.lexique);
      const stocke = ecartsLexique(cur.rows[0]);
      const nouveaux = Object.keys(demande).filter((k) => !isDeepStrictEqual(demande[k], stocke[k]));
      if (nouveaux.length) {
        await db.query('ROLLBACK');
        return res.status(400).json({
          code: 'LEXIQUE_DOMAINE_DEFAUT',
          message: `Le lexique du domaine par défaut « ${SLUG_DEFAUT} » est le vocabulaire de référence de LabFlow : il ne se modifie pas (${nouveaux.join(', ')}). Pour un autre vocabulaire, créez un domaine.`,
          cles: nouveaux,
        });
      }
    }

    await db.query(
      `UPDATE domaines_activite
          SET nom = COALESCE($2, nom),
              slug = COALESCE($3, slug),
              description = CASE WHEN $4::boolean THEN $5 ELSE description END,
              lexique = CASE WHEN $6::boolean THEN $7::jsonb ELSE lexique END,
              regles  = CASE WHEN $8::boolean THEN $9::jsonb ELSE regles END
        WHERE id = $1`,
      [
        id,
        b.nom !== undefined ? b.nom.trim() : null,
        b.slug !== undefined ? slugify(b.slug) : null,
        b.description !== undefined, b.description != null ? String(b.description).trim() || null : null,
        b.lexique !== undefined, JSON.stringify(nettoyerLexique(b.lexique)),
        b.regles !== undefined, JSON.stringify(nettoyerRegles(b.regles)),
      ]
    );

    // Lot 2c, R5.9 : les variantes du manuel (manuel_sections_domaine) ciblent un domaine par son SLUG, sans clé
    // étrangère ; elles suivent son renommage. Une requête, après l'UPDATE (un slug pris par un autre domaine a déjà
    // levé 23505 → « existe déjà ») : 409 VARIANTES_EXISTANTES si des variantes existent déjà sous le nouveau slug
    // (domaine supprimé puis recréé : l'unicité donnerait un faux « existe déjà ») ; sinon celles de l'ancien slug le
    // prennent. Le slug « restauration » ne change jamais (garde ci-dessus) ; la suppression d'un domaine ne touche pas
    // ses variantes.
    const nouveauSlug = b.slug !== undefined ? slugify(b.slug) : null;
    if (nouveauSlug && nouveauSlug !== cur.rows[0].slug) {
      const variantes = await db.query(
        `WITH deja AS (SELECT 1 FROM manuel_sections_domaine WHERE domaine_slug = $1 LIMIT 1),
              suivies AS (UPDATE manuel_sections_domaine SET domaine_slug = $1, updated_at = NOW()
                           WHERE domaine_slug = $2 AND NOT EXISTS (SELECT 1 FROM deja) RETURNING 1)
         SELECT EXISTS (SELECT 1 FROM deja) AS deja, (SELECT COUNT(*)::int FROM suivies) AS suivies`,
        [nouveauSlug, cur.rows[0].slug]
      );
      if (variantes.rows[0].deja) {
        await db.query('ROLLBACK');
        return res.status(409).json({ code: 'VARIANTES_EXISTANTES', message: 'Des variantes du manuel existent déjà pour ce slug' });
      }
    }

    if (composants) {
      const existants = (await db.query('SELECT * FROM domaine_composants WHERE domaine_id = $1', [id])).rows;
      const codesEnvoyes = new Set(composants.map((c) => c.code.trim()));
      // Composants absents du tableau : supprimés s'ils ne sont référencés par aucune config, sinon 409
      const absents = existants.filter((e) => !codesEnvoyes.has(e.code));
      if (absents.length) {
        const used = await db.query(
          `SELECT dc.id, dc.code, dc.libelle, COUNT(acc.abonnement_id)::int AS nb_configs
             FROM domaine_composants dc
             JOIN abonnement_config_composants acc ON acc.composant_id = dc.id
            WHERE dc.id = ANY($1::int[])
            GROUP BY dc.id, dc.code, dc.libelle`,
          [absents.map((a) => a.id)]
        );
        if (used.rows.length) {
          await db.query('ROLLBACK');
          return res.status(409).json({
            code: 'COMPOSANT_UTILISE',
            message: `Composant(s) utilisé(s) par des comptes : ${used.rows.map((u) => `${u.libelle} (${u.nb_configs})`).join(', ')}`,
            composants: used.rows.map((u) => ({ id: u.id, code: u.code, libelle: u.libelle, nbConfigs: u.nb_configs })),
          });
        }
        await db.query('DELETE FROM domaine_composants WHERE id = ANY($1::int[])', [absents.map((a) => a.id)]);
      }
      // Changement de TYPE technique d'un composant référencé par des comptes : refusé (409) —
      // les compteurs nb_* (Σ par type) et la mensualité de ces comptes seraient faussés.
      // (La désactivation reste possible : le composant reste valide pour ses comptes.)
      const retypes = composants
        .map((c) => ({ c, e: existants.find((x) => x.code === c.code.trim()) }))
        .filter(({ c, e }) => e && e.type_technique !== c.typeTechnique);
      if (retypes.length) {
        const used = await db.query(
          `SELECT dc.id, dc.code, dc.libelle, COUNT(acc.abonnement_id)::int AS nb_configs
             FROM domaine_composants dc
             JOIN abonnement_config_composants acc ON acc.composant_id = dc.id
            WHERE dc.id = ANY($1::int[])
            GROUP BY dc.id, dc.code, dc.libelle`,
          [retypes.map(({ e }) => e.id)]
        );
        if (used.rows.length) {
          await db.query('ROLLBACK');
          return res.status(409).json({
            code: 'COMPOSANT_UTILISE',
            motif: 'type_technique',
            message: `Type technique non modifiable : composant(s) utilisé(s) par des comptes : ${used.rows.map((u) => `${u.libelle} (${u.nb_configs})`).join(', ')}`,
            composants: used.rows.map((u) => ({ id: u.id, code: u.code, libelle: u.libelle, nbConfigs: u.nb_configs })),
          });
        }
      }
      // Genre et élision (lot 2b §5.4) : un payload sans ces champs (ancien onglet admin, script de
      // test) ne remet rien à zéro. Genre : COALESCE sur la valeur stockée ('m' à l'insertion).
      // Élision : $16 = le champ est-il envoyé ? ; $15 = true / false / null (null et 'auto' = déduite).
      for (let i = 0; i < composants.length; i++) {
        const c = composants[i];
        await db.query(
          `INSERT INTO domaine_composants
             (domaine_id, code, libelle, libelle_pluriel, icone, aide, type_technique, vente_active, production_active, nb_min, nb_max, ordre, actif, genre, elision)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, 'm'), $15::boolean)
           ON CONFLICT (domaine_id, code) DO UPDATE SET
             libelle = EXCLUDED.libelle, libelle_pluriel = EXCLUDED.libelle_pluriel, icone = EXCLUDED.icone,
             aide = EXCLUDED.aide, type_technique = EXCLUDED.type_technique,
             vente_active = EXCLUDED.vente_active, production_active = EXCLUDED.production_active,
             nb_min = EXCLUDED.nb_min, nb_max = EXCLUDED.nb_max, ordre = EXCLUDED.ordre, actif = EXCLUDED.actif,
             genre = COALESCE($14, domaine_composants.genre),
             elision = CASE WHEN $16::boolean THEN $15::boolean ELSE domaine_composants.elision END`,
          [
            id, c.code.trim(), String(c.libelle).trim(),
            c.libellePluriel != null && String(c.libellePluriel).trim() ? String(c.libellePluriel).trim() : null,
            c.icone != null && String(c.icone).trim() ? String(c.icone).trim() : null,
            c.aide != null && String(c.aide).trim() ? String(c.aide).trim() : null,
            c.typeTechnique,
            c.venteActive !== false, c.productionActive !== false,
            c.nbMin == null ? 0 : parseInt(c.nbMin, 10),
            c.nbMax == null || c.nbMax === '' ? null : parseInt(c.nbMax, 10),
            c.ordre == null ? i + 1 : parseInt(c.ordre, 10),
            c.actif !== false,
            c.genre === 'm' || c.genre === 'f' ? c.genre : null,
            c.elision === true || c.elision === false ? c.elision : null,
            'elision' in c,
          ]
        );
      }
    }
    await db.query('COMMIT');
    invalidate(id);
    const rows = await profilService.loadDomaineRows(id);
    const nb = await pool.query(
      `SELECT COUNT(DISTINCT a.client_id)::int AS n FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE ac.domaine_id = $1`,
      [id]
    );
    res.json(mapDomaine(resolveProfil(rows.row, rows.composants), { nbClients: nb.rows[0]?.n || 0, lexiqueEcarts: ecartsLexique(rows.row) }));
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ message: 'Ce domaine (nom ou slug) existe déjà' });
    if (err.code === '23503') return res.status(409).json({ code: 'COMPOSANT_UTILISE', message: 'Composant utilisé par des comptes' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

const remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Identifiant invalide' });
  try {
    const exists = await pool.query('SELECT id, slug FROM domaines_activite WHERE id = $1', [id]);
    if (!exists.rows.length) return res.status(404).json({ message: 'Domaine introuvable' });
    if (exists.rows[0].slug === SLUG_DEFAUT) {
      return res.status(409).json({
        code: 'DOMAINE_DEFAUT',
        message: `Le domaine par défaut « ${SLUG_DEFAUT} » ne peut pas être supprimé (repli de la création de comptes)`,
        nbClients: null, nbSurcharges: null,
      });
    }
    const refs = await pool.query(
      `SELECT
         (SELECT COUNT(DISTINCT a.client_id)::int FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE ac.domaine_id = $1)
         + (SELECT COUNT(DISTINCT cd.client_id)::int FROM client_domaines cd WHERE cd.domaine_id = $1
              AND cd.client_id NOT IN (SELECT a.client_id FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE ac.domaine_id = $1)) AS nb_clients,
         (SELECT COUNT(*)::int FROM tarifs_domaine WHERE domaine_id = $1) AS nb_surcharges`,
      [id]
    );
    const { nb_clients: nbClients, nb_surcharges: nbSurcharges } = refs.rows[0];
    if (nbClients > 0 || nbSurcharges > 0) {
      return res.status(409).json({
        code: 'DOMAINE_UTILISE',
        message: `Domaine utilisé par ${nbClients} compte(s) et ${nbSurcharges} surcharge(s) tarifaire(s)`,
        nbClients, nbSurcharges,
      });
    }
    await pool.query('DELETE FROM domaines_activite WHERE id = $1', [id]);
    invalidate(id);
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ code: 'DOMAINE_UTILISE', message: 'Domaine référencé par des données existantes', nbClients: null, nbSurcharges: null });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, getOne, create, update, remove, mapDomaine, slugify, validateComposant };
