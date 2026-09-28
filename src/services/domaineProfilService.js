// Profil d'un domaine d'activité (lot 1a) : composants (menu de configuration),
// lexique (vocabulaire), règles métier paramétrées — résolus contre les défauts en
// code (LEXIQUE_DEFAUT / REGLES_DEFAUT = comportement actuel de l'app).
//
//   resolveProfil(row, composants)  → profil complet (lexique/règles fusionnés)
//   getProfil(domaineId)            → profil (cache mémoire TTL 60 s, invalidate() après PUT/DELETE)
//   getProfilForClient(clientId)    → profil du compte (dernier abonnement ; gérant → parent)
//   getDomaineDefautId()            → id du slug 'restauration'
//   espaceProduitVerrouille(cfg, regles) → règle R1 unique (requireFormulePremium,
//                                          manuelVisibilite, onboardingEtat)
const pool = require('../config/database');
const { LEXIQUE_DEFAUT, LEXIQUE_CLES } = require('../config/lexiqueDefaut');

// Règles métier par défaut = comportement ACTUEL (aucun changement pour l'existant).
const REGLES_DEFAUT = Object.freeze({
  acheteurs_requiert_labo: true,                 // R2 : option Acheteurs ⇒ ≥ 1 labo
  depot_exige_acheteurs: true,                   // R3 : 0 activité ⇒ ≥ 1 labo ET acheteurs > 0 (compte dépôt)
  espace_produit_verrou_basique_sans_labo: true, // R1 : Espace Produit verrouillé en basique sans labo
  formules: Object.freeze(['basique', 'premium']),
  seuil_cout_matiere_pct: 40,
  types_perte: Object.freeze(['avarie', 'dechet']),
  supplement_max_composants: 1,
  b2b_depuis_activite: false,
});
const REGLES_CLES = Object.freeze(Object.keys(REGLES_DEFAUT));

const TYPES_TECHNIQUES = Object.freeze(['activite', 'labo', 'gerant', 'acheteurs']);

// Composants IDENTITÉ (mapping 1:1 avec les types techniques) — mêmes libellés que
// le seed/backfill de la migration 187.
const COMPOSANTS_IDENTITE = Object.freeze({
  activite:  { code: 'activite',  libelle: 'Activité',       libellePluriel: 'Activités',      icone: '🏪', ordre: 1 },
  labo:      { code: 'labo',      libelle: 'Labo',           libellePluriel: 'Labos',          icone: '🏭', ordre: 2 },
  gerant:    { code: 'gerant',    libelle: 'Gérant',         libellePluriel: 'Gérants',        icone: '👤', ordre: 3 },
  acheteurs: { code: 'acheteurs', libelle: 'Base acheteurs', libellePluriel: 'Base acheteurs', icone: '🤝', ordre: 4 },
});

const mapComposant = (r) => ({
  id: r.id,
  code: r.code,
  libelle: r.libelle,
  libellePluriel: r.libelle_pluriel ?? null,
  icone: r.icone ?? null,
  aide: r.aide ?? null,
  typeTechnique: r.type_technique,
  venteActive: r.vente_active !== false,
  productionActive: r.production_active !== false,
  nbMin: parseInt(r.nb_min, 10) || 0,
  nbMax: r.nb_max == null ? null : parseInt(r.nb_max, 10),
  ordre: parseInt(r.ordre, 10) || 0,
  actif: r.actif !== false,
});

const asObject = (v) => {
  if (!v) return {};
  if (typeof v === 'string') { try { return JSON.parse(v) || {}; } catch (_) { return {}; } }
  return typeof v === 'object' && !Array.isArray(v) ? v : {};
};

// Lexique = défauts + écarts clé par clé (une entrée partielle ne perd pas ses autres champs).
const resolveLexique = (ecarts) => {
  const ov = asObject(ecarts);
  const out = {};
  for (const k of LEXIQUE_CLES) out[k] = { ...LEXIQUE_DEFAUT[k], ...asObject(ov[k]) };
  // Clés inconnues (ajoutées par l'admin) : conservées telles quelles.
  for (const k of Object.keys(ov)) if (!out[k]) out[k] = asObject(ov[k]);
  return out;
};

const resolveRegles = (ecarts) => ({ ...REGLES_DEFAUT, ...asObject(ecarts) });

