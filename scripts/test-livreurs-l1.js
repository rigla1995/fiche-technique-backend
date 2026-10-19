/* Test E2E local — module « Livreurs », étape L1 « comptes livreurs » (labflow-reprise/livreurs/PLAN-LIVREURS.md).
 *   POST /api/livreurs : contrôles (NOM_REQUIS, TELEPHONE_INVALIDE, EMAIL_INVALIDE), création SANS e-mail (mot de passe
 *     initial renvoyé une fois, doitChangerMdp), création AVEC e-mail (invitation), TELEPHONE_DEJA_PRIS, quota 5
 *     (LIMITE_ATTEINTE) ;
 *   connexion du livreur par téléphone (indicatif toléré) et par e-mail ; périmètre : /api/livreur/moi 200, le reste 403,
 *     notifications 200 ; blocage d'un livreur désactivé ;
 *   PUT /auth/profile : remplacement du mot de passe initial (doitChangerMdp → false, anciens jetons révoqués) ;
 *   POST /:id/mot-de-passe (nouveau mot de passe initial), /:id/inviter (SANS_EMAIL, DEJA_ACTIVE), PUT (nom, téléphone,
 *     actif), DELETE (compte supprimé) ; gérant avec / sans accès acheteurs ; fiche « livreurs » du manuel ;
 *   migration 250 rejouable.
 * Crée un super_admin, un client (1 labo, option Acheteurs, 2 gérants), des livreurs temporaires, puis nettoie. Données
 * fictives. ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MDP = `${crypto.randomBytes(12).toString('base64url')}Aa1!`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const appel = async (methode, chemin, jeton, corps) => {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const login = async (identifiant, mdp = MDP) => appel('POST', '/auth/login', null, { email: identifiant, password: mdp });
const robuste = (v) => typeof v === 'string' && v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v) && /[@$!%*?&_\-#]/.test(v);

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-l1@example.com';
  const CLIENT = 'test-l1-client@example.com';
  const GERANTS = ['test-l1-gerant-ok@example.com', 'test-l1-gerant-sans@example.com'];
  const LIV2 = 'test-l1-livreur2@example.com';
  const TELS = ['22345678', '98765432', '55123456', '20111222', '20111223', '20111224', '20111225'];
  let adminTok = null;
  let clientId = null;
  const wipe = async () => {
    if (adminTok && clientId) await appel('DELETE', `/admin/clients/${clientId}`, adminTok);
    const ids = (await pool.query(
      `SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1) OR email LIKE 'livreur-%@livreurs.labflow.local' AND email = ANY($2)`,
      [[ADMIN, CLIENT, ...GERANTS, LIV2], TELS.map((t) => `livreur-${t}@livreurs.labflow.local`)]
    )).rows.map((r) => r.id);
    const livIds = (await pool.query('SELECT user_id FROM livreurs WHERE telephone_norm = ANY($1)', [TELS])).rows.map((r) => r.user_id);
    const tous = [...new Set([...ids, ...livIds])];
    if (tous.length) {
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM profil_entreprise WHERE client_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [tous]);
    }
  };
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };

  try {
    // ── 0. Repartir propre ──
    const restes = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT, ...GERANTS, LIV2]])).rows;
    if (restes.length) {
      await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin L1', $1, $2, 'super_admin', true, 0, NOW()) ON CONFLICT DO NOTHING`, [ADMIN, hash]);
      adminTok = (await login(ADMIN)).body?.token;
      const c = (await pool.query(`SELECT id FROM utilisateurs WHERE LOWER(email) = $1 AND role = 'client'`, [CLIENT])).rows[0];
      if (c) await appel('DELETE', `/admin/clients/${c.id}`, adminTok);
      await wipe();
      adminTok = null;
    } else {
      await wipe();
    }
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin L1', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);

    // ── Migration 250 rejouable ──
    const sql250 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '250_livreurs.sql'), 'utf8');
    let rejouee = true;
    try { await pool.query(sql250); } catch (e) { rejouee = false; console.error(e.message); }
    check('migration 250 rejouable', rejouee);

    // ── Client avec option Acheteurs, 1 labo, 2 gérants ──
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST L1 Traiteur', email: CLIENT, telephone: '20 555 801', nbActivites: 1, nbLabos: 1, nbGerants: 2, nbAcheteurs: 20, montantOnboarding: 0 });
    check('client créé (1 labo, option Acheteurs, 2 gérants)', r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);
    const cli = await activer(CLIENT);
    clientId = cli.id;
    const tok = cli.tok;
    const labo = (await appel('POST', '/api/labo', tok, { nom: 'Dépôt L1', refLabo: 'DL1' })).body;
    check('préparation : labo créé', !!labo?.id, JSON.stringify(labo));

    // ── 1. Liste vide + plafond ──
    r = await appel('GET', '/api/livreurs', tok);
    check('GET /api/livreurs : liste vide, plafond 5', r.status === 200 && Array.isArray(r.body?.livreurs) && r.body.livreurs.length === 0 && r.body?.max === 5, `${r.status} ${JSON.stringify(r.body)}`);

    // ── 2. Contrôles de saisie ──
    r = await appel('POST', '/api/livreurs', tok, { nom: '', telephone: '22 345 678' });
    const r2 = await appel('POST', '/api/livreurs', tok, { nom: 'Sans Tel' });
    const r3 = await appel('POST', '/api/livreurs', tok, { nom: 'Tel Faux', telephone: '12 345 678' });
    const r4 = await appel('POST', '/api/livreurs', tok, { nom: 'Mail Faux', telephone: '22 345 678', email: 'pas-un-mail' });
    const r5 = await appel('POST', '/api/livreurs', tok, { nom: 'Mail Tech', telephone: '22 345 678', email: 'livreur-1@livreurs.labflow.local' });
    check('400 NOM_REQUIS / TELEPHONE_INVALIDE (absent, puis hors format) / EMAIL_INVALIDE (forme, puis adresse technique)',
      r.status === 400 && r.body?.code === 'NOM_REQUIS' && r2.status === 400 && r2.body?.code === 'TELEPHONE_INVALIDE' && r3.status === 400 && r3.body?.code === 'TELEPHONE_INVALIDE'
      && r4.status === 400 && r4.body?.code === 'EMAIL_INVALIDE' && r5.status === 400 && r5.body?.code === 'EMAIL_INVALIDE',
      `${r.status} ${r2.status} ${r3.status} ${r4.status} ${r5.status}`);

    // ── 3. Création sans e-mail : mot de passe initial ──
    r = await appel('POST', '/api/livreurs', tok, { nom: 'Livreur Un', telephone: '+216 22 345 678' });
    const l1 = r.body;
    const mdp1 = l1?.motDePasseInitial;
    check('création sans e-mail : 201, téléphone « 22 345 678 », e-mail null, mot de passe initial robuste, doitChangerMdp, pas d\'invitation',
      r.status === 201 && l1?.telephone === '22 345 678' && l1?.email === null && robuste(mdp1) && l1?.doitChangerMdp === true && l1?.inviteEnAttente === false && l1?.emailEnvoye === false && l1?.activatedAt,
      `${r.status} ${JSON.stringify({ ...l1, motDePasseInitial: mdp1 ? '***' : null })}`);
    r = await appel('POST', '/api/livreurs', tok, { nom: 'Livreur Doublon', telephone: '22345678' });
    check('même numéro (autre écriture) → 409 TELEPHONE_DEJA_PRIS', r.status === 409 && r.body?.code === 'TELEPHONE_DEJA_PRIS', `${r.status} ${r.body?.code}`);

    // ── 4. Création avec e-mail : invitation ──
    r = await appel('POST', '/api/livreurs', tok, { nom: 'Livreur Deux', telephone: '98 765 432', email: LIV2.toUpperCase() });
    const l2 = r.body;
    check('création avec e-mail : 201, invitation envoyée (bouchon), e-mail en minuscules, sans mot de passe initial, invite en attente',
      r.status === 201 && l2?.emailEnvoye === true && l2?.email === LIV2 && l2?.motDePasseInitial === null && l2?.inviteEnAttente === true && !l2?.activatedAt,
      `${r.status} ${JSON.stringify(l2)}`);
    r = await appel('GET', '/api/livreurs', tok);
    check('GET /api/livreurs : 2 livreurs, créés par le client', r.status === 200 && r.body?.livreurs?.length === 2 && r.body.livreurs.every((l) => l.creePar === 'TEST L1 Traiteur'), `${r.status} ${JSON.stringify(r.body?.livreurs?.map((l) => l.creePar))}`);

    // ── 5. Connexion du livreur 1 par téléphone (indicatif toléré) ──
    r = await login('+216 22 345 678', mdp1);
    const tokL1 = r.body?.token;
    check('connexion par téléphone : 200, rôle livreur, doitChangerMdp, fiche livreur, e-mail null, domaine du client',
      r.status === 200 && r.body?.user?.role === 'livreur' && r.body.user.doitChangerMdp === true && r.body.user.livreur?.telephone === '22 345 678' && r.body.user.email === null && r.body.user.entrepriseName === 'TEST L1 Traiteur',
      `${r.status} ${JSON.stringify(r.body?.user)}`);
    r = await login('22 345 678', 'MauvaisMdp1!');
    check('mauvais mot de passe → 401 « Téléphone ou mot de passe incorrect »', r.status === 401 && /Téléphone/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await login('22 345 677', mdp1);
    check('numéro inconnu → 401', r.status === 401, `${r.status}`);

    // ── 6. Périmètre du rôle ──
    r = await appel('GET', '/api/livreur/moi', tokL1);
    const r6b = await appel('GET', '/api/acheteurs', tokL1);
    const r6c = await appel('GET', '/api/articles', tokL1);
    const r6d = await appel('GET', '/api/livreurs', tokL1);
    const r6e = await appel('GET', '/api/notifications', tokL1);
    const r6f = await appel('GET', '/auth/me', tokL1);
    check('périmètre : /api/livreur/moi 200 (nom, entreprise) ; /api/acheteurs, /api/articles, /api/livreurs → 403 ; notifications 200 ; /auth/me livreur',
      r.status === 200 && r.body?.nom === 'Livreur Un' && r.body?.entreprise === 'TEST L1 Traiteur' && r.body?.doitChangerMdp === true
      && r6b.status === 403 && r6c.status === 403 && r6d.status === 403 && r6e.status === 200 && r6f.status === 200 && r6f.body?.role === 'livreur' && r6f.body?.doitChangerMdp === true && r6f.body?.email === null,
      `${r.status} ${r6b.status} ${r6c.status} ${r6d.status} ${r6e.status} ${r6f.status}`);

    // ── 7. Remplacement du mot de passe initial ──
    const nouveau = 'Nouveau-Mdp-2026!';
    // La révocation compare l'iat du jeton (à la seconde) à password_changed_at, strictement : un jeton émis dans la même
    // seconde que le changement reste valable (tolérance voulue du middleware) — on laisse passer une seconde.
    await new Promise((res) => setTimeout(res, 1100));
    r = await appel('PUT', '/auth/profile', tokL1, { currentPassword: 'faux', password: nouveau });
    const r7b = await appel('PUT', '/auth/profile', tokL1, { currentPassword: mdp1, password: 'faible' });
    const r7c = await appel('PUT', '/auth/profile', tokL1, { currentPassword: mdp1, password: nouveau, email: 'intrus@example.com' });
    check('PUT /auth/profile : actuel faux → 400 ; nouveau faible → 400 ; bon → 200 doitChangerMdp false (e-mail ignoré), jeton neuf renvoyé',
      r.status === 400 && r7b.status === 400 && r7c.status === 200 && r7c.body?.doitChangerMdp === false && r7c.body?.email === null && typeof r7c.body?.token === 'string', `${r.status} ${r7b.status} ${r7c.status} ${JSON.stringify({ ...r7c.body, token: r7c.body?.token ? '***' : null })}`);
    const r7t = await appel('GET', '/api/livreur/moi', r7c.body?.token);
    check('le jeton neuf ouvre l\'espace livreur sans reconnexion (doitChangerMdp false)', r7t.status === 200 && r7t.body?.doitChangerMdp === false, `${r7t.status}`);
    await new Promise((res) => setTimeout(res, 1100)); // iat à la seconde : le nouveau jeton doit être postérieur au changement
    const r7d = await appel('GET', '/api/livreur/moi', tokL1);
    r = await login('22345678', nouveau);
    const tokL1b = r.body?.token;
    const r7e = await appel('GET', '/api/livreur/moi', tokL1b);
    check('ancien jeton révoqué (401) ; reconnexion avec le nouveau mot de passe : doitChangerMdp false ; /moi 200',
      r7d.status === 401 && r.status === 200 && r.body?.user?.doitChangerMdp === false && r7e.status === 200 && r7e.body?.doitChangerMdp === false, `${r7d.status} ${r.status} ${r7e.status}`);
    r = await login('22345678', mdp1);
    check('l\'ancien mot de passe initial ne passe plus', r.status === 401, `${r.status}`);

    // ── 8. Livreur 2 : invitation, activation, connexion par e-mail ──
    r = await login(LIV2, MDP);
    check('livreur invité non activé → 403 invite_pending', r.status === 403 && r.body?.message === 'invite_pending', `${r.status} ${r.body?.message}`);
    const jeton2 = (await pool.query('SELECT invite_token FROM utilisateurs WHERE LOWER(email) = $1', [LIV2])).rows[0]?.invite_token;
    r = await appel('GET', `/auth/invite/${jeton2}`, null);
    const r8b = await appel('POST', '/auth/invite/accept', null, { token: jeton2, password: MDP });
    r = await login(LIV2, MDP);
    const tokL2 = r.body?.token;
    check('activation par le lien (rôle livreur) puis connexion par e-mail : 200, doitChangerMdp false, e-mail visible',
      r8b.status === 200 && r.status === 200 && r.body?.user?.role === 'livreur' && r.body.user.doitChangerMdp === false && r.body.user.email === LIV2, `${r8b.status} ${r.status} ${JSON.stringify(r.body?.user)}`);
    r = await appel('POST', `/api/livreurs/${l2.id}/inviter`, tok);
    const r8c = await appel('POST', `/api/livreurs/${l1.id}/inviter`, tok);
    check('renvoi d\'invitation : compte activé → 409 DEJA_ACTIVE ; sans e-mail → 400 SANS_EMAIL', r.status === 409 && r.body?.code === 'DEJA_ACTIVE' && r8c.status === 400 && r8c.body?.code === 'SANS_EMAIL', `${r.status} ${r8c.status}`);

    // ── 9. Nouveau mot de passe initial par le client ──
    await new Promise((res) => setTimeout(res, 1100)); // même tolérance à la seconde (iat du jeton de l'étape 7)
    r = await appel('POST', `/api/livreurs/${l1.id}/mot-de-passe`, tok);
    const mdp1b = r.body?.motDePasseInitial;
    await new Promise((res) => setTimeout(res, 1100));
    const r9b = await appel('GET', '/api/livreur/moi', tokL1b);
    const r9c = await login('22345678', mdp1b);
    check('POST /:id/mot-de-passe : nouveau mot de passe robuste, doitChangerMdp true, sessions fermées (401), connexion avec le nouveau',
      r.status === 200 && robuste(mdp1b) && mdp1b !== mdp1 && r.body?.livreur?.doitChangerMdp === true && r9b.status === 401 && r9c.status === 200 && r9c.body?.user?.doitChangerMdp === true,
      `${r.status} ${r9b.status} ${r9c.status}`);
    const tokL1c = r9c.body?.token;

    // ── 10. Désactivation / réactivation ──
    r = await appel('PUT', `/api/livreurs/${l1.id}`, tok, { actif: false });
    await new Promise((res) => setTimeout(res, 100));
    const r10b = await login('22345678', mdp1b);
    const r10c = await appel('GET', '/api/livreur/moi', tokL1c);
    const r10d = await appel('PUT', `/api/livreurs/${l1.id}`, tok, { actif: true });
    const r10e = await login('22345678', mdp1b);
    check('désactivé : actif false, connexion refusée (401), jeton en cours refusé (401) ; réactivé : connexion OK',
      r.status === 200 && r.body?.actif === false && r10b.status === 401 && r10c.status === 401 && r10d.status === 200 && r10d.body?.actif === true && r10e.status === 200,
      `${r.status} ${r10b.status} ${r10c.status} ${r10d.status} ${r10e.status}`);

    // ── 11. Modification : téléphone pris, puis nom + téléphone ──
    r = await appel('PUT', `/api/livreurs/${l1.id}`, tok, { telephone: '98 765 432' });
    const r11b = await appel('PUT', `/api/livreurs/${l1.id}`, tok, { nom: 'Livreur Un Bis', telephone: '55 123 456' });
    const r11c = await login('55123456', mdp1b);
    const r11d = await appel('PUT', `/api/livreurs/${l1.id}`, tok, { telephone: '00 000' });
    check('PUT : téléphone d\'un autre livreur → 409 ; nom + téléphone → 200 (connexion au nouveau numéro) ; téléphone invalide → 400',
      r.status === 409 && r11b.status === 200 && r11b.body?.nom === 'Livreur Un Bis' && r11b.body?.telephone === '55 123 456' && r11c.status === 200 && r11d.status === 400,
      `${r.status} ${r11b.status} ${r11c.status} ${r11d.status}`);
    const emailTech = (await pool.query('SELECT email, nom, telephone FROM utilisateurs WHERE id = $1', [l1.userId])).rows[0];
    check('compte de connexion suivi : adresse technique au nouveau numéro, nom et téléphone miroirs', emailTech?.email === 'livreur-55123456@livreurs.labflow.local' && emailTech?.nom === 'Livreur Un Bis' && emailTech?.telephone === '55 123 456', JSON.stringify(emailTech));

    // ── 12. Quota : 5 par compte ──
    const crees = [];
    for (const t of ['20111222', '20111223', '20111224']) crees.push(await appel('POST', '/api/livreurs', tok, { nom: `Livreur ${t}`, telephone: t }));
    r = await appel('POST', '/api/livreurs', tok, { nom: 'Livreur Six', telephone: '20111225' });
    check('quota : 3e, 4e, 5e créés ; 6e → 409 LIMITE_ATTEINTE (5/5)', crees.every((c) => c.status === 201) && r.status === 409 && r.body?.code === 'LIMITE_ATTEINTE' && r.body?.max === 5 && r.body?.actuel === 5, `${crees.map((c) => c.status).join(',')} ${r.status} ${JSON.stringify(r.body)}`);

    // ── 13. Gérants : avec et sans accès à la base acheteurs ──
    r = await appel('POST', '/api/abonnements/gerants', tok, { nom: 'Gérant Avec', telephone: '20 555 802', email: GERANTS[0], laboIds: [labo.id], accesAcheteurs: true });
    const r13b = await appel('POST', '/api/abonnements/gerants', tok, { nom: 'Gérant Sans', telephone: '20 555 803', email: GERANTS[1], laboIds: [labo.id], accesAcheteurs: false });
    check('deux gérants créés', r.status === 201 && r13b.status === 201, `${r.status} ${r13b.status} ${JSON.stringify(r13b.body)}`);
    const gAvec = await activer(GERANTS[0]);
    const gSans = await activer(GERANTS[1]);
    r = await appel('GET', '/api/livreurs', gAvec.tok);
    const r13c = await appel('POST', '/api/livreurs', gAvec.tok, { nom: 'Par Gérant', telephone: '20111225' });
    const r13d = await appel('GET', '/api/livreurs', gSans.tok);
    check('gérant avec accès : liste du compte (5) et création soumise au même quota (409) ; gérant sans accès → 403 ACHETEURS_GERANT_NON_AUTORISE',
      r.status === 200 && r.body?.livreurs?.length === 5 && r13c.status === 409 && r13d.status === 403 && r13d.body?.code === 'ACHETEURS_GERANT_NON_AUTORISE', `${r.status} ${r13c.status} ${r13d.status}`);
    r = await appel('DELETE', `/api/livreurs/${crees[2].body?.id}`, gAvec.tok);
    const r13e = await appel('POST', '/api/livreurs', gAvec.tok, { nom: 'Par Gérant', telephone: '20111225' });
    check('gérant avec accès : suppression (204) puis création (201, créé par le gérant)', r.status === 204 && r13e.status === 201 && r13e.body?.creePar === 'Gérant Avec', `${r.status} ${r13e.status} ${r13e.body?.creePar}`);

    // ── 14. Suppression : compte de connexion supprimé ──
    r = await appel('DELETE', `/api/livreurs/${l1.id}`, tok);
    const reste = (await pool.query('SELECT 1 FROM utilisateurs WHERE id = $1', [l1.userId])).rows.length;
    const r14b = await login('55123456', mdp1b);
    const r14c = await appel('DELETE', `/api/livreurs/${l1.id}`, tok);
    check('DELETE : 204, compte de connexion supprimé, connexion impossible, second DELETE → 404', r.status === 204 && reste === 0 && r14b.status === 401 && r14c.status === 404, `${r.status} ${reste} ${r14b.status} ${r14c.status}`);

    // ── 15. Manuel : fiche « livreurs » visible du client (module acheteurs actif) ──
    r = await appel('GET', '/api/manuel', tok);
    const texte = JSON.stringify(r.body || '');
    check('manuel du client : fiche « livreurs » présente', r.status === 200 && /"slug":"livreurs"/.test(texte), `${r.status}`);
    const r15b = await appel('GET', '/api/manuel', tokL2);
    check('périmètre livreur : le manuel n\'est pas servi (403)', r15b.status === 403, `${r15b.status}`);
  } catch (e) {
    console.error('💥', e);
    results.push({ name: 'exception', ok: false });
  } finally {
    await wipe().catch((e) => console.error('nettoyage :', e.message));
    await pool.end().catch(() => {});
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} contrôles passés`);
  process.exit(ok === results.length ? 0 : 1);
})();
