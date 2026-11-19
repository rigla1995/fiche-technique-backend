/* Test E2E local — V1c « Menus, formules et lots » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §5 bis).
 *   une ligne de caisse qui vaut PLUSIEURS produits (menu) : une ligne de vente par produit sur chaque canal, prix = part
 *   du montant ÷ unités, stock sorti selon chaque recette ; un LOT (un produit × 3) ; une ligne simple inchangée ; ligne
 *   ignorée « toujours » apprise, puis oubliée ; correspondances apprises avec leurs quantités, puis corrigées ; refus sans
 *   écriture (produit du menu hors canal, doublon, parts fausses, quantité nulle, aucun produit, autre compte, plus de 8) ;
 *   annulation d'un import de menus (stock entièrement rendu) ; migration 266 rejouable ; suppression du compte.
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
  const ADMIN = 'test-admin-import-v1c@example.com';
  const CLIENT = 'test-client-import-v1c@example.com';
  let adminTok = null;
  let clientId = null;
  const prestasCrees = [];
  const wipe = async () => {
    const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
    if (client && !adminTok && (await pool.query('UPDATE utilisateurs SET mot_de_passe = $2 WHERE email = $1', [ADMIN, hash])).rowCount) adminTok = await login(ADMIN);
    if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    for (const id of prestasCrees) if (adminTok) await appel('DELETE', `/api/admin/prestataires/${id}`, adminTok);
    await pool.query(`DELETE FROM prestataires_livraison WHERE nom LIKE 'TEST Presta V1C%'`).catch(() => {});
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT]])).rows.map((r) => r.id);
    const tous = [...new Set([...ids, ...(clientId ? [clientId] : [])])];
    if (tous.length) {
      for (const table of ['correspondances_ventes', 'ventes_imports', 'ventes', 'article_vendable_prix_historique', 'article_prix_prestataire', 'activite_prestataires', 'activite_articles_vendables']) {
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
       VALUES ('TEST Admin V1C', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    check('connexion admin', !!adminTok);
    const A = (m, p, b) => appel(m, p, adminTok, b);

    let r = await A('POST', '/admin/clients', { nom: 'TEST Client V1C', email: CLIENT, telephone: '20 555 266', nbActivites: 1, nbLabos: 0, nbGerants: 0, formuleActivites: 'premium', montantOnboarding: 0 });
    check('création du client LabFlow (formule Premium)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const tok = await login(CLIENT);
    check('connexion du client', !!tok);
    const C = (m, p, b) => appel(m, p, tok, b);

    let act = (await C('GET', '/api/entreprise/activites')).body?.[0];
    if (!act) act = (await C('POST', '/api/entreprise/activites', { nom: 'Restaurant V1C' })).body;
    for (const nom of ['TEST Presta V1C a', 'TEST Presta V1C b']) {
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
    const fam = await C('POST', '/api/familles', { name: 'TEST-Fam V1C' });
    const cat = await C('POST', '/api/categories', { name: 'TEST-Cat V1C', familleId: fam.body?.id });
    const article = async (name) => (await C('POST', '/api/articles', { name, unitId: kg.id, categorieId: cat.body?.id })).body;
    const farine = await article('Farine TEST V1C');
    const fromage = await article('Fromage TEST V1C');
    const boite = await article('Boîte TEST V1C');
    const cp = (await C('POST', '/api/categories-produit', { name: 'Pizzas TEST V1C', typeProduit: 'vendable' })).body;
    const creerProduit = async (nom, ingredients) => C('POST', '/api/produits', { nom, type: 'vendable', origine: 'activite', categorieProduitId: cp.id, activiteIds: [act.id], ingredients, subProducts: [] });
    r = await creerProduit('Pizza TEST V1C', [{ ingredientId: farine.id, portion: 0.2 }, { ingredientId: fromage.id, portion: 0.1 }]);
    const P = r.body;
    check('produit d\'origine créé avec sa recette', r.status === 201 && !!P?.id && !!P.refProduit, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    const P2 = (await creerProduit('Salade TEST V1C', [{ ingredientId: fromage.id, portion: 0.05 }])).body;

    const PUT = (cellules) => C('PUT', '/api/canaux-vente', { activite_id: act.id, cellules });
    const cel = (articleId, canal, autres) => ({ article_type: 'produit', article_id: articleId, canal, ...autres });
    const jour = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    const empreinte = (nom) => crypto.createHash('sha256').update(nom).digest('hex');
    const IMPORT = (corps, jeton = tok) => appel('POST', '/api/ventes/imports', jeton, { activite_id: act.id, source: 'excel', ...corps });
    const CONTEXTE = () => C('GET', `/api/ventes/imports/contexte?activiteId=${act.id}`);
    const compter = async (table) => (await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE created_by = $1`, [clientId])).rows[0].n;
    const ventesDe = async (importId) => (await pool.query(
      `SELECT v.id, v.type_vente, v.prestataire_id, v.taux_commission::float AS taux, to_char(v.date_vente, 'YYYY-MM-DD') AS jour, v.notes,
              ROUND(SUM(vl.quantite * vl.prix_unitaire), 3)::float AS total, COUNT(vl.id)::int AS lignes, COUNT(vl.cout_unitaire)::int AS couts
         FROM ventes v JOIN vente_lignes vl ON vl.vente_id = v.id
        WHERE v.import_id = $1 GROUP BY v.id ORDER BY v.type_vente, v.prestataire_id`, [importId])).rows;
    const sortie = async (ingredientId, date) => (await pool.query(
      `SELECT COALESCE(SUM(quantite), 0)::float AS q FROM stock_entreprise_daily WHERE activite_id = $1 AND ingredient_id = $2 AND type_appro = 'vente' AND date_appro = $3`,
      [act.id, ingredientId, date])).rows[0].q;

    // La carte : la pizza se vend partout (directe 20, A 24, B 25), la salade en vente directe seulement (9).
    r = await PUT([cel(P.id, 'directe', { prix: 20, en_vente: true }), cel(P.id, lienA, { prix: 24, en_vente: true }), cel(P.id, lienB, { prix: 25, en_vente: true }),
      cel(P2.id, 'directe', { prix: 9, en_vente: true })]);
    check('carte réglée : la pizza sur trois canaux, la salade en vente directe', r.status === 200, `${r.status} ${JSON.stringify(r.body)}`);
    await pool.query('UPDATE profil_entreprise SET module_vente_actif = true WHERE client_id = $1', [clientId]);

    const pres = (a, b) => Math.abs(a - b) < 1e-6;
    const lignesDe = async (venteId) => (await pool.query(
      `SELECT article_id, quantite::float AS q, prix_unitaire::text AS p, (cout_unitaire IS NOT NULL) AS cout FROM vente_lignes WHERE vente_id = $1 ORDER BY id`, [venteId])).rows;
    const cible = (id, quantite, montant) => ({ article_type: 'produit', article_id: id, quantite, montant });

    // ── 1. Un menu, un lot, une ligne simple, deux lignes ignorées ──
    const J1 = jour(1);
    const fichier1 = {
      date_vente: J1, fichier_nom: 'caisse-menus.xlsx', empreinte: empreinte('menus 1'), modele: 'essai', categories: [],
      lignes: [
        { categorie: null, designation: 'MENU DUO', quantite: 4, montant: 100, cibles: [cible(P.id, 1, 80), cible(P2.id, 1, 20)], repartition: [{ canal: 'directe', quantite: 4 }] },
        { categorie: null, designation: 'LOT 3 PIZZAS', quantite: 2, montant: 96, cibles: [cible(P.id, 3, 96)], repartition: [{ canal: 'directe', quantite: 1 }, { canal: lienA, quantite: 1 }] },
        { categorie: null, designation: 'Pizza reine', quantite: 1, montant: 20, article_type: 'produit', article_id: P.id, repartition: [{ canal: 'directe', quantite: 1 }] },
        { categorie: null, designation: 'Pourboire', quantite: 1, montant: 2, ignoree: true, toujours: true },
        { categorie: null, designation: 'Divers', quantite: 1, montant: 1, ignoree: true },
      ],
    };
    r = await IMPORT(fichier1);
    const imp1 = r.body?.import;
    const parCanal = Object.fromEntries((r.body?.ventes || []).map((v) => [v.canal, v]));
    check('import → 201 : deux ventes (directe, prestataire A), 3 lignes enregistrées, 3 apprises',
      r.status === 201 && r.body.ventes.length === 2 && imp1?.nb_lignes === 3 && imp1.total_enregistre === 216 && r.body.apprises === 3, `${r.status} ${JSON.stringify(r.body).slice(0, 500)}`);
    check('chiffre par canal : 168 en vente directe (menu 100 + demi-lot 48 + pizza 20), 48 chez le prestataire', parCanal.directe?.total === 168 && parCanal[lienA]?.total === 48 && parCanal.directe.lignes === 4 && parCanal[lienA].lignes === 1, JSON.stringify(parCanal));
    const ld = await lignesDe(parCanal.directe.id);
    check('vente directe : le menu donne une ligne par produit (pizza 4 à 20, salade 4 à 5), le lot 3 pizzas à 16, la pizza simple à 20',
      ld.length === 4 && ld.every((l) => l.cout)
        && JSON.stringify(ld.map((l) => `${l.article_id}:${l.q}:${l.p}`).sort()) === JSON.stringify([`${P.id}:4:20.000000`, `${P2.id}:4:5.000000`, `${P.id}:3:16.000000`, `${P.id}:1:20.000000`].sort()), JSON.stringify(ld));
    const la = await lignesDe(parCanal[lienA].id);
    check('prestataire A : la moitié du lot, 3 pizzas à 16 (prix = part du montant ÷ unités)', la.length === 1 && la[0].article_id === P.id && la[0].q === 3 && la[0].p === '16.000000', JSON.stringify(la));
    check('stock sorti selon les recettes : 11 pizzas et 4 salades (farine 2,2 ; fromage 1,3)', pres(await sortie(farine.id, J1), -2.2) && pres(await sortie(fromage.id, J1), -1.3), `${await sortie(farine.id, J1)} ${await sortie(fromage.id, J1)}`);
    const gardees = (await pool.query('SELECT rang, ignoree, article_id, cibles FROM ventes_imports_lignes WHERE import_id = $1 ORDER BY rang', [imp1.id])).rows;
    check('lignes gardées : le menu avec ses deux produits et leurs parts, le lot avec sa quantité, les ignorées sans rien',
      gardees.length === 5 && gardees[0].article_id === null && gardees[0].cibles.length === 2 && gardees[0].cibles[1].montant === 20 && gardees[1].article_id === P.id && gardees[1].cibles[0].quantite === 3
        && gardees[2].cibles.length === 1 && gardees[2].cibles[0].quantite === 1 && gardees[3].cibles === null && gardees[4].cibles === null, JSON.stringify(gardees).slice(0, 400));

    // ── 2. Ce qui est appris ──
    r = await CONTEXTE();
    const corr = Object.fromEntries((r.body?.correspondances || []).map((c) => [c.cle, c]));
    check('appris : le menu vaut deux produits, le lot trois unités, la pizza une ; « Pourboire » est ignoré toujours ; « Divers » n\'est pas retenu',
      r.status === 200 && Object.keys(corr).length === 4 && corr['|menu duo'].cibles.length === 2 && corr['|menu duo'].cibles.every((c) => c.quantite === 1)
        && corr['|lot 3 pizzas'].cibles.length === 1 && corr['|lot 3 pizzas'].cibles[0].quantite === 3 && corr['|lot 3 pizzas'].cibles[0].article_id === P.id
        && corr['|pizza reine'].cibles[0].quantite === 1 && corr['|pourboire'].ignoree === true && corr['|pourboire'].cibles.length === 0 && !corr['|divers'],
      JSON.stringify(r.body?.correspondances).slice(0, 500));

    // ── 3. Refus : rien n'est écrit ──
    const avant = { ventes: await compter('ventes'), imports: await compter('ventes_imports') };
    const J2 = jour(2);
    const base = { date_vente: J2, fichier_nom: 'caisse-menus-2.xlsx', empreinte: empreinte('menus 2'), categories: [] };
    const menu = (plus) => ({ categorie: null, designation: 'MENU DUO', quantite: 2, montant: 50, cibles: [cible(P.id, 1, 40), cible(P2.id, 1, 10)], repartition: [{ canal: 'directe', quantite: 2 }], ...plus });
    r = await IMPORT({ ...base, lignes: [menu({ repartition: [{ canal: lienA, quantite: 2 }] })] });
    check('menu chez un prestataire où un de ses produits ne se vend pas → 409 PAS_EN_VENTE', r.status === 409 && r.body?.code === 'PAS_EN_VENTE', `${r.status} ${r.body?.code} ${r.body?.message}`);
    r = await IMPORT({ ...base, lignes: [menu({ cibles: [cible(P.id, 1, 40), cible(P.id, 2, 10)] })] });
    check('le même produit deux fois dans une ligne → 400 CIBLES_INVALIDES', r.status === 400 && r.body?.code === 'CIBLES_INVALIDES', `${r.status} ${r.body?.code} ${r.body?.message}`);
    r = await IMPORT({ ...base, lignes: [menu({ cibles: [cible(P.id, 1, 40), cible(P2.id, 1, 9)] })] });
    check('parts qui ne retombent pas sur le montant de la ligne → 400 CIBLES_INVALIDES', r.status === 400 && r.body?.code === 'CIBLES_INVALIDES', `${r.status} ${r.body?.code} ${r.body?.message}`);
    r = await IMPORT({ ...base, lignes: [menu({ cibles: [cible(P.id, 0, 40), cible(P2.id, 1, 10)] })] });
    check('quantité nulle pour un produit → 400 CIBLES_INVALIDES', r.status === 400 && r.body?.code === 'CIBLES_INVALIDES', `${r.status} ${r.body?.code}`);
    r = await IMPORT({ ...base, lignes: [menu({ cibles: [] })] });
    check('ligne sans aucun produit → 400 PRODUIT_REQUIS', r.status === 400 && r.body?.code === 'PRODUIT_REQUIS', `${r.status} ${r.body?.code}`);
    r = await IMPORT({ ...base, lignes: [menu({ cibles: [cible(P.id, 1, 40), cible(999999999, 1, 10)] })] });
    check('produit d\'un autre compte dans un menu → 404 ARTICLE_INTROUVABLE', r.status === 404 && r.body?.code === 'ARTICLE_INTROUVABLE', `${r.status} ${r.body?.code}`);
    r = await IMPORT({ ...base, lignes: [menu({ cibles: Array.from({ length: 9 }, (_, i) => cible(P.id + i, 1, i === 0 ? 50 : 0)) })] });
    check('plus de 8 produits dans une ligne → 400 CIBLES_INVALIDES', r.status === 400 && r.body?.code === 'CIBLES_INVALIDES', `${r.status} ${r.body?.code}`);
    const apres = { ventes: await compter('ventes'), imports: await compter('ventes_imports') };
    check('aucun refus n\'a rien écrit', JSON.stringify(apres) === JSON.stringify(avant), `${JSON.stringify(avant)} → ${JSON.stringify(apres)}`);

    // ── 4. Le lendemain : ce qui est appris se corrige ──
    r = await IMPORT({ ...base, lignes: [
      { categorie: null, designation: 'MENU DUO', quantite: 2, montant: 40, article_type: 'produit', article_id: P.id, repartition: [{ canal: 'directe', quantite: 2 }] },
      { categorie: null, designation: 'Pourboire', quantite: 1, montant: 2, ignoree: true },
      { categorie: null, designation: 'Service', quantite: 1, montant: 3, ignoree: true, toujours: true },
    ] });
    check('seconde journée → 201', r.status === 201 && r.body.import.total_enregistre === 40, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    r = await CONTEXTE();
    const corr2 = Object.fromEntries((r.body?.correspondances || []).map((c) => [c.cle, c]));
    check('appris, corrigé : le menu ne vaut plus qu\'un produit ; « Pourboire » n\'est plus ignoré toujours ; « Service » l\'est',
      corr2['|menu duo'].cibles.length === 1 && corr2['|menu duo'].cibles[0].quantite === 1 && !corr2['|pourboire'] && corr2['|service']?.ignoree === true && corr2['|lot 3 pizzas'].cibles[0].quantite === 3,
      JSON.stringify(r.body?.correspondances).slice(0, 500));

    // ── 5. Annuler un import de menus : tout le stock est rendu ──
    r = await C('DELETE', `/api/ventes/imports/${imp1.id}`);
    check('annulation de la première journée → 200, ses deux ventes effacées', r.status === 200 && r.body?.ventes === 2, `${r.status} ${JSON.stringify(r.body)}`);
    check('stock de la journée entièrement rendu', pres(await sortie(farine.id, J1), 0) && pres(await sortie(fromage.id, J1), 0), `${await sortie(farine.id, J1)} ${await sortie(fromage.id, J1)}`);

    // ── 6. Migration 266 ──
    try {
      await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '266_ventes_imports_v1c.sql'), 'utf8'));
      check('migration 266 rejouée sans erreur', true);
    } catch (e) { check('migration 266 rejouée sans erreur', false, e.message); }
    r = await A('DELETE', `/admin/clients/${clientId}`);
    check('suppression du compte → acceptée', r.status === 200 || r.status === 204, `${r.status} ${r.body?.message || ''}`);
  } catch (e) {
    check('déroulé sans exception', false, e.stack);
  } finally {
    await wipe();
    const reste = (await pool.query('SELECT COUNT(*)::int AS n FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT]])).rows[0].n;
    const prestaReste = (await pool.query(`SELECT COUNT(*)::int AS n FROM prestataires_livraison WHERE nom LIKE 'TEST Presta V1C%'`)).rows[0].n;
    check('nettoyage : comptes et prestataires d\'essai retirés', reste === 0 && prestaReste === 0, `${reste} ${prestaReste}`);
    const ok = results.filter((x) => x.ok).length;
    console.log(`\n${ok}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ok === results.length ? 0 : 1);
  }
})();
