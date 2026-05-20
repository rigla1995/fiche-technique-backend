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
              COALESCE(u.compte_type, p.compte_type) AS compte_type,
              u.actif,
              u.gerant_parent_id, u.gerant_activite_id, u.gerant_activite_type,
              a.mode_compte
       FROM utilisateurs u
       LEFT JOIN utilisateurs p ON p.id = u.gerant_parent_id
       LEFT JOIN abonnements a ON a.client_id = COALESCE(u.gerant_parent_id, u.id)
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].actif) {
      return res.status(401).json({ message: 'Utilisateur introuvable ou désactivé' });
    }

    const row = result.rows[0];
    req.user = {
      ...row,
      compteType: row.compte_type,
      modeCompte: row.mode_compte || 'actif',
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Accès réservé au Super Admin' });
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

module.exports = {
  authenticate, requireSuperAdmin, requireClient, requireEntreprise,
  requireWriteAccess, requireGerant, requireClientOrGerant, requireModuleVente,
};
