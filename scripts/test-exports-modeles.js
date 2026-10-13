/* Test E2E local — exports « dans le modèle » (13/10/2026) : le référentiel, les fournisseurs et les correspondances
 * d'un compte, exportés dans la charte des modèles d'import ; les deux premiers se réimportent TELS QUELS par l'Ajout
 * Dynamique (dans un autre compte : tout est créé ; dans le même : rien n'est doublé).
 *   GET /api/referentiel/export · GET /api/entreprise/fournisseurs/export · GET /api/correspondances/export
 * Crée un super_admin + 2 clients (le 1er avec 2 activités et un gérant limité à la 1re) temporaires, puis nettoie.
 * Données fictives. ⚠️ Serveur d'essai : « node scripts/start-test-backend.js » (BASE_URL). */
require('./lib/bouchons-test').installer();
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const pool = require('../src/config/database');
const { findHeaderRow } = require('../src/services/excelBrandService');
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const MDP = crypto.randomBytes(18).toString('base64url');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
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
/** Fichier téléchargé : statut, en-tête, octets. */
const telecharger = async (chemin, jeton) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} });
  return { status: r.status, type: r.headers.get('content-type') || '', nom: r.headers.get('content-disposition') || '', octets: Buffer.from(await r.arrayBuffer()) };
};
/** Feuille lue : titre, ligne des en-têtes (cherchée comme le fait l'import), lignes de données (texte des cellules). */
const lire = async (octets, enTetes) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(octets);
  const ws = wb.worksheets[0];
  const ligne = enTetes ? findHeaderRow(ws, enTetes) : 6;
  const n = ws.getRow(ligne).cellCount;
  const lignes = [];
  for (let r = ligne + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const vals = [...Array(n).keys()].map((i) => row.getCell(i + 1).value);
    if (vals.some((v) => v !== null && v !== '')) lignes.push(vals);
  }
  return { titre: String(ws.getCell(1, 1).value || ''), ligne, enTetes: [...Array(n).keys()].map((i) => ws.getRow(ligne).getCell(i + 1).text), lignes };
};
const importer = async (chemin, jeton, octets) => {
  const fd = new FormData();
  fd.append('file', new Blob([octets]), 'export.xlsx');
  const r = await fetch(`${BASE}${chemin}`, { method: 'POST', headers: { Authorization: `Bearer ${jeton}` }, body: fd });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const texte = (lignes) => lignes.map((l) => l.map((v) => (v == null ? '' : String(v))).join('|')).sort();

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-exports@example.com';
  const CLIENTS = ['test-exports-a@example.com', 'test-exports-b@example.com'];
  const GERANT = 'test-exports-gerant@example.com';
  let adminTok = null;
  const nettoyer = async () => {
    for (const email of CLIENTS) {
      const c = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [email])).rows[0];
      if (c && adminTok) await appel('DELETE', `/admin/clients/${c.id}`, adminTok);
    }
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [[GERANT, ...CLIENTS, ADMIN]]);
  };
  try {
    // ── 0. Préparation ─────────────────────────────────────────────────────────────────────────────────────────────
    await nettoyer();
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminExports', $1, $2, 'super_admin', true)`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    const comptes = [];
    for (const [k, email] of CLIENTS.entries()) {
      const r = await appel('POST', '/admin/clients', adminTok, { nom: `TEST-Exports ${k ? 'B' : 'A'}`, email, telephone: `2066554${3 + k}`, nbActivites: 2, nbLabos: 0, nbGerants: k === 0 ? 1 : 0, montantOnboarding: 0 });
      const id = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email])).rows[0]?.id;
      await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, id]);
      const tok = await login(email);
      const act1 = (await appel('POST', '/api/entreprise/activites', tok, { nom: `Restaurant ${k ? 'B' : 'A'} 1` })).body;
      const act2 = (await appel('POST', '/api/entreprise/activites', tok, { nom: `Restaurant ${k ? 'B' : 'A'} 2` })).body;
      comptes.push({ id, tok, act1, act2, cree: r.status === 201 });
    }
    const [A, B] = comptes;
    let r = await appel('POST', '/api/abonnements/gerants', A.tok, { nom: 'TEST-Gérant Exports', telephone: '20665549', email: GERANT, activiteIds: [A.act1.id] });
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, r.body?.id]);
    const gTok = await login(GERANT);
    check('0. deux comptes à deux activités, un gérant limité à la 1re', comptes.every((c) => c.cree && c.tok && c.act1?.id && c.act2?.id) && !!gTok);

    // ── 1. Référentiel : rempli par l'import, exporté dans le modèle ───────────────────────────────────────────────
    const modele = await telecharger('/api/referentiel/template', A.tok);
    const wbm = new ExcelJS.Workbook();
    await wbm.xlsx.load(modele.octets);
    const wsm = wbm.worksheets[0];
    const entetesRef = ['Article', 'Unité', 'Catégorie', 'Famille'];
    const lm = findHeaderRow(wsm, entetesRef);
    const saisie = [['Farine T45 sac 25 kg', 'kg', 'Farines', 'Épicerie'], ['Lait UHT ½ écrémé', 'L', 'Crèmerie', 'Frais'],
      ['Beurre doux', 'kg', 'Crèmerie', 'Frais'], ['Sel fin', 'kg', null, null]];
    saisie.forEach((v, i) => { wsm.getRow(lm + 2 + i).values = v; });
    r = await importer('/api/referentiel/import', A.tok, Buffer.from(await wbm.xlsx.writeBuffer()));
    check('1. référentiel du compte A rempli par l\'Ajout Dynamique (4 articles)', r.status === 200 && r.body?.stats?.articles === 4 && r.body?.errors === 0, JSON.stringify(r.body));

    const expA = await telecharger('/api/referentiel/export', A.tok);
    const fa = await lire(expA.octets, entetesRef);
    check('1. export : fichier Excel nommé referentiel_<date>.xlsx, bandeau « export du », en-têtes du modèle en ligne 6',
      expA.status === 200 && /spreadsheetml/.test(expA.type) && /referentiel_\d{4}-\d{2}-\d{2}\.xlsx/.test(expA.nom) && /export du/.test(fa.titre) && fa.ligne === 6,
      `${expA.status} ${expA.nom} ${fa.titre} ${fa.ligne}`);
    check('1. export : une ligne par article, avec unité, catégorie et famille (sans catégorie : vide)',
      JSON.stringify(texte(fa.lignes)) === JSON.stringify(texte(saisie)), JSON.stringify(fa.lignes));

    r = await importer('/api/referentiel/import', B.tok, expA.octets);
    const fb = await lire((await telecharger('/api/referentiel/export', B.tok)).octets, entetesRef);
    check('1. le fichier exporté se réimporte TEL QUEL dans le compte B : tout est créé, B exporte la même chose',
      r.status === 200 && r.body?.stats?.articles === 4 && r.body?.errors === 0 && JSON.stringify(texte(fb.lignes)) === JSON.stringify(texte(fa.lignes)),
      `${r.status} ${JSON.stringify(r.body?.stats)} ${JSON.stringify(fb.lignes)}`);
    r = await importer('/api/referentiel/import', A.tok, expA.octets);
    const nA = (await pool.query('SELECT COUNT(*)::int AS n FROM articles WHERE client_id = $1', [A.id])).rows[0].n;
    check('1. réimporté dans le compte A : rien n\'est doublé', r.status === 200 && r.body?.stats?.articles === 0 && nA === 4, `${JSON.stringify(r.body?.stats)} ${nA}`);
    r = await telecharger('/api/referentiel/export', gTok);
    check('1. le gérant exporte le référentiel du compte', r.status === 200 && (await lire(r.octets, entetesRef)).lignes.length === 4);

    // ── 2. Fournisseurs ────────────────────────────────────────────────────────────────────────────────────────────
    const f1 = (await appel('POST', '/api/entreprise/fournisseurs', A.tok, { nom: 'Minoterie du Sahel', telephone: '71 234 567', adresse: 'Zone industrielle', ville: 'Sousse', matriculeFiscal: '1234567A/A/M/000', email: 'contact@minoterie.tn', activiteIds: [A.act1.id] })).body?.id;
    const f2 = (await appel('POST', '/api/entreprise/fournisseurs', A.tok, { nom: 'Transports Ben Ali', telephone: '98 765 432', activiteIds: [A.act2.id] })).body?.id;
    const entetesF = ['Nom', 'Téléphone', 'Adresse', 'Ville', 'Matricule fiscal', 'Email'];
    const expF = await telecharger('/api/entreprise/fournisseurs/export', A.tok);
    const ff = await lire(expF.octets, entetesF);
    check('2. export des fournisseurs : en-têtes du modèle, une ligne par fournisseur, téléphone et matricule en texte',
      !!f1 && !!f2 && expF.status === 200 && /fournisseurs_\d{4}-\d{2}-\d{2}\.xlsx/.test(expF.nom) && ff.ligne === 6
        && JSON.stringify(texte(ff.lignes)) === JSON.stringify(texte([
          ['Minoterie du Sahel', '71 234 567', 'Zone industrielle', 'Sousse', '1234567A/A/M/000', 'contact@minoterie.tn'],
          ['Transports Ben Ali', '98 765 432', null, null, null, null]])),
      `${expF.status} ${expF.nom} ${JSON.stringify(ff.lignes)}`);
    const fg = await lire((await telecharger('/api/entreprise/fournisseurs/export', gTok)).octets, entetesF);
    check('2. le gérant n\'exporte que les fournisseurs de ses activités', fg.lignes.length === 1 && fg.lignes[0][0] === 'Minoterie du Sahel', JSON.stringify(fg.lignes));
    r = await importer('/api/entreprise/fournisseurs/import', B.tok, expF.octets);
    const fB = await lire((await telecharger('/api/entreprise/fournisseurs/export', B.tok)).octets, entetesF);
    check('2. le fichier exporté se réimporte tel quel dans le compte B : B exporte la même chose',
      r.status === 200 && r.body?.processed === 2 && r.body?.errors === 0 && JSON.stringify(texte(fB.lignes)) === JSON.stringify(texte(ff.lignes)),
      `${r.status} ${JSON.stringify(r.body)} ${JSON.stringify(fB.lignes)}`);
    r = await importer('/api/entreprise/fournisseurs/import', A.tok, expF.octets);
    check('2. réimporté dans le compte A : rien n\'est doublé (déjà présents, signalés)', r.status === 400 && r.body?.errors === 2, `${r.status} ${JSON.stringify(r.body)}`);

    // ── 3. Correspondances ─────────────────────────────────────────────────────────────────────────────────────────
    const farine = (await pool.query(`SELECT id FROM articles WHERE client_id = $1 AND nom = 'Farine T45 sac 25 kg'`, [A.id])).rows[0]?.id;
    await pool.query(
      `INSERT INTO correspondances (client_id, fournisseur_id, cle, designation, reference, unite_facture, article_id, conversion, emplois, derniere_fois)
       VALUES ($1, $2, 'ref:mf45', 'FARINE T45 25KG', 'MF45', 'sac', $3, 25, 3, '2026-10-12T10:00:00Z')`,
      [A.id, f1, farine]
    );
    await pool.query(
      `INSERT INTO correspondances (client_id, fournisseur_id, cle, designation, nature_hors_stock, emplois)
       VALUES ($1, $2, 'des:frais de transport', 'Frais de transport', 'transport', 1)`,
      [A.id, f2]
    );
    const expC = await telecharger('/api/correspondances/export', A.tok);
    const fc = await lire(expC.octets);
    const farineL = fc.lignes.find((l) => l[3] === 'FARINE T45 25KG');
    const transportL = fc.lignes.find((l) => l[3] === 'Frais de transport');
    check('3. export des correspondances : charte des modèles, une ligne par correspondance',
      expC.status === 200 && /correspondances_\d{4}-\d{2}-\d{2}\.xlsx/.test(expC.nom) && fc.lignes.length === 2
        && fc.enTetes[0] === 'Fournisseur' && fc.enTetes[2] === 'Code fournisseur' && fc.enTetes[5] === 'Article LabFlow',
      `${expC.status} ${expC.nom} ${JSON.stringify(fc.enTetes)}`);
    check('3. contenu : fournisseur, matricule, code, unité facturée, article, unité, conversion (nombre), date ; frais : libellé, sans conversion',
      farineL && farineL[0] === 'Minoterie du Sahel' && farineL[1] === '1234567A/A/M/000' && farineL[2] === 'MF45' && farineL[4] === 'sac'
        && farineL[5] === 'Farine T45 sac 25 kg' && farineL[6] === 'kg' && farineL[7] === 25 && farineL[8] === null && farineL[9] === 3
        && farineL[10] instanceof Date
        && transportL && transportL[5] === null && transportL[7] === null && transportL[8] === 'Transport',
      JSON.stringify(fc.lignes));
    const fcg = await lire((await telecharger('/api/correspondances/export', gTok)).octets);
    const fcb = await lire((await telecharger('/api/correspondances/export', B.tok)).octets);
    check('3. le gérant n\'exporte que celles de ses fournisseurs ; un autre compte n\'exporte rien des miennes',
      fcg.lignes.length === 1 && fcg.lignes[0][3] === 'FARINE T45 25KG' && fcb.lignes.length === 0, `${JSON.stringify(fcg.lignes)} ${JSON.stringify(fcb.lignes)}`);

    // ── 4. Sans connexion ──────────────────────────────────────────────────────────────────────────────────────────
    const sans = await Promise.all(['/api/referentiel/export', '/api/entreprise/fournisseurs/export', '/api/correspondances/export'].map((c) => telecharger(c, null)));
    check('4. sans connexion : 401 partout', sans.every((x) => x.status === 401), sans.map((x) => x.status).join(','));
  } catch (e) {
    console.error(e);
    check('exécution sans exception', false, e.message);
  } finally {
    await nettoyer().catch((e) => console.error('nettoyage :', e.message));
    const ok = results.filter((x) => x.ok).length;
    console.log(`\n${ok}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ok === results.length ? 0 : 1);
  }
})();
