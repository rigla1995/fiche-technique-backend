/* Test E2E local — LabFlow Compta, étape S6c « Les livres et les imports » (labflow-reprise/achats-compta/PLAN-S6.md
 * §1 ligne S6c, §2 « S6c », §4 « Livres » et « Imports » ; réponse 7 du client du 08/10).
 *   la page des livres (droits, exercices et périodes, journaux, comptes et tiers mouvementés) ; l'import d'une balance
 *   d'ouverture (modèle ; Saisie refusée ; déséquilibre, compte inconnu, tiers manquant, montant illisible → rapport et
 *   rien d'écrit ; import réussi → une écriture d'à-nouveaux AN en brouillard ; second import refusé) ; l'import
 *   d'écritures (modèle ; trois écritures en brouillard, origine import, numéros provisoires qui se suivent ; fichier
 *   fautif → rapport rangée par rangée et rien d'écrit ; date hors exercice ; journal D16) ; la balance générale
 *   (ouverture = à-nouveaux, mouvements hors à-nouveaux, soldes, totaux, contrôles NC 01, brouillard compris ou non,
 *   période) et auxiliaire (fournisseurs, clients, égalité avec les collectifs) ; le grand livre d'un compte et d'un tiers
 *   (ouverture, solde après chaque ligne, pages et cumul, brouillard retiré) ; le livre-journal ; les trois exports Excel ;
 *   cloisonnement croisé ; période close à l'import ; dossier archivé ; lecture seule ; hooks ; rejeu de la migration
 *   217 ; manuel ; pages d'avant.
 * Crée un super_admin, un cabinet (2 gérants achetés) et deux collaborateurs temporaires ; règle les tarifs Compta le
 * temps de l'essai, puis restaure et nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const ExcelJS = require('exceljs');
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
const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const televerser = async (chemin, jeton, buffer) => {
  const form = new FormData();
  if (buffer) form.append('fichier', new Blob([buffer], { type: TYPE_XLSX }), 'essai-s6c.xlsx');
  const r = await fetch(`${BASE}${chemin}`, { method: 'POST', headers: { Authorization: `Bearer ${jeton}` }, body: form });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const telecharger = async (chemin, jeton) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  return { status: r.status, type: r.headers.get('content-type') || '', disposition: r.headers.get('content-disposition') || '', buffer: Buffer.from(await r.arrayBuffer()) };
};
// Un classeur à partir du modèle téléchargé (lignes sous la ligne d'exemple) ; un classeur brut (en-têtes en ligne 1).
const depuisModele = async (modele, lignes) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(modele);
  const ws = wb.worksheets[0];
  for (const l of lignes) ws.addRow(l);
  return Buffer.from(await wb.xlsx.writeBuffer());
};
const brut = async (enTetes, lignes) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Feuille');
  ws.addRow(enTetes);
  for (const l of lignes) ws.addRow(l);
  return Buffer.from(await wb.xlsx.writeBuffer());
};
// Les rangées d'un classeur exporté sous sa ligne d'en-têtes (première cellule donnée), en textes.
const rangeesExport = async (buffer, premiereEnTete) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  let enTete = 0;
  ws.eachRow((row, n) => { if (!enTete && String(row.getCell(1).text || '').trim() === premiereEnTete) enTete = n; });
  const rangees = [];
  let fin = false;
  ws.eachRow((row, n) => {
    if (n <= enTete || fin) return;
    const valeurs = row.values.slice(1).map((v) => (v == null ? '' : typeof v === 'object' && 'result' in v ? v.result : v));
    if (/^Généré par LabFlow/.test(String(valeurs[0] || ''))) { fin = true; return; }
    if (valeurs.some((c) => c !== '' && c !== null)) rangees.push(valeurs);
  });
  return { enTete, rangees };
};
const login = async (email) => appel('POST', '/auth/login', null, { email, password: MDP });
const CLES = ['compta_cabinet_mensuel', 'compta_gerant_cabinet_mensuel', 'compta_mise_en_route', 'compta_module_mensuel', 'compta_gerant_client_mensuel'];
const EN_TETES_ECRITURES = ['Écriture', 'Journal', 'Date', 'Pièce', 'Libellé', 'Compte', 'Tiers', 'Libellé de la ligne', 'Débit', 'Crédit', 'Code de taxe', 'Échéance'];
const EN_TETES_BALANCE = ['Compte', 'Tiers', 'Libellé', 'Débit', 'Crédit'];

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s6c@example.com';
  const CABINET = 'test-cabinet-compta-s6c@example.com';
  const SAISIE = 'test-saisie-compta-s6c@example.com';
  const COMPLET = 'test-complet-compta-s6c@example.com';
  const TOUS = [ADMIN, CABINET, SAISIE, COMPLET];
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
  const IDENTITE_A = { raisonSociale: 'Hôtel Essai S6c', formeJuridique: 'SARL', matriculeFiscal: '1234567A/A/M/000', adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' };
  const REEL = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const CIVIL = { debut: '2026-01-01', fin: '2026-12-31' };
  const compte = (plan, numero) => plan?.comptes?.find((c) => c.numero === numero);
  const rangee = (b, numero) => b?.rangees?.find((r) => r.compte?.numero === numero);
  const rangeeTiers = (b, code) => b?.rangees?.find((r) => r.tiers?.code === code);

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S6c', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    const adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (2 gérants achetés) avec deux collaborateurs ──
    let r2 = null;
    let r3 = null;
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S6c', email: CABINET, telephone: '20 555 099', raisonSociale: 'Cabinet Essai S6c', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S6c', representantQualite: 'Gérant', nbGerants: 2,
    });
    check('création du cabinet (2 gérants achetés)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const cabinet = await activer(CABINET);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    check('connexion du titulaire', !!cabinet.tok && !!espaceId);
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaboratrice Saisie', email: SAISIE, niveau: 'saisie', dossiers: 'tous' });
    r2 = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Complet', email: COMPLET, niveau: 'complet', dossiers: 'tous' });
    const saisie = await activer(SAISIE);
    const complet = await activer(COMPLET);
    check('collaborateurs Saisie et Complet créés et connectés', r.status === 201 && r2.status === 201 && !!saisie.tok && !!complet.tok, `${r.status} ${r2.status}`);

    // ── Dossier A (réel) : plan, journaux, taxes, tiers ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REEL, exercice: CIVIL });
    const A = r.body;
    check('dossier A créé (exercice 2026)', r.status === 201 && A?.exercice?.periodes?.length === 12, `${r.status}`);
    const planA = (await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok)).body;
    const K = Object.fromEntries(['10131', '607', '43666', '436711', '4011', '4111', '5321', '707', '622', '5411', '532'].map((n) => [n, compte(planA, n)]));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    const J = Object.fromEntries(['AC', 'VT', 'BQ', 'OD', 'AN'].map((c) => [c, r.body?.journaux?.find((j) => j.code === c)]));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Société Tunisienne de Boissons', delaiPaiement: 30 });
    const F1 = r.body?.tiers;
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'client', nom: 'Voyages Méditerranée', delaiPaiement: 45 });
    const C1 = r2.body?.tiers;
    check('plan, journaux et tiers de A', Object.values(K).every(Boolean) && Object.values(J).every(Boolean) && F1?.code === 'F0001' && C1?.code === 'C0001');
    const L = (chemin, jeton) => appel('GET', `/api/compta/dossiers/${A.id}/livres${chemin}`, jeton);
    const E = (chemin, jeton) => appel('GET', `/api/compta/dossiers/${A.id}/ecritures${chemin}`, jeton);

    // ── La page des livres, vide ──
    r = await L('', cabinet.tok);
    const X = r.body?.exercices?.[0];
    check('page des livres (titulaire) : droits, un exercice ouvert avec 12 périodes, exercice par défaut, 6 journaux, aucun compte ni tiers mouvementé, bornes',
      r.status === 200 && r.body?.droits?.configurer === true && r.body?.exercices?.length === 1 && X?.etat === 'ouvert' && X?.periodes?.length === 12 && r.body?.exerciceParDefaut === X?.id && r.body?.journaux?.length === 6 && r.body?.comptes?.length === 0 && r.body?.tiers?.length === 0
      && r.body?.bornes?.grandLivre === 100 && r.body?.bornes?.journal === 50 && r.body?.bornes?.exportMax === 10000 && r.body?.etatAbonnement === 'actif', `${r.status} ${JSON.stringify(r.body?.bornes)} ${r.body?.message || ''}`);
    r = await L('', saisie.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/livres`, adminTok);
    r3 = await L('/balance', saisie.tok);
    check('Saisie lit la page et la balance (vide) ; un étranger : 404', r.status === 200 && r.body?.droits?.configurer === false && r2.status === 404 && r3.status === 200 && r3.body?.rangees?.length === 0 && r3.body?.controles?.coherent === true && r3.body?.totaux?.lignes?.debit === '0.000', `${r.status} ${r2.status} ${r3.status} ${JSON.stringify(r3.body?.totaux)}`);
    const P = Object.fromEntries(X.periodes.map((p) => [p.debut.slice(5, 7), p]));

    // ── Import d'une balance d'ouverture ──
    let m = await telecharger(`/api/compta/dossiers/${A.id}/ecritures/modele-balance-ouverture`, saisie.tok);
    check('modèle de la balance d\'ouverture : xlsx nommé, en-têtes et rangée d\'exemple (Saisie le télécharge)', m.status === 200 && /spreadsheetml/.test(m.type) && /modele-balance-ouverture-\d+\.xlsx/.test(m.disposition) && (await rangeesExport(m.buffer, 'Compte')).rangees?.[0]?.[0] === 'Exemple : 4011', `${m.status} ${m.type} ${m.disposition}`);
    const modeleBalance = m.buffer;
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import-balance-ouverture`, saisie.tok, await depuisModele(modeleBalance, [['5321', '', '', '10', '']]));
    r2 = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import-balance-ouverture`, cabinet.tok, null);
    check('import de la balance : Saisie refusée (403 NIVEAU_INSUFFISANT) ; sans fichier : 400 FICHIER_REQUIS', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT' && r2.status === 400 && r2.body?.code === 'FICHIER_REQUIS', `${r.status} ${r.body?.code} ${r2.status} ${r2.body?.code}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import-balance-ouverture`, cabinet.tok, await depuisModele(modeleBalance, [['5321', '', 'Banque', '5000', ''], ['5321', '', 'Banque encore', '5000', ''], ['10131', '', 'Capital', '', '10000']]));
    check('balance avec deux rangées sur le même compte : rapport « déjà présent à la rangée 8 », rien d\'écrit', r.status === 400 && r.body?.code === 'IMPORT_ERREURS' && /Compte 5321 déjà présent à la rangée 8/.test(r.body?.lignes?.[0]?.erreurs?.[0] || '') && r.body?.lignes?.[0]?.ligne === 9, `${r.status} ${JSON.stringify(r.body?.lignes)}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import-balance-ouverture`, cabinet.tok, await depuisModele(modeleBalance, [['5321', '', 'Banque', '10000', ''], ['10131', '', 'Capital', '', '9000']]));
    check('balance déséquilibrée : 400 IMPORT_ERREURS, repère « Total de la balance », écart dit, rien d\'écrit', r.status === 400 && r.body?.code === 'IMPORT_ERREURS' && r.body?.lignes?.[0]?.repere === 'Total de la balance' && /déséquilibrée : débits 10 000,000 ≠ crédits 9 000,000 \(écart 1 000,000\)/.test(r.body?.lignes?.[0]?.erreurs?.[0] || '') && r.body?.nbLignes === 2
      && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.ecritures WHERE dossier_id = $1', [A.id])).rows[0].n === 0, `${r.status} ${JSON.stringify(r.body?.lignes)}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import-balance-ouverture`, cabinet.tok, await depuisModele(modeleBalance, [['999', '', '', '10', ''], ['4011', '', 'Sans tiers', '', '5'], ['5321', '', '', 'abc', ''], ['532', '', 'Pas une feuille', '', '5'], ['10131', '', '', '', '0']]));
    const lignesF = r.body?.lignes || [];
    check('rangées fautives (compte inconnu, tiers manquant sur 4011, montant illisible, compte non imputable, sans montant) : rapport par rangée Excel, rien d\'écrit',
      r.status === 400 && r.body?.code === 'IMPORT_ERREURS' && lignesF.length === 5 && lignesF.map((l) => l.ligne).join(',') === '8,9,10,11,12'
      && /999 n'est pas dans le plan/.test(lignesF[0]?.erreurs?.[0]) && /^Indiquez le fournisseur \(le compte 4011 est un compte collectif\)/.test(lignesF[1]?.erreurs?.[0]) && /^Débit : montant en dinars/.test(lignesF[2]?.erreurs?.[0]) && /^Le compte 532 a des sous-comptes actifs/.test(lignesF[3]?.erreurs?.[0]) && /^Indiquez le débit ou le crédit/.test(lignesF[4]?.erreurs?.[0])
      && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.ecritures WHERE dossier_id = $1', [A.id])).rows[0].n === 0, `${r.status} ${JSON.stringify(lignesF)}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import-balance-ouverture`, complet.tok, await depuisModele(modeleBalance, [
      ['5321', '', 'Banque BIAT', '10000', ''], ['4011', 'F0001', 'Dû à STB', '', '1173,150'], ['4111', 'c0001', 'Dû par Voyages Méditerranée', '1190', ''], ['10131', '', 'Capital', '', '10016,850'],
    ]));
    const an = r.body?.ecriture;
    check('Complet importe la balance : 201, une écriture d\'à-nouveaux AN du 01/01/2026, pièce AN-2026, en brouillard, origine import, B-000001, 4 lignes, total 11 190,000, tiers résolus',
      r.status === 201 && an?.journal?.code === 'AN' && an?.date === '2026-01-01' && an?.reference === 'AN-2026' && /À-nouveaux au 01\/01\/2026/.test(an?.libelle || '') && an?.etat === 'brouillard' && an?.origine === 'import' && an?.numeroProvisoire === 'B-000001' && an?.lignes?.length === 4 && an?.total === '11190.000'
      && an?.lignes?.[1]?.tiers?.code === 'F0001' && an?.lignes?.[1]?.credit === '1173.150' && an?.lignes?.[2]?.tiers?.code === 'C0001' && an?.lignes?.[1]?.libelle === 'Dû à STB' && r.body?.lignes === 4 && r.body?.nb?.brouillard === 1, `${r.status} ${JSON.stringify(r.body?.message || r.body?.lignes)}`);
    let ev = await journal(espaceId, 'balance_importee');
    check('journal D16 balance_importee (écriture, journal, lignes, total, fichier, contenu)', ev?.details?.ecriture === an?.id && ev?.details?.journal === 'AN' && ev?.details?.lignes === 4 && ev?.details?.total === '11190.000' && ev?.details?.fichier === 'essai-s6c.xlsx' && ev?.details?.contenu?.lignes?.length === 4 && ev?.auteur_id === complet.id, JSON.stringify(ev?.details));
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import-balance-ouverture`, cabinet.tok, await depuisModele(modeleBalance, [['5321', '', '', '1', ''], ['10131', '', '', '', '1']]));
    check('second import de balance : 409 AN_EXISTANT (en brouillard : supprimez-la ou corrigez-la)', r.status === 409 && r.body?.code === 'AN_EXISTANT' && /1 écriture dans le journal AN : supprimez-la ou corrigez-la \(en brouillard\)/.test(r.body?.message || ''), `${r.status} ${r.body?.code} ${r.body?.message || ''}`);

    // ── Import d'écritures ──
    m = await telecharger(`/api/compta/dossiers/${A.id}/ecritures/modele-import`, cabinet.tok);
    check('modèle des écritures : xlsx nommé, 12 en-têtes, rangée d\'exemple', m.status === 200 && /modele-ecritures-\d+\.xlsx/.test(m.disposition) && (await rangeesExport(m.buffer, 'Écriture')).rangees?.[0]?.[0] === 'Exemple : 1', `${m.status} ${m.disposition}`);
    const modeleEcritures = m.buffer;
    const FICHIER_OK = [
      ['1', 'AC', '05/03/2026', 'F-0305', 'Facture STB', '607', '', 'Boissons', '1000', '', 'TVA19', ''],
      ['', '', '', '', '', '43666', '', '', '190', '', 'TVA19', ''],
      ['1', '', '', '', '', '4011', 'F0001', '', '', '1190', '', '30/04/2026'],
      ['2', 'VT', '2026-03-10', 'FV-0310', 'Séjour Voyages Méditerranée', '4111', 'C0001', '', '1190', '', '', ''],
      ['2', '', '', '', '', '707', '', '', '', '1000', 'TVA19', ''],
      ['2', '', '', '', '', '436711', '', '', '', '190', 'TVA19', ''],
      ['3', 'bq', '20/03/2026', 'RLV-03', 'Règlement STB', '4011', 'f0001', '', '1190', '', '', ''],
      ['3', '', '', '', '', '5321', '', '', '', '1190', '', ''],
    ];
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import`, saisie.tok, await depuisModele(modeleEcritures, FICHIER_OK));
    check('import d\'écritures : Saisie refusée (403)', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', `${r.status}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import`, cabinet.tok, await depuisModele(modeleEcritures, [
      ['1', 'AC', '05/03/2026', 'F-X', 'Déséquilibrée', '607', '', '', '100', '', '', ''],
      ['1', '', '', '', '', '4011', 'F0001', '', '', '90', '', ''],
      ['2', 'ZZ', '05/03/2026', 'F-Y', 'Journal inconnu', '607', '', '', '10', '', 'TVAXX', ''],
      ['2', '', '', '', '', '5321', '', '', '', '10', '', ''],
      ['3', 'AC', '31/12/2025', 'F-Z', 'Hors exercice', '607', '', '', '10', '', '', ''],
      ['3', '', '', '', '', '5321', '', '', '', '10', '', ''],
      ['4', 'AC', '06/03/2026', 'F-W', 'Tiers interdit, compte désactivable', '607', 'F0001', '', '10', '', '', ''],
      ['4', '', '', '', '', '532', '', '', '', '10', '', ''],
      ['5', 'VT', '07/03/2026', 'F-V', 'Échéance avant la date', '4111', 'C0001', '', '10', '', '', '01/03/2026'],
      ['5', '', '', '', '', '707', '', '', '', '10', '', ''],
    ]));
    const rap = r.body?.lignes || [];
    const erreursDe = (ligne) => rap.find((l) => l.ligne === ligne)?.erreurs || [];
    check('fichier fautif : 400 IMPORT_ERREURS, une entrée par rangée fautive (déséquilibre, journal et code inconnus, hors exercice, tiers interdit, compte non imputable, échéance), rien d\'écrit',
      r.status === 400 && r.body?.code === 'IMPORT_ERREURS' && rap.map((l) => l.ligne).join(',') === '8,10,12,14,15,16' && /déséquilibrée/.test(erreursDe(8)[0]) && /ZZ n'est pas un journal/.test(erreursDe(10)[0]) && /TVAXX n'est pas un code/.test(erreursDe(10)[1])
      && /hors de l'exercice ouvert/.test(erreursDe(12)[0]) && /^Un tiers ne se porte que sur un compte collectif/.test(erreursDe(14)[0]) && /^Le compte 532 a des sous-comptes actifs/.test(erreursDe(15)[0]) && /^L'échéance \(01\/03\/2026\) précède la date/.test(erreursDe(16)[0])
      && r.body?.nbErreurs === 6 && r.body?.nbLignes === 10 && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.ecritures WHERE dossier_id = $1', [A.id])).rows[0].n === 1, `${r.status} ${JSON.stringify(rap)}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import`, cabinet.tok, await depuisModele(modeleEcritures, [
      ['1', 'AN', '15/03/2026', 'AN-X', 'À-nouveaux mal datés', '5321', '', '', '10', '', '', ''], ['1', '', '', '', '', '10131', '', '', '', '10', '', ''],
      ['2', 'OD', '05/03/2026', 'OD-DBL', 'Deux fois', '622', '', '', '1', '', '', ''], ['2', '', '', '', '', '5411', '', '', '', '1', '', ''],
      ['3', 'OD', '05/03/2026', 'OD-DBL', 'Deux fois', '622', '', '', '2', '', '', ''], ['3', '', '', '', '', '5411', '', '', '', '2', '', ''],
    ]));
    check('à-nouveaux daté ailleurs qu\'au premier jour (409 AN_DATE rapporté) et doublon dans le fichier (même journal, date, pièce) : rapport, rien d\'écrit', r.status === 400 && /ne reçoit que des écritures datées du premier jour de l'exercice/.test(r.body?.lignes?.find((l) => l.ligne === 8)?.erreurs?.[0] || '') && /Écriture en double dans le fichier/.test(r.body?.lignes?.find((l) => l.ligne === 12)?.erreurs?.[0] || '') && r.body?.nbErreurs === 2, `${r.status} ${JSON.stringify(r.body?.lignes)}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures`, cabinet.tok, { journalId: J.AN.id, date: '2026-03-05', reference: 'AN-S', libelle: 'À-nouveaux saisis en mars', lignes: [{ compteId: K['5321'].id, debit: '10' }, { compteId: K['10131'].id, credit: '10' }] });
    check('saisie dans le journal AN à une autre date que le premier jour : 409 AN_DATE', r.status === 409 && r.body?.code === 'AN_DATE', `${r.status} ${r.body?.code}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import`, cabinet.tok, await brut(['Compte', 'Débit'], [['607', '1']]));
    r2 = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import`, cabinet.tok, await depuisModele(modeleEcritures, [['1', 'AC', '05/03/2026', 'F-L', 'Trop de lignes', '607', '', '', '1', '', '', ''], ...Array.from({ length: 200 }, () => ['', '', '', '', '', '5321', '', '', '', '0.005', '', ''])]));
    check('en-têtes absents : 400 EN_TETES ; une écriture de 201 lignes : refusée (200 au plus), rien d\'écrit', r.status === 400 && r.body?.code === 'EN_TETES' && r2.status === 400 && r2.body?.code === 'IMPORT_ERREURS' && /200 lignes au plus/.test(r2.body?.lignes?.[0]?.erreurs?.[0] || ''), `${r.status} ${r.body?.code} ${r2.status} ${JSON.stringify(r2.body?.lignes?.[0])}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import`, cabinet.tok, await depuisModele(modeleEcritures, FICHIER_OK));
    const r12 = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import`, cabinet.tok, await depuisModele(modeleEcritures, FICHIER_OK));
    check('le même fichier renvoyé : 400, chaque écriture « déjà enregistrée dans ce journal » (écriture B-…), rien d\'écrit', r12.status === 400 && r12.body?.nbErreurs === 3 && /Pièce F-0305 déjà enregistrée dans ce journal le 05\/03\/2026 \(écriture B-000002\)/.test(r12.body?.lignes?.[0]?.erreurs?.[0] || ''), `${r12.status} ${JSON.stringify(r12.body?.lignes)}`);
    check('import de trois écritures (achat, vente, banque ; code de journal et de tiers en minuscules acceptés) : 201, B-000002 à B-000004, par journal, 4 en brouillard',
      r.status === 201 && r.body?.importees === 3 && r.body?.lignes === 8 && r.body?.premiere === 'B-000002' && r.body?.derniere === 'B-000004' && JSON.stringify(r.body?.journaux) === '{"AC":1,"VT":1,"BQ":1}' && r.body?.nb?.brouillard === 4 && r.body?.nb?.validees === 0, `${r.status} ${JSON.stringify(r.body?.message || r.body)}`);
    r = await E('?journal=' + J.AC.id, cabinet.tok);
    const achat = r.body?.ecritures?.[0];
    r2 = await E(`/${achat?.id}`, saisie.tok);
    const achatL = r2.body?.ecriture;
    check('l\'achat importé : origine import, AC du 05/03, pièce F-0305, 3 lignes (607 D 1 000,000 TVA19, libellé « Boissons » ; 4011 F0001 C 1 190,000 échéance 30/04/2026), total 1 190,000',
      achat?.origine === 'import' && achat?.date === '2026-03-05' && achat?.reference === 'F-0305' && achatL?.lignes?.length === 3 && achatL?.lignes?.[0]?.compte?.numero === '607' && achatL?.lignes?.[0]?.debit === '1000.000' && achatL?.lignes?.[0]?.taxe?.code === 'TVA19' && achatL?.lignes?.[0]?.libelle === 'Boissons'
      && achatL?.lignes?.[2]?.tiers?.code === 'F0001' && achatL?.lignes?.[2]?.credit === '1190.000' && achatL?.lignes?.[2]?.echeance === '2026-04-30' && achatL?.total === '1190.000', JSON.stringify(achatL?.lignes?.map((l) => [l.compte.numero, l.debit, l.credit, l.echeance])));
    ev = await journal(espaceId, 'ecritures_importees');
    const ev2 = await journal(espaceId, 'ecriture_creee');
    check('journal D16 ecritures_importees (nombre, rangées, journaux, premier et dernier provisoire, fichier) et ecriture_creee pour chaque écriture (fichier d\'import)', ev?.details?.nombre === 3 && ev?.details?.lignes === 8 && ev?.details?.journaux?.BQ === 1 && ev?.details?.premiere === 'B-000002' && ev?.details?.derniere === 'B-000004' && ev?.details?.fichier === 'essai-s6c.xlsx' && ev2?.details?.import === 'essai-s6c.xlsx' && ev2?.details?.numeroProvisoire === 'B-000004', JSON.stringify(ev?.details));
    const vente = (await E('?journal=' + J.VT.id, cabinet.tok)).body?.ecritures?.[0];
    const banque = (await E('?journal=' + J.BQ.id, cabinet.tok)).body?.ecritures?.[0];
    // L'achat et les à-nouveaux validés ; la vente et la banque restent en brouillard (le brouillard distingué dans les livres).
    r = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures/${achat?.id}/valider`, cabinet.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures/${an?.id}/valider`, cabinet.tok);
    check('validation de l\'achat (AC-2026-000001) et des à-nouveaux (AN-2026-000001) ; vente et banque en brouillard', r.status === 200 && r.body?.ecriture?.numero === 'AC-2026-000001' && r2.status === 200 && r2.body?.ecriture?.numero === 'AN-2026-000001' && r2.body?.nb?.brouillard === 2, `${r.status} ${r2.status} ${r2.body?.ecriture?.numero}`);

    // ── Balance générale ──
    r = await L('/balance', saisie.tok);
    const b = r.body;
    check('balance générale de l\'exercice, brouillard compris : 8 comptes, ouverture = à-nouveaux (10131 C 10 016,850 ; 5321 D 10 000 ; 4011 C 1 173,150 ; 4111 D 1 190), mouvements hors à-nouveaux, soldes',
      r.status === 200 && b?.type === 'generale' && b?.rangees?.length === 8 && b?.selection?.periode === null && b?.selection?.de === '2026-01-01'
      && rangee(b, '10131')?.ouverture?.credit === '10016.850' && rangee(b, '10131')?.mouvements?.debit === '0.000' && rangee(b, '10131')?.soldeCredit === '10016.850'
      && rangee(b, '5321')?.ouverture?.debit === '10000.000' && rangee(b, '5321')?.mouvements?.credit === '1190.000' && rangee(b, '5321')?.soldeDebit === '8810.000' && rangee(b, '5321')?.nbBrouillard === 1
      && rangee(b, '4011')?.ouverture?.soldeCredit === '1173.150' && rangee(b, '4011')?.mouvements?.debit === '1190.000' && rangee(b, '4011')?.mouvements?.credit === '1190.000' && rangee(b, '4011')?.solde === '-1173.150' && rangee(b, '4011')?.mouvements?.nbLignes === 2
      && rangee(b, '4111')?.ouverture?.debit === '1190.000' && rangee(b, '4111')?.soldeDebit === '2380.000' && rangee(b, '607')?.soldeDebit === '1000.000' && rangee(b, '707')?.soldeCredit === '1000.000', `${r.status} ${JSON.stringify(b?.rangees?.map((x) => [x.compte.numero, x.ouverture.solde, x.mouvements.debit, x.mouvements.credit, x.solde]))}`);
    check('… totaux : ouverture 11 190 des deux côtés, mouvements 3 570 des deux côtés (8 lignes), soldes débit = crédit 12 380, 5 lignes en brouillard ; contrôles NC 01 cohérents (journaux = lignes = écritures 14 760,000)',
      b?.totaux?.ouverture?.debit === '11190.000' && b?.totaux?.ouverture?.credit === '11190.000' && b?.totaux?.mouvements?.debit === '3570.000' && b?.totaux?.mouvements?.credit === '3570.000' && b?.totaux?.soldeDebit === b?.totaux?.soldeCredit && b?.totaux?.soldeDebit === '12380.000' && b?.totaux?.mouvements?.nbLignes === 8 && b?.totaux?.nbBrouillard === 5
      && b?.controles?.coherent === true && b?.controles?.totalJournaux?.debit === '14760.000' && b?.controles?.totalLignes?.credit === '14760.000' && b?.controles?.totalEcritures?.total === '14760.000' && b?.controles?.totalEcritures?.nb === 4 && b?.controles?.totalEcritures?.nbBrouillard === 2
      && b?.controles?.journaux?.find((j) => j.code === 'AN')?.debit === '11190.000' && b?.controles?.journaux?.find((j) => j.code === 'VT')?.nbEcritures === 1, JSON.stringify(b?.totaux) + ' ' + JSON.stringify(b?.controles?.totalJournaux));
    r = await L('/balance?brouillard=0', cabinet.tok);
    check('validées seulement : 6 comptes (plus de 707 ni 436711), 4011 mouvements C 1 190 seulement (le règlement est en brouillard), 0 en brouillard, cohérent', r.status === 200 && r.body?.rangees?.length === 6 && !rangee(r.body, '707') && rangee(r.body, '4011')?.mouvements?.debit === '0.000' && rangee(r.body, '4011')?.mouvements?.credit === '1190.000' && rangee(r.body, '4011')?.solde === '-2363.150' && r.body?.totaux?.nbBrouillard === 0 && r.body?.controles?.coherent === true && r.body?.selection?.brouillard === false, `${r.status} ${r.body?.rangees?.length}`);
    r = await L(`/balance?periode=${P['03'].id}`, cabinet.tok);
    r2 = await L(`/balance?periode=${P['04'].id}`, cabinet.tok);
    check('période de mars : ouverture = à-nouveaux, mouvements de mars ; période d\'avril : ouverture = à-nouveaux + mars, aucun mouvement, soldes reportés',
      r.status === 200 && r.body?.selection?.periode?.id === P['03'].id && rangee(r.body, '4011')?.ouverture?.credit === '1173.150' && rangee(r.body, '4011')?.mouvements?.nbLignes === 2
      && r2.status === 200 && rangee(r2.body, '4011')?.ouverture?.debit === '1190.000' && rangee(r2.body, '4011')?.ouverture?.credit === '2363.150' && rangee(r2.body, '4011')?.mouvements?.nbLignes === 0 && rangee(r2.body, '4011')?.solde === '-1173.150' && r2.body?.totaux?.mouvements?.debit === '0.000' && rangee(r2.body, '607')?.ouverture?.debit === '1000.000', `${r.status} ${r2.status} ${JSON.stringify(rangee(r2.body, '4011'))}`);
    r = await L('/balance?type=fournisseurs', saisie.tok);
    r2 = await L('/balance?type=clients', cabinet.tok);
    r3 = await L('/balance?type=tiers', cabinet.tok);
    check('balance auxiliaire : fournisseurs (F0001 : ouverture C 1 173,150, mouvements 1 190 / 1 190, solde C 1 173,150 ; = collectif 4011) ; clients (C0001 : D 2 380) ; type inconnu 400',
      r.status === 200 && r.body?.type === 'fournisseurs' && r.body?.rangees?.length === 1 && rangeeTiers(r.body, 'F0001')?.ouverture?.credit === '1173.150' && rangeeTiers(r.body, 'F0001')?.mouvements?.debit === '1190.000' && rangeeTiers(r.body, 'F0001')?.soldeCredit === '1173.150' && r.body?.controles?.coherent === true && r.body?.controles?.collectifs?.solde === '-1173.150' && r.body?.controles?.nature === 'fournisseurs'
      && r2.status === 200 && rangeeTiers(r2.body, 'C0001')?.soldeDebit === '2380.000' && r2.body?.controles?.coherent === true && r3.status === 400, `${r.status} ${r2.status} ${r3.status} ${JSON.stringify(r.body?.controles)}`);
    r = await L('/balance?exercice=999999', cabinet.tok);
    r2 = await L(`/balance?periode=999999`, cabinet.tok);
    check('exercice ou période inconnus : 404', r.status === 404 && r2.status === 404, `${r.status} ${r2.status}`);

    // ── Grand livre ──
    r = await L(`/grand-livre?compte=${K['4011'].id}`, saisie.tok);
    const g = r.body;
    check('grand livre 4011 (Saisie lit) : ouverture C 1 173,150 ; deux lignes dans l\'ordre (achat 05/03 C 1 190 → solde C 2 363,150 ; règlement 20/03 D 1 190 → solde C 1 173,150, en brouillard) ; totaux et solde final',
      r.status === 200 && g?.compte?.numero === '4011' && g?.tiers === null && g?.ouverture?.soldeCredit === '1173.150' && g?.lignes?.length === 2 && g?.total === 2
      && g?.lignes?.[0]?.date === '2026-03-05' && g?.lignes?.[0]?.credit === '1190.000' && g?.lignes?.[0]?.soldeCredit === '2363.150' && g?.lignes?.[0]?.ecriture?.numero === 'AC-2026-000001' && g?.lignes?.[0]?.ecriture?.journal?.code === 'AC' && g?.lignes?.[0]?.tiers?.code === 'F0001' && g?.lignes?.[0]?.libelle === 'Facture STB'
      && g?.lignes?.[1]?.date === '2026-03-20' && g?.lignes?.[1]?.debit === '1190.000' && g?.lignes?.[1]?.soldeCredit === '1173.150' && g?.lignes?.[1]?.ecriture?.etat === 'brouillard' && g?.lignes?.[1]?.ecriture?.numeroProvisoire === 'B-000004'
      && g?.totaux?.debit === '1190.000' && g?.totaux?.credit === '1190.000' && g?.totaux?.nbLignes === 2 && g?.totaux?.nbBrouillard === 1 && g?.ouverture?.nbBrouillard === 0 && g?.totaux?.solde === '-1173.150', `${r.status} ${JSON.stringify(g?.lignes?.map((l) => [l.date, l.debit, l.credit, l.solde]))} ${r.body?.message || ''}`);
    r = await L(`/grand-livre?compte=${K['4011'].id}&limite=1&page=2`, cabinet.tok);
    r2 = await L(`/grand-livre?tiers=${F1.id}`, cabinet.tok);
    r3 = await L(`/grand-livre?tiers=${F1.id}&compte=${K['4011'].id}&brouillard=0`, cabinet.tok);
    check('pages : la page 2 (1 par page) porte le règlement avec le bon cumul (solde C 1 173,150) ; par tiers F0001 : les mêmes deux lignes ; tiers + compte, validées seulement : une ligne',
      r.status === 200 && r.body?.lignes?.length === 1 && r.body?.page === 2 && r.body?.lignes?.[0]?.date === '2026-03-20' && r.body?.lignes?.[0]?.soldeCredit === '1173.150' && r.body?.total === 2
      && r2.status === 200 && r2.body?.tiers?.code === 'F0001' && r2.body?.compte === null && r2.body?.lignes?.length === 2 && r2.body?.ouverture?.credit === '1173.150'
      && r3.status === 200 && r3.body?.lignes?.length === 1 && r3.body?.totaux?.nbBrouillard === 0 && r3.body?.totaux?.solde === '-2363.150', `${r.status} ${r2.status} ${r3.status} ${JSON.stringify(r.body?.lignes?.[0]?.solde)}`);
    r = await L(`/grand-livre?compte=${K['5321'].id}`, cabinet.tok);
    r2 = await L(`/grand-livre?compte=${K['5321'].id}&periode=${P['04'].id}`, cabinet.tok);
    check('grand livre 5321 : les à-nouveaux (D 10 000) dans l\'ouverture, jamais dans les lignes ; une ligne (banque C 1 190), solde D 8 810 ; en avril : ouverture D 8 810, aucune ligne',
      r.status === 200 && r.body?.ouverture?.debit === '10000.000' && r.body?.lignes?.length === 1 && r.body?.lignes?.[0]?.ecriture?.journal?.code === 'BQ' && r.body?.totaux?.soldeDebit === '8810.000'
      && r2.status === 200 && r2.body?.ouverture?.soldeDebit === '8810.000' && r2.body?.lignes?.length === 0 && r2.body?.totaux?.soldeDebit === '8810.000', `${r.status} ${r2.status} ${JSON.stringify(r.body?.ouverture)}`);
    r = await L('/grand-livre', cabinet.tok);
    r2 = await L('/grand-livre?compte=999999', cabinet.tok);
    r3 = await L('/grand-livre?tiers=999999', cabinet.tok);
    check('grand livre sans compte ni tiers : 400 CIBLE_REQUISE ; compte ou tiers inconnus : 404', r.status === 400 && r.body?.code === 'CIBLE_REQUISE' && r2.status === 404 && r3.status === 404, `${r.status} ${r2.status} ${r3.status}`);

    // ── Livre-journal ──
    r = await L(`/journal?journal=${J.AC.id}`, saisie.tok);
    r2 = await L(`/journal?journal=${J.VT.id}&brouillard=0`, cabinet.tok);
    r3 = await L(`/journal?journal=${J.BQ.id}&periode=${P['03'].id}`, cabinet.tok);
    check('livre-journal AC (Saisie lit) : une écriture avec ses 3 lignes, totaux 1 190 ; VT validées seulement : aucune ; BQ en mars : une, en brouillard',
      r.status === 200 && r.body?.journal?.code === 'AC' && r.body?.ecritures?.length === 1 && r.body?.ecritures?.[0]?.lignes?.length === 3 && r.body?.ecritures?.[0]?.numero === 'AC-2026-000001' && r.body?.totaux?.nbEcritures === 1 && r.body?.totaux?.debit === '1190.000' && r.body?.totaux?.credit === '1190.000' && r.body?.totaux?.nbBrouillard === 0 && r.body?.total === 1
      && r2.status === 200 && r2.body?.ecritures?.length === 0 && r2.body?.totaux?.nbEcritures === 0 && r2.body?.totaux?.debit === '0.000'
      && r3.status === 200 && r3.body?.ecritures?.length === 1 && r3.body?.totaux?.nbBrouillard === 1 && r3.body?.selection?.periode?.id === P['03'].id, `${r.status} ${r2.status} ${r3.status} ${JSON.stringify(r.body?.totaux)}`);
    r = await L('/journal', cabinet.tok);
    r2 = await L('/journal?journal=999999', cabinet.tok);
    check('livre-journal sans journal : 400 JOURNAL_REQUIS ; journal inconnu : 404', r.status === 400 && r.body?.code === 'JOURNAL_REQUIS' && r2.status === 404, `${r.status} ${r2.status}`);

    // ── Exports Excel ──
    let x = await telecharger(`/api/compta/dossiers/${A.id}/livres/balance/export`, saisie.tok);
    let lu = x.status === 200 ? await rangeesExport(x.buffer, 'Compte') : null;
    check('export de la balance générale (Saisie) : xlsx nommé balance-…-2026.xlsx, 8 rangées de comptes puis le total (12 380 des deux côtés, 5 en brouillard)', x.status === 200 && /spreadsheetml/.test(x.type) && /balance-Hotel-Essai-S6c-2026\.xlsx/.test(x.disposition) && lu?.rangees?.length === 9 && lu?.rangees?.[0]?.[0] === '10131' && lu?.rangees?.[8]?.[0] === 'Total' && Number(lu?.rangees?.[8]?.[6]) === 12380 && Number(lu?.rangees?.[8]?.[7]) === 12380 && Number(lu?.rangees?.[8]?.[8]) === 5, `${x.status} ${x.disposition} ${JSON.stringify(lu?.rangees?.[8])}`);
    x = await telecharger(`/api/compta/dossiers/${A.id}/livres/balance/export?type=clients&periode=${P['03'].id}`, cabinet.tok);
    lu = x.status === 200 ? await rangeesExport(x.buffer, 'Code') : null;
    check('export de la balance auxiliaire clients de mars : nommé balance-clients-…-2026-03.xlsx, C0001 puis le total', x.status === 200 && /balance-clients-Hotel-Essai-S6c-2026-03\.xlsx/.test(x.disposition) && lu?.rangees?.length === 2 && lu?.rangees?.[0]?.[0] === 'C0001' && Number(lu?.rangees?.[0]?.[2]) === 1190 && Number(lu?.rangees?.[0]?.[3]) === 0 && Number(lu?.rangees?.[0]?.[6]) === 2380, `${x.status} ${x.disposition} ${JSON.stringify(lu?.rangees)}`);
    x = await telecharger(`/api/compta/dossiers/${A.id}/livres/grand-livre/export?compte=${K['4011'].id}`, cabinet.tok);
    lu = x.status === 200 ? await rangeesExport(x.buffer, 'Date') : null;
    check('export du grand livre 4011 : rangée d\'ouverture, deux lignes avec leurs soldes, total', x.status === 200 && /grand-livre-4011-Hotel-Essai-S6c-2026\.xlsx/.test(x.disposition) && lu?.rangees?.length === 4 && /Solde d'ouverture/.test(lu?.rangees?.[0]?.[4]) && Number(lu?.rangees?.[0]?.[10]) === 1173.15 && lu?.rangees?.[1]?.[2] === 'AC-2026-000001' && Number(lu?.rangees?.[1]?.[10]) === 2363.15 && lu?.rangees?.[2]?.[11] === 'Brouillard' && lu?.rangees?.[3]?.[0] === 'Total', `${x.status} ${x.disposition} ${JSON.stringify(lu?.rangees)}`);
    x = await telecharger(`/api/compta/dossiers/${A.id}/livres/journal/export?journal=${J.AC.id}`, cabinet.tok);
    lu = x.status === 200 ? await rangeesExport(x.buffer, 'Date') : null;
    check('export du livre-journal AC : trois rangées (une par ligne) puis le total', x.status === 200 && /journal-AC-Hotel-Essai-S6c-2026\.xlsx/.test(x.disposition) && lu?.rangees?.length === 4 && lu?.rangees?.[0]?.[3] === '607' && lu?.rangees?.[2]?.[5] === 'F0001' && lu?.rangees?.[2]?.[10] === '30/04/2026' && lu?.rangees?.[3]?.[0] === 'Total' && Number(lu?.rangees?.[3]?.[7]) === 1190, `${x.status} ${x.disposition} ${JSON.stringify(lu?.rangees)}`);
    x = await telecharger(`/api/compta/dossiers/${A.id}/livres/grand-livre/export`, cabinet.tok);
    const x2 = await telecharger(`/api/compta/dossiers/${A.id}/livres/journal/export`, cabinet.tok);
    const x3 = await telecharger(`/api/compta/dossiers/${A.id}/livres/balance/export?exercice=999999`, cabinet.tok);
    check('exports refusés : grand livre sans cible 400, journal sans journal 400, exercice inconnu 404', x.status === 400 && x2.status === 400 && x3.status === 404, `${x.status} ${x2.status} ${x3.status}`);

    // ── Cloisonnement croisé, période close à l'import, dossier archivé, lecture seule, hooks ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: { raisonSociale: 'Second dossier S6c', formeJuridique: 'SARL' }, regime: REEL, exercice: CIVIL });
    const B = r.body;
    r = await appel('GET', `/api/compta/dossiers/${B?.id}/livres/balance?exercice=${X.id}`, cabinet.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${B?.id}/livres/grand-livre?compte=${K['4011'].id}`, cabinet.tok);
    r3 = await appel('GET', `/api/compta/dossiers/${B?.id}/livres/journal?journal=${J.AC.id}`, cabinet.tok);
    const r4 = await appel('GET', `/api/compta/dossiers/${B?.id}/livres/grand-livre?tiers=${F1.id}`, cabinet.tok);
    const r5 = await appel('GET', `/api/compta/dossiers/${B?.id}/livres/balance`, cabinet.tok);
    check('cloisonnement croisé : exercice, compte, journal, tiers d\'un AUTRE dossier → 404 ; la balance du dossier B est vide', [r, r2, r3, r4].every((q) => q.status === 404) && r5.status === 200 && r5.body?.rangees?.length === 0, `${r.status} ${r2.status} ${r3.status} ${r4.status} ${r5.status}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${P['03'].id}/valider`, cabinet.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${P['03'].id}/clore`, cabinet.tok);
    r3 = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import`, cabinet.tok, await depuisModele(modeleEcritures, [['1', 'OD', '15/03/2026', 'OD-1', 'Dans mars clos', '622', '', '', '10', '', '', ''], ['1', '', '', '', '', '5411', '', '', '', '10', '', '']]));
    check('mars validé puis clos : une écriture importée datée dedans est refusée (rapport : période close), rien d\'écrit', r.status === 200 && r2.status === 200 && r3.status === 400 && r3.body?.code === 'IMPORT_ERREURS' && /est close/.test(r3.body?.lignes?.[0]?.erreurs?.[0] || '') && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.ecritures WHERE dossier_id = $1', [A.id])).rows[0].n === 4, `${r.status} ${r2.status} ${r3.status} ${JSON.stringify(r3.body?.lignes)}`);
    r = await L('/balance?brouillard=0', cabinet.tok);
    check('après la validation de mars : la balance des validées compte 8 comptes et 0 brouillard, toujours cohérente', r.status === 200 && r.body?.rangees?.length === 8 && r.body?.totaux?.nbBrouillard === 0 && r.body?.controles?.coherent === true, `${r.status} ${r.body?.rangees?.length}`);
    await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import`, cabinet.tok, await depuisModele(modeleEcritures, FICHIER_OK));
    r2 = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import-balance-ouverture`, cabinet.tok, await depuisModele(modeleBalance, [['5321', '', '', '1', ''], ['10131', '', '', '', '1']]));
    r3 = await L('/balance', cabinet.tok);
    check('dossier archivé : les deux imports → 409 DOSSIER_ARCHIVE ; les livres se lisent', r.status === 409 && r.body?.code === 'DOSSIER_ARCHIVE' && r2.status === 409 && r2.body?.code === 'DOSSIER_ARCHIVE' && r3.status === 200 && r3.body?.rangees?.length === 8, `${r.status} ${r2.status} ${r3.status}`);
    await appel('POST', `/api/compta/dossiers/${A.id}/desarchiver`, cabinet.tok);
    await mode(cabinet.id, 'read_only');
    r = await televerser(`/api/compta/dossiers/${A.id}/ecritures/import`, cabinet.tok, await depuisModele(modeleEcritures, FICHIER_OK));
    r2 = await L('', cabinet.tok);
    r3 = await L(`/grand-livre?compte=${K['4011'].id}`, cabinet.tok);
    check('comptabilité en lecture seule : import → 403 READ_ONLY ; la page et le grand livre se lisent (lecture_seule)', r.status === 403 && r.body?.code === 'READ_ONLY' && r2.status === 200 && r2.body?.etatAbonnement === 'lecture_seule' && r3.status === 200, `${r.status} ${r.body?.code} ${r2.status} ${r3.status}`);
    await mode(cabinet.id, 'actif');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${K['10131'].id}/desactiver`, cabinet.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/journaux/${J.AN.id}/desactiver`, cabinet.tok);
    r3 = await appel('DELETE', `/api/compta/dossiers/${A.id}/tiers/${C1.id}`, cabinet.tok);
    check('hooks « mouvementé » par les écritures importées : 10131, journal AN, client C0001 → 409', r.status === 409 && r2.status === 409 && r3.status === 409, `${r.status} ${r2.status} ${r3.status}`);
    r = await L('', cabinet.tok);
    check('page des livres : 8 comptes mouvementés (feuilles, triés) et 2 tiers mouvementés proposés au grand livre', r.status === 200 && r.body?.comptes?.length === 8 && r.body?.comptes?.[0]?.numero === '10131' && r.body?.comptes?.every((k) => k.imputable) && r.body?.tiers?.length === 2 && r.body?.tiers?.map((t) => t.code).sort().join(',') === 'C0001,F0001' && r.body?.nb?.validees === 4, `${r.status} ${r.body?.comptes?.length} ${r.body?.tiers?.length}`);

    // ── Rejeu de la migration 217 ; manuel ──
    await pool.query(`DELETE FROM _migrations WHERE filename = '217_compta_livres_imports.sql'`);
    await require('../src/config/migrate')();
    const manuel = (await pool.query(`SELECT slug, contenu_defaut, ecran, ordre FROM manuel_sections WHERE produit = 'compta'`)).rows;
    const texte = (slug) => manuel.find((m) => m.slug === slug)?.contenu_defaut || '';
    check('migration 217 rejouée sans erreur ; 4 écritures de A intactes', (await pool.query(`SELECT 1 FROM _migrations WHERE filename = '217_compta_livres_imports.sql'`)).rows.length === 1 && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.ecritures WHERE dossier_id = $1', [A.id])).rows[0].n === 4);
    check('manuel : fiche « Grand livre et balance » (/livres, 1072) ; « Écritures » (Importer, balance d\'ouverture) et « Fiche du dossier » (Livres) retouchées ; plus d\'« étape des livres »',
      /## 📚 Grand livre et balance/.test(texte('compta-livres')) && manuel.find((m) => m.slug === 'compta-livres')?.ecran === '/livres' && manuel.find((m) => m.slug === 'compta-livres')?.ordre === 1072 && /\*\*Importer \(Excel\)\*\*/.test(texte('compta-ecritures')) && /\*\*Importer une balance d'ouverture\*\*/.test(texte('compta-ecritures')) && /\*\*Livres\*\*/.test(texte('compta-dossier')) && !manuel.some((m) => /étape des livres|étape suivante/.test(m.contenu_defaut)), manuel.map((m) => m.slug).join(','));

    // ── Les pages d'avant ne changent pas ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, cabinet.tok);
    r2 = await E('', saisie.tok);
    r3 = await appel('GET', `/api/compta/dossiers/${A.id}/periodes`, saisie.tok);
    check('fiche du dossier (4 validées, 0 brouillard, mars close), liste des écritures (4, origine import), périodes inchangées', r.status === 200 && r.body?.ecritures?.nbValidees === 4 && r.body?.ecritures?.nbBrouillard === 0 && r.body?.exercice?.periodes?.filter((p) => p.etat === 'close').length === 1 && r2.status === 200 && r2.body?.total === 4 && r2.body?.ecritures?.every((e) => e.origine === 'import') && r3.status === 200 && r3.body?.exercice?.periodes?.length === 12, `${r.status} ${JSON.stringify(r.body?.ecritures)} ${r2.status} ${r2.body?.total} ${r3.status}`);
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
