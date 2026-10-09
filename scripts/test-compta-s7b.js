/* Test E2E local — LabFlow Compta, étape S7b « TVA, retenues et certificats » (labflow-reprise/achats-compta/PLAN-S7.md
 * §1 ligne S7b, §2 « S7b », §4 « TVA », « Retenues », « Seuil des retenues sur achats », « Droits » ; réponses du client
 * du 09/10 — « ok pour les 9 » ; cahier des charges TEJ v2.0).
 *   un dossier au réel avec des fournisseurs à régime fiscal (IS 25 %, IS 20 %, personne physique au réel identifiée par
 *   sa CIN, forfaitaire), des factures d'achat avec TVA, timbre et retenue (dont une d'août réglée en septembre, une en
 *   brouillard, une sans retenue au-dessus du seuil), une vente au secteur public (retenue et retenue de TVA subies) ;
 *   les tiers (régime, résidence, identifiant de secours ; refus ; import avec et sans les colonnes facultatives ;
 *   export) ; la retenue proposée d'après le régime (choix de la saisie, aide) ; le code TEJ d'un code personnalisé ; la
 *   page Taxes du mois (état de TVA avec le crédit reporté d'août, brouillard compris ou non ; paiements à certifier : date
 *   du règlement lettré ou de la facture ; bénéficiaire incomplet ; signalements : taux du régime, retenue manquante,
 *   brouillard) ; produire les certificats (droits, refus, numéros, contenu figé, journal) ; PDF un par un et lot ; fichier
 *   TEJ du mois (nom, structure, millimes, sans accent, empreinte, retéléchargé à l'identique ; rien à déposer) ;
 *   annuler, rectificatif (acte 1 : ajout et annulation) ; contre-passation signalée ; export Excel ; carte Taxes de la
 *   fiche ; dossier archivé ; lecture seule ; cloisonnement croisé ; rejeu de la migration 219 ; manuel.
 * Crée un super_admin, un cabinet (3 gérants achetés) et trois collaborateurs temporaires ; règle les tarifs Compta le
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
const telecharger = async (chemin, jeton, methode = 'GET', corps) => {
  const r = await fetch(`${BASE}${chemin}`, { method: methode, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` }, body: corps === undefined ? undefined : JSON.stringify(corps) });
  const buffer = Buffer.from(await r.arrayBuffer());
  let body = null;
  if (/json/.test(r.headers.get('content-type') || '')) { try { body = JSON.parse(buffer.toString('utf8')); } catch (_) { /* rien */ } }
  return { status: r.status, type: r.headers.get('content-type') || '', disposition: r.headers.get('content-disposition') || '', buffer, body };
};
const televerser = async (chemin, jeton, buffer, champs = {}) => {
  const form = new FormData();
  form.append('fichier', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'tiers.xlsx');
  for (const [k, v] of Object.entries(champs)) form.append(k, v);
  const r = await fetch(`${BASE}${chemin}`, { method: 'POST', headers: { Authorization: `Bearer ${jeton}` }, body: form });
  let body = null;
  try { body = await r.json(); } catch (_) { /* rien */ }
  return { status: r.status, body };
};
const feuilles = async (buffer) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer); return wb.worksheets.map((w) => w.name); };
const login = async (email) => appel('POST', '/auth/login', null, { email, password: MDP });
const CLES = ['compta_cabinet_mensuel', 'compta_gerant_cabinet_mensuel', 'compta_mise_en_route', 'compta_module_mensuel', 'compta_gerant_client_mensuel'];

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s7b@example.com';
  const CABINET = 'test-cabinet-compta-s7b@example.com';
  const SAISIE = 'test-saisie-compta-s7b@example.com';
  const COMPLET = 'test-complet-compta-s7b@example.com';
  const CONSULT = 'test-consult-compta-s7b@example.com';
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
  const IDENTITE_A = { raisonSociale: 'Hôtel Essai S7b', formeJuridique: 'SARL', matriculeFiscal: '1234567A/A/M/000', adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' };
  const REEL = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const CIVIL = { debut: '2026-01-01', fin: '2026-12-31' };
  const compte = (plan, numero) => plan?.comptes?.find((c) => c.numero === numero);

  try {
    await wipe();
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin S7b', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    const adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (3 gérants achetés) avec trois collaborateurs ──
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S7b', email: CABINET, telephone: '20 555 297', raisonSociale: 'Cabinet Essai S7b', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S7b', representantQualite: 'Gérant', nbGerants: 3,
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

    // ── Dossier A (réel) ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REEL, exercice: CIVIL });
    const A = r.body;
    check('dossier A créé (exercice 2026, matricule 1234567A/A/M/000)', r.status === 201 && A?.exercice?.periodes?.length === 12, `${r.status}`);
    const planA = (await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok)).body;
    const K = Object.fromEntries(['607', '622', '6654', '43666', '436711', '432', '4341', '43665', '4011', '4111', '5321', '707'].map((n) => [n, compte(planA, n)]));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    const J = Object.fromEntries(['AC', 'VT', 'BQ'].map((c) => [c, r.body?.journaux?.find((j) => j.code === c)]));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok);
    const X = Object.fromEntries((r.body?.taxes || []).map((t) => [t.code, t]));
    check('comptes, journaux et codes de taxe de A ; la page Taxes offre les codes TEJ du paquet (36) et RSTVA25 / RSTVA100', Object.values(K).every(Boolean) && Object.values(J).every(Boolean) && !!X.TVA19 && !!X.RS_MAR15 && !!X.RS_MAR1 && !!X.RS_HON3 && !!X.TIMBRE && !!X.RSTVA25 && r.body?.codesTej?.length === 36 && r.body?.codesTejTva?.join(',') === 'RSTVA25,RSTVA100', JSON.stringify(Object.keys(K).filter((k) => !K[k])));

    // ── Tiers : régime fiscal, résidence, identifiant de secours ──
    const TIERS = (jeton, corps) => appel('POST', `/api/compta/dossiers/${A.id}/tiers`, jeton, corps);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?type=fournisseur`, consult.tok);
    const regimes = r.body?.regimesFiscaux || [];
    check('page Tiers : 7 régimes fiscaux du paquet avec leurs retenues (IS 20 % → RS_MAR1, forfait → honoraires RS_HON10), familles, 4 types d\'identifiant',
      r.status === 200 && regimes.length === 7 && regimes.find((x) => x.valeur === 'pm_is20')?.retenues?.achats?.code === 'RS_MAR1' && regimes.find((x) => x.valeur === 'pp_forfait')?.retenues?.honoraires?.code === 'RS_HON10' && regimes.find((x) => x.valeur === 'pm_is15')?.note?.startsWith('Non confirmé') && r.body?.familles?.achats?.join(',') === 'RS_MAR15,RS_MAR1,RS_MAR05' && r.body?.typesIdentifiant?.length === 4, `${r.status} ${JSON.stringify(regimes.map((x) => x.valeur))}`);
    const COMPLETE = { adresse: '12 rue de Marseille', ville: 'Tunis', email: 'compta@stb-essai.tn', telephone: '71 123 456' };
    const T = {};
    r = await TIERS(saisie.tok, { type: 'fournisseur', nom: 'Société Tunisienne de Boissons', matriculeFiscal: '7654321B/A/M/000', regimeFiscal: 'pm_is25', retenueId: X.RS_MAR15.id, ...COMPLETE });
    T.F1 = r.body?.tiers;
    check('Saisie crée F0001 au régime « IS de 25 % ou plus » (personne morale, résident)', r.status === 201 && T.F1?.regimeFiscal === 'pm_is25' && T.F1?.personne === 'morale' && T.F1?.resident === true && T.F1?.identifiant === null && /25 %/.test(T.F1?.regimeFiscalLibelle || ''), `${r.status} ${r.body?.message || ''}`);
    T.F2 = (await TIERS(cabinet.tok, { type: 'fournisseur', nom: 'Imprimerie du Lac', matriculeFiscal: '1111111C/A/M/000', regimeFiscal: 'pm_is20', retenueId: X.RS_MAR15.id, adresse: '3 rue du Lac', ville: 'Les Berges du Lac', email: 'contact@imprimerie-essai.tn', telephone: '71 222 333' })).body?.tiers;
    r = await TIERS(cabinet.tok, { type: 'fournisseur', nom: 'Maître Ben Salah', regimeFiscal: 'pp_reel', retenueId: X.RS_HON3.id, adresse: '7 avenue de Paris', ville: 'Tunis', telephone: '98 000 111', identifiant: { type: 'cin', numero: '01 234 567', naissance: '12/05/1980' } });
    T.F3 = r.body?.tiers;
    check('F0003 sans matricule : CIN « 01 234 567 » enregistrée 01234567, née le 12/05/1980 (personne physique au réel, sans email)', r.status === 201 && T.F3?.identifiant?.type === 'cin' && T.F3?.identifiant?.numero === '01234567' && T.F3?.identifiant?.naissance === '1980-05-12' && T.F3?.personne === 'physique' && !T.F3?.email, `${r.status} ${JSON.stringify(T.F3?.identifiant)} ${r.body?.message || ''}`);
    T.F4 = (await TIERS(cabinet.tok, { type: 'fournisseur', nom: 'Petit Fournisseur', regimeFiscal: 'pp_forfait', retenueId: X.RS_MAR15.id, ...COMPLETE, email: 'petit@essai.tn' })).body?.tiers;
    T.F5 = (await TIERS(cabinet.tok, { type: 'fournisseur', nom: 'Sans Retenue Par Défaut', regimeFiscal: 'pm_is20' })).body?.tiers;
    T.C1 = (await TIERS(cabinet.tok, { type: 'client', nom: 'Office National Essai', matriculeFiscal: '2222222D/A/P/000' })).body?.tiers;
    check('F0002 (IS 20 %), F0004 (forfait), F0005 (IS 20 %, sans retenue par défaut), C0001 créés', !!T.F2 && !!T.F4 && !!T.F5 && !!T.C1 && T.F5?.retenue === null);
    r = await TIERS(cabinet.tok, { type: 'fournisseur', nom: 'X', regimeFiscal: 'pm_is99' });
    r2 = await TIERS(cabinet.tok, { type: 'fournisseur', nom: 'X', identifiant: { type: 'cin', numero: '1234567' } });
    r3 = await TIERS(cabinet.tok, { type: 'fournisseur', nom: 'X', identifiant: { type: 'passeport', numero: 'AB123', pays: 'Tunisie' } });
    r4 = await TIERS(cabinet.tok, { type: 'fournisseur', nom: 'X', identifiant: { type: 'cin', numero: '12345678', naissance: '31/02/1990' } });
    const r5 = await TIERS(cabinet.tok, { type: 'fournisseur', nom: 'X', resident: 'peut-être' });
    check('refus : régime inconnu, CIN de 7 chiffres, pays en toutes lettres, date de naissance impossible, résident « peut-être » (400)', [r, r2, r3, r4, r5].every((x) => x.status === 400), [r, r2, r3, r4, r5].map((x) => `${x.status} ${x.body?.message}`).join(' | '));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${T.F3.id}`, saisie.tok, { identifiant: { type: 'passeport', numero: 'k1234567', naissance: '1980-05-12', pays: 'fr' }, resident: false });
    let ev = await journal(espaceId, 'tiers_modifie');
    r2 = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${T.F3.id}`, saisie.tok, { identifiant: { type: 'cin', numero: '01234567', naissance: '1980-05-12' }, resident: true });
    check('modifier l\'identifiant (passeport K1234567, FR) et la résidence : journal avant / après ; retour à la CIN', r.status === 200 && r.body?.tiers?.identifiant?.numero === 'K1234567' && r.body?.tiers?.identifiant?.pays === 'FR' && r.body?.tiers?.resident === false && ev?.details?.changements?.identifiantType?.avant === 'cin' && ev?.details?.changements?.identifiantType?.apres === 'passeport' && ev?.details?.changements?.resident?.apres === false && r2.status === 200 && r2.body?.tiers?.identifiant?.type === 'cin', `${r.status} ${JSON.stringify(ev?.details?.changements)} ${r2.status}`);

    // ── Import : ancien modèle (11 colonnes) et nouveau (colonnes facultatives) ; export ──
    const classeur = async (enTetes, lignes) => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Fournisseurs');
      ws.addRow(enTetes);
      for (const l of lignes) ws.addRow(l);
      return Buffer.from(await wb.xlsx.writeBuffer());
    };
    const ANCIENS = ['Code', 'Nom', 'Matricule fiscal', 'Adresse', 'Ville', 'Téléphone', 'Email', 'Compte collectif', 'Régime de TVA', 'Retenue par défaut', 'Délai de paiement (jours)'];
    const NOUVEAUX = [...ANCIENS, 'Régime fiscal', 'Résident', 'Type d\'identifiant', 'Numéro d\'identifiant', 'Date de naissance', 'Pays de l\'identifiant'];
    r = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, cabinet.tok, await classeur(ANCIENS, [['', 'Importé Ancien Modèle', '', '', '', '', '', '', 'Assujetti', '', '0']]), { type: 'fournisseur' });
    r2 = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, cabinet.tok, await classeur(NOUVEAUX, [
      ['', 'Importé Nouveau Modèle', '', '', '', '', '', '', 'Assujetti', 'RS_MAR1', '30', 'Personne morale à l\'IS de 20 %', 'Oui', '', '', '', ''],
      ['', 'Prestataire Étranger', '', '', '', '', '', '', 'Non assujetti', '', '0', 'pm_is25', 'Non', 'Autre identifiant (non-résident)', 'FR-998877', '', 'FR'],
    ]), { type: 'fournisseur' });
    r3 = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, cabinet.tok, await classeur(NOUVEAUX, [['', 'Faux', '', '', '', '', '', '', '', '', '', 'Régime inventé', 'Oui', 'CIN', '123', '', '']]), { type: 'fournisseur' });
    const importes = (await pool.query(`SELECT nom, regime_fiscal, resident, id_type, id_numero, id_pays FROM compta.tiers WHERE dossier_id = $1 AND origine = 'import' ORDER BY nom`, [A.id])).rows;
    check('import : l\'ancien modèle s\'importe encore ; le nouveau lit régime (libellé ou valeur), résidence, identifiant ; une ligne fausse refuse tout (régime inventé, CIN de 3 chiffres)',
      r.status === 201 && r2.status === 201 && r2.body?.importes === 2 && importes.length === 3 && importes.find((t) => t.nom === 'Importé Nouveau Modèle')?.regime_fiscal === 'pm_is20' && importes.find((t) => t.nom === 'Prestataire Étranger')?.resident === false && importes.find((t) => t.nom === 'Prestataire Étranger')?.id_type === 'autre' && importes.find((t) => t.nom === 'Prestataire Étranger')?.id_pays === 'FR' && importes.find((t) => t.nom === 'Importé Ancien Modèle')?.regime_fiscal === null
      && r3.status === 400 && r3.body?.code === 'IMPORT_ERREURS' && r3.body?.lignes?.[0]?.erreurs?.length === 2, `${r.status} ${r2.status} ${r2.body?.message || ''} ${r3.status} ${JSON.stringify(r3.body?.lignes)}`);
    let f = await telecharger(`/api/compta/dossiers/${A.id}/tiers/export?type=fournisseur`, consult.tok);
    const wbx = new ExcelJS.Workbook();
    await wbx.xlsx.load(f.buffer);
    let entetes = [];
    wbx.worksheets[0].eachRow((row) => { if (!entetes.length && String(row.getCell(1).text) === 'Code') entetes = row.values.slice(1); });
    f = await telecharger(`/api/compta/dossiers/${A.id}/tiers/modele-import?type=fournisseur`, consult.tok);
    const wbm = new ExcelJS.Workbook();
    await wbm.xlsx.load(f.buffer);
    let entetesModele = [];
    wbm.worksheets[0].eachRow((row) => { if (!entetesModele.length && String(row.getCell(1).text) === 'Code') entetesModele = row.values.slice(1); });
    check('export et modèle : les six colonnes facultatives après celles de S5c (export : puis État, Origine)', entetes.join('|') === [...NOUVEAUX, 'État', 'Origine'].join('|') && entetesModele.join('|') === NOUVEAUX.join('|'), `${entetes.join('|')} // ${entetesModele.join('|')}`);

    // ── Le code TEJ d'un code personnalisé ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok, { code: 'RS_COURT10', libelle: 'Retenue courtage 10 %', type: 'retenue', assiette: 'ttc', taux: '10', compteAchatId: K['432'].id, codeTej: 'RS2_000001' });
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok, { code: 'RS_FAUX', libelle: 'Faux', type: 'retenue', assiette: 'ttc', taux: '5', codeTej: 'RS99_000001' });
    r3 = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${X.RS_MAR15.id}`, cabinet.tok, { codeTej: 'RS7_000002' });
    const courtage = r.body?.taxes?.find((t) => t.code === 'RS_COURT10');
    r4 = await appel('PUT', `/api/compta/dossiers/${A.id}/taxes/${courtage?.id}`, complet.tok, { codeTej: 'RS1_000002' });
    check('code personnalisé avec code TEJ RS2_000001 (201) ; code TEJ inconnu (400) ; code du paquet : 409 TAXE_PAQUET ; Complet change celui du code personnalisé (RS1_000002)', r.status === 201 && courtage?.codeTej === 'RS2_000001' && r2.status === 400 && r3.status === 409 && r3.body?.code === 'TAXE_PAQUET' && r4.status === 200 && r4.body?.taxes?.find((t) => t.code === 'RS_COURT10')?.codeTej === 'RS1_000002', `${r.status} ${r2.status} ${r3.status} ${r4.status}`);

    // ── La retenue proposée d'après le régime ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures`, saisie.tok);
    const choixF5 = r.body?.tiers?.find((t) => t.id === T.F5.id);
    const choixF1 = r.body?.tiers?.find((t) => t.id === T.F1.id);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures/aide/retenue`, saisie.tok, { journalId: J.AC.id, tiersId: T.F5.id, lignes: [{ compteId: K['607'].id, debit: '2000' }, { compteId: K['43666'].id, debit: '380' }, { compteId: K['4011'].id, tiersId: T.F5.id, credit: '2380' }] });
    check('saisie : F0005 (IS 20 %, sans retenue par défaut) se voit proposer RS_MAR1 « d\'après le régime » ; F0001 garde sa retenue par défaut ; l\'aide sans code calcule 1 % de 2 380 = 23,800', r.status === 200 && choixF5?.retenue?.code === 'RS_MAR1' && choixF5?.retenue?.selonRegime === true && choixF1?.retenue?.code === 'RS_MAR15' && !choixF1?.retenue?.selonRegime && r2.status === 200 && r2.body?.taxe?.code === 'RS_MAR1' && r2.body?.ligne?.credit === '23.800', `${JSON.stringify(choixF5?.retenue)} ${r2.status} ${JSON.stringify(r2.body?.ligne || r2.body?.message)}`);

    // ── Écritures : août et septembre ──
    const ecrire = async (journalId, date, reference, libelle, lignes) => {
      const x = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures`, cabinet.tok, { journalId, date, reference, libelle, lignes });
      if (x.status !== 201) throw new Error(`écriture ${reference} : ${x.status} ${x.body?.message}`);
      return x.body.ecriture;
    };
    const L = (k, { tiers, d, c, taxe } = {}) => ({ compteId: K[k].id, tiersId: tiers ? tiers.id : null, debit: d || '', credit: c || '', taxeId: taxe ? X[taxe].id : null });
    const E = {};
    // Août : facture STB 800 + TVA 152 = 952, retenue 1,5 % 14,280 ; réglée le 02/09 (937,720).
    E.f0820 = await ecrire(J.AC.id, '2026-08-20', 'F-0820', 'Facture STB août', [L('607', { d: '800', taxe: 'TVA19' }), L('43666', { d: '152', taxe: 'TVA19' }), L('432', { c: '14.280', taxe: 'RS_MAR15' }), L('4011', { tiers: T.F1, c: '937.720' })]);
    E.r0902 = await ecrire(J.BQ.id, '2026-09-02', 'RLV-0902', 'Règlement STB août', [L('4011', { tiers: T.F1, d: '937.720' }), L('5321', { c: '937.720' })]);
    // Septembre : STB 1 000 + 190 + timbre 1 ; retenue 1,5 % du TTC hors timbre 1 190 = 17,850 ; réglée le 20/09.
    E.f0905 = await ecrire(J.AC.id, '2026-09-05', 'F-0905', 'Facture STB septembre', [L('607', { d: '1000', taxe: 'TVA19' }), L('43666', { d: '190', taxe: 'TVA19' }), L('6654', { d: '1', taxe: 'TIMBRE' }), L('432', { c: '17.850', taxe: 'RS_MAR15' }), L('4011', { tiers: T.F1, c: '1173.150' })]);
    E.r0920 = await ecrire(J.BQ.id, '2026-09-20', 'RLV-0920', 'Règlement STB septembre', [L('4011', { tiers: T.F1, d: '1173.150' }), L('5321', { c: '1173.150' })]);
    // Imprimerie (IS 20 %, retenue 1,5 % appliquée au lieu de 1 %) : 2 000 + 380 ; retenue 35,700 ; non réglée.
    E.f0910 = await ecrire(J.AC.id, '2026-09-10', 'F-0910', 'Facture Imprimerie', [L('607', { d: '2000', taxe: 'TVA19' }), L('43666', { d: '380', taxe: 'TVA19' }), L('432', { c: '35.700', taxe: 'RS_MAR15' }), L('4011', { tiers: T.F2, c: '2344.300' })]);
    // Honoraires (CIN, sans email) : 500 + 95 ; retenue 3 % de 595 = 17,850.
    E.h0915 = await ecrire(J.AC.id, '2026-09-15', 'H-0915', 'Honoraires Maître Ben Salah', [L('622', { d: '500', taxe: 'TVA19' }), L('43666', { d: '95', taxe: 'TVA19' }), L('432', { c: '17.850', taxe: 'RS_HON3' }), L('4011', { tiers: T.F3, c: '577.150' })]);
    // Forfaitaire : 600 sans retenue (sous le seuil) ; 1 500 sans retenue (manquante).
    E.f0912 = await ecrire(J.AC.id, '2026-09-12', 'F-0912', 'Petit achat', [L('607', { d: '600' }), L('4011', { tiers: T.F4, c: '600' })]);
    E.f0918 = await ecrire(J.AC.id, '2026-09-18', 'F-0918', 'Gros achat sans retenue', [L('607', { d: '1500' }), L('4011', { tiers: T.F4, c: '1500' })]);
    // Vente au secteur public : 1 000 + 190 ; retenue 1,5 % subie (17,850, 4341) et retenue de TVA 25 % subie (47,500, 43665).
    E.v0925 = await ecrire(J.VT.id, '2026-09-25', 'FV-0925', 'Séjour Office National', [L('4111', { tiers: T.C1, d: '1124.650' }), L('4341', { d: '17.850', taxe: 'RS_MAR15' }), L('43665', { d: '47.500', taxe: 'RSTVA25' }), L('707', { c: '1000', taxe: 'TVA19' }), L('436711', { c: '190', taxe: 'TVA19' })]);
    const P = Object.fromEntries((await appel('GET', `/api/compta/dossiers/${A.id}/periodes`, cabinet.tok)).body.exercice.periodes.map((p) => [String(p.debut).slice(5, 7), p]));
    for (const m of ['08', '09']) {
      r = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${P[m].id}/valider`, cabinet.tok);
      if (r.status !== 200) throw new Error(`valider ${m} : ${r.status} ${r.body?.message}`);
    }
    // Brouillard (après la validation) : STB 100 + 19, retenue 1,785.
    E.f0928 = await ecrire(J.AC.id, '2026-09-28', 'F-0928', 'Facture STB fin septembre (brouillard)', [L('607', { d: '100', taxe: 'TVA19' }), L('43666', { d: '19', taxe: 'TVA19' }), L('432', { c: '1.785', taxe: 'RS_MAR15' }), L('4011', { tiers: T.F1, c: '117.215' })]);
    const lt = (e) => e.lignes.find((l) => l.tiers);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/lettrage`, saisie.tok, { tiersId: T.F1.id, groupes: [[lt(E.f0820).id, lt(E.r0902).id], [lt(E.f0905).id, lt(E.r0920).id]] });
    check('écritures d\'août et de septembre saisies et validées (une en brouillard) ; STB lettrée avec ses deux règlements', r.status === 201 && r.body?.faites?.length === 2, `${r.status} ${r.body?.message || ''}`);

    // ── La page Taxes du mois ──
    const TM = (q, jeton) => appel('GET', `/api/compta/dossiers/${A.id}/taxes-mois${q}`, jeton);
    r = await TM(`?periode=${P['09'].id}`, consult.tok);
    const t = r.body?.tva;
    check('état de TVA de septembre (Consultation, brouillard compris) : collectée 190, déductible 684 (190 + 380 + 95 + 19), retenue de TVA subie 47,500, crédit reporté d\'août 152, crédit à reporter 693,500',
      r.status === 200 && t?.collectee === '190.000' && t?.deductibleBs === '684.000' && t?.deductibleImmo === '0.000' && t?.retenuesSubies === '47.500' && t?.creditReporte === '152.000' && t?.resultat === '-693.500' && t?.aPayer === '0.000' && t?.creditAReporter === '693.500' && t?.nbBrouillard === 2
      && t?.codes?.find((c) => c.code === 'TVA19')?.baseVente === '1000.000' && t?.codes?.find((c) => c.code === 'TVA19')?.baseAchat === '3600.000', `${r.status} ${JSON.stringify(t && { c: t.collectee, d: t.deductibleBs, s: t.retenuesSubies, cr: t.creditReporte, res: t.resultat, nb: t.nbBrouillard, codes: t.codes })} ${r.body?.message || ''}`);
    r2 = await TM(`?periode=${P['09'].id}&brouillard=0`, consult.tok);
    check('validées seulement : déductible 665, crédit à reporter 674,500', r2.status === 200 && r2.body?.tva?.deductibleBs === '665.000' && r2.body?.tva?.creditAReporter === '674.500', JSON.stringify(r2.body?.tva && { d: r2.body.tva.deductibleBs, c: r2.body.tva.creditAReporter }));
    const paiements = r.body?.retenues?.paiements || [];
    const pay = (code, date) => paiements.find((p) => p.tiers?.code === code && p.date === date);
    const stb0902 = pay('F0001', '2026-09-02');
    const stb0920 = pay('F0001', '2026-09-20');
    const imp = pay('F0002', '2026-09-10');
    const hon = pay('F0003', '2026-09-15');
    check('paiements de septembre : STB le 02/09 (facture d\'août, règlement lettré) et le 20/09 ; Imprimerie le 10/09 (date de la facture) ; Maître Ben Salah bloqué (email)',
      paiements.length === 4 && stb0902?.sourceDate === 'reglement' && stb0902?.operations?.[0]?.reference === 'F-0820' && stb0920?.sourceDate === 'reglement' && imp?.sourceDate === 'facture' && !!hon?.bloque && /email/.test(hon?.bloque || '') && !stb0920?.bloque, JSON.stringify(paiements.map((p) => [p.tiers?.code, p.date, p.sourceDate, p.bloque])));
    const op = stb0920?.operations?.[0];
    check('opération STB 20/09 : HT 1 000, TVA 190 (19 %), TTC hors timbre 1 190, retenue 17,850 (1,5 %, RS7_000001), net servi 1 172,150', op?.ht === '1000.000' && op?.tva === '190.000' && op?.ttc === '1190.000' && op?.rs === '17.850' && op?.tauxRs === '1.500' && op?.tauxTva === '19.000' && op?.codeTej === 'RS7_000001' && op?.net === '1172.150', JSON.stringify(op));
    const sig = r.body?.signalements || [];
    const a = (code) => sig.filter((s) => s.code === code);
    check('signalements : sous le seuil (STB 02/09 : 952 D TTC), taux du régime (F0002 : RS_MAR1 attendu), retenue manquante (F-0918, 1 500 D ; pas F-0912, sous le seuil), bénéficiaire incomplet (F0003), pièce en brouillard',
      a('SOUS_SEUIL').length === 1 && /952,000 D TTC/.test(a('SOUS_SEUIL')[0].message) && a('SOUS_SEUIL')[0].tiersId === T.F1.id && a('TAUX_REGIME').length === 1 && /RS_MAR1 attendu/.test(a('TAUX_REGIME')[0].message) && a('RETENUE_MANQUANTE').length === 1 && /F-0918|AC-2026/.test(a('RETENUE_MANQUANTE')[0].message) && a('BENEFICIAIRE_INCOMPLET').length === 1 && a('RETENUES_BROUILLARD').length === 1 && r.body?.retenues?.brouillard?.length === 1 && !a('DECLARANT_INCOMPLET').length, JSON.stringify(sig.map((s) => s.code)));
    check('retenues subies de septembre : la ligne 4341 de 17,850 (client C0001) ; fichier initial (acte 0) attendu, 0 certificat ; « à essayer sur TEJ »',
      r.body?.subies?.nb === 1 && r.body?.subies?.total === '17.850' && r.body?.subies?.lignes?.[0]?.tiers?.code === 'C0001' && r.body?.prochainFichier?.acte === 0 && r.body?.prochainFichier?.nbAjouts === 0 && r.body?.prochainFichier?.nom === '1234567A-2026-09-0.xml' && r.body?.certificats?.length === 0 && r.body?.tej?.aEssayer === true && r.body?.declarant?.complet === true, JSON.stringify({ s: r.body?.subies, p: r.body?.prochainFichier }));
    r2 = await TM('', consult.tok);
    check('sans période : celle du jour dans l\'exercice ouvert (octobre 2026), crédit reporté de septembre 693,500 ; un étranger : 404', r2.status === 200 && r2.body?.periode?.debut === '2026-10-01' && r2.body?.tva?.creditReporte === '693.500' && (await TM('', adminTok)).status === 404, `${r2.status} ${r2.body?.periode?.debut} ${r2.body?.tva?.creditReporte}`);

    // ── Produire les certificats ──
    const PROD = (jeton, paiementsDemandes) => appel('POST', `/api/compta/dossiers/${A.id}/certificats`, jeton, { paiements: paiementsDemandes });
    const demande = [
      { tiersId: T.F1.id, date: '2026-09-20', ecritures: [E.f0905.id] },
      { tiersId: T.F1.id, date: '2026-09-02', ecritures: [E.f0820.id] },
      { tiersId: T.F2.id, date: '2026-09-11', ecritures: [E.f0910.id] },
    ];
    r = await PROD(consult.tok, demande);
    r2 = await PROD(saisie.tok, demande);
    check('Consultation et Saisie ne produisent pas (403 NIVEAU_INSUFFISANT)', r.status === 403 && r2.status === 403 && r2.body?.code === 'NIVEAU_INSUFFISANT', `${r.status} ${r2.status}`);
    r = await PROD(complet.tok, [{ tiersId: T.F3.id, date: '2026-09-15', ecritures: [E.h0915.id] }]);
    r2 = await PROD(complet.tok, [{ tiersId: T.F1.id, date: '2099-01-01', ecritures: [E.f0905.id] }]);
    r3 = await PROD(complet.tok, [{ tiersId: T.F1.id, date: '2026-09-28', ecritures: [E.f0928.id] }]);
    r4 = await PROD(complet.tok, [{ tiersId: T.F2.id, date: '2026-09-20', ecritures: [E.f0905.id] }]);
    check('refus : bénéficiaire incomplet (409, email), date future (400), écriture en brouillard (409 BROUILLARD), pièce d\'un autre bénéficiaire (409 PERIME)', r.status === 409 && r.body?.code === 'BENEFICIAIRE_INCOMPLET' && /email/.test(r.body?.message || '') && r2.status === 400 && r2.body?.code === 'DATE_PAIEMENT' && r3.status === 409 && r3.body?.code === 'BROUILLARD' && r4.status === 409 && r4.body?.code === 'PERIME', `${r.status} ${r.body?.code} ${r2.status} ${r3.status} ${r3.body?.code} ${r4.status} ${r4.body?.code}`);
    r = await PROD(complet.tok, demande);
    const produits = r.body?.produits || [];
    check('Complet produit trois certificats : 2026-000001 (STB 20/09), 2026-000002 (STB 02/09), 2026-000003 (Imprimerie, date corrigée au 11/09)', r.status === 201 && produits.map((p) => p.reference).join(',') === '2026-000001,2026-000002,2026-000003' && produits[2].date === '2026-09-11' && produits[0].rs === '17.850', `${r.status} ${JSON.stringify(produits)} ${r.body?.message || ''}`);
    ev = await journal(espaceId, 'certificats_produits');
    check('journal D16 certificats_produits (références, bénéficiaires, retenues, pièces)', ev?.details?.certificats?.length === 3 && ev?.details?.certificats?.[0]?.tiers === 'F0001' && ev?.details?.certificats?.[2]?.pieces?.length === 1 && ev?.auteur_id === complet.id, JSON.stringify(ev?.details));
    r = await PROD(complet.tok, [{ tiersId: T.F1.id, date: '2026-09-20', ecritures: [E.f0905.id] }]);
    check('une pièce déjà certifiée : 409 PERIME', r.status === 409 && r.body?.code === 'PERIME', `${r.status} ${r.body?.code}`);
    r = await TM(`?periode=${P['09'].id}`, consult.tok);
    const certs = r.body?.certificats || [];
    const c3 = certs.find((c) => c.reference === '2026-000003');
    check('la page : 3 certificats du mois (Imprimerie : source « saisie », bénéficiaire et déclarant figés) ; plus qu\'un paiement à certifier (bloqué) ; prochain fichier : acte 0, 3 ajouts',
      certs.length === 3 && c3?.sourceDate === 'saisie' && c3?.beneficiaire?.identifiant?.valeur === '1111111C' && c3?.beneficiaire?.identifiant?.categorie === 'PM' && c3?.etat === 'produit' && c3?.fichier === null && r.body?.retenues?.paiements?.length === 1 && r.body?.prochainFichier?.nbAjouts === 3 && r.body?.retenues?.parNature?.find((n) => n.codeTej === 'RS7_000001')?.certifie === '67.830', `${certs.length} ${JSON.stringify(r.body?.retenues?.parNature)} ${JSON.stringify(r.body?.prochainFichier)}`);
    f = await telecharger(`/api/compta/dossiers/${A.id}/certificats/${produits[0].id}/pdf`, consult.tok);
    r2 = await telecharger(`/api/compta/dossiers/${A.id}/taxes-mois/certificats.pdf?periode=${P['09'].id}`, consult.tok);
    r3 = await telecharger(`/api/compta/dossiers/${A.id}/taxes-mois/certificats.pdf?periode=${P['08'].id}`, consult.tok);
    check('PDF : un certificat (Consultation), le lot du mois (3 pages au moins) ; août sans certificat → 409 AUCUN_CERTIFICAT', f.status === 200 && f.buffer.slice(0, 5).toString() === '%PDF-' && /certificat-2026-000001-F0001\.pdf/.test(f.disposition) && r2.status === 200 && (r2.buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 3 && r3.status === 409 && r3.body?.code === 'AUCUN_CERTIFICAT', `${f.status} ${f.disposition} ${r2.status} ${r3.status}`);

    // ── Le fichier TEJ du mois ──
    const FICHIER = (jeton, corps) => telecharger(`/api/compta/dossiers/${A.id}/fichiers-tej`, jeton, 'POST', corps);
    r = await FICHIER(saisie.tok, { annee: 2026, mois: 9 });
    f = await FICHIER(complet.tok, { annee: 2026, mois: 9 });
    const xml = f.buffer.toString('utf8');
    check('fichier TEJ : Saisie refusée (403) ; Complet obtient 1234567A-2026-09-0.xml (application/xml)', r.status === 403 && f.status === 200 && /application\/xml/.test(f.type) && /1234567A-2026-09-0\.xml/.test(f.disposition), `${r.status} ${f.status} ${f.disposition}`);
    check('structure du cahier des charges : racine VersionSchema 1.0, déclarant (1, 1234567A, PM), acte 0, 2026, 09, trois certificats',
      xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>') && xml.includes('<DeclarationsRS VersionSchema="1.0">') && xml.includes('<Declarant><TypeIdentifiant>1</TypeIdentifiant><Identifiant>1234567A</Identifiant><CategorieContribuable>PM</CategorieContribuable></Declarant>') && xml.includes('<ReferenceDeclaration><ActeDepot>0</ActeDepot><AnneeDepot>2026</AnneeDepot><MoisDepot>09</MoisDepot></ReferenceDeclaration>') && (xml.match(/<Certificat>/g) || []).length === 3 && !xml.includes('<AnnulerCertificats>'), xml.slice(0, 400));
    check('certificat 2026-000001 : bénéficiaire 7654321B (PM, résident), nom sans accent « Societe Tunisienne de Boissons », DatePayement 20/09/2026, opération RS7_000001 en millimes (HT 1000000, TVA 190000, TTC 1190000, RS 17850, net 1172150), TauxRS 1.50, TauxTVA 19.00',
      xml.includes('<MatriculeFiscal><TypeIdentifiant>1</TypeIdentifiant><Identifiant>7654321B</Identifiant><CategorieContribuable>PM</CategorieContribuable></MatriculeFiscal>') && xml.includes('<NometprenonOuRaisonsociale>Societe Tunisienne de Boissons</NometprenonOuRaisonsociale>') && xml.includes('<DatePayement>20/09/2026</DatePayement><Ref_certif_chez_declarant>2026-000001</Ref_certif_chez_declarant>')
      && xml.includes('<Operation IdTypeOperation="RS7_000001"><AnneeFacturation>2026</AnneeFacturation><CNPC>0</CNPC><P_Charge>0</P_Charge><MontantHT>1000000</MontantHT><TauxRS>1.50</TauxRS><TauxTVA>19.00</TauxTVA><MontantTVA>190000</MontantTVA><MontantTTC>1190000</MontantTTC><MontantRS>17850</MontantRS><MontantNetServi>1172150</MontantNetServi></Operation>')
      && xml.includes('<InfosContact><AdresseMail>compta@stb-essai.tn</AdresseMail><NumTel>71 123 456</NumTel></InfosContact>') && xml.includes('<TotalMontantRS>17850</TotalMontantRS>'), (xml.match(/<Certificat>.*?<\/Certificat>/) || [''])[0]);
    check('aucun caractère interdit : ni accent ni « ; * & » hors entités, ni « -- », ni « /* »', !/[^\x00-\x7F]/.test(xml) && !/[;*]/.test(xml) && !xml.includes('--') && !xml.includes('/*') && !/&(?!amp;|lt;|gt;|quot;)/.test(xml), (xml.match(/[^\x00-\x7F;*]/g) || []).join(''));
    const empreinte = crypto.createHash('sha256').update(f.buffer).digest('hex');
    ev = await journal(espaceId, 'fichier_tej_produit');
    r = await FICHIER(complet.tok, { annee: 2026, mois: 9 });
    const fichierId = ev?.details?.fichier;
    r2 = await telecharger(`/api/compta/dossiers/${A.id}/fichiers-tej/${fichierId}`, consult.tok);
    check('journal fichier_tej_produit (nom, acte 0, empreinte SHA-256, 3 ajouts) ; une seconde demande : 409 RIEN_A_DEPOSER ; retéléchargé à l\'identique (Consultation)', ev?.details?.nom === '1234567A-2026-09-0.xml' && ev?.details?.acte === 0 && ev?.details?.empreinte === empreinte && ev?.details?.ajouts?.length === 3 && r.status === 409 && r.body?.code === 'RIEN_A_DEPOSER' && r2.status === 200 && Buffer.compare(r2.buffer, f.buffer) === 0, `${JSON.stringify(ev?.details)} ${r.status} ${r2.status}`);

    // ── Annuler, compléter, rectificatif ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/certificats/${produits[2].id}/annuler`, saisie.tok, { motif: 'Date erronée' });
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/certificats/${produits[2].id}/annuler`, complet.tok, {});
    r3 = await appel('POST', `/api/compta/dossiers/${A.id}/certificats/${produits[2].id}/annuler`, complet.tok, { motif: 'Date erronée : paiement du 12/09' });
    r4 = await appel('POST', `/api/compta/dossiers/${A.id}/certificats/${produits[2].id}/annuler`, complet.tok, { motif: 'encore' });
    ev = await journal(espaceId, 'certificat_annule');
    check('annuler 2026-000003 : Saisie 403, sans motif 400, Complet 200 (déjà déposé), une seconde fois 409 DEJA_ANNULE ; journal', r.status === 403 && r2.status === 400 && r2.body?.code === 'MOTIF_REQUIS' && r3.status === 200 && r3.body?.annule?.depose === true && r4.status === 409 && r4.body?.code === 'DEJA_ANNULE' && ev?.details?.reference === '2026-000003' && ev?.details?.depose === true, `${r.status} ${r2.status} ${r3.status} ${r4.status}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${T.F3.id}`, saisie.tok, { email: 'cabinet@bensalah-essai.tn' });
    r2 = await PROD(complet.tok, [{ tiersId: T.F2.id, date: '2026-09-12', ecritures: [E.f0910.id] }, { tiersId: T.F3.id, date: '2026-09-15', ecritures: [E.h0915.id] }]);
    check('la pièce de l\'Imprimerie redevient à certifier (2026-000004, 12/09) ; F0003 complétée (email) : 2026-000005, identifié par sa CIN', r.status === 200 && r2.status === 201 && r2.body?.produits?.map((p) => p.reference).join(',') === '2026-000004,2026-000005', `${r.status} ${r2.status} ${JSON.stringify(r2.body?.produits || r2.body?.message)}`);
    r = await TM(`?periode=${P['09'].id}`, consult.tok);
    check('prochain fichier : rectificatif (acte 1), 2 ajouts, 1 annulation ; 2026-000003 marqué annulé avec son motif', r.body?.prochainFichier?.acte === 1 && r.body?.prochainFichier?.nbAjouts === 2 && r.body?.prochainFichier?.nbAnnulations === 1 && r.body?.certificats?.find((c) => c.reference === '2026-000003')?.annulation?.motif === 'Date erronée : paiement du 12/09' && r.body?.fichiers?.length === 1, JSON.stringify(r.body?.prochainFichier));
    f = await FICHIER(complet.tok, { annee: 2026, mois: 9 });
    const rect = f.buffer.toString('utf8');
    check('rectificatif 1234567A-2026-09-1.xml : acte 1, deux certificats ajoutés (dont la CIN 01234567 née le 12/05/1980, PP), l\'annulation de 2026-000003',
      f.status === 200 && /1234567A-2026-09-1\.xml/.test(f.disposition) && rect.includes('<ActeDepot>1</ActeDepot>') && (rect.match(/<AjouterCertificats>[\s\S]*<\/AjouterCertificats>/)?.[0].match(/<Certificat>/g) || []).length === 2
      && rect.includes('<CIN><TypeIdentifiant>2</TypeIdentifiant><Identifiant>01234567</Identifiant><DateNaissance>12/05/1980</DateNaissance><CategorieContribuable>PP</CategorieContribuable></CIN>') && rect.includes('<Operation IdTypeOperation="RS2_000002">')
      && rect.includes('<AnnulerCertificats>\n<Certificat><Ref_certif_chez_declarant>2026-000003</Ref_certif_chez_declarant></Certificat>\n</AnnulerCertificats>'), `${f.status} ${f.disposition} ${rect.slice(0, 300)}`);
    f = await telecharger(`/api/compta/dossiers/${A.id}/certificats/${produits[2].id}/pdf`, consult.tok);
    check('le certificat annulé se retélécharge (PDF marqué annulé)', f.status === 200 && f.buffer.slice(0, 5).toString() === '%PDF-', `${f.status}`);

    // ── Contre-passation d'une pièce certifiée ; export ; fiche ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/ecritures/${E.f0905.id}/contrepasser`, cabinet.tok, { date: '2026-10-02' });
    r2 = await TM(`?periode=${P['09'].id}`, consult.tok);
    check('contre-passer F-0905 (certifiée) : le certificat 2026-000001 est signalé ; la pièce ne revient pas à certifier', r.status === 201 && (r2.body?.signalements || []).some((s) => s.code === 'CERTIFICAT_CONTREPASSE' && /2026-000001/.test(s.message)) && !(r2.body?.retenues?.paiements || []).some((p) => p.operations.some((o) => o.ecritureId === E.f0905.id)), `${r.status} ${JSON.stringify((r2.body?.signalements || []).map((s) => s.code))}`);
    f = await telecharger(`/api/compta/dossiers/${A.id}/taxes-mois/export?periode=${P['09'].id}`, consult.tok);
    check('export Excel : quatre feuilles (État de TVA, Retenues opérées, Retenues subies, Signalements)', f.status === 200 && /spreadsheetml/.test(f.type) && /taxes-Hotel-Essai-S7b-2026-09\.xlsx/.test(f.disposition) && (await feuilles(f.buffer)).join(',') === 'État de TVA,Retenues opérées,Retenues subies,Signalements', `${f.status} ${f.disposition}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, consult.tok);
    check('fiche du dossier, carte Taxes : période d\'octobre, crédit à reporter 503,500 (693,500 de septembre moins la TVA de F-0905 contre-passée le 02/10), plus de pièce à certifier (F-0928 en brouillard exclue)', r.status === 200 && r.body?.fiscalite?.periode?.debut === '2026-10-01' && r.body?.fiscalite?.tva?.creditAReporter === '503.500' && r.body?.fiscalite?.aProduire === 0 && r.body?.fiscalite?.certificatsMois === 0, JSON.stringify(r.body?.fiscalite));

    // ── Cloisonnement, archivé, lecture seule ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: { ...IDENTITE_A, raisonSociale: 'Dossier B S7b', matriculeFiscal: '' }, regime: REEL, exercice: CIVIL });
    const B = r.body;
    r = await telecharger(`/api/compta/dossiers/${B.id}/certificats/${produits[0].id}/pdf`, cabinet.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${B.id}/certificats/${produits[0].id}/annuler`, cabinet.tok, { motif: 'x' });
    r3 = await telecharger(`/api/compta/dossiers/${B.id}/fichiers-tej/${fichierId}`, cabinet.tok);
    const r6 = await telecharger(`/api/compta/dossiers/${B.id}/fichiers-tej`, cabinet.tok, 'POST', { annee: 2026, mois: 9 });
    check('cloisonnement : le certificat et le fichier de A depuis B → 404 / 409 « introuvable » ; B sans matricule : fichier refusé (409 DECLARANT_INCOMPLET)', r.status === 404 && r2.status === 409 && r2.body?.code === 'CERTIFICAT_INTROUVABLE' && r3.status === 404 && r6.status === 409 && r6.body?.code === 'DECLARANT_INCOMPLET', `${r.status} ${r2.status} ${r3.status} ${r6.status} ${r6.body?.code}`);
    await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    r = await PROD(cabinet.tok, [{ tiersId: T.F1.id, date: '2026-09-20', ecritures: [E.f0905.id] }]);
    r2 = await TM(`?periode=${P['09'].id}`, cabinet.tok);
    check('dossier archivé : produire → 409 DOSSIER_ARCHIVE ; la page se lit', r.status === 409 && r.body?.code === 'DOSSIER_ARCHIVE' && r2.status === 200, `${r.status} ${r2.status}`);
    await appel('POST', `/api/compta/dossiers/${A.id}/desarchiver`, cabinet.tok);
    await mode(cabinet.id, 'read_only');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/certificats/${produits[1].id}/annuler`, cabinet.tok, { motif: 'x' });
    r2 = await telecharger(`/api/compta/dossiers/${A.id}/certificats/${produits[1].id}/pdf`, cabinet.tok);
    check('comptabilité en lecture seule : annuler → 403 READ_ONLY ; le PDF se lit', r.status === 403 && r.body?.code === 'READ_ONLY' && r2.status === 200, `${r.status} ${r.body?.code} ${r2.status}`);
    await mode(cabinet.id, 'actif');

    // ── Rejeu de la migration 219 ; manuel ──
    const nbCert = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.certificats WHERE dossier_id = $1', [A.id])).rows[0].n;
    await pool.query(`DELETE FROM _migrations WHERE filename = '219_compta_taxes_certificats.sql'`);
    await require('../src/config/migrate')();
    check('migration 219 rejouée sans erreur ; 5 certificats de A intacts', (await pool.query(`SELECT 1 FROM _migrations WHERE filename = '219_compta_taxes_certificats.sql'`)).rows.length === 1 && nbCert === 5 && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.certificats WHERE dossier_id = $1', [A.id])).rows[0].n === 5, `${nbCert}`);
    const manuel = (await pool.query(`SELECT slug, contenu_defaut, ecran, ordre FROM manuel_sections WHERE produit = 'compta'`)).rows;
    const texte = (slug) => manuel.find((m) => m.slug === slug)?.contenu_defaut || '';
    check('manuel : fiche « Taxes du mois et certificats » (/taxes-mois, 1074) ; « Tiers », « Fiche du dossier » et « Taxes » retouchées',
      /## 🧾 Taxes du mois et certificats/.test(texte('compta-taxes-mois')) && manuel.find((m) => m.slug === 'compta-taxes-mois')?.ecran === '/taxes-mois' && manuel.find((m) => m.slug === 'compta-taxes-mois')?.ordre === 1074
      && /\*\*régime fiscal\*\*/.test(texte('compta-tiers')) && /\*\*Taxes\*\* : les \*\*taxes du mois\*\*/.test(texte('compta-dossier')) && /\*\*code TEJ\*\*/.test(texte('compta-taxes')), manuel.map((m) => m.slug).join(','));

    // ── Les pages d'avant ne changent pas ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/livres/balance`, saisie.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/echeancier?type=fournisseur`, saisie.tok);
    r3 = await appel('GET', `/api/compta/dossiers/${A.id}/lettrage`, saisie.tok);
    check('balance (cohérente), échéancier et lettrage inchangés', r.status === 200 && r.body?.controles?.coherent === true && r2.status === 200 && r3.status === 200, `${r.status} ${r2.status} ${r3.status}`);
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
