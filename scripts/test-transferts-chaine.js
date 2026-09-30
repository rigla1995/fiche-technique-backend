/* Test E2E local — lot 1b (spec §8) : chaîne Économat (labo, production_active=false) → Cuisine
 * (labo) → Restaurant (activité) sur un compte de test Hôtellerie. TOUT passe par l'API (backend
 * démarré sur :3000, migrations au boot) : JAMAIS d'INSERT SQL de transferts. Le SQL ne sert qu'aux
 * mots de passe, aux assertions de lignes et au nettoyage (super_admin temporaire).
 *
 * Couvre : liens (cycle 400, source non labo 400, entreprise différente 400/404, gérant 403),
 * appro Économat 10 HT / 11,9 TTC, transfert Économat→Cuisine (stock ±, entrée 'transfert' valorisée,
 * PMP Cuisine, facture interne, historiques entrées/sorties avec sens/contrepartie), production PT à
 * la Cuisine (coût = portion × 11,9, consommation 'PT' valorisée), transfert Cuisine→Restaurant
 * (PT + article, stock PT déduit UNE fois), stock insuffisant 422, update → facture recalculée,
 * delete → 0 ligne transfert_id + lignes voisines intactes, LIGNE_DE_TRANSFERT 409, quotas 409
 * (activité, labo, gérant), flags (types-summary, VENTE_INACTIVE, PRODUCTION_INACTIVE, manuel),
 * onboarding par composant + POST purge, IA get_transferts (deux étages), dashboards (KPI séparés),
 * deleteLabo 409 LABO_UTILISE, exports Excel « Destination », GET /api/factures sens ; nettoyage. */
// ⚠️ Ce script crée des comptes par POST /admin/clients (email de bienvenue). Démarrer le backend de test par
//    « node scripts/start-test-backend.js » (clés externes vidées, resend bouchonné, réseau sortant bloqué) —
//    jamais par « npm start » avec le .env d'un poste de développement, qui contient de vraies clés.
require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const stockService = require('../src/services/stockService');
const { executeToolCall } = require('../src/services/aiToolHandlers');

const BASE = 'http://localhost:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const approx = (a, b, eps = 0.002) => Math.abs(Number(a) - Number(b)) <= eps;
const today = new Date().toISOString().slice(0, 10);

const ADMIN_EMAIL = 'test-admin-transferts@example.com';
const CLIENT_EMAIL = 'test-transferts-hotel@example.com';
const GERANT_EMAIL = 'test-transferts-gerant@example.com';
const PWD = 'TestTransf2026!';
// Le super_admin temporaire reçoit un mot de passe ALÉATOIRE (jamais réutilisable si un crash
// avant le nettoyage laissait la ligne en base).
const ADMIN_PWD = require('crypto').randomBytes(18).toString('base64url');

