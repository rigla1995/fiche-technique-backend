const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  // SSE connections pass token via query param (EventSource doesn't support headers)
  const queryToken = req.query?.token;
  if (!authHeader && !queryToken) {
    return res.status(401).json({ message: 'Token d\'authentification manquant' });
  }
  if (authHeader && !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token d\'authentification manquant' });
  }

  const token = queryToken || authHeader.substring(7);
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      `SELECT u.id, u.nom, u.email, u.role,
              u.actif, u.password_changed_at,
              u.gerant_parent_id, u.gerant_activite_id, u.gerant_activite_type,
              ach.id AS acheteur_id, ach.client_id AS acheteur_client_id, ach.actif AS acheteur_actif,
              a.mode_compte
       FROM utilisateurs u
       LEFT JOIN utilisateurs p ON p.id = u.gerant_parent_id
       LEFT JOIN acheteurs ach ON ach.user_id = u.id AND u.role = 'acheteur'
       LEFT JOIN abonnements a ON a.client_id = COALESCE(u.gerant_parent_id, ach.client_id, u.id)
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].actif) {
      return res.status(401).json({ message: 'Utilisateur introuvable ou désactivé' });
    }

    const row = result.rows[0];

    // Un compte acheteur n'est valide que si sa fiche carnet existe et est active
    // (le client peut désactiver un acheteur sans supprimer son compte).
    if (row.role === 'acheteur' && (!row.acheteur_id || row.acheteur_actif === false)) {
      return res.status(401).json({ message: 'Compte acheteur désactivé' });
    }

    // Un JWT émis avant le dernier changement de mot de passe est révoqué
    // (iat en secondes ; comparaison stricte pour tolérer un token émis dans la même seconde).
    const pwdChangedSec = row.password_changed_at
      ? Math.floor(new Date(row.password_changed_at).getTime() / 1000)
      : 0;
    if (decoded.iat && decoded.iat < pwdChangedSec) {
      return res.status(401).json({ message: 'Session expirée — veuillez vous reconnecter' });
    }

    // Charger les affectations (multi-activités / multi-labos) pour les gérants
    let gerantActiviteIds = [];
    let gerantLaboIds = [];
    if (row.role === 'gerant') {
      const aff = await pool.query(
        `SELECT activite_id, labo_id FROM gerant_affectations WHERE gerant_id = $1`,
        [row.id]
      );
      gerantActiviteIds = aff.rows.filter(r => r.activite_id != null).map(r => Number(r.activite_id));
      gerantLaboIds = aff.rows.filter(r => r.labo_id != null).map(r => Number(r.labo_id));
      // Compat ascendante : si pas encore d'affectations, retomber sur l'affectation unique
      if (gerantActiviteIds.length === 0 && gerantLaboIds.length === 0 && row.gerant_activite_id) {
        if (row.gerant_activite_type === 'labo') gerantLaboIds = [Number(row.gerant_activite_id)];
        else gerantActiviteIds = [Number(row.gerant_activite_id)];
      }
    }

    req.user = {
      ...row,
      modeCompte: row.mode_compte || 'actif',
      gerantActiviteIds,
      gerantLaboIds,
      // Rôle acheteur : fiche carnet + compte client parent (périmètre du portail).
      acheteurId: row.acheteur_id || null,
      acheteurClientId: row.acheteur_client_id || null,
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

// Le Boss hérite de TOUTES les capacités du super_admin.
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin' && req.user.role !== 'boss') {
    return res.status(403).json({ message: 'Accès réservé au Super Admin' });
  }
  next();
};

// Capacités EXCLUSIVES au Boss (gestion des super_admins, annuaire identifiants).
const requireBoss = (req, res, next) => {
  if (req.user.role !== 'boss') {
    return res.status(403).json({ message: 'Accès réservé au compte Boss' });
  }
  next();
};

const requireClient = (req, res, next) => {
  if (req.user.role !== 'client' && req.user.role !== 'gerant') {
    return res.status(403).json({ message: 'Accès réservé aux clients' });
  }
  next();
};

const requireEntreprise = (req, res, next) => {
  if (req.user.role !== 'client' && req.user.role !== 'gerant') {
    return res.status(403).json({ message: 'Accès réservé aux clients' });
  }
  next();
};

// Blocks write operations when account is in read_only or worse
const requireWriteAccess = (req, res, next) => {
  const mode = req.user.modeCompte;
  if (mode === 'read_only') {
    return res.status(403).json({ message: 'Compte en lecture seule — paiement en attente', code: 'READ_ONLY' });
  }
  if (mode === 'desactive' || mode === 'archive') {
    return res.status(403).json({ message: 'Compte suspendu', code: 'SUSPENDED' });
  }
  if (mode === 'bloque') {
    return res.status(403).json({ message: 'Compte bloqué — veuillez régulariser votre situation', code: 'BLOCKED' });
  }
  next();
};

// Réservé au client propriétaire (exclut les gérants) — ex. mutations de l'Espace Produit.
const requireClientOwner = (req, res, next) => {
  if (req.user.role !== 'client') {
    return res.status(403).json({ message: 'Action réservée au compte client (lecture seule pour les gérants)' });
  }
  next();
};

const requireGerant = (req, res, next) => {
  if (req.user.role !== 'gerant') {
    return res.status(403).json({ message: 'Accès réservé aux gérants' });
  }
  next();
};

const requireClientOrGerant = (req, res, next) => {
  if (req.user.role !== 'client' && req.user.role !== 'gerant') {
    return res.status(403).json({ message: 'Accès non autorisé' });
  }
  next();
};

const requireModuleVente = async (req, res, next) => {
  try {
    const userId = req.user.gerant_parent_id || req.user.id;
    const r = await pool.query(
      `SELECT module_vente_actif FROM profil_entreprise WHERE client_id = $1`,
      [userId]
    );
    if (!r.rows[0]?.module_vente_actif) {
      return res.status(403).json({ message: 'Module Vente non activé', code: 'MODULE_VENTE_INACTIVE' });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Gating serveur du module Acheteurs — contrairement au module Vente, ce
// middleware est réellement branché sur les routes (403 si module inactif).
// Compte de référence : client propriétaire, parent du gérant, ou client
// parent de l'acheteur (portail).
const requireModuleAcheteurs = async (req, res, next) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.acheteurClientId || req.user.id;
    const r = await pool.query(
      `SELECT module_acheteurs_actif FROM profil_entreprise WHERE client_id = $1`,
      [clientId]
    );
    if (!r.rows[0]?.module_acheteurs_actif) {
      return res.status(403).json({ message: 'Module Acheteurs non activé', code: 'MODULE_ACHETEURS_INACTIVE' });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Gating serveur de la formule d'activités : l'Espace Produit (écritures) est
// réservé à la formule PREMIUM. Exceptions qui passent :
//   • compte sans config ou sans activité (dépôt) — l'Espace Produit ne le concerne pas ;
//   • compte avec ≥ 1 LABO — la base Labo inclut la gestion des produits
//     (les recettes sont indispensables à la production PT du labo).
const requireFormulePremium = async (req, res, next) => {
  try {
    const clientId = req.user.gerant_parent_id || req.user.id;
    const r = await pool.query(
      `SELECT ac.formule_activites, ac.nb_labos
       FROM abonnements a JOIN abonnement_config ac ON ac.abonnement_id = a.id
       WHERE a.client_id = $1
       ORDER BY a.id DESC LIMIT 1`,
      [clientId]
    );
    if (r.rows[0]?.formule_activites === 'basique' && (parseInt(r.rows[0].nb_labos) || 0) === 0) {
      return res.status(403).json({
        message: 'L\'Espace Produit est réservé à la formule Activité Premium',
        code: 'FORMULE_BASIQUE',
      });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const requireAcheteur = (req, res, next) => {
  if (req.user.role !== 'acheteur') {
    return res.status(403).json({ message: 'Accès réservé aux acheteurs' });
  }
  next();
};

// ─── Helpers de périmètre gérant ──────────────────────────────────────────────
// Un gérant n'a accès qu'aux activités / labos qui lui sont affectés.
const gerantAllowsActivite = (req, activiteId) => {
  if (req.user.role !== 'gerant') return true;
  return (req.user.gerantActiviteIds || []).includes(Number(activiteId));
};
const gerantAllowsLabo = (req, laboId) => {
  if (req.user.role !== 'gerant') return true;
  return (req.user.gerantLaboIds || []).includes(Number(laboId));
};

// Restreint req.query.activiteId au périmètre du gérant.
// - activiteId fourni → doit appartenir au périmètre (sinon 403).
// - sinon, 1 seule activité → on la force ; plusieurs → req.query.activiteIds = liste.
// Retourne false si l'accès est refusé (la réponse 403 a déjà été envoyée).
const scopeGerantActivite = (req, res) => {
  if (req.user.role !== 'gerant') return true;
  const ids = req.user.gerantActiviteIds || [];
  if (req.query.activiteId) {
    if (!ids.includes(Number(req.query.activiteId))) {
      res.status(403).json({ message: 'Accès non autorisé à cette activité' });
      return false;
    }
    delete req.query.activiteIds;
    return true;
  }
  if (ids.length > 1) {
    req.query.activiteIds = ids.join(',');
  } else {
    // 0 ou 1 activité : on force (−1 = aucune correspondance → résultat vide)
    req.query.activiteId = ids.length === 1 ? String(ids[0]) : '-1';
    delete req.query.activiteIds;
  }
  return true;
};

module.exports = {
  authenticate, requireSuperAdmin, requireBoss, requireClient, requireEntreprise,
  requireWriteAccess, requireGerant, requireClientOrGerant, requireModuleVente,
  requireModuleAcheteurs, requireAcheteur, requireFormulePremium,
  requireClientOwner, gerantAllowsActivite, gerantAllowsLabo, scopeGerantActivite,
};
