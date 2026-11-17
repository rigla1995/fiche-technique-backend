/* Test E2E local — C2 « Recette propre à un canal » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.3).
 *   création d'une variante (copie du produit et de sa recette, code propre, liée à l'original), remplacement de
 *   l'original sur les canaux choisis au même prix, canal sans prix laissé à régler ; ventes : la variante se vend là
 *   où elle remplace l'original, l'original ailleurs ; recette de la variante indépendante ; liste et lecture servent
 *   le lien ; refus (variante de variante, libellé en double ou vide, canal inconnu, produit utilisable, autre compte) ;
 *   renommer l'original fait suivre ses variantes ; un produit ne se supprime pas avant ses variantes ; migration 259.
 * Crée un super_admin et un client temporaires (mot de passe tiré au hasard), puis nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
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
const login = async (email) => (await appel('POST', '/auth/login', null, { email, password: MDP })).body?.token;
const today = new Date().toISOString().slice(0, 10);

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-variantes-c2@example.com';
  const CLIENT = 'test-client-variantes-c2@example.com';
  let adminTok = null;
  let clientId = null;
  const prestasCrees = [];
  const wipe = async () => {
    const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
    if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    for (const id of prestasCrees) if (adminTok) await appel('DELETE', `/api/admin/prestataires/${id}`, adminTok);
    await pool.query(`DELETE FROM prestataires_livraison WHERE nom LIKE 'TEST Presta C2%'`).catch(() => {});
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT]])).rows.map((r) => r.id);
    const tous = [...new Set([...ids, ...(clientId ? [clientId] : [])])];
    if (tous.length) {
      for (const table of ['ventes', 'article_vendable_prix_historique', 'article_prix_prestataire', 'activite_prestataires', 'activite_articles_vendables']) {
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
       VALUES ('TEST Admin C2', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    check('connexion admin', !!adminTok);
    const A = (m, p, b) => appel(m, p, adminTok, b);

    let r = await A('POST', '/admin/clients', { nom: 'TEST Client C2', email: CLIENT, telephone: '20 555 259', nbActivites: 1, nbLabos: 0, nbGerants: 0, formuleActivites: 'premium', montantOnboarding: 0 });
    check('création du client LabFlow (formule Premium)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const tok = await login(CLIENT);
    check('connexion du client', !!tok);
    const C = (m, p, b) => appel(m, p, tok, b);

    let act = (await C('GET', '/api/entreprise/activites')).body?.[0];
    if (!act) act = (await C('POST', '/api/entreprise/activites', { nom: 'Restaurant C2' })).body;
    for (const nom of ['TEST Presta C2 a', 'TEST Presta C2 b']) {
      const cr = await A('POST', '/api/admin/prestataires', { nom });
      if (cr.body?.id) prestasCrees.push(cr.body.id);
    }
    const [prestaA, prestaB] = prestasCrees;
    const mode = (await C('GET', '/api/modes-paiement')).body?.[0];
    const activer = async (prestataireId) => (await C('POST', '/api/activite-prestataires', { activite_id: act.id, prestataire_id: prestataireId, taux_commission: 25, taux_tva: 19, mode_paiement_id: mode.id })).body?.id;
    const lienA = await activer(prestaA);
    const lienB = await activer(prestaB);
    check('activité et deux prestataires activés', !!act?.id && !!lienA && !!lienB, JSON.stringify({ act: act?.id, lienA, lienB }));

    // Référentiel, catégorie de produits et deux produits vendables avec leur recette.
    const unite = async (name) => { const c = await C('POST', '/api/unites', { name }); return c.status === 201 ? c.body : (await C('GET', '/api/unites')).body.find((u) => u.name === name); };
    const kg = await unite('kg');
    const fam = await C('POST', '/api/familles', { name: 'TEST-Fam C2' });
    const cat = await C('POST', '/api/categories', { name: 'TEST-Cat C2', familleId: fam.body?.id });
    const article = async (name) => (await C('POST', '/api/articles', { name, unitId: kg.id, categorieId: cat.body?.id })).body;
    const farine = await article('Farine TEST C2');
    const fromage = await article('Fromage TEST C2');
    const boite = await article('Boîte TEST C2');
    const cp = (await C('POST', '/api/categories-produit', { name: 'Pizzas TEST C2', typeProduit: 'vendable' })).body;
    const creerProduit = async (nom, ingredients) => C('POST', '/api/produits', { nom, type: 'vendable', origine: 'activite', categorieProduitId: cp.id, activiteIds: [act.id], ingredients, subProducts: [] });
    r = await creerProduit('Pizza TEST C2', [{ ingredientId: farine.id, portion: 0.2 }, { ingredientId: fromage.id, portion: 0.1 }]);
    const P = r.body;
    check('produit d\'origine créé avec sa recette', r.status === 201 && !!P?.id && !!P.refProduit, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    const P2 = (await creerProduit('Salade TEST C2', [{ ingredientId: fromage.id, portion: 0.05 }])).body;

    const PUT = (cellules) => C('PUT', '/api/canaux-vente', { activite_id: act.id, cellules });
    const cel = (articleId, canal, autres) => ({ article_type: 'produit', article_id: articleId, canal, ...autres });
    const vendable = async (articleId) => (await pool.query(
      `SELECT id, prix_vente::float AS prix, actif, directe FROM activite_articles_vendables WHERE activite_id = $1 AND article_type = 'produit' AND article_id = $2`,
      [act.id, articleId])).rows[0] || null;
    const prixPresta = async (articleId, lien) => (await pool.query(
      `SELECT app.prix_vente::float AS prix, app.en_vente FROM article_prix_prestataire app
         JOIN activite_articles_vendables av ON av.id = app.article_vendable_id
        WHERE av.activite_id = $1 AND av.article_type = 'produit' AND av.article_id = $2 AND app.activite_prestataire_id = $3`,
      [act.id, articleId, lien])).rows[0] || null;
    const vendre = (articleId, canal) => C('POST', '/api/ventes', {
      activite_id: act.id, date_vente: today, type_vente: canal ? 'prestataire' : 'directe', prestataire_id: canal || null,
      lignes: [{ article_type: 'produit', article_id: articleId, quantite: 1, prix_unitaire: 10 }],
    });
    const VAR = (produitId, corps) => C('POST', `/api/produits/${produitId}/variantes`, { activite_id: act.id, ...corps });
    const nbVariantes = async (produitId) => (await pool.query('SELECT COUNT(*)::int AS n FROM produits WHERE variante_de_id = $1', [produitId])).rows[0].n;

    // Canaux du produit d'origine : direct 20 (en vente), prestataire A 24 (en vente), prestataire B 25 (prix sans case).
    r = await PUT([cel(P.id, 'directe', { prix: 20, en_vente: true }), cel(P.id, lienA, { prix: 24, en_vente: true }), cel(P.id, lienB, { prix: 25 }), cel(P.id, lienB, { en_vente: false }),
      cel(P2.id, 'directe', { prix: 9, en_vente: true })]);
    check('canaux du produit d\'origine réglés', r.status === 200 && (await prixPresta(P.id, lienB))?.en_vente === false, `${r.status} ${JSON.stringify(r.body)}`);

    // ── 1. Création d'une variante sur les deux prestataires ──
    r = await VAR(P.id, { libelle: ' Livraison ', canaux: [lienA, lienB] });
    const V = r.body?.produit;
    check('variante créée → 201 : nom « Produit — Libellé », liée à l\'original, code propre',
      r.status === 201 && V?.name === 'Pizza TEST C2 — Livraison' && V.varianteDeId === P.id && V.varianteLibelle === 'Livraison' && V.varianteDeNom === 'Pizza TEST C2'
        && !!V.refProduit && V.refProduit !== P.refProduit && V.type === 'vendable' && V.categorieProduitId === cp.id,
      `${r.status} ${JSON.stringify(r.body).slice(0, 420)}`);
    check('réponse : sur chaque canal choisi, le prix repris de l\'original',
      JSON.stringify(r.body?.canaux) === JSON.stringify([{ canal: lienA, prix: 24, en_vente: true }, { canal: lienB, prix: 25, en_vente: true }]), JSON.stringify(r.body?.canaux));
    r = await C('GET', `/api/produits/${V.id}`);
    const recette = (r.body?.ingredients || []).map((i) => `${i.ingredientId ?? i.ingredient_id}:${parseFloat(i.portion)}`).sort();
    check('recette copiée à l\'identique (2 articles, mêmes portions)',
      r.status === 200 && JSON.stringify(recette) === JSON.stringify([`${farine.id}:0.2`, `${fromage.id}:0.1`].sort()) && r.body.varianteDeId === P.id, JSON.stringify(recette));

    // ── 2. La variante remplace l'original sur les canaux choisis ──
    let vV = await vendable(V.id); let vP = await vendable(P.id);
    const a = { PA: await prixPresta(P.id, lienA), VA: await prixPresta(V.id, lienA), VB: await prixPresta(V.id, lienB), PB: await prixPresta(P.id, lienB) };
    check('prestataire A : la variante en vente à 24, l\'original décoché, son prix gardé', a.VA?.prix === 24 && a.VA.en_vente === true && a.PA.en_vente === false && a.PA.prix === 24, JSON.stringify(a));
    check('prestataire B : la variante en vente à 25', a.VB?.prix === 25 && a.VB.en_vente === true && a.PB.en_vente === false, JSON.stringify(a));
    check('vente directe : l\'original y reste, la variante n\'y est pas', vP.actif === true && vP.directe === true && vP.prix === 20 && vV.actif === true && vV.directe === false && vV.prix === 0, `${JSON.stringify(vP)} ${JSON.stringify(vV)}`);

    // ── 3. Ventes ──
    r = await vendre(V.id, prestaA);
    check('vente de la variante par le prestataire A → 201', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await vendre(P.id, prestaA);
    check('vente de l\'original par le prestataire A → 409 PAS_EN_VENTE', r.status === 409 && r.body?.code === 'PAS_EN_VENTE', `${r.status} ${r.body?.code}`);
    r = await vendre(P.id, null);
    check('vente directe de l\'original → 201', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await vendre(V.id, null);
    check('vente directe de la variante → 409 PAS_EN_VENTE', r.status === 409 && r.body?.code === 'PAS_EN_VENTE', `${r.status} ${r.body?.code}`);

    // ── 4. La recette de la variante est indépendante ──
    r = await C('PUT', `/api/produits/${V.id}`, { ingredients: [{ ingredientId: farine.id, portion: 0.2 }, { ingredientId: fromage.id, portion: 0.12 }, { ingredientId: boite.id, portion: 1 }], subProducts: [] });
    const apresV = (await C('GET', `/api/produits/${V.id}`)).body?.ingredients?.length;
    const apresP = (await C('GET', `/api/produits/${P.id}`)).body?.ingredients?.length;
    check('recette de la variante modifiée (3 articles), celle de l\'original intacte (2)', r.status === 200 && apresV === 3 && apresP === 2, `${r.status} ${apresV} ${apresP}`);
    r = await C('GET', `/api/produits/${V.id}/cout`);
    check('coût de la variante calculé comme celui d\'un produit', r.status === 200, String(r.status));

    // ── 4 bis. Sur un canal, c'est l'original ou sa variante ──
    r = await PUT([cel(P.id, lienA, { en_vente: true })]);
    check('recocher l\'original là où sa variante se vend → 409 REMPLACE_PAR_VARIANTE, rien d\'écrit',
      r.status === 409 && r.body?.code === 'REMPLACE_PAR_VARIANTE' && (await prixPresta(P.id, lienA)).en_vente === false, `${r.status} ${r.body?.code} ${r.body?.message || ''}`);
    r = await PUT([cel(V.id, 'directe', { prix: 21, en_vente: true })]);
    vV = await vendable(V.id);
    check('mettre la variante en vente directe à côté de l\'original → 409, rien d\'écrit',
      r.status === 409 && r.body?.code === 'REMPLACE_PAR_VARIANTE' && vV.directe === false && vV.prix === 0, `${r.status} ${r.body?.code} ${JSON.stringify(vV)}`);
    r = await PUT([cel(P.id, lienA, { en_vente: true }), cel(V.id, lienA, { en_vente: false })]);
    check('même envoi : l\'original recoché et la variante décochée → 200 (l\'ordre des cellules ne compte pas)',
      r.status === 200 && (await prixPresta(P.id, lienA)).en_vente === true && (await prixPresta(V.id, lienA)).en_vente === false, `${r.status} ${r.body?.message || ''}`);
    r = await PUT([cel(V.id, lienA, { en_vente: true }), cel(P.id, lienA, { en_vente: false })]);
    check('retour : la variante reprend sa place chez le prestataire A',
      r.status === 200 && (await prixPresta(V.id, lienA)).en_vente === true && (await prixPresta(P.id, lienA)).en_vente === false, `${r.status} ${r.body?.message || ''}`);
    r = await PUT([cel(P.id, 'directe', { prix: 20.5 })]);
    check('un prix de l\'original sur un autre canal que sa variante reste modifiable', r.status === 200 && (await vendable(P.id)).prix === 20.5, `${r.status} ${r.body?.message || ''}`);
    await PUT([cel(P.id, 'directe', { prix: 20 })]);

    // Copie d'un canal : la variante garde sa place, dans les deux sens.
    const COPIER = (corps) => C('POST', '/api/canaux-vente/copier', { activite_id: act.id, ...corps });
    r = await COPIER({ source: 'directe', cible: lienA, retirer_absents: true });
    let cA = { P: await prixPresta(P.id, lienA), V: await prixPresta(V.id, lienA), P2: await prixPresta(P2.id, lienA) };
    check('copie directe → prestataire A (avec retrait des absents) : l\'original laissé, la variante gardée, le reste copié',
      r.status === 200 && r.body?.copies === 1 && r.body.laisses === 1 && r.body.retires === 0 && r.body.prix_remplaces === 0
        && cA.P.en_vente === false && cA.P.prix === 24 && cA.V.en_vente === true && cA.V.prix === 24 && cA.P2?.en_vente === true && cA.P2.prix === 9,
      `${JSON.stringify(r.body)} ${JSON.stringify(cA)}`);
    r = await COPIER({ source: lienA, cible: 'directe', retirer_absents: true });
    vV = await vendable(V.id); vP = await vendable(P.id);
    check('copie prestataire A → directe : la variante n\'y remplace pas l\'original',
      r.status === 200 && r.body?.copies === 1 && r.body.laisses === 1 && r.body.retires === 0 && vV.directe === false && vP.directe === true && vP.prix === 20,
      `${JSON.stringify(r.body)} ${JSON.stringify(vV)} ${JSON.stringify(vP)}`);
    r = await PUT([cel(P2.id, lienA, { prix: null })]);
    cA = await prixPresta(P2.id, lienA);
    check('remise en état : le second produit n\'a plus de prix chez le prestataire A', r.status === 200 && cA.prix === null && cA.en_vente === false, `${r.status} ${JSON.stringify(cA)}`);

    // ── 5. Liste ──
    r = await C('GET', `/api/produits?activiteId=${act.id}&type=vendable`);
    const lV = r.body?.find?.((x) => x.id === V.id); const lP = r.body?.find?.((x) => x.id === P.id);
    check('liste des produits : la variante porte son origine, l\'original compte ses variantes',
      lV?.varianteDeId === P.id && lV.varianteDeNom === 'Pizza TEST C2' && lV.varianteLibelle === 'Livraison' && lP?.variantesCount === 1 && lP.varianteDeId === null && lV.variantesCount === 0,
      `${JSON.stringify({ v: lV?.varianteDeId, n: lV?.varianteDeNom, p: lP?.variantesCount })}`);

    // ── 6. Refus ──
    r = await VAR(V.id, { libelle: 'Bis', canaux: [lienA] });
    check('variante d\'une variante → 400 VARIANTE_DE_VARIANTE', r.status === 400 && r.body?.code === 'VARIANTE_DE_VARIANTE', `${r.status} ${r.body?.code}`);
    r = await VAR(P.id, { libelle: 'livraison', canaux: [lienA] });
    check('même libellé (casse différente) → 409 VARIANTE_EXISTANTE', r.status === 409 && r.body?.code === 'VARIANTE_EXISTANTE', `${r.status} ${r.body?.code}`);
    r = await VAR(P.id, { libelle: '  ', canaux: [lienA] });
    check('libellé vide → 400 LIBELLE_REQUIS', r.status === 400 && r.body?.code === 'LIBELLE_REQUIS', `${r.status} ${r.body?.code}`);
    r = await VAR(P.id, { libelle: 'Soir', canaux: [] });
    check('aucun canal → 400 CANAUX_REQUIS', r.status === 400 && r.body?.code === 'CANAUX_REQUIS', `${r.status} ${r.body?.code}`);
    r = await VAR(P.id, { libelle: 'Soir', canaux: [lienA, crypto.randomUUID()] });
    check('canal non activé → 404 CANAL_INTROUVABLE, rien de créé', r.status === 404 && r.body?.code === 'CANAL_INTROUVABLE' && (await nbVariantes(P.id)) === 1, `${r.status} ${r.body?.code} ${await nbVariantes(P.id)}`);
    r = await VAR(999999999, { libelle: 'Soir', canaux: [lienA] });
    check('produit inconnu ou d\'un autre compte → 404', r.status === 404, String(r.status));
    r = await C('POST', `/api/produits/${P.id}/variantes`, { activite_id: 999999999, libelle: 'Soir', canaux: ['directe'] });
    check('activité d\'un autre compte → 403', r.status === 403, String(r.status));
    const PU = (await pool.query(`INSERT INTO produits (nom, client_id, type, origine) VALUES ('Sauce TEST C2', $1, 'utilisable', 'activite') RETURNING id`, [clientId])).rows[0].id;
    r = await VAR(PU, { libelle: 'Soir', canaux: ['directe'] });
    check('produit utilisable → 400 VARIANTE_IMPOSSIBLE', r.status === 400 && r.body?.code === 'VARIANTE_IMPOSSIBLE', `${r.status} ${r.body?.code}`);
    r = await appel('POST', `/api/produits/${P.id}/variantes`, null, { activite_id: act.id, libelle: 'Soir', canaux: ['directe'] });
    check('sans connexion → 401', r.status === 401, String(r.status));

    // ── 7. Canal où l'original n'a pas de prix : la variante y reste à régler ──
    r = await VAR(P2.id, { libelle: 'Livraison', canaux: [lienA] });
    const V2 = r.body?.produit;
    check('variante sur un canal sans prix : créée, canal rendu sans prix, original inchangé',
      r.status === 201 && JSON.stringify(r.body?.canaux) === JSON.stringify([{ canal: lienA, prix: null, en_vente: false }]) && (await vendable(V2.id)) === null && (await vendable(P2.id)).directe === true,
      `${r.status} ${JSON.stringify(r.body?.canaux)} ${JSON.stringify(await vendable(V2?.id))}`);

    // ── 8. Variante sur la vente directe : l'original sort de tous ses canaux ──
    r = await VAR(P.id, { libelle: 'Sur place', canaux: ['directe'] });
    const V3 = r.body?.produit;
    vP = await vendable(P.id); const vV3 = await vendable(V3.id);
    check('variante de la vente directe : en vente à 20, l\'original décoché partout (prix gardé)', r.status === 201 && vV3.directe === true && vV3.prix === 20 && vP.directe === false && vP.prix === 20 && vP.actif === false, `${r.status} ${JSON.stringify(vP)} ${JSON.stringify(vV3)}`);

    // ── 9. Renommer l'original ──
    await C('PUT', `/api/produits/${V2.id}`, { name: 'Salade spéciale TEST C2' });
    r = await C('PUT', `/api/produits/${P.id}`, { name: 'Pizza Reine TEST C2' });
    const noms = (await pool.query('SELECT nom FROM produits WHERE variante_de_id = $1 ORDER BY id', [P.id])).rows.map((x) => x.nom);
    check('renommer l\'original fait suivre ses variantes', r.status === 200 && JSON.stringify(noms) === JSON.stringify(['Pizza Reine TEST C2 — Livraison', 'Pizza Reine TEST C2 — Sur place']), JSON.stringify(noms));
    await C('PUT', `/api/produits/${P2.id}`, { name: 'Salade verte TEST C2' });
    const nomV2 = (await pool.query('SELECT nom FROM produits WHERE id = $1', [V2.id])).rows[0].nom;
    check('une variante renommée à la main garde son nom', nomV2 === 'Salade spéciale TEST C2', nomV2);

    // ── 10. Suppression ──
    r = await C('DELETE', `/api/produits/${P.id}`);
    check('supprimer un produit qui a des variantes → 409 PRODUIT_A_VARIANTES', r.status === 409 && r.body?.code === 'PRODUIT_A_VARIANTES', `${r.status} ${r.body?.code}`);
    r = await C('DELETE', `/api/produits/${V2.id}`);
    const r2 = await C('DELETE', `/api/produits/${P2.id}`);
    check('la variante supprimée, l\'original se supprime ensuite', r.status === 204 && r2.status === 204, `${r.status} ${r2.status}`);

    // ── 11. Rejeu de la migration 259 ──
    try {
      await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '259_produits_variantes.sql'), 'utf8'));
      check('migration 259 rejouée sans erreur', true);
    } catch (e) { check('migration 259 rejouée sans erreur', false, e.message); }
    check('rejeu sans effet : les variantes gardent leur origine', (await nbVariantes(P.id)) === 2, String(await nbVariantes(P.id)));
    let refuse = false;
    try { await pool.query('UPDATE produits SET variante_de_id = id WHERE id = $1', [V.id]); } catch (_) { refuse = true; }
    check('garde-fou : un produit ne peut pas être sa propre variante', refuse);
  } catch (e) {
    check('déroulé sans exception', false, e.stack);
  } finally {
    await wipe();
    const reste = (await pool.query('SELECT COUNT(*)::int AS n FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT]])).rows[0].n;
    const prestaReste = (await pool.query(`SELECT COUNT(*)::int AS n FROM prestataires_livraison WHERE nom LIKE 'TEST Presta C2%'`)).rows[0].n;
    check('nettoyage : comptes et prestataires d\'essai retirés', reste === 0 && prestaReste === 0, `${reste} ${prestaReste}`);
    const ok = results.filter((x) => x.ok).length;
    console.log(`\n${ok}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ok === results.length ? 0 : 1);
  }
})();