// row = ligne de domaines_activite ; composants = lignes de domaine_composants (ou déjà mappées)
const resolveProfil = (row, composants = []) => ({
  id: row?.id ?? null,
  slug: row?.slug ?? null,
  nom: row?.nom ?? null,
  description: row?.description ?? null,
  lexique: resolveLexique(row?.lexique),
  regles: resolveRegles(row?.regles),
  composants: (composants || []).map((c) => (c.typeTechnique ? c : mapComposant(c))),
});

// Profil « sans domaine » (repli ultime si aucun domaine restauration n'existe).
const profilDefaut = () => resolveProfil(null, []);

// Lignes brutes d'un domaine + ses composants (tous, actifs ou non, triés ordre/id).
const loadDomaineRows = async (domaineId, db = pool) => {
  const d = await db.query('SELECT * FROM domaines_activite WHERE id = $1', [domaineId]);
  if (!d.rows.length) return null;
  const c = await db.query(
    'SELECT * FROM domaine_composants WHERE domaine_id = $1 ORDER BY ordre, id',
    [domaineId]
  );
  return { row: d.rows[0], composants: c.rows };
};

// ── Cache mémoire (TTL 60 s) ─────────────────────────────────────────────────
const TTL_MS = 60 * 1000;
const cache = new Map(); // domaineId -> { profil, expiry }

const getProfil = async (domaineId) => {
  const id = parseInt(domaineId, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  const hit = cache.get(id);
  if (hit && hit.expiry > Date.now()) return hit.profil;
  const rows = await loadDomaineRows(id);
  if (!rows) { cache.delete(id); return null; }
  const profil = resolveProfil(rows.row, rows.composants);
  cache.set(id, { profil, expiry: Date.now() + TTL_MS });
  return profil;
};

const invalidate = (domaineId = null) => {
  if (domaineId == null) cache.clear();
  else cache.delete(parseInt(domaineId, 10));
};

const getDomaineDefautId = async (db = pool) => {
  const r = await db.query(`SELECT id FROM domaines_activite WHERE slug = 'restauration' LIMIT 1`);
  return r.rows[0]?.id ?? null;
};

// Domaine du DERNIER abonnement du compte (gérant → compte parent). null si aucun.
const getDomaineIdForClient = async (clientId, db = pool) => {
  const r = await db.query(
    `SELECT ac.domaine_id
       FROM abonnements a
       JOIN abonnement_config ac ON ac.abonnement_id = a.id
      WHERE a.client_id = (SELECT COALESCE(gerant_parent_id, id) FROM utilisateurs WHERE id = $1)
      ORDER BY a.id DESC LIMIT 1`,
    [clientId]
  );
  return r.rows[0]?.domaine_id ?? null;
};

// Profil du compte : domaine de son abonnement, sinon profil « restauration » (slug),
// sinon profil par défaut sans id.
const getProfilForClient = async (clientId) => {
  const domaineId = await getDomaineIdForClient(clientId);
  if (domaineId != null) {
    const p = await getProfil(domaineId);
    if (p) return p;
  }
  const defId = await getDomaineDefautId();
  if (defId != null) {
    const p = await getProfil(defId);
    if (p) return p;
  }
  return profilDefaut();
};

// Règle R1 — Espace Produit verrouillé : formule basique SANS labo (la base Labo
// l'inclut). `cfg` en snake_case (nb_labos, formule_activites) ou camelCase.
const espaceProduitVerrouille = (cfg, regles = REGLES_DEFAUT) => {
  const r = regles || REGLES_DEFAUT;
  if (r.espace_produit_verrou_basique_sans_labo === false) return false;
  const formule = cfg?.formule_activites ?? cfg?.formuleActivites ?? null;
  const nbLabos = parseInt(cfg?.nb_labos ?? cfg?.nbLabos, 10) || 0;
  return formule === 'basique' && nbLabos === 0;
};

module.exports = {
  LEXIQUE_DEFAUT, LEXIQUE_CLES, REGLES_DEFAUT, REGLES_CLES,
  TYPES_TECHNIQUES, COMPOSANTS_IDENTITE,
  mapComposant, resolveLexique, resolveRegles, resolveProfil, profilDefaut,
  loadDomaineRows, getProfil, invalidate,
  getDomaineDefautId, getDomaineIdForClient, getProfilForClient,
  espaceProduitVerrouille,
};
