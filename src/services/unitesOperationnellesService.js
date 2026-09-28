// Unités opérationnelles (lot 1b, spec §3.1) : 1 unité par activité et par labo
// (table unites_operationnelles, créée par trigger à l'insertion), composant du domaine,
// flags vente_active / production_active, arbre de rattachement (unites_operationnelles_liens,
// une seule source — toujours un labo — par destination).
//
// UN SEUL ÉCRIVAIN des liens : les colonnes activites.labo_id / labos.labo_parent_id
// (triggers de synchronisation, migration 188). setSource écrit la colonne ; les contrôles
// SQL (cycle, entreprise, type) remontent en P0001 et sont mappés ici en erreurs 400.
//
//   listUnites(db, entrepriseId, { scopeGerant? })   → [{ id, typeTechnique, activiteId, laboId, nom,
//                                                       composant, venteActive, productionActive,
//                                                       sourceUniteId, sourceNom, nbDestinations }]
//   getUnite(db, uniteId) / getUniteByRef(db, type, refId)
//   setSource(db, destUniteId, sourceUniteId | null)
//   setComposant(db, uniteId, composantId)           → flags copiés du composant
//   setFlags(db, uniteId, { venteActive?, productionActive? })
//   enrichRows(db, type, rows)                       → pose uo_* sur des lignes activites/labos (mapActivite/mapLabo)
//   uniteFields(row)                                 → { uniteId, composant, venteActive, productionActive, sourceUniteId, nbDestinations }
//   getDestinations(db, laboId)                      → [{ destKey, type, id, nom }]
//   getLabosEnfants(db, laboId)                      → [{ laboId, nom }]
//   UniteError / isUniteError / mapPgError
const pool = require('../config/database');

const CODES = Object.freeze({
  CYCLE_INTERDIT: 'Rattachement impossible : cette unité alimente déjà (directement ou non) la source choisie.',
  SOURCE_NON_LABO: 'Seul un labo peut alimenter une unité.',
  ENTREPRISE_DIFFERENTE: 'Unité introuvable dans votre entreprise.',
  COMPOSANT_INVALIDE: 'Composant invalide pour ce type d’unité (hors domaine, inactif ou de type incompatible).',
  UNITE_INTROUVABLE: 'Unité introuvable.',
});

class UniteError extends Error {
  constructor(code, message, status = 400) {
    super(message || CODES[code] || code);
    this.name = 'UniteError';
    this.code = code;
    this.status = status;
  }
}
const isUniteError = (e) => e instanceof UniteError;

// P0001 levée par les triggers de la 188 (message = code) → UniteError 400 ; sinon null.
const mapPgError = (err) => {
  if (err && err.code === 'P0001' && CODES[err.message]) return new UniteError(err.message);
  return null;
};

const mapComposant = (r, prefix = 'uo_composant_') => {
  if (!r || r[`${prefix}id`] == null) return null;
  return {
    id: r[`${prefix}id`],
    code: r[`${prefix}code`],
    libelle: r[`${prefix}libelle`],
    libellePluriel: r[`${prefix}libelle_pluriel`] ?? null,
    icone: r[`${prefix}icone`] ?? null,
  };
};

// Colonnes uo_* exposées aux mappers (mapActivite / mapLabo). Défauts sûrs si l'unité manque.
const uniteFields = (row) => ({
  uniteId: row?.uo_id ?? null,
  composant: mapComposant(row),
  venteActive: row?.uo_vente_active == null ? true : row.uo_vente_active !== false,
  productionActive: row?.uo_production_active == null ? true : row.uo_production_active !== false,
  sourceUniteId: row?.uo_source_unite_id ?? null,
  nbDestinations: parseInt(row?.uo_nb_destinations, 10) || 0,
});

const UNITE_COLS = `
  uo.id AS uo_id, uo.type_technique AS uo_type, uo.entreprise_id AS uo_entreprise_id,
  uo.activite_id AS uo_activite_id, uo.labo_id AS uo_labo_id,
  uo.vente_active AS uo_vente_active, uo.production_active AS uo_production_active,
  dc.id AS uo_composant_id, dc.code AS uo_composant_code, dc.libelle AS uo_composant_libelle,
  dc.libelle_pluriel AS uo_composant_libelle_pluriel, dc.icone AS uo_composant_icone,
  ls.source_unite_id AS uo_source_unite_id,
  (SELECT COUNT(*)::int FROM unites_operationnelles_liens ld WHERE ld.source_unite_id = uo.id) AS uo_nb_destinations,
  COALESCE(a.nom, l.nom) AS uo_nom,
  COALESCE(sa.nom, sl.nom) AS uo_source_nom`;
