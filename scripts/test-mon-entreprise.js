/* Test E2E local — lot 3, étape 6 (docs/lot-3-spec.md §4) : « Mon entreprise » côté client.
 *   PUT /api/entreprise/identite  (compte client seulement ; liste blanche : adresse, ville, représentant, qualité)
 *   GET /api/entreprise           (identite à 9 champs + identiteComplete ; un gérant lit la fiche du compte parent)
 *   PUT /api/entreprise           (ancienne route, supprimée : 404)
 * Couvre : lecture par le client de l'identité posée par l'admin, écriture relue par le client et par l'admin, champs
 * hors liste ignorés, champ absent non touché, vide → NULL, refus 400 lisibles (arabe, émoji, trop long, non texte),
 * nettoyage du texte, gérant (PUT 403, GET 200, aucune ligne orpheline), super admin 403, sans jeton 401, ligne
 * profil_entreprise supprimée puis recréée, compte en lecture seule refusé.
 * Crée un super_admin + 3 clients + 1 gérant temporaires, puis nettoie. */
// ⚠️ Démarrer le backend de test par « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué) —
//    jamais par « npm start » avec le .env d'un poste de développement, qui contient de vraies clés.
require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const MDP = 'TestMonEnt2026!';
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
const login = async (email) => (await appel('POST', '/auth/login', null, { email, password: MDP })).body?.token;

