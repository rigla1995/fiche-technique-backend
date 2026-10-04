/* Test E2E local — garde d'écriture des comptes en lecture seule, suspendus ou bloqués, et jeton dans l'adresse.
 * Défaut d'origine : la garde globale de src/app.js ne s'appliquait que si l'en-tête Authorization était présent,
 * alors que authenticate accepte aussi le jeton dans l'adresse (?token=, prévu pour le flux des notifications).
 * Un compte en lecture seule pouvait donc écrire en envoyant « ?token=<son jeton> » sans en-tête.
 * Correctif : la garde s'applique dès qu'un jeton est présent, en-tête OU adresse (jetonPresent, middleware/auth.js).
 * Couvre, pour chacun des 3 modes (read_only, desactive, bloque) : écriture avec l'en-tête → 403 et son code ; la même
 * écriture avec ?token= seul → 403 et le même code, rien n'est écrit ; PUT et DELETE avec ?token= seul → 403.
 * Et pour un compte actif : écriture normale (201), lecture et flux des notifications par ?token= toujours servis,
 * sans jeton → 401, jeton illisible dans l'adresse → 401.
 * Crée un super_admin + 4 clients temporaires, puis nettoie. */
// ⚠️ Démarrer le backend de test par « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué) —
//    jamais par « npm start » avec le .env d'un poste de développement, qui contient de vraies clés.
require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MDP = 'TestGardeEcr2026!';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
// jeton : dans l'en-tête Authorization ; jetonAdresse : dans l'adresse (?token=), sans en-tête sauf si jeton est donné.
const appel = async (methode, chemin, { jeton, jetonAdresse, corps } = {}) => {
  const url = `${BASE}${chemin}${jetonAdresse ? `${chemin.includes('?') ? '&' : '?'}token=${encodeURIComponent(jetonAdresse)}` : ''}`;
  const r = await fetch(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const login = async (email) => (await appel('POST', '/auth/login', { corps: { email, password: MDP } })).body?.token;

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-gardeecr@example.com';
  const MODES = [
    { cle: 'actif', mode: null, code: null },
    { cle: 'lecture seule', mode: 'read_only', code: 'READ_ONLY' },
    { cle: 'suspendu', mode: 'desactive', code: 'SUSPENDED' },
    { cle: 'bloqué', mode: 'bloque', code: 'BLOCKED' },
  ];
  const EMAILS = MODES.map((_, i) => `test-gardeecr-${i + 1}@example.com`);
  const wipe = async () => {
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [EMAILS]);
    await pool.query('DELETE FROM utilisateurs WHERE email = $1', [ADMIN]);
  };
  const nbActivites = async (clientId) => Number((await pool.query(
    'SELECT COUNT(*) AS n FROM activites a JOIN profil_entreprise pe ON pe.id = a.entreprise_id WHERE pe.client_id = $1', [clientId]
  )).rows[0].n);
  await wipe();

  try {
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminGardeEcr', $1, $2, 'super_admin', true)`,
      [ADMIN, hash]
    );
    const adminTok = await login(ADMIN);
    check('login super_admin temporaire', !!adminTok);

    // 4 clients activés (2 activités au quota). Le jeton est pris AVANT le changement de mode ; le mode est posé en
    // base avant la première requête authentifiée du compte (le cache d'authentification dure 15 s).
    const comptes = [];
    for (let i = 0; i < MODES.length; i += 1) {
      const r = await appel('POST', '/admin/clients', { jeton: adminTok, corps: { nom: `TEST-GardeEcr${i + 1}`, email: EMAILS[i], telephone: `2077720${i + 1}`, nbActivites: 2, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 } });
      check(`création du client ${MODES[i].cle}`, r.status === 201, String(r.status));
      const id = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [EMAILS[i]])).rows[0].id;
      await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, id]);
      const tok = await login(EMAILS[i]);
      check(`login du client ${MODES[i].cle}`, !!tok);
      if (MODES[i].mode) {
        const maj = await pool.query('UPDATE abonnements SET mode_compte = $1 WHERE client_id = $2', [MODES[i].mode, id]);
        check(`client ${MODES[i].cle} : mode « ${MODES[i].mode} » posé en base`, maj.rowCount === 1, String(maj.rowCount));
      }
      comptes.push({ ...MODES[i], id, tok });
    }
    const [actif, ...restreints] = comptes;

    // ── Compte actif : rien ne change
    let r = await appel('POST', '/api/entreprise/activites', { jeton: actif.tok, corps: { nom: 'Activité GardeEcr' } });
    check('compte actif : écriture avec l\'en-tête → 201', r.status === 201, String(r.status));
    const activiteId = r.body?.id;
    r = await appel('GET', '/api/entreprise/activites', { jetonAdresse: actif.tok });
    check('compte actif : lecture par ?token= (sans en-tête) → 200', r.status === 200 && Array.isArray(r.body), String(r.status));
    {
      const arret = new AbortController();
      const f = await fetch(`${BASE}/api/notifications/stream?token=${encodeURIComponent(actif.tok)}`, { signal: arret.signal });
      const type = f.headers.get('content-type') || '';
      arret.abort();
      check('flux des notifications par ?token= → 200, text/event-stream', f.status === 200 && type.includes('text/event-stream'), `${f.status} ${type}`);
    }
    r = await appel('POST', '/api/entreprise/activites', { corps: { nom: 'Sans jeton' } });
    check('écriture sans aucun jeton → 401', r.status === 401, String(r.status));
    r = await appel('POST', '/api/entreprise/activites', { jetonAdresse: 'pas.un.jeton', corps: { nom: 'Jeton illisible' } });
    check('écriture avec un jeton illisible dans l\'adresse → 401', r.status === 401, String(r.status));
    check('compte actif : une seule activité créée', (await nbActivites(actif.id)) === 1, String(await nbActivites(actif.id)));

    // ── Comptes en lecture seule, suspendu, bloqué : aucune écriture, quel que soit l'endroit du jeton
    for (const c of restreints) {
      r = await appel('POST', '/api/entreprise/activites', { jeton: c.tok, corps: { nom: `Refus en-tête ${c.cle}` } });
      check(`compte ${c.cle} : écriture avec l'en-tête → 403 ${c.code}`, r.status === 403 && r.body?.code === c.code, `${r.status} ${JSON.stringify(r.body)}`);
      r = await appel('POST', '/api/entreprise/activites', { jetonAdresse: c.tok, corps: { nom: `Contournement ${c.cle}` } });
      check(`compte ${c.cle} : écriture avec ?token= seul → 403 ${c.code}`, r.status === 403 && r.body?.code === c.code, `${r.status} ${JSON.stringify(r.body)}`);
      check(`compte ${c.cle} : aucune activité créée`, (await nbActivites(c.id)) === 0, String(await nbActivites(c.id)));
      r = await appel('PUT', `/api/entreprise/activites/${activiteId}`, { jetonAdresse: c.tok, corps: { nom: 'Renommée par contournement' } });
      check(`compte ${c.cle} : PUT avec ?token= seul → 403 ${c.code}`, r.status === 403 && r.body?.code === c.code, `${r.status} ${JSON.stringify(r.body)}`);
      r = await appel('DELETE', `/api/entreprise/activites/${activiteId}`, { jetonAdresse: c.tok });
      check(`compte ${c.cle} : DELETE avec ?token= seul → 403 ${c.code}`, r.status === 403 && r.body?.code === c.code, `${r.status} ${JSON.stringify(r.body)}`);
      r = await appel('GET', '/api/entreprise/activites', { jeton: c.tok });
      check(`compte ${c.cle} : lecture toujours permise → 200`, r.status === 200, String(r.status));
    }
    const nom = (await pool.query('SELECT nom FROM activites WHERE id = $1', [activiteId])).rows[0]?.nom;
    check('l\'activité du compte actif est intacte', nom === 'Activité GardeEcr', String(nom));
  } finally {
    await wipe();
    await pool.end();
  }
  const ko = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - ko}/${results.length} contrôles verts`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
