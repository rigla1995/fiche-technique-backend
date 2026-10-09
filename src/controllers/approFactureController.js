/* POST /api/appros/facture — une facture d'approvisionnement enregistrée D'UN SEUL COUP (étape F1 —
 * labflow-reprise/achats-compta/PLAN-FACTURES.md §3 constats 2, 3, 6 ; §4 « La pièce »).
 *
 * Remplace, pour la saisie en grille, les requêtes « une par article » (PUT /api/stock/entreprise/:a/:i et
 * PUT /api/labo/:l/stock/:i, gardées pour compatibilité) : toutes les lignes et les pièces jointes, ou rien.
 * Corps multipart : champ « donnees » (JSON), fichiers « pieces » (0 à 5) et « apercus » (copies JPEG des photos HEIC).
 *   donnees = { cible: { type: 'activite' | 'labo', id }, dateAppro, fournisseurId, refFacture, timbreFiscal,
 *               lignes: [{ articleId, quantite, prixUnitaire, tauxTva }], apercuDe: [rang de l'original], confirmerDoublon }
 * Règles :
 *   • même réf., même jour, même fournisseur, même activité / labo qu'une facture saisie ⇒ les lignes s'ajoutent à cette
 *     facture (comme avant) ; le timbre ne s'enlève jamais d'une facture qui l'a ;
 *   • une facture du même fournisseur avec le même numéro (majuscules et espaces ignorés) existe déjà ⇒ 409
 *     FACTURE_EXISTANTE avec la liste, sauf `confirmerDoublon` (avertissement, pas un refus : saisie à la main) ;
 *   • l'activité / le labo, les articles et le fournisseur doivent être ceux du compte ; un gérant n'agit que sur ses
 *     activités et labos ;
 *   • montants de la facture recalculés depuis ses lignes ; TTC d'une ligne = arrondi au millime de PU HT × (1 + TVA).
 * Réponse 201 : { factureId, ajoutee, nbLignes, nbPieces }. */
const pool = require('../config/database');
const { withTransaction } = require('../utils/db');
const stockage = require('../services/stockageFichiers');
const P = require('../services/piecesFacture');
const F = require('../services/facturesAppro');

const LIGNES_MAX = 300;
const VALEUR_MAX = 9999999.999; // DECIMAL(10,3)
const REF_MAX = 100;
// Verrou consultatif des écritures de factures d'un compte (classe, compte).
const CLASSE_VERROU = 4221;

class Refus extends Error {
  constructor(status, corps) { super(corps.message); this.status = status; this.corps = corps; }
}
const refus = (status, code, message, extra = {}) => new Refus(status, { code, message, ...extra });

const dateValide = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  // Pas de date à venir (un jour de marge pour le décalage horaire de Tunis), pas avant 2000.
  const demain = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  return s >= '2000-01-01' && s <= demain;
};
const nombre = (v) => (typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN));

