/* Pièces jointes d'une facture d'approvisionnement (étape F1 — labflow-reprise/achats-compta/PLAN-FACTURES.md §4).
 *
 *   GET    /api/factures/:id/pieces                      liste (client ; gérant : factures de son périmètre)
 *   GET    /api/factures/:id/pieces/:pieceId/fichier     le fichier (?apercu=1 : la copie JPEG d'une photo HEIC)
 *   POST   /api/factures/:id/pieces                      joindre 1 à 5 fichiers (« pieces », « apercus », « donnees »)
 *   PUT    /api/factures/:id/pieces/:pieceId             remplacer un fichier (l'ancien est effacé)
 *   DELETE /api/factures/:id/pieces/:pieceId             supprimer (définitif : la ligne et le fichier)
 * Seules les factures SAISIES (type_source 'manuel') reçoivent des pièces : une facture de transfert est un document de
 * LabFlow. Le gérant agit sur les factures de ses activités et labos (décision du client, 09/10 : pas de case à cocher).
 * Les fichiers ne sortent que par cette route, après contrôle : type fixé par le serveur, `nosniff`, jamais en cache. */
const pool = require('../config/database');
const { withTransaction } = require('../utils/db');
const stockage = require('../services/stockageFichiers');
const P = require('../services/piecesFacture');
const F = require('../services/facturesAppro');

const CLASSE_VERROU = 4221;

class Refus extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const refus = (status, code, message) => new Refus(status, code, message);
const repondreErreur = (res, err, contexte) => {
  if (err instanceof Refus || err instanceof P.ErreurPiece) return res.status(err.status).json({ code: err.code, message: err.message });
  console.error(`[pieces] ${contexte}`, err);
  return res.status(500).json({ message: 'Erreur serveur' });
};

/** La facture du compte, visible (lecture) ou modifiable (écriture) par la personne ; lève Refus. */
const factureAccessible = async (req, db, { ecriture = false, verrou = false } = {}) => {
  const f = await F.factureDuCompte(db, req.params.id, F.clientDe(req), verrou);
  if (!f || !(ecriture ? F.gerantAgitSur(req, f) : F.gerantVoit(req, f))) throw new Refus(404, 'FACTURE_INTROUVABLE', 'Facture introuvable');
  if (ecriture && f.type_source !== 'manuel') {
    throw refus(409, 'FACTURE_TRANSFERT', 'Une facture de [[nom:transfert]] est un document de LabFlow : elle ne reçoit pas de pièce.');
  }
  return f;
};

const SQL_PIECES = `SELECT p.id, p.ordre, p.cle, p.type_mime, p.taille, p.nom_origine, p.apercu_cle, p.depose_le, u.nom AS depose_par_nom
                    FROM factures_pieces p LEFT JOIN utilisateurs u ON u.id = p.depose_par
                    WHERE p.facture_id = $1 ORDER BY p.ordre`;
const piecesDe = async (db, factureId) => (await db.query(SQL_PIECES, [factureId])).rows.map(P.versApi);

const lister = async (req, res) => {
  try {
    const f = await factureAccessible(req, pool);
    res.json({ factureId: f.id, modifiable: f.type_source === 'manuel' && F.gerantAgitSur(req, f), pieces: await piecesDe(pool, f.id) });
  } catch (err) { repondreErreur(res, err, 'liste'); }
};

