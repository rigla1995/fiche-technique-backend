// Vocabulaire d'un COMPTE côté serveur (lot 2, spec §2.4).
//
//   vocabDuProfil(profil)        → vocabulaire du lexique résolu d'un profil de domaine (synchrone)
//   vocabDuDomaine(domaineId)    → vocabulaire d'un domaine (profil en cache 60 s)
//   vocabForClient(clientId)     → vocabulaire du compte CLIENT (gérant → compte parent)
//   vocabPourRole(role, domaineId) → celui de req.voc (middleware authenticate)
//
// Règle I6 : le vocabulaire est celui du compte DESTINATAIRE du texte, jamais celui de
// l'utilisateur authentifié. Dans un contrôleur client / gérant / acheteur : `req.voc`.
// Pour un texte produit hors requête du compte (admin qui crée un compte ou traite une
// demande, webhook, IA, email) : `vocabForClient(id du compte client)`, ou
// `vocabDuDomaine(domaineId)` si le compte n'existe pas encore (aperçu du wizard).
// Un ACHETEUR n'est pas un compte : passer l'id de son client vendeur
// (`req.user.acheteurClientId`).
//
// Le vocabulaire est mémoïsé PAR OBJET lexique (WeakMap) : getProfil rend le même objet
// tant que son cache vit ; un PUT du domaine (invalidate) ou l'expiration du cache crée un
// nouvel objet, donc un nouveau vocabulaire — aucune invalidation à écrire ici.
// `vocabDuLexique` est la fonction du front (AuthContext) : même lexique reçu, mêmes rendus ;
// un lexique équivalent au défaut rend `vocabDefaut` lui-même.
const { vocabDefaut, vocabDuLexique } = require('./vocab');

const parLexique = new WeakMap(); // objet lexique résolu -> vocabulaire

const vocabDuProfil = (profil) => {
  const lexique = profil && profil.lexique;
  if (!lexique || typeof lexique !== 'object') return vocabDefaut;
  let voc = parLexique.get(lexique);
  if (!voc) {
    voc = vocabDuLexique(lexique);
    parLexique.set(lexique, voc);
  }
  return voc;
};

// Jamais bloquant : domaine absent, inconnu ou erreur de lecture → vocabulaire par défaut.
// Un ÉCHEC de lecture (base indisponible) est gardé ECHEC_TTL_MS par domaine : pendant ce délai, aucune
// nouvelle requête ni nouvel avertissement à chaque appel authentifié (getProfil ne met rien en cache sur
// erreur) ; le vocabulaire par défaut est rendu, puis le chargement est retenté.
const ECHEC_TTL_MS = 10 * 1000;
const echecs = new Map(); // domaineId -> Date.now() du dernier échec
const vocabDuDomaine = async (domaineId) => {
  if (domaineId == null) return vocabDefaut;
  const dernierEchec = echecs.get(domaineId);
  if (dernierEchec != null && Date.now() - dernierEchec < ECHEC_TTL_MS) return vocabDefaut;
  try {
    // require tardif : domaineProfilService charge la base (ce module reste utilisable sans elle)
    const { getProfil } = require('../services/domaineProfilService');
    const voc = vocabDuProfil(await getProfil(domaineId));
    echecs.delete(domaineId);
    return voc;
  } catch (e) {
    echecs.set(domaineId, Date.now());
    console.warn(`[vocab] profil de domaine ${domaineId} indisponible, vocabulaire par défaut (nouvel essai dans ${ECHEC_TTL_MS / 1000} s) :`, e.message);
    return vocabDefaut;
  }
};

// clientId = id du compte CLIENT (un id de gérant est ramené à son compte parent).
// Compte sans abonnement configuré → vocabulaire par défaut.
const vocabForClient = async (clientId) => {
  if (clientId == null) return vocabDefaut;
  try {
    const { getDomaineIdForClient } = require('../services/domaineProfilService');
    return vocabDuDomaine(await getDomaineIdForClient(clientId));
  } catch (e) {
    console.warn('[vocab] domaine du compte indisponible, vocabulaire par défaut :', e.message);
    return vocabDefaut;
  }
};

// req.voc : admin et boss d'après le RÔLE (un boss ex-client garde un abonnement, donc un
// domaine) ; domaine nul → défaut, SANS requête (pas de repli sur le domaine « restauration »).
const vocabPourRole = async (role, domaineId) => {
  if (role === 'super_admin' || role === 'boss' || domaineId == null) return vocabDefaut;
  return vocabDuDomaine(domaineId);
};

module.exports = { vocabDefaut, vocabDuProfil, vocabDuDomaine, vocabForClient, vocabPourRole };
