/* Test E2E local — P2 « Conditions des prestataires et chiffre net » (labflow-reprise/produits-prestataires/PLAN.md §2
 * ligne P2, §3, §4 questions 2 à 5 ; réponses du client du 13/10).
 *   admin : modes de paiement (liste, ajout, doublon, renommage, désactivation) ; client : modes actifs seulement ;
 *   activation d'un prestataire : refus (conditions manquantes, taux hors bornes, mode inactif ou inconnu), activation
 *   avec conditions ; ventes : conditions FIGÉES sur la vente (commission, TVA, mode), net = CA − commission − TVA
 *   (30 → 21,075), refus (prestataire absent, non activé, conditions manquantes), changer les conditions ne touche pas
 *   les ventes passées ; tableau de bord : net des prestataires, TVA, par canal, filtre par mode de paiement, cascade ;
 *   export Excel (colonnes, filtre par prestataire réparé, filtre par mode) ; contrôles de propriétaire (prix
 *   prestataire, suppression d'un article vendable) ; désactiver efface prix et conditions ; rejeu de la migration 238.
 * Crée un super_admin et un client temporaires (mot de passe tiré au hasard), puis nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
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
const approx = (a, b, eps = 0.002) => Math.abs(Number(a) - Number(b)) <= eps;
const appel = async (methode, chemin, jeton, corps) => {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const type = r.headers.get('content-type') || '';
  let body = null;
  if (type.includes('spreadsheetml')) body = Buffer.from(await r.arrayBuffer());
  else { try { body = await r.json(); } catch (_) { /* corps vide */ } }
  return { status: r.status, body };
};
const login = async (email) => (await appel('POST', '/auth/login', null, { email, password: MDP })).body?.token;
const texteClasseur = async (buf) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const lignes = [];
  wb.worksheets[0].eachRow((row) => lignes.push(row.values.slice(1).map((v) => (v && typeof v === 'object' && v.richText ? v.richText.map((t) => t.text).join('') : v ?? '')).join(' | ')));
  return lignes.join('\n');
};
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-presta-p2@example.com';
  const CLIENT = 'test-client-presta-p2@example.com';
  let adminTok = null;
  let clientId = null;
  let prestaCree = null;
  const wipe = async () => {
    const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
    if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    if (prestaCree && adminTok) await appel('DELETE', `/api/admin/prestataires/${prestaCree}`, adminTok);
    try { await pool.query(`DELETE FROM modes_paiement WHERE code IN ('cheque', 'cheque_bancaire')`); } catch (_) { /* encore cité */ }
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT]])).rows.map((r) => r.id);
    const tous = [...new Set([...ids, ...(clientId ? [clientId] : [])])];
    if (tous.length) {
      // Les lignes créées par les comptes d'essai (ventes, prix, liens, articles vendables) les référencent (created_by)
      // sans cascade : retirées avant les comptes.
      for (const table of ['ventes', 'article_prix_prestataire', 'activite_prestataires', 'activite_articles_vendables']) {
        await pool.query(`DELETE FROM ${table} WHERE created_by = ANY($1)`, [tous]);
      }
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM demandes WHERE demandeur_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [tous]);
    }
  };

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin P2', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    check('connexion admin', !!adminTok);
    const A = (m, p, b) => appel(m, p, adminTok, b);

    // ── 1. Modes de paiement (admin) ──
    let r = await A('GET', '/api/admin/modes-paiement');
    const virement = r.body?.find?.((m) => m.code === 'virement');
    const especes = r.body?.find?.((m) => m.code === 'especes');
    check('admin : modes Espèces et Virement de la migration 238', r.status === 200 && !!virement && !!especes && especes.libelle === 'Espèces', JSON.stringify(r.body?.map?.((m) => m.code)));
    r = await A('POST', '/api/admin/modes-paiement', { libelle: 'Chèque' });
    const cheque = r.body;
    check('admin : ajout « Chèque » → 201, code cheque, actif', r.status === 201 && cheque?.code === 'cheque' && cheque.actif === true, `${r.status} ${JSON.stringify(r.body)}`);
    r = await A('POST', '/api/admin/modes-paiement', { libelle: 'chèque' });
    check('admin : doublon → 409 MODE_PAIEMENT_EXISTANT', r.status === 409 && r.body?.code === 'MODE_PAIEMENT_EXISTANT', `${r.status} ${r.body?.code}`);
    r = await A('POST', '/api/admin/modes-paiement', { libelle: '  ' });
    check('admin : libellé vide → 400', r.status === 400, String(r.status));
    r = await A('PUT', `/api/admin/modes-paiement/${cheque.id}`, { libelle: 'Chèque bancaire' });
    check('admin : renommage → 200', r.status === 200 && r.body?.libelle === 'Chèque bancaire' && r.body?.code === 'cheque', `${r.status} ${JSON.stringify(r.body)}`);
    r = await A('PUT', `/api/admin/modes-paiement/${cheque.id}`, { actif: false });
    check('admin : désactivation → 200, actif false', r.status === 200 && r.body?.actif === false, `${r.status}`);
    r = await A('PUT', '/api/admin/modes-paiement/999999', { actif: true });
    check('admin : mode inconnu → 404', r.status === 404, String(r.status));

    // ── Client LabFlow : 1 activité ──
    r = await A('POST', '/admin/clients', { nom: 'TEST Client P2', email: CLIENT, telephone: '20 555 238', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    check('création du client LabFlow', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const tok = await login(CLIENT);
    check('connexion du client', !!tok);
    const C = (m, p, b) => appel(m, p, tok, b);
    r = await C('GET', '/api/modes-paiement');
    check('client : modes actifs seulement (Espèces, Virement ; pas Chèque désactivé)', r.status === 200 && r.body.some((m) => m.id === virement.id) && r.body.some((m) => m.id === especes.id) && !r.body.some((m) => m.id === cheque.id), JSON.stringify(r.body?.map?.((m) => m.code)));
    r = await C('GET', '/api/admin/modes-paiement');
    check('client : la liste admin lui est refusée (403)', r.status === 403, String(r.status));

    let act = (await C('GET', '/api/entreprise/activites')).body?.[0];
    if (!act) act = (await C('POST', '/api/entreprise/activites', { nom: 'Restaurant P2' })).body;
    r = await C('GET', '/api/prestataires');
    let presta = Array.isArray(r.body) ? r.body[0] : null;
    if (!presta) {
      const cr = await A('POST', '/api/admin/prestataires', { nom: 'TEST Presta P2' });
      presta = cr.body; prestaCree = cr.body?.id;
    }
    check('activité et prestataire disponibles', !!act?.id && !!presta?.id, JSON.stringify({ act: act?.id, presta: presta?.nom }));
    const AP = '/api/activite-prestataires';
    const base = { activite_id: act.id, prestataire_id: presta.id };

    // ── 2. Activation : refus ──
    r = await C('POST', AP, base);
    check('activation sans conditions → 400 CONDITIONS_REQUISES', r.status === 400 && r.body?.code === 'CONDITIONS_REQUISES', `${r.status} ${r.body?.code}`);
    r = await C('POST', AP, { ...base, taux_commission: 25, taux_tva: 19 });
    check('activation sans mode de paiement → 400 CONDITIONS_REQUISES', r.status === 400 && r.body?.code === 'CONDITIONS_REQUISES', `${r.status} ${r.body?.code}`);
    r = await C('POST', AP, { ...base, taux_commission: 120, taux_tva: 19, mode_paiement_id: virement.id });
    check('commission 120 % → 400 TAUX_INVALIDE', r.status === 400 && r.body?.code === 'TAUX_INVALIDE', `${r.status} ${r.body?.code}`);
    r = await C('POST', AP, { ...base, taux_commission: 25, taux_tva: 19, mode_paiement_id: cheque.id });
    check('mode désactivé → 400 MODE_PAIEMENT_INCONNU', r.status === 400 && r.body?.code === 'MODE_PAIEMENT_INCONNU', `${r.status} ${r.body?.code}`);
    r = await C('POST', AP, { ...base, taux_commission: 25, taux_tva: 19, mode_paiement_id: 999999 });
    check('mode inconnu → 400 MODE_PAIEMENT_INCONNU', r.status === 400 && r.body?.code === 'MODE_PAIEMENT_INCONNU', `${r.status} ${r.body?.code}`);
    r = await C('GET', `${AP}?activiteId=${act.id}`);
    check('aucune activation retenue après les refus', r.status === 200 && r.body.length === 0, String(r.body?.length));

    // ── 3. Activation avec conditions ──
    r = await C('POST', AP, { ...base, taux_commission: 25, taux_tva: 19, mode_paiement_id: virement.id });
    const lienId = r.body?.id;
    check('activation 25 %, TVA 19 %, Virement → 201', r.status === 201 && !!lienId && r.body.taux_commission === 25 && r.body.taux_tva === 19 && r.body.mode_paiement_libelle === 'Virement' && r.body.conditions_renseignees === true, `${r.status} ${JSON.stringify(r.body)}`);
    r = await C('GET', `${AP}?activiteId=${act.id}`);
    check('liste des prestataires de l\'activité : conditions servies', r.body?.[0]?.taux_commission === 25 && r.body?.[0]?.taux_tva === 19 && r.body?.[0]?.mode_paiement_libelle === 'Virement' && r.body?.[0]?.conditions_renseignees === true, JSON.stringify(r.body?.[0]));
    r = await C('GET', `/api/prestataires?activiteId=${act.id}`);
    check('prestataires actifs de l\'activité (saisie) : conditions servies', r.body?.[0]?.mode_paiement_libelle === 'Virement' && r.body?.[0]?.taux_tva === 19, JSON.stringify(r.body?.[0]));

    // ── 4. Article vendable + prix prestataire ──
    const unite = async (name) => { const c = await C('POST', '/api/unites', { name }); return c.status === 201 ? c.body : (await C('GET', '/api/unites')).body.find((u) => u.name === name); };
    const L = await unite('L');
    const fam = await C('POST', '/api/familles', { name: 'TEST-Fam P2' });
    const cat = await C('POST', '/api/categories', { name: 'TEST-Cat P2', familleId: fam.body?.id });
    const jus = (await C('POST', '/api/articles', { name: 'Jus TEST P2', unitId: L.id, categorieId: cat.body?.id })).body;
    const the = (await C('POST', '/api/articles', { name: 'Thé TEST P2', unitId: L.id, categorieId: cat.body?.id })).body;
    r = await C('POST', '/api/articles-vendables', { activite_id: act.id, article_type: 'ingredient', article_id: jus.id, prix_vente: 30, actif: true });
    const avId = r.body?.id;
    const r2 = await C('POST', '/api/articles-vendables', { activite_id: act.id, article_type: 'ingredient', article_id: the.id, prix_vente: 10, actif: true });
    const av2 = r2.body?.id;
    check('deux articles vendables (jus 30, thé 10)', !!avId && !!av2, `${r.status}/${r2.status} ${r.body?.message || ''}`);
    r = await C('POST', '/api/article-prix-prestataire', { article_vendable_id: avId, activite_prestataire_id: lienId, prix_vente: 35 });
    check('prix prestataire du jus (35) → 201', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await C('POST', '/api/article-prix-prestataire', { article_vendable_id: avId, activite_prestataire_id: lienId, prix_vente: -3 });
    check('prix prestataire négatif → 400', r.status === 400, String(r.status));

    // ── 5. Ventes : conditions figées, net ──
    const ligne = (prix) => [{ article_type: 'ingredient', article_id: jus.id, quantite: 1, prix_unitaire: prix }];
    r = await C('POST', '/api/ventes', { activite_id: act.id, type_vente: 'prestataire', prestataire_id: presta.id, date_vente: today, lignes: ligne(30) });
    const vA = r.body;
    check('vente prestataire 30 DT → 201, taux figés 25 / 19, mode Virement', r.status === 201 && approx(vA?.taux_commission, 25) && approx(vA?.taux_tva_commission, 19) && vA?.mode_paiement_id === virement.id, `${r.status} ${JSON.stringify(r.body)}`);
    r = await C('POST', '/api/ventes', { activite_id: act.id, type_vente: 'directe', date_vente: today, lignes: ligne(50) });
    const vB = r.body;
    check('vente directe 50 DT → 201, sans conditions', r.status === 201 && vB?.taux_commission == null && vB?.mode_paiement_id == null, `${r.status}`);
    r = await C('GET', `/api/ventes?activiteId=${act.id}`);
    const lA = r.body?.find?.((v) => v.id === vA.id); const lB = r.body?.find?.((v) => v.id === vB.id);
    check('liste : vente prestataire commission 7,500, TVA 1,425, net 21,075, mode Virement', approx(lA?.commission, 7.5) && approx(lA?.tva_commission, 1.425) && approx(lA?.net, 21.075) && lA?.mode_paiement === 'Virement' && lA?.taux_commission === 25, JSON.stringify(lA && { c: lA.commission, t: lA.tva_commission, n: lA.net, m: lA.mode_paiement }));
    check('liste : vente directe net = CA (50), taux null', approx(lB?.net, 50) && lB?.taux_commission === null && lB?.commission === 0, JSON.stringify(lB && { n: lB.net, t: lB.taux_commission }));
    r = await C('GET', `/api/ventes/${vA.id}`);
    check('détail d\'une vente : total 30, net 21,075', r.status === 200 && approx(r.body?.total_ca, 30) && approx(r.body?.net, 21.075), JSON.stringify(r.body && { ca: r.body.total_ca, n: r.body.net }));

    // ── 6. Refus à la vente ──
    r = await C('POST', '/api/ventes', { activite_id: act.id, type_vente: 'prestataire', date_vente: today, lignes: ligne(30) });
    check('vente prestataire sans prestataire → 400 PRESTATAIRE_REQUIS', r.status === 400 && r.body?.code === 'PRESTATAIRE_REQUIS', `${r.status} ${r.body?.code}`);
    r = await C('POST', '/api/ventes', { activite_id: act.id, type_vente: 'prestataire', prestataire_id: crypto.randomUUID(), date_vente: today, lignes: ligne(30) });
    check('prestataire non activé → 400 PRESTATAIRE_NON_ACTIVE', r.status === 400 && r.body?.code === 'PRESTATAIRE_NON_ACTIVE', `${r.status} ${r.body?.code}`);
    await pool.query('UPDATE activite_prestataires SET mode_paiement_id = NULL WHERE id = $1', [lienId]);
    r = await C('POST', '/api/ventes', { activite_id: act.id, type_vente: 'prestataire', prestataire_id: presta.id, date_vente: today, lignes: ligne(30) });
    check('conditions non renseignées (prestataire d\'avant P2) → 400 CONDITIONS_MANQUANTES', r.status === 400 && r.body?.code === 'CONDITIONS_MANQUANTES', `${r.status} ${r.body?.code}`);
    r = await C('GET', `${AP}?activiteId=${act.id}`);
    check('liste : conditions_renseignees false', r.body?.[0]?.conditions_renseignees === false, String(r.body?.[0]?.conditions_renseignees));
    r = await C('PUT', `${AP}/${lienId}`, { mode_paiement_id: virement.id });
    check('renseigner le mode → 200, conditions_renseignees true', r.status === 200 && r.body?.conditions_renseignees === true && r.body?.mode_paiement_libelle === 'Virement', `${r.status} ${JSON.stringify(r.body)}`);

    // ── 7. Changer les conditions : les ventes passées ne bougent pas ──
    r = await C('PUT', `${AP}/${lienId}`, { taux_commission: 30 });
    check('commission passée à 30 % → 200 (TVA inchangée 19)', r.status === 200 && r.body?.taux_commission === 30 && r.body?.taux_tva === 19, `${r.status} ${JSON.stringify(r.body)}`);
    r = await C('PUT', `${AP}/${lienId}`, { taux_tva: 150 });
    check('TVA 150 % → 400 TAUX_INVALIDE', r.status === 400 && r.body?.code === 'TAUX_INVALIDE', `${r.status} ${r.body?.code}`);
    r = await C('POST', '/api/ventes', { activite_id: act.id, type_vente: 'prestataire', prestataire_id: presta.id, date_vente: today, lignes: ligne(30) });
    const vC = r.body;
    r = await C('GET', `/api/ventes?activiteId=${act.id}`);
    const lC = r.body?.find?.((v) => v.id === vC.id); const lA2 = r.body?.find?.((v) => v.id === vA.id);
    check('nouvelle vente à 30 % : commission 9, TVA 1,710, net 19,290 ; l\'ancienne reste à 25 % (21,075)', approx(lC?.commission, 9) && approx(lC?.tva_commission, 1.71) && approx(lC?.net, 19.29) && lA2?.taux_commission === 25 && approx(lA2?.net, 21.075), JSON.stringify({ c: lC?.commission, n: lC?.net, a: lA2?.net }));

    // ── 8. Tableau de bord ──
    const dash = (q) => C('GET', `/api/dashboard/v2?from=${today}&to=${today}&${q}`);
    r = await dash('tab=ventes');
    const k = r.body?.kpis;
    check('dashboard ventes : CA 110, CA prestataires 60, commissions 16,500, TVA 3,135, net prestataires 40,365', r.status === 200 && approx(k?.ca, 110) && approx(k?.ca_prestataires, 60) && approx(k?.commissions, 16.5) && approx(k?.tva_commissions, 3.135) && approx(k?.net_prestataires, 40.365), `${r.status} ${JSON.stringify(k && { ca: k.ca, cp: k.ca_prestataires, c: k.commissions, t: k.tva_commissions, n: k.net_prestataires })}`);
    check('dashboard : marge après commissions = brute − 19,635 ; cascade commissions 19,635', approx(k?.marge_apres_com, k?.marge_brute - 19.635) && approx(r.body?.waterfall?.commissions, 19.635), JSON.stringify({ b: k?.marge_brute, a: k?.marge_apres_com, w: r.body?.waterfall?.commissions }));
    const canalP = r.body?.par_canal?.find?.((c) => c.canal === presta.nom); const canalD = r.body?.par_canal?.find?.((c) => c.canal === 'Direct');
    check('par canal : prestataire CA 60, commissions 16,5, TVA 3,135, net 40,365 ; Direct net 50', approx(canalP?.ca, 60) && approx(canalP?.commissions, 16.5) && approx(canalP?.tva_commissions, 3.135) && approx(canalP?.net, 40.365) && approx(canalD?.net, 50), JSON.stringify(r.body?.par_canal));
    r = await dash(`tab=ventes&modesPaiement=${virement.id}`);
    check('filtre mode Virement : CA 60 (les 2 ventes prestataire)', approx(r.body?.kpis?.ca, 60) && r.body?.kpis?.nb_ventes === 2, JSON.stringify({ ca: r.body?.kpis?.ca, nb: r.body?.kpis?.nb_ventes }));
    r = await dash(`tab=ventes&modesPaiement=${especes.id}`);
    check('filtre mode Espèces : rien', approx(r.body?.kpis?.ca, 0) && r.body?.kpis?.nb_ventes === 0, JSON.stringify({ ca: r.body?.kpis?.ca, nb: r.body?.kpis?.nb_ventes }));
    r = await dash(`tab=ventes&prestataires=${presta.id}`);
    check('filtre prestataire : CA 60, net 40,365', approx(r.body?.kpis?.ca, 60) && approx(r.body?.kpis?.net_prestataires, 40.365), JSON.stringify({ ca: r.body?.kpis?.ca }));
    r = await dash('tab=overview');
    check('vue d\'ensemble : net prestataires 40,365, évolution « après commissions » = marge − 19,635', approx(r.body?.kpis?.net_prestataires, 40.365) && r.body?.evolution?.length === 1 && approx(r.body.evolution[0].marge_apres_com, r.body.evolution[0].marge - 19.635), JSON.stringify({ n: r.body?.kpis?.net_prestataires, e: r.body?.evolution }));
    r = await dash('tab=filtres');
    check('options des filtres : modes de paiement (Virement, Espèces)', Array.isArray(r.body?.modes_paiement) && r.body.modes_paiement.some((m) => m.id === virement.id && m.nom === 'Virement') && r.body.modes_paiement.some((m) => m.id === especes.id), JSON.stringify(r.body?.modes_paiement));

    // ── 9. Export Excel ──
    r = await C('GET', `/api/ventes/export-excel?activiteId=${act.id}&prestataireId=${presta.id}`);
    const x1 = r.status === 200 ? await texteClasseur(r.body) : '';
    check('export filtré par prestataire : colonnes Commission, TVA, Net, Mode ; 2 ventes prestataire, pas la directe', /Net \(DT\)/.test(x1) && /Mode de paiement/.test(x1) && x1.includes('21.075') && x1.includes('19.29') && !/Directe/.test(x1) && (x1.match(/Virement/g) || []).length === 2, `${r.status} ${x1.split('\n').slice(3, 7).join(' / ')}`);
    r = await C('GET', `/api/ventes/export-excel?activiteId=${act.id}&modePaiementId=${especes.id}`);
    const x2 = r.status === 200 ? await texteClasseur(r.body) : '';
    check('export filtré par mode Espèces : aucune vente', r.status === 200 && !/Virement/.test(x2) && !/Directe/.test(x2), `${r.status}`);

    // ── 10. Contrôles de propriétaire ──
    const autre = (await pool.query(
      `SELECT av.id FROM activite_articles_vendables av JOIN activites a ON a.id = av.activite_id
        JOIN profil_entreprise pe ON pe.id = a.entreprise_id WHERE pe.client_id <> $1 LIMIT 1`, [clientId])).rows[0];
    if (autre) {
      r = await C('DELETE', `/api/articles-vendables/${autre.id}`);
      const encore = (await pool.query('SELECT 1 FROM activite_articles_vendables WHERE id = $1', [autre.id])).rows.length === 1;
      check('supprimer l\'article vendable d\'un autre compte → 404, rien d\'effacé', r.status === 404 && encore, `${r.status} ${encore}`);
      r = await C('POST', '/api/article-prix-prestataire', { article_vendable_id: autre.id, activite_prestataire_id: lienId, prix_vente: 1 });
      check('prix prestataire sur l\'article d\'un autre compte → 404', r.status === 404, String(r.status));
    } else {
      check('contrôle de propriétaire (aucun autre compte en base locale : non testable ici)', true);
    }
    r = await C('DELETE', `/api/articles-vendables/${av2}`);
    check('supprimer son propre article vendable (thé) → 200', r.status === 200, String(r.status));

    // ── 11. Désactiver efface prix et conditions ──
    r = await C('DELETE', `${AP}/${lienId}`);
    check('désactivation → 200, 1 prix effacé', r.status === 200 && r.body?.prix_effaces === 1, `${r.status} ${JSON.stringify(r.body)}`);
    const restePrix = (await pool.query('SELECT COUNT(*)::int AS n FROM article_prix_prestataire WHERE activite_prestataire_id = $1', [lienId])).rows[0].n;
    r = await C('GET', `${AP}?activiteId=${act.id}`);
    check('plus de lien ni de prix ; les ventes passées restent (3)', restePrix === 0 && r.body.length === 0 && (await C('GET', `/api/ventes?activiteId=${act.id}`)).body.length === 3, `${restePrix} ${r.body?.length}`);
    r = await C('POST', AP, base);
    check('réactiver exige de nouveau les conditions → 400', r.status === 400 && r.body?.code === 'CONDITIONS_REQUISES', `${r.status} ${r.body?.code}`);
    r = await C('POST', AP, { ...base, taux_commission: 20, taux_tva: 19, mode_paiement_id: especes.id });
    check('réactivation 20 %, Espèces → 201', r.status === 201 && r.body?.mode_paiement_libelle === 'Espèces', `${r.status}`);
    r = await dash('tab=ventes');
    check('dashboard inchangé après réactivation : net prestataires toujours 40,365 (ventes figées)', approx(r.body?.kpis?.net_prestataires, 40.365), String(r.body?.kpis?.net_prestataires));

    // ── 12. Rejeu de la migration 238 ──
    try {
      await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '238_prestataires_conditions.sql'), 'utf8'));
      check('migration 238 rejouée sans erreur', true);
    } catch (e) { check('migration 238 rejouée sans erreur', false, e.message); }
    const tauxA = (await pool.query('SELECT taux_commission::text AS t FROM ventes WHERE id = $1', [vA.id])).rows[0]?.t;
    check('rejeu sans effet : la vente garde ses 25 %', tauxA === '25.00', String(tauxA));
  } catch (e) {
    check('déroulé sans exception', false, e.stack);
  } finally {
    await wipe();
    const reste = (await pool.query('SELECT COUNT(*)::int AS n FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT]])).rows[0].n;
    const modeReste = (await pool.query(`SELECT COUNT(*)::int AS n FROM modes_paiement WHERE code IN ('cheque', 'cheque_bancaire')`)).rows[0].n;
    check('nettoyage : comptes et mode d\'essai retirés', reste === 0 && modeReste === 0, `${reste} ${modeReste}`);
    const ok = results.filter((x) => x.ok).length;
    console.log(`\n${ok}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ok === results.length ? 0 : 1);
  }
})();
