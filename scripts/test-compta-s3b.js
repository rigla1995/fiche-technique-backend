/* Test E2E local — LabFlow Compta, étape S3b « Le comptable du client » (labflow-reprise/achats-compta/PLAN-S3b.md ;
 * SPEC-SOCLE D2, D4, D14, D16).
 *   le client désigne son comptable (adresse inconnue → compte LabFlow Compta + invitation ; adresse connue → accès
 *   ajouté) ; réattribution, retrait (l'accès obligatoire redevient « à attribuer ») ; gérants comptables
 *   supplémentaires dans la limite ; refus (sa propre adresse, équipe LabFlow, doublon) ; renvoi d'invitation ; garde
 *   par comptabilité (lecture seule du titulaire) ; page « Comptabilité de … » et « Quitter » (cloche du client) ;
 *   cabinet bloqué qui se connecte encore ; demande d'ajout validée par l'admin ; limite de l'admin ; journal.
 * Crée un super_admin, un client LabFlow (module Comptabilité activé) et un cabinet comptable temporaires ; règle les
 * tarifs Compta le temps de l'essai, puis restaure et nettoie.
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
const CLES = ['compta_cabinet_mensuel', 'compta_gerant_cabinet_mensuel', 'compta_mise_en_route', 'compta_module_mensuel', 'compta_gerant_client_mensuel'];

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s3b@example.com';
  const CLIENT = 'test-client-compta-s3b@example.com';
  const CABINET = 'test-cabinet-compta-s3b@example.com';
  const NOUVEAU = 'test-nouveau-comptable-s3b@example.com';
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  let adminTok = null;
  const wipe = async () => {
    const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
    if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT, CABINET, NOUVEAU]])).rows.map((r) => r.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
      await pool.query(`DELETE FROM compta.evenements WHERE auteur_id = ANY($1) OR (details->>'titulaire')::int = ANY($1) OR espace_id = ANY($2)`, [ids, espaces]);
      await pool.query('DELETE FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM support_demandes WHERE client_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [ids]);
    }
  };
  const journal = async (espaceId, type) => (await pool.query('SELECT * FROM compta.evenements WHERE espace_id = $1 AND type = $2 ORDER BY id DESC LIMIT 1', [espaceId, type])).rows[0];

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S3b', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un client LabFlow (module, 1 gérant comptable supplémentaire) et un cabinet ──
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client S3b', email: CLIENT, telephone: '20 555 061', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    check('création du client LabFlow', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const clientTok = (await login(CLIENT)).body?.token;
    check('connexion du client', !!clientTok);

    r = await appel('GET', '/api/compta/mes-comptables', clientTok);
    check('sans le module : 404 MODULE_INACTIF (la page Gérants n\'affiche pas la partie Comptabilité)', r.status === 404 && r.body?.code === 'MODULE_INACTIF', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 1 });
    check('module Comptabilité activé, 1 gérant comptable supplémentaire', r.status === 200 && r.body?.actif === true && r.body?.nbGerants === 1, `${r.status} ${r.body?.message || ''}`);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [clientId])).rows[0]?.id;

    r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S3b', email: CABINET, telephone: '20 555 062', raisonSociale: 'Cabinet Essai S3b', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S3b', representantQualite: 'Gérant', nbGerants: 0,
    });
    check('création du cabinet comptable', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const cabinetId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CABINET])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, cabinetId]);
    let cabTok = (await login(CABINET)).body?.token;
    check('connexion du cabinet', !!cabTok);

    // ── Page du titulaire ──
    r = await appel('GET', '/api/compta/mes-comptables', clientTok);
    const obligatoire = r.body?.comptables?.find((c) => c.obligatoire);
    check('le titulaire voit son comptable « à attribuer » et la limite (0 / 1)', r.status === 200 && r.body?.comptables?.length === 1 && obligatoire?.etat === 'a_attribuer'
      && r.body?.supplementaires?.utilises === 0 && r.body?.supplementaires?.limite === 1, JSON.stringify(r.body));
    r = await appel('GET', '/api/compta/mes-comptables', cabTok);
    check('un cabinet n\'a pas de « comptables du client » (404)', r.status === 404, String(r.status));
    r = await appel('GET', '/api/compta/mes-comptables', adminTok);
    check('l\'admin non plus (404)', r.status === 404, String(r.status));

    // ── Adresse inconnue : compte LabFlow Compta + invitation ──
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, clientTok, { nom: 'Nouveau Comptable', email: 'Test-Nouveau-Comptable-S3b@Example.com', niveau: 'saisie' });
    check('désigner une adresse inconnue : 200, nouvelle personne, invitation partie', r.status === 200 && r.body?.nouvelle === true && r.body?.emailEnvoye === true, `${r.status} ${r.body?.message || ''}`);
    const nouveau = (await pool.query('SELECT * FROM utilisateurs WHERE LOWER(email) = $1', [NOUVEAU])).rows[0];
    check('compte créé : rôle comptable, adresse en minuscules, sans mot de passe, invitation 48 h',
      nouveau?.role === 'comptable' && nouveau.email === NOUVEAU && !nouveau.mot_de_passe && !!nouveau.invite_token
      && Math.abs(new Date(nouveau.invite_token_expires_at) - Date.now() - 48 * 3600 * 1000) < 120000, JSON.stringify({ role: nouveau?.role, email: nouveau?.email }));
    let acces = (await pool.query('SELECT * FROM compta.acces WHERE id = $1', [obligatoire.id])).rows[0];
    check('accès obligatoire attribué (personne, niveau saisie, date)', acces.personne_id === nouveau?.id && acces.etat === 'actif' && acces.niveau === 'saisie' && !!acces.attribue_le, JSON.stringify(acces));
    check('journal : acces_attribue', !!(await journal(espaceId, 'acces_attribue')));
    r = await appel('GET', '/api/compta/mes-comptables', clientTok);
    let vu = r.body?.comptables?.find((c) => c.obligatoire);
    check('le titulaire voit « invitation en attente », renvoyable', vu?.invitationEnAttente === true && vu?.invitationRenvoyable === true && vu?.email === NOUVEAU && vu?.nom === 'Nouveau Comptable', JSON.stringify(vu));
    const jetonAvant = nouveau.invite_token;
    const jetonDe = async () => (await pool.query('SELECT invite_token FROM utilisateurs WHERE id = $1', [nouveau.id])).rows[0]?.invite_token;
    r = await appel('POST', `/api/compta/mes-comptables/${obligatoire.id}/inviter`, clientTok);
    check('renvoyer l\'invitation encore valable : même lien (un tiers ne périme pas le lien)', r.status === 200 && (await jetonDe()) === jetonAvant, String(r.status));
    await pool.query(`UPDATE utilisateurs SET invite_token_expires_at = NOW() + interval '1 hour' WHERE id = $1`, [nouveau.id]);
    r = await appel('POST', `/api/compta/mes-comptables/${obligatoire.id}/inviter`, clientTok);
    const jetonApres = await jetonDe();
    check('renvoyer une invitation bientôt périmée : nouveau lien de 48 h', r.status === 200 && jetonApres && jetonApres !== jetonAvant, String(r.status));
    check('journal : invitation_renvoyee', !!(await journal(espaceId, 'invitation_renvoyee')));
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, clientTok, { nom: 'X', email: '<x@evil.tn>' });
    check('adresse avec chevrons : 400', r.status === 400, String(r.status));

    // ── Refus ──
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, clientTok, { nom: 'Moi', email: CLIENT.toUpperCase() });
    check('sa propre adresse : 409 ADRESSE_TITULAIRE', r.status === 409 && r.body?.code === 'ADRESSE_TITULAIRE', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, clientTok, { nom: 'Admin', email: ADMIN });
    check('adresse de l\'équipe LabFlow : 409 ADRESSE_REFUSEE', r.status === 409 && r.body?.code === 'ADRESSE_REFUSEE', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, clientTok, { nom: 'X', email: 'pas-une-adresse' });
    check('adresse invalide : 400', r.status === 400, String(r.status));
    r = await appel('PUT', '/api/compta/mes-comptables/999999999', clientTok, { niveau: 'complet' });
    check('accès d\'une autre comptabilité ou inconnu : 404', r.status === 404, String(r.status));

    // ── Adresse connue (le cabinet) : gérant comptable supplémentaire ──
    r = await appel('POST', '/api/compta/mes-comptables', clientTok, { nom: 'Mon cabinet', email: 'TEST-Cabinet-Compta-S3b@Example.com', niveau: 'complet' });
    check('ajouter un gérant comptable (adresse connue) : 201, sans nouveau compte', r.status === 201 && r.body?.nouvelle === false && r.body?.supplementaires?.utilises === 1, `${r.status} ${r.body?.message || ''}`);
    const supp = r.body?.comptables?.find((c) => !c.obligatoire);
    check('… actif tout de suite, pas d\'invitation', supp?.etat === 'actif' && supp?.invitationEnAttente === false, JSON.stringify(supp));
    r = await appel('POST', '/api/compta/mes-comptables', clientTok, { nom: 'De trop', email: 'test-detrop-s3b@example.com' });
    check('limite atteinte : 409 LIMITE_ATTEINTE, aucun compte créé', r.status === 409 && r.body?.code === 'LIMITE_ATTEINTE'
      && !(await pool.query(`SELECT 1 FROM utilisateurs WHERE email = 'test-detrop-s3b@example.com'`)).rows.length, `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, clientTok, { nom: 'Cabinet', email: CABINET });
    check('une personne a déjà un accès : 409 DEJA_ACCES', r.status === 409 && r.body?.code === 'DEJA_ACCES', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/mes-comptables/${supp.id}`, clientTok, { niveau: 'consultation', nom: 'Cabinet Essai' });
    check('modifier le niveau et le nom : 200', r.status === 200 && r.body?.comptables?.find((c) => c.id === supp.id)?.niveau === 'consultation', `${r.status} ${r.body?.message || ''}`);
    check('journal : acces_modifie', !!(await journal(espaceId, 'acces_modifie')));

    // ── Côté du cabinet : la comptabilité confiée ──
    r = await appel('GET', '/api/compta/acces', cabTok);
    const carte = r.body?.confiees?.[0];
    check('accueil du cabinet : son cabinet ET la comptabilité confiée, bien séparés', r.status === 200 && r.body?.cabinets?.length === 1 && r.body?.confiees?.length === 1
      && carte?.id === espaceId && carte?.lien === `/confiee/${espaceId}` && carte?.etatAbonnement === 'actif', JSON.stringify(r.body));
    r = await appel('GET', `/api/compta/confiees/${espaceId}`, cabTok);
    check('page « Comptabilité de … » : contact du client, niveau, confiée le', r.status === 200 && r.body?.contact?.email === CLIENT && r.body?.acces?.niveau === 'consultation'
      && !!r.body?.acces?.confieeLe && r.body?.etatAbonnement === 'actif' && 'raisonSociale' in (r.body?.identite || {}), JSON.stringify(r.body));
    r = await appel('GET', `/api/compta/confiees/${espaceId}`, adminTok);
    check('sans accès : 404', r.status === 404, String(r.status));

    // ── Garde par comptabilité (D4) ──
    await pool.query(`UPDATE abonnements SET mode_compte = 'read_only' WHERE client_id = $1`, [clientId]);
    r = await appel('PUT', `/api/compta/mes-comptables/${supp.id}`, clientTok, { niveau: 'complet' });
    check('titulaire en lecture seule : modification refusée (403 READ_ONLY)', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    r = await appel('GET', '/api/compta/mes-comptables', clientTok);
    check('… la lecture reste permise', r.status === 200, String(r.status));
    r = await appel('GET', `/api/compta/confiees/${espaceId}`, cabTok);
    check('… le comptable voit la comptabilité « lecture seule »', r.body?.etatAbonnement === 'lecture_seule', r.body?.etatAbonnement);
    await pool.query(`UPDATE abonnements SET mode_compte = 'bloque' WHERE client_id = $1`, [clientId]);
    r = await appel('GET', '/api/compta/acces', cabTok);
    check('client bloqué : sa comptabilité confiée est signalée bloquée', r.body?.confiees?.[0]?.etatAbonnement === 'bloque', JSON.stringify(r.body?.confiees));
    await pool.query(`UPDATE abonnements SET mode_compte = 'actif' WHERE client_id = $1`, [clientId]);

    // ── Cabinet bloqué : il se connecte encore (réponse du client du 06/10) ──
    // Blocage par la vraie route de l'admin (relecture de S3b : elle désactivait aussi la personne).
    r = await appel('PUT', `/api/abonnements/client/${cabinetId}/mode`, adminTok, { mode: 'bloque' });
    check('l\'admin bloque le cabinet (route du mode) : la personne reste active', r.status === 200
      && (await pool.query('SELECT actif FROM utilisateurs WHERE id = $1', [cabinetId])).rows[0]?.actif === true, String(r.status));
    r = await login(CABINET);
    check('cabinet bloqué : connexion permise', r.status === 200 && !!r.body?.token, `${r.status} ${r.body?.message || ''}`);
    cabTok = r.body?.token || cabTok;
    r = await appel('GET', '/api/compta/acces', cabTok);
    check('… sa carte « Mon cabinet » le signale, la comptabilité confiée reste ouverte', r.body?.cabinets?.[0]?.etatAbonnement === 'bloque' && r.body?.confiees?.[0]?.etatAbonnement === 'actif', JSON.stringify(r.body));
    r = await appel('POST', '/api/compta/passage', cabTok, { destination: 'compta' });
    r = await appel('POST', '/auth/passage', null, { code: r.body?.code, produit: 'compta' });
    check('… et le passage aussi', r.status === 200 && !!r.body?.token, `${r.status} ${r.body?.message || ''}`);
    await pool.query(`UPDATE abonnements SET mode_compte = 'bloque' WHERE client_id = $1`, [clientId]);
    r = await login(CLIENT);
    check('un client LabFlow bloqué, lui, ne se connecte toujours pas (403 account_blocked)', r.status === 403 && r.body?.message === 'account_blocked', `${r.status} ${r.body?.message}`);
    await pool.query(`UPDATE abonnements SET mode_compte = 'actif' WHERE client_id = ANY($1)`, [[clientId, cabinetId]]);

    // ── Quitter (le cabinet, en lecture seule chez lui : jamais refusé) ──
    await pool.query(`UPDATE abonnements SET mode_compte = 'read_only' WHERE client_id = $1`, [cabinetId]);
    r = await appel('POST', `/api/compta/confiees/${espaceId}/quitter`, cabTok);
    check('quitter un accès confié : 200, même cabinet en lecture seule', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    await pool.query(`UPDATE abonnements SET mode_compte = 'actif' WHERE client_id = $1`, [cabinetId]);
    check('accès supplémentaire supprimé', !(await pool.query('SELECT 1 FROM compta.acces WHERE id = $1', [supp.id])).rows.length);
    check('journal : acces_quitte', !!(await journal(espaceId, 'acces_quitte')));
    await new Promise((ok) => setTimeout(ok, 300));
    const notif = (await pool.query(`SELECT * FROM notifications WHERE user_id = $1 AND event_type = 'comptable_parti'`, [clientId])).rows[0];
    check('le client est prévenu (cloche)', !!notif && notif.client_nom === 'TEST Cabinet S3b', JSON.stringify(notif));
    r = await appel('GET', `/api/compta/confiees/${espaceId}`, cabTok);
    check('après avoir quitté : 404', r.status === 404, String(r.status));
    r = await appel('POST', `/api/compta/confiees/${espaceId}/quitter`, cabTok);
    check('quitter deux fois : 404', r.status === 404, String(r.status));

    // ── Réattribution, retrait de l'accès obligatoire ──
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, clientTok, { nom: 'Cabinet', email: CABINET, niveau: 'complet' });
    check('réattribuer son comptable au cabinet : 200, l\'ancien perd l\'accès', r.status === 200 && r.body?.nouvelle === false
      && (await pool.query('SELECT personne_id FROM compta.acces WHERE id = $1', [obligatoire.id])).rows[0]?.personne_id === cabinetId, `${r.status} ${r.body?.message || ''}`);
    check('journal : acces_reattribue', !!(await journal(espaceId, 'acces_reattribue')));
    r = await appel('DELETE', `/api/compta/mes-comptables/${obligatoire.id}`, clientTok);
    acces = (await pool.query('SELECT * FROM compta.acces WHERE id = $1', [obligatoire.id])).rows[0];
    check('retirer son comptable : l\'accès redevient « à attribuer », jamais supprimé', r.status === 200 && acces?.personne_id === null && acces?.etat === 'a_attribuer' && acces?.obligatoire === true, JSON.stringify(acces));
    check('journal : acces_retire', !!(await journal(espaceId, 'acces_retire')));
    r = await appel('DELETE', `/api/compta/mes-comptables/${obligatoire.id}`, clientTok);
    check('retirer un accès vide : 409', r.status === 409, String(r.status));
    check('la personne créée pour l\'essai existe toujours (jamais supprimée)', !!(await pool.query('SELECT 1 FROM utilisateurs WHERE id = $1', [nouveau.id])).rows.length);

    // ── Demande d'ajout de gérants comptables ──
    r = await appel('POST', '/api/abonnements/support', clientTok, { type: 'supplement', nbGerantsComptaSupp: 'beaucoup' });
    check('demande : nombre invalide → 400', r.status === 400, String(r.status));
    r = await appel('POST', '/api/abonnements/support', clientTok, { type: 'supplement', nbGerantsComptaSupp: 2 });
    const demandeId = r.body?.id;
    check('demande d\'ajout de 2 gérants comptables : 201', r.status === 201 && r.body?.nbGerantsComptaSupp === 2, `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', '/api/compta/mes-comptables', clientTok);
    check('… « demande en cours » sur la page du titulaire', r.body?.demandeEnCours === true);
    r = await appel('POST', '/api/abonnements/support', clientTok, { type: 'supplement', nbGerantsComptaSupp: 1 });
    check('une 2ᵉ demande de gérants comptables en attente : 409', r.status === 409, `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/abonnements/admin/support/${demandeId}`, adminTok, { statut: 'validée' });
    const nb = (await pool.query('SELECT ac.nb_gerants_compta FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1', [clientId])).rows[0]?.nb_gerants_compta;
    check('validation par l\'admin : limite portée à 3', r.status === 200 && nb === 3, `${r.status} ${r.body?.message || ''} nb=${nb}`);
    check('journal : module_gerants', !!(await journal(espaceId, 'module_gerants')));

    // ── Limite côté admin ──
    for (const email of ['test-g1-s3b@example.com', 'test-g2-s3b@example.com']) {
      r = await appel('POST', '/api/compta/mes-comptables', clientTok, { nom: email, email });
    }
    // Accès supplémentaire vidé par la suppression de sa personne : il se retire (il ne bloque plus la limite).
    await pool.query(`DELETE FROM utilisateurs WHERE email = 'test-g2-s3b@example.com'`);
    const fantome = (await pool.query(`SELECT id FROM compta.acces WHERE espace_id = $1 AND NOT obligatoire AND personne_id IS NULL`, [espaceId])).rows[0];
    r = await appel('DELETE', `/api/compta/mes-comptables/${fantome?.id}`, clientTok);
    check('accès supplémentaire resté vide (personne supprimée) : il se retire', r.status === 200 && r.body?.supplementaires?.utilises === 1, `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', '/api/compta/mes-comptables', clientTok, { nom: 'G2', email: 'test-g2-s3b@example.com' });
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 1 });
    check('l\'admin ne descend pas sous les gérants comptables en place : 409', r.status === 409 && r.body?.code === 'GERANTS_COMPTA_EN_PLACE', `${r.status} ${r.body?.message}`);
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 2 });
    check('… mais jusqu\'à eux : 200', r.status === 200 && r.body?.nbGerants === 2, String(r.status));

    // ── Module désactivé : la comptabilité se ferme, plus rien à gérer ──
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: false });
    r = await appel('GET', '/api/compta/mes-comptables', clientTok);
    check('module désactivé : 404 MODULE_INACTIF', r.status === 404 && r.body?.code === 'MODULE_INACTIF', `${r.status}`);
    await pool.query(`DELETE FROM utilisateurs WHERE email = ANY($1)`, [['test-g1-s3b@example.com', 'test-g2-s3b@example.com']]);
  } catch (e) {
    console.error(e);
    check('exécution sans erreur', false, e.message);
  } finally {
    for (const [cle, valeur] of Object.entries(avant)) await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    await pool.query(`DELETE FROM utilisateurs WHERE email = ANY($1)`, [['test-g1-s3b@example.com', 'test-g2-s3b@example.com', 'test-detrop-s3b@example.com']]).catch(() => {});
    await wipe().catch((e) => console.error('[nettoyage]', e.message));
    await pool.end();
  }
  const ko = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - ko}/${results.length} vérifications passées`);
  process.exit(ko ? 1 : 0);
})();
