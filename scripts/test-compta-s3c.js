/* Test E2E local — LabFlow Compta, étape S3c « Les gérants du cabinet » (labflow-reprise/achats-compta/PLAN-S3c.md ;
 * SPEC-SOCLE D2, D4, D14, D16).
 *   le titulaire du cabinet ouvre des accès à ses collaborateurs dans la limite achetée (adresse inconnue → compte
 *   LabFlow Compta + invitation ; adresse connue → accès ajouté) ; modifier, désactiver (place gardée), réactiver,
 *   retirer, renvoyer l'invitation ; refus ; page « Cabinet » du collaborateur ; garde par comptabilité (désactiver et
 *   retirer toujours permis, y compris pour les comptables d'un client) ; demande de gérants validée par l'admin (cloche
 *   de LabFlow Compta) ; limite de l'admin ; cabinet ouvert sur un compte LabFlow Compta existant, puis supprimé sans
 *   effacer la personne ; journal.
 * Crée un super_admin, un client LabFlow (module Comptabilité) et un cabinet temporaires ; règle les tarifs Compta le
 * temps de l'essai, puis restaure et nettoie.
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
  const ADMIN = 'test-admin-compta-s3c@example.com';
  const CLIENT = 'test-client-compta-s3c@example.com';
  const CABINET = 'test-cabinet-compta-s3c@example.com';
  const COLLAB = 'test-collab-compta-s3c@example.com';
  const AUTRES = ['test-g1-s3c@example.com', 'test-g2-s3c@example.com', 'test-detrop-s3c@example.com', 'test-comptable-client-s3c@example.com'];
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  let adminTok = null;
  const wipe = async () => {
    const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
    if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT, CABINET, COLLAB, ...AUTRES]])).rows.map((r) => r.id);
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
  const mode = (id, m) => pool.query('UPDATE abonnements SET mode_compte = $2 WHERE client_id = $1', [id, m]);

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S3c', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (1 gérant acheté) et un client LabFlow (module) ──
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S3c', email: CABINET, telephone: '20 555 071', raisonSociale: 'Cabinet Essai S3c', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S3c', representantQualite: 'Gérant', nbGerants: 1,
    });
    check('création du cabinet (1 gérant acheté)', r.status === 201 && r.body?.abonnement?.gerantsEnPlace === 0, `${r.status} ${r.body?.message || ''}`);
    const cabinetId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CABINET])).rows[0]?.id;
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinetId])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, cabinetId]);
    const cabTok = (await login(CABINET)).body?.token;
    check('connexion du titulaire', !!cabTok);
    r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client S3c', email: CLIENT, telephone: '20 555 072', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    const clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const clientTok = (await login(CLIENT)).body?.token;
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 0 });
    check('client LabFlow avec le module Comptabilité', !!clientTok && r.status === 200 && r.body?.actif === true, `${r.status} ${r.body?.message || ''}`);

    // ── Page « Mes gérants » : le titulaire seul ──
    r = await appel('GET', '/api/compta/cabinet/gerants', cabTok);
    check('le titulaire voit 0 / 1, le prix d\'un gérant et l\'état de son abonnement', r.status === 200 && r.body?.gerants?.length === 0 && r.body?.places?.utilisees === 0
      && r.body?.places?.limite === 1 && r.body?.prixGerant === 30 && r.body?.etatAbonnement === 'actif' && r.body?.demandeEnCours === false, JSON.stringify(r.body));
    r = await appel('GET', '/api/compta/cabinet/gerants', clientTok);
    check('un client LabFlow : 403', r.status === 403, String(r.status));
    r = await appel('GET', '/api/compta/cabinet/gerants', adminTok);
    check('l\'admin : 403', r.status === 403, String(r.status));

    // ── Adresse inconnue : compte LabFlow Compta + invitation ──
    r = await appel('POST', '/api/compta/cabinet/gerants', cabTok, { nom: 'Collaborateur Essai', email: 'Test-Collab-Compta-S3c@Example.com', niveau: 'saisie' });
    check('ajouter un collaborateur (adresse inconnue) : 201, nouvelle personne, invitation partie', r.status === 201 && r.body?.nouvelle === true && r.body?.emailEnvoye === true
      && r.body?.places?.utilisees === 1, `${r.status} ${r.body?.message || ''}`);
    const collab = (await pool.query('SELECT * FROM utilisateurs WHERE LOWER(email) = $1', [COLLAB])).rows[0];
    check('compte créé : rôle comptable, adresse en minuscules, invitation 48 h', collab?.role === 'comptable' && collab.email === COLLAB && !collab.mot_de_passe
      && Math.abs(new Date(collab.invite_token_expires_at) - Date.now() - 48 * 3600 * 1000) < 120000, JSON.stringify({ role: collab?.role, email: collab?.email }));
    const accesId = r.body?.gerants?.[0]?.id;
    check('… « invitation envoyée », renvoyable, niveau Saisie', r.body?.gerants?.[0]?.invitationRenvoyable === true && r.body?.gerants?.[0]?.niveau === 'saisie', JSON.stringify(r.body?.gerants));
    check('journal : acces_attribue', !!(await journal(espaceId, 'acces_attribue')));
    r = await appel('POST', `/api/compta/cabinet/gerants/${accesId}/inviter`, cabTok);
    check('renvoyer l\'invitation encore valable : même lien', r.status === 200
      && (await pool.query('SELECT invite_token FROM utilisateurs WHERE id = $1', [collab.id])).rows[0]?.invite_token === collab.invite_token, String(r.status));

    // ── Limite et refus ──
    r = await appel('POST', '/api/compta/cabinet/gerants', cabTok, { nom: 'De trop', email: AUTRES[2] });
    check('limite atteinte : 409 LIMITE_ATTEINTE, aucun compte créé', r.status === 409 && r.body?.code === 'LIMITE_ATTEINTE'
      && !(await pool.query('SELECT 1 FROM utilisateurs WHERE email = $1', [AUTRES[2]])).rows.length, `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/cabinet/gerants/${accesId}`, cabTok, { nom: 'Moi', email: CABINET.toUpperCase() });
    check('sa propre adresse : 409 ADRESSE_TITULAIRE', r.status === 409 && r.body?.code === 'ADRESSE_TITULAIRE' && /cabinet/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('PUT', `/api/compta/cabinet/gerants/${accesId}`, cabTok, { nom: 'Admin', email: ADMIN });
    check('adresse de l\'équipe LabFlow : 409 ADRESSE_REFUSEE', r.status === 409 && r.body?.code === 'ADRESSE_REFUSEE', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', '/api/compta/cabinet/gerants/999999999', cabTok, { niveau: 'complet' });
    check('accès inconnu ou d\'un autre espace : 404', r.status === 404, String(r.status));
    const accesClient = (await pool.query(`SELECT id FROM compta.acces WHERE obligatoire AND espace_id = (SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1)`, [clientId])).rows[0]?.id;
    r = await appel('DELETE', `/api/compta/cabinet/gerants/${accesClient}`, cabTok);
    check('l\'accès d\'une autre comptabilité ne se retire pas par le cabinet : 404', r.status === 404, String(r.status));

    // ── Le collaborateur ──
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, collab.id]);
    const collabTok = (await login(COLLAB)).body?.token;
    check('connexion du collaborateur', !!collabTok);
    r = await appel('GET', '/api/compta/acces', collabTok);
    const carte = r.body?.cabinets?.[0];
    check('son accueil : le cabinet dans « Mon cabinet », comme collaborateur, avec son niveau', r.status === 200 && r.body?.cabinets?.length === 1
      && carte?.id === espaceId && carte?.role === 'gerant' && carte?.niveau === 'saisie' && carte?.lien === `/cabinets/${espaceId}`, JSON.stringify(r.body));
    r = await appel('GET', `/api/compta/cabinets/${espaceId}`, collabTok);
    check('page « Cabinet » : titulaire, identité, niveau, membre depuis', r.status === 200 && r.body?.titulaire?.email === CABINET && r.body?.identite?.raisonSociale === 'Cabinet Essai S3c'
      && r.body?.acces?.niveau === 'saisie' && !!r.body?.acces?.membreDepuis && r.body?.etatAbonnement === 'actif', JSON.stringify(r.body));
    r = await appel('GET', `/api/compta/cabinets/${espaceId}`, cabTok);
    check('le titulaire n\'est pas « collaborateur » de son cabinet : 404', r.status === 404, String(r.status));
    r = await appel('GET', '/api/compta/cabinet', collabTok);
    check('le collaborateur n\'a pas « Mon cabinet » du titulaire : 403', r.status === 403, String(r.status));
    r = await appel('GET', '/api/compta/cabinet/gerants', collabTok);
    check('… ni « Mes gérants » : 403', r.status === 403, String(r.status));
    r = await appel('POST', `/api/compta/cabinets/${espaceId}/quitter`, collabTok);
    check('pas de « Quitter » (le titulaire gère son équipe) : 404', r.status === 404, String(r.status));

    // ── Modifier, désactiver, réactiver ──
    r = await appel('PUT', `/api/compta/cabinet/gerants/${accesId}`, cabTok, { niveau: 'consultation', nom: 'Collaborateur' });
    check('modifier le niveau et le nom : 200', r.status === 200 && r.body?.gerants?.[0]?.niveau === 'consultation' && r.body?.gerants?.[0]?.nom === 'Collaborateur', `${r.status} ${r.body?.message || ''}`);
    check('journal : acces_modifie', !!(await journal(espaceId, 'acces_modifie')));
    r = await appel('POST', `/api/compta/cabinet/gerants/${accesId}/desactiver`, cabTok);
    check('désactiver : 200, état « desactive », la place reste comptée (1 / 1)', r.status === 200 && r.body?.gerants?.[0]?.etat === 'desactive' && r.body?.places?.utilisees === 1, JSON.stringify(r.body?.places));
    check('journal : acces_desactive', !!(await journal(espaceId, 'acces_desactive')));
    r = await appel('GET', '/api/compta/acces', collabTok);
    check('désactivé : le cabinet disparaît de son accueil', r.body?.cabinets?.length === 0, JSON.stringify(r.body));
    r = await appel('GET', `/api/compta/cabinets/${espaceId}`, collabTok);
    check('… et sa page : 404', r.status === 404, String(r.status));
    r = await appel('PUT', `/api/compta/cabinet/gerants/${accesId}`, cabTok, { niveau: 'complet' });
    check('modifier un accès désactivé : 409 ACCES_DESACTIVE', r.status === 409 && r.body?.code === 'ACCES_DESACTIVE', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/cabinet/gerants/${accesId}/desactiver`, cabTok);
    check('désactiver deux fois : 409', r.status === 409, String(r.status));

    // ── Garde par comptabilité : lecture seule et blocage du cabinet ──
    await mode(cabinetId, 'read_only');
    r = await appel('POST', `/api/compta/cabinet/gerants/${accesId}/reactiver`, cabTok);
    check('lecture seule : réactiver refusé (403 READ_ONLY)', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    r = await appel('POST', '/api/compta/cabinet/demande-gerants', cabTok, { nombre: 1 });
    check('lecture seule : demande de gérants refusée (403 READ_ONLY)', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    r = await appel('GET', '/api/compta/cabinet/gerants', cabTok);
    check('… la page se lit et le dit', r.status === 200 && r.body?.etatAbonnement === 'lecture_seule', JSON.stringify(r.body?.etatAbonnement));
    r = await appel('POST', '/api/notifications/seen?produit=compta', cabTok);
    check('… la cloche s\'éteint quand même (notifications hors de la garde d\'écriture)', r.status === 200, String(r.status));
    await mode(cabinetId, 'actif');
    r = await appel('POST', `/api/compta/cabinet/gerants/${accesId}/reactiver`, cabTok);
    check('réactiver : 200, tel quel (niveau Consultation)', r.status === 200 && r.body?.gerants?.[0]?.etat === 'actif' && r.body?.gerants?.[0]?.niveau === 'consultation', `${r.status} ${r.body?.message || ''}`);
    check('journal : acces_reactive', !!(await journal(espaceId, 'acces_reactive')));
    r = await appel('GET', '/api/compta/acces', collabTok);
    check('réactivé : le cabinet revient dans son accueil', r.body?.cabinets?.length === 1, JSON.stringify(r.body));
    await mode(cabinetId, 'read_only');
    r = await appel('POST', `/api/compta/cabinet/gerants/${accesId}/desactiver`, cabTok);
    check('lecture seule : désactiver reste permis', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    await mode(cabinetId, 'bloque');
    r = await appel('DELETE', `/api/compta/cabinet/gerants/${accesId}`, cabTok);
    check('cabinet bloqué : retirer reste permis, la place est libérée (0 / 1)', r.status === 200 && r.body?.places?.utilisees === 0, `${r.status} ${r.body?.message || ''}`);
    check('journal : acces_retire', !!(await journal(espaceId, 'acces_retire')));
    check('la personne retirée existe toujours (jamais supprimée)', !!(await pool.query('SELECT 1 FROM utilisateurs WHERE id = $1', [collab.id])).rows.length);
    await mode(cabinetId, 'actif');

    // ── Comptable d'un client : le retrait aussi est permis en lecture seule (réponse du 07/10) ──
    r = await appel('PUT', `/api/compta/mes-comptables/${accesClient}`, clientTok, { nom: 'Comptable', email: AUTRES[3] });
    check('le client désigne son comptable', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    await mode(clientId, 'read_only');
    r = await appel('PUT', `/api/compta/mes-comptables/${accesClient}`, clientTok, { niveau: 'saisie' });
    check('client en lecture seule : modifier reste refusé (403)', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    r = await appel('DELETE', `/api/compta/mes-comptables/${accesClient}`, clientTok);
    check('… mais retirer son comptable est permis (200)', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    await mode(clientId, 'actif');

    // ── Adresse connue : accès ajouté tout de suite ──
    r = await appel('POST', '/api/compta/cabinet/gerants', cabTok, { nom: 'Collaborateur', email: COLLAB, niveau: 'complet' });
    check('adresse connue : 201, sans nouveau compte, active tout de suite', r.status === 201 && r.body?.nouvelle === false && r.body?.gerants?.[0]?.etat === 'actif'
      && r.body?.gerants?.[0]?.invitationEnAttente === false, `${r.status} ${r.body?.message || ''}`);
    const accesId2 = r.body?.gerants?.[0]?.id;
    r = await appel('PUT', `/api/compta/cabinet/gerants/${accesId2}`, cabTok, { nom: 'X', email: COLLAB.toUpperCase(), niveau: 'complet' });
    check('même adresse en majuscules : simple modification (200, sans réattribution)', r.status === 200 && r.body?.nouvelle === undefined, `${r.status} ${r.body?.message || ''}`);

    // ── Demande de gérants ──
    r = await appel('POST', '/api/compta/cabinet/demande-gerants', cabTok, { nombre: 'beaucoup' });
    check('demande : nombre invalide → 400', r.status === 400, String(r.status));
    r = await appel('POST', '/api/compta/cabinet/demande-gerants', cabTok, { nombre: 2 });
    check('demande de 2 gérants : 201, « demande en cours »', r.status === 201 && r.body?.demandeEnCours === true, `${r.status} ${r.body?.message || ''}`);
    check('journal : demande_gerants', !!(await journal(espaceId, 'demande_gerants')));
    r = await appel('POST', '/api/compta/cabinet/demande-gerants', cabTok, { nombre: 1 });
    check('une 2ᵉ demande en attente : 409', r.status === 409 && r.body?.code === 'DEMANDE_EN_COURS', `${r.status} ${r.body?.code}`);
    r = await appel('POST', '/api/abonnements/support', cabTok, { type: 'supplement', nbGerantsComptaSupp: 1 });
    check('la route des demandes de LabFlow reste fermée au rôle comptable (403)', r.status === 403, String(r.status));
    r = await appel('GET', '/api/abonnements/admin/support', adminTok);
    const demande = (r.body || []).find((d) => d.clientId === cabinetId && d.statut === 'en_attente');
    check('l\'admin la voit, avec le nom du cabinet', !!demande && demande.nbGerantsComptaSupp === 2 && demande.cabinetNom === 'Cabinet Essai S3c', JSON.stringify(demande));
    const notifAdmin = (await pool.query(`SELECT 1 FROM notifications n JOIN utilisateurs u ON u.id = n.user_id WHERE u.email = $1 AND n.event_type = 'new_demande'`, [ADMIN])).rows.length;
    check('… et sa cloche le signale', notifAdmin > 0);
    r = await appel('PUT', `/api/abonnements/admin/support/${demande?.id}`, adminTok, { statut: 'validée' });
    const nb = (await pool.query(`SELECT ac.nb_gerants_compta FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1 AND a.produit = 'compta'`, [cabinetId])).rows[0]?.nb_gerants_compta;
    check('validation par l\'admin : gérants achetés portés à 3', r.status === 200 && nb === 3, `${r.status} ${r.body?.message || ''} nb=${nb}`);
    check('journal : gerants_modifies', !!(await journal(espaceId, 'gerants_modifies')));
    const attente = (await pool.query(`SELECT montant_dt FROM paiements p JOIN abonnements a ON a.id = p.abonnement_id WHERE a.client_id = $1 ORDER BY mois DESC LIMIT 1`, [cabinetId])).rows[0];
    check('la mensualité du mois en cours garde son montant (nouveau prix au mois suivant)', Number(attente?.montant_dt) === 150, JSON.stringify(attente));
    await new Promise((ok) => setTimeout(ok, 300));
    r = await appel('GET', '/api/notifications?produit=compta', cabTok);
    check('cloche de LabFlow Compta du titulaire : demande validée', r.status === 200 && (r.body || []).some((n) => n.eventType === 'demande_traitee' && n.statut === 'validée'), JSON.stringify(r.body));
    r = await appel('GET', '/api/compta/cabinet/gerants', cabTok);
    check('« Mes gérants » : 1 / 3, plus de demande en cours', r.body?.places?.utilisees === 1 && r.body?.places?.limite === 3 && r.body?.demandeEnCours === false, JSON.stringify(r.body?.places));

    // ── Cloche d'un client LabFlow dans LabFlow Compta : seulement les notifications Compta (aucune pour l'instant) ──
    await pool.query(`INSERT INTO notifications (user_id, event_type, type, statut) VALUES ($1, 'demande_traitee', 'supplement', 'validée')`, [clientId]);
    r = await appel('GET', '/api/notifications?produit=compta', clientTok);
    check('client : la cloche Compta n\'affiche pas les notifications de LabFlow', r.status === 200 && Array.isArray(r.body) && r.body.length === 0, JSON.stringify(r.body));
    r = await appel('POST', '/api/notifications/seen?produit=compta', clientTok);
    r = await appel('GET', '/api/notifications', clientTok);
    check('… et l\'ouvrir n\'efface pas celles de LabFlow', r.status === 200 && r.body?.length === 1, JSON.stringify(r.body));

    // ── Limite côté admin ──
    for (const email of [AUTRES[0], AUTRES[1]]) await appel('POST', '/api/compta/cabinet/gerants', cabTok, { nom: email, email });
    await appel('POST', `/api/compta/cabinet/gerants/${accesId2}/desactiver`, cabTok);
    r = await appel('PUT', `/admin/comptables/${cabinetId}/gerants`, adminTok, { nbGerants: 2 });
    check('l\'admin ne descend pas sous les gérants en place, désactivés compris : 409', r.status === 409 && r.body?.code === 'GERANTS_EN_PLACE', `${r.status} ${r.body?.message}`);
    r = await appel('PUT', `/admin/comptables/${cabinetId}/gerants`, adminTok, { nbGerants: 3 });
    check('… mais jusqu\'à eux : 200, 3 en place', r.status === 200 && r.body?.abonnement?.gerantsEnPlace === 3, `${r.status} ${r.body?.message || ''}`);

    // ── Accès désactivé resté sans personne (compte supprimé) : il se désigne de nouveau (relecture de S3c) ──
    const g1 = (await pool.query('SELECT a.id FROM compta.acces a JOIN utilisateurs u ON u.id = a.personne_id WHERE a.espace_id = $1 AND u.email = $2', [espaceId, AUTRES[0]])).rows[0]?.id;
    await appel('POST', `/api/compta/cabinet/gerants/${g1}/desactiver`, cabTok);
    await pool.query('DELETE FROM utilisateurs WHERE email = $1', [AUTRES[0]]);
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g1}`, cabTok, { nom: 'Gérant Un', email: AUTRES[0], niveau: 'saisie' });
    check('accès désactivé sans personne : se désigne de nouveau, actif', r.status === 200 && r.body?.gerants?.find((g) => g.id === g1)?.etat === 'actif', `${r.status} ${r.body?.message || ''}`);

    // ── Cabinet ouvert sur un compte LabFlow Compta existant (réponse du 07/10) ──
    r = await appel('GET', `/admin/comptables/adresse?email=${encodeURIComponent(COLLAB.toUpperCase())}`, adminTok);
    check('adresse d\'un compte LabFlow Compta sans cabinet : « rattachable »', r.status === 200 && r.body?.etat === 'rattachable' && r.body?.active === true, JSON.stringify(r.body));
    r = await appel('GET', `/admin/comptables/adresse?email=${encodeURIComponent(CLIENT)}`, adminTok);
    check('adresse d\'un client LabFlow : « prise »', r.body?.etat === 'prise', JSON.stringify(r.body));
    r = await appel('GET', `/admin/comptables/adresse?email=${encodeURIComponent(CABINET)}`, adminTok);
    check('adresse d\'un cabinet : « prise »', r.body?.etat === 'prise', JSON.stringify(r.body));
    r = await appel('GET', '/admin/comptables/adresse?email=test-libre-s3c%40example.com', adminTok);
    check('adresse inconnue : « libre »', r.body?.etat === 'libre', JSON.stringify(r.body));
    r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'Collaborateur Titulaire', email: COLLAB, telephone: '20 555 073', raisonSociale: 'Cabinet Rattache S3c', formeJuridique: 'SARL',
      adresse: '2 rue de Rome', ville: 'Tunis', representantNom: 'Collaborateur', representantQualite: 'Gérant', nbGerants: 0,
    });
    check('cabinet ouvert sur ce compte : 201, même personne', r.status === 201 && r.body?.id === collab.id, `${r.status} ${r.body?.message || ''}`);
    const apres = (await pool.query('SELECT mot_de_passe, invite_token, telephone FROM utilisateurs WHERE id = $1', [collab.id])).rows[0];
    check('… mot de passe gardé, aucune nouvelle invitation, téléphone enregistré', !!apres?.mot_de_passe && !apres?.invite_token && apres?.telephone === '20 555 073', JSON.stringify({ invite: apres?.invite_token, tel: apres?.telephone }));
    r = await login(COLLAB);
    const collabTok2 = r.body?.token;
    r = await appel('GET', '/api/compta/acces', collabTok2);
    const roles = (r.body?.cabinets || []).map((c) => c.role).sort();
    check('il voit son cabinet (titulaire) et garde son accès de collaborateur (désactivé : absent)', r.status === 200 && roles.join() === 'titulaire', JSON.stringify(r.body));
    await appel('POST', `/api/compta/cabinet/gerants/${accesId2}/reactiver`, cabTok);
    r = await appel('GET', '/api/compta/acces', collabTok2);
    check('réactivé chez l\'autre cabinet : ses deux cartes « Mon cabinet »', (r.body?.cabinets || []).map((c) => c.role).sort().join() === 'gerant,titulaire', JSON.stringify(r.body?.cabinets));
    r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'Encore', email: COLLAB, telephone: '20 555 074', raisonSociale: 'Doublon S3c', formeJuridique: 'SARL',
      adresse: '3 rue de Rome', ville: 'Tunis', representantNom: 'Encore', representantQualite: 'Gérant', nbGerants: 0,
    });
    check('un 2ᵉ cabinet sur la même adresse : 409', r.status === 409, `${r.status} ${r.body?.message || ''}`);
    r = await appel('DELETE', `/admin/comptables/${collab.id}`, adminTok);
    const reste = (await pool.query(`SELECT (SELECT COUNT(*) FROM abonnements WHERE client_id = $1)::int AS abos, (SELECT COUNT(*) FROM profil_entreprise WHERE client_id = $1)::int AS fiches,
                                            (SELECT COUNT(*) FROM utilisateurs WHERE id = $1)::int AS personne`, [collab.id])).rows[0];
    check('supprimer ce cabinet : la personne reste (elle a un autre accès), son abonnement et sa fiche partent', r.status === 204 && reste.personne === 1 && reste.abos === 0 && reste.fiches === 0, JSON.stringify(reste));
    r = await appel('GET', '/api/compta/acces', collabTok2);
    check('… elle garde son accès de collaborateur', (r.body?.cabinets || []).map((c) => c.role).join() === 'gerant', JSON.stringify(r.body?.cabinets));

    // ── Cabinet bloqué : la page du collaborateur le dit ──
    await mode(cabinetId, 'bloque');
    r = await appel('GET', `/api/compta/cabinets/${espaceId}`, collabTok2);
    check('cabinet bloqué : la page du collaborateur le signale', r.status === 200 && r.body?.etatAbonnement === 'bloque', JSON.stringify(r.body?.etatAbonnement));
    await mode(cabinetId, 'actif');
  } catch (e) {
    console.error(e);
    check('exécution sans erreur', false, e.message);
  } finally {
    for (const [cle, valeur] of Object.entries(avant)) await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    await wipe().catch((e) => console.error('[nettoyage]', e.message));
    await pool.end();
  }
  const ko = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - ko}/${results.length} vérifications passées`);
  process.exit(ko ? 1 : 0);
})();
