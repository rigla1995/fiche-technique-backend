/* Test E2E local — LabFlow Compta, étape S3a (labflow-reprise/achats-compta/PLAN-S3.md, SPEC-SOCLE D12) : passer
 * d'une adresse à l'autre (app. ↔ compta.) par un code à usage unique.
 *   émission réservée à qui a l'espace visé ; code haché en base ; échange une seule fois, avant 60 s, sur l'adresse
 *   prévue ; même session et même profil qu'une connexion ; compte en lecture seule : passage permis ; compte bloqué :
 *   refusé ; pages du cabinet réservées à son titulaire (vérifié sur les accès).
 * Crée un super_admin, un client (module Comptabilité activé le temps de l'essai) et un comptable sans cabinet,
 * temporaires ; règle le tarif du module le temps de l'essai, puis restaure et nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
// Mot de passe des comptes temporaires : tiré au hasard à chaque essai (jamais écrit dans le dépôt).
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
const login = async (email) => appel('POST', '/auth/login', null, { email, password: MDP });

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s3a@example.com';
  const CLIENT = 'test-client-compta-s3a@example.com';
  const COMPTABLE = 'test-comptable-compta-s3a@example.com';
  const tarifAvant = (await pool.query(`SELECT valeur_dt FROM tarifs_config WHERE cle = 'compta_module_mensuel'`)).rows[0]?.valeur_dt;
  let adminTok = null;
  const wipe = async () => {
    const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
    if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT, COMPTABLE]])).rows.map((r) => r.id);
    if (ids.length) {
      await pool.query(`DELETE FROM compta.evenements WHERE auteur_id = ANY($1) OR (details->>'titulaire')::int = ANY($1)`, [ids]);
      // S4b : les dossiers (dont « Mon entreprise », créé d'office) retiennent leur comptabilité (RESTRICT).
      await pool.query('DELETE FROM compta.dossiers WHERE espace_id IN (SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1))', [ids]);
      await pool.query('DELETE FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [ids]);
    }
  };

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S3a', $1, $2, 'super_admin', true, 0, NOW()),
              ('TEST Comptable S3a', $3, $2, 'comptable', true, 0, NOW())`, [ADMIN, hash, COMPTABLE]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);

    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client S3a', email: CLIENT, telephone: '20 555 051', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    check('création du client LabFlow', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const connexion = await login(CLIENT);
    const clientTok = connexion.body?.token;
    check('connexion du client', !!clientTok);

    // ── Sans le module : rien à ouvrir côté Comptabilité ──
    r = await appel('POST', '/api/compta/passage', clientTok, { destination: 'compta' });
    check('sans comptabilité : passage vers LabFlow Compta refusé (403)', r.status === 403, String(r.status));
    r = await appel('POST', '/api/compta/passage', clientTok, { destination: 'ailleurs' });
    check('destination inconnue : 400', r.status === 400, String(r.status));

    await pool.query(`UPDATE tarifs_config SET valeur_dt = 60 WHERE cle = 'compta_module_mensuel'`);
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 0 });
    check('module Comptabilité activé (admin)', r.status === 200 && r.body?.actif === true, String(r.status));

    // ── Émission ──
    r = await appel('POST', '/api/compta/passage', clientTok, { destination: 'compta' });
    const code = r.body?.code;
    check('passage vers LabFlow Compta : code émis (43 caractères), valable 60 s', r.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(code || '') && r.body?.expireDans === 60, `${r.status} ${JSON.stringify(r.body)}`);
    const ligne = (await pool.query('SELECT * FROM compta.sessions_passage WHERE personne_id = $1 ORDER BY id DESC LIMIT 1', [clientId])).rows[0];
    check('en base : code haché (jamais en clair), destination compta, non utilisé',
      ligne && ligne.code_hache !== code && /^[0-9a-f]{64}$/.test(ligne.code_hache) && ligne.destination === 'compta' && !ligne.utilise_le
      && new Date(ligne.expire_le) - new Date(ligne.cree_le) <= 61000, JSON.stringify({ ...ligne, code_hache: '…' }));

    // ── Échange ──
    r = await appel('POST', '/auth/passage', null, { code, produit: 'compta' });
    const tokPassage = r.body?.token;
    check('échange sur LabFlow Compta : session ouverte (même compte)', r.status === 200 && !!tokPassage && r.body?.user?.id === clientId && r.body?.user?.role === 'client', `${r.status} ${r.body?.message || ''}`);
    const sansDomaine = (u) => JSON.stringify({ ...u, domaine: u?.domaine?.slug ?? null });
    check('même profil qu\'une connexion par mot de passe', sansDomaine(r.body?.user) === sansDomaine(connexion.body?.user), sansDomaine(r.body?.user));
    r = await appel('GET', '/api/compta/acces', tokPassage);
    check('la session obtenue fonctionne : « Ma comptabilité »', r.status === 200 && r.body?.maComptabilite?.length === 1, JSON.stringify(r.body));
    r = await appel('POST', '/auth/passage', null, { code, produit: 'compta' });
    check('code déjà utilisé : 400 PASSAGE_INVALIDE (la session en place n\'est pas touchée)', r.status === 400 && r.body?.code === 'PASSAGE_INVALIDE', String(r.status));

    // ── Adresse et délai ──
    let c2 = (await appel('POST', '/api/compta/passage', clientTok, { destination: 'compta' })).body?.code;
    r = await appel('POST', '/auth/passage', null, { code: c2, produit: 'labflow' });
    check('code pour LabFlow Compta présenté sur LabFlow : 400', r.status === 400, String(r.status));
    r = await appel('POST', '/auth/passage', null, { code: c2, produit: 'compta' });
    check('… puis accepté sur la bonne adresse (non consommé par l\'erreur)', r.status === 200 && !!r.body?.token, String(r.status));
    c2 = (await appel('POST', '/api/compta/passage', clientTok, { destination: 'compta' })).body?.code;
    await pool.query(`UPDATE compta.sessions_passage SET expire_le = NOW() - interval '1 second' WHERE personne_id = $1 AND utilise_le IS NULL`, [clientId]);
    r = await appel('POST', '/auth/passage', null, { code: c2, produit: 'compta' });
    check('code expiré : 400', r.status === 400, String(r.status));
    r = await appel('POST', '/auth/passage', null, { code: crypto.randomBytes(32).toString('base64url'), produit: 'compta' });
    check('code inconnu : 400', r.status === 400, String(r.status));

    // ── Retour vers LabFlow ──
    r = await appel('POST', '/api/compta/passage', tokPassage, { destination: 'app' });
    r = await appel('POST', '/auth/passage', null, { code: r.body?.code, produit: 'labflow' });
    check('retour vers LabFlow (Stock / Vente) : session ouverte', r.status === 200 && r.body?.user?.id === clientId, String(r.status));

    // ── Lecture seule, blocage ──
    await pool.query(`UPDATE abonnements SET mode_compte = 'read_only' WHERE client_id = $1`, [clientId]);
    r = await appel('POST', '/api/compta/passage', clientTok, { destination: 'compta' });
    check('compte en lecture seule : le passage est permis', r.status === 200 && !!r.body?.code, `${r.status} ${r.body?.message || ''}`);
    await pool.query(`UPDATE abonnements SET mode_compte = 'bloque' WHERE client_id = $1`, [clientId]);
    r = await appel('POST', '/auth/passage', null, { code: r.body?.code, produit: 'compta' });
    check('compte bloqué : l\'échange est refusé comme une connexion (403 account_blocked)', r.status === 403 && r.body?.message === 'account_blocked', `${r.status} ${r.body?.message}`);
    await pool.query(`UPDATE abonnements SET mode_compte = 'actif' WHERE client_id = $1`, [clientId]);

    // ── La session de passage n'est jamais prolongée ni sauvée d'un changement de mot de passe ──
    const decoder = (t) => JSON.parse(Buffer.from(String(t).split('.')[1] || '', 'base64url').toString() || '{}');
    const origine = decoder(clientTok);
    r = await appel('POST', '/api/compta/passage', clientTok, { destination: 'compta' });
    r = await appel('POST', '/auth/passage', null, { code: r.body?.code, produit: 'compta' });
    const issue = decoder(r.body?.token);
    check('jeton du passage : mêmes dates que la session d\'origine (jamais prolongée)', r.status === 200 && issue.iat === origine.iat && issue.exp === origine.exp, JSON.stringify({ origine: [origine.iat, origine.exp], issue: [issue.iat, issue.exp] }));
    r = await appel('POST', '/api/compta/passage', clientTok, { destination: 'compta' });
    const codeAvantChangement = r.body?.code;
    await pool.query('UPDATE utilisateurs SET actif = false WHERE id = $1', [clientId]);
    r = await appel('POST', '/auth/passage', null, { code: codeAvantChangement, produit: 'compta' });
    check('compte désactivé : échange refusé (400)', r.status === 400, String(r.status));
    await pool.query('UPDATE utilisateurs SET actif = true WHERE id = $1', [clientId]);
    await pool.query(`UPDATE utilisateurs SET password_changed_at = NOW() + interval '1 second' WHERE id = $1`, [clientId]);
    r = await appel('POST', '/auth/passage', null, { code: codeAvantChangement, produit: 'compta' });
    check('mot de passe changé après l\'émission : échange refusé (400)', r.status === 400, String(r.status));
    // (La session obtenue par passage porte la date d'émission de l'originale : la révocation par password_changed_at
    // la frappe de la même façon — vérifié ci-dessus par l'égalité des dates.)
    await pool.query('UPDATE utilisateurs SET password_changed_at = NULL WHERE id = $1', [clientId]);

    // ── Limite d'émission : 20 par minute et par personne ──
    let statuts = [];
    for (let i = 0; i < 22; i++) statuts.push((await appel('POST', '/api/compta/passage', clientTok, { destination: 'compta' })).status);
    check('émission limitée (429 au-delà de 20 par minute)', statuts.includes(429), statuts.join(','));

    // ── Comptable sans cabinet ──
    const compTok = (await login(COMPTABLE)).body?.token;
    r = await appel('POST', '/api/compta/passage', compTok, { destination: 'app' });
    check('comptable : pas d\'espace Stock / Vente (403)', r.status === 403, String(r.status));
    r = await appel('GET', '/api/compta/cabinet', compTok);
    const cab = r.status;
    r = await appel('GET', '/api/compta/abonnement', compTok);
    check('pages du cabinet réservées à son titulaire : un comptable sans cabinet → 403', cab === 403 && r.status === 403, `${cab} ${r.status}`);
    r = await appel('GET', '/api/compta/cabinet', clientTok);
    check('… et à un client → 403', r.status === 403, String(r.status));
  } catch (e) {
    console.error(e);
    check('exécution sans erreur', false, e.message);
  } finally {
    await pool.query(`UPDATE tarifs_config SET valeur_dt = $1 WHERE cle = 'compta_module_mensuel'`, [tarifAvant ?? 0]);
    await wipe().catch((e) => console.error('[nettoyage]', e.message));
    await pool.end();
  }
  const ko = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - ko}/${results.length} vérifications passées`);
  process.exit(ko ? 1 : 0);
})();
