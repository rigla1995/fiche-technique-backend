/* Module « Livreurs », étape L3 — la livraison sur le téléphone du livreur et ses suites
 * (labflow-reprise/livreurs/PLAN-LIVREURS.md, migration 253).
 *
 *   POST /api/livreur/commandes/:id/livree   multipart : « facture » (photo ou PDF de la facture signée / cachetée,
 *                                             OBLIGATOIRE), « apercu » (copie JPEG d'une photo HEIC), champs
 *                                             receptionnaire, montantPercu, modePaiementId (si le compte encaisse)
 *   POST /api/livreur/commandes/:id/echec    { motif, note, rapporteeDepot }
 *   POST /api/acheteurs/commandes/:id/relancer   { livreurId? }  — client / gérant : nouvelle tentative après un échec
 *   GET  /api/acheteurs/commandes/:id/livraison/piece   et   GET /api/portail/commandes/:id/livraison/piece
 *   PUT  /api/livreurs/options   { encaissement }
 *
 * Chaque passage du livreur est une ligne de `commande_livraisons` (la dernière fait foi). Le fichier est déposé AVANT la
 * transaction qui l'enregistre et effacé si elle échoue ; il ne ressort que par ces routes (type fixé par le serveur,
 * nosniff, jamais en cache — même règle que les pièces des factures d'appro). */
const multer = require('multer');
const pool = require('../config/database');
const stockage = require('../services/stockageFichiers');
const P = require('../services/piecesFacture');
const L = require('../services/livraisons');
const { gerantAllowsLabo } = require('../middleware/auth');
const { pushTo } = require('../services/sseService');
const { saveNotification } = require('./notificationController');
const { servirPiece } = require('./piecesController');
const { resoudreLivreur } = require('./acheteurVentesController');

const NOTE_MIN = 3;
const APERCU_MAX = 5 * 1024 * 1024;
const CORPS_MAX = P.OCTETS_MAX + APERCU_MAX + 256 * 1024;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const today = () => new Date().toISOString().slice(0, 10);
const clientIdOf = (req) => req.user.gerant_parent_id || req.user.id;

class Refus extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const repondre = (res, err, contexte) => {
  if (err instanceof Refus || err instanceof P.ErreurPiece) return res.status(err.status).json({ code: err.code, message: err.message });
  console.error(`[livraisons] ${contexte}`, err);
  return res.status(500).json({ message: 'Erreur serveur' });
};

// ── Réception du fichier (une facture signée, une copie JPEG au plus) ─────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: P.OCTETS_MAX, files: 2, fields: 8, fieldSize: 64 * 1024 },
});
const televersement = (req, res, next) => {
  const annonce = Number(req.headers['content-length']);
  if (Number.isFinite(annonce) && annonce > CORPS_MAX) {
    return res.status(413).json({ code: 'ENVOI_TROP_GROS', message: 'Photo trop lourde : 15 Mo au plus.' });
  }
  return upload.fields([{ name: 'facture', maxCount: 1 }, { name: 'apercu', maxCount: 1 }])(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ code: 'FICHIER_TROP_GROS', message: 'Photo trop lourde : 15 Mo au plus.' });
    if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ code: 'CHAMP_INATTENDU', message: 'Envoi illisible : une seule facture signée par livraison.' });
    }
    return res.status(400).json({ code: 'ENVOI_ILLISIBLE', message: 'Envoi illisible : réessayez.' });
  });
};

