/* Test E2E ciblé — finalisation Espace Acheteurs (backend démarré sur :3000).
 * Couvre : filtre ?source= de la liste des ventes, traitement direct en 'livree'
 * via /expedier (statut + dateLivraison, défaut = dateExpedition), rétrocompat
 * /expedier sans statut, filtre ?sources= de l'onglet Acheteurs du dashboard v2.
 * S'appuie sur le jeu de démo (scripts/seed-demo-vitrine.js) : client
 * demo@dar-yasmine.tn + acheteurs portail. Auto-nettoyage : les commandes de
 * test créées sont supprimées en SQL à la fin (factures comprises). */
require('dotenv').config();
const pool = require('../src/config/database');

const BASE = 'http://localhost:3000';
const EMAIL = process.env.E2E_EMAIL || 'demo@dar-yasmine.tn';
const PASSWORD = process.env.E2E_PASSWORD || 'DemoVitrine2026!';
const PORTAIL_EMAIL = process.env.E2E_PORTAIL_EMAIL || 'm.khelil.prof+acheteur1@gmail.com';
const PORTAIL_PASSWORD = process.env.E2E_PORTAIL_PASSWORD || 'Portail2026!';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const api = async (method, path, body, token) => {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* réponses binaires */ }
  return { status: r.status, data };
};
const today = () => new Date().toISOString().slice(0, 10);

