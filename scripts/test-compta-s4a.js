/* Test E2E local — LabFlow Compta, étape S4a « Les dossiers du cabinet » (labflow-reprise/achats-compta/PLAN-S4.md ;
 * SPEC-SOCLE §3.2, D3, D4, D10, D16, D17).
 *   le titulaire du cabinet crée des dossiers (identité, régime fiscal, premier exercice et ses périodes mensuelles,
 *   exercice décalé) ; avertissement « matricule déjà porté » ; la liste et la fiche selon l'accès (collaborateurs,
 *   personne étrangère : introuvable) ; droits par niveau (réponse du client du 07/10 : Complet crée et modifie, Saisie
 *   lit, archiver / désarchiver / supprimer = titulaire) ; dossier archivé non modifiable ; garde par comptabilité
 *   (lecture seule) ; D10 : un cabinet ou un client qui a un dossier ne se supprime pas ; « Mon cabinet » et la fiche
 *   admin comptent les dossiers ; suppression d'un dossier vide (cascade des exercices) ; journal.
 * Crée un super_admin, un cabinet (2 gérants achetés), deux collaborateurs et un client LabFlow (module Comptabilité)
 * temporaires ; règle les tarifs Compta le temps de l'essai, puis restaure et nettoie.
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
  const ADMIN = 'test-admin-compta-s4a@example.com';
  const CLIENT = 'test-client-compta-s4a@example.com';
  const CABINET = 'test-cabinet-compta-s4a@example.com';
  const SAISIE = 'test-saisie-compta-s4a@example.com';
  const COMPLET = 'test-complet-compta-s4a@example.com';
  const COMPTABLE_CLIENT = 'test-comptable-client-s4a@example.com';
  const TOUS = [ADMIN, CLIENT, CABINET, SAISIE, COMPLET, COMPTABLE_CLIENT];
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  let adminTok = null;
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [TOUS])).rows.map((r) => r.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
      // D10 : les dossiers retiennent leur comptabilité (RESTRICT) — l'essai efface les siens d'abord.
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
  const mode = (id, m) => pool.query('UPDATE abonnements SET mode_compte = $2 WHERE client_id = $1', [id, m]);
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };
  const IDENTITE_A = { raisonSociale: 'Boulangerie Essai S4a', formeJuridique: 'SARL', matriculeFiscal: '1234567A/A/M/000', rne: 'B123', adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' };
  const REGIME = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const CIVIL = { debut: '2026-01-01', fin: '2026-12-31' };

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S4a', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (2 gérants achetés) avec deux collaborateurs, un client LabFlow (module) ──
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S4a', email: CABINET, telephone: '20 555 081', raisonSociale: 'Cabinet Essai S4a', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S4a', representantQualite: 'Gérant', nbGerants: 2,
    });
    check('création du cabinet (2 gérants achetés)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const cabinet = await activer(CABINET);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    check('connexion du titulaire', !!cabinet.tok && !!espaceId);
    // S4c : un collaborateur ajouté sans réglage ne voit aucun dossier ; ce scénario d'avant S4c (« les collaborateurs
    // voient tous les dossiers ») les crée avec « tous », comme les collaborateurs déjà en place (réponse 2 du 07/10).
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Saisie', email: SAISIE, niveau: 'saisie', dossiers: 'tous' });
    check('collaborateur de niveau Saisie', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const accesSaisie = r.body?.gerants?.find((g) => g.email === SAISIE)?.id;
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Complet', email: COMPLET, niveau: 'complet', dossiers: 'tous' });
    check('collaborateur de niveau Complet', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const saisie = await activer(SAISIE);
    const complet = await activer(COMPLET);
    check('connexion des collaborateurs', !!saisie.tok && !!complet.tok);
    r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client S4a', email: CLIENT, telephone: '20 555 082', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    const client = await activer(CLIENT);
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 0 });
    const espaceClient = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [client.id])).rows[0]?.id;
    check('client LabFlow avec le module Comptabilité', !!client.tok && r.status === 200 && !!espaceClient, `${r.status} ${r.body?.message || ''}`);

    // ── La liste, vide, selon l'accès ──
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok);
    check('titulaire : liste vide, tous les droits, rôle et niveau', r.status === 200 && r.body?.dossiers?.length === 0 && r.body?.droits?.creer === true && r.body?.droits?.supprimer === true
      && r.body?.espace?.role === 'titulaire' && r.body?.etatAbonnement === 'actif', JSON.stringify(r.body));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, client.tok);
    check('un client LabFlow étranger au cabinet : 404', r.status === 404, String(r.status));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, adminTok);
    check('l\'admin (sans accès) : 404', r.status === 404, String(r.status));
    r = await appel('GET', '/api/compta/espaces/999999999/dossiers', cabinet.tok);
    check('comptabilité inconnue : 404', r.status === 404, String(r.status));

    // ── Création par le titulaire ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REGIME });
    check('sans exercice : 400', r.status === 400, `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: { ...IDENTITE_A, matriculeFiscal: '12345' }, regime: REGIME, exercice: CIVIL });
    check('matricule invalide : 400', r.status === 400 && /Matricule/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REGIME, exercice: { debut: '2026-01-01', fin: '2027-01-31' } });
    check('exercice de 13 mois : 400', r.status === 400 && /12 mois/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REGIME, exercice: { debut: '2026-13-01', fin: '2026-12-31' } });
    check('date mal formée (13e mois) : 400, jamais 500', r.status === 400 && /début invalide/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: { ...REGIME, debutActivite: '2026-02-32' }, exercice: CIVIL });
    check('début d\'activité mal formé : 400', r.status === 400 && /Début d'activité/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REGIME, exercice: CIVIL });
    const A = r.body;
    check('dossier A créé (201) : identité, régime, exercice civil, 12 périodes ouvertes', r.status === 201 && A?.nom === 'Boulangerie Essai S4a' && A?.identite?.matriculeFiscal === '1234567A/A/M/000'
      && A?.identiteComplete === true && A?.regime?.impot === 'IS' && A?.regime?.teledeclaration === true && A?.regime?.debutActivite === '2020-01-15'
      && A?.exercice?.debut === '2026-01-01' && A?.exercice?.fin === '2026-12-31' && A?.exercice?.periodes?.length === 12 && A?.exercice?.periodes?.every((p) => p.etat === 'ouverte')
      && A?.etat === 'actif' && A?.source === 'saisi' && A?.pays === 'TN' && A?.devise === 'TND' && A?.decimales === 3 && A?.avertissements?.length === 0, `${r.status} ${JSON.stringify(r.body)}`);
    check('… accès : le titulaire et les deux collaborateurs (tous les dossiers)', A?.acces?.length === 3 && A?.acces?.[0]?.role === 'titulaire' && A?.acces?.some((a) => a.email === SAISIE && a.niveau === 'saisie'), JSON.stringify(A?.acces));
    check('journal : dossier_cree et exercice_cree', !!(await journal(espaceId, 'dossier_cree')) && !!(await journal(espaceId, 'exercice_cree')));
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: { ...IDENTITE_A, raisonSociale: 'Société Bis', nomCommercial: 'Chez Bis', matriculeFiscal: '1234567A' }, regime: REGIME, exercice: CIVIL });
    const B = r.body;
    check('dossier B : même identifiant de matricule → avertissement (jamais un refus) ; nom = nom commercial', r.status === 201 && B?.nom === 'Chez Bis'
      && B?.avertissements?.some((a) => /déjà porté par le dossier « Boulangerie Essai S4a »/.test(a)) && B?.identiteComplete === true, `${r.status} ${JSON.stringify(B?.avertissements)}`);
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, {
      identite: { raisonSociale: 'Mohamed Essai', formeJuridique: 'EI' }, regime: { personne: 'physique', impot: 'IRPP', tva: 'forfaitaire' }, exercice: { debut: '2026-07-15', fin: '2027-06-30' },
    });
    const C = r.body;
    check('dossier C : identité minimale (à compléter), exercice décalé du 15/07 au 30/06 → 12 périodes, la 1re du 15 au 31 juillet', r.status === 201 && C?.identiteComplete === false
      && C?.exercice?.periodes?.length === 12 && C?.exercice?.periodes?.[0]?.debut === '2026-07-15' && C?.exercice?.periodes?.[0]?.fin === '2026-07-31'
      && C?.exercice?.periodes?.[11]?.debut === '2027-06-01' && C?.regime?.exportateurTotal === false, `${r.status} ${JSON.stringify(C?.exercice)}`);

    // ── Lecture selon l'accès ──
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok);
    check('liste du titulaire : 3 dossiers, triés par nom, exercice en cours et identité complète ou non', r.body?.dossiers?.length === 3 && r.body.dossiers.map((d) => d.nom).join('|') === 'Boulangerie Essai S4a|Chez Bis|Mohamed Essai'
      && r.body.dossiers[0].exercice?.fin === '2026-12-31' && r.body.dossiers[2].identiteComplete === false, JSON.stringify(r.body?.dossiers));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, saisie.tok);
    check('collaborateur Saisie : la liste (3), sans droit de créer', r.status === 200 && r.body?.dossiers?.length === 3 && r.body?.droits?.creer === false && r.body?.espace?.niveau === 'saisie', JSON.stringify(r.body?.droits));
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, saisie.tok);
    check('… et la fiche de A, sans droits d\'écriture', r.status === 200 && r.body?.id === A.id && r.body?.droits?.modifier === false, `${r.status}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, client.tok);
    check('personne étrangère : la fiche est introuvable (404, jamais 403)', r.status === 404, String(r.status));
    r = await appel('GET', '/api/compta/dossiers/999999999', cabinet.tok);
    check('dossier inconnu : 404', r.status === 404, String(r.status));

    // ── Droits par niveau (réponse du 07/10) ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, saisie.tok, { identite: IDENTITE_A, regime: REGIME, exercice: CIVIL });
    check('Saisie : créer refusé (403 NIVEAU_INSUFFISANT)', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}`, saisie.tok, { identite: { ville: 'Sfax' } });
    check('Saisie : modifier refusé (403)', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, saisie.tok);
    check('Saisie : archiver refusé (403 TITULAIRE_SEUL)', r.status === 403 && r.body?.code === 'TITULAIRE_SEUL', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, complet.tok, { identite: { raisonSociale: 'Dossier du Complet' }, regime: REGIME, exercice: CIVIL });
    const D = r.body;
    check('Complet : crée un dossier (201)', r.status === 201 && D?.nom === 'Dossier du Complet' && D?.droits?.modifier === true && D?.droits?.archiver === false, `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/compta/dossiers/${D.id}`, complet.tok, { identite: { ville: 'Sousse', matriculeFiscal: '1234567A/A/M/000' }, regime: { tva: 'non_assujetti' } });
    check('Complet : modifie identité et régime (200), nom gardé, avertissement du matricule', r.status === 200 && r.body?.identite?.ville === 'Sousse' && r.body?.regime?.tva === 'non_assujetti' && r.body?.regime?.impot === 'IS'
      && r.body?.nom === 'Dossier du Complet' && r.body?.avertissements?.length >= 1, `${r.status} ${JSON.stringify(r.body)}`);
    const jm = await journal(espaceId, 'dossier_modifie');
    check('journal : dossier_modifie avec avant / après (D16)', !!jm && jm.details?.changements?.ville?.apres === 'Sousse' && jm.details?.changements?.ville?.avant === null
      && jm.details?.changements?.tva?.avant === 'reel' && jm.details?.changements?.tva?.apres === 'non_assujetti' && !jm.details?.changements?.impot, JSON.stringify(jm?.details));
    r = await appel('PUT', `/api/compta/dossiers/${D.id}`, complet.tok, { identite: {}, regime: {} });
    check('modifier avec des parties vides : 400, rien n\'est écrit', r.status === 400, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${D.id}`, complet.tok, { exercice: { debut: '2026-04-01', fin: '2026-12-31' } });
    check('Complet : change les dates de l\'exercice (sans écriture) → 9 périodes refaites', r.status === 200 && r.body?.exercice?.debut === '2026-04-01' && r.body?.exercice?.periodes?.length === 9
      && r.body?.exercices?.length === 1, `${r.status} ${JSON.stringify(r.body?.exercice)}`);
    check('journal : exercice_modifie', !!(await journal(espaceId, 'exercice_modifie')));
    const periodes = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.periodes p JOIN compta.exercices x ON x.id = p.exercice_id WHERE x.dossier_id = $1', [D.id])).rows[0].n;
    check('… en base : 9 périodes, pas une de plus', periodes === 9, String(periodes));
    r = await appel('POST', `/api/compta/dossiers/${D.id}/archiver`, complet.tok);
    check('Complet : archiver refusé (403 TITULAIRE_SEUL)', r.status === 403 && r.body?.code === 'TITULAIRE_SEUL', `${r.status} ${r.body?.code}`);
    r = await appel('DELETE', `/api/compta/dossiers/${D.id}`, complet.tok);
    check('Complet : supprimer refusé (403)', r.status === 403, String(r.status));

    // ── Titulaire : contrôles, archivage ──
    r = await appel('PUT', `/api/compta/dossiers/${A.id}`, cabinet.tok, {});
    check('modifier sans rien : 400', r.status === 400, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}`, cabinet.tok, { identite: { raisonSociale: '' } });
    check('vider la raison sociale : 400', r.status === 400, `${r.status} ${r.body?.message}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}`, cabinet.tok, { identite: { nomCommercial: 'La Boulange' } });
    check('nom commercial ajouté : le nom du dossier le suit', r.status === 200 && r.body?.nom === 'La Boulange', `${r.status} ${r.body?.nom}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    check('titulaire : archiver A (200, état « archive »)', r.status === 200 && r.body?.etat === 'archive', `${r.status} ${r.body?.message || ''}`);
    check('journal : dossier_archive', !!(await journal(espaceId, 'dossier_archive')));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}`, cabinet.tok, { identite: { ville: 'Sfax' } });
    check('un dossier archivé ne se modifie pas : 409 DOSSIER_ARCHIVE', r.status === 409 && r.body?.code === 'DOSSIER_ARCHIVE', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    check('archiver deux fois : 409', r.status === 409, String(r.status));
    // S4d : la liste ne rend les archivés que sur demande (`archives=1`) ; par défaut, A sort de la liste.
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok);
    check('liste par défaut : A archivé n\'y est plus (3 actifs), l\'en-tête compte 1 archivé', r.body?.dossiers?.length === 3 && r.body?.nbArchives === 1 && r.body?.nbActifs === 3, JSON.stringify(r.body?.dossiers?.map((d) => [d.nom, d.etat])));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?archives=1`, cabinet.tok);
    check('liste avec les archivés : A reste visible, état « archive », classé après les actifs', r.body?.dossiers?.length === 4 && r.body.dossiers[3].id === A.id && r.body.dossiers[3].etat === 'archive', JSON.stringify(r.body?.dossiers?.map((d) => [d.nom, d.etat])));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/desarchiver`, cabinet.tok);
    check('désarchiver A (200, état « actif »)', r.status === 200 && r.body?.etat === 'actif', `${r.status} ${r.body?.message || ''}`);
    check('journal : dossier_desarchive', !!(await journal(espaceId, 'dossier_desarchive')));

    // ── Collaborateur désactivé : plus rien ──
    await appel('POST', `/api/compta/cabinet/gerants/${accesSaisie}/desactiver`, cabinet.tok);
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, saisie.tok);
    check('collaborateur désactivé : la liste est introuvable (404)', r.status === 404, String(r.status));
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, saisie.tok);
    check('… et la fiche aussi', r.status === 404, String(r.status));
    await appel('POST', `/api/compta/cabinet/gerants/${accesSaisie}/reactiver`, cabinet.tok);
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, cabinet.tok);
    check('réactivé : la fiche de A compte de nouveau 3 accès', r.status === 200 && r.body?.acces?.length === 3, JSON.stringify(r.body?.acces));

    // ── Garde par comptabilité (D4) : lecture seule ──
    await mode(cabinet.id, 'read_only');
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REGIME, exercice: CIVIL });
    check('lecture seule : créer refusé (403 READ_ONLY)', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}`, cabinet.tok, { identite: { ville: 'Sfax' } });
    check('lecture seule : modifier refusé', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    check('lecture seule : archiver refusé', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    r = await appel('DELETE', `/api/compta/dossiers/${B.id}`, cabinet.tok);
    check('lecture seule : supprimer refusé', r.status === 403 && r.body?.code === 'READ_ONLY', `${r.status} ${r.body?.code}`);
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok);
    check('… la liste se lit et le dit', r.status === 200 && r.body?.etatAbonnement === 'lecture_seule' && r.body?.dossiers?.length === 4, JSON.stringify(r.body?.etatAbonnement));
    await mode(cabinet.id, 'actif');

    // ── D10 : rien de comptable ne disparaît ──
    r = await appel('GET', '/api/compta/cabinet', cabinet.tok);
    check('« Mon cabinet » compte 4 dossiers', r.status === 200 && r.body?.nbDossiers === 4, JSON.stringify(r.body?.nbDossiers));
    r = await appel('GET', `/admin/comptables/${cabinet.id}`, adminTok);
    check('fiche admin du cabinet : 4 dossiers', r.status === 200 && r.body?.nbDossiers === 4, JSON.stringify(r.body?.nbDossiers));
    r = await appel('DELETE', `/admin/comptables/${cabinet.id}`, adminTok);
    check('l\'admin ne supprime pas un cabinet qui a des dossiers : 409 DOSSIERS_EN_PLACE', r.status === 409 && r.body?.code === 'DOSSIERS_EN_PLACE', `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/espaces/${espaceClient}/dossiers`, client.tok, { identite: { raisonSociale: 'Entité du client' }, regime: REGIME, exercice: CIVIL });
    const E = r.body;
    check('un client LabFlow titulaire crée un dossier dans sa comptabilité (201)', r.status === 201 && E?.espace?.type === 'client_labflow' && E?.acces?.length === 1, `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', `/api/compta/dossiers/${E.id}`, cabinet.tok);
    check('le cabinet ne voit pas le dossier du client : 404', r.status === 404, String(r.status));
    r = await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    check('l\'admin ne supprime pas un client qui a un dossier : 409 DOSSIERS_EN_PLACE', r.status === 409 && r.body?.code === 'DOSSIERS_EN_PLACE', `${r.status} ${r.body?.message}`);
    check('… le client existe toujours, avec sa comptabilité', !!(await pool.query('SELECT 1 FROM compta.espaces WHERE id = $1', [espaceClient])).rows.length);
    r = await appel('DELETE', `/api/compta/dossiers/${E.id}`, client.tok);
    check('le client supprime son dossier vide (204)', r.status === 204, String(r.status));

    // ── Comptable du client (niveau Complet) : il crée un dossier chez le client ; comptabilité fermée (module désactivé) ──
    const accesClient = (await pool.query('SELECT id FROM compta.acces WHERE obligatoire AND espace_id = $1', [espaceClient])).rows[0]?.id;
    r = await appel('PUT', `/api/compta/mes-comptables/${accesClient}`, client.tok, { nom: 'Comptable du client', email: COMPTABLE_CLIENT, niveau: 'complet' });
    check('le client désigne son comptable (niveau Complet)', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    const comptableClient = await activer(COMPTABLE_CLIENT);
    r = await appel('POST', `/api/compta/espaces/${espaceClient}/dossiers`, comptableClient.tok, { identite: { raisonSociale: 'Dossier par le comptable' }, regime: REGIME, exercice: CIVIL });
    const F = r.body;
    check('le comptable du client crée un dossier chez le client (201), sans droit d\'archiver', r.status === 201 && F?.droits?.creer === true && F?.droits?.archiver === false, `${r.status} ${r.body?.message || ''}`);
    r = await appel('DELETE', `/api/compta/dossiers/${F.id}`, comptableClient.tok);
    check('… mais ne le supprime pas (403)', r.status === 403, String(r.status));
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: false });
    check('module désactivé par l\'admin : comptabilité fermée', r.status === 200 && r.body?.actif === false, `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', `/api/compta/espaces/${espaceClient}/dossiers`, client.tok);
    check('comptabilité fermée : la liste est introuvable, même pour son titulaire (404)', r.status === 404, String(r.status));
    r = await appel('GET', `/api/compta/dossiers/${F.id}`, comptableClient.tok);
    check('… et la fiche aussi, pour le comptable', r.status === 404, String(r.status));
    check('… le dossier existe toujours (rien de comptable ne disparaît)', !!(await pool.query('SELECT 1 FROM compta.dossiers WHERE id = $1', [F.id])).rows.length);
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 0 });
    r = await appel('GET', `/api/compta/espaces/${espaceClient}/dossiers`, client.tok);
    // S4b : le dossier « Mon entreprise » du client (créé d'office à l'activation) s'ajoute à celui du comptable.
    check('module réactivé : la comptabilité rouvre avec ses dossiers (celui du comptable et « Mon entreprise »)', r.status === 200 && r.body?.dossiers?.length === 2
      && r.body.dossiers.some((d) => d.source === 'labflow'), `${r.status} ${JSON.stringify(r.body?.dossiers?.map((d) => d.nom))}`);
    r = await appel('DELETE', `/api/compta/dossiers/${F.id}`, client.tok);
    check('le client supprime ce dossier (204)', r.status === 204, String(r.status));

    // ── Niveau Consultation : lit, n'écrit pas ──
    r = await appel('PUT', `/api/compta/cabinet/gerants/${accesSaisie}`, cabinet.tok, { niveau: 'consultation' });
    check('collaborateur passé en Consultation', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, saisie.tok);
    check('Consultation : la liste (200), sans droit', r.status === 200 && r.body?.droits?.creer === false && r.body?.espace?.niveau === 'consultation', JSON.stringify(r.body?.droits));
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, saisie.tok, { identite: IDENTITE_A, regime: REGIME, exercice: CIVIL });
    check('Consultation : créer refusé (403)', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', `${r.status} ${r.body?.code}`);

    // ── Suppression d'un dossier vide par le titulaire ──
    r = await appel('DELETE', `/api/compta/dossiers/${B.id}`, cabinet.tok);
    check('titulaire : supprimer B (204)', r.status === 204, String(r.status));
    const j = await journal(espaceId, 'dossier_supprime');
    check('journal : dossier_supprime avec le nom et le matricule', !!j && j.details?.nom === 'Chez Bis' && j.details?.matricule === '1234567A', JSON.stringify(j?.details));
    const restes = (await pool.query('SELECT (SELECT COUNT(*) FROM compta.exercices WHERE dossier_id = $1)::int AS ex, (SELECT COUNT(*) FROM compta.dossiers WHERE id = $1)::int AS d', [B.id])).rows[0];
    check('… exercices et périodes partis avec lui', restes.ex === 0 && restes.d === 0, JSON.stringify(restes));
    r = await appel('GET', `/api/compta/dossiers/${B.id}`, cabinet.tok);
    check('… la fiche de B est introuvable', r.status === 404, String(r.status));
    r = await appel('DELETE', `/api/compta/dossiers/${B.id}`, cabinet.tok);
    check('supprimer deux fois : 404', r.status === 404, String(r.status));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok);
    check('liste finale : 3 dossiers', r.body?.dossiers?.length === 3, JSON.stringify(r.body?.dossiers?.map((d) => d.nom)));

    // ── Les pages de S3c ne changent pas ──
    r = await appel('GET', `/api/compta/cabinets/${espaceId}`, complet.tok);
    check('page « Cabinet » du collaborateur inchangée (200)', r.status === 200 && r.body?.acces?.niveau === 'complet', String(r.status));
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
