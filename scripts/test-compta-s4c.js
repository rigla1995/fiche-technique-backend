/* Test E2E local — LabFlow Compta, étape S4c « Les dossiers de chaque collaborateur » (labflow-reprise/achats-compta/
 * PLAN-S4.md §1 ; réponses 2 et 4 du client du 07/10 ; ETAPE-S4c.md).
 *   le titulaire du cabinet fixe les dossiers de chaque collaborateur (« tous » ou une liste) à l'ajout et à la
 *   modification ; un nouveau collaborateur sans réglage ne voit rien ; partout une personne ne voit et ne touche que ses
 *   dossiers (liste, fiche, carte « Accès », avertissement du matricule sans fuite) ; un dossier créé par un collaborateur
 *   lui est ouvert ; contrôle des identifiants (409 DOSSIER_INCONNU, dossier d'une autre comptabilité) ; journal
 *   acces_dossiers_modifies (avant / après, une fois par changement) ; réattribution (le réglage suit l'accès) ; dossier
 *   supprimé → lignes retirées ; garde par comptabilité ; côté client : comptable obligatoire « tous », gérant comptable
 *   supplémentaire vide par défaut, réglage depuis « Ma comptabilité », retrait et départ remettent « tous » ; pages du
 *   collaborateur et du comptable (tousDossiers) ; migration 210 (manuel, idempotente).
 * Crée un super_admin, un cabinet (3 gérants achetés), trois collaborateurs (+ une réattribution), un client LabFlow
 * (module, 1 gérant comptable) et deux comptables temporaires ; règle les tarifs Compta le temps de l'essai, puis
 * restaure et nettoie.
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
const memes = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s4c@example.com';
  const CABINET = 'test-cabinet-compta-s4c@example.com';
  const G1 = 'test-g1-compta-s4c@example.com';
  const G2 = 'test-g2-compta-s4c@example.com';
  const G3 = 'test-g3-compta-s4c@example.com';
  const G4 = 'test-g4-compta-s4c@example.com';
  const CLIENT = 'test-client-compta-s4c@example.com';
  const COMPTABLE = 'test-comptable-compta-s4c@example.com';
  const COMPTABLE2 = 'test-comptable2-compta-s4c@example.com';
  const SUPP = 'test-supp-compta-s4c@example.com';
  const SUPP2 = 'test-supp2-compta-s4c@example.com';
  const TOUS = [ADMIN, CABINET, G1, G2, G3, G4, CLIENT, COMPTABLE, COMPTABLE2, SUPP, SUPP2];
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  let adminTok = null;
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [TOUS])).rows.map((r) => r.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
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
  const lignesAcces = async (accesId) => (await pool.query('SELECT dossier_id FROM compta.acces_dossiers WHERE acces_id = $1 ORDER BY dossier_id', [accesId])).rows.map((r) => r.dossier_id);
  const accesRow = async (accesId) => (await pool.query('SELECT tous_dossiers, personne_id, etat FROM compta.acces WHERE id = $1', [accesId])).rows[0];
  const REGIME = { personne: 'morale', impot: 'IS', tva: 'reel' };
  const CIVIL = { debut: '2026-01-01', fin: '2026-12-31' };
  const dossier = (tok, espaceId, identite) => appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, tok, { identite, regime: REGIME, exercice: CIVIL });
  const noms = (r) => (r.body?.dossiers || []).map((d) => d.nom).join('|');

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S4c', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (3 gérants achetés) et trois dossiers ; un client LabFlow (module, 1 gérant comptable) ──
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S4c', email: CABINET, telephone: '20 555 091', raisonSociale: 'Cabinet Essai S4c', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S4c', representantQualite: 'Gérant', nbGerants: 3,
    });
    check('création du cabinet (3 gérants achetés)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const cabinet = await activer(CABINET);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    check('connexion du titulaire', !!cabinet.tok && !!espaceId);
    const A = (await dossier(cabinet.tok, espaceId, { raisonSociale: 'Alpha Essai S4c', matriculeFiscal: '1234567A/A/M/000' })).body;
    const B = (await dossier(cabinet.tok, espaceId, { raisonSociale: 'Bravo Essai S4c' })).body;
    const C = (await dossier(cabinet.tok, espaceId, { raisonSociale: 'Charlie Essai S4c' })).body;
    check('trois dossiers du titulaire (A, B, C)', !!A?.id && !!B?.id && !!C?.id && A.acces?.length === 1, JSON.stringify([A?.id, B?.id, C?.id]));
    r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client S4c', email: CLIENT, telephone: '20 555 092', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    const client = await activer(CLIENT);
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 2 });
    const espaceClient = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [client.id])).rows[0]?.id;
    check('client LabFlow avec le module (2 gérants comptables supplémentaires)', !!client.tok && r.status === 200 && !!espaceClient, `${r.status} ${r.body?.message || ''}`);
    const ME = (await pool.query(`SELECT id, nom FROM compta.dossiers WHERE espace_id = $1 AND source = 'labflow'`, [espaceClient])).rows[0];
    const F = (await dossier(client.tok, espaceClient, { raisonSociale: 'Foxtrot du client S4c' })).body;
    check('le client a son dossier « Mon entreprise » et un deuxième (F)', !!ME?.id && !!F?.id, JSON.stringify([ME?.id, F?.id]));

    // ── « Mes gérants » : le réglage à l'ajout ──
    r = await appel('GET', '/api/compta/cabinet/gerants', cabinet.tok);
    check('« Mes gérants » : les dossiers du cabinet (catalogue de 3, nom, matricule, état)', r.status === 200 && r.body?.dossiers?.length === 3 && r.body.dossiers[0].nom === 'Alpha Essai S4c'
      && r.body.dossiers[0].matriculeFiscal === '1234567A/A/M/000' && r.body.dossiers[0].etat === 'actif' && r.body.dossiers[0].id === A.id, JSON.stringify(r.body?.dossiers));
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'G1 Tous', email: G1, niveau: 'saisie', dossiers: 'tous' });
    const g1 = r.body?.gerants?.find((g) => g.email === G1);
    check('G1 ajouté avec « tous » (201)', r.status === 201 && g1?.dossiers === 'tous', `${r.status} ${JSON.stringify(g1?.dossiers)} ${r.body?.message || ''}`);
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'G2 Complet', email: G2, niveau: 'complet' });
    const g2 = r.body?.gerants?.find((g) => g.email === G2);
    check('G2 ajouté SANS réglage : « Choisir », liste vide (réponse 2)', r.status === 201 && memes(g2?.dossiers, []), `${r.status} ${JSON.stringify(g2?.dossiers)} ${r.body?.message || ''}`);
    const ja = await journal(espaceId, 'acces_attribue');
    check('journal : acces_attribue porte dossiers: []', memes(ja?.details?.dossiers, []), JSON.stringify(ja?.details));
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Mauvais', email: G3, niveau: 'saisie', dossiers: 'x' });
    check('réglage invalide : 400, aucune place prise', r.status === 400 && (await appel('GET', '/api/compta/cabinet/gerants', cabinet.tok)).body?.places?.utilisees === 2, String(r.status));
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Mauvais', email: G3, niveau: 'saisie', dossiers: [A.id, 999999999] });
    const nbApres = (await pool.query(`SELECT COUNT(*)::int AS n FROM compta.acces WHERE espace_id = $1 AND role = 'gerant'`, [espaceId])).rows[0].n;
    const g3Compte = (await pool.query('SELECT 1 FROM utilisateurs WHERE LOWER(email) = $1', [G3])).rows.length;
    check('dossier inconnu à l\'ajout : 409 DOSSIER_INCONNU, tout est défait (ni accès ni compte créé)', r.status === 409 && r.body?.code === 'DOSSIER_INCONNU' && nbApres === 2 && g3Compte === 0, `${r.status} ${r.body?.code} accès=${nbApres} compte=${g3Compte}`);
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'G3 Liste', email: G3, niveau: 'saisie', dossiers: [String(B.id), A.id, A.id] });
    const g3 = r.body?.gerants?.find((g) => g.email === G3);
    check('G3 ajouté avec une liste (chaînes, doublons) : [A, B] triée', r.status === 201 && memes(g3?.dossiers, [A.id, B.id].sort((a, b) => a - b)), `${r.status} ${JSON.stringify(g3?.dossiers)} ${r.body?.message || ''}`);
    check('… en base : deux lignes acces_dossiers, tous_dossiers faux', memes(await lignesAcces(g3.id), [A.id, B.id].sort((a, b) => a - b)) && (await accesRow(g3.id)).tous_dossiers === false);
    const [p1, p2, p3] = [await activer(G1), await activer(G2), await activer(G3)];
    check('connexion des collaborateurs', !!p1.tok && !!p2.tok && !!p3.tok);

    // ── Chacun ne voit que ses dossiers ──
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, p1.tok);
    check('G1 (tous) : les 3 dossiers', r.status === 200 && r.body?.dossiers?.length === 3, noms(r));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, p2.tok);
    check('G2 (liste vide, Complet) : aucun dossier, mais le droit de créer', r.status === 200 && r.body?.dossiers?.length === 0 && r.body?.droits?.creer === true, `${noms(r)} ${JSON.stringify(r.body?.droits)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, p2.tok);
    check('G2 : la fiche de A est introuvable (404)', r.status === 404, String(r.status));
    r = await appel('GET', '/api/compta/acces', p2.tok);
    check('G2 garde sa carte « Cabinet » sur l\'accueil (réponse du client)', r.status === 200 && r.body?.cabinets?.length === 1, JSON.stringify(r.body?.cabinets));
    r = await appel('GET', `/api/compta/cabinets/${espaceId}`, p2.tok);
    check('page « Cabinet » de G2 : tousDossiers faux', r.status === 200 && r.body?.acces?.tousDossiers === false, JSON.stringify(r.body?.acces));
    r = await appel('GET', `/api/compta/cabinets/${espaceId}`, p1.tok);
    check('page « Cabinet » de G1 : tousDossiers vrai', r.status === 200 && r.body?.acces?.tousDossiers === true, JSON.stringify(r.body?.acces));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, p3.tok);
    check('G3 (liste) : A et B seulement', r.status === 200 && noms(r) === 'Alpha Essai S4c|Bravo Essai S4c', noms(r));
    r = await appel('GET', `/api/compta/dossiers/${C.id}`, p3.tok);
    check('G3 : la fiche de C est introuvable (404)', r.status === 404, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${C.id}`, p3.tok, { identite: { ville: 'Sfax' } });
    check('G3 : modifier C (caché) : 404, jamais 403', r.status === 404, String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${C.id}/archiver`, p3.tok);
    check('G3 : archiver C (caché) : 404', r.status === 404, String(r.status));
    r = await appel('DELETE', `/api/compta/dossiers/${C.id}`, p3.tok);
    check('G3 : supprimer C (caché) : 404', r.status === 404, String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/reprendre-identite`, p2.tok);
    check('G2 (Complet, liste vide) : reprendre l\'identité de A (caché) : 404', r.status === 404, String(r.status));
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, p3.tok);
    const emailsAcces = (r.body?.acces || []).map((a) => a.email).sort();
    check('fiche de A (vue par G3) : carte « Accès » = titulaire, G1 et G3 — pas G2', r.status === 200 && memes(emailsAcces, [CABINET, G1, G3].sort()), JSON.stringify(emailsAcces));

    // ── Un dossier créé par G2 lui est ouvert ; aucune fuite du matricule ──
    r = await dossier(p2.tok, espaceId, { raisonSociale: 'Delta de G2', matriculeFiscal: '1234567A/A/M/000' });
    const D = r.body;
    check('G2 crée D (201) : ouvert à lui (carte « Accès » le montre), AUCUN avertissement « déjà porté » (A ne lui est pas ouvert)',
      r.status === 201 && D?.acces?.some((a) => a.email === G2) && D?.avertissements?.length === 0, `${r.status} ${JSON.stringify(D?.avertissements)} ${r.body?.message || ''}`);
    const jc = await journal(espaceId, 'dossier_cree');
    check('journal : dossier_cree avec ouvertA = l\'accès de G2', jc?.details?.dossier === D?.id && jc?.details?.ouvertA === g2.id, JSON.stringify(jc?.details));
    check('… en base : ligne acces_dossiers (G2, D)', memes(await lignesAcces(g2.id), [D.id]));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, p2.tok);
    check('G2 voit D, et lui seul', noms(r) === 'Delta de G2', noms(r));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, p1.tok);
    check('G1 (tous) voit aussi D : 4 dossiers', r.body?.dossiers?.length === 4, noms(r));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, p3.tok);
    check('G3 ne voit pas D', r.body?.dossiers?.length === 2, noms(r));
    r = await dossier(cabinet.tok, espaceId, { raisonSociale: 'Echo du titulaire', matriculeFiscal: '1234567A/A/M/000' });
    check('le titulaire, lui, est averti des deux dossiers de même matricule (A et D)', r.status === 201 && r.body?.avertissements?.length === 2, JSON.stringify(r.body?.avertissements));
    const E = r.body;

    // ── Modifier le réglage ──
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, { dossiers: [C.id, A.id, B.id] });
    let g3b = r.body?.gerants?.find((g) => g.id === g3.id);
    check('G3 passé à [A, B, C] (200)', r.status === 200 && memes(g3b?.dossiers, [A.id, B.id, C.id].sort((a, b) => a - b)), `${r.status} ${JSON.stringify(g3b?.dossiers)} ${r.body?.message || ''}`);
    let jd = await journal(espaceId, 'acces_dossiers_modifies');
    check('journal : acces_dossiers_modifies, avant [A, B] / après [A, B, C], personne G3', jd?.details?.acces === g3.id && jd?.details?.personne === p3.id
      && memes(jd?.details?.avant, [A.id, B.id].sort((a, b) => a - b)) && memes(jd?.details?.apres, [A.id, B.id, C.id].sort((a, b) => a - b)), JSON.stringify(jd?.details));
    const nbAvant = await nbJournal(espaceId, 'acces_dossiers_modifies');
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, { dossiers: [A.id, B.id, C.id] });
    check('même réglage renvoyé : 200, aucune ligne de journal en plus', r.status === 200 && (await nbJournal(espaceId, 'acces_dossiers_modifies')) === nbAvant, String(r.status));
    const nbAvantNiveau = await nbJournal(espaceId, 'acces_dossiers_modifies');
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, { niveau: 'complet', dossiers: null });
    g3b = r.body?.gerants?.find((g) => g.id === g3.id);
    check('changer le niveau seul (dossiers: null = pas de changement) : les dossiers ne bougent pas, aucune ligne de journal des dossiers', r.status === 200 && g3b?.niveau === 'complet'
      && memes(g3b?.dossiers, [A.id, B.id, C.id].sort((a, b) => a - b)) && (await nbJournal(espaceId, 'acces_dossiers_modifies')) === nbAvantNiveau, JSON.stringify(g3b));
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, { dossiers: [A.id, 999999999] });
    check('dossier inconnu : 409 DOSSIER_INCONNU, réglage inchangé', r.status === 409 && r.body?.code === 'DOSSIER_INCONNU' && memes(await lignesAcces(g3.id), [A.id, B.id, C.id].sort((a, b) => a - b)), `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, { dossiers: [F.id] });
    check('dossier d\'une autre comptabilité (celui du client) : 409, jamais écrit', r.status === 409 && r.body?.code === 'DOSSIER_INCONNU' && !(await lignesAcces(g3.id)).includes(F.id), `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, { dossiers: 'x' });
    check('réglage invalide : 400', r.status === 400, String(r.status));
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, {});
    check('corps vide : 400', r.status === 400, String(r.status));
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, { dossiers: 'tous' });
    g3b = r.body?.gerants?.find((g) => g.id === g3.id);
    jd = await journal(espaceId, 'acces_dossiers_modifies');
    check('G3 passé à « tous » : journal après = tous, plus aucune ligne acces_dossiers', r.status === 200 && g3b?.dossiers === 'tous' && jd?.details?.apres === 'tous' && (await lignesAcces(g3.id)).length === 0 && (await accesRow(g3.id)).tous_dossiers === true, JSON.stringify(jd?.details));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, p3.tok);
    check('G3 voit maintenant les 5 dossiers (D de G2 et E compris)', r.body?.dossiers?.length === 5, noms(r));
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, { dossiers: [] });
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, p3.tok);
    check('G3 passé à une liste vide : plus rien', r.status === 200 && r.body?.dossiers?.length === 0, noms(r));
    r = await appel('GET', '/api/compta/acces', p3.tok);
    check('… mais sa carte « Cabinet » reste', r.body?.cabinets?.length === 1, JSON.stringify(r.body?.cabinets));

    // ── Réattribution : le réglage suit l'accès ──
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, { nom: 'G4 Reprise', email: G4, niveau: 'saisie' });
    g3b = r.body?.gerants?.find((g) => g.id === g3.id);
    const jr = await journal(espaceId, 'acces_reattribue');
    check('accès de G3 donné à G4 sans réglage : la liste vide est gardée (journal acces_reattribue, dossiers [])', r.status === 200 && g3b?.email === G4 && memes(g3b?.dossiers, []) && memes(jr?.details?.dossiers, []), `${r.status} ${JSON.stringify(g3b)} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, { nom: 'G3 Retour', email: G3, niveau: 'saisie', dossiers: [B.id] });
    g3b = r.body?.gerants?.find((g) => g.id === g3.id);
    jd = await journal(espaceId, 'acces_dossiers_modifies');
    check('rendu à G3 avec [B] : réglage appliqué, journal des dossiers au nom de G3', r.status === 200 && g3b?.email === G3 && memes(g3b?.dossiers, [B.id]) && jd?.details?.personne === p3.id && memes(jd?.details?.apres, [B.id]), `${r.status} ${JSON.stringify(jd?.details)}`);
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, p3.tok);
    check('G3 voit B', noms(r) === 'Bravo Essai S4c', noms(r));
    await appel('POST', `/api/compta/cabinet/gerants/${g3.id}/desactiver`, cabinet.tok);
    r = await appel('POST', `/api/compta/cabinet/gerants/${g3.id}/reactiver`, cabinet.tok);
    g3b = r.body?.gerants?.find((g) => g.id === g3.id);
    check('désactivé puis réactivé : le réglage [B] est gardé tel quel', r.status === 200 && g3b?.etat === 'actif' && memes(g3b?.dossiers, [B.id]), JSON.stringify(g3b?.dossiers));

    // ── Dossier supprimé : la ligne part avec lui ; garde par comptabilité (404 avant 403 sur un dossier caché) ──
    r = await appel('DELETE', `/api/compta/dossiers/${B.id}`, cabinet.tok);
    const js = await journal(espaceId, 'dossier_supprime');
    check('journal : dossier_supprime nomme l\'accès de G3 qui l\'avait (ouvertA)', memes(js?.details?.ouvertA, [g3.id]), JSON.stringify(js?.details));
    r = await appel('GET', '/api/compta/cabinet/gerants', cabinet.tok);
    g3b = r.body?.gerants?.find((g) => g.id === g3.id);
    check('B supprimé : G3 revient à une liste vide, catalogue à 4', r.status === 200 && memes(g3b?.dossiers, []) && r.body?.dossiers?.length === 4 && (await lignesAcces(g3.id)).length === 0, JSON.stringify([g3b?.dossiers, r.body?.dossiers?.length]));
    await mode(cabinet.id, 'read_only');
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, { dossiers: 'tous' });
    check('lecture seule : changer les dossiers est refusé (403 READ_ONLY)', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/dossiers/${C.id}`, p3.tok, { identite: { ville: 'Sfax' } });
    check('lecture seule : un dossier caché reste « introuvable » pour G3 (404 avant le 403 : pas d\'oracle d\'existence)', r.status === 404, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${C.id}`, p1.tok, { identite: { ville: 'Sfax' } });
    check('lecture seule : un dossier visible répond 403 READ_ONLY (G1, tous)', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    await mode(cabinet.id, 'actif');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    r = await appel('GET', '/api/compta/cabinet/gerants', cabinet.tok);
    check('un dossier archivé reste dans le catalogue, marqué archive, classé après', r.body?.dossiers?.find((d) => d.id === A.id)?.etat === 'archive' && r.body?.dossiers?.[r.body.dossiers.length - 1]?.id === A.id, JSON.stringify(r.body?.dossiers?.map((d) => [d.nom, d.etat])));
    r = await appel('PUT', `/api/compta/cabinet/gerants/${g3.id}`, cabinet.tok, { dossiers: [A.id] });
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, p3.tok);
    check('… et s\'ouvre à un collaborateur (G3 voit A, archivé)', r.body?.dossiers?.length === 1 && r.body.dossiers[0].etat === 'archive', noms(r));

    // ── Côté client : « Ma comptabilité » ──
    r = await appel('GET', '/api/compta/ma-comptabilite', client.tok);
    const obligatoire = r.body?.comptables?.find((c) => c.obligatoire);
    check('« Ma comptabilité » : catalogue des dossiers (« Mon entreprise », F) ; comptable obligatoire à désigner, « tous »', r.status === 200 && r.body?.dossiers?.length === 2 && r.body.dossiers.some((d) => d.source === 'labflow')
      && obligatoire?.dossiers === 'tous', JSON.stringify([r.body?.dossiers?.map((d) => d.nom), obligatoire?.dossiers]));
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, client.tok, { nom: 'Comptable S4c', email: COMPTABLE, niveau: 'saisie' });
    check('comptable désigné (depuis la page Gérants de LabFlow, sans réglage) : « tous » (réponse 4)', r.status === 200 && r.body?.comptables?.find((c) => c.obligatoire)?.dossiers === 'tous' && r.body?.dossiers?.length === 2, `${r.status} ${r.body?.message || ''}`);
    const comptable = await activer(COMPTABLE);
    r = await appel('GET', `/api/compta/espaces/${espaceClient}/dossiers`, comptable.tok);
    check('le comptable voit les 2 dossiers du client', r.status === 200 && r.body?.dossiers?.length === 2, noms(r));
    r = await appel('GET', `/api/compta/confiees/${espaceClient}`, comptable.tok);
    check('page « Comptabilité de … » : tousDossiers vrai', r.status === 200 && r.body?.acces?.tousDossiers === true, JSON.stringify(r.body?.acces));
    r = await appel('POST', '/api/compta/mes-comptables', client.tok, { nom: 'Supp S4c', email: SUPP, niveau: 'complet' });
    const supp = r.body?.comptables?.find((c) => c.email === SUPP);
    check('gérant comptable supplémentaire ajouté sans réglage : liste vide (réponse du client du 07/10)', r.status === 201 && memes(supp?.dossiers, []), `${r.status} ${JSON.stringify(supp?.dossiers)} ${r.body?.message || ''}`);
    const ps = await activer(SUPP);
    r = await appel('GET', `/api/compta/espaces/${espaceClient}/dossiers`, ps.tok);
    check('… il ne voit aucun dossier', r.status === 200 && r.body?.dossiers?.length === 0, noms(r));
    r = await appel('GET', `/api/compta/confiees/${espaceClient}`, ps.tok);
    check('… sa page « Comptabilité de … » : tousDossiers faux, la carte reste sur l\'accueil', r.status === 200 && r.body?.acces?.tousDossiers === false && (await appel('GET', '/api/compta/acces', ps.tok)).body?.confiees?.length === 1, JSON.stringify(r.body?.acces));
    r = await appel('POST', '/api/compta/mes-comptables', client.tok, { nom: 'Supp2 S4c', email: SUPP2, niveau: 'saisie', dossiers: 'tous' });
    const supp2 = r.body?.comptables?.find((c) => c.email === SUPP2);
    check('gérant comptable supplémentaire ajouté avec « tous » (réglage envoyé)', r.status === 201 && supp2?.dossiers === 'tous', `${r.status} ${JSON.stringify(supp2?.dossiers)} ${r.body?.message || ''}`);
    r = await appel('DELETE', `/api/compta/mes-comptables/${supp2.id}`, client.tok);
    check('… retiré', r.status === 200, String(r.status));
    await mode(client.id, 'read_only');
    r = await appel('PUT', `/api/compta/mes-comptables/${supp.id}`, client.tok, { dossiers: [ME.id] });
    check('client en lecture seule : régler les dossiers est refusé (403 READ_ONLY)', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    r = await appel('GET', '/api/compta/ma-comptabilite', client.tok);
    check('« Ma comptabilité » dit l\'état de l\'abonnement (« Régler » fermé à l\'écran)', r.status === 200 && r.body?.etatAbonnement === 'lecture_seule', JSON.stringify(r.body?.etatAbonnement));
    await mode(client.id, 'actif');
    r = await appel('PUT', `/api/compta/mes-comptables/${supp.id}`, client.tok, { dossiers: [ME.id] });
    check('le client lui ouvre « Mon entreprise » depuis « Ma comptabilité » (200)', r.status === 200 && memes(r.body?.comptables?.find((c) => c.id === supp.id)?.dossiers, [ME.id]) && r.body?.etatAbonnement === undefined, `${r.status} ${r.body?.message || ''}`);
    jd = await journal(espaceClient, 'acces_dossiers_modifies');
    check('journal côté client : avant [] / après [Mon entreprise]', memes(jd?.details?.avant, []) && memes(jd?.details?.apres, [ME.id]) && jd?.details?.personne === ps.id, JSON.stringify(jd?.details));
    const nbModif = await nbJournal(espaceClient, 'acces_modifie');
    check('… sans ligne acces_modifie inutile (seul `dossiers` envoyé)', nbModif === 0, String(nbModif));
    r = await appel('GET', `/api/compta/espaces/${espaceClient}/dossiers`, ps.tok);
    check('le gérant comptable voit « Mon entreprise » seulement', r.body?.dossiers?.length === 1 && r.body.dossiers[0].id === ME.id, noms(r));
    r = await dossier(ps.tok, espaceClient, { raisonSociale: 'Golf du gérant comptable' });
    check('il crée un dossier (Complet) : ouvert à lui, 2 dossiers', r.status === 201 && (await appel('GET', `/api/compta/espaces/${espaceClient}/dossiers`, ps.tok)).body?.dossiers?.length === 2, `${r.status} ${r.body?.message || ''}`);
    const Gd = r.body;
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, client.tok, { dossiers: [F.id] });
    check('le client restreint son comptable à F (200)', r.status === 200 && memes(r.body?.comptables?.find((c) => c.obligatoire)?.dossiers, [F.id]), `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', `/api/compta/espaces/${espaceClient}/dossiers`, comptable.tok);
    check('le comptable ne voit plus que F', noms(r) === 'Foxtrot du client S4c', noms(r));
    r = await appel('GET', `/api/compta/dossiers/${Gd.id}`, comptable.tok);
    check('… la fiche du dossier du gérant comptable lui est introuvable', r.status === 404, String(r.status));
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, client.tok, { dossiers: [A.id] });
    check('un dossier du cabinet refusé chez le client : 409', r.status === 409 && r.body?.code === 'DOSSIER_INCONNU', `${r.status} ${r.body?.code}`);
    // Relecture : remplacer son comptable depuis la page Gérants de LabFlow (sans réglage) ne garde pas la liste restreinte.
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, client.tok, { nom: 'Comptable 2', email: COMPTABLE2, niveau: 'complet' });
    const jr2 = await journal(espaceClient, 'acces_reattribue');
    jd = await journal(espaceClient, 'acces_dossiers_modifies');
    check('comptable remplacé depuis LabFlow (sans réglage) : l\'accès obligatoire revient à « tous » (journal avant [F] / après tous)', r.status === 200 && r.body?.comptables?.find((c) => c.obligatoire)?.dossiers === 'tous'
      && jr2?.details?.dossiers === 'tous' && memes(jd?.details?.avant, [F.id]) && jd?.details?.apres === 'tous' && (await accesRow(obligatoire.id))?.tous_dossiers === true, `${r.status} ${JSON.stringify([jr2?.details, jd?.details])}`);
    check('… journal : la ligne d\'attribution précède celle des dossiers', !!jr2 && !!jd && jr2.id < jd.id, JSON.stringify([jr2?.id, jd?.id]));
    r = await appel('DELETE', `/api/compta/mes-comptables/${obligatoire.id}`, client.tok);
    let row = await accesRow(obligatoire.id);
    check('comptable retiré : l\'accès obligatoire revient à « tous », sans ligne acces_dossiers', r.status === 200 && row?.etat === 'a_attribuer' && row?.tous_dossiers === true && (await lignesAcces(obligatoire.id)).length === 0
      && r.body?.comptables?.find((c) => c.obligatoire)?.dossiers === 'tous', JSON.stringify(row));
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, client.tok, { dossiers: [ME.id] });
    check('régler les dossiers d\'un accès « à désigner » : 409 ACCES_VIDE', r.status === 409 && r.body?.code === 'ACCES_VIDE', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, client.tok, { nom: 'Comptable S4c', email: COMPTABLE, niveau: 'complet', dossiers: [ME.id] });
    check('comptable désigné de nouveau avec un réglage : [Mon entreprise]', r.status === 200 && memes(r.body?.comptables?.find((c) => c.obligatoire)?.dossiers, [ME.id]), `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', `/api/compta/confiees/${espaceClient}/quitter`, comptable.tok);
    row = await accesRow(obligatoire.id);
    check('le comptable quitte : l\'accès revient à « tous »', r.status === 200 && row?.tous_dossiers === true && (await lignesAcces(obligatoire.id)).length === 0, JSON.stringify(row));
    r = await appel('DELETE', `/api/compta/mes-comptables/${supp.id}`, client.tok);
    check('gérant comptable supplémentaire retiré : l\'accès disparaît (lignes en cascade)', r.status === 200 && (await pool.query('SELECT 1 FROM compta.acces_dossiers WHERE acces_id = $1', [supp.id])).rows.length === 0, String(r.status));
    r = await appel('GET', '/api/compta/mes-comptables', client.tok);
    check('page Gérants de LabFlow (GET /mes-comptables) : inchangée pour l\'essentiel, dossiers en plus', r.status === 200 && r.body?.comptables?.length === 1 && r.body?.supplementaires?.utilises === 0 && Array.isArray(r.body?.dossiers), JSON.stringify(r.body?.supplementaires));
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: false });
    r = await appel('PUT', `/api/compta/mes-comptables/${obligatoire.id}`, client.tok, { dossiers: 'tous' });
    check('module désactivé : comptabilité fermée, réglage introuvable (404 MODULE_INACTIF)', r.status === 404 && r.body?.code === 'MODULE_INACTIF', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 2 });
    check('module réactivé : les réglages des accès sont intacts (comptable à désigner, « tous »)', r.status === 200 && (await accesRow(obligatoire.id))?.tous_dossiers === true, String(r.status));

    // ── Migration 210 (manuel seul) : fiches complétées, 2e passage sans effet ──
    const sql210 = fs.readFileSync(path.join(__dirname, '..', 'migrations', '210_compta_dossiers_collaborateurs.sql'), 'utf8');
    await pool.query(sql210);
    const fiches = async () => (await pool.query(`SELECT slug, md5(contenu_defaut) AS empreinte, position('Tous les dossiers' in contenu_defaut) > 0 AS s4c, contenu = contenu_defaut AS suit
      FROM manuel_sections WHERE produit = 'compta' AND slug IN ('compta-gerants', 'compta-ma-comptabilite', 'compta-confiee', 'compta-cabinet-membre') ORDER BY slug`)).rows;
    const f1 = await fiches();
    check('manuel : les 4 fiches parlent des dossiers de chaque accès et le texte servi suit', f1.length === 4 && f1.every((f) => f.s4c && f.suit), JSON.stringify(f1.map((f) => [f.slug, f.s4c, f.suit])));
    await pool.query(sql210);
    const f2 = await fiches();
    check('… 2e passage : empreintes identiques (idempotente)', memes(f1.map((f) => f.empreinte), f2.map((f) => f.empreinte)));
    check('aucune table ne change (acces_dossiers existe depuis la 208)', !!(await pool.query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'compta' AND table_name = 'acces_dossiers'`)).rows.length);
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