(async () => {
  const cleanupIds = [];
  try {
    // ── Logins
    const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
    check('login client démo', !!login.data?.token, `user ${login.data?.user?.id}`);
    const T = login.data.token;
    const pLogin = await api('POST', '/auth/login', { email: PORTAIL_EMAIL, password: PORTAIL_PASSWORD });
    check('login acheteur portail', !!pLogin.data?.token);
    const PT = pLogin.data.token;

    // Labo du client (nécessaire à l'expédition)
    const labos = await api('GET', '/api/labo', null, T);
    check('labo disponible', Array.isArray(labos.data) && labos.data.length > 0);
    const laboId = labos.data[0].id;

    // ── 2 commandes portail (en_attente, source=portail)
    const cat = await api('GET', '/api/portail/catalogue', null, PT);
    const item = cat.data?.categories?.flatMap((c) => c.articles || c.items || [])?.[0]
      || (Array.isArray(cat.data) ? cat.data[0] : null)
      || cat.data?.articles?.[0];
    // Forme de réponse défensive : on cherche le premier { articleType, articleId }
    const flat = JSON.stringify(cat.data || {});
    let ligne = item && item.articleType ? { articleType: item.articleType, articleId: item.articleId } : null;
    if (!ligne) {
      const m = flat.match(/"articleType":"(ingredient|produit)","articleId":(\d+)/);
      if (m) ligne = { articleType: m[1], articleId: Number(m[2]) };
    }
    check('catalogue portail exploitable', !!ligne, ligne ? `${ligne.articleType}:${ligne.articleId}` : 'aucun article');

    const mkCommande = async () => {
      const r = await api('POST', '/api/portail/commandes', { lignes: [{ ...ligne, quantite: 0.5 }] }, PT);
      if (r.data?.id) cleanupIds.push(r.data.id);
      return r;
    };
    const c1 = await mkCommande();
    const c2 = await mkCommande();
    check('2 commandes portail créées', c1.status === 201 && c2.status === 201, `${c1.status}/${c2.status}`);
    const id1 = c1.data.id;
    const id2 = c2.data.id;

    // ── Filtre ?source= de la liste
    const lPortail = await api('GET', '/api/acheteurs/commandes?source=portail&statut=en_attente', null, T);
    const lClient = await api('GET', '/api/acheteurs/commandes?source=client&statut=en_attente', null, T);
    check('?source=portail contient les commandes', lPortail.data.some((c) => c.id === id1) && lPortail.data.some((c) => c.id === id2));
    check('?source=client les exclut', !lClient.data.some((c) => c.id === id1 || c.id === id2));
    check('source présent dans la réponse', lPortail.data.every((c) => ['client', 'portail'].includes(c.source)));

    // ── Traitement direct en LIVRÉE (sans dateLivraison → = dateExpedition)
    const t1 = await api('POST', `/api/acheteurs/commandes/${id1}/expedier`, {
      laboId, statut: 'livree', dateExpedition: today(),
    }, T);
    check('traiter → livrée directe 200', t1.status === 200, t1.data?.message);
    check('réponse statut=livree + dates alignées', t1.data?.commande?.statut === 'livree' && t1.data?.commande?.dateLivraison === today());
    const d1 = await api('GET', `/api/acheteurs/commandes/${id1}`, null, T);
    check('détail : statut livree, date_livraison = date_expedition',
      d1.data?.statut === 'livree' && d1.data?.dateLivraison === d1.data?.dateExpedition, `${d1.data?.dateExpedition} / ${d1.data?.dateLivraison}`);
    const jalons = (d1.data?.historique || []).map((h) => h.statut);
    check('historique trace expediee ET livree', jalons.includes('expediee') && jalons.includes('livree'), jalons.join(','));
    check('facture générée', !!d1.data?.facture?.numero, d1.data?.facture?.numero);

    // ── Garde : date de livraison antérieure à l'expédition → 400
    const bad = await api('POST', `/api/acheteurs/commandes/${id2}/expedier`, {
      laboId, statut: 'livree', dateExpedition: today(), dateLivraison: '2026-01-01',
    }, T);
    check('livraison < expédition → 400', bad.status === 400, bad.data?.message);

    // ── Rétrocompat : /expedier SANS statut → expédiée seulement
    const t2 = await api('POST', `/api/acheteurs/commandes/${id2}/expedier`, { laboId, dateExpedition: today() }, T);
    check('rétrocompat sans statut → expediee', t2.status === 200 && t2.data?.commande?.statut === 'expediee');
    const d2 = await api('GET', `/api/acheteurs/commandes/${id2}`, null, T);
    check('rétrocompat : pas de date_livraison', d2.data?.statut === 'expediee' && d2.data?.dateLivraison == null);

    // ── Dashboard v2 : filtre sources sur l'onglet Acheteurs
    const qs = `from=${today()}&to=${today()}`;
    const dAll = await api('GET', `/api/dashboard/v2?tab=acheteurs&${qs}`, null, T);
    const dPortail = await api('GET', `/api/dashboard/v2?tab=acheteurs&${qs}&sources=portail`, null, T);
    const dClient = await api('GET', `/api/dashboard/v2?tab=acheteurs&${qs}&sources=client`, null, T);
    const dBoth = await api('GET', `/api/dashboard/v2?tab=acheteurs&${qs}&sources=client,portail`, null, T);
    check('dashboard répond (200 ×4)', [dAll, dPortail, dClient, dBoth].every((d) => d.status === 200));
    const caOf = (d) => Number(d.data?.kpis?.ca ?? -1);
    check('sources=portail compte les 2 factures du jour', caOf(dPortail) > 0 && (dPortail.data.kpis.nb_factures >= 2));
    check('client + portail = total', Math.abs(caOf(dClient) + caOf(dPortail) - caOf(dAll)) < 0.001,
      `${caOf(dClient)} + ${caOf(dPortail)} vs ${caOf(dAll)}`);
    check('sources=client,portail ≡ sans filtre', Math.abs(caOf(dBoth) - caOf(dAll)) < 0.001);
  } catch (e) {
    check('exception', false, e.message);
  } finally {
    // ── Nettoyage SQL : stock réintégré mécaniquement (les CTE ne comptent que
    // les commandes existantes expediee/livree), factures et traces supprimées.
    if (cleanupIds.length) {
      await pool.query(`DELETE FROM factures_acheteur WHERE commande_id = ANY($1::uuid[])`, [cleanupIds]);
      await pool.query(`DELETE FROM commande_acheteur_statuts WHERE commande_id = ANY($1::uuid[])`, [cleanupIds]);
      await pool.query(`DELETE FROM commande_acheteur_lignes WHERE commande_id = ANY($1::uuid[])`, [cleanupIds]);
      await pool.query(`DELETE FROM commandes_acheteur WHERE id = ANY($1::uuid[])`, [cleanupIds]);
      console.log(`🧹 ${cleanupIds.length} commande(s) de test supprimée(s)`);
    }
    await pool.end();
    const ko = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - ko}/${results.length} checks verts${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
    process.exit(ko ? 1 : 0);
  }
})();
