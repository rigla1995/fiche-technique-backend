/* Test E2E local — LabFlow Compta, étape E1 « Le bilan et l'état de résultat » (labflow-reprise/achats-compta/
 * PLAN-ETATS-FINANCIERS.md §2 ligne E1, §3 ; réponses du client du 14/10 — « ok pour les 5 »).
 *   dossier A (exercice 2025, fini, non clos) : capital 10 000, vente 1 000 (client), achat 400 (fournisseur), crédit de
 *   TVA 300, véhicule 5 000 financé par un emprunt, dotation 1 000 — perte de 400 — et un brouillard de novembre (vente 50) ;
 *   la page : exercice du jour par défaut, situation provisoire, première colonne seule (premier exercice), bilan (postes,
 *   « moins », net, totaux 15 000 = 15 000), état de résultat (revenus, achats, dotations, résultat net −400), comptes par
 *   poste, contrôles au vert, mentions (entreprise, matricule, arrêté, unité) ; brouillard compris (banque 9 750, revenus
 *   1 050, résultat −350) ; exercice d'un autre dossier 404 ; Saisie lit, autre cabinet 404 ; PDF ; un compte hors
 *   nomenclature (19) porté par un brouillard : sans poste, bilan déséquilibré ; 2026 ouvert : soldes provisoires (report
 *   de X1, résultat 2025 en résultats reportés), colonne 2025 ; CLÔTURE de 2025 : états de l'exercice clos (écriture de
 *   résultat exclue, mêmes chiffres, résultat figé), états de 2026 sur les à-nouveaux écrits (colonne 2025) ;
 *   dossier B (2026, en cours) : premier exercice, rien à présenter ; rejeu de la migration 242.
 * Crée un super_admin, deux cabinets (1 gérant acheté) et une collaboratrice temporaires ; règle les tarifs Compta le
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
  const ADMIN = 'test-admin-compta-e1@example.com';
  const CABINET = 'test-cabinet-compta-e1@example.com';
  const AUTRE = 'test-autre-compta-e1@example.com';
  const SAISIE = 'test-saisie-compta-e1@example.com';
  const TOUS = [ADMIN, CABINET, AUTRE, SAISIE];
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
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };
  const REEL = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const identite = (nom, mf) => ({ raisonSociale: nom, formeJuridique: 'SARL', matriculeFiscal: mf, adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' });
  // Le compte imputable d'un numéro : lui-même s'il n'est pas subdivisé, sinon son premier sous-compte imputable.
  const feuille = (plan, numero) => {
    const comptes = (plan?.comptes || []).filter((c) => c.actif !== false);
    const estFeuille = (c) => !comptes.some((o) => o.numero !== c.numero && o.numero.startsWith(c.numero));
    const lui = comptes.find((c) => c.numero === numero);
    if (lui && estFeuille(lui)) return lui;
    return comptes.filter((c) => c.numero.startsWith(numero) && estFeuille(c)).sort((a, b) => (a.numero < b.numero ? -1 : 1))[0] || null;
  };
  const L = (k, debit, credit, tiersId = null) => ({ compteId: k.id, tiersId, debit: debit || '', credit: credit || '' });
  const postesDe = (cote) => { const m = new Map(); for (const g of cote?.groupes || []) for (const ru of g.rubriques) for (const po of ru.postes) m.set(po.code, po); return m; };
  const lignesDe = (res) => new Map((res?.lignes || []).filter((l) => l.code).map((l) => [l.code, l]));
  const controle = (c, code) => c?.controles?.find((x) => x.code === code);
  const kos = (c) => (c?.controles || []).filter((x) => !x.ok).map((x) => x.code).join(',');

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin E1', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    const adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (1 gérant acheté) avec une collaboratrice Saisie, et un autre cabinet ──
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet E1', email: CABINET, telephone: '20 555 301', raisonSociale: 'Cabinet Essai E1', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet E1', representantQualite: 'Gérant', nbGerants: 1,
    });
    let r2 = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Autre E1', email: AUTRE, telephone: '20 555 302', raisonSociale: 'Autre Cabinet E1', formeJuridique: 'SARL',
      adresse: '2 rue de Rome', ville: 'Tunis', representantNom: 'TEST Autre E1', representantQualite: 'Gérant', nbGerants: 0,
    });
    check('création des deux cabinets', r.status === 201 && r2.status === 201, `${r.status} ${r2.status}`);
    const cabinet = await activer(CABINET);
    const autre = await activer(AUTRE);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaboratrice Saisie', email: SAISIE, niveau: 'saisie', dossiers: 'tous' });
    const saisie = await activer(SAISIE);
    check('titulaire et Saisie connectés', !!cabinet.tok && !!espaceId && r.status === 201 && !!saisie.tok);

    // ── Dossier A : exercice 2025 (fini, non clos) ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: identite('Hôtel Essai E1', '1234567A/A/M/000'), regime: REEL, exercice: { debut: '2025-01-01', fin: '2025-12-31' } });
    const A = r.body;
    const X25 = A?.exercice;
    check('dossier A créé (exercice 2025)', r.status === 201 && X25?.millesime === 2025, `${r.status}`);
    const planA = (await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok)).body;
    const K = Object.fromEntries(['10131', '607', '4011', '4111', '5321', '707', '43667', '224', '282', '681', '162'].map((n) => [n, feuille(planA, n)]));
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
      await E(A.id, { journalId: J.OD.id, date: '2025-06-15', reference: 'IMMO-1', libelle: 'Véhicule financé par emprunt', lignes: [L(K['224'], '5000'), L(K['162'], '', '5000')] }),
      await E(A.id, { journalId: J.OD.id, date: '2025-06-30', reference: 'TVA-2025-06', libelle: 'Crédit de TVA à reporter', lignes: [L(K['43667'], '300'), L(K['5321'], '', '300')] }),
      await E(A.id, { journalId: J.OD.id, date: '2025-12-31', reference: 'DOT-2025', libelle: 'Dotation aux amortissements', lignes: [L(K['681'], '1000'), L(K['282'], '', '1000')] }),
    ];
    const periodes25 = (await appel('GET', `/api/compta/dossiers/${A.id}/periodes?exercice=${X25.id}`, cabinet.tok)).body?.exercice?.periodes;
    const juin = periodes25?.find((p) => p.debut === '2025-06-01');
    const decembre = periodes25?.find((p) => p.debut === '2025-12-01');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${juin?.id}/valider`, cabinet.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${decembre?.id}/valider`, cabinet.tok);
    const brouillon = await E(A.id, { journalId: J.VT.id, date: '2025-11-20', reference: 'FV-2', libelle: 'Vente de novembre (brouillard)', lignes: [L(K['5321'], '50'), L(K['707'], '', '50')] });
    check('2025 : six écritures validées (juin, décembre), un brouillard de novembre', e2025.every((x) => x.status === 201) && r.status === 200 && r.body?.validees === 5 && r2.status === 200 && r2.body?.validees === 1 && brouillon.status === 201, `${e2025.map((x) => x.status).join(',')} ${r.status} ${r.body?.validees} ${r2.status} ${r2.body?.validees}`);

    // ── La page : exercice du jour par défaut, situation provisoire, première colonne seule ──
    const G = (dossierId, q = '', jeton = cabinet.tok) => appel('GET', `/api/compta/dossiers/${dossierId}/etats${q}`, jeton);
    r = await G(A.id);
    let c = r.body;
    check('états A : exercice 2025 par défaut, situation provisoire (exercice non clos), premier exercice (colonne N−1 vide), mentions', r.status === 200 && c?.selection?.exercice === X25.id && c?.selection?.brouillard === false && c?.precedent === null && c?.entete?.arrete === 'Situation provisoire au 31/12/2025 (exercice non clos)' && c?.entete?.provisoire === true && c?.entete?.colonnes?.n1 === 'Premier exercice' && c?.entete?.entreprise === 'Hôtel Essai E1' && c?.entete?.matricule === '1234567A/A/M/000' && c?.entete?.forme === 'SARL' && c?.exercice?.fini === true && c?.exercice?.clos === null, `${r.status} ${JSON.stringify(c?.entete)}`);
    let A_ = postesDe(c?.bilan?.actifs);
    let P_ = postesDe(c?.bilan?.passifs);
    check('bilan 2025 (validées) : actifs — véhicule 5 000 moins 1 000 = 4 000, clients 1 000, autres actifs courants 300, liquidités 9 700 ; total 15 000', A_.get('immobilisationsCorporelles')?.n === '5000.000' && A_.get('immobilisationsCorporelles')?.moins?.n === '1000.000' && A_.get('immobilisationsCorporelles')?.net?.n === '4000.000' && A_.get('clients')?.net?.n === '1000.000' && A_.get('autresActifsCourants')?.net?.n === '300.000' && A_.get('liquidites')?.net?.n === '9700.000' && c?.bilan?.actifs?.total?.n === '15000.000' && [...A_.keys()].join(',') === 'immobilisationsCorporelles,clients,autresActifsCourants,liquidites', JSON.stringify([...A_.entries()].map(([k, v]) => [k, v.n, v.net?.n])));
    check('bilan 2025 : capitaux propres — capital 10 000, résultat −400 (perte), total 9 600 ; emprunts 5 000 ; fournisseurs 400 ; total 15 000', P_.get('capital')?.n === '10000.000' && P_.get('totalAvantResultat')?.n === '10000.000' && P_.get('resultatExercice')?.n === '-400.000' && c?.bilan?.passifs?.groupes?.[0]?.total?.n === '9600.000' && P_.get('emprunts')?.n === '5000.000' && P_.get('fournisseurs')?.n === '400.000' && c?.bilan?.passifs?.total?.n === '15000.000' && !P_.has('resultatsReportes'), JSON.stringify([...P_.entries()].map(([k, v]) => [k, v.n])));
    check('bilan 2025 : les comptes de chaque poste (5321 sous liquidités, 4011 sous fournisseurs, 282 sous « moins »)', A_.get('liquidites')?.comptes?.map((k) => k.numero).join(',') === K['5321'].numero && P_.get('fournisseurs')?.comptes?.[0]?.numero === K['4011'].numero && A_.get('immobilisationsCorporelles')?.moins?.comptes?.[0]?.numero === K['282'].numero && A_.get('immobilisationsCorporelles')?.moins?.comptes?.[0]?.n === '1000.000', JSON.stringify(A_.get('immobilisationsCorporelles')?.moins));
    let L_ = lignesDe(c?.resultat);
    check('état de résultat 2025 : revenus 1 000, achats de marchandises (400), dotations (1 000), total des charges (1 400), résultat net (400) ; lignes à zéro omises', L_.get('revenus')?.n === '1000.000' && L_.get('achatsMarchandises')?.n === '-400.000' && L_.get('dotations')?.n === '-1000.000' && L_.get('totalChargesExploitation')?.n === '-1400.000' && L_.get('resultatExploitation')?.n === '-400.000' && L_.get('resultatNet')?.n === '-400.000' && c?.resultat?.net?.n === '-400.000' && !L_.has('chargesPersonnel') && c?.resultat?.lignes?.[0]?.titre === 'Produits d\'exploitation', JSON.stringify([...L_.entries()].map(([k, v]) => [k, v.n])));
    check('contrôles 2025 au vert ; 1 écriture en brouillard non comprise ; exercices listés', c?.pret === true && kos(c) === '' && c?.brouillard?.nb === 1 && c?.brouillard?.compris === false && c?.exercices?.length === 1 && c?.sansPoste?.length === 0 && /figé/.test(controle(c, 'resultat')?.detail) === false, `${kos(c)} ${JSON.stringify(c?.brouillard)}`);
    r = await G(A.id, '?brouillard=1');
    c = r.body;
    A_ = postesDe(c?.bilan?.actifs);
    L_ = lignesDe(c?.resultat);
    check('brouillard compris : liquidités 9 750, revenus 1 050, résultat −350, mention « brouillard compris », provisoire', r.status === 200 && c?.selection?.brouillard === true && A_.get('liquidites')?.net?.n === '9750.000' && L_.get('revenus')?.n === '1050.000' && L_.get('resultatNet')?.n === '-350.000' && c?.entete?.arrete === 'Situation provisoire au 31/12/2025 (exercice non clos, brouillard compris)' && c?.bilan?.actifs?.total?.n === c?.bilan?.passifs?.total?.n, `${c?.entete?.arrete} ${A_.get('liquidites')?.net?.n}`);
    const nbEcritures = async (dossierId) => (await pool.query('SELECT COUNT(*)::int AS n FROM compta.ecritures WHERE dossier_id = $1', [dossierId])).rows[0].n;
    check('rien n\'est écrit par la lecture', (await nbEcritures(A.id)) === 7);

    // ── Qui lit, quel exercice ──
    r = await G(A.id, '', saisie.tok);
    r2 = await G(A.id, '', autre.tok);
    const r3 = await G(A.id, '?exercice=abc');
    check('Saisie lit (200), autre cabinet 404, exercice inconnu 404', r.status === 200 && r2.status === 404 && r3.status === 404, `${r.status} ${r2.status} ${r3.status}`);
    const rawPdf = await fetch(`${BASE}/api/compta/dossiers/${A.id}/etats.pdf?exercice=${X25.id}`, { headers: { Authorization: `Bearer ${cabinet.tok}` } });
    const pdfBuf = Buffer.from(await rawPdf.arrayBuffer());
    check('PDF des états : 200, application/pdf, nom de fichier, document complet', rawPdf.status === 200 && /application\/pdf/.test(rawPdf.headers.get('content-type') || '') && /etats-financiers-Hotel-Essai-E1-2025\.pdf/.test(rawPdf.headers.get('content-disposition') || '') && pdfBuf.subarray(0, 5).toString() === '%PDF-' && pdfBuf.length > 2000, `${rawPdf.status} ${rawPdf.headers.get('content-disposition')}`);
    r = await G(A.id, '', autre.tok);
    const rawAutre = await fetch(`${BASE}/api/compta/dossiers/${A.id}/etats.pdf`, { headers: { Authorization: `Bearer ${autre.tok}` } });
    check('PDF : autre cabinet 404', rawAutre.status === 404);

    // ── Un compte hors nomenclature (19), porté par un brouillard : sans poste ──
    const k19 = (await pool.query(`INSERT INTO compta.comptes (dossier_id, numero, libelle, classe, parent_id, nature, origine) VALUES ($1, '19', 'Essai hors nomenclature', 1, NULL, 'capitaux', 'ajout') RETURNING id`, [A.id])).rows[0];
    const e19 = await E(A.id, { journalId: J.OD.id, date: '2025-07-01', reference: 'HORS-1', libelle: 'Compte hors nomenclature', lignes: [{ compteId: k19.id, tiersId: null, debit: '300', credit: '' }, L(K['5321'], '', '300')] });
    r = await G(A.id, '?brouillard=1');
    c = r.body;
    check('compte 19 (brouillard compris) : contrôle « sans poste » en rouge, bilan déséquilibré de 300 (actifs 14 750, passifs 15 050), résultat cohérent', e19.status === 201 && kos(c) === 'equilibre,sansPoste,flux' && /19 Essai hors nomenclature \(300,000, 2025\)/.test(controle(c, 'sansPoste')?.detail) && /actifs 14 750,000, capitaux propres et passifs 15 050,000/.test(controle(c, 'equilibre')?.detail) && c?.sansPoste?.[0]?.numero === '19' && c?.pret === false, `${e19.status} ${kos(c)} ${controle(c, 'equilibre')?.detail}`);
    r = await G(A.id);
    check('validées seulement : le brouillard du 19 ne compte pas, tout au vert', r.body?.pret === true && r.body?.brouillard?.nb === 2);
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/ecritures/${e19.body?.ecriture?.id}`, cabinet.tok);
    await pool.query('DELETE FROM compta.comptes WHERE id = $1', [k19.id]);
    check('brouillard du 19 supprimé, compte retiré', r.status === 200);

    // ── 2026 ouvert, 2025 non clos : soldes provisoires (X1), colonne 2025 ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/exercices/suivant`, cabinet.tok, {});
    const X26 = r.body?.exercicesOuverts?.find((x) => x.millesime === 2026);
    r2 = await G(A.id, `?exercice=${X26?.id}`);
    c = r2.body;
    A_ = postesDe(c?.bilan?.actifs);
    P_ = postesDe(c?.bilan?.passifs);
    check('états 2026 (2025 non clos) : report provisoire — capital 10 000, résultat 2025 en résultats reportés (−400), liquidités 9 700 ; équilibré ; mention « exercice précédent non clos »', r.status === 201 && r2.status === 200 && c?.provisoire?.report?.precedent?.millesime === 2025 && c?.provisoire?.report?.resultat === '-400.000' && c?.entete?.arrete === 'Situation provisoire au 31/12/2026 (exercice non clos, exercice précédent non clos)' && P_.get('capital')?.n === '10000.000' && P_.get('resultatsReportes')?.n === '-400.000' && P_.get('resultatExercice')?.n === '0.000' && A_.get('liquidites')?.net?.n === '9700.000' && c?.bilan?.actifs?.total?.n === '15000.000' && c?.bilan?.passifs?.total?.n === '15000.000' && kos(c) === '', `${r.status} ${r2.status} ${c?.entete?.arrete} ${JSON.stringify([...P_.entries()].map(([k, v]) => [k, v.n]))} ${kos(c)}`);
    check('états 2026 : colonne 2025 — exercice précédent, résultat −400 en N−1, revenus 1 000 en N−1, rien en N', c?.precedent?.millesime === 2025 && c?.entete?.colonnes?.n1 === 'Exercice 2025' && P_.get('resultatExercice')?.n1 === '-400.000' && lignesDe(c?.resultat).get('revenus')?.n1 === '1000.000' && lignesDe(c?.resultat).get('revenus')?.n === '0.000' && c?.bilan?.actifs?.total?.n1 === '15000.000' && c?.exercices?.length === 2, JSON.stringify(c?.entete?.colonnes));
    check('exercice d\'un autre dossier : 404', (await G(A.id, '?exercice=999999')).status === 404);

    // ── La clôture de 2025 ──
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/ecritures/${brouillon.body?.ecriture?.id}`, cabinet.tok);
    let closes = 0;
    for (const p of periodes25.filter((p) => p.debut < '2025-12-01')) closes += (await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${p.id}/clore`, cabinet.tok)).status === 200 ? 1 : 0;
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/exercices/${X25.id}/cloturer`, cabinet.tok, {});
    check('2025 clôturé (perte de 400 au 135, à-nouveaux dans 2026)', r.status === 200 && closes === 11 && r2.status === 201 && r2.body?.exercice?.clos?.resultat === '-400.000' && r2.body?.ecritures?.anouveaux?.numero === 'AN-2026-000001', `${r.status} ${closes} ${r2.status} ${r2.body?.message || ''}`);
    r = await G(A.id, `?exercice=${X25.id}`);
    c = r.body;
    A_ = postesDe(c?.bilan?.actifs);
    P_ = postesDe(c?.bilan?.passifs);
    L_ = lignesDe(c?.resultat);
    check('états 2025 clos : « Exercice clos le 31/12/2025 », définitif, mêmes chiffres (écriture de résultat exclue : revenus 1 000, résultat −400, total 15 000), résultat figé contrôlé', r.status === 200 && c?.entete?.arrete === 'Exercice clos le 31/12/2025' && c?.entete?.provisoire === false && c?.exercice?.clos?.resultat === '-400.000' && L_.get('revenus')?.n === '1000.000' && L_.get('resultatNet')?.n === '-400.000' && P_.get('resultatExercice')?.n === '-400.000' && !P_.has('resultatsReportes') && c?.bilan?.actifs?.total?.n === '15000.000' && c?.bilan?.passifs?.total?.n === '15000.000' && kos(c) === '' && /figé à la clôture/.test(controle(c, 'resultat')?.detail) && c?.brouillard?.nb === 0, `${c?.entete?.arrete} ${kos(c)} ${controle(c, 'resultat')?.detail}`);
    r = await G(A.id, `?exercice=${X26.id}`);
    c = r.body;
    P_ = postesDe(c?.bilan?.passifs);
    A_ = postesDe(c?.bilan?.actifs);
    check('états 2026 après la clôture : à-nouveaux écrits (plus de report provisoire), 135 en résultats reportés (−400), capital 10 000, liquidités 9 700, colonne 2025 clos ; équilibré', r.status === 200 && c?.provisoire?.report === null && c?.entete?.arrete === 'Situation provisoire au 31/12/2026 (exercice non clos)' && P_.get('resultatsReportes')?.n === '-400.000' && P_.get('resultatsReportes')?.comptes?.[0]?.numero === '135' && P_.get('capital')?.n === '10000.000' && A_.get('liquidites')?.net?.n === '9700.000' && c?.precedent?.etat === 'clos' && P_.get('resultatExercice')?.n1 === '-400.000' && c?.bilan?.actifs?.total?.n === '15000.000' && kos(c) === '', `${JSON.stringify(c?.provisoire)} ${JSON.stringify([...P_.entries()].map(([k, v]) => [k, v.n, v.n1]))}`);
    check('exercice par défaut après la clôture : 2026 (le seul ouvert)', (await G(A.id)).body?.selection?.exercice === X26.id);

    // ── Dossier B (2026, en cours) : premier exercice, rien à présenter ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: identite('Restaurant Essai E1', '7654321B/A/M/000'), regime: REEL, exercice: { debut: '2026-01-01', fin: '2026-12-31' } });
    const Bd = r.body;
    r2 = await G(Bd.id);
    c = r2.body;
    check('dossier B : exercice 2026 par défaut, premier exercice, aucun poste (sauf le résultat à zéro), contrôles au vert, fini selon la date', r2.status === 200 && c?.selection?.exercice === Bd.exercice.id && c?.precedent === null && c?.bilan?.actifs?.groupes?.length === 0 && postesDe(c?.bilan?.passifs).get('resultatExercice')?.n === '0.000' && c?.pret === true && c?.exercice?.fini === (AUJOURDHUI > '2026-12-31'), `${r2.status} ${JSON.stringify(c?.bilan?.actifs)}`);

    // ── Rejeu de la migration 242 (manuel) ──
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '242_manuel_compta_etats.sql'), 'utf8');
    let rejeu = true;
    try { await pool.query(sql); } catch (e) { rejeu = false; console.log(e.message); }
    const fiches = (await pool.query(`SELECT slug, contenu, contenu_defaut FROM manuel_sections WHERE slug IN ('compta-etats', 'compta-dossier', 'compta-cloture', 'compta-livres') AND produit = 'compta'`)).rows;
    const f = (slug) => fiches.find((x) => x.slug === slug);
    check('migration 242 rejouable ; fiche « États financiers » présente ; fiches dossier, clôture et livres retouchées', rejeu && f('compta-etats')?.contenu.startsWith('## 📊 États financiers') && /\*\*États financiers\*\*/.test(f('compta-dossier')?.contenu_defaut || '') && /page \*\*États financiers\*\*/.test(f('compta-cloture')?.contenu_defaut || '') && /page \*\*États financiers\*\*/.test(f('compta-livres')?.contenu_defaut || ''), fiches.map((x) => x.slug).join(','));
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