const UNITE_FROM = `
  FROM unites_operationnelles uo
  LEFT JOIN domaine_composants dc ON dc.id = uo.composant_id
  LEFT JOIN unites_operationnelles_liens ls ON ls.dest_unite_id = uo.id
  LEFT JOIN unites_operationnelles us ON us.id = ls.source_unite_id
  LEFT JOIN activites a ON a.id = uo.activite_id
  LEFT JOIN labos l ON l.id = uo.labo_id
  LEFT JOIN activites sa ON sa.id = us.activite_id
  LEFT JOIN labos sl ON sl.id = us.labo_id`;

const mapUnite = (r) => ({
  id: r.uo_id,
  typeTechnique: r.uo_type,
  entrepriseId: r.uo_entreprise_id,
  activiteId: r.uo_activite_id ?? null,
  laboId: r.uo_labo_id ?? null,
  nom: r.uo_nom ?? null,
  composant: mapComposant(r),
  venteActive: r.uo_vente_active !== false,
  productionActive: r.uo_production_active !== false,
  sourceUniteId: r.uo_source_unite_id ?? null,
  sourceNom: r.uo_source_nom ?? null,
  nbDestinations: parseInt(r.uo_nb_destinations, 10) || 0,
});

// ── Lecture ───────────────────────────────────────────────────────────────────

/**
 * Unités d'une entreprise. scopeGerant = { activiteIds, laboIds } : unités du périmètre
 * du gérant + leurs sources (lecture, pour afficher « Alimenté par »).
 */
async function listUnites(db, entrepriseId, { scopeGerant = null } = {}) {
  const d = db || pool;
  const params = [entrepriseId];
  let where = 'uo.entreprise_id = $1';
  if (scopeGerant) {
    params.push(scopeGerant.activiteIds?.length ? scopeGerant.activiteIds : [-1]);
    params.push(scopeGerant.laboIds?.length ? scopeGerant.laboIds : [-1]);
    where += ` AND (uo.activite_id = ANY($2::int[]) OR uo.labo_id = ANY($3::int[])
      OR uo.id IN (SELECT lx.source_unite_id FROM unites_operationnelles_liens lx
                   JOIN unites_operationnelles ux ON ux.id = lx.dest_unite_id
                   WHERE ux.activite_id = ANY($2::int[]) OR ux.labo_id = ANY($3::int[])))`;
  }
  const r = await d.query(
    `SELECT ${UNITE_COLS} ${UNITE_FROM} WHERE ${where}
     ORDER BY uo.type_technique DESC, COALESCE(a.nom, l.nom), uo.id`,
    params
  );
  return r.rows.map(mapUnite);
}

async function getUnite(db, uniteId) {
  const d = db || pool;
  const r = await d.query(`SELECT ${UNITE_COLS} ${UNITE_FROM} WHERE uo.id = $1`, [uniteId]);
  return r.rows.length ? mapUnite(r.rows[0]) : null;
}

// type = 'activite' | 'labo', refId = activites.id | labos.id
async function getUniteByRef(db, type, refId) {
  const d = db || pool;
  const col = type === 'labo' ? 'uo.labo_id' : 'uo.activite_id';
  const r = await d.query(`SELECT ${UNITE_COLS} ${UNITE_FROM} WHERE ${col} = $1`, [refId]);
  return r.rows.length ? mapUnite(r.rows[0]) : null;
}

/**
 * Pose les colonnes uo_* sur des lignes `activites` / `labos` (champ `id`) — pour mapActivite /
 * mapLabo et les listes. Mutation en place, renvoie `rows`.
 */
async function enrichRows(db, type, rows) {
  if (!rows || rows.length === 0) return rows;
  const d = db || pool;
  const col = type === 'labo' ? 'uo.labo_id' : 'uo.activite_id';
  const ids = rows.map((r) => r.id);
  const r = await d.query(`SELECT ${UNITE_COLS} ${UNITE_FROM} WHERE ${col} = ANY($1::int[])`, [ids]);
  const byRef = new Map();
  for (const u of r.rows) byRef.set(type === 'labo' ? u.uo_labo_id : u.uo_activite_id, u);
  for (const row of rows) {
    const u = byRef.get(row.id);
    if (!u) continue;
    for (const k of Object.keys(u)) if (k.startsWith('uo_')) row[k] = u[k];
  }
  return rows;
}

