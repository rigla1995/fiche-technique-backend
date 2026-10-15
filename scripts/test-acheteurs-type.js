/* Test E2E local — D2 « Acheteurs professionnels (B2B) et particuliers (B2C) » (labflow-reprise/PLAN-DOMAINES-ACHETEURS-CODES.md
 * §2 ligne D2 ; réponses du client du 15/10).
 *   POST /api/acheteurs : type obligatoire (400 TYPE_REQUIS / TYPE_INCONNU), champs obligatoires du type (400 CHAMPS_REQUIS),
 *     B2B complet avec RNE (201), B2C au nom et au téléphone (201) ;
 *   PUT /api/acheteurs/:id : interrupteur « actif » d'une fiche « à préciser » sans contrôle, type changé (contrôlé),
 *     jamais remis « à préciser » ;
 *   POST /api/acheteurs/import : colonnes Type et RNE, lignes refusées avec leur motif, ancien modèle à 6 colonnes lu
 *     (lignes refusées « Type requis ») ; GET /api/acheteurs/template : 8 en-têtes ;
 *   POST /api/acheteurs/ventes : 409 ACHETEUR_TYPE_A_PRECISER, 409 ACHETEUR_MATRICULE_REQUIS, 201 B2C et B2B ;
 *     copie acheteur_type / acheteur_rne ; PDF : bloc FACTURÉ À selon le type (client et portail) ;
 *   POST /api/acheteurs/commandes/:id/expedier : même refus, puis facture ; migration 246 rejouable.
 * Crée un super_admin, un client (1 labo, option Acheteurs) et des acheteurs temporaires, puis nettoie. Données fictives.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { textesDuPdf } = require('./lib/pdf-textes');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const generate = require('../docuseal-templates/generate');

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
const pdf = async (chemin, jeton) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, buf, estPdf: r.status === 200 && buf.subarray(0, 5).toString() === '%PDF-' };
};
const bloc = (textes, debut, fin) => {
  const i = textes.indexOf(debut);
  const j = textes.indexOf(fin, i + 1);
  return i >= 0 && j > i ? textes.slice(i + 1, j) : null;
};
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const aujourdhui = new Date().toISOString().slice(0, 10);

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-d2@example.com';
  const CLIENT = 'test-d2-client@example.com';
  const ACHETEURS = ['test-d2-ach-b2c@example.com', 'test-d2-ach-b2b@example.com', 'test-d2-imp@example.com'];
  let adminTok = null;
  let clientId = null;
  const wipe = async () => {
    if (adminTok && clientId) await appel('DELETE', `/admin/clients/${clientId}`, adminTok);
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT, ...ACHETEURS]])).rows.map((r) => r.id);
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
    fd.append('file', new Blob([await wb.xlsx.writeBuffer()]), 'acheteurs.xlsx');
    const rep = await fetch(`${BASE}/api/acheteurs/import`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` }, body: fd });
    let body = null;
    try { body = await rep.json(); } catch (_) { /* corps vide */ }
    return { status: rep.status, body };
  };

  try {
    const restes = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT, ...ACHETEURS]])).rows;
    if (restes.length) {
      await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin D2', $1, $2, 'super_admin', true, 0, NOW()) ON CONFLICT DO NOTHING`, [ADMIN, hash]);
      adminTok = await login(ADMIN);
      const c = (await pool.query(`SELECT id FROM utilisateurs WHERE LOWER(email) = $1 AND role = 'client'`, [CLIENT])).rows[0];
      if (c) await appel('DELETE', `/admin/clients/${c.id}`, adminTok);
      await wipe();
      adminTok = null;
    }
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin D2', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    check('connexion admin', !!adminTok);
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST D2 Traiteur', email: CLIENT, telephone: '20 555 701', nbActivites: 1, nbLabos: 1, nbGerants: 0, nbAcheteurs: 20, montantOnboarding: 0 });
    check('client créé (1 labo, option Acheteurs)', r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);
    const cli = await activer(CLIENT);
    clientId = cli.id;
    const tok = cli.tok;
    r = await appel('GET', '/api/unites', tok);
    let kg = (r.body || []).find((u) => (u.name || u.nom) === 'kg');
    if (!kg) kg = (await appel('POST', '/api/unites', tok, { name: 'kg' })).body;
    const fam = (await appel('POST', '/api/familles', tok, { name: 'Famille D2', consommable: true, vendable: true })).body;
    const cat = (await appel('POST', '/api/categories', tok, { name: 'Catégorie D2', familleId: fam?.id })).body;
    const art = (await appel('POST', '/api/articles', tok, { name: 'Semoule D2', unitId: kg?.id, categorieId: cat?.id })).body;
    await appel('PUT', `/api/articles/${art?.id}`, tok, { name: 'Semoule D2', unitId: kg?.id, categorieId: cat?.id, commandable: true });
    const labo = (await appel('POST', '/api/labo', tok, { nom: 'Dépôt D2', refLabo: 'DD2' })).body;
    await appel('POST', `/api/labo/${labo?.id}/ingredients/${art?.id}/select`, tok, {});
    r = await appel('PUT', `/api/labo/${labo?.id}/stock/${art?.id}`, tok, { quantite: 500, prixUnitaire: 1.8, tauxTva: 7, dateAppro: aujourdhui });
    const offre = await appel('POST', '/api/acheteurs/offres', tok, { articleType: 'ingredient', articleId: art?.id, prixUnitaireHt: 2.4, tauxTva: 7, actif: true });
    check('préparation : article en stock au labo, offre active', [200, 201].includes(r.status) && offre.status === 200 && !!labo?.id, `${r.status} ${offre.status}`);
    const vendre = (acheteurId) => appel('POST', '/api/acheteurs/ventes', tok, { acheteurId, laboId: labo.id, dateCommande: aujourdhui, dateExpedition: aujourdhui, lignes: [{ articleType: 'ingredient', articleId: art.id, quantite: 2 }] });

    // ── 1. Création : type obligatoire, champs du type ──
    r = await appel('POST', '/api/acheteurs', tok, { nom: 'Sans Type', telephone: '20 555 702' });
    const r2 = await appel('POST', '/api/acheteurs', tok, { type: 'autre', nom: 'Type Inconnu', telephone: '20 555 702' });
    check('sans type → 400 TYPE_REQUIS ; type inconnu → 400 TYPE_INCONNU', r.status === 400 && r.body?.code === 'TYPE_REQUIS' && r2.status === 400 && r2.body?.code === 'TYPE_INCONNU', `${r.status} ${r.body?.code} ${r.body?.message} / ${r2.status} ${r2.body?.code}`);
    r = await appel('POST', '/api/acheteurs', tok, { type: 'b2b', nom: 'Contact Pro', entreprise: 'Epicerie Fictive', telephone: '20 555 703' });
    check('B2B sans matricule ni adresse → 400 CHAMPS_REQUIS (manque : le matricule fiscal, l\'adresse)', r.status === 400 && r.body?.code === 'CHAMPS_REQUIS' && /manque : le matricule fiscal, l'adresse\)$/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', '/api/acheteurs', tok, { type: 'b2c', nom: 'Leïla Fictive' });
    check('B2C sans téléphone → 400 CHAMPS_REQUIS', r.status === 400 && r.body?.code === 'CHAMPS_REQUIS' && /téléphone est obligatoire$/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);
    r = await appel('POST', '/api/acheteurs', tok, { acheteurs: [
      { type: 'Particulier', nom: 'Leïla Fictive', telephone: '20 555 704', email: ACHETEURS[0], creerCompte: true },
      { type: 'professionnel', nom: 'Sami Fictif', entreprise: 'Epicerie Fictive', telephone: '20 555 705', adresse: '3 rue des Tests, Sfax', matriculeFiscal: '1122334cam000', rne: ' b012 345 2024 ', email: ACHETEURS[1] },
    ] });
    const b2c = r.body?.acheteurs?.find((a) => a.nom === 'Leïla Fictive');
    const b2b = r.body?.acheteurs?.find((a) => a.nom === 'Sami Fictif');
    check('B2C (nom + téléphone) et B2B complet créés : type et RNE lus (RNE normalisé)', r.status === 201 && b2c?.type === 'b2c' && b2b?.type === 'b2b' && b2b?.rne === 'B0123452024' && b2b?.matriculeFiscal === '1122334C/A/M/000', `${r.status} ${JSON.stringify(r.body?.message || [b2c?.type, b2b?.type, b2b?.rne])}`);
    r = await appel('GET', '/api/acheteurs', tok);
    check('GET /api/acheteurs : type et rne sur chaque fiche', r.status === 200 && r.body?.acheteurs?.every((a) => ['b2b', 'b2c', 'a_preciser'].includes(a.type) && 'rne' in a), JSON.stringify(r.body?.acheteurs?.map((a) => [a.nom, a.type, a.rne])));

    // ── 2. Modification : fiche « à préciser » (d'avant la migration 246) ──
    await pool.query(`UPDATE acheteurs SET type = 'a_preciser', matricule_fiscal = NULL, telephone = NULL WHERE id = $1`, [b2c.id]);
    r = await appel('PUT', `/api/acheteurs/${b2c.id}`, tok, { actif: false });
    const r3 = await appel('PUT', `/api/acheteurs/${b2c.id}`, tok, { actif: true });
    check('fiche « à préciser » : l\'interrupteur actif passe sans contrôle (200, type inchangé)', r.status === 200 && r3.status === 200 && r3.body?.type === 'a_preciser', `${r.status} ${r3.status} ${r3.body?.type}`);
    r = await appel('PUT', `/api/acheteurs/${b2c.id}`, tok, { type: 'b2c', nom: 'Leïla Fictive' });
    check('passage en B2C sans téléphone → 400 CHAMPS_REQUIS', r.status === 400 && r.body?.code === 'CHAMPS_REQUIS', `${r.status} ${r.body?.message}`);
    r = await appel('PUT', `/api/acheteurs/${b2c.id}`, tok, { type: '' });
    check('type vide → 400 TYPE_REQUIS (jamais remis « à préciser »)', r.status === 400 && r.body?.code === 'TYPE_REQUIS', `${r.status}`);
    r = await appel('PUT', `/api/acheteurs/${b2c.id}`, tok, { type: 'b2c', telephone: '20 555 704' });
    check('passage en B2C avec téléphone → 200, type b2c', r.status === 200 && r.body?.type === 'b2c' && r.body?.telephone === '20 555 704', `${r.status} ${r.body?.type}`);
    r = await appel('PUT', `/api/acheteurs/${b2b.id}`, tok, { adresse: '' });
    check('B2B : adresse effacée → 400 CHAMPS_REQUIS (manque : l\'adresse)', r.status === 400 && /manque : l'adresse\)$/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);

    // ── 3. Import : colonnes Type et RNE, motifs ; ancien modèle ; modèle à 8 en-têtes ──
    const ENTETES = ['Nom', 'Entreprise', 'Email', 'Téléphone', 'Adresse', 'Matricule fiscal', 'Type', 'RNE'];
    r = await classeur(tok, ENTETES, [
      ['Import Pro', 'Société Import', ACHETEURS[2], '20 555 706', '8 rue Importée', '1234567-A-A-M-001', 'Professionnel', 'b0123452025'],
      ['Import Part', '', '', '', '', '', 'Particulier', ''],
      ['Import Sans Type', '', '', '20 555 707', '', '', '', ''],
      ['Import Pro Incomplet', 'Société X', '', '', '', '', 'Professionnel', ''],
    ]);
    const motifs = Object.fromEntries((r.body?.details || []).map((d) => [d.nom, d.error || d.status]));
    const importe = (await pool.query(`SELECT nom, type, rne FROM acheteurs WHERE client_id = $1 AND nom LIKE 'Import %' ORDER BY nom`, [clientId])).rows;
    check('import : 1 ligne importée (B2B avec RNE), 3 refusées avec leur motif', r.status === 200 && r.body?.processed === 1 && importe.length === 1 && importe[0].type === 'b2b' && importe[0].rne === 'B0123452025'
      && /téléphone est obligatoire/.test(motifs['Import Part'] || '') && motifs['Import Sans Type'] === 'Type requis : Professionnel ou Particulier' && /manque : le matricule fiscal, l'adresse/.test(motifs['Import Pro Incomplet'] || ''),
      `${r.status} ${JSON.stringify(motifs)} ${JSON.stringify(importe)}`);
    r = await classeur(tok, ENTETES.slice(0, 6), [['Ancien Modèle', '', '', '20 555 708', '', '']]);
    check('ancien modèle à 6 colonnes : lu, ligne refusée « Type requis »', r.status === 400 && r.body?.details?.[0]?.error === 'Type requis : Professionnel ou Particulier', `${r.status} ${JSON.stringify(r.body?.details)}`);
    {
      const rep = await fetch(`${BASE}/api/acheteurs/template`, { headers: { Authorization: `Bearer ${tok}` } });
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await rep.arrayBuffer()));
      const ws = wb.worksheets[0];
      let entetes = null;
      ws.eachRow((row) => { if (!entetes && String(row.getCell(1).text).trim() === 'Nom') entetes = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => String(row.getCell(i).text).trim()); });
      check('modèle d\'import : 8 en-têtes (… Type, RNE)', rep.status === 200 && egal(entetes, ENTETES), JSON.stringify(entetes));
    }

    // ── 4. Factures de vente : refus selon le type, copie, PDF ──
    await pool.query(`UPDATE acheteurs SET type = 'a_preciser' WHERE id = $1`, [b2c.id]);
    r = await vendre(b2c.id);
    check('vente directe à une fiche « à préciser » → 409 ACHETEUR_TYPE_A_PRECISER', r.status === 409 && r.body?.code === 'ACHETEUR_TYPE_A_PRECISER', `${r.status} ${r.body?.code} ${r.body?.message}`);
    await pool.query(`UPDATE acheteurs SET type = 'b2c' WHERE id = $1`, [b2c.id]);
    await pool.query(`UPDATE acheteurs SET matricule_fiscal = NULL WHERE id = $1`, [b2b.id]);
    r = await vendre(b2b.id);
    check('vente directe à un B2B sans matricule → 409 ACHETEUR_MATRICULE_REQUIS', r.status === 409 && r.body?.code === 'ACHETEUR_MATRICULE_REQUIS', `${r.status} ${r.body?.code}`);
    await pool.query(`UPDATE acheteurs SET matricule_fiscal = '1122334C/A/M/000' WHERE id = $1`, [b2b.id]);
    r = await vendre(b2b.id);
    const FB2B = r.body?.facture?.id;
    const copieB2B = FB2B ? (await pool.query('SELECT acheteur_type, acheteur_rne FROM factures_acheteur WHERE id = $1', [FB2B])).rows[0] : null;
    check('vente à un B2B → 201 ; copie acheteur_type = b2b, acheteur_rne', r.status === 201 && copieB2B?.acheteur_type === 'b2b' && copieB2B?.acheteur_rne === 'B0123452024', `${r.status} ${JSON.stringify(copieB2B)}`);
    let p = await pdf(`/api/acheteurs/factures/${FB2B}/pdf`, tok);
    let t = p.estPdf ? textesDuPdf(p.buf) : [];
    check('PDF B2B : FACTURÉ À = raison sociale — contact, MF, RNE, email, téléphone, adresse', p.estPdf && egal(bloc(t, 'FACTURÉ À', 'DÉTAIL'), ['Epicerie Fictive — Sami Fictif', 'MF 1122334C/A/M/000', 'RNE : B0123452024', ACHETEURS[1], '20 555 705', '3 rue des Tests, Sfax']), JSON.stringify(bloc(t, 'FACTURÉ À', 'DÉTAIL')));
    r = await vendre(b2c.id);
    const FB2C = r.body?.facture?.id;
    p = await pdf(`/api/acheteurs/factures/${FB2C}/pdf`, tok);
    t = p.estPdf ? textesDuPdf(p.buf) : [];
    const copieB2C = FB2C ? (await pool.query('SELECT acheteur_type FROM factures_acheteur WHERE id = $1', [FB2C])).rows[0] : null;
    check('vente à un B2C → 201 ; PDF : FACTURÉ À = nom, « Particulier », email, téléphone (pas de matricule)', r.status === 201 && copieB2C?.acheteur_type === 'b2c' && egal(bloc(t, 'FACTURÉ À', 'DÉTAIL'), ['Leïla Fictive', 'Particulier', ACHETEURS[0], '20 555 704']), `${r.status} ${JSON.stringify(bloc(t, 'FACTURÉ À', 'DÉTAIL'))}`);

    // ── 5. Commande du portail → expédition : même refus, puis facture (téléchargée aussi côté portail) ──
    const ach = await activer(ACHETEURS[0]);
    r = await appel('POST', '/api/portail/commandes', ach.tok, { lignes: [{ articleType: 'ingredient', articleId: art.id, quantite: 1 }] });
    const cmdId = r.body?.commande?.id || r.body?.id;
    check('commande du portail par le particulier → 201', r.status === 201 && !!cmdId, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    await pool.query(`UPDATE acheteurs SET type = 'a_preciser' WHERE id = $1`, [b2c.id]);
    r = await appel('POST', `/api/acheteurs/commandes/${cmdId}/expedier`, tok, { laboId: labo.id, dateExpedition: aujourdhui });
    check('expédition : fiche repassée « à préciser » → 409 ACHETEUR_TYPE_A_PRECISER, commande toujours en attente', r.status === 409 && r.body?.code === 'ACHETEUR_TYPE_A_PRECISER'
      && (await pool.query('SELECT statut FROM commandes_acheteur WHERE id = $1', [cmdId])).rows[0]?.statut === 'en_attente', `${r.status} ${r.body?.code}`);
    await pool.query(`UPDATE acheteurs SET type = 'b2c' WHERE id = $1`, [b2c.id]);
    r = await appel('POST', `/api/acheteurs/commandes/${cmdId}/expedier`, tok, { laboId: labo.id, dateExpedition: aujourdhui });
    const FP = r.body?.facture?.id;
    const pPortail = FP ? await pdf(`/api/portail/factures/${FP}/pdf`, ach.tok) : { estPdf: false };
    const pClient = FP ? await pdf(`/api/acheteurs/factures/${FP}/pdf`, tok) : { estPdf: false };
    t = pPortail.estPdf ? textesDuPdf(pPortail.buf) : [];
    check('expédition → facture B2C ; PDF du portail = PDF du vendeur, bloc « Particulier »', r.status === 200 && pPortail.estPdf && pClient.estPdf && pPortail.buf.equals(pClient.buf) && egal(bloc(t, 'FACTURÉ À', 'DÉTAIL'), ['Leïla Fictive', 'Particulier', ACHETEURS[0], '20 555 704']), `${r.status} ${JSON.stringify(bloc(t, 'FACTURÉ À', 'DÉTAIL'))}`);

    // ── 6. Migration 246 rejouable ──
    let rejeu = true;
    try { await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '246_acheteurs_type_b2b_b2c.sql'), 'utf8')); } catch (e) { rejeu = false; console.log(e.message); }
    const types = (await pool.query('SELECT type FROM acheteurs WHERE id = ANY($1) ORDER BY id', [[b2c.id, b2b.id]])).rows.map((x) => x.type);
    check('migration 246 rejouable, types conservés', rejeu && egal(types, ['b2c', 'b2b']), JSON.stringify(types));
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
