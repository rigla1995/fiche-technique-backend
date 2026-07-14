/* Test E2E local — endpoints contrat admin (charte contractuelle) :
 * POST /api/abonnements/contrat-preview (wizard, avant création)
 * GET  /api/abonnements/client/:id/contrat-pdf (signé DocuSeal sinon régénéré)
 * Crée un super_admin + un client de test temporaires, puis nettoie. */
require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

(async () => {
  const hash = await bcrypt.hash('TestCtr2026!', 10);
  const EMAILS = ['test-admin-ctr@example.com', 'test-ctr-client@example.com'];
  const wipe = async () => pool.query(`DELETE FROM utilisateurs WHERE email = ANY($1)`, [EMAILS]);
  await wipe();

  await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminCtr', $1, $2, 'super_admin', true)`,
    [EMAILS[0], hash]
  );
  let r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAILS[0], password: 'TestCtr2026!' }),
  });
  const tok = (await r.json()).token;
  const HA = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` };
  check('login super_admin temporaire', !!tok);

  // ── 1. Aperçu contrat AVANT création (wizard) — avec promo mensualité
  r = await fetch(`${BASE}/api/abonnements/contrat-preview`, {
    method: 'POST', headers: HA,
    body: JSON.stringify({
      nom: 'TEST-Ctr Preview', email: 'preview@example.com', telephone: '20123456',
      nbActivites: 2, nbLabos: 1, nbGerants: 1, formuleActivites: 'basique', nbAcheteurs: 20,
      montantOnboarding: 700,
      promotions: [{
        type: 'percent_off', appliesTo: 'mensualite', dateDebut: '2026-08-01',
        monthsDuration: 3, discountMensualite: 50,
      }],
    }),
  });
  let body = await r.json();
  const pdfOk = r.status === 200 && typeof body.pdfBase64 === 'string'
    && Buffer.from(body.pdfBase64, 'base64').slice(0, 4).toString() === '%PDF';
  check('contrat-preview : 200 + PDF valide', pdfOk, `status ${r.status}, ${body.pdfBase64 ? Buffer.from(body.pdfBase64, 'base64').length + ' octets' : body.message}`);

  // Aperçu compte dépôt (0 activité) — formule NULL
  r = await fetch(`${BASE}/api/abonnements/contrat-preview`, {
    method: 'POST', headers: HA,
    body: JSON.stringify({
      nom: 'TEST-Ctr Depot', email: 'depot@example.com', telephone: '20123456',
      nbActivites: 0, nbLabos: 1, nbGerants: 0, nbAcheteurs: 10, montantOnboarding: 700, promotions: [],
    }),
  });
  body = await r.json();
  check('contrat-preview dépôt (0 act) : 200 + PDF', r.status === 200 && !!body.pdfBase64, String(r.status));

  // ── 2. Contrat d'un client existant (régénéré — DocuSeal non configuré en local)
  r = await fetch(`${BASE}/admin/clients`, {
    method: 'POST', headers: HA,
    body: JSON.stringify({ nom: 'TEST-CtrClient', email: EMAILS[1], nbActivites: 1, nbLabos: 1, nbGerants: 0, nbAcheteurs: 10, montantOnboarding: 500 }),
  });
  check('création client de test', r.status === 201, String(r.status));
  const cid = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1`, [EMAILS[1]])).rows[0].id;

  r = await fetch(`${BASE}/api/abonnements/client/${cid}/contrat-pdf`, { headers: HA });
  const buf = Buffer.from(await r.arrayBuffer());
  check('contrat-pdf client : 200 + PDF régénéré', r.status === 200
    && (r.headers.get('content-type') || '').includes('pdf')
    && buf.slice(0, 4).toString() === '%PDF' && buf.length > 2000, `status ${r.status}, ${buf.length} octets`);

  // ── 3. Client inexistant → 404
  r = await fetch(`${BASE}/api/abonnements/client/999999/contrat-pdf`, { headers: HA });
  check('contrat-pdf client inexistant → 404', r.status === 404, String(r.status));

  // ── 4. Sécurité : sans token → 401
  r = await fetch(`${BASE}/api/abonnements/contrat-preview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  check('contrat-preview sans auth → 401', r.status === 401, String(r.status));

  await wipe();
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK${failed.length ? ' — ÉCHECS : ' + failed.map((f) => f.name).join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
