/* Test E2E local — LabFlow Compta, étape S5b « Les journaux et les codes de taxe » (labflow-reprise/achats-compta/
 * PLAN-S5.md §1, §2, §4, §5 ; réponses du client du 07/10 — « ok pour les 8 » — et du 08/10 — « ok pour les 4 » : TVA
 * collectée sur 436711, trois sous-comptes créés par défaut ET remplaçables, un code de TVA non récupérable par taux, tout
 * type de journal sauf un seul à-nouveaux).
 *   un dossier neuf (réel, forfaitaire, exportateur total) et le dossier « Mon entreprise » d'un client naissent avec six
 *   journaux et les codes de taxe de leur régime (20 / 14 / 21), et les trois sous-comptes expliqués (4375, 4376, 43665) ;
 *   journaux : liste et comptes de contrepartie possibles, créer (banque sur un 532x subdivisé, autres types, un seul AN),
 *   modifier (libellé, compte), désactiver, réactiver ; taxes : liste par type, ajouter depuis le paquet, code personnalisé
 *   (taux ou montant fixe), modifier (comptes de tout code ; type / taux / assiette d'un code personnalisé seulement),
 *   désactiver, réactiver ; un compte porté par un journal ou un code ne se désactive ni ne se supprime dans le plan, et
 *   un sous-compte proposé se supprime dès qu'aucun code ne le porte (les deux choix du point 2) ; droits par niveau ;
 *   dossier archivé ; garde par comptabilité ; journal (D16) ; rejeu de la migration 213 sur des dossiers « existants » ;
 *   suppression d'un dossier vide (cascade) ; pages d'avant inchangées.
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
const NB_REEL = 20;
const NB_SANS_TVA = 14;
const NB_EXPORT = 21;
const NB_REF_TAXES = 31;

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s5b@example.com';
  const CLIENT = 'test-client-compta-s5b@example.com';
  const CABINET = 'test-cabinet-compta-s5b@example.com';
  const SAISIE = 'test-saisie-compta-s5b@example.com';
  const COMPLET = 'test-complet-compta-s5b@example.com';
  const TOUS = [ADMIN, CLIENT, CABINET, SAISIE, COMPLET];
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  let adminTok = null;
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [TOUS])).rows.map((r) => r.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
      // D10 : les dossiers retiennent leur comptabilité (RESTRICT) — l'essai efface les siens d'abord (plan, journaux, taxes suivent, CASCADE).
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
  const nbJournal = async (espaceId, type, filtre = {}) => (await pool.query('SELECT COUNT(*)::int AS n FROM compta.evenements WHERE espace_id = $1 AND type = $2 AND details @> $3::jsonb', [espaceId, type, JSON.stringify(filtre)])).rows[0].n;
  const mode = (id, m) => pool.query('UPDATE abonnements SET mode_compte = $2 WHERE client_id = $1', [id, m]);
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };
  const IDENTITE_A = { raisonSociale: 'Hôtel Essai S5b', formeJuridique: 'SARL', matriculeFiscal: '1234567A/A/M/000', adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' };
  const REEL = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const FORFAIT = { personne: 'physique', impot: 'IRPP', tva: 'forfaitaire', exportateurTotal: false, teledeclaration: false, debutActivite: null };
  const EXPORT = { ...REEL, exportateurTotal: true };
  const CIVIL = { debut: '2026-01-01', fin: '2026-12-31' };
  const compte = (plan, numero) => plan?.comptes?.find((c) => c.numero === numero);
  const journalDe = (etat, code) => etat?.journaux?.find((j) => j.code === code);
  const taxeDe = (etat, code) => etat?.taxes?.find((t) => t.code === code);
  const choix = (etat, numero) => etat?.comptes?.find((c) => c.numero === numero);

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S5b', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (2 gérants achetés) avec deux collaborateurs, un client LabFlow (module) ──
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S5b', email: CABINET, telephone: '20 555 095', raisonSociale: 'Cabinet Essai S5b', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S5b', representantQualite: 'Gérant', nbGerants: 2,
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
    r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client S5b', email: CLIENT, telephone: '20 555 096', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    const client = await activer(CLIENT);
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 0 });
    const espaceClient = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [client.id])).rows[0]?.id;
    check('client LabFlow avec le module Comptabilité', !!client.tok && r.status === 200 && !!espaceClient, `${r.status} ${r.body?.message || ''}`);

    // ── Le paquet en base ──
    const paquet = (await pool.query(`SELECT id, version FROM compta.ref_paquets WHERE pays = 'TN' ORDER BY id DESC LIMIT 1`)).rows[0];
    const nbRef = (await pool.query('SELECT (SELECT COUNT(*) FROM compta.ref_journaux WHERE paquet_id = $1)::int AS j, (SELECT COUNT(*) FROM compta.ref_sous_comptes WHERE paquet_id = $1)::int AS s, (SELECT COUNT(*) FROM compta.ref_taxes WHERE paquet_id = $1)::int AS t', [paquet?.id])).rows[0];
    check(`paquet TN 2026.1 en base : 6 journaux, 3 sous-comptes proposés, ${NB_REF_TAXES} codes de taxe`, paquet?.version === '2026.1' && nbRef.j === 6 && nbRef.s === 3 && nbRef.t === NB_REF_TAXES, JSON.stringify(nbRef));

    // ── Naissance : dossier A (réel) ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REEL, exercice: CIVIL });
    const A = r.body;
    check(`dossier A (réel) créé : la fiche résume 6 journaux et ${NB_REEL} codes actifs ; plan : ${NB_PAQUET + 3} comptes actifs, 3 ajoutés`,
      r.status === 201 && A?.journaux?.nbActifs === 6 && A?.journaux?.nbTotal === 6 && A?.taxes?.nbActifs === NB_REEL && A?.plan?.nbActifs === NB_PAQUET + 3 && A?.plan?.nbAjoutes === 3, `${r.status} ${JSON.stringify({ j: A?.journaux, t: A?.taxes, p: A?.plan })}`);
    let j = await journal(espaceId, 'journaux_initialises');
    check('journal : journaux_initialises (dossier, 6)', !!j && j.details?.dossier === A?.id && j.details?.journaux === 6 && j.auteur_id === cabinet.id, JSON.stringify(j?.details));
    j = await journal(espaceId, 'taxes_initialisees');
    check(`journal : taxes_initialisees (régime réel, ${NB_REEL} codes)`, !!j && j.details?.dossier === A?.id && j.details?.codes === NB_REEL && j.details?.regime?.tva === 'reel' && j.details?.regime?.exportateurTotal === false, JSON.stringify(j?.details));
    check('journal : trois compte_ajoute « proposés » (4375, 4376, 43665), expliqués', (await nbJournal(espaceId, 'compte_ajoute', { dossier: A?.id, propose: true })) === 3
      && (await pool.query(`SELECT COUNT(*)::int AS n FROM compta.evenements WHERE espace_id = $1 AND type = 'compte_ajoute' AND details->>'numero' = '4375' AND details->>'explication' LIKE 'Ajouté par LabFlow Compta pour le code de taxe TIMBRE%'`, [espaceId])).rows[0].n === 1);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok);
    const c4375 = compte(r.body, '4375');
    check('plan A : 4375 « Droit de timbre collecté » ajouté sous 437, nature État, expliqué, feuille ; 4376 et 43665 aussi',
      c4375?.origine === 'ajout' && c4375?.parentId === compte(r.body, '437')?.id && c4375?.nature === 'etat' && /TIMBRE/.test(c4375?.explication || '') && c4375?.feuille === true && c4375?.actif === true
      && compte(r.body, '4376')?.libelle === 'FODEC collecté' && compte(r.body, '43665')?.parentId === compte(r.body, '4366')?.id && compte(r.body, '43665')?.nature === 'tva_deductible', JSON.stringify(c4375));

    // ── Journaux de A : la liste ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    let jx = r.body;
    check('titulaire : 6 journaux (AC, VT, BQ, CA, OD, AN), droits, types, borne du code', r.status === 200 && jx?.journaux?.map((x) => x.code).join(',') === 'AC,VT,BQ,CA,OD,AN' && jx?.droits?.configurer === true && jx?.types?.length === 6 && jx?.code?.max === 4 && jx?.nb?.actifs === 6 && jx?.dossier?.id === A.id && jx?.etatAbonnement === 'actif', `${r.status} ${JSON.stringify(jx?.nb)}`);
    check('… BQ sur 5321 (imputable), CA sur 5411 ; AC sans compte ; tous « paquet », actifs', journalDe(jx, 'BQ')?.compte?.numero === '5321' && journalDe(jx, 'BQ')?.compte?.imputable === true && journalDe(jx, 'BQ')?.avecCompte === true && journalDe(jx, 'CA')?.compte?.numero === '5411' && journalDe(jx, 'AC')?.compte === null && journalDe(jx, 'AC')?.avecCompte === false && jx.journaux.every((x) => x.origine === 'paquet' && x.actif), JSON.stringify(journalDe(jx, 'BQ')));
    check('… comptes de contrepartie proposés : actifs, de nature banque ou caisse seulement (5321, 5411, 55 ; pas 4011)', jx?.comptes?.length > 5 && jx.comptes.every((c) => ['banque', 'caisse'].includes(c.nature) && c.actif) && !!choix(jx, '5321') && !!choix(jx, '5411') && !!choix(jx, '55') && !choix(jx, '4011'), String(jx?.comptes?.length));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, saisie.tok);
    check('collaborateur Saisie : lit, ne configure pas', r.status === 200 && r.body?.droits?.configurer === false, String(r.status));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, client.tok);
    check('un client étranger au cabinet : 404', r.status === 404, String(r.status));
    r = await appel('GET', '/api/compta/dossiers/abc/journaux', cabinet.tok);
    check('identifiant mal formé : 404, jamais 500', r.status === 404, String(r.status));

    // ── Journaux : créer (réponse 8 : subdiviser 5321 d'abord, puis le journal sur le sous-compte) ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok);
    const c5321 = compte(r.body, '5321');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, complet.tok, { parentId: c5321.id, numero: '53211', libelle: 'BIAT — compte courant' });
    const c53211 = compte(r.body, '53211');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, complet.tok, { parentId: c5321.id, numero: '53212', libelle: 'Amen Bank' });
    const c53212 = compte(r.body, '53212');
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    jx = r.body;
    check('après la subdivision de 5321 : BQ garde 5321 mais « à préciser » (plus imputable) ; 53211 et 53212 proposés, imputables', journalDe(jx, 'BQ')?.compte?.numero === '5321' && journalDe(jx, 'BQ')?.compte?.imputable === false && choix(jx, '53211')?.imputable === true && choix(jx, '53212')?.imputable === true, JSON.stringify(journalDe(jx, 'BQ')?.compte));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, complet.tok, { code: 'bq2', libelle: 'Banque Amen', type: 'banque', compteId: c53212.id });
    jx = r.body;
    check('Complet crée BQ2 (code en minuscules → majuscules) sur 53212 : 201, 7 journaux, origine ajout', r.status === 201 && journalDe(jx, 'BQ2')?.compte?.numero === '53212' && journalDe(jx, 'BQ2')?.origine === 'ajout' && journalDe(jx, 'BQ2')?.actif === true && jx?.nb?.total === 7, `${r.status} ${r.body?.message || ''}`);
    j = await journal(espaceId, 'journal_cree');
    check('journal : journal_cree (code, type, compte)', !!j && j.details?.code === 'BQ2' && j.details?.type === 'banque' && j.details?.compte === '53212' && j.auteur_id === complet.id, JSON.stringify(j?.details));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok, { code: 'BQ2', libelle: 'Doublon', type: 'banque', compteId: c53211.id });
    check('code déjà pris : 409 CODE_EXISTANT', r.status === 409 && r.body?.code === 'CODE_EXISTANT', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok, { code: 'BQ3', libelle: 'Sans compte', type: 'banque' });
    check('banque sans compte : 400', r.status === 400 && /contrepartie/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok);
    const c4011 = compte(r.body, '4011');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok, { code: 'BQ3', libelle: 'Mauvaise nature', type: 'banque', compteId: c4011.id });
    check('banque sur un compte fournisseurs : 400 (nature)', r.status === 400 && /nature banque/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok, { code: 'CA2', libelle: 'Caisse bar', type: 'caisse', compteId: c53211.id });
    check('caisse sur un compte de banque : 400 (nature)', r.status === 400 && /nature caisse/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok, { code: 'OD2', libelle: 'Divers', type: 'od', compteId: c53211.id });
    check('opérations diverses avec un compte : 400', r.status === 400 && /pas de compte/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok, { code: 'AN2', libelle: 'Bis', type: 'an' });
    check('deuxième journal d\'à-nouveaux : 409 UN_SEUL_AN', r.status === 409 && r.body?.code === 'UN_SEUL_AN', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok, { code: 'VT2', libelle: 'Ventes comptoir', type: 'ventes' });
    check('deuxième journal de ventes (réponse 4 du 08/10) : 201, sans compte', r.status === 201 && journalDe(r.body, 'VT2')?.compte === null && r.body?.nb?.total === 8, `${r.status} ${r.body?.message || ''}`);
    for (const [corps, quoi] of [[{ code: 'A', libelle: 'x', type: 'od' }, 'code d\'1 caractère'], [{ code: 'ABCDE', libelle: 'x', type: 'od' }, 'code de 5'], [{ code: 'OD-1', libelle: 'x', type: 'od' }, 'tiret'], [{ code: 'OD3', libelle: '', type: 'od' }, 'libellé vide'], [{ code: 'OD3', libelle: 'x', type: 'journal' }, 'type inconnu'], [{ code: 'BQ3', libelle: 'x', type: 'banque', compteId: 'abc' }, 'compte mal formé']]) {
      r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok, corps);
      check(`${quoi} : 400`, r.status === 400, `${r.status} ${r.body?.message}`);
    }
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok, { code: 'BQ3', libelle: 'x', type: 'banque', compteId: 999999999 });
    check('compte inconnu : 404', r.status === 404, String(r.status));
    // Cloisonnement : un compte du dossier du client, rejoué sur A, est introuvable.
    const dossierClient = (await pool.query(`SELECT id FROM compta.dossiers WHERE espace_id = $1 AND source = 'labflow'`, [espaceClient])).rows[0];
    r = await appel('GET', `/api/compta/dossiers/${dossierClient?.id}/plan`, client.tok);
    const c5321Client = compte(r.body, '5321');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok, { code: 'BQ3', libelle: 'x', type: 'banque', compteId: c5321Client?.id });
    check('compte d\'un autre dossier (le 5321 du client) : 404', r.status === 404, `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, saisie.tok, { code: 'OD3', libelle: 'x', type: 'od' });
    check('collaborateur Saisie : 403 NIVEAU_INSUFFISANT', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, client.tok, { code: 'OD3', libelle: 'x', type: 'od' });
    check('personne étrangère : 404', r.status === 404, String(r.status));

    // ── Journaux : modifier ──
    const bq = journalDe(jx, 'BQ');
    const bq2 = journalDe(jx, 'BQ2');
    const ac = journalDe(jx, 'AC');
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/journaux/${bq.id}`, cabinet.tok, { compteId: c53211.id, libelle: 'Banque BIAT' });
    check('BQ déplacé sur 53211 et renommé : 200, imputable', r.status === 200 && journalDe(r.body, 'BQ')?.compte?.numero === '53211' && journalDe(r.body, 'BQ')?.compte?.imputable === true && journalDe(r.body, 'BQ')?.libelle === 'Banque BIAT', `${r.status} ${r.body?.message || ''}`);
    j = await journal(espaceId, 'journal_modifie');
    check('journal : journal_modifie avec avant / après (compte 5321 → 53211, libellé)', !!j && j.details?.code === 'BQ' && j.details?.changements?.compte?.avant === '5321' && j.details?.changements?.compte?.apres === '53211' && j.details?.changements?.libelle?.apres === 'Banque BIAT', JSON.stringify(j?.details));
    const nbModif = await nbJournal(espaceId, 'journal_modifie');
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/journaux/${bq.id}`, cabinet.tok, { compteId: c53211.id, libelle: 'Banque BIAT' });
    check('mêmes valeurs : 200 sans ligne de journal', r.status === 200 && (await nbJournal(espaceId, 'journal_modifie')) === nbModif, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/journaux/${ac.id}`, cabinet.tok, { compteId: c53211.id });
    check('compte sur un journal d\'achats : 400', r.status === 400, `${r.status} ${r.body?.message}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/journaux/${bq.id}`, cabinet.tok, { compteId: null });
    check('retirer le compte d\'un journal de banque : 400', r.status === 400, `${r.status} ${r.body?.message}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/journaux/${bq.id}`, cabinet.tok, {});
    check('rien à modifier : 400', r.status === 400, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/journaux/999999999`, cabinet.tok, { libelle: 'x' });
    check('journal inconnu : 404', r.status === 404, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/journaux/${bq.id}`, saisie.tok, { libelle: 'x' });
    check('Saisie ne modifie pas : 403', r.status === 403, String(r.status));

    // ── Journaux : désactiver, réactiver ; le compte porté ne bouge plus dans le plan ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux/${bq2.id}/desactiver`, complet.tok);
    check('désactiver BQ2 : 200, inactif, comptes rendus', r.status === 200 && journalDe(r.body, 'BQ2')?.actif === false && r.body?.nb?.actifs === 7 && r.body?.nb?.total === 8, `${r.status} ${r.body?.message || ''}`);
    check('journal : journal_desactive', !!(await journal(espaceId, 'journal_desactive')));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux/${bq2.id}/desactiver`, cabinet.tok);
    check('désactiver deux fois : 409 DEJA_FAIT', r.status === 409 && r.body?.code === 'DEJA_FAIT', String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c53212.id}/desactiver`, cabinet.tok);
    check('plan : désactiver 53212, porté par BQ2 (même inactif) : 409 COMPTE_UTILISE', r.status === 409 && r.body?.code === 'COMPTE_UTILISE', `${r.status} ${r.body?.code}`);
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/plan/comptes/${c53212.id}`, cabinet.tok);
    check('plan : supprimer 53212, porté par BQ2 : 409 COMPTE_UTILISE', r.status === 409 && r.body?.code === 'COMPTE_UTILISE', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux/${bq2.id}/reactiver`, cabinet.tok);
    check('réactiver BQ2 : 200 ; journal journal_reactive', r.status === 200 && journalDe(r.body, 'BQ2')?.actif === true && !!(await journal(espaceId, 'journal_reactive')), String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux/${bq2.id}/reactiver`, cabinet.tok);
    check('réactiver un journal actif : 409 DEJA_FAIT', r.status === 409 && r.body?.code === 'DEJA_FAIT', String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/journaux/${bq2.id}`, cabinet.tok, { compteId: c53211.id });
    check('BQ2 déplacé sur 53211 : 53212 n\'est plus porté', r.status === 200 && journalDe(r.body, 'BQ2')?.compte?.numero === '53211', String(r.status));
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/plan/comptes/${c53212.id}`, cabinet.tok);
    check('plan : 53212 se supprime alors', r.status === 200 && !compte(r.body, '53212'), `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux/${bq2.id}/desactiver`, saisie.tok);
    check('Saisie ne désactive pas : 403', r.status === 403, String(r.status));

    // ── Taxes de A : la liste ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok);
    let tx = r.body;
    check(`titulaire : ${NB_REEL} codes au réel, régime, droits, types (7), assiettes (4), borne du code (12), ${NB_REF_TAXES - NB_REEL} codes du paquet restants`,
      r.status === 200 && tx?.taxes?.length === NB_REEL && tx?.nb?.actifs === NB_REEL && tx?.regime?.tva === 'reel' && tx?.regime?.exportateurTotal === false && tx?.droits?.configurer === true
      && tx?.types?.length === 7 && tx?.assiettes?.length === 4 && tx?.code?.max === 12 && tx?.paquet?.codes?.length === NB_REF_TAXES - NB_REEL && tx?.paquet?.version === '2026.1', `${r.status} ${JSON.stringify(tx?.nb)} ${tx?.paquet?.codes?.length}`);
    const tva19 = taxeDe(tx, 'TVA19');
    check('… TVA19 : 19.000 % sur HT, achat 43666, vente 436711 (débits, imputable), immobilisations 43662, paquet, actif', tva19?.taux === '19.000' && tva19?.montant === null && tva19?.assiette === 'ht' && tva19?.compteAchat?.numero === '43666' && tva19?.compteVente?.numero === '436711' && tva19?.compteVente?.imputable === true && tva19?.compteImmo?.numero === '43662' && tva19?.origine === 'paquet' && tva19?.actif === true && tva19?.typeLibelle === 'TVA', JSON.stringify(tva19));
    const timbre = taxeDe(tx, 'TIMBRE');
    check('… TIMBRE : montant fixe 1.000, assiette fixe, achat 6654, vente 4375 (sous-compte ajouté, imputable)', timbre?.taux === null && timbre?.montant === '1.000' && timbre?.assiette === 'fixe' && timbre?.compteAchat?.numero === '6654' && timbre?.compteVente?.numero === '4375' && timbre?.compteVente?.imputable === true && timbre?.compteImmo === null, JSON.stringify(timbre));
    check('… RSTVA25 vente 43665 ; FODEC vente 4376 ; RS_MAR15 1.500 % TTC 432 / 4341 avec code TEJ ; TVAEXO sans taux ; RSTVA100 sur la TVA', taxeDe(tx, 'RSTVA25')?.compteVente?.numero === '43665' && taxeDe(tx, 'RSTVA25')?.compteAchat === null && taxeDe(tx, 'FODEC')?.compteVente?.numero === '4376'
      && taxeDe(tx, 'RS_MAR15')?.taux === '1.500' && taxeDe(tx, 'RS_MAR15')?.assiette === 'ttc' && taxeDe(tx, 'RS_MAR15')?.compteAchat?.numero === '432' && taxeDe(tx, 'RS_MAR15')?.compteVente?.numero === '4341' && taxeDe(tx, 'RS_MAR15')?.codeTej === 'RS7_000001'
      && taxeDe(tx, 'TVAEXO')?.taux === null && taxeDe(tx, 'RSTVA100')?.assiette === 'tva' && taxeDe(tx, 'RSTVA100')?.taux === '100.000', JSON.stringify(taxeDe(tx, 'RS_MAR15')));
    check('… triés par type (TVA d\'abord, puis retenues…) ; le paquet restant commence par TVASUSP et TVANDR13', tx.taxes[0].type === 'tva' && tx.taxes.findIndex((t) => t.type === 'retenue') > tx.taxes.filter((t) => t.type === 'tva').length - 1 && tx.paquet.codes.map((c) => c.code).slice(0, 2).join(',') === 'TVASUSP,TVANDR13' && tx.paquet.codes.find((c) => c.code === 'TVASUSP')?.copieLibelle === 'Exportateur total', tx.paquet.codes.map((c) => c.code).join(','));
    check('… comptes proposés : tous les comptes actifs du plan (dont 4375 ajouté), avec « imputable »', tx?.comptes?.length === NB_PAQUET + 3 + 1 && !!choix(tx, '4375') && choix(tx, '43671')?.imputable === false && choix(tx, '436711')?.imputable === true, String(tx?.comptes?.length));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/taxes`, saisie.tok);
    check('collaborateur Saisie : lit, ne configure pas', r.status === 200 && r.body?.droits?.configurer === false, String(r.status));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/taxes`, client.tok);
    check('un client étranger au cabinet : 404', r.status === 404, String(r.status));

    // ── Dossiers B (forfaitaire) et C (exportateur total), « Mon entreprise » du client ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: { raisonSociale: 'Pâtisserie Forfait', formeJuridique: 'EI' }, regime: FORFAIT, exercice: CIVIL });
    const B = r.body;
    r = await appel('GET', `/api/compta/dossiers/${B.id}/taxes`, cabinet.tok);
    check(`dossier B (forfaitaire) : ${NB_SANS_TVA} codes, aucun de type TVA, timbre et retenues présents, ${NB_REF_TAXES - NB_SANS_TVA} restants ; 3 sous-comptes ajoutés quand même`, r.status === 200 && r.body?.taxes?.length === NB_SANS_TVA && !r.body.taxes.some((t) => t.type === 'tva') && !!taxeDe(r.body, 'TIMBRE') && !!taxeDe(r.body, 'RS_HON10') && r.body?.paquet?.codes?.length === NB_REF_TAXES - NB_SANS_TVA && B?.plan?.nbAjoutes === 3 && B?.taxes?.nbActifs === NB_SANS_TVA, `${r.status} ${r.body?.taxes?.length}`);
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, complet.tok, { identite: { raisonSociale: 'Export Céramique' }, regime: EXPORT, exercice: CIVIL });
    const C = r.body;
    r = await appel('GET', `/api/compta/dossiers/${C.id}/taxes`, complet.tok);
    check(`dossier C (exportateur total) : ${NB_EXPORT} codes dont TVASUSP`, r.status === 200 && r.body?.taxes?.length === NB_EXPORT && !!taxeDe(r.body, 'TVASUSP') && r.body?.regime?.exportateurTotal === true, `${r.status} ${r.body?.taxes?.length}`);
    r = await appel('GET', `/api/compta/dossiers/${dossierClient?.id}/journaux`, client.tok);
    const rt = await appel('GET', `/api/compta/dossiers/${dossierClient?.id}/taxes`, client.tok);
    check(`« Mon entreprise » du client : 6 journaux, ${NB_REEL} codes (réel), le client configure`, r.status === 200 && r.body?.journaux?.length === 6 && r.body?.droits?.configurer === true && rt.status === 200 && rt.body?.taxes?.length === NB_REEL && rt.body?.dossier?.source === 'labflow', `${r.status} ${rt.status}`);

    // ── Taxes : ajouter depuis le paquet ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/paquet`, complet.tok, { code: 'tvandr13' });
    tx = r.body;
    check(`ajouter TVANDR13 depuis le paquet (code en minuscules) : 201, ${NB_REEL + 1} codes, comptes résolus (6652), ${NB_REF_TAXES - NB_REEL - 1} restants`, r.status === 201 && tx?.taxes?.length === NB_REEL + 1 && taxeDe(tx, 'TVANDR13')?.compteAchat?.numero === '6652' && taxeDe(tx, 'TVANDR13')?.origine === 'paquet' && taxeDe(tx, 'TVANDR13')?.taux === '13.000' && tx?.paquet?.codes?.length === NB_REF_TAXES - NB_REEL - 1, `${r.status} ${r.body?.message || ''}`);
    j = await journal(espaceId, 'taxe_ajoutee');
    check('journal : taxe_ajoutee (origine paquet)', !!j && j.details?.code === 'TVANDR13' && j.details?.origine === 'paquet' && j.auteur_id === complet.id, JSON.stringify(j?.details));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/paquet`, cabinet.tok, { code: 'TVANDR13' });
    check('deux fois : 409 DEJA_PRESENT', r.status === 409 && r.body?.code === 'DEJA_PRESENT', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/paquet`, cabinet.tok, { code: 'ZZZ' });
    check('code hors du paquet : 404', r.status === 404, String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/paquet`, cabinet.tok, { code: '' });
    check('code vide : 400', r.status === 400, String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${B.id}/taxes/paquet`, cabinet.tok, { code: 'TVA19' });
    check('dossier B (forfaitaire) : TVA19 s\'ajoute depuis le paquet (régime qui change), avec 43666 / 436711 / 43662', r.status === 201 && taxeDe(r.body, 'TVA19')?.compteVente?.numero === '436711' && taxeDe(r.body, 'TVA19')?.compteImmo?.numero === '43662' && r.body?.taxes?.length === NB_SANS_TVA + 1, `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/paquet`, saisie.tok, { code: 'TVANDR7' });
    check('Saisie : 403', r.status === 403, String(r.status));

    // ── Taxes : un code personnalisé ──
    const c437 = choix(tx, '437');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok, { code: 'dc_alc', libelle: 'Droit de consommation alcools 25 %', type: 'autre', assiette: 'ht', taux: '25', compteVenteId: c437.id });
    tx = r.body;
    const dc = taxeDe(tx, 'DC_ALC');
    check('code personnalisé DC_ALC (taux « 25 » → 25.000, vente 437, pas d\'achat) : 201, origine ajout', r.status === 201 && dc?.taux === '25.000' && dc?.montant === null && dc?.assiette === 'ht' && dc?.compteVente?.numero === '437' && dc?.compteAchat === null && dc?.origine === 'ajout' && dc?.codeTej === null && dc?.type === 'autre', `${r.status} ${r.body?.message || ''}`);
    j = await journal(espaceId, 'taxe_ajoutee');
    check('journal : taxe_ajoutee (origine ajout, comptes par numéro)', !!j && j.details?.code === 'DC_ALC' && j.details?.origine === 'ajout' && j.details?.comptes?.vente === '437' && j.details?.taux === '25.000', JSON.stringify(j?.details));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok, { code: 'TIMB_X', libelle: 'Timbre spécial', type: 'timbre', assiette: 'fixe', montant: '0,5', taux: '19' });
    check('montant fixe « 0,5 » → 0.500, taux ignoré', r.status === 201 && taxeDe(r.body, 'TIMB_X')?.montant === '0.500' && taxeDe(r.body, 'TIMB_X')?.taux === null, `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok, { code: 'DC_ALC', libelle: 'Doublon', type: 'autre', assiette: 'ht', taux: '1' });
    check('code déjà pris : 409 CODE_EXISTANT', r.status === 409 && r.body?.code === 'CODE_EXISTANT', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok, { code: 'TVASUSP', libelle: 'x', type: 'tva', assiette: 'ht', taux: '0' });
    check('code du paquet saisi à la main : 409 CODE_PAQUET', r.status === 409 && r.body?.code === 'CODE_PAQUET', `${r.status} ${r.body?.code}`);
    for (const [corps, quoi] of [
      [{ code: 'X1', libelle: 'x', type: 'autre', assiette: 'fixe' }, 'fixe sans montant'], [{ code: 'X1', libelle: 'x', type: 'autre', assiette: 'ht' }, 'taux absent'],
      [{ code: 'X1', libelle: 'x', type: 'autre', assiette: 'ht', taux: '101' }, 'taux > 100'], [{ code: 'X1', libelle: 'x', type: 'autre', assiette: 'ht', taux: '1.2345' }, '4 décimales'],
      [{ code: 'X1', libelle: 'x', type: 'impot', assiette: 'ht', taux: '1' }, 'type inconnu'], [{ code: 'X1', libelle: 'x', type: 'autre', assiette: 'brut', taux: '1' }, 'assiette inconnue'],
      [{ code: 'X', libelle: 'x', type: 'autre', assiette: 'ht', taux: '1' }, 'code d\'1 caractère'], [{ code: 'X1', libelle: '', type: 'autre', assiette: 'ht', taux: '1' }, 'libellé vide'],
      [{ code: 'X1', libelle: 'x', type: 'autre', assiette: 'fixe', montant: '0' }, 'montant nul'],
    ]) {
      r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok, corps);
      check(`${quoi} : 400`, r.status === 400, `${r.status} ${r.body?.message}`);
    }
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok, { code: 'X1', libelle: 'x', type: 'autre', assiette: 'ht', taux: '1', compteAchatId: 999999999 });
    check('compte inconnu : 404', r.status === 404, String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok, { code: 'X1', libelle: 'x', type: 'autre', assiette: 'ht', taux: '1', compteAchatId: c5321Client?.id });
    check('compte d\'un autre dossier : 404', r.status === 404, String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes`, saisie.tok, { code: 'X1', libelle: 'x', type: 'autre', assiette: 'ht', taux: '1' });
    check('Saisie : 403', r.status === 403, String(r.status));

    // ── Taxes : modifier ──
    const idTva19 = tva19.id;
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${idTva19}`, cabinet.tok, { taux: '20' });
    check('taux d\'un code du paquet : 409 TAXE_PAQUET', r.status === 409 && r.body?.code === 'TAXE_PAQUET', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${idTva19}`, cabinet.tok, { assiette: 'ttc' });
    check('assiette d\'un code du paquet : 409 TAXE_PAQUET', r.status === 409 && r.body?.code === 'TAXE_PAQUET', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${idTva19}`, cabinet.tok, { taux: '19', assiette: 'ht', type: 'tva', libelle: 'TVA 19 % (taux normal)' });
    check('formulaire complet qui renvoie les valeurs figées : le libellé d\'un code du paquet se change', r.status === 200 && taxeDe(r.body, 'TVA19')?.libelle === 'TVA 19 % (taux normal)', `${r.status} ${r.body?.message || ''}`);
    // Relecture : un code du paquet SANS taux (TVAEXO) se renomme aussi avec un formulaire complet (taux vide, assiette inchangée).
    const idExo = taxeDe(tx, 'TVAEXO').id;
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${idExo}`, cabinet.tok, { taux: '', assiette: 'ht', type: 'tva', libelle: 'Exonéré (tableau A) ou hors champ' });
    check('TVAEXO (sans taux) renommé avec un formulaire complet : 200, taux toujours vide', r.status === 200 && taxeDe(r.body, 'TVAEXO')?.libelle === 'Exonéré (tableau A) ou hors champ' && taxeDe(r.body, 'TVAEXO')?.taux === null, `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${idExo}`, cabinet.tok, { taux: '5' });
    check('… mais lui donner un taux : 409 TAXE_PAQUET', r.status === 409 && r.body?.code === 'TAXE_PAQUET', `${r.status} ${r.body?.code}`);
    const c43671 = choix(tx, '43671');
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${idTva19}`, complet.tok, { compteVenteId: c43671.id });
    check('compte à la vente de TVA19 → 43671 (le cabinet code autrement) : 200, « à préciser » (43671 a des sous-comptes actifs)', r.status === 200 && taxeDe(r.body, 'TVA19')?.compteVente?.numero === '43671' && taxeDe(r.body, 'TVA19')?.compteVente?.imputable === false, `${r.status} ${r.body?.message || ''}`);
    j = await journal(espaceId, 'taxe_modifiee');
    check('journal : taxe_modifiee (compte_vente 436711 → 43671)', !!j && j.details?.code === 'TVA19' && j.details?.changements?.compte_vente?.avant === '436711' && j.details?.changements?.compte_vente?.apres === '43671' && j.auteur_id === complet.id, JSON.stringify(j?.details));
    const nbModifTaxe = await nbJournal(espaceId, 'taxe_modifiee');
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${idTva19}`, cabinet.tok, { compteVenteId: c43671.id, libelle: 'TVA 19 % (taux normal)' });
    check('mêmes valeurs : 200 sans ligne de journal', r.status === 200 && (await nbJournal(espaceId, 'taxe_modifiee')) === nbModifTaxe, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${dc.id}`, cabinet.tok, { taux: '30', type: 'avance', compteAchatId: c4011.id });
    check('code personnalisé : taux 30, type, compte à l\'achat modifiés', r.status === 200 && taxeDe(r.body, 'DC_ALC')?.taux === '30.000' && taxeDe(r.body, 'DC_ALC')?.type === 'avance' && taxeDe(r.body, 'DC_ALC')?.compteAchat?.numero === '4011', `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${dc.id}`, cabinet.tok, { assiette: 'fixe', montant: '2' });
    check('code personnalisé passé en montant fixe : taux effacé, montant 2.000', r.status === 200 && taxeDe(r.body, 'DC_ALC')?.assiette === 'fixe' && taxeDe(r.body, 'DC_ALC')?.montant === '2.000' && taxeDe(r.body, 'DC_ALC')?.taux === null, `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${dc.id}`, cabinet.tok, { assiette: 'ht' });
    check('… retour en assiette HT sans taux : 400', r.status === 400, `${r.status} ${r.body?.message}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${dc.id}`, cabinet.tok, { compteAchatId: null });
    check('retirer un compte : 200, aucun compte à l\'achat', r.status === 200 && taxeDe(r.body, 'DC_ALC')?.compteAchat === null, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${dc.id}`, cabinet.tok, {});
    check('rien à modifier : 400', r.status === 400, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/999999999`, cabinet.tok, { libelle: 'x' });
    check('code inconnu : 404', r.status === 404, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${dc.id}`, saisie.tok, { libelle: 'x' });
    check('Saisie ne modifie pas : 403', r.status === 403, String(r.status));

    // ── Taxes : désactiver, réactiver ; les deux choix du point 2 (sous-compte proposé remplaçable puis supprimé) ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/${timbre.id}/desactiver`, cabinet.tok);
    check('désactiver TIMBRE : 200, inactif, comptes rendus', r.status === 200 && taxeDe(r.body, 'TIMBRE')?.actif === false && r.body?.nb?.actifs === r.body?.nb?.total - 1 && !!(await journal(espaceId, 'taxe_desactivee')), `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/${timbre.id}/desactiver`, cabinet.tok);
    check('désactiver deux fois : 409 DEJA_FAIT', r.status === 409 && r.body?.code === 'DEJA_FAIT', String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c4375.id}/desactiver`, cabinet.tok);
    check('plan : désactiver 4375, porté par TIMBRE (même inactif) : 409 COMPTE_UTILISE', r.status === 409 && r.body?.code === 'COMPTE_UTILISE', `${r.status} ${r.body?.code}`);
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/plan/comptes/${c4375.id}`, cabinet.tok);
    check('plan : supprimer 4375, porté par TIMBRE : 409 COMPTE_UTILISE', r.status === 409 && r.body?.code === 'COMPTE_UTILISE', `${r.status} ${r.body?.code}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok);
    const c6654 = compte(r.body, '6654');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c6654.id}/desactiver`, cabinet.tok);
    check('plan : désactiver 6654 (norme), porté par TIMBRE à l\'achat : 409 COMPTE_UTILISE', r.status === 409 && r.body?.code === 'COMPTE_UTILISE', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/${timbre.id}/reactiver`, cabinet.tok);
    check('réactiver TIMBRE : 200 ; journal taxe_reactivee', r.status === 200 && taxeDe(r.body, 'TIMBRE')?.actif === true && !!(await journal(espaceId, 'taxe_reactivee')), String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/${timbre.id}/reactiver`, cabinet.tok);
    check('réactiver un code actif : 409 DEJA_FAIT', r.status === 409 && r.body?.code === 'DEJA_FAIT', String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${timbre.id}`, cabinet.tok, { compteVenteId: c437.id });
    check('le cabinet remplace 4375 par 437 sur TIMBRE : 200 (compte « à préciser » car 4375 et 4376 restent actifs sous 437)', r.status === 200 && taxeDe(r.body, 'TIMBRE')?.compteVente?.numero === '437' && taxeDe(r.body, 'TIMBRE')?.compteVente?.imputable === false, `${r.status} ${r.body?.message || ''}`);
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/plan/comptes/${c4375.id}`, cabinet.tok);
    check('plan : 4375 (ajout proposé, plus porté) se supprime alors — les deux choix du point 2', r.status === 200 && !compte(r.body, '4375') && r.body?.nb?.ajoutes === 3, `${r.status} ${r.body?.message || ''} ${JSON.stringify(r.body?.nb)}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/${timbre.id}/desactiver`, saisie.tok);
    check('Saisie ne désactive pas : 403', r.status === 403, String(r.status));

    // ── Dossier archivé, comptabilité en lecture seule ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok, { code: 'OD3', libelle: 'x', type: 'od' });
    const r2 = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/paquet`, cabinet.tok, { code: 'TVANDR7' });
    check('dossier archivé : écritures refusées (409 DOSSIER_ARCHIVE), journaux et taxes', r.status === 409 && r.body?.code === 'DOSSIER_ARCHIVE' && r2.status === 409 && r2.body?.code === 'DOSSIER_ARCHIVE', `${r.status} ${r2.status}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok);
    check('… mais la liste se lit (dossier archivé dans la réponse)', r.status === 200 && r.body?.dossier?.etat === 'archive', String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/desarchiver`, cabinet.tok);
    await mode(cabinet.id, 'read_only');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok, { code: 'OD3', libelle: 'x', type: 'od' });
    check('abonnement du cabinet en lecture seule : 403 READ_ONLY', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, complet.tok);
    check('… les journaux se lisent, état « lecture_seule »', r.status === 200 && r.body?.etatAbonnement === 'lecture_seule', String(r.status));
    await mode(cabinet.id, 'actif');

    // ── La fiche résume ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, cabinet.tok);
    check(`fiche A : 8 journaux actifs, ${NB_REEL + 3} codes actifs, plan 3 ajoutés (4376, 43665, 53211)`, r.status === 200 && r.body?.journaux?.nbActifs === 8 && r.body?.journaux?.nbTotal === 8 && r.body?.taxes?.nbActifs === NB_REEL + 3 && r.body?.plan?.nbAjoutes === 3, JSON.stringify({ j: r.body?.journaux, t: r.body?.taxes, p: r.body?.plan }));

    // ── Rejeu de la migration 213 sur des dossiers « existants » (comme en production : B et C créés avant S5b) ──
    await pool.query('DELETE FROM compta.taxes WHERE dossier_id = ANY($1)', [[B.id, C.id]]);
    await pool.query('DELETE FROM compta.journaux WHERE dossier_id = ANY($1)', [[B.id, C.id]]);
    await pool.query(`DELETE FROM compta.comptes WHERE dossier_id = ANY($1) AND origine = 'ajout' AND numero IN ('4375', '4376', '43665')`, [[B.id, C.id]]);
    await pool.query(`DELETE FROM _migrations WHERE filename = '213_compta_journaux_taxes.sql'`);
    const avantRejeu = (await pool.query(`SELECT COUNT(*)::int AS n FROM compta.evenements WHERE type IN ('journaux_initialises', 'taxes_initialisees') AND details->>'migration' = '213'`)).rows[0].n;
    await require('../src/config/migrate')();
    check('migration 213 rejouée sans erreur (tables, paquet et manuel idempotents)', (await pool.query(`SELECT 1 FROM _migrations WHERE filename = '213_compta_journaux_taxes.sql'`)).rows.length === 1);
    r = await appel('GET', `/api/compta/dossiers/${B.id}/journaux`, cabinet.tok);
    const rtB = await appel('GET', `/api/compta/dossiers/${B.id}/taxes`, cabinet.tok);
    check(`B après rejeu : 6 journaux (BQ sur 5321), ${NB_SANS_TVA} codes (forfaitaire), TIMBRE sur 4375 recréé`, r.status === 200 && r.body?.journaux?.length === 6 && journalDe(r.body, 'BQ')?.compte?.numero === '5321' && rtB.body?.taxes?.length === NB_SANS_TVA && taxeDe(rtB.body, 'TIMBRE')?.compteVente?.numero === '4375' && taxeDe(rtB.body, 'RSTVA25')?.compteVente?.numero === '43665', `${r.body?.journaux?.length} ${rtB.body?.taxes?.length}`);
    const rtC = await appel('GET', `/api/compta/dossiers/${C.id}/taxes`, complet.tok);
    check(`C après rejeu : ${NB_EXPORT} codes dont TVASUSP`, rtC.body?.taxes?.length === NB_EXPORT && !!taxeDe(rtC.body, 'TVASUSP'), String(rtC.body?.taxes?.length));
    const apresRejeu = (await pool.query(`SELECT COUNT(*)::int AS n FROM compta.evenements WHERE type IN ('journaux_initialises', 'taxes_initialisees') AND details->>'migration' = '213'`)).rows[0].n;
    const ajoutsRejeu = (await pool.query(`SELECT COUNT(*)::int AS n FROM compta.evenements WHERE type = 'compte_ajoute' AND details->>'migration' = '213' AND (details->>'dossier')::int = ANY($1)`, [[B.id, C.id]])).rows[0].n;
    check('journal du rejeu : 2 journaux_initialises + 2 taxes_initialisees (migration 213), 6 compte_ajoute proposés', apresRejeu - avantRejeu === 4 && ajoutsRejeu === 6, `${apresRejeu - avantRejeu} ${ajoutsRejeu}`);
    const planB = await appel('GET', `/api/compta/dossiers/${B.id}/plan`, cabinet.tok);
    check('B : les trois sous-comptes recréés, expliqués, sous leur parent', compte(planB.body, '4375')?.parentId === compte(planB.body, '437')?.id && /TIMBRE/.test(compte(planB.body, '4375')?.explication || '') && compte(planB.body, '43665')?.parentId === compte(planB.body, '4366')?.id && planB.body?.nb?.ajoutes === 3, JSON.stringify(planB.body?.nb));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    check('A (qui avait déjà ses journaux) : intact après le rejeu (8 journaux, BQ sur 53211)', r.body?.journaux?.length === 8 && journalDe(r.body, 'BQ')?.compte?.numero === '53211', String(r.body?.journaux?.length));
    const manuel = (await pool.query(`SELECT slug, contenu_defaut FROM manuel_sections WHERE slug IN ('compta-journaux', 'compta-taxes', 'compta-dossier', 'compta-plan-comptes') AND produit = 'compta'`)).rows;
    check('manuel : fiches « Journaux » et « Taxes » présentes, « Fiche du dossier » et « Plan de comptes » complétées', manuel.length === 4 && /## 📒 Journaux/.test(manuel.find((m) => m.slug === 'compta-journaux')?.contenu_defaut || '') && /ses \*\*journaux\*\*/.test(manuel.find((m) => m.slug === 'compta-dossier')?.contenu_defaut || '') && /porté par un journal(, un code de taxe ou un tiers| ou un code de taxe)/.test(manuel.find((m) => m.slug === 'compta-plan-comptes')?.contenu_defaut || ''), manuel.map((m) => m.slug).join(','));

    // ── Suppression d'un dossier vide : journaux et taxes partent avec lui ──
    r = await appel('DELETE', `/api/compta/dossiers/${C.id}`, cabinet.tok);
    const restes = (await pool.query('SELECT (SELECT COUNT(*) FROM compta.journaux WHERE dossier_id = $1)::int AS j, (SELECT COUNT(*) FROM compta.taxes WHERE dossier_id = $1)::int AS t, (SELECT COUNT(*) FROM compta.comptes WHERE dossier_id = $1)::int AS c', [C.id])).rows[0];
    check('supprimer le dossier C : journaux, taxes et plan partent avec lui (cascade)', r.status === 204 && restes.j === 0 && restes.t === 0 && restes.c === 0, `${r.status} ${JSON.stringify(restes)}`);

    // ── Les pages d'avant ne changent pas ──
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok);
    check('liste des dossiers inchangée (2 dossiers)', r.status === 200 && r.body?.dossiers?.length === 2, String(r.body?.dossiers?.length));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, saisie.tok);
    check('plan de comptes de A lisible, 53211 présent, comptes rendus cohérents', r.status === 200 && !!compte(r.body, '53211') && r.body?.nb?.ajoutes === 3, JSON.stringify(r.body?.nb));
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