// ── Domaine du compte (dernier abonnement) ────────────────────────────────────
async function getDomaineIdForEntreprise(db, entrepriseId) {
  const r = await (db || pool).query(
    `SELECT ac.domaine_id
       FROM profil_entreprise pe
       JOIN abonnements a ON a.client_id = pe.client_id
       JOIN abonnement_config ac ON ac.abonnement_id = a.id
      WHERE pe.id = $1
      ORDER BY a.id DESC LIMIT 1`,
    [entrepriseId]
  );
  return r.rows[0]?.domaine_id ?? null;
}

// Composant valide pour (entreprise, type) : ∈ domaine du compte, type compatible, actif.
async function validateComposant(db, entrepriseId, typeTechnique, composantId) {
  const id = parseInt(composantId, 10);
  if (!Number.isInteger(id) || id <= 0) throw new UniteError('COMPOSANT_INVALIDE');
  const domaineId = await getDomaineIdForEntreprise(db, entrepriseId);
  if (domaineId == null) throw new UniteError('COMPOSANT_INVALIDE');
  const r = await (db || pool).query(
    `SELECT * FROM domaine_composants
      WHERE id = $1 AND domaine_id = $2 AND type_technique = $3 AND actif = true`,
    [id, domaineId, typeTechnique]
  );
  if (!r.rows.length) throw new UniteError('COMPOSANT_INVALIDE');
  return r.rows[0];
}

// ── Écriture ──────────────────────────────────────────────────────────────────

/**
 * Composant d'une unité : validé (domaine du compte, type, actif) puis posé avec ses
 * flags vente_active / production_active (modifiables ensuite par unité via setFlags).
 * Composant INCHANGÉ → no-op : les flags réglés par unité ne sont jamais réinitialisés par un
 * simple re-enregistrement du formulaire (ActivitesPage renvoie composantId à chaque PUT).
 */
async function setComposant(db, uniteId, composantId) {
  const d = db || pool;
  const u = await getUnite(d, uniteId);
  if (!u) throw new UniteError('UNITE_INTROUVABLE', null, 404);
  const c = await validateComposant(d, u.entrepriseId, u.typeTechnique, composantId);
  if (u.composant && u.composant.id === c.id) return u;
  await d.query(
    `UPDATE unites_operationnelles
        SET composant_id = $1, vente_active = $2, production_active = $3, updated_at = now()
      WHERE id = $4`,
    [c.id, c.vente_active !== false, c.production_active !== false, uniteId]
  );
  return getUnite(d, uniteId);
}

async function setFlags(db, uniteId, { venteActive, productionActive } = {}) {
  const d = db || pool;
  const sets = [];
  const params = [];
  if (typeof venteActive === 'boolean') { params.push(venteActive); sets.push(`vente_active = $${params.length}`); }
  if (typeof productionActive === 'boolean') { params.push(productionActive); sets.push(`production_active = $${params.length}`); }
  if (!sets.length) return getUnite(d, uniteId);
  params.push(uniteId);
  const r = await d.query(
    `UPDATE unites_operationnelles SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING id`,
    params
  );
  if (!r.rows.length) throw new UniteError('UNITE_INTROUVABLE', null, 404);
  return getUnite(d, uniteId);
}

/**
 * Source d'une unité (arbre) : écrit activites.labo_id ou labos.labo_parent_id (les triggers
 * synchronisent les liens ; cycle / entreprise / type → 400 avec le code du RAISE), puis
 * lien fournisseur interne (fournisseur is_labo de la source) et import des sélections
 * d'articles de la source vers la destination (ON CONFLICT DO NOTHING).
 * sourceUniteId = null → détachement.
 */
