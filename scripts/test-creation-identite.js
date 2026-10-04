/* Test E2E local — lot 3, étape 2 (docs/lot-3-spec.md §3) : création d'un client avec son identité légale.
 *   POST /admin/clients/identite/controle, POST /admin/clients (étape 3 : sans contrat, activation immédiate)
 * Crée un super_admin et des clients de test, puis nettoie (SQL, par motif d'email).
 * Backend de test : « node scripts/start-test-backend.js » (jamais « npm start » : la création envoie des emails).
 * Port : PORT (3000 par défaut). */
require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = `http://localhost:${process.env.PORT || 3000}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const MOTIF = 'test-cri-%@example.com';
const ADMIN = 'test-cri-admin@example.com';
const MDP = 'TestCri2026!';

(async () => {
  const wipe = async () => pool.query('DELETE FROM utilisateurs WHERE LOWER(email) LIKE $1', [MOTIF]);
  await wipe();
  try {
    const hash = await bcrypt.hash(MDP, 10);
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminCri', $1, $2, 'super_admin', true)`, [ADMIN, hash]);
    const r0 = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ADMIN, password: MDP }) });
    const tok = (await r0.json()).token;
    check('login super_admin temporaire', !!tok);
    const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` };
    const post = async (p, body, headers = H) => {
      const r = await fetch(`${BASE}${p}`, { method: 'POST', headers, body: JSON.stringify(body) });
      let b = null; try { b = await r.json(); } catch { /* vide */ }
      return { status: r.status, body: b };
    };
    const compte = async (email) => (await pool.query('SELECT count(*)::int AS n FROM utilisateurs WHERE LOWER(email) = LOWER($1)', [email])).rows[0].n;
    const restau = (await pool.query(`SELECT id FROM domaines_activite WHERE slug = 'restauration'`)).rows[0]?.id;
    const base = (email, tel, extra = {}) => ({
      nom: 'TEST-Cri Contact', email, telephone: tel, domaineId: restau,
      nbActivites: 1, nbLabos: 0, nbGerants: 0, nbAcheteurs: 0, formuleActivites: 'premium', montantOnboarding: 0, ...extra,
    });

    // Un client « porteur » : matricule et téléphone déjà en base (profil_entreprise seulement pour le téléphone)
    const porteur = await pool.query(
      `INSERT INTO utilisateurs (nom, email, role, actif, onboarding_step, telephone) VALUES ('TEST-Cri Porteur', 'test-cri-porteur@example.com', 'client', true, 0, '20000001') RETURNING id`);
    await pool.query(
      `INSERT INTO profil_entreprise (client_id, nom, email, telephone, raison_sociale, matricule_fiscal)
       VALUES ($1, 'TEST-Cri Porteur', 'test-cri-porteur@example.com', '+216 98 765 432', 'TEST Porteur SARL', '7654321B/A/M/000')`,
      [porteur.rows[0].id]);

    // ── 1. Contrôle de l'identité (1re étape de l'assistant)
    let r = await post('/admin/clients/identite/controle', {
      raisonSociale: '  TEST Cri  SARL ', formeJuridique: 'sarl', matriculeFiscal: 'MF : 1234567aam000', rne: '', adresse: '3 rue  de Rome',
      ville: '1000 Tunis', representantNom: '', representantQualite: 'Gérant', nomCommercial: '',
    });
    check('contrôle : 200, valeurs normalisées (MF, forme, espaces)',
      r.status === 200 && r.body?.valeurs?.matriculeFiscal === '1234567A/A/M/000' && r.body.valeurs.formeJuridique === 'SARL'
      && r.body.valeurs.raisonSociale === 'TEST Cri SARL' && r.body.valeurs.adresse === '3 rue de Rome' && r.body.valeurs.rne === null, JSON.stringify(r.body));
    check('contrôle : 9 champs renvoyés, aucun avertissement', r.body && Object.keys(r.body.valeurs).length === 9 && r.body.avertissements.length === 0);
    r = await post('/admin/clients/identite/controle', { matriculeFiscal: '7654321/B/M/000' });
    check('contrôle : MF d\'un autre compte (7 chiffres) → avertissement nommant le compte',
      r.status === 200 && r.body.avertissements.some((t) => t.includes('TEST Porteur SARL')), JSON.stringify(r.body?.avertissements));
    for (const [cas, body] of [['MF invalide', { matriculeFiscal: 'B0123452024' }], ['arabe', { raisonSociale: 'شركة' }], ['forme inconnue', { formeJuridique: 'GIE' }]]) {
      r = await post('/admin/clients/identite/controle', body);
      check(`contrôle : 400 ${cas}`, r.status === 400 && typeof r.body?.message === 'string', `${r.status} ${r.body?.message || ''}`);
    }
    r = await post('/admin/clients/identite/controle', {}, { 'Content-Type': 'application/json' });
    check('contrôle : sans jeton → 401', r.status === 401, String(r.status));
    // Le contrôle n'écrit rien
    check('contrôle : rien n\'est écrit en base', (await pool.query(`SELECT count(*)::int AS n FROM profil_entreprise WHERE raison_sociale = 'TEST Cri SARL'`)).rows[0].n === 0);

    // ── 2. Lot 3, étape 3 : plus d'aperçu de contrat (sans engagement)
    r = await post('/api/abonnements/contrat-preview', { nom: 'TEST-Cri Contact', email: 'test-cri-x@example.com', domaineId: restau, nbActivites: 1 });
    check('aperçu du contrat retiré (lot 3) → 404', r.status === 404, String(r.status));

    // ── 3. Création avec identité complète
    const EMAIL_A = 'test-cri-a@example.com';
    r = await post('/admin/clients', base(EMAIL_A, '20123461', {
      raisonSociale: 'TEST Cri SARL', formeJuridique: 'SARL', matriculeFiscal: '1234567aam000', rne: '1234567A',
      adresse: ' 3 rue  de Rome ', ville: '1000 Tunis', representantNom: 'Ali Ben Salah', representantQualite: 'Gérant', nomCommercial: '',
    }));
    check('création avec identité : 201', r.status === 201, r.status !== 201 ? JSON.stringify(r.body) : '');
    const idA = r.body?.id;
    check('réponse de création inchangée (pas de clé entreprise / nomAffiche, I9)', r.body && !('entreprise' in r.body) && !('nomAffiche' in r.body) && r.body.name === 'TEST-Cri Contact');
    const peA = (await pool.query('SELECT * FROM profil_entreprise WHERE client_id = $1', [idA])).rows[0] || {};
    check('base : identité écrite et normalisée', peA.raison_sociale === 'TEST Cri SARL' && peA.forme_juridique === 'SARL'
      && peA.matricule_fiscal === '1234567A/A/M/000' && peA.rne === '1234567A' && peA.adresse === '3 rue de Rome' && peA.ville === '1000 Tunis'
      && peA.representant_nom === 'Ali Ben Salah' && peA.representant_qualite === 'Gérant' && peA.nom_commercial === null, JSON.stringify(peA));
    check('base : nom / email / téléphone du profil = contact (comme avant)', peA.nom === 'TEST-Cri Contact' && peA.email === EMAIL_A && peA.telephone === '20123461');
    // Lot 3, étape 3 : invite_sent posé dès la création, aucune soumission de contrat. NB : ce backend de test n'a pas
    // de DocuSeal ; la preuve « même avec DocuSeal configuré » est la clé emails.site.creation de la référence de sortie.
    const aboA = (await pool.query('SELECT invite_sent, contrat_submission_id FROM abonnements WHERE client_id = $1 ORDER BY id DESC LIMIT 1', [idA])).rows[0];
    check('création : invite_sent vrai dès la création, aucune soumission de contrat enregistrée', aboA?.invite_sent === true && aboA.contrat_submission_id === null, JSON.stringify(aboA));
    const ficheA = await fetch(`${BASE}/admin/clients/${idA}`, { headers: H }).then((x) => x.json());
    check('fiche : nom affiché = raison sociale, identité complète', ficheA.nomAffiche === 'TEST Cri SARL' && ficheA.identiteComplete === true);

    // ── 4. Création SANS identité (comme avant) : 201, identité vide
    const EMAIL_B = 'test-cri-b@example.com';
    r = await post('/admin/clients', base(EMAIL_B, '20123462'));
    check('création sans identité : 201 (identité facultative)', r.status === 201, r.status !== 201 ? JSON.stringify(r.body) : '');
    const peB = (await pool.query('SELECT raison_sociale, matricule_fiscal, adresse FROM profil_entreprise WHERE client_id = $1', [r.body?.id])).rows[0] || {};
    check('sans identité : colonnes vides', peB.raison_sociale === null && peB.matricule_fiscal === null && peB.adresse === null);

    // ── 5. Refus AVANT toute écriture (aucun compte créé)
    const EMAIL_C = 'test-cri-c@example.com';
    for (const [cas, extra] of [
      ['MF invalide', { matriculeFiscal: 'B0123452024' }],
      ['arabe dans la raison sociale', { raisonSociale: 'شركة' }],
      ['adresse trop longue', { adresse: 'x'.repeat(301) }],
      ['nom du contact > 100 caractères', { nom: 'N'.repeat(101) }],
      ['nom du contact de 101 caractères entouré d\'espaces', { nom: ' ' + 'N'.repeat(101) + ' ' }],
    ]) {
      r = await post('/admin/clients', base(EMAIL_C, '20123463', extra));
      check(`création refusée (400) : ${cas}, aucun compte créé`, r.status === 400 && (await compte(EMAIL_C)) === 0, `${r.status} ${r.body?.message || ''}`);
    }

    r = await post('/admin/clients', base('test-cri-f@example.com', '20123465', { nom: '  ' + 'N'.repeat(100) + '  ' }));
    const nomF = (await pool.query('SELECT nom FROM utilisateurs WHERE email = $1', ['test-cri-f@example.com'])).rows[0]?.nom;
    check('nom du contact de 100 caractères entouré d\'espaces : rogné puis accepté (201, pas de 500)', r.status === 201 && nomF === 'N'.repeat(100), `${r.status} ${r.body?.message || ''}`);

    // ── 6. Doublons : téléphone (8 derniers chiffres ; fiches entreprise À JOUR seulement), email sans la casse
    // Porteur 2 : fiche à jour (même numéro que le compte, écrit autrement) ; porteur 3 : copie périmée au numéro EXACT.
    const p2 = await pool.query(`INSERT INTO utilisateurs (nom, email, role, actif, onboarding_step, telephone) VALUES ('TEST-Cri Porteur2', 'test-cri-porteur2@example.com', 'client', true, 0, '22 333 444') RETURNING id`);
    await pool.query(`INSERT INTO profil_entreprise (client_id, nom, email, telephone, raison_sociale) VALUES ($1, 'TEST-Cri Porteur2', 'test-cri-porteur2@example.com', '22333444', 'TEST Porteur2 SARL')`, [p2.rows[0].id]);
    const p3 = await pool.query(`INSERT INTO utilisateurs (nom, email, role, actif, onboarding_step, telephone) VALUES ('TEST-Cri Porteur3', 'test-cri-porteur3@example.com', 'client', true, 0, '23000003') RETURNING id`);
    await pool.query(`INSERT INTO profil_entreprise (client_id, nom, email, telephone) VALUES ($1, 'TEST-Cri Porteur3', 'test-cri-porteur3@example.com', '24555666')`, [p3.rows[0].id]);

    r = await post('/admin/clients', base(EMAIL_C, '+216 22 333 444'));
    check('téléphone d\'une fiche entreprise à jour (écrit autrement) → 409 nommant le compte, aucun compte créé',
      r.status === 409 && /TEST Porteur2 SARL|TEST-Cri Porteur2/.test(r.body?.message || '') && (await compte(EMAIL_C)) === 0, `${r.status} ${r.body?.message || ''}`);
    r = await post('/admin/clients', base('test-cri-d@example.com', '98765432'));
    check('copie PÉRIMÉE d\'un ancien numéro (+216 98 765 432, le compte a changé de numéro) → pas un doublon : 201',
      r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const peD = (await pool.query('SELECT telephone FROM profil_entreprise WHERE client_id = $1', [r.body?.id])).rows[0];
    check('copie périmée écrite autrement : le nouveau profil garde son numéro', peD?.telephone === '98765432', JSON.stringify(peD));
    r = await post('/admin/clients', base('test-cri-e@example.com', '24555666'));
    check('copie PÉRIMÉE au numéro exact (contrainte UNIQUE) → 201, téléphone du nouveau profil laissé vide',
      r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const peE = (await pool.query('SELECT p.telephone, u.telephone AS tel_compte FROM profil_entreprise p JOIN utilisateurs u ON u.id = p.client_id WHERE p.client_id = $1', [r.body?.id])).rows[0];
    check('… compte créé avec son téléphone, copie du profil vide', peE?.telephone === null && peE?.tel_compte === '24555666', JSON.stringify(peE));
    r = await post('/admin/clients', base(EMAIL_C, '+216 20 000 001'));
    check('téléphone d\'un utilisateur écrit autrement (+216 20 000 001) → 409', r.status === 409 && /TEST-Cri Porteur/.test(r.body?.message || ''), `${r.status} ${r.body?.message || ''}`);
    r = await post('/admin/clients', base('Test-Cri-A@Example.com', '20123464'));
    check('email existant avec une autre casse → 409, aucun doublon', r.status === 409 && /email/i.test(r.body?.message || '') && (await compte(EMAIL_A)) === 1, `${r.status} ${r.body?.message || ''}`);
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
