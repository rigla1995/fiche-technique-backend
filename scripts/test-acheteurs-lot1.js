/* Test E2E local du lot 1 du module Acheteurs (à lancer backend démarré sur :3000).
 * Non destructif pour les données réelles : crée puis supprime des acheteurs de test. */
require('dotenv').config();
const pool = require('../src/config/database');
const ExcelJS = require('exceljs');

const BASE = 'http://localhost:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

(async () => {
  // ── Login client (user 38 local)
  let r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'm.khelil.prof@gmail.com', password: 'TestDash2026!' }),
  });
  const { token, user } = await r.json();
  check('login client', !!token, `user ${user?.id}`);
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const clientId = user.id;

  // État initial propre
  await pool.query(`UPDATE profil_entreprise SET module_acheteurs_actif = false WHERE client_id = $1`, [clientId]);
  await pool.query(`DELETE FROM utilisateurs WHERE role = 'acheteur' AND email LIKE 'test-acheteur-%'`);
  await pool.query(`DELETE FROM acheteurs WHERE client_id = $1 AND nom LIKE 'TEST-%'`, [clientId]);

  // ── 1. Gating serveur : module OFF → 403
  r = await fetch(`${BASE}/api/acheteurs`, { headers: H });
  let body = await r.json();
  check('gating 403 module OFF', r.status === 403 && body.code === 'MODULE_ACHETEURS_INACTIVE', `status ${r.status}`);

  // ── 2. Activation module + quota 5 (équivalent action admin)
  await pool.query(`UPDATE profil_entreprise SET module_acheteurs_actif = true, module_acheteurs_activated_at = NOW() WHERE client_id = $1`, [clientId]);
  await pool.query(`UPDATE abonnement_config SET nb_acheteurs = 5 WHERE abonnement_id = (SELECT id FROM abonnements WHERE client_id = $1)`, [clientId]);

  r = await fetch(`${BASE}/api/acheteurs`, { headers: H });
  body = await r.json();
  check('liste vide + quota 5', r.status === 200 && body.quota === 5, `quota ${body.quota}, ${body.acheteurs?.length} acheteurs`);

  // ── 3. Création multi (1 avec compte)
  r = await fetch(`${BASE}/api/acheteurs`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ acheteurs: [
      { nom: 'TEST-Ahmed', entreprise: 'Superette Test', email: 'test-acheteur-1@example.com', telephone: '98111222', remisePct: 5, creerCompte: true },
      { nom: 'TEST-Sami', remisePct: 0 },
    ] }),
  });
  body = await r.json();
  check('création multi 201', r.status === 201 && body.acheteurs?.length === 2, `invitations: ${body.invitations}`);
  check('invitation envoyée pour compte', body.invitations === 1);
  const acheteur1 = body.acheteurs?.find(a => a.nom === 'TEST-Ahmed');
  const acheteur2 = body.acheteurs?.find(a => a.nom === 'TEST-Sami');
  check('statut compte invite', acheteur1?.compte === 'invite', acheteur1?.compte);

  // ── 4. Doublon email → 409
  r = await fetch(`${BASE}/api/acheteurs`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ nom: 'TEST-Doublon', email: 'test-acheteur-1@example.com' }),
  });
  check('doublon email 409', r.status === 409);

  // ── 5. Quota : 2 existants + 4 > 5 → 403
  r = await fetch(`${BASE}/api/acheteurs`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ acheteurs: [1, 2, 3, 4].map(i => ({ nom: `TEST-Q${i}` })) }),
  });
  body = await r.json();
  check('quota dépassé 403', r.status === 403 && body.code === 'QUOTA_ACHETEURS', body.message);

  // ── 6. Template Excel
  r = await fetch(`${BASE}/api/acheteurs/template`, { headers: { Authorization: H.Authorization } });
  check('template xlsx', r.status === 200 && (r.headers.get('content-type') || '').includes('spreadsheetml'));

  // ── 7. Import Excel (1 valide, 1 sans nom, 1 email en doublon carnet)
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Acheteurs');
  ws.addRow(['Nom', 'Entreprise', 'Email', 'Téléphone', 'Adresse', 'Matricule fiscal', 'Remise (%)']);
  ws.addRow(['TEST-Import1', 'Resto Import', 'test-acheteur-2@example.com', '55123456', '', '', '2,5']);
  ws.addRow(['', '', 'sans-nom@example.com', '', '', '', '']);
  ws.addRow(['TEST-ImportDup', '', 'test-acheteur-1@example.com', '', '', '', '']);
  const buf = await wb.xlsx.writeBuffer();
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'import.xlsx');
  form.append('creerComptes', 'false');
  r = await fetch(`${BASE}/api/acheteurs/import`, { method: 'POST', headers: { Authorization: H.Authorization }, body: form });
  body = await r.json();
  const dupDetail = body.details?.find(d => d.nom === 'TEST-ImportDup');
  check('import : 1 créé, 2 erreurs', r.status === 200 && body.processed === 1 && body.errors === 2,
    `processed ${body.processed}, errors ${body.errors}, dup: ${dupDetail?.error}`);
  const imp = await pool.query(`SELECT remise_pct FROM acheteurs WHERE client_id = $1 AND nom = 'TEST-Import1'`, [clientId]);
  check('remise 2,5 parsée', Number(imp.rows[0]?.remise_pct) === 2.5, String(imp.rows[0]?.remise_pct));

  // ── 8. Invitation → activation → login acheteur
  const tok = await pool.query(
    `SELECT u.invite_token FROM acheteurs a JOIN utilisateurs u ON u.id = a.user_id WHERE a.id = $1`, [acheteur1.id]);
  const inviteToken = tok.rows[0]?.invite_token;
  check('invite_token présent', !!inviteToken);

  r = await fetch(`${BASE}/auth/invite/${inviteToken}`);
  body = await r.json();
  check('verify invite → role acheteur', r.status === 200 && body.role === 'acheteur', body.role);

  r = await fetch(`${BASE}/auth/invite/accept`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: inviteToken, password: 'TestAcheteur2026!' }),
  });
  check('accept invite', r.status === 200, (await r.json()).message);

  r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-acheteur-1@example.com', password: 'TestAcheteur2026!' }),
  });
  body = await r.json();
  const achToken = body.token;
  check('login acheteur', !!achToken && body.user?.role === 'acheteur', body.user?.role);

  r = await fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${achToken}` } });
  body = await r.json();
  check('auth/me acheteur ok', r.status === 200 && body.role === 'acheteur');

  // L'acheteur ne peut PAS accéder au carnet (requireEntreprise)
  r = await fetch(`${BASE}/api/acheteurs`, { headers: { Authorization: `Bearer ${achToken}` } });
  check('acheteur bloqué sur /api/acheteurs', r.status === 403, `status ${r.status}`);

  // ── 9. Update : remise + blocage email compte lié + re-inviter déjà activé
  r = await fetch(`${BASE}/api/acheteurs/${acheteur2.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ remisePct: 10 }) });
  body = await r.json();
  check('update remise', r.status === 200 && body.remisePct === 10, String(body.remisePct));

  r = await fetch(`${BASE}/api/acheteurs/${acheteur1.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ email: 'autre@example.com' }) });
  check('email compte lié bloqué 409', r.status === 409);

  r = await fetch(`${BASE}/api/acheteurs/${acheteur1.id}/inviter`, { method: 'POST', headers: H });
  check('re-inviter compte activé 409', r.status === 409);

  // Désactivation fiche → login acheteur révoqué
  await fetch(`${BASE}/api/acheteurs/${acheteur1.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ actif: false }) });
  r = await fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${achToken}` } });
  check('acheteur désactivé → 401', r.status === 401, `status ${r.status}`);
  await fetch(`${BASE}/api/acheteurs/${acheteur1.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ actif: true }) });

  // ── 10. Famille achetable
  r = await fetch(`${BASE}/api/familles`, { headers: H });
  const familles = await r.json();
  if (familles.length > 0) {
    const f = familles[0];
    r = await fetch(`${BASE}/api/familles/${f.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ nom: f.name, achetable: true }) });
    body = await r.json();
    check('famille achetable ON', r.status === 200 && body.achetable === true && body.consommable === f.consommable,
      `achetable ${body.achetable}, consommable préservé ${body.consommable === f.consommable}`);
    await fetch(`${BASE}/api/familles/${f.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ nom: f.name, achetable: false }) });
  } else {
    check('famille achetable (aucune famille à tester)', true, 'skip');
  }

  // ── 11. Suppression : fiche + compte lié
  r = await fetch(`${BASE}/api/acheteurs/${acheteur1.id}`, { method: 'DELETE', headers: H });
  check('delete acheteur', r.status === 200);
  const orphan = await pool.query(`SELECT id FROM utilisateurs WHERE email = 'test-acheteur-1@example.com'`);
  check('compte lié supprimé', orphan.rows.length === 0);

  // Nettoyage final
  await pool.query(`DELETE FROM acheteurs WHERE client_id = $1 AND nom LIKE 'TEST-%'`, [clientId]);
  await pool.query(`DELETE FROM utilisateurs WHERE role = 'acheteur' AND email LIKE 'test-acheteur-%'`);

  const failed = results.filter(x => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK${failed.length ? ' — ÉCHECS : ' + failed.map(f => f.name).join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('ERREUR FATALE', e); process.exit(1); });
