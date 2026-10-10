/* Pièces jointes des factures d'approvisionnement (étape F1 — labflow-reprise/achats-compta/PLAN-FACTURES.md §4).
 *
 * Réception (multer en mémoire, champs « pieces » et « apercus », 15 Mo par fichier), contrôle du TYPE SUR LE CONTENU
 * (jamais sur le nom ni sur le type annoncé), empreinte SHA-256, dépôt dans le stockage (stockageFichiers.js) et
 * lignes de `factures_pieces`. Une photo HEIC / HEIF arrive avec sa copie JPEG faite par le navigateur (« apercu ») :
 * l'original est gardé tel quel, la copie sert à l'affichage partout.
 * Les fichiers sont déposés AVANT la transaction qui les enregistre ; si elle échoue, l'appelant les efface
 * (`effacerDeposes`). Un fichier supprimé est effacé APRÈS la validation de sa transaction. */
const crypto = require('crypto');
const multer = require('multer');
const stockage = require('./stockageFichiers');

const OCTETS_MAX = 15 * 1024 * 1024;
// Copie JPEG d'une photo HEIC : réduite par le navigateur (2 500 px), elle pèse bien moins.
const APERCU_MAX = 5 * 1024 * 1024;
// Envois de fichiers lus en même temps par ce serveur (tout est gardé en mémoire le temps de l'envoi) : au-delà, 503.
const ENVOIS_SIMULTANES_MAX = 3;
let envoisEnCours = 0;
const PIECES_MAX = 5;
// Corps d'un envoi : 5 fichiers + 5 copies + les données ; au-delà (taille annoncée), refus avant toute lecture.
const CORPS_MAX = PIECES_MAX * (OCTETS_MAX + APERCU_MAX) + 1024 * 1024;
const NOM_MAX = 200;

const EXTENSIONS = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
};
// Types qui ne s'affichent pas dans tous les navigateurs : une copie JPEG les accompagne.
const AVEC_APERCU = new Set(['image/heic', 'image/heif']);

class ErreurPiece extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

// Marques ISO-BMFF (« ftyp ») des photos HEIC / HEIF / AVIF.
const MARQUES_HEIC = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const MARQUES_HEIF = new Set(['mif1', 'msf1', 'mif2']);
const MARQUES_AVIF = new Set(['avif', 'avis']);

/** Type d'un fichier d'après ses premiers octets ; null si ce n'est ni un PDF ni une image admise. */
const detecterType = (octets) => {
  if (!Buffer.isBuffer(octets) || octets.length < 12) return null;
  if (octets.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff) return 'image/jpeg';
  if (octets.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (octets.subarray(0, 4).toString('latin1') === 'RIFF' && octets.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (octets.subarray(4, 8).toString('latin1') === 'ftyp') {
    // Marque principale puis marques compatibles (la boîte ftyp tient dans ses premiers octets).
    const taille = Math.min(octets.readUInt32BE(0), octets.length, 64);
    const marques = [octets.subarray(8, 12).toString('latin1')];
    for (let i = 16; i + 4 <= taille; i += 4) marques.push(octets.subarray(i, i + 4).toString('latin1'));
    if (marques.some((m) => MARQUES_HEIC.has(m))) return 'image/heic';
    if (marques.some((m) => MARQUES_AVIF.has(m))) return 'image/avif';
    if (marques.some((m) => MARQUES_HEIF.has(m))) return 'image/heif';
  }
  return null;
};

/** Nom d'origine présentable : décodé en UTF-8 (multer le lit en latin1), sans chemin ni caractère de contrôle. */
const nomSur = (brut) => {
  let nom = String(brut || '');
  const utf8 = Buffer.from(nom, 'latin1').toString('utf8');
  if (!utf8.includes('\uFFFD')) nom = utf8;
  nom = nom.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!nom) nom = 'facture';
  return nom.length > NOM_MAX ? nom.slice(nom.length - NOM_MAX) : nom;
};

const empreinte = (octets) => crypto.createHash('sha256').update(octets).digest('hex');

// ── Réception ───────────────────────────────────────────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: OCTETS_MAX, files: PIECES_MAX * 2, fields: 5, fieldSize: 1024 * 1024 },
});
const reponseMulter = (res, err) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ code: 'FICHIER_TROP_GROS', message: 'Fichier trop volumineux : 15 Mo au plus par fichier.' });
  }
  if (err.code === 'LIMIT_FILE_COUNT' || (err.code === 'LIMIT_UNEXPECTED_FILE' && ['pieces', 'apercus'].includes(err.field))) {
    return res.status(400).json({ code: 'TROP_DE_FICHIERS', message: `${PIECES_MAX} fichiers au plus par facture.` });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ code: 'CHAMP_INATTENDU', message: 'Envoi illisible : fichier dans un champ inattendu.' });
  }
  return res.status(400).json({ code: 'ENVOI_ILLISIBLE', message: 'Envoi illisible : réessayez.' });
};
/**
 * Middleware : `req.files.pieces` (≤ 5) et `req.files.apercus` (≤ 5), en mémoire. Un corps annoncé trop gros est refusé
 * avant d'être lu (413) ; au-delà de 3 envois lus en même temps, 503 « réessayez » (la mémoire du serveur est partagée).
 */