const fichier = async (req, res) => {
  try {
    const f = await factureAccessible(req, pool);
    const r = await pool.query('SELECT cle, type_mime, nom_origine, apercu_cle FROM factures_pieces WHERE id = $1 AND facture_id = $2', [Number(req.params.pieceId) || 0, f.id]);
    const p = r.rows[0];
    if (!p) throw new Refus(404, 'PIECE_INTROUVABLE', 'Pièce introuvable');
    const apercu = req.query.apercu === '1' && p.apercu_cle;
    if (!stockage.disponible()) throw new Refus(503, 'STOCKAGE_ABSENT', 'Le stockage des factures n\'est pas configuré.');
    let octets;
    try { octets = await stockage.lire(apercu ? p.apercu_cle : p.cle); } catch (e) {
      console.error('[pieces] lecture :', e.message);
      throw new Refus(503, 'STOCKAGE_INDISPONIBLE', 'Le stockage des factures ne répond pas : réessayez dans un instant.');
    }
    if (!octets) throw new Refus(404, 'FICHIER_ABSENT', 'Le fichier de cette pièce est introuvable dans le stockage.');
    const type = apercu ? 'image/jpeg' : p.type_mime;
    const nom = apercu ? p.nom_origine.replace(/\.[^.]*$/, '') + '.jpg' : p.nom_origine;
    const ascii = nom.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'facture';
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', String(octets.length));
    res.setHeader('Content-Disposition', `${req.query.telecharger === '1' ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nom)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(octets);
  } catch (err) { repondreErreur(res, err, 'fichier'); }
};

const lireApercuDe = (brut) => {
  if (brut == null || brut === '') return [];
  try { const d = JSON.parse(brut); return Array.isArray(d?.apercuDe) ? d.apercuDe : []; } catch (_) {
    throw new Refus(400, 'DONNEES_ILLISIBLES', 'Envoi illisible : réessayez.');
  }
};

const joindre = async (req, res) => {
  const clientId = F.clientDe(req);
  let deposes = [];
  try {
    const f0 = await factureAccessible(req, pool, { ecriture: true });
    const prepares = P.preparer(req.files, lireApercuDe(req.body?.donnees));
    if (!prepares.length) throw new Refus(400, 'FICHIER_REQUIS', 'Choisissez au moins un fichier.');
    if (!stockage.disponible()) throw new Refus(503, 'STOCKAGE_ABSENT', 'Le stockage des factures n\'est pas encore configuré.');
    const deja = (await pool.query('SELECT COUNT(*)::int AS n FROM factures_pieces WHERE facture_id = $1', [f0.id])).rows[0].n;
    if (deja + prepares.length > P.PIECES_MAX) throw new Refus(409, 'TROP_DE_PIECES', `Cette facture a déjà ${deja} pièce(s) : ${P.PIECES_MAX} au plus.`);
    deposes = await P.deposerTout(clientId, prepares);
    const pieces = await withTransaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock($1, $2)', [CLASSE_VERROU, clientId]);
      const f = await factureAccessible(req, db, { ecriture: true, verrou: true });
      const etat = (await db.query('SELECT COUNT(*)::int AS n, COALESCE(MAX(ordre), 0)::int AS dernier FROM factures_pieces WHERE facture_id = $1', [f.id])).rows[0];
      if (etat.n + deposes.length > P.PIECES_MAX) throw new Refus(409, 'TROP_DE_PIECES', `Cette facture a déjà ${etat.n} pièce(s) : ${P.PIECES_MAX} au plus.`);
      await P.inserer(db, { factureId: f.id, clientId, deposes, ordreDepart: etat.dernier + 1, auteurId: req.user.id });
      await P.journaliser(db, { clientId, factureId: f.id, action: 'piece_jointe', auteurId: req.user.id, details: { pieces: deposes.map(P.resumePiece) } });
      return piecesDe(db, f.id);
    });
    deposes = [];
    res.status(201).json({ factureId: f0.id, pieces });
  } catch (err) {
    if (deposes.length) await P.effacerDeposes(deposes, 'pièce non enregistrée');
    repondreErreur(res, err, 'joindre');
  }
};

const remplacer = async (req, res) => {
  const clientId = F.clientDe(req);
  let deposes = [];
  try {
    await factureAccessible(req, pool, { ecriture: true });
    const prepares = P.preparer(req.files, lireApercuDe(req.body?.donnees));
    if (prepares.length !== 1) throw new Refus(400, 'UN_FICHIER', 'Choisissez un seul fichier pour remplacer cette pièce.');
    if (!stockage.disponible()) throw new Refus(503, 'STOCKAGE_ABSENT', 'Le stockage des factures n\'est pas encore configuré.');
    deposes = await P.deposerTout(clientId, prepares);
    const { pieces, anciens } = await withTransaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock($1, $2)', [CLASSE_VERROU, clientId]);
      const f = await factureAccessible(req, db, { ecriture: true, verrou: true });
      const avant = (await db.query('SELECT id, cle, apercu_cle, nom_origine, type_mime, taille, empreinte FROM factures_pieces WHERE id = $1 AND facture_id = $2 FOR UPDATE', [Number(req.params.pieceId) || 0, f.id])).rows[0];
      if (!avant) throw new Refus(404, 'PIECE_INTROUVABLE', 'Pièce introuvable');
      const d = deposes[0];
      await db.query(
        `UPDATE factures_pieces SET cle = $2, type_mime = $3, taille = $4, empreinte = $5, nom_origine = $6, apercu_cle = $7,
                apercu_taille = $8, depose_par = $9, depose_le = NOW() WHERE id = $1`,
        [avant.id, d.cle, d.type, d.octets.length, d.empreinte, d.nom, d.apercuCle, d.apercuCle ? d.apercu.length : null, req.user.id]
      );
      await P.journaliser(db, { clientId, factureId: f.id, action: 'piece_remplacee', auteurId: req.user.id, details: { avant: P.resumePiece(avant), apres: P.resumePiece(d) } });
      return { pieces: await piecesDe(db, f.id), anciens: [avant] };
    });
    deposes = [];
    await P.effacerDeposes(anciens, 'pièce remplacée');
    res.json({ factureId: Number(req.params.id), pieces });
  } catch (err) {
    if (deposes.length) await P.effacerDeposes(deposes, 'remplacement non enregistré');
    repondreErreur(res, err, 'remplacer');
  }
};

const supprimer = async (req, res) => {
  const clientId = F.clientDe(req);
  try {
    await factureAccessible(req, pool, { ecriture: true });
    const { pieces, retiree } = await withTransaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock($1, $2)', [CLASSE_VERROU, clientId]);
      const f = await factureAccessible(req, db, { ecriture: true, verrou: true });
      const p = (await db.query('DELETE FROM factures_pieces WHERE id = $1 AND facture_id = $2 RETURNING id, ordre, cle, apercu_cle, nom_origine, type_mime, taille, empreinte', [Number(req.params.pieceId) || 0, f.id])).rows[0];
      if (!p) throw new Refus(404, 'PIECE_INTROUVABLE', 'Pièce introuvable');
      await db.query('UPDATE factures_pieces SET ordre = ordre - 1 WHERE facture_id = $1 AND ordre > $2', [f.id, p.ordre]);
      await P.journaliser(db, { clientId, factureId: f.id, action: 'piece_supprimee', auteurId: req.user.id, details: P.resumePiece(p) });
      return { pieces: await piecesDe(db, f.id), retiree: p };
    });
    await P.effacerDeposes([retiree], 'pièce supprimée');
    res.json({ factureId: Number(req.params.id), pieces });
  } catch (err) { repondreErreur(res, err, 'supprimer'); }
};

module.exports = { lister, fichier, joindre, remplacer, supprimer };
