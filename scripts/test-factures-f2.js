/* Test E2E local — factures fournisseur, étape F2 (labflow-reprise/achats-compta/PLAN-FACTURES.md) : le fournisseur
 * reconnu.
 *   POST|PUT /api/entreprise/fournisseurs[/:id]         identité légale (raison sociale, matricule, email, ville)
 *   PATCH /api/entreprise/fournisseurs/:id/identite     complément d'une fiche par ce qu'une facture a appris
 *   POST  /api/entreprise/fournisseurs/:id/lier         rattachement à une activité ou à un labo
 *   DELETE /api/entreprise/fournisseurs/:id             garde : fournisseur cité ⇒ 409
 *   GET|POST /api/entreprise/fournisseurs/template|import   colonnes Ville, Matricule fiscal, Email
 *   POST /api/appros/facture                            timbre 1 / 1,5 / 2 D, lecture gardée sur la facture
 * Crée un super_admin + 1 client (2 activités, 1 labo, 1 gérant sur une seule activité) temporaires, puis nettoie (API
 * admin). SQL direct : activation des comptes d'essai, fournisseur d'un AUTRE compte, contrôles en base. Données
 * fictives (matricules inventés, à clé cohérente).
 * ⚠️ Serveur d'essai : « node scripts/start-test-backend.js » (PORT=3100 par défaut ici : BASE_URL pour changer). */
