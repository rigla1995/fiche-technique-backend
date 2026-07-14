/* Test E2E local — demandes de capacité avec option Acheteurs (nb_acheteurs_cible, migr 168).
 * Couvre : supplement-pricing enrichi, gardes de création, application manuelle (traiter),
 * application webhook DocuSeal (simulée), activation du module via demande.
 * Crée un super_admin + clients de test temporaires, puis nettoie. */
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
  const hash = await bcrypt.hash('TestDemAch2026!', 10);
  const EMAILS = ['test-admin-demach@example.com', 'test-demach-1@example.com', 'test-demach-2@example.com'];

  const wipe = async () => {
    await pool.query(`DELETE FROM support_demandes WHERE client_id IN (SELECT id FROM utilisateurs WHERE email = ANY($1))`, [EMAILS]);
    await pool.query(`DELETE FROM utilisateurs WHERE email = ANY($1)`, [EMAILS]);
  };
  await wipe();

  // ── Super admin temporaire
  await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminDemAch', $1, $2, 'super_admin', true)`,
    [EMAILS[0], hash]
  );
  let r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAILS[0], password: 'TestDemAch2026!' }),
  });
  const adminTok = (await r.json()).token;
  const HA = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminTok}` };
  check('login super_admin temporaire', !!adminTok);

  // ── Client 1 : 1 activité + 1 labo + option Acheteurs palier 10
  r = await fetch(`${BASE}/admin/clients`, {
    method: 'POST', headers: HA,
    body: JSON.stringify({ nom: 'TEST-DemAch1', email: EMAILS[1], nbActivites: 1, nbLabos: 1, nbGerants: 0, nbAcheteurs: 10, montantOnboarding: 0 }),
  });
  check('création client 1 (1 act, 1 labo, 10 acheteurs)', r.status === 201, String(r.status));
  const c1 = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1`, [EMAILS[1]])).rows[0].id;
  await pool.query(`UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2`, [hash, c1]);
  r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAILS[1], password: 'TestDemAch2026!' }),
  });
  const c1Tok = (await r.json()).token;
  const H1 = { 'Content-Type': 'application/json', Authorization: `Bearer ${c1Tok}` };
  check('login client 1', !!c1Tok);

  // ── 1. supplement-pricing enrichi (quota, palier, barème)
  r = await fetch(`${BASE}/api/abonnements/supplement-pricing`, { headers: H1 });
  let body = await r.json();
  check('supplement-pricing : quota + palier acheteurs', body.nbAcheteurs === 10 && body.palierAcheteurs === 10,
    JSON.stringify({ n: body.nbAcheteurs, p: body.palierAcheteurs }));
  check('supplement-pricing : barème 4 paliers', Array.isArray(body.paliersAcheteurs) && body.paliersAcheteurs.length === 4
    && body.paliersAcheteurs.every((p) => [10, 20, 50, 100].includes(p.palier) && Number.isFinite(p.prix)),
    JSON.stringify(body.paliersAcheteurs));
  check('supplement-pricing : formule exposée', ['basique', 'premium'].includes(body.formuleActivites), String(body.formuleActivites));

  // ── 2. Gardes de création de demande
  r = await fetch(`${BASE}/api/abonnements/support`, {
    method: 'POST', headers: H1, body: JSON.stringify({ type: 'supplement', nbAcheteursCible: 15 }),
  });
  check('palier invalide (15) refusé 400', r.status === 400);
  r = await fetch(`${BASE}/api/abonnements/support`, {
    method: 'POST', headers: H1, body: JSON.stringify({ type: 'supplement', nbAcheteursCible: 10 }),
  });
  check('palier ≤ quota actuel (10) refusé 400', r.status === 400);

  // ── 3. Demande valide : passage palier 10 → 20
  r = await fetch(`${BASE}/api/abonnements/support`, {
    method: 'POST', headers: H1, body: JSON.stringify({ type: 'supplement', nbAcheteursCible: 20 }),
  });
  body = await r.json();
  const dem1 = body.id;
  check('demande palier 20 créée (201)', r.status === 201 && body.nbAcheteursCible === 20, JSON.stringify({ s: r.status, cible: body.nbAcheteursCible }));

  // ── 4. Validation manuelle admin → quota appliqué (cible REMPLACE, pas d'addition)
  r = await fetch(`${BASE}/api/abonnements/admin/support/${dem1}`, {
    method: 'PUT', headers: HA, body: JSON.stringify({ statut: 'validée', notesAdmin: 'test' }),
  });
  check('validation admin 200', r.status === 200, String(r.status));
  let cfg = (await pool.query(
    `SELECT ac.nb_acheteurs, ac.nb_activites, ac.formule_activites FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1`,
    [c1]
  )).rows[0];
  check('quota appliqué = 20 (remplacement)', Number(cfg.nb_acheteurs) === 20, JSON.stringify(cfg));
  check('formule intacte après validation', cfg.formule_activites === 'premium', String(cfg.formule_activites));

  // ── 5. Client 2 : 1 activité SANS labo — l'option exige un labo dans la même demande
  r = await fetch(`${BASE}/admin/clients`, {
    method: 'POST', headers: HA,
    body: JSON.stringify({ nom: 'TEST-DemAch2', email: EMAILS[2], nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 }),
  });
  check('création client 2 (1 act, 0 labo)', r.status === 201, String(r.status));
  const c2 = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1`, [EMAILS[2]])).rows[0].id;
  await pool.query(`UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2`, [hash, c2]);
  r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAILS[2], password: 'TestDemAch2026!' }),
  });
  const c2Tok = (await r.json()).token;
  const H2 = { 'Content-Type': 'application/json', Authorization: `Bearer ${c2Tok}` };

  r = await fetch(`${BASE}/api/abonnements/support`, {
    method: 'POST', headers: H2, body: JSON.stringify({ type: 'supplement', nbAcheteursCible: 10 }),
  });
  check('option sans labo refusée 400', r.status === 400);
  r = await fetch(`${BASE}/api/abonnements/support`, {
    method: 'POST', headers: H2, body: JSON.stringify({ type: 'supplement', nbLabosSupp: 1, nbAcheteursCible: 10 }),
  });
  body = await r.json();
  const dem2 = body.id;
  check('option + labo dans la même demande acceptée (201)', r.status === 201 && body.nbAcheteursCible === 10 && body.nbLabosSupp === 1,
    JSON.stringify({ s: r.status, cible: body.nbAcheteursCible, labos: body.nbLabosSupp }));

  // ── 6. Application via WEBHOOK DocuSeal (simulé) : capacité + activation module
  await pool.query(`UPDATE support_demandes SET docuseal_submission_id = 'TEST-SUB-DEMACH' WHERE id = $1`, [dem2]);
  r = await fetch(`${BASE}/api/webhooks/docuseal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: 'form.completed', data: { submission_id: 'TEST-SUB-DEMACH' } }),
  });
  check('webhook 200', r.status === 200);
  // le webhook répond avant de traiter — petite attente
  await new Promise((res) => setTimeout(res, 800));
  const dem2Row = (await pool.query(`SELECT statut FROM support_demandes WHERE id = $1`, [dem2])).rows[0];
  check('demande validée par le webhook', dem2Row.statut === 'validée', dem2Row.statut);
  cfg = (await pool.query(
    `SELECT ac.nb_acheteurs, ac.nb_labos, ac.formule_activites FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1`,
    [c2]
  )).rows[0];
  check('webhook : labo +1 et quota acheteurs = 10', Number(cfg.nb_labos) === 1 && Number(cfg.nb_acheteurs) === 10, JSON.stringify(cfg));
  check('webhook : formule préservée (COALESCE)', cfg.formule_activites === 'premium', String(cfg.formule_activites));
  const pe2 = (await pool.query(`SELECT module_acheteurs_actif FROM profil_entreprise WHERE client_id = $1`, [c2])).rows[0];
  check('webhook : module Acheteurs activé', pe2.module_acheteurs_actif === true, String(pe2.module_acheteurs_actif));

  // ── Nettoyage
  await wipe();
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK${failed.length ? ' — ÉCHECS : ' + failed.map((f) => f.name).join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
