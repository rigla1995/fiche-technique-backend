/* Stockage des fichiers téléversés (factures fournisseur, étape F1 — labflow-reprise/achats-compta/PLAN-FACTURES.md).
 *
 * Trois modes, choisis au premier appel d'après l'environnement :
 *   • « r2 »     : Cloudflare R2 (API compatible S3), les 4 variables R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 *                  R2_SECRET_ACCESS_KEY, R2_BUCKET posées par le client dans Coolify (GUIDE-R2.md) ;
 *   • « local »  : un dossier du disque (STOCKAGE_LOCAL), pour le poste de développement et les essais — jamais
 *                  choisi seul : un serveur sans R2 ni STOCKAGE_LOCAL n'écrit rien sur son disque (un conteneur perd
 *                  son disque à chaque déploiement) ;
 *   • « absent » : rien de configuré ; le dépôt d'une pièce répond 503 STOCKAGE_ABSENT.
 * Les clés sont fabriquées par le serveur (`clients/<n°>/pieces/<aaaa>/<mm>/<uuid>.<ext>`) : jamais de nom fourni par
 * l'utilisateur dans un chemin. Le compartiment R2 est privé : un fichier ne sort que par une route authentifiée. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CLE_SURE = /^[a-z0-9][a-z0-9/._-]{0,199}$/;

let etat = null;

const config = () => {
  if (etat) return etat;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, STOCKAGE_LOCAL } = process.env;
  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET) {
    const { AwsClient } = require('aws4fetch');
    etat = {
      mode: 'r2',
      base: `https://${R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com/${encodeURIComponent(R2_BUCKET.trim())}`,
      client: new AwsClient({
        accessKeyId: R2_ACCESS_KEY_ID.trim(), secretAccessKey: R2_SECRET_ACCESS_KEY.trim(), service: 's3', region: 'auto',
      }),
    };
  } else if (STOCKAGE_LOCAL) {
    etat = { mode: 'local', dossier: path.resolve(STOCKAGE_LOCAL) };
  } else {
    etat = { mode: 'absent' };
  }
  return etat;
};

/** Mode du stockage : « r2 », « local » ou « absent ». */
const mode = () => config().mode;
const disponible = () => mode() !== 'absent';

class StockageErreur extends Error {
  constructor(message, code = 'STOCKAGE_ERREUR') { super(message); this.code = code; }
}

const controlerCle = (cle) => {
  if (typeof cle !== 'string' || !CLE_SURE.test(cle) || cle.includes('..') || cle.includes('//')) {
    throw new StockageErreur(`clé de stockage refusée : ${cle}`, 'CLE_REFUSEE');
  }
};

/** Clé neuve pour un fichier d'un compte ; `ext` sans point (pdf, jpg…). */
const nouvelleCle = (clientId, ext, suffixe = '') => {
  const d = new Date();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const cle = `clients/${Number(clientId)}/pieces/${d.getUTCFullYear()}/${mm}/${crypto.randomUUID()}${suffixe}.${ext}`;
  controlerCle(cle);
  return cle;
};

const cheminLocal = (cle) => {
  const { dossier } = config();
  const p = path.resolve(dossier, ...cle.split('/'));
  if (!p.startsWith(dossier + path.sep)) throw new StockageErreur(`clé hors du dossier : ${cle}`, 'CLE_REFUSEE');
  return p;
};

const urlR2 = (cle) => `${config().base}/${cle.split('/').map(encodeURIComponent).join('/')}`;

const appelR2 = async (methode, cle, options = {}) => {
  const { client } = config();
  let rep;
  try {
    rep = await client.fetch(urlR2(cle), { method: methode, ...options });
  } catch (err) {
    throw new StockageErreur(`stockage injoignable (${methode}) : ${err.message}`);
  }
  return rep;
};

/** Dépose `octets` (Buffer) sous `cle`. */
const deposer = async (cle, octets, typeMime) => {
  controlerCle(cle);
  const m = mode();
  if (m === 'absent') throw new StockageErreur('stockage non configuré', 'STOCKAGE_ABSENT');
  if (m === 'local') {
    const p = cheminLocal(cle);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, octets, { flag: 'wx' });
    return;
  }
  const rep = await appelR2('PUT', cle, {
    body: octets,
    headers: { 'Content-Type': typeMime },
  });
  if (!rep.ok) throw new StockageErreur(`envoi refusé par le stockage (${rep.status})`);
};

/** Relit le fichier `cle` (Buffer) ; null s'il n'existe pas. */
const lire = async (cle) => {
  controlerCle(cle);
  const m = mode();
  if (m === 'absent') throw new StockageErreur('stockage non configuré', 'STOCKAGE_ABSENT');
  if (m === 'local') {
    try { return await fs.promises.readFile(cheminLocal(cle)); } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }
  const rep = await appelR2('GET', cle);
  if (rep.status === 404) return null;
  if (!rep.ok) throw new StockageErreur(`lecture refusée par le stockage (${rep.status})`);
  return Buffer.from(await rep.arrayBuffer());
};

/** Efface `cle` (sans erreur s'il n'existe déjà plus). */
const supprimer = async (cle) => {
  controlerCle(cle);
  const m = mode();
  if (m === 'absent') throw new StockageErreur('stockage non configuré', 'STOCKAGE_ABSENT');
  if (m === 'local') {
    try { await fs.promises.unlink(cheminLocal(cle)); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    return;
  }
  const rep = await appelR2('DELETE', cle);
  if (!rep.ok && rep.status !== 404) throw new StockageErreur(`effacement refusé par le stockage (${rep.status})`);
};

/** Efface une liste de clés après coup, sans jamais lever : un échec est journalisé (fichier orphelin à reprendre). */
const supprimerSansErreur = async (cles, contexte) => {
  for (const cle of cles.filter(Boolean)) {
    try { await supprimer(cle); } catch (err) {
      console.error(`[stockage] fichier non effacé (${contexte}) : ${cle} — ${err.message}`);
    }
  }
};

// Sonde du démarrage (affichée par /health) : lire une clé qui n'existe pas doit répondre « absent » (404), ce qui
// prouve l'adresse, le compartiment et la clé d'accès sans rien écrire.
let sonde = 'non_sonde';
const sonder = async () => {
  const m = mode();
  if (m !== 'r2') { sonde = m; return sonde; }
  try {
    const rep = await appelR2('GET', 'sante/sonde-absente');
    sonde = rep.status === 404 ? 'r2_ok' : `r2_erreur_${rep.status}`;
  } catch (_) {
    sonde = 'r2_injoignable';
  }
  console.log(`[stockage] ${sonde}`);
  return sonde;
};
const etatSonde = () => (mode() === 'r2' ? sonde : mode());

/** Pour les tests : oublie la configuration lue (l'environnement a changé). */
const reinitialiser = () => { etat = null; sonde = 'non_sonde'; };

module.exports = {
  mode, disponible, nouvelleCle, deposer, lire, supprimer, supprimerSansErreur, sonder, etatSonde, reinitialiser,
  StockageErreur,
};
