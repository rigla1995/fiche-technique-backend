/* Test E2E local du lot 4 (portail acheteur). Backend démarré sur :3000. */
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
  // ── Login client + setup données (mêmes que lot 2 + compte acheteur activé)
  let r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'm.khelil.prof@gmail.com', password: 'TestDash2026!' }),
  });
  const { token, user } = await r.json();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const clientId = user.id;
  check('login client', !!token);

  await pool.query(`UPDATE profil_entreprise SET module_acheteurs_actif = true WHERE client_id = $1`, [clientId]);
  await pool.query(`UPDATE abonnement_config SET nb_acheteurs = 10 WHERE abonnement_id = (SELECT id FROM abonnements WHERE client_id = $1)`, [clientId]);
  const laboRes = await pool.query(`SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE pe.client_id = $1 LIMIT 1`, [clientId]);
  const laboId = laboRes.rows[0].id;

  const wipe = async () => {
    await pool.query(`DELETE FROM notifications WHERE event_type = 'nouvelle_commande_acheteur' AND user_id = $1`, [clientId]);
    await pool.query(`DELETE FROM factures_acheteur WHERE client_id = $1 AND acheteur_id IN (SELECT id FROM acheteurs WHERE nom LIKE 'TEST-L4%')`, [clientId]);
    await pool.query(`DELETE FROM commandes_acheteur WHERE client_id = $1 AND acheteur_id IN (SELECT id FROM acheteurs WHERE nom LIKE 'TEST-L4%')`, [clientId]);
    await pool.query(`DELETE FROM utilisateurs WHERE role = 'acheteur' AND email = 'test-l4-acheteur@example.com'`);
    await pool.query(`DELETE FROM acheteurs WHERE client_id = $1 AND nom LIKE 'TEST-L4%'`, [clientId]);
    await pool.query(`DELETE FROM acheteur_offres WHERE client_id = $1 AND article_id IN (SELECT id FROM articles WHERE nom = 'TEST-L4-Sucre')`, [clientId]);
    await pool.query(`DELETE FROM stock_labo_daily WHERE ingredient_id IN (SELECT id FROM articles WHERE nom = 'TEST-L4-Sucre')`);
    await pool.query(`DELETE FROM labo_ingredient_selections WHERE ingredient_id IN (SELECT id FROM articles WHERE nom = 'TEST-L4-Sucre')`);
    await pool.query(`DELETE FROM articles WHERE nom = 'TEST-L4-Sucre' AND client_id = $1`, [clientId]);
    await pool.query(`DELETE FROM categories WHERE nom = 'TEST-L4-Cat' AND client_id = $1`, [clientId]);
    await pool.query(`DELETE FROM familles WHERE nom = 'TEST-L4-Fam' AND client_id = $1`, [clientId]);
  };
  await wipe();

  const fam = await pool.query(`INSERT INTO familles (nom, client_id) VALUES ('TEST-L4-Fam', $1) RETURNING id`, [clientId]);
  const cat = await pool.query(`INSERT INTO categories (nom, client_id, famille_id) VALUES ('TEST-L4-Cat', $1, $2) RETURNING id`, [clientId, fam.rows[0].id]);
  const uni = await pool.query(`SELECT id FROM unites ORDER BY id LIMIT 1`);
  const art = await pool.query(`INSERT INTO articles (nom, client_id, unite_id, categorie_id, commandable) VALUES ('TEST-L4-Sucre', $1, $2, $3, true) RETURNING id`, [clientId, uni.rows[0].id, cat.rows[0].id]);
  const artId = art.rows[0].id;
  await pool.query(`INSERT INTO labo_ingredient_selections (labo_id, ingredient_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [laboId, artId]);
  await pool.query(`INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, type_appro) VALUES ($1, $2, CURRENT_DATE, 10, 2, 19, 2.38, 'manuel')`, [laboId, artId]);

  // Acheteur AVEC compte
  r = await fetch(`${BASE}/api/acheteurs`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ nom: 'TEST-L4-Resto', email: 'test-l4-acheteur@example.com', creerCompte: true }),
  });
  const achBody = await r.json();
  const acheteurId = achBody.acheteurs?.[0]?.id;
  check('acheteur avec compte créé', r.status === 201 && achBody.invitations === 1);
  const tok = await pool.query(`SELECT u.invite_token FROM acheteurs a JOIN utilisateurs u ON u.id = a.user_id WHERE a.id = $1`, [acheteurId]);
  await fetch(`${BASE}/auth/invite/accept`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: tok.rows[0].invite_token, password: 'TestPortail2026!' }),
  });
  r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-l4-acheteur@example.com', password: 'TestPortail2026!' }),
  });
  const achToken = (await r.json()).token;
  const HP = { 'Content-Type': 'application/json', Authorization: `Bearer ${achToken}` };
  check('login acheteur portail', !!achToken);

  // Offre active (5 DT HT/u, TVA 19 → TTC 5.95)
  await fetch(`${BASE}/api/acheteurs/offres`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ articleType: 'ingredient', articleId: artId, prixUnitaireHt: 5, tauxTva: 19, actif: true }),
  });

  // ── 1. Catalogue portail
  r = await fetch(`${BASE}/api/portail/catalogue`, { headers: HP });
  let body = await r.json();
  const item = body.offres?.find((o) => o.articleId === artId);
  check('catalogue : offre visible + dispo', r.status === 200 && !!item && item.disponible === true, JSON.stringify(item));
  check('catalogue : prix TTC dérivé 5.950', approx(item?.prixUnitaireTtc, 5.95), String(item?.prixUnitaireTtc));
  check('catalogue : pas de remise exposée', !('remisePct' in body));
  check('catalogue : AUCUNE quantité de stock exposée', item && !('stock' in item) && !('quantite' in item) && !('stockTotal' in item));
  // le client n'a pas accès au portail
  r = await fetch(`${BASE}/api/portail/catalogue`, { headers: H });
  check('client bloqué sur portail 403', r.status === 403);

  // ── 2. Commande portail (2 + 6 = 8 unités)
  r = await fetch(`${BASE}/api/portail/commandes`, {
    method: 'POST', headers: HP,
    body: JSON.stringify({ notes: 'livrer mardi', lignes: [
      { articleType: 'ingredient', articleId: artId, quantite: 2 },
      { articleType: 'ingredient', articleId: artId, quantite: 6 },
    ] }),
  });
  body = await r.json();
  const cmdId = body.id;
  check('commande portail créée en_attente', r.status === 201 && body.statut === 'en_attente', JSON.stringify(body));
  // stock PAS déduit tant que non validée
  const { computeStockCourant } = require('../src/utils/stockUtils');
  check('stock intact avant validation (10)', await computeStockCourant('labo', laboId, artId) === 10);
  // notification persistée pour le client
  const notif = await pool.query(`SELECT * FROM notifications WHERE user_id = $1 AND event_type = 'nouvelle_commande_acheteur'`, [clientId]);
  check('notification client persistée', notif.rows.length === 1, notif.rows[0]?.notes_admin);

  // ── 3. Côté client : la commande apparaît en attente (source portail)
  r = await fetch(`${BASE}/api/acheteurs/commandes?statut=en_attente`, { headers: H });
  body = await r.json();
  const cmd = body.find((c) => c.id === cmdId);
  check('commande listée côté client (portail, en attente)', !!cmd && cmd.source === 'portail' && cmd.acheteurNom === 'TEST-L4-Resto');

  // ── 4. Validation sans labo → 400 ; avec labo → facture + stock déduit
  r = await fetch(`${BASE}/api/acheteurs/commandes/${cmdId}/valider`, { method: 'POST', headers: H, body: JSON.stringify({}) });
  check('valider sans labo 400', r.status === 400);
  r = await fetch(`${BASE}/api/acheteurs/commandes/${cmdId}/valider`, {
    method: 'POST', headers: H, body: JSON.stringify({ laboId, timbreFiscal: true, remisePct: 10 }),
  });
  body = await r.json();
  check('validation → facture', r.status === 200 && /^FA-\d{4}-\d{4}$/.test(body.facture?.numero || ''), JSON.stringify(body.facture));
  // 8 u × 5 HT = 40 HT ; remise 10% saisie à la validation → HT 36 ; TVA 19% = 6.84 ; TTC 36 + 6.84 + 1 = 43.84
  check('totaux : brut HT 40, remise 10% → TTC 43.840',
    approx(body.facture?.brutHt, 40) && approx(body.facture?.montantHt, 36) && approx(body.facture?.montantTtc, 43.84),
    JSON.stringify(body.facture));
  const remiseFigee = await pool.query(`SELECT remise_pct FROM commandes_acheteur WHERE id = $1`, [cmdId]);
  check('remise figée sur la commande (10)', Number(remiseFigee.rows[0]?.remise_pct) === 10, String(remiseFigee.rows[0]?.remise_pct));
  check('stock déduit après validation (2)', await computeStockCourant('labo', laboId, artId) === 2);
  const lignesCout = await pool.query(`SELECT cout_unitaire_ttc FROM commande_acheteur_lignes WHERE commande_id = $1`, [cmdId]);
  check('coûts figés à la validation', lignesCout.rows.every((l) => l.cout_unitaire_ttc !== null && approx(l.cout_unitaire_ttc, 2.38)));

  // ── 5. Côté acheteur : commande validée + facture téléchargeable
  r = await fetch(`${BASE}/api/portail/commandes`, { headers: HP });
  body = await r.json();
  const maCmd = body.find((c) => c.id === cmdId);
  check('acheteur voit validée + numéro facture', maCmd?.statut === 'validee' && !!maCmd?.factureNumero, maCmd?.factureNumero);
  r = await fetch(`${BASE}/api/portail/factures/${maCmd.factureId}/pdf`, { headers: { Authorization: HP.Authorization } });
  const pdf = Buffer.from(await r.arrayBuffer());
  check('facture PDF portail', r.status === 200 && pdf.slice(0, 4).toString() === '%PDF', `${pdf.length} octets`);

  // ── 6. 2e commande : validation en stock insuffisant → 422 ; refus → annulée + motif visible acheteur
  r = await fetch(`${BASE}/api/portail/commandes`, {
    method: 'POST', headers: HP,
    body: JSON.stringify({ lignes: [{ articleType: 'ingredient', articleId: artId, quantite: 5 }] }),
  });
  const cmd2 = (await r.json()).id;
  r = await fetch(`${BASE}/api/acheteurs/commandes/${cmd2}/valider`, { method: 'POST', headers: H, body: JSON.stringify({ laboId }) });
  body = await r.json();
  check('validation stock insuffisant 422', r.status === 422 && body.manquants?.length === 1, JSON.stringify(body.manquants));
  r = await fetch(`${BASE}/api/acheteurs/commandes/${cmd2}/annuler`, { method: 'POST', headers: H, body: JSON.stringify({ motif: 'rupture de stock' }) });
  check('refus commande en attente 200', r.status === 200);
  r = await fetch(`${BASE}/api/portail/commandes/${cmd2}`, { headers: HP });
  body = await r.json();
  check('acheteur voit annulée + motif', body.statut === 'annulee' && body.motifAnnulation === 'rupture de stock');

  // ── 7. Badge rupture quand stock ≤ seuil (stock 2, seuil 9)
  await pool.query(`UPDATE labo_ingredient_selections SET seuil_min = 9 WHERE labo_id = $1 AND ingredient_id = $2`, [laboId, artId]);
  r = await fetch(`${BASE}/api/portail/catalogue`, { headers: HP });
  body = await r.json();
  const item2 = body.offres?.find((o) => o.articleId === artId);
  check('badge rupture (stock 2 ≤ seuil 9)', item2?.disponible === false);

  // ── 8. Suppression protégée : un acheteur avec commandes/factures → 409 explicite
  r = await fetch(`${BASE}/api/acheteurs/${acheteurId}`, { method: 'DELETE', headers: H });
  body = await r.json();
  check('suppression acheteur avec commandes → 409 clair', r.status === 409 && body.code === 'ACHETEUR_A_COMMANDES',
    `${r.status} — ${body.message}`);
  const encore = await pool.query(`SELECT 1 FROM acheteurs WHERE id = $1`, [acheteurId]);
  check('fiche acheteur intacte après le 409', encore.rows.length === 1);

  // ── Nettoyage
  await wipe();
  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK${failed.length ? ' — ÉCHECS : ' + failed.map((f) => f.name).join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