/** Lit et contrôle `donnees`. → valeurs propres ; lève Refus (400). */
const lireDonnees = (brut) => {
  let d;
  try { d = typeof brut === 'string' ? JSON.parse(brut) : brut; } catch (_) { d = null; }
  if (!d || typeof d !== 'object') throw refus(400, 'DONNEES_ILLISIBLES', 'Envoi illisible : réessayez.');
  const type = d.cible?.type;
  const cibleId = Number(d.cible?.id);
  if (!['activite', 'labo'].includes(type) || !Number.isInteger(cibleId) || cibleId <= 0) {
    throw refus(400, 'CIBLE_INVALIDE', 'Choisissez [[le:activite]] ou [[le:labo]].');
  }
  if (!dateValide(d.dateAppro)) throw refus(400, 'DATE_INVALIDE', 'Date [[du:appro:court]] invalide.');
  const ref = typeof d.refFacture === 'string' ? d.refFacture.trim() : '';
  if (!ref) throw refus(400, 'REF_REQUISE', 'Le numéro de facture est obligatoire.');
  if (ref.length > REF_MAX) throw refus(400, 'REF_TROP_LONGUE', `Numéro de facture trop long : ${REF_MAX} caractères au plus.`);
  let fournisseurId = null;
  if (d.fournisseurId != null && d.fournisseurId !== '') {
    fournisseurId = Number(d.fournisseurId);
    if (!Number.isInteger(fournisseurId) || fournisseurId <= 0) throw refus(400, 'FOURNISSEUR_INVALIDE', '[[Nom:fournisseur]] invalide.');
  }
  if (!Array.isArray(d.lignes) || d.lignes.length === 0) throw refus(400, 'LIGNES_REQUISES', 'Aucune ligne à enregistrer.');
  if (d.lignes.length > LIGNES_MAX) throw refus(400, 'TROP_DE_LIGNES', `${LIGNES_MAX} lignes au plus par facture.`);
  const lignes = d.lignes.map((l, i) => {
    const articleId = Number(l?.articleId);
    const quantite = nombre(l?.quantite);
    const prixUnitaire = nombre(l?.prixUnitaire);
    const tva = l?.tauxTva == null || l.tauxTva === '' ? 0 : nombre(l.tauxTva);
    const n = i + 1;
    if (!Number.isInteger(articleId) || articleId <= 0) throw refus(400, 'LIGNE_INVALIDE', `Ligne ${n} : [[nom:article]] invalide.`, { ligne: n });
    if (!(quantite > 0) || quantite > VALEUR_MAX) throw refus(400, 'LIGNE_INVALIDE', `Ligne ${n} : quantité invalide.`, { ligne: n });
    if (!(prixUnitaire > 0) || prixUnitaire > VALEUR_MAX) throw refus(400, 'LIGNE_INVALIDE', `Ligne ${n} : prix invalide.`, { ligne: n });
    if (!(tva >= 0) || tva > 100) throw refus(400, 'LIGNE_INVALIDE', `Ligne ${n} : taux de TVA invalide.`, { ligne: n });
    return { articleId, quantite, prixUnitaire, tva };
  });
  return {
    type, cibleId, dateAppro: d.dateAppro, ref, fournisseurId, lignes,
    timbre: d.timbreFiscal === true, apercuDe: Array.isArray(d.apercuDe) ? d.apercuDe : [],
    confirmerDoublon: d.confirmerDoublon === true,
  };
};

/** Contrôle que la cible, les articles et le fournisseur sont ceux du compte (et du gérant). Lève Refus. */
const controlerAppartenance = async (req, clientId, v) => {
  if (v.type === 'activite') {
    if (req.user.role === 'gerant' && !(req.user.gerantActiviteIds || []).includes(v.cibleId)) {
      throw refus(403, 'HORS_PERIMETRE', 'Accès non autorisé à [[ce:activite]]');
    }
    const r = await pool.query(
      `SELECT a.id FROM activites a JOIN profil_entreprise pe ON pe.id = a.entreprise_id WHERE a.id = $1 AND pe.client_id = $2`,
      [v.cibleId, clientId]
    );
    if (!r.rows.length) throw refus(404, 'CIBLE_INTROUVABLE', '[[Nom:activite]] introuvable');
  } else {
    if (req.user.role === 'gerant' && !(req.user.gerantLaboIds || []).includes(v.cibleId)) {
      throw refus(403, 'HORS_PERIMETRE', 'Accès non autorisé à [[ce:labo]]');
    }
    const r = await pool.query(
      `SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE l.id = $1 AND pe.client_id = $2`,
      [v.cibleId, clientId]
    );
    if (!r.rows.length) throw refus(404, 'CIBLE_INTROUVABLE', '[[Nom:labo]] introuvable');
  }
  // Un article est admis s'il est au compte, ou sélectionné sur l'activité / le labo visé.
  const ids = [...new Set(v.lignes.map((l) => l.articleId))];
  const selection = v.type === 'activite'
    ? 'SELECT 1 FROM activite_ingredient_selections s WHERE s.ingredient_id = a.id AND s.activite_id = $3'
    : 'SELECT 1 FROM labo_ingredient_selections s WHERE s.ingredient_id = a.id AND s.labo_id = $3';
  const art = await pool.query(
    `SELECT a.id FROM articles a WHERE a.id = ANY($1::int[]) AND (a.client_id = $2 OR EXISTS (${selection}))`,
    [ids, clientId, v.cibleId]
  );
  const connus = new Set(art.rows.map((r) => r.id));
  const inconnu = v.lignes.findIndex((l) => !connus.has(l.articleId));
  if (inconnu >= 0) throw refus(400, 'ARTICLE_INCONNU', `Ligne ${inconnu + 1} : [[nom:article]] introuvable.`, { ligne: inconnu + 1 });
  if (v.fournisseurId) {
    const fo = await pool.query(
      `SELECT f.id FROM fournisseurs f LEFT JOIN profil_entreprise pe ON pe.id = f.entreprise_id
       WHERE f.id = $1 AND (pe.client_id = $2 OR f.client_id = $2)`,
      [v.fournisseurId, clientId]
    );
    if (!fo.rows.length) throw refus(400, 'FOURNISSEUR_INCONNU', '[[Nom:fournisseur]] introuvable.');
  }
};