async function setSource(db, destUniteId, sourceUniteId) {
  const d = db || pool;
  const dest = await getUnite(d, destUniteId);
  if (!dest) throw new UniteError('UNITE_INTROUVABLE', null, 404);
  let src = null;
  if (sourceUniteId != null) {
    src = await getUnite(d, sourceUniteId);
    if (!src || src.entrepriseId !== dest.entrepriseId) throw new UniteError('ENTREPRISE_DIFFERENTE');
    if (src.typeTechnique !== 'labo') throw new UniteError('SOURCE_NON_LABO');
    if (src.id === dest.id) throw new UniteError('CYCLE_INTERDIT');
  }
  try {
    if (dest.typeTechnique === 'activite') {
      await d.query('UPDATE activites SET labo_id = $1, updated_at = NOW() WHERE id = $2', [src ? src.laboId : null, dest.activiteId]);
    } else {
      await d.query('UPDATE labos SET labo_parent_id = $1, updated_at = NOW() WHERE id = $2', [src ? src.laboId : null, dest.laboId]);
    }
  } catch (err) {
    const mapped = mapPgError(err);
    if (mapped) throw mapped;
    throw err;
  }
  if (src) {
    const fRes = await d.query('SELECT id FROM fournisseurs WHERE labo_id = $1 AND is_labo = true LIMIT 1', [src.laboId]);
    const fId = fRes.rows[0]?.id ?? null;
    if (dest.typeTechnique === 'activite') {
      if (fId) {
        await d.query('INSERT INTO fournisseur_activites (fournisseur_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [fId, dest.activiteId]);
      }
      await d.query(
        `INSERT INTO activite_ingredient_selections (activite_id, ingredient_id)
         SELECT $1, lis.ingredient_id FROM labo_ingredient_selections lis WHERE lis.labo_id = $2
         ON CONFLICT DO NOTHING`,
        [dest.activiteId, src.laboId]
      );
    } else {
      if (fId) {
        await d.query('INSERT INTO fournisseur_labos (fournisseur_id, labo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [fId, dest.laboId]);
      }
      await d.query(
        `INSERT INTO labo_ingredient_selections (labo_id, ingredient_id)
         SELECT $1, lis.ingredient_id FROM labo_ingredient_selections lis WHERE lis.labo_id = $2
         ON CONFLICT DO NOTHING`,
        [dest.laboId, src.laboId]
      );
    }
  }
  return getUnite(d, destUniteId);
}

// ── Destinations d'un labo source ─────────────────────────────────────────────

// [{ destKey: 'a-<id>' | 'l-<id>', type: 'activite' | 'labo', id, nom }] — activités puis labos, par nom.
async function getDestinations(db, laboId) {
  const r = await (db || pool).query(
    `SELECT ud.type_technique AS type, COALESCE(ud.activite_id, ud.labo_id) AS id, COALESCE(a.nom, l.nom) AS nom
       FROM unites_operationnelles us
       JOIN unites_operationnelles_liens li ON li.source_unite_id = us.id
       JOIN unites_operationnelles ud ON ud.id = li.dest_unite_id
       LEFT JOIN activites a ON a.id = ud.activite_id
       LEFT JOIN labos l ON l.id = ud.labo_id
      WHERE us.labo_id = $1
      ORDER BY (ud.type_technique = 'labo'), COALESCE(a.nom, l.nom)`,
    [laboId]
  );
  return r.rows.map((x) => ({
    destKey: `${x.type === 'labo' ? 'l' : 'a'}-${x.id}`,
    type: x.type,
    id: x.id,
    nom: x.nom,
  }));
}

// Labos alimentés par ce labo (enfants directs).
async function getLabosEnfants(db, laboId) {
  const r = await (db || pool).query(
    `SELECT l.id AS labo_id, l.nom
       FROM unites_operationnelles us
       JOIN unites_operationnelles_liens li ON li.source_unite_id = us.id
       JOIN unites_operationnelles ud ON ud.id = li.dest_unite_id AND ud.type_technique = 'labo'
       JOIN labos l ON l.id = ud.labo_id
      WHERE us.labo_id = $1
      ORDER BY l.nom`,
    [laboId]
  );
  return r.rows.map((x) => ({ laboId: x.labo_id, nom: x.nom }));
}

module.exports = {
  UniteError,
  isUniteError,
  mapPgError,
  CODES,
  uniteFields,
  enrichRows,
  listUnites,
  getUnite,
  getUniteByRef,
  getDomaineIdForEntreprise,
  validateComposant,
  setComposant,
  setFlags,
  setSource,
  getDestinations,
  getLabosEnfants,
};
