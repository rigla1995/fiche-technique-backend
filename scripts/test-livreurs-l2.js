/* Test E2E local — module « Livreurs », étape L2 « affectation à l'expédition » (labflow-reprise/livreurs/PLAN-LIVREURS.md).
 *   POST /commandes/:id/expedier { livreurId } : LIVREUR_INVALIDE (400), LIVREUR_INTROUVABLE (404), LIVREUR_INACTIF (409)
 *     sans toucher la commande ; livreur valide → commande expédiée confiée (livreurId, livreurNom, qui / quand) ;
 *   GET /commandes : colonne livreur + filtre ?livreurId=<id>|sans ; GET /commandes/:id : livraisonAffecteeAt / ParNom ;
 *   portail : enLivraison + livreurNom (liste et détail) ;
 *   espace livreur : GET /api/livreur/commandes (expédiées d'abord, puis livrées) et /:id (lignes), 404 hors périmètre ;
 *   POST /commandes/:id/livreur : réaffectation, retrait ({ livreurId: null }), 409 STATUT_INCOMPATIBLE hors « expédiée »,
 *     403 gérant hors labo ; vente manuelle expédiée avec livreur (et livrée d'emblée : livreur ignoré) ;
 *   DELETE /api/livreurs/:id : 409 LIVREUR_AFFECTE s'il a des livraisons, 204 sinon ; manuel « acheteurs-ventes » ;
 *   migrations 251 et 252 rejouables.
 * Crée un super_admin, un client (2 labos, option Acheteurs, 1 gérant), 2 livreurs, 1 acheteur avec compte portail,
 * puis nettoie. Données fictives. ⚠️ Backend de test : « node scripts/start-test-backend.js ». */
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
const login = async (identifiant, mdp = MDP) => appel('POST', '/auth/login', null, { email: identifiant, password: mdp });
const aujourdhui = new Date().toISOString().slice(0, 10);
const rejouer = async (nom) => {
  try { await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', nom), 'utf8')); return true; } catch (e) { console.error(e.message); return false; }
};

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-l2@example.com';
  const CLIENT = 'test-l2-client@example.com';
  const GERANT = 'test-l2-gerant@example.com';
  const ACHETEUR = 'test-l2-acheteur@example.com';
  const TELS = ['22345678', '98765432'];
  let adminTok = null;
  let clientId = null;
  const wipe = async () => {
    if (adminTok && clientId) await appel('DELETE', `/admin/clients/${clientId}`, adminTok);
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT, GERANT, ACHETEUR, ...TELS.map((t) => `livreur-${t}@livreurs.labflow.local`)]])).rows.map((r) => r.id);
    const livIds = (await pool.query('SELECT user_id FROM livreurs WHERE telephone_norm = ANY($1)', [TELS])).rows.map((r) => r.user_id);
    const tous = [...new Set([...ids, ...livIds])];
    if (tous.length) {
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM profil_entreprise WHERE client_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [tous]);
    }
  };
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };

  try {
    // ── 0. Repartir propre ──
    const restes = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT, GERANT, ACHETEUR]])).rows;
    if (restes.length) {
      await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin L2', $1, $2, 'super_admin', true, 0, NOW()) ON CONFLICT DO NOTHING`, [ADMIN, hash]);
      adminTok = (await login(ADMIN)).body?.token;
      const c = (await pool.query(`SELECT id FROM utilisateurs WHERE LOWER(email) = $1 AND role = 'client'`, [CLIENT])).rows[0];
      if (c) await appel('DELETE', `/admin/clients/${c.id}`, adminTok);
      await wipe();
      adminTok = null;
    } else {
      await wipe();
    }
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin L2', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);

    // ── Migrations 251 et 252 rejouables ──
    check('migration 251 rejouable', await rejouer('251_livreurs_affectation.sql'));
    check('migration 252 (manuel) rejouable', await rejouer('252_manuel_livreurs_affectation.sql'));

    // ── Client : 2 labos, option Acheteurs, 1 gérant ; article en stock au labo A, offre active ──
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST L2 Traiteur', email: CLIENT, telephone: '20 555 901', nbActivites: 1, nbLabos: 2, nbGerants: 1, nbAcheteurs: 20, montantOnboarding: 0 });
    check('client créé (2 labos, option Acheteurs, 1 gérant)', r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);
    const cli = await activer(CLIENT);
    clientId = cli.id;
    const tok = cli.tok;
    r = await appel('GET', '/api/unites', tok);
    let kg = (r.body || []).find((u) => (u.name || u.nom) === 'kg');
    if (!kg) kg = (await appel('POST', '/api/unites', tok, { name: 'kg' })).body;
    const fam = (await appel('POST', '/api/familles', tok, { name: 'Famille L2', consommable: true, vendable: true })).body;
    const cat = (await appel('POST', '/api/categories', tok, { name: 'Catégorie L2', familleId: fam?.id })).body;
    const art = (await appel('POST', '/api/articles', tok, { name: 'Semoule L2', unitId: kg?.id, categorieId: cat?.id })).body;
    await appel('PUT', `/api/articles/${art?.id}`, tok, { name: 'Semoule L2', unitId: kg?.id, categorieId: cat?.id, commandable: true });
    const laboA = (await appel('POST', '/api/labo', tok, { nom: 'Dépôt A', refLabo: 'DLA', adresse: '1 rue du Dépôt, Tunis' })).body;
    const laboB = (await appel('POST', '/api/labo', tok, { nom: 'Dépôt B', refLabo: 'DLB' })).body;
    await appel('POST', `/api/labo/${laboA?.id}/ingredients/${art?.id}/select`, tok, {});
    r = await appel('PUT', `/api/labo/${laboA?.id}/stock/${art?.id}`, tok, { quantite: 500, prixUnitaire: 1.8, tauxTva: 7, dateAppro: aujourdhui });
    const offre = await appel('POST', '/api/acheteurs/offres', tok, { articleType: 'ingredient', articleId: art?.id, prixUnitaireHt: 2.4, tauxTva: 7, actif: true });
    check('préparation : 2 labos, article en stock au labo A, offre active', [200, 201].includes(r.status) && offre.status === 200 && !!laboA?.id && !!laboB?.id, `${r.status} ${offre.status}`);

    // ── Livreurs : A (actif) et B (désactivé) ──
    r = await appel('POST', '/api/livreurs', tok, { nom: 'Livreur A', telephone: TELS[0] });
    const livA = r.body;
    const mdpA = livA?.motDePasseInitial;
    const rB = await appel('POST', '/api/livreurs', tok, { nom: 'Livreur B', telephone: TELS[1] });
    const livB = rB.body;
    const mdpB = livB?.motDePasseInitial;
    const rBoff = await appel('PUT', `/api/livreurs/${livB?.id}`, tok, { actif: false });
    check('préparation : livreur A actif, livreur B désactivé', r.status === 201 && rB.status === 201 && rBoff.status === 200 && rBoff.body?.actif === false, `${r.status} ${rB.status} ${rBoff.status}`);

    // ── Acheteur particulier avec compte portail → commande en ligne ──
    r = await appel('POST', '/api/acheteurs', tok, { acheteurs: [{ type: 'b2c', nom: 'Leïla Fictive', telephone: '20 555 902', adresse: '12 avenue des Tests, La Marsa', email: ACHETEUR, creerCompte: true }] });
    const achFiche = r.body?.acheteurs?.[0];
    const ach = await activer(ACHETEUR);
    r = await appel('POST', '/api/portail/commandes', ach.tok, { lignes: [{ articleType: 'ingredient', articleId: art.id, quantite: 3 }], notes: 'Sonner deux fois' });
    const cmd1 = r.body?.commande?.id || r.body?.id;
    check('acheteur créé avec compte portail ; commande en ligne → 201 (en attente)', !!achFiche?.id && r.status === 201 && !!cmd1, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);

    // ── 1. Expédier avec un livreur invalide / inconnu / désactivé : refus, commande intacte ──
    const exp = (corps) => appel('POST', `/api/acheteurs/commandes/${cmd1}/expedier`, tok, { laboId: laboA.id, dateExpedition: aujourdhui, ...corps });
    r = await exp({ livreurId: 'abc' });
    const r1b = await exp({ livreurId: 999999999 });
    const r1c = await exp({ livreurId: livB.id });
    const etat = (await appel('GET', `/api/acheteurs/commandes/${cmd1}`, tok)).body;
    check('expédier : livreur invalide → 400 LIVREUR_INVALIDE ; inconnu → 404 LIVREUR_INTROUVABLE ; désactivé → 409 LIVREUR_INACTIF (nom cité) ; commande toujours en attente, sans facture',
      r.status === 400 && r.body?.code === 'LIVREUR_INVALIDE' && r1b.status === 404 && r1b.body?.code === 'LIVREUR_INTROUVABLE' && r1c.status === 409 && r1c.body?.code === 'LIVREUR_INACTIF' && /Livreur B/.test(r1c.body?.message || '')
      && etat?.statut === 'en_attente' && !etat?.factureId && etat?.livreurId === null,
      `${r.status} ${r1b.status} ${r1c.status} ${r1c.body?.message} / ${etat?.statut} ${etat?.livreurId}`);

    // ── 2. Expédier avec le livreur A ──
    r = await exp({ livreurId: livA.id });
    const detail = (await appel('GET', `/api/acheteurs/commandes/${cmd1}`, tok)).body;
    check('expédier avec le livreur A → 200 : commande expédiée, facture générée, livreurId / livreurNom dans la réponse',
      r.status === 200 && r.body?.commande?.statut === 'expediee' && r.body?.commande?.livreurId === livA.id && r.body?.commande?.livreurNom === 'Livreur A' && !!r.body?.facture?.numero,
      `${r.status} ${JSON.stringify(r.body?.commande)}`);
    check('détail de la commande : livreurId, livreurNom, livraisonAffecteeAt renseignée, affectée par le client',
      detail?.livreurId === livA.id && detail?.livreurNom === 'Livreur A' && !!detail?.livraisonAffecteeAt && detail?.livraisonAffecteeParNom === 'TEST L2 Traiteur',
      JSON.stringify({ livreurId: detail?.livreurId, livreurNom: detail?.livreurNom, le: detail?.livraisonAffecteeAt, par: detail?.livraisonAffecteeParNom }));

    // ── 3. Vente manuelle expédiée avec livreur ; vente livrée d'emblée : livreur ignoré ──
    const vendre = (corps) => appel('POST', '/api/acheteurs/ventes', tok, { acheteurId: achFiche.id, laboId: laboA.id, dateCommande: aujourdhui, dateExpedition: aujourdhui, lignes: [{ articleType: 'ingredient', articleId: art.id, quantite: 2 }], ...corps });
    r = await vendre({ livreurId: livB.id });
    const r3b = await vendre({ livreurId: livA.id });
    const cmd2 = r3b.body?.commande?.id;
    const r3c = await vendre({ statut: 'livree', livreurId: livA.id });
    const cmd3 = r3c.body?.commande?.id;
    const r3d = await vendre({});
    const cmd4 = r3d.body?.commande?.id;
    check('vente manuelle : livreur désactivé → 409 ; expédiée avec le livreur A → 201 confiée ; livrée d\'emblée → livreur ignoré ; sans livreur → 201',
      r.status === 409 && r.body?.code === 'LIVREUR_INACTIF' && r3b.status === 201 && r3b.body?.commande?.livreurId === livA.id && r3b.body?.commande?.livreurNom === 'Livreur A'
      && r3c.status === 201 && r3c.body?.commande?.statut === 'livree' && r3c.body?.commande?.livreurId === null && r3d.status === 201 && r3d.body?.commande?.livreurId === null,
      `${r.status} ${r3b.status} ${r3c.status} ${r3d.status}`);

    // ── 4. Liste : colonne et filtre livreur ──
    r = await appel('GET', '/api/acheteurs/commandes', tok);
    const parId = Object.fromEntries((r.body?.commandes || r.body || []).map((c) => [c.id, c]));
    const rA = await appel('GET', `/api/acheteurs/commandes?livreurId=${livA.id}`, tok);
    const rSans = await appel('GET', '/api/acheteurs/commandes?livreurId=sans', tok);
    const rFaux = await appel('GET', '/api/acheteurs/commandes?livreurId=abc', tok);
    const ids = (x) => (x.body?.commandes || x.body || []).map((c) => c.id).sort();
    check('liste : livreurNom sur les commandes confiées, null sinon ; ?livreurId=A → les 2 commandes de A ; ?livreurId=sans → les 2 autres ; filtre invalide ignoré (4)',
      r.status === 200 && parId[cmd1]?.livreurNom === 'Livreur A' && parId[cmd2]?.livreurId === livA.id && parId[cmd3]?.livreurId === null && parId[cmd4]?.livreurNom === null
      && JSON.stringify(ids(rA)) === JSON.stringify([cmd1, cmd2].sort()) && JSON.stringify(ids(rSans)) === JSON.stringify([cmd3, cmd4].sort()) && ids(rFaux).length === 4,
      `${r.status} ${JSON.stringify([parId[cmd1]?.livreurNom, parId[cmd2]?.livreurId, parId[cmd3]?.livreurId, parId[cmd4]?.livreurNom])} A=${ids(rA).length} sans=${ids(rSans).length} faux=${ids(rFaux).length}`);

    // ── 5. Portail : « en cours de livraison » ──
    r = await appel('GET', '/api/portail/commandes', ach.tok);
    const p1 = (r.body || []).find((c) => c.id === cmd1);
    const p3 = (r.body || []).find((c) => c.id === cmd3);
    const p4 = (r.body || []).find((c) => c.id === cmd4);
    const r5b = await appel('GET', `/api/portail/commandes/${cmd1}`, ach.tok);
    check('portail : commande confiée → enLivraison true + livreurNom ; livrée ou sans livreur → enLivraison false ; détail idem',
      r.status === 200 && p1?.enLivraison === true && p1?.livreurNom === 'Livreur A' && p3?.enLivraison === false && p4?.enLivraison === false && p4?.livreurNom === null
      && r5b.status === 200 && r5b.body?.enLivraison === true && r5b.body?.livreurNom === 'Livreur A',
      `${r.status} ${JSON.stringify([p1?.enLivraison, p1?.livreurNom, p3?.enLivraison, p4?.enLivraison])} ${r5b.status}`);

    // ── 6. Espace livreur : mes livraisons ──
    r = await login(TELS[0], mdpA);
    const tokA = r.body?.token;
    r = await appel('GET', '/api/livreur/commandes', tokA);
    const mes = r.body || [];
    const m1 = mes.find((c) => c.id === cmd1);
    check('GET /api/livreur/commandes : les 2 commandes confiées à A (expédiées), client, téléphone, adresse, départ, nb de lignes, facture, montant TTC, note',
      r.status === 200 && mes.length === 2 && mes.every((c) => c.statut === 'expediee') && m1?.acheteurNom === 'Leïla Fictive' && m1?.acheteurTelephone === '20 555 902' && /La Marsa/.test(m1?.acheteurAdresse || '')
      && m1?.depart === 'Dépôt A' && /Tunis/.test(m1?.departAdresse || '') && m1?.nbLignes === 1 && /^FA-/.test(m1?.factureNumero || '') && m1?.montantTtc > 0 && m1?.notes === 'Sonner deux fois' && !!m1?.affecteeLe,
      `${r.status} ${JSON.stringify(m1)}`);
    r = await appel('GET', `/api/livreur/commandes/${cmd1}`, tokA);
    const r6b = await appel('GET', `/api/livreur/commandes/${cmd4}`, tokA);
    const r6c = await appel('GET', '/api/livreur/commandes/pas-un-uuid', tokA);
    const r6d = await appel('GET', '/api/acheteurs/commandes', tokA);
    check('détail livreur : lignes (désignation, quantité 3) ; commande non confiée → 404 ; id invalide → 404 ; /api/acheteurs → 403',
      r.status === 200 && r.body?.lignes?.length === 1 && r.body.lignes[0].designation === 'Semoule L2' && r.body.lignes[0].quantite === 3 && r.body?.lignes?.[0]?.prixTtc === undefined
      && r6b.status === 404 && r6c.status === 404 && r6d.status === 403,
      `${r.status} ${JSON.stringify(r.body?.lignes)} ${r6b.status} ${r6c.status} ${r6d.status}`);

    // ── 7. Réaffectation / retrait ──
    const aff = (id, livreurId, jeton = tok) => appel('POST', `/api/acheteurs/commandes/${id}/livreur`, jeton, { livreurId });
    r = await aff(cmd1, livB.id);
    const r7b = await appel('PUT', `/api/livreurs/${livB.id}`, tok, { actif: true });
    const r7c = await aff(cmd1, livB.id);
    const r7d = await appel('GET', '/api/livreur/commandes', tokA);
    const tokB = (await login(TELS[1], mdpB)).body?.token;
    const r7e = await appel('GET', '/api/livreur/commandes', tokB);
    check('réaffectation : vers B désactivé → 409 ; B réactivé → 200 livreurNom B ; A ne voit plus cmd1 (1 reste) ; B la voit',
      r.status === 409 && r.body?.code === 'LIVREUR_INACTIF' && r7b.status === 200 && r7c.status === 200 && r7c.body?.commande?.livreurId === livB.id && r7c.body?.commande?.livreurNom === 'Livreur B'
      && r7d.status === 200 && r7d.body?.length === 1 && r7d.body[0]?.id === cmd2 && r7e.status === 200 && r7e.body?.length === 1 && r7e.body[0]?.id === cmd1,
      `${r.status} ${r7b.status} ${r7c.status} ${r7d.body?.length} ${r7e.body?.length}`);
    r = await aff(cmd1, null);
    const d7 = (await appel('GET', `/api/acheteurs/commandes/${cmd1}`, tok)).body;
    const p7 = (await appel('GET', `/api/portail/commandes/${cmd1}`, ach.tok)).body;
    const r7f = await appel('GET', '/api/livreur/commandes', tokB);
    check('retrait ({ livreurId: null }) → 200 ; détail sans livreur ni trace ; portail enLivraison false ; B ne la voit plus',
      r.status === 200 && r.body?.commande?.livreurId === null && d7?.livreurId === null && d7?.livraisonAffecteeAt === null && d7?.livraisonAffecteeParNom === null && p7?.enLivraison === false && p7?.livreurNom === null && r7f.body?.length === 0,
      `${r.status} ${JSON.stringify([d7?.livreurId, d7?.livraisonAffecteeAt, p7?.enLivraison, r7f.body?.length])}`);
    r = await aff(cmd1, livA.id);
    const r7g = await aff(cmd3, livA.id);
    const r7h = await aff('00000000-0000-0000-0000-000000000000', livA.id);
    const r7i = await aff(cmd1, 'abc');
    check('réaffectation à A → 200 ; commande livrée → 409 STATUT_INCOMPATIBLE ; commande inconnue → 404 ; livreur invalide → 400',
      r.status === 200 && r.body?.commande?.livreurNom === 'Livreur A' && r7g.status === 409 && r7g.body?.code === 'STATUT_INCOMPATIBLE' && r7h.status === 404 && r7i.status === 400,
      `${r.status} ${r7g.status} ${r7h.status} ${r7i.status}`);

    // ── 8. Gérant limité au labo B : commande du labo A hors périmètre ──
    r = await appel('POST', '/api/abonnements/gerants', tok, { nom: 'Gérant B', telephone: '20 555 903', email: GERANT, laboIds: [laboB.id], accesAcheteurs: true });
    const ger = await activer(GERANT);
    const r8b = await aff(cmd1, livA.id, ger.tok);
    check('gérant du labo B : affectation d\'une commande du labo A → 403', r.status === 201 && r8b.status === 403, `${r.status} ${r8b.status} ${JSON.stringify(r8b.body)}`);

    // ── 9. Livraison : la commande livrée reste dans la mémoire du livreur, après les expédiées ──
    r = await appel('POST', `/api/acheteurs/commandes/${cmd2}/livrer`, tok, { dateLivraison: aujourdhui });
    const r9b = await appel('GET', '/api/livreur/commandes', tokA);
    const r9c = await aff(cmd2, null);
    check('livrer cmd2 → 200 ; liste du livreur A : cmd1 (expédiée) puis cmd2 (livrée) ; retirer le livreur d\'une commande livrée → 409',
      r.status === 200 && r9b.body?.length === 2 && r9b.body[0]?.id === cmd1 && r9b.body[0]?.statut === 'expediee' && r9b.body[1]?.id === cmd2 && r9b.body[1]?.statut === 'livree' && r9b.body[1]?.dateLivraison === aujourdhui && r9c.status === 409,
      `${r.status} ${JSON.stringify(r9b.body?.map((c) => [c.id === cmd1 ? 'cmd1' : c.id === cmd2 ? 'cmd2' : c.id, c.statut]))} ${r9c.status}`);

    // ── 10. Suppression d'un livreur : refusée s'il a des livraisons ──
    r = await appel('DELETE', `/api/livreurs/${livA.id}`, tok);
    const r10b = await appel('DELETE', `/api/livreurs/${livB.id}`, tok);
    check('DELETE livreur A (2 livraisons) → 409 LIVREUR_AFFECTE ; livreur B (aucune) → 204', r.status === 409 && r.body?.code === 'LIVREUR_AFFECTE' && /2 livraisons/.test(r.body?.message || '') && r10b.status === 204, `${r.status} ${r.body?.message} / ${r10b.status}`);

    // ── 11. Annulation d'une commande confiée : le livreur ne la voit plus ──
    r = await appel('POST', `/api/acheteurs/commandes/${cmd1}/annuler`, tok, { motif: 'Erreur de saisie (test)' });
    const r11b = await appel('GET', '/api/livreur/commandes', tokA);
    check('annuler cmd1 → 200 ; elle sort de la liste du livreur (reste cmd2 livrée)', r.status === 200 && r11b.body?.length === 1 && r11b.body[0]?.id === cmd2, `${r.status} ${r11b.body?.length}`);

    // ── 12. Manuel : fiche « acheteurs-ventes » mise à jour (migration 252) ──
    r = await appel('GET', '/api/manuel', tok);
    const fiche = (Array.isArray(r.body) ? r.body : r.body?.sections || r.body?.fiches || []).find((f) => f.slug === 'acheteurs-ventes');
    const texte = JSON.stringify(fiche || r.body || '');
    check('manuel : fiche « acheteurs-ventes » parle du livreur à l\'expédition et de l\'action 🏍️ Livreur', r.status === 200 && /en cours de livraison/.test(texte) && /Livreur/.test(texte), `${r.status} ${fiche ? 'fiche trouvée' : 'fiche absente de la réponse'}`);
  } catch (e) {
    console.error('💥', e);
    results.push({ name: 'exception', ok: false });
  } finally {
    await wipe().catch((e) => console.error('nettoyage :', e.message));
    await pool.end().catch(() => {});
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} contrôles passés`);
  process.exit(ok === results.length ? 0 : 1);
})();