const televersement = (req, res, next) => {
  const annonce = Number(req.headers['content-length']);
  if (Number.isFinite(annonce) && annonce > CORPS_MAX) {
    return res.status(413).json({ code: 'ENVOI_TROP_GROS', message: 'Envoi trop volumineux : 5 fichiers de 15 Mo au plus.' });
  }
  if (envoisEnCours >= ENVOIS_SIMULTANES_MAX) {
    res.setHeader('Retry-After', '5');
    return res.status(503).json({ code: 'ENVOIS_SIMULTANES', message: 'Plusieurs envois de fichiers sont en cours : réessayez dans quelques secondes.' });
  }
  envoisEnCours += 1;
  let libere = false;
  const liberer = () => { if (!libere) { libere = true; envoisEnCours -= 1; } };
  res.on('finish', liberer);
  res.on('close', liberer);
  return upload.fields([
    { name: 'pieces', maxCount: PIECES_MAX },
    { name: 'apercus', maxCount: PIECES_MAX },
  ])(req, res, (err) => (err ? reponseMulter(res, err) : next()));
};

// ── Préparation ─────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Contrôle les fichiers reçus. `apercuDe[i]` = rang (dans `pieces`) de l'original dont `apercus[i]` est la copie JPEG.
 * → [{ octets, type, ext, nom, empreinte, apercu: Buffer | null }]. Lève ErreurPiece (400) au premier fichier refusé.
 */
const preparer = (fichiers = {}, apercuDe = []) => {
  const pieces = fichiers.pieces || [];
  const apercus = fichiers.apercus || [];
  if (apercus.length && (!Array.isArray(apercuDe) || apercuDe.length !== apercus.length)) {
    throw new ErreurPiece(400, 'APERCU_SANS_ORIGINAL', 'Copie d\'affichage sans photo d\'origine.');
  }
  const prepares = pieces.map((f) => {
    const nom = nomSur(f.originalname);
    if (!f.buffer || f.buffer.length === 0) throw new ErreurPiece(400, 'FICHIER_VIDE', `« ${nom} » est vide.`);
    const type = detecterType(f.buffer);
    if (!type) {
      throw new ErreurPiece(400, 'TYPE_REFUSE', `« ${nom} » n'est ni un PDF ni une photo (JPEG, PNG, WebP, HEIC, AVIF).`);
    }
    return { octets: f.buffer, type, ext: EXTENSIONS[type], nom, empreinte: empreinte(f.buffer), apercu: null };
  });
  apercus.forEach((f, i) => {
    const rang = Number(apercuDe[i]);
    const cible = Number.isInteger(rang) ? prepares[rang] : undefined;
    if (!cible || !AVEC_APERCU.has(cible.type) || cible.apercu) {
      throw new ErreurPiece(400, 'APERCU_SANS_ORIGINAL', 'Copie d\'affichage sans photo d\'origine.');
    }
    if (detecterType(f.buffer) !== 'image/jpeg') {
      throw new ErreurPiece(400, 'APERCU_ILLISIBLE', `La copie d'affichage de « ${cible.nom} » n'est pas une image JPEG.`);
    }
    if (f.buffer.length > APERCU_MAX) {
      throw new ErreurPiece(413, 'APERCU_TROP_GROS', `La copie d'affichage de « ${cible.nom} » est trop lourde : 5 Mo au plus.`);
    }
    cible.apercu = f.buffer;
  });
  return prepares;
};

