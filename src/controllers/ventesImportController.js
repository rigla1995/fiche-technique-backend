// Import d'un fichier de caisse (étapes V1a et V1b — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis).
// Le navigateur lit l'export de la caisse (Excel, PDF, CSV), l'utilisateur vérifie chaque ligne dans la fenêtre
// « Vérifier les ventes », puis l'écran envoie le résultat ici. Le serveur revérifie tout et crée les ventes de la journée.
// V1b : remplacer ou annuler l'import d'une journée, liste des journées importées, document d'origine conservé.
// Règles pures : src/utils/ventesImport.js ; base : src/services/ventesImport.js. Droits : ceux de la saisie des ventes
// (compte et gérants) ; un gérant n'annule et ne remplace que ses propres imports.
const express = require('express');
const pool = require('../config/database');
const VI = require('../utils/ventesImport');
const ventesImport = require('../services/ventesImport');
const { getReglesForClient } = require('../services/domaineProfilService');

const clientIdOf = (req) => req.user.gerant_parent_id || req.user.id;
const userOf = (req) => ({ id: req.user.id, role: req.user.role });

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

/** L'import de la route `/:id`, s'il est enregistré et que son activité est du compte. */
async function exigerImport(req) {
  const imp = await ventesImport.trouver(pool, req.params.id);
  if (!imp) throw new VI.ErreurImport(404, 'IMPORT_INTROUVABLE', 'Import introuvable (ou déjà annulé).');
  await exigerActivite(imp.activite_id, clientIdOf(req));
  return imp;
}

const repondreErreur = (res, e) => {
  if (e instanceof VI.ErreurImport || e.status) return res.status(e.status).json({ code: e.code, message: e.message });
  return res.status(500).json({ message: e.message });
};

// GET /api/ventes/imports/contexte?activiteId= — correspondances apprises, catégories, journées déjà importées, modèles.
const contexte = async (req, res) => {
  try {
    const activiteId = await exigerActivite(req.query.activiteId, clientIdOf(req));
    res.json(await ventesImport.contexte(pool, activiteId));
  } catch (e) {
    repondreErreur(res, e);
  }
};

// GET /api/ventes/imports?activiteId= — les journées importées, la plus récente d'abord.
const lister = async (req, res) => {
  try {
    const activiteId = await exigerActivite(req.query.activiteId, clientIdOf(req));
    res.json({ imports: await ventesImport.lister(pool, activiteId) });
  } catch (e) {
    repondreErreur(res, e);
  }
};

// GET /api/ventes/imports/jour?activiteId=&date=AAAA-MM-JJ — l'import de cette journée et les ventes saisies à la main.
const jour = async (req, res) => {
  try {
    const activiteId = await exigerActivite(req.query.activiteId, clientIdOf(req));
    const date = String(req.query.date ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new VI.ErreurImport(400, 'DATE_INVALIDE', 'Date de la journée invalide.');
    res.json(await ventesImport.jour(pool, activiteId, date));
  } catch (e) {
    repondreErreur(res, e);
  }
};

// POST /api/ventes/imports — { activite_id, date_vente, source, fichier_nom, empreinte, modele?, total_lu?, remplacer?,
//   colonnes?: { signature, colonnes: { designation, quantite, montant?, prixUnitaire?, categorie? } },
//   categories: [{ nom, livraison }],
//   lignes: [{ categorie, designation, quantite, montant, ignoree?, article_type, article_id, repartition: [{ canal, quantite }] }] }
// Tout ou rien : une ligne refusée (produit hors canal, répartition fausse, journée déjà importée…) annule l'import —
// et, s'il remplaçait une journée, l'ancien import reste en place.
const creer = async (req, res) => {
  const db = await pool.connect();
  try {
    const clientId = clientIdOf(req);
    const activiteId = await exigerActivite(req.body?.activite_id, clientId);
    const donnees = VI.lireImport(req.body);
    await db.query('BEGIN');
    const { documentsAEffacer, ...resultat } = await ventesImport.enregistrer(db, { clientId, user: userOf(req), activiteId, donnees });
    await db.query('COMMIT');
    // Le document de l'import remplacé ne sort du stockage qu'une fois la transaction validée.
    await ventesImport.effacerDocuments(documentsAEffacer);
    res.status(201).json({ success: true, ...resultat });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    repondreErreur(res, e);
  } finally {
    db.release();
  }
};

// DELETE /api/ventes/imports/:id — annule l'import : ses ventes sont effacées, leur stock rendu ; la journée redevient
// importable. Ce qui a été appris (correspondances, catégories, modèle) est gardé.
const annuler = async (req, res) => {
  const db = await pool.connect();
  try {
    const imp = await exigerImport(req);
    await db.query('BEGIN');
    const fait = await ventesImport.annuler(db, { activiteId: imp.activite_id, user: userOf(req), importId: imp.id });
    if (!fait) throw new VI.ErreurImport(404, 'IMPORT_INTROUVABLE', 'Import introuvable (ou déjà annulé).');
    await db.query('COMMIT');
    await ventesImport.effacerDocuments([fait.documentCle]);
    res.json({ success: true, id: fait.id, date_vente: fait.date_vente, ventes: fait.ventes });
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    repondreErreur(res, e);
  } finally {
    db.release();
  }
};

// Corps brut du document (application/octet-stream), 15 Mo au plus.
const lecteurDocument = express.raw({ type: () => true, limit: ventesImport.DOCUMENT_MAX });
const corpsDocument = (req, res, next) => lecteurDocument(req, res, (err) => {
  if (!err) return next();
  if (err.type === 'entity.too.large') return res.status(413).json({ code: 'DOCUMENT_TROP_GROS', message: 'Document trop lourd (15 Mo au plus).' });
  return res.status(400).json({ code: 'ENVOI_ILLISIBLE', message: 'Envoi illisible : réessayez.' });
});

// POST /api/ventes/imports/:id/document — corps = le fichier lu (octets bruts). Il doit avoir l'empreinte de l'import.
const deposerDocument = async (req, res) => {
  try {
    const imp = await exigerImport(req);
    const r = await ventesImport.deposerDocument(pool, { imp, clientId: clientIdOf(req), octets: req.body });
    res.status(r.depose ? 201 : 200).json({ success: true, ...r });
  } catch (e) {
    repondreErreur(res, e);
  }
};

// GET /api/ventes/imports/:id/document — le document conservé (route authentifiée, stockage privé).
const document = async (req, res) => {
  try {
    const imp = await exigerImport(req);
    const doc = await ventesImport.lireDocument(imp);
    if (!doc) throw new VI.ErreurImport(404, 'DOCUMENT_ABSENT', "Aucun document n'est conservé pour cet import.");
    const ascii = doc.nom.replace(/[^\x20-\x7e]/g, '_').replace(/[\\"]/g, '_');
    res.setHeader('Content-Type', doc.type);
    res.setHeader('Content-Length', doc.octets.length);
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.nom)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(doc.octets);
  } catch (e) {
    repondreErreur(res, e);
  }
};

module.exports = { contexte, lister, jour, creer, annuler, corpsDocument, deposerDocument, document };
