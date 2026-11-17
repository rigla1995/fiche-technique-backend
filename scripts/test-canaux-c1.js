/* Test E2E local — C1 « Canaux de vente » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.2).
 *   grille : cellule de la vente directe et d'un prestataire (prix, case « en vente »), refus (prix manquant, canal
 *   inconnu, produit d'un autre compte), envoi tout ou rien, produit réservé à un prestataire, prix effacé = case
 *   décochée, interrupteur du produit qui suit ses canaux ; saisie d'une vente : ligne hors canal refusée (409
 *   PAS_EN_VENTE) en direct comme chez un prestataire ; routes d'avant les canaux (activer = vendre en direct, prix
 *   prestataire = en vente) ; copie d'un canal (majoration, arrondi, prix remplacés, retrait des absents, refus) ;
 *   désactiver un prestataire retire les produits qui n'étaient vendus que chez lui ; rejeu de la migration 256.
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
  const ADMIN = 'test-admin-canaux-c1@example.com';
  const CLIENT = 'test-client-canaux-c1@example.com';
  let adminTok = null;
  let clientId = null;
  const prestasCrees = [];
  const wipe = async () => {
    const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
    if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    for (const id of prestasCrees) if (adminTok) await appel('DELETE', `/api/admin/prestataires/${id}`, adminTok);
    await pool.query(`DELETE FROM prestataires_livraison WHERE nom LIKE 'TEST Presta C1%'`).catch(() => {});
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
       VALUES ('TEST Admin C1', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    check('connexion admin', !!adminTok);
    const A = (m, p, b) => appel(m, p, adminTok, b);

    let r = await A('POST', '/admin/clients', { nom: 'TEST Client C1', email: CLIENT, telephone: '20 555 256', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    check('création du client LabFlow', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const tok = await login(CLIENT);
    check('connexion du client', !!tok);
    const C = (m, p, b) => appel(m, p, tok, b);

    let act = (await C('GET', '/api/entreprise/activites')).body?.[0];
    if (!act) act = (await C('POST', '/api/entreprise/activites', { nom: 'Restaurant C1' })).body;

    // Deux prestataires de la plateforme (créés par l'admin d'essai s'il en manque).
    for (const nom of ['TEST Presta C1 a', 'TEST Presta C1 b']) {
      const cr = await A('POST', '/api/admin/prestataires', { nom });
      if (cr.body?.id) prestasCrees.push(cr.body.id);
    }
    const [prestaA, prestaB] = prestasCrees;
    const mode = (await C('GET', '/api/modes-paiement')).body?.[0];
    check('activité, deux prestataires et un mode de paiement disponibles', !!act?.id && !!prestaA && !!prestaB && !!mode?.id, JSON.stringify({ act: act?.id, prestaA, prestaB, mode: mode?.id }));
    const activer = async (prestataireId) => (await C('POST', '/api/activite-prestataires', { activite_id: act.id, prestataire_id: prestataireId, taux_commission: 25, taux_tva: 19, mode_paiement_id: mode.id })).body?.id;
    const lienA = await activer(prestaA);
    check('prestataire A activé avec ses conditions', !!lienA);

    // Quatre produits vendables sans recette (insérés en base : l'assistant des produits n'est pas l'objet de l'essai).
    const produit = async (nom) => (await pool.query(
      `INSERT INTO produits (nom, client_id, type, origine) VALUES ($1, $2, 'vendable', 'activite') RETURNING id`, [nom, clientId])).rows[0].id;
    const P1 = await produit('Pizza TEST C1');
    const P2 = await produit('Pizza livraison TEST C1');
    const P3 = await produit('Salade TEST C1');
    const P4 = await produit('Dessert TEST C1');

    const PUT = (cellules, activiteId = act.id) => C('PUT', '/api/canaux-vente', { activite_id: activiteId, cellules });
    const cel = (articleId, canal, autres) => ({ article_type: 'produit', article_id: articleId, canal, ...autres });
    const vendable = async (articleId, type = 'produit') => (await pool.query(
      `SELECT id, prix_vente::float AS prix, actif, directe FROM activite_articles_vendables WHERE activite_id = $1 AND article_type = $2 AND article_id = $3`,
      [act.id, type, articleId])).rows[0] || null;
    const prixPresta = async (articleId, lien, type = 'produit') => (await pool.query(
      `SELECT app.prix_vente::float AS prix, app.en_vente FROM article_prix_prestataire app
         JOIN activite_articles_vendables av ON av.id = app.article_vendable_id
        WHERE av.activite_id = $1 AND av.article_type = $2 AND av.article_id = $3 AND app.activite_prestataire_id = $4`,
      [act.id, type, articleId, lien])).rows[0] || null;
    const vendre = (articleId, canal, type = 'produit') => C('POST', '/api/ventes', {
      activite_id: act.id, date_vente: today, type_vente: canal ? 'prestataire' : 'directe', prestataire_id: canal || null,
      lignes: [{ article_type: type, article_id: articleId, quantite: 1, prix_unitaire: 10 }],
    });

    // ── 1. Vente directe : prix et case ──
    r = await PUT([cel(P1, 'directe', { prix: 20, en_vente: true })]);
    let v = await vendable(P1);
    check('cellule directe prix 20 + case → 200, produit en vente', r.status === 200 && r.body?.modifiees === 1 && v?.prix === 20 && v.actif === true && v.directe === true, `${r.status} ${JSON.stringify(v)}`);
    const histo = (await pool.query('SELECT COUNT(*)::int AS n FROM article_vendable_prix_historique WHERE article_vendable_id = $1', [v.id])).rows[0].n;
    check('le prix direct entre dans l\'historique des prix', histo === 1, String(histo));
    r = await C('GET', `/api/articles-vendables?activiteId=${act.id}`);
    const ligneP1 = r.body?.find?.((x) => x.article_id === P1);
    check('liste des vendables : champ « directe » servi', r.status === 200 && ligneP1?.directe === true && ligneP1?.actif === true, JSON.stringify(ligneP1));

    // ── 2. Refus ──
    r = await PUT([cel(P3, 'directe', { en_vente: true })]);
    check('cocher sans prix → 400 PRIX_REQUIS, rien d\'écrit', r.status === 400 && r.body?.code === 'PRIX_REQUIS' && (await vendable(P3)) === null, `${r.status} ${r.body?.code}`);
    r = await PUT([cel(P3, 'directe', { prix: 8.9, en_vente: true }), cel(P4, 'directe', { en_vente: true })]);
    check('envoi tout ou rien : une cellule refusée annule les autres', r.status === 400 && (await vendable(P3)) === null, `${r.status} ${JSON.stringify(await vendable(P3))}`);
    r = await PUT([cel(P1, 'glovo', { prix: 5 })]);
    check('canal mal formé → 400 CANAL_INVALIDE', r.status === 400 && r.body?.code === 'CANAL_INVALIDE', `${r.status} ${r.body?.code}`);
    r = await PUT([cel(P1, crypto.randomUUID(), { prix: 5 })]);
    check('prestataire non activé ici → 404 CANAL_INTROUVABLE', r.status === 404 && r.body?.code === 'CANAL_INTROUVABLE', `${r.status} ${r.body?.code}`);
    r = await PUT([cel(999999999, 'directe', { prix: 5 })]);
    check('produit d\'un autre compte ou inconnu → 404 ARTICLE_INTROUVABLE', r.status === 404 && r.body?.code === 'ARTICLE_INTROUVABLE', `${r.status} ${r.body?.code}`);
    r = await PUT([cel(P1, 'directe', { prix: 5 })], 999999999);
    check('activité d\'un autre compte → 403', r.status === 403, String(r.status));
    r = await PUT([]);
    check('aucune cellule → 400 CELLULES_REQUISES', r.status === 400 && r.body?.code === 'CELLULES_REQUISES', `${r.status} ${r.body?.code}`);
    r = await appel('PUT', '/api/canaux-vente', null, { activite_id: act.id, cellules: [] });
    check('sans connexion → 401', r.status === 401, String(r.status));

    // ── 3. Produit réservé à un prestataire ──
    r = await PUT([cel(P2, lienA, { prix: 26, en_vente: true })]);
    v = await vendable(P2);
    let pp = await prixPresta(P2, lienA);
    check('produit vendu chez le prestataire seulement : pas de prix direct, en vente', r.status === 200 && v?.actif === true && v.directe === false && v.prix === 0 && pp?.prix === 26 && pp.en_vente === true, `${r.status} ${JSON.stringify(v)} ${JSON.stringify(pp)}`);
    r = await C('GET', `/api/article-prix-prestataire?activiteId=${act.id}`);
    check('liste des prix prestataire : champ « en_vente » servi', r.body?.find?.((x) => x.article_id === P2)?.en_vente === true, JSON.stringify(r.body?.[0]));

    // ── 4. Saisie d'une vente : une ligne hors canal est refusée ──
    r = await vendre(P1, null);
    check('vente directe d\'un produit en vente directe → 201', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await vendre(P2, null);
    check('vente directe d\'un produit réservé au prestataire → 409 PAS_EN_VENTE, produit nommé', r.status === 409 && r.body?.code === 'PAS_EN_VENTE' && /Pizza livraison TEST C1/.test(r.body?.message || ''), `${r.status} ${r.body?.code} ${r.body?.message}`);
    r = await vendre(P2, prestaA);
    check('vente par le prestataire d\'un produit en vente chez lui → 201', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await vendre(P1, prestaA);
    check('vente par le prestataire d\'un produit sans prix chez lui → 409 PAS_EN_VENTE', r.status === 409 && r.body?.code === 'PAS_EN_VENTE', `${r.status} ${r.body?.code}`);
    r = await vendre(P4, null);
    check('vente d\'un produit jamais configuré → 409 PAS_EN_VENTE', r.status === 409 && r.body?.code === 'PAS_EN_VENTE', `${r.status} ${r.body?.code}`);
    const nbVentes = (await pool.query('SELECT COUNT(*)::int AS n FROM ventes WHERE activite_id = $1', [act.id])).rows[0].n;
    check('les refus n\'ont créé aucune vente (2 ventes en base)', nbVentes === 2, String(nbVentes));

    // ── 5. Décocher, recocher, effacer le prix ──
    r = await PUT([cel(P2, lienA, { en_vente: false })]);
    v = await vendable(P2); pp = await prixPresta(P2, lienA);
    check('décocher le seul canal : produit hors vente, prix gardé', r.status === 200 && v.actif === false && pp.en_vente === false && pp.prix === 26, `${JSON.stringify(v)} ${JSON.stringify(pp)}`);
    r = await vendre(P2, prestaA);
    check('vente par le prestataire d\'un produit décoché → 409 PAS_EN_VENTE', r.status === 409 && r.body?.code === 'PAS_EN_VENTE', `${r.status} ${r.body?.code}`);
    r = await PUT([cel(P2, lienA, { en_vente: true })]);
    v = await vendable(P2); pp = await prixPresta(P2, lienA);
    check('recocher avec le prix gardé → produit de nouveau en vente', r.status === 200 && v.actif === true && v.directe === false && pp.en_vente === true, `${r.status} ${JSON.stringify(v)}`);
    r = await PUT([cel(P2, lienA, { prix: null })]);
    v = await vendable(P2); pp = await prixPresta(P2, lienA);
    check('effacer le prix décoche la case et sort le produit de la vente', r.status === 200 && pp.prix === null && pp.en_vente === false && v.actif === false, `${JSON.stringify(v)} ${JSON.stringify(pp)}`);
    r = await PUT([cel(P1, 'directe', { prix: 0 })]);
    v = await vendable(P1);
    check('prix direct à zéro : case décochée, produit hors vente', r.status === 200 && v.directe === false && v.actif === false, JSON.stringify(v));
    r = await PUT([cel(P1, 'directe', { prix: 20, en_vente: true }), cel(P1, lienA, { prix: 24 })]);
    v = await vendable(P1); pp = await prixPresta(P1, lienA);
    check('prix prestataire sans cocher : gardé, hors vente sur ce canal', r.status === 200 && v.actif === true && pp.prix === 24 && pp.en_vente === false, `${JSON.stringify(v)} ${JSON.stringify(pp)}`);

    // ── 6. Routes d'avant les canaux (ancien écran pendant la mise en ligne) ──
    const unite = async (name) => { const c = await C('POST', '/api/unites', { name }); return c.status === 201 ? c.body : (await C('GET', '/api/unites')).body.find((u) => u.name === name); };
    const L = await unite('L');
    const fam = await C('POST', '/api/familles', { name: 'TEST-Fam C1' });
    const cat = await C('POST', '/api/categories', { name: 'TEST-Cat C1', familleId: fam.body?.id });
    const jus = (await C('POST', '/api/articles', { name: 'Jus TEST C1', unitId: L.id, categorieId: cat.body?.id })).body;
    r = await C('POST', '/api/articles-vendables', { activite_id: act.id, article_type: 'ingredient', article_id: jus.id, prix_vente: 30, actif: true });
    const avJus = r.body?.id;
    v = await vendable(jus.id, 'ingredient');
    check('ancienne route : activer un article = le vendre en direct', r.status === 201 && v.actif === true && v.directe === true, `${r.status} ${JSON.stringify(v)}`);
    r = await C('POST', '/api/article-prix-prestataire', { article_vendable_id: avJus, activite_prestataire_id: lienA, prix_vente: 35 });
    pp = await prixPresta(jus.id, lienA, 'ingredient');
    check('ancienne route : un prix prestataire met en vente sur ce canal', r.status === 201 && pp.en_vente === true && pp.prix === 35, `${r.status} ${JSON.stringify(pp)}`);
    r = await vendre(jus.id, prestaA, 'ingredient');
    check('article valorisé vendu par le prestataire → 201', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await C('PUT', `/api/articles-vendables/${avJus}`, { actif: false });
    r = await vendre(jus.id, null, 'ingredient');
    check('article désactivé par l\'ancien écran : vente refusée (409)', r.status === 409 && r.body?.code === 'PAS_EN_VENTE', `${r.status} ${r.body?.code}`);
    r = await PUT([{ article_type: 'ingredient', article_id: jus.id, canal: lienA, en_vente: true }]);
    v = await vendable(jus.id, 'ingredient'); pp = await prixPresta(jus.id, lienA, 'ingredient');
    check('recoché chez le prestataire seulement : la case directe périmée repart de zéro', r.status === 200 && v.actif === true && v.directe === false && pp.en_vente === true, `${r.status} ${JSON.stringify(v)} ${JSON.stringify(pp)}`);
    r = await C('POST', '/api/article-prix-prestataire', { article_vendable_id: avJus, activite_prestataire_id: lienA, prix_vente: null });
    v = await vendable(jus.id, 'ingredient'); pp = await prixPresta(jus.id, lienA, 'ingredient');
    check('ancienne route : prix effacé = retiré du canal, produit hors vente', r.status === 201 && pp.en_vente === false && v.actif === false, `${JSON.stringify(v)} ${JSON.stringify(pp)}`);

    // ── 7. Copier un canal ──
    const lienB = await activer(prestaB);
    await PUT([cel(P3, 'directe', { prix: 8.9, en_vente: true }), cel(P4, 'directe', { prix: 6 })]); // P4 : prix sans case
    const COPIER = (corps) => C('POST', '/api/canaux-vente/copier', { activite_id: act.id, ...corps });
    r = await COPIER({ source: 'directe', cible: lienB, majoration_pct: 20, arrondi: 0.1 });
    let b1 = await prixPresta(P1, lienB); let b3 = await prixPresta(P3, lienB); const b4 = await prixPresta(P4, lienB);
    check('copie directe → prestataire B, +20 %, arrondi à 100 millimes : 20 → 24, 8,9 → 10,7',
      r.status === 200 && r.body?.copies === 2 && r.body.prix_remplaces === 0 && r.body.retires === 0 && b1?.prix === 24 && b1.en_vente && b3?.prix === 10.7 && b3.en_vente && b4 === null,
      `${r.status} ${JSON.stringify(r.body)} ${JSON.stringify(b1)} ${JSON.stringify(b3)} ${JSON.stringify(b4)}`);
    r = await COPIER({ source: 'directe', cible: lienB, majoration_pct: 10 });
    b1 = await prixPresta(P1, lienB); b3 = await prixPresta(P3, lienB);
    check('seconde copie à +10 % : deux prix remplacés (22 et 9,79)', r.status === 200 && r.body?.prix_remplaces === 2 && b1.prix === 22 && b3.prix === 9.79, `${JSON.stringify(r.body)} ${b1?.prix} ${b3?.prix}`);
    await PUT([cel(P2, lienB, { prix: 26, en_vente: true })]);
    r = await COPIER({ source: 'directe', cible: lienB, retirer_absents: true });
    const b2 = await prixPresta(P2, lienB);
    check('copie avec retrait des absents : le produit absent de la source sort du canal, prix gardé', r.status === 200 && r.body?.retires === 1 && b2.en_vente === false && b2.prix === 26 && (await vendable(P2)).actif === false, `${JSON.stringify(r.body)} ${JSON.stringify(b2)}`);
    await PUT([cel(P2, lienB, { en_vente: true })]);
    r = await COPIER({ source: lienB, cible: 'directe', majoration_pct: -10, arrondi: 1 });
    v = await vendable(P2);
    check('copie prestataire → directe, −10 %, au dinar : 26 → 23 en vente directe', r.status === 200 && r.body?.copies === 3 && v.directe === true && v.prix === 23, `${JSON.stringify(r.body)} ${JSON.stringify(v)}`);
    r = await COPIER({ source: 'directe', cible: 'directe' });
    check('copie d\'un canal sur lui-même → 400 CANAUX_IDENTIQUES', r.status === 400 && r.body?.code === 'CANAUX_IDENTIQUES', `${r.status} ${r.body?.code}`);
    r = await COPIER({ source: 'directe', cible: lienB, majoration_pct: 900 });
    check('majoration hors bornes → 400 MAJORATION_INVALIDE', r.status === 400 && r.body?.code === 'MAJORATION_INVALIDE', `${r.status} ${r.body?.code}`);
    r = await COPIER({ source: 'directe', cible: crypto.randomUUID() });
    check('copie vers un prestataire non activé → 404 CANAL_INTROUVABLE', r.status === 404 && r.body?.code === 'CANAL_INTROUVABLE', `${r.status} ${r.body?.code}`);

    // ── 8. Désactiver un prestataire ──
    const P5 = await produit('Formule TEST C1');
    await PUT([cel(P5, lienB, { prix: 15, en_vente: true })]);
    r = await C('DELETE', `/api/activite-prestataires/${lienB}`);
    v = await vendable(P5);
    check('désactiver le prestataire : le produit vendu seulement chez lui sort de la vente', r.status === 200 && r.body?.produits_retires === 1 && r.body.prix_effaces >= 4 && v.actif === false, `${r.status} ${JSON.stringify(r.body)} ${JSON.stringify(v)}`);
    check('les produits aussi vendus en direct restent en vente', (await vendable(P1)).actif === true && (await vendable(P3)).actif === true);

    // ── 9. Rejeu de la migration 256 ──
    await pool.query(
      `INSERT INTO article_prix_prestataire (article_vendable_id, activite_prestataire_id, prix_vente, en_vente, created_by)
       VALUES ($1, $2, NULL, true, $3)`, [(await vendable(P5)).id, lienA, clientId]);
    try {
      await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '256_canaux_vente.sql'), 'utf8'));
      check('migration 256 rejouée sans erreur', true);
    } catch (e) { check('migration 256 rejouée sans erreur', false, e.message); }
    pp = await prixPresta(P5, lienA);
    check('reprise : une ligne sans prix n\'est pas en vente', pp?.en_vente === false, JSON.stringify(pp));
    check('rejeu sans effet sur les cases déjà réglées', (await vendable(P1)).directe === true && (await prixPresta(P1, lienA)).en_vente === false);
  } catch (e) {
    check('déroulé sans exception', false, e.stack);
  } finally {
    await wipe();
    const reste = (await pool.query('SELECT COUNT(*)::int AS n FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT]])).rows[0].n;
    const prestaReste = (await pool.query(`SELECT COUNT(*)::int AS n FROM prestataires_livraison WHERE nom LIKE 'TEST Presta C1%'`)).rows[0].n;
    check('nettoyage : comptes et prestataires d\'essai retirés', reste === 0 && prestaReste === 0, `${reste} ${prestaReste}`);
    const ok = results.filter((x) => x.ok).length;
    console.log(`\n${ok}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ok === results.length ? 0 : 1);
  }
})();
