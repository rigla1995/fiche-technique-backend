/* Test E2E local — D3 « Code des articles par catégorie » (labflow-reprise/PLAN-DOMAINES-ACHETEURS-CODES.md §2 ligne D3 ;
 * réponses du client du 15/10 : par catégorie, attention à la confusion).
 *   catégories : préfixe proposé d'après le nom (FAR, FARI, FAR2), saisi (contrôlé : forme 400, réservé 409, pris 409),
 *     proposition exposée ; catégories de produits : même règle, unicité ENTRE les deux tables ;
 *   articles : code proposé PRÉFIXE-NNNN, saisi (normalisé, unique : 409), modifiable (vide = inchangé), gardé au changement
 *     de catégorie, proposition exposée, sans catégorie = ART ;
 *   produits : référence proposée d'après la catégorie de produits (ou PRD), unicité partagée avec les codes d'articles ;
 *   référentiel : modèle à 5 colonnes, import avec et sans code (code pris = ligne en erreur), export réimportable (Code) ;
 *   écrans : code dans la liste des articles du labo et dans son stock ; migration 248 rejouable.
 * Crée un super_admin et un client temporaires, puis nettoie. Données fictives.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');

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
const login = async (email) => (await appel('POST', '/auth/login', null, { email, password: MDP })).body?.token;
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const aujourdhui = new Date().toISOString().slice(0, 10);

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-d3@example.com';
  const CLIENT = 'test-d3-client@example.com';
  let adminTok = null;
  let clientId = null;
  const wipe = async () => {
    if (adminTok && clientId) await appel('DELETE', `/admin/clients/${clientId}`, adminTok);
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT]])).rows.map((r) => r.id);
    if (ids.length) {
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM profil_entreprise WHERE client_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [ids]);
    }
  };
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: await login(email) };
  };
  const classeur = async (tok, entetes, lignes) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Import');
    ws.addRow(entetes);
    for (const l of lignes) ws.addRow(l);
    const fd = new FormData();
    fd.append('file', new Blob([await wb.xlsx.writeBuffer()]), 'referentiel.xlsx');
    const rep = await fetch(`${BASE}/api/referentiel/import`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd });
    let body = null;
    try { body = await rep.json(); } catch (_) { /* corps vide */ }
    return { status: rep.status, body };
  };
  const lireClasseur = async (chemin, tok) => {
    const rep = await fetch(`${BASE}${chemin}`, { headers: { Authorization: `Bearer ${tok}` } });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await rep.arrayBuffer()));
    const ws = wb.worksheets[0];
    const lignes = [];
    ws.eachRow((row) => lignes.push([1, 2, 3, 4, 5].map((i) => String(row.getCell(i).text || '').trim())));
    return { status: rep.status, lignes };
  };

  try {
    const restes = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT]])).rows;
    if (restes.length) {
      await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin D3', $1, $2, 'super_admin', true, 0, NOW()) ON CONFLICT DO NOTHING`, [ADMIN, hash]);
      await pool.query('UPDATE utilisateurs SET mot_de_passe = $1 WHERE LOWER(email) = $2', [hash, ADMIN]);
      adminTok = await login(ADMIN);
      const c = (await pool.query(`SELECT id FROM utilisateurs WHERE LOWER(email) = $1 AND role = 'client'`, [CLIENT])).rows[0];
      if (c) await appel('DELETE', `/admin/clients/${c.id}`, adminTok);
      await wipe();
      adminTok = null;
    }
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin D3', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    check('connexion admin', !!adminTok);
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST D3 Boulangerie', email: CLIENT, telephone: '20 555 801', nbActivites: 1, nbLabos: 1, nbGerants: 0, formuleActivites: 'premium', montantOnboarding: 0 });
    check('client créé (1 activité Premium, 1 labo)', r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);
    const cli = await activer(CLIENT);
    clientId = cli.id;
    const tok = cli.tok;
    r = await appel('GET', '/api/unites', tok);
    let kg = (r.body || []).find((u) => (u.name || u.nom) === 'kg');
    if (!kg) kg = (await appel('POST', '/api/unites', tok, { name: 'kg' })).body;
    const fam = (await appel('POST', '/api/familles', tok, { name: 'Épicerie D3', consommable: true, vendable: true })).body;
    const act = (await appel('POST', '/api/entreprise/activites', tok, { nom: 'Boutique D3' })).body;
    const labo = (await appel('POST', '/api/labo', tok, { nom: 'Fournil D3', refLabo: 'FD3' })).body;
    check('préparation : unité, famille, activité, labo', !!kg?.id && !!fam?.id && !!act?.id && !!labo?.id);

    // ── 1. Catégories : préfixes ──
    const catFar = (await appel('POST', '/api/categories', tok, { name: 'Farines', familleId: fam.id })).body;
    const catFari = (await appel('POST', '/api/categories', tok, { name: 'Farines bio', familleId: fam.id })).body;
    const catFar2 = (await appel('POST', '/api/categories', tok, { name: 'Far', familleId: fam.id })).body;
    check('préfixes proposés d\'après le nom : Farines → FAR, Farines bio → FARI, Far → FAR2', catFar?.prefixeCode === 'FAR' && catFari?.prefixeCode === 'FARI' && catFar2?.prefixeCode === 'FAR2', JSON.stringify([catFar?.prefixeCode, catFari?.prefixeCode, catFar2?.prefixeCode]));
    const catSuc = (await appel('POST', '/api/categories', tok, { name: 'Sucres', familleId: fam.id, prefixeCode: ' suc ' })).body;
    r = await appel('POST', '/api/categories', tok, { name: 'Sel', familleId: fam.id, prefixeCode: 'FAR' });
    let r2 = await appel('POST', '/api/categories', tok, { name: 'Sel', familleId: fam.id, prefixeCode: 'ART' });
    let r3 = await appel('POST', '/api/categories', tok, { name: 'Sel', familleId: fam.id, prefixeCode: 'f' });
    check('préfixe saisi : normalisé (SUC) ; pris → 409 PREFIXE_EXISTANT ; réservé ART → 409 ; forme → 400', catSuc?.prefixeCode === 'SUC' && r.status === 409 && r.body?.code === 'PREFIXE_EXISTANT' && r2.status === 409 && r2.body?.code === 'PREFIXE_RESERVE' && r3.status === 400 && r3.body?.code === 'PREFIXE_INVALIDE', `${catSuc?.prefixeCode} ${r.status} ${r2.status} ${r3.status}`);
    r = await appel('GET', '/api/categories/prefixe-propose?nom=Sucres%20roux', tok);
    check('GET prefixe-propose : SUC pris → SUCR', r.status === 200 && r.body?.prefixe === 'SUCR', JSON.stringify(r.body));
    r = await appel('PUT', `/api/categories/${catFar2.id}`, tok, { name: 'Far', prefixeCode: 'FA' });
    check('PUT catégorie : préfixe changé (FA)', r.status === 200 && r.body?.prefixeCode === 'FA', `${r.status} ${r.body?.prefixeCode}`);
    r = await appel('GET', '/api/categories', tok);
    check('GET /api/categories : prefixeCode sur chaque catégorie', r.status === 200 && r.body.every((c) => typeof c.prefixeCode === 'string' && c.prefixeCode.length >= 2), JSON.stringify(r.body?.map((c) => c.prefixeCode)));
    // Catégories de produits : même règle, unicité entre les deux tables.
    const cpDes = (await appel('POST', '/api/categories-produit', tok, { name: 'Desserts', typeProduit: 'vendable' })).body;
    r = await appel('POST', '/api/categories-produit', tok, { name: 'Farces', typeProduit: 'vendable' });
    const cpFarc = r.body;
    r2 = await appel('PUT', `/api/categories-produit/${cpDes?.id}`, tok, { name: 'Desserts', typeProduit: 'vendable', prefixeCode: 'SUC' });
    check('catégorie de produits : Desserts → DES ; Farces → FARC (FAR pris par les articles) ; SUC refusé (pris par une catégorie d\'articles)', cpDes?.prefixeCode === 'DES' && cpFarc?.prefixeCode === 'FARC' && r2.status === 409 && r2.body?.code === 'PREFIXE_EXISTANT', `${cpDes?.prefixeCode} ${cpFarc?.prefixeCode} ${r2.status}`);

    // ── 2. Articles : codes ──
    const a1 = (await appel('POST', '/api/articles', tok, { name: 'Farine T55', unitId: kg.id, categorieId: catFar.id })).body;
    const a2 = (await appel('POST', '/api/articles', tok, { name: 'Farine T65', unitId: kg.id, categorieId: catFar.id })).body;
    const a3 = (await appel('POST', '/api/articles', tok, { name: 'Farine complète', unitId: kg.id, categorieId: catFar.id, code: ' far 0007 ' })).body;
    check('codes : proposés FAR-0001, FAR-0002 ; saisi normalisé FAR-0007', a1?.code === 'FAR-0001' && a2?.code === 'FAR-0002' && a3?.code === 'FAR-0007', JSON.stringify([a1?.code, a2?.code, a3?.code]));
    r = await appel('GET', `/api/articles/code-propose?categorieId=${catFar.id}`, tok);
    r2 = await appel('GET', '/api/articles/code-propose', tok);
    check('GET code-propose : FAR-0008 après le plus grand numéro ; sans catégorie ART-0001', r.body?.code === 'FAR-0008' && r2.body?.code === 'ART-0001', JSON.stringify([r.body, r2.body]));
    r = await appel('POST', '/api/articles', tok, { name: 'Doublon', unitId: kg.id, categorieId: catFar.id, code: 'far-0001' });
    r2 = await appel('POST', '/api/articles', tok, { name: 'Code court', unitId: kg.id, categorieId: catFar.id, code: 'X' });
    check('code pris → 409 CODE_EXISTANT ; forme → 400 CODE_INVALIDE', r.status === 409 && r.body?.code === 'CODE_EXISTANT' && r2.status === 400 && r2.body?.code === 'CODE_INVALIDE', `${r.status} ${r.body?.message} / ${r2.status}`);
    const sansCat = (await appel('POST', '/api/articles', tok, { name: 'Sans catégorie D3', unitId: kg.id })).body;
    check('article sans catégorie : code ART-0001', sansCat?.code === 'ART-0001', JSON.stringify(sansCat?.code));
    r = await appel('PUT', `/api/articles/${a1.id}`, tok, { name: 'Farine T55', unitId: kg.id, categorieId: catFar.id, code: 'FAR-0100' });
    r2 = await appel('PUT', `/api/articles/${a1.id}`, tok, { name: 'Farine T55', unitId: kg.id, categorieId: catFar.id, code: '' });
    r3 = await appel('PUT', `/api/articles/${a1.id}`, tok, { name: 'Farine T55', unitId: kg.id, categorieId: catSuc.id });
    check('PUT : code changé (FAR-0100) ; vide = inchangé ; changement de catégorie = code gardé', r.body?.code === 'FAR-0100' && r2.body?.code === 'FAR-0100' && r3.status === 200 && r3.body?.code === 'FAR-0100' && r3.body?.categorieId === catSuc.id, JSON.stringify([r.body?.code, r2.body?.code, r3.body?.code]));
    r = await appel('PUT', `/api/articles/${a2.id}`, tok, { name: 'Farine T65', unitId: kg.id, categorieId: catFar.id, code: 'FAR-0100' });
    check('PUT : code d\'un autre article → 409 CODE_EXISTANT', r.status === 409 && r.body?.code === 'CODE_EXISTANT', `${r.status}`);
    r = await appel('GET', '/api/articles', tok);
    check('GET /api/articles : code sur chaque article', r.status === 200 && r.body.every((a) => typeof a.code === 'string' && /^[A-Z0-9]+-\d{4}$/.test(a.code)), JSON.stringify(r.body?.map((a) => a.code)));

    // ── 3. Produits : référence proposée, unicité partagée ──
    await appel('POST', `/api/labo/${labo.id}/ingredients/${a2.id}/select`, tok, {});
    r = await appel('POST', '/api/produits', tok, { nom: 'Tarte D3', type: 'vendable', origine: 'labo', categorieProduitId: cpDes.id, laboIds: [labo.id], activiteIds: [act.id], ingredients: [{ ingredientId: a2.id, portion: 0.2 }], subProducts: [] });
    const p1 = r.body;
    r2 = await appel('GET', `/api/produits/ref-proposee?categorieProduitId=${cpDes.id}`, tok);
    check('produit sans référence : DES-0001 proposée et posée ; prochaine DES-0002', r.status === 201 && p1?.refProduit === 'DES-0001' && r2.body?.code === 'DES-0002', `${r.status} ${JSON.stringify(p1?.refProduit || r.body)} ${JSON.stringify(r2.body)}`);
    r = await appel('POST', '/api/produits', tok, { nom: 'Tarte doublon', type: 'vendable', origine: 'labo', categorieProduitId: cpDes.id, laboIds: [labo.id], activiteIds: [act.id], refProduit: 'far-0100', ingredients: [{ ingredientId: a2.id, portion: 0.2 }], subProducts: [] });
    check('produit avec la référence d\'un article → 409 CODE_EXISTANT (même espace de codes)', r.status === 409 && r.body?.code === 'CODE_EXISTANT', `${r.status} ${r.body?.code}`);

    // ── 4. Référentiel : modèle, import, export ──
    const modele = await lireClasseur('/api/referentiel/template', tok);
    const enTete = modele.lignes.find((l) => l[0] === 'Article');
    check('modèle d\'import : 5 en-têtes (… Famille, Code)', modele.status === 200 && egal(enTete, ['Article', 'Unité', 'Catégorie', 'Famille', 'Code']), JSON.stringify(enTete));
    r = await classeur(tok, ['Article', 'Unité', 'Catégorie', 'Famille', 'Code'], [
      ['Levure D3', 'kg', 'Farines', 'Épicerie D3', 'LEV-0500'],
      ['Sel fin D3', 'kg', 'Condiments D3', 'Épicerie D3', ''],
      ['Sel gros D3', 'kg', 'Condiments D3', 'Épicerie D3', 'FAR-0100'],
    ]);
    const importes = (await pool.query(`SELECT a.nom, a.code, c.prefixe_code FROM articles a LEFT JOIN categories c ON c.id = a.categorie_id WHERE a.client_id = $1 AND a.nom LIKE '% D3' ORDER BY a.nom`, [clientId])).rows;
    const erreur = (r.body?.details || []).find((d) => d.article === 'Sel gros D3');
    check('import : code saisi gardé (LEV-0500), code proposé avec le préfixe de la catégorie créée (CON-0001), code pris = ligne en erreur', r.status === 200 && importes.some((x) => x.nom === 'Levure D3' && x.code === 'LEV-0500') && importes.some((x) => x.nom === 'Sel fin D3' && x.code === 'CON-0001' && x.prefixe_code === 'CON') && erreur?.status === 'error' && /déjà pris/.test(erreur?.error || ''), `${r.status} ${JSON.stringify(importes)} ${JSON.stringify(erreur)}`);
    r = await classeur(tok, ['Article', 'Unité', 'Catégorie', 'Famille'], [['Ancien modèle D3', 'kg', 'Farines', 'Épicerie D3']]);
    const ancien = (await pool.query(`SELECT code FROM articles WHERE client_id = $1 AND nom = 'Ancien modèle D3'`, [clientId])).rows[0];
    check('ancien modèle à 4 colonnes : importé, code proposé FAR-0101', r.status === 200 && ancien?.code === 'FAR-0101', `${r.status} ${JSON.stringify(ancien)}`);
    const exporte = await lireClasseur('/api/referentiel/export', tok);
    const ligneLevure = exporte.lignes.find((l) => l[0] === 'Levure D3');
    check('export au modèle : colonne Code remplie (Levure D3 → LEV-0500)', exporte.status === 200 && egal(ligneLevure, ['Levure D3', 'kg', 'Farines', 'Épicerie D3', 'LEV-0500']), JSON.stringify(ligneLevure));

    // ── 5. Écrans : liste des articles du labo, stock du labo ──
    r = await appel('PUT', `/api/labo/${labo.id}/stock/${a2.id}`, tok, { quantite: 50, prixUnitaire: 1.2, tauxTva: 7, dateAppro: aujourdhui });
    r2 = await appel('GET', `/api/labo/${labo.id}/stock`, tok);
    r3 = await appel('GET', `/api/labo/${labo.id}/ingredients`, tok);
    const ligneStock = (r2.body || []).find((x) => x.ingredientId === a2.id);
    const ligneIng = (r3.body || []).find((x) => x.id === a2.id);
    check('stock du labo et liste de ses articles : code présent (FAR-0002)', [200, 201].includes(r.status) && ligneStock?.code === 'FAR-0002' && ligneIng?.code === 'FAR-0002', JSON.stringify([ligneStock?.code, ligneIng?.code]));

    // ── 6. Migration 248 rejouable ──
    let rejeu = true;
    try { await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '248_codes_articles.sql'), 'utf8')); } catch (e) { rejeu = false; console.log(e.message); }
    const apres = (await pool.query('SELECT code FROM articles WHERE id = ANY($1) ORDER BY id', [[a1.id, a2.id, a3.id]])).rows.map((x) => x.code);
    check('migration 248 rejouable, codes conservés', rejeu && egal(apres, ['FAR-0100', 'FAR-0002', 'FAR-0007']), JSON.stringify(apres));
  } catch (err) {
    console.error(err);
    check('aucune exception', false, err.message);
  } finally {
    await wipe();
    const ko = results.filter((x) => !x.ok).length;
    console.log(`\n${results.length - ko}/${results.length} vérifications passées`);
    await pool.end();
    process.exit(ko ? 1 : 0);
  }
})();
