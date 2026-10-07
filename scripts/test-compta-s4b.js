/* Test E2E local — LabFlow Compta, étape S4b « Le dossier du client LabFlow » (labflow-reprise/achats-compta/PLAN-S4.md
 * §1, §4 ; réponses 3 et 4 du client du 07/10).
 *   l'activation du module crée d'office le dossier « Mon entreprise » du client (identité LabFlow copiée, régime
 *   d'après la forme, exercice civil et 12 périodes, journal) ; une réactivation ne le double pas ; un client sans
 *   identité a un dossier « à compléter » ; « Ma comptabilité » le liste (titulaire, tous droits) ; son comptable le voit
 *   selon son niveau ; « Reprendre l'identité de LabFlow » recopie l'identité après une correction dans LabFlow
 *   (journal avant / après) ; refusée pour un dossier saisi ; la migration 209 crée le dossier des comptabilités déjà
 *   ouvertes, sans doublon au 2e passage ; D10.
 * Crée un super_admin, deux clients LabFlow (module Comptabilité) et un comptable temporaires ; règle les tarifs Compta
 * le temps de l'essai, puis restaure et nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
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
  const ADMIN = 'test-admin-compta-s4b@example.com';
  const CLIENT = 'test-client-compta-s4b@example.com';
  const CLIENT2 = 'test-client2-compta-s4b@example.com';
  const COMPTABLE = 'test-comptable-compta-s4b@example.com';
  const TOUS = [ADMIN, CLIENT, CLIENT2, COMPTABLE];
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  let adminTok = null;
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [TOUS])).rows.map((r) => r.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
      await pool.query('DELETE FROM compta.dossiers WHERE espace_id = ANY($1)', [espaces]);
      for (const email of [CLIENT, CLIENT2]) {
        const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [email])).rows[0];
        if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
      }
      await pool.query(`DELETE FROM compta.evenements WHERE auteur_id = ANY($1) OR (details->>'titulaire')::int = ANY($1) OR espace_id = ANY($2)`, [ids, espaces]);
      await pool.query('DELETE FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM support_demandes WHERE client_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [ids]);
    }
  };
  const journal = async (espaceId, type) => (await pool.query('SELECT * FROM compta.evenements WHERE espace_id = $1 AND type = $2 ORDER BY id DESC LIMIT 1', [espaceId, type])).rows[0];
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };
  const annee = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Tunis' }).slice(0, 4);
  const dossiersDe = async (espaceId) => (await pool.query(`SELECT * FROM compta.dossiers WHERE espace_id = $1 ORDER BY id`, [espaceId])).rows;

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S4b', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Client avec une identité LabFlow complète ──
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client S4b', email: CLIENT, telephone: '20 555 101', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    const client = await activer(CLIENT);
    r = await appel('PUT', `/admin/clients/${client.id}/identite`, adminTok, { raisonSociale: 'Pâtisserie Essai S4b', nomCommercial: 'Chez Essai', formeJuridique: 'SARL', matriculeFiscal: '7654321B/A/M/000', adresse: '2 avenue Habib Bourguiba', ville: '3000 Sfax', representantNom: 'Samia Essai', representantQualite: 'Gérante' });
    check('identité LabFlow du client renseignée par l\'admin', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 1 });
    const espace = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [client.id])).rows[0]?.id;
    check('module activé : comptabilité ouverte', r.status === 200 && !!espace, `${r.status} ${r.body?.message || ''}`);
    let d = await dossiersDe(espace);
    check('le dossier « Mon entreprise » existe d\'office : source labflow, identité copiée, nom = nom commercial, client représenté',
      d.length === 1 && d[0].source === 'labflow' && d[0].client_labflow_id === client.id && d[0].nom === 'Chez Essai' && d[0].raison_sociale === 'Pâtisserie Essai S4b'
      && d[0].matricule_fiscal === '7654321B/A/M/000' && d[0].ville === '3000 Sfax' && d[0].representant_qualite === 'Gérante', JSON.stringify(d.map((x) => [x.nom, x.source])));
    check('… régime proposé d\'après la forme (SARL → morale, IS, TVA réel)', d[0]?.personne === 'morale' && d[0]?.impot === 'IS' && d[0]?.tva === 'reel');
    const ex = (await pool.query('SELECT x.*, (SELECT COUNT(*)::int FROM compta.periodes p WHERE p.exercice_id = x.id) AS n FROM compta.exercices x WHERE x.dossier_id = $1', [d[0]?.id])).rows[0];
    check(`… exercice civil ${annee} et 12 périodes`, ex?.debut === `${annee}-01-01` && ex?.fin === `${annee}-12-31` && ex?.n === 12, JSON.stringify(ex));
    const jc = await journal(espace, 'dossier_cree');
    check('journal : dossier_cree marqué labflow', jc?.details?.source === 'labflow' && jc?.details?.client === client.id, JSON.stringify(jc?.details));
    const dossierId = d[0].id;

    // ── Réactivation : pas de doublon ; module fermé : dossier conservé ──
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: false });
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 1 });
    d = await dossiersDe(espace);
    check('désactivation puis réactivation : toujours un seul dossier « Mon entreprise », le même', r.status === 200 && d.length === 1 && d[0].id === dossierId, JSON.stringify(d.map((x) => x.id)));

    // ── « Ma comptabilité » : le client voit son dossier et peut en créer d'autres ──
    r = await appel('GET', '/api/compta/ma-comptabilite', client.tok);
    check('« Ma comptabilité » inchangée (espace, module, comptable à désigner)', r.status === 200 && r.body?.espace?.id === espace && r.body?.comptables?.length >= 1, String(r.status));
    r = await appel('GET', `/api/compta/espaces/${espace}/dossiers`, client.tok);
    check('liste du client : son dossier, tous les droits (titulaire)', r.status === 200 && r.body?.dossiers?.length === 1 && r.body.dossiers[0].source === 'labflow'
      && r.body.dossiers[0].identiteComplete === true && r.body?.droits?.supprimer === true && r.body?.espace?.type === 'client_labflow', JSON.stringify(r.body?.droits));
    r = await appel('GET', `/api/compta/dossiers/${dossierId}`, client.tok);
    check('fiche du dossier : source labflow, identité', r.status === 200 && r.body?.source === 'labflow' && r.body?.identite?.raisonSociale === 'Pâtisserie Essai S4b', String(r.status));
    r = await appel('POST', `/api/compta/espaces/${espace}/dossiers`, client.tok, { identite: { raisonSociale: 'Deuxième entité', formeJuridique: 'EI' }, regime: { personne: 'physique', impot: 'IRPP', tva: 'forfaitaire' }, exercice: { debut: `${annee}-01-01`, fin: `${annee}-12-31` } });
    const deuxieme = r.body;
    check('le client crée un deuxième dossier à la main (source saisi)', r.status === 201 && deuxieme?.source === 'saisi', `${r.status} ${r.body?.message || ''}`);

    // ── Reprise de l'identité LabFlow ──
    // Le client ne modifie lui-même que l'adresse, la ville et le représentant (page « Mon entreprise » de LabFlow) ; le
    // reste de l'identité est du ressort de l'équipe LabFlow.
    r = await appel('PUT', '/api/entreprise/identite', client.tok, { ville: '3018 Sfax', representantNom: 'Samia Essai Ép. Ben Ali' });
    check('le client corrige son identité dans LabFlow (ville, représentant)', r.status === 200 && r.body?.identite?.ville === '3018 Sfax', `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/admin/clients/${client.id}/identite`, adminTok, { rne: 'B9876' });
    check('l\'équipe LabFlow complète le RNE', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', `/api/compta/dossiers/${dossierId}`, client.tok);
    check('… le dossier ne bouge pas tout seul (copie à la création)', r.body?.identite?.ville === '3000 Sfax' && !r.body?.identite?.rne && r.body?.identite?.representantNom === 'Samia Essai', JSON.stringify(r.body?.identite));
    r = await appel('POST', `/api/compta/dossiers/${dossierId}/reprendre-identite`, client.tok);
    check('« Reprendre l\'identité de LabFlow » : 3 champs repris (ville, représentant, RNE)', r.status === 200 && r.body?.reprise === 3 && r.body?.identite?.ville === '3018 Sfax' && r.body?.identite?.rne === 'B9876'
      && r.body?.identite?.representantNom === 'Samia Essai Ép. Ben Ali' && r.body?.nom === 'Chez Essai', `${r.status} ${JSON.stringify({ reprise: r.body?.reprise, identite: r.body?.identite })}`);
    const jm = await journal(espace, 'dossier_modifie');
    check('journal : dossier_modifie, reprise labflow, avant / après', jm?.details?.reprise === 'labflow' && jm?.details?.changements?.ville?.avant === '3000 Sfax' && jm?.details?.changements?.ville?.apres === '3018 Sfax'
      && jm?.details?.changements?.rne?.avant === null && jm?.details?.changements?.rne?.apres === 'B9876' && !jm?.details?.changements?.nom, JSON.stringify(jm?.details));
    r = await appel('POST', `/api/compta/dossiers/${dossierId}/reprendre-identite`, client.tok);
    check('reprendre une 2e fois : rien à changer (reprise 0), aucune nouvelle ligne de journal', r.status === 200 && r.body?.reprise === 0 && (await journal(espace, 'dossier_modifie'))?.id === jm?.id, `${r.status} ${r.body?.reprise}`);
    const modifieLe = r.body?.modifieLe;
    // Un champ vide dans LabFlow n'efface rien : le RNE retiré côté LabFlow reste dans le dossier.
    r = await appel('PUT', `/admin/clients/${client.id}/identite`, adminTok, { rne: '' });
    r = await appel('POST', `/api/compta/dossiers/${dossierId}/reprendre-identite`, client.tok);
    check('RNE vidé dans LabFlow puis reprise : le dossier garde son RNE (reprise 0, date de modification inchangée)', r.status === 200 && r.body?.reprise === 0 && r.body?.identite?.rne === 'B9876' && r.body?.modifieLe === modifieLe, `${r.status} ${JSON.stringify({ reprise: r.body?.reprise, rne: r.body?.identite?.rne })}`);
    r = await appel('DELETE', `/api/compta/dossiers/${dossierId}`, client.tok);
    check('le dossier « Mon entreprise » ne se supprime pas : 409 DOSSIER_LABFLOW', r.status === 409 && r.body?.code === 'DOSSIER_LABFLOW', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 2 });
    check('réglage des gérants par l\'admin (module déjà actif) : toujours un seul dossier « Mon entreprise »', r.status === 200 && (await dossiersDe(espace)).filter((x) => x.source === 'labflow').length === 1, String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${deuxieme.id}/reprendre-identite`, client.tok);
    check('reprise refusée pour un dossier saisi : 409 PAS_LABFLOW', r.status === 409 && r.body?.code === 'PAS_LABFLOW', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${dossierId}/archiver`, client.tok);
    r = await appel('POST', `/api/compta/dossiers/${dossierId}/reprendre-identite`, client.tok);
    check('reprise refusée sur un dossier archivé : 409 DOSSIER_ARCHIVE', r.status === 409 && r.body?.code === 'DOSSIER_ARCHIVE', `${r.status} ${r.body?.code}`);
    await appel('POST', `/api/compta/dossiers/${dossierId}/desarchiver`, client.tok);

    // ── Le comptable du client : selon son niveau (réponse 4 : il voit tous les dossiers) ──
    const accesComptable = (await pool.query('SELECT id FROM compta.acces WHERE obligatoire AND espace_id = $1', [espace])).rows[0]?.id;
    r = await appel('PUT', `/api/compta/mes-comptables/${accesComptable}`, client.tok, { nom: 'Comptable', email: COMPTABLE, niveau: 'saisie' });
    const comptable = await activer(COMPTABLE);
    r = await appel('GET', `/api/compta/espaces/${espace}/dossiers`, comptable.tok);
    check('comptable (Saisie) : voit les 2 dossiers, ne crée pas', r.status === 200 && r.body?.dossiers?.length === 2 && r.body?.droits?.creer === false, JSON.stringify(r.body?.droits));
    r = await appel('POST', `/api/compta/dossiers/${dossierId}/reprendre-identite`, comptable.tok);
    check('comptable (Saisie) : reprise refusée (403)', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', `${r.status} ${r.body?.code}`);
    await appel('PUT', `/api/compta/mes-comptables/${accesComptable}`, client.tok, { niveau: 'complet' });
    r = await appel('POST', `/api/compta/dossiers/${dossierId}/reprendre-identite`, comptable.tok);
    check('comptable (Complet) : reprise permise (200)', r.status === 200 && r.body?.reprise === 0, `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', `/api/compta/confiees/${espace}`, comptable.tok);
    check('page « Comptabilité de … » inchangée', r.status === 200 && r.body?.espace?.id === espace, String(r.status));
    await pool.query('UPDATE abonnements SET mode_compte = $2 WHERE client_id = $1', [client.id, 'read_only']);
    r = await appel('POST', `/api/compta/dossiers/${dossierId}/reprendre-identite`, client.tok);
    check('abonnement en lecture seule : reprise refusée (403 READ_ONLY)', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    await pool.query('UPDATE abonnements SET mode_compte = $2 WHERE client_id = $1', [client.id, 'actif']);

    // ── Client sans identité LabFlow : dossier « à compléter », nom du contact ──
    r = await appel('POST', '/admin/clients', adminTok, { nom: 'Mohamed Sans Fiche', email: CLIENT2, telephone: '20 555 102', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    const client2 = await activer(CLIENT2);
    r = await appel('PUT', `/api/abonnements/client/${client2.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 0 });
    const espace2 = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [client2.id])).rows[0]?.id;
    r = await appel('GET', `/api/compta/espaces/${espace2}/dossiers`, client2.tok);
    check('client sans identité : dossier « Mon entreprise » au nom du contact, identité à compléter', r.status === 200 && r.body?.dossiers?.length === 1
      && r.body.dossiers[0].raisonSociale === 'Mohamed Sans Fiche' && r.body.dossiers[0].identiteComplete === false && r.body.dossiers[0].source === 'labflow', JSON.stringify(r.body?.dossiers));
    r = await appel('POST', `/api/compta/dossiers/${dossierId}/reprendre-identite`, client2.tok);
    check('un autre client sur ce dossier : introuvable (404)', r.status === 404, String(r.status));

    // ── Migration 209 : comptabilité ouverte sans dossier → dossier créé ; 2e passage sans doublon ──
    await pool.query(`DELETE FROM compta.dossiers WHERE espace_id = $1`, [espace2]);
    const sql209 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '209_compta_dossier_client.sql'), 'utf8');
    await pool.query(sql209);
    d = await dossiersDe(espace2);
    const ex2 = d[0] ? (await pool.query('SELECT x.debut, x.fin, (SELECT COUNT(*)::int FROM compta.periodes p WHERE p.exercice_id = x.id) AS n FROM compta.exercices x WHERE x.dossier_id = $1', [d[0].id])).rows[0] : null;
    check('migration 209 : le dossier manquant est créé (source labflow, nom du contact, exercice civil, 12 périodes)', d.length === 1 && d[0].source === 'labflow' && d[0].raison_sociale === 'Mohamed Sans Fiche'
      && d[0].personne === 'morale' && ex2?.debut === `${annee}-01-01` && ex2?.n === 12, JSON.stringify({ d: d.map((x) => x.nom), ex2 }));
    const j209 = await journal(espace2, 'dossier_cree');
    check('… journal de la migration (auteur vide, migration 209)', j209?.auteur_id === null && j209?.details?.migration === 209, JSON.stringify(j209?.details));
    await pool.query(sql209);
    check('… 2e passage : aucun doublon, aucune ligne de journal en plus', (await dossiersDe(espace2)).length === 1 && (await journal(espace2, 'dossier_cree'))?.id === j209?.id);
    const jex = (await pool.query(`SELECT COUNT(*)::int AS n FROM compta.evenements WHERE espace_id = $1 AND type = 'exercice_cree'`, [espace2])).rows[0].n;
    check('… un seul exercice_cree de migration (en plus de celui de l\'activation)', jex === 2, String(jex));
    const fermees = (await pool.query(`SELECT COUNT(*)::int AS n FROM compta.espaces e WHERE e.type = 'client_labflow' AND e.etat = 'actif' AND NOT EXISTS (SELECT 1 FROM compta.dossiers d WHERE d.espace_id = e.id AND d.source = 'labflow')`)).rows[0].n;
    check('plus aucune comptabilité ouverte sans dossier « Mon entreprise » en base locale', fermees === 0, String(fermees));
    const manuel = (await pool.query(`SELECT slug, position('Mes dossiers' in contenu_defaut) > 0 AS a, position('Reprendre l''identité de LabFlow' in contenu_defaut) > 0 AS b FROM manuel_sections WHERE slug IN ('compta-ma-comptabilite', 'compta-dossier', 'compta-confiee') ORDER BY slug`)).rows;
    check('manuel : fiches « Ma comptabilité », « Fiche du dossier » et « Comptabilité confiée » complétées', manuel.length === 3 && manuel[0].slug === 'compta-confiee' && manuel[1].b === true && manuel[2].a === true && manuel[2].b === true, JSON.stringify(manuel));
    let doublon = null;
    try { await pool.query(`INSERT INTO compta.dossiers (espace_id, nom, raison_sociale, personne, impot, tva, source, client_labflow_id) VALUES ($1, 'x', 'x', 'morale', 'IS', 'reel', 'labflow', $2)`, [espace2, client2.id]); } catch (e) { doublon = e.code; }
    check('index d\'unicité : un 2e dossier « Mon entreprise » est refusé par la base (23505)', doublon === '23505', String(doublon));

    // ── D10 ──
    r = await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    check('l\'admin ne supprime pas un client qui a des dossiers : 409', r.status === 409 && r.body?.code === 'DOSSIERS_EN_PLACE', `${r.status} ${r.body?.code}`);
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
