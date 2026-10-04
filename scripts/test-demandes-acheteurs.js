/* Test E2E local — demandes de capacité avec option Acheteurs (nb_acheteurs_cible, migr 168).
 * Couvre : supplement-pricing enrichi, gardes de création, application par la validation admin (traiter),
 * activation du module via demande.
 * Lot 3, étape 4 (plus d'avenant : LabFlow est sans engagement) : une demande ne crée plus de soumission DocuSeal ;
 * l'ancienne étape 6 (webhook DocuSeal simulé) devient la validation admin, avec les mêmes contrôles, plus : une 2e
 * validation répond 409 sans rien appliquer, une demande refusée n'ajoute aucune capacité.
 * Lot 3, étape 5 (code DocuSeal mort retiré) : la réponse d'une demande n'expose plus `docusealSubmissionId` (la
 * colonne docuseal_submission_id reste en base, toujours NULL) ; la route publique du webhook DocuSeal a disparu.
 * Crée un super_admin + clients de test temporaires, puis nettoie. */
// ⚠️ Ce script crée des comptes par POST /admin/clients (email de bienvenue). Démarrer le backend de test par
//    « node scripts/start-test-backend.js » (clés externes vidées, resend bouchonné, réseau sortant bloqué) —
//    jamais par « npm start » avec le .env d'un poste de développement, qui contient de vraies clés.
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
  // Lot 3, étape 4 : plus d'avenant à signer — ni soumission DocuSeal, ni indicateur d'email d'avenant.
  // Lot 3, étape 5 : la réponse n'expose plus le champ docusealSubmissionId (la colonne reste en base, NULL).
  const dem1Row = (await pool.query(`SELECT statut, docuseal_submission_id FROM support_demandes WHERE id = $1`, [dem1])).rows[0];
  check('demande : en attente, aucune soumission DocuSeal (lot 3, étapes 4 et 5)',
    dem1Row?.statut === 'en_attente' && dem1Row.docuseal_submission_id === null && !('docusealSubmissionId' in body) && !('avenantEmailSent' in body),
    JSON.stringify({ ...dem1Row, docusealSubmissionId: body.docusealSubmissionId, avenantEmailSent: body.avenantEmailSent }));

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

  // ── 6. Lot 3, étape 4 : application par la VALIDATION ADMIN (plus de webhook d'avenant) : capacité + activation module
  const capacite = async (clientId) => (await pool.query(
    `SELECT ac.nb_activites, ac.nb_labos, ac.nb_gerants, ac.nb_acheteurs, ac.formule_activites
       FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id
      WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1`,
    [clientId]
  )).rows[0];
  r = await fetch(`${BASE}/api/abonnements/admin/support/${dem2}`, {
    method: 'PUT', headers: HA, body: JSON.stringify({ statut: 'validée', notesAdmin: 'test étape 4' }),
  });
  body = await r.json();
  check('validation admin 200', r.status === 200 && body.statut === 'validée', JSON.stringify({ s: r.status, statut: body.statut }));
  const dem2Row = (await pool.query(`SELECT statut, docuseal_submission_id FROM support_demandes WHERE id = $1`, [dem2])).rows[0];
  check('demande validée par l\'admin, sans soumission DocuSeal', dem2Row.statut === 'validée' && dem2Row.docuseal_submission_id === null, JSON.stringify(dem2Row));
  cfg = await capacite(c2);
  check('validation : labo +1 et quota acheteurs = 10', Number(cfg.nb_labos) === 1 && Number(cfg.nb_acheteurs) === 10, JSON.stringify(cfg));
  check('validation : formule conservée', cfg.formule_activites === 'premium', String(cfg.formule_activites));
  const pe2 = (await pool.query(`SELECT module_acheteurs_actif FROM profil_entreprise WHERE client_id = $1`, [c2])).rows[0];
  check('validation : module Acheteurs activé', pe2.module_acheteurs_actif === true, String(pe2.module_acheteurs_actif));

  // ── 7. 2e validation de la même demande : 409, capacité inchangée (pas de double application)
  const avant2e = JSON.stringify(cfg);
  r = await fetch(`${BASE}/api/abonnements/admin/support/${dem2}`, {
    method: 'PUT', headers: HA, body: JSON.stringify({ statut: 'validée' }),
  });
  body = await r.json();
  check('2e validation → 409 « déjà traitée »', r.status === 409 && /déjà été traitée/.test(body.message || ''), JSON.stringify({ s: r.status, m: body.message }));
  cfg = await capacite(c2);
  check('2e validation : capacité inchangée', JSON.stringify(cfg) === avant2e, `${avant2e} → ${JSON.stringify(cfg)}`);
  r = await fetch(`${BASE}/api/abonnements/admin/support/${dem2}`, {
    method: 'PUT', headers: HA, body: JSON.stringify({ statut: 'refusée' }),
  });
  check('refus d\'une demande déjà validée → 409', r.status === 409, String(r.status));
  check('demande toujours validée', (await pool.query(`SELECT statut FROM support_demandes WHERE id = $1`, [dem2])).rows[0].statut === 'validée');

  // ── 8. Demande refusée : aucune capacité ajoutée
  r = await fetch(`${BASE}/api/abonnements/support`, {
    method: 'POST', headers: H2, body: JSON.stringify({ type: 'supplement', nbActivitesSupp: 1, nbGerantsSupp: 1 }),
  });
  body = await r.json();
  const dem3 = body.id;
  check('demande +1 activité +1 gérant créée (201)', r.status === 201 && !!dem3, String(r.status));
  const avantRefus = JSON.stringify(await capacite(c2));
  r = await fetch(`${BASE}/api/abonnements/admin/support/${dem3}`, {
    method: 'PUT', headers: HA, body: JSON.stringify({ statut: 'refusée', notesAdmin: 'test refus' }),
  });
  body = await r.json();
  check('refus admin 200', r.status === 200 && body.statut === 'refusée', JSON.stringify({ s: r.status, statut: body.statut }));
  const apresRefus = JSON.stringify(await capacite(c2));
  check('refus : aucune capacité ajoutée', apresRefus === avantRefus, `${avantRefus} → ${apresRefus}`);
  r = await fetch(`${BASE}/api/abonnements/admin/support/${dem3}`, {
    method: 'PUT', headers: HA, body: JSON.stringify({ statut: 'validée' }),
  });
  check('validation après refus → 409, capacité inchangée', r.status === 409 && JSON.stringify(await capacite(c2)) === avantRefus, String(r.status));

  // ── 9. Routes de l'avenant retirées (aperçu admin, contrat signé client)
  r = await fetch(`${BASE}/api/abonnements/admin/support/${dem2}/avenant-preview`, { headers: HA });
  check('aperçu d\'avenant retiré → 404', r.status === 404, String(r.status));
  r = await fetch(`${BASE}/api/abonnements/support/${dem2}/contrat-signe`, { headers: H2 });
  check('contrat signé (client) retiré → 404', r.status === 404, String(r.status));
  // Lot 3, étape 5 : le webhook DocuSeal (route publique, sans jeton) n'existe plus — un événement « signé » envoyé
  // sans authentification n'est plus accepté (404, ou 401 si un routeur protégé de /api répond avant).
  r = await fetch(`${BASE}/api/webhooks/docuseal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: 'form.completed', data: { email: EMAILS[2], submission_id: 1, completed_at: new Date().toISOString() } }),
  });
  check('webhook DocuSeal retiré → 404 ou 401, jamais accepté', r.status === 404 || r.status === 401, String(r.status));

  // ── Nettoyage
  await wipe();
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK${failed.length ? ' — ÉCHECS : ' + failed.map((f) => f.name).join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
