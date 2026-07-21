const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { encryptPassword, decryptPassword, isConfigured } = require('../services/passwordCryptoService');
const { sendBossRevealCode } = require('../services/emailService');

// Mot de passe robuste (même règle que authController).
const isStrongPassword = (v) =>
  typeof v === 'string' && v.length >= 8 &&
  /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v) && /[@$!%*?&_\-#]/.test(v);
const WEAK_PWD_MSG = 'Mot de passe trop faible : minimum 8 caractères, avec majuscule, minuscule, chiffre et caractère spécial.';
const isEmail = (v) => typeof v === 'string' && v.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

const maskEmail = (e) => {
  const [u, d] = String(e).split('@');
  if (!d) return e;
  const head = u.slice(0, 2);
  return `${head}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`;
};

const ROLE_ANNUAIRE = ['client', 'gerant', 'acheteur'];
const REVEAL_TTL_MS = 10 * 60 * 1000; // validité du code
const REVEAL_WINDOW_SEC = 120;        // durée d'affichage du clair côté front

// ─── Gestion des comptes super_admin ──────────────────────────────────────────

// GET /api/boss/admins — liste des comptes super_admin + boss.
const listAdmins = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nom, email, role, actif, created_at
         FROM utilisateurs
        WHERE role IN ('super_admin', 'boss')
        ORDER BY (role = 'boss') DESC, id ASC`
    );
    res.json(r.rows.map((u) => ({
      id: u.id, nom: u.nom, email: u.email, role: u.role,
      actif: u.actif, createdAt: u.created_at,
      isSelf: u.id === req.user.id,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/boss/admins — créer un super_admin.
const createAdmin = async (req, res) => {
  const nom = typeof req.body.nom === 'string' ? req.body.nom.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  const password = req.body.password || req.body.mot_de_passe;
  try {
    if (nom.length < 2 || nom.length > 150) return res.status(400).json({ message: 'Nom invalide' });
    if (!isEmail(email)) return res.status(400).json({ message: 'Email invalide' });
    if (!isStrongPassword(password)) return res.status(400).json({ message: WEAK_PWD_MSG });

    const exists = await pool.query('SELECT 1 FROM utilisateurs WHERE LOWER(email) = LOWER($1)', [email]);
    if (exists.rows.length > 0) return res.status(409).json({ message: 'Cet email est déjà utilisé' });

    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, mot_de_passe_enc, role, actif, activated_at, onboarding_step)
       VALUES ($1, $2, $3, $4, 'super_admin', true, NOW(), 0)
       RETURNING id, nom, email, role, actif, created_at`,
      [nom, email, hash, encryptPassword(password)]
    );
    const u = r.rows[0];
    res.status(201).json({ id: u.id, nom: u.nom, email: u.email, role: u.role, actif: u.actif, createdAt: u.created_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/boss/admins/:id — modifier email et/ou mot de passe d'un super_admin.
const updateAdmin = async (req, res) => {
  const { id } = req.params;
  const email = req.body.email !== undefined ? String(req.body.email).trim() : undefined;
  const password = req.body.password || req.body.mot_de_passe;
  try {
    const cur = await pool.query('SELECT id, role FROM utilisateurs WHERE id = $1', [id]);
    if (cur.rows.length === 0) return res.status(404).json({ message: 'Compte introuvable' });
    if (cur.rows[0].role !== 'super_admin') {
      return res.status(403).json({ message: 'Seuls les comptes super_admin sont modifiables ici' });
    }

    const sets = ['updated_at = NOW()'];
    const params = [];
    let i = 1;
    if (email !== undefined) {
      if (!isEmail(email)) return res.status(400).json({ message: 'Email invalide' });
      const dup = await pool.query('SELECT 1 FROM utilisateurs WHERE LOWER(email) = LOWER($1) AND id <> $2', [email, id]);
      if (dup.rows.length > 0) return res.status(409).json({ message: 'Cet email est déjà utilisé' });
      sets.push(`email = $${i++}`); params.push(email);
    }
    if (password) {
      if (!isStrongPassword(password)) return res.status(400).json({ message: WEAK_PWD_MSG });
      const hash = await bcrypt.hash(password, 10);
      sets.push(`mot_de_passe = $${i++}`); params.push(hash);
      sets.push(`mot_de_passe_enc = $${i++}`); params.push(encryptPassword(password));
      sets.push('password_changed_at = NOW()');
    }
    if (params.length === 0) return res.status(400).json({ message: 'Rien à modifier' });

    params.push(id);
    const r = await pool.query(
      `UPDATE utilisateurs SET ${sets.join(', ')} WHERE id = $${i}
       RETURNING id, nom, email, role, actif, created_at`,
      params
    );
    const u = r.rows[0];
    res.json({ id: u.id, nom: u.nom, email: u.email, role: u.role, actif: u.actif, createdAt: u.created_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/boss/admins/:id — supprimer un super_admin.
const deleteAdmin = async (req, res) => {
  const { id } = req.params;
  try {
    if (Number(id) === req.user.id) return res.status(400).json({ message: 'Impossible de supprimer votre propre compte' });
    const cur = await pool.query('SELECT role FROM utilisateurs WHERE id = $1', [id]);
    if (cur.rows.length === 0) return res.status(404).json({ message: 'Compte introuvable' });
    if (cur.rows[0].role !== 'super_admin') {
      return res.status(403).json({ message: 'Seuls les comptes super_admin sont supprimables ici' });
    }
    await pool.query('DELETE FROM utilisateurs WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Annuaire identifiants (clients / gérants / acheteurs) ─────────────────────

// GET /api/boss/annuaire?search=&role= — email + hash ; le clair n'est JAMAIS renvoyé ici.
const listAnnuaire = async (req, res) => {
  try {
    const { search, role } = req.query;
    const params = [];
    const conds = [`u.role = ANY($1::text[])`];
    params.push(role && ROLE_ANNUAIRE.includes(role) ? [role] : ROLE_ANNUAIRE);
    if (search && String(search).trim()) {
      params.push(`%${String(search).trim()}%`);
      conds.push(`(u.nom ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    const r = await pool.query(
      `SELECT u.id, u.nom, u.email, u.role, u.actif, u.created_at,
              u.mot_de_passe AS hash,
              (u.mot_de_passe_enc IS NOT NULL) AS revealable,
              p.nom AS parent_nom
         FROM utilisateurs u
         LEFT JOIN utilisateurs p ON p.id = u.gerant_parent_id
        WHERE ${conds.join(' AND ')}
        ORDER BY u.role, u.nom
        LIMIT 500`,
      params
    );
    res.json({
      cryptoConfigured: isConfigured(),
      items: r.rows.map((u) => ({
        id: u.id, nom: u.nom, email: u.email, role: u.role, actif: u.actif,
        parentNom: u.parent_nom || null,
        motDePasseHash: u.hash || null,
        revealable: u.revealable,
        createdAt: u.created_at,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/boss/reveal/request {targetUserId} — envoie un code au mail du Boss.
const requestReveal = async (req, res) => {
  const targetUserId = Number(req.body.targetUserId);
  try {
    if (!Number.isInteger(targetUserId)) return res.status(400).json({ message: 'Cible invalide' });
    const t = await pool.query(
      `SELECT id, nom, email, role, mot_de_passe_enc FROM utilisateurs WHERE id = $1`,
      [targetUserId]
    );
    if (t.rows.length === 0 || !ROLE_ANNUAIRE.includes(t.rows[0].role)) {
      return res.status(404).json({ message: 'Compte cible introuvable' });
    }
    if (!t.rows[0].mot_de_passe_enc) {
      return res.status(409).json({ code: 'NON_RECUPERABLE', message: 'Mot de passe non récupérable (défini avant l\'activation de la fonction). Réinitialisez-le pour le rendre récupérable.' });
    }

    // Un seul code actif à la fois pour ce couple (boss, cible).
    await pool.query(
      `DELETE FROM boss_reveal_codes WHERE boss_id = $1 AND target_user_id = $2 AND consumed_at IS NULL`,
      [req.user.id, targetUserId]
    );

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + REVEAL_TTL_MS);
    await pool.query(
      `INSERT INTO boss_reveal_codes (boss_id, target_user_id, code_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [req.user.id, targetUserId, codeHash, expiresAt]
    );

    await sendBossRevealCode({
      to: req.user.email,
      code,
      targetLabel: `${t.rows[0].nom} (${t.rows[0].email})`,
    });

    res.json({ sent: true, to: maskEmail(req.user.email), expiresInSec: Math.round(REVEAL_TTL_MS / 1000) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/boss/reveal/verify {targetUserId, code} — renvoie le clair si le code est bon.
const verifyReveal = async (req, res) => {
  const targetUserId = Number(req.body.targetUserId);
  const code = String(req.body.code || '').trim();
  try {
    if (!Number.isInteger(targetUserId) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Code invalide' });
    }
    const c = await pool.query(
      `SELECT id, code_hash FROM boss_reveal_codes
        WHERE boss_id = $1 AND target_user_id = $2 AND consumed_at IS NULL AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, targetUserId]
    );
    if (c.rows.length === 0) return res.status(400).json({ message: 'Aucun code valide — redemandez un code.' });

    const ok = await bcrypt.compare(code, c.rows[0].code_hash);
    if (!ok) return res.status(400).json({ message: 'Code incorrect' });

    // Consommer le code AVANT de renvoyer le clair (usage unique strict).
    await pool.query('UPDATE boss_reveal_codes SET consumed_at = NOW() WHERE id = $1', [c.rows[0].id]);

    const t = await pool.query('SELECT mot_de_passe_enc FROM utilisateurs WHERE id = $1', [targetUserId]);
    const plain = decryptPassword(t.rows[0]?.mot_de_passe_enc);
    if (!plain) return res.status(409).json({ code: 'NON_RECUPERABLE', message: 'Mot de passe non récupérable.' });

    res.json({ password: plain, expiresInSec: REVEAL_WINDOW_SEC });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  listAdmins, createAdmin, updateAdmin, deleteAdmin,
  listAnnuaire, requestReveal, verifyReveal,
};
