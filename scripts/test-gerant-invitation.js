/* Test E2E local — renvoi de l'invitation d'un gérant par le client propriétaire du compte.
 * Défaut d'origine : l'écran « Gérants » du client appelait POST /auth/invite/resend/:id, route réservée au super
 * admin (403). Correctif : POST /api/abonnements/gerants/:id/inviter (client propriétaire, SES gérants non activés).
 * Couvre : client sur son gérant (200, jeton régénéré), gérant d'un autre compte (404), gérant déjà activé (409),
 * gérant appelant (403), sans jeton (401), identifiant non numérique (404), route admin inchangée (admin 200, client 403).
 * Crée un super_admin + 2 clients + 2 gérants temporaires, puis nettoie. */
// ⚠️ Démarrer le backend de test par « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué) —
//    jamais par « npm start » avec le .env d'un poste de développement, qui contient de vraies clés.
require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const MDP = 'TestGerInv2026!';
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
const login = async (email) => (await appel('POST', '/auth/login', null, { email, password: MDP })).body?.token;

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-gerinv@example.com';
  const CLIENTS = ['test-gerinv-1@example.com', 'test-gerinv-2@example.com'];
  const GERANTS = ['test-gerinv-g1@example.com', 'test-gerinv-g2@example.com'];
  const wipe = async () => {
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [GERANTS]);
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [CLIENTS]);
    await pool.query('DELETE FROM utilisateurs WHERE email = $1', [ADMIN]);
  };
  await wipe();

  try {
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminGerInv', $1, $2, 'super_admin', true)`,
      [ADMIN, hash]
    );
    const adminTok = await login(ADMIN);
    check('login super_admin temporaire', !!adminTok);

    // Deux clients activés, chacun avec 1 activité et 1 gérant non activé.
    const comptes = [];
    for (let i = 0; i < 2; i += 1) {
      let r = await appel('POST', '/admin/clients', adminTok, { nom: `TEST-GerInv${i + 1}`, email: CLIENTS[i], telephone: `2077700${i + 1}`, nbActivites: 1, nbLabos: 0, nbGerants: 1, montantOnboarding: 0 });
      check(`création client ${i + 1}`, r.status === 201, String(r.status));
      const id = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENTS[i]])).rows[0].id;
      await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, id]);
      const tok = await login(CLIENTS[i]);
      r = await appel('POST', '/api/entreprise/activites', tok, { nom: `Activité GerInv ${i + 1}` });
      check(`client ${i + 1} : activité créée`, r.status === 201, String(r.status));
      const activiteId = r.body?.id;
      r = await appel('POST', '/api/abonnements/gerants', tok, { nom: `TEST-Gérant GerInv ${i + 1}`, telephone: `2077710${i + 1}`, email: GERANTS[i], activiteIds: [activiteId] });
      check(`client ${i + 1} : gérant créé (non activé)`, r.status === 201 && !!r.body?.id, String(r.status));
      comptes.push({ id, tok, gerantId: r.body?.id });
    }
    const [c1, c2] = comptes;
    const jeton = async (gid) => (await pool.query('SELECT invite_token, invite_token_expires_at, activated_at FROM utilisateurs WHERE id = $1', [gid])).rows[0];

    // ── Route admin historique : inchangée (admin 200, client 403)
    let r = await appel('POST', `/auth/invite/resend/${c1.gerantId}`, c1.tok);
    check('route admin /auth/invite/resend : un client reste refusé (403)', r.status === 403, String(r.status));
    r = await appel('POST', `/auth/invite/resend/${c1.gerantId}`, adminTok);
    check('route admin /auth/invite/resend : le super admin passe (200)', r.status === 200, String(r.status));

    // ── Nouvelle route du client
    const avant = await jeton(c1.gerantId);
    r = await appel('POST', `/api/abonnements/gerants/${c1.gerantId}/inviter`, c1.tok);
    check('client → son gérant non activé : 200', r.status === 200 && r.body?.ok === true, `${r.status} ${JSON.stringify(r.body)}`);
    const apres = await jeton(c1.gerantId);
    check('jeton d\'invitation régénéré, valable ~48 h', !!apres.invite_token && apres.invite_token !== avant.invite_token
      && (new Date(apres.invite_token_expires_at) - Date.now()) > 47 * 3600 * 1000);

    const avant2 = await jeton(c2.gerantId);
    r = await appel('POST', `/api/abonnements/gerants/${c2.gerantId}/inviter`, c1.tok);
    check('client → gérant d\'un AUTRE compte : 404, jeton intact', r.status === 404 && (await jeton(c2.gerantId)).invite_token === avant2.invite_token, String(r.status));

    r = await appel('POST', `/api/abonnements/gerants/${c1.id}/inviter`, c1.tok);
    check('client → un identifiant qui n\'est pas un gérant (lui-même) : 404', r.status === 404, String(r.status));
    r = await appel('POST', '/api/abonnements/gerants/abc/inviter', c1.tok);
    check('identifiant non numérique : 404 (jamais 500)', r.status === 404, String(r.status));
    r = await appel('POST', `/api/abonnements/gerants/${c1.gerantId}/inviter`, null);
    check('sans jeton : 401', r.status === 401, String(r.status));
    r = await appel('POST', `/api/abonnements/gerants/${c1.gerantId}/inviter`, adminTok);
    check('super admin sur la route du client : 403 (il a la sienne)', r.status === 403, String(r.status));

    // ── Gérant activé : il ne peut pas appeler la route ; son invitation ne se renvoie plus
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, c1.gerantId]);
    const gerantTok = await login(GERANTS[0]);
    check('login du gérant activé', !!gerantTok);
    r = await appel('POST', `/api/abonnements/gerants/${c1.gerantId}/inviter`, gerantTok);
    check('gérant appelant : 403', r.status === 403, String(r.status));
    r = await appel('POST', `/api/abonnements/gerants/${c1.gerantId}/inviter`, c1.tok);
    check('client → son gérant DÉJÀ activé : 409, aucun jeton posé', r.status === 409 && (await jeton(c1.gerantId)).invite_token === null, `${r.status} ${JSON.stringify(r.body)}`);
  } finally {
    await wipe();
    await pool.end();
  }
  const ko = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - ko}/${results.length} contrôles verts`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
