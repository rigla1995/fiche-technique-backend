/* Test E2E local — lot 3, étape 1 (docs/lot-3-spec.md §2) : identité légale d'un client existant.
 *   PUT /admin/clients/:id/identite, GET /admin/clients, GET /admin/clients/:id
 * Crée un super_admin et trois clients de test directement en base (aucun email, aucun contrat), puis nettoie.
 * Backend de test : « node scripts/start-test-backend.js » (jamais « npm start »). Port : PORT (3000 par défaut). */
require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = `http://localhost:${process.env.PORT || 3000}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

const EMAILS = ['test-admin-idl@example.com', 'test-idl-a@example.com', 'test-idl-b@example.com', 'test-idl-c@example.com'];
const MDP = 'TestIdl2026!';

(async () => {
  const wipe = async () => pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [EMAILS]);
  await wipe();
  try {
    const hash = await bcrypt.hash(MDP, 10);
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminIdl', $1, $2, 'super_admin', true)`,
      [EMAILS[0], hash]
    );
    const ids = [];
    for (const [i, nom] of [[1, 'TEST-Idl Contact A'], [2, 'TEST-Idl Contact B'], [3, 'TEST-Idl Contact C']]) {
      const u = await pool.query(
        `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step) VALUES ($1, $2, $3, 'client', true, 0) RETURNING id`,
        [nom, EMAILS[i], hash]
      );
      ids.push(u.rows[0].id);
    }
    const [idA, idB, idC] = ids;
    // A et C ont une ligne profil_entreprise (comme à la création) ; B n'en a pas (cas des comptes anciens).
    await pool.query(`INSERT INTO profil_entreprise (client_id, nom, email, adresse) VALUES ($1, 'TEST-Idl Contact A', $2, 'Ancienne adresse A')`, [idA, EMAILS[1]]);
    await pool.query(`INSERT INTO profil_entreprise (client_id, nom, email, matricule_fiscal) VALUES ($1, 'TEST-Idl Contact C', $2, '7654321B/A/M/000')`, [idC, EMAILS[3]]);

    const login = async (email) => {
      const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: MDP }) });
      return (await r.json()).token;
    };
    const tok = await login(EMAILS[0]);
    check('login super_admin temporaire', !!tok);
    const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
    const put = async (id, body, t = tok) => {
      const r = await fetch(`${BASE}/admin/clients/${id}/identite`, { method: 'PUT', headers: H(t), body: JSON.stringify(body) });
      let b = null; try { b = await r.json(); } catch { /* corps vide */ }
      return { status: r.status, body: b };
    };
    const get = async (p) => { const r = await fetch(`${BASE}${p}`, { headers: H(tok) }); return { status: r.status, body: await r.json() }; };

    // ── 1. Liste : client sans identité → nom affiché = contact, pastille (identiteComplete false)
    let r = await get('/admin/clients');
    let a = r.body.find?.((c) => c.id === idA);
    check('GET /admin/clients : 200, champs existants intacts', r.status === 200 && a?.name === 'TEST-Idl Contact A' && a.email === EMAILS[1] && a.adresse === 'Ancienne adresse A');
    check('liste : nomAffiche = contact, identiteComplete false, entreprise à 9 champs',
      a?.nomAffiche === 'TEST-Idl Contact A' && a.identiteComplete === false && Object.keys(a.entreprise || {}).length === 9 && a.entreprise.adresse === 'Ancienne adresse A');

    // ── 2. Saisie complète, normalisation du MF
    r = await put(idA, {
      raisonSociale: '  TEST Dar Yasmine  SARL ', formeJuridique: 'sarl', matriculeFiscal: '1234567aam000', rne: '1234567A',
      adresse: '12 rue de Marseille', ville: '1000 Tunis', representantNom: 'Ali Ben Salah', representantQualite: 'Gérant',
    });
    check('PUT identité complète → 200', r.status === 200, r.status !== 200 ? JSON.stringify(r.body) : '');
    check('réponse : MF normalisé, forme en majuscules, espaces réduits',
      r.body?.entreprise?.matriculeFiscal === '1234567A/A/M/000' && r.body.entreprise.formeJuridique === 'SARL' && r.body.entreprise.raisonSociale === 'TEST Dar Yasmine SARL');
    check('réponse : nomAffiche = raison sociale, identiteComplete true, avertissements []',
      r.body?.nomAffiche === 'TEST Dar Yasmine SARL' && r.body.identiteComplete === true && Array.isArray(r.body.avertissements) && r.body.avertissements.length === 0);
    check('réponse : nom du contact et email inchangés', r.body?.name === 'TEST-Idl Contact A' && r.body.email === EMAILS[1]);
    const pe = (await pool.query('SELECT nom, email, adresse, ville FROM profil_entreprise WHERE client_id = $1', [idA])).rows[0];
    check('base : pe.nom / pe.email intacts, adresse et ville écrites', pe.nom === 'TEST-Idl Contact A' && pe.email === EMAILS[1] && pe.adresse === '12 rue de Marseille' && pe.ville === '1000 Tunis');

    // ── 3. Nom commercial prioritaire ; champ absent non touché ; vide → NULL
    r = await put(idA, { nomCommercial: 'Le Jasmin' });
    check('nom commercial → nomAffiche = nom commercial, le reste conservé', r.status === 200 && r.body.nomAffiche === 'Le Jasmin' && r.body.entreprise.raisonSociale === 'TEST Dar Yasmine SARL' && r.body.entreprise.ville === '1000 Tunis');
    r = await put(idA, { nomCommercial: '', ville: '' });
    check('chaîne vide → NULL', r.status === 200 && r.body.entreprise.nomCommercial === null && r.body.entreprise.ville === null && r.body.nomAffiche === 'TEST Dar Yasmine SARL');

    // ── 4. Refus (400, jamais 500), rien n'est écrit
    const avant = JSON.stringify((await get(`/admin/clients/${idA}`)).body.entreprise);
    for (const [cas, body] of [
      ['MF invalide', { matriculeFiscal: 'B0123452024', raisonSociale: 'NE PAS ÉCRIRE' }],
      ['forme inconnue', { formeJuridique: 'GIE' }],
      ['arabe', { raisonSociale: 'شركة' }],
      ['émoji', { ville: 'Tunis 🌴' }],
      ['trop long', { raisonSociale: 'x'.repeat(256) }],
    ]) {
      r = await put(idA, body);
      check(`400 ${cas}`, r.status === 400 && typeof r.body?.message === 'string' && Array.isArray(r.body.erreurs), `${r.status} ${r.body?.message || ''}`);
    }
    check('après les refus : identité inchangée', JSON.stringify((await get(`/admin/clients/${idA}`)).body.entreprise) === avant);

    // ── 5. MF sans clé → avertissement ; MF partagé → avertissement, sauvegarde faite
    r = await put(idB, { raisonSociale: 'TEST Idl B', matriculeFiscal: '7654321/A/M/000' });
    check('client sans ligne profil_entreprise : ligne créée (nom/email = contact)', r.status === 200 && r.body.entreprise.raisonSociale === 'TEST Idl B');
    const peB = (await pool.query('SELECT nom, email FROM profil_entreprise WHERE client_id = $1', [idB])).rows[0];
    check('ligne créée : nom et email copiés du contact', peB?.nom === 'TEST-Idl Contact B' && peB.email === EMAILS[2]);
    check('MF sans clé : avertissement', r.body.avertissements.some((t) => /sans lettre de clé/.test(t)));
    check('MF sans clé, même identifiant à 7 chiffres qu\'un autre compte : avertissement « déjà porté »',
      r.body.avertissements.some((t) => t.includes('TEST-Idl Contact C')), JSON.stringify(r.body.avertissements));
    r = await put(idB, { matriculeFiscal: '7654321 b/a/m/000' });
    check('MF déjà porté par un autre compte : 200 + avertissement nommant le compte',
      r.status === 200 && r.body.entreprise.matriculeFiscal === '7654321B/A/M/000' && r.body.avertissements.some((t) => t.includes('TEST-Idl Contact C')), JSON.stringify(r.body?.avertissements));

    // ── 6. Fiche, 404, droits
    r = await get(`/admin/clients/${idA}`);
    check('GET /admin/clients/:id : identité + activatedAt présent', r.status === 200 && r.body.entreprise?.matriculeFiscal === '1234567A/A/M/000' && 'activatedAt' in r.body);
    check('GET /admin/clients/abc → 404', (await get('/admin/clients/abc')).status === 404);
    check('PUT identité client inconnu → 404', (await put(999999999, { raisonSociale: 'X' })).status === 404);
    check('PUT identité id non numérique → 404', (await put('abc', { raisonSociale: 'X' })).status === 404);
    check('PUT identité id à 10 chiffres → 404 (pas de 500)', (await put('9999999999', { raisonSociale: 'X' })).status === 404);
    check('GET /admin/clients/:id à 10 chiffres → 404', (await get('/admin/clients/9999999999')).status === 404);

    // ── 7. Réponse de la route existante PUT /admin/clients/:id inchangée (pas de clés d'identité, I9)
    const rUp = await fetch(`${BASE}/admin/clients/${idA}`, { method: 'PUT', headers: H(tok), body: JSON.stringify({ name: 'TEST-Idl Contact A' }) });
    const bUp = await rUp.json();
    check('PUT /admin/clients/:id : 200, réponse sans entreprise / nomAffiche / identiteComplete',
      rUp.status === 200 && !('entreprise' in bUp) && !('nomAffiche' in bUp) && !('identiteComplete' in bUp), `${rUp.status} ${Object.keys(bUp).join(',')}`);

    // ── 8. Identité complète = raison sociale + MF + adresse + ville ; texte copié d'un PDF nettoyé
    r = await put(idA, { ville: '' });
    check('ville vidée → identiteComplete false', r.status === 200 && r.body.identiteComplete === false);
    r = await put(idA, { ville: '1000 Tunis', nomCommercial: 'ﬁne Société' });
    check('ville remise (espace insécable) + ligature et accents décomposés → nettoyés, identiteComplete true',
      r.status === 200 && r.body.identiteComplete === true && r.body.entreprise.ville === '1000 Tunis' && r.body.entreprise.nomCommercial === 'fine Société', JSON.stringify(r.body?.entreprise));
    r = await put(idA, { matriculeFiscal: 'MF : 123456A/A/M/000' });
    check('MF à 6 chiffres (libellé collé) → 400 message dédié', r.status === 400 && /7 chiffres/.test(r.body?.message || ''), r.body?.message);
    const adminId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [EMAILS[0]])).rows[0].id;
    check('PUT identité sur un compte non client → 404', (await put(adminId, { raisonSociale: 'X' })).status === 404);
    const tokClient = await login(EMAILS[1]);
    if (tokClient) {
      r = await put(idA, { raisonSociale: 'PIRATE' }, tokClient);
      check('un client ne peut pas appeler la route admin (403)', r.status === 403, String(r.status));
    } else {
      check('login du client de test (pour le contrôle 403)', false, 'connexion refusée');
    }
    const brut = await fetch(`${BASE}/admin/clients/${idA}/identite`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    check('sans jeton → 401', brut.status === 401, String(brut.status));
  } catch (e) {
    check('exécution', false, e.stack || e.message);
  } finally {
    await wipe();
    await pool.end();
    const ko = results.filter((x) => !x.ok).length;
    console.log(`\n${results.length - ko}/${results.length} contrôles verts`);
    process.exit(ko ? 1 : 0);
  }
})();
