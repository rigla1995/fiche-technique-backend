/* Test E2E local — tableau de bord v2 adaptatif à la config (migr néant, code only).
 * Couvre : métadonnées de config dans tab=filtres, onglet acheteurs (gating module),
 * KPI ventes_acheteurs dans overview (présent seulement si module actif),
 * cas vide global avec tab. Crée un super_admin + 2 clients temporaires, nettoie. */
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
  const hash = await bcrypt.hash('TestDash2026x!', 10);
  const EMAILS = ['test-admin-dashcfg@example.com', 'test-dashcfg-ach@example.com', 'test-dashcfg-sans@example.com'];
  const wipe = async () => pool.query(`DELETE FROM utilisateurs WHERE email = ANY($1)`, [EMAILS]);
  await wipe();

  await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminDash', $1, $2, 'super_admin', true)`,
    [EMAILS[0], hash]
  );
  let r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAILS[0], password: 'TestDash2026x!' }),
  });
  const HA = { 'Content-Type': 'application/json', Authorization: `Bearer ${(await r.json()).token}` };
  check('login super_admin temporaire', !!HA.Authorization);

  const mkClient = async (email, cfg) => {
    r = await fetch(`${BASE}/admin/clients`, {
      method: 'POST', headers: HA,
      body: JSON.stringify({ nom: 'TEST-' + email.split('@')[0], email, montantOnboarding: 0, ...cfg }),
    });
    if (r.status !== 201) throw new Error(`création ${email} → ${r.status}`);
    const id = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1`, [email])).rows[0].id;
    await pool.query(`UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2`, [hash, id]);
    r = await fetch(`${BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'TestDash2026x!' }),
    });
    return { id, H: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await r.json()).token}` } };
  };

  // Client 1 : 1 activité + 1 labo + option Acheteurs (module actif à la création)
  const c1 = await mkClient(EMAILS[1], { nbActivites: 1, nbLabos: 1, nbGerants: 0, nbAcheteurs: 10 });
  // Un labo réel (le dashboard raisonne sur les labos EXISTANTS)
  const ent1 = (await pool.query(`SELECT id FROM profil_entreprise WHERE client_id = $1`, [c1.id])).rows[0].id;
  await pool.query(`INSERT INTO labos (entreprise_id, nom) VALUES ($1, 'TEST-DashLabo')`, [ent1]);

  // Client 2 : 1 activité, aucun module
  const c2 = await mkClient(EMAILS[2], { nbActivites: 1, nbLabos: 0, nbGerants: 0 });

  // ── 1. tab=filtres : métadonnées de config
  r = await fetch(`${BASE}/api/dashboard/v2?tab=filtres`, { headers: c1.H });
  let body = await r.json();
  check('filtres c1 : modules.acheteurs = true', r.status === 200 && body.modules?.acheteurs === true, JSON.stringify(body.modules));
  check('filtres c1 : formule exposée', 'formule_activites' in body, String(body.formule_activites));
  check('filtres c1 : 1 labo listé', Array.isArray(body.labos) && body.labos.length === 1, String(body.labos?.length));

  r = await fetch(`${BASE}/api/dashboard/v2?tab=filtres`, { headers: c2.H });
  body = await r.json();
  check('filtres c2 : modules.acheteurs = false', body.modules?.acheteurs === false, JSON.stringify(body.modules));
  check('filtres c2 : modules.vente présent (bool)', typeof body.modules?.vente === 'boolean');

  // ── 2. tab=acheteurs
  r = await fetch(`${BASE}/api/dashboard/v2?tab=acheteurs`, { headers: c1.H });
  body = await r.json();
  check('acheteurs c1 : 200 + kpis structurés', r.status === 200 && body.tab === 'acheteurs'
    && body.kpis && typeof body.kpis.ca === 'number' && typeof body.kpis.carnet_total === 'number'
    && Array.isArray(body.evolution) && Array.isArray(body.top_acheteurs) && Array.isArray(body.par_statut),
    JSON.stringify(body.kpis));
  check('acheteurs c1 : delta ca présent (null sans historique)', body.kpis && 'deltas' in body.kpis, JSON.stringify(body.kpis?.deltas));

  r = await fetch(`${BASE}/api/dashboard/v2?tab=acheteurs`, { headers: c2.H });
  body = await r.json();
  check('acheteurs c2 (module inactif) : vide + tab', r.status === 200 && body.vide === true && body.tab === 'acheteurs', JSON.stringify(body));

  // ── 3. overview : KPI B2B seulement si module actif
  r = await fetch(`${BASE}/api/dashboard/v2?tab=overview`, { headers: c1.H });
  body = await r.json();
  check('overview c1 : ventes_acheteurs présent', body.kpis && 'ventes_acheteurs' in body.kpis, String(body.kpis?.ventes_acheteurs));
  r = await fetch(`${BASE}/api/dashboard/v2?tab=overview`, { headers: c2.H });
  body = await r.json();
  check('overview c2 : ventes_acheteurs ABSENT', body.kpis && !('ventes_acheteurs' in body.kpis));

  // ── 4. onglet inconnu → 400 ; labo/filtre inchangés
  r = await fetch(`${BASE}/api/dashboard/v2?tab=nimporte`, { headers: c1.H });
  check('onglet inconnu → 400', r.status === 400);
  r = await fetch(`${BASE}/api/dashboard/v2?tab=labo`, { headers: c1.H });
  body = await r.json();
  check('labo c1 : kpis présents (non vide)', body.tab === 'labo' && !!body.kpis, JSON.stringify(Object.keys(body.kpis || {})));
  r = await fetch(`${BASE}/api/dashboard/v2?tab=labo`, { headers: c2.H });
  body = await r.json();
  check('labo c2 (0 labo) : vide', body.vide === true && body.tab === 'labo');

  await wipe();
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK${failed.length ? ' — ÉCHECS : ' + failed.map((f) => f.name).join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
