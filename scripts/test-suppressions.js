/* Test E2E local — suppressions acheteur & client (migr 165).
   Backend démarré sur :3000. Règles testées :
   - Suppression ACHETEUR : commandes expédiées/livrées + factures CONSERVÉES
     (snapshot identité, stock inchangé), en_attente annulées, fiche + compte supprimés.
   - Suppression CLIENT : cascade complète module acheteurs + comptes portail purgés. */
require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const approx = (a, b, eps = 0.002) => Math.abs(Number(a) - Number(b)) <= eps;

(async () => {
  // ── Setup : login client 38 + super admin temporaire
  let r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'm.khelil.prof@gmail.com', password: 'TestDash2026!' }),
  });
  const { token, user } = await r.json();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const clientId = user.id;
  check('login client', !!token);

  const hash = bcrypt.hashSync('TestSuppr2026!', 10);
  await pool.query(`DELETE FROM utilisateurs WHERE email = 'test-admin-suppr@example.com'`);
  await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminS', 'test-admin-suppr@example.com', $1, 'super_admin', true)`,
    [hash]
  );
  r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-admin-suppr@example.com', password: 'TestSuppr2026!' }),
  });
  const adminToken = (await r.json()).token;
  const HA = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };
  check('login admin', !!adminToken);

  await pool.query(`UPDATE profil_entreprise SET module_acheteurs_actif = true WHERE client_id = $1`, [clientId]);
  await pool.query(`UPDATE abonnement_config SET nb_acheteurs = GREATEST(nb_acheteurs, 10) WHERE abonnement_id = (SELECT id FROM abonnements WHERE client_id = $1)`, [clientId]);
  const laboRes = await pool.query(`SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE pe.client_id = $1 LIMIT 1`, [clientId]);
  const laboId = laboRes.rows[0].id;

  const wipe = async () => {
    await pool.query(`DELETE FROM factures_acheteur WHERE client_id = $1 AND (acheteur_nom LIKE 'TEST-SUP%' OR acheteur_id IN (SELECT id FROM acheteurs WHERE nom LIKE 'TEST-SUP%'))`, [clientId]);
    await pool.query(`DELETE FROM commandes_acheteur WHERE client_id = $1 AND (acheteur_nom LIKE 'TEST-SUP%' OR acheteur_id IN (SELECT id FROM acheteurs WHERE nom LIKE 'TEST-SUP%'))`, [clientId]);
    await pool.query(`DELETE FROM utilisateurs WHERE role = 'acheteur' AND email = 'test-suppr-acheteur@example.com'`);
    await pool.query(`DELETE FROM utilisateurs WHERE email = 'test-suppr-gerant@example.com'`);
    await pool.query(`DELETE FROM acheteurs WHERE client_id = $1 AND nom LIKE 'TEST-SUP%'`, [clientId]);
    await pool.query(`DELETE FROM acheteur_offres WHERE client_id = $1 AND article_id IN (SELECT id FROM articles WHERE nom = 'TEST-SUP-Farine')`, [clientId]);
    await pool.query(`DELETE FROM stock_labo_daily WHERE ingredient_id IN (SELECT id FROM articles WHERE nom = 'TEST-SUP-Farine')`);
    await pool.query(`DELETE FROM labo_ingredient_selections WHERE ingredient_id IN (SELECT id FROM articles WHERE nom = 'TEST-SUP-Farine')`);
    await pool.query(`DELETE FROM articles WHERE nom = 'TEST-SUP-Farine' AND client_id = $1`, [clientId]);
    await pool.query(`DELETE FROM categories WHERE nom = 'TEST-SUP-Cat' AND client_id = $1`, [clientId]);
    await pool.query(`DELETE FROM familles WHERE nom = 'TEST-SUP-Fam' AND client_id = $1`, [clientId]);
  };
  await wipe();

  // Article commandable + stock labo + offre
  const fam = await pool.query(`INSERT INTO familles (nom, client_id) VALUES ('TEST-SUP-Fam', $1) RETURNING id`, [clientId]);
  const cat = await pool.query(`INSERT INTO categories (nom, client_id, famille_id) VALUES ('TEST-SUP-Cat', $1, $2) RETURNING id`, [clientId, fam.rows[0].id]);
  const uni = await pool.query(`SELECT id FROM unites ORDER BY id LIMIT 1`);
  const art = await pool.query(`INSERT INTO articles (nom, client_id, unite_id, categorie_id, commandable) VALUES ('TEST-SUP-Farine', $1, $2, $3, true) RETURNING id`, [clientId, uni.rows[0].id, cat.rows[0].id]);
  const artId = art.rows[0].id;
  await pool.query(`INSERT INTO labo_ingredient_selections (labo_id, ingredient_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [laboId, artId]);
  await pool.query(`INSERT INTO stock_labo_daily (labo_id, ingredient_id, date_appro, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, type_appro) VALUES ($1, $2, CURRENT_DATE, 20, 2, 19, 2.38, 'manuel')`, [laboId, artId]);
  await fetch(`${BASE}/api/acheteurs/offres`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ articleType: 'ingredient', articleId: artId, prixUnitaireHt: 5, tauxTva: 19, actif: true }),
  });

  // ── Acheteur AVEC compte portail
  r = await fetch(`${BASE}/api/acheteurs`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      nom: 'TEST-SUP-Resto', entreprise: 'TEST-SUP Sarl', email: 'test-suppr-acheteur@example.com',
      adresse: '12 rue des tests, Tunis', matriculeFiscal: 'MF-TEST-123', telephone: '20123456', creerCompte: true,
    }),
  });
  let body = await r.json();
  const acheteurId = body.acheteurs?.[0]?.id;
  check('acheteur avec compte créé', r.status === 201, JSON.stringify(body).slice(0, 120));
  const userIdRes = await pool.query(`SELECT user_id FROM acheteurs WHERE id = $1`, [acheteurId]);
  const acheteurUserId = userIdRes.rows[0].user_id;
  check('compte portail lié', !!acheteurUserId);
  // Activer le compte pour tester la suppression d'un compte activé
  const tok = await pool.query(`SELECT invite_token FROM utilisateurs WHERE id = $1`, [acheteurUserId]);
  await fetch(`${BASE}/auth/invite/accept`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: tok.rows[0].invite_token, password: 'TestPortail2026!' }),
  });
  r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-suppr-acheteur@example.com', password: 'TestPortail2026!' }),
  });
  const achToken = (await r.json()).token;
  const HP = { 'Content-Type': 'application/json', Authorization: `Bearer ${achToken}` };
  check('login acheteur portail', !!achToken);

  // ── Transactions : 1 vente manuelle LIVRÉE (stock -4) + 1 commande portail EN ATTENTE (created_by = compte acheteur)
  r = await fetch(`${BASE}/api/acheteurs/ventes`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      acheteurId, laboId, statut: 'livree',
      lignes: [{ articleType: 'ingredient', articleId: artId, quantite: 4 }],
    }),
  });
  body = await r.json();
  const cmdLivreeId = body.commande?.id;
  const factureId = body.facture?.id;
  const factureNumero = body.facture?.numero;
  check('vente manuelle livrée créée (facture)', r.status === 201 && !!factureId, JSON.stringify(body.facture || body).slice(0, 120));

  r = await fetch(`${BASE}/api/portail/commandes`, {
    method: 'POST', headers: HP,
    body: JSON.stringify({ lignes: [{ articleType: 'ingredient', articleId: artId, quantite: 3 }] }),
  });
  body = await r.json();
  const cmdAttenteId = body.id;
  check('commande portail en_attente créée', r.status === 201 && body.statut === 'en_attente');

  // Snapshot posé dès la création
  const snapC = await pool.query(`SELECT acheteur_nom, acheteur_entreprise FROM commandes_acheteur WHERE id = $1`, [cmdLivreeId]);
  check('snapshot identité posé à la création (commande)', snapC.rows[0]?.acheteur_nom === 'TEST-SUP-Resto' && snapC.rows[0]?.acheteur_entreprise === 'TEST-SUP Sarl', JSON.stringify(snapC.rows[0]));
  const snapF = await pool.query(`SELECT acheteur_nom, acheteur_matricule_fiscal FROM factures_acheteur WHERE id = $1`, [factureId]);
  check('snapshot fiscal posé à la création (facture)', snapF.rows[0]?.acheteur_nom === 'TEST-SUP-Resto' && snapF.rows[0]?.acheteur_matricule_fiscal === 'MF-TEST-123', JSON.stringify(snapF.rows[0]));

  const { computeStockCourant } = require('../src/utils/stockUtils');
  const stockAvant = await computeStockCourant('labo', laboId, artId);
  check('stock après vente = 16 (20 - 4)', approx(stockAvant, 16), String(stockAvant));

  // La fiche est renommée APRÈS la vente : le snapshot doit être rafraîchi à la suppression
  r = await fetch(`${BASE}/api/acheteurs/${acheteurId}`, {
    method: 'PUT', headers: H, body: JSON.stringify({ nom: 'TEST-SUP-Resto Renommé' }),
  });
  check('fiche renommée avant suppression', r.status === 200);

  // ── SUPPRESSION DE L'ACHETEUR
  r = await fetch(`${BASE}/api/acheteurs/${acheteurId}`, { method: 'DELETE', headers: H });
  body = await r.json();
  check('suppression acheteur 200 (plus de 409)', r.status === 200, JSON.stringify(body));
  check('réponse : 1 commande en attente annulée', body.commandesAnnulees === 1, String(body.commandesAnnulees));

  const ficheApres = await pool.query(`SELECT id FROM acheteurs WHERE id = $1`, [acheteurId]);
  check('fiche acheteur supprimée', ficheApres.rows.length === 0);
  const compteApres = await pool.query(`SELECT id FROM utilisateurs WHERE id = $1`, [acheteurUserId]);
  check('compte portail supprimé', compteApres.rows.length === 0);

  // Commande livrée + facture CONSERVÉES, détachées, snapshot rafraîchi au nom RENOMMÉ
  const cmdApres = await pool.query(`SELECT acheteur_id, statut, acheteur_nom FROM commandes_acheteur WHERE id = $1`, [cmdLivreeId]);
  check('commande livrée conservée (acheteur_id NULL, statut intact)', cmdApres.rows[0]?.acheteur_id === null && cmdApres.rows[0]?.statut === 'livree', JSON.stringify(cmdApres.rows[0]));
  check('snapshot rafraîchi au dernier nom de la fiche', cmdApres.rows[0]?.acheteur_nom === 'TEST-SUP-Resto Renommé', cmdApres.rows[0]?.acheteur_nom);
  const factApres = await pool.query(`SELECT acheteur_id, numero, acheteur_nom, acheteur_matricule_fiscal FROM factures_acheteur WHERE id = $1`, [factureId]);
  check('facture conservée (acheteur_id NULL, snapshot fiscal)', factApres.rows[0]?.acheteur_id === null && factApres.rows[0]?.numero === factureNumero && factApres.rows[0]?.acheteur_matricule_fiscal === 'MF-TEST-123', JSON.stringify(factApres.rows[0]));

  // Commande en attente ANNULÉE + historique tracé
  const attApres = await pool.query(`SELECT statut, motif_annulation FROM commandes_acheteur WHERE id = $1`, [cmdAttenteId]);
  check('commande en attente annulée avec motif', attApres.rows[0]?.statut === 'annulee' && /supprimé/.test(attApres.rows[0]?.motif_annulation || ''), JSON.stringify(attApres.rows[0]));
  const histo = await pool.query(`SELECT statut, motif FROM commande_acheteur_statuts WHERE commande_id = $1 ORDER BY created_at DESC LIMIT 1`, [cmdAttenteId]);
  check('transition annulee tracée dans l\'historique', histo.rows[0]?.statut === 'annulee' && /supprimé/.test(histo.rows[0]?.motif || ''), JSON.stringify(histo.rows[0]));

  // Stock INCHANGÉ (la vente livrée reste dans le flux ; l'annulation de l'en_attente n'ajoute rien)
  const stockApres = await computeStockCourant('labo', laboId, artId);
  check('stock inchangé après suppression (16)', approx(stockApres, 16), String(stockApres));

  // Lectures post-suppression
  r = await fetch(`${BASE}/api/acheteurs/commandes`, { headers: H });
  body = await r.json();
  const cmdListe = body.find((c) => c.id === cmdLivreeId);
  check('liste commandes : « Nom (supprimé) » affiché', cmdListe?.acheteurNom === 'TEST-SUP-Resto Renommé (supprimé)', cmdListe?.acheteurNom);
  r = await fetch(`${BASE}/api/acheteurs/commandes/${cmdLivreeId}`, { headers: H });
  body = await r.json();
  check('détail commande accessible après suppression', r.status === 200 && body.statut === 'livree' && /supprimé\)$/.test(body.acheteurNom || ''), body.acheteurNom);
  r = await fetch(`${BASE}/api/acheteurs/factures/${factureId}/pdf`, { headers: H });
  check('PDF facture régénérable après suppression', r.status === 200 && (r.headers.get('content-type') || '').includes('pdf'));
  r = await fetch(`${BASE}/api/labo/${laboId}/historique`, { headers: H });
  const histoTxt = JSON.stringify(await r.json());
  check('historique appro labo : vente visible avec nom snapshot', r.status === 200 && histoTxt.includes('TEST-SUP-Resto'), String(r.status));

  // Le compte supprimé ne peut plus se connecter
  r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-suppr-acheteur@example.com', password: 'TestPortail2026!' }),
  });
  check('login acheteur supprimé refusé', r.status !== 200, String(r.status));

  // Annulation d'une commande expédiée d'un acheteur supprimé → stock réintégré
  r = await fetch(`${BASE}/api/acheteurs/commandes/${cmdLivreeId}/annuler`, {
    method: 'POST', headers: H, body: JSON.stringify({ motif: 'test annulation orpheline' }),
  });
  check('annulation d\'une commande orpheline possible', r.status === 200, JSON.stringify(await r.json()).slice(0, 100));
  const stockReintegre = await computeStockCourant('labo', laboId, artId);
  check('stock réintégré après annulation (20)', approx(stockReintegre, 20), String(stockReintegre));

  // 404 sur ré-suppression / autre client
  r = await fetch(`${BASE}/api/acheteurs/${acheteurId}`, { method: 'DELETE', headers: H });
  check('re-suppression → 404', r.status === 404);

  // Revue : expédier une commande orpheline (annulée) → 409 explicite, pas 404
  r = await fetch(`${BASE}/api/acheteurs/commandes/${cmdAttenteId}/expedier`, {
    method: 'POST', headers: H, body: JSON.stringify({ laboId }),
  });
  body = await r.json();
  check('expédier une commande orpheline → 409 (pas 404)', r.status === 409 && /plus en attente/.test(body.message || ''), `${r.status} — ${body.message}`);

  // Revue : filtre « acheteurs supprimés » sur l'historique des commandes
  r = await fetch(`${BASE}/api/acheteurs/commandes?acheteurId=supprimes`, { headers: H });
  body = await r.json();
  check('filtre acheteurId=supprimes : commandes orphelines uniquement',
    r.status === 200 && body.length >= 2 && body.every((c) => c.acheteurId === null), `${body.length} orphelines`);

  // Revue (migr 166) : supprimer un utilisateur référencé par traite_par/created_by
  // (cas gérant) ne bloque plus — les FK d'audit sont en SET NULL
  const uTmp = await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, gerant_parent_id)
     VALUES ('TEST-SUP-Gerant', 'test-suppr-gerant@example.com', NULL, 'gerant', true, $1) RETURNING id`,
    [clientId]
  );
  await pool.query(`UPDATE commandes_acheteur SET traite_par = $1, created_by = $1 WHERE id = $2`, [uTmp.rows[0].id, cmdLivreeId]);
  let gerantDeleteOk = true;
  try { await pool.query(`DELETE FROM utilisateurs WHERE id = $1`, [uTmp.rows[0].id]); } catch { gerantDeleteOk = false; }
  const traiteApres = await pool.query(`SELECT traite_par, created_by FROM commandes_acheteur WHERE id = $1`, [cmdLivreeId]);
  check('migr 166 : suppression d\'un gérant référencé par traite_par/created_by passe (SET NULL)',
    gerantDeleteOk && traiteApres.rows[0]?.traite_par === null && traiteApres.rows[0]?.created_by === null, JSON.stringify(traiteApres.rows[0]));

  // ── SUPPRESSION D'UN CLIENT avec module acheteurs UTILISÉ (le bug 500 d'avant)
  await pool.query(`DELETE FROM utilisateurs WHERE email IN ('test-suppr-client@example.com', 'test-suppr-ach2@example.com')`);
  r = await fetch(`${BASE}/admin/clients`, {
    method: 'POST', headers: HA,
    body: JSON.stringify({
      nom: 'TEST-SUP-Client Sarl', email: 'test-suppr-client@example.com',
      nbActivites: 1, nbLabos: 1, nbGerants: 0, nbAcheteurs: 10, montantOnboarding: 500,
    }),
  });
  body = await r.json();
  const tmpClientId = body.id;
  check('client temporaire créé', r.status === 201, JSON.stringify(body).slice(0, 100));

  // Données acheteurs du client : fiche + compte + offre AVEC historique de prix (created_by = client, le FK bloquant) + commande + facture
  const ach2 = await pool.query(
    `INSERT INTO acheteurs (client_id, nom, email, created_by) VALUES ($1, 'TEST-SUP-Ach2', 'test-suppr-ach2@example.com', $1) RETURNING id`,
    [tmpClientId]
  );
  const ach2Id = ach2.rows[0].id;
  const u2 = await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-SUP-Ach2', 'test-suppr-ach2@example.com', NULL, 'acheteur', true) RETURNING id`,
  );
  const ach2UserId = u2.rows[0].id;
  await pool.query(`UPDATE acheteurs SET user_id = $1 WHERE id = $2`, [ach2UserId, ach2Id]);
  const off2 = await pool.query(
    `INSERT INTO acheteur_offres (client_id, article_type, article_id, prix_unitaire_ht, taux_tva, actif) VALUES ($1, 'ingredient', $2, 3, 19, true) RETURNING id`,
    [tmpClientId, artId]
  );
  await pool.query(
    `INSERT INTO acheteur_offre_prix_historique (offre_id, prix_unitaire_ht, taux_tva, created_by) VALUES ($1, 3, 19, $2)`,
    [off2.rows[0].id, tmpClientId]
  );
  const cmd2 = await pool.query(
    `INSERT INTO commandes_acheteur (client_id, acheteur_id, acheteur_nom, statut, source, date_commande, date_expedition, created_by, traite_par)
     VALUES ($1, $2, 'TEST-SUP-Ach2', 'expediee', 'portail', CURRENT_DATE, CURRENT_DATE, $3, $1) RETURNING id`,
    [tmpClientId, ach2Id, ach2UserId]
  );
  await pool.query(
    `INSERT INTO commande_acheteur_lignes (commande_id, article_type, article_id, designation, quantite, quantite_unites, prix_ht, prix_ttc, taux_tva)
     VALUES ($1, 'ingredient', $2, 'TEST-SUP-Farine', 1, 1, 3, 3.57, 19)`,
    [cmd2.rows[0].id, artId]
  );
  await pool.query(
    `INSERT INTO factures_acheteur (client_id, acheteur_id, acheteur_nom, commande_id, numero, montant_ttc) VALUES ($1, $2, 'TEST-SUP-Ach2', $3, 'FA-TEST-0001', 3.57)`,
    [tmpClientId, ach2Id, cmd2.rows[0].id]
  );

  r = await fetch(`${BASE}/admin/clients/${tmpClientId}`, { method: 'DELETE', headers: HA });
  check('suppression client avec module acheteurs utilisé → 204 (plus de 500 FK)', r.status === 204, String(r.status));

  const restants = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM acheteurs WHERE client_id = $1) AS fiches,
       (SELECT COUNT(*)::int FROM commandes_acheteur WHERE client_id = $1) AS commandes,
       (SELECT COUNT(*)::int FROM factures_acheteur WHERE client_id = $1) AS factures,
       (SELECT COUNT(*)::int FROM acheteur_offres WHERE client_id = $1) AS offres,
       (SELECT COUNT(*)::int FROM utilisateurs WHERE id = $2) AS comptes`,
    [tmpClientId, ach2UserId]
  );
  const rr = restants.rows[0];
  check('cascade complète : 0 fiche / 0 commande / 0 facture / 0 offre', rr.fiches === 0 && rr.commandes === 0 && rr.factures === 0 && rr.offres === 0, JSON.stringify(rr));
  check('compte portail acheteur purgé (email libéré)', rr.comptes === 0);

  // ── Nettoyage
  await wipe();
  await pool.query(`DELETE FROM utilisateurs WHERE email = 'test-admin-suppr@example.com'`);

  const ok = results.filter((x) => x.ok).length;
  console.log(`\n${ok}/${results.length} tests OK`);
  process.exit(ok === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
