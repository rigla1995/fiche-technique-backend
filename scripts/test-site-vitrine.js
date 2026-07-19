/* Test E2E local — site vitrine public + espace admin « Site LabFlow » :
 * POST /api/public/demande-acces (validation, honeypot, dédup silencieuse)
 * GET  /api/public/partenaires
 * GET  /admin/site/demandes-acces + PUT /admin/site/demandes-acces/:id
 * PUT  /admin/site/partenaires/:clientId (404 client inexistant)
 * Crée un super_admin temporaire, puis nettoie (demandes de test + admin).
 * ⚠️ Le POST public est rate-limité à 5 req/15min/IP : ne pas relancer en boucle. */
require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

const ADMIN_EMAIL = 'test-admin-site@example.com';
const DEMANDE_EMAILS = ['test-site-demande@example.com', 'test-site-honeypot@example.com', 'test-site-teltordu@example.com'];

(async () => {
  const wipe = async () => {
    await pool.query(`DELETE FROM demandes_acces WHERE LOWER(email) = ANY($1)`, [DEMANDE_EMAILS]);
    await pool.query(`DELETE FROM utilisateurs WHERE email = $1`, [ADMIN_EMAIL]);
  };
  await wipe();

  const hash = await bcrypt.hash('TestSite2026!', 10);
  await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminSite', $1, $2, 'super_admin', true)`,
    [ADMIN_EMAIL, hash]
  );
  let r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: 'TestSite2026!' }),
  });
  const tok = (await r.json()).token;
  const HA = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` };
  check('login super_admin temporaire', !!tok);

  const HP = { 'Content-Type': 'application/json' }; // requêtes publiques, sans token

  // ── 1. Demande d'accès valide → 200
  r = await fetch(`${BASE}/api/public/demande-acces`, {
    method: 'POST', headers: HP,
    body: JSON.stringify({
      nom: 'TEST Site Vitrine', email: DEMANDE_EMAILS[0], telephone: '+216 20 123 456',
      ville: 'Tunis', typeActivite: 'restaurant', nbPointsVente: 2, aLabo: true, interetB2b: false,
      message: 'Demande de test E2E', configCalculateur: { nbActivites: 2, formule: 'premium' },
    }),
  });
  let body = await r.json();
  check('POST demande-acces valide → 200', r.status === 200 && /bien été reçue/.test(body.message || ''), String(r.status));

  // ── 2. Repost même email → 200 uniforme ET une seule ligne en base (dédup silencieuse)
  r = await fetch(`${BASE}/api/public/demande-acces`, {
    method: 'POST', headers: HP,
    body: JSON.stringify({ nom: 'TEST Doublon', email: DEMANDE_EMAILS[0].toUpperCase(), telephone: '20123456' }),
  });
  const nbApresRepost = (await pool.query(
    `SELECT COUNT(*)::int AS n FROM demandes_acces WHERE LOWER(email) = LOWER($1)`, [DEMANDE_EMAILS[0]]
  )).rows[0].n;
  check('repost même email → 200 + 1 seule ligne', r.status === 200 && nbApresRepost === 1,
    `status ${r.status}, ${nbApresRepost} ligne(s)`);

  // ── 3. Honeypot rempli → 200 uniforme ET aucune insertion
  r = await fetch(`${BASE}/api/public/demande-acces`, {
    method: 'POST', headers: HP,
    body: JSON.stringify({
      nom: 'TEST Bot', email: DEMANDE_EMAILS[1], telephone: '20123456', website: 'https://spam.example',
    }),
  });
  const nbHoneypot = (await pool.query(
    `SELECT COUNT(*)::int AS n FROM demandes_acces WHERE email = $1`, [DEMANDE_EMAILS[1]]
  )).rows[0].n;
  check('honeypot rempli → 200 + 0 ligne', r.status === 200 && nbHoneypot === 0,
    `status ${r.status}, ${nbHoneypot} ligne(s)`);

  // ── 4. Téléphone invalide → 400 générique
  r = await fetch(`${BASE}/api/public/demande-acces`, {
    method: 'POST', headers: HP,
    body: JSON.stringify({ nom: 'TEST Tel', email: DEMANDE_EMAILS[2], telephone: '12345' }),
  });
  check('telephone invalide → 400', r.status === 400, String(r.status));

  // ── 5. Partenaires publics → 200 tableau
  r = await fetch(`${BASE}/api/public/partenaires`);
  body = await r.json();
  check('GET partenaires publics → 200 tableau', r.status === 200 && Array.isArray(body), String(r.status));

  // ── 6. Admin : la demande de test apparaît dans la liste
  r = await fetch(`${BASE}/admin/site/demandes-acces`, { headers: HA });
  body = await r.json();
  const demande = Array.isArray(body) ? body.find((d) => d.email === DEMANDE_EMAILS[0]) : null;
  check('admin GET demandes-acces contient la demande', r.status === 200 && !!demande,
    `status ${r.status}${demande ? ', id ' + demande.id : ''}`);

  // ── 7. Admin : passage au statut contactee → 200 + traçabilité
  if (demande) {
    r = await fetch(`${BASE}/admin/site/demandes-acces/${demande.id}`, {
      method: 'PUT', headers: HA,
      body: JSON.stringify({ statut: 'contactee', notesAdmin: 'Rappel prévu (test E2E)' }),
    });
    body = await r.json();
    check('admin PUT statut contactee → 200', r.status === 200 && body.statut === 'contactee' && !!body.traiteLe,
      `status ${r.status}, statut ${body.statut}`);
  } else {
    check('admin PUT statut contactee → 200', false, 'demande introuvable au check 6');
  }

  // ── 8. Admin : PUT partenaires d'un client inexistant → 404
  r = await fetch(`${BASE}/admin/site/partenaires/999999`, {
    method: 'PUT', headers: HA, body: JSON.stringify({ actif: false }),
  });
  check('PUT partenaires client inexistant → 404', r.status === 404, String(r.status));

  await wipe();
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK${failed.length ? ' — ÉCHECS : ' + failed.map((f) => f.name).join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
