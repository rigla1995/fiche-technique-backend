/* Test E2E local — LabFlow Compta, étape S5a « Le paquet Tunisie et le plan de comptes » (labflow-reprise/achats-compta/
 * PLAN-S5.md ; réponses du client du 07/10 : dossiers initialisés avec le paquet, comptes de 2 à 8 chiffres, Complet
 * configure, Saisie et Consultation lisent).
 *   un dossier neuf (assistant) et le dossier « Mon entreprise » d'un client naissent avec les 604 comptes de la NC 01 ;
 *   l'arbre (parents, feuilles, natures, paquet) selon l'accès (collaborateurs, personne étrangère : introuvable) ;
 *   subdiviser (numéro, vrai parent, unicité, nature héritée, explication, rattachement des sous-comptes existants) ;
 *   renommer et rétablir ; nature et explication d'un compte ajouté seulement ; désactiver du bas vers le haut, réactiver
 *   sous un parent actif ; supprimer un compte ajouté sans sous-compte, jamais un compte de la norme ; droits par niveau ;
 *   dossier archivé ; garde par comptabilité (lecture seule) ; export Excel ; journal ; suppression du dossier (cascade).
 * Depuis S5b, un dossier neuf porte aussi les 3 sous-comptes proposés par les codes de taxe (4375, 4376, 43665, origine
 * « ajout ») et le journal BQ porte 5321 (déplacé sur 5324 le temps de le désactiver) : comptes rendus adaptés.
 * Crée un super_admin, un cabinet (2 gérants achetés), deux collaborateurs et un client LabFlow (module Comptabilité)
 * temporaires ; règle les tarifs Compta le temps de l'essai, puis restaure et nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
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
const NB_PAQUET = 604;
// S5b : sous-comptes proposés, créés dans le plan de tout dossier neuf (origine « ajout », expliqués).
const PROPOSES = ['4375', '4376', '43665'];
const NB_PLAN = NB_PAQUET + PROPOSES.length;

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s5a@example.com';
  const CLIENT = 'test-client-compta-s5a@example.com';
  const CABINET = 'test-cabinet-compta-s5a@example.com';
  const SAISIE = 'test-saisie-compta-s5a@example.com';
  const COMPLET = 'test-complet-compta-s5a@example.com';
  const TOUS = [ADMIN, CLIENT, CABINET, SAISIE, COMPLET];
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  let adminTok = null;
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [TOUS])).rows.map((r) => r.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
      // D10 : les dossiers retiennent leur comptabilité (RESTRICT) — l'essai efface les siens d'abord (leur plan suit, CASCADE).
      await pool.query('DELETE FROM compta.dossiers WHERE espace_id = ANY($1)', [espaces]);
      const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
      if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
      await pool.query(`DELETE FROM compta.evenements WHERE auteur_id = ANY($1) OR (details->>'titulaire')::int = ANY($1) OR espace_id = ANY($2)`, [ids, espaces]);
      await pool.query('DELETE FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM support_demandes WHERE client_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [ids]);
    }
  };
  const journal = async (espaceId, type) => (await pool.query('SELECT * FROM compta.evenements WHERE espace_id = $1 AND type = $2 ORDER BY id DESC LIMIT 1', [espaceId, type])).rows[0];
  const nbJournal = async (espaceId, type) => (await pool.query('SELECT COUNT(*)::int AS n FROM compta.evenements WHERE espace_id = $1 AND type = $2', [espaceId, type])).rows[0].n;
  const mode = (id, m) => pool.query('UPDATE abonnements SET mode_compte = $2 WHERE client_id = $1', [id, m]);
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };
  const IDENTITE_A = { raisonSociale: 'Hôtel Essai S5a', formeJuridique: 'SARL', matriculeFiscal: '1234567A/A/M/000', adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' };
  const REGIME = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const CIVIL = { debut: '2026-01-01', fin: '2026-12-31' };
  const compte = (plan, numero) => plan?.comptes?.find((c) => c.numero === numero);

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S5a', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (2 gérants achetés) avec deux collaborateurs, un client LabFlow (module) ──
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S5a', email: CABINET, telephone: '20 555 081', raisonSociale: 'Cabinet Essai S5a', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S5a', representantQualite: 'Gérant', nbGerants: 2,
    });
    check('création du cabinet (2 gérants achetés)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const cabinet = await activer(CABINET);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    check('connexion du titulaire', !!cabinet.tok && !!espaceId);
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Saisie', email: SAISIE, niveau: 'saisie', dossiers: 'tous' });
    check('collaborateur de niveau Saisie', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Complet', email: COMPLET, niveau: 'complet', dossiers: 'tous' });
    check('collaborateur de niveau Complet', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const saisie = await activer(SAISIE);
    const complet = await activer(COMPLET);
    check('connexion des collaborateurs', !!saisie.tok && !!complet.tok);
    r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client S5a', email: CLIENT, telephone: '20 555 082', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    const client = await activer(CLIENT);
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 0 });
    const espaceClient = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [client.id])).rows[0]?.id;
    check('client LabFlow avec le module Comptabilité', !!client.tok && r.status === 200 && !!espaceClient, `${r.status} ${r.body?.message || ''}`);

    // ── Le paquet et la naissance du plan ──
    const paquet = (await pool.query(`SELECT id, pays, version FROM compta.ref_paquets WHERE pays = 'TN' ORDER BY id DESC LIMIT 1`)).rows[0];
    const nbRef = paquet ? (await pool.query('SELECT COUNT(*)::int AS n FROM compta.ref_plans WHERE paquet_id = $1', [paquet.id])).rows[0].n : 0;
    check(`paquet Tunisie en base : TN 2026.1, ${NB_PAQUET} comptes`, paquet?.version === '2026.1' && nbRef === NB_PAQUET, `${paquet?.version} ${nbRef}`);
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REGIME, exercice: CIVIL });
    const A = r.body;
    check(`dossier A créé : la fiche résume le plan (${NB_PLAN} comptes actifs, 3 ajoutés — les sous-comptes proposés de S5b —, paquet TN 2026.1)`, r.status === 201 && A?.plan?.nbActifs === NB_PLAN && A?.plan?.nbAjoutes === 3 && A?.plan?.nbDesactives === 0
      && A?.plan?.paquet?.pays === 'TN' && A?.plan?.paquet?.version === '2026.1' && A?.droits?.configurer === true, `${r.status} ${JSON.stringify(A?.plan)}`);
    let j = await journal(espaceId, 'plan_initialise');
    check('journal : plan_initialise (dossier, paquet, nombre de comptes)', !!j && j.details?.dossier === A?.id && j.details?.paquet === 'TN 2026.1' && j.details?.comptes === NB_PAQUET, JSON.stringify(j?.details));
    const integ = (await pool.query(
      `SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE parent_id IS NULL AND LENGTH(numero) > 2)::int AS orphelins,
              COUNT(*) FILTER (WHERE (origine <> 'paquet' OR NOT actif OR libelle_paquet IS DISTINCT FROM libelle) AND NOT (numero = ANY($2)))::int AS anormaux
         FROM compta.comptes WHERE dossier_id = $1`, [A?.id, PROPOSES])).rows[0];
    check('base : tous les comptes copiés (plus les 3 sous-comptes proposés de S5b), chaque compte de plus de 2 chiffres a son parent', integ.n === NB_PLAN && integ.orphelins === 0 && integ.anormaux === 0, JSON.stringify(integ));
    const idPaquetDossier = (await pool.query('SELECT paquet_id FROM compta.dossiers WHERE id = $1', [A?.id])).rows[0]?.paquet_id;
    check('le dossier garde la version du paquet qui l\'a initialisé', idPaquetDossier === paquet?.id);

    // Le dossier « Mon entreprise » du client (créé à l'activation du module) a aussi son plan.
    const dossierClient = (await pool.query(`SELECT id FROM compta.dossiers WHERE espace_id = $1 AND source = 'labflow'`, [espaceClient])).rows[0];
    r = await appel('GET', `/api/compta/dossiers/${dossierClient?.id}/plan`, client.tok);
    check(`« Mon entreprise » du client : plan de ${NB_PLAN} comptes, le client configure (titulaire)`, r.status === 200 && r.body?.comptes?.length === NB_PLAN && r.body?.droits?.configurer === true && r.body?.dossier?.source === 'labflow', `${r.status} ${r.body?.comptes?.length}`);

    // ── L'arbre, selon l'accès ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok);
    let plan = r.body;
    check('titulaire : l\'arbre complet (dossier, droits, paquet, natures, bornes 2-8, comptes rendus)', r.status === 200 && plan?.comptes?.length === NB_PLAN && plan?.nb?.total === NB_PLAN && plan?.nb?.actifs === NB_PLAN && plan?.nb?.ajoutes === 3
      && plan?.paquet?.version === '2026.1' && plan?.natures?.length === 17 && plan?.numero?.min === 2 && plan?.numero?.max === 8 && plan?.dossier?.id === A.id && plan?.dossier?.espace?.role === 'titulaire' && plan?.etatAbonnement === 'actif', `${r.status} ${JSON.stringify(plan?.nb)}`);
    const c532 = compte(plan, '532');
    const c5321 = compte(plan, '5321');
    check('… parents par numéro : 5321 sous 532, 10 à la racine ; feuilles : 5321 oui, 532 non', c5321?.parentId === c532?.id && compte(plan, '10')?.parentId === null && c5321?.feuille === true && c532?.feuille === false && c532?.nbEnfants === 2 && c532?.nbEnfantsActifs === 2, JSON.stringify({ c532, c5321 }));
    check('… natures : 4011 fournisseurs, 4111 clients, 43666 TVA déductible, 43671 TVA collectée, 432 retenues opérées, 5411 caisse',
      compte(plan, '4011')?.nature === 'fournisseurs' && compte(plan, '4111')?.nature === 'clients' && compte(plan, '43666')?.nature === 'tva_deductible' && compte(plan, '43671')?.nature === 'tva_collectee' && compte(plan, '432')?.nature === 'retenues_operees' && compte(plan, '5411')?.nature === 'caisse');
    check('… libellés de la norme : 704 Travaux, 6031 (note [3]), 534 C.C.P., origine paquet, aucun renommé',
      compte(plan, '704')?.libelle === 'Travaux' && compte(plan, '6031')?.libelle === 'Variation des stocks de matières premières et fournitures' && compte(plan, '534')?.libelle === 'C.C.P.' && plan.comptes.every((c) => c.actif && (c.origine === 'ajout' ? PROPOSES.includes(c.numero) : c.origine === 'paquet' && !c.renomme && c.libellePaquet === c.libelle)));
    check('… note du 281 transmise', compte(plan, '281')?.note === 'même ventilation que celle du compte 21');
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, saisie.tok);
    check('collaborateur Saisie : lit l\'arbre, ne configure pas', r.status === 200 && r.body?.droits?.configurer === false && r.body?.comptes?.length === NB_PLAN, String(r.status));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, client.tok);
    check('un client étranger au cabinet : 404', r.status === 404, String(r.status));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, adminTok);
    check('l\'admin (sans accès) : 404', r.status === 404, String(r.status));
    r = await appel('GET', '/api/compta/dossiers/999999999/plan', cabinet.tok);
    check('dossier inconnu : 404', r.status === 404, String(r.status));
    r = await appel('GET', '/api/compta/dossiers/abc/plan', cabinet.tok);
    check('identifiant mal formé : 404, jamais 500', r.status === 404, String(r.status));

    // ── Subdiviser (collaborateur Complet) ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, complet.tok, { parentId: c5321.id, numero: '53211', libelle: 'BIAT — compte courant', explication: 'Compte bancaire principal' });
    plan = r.body;
    let c53211 = compte(plan, '53211');
    check('Complet subdivise 5321 en 53211 (201) : ajout, nature banque héritée, explication, parent 5321', r.status === 201 && c53211?.origine === 'ajout' && c53211?.nature === 'banque' && c53211?.explication === 'Compte bancaire principal' && c53211?.parentId === c5321.id && c53211?.classe === 5 && c53211?.feuille === true && c53211?.libellePaquet === null, `${r.status} ${JSON.stringify(r.body?.message || c53211)}`);
    check('… 5321 n\'est plus une feuille ; comptes rendus : 4 ajoutés (dont les 3 proposés)', compte(plan, '5321')?.feuille === false && compte(plan, '5321')?.nbEnfantsActifs === 1 && plan?.nb?.ajoutes === 4 && plan?.nb?.total === NB_PLAN + 1, JSON.stringify(plan?.nb));
    j = await journal(espaceId, 'compte_ajoute');
    check('journal : compte_ajoute (numéro, libellé, parent, nature, explication)', !!j && j.details?.numero === '53211' && j.details?.parent === '5321' && j.details?.nature === 'banque' && j.details?.explication === 'Compte bancaire principal' && j.auteur_id === complet.id, JSON.stringify(j?.details));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c5321.id, numero: '53212', libelle: 'Amen Bank', nature: 'caisse' });
    check('nature choisie (caisse) au lieu de l\'héritée', r.status === 201 && compte(r.body, '53212')?.nature === 'caisse', `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c5321.id, numero: '53211', libelle: 'Doublon' });
    check('numéro déjà pris : 409 NUMERO_EXISTANT', r.status === 409 && r.body?.code === 'NUMERO_EXISTANT', `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c5321.id, numero: '5322', libelle: 'Ailleurs' });
    check('numéro qui ne prolonge pas le parent : 400', r.status === 400 && /commencer par 5321/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c532.id, numero: '53213', libelle: 'Trop loin' });
    check('numéro qui dépend d\'un compte plus précis (5321) : 400', r.status === 400 && /dépend du compte 5321/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    for (const [numero, quoi] of [['5', '1 chiffre'], ['532111111', '9 chiffres'], ['5321a', 'lettre'], ['', 'vide']]) {
      r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c5321.id, numero, libelle: 'x' });
      check(`numéro ${quoi} : 400`, r.status === 400, `${r.status} ${r.body?.message}`);
    }
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c5321.id, numero: '53213', libelle: '' });
    check('libellé vide : 400', r.status === 400, `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c5321.id, numero: '53213', libelle: 'بنك' });
    check('libellé non latin : 400 (ne s\'imprime pas sur les états)', r.status === 400 && /latins/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c5321.id, numero: '53213', libelle: 'x', nature: 'inconnue' });
    check('nature inconnue : 400', r.status === 400, `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: 999999999, numero: '53213', libelle: 'x' });
    check('parent inconnu : 404', r.status === 404, String(r.status));
    // Cloisonnement par identifiant de compte (relecture) : les comptes du dossier du client, rejoués sur le dossier A du
    // cabinet, sont « introuvables » sur les cinq routes d'écriture, et le plan du client reste intact.
    r = await appel('GET', `/api/compta/dossiers/${dossierClient?.id}/plan`, client.tok);
    const planClient = r.body;
    const c55Client = compte(planClient, '55');
    const c5321Client = compte(planClient, '5321');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c55Client?.id, numero: '5518', libelle: 'x' });
    check('parent d\'un autre dossier (le 55 du client) : 404', r.status === 404, `${r.status} ${r.body?.message}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321Client?.id}`, cabinet.tok, { libelle: 'x' });
    check('modifier un compte d\'un autre dossier : 404', r.status === 404, String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321Client?.id}/desactiver`, cabinet.tok);
    check('désactiver un compte d\'un autre dossier : 404', r.status === 404, String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321Client?.id}/reactiver`, cabinet.tok);
    check('réactiver un compte d\'un autre dossier : 404', r.status === 404, String(r.status));
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321Client?.id}`, cabinet.tok);
    check('supprimer un compte d\'un autre dossier : 404', r.status === 404, String(r.status));
    r = await appel('GET', `/api/compta/dossiers/${dossierClient?.id}/plan`, client.tok);
    check('… le plan du client est intact', r.status === 200 && compte(r.body, '5321')?.actif === true && compte(r.body, '5321')?.libelle === 'Comptes en dinars' && !compte(r.body, '5518'), String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, saisie.tok, { parentId: c5321.id, numero: '53213', libelle: 'x' });
    check('collaborateur Saisie : 403 NIVEAU_INSUFFISANT', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, client.tok, { parentId: c5321.id, numero: '53213', libelle: 'x' });
    check('personne étrangère : 404', r.status === 404, String(r.status));
    // Rattachement : un compte ajouté « en dessous » d'un numéro intermédiaire créé ensuite passe sous lui.
    const c55 = compte(plan, '55');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c55.id, numero: '5519', libelle: 'Régie de la cuisine' });
    check('5519 ajouté sous 55 (régies, sans sous-compte dans la norme)', r.status === 201 && compte(r.body, '5519')?.parentId === c55.id, `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c55.id, numero: '551', libelle: 'Régies d\'avances' });
    plan = r.body;
    const c551 = compte(plan, '551');
    check('551 ajouté ensuite : 5519 passe sous 551 (son vrai parent)', r.status === 201 && c551 && compte(plan, '5519')?.parentId === c551.id && c551.nbEnfants === 1, `${r.status} ${JSON.stringify(compte(plan, '5519'))}`);

    // ── Renommer, rétablir, modifier un ajout ──
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321.id}`, cabinet.tok, { libelle: 'Comptes en dinars (banques tunisiennes)' });
    check('renommer 5321 : libellé changé, mention « renommé », libellé de la norme gardé', r.status === 200 && compte(r.body, '5321')?.libelle === 'Comptes en dinars (banques tunisiennes)' && compte(r.body, '5321')?.renomme === true && compte(r.body, '5321')?.libellePaquet === 'Comptes en dinars', `${r.status} ${r.body?.message || ''}`);
    j = await journal(espaceId, 'compte_modifie');
    check('journal : compte_modifie avec avant / après', !!j && j.details?.numero === '5321' && j.details?.changements?.libelle?.avant === 'Comptes en dinars' && j.details?.changements?.libelle?.apres === 'Comptes en dinars (banques tunisiennes)', JSON.stringify(j?.details));
    const nbModif = await nbJournal(espaceId, 'compte_modifie');
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321.id}`, cabinet.tok, { libelle: 'Comptes en dinars (banques tunisiennes)' });
    check('même libellé : 200 sans ligne de journal', r.status === 200 && (await nbJournal(espaceId, 'compte_modifie')) === nbModif, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321.id}`, cabinet.tok, { libelle: 'Comptes en dinars' });
    check('rétablir le libellé de la norme : plus « renommé »', r.status === 200 && compte(r.body, '5321')?.renomme === false, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321.id}`, cabinet.tok, { nature: 'caisse' });
    check('nature d\'un compte de la norme : 409 COMPTE_PAQUET', r.status === 409 && r.body?.code === 'COMPTE_PAQUET', `${r.status} ${r.body?.code}`);
    // Relecture : un formulaire complet qui renvoie la nature actuelle (et une explication vide) renomme un compte de la norme.
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321.id}`, cabinet.tok, { libelle: 'Comptes en dinars (BIAT, Amen)', nature: 'banque', explication: '' });
    check('formulaire complet avec la nature actuelle : renommer un compte de la norme passe', r.status === 200 && compte(r.body, '5321')?.libelle === 'Comptes en dinars (BIAT, Amen)', `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321.id}`, cabinet.tok, { libelle: 'Comptes en dinars' });
    check('… puis rétabli', r.status === 200 && compte(r.body, '5321')?.renomme === false, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/plan/comptes/${c53211.id}`, complet.tok, { nature: 'general', explication: null, libelle: 'BIAT' });
    c53211 = compte(r.body, '53211');
    check('compte ajouté : nature, explication (effacée) et libellé modifiables', r.status === 200 && c53211?.nature === 'general' && c53211?.explication === null && c53211?.libelle === 'BIAT', `${r.status} ${JSON.stringify(c53211)}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/plan/comptes/${c53211.id}`, cabinet.tok, {});
    check('rien à modifier : 400', r.status === 400, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/plan/comptes/${c53211.id}`, saisie.tok, { libelle: 'x' });
    check('Saisie ne renomme pas : 403', r.status === 403, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/plan/comptes/999999999`, cabinet.tok, { libelle: 'x' });
    check('compte inconnu : 404', r.status === 404, String(r.status));

    // ── Désactiver du bas vers le haut, réactiver sous un parent actif ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321.id}/desactiver`, cabinet.tok);
    check('désactiver 5321 avec des sous-comptes actifs : 409 SOUS_COMPTES_ACTIFS (les nomme)', r.status === 409 && r.body?.code === 'SOUS_COMPTES_ACTIFS' && /53211/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c53211.id}/desactiver`, complet.tok);
    check('désactiver 53211 (feuille) : désactivé, comptes rendus', r.status === 200 && compte(r.body, '53211')?.actif === false && r.body?.nb?.desactives === 1 && compte(r.body, '5321')?.nbEnfantsActifs === 1, `${r.status} ${JSON.stringify(r.body?.nb)}`);
    j = await journal(espaceId, 'compte_desactive');
    check('journal : compte_desactive', !!j && j.details?.numero === '53211', JSON.stringify(j?.details));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c53211.id}/desactiver`, cabinet.tok);
    check('désactiver deux fois : 409 DEJA_FAIT', r.status === 409 && r.body?.code === 'DEJA_FAIT', String(r.status));
    const c53212 = compte(plan, '53212');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c53212.id}/desactiver`, cabinet.tok);
    // S5b : le journal BQ porte 5321 par défaut (un compte porté ne se désactive pas) : déplacé sur 5324 (devises).
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    const bq = r.body?.journaux?.find((x) => x.code === 'BQ');
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/journaux/${bq?.id}`, cabinet.tok, { compteId: compte(plan, '5324')?.id });
    check('S5b : le journal BQ (qui portait 5321) déplacé sur 5324 pour libérer 5321', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321.id}/desactiver`, cabinet.tok);
    check('5321 se désactive une fois ses sous-comptes désactivés ; 532 redevient feuille ? non (5324 active)', r.status === 200 && compte(r.body, '5321')?.actif === false && compte(r.body, '532')?.nbEnfantsActifs === 1, `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c53211.id}/reactiver`, cabinet.tok);
    check('réactiver 53211 sous un parent désactivé : 409 PARENT_DESACTIVE', r.status === 409 && r.body?.code === 'PARENT_DESACTIVE' && /5321/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321.id}/desactiver`, cabinet.tok);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c5321.id, numero: '53213', libelle: 'x' });
    check('subdiviser un compte désactivé : 409 COMPTE_DESACTIVE', r.status === 409 && r.body?.code === 'COMPTE_DESACTIVE', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321.id}/reactiver`, cabinet.tok);
    check('réactiver 5321', r.status === 200 && compte(r.body, '5321')?.actif === true, String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c53211.id}/reactiver`, complet.tok);
    check('puis 53211 : réactivé ; journal compte_reactive', r.status === 200 && compte(r.body, '53211')?.actif === true && !!(await journal(espaceId, 'compte_reactive')), String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c53211.id}/reactiver`, cabinet.tok);
    check('réactiver un compte actif : 409 DEJA_FAIT', r.status === 409 && r.body?.code === 'DEJA_FAIT', String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c53211.id}/desactiver`, saisie.tok);
    check('Saisie ne désactive pas : 403', r.status === 403, String(r.status));

    // ── Supprimer ──
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321.id}`, cabinet.tok);
    check('supprimer un compte de la norme : 409 COMPTE_PAQUET', r.status === 409 && r.body?.code === 'COMPTE_PAQUET', `${r.status} ${r.body?.code}`);
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/plan/comptes/${c551.id}`, cabinet.tok);
    check('supprimer 551 qui a un sous-compte : 409 SOUS_COMPTES', r.status === 409 && r.body?.code === 'SOUS_COMPTES' && /5519/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    const c5519 = compte(plan, '5519');
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/plan/comptes/${c5519.id}`, complet.tok);
    check('supprimer 5519 (ajout sans sous-compte) : 200, parti, comptes rendus', r.status === 200 && !compte(r.body, '5519') && compte(r.body, '551')?.nbEnfants === 0 && r.body?.nb?.ajoutes === 6, `${r.status} ${JSON.stringify(r.body?.nb)}`);
    j = await journal(espaceId, 'compte_supprime');
    check('journal : compte_supprime (numéro, libellé, parent)', !!j && j.details?.numero === '5519' && j.details?.parent === '551', JSON.stringify(j?.details));
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/plan/comptes/${c5519.id}`, cabinet.tok);
    check('supprimer deux fois : 404', r.status === 404, String(r.status));
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/plan/comptes/${c551.id}`, saisie.tok);
    check('Saisie ne supprime pas : 403', r.status === 403, String(r.status));

    // ── Dossier archivé, comptabilité en lecture seule ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c5321.id, numero: '53213', libelle: 'x' });
    check('dossier archivé : écriture refusée (409 DOSSIER_ARCHIVE)', r.status === 409 && r.body?.code === 'DOSSIER_ARCHIVE', `${r.status} ${r.body?.code}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok);
    check('… mais le plan se lit (dossier archivé dans la réponse)', r.status === 200 && r.body?.dossier?.etat === 'archive', String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/desarchiver`, cabinet.tok);
    await mode(cabinet.id, 'read_only');
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/plan/comptes/${c5321.id}`, cabinet.tok, { libelle: 'x' });
    check('abonnement du cabinet en lecture seule : 403 READ_ONLY', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, complet.tok);
    check('… le plan se lit, état « lecture_seule »', r.status === 200 && r.body?.etatAbonnement === 'lecture_seule', String(r.status));
    await mode(cabinet.id, 'actif');

    // ── Export Excel ──
    const x = await fetch(`${BASE}/api/compta/dossiers/${A.id}/plan/export`, { headers: { Authorization: `Bearer ${saisie.tok}` } });
    const octets = x.ok ? (await x.arrayBuffer()).byteLength : 0;
    check('export Excel (Saisie peut) : 200, classeur xlsx, pièce jointe nommée', x.status === 200 && /spreadsheetml/.test(x.headers.get('content-type') || '') && /plan-de-comptes-\d+\.xlsx/.test(x.headers.get('content-disposition') || '') && octets > 10000, `${x.status} ${octets} octets`);
    const x2 = await fetch(`${BASE}/api/compta/dossiers/${A.id}/plan/export`, { headers: { Authorization: `Bearer ${client.tok}` } });
    check('export par une personne étrangère : 404', x2.status === 404, String(x2.status));

    // ── La fiche et la suppression du dossier ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, cabinet.tok);
    // 53212 (Amen Bank) est resté désactivé dans le scénario : 610 comptes, 609 actifs, 6 ajoutés (3 proposés par S5b, 53211, 53212, 551), 1 désactivé.
    check('fiche A : résumé du plan à jour (6 ajoutés dont les 3 proposés, 1 désactivé)', r.status === 200 && r.body?.plan?.nbActifs === NB_PLAN + 2 && r.body?.plan?.nbAjoutes === 6 && r.body?.plan?.nbDesactives === 1, JSON.stringify(r.body?.plan));
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: { raisonSociale: 'Chez Bis' }, regime: REGIME, exercice: CIVIL });
    const B = r.body;
    r = await appel('DELETE', `/api/compta/dossiers/${B.id}`, cabinet.tok);
    const restes = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.comptes WHERE dossier_id = $1', [B.id])).rows[0];
    check('supprimer un dossier vide : son plan part avec lui (cascade)', r.status === 204 && restes.n === 0, `${r.status} ${restes.n}`);

    // ── Les pages d'avant ne changent pas ──
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok);
    check('liste des dossiers inchangée (1 dossier, droits avec « configurer »)', r.status === 200 && r.body?.dossiers?.length === 1 && r.body?.droits?.configurer === true, JSON.stringify(r.body?.droits));
    r = await appel('GET', '/api/compta/acces', complet.tok);
    check('accueil du collaborateur inchangé', r.status === 200 && r.body?.cabinets?.length === 1, JSON.stringify(r.body));
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
