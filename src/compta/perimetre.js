// LabFlow Compta — périmètre du rôle « comptable » (SPEC-SOCLE D5, étape S2b). Sous /api, une personne de ce rôle
// n'atteint que LabFlow Compta (/api/compta), le manuel (/api/manuel, réglé sur les fiches de LabFlow Compta) et les
// notifications (/api/notifications) ; toute autre route répond 403, en lecture comme en écriture. /auth reste ouvert
// (connexion, profil). Le rôle est lu dans le jeton signé (il ne change jamais pour une personne) : sans jeton, ou avec
// un jeton invalide, rien n'est décidé ici — la route répond elle-même (401).
const jwt = require('jsonwebtoken');

const CHEMINS_COMPTABLE = [/^\/compta(\/|$)/, /^\/manuel(\/|$)/, /^\/notifications(\/|$)/];

const roleDuJeton = (req) => {
  const entete = req.headers.authorization;
  const jeton = req.query?.token || (entete && entete.startsWith('Bearer ') ? entete.substring(7) : null);
  if (!jeton) return null;
  try {
    return jwt.verify(jeton, process.env.JWT_SECRET)?.role || null;
  } catch (_) {
    return null;
  }
};

const perimetreComptable = (req, res, next) => {
  if (roleDuJeton(req) !== 'comptable') return next();
  if (CHEMINS_COMPTABLE.some((re) => re.test(req.path))) return next();
  return res.status(403).json({ message: 'Accès réservé à LabFlow Compta' });
};

module.exports = { perimetreComptable, CHEMINS_COMPTABLE };
