/* Test E2E local — module « Livreurs », étape L3 « livrer avec son téléphone » (labflow-reprise/livreurs/PLAN-LIVREURS.md).
 *   POST /api/livreur/commandes/:id/livree : facture signée obligatoire (FACTURE_REQUISE, TYPE_REFUSE), 404 hors périmètre,
 *     validation avec photo → livrée, pièce relue par le vendeur et par l'acheteur ; encaissement (option du compte :
 *     MONTANT_REQUIS, MODE_PAIEMENT_REQUIS, montant 0 sans mode, montant + mode) ;
 *   POST /api/livreur/commandes/:id/echec : MOTIF_REQUIS, NOTE_REQUISE, RAPPORTEE_REQUISE ; échec rapporté → stock revenu,
 *     statut livraison_echouee, portail, 409 ensuite ; échec non rapporté → stock toujours sorti ;
 *   POST /api/acheteurs/commandes/:id/relancer : 409 hors échec, LIVREUR_INACTIF, relance (stock ressorti, historique) ;
 *   annulation après échec : message selon le stock ; notifications livraison_validee / livraison_echouee ;
 *   PUT /api/livreurs/options ; manuel (fiche « livreurs-livraison », fiche « livreurs ») ; migrations 253 (+254) rejouables.
 * Crée un super_admin, un client (1 labo, option Acheteurs), 2 livreurs, 1 acheteur avec compte portail, puis nettoie.
 * Données fictives. ⚠️ Backend de test : « node scripts/start-test-backend.js » (stockage local). */
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
/** Envoi multipart (FormData natif de Node) : champs texte + fichiers { nom, octets, type, fichier }. */
const envoyer = async (chemin, jeton, champs = {}, fichiers = []) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) if (v != null) fd.append(k, String(v));
  for (const f of fichiers) fd.append(f.nom, new Blob([f.octets], { type: f.type }), f.fichier);
  const r = await fetch(`${BASE}${chemin}`, { method: 'POST', headers: jeton ? { Authorization: `Bearer ${jeton}` } : {}, body: fd });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const brut = async (chemin, jeton) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  return { status: r.status, type: r.headers.get('content-type'), disposition: r.headers.get('content-disposition'), octets: Buffer.from(await r.arrayBuffer()) };
};
const login = async (identifiant, mdp = MDP) => appel('POST', '/auth/login', null, { email: identifiant, password: mdp });
const aujourdhui = new Date().toISOString().slice(0, 10);
const rejouer = async (nom) => {
  const fichier = path.join(__dirname, '..', 'migrations', nom);
  if (!fs.existsSync(fichier)) return null;
  try { await pool.query(fs.readFileSync(fichier, 'utf8')); return true; } catch (e) { console.error(e.message); return false; }
};
// Une « photo » JPEG minimale (en-tête SOI + APP0 + bourrage) : le serveur ne regarde que les premiers octets.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), Buffer.alloc(600, 0x11), Buffer.from([0xff, 0xd9])]);
const TEXTE = Buffer.from('ceci n\'est pas une facture, juste du texte de test\n'.repeat(4));

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-l3@example.com';
  const CLIENT = 'test-l3-client@example.com';
  const ACHETEUR = 'test-l3-acheteur@example.com';
  const TELS = ['22345678', '98765432'];
  let adminTok = null;
  let clientId = null;
  const wipe = async () => {
    if (adminTok && clientId) await appel('DELETE', `/admin/clients/${clientId}`, adminTok);
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT, ACHETEUR, ...TELS.map((t) => `livreur-${t}@livreurs.labflow.local`)]])).rows.map((r) => r.id);
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
    const restes = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT, ACHETEUR]])).rows;
    if (restes.length) {
      await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin L3', $1, $2, 'super_admin', true, 0, NOW()) ON CONFLICT DO NOTHING`, [ADMIN, hash]);
      adminTok = (await login(ADMIN)).body?.token;
      const c = (await pool.query(`SELECT id FROM utilisateurs WHERE LOWER(email) = $1 AND role = 'client'`, [CLIENT])).rows[0];
      if (c) await appel('DELETE', `/admin/clients/${c.id}`, adminTok);
      await wipe();
      adminTok = null;
    } else {
      await wipe();
    }
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin L3', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);

    // ── Migrations rejouables ──
    check('migration 253 rejouable', (await rejouer('253_livreurs_livraison.sql')) === true);
    const r254 = await rejouer('254_manuel_livreurs_livraison.sql');
    check('migration 254 (manuel) rejouable', r254 !== false, r254 === null ? 'absente (pas encore générée)' : '');

    // ── Client, article en stock (500), offre, 2 livreurs, acheteur avec compte portail ──
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST L3 Traiteur', email: CLIENT, telephone: '20 555 911', nbActivites: 1, nbLabos: 1, nbGerants: 0, nbAcheteurs: 20, montantOnboarding: 0 });
    check('client créé (1 labo, option Acheteurs)', r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);
    const cli = await activer(CLIENT);
    clientId = cli.id;
    const tok = cli.tok;
    r = await appel('GET', '/api/unites', tok);
    let kg = (r.body || []).find((u) => (u.name || u.nom) === 'kg');
    if (!kg) kg = (await appel('POST', '/api/unites', tok, { name: 'kg' })).body;
    const fam = (await appel('POST', '/api/familles', tok, { name: 'Famille L3', consommable: true, vendable: true })).body;
    const cat = (await appel('POST', '/api/categories', tok, { name: 'Catégorie L3', familleId: fam?.id })).body;
    const art = (await appel('POST', '/api/articles', tok, { name: 'Semoule L3', unitId: kg?.id, categorieId: cat?.id })).body;
    await appel('PUT', `/api/articles/${art?.id}`, tok, { name: 'Semoule L3', unitId: kg?.id, categorieId: cat?.id, commandable: true });
    const labo = (await appel('POST', '/api/labo', tok, { nom: 'Dépôt L3', refLabo: 'DL3', adresse: '1 rue du Dépôt, Tunis' })).body;
    await appel('POST', `/api/labo/${labo?.id}/ingredients/${art?.id}/select`, tok, {});
    r = await appel('PUT', `/api/labo/${labo?.id}/stock/${art?.id}`, tok, { quantite: 500, prixUnitaire: 1.8, tauxTva: 7, dateAppro: aujourdhui });
    const offre = await appel('POST', '/api/acheteurs/offres', tok, { articleType: 'ingredient', articleId: art?.id, prixUnitaireHt: 2.4, tauxTva: 7, actif: true });
    check('préparation : labo, article en stock (500), offre active', [200, 201].includes(r.status) && offre.status === 200 && !!labo?.id, `${r.status} ${offre.status}`);
    const stock = async () => {
      const s = await appel('GET', `/api/labo/${labo.id}/stock`, tok);
      const rows = Array.isArray(s.body) ? s.body : (s.body?.stock || s.body?.ingredients || s.body?.items || []);
      const row = rows.find((x) => Number(x.ingredientId ?? x.ingredient_id ?? x.articleId ?? x.id) === Number(art.id));
      const q = row ? (row.quantite ?? row.stock ?? row.quantity ?? row.qty ?? row.stockActuel) : null;
      return q == null ? null : Math.round(Number(q) * 1000) / 1000;
    };
    r = await appel('POST', '/api/livreurs', tok, { nom: 'Livreur A', telephone: TELS[0] });
    const livA = r.body;
    const mdpA = livA?.motDePasseInitial;
    const rB = await appel('POST', '/api/livreurs', tok, { nom: 'Livreur B', telephone: TELS[1] });
    const livB = rB.body;
    const mdpB = livB?.motDePasseInitial;
    r = await appel('POST', '/api/acheteurs', tok, { acheteurs: [{ type: 'b2c', nom: 'Leïla Fictive', telephone: '20 555 912', adresse: '12 avenue des Tests, La Marsa', email: ACHETEUR, creerCompte: true }] });
    const achFiche = r.body?.acheteurs?.[0];
    const ach = await activer(ACHETEUR);
    check('préparation : 2 livreurs, acheteur avec compte portail, stock lu', r.status === 201 && !!livA?.id && !!livB?.id && (await stock()) === 500, `${r.status} stock=${await stock()}`);
    const tokA = (await login(TELS[0], mdpA)).body?.token;
    const tokB = (await login(TELS[1], mdpB)).body?.token;
    const vendre = (livreurId, quantite = 2) => appel('POST', '/api/acheteurs/ventes', tok, { acheteurId: achFiche.id, laboId: labo.id, dateCommande: aujourdhui, dateExpedition: aujourdhui, lignes: [{ articleType: 'ingredient', articleId: art.id, quantite }], livreurId });
    const detail = async (id) => (await appel('GET', `/api/acheteurs/commandes/${id}`, tok)).body;

    // ── 1. Commande du portail expédiée avec le livreur A ──
    r = await appel('POST', '/api/portail/commandes', ach.tok, { lignes: [{ articleType: 'ingredient', articleId: art.id, quantite: 3 }], notes: 'Sonner deux fois' });
    const cmd1 = r.body?.id;
    r = await appel('POST', `/api/acheteurs/commandes/${cmd1}/expedier`, tok, { laboId: labo.id, dateExpedition: aujourdhui, livreurId: livA.id });
    check('commande du portail expédiée avec le livreur A ; stock 497', r.status === 200 && r.body?.commande?.livreurId === livA.id && (await stock()) === 497, `${r.status} stock=${await stock()}`);
    r = await appel('GET', '/api/livreur/moi', tokA);
    check('GET /api/livreur/moi : encaissement false, motifs d\'échec fournis', r.status === 200 && r.body?.encaissement === false && Array.isArray(r.body?.modesPaiement) && r.body.modesPaiement.length === 0 && r.body?.motifsEchec?.absent === 'Client absent', `${r.status} ${JSON.stringify(r.body)}`);

    // ── 2. Livrée : facture signée obligatoire ──
    r = await envoyer(`/api/livreur/commandes/${cmd1}/livree`, tokA, { receptionnaire: 'Mme Fictive' });
    const r2b = await envoyer(`/api/livreur/commandes/${cmd1}/livree`, tokA, {}, [{ nom: 'facture', octets: TEXTE, type: 'text/plain', fichier: 'facture.txt' }]);
    const r2c = await envoyer(`/api/livreur/commandes/${cmd1}/livree`, tokB, {}, [{ nom: 'facture', octets: JPEG, type: 'image/jpeg', fichier: 'facture.jpg' }]);
    const r2d = await envoyer(`/api/livreur/commandes/${cmd1}/livree`, tokA, {}, [{ nom: 'facture', octets: JPEG, type: 'image/jpeg', fichier: 'facture.jpg' }, { nom: 'apercu', octets: JPEG, type: 'image/jpeg', fichier: 'a.jpg' }]);
    check('livrée : sans fichier → 400 FACTURE_REQUISE ; fichier texte → 400 TYPE_REFUSE ; autre livreur → 404 ; copie JPEG sans photo HEIC → 400 ; commande toujours expédiée',
      r.status === 400 && r.body?.code === 'FACTURE_REQUISE' && r2b.status === 400 && r2b.body?.code === 'TYPE_REFUSE' && r2c.status === 404 && r2d.status === 400 && r2d.body?.code === 'APERCU_SANS_ORIGINAL'
      && (await detail(cmd1))?.statut === 'expediee', `${r.status} ${r.body?.code} / ${r2b.status} ${r2b.body?.code} / ${r2c.status} / ${r2d.status} ${r2d.body?.code}`);

    // ── 3. Non livrée : contrôles puis échec rapporté au dépôt ──
    r = await appel('POST', `/api/livreur/commandes/${cmd1}/echec`, tokA, { note: 'Personne au local', rapporteeDepot: true });
    const r3b = await appel('POST', `/api/livreur/commandes/${cmd1}/echec`, tokA, { motif: 'absent', note: 'ok', rapporteeDepot: true });
    const r3c = await appel('POST', `/api/livreur/commandes/${cmd1}/echec`, tokA, { motif: 'absent', note: 'Personne au local' });
    const r3d = await appel('POST', `/api/livreur/commandes/${cmd1}/echec`, tokB, { motif: 'absent', note: 'Personne au local', rapporteeDepot: true });
    check('échec : sans motif → 400 MOTIF_REQUIS ; note trop courte → 400 NOTE_REQUISE ; sans « rapportée » → 400 RAPPORTEE_REQUISE ; autre livreur → 404',
      r.status === 400 && r.body?.code === 'MOTIF_REQUIS' && r3b.status === 400 && r3b.body?.code === 'NOTE_REQUISE' && r3c.status === 400 && r3c.body?.code === 'RAPPORTEE_REQUISE' && r3d.status === 404,
      `${r.status} ${r3b.status} ${r3c.status} ${r3d.status}`);
    r = await appel('POST', `/api/livreur/commandes/${cmd1}/echec`, tokA, { motif: 'absent', note: 'Personne au local, rideau baissé', rapporteeDepot: true });
    const d3 = await detail(cmd1);
    check('échec rapporté → 200 livraison_echouee ; stock revenu à 500 ; détail : statut, stockSorti false, dernière tentative (motif, note, rapportée), historique',
      r.status === 200 && r.body?.commande?.statut === 'livraison_echouee' && (await stock()) === 500 && d3?.statut === 'livraison_echouee' && d3?.stockSorti === false && d3?.livraisonRapportee === true
      && d3?.livraison?.resultat === 'echec' && d3.livraison.motifLibelle === 'Client absent' && /rideau/.test(d3.livraison.note || '') && d3.livraison.rapporteeDepot === true && d3.livraison.livreurNom === 'Livreur A'
      && d3.historique.some((h) => h.statut === 'livraison_echouee' && /Client absent/.test(h.motif || '')),
      `${r.status} stock=${await stock()} ${JSON.stringify({ statut: d3?.statut, stockSorti: d3?.stockSorti, livraison: d3?.livraison })}`);
    const rL = await appel('GET', '/api/acheteurs/commandes?statut=livraison_echouee', tok);
    const rP = await appel('GET', '/api/portail/commandes', ach.tok);
    const p1 = (rP.body || []).find((c) => c.id === cmd1);
    const rPd = await appel('GET', `/api/portail/commandes/${cmd1}`, ach.tok);
    const rLiv = await appel('GET', '/api/livreur/commandes', tokA);
    const r3e = await envoyer(`/api/livreur/commandes/${cmd1}/livree`, tokA, {}, [{ nom: 'facture', octets: JPEG, type: 'image/jpeg', fichier: 'facture.jpg' }]);
    check('après l\'échec : filtre statut=livraison_echouee (1) ; portail : statut + motif « Client absent », pas de note ; liste du livreur : commande en mémoire ; livrer ensuite → 409',
      rL.status === 200 && rL.body?.length === 1 && rL.body[0].id === cmd1 && p1?.statut === 'livraison_echouee' && p1?.echecMotif === 'Client absent' && p1?.factureSignee === false
      && rPd.body?.livraison?.resultat === 'echec' && rPd.body.livraison.motifLibelle === 'Client absent' && rPd.body.livraison.note === undefined
      && rLiv.body?.some((c) => c.id === cmd1 && c.statut === 'livraison_echouee') && r3e.status === 409 && r3e.body?.code === 'STATUT_INCOMPATIBLE',
      `${rL.body?.length} ${p1?.statut} ${p1?.echecMotif} ${JSON.stringify(rPd.body?.livraison)} ${r3e.status}`);
    const notifEchec = (await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND event_type = 'livraison_echouee'`, [clientId])).rows[0].n;
    check('notification « livraison_echouee » écrite pour le compte', notifEchec === 1, `${notifEchec}`);

    // ── 4. Relancer ──
    const cmdX = (await vendre(null)).body?.commande?.id; // expédiée, sans livreur : ne se relance pas
    r = await appel('POST', `/api/acheteurs/commandes/${cmdX}/relancer`, tok, {});
    await appel('PUT', `/api/livreurs/${livB.id}`, tok, { actif: false });
    const r4b = await appel('POST', `/api/acheteurs/commandes/${cmd1}/relancer`, tok, { livreurId: livB.id });
    const r4c = await appel('POST', `/api/acheteurs/commandes/${cmd1}/relancer`, tok, {});
    const d4 = await detail(cmd1);
    check('relancer : commande expédiée → 409 ; livreur B désactivé → 409 LIVREUR_INACTIF ; sans corps → 200 expédiée avec le livreur A, stock ressorti (495 = 500 − 3 − 2), historique « Nouvelle tentative »',
      r.status === 409 && r4b.status === 409 && r4b.body?.code === 'LIVREUR_INACTIF' && r4c.status === 200 && r4c.body?.commande?.statut === 'expediee' && r4c.body.commande.livreurNom === 'Livreur A'
      && d4?.statut === 'expediee' && d4?.dateExpedition === aujourdhui && d4?.livraisonRapportee === false && (await stock()) === 495
      && d4.historique.filter((h) => h.statut === 'expediee').length === 2 && d4.historique.some((h) => /Nouvelle tentative/.test(h.motif || '')),
      `${r.status} ${r4b.status} ${r4c.status} ${d4?.statut} stock=${await stock()}`);
    await appel('PUT', `/api/livreurs/${livB.id}`, tok, { actif: true });

    // ── 5. Livrée avec la facture signée ──
    r = await envoyer(`/api/livreur/commandes/${cmd1}/livree`, tokA, { receptionnaire: 'Mme Fictive', montantPercu: '999', modePaiementId: '1' }, [{ nom: 'facture', octets: JPEG, type: 'image/jpeg', fichier: 'Facture signée.jpg' }]);
    const d5 = await detail(cmd1);
    check('livrée avec photo → 200 ; commande livrée aujourd\'hui ; encaissement ignoré (option inactive) ; détail : réceptionnaire, facture signée (image/jpeg), 2 tentatives',
      r.status === 200 && r.body?.commande?.statut === 'livree' && r.body.encaissement === false && r.body.montantPercu === null && d5?.statut === 'livree' && d5?.dateLivraison === aujourdhui
      && d5?.livraison?.resultat === 'livree' && d5.livraison.receptionnaire === 'Mme Fictive' && d5.livraison.montantPercu === null && d5.livraison.factureSignee?.type === 'image/jpeg' && d5.livraisons?.length === 2
      && d5.historique.some((h) => h.statut === 'livree' && /Mme Fictive/.test(h.motif || '')),
      `${r.status} ${JSON.stringify(d5?.livraison)}`);
    const pV = await brut(`/api/acheteurs/commandes/${cmd1}/livraison/piece`, tok);
    const pA = await brut(`/api/portail/commandes/${cmd1}/livraison/piece`, ach.tok);
    const pX = await brut(`/api/acheteurs/commandes/${cmdX}/livraison/piece`, tok);
    const pL = await brut(`/api/acheteurs/commandes/${cmd1}/livraison/piece`, tokA);
    const pP = (await appel('GET', '/api/portail/commandes', ach.tok)).body?.find((c) => c.id === cmd1);
    check('facture signée relue : vendeur 200 image/jpeg (octets identiques, nom UTF-8) ; acheteur 200 ; commande sans pièce → 404 ; livreur → 403 ; portail factureSignee true',
      pV.status === 200 && pV.type === 'image/jpeg' && pV.octets.equals(JPEG) && /Facture%20sign/.test(pV.disposition || '') && pA.status === 200 && pA.octets.equals(JPEG) && pX.status === 404 && pL.status === 403 && pP?.factureSignee === true,
      `${pV.status} ${pV.type} ${pA.status} ${pX.status} ${pL.status} ${pP?.factureSignee}`);
    const notifOk = (await pool.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND event_type = 'livraison_validee'`, [clientId])).rows[0].n;
    check('notification « livraison_validee » écrite pour le compte', notifOk === 1, `${notifOk}`);
    r = await envoyer(`/api/livreur/commandes/${cmd1}/livree`, tokA, {}, [{ nom: 'facture', octets: JPEG, type: 'image/jpeg', fichier: 'facture.jpg' }]);
    check('livrer une commande déjà livrée → 409', r.status === 409 && r.body?.code === 'STATUT_INCOMPATIBLE', `${r.status}`);

    // ── 6. Encaissement (option du compte) ──
    r = await appel('PUT', '/api/livreurs/options', tok, { encaissement: 'oui' });
    const r6b = await appel('PUT', '/api/livreurs/options', tok, { encaissement: true });
    const r6c = await appel('GET', '/api/livreurs', tok);
    const r6d = await appel('GET', '/api/livreur/moi', tokA);
    const especes = (r6d.body?.modesPaiement || []).find((m) => m.code === 'especes');
    check('PUT /api/livreurs/options : valeur non booléenne → 400 ; true → 200 ; GET /api/livreurs encaissement true ; /moi du livreur : encaissement true + modes (espèces, chèque…)',
      r.status === 400 && r6b.status === 200 && r6b.body?.encaissement === true && r6c.body?.encaissement === true && r6d.body?.encaissement === true && !!especes && (r6d.body.modesPaiement || []).some((m) => m.code === 'cheque'),
      `${r.status} ${r6b.status} ${r6c.body?.encaissement} ${JSON.stringify(r6d.body?.modesPaiement)}`);
    const cmd2 = (await vendre(livA.id)).body?.commande?.id;
    const photo = [{ nom: 'facture', octets: JPEG, type: 'image/jpeg', fichier: 'facture.jpg' }];
    r = await envoyer(`/api/livreur/commandes/${cmd2}/livree`, tokA, {}, photo);
    const r6f = await envoyer(`/api/livreur/commandes/${cmd2}/livree`, tokA, { montantPercu: '12,5' }, photo);
    const r6g = await envoyer(`/api/livreur/commandes/${cmd2}/livree`, tokA, { montantPercu: '12,5', modePaiementId: '999999' }, photo);
    const r6h = await envoyer(`/api/livreur/commandes/${cmd2}/livree`, tokA, { montantPercu: '0' }, photo);
    const d6 = await detail(cmd2);
    check('encaissement actif : sans montant → 400 MONTANT_REQUIS ; montant sans mode → 400 MODE_PAIEMENT_REQUIS ; mode inconnu → 400 ; montant 0 sans mode → 200 (montantPercu 0)',
      r.status === 400 && r.body?.code === 'MONTANT_REQUIS' && r6f.status === 400 && r6f.body?.code === 'MODE_PAIEMENT_REQUIS' && r6g.status === 400 && r6h.status === 200 && r6h.body?.montantPercu === 0 && d6?.livraison?.montantPercu === 0 && d6.livraison.modePaiement === null,
      `${r.status} ${r6f.status} ${r6g.status} ${r6h.status} ${JSON.stringify(d6?.livraison)}`);
    const cmd3 = (await vendre(livA.id)).body?.commande?.id;
    r = await envoyer(`/api/livreur/commandes/${cmd3}/livree`, tokA, { montantPercu: '12,5', modePaiementId: String(especes.id) }, photo);
    const d7 = await detail(cmd3);
    check('montant 12,500 en espèces → 200 ; détail : montantPercu 12.5, modePaiement « Espèces »', r.status === 200 && r.body?.montantPercu === 12.5 && d7?.livraison?.montantPercu === 12.5 && d7.livraison.modePaiement === 'Espèces', `${r.status} ${JSON.stringify(d7?.livraison)}`);
    const orphelins = (await pool.query(`SELECT COUNT(*)::int AS n FROM commande_livraisons WHERE client_id = $1 AND resultat = 'livree'`, [clientId])).rows[0].n;
    check('aucune tentative « livrée » enregistrée pour les envois refusés (3 lignes : cmd1, cmd2, cmd3)', orphelins === 3, `${orphelins}`);

    // ── 7. Échec NON rapporté puis annulation ; échec rapporté puis annulation ──
    const avant7 = await stock(); // 500 − 3 − 2 − 2 − 2 = 491
    const cmd4 = (await vendre(livA.id)).body?.commande?.id; // 489
    r = await appel('POST', `/api/livreur/commandes/${cmd4}/echec`, tokA, { motif: 'marchandise_abimee', note: 'Seau percé pendant le trajet', rapporteeDepot: false });
    const d8 = await detail(cmd4);
    const s8 = await stock();
    const r7b = await appel('POST', `/api/acheteurs/commandes/${cmd4}/annuler`, tok, { motif: 'Marchandise perdue (test)' });
    const s8b = await stock();
    check('échec NON rapporté : stock toujours sorti (489, stockSorti true) ; annulation → message « réintégré », stock 491',
      r.status === 200 && d8?.statut === 'livraison_echouee' && d8?.stockSorti === true && s8 === avant7 - 2 && r7b.status === 200 && /réintégré/.test(r7b.body?.message || '') && s8b === avant7,
      `${r.status} ${d8?.stockSorti} ${s8} ${r7b.status} ${r7b.body?.message} ${s8b}`);
    const cmd5 = (await vendre(livA.id)).body?.commande?.id;
    r = await appel('POST', `/api/livreur/commandes/${cmd5}/echec`, tokA, { motif: 'refus', note: 'Le client refuse la commande', rapporteeDepot: true });
    const s9 = await stock();
    const r7d = await appel('POST', `/api/acheteurs/commandes/${cmd5}/annuler`, tok, { motif: 'Refus (test)' });
    const s9b = await stock();
    check('échec rapporté : stock déjà revenu (491) ; annulation → « Commande annulée » sans réintégration, stock inchangé',
      r.status === 200 && s9 === avant7 && r7d.status === 200 && r7d.body?.message === 'Commande annulée' && s9b === avant7, `${r.status} ${s9} ${r7d.status} ${r7d.body?.message} ${s9b}`);

    // ── 8. Manuel ──
    r = await appel('GET', '/api/manuel', tok);
    const texte = JSON.stringify(r.body || '');
    check('manuel du client : fiche « livreurs-livraison » présente ; fiche « livreurs » parle de l\'encaissement', r.status === 200 && /"slug":"livreurs-livraison"/.test(texte) && /Les livreurs encaissent à la livraison/.test(texte), `${r.status}`);
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
