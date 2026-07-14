/* Test E2E local du lot 3 (compte dépôt : labo + acheteurs, 0 activité).
 * Crée un super_admin temporaire + un client dépôt de test, puis nettoie. */
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
  const hash = await bcrypt.hash('TestDepot2026!', 10);

  // ── Nettoyage préalable
  const wipe = async () => {
    await pool.query(`DELETE FROM labo_ingredient_selections WHERE labo_id IN (SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id JOIN utilisateurs u ON u.id = pe.client_id WHERE u.email = 'test-depot@example.com')`);
    await pool.query(`DELETE FROM labos WHERE entreprise_id IN (SELECT pe.id FROM profil_entreprise pe JOIN utilisateurs u ON u.id = pe.client_id WHERE u.email = 'test-depot@example.com')`);
    await pool.query(`DELETE FROM utilisateurs WHERE email IN ('test-depot@example.com', 'test-admin-lot3@example.com')`);
  };
  await wipe();

  // ── Super admin temporaire (pour les endpoints admin)
  await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-Admin', 'test-admin-lot3@example.com', $1, 'super_admin', true)`,
    [hash]
  );
  let r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-admin-lot3@example.com', password: 'TestDepot2026!' }),
  });
  const adminTok = (await r.json()).token;
  const HA = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminTok}` };
  check('login super_admin temporaire', !!adminTok);

  // ── 1. Pricing preview : 0 activité + 1 labo → coût activités = 0
  r = await fetch(`${BASE}/api/abonnements/pricing-preview?nbActivites=0&nbLabos=1&nbGerants=0`, { headers: HA });
  let body = await r.json();
  check('preview dépôt : coût activités = 0', r.status === 200 && Number(body.activite?.total) === 0 && Number(body.labo?.total) > 0,
    `activités ${body.activite?.total}, labo ${body.labo?.total}, total ${body.totalMensuel}`);

  // ── 2. Création client dépôt via l'API admin (0 activité + 1 labo + option Acheteurs)
  // NB : routes admin montées sur /admin SANS /api (piège récurrent)
  // Règle 2026-07 : un labo SEUL n'est pas une composition valide — le dépôt exige l'option Acheteurs.
  r = await fetch(`${BASE}/admin/clients`, {
    method: 'POST', headers: HA,
    body: JSON.stringify({ nom: 'TEST-Depot', email: 'test-depot@example.com', nbActivites: 0, nbLabos: 1, nbGerants: 0, montantOnboarding: 0 }),
  });
  check('labo seul (0 act, 0 acheteurs) refusé 400', r.status === 400);
  r = await fetch(`${BASE}/admin/clients`, {
    method: 'POST', headers: HA,
    body: JSON.stringify({ nom: 'TEST-Depot', email: 'test-depot@example.com', nbActivites: 0, nbLabos: 1, nbGerants: 0, nbAcheteurs: 10, montantOnboarding: 0 }),
  });
  body = await r.json().catch(() => ({}));
  const created = r.status === 201 || r.status === 200;
  check('création client dépôt (0 activité, 1 labo, 10 acheteurs)', created, `status ${r.status} ${body.message || ''}`);

  // ── 3. Création avec 0 activité ET 0 labo → 400
  r = await fetch(`${BASE}/admin/clients`, {
    method: 'POST', headers: HA,
    body: JSON.stringify({ nom: 'TEST-Depot2', email: 'test-depot2@example.com', nbActivites: 0, nbLabos: 0, montantOnboarding: 0 }),
  });
  check('0 activité + 0 labo refusé 400', r.status === 400);

  const depot = await pool.query(`SELECT id FROM utilisateurs WHERE email = 'test-depot@example.com'`);
  const depotId = depot.rows[0]?.id;
  const cfg = await pool.query(
    `SELECT ac.nb_activites, ac.nb_labos FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1`,
    [depotId]
  );
  check('config enregistrée nb_activites=0', cfg.rows[0] && Number(cfg.rows[0].nb_activites) === 0, JSON.stringify(cfg.rows[0]));

  // ── 4. Facturation mensuelle : computeBaseMensuelFromConfig(0 activité) = 0
  const { computeBaseMensuelFromConfig, loadAllTarifs } = require('../src/controllers/abonnementController');
  const tarifs = await loadAllTarifs();
  const mensuelActivites = computeBaseMensuelFromConfig({ nb_activites: 0, nb_labos: 1 }, tarifs);
  check('mensuel activités dépôt = 0 (plus de ||1)', mensuelActivites === 0, String(mensuelActivites));

  // ── 5. Config admin : 0 activité sans labo → 400 ; avec labo → 200 + quota acheteurs
  r = await fetch(`${BASE}/api/abonnements/client/${depotId}/config`, {
    method: 'PUT', headers: HA,
    body: JSON.stringify({ nbActivites: 0, nbLabos: 0, nbGerants: 0 }),
  });
  check('config 0 activité + 0 labo refusée 400', r.status === 400);
  // Labo seul explicite (0 act, 1 labo, 0 acheteurs) → refusé aussi en update
  r = await fetch(`${BASE}/api/abonnements/client/${depotId}/config`, {
    method: 'PUT', headers: HA,
    body: JSON.stringify({ nbActivites: 0, nbLabos: 1, nbGerants: 0, nbAcheteurs: 0 }),
  });
  check('config labo seul (0 acheteurs) refusée 400', r.status === 400);
  r = await fetch(`${BASE}/api/abonnements/client/${depotId}/config`, {
    method: 'PUT', headers: HA,
    body: JSON.stringify({ nbActivites: 0, nbLabos: 1, nbGerants: 0, nbAcheteurs: 20 }),
  });
  body = await r.json();
  check('config dépôt acceptée (0 act, 1 labo, 20 acheteurs)', r.status === 200 && body.nbActivites === 0 && body.nbAcheteurs === 20, JSON.stringify(body));

  // ── 6. Onboarding dépôt : activation du compte + labo → auto-heal via sélections LABO
  await pool.query(`UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 2 WHERE id = $2`, [hash, depotId]);
  r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-depot@example.com', password: 'TestDepot2026!' }),
  });
  const depotTok = (await r.json()).token;
  const HD = { 'Content-Type': 'application/json', Authorization: `Bearer ${depotTok}` };
  check('login client dépôt', !!depotTok);

  // Sans labo créé : step reste 2 (créer activités/labos)
  r = await fetch(`${BASE}/auth/me`, { headers: HD });
  body = await r.json();
  check('me : step 2 sans labo, counts 0/0', body.onboardingStep === 2 && body.activitesCount === 0 && (body.labosCount ?? 0) === 0,
    `step ${body.onboardingStep}, act ${body.activitesCount}, labos ${body.labosCount}`);

  // Crée le labo → step doit passer à 3 (référentiel) puis 0 après sélections LABO
  const ent = await pool.query(`SELECT id FROM profil_entreprise WHERE client_id = $1`, [depotId]);
  const labo = await pool.query(`INSERT INTO labos (entreprise_id, nom) VALUES ($1, 'TEST-Depot-Labo') RETURNING id`, [ent.rows[0].id]);
  r = await fetch(`${BASE}/auth/me`, { headers: HD });
  body = await r.json();
  check('me : labo créé → step 3, labosCount 1', body.onboardingStep === 3 && body.labosCount === 1,
    `step ${body.onboardingStep}, labos ${body.labosCount}`);

  const art = await pool.query(`SELECT id FROM articles WHERE client_id = $1 LIMIT 1`, [depotId]);
  let artId = art.rows[0]?.id;
  if (!artId) {
    const uni = await pool.query(`SELECT id FROM unites ORDER BY id LIMIT 1`);
    const a = await pool.query(`INSERT INTO articles (nom, client_id, unite_id) VALUES ('TEST-Depot-Art', $1, $2) RETURNING id`, [depotId, uni.rows[0].id]);
    artId = a.rows[0].id;
  }
  await pool.query(`INSERT INTO labo_ingredient_selections (labo_id, ingredient_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [labo.rows[0].id, artId]);
  r = await fetch(`${BASE}/auth/me`, { headers: HD });
  body = await r.json();
  check('me : sélections LABO → step 0 (onboarding terminé)', body.onboardingStep === 0,
    `step ${body.onboardingStep} (avant le fix : coincé à 3)`);

  // ── Nettoyage
  await pool.query(`DELETE FROM articles WHERE nom = 'TEST-Depot-Art'`);
  await wipe();
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK${failed.length ? ' — ÉCHECS : ' + failed.map((f) => f.name).join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
