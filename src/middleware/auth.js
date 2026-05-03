const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token d\'authentification manquant' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query(
      `SELECT u.id, u.nom, u.email, u.role, u.compte_type, u.actif,
              u.gerant_parent_id, u.gerant_activite_id, u.gerant_activite_type,
              a.mode_compte
       FROM utilisateurs u
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
  if (req.user.role !== 'client') {
    return res.status(403).json({ message: 'Accès réservé aux clients' });
  }
  next();
};

const requireEntreprise = (req, res, next) => {
  if (req.user.role !== 'client') {
    return res.status(403).json({ message: 'Accès réservé aux clients' });
  }
  if (req.user.compte_type !== 'entreprise') {
    return res.status(403).json({ message: 'Fonctionnalité réservée aux comptes entreprise' });
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

module.exports = {
  authenticate, requireSuperAdmin, requireClient, requireEntreprise,
  requireWriteAccess, requireGerant, requireClientOrGerant,
};
