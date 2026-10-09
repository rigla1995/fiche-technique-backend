/* Test E2E local — LabFlow Compta, étape S7c « Déclaration mensuelle » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne
 * S7c, §2 « S7c », §4 ; réponses du client du 09/10 — « ok pour les 9 » ; question 7 : pas de vente à l'export).
 *   un dossier au réel (personne morale télédéclarante : échéance le 20) avec, en septembre, un achat avec TVA, timbre et
 *   retenue réglé et lettré, deux ventes avec TVA et timbre ; la page Déclaration mensuelle (période par défaut, lignes,
 *   total, échéance, TCL TTC, signalements, droits de lecture) ; préparer (lignes saisies à la main, TCL corrigée ; droits,
 *   refus) ; proposer l'écriture de liquidation (refus : brouillard, mois en cours ; brouillard dans le journal OD, lignes,
 *   une seule ; supprimée puis reproposée ; période close : premier jour de la période ouverte suivante avec sa vraie date ;
 *   pas « TVA sans code » sur la page Taxes du mois ; validée puis contre-passée : une nouvelle se propose) ; marquer comme déclarée (droits, dates, total périmé, figé, refus de
 *   préparer), écart signalé après une écriture ajoutée, retirer la marque ; export Excel, PDF ; carte de la fiche ;
 *   cloisonnement ; dossier archivé ; lecture seule ; rejeu de la migration 220 ; manuel.
 * Crée un super_admin, un cabinet (3 gérants achetés) et trois collaborateurs temporaires ; règle les tarifs Compta le
 * temps de l'essai, puis restaure et nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');
const { aujourdhuiTunis } = require('../src/compta/echeances');

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
const feuilles = async (buffer) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer); return wb.worksheets.map((w) => w.name); };
const login = async (email) => appel('POST', '/auth/login', null, { email, password: MDP });
const CLES = ['compta_cabinet_mensuel', 'compta_gerant_cabinet_mensuel', 'compta_mise_en_route', 'compta_module_mensuel', 'compta_gerant_client_mensuel'];

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s7c@example.com';
  const CABINET = 'test-cabinet-compta-s7c@example.com';
  const SAISIE = 'test-saisie-compta-s7c@example.com';
  const COMPLET = 'test-complet-compta-s7c@example.com';
  const CONSULT = 'test-consult-compta-s7c@example.com';
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
  const IDENTITE_A = { raisonSociale: 'Hôtel Essai S7c', formeJuridique: 'SARL', matriculeFiscal: '1234567A/A/M/000', adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' };
  const REEL = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const CIVIL = { debut: '2026-01-01', fin: '2026-12-31' };
  const compte = (plan, numero) => plan?.comptes?.find((c) => c.numero === numero);
  const jour = aujourdhuiTunis();

  try {
    await wipe();
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin S7c', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    const adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (3 gérants achetés) avec trois collaborateurs ──
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S7c', email: CABINET, telephone: '20 555 397', raisonSociale: 'Cabinet Essai S7c', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S7c', representantQualite: 'Gérant', nbGerants: 3,
    });
    check('création du cabinet (3 gérants achetés)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const cabinet = await activer(CABINET);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    let r2 = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaboratrice Saisie', email: SAISIE, niveau: 'saisie', dossiers: 'tous' });
    let r3 = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Complet', email: COMPLET, niveau: 'complet', dossiers: 'tous' });
    let r4 = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Consultation', email: CONSULT, niveau: 'consultation', dossiers: 'tous' });
    const saisie = await activer(SAISIE);
    const complet = await activer(COMPLET);
    const consult = await activer(CONSULT);
    check('cabinet et collaborateurs Saisie, Complet, Consultation connectés', !!cabinet.tok && !!espaceId && r2.status === 201 && r3.status === 201 && r4.status === 201 && !!saisie.tok && !!complet.tok && !!consult.tok);

    // ── Dossier A (réel, personne morale télédéclarante) ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REEL, exercice: CIVIL });
    const A = r.body;
    check('dossier A créé (exercice 2026, télédéclarant)', r.status === 201 && A?.exercice?.periodes?.length === 12, `${r.status}`);
    const planA = (await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok)).body;
    const K = Object.fromEntries(['607', '6654', '43666', '436711', '432', '4375', '4011', '4111', '5321', '707', '43651', '43667'].map((n) => [n, compte(planA, n)]));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    const J = Object.fromEntries(['AC', 'VT', 'BQ', 'OD'].map((c) => [c, r.body?.journaux?.find((j) => j.code === c)]));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok);
    const X = Object.fromEntries((r.body?.taxes || []).map((t) => [t.code, t]));
    check('comptes (dont 43651 et 43667), journaux (dont OD) et codes de taxe de A', Object.values(K).every(Boolean) && Object.values(J).every(Boolean) && !!X.TVA19 && !!X.RS_MAR15 && !!X.TIMBRE, JSON.stringify(Object.keys(K).filter((k) => !K[k])));
    const TIERS = (corps) => appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, corps);
    const F1 = (await TIERS({ type: 'fournisseur', nom: 'Société Tunisienne de Boissons', matriculeFiscal: '7654321B/A/M/000', regimeFiscal: 'pm_is25', retenueId: X.RS_MAR15.id, adresse: '12 rue de Marseille', ville: 'Tunis', email: 'compta@stb-essai.tn', telephone: '71 123 456' })).body?.tiers;
    const C1 = (await TIERS({ type: 'client', nom: 'Agence Voyages Essai', matriculeFiscal: '2222222D/A/M/000' })).body?.tiers;
    check('fournisseur F0001 (IS 25 %, retenue RS_MAR15) et client C0001 créés', !!F1 && !!C1);

    // ── Écritures de septembre ──
    const ecrire = async (journalId, date, reference, libelle, lignes, jeton = cabinet.tok) => {
      const x = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures`, jeton, { journalId, date, reference, libelle, lignes });
      if (x.status !== 201) throw new Error(`écriture ${reference} : ${x.status} ${x.body?.message}`);
      return x.body.ecriture;
    };
    const L = (k, { tiers, d, c, taxe } = {}) => ({ compteId: K[k].id, tiersId: tiers ? tiers.id : null, debit: d || '', credit: c || '', taxeId: taxe ? X[taxe].id : null });
    const E = {};
    // Achat STB : 1 000 + 190 + timbre 1 ; retenue 1,5 % du TTC hors timbre = 17,850 ; réglé et lettré le 20/09.
    E.f0905 = await ecrire(J.AC.id, '2026-09-05', 'F-0905', 'Facture STB', [L('607', { d: '1000', taxe: 'TVA19' }), L('43666', { d: '190', taxe: 'TVA19' }), L('6654', { d: '1', taxe: 'TIMBRE' }), L('432', { c: '17.850', taxe: 'RS_MAR15' }), L('4011', { tiers: F1, c: '1173.150' })]);
    E.r0920 = await ecrire(J.BQ.id, '2026-09-20', 'RLV-0920', 'Règlement STB', [L('4011', { tiers: F1, d: '1173.150' }), L('5321', { c: '1173.150' })]);
    // Deux ventes : 2 000 + 380 + timbre 1 ; 1 000 + 190 + timbre 1.
    E.v0910 = await ecrire(J.VT.id, '2026-09-10', 'FV-0910', 'Séjour groupe', [L('4111', { tiers: C1, d: '2381' }), L('707', { c: '2000', taxe: 'TVA19' }), L('436711', { c: '380', taxe: 'TVA19' }), L('4375', { c: '1', taxe: 'TIMBRE' })]);
    E.v0915 = await ecrire(J.VT.id, '2026-09-15', 'FV-0915', 'Séjour individuel', [L('4111', { tiers: C1, d: '1191' }), L('707', { c: '1000', taxe: 'TVA19' }), L('436711', { c: '190', taxe: 'TVA19' }), L('4375', { c: '1', taxe: 'TIMBRE' })]);
    const P = Object.fromEntries((await appel('GET', `/api/compta/dossiers/${A.id}/periodes`, cabinet.tok)).body.exercice.periodes.map((p) => [String(p.debut).slice(5, 7), p]));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${P['09'].id}/valider`, cabinet.tok);
    const lt = (e) => e.lignes.find((l) => l.tiers);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/lettrage`, saisie.tok, { tiersId: F1.id, groupes: [[lt(E.f0905).id, lt(E.r0920).id]] });
    check('septembre saisi, validé ; la facture STB lettrée avec son règlement', r.status === 200 && r2.status === 201, `${r.status} ${r2.status} ${r2.body?.message || ''}`);

    // ── La page Déclaration mensuelle ──
    const DEC = (q, jeton) => appel('GET', `/api/compta/dossiers/${A.id}/declaration${q}`, jeton);
    r = await DEC(`?periode=${P['09'].id}`, consult.tok);
    const b = r.body;
    const ligne = (cle) => b?.lignes?.find((l) => l.cle === cle);
    check('septembre (Consultation) : TVA à payer 380 (570 − 190), retenue RS7_000001 17,850 (à certifier), timbre 2 pièces 2,000, TCL 0,2 % de 3 570 (3 000 + TVA 570) = 7,140, total 406,990 ; échéance 20/10/2026',
      r.status === 200 && b?.tva?.collectee === '570.000' && b?.tva?.deductible === '190.000' && ligne('tva')?.montant === '380.000' && ligne('rs:RS7_000001|1.500')?.montant === '17.850' && b?.retenues?.natures?.[0]?.aCertifier === '17.850'
      && ligne('timbre')?.montant === '2.000' && /2 pièces/.test(ligne('timbre')?.libelle || '') && b?.tcl?.base === '3570.000' && ligne('tcl')?.montant === '7.140' && b?.total === '406.990' && b?.echeance?.date === '2026-10-20' && !ligne('fodec') && !ligne('avances'),
      `${r.status} ${JSON.stringify(b?.lignes)} ${b?.total} ${JSON.stringify(b?.echeance)} ${r.body?.message || ''}`);
    check('lignes saisies à la main (5, vides) ; signalements : période encore ouverte, TCL à valider ; aperçu de liquidation : 43666 au crédit 190, 436711 au débit 570, 43651 au crédit 380 ; Consultation ne peut rien écrire (droits)',
      b?.saisies?.length === 5 && b.saisies.every((s) => s.montant === null) && b?.signalements?.some((s) => s.code === 'PERIODE_OUVERTE') && b?.signalements?.some((s) => s.code === 'TCL')
      && b?.liquidation?.possible === true && b?.liquidation?.date === '2026-09-30' && b?.liquidation?.lignes?.map((l) => `${l.numero}:${l.debit}:${l.credit}`).join(' ') === '43666:0.000:190.000 436711:570.000:0.000 43651:0.000:380.000' && b?.droits?.configurer === false,
      `${JSON.stringify(b?.signalements?.map((s) => s.code))} ${JSON.stringify(b?.liquidation)}`);
    r2 = await DEC('', consult.tok);
    const attendue = Object.values(P).filter((p) => p.fin < jour).sort((x, y) => (x.fin < y.fin ? 1 : -1))[0];
    check('sans période : la dernière période finie ; un étranger : 404', r2.status === 200 && r2.body?.periode?.id === attendue?.id && (await DEC('', adminTok)).status === 404, `${r2.status} ${r2.body?.periode?.debut}`);

    // ── Préparer ──
    const PREP = (jeton, corps, periodeId = P['09'].id) => appel('PUT', `/api/compta/dossiers/${A.id}/declaration/${periodeId}`, jeton, corps);
    r = await PREP(saisie.tok, { saisies: { tfp: '120' } });
    r2 = await PREP(complet.tok, { saisies: { inconnue: '1' } });
    r3 = await PREP(complet.tok, { saisies: { tfp: '-5' } });
    check('préparer : Saisie 403 ; ligne inconnue 400 ; montant négatif 400', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT' && r2.status === 400 && r3.status === 400, `${r.status} ${r2.status} ${r3.status}`);
    r = await PREP(complet.tok, { saisies: { tfp: '120', foprolos: '60,500', css: '' }, tcl: '10' });
    let ev = await journal(espaceId, 'declaration_preparee');
    r2 = await DEC(`?periode=${P['09'].id}`, consult.tok);
    check('Complet prépare : TFP 120, FOPROLOS 60,500, TCL corrigée 10 → total 590,350 ; journal declaration_preparee (avant / après)',
      r.status === 200 && r2.body?.total === '590.350' && r2.body?.lignes?.find((l) => l.cle === 'tcl')?.corrigee === true && r2.body?.saisies?.find((s) => s.cle === 'foprolos')?.montant === '60.500' && ev?.details?.apres?.saisies?.tfp === '120.000' && ev?.details?.apres?.tcl === '10.000' && ev?.auteur_id === complet.id,
      `${r.status} ${r2.body?.total} ${JSON.stringify(ev?.details)}`);
    r = await PREP(complet.tok, { saisies: { tfp: '120', foprolos: '60,500' }, tcl: '' });
    r2 = await DEC(`?periode=${P['09'].id}`, consult.tok);
    check('TCL vide : le calcul revient (7,140) → total 587,490', r.status === 200 && r2.body?.total === '587.490' && r2.body?.lignes?.find((l) => l.cle === 'tcl')?.montant === '7.140', `${r2.body?.total}`);

    // ── L'écriture de liquidation de la TVA ──
    const PROP = (jeton, periodeId = P['09'].id) => appel('POST', `/api/compta/dossiers/${A.id}/declaration/${periodeId}/ecriture-tva`, jeton);
    E.b0928 = await ecrire(J.AC.id, '2026-09-28', 'F-0928', 'Achat en brouillard', [L('607', { d: '100' }), L('4011', { tiers: F1, c: '100' })]);
    r = await PROP(complet.tok);
    r2 = await PROP(complet.tok, P['10'].id);
    r3 = await PROP(saisie.tok);
    check('proposer : brouillard dans la période → 409 BROUILLARD ; octobre pas fini → 409 PERIODE_EN_COURS ; Saisie → 403', r.status === 409 && r.body?.code === 'BROUILLARD' && (jour <= P['10'].fin ? r2.status === 409 && r2.body?.code === 'PERIODE_EN_COURS' : true) && r3.status === 403, `${r.status} ${r.body?.code} ${r2.status} ${r2.body?.code} ${r3.status}`);
    await appel('DELETE', `/api/compta/dossiers/${A.id}/ecritures/${E.b0928.id}`, cabinet.tok);
    r = await PROP(complet.tok);
    const liq = r.body?.ecriture;
    ev = await journal(espaceId, 'ecriture_tva_proposee');
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures/${liq?.id}`, consult.tok);
    const lignesLiq = (r2.body?.ecriture?.lignes || []).map((l) => `${l.compte?.numero}:${l.debit}:${l.credit}`).join(' ');
    check('Complet propose : brouillard du journal OD daté du 30/09, « Liquidation de la TVA de septembre 2026 », TVA-2026-09 ; lignes 43666 C 190, 436711 D 570, 43651 C 380 ; journal ecriture_tva_proposee',
      r.status === 201 && liq?.date === '2026-09-30' && liq?.dateReelle === null && liq?.reference === 'TVA-2026-09' && liq?.total === '570.000' && r2.body?.ecriture?.etat === 'brouillard' && r2.body?.ecriture?.journal?.code === 'OD' && r2.body?.ecriture?.libelle === 'Liquidation de la TVA de septembre 2026' && ev?.details?.ecriture === liq?.id && lignesLiq === '43666:0.000:190.000 436711:570.000:0.000 43651:0.000:380.000',
      `${r.status} ${JSON.stringify(liq)} ${r2.body?.ecriture?.etat} ${JSON.stringify(r2.body?.ecriture?.journal)} ${lignesLiq}`);
    r = await PROP(complet.tok);
    r2 = await DEC(`?periode=${P['09'].id}`, consult.tok);
    r3 = await appel('GET', `/api/compta/dossiers/${A.id}/taxes-mois?periode=${P['09'].id}`, consult.tok);
    check('une seule par période (409 DEJA_PROPOSEE) ; la page montre l\'écriture et ne compte pas son brouillard ; Taxes du mois : TVA inchangée (à payer 380), pas de « TVA sans code »',
      r.status === 409 && r.body?.code === 'DEJA_PROPOSEE' && r2.body?.declaration?.ecriture?.id === liq?.id && r2.body?.declaration?.ecriture?.etat === 'brouillard' && r2.body?.nbBrouillard === 0 && r2.body?.liquidation?.raison === 'DEJA'
      && r3.status === 200 && r3.body?.tva?.aPayer === '380.000' && !(r3.body?.signalements || []).some((s) => s.code === 'TVA_SANS_CODE'), `${r.status} ${r.body?.code} ${r2.body?.nbBrouillard} ${JSON.stringify((r3.body?.signalements || []).map((s) => s.code))}`);
    // Supprimée (brouillard), elle se repropose ; la période close : premier jour de la période ouverte suivante, vraie date.
    await appel('DELETE', `/api/compta/dossiers/${A.id}/ecritures/${liq.id}`, cabinet.tok);
    r = await DEC(`?periode=${P['09'].id}`, consult.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${P['09'].id}/clore`, cabinet.tok);
    r3 = await DEC(`?periode=${P['09'].id}`, consult.tok);
    r4 = await PROP(complet.tok);
    const liq2 = r4.body?.ecriture;
    check('supprimée : l\'écriture disparaît de la déclaration ; septembre clos : proposée au 01/10 avec la vraie date du 30/09',
      r.body?.declaration?.ecriture === null && r.body?.liquidation?.possible === true && r2.status === 200 && r3.body?.liquidation?.date === '2026-10-01' && r3.body?.liquidation?.dateReelle === '2026-09-30' && !r3.body?.signalements?.some((s) => s.code === 'PERIODE_OUVERTE')
      && r4.status === 201 && liq2?.date === '2026-10-01' && liq2?.dateReelle === '2026-09-30', `${JSON.stringify(r.body?.declaration?.ecriture)} ${r2.status} ${r3.body?.liquidation?.date} ${r4.status} ${JSON.stringify(liq2)} ${r4.body?.message || ''}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures/${liq2.id}/valider`, cabinet.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/livres/balance`, consult.tok);
    const solde = (n) => (r2.body?.comptes || r2.body?.lignes || []).find((c) => c.numero === n);
    r3 = await appel('GET', `/api/compta/dossiers/${A.id}/taxes-mois?periode=${P['10'].id}`, consult.tok);
    check('validée : la balance reste cohérente ; octobre (Taxes du mois) sans « TVA sans code » pour la liquidation', r.status === 200 && r2.status === 200 && r2.body?.controles?.coherent === true && r3.status === 200 && !(r3.body?.signalements || []).some((s) => s.code === 'TVA_SANS_CODE'), `${r.status} ${r2.status} ${JSON.stringify(solde('43651'))} ${JSON.stringify((r3.body?.signalements || []).map((s) => s.code))}`);

    // Relecture : une liquidation validée puis contre-passée se repropose ; ni elle ni sa contre-passation ne sont « TVA sans code ».
    r = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures/${liq2.id}/contrepasser`, cabinet.tok, { date: '2026-10-02' });
    r2 = await DEC(`?periode=${P['09'].id}`, consult.tok);
    r3 = await PROP(complet.tok);
    const liq3 = r3.body?.ecriture;
    r4 = await appel('GET', `/api/compta/dossiers/${A.id}/taxes-mois?periode=${P['10'].id}`, consult.tok);
    check('liquidation validée puis contre-passée : signalée, une nouvelle se propose (01/10, vraie date 30/09) ; octobre sans « TVA sans code »',
      r.status === 201 && r2.body?.liquidation?.possible === true && r2.body?.signalements?.some((s) => s.code === 'LIQUIDATION_CONTREPASSEE') && r3.status === 201 && liq3?.date === '2026-10-01' && liq3?.dateReelle === '2026-09-30' && liq3?.id !== liq2.id
      && r4.status === 200 && !(r4.body?.signalements || []).some((s) => s.code === 'TVA_SANS_CODE'), `${r.status} ${r.body?.message || ''} ${r2.body?.liquidation?.raison} ${r3.status} ${r3.body?.message || ''} ${JSON.stringify((r4.body?.signalements || []).map((s) => s.code))}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures/${liq3.id}/valider`, cabinet.tok);
    r2 = await DEC(`?periode=${P['09'].id}`, consult.tok);
    check('la nouvelle liquidation validée : la déclaration la montre, plus rien à proposer (DEJA)', r.status === 200 && r2.body?.declaration?.ecriture?.id === liq3.id && r2.body?.declaration?.ecriture?.etat === 'validee' && r2.body?.liquidation?.raison === 'DEJA', `${r.status} ${JSON.stringify(r2.body?.declaration?.ecriture)} ${r2.body?.liquidation?.raison}`);

    // ── Marquer comme déclarée ──
    const MARQ = (jeton, corps, periodeId = P['09'].id) => appel('POST', `/api/compta/dossiers/${A.id}/declaration/${periodeId}/marquer`, jeton, corps);
    r = await DEC(`?periode=${P['09'].id}`, consult.tok);
    const total = r.body?.total;
    const lendemain = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
    const depot = jour > '2026-10-01' ? '2026-10-01' : jour;
    r = await MARQ(saisie.tok, { date: depot, attendu: total });
    r2 = await MARQ(complet.tok, { date: lendemain(jour), attendu: total });
    r3 = await MARQ(complet.tok, { date: '2026-09-30', attendu: total });
    r4 = await MARQ(complet.tok, { date: depot, attendu: '1.000' });
    check('marquer : Saisie 403 ; date future 400 ; date avant la fin du mois 400 ; total périmé 409 PERIME', r.status === 403 && r2.status === 400 && r2.body?.code === 'DATE_DEPOT' && r3.status === 400 && r4.status === 409 && r4.body?.code === 'PERIME', `${r.status} ${r2.status} ${r3.status} ${r4.status} ${r4.body?.code}`);
    r = await MARQ(complet.tok, { date: depot, attendu: total });
    ev = await journal(espaceId, 'declaration_marquee');
    r2 = await DEC(`?periode=${P['09'].id}`, consult.tok);
    r3 = await PREP(complet.tok, { saisies: { tfp: '1' } });
    r4 = await MARQ(complet.tok, { date: depot, attendu: total });
    check('Complet marque (total figé) ; la page et l\'historique le montrent ; préparer → 409 DECLAREE ; marquer encore → 409 DEJA_DECLAREE ; journal',
      r.status === 200 && r.body?.marque?.total === total && r2.body?.declaration?.marque?.date === depot && r2.body?.declaration?.marque?.total === total && r2.body?.ecart === false && r2.body?.historique?.find((h) => h.periodeId === P['09'].id)?.marque?.total === total
      && r3.status === 409 && r3.body?.code === 'DECLAREE' && r4.status === 409 && r4.body?.code === 'DEJA_DECLAREE' && ev?.details?.total === total && ev?.details?.lignes?.length >= 7, `${r.status} ${JSON.stringify(r2.body?.declaration?.marque)} ${r3.status} ${r4.status}`);
    // Un écart : septembre rouvert, une vente ajoutée et validée — la page le signale.
    await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${P['09'].id}/rouvrir`, cabinet.tok);
    E.v0929 = await ecrire(J.VT.id, '2026-09-29', 'FV-0929', 'Vente oubliée', [L('4111', { tiers: C1, d: '119' }), L('707', { c: '100', taxe: 'TVA19' }), L('436711', { c: '19', taxe: 'TVA19' })]);
    await appel('POST', `/api/compta/dossiers/${A.id}/ecritures/${E.v0929.id}/valider`, cabinet.tok);
    r = await DEC(`?periode=${P['09'].id}`, consult.tok);
    check('écriture ajoutée après la déclaration : écart signalé (déclaré ≠ recalculé), la marque reste', r.body?.ecart === true && r.body?.signalements?.some((s) => s.code === 'ECART_DECLARATION') && r.body?.declaration?.marque?.total === total && r.body?.total !== total, `${r.body?.ecart} ${r.body?.total} ${total}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/declaration/${P['09'].id}/demarquer`, saisie.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/declaration/${P['09'].id}/demarquer`, complet.tok);
    ev = await journal(espaceId, 'declaration_demarquee');
    r3 = await appel('POST', `/api/compta/dossiers/${A.id}/declaration/${P['09'].id}/demarquer`, complet.tok);
    r4 = await DEC(`?periode=${P['09'].id}`, consult.tok);
    check('retirer la marque : Saisie 403 ; Complet 200 (état figé au journal) ; une seconde fois 409 NON_DECLAREE ; la déclaration redevient modifiable',
      r.status === 403 && r2.status === 200 && ev?.details?.total === total && r3.status === 409 && r3.body?.code === 'NON_DECLAREE' && r4.body?.declaration?.marque === null && r4.body?.ecart === false, `${r.status} ${r2.status} ${r3.status}`);

    // ── Export, PDF, fiche ──
    let f = await telecharger(`/api/compta/dossiers/${A.id}/declaration/export?periode=${P['09'].id}`, consult.tok);
    const f2 = await telecharger(`/api/compta/dossiers/${A.id}/declaration/pdf?periode=${P['09'].id}`, consult.tok);
    check('export Excel (Déclaration, TVA, Retenues) et PDF (Consultation)', f.status === 200 && /spreadsheetml/.test(f.type) && /declaration-Hotel-Essai-S7c-2026-09\.xlsx/.test(f.disposition) && (await feuilles(f.buffer)).join(',') === 'Déclaration,TVA,Retenues' && f2.status === 200 && f2.buffer.slice(0, 5).toString() === '%PDF-' && /declaration-Hotel-Essai-S7c-2026-09\.pdf/.test(f2.disposition), `${f.status} ${f.disposition} ${f2.status} ${f2.disposition}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, consult.tok);
    const dc = r.body?.fiscalite?.declaration;
    check('fiche du dossier, carte Taxes : la déclaration à faire (dernière période finie, échéance, non déclarée)', r.status === 200 && dc?.periode?.id === attendue?.id && !!dc?.echeance && dc?.declareeLe === null, JSON.stringify(dc));

    // ── Cloisonnement, archivé, lecture seule ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: { ...IDENTITE_A, raisonSociale: 'Dossier B S7c', matriculeFiscal: '' }, regime: { ...REEL, teledeclaration: false }, exercice: CIVIL });
    const B = r.body;
    r = await appel('PUT', `/api/compta/dossiers/${B.id}/declaration/${P['09'].id}`, cabinet.tok, { saisies: {} });
    r2 = await appel('GET', `/api/compta/dossiers/${B.id}/declaration?periode=${P['09'].id}`, cabinet.tok);
    const PB = (await appel('GET', `/api/compta/dossiers/${B.id}/periodes`, cabinet.tok)).body.exercice.periodes.find((p) => String(p.debut).slice(5, 7) === '09');
    r3 = await appel('GET', `/api/compta/dossiers/${B.id}/declaration?periode=${PB.id}`, cabinet.tok);
    check('cloisonnement : une période de A depuis B → 409 PERIODE_INTROUVABLE / 404 ; B (personne morale non télédéclarante) : échéance le 28/10, total nul', r.status === 409 && r.body?.code === 'PERIODE_INTROUVABLE' && r2.status === 404 && r3.status === 200 && r3.body?.echeance?.date === '2026-10-28' && r3.body?.total === '0.000', `${r.status} ${r2.status} ${r3.status} ${JSON.stringify(r3.body?.echeance)} ${r3.body?.total}`);
    await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    r = await PREP(cabinet.tok, { saisies: {} });
    r2 = await DEC(`?periode=${P['09'].id}`, cabinet.tok);
    check('dossier archivé : préparer → 409 DOSSIER_ARCHIVE ; la page se lit', r.status === 409 && r.body?.code === 'DOSSIER_ARCHIVE' && r2.status === 200, `${r.status} ${r2.status}`);
    await appel('POST', `/api/compta/dossiers/${A.id}/desarchiver`, cabinet.tok);
    await mode(cabinet.id, 'read_only');
    r = await MARQ(cabinet.tok, { date: depot });
    r2 = await DEC(`?periode=${P['09'].id}`, cabinet.tok);
    check('comptabilité en lecture seule : marquer → 403 READ_ONLY ; la page se lit', r.status === 403 && r.body?.code === 'READ_ONLY' && r2.status === 200, `${r.status} ${r.body?.code} ${r2.status}`);
    await mode(cabinet.id, 'actif');

    // ── Rejeu de la migration 220 ; manuel ──
    const nb = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.declarations WHERE dossier_id = $1', [A.id])).rows[0].n;
    await pool.query(`DELETE FROM _migrations WHERE filename = '220_compta_declarations.sql'`);
    await require('../src/config/migrate')();
    check('migration 220 rejouée sans erreur ; déclarations de A intactes', (await pool.query(`SELECT 1 FROM _migrations WHERE filename = '220_compta_declarations.sql'`)).rows.length === 1 && nb === 1 && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.declarations WHERE dossier_id = $1', [A.id])).rows[0].n === 1, `${nb}`);
    const manuel = (await pool.query(`SELECT slug, contenu_defaut, ecran, ordre FROM manuel_sections WHERE produit = 'compta'`)).rows;
    const texte = (slug) => manuel.find((m) => m.slug === slug)?.contenu_defaut || '';
    check('manuel : fiche « Déclaration mensuelle » (/declaration, 1075) ; « Fiche du dossier » et « Taxes du mois » retouchées',
      /## 🗓️ Déclaration mensuelle/.test(texte('compta-declaration')) && manuel.find((m) => m.slug === 'compta-declaration')?.ecran === '/declaration' && manuel.find((m) => m.slug === 'compta-declaration')?.ordre === 1075
      && /La ligne \*\*Déclaration mensuelle\*\*/.test(texte('compta-dossier')) && /proposée par la page \*\*Déclaration mensuelle\*\* ne l'est pas/.test(texte('compta-taxes-mois')), manuel.map((m) => m.slug).join(','));

    // ── Les pages d'avant ne changent pas ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/livres/balance`, saisie.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/taxes-mois?periode=${P['09'].id}`, saisie.tok);
    r3 = await appel('GET', `/api/compta/dossiers/${A.id}/echeancier?type=fournisseur`, saisie.tok);
    check('balance (cohérente), taxes du mois et échéancier inchangés', r.status === 200 && r.body?.controles?.coherent === true && r2.status === 200 && r3.status === 200, `${r.status} ${r2.status} ${r3.status}`);
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
