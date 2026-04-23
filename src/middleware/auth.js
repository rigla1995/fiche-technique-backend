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
      'SELECT id, nom, email, role, compte_type, actif FROM utilisateurs WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0 || !result.rows[0].actif) {
      return res.status(401).json({ message: 'Utilisateur introuvable ou désactivé' });
    }

    req.user = result.rows[0];
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

module.exports = { authenticate, requireSuperAdmin, requireClient, requireEntreprise };