/** Factures du compte, même fournisseur, même numéro normalisé (saisies). */
const facturesSemblables = async (req, clientId, v) => {
  const r = await pool.query(
    `SELECT f.id, f.date_facture, f.activite_id, f.labo_id, f.montant_ttc, a.nom AS activite_nom, l.nom AS labo_nom,
            (SELECT fl.labo_id FROM fournisseurs fl WHERE fl.id = f.fournisseur_id AND fl.is_labo = true) AS labo_emetteur_id,
            (f.ref_facture = $7 AND f.date_facture = $4::date AND f.activite_id IS NOT DISTINCT FROM $5::int AND f.labo_id IS NOT DISTINCT FROM $6::int) AS meme_facture
     FROM factures f
     LEFT JOIN activites a ON a.id = f.activite_id
     LEFT JOIN labos l ON l.id = f.labo_id
     WHERE f.client_id = $1 AND f.type_source = 'manuel' AND f.ref_facture IS NOT NULL
       AND ${F.SQL_REF_NORMALISEE('f.ref_facture')} = $2
       AND f.fournisseur_id IS NOT DISTINCT FROM $3::int
     ORDER BY f.date_facture DESC, f.id DESC
     LIMIT 5`,
    [clientId, F.refNormalisee(v.ref), v.fournisseurId, v.dateAppro,
      v.type === 'activite' ? v.cibleId : null, v.type === 'labo' ? v.cibleId : null, v.ref]
  );
  return r.rows.map((x) => {
    const visible = F.gerantVoit(req, x);
    return {
      id: visible ? x.id : null,
      dateFacture: x.date_facture,
      lieuNom: visible ? (x.activite_nom || x.labo_nom || null) : null,
      montantTTC: visible ? parseFloat(x.montant_ttc) : null,
      memeFacture: x.meme_facture === true,
    };
  });
};

