/* Test E2E local — LabFlow Compta, étape S6a « Les écritures en brouillard » (labflow-reprise/achats-compta/PLAN-S6.md
 * §1 ligne S6a, §2, §4 ; réponses du client du 08/10 — « ok pour les 8 »).
 *   la page des écritures d'un dossier (droits, exercice et périodes, journaux, comptes imputables seulement, codes de
 *   taxe actifs, tiers actifs avec retenue et délai, comptes rendus) ; les aides à la saisie (ligne de TVA à l'achat et à
 *   la vente, timbre fixe, FODEC, arrondi au millime, retenue sur le TTC hors timbre — opérée à l'achat, subie à la vente —,
 *   refus) ; saisir une facture d'achat (HT 19 %, timbre, retenue, fournisseur), une vente (client, échéance), un règlement
 *   de banque (Saisie, titulaire, Complet) ; numéro provisoire ; journal D16 ; refus (déséquilibre, une ligne, date hors
 *   exercice, compte non imputable ou désactivé, tiers manquant / interdit / du mauvais type / désactivé, code désactivé,
 *   journal désactivé, échéance, pièce, cloisonnement) ; la liste (filtres journal, période, état, recherche par libellé,
 *   pièce et montant, pages) ; une écriture avec ses lignes ; modifier (avant / après) ; les cinq hooks « mouvementé »
 *   (compte, journal, code, tiers, dossier : exercice et suppression) ; supprimer (contenu au journal, numéro non réemployé) ;
 *   dossier archivé ; lecture seule ; « Mon entreprise » du client ; rejeu de la migration 215 ; dossier vide supprimé ;
 *   pages d'avant.
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

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s6a@example.com';
  const CLIENT = 'test-client-compta-s6a@example.com';
  const CABINET = 'test-cabinet-compta-s6a@example.com';
  const SAISIE = 'test-saisie-compta-s6a@example.com';
  const COMPLET = 'test-complet-compta-s6a@example.com';
  const TOUS = [ADMIN, CLIENT, CABINET, SAISIE, COMPLET];
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  let adminTok = null;
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [TOUS])).rows.map((r) => r.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
      // D10 : les dossiers retiennent leur comptabilité (RESTRICT) — l'essai efface les siens d'abord (écritures, lignes, plan, journaux, taxes, tiers suivent, CASCADE).
      await pool.query('DELETE FROM compta.dossiers WHERE espace_id = ANY($1)', [espaces]);
      const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
      if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
      await pool.query(`DELETE FROM compta.evenements WHERE auteur_id = ANY($1) OR (details->>'titulaire')::int = ANY($1) OR espace_id = ANY($2)`, [ids, espaces]);
      await pool.query('DELETE FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM support_demandes WHERE client_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM profil_entreprise WHERE client_id = ANY($1)', [ids]);
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
  const IDENTITE_A = { raisonSociale: 'Hôtel Essai S6a', formeJuridique: 'SARL', matriculeFiscal: '1234567A/A/M/000', adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' };
  const REEL = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const FORFAIT = { personne: 'physique', impot: 'IRPP', tva: 'forfaitaire', exportateurTotal: false, teledeclaration: false, debutActivite: null };
  const CIVIL = { debut: '2026-01-01', fin: '2026-12-31' };
  const compte = (plan, numero) => plan?.comptes?.find((c) => c.numero === numero);
  const numeros = (etat) => (etat?.ecritures || []).map((e) => e.numeroProvisoire).join(',');

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S6a', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (2 gérants achetés) avec deux collaborateurs, un client LabFlow (module) ──
    let r2 = null;
    let r3 = null;
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S6a', email: CABINET, telephone: '20 555 097', raisonSociale: 'Cabinet Essai S6a', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S6a', representantQualite: 'Gérant', nbGerants: 2,
    });
    check('création du cabinet (2 gérants achetés)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const cabinet = await activer(CABINET);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    check('connexion du titulaire', !!cabinet.tok && !!espaceId);
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaboratrice Saisie', email: SAISIE, niveau: 'saisie', dossiers: 'tous' });
    check('collaboratrice de niveau Saisie', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Complet', email: COMPLET, niveau: 'complet', dossiers: 'tous' });
    check('collaborateur de niveau Complet', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const saisie = await activer(SAISIE);
    const complet = await activer(COMPLET);
    check('connexion des collaborateurs', !!saisie.tok && !!complet.tok);
    r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client S6a', email: CLIENT, telephone: '20 555 098', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    const client = await activer(CLIENT);
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 0 });
    const espaceClient = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [client.id])).rows[0]?.id;
    check('client LabFlow avec le module Comptabilité', !!client.tok && r.status === 200 && !!espaceClient, `${r.status} ${r.body?.message || ''}`);

    // ── Dossier A (réel) : plan, journaux, taxes, tiers ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REEL, exercice: CIVIL });
    const A = r.body;
    check('dossier A créé : la fiche compte 0 écriture, droit « saisir », non mouvementé', r.status === 201 && A?.ecritures?.nbBrouillard === 0 && A?.ecritures?.nbValidees === 0 && A?.droits?.saisir === true && A?.mouvemente === false, `${r.status} ${JSON.stringify(A?.ecritures)} ${JSON.stringify(A?.droits)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok);
    const planA = r.body;
    const K = Object.fromEntries(['607', '601', '6654', '6651', '43666', '436711', '4011', '4111', '5321', '5411', '432', '4341', '60', '707', '622'].map((n) => [n, compte(planA, n)]));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok);
    const X = Object.fromEntries(['TVA19', 'TIMBRE', 'RS_MAR15', 'RS_HON10', 'FODEC', 'TVAEXO', 'RSTVA25', 'RSTVA100', 'AV_FORF1'].map((c) => [c, r.body?.taxes?.find((t) => t.code === c)]));
    const c43665 = compte(planA, '43665');
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    const J = Object.fromEntries(['AC', 'VT', 'BQ', 'CA', 'OD', 'AN'].map((c) => [c, r.body?.journaux?.find((j) => j.code === c)]));
    check('plan, taxes et journaux de A lus', Object.values(K).every(Boolean) && Object.values(X).every(Boolean) && Object.values(J).every(Boolean), `${Object.entries(K).filter(([, v]) => !v).map(([k]) => k)} ${Object.entries(X).filter(([, v]) => !v).map(([k]) => k)}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Société Tunisienne de Boissons', retenueId: X.RS_MAR15.id, delaiPaiement: 30 });
    const F1 = r.body?.tiers;
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Boulangerie du Port' });
    const F2 = r2.body?.tiers;
    r3 = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'client', nom: 'Voyages Méditerranée', delaiPaiement: 45 });
    const C1 = r3.body?.tiers;
    check('tiers de A : F0001 (RS_MAR15, 30 jours), F0002 (sans retenue), C0001 (45 jours)', F1?.code === 'F0001' && F2?.code === 'F0002' && C1?.code === 'C0001', `${r.status} ${r2.status} ${r3.status}`);

    // ── La page des écritures : droits, exercice et périodes, choix de la saisie ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures`, cabinet.tok);
    let etat = r.body;
    const periodes = etat?.exercice?.periodes || [];
    const pMars = periodes.find((p) => p.debut === '2026-03-01');
    const pFev = periodes.find((p) => p.debut === '2026-02-01');
    check('titulaire : page vide, droits saisir et configurer, exercice 2026 avec 12 périodes ouvertes, comptes rendus à zéro',
      r.status === 200 && etat?.droits?.saisir === true && etat?.droits?.configurer === true && etat?.exercice?.debut === '2026-01-01' && periodes.length === 12 && periodes.every((p) => p.etat === 'ouverte') && !!pMars && !!pFev
      && etat?.nb?.brouillard === 0 && etat?.nb?.validees === 0 && etat?.total === 0 && etat?.page === 1 && etat?.limite === 25 && etat?.ecritures?.length === 0, `${r.status} ${JSON.stringify(etat?.nb)} ${periodes.length}`);
    check('… choix de la saisie : 6 journaux, comptes imputables seulement (607, 4011, 5321, 43666 ; ni 60 ni 532), codes actifs (TVA19, RS_MAR15, TIMBRE), 3 tiers avec retenue et délai, états, bornes',
      etat?.journaux?.length === 6 && etat.journaux.every((j) => j.actif) && etat?.comptes?.every((c) => c.imputable && c.actif) && ['607', '4011', '5321', '43666', '432', '4341'].every((n) => etat.comptes.some((c) => c.numero === n)) && !etat.comptes.some((c) => c.numero === '60' || c.numero === '532')
      && etat?.taxes?.every((x) => x.actif) && ['TVA19', 'RS_MAR15', 'TIMBRE'].every((c) => etat.taxes.some((x) => x.code === c)) && etat?.tiers?.length === 3 && etat.tiers.find((t) => t.code === 'F0001')?.retenue?.code === 'RS_MAR15' && etat.tiers.find((t) => t.code === 'F0001')?.delaiPaiement === 30 && etat.tiers.find((t) => t.code === 'F0002')?.retenue === null
      && etat?.etats?.length === 2 && etat?.bornes?.referenceMax === 80 && etat?.bornes?.lignesMin === 2 && etat?.bornes?.lignesMax === 200 && etat?.etatAbonnement === 'actif', `${etat?.journaux?.length} ${etat?.comptes?.length} ${etat?.taxes?.length} ${etat?.tiers?.length}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures`, saisie.tok);
    check('collaboratrice Saisie : lit, droit « saisir » oui, « configurer » non (réponse 4 du 08/10)', r.status === 200 && r.body?.droits?.saisir === true && r.body?.droits?.configurer === false, `${r.status} ${JSON.stringify(r.body?.droits)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures`, client.tok);
    check('un client étranger au cabinet : 404', r.status === 404, String(r.status));
    r = await appel('GET', '/api/compta/dossiers/abc/ecritures', cabinet.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures?etat=x`, cabinet.tok);
    r3 = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures?page=0`, cabinet.tok);
    check('identifiant mal formé : 404 ; état inconnu, page 0 : 400', r.status === 404 && r2.status === 400 && r3.status === 400, `${r.status} ${r2.status} ${r3.status}`);

    // ── Aides à la saisie : TVA, timbre, FODEC, retenue ──
    const ec = (chemin, jeton, corps) => appel('POST', `/api/compta/dossiers/${A.id}/ecritures${chemin}`, jeton, corps);
    r = await ec('/aide/taxe', saisie.tok, { journalId: J.AC.id, ligne: { compteId: K['607'].id, debit: '1 000,000', taxeId: X.TVA19.id } });
    check('aide TVA (Saisie) : achat 1 000,000 HT TVA19 → ligne 43666 au débit de 190,000, code TVA19, base 1 000,000', r.status === 200 && r.body?.ligne?.compteId === K['43666'].id && r.body?.ligne?.debit === '190.000' && r.body?.ligne?.credit === '0.000' && r.body?.ligne?.taxeId === X.TVA19.id && r.body?.base === '1000.000' && r.body?.compte?.numero === '43666' && r.body?.taxe?.code === 'TVA19', `${r.status} ${JSON.stringify(r.body)}`);
    r = await ec('/aide/taxe', cabinet.tok, { journalId: J.VT.id, ligne: { compteId: K['707'].id, credit: '1000', taxeId: X.TVA19.id } });
    check('aide TVA : vente 1 000 HT au crédit → ligne 436711 au crédit de 190,000 (compte à la vente)', r.status === 200 && r.body?.ligne?.compteId === K['436711'].id && r.body?.ligne?.credit === '190.000' && r.body?.ligne?.debit === '0.000', `${r.status} ${JSON.stringify(r.body)}`);
    r = await ec('/aide/taxe', cabinet.tok, { journalId: J.AC.id, ligne: { compteId: K['607'].id, debit: '1191', taxeId: X.TIMBRE.id } });
    check('aide timbre : montant fixe 1,000 sur 6654 au débit', r.status === 200 && r.body?.ligne?.compteId === K['6654'].id && r.body?.ligne?.debit === '1.000', `${r.status} ${JSON.stringify(r.body)}`);
    r = await ec('/aide/taxe', cabinet.tok, { journalId: J.AC.id, ligne: { compteId: K['607'].id, debit: '1000', taxeId: X.FODEC.id } });
    check('aide FODEC : 1 % → 10,000 sur 6651', r.status === 200 && r.body?.ligne?.compteId === K['6651'].id && r.body?.ligne?.debit === '10.000', `${r.status} ${JSON.stringify(r.body)}`);
    r = await ec('/aide/taxe', cabinet.tok, { journalId: J.AC.id, ligne: { compteId: K['607'].id, debit: '0,003', taxeId: X.TVA19.id } });
    r2 = await ec('/aide/taxe', cabinet.tok, { journalId: J.AC.id, ligne: { compteId: K['607'].id, debit: '0,002', taxeId: X.TVA19.id } });
    check('arrondi au millime : 0,003 × 19 % = 0,001 ; 0,002 × 19 % → aucun montant (400 MONTANT_NUL)', r.status === 200 && r.body?.ligne?.debit === '0.001' && r2.status === 400 && r2.body?.code === 'MONTANT_NUL', `${r.status} ${r.body?.ligne?.debit} ${r2.status} ${r2.body?.code}`);
    r = await ec('/aide/taxe', cabinet.tok, { journalId: J.AC.id, ligne: { compteId: K['607'].id, debit: '1000', taxeId: X.RS_MAR15.id } });
    r2 = await ec('/aide/taxe', cabinet.tok, { journalId: J.AC.id, ligne: { compteId: K['607'].id, debit: '1000' } });
    r3 = await ec('/aide/taxe', cabinet.tok, { journalId: J.AC.id, ligne: { compteId: K['60'].id, debit: '1000', taxeId: X.TVA19.id } });
    check('aide taxe refusée : code sur le TTC (400 ASSIETTE_TTC), ligne sans code (400), compte 60 non imputable (409)', r.status === 400 && r.body?.code === 'ASSIETTE_TTC' && r2.status === 400 && r3.status === 409 && r3.body?.code === 'COMPTE_NON_IMPUTABLE', `${r.status} ${r.body?.code} ${r2.status} ${r3.status} ${r3.body?.code}`);
    const LIGNES_ACHAT = [
      { compteId: K['607'].id, debit: '1000', taxeId: X.TVA19.id }, { compteId: K['43666'].id, debit: '190', taxeId: X.TVA19.id }, { compteId: K['6654'].id, debit: '1', taxeId: X.TIMBRE.id },
      { compteId: K['4011'].id, tiersId: F1.id, credit: '1191' },
    ];
    r = await ec('/aide/retenue', saisie.tok, { journalId: J.AC.id, tiersId: F1.id, lignes: LIGNES_ACHAT });
    check('aide retenue (Saisie) : retenue par défaut du fournisseur RS_MAR15 sur le TTC hors timbre 1 190,000 → 432 au crédit de 17,850', r.status === 200 && r.body?.ligne?.compteId === K['432'].id && r.body?.ligne?.credit === '17.850' && r.body?.ligne?.debit === '0.000' && r.body?.base === '1190.000' && r.body?.taxe?.code === 'RS_MAR15' && r.body?.ligne?.taxeId === X.RS_MAR15.id, `${r.status} ${JSON.stringify(r.body)}`);
    r = await ec('/aide/retenue', cabinet.tok, { journalId: J.AC.id, tiersId: F1.id, taxeId: X.RS_HON10.id, lignes: LIGNES_ACHAT });
    check('aide retenue avec le code choisi RS_HON10 (10 %) : 119,000', r.status === 200 && r.body?.ligne?.credit === '119.000' && r.body?.taxe?.code === 'RS_HON10', `${r.status} ${JSON.stringify(r.body?.ligne)}`);
    r = await ec('/aide/retenue', cabinet.tok, { journalId: J.VT.id, tiersId: C1.id, taxeId: X.RS_HON10.id, lignes: [{ compteId: K['4111'].id, tiersId: C1.id, debit: '1190' }, { compteId: K['707'].id, credit: '1000', taxeId: X.TVA19.id }, { compteId: K['436711'].id, credit: '190', taxeId: X.TVA19.id }] });
    check('aide retenue à la vente : retenue subie, 4341 au débit de 119,000 (crédits − débits des lignes hors client)', r.status === 200 && r.body?.ligne?.compteId === K['4341'].id && r.body?.ligne?.debit === '119.000' && r.body?.base === '1190.000', `${r.status} ${JSON.stringify(r.body)}`);
    r = await ec('/aide/retenue', cabinet.tok, { journalId: J.BQ.id, tiersId: F1.id, lignes: LIGNES_ACHAT });
    r2 = await ec('/aide/retenue', cabinet.tok, { journalId: J.AC.id, tiersId: F2.id, lignes: LIGNES_ACHAT });
    r3 = await ec('/aide/retenue', cabinet.tok, { journalId: J.AC.id, tiersId: F1.id, taxeId: X.TVA19.id, lignes: LIGNES_ACHAT });
    check('aide retenue refusée : journal de banque (400), fournisseur sans retenue par défaut (409 RETENUE_ABSENTE), TVA19 comme retenue (400)', r.status === 400 && r.body?.code === 'JOURNAL_SANS_RETENUE' && r2.status === 409 && r2.body?.code === 'RETENUE_ABSENTE' && r3.status === 400, `${r.status} ${r2.status} ${r2.body?.code} ${r3.status}`);
    r = await ec('/aide/retenue', cabinet.tok, { journalId: J.AC.id, tiersId: F1.id, lignes: [{ compteId: K['4011'].id, tiersId: F1.id, credit: '1191' }] });
    r2 = await ec('/aide/taxe', client.tok, { journalId: J.AC.id, ligne: { compteId: K['607'].id, debit: '1000', taxeId: X.TVA19.id } });
    check('… assiette nulle (seule la ligne du tiers) : 400 ASSIETTE_NULLE ; personne étrangère : 404', r.status === 400 && r.body?.code === 'ASSIETTE_NULLE' && r2.status === 404, `${r.status} ${r.body?.code} ${r2.status}`);
    // Relecture : code sans taux (TVAEXO), retenue de TVA (assiette « tva »), avance.
    r = await ec('/aide/taxe', cabinet.tok, { journalId: J.AC.id, ligne: { compteId: K['607'].id, debit: '1000', taxeId: X.TVAEXO.id } });
    r2 = await ec('/aide/taxe', cabinet.tok, { journalId: J.VT.id, ligne: { compteId: K['707'].id, credit: '1000', taxeId: X.RSTVA25.id } });
    check('aide taxe : TVAEXO (sans taux) → 400 MONTANT_NUL, jamais 500 ; RSTVA25 posé sur la ligne HT → 400 ASSIETTE_TVA', r.status === 400 && r.body?.code === 'MONTANT_NUL' && r2.status === 400 && r2.body?.code === 'ASSIETTE_TVA', `${r.status} ${r.body?.code} ${r2.status} ${r2.body?.code}`);
    r = await ec('/aide/taxe', cabinet.tok, { journalId: J.VT.id, ligne: { compteId: K['436711'].id, credit: '190', taxeId: X.RSTVA25.id } });
    r2 = await ec('/aide/retenue', cabinet.tok, { journalId: J.VT.id, tiersId: C1.id, taxeId: X.RSTVA25.id, lignes: [{ compteId: K['4111'].id, tiersId: C1.id, debit: '1190' }, { compteId: K['707'].id, credit: '1000', taxeId: X.TVA19.id }, { compteId: K['436711'].id, credit: '190', taxeId: X.TVA19.id }] });
    check('retenue de TVA RSTVA25 (vente) : sur la ligne de TVA → 43665 au débit de 47,500 ; par « Ajouter la retenue » → même ligne, assiette = la TVA 190,000', r.status === 200 && r.body?.ligne?.compteId === c43665?.id && r.body?.ligne?.debit === '47.500'
      && r2.status === 200 && r2.body?.ligne?.compteId === c43665?.id && r2.body?.ligne?.debit === '47.500' && r2.body?.base === '190.000', `${r.status} ${JSON.stringify(r.body?.ligne)} ${r2.status} ${JSON.stringify(r2.body)}`);
    r = await ec('/aide/retenue', cabinet.tok, { journalId: J.AC.id, tiersId: F1.id, taxeId: X.AV_FORF1.id, lignes: LIGNES_ACHAT });
    check('avance AV_FORF1 (achat) par « Ajouter la retenue » : 1 % du TTC hors timbre, 4341 au débit de 11,900 (même côté que la pièce)', r.status === 200 && r.body?.ligne?.compteId === K['4341'].id && r.body?.ligne?.debit === '11.900' && r.body?.base === '1190.000', `${r.status} ${JSON.stringify(r.body)}`);

    // ── Saisir : achat avec TVA, timbre et retenue (Saisie) ; vente (titulaire) ; banque (Complet) ──
    const ACHAT = {
      journalId: J.AC.id, date: '2026-03-15', reference: 'F-2026-001', libelle: 'Facture STB mars',
      lignes: [
        { compteId: K['607'].id, debit: '1 000,000', taxeId: X.TVA19.id }, { compteId: K['43666'].id, debit: '190', taxeId: X.TVA19.id }, { compteId: K['6654'].id, debit: '1,000', taxeId: X.TIMBRE.id },
        { compteId: K['432'].id, credit: '17.850', taxeId: X.RS_MAR15.id }, { compteId: K['4011'].id, tiersId: F1.id, libelle: 'STB - net à payer', credit: '1173,150', echeance: '2026-04-14' },
      ],
    };
    r = await ec('', saisie.tok, ACHAT);
    let e = r.body?.ecriture;
    check('Saisie saisit la facture d\'achat : 201, B-000001, brouillard, total 1 191,000, 5 lignes présentées (compte, tiers F0001, codes, échéance), auteur',
      r.status === 201 && e?.numeroProvisoire === 'B-000001' && e?.etat === 'brouillard' && e?.total === '1191.000' && e?.journal?.code === 'AC' && e?.date === '2026-03-15' && e?.reference === 'F-2026-001' && e?.nbLignes === 5 && e?.lignes?.length === 5
      && e?.lignes?.[0]?.compte?.numero === '607' && e?.lignes?.[0]?.taxe?.code === 'TVA19' && e?.lignes?.[0]?.debit === '1000.000' && e?.lignes?.[4]?.tiers?.code === 'F0001' && e?.lignes?.[4]?.credit === '1173.150' && e?.lignes?.[4]?.echeance === '2026-04-14' && e?.lignes?.[4]?.libelle === 'STB - net à payer'
      && e?.creePar === 'Collaboratrice Saisie' && r.body?.nb?.brouillard === 1 && e?.numero === null, `${r.status} ${r.body?.message || ''} ${JSON.stringify(e)}`);
    const E1 = e;
    let j = await journal(espaceId, 'ecriture_creee');
    check('journal : ecriture_creee (numéro provisoire, journal, pièce, total, 5 lignes avec comptes, tiers et codes, auteur Saisie)', !!j && j.details?.numeroProvisoire === 'B-000001' && j.details?.journal === 'AC' && j.details?.reference === 'F-2026-001' && j.details?.total === '1191.000' && j.details?.lignes?.length === 5 && j.details.lignes[4].tiers === 'F0001' && j.details.lignes[0].taxe === 'TVA19' && j.details.lignes[3].credit === '17.850' && j.auteur_id === saisie.id, JSON.stringify(j?.details));
    r = await ec('', cabinet.tok, { journalId: J.VT.id, date: '2026-03-20', reference: 'FV-2026-010', libelle: 'Facture Voyages Méditerranée', lignes: [{ compteId: K['4111'].id, tiersId: C1.id, debit: '1190', echeance: '2026-05-04' }, { compteId: K['707'].id, credit: '1000', taxeId: X.TVA19.id }, { compteId: K['436711'].id, credit: '190', taxeId: X.TVA19.id }] });
    const E2 = r.body?.ecriture;
    check('titulaire saisit la vente : B-000002, total 1 190,000, client C0001', r.status === 201 && E2?.numeroProvisoire === 'B-000002' && E2?.total === '1190.000' && E2?.lignes?.[0]?.tiers?.code === 'C0001' && r.body?.nb?.brouillard === 2, `${r.status} ${r.body?.message || ''}`);
    r = await ec('', complet.tok, { journalId: J.BQ.id, date: '2026-03-31', reference: 'RLV-2026-03', libelle: 'Règlement STB', lignes: [{ compteId: K['4011'].id, tiersId: F1.id, debit: '1173.150' }, { compteId: K['5321'].id, credit: '1173.150' }] });
    const E3 = r.body?.ecriture;
    check('Complet saisit le règlement de banque : B-000003', r.status === 201 && E3?.numeroProvisoire === 'B-000003' && E3?.journal?.code === 'BQ' && r.body?.nb?.brouillard === 3, `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, cabinet.tok);
    check('fiche de A : mouvementé, 3 écritures en brouillard, 0 validée', r.status === 200 && r.body?.mouvemente === true && r.body?.ecritures?.nbBrouillard === 3 && r.body?.ecritures?.nbValidees === 0, JSON.stringify(r.body?.ecritures));

    // ── Refus ──
    const base = { journalId: J.AC.id, date: '2026-03-16', reference: 'P', libelle: 'L' };
    const deux = (l1, l2) => ({ ...base, lignes: [l1, l2] });
    const d607 = { compteId: K['607'].id, debit: '100' };
    const c5321 = { compteId: K['5321'].id, credit: '100' };
    r = await ec('', cabinet.tok, deux(d607, { compteId: K['5321'].id, credit: '99.999' }));
    check('déséquilibre d\'un millime : 400 DESEQUILIBRE', r.status === 400 && r.body?.code === 'DESEQUILIBRE' && /écart 0,001/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await ec('', cabinet.tok, { ...base, lignes: [d607] });
    r2 = await ec('', cabinet.tok, deux(d607, { compteId: K['607'].id, credit: '100' }));
    check('une seule ligne : 400 ; deux lignes sur le même compte : 400 COMPTES_IDENTIQUES (NC 01 §30)', r.status === 400 && r2.status === 400 && r2.body?.code === 'COMPTES_IDENTIQUES', `${r.status} ${r2.status} ${r2.body?.code}`);
    r = await ec('', cabinet.tok, { ...deux(d607, c5321), date: '2025-12-31' });
    r2 = await ec('', cabinet.tok, { ...deux(d607, c5321), date: '2027-01-01' });
    r3 = await ec('', cabinet.tok, { ...deux(d607, c5321), date: '16/03/2026' });
    check('date hors de l\'exercice ouvert (31/12/2025, 01/01/2027) : 409 DATE_HORS_EXERCICE ; date mal formée : 400', r.status === 409 && r.body?.code === 'DATE_HORS_EXERCICE' && /du 01\/01\/2026 au 31\/12\/2026/.test(r.body?.message || '') && r2.status === 409 && r3.status === 400, `${r.status} ${r.body?.message} ${r2.status} ${r3.status}`);
    r = await ec('', cabinet.tok, deux({ compteId: K['60'].id, debit: '100' }, c5321));
    check('compte 60 (sous-comptes actifs) : 409 COMPTE_NON_IMPUTABLE', r.status === 409 && r.body?.code === 'COMPTE_NON_IMPUTABLE' && /sous-comptes actifs/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${K['601'].id}/desactiver`, cabinet.tok);
    r2 = await ec('', cabinet.tok, deux({ compteId: K['601'].id, debit: '100' }, c5321));
    r3 = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${K['601'].id}/reactiver`, cabinet.tok);
    check('compte 601 désactivé (sans écriture) : 409 COMPTE_NON_IMPUTABLE ; réactivé', r.status === 200 && r2.status === 409 && r2.body?.code === 'COMPTE_NON_IMPUTABLE' && /désactivé/.test(r2.body?.message || '') && r3.status === 200, `${r.status} ${r2.status} ${r2.body?.message} ${r3.status}`);
    r = await ec('', cabinet.tok, deux(d607, { compteId: K['4011'].id, credit: '100' }));
    r2 = await ec('', cabinet.tok, deux({ ...d607, tiersId: F1.id }, c5321));
    r3 = await ec('', cabinet.tok, deux(d607, { compteId: K['4011'].id, tiersId: C1.id, credit: '100' }));
    check('tiers manquant sur 4011 (400 TIERS_REQUIS), tiers sur 607 (400 TIERS_INTERDIT), client sur 4011 (400)', r.status === 400 && r.body?.code === 'TIERS_REQUIS' && r2.status === 400 && r2.body?.code === 'TIERS_INTERDIT' && r3.status === 400 && /attend un fournisseur/.test(r3.body?.message || ''), `${r.status} ${r.body?.code} ${r2.status} ${r2.body?.code} ${r3.status} ${r3.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers/${F2.id}/desactiver`, cabinet.tok);
    r2 = await ec('', cabinet.tok, deux(d607, { compteId: K['4011'].id, tiersId: F2.id, credit: '100' }));
    r3 = await appel('POST', `/api/compta/dossiers/${A.id}/tiers/${F2.id}/reactiver`, cabinet.tok);
    check('tiers F0002 désactivé : 409 TIERS_DESACTIVE ; réactivé', r.status === 200 && r2.status === 409 && r2.body?.code === 'TIERS_DESACTIVE' && r3.status === 200, `${r2.status} ${r2.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/${X.RS_HON10.id}/desactiver`, cabinet.tok);
    r2 = await ec('', cabinet.tok, deux({ ...d607, taxeId: X.RS_HON10.id }, c5321));
    r3 = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/${X.RS_HON10.id}/reactiver`, cabinet.tok);
    check('code RS_HON10 désactivé : 409 TAXE_DESACTIVEE ; réactivé', r.status === 200 && r2.status === 409 && r2.body?.code === 'TAXE_DESACTIVEE' && r3.status === 200, `${r2.status} ${r2.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux/${J.OD.id}/desactiver`, cabinet.tok);
    r2 = await ec('', cabinet.tok, { ...deux(d607, c5321), journalId: J.OD.id });
    r3 = await appel('POST', `/api/compta/dossiers/${A.id}/journaux/${J.OD.id}/reactiver`, cabinet.tok);
    check('journal OD désactivé : 409 JOURNAL_DESACTIVE ; réactivé', r.status === 200 && r2.status === 409 && r2.body?.code === 'JOURNAL_DESACTIVE' && r3.status === 200, `${r2.status} ${r2.body?.code}`);
    for (const [corps, quoi] of [
      [deux({ ...d607, echeance: '2026-03-15' }, c5321), 'échéance avant la date'], [{ ...deux(d607, c5321), reference: ' ' }, 'pièce vide'], [{ ...deux(d607, c5321), libelle: 'شركة' }, 'libellé en arabe'],
      [deux({ compteId: K['607'].id, debit: '100', credit: '100' }, c5321), 'débit et crédit'], [deux({ compteId: K['607'].id, debit: '1.2345' }, c5321), '4 décimales'], [{ ...deux(d607, c5321), journalId: '' }, 'sans journal'],
    ]) {
      r = await ec('', cabinet.tok, corps);
      check(`${quoi} : 400`, r.status === 400, `${r.status} ${r.body?.message}`);
    }
    const dossierClient = (await pool.query(`SELECT id FROM compta.dossiers WHERE espace_id = $1 AND source = 'labflow'`, [espaceClient])).rows[0];
    r = await appel('GET', `/api/compta/dossiers/${dossierClient?.id}/plan`, client.tok);
    const planC = r.body;
    r = await appel('GET', `/api/compta/dossiers/${dossierClient?.id}/journaux`, client.tok);
    const jClient = r.body?.journaux?.find((x) => x.code === 'CA');
    r = await ec('', cabinet.tok, deux({ compteId: compte(planC, '607')?.id, debit: '100' }, c5321));
    r2 = await ec('', cabinet.tok, { ...deux(d607, c5321), journalId: jClient?.id });
    r3 = await ec('', client.tok, deux(d607, c5321));
    check('compte d\'un autre dossier (404), journal d\'un autre dossier (404), personne étrangère (404)', r.status === 404 && r2.status === 404 && r3.status === 404, `${r.status} ${r2.status} ${r3.status}`);

    // ── La liste : tri, filtres, recherche, pages ; une écriture ──
    const lister = (q, jeton = cabinet.tok) => appel('GET', `/api/compta/dossiers/${A.id}/ecritures${q}`, jeton);
    r = await lister('');
    check('3 écritures, de la plus récente à la plus ancienne (B-000003, B-000002, B-000001), sans leurs lignes', r.status === 200 && numeros(r.body) === 'B-000003,B-000002,B-000001' && r.body?.total === 3 && r.body.ecritures[0].lignes === undefined && r.body.ecritures[0].nbLignes === 2, numeros(r.body));
    r = await lister(`?journal=${J.AC.id}`);
    r2 = await lister(`?periode=${pMars.id}`);
    r3 = await lister(`?periode=${pFev.id}`);
    check('journal AC : 1 ; période de mars : 3 ; période de février : 0', numeros(r.body) === 'B-000001' && r.body?.total === 1 && r2.body?.total === 3 && r3.body?.total === 0, `${numeros(r.body)} ${r2.body?.total} ${r3.body?.total}`);
    r = await lister('?etat=brouillard');
    r2 = await lister('?etat=validee');
    check('état brouillard : 3 ; validées : 0', r.body?.total === 3 && r2.body?.total === 0, `${r.body?.total} ${r2.body?.total}`);
    r = await lister('?q=stb');
    r2 = await lister('?q=FV-2026-010');
    r3 = await lister('?q=1191');
    check('recherche « stb » (libellés, sans casse) : 2 ; par pièce « FV-2026-010 » : 1 ; par montant 1191 (total) : 1', numeros(r.body) === 'B-000003,B-000001' && numeros(r2.body) === 'B-000002' && numeros(r3.body) === 'B-000001', `${numeros(r.body)} | ${numeros(r2.body)} | ${numeros(r3.body)}`);
    r = await lister('?q=17,850');
    r2 = await lister(`?q=${encodeURIComponent('1 173,150')}`);
    r3 = await lister('?q=%25');
    check('montant d\'une ligne 17,850 : 1 ; 1 173,150 (ligne de B-000001 et de B-000003) : 2 ; « % » pris au pied de la lettre : 0', numeros(r.body) === 'B-000001' && numeros(r2.body) === 'B-000003,B-000001' && r3.body?.total === 0, `${numeros(r.body)} | ${numeros(r2.body)} | ${r3.body?.total}`);
    r = await lister('?limite=2');
    r2 = await lister('?limite=2&page=2');
    check('pages de 2 : page 1 = B-000003, B-000002 (total 3) ; page 2 = B-000001', numeros(r.body) === 'B-000003,B-000002' && r.body?.total === 3 && numeros(r2.body) === 'B-000001', `${numeros(r.body)} | ${numeros(r2.body)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures/${E1.id}`, saisie.tok);
    e = r.body?.ecriture;
    check('une écriture (Saisie) : B-000001 avec ses 5 lignes dans l\'ordre, compte, tiers, code, échéance', r.status === 200 && e?.numeroProvisoire === 'B-000001' && e?.lignes?.length === 5 && e.lignes.map((l) => l.rang).join(',') === '1,2,3,4,5' && e.lignes[4].tiers?.code === 'F0001' && e.lignes[2].taxe?.code === 'TIMBRE' && e.lignes[4].echeance === '2026-04-14', `${r.status} ${JSON.stringify(e)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures/999999999`, cabinet.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures/${E1.id}`, client.tok);
    check('écriture inconnue : 404 ; personne étrangère : 404', r.status === 404 && r2.status === 404, `${r.status} ${r2.status}`);

    // ── Modifier (Saisie) : avant / après au journal ──
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/ecritures/${E2.id}`, saisie.tok, { journalId: J.VT.id, date: '2026-03-21', reference: 'FV-2026-010', libelle: 'Facture Voyages Méditerranée (corrigée)', lignes: [{ compteId: K['4111'].id, tiersId: C1.id, debit: '2380', echeance: '2026-05-05' }, { compteId: K['707'].id, credit: '2000', taxeId: X.TVA19.id }, { compteId: K['436711'].id, credit: '380', taxeId: X.TVA19.id }] });
    e = r.body?.ecriture;
    check('Saisie modifie B-000002 (date, libellé, montants) : 200, même numéro provisoire, total 2 380,000, 3 lignes refaites', r.status === 200 && e?.numeroProvisoire === 'B-000002' && e?.total === '2380.000' && e?.date === '2026-03-21' && e?.lignes?.length === 3 && e.lignes[0].debit === '2380.000' && e.lignes[0].echeance === '2026-05-05' && r.body?.nb?.brouillard === 3, `${r.status} ${r.body?.message || ''}`);
    j = await journal(espaceId, 'ecriture_modifiee');
    check('journal : ecriture_modifiee avec avant (1 190,000, 3 lignes) et après (2 380,000)', !!j && j.details?.numeroProvisoire === 'B-000002' && j.details?.avant?.total === '1190.000' && j.details?.avant?.lignes?.length === 3 && j.details?.avant?.date === '2026-03-20' && j.details?.apres?.total === '2380.000' && j.details?.apres?.libelle === 'Facture Voyages Méditerranée (corrigée)' && j.auteur_id === saisie.id, JSON.stringify(j?.details));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/ecritures/${E2.id}`, cabinet.tok, { ...deux(d607, { compteId: K['5321'].id, credit: '1' }) });
    r2 = await appel('PUT', `/api/compta/dossiers/${A.id}/ecritures/999999999`, cabinet.tok, deux(d607, c5321));
    r3 = await appel('PUT', `/api/compta/dossiers/${A.id}/ecritures/${E2.id}`, client.tok, deux(d607, c5321));
    check('modifier déséquilibré : 400 ; écriture inconnue : 404 ; personne étrangère : 404', r.status === 400 && r2.status === 404 && r3.status === 404, `${r.status} ${r2.status} ${r3.status}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures/${E2.id}`, cabinet.tok);
    check('… B-000002 intacte après le refus (2 380,000)', r.body?.ecriture?.total === '2380.000', r.body?.ecriture?.total);
    const nbModif = (await pool.query(`SELECT COUNT(*)::int AS n FROM compta.evenements WHERE espace_id = $1 AND type = 'ecriture_modifiee'`, [espaceId])).rows[0].n;
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/ecritures/${E2.id}`, cabinet.tok, { journalId: J.VT.id, date: '2026-03-21', reference: 'FV-2026-010', libelle: 'Facture Voyages Méditerranée (corrigée)', lignes: [{ compteId: K['4111'].id, tiersId: C1.id, debit: '2 380,000', echeance: '2026-05-05' }, { compteId: K['707'].id, credit: '2000', taxeId: X.TVA19.id }, { compteId: K['436711'].id, credit: '380', taxeId: X.TVA19.id }] });
    check('même contenu renvoyé : 200 sans ligne de journal (rien ne change)', r.status === 200 && (await pool.query(`SELECT COUNT(*)::int AS n FROM compta.evenements WHERE espace_id = $1 AND type = 'ecriture_modifiee'`, [espaceId])).rows[0].n === nbModif, String(r.status));
    // Un tiers désactivé après la saisie ne bloque pas la correction d'une écriture qui le portait ; il est refusé sur une ligne nouvelle.
    r = await ec('', cabinet.tok, { journalId: J.AC.id, date: '2026-03-18', reference: 'F-BOUL-01', libelle: 'Pain', lignes: [{ compteId: K['607'].id, debit: '50' }, { compteId: K['4011'].id, tiersId: F2.id, credit: '50' }] });
    const E5 = r.body?.ecriture;
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/tiers/${F2.id}/desactiver`, cabinet.tok);
    r3 = await appel('PUT', `/api/compta/dossiers/${A.id}/ecritures/${E5?.id}`, cabinet.tok, { journalId: J.AC.id, date: '2026-03-18', reference: 'F-BOUL-01', libelle: 'Pain (corrigé)', lignes: [{ compteId: K['607'].id, debit: '50' }, { compteId: K['4011'].id, tiersId: F2.id, credit: '50' }] });
    check('F0002 désactivé après la saisie de B-000004 : la correction du libellé passe (200), le tiers désactivé est toléré sur sa ligne', r.status === 201 && r2.status === 200 && r3.status === 200 && r3.body?.ecriture?.libelle === 'Pain (corrigé)', `${r.status} ${r2.status} ${r3.status} ${r3.body?.message || ''}`);
    r = await ec('', cabinet.tok, deux(d607, { compteId: K['4011'].id, tiersId: F2.id, credit: '100' }));
    r2 = await ec('/aide/retenue', cabinet.tok, { journalId: J.AC.id, tiersId: F2.id, taxeId: X.RS_HON10.id, lignes: LIGNES_ACHAT });
    check('… mais une écriture NOUVELLE avec F0002 est refusée (409 TIERS_DESACTIVE), l\'aide retenue aussi', r.status === 409 && r.body?.code === 'TIERS_DESACTIVE' && r2.status === 409 && r2.body?.code === 'TIERS_DESACTIVE', `${r.status} ${r.body?.code} ${r2.status} ${r2.body?.code}`);
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/ecritures/${E5?.id}`, cabinet.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/tiers/${F2.id}/reactiver`, cabinet.tok);
    check('B-000004 supprimée, F0002 réactivé (il n\'a plus d\'écriture)', r.status === 200 && r2.status === 200, `${r.status} ${r2.status}`);

    // ── Les hooks « mouvementé » : compte, journal, code, tiers, dossier ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${K['607'].id}/desactiver`, cabinet.tok);
    check('plan : désactiver 607 (porté par B-000001) : 409 COMPTE_MOUVEMENTE', r.status === 409 && r.body?.code === 'COMPTE_MOUVEMENTE', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/journaux/${J.AC.id}/desactiver`, cabinet.tok);
    check('journaux : désactiver AC : 409 JOURNAL_MOUVEMENTE', r.status === 409 && r.body?.code === 'JOURNAL_MOUVEMENTE', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/${X.TVA19.id}/desactiver`, cabinet.tok);
    check('taxes : désactiver TVA19 : 409 TAXE_MOUVEMENTEE', r.status === 409 && r.body?.code === 'TAXE_MOUVEMENTEE', `${r.status} ${r.body?.code}`);
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/tiers/${F1.id}`, cabinet.tok);
    r2 = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${F1.id}`, cabinet.tok, { code: 'STB1' });
    r3 = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${F1.id}`, cabinet.tok, { compteId: compte(planA, '404')?.id });
    check('tiers : supprimer F0001, changer son code, changer son collectif : 409 TIERS_MOUVEMENTE ×3', r.status === 409 && r.body?.code === 'TIERS_MOUVEMENTE' && r2.status === 409 && r2.body?.code === 'TIERS_MOUVEMENTE' && r3.status === 409 && r3.body?.code === 'TIERS_MOUVEMENTE', `${r.status} ${r2.status} ${r3.status}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${F1.id}`, cabinet.tok, { nom: 'STB SA', delaiPaiement: 45 });
    check('… mais son nom et son délai changent encore', r.status === 200 && r.body?.tiers?.nom === 'STB SA' && r.body?.tiers?.delaiPaiement === 45, `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}`, cabinet.tok, { exercice: { debut: '2026-02-01', fin: '2027-01-31' } });
    r2 = await appel('DELETE', `/api/compta/dossiers/${A.id}`, cabinet.tok);
    check('dossier : changer les dates de l\'exercice, supprimer : 409 DOSSIER_MOUVEMENTE', r.status === 409 && r.body?.code === 'DOSSIER_MOUVEMENTE' && r2.status === 409 && r2.body?.code === 'DOSSIER_MOUVEMENTE', `${r.status} ${r.body?.code} ${r2.status} ${r2.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers/${F2.id}/desactiver`, cabinet.tok);
    r2 = await appel('DELETE', `/api/compta/dossiers/${A.id}/tiers/${F2.id}`, cabinet.tok);
    check('F0002 (sans écriture) se désactive et se supprime encore', r.status === 200 && r2.status === 200, `${r.status} ${r2.status}`);

    // ── Supprimer (Saisie) : contenu au journal, numéro non réemployé ──
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/ecritures/${E3.id}`, saisie.tok);
    check('Saisie supprime B-000003 : 200, 2 en brouillard', r.status === 200 && r.body?.supprime?.numeroProvisoire === 'B-000003' && r.body?.nb?.brouillard === 2, `${r.status} ${r.body?.message || ''}`);
    j = await journal(espaceId, 'ecriture_supprimee');
    const restesLignes = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.lignes WHERE ecriture_id = $1', [E3.id])).rows[0].n;
    check('journal : ecriture_supprimee avec tout le contenu (journal BQ, 2 lignes, tiers F0001) ; lignes parties avec elle', !!j && j.details?.numeroProvisoire === 'B-000003' && j.details?.contenu?.journal === 'BQ' && j.details?.contenu?.lignes?.length === 2 && j.details.contenu.lignes[0].tiers === 'F0001' && j.details.contenu.total === '1173.150' && j.details.contenu.creePar === 'Collaborateur Complet' && !!j.details.contenu.creeLe && restesLignes === 0 && j.auteur_id === saisie.id, JSON.stringify(j?.details));
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/ecritures/${E3.id}`, cabinet.tok);
    check('supprimer deux fois : 404', r.status === 404, String(r.status));
    r = await ec('', cabinet.tok, { journalId: J.BQ.id, date: '2026-03-31', reference: 'RLV-2026-03b', libelle: 'Règlement STB', lignes: [{ compteId: K['4011'].id, tiersId: F1.id, debit: '1173.150' }, { compteId: K['5321'].id, credit: '1173.150' }] });
    const E4 = r.body?.ecriture;
    check('une nouvelle écriture reçoit B-000005 : un numéro provisoire ne se réemploie pas (B-000003 et B-000004 supprimées)', r.status === 201 && E4?.numeroProvisoire === 'B-000005', `${r.status} ${E4?.numeroProvisoire}`);

    // ── Dossier archivé, comptabilité en lecture seule ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    r = await ec('', cabinet.tok, deux(d607, c5321));
    r2 = await ec('/aide/taxe', cabinet.tok, { journalId: J.AC.id, ligne: { compteId: K['607'].id, debit: '1000', taxeId: X.TVA19.id } });
    r3 = await appel('DELETE', `/api/compta/dossiers/${A.id}/ecritures/${E4.id}`, cabinet.tok);
    check('dossier archivé : saisir, aide, supprimer refusés (409 DOSSIER_ARCHIVE)', r.status === 409 && r.body?.code === 'DOSSIER_ARCHIVE' && r2.status === 409 && r3.status === 409, `${r.status} ${r2.status} ${r3.status}`);
    r = await lister('');
    check('… mais la liste se lit (dossier archivé dans la réponse, 3 écritures)', r.status === 200 && r.body?.dossier?.etat === 'archive' && r.body?.total === 3, `${r.status} ${r.body?.total}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/desarchiver`, cabinet.tok);
    await mode(cabinet.id, 'read_only');
    r = await ec('', cabinet.tok, deux(d607, c5321));
    r2 = await lister('');
    check('comptabilité en lecture seule : 403 READ_ONLY ; la liste se lit (lecture_seule)', r.status === 403 && r.body?.code === 'READ_ONLY' && r2.status === 200 && r2.body?.etatAbonnement === 'lecture_seule', `${r.status} ${r.body?.code}`);
    await mode(cabinet.id, 'actif');

    // ── « Mon entreprise » du client : le client (titulaire) saisit ──
    r = await appel('GET', `/api/compta/dossiers/${dossierClient?.id}/ecritures`, client.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${dossierClient?.id}/ecritures`, client.tok, { journalId: jClient?.id, date: '2026-10-05', reference: 'Z-001', libelle: 'Recette du jour', lignes: [{ compteId: compte(planC, '5411')?.id, debit: '250' }, { compteId: compte(planC, '707')?.id, credit: '250' }] });
    check('« Mon entreprise » du client : la page se lit (droit saisir), une écriture B-000001 se saisit en caisse', r.status === 200 && r.body?.dossier?.source === 'labflow' && r.body?.droits?.saisir === true && r2.status === 201 && r2.body?.ecriture?.numeroProvisoire === 'B-000001', `${r.status} ${r2.status} ${r2.body?.message || ''}`);

    // ── Rejeu de la migration 215 ; manuel ──
    await pool.query(`DELETE FROM _migrations WHERE filename = '215_compta_ecritures.sql'`);
    await require('../src/config/migrate')();
    const manuel = (await pool.query(`SELECT slug, contenu_defaut FROM manuel_sections WHERE slug IN ('compta-ecritures', 'compta-dossier', 'compta-plan-comptes', 'compta-journaux', 'compta-taxes', 'compta-tiers') AND produit = 'compta'`)).rows;
    const texte = (slug) => manuel.find((m) => m.slug === slug)?.contenu_defaut || '';
    check('migration 215 rejouée sans erreur (tables, index et manuel idempotents) ; A intact (3 écritures, 10 lignes)', (await pool.query(`SELECT 1 FROM _migrations WHERE filename = '215_compta_ecritures.sql'`)).rows.length === 1
      && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.ecritures WHERE dossier_id = $1', [A.id])).rows[0].n === 3 && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.lignes WHERE dossier_id = $1', [A.id])).rows[0].n === 10);
    check('manuel : fiche « Écritures » présente ; « Fiche du dossier » (carte Tenue), « Plan de comptes », « Journaux », « Taxes » et « Tiers » retouchées (plus de « la saisie arrivera »)', /## ✍️ Écritures/.test(texte('compta-ecritures')) && /\*\*Tenue\*\*/.test(texte('compta-dossier')) && /page \*\*Écritures\*\*/.test(texte('compta-plan-comptes')) && /journaux actifs/.test(texte('compta-journaux'))
      && /Ajouter la retenue/.test(texte('compta-taxes')) && /compte collectif\./.test(texte('compta-tiers')) && !manuel.some((m) => /la saisie arrivera|s'appliqueront à la saisie/.test(m.contenu_defaut)), manuel.map((m) => m.slug).join(','));

    // ── Suppression d'un dossier vide (sans écriture) : toujours possible ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: { raisonSociale: 'Pâtisserie Forfait S6a', formeJuridique: 'EI' }, regime: FORFAIT, exercice: CIVIL });
    const B = r.body;
    r = await appel('GET', `/api/compta/dossiers/${B.id}/ecritures`, cabinet.tok);
    check('dossier B (forfaitaire) : page des écritures vide, aucun code de TVA proposé, retenues et timbre présents', r.status === 200 && r.body?.total === 0 && !r.body?.taxes?.some((x) => x.type === 'tva') && r.body?.taxes?.some((x) => x.code === 'TIMBRE'), `${r.status} ${r.body?.taxes?.length}`);
    r = await appel('DELETE', `/api/compta/dossiers/${B.id}`, cabinet.tok);
    check('supprimer le dossier B (sans écriture) : 204', r.status === 204, String(r.status));

    // ── Les pages d'avant ne changent pas ──
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok);
    check('liste des dossiers inchangée (1 dossier)', r.status === 200 && r.body?.dossiers?.length === 1, String(r.body?.dossiers?.length));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, saisie.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/taxes`, saisie.tok);
    r3 = await appel('GET', `/api/compta/dossiers/${A.id}/tiers`, saisie.tok);
    check('journaux, taxes et tiers de A lisibles, inchangés (6 journaux, 20 codes, 1 fournisseur restant)', r.status === 200 && r.body?.journaux?.length === 6 && r2.status === 200 && r2.body?.taxes?.length === 20 && r3.status === 200 && r3.body?.nb?.fournisseur?.total === 1, `${r.body?.journaux?.length} ${r2.body?.taxes?.length} ${r3.body?.nb?.fournisseur?.total}`);
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
