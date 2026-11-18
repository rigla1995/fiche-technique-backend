// Import d'un fichier de caisse (étape V1a — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis).
// Le navigateur lit l'export de la caisse (Excel, PDF), l'utilisateur vérifie chaque ligne dans la fenêtre « Vérifier
// les ventes », puis l'écran envoie le résultat ici. Le serveur revérifie tout et crée les ventes de la journée.
// Règles pures : src/utils/ventesImport.js ; base : src/services/ventesImport.js. Droits : ceux de la saisie des ventes
// (compte et gérants).
const pool = require('../config/database');
const VI = require('../utils/ventesImport');
const ventesImport = require('../services/ventesImport');
const { getReglesForClient } = require('../services/domaineProfilService');

const clientIdOf = (req) => req.user.gerant_parent_id || req.user.id;

/**
 * L'activité est-elle du compte, vend-elle, et l'import de caisse est-il proposé à ce compte (règle de domaine
 * « caisse ») ? Mêmes contrôles que la saisie des ventes.
 */
async function exigerActivite(activiteId, clientId) {
  const id = Number(activiteId);
  if (!Number.isInteger(id) || id <= 0) throw new VI.ErreurImport(400, 'ACTIVITE_REQUISE', 'activite_id requis.');
  const r = await pool.query(
    `SELECT pe.client_id, uo.vente_active
       FROM activites a
       JOIN profil_entreprise pe ON pe.id = a.entreprise_id
       LEFT JOIN unites_operationnelles uo ON uo.activite_id = a.id
      WHERE a.id = $1`,
    [id]
  );
  if (!r.rows.length || String(r.rows[0].client_id) !== String(clientId)) throw new VI.ErreurImport(403, 'ACCES_REFUSE', 'Accès refusé');
  if (r.rows[0].vente_active === false) {
    throw new VI.ErreurImport(400, 'VENTE_INACTIVE', '[[Le:vente]] est [[acc:vente:désactivé:désactivée]] pour [[ce:activite]].');
  }
  const regles = await getReglesForClient(clientId);
  if (regles.caisse === false) {
    throw new VI.ErreurImport(403, 'CAISSE_DESACTIVEE', "L'import d'un fichier de caisse n'est pas proposé à ce compte (règle du domaine).");
  }
  return id;
}

const repondreErreur = (res, e) => {
  if (e instanceof VI.ErreurImport || e.status) return res.status(e.status).json({ code: e.code, message: e.message });
  return res.status(500).json({ message: e.message });
};

// GET /api/ventes/imports/contexte?activiteId= — correspondances apprises, catégories, journées déjà importées.
const contexte = async (req, res) => {
  try {
    const activiteId = await exigerActivite(req.query.activiteId, clientIdOf(req));
    res.json(await ventesImport.contexte(pool, activiteId));
  } catch (e) {
    repondreErreur(res, e);
  }
};

// POST /api/ventes/imports — { activite_id, date_vente, source, fichier_nom, empreinte, modele?, total_lu?,
//   categories: [{ nom, livraison }],
//   lignes: [{ categorie, designation, quantite, montant, ignoree?, article_type, article_id, repartition: [{ canal, quantite }] }] }
// Tout ou rien : une ligne refusée (produit hors canal, répartition fausse, journée déjà importée…) annule l'import.
const creer = async (req, res) => {
  const db = await pool.connect();
  try {
    const clientId = clientIdOf(req);
    const activiteId = await exigerActivite(req.body?.activite_id, clientId);
    const donnees = VI.lireImport(req.body);
    await db.query('BEGIN');
    const resultat = await ventesImport.enregistrer(db, { clientId, userId: req.user.id, activiteId, donnees });
    await db.query('COMMIT');
    res.status(201).json({ success: true, ...resultat });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    repondreErreur(res, e);
  } finally {
    db.release();
  }
};

module.exports = { contexte, creer };
