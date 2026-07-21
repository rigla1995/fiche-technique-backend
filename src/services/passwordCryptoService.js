// ⚠️ Chiffrement RÉVERSIBLE des mots de passe (en plus du hash bcrypt), pour la
// fonction « annuaire identifiants » du compte Boss. C'est un affaiblissement de
// sécurité ASSUMÉ (choix client) : une fuite conjointe de la base ET de la clé
// PASSWORD_ENC_KEY exposerait les mots de passe en clair. À manier avec prudence.
//
// Clé : variable d'env PASSWORD_ENC_KEY. Acceptée en hex 64 caractères (32 octets)
// ou n'importe quelle chaîne (dérivée en 32 octets via SHA-256). Si absente, le
// chiffrement est simplement désactivé (mot_de_passe_enc reste NULL → « non
// récupérable » dans l'annuaire) — l'app continue de fonctionner normalement.
const crypto = require('crypto');

const ALG = 'aes-256-gcm';

function getKey() {
  const raw = process.env.PASSWORD_ENC_KEY || '';
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

// Renvoie une chaîne "ivB64:tagB64:cipherB64" ou null si non configuré / entrée vide.
function encryptPassword(plain) {
  const key = getKey();
  if (!key || plain == null || plain === '') return null;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALG, key, iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  } catch (e) {
    console.error('[passwordCrypto] encrypt:', e.message);
    return null;
  }
}

// Renvoie le clair, ou null si non configuré / donnée absente / altérée.
function decryptPassword(stored) {
  const key = getKey();
  if (!key || !stored) return null;
  try {
    const [ivB, tagB, dataB] = String(stored).split(':');
    if (!ivB || !tagB || !dataB) return null;
    const decipher = crypto.createDecipheriv(ALG, key, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('[passwordCrypto] decrypt:', e.message);
    return null;
  }
}

const isConfigured = () => !!getKey();

module.exports = { encryptPassword, decryptPassword, isConfigured };
