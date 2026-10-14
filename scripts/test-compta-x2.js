/* Test E2E local — LabFlow Compta, étape X2 « La clôture de l'exercice » (labflow-reprise/achats-compta/PLAN-EXERCICES.md
 * §2 ligne X2, §3 ; réponses du client du 13/10 — « ok pour les 5 »).
 *   dossier A (exercice 2025, fini) : écritures 2025 validées (capital, vente, achat, crédit de TVA) + un brouillard de
 *   novembre ; l'assistant dit les contrôles qui échouent (brouillard, périodes, exercice suivant), le résultat (600, 131)
 *   et l'aperçu des deux écritures, rien n'est écrit ; clôturer refusé (contrôles) ; brouillard supprimé, 2026 ouvert,
 *   onze mois clos : prêt ; Saisie et Complet refusés (titulaire seul), autre cabinet 404 ; la CLÔTURE : écriture de
 *   résultat OD-2025-000002 (607 crédité, 707 débité, 131 crédité 600, validée, origine cloture, dernier jour), décembre
 *   clos, exercice clos (qui, quand, résultat), à-nouveaux AN-2026-000001 (bilan par tiers, 131 porté, 1er janvier,
 *   validée), journal exercice_clos ; ensuite : saisie en 2025 refusée, rouvrir / clore refusés, seconde clôture refusée,
 *   balance 2026 sans report provisoire (à-nouveaux écrits), grand livre du fournisseur, crédit de TVA de janvier 2026
 *   définitif, lettrage et échéancier sans les à-nouveaux (lettrer une ligne de clôture refusé), fiche du dossier (2025
 *   clos, 2027 ouvrable), AFFECTATION du résultat (Saisie refusée, parts ≠ résultat, part sur le 131, puis 30 en réserve
 *   légale et 570 en report : brouillard OD dans 2026, journal resultat_affecte ; seconde refusée ; brouillard supprimé →
 *   possible de nouveau) ;
 *   dossier B (2026, en cours) : clôturer refusé (pas fini) ;
 *   dossier C (2025, PERTE de 500, janvier 2026 déjà clos) : résultat au débit du 135, à-nouveaux dans une période close,
 *   affectation d'une perte en report à nouveau ;
 *   rejeu de la migration 240.
 * Crée un super_admin, deux cabinets (2 gérants achetés) et deux collaborateurs temporaires ; règle les tarifs Compta le
 * temps de l'essai, puis restaure et nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');
const XC = require('../src/compta/exercicesCalcul');

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
const AUJOURDHUI = XC.aujourdhuiTunis();

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-x2@example.com';
  const CABINET = 'test-cabinet-compta-x2@example.com';
  const AUTRE = 'test-autre-compta-x2@example.com';
  const SAISIE = 'test-saisie-compta-x2@example.com';
  const COMPLET = 'test-complet-compta-x2@example.com';
  const TOUS = [ADMIN, CABINET, AUTRE, SAISIE, COMPLET];
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [TOUS])).rows.map((r) => r.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
      // X2 : les écritures de clôture sont liées par les exercices (SET NULL) ; la suppression du dossier emporte tout.
      await pool.query('DELETE FROM compta.dossiers WHERE espace_id = ANY($1)', [espaces]);
      await pool.query(`DELETE FROM compta.evenements WHERE auteur_id = ANY($1) OR (details->>'titulaire')::int = ANY($1) OR espace_id = ANY($2)`, [ids, espaces]);
      await pool.query('DELETE FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM support_demandes WHERE client_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM profil_entreprise WHERE client_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [ids]);
    }
  };
  const journal = async (espaceId, type) => (await pool.query('SELECT * FROM compta.evenements WHERE espace_id = $1 AND type = $2 ORDER BY id DESC LIMIT 1', [espaceId, type])).rows[0];
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };
  const REEL = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const identite = (nom, mf) => ({ raisonSociale: nom, formeJuridique: 'SARL', matriculeFiscal: mf, adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' });
  const compte = (plan, numero) => plan?.comptes?.find((c) => c.numero === numero);
  const rangee = (b, numero) => b?.rangees?.find((r) => r.compte?.numero === numero);
  const L = (k, debit, credit, tiersId = null) => ({ compteId: k.id, tiersId, debit: debit || '', credit: credit || '' });
  const ligne = (e, numero, tiersCode = null) => e?.lignes?.find((x) => x.compte?.numero === numero && (tiersCode == null || x.tiers?.code === tiersCode));
  const controle = (c, code) => c?.controles?.find((x) => x.code === code);
  const kos = (c) => (c?.controles || []).filter((x) => !x.ok).map((x) => x.code).join(',');

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin X2', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    const adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (2 gérants achetés) avec deux collaborateurs, et un autre cabinet ──
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet X2', email: CABINET, telephone: '20 555 201', raisonSociale: 'Cabinet Essai X2', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet X2', representantQualite: 'Gérant', nbGerants: 2,
    });
    let r2 = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Autre X2', email: AUTRE, telephone: '20 555 202', raisonSociale: 'Autre Cabinet X2', formeJuridique: 'SARL',
      adresse: '2 rue de Rome', ville: 'Tunis', representantNom: 'TEST Autre X2', representantQualite: 'Gérant', nbGerants: 0,
    });
    check('création des deux cabinets', r.status === 201 && r2.status === 201, `${r.status} ${r2.status}`);
    const cabinet = await activer(CABINET);
    const autre = await activer(AUTRE);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaboratrice Saisie', email: SAISIE, niveau: 'saisie', dossiers: 'tous' });
    r2 = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Complet', email: COMPLET, niveau: 'complet', dossiers: 'tous' });
    const saisie = await activer(SAISIE);
    const complet = await activer(COMPLET);
    check('titulaire, Saisie et Complet connectés', !!cabinet.tok && !!espaceId && r.status === 201 && r2.status === 201 && !!saisie.tok && !!complet.tok);

    // ── Dossier A : exercice 2025 (fini) ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: identite('Hôtel Essai X2', '1234567A/A/M/000'), regime: REEL, exercice: { debut: '2025-01-01', fin: '2025-12-31' } });
    const A = r.body;
    const X25 = A?.exercice;
    check('dossier A créé (exercice 2025, clôturable : fini)', r.status === 201 && X25?.millesime === 2025 && A?.exercices?.[0]?.cloturable === true && A?.exercices?.[0]?.clos === null, `${r.status} ${JSON.stringify(A?.exercices?.[0])}`);
    const planA = (await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok)).body;
    const K = Object.fromEntries(['10131', '607', '4011', '4111', '5321', '707', '43667', '131', '135', '111', '121', '447', '108'].map((n) => [n, compte(planA, n)]));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    const J = Object.fromEntries(['AC', 'VT', 'BQ', 'OD', 'AN'].map((c) => [c, r.body?.journaux?.find((j) => j.code === c)]));
    const F1 = (await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Société Tunisienne de Boissons', delaiPaiement: 30 })).body?.tiers;
    const C1 = (await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'client', nom: 'Voyages Méditerranée', delaiPaiement: 45 })).body?.tiers;
    check('plan, journaux et tiers de A', Object.values(K).every(Boolean) && Object.values(J).every(Boolean) && !!F1 && !!C1, Object.entries(K).filter(([, v]) => !v).map(([n]) => n).join(','));
    const E = (dossierId, corps, jeton = cabinet.tok) => appel('POST', `/api/compta/dossiers/${dossierId}/ecritures`, jeton, corps);
    const e2025 = [
      await E(A.id, { journalId: J.BQ.id, date: '2025-06-02', reference: 'CAP-1', libelle: 'Apport en capital', lignes: [L(K['5321'], '10000'), L(K['10131'], '', '10000')] }),
      await E(A.id, { journalId: J.VT.id, date: '2025-06-10', reference: 'FV-1', libelle: 'Facture client', lignes: [L(K['4111'], '1000', '', C1.id), L(K['707'], '', '1000')] }),
      await E(A.id, { journalId: J.AC.id, date: '2025-06-12', reference: 'FA-1', libelle: 'Facture boissons', lignes: [L(K['607'], '400'), L(K['4011'], '', '400', F1.id)] }),
      await E(A.id, { journalId: J.OD.id, date: '2025-06-30', reference: 'TVA-2025-06', libelle: 'Crédit de TVA à reporter', lignes: [L(K['43667'], '300'), L(K['5321'], '', '300')] }),
    ];
    const periodes25 = (await appel('GET', `/api/compta/dossiers/${A.id}/periodes?exercice=${X25.id}`, cabinet.tok)).body?.exercice?.periodes;
    const juin = periodes25?.find((p) => p.debut === '2025-06-01');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${juin?.id}/valider`, cabinet.tok);
    const brouillon = await E(A.id, { journalId: J.VT.id, date: '2025-11-20', reference: 'FV-2', libelle: 'Vente de novembre (brouillard)', lignes: [L(K['5321'], '50'), L(K['707'], '', '50')] });
    check('2025 : quatre écritures validées, un brouillard de novembre', e2025.every((x) => x.status === 201) && r.status === 200 && r.body?.validees === 4 && brouillon.status === 201, `${r.status} ${r.body?.message || ''}`);

    // ── L'assistant : contrôles, résultat, aperçu (rien d'écrit) ──
    const G = (dossierId, xid, jeton = cabinet.tok) => appel('GET', `/api/compta/dossiers/${dossierId}/exercices/${xid}/cloture`, jeton);
    r = await G(A.id, X25.id);
    let c = r.body;
    check('assistant : exercice fini, non prêt ; contrôles en échec = brouillard, périodes, exercice suivant', r.status === 200 && c?.exercice?.fini === true && c?.exercice?.clos === null && c?.pret === false && kos(c) === 'brouillard,periodes,suivant', `${r.status} ${kos(c)}`);
    check('assistant : détails des contrôles (1 brouillard, 11 périodes ouvertes, ouvrir le suivant)', /^1 écriture en brouillard/.test(controle(c, 'brouillard')?.detail) && /^11 périodes encore ouvertes : janvier 2025/.test(controle(c, 'periodes')?.detail) && /Ouvrez l'exercice suivant/.test(controle(c, 'suivant')?.detail), `${controle(c, 'periodes')?.detail}`);
    check('assistant : résultat 600 (validées seulement : 1 000 − 400), bénéfice, compte 131', c?.resultat?.resultat === '600.000' && c?.resultat?.charges === '400.000' && c?.resultat?.produits === '1000.000' && c?.resultat?.benefice === true && c?.resultat?.compte?.numero === '131', JSON.stringify(c?.resultat));
    const ap = c?.apercu;
    check('aperçu : écriture de résultat OD du 31/12/2025 (607 crédité 400, 707 débité 1 000, 131 crédité 600)', ap?.resultat?.journal === 'OD' && ap?.resultat?.date === '2025-12-31' && ap?.resultat?.reference === 'CLOT-2025' && ligne(ap?.resultat, '607')?.credit === '400.000' && ligne(ap?.resultat, '707')?.debit === '1000.000' && ligne(ap?.resultat, '131')?.credit === '600.000' && ap?.resultat?.total === '1000.000', JSON.stringify(ap?.resultat?.lignes));
    check('aperçu : à-nouveaux AN du 01/01/2026 par tiers (10131, 131, 4011 F1, 4111 C1, 43667, 5321 = 9 700), équilibrés', ap?.anouveaux?.journal === 'AN' && ap?.anouveaux?.date === '2026-01-01' && ap?.anouveaux?.lignes?.length === 6 && ligne(ap?.anouveaux, '10131')?.credit === '10000.000' && ligne(ap?.anouveaux, '131')?.credit === '600.000' && ligne(ap?.anouveaux, '4011', F1.code)?.credit === '400.000' && ligne(ap?.anouveaux, '4111', C1.code)?.debit === '1000.000' && ligne(ap?.anouveaux, '43667')?.debit === '300.000' && ligne(ap?.anouveaux, '5321')?.debit === '9700.000' && ap?.anouveaux?.total === '11000.000', JSON.stringify(ap?.anouveaux?.lignes));
    const nbEcritures = async (dossierId) => (await pool.query('SELECT COUNT(*)::int AS n FROM compta.ecritures WHERE dossier_id = $1', [dossierId])).rows[0].n;
    check('rien n\'est écrit par la lecture', (await nbEcritures(A.id)) === 5);
    const P = (dossierId, xid, jeton = cabinet.tok) => appel('POST', `/api/compta/dossiers/${dossierId}/exercices/${xid}/cloturer`, jeton, {});
    r = await P(A.id, X25.id);
    check('clôturer refusé tant que les contrôles échouent', r.status === 409 && r.body?.code === 'CONTROLES' && /brouillard/.test(r.body?.message) && /Ouvrez l'exercice suivant/.test(r.body?.message), `${r.status} ${r.body?.message}`);

    // ── Mise en ordre : brouillard supprimé, 2026 ouvert, onze mois clos ──
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/ecritures/${brouillon.body?.ecriture?.id}`, cabinet.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/exercices/suivant`, cabinet.tok, {});
    const X26 = r2.body?.exercicesOuverts?.find((x) => x.millesime === 2026);
    let closes = 0;
    for (const p of periodes25.filter((p) => p.debut < '2025-12-01')) closes += (await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${p.id}/clore`, cabinet.tok)).status === 200 ? 1 : 0;
    r = await G(A.id, X25.id);
    c = r.body;
    check('brouillard supprimé, 2026 ouvert, onze mois clos : prêt, tous les contrôles au vert', r2.status === 201 && !!X26 && closes === 11 && c?.pret === true && kos(c) === '' && c?.suivant?.millesime === 2026, `${r2.status} ${closes} ${kos(c)}`);

    // ── Qui peut clôturer ──
    r = await P(A.id, X25.id, saisie.tok);
    r2 = await P(A.id, X25.id, complet.tok);
    const r3 = await P(A.id, X25.id, autre.tok);
    check('clôturer : Saisie et Complet refusés (titulaire seul), autre cabinet 404', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT' && r2.status === 403 && r3.status === 404, `${r.status} ${r2.status} ${r3.status}`);
    r = await G(A.id, X25.id, autre.tok);
    check('assistant : autre cabinet 404 ; Saisie le lit', r.status === 404 && (await G(A.id, X25.id, saisie.tok)).status === 200);

    // ── LA CLÔTURE ──
    r = await P(A.id, X25.id);
    c = r.body;
    const eR = c?.ecritures?.resultat;
    const eAN = c?.ecritures?.anouveaux;
    check('clôture faite : exercice clos par le titulaire, résultat 600, plus de contrôles ni d\'aperçu', r.status === 201 && c?.exercice?.clos?.par === 'TEST Cabinet X2' && !!c?.exercice?.clos?.le && c?.exercice?.clos?.resultat === '600.000' && c?.controles?.length === 0 && c?.apercu === null && c?.pret === false, `${r.status} ${r.body?.message || ''} ${JSON.stringify(c?.exercice)}`);
    check('écriture de résultat : OD-2025-000002, 31/12/2025, validée, origine cloture, 3 lignes', eR?.numero === 'OD-2025-000002' && eR?.date === '2025-12-31' && eR?.etat === 'validee' && eR?.origine === 'cloture' && eR?.lignes?.length === 3 && ligne(eR, '131')?.credit === '600.000' && eR?.reference === 'CLOT-2025', JSON.stringify({ n: eR?.numero, d: eR?.date, e: eR?.etat, o: eR?.origine, l: eR?.lignes?.length }));
    check('à-nouveaux : AN-2026-000001, 01/01/2026, validée, origine cloture, 6 lignes par tiers, 5321 = 9 700', eAN?.numero === 'AN-2026-000001' && eAN?.date === '2026-01-01' && eAN?.etat === 'validee' && eAN?.origine === 'cloture' && eAN?.lignes?.length === 6 && ligne(eAN, '5321')?.debit === '9700.000' && ligne(eAN, '4011', F1.code)?.credit === '400.000' && ligne(eAN, '131')?.credit === '600.000', JSON.stringify({ n: eAN?.numero, d: eAN?.date, l: eAN?.lignes?.length }));
    const xdb = (await pool.query('SELECT etat, clos_par, clos_le, resultat::text AS resultat, ecriture_resultat_id, ecriture_an_id FROM compta.exercices WHERE id = $1', [X25.id])).rows[0];
    const per = (await pool.query(`SELECT COUNT(*) FILTER (WHERE etat = 'close')::int AS closes, COUNT(*)::int AS n, bool_and(clos_par IS NOT NULL) AS qui FROM compta.periodes WHERE exercice_id = $1`, [X25.id])).rows[0];
    check('base : exercice clos (qui, quand, résultat, écritures liées), 12 périodes closes (décembre par la clôture)', xdb?.etat === 'clos' && xdb?.clos_par === cabinet.id && !!xdb?.clos_le && xdb?.resultat === '600.000' && xdb?.ecriture_resultat_id === eR?.id && xdb?.ecriture_an_id === eAN?.id && per?.closes === 12 && per?.n === 12 && per?.qui === true, JSON.stringify({ xdb, per }));
    let ev = await journal(espaceId, 'exercice_clos');
    check('journal : exercice_clos (résultat, numéros des deux écritures, décembre clos)', ev?.auteur_id === cabinet.id && ev?.details?.millesime === 2025 && ev?.details?.resultat === '600.000' && ev?.details?.ecritureResultat?.numero === 'OD-2025-000002' && ev?.details?.aNouveaux?.numero === 'AN-2026-000001' && ev?.details?.periodesCloses === 1, JSON.stringify(ev?.details));

    // ── Après la clôture : définitif ──
    r = await E(A.id, { journalId: J.OD.id, date: '2025-12-15', reference: 'OD-25', libelle: 'Trop tard', lignes: [L(K['607'], '10'), L(K['5321'], '', '10')] });
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${periodes25.find((p) => p.debut === '2025-12-01')?.id}/rouvrir`, cabinet.tok);
    const r4 = await P(A.id, X25.id);
    check('exercice clos : saisie en 2025 refusée, période non rouvrable, seconde clôture refusée', r.status === 409 && r.body?.code === 'DATE_HORS_EXERCICE' && r2.status === 409 && r2.body?.code === 'EXERCICE_CLOS' && r4.status === 409 && r4.body?.code === 'DEJA_CLOS', `${r.status} ${r.body?.code} ${r2.status} ${r2.body?.code} ${r4.status} ${r4.body?.code}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/livres/balance?exercice=${X26.id}`, cabinet.tok);
    let b = r.body;
    check('balance 2026 : à-nouveaux écrits (5321 = 9 700, 131 = 600 au crédit, 4011 = 400), plus de report provisoire, contrôles cohérents', r.status === 200 && b?.provisoire === null && rangee(b, '5321')?.ouverture?.solde === '9700.000' && rangee(b, '5321')?.ouverture?.provisoire === undefined && rangee(b, '131')?.ouverture?.soldeCredit === '600.000' && rangee(b, '4011')?.ouverture?.soldeCredit === '400.000' && !rangee(b, '707') && b?.controles?.coherent === true && b?.totaux?.ouverture?.debit === '11000.000', JSON.stringify({ p: b?.provisoire, o: b?.totaux?.ouverture }));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/livres/balance?exercice=${X25.id}`, cabinet.tok);
    b = r.body;
    check('balance 2025 après la clôture : 607 et 707 soldés, 131 = 600 (écriture de résultat)', rangee(b, '607')?.solde === '0.000' && rangee(b, '707')?.solde === '0.000' && rangee(b, '131')?.soldeCredit === '600.000' && b?.controles?.coherent === true, JSON.stringify({ a: rangee(b, '607')?.solde, b: rangee(b, '131')?.soldeCredit }));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/livres/grand-livre?exercice=${X26.id}&tiers=${F1.id}`, cabinet.tok);
    check('grand livre du fournisseur F1 (2026) : ouverture −400 définitive (à-nouveaux)', r.body?.ouverture?.solde === '-400.000' && r.body?.provisoire === null, `${r.body?.ouverture?.solde} ${JSON.stringify(r.body?.provisoire)}`);
    const per26 = (await appel('GET', `/api/compta/dossiers/${A.id}/periodes?exercice=${X26.id}`, cabinet.tok)).body?.exercice?.periodes;
    r = await appel('GET', `/api/compta/dossiers/${A.id}/taxes-mois?periode=${per26?.[0]?.id}`, cabinet.tok);
    check('taxes de janvier 2026 : crédit de 300 repris des à-nouveaux, plus provisoire', r.status === 200 && r.body?.tva?.creditReporte === '300.000' && r.body?.tva?.creditProvisoire === null, `${r.status} ${JSON.stringify({ c: r.body?.tva?.creditReporte, p: r.body?.tva?.creditProvisoire })}`);

    // ── Lettrage et échéancier : les à-nouveaux de la clôture n'y comptent pas ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/lettrage/tiers/${F1.id}`, cabinet.tok);
    const anLigne = (await pool.query('SELECT l.id FROM compta.lignes l WHERE l.ecriture_id = $1 AND l.tiers_id = $2', [eAN?.id, F1.id])).rows[0];
    check('lettrage F1 : la facture FA-1 seule à lettrer (la ligne d\'à-nouveaux est absente)', r.status === 200 && r.body?.lignes?.length === 1 && r.body?.lignes?.[0]?.ecriture?.reference === 'FA-1' && !!anLigne, `${r.body?.lignes?.length}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/lettrage`, cabinet.tok, { tiersId: F1.id, lignes: [anLigne?.id, r.body?.lignes?.[0]?.id] });
    check('lettrer une ligne d\'à-nouveaux de clôture : refusé', r.status === 409 && r.body?.code === 'LIGNE_CLOTURE', `${r.status} ${r.body?.code}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/echeancier?type=fournisseur`, cabinet.tok);
    const f1 = r.body?.rangees?.find((x) => x.tiers?.id === F1.id);
    check('échéancier fournisseurs : F1 doit 400 (pas 800 : à-nouveaux non comptés)', r.status === 200 && f1?.total === '400.000' && f1?.nbLignes === 1, JSON.stringify({ t: f1?.total, n: f1?.nbLignes }));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/lettrage`, cabinet.tok);
    const tF1 = r.body?.tiers?.find((x) => x.id === F1.id);
    check('page Lettrage : F1 a 1 ligne à lettrer', tF1?.nbALettrer === 1, `${tF1?.nbALettrer}`);

    // ── Fiche du dossier ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, cabinet.tok);
    const fiche = r.body;
    const x25f = fiche?.exercices?.find((x) => x.id === X25.id);
    check('fiche A : 2025 clos (qui, quand, résultat 600, affectation à faire), 2026 en cours non clôturable, 2027 ouvrable', x25f?.etat === 'clos' && x25f?.clos?.par === 'TEST Cabinet X2' && x25f?.clos?.resultat === '600.000' && x25f?.clos?.affectee === false && x25f?.cloturable === false && fiche?.exercicesOuverts?.length === 1 && fiche?.exercicesOuverts?.[0]?.cloturable === false && fiche?.tenue?.fournisseurs?.du === '400.000' && fiche?.suivant?.possible === true && fiche?.suivant?.millesime === 2027, JSON.stringify({ x25f, s: fiche?.suivant, t: fiche?.tenue }));

    // ── Affectation du résultat ──
    r = await G(A.id, X25.id);
    c = r.body;
    const comptesAff = c?.affectation?.comptes?.map((k) => `${k.numero}:${k.usage}`);
    check('assistant (clos) : affectation possible, comptes imputables proposés (111, 112, 1181 — 118 a un sous-compte —, 121, 447, 108), date proposée dans 2026', c?.affectation?.possible === true && c?.affectation?.benefice === true && comptesAff?.join(',') === '108:tous,111:benefice,112:benefice,1181:benefice,121:tous,447:benefice' && c?.affectation?.dateProposee >= '2026-01-01' && c?.affectation?.dateProposee <= '2026-12-31' && c?.affectation?.ecriture === null, JSON.stringify(c?.affectation?.comptes));
    const AFF = (dossierId, xid, corps, jeton = cabinet.tok) => appel('POST', `/api/compta/dossiers/${dossierId}/exercices/${xid}/affectation`, jeton, corps);
    r = await AFF(A.id, X25.id, { lignes: [{ compteId: K['121'].id, montant: '600' }] }, saisie.tok);
    r2 = await AFF(A.id, X25.id, { lignes: [{ compteId: K['121'].id, montant: '500' }] });
    const r5 = await AFF(A.id, X25.id, { lignes: [{ compteId: K['131'].id, montant: '600' }] });
    const r6 = await AFF(A.id, X25.id, { lignes: [{ compteId: K['121'].id, montant: '600' }], date: '2025-06-30' });
    check('affectation : Saisie refusée ; parts ≠ résultat (reste 100) ; part sur le 131 ; date hors de 2026', r.status === 403 && r2.status === 400 && r2.body?.code === 'AFFECTATION_INEGALE' && /il reste 100,000 à affecter/.test(r2.body?.message) && r5.status === 400 && r5.body?.code === 'COMPTE_RESULTAT' && r6.status === 400 && r6.body?.code === 'DATE_HORS_SUIVANT', `${r.status} ${r2.status} ${r2.body?.message} ${r5.status} ${r6.status}`);
    r = await AFF(A.id, X25.id, { lignes: [{ compteId: K['111'].id, montant: '30' }, { compteId: K['121'].id, montant: '570' }] }, complet.tok);
    c = r.body;
    const eA = c?.affectation?.ecriture;
    check('affectation par Complet : brouillard OD dans 2026 (131 débité 600, 111 crédité 30, 121 crédité 570), liée à l\'exercice', r.status === 201 && eA?.etat === 'brouillard' && eA?.journal?.code === 'OD' && eA?.date >= '2026-01-01' && eA?.reference === 'AFF-2025' && ligne(eA, '131')?.debit === '600.000' && ligne(eA, '111')?.credit === '30.000' && ligne(eA, '121')?.credit === '570.000' && c?.affectation?.possible === false, `${r.status} ${r.body?.message || ''} ${JSON.stringify(eA?.lignes)}`);
    ev = await journal(espaceId, 'resultat_affecte');
    check('journal : resultat_affecte (parts)', ev?.auteur_id === complet.id && ev?.details?.millesime === 2025 && ev?.details?.lignes?.length === 3 && ev?.details?.ecriture === eA?.id, JSON.stringify(ev?.details?.lignes));
    r = await AFF(A.id, X25.id, { lignes: [{ compteId: K['121'].id, montant: '600' }] });
    check('seconde affectation refusée tant que la première existe', r.status === 409 && r.body?.code === 'AFFECTATION_EXISTANTE', `${r.status} ${r.body?.code}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, cabinet.tok);
    check('fiche A : affectation préparée', r.body?.exercices?.find((x) => x.id === X25.id)?.clos?.affectee === true);
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/ecritures/${eA?.id}`, cabinet.tok);
    r2 = await G(A.id, X25.id);
    check('brouillard d\'affectation supprimé : une autre se prépare (lien effacé)', r.status === 200 && r2.body?.affectation?.possible === true && r2.body?.affectation?.ecriture === null, `${r.status} ${r2.body?.affectation?.possible}`);

    // ── Dossier B (2026, en cours) : pas fini ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: identite('Restaurant Essai X2', '7654321B/A/M/000'), regime: REEL, exercice: { debut: '2026-01-01', fin: '2026-12-31' } });
    const Bd = r.body;
    r2 = await P(Bd.id, Bd.exercice.id);
    check('dossier B : clôturer l\'exercice en cours refusé (pas fini), fiche : non clôturable', r2.status === 409 && r2.body?.code === 'EXERCICE_EN_COURS' && Bd?.exercices?.[0]?.cloturable === (AUJOURDHUI > '2026-12-31'), `${r2.status} ${r2.body?.code}`);

    // ── Dossier C (2025) : PERTE, janvier 2026 déjà clos ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: identite('Café Essai X2', '1111111C/A/M/000'), regime: REEL, exercice: { debut: '2025-01-01', fin: '2025-12-31' } });
    const Cd = r.body;
    const planC = (await appel('GET', `/api/compta/dossiers/${Cd.id}/plan`, cabinet.tok)).body;
    const jC = Object.fromEntries((await appel('GET', `/api/compta/dossiers/${Cd.id}/journaux`, cabinet.tok)).body?.journaux?.map((j) => [j.code, j]) || []);
    const fC = (await appel('POST', `/api/compta/dossiers/${Cd.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Minoterie Essai' })).body?.tiers;
    r = await E(Cd.id, { journalId: jC.AC.id, date: '2025-03-10', reference: 'FA-C1', libelle: 'Farine', lignes: [L(compte(planC, '607'), '500'), L(compte(planC, '4011'), '', '500', fC?.id)] });
    r2 = await appel('POST', `/api/compta/dossiers/${Cd.id}/ecritures/${r.body?.ecriture?.id}/valider`, cabinet.tok);
    const X26c = (await appel('POST', `/api/compta/dossiers/${Cd.id}/exercices/suivant`, cabinet.tok, {})).body?.exercicesOuverts?.find((x) => x.millesime === 2026);
    const perC25 = (await appel('GET', `/api/compta/dossiers/${Cd.id}/periodes?exercice=${Cd.exercice.id}`, cabinet.tok)).body?.exercice?.periodes;
    for (const p of perC25) await appel('POST', `/api/compta/dossiers/${Cd.id}/periodes/${p.id}/clore`, cabinet.tok);
    const perC26 = (await appel('GET', `/api/compta/dossiers/${Cd.id}/periodes?exercice=${X26c?.id}`, cabinet.tok)).body?.exercice?.periodes;
    const janv26 = await appel('POST', `/api/compta/dossiers/${Cd.id}/periodes/${perC26?.[0]?.id}/clore`, cabinet.tok);
    r = await G(Cd.id, Cd.exercice.id);
    check('dossier C : perte de 500 (135), tous les mois clos (décembre aussi), janvier 2026 clos ; prêt', r2.status === 200 && janv26.status === 200 && r.body?.pret === true && r.body?.resultat?.resultat === '-500.000' && r.body?.resultat?.benefice === false && r.body?.resultat?.compte?.numero === '135', `${r2.status} ${janv26.status} ${kos(r.body)} ${JSON.stringify(r.body?.resultat)}`);
    r = await P(Cd.id, Cd.exercice.id);
    c = r.body;
    check('clôture d\'une perte : 607 crédité 500, 135 débité 500 ; à-nouveaux dans janvier 2026 clos (135 débité, 4011 crédité)', r.status === 201 && ligne(c?.ecritures?.resultat, '135')?.debit === '500.000' && ligne(c?.ecritures?.resultat, '607')?.credit === '500.000' && c?.ecritures?.anouveaux?.numero === 'AN-2026-000001' && ligne(c?.ecritures?.anouveaux, '135')?.debit === '500.000' && ligne(c?.ecritures?.anouveaux, '4011', fC?.code)?.credit === '500.000' && c?.exercice?.clos?.resultat === '-500.000', `${r.status} ${r.body?.message || ''}`);
    check('clôture d\'une perte : décembre resté clos (clos avant), journal : 0 période close par la clôture', (await journal(espaceId, 'exercice_clos'))?.details?.periodesCloses === 0);
    r = await AFF(Cd.id, Cd.exercice.id, { lignes: [{ compteId: compte(planC, '121').id, montant: '500' }] });
    const eAc = r.body?.affectation?.ecriture;
    check('affectation d\'une perte : 121 débité 500, 135 crédité 500 (brouillard dans 2026)', r.status === 201 && ligne(eAc, '121')?.debit === '500.000' && ligne(eAc, '135')?.credit === '500.000' && eAc?.etat === 'brouillard', `${r.status} ${r.body?.message || ''} ${JSON.stringify(eAc?.lignes?.map((x) => [x.compte?.numero, x.debit, x.credit]))}`);
    r = await G(Cd.id, Cd.exercice.id);
    check('assistant (perte) : les comptes proposés pour une perte portent l\'usage « tous » (121, 108)', r.body?.affectation?.comptes?.filter((k) => k.usage === 'tous').map((k) => k.numero).join(',') === '108,121', JSON.stringify(r.body?.affectation?.comptes?.map((k) => k.numero)));

    // ── Rejeu de la migration ──
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '240_compta_cloture.sql'), 'utf8');
    let rejeu = true;
    try { await pool.query(sql); } catch (e) { rejeu = false; console.log(e.message); }
    const toujoursClos = (await pool.query('SELECT etat, ecriture_an_id FROM compta.exercices WHERE id = $1', [X25.id])).rows[0];
    check('migration 240 rejouable, l\'exercice clos le reste', rejeu && toujoursClos?.etat === 'clos' && toujoursClos?.ecriture_an_id === eAN?.id);
  } catch (err) {
    console.error(err);
    check('aucune exception', false, err.message);
  } finally {
    await wipe();
    for (const [cle, valeur] of Object.entries(avant)) await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    const ko = results.filter((x) => !x.ok).length;
    console.log(`\n${results.length - ko}/${results.length} vérifications passées`);
    await pool.end();
    process.exit(ko ? 1 : 0);
  }
})();
