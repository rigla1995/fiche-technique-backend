// Module « Livreurs » (étape L1) — périmètre du rôle « livreur », sur le modèle de src/compta/perimetre.js.
// Sous /api, un livreur n'atteint que son espace (/api/livreur) et les notifications ; toute autre route répond 403,
// en lecture comme en écriture (les 189 lectures de « gerant_parent_id || req.user.id » du code client agiraient sinon
// sous son propre id). /auth reste ouvert (connexion, profil : changement de son mot de passe). Le rôle est lu dans le
// jeton signé ; sans jeton valide, rien n'est décidé ici (la route répond 401 elle-même).
const jwt = require('jsonwebtoken');

const CHEMINS_LIVREUR = [/^\/livreur(\/|$)/, /^\/notifications(\/|$)/];

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

const perimetreLivreur = (req, res, next) => {
  if (roleDuJeton(req) !== 'livreur') return next();
  if (CHEMINS_LIVREUR.some((re) => re.test(req.path))) return next();
  return res.status(403).json({ message: "Accès réservé à l'espace livreur" });
};

module.exports = { perimetreLivreur, CHEMINS_LIVREUR };
