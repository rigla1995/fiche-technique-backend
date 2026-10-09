/* Test E2E local — LabFlow Compta, étape S5c « Les tiers et les imports » (labflow-reprise/achats-compta/PLAN-S5.md §1,
 * §2, §4 ; SPEC-SOCLE D18 ; réponses du client du 07/10 — questions 4, 5 et 6 — et du 08/10 — « ok pour les 4 » : modèle
 * des codes réglé sur la page Tiers, retenue par défaut = un code de retenue, import du plan de comptes, le niveau
 * Saisie crée et modifie des tiers).
 *   la page des tiers d'un dossier (modèle des codes, comptes collectifs proposés, codes de retenue, pages, recherche) ;
 *   créer (code généré F0001 / C0001 ou saisi, compte collectif par défaut 4011 / 4111 ou choisi, retenue, délai,
 *   matricule contrôlé et « déjà porté » en avertissement), modifier (avant / après au journal, le code sans écriture),
 *   désactiver / réactiver (Saisie aussi), supprimer (Complet), modèle des codes (Complet) ; un compte collectif porté ne
 *   se désactive pas dans le plan ; un code de retenue désactivé n'est plus proposé mais reste sur le tiers ;
 *   import Excel des tiers en TOUT-OU-RIEN (modèle téléchargé, codes générés, rapport ligne par ligne, rien d'écrit à la
 *   moindre erreur, bornes) ; export Excel ; import du plan de comptes (renommer, ajouter sous le bon parent,
 *   re-rattacher, tout ou rien) ; droits par niveau ; dossier archivé ; garde par comptabilité ; journal (D16) ;
 *   « Mon entreprise » du client ; rejeu de la migration 214 ; suppression d'un dossier vide (cascade) ; pages d'avant.
 * Crée un super_admin, un cabinet (2 gérants achetés), deux collaborateurs et un client LabFlow (module Comptabilité)
 * temporaires ; règle les tarifs Compta le temps de l'essai, puis restaure et nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');
const { findHeaderRow } = require('../src/services/excelBrandService');

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
// Téléversement d'un classeur (multipart, champ « fichier ») et téléchargement d'un classeur.
const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const televerser = async (chemin, jeton, buffer, champs = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(champs)) form.append(k, v);
  if (buffer) form.append('fichier', new Blob([buffer], { type: TYPE_XLSX }), 'essai.xlsx');
  const r = await fetch(`${BASE}${chemin}`, { method: 'POST', headers: { Authorization: `Bearer ${jeton}` }, body: form });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const telecharger = async (chemin, jeton) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  return { status: r.status, type: r.headers.get('content-type') || '', disposition: r.headers.get('content-disposition') || '', buffer: Buffer.from(await r.arrayBuffer()) };
};
// Un classeur à partir du modèle téléchargé, lignes ajoutées sous la ligne d'exemple ; un classeur brut (en-têtes en ligne 1).
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
const lireClasseur = async (buffer) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer); return wb.worksheets[0]; };
const login = async (email) => appel('POST', '/auth/login', null, { email, password: MDP });
const CLES = ['compta_cabinet_mensuel', 'compta_gerant_cabinet_mensuel', 'compta_mise_en_route', 'compta_module_mensuel', 'compta_gerant_client_mensuel'];
const EN_TETES_TIERS = ['Code', 'Nom', 'Matricule fiscal', 'Adresse', 'Ville', 'Téléphone', 'Email', 'Compte collectif', 'Régime de TVA', 'Retenue par défaut', 'Délai de paiement (jours)'];
const EN_TETES_PLAN = ['Numéro', 'Libellé', 'Nature'];

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s5c@example.com';
  const CLIENT = 'test-client-compta-s5c@example.com';
  const CABINET = 'test-cabinet-compta-s5c@example.com';
  const SAISIE = 'test-saisie-compta-s5c@example.com';
  const COMPLET = 'test-complet-compta-s5c@example.com';
  const TOUS = [ADMIN, CLIENT, CABINET, SAISIE, COMPLET];
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  let adminTok = null;
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [TOUS])).rows.map((r) => r.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
      // D10 : les dossiers retiennent leur comptabilité (RESTRICT) — l'essai efface les siens d'abord (plan, journaux, taxes, tiers suivent, CASCADE).
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
  const nbJournal = async (espaceId, type, filtre = {}) => (await pool.query('SELECT COUNT(*)::int AS n FROM compta.evenements WHERE espace_id = $1 AND type = $2 AND details @> $3::jsonb', [espaceId, type, JSON.stringify(filtre)])).rows[0].n;
  const mode = (id, m) => pool.query('UPDATE abonnements SET mode_compte = $2 WHERE client_id = $1', [id, m]);
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };
  const IDENTITE_A = { raisonSociale: 'Hôtel Essai S5c', formeJuridique: 'SARL', matriculeFiscal: '1234567A/A/M/000', adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' };
  const REEL = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const FORFAIT = { personne: 'physique', impot: 'IRPP', tva: 'forfaitaire', exportateurTotal: false, teledeclaration: false, debutActivite: null };
  const CIVIL = { debut: '2026-01-01', fin: '2026-12-31' };
  const compte = (plan, numero) => plan?.comptes?.find((c) => c.numero === numero);
  const tiersDe = (etat, code) => etat?.tiers?.find((t) => t.code === code);
  const codes = (etat) => (etat?.tiers || []).map((t) => t.code).join(',');

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S5c', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (2 gérants achetés) avec deux collaborateurs, un client LabFlow (module) ──
    let r2 = null;
    let r3 = null;
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S5c', email: CABINET, telephone: '20 555 097', raisonSociale: 'Cabinet Essai S5c', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S5c', representantQualite: 'Gérant', nbGerants: 2,
    });
    check('création du cabinet (2 gérants achetés)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const cabinet = await activer(CABINET);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    check('connexion du titulaire', !!cabinet.tok && !!espaceId);
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Saisie', email: SAISIE, niveau: 'saisie', dossiers: 'tous' });
    check('collaborateur de niveau Saisie', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Complet', email: COMPLET, niveau: 'complet', dossiers: 'tous' });
    check('collaborateur de niveau Complet', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const saisie = await activer(SAISIE);
    const complet = await activer(COMPLET);
    check('connexion des collaborateurs', !!saisie.tok && !!complet.tok);
    r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client S5c', email: CLIENT, telephone: '20 555 098', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    const client = await activer(CLIENT);
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 0 });
    const espaceClient = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [client.id])).rows[0]?.id;
    check('client LabFlow avec le module Comptabilité', !!client.tok && r.status === 200 && !!espaceClient, `${r.status} ${r.body?.message || ''}`);

    // ── Dossier A (réel) : la fiche compte les tiers, le droit « tiers » ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REEL, exercice: CIVIL });
    const A = r.body;
    check('dossier A créé : la fiche résume 0 fournisseur et 0 client, droit « tiers »', r.status === 201 && A?.tiers?.fournisseurs?.nbActifs === 0 && A?.tiers?.fournisseurs?.nbTotal === 0 && A?.tiers?.clients?.nbTotal === 0 && A?.droits?.tiers === true && A?.droits?.configurer === true, `${r.status} ${JSON.stringify(A?.tiers)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok);
    const planA = r.body;
    const c4011 = compte(planA, '4011');
    const c4111 = compte(planA, '4111');
    const c404 = compte(planA, '404');
    const c5321 = compte(planA, '5321');
    r = await appel('GET', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok);
    const rsMar15 = r.body?.taxes?.find((t) => t.code === 'RS_MAR15');
    const rsHon10 = r.body?.taxes?.find((t) => t.code === 'RS_HON10');
    const tva19 = r.body?.taxes?.find((t) => t.code === 'TVA19');
    check('plan et taxes de A lus (4011, 4111, 404, 5321, RS_MAR15, TVA19)', !!c4011 && !!c4111 && !!c404 && !!c5321 && !!rsMar15 && !!tva19 && !!rsHon10);

    // ── La page des tiers : modèle des codes, choix proposés, droits ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok);
    let etat = r.body;
    check('titulaire : onglet fournisseurs par défaut, modèle F / C + 4 chiffres, prochains F0001 et C0001, comptes rendus à zéro',
      r.status === 200 && etat?.type === 'fournisseur' && etat?.modele?.prefixes?.fournisseur === 'F' && etat?.modele?.prefixes?.client === 'C' && etat?.modele?.chiffres === 4
      && etat?.modele?.prochain?.fournisseur === 'F0001' && etat?.modele?.prochain?.client === 'C0001' && etat?.nb?.fournisseur?.total === 0 && etat?.nb?.client?.total === 0 && etat?.total === 0 && etat?.page === 1 && etat?.limite === 25, `${r.status} ${JSON.stringify(etat?.modele)}`);
    check('… comptes collectifs proposés : actifs, de nature fournisseurs ou clients seulement (4011, 4111, 404 ; pas 5321) ; retenues : RS_MAR15, pas TVA19',
      etat?.collectifs?.length > 10 && etat.collectifs.every((c) => ['fournisseurs', 'clients'].includes(c.nature) && c.actif) && !!etat.collectifs.find((c) => c.numero === '4011') && !!etat.collectifs.find((c) => c.numero === '404') && !etat.collectifs.find((c) => c.numero === '5321')
      && !!etat?.retenues?.find((x) => x.code === 'RS_MAR15') && !etat.retenues.find((x) => x.code === 'TVA19') && etat.retenues.every((x) => x.actif), `${etat?.collectifs?.length} ${etat?.retenues?.length}`);
    check('… types avec leur collectif par défaut (4011 / 4111), 4 régimes de TVA, bornes du code (2 à 10), 2 000 lignes d\'import, droits',
      etat?.types?.find((t) => t.valeur === 'fournisseur')?.collectifDefaut === '4011' && etat?.types?.find((t) => t.valeur === 'client')?.collectifDefaut === '4111' && etat?.regimes?.length === 4 && etat?.code?.min === 2 && etat?.code?.max === 10
      && etat?.importMax === 2000 && etat?.droits?.tiers === true && etat?.droits?.configurer === true && etat?.etatAbonnement === 'actif', JSON.stringify(etat?.code));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers`, saisie.tok);
    check('collaborateur Saisie : lit, droit « tiers » oui, « configurer » non (réponse 4 du 08/10)', r.status === 200 && r.body?.droits?.tiers === true && r.body?.droits?.configurer === false, `${r.status} ${JSON.stringify(r.body?.droits)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers`, client.tok);
    check('un client étranger au cabinet : 404', r.status === 404, String(r.status));
    r = await appel('GET', '/api/compta/dossiers/abc/tiers', cabinet.tok);
    check('identifiant mal formé : 404, jamais 500', r.status === 404, String(r.status));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?type=x`, cabinet.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?page=0`, cabinet.tok);
    check('type inconnu, page 0 : 400', r.status === 400 && r2.status === 400, `${r.status} ${r2.status}`);

    // ── Créer : code généré, collectif par défaut, retenue, délai ; le niveau Saisie crée ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, saisie.tok, { type: 'fournisseur', nom: 'Société Alpha', matriculeFiscal: '1234567a/a/m/000', adresse: '1 rue Alpha', ville: 'Tunis', telephone: '71 000 000', email: 'alpha@essai.tn', regimeTva: 'assujetti', retenueId: rsMar15.id, delaiPaiement: 30 });
    let t = r.body?.tiers;
    check('Saisie crée un fournisseur sans code : 201, F0001 généré, 4011 par défaut, RS_MAR15, 30 jours, matricule normalisé, origine saisi',
      r.status === 201 && t?.code === 'F0001' && t?.compte?.numero === '4011' && t?.retenue?.code === 'RS_MAR15' && t?.delaiPaiement === 30 && t?.matriculeFiscal === '1234567A/A/M/000' && t?.origine === 'saisi' && t?.actif === true && t?.regimeTva === 'assujetti' && t?.typeLibelle === 'Fournisseur'
      && r.body?.nb?.fournisseur?.total === 1 && r.body?.modele?.prochain?.fournisseur === 'F0002' && Array.isArray(r.body?.avertissements) && r.body.avertissements.length === 0, `${r.status} ${r.body?.message || ''} ${JSON.stringify(t)}`);
    let j = await journal(espaceId, 'tiers_cree');
    check('journal : tiers_cree (type, code généré, compte, retenue, auteur Saisie)', !!j && j.details?.code === 'F0001' && j.details?.type === 'fournisseur' && j.details?.codeGenere === true && j.details?.compte === '4011' && j.details?.retenue === 'RS_MAR15' && j.auteur_id === saisie.id, JSON.stringify(j?.details));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, complet.tok, { type: 'fournisseur', code: 'f0007', nom: 'Fournisseur Immo', compteId: c404.id });
    t = r.body?.tiers;
    check('code saisi en minuscules « f0007 » → F0007, compte 404 choisi, sans retenue, comptant ; prochain F0008', r.status === 201 && t?.code === 'F0007' && t?.compte?.numero === '404' && t?.retenue === null && t?.delaiPaiement === 0 && r.body?.modele?.prochain?.fournisseur === 'F0008', `${r.status} ${r.body?.message || ''}`);
    j = await journal(espaceId, 'tiers_cree');
    check('journal : tiers_cree sans codeGenere pour un code saisi', !!j && j.details?.code === 'F0007' && j.details?.codeGenere === undefined, JSON.stringify(j?.details));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', code: 'F0007', nom: 'Doublon' });
    check('code déjà pris : 409 CODE_EXISTANT', r.status === 409 && r.body?.code === 'CODE_EXISTANT', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'client', nom: 'Hôtel Client', matriculeFiscal: '7654321B/A/M/000', regimeTva: 'Exonéré', delaiPaiement: '45' });
    t = r.body?.tiers;
    check('client sans code : C0001, 4111 par défaut, régime « Exonéré » lu en toutes lettres, 45 jours', r.status === 201 && t?.code === 'C0001' && t?.compte?.numero === '4111' && t?.regimeTva === 'exonere' && t?.regimeTvaLibelle === 'Exonéré' && t?.delaiPaiement === 45 && r.body?.nb?.client?.total === 1 && r.body?.modele?.prochain?.client === 'C0002', `${r.status} ${r.body?.message || ''}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Alpha bis', matriculeFiscal: '1234567A/A/M/000', retenueId: rsMar15.id });
    check('même matricule qu\'un autre tiers : 201 (F0008) avec l\'avertissement « déjà porté par le fournisseur F0001 »', r.status === 201 && r.body?.tiers?.code === 'F0008' && r.body?.avertissements?.some((a) => /déjà porté par le fournisseur F0001/.test(a)), `${r.status} ${JSON.stringify(r.body?.avertissements)}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Sans clé', matriculeFiscal: '9999999' });
    check('matricule sans lettre de clé : 201 (F0009) avec l\'avertissement', r.status === 201 && r.body?.tiers?.code === 'F0009' && r.body?.avertissements?.some((a) => /sans lettre de clé/.test(a)), `${r.status} ${JSON.stringify(r.body?.avertissements)}`);
    // Refus de forme (400) et cloisonnement (404).
    for (const [corps, quoi] of [
      [{ type: 'fournisseur', nom: '' }, 'nom vide'], [{ type: 'fournisseur', code: 'A', nom: 'x' }, 'code d\'un caractère'], [{ type: 'fournisseur', code: 'F-1', nom: 'x' }, 'tiret dans le code'],
      [{ type: 'fournisseur', nom: 'x', matriculeFiscal: '123456A' }, 'matricule à six chiffres'], [{ type: 'fournisseur', nom: 'x', email: 'pas-un-email' }, 'email'],
      [{ type: 'fournisseur', nom: 'x', regimeTva: 'réel' }, 'régime inconnu'], [{ type: 'fournisseur', nom: 'x', delaiPaiement: 400 }, 'délai > 365'], [{ type: 'x', nom: 'x' }, 'type inconnu'],
      [{ type: 'fournisseur', nom: 'x', compteId: 'abc' }, 'compte mal formé'], [{ type: 'fournisseur', nom: 'x', compteId: c5321.id }, 'compte de nature banque'], [{ type: 'fournisseur', nom: 'x', retenueId: tva19.id }, 'TVA19 comme retenue'],
      [{ type: 'fournisseur', nom: 'شركة' }, 'nom en arabe'],
    ]) {
      r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, corps);
      check(`${quoi} : 400`, r.status === 400, `${r.status} ${r.body?.message}`);
    }
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'x', retenueId: 999999999 });
    check('retenue inconnue : 404', r.status === 404, String(r.status));
    const dossierClient = (await pool.query(`SELECT id FROM compta.dossiers WHERE espace_id = $1 AND source = 'labflow'`, [espaceClient])).rows[0];
    r = await appel('GET', `/api/compta/dossiers/${dossierClient?.id}/plan`, client.tok);
    const c4011Client = compte(r.body, '4011');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'x', compteId: c4011Client?.id });
    check('compte d\'un autre dossier (le 4011 du client) : 404', r.status === 404, `${r.status} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, client.tok, { type: 'fournisseur', nom: 'x' });
    check('personne étrangère : 404', r.status === 404, String(r.status));

    // ── La liste : tri, recherche, pages ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok);
    etat = r.body;
    check('4 fournisseurs triés par code (F0001, F0007, F0008, F0009), 1 client, total 4', r.status === 200 && codes(etat) === 'F0001,F0007,F0008,F0009' && etat?.total === 4 && etat?.nb?.fournisseur?.actifs === 4 && etat?.nb?.client?.total === 1, codes(etat));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?type=client`, cabinet.tok);
    check('onglet clients : C0001 seul', r.status === 200 && codes(r.body) === 'C0001' && r.body?.total === 1 && r.body?.type === 'client', codes(r.body));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?q=alpha`, cabinet.tok);
    check('recherche « alpha » (nom, sans casse) : 2 résultats', r.status === 200 && r.body?.total === 2 && codes(r.body) === 'F0001,F0008', codes(r.body));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?q=1234567`, cabinet.tok);
    check('recherche par matricule : 2 résultats', r.body?.total === 2, codes(r.body));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?q=F0007`, cabinet.tok);
    check('recherche par code : 1 résultat', r.body?.total === 1 && codes(r.body) === 'F0007', codes(r.body));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?q=%25`, cabinet.tok);
    check('recherche « % » prise au pied de la lettre : 0 résultat', r.body?.total === 0, String(r.body?.total));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?limite=2`, cabinet.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?limite=2&page=2`, cabinet.tok);
    r3 = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?limite=2&page=3`, cabinet.tok);
    check('pages de 2 : page 1 = F0001, F0007 (total 4) ; page 2 = F0008, F0009 ; page 3 vide', codes(r.body) === 'F0001,F0007' && r.body?.total === 4 && r.body?.limite === 2 && codes(r2.body) === 'F0008,F0009' && r2.body?.page === 2 && r3.body?.tiers?.length === 0, `${codes(r.body)} | ${codes(r2.body)}`);

    // ── Modifier (Saisie) : avant / après au journal, le code sans écriture ──
    const f1 = tiersDe(etat, 'F0001');
    const f7 = tiersDe(etat, 'F0007');
    const f9 = tiersDe(etat, 'F0009');
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${f1.id}`, saisie.tok, { nom: 'Société Alpha SARL', ville: 'La Marsa', delaiPaiement: 60, retenueId: null, compteId: c404.id });
    t = r.body?.tiers;
    check('Saisie modifie F0001 (nom, ville, délai, retenue retirée, compte 404) : 200', r.status === 200 && t?.nom === 'Société Alpha SARL' && t?.ville === 'La Marsa' && t?.delaiPaiement === 60 && t?.retenue === null && t?.compte?.numero === '404', `${r.status} ${r.body?.message || ''}`);
    j = await journal(espaceId, 'tiers_modifie');
    check('journal : tiers_modifie avec avant / après (compte 4011 → 404, retenue RS_MAR15 → aucune, nom, ville, délai)', !!j && j.details?.changements?.compte?.avant === '4011' && j.details?.changements?.compte?.apres === '404' && j.details?.changements?.retenue?.avant === 'RS_MAR15' && j.details?.changements?.retenue?.apres === null
      && j.details?.changements?.nom?.apres === 'Société Alpha SARL' && j.details?.changements?.delaiPaiement?.avant === 30 && j.auteur_id === saisie.id, JSON.stringify(j?.details));
    const nbModif = await nbJournal(espaceId, 'tiers_modifie');
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${f1.id}`, cabinet.tok, { nom: 'Société Alpha SARL', ville: 'La Marsa', compteId: c404.id });
    check('mêmes valeurs : 200 sans ligne de journal', r.status === 200 && (await nbJournal(espaceId, 'tiers_modifie')) === nbModif, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${f1.id}`, complet.tok, { code: 'alpha1' });
    check('le code change tant que le tiers n\'a pas d\'écriture : F0001 → ALPHA1', r.status === 200 && r.body?.tiers?.code === 'ALPHA1' && (await journal(espaceId, 'tiers_modifie'))?.details?.changements?.code?.avant === 'F0001', `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${f1.id}`, cabinet.tok, { code: 'F0007' });
    check('code déjà pris par un autre fournisseur : 409 CODE_EXISTANT', r.status === 409 && r.body?.code === 'CODE_EXISTANT', `${r.status} ${r.body?.code}`);
    for (const [corps, quoi, statut] of [[{}, 'rien à modifier', 400], [{ code: '' }, 'code vide en modification', 400], [{ compteId: c5321.id }, 'compte de nature banque', 400], [{ email: 'x' }, 'email', 400], [{ nom: '' }, 'nom vide', 400]]) {
      r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${f1.id}`, cabinet.tok, corps);
      check(`${quoi} : ${statut}`, r.status === statut, `${r.status} ${r.body?.message}`);
    }
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/999999999`, cabinet.tok, { nom: 'x' });
    check('tiers inconnu : 404', r.status === 404, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${f1.id}`, client.tok, { nom: 'x' });
    check('personne étrangère : 404', r.status === 404, String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/${f9.id}`, cabinet.tok, { matriculeFiscal: '1234567A/A/M/000' });
    check('matricule déjà porté en modification : 200 avec deux avertissements (ALPHA1, F0008)', r.status === 200 && r.body?.avertissements?.length === 2, JSON.stringify(r.body?.avertissements));

    // ── Désactiver, réactiver (Saisie aussi) ; supprimer (Complet seulement) ──
    const f8 = tiersDe(etat, 'F0008');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers/${f8.id}/desactiver`, saisie.tok);
    check('Saisie désactive F0008 : 200, inactif, 3 actifs sur 4', r.status === 200 && r.body?.tiers?.actif === false && r.body?.nb?.fournisseur?.actifs === 3 && r.body?.nb?.fournisseur?.total === 4, `${r.status} ${r.body?.message || ''}`);
    check('journal : tiers_desactive', !!(await journal(espaceId, 'tiers_desactive')));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers/${f8.id}/desactiver`, cabinet.tok);
    check('désactiver deux fois : 409 DEJA_FAIT', r.status === 409 && r.body?.code === 'DEJA_FAIT', String(r.status));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?inactifs=1`, cabinet.tok);
    check('la liste cache les désactivés (3) ; « inactifs=1 » les montre après les actifs (F0008 en dernier)', r.body?.total === 3 && !tiersDe(r.body, 'F0008') && r2.body?.total === 4 && codes(r2.body) === 'ALPHA1,F0007,F0009,F0008', `${codes(r.body)} | ${codes(r2.body)}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers/${f8.id}/reactiver`, saisie.tok);
    check('réactiver F0008 : 200 ; journal tiers_reactive', r.status === 200 && r.body?.tiers?.actif === true && !!(await journal(espaceId, 'tiers_reactive')), String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers/${f8.id}/reactiver`, cabinet.tok);
    check('réactiver un tiers actif : 409 DEJA_FAIT', r.status === 409 && r.body?.code === 'DEJA_FAIT', String(r.status));
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/tiers/${f9.id}`, saisie.tok);
    check('Saisie ne supprime pas : 403 NIVEAU_INSUFFISANT', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', `${r.status} ${r.body?.code}`);
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/tiers/${f9.id}`, complet.tok);
    check('Complet supprime F0009 (sans écriture) : 200, 3 fournisseurs ; journal tiers_supprime', r.status === 200 && r.body?.supprime?.code === 'F0009' && r.body?.nb?.fournisseur?.total === 3 && (await journal(espaceId, 'tiers_supprime'))?.details?.code === 'F0009', `${r.status} ${r.body?.message || ''}`);
    r = await appel('DELETE', `/api/compta/dossiers/${A.id}/tiers/${f9.id}`, complet.tok);
    check('supprimer deux fois : 404', r.status === 404, String(r.status));

    // ── Le modèle des codes (Complet) ──
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/modele`, saisie.tok, { chiffres: 5 });
    check('Saisie ne règle pas le modèle : 403', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', String(r.status));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/modele`, complet.tok, { prefixeFournisseur: 'fr', chiffres: 5 });
    check('Complet règle FR + 5 chiffres : 200, prochains FR00001 et C00001 (C0001 à 4 chiffres ne compte plus)', r.status === 200 && r.body?.modele?.prefixes?.fournisseur === 'FR' && r.body?.modele?.chiffres === 5 && r.body?.modele?.prochain?.fournisseur === 'FR00001' && r.body?.modele?.prochain?.client === 'C00001', `${r.status} ${JSON.stringify(r.body?.modele)}`);
    j = await journal(espaceId, 'tiers_modele_modifie');
    check('journal : tiers_modele_modifie (préfixe F → FR, chiffres 4 → 5)', !!j && j.details?.changements?.prefixeFournisseur?.avant === 'F' && j.details?.changements?.prefixeFournisseur?.apres === 'FR' && j.details?.changements?.chiffres?.apres === 5, JSON.stringify(j?.details));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Nouveau modèle' });
    check('un fournisseur créé sans code reçoit FR00001', r.status === 201 && r.body?.tiers?.code === 'FR00001', `${r.status} ${r.body?.tiers?.code}`);
    for (const [corps, quoi] of [[{ chiffres: 8 }, '8 chiffres'], [{ chiffres: 2 }, '2 chiffres'], [{ prefixeClient: 'ABCD' }, 'préfixe de 4'], [{ prefixeClient: 'C-' }, 'préfixe avec tiret'], [{}, 'rien']]) {
      r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/modele`, cabinet.tok, corps);
      check(`modèle : ${quoi} : 400`, r.status === 400, `${r.status} ${r.body?.message}`);
    }
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/modele`, cabinet.tok, { prefixeFournisseur: 'F', chiffres: 4 });
    check('modèle remis à F + 4 : prochain F0009 (F0008 est le plus grand), les codes attribués n\'ont pas changé', r.status === 200 && r.body?.modele?.prochain?.fournisseur === 'F0009' && r.body?.nb?.fournisseur?.total === 4, JSON.stringify(r.body?.modele));

    // ── Un compte collectif porté ne bouge plus dans le plan ; un code de retenue désactivé reste sur le tiers ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c4011.id}/desactiver`, cabinet.tok);
    check('plan : désactiver 4011, porté par F0008 et FR00001 : 409 COMPTE_UTILISE', r.status === 409 && r.body?.code === 'COMPTE_UTILISE' && /tiers/.test(r.body?.message || ''), `${r.status} ${r.body?.code} ${r.body?.message}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${c4111.id}/desactiver`, cabinet.tok);
    check('plan : désactiver 4111, porté par C0001 : 409 COMPTE_UTILISE', r.status === 409 && r.body?.code === 'COMPTE_UTILISE', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/${rsMar15.id}/desactiver`, cabinet.tok);
    check('taxes : désactiver RS_MAR15, retenue par défaut de F0008 : permis (200)', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?q=F0008`, cabinet.tok);
    check('… F0008 garde RS_MAR15, marqué inactif ; la liste des retenues le classe après les actives', tiersDe(r.body, 'F0008')?.retenue?.code === 'RS_MAR15' && tiersDe(r.body, 'F0008')?.retenue?.actif === false && r.body?.retenues?.find((x) => x.code === 'RS_MAR15')?.actif === false && r.body.retenues[0].actif === true, JSON.stringify(tiersDe(r.body, 'F0008')?.retenue));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'x', retenueId: rsMar15.id });
    check('… un nouveau tiers ne peut pas prendre RS_MAR15 : 409 TAXE_DESACTIVEE', r.status === 409 && r.body?.code === 'TAXE_DESACTIVEE', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/taxes/${rsMar15.id}/reactiver`, cabinet.tok);
    check('taxes : RS_MAR15 réactivé', r.status === 200, String(r.status));

    // ── Import Excel des tiers (D18 : tout ou rien) ──
    let dl = await telecharger(`/api/compta/dossiers/${A.id}/tiers/modele-import?type=fournisseur`, saisie.tok);
    let ws = dl.status === 200 ? await lireClasseur(dl.buffer) : null;
    check('modèle d\'import des fournisseurs : classeur à la charte, en-têtes exacts, ligne d\'exemple « Exemple : F0001 », colonnes en texte', dl.status === 200 && dl.type.includes('spreadsheetml') && /modele-fournisseurs-/.test(dl.disposition) && !!ws && findHeaderRow(ws, EN_TETES_TIERS) !== null
      && String(ws.getRow(findHeaderRow(ws, EN_TETES_TIERS) + 1).getCell(1).text).startsWith('Exemple : F0001') && ws.getColumn(1).numFmt === '@', `${dl.status} ${dl.type} ${dl.disposition}`);
    const modeleF = dl.buffer;
    let fichier = await depuisModele(modeleF, [
      ['', 'Import Un', '1111111A/A/M/000', '2 rue des Oliviers', 'Sfax', '74 111 111', 'un@essai.tn', '', 'Assujetti', 'RS_HON10', '30'],
      ['IMP02', 'Import Deux', '', '', '', '', '', '404', 'Exonéré', '', ''],
      ['imp03', 'Import Trois', '1234567A/A/M/000', '', 'Tunis', '', '', '4011', 'non assujetti', '', '0'],
    ]);
    r = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, complet.tok, fichier, { type: 'fournisseur' });
    check('import de 3 fournisseurs depuis le modèle : 201, 1 code généré, 7 fournisseurs, avertissement « déjà porté » (1234567A)', r.status === 201 && r.body?.importes === 3 && r.body?.codesGeneres === 1 && r.body?.nb?.fournisseur?.total === 7 && r.body?.avertissements?.some((a) => /déjà porté/.test(a)), `${r.status} ${r.body?.message || ''} ${JSON.stringify(r.body?.avertissements)}`);
    j = await journal(espaceId, 'tiers_importes');
    check('journal : tiers_importes (type, nombre, codes générés, fichier)', !!j && j.details?.type === 'fournisseur' && j.details?.nombre === 3 && j.details?.codesGeneres === 1 && j.details?.fichier === 'essai.xlsx' && j.auteur_id === complet.id, JSON.stringify(j?.details));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?q=Import`, cabinet.tok);
    const un = r.body?.tiers?.find((x) => x.nom === 'Import Un');
    const deux = tiersDe(r.body, 'IMP02');
    const trois = tiersDe(r.body, 'IMP03');
    check('… Import Un : F0009 généré, 4011 par défaut, RS_HON10, 30 jours, origine import ; IMP02 : 404, exonéré, comptant ; IMP03 : non assujetti',
      r.body?.total === 3 && un?.code === 'F0009' && un?.compte?.numero === '4011' && un?.retenue?.code === 'RS_HON10' && un?.delaiPaiement === 30 && un?.origine === 'import' && un?.matriculeFiscal === '1111111A/A/M/000'
      && deux?.compte?.numero === '404' && deux?.regimeTva === 'exonere' && deux?.delaiPaiement === 0 && trois?.regimeTva === 'non_assujetti' && trois?.ville === 'Tunis', `${codes(r.body)} ${JSON.stringify(un)}`);
    // Une ligne fausse : rien n'est écrit, rapport ligne par ligne.
    const enTete = findHeaderRow(ws, EN_TETES_TIERS);
    fichier = await depuisModele(modeleF, [
      ['IMP02', 'Doublon du dossier', '', '', '', '', 'pas-un-email', '', '', '', ''],
      ['', 'Ligne correcte', '', '', '', '', '', '', '', '', ''],
      ['IMP09', 'Mauvais choix', '', '', '', '', '', '5321', 'réel', 'RS_X', '999'],
      ['IMP10', 'Code en double', '', '', '', '', '', '', '', '', ''],
      ['imp10', 'Code en double bis', '', '', '', '', '', '', '', '', ''],
    ]);
    r = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, complet.tok, fichier, { type: 'fournisseur' });
    const lignes = r.body?.lignes || [];
    check('fichier avec 3 lignes fausses sur 5 : 400 IMPORT_ERREURS, rapport ligne par ligne (numéros Excel), rien d\'importé', r.status === 400 && r.body?.code === 'IMPORT_ERREURS' && r.body?.nbLignes === 5 && r.body?.nbErreurs === 3 && lignes.length === 3
      && lignes[0].ligne === enTete + 2 && lignes[0].erreurs.some((e) => /déjà dans le dossier/.test(e)) && lignes[0].erreurs.some((e) => /Email invalide/.test(e))
      && lignes[1].ligne === enTete + 4 && lignes[1].erreurs.some((e) => /Compte collectif 5321/.test(e)) && lignes[1].erreurs.some((e) => /Régime de TVA inconnu/.test(e)) && lignes[1].erreurs.some((e) => /aucun code de retenue/.test(e)) && lignes[1].erreurs.some((e) => /Délai de paiement/.test(e))
      && lignes[2].ligne === enTete + 6 && lignes[2].erreurs.some((e) => /en double dans le fichier/.test(e)), `${r.status} ${r.body?.message} ${JSON.stringify(lignes)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok);
    check('… toujours 7 fournisseurs, « Ligne correcte » absente, prochain code intact (F0010)', r.body?.nb?.fournisseur?.total === 7 && !r.body.tiers.some((x) => x.nom === 'Ligne correcte') && r.body?.modele?.prochain?.fournisseur === 'F0010', `${r.body?.nb?.fournisseur?.total} ${r.body?.modele?.prochain?.fournisseur}`);
    // Refus avant toute lecture : droits, fichier, en-têtes, type, bornes.
    r = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, saisie.tok, await depuisModele(modeleF, [['', 'x', '', '', '', '', '', '', '', '', '']]), { type: 'fournisseur' });
    check('Saisie n\'importe pas : 403', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', `${r.status} ${r.body?.code}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, complet.tok, null, { type: 'fournisseur' });
    check('sans fichier : 400 FICHIER_REQUIS', r.status === 400 && r.body?.code === 'FICHIER_REQUIS', `${r.status} ${r.body?.code}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, complet.tok, await brut(EN_TETES_PLAN, [['5321', 'x', '']]), { type: 'fournisseur' });
    check('en-têtes du plan à la place de ceux des tiers : 400 EN_TETES', r.status === 400 && r.body?.code === 'EN_TETES', `${r.status} ${r.body?.code}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, complet.tok, Buffer.from('pas un classeur'), { type: 'fournisseur' });
    check('fichier qui n\'est pas un classeur : 400 FICHIER_ILLISIBLE', r.status === 400 && r.body?.code === 'FICHIER_ILLISIBLE', `${r.status} ${r.body?.code}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, complet.tok, await depuisModele(modeleF, [['', 'x', '', '', '', '', '', '', '', '', '']]));
    check('type absent : 400', r.status === 400, `${r.status} ${r.body?.message}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, complet.tok, await brut(EN_TETES_TIERS, []), { type: 'fournisseur' });
    check('aucune ligne sous les en-têtes : 400 AUCUNE_LIGNE', r.status === 400 && r.body?.code === 'AUCUNE_LIGNE', `${r.status} ${r.body?.code}`);
    r = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, complet.tok, await brut(EN_TETES_TIERS, Array.from({ length: 2001 }, (_, i) => ['', `Tiers ${i}`, '', '', '', '', '', '', '', '', ''])), { type: 'fournisseur' });
    check('2 001 lignes : 400 TROP_DE_LIGNES', r.status === 400 && r.body?.code === 'TROP_DE_LIGNES', `${r.status} ${r.body?.code}`);
    // Les clients, type passé dans l'adresse, classeur brut (en-têtes en ligne 1, sans bandeau) : accepté aussi.
    r = await televerser(`/api/compta/dossiers/${A.id}/tiers/import?type=client`, complet.tok, await brut(EN_TETES_TIERS, [['', 'Client importé', '', '', '', '', '', '', 'En suspension de TVA', '', '15']]));
    check('import d\'un client (type dans l\'adresse, classeur sans bandeau) : 201, C0002 généré, 4111, en suspension', r.status === 201 && r.body?.importes === 1 && r.body?.nb?.client?.total === 2 && r.body?.modele?.prochain?.client === 'C0003', `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers?type=client&q=C0002`, cabinet.tok);
    check('… C0002 : 4111, régime suspension, 15 jours, importé', tiersDe(r.body, 'C0002')?.compte?.numero === '4111' && tiersDe(r.body, 'C0002')?.regimeTva === 'suspension' && tiersDe(r.body, 'C0002')?.delaiPaiement === 15 && tiersDe(r.body, 'C0002')?.origine === 'import', JSON.stringify(tiersDe(r.body, 'C0002')));

    // ── Export Excel des tiers ──
    dl = await telecharger(`/api/compta/dossiers/${A.id}/tiers/export?type=fournisseur`, saisie.tok);
    ws = dl.status === 200 ? await lireClasseur(dl.buffer) : null;
    // S7b : six colonnes facultatives (régime fiscal, résidence, identifiant de secours) avant État et Origine.
    const FACULTATIFS_S7B = ['Régime fiscal', 'Résident', 'Type d\'identifiant', 'Numéro d\'identifiant', 'Date de naissance', 'Pays de l\'identifiant'];
    const enTeteExport = ws ? findHeaderRow(ws, [...EN_TETES_TIERS, ...FACULTATIFS_S7B, 'État', 'Origine']) : null;
    const nbExport = ws && enTeteExport ? ws.rowCount - enTeteExport - 1 : -1; // moins le pied de page
    check('export des fournisseurs : classeur à la charte, colonnes du modèle + État + Origine, 7 lignes, ALPHA1 en premier', dl.status === 200 && dl.type.includes('spreadsheetml') && /fournisseurs-/.test(dl.disposition) && enTeteExport !== null && nbExport >= 7
      && String(ws.getRow(enTeteExport + 1).getCell(1).text) === 'ALPHA1' && String(ws.getRow(enTeteExport + 1).getCell(18).text) === 'Actif', `${dl.status} ${enTeteExport} ${nbExport}`);
    dl = await telecharger(`/api/compta/dossiers/${A.id}/tiers/export?type=fournisseur`, client.tok);
    check('export par une personne étrangère : 404', dl.status === 404, String(dl.status));

    // ── Import Excel du plan de comptes (tout ou rien, renommer, ajouter sous le bon parent, re-rattacher) ──
    dl = await telecharger(`/api/compta/dossiers/${A.id}/plan/modele-import`, cabinet.tok);
    ws = dl.status === 200 ? await lireClasseur(dl.buffer) : null;
    check('modèle d\'import du plan : Numéro, Libellé, Nature ; exemple « Exemple : 53211 »', dl.status === 200 && !!ws && findHeaderRow(ws, EN_TETES_PLAN) !== null && String(ws.getRow(findHeaderRow(ws, EN_TETES_PLAN) + 1).getCell(1).text).startsWith('Exemple : 53211'), `${dl.status}`);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes`, cabinet.tok, { parentId: c5321.id, numero: '532131', libelle: 'STB - compte courant (créé avant l\'import)' });
    check('subdiviser 5321 → 532131 avant l\'import (sera re-rattaché sous 53213)', r.status === 201 && compte(r.body, '532131')?.parentId === c5321.id, `${r.status} ${r.body?.message || ''}`);
    fichier = await depuisModele(dl.buffer, [
      ['5321', 'Comptes en dinars (banques)', ''],
      ['53213', 'STB', 'Banque'],
      ['532132', 'STB - épargne', ''],
      ['4011', c4011.libelle, ''],
    ]);
    r = await televerser(`/api/compta/dossiers/${A.id}/plan/import`, complet.tok, fichier);
    let p = r.body;
    check('import du plan : 201, 1 renommé (5321), 2 ajoutés (53213, 532132), 1 inchangé (4011)', r.status === 201 && p?.importation?.renommes === 1 && p?.importation?.ajoutes === 2 && p?.importation?.inchanges === 1 && p?.importation?.nbLignes === 4 && p?.importation?.fichier === 'essai.xlsx', `${r.status} ${r.body?.message || ''} ${JSON.stringify(p?.importation)}`);
    check('… 5321 renommé (rétablissable), 53213 ajouté sous 5321 (nature banque, expliqué, actif), 532132 sous 53213, 532131 re-rattaché sous 53213',
      compte(p, '5321')?.libelle === 'Comptes en dinars (banques)' && compte(p, '5321')?.renomme === true && compte(p, '53213')?.origine === 'ajout' && compte(p, '53213')?.parentId === c5321.id && compte(p, '53213')?.nature === 'banque' && /Importé d'un autre logiciel le/.test(compte(p, '53213')?.explication || '') && compte(p, '53213')?.actif === true
      && compte(p, '532132')?.parentId === compte(p, '53213')?.id && compte(p, '532132')?.nature === 'banque' && compte(p, '532131')?.parentId === compte(p, '53213')?.id, JSON.stringify({ a: compte(p, '53213'), b: compte(p, '532131')?.parentId }));
    j = await journal(espaceId, 'plan_importe');
    check('journal : plan_importe (renommés, ajoutés, inchangés, numéros)', !!j && j.details?.renommes === 1 && j.details?.ajoutes === 2 && j.details?.comptesAjoutes?.join(',') === '53213,532132' && j.details?.comptesRenommes?.[0]?.numero === '5321' && j.auteur_id === complet.id, JSON.stringify(j?.details));
    r = await televerser(`/api/compta/dossiers/${A.id}/plan/import`, complet.tok, await depuisModele(dl.buffer, [['5411', 'Caisse renommée', ''], ['88', 'Classe 8', ''], ['1911', 'Sans parent (19 absent de la NC 01)', ''], ['53213', '', '']]));
    check('plan : fichier avec 3 lignes fausses : 400 IMPORT_ERREURS (classe 8, sans parent, libellé vide), rien d\'écrit', r.status === 400 && r.body?.code === 'IMPORT_ERREURS' && r.body?.nbErreurs === 3 && r.body?.lignes?.some((l) => /classe hors 1 à 7/.test(l.erreurs[0])) && r.body.lignes.some((l) => /aucun compte parent/.test(l.erreurs[0])) && r.body.lignes.some((l) => /Libellé obligatoire/.test(l.erreurs[0])), `${r.status} ${JSON.stringify(r.body?.lignes)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok);
    check('… 5411 n\'a pas été renommé', compte(r.body, '5411')?.libelle !== 'Caisse renommée' && compte(r.body, '5411')?.renomme === false, compte(r.body, '5411')?.libelle);
    r = await televerser(`/api/compta/dossiers/${A.id}/plan/import`, saisie.tok, await depuisModele(dl.buffer, [['5321', 'x', '']]));
    check('plan : Saisie n\'importe pas : 403', r.status === 403, String(r.status));
    r = await televerser(`/api/compta/dossiers/${A.id}/plan/import`, complet.tok, null);
    check('plan : sans fichier : 400 FICHIER_REQUIS', r.status === 400 && r.body?.code === 'FICHIER_REQUIS', `${r.status} ${r.body?.code}`);

    // ── Dossier archivé, comptabilité en lecture seule ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'x' });
    r2 = await appel('PUT', `/api/compta/dossiers/${A.id}/tiers/modele`, cabinet.tok, { chiffres: 5 });
    r3 = await televerser(`/api/compta/dossiers/${A.id}/tiers/import`, cabinet.tok, await depuisModele(modeleF, [['', 'x', '', '', '', '', '', '', '', '', '']]), { type: 'fournisseur' });
    check('dossier archivé : créer, modèle et import refusés (409 DOSSIER_ARCHIVE)', r.status === 409 && r.body?.code === 'DOSSIER_ARCHIVE' && r2.status === 409 && r3.status === 409 && r3.body?.code === 'DOSSIER_ARCHIVE', `${r.status} ${r2.status} ${r3.status}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok);
    check('… mais la liste se lit (dossier archivé dans la réponse)', r.status === 200 && r.body?.dossier?.etat === 'archive', String(r.status));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/desarchiver`, cabinet.tok);
    await mode(cabinet.id, 'read_only');
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'x' });
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok);
    check('comptabilité en lecture seule : 403 READ_ONLY ; la liste se lit (lecture_seule)', r.status === 403 && r.body?.code === 'READ_ONLY' && r2.status === 200 && r2.body?.etatAbonnement === 'lecture_seule', `${r.status} ${r.body?.code}`);
    await mode(cabinet.id, 'actif');

    // ── « Mon entreprise » du client : le client (titulaire) configure ses tiers ──
    r = await appel('GET', `/api/compta/dossiers/${dossierClient?.id}/tiers`, client.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${dossierClient?.id}/tiers`, client.tok, { type: 'fournisseur', nom: 'Fournisseur du client' });
    check('« Mon entreprise » du client : la page se lit (droits tiers et configurer), un fournisseur F0001 se crée', r.status === 200 && r.body?.dossier?.source === 'labflow' && r.body?.droits?.tiers === true && r.body?.droits?.configurer === true && r2.status === 201 && r2.body?.tiers?.code === 'F0001', `${r.status} ${r2.status} ${r2.body?.message || ''}`);

    // ── La fiche de A résume les tiers ; rejeu de la migration 214 ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, cabinet.tok);
    check('fiche de A : 7 fournisseurs actifs, 2 clients', r.status === 200 && r.body?.tiers?.fournisseurs?.nbActifs === 7 && r.body?.tiers?.fournisseurs?.nbTotal === 7 && r.body?.tiers?.clients?.nbTotal === 2, JSON.stringify(r.body?.tiers));
    await pool.query(`DELETE FROM _migrations WHERE filename = '214_compta_tiers.sql'`);
    await require('../src/config/migrate')();
    const manuel = (await pool.query(`SELECT slug, contenu_defaut FROM manuel_sections WHERE slug IN ('compta-tiers', 'compta-dossier', 'compta-plan-comptes', 'compta-taxes', 'compta-dossiers') AND produit = 'compta'`)).rows;
    const texte = (slug) => manuel.find((m) => m.slug === slug)?.contenu_defaut || '';
    check('migration 214 rejouée sans erreur (tables, colonnes et manuel idempotents) ; A intact (7 fournisseurs)', (await pool.query(`SELECT 1 FROM _migrations WHERE filename = '214_compta_tiers.sql'`)).rows.length === 1
      && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.tiers WHERE dossier_id = $1 AND type = $2', [A.id, 'fournisseur'])).rows[0].n === 7);
    check('manuel : fiche « Tiers » présente ; « Fiche du dossier », « Dossiers », « Plan de comptes » et « Taxes » complétées (plus d\'« étape suivante »)', /## 📇 Tiers/.test(texte('compta-tiers')) && /ses \*\*tiers\*\*/.test(texte('compta-dossier')) && /fiche \*\*Tiers\*\*/.test(texte('compta-dossiers'))
      && /un code de taxe ou un tiers/.test(texte('compta-plan-comptes')) && /page \*\*Tiers\*\*/.test(texte('compta-taxes')) && !manuel.some((m) => /étape suivante/.test(m.contenu_defaut)), manuel.map((m) => m.slug).join(','));

    // ── Suppression d'un dossier vide : ses tiers partent avec lui ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: { raisonSociale: 'Pâtisserie Forfait S5c', formeJuridique: 'EI' }, regime: FORFAIT, exercice: CIVIL });
    const B = r.body;
    r = await appel('POST', `/api/compta/dossiers/${B.id}/tiers`, cabinet.tok, { type: 'client', nom: 'Client de B' });
    check('dossier B (forfaitaire) : un client C0001 (les retenues existent, la TVA non)', r.status === 201 && r.body?.tiers?.code === 'C0001' && r.body?.tiers?.compte?.numero === '4111', `${r.status} ${r.body?.message || ''}`);
    r = await appel('DELETE', `/api/compta/dossiers/${B.id}`, cabinet.tok);
    const restes = (await pool.query('SELECT (SELECT COUNT(*) FROM compta.tiers WHERE dossier_id = $1)::int AS t, (SELECT COUNT(*) FROM compta.comptes WHERE dossier_id = $1)::int AS c', [B.id])).rows[0];
    check('supprimer le dossier B : tiers et plan partent avec lui (cascade)', r.status === 204 && restes.t === 0 && restes.c === 0, `${r.status} ${JSON.stringify(restes)}`);

    // ── Les pages d'avant ne changent pas ──
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok);
    check('liste des dossiers inchangée (1 dossier)', r.status === 200 && r.body?.dossiers?.length === 1, String(r.body?.dossiers?.length));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, saisie.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/taxes`, saisie.tok);
    check('journaux et taxes de A lisibles, inchangés (6 journaux, 20 codes)', r.status === 200 && r.body?.journaux?.length === 6 && r2.status === 200 && r2.body?.taxes?.length === 20, `${r.body?.journaux?.length} ${r2.body?.taxes?.length}`);
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
