/* Test E2E local — P1 « L'unité des produits utilisables » (labflow-reprise/produits-prestataires/PLAN.md §2 ligne P1,
 * §3, §4 question 1 ; réponses du client du 13/10).
 *   création avec unité finale et quantité produite (recette pour 1 unité, 6 décimales), refus (quantité manquante,
 *   unité d'un autre compte, quantité trop petite), produit sans unité (compté à la recette, comme avant) ; lecture,
 *   liste, coût et fiche technique pour 1 unité ; production en activité (9,2 kg = 2 recettes), stock et historique en
 *   kg ; unité figée au premier mouvement (409), quantité produite modifiable, unité non effaçable, unité réservée aux
 *   produits utilisables ; produit d'avant qui reçoit une unité : recettes qui l'utilisent converties ; production au
 *   labo et transfert vers l'activité en kg ; unité utilisée par un produit non supprimable ; rejeu de la migration 236.
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
// Comme l'écran (src/utils/recettePU.ts) : quantité de la recette entière → pour 1 unité, 6 décimales.
const pour1 = (x, q) => Math.round((x / q) * 1e6) / 1e6;
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-pu-unite@example.com';
  const CLIENT = 'test-client-pu-unite@example.com';
  let adminTok = null;
  let clientId = null;
  const wipe = async () => {
    const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
    if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT]])).rows.map((r) => r.id);
    const tous = [...new Set([...ids, ...(clientId ? [clientId] : [])])];
    if (tous.length) {
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM demandes WHERE demandeur_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [tous]);
    }
  };

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin PU', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    check('connexion admin', !!adminTok);

    // ── Client LabFlow : 1 activité, 1 labo ──
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client PU', email: CLIENT, telephone: '20 555 236', nbActivites: 1, nbLabos: 1, nbGerants: 0, montantOnboarding: 0 });
    check('création du client LabFlow', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const tok = await login(CLIENT);
    check('connexion du client', !!tok);
    const C = (m, p, b) => appel(m, p, tok, b);

    let act = (await C('GET', '/api/entreprise/activites')).body?.[0];
    if (!act) act = (await C('POST', '/api/entreprise/activites', { nom: 'Restaurant PU' })).body;
    let labo = (await C('GET', '/api/labo')).body?.[0];
    if (!labo) labo = (await C('POST', '/api/labo', { nom: 'Cuisine PU', refLabo: 'CPU' })).body;
    check('activité et labo du compte', !!act?.id && !!labo?.id, JSON.stringify({ act: act?.id, labo: labo?.id }));

    // ── Référentiel : unités, catégorie, articles ──
    const unite = async (name) => {
      const c = await C('POST', '/api/unites', { name });
      if (c.status === 201) return c.body;
      return (await C('GET', '/api/unites')).body.find((u) => u.name === name);
    };
    const kg = await unite('kg');
    const L = await unite('L');
    const pieces = await unite('pièces');
    const barquette = await unite('barquette');
    const fam = await C('POST', '/api/familles', { name: 'TEST-Fam PU' });
    const cat = await C('POST', '/api/categories', { name: 'TEST-Cat PU', familleId: fam.body?.id });
    const article = async (name, u) => (await C('POST', '/api/articles', { name, unitId: u.id, categorieId: cat.body?.id })).body;
    const concentre = await article('Concentré de tomate', kg);
    const sel = await article('Sel fin', kg);
    const farine = await article('Farine', kg);
    const lait = await article('Lait', L);
    check('référentiel : unités kg, L, pièces, barquette ; 4 articles', !!kg?.id && !!L?.id && !!pieces?.id && !!barquette?.id && !!concentre?.id && !!sel?.id && !!farine?.id && !!lait?.id);
    for (const a of [concentre, sel, farine]) await C('POST', `/api/entreprise/activites/${act.id}/ingredients/${a.id}/select`, {});

    // ── 1. Création : la sauce tomate (2 kg de concentré + 30 g de sel pour 4,6 kg) ──
    const sauce = { name: 'Sauce tomate', type: 'utilisable', origine: 'activite', activiteIds: [act.id], laboIds: [], uniteId: kg.id, quantiteProduite: 4.6,
      ingredients: [{ ingredientId: concentre.id, portion: pour1(2, 4.6) }, { ingredientId: sel.id, portion: pour1(0.03, 4.6) }], subProducts: [] };
    r = await C('POST', '/api/products', sauce);
    check('création de la sauce : kg, 4,6 kg par recette → 201', r.status === 201 && r.body?.uniteId === kg.id && r.body?.uniteNom === 'kg' && r.body?.quantiteProduite === 4.6, `${r.status} ${JSON.stringify(r.body)}`);
    const sauceId = r.body?.id;
    let lignes = (await pool.query('SELECT ingredient_id, portion::text AS p FROM produit_ingredients WHERE produit_id = $1 ORDER BY ingredient_id', [sauceId])).rows;
    check('recette enregistrée pour 1 kg, 6 décimales (0.434783 et 0.006522)', lignes.length === 2 && lignes.find((l) => l.ingredient_id === concentre.id)?.p === '0.434783' && lignes.find((l) => l.ingredient_id === sel.id)?.p === '0.006522', JSON.stringify(lignes));
    r = await C('POST', '/api/products', { ...sauce, name: 'Sans quantité', quantiteProduite: undefined });
    check('unité sans quantité produite → 400 QUANTITE_PRODUITE_REQUISE', r.status === 400 && r.body?.code === 'QUANTITE_PRODUITE_REQUISE', `${r.status} ${r.body?.code}`);
    r = await C('POST', '/api/products', { ...sauce, name: 'Quantité nulle', quantiteProduite: 0 });
    check('quantité produite 0 → 400 QUANTITE_PRODUITE_REQUISE', r.status === 400 && r.body?.code === 'QUANTITE_PRODUITE_REQUISE', `${r.status} ${r.body?.code}`);
    const autreUnite = (await pool.query('SELECT id FROM unites WHERE client_id IS NOT NULL AND client_id <> $1 ORDER BY id LIMIT 1', [clientId])).rows[0];
    if (autreUnite) {
      r = await C('POST', '/api/products', { ...sauce, name: 'Unité étrangère', uniteId: autreUnite.id });
      check('unité d\'un autre compte → 400 UNITE_INCONNUE', r.status === 400 && r.body?.code === 'UNITE_INCONNUE', `${r.status} ${r.body?.code}`);
    }
    r = await C('POST', '/api/products', { ...sauce, name: 'Trop petit', ingredients: [{ ingredientId: concentre.id, portion: 0.0000004 }, { ingredientId: sel.id, portion: 1 }] });
    check('quantité qui tombe à 0 pour 1 unité → 400 PORTION_TROP_PETITE', r.status === 400 && r.body?.code === 'PORTION_TROP_PETITE', `${r.status} ${r.body?.code}`);
    // Produit d'avant (sans unité) : encore accepté (anciens écrans pendant la mise en ligne, scripts) — compté à la recette.
    r = await C('POST', '/api/products', { name: 'Pâte maison', type: 'utilisable', origine: 'activite', activiteIds: [act.id], laboIds: [], ingredients: [{ ingredientId: farine.id, portion: 1 }, { ingredientId: sel.id, portion: 0.02 }], subProducts: [] });
    check('produit sans unité (comme avant) → 201, compté à la recette', r.status === 201 && r.body?.uniteId === null && r.body?.quantiteProduite === null, `${r.status} ${JSON.stringify(r.body)}`);
    const pateId = r.body?.id;

    // ── 2. Lecture, liste, coût ──
    r = await C('GET', `/api/products/${sauceId}`);
    check('lecture : unité, quantité produite, unité non figée, recette pour 1 kg', r.status === 200 && r.body?.uniteNom === 'kg' && r.body?.quantiteProduite === 4.6 && r.body?.uniteFigee === false && approx(r.body?.ingredients?.find((i) => i.ingredientId === concentre.id)?.portion, 0.434783, 1e-6), JSON.stringify({ u: r.body?.uniteNom, q: r.body?.quantiteProduite, f: r.body?.uniteFigee }));
    r = await C('GET', '/api/products?type=utilisable');
    const dansListe = r.body?.find?.((p) => p.id === sauceId);
    const pateListe = r.body?.find?.((p) => p.id === pateId);
    check('liste : la sauce en kg (4,6), la pâte sans unité', dansListe?.uniteNom === 'kg' && dansListe?.quantiteProduite === 4.6 && pateListe?.uniteNom === null, JSON.stringify({ s: dansListe?.uniteNom, p: pateListe?.uniteNom }));

    // ── 3. Production en activité : 9,2 kg = 2 recettes ──
    r = await C('PUT', `/api/stock/entreprise/${act.id}/${concentre.id}`, { quantite: 10, prixUnitaire: 5, tauxTva: 0, dateAppro: today });
    const r2 = await C('PUT', `/api/stock/entreprise/${act.id}/${sel.id}`, { quantite: 1, prixUnitaire: 1, tauxTva: 0, dateAppro: today });
    const r3 = await C('PUT', `/api/stock/entreprise/${act.id}/${farine.id}`, { quantite: 5, prixUnitaire: 2, tauxTva: 0, dateAppro: today });
    check('appros : concentré 10 kg à 5, sel 1 kg à 1, farine 5 kg à 2', [r.status, r2.status, r3.status].every((s) => s === 200 || s === 201), `${r.status}/${r2.status}/${r3.status}`);
    r = await C('GET', `/api/products/${sauceId}/cout`);
    check('coût pour 1 kg (unité kg, recette 4,6 kg)', r.status === 200 && r.body?.unit === 'kg' && r.body?.quantiteProduite === 4.6 && approx(r.body?.totalCost, 0.434783 * 5 + 0.006522 * 1), JSON.stringify({ u: r.body?.unit, c: r.body?.totalCost }));
    r = await C('PUT', `/api/stock/pt/${sauceId}`, { quantite: 9.2, dateAppro: today, activiteId: act.id });
    check('production de 9,2 kg de sauce → 200', r.status === 200 || r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await C('GET', `/api/stock/entreprise/${act.id}`);
    const ligne = (id) => (Array.isArray(r.body) ? r.body : r.body?.rows || r.body?.stock || []).find((x) => x.ingredientId === id);
    const lSauce = ligne(-sauceId);
    check('stock : la sauce en kg, 9,2 kg, « 1 recette = 4,6 kg »', lSauce?.unite === 'kg' && approx(lSauce?.quantite, 9.2) && lSauce?.quantiteProduite === 4.6, JSON.stringify({ u: lSauce?.unite, q: lSauce?.quantite, qp: lSauce?.quantiteProduite }));
    check('stock : 2 recettes déduites (concentré 10 − 4 = 6, sel 1 − 0,06 = 0,94)', approx(ligne(concentre.id)?.quantite, 6, 0.001) && approx(ligne(sel.id)?.quantite, 0.94, 0.001), JSON.stringify({ c: ligne(concentre.id)?.quantite, s: ligne(sel.id)?.quantite }));
    check('stock : la pâte (produit d\'avant) en « unité »', ligne(-pateId)?.unite === 'unité' && ligne(-pateId)?.quantiteProduite === null, JSON.stringify({ u: ligne(-pateId)?.unite }));
    const prod = (await pool.query(`SELECT quantite, prix_calcule FROM stock_produits_transformes WHERE produit_id = $1 AND activite_id = $2 AND quantite > 0`, [sauceId, act.id])).rows[0];
    check('production valorisée au coût du kg', approx(prod?.quantite, 9.2) && approx(prod?.prix_calcule, 0.434783 * 5 + 0.006522 * 1), JSON.stringify(prod));
    r = await C('GET', `/api/stock/historique?activiteId=${act.id}&ptOnly=true`);
    const hist = (Array.isArray(r.body) ? r.body : r.body?.rows || []).find((h) => h.ingredientId === -sauceId);
    check('historique des appros : production de la sauce en kg', r.status === 200 && hist?.uniteNom === 'kg', `${r.status} ${JSON.stringify(hist && { u: hist.uniteNom, q: hist.quantite })}`);

    // ── 4. Unité figée, quantité produite modifiable ──
    r = await C('GET', `/api/products/${sauceId}`);
    check('lecture : unité figée après la production', r.body?.uniteFigee === true, String(r.body?.uniteFigee));
    r = await C('PUT', `/api/products/${sauceId}`, { ...sauce, uniteId: pieces.id, quantiteProduite: 10 });
    check('changer l\'unité d\'un produit qui a du stock → 409 UNITE_FIGEE', r.status === 409 && r.body?.code === 'UNITE_FIGEE', `${r.status} ${r.body?.code}`);
    r = await C('PUT', `/api/products/${sauceId}`, { ...sauce, uniteId: null, quantiteProduite: null });
    check('effacer l\'unité → 400 UNITE_REQUISE', r.status === 400 && r.body?.code === 'UNITE_REQUISE', `${r.status} ${r.body?.code}`);
    r = await C('PUT', `/api/products/${sauceId}`, { ...sauce, quantiteProduite: 5, ingredients: [{ ingredientId: concentre.id, portion: pour1(2, 5) }, { ingredientId: sel.id, portion: pour1(0.03, 5) }] });
    lignes = (await pool.query('SELECT ingredient_id, portion::text AS p FROM produit_ingredients WHERE produit_id = $1 ORDER BY ingredient_id', [sauceId])).rows;
    check('même unité, recette de 5 kg → 200, recette pour 1 kg recalculée (0.4 et 0.006)', r.status === 200 && r.body?.quantiteProduite === 5 && lignes.find((l) => l.ingredient_id === concentre.id)?.p === '0.4' && lignes.find((l) => l.ingredient_id === sel.id)?.p === '0.006', `${r.status} ${JSON.stringify(lignes)}`);

    // ── 5. Produit d'avant qui reçoit une unité : recettes qui l'utilisent converties ──
    const cp = await C('POST', '/api/categories-produit', { nom: 'TEST Pizzas PU', typeProduit: 'vendable' });
    r = await C('POST', '/api/products', { name: 'Pizza PU', type: 'vendable', origine: 'activite', categorieProduitId: cp.body?.id, activiteIds: [act.id], laboIds: [], ingredients: [{ ingredientId: sel.id, portion: 0.002 }], subProducts: [{ subProductId: pateId, portion: 0.2 }] });
    check('vendable qui utilise 0,2 « recette » de pâte → 201', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const pizzaId = r.body?.id;
    r = await C('PUT', `/api/products/${pizzaId}`, { uniteId: kg.id, quantiteProduite: 1 });
    check('unité sur un vendable → 400 UNITE_PU_SEULEMENT', r.status === 400 && r.body?.code === 'UNITE_PU_SEULEMENT', `${r.status} ${r.body?.code}`);
    // La pâte (aucun mouvement) reçoit l'unité kg ; sa recette d'avant (1 kg de farine pour 1 recette) donne 2 kg.
    r = await C('PUT', `/api/products/${pateId}`, { name: 'Pâte maison', type: 'utilisable', origine: 'activite', activiteIds: [act.id], laboIds: [], uniteId: kg.id, quantiteProduite: 2,
      ingredients: [{ ingredientId: farine.id, portion: pour1(1, 2) }, { ingredientId: sel.id, portion: pour1(0.02, 2) }], subProducts: [] });
    const pizzaLigne = (await pool.query('SELECT portion::text AS p FROM produit_sous_produits WHERE produit_id = $1 AND sous_produit_id = $2', [pizzaId, pateId])).rows[0];
    check('la pâte reçoit l\'unité kg (2 kg par recette) → 200 ; la pizza passe de 0,2 recette à 0,4 kg', r.status === 200 && r.body?.uniteNom === 'kg' && pizzaLigne?.p === '0.4', `${r.status} ${JSON.stringify(pizzaLigne)}`);
    r = await C('GET', `/api/products/${pizzaId}`);
    check('lecture de la pizza : le sous-produit dans son unité (kg)', r.body?.subProducts?.[0]?.unitName === 'kg' && approx(r.body?.subProducts?.[0]?.portion, 0.4, 1e-6), JSON.stringify(r.body?.subProducts));
    r = await C('GET', `/api/produits/utilisables-perimetre?origine=activite&ids=${act.id}`);
    check('sous-produits proposés avec leur unité', r.body?.find?.((p) => p.id === pateId)?.unite === 'kg' && r.body?.find?.((p) => p.id === sauceId)?.unite === 'kg', JSON.stringify(r.body));

    // ── 6. Fiche technique et liste exportées ──
    r = await C('GET', `/api/products/${sauceId}/export?mode=stock&activiteId=${act.id}&pricingMethod=mp`);
    const ft = r.status === 200 ? await texteClasseur(r.body) : '';
    check('fiche technique Excel : « Pour 1 kg (recette pour 5 kg) », « COÛT TOTAL (1 kg) »', /Pour 1 kg \(recette pour 5 kg\)/.test(ft) && /COÛT TOTAL \(1 kg\)/.test(ft), `${r.status} ${ft.split('\n').slice(0, 3).join(' / ')}`);
    r = await C('GET', '/api/produits/export-list?type=utilisable');
    const liste = r.status === 200 ? await texteClasseur(r.body) : '';
    check('liste Excel : « Coût pour » 1 kg (recette : 5 kg)', /\| Coût pour$/m.test(liste) && /Sauce tomate .*\| 1 kg \(recette : 5 kg\)$/m.test(liste), `${r.status}`);

    // ── 7. Labo : production en kg, transfert vers l'activité en kg ──
    // L'activité est alimentée par le labo (rattachement posé directement : préparation de l'essai, pas l'objet du test).
    r = await C('PUT', `/api/entreprise/activites/${act.id}`, { nom: act.nom, laboId: labo.id });
    if (!(r.status === 200 && (await pool.query('SELECT labo_id FROM activites WHERE id = $1', [act.id])).rows[0]?.labo_id === labo.id)) {
      await pool.query('UPDATE activites SET labo_id = $1 WHERE id = $2', [labo.id, act.id]);
    }
    await C('POST', `/api/labo/${labo.id}/ingredients/${lait.id}/select`, {});
    r = await C('PUT', `/api/labo/${labo.id}/stock/${lait.id}`, { quantite: 10, prixUnitaire: 1.5, tauxTva: 0, dateAppro: today });
    check('appro du labo : lait 10 L', r.status === 200 || r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await C('POST', '/api/products', { name: 'Crème PU', type: 'utilisable', origine: 'labo', laboIds: [labo.id], activiteIds: [act.id], uniteId: kg.id, quantiteProduite: 2, ingredients: [{ ingredientId: lait.id, portion: pour1(1, 2) }], subProducts: [] });
    const cremeId = r.body?.id;
    check('crème fabriquée au labo : 1 L de lait pour 2 kg → 201', r.status === 201 && !!cremeId, `${r.status} ${r.body?.message || ''}`);
    r = await C('PUT', `/api/labo/${labo.id}/stock/${-cremeId}`, { quantite: 4, dateAppro: today });
    check('production au labo de 4 kg de crème → 200', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    r = await C('GET', `/api/labo/${labo.id}/stock`);
    const sl = (Array.isArray(r.body) ? r.body : r.body?.rows || r.body?.stock || []);
    const lCreme = sl.find((x) => x.ingredientId === -cremeId);
    check('stock du labo : crème 4 kg (« 1 recette = 2 kg »), lait 10 − 2 = 8 L', lCreme?.unite === 'kg' && approx(lCreme?.quantite, 4) && lCreme?.quantiteProduite === 2 && approx(sl.find((x) => x.ingredientId === lait.id)?.quantite, 8), JSON.stringify({ u: lCreme?.unite, q: lCreme?.quantite, lait: sl.find((x) => x.ingredientId === lait.id)?.quantite }));
    r = await C('GET', `/api/stock/pt/${cremeId}/recipe?laboId=${labo.id}`);
    r = await C('POST', `/api/labo/${labo.id}/transfer`, { dateTransfert: today, tauxTva: 0, transfers: [{ activiteId: act.id, ingredientId: -cremeId, quantite: 1.5, prixUnitaire: 0.75 }] });
    check('transfert de 1,5 kg de crème vers l\'activité → 200', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    r = await C('GET', `/api/labo/${labo.id}/transfers`);
    const tr = (Array.isArray(r.body) ? r.body : []).find((t) => t.ingredientId === -cremeId);
    check('transferts du labo : la crème en kg', tr?.uniteNom === 'kg' && approx(tr?.quantite, 1.5), JSON.stringify(tr && { u: tr.uniteNom, q: tr.quantite }));
    r = await C('GET', `/api/stock/entreprise/${act.id}`);
    check('stock de l\'activité : 1,5 kg de crème reçue', ligne(-cremeId)?.unite === 'kg' && approx(ligne(-cremeId)?.quantite, 1.5), JSON.stringify({ u: ligne(-cremeId)?.unite, q: ligne(-cremeId)?.quantite }));

    // ── 8. Unités du référentiel ──
    r = await C('POST', '/api/products', { name: 'Taboulé PU', type: 'utilisable', origine: 'activite', activiteIds: [act.id], laboIds: [], uniteId: barquette.id, quantiteProduite: 12, ingredients: [{ ingredientId: farine.id, portion: pour1(1, 12) }, { ingredientId: sel.id, portion: pour1(0.01, 12) }], subProducts: [] });
    check('taboulé en barquettes (12 par recette) → 201', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await C('GET', '/api/unites');
    check('référentiel des unités : « barquette » portée par 1 produit utilisable', r.body?.find?.((u) => u.id === barquette.id)?.nbProduits === 1, JSON.stringify(r.body?.find?.((u) => u.id === barquette.id)));
    r = await C('DELETE', `/api/unites/${barquette.id}`);
    check('supprimer une unité portée par un produit → 409', r.status === 409, `${r.status} ${r.body?.message || ''}`);

    // ── 9. Rejeu de la migration 236 (idempotente) ──
    try {
      await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '236_produits_unite.sql'), 'utf8'));
      check('migration 236 rejouée sans erreur', true);
    } catch (e) { check('migration 236 rejouée sans erreur', false, e.message); }
    const typ = (await pool.query(`SELECT numeric_precision, numeric_scale FROM information_schema.columns WHERE table_name = 'produit_ingredients' AND column_name = 'portion'`)).rows[0];
    check('recettes : NUMERIC sans échelle fixe', typ && typ.numeric_scale === null, JSON.stringify(typ));
  } catch (e) {
    check('déroulé sans exception', false, e.stack);
  } finally {
    await wipe();
    const reste = (await pool.query('SELECT COUNT(*)::int AS n FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT]])).rows[0].n;
    check('nettoyage : comptes d\'essai retirés', reste === 0, String(reste));
    const ok = results.filter((x) => x.ok).length;
    console.log(`\n${ok}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ok === results.length ? 0 : 1);
  }
})();