/** Dépose les fichiers préparés ; en cas d'échec, efface ce qui a été déposé et lève ErreurPiece (503). */
const deposerTout = async (clientId, prepares) => {
  const deposes = [];
  try {
    for (const p of prepares) {
      const cle = stockage.nouvelleCle(clientId, p.ext);
      await stockage.deposer(cle, p.octets, p.type);
      const d = { ...p, cle, apercuCle: null };
      deposes.push(d);
      if (p.apercu) {
        d.apercuCle = stockage.nouvelleCle(clientId, 'jpg', '-apercu');
        await stockage.deposer(d.apercuCle, p.apercu, 'image/jpeg');
      }
    }
    return deposes;
  } catch (err) {
    await effacerDeposes(deposes, 'envoi interrompu');
    if (err.code === 'STOCKAGE_ABSENT') throw new ErreurPiece(503, 'STOCKAGE_ABSENT', 'Le stockage des factures n\'est pas encore configuré.');
    console.error('[pieces] dépôt :', err.message);
    throw new ErreurPiece(503, 'STOCKAGE_INDISPONIBLE', 'Le stockage des factures ne répond pas : réessayez dans un instant.');
  }
};

const clesDe = (pieces) => pieces.flatMap((p) => [p.cle, p.apercuCle ?? p.apercu_cle ?? null]);
/** Efface (sans lever) les fichiers d'une liste de pièces déposées ou de lignes de `factures_pieces`. */
const effacerDeposes = (pieces, contexte) => stockage.supprimerSansErreur(clesDe(pieces), contexte);

/** Enregistre les pièces déposées sur la facture, à partir du rang `ordreDepart`. → lignes insérées. */
const inserer = async (db, { factureId, clientId, deposes, ordreDepart, auteurId }) => {
  const lignes = [];
  for (const [i, d] of deposes.entries()) {
    const r = await db.query(
      `INSERT INTO factures_pieces (facture_id, client_id, ordre, cle, type_mime, taille, empreinte, nom_origine,
                                    apercu_cle, apercu_taille, depose_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, ordre, type_mime, taille, nom_origine, apercu_cle, depose_le`,
      [factureId, clientId, ordreDepart + i, d.cle, d.type, d.octets.length, d.empreinte, d.nom,
        d.apercuCle, d.apercuCle ? d.apercu.length : null, auteurId]
    );
    lignes.push(r.rows[0]);
  }
  return lignes;
};

const journaliser = (db, { clientId, factureId, action, auteurId, details = {} }) => db.query(
  `INSERT INTO factures_journal (client_id, facture_id, action, auteur_id, details) VALUES ($1, $2, $3, $4, $5)`,
  [clientId, factureId, action, auteurId, JSON.stringify(details)]
);

/** Ce que le journal retient d'une pièce. */
const resumePiece = (p) => ({
  nom: p.nom ?? p.nom_origine, type: p.type ?? p.type_mime, taille: p.octets ? p.octets.length : p.taille,
  empreinte: p.empreinte, avecApercu: !!(p.apercuCle ?? p.apercu_cle),
});

/** Forme d'une pièce dans les réponses de l'API. */
const versApi = (r) => ({
  id: r.id,
  ordre: r.ordre,
  nom: r.nom_origine,
  type: r.type_mime,
  taille: r.taille,
  avecApercu: !!r.apercu_cle,
  deposeLe: r.depose_le,
  deposeParNom: r.depose_par_nom ?? null,
});

module.exports = {
  OCTETS_MAX, PIECES_MAX, EXTENSIONS, AVEC_APERCU, ErreurPiece,
  detecterType, nomSur, empreinte, televersement, preparer, deposerTout, effacerDeposes, inserer, journaliser,
  resumePiece, versApi,
};
