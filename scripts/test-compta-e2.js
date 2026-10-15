/* Test E2E local — LabFlow Compta, étape E2 « Les flux de trésorerie, les notes et le jeu complet » (labflow-reprise/
 * achats-compta/PLAN-ETATS-FINANCIERS.md §2 ligne E2 ; réponses 3 et 4 du client du 14/10).
 *   dossier A (exercice 2025, fini, non clos) : capital 10 000, vente 1 000 (client), achat 400 (fournisseur), crédit de
 *   TVA 300 payé, véhicule 5 000 financé par un emprunt, dotation 1 000 — perte de 400 ; la page : état des flux (résultat
 *   net, amortissements, créances, dettes, acquisition, apport, emprunt, variation 9 700 = banque), contrôle bouclé, soldes
 *   intermédiaires (marge commerciale 600, valeur ajoutée, EBE, résultat net), notes vides ; les NOTES : Saisie refusée,
 *   texte trop long refusé, autre cabinet 404, exercice inconnu, enregistrées par le titulaire (journal notes_exercice),
 *   relues, effacées ; PDF court et jeu complet ; 2026 ouvert puis 2025 clos : flux 2026 (trésorerie de début 9 700,
 *   colonne 2025), notes d'un exercice clos ; rejeu des migrations 243 et 244.
 * Crée un super_admin, deux cabinets et une collaboratrice temporaires ; règle les tarifs Compta le temps de l'essai, puis
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

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-e2@example.com';
  const CABINET = 'test-cabinet-compta-e2@example.com';
  const AUTRE = 'test-autre-compta-e2@example.com';
  const SAISIE = 'test-saisie-compta-e2@example.com';
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
  const journal = async (espaceId, type) => (await pool.query('SELECT * FROM compta.evenements WHERE espace_id = $1 AND type = $2 ORDER BY id DESC LIMIT 1', [espaceId, type])).rows[0];
  const REEL = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const identite = (nom, mf) => ({ raisonSociale: nom, formeJuridique: 'SARL', matriculeFiscal: mf, adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' });
  const feuille = (plan, numero) => {
    const comptes = (plan?.comptes || []).filter((c) => c.actif !== false);
    const estFeuille = (c) => !comptes.some((o) => o.numero !== c.numero && o.numero.startsWith(c.numero));
    const lui = comptes.find((c) => c.numero === numero);
    if (lui && estFeuille(lui)) return lui;
    return comptes.filter((c) => c.numero.startsWith(numero) && estFeuille(c)).sort((a, b) => (a.numero < b.numero ? -1 : 1))[0] || null;
  };
  const L = (k, debit, credit, tiersId = null) => ({ compteId: k.id, tiersId, debit: debit || '', credit: credit || '' });
  const lignesDe = (res) => new Map((res?.lignes || []).filter((l) => l.code).map((l) => [l.code, l]));
  const controle = (c, code) => c?.controles?.find((x) => x.code === code);
  const kos = (c) => (c?.controles || []).filter((x) => !x.ok).map((x) => x.code).join(',');
  const pdfBrut = (chemin, jeton) => fetch(`${BASE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin E2', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    const adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet E2', email: CABINET, telephone: '20 555 501', raisonSociale: 'Cabinet Essai E2', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet E2', representantQualite: 'Gérant', nbGerants: 1,
    });
    let r2 = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Autre E2', email: AUTRE, telephone: '20 555 502', raisonSociale: 'Autre Cabinet E2', formeJuridique: 'SARL',
      adresse: '2 rue de Rome', ville: 'Tunis', representantNom: 'TEST Autre E2', representantQualite: 'Gérant', nbGerants: 0,
    });
    check('création des deux cabinets', r.status === 201 && r2.status === 201, `${r.status} ${r2.status}`);
    const cabinet = await activer(CABINET);
    const autre = await activer(AUTRE);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaboratrice Saisie', email: SAISIE, niveau: 'saisie', dossiers: 'tous' });
    const saisie = await activer(SAISIE);
    check('titulaire et Saisie connectés', !!cabinet.tok && !!espaceId && r.status === 201 && !!saisie.tok);

    // ── Dossier A : exercice 2025 (fini, non clos) ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: identite('Hôtel Essai E2', '1234567A/A/M/000'), regime: REEL, exercice: { debut: '2025-01-01', fin: '2025-12-31' } });
    const A = r.body;
    const X25 = A?.exercice;
    const planA = (await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok)).body;
    const K = Object.fromEntries(['10131', '607', '4011', '4111', '5321', '707', '43667', '224', '282', '681', '162'].map((n) => [n, feuille(planA, n)]));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    const J = Object.fromEntries(['AC', 'VT', 'BQ', 'OD', 'AN'].map((c) => [c, r.body?.journaux?.find((j) => j.code === c)]));
    const F1 = (await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Société Tunisienne de Boissons', delaiPaiement: 30 })).body?.tiers;
    const C1 = (await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'client', nom: 'Voyages Méditerranée', delaiPaiement: 45 })).body?.tiers;
    check('dossier A, plan, journaux et tiers', A?.id && X25?.millesime === 2025 && Object.values(K).every(Boolean) && Object.values(J).every(Boolean) && !!F1 && !!C1);
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
    r = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${periodes25?.find((p) => p.debut === '2025-06-01')?.id}/valider`, cabinet.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${periodes25?.find((p) => p.debut === '2025-12-01')?.id}/valider`, cabinet.tok);
    check('2025 : six écritures validées', e2025.every((x) => x.status === 201) && r.body?.validees === 5 && r2.body?.validees === 1, `${r.status} ${r.body?.validees} ${r2.body?.validees}`);

    // ── Les flux et les soldes intermédiaires ──
    const G = (dossierId, q = '', jeton = cabinet.tok) => appel('GET', `/api/compta/dossiers/${dossierId}/etats${q}`, jeton);
    r = await G(A.id);
    let c = r.body;
    let FL = lignesDe(c?.flux);
    check('flux 2025 : résultat net −400, amortissements 1 000, créances −1 300, dettes 400 → exploitation −300 ; acquisition −5 000 ; apport 10 000 et emprunt 5 000 → financement 15 000', r.status === 200 && FL.get('resultatNet')?.n === '-400.000' && FL.get('amortissementsProvisions')?.n === '1000.000' && FL.get('creances')?.n === '-1300.000' && FL.get('dettes')?.n === '400.000' && FL.get('fluxExploitation')?.n === '-300.000' && FL.get('acquisitionsImmobilisations')?.n === '-5000.000' && FL.get('fluxInvestissement')?.n === '-5000.000' && FL.get('capitauxPropres')?.n === '10000.000' && FL.get('empruntsRecus')?.n === '5000.000' && FL.get('fluxFinancement')?.n === '15000.000', JSON.stringify([...FL.entries()].map(([k, v]) => [k, v.n])));
    check('flux 2025 : variation 9 700, trésorerie de 0 à 9 700 (banque), contrôle « flux » au vert, comptes des créances (4111, 43667)', FL.get('variationTresorerie')?.n === '9700.000' && FL.get('tresorerieDebut')?.n === '0.000' && FL.get('tresorerieFin')?.n === '9700.000' && c?.flux?.tresorerie?.variation?.n === '9700.000' && controle(c, 'flux')?.ok === true && kos(c) === '' && FL.get('creances')?.comptes?.map((k) => k.numero).join(',') === `${K['4111'].numero},${K['43667'].numero}` && c?.flux?.lignes?.[0]?.titre === 'Flux de trésorerie liés à l\'exploitation', `${kos(c)} ${controle(c, 'flux')?.detail}`);
    const SG = lignesDe(c?.sig);
    check('soldes intermédiaires 2025 : marge commerciale 600, valeur ajoutée 600, EBE 600, autres charges ordinaires −1 000, résultat net −400', SG.get('margeCommerciale')?.n === '600.000' && SG.get('valeurAjoutee')?.n === '600.000' && SG.get('ebe')?.n === '600.000' && SG.get('autresChargesOrdinaires')?.n === '-1000.000' && SG.get('resultatNet')?.n === '-400.000' && !SG.has('production') === false, JSON.stringify([...SG.entries()].map(([k, v]) => [k, v.n])));
    check('notes 2025 : vides, 20 000 caractères au plus ; contrôles : 4 (équilibre, résultat, sans poste, flux)', c?.notes?.texte === '' && c?.notes?.modifieLe === null && c?.notes?.longueurMax === 20000 && c?.controles?.length === 4 && c?.pret === true, JSON.stringify(c?.notes));

    // ── Les notes ──
    const PUT = (dossierId, xid, corps, jeton = cabinet.tok) => appel('PUT', `/api/compta/dossiers/${dossierId}/etats/${xid}/notes`, jeton, corps);
    r = await PUT(A.id, X25.id, { texte: 'Essai' }, saisie.tok);
    r2 = await PUT(A.id, X25.id, { texte: 'x'.repeat(20001) });
    const r3 = await PUT(A.id, X25.id, { texte: 'Essai' }, autre.tok);
    const r4 = await PUT(A.id, 'abc', { texte: 'Essai' });
    const r5 = await PUT(A.id, 999999, { texte: 'Essai' });
    check('notes : Saisie refusée (403), trop long (400), autre cabinet 404, exercice « abc » 404, exercice inconnu 409', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT' && r2.status === 400 && r2.body?.code === 'NOTES_TROP_LONGUES' && r3.status === 404 && r4.status === 404 && r5.status === 409 && r5.body?.code === 'EXERCICE_INTROUVABLE', `${r.status} ${r2.status} ${r3.status} ${r4.status} ${r5.status} ${r5.body?.code}`);
    r = await PUT(A.id, X25.id, { texte: 'Méthodes comptables : coût historique.\r\n\r\nFaits marquants : achat d\'un véhicule financé par emprunt.  ' });
    check('notes enregistrées par le titulaire : texte normalisé, qui, quand', r.status === 200 && r.body?.notes?.texte === 'Méthodes comptables : coût historique.\n\nFaits marquants : achat d\'un véhicule financé par emprunt.' && r.body?.notes?.modifiePar === 'TEST Cabinet E2' && !!r.body?.notes?.modifieLe, `${r.status} ${JSON.stringify(r.body)}`);
    let ev = await journal(espaceId, 'notes_exercice');
    check('journal : notes_exercice (exercice, longueur)', ev?.auteur_id === cabinet.id && ev?.details?.millesime === 2025 && ev?.details?.longueur === r.body?.notes?.texte?.length && ev?.details?.exercice === X25.id, JSON.stringify(ev?.details));
    r = await G(A.id);
    check('la page relit les notes', r.body?.notes?.texte?.startsWith('Méthodes comptables') && r.body?.notes?.modifiePar === 'TEST Cabinet E2');
    const nb = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.notes_exercice WHERE dossier_id = $1', [A.id])).rows[0].n;
    r = await PUT(A.id, X25.id, { texte: '' });
    check('notes effacées (une seule rangée par exercice)', nb === 1 && r.status === 200 && r.body?.notes?.texte === '' && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.notes_exercice WHERE dossier_id = $1', [A.id])).rows[0].n === 1);
    r = await PUT(A.id, X25.id, { texte: 'Notes de l\'exercice 2025.' });
    check('notes remises', r.status === 200 && r.body?.notes?.texte === 'Notes de l\'exercice 2025.');

    // ── PDF : court et jeu complet ──
    const court = await pdfBrut(`/api/compta/dossiers/${A.id}/etats.pdf?exercice=${X25.id}`, cabinet.tok);
    const courtBuf = Buffer.from(await court.arrayBuffer());
    const complet = await pdfBrut(`/api/compta/dossiers/${A.id}/etats.pdf?exercice=${X25.id}&complet=1`, cabinet.tok);
    const completBuf = Buffer.from(await complet.arrayBuffer());
    const pages = (b) => (b.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
    check('PDF court (2 pages au moins) et jeu complet (4 pages au moins, plus lourd, nom « complets »)', court.status === 200 && complet.status === 200 && pages(courtBuf) >= 2 && pages(completBuf) >= 4 && completBuf.length > courtBuf.length && /etats-financiers-complets-Hotel-Essai-E2-2025\.pdf/.test(complet.headers.get('content-disposition') || ''), `${court.status} ${complet.status} ${pages(courtBuf)} ${pages(completBuf)} ${complet.headers.get('content-disposition')}`);
    check('jeu complet : Saisie le lit (200), autre cabinet 404', (await pdfBrut(`/api/compta/dossiers/${A.id}/etats.pdf?complet=1`, saisie.tok)).status === 200 && (await pdfBrut(`/api/compta/dossiers/${A.id}/etats.pdf?complet=1`, autre.tok)).status === 404);

    // ── 2026 ouvert, 2025 clos : les flux de 2026 et la colonne 2025 ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/exercices/suivant`, cabinet.tok, {});
    const X26 = r.body?.exercicesOuverts?.find((x) => x.millesime === 2026);
    let closes = 0;
    for (const p of periodes25.filter((p) => p.debut < '2025-12-01')) closes += (await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${p.id}/clore`, cabinet.tok)).status === 200 ? 1 : 0;
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/exercices/${X25.id}/cloturer`, cabinet.tok, {});
    check('2026 ouvert, 2025 clôturé (perte de 400)', r.status === 201 && !!X26 && closes === 11 && r2.status === 201 && r2.body?.exercice?.clos?.resultat === '-400.000', `${r.status} ${closes} ${r2.status} ${r2.body?.message || ''}`);
    r = await E(A.id, { journalId: J.BQ.id, date: '2026-02-10', reference: 'REG-1', libelle: 'Règlement du client', lignes: [L(K['5321'], '1000'), L(K['4111'], '', '1000', C1.id)] });
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures/${r.body?.ecriture?.id}/valider`, cabinet.tok);
    r = await G(A.id, `?exercice=${X26.id}`);
    c = r.body;
    FL = lignesDe(c?.flux);
    check('flux 2026 : trésorerie de début 9 700 (à-nouveaux), client encaissé 1 000 (créances +1 000), variation 1 000, fin 10 700 ; colonne 2025 : financement 15 000, variation 9 700', r2.status === 200 && r.status === 200 && FL.get('tresorerieDebut')?.n === '9700.000' && FL.get('creances')?.n === '1000.000' && FL.get('variationTresorerie')?.n === '1000.000' && FL.get('tresorerieFin')?.n === '10700.000' && FL.get('fluxFinancement')?.n1 === '15000.000' && FL.get('variationTresorerie')?.n1 === '9700.000' && FL.get('tresorerieFin')?.n1 === '9700.000' && controle(c, 'flux')?.ok === true, `${r2.status} ${JSON.stringify([...FL.entries()].map(([k, v]) => [k, v.n, v.n1]))} ${controle(c, 'flux')?.detail}`);
    check('soldes intermédiaires 2026 : colonne 2025 (marge commerciale 600), rien en 2026', lignesDe(c?.sig).get('margeCommerciale')?.n1 === '600.000' && lignesDe(c?.sig).get('resultatNet')?.n === '0.000');
    r = await G(A.id, `?exercice=${X25.id}`);
    FL = lignesDe(r.body?.flux);
    check('flux 2025 après la clôture : inchangés (écriture de résultat exclue), notes de l\'exercice clos conservées', FL.get('variationTresorerie')?.n === '9700.000' && FL.get('resultatNet')?.n === '-400.000' && controle(r.body, 'flux')?.ok === true && r.body?.notes?.texte === 'Notes de l\'exercice 2025.', `${FL.get('variationTresorerie')?.n} ${controle(r.body, 'flux')?.detail}`);
    r = await PUT(A.id, X25.id, { texte: 'Notes de l\'exercice 2025, complétées après la clôture.' });
    check('notes d\'un exercice clos : modifiables (titulaire)', r.status === 200 && /après la clôture/.test(r.body?.notes?.texte));

    // ── Rejeu des migrations ──
    let rejeu = true;
    for (const f of ['243_compta_notes_exercice.sql', '244_manuel_compta_etats_flux.sql']) {
      try { await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', f), 'utf8')); } catch (e) { rejeu = false; console.log(f, e.message); }
    }
    const fiche = (await pool.query(`SELECT contenu, contenu_defaut, mots_cles FROM manuel_sections WHERE slug = 'compta-etats' AND produit = 'compta'`)).rows[0];
    const notesEncore = (await pool.query('SELECT texte FROM compta.notes_exercice WHERE exercice_id = $1', [X25.id])).rows[0];
    check('migrations 243 et 244 rejouables ; fiche « États financiers » : flux et notes décrits, mots-clés ; les notes restent', rejeu && /\*\*L'état des flux de trésorerie\*\*/.test(fiche?.contenu_defaut || '') && /flux de trésorerie/.test(fiche?.mots_cles || '') && /après la clôture/.test(notesEncore?.texte || ''), `${rejeu} ${fiche?.mots_cles?.slice(0, 60)}`);
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
