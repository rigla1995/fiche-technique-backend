/* Test E2E local — V1a « Importer un fichier de caisse » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3, §5 bis).
 *   contexte vide puis appris ; import d'une journée : une vente par canal (directe, deux prestataires) avec les règles de
 *   la saisie (conditions du prestataire figées, coût, sorties de stock), prix = montant ÷ quantité (chiffre égal à celui
 *   du fichier au millime), ligne ignorée, catégorie de livraison répartie entre prestataires seulement ; correspondances
 *   et catégories apprises ; refus : même fichier, même journée, répartition fausse, vente directe dans une catégorie de
 *   livraison, produit hors canal (rien n'est écrit), produit d'un autre compte, canal inconnu, date future, sans
 *   connexion, activité d'un autre compte ; la saisie à la main fonctionne toujours ; migration 262 rejouable.
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
  const ADMIN = 'test-admin-import-v1a@example.com';
  const CLIENT = 'test-client-import-v1a@example.com';
  let adminTok = null;
  let clientId = null;
  const prestasCrees = [];
  const wipe = async () => {
    const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
    if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    for (const id of prestasCrees) if (adminTok) await appel('DELETE', `/api/admin/prestataires/${id}`, adminTok);
    await pool.query(`DELETE FROM prestataires_livraison WHERE nom LIKE 'TEST Presta V1A%'`).catch(() => {});
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
       VALUES ('TEST Admin V1A', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    check('connexion admin', !!adminTok);
    const A = (m, p, b) => appel(m, p, adminTok, b);

    let r = await A('POST', '/admin/clients', { nom: 'TEST Client V1A', email: CLIENT, telephone: '20 555 262', nbActivites: 1, nbLabos: 0, nbGerants: 0, formuleActivites: 'premium', montantOnboarding: 0 });
    check('création du client LabFlow (formule Premium)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const tok = await login(CLIENT);
    check('connexion du client', !!tok);
    const C = (m, p, b) => appel(m, p, tok, b);

    let act = (await C('GET', '/api/entreprise/activites')).body?.[0];
    if (!act) act = (await C('POST', '/api/entreprise/activites', { nom: 'Restaurant V1A' })).body;
    for (const nom of ['TEST Presta V1A a', 'TEST Presta V1A b']) {
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
    const fam = await C('POST', '/api/familles', { name: 'TEST-Fam V1A' });
    const cat = await C('POST', '/api/categories', { name: 'TEST-Cat V1A', familleId: fam.body?.id });
    const article = async (name) => (await C('POST', '/api/articles', { name, unitId: kg.id, categorieId: cat.body?.id })).body;
    const farine = await article('Farine TEST V1A');
    const fromage = await article('Fromage TEST V1A');
    const boite = await article('Boîte TEST V1A');
    const cp = (await C('POST', '/api/categories-produit', { name: 'Pizzas TEST V1A', typeProduit: 'vendable' })).body;
    const creerProduit = async (nom, ingredients) => C('POST', '/api/produits', { nom, type: 'vendable', origine: 'activite', categorieProduitId: cp.id, activiteIds: [act.id], ingredients, subProducts: [] });
    r = await creerProduit('Pizza TEST V1A', [{ ingredientId: farine.id, portion: 0.2 }, { ingredientId: fromage.id, portion: 0.1 }]);
    const P = r.body;
    check('produit d\'origine créé avec sa recette', r.status === 201 && !!P?.id && !!P.refProduit, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    const P2 = (await creerProduit('Salade TEST V1A', [{ ingredientId: fromage.id, portion: 0.05 }])).body;

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

    // ── 1. Contexte avant le premier import ──
    r = await CONTEXTE();
    check('contexte vide : aucune correspondance, aucune catégorie, aucune journée', r.status === 200 && r.body.correspondances.length === 0 && r.body.categories.length === 0 && r.body.jours.length === 0, `${r.status} ${JSON.stringify(r.body)}`);

    // ── 2. Import d'une journée ──
    const J1 = jour(1);
    const fichier1 = {
      date_vente: J1, fichier_nom: 'caisse-essai-1.xlsx', empreinte: empreinte('fichier 1'), modele: 'essai', total_lu: 663.1,
      categories: [{ nom: 'MENU PRINCIPAL', livraison: false }, { nom: 'DELIVERY', livraison: true }],
      lignes: [
        { categorie: 'MENU PRINCIPAL', designation: 'PIZZA REINE', quantite: 10, montant: 200, article_type: 'produit', article_id: P.id, repartition: [{ canal: 'directe', quantite: 10 }] },
        { categorie: 'MENU PRINCIPAL', designation: 'SALADE VERTE', quantite: 7, montant: 61.1, article_type: 'produit', article_id: P2.id, repartition: [{ canal: 'directe', quantite: 7 }] },
        { categorie: 'DELIVERY', designation: 'Pizza reine', quantite: 16, montant: 400, article_type: 'produit', article_id: P.id, repartition: [{ canal: lienA, quantite: 12 }, { canal: lienB, quantite: 4 }] },
        { categorie: 'MENU PRINCIPAL', designation: 'Service', quantite: 1, montant: 2, ignoree: true },
      ],
    };
    r = await IMPORT(fichier1);
    const imp1 = r.body?.import;
    check('import → 201 : trois ventes (directe, prestataire A, prestataire B), ligne ignorée écartée, 3 correspondances apprises',
      r.status === 201 && r.body.ventes.length === 3 && imp1?.nb_lignes === 3 && imp1.total_enregistre === 661.1 && imp1.total_lu === 663.1 && imp1.date_vente === J1 && r.body.apprises === 3,
      `${r.status} ${JSON.stringify(r.body).slice(0, 500)}`);
    const parCanal = Object.fromEntries((r.body?.ventes || []).map((v) => [v.canal, v]));
    check('réponse : le chiffre de chaque canal (261,100 en direct, 300 et 100 chez les prestataires)',
      parCanal.directe?.total === 261.1 && parCanal.directe.lignes === 2 && parCanal[lienA]?.total === 300 && parCanal[lienB]?.total === 100 && parCanal[lienA].prestataire_id === prestaA,
      JSON.stringify(parCanal));
    const vs = await ventesDe(imp1.id);
    const directe = vs.find((v) => v.type_vente === 'directe'); const vA = vs.find((v) => v.prestataire_id === prestaA); const vB = vs.find((v) => v.prestataire_id === prestaB);
    check('ventes en base : la journée du fichier, rattachées à l\'import, chiffre égal à celui du fichier au millime',
      vs.length === 3 && vs.every((v) => v.jour === J1 && /Import de caisse/.test(v.notes)) && directe.total === 261.1 && vA.total === 300 && vB.total === 100,
      JSON.stringify(vs));
    const prixSalade = (await pool.query(`SELECT vl.prix_unitaire::text AS p FROM vente_lignes vl WHERE vl.vente_id = $1 AND vl.article_id = $2`, [directe.id, P2.id])).rows[0].p;
    check('prix d\'une ligne importée = montant ÷ quantité à 6 décimales (61,100 ÷ 7)', prixSalade === '8.728571', prixSalade);
    check('mêmes règles que la saisie : conditions du prestataire figées (25 %), coût de chaque ligne posé',
      vA.taux === 25 && vB.taux === 25 && directe.taux === null && vs.every((v) => v.couts === v.lignes), JSON.stringify(vs));
    const sFarine = await sortie(farine.id, J1); const sFromage = await sortie(fromage.id, J1);
    check('stock sorti selon les recettes : farine 26 × 0,2 ; fromage 26 × 0,1 + 7 × 0,05',
      Math.abs(sFarine + 5.2) < 1e-6 && Math.abs(sFromage + 2.95) < 1e-6, `${sFarine} ${sFromage}`);
    const lignesGardees = (await pool.query('SELECT rang, designation, ignoree, article_id, repartition FROM ventes_imports_lignes WHERE import_id = $1 ORDER BY rang', [imp1.id])).rows;
    check('lignes du fichier gardées telles que vérifiées (4, dont l\'ignorée, avec leur répartition)',
      lignesGardees.length === 4 && lignesGardees[3].ignoree === true && lignesGardees[3].article_id === null && lignesGardees[2].repartition.length === 2 && lignesGardees[2].repartition[0].quantite === 12,
      JSON.stringify(lignesGardees).slice(0, 300));

    // ── 3. Ce qui est appris ──
    r = await CONTEXTE();
    const corr = r.body?.correspondances || [];
    const cles = corr.map((c) => c.cle).sort();
    check('contexte appris : la même désignation dans deux catégories garde deux clés ; DELIVERY est de la livraison ; la journée est notée',
      r.status === 200 && corr.length === 3 && JSON.stringify(cles) === JSON.stringify(['delivery|pizza reine', 'menu principal|pizza reine', 'menu principal|salade verte'])
        && corr.every((c) => c.cibles.length === 1 && c.cibles[0].quantite === 1 && c.ignoree === false)
        && r.body.categories.find((c) => c.cle === 'delivery')?.livraison === true && r.body.categories.find((c) => c.cle === 'menu principal')?.livraison === false
        && JSON.stringify(r.body.jours) === JSON.stringify([J1]),
      JSON.stringify(r.body).slice(0, 500));

    // ── 4. Une journée et un fichier ne s'importent qu'une fois ──
    const avant = { ventes: await compter('ventes'), imports: await compter('ventes_imports') };
    r = await IMPORT({ ...fichier1, date_vente: jour(2) });
    check('le même fichier pour une autre journée → 409 FICHIER_DEJA_IMPORTE', r.status === 409 && r.body?.code === 'FICHIER_DEJA_IMPORTE', `${r.status} ${r.body?.code} ${r.body?.message}`);
    r = await IMPORT({ ...fichier1, empreinte: empreinte('fichier 1 bis') });
    check('un autre fichier pour la même journée → 409 JOUR_DEJA_IMPORTE', r.status === 409 && r.body?.code === 'JOUR_DEJA_IMPORTE', `${r.status} ${r.body?.code} ${r.body?.message}`);

    // ── 5. Refus : rien n'est écrit ──
    const J2 = jour(2);
    const base = { date_vente: J2, fichier_nom: 'caisse-essai-2.xlsx', empreinte: empreinte('fichier 2'), categories: fichier1.categories };
    const ligne = (plus) => ({ categorie: 'MENU PRINCIPAL', designation: 'PIZZA REINE', quantite: 4, montant: 80, article_type: 'produit', article_id: P.id, repartition: [{ canal: 'directe', quantite: 4 }], ...plus });
    r = await IMPORT({ ...base, lignes: [ligne({ categorie: 'DELIVERY', repartition: [{ canal: 'directe', quantite: 1 }, { canal: lienA, quantite: 3 }] })] });
    check('vente directe dans une catégorie de livraison → 400 LIVRAISON_SANS_DIRECTE', r.status === 400 && r.body?.code === 'LIVRAISON_SANS_DIRECTE', `${r.status} ${r.body?.code} ${r.body?.message}`);
    r = await IMPORT({ ...base, lignes: [ligne({ repartition: [{ canal: 'directe', quantite: 3 }] })] });
    check('répartition différente de la quantité du fichier → 400 REPARTITION_INVALIDE', r.status === 400 && r.body?.code === 'REPARTITION_INVALIDE', `${r.status} ${r.body?.code} ${r.body?.message}`);
    r = await IMPORT({ ...base, lignes: [ligne({}), ligne({ designation: 'SALADE VERTE', article_id: P2.id, quantite: 2, montant: 18, repartition: [{ canal: lienA, quantite: 2 }] })] });
    check('produit hors canal (la salade chez le prestataire A) → 409 PAS_EN_VENTE', r.status === 409 && r.body?.code === 'PAS_EN_VENTE', `${r.status} ${r.body?.code} ${r.body?.message}`);
    r = await IMPORT({ ...base, lignes: [ligne({ article_id: 999999999 })] });
    check('produit d\'un autre compte ou inconnu → 404 ARTICLE_INTROUVABLE', r.status === 404 && r.body?.code === 'ARTICLE_INTROUVABLE', `${r.status} ${r.body?.code}`);
    r = await IMPORT({ ...base, lignes: [ligne({ repartition: [{ canal: crypto.randomUUID(), quantite: 4 }] })] });
    check('canal inconnu → 404 CANAL_INTROUVABLE', r.status === 404 && r.body?.code === 'CANAL_INTROUVABLE', `${r.status} ${r.body?.code}`);
    r = await IMPORT({ ...base, lignes: [ligne({ article_id: undefined, article_type: undefined })] });
    check('ligne sans produit ni « ignorer » → 400 PRODUIT_REQUIS', r.status === 400 && r.body?.code === 'PRODUIT_REQUIS', `${r.status} ${r.body?.code}`);
    r = await IMPORT({ ...base, date_vente: jour(-3), lignes: [ligne({})] });
    check('journée à venir → 400 DATE_FUTURE', r.status === 400 && r.body?.code === 'DATE_FUTURE', `${r.status} ${r.body?.code}`);
    r = await IMPORT({ ...base, lignes: [ligne({})] }, null);
    check('sans connexion → 401', r.status === 401, String(r.status));
    r = await appel('POST', '/api/ventes/imports', tok, { ...base, activite_id: 999999999, source: 'excel', lignes: [ligne({})] });
    check('activité d\'un autre compte → 403', r.status === 403, String(r.status));
    r = await C('GET', '/api/ventes/imports/contexte?activiteId=999999999');
    check('contexte d\'une activité d\'un autre compte → 403', r.status === 403, String(r.status));
    const apres = { ventes: await compter('ventes'), imports: await compter('ventes_imports') };
    check('aucun refus n\'a rien écrit (ni vente, ni import)', JSON.stringify(apres) === JSON.stringify(avant), `${JSON.stringify(avant)} → ${JSON.stringify(apres)}`);

    // ── 6. Une autre journée, un autre fichier : accepté ; la saisie à la main fonctionne toujours ──
    r = await IMPORT({ ...base, source: 'pdf', lignes: [ligne({}), ligne({ categorie: 'DELIVERY', designation: 'Pizza reine', quantite: 3, montant: 75, repartition: [{ canal: lienB, quantite: 3 }] })] });
    check('seconde journée (PDF) → 201, deux ventes', r.status === 201 && r.body.ventes.length === 2 && r.body.import.total_enregistre === 155, `${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    r = await C('POST', '/api/ventes', { activite_id: act.id, date_vente: J2, type_vente: 'directe', prestataire_id: null, lignes: [{ article_type: 'produit', article_id: P.id, quantite: 1, prix_unitaire: 20 }] });
    const main = r.status === 201 ? (await pool.query('SELECT import_id FROM ventes WHERE id = $1', [r.body.id])).rows[0] : null;
    check('saisie à la main le même jour → 201, sans import', r.status === 201 && main.import_id === null, `${r.status} ${r.body?.message || ''}`);
    r = await C('POST', '/api/ventes', { activite_id: act.id, date_vente: J2, type_vente: 'prestataire', prestataire_id: prestaA, lignes: [{ article_type: 'produit', article_id: P2.id, quantite: 1, prix_unitaire: 9 }] });
    check('saisie à la main d\'un produit hors canal → 409 PAS_EN_VENTE (inchangé)', r.status === 409 && r.body?.code === 'PAS_EN_VENTE', `${r.status} ${r.body?.code}`);
    r = await CONTEXTE();
    check('deux journées importées notées', r.status === 200 && JSON.stringify(r.body.jours) === JSON.stringify([J1, J2]), JSON.stringify(r.body?.jours));

    // ── 7. Migration 262 ──
    try {
      await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '262_ventes_imports.sql'), 'utf8'));
      check('migration 262 rejouée sans erreur', true);
    } catch (e) { check('migration 262 rejouée sans erreur', false, e.message); }
    const echelle = (await pool.query(`SELECT numeric_precision AS p, numeric_scale AS s FROM information_schema.columns WHERE table_name = 'vente_lignes' AND column_name = 'prix_unitaire'`)).rows[0];
    check('prix d\'une ligne de vente : 6 décimales', echelle.p === 14 && echelle.s === 6, JSON.stringify(echelle));
    let refuse = false;
    try {
      await pool.query(`INSERT INTO ventes_imports (activite_id, date_vente, source, empreinte, total_enregistre, nb_lignes) VALUES ($1, $2, 'excel', $3, 1, 1)`, [act.id, J1, empreinte('fichier 3')]);
    } catch (e) { refuse = e.code === '23505'; }
    check('garde-fou de la base : une journée ne s\'importe qu\'une fois', refuse);
  } catch (e) {
    check('déroulé sans exception', false, e.stack);
  } finally {
    await wipe();
    const reste = (await pool.query('SELECT COUNT(*)::int AS n FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT]])).rows[0].n;
    const prestaReste = (await pool.query(`SELECT COUNT(*)::int AS n FROM prestataires_livraison WHERE nom LIKE 'TEST Presta V1A%'`)).rows[0].n;
    check('nettoyage : comptes et prestataires d\'essai retirés', reste === 0 && prestaReste === 0, `${reste} ${prestaReste}`);
    const ok = results.filter((x) => x.ok).length;
    console.log(`\n${ok}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ok === results.length ? 0 : 1);
  }
})();
