// Canaux de vente (étape C1 — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.2) : la grille « Configuration
// vente » enregistre ses cellules (prix, case « en vente ») canal par canal, et copie un canal vers un autre.
// Règles pures : src/utils/canauxVente.js ; base : src/services/canauxVente.js.
const pool = require('../config/database');
const CV = require('../utils/canauxVente');
const canaux = require('../services/canauxVente');

const clientIdOf = (req) => req.user.gerant_parent_id || req.user.id;

/** L'activité est-elle du compte, et vend-elle ? Mêmes contrôles que les articles vendables (ventesController). */
async function exigerActivite(activiteId, clientId) {
  const id = Number(activiteId);
  if (!Number.isInteger(id) || id <= 0) throw new CV.ErreurCanal(400, 'ACTIVITE_REQUISE', 'activite_id requis.');
  const r = await pool.query(
    `SELECT pe.client_id, uo.vente_active
       FROM activites a
       JOIN profil_entreprise pe ON pe.id = a.entreprise_id
       LEFT JOIN unites_operationnelles uo ON uo.activite_id = a.id
      WHERE a.id = $1`,
    [id]
  );
  if (!r.rows.length || String(r.rows[0].client_id) !== String(clientId)) throw new CV.ErreurCanal(403, 'ACCES_REFUSE', 'Accès refusé');
  if (r.rows[0].vente_active === false) {
    throw new CV.ErreurCanal(400, 'VENTE_INACTIVE', '[[Le:vente]] est [[acc:vente:désactivé:désactivée]] pour [[ce:activite]].');
  }
  return id;
}

const repondreErreur = (res, e) => {
  if (e instanceof CV.ErreurCanal || e.status) return res.status(e.status).json({ code: e.code, message: e.message });
  return res.status(500).json({ message: e.message });
};

/** Une transaction autour de `travail(db)`. */
async function enTransaction(travail) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const resultat = await travail(db);
    await db.query('COMMIT');
    return resultat;
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}

// PUT /api/canaux-vente — { activite_id, cellules: [{ article_type, article_id, canal, prix?, en_vente? }] }
// Tout ou rien : une cellule refusée (prix manquant pour cocher, canal inconnu…) annule l'envoi entier.
const modifier = async (req, res) => {
  try {
    const clientId = clientIdOf(req);
    const activiteId = await exigerActivite(req.body?.activite_id, clientId);
    const cellules = CV.lireCellules(req.body?.cellules);
    const modifiees = await enTransaction((db) => canaux.modifierCellules(db, { activiteId, clientId, userId: req.user.id, cellules }));
    res.json({ success: true, modifiees });
  } catch (e) {
    repondreErreur(res, e);
  }
};

// POST /api/canaux-vente/copier — { activite_id, source, cible, majoration_pct?, arrondi?, retirer_absents? }
const copier = async (req, res) => {
  try {
    const clientId = clientIdOf(req);
    const activiteId = await exigerActivite(req.body?.activite_id, clientId);
    const reglages = CV.lireCopie(req.body);
    const bilan = await enTransaction((db) => canaux.copier(db, { activiteId, userId: req.user.id, ...reglages }));
    res.json({ success: true, ...bilan });
  } catch (e) {
    repondreErreur(res, e);
  }
};

module.exports = { modifier, copier };