const creer = async (req, res) => {
  const clientId = F.clientDe(req);
  let deposes = [];
  try {
    const v = lireDonnees(req.body?.donnees);
    const prepares = P.preparer(req.files, v.apercuDe);
    if (prepares.length && !stockage.disponible()) {
      throw refus(503, 'STOCKAGE_ABSENT', 'Le stockage des factures n\'est pas encore configuré : enregistrez sans la pièce, vous la joindrez plus tard.');
    }
    await controlerAppartenance(req, clientId, v);
    if (!v.confirmerDoublon) {
      const semblables = await facturesSemblables(req, clientId, v);
      if (semblables.length) {
        throw refus(409, 'FACTURE_EXISTANTE', `Une facture n° ${v.ref} de ce [[nom:fournisseur]] existe déjà.`, { factures: semblables });
      }
    }
    deposes = await P.deposerTout(clientId, prepares);
    const table = v.type === 'activite' ? 'stock_entreprise_daily' : 'stock_labo_daily';
    const colonne = v.type === 'activite' ? 'activite_id' : 'labo_id';
    const resultat = await withTransaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock($1, $2)', [CLASSE_VERROU, clientId]);
      const existe = await db.query(
        `SELECT id, timbre_fiscal FROM factures
         WHERE client_id = $1 AND type_source = 'manuel' AND ref_facture = $2 AND date_facture = $3::date
           AND fournisseur_id IS NOT DISTINCT FROM $4::int AND ${colonne} = $5 AND ${colonne === 'activite_id' ? 'labo_id' : 'activite_id'} IS NULL
         ORDER BY id LIMIT 1 FOR UPDATE`,
        [clientId, v.ref, v.dateAppro, v.fournisseurId, v.cibleId]
      );
      let factureId;
      const ajoutee = existe.rows.length > 0;
      if (ajoutee) {
        factureId = existe.rows[0].id;
        if (v.timbre && !existe.rows[0].timbre_fiscal) {
          await db.query('UPDATE factures SET timbre_fiscal = true, montant_timbre = 1 WHERE id = $1', [factureId]);
        }
      } else {
        const ins = await db.query(
          `INSERT INTO factures (client_id, ref_facture, date_facture, fournisseur_id, activite_id, labo_id, type_source,
                                 montant_ht, montant_tva, montant_ttc, timbre_fiscal, montant_timbre, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, 'manuel', 0, 0, 0, $7, $8, $9) RETURNING id`,
          [clientId, v.ref, v.dateAppro, v.fournisseurId, v.type === 'activite' ? v.cibleId : null,
            v.type === 'labo' ? v.cibleId : null, v.timbre, v.timbre ? 1 : 0, req.user.id]
        );
        factureId = ins.rows[0].id;
      }
      for (const l of v.lignes) {
        await db.query(
          `INSERT INTO ${table} (${colonne}, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id,
                                  ref_facture, taux_tva, prix_unitaire_tva, facture_id, updated_at, created_by)
           VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, $8, ROUND($5::numeric * (1 + $8::numeric / 100), 3), $9, NOW(), $10)`,
          [v.cibleId, l.articleId, v.dateAppro, l.quantite, l.prixUnitaire, v.fournisseurId, v.ref, l.tva, factureId, req.user.id]
        );
      }
      const nbLignes = await F.recalculerFacture(db, factureId);
      let nbPieces = 0;
      if (deposes.length) {
        const dejaLa = (await db.query('SELECT COUNT(*)::int AS n, COALESCE(MAX(ordre), 0)::int AS dernier FROM factures_pieces WHERE facture_id = $1', [factureId])).rows[0];
        if (dejaLa.n + deposes.length > P.PIECES_MAX) {
          throw refus(409, 'TROP_DE_PIECES', `Cette facture a déjà ${dejaLa.n} pièce(s) : ${P.PIECES_MAX} au plus.`);
        }
        await P.inserer(db, { factureId, clientId, deposes, ordreDepart: dejaLa.dernier + 1, auteurId: req.user.id });
        nbPieces = dejaLa.n + deposes.length;
      } else {
        nbPieces = (await db.query('SELECT COUNT(*)::int AS n FROM factures_pieces WHERE facture_id = $1', [factureId])).rows[0].n;
      }
      await P.journaliser(db, {
        clientId, factureId, action: ajoutee ? 'lignes_ajoutees' : 'facture_creee', auteurId: req.user.id,
        details: { ref: v.ref, lignes: v.lignes.length, pieces: deposes.map(P.resumePiece) },
      });
      return { factureId, ajoutee, nbLignes, nbPieces };
    });
    deposes = [];
    return res.status(201).json(resultat);
  } catch (err) {
    if (deposes.length) await P.effacerDeposes(deposes, 'facture non enregistrée');
    if (err instanceof Refus) return res.status(err.status).json(err.corps);
    if (err instanceof P.ErreurPiece) return res.status(err.status).json({ code: err.code, message: err.message });
    console.error('[appro facture]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { creer, lireDonnees };