const CLES_IDENTITE = ['raisonSociale', 'nomCommercial', 'formeJuridique', 'matriculeFiscal', 'rne', 'adresse', 'ville', 'representantNom', 'representantQualite'];
const memesCles = (objet) => !!objet && JSON.stringify(Object.keys(objet)) === JSON.stringify(CLES_IDENTITE);
// Message d'erreur lisible : un texte, pas « Erreur serveur », aucune balise de vocabulaire non rendue.
const lisible = (m) => typeof m === 'string' && m.length > 3 && !/erreur serveur/i.test(m) && !m.includes('[[');

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-monent@example.com';
  const CLIENTS = ['test-monent-1@example.com', 'test-monent-2@example.com', 'test-monent-3@example.com'];
  const GERANTS = ['test-monent-g1@example.com'];
  const wipe = async () => {
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [GERANTS]);
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [CLIENTS]);
    await pool.query('DELETE FROM utilisateurs WHERE email = $1', [ADMIN]);
  };
  await wipe();
  const idsCrees = [];

  // Ligne profil_entreprise d'un compte, lue en base (null si absente) ; `fige` = tout sauf updated_at, pour comparer.
  const ligne = async (clientId) => (await pool.query(
    `SELECT nom, email, telephone, raison_sociale, nom_commercial, forme_juridique, matricule_fiscal, rne,
            adresse, ville, representant_nom, representant_qualite, module_acheteurs_actif, updated_at
       FROM profil_entreprise WHERE client_id = $1`, [clientId])).rows[0] || null;
  const fige = (l) => JSON.stringify(l && { ...l, updated_at: undefined });

  try {
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminMonEnt', $1, $2, 'super_admin', true)`,
      [ADMIN, hash]
    );
    const adminTok = await login(ADMIN);
    check('login super_admin temporaire', !!adminTok);

    // Trois clients activés. Client 1 : 1 activité et 1 gérant (parcours principal). Client 2 : ligne profil_entreprise
    // supprimée à la main. Client 3 : compte en lecture seule (aucune requête authentifiée avant le changement de mode :
    // le contexte d'authentification est gardé 15 s en mémoire par le serveur).
    const comptes = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await appel('POST', '/admin/clients', adminTok, { nom: `TEST-MonEnt${i + 1}`, email: CLIENTS[i], telephone: `2077720${i + 1}`, nbActivites: 1, nbLabos: 0, nbGerants: 1, montantOnboarding: 0 });
      check(`création client ${i + 1}`, r.status === 201, String(r.status));
      const id = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENTS[i]])).rows[0].id;
      idsCrees.push(id);
      await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, id]);
      comptes.push({ id, email: CLIENTS[i], nom: `TEST-MonEnt${i + 1}` });
    }
    const [c1, c2, c3] = comptes;
    c1.tok = await login(c1.email);
    check('login du client 1', !!c1.tok);
    let r = await appel('POST', '/api/entreprise/activites', c1.tok, { nom: 'Activité MonEnt 1' });
    check('client 1 : activité créée', r.status === 201, String(r.status));
    r = await appel('POST', '/api/abonnements/gerants', c1.tok, { nom: 'TEST-Gérant MonEnt 1', telephone: '20777301', email: GERANTS[0], activiteIds: [r.body?.id] });
    check('client 1 : gérant créé', r.status === 201 && !!r.body?.id, String(r.status));
    const gerantId = r.body?.id;
    idsCrees.push(gerantId);
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, gerantId]);

    // ── 1. Lecture par le client : identite (9 clés) + identiteComplete, champs existants intacts
    r = await appel('GET', '/api/entreprise', c1.tok);
    check('client : GET /api/entreprise → 200, identite à 9 clés (ordre de l\'API)', r.status === 200 && memesCles(r.body?.identite), `${r.status} ${JSON.stringify(Object.keys(r.body?.identite || {}))}`);
    check('client : identiteComplete présent et faux (compte neuf)', r.body?.identiteComplete === false, JSON.stringify(r.body?.identiteComplete));
    check('client : champs existants intacts (id, clientId, nom, email, adresse, createdAt, formule_activites, domaine)',
      r.body?.clientId === c1.id && r.body.nom === c1.nom && r.body.email === c1.email && Number.isInteger(r.body.id)
      && 'adresse' in r.body && 'telephone' in r.body && 'memeActivite' in r.body && 'createdAt' in r.body
      && 'module_vente_actif' in r.body && 'module_acheteurs_actif' in r.body && 'formule_activites' in r.body && 'domaine' in r.body,
      JSON.stringify(Object.keys(r.body || {})));

    // ── 2. L'admin pose la raison sociale et le matricule fiscal ; le client les LIT
    r = await appel('PUT', `/admin/clients/${c1.id}/identite`, adminTok, { raisonSociale: 'TEST MonEnt SARL', matriculeFiscal: '1234567aam000' });
    check('admin : PUT /admin/clients/:id/identite (raison sociale + matricule) → 200', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', '/api/entreprise', c1.tok);
    check('client : lit la raison sociale et le matricule posés par l\'admin',
      r.body?.identite?.raisonSociale === 'TEST MonEnt SARL' && r.body.identite.matriculeFiscal === '1234567A/A/M/000', JSON.stringify(r.body?.identite));
    check('client : identiteComplete encore faux (ni adresse ni ville)', r.body?.identiteComplete === false);

    // ── 3. Le client complète l'adresse et la ville
    r = await appel('PUT', '/api/entreprise/identite', c1.tok, { adresse: '12 rue de Marseille', ville: '1000 Tunis' });
    check('client : PUT /api/entreprise/identite (adresse + ville) → 200', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    check('réponse du PUT : { identite (9 clés), identiteComplete } et rien d\'autre',
      JSON.stringify(Object.keys(r.body || {})) === '["identite","identiteComplete"]' && memesCles(r.body.identite), JSON.stringify(Object.keys(r.body || {})));
    check('réponse du PUT : adresse et ville écrites, identiteComplete vrai, identité de l\'admin intacte',
      r.body?.identite?.adresse === '12 rue de Marseille' && r.body.identite.ville === '1000 Tunis' && r.body.identiteComplete === true
      && r.body.identite.raisonSociale === 'TEST MonEnt SARL' && r.body.identite.matriculeFiscal === '1234567A/A/M/000', JSON.stringify(r.body));
    r = await appel('GET', '/api/entreprise', c1.tok);
    check('client : relu par GET, identiteComplete devient vrai',
      r.body?.identite?.adresse === '12 rue de Marseille' && r.body.identite.ville === '1000 Tunis' && r.body.identiteComplete === true && r.body.adresse === '12 rue de Marseille',
      JSON.stringify(r.body?.identite));
    r = await appel('GET', `/admin/clients/${c1.id}`, adminTok);
    check('admin : GET /admin/clients/:id voit la même adresse et la même ville, identiteComplete vrai',
      r.status === 200 && r.body?.entreprise?.adresse === '12 rue de Marseille' && r.body.entreprise.ville === '1000 Tunis' && r.body.identiteComplete === true,
      `${r.status} ${JSON.stringify(r.body?.entreprise)}`);

    // ── 4. Liste blanche : les champs réservés à l'équipe LabFlow sont ignorés
    let avant = await ligne(c1.id);
    r = await appel('PUT', '/api/entreprise/identite', c1.tok, {
      matriculeFiscal: '7654321B/A/M/000', raisonSociale: 'PIRATE SARL', formeJuridique: 'SA', rne: '9999999Z', nomCommercial: 'Pirate',
      nom: 'PIRATE', email: 'pirate@example.com', telephone: '99999999', module_acheteurs_actif: true, client_id: 1,
      representantNom: 'Ali Ben Salah',
    });
    let apres = await ligne(c1.id);
    check('client : PUT avec matricule / raison sociale / forme / RNE / nom commercial → 200', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    check('… ces 5 colonnes n\'ont PAS changé en base',
      apres.matricule_fiscal === '1234567A/A/M/000' && apres.raison_sociale === 'TEST MonEnt SARL' && apres.forme_juridique === avant.forme_juridique
      && apres.rne === avant.rne && apres.nom_commercial === avant.nom_commercial && apres.forme_juridique === null && apres.rne === null && apres.nom_commercial === null,
      JSON.stringify(apres));
    check('… ni le nom, l\'email, le téléphone du profil, ni le module Acheteurs',
      apres.nom === avant.nom && apres.email === avant.email && apres.telephone === avant.telephone && apres.module_acheteurs_actif === avant.module_acheteurs_actif, JSON.stringify(apres));
    check('… le champ de la liste envoyé avec eux (représentant) est bien écrit, la réponse garde l\'identité de l\'admin',
      apres.representant_nom === 'Ali Ben Salah' && r.body?.identite?.matriculeFiscal === '1234567A/A/M/000' && r.body.identite.raisonSociale === 'TEST MonEnt SARL', JSON.stringify(r.body?.identite));
    avant = apres;
    r = await appel('PUT', '/api/entreprise/identite', c1.tok, { matriculeFiscal: 'B0123452024', raisonSociale: 'شركة', formeJuridique: 'GIE' });
    apres = await ligne(c1.id);
    check('client : PUT avec SEULEMENT des champs hors liste (même invalides) → 200, aucune écriture (updated_at intact)',
      r.status === 200 && fige(apres) === fige(avant) && String(apres.updated_at) === String(avant.updated_at), `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', '/api/entreprise/identite', c1.tok, {});
    apres = await ligne(c1.id);
    check('client : corps vide → 200, aucune écriture, identité renvoyée',
      r.status === 200 && fige(apres) === fige(avant) && String(apres.updated_at) === String(avant.updated_at) && r.body?.identite?.adresse === '12 rue de Marseille', `${r.status}`);

    // ── 5. Champ absent non touché ; chaîne vide → NULL
    r = await appel('PUT', '/api/entreprise/identite', c1.tok, { ville: 'Sfax' });
    apres = await ligne(c1.id);
    check('PUT avec seulement « ville » : ville changée, adresse et représentant non touchés',
      r.status === 200 && apres.ville === 'Sfax' && apres.adresse === '12 rue de Marseille' && apres.representant_nom === 'Ali Ben Salah', JSON.stringify(apres));
    r = await appel('PUT', '/api/entreprise/identite', c1.tok, { ville: '', representantNom: '   ' });
    apres = await ligne(c1.id);
    check('chaîne vide (ou espaces seuls) → NULL en base, identiteComplete redevient faux',
      r.status === 200 && apres.ville === null && apres.representant_nom === null && apres.adresse === '12 rue de Marseille'
      && r.body?.identite?.ville === null && r.body.identiteComplete === false, `${r.status} ${JSON.stringify(apres)}`);
    r = await appel('PUT', '/api/entreprise/identite', c1.tok, { ville: '1000 Tunis', representantNom: 'Ali Ben Salah', representantQualite: 'Gérant' });
    check('ville remise : identiteComplete vrai, représentant et qualité écrits',
      r.status === 200 && r.body?.identiteComplete === true && r.body.identite.representantNom === 'Ali Ben Salah' && r.body.identite.representantQualite === 'Gérant', JSON.stringify(r.body));

    // ── 6. Refus 400 lisibles, rien n'est écrit
    avant = await ligne(c1.id);
    for (const [cas, corps, motif] of [
      ['arabe', { adresse: 'شارع الحبيب بورقيبة' }, /caractères latins/],
      ['émoji', { ville: 'Tunis 🌴' }, /caractères latins/],
      ['adresse de 301 caractères', { adresse: 'x'.repeat(301) }, /300 caractères/],
      ['ville de 121 caractères', { ville: 'x'.repeat(121) }, /120 caractères/],
      ['représentant de 151 caractères', { representantNom: 'x'.repeat(151) }, /150 caractères/],
      ['qualité de 81 caractères', { representantQualite: 'x'.repeat(81) }, /80 caractères/],
      ['valeur numérique', { ville: 1000 }, /./],
      ['valeur objet', { adresse: { rue: '12 rue de Marseille' } }, /./],
      ['valeur tableau', { representantNom: ['Ali'] }, /./],
      ['valeur booléenne', { representantQualite: true }, /./],
      ['un champ valide + un champ refusé (émoji)', { adresse: 'NE PAS ÉCRIRE', ville: 'Tunis 🌴' }, /caractères latins/],
      ['un champ valide + un champ non texte', { adresse: 'NE PAS ÉCRIRE', ville: 0 }, /./],
    ]) {
      r = await appel('PUT', '/api/entreprise/identite', c1.tok, corps);
      check(`400 ${cas} : message lisible`, r.status === 400 && lisible(r.body?.message) && motif.test(r.body.message), `${r.status} ${r.body?.message || ''}`);
    }
    apres = await ligne(c1.id);
    check('après les 12 refus : ligne inchangée en base (updated_at compris)', fige(apres) === fige(avant) && String(apres.updated_at) === String(avant.updated_at), JSON.stringify(apres));
    r = await appel('PUT', '/api/entreprise/identite', c1.tok, { adresse: 'x'.repeat(300) });
    check('adresse de 300 caractères exactement → 200', r.status === 200 && r.body?.identite?.adresse?.length === 300, String(r.status));

    // ── 7. Nettoyage du texte : espaces multiples, espace insécable, accents décomposés
    r = await appel('PUT', '/api/entreprise/identite', c1.tok, { adresse: '  12   rue de   Marseille ', ville: '1000 Tunis', representantQualite: 'Gérant' });
    apres = await ligne(c1.id);
    check('texte nettoyé : espaces multiples et espace insécable réduits, accent recomposé',
      r.status === 200 && apres.adresse === '12 rue de Marseille' && apres.ville === '1000 Tunis' && apres.representant_qualite === 'Gérant'
      && r.body?.identite?.adresse === '12 rue de Marseille', `${r.status} ${JSON.stringify([apres.adresse, apres.ville, apres.representant_qualite])}`);

    // ── 8. Gérant du compte : écriture refusée, lecture de la fiche du compte parent, aucune ligne orpheline
    const gerantTok = await login(GERANTS[0]);
    check('login du gérant activé', !!gerantTok);
    avant = await ligne(c1.id);
    r = await appel('PUT', '/api/entreprise/identite', gerantTok, { adresse: 'Adresse du gérant', ville: 'Bizerte' });
    apres = await ligne(c1.id);
    check('gérant : PUT → 403, message lisible', r.status === 403 && lisible(r.body?.message), `${r.status} ${r.body?.message || ''}`);
    check('gérant : la fiche du compte parent n\'a pas changé', fige(apres) === fige(avant) && String(apres.updated_at) === String(avant.updated_at));
    r = await appel('GET', '/api/entreprise', gerantTok);
    check('gérant : GET → 200 avec l\'identité du compte parent',
      r.status === 200 && r.body?.clientId === c1.id && memesCles(r.body.identite) && r.body.identite.raisonSociale === 'TEST MonEnt SARL'
      && r.body.identite.adresse === '12 rue de Marseille' && r.body.identiteComplete === true, `${r.status} ${JSON.stringify(r.body?.identite)}`);
    const orphelines = (await pool.query('SELECT COUNT(*)::int AS n FROM profil_entreprise WHERE client_id = $1', [gerantId])).rows[0].n;
    check('gérant : aucune ligne profil_entreprise à son identifiant (0 ligne orpheline)', orphelines === 0, String(orphelines));

    // ── 9. Autres rôles et route supprimée
    r = await appel('PUT', '/api/entreprise/identite', adminTok, { adresse: 'Adresse admin' });
    check('super_admin : PUT /api/entreprise/identite → 403 (il a sa route admin)', r.status === 403 && lisible(r.body?.message), `${r.status} ${r.body?.message || ''}`);
    const adminId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [ADMIN])).rows[0].id;
    const ligneAdmin = (await pool.query('SELECT COUNT(*)::int AS n FROM profil_entreprise WHERE client_id = $1', [adminId])).rows[0].n;
    check('super_admin : aucune ligne profil_entreprise créée à son identifiant', ligneAdmin === 0, String(ligneAdmin));
    r = await appel('PUT', '/api/entreprise/identite', null, { adresse: 'Sans jeton' });
    check('sans jeton : 401', r.status === 401, String(r.status));
    r = await appel('PUT', '/api/entreprise/identite', 'jeton.invalide.xxx', { adresse: 'Faux jeton' });
    check('jeton invalide : 401', r.status === 401, String(r.status));
    avant = await ligne(c1.id);
    r = await appel('PUT', '/api/entreprise', c1.tok, { nom: 'PIRATE', email: 'pirate@example.com', telephone: '99999999', adresse: 'Adresse écrasée' });
    apres = await ligne(c1.id);
    check('ancienne route PUT /api/entreprise → 404, rien n\'est écrit', r.status === 404 && fige(apres) === fige(avant), `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', '/api/entreprise', gerantTok, { adresse: 'Adresse écrasée par le gérant' });
    check('ancienne route PUT /api/entreprise, gérant → 404', r.status === 404 && fige(await ligne(c1.id)) === fige(avant), String(r.status));

    // ── 10. Client dont la ligne profil_entreprise a été supprimée à la main
    c2.tok = await login(c2.email);
    check('login du client 2', !!c2.tok);
    await pool.query('DELETE FROM profil_entreprise WHERE client_id = $1', [c2.id]);
    r = await appel('GET', '/api/entreprise', c2.tok);
    check('client sans ligne profil_entreprise : GET → 200 et null', r.status === 200 && r.body === null, `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('PUT', '/api/entreprise/identite', c2.tok, {});
    check('… corps vide → 200, identité à 9 clés toutes nulles, aucune ligne créée',
      r.status === 200 && memesCles(r.body?.identite) && Object.values(r.body.identite).every((v) => v === null) && r.body.identiteComplete === false && (await ligne(c2.id)) === null,
      `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('PUT', '/api/entreprise/identite', c2.tok, { adresse: '5 avenue Habib Bourguiba', ville: '4000 Sousse' });
    const recreee = await ligne(c2.id);
    check('… PUT adresse + ville → 200 (jamais 500)', r.status === 200 && r.body?.identite?.adresse === '5 avenue Habib Bourguiba' && r.body.identiteComplete === false, `${r.status} ${r.body?.message || ''}`);
    check('… la ligne est recréée avec le nom et l\'email du contact',
      recreee?.nom === c2.nom && recreee.email === c2.email && recreee.adresse === '5 avenue Habib Bourguiba' && recreee.ville === '4000 Sousse', JSON.stringify(recreee));
    r = await appel('GET', '/api/entreprise', c2.tok);
    check('… GET ensuite → la fiche (clientId du client 2, adresse relue)', r.status === 200 && r.body?.clientId === c2.id && r.body.identite?.adresse === '5 avenue Habib Bourguiba', `${r.status}`);
    const nbLignes = (await pool.query('SELECT COUNT(*)::int AS n FROM profil_entreprise WHERE client_id = $1', [c2.id])).rows[0].n;
    check('… une seule ligne pour ce compte', nbLignes === 1, String(nbLignes));

    // ── 11. Compte en lecture seule : écriture refusée par la garde globale, lecture permise
    const maj = await pool.query(`UPDATE abonnements SET mode_compte = 'read_only' WHERE client_id = $1`, [c3.id]);
    check('client 3 : abonnement passé en lecture seule (en base)', maj.rowCount === 1, String(maj.rowCount));
    c3.tok = await login(c3.email);
    check('login du client 3 (lecture seule)', !!c3.tok);
    avant = await ligne(c3.id);
    r = await appel('PUT', '/api/entreprise/identite', c3.tok, { adresse: 'Adresse lecture seule', ville: 'Gabès' });
    apres = await ligne(c3.id);
    check('compte en lecture seule : PUT → 403 code READ_ONLY, rien n\'est écrit',
      r.status === 403 && r.body?.code === 'READ_ONLY' && lisible(r.body.message) && fige(apres) === fige(avant) && apres.adresse === null, `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('GET', '/api/entreprise', c3.tok);
    check('compte en lecture seule : GET → 200 avec identite', r.status === 200 && memesCles(r.body?.identite), String(r.status));
  } finally {
    await wipe();
    const reste = idsCrees.length
      ? (await pool.query('SELECT COUNT(*)::int AS n FROM profil_entreprise WHERE client_id = ANY($1::int[])', [idsCrees.filter(Boolean)])).rows[0].n
      : 0;
    check('nettoyage : aucune ligne profil_entreprise des comptes de test ne reste', reste === 0, String(reste));
    await pool.end();
  }
  const ko = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - ko}/${results.length} contrôles verts`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