require('./lib/bouchons-test').installer();
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const pool = require('../src/config/database');

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const MDP = crypto.randomBytes(18).toString('base64url');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const approx = (a, b, eps = 0.0005) => Math.abs(Number(a) - Number(b)) <= eps;
const aujourdhui = new Date().toISOString().slice(0, 10);

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
const envoi = async (chemin, jeton, donnees) => {
  const fd = new FormData();
  fd.append('donnees', JSON.stringify(donnees));
  const r = await fetch(`${BASE}${chemin}`, { method: 'POST', headers: { Authorization: `Bearer ${jeton}` }, body: fd });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const importer = async (jeton, tampon) => {
  const fd = new FormData();
  fd.append('file', new Blob([tampon], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'fournisseurs.xlsx');
  const r = await fetch(`${BASE}/api/entreprise/fournisseurs/import`, { method: 'POST', headers: { Authorization: `Bearer ${jeton}` }, body: fd });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const classeur = async (entetes, lignes) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Fournisseurs');
  ws.addRow(entetes);
  for (const l of lignes) ws.addRow(l);
  return Buffer.from(await wb.xlsx.writeBuffer());
};
const login = async (email) => (await appel('POST', '/auth/login', null, { email, password: MDP })).body?.token;

// Matricules fictifs à clé cohérente (même calcul que la lecture des écrans).
const ALPHABET_CLE = 'ABCDEFGHJKLMNPQRSTVWXYZ';
const mf = (id, fin = '/A/M/000') => `${id}${ALPHABET_CLE[[...id].reduce((s, c, i) => s + Number(c) * (7 - i), 0) % 23]}${fin}`;
const MF1 = mf('1384297'), MF2 = mf('0897514', '/B/M/000'), MF3 = mf('1559041'), MF4 = mf('1103587'), MF5 = mf('1720368', '/N/P/000');

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-f2@example.com';
  const CLIENT = 'test-f2-client@example.com';
  const GERANT = 'test-f2-gerant@example.com';
  let adminTok = null;
  let adminId = null;
  const etrangers = { fournisseur: null };
  const supprimerComptes = async () => {
    const restes = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows;
    for (const { id } of restes) if (adminTok) await appel('DELETE', `/admin/clients/${id}`, adminTok);
    if (etrangers.fournisseur) await pool.query('DELETE FROM fournisseurs WHERE id = $1', [etrangers.fournisseur]);
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [[GERANT, CLIENT, ADMIN]]);
  };

  try {
    // ── 0. Préparation ─────────────────────────────────────────────────────────────────────────────────────────────
    const adminExistant = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [ADMIN])).rows[0];
    if (adminExistant) await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, actif = true WHERE id = $2', [hash, adminExistant.id]);
    else await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminF2', $1, $2, 'super_admin', true)`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    adminId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [ADMIN])).rows[0].id;
    check('login super_admin temporaire', !!adminTok);
    {
      const restes = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows;
      for (const { id } of restes) await appel('DELETE', `/admin/clients/${id}`, adminTok);
      await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [[GERANT, CLIENT]]);
    }
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST-F2 Contact', email: CLIENT, telephone: '20778851', nbActivites: 2, nbLabos: 1, nbGerants: 1, montantOnboarding: 0 });
    check('création du client (2 activités, 1 labo, 1 gérant)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0].id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const tok = await login(CLIENT);
    check('login du client', !!tok);
    r = await appel('GET', '/api/unites', tok);
    let kg = (r.body || []).find((u) => (u.name || u.nom) === 'kg');
    if (!kg) kg = (await appel('POST', '/api/unites', tok, { name: 'kg' })).body;
    const fam = (await appel('POST', '/api/familles', tok, { name: 'Famille F2' })).body;
    const cat = (await appel('POST', '/api/categories', tok, { name: 'Catégorie F2', familleId: fam?.id })).body;
    const art1 = (await appel('POST', '/api/articles', tok, { name: 'Farine F2', unitId: kg?.id, categorieId: cat?.id })).body;
    const actA = (await appel('POST', '/api/entreprise/activites', tok, { nom: 'Restaurant F2' })).body;
    const actB = (await appel('POST', '/api/entreprise/activites', tok, { nom: 'Snack F2' })).body;
    const labo = (await appel('POST', '/api/labo', tok, { nom: 'Cuisine F2', refLabo: 'CF2' })).body;
    await appel('POST', `/api/entreprise/activites/${actA?.id}/ingredients/${art1?.id}/select`, tok, {});
    await appel('POST', `/api/labo/${labo?.id}/ingredients/${art1?.id}/select`, tok, {});
    r = await appel('POST', '/api/abonnements/gerants', tok, { nom: 'TEST-Gérant F2', telephone: '20778852', email: GERANT, activiteIds: [actA.id] });
    const gerantId = r.body?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, gerantId]);
    const gTok = await login(GERANT);
    check('préparation : article, 2 activités, 1 labo, gérant de l\'activité A', !!(art1?.id && actA?.id && actB?.id && labo?.id && gTok));
    etrangers.fournisseur = (await pool.query(`INSERT INTO fournisseurs (nom, client_id) VALUES ('Fournisseur d''un autre compte F2', $1) RETURNING id`, [adminId])).rows[0].id;
    const fiche = async (id) => (await pool.query('SELECT * FROM fournisseurs WHERE id = $1', [id])).rows[0];

    // ── 1. Fiche avec identité légale ───────────────────────────────────────────────────────────────────────────────
    r = await appel('POST', '/api/entreprise/fournisseurs', tok, {
      nom: '  SMDA  ', raisonSociale: 'Société Méditerranéenne de Distribution Alimentaire', matriculeFiscal: `m.f. : ${MF1.toLowerCase().replace(/\//g, ' ')}`,
      email: 'commandes@smda-exemple.tn', ville: 'Tunis', telephone: '71 940 225', adresse: 'Charguia II', activiteIds: [actA.id],
    });
    const f1 = r.body?.id;
    check('1. création avec identité : 201, nom rogné, matricule normalisé (libellé retiré)', r.status === 201 && r.body.nom === 'SMDA' && r.body.matriculeFiscal === MF1 && r.body.raisonSociale?.startsWith('Société') && r.body.ville === 'Tunis',
      `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'Mauvais', matriculeFiscal: '123456A' });
    check('1. matricule à 6 chiffres → 400 MATRICULE_INVALIDE (zéro de tête)', r.status === 400 && r.body?.code === 'MATRICULE_INVALIDE' && /zéro/.test(r.body.message), `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'Mauvais', email: 'pas-un-email' });
    check('1. email invalide → 400 EMAIL_INVALIDE', r.status === 400 && r.body?.code === 'EMAIL_INVALIDE', `${r.status}`);
    r = await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'Mauvais', ville: 'x'.repeat(101) });
    check('1. ville de 101 caractères → 400 TROP_LONG (avant : erreur serveur)', r.status === 400 && r.body?.code === 'TROP_LONG', `${r.status}`);
    r = await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: '   ' });
    check('1. nom vide → 400 NOM_REQUIS', r.status === 400 && r.body?.code === 'NOM_REQUIS', `${r.status}`);
    r = await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'Doublon', matriculeFiscal: MF1 });
    check('1. matricule déjà porté → 409 MATRICULE_EXISTANT, avec le fournisseur à choisir', r.status === 409 && r.body?.code === 'MATRICULE_EXISTANT' && r.body.fournisseur?.id === f1 && r.body.fournisseur.nom === 'SMDA', `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'Ben Salem', matriculeFiscal: MF2, activiteIds: [actA.id, actB.id], laboIds: [labo.id] });
    const f2 = r.body?.id;
    check('1. deuxième fournisseur (activités A et B, labo)', r.status === 201 && !!f2, `${r.status}`);
    {
      const [x, y] = await Promise.all([1, 2].map((n) => appel('POST', '/api/entreprise/fournisseurs', tok, { nom: `Course ${n}`, matriculeFiscal: MF3 })));
      const statuts = [x.status, y.status].sort().join(',');
      const n = (await pool.query('SELECT COUNT(*)::int AS n FROM fournisseurs WHERE matricule_fiscal = $1 AND entreprise_id = (SELECT id FROM profil_entreprise WHERE client_id = $2)', [MF3, clientId])).rows[0].n;
      check('1. deux créations simultanées du même matricule : un 201, un 409, une seule fiche', statuts === '201,409' && n === 1, `${statuts} n=${n}`);
    }

    // ── 2. Modification, complément, rattachement ────────────────────────────────────────────────────────────────────
    r = await appel('PUT', `/api/entreprise/fournisseurs/${f1}`, tok, { nom: 'SMDA', matriculeFiscal: MF1, ville: 'La Charguia', activiteIds: [actA.id] });
    let F = await fiche(f1);
    check('2. PUT avec son propre matricule → 200 ; champs absents du corps remis à vide (fiche entière)', r.status === 200 && F.ville === 'La Charguia' && F.email === null && F.matricule_fiscal === MF1, `${r.status} ${JSON.stringify(F)}`);
    r = await appel('PUT', `/api/entreprise/fournisseurs/${f2}`, tok, { nom: 'Ben Salem', matriculeFiscal: MF1, activiteIds: [actA.id] });
    check('2. PUT avec le matricule d\'un autre → 409 MATRICULE_EXISTANT', r.status === 409 && r.body?.code === 'MATRICULE_EXISTANT' && r.body.fournisseur?.id === f1, `${r.status}`);
    r = await appel('PATCH', `/api/entreprise/fournisseurs/${f1}/identite`, tok, { email: 'compta@smda-exemple.tn' });
    F = await fiche(f1);
    check('2. PATCH identite { email } : seul l\'email change', r.status === 200 && F.email === 'compta@smda-exemple.tn' && F.ville === 'La Charguia' && F.matricule_fiscal === MF1 && r.body?.email === F.email, `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('PATCH', `/api/entreprise/fournisseurs/${f2}/identite`, tok, { matriculeFiscal: MF1 });
    check('2. PATCH identite avec le matricule d\'un autre → 409', r.status === 409 && r.body?.code === 'MATRICULE_EXISTANT', `${r.status}`);
    r = await appel('PATCH', `/api/entreprise/fournisseurs/${f2}/identite`, tok, {});
    check('2. PATCH identite vide → 400 RIEN_A_ECRIRE', r.status === 400 && r.body?.code === 'RIEN_A_ECRIRE', `${r.status}`);
    r = await appel('PATCH', `/api/entreprise/fournisseurs/${f2}/identite`, tok, { nom: '' });
    check('2. PATCH identite { nom: "" } → 400 NOM_REQUIS (le nom ne s\'efface pas)', r.status === 400 && r.body?.code === 'NOM_REQUIS', `${r.status}`);
    r = await appel('PATCH', '/api/entreprise/fournisseurs/abc/identite', tok, { email: 'a@b.tn' });
    const r2 = await appel('PATCH', `/api/entreprise/fournisseurs/${etrangers.fournisseur}/identite`, tok, { email: 'a@b.tn' });
    check('2. PATCH : identifiant non numérique → 404 (avant : erreur serveur) ; fournisseur d\'un autre compte → 404', r.status === 404 && r2.status === 404, `${r.status} ${r2.status}`);
    r = await appel('GET', `/api/entreprise/activites/${actB.id}/fournisseurs`, tok);
    const avantLien = (r.body || []).some((f) => f.id === f1);
    r = await appel('POST', `/api/entreprise/fournisseurs/${f1}/lier`, tok, { activiteId: actB.id });
    const apres = await appel('GET', `/api/entreprise/activites/${actB.id}/fournisseurs`, tok);
    const vu = (apres.body || []).find((f) => f.id === f1);
    check('2. lier à l\'activité B → 200 ; proposé ensuite sur B, avec son matricule', !avantLien && r.status === 200 && vu?.matriculeFiscal === MF1 && vu?.raisonSociale === null, `${r.status} ${JSON.stringify(vu)}`);
    r = await appel('POST', `/api/entreprise/fournisseurs/${f1}/lier`, tok, { laboId: labo.id });
    const lienLabo = (await pool.query('SELECT 1 FROM fournisseur_labos WHERE fournisseur_id = $1 AND labo_id = $2', [f1, labo.id])).rows.length;
    check('2. lier au labo → 200, rattaché', r.status === 200 && lienLabo === 1, `${r.status}`);
    r = await appel('POST', `/api/entreprise/fournisseurs/${f1}/lier`, tok, { activiteId: actA.id, laboId: labo.id });
    const r3 = await appel('POST', `/api/entreprise/fournisseurs/${f1}/lier`, tok, { activiteId: 999999999 });
    check('2. lier à deux cibles → 400 ; à une activité inconnue → 404', r.status === 400 && r3.status === 404, `${r.status} ${r3.status}`);

    // ── 3. Gérant ─────────────────────────────────────────────────────────────────────────────────────────────────────
    const nbAvant = (await pool.query('SELECT COUNT(*)::int AS n FROM fournisseurs WHERE entreprise_id = (SELECT id FROM profil_entreprise WHERE client_id = $1)', [clientId])).rows[0].n;
    r = await appel('POST', '/api/entreprise/fournisseurs', gTok, { nom: 'Hors périmètre', activiteIds: [actB.id] });
    const nbApres = (await pool.query('SELECT COUNT(*)::int AS n FROM fournisseurs WHERE entreprise_id = (SELECT id FROM profil_entreprise WHERE client_id = $1)', [clientId])).rows[0].n;
    check('3. gérant, création sur une activité hors périmètre → 403, AUCUNE fiche écrite', r.status === 403 && r.body?.code === 'HORS_PERIMETRE' && nbAvant === nbApres, `${r.status} ${nbAvant}/${nbApres}`);
    r = await appel('POST', '/api/entreprise/fournisseurs', gTok, { nom: 'Primeurs du gérant', matriculeFiscal: MF4, activiteIds: [actA.id] });
    const fG = r.body?.id;
    check('3. gérant, création sur son activité avec matricule → 201', r.status === 201 && r.body.matriculeFiscal === MF4, `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('PUT', `/api/entreprise/fournisseurs/${f2}`, gTok, { nom: 'Ben Salem Frères', matriculeFiscal: MF2, activiteIds: [actA.id] });
    const liensF2 = (await pool.query('SELECT activite_id FROM fournisseur_activites WHERE fournisseur_id = $1 ORDER BY activite_id', [f2])).rows.map((x) => x.activite_id);
    const laboF2 = (await pool.query('SELECT 1 FROM fournisseur_labos WHERE fournisseur_id = $1', [f2])).rows.length;
    check('3. gérant, modification : les affectations hors de son périmètre (activité B, labo) sont GARDÉES', r.status === 200 && liensF2.includes(actA.id) && liensF2.includes(actB.id) && laboF2 === 1, `${r.status} ${JSON.stringify(liensF2)} labo=${laboF2}`);
    r = await appel('POST', `/api/entreprise/fournisseurs/${fG}/lier`, gTok, { activiteId: actB.id });
    check('3. gérant, rattacher à une activité hors périmètre → 403', r.status === 403 && r.body?.code === 'HORS_PERIMETRE', `${r.status}`);
    r = await appel('PATCH', `/api/entreprise/fournisseurs/${fG}/identite`, gTok, { ville: 'Ariana' });
    check('3. gérant, compléter un fournisseur de son activité → 200', r.status === 200 && r.body?.ville === 'Ariana', `${r.status}`);

    // ── 4. Liste et garde de suppression ──────────────────────────────────────────────────────────────────────────────
    r = await appel('GET', '/api/entreprise/fournisseurs', tok);
    const l1 = (r.body || []).find((f) => f.id === f1);
    check('4. liste : identité exposée (matricule, raison sociale, email, ville)', l1?.matriculeFiscal === MF1 && l1.email === 'compta@smda-exemple.tn' && l1.ville === 'La Charguia' && l1.hasAppros === false, JSON.stringify(l1));
    // Appro au labo seulement : avant F2, le fournisseur restait supprimable (seules les activités comptaient).
    r = await appel('PUT', `/api/labo/${labo.id}/stock/${art1.id}`, tok, { quantite: 2, prixUnitaire: 3, dateAppro: aujourdhui, fournisseurId: f2, refFacture: 'LAB-1', tauxTva: 19 });
    const approLabo = r.status;
    r = await appel('GET', '/api/entreprise/fournisseurs', tok);
    const l2 = (r.body || []).find((f) => f.id === f2);
    const del2 = await appel('DELETE', `/api/entreprise/fournisseurs/${f2}`, tok);
    check('4. fournisseur cité par une appro de LABO seulement : hasAppros vrai, DELETE → 409 FOURNISSEUR_UTILISE', [200, 201].includes(approLabo) && l2?.hasAppros === true && del2.status === 409 && del2.body?.code === 'FOURNISSEUR_UTILISE' && !!(await fiche(f2)),
      `${approLabo} ${l2?.hasAppros} ${del2.status} ${JSON.stringify(del2.body)}`);
    r = await appel('DELETE', `/api/entreprise/fournisseurs/${fG}`, tok);
    check('4. fournisseur jamais cité → supprimé (200)', r.status === 200 && !(await fiche(fG)), `${r.status}`);
    r = await appel('DELETE', '/api/entreprise/fournisseurs/12abc', tok);
    check('4. DELETE identifiant non numérique → 404', r.status === 404, `${r.status}`);

    // ── 5. Import Excel ─────────────────────────────────────────────────────────────────────────────────────────────
    r = await fetch(`${BASE}/api/entreprise/fournisseurs/template`, { headers: { Authorization: `Bearer ${tok}` } });
    const wbM = new ExcelJS.Workbook();
    await wbM.xlsx.load(Buffer.from(await r.arrayBuffer()));
    const entetes = [];
    wbM.worksheets[0].eachRow((row) => { const v = row.values.slice(1).map(String); if (v[0] === 'Nom') entetes.push(...v); });
    check('5. modèle : 6 colonnes (Nom, Téléphone, Adresse, Ville, Matricule fiscal, Email)', entetes.join('|') === 'Nom|Téléphone|Adresse|Ville|Matricule fiscal|Email', entetes.join('|'));
    r = await importer(tok, await classeur(entetes, [
      ['El Amen', '71 334 902', '8, rue de Marseille', 'Tunis', MF5.replace(/\//g, ''), 'elamen@exemple.tn'],
      ['Mauvais MF', '', '', '', '12345', ''],
      ['Matricule déjà pris', '', '', '', MF1, ''],
      ['Mauvais email', '', '', '', '', 'pas-un-email'],
    ]));
    const imp = (await pool.query(`SELECT * FROM fournisseurs WHERE nom = 'El Amen' AND entreprise_id = (SELECT id FROM profil_entreprise WHERE client_id = $1)`, [clientId])).rows[0];
    check('5. import : 1 créé (matricule normalisé, ville, email), 3 refus expliqués', r.status === 200 && r.body?.processed === 1 && r.body.errors === 3 && imp?.matricule_fiscal === MF5 && imp.ville === 'Tunis' && imp.email === 'elamen@exemple.tn',
      `${r.status} ${JSON.stringify(r.body)}`);
    r = await importer(tok, await classeur(['Nom', 'Téléphone', 'Adresse'], [['Ancien modèle', '71 000 000', 'Sfax']]));
    check('5. ancien modèle à 3 colonnes : toujours accepté', r.status === 200 && r.body?.processed === 1, `${r.status} ${JSON.stringify(r.body)}`);

    // ── 6. Facture : montant du timbre, lecture gardée ──────────────────────────────────────────────────────────────
    const donnees = (m = {}) => ({
      cible: { type: 'activite', id: actA.id }, dateAppro: aujourdhui, fournisseurId: f1, refFacture: 'HYPER-1', timbreFiscal: true,
      lignes: [{ articleId: art1.id, quantite: 10, prixUnitaire: 8, tauxTva: 19 }], ...m,
    });
    r = await envoi('/api/appros/facture', tok, donnees({ timbreMontant: 1.5, lecture: {
      source: 'ocr', matricule: MF1, nom: 'SOCIÉTÉ MÉDITERRANÉENNE', numero: 'HYPER-1', date: aujourdhui, fournisseur: 'reconnu', duree: 2.4,
      totaux: { ht: 80, tva: 15.2, timbre: 1.5, ttc: 96.7, inconnu: 3 }, script: '<b>', autre: 'x'.repeat(5000),
    } }));
    const fac = (await pool.query('SELECT * FROM factures WHERE id = $1', [r.body?.factureId])).rows[0];
    check('6. timbre 1,5 D : montant_timbre 1,500, TTC = 80 + 15,2 + 1,5 = 96,700', r.status === 201 && approx(fac?.montant_timbre, 1.5) && approx(fac?.montant_ttc, 96.7), `${r.status} ${JSON.stringify(r.body)} ${fac?.montant_timbre} ${fac?.montant_ttc}`);
    const lecture = fac?.lecture;
    check('6. lecture gardée sur la facture : champs connus seulement', lecture?.source === 'ocr' && lecture.matricule === MF1 && lecture.fournisseur === 'reconnu' && lecture.totaux?.ttc === 96.7
      && !('inconnu' in (lecture.totaux || {})) && !('script' in lecture) && !('autre' in lecture), JSON.stringify(lecture));
    r = await envoi('/api/appros/facture', tok, donnees({ refFacture: 'T3', timbreMontant: 3 }));
    check('6. timbre de 3 D → 400 TIMBRE_INVALIDE', r.status === 400 && r.body?.code === 'TIMBRE_INVALIDE', `${r.status}`);
    r = await envoi('/api/appros/facture', tok, donnees({ refFacture: 'T-DEF', lecture: { source: 'scanner', matricule: MF1 } }));
    const facDef = (await pool.query('SELECT * FROM factures WHERE id = $1', [r.body?.factureId])).rows[0];
    check('6. sans montant : timbre 1 D ; lecture d\'une source inconnue → non gardée', r.status === 201 && approx(facDef?.montant_timbre, 1) && facDef?.lecture === null, `${r.status} ${facDef?.montant_timbre} ${JSON.stringify(facDef?.lecture)}`);
    r = await envoi('/api/appros/facture', tok, donnees({ refFacture: 'T-SANS', timbreFiscal: false, timbreMontant: 2 }));
    const facSans = (await pool.query('SELECT * FROM factures WHERE id = $1', [r.body?.factureId])).rows[0];
    check('6. sans timbre : montant ignoré (0)', r.status === 201 && facSans?.timbre_fiscal === false && approx(facSans?.montant_timbre, 0) && approx(facSans?.montant_ttc, 95.2), `${r.status} ${facSans?.montant_timbre}`);
    r = await appel('DELETE', `/api/entreprise/fournisseurs/${f1}`, tok);
    check('6. fournisseur d\'une facture → DELETE 409', r.status === 409 && r.body?.code === 'FOURNISSEUR_UTILISE', `${r.status}`);
  } catch (err) {
    console.error(err);
    check('exécution sans exception', false, err.message);
  } finally {
    await supprimerComptes().catch((e) => console.error('nettoyage :', e.message));
    const ko = results.filter((x) => !x.ok).length;
    console.log(`\n${results.length - ko}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ko ? 1 : 0);
  }
})();
