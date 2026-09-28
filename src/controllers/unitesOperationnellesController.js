// Unités opérationnelles (lot 1b, spec §3.2) — /api/entreprise/unites
//   GET  /            client → toutes les unités de l'entreprise ; gérant → unités de son périmètre
//                     (gerantActiviteIds ∪ gerantLaboIds) + leurs sources en lecture.
//   PUT  /:id         { composantId?, sourceUniteId?, venteActive?, productionActive? } — client seul
//                     (requireClientOwner) ; unité inexistante OU d'une autre entreprise → 404 ;
//                     400 : CYCLE_INTERDIT, SOURCE_NON_LABO, ENTREPRISE_DIFFERENTE, COMPOSANT_INVALIDE.
// ⚠️ Rien à voir avec /api/unites (unités de MESURE, table `unites`).
const pool = require('../config/database');
const { withTransaction } = require('../utils/db');
const unitesOp = require('../services/unitesOperationnellesService');

async function entrepriseIdOf(req) {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const r = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [clientId]);
  return r.rows[0]?.id ?? null;
}

function replyUniteError(res, err) {
  if (unitesOp.isUniteError(err)) {
    res.status(err.status || 400).json({ code: err.code, message: err.message });
    return true;
  }
  const mapped = unitesOp.mapPgError(err);
  if (mapped) {
    res.status(400).json({ code: mapped.code, message: mapped.message });
    return true;
  }
  return false;
}

const list = async (req, res) => {
  try {
    const entrepriseId = await entrepriseIdOf(req);
    if (!entrepriseId) return res.json([]);
    const scopeGerant = req.user.role === 'gerant'
      ? { activiteIds: req.user.gerantActiviteIds || [], laboIds: req.user.gerantLaboIds || [] }
      : null;
    res.json(await unitesOp.listUnites(pool, entrepriseId, { scopeGerant }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const update = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ message: 'Unité introuvable' });
  const { composantId, sourceUniteId, venteActive, productionActive } = req.body || {};
  try {
    const entrepriseId = await entrepriseIdOf(req);
    if (!entrepriseId) return res.status(404).json({ message: 'Unité introuvable' });
    const unite = await unitesOp.getUnite(pool, id);
    // Autre entreprise → 404 (jamais 403 : ne pas révéler l'existence).
    if (!unite || unite.entrepriseId !== entrepriseId) return res.status(404).json({ message: 'Unité introuvable' });

    let srcId;
    if (sourceUniteId !== undefined) {
      srcId = sourceUniteId === null || sourceUniteId === '' ? null : parseInt(sourceUniteId, 10);
      if (srcId !== null && (!Number.isInteger(srcId) || srcId <= 0)) {
        return res.status(400).json({ code: 'ENTREPRISE_DIFFERENTE', message: unitesOp.CODES.ENTREPRISE_DIFFERENTE });
      }
    }
    // Ordre : composant (pose les flags du composant) PUIS flags explicites PUIS source — dans UNE
    // transaction : un 400 (cycle, composant…) ne laisse ni composant ni flags à moitié modifiés.
    await withTransaction(async (client) => {
      if (composantId !== undefined && composantId !== null) {
        await unitesOp.setComposant(client, id, composantId);
      }
      if (typeof venteActive === 'boolean' || typeof productionActive === 'boolean') {
        await unitesOp.setFlags(client, id, { venteActive, productionActive });
      }
      if (sourceUniteId !== undefined) {
        await unitesOp.setSource(client, id, srcId);
      }
    });
    res.json(await unitesOp.getUnite(pool, id));
  } catch (err) {
    if (replyUniteError(res, err)) return;
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, update };
