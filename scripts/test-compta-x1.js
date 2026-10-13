/* Test E2E local — LabFlow Compta, étape X1 « L'exercice suivant » (labflow-reprise/achats-compta/PLAN-EXERCICES.md §2
 * ligne X1, §3 ; réponses du client du 13/10 — « ok pour les 5 »).
 *   dossier A (exercice 2025, déjà fini) : la fiche propose 2026 et l'ouverture automatique ; écritures 2025 validées
 *   (BQ-2025-…) ; une saisie datée de 2026 (niveau Saisie) OUVRE 2026 d'elle-même (journal : automatique, déclencheur) ;
 *   numéros 2026 ; deux exercices ouverts : saisie encore possible en 2025, 2027 refusé (expliqué), troisième exercice
 *   refusé, à-nouveaux refusés dans 2026 ; page Écritures (exercice du jour par défaut, choix de l'exercice, exercice de la
 *   période demandée) ; page Périodes (exercice choisi, clôture qui reste sur l'exercice) ; balance 2026 : soldes
 *   d'ouverture PROVISOIRES (bilan repris, résultat 2025 au 131, rien d'écrit, contrôles cohérents, brouillard compris ou
 *   non) ; balance fournisseurs et grand livre (compte, tiers) ; export de la balance ; taxes de janvier 2026 : crédit de
 *   TVA repris en provisoire ;
 *   dossier B (2026) : ouverture à la main — Saisie refusée, Complet accepté (2027, journal « manuelle ») ; écriture et
 *   numéro 2027 ; dossier archivé refusé ;
 *   dossier C (2026, sans écriture) : ouverture avec une fin choisie (6 mois), fin invalide refusée, dates de l'exercice
 *   figées ensuite ;
 *   dossier D (premier exercice court, janvier à mars 2026) : l'exercice suivant d'avril 2026 à mars 2027 prend le
 *   millésime 2027 (AC-2026-000001 et AC-2027-000001 côte à côte) ; la balance d'ouverture importée va dans le premier
 *   exercice ;
 *   cloisonnement (un autre cabinet ne voit rien) ; rejeu de la migration 234.
 * Crée un super_admin, deux cabinets (2 gérants achetés) et deux collaborateurs temporaires ; règle les tarifs Compta le
 * temps de l'essai, puis restaure et nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
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
const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const televerser = async (chemin, jeton, buffer) => {
  const form = new FormData();
  form.append('fichier', new Blob([buffer], { type: TYPE_XLSX }), 'essai-x1.xlsx');
  const r = await fetch(`${BASE}${chemin}`, { method: 'POST', headers: { Authorization: `Bearer ${jeton}` }, body: form });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const telecharger = async (chemin, jeton) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  return { status: r.status, buffer: Buffer.from(await r.arrayBuffer()) };
};
const login = async (email) => appel('POST', '/auth/login', null, { email, password: MDP });
const CLES = ['compta_cabinet_mensuel', 'compta_gerant_cabinet_mensuel', 'compta_mise_en_route', 'compta_module_mensuel', 'compta_gerant_client_mensuel'];
const AUJOURDHUI = XC.aujourdhuiTunis();

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-x1@example.com';
  const CABINET = 'test-cabinet-compta-x1@example.com';
  const AUTRE = 'test-autre-compta-x1@example.com';
  const SAISIE = 'test-saisie-compta-x1@example.com';
  const COMPLET = 'test-complet-compta-x1@example.com';
  const TOUS = [ADMIN, CABINET, AUTRE, SAISIE, COMPLET];
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [TOUS])).rows.map((r) => r.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
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

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin X1', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    const adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (2 gérants achetés) avec deux collaborateurs, et un autre cabinet ──
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet X1', email: CABINET, telephone: '20 555 101', raisonSociale: 'Cabinet Essai X1', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet X1', representantQualite: 'Gérant', nbGerants: 2,
    });
    let r2 = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Autre X1', email: AUTRE, telephone: '20 555 102', raisonSociale: 'Autre Cabinet X1', formeJuridique: 'SARL',
      adresse: '2 rue de Rome', ville: 'Tunis', representantNom: 'TEST Autre X1', representantQualite: 'Gérant', nbGerants: 0,
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
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: identite('Hôtel Essai X1', '1234567A/A/M/000'), regime: REEL, exercice: { debut: '2025-01-01', fin: '2025-12-31' } });
    const A = r.body;
    check('dossier A créé (exercice 2025, millésime 2025)', r.status === 201 && A?.exercice?.millesime === 2025 && A?.exercicesOuverts?.length === 1, `${r.status}`);
    const S = A?.suivant;
    check('fiche A : 2026 proposé, ouverture automatique possible jusqu\'à aujourd\'hui', S?.debut === '2026-01-01' && S?.fin === '2026-12-31' && S?.millesime === 2026 && S?.possible === true && S?.auto === true && S?.jusqua === (AUJOURDHUI < '2026-12-31' ? AUJOURDHUI : '2026-12-31'), JSON.stringify(S));
    const planA = (await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok)).body;
    const K = Object.fromEntries(['10131', '607', '4011', '4111', '5321', '707', '43667', '131', '135'].map((n) => [n, compte(planA, n)]));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    const J = Object.fromEntries(['AC', 'VT', 'BQ', 'OD', 'AN'].map((c) => [c, r.body?.journaux?.find((j) => j.code === c)]));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Société Tunisienne de Boissons', delaiPaiement: 30 });
    const F1 = r.body?.tiers;
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'client', nom: 'Voyages Méditerranée', delaiPaiement: 45 });
    const C1 = r2.body?.tiers;
    check('plan, journaux et tiers de A', Object.values(K).every(Boolean) && Object.values(J).every(Boolean) && !!F1 && !!C1, Object.entries(K).filter(([, v]) => !v).map(([n]) => n).join(','));
    const E = (corps, jeton = cabinet.tok) => appel('POST', `/api/compta/dossiers/${A.id}/ecritures`, jeton, corps);

    // ── 2025 : capital, vente, achat, crédit de TVA ; validées ──
    const e2025 = [
      await E({ journalId: J.BQ.id, date: '2025-06-02', reference: 'CAP-1', libelle: 'Apport en capital', lignes: [L(K['5321'], '10000'), L(K['10131'], '', '10000')] }),
      await E({ journalId: J.VT.id, date: '2025-06-10', reference: 'FV-1', libelle: 'Facture client', lignes: [L(K['4111'], '1000', '', C1.id), L(K['707'], '', '1000')] }),
      await E({ journalId: J.AC.id, date: '2025-06-12', reference: 'FA-1', libelle: 'Facture boissons', lignes: [L(K['607'], '400'), L(K['4011'], '', '400', F1.id)] }),
      await E({ journalId: J.OD.id, date: '2025-06-30', reference: 'TVA-2025-06', libelle: 'Crédit de TVA à reporter', lignes: [L(K['43667'], '300'), L(K['5321'], '', '300')] }),
    ];
    check('2025 : quatre écritures saisies', e2025.every((x) => x.status === 201), e2025.map((x) => `${x.status} ${x.body?.message || ''}`).join(' | '));
    const pages = (await appel('GET', `/api/compta/dossiers/${A.id}/periodes?exercice=${A.exercice.id}`, cabinet.tok)).body;
    const juin2025 = pages?.exercice?.periodes?.find((p) => p.debut === '2025-06-01');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${juin2025?.id}/valider`, cabinet.tok);
    check('2025 : validées, numéros de 2025', r.status === 200 && r.body?.validees === 4, `${r.status} ${r.body?.message || ''}`);
    const bq2025 = (await appel('GET', `/api/compta/dossiers/${A.id}/ecritures/${e2025[0].body?.ecriture?.id}`, cabinet.tok)).body?.ecriture;
    check('numéro BQ-2025-000001', bq2025?.numero === 'BQ-2025-000001', bq2025?.numero);

    // ── Ouverture automatique : la première écriture de 2026 (niveau Saisie) ──
    r = await E({ journalId: J.OD.id, date: '2026-03-15', reference: 'OD-26-1', libelle: 'Frais bancaires', lignes: [L(K['607'], '50'), L(K['5321'], '', '50')] }, saisie.tok);
    check('saisie datée du 15/03/2026 acceptée : 2026 s\'ouvre de lui-même', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const e2026 = r.body?.ecriture;
    const x2026 = (await pool.query('SELECT id, debut::text AS debut, fin::text AS fin, millesime, ouverture, ouvert_par FROM compta.exercices WHERE dossier_id = $1 AND debut = $2', [A.id, '2026-01-01'])).rows[0];
    check('exercice 2026 en base : 12 mois, millésime 2026, ouverture automatique par la collaboratrice', x2026?.fin === '2026-12-31' && x2026?.millesime === 2026 && x2026?.ouverture === 'auto' && x2026?.ouvert_par === saisie.id, JSON.stringify(x2026));
    const nbPeriodes = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.periodes WHERE exercice_id = $1', [x2026?.id])).rows[0].n;
    let ev = await journal(espaceId, 'exercice_ouvert');
    check('journal : exercice_ouvert automatique, déclenché par la saisie du 15/03/2026', nbPeriodes === 12 && ev?.details?.mode === 'auto' && ev?.details?.declencheur?.date === '2026-03-15' && ev?.details?.declencheur?.origine === 'saisie' && ev?.details?.millesime === 2026 && ev?.auteur_id === saisie.id, JSON.stringify(ev?.details));
    let fiche = (await appel('GET', `/api/compta/dossiers/${A.id}`, cabinet.tok)).body;
    check('fiche A : deux exercices ouverts, l\'exercice du jour en cours, 2027 bloqué par 2025', fiche?.exercicesOuverts?.length === 2 && fiche?.exercicesOuverts?.[0]?.millesime === 2025 && fiche?.exercicesOuverts?.[1]?.periodes?.length === 12 && fiche?.exercice?.millesime === 2026 && fiche?.suivant?.possible === false && fiche?.suivant?.bloquant?.millesime === 2025, JSON.stringify(fiche?.suivant));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures/${e2026?.id}/valider`, cabinet.tok);
    check('validée en 2026 : OD-2026-000001', r.status === 200 && r.body?.ecriture?.numero === 'OD-2026-000001', r.body?.ecriture?.numero || r.body?.message);

    // ── Deux exercices ouverts ──
    r = await E({ journalId: J.VT.id, date: '2025-11-20', reference: 'FV-2', libelle: 'Vente de novembre (brouillard)', lignes: [L(K['5321'], '50'), L(K['707'], '', '50')] });
    check('saisie encore possible en 2025 (exercice ouvert)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await E({ journalId: J.OD.id, date: '2027-01-10', reference: 'OD-27', libelle: 'Trop tôt', lignes: [L(K['607'], '10'), L(K['5321'], '', '10')] });
    check('2027 refusé, expliqué (2025 pas clos)', r.status === 409 && r.body?.code === 'DATE_HORS_EXERCICE' && /hors des exercices ouverts/.test(r.body?.message) && /ne s'ouvre pas tant que l'exercice du 01\/01\/2025 au 31\/12\/2025 n'est pas clos/.test(r.body?.message), r.body?.message);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/exercices/suivant`, cabinet.tok, {});
    check('troisième exercice refusé (deux ouverts au plus)', r.status === 409 && r.body?.code === 'DEUX_EXERCICES_OUVERTS', `${r.status} ${r.body?.message || ''}`);
    r = await E({ journalId: J.AN.id, date: '2026-01-01', reference: 'AN-2026', libelle: 'À-nouveaux à la main', lignes: [L(K['5321'], '10'), L(K['10131'], '', '10')] });
    check('à-nouveaux refusés dans 2026 (ils viendront de la clôture)', r.status === 409 && r.body?.code === 'AN_EXERCICE_SUIVANT', `${r.status} ${r.body?.message || ''}`);

    // ── Page Écritures : l'exercice du jour, l'exercice choisi, celui de la période ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures`, cabinet.tok);
    check('Écritures : exercice du jour (2026) par défaut, ses seules écritures ; deux exercices au choix', r.status === 200 && r.body?.exercice?.millesime === 2026 && r.body?.total === 1 && r.body?.exercices?.length === 2 && r.body?.suivant?.possible === false && r.body?.filtres?.exerciceId === x2026?.id, `${r.body?.exercice?.millesime} ${r.body?.total}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures?exercice=${A.exercice.id}`, cabinet.tok);
    check('Écritures : exercice 2025 choisi (5 écritures)', r.body?.exercice?.millesime === 2025 && r.body?.total === 5, `${r.body?.total}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures?periode=${juin2025.id}`, cabinet.tok);
    check('Écritures : la période de juin 2025 ouvre l\'exercice 2025', r.body?.exercice?.millesime === 2025 && r.body?.total === 4, `${r.body?.exercice?.millesime} ${r.body?.total}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures?exercice=999999`, cabinet.tok);
    check('Écritures : exercice inconnu → 404', r.status === 404);

    // ── Page Périodes ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/periodes`, cabinet.tok);
    check('Périodes : exercice du jour par défaut, millésimes', r.body?.exercice?.millesime === 2026 && r.body?.exercices?.length === 2 && r.body?.exercices?.every((x) => x.millesime), `${r.body?.exercice?.millesime}`);
    const janv2025 = pages?.exercice?.periodes?.find((p) => p.debut === '2025-01-01');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${janv2025?.id}/clore`, cabinet.tok);
    check('Périodes : clore janvier 2025 rend la page de 2025', r.status === 200 && r.body?.exercice?.millesime === 2025 && r.body?.exercice?.periodes?.[0]?.etat === 'close', `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/periodes?exercice=abc`, cabinet.tok);
    check('Périodes : exercice illisible → 404', r.status === 404);

    // ── Balance 2026 : soldes d'ouverture provisoires ──
    const B = (q) => appel('GET', `/api/compta/dossiers/${A.id}/livres/balance?${q}`, cabinet.tok);
    r = await B('');
    const b = r.body;
    const ouv = (n) => rangee(b, n)?.ouverture;
    // Brouillard compris : 5321 = 10000 − 300 + 50 (vente de novembre en brouillard) ; résultat 2025 = 1000 + 50 − 400 = 650 (bénéfice).
    check('balance 2026 : marquée provisoire (exercice 2025 non clos), résultat 650 au 131', r.status === 200 && b?.selection?.exercice?.millesime === 2026 && b?.provisoire?.precedent?.millesime === 2025 && b?.provisoire?.resultat === '650.000' && b?.provisoire?.compteResultat === '131', JSON.stringify(b?.provisoire));
    check('balance 2026 : bilan repris (5321, 10131, 4011, 4111, 43667), gestion à zéro', ouv('5321')?.solde === '9750.000' && ouv('5321')?.provisoire === '9750.000' && ouv('10131')?.soldeCredit === '10000.000' && ouv('4011')?.soldeCredit === '400.000' && ouv('4111')?.soldeDebit === '1000.000' && ouv('43667')?.soldeDebit === '300.000' && ouv('131')?.soldeCredit === '650.000' && !ouv('707') && ouv('607')?.provisoire === undefined, ['5321', '10131', '4011', '4111', '43667', '131', '607'].map((n) => `${n}:${ouv(n)?.solde}`).join(' '));
    check('balance 2026 : mouvements de 2026 seuls, report équilibré hors du total des lignes, contrôles cohérents', rangee(b, '607')?.mouvements?.debit === '50.000' && b?.totaux?.lignes?.debit === '50.000' && b?.totaux?.provisoire?.debit === b?.totaux?.provisoire?.credit && b?.totaux?.ouverture?.debit === b?.totaux?.ouverture?.credit && b?.controles?.coherent === true, JSON.stringify(b?.totaux?.provisoire));
    const nbAn = (await pool.query(`SELECT COUNT(*)::int AS n FROM compta.ecritures e JOIN compta.journaux j ON j.id = e.journal_id WHERE e.dossier_id = $1 AND j.type = 'an'`, [A.id])).rows[0].n;
    check('rien n\'est écrit (aucun à-nouveau)', nbAn === 0);
    r = await B('brouillard=0');
    check('balance 2026 validées seulement : 5321 = 9700, résultat 600', rangee(r.body, '5321')?.ouverture?.solde === '9700.000' && r.body?.provisoire?.resultat === '600.000' && rangee(r.body, '131')?.ouverture?.soldeCredit === '600.000', `${rangee(r.body, '5321')?.ouverture?.solde} ${r.body?.provisoire?.resultat}`);
    r = await B(`exercice=${A.exercice.id}`);
    check('balance 2025 : aucun report (premier exercice)', r.body?.provisoire === null && rangee(r.body, '5321')?.ouverture?.provisoire === undefined && r.body?.controles?.coherent === true);
    r = await B('type=fournisseurs');
    const f1 = r.body?.rangees?.find((x) => x.tiers?.id === F1.id);
    check('balance fournisseurs 2026 : F1 repris (400 au crédit), égale aux collectifs', f1?.ouverture?.soldeCredit === '400.000' && f1?.ouverture?.provisoire === '-400.000' && r.body?.controles?.coherent === true && r.body?.provisoire?.precedent?.millesime === 2025, JSON.stringify(r.body?.controles?.collectifs?.ouverture));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/livres/grand-livre?compte=${K['5321'].id}`, cabinet.tok);
    check('grand livre 5321 (2026) : ouverture provisoire 9 750, solde après la ligne', r.body?.ouverture?.solde === '9750.000' && r.body?.ouverture?.provisoire === '9750.000' && r.body?.provisoire?.precedent?.millesime === 2025 && r.body?.lignes?.[0]?.solde === '9700.000', `${r.body?.ouverture?.solde} ${r.body?.lignes?.[0]?.solde}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/livres/grand-livre?tiers=${F1.id}`, cabinet.tok);
    check('grand livre du fournisseur F1 (2026) : ouverture −400 provisoire', r.body?.ouverture?.solde === '-400.000' && r.body?.provisoire?.precedent?.millesime === 2025, r.body?.ouverture?.solde);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/livres/grand-livre?compte=${K['131'].id}`, cabinet.tok);
    check('grand livre 131 (2026) : le résultat 2025 en ouverture', r.body?.ouverture?.soldeCredit === '650.000', r.body?.ouverture?.solde);
    const x = await telecharger(`/api/compta/dossiers/${A.id}/livres/balance/export`, cabinet.tok);
    const wb = new ExcelJS.Workbook();
    if (x.status === 200) await wb.xlsx.load(x.buffer);
    let meta = '';
    if (x.status === 200) wb.worksheets[0].eachRow((row) => { const t = String(row.getCell(1).text || ''); if (/PROVISOIRES/.test(t)) meta = t; });
    check('export de la balance 2026 : soldes d\'ouverture provisoires dits', x.status === 200 && /exercice 2025 non clos/.test(meta), meta.slice(0, 120));

    // ── Taxes de janvier 2026 : crédit de TVA repris en provisoire ──
    const per26 = (await appel('GET', `/api/compta/dossiers/${A.id}/periodes?exercice=${x2026.id}`, cabinet.tok)).body?.exercice?.periodes;
    r = await appel('GET', `/api/compta/dossiers/${A.id}/taxes-mois?periode=${per26?.[0]?.id}`, cabinet.tok);
    check('taxes de janvier 2026 : crédit de 300 repris de 2025 (provisoire)', r.status === 200 && r.body?.tva?.creditReporte === '300.000' && r.body?.tva?.creditProvisoire?.millesime === 2025 && r.body?.tva?.creditNonRepris === null, `${r.status} ${JSON.stringify({ c: r.body?.tva?.creditReporte, p: r.body?.tva?.creditProvisoire })}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, cabinet.tok);
    check('fiche A, carte Taxes : période du jour dans 2026', r.body?.fiscalite?.periode?.debut?.slice(0, 7) === AUJOURDHUI.slice(0, 7) || AUJOURDHUI > '2026-12-31', r.body?.fiscalite?.periode?.debut);

    // ── Dossier B (2026) : ouverture à la main ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: identite('Restaurant Essai X1', '7654321B/A/M/000'), regime: REEL, exercice: { debut: '2026-01-01', fin: '2026-12-31' } });
    const Bd = r.body;
    check('dossier B : 2027 proposé, pas d\'ouverture automatique avant le 1er janvier', Bd?.suivant?.debut === '2027-01-01' && Bd?.suivant?.possible === true && Bd?.suivant?.auto === (AUJOURDHUI >= '2027-01-01'), JSON.stringify(Bd?.suivant));
    r = await appel('POST', `/api/compta/dossiers/${Bd.id}/exercices/suivant`, saisie.tok, {});
    check('ouverture à la main : niveau Saisie refusé', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', `${r.status}`);
    r = await appel('POST', `/api/compta/dossiers/${Bd.id}/exercices/suivant`, complet.tok, {});
    check('ouverture à la main : niveau Complet → 2027 ouvert, fiche rendue', r.status === 201 && r.body?.exercicesOuverts?.length === 2 && r.body?.exercicesOuverts?.[1]?.millesime === 2027 && r.body?.exercicesOuverts?.[1]?.periodes?.length === 12 && r.body?.exercice?.millesime === (AUJOURDHUI >= '2027-01-01' ? 2027 : 2026), `${r.status} ${r.body?.message || ''}`);
    ev = await journal(espaceId, 'exercice_ouvert');
    check('journal : ouverture manuelle par le collaborateur Complet', ev?.details?.mode === 'manuelle' && ev?.auteur_id === complet.id && ev?.details?.dossier === Bd.id && !ev?.details?.declencheur);
    const jB = (await appel('GET', `/api/compta/dossiers/${Bd.id}/journaux`, cabinet.tok)).body?.journaux?.find((j) => j.code === 'OD');
    const planB = (await appel('GET', `/api/compta/dossiers/${Bd.id}/plan`, cabinet.tok)).body;
    r = await appel('POST', `/api/compta/dossiers/${Bd.id}/ecritures`, cabinet.tok, { journalId: jB.id, date: '2027-01-05', reference: 'OD-27-1', libelle: 'Écriture de 2027', lignes: [L(compte(planB, '607'), '20'), L(compte(planB, '5321'), '', '20')] });
    const r3 = r.status === 201 ? await appel('POST', `/api/compta/dossiers/${Bd.id}/ecritures/${r.body.ecriture.id}/valider`, cabinet.tok) : r;
    check('dossier B : écriture datée de 2027, numéro OD-2027-000001', r.status === 201 && r3.body?.ecriture?.numero === 'OD-2027-000001', `${r.status} ${r3.body?.ecriture?.numero || r3.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${Bd.id}/archiver`, cabinet.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${Bd.id}/exercices/suivant`, cabinet.tok, {});
    check('dossier archivé : ouverture refusée', r.status === 200 && r2.status === 409 && ['DOSSIER_ARCHIVE', 'DEUX_EXERCICES_OUVERTS'].includes(r2.body?.code), `${r2.status} ${r2.body?.code}`);

    // ── Dossier C (2026, sans écriture) : fin choisie ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: identite('Café Essai X1', '1111111C/A/M/000'), regime: REEL, exercice: { debut: '2026-01-01', fin: '2026-12-31' } });
    const Cd = r.body;
    r = await appel('POST', `/api/compta/dossiers/${Cd.id}/exercices/suivant`, cabinet.tok, { fin: '2027-06-15' });
    check('fin invalide (pas un dernier jour de mois) refusée', r.status === 400, `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', `/api/compta/dossiers/${Cd.id}/exercices/suivant`, cabinet.tok, { fin: '2027-06-30' });
    check('fin choisie : exercice de 6 mois (janvier à juin 2027)', r.status === 201 && r.body?.exercicesOuverts?.[1]?.fin === '2027-06-30' && r.body?.exercicesOuverts?.[1]?.periodes?.length === 6 && r.body?.suivant?.debut === '2027-07-01', `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/compta/dossiers/${Cd.id}`, cabinet.tok, { exercice: { debut: '2026-02-01', fin: '2026-12-31' } });
    check('dates des exercices figées dès l\'exercice suivant ouvert', r.status === 409 && r.body?.code === 'PLUSIEURS_EXERCICES', `${r.status} ${r.body?.code}`);

    // ── Dossier D : premier exercice court, millésimes distincts ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: identite('Pâtisserie Essai X1', '2222222D/A/M/000'), regime: REEL, exercice: { debut: '2026-01-01', fin: '2026-03-31' } });
    const Dd = r.body;
    check('dossier D : exercice suivant d\'avril 2026 à mars 2027, millésime 2027', Dd?.suivant?.debut === '2026-04-01' && Dd?.suivant?.fin === '2027-03-31' && Dd?.suivant?.millesime === 2027, JSON.stringify(Dd?.suivant));
    r = await appel('POST', `/api/compta/dossiers/${Dd.id}/exercices/suivant`, cabinet.tok, {});
    const planD = (await appel('GET', `/api/compta/dossiers/${Dd.id}/plan`, cabinet.tok)).body;
    const jD = Object.fromEntries((await appel('GET', `/api/compta/dossiers/${Dd.id}/journaux`, cabinet.tok)).body?.journaux?.map((j) => [j.code, j]) || []);
    const fD = (await appel('POST', `/api/compta/dossiers/${Dd.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Minoterie Essai' })).body?.tiers;
    const achat = (date, ref) => appel('POST', `/api/compta/dossiers/${Dd.id}/ecritures`, cabinet.tok, { journalId: jD.AC.id, date, reference: ref, libelle: 'Farine', lignes: [L(compte(planD, '607'), '100'), L(compte(planD, '4011'), '', '100', fD?.id)] });
    const a1 = await achat('2026-02-10', 'FA-D1');
    const a2 = await achat('2026-05-10', 'FA-D2');
    const v1 = await appel('POST', `/api/compta/dossiers/${Dd.id}/ecritures/${a1.body?.ecriture?.id}/valider`, cabinet.tok);
    const v2 = await appel('POST', `/api/compta/dossiers/${Dd.id}/ecritures/${a2.body?.ecriture?.id}/valider`, cabinet.tok);
    check('dossier D : AC-2026-000001 (janvier-mars) et AC-2027-000001 (avril-mars) côte à côte', r.status === 201 && v1.body?.ecriture?.numero === 'AC-2026-000001' && v2.body?.ecriture?.numero === 'AC-2027-000001', `${v1.body?.ecriture?.numero} ${v2.body?.ecriture?.numero} ${v2.body?.message || ''}`);
    const modele = await telecharger(`/api/compta/dossiers/${Dd.id}/ecritures/modele-balance-ouverture`, cabinet.tok);
    const wbm = new ExcelJS.Workbook();
    await wbm.xlsx.load(modele.buffer);
    wbm.worksheets[0].addRow(['5321', '', 'Banque au 31/12/2025', '500', '']);
    wbm.worksheets[0].addRow(['10131', '', 'Capital', '', '500']);
    r = await televerser(`/api/compta/dossiers/${Dd.id}/ecritures/import-balance-ouverture`, cabinet.tok, Buffer.from(await wbm.xlsx.writeBuffer()));
    check('balance d\'ouverture importée : dans le premier exercice (01/01/2026)', r.status === 201 && r.body?.ecriture?.date === '2026-01-01' && r.body?.ecriture?.reference === 'AN-2026', `${r.status} ${r.body?.message || ''}`);

    // ── Facture envoyée depuis LabFlow : la règle de date du pont ouvre l'exercice suivant ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: identite('Traiteur Essai X1', '3333333E/A/M/000'), regime: REEL, exercice: { debut: '2025-01-01', fin: '2025-12-31' } });
    const Ed = r.body;
    const pont = require('../src/services/pontCompta');
    const db = await pool.connect();
    let datePont = null;
    let refusPont = null;
    try {
      await db.query('BEGIN');
      const dLigne = (await db.query('SELECT * FROM compta.dossiers WHERE id = $1 FOR UPDATE', [Ed.id])).rows[0];
      try { await pont.dateDe(db, dLigne, '2027-02-01', { espaceId, auteurId: cabinet.id, origine: 'labflow' }); } catch (e) { refusPont = e.code; }
      datePont = await pont.dateDe(db, dLigne, '2026-02-01', { espaceId, auteurId: cabinet.id, origine: 'labflow' });
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      console.log(e.message);
    } finally {
      db.release();
    }
    ev = await journal(espaceId, 'exercice_ouvert');
    const xE = (await pool.query(`SELECT millesime, ouverture FROM compta.exercices WHERE dossier_id = $1 AND debut = '2026-01-01'`, [Ed.id])).rows[0];
    check('facture de LabFlow datée de 2026 : l\'exercice 2026 s\'ouvre (origine labflow) ; une de 2027 reste refusée', datePont?.date === '2026-02-01' && datePont?.dateReelle === null && xE?.millesime === 2026 && xE?.ouverture === 'auto' && ev?.details?.declencheur?.origine === 'labflow' && refusPont === 'DATE_APRES_EXERCICE', `${JSON.stringify(datePont)} ${JSON.stringify(xE)} ${refusPont}`);

    // ── Cloisonnement, rejeu de la migration ──
    r = await appel('POST', `/api/compta/dossiers/${Cd.id}/exercices/suivant`, autre.tok, {});
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/livres/balance`, autre.tok);
    check('un autre cabinet : dossier introuvable', r.status === 404 && r2.status === 404, `${r.status} ${r2.status}`);
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '234_compta_exercice_suivant.sql'), 'utf8');
    let rejeu = true;
    try { await pool.query(sql); } catch (e) { rejeu = false; console.log(e.message); }
    const avantRejeu = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.exercices WHERE millesime IS NULL')).rows[0].n;
    check('migration 234 rejouable, aucun exercice sans millésime', rejeu && avantRejeu === 0);
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