// ── La commande du livreur, encore à livrer ───────────────────────────────────────────────────────────────────────────
const commandeDuLivreur = async (db, req, { verrou = false } = {}) => {
  if (!UUID_RE.test(String(req.params.id))) throw new Refus(404, 'COMMANDE_INTROUVABLE', 'Commande introuvable');
  const r = await db.query(
    `SELECT ca.*, lv.nom AS livreur_nom, COALESCE(ach.nom, ca.acheteur_nom) AS acheteur_nom, fa.numero AS facture_numero
       FROM commandes_acheteur ca
       JOIN livreurs lv ON lv.id = ca.livreur_id
       LEFT JOIN acheteurs ach ON ach.id = ca.acheteur_id
       LEFT JOIN factures_acheteur fa ON fa.commande_id = ca.id
      WHERE ca.id = $1 AND ca.livreur_id = $2 ${verrou ? 'FOR UPDATE OF ca' : ''}`,
    [req.params.id, req.user.livreurId]
  );
  const c = r.rows[0];
  if (!c) throw new Refus(404, 'COMMANDE_INTROUVABLE', 'Commande introuvable');
  if (c.statut !== 'expediee') {
    const message = c.statut === 'livree' ? 'Cette commande est déjà livrée'
      : c.statut === 'livraison_echouee' ? 'Cette livraison a déjà été déclarée non livrée : attendez la décision de votre responsable'
        : 'Cette commande n\'est plus à livrer';
    throw new Refus(409, 'STATUT_INCOMPATIBLE', message);
  }
  return c;
};

/** Prévient le compte (et la personne qui avait confié la commande) : temps réel + notification persistée, best-effort. */
const notifier = (cmd, eventType, statut, notesAdmin) => {
  const payload = { eventType, type: 'livraison', clientNom: cmd.acheteur_nom, statut, notesAdmin, refKind: 'commande_acheteur' };
  for (const userId of new Set([cmd.client_id, cmd.livraison_affectee_par].filter(Boolean))) {
    try { pushTo(userId, eventType, payload); } catch { /* best-effort */ }
    saveNotification(userId, payload).catch(console.error);
  }
};

