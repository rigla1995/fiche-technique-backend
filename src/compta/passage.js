// LabFlow Compta, étape S3a (labflow-reprise/achats-compta/PLAN-S3.md, SPEC-SOCLE D12) : passer d'une adresse à l'autre
// (app. ↔ compta.) sans ressaisir son mot de passe. La session est gardée par adresse (stockage du navigateur) : la
// personne connectée demande un CODE À USAGE UNIQUE (60 s, lié à elle et à l'adresse de destination, conservé haché) ;
// l'écran l'emporte dans la partie « # » de l'adresse — jamais envoyée aux serveurs ni aux journaux — et l'adresse de
// destination l'échange contre une session (POST /auth/passage), avec les mêmes règles qu'une connexion.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { repondreSession } = require('../controllers/authController');

const DUREE_SECONDES = 60;
const DESTINATIONS = ['app', 'compta'];
const RE_CODE = /^[A-Za-z0-9_-]{40,60}$/;
const MSG_INVALIDE = 'Lien de passage expiré ou déjà utilisé : reconnectez-vous.';

const hacher = (code) => crypto.createHash('sha256').update(code).digest('hex');

// Espaces d'une personne : Stock / Vente (client ou gérant) ; Comptabilité (au moins un accès actif à une comptabilité
// ouverte).
const espacesDe = async (db, user) => {
  const r = await db.query(
    `SELECT 1 FROM compta.acces a JOIN compta.espaces e ON e.id = a.espace_id
      WHERE a.personne_id = $1 AND a.etat = 'actif' AND e.etat = 'actif'
      LIMIT 1`,
    [user.id]
  );
  return { stockVente: ['client', 'gerant'].includes(user.role), comptabilite: r.rows.length > 0 };
};

// Dates de la session qui demande le passage (jeton déjà vérifié par authenticate : simple lecture).
const sessionDe = (req) => {
  const jeton = req.query?.token || String(req.headers.authorization || '').slice(7);
  const { iat, exp } = jwt.decode(jeton) || {};
  return Number.isInteger(iat) && Number.isInteger(exp) ? { iat, exp } : null;
};

// POST /api/compta/passage — { destination: 'app' | 'compta' } → { code, expireDans } (personne connectée). Le code garde
// les dates de la session qui l'a demandé : la session ouverte de l'autre côté finit en même temps qu'elle.
const emettre = async (req, res) => {
  const destination = req.body?.destination;
  if (!DESTINATIONS.includes(destination)) return res.status(400).json({ message: 'Destination inconnue' });
  const session = sessionDe(req);
  if (!session) return res.status(401).json({ message: 'Session invalide' });
  try {
    const espaces = await espacesDe(pool, req.user);
    if (destination === 'app' && !espaces.stockVente) {
      return res.status(403).json({ message: 'Ce compte n\'a pas d\'espace Stock / Vente' });
    }
    if (destination === 'compta' && !espaces.comptabilite && req.user.role !== 'comptable') {
      return res.status(403).json({ message: 'Aucune comptabilité n\'est ouverte pour ce compte' });
    }
    const code = crypto.randomBytes(32).toString('base64url');
    // Ménage des codes anciens (utilisés ou expirés depuis plus d'un jour).
    await pool.query(`DELETE FROM compta.sessions_passage WHERE expire_le < NOW() - interval '1 day'`);
    await pool.query(
      `INSERT INTO compta.sessions_passage (personne_id, code_hache, destination, expire_le, session_iat, session_exp)
       VALUES ($1, $2, $3, NOW() + make_interval(secs => $4), $5, $6)`,
      [req.user.id, hacher(code), destination, DUREE_SECONDES, session.iat, session.exp]
    );
    res.json({ code, expireDans: DUREE_SECONDES });
  } catch (err) {
    console.error('[compta.passage.emettre]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /auth/passage — { code, produit: 'labflow' | 'compta' } (sans session) → même réponse qu'une connexion. Le code
// n'est accepté qu'une fois, avant son expiration, sur l'adresse pour laquelle il a été émis, pour une personne active
// dont le mot de passe n'a pas changé depuis ; la session ouverte reprend les dates de la session d'origine (jamais
// prolongée, révoquée comme elle). Refus = 400 (et non 401 : un lien périmé ne doit pas effacer la session déjà
// ouverte sur cette adresse, garde 401 des écrans).
const echanger = async (req, res) => {
  const code = String(req.body?.code || '');
  const destination = req.body?.produit === 'compta' ? 'compta' : 'app';
  if (!RE_CODE.test(code)) return res.status(400).json({ code: 'PASSAGE_INVALIDE', message: MSG_INVALIDE });
  try {
    const r = await pool.query(
      `UPDATE compta.sessions_passage sp SET utilise_le = NOW()
         FROM utilisateurs u
        WHERE sp.code_hache = $1 AND sp.destination = $2 AND sp.utilise_le IS NULL AND sp.expire_le > NOW()
          AND u.id = sp.personne_id AND u.actif = true
          AND (u.password_changed_at IS NULL OR sp.cree_le >= u.password_changed_at)
        RETURNING sp.personne_id, sp.session_iat, sp.session_exp`,
      [hacher(code), destination]
    );
    if (!r.rows.length) return res.status(400).json({ code: 'PASSAGE_INVALIDE', message: MSG_INVALIDE });
    const { personne_id: personneId, session_iat: iat, session_exp: exp } = r.rows[0];
    if (Number(exp) <= Math.floor(Date.now() / 1000)) return res.status(400).json({ code: 'PASSAGE_INVALIDE', message: MSG_INVALIDE });
    const u = await pool.query('SELECT * FROM utilisateurs WHERE id = $1 AND actif = true', [personneId]);
    const personne = u.rows[0];
    // Même règle que la connexion : une invitation non activée n'ouvre pas de session.
    const aActiver = personne && !personne.activated_at && !['super_admin', 'boss'].includes(personne.role) && !personne.mot_de_passe;
    if (!personne || aActiver) return res.status(400).json({ code: 'PASSAGE_INVALIDE', message: MSG_INVALIDE });
    return await repondreSession(res, personne, { iat: Number(iat), exp: Number(exp) });
  } catch (err) {
    console.error('[compta.passage.echanger]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { DUREE_SECONDES, hacher, espacesDe, emettre, echanger };
