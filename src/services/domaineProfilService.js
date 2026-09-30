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
const { resoudreLexique } = require('../utils/vocab');

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
  // Lot 1b §5 — seeds à la création du compte : [] = comportement actuel (rien n'est créé).
  unites_seed: Object.freeze([]),        // unités de MESURE créées pour le nouveau client
  prestataires_seed: Object.freeze([]),  // canaux (prestataires_livraison existants, liés au compte)
});
const REGLES_CLES = Object.freeze(Object.keys(REGLES_DEFAUT));

// ── Types de perte (lot 1b §5) ───────────────────────────────────────────────
// Codes VARCHAR(20) sur pertes/labo_pertes : minuscules, [a-z0-9_], 2 à 20 caractères.
const TYPE_PERTE_RE = /^[a-z0-9_]{2,20}$/;
const LIBELLES_PERTE = Object.freeze({ avarie: 'Avarie', dechet: 'Déchet' });

// Normalise une liste (tableau ou texte « a, b ») : trim, minuscules, dédoublonnée.
// Ne filtre PAS les codes invalides (la validation les signale) — sauf les vides.
const normaliserTypesPerte = (v) => {
  const items = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\n]/) : [];
  const out = [];
  for (const it of items) {
    const code = String(it ?? '').trim().toLowerCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
};

// Libellé d'un code de perte : Avarie / Déchet, sinon code capitalisé (« casse » → « Casse »).
const perteLabel = (code) => {
  const c = String(code ?? '').trim().toLowerCase();
  if (!c) return '';
  return LIBELLES_PERTE[c] || (c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' '));
};

// Types de perte effectifs d'un profil (jamais vide : repli sur le défaut).
const typesPerteDuProfil = (profil) => {
  const list = normaliserTypesPerte(profil?.regles?.types_perte).filter((c) => TYPE_PERTE_RE.test(c));
  return list.length ? list : [...REGLES_DEFAUT.types_perte];
};

// Seuil coût matière (%) d'un profil — nombre fini ≥ 0, sinon défaut 40.
const seuilCoutMatiereDuProfil = (profil) => {
  const n = Number(profil?.regles?.seuil_cout_matiere_pct);
  return Number.isFinite(n) && n >= 0 ? n : REGLES_DEFAUT.seuil_cout_matiere_pct;
};

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

// Lexique v2 (lot 2, spec §1.3) = défauts + écarts du domaine, résolu par le moteur
// généré (src/utils/vocab.js, même code que le front) :
//   • clé simple : le domaine surcharge `sg` → l'entrée est la sienne (ni `court` ni `appo`
//     hérités du défaut) ; sinon fusion champ par champ avec le défaut ;
//   • clé dérivée K de parent P : surchargée par le domaine → son entrée ; sinon, si le
//     domaine surcharge P : copie / pluriel_titre / gabarit rendu avec le lexique du
//     domaine ; sinon défaut de K ;
//   • clés inconnues du défaut (ajoutées par l'admin) : conservées telles quelles.
// Le résultat est ENTIÈREMENT résolu (toutes les clés du défaut, dans son ordre) : c'est
// lui que portent getProfil, /auth/me, /auth/login, /api/domaines et /api/entreprise.
// Sans écart, il est égal au lexique par défaut.
const resolveLexique = (ecarts) => resoudreLexique(LEXIQUE_DEFAUT, asObject(ecarts));

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
// Depuis le lot 2, getProfil est appelé par `authenticate` à CHAQUE requête d'un compte (req.voc) :
//   • chargements en cours partagés : à l'expiration du cache, N requêtes simultanées du même
//     domaine ne font qu'UN chargement (2 requêtes SQL), pas N ;
//   • `generation` : un chargement commencé avant un invalidate() (PUT du domaine) ne remet pas
//     en cache le profil périmé qu'il a lu.
const enCours = new Map(); // domaineId -> Promise<profil | null>
let generation = 0;

const getProfil = async (domaineId) => {
  const id = parseInt(domaineId, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  const hit = cache.get(id);
  if (hit && hit.expiry > Date.now()) return hit.profil;
  let chargement = enCours.get(id);
  if (!chargement) {
    const g = generation;
    chargement = (async () => {
      const rows = await loadDomaineRows(id);
      if (!rows) { if (g === generation) cache.delete(id); return null; }
      const profil = resolveProfil(rows.row, rows.composants);
      if (g === generation) cache.set(id, { profil, expiry: Date.now() + TTL_MS });
      return profil;
    })().finally(() => { if (enCours.get(id) === chargement) enCours.delete(id); });
    enCours.set(id, chargement);
  }
  return chargement;
};

const invalidate = (domaineId = null) => {
  generation += 1;
  if (domaineId == null) { cache.clear(); enCours.clear(); }
  else { cache.delete(parseInt(domaineId, 10)); enCours.delete(parseInt(domaineId, 10)); }
};

const getDomaineDefautId = async (db = pool) => {
  const r = await db.query(`SELECT id FROM domaines_activite WHERE slug = 'restauration' LIMIT 1`);
  return r.rows[0]?.id ?? null;
};

// Domaine du DERNIER abonnement du compte (gérant → compte parent). null si aucun.
// Un ACHETEUR n'est pas un compte : l'appelant passe l'id de son client vendeur
// (acheteurs.client_id / req.user.acheteurClientId).
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
  return getProfilForClientImpl(clientId);
};

// Règles effectives du compte (défauts fusionnés) — ne lève jamais : repli REGLES_DEFAUT.
const getReglesForClient = async (clientId) => {
  try {
    const p = await getProfilForClientImpl(clientId);
    return p?.regles || { ...REGLES_DEFAUT };
  } catch (_) {
    return { ...REGLES_DEFAUT };
  }
};
// Types de perte autorisés pour le compte (gérant → compte parent).
const getTypesPerteForClient = async (clientId) => typesPerteDuProfil({ regles: await getReglesForClient(clientId) });
// Seuil coût matière (%) du compte.
const getSeuilCoutMatiereForClient = async (clientId) => seuilCoutMatiereDuProfil({ regles: await getReglesForClient(clientId) });

const getProfilForClientImpl = async (clientId) => {
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
  TYPE_PERTE_RE, normaliserTypesPerte, perteLabel, typesPerteDuProfil, seuilCoutMatiereDuProfil,
  getReglesForClient, getTypesPerteForClient, getSeuilCoutMatiereForClient,
  TYPES_TECHNIQUES, COMPOSANTS_IDENTITE,
  mapComposant, resolveLexique, resolveRegles, resolveProfil, profilDefaut,
  loadDomaineRows, getProfil, invalidate,
  getDomaineDefautId, getDomaineIdForClient, getProfilForClient,
  espaceProduitVerrouille,
};
