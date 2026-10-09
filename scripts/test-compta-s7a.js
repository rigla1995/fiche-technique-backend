/* Test E2E local — LabFlow Compta, étape S7a « Lettrage, échéancier, relevés » (labflow-reprise/achats-compta/PLAN-S7.md
 * §1 ligne S7a, §2 « S7a », §4 « Lettrage », « Échéance », « Relevé et relance », « Droits » ; réponses du client du
 * 09/10 — « ok pour les 9 »).
 *   un dossier avec des factures d'achat et de vente, des règlements complets et partiels, un avoir, une facture en
 *   brouillard ; la page Lettrage (tiers mouvementés, lignes à lettrer ; Saisie et Consultation lisent ; étranger 404) ; un
 *   tiers (lignes non lettrées, totaux, propositions : même montant, même pièce) ; lettrer (Consultation refusée, Saisie
 *   lettre AAA ; déjà lettrée, écart, tiers différent, brouillard, ligne hors tiers, ligne d'un autre dossier, une seule
 *   ligne : refusés) ; plusieurs lettres d'un coup (Complet) ; la lettre dans le grand livre (écran et export) et sur les
 *   lignes d'écriture ; délettrer (journal) ; la contre-passation délettre d'office, puis la proposition « même pièce » ;
 *   l'échéancier (balance âgée fournisseurs et clients : tranches calculées au jour de l'essai, règlement non lettré en
 *   moins, brouillard compris ou non), un tiers déplié, le relevé de compte et la lettre de relance en PDF (texte modifié,
 *   texte illisible refusé, fournisseur refusé, rien d'échu refusé), l'export Excel (deux feuilles) ; la fiche du dossier
 *   (carte Tenue) ; dossier archivé ; lecture seule ; cloisonnement croisé ; rejeu de la migration 218 ; manuel ; pages
 *   d'avant.
 * Crée un super_admin, un cabinet (3 gérants achetés) et trois collaborateurs temporaires ; règle les tarifs Compta le
 * temps de l'essai, puis restaure et nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');
const { aujourdhuiTunis, trancheDe } = require('../src/compta/echeances');

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
const telecharger = async (chemin, jeton) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  const buffer = Buffer.from(await r.arrayBuffer());
  let body = null;
  if (/json/.test(r.headers.get('content-type') || '')) { try { body = JSON.parse(buffer.toString('utf8')); } catch (_) { /* rien */ } }
  return { status: r.status, type: r.headers.get('content-type') || '', disposition: r.headers.get('content-disposition') || '', buffer, body };
};
// Les rangées d'une feuille d'un classeur exporté sous sa ligne d'en-têtes (première cellule donnée).
const rangeesFeuille = async (buffer, nomFeuille, premiereEnTete) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet(nomFeuille);
  if (!ws) return { feuilles: wb.worksheets.map((w) => w.name), enTetes: [], rangees: [] };
  let enTete = 0;
  ws.eachRow((row, n) => { if (!enTete && String(row.getCell(1).text || '').trim() === premiereEnTete) enTete = n; });
  const enTetes = enTete ? ws.getRow(enTete).values.slice(1) : [];
  const rangees = [];
  let fin = false;
  ws.eachRow((row, n) => {
    if (n <= enTete || fin) return;
    const valeurs = row.values.slice(1).map((v) => (v == null ? '' : typeof v === 'object' && 'result' in v ? v.result : v));
    if (/^Généré par LabFlow/.test(String(valeurs[0] || ''))) { fin = true; return; }
    if (valeurs.some((c) => c !== '' && c !== null)) rangees.push(valeurs);
  });
  return { feuilles: wb.worksheets.map((w) => w.name), enTetes, rangees };
};
// Un document demandé en POST (la lettre de relance : son texte dans le corps).
const telechargerPost = async (chemin, jeton, corps) => {
  const r = await fetch(`${BASE}${chemin}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` }, body: JSON.stringify(corps) });
  const buffer = Buffer.from(await r.arrayBuffer());
  let body = null;
  if (/json/.test(r.headers.get('content-type') || '')) { try { body = JSON.parse(buffer.toString('utf8')); } catch (_) { /* rien */ } }
  return { status: r.status, type: r.headers.get('content-type') || '', disposition: r.headers.get('content-disposition') || '', buffer, body };
};
const login = async (email) => appel('POST', '/auth/login', null, { email, password: MDP });
const CLES = ['compta_cabinet_mensuel', 'compta_gerant_cabinet_mensuel', 'compta_mise_en_route', 'compta_module_mensuel', 'compta_gerant_client_mensuel'];
// Jours de `a` à `b` (dates AAAA-MM-JJ) ; une date + n jours.
const jours = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const plus = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
// Millimes d'un texte NUMERIC signé, pour les sommes attendues.
const mm = (t) => { const s = String(t); const neg = s.startsWith('-'); const [e, d = ''] = s.replace('-', '').split('.'); const v = BigInt(e) * 1000n + BigInt(d.padEnd(3, '0')); return neg ? -v : v; };
const txt = (n) => { const a = n < 0n ? -n : n; return `${n < 0n ? '-' : ''}${a / 1000n}.${String(a % 1000n).padStart(3, '0')}`; };

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s7a@example.com';
  const CABINET = 'test-cabinet-compta-s7a@example.com';
  const SAISIE = 'test-saisie-compta-s7a@example.com';
  const COMPLET = 'test-complet-compta-s7a@example.com';
  const CONSULT = 'test-consult-compta-s7a@example.com';
  const TOUS = [ADMIN, CABINET, SAISIE, COMPLET, CONSULT];
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
  const mode = (id, m) => pool.query('UPDATE abonnements SET mode_compte = $2 WHERE client_id = $1', [id, m]);
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };
  const IDENTITE_A = { raisonSociale: 'Hôtel Essai S7a', formeJuridique: 'SARL', matriculeFiscal: '1234567A/A/M/000', adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' };
  const REEL = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const CIVIL = { debut: '2026-01-01', fin: '2026-12-31' };
  const AU = aujourdhuiTunis();
  const compte = (plan, numero) => plan?.comptes?.find((c) => c.numero === numero);

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S7a', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    const adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (3 gérants achetés) avec trois collaborateurs ──
    let r2 = null;
    let r3 = null;
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S7a', email: CABINET, telephone: '20 555 099', raisonSociale: 'Cabinet Essai S7a', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S7a', representantQualite: 'Gérant', nbGerants: 3,
    });
    check('création du cabinet (3 gérants achetés)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const cabinet = await activer(CABINET);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    check('connexion du titulaire', !!cabinet.tok && !!espaceId);
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaboratrice Saisie', email: SAISIE, niveau: 'saisie', dossiers: 'tous' });
    r2 = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Complet', email: COMPLET, niveau: 'complet', dossiers: 'tous' });
    r3 = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Consultation', email: CONSULT, niveau: 'consultation', dossiers: 'tous' });
    const saisie = await activer(SAISIE);
    const complet = await activer(COMPLET);
    const consult = await activer(CONSULT);
    check('collaborateurs Saisie, Complet et Consultation créés et connectés', r.status === 201 && r2.status === 201 && r3.status === 201 && !!saisie.tok && !!complet.tok && !!consult.tok, `${r.status} ${r2.status} ${r3.status}`);

    // ── Dossier A (réel) : plan, journaux, tiers ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REEL, exercice: CIVIL });
    const A = r.body;
    check('dossier A créé (exercice 2026)', r.status === 201 && A?.exercice?.periodes?.length === 12, `${r.status}`);
    const planA = (await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok)).body;
    const K = Object.fromEntries(['607', '43666', '436711', '4011', '4111', '5321', '707'].map((n) => [n, compte(planA, n)]));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    const J = Object.fromEntries(['AC', 'VT', 'BQ'].map((c) => [c, r.body?.journaux?.find((j) => j.code === c)]));
    const T = {};
    for (const [cle, type, nom, delaiPaiement] of [['F1', 'fournisseur', 'Société Tunisienne de Boissons', 30], ['F2', 'fournisseur', 'Imprimerie du Lac', 0], ['C1', 'client', 'Voyages Méditerranée', 45], ['C2', 'client', 'Agence Carthage', 0]]) {
      T[cle] = (await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type, nom, delaiPaiement })).body?.tiers;
    }
    check('plan, journaux et quatre tiers de A (F0001, F0002, C0001, C0002)', Object.values(K).every(Boolean) && Object.values(J).every(Boolean) && T.F1?.code === 'F0001' && T.F2?.code === 'F0002' && T.C1?.code === 'C0001' && T.C2?.code === 'C0002');
    const ecrire = async (journalId, date, reference, libelle, lignes) => {
      const x = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures`, cabinet.tok, { journalId, date, reference, libelle, lignes });
      if (x.status !== 201) throw new Error(`écriture ${reference} : ${x.status} ${x.body?.message}`);
      return x.body.ecriture;
    };
    const L = (k, tiers, debit, credit, echeance) => ({ compteId: K[k].id, tiersId: tiers ? tiers.id : null, debit: debit || '', credit: credit || '', echeance: echeance || '' });
    const E = {};
    E.f0305 = await ecrire(J.AC.id, '2026-03-05', 'F-0305', 'Facture STB boissons', [L('607', null, '1000'), L('43666', null, '190'), L('4011', T.F1, '', '1190')]);
    E.f0610 = await ecrire(J.AC.id, '2026-06-10', 'F-0610', 'Facture STB juin', [L('607', null, '500'), L('4011', T.F1, '', '500', '2026-07-10')]);
    E.f0920 = await ecrire(J.AC.id, '2026-09-20', 'F-0920', 'Facture Imprimerie', [L('607', null, '300'), L('4011', T.F2, '', '300')]);
    E.r0401 = await ecrire(J.BQ.id, '2026-04-01', 'RLV-0401', 'Règlement STB', [L('4011', T.F1, '1190'), L('5321', null, '', '1190')]);
    E.r0701 = await ecrire(J.BQ.id, '2026-07-01', 'RLV-0701', 'Acompte STB', [L('4011', T.F1, '200'), L('5321', null, '', '200')]);
    E.v0515 = await ecrire(J.VT.id, '2026-05-15', 'FV-0515', 'Séjour Voyages Méditerranée', [L('4111', T.C1, '2380'), L('707', null, '', '2000'), L('436711', null, '', '380')]);
    E.v0801 = await ecrire(J.VT.id, '2026-08-01', 'FV-0801', 'Séjour d\'août', [L('4111', T.C1, '595'), L('707', null, '', '500'), L('436711', null, '', '95')]);
    E.av0810 = await ecrire(J.VT.id, '2026-08-10', 'AV-0810', 'Avoir sur séjour d\'août', [L('4111', T.C1, '', '595'), L('707', null, '500'), L('436711', null, '95')]);
    E.e0630 = await ecrire(J.BQ.id, '2026-06-30', 'RLV-0630', 'Encaissement Voyages Méditerranée', [L('5321', null, '2380'), L('4111', T.C1, '', '2380')]);
    E.v0901 = await ecrire(J.VT.id, '2026-09-01', 'FV-0901', 'Séjour Agence Carthage', [L('4111', T.C2, '1000'), L('707', null, '', '1000')]);
    E.v1001 = await ecrire(J.VT.id, '2026-10-01', 'FV-1001', 'Séjour d\'octobre (brouillard)', [L('4111', T.C2, '119'), L('707', null, '', '119')]);
    const P = Object.fromEntries((await appel('GET', `/api/compta/dossiers/${A.id}/periodes`, cabinet.tok)).body.exercice.periodes.map((p) => [String(p.debut).slice(5, 7), p]));
    for (const m of ['03', '04', '05', '06', '07', '08', '09']) {
      r = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${P[m].id}/valider`, cabinet.tok);
      if (r.status !== 200) throw new Error(`valider ${m} : ${r.status} ${r.body?.message}`);
    }
    const lt = (e) => e.lignes.find((l) => l.tiers);
    const ID = Object.fromEntries(Object.entries(E).map(([k, e]) => [k, lt(e).id]));
    check('onze écritures saisies, mars à septembre validés (10 validées, 1 en brouillard en octobre)', (await pool.query(`SELECT COUNT(*) FILTER (WHERE etat = 'validee')::int AS v, COUNT(*) FILTER (WHERE etat = 'brouillard')::int AS b FROM compta.ecritures WHERE dossier_id = $1`, [A.id])).rows[0].v === 10);
    const LT = (chemin, jeton) => appel('GET', `/api/compta/dossiers/${A.id}/lettrage${chemin}`, jeton);

    // ── La page Lettrage ──
    r = await LT('', cabinet.tok);
    const tiersPage = (code) => r.body?.tiers?.find((t) => t.code === code);
    check('page Lettrage (titulaire) : quatre tiers mouvementés (clients d\'abord), lignes à lettrer F0001 4, F0002 1, C0001 4, C0002 1 (+1 en brouillard), aucune lettre, bornes',
      r.status === 200 && r.body?.droits?.saisir === true && r.body?.tiers?.length === 4 && r.body?.tiers?.[0]?.code === 'C0001' && tiersPage('F0001')?.nbALettrer === 4 && tiersPage('F0002')?.nbALettrer === 1 && tiersPage('C0001')?.nbALettrer === 4 && tiersPage('C0002')?.nbALettrer === 1 && tiersPage('C0002')?.nbBrouillard === 1
      && r.body?.nb?.aLettrer === 10 && r.body?.nb?.brouillard === 1 && r.body?.nb?.lettres === 0 && r.body?.bornes?.lignesMax === 2000 && r.body?.etatAbonnement === 'actif', `${r.status} ${JSON.stringify(r.body?.nb)} ${r.body?.message || ''}`);
    r = await LT('', saisie.tok);
    r2 = await LT('', consult.tok);
    r3 = await LT('', adminTok);
    check('Saisie et Consultation lisent la page ; un étranger : 404', r.status === 200 && r.body?.droits?.saisir === true && r2.status === 200 && r2.body?.droits?.saisir === false && r3.status === 404, `${r.status} ${r2.status} ${r3.status}`);
    r = await LT(`/tiers/${T.F1.id}`, consult.tok);
    const prop = r.body?.propositions || [];
    check('tiers F0001 : 4 lignes non lettrées (chronologiques), débit 1 390, crédit 1 690, solde crédit 300 ; une proposition « même montant » (règlement 1 190 ↔ facture F-0305)',
      r.status === 200 && r.body?.lignes?.length === 4 && r.body?.lignes?.map((l) => l.ecriture.reference).join(',') === 'F-0305,RLV-0401,F-0610,RLV-0701' && r.body?.totaux?.debit === '1390.000' && r.body?.totaux?.credit === '1690.000' && r.body?.totaux?.soldeCredit === '300.000'
      && prop.length === 1 && prop[0].motif === 'montant' && prop[0].montant === '1190.000' && prop[0].lignes.slice().sort().join(',') === [ID.f0305, ID.r0401].sort().join(',') && r.body?.lettres?.length === 0 && r.body?.nbLettres === 0, `${r.status} ${JSON.stringify(prop)} ${JSON.stringify(r.body?.totaux)}`);

    // ── Lettrer ──
    const LETTRER = (jeton, corps, dossierId = A.id) => appel('POST', `/api/compta/dossiers/${dossierId}/lettrage`, jeton, corps);
    r = await LETTRER(consult.tok, { tiersId: T.F1.id, lignes: [ID.f0305, ID.r0401] });
    check('Consultation ne lettre pas (403 NIVEAU_INSUFFISANT)', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', `${r.status} ${r.body?.code}`);
    r = await LETTRER(saisie.tok, { tiersId: T.F1.id, lignes: [ID.f0305, ID.r0401] });
    check('Saisie lettre la facture F-0305 et son règlement : 201, lettre AAA, 1 190,000, plus que 2 lignes non lettrées, une lettre de 2 lignes',
      r.status === 201 && r.body?.faites?.[0]?.lettre === 'AAA' && r.body?.faites?.[0]?.montant === '1190.000' && r.body?.lignes?.length === 2 && r.body?.lettres?.length === 1 && r.body?.lettres?.[0]?.lettre === 'AAA' && r.body?.lettres?.[0]?.lignes?.length === 2 && r.body?.lettres?.[0]?.creePar === 'Collaboratrice Saisie' && r.body?.totaux?.soldeCredit === '300.000', `${r.status} ${JSON.stringify(r.body?.faites || r.body?.message)}`);
    let ev = await journal(espaceId, 'lettrage_fait');
    check('journal D16 lettrage_fait (tiers, lettre, compte, montant, lignes, auteur)', ev?.details?.tiers === 'F0001' && ev?.details?.lettres?.[0]?.lettre === 'AAA' && ev?.details?.lettres?.[0]?.compte === '4011' && ev?.details?.lettres?.[0]?.montant === '1190.000' && ev?.details?.lettres?.[0]?.lignes?.length === 2 && ev?.auteur_id === saisie.id, JSON.stringify(ev?.details));
    r = await LETTRER(cabinet.tok, { tiersId: T.F1.id, lignes: [ID.f0305, ID.r0401] });
    r2 = await LETTRER(cabinet.tok, { tiersId: T.F1.id, lignes: [ID.f0610, ID.r0701] });
    check('lignes déjà lettrées : 409 DEJA_LETTREE ; facture 500 et acompte 200 : 400 ECART (écart 300,000, règlement partiel)', r.status === 409 && r.body?.code === 'DEJA_LETTREE' && r2.status === 400 && r2.body?.code === 'ECART' && /Écart de 300,000 : débits 200,000 ≠ crédits 500,000/.test(r2.body?.message || ''), `${r.status} ${r.body?.code} ${r2.status} ${r2.body?.message}`);
    r = await LETTRER(cabinet.tok, { tiersId: T.F1.id, lignes: [ID.f0610, ID.f0920] });
    r2 = await LETTRER(cabinet.tok, { tiersId: T.C2.id, lignes: [ID.v1001, ID.v0901] });
    r3 = await LETTRER(cabinet.tok, { tiersId: T.F1.id, lignes: [ID.f0610, E.f0610.lignes.find((l) => !l.tiers).id] });
    check('ligne d\'un autre fournisseur (400 TIERS_DIFFERENT) ; écriture en brouillard (409 LIGNE_BROUILLARD) ; ligne sans tiers (400 TIERS_DIFFERENT)', r.status === 400 && r.body?.code === 'TIERS_DIFFERENT' && /n'est pas du fournisseur F0001/.test(r.body?.message || '') && r2.status === 409 && r2.body?.code === 'LIGNE_BROUILLARD' && /validez-la d'abord/.test(r2.body?.message || '') && r3.status === 400 && r3.body?.code === 'TIERS_DIFFERENT', `${r.status} ${r.body?.code} ${r2.status} ${r2.body?.code} ${r3.status} ${r3.body?.code}`);
    r = await LETTRER(cabinet.tok, { tiersId: T.F1.id, lignes: [ID.f0610] });
    r2 = await LETTRER(cabinet.tok, { tiersId: T.F1.id, lignes: [ID.f0610, 999999999] });
    r3 = await LETTRER(cabinet.tok, { tiersId: 999999999, lignes: [ID.f0610, ID.r0701] });
    check('une seule ligne (400 LIGNES_MIN) ; ligne inconnue (409 LIGNE_INTROUVABLE : relisez la page) ; tiers inconnu (409 TIERS_INTROUVABLE)', r.status === 400 && r.body?.code === 'LIGNES_MIN' && r2.status === 409 && r2.body?.code === 'LIGNE_INTROUVABLE' && r3.status === 409 && r3.body?.code === 'TIERS_INTROUVABLE', `${r.status} ${r2.status} ${r2.body?.code} ${r3.status} ${r3.body?.code}`);
    r = await LT(`/tiers/${T.C1.id}`, complet.tok);
    const propC1 = (r.body?.propositions || []).map((p) => p.lignes);
    check('client C0001 : deux propositions « même montant » (facture 2 380 ↔ encaissement ; facture d\'août 595 ↔ avoir)', r.status === 200 && propC1.length === 2 && propC1.map((g) => g.slice().sort().join('-')).sort().join(',') === [[ID.v0515, ID.e0630], [ID.v0801, ID.av0810]].map((g) => g.slice().sort().join('-')).sort().join(','), JSON.stringify(r.body?.propositions));

    // ── L'échéancier (avant le lettrage des clients) ──
    const EC = (chemin, jeton) => appel('GET', `/api/compta/dossiers/${A.id}/echeancier${chemin}`, jeton);
    // Les lignes non lettrées attendues : dû côté du tiers, échéance (celle de la ligne, sinon date + délai si le dû
    // augmente) ; les factures par tranche, puis les règlements et avoirs imputés sur les plus anciennes (relecture de S7a).
    const attendu = (lignes) => {
      const t = { nonEchu: 0n, j30: 0n, j60: 0n, j90: 0n, plus90: 0n };
      let credits = 0n;
      for (const [du, echeance] of lignes) { const v = mm(du); if (v > 0n) t[trancheDe(jours(echeance, AU))] += v; else credits -= v; }
      for (const c of ['plus90', 'j90', 'j60', 'j30', 'nonEchu']) { const x = t[c] < credits ? t[c] : credits; t[c] -= x; credits -= x; }
      if (credits > 0n) t.nonEchu -= credits;
      return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, txt(v)]));
    };
    const echuDe = (a) => mm(a.j30) + mm(a.j60) + mm(a.j90) + mm(a.plus90);
    const attF1 = attendu([['500.000', '2026-07-10'], ['-200.000', '2026-07-01']]);
    const attF2 = attendu([['300.000', '2026-09-20']]);
    r = await EC('', consult.tok);
    const rangee = (b, code) => b?.rangees?.find((x) => x.tiers.code === code);
    check(`échéancier fournisseurs au ${AU} (Consultation) : F0001 dû 300 (facture 500 − acompte 200, tranches ${JSON.stringify(attF1)}), F0002 dû 300, total 600`,
      r.status === 200 && r.body?.type === 'fournisseur' && r.body?.au === AU && r.body?.tranches?.length === 5 && r.body?.rangees?.length === 2 && rangee(r.body, 'F0001')?.total === '300.000' && JSON.stringify(rangee(r.body, 'F0001')?.tranches) === JSON.stringify(attF1)
      && rangee(r.body, 'F0002')?.total === '300.000' && JSON.stringify(rangee(r.body, 'F0002')?.tranches) === JSON.stringify(attF2) && r.body?.totaux?.total === '600.000' && r.body?.totaux?.nbLignes === 3 && /^Madame, Monsieur,/.test(r.body?.texteRelance || ''), `${r.status} ${JSON.stringify(r.body?.rangees)} ${r.body?.message || ''}`);
    const attC1 = attendu([['2380.000', plus('2026-05-15', 45)], ['595.000', plus('2026-08-01', 45)], ['-595.000', '2026-08-10'], ['-2380.000', '2026-06-30']]);
    const attC2 = attendu([['1000.000', '2026-09-01'], ['119.000', '2026-10-01']]);
    r = await EC('?type=client', cabinet.tok);
    r2 = await EC('?type=client&brouillard=0', cabinet.tok);
    check(`échéancier clients : C0001 dû 0 (règlements et avoir imputés sur les factures les plus anciennes : ${JSON.stringify(attC1)}, rien d'échu), C0002 dû 1 119 dont 119 en brouillard ; validées seulement : C0002 dû 1 000`,
      r.status === 200 && rangee(r.body, 'C0001')?.total === '0.000' && JSON.stringify(rangee(r.body, 'C0001')?.tranches) === JSON.stringify(attC1) && rangee(r.body, 'C0001')?.echu === '0.000' && rangee(r.body, 'C0001')?.credits === '2975.000' && rangee(r.body, 'C0002')?.total === '1119.000' && JSON.stringify(rangee(r.body, 'C0002')?.tranches) === JSON.stringify(attC2) && rangee(r.body, 'C0002')?.nbBrouillard === 1
      && r2.status === 200 && rangee(r2.body, 'C0002')?.total === '1000.000' && r2.body?.totaux?.nbBrouillard === 0, `${r.status} ${JSON.stringify(r.body?.rangees)} ${r2.status}`);
    r = await EC(`/tiers/${T.F1.id}`, saisie.tok);
    check('F0001 déplié : 2 lignes, échéances les plus anciennes d\'abord (acompte au 01/07, facture au 10/07 saisie), retards au jour de l\'essai, dû 300, débit 200, crédit 500',
      r.status === 200 && r.body?.lignes?.length === 2 && r.body?.lignes?.[0]?.ecriture?.reference === 'RLV-0701' && r.body?.lignes?.[0]?.du === '-200.000' && r.body?.lignes?.[0]?.echeance === '2026-07-01' && r.body?.lignes?.[0]?.echeanceSaisie === false && r.body?.lignes?.[1]?.echeance === '2026-07-10' && r.body?.lignes?.[1]?.echeanceSaisie === true
      && r.body?.lignes?.[1]?.retard === jours('2026-07-10', AU) && r.body?.totaux?.du === '300.000' && r.body?.totaux?.debit === '200.000' && r.body?.totaux?.credit === '500.000' && r.body?.total === 2, `${r.status} ${JSON.stringify(r.body?.lignes?.map((l) => [l.ecriture.reference, l.echeance, l.retard]))} ${JSON.stringify(r.body?.totaux)}`);
    let f = await telecharger(`/api/compta/dossiers/${A.id}/echeancier/tiers/${T.F1.id}/releve.pdf`, consult.tok);
    check('relevé de compte F0001 en PDF (Consultation) : 200, application/pdf, nommé releve-F0001-…', f.status === 200 && /application\/pdf/.test(f.type) && f.buffer.slice(0, 5).toString() === '%PDF-' && /releve-F0001-Societe-Tunisienne-de-Boissons-\d{4}-\d{2}-\d{2}\.pdf/.test(f.disposition), `${f.status} ${f.type} ${f.disposition}`);
    f = await telechargerPost(`/api/compta/dossiers/${A.id}/echeancier/tiers/${T.F1.id}/relance.pdf`, cabinet.tok, {});
    r = await telechargerPost(`/api/compta/dossiers/${A.id}/echeancier/tiers/${T.C2.id}/relance.pdf`, saisie.tok, { texte: 'Madame, Monsieur,\n\nMerci de régler les séjours ci-dessous.\n\nCordialement' });
    r2 = await telechargerPost(`/api/compta/dossiers/${A.id}/echeancier/tiers/${T.C2.id}/relance.pdf`, saisie.tok, { texte: 'Merci 🙏' });
    r3 = await telecharger(`/api/compta/dossiers/${A.id}/echeancier/tiers/${T.C2.id}/relance.pdf`, saisie.tok);
    check('relance (POST, texte dans le corps) : un fournisseur → 400 RELANCE_CLIENT ; C0002 (1 000 échu) avec un texte modifié → PDF ; un émoji → 400 TEXTE_ILLISIBLE ; en GET : 404', f.status === 400 && f.body?.code === 'RELANCE_CLIENT' && r.status === 200 && r.buffer.slice(0, 5).toString() === '%PDF-' && /relance-C0002-Agence-Carthage-/.test(r.disposition) && r2.status === 400 && r2.body?.code === 'TEXTE_ILLISIBLE' && r3.status === 404, `${f.status} ${f.body?.code} ${r.status} ${r2.status} ${r2.body?.code} ${r3.status}`);
    f = await telecharger(`/api/compta/dossiers/${A.id}/echeancier/export?type=client`, consult.tok);
    const agee = await rangeesFeuille(f.buffer, 'Balance âgée', 'Code');
    const detail = await rangeesFeuille(f.buffer, 'Détail', 'Code');
    check('export Excel des clients : deux feuilles (Balance âgée : C0001, C0002 et le total ; Détail : 6 lignes non lettrées dont 1 en brouillard)',
      f.status === 200 && /spreadsheetml/.test(f.type) && /echeancier-clients-Hotel-Essai-S7a-\d{4}-\d{2}-\d{2}\.xlsx/.test(f.disposition) && agee.feuilles.join(',') === 'Balance âgée,Détail' && agee.rangees.length === 3 && agee.rangees[0][0] === 'C0001' && agee.rangees[2][0] === 'Total' && Number(agee.rangees[1][7]) === 1119
      && detail.rangees.length === 6 && detail.enTetes[detail.enTetes.length - 1] === 'État' && detail.rangees.filter((x) => x[13] === 'Brouillard').length === 1, `${f.status} ${f.disposition} ${JSON.stringify(agee.rangees)} ${detail.rangees.length}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, consult.tok);
    check('fiche du dossier, carte Tenue : à lettrer (fournisseurs 3, clients 5), dû fournisseurs 600, clients 1 119 et sa part échue', r.status === 200 && r.body?.tenue?.fournisseurs?.aLettrer === 3 &&r.body?.tenue?.clients?.aLettrer === 5 && r.body?.tenue?.fournisseurs?.du === '600.000' && r.body?.tenue?.clients?.du === '1119.000' && r.body?.tenue?.clients?.echu === txt(echuDe(attC1) + echuDe(attC2)), JSON.stringify(r.body?.tenue));
    // Un règlement partiel du jour (relecture de S7a) : imputé sur les factures les plus anciennes, il réduit l'échu.
    E.r1009 = await ecrire(J.BQ.id, AU, 'RLV-JOUR', 'Acompte Agence Carthage', [L('5321', null, '300'), L('4111', T.C2, '', '300')]);
    r = await EC(`/tiers/${T.C2.id}`, cabinet.tok);
    const attC2b = attendu([['1000.000', '2026-09-01'], ['119.000', '2026-10-01'], ['-300.000', AU]]);
    f = await telechargerPost(`/api/compta/dossiers/${A.id}/echeancier/tiers/${T.C2.id}/relance.pdf`, cabinet.tok, {});
    check(`règlement partiel du jour (300, en brouillard) : imputé sur la facture la plus ancienne, échu ${txt(echuDe(attC2b))} = dû 819 (et non 1 119) ; la relance part`, r.status === 200 && r.body?.totaux?.du === '819.000' && r.body?.totaux?.echu === txt(echuDe(attC2b)) && JSON.stringify(r.body?.totaux?.tranches) === JSON.stringify(attC2b) && r.body?.totaux?.credits === '300.000' && r.body?.lignes?.find((l) => l.ecriture.reference === 'RLV-JOUR')?.tranche === null && f.status === 200, `${r.status} ${JSON.stringify(r.body?.totaux)} ${f.status}`);

    // ── Plusieurs lettres d'un coup (Complet), délettrer ──
    r = await LETTRER(complet.tok, { tiersId: T.C1.id, groupes: [[ID.e0630, ID.v0515], [ID.av0810, ID.v0801]] });
    const aab = r.body?.lettres?.find((x) => x.lettre === 'AAB');
    check('Complet lettre les deux propositions de C0001 d\'un coup : AAA (2 380) et AAB (595), plus aucune ligne non lettrée', r.status === 201 && r.body?.faites?.map((x) => `${x.lettre}:${x.montant}`).join(',') === 'AAA:2380.000,AAB:595.000' && r.body?.lignes?.length === 0 && r.body?.lettres?.length === 2 && !!aab, `${r.status} ${JSON.stringify(r.body?.faites || r.body?.message)}`);
    f = await telechargerPost(`/api/compta/dossiers/${A.id}/echeancier/tiers/${T.C1.id}/relance.pdf`, cabinet.tok, {});
    check('C0001 soldé et tout lettré : relance → 409 RIEN_ECHU', f.status === 409 && f.body?.code === 'RIEN_ECHU', `${f.status} ${f.body?.code}`);
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/lettrage/${aab?.id}`, consult.tok);
    r2 = await appel('DELETE', `/api/compta/dossiers/${A.id}/lettrage/${aab?.id}`, saisie.tok);
    r3 = await appel('DELETE', `/api/compta/dossiers/${A.id}/lettrage/${aab?.id}`, saisie.tok);
    ev = await journal(espaceId, 'lettrage_defait');
    check('délettrer AAB : Consultation 403 ; Saisie 200 (2 lignes redeviennent non lettrées, journal motif « demande ») ; une seconde fois : 409 LETTRE_INTROUVABLE', r.status === 403 && r2.status === 200 && r2.body?.lignes?.length === 2 && r2.body?.lettres?.length === 1 && r2.body?.defaite?.lettre === 'AAB' && ev?.details?.motif === 'demande' && ev?.details?.lettre === 'AAB' && ev?.details?.lignes?.length === 2 && r3.status === 409 && r3.body?.code === 'LETTRE_INTROUVABLE', `${r.status} ${r2.status} ${r3.status} ${r3.body?.code}`);
    r = await LETTRER(saisie.tok, { tiersId: T.C1.id, lignes: [ID.v0801, ID.av0810] });
    check('relettrer la facture d\'août et l\'avoir : la lettre suivante (AAB, rendue libre)', r.status === 201 && r.body?.faites?.[0]?.lettre === 'AAB', `${r.status} ${JSON.stringify(r.body?.faites)}`);

    // ── La lettre dans les livres et les écritures ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/livres/grand-livre?tiers=${T.F1.id}`, consult.tok);
    check('grand livre de F0001 : la lettre AAA sur la facture F-0305 et son règlement, rien sur les autres', r.status === 200 && r.body?.lignes?.length === 4 && r.body?.lignes?.filter((l) => l.lettre === 'AAA').map((l) => l.ecriture.reference).sort().join(',') === 'F-0305,RLV-0401' && r.body?.lignes?.filter((l) => l.lettre === null).length === 2, `${r.status} ${JSON.stringify(r.body?.lignes?.map((l) => [l.ecriture.reference, l.lettre]))}`);
    f = await telecharger(`/api/compta/dossiers/${A.id}/livres/grand-livre/export?tiers=${T.F1.id}`, consult.tok);
    const gl = await rangeesFeuille(f.buffer, 'Grand livre', 'Date');
    check('export du grand livre : colonne Lettre en dernier (AAA sur 2 lignes), les colonnes de S6c à leur place', f.status === 200 && gl.enTetes[12] === 'Lettre' && gl.enTetes[11] === 'État' && gl.rangees.filter((x) => x[12] === 'AAA').length === 2, `${f.status} ${JSON.stringify(gl.enTetes)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures/${E.f0305.id}`, consult.tok);
    check('page Écritures : la ligne 4011 de F-0305 porte la lettre AAA', r.status === 200 && r.body?.ecriture?.lignes?.find((l) => l.tiers)?.lettre === 'AAA' && r.body?.ecriture?.lignes?.filter((l) => !l.tiers).every((l) => l.lettre === null), JSON.stringify(r.body?.ecriture?.lignes?.map((l) => l.lettre)));

    // ── La contre-passation délettre d'office ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures/${E.v0801.id}/contrepasser`, cabinet.tok, { date: '2026-10-02' });
    ev = await journal(espaceId, 'lettrage_defait');
    r2 = await LT(`/tiers/${T.C1.id}`, cabinet.tok);
    const parPiece = (r2.body?.propositions || []).find((p) => p.motif === 'contrepassation');
    f = await telechargerPost(`/api/compta/dossiers/${A.id}/echeancier/tiers/${T.C1.id}/relance.pdf`, cabinet.tok, {});
    check('contre-passer la facture d\'août : 201, délettrées [C0001 AAB] (journal motif « contre-passation ») ; C0001 : 3 lignes non lettrées, la proposition « contre-passation » FV-0801 ; plus rien d\'échu : relance 409 RIEN_ECHU',
      r.status === 201 && JSON.stringify(r.body?.delettrees) === '["C0001 AAB"]' && ev?.details?.motif === 'contrepassation' && ev?.details?.lettre === 'AAB' && ev?.details?.ecriture === E.v0801.id && r2.body?.lignes?.length === 3 && parPiece?.piece === 'FV-0801' && parPiece?.lignes?.length === 2 && parPiece?.lignes?.[0] === ID.v0801 && parPiece?.montant === '595.000' && f.status === 409 && f.body?.code === 'RIEN_ECHU', `${r.status} ${JSON.stringify(r.body?.delettrees)} ${JSON.stringify(r2.body?.propositions)} ${f.status}`);
    ev = await journal(espaceId, 'ecriture_contrepassee');
    r = await LETTRER(saisie.tok, { tiersId: T.C1.id, lignes: parPiece?.lignes || [] });
    check('journal ecriture_contrepassee : delettrees ; la facture et sa contre-passation se lettrent (AAB)', JSON.stringify(ev?.details?.delettrees) === '["C0001 AAB"]' && r.status === 201 && r.body?.faites?.[0]?.lettre === 'AAB' && r.body?.lignes?.length === 1 && r.body?.lignes?.[0]?.ecriture?.reference === 'AV-0810', `${JSON.stringify(ev?.details?.delettrees)} ${r.status} ${JSON.stringify(r.body?.faites)}`);

    // ── Dossier B : cloisonnement croisé ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: { ...IDENTITE_A, raisonSociale: 'Dossier B S7a', matriculeFiscal: '' }, regime: REEL, exercice: CIVIL });
    const B = r.body;
    const fB = (await appel('POST', `/api/compta/dossiers/${B?.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Fournisseur de B' })).body?.tiers;
    r = await appel('GET', `/api/compta/dossiers/${B?.id}/lettrage/tiers/${T.F1.id}`, cabinet.tok);
    r2 = await LETTRER(cabinet.tok, { tiersId: fB?.id, lignes: [ID.f0610, ID.r0701] }, B?.id);
    r3 = await appel('DELETE', `/api/compta/dossiers/${B?.id}/lettrage/${aab?.id}`, cabinet.tok);
    const r4 = await appel('GET', `/api/compta/dossiers/${B?.id}/echeancier/tiers/${T.C1.id}`, cabinet.tok);
    const r5 = await appel('GET', `/api/compta/dossiers/${B?.id}/lettrage`, cabinet.tok);
    check('cloisonnement croisé : tiers d\'un AUTRE dossier → 404 ; ses lignes et sa lettre → 409 « introuvable » (comme une ligne supprimée, rien n\'est révélé) ; la page Lettrage de B est vide', r.status === 404 && r2.status === 409 && r2.body?.code === 'LIGNE_INTROUVABLE' && r3.status === 409 && r3.body?.code === 'LETTRE_INTROUVABLE' && r4.status === 404 && r5.status === 200 && r5.body?.tiers?.length === 0, `${r.status} ${r2.status} ${r3.status} ${r4.status} ${r5.status}`);

    // ── Dossier archivé, lecture seule ──
    await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    r = await LETTRER(cabinet.tok, { tiersId: T.F1.id, lignes: [ID.f0610, ID.r0701] });
    r2 = await appel('DELETE', `/api/compta/dossiers/${A.id}/lettrage/${aab?.id}`, cabinet.tok);
    r3 = await EC('?type=client', cabinet.tok);
    check('dossier archivé : lettrer, délettrer → 409 DOSSIER_ARCHIVE ; l\'échéancier se lit', r.status === 409 && r.body?.code === 'DOSSIER_ARCHIVE' && r2.status === 409 && r3.status === 200, `${r.status} ${r2.status} ${r3.status}`);
    await appel('POST', `/api/compta/dossiers/${A.id}/desarchiver`, cabinet.tok);
    await mode(cabinet.id, 'read_only');
    r = await LETTRER(cabinet.tok, { tiersId: T.F1.id, lignes: [ID.f0610, ID.r0701] });
    r2 = await LT(`/tiers/${T.F1.id}`, cabinet.tok);
    f = await telecharger(`/api/compta/dossiers/${A.id}/echeancier/tiers/${T.F1.id}/releve.pdf`, cabinet.tok);
    check('comptabilité en lecture seule : lettrer → 403 READ_ONLY ; le tiers et le relevé se lisent', r.status === 403 && r.body?.code === 'READ_ONLY' && r2.status === 200 && f.status === 200, `${r.status} ${r.body?.code} ${r2.status} ${f.status}`);
    await mode(cabinet.id, 'actif');
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/tiers/${T.F1.id}`, cabinet.tok);
    check('hook inchangé : un tiers lettré ne se supprime pas (409)', r.status === 409, `${r.status}`);

    // ── Rejeu de la migration 218 ; manuel ──
    const nbLettres = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.lettrages WHERE dossier_id = $1', [A.id])).rows[0].n;
    await pool.query(`DELETE FROM _migrations WHERE filename = '218_compta_lettrage.sql'`);
    await require('../src/config/migrate')();
    check('migration 218 rejouée sans erreur ; lettres de A intactes (F0001 AAA, C0001 AAA et AAB)', (await pool.query(`SELECT 1 FROM _migrations WHERE filename = '218_compta_lettrage.sql'`)).rows.length === 1 && nbLettres === 3 && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.lettrages WHERE dossier_id = $1', [A.id])).rows[0].n === 3, `${nbLettres}`);
    const manuel = (await pool.query(`SELECT slug, contenu_defaut, ecran, ordre FROM manuel_sections WHERE produit = 'compta'`)).rows;
    const texte = (slug) => manuel.find((m) => m.slug === slug)?.contenu_defaut || '';
    check('manuel : fiche « Lettrage et échéancier » (/lettrage, 1073) ; « Tiers », « Fiche du dossier » et « Grand livre et balance » retouchées',
      /## 🔗 Lettrage et échéancier/.test(texte('compta-lettrage')) && manuel.find((m) => m.slug === 'compta-lettrage')?.ecran === '/lettrage' && manuel.find((m) => m.slug === 'compta-lettrage')?.ordre === 1073
      && /6\. \*\*Lettrage\*\*/.test(texte('compta-tiers')) && /\*\*Lettrage\*\* et \*\*Échéancier\*\*/.test(texte('compta-dossier')) && /\*\*lettre\*\* \(la marque du lettrage/.test(texte('compta-livres')), manuel.map((m) => m.slug).join(','));

    // ── Les pages d'avant ne changent pas ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/livres/balance?type=fournisseurs`, saisie.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures`, saisie.tok);
    r3 = await appel('GET', `/api/compta/dossiers/${A.id}/periodes`, saisie.tok);
    check('balance auxiliaire (cohérente, F0001 solde crédit 300), écritures (13 dont la contre-passation et l\'acompte du jour), périodes inchangées', r.status === 200 && r.body?.controles?.coherent === true && rangee(r.body, 'F0001')?.soldeCredit === '300.000' &&r2.status === 200 && r2.body?.total === 13 && r3.status === 200 && r3.body?.exercice?.periodes?.length === 12, `${r.status} ${r2.status} ${r2.body?.total} ${r3.status}`);
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
