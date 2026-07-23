const pool = require('../config/database');
const { sendInviteEmail, generateInviteToken } = require('../services/emailService');
const { invalidateAuthCache } = require('../middleware/auth');

const mapGerant = (row) => ({
  id: row.id,
  nom: row.nom,
  email: row.email,
  telephone: row.telephone,
  parentId: row.gerant_parent_id,
  activiteId: row.gerant_activite_id,
  activiteType: row.gerant_activite_type,
  activiteIds: row.activite_ids || [],
  laboIds: row.labo_ids || [],
  accesAcheteurs: row.gerant_acces_acheteurs === true,
  estGratuit: row.gerant_est_gratuit,
  montantMensuel: row.gerant_montant_mensuel,
  actif: row.actif,
  createdAt: row.created_at,
  activatedAt: row.activated_at || null,
});

// La base acheteurs doit être active sur le compte pour accorder l'accès à un gérant.
const moduleAcheteursActif = async (clientId) => {
  const r = await pool.query(
    `SELECT module_acheteurs_actif FROM profil_entreprise WHERE client_id = $1`,
    [clientId]
  );
  return r.rows[0]?.module_acheteurs_actif === true;
};

// GET /api/gerants — list gérants for current user (indep or entreprise)
const list = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.nom, u.email, u.telephone, u.gerant_parent_id, u.gerant_activite_id,
              u.gerant_activite_type, u.gerant_acces_acheteurs, u.gerant_est_gratuit, u.gerant_montant_mensuel, u.actif, u.created_at, u.activated_at,
              COALESCE((SELECT json_agg(ga.activite_id) FROM gerant_affectations ga WHERE ga.gerant_id = u.id AND ga.activite_id IS NOT NULL), '[]') AS activite_ids,
              COALESCE((SELECT json_agg(ga.labo_id) FROM gerant_affectations ga WHERE ga.gerant_id = u.id AND ga.labo_id IS NOT NULL), '[]') AS labo_ids
       FROM utilisateurs u
       WHERE u.role = 'gerant' AND u.gerant_parent_id = $1
       ORDER BY u.nom`,
      [req.user.id]
    );
    res.json(result.rows.map(mapGerant));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/gerants — create a new gérant account
// Valide que les activités / labos appartiennent bien au client parent.
const assertOwnership = async (parentId, activiteIds, laboIds) => {
  if (activiteIds.length) {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM activites a
       JOIN profil_entreprise pe ON pe.id = a.entreprise_id
       WHERE pe.client_id = $1 AND a.id = ANY($2::int[])`,
      [parentId, activiteIds]
    );
    if (r.rows[0].cnt !== activiteIds.length) return false;
  }
  if (laboIds.length) {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM labos l
       JOIN profil_entreprise pe ON pe.id = l.entreprise_id
       WHERE pe.client_id = $1 AND l.id = ANY($2::int[])`,
      [parentId, laboIds]
    );
    if (r.rows[0].cnt !== laboIds.length) return false;
  }
  return true;
};

const create = async (req, res) => {
  const { nom, telephone, email, estGratuit, montantMensuel } = req.body;
  if (!nom || !telephone || !email) {
    return res.status(400).json({ message: 'Nom, téléphone et email requis' });
  }

  // Accepte les listes (nouveau) ou l'ancien format unique (activiteId/activiteType)
  let activiteIds = Array.isArray(req.body.activiteIds) ? req.body.activiteIds.map(Number).filter(Number.isFinite) : [];
  let laboIds = Array.isArray(req.body.laboIds) ? req.body.laboIds.map(Number).filter(Number.isFinite) : [];
  if (activiteIds.length === 0 && laboIds.length === 0 && req.body.activiteId) {
    if (req.body.activiteType === 'labo') laboIds = [Number(req.body.activiteId)];
    else activiteIds = [Number(req.body.activiteId)];
  }
  activiteIds = [...new Set(activiteIds)];
  laboIds = [...new Set(laboIds)];
  if (activiteIds.length === 0 && laboIds.length === 0) {
    return res.status(400).json({ message: 'Au moins une activité ou un labo doit être affecté' });
  }

  const parentId = req.user.id;

  try {
    if (!(await assertOwnership(parentId, activiteIds, laboIds))) {
      return res.status(403).json({ message: 'Activité ou labo hors de votre périmètre' });
    }
    // Accès base acheteurs : opt-in, exige au moins un labo affecté + module actif sur le compte.
    const accesAcheteurs = req.body.accesAcheteurs === true;
    if (accesAcheteurs) {
      if (laboIds.length === 0) {
        return res.status(400).json({ message: 'L\'accès à la base acheteurs exige au moins un labo affecté' });
      }
      if (!(await moduleAcheteursActif(parentId))) {
        return res.status(400).json({ message: 'La base acheteurs n\'est pas activée sur votre compte' });
      }
    }
    const firstActiviteId = activiteIds[0] ?? null;
    const firstLaboId = laboIds[0] ?? null;
    const compatActiviteId = firstActiviteId ?? firstLaboId;
    const compatActiviteType = firstActiviteId ? 'activite' : 'labo';
    // Check free gérant limit (3 included per subscription)
    const existing = await pool.query(
      `SELECT COUNT(*) FROM utilisateurs WHERE role = 'gerant' AND gerant_parent_id = $1 AND gerant_est_gratuit = true`,
      [parentId]
    );
    const freeCount = parseInt(existing.rows[0].count, 10);
    const freeLimit = 3;

    const isGratuit = estGratuit !== false && freeCount < freeLimit;
    const montant = isGratuit ? 0 : (montantMensuel || 80);

    // Check email uniqueness
    const emailCheck = await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) return res.status(409).json({ message: 'Email déjà utilisé' });

    const inviteToken = generateInviteToken();
    const inviteExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const result = await pool.query(
      `INSERT INTO utilisateurs
         (nom, email, mot_de_passe, telephone, role,
          gerant_parent_id, gerant_activite_id, gerant_activite_type,
          gerant_est_gratuit, gerant_montant_mensuel, invite_token, invite_token_expires_at, gerant_acces_acheteurs)
       VALUES ($1, $2, NULL, $3, 'gerant', $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, nom, email, telephone, gerant_parent_id, gerant_activite_id,
                 gerant_activite_type, gerant_acces_acheteurs, gerant_est_gratuit, gerant_montant_mensuel, actif, created_at`,
      [nom, email, telephone,
       parentId, compatActiviteId, compatActiviteType,
       isGratuit, montant, inviteToken, inviteExpires, accesAcheteurs]
    );
    const gerantId = result.rows[0].id;
    if (activiteIds.length > 0) {
      await pool.query('INSERT INTO gerant_affectations (gerant_id, activite_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING', [gerantId, activiteIds]);
    }
    if (laboIds.length > 0) {
      await pool.query('INSERT INTO gerant_affectations (gerant_id, labo_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING', [gerantId, laboIds]);
    }
    await sendInviteEmail({ to: email, nom, token: inviteToken, role: 'gerant' });
    // La row RETURNING ne porte pas les agrégats d'affectations : on renvoie celles écrites.
    res.status(201).json({ ...mapGerant(result.rows[0]), activiteIds, laboIds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ≥ 1 labo dans le périmètre du gérant (même repli legacy que le middleware auth :
// sans aucune ligne d'affectation, l'affectation unique gerant_activite_id/type fait foi).
const gerantHasLabo = async (gerantId) => {
  const r = await pool.query(
    `SELECT EXISTS(SELECT 1 FROM gerant_affectations WHERE gerant_id = u.id AND labo_id IS NOT NULL) AS has_labo,
            NOT EXISTS(SELECT 1 FROM gerant_affectations WHERE gerant_id = u.id) AS no_aff,
            (u.gerant_activite_type = 'labo' AND u.gerant_activite_id IS NOT NULL) AS legacy_labo
     FROM utilisateurs u WHERE u.id = $1`,
    [gerantId]
  );
  const row = r.rows[0];
  return !!row && (row.has_labo || (row.no_aff && row.legacy_labo));
};

const fetchAffectations = async (gerantId) => {
  const r = await pool.query(
    `SELECT COALESCE(json_agg(activite_id) FILTER (WHERE activite_id IS NOT NULL), '[]') AS activite_ids,
            COALESCE(json_agg(labo_id) FILTER (WHERE labo_id IS NOT NULL), '[]') AS labo_ids
     FROM gerant_affectations WHERE gerant_id = $1`,
    [gerantId]
  );
  return { activiteIds: r.rows[0].activite_ids || [], laboIds: r.rows[0].labo_ids || [] };
};

// PUT /api/gerants/:id — update gérant (nom, tel, affectations, accès acheteurs, actif)
const update = async (req, res) => {
  const { id } = req.params;
  const { nom, telephone, actif } = req.body;

  // Affectations multiples (optionnelles). Si fournies, on remplace l'ensemble.
  const hasAffectations = Array.isArray(req.body.activiteIds) || Array.isArray(req.body.laboIds);
  let activiteIds = Array.isArray(req.body.activiteIds) ? [...new Set(req.body.activiteIds.map(Number).filter(Number.isFinite))] : [];
  let laboIds = Array.isArray(req.body.laboIds) ? [...new Set(req.body.laboIds.map(Number).filter(Number.isFinite))] : [];

  try {
    // Appartenance vérifiée d'emblée (évite de sonder des ids hors compte via les 400 suivants).
    const own = await pool.query(
      `SELECT id FROM utilisateurs WHERE id = $1 AND role = 'gerant' AND gerant_parent_id = $2`,
      [id, req.user.id]
    );
    if (own.rows.length === 0) return res.status(404).json({ message: 'Gérant introuvable' });

    if (hasAffectations) {
      if (activiteIds.length === 0 && laboIds.length === 0) {
        return res.status(400).json({ message: 'Au moins une activité ou un labo doit être affecté' });
      }
      if (!(await assertOwnership(req.user.id, activiteIds, laboIds))) {
        return res.status(403).json({ message: 'Activité ou labo hors de votre périmètre' });
      }
    }

    // Accès base acheteurs : opt-in, exige ≥ 1 labo affecté + module actif sur le compte.
    // Si l'édition retire le dernier labo, l'accès est révoqué automatiquement.
    let accesAcheteurs = typeof req.body.accesAcheteurs === 'boolean' ? req.body.accesAcheteurs : null;
    const hasLaboFinal = hasAffectations ? laboIds.length > 0 : await gerantHasLabo(id);
    if (accesAcheteurs === true) {
      if (!hasLaboFinal) {
        return res.status(400).json({ message: 'L\'accès à la base acheteurs exige au moins un labo affecté' });
      }
      if (!(await moduleAcheteursActif(req.user.id))) {
        return res.status(400).json({ message: 'La base acheteurs n\'est pas activée sur votre compte' });
      }
    } else if (accesAcheteurs === null && !hasLaboFinal) {
      accesAcheteurs = false;
    }

    const firstActiviteId = activiteIds[0] ?? null;
    const firstLaboId = laboIds[0] ?? null;
    const compatActiviteId = hasAffectations ? (firstActiviteId ?? firstLaboId) : null;
    const compatActiviteType = hasAffectations ? (firstActiviteId ? 'activite' : 'labo') : null;

    const result = await pool.query(
      `UPDATE utilisateurs
       SET nom = COALESCE($1, nom),
           telephone = COALESCE($2, telephone),
           gerant_activite_id = COALESCE($3, gerant_activite_id),
           gerant_activite_type = COALESCE($4, gerant_activite_type),
           actif = COALESCE($5, actif),
           gerant_acces_acheteurs = COALESCE($6, gerant_acces_acheteurs),
           updated_at = NOW()
       WHERE id = $7 AND role = 'gerant' AND gerant_parent_id = $8
       RETURNING id, nom, email, telephone, gerant_parent_id, gerant_activite_id,
                 gerant_activite_type, gerant_acces_acheteurs, gerant_est_gratuit, gerant_montant_mensuel, actif, created_at`,
      [nom || null, telephone || null, compatActiviteId, compatActiviteType,
       actif !== undefined ? actif : null, accesAcheteurs, id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Gérant introuvable' });

    if (hasAffectations) {
      await pool.query('DELETE FROM gerant_affectations WHERE gerant_id = $1', [id]);
      if (activiteIds.length > 0) {
        await pool.query('INSERT INTO gerant_affectations (gerant_id, activite_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING', [id, activiteIds]);
      }
      if (laboIds.length > 0) {
        await pool.query('INSERT INTO gerant_affectations (gerant_id, labo_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING', [id, laboIds]);
      }
    }
    // Le périmètre effectif du gérant vit dans le cache auth (TTL 15 s) : on invalide
    // pour que le changement d'affectations / d'accès soit immédiat sur cette instance.
    invalidateAuthCache(id);

    const affectations = hasAffectations ? { activiteIds, laboIds } : await fetchAffectations(id);
    res.json({ ...mapGerant(result.rows[0]), ...affectations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/gerants/:id
const remove = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `DELETE FROM utilisateurs WHERE id = $1 AND role = 'gerant' AND gerant_parent_id = $2 RETURNING id`,
      [id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Gérant introuvable' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, create, update, remove };