(async () => {
  const hash = await bcrypt.hash(PWD, 10);
  const adminHash = await bcrypt.hash(ADMIN_PWD, 10);
  const wipe = async () => {
    await pool.query(`DELETE FROM utilisateurs WHERE email = ANY($1)`, [[ADMIN_EMAIL, CLIENT_EMAIL, GERANT_EMAIL]]);
  };
  await wipe();
  await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminTransf', $1, $2, 'super_admin', true)`,
    [ADMIN_EMAIL, adminHash]
  );
  const login = async (email, password = PWD) => {
    const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    return (await r.json()).token;
  };
  const mk = (tok) => async (url, opts = {}) => {
    const res = await fetch(`${BASE}${url}`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }, ...opts });
    let body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    return { status: res.status, body };
  };
  const post = (J, url, body) => J(url, { method: 'POST', body: JSON.stringify(body) });
  const put = (J, url, body) => J(url, { method: 'PUT', body: JSON.stringify(body) });
  const patch = (J, url, body) => J(url, { method: 'PATCH', body: JSON.stringify(body) });
  const del = (J, url) => J(url, { method: 'DELETE' });
  const xlsx = async (tok, url) => {
    const res = await fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (res.status !== 200) return { status: res.status, rows: [] };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
    const ws = wb.worksheets[0];
    const rows = [];
    ws.eachRow((row) => rows.push(row.values.slice(1).map((v) => (v && typeof v === 'object' && v.richText ? v.richText.map((t) => t.text).join('') : v))));
    return { status: 200, rows };
  };

  const admTok = await login(ADMIN_EMAIL, ADMIN_PWD);
  const A = mk(admTok);
  check('login super_admin temporaire', !!admTok);
  let clientId = null;
  try {
    // ── 0. Domaine hôtellerie + composants ─────────────────────────────────────
    let { status, body } = await A('/api/domaines');
    const hot = Array.isArray(body) ? body.find((d) => d.slug === 'hotellerie') : null;
    check('domaine hôtellerie présent (restaurant, housekeeping, cuisine, économat)', !!hot && ['restaurant', 'housekeeping', 'cuisine', 'economat'].every((c) => hot.composants.some((x) => x.code === c)), String(status));
    if (!hot) throw new Error('domaine hôtellerie absent');
    const comp = (code) => hot.composants.find((c) => c.code === code);

    // ── 1. Client de test : 2 activités (restaurant + housekeeping), 2 labos (cuisine + économat), 1 responsable
    ({ status, body } = await post(A, '/admin/clients', {
      nom: 'TEST-Transf Hotel', email: CLIENT_EMAIL, telephone: '20999001', domaineId: hot.id, formuleActivites: 'premium', montantOnboarding: 700,
      composants: [{ code: 'restaurant', nb: 1 }, { code: 'housekeeping', nb: 1 }, { code: 'cuisine', nb: 2 }, { code: 'economat', nb: 1 }, { code: 'responsable', nb: 1 }],
    }));
    check('POST /admin/clients hôtellerie → 201', status === 201 && body?.id, `${status} ${body?.message || ''}`);
    clientId = body.id;
    await pool.query(`UPDATE utilisateurs SET mot_de_passe = $1, actif = true WHERE id = $2`, [hash, clientId]);
    const cliTok = await login(CLIENT_EMAIL);
    const C = mk(cliTok);
    check('login client de test', !!cliTok);

    // ── 2. Référentiel + article A ─────────────────────────────────────────────
    // Unité de mesure : le domaine hôtellerie la SEED désormais à la création du compte
    // (lot 1b §5, regles.unites_seed) → 201 (créée) ou 409 (déjà là) ; on récupère son id.
    let un = await post(C, '/api/unites', { name: 'kg' });
    if (un.status === 409) {
      const lst = await C('/api/unites');
      un = { status: 200, body: lst.body?.find?.((u) => u.name === 'kg') || null };
      check('unité « kg » seedée par le domaine hôtellerie (regles.unites_seed)', !!un.body?.id, JSON.stringify(lst.body?.map?.((u) => u.name)));
    }
    const fam = await post(C, '/api/familles', { name: 'TEST-Fam' });
    const cat = await post(C, '/api/categories', { name: 'TEST-Cat', familleId: fam.body?.id });
    const art = await post(C, '/api/articles', { name: 'Article A', unitId: un.body?.id, categorieId: cat.body?.id });
    const artB = await post(C, '/api/articles', { name: 'Article B', unitId: un.body?.id, categorieId: cat.body?.id });
    const aId = art.body?.id; const bId = artB.body?.id;
    check('référentiel + articles A/B créés', !!un.body?.id && !!fam.body?.id && !!cat.body?.id && !!aId && !!bId, `${un.status}/${fam.status}/${cat.status}/${art.status}`);

    // ── 3. Labos : Économat (production_active=false) → Cuisine (alimentée par l'Économat)
    ({ status, body } = await post(C, '/api/labo', { nom: 'Économat', refLabo: 'ECO', composantId: comp('economat').id }));
    check('POST /api/labo Économat (composant economat) → productionActive=false', status === 201 && body?.productionActive === false && body.composant?.code === 'economat', `${status} ${JSON.stringify({ p: body?.productionActive, c: body?.composant?.code })}`);
    const eco = body;
    ({ status, body } = await post(C, '/api/labo', { nom: 'Cuisine', refLabo: 'CUI', composantId: comp('cuisine').id, laboParentId: eco.id }));
    check('POST /api/labo Cuisine (laboParentId=Économat) → sourceUniteId = unité Économat', status === 201 && body?.sourceUniteId === eco.uniteId && body.laboParentId === eco.id && body.productionActive === true, `${status} ${JSON.stringify({ s: body?.sourceUniteId, e: eco.uniteId })}`);
    const cui = body;
    ({ status, body } = await post(C, '/api/labo', { nom: 'Pâtisserie', refLabo: 'PAT', composantId: comp('cuisine').id, laboParentId: 'abc' }));
    check('POST /api/labo laboParentId non numérique → 400 (jamais 5xx)', status === 400, String(status));
    ({ status, body } = await post(C, '/api/labo', { nom: 'Pâtisserie', refLabo: 'PAT', composantId: comp('cuisine').id, laboParentId: cui.id }));
    check('POST /api/labo Pâtisserie (laboParentId=Cuisine) → labo enfant de la Cuisine', status === 201 && body?.sourceUniteId === cui.uniteId && body.laboParentId === cui.id, `${status} ${JSON.stringify({ s: body?.sourceUniteId })}`);
    const pat = body;
    ({ status, body } = await post(C, '/api/labo', { nom: 'Labo 4', refLabo: 'L4' }));
    check('4e labo → 409 LIMITE_ATTEINTE (type labo, 3/3)', status === 409 && body?.code === 'LIMITE_ATTEINTE' && body.type === 'labo' && body.actuel === 3 && body.max === 3, `${status} ${JSON.stringify(body)}`);

    // ── 4. Activités : Restaurant (alimenté par la Cuisine) + Housekeeping (vente_active=false)
    ({ status, body } = await post(C, '/api/entreprise/activites', { nom: 'Restaurant', laboId: cui.id, composantId: comp('restaurant').id }));
    check('POST activité Restaurant (laboId=Cuisine) → venteActive=true, sourceUniteId = unité Cuisine', status === 201 && body?.venteActive === true && body.sourceUniteId === cui.uniteId, `${status} ${JSON.stringify({ v: body?.venteActive, s: body?.sourceUniteId })}`);
    const resto = body;
    ({ status, body } = await post(C, '/api/entreprise/activites', { nom: 'Housekeeping', composantId: comp('housekeeping').id }));
    check('POST activité Housekeeping → venteActive=false', status === 201 && body?.venteActive === false, `${status} ${body?.venteActive}`);
    const hk = body;
    ({ status, body } = await post(C, '/api/entreprise/activites', { nom: 'Bar' }));
    check('3e activité → 409 LIMITE_ATTEINTE (type activite, 2/2)', status === 409 && body?.code === 'LIMITE_ATTEINTE' && body.type === 'activite' && body.max === 2, `${status} ${JSON.stringify(body)}`);
    ({ status, body } = await post(C, `/api/entreprise/activites/${resto.id}/duplicate`, {}));
    check('duplicate au quota → 409 LIMITE_ATTEINTE', status === 409 && body?.code === 'LIMITE_ATTEINTE', String(status));

    // ── 5. Unités : liens (cycle, source non labo, autre entreprise), listes, gérant ─
    ({ status, body } = await C('/api/entreprise/unites'));
    check('GET /api/entreprise/unites → 5 unités (2 activités + 3 labos) avec composant/source', status === 200 && body?.length === 5 && body.find((u) => u.laboId === cui.id)?.sourceNom === 'Économat' && body.find((u) => u.laboId === pat.id)?.sourceNom === 'Cuisine' && body.find((u) => u.activiteId === resto.id)?.sourceUniteId === cui.uniteId, `${status} ${JSON.stringify(body?.map?.((u) => `${u.typeTechnique}:${u.nom}:${u.composant?.code}:${u.sourceNom}`))}`);
    ({ status, body } = await put(C, `/api/entreprise/unites/${eco.uniteId}`, { sourceUniteId: cui.uniteId }));
    check('PUT unités Économat alimenté par Cuisine → 400 CYCLE_INTERDIT', status === 400 && body?.code === 'CYCLE_INTERDIT', `${status} ${body?.code}`);
    ({ status, body } = await put(C, `/api/entreprise/unites/${cui.uniteId}`, { sourceUniteId: resto.uniteId }));
    check('PUT unités Cuisine alimentée par Restaurant → 400 SOURCE_NON_LABO', status === 400 && body?.code === 'SOURCE_NON_LABO', `${status} ${body?.code}`);
    ({ status, body } = await put(C, '/api/entreprise/unites/999999', { venteActive: false }));
    check('PUT unité inexistante → 404', status === 404, String(status));
    const autre = await pool.query('SELECT id FROM unites_operationnelles WHERE entreprise_id <> (SELECT id FROM profil_entreprise WHERE client_id = $1) ORDER BY id LIMIT 1', [clientId]);
    if (autre.rows.length) {
      ({ status, body } = await put(C, `/api/entreprise/unites/${autre.rows[0].id}`, { venteActive: false }));
      check('PUT unité d\'une autre entreprise → 404', status === 404, String(status));
      ({ status, body } = await put(C, `/api/entreprise/unites/${cui.uniteId}`, { sourceUniteId: autre.rows[0].id }));
      check('PUT source d\'une autre entreprise → 400 ENTREPRISE_DIFFERENTE', status === 400 && body?.code === 'ENTREPRISE_DIFFERENTE', `${status} ${body?.code}`);
    }
    ({ status, body } = await put(C, `/api/entreprise/unites/${cui.uniteId}`, { composantId: comp('restaurant').id }));
    check('PUT composant de type incompatible → 400 COMPOSANT_INVALIDE', status === 400 && body?.code === 'COMPOSANT_INVALIDE', `${status} ${body?.code}`);
    ({ status, body } = await C('/api/labo'));
    check('GET /api/labo → nbDestinations (Économat 1, Cuisine 2, Pâtisserie 0), productionActive Économat false', status === 200 && body.find((l) => l.id === eco.id)?.nbDestinations === 1 && body.find((l) => l.id === cui.id)?.nbDestinations === 2 && body.find((l) => l.id === pat.id)?.nbDestinations === 0 && body.find((l) => l.id === eco.id)?.productionActive === false, JSON.stringify(body?.map?.((l) => `${l.nom}:${l.nbDestinations}`)));
    ({ status, body } = await C(`/api/labo/${eco.id}`));
    check('GET /api/labo/:eco → destinations [l-cuisine], activites []', status === 200 && body?.destinations?.length === 1 && body.destinations[0].destKey === `l-${cui.id}` && body.destinations[0].type === 'labo' && body.activites?.length === 0, JSON.stringify(body?.destinations));
    ({ status, body } = await C(`/api/labo/${cui.id}`));
    check('GET /api/labo/:cui → destinations [a-restaurant, l-patisserie] + activites [Restaurant]', status === 200 && body?.destinations?.length === 2 && body.destinations[0].destKey === `a-${resto.id}` && body.destinations[1].destKey === `l-${pat.id}` && body.activites?.length === 1, JSON.stringify(body?.destinations));

    // Gérant (quota 1) : affecté à la Cuisine seule
    ({ status, body } = await post(C, '/api/abonnements/gerants', { nom: 'TEST-Gérant', telephone: '20999002', email: GERANT_EMAIL, laboIds: [cui.id] }));
    // L'envoi de l'email d'invitation peut échouer localement (clé Resend + domaine example.com) : le
    // gérant est créé et la réponse reste 201 avec emailEnvoye=false (jamais de 5xx).
    const gerantId = body?.id ?? null;
    check('POST gérant #1 (Cuisine) → 201 + emailEnvoye booléen (jamais 500)', status === 201 && !!body?.id && typeof body.emailEnvoye === 'boolean', `${status}${body?.emailEnvoye === false ? ' (email invitation KO — gérant créé)' : ''}`);
    ({ status, body } = await post(C, '/api/abonnements/gerants', { nom: 'TEST-Gérant 2', telephone: '20999003', email: 'test-transferts-gerant2@example.com', laboIds: [cui.id] }));
    check('POST gérant #2 → 409 LIMITE_ATTEINTE (type gerant, 1/1)', status === 409 && body?.code === 'LIMITE_ATTEINTE' && body.type === 'gerant' && body.max === 1, `${status} ${JSON.stringify(body)}`);
    await pool.query(`UPDATE utilisateurs SET mot_de_passe = $1, actif = true WHERE id = $2`, [hash, gerantId]);
    const gerTok = await login(GERANT_EMAIL);
    const G = mk(gerTok);
    check('login gérant', !!gerTok);
    ({ status, body } = await G('/api/entreprise/unites'));
    check('GET unités (gérant Cuisine) → Cuisine + sa source Économat seulement', status === 200 && body?.length === 2 && body.some((u) => u.laboId === cui.id) && body.some((u) => u.laboId === eco.id), JSON.stringify(body?.map?.((u) => u.nom)));
    ({ status, body } = await put(G, `/api/entreprise/unites/${cui.uniteId}`, { venteActive: false }));
    check('PUT unités (gérant) → 403', status === 403, String(status));

    // ── 6. Articles affectés + appro Économat (A à 10 HT / 11,9 TTC) ───────────
    await post(C, `/api/labo/${eco.id}/ingredients/${aId}/select`, {});
    await post(C, `/api/labo/${eco.id}/ingredients/${bId}/select`, {});
    ({ status, body } = await put(C, `/api/labo/${eco.id}/stock/${aId}`, { quantite: 100, prixUnitaire: 10, tauxTva: 19, dateAppro: today }));
    check('appro Économat A : 100 à 10 HT / TVA 19 → 200', status === 200, `${status} ${body?.message || ''}`);
    ({ status, body } = await put(C, `/api/labo/${eco.id}/stock/${bId}`, { quantite: 10, prixUnitaire: 5, tauxTva: 0, dateAppro: today }));
    ({ status, body } = await C(`/api/labo/${eco.id}/stock`));
    const stockOf = (rows, ingId) => rows?.find?.((r) => r.ingredientId === ingId);
    check('stock Économat A = 100, pmpUnitHT = 10', status === 200 && approx(stockOf(body, aId)?.quantite, 100) && approx(stockOf(body, aId)?.pmpUnitHT, 10), JSON.stringify({ q: stockOf(body, aId)?.quantite, p: stockOf(body, aId)?.pmpUnitHT }));

    // ── 7. Transfert Économat → Cuisine (article) ──────────────────────────────
    const stockEcoAvant = await stockService.computeStock(pool, 'labo', eco.id, { articleId: aId });
    const stockCuiAvant = await stockService.computeStock(pool, 'labo', cui.id, { articleId: aId });
    ({ status, body } = await post(C, `/api/labo/${eco.id}/transfer`, { dateTransfert: today, tauxTva: 19, transfers: [{ ingredientId: aId, quantite: 1 }] }));
    check('transfert sans destination → 400 DESTINATION_INVALIDE', status === 400 && body?.code === 'DESTINATION_INVALIDE', `${status} ${body?.code}`);
    ({ status, body } = await post(C, `/api/labo/${eco.id}/transfer`, { dateTransfert: today, tauxTva: 19, transfers: [{ activiteId: resto.id, laboDestId: cui.id, ingredientId: aId, quantite: 1 }] }));
    check('transfert avec deux destinations → 400 DESTINATION_INVALIDE', status === 400 && body?.code === 'DESTINATION_INVALIDE', `${status} ${body?.code}`);
    ({ status, body } = await post(C, `/api/labo/${eco.id}/transfer`, { dateTransfert: today, tauxTva: 19, transfers: [{ activiteId: resto.id, ingredientId: aId, quantite: 1 }] }));
    check('Économat → Restaurant (non rattaché) → 400 DESTINATION_NON_RATTACHEE', status === 400 && body?.code === 'DESTINATION_NON_RATTACHEE', `${status} ${body?.code}`);
    ({ status, body } = await post(C, `/api/labo/${eco.id}/transfer`, { dateTransfert: today, tauxTva: 19, transfers: [{ laboDestId: 'abc', ingredientId: aId, quantite: 1 }] }));
    check('laboDestId non numérique → 400 DESTINATION_INVALIDE (jamais 5xx)', status === 400 && body?.code === 'DESTINATION_INVALIDE', `${status} ${body?.code}`);
    ({ status, body } = await C(`/api/labo/${eco.id}/transfers?laboDestId=abc`));
    check('GET transfers?laboDestId=abc → 400', status === 400, String(status));
    ({ status, body } = await C('/api/factures?laboId=abc'));
    check('GET /api/factures?laboId=abc → 400', status === 400, String(status));
    ({ status, body } = await post(C, `/api/labo/${eco.id}/transfer`, { dateTransfert: today, tauxTva: 19, transfers: [{ laboDestId: cui.id, ingredientId: aId, quantite: 1000, prixUnitaire: 10 }] }));
    check('Économat → Cuisine 1000 → 422 STOCK_INSUFFISANT (disponible 100)', status === 422 && body?.code === 'STOCK_INSUFFISANT' && approx(body.disponible, 100), `${status} ${JSON.stringify(body)}`);
    ({ status, body } = await post(G, `/api/labo/${eco.id}/transfer`, { dateTransfert: today, tauxTva: 19, transfers: [{ laboDestId: cui.id, ingredientId: aId, quantite: 1, prixUnitaire: 10 }] }));
    check('gérant (Cuisine) transfère depuis l\'Économat → 403', status === 403, String(status));
    ({ status, body } = await post(C, `/api/labo/${eco.id}/transfer`, { dateTransfert: today, refFacture: 'INT-001', tauxTva: 19, transfers: [{ laboDestId: cui.id, ingredientId: aId, quantite: 40, prixUnitaire: 10 }] }));
    check('Économat → Cuisine 40 × 10 HT (réf INT-001) → 200 + transferIds', status === 200 && body?.success === true && body.transferIds?.length === 1, `${status} ${JSON.stringify(body)}`);
    const t1 = body?.transferIds?.[0];
    const stockEcoApres = await stockService.computeStock(pool, 'labo', eco.id, { articleId: aId });
    const stockCuiApres = await stockService.computeStock(pool, 'labo', cui.id, { articleId: aId });
    check('invariant : stock(source) = avant − 40, stock(dest) = avant + 40', approx(stockEcoApres, stockEcoAvant - 40) && approx(stockCuiApres, stockCuiAvant + 40), `${stockEcoAvant}→${stockEcoApres}, ${stockCuiAvant}→${stockCuiApres}`);
    const lignes = await pool.query(
      `SELECT labo_id, type_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, fournisseur_id, transfert_id, ref_facture, facture_id,
              (SELECT is_labo FROM fournisseurs f WHERE f.id = sld.fournisseur_id) AS f_is_labo,
              (SELECT labo_id FROM fournisseurs f WHERE f.id = sld.fournisseur_id) AS f_labo
         FROM stock_labo_daily sld WHERE transfert_id = $1 ORDER BY labo_id`,
      [t1]
    );
    const miroir = lignes.rows.find((r) => r.labo_id === eco.id);
    const entree = lignes.rows.find((r) => r.labo_id === cui.id);
    check('lignes SQL : miroir source manuel −40 (transfert_id) + entrée dest \'transfert\' +40 prix 10 / TVA 19 / TTC 11,9, fournisseur is_labo Économat',
      lignes.rows.length === 2 && miroir?.type_appro === 'manuel' && approx(miroir.quantite, -40)
      && entree?.type_appro === 'transfert' && approx(entree.quantite, 40) && approx(entree.prix_unitaire, 10) && approx(entree.taux_tva, 19) && approx(entree.prix_unitaire_tva, 11.9)
      && entree.f_is_labo === true && entree.f_labo === eco.id && entree.ref_facture === 'INT-001' && entree.facture_id != null,
      JSON.stringify(lignes.rows.map((r) => ({ l: r.labo_id, t: r.type_appro, q: r.quantite, p: r.prix_unitaire, ttc: r.prix_unitaire_tva }))));
    const lt = await pool.query('SELECT labo_id, labo_dest_id, activite_id, source_unite_id, dest_unite_id FROM labo_transfers WHERE id = $1', [t1]);
    check('labo_transfers : labo_dest_id = Cuisine, activite_id NULL, unités source/dest posées', lt.rows[0]?.labo_dest_id === cui.id && lt.rows[0].activite_id === null && lt.rows[0].source_unite_id === eco.uniteId && lt.rows[0].dest_unite_id === cui.uniteId, JSON.stringify(lt.rows[0]));
    ({ status, body } = await C(`/api/labo/${cui.id}/stock`));
    check('stock Cuisine A = 40 (sélection importée), pmpUnitHT = 10', status === 200 && approx(stockOf(body, aId)?.quantite, 40) && approx(stockOf(body, aId)?.pmpUnitHT, 10), JSON.stringify({ q: stockOf(body, aId)?.quantite, p: stockOf(body, aId)?.pmpUnitHT }));
    const pmpCui = await stockService.computePmp(pool, 'labo', cui.id, aId, {});
    check('computePmp Cuisine A : pmpHT 10, pmpTTC 11,9', approx(pmpCui.pmpHT, 10) && approx(pmpCui.pmpTTC, 11.9), JSON.stringify(pmpCui));
    ({ status, body } = await C(`/api/factures?laboId=${cui.id}`));
    const fRecue = body?.find?.((f) => f.refFacture === 'INT-001');
    check('GET /api/factures?laboId=Cuisine → facture interne reçue (sens recue, contrepartie Économat, HT 400 / TTC 476)', status === 200 && fRecue?.sens === 'recue' && fRecue.contrepartieNom === 'Économat' && fRecue.typeSource === 'transfert' && approx(fRecue.montantHT, 400) && approx(fRecue.montantTTC, 476), JSON.stringify(fRecue));
    ({ status, body } = await C(`/api/factures?laboId=${eco.id}&sens=emise`));
    check('GET /api/factures?laboId=Économat&sens=emise → INT-001 (cession émise → Cuisine, contrepartie Cuisine)', status === 200 && body?.length === 1 && body[0].refFacture === 'INT-001' && body[0].sens === 'emise' && body[0].contrepartieNom === 'Cuisine', JSON.stringify(body?.map?.((f) => [f.refFacture, f.sens, f.contrepartieNom])));
    ({ status, body } = await C(`/api/factures?laboId=${eco.id}&laboDestId=${cui.id}`));
    check('GET /api/factures?laboId=Économat&laboDestId=Cuisine → INT-001', status === 200 && body?.length === 1 && body[0].refFacture === 'INT-001', String(body?.length));
    ({ status, body } = await C(`/api/factures?laboId=${eco.id}&sens=recue`));
    check('GET /api/factures?laboId=Économat&sens=recue → [] (rien reçu)', status === 200 && body?.length === 0, String(body?.length));
    ({ status, body } = await C(`/api/factures?laboId=${cui.id}&sens=recue`));
    check('GET /api/factures?laboId=Cuisine&sens=recue → INT-001 (recue ← Économat)', status === 200 && body?.length === 1 && body[0].sens === 'recue' && body[0].contrepartieNom === 'Économat', JSON.stringify(body?.map?.((f) => [f.refFacture, f.sens])));
    if (fRecue?.id) {
      ({ status, body } = await C(`/api/factures/${fRecue.id}/lignes`));
      check('GET /api/factures/:id/lignes (facture reçue, labo) → 1 ligne stock_labo_daily 40 × 10', status === 200 && Array.isArray(body) && body.length === 1 && approx(body[0].quantite, 40), `${status} ${JSON.stringify(body?.[0] && { q: body[0].quantite, p: body[0].prixUnitaire ?? body[0].prix_unitaire })}`);
      const pdfRes = await fetch(`${BASE}/api/factures/${fRecue.id}/pdf`, { headers: { Authorization: `Bearer ${cliTok}` } });
      const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
      check('GET /api/factures/:id/pdf (labo → labo, sans activité) → PDF', pdfRes.status === 200 && pdfBuf.slice(0, 4).toString() === '%PDF' && pdfBuf.length > 1000, `${pdfRes.status} ${pdfBuf.length} octets`);
    }
    ({ status, body } = await C(`/api/labo/${cui.id}/historique`));
    const hEntree = body?.find?.((r) => r.typeAppro === 'transfert' && r.ingredientId === aId);
    check('historique Cuisine : entrée typeAppro transfert, sens entree, contrepartie Économat', status === 200 && hEntree?.sens === 'entree' && hEntree.contrepartieNom === 'Économat' && approx(hEntree.quantite, 40), JSON.stringify(hEntree));
    ({ status, body } = await C(`/api/labo/${eco.id}/historique`));
    const hSortie = body?.find?.((r) => r.typeAppro === 'transfert' && r.ingredientId === aId);
    check('historique Économat : sortie sens sortie, contrepartie Cuisine, destType labo', status === 200 && hSortie?.sens === 'sortie' && hSortie.contrepartieNom === 'Cuisine' && hSortie.destType === 'labo' && hSortie.laboDestId === cui.id, JSON.stringify(hSortie));
    ({ status, body } = await C(`/api/labo/${cui.id}/historique?typeFilter=manuel`));
    check('historique Cuisine typeFilter=manuel : entrée transfert absente (servie par la branche entrées)', status === 200 && !body.some((r) => r.typeAppro === 'transfert'), String(body?.length));
    ({ status, body } = await C(`/api/labo/${eco.id}/transfers?ingredientId=${aId}&limit=5`));
    check('GET transfers?ingredientId (alarme même jour) : destType labo, destNom Cuisine, laboDestId', status === 200 && body?.[0]?.destType === 'labo' && body[0].destNom === 'Cuisine' && body[0].laboDestId === cui.id && body[0].destKey === `l-${cui.id}`, JSON.stringify(body?.[0]));
    ({ status, body } = await C(`/api/labo/${eco.id}/transfers?laboDestId=${cui.id}`));
    check('GET transfers?laboDestId → 1 ligne', status === 200 && body?.length === 1, String(body?.length));
    ({ status, body } = await C(`/api/labo/${cui.id}/stock/${aId}/history`));
    check('historique article Cuisine (StockLaboPage) : sens entree + contrepartie Économat', status === 200 && body?.some((r) => r.sens === 'entree' && r.contrepartieNom === 'Économat'), JSON.stringify(body?.[0]));
    const entreeId = (await pool.query('SELECT id FROM stock_labo_daily WHERE transfert_id = $1 AND labo_id = $2', [t1, cui.id])).rows[0]?.id;
    ({ status, body } = await put(C, `/api/labo/${cui.id}/historique/${entreeId}`, { quantite: 1 }));
    check('PUT historique sur l\'entrée de transfert → 409 LIGNE_DE_TRANSFERT', status === 409 && body?.code === 'LIGNE_DE_TRANSFERT', `${status} ${body?.code}`);
    ({ status, body } = await del(C, `/api/labo/${cui.id}/historique/${entreeId}`));
    check('DELETE historique sur l\'entrée de transfert → 409 LIGNE_DE_TRANSFERT', status === 409 && body?.code === 'LIGNE_DE_TRANSFERT', `${status} ${body?.code}`);
    ({ status, body } = await C(`/api/labo/${cui.id}/fournisseurs`));
    check('GET /api/labo/:cui/fournisseurs → fournisseur is_labo de la SOURCE (Économat, isLabo)', status === 200 && body?.some((f) => f.nom === 'Économat' && f.isLabo === true), JSON.stringify(body));

    // ── 8. Production PT à la Cuisine : coût = portion × 11,9 ─────────────────
    ({ status, body } = await post(C, '/api/produits', { nom: 'PT Sauce', type: 'utilisable', origine: 'labo', laboIds: [cui.id], activiteIds: [resto.id], ingredients: [{ ingredientId: aId, portion: 2 }] }));
    check('POST /api/produits PT (origine labo Cuisine, affecté au Restaurant) → 201', status === 201 && body?.id, `${status} ${body?.message || JSON.stringify(body?.errors || '')}`);
    const ptId = body?.id;
    ({ status, body } = await put(C, `/api/labo/${eco.id}/stock/${-ptId}`, { quantite: 1, dateAppro: today }));
    check('production PT à l\'Économat (production_active=false) → 400 PRODUCTION_INACTIVE', status === 400 && body?.code === 'PRODUCTION_INACTIVE', `${status} ${body?.code}`);
    ({ status, body } = await put(C, `/api/labo/${cui.id}/stock/${-ptId}`, { quantite: 50, dateAppro: today }));
    check('production PT Cuisine 50 (besoin 100 A, dispo 40) → 422 STOCK_INSUFFISANT', status === 422 && body?.code === 'STOCK_INSUFFISANT', `${status} ${body?.code}`);
    ({ status, body } = await put(C, `/api/labo/${cui.id}/stock/${-ptId}`, { quantite: 5, dateAppro: today }));
    check('production PT Cuisine 5 → coût PT = 2 × 11,9 = 23,8 (pas 0)', status === 200 && approx(body?.prixCalcule, 23.8), `${status} ${JSON.stringify(body)}`);
    const conso = await pool.query(`SELECT quantite, prix_unitaire, prix_unitaire_tva FROM stock_labo_daily WHERE labo_id = $1 AND ingredient_id = $2 AND type_appro = 'PT'`, [cui.id, aId]);
    check('consommation \'PT\' valorisée : −10 A à 10 HT / 11,9 TTC', conso.rows.length === 1 && approx(conso.rows[0].quantite, -10) && approx(conso.rows[0].prix_unitaire, 10) && approx(conso.rows[0].prix_unitaire_tva, 11.9), JSON.stringify(conso.rows));
    ({ status, body } = await C(`/api/labo/${cui.id}/stock`));
    check('stock Cuisine : A = 30, PT = 5', approx(stockOf(body, aId)?.quantite, 30) && approx(stockOf(body, -ptId)?.quantite, 5), JSON.stringify({ a: stockOf(body, aId)?.quantite, pt: stockOf(body, -ptId)?.quantite }));

    // ── 9. Transfert Cuisine → Restaurant (PT + article) ──────────────────────
    ({ status, body } = await post(C, `/api/labo/${cui.id}/transfer`, { dateTransfert: today, tauxTva: 0, transfers: [{ activiteId: resto.id, ingredientId: -ptId, quantite: 10, prixUnitaire: 23.8 }] }));
    check('Cuisine → Restaurant 10 PT (dispo 5) → 422 STOCK_INSUFFISANT', status === 422 && body?.code === 'STOCK_INSUFFISANT' && approx(body.disponible, 5), `${status} ${JSON.stringify(body)}`);
    // Un POST par ingrédient (comme TransferPage) : PT en TVA 0 (prix TTC = HT), article en TVA 19.
    ({ status, body } = await post(C, `/api/labo/${cui.id}/transfer`, { dateTransfert: today, refFacture: 'INT-002', tauxTva: 0, transfers: [{ activiteId: resto.id, ingredientId: -ptId, quantite: 2, prixUnitaire: 23.8 }] }));
    const tPt = body?.transferIds?.[0];
    const stPt = status;
    ({ status, body } = await post(C, `/api/labo/${cui.id}/transfer`, { dateTransfert: today, refFacture: 'INT-002', tauxTva: 19, transfers: [{ activiteId: resto.id, ingredientId: aId, quantite: 5, prixUnitaire: 10 }] }));
    const tA = body?.transferIds?.[0];
    check('Cuisine → Restaurant : 2 PT (TVA 0) + 5 A (TVA 19), réf INT-002 → 200 × 2', stPt === 200 && status === 200 && tPt && tA, `${stPt}/${status}`);
    const stockPtCui = await stockService.computeStock(pool, 'labo', cui.id, { produitId: ptId });
    const stockACui = await stockService.computeStock(pool, 'labo', cui.id, { articleId: aId });
    const stockAResto = await stockService.computeStock(pool, 'activite', resto.id, { articleId: aId });
    const stockPtResto = await stockService.computeStock(pool, 'activite', resto.id, { produitId: ptId });
    check('stock PT Cuisine = 5 − 2 = 3 (déduit UNE fois), A Cuisine = 25, Restaurant A = 5, PT = 2', approx(stockPtCui, 3) && approx(stockACui, 25) && approx(stockAResto, 5) && approx(stockPtResto, 2), JSON.stringify({ stockPtCui, stockACui, stockAResto, stockPtResto }));
    ({ status, body } = await C(`/api/labo/${cui.id}/stock`));
    check('getLaboStock Cuisine PT = 3 (net miroir = CTE labo_transfers)', approx(stockOf(body, -ptId)?.quantite, 3), String(stockOf(body, -ptId)?.quantite));
    const ptRows = await pool.query(`SELECT labo_id, type_appro, quantite, transfert_id FROM stock_labo_pt_daily WHERE transfert_id = $1`, [tPt]);
    const sptRows = await pool.query(`SELECT quantite, transfert_id, prix_calcule FROM stock_produits_transformes WHERE transfert_id = $1`, [tPt]);
    check('PT : miroir source type NULL −2 (transfert_id) + entrée activité +2', ptRows.rows.length === 1 && ptRows.rows[0].type_appro === null && approx(ptRows.rows[0].quantite, -2) && sptRows.rows.length === 1 && approx(sptRows.rows[0].quantite, 2), JSON.stringify({ pt: ptRows.rows, spt: sptRows.rows }));
    ({ status, body } = await C(`/api/factures?activiteId=${resto.id}`));
    const fEmise = body?.find?.((f) => f.refFacture === 'INT-002');
    check('facture INT-002 (activité) : articles seulement HT 50, sens emise, contrepartie Restaurant', fEmise && approx(fEmise.montantHT, 50) && fEmise.sens === 'emise' && fEmise.contrepartieNom === 'Restaurant', JSON.stringify(fEmise));
    const sedId = (await pool.query('SELECT id FROM stock_entreprise_daily WHERE transfert_id = $1', [tA])).rows[0]?.id;
    ({ status, body } = await put(C, `/api/stock/historique/${sedId}`, { isEntreprise: true, quantite: 1 }));
    check('PUT /api/stock/historique (entrée transfert côté activité) → 409 LIGNE_DE_TRANSFERT', status === 409 && body?.code === 'LIGNE_DE_TRANSFERT', `${status} ${body?.code}`);
    ({ status, body } = await del(C, `/api/stock/historique/${sedId}?isEntreprise=true`));
    check('DELETE /api/stock/historique (entrée transfert côté activité) → 409 LIGNE_DE_TRANSFERT', status === 409 && body?.code === 'LIGNE_DE_TRANSFERT', `${status} ${body?.code}`);
    ({ status, body } = await C(`/api/labo/${cui.id}/transfers`));
    check('GET transfers Cuisine : 2 lignes destType activite / destNom Restaurant (activiteNom conservé)', status === 200 && body?.length === 2 && body.every((r) => r.destType === 'activite' && r.destNom === 'Restaurant' && r.activiteNom === 'Restaurant'), JSON.stringify(body?.map?.((r) => [r.destType, r.destNom])));

    // ── 9b. Transfert PT labo → labo (Cuisine → Pâtisserie) : création, 3 formules de stock PT,
    //        prix HT/TVA/TTC de l'entrée, historiques, PATCH, DELETE ──────────────────────────
    ({ status, body } = await post(C, `/api/labo/${cui.id}/transfer`, { dateTransfert: today, tauxTva: 0, transfers: [{ laboDestId: pat.id, ingredientId: -ptId, quantite: 2, prixUnitaire: 23.8 }] }));
    check('Cuisine → Pâtisserie 2 PT non affecté à la Pâtisserie → 400 PT_NON_AFFECTE', status === 400 && body?.code === 'PT_NON_AFFECTE', `${status} ${body?.code}`);
    ({ status, body } = await put(C, `/api/produits/${ptId}`, { nom: 'PT Sauce', laboIds: [cui.id, pat.id], activiteIds: [resto.id] }));
    check('PUT /api/produits/:id laboIds [Cuisine, Pâtisserie] → PT affecté à la Pâtisserie', status === 200, `${status} ${body?.message || JSON.stringify(body?.errors || '')}`);
    const ptCuiAvant = await stockService.computeStock(pool, 'labo', cui.id, { produitId: ptId });
    ({ status, body } = await post(C, `/api/labo/${cui.id}/transfer`, { dateTransfert: today, tauxTva: 0, transfers: [{ laboDestId: pat.id, ingredientId: -ptId, quantite: 2, prixUnitaire: 23.8 }] }));
    check('Cuisine → Pâtisserie 2 PT (23,8, TVA 0) → 200', status === 200 && body?.transferIds?.length === 1, `${status} ${JSON.stringify(body)}`);
    const tPL = body?.transferIds?.[0];
    const ptCuiApres = await stockService.computeStock(pool, 'labo', cui.id, { produitId: ptId });
    const ptPatApres = await stockService.computeStock(pool, 'labo', pat.id, { produitId: ptId });
    check('computeStock PT : Cuisine = avant − 2 (déduit UNE fois), Pâtisserie = 2', approx(ptCuiApres, ptCuiAvant - 2) && approx(ptPatApres, 2), `${ptCuiAvant}→${ptCuiApres}, pat ${ptPatApres}`);
    ({ status, body } = await C(`/api/labo/${cui.id}/stock`));
    const gCui = stockOf(body, -ptId)?.quantite;
    ({ status, body } = await C(`/api/labo/${pat.id}/stock`));
    const gPat = stockOf(body, -ptId);
    check('getLaboStock PT (net miroir) = computeStock : Cuisine, Pâtisserie', approx(gCui, ptCuiApres) && approx(gPat?.quantite, ptPatApres), JSON.stringify({ gCui, gPat: gPat?.quantite, prix: gPat?.prixUnitaire }));
    const plRows = await pool.query(`SELECT labo_id, type_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, fournisseur_id,
              (SELECT labo_id FROM fournisseurs f WHERE f.id = s.fournisseur_id AND f.is_labo) AS f_labo
         FROM stock_labo_pt_daily s WHERE transfert_id = $1 ORDER BY labo_id`, [tPL]);
    const plSrc = plRows.rows.find((r) => r.labo_id === cui.id);
    const plDst = plRows.rows.find((r) => r.labo_id === pat.id);
    check('lignes SQL PT : miroir source type NULL −2 + entrée Pâtisserie \'transfert\' +2 prix 23,8 / TVA 0 / TTC 23,8, fournisseur is_labo Cuisine',
      plRows.rows.length === 2 && plSrc?.type_appro === null && approx(plSrc.quantite, -2) && plDst?.type_appro === 'transfert' && approx(plDst.quantite, 2)
      && approx(plDst.prix_unitaire, 23.8) && approx(plDst.taux_tva, 0) && approx(plDst.prix_unitaire_tva, 23.8) && plDst.f_labo === cui.id,
      JSON.stringify(plRows.rows.map((r) => ({ l: r.labo_id, t: r.type_appro, q: r.quantite, p: r.prix_unitaire, ttc: r.prix_unitaire_tva }))));
    ({ status, body } = await C(`/api/labo/${pat.id}/historique`));
    const hPt = body?.find?.((r) => r.ingredientId === -ptId);
    check('historique Pâtisserie : PT reçu typeAppro transfert, sens entree, contrepartie Cuisine (puce « Reçu »)', status === 200 && hPt?.typeAppro === 'transfert' && hPt.sens === 'entree' && hPt.contrepartieNom === 'Cuisine' && approx(hPt.quantite, 2), JSON.stringify(hPt));
    ({ status, body } = await C(`/api/labo/${cui.id}/stock/${-ptId}/history`));
    check('historique PT Cuisine (StockLaboPage) : sortie vers la Pâtisserie sens sortie, contrepartie Pâtisserie', status === 200 && body.some((r) => r.sens === 'sortie' && r.contrepartieNom === 'Pâtisserie'), JSON.stringify(body?.filter?.((r) => r.sens === 'sortie').map((r) => [r.sens, r.contrepartieNom])));
    ({ status, body } = await C(`/api/labo/${pat.id}/stock/${-ptId}/history`));
    check('historique PT Pâtisserie (StockLaboPage) : sens entree', status === 200 && body?.some((r) => r.sens === 'entree'), JSON.stringify(body?.[0]));
    ({ status, body } = await patch(C, `/api/labo/${cui.id}/transfers/${tPL}`, { quantite: 100 }));
    check('PATCH PT labo→labo 2 → 100 → 422 STOCK_INSUFFISANT (contrôle à la hausse)', status === 422 && body?.code === 'STOCK_INSUFFISANT', `${status} ${body?.code}`);
    ({ status, body } = await patch(C, `/api/labo/${cui.id}/transfers/${tPL}`, { quantite: 1 }));
    const plQ = await pool.query(`SELECT labo_id, quantite FROM stock_labo_pt_daily WHERE transfert_id = $1 ORDER BY labo_id`, [tPL]);
    check('PATCH PT labo→labo 2 → 1 : les 2 lignes stock_labo_pt_daily mises à jour −1 / +1', status === 200 && plQ.rows.length === 2 && approx(plQ.rows.find((r) => r.labo_id === cui.id)?.quantite, -1) && approx(plQ.rows.find((r) => r.labo_id === pat.id)?.quantite, 1), JSON.stringify(plQ.rows));
    check('après PATCH : computeStock Cuisine = avant − 1, Pâtisserie = 1', approx(await stockService.computeStock(pool, 'labo', cui.id, { produitId: ptId }), ptCuiAvant - 1) && approx(await stockService.computeStock(pool, 'labo', pat.id, { produitId: ptId }), 1));
    ({ status, body } = await del(C, `/api/labo/${cui.id}/transfers/${tPL}`));
    const plRest = await pool.query(`SELECT COUNT(*)::int AS n FROM stock_labo_pt_daily WHERE transfert_id = $1`, [tPL]);
    ({ status: status, body: body } = await C(`/api/labo/${cui.id}/stock`));
    check('DELETE PT labo→labo → 0 ligne transfert_id, Cuisine revient à avant (computeStock = getLaboStock), Pâtisserie 0', plRest.rows[0].n === 0 && approx(await stockService.computeStock(pool, 'labo', cui.id, { produitId: ptId }), ptCuiAvant) && approx(stockOf(body, -ptId)?.quantite, ptCuiAvant) && approx(await stockService.computeStock(pool, 'labo', pat.id, { produitId: ptId }), 0), JSON.stringify({ rest: plRest.rows[0].n, g: stockOf(body, -ptId)?.quantite }));

    // ── 10. Update (facture recalculée) / prix d'édition / delete ─────────────
    ({ status, body } = await patch(C, `/api/labo/${eco.id}/transfers/${t1}`, { quantite: 1000 }));
    check('PATCH transfert INT-001 40 → 1000 → 422 STOCK_INSUFFISANT (dispo Économat 60)', status === 422 && body?.code === 'STOCK_INSUFFISANT' && approx(body.disponible, 60), `${status} ${JSON.stringify(body)}`);
    ({ status, body } = await patch(C, `/api/labo/${eco.id}/transfers/${t1}`, { quantite: 30 }));
    check('PATCH transfert INT-001 40 → 30 → 200', status === 200 && approx(body?.quantite, 30), `${status} ${JSON.stringify(body)}`);
    const f1 = await pool.query(`SELECT montant_ht, montant_tva, montant_ttc FROM factures WHERE client_id = $1 AND ref_facture = 'INT-001'`, [clientId]);
    check('facture INT-001 recalculée : HT 300 / TVA 57 / TTC 357', f1.rows.length === 1 && approx(f1.rows[0].montant_ht, 300) && approx(f1.rows[0].montant_tva, 57) && approx(f1.rows[0].montant_ttc, 357), JSON.stringify(f1.rows));
    const q1 = await pool.query(`SELECT labo_id, quantite FROM stock_labo_daily WHERE transfert_id = $1 ORDER BY labo_id`, [t1]);
    check('lignes du transfert mises à jour par transfert_id : −30 / +30', q1.rows.length === 2 && approx(q1.rows.find((r) => r.labo_id === eco.id).quantite, -30) && approx(q1.rows.find((r) => r.labo_id === cui.id).quantite, 30), JSON.stringify(q1.rows));
    ({ status, body } = await C(`/api/labo/${eco.id}/transfers/${t1}/prix`));
    check('GET transfers/:id/prix → { pmpHT 10, pmpTTC 11,9, dernierAchatHT 10, prixUnitaire 10 }', status === 200 && approx(body?.pmpHT, 10) && approx(body.pmpTTC, 11.9) && approx(body.dernierAchatHT, 10) && approx(body.prixUnitaire, 10), JSON.stringify(body));
    ({ status, body } = await patch(C, `/api/labo/${cui.id}/transfers/${tA}`, { quantite: 4 }));
    const f2 = await pool.query(`SELECT montant_ht, montant_ttc FROM factures WHERE client_id = $1 AND ref_facture = 'INT-002'`, [clientId]);
    check('PATCH transfert labo→activité 5 → 4 : facture INT-002 recalculée (HT 40 / TTC 47,6) — écart existant corrigé', status === 200 && approx(f2.rows[0]?.montant_ht, 40) && approx(f2.rows[0]?.montant_ttc, 47.6), JSON.stringify(f2.rows));
    // delete : transfert dédié (réf INT-003) ; les lignes voisines (même unité/article/date) ne bougent pas
    ({ status, body } = await post(C, `/api/labo/${eco.id}/transfer`, { dateTransfert: today, refFacture: 'INT-003', tauxTva: 19, transfers: [{ laboDestId: cui.id, ingredientId: aId, quantite: 5, prixUnitaire: 10 }] }));
    const t3 = body?.transferIds?.[0];
    const countAll = async () => (await pool.query(
      `SELECT (SELECT COUNT(*) FROM stock_labo_daily WHERE labo_id IN ($1, $2))::int AS sld,
              (SELECT COUNT(*) FROM stock_entreprise_daily WHERE activite_id = $3)::int AS sed,
              (SELECT COUNT(*) FROM stock_labo_pt_daily WHERE labo_id IN ($1, $2))::int AS slpt,
              (SELECT COUNT(*) FROM stock_produits_transformes WHERE activite_id = $3)::int AS spt,
              (SELECT COUNT(*) FROM labo_transfers WHERE labo_id IN ($1, $2))::int AS lt`,
      [eco.id, cui.id, resto.id])).rows[0];
    const avant = await countAll();
    ({ status, body } = await del(C, `/api/labo/${eco.id}/transfers/${t3}`));
    const apres = await countAll();
    const rest = await pool.query(`SELECT COUNT(*)::int AS n FROM stock_labo_daily WHERE transfert_id = $1`, [t3]);
    const f3 = await pool.query(`SELECT id FROM factures WHERE client_id = $1 AND ref_facture = 'INT-003'`, [clientId]);
    check('DELETE transfert INT-003 → 200, 0 ligne transfert_id, exactement 2 lignes stock + 1 labo_transfers en moins, facture supprimée',
      status === 200 && rest.rows[0].n === 0 && apres.sld === avant.sld - 2 && apres.sed === avant.sed && apres.slpt === avant.slpt && apres.spt === avant.spt && apres.lt === avant.lt - 1 && f3.rows.length === 0,
      JSON.stringify({ status, avant, apres, rest: rest.rows[0].n, f3: f3.rows.length }));
    const stockEcoFin = await stockService.computeStock(pool, 'labo', eco.id, { articleId: aId });
    check('stock Économat après update/delete = 100 − 30 = 70', approx(stockEcoFin, 70), String(stockEcoFin));
    ({ status, body } = await patch(G, `/api/labo/${eco.id}/transfers/${t1}`, { quantite: 31 }));
    check('gérant modifie un transfert qu\'il n\'a pas créé → 403', status === 403, String(status));

    // ── 10b. Transferts HISTORIQUES simulés (INSERT SQL autorisé ici : ils reproduisent des données
    //         antérieures à la 188 — jamais le flux courant). B-1 : deux transferts PT identiques
    //         (miroirs ambigus NON liés, entrées liées) → le delete doit aussi retirer UN miroir, sinon
    //         getLaboPT (net miroir) ≠ computeStock. I-3 : fenêtre de grâce après la 188 ; 409 au-delà.
    const at188 = (await pool.query(`SELECT applied_at FROM _migrations WHERE filename = '188_unites_operationnelles_transferts.sql'`)).rows[0]?.applied_at;
    check('migration 188 tracée dans _migrations', !!at188, String(at188));
    const ptCuiRef = await stockService.computeStock(pool, 'labo', cui.id, { produitId: ptId });
    const legacyIds = [];
    for (let i = 0; i < 2; i++) {
      const lt = await pool.query(
        `INSERT INTO labo_transfers (labo_id, activite_id, produit_id, quantite, date_transfert, note, prix_unitaire, taux_tva, prix_unitaire_tva, created_by, created_at)
         VALUES ($1, $2, $3, 1, $4, 'legacy', 23.8, 0, 23.8, $5, ($6::timestamptz - interval '1 day')::timestamp) RETURNING id`,
        [cui.id, resto.id, ptId, today, clientId, at188]
      );
      legacyIds.push(lt.rows[0].id);
      await pool.query(`INSERT INTO stock_labo_pt_daily (labo_id, produit_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, created_by) VALUES ($1, $2, $3, -1, 23.8, 0, 23.8, $4)`, [cui.id, ptId, today, clientId]);
      await pool.query(`INSERT INTO stock_produits_transformes (produit_id, activite_id, date_appro, quantite, prix_calcule, prix_unitaire, taux_tva, created_by, transfert_id) VALUES ($1, $2, $3, 1, 23.8, 23.8, 0, $4, $5)`, [ptId, resto.id, today, clientId, lt.rows[0].id]);
    }
    const mirrorsNull = async () => (await pool.query(`SELECT COUNT(*)::int AS n FROM stock_labo_pt_daily WHERE labo_id = $1 AND produit_id = $2 AND date_appro = $3 AND type_appro IS NULL AND quantite = -1 AND transfert_id IS NULL`, [cui.id, ptId, today])).rows[0].n;
    ({ status, body } = await C(`/api/labo/${cui.id}/stock`));
    check('legacy : 2 miroirs PT non liés, computeStock = getLaboStock = ref − 2', (await mirrorsNull()) === 2 && approx(await stockService.computeStock(pool, 'labo', cui.id, { produitId: ptId }), ptCuiRef - 2) && approx(stockOf(body, -ptId)?.quantite, ptCuiRef - 2), JSON.stringify({ m: await mirrorsNull(), g: stockOf(body, -ptId)?.quantite }));
    ({ status, body } = await del(C, `/api/labo/${cui.id}/transfers/${legacyIds[0]}`));
    const sptLeft = (await pool.query(`SELECT COUNT(*)::int AS n FROM stock_produits_transformes WHERE transfert_id = ANY($1::int[])`, [legacyIds])).rows[0].n;
    ({ status: status, body: body } = await C(`/api/labo/${cui.id}/stock`));
    check('DELETE d\'un transfert legacy partiellement lié → 200, UN miroir NULL retiré (repli table par table), entrée liée retirée, computeStock = getLaboStock = ref − 1',
      (await mirrorsNull()) === 1 && sptLeft === 1 && approx(await stockService.computeStock(pool, 'labo', cui.id, { produitId: ptId }), ptCuiRef - 1) && approx(stockOf(body, -ptId)?.quantite, ptCuiRef - 1),
      JSON.stringify({ m: await mirrorsNull(), sptLeft, g: stockOf(body, -ptId)?.quantite }));
    ({ status, body } = await del(C, `/api/labo/${cui.id}/transfers/${legacyIds[1]}`));
    check('DELETE du 2e transfert legacy → 200, 0 miroir, stock PT Cuisine = ref', status === 200 && (await mirrorsNull()) === 0 && approx(await stockService.computeStock(pool, 'labo', cui.id, { produitId: ptId }), ptCuiRef), String(await mirrorsNull()));
    // Fenêtre de grâce (déploiement : ancien conteneur encore actif juste après la 188) : transfert
    // article non lié créé 10 min après la 188 → repli heuristique accepté.
    const grace = await pool.query(
      `INSERT INTO labo_transfers (labo_id, activite_id, ingredient_id, quantite, date_transfert, note, prix_unitaire, taux_tva, prix_unitaire_tva, created_by, created_at)
       VALUES ($1, $2, $3, 1, $4, 'grace', 10, 19, 11.9, $5, ($6::timestamptz + interval '10 minutes')::timestamp) RETURNING id`,
      [cui.id, resto.id, aId, today, clientId, at188]
    );
    await pool.query(`INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, type_appro, created_by) VALUES ($1, $2, $3, -1, 10, 19, 11.9, 'manuel', $4)`, [cui.id, aId, today, clientId]);
    await pool.query(`INSERT INTO stock_entreprise_daily (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, type_appro, created_by) VALUES ($1, $2, $3, 1, 10, 19, 11.9, 'transfert', $4)`, [resto.id, aId, today, clientId]);
    const cntGrace = async () => (await pool.query(`SELECT (SELECT COUNT(*) FROM stock_labo_daily WHERE labo_id = $1 AND ingredient_id = $2 AND date_appro = $3 AND quantite = -1 AND transfert_id IS NULL)::int AS m, (SELECT COUNT(*) FROM stock_entreprise_daily WHERE activite_id = $4 AND ingredient_id = $2 AND date_appro = $3 AND quantite = 1 AND transfert_id IS NULL)::int AS e`, [cui.id, aId, today, resto.id])).rows[0];
    const gAvant = await cntGrace();
    ({ status, body } = await del(C, `/api/labo/${cui.id}/transfers/${grace.rows[0].id}`));
    const gApres = await cntGrace();
    check('transfert créé dans la fenêtre de grâce post-188 (non lié) → DELETE 200 par repli heuristique (miroir + entrée retirés)', status === 200 && gApres.m === gAvant.m - 1 && gApres.e === gAvant.e - 1, `${status} ${JSON.stringify({ gAvant, gApres })}`);
    const orphan = await pool.query(
      `INSERT INTO labo_transfers (labo_id, activite_id, ingredient_id, quantite, date_transfert, note, created_by, created_at)
       VALUES ($1, $2, $3, 1, $4, 'orphelin', $5, ($6::timestamptz + interval '2 hours')::timestamp) RETURNING id`,
      [cui.id, resto.id, aId, today, clientId, at188]
    );
    ({ status, body } = await del(C, `/api/labo/${cui.id}/transfers/${orphan.rows[0].id}`));
    check('transfert post-188 (hors grâce) sans aucune ligne → 409 TRANSFERT_INCOHERENT', status === 409 && body?.code === 'TRANSFERT_INCOHERENT', `${status} ${body?.code}`);
    await pool.query('DELETE FROM labo_transfers WHERE id = $1', [orphan.rows[0].id]);

    // ── 11. Flags : types-summary, VENTE_INACTIVE, manuel ─────────────────────
    ({ status, body } = await C('/api/entreprise/activites/types-summary'));
    check('types-summary : hasActivitesVente, hasLabosProduction, hasLabosEnfants = true', status === 200 && body?.hasActivitesVente === true && body.hasLabosProduction === true && body.hasLabosEnfants === true, JSON.stringify(body));
    ({ status, body } = await post(C, '/api/ventes', { activite_id: hk.id, type_vente: 'directe', date_vente: today, lignes: [] }));
    check('POST /api/ventes sur Housekeeping (vente_active=false) → 400 VENTE_INACTIVE', status === 400 && body?.code === 'VENTE_INACTIVE', `${status} ${body?.code}`);
    ({ status, body } = await post(C, '/api/articles-vendables', { activite_id: hk.id, article_type: 'produit', article_id: ptId, prix_vente: 10 }));
    check('POST /api/articles-vendables sur Housekeeping → 400 VENTE_INACTIVE', status === 400 && body?.code === 'VENTE_INACTIVE', `${status} ${body?.code}`);
    ({ status, body } = await C('/api/entreprise/activites'));
    check('GET activités : Housekeeping venteActive=false, Restaurant true', status === 200 && body.find((a) => a.id === hk.id)?.venteActive === false && body.find((a) => a.id === resto.id)?.venteActive === true, JSON.stringify(body?.map?.((a) => [a.nom, a.venteActive])));
    ({ status, body } = await C('/api/manuel'));
    const slugs = (body || []).map((s) => s.slug);
    check('manuel : transferts, saisie-ventes, calc-production-pt visibles', status === 200 && ['transferts', 'saisie-ventes', 'calc-production-pt'].every((s) => slugs.includes(s)), slugs.filter((s) => /transf|vente|production/.test(s)).join(','));
    await put(C, `/api/entreprise/unites/${resto.uniteId}`, { venteActive: false });
    await put(C, `/api/entreprise/unites/${cui.uniteId}`, { productionActive: false });
    await put(C, `/api/entreprise/unites/${pat.uniteId}`, { productionActive: false });
    ({ status, body } = await C('/api/entreprise/activites/types-summary'));
    const tsOff = body;
    ({ status, body } = await C('/api/manuel'));
    const slugsOff = (body || []).map((s) => s.slug);
    check('vente/production coupées par unité → types-summary false + manuel sans saisie-ventes / calc-production-pt (transferts conservé)', tsOff?.hasActivitesVente === false && tsOff.hasLabosProduction === false && !slugsOff.includes('saisie-ventes') && !slugsOff.includes('calc-production-pt') && slugsOff.includes('transferts'), JSON.stringify({ tsOff, off: slugsOff.filter((s) => /transf|vente|production/.test(s)) }));
    ({ status, body } = await put(C, `/api/entreprise/unites/${resto.uniteId}`, { venteActive: true }));
    check('PUT unité venteActive=true → 200 (retour de l\'unité)', status === 200 && body?.venteActive === true, String(status));
    await put(C, `/api/entreprise/unites/${cui.uniteId}`, { productionActive: true });
    await put(C, `/api/entreprise/unites/${pat.uniteId}`, { productionActive: true });
    ({ status, body } = await C(`/api/labo/articles-consommables?laboIds=${eco.id},${cui.id}`));
    check('GET /api/labo/articles-consommables : Économat (production off) ignoré → articles de la Cuisine', status === 200 && Array.isArray(body) && body.some((a) => a.id === aId), String(body?.length));

    // ── 12. Onboarding par composant + POST purge ─────────────────────────────
    ({ status, body } = await C('/api/ai-assistant/onboarding'));
    const cap = body?.etapes?.find?.((e) => e.key === 'capacites');
    check('GET onboarding : étape capacités par composant (cuisine 2/2, autres 1/1) FAIT, route /client/activites, étapes avec route', status === 200 && cap?.fait === true && cap.route === '/client/activites' && cap.composants?.length === 4 && cap.composants.every((c) => c.crees === c.attendu) && cap.composants.find((c) => c.code === 'cuisine')?.crees === 2 && /Restaurant/.test(cap.detail) && body.etapes.filter((e) => !['contrat', 'activation'].includes(e.key)).every((e) => e.route), JSON.stringify({ detail: cap?.detail, composants: cap?.composants }));
    await pool.query(`INSERT INTO ai_conversations (client_id, whatsapp_number, messages) VALUES ($1, $2, '[]'::jsonb) ON CONFLICT DO NOTHING`, [clientId, `web_${clientId}`]).catch(() => {});
    ({ status } = await C('/api/ai-assistant/onboarding'));
    const convApres = await pool.query(`SELECT COUNT(*)::int AS n FROM ai_conversations WHERE client_id = $1 AND whatsapp_number LIKE 'web_%'`, [clientId]);
    check('GET onboarding : plus d\'effet de bord (conversation web conservée)', status === 200 && convApres.rows[0].n === 1, String(convApres.rows[0].n));
    ({ status, body } = await post(C, '/api/ai-assistant/onboarding/purge', {}));
    check('POST onboarding/purge → 200 { purged, complet } (purge seulement si complet)', status === 200 && typeof body?.purged === 'boolean' && typeof body.complet === 'boolean' && body.purged === body.complet, JSON.stringify(body));

    // ── 13. IA get_transferts (deux étages), dashboards (KPI séparés) ─────────
    const ia = await executeToolCall(clientId, 'get_transferts', {});
    check('IA get_transferts voit les deux étages (Cuisine (labo) + Restaurant)', ia.some((r) => r.destination === 'Cuisine (labo)') && ia.some((r) => r.destination === 'Restaurant'), JSON.stringify(ia.map((r) => r.destination)));
    ({ status, body } = await C(`/api/dashboard/v2?tab=labo&from=${today}&to=${today}`));
    check('dashboard V2 onglet Labo : transferts (activités) et cessions_labo séparés, répartition « Cuisine (labo) »',
      status === 200 && body?.kpis && approx(body.kpis.transferts, 4 * 11.9 + 2 * 23.8) && body.kpis.nb_transferts === 2 && approx(body.kpis.cessions_labo, 30 * 11.9) && body.kpis.nb_cessions_labo === 1
      && body.transferts_par_activite.some((r) => r.activite === 'Cuisine (labo)') && body.transferts_par_activite.some((r) => r.activite === 'Restaurant'),
      JSON.stringify({ k: body?.kpis, rep: body?.transferts_par_activite }));
    check('dashboard V2 onglet Labo : achats externes (appros) = 100×11,9 + 10×5, réceptions internes = 30×11,9 (KPI distinct)', approx(body?.kpis?.appros, 100 * 11.9 + 50) && body?.kpis?.nb_appros === 2 && approx(body?.kpis?.receptions_labo, 357) && body?.kpis?.nb_receptions_labo === 1, JSON.stringify({ a: body?.kpis?.appros, r: body?.kpis?.receptions_labo }));
    ({ status, body } = await C(`/api/dashboard/labo?laboId=${eco.id}&from=${today}&to=${today}`));
    check('dashboard V1 labo Économat : transferts 0 (activités) / cessions_labo 357', status === 200 && approx(body?.kpis?.transferts, 0) && approx(body?.kpis?.cessions_labo, 357) && body.kpis.nb_cessions_labo === 1, JSON.stringify(body?.kpis));

    // ── 14. Ventes labo + exports Excel (Destination) ─────────────────────────
    ({ status, body } = await C(`/api/labo/ventes?laboId=${eco.id}`));
    check('GET /api/labo/ventes Économat : ligne dest_type labo / dest_nom Cuisine', status === 200 && body?.length === 1 && body[0].dest_type === 'labo' && body[0].dest_nom === 'Cuisine', JSON.stringify(body?.[0] && { t: body[0].dest_type, n: body[0].dest_nom }));
    let x = await xlsx(cliTok, `/api/labo/${eco.id}/transfers/export-excel`);
    check('export Excel transferts Économat : en-tête « Destination », ligne « Cuisine (labo) »', x.status === 200 && x.rows.some((r) => r.includes('Destination')) && x.rows.some((r) => r.includes('Cuisine (labo)')), JSON.stringify(x.rows.slice(-3)));
    x = await xlsx(cliTok, `/api/labo-ventes/export-excel?laboId=${eco.id}`);
    check('export Excel ventes labo : en-tête « Destination »', x.status === 200 && x.rows.some((r) => r.includes('Destination')), String(x.status));
    x = await xlsx(cliTok, `/api/labo/${cui.id}/historique/export-excel`);
    check('export Excel historique Cuisine : ligne « Transfert reçu » avec fournisseur Économat', x.status === 200 && x.rows.some((r) => r.includes('Transfert reçu') && r.includes('Économat')), JSON.stringify(x.rows.find((r) => r.includes('Transfert reçu'))));

    // ── 15. deleteLabo 409 LABO_UTILISE ───────────────────────────────────────
    ({ status, body } = await del(C, `/api/labo/${cui.id}`));
    check('DELETE labo Cuisine (transferts ET articles affectés) → 409 LABO_UTILISE (évalué en premier)', status === 409 && body?.code === 'LABO_UTILISE', `${status} ${body?.code}`);
    ({ status, body } = await del(C, `/api/labo/${eco.id}`));
    check('DELETE labo Économat (source de transferts + labo enfant, articles affectés) → 409 LABO_UTILISE', status === 409 && body?.code === 'LABO_UTILISE', `${status} ${body?.code}`);
    await post(C, `/api/labo/${pat.id}/ingredients/${aId}/select`, {});
    ({ status, body } = await del(C, `/api/labo/${pat.id}`));
    check('DELETE labo Pâtisserie (plus de transfert, un article affecté) → 409 ARTICLES_AFFECTES', status === 409 && body?.code === 'ARTICLES_AFFECTES', `${status} ${body?.code}`);
    await pool.query('DELETE FROM labo_ingredient_selections WHERE labo_id = $1', [pat.id]);
    ({ status, body } = await del(C, `/api/labo/${pat.id}`));
    check('DELETE labo Pâtisserie (plus rien d\'affecté) → 200', status === 200, String(status));
  } catch (e) {
    check('exception', false, e.stack || e.message);
  } finally {
    // ── Nettoyage : purge client via l'API admin (cascade labos / labo_transfers.labo_dest_id / unités)
    if (clientId) {
      await pool.query('DELETE FROM ai_conversations WHERE client_id = $1', [clientId]).catch(() => {});
      const res = await fetch(`${BASE}/admin/clients/${clientId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${admTok}` } });
      check('nettoyage client (DELETE 204)', res.status === 204, String(res.status));
      const reste = await pool.query(
        `SELECT (SELECT COUNT(*) FROM unites_operationnelles uo JOIN profil_entreprise pe ON pe.id = uo.entreprise_id WHERE pe.client_id = $1)::int AS unites,
                (SELECT COUNT(*) FROM factures WHERE client_id = $1)::int AS factures`,
        [clientId]
      );
      check('purge : 0 unité / 0 facture restantes', reste.rows[0].unites === 0 && reste.rows[0].factures === 0, JSON.stringify(reste.rows[0]));
    }
    await wipe().catch(() => {});
  }
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks OK${failed.length ? ' — ÉCHECS : ' + failed.map((f) => f.name).join(' | ') : ''}`);
  await pool.end().catch(() => {});
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