// ── POST /api/livreur/commandes/:id/livree ────────────────────────────────────────────────────────────────────────────
const livree = async (req, res) => {
  let depose = null;
  try {
    const avant = await commandeDuLivreur(pool, req); // refus rapide, avant de toucher au stockage
    const fichiers = req.files || {};
    const f = (fichiers.facture || [])[0];
    if (!f || !f.buffer || f.buffer.length === 0) {
      throw new Refus(400, 'FACTURE_REQUISE', 'Photographiez la facture signée ou cachetée par le client : c\'est elle qui valide la livraison.');
    }
    const type = P.detecterType(f.buffer);
    if (!type) throw new Refus(400, 'TYPE_REFUSE', 'Le fichier n\'est ni une photo (JPEG, PNG, WebP, HEIC) ni un PDF.');
    const nom = P.nomSur(f.originalname || 'facture-signee');
    let apercu = null;
    const a = (fichiers.apercu || [])[0];
    if (a && a.buffer && a.buffer.length) {
      if (!P.AVEC_APERCU.has(type)) throw new Refus(400, 'APERCU_SANS_ORIGINAL', 'Copie d\'affichage sans photo d\'origine.');
      if (P.detecterType(a.buffer) !== 'image/jpeg') throw new Refus(400, 'APERCU_ILLISIBLE', 'La copie d\'affichage n\'est pas une image JPEG.');
      if (a.buffer.length > APERCU_MAX) throw new Refus(413, 'APERCU_TROP_GROS', 'La copie d\'affichage est trop lourde : 5 Mo au plus.');
      apercu = a.buffer;
    }
    const receptionnaire = String(req.body?.receptionnaire || '').trim().slice(0, 150) || null;
    // Encaissement : seulement si le compte l'a activé ; montant obligatoire (0 admis), mode obligatoire dès qu'il y a un montant.
    const encaissement = await L.encaissementDe(pool, avant.client_id);
    let montantPercu = null;
    let modePaiementId = null;
    if (encaissement) {
      const brut = req.body?.montantPercu;
      const m = brut == null || brut === '' ? NaN : Number(String(brut).replace(',', '.'));
      if (!Number.isFinite(m) || m < 0 || m > 999999999) throw new Refus(400, 'MONTANT_REQUIS', 'Indiquez le montant perçu (0 si rien n\'a été encaissé).');
      montantPercu = Math.round(m * 1000) / 1000;
      if (montantPercu > 0) {
        const id = Number(req.body?.modePaiementId);
        const mode = Number.isInteger(id) ? (await pool.query('SELECT id FROM modes_paiement WHERE id = $1 AND actif = true', [id])).rows[0] : null;
        if (!mode) throw new Refus(400, 'MODE_PAIEMENT_REQUIS', 'Choisissez le mode de paiement.');
        modePaiementId = mode.id;
      }
    }
    if (!stockage.disponible()) throw new Refus(503, 'STOCKAGE_ABSENT', 'Le stockage des pièces n\'est pas configuré : prévenez votre responsable.');

    // Dépôt avant la transaction (effacé si elle échoue)
    const cle = stockage.nouvelleCle(avant.client_id, P.EXTENSIONS[type], '-livraison');
    let apercuCle = null;
    try {
      await stockage.deposer(cle, f.buffer, type);
      depose = { cle, apercuCle: null };
      if (apercu) {
        apercuCle = stockage.nouvelleCle(avant.client_id, 'jpg', '-livraison-apercu');
        await stockage.deposer(apercuCle, apercu, 'image/jpeg');
        depose.apercuCle = apercuCle;
      }
    } catch (e) {
      await stockage.supprimerSansErreur([cle, apercuCle], 'livraison : dépôt interrompu');
      depose = null;
      console.error('[livraisons] dépôt :', e.message);
      throw new Refus(503, 'STOCKAGE_INDISPONIBLE', 'Le stockage ne répond pas : réessayez dans un instant.');
    }

    const db = await pool.connect();
    let cmd;
    const jour = today();
    try {
      await db.query('BEGIN');
      cmd = await commandeDuLivreur(db, req, { verrou: true });
      await db.query(
        `INSERT INTO commande_livraisons
           (commande_id, client_id, livreur_id, livreur_nom, resultat, receptionnaire, montant_percu, mode_paiement_id,
            piece_cle, piece_type, piece_taille, piece_nom, piece_empreinte, apercu_cle)
         VALUES ($1, $2, $3, $4, 'livree', $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [cmd.id, cmd.client_id, cmd.livreur_id, cmd.livreur_nom, receptionnaire, montantPercu, modePaiementId,
          cle, type, f.buffer.length, nom, P.empreinte(f.buffer), apercuCle]
      );
      await db.query(
        `UPDATE commandes_acheteur SET statut = 'livree', date_livraison = $2, livraison_rapportee = false WHERE id = $1`,
        [cmd.id, jour]
      );
      await db.query(
        `INSERT INTO commande_acheteur_statuts (commande_id, statut, date_effet, motif, created_by) VALUES ($1, 'livree', $2, $3, $4)`,
        [cmd.id, jour, receptionnaire ? `Réceptionné par ${receptionnaire}` : null, req.user.id]
      );
      await db.query('COMMIT');
      depose = null;
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      db.release();
    }
    notifier(cmd, 'livraison_validee', 'livree', `livrée par ${cmd.livreur_nom}${cmd.facture_numero ? ` · ${cmd.facture_numero}` : ''}${montantPercu != null && montantPercu > 0 ? ` · ${montantPercu.toFixed(3)} DT encaissés` : ''}`);
    res.json({ commande: { id: cmd.id, statut: 'livree', dateLivraison: jour }, encaissement, montantPercu });
  } catch (err) {
    if (depose) await stockage.supprimerSansErreur([depose.cle, depose.apercuCle], 'livraison : transaction échouée');
    repondre(res, err, 'livree');
  }
};

// ── POST /api/livreur/commandes/:id/echec ─────────────────────────────────────────────────────────────────────────────
const echec = async (req, res) => {
  const db = await pool.connect();
  try {
    const motif = String(req.body?.motif || '');
    if (!L.MOTIFS[motif]) throw new Refus(400, 'MOTIF_REQUIS', 'Choisissez le motif : client absent, adresse introuvable, refus, marchandise abîmée ou autre.');
    const note = String(req.body?.note || '').trim();
    if (note.length < NOTE_MIN) throw new Refus(400, 'NOTE_REQUISE', 'Écrivez une note : elle explique à votre responsable ce qui s\'est passé.');
    if (typeof req.body?.rapporteeDepot !== 'boolean') throw new Refus(400, 'RAPPORTEE_REQUISE', 'Précisez si la marchandise est rapportée [[au:depot]].');
    const rapportee = req.body.rapporteeDepot;
    await db.query('BEGIN');
    const cmd = await commandeDuLivreur(db, req, { verrou: true });
    const jour = today();
    await db.query(
      `INSERT INTO commande_livraisons (commande_id, client_id, livreur_id, livreur_nom, resultat, motif, note, rapportee_depot)
       VALUES ($1, $2, $3, $4, 'echec', $5, $6, $7)`,
      [cmd.id, cmd.client_id, cmd.livreur_id, cmd.livreur_nom, motif, note.slice(0, 2000), rapportee]
    );
    await db.query(`UPDATE commandes_acheteur SET statut = 'livraison_echouee', livraison_rapportee = $2 WHERE id = $1`, [cmd.id, rapportee]);
    await db.query(
      `INSERT INTO commande_acheteur_statuts (commande_id, statut, date_effet, motif, created_by) VALUES ($1, 'livraison_echouee', $2, $3, $4)`,
      [cmd.id, jour, `${L.MOTIFS[motif]} — ${note.slice(0, 500)}${rapportee ? ' (marchandise rapportée au dépôt)' : ''}`, req.user.id]
    );
    await db.query('COMMIT');
    notifier(cmd, 'livraison_echouee', 'livraison_echouee', `${L.MOTIFS[motif]} · ${cmd.livreur_nom}${rapportee ? ' · marchandise rapportée au dépôt' : ''}`);
    res.json({ commande: { id: cmd.id, statut: 'livraison_echouee', rapporteeDepot: rapportee } });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    repondre(res, err, 'echec');
  } finally {
    db.release();
  }
};

// ── POST /api/acheteurs/commandes/:id/relancer — client / gérant : nouvelle tentative ────────────────────────────────
// { livreurId } présent → ce livreur (null = sans livreur) ; absent → le livreur actuel (qui doit être actif).
const relancer = async (req, res) => {
  const clientId = clientIdOf(req);
  const db = await pool.connect();
  try {
    if (!UUID_RE.test(String(req.params.id))) throw new Refus(404, 'COMMANDE_INTROUVABLE', 'Commande introuvable');
    const changeLivreur = !!req.body && Object.prototype.hasOwnProperty.call(req.body, 'livreurId');
    let livreur = null;
    if (changeLivreur) {
      const r = await resoudreLivreur(pool, clientId, req.body.livreurId);
      if (r.refus) return res.status(r.refus.status).json(r.refus.body);
      livreur = r.livreur;
    }
    await db.query('BEGIN');
    const c = await db.query('SELECT ca.* FROM commandes_acheteur ca WHERE ca.id = $1 AND ca.client_id = $2 FOR UPDATE', [req.params.id, clientId]);
    const cmd = c.rows[0];
    if (!cmd) throw new Refus(404, 'COMMANDE_INTROUVABLE', 'Commande introuvable');
    if (cmd.statut !== 'livraison_echouee') throw new Refus(409, 'STATUT_INCOMPATIBLE', `Seule une commande non livrée se relance (statut : ${cmd.statut})`);
    if (!gerantAllowsLabo(req, cmd.labo_id)) throw new Refus(403, 'HORS_PERIMETRE', '[[Nom:labo]] hors de votre périmètre');
    if (!changeLivreur && cmd.livreur_id) {
      const actuel = (await db.query('SELECT id, nom, actif FROM livreurs WHERE id = $1', [cmd.livreur_id])).rows[0];
      if (!actuel) livreur = null;
      else if (actuel.actif === false) throw new Refus(409, 'LIVREUR_INACTIF', `Le livreur ${actuel.nom} est désactivé : choisissez-en un autre ou relancez sans livreur`);
      else livreur = actuel;
    }
    const jour = today();
    // Marchandise rapportée : elle ressort aujourd'hui (date d'expédition du jour) ; sinon la sortie d'origine reste datée.
    if (changeLivreur) {
      await db.query(
        `UPDATE commandes_acheteur
            SET statut = 'expediee', date_expedition = CASE WHEN livraison_rapportee THEN $2::date ELSE date_expedition END,
                livraison_rapportee = false, livreur_id = $3,
                livraison_affectee_at = CASE WHEN $3::int IS NULL THEN NULL ELSE NOW() END,
                livraison_affectee_par = CASE WHEN $3::int IS NULL THEN NULL ELSE $4::int END
          WHERE id = $1`,
        [cmd.id, jour, livreur ? livreur.id : null, req.user.id]
      );
    } else {
      await db.query(
        `UPDATE commandes_acheteur
            SET statut = 'expediee', date_expedition = CASE WHEN livraison_rapportee THEN $2::date ELSE date_expedition END,
                livraison_rapportee = false
          WHERE id = $1`,
        [cmd.id, jour]
      );
    }
    await db.query(
      `INSERT INTO commande_acheteur_statuts (commande_id, statut, date_effet, motif, created_by) VALUES ($1, 'expediee', $2, 'Nouvelle tentative de livraison', $3)`,
      [cmd.id, jour, req.user.id]
    );
    await db.query('COMMIT');
    res.json({ commande: { id: cmd.id, statut: 'expediee', livreurId: livreur ? livreur.id : null, livreurNom: livreur ? livreur.nom : null } });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    repondre(res, err, 'relancer');
  } finally {
    db.release();
  }
};

// ── La facture signée ─────────────────────────────────────────────────────────────────────────────────────────────────
// GET /api/acheteurs/commandes/:id/livraison/piece (client / gérant dans son périmètre)
const pieceVendeur = async (req, res) => {
  try {
    if (!UUID_RE.test(String(req.params.id))) throw new Refus(404, 'COMMANDE_INTROUVABLE', 'Commande introuvable');
    const c = (await pool.query('SELECT id, labo_id FROM commandes_acheteur WHERE id = $1 AND client_id = $2', [req.params.id, clientIdOf(req)])).rows[0];
    if (!c || (c.labo_id != null && !gerantAllowsLabo(req, c.labo_id))) throw new Refus(404, 'COMMANDE_INTROUVABLE', 'Commande introuvable');
    const p = await L.dernierePiece(pool, c.id);
    if (!p) throw new Refus(404, 'PIECE_ABSENTE', 'Aucune facture signée sur cette commande');
    await servirPiece(req, res, p);
  } catch (err) { repondre(res, err, 'pieceVendeur'); }
};

// GET /api/portail/commandes/:id/livraison/piece (l'acheteur de la commande)
const piecePortail = async (req, res) => {
  try {
    if (!UUID_RE.test(String(req.params.id))) throw new Refus(404, 'COMMANDE_INTROUVABLE', 'Commande introuvable');
    const c = (await pool.query('SELECT id FROM commandes_acheteur WHERE id = $1 AND acheteur_id = $2', [req.params.id, req.user.acheteurId])).rows[0];
    if (!c) throw new Refus(404, 'COMMANDE_INTROUVABLE', 'Commande introuvable');
    const p = await L.dernierePiece(pool, c.id);
    if (!p) throw new Refus(404, 'PIECE_ABSENTE', 'Aucune facture signée sur cette commande');
    await servirPiece(req, res, p);
  } catch (err) { repondre(res, err, 'piecePortail'); }
};

// ── PUT /api/livreurs/options — { encaissement } ──────────────────────────────────────────────────────────────────────
const options = async (req, res) => {
  try {
    if (typeof req.body?.encaissement !== 'boolean') return res.status(400).json({ code: 'ENCAISSEMENT_INVALIDE', message: 'encaissement : vrai ou faux' });
    const r = await pool.query(
      `UPDATE abonnement_config ac SET livreurs_encaissement = $2
         FROM abonnements a
        WHERE ac.abonnement_id = a.id AND a.id = (SELECT id FROM abonnements WHERE client_id = $1 ORDER BY id DESC LIMIT 1)
        RETURNING ac.livreurs_encaissement`,
      [clientIdOf(req), req.body.encaissement]
    );
    if (!r.rows.length) return res.status(404).json({ code: 'SANS_ABONNEMENT', message: 'Aucun abonnement configuré sur ce compte' });
    res.json({ encaissement: r.rows[0].livreurs_encaissement === true });
  } catch (err) { repondre(res, err, 'options'); }
};

module.exports = { televersement, livree, echec, relancer, pieceVendeur, piecePortail, options };
