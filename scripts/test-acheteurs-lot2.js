/* Test E2E local du lot 2 du module Acheteurs (backend démarré sur :3000).
 * Crée ses propres données de test (famille achetable, article, stock labo, acheteur)
 * puis nettoie tout à la fin. */
require('dotenv').config();
const pool = require('../src/config/database');

const BASE = 'http://localhost:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const approx = (a, b, eps = 0.002) => Math.abs(Number(a) - Number(b)) <= eps;

(async () => {
  // ── Login + setup
  let r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'm.khelil.prof@gmail.com', password: 'TestDash2026!' }),
  });
  const { token, user } = await r.json();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const clientId = user.id;
  check('login client', !!token);

  await pool.query(`UPDATE profil_entreprise SET module_acheteurs_actif = true, module_acheteurs_activated_at = NOW() WHERE client_id = $1`, [clientId]);
  await pool.query(`UPDATE abonnement_config SET nb_acheteurs = 10 WHERE abonnement_id = (SELECT id FROM abonnements WHERE client_id = $1)`, [clientId]);

  const laboRes = await pool.query(
    `SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE pe.client_id = $1 LIMIT 1`, [clientId]);
  const laboId = laboRes.rows[0]?.id;
  check('labo présent', !!laboId, `labo ${laboId}`);

  // Nettoyage préalable puis données de test : famille achetable → catégorie → article → labo + stock 10
  const wipe = async () => {
    await pool.query(`DELETE FROM factures_acheteur WHERE client_id = $1 AND acheteur_id IN (SELECT id FROM acheteurs WHERE nom LIKE 'TEST-L2%')`, [clientId]);
    await pool.query(`DELETE FROM commandes_acheteur WHERE client_id = $1 AND acheteur_id IN (SELECT id FROM acheteurs WHERE nom LIKE 'TEST-L2%')`, [clientId]);
    await pool.query(`DELETE FROM acheteurs WHERE client_id = $1 AND nom LIKE 'TEST-L2%'`, [clientId]);
    await pool.query(`DELETE FROM acheteur_offres WHERE client_id = $1 AND article_id IN (SELECT id FROM articles WHERE nom = 'TEST-L2-Huile') AND article_type = 'ingredient'`, [clientId]);
    await pool.query(`DELETE FROM stock_labo_daily WHERE ingredient_id IN (SELECT id FROM articles WHERE nom = 'TEST-L2-Huile')`);
    await pool.query(`DELETE FROM labo_ingredient_selections WHERE ingredient_id IN (SELECT id FROM articles WHERE nom = 'TEST-L2-Huile')`);
    await pool.query(`DELETE FROM articles WHERE nom = 'TEST-L2-Huile' AND client_id = $1`, [clientId]);
    await pool.query(`DELETE FROM categories WHERE nom = 'TEST-L2-Cat' AND client_id = $1`, [clientId]);
    await pool.query(`DELETE FROM familles WHERE nom = 'TEST-L2-Fam' AND client_id = $1`, [clientId]);
  };
  await wipe();

  const fam = await pool.query(`INSERT INTO familles (nom, client_id, consommable, vendable, achetable) VALUES ('TEST-L2-Fam', $1, true, true, true) RETURNING id`, [clientId]);
  const cat = await pool.query(`INSERT INTO categories (nom, client_id, famille_id) VALUES ('TEST-L2-Cat', $1, $2) RETURNING id`, [clientId, fam.rows[0].id]);
  const uni = await pool.query(`SELECT id FROM unites WHERE client_id = $1 OR client_id IS NULL ORDER BY id LIMIT 1`, [clientId]);
  const art = await pool.query(
    `INSERT INTO articles (nom, client_id, unite_id, categorie_id) VALUES ('TEST-L2-Huile', $1, $2, $3) RETURNING id`,
    [clientId, uni.rows[0].id, cat.rows[0].id]);
  const artId = art.rows[0].id;
  await pool.query(`INSERT INTO labo_ingredient_selections (labo_id, ingredient_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [laboId, artId]);
  await pool.query(
    `INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, type_appro)
     VALUES ($1, $2, CURRENT_DATE, 10, 2.000, 19, 2.380, 'manuel')`,
    [laboId, artId]);

  r = await fetch(`${BASE}/api/acheteurs`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ nom: 'TEST-L2-Grossiste', remisePct: 10 }),
  });
  const achBody = await r.json();
  const acheteurId = achBody.acheteurs?.[0]?.id;
  check('acheteur créé', r.status === 201 && !!acheteurId);

  // ── 1. Offres : éligibilité + validations + upsert
  r = await fetch(`${BASE}/api/acheteurs/offres`, { headers: H });
  let body = await r.json();
  const eligible = body.articles?.find((a) => a.articleId === artId);
  check('article éligible listé (famille achetable)', !!eligible, eligible?.nom);

  r = await fetch(`${BASE}/api/acheteurs/offres`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ articleType: 'ingredient', articleId: artId, prixUnitaireTtc: 0, actif: true }),
  });
  check('activation sans prix refusée 400', r.status === 400);

  r = await fetch(`${BASE}/api/acheteurs/offres`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ articleType: 'ingredient', articleId: artId, prixUnitaireTtc: 5, tauxTva: 19, tailleLot: 6, prixLotTtc: 27, actif: true }),
  });
  body = await r.json();
  check('offre créée (5 DT/u, lot 6 à 27 DT, TVA 19)', r.status === 200 && body.actif === true, JSON.stringify(body));
  const offreId = body.offreId;

  r = await fetch(`${BASE}/api/acheteurs/offres`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ articleType: 'ingredient', articleId: artId, prixUnitaireTtc: 5, tailleLot: 6, actif: true }),
  });
  check('lot sans prix lot refusé 400', r.status === 400);

  // ── 2. Vente : 2 unités + 1 lot de 6 = 8 unités (stock 10)
  r = await fetch(`${BASE}/api/acheteurs/ventes`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      acheteurId, laboId, timbreFiscal: true,
      lignes: [
        { articleType: 'ingredient', articleId: artId, mode: 'unite', quantite: 2 },
        { articleType: 'ingredient', articleId: artId, mode: 'lot', quantite: 1 },
      ],
    }),
  });
  body = await r.json();
  const facture = body.facture;
  check('vente validée 201', r.status === 201, JSON.stringify(facture));
  // brut = 2×5 + 1×27 = 37 ; remise acheteur 10% → net 33.3 ; HT = 33.3/1.19 ; TTC = net + 1 timbre
  check('numéro FA-YYYY-0001', /^FA-\d{4}-0001$/.test(facture?.numero || ''), facture?.numero);
  check('brut 37.000', approx(facture?.brutTtc, 37));
  check('HT 27.983 (remise 10% puis détaxe 19%)', approx(facture?.montantHt, 33.3 / 1.19, 0.005), String(facture?.montantHt));
  check('TTC 34.300 (net 33.3 + timbre 1)', approx(facture?.montantTtc, 34.3), String(facture?.montantTtc));

  // ── 3. Stock déduit : 10 − 8 = 2 (calcul + affichage)
  const { computeStockCourant } = require('../src/utils/stockUtils');
  const stockApres = await computeStockCourant('labo', laboId, artId);
  check('computeStockCourant = 2', stockApres === 2, String(stockApres));

  r = await fetch(`${BASE}/api/labo/${laboId}/stock`, { headers: H });
  body = await r.json();
  const rowStock = (body.stock || body || []).find?.((x) => x.ingredientId === artId)
    || (body.ingredients || []).find?.((x) => x.ingredientId === artId);
  check('getLaboStock affiche 2', rowStock ? Number(rowStock.quantite) === 2 : false, JSON.stringify({ q: rowStock?.quantite }));

  // ── 4. Historique : ligne type 'vente'
  // Une ligne d'historique PAR LIGNE de commande (2 unités puis 1 lot de 6) — total −8
  r = await fetch(`${BASE}/api/labo/${laboId}/stock/${artId}/history`, { headers: H });
  body = await r.json();
  const ventesHist = (body || []).filter((h) => h.typeAppro === 'vente');
  const totalVendu = ventesHist.reduce((s, h) => s + Number(h.quantite), 0);
  check('history article : lignes vente totalisant −8', ventesHist.length === 2 && totalVendu === -8,
    JSON.stringify(ventesHist.map((v) => v.quantite)));

  r = await fetch(`${BASE}/api/labo/${laboId}/historique?typeFilter=vente`, { headers: H });
  body = await r.json();
  const totalHisto = body.reduce((s, h) => s + Number(h.quantite), 0);
  check('historique labo filtre vente (2 lignes, −8)', Array.isArray(body) && body.length === 2 && totalHisto === -8
    && body.every((h) => h.typeAppro === 'vente' && h.fournisseurNom === 'TEST-L2-Grossiste'), `${body.length} ligne(s), total ${totalHisto}`);

  // ── 5. Dépassement de stock → 422 avec manquants
  r = await fetch(`${BASE}/api/acheteurs/ventes`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ acheteurId, laboId, lignes: [{ articleType: 'ingredient', articleId: artId, mode: 'unite', quantite: 5 }] }),
  });
  body = await r.json();
  check('vente > stock refusée 422', r.status === 422 && body.manquants?.length === 1, JSON.stringify(body.manquants));

  // ── 6. Liste + détail + PDF
  r = await fetch(`${BASE}/api/acheteurs/commandes`, { headers: H });
  body = await r.json();
  const cmd = body.find((c) => c.acheteurNom === 'TEST-L2-Grossiste' && c.statut === 'validee');
  check('commande listée avec facture', !!cmd && cmd.factureNumero === facture.numero, cmd?.factureNumero);

  r = await fetch(`${BASE}/api/acheteurs/commandes/${cmd.id}`, { headers: H });
  body = await r.json();
  check('détail : 2 lignes + coût figé', body.lignes?.length === 2 && body.lignes.every((l) => l.coutUnitaireTtc !== null),
    JSON.stringify(body.lignes?.map((l) => ({ m: l.mode, q: l.quantite, u: l.quantiteUnites, c: l.coutUnitaireTtc }))));
  check('coût unitaire = PMP TTC 2.380', approx(body.lignes?.[0]?.coutUnitaireTtc, 2.38));

  r = await fetch(`${BASE}/api/acheteurs/factures/${facture.id}/pdf`, { headers: { Authorization: H.Authorization } });
  const pdfBuf = Buffer.from(await r.arrayBuffer());
  check('facture PDF (200, %PDF, >2Ko)', r.status === 200 && pdfBuf.slice(0, 4).toString() === '%PDF' && pdfBuf.length > 2000, `${pdfBuf.length} octets`);

  // ── 7. Historique de prix d'offre
  r = await fetch(`${BASE}/api/acheteurs/offres/${offreId}/historique`, { headers: H });
  body = await r.json();
  check('historique prix : 1 entrée', Array.isArray(body) && body.length === 1 && approx(body[0].prixUnitaireTtc, 5));

  // ── 8. Annulation → stock réintégré + facture supprimée
  r = await fetch(`${BASE}/api/acheteurs/commandes/${cmd.id}/annuler`, {
    method: 'POST', headers: H, body: JSON.stringify({ motif: 'test annulation' }),
  });
  check('annulation 200', r.status === 200);
  const stockReintegre = await computeStockCourant('labo', laboId, artId);
  check('stock réintégré = 10', stockReintegre === 10, String(stockReintegre));
  const factGone = await pool.query(`SELECT 1 FROM factures_acheteur WHERE id = $1`, [facture.id]);
  check('facture supprimée', factGone.rows.length === 0);

  r = await fetch(`${BASE}/api/acheteurs/commandes/${cmd.id}/annuler`, { method: 'POST', headers: H, body: JSON.stringify({}) });
  check('double annulation 409', r.status === 409);

  // ── 9. Nouvelle vente après annulation → numérotation repart proprement
  r = await fetch(`${BASE}/api/acheteurs/ventes`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ acheteurId, laboId, remisePct: 0, timbreFiscal: false, lignes: [{ articleType: 'ingredient', articleId: artId, mode: 'unite', quantite: 1, prixTtc: 6 }] }),
  });
  body = await r.json();
  check('re-vente : prix modifié ligne (6) + sans timbre', r.status === 201 && approx(body.facture?.montantTtc, 6), JSON.stringify(body.facture));

  // ── Nettoyage
  await wipe();
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK${failed.length ? ' — ÉCHECS : ' + failed.map((f) => f.name).join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
