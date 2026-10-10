/* Test E2E local — factures fournisseur, étape F1 (labflow-reprise/achats-compta/PLAN-FACTURES.md) : la facture devient
 * une vraie pièce.
 *   POST /api/appros/facture                                   facture d'appro enregistrée d'un seul coup (+ pièces)
 *   GET  /api/factures, /api/factures/:id/lignes               périmètre du gérant, nombre de pièces
 *   GET|POST /api/factures/:id/pieces, GET …/:pieceId/fichier, PUT|DELETE …/:pieceId
 *   PUT|DELETE /api/stock/historique/:id, DELETE /api/labo/:l/historique/:id   facture recalculée, dernière ligne
 *   DELETE /admin/clients/:id                                  fichiers effacés avec le compte
 * Crée un super_admin + 1 client (2 activités, 1 labo, 1 gérant sur une seule activité) temporaires, puis nettoie (API
 * admin). SQL direct : activation des comptes d'essai, article et fournisseur d'un AUTRE compte, facture de transfert
 * simulée, mode lecture seule, contrôles en base. Données fictives. Stockage : le dossier local du serveur d'essai
 * (STOCKAGE_LOCAL, posé par scripts/lib/bouchons-test.js — le même ici et dans le serveur).
 * ⚠️ Serveur d'essai : « node scripts/start-test-backend.js » (PORT=3100 par défaut ici : BASE_URL pour changer). */
require('./lib/bouchons-test').installer();
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/database');

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const DOSSIER = process.env.STOCKAGE_LOCAL;
const MDP = crypto.randomBytes(18).toString('base64url');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const approx = (a, b, eps = 0.0005) => Math.abs(Number(a) - Number(b)) <= eps;
const aujourdhui = new Date().toISOString().slice(0, 10);

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
// Envoi multipart : `donnees` (JSON) + fichiers { champ, octets, nom, type }.
const envoi = async (methode, chemin, jeton, donnees, fichiers = []) => {
  const fd = new FormData();
  if (donnees !== undefined) fd.append('donnees', JSON.stringify(donnees));
  for (const f of fichiers) fd.append(f.champ || 'pieces', new Blob([f.octets], { type: f.type || 'application/octet-stream' }), f.nom);
  const r = await fetch(`${BASE}${chemin}`, { method: methode, headers: { Authorization: `Bearer ${jeton}` }, body: fd });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const telecharger = async (chemin, jeton) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  return { status: r.status, h: r.headers, buf: Buffer.from(await r.arrayBuffer()) };
};
const login = async (email) => (await appel('POST', '/auth/login', null, { email, password: MDP })).body?.token;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Fichiers d'essai (contenus fictifs, types reconnus sur leurs premiers octets).
const remplir = (debut, n = 2048) => Buffer.concat([debut, crypto.randomBytes(Math.max(0, n - debut.length))]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n% facture fictive F1\n'), crypto.randomBytes(1500), Buffer.from('\n%%EOF\n')]);
const JPEG = remplir(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));
const PNG = remplir(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const HEIC = remplir(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(4), Buffer.from('mif1heic')]));
const HTML = Buffer.from('<html><body><script>alert(1)</script></body></html>');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fichierStocke = (cle) => path.join(DOSSIER, ...cle.split('/'));
const existe = (cle) => !!cle && fs.existsSync(fichierStocke(cle));

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-f1@example.com';
  const CLIENT = 'test-f1-client@example.com';
  const GERANT = 'test-f1-gerant@example.com';
  let adminTok = null;
  let adminId = null;
  const etrangers = { article: null, fournisseur: null, unite: null };
  const supprimerComptes = async () => {
    const restes = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows;
    for (const { id } of restes) if (adminTok) await appel('DELETE', `/admin/clients/${id}`, adminTok);
    if (etrangers.article) await pool.query('DELETE FROM articles WHERE id = $1', [etrangers.article]);
    if (etrangers.fournisseur) await pool.query('DELETE FROM fournisseurs WHERE id = $1', [etrangers.fournisseur]);
    if (etrangers.unite) await pool.query('DELETE FROM unites WHERE id = $1', [etrangers.unite]);
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [[GERANT, CLIENT, ADMIN]]);
  };
  if (!DOSSIER) { console.error('STOCKAGE_LOCAL absent : lancer par bouchons-test'); process.exit(2); }

  try {
    // ── 0. Préparation ─────────────────────────────────────────────────────────────────────────────────────────────
    const adminExistant = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [ADMIN])).rows[0];
    if (adminExistant) await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, actif = true WHERE id = $2', [hash, adminExistant.id]);
    else await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminF1', $1, $2, 'super_admin', true)`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    adminId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [ADMIN])).rows[0].id;
    check('login super_admin temporaire', !!adminTok);
    {
      const restes = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows;
      for (const { id } of restes) await appel('DELETE', `/admin/clients/${id}`, adminTok);
      await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [[GERANT, CLIENT]]);
    }
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST-F1 Contact', email: CLIENT, telephone: '20778841', nbActivites: 2, nbLabos: 1, nbGerants: 1, montantOnboarding: 0 });
    check('création du client (2 activités, 1 labo, 1 gérant)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0].id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const tok = await login(CLIENT);
    check('login du client', !!tok);
    r = await appel('GET', '/api/unites', tok);
    let kg = (r.body || []).find((u) => (u.name || u.nom) === 'kg');
    if (!kg) kg = (await appel('POST', '/api/unites', tok, { name: 'kg' })).body;
    const fam = (await appel('POST', '/api/familles', tok, { name: 'Famille F1' })).body;
    const cat = (await appel('POST', '/api/categories', tok, { name: 'Catégorie F1', familleId: fam?.id })).body;
    const art1 = (await appel('POST', '/api/articles', tok, { name: 'Farine F1', unitId: kg?.id, categorieId: cat?.id })).body;
    const art2 = (await appel('POST', '/api/articles', tok, { name: 'Sucre F1', unitId: kg?.id, categorieId: cat?.id })).body;
    const actA = (await appel('POST', '/api/entreprise/activites', tok, { nom: 'Restaurant F1' })).body;
    const actB = (await appel('POST', '/api/entreprise/activites', tok, { nom: 'Snack F1' })).body;
    const labo = (await appel('POST', '/api/labo', tok, { nom: 'Cuisine F1', refLabo: 'CF1' })).body;
    for (const a of [art1, art2]) {
      await appel('POST', `/api/entreprise/activites/${actA?.id}/ingredients/${a?.id}/select`, tok, {});
      await appel('POST', `/api/entreprise/activites/${actB?.id}/ingredients/${a?.id}/select`, tok, {});
      await appel('POST', `/api/labo/${labo?.id}/ingredients/${a?.id}/select`, tok, {});
    }
    const fo = (await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'Grossiste F1', activiteIds: [actA?.id, actB?.id], laboIds: [labo?.id] })).body;
    check('préparation : 2 articles, 2 activités, 1 labo, 1 fournisseur', !!(art1?.id && art2?.id && actA?.id && actB?.id && labo?.id && fo?.id),
      JSON.stringify({ a1: art1?.id, a2: art2?.id, A: actA?.id, B: actB?.id, L: labo?.id, F: fo?.id }));
    r = await appel('POST', '/api/abonnements/gerants', tok, { nom: 'TEST-Gérant F1', telephone: '20778842', email: GERANT, activiteIds: [actA.id] });
    const gerantId = r.body?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, gerantId]);
    const gTok = await login(GERANT);
    check('préparation : gérant de l\'activité A seulement', r.status === 201 && !!gTok, `${r.status} ${r.body?.message || ''}`);
    etrangers.unite = (await pool.query(`INSERT INTO unites (nom, client_id) VALUES ('kg-autre-compte-f1', $1) RETURNING id`, [adminId])).rows[0].id;
    etrangers.article = (await pool.query(`INSERT INTO articles (nom, unite_id, client_id) VALUES ('Article d''un autre compte F1', $1, $2) RETURNING id`, [etrangers.unite, adminId])).rows[0].id;
    etrangers.fournisseur = (await pool.query(`INSERT INTO fournisseurs (nom, client_id) VALUES ('Fournisseur d''un autre compte F1', $1) RETURNING id`, [adminId])).rows[0].id;

    const donnees = (m = {}) => ({
      cible: { type: 'activite', id: actA.id }, dateAppro: aujourdhui, fournisseurId: fo.id, refFacture: 'FA-001', timbreFiscal: true,
      lignes: [{ articleId: art1.id, quantite: 2.5, prixUnitaire: 4, tauxTva: 19 }, { articleId: art2.id, quantite: 1, prixUnitaire: 0.75, tauxTva: 0 }],
      ...m,
    });
    const facture = async (id) => (await pool.query('SELECT * FROM factures WHERE id = $1', [id])).rows[0];
    const lignesDe = async (id) => (await pool.query('SELECT * FROM stock_entreprise_daily WHERE facture_id = $1 ORDER BY id', [id])).rows;
    const piecesDe = async (id) => (await pool.query('SELECT * FROM factures_pieces WHERE facture_id = $1 ORDER BY ordre', [id])).rows;
    const journal = async (id, action) => (await pool.query('SELECT * FROM factures_journal WHERE client_id = $1 AND action = $2 AND (facture_id = $3 OR (details->>\'factureId\')::int = $3)', [clientId, action, id])).rows;

    // ── 1. Facture saisie d'un seul coup (sans pièce) ─────────────────────────────────────────────────────────────
    r = await envoi('POST', '/api/appros/facture', tok, donnees());
    check('1. POST /api/appros/facture → 201, facture créée, 2 lignes, 0 pièce', r.status === 201 && r.body?.ajoutee === false && r.body?.nbLignes === 2 && r.body?.nbPieces === 0, `${r.status} ${JSON.stringify(r.body)}`);
    const f1 = r.body?.factureId;
    let L = await lignesDe(f1);
    let F = await facture(f1);
    check('1. lignes de stock rattachées : manuel, TTC au millime (4 × 1,19 = 4,760)', L.length === 2 && L.every((l) => l.type_appro === 'manuel' && l.fournisseur_id === fo.id && l.ref_facture === 'FA-001')
      && approx(L[0].prix_unitaire_tva, 4.76) && approx(L[1].prix_unitaire_tva, 0.75), JSON.stringify(L.map((l) => [l.prix_unitaire, l.prix_unitaire_tva])));
    check('1. montants de la facture recalculés : HT 10,750 · TVA 1,900 · TTC 13,650 (timbre 1 D)', approx(F.montant_ht, 10.75) && approx(F.montant_tva, 1.9) && approx(F.montant_ttc, 13.65) && F.timbre_fiscal === true && F.type_source === 'manuel',
      JSON.stringify([F.montant_ht, F.montant_tva, F.montant_ttc, F.timbre_fiscal]));
    check('1. journal : facture_creee', (await journal(f1, 'facture_creee')).length === 1);
    r = await envoi('POST', '/api/appros/facture', tok, donnees({ refFacture: 'FA-ARR', lignes: [{ articleId: art1.id, quantite: 50, prixUnitaire: 1.54, tauxTva: 19 }, { articleId: art2.id, quantite: 15, prixUnitaire: 4.98, tauxTva: 19 }] }));
    const fArr = await facture(r.body?.factureId);
    // 50 × 1,54 × 1,19 + 15 × 4,98 × 1,19 = 180,523 (et non 50 × 1,833 + 15 × 5,926 = 180,540 avec le PU TTC arrondi)
    check('1. TTC = HT + TVA + timbre sans arrondi intermédiaire (181,523, comme le récapitulatif de la saisie)', r.status === 201 && approx(fArr?.montant_ht, 151.7) && approx(fArr?.montant_tva, 28.823) && approx(fArr?.montant_ttc, 181.523), JSON.stringify([fArr?.montant_ht, fArr?.montant_tva, fArr?.montant_ttc]));

    // ── 2. Doublons ─────────────────────────────────────────────────────────────────────────────────────────────────
    r = await envoi('POST', '/api/appros/facture', tok, donnees());
    check('2. même numéro, même fournisseur → 409 FACTURE_EXISTANTE (même facture signalée)', r.status === 409 && r.body?.code === 'FACTURE_EXISTANTE' && r.body.factures?.[0]?.id === f1 && r.body.factures[0].memeFacture === true, `${r.status} ${JSON.stringify(r.body)}`);
    check('2. rien d\'écrit après le refus', (await lignesDe(f1)).length === 2);
    r = await envoi('POST', '/api/appros/facture', tok, donnees({ refFacture: ' fa-001 ', dateAppro: aujourdhui }));
    check('2. numéro en minuscules avec espaces → 409 aussi (comparaison normalisée)', r.status === 409 && r.body?.code === 'FACTURE_EXISTANTE' && r.body.factures?.[0]?.memeFacture === false, `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', '/api/appros/facture', tok, donnees({ confirmerDoublon: true, timbreFiscal: false }));
    F = await facture(f1);
    check('2. confirmé → 201, lignes AJOUTÉES à la même facture (4), timbre gardé, TTC 2 × 12,650 + 1', r.status === 201 && r.body?.ajoutee === true && r.body?.factureId === f1 && r.body?.nbLignes === 4 && F.timbre_fiscal === true && approx(F.montant_ttc, 26.3),
      `${r.status} ${JSON.stringify(r.body)} ttc=${F.montant_ttc}`);
    check('2. journal : lignes_ajoutees', (await journal(f1, 'lignes_ajoutees')).length === 1);
    {
      const [x, y] = await Promise.all([1, 2].map(() => envoi('POST', '/api/appros/facture', tok, donnees({ refFacture: 'FA-CONC' }), [{ octets: PDF, nom: 'conc.pdf', type: 'application/pdf' }])));
      const statuts = [x.status, y.status].sort().join(',');
      const fc = (await pool.query("SELECT id FROM factures WHERE client_id = $1 AND ref_facture = 'FA-CONC'", [clientId])).rows;
      const nl = fc.length ? (await lignesDe(fc[0].id)).length : 0;
      const np = fc.length ? (await piecesDe(fc[0].id)).length : 0;
      check('2. deux envois simultanés de la même facture : un 201, un 409 FACTURE_EXISTANTE, rien de doublé', statuts === '201,409' && fc.length === 1 && nl === 2 && np === 1, `${statuts} factures=${fc.length} lignes=${nl} pieces=${np}`);
    }

    // ── 3. Contrôles d'appartenance et de périmètre ─────────────────────────────────────────────────────────────────
    r = await envoi('POST', '/api/appros/facture', tok, donnees({ refFacture: 'FA-X1', lignes: [{ articleId: etrangers.article, quantite: 1, prixUnitaire: 1 }] }));
    check('3. article d\'un autre compte → 400 ARTICLE_INCONNU', r.status === 400 && r.body?.code === 'ARTICLE_INCONNU', `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', '/api/appros/facture', tok, donnees({ refFacture: 'FA-X2', fournisseurId: etrangers.fournisseur }));
    check('3. fournisseur d\'un autre compte → 400 FOURNISSEUR_INCONNU', r.status === 400 && r.body?.code === 'FOURNISSEUR_INCONNU', `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', '/api/appros/facture', tok, donnees({ refFacture: 'FA-X3', cible: { type: 'activite', id: 999999999 } }));
    check('3. activité inconnue → 404', r.status === 404 && r.body?.code === 'CIBLE_INTROUVABLE', `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', '/api/appros/facture', tok, donnees({ refFacture: 'x'.repeat(101) }));
    check('3. numéro de plus de 100 caractères → 400 REF_TROP_LONGUE (avant : erreur serveur)', r.status === 400 && r.body?.code === 'REF_TROP_LONGUE', `${r.status}`);
    r = await envoi('POST', '/api/appros/facture', gTok, donnees({ refFacture: 'FA-G-B', cible: { type: 'activite', id: actB.id } }));
    check('3. gérant sur une activité qui ne lui est pas affectée → 403 HORS_PERIMETRE', r.status === 403 && r.body?.code === 'HORS_PERIMETRE', `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', '/api/appros/facture', gTok, donnees({ refFacture: 'FA-G-A', lignes: [{ articleId: art1.id, quantite: 3, prixUnitaire: 2, tauxTva: 7 }] }));
    const fG = r.body?.factureId;
    check('3. gérant sur son activité → 201', r.status === 201 && !!fG, `${r.status} ${JSON.stringify(r.body)}`);
    const nbAvant = (await pool.query('SELECT COUNT(*)::int AS n FROM stock_entreprise_daily WHERE activite_id = ANY($1)', [[actA.id, actB.id]])).rows[0].n;
    r = await envoi('POST', '/api/appros/facture', tok, donnees({ refFacture: 'FA-X4', lignes: [{ articleId: art1.id, quantite: 1, prixUnitaire: 1 }, { articleId: art2.id, quantite: -1, prixUnitaire: 1 }] }));
    const nbApres = (await pool.query('SELECT COUNT(*)::int AS n FROM stock_entreprise_daily WHERE activite_id = ANY($1)', [[actA.id, actB.id]])).rows[0].n;
    check('3. une ligne invalide → 400 LIGNE_INVALIDE (ligne 2) et AUCUNE ligne écrite', r.status === 400 && r.body?.code === 'LIGNE_INVALIDE' && r.body?.ligne === 2 && nbApres === nbAvant, `${r.status} ${JSON.stringify(r.body)} ${nbAvant}/${nbApres}`);

    // ── 4. Facture avec pièces (PDF + photo HEIC et sa copie JPEG) ─────────────────────────────────────────────────
    r = await envoi('POST', '/api/appros/facture', tok, donnees({ refFacture: 'FA-002', lignes: [{ articleId: art1.id, quantite: 10, prixUnitaire: 1.234, tauxTva: 19 }], apercuDe: [1] }), [
      { octets: PDF, nom: 'Facture été 002.pdf', type: 'application/pdf' },
      { octets: HEIC, nom: 'IMG_0001.HEIC', type: 'image/heic' },
      { champ: 'apercus', octets: JPEG, nom: 'IMG_0001.jpg', type: 'image/jpeg' },
    ]);
    const f2 = r.body?.factureId;
    let P = await piecesDe(f2);
    check('4. facture avec 2 pièces → 201, nbPieces 2', r.status === 201 && r.body?.nbPieces === 2, `${r.status} ${JSON.stringify(r.body)}`);
    check('4. pièces en base : ordre 1-2, types lus sur le contenu, nom d\'origine en UTF-8, empreintes',
      P.length === 2 && P[0].type_mime === 'application/pdf' && P[1].type_mime === 'image/heic' && P[0].nom_origine === 'Facture été 002.pdf'
      && P[0].empreinte === sha(PDF) && P[1].empreinte === sha(HEIC) && P[1].apercu_cle && !P[0].apercu_cle && P.map((p) => p.ordre).join() === '1,2',
      JSON.stringify(P.map((p) => [p.ordre, p.type_mime, p.nom_origine, !!p.apercu_cle])));
    check('4. fichiers déposés dans le stockage, à l\'octet', existe(P[0]?.cle) && fs.readFileSync(fichierStocke(P[0].cle)).equals(PDF)
      && fs.readFileSync(fichierStocke(P[1].cle)).equals(HEIC) && fs.readFileSync(fichierStocke(P[1].apercu_cle)).equals(JPEG));
    check('4. clé de stockage sans nom d\'utilisateur', /^clients\/\d+\/pieces\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/.test(P[0]?.cle || ''), P[0]?.cle);

    // ── 5. Lecture : liste, fichier, copie d'une photo HEIC, périmètre du gérant ─────────────────────────────────────
    r = await appel('GET', `/api/factures?activiteId=${actA.id}`, tok);
    const ligneF2 = (r.body || []).find((f) => f.id === f2);
    check('5. GET /api/factures : nbPieces = 2 sur la facture', r.status === 200 && ligneF2?.nbPieces === 2 && (r.body || []).find((f) => f.id === f1)?.nbPieces === 0, JSON.stringify(ligneF2));
    r = await appel('GET', `/api/factures/${f2}/pieces`, tok);
    check('5. GET …/pieces → 2 pièces, modifiable, déposées par le client', r.status === 200 && r.body?.modifiable === true && r.body.pieces?.length === 2 && r.body.pieces[0].nom === 'Facture été 002.pdf' && r.body.pieces[1].avecApercu === true && !!r.body.pieces[0].deposeParNom,
      JSON.stringify(r.body));
    const [pPdf, pHeic] = r.body?.pieces || [];
    let t = await telecharger(`/api/factures/${f2}/pieces/${pPdf?.id}/fichier`, tok);
    check('5. fichier PDF : octets identiques, type fixé, nosniff, jamais en cache, inline', t.status === 200 && t.buf.equals(PDF) && t.h.get('content-type') === 'application/pdf'
      && t.h.get('x-content-type-options') === 'nosniff' && /no-store/.test(t.h.get('cache-control') || '') && /^inline;/.test(t.h.get('content-disposition') || '') && /UTF-8''Facture%20%C3%A9t%C3%A9%20002\.pdf/.test(t.h.get('content-disposition') || ''),
      `${t.status} ${t.h.get('content-type')} ${t.h.get('content-disposition')}`);
    t = await telecharger(`/api/factures/${f2}/pieces/${pHeic?.id}/fichier?apercu=1`, tok);
    check('5. photo HEIC, ?apercu=1 → la copie JPEG', t.status === 200 && t.buf.equals(JPEG) && t.h.get('content-type') === 'image/jpeg', `${t.status} ${t.h.get('content-type')}`);
    t = await telecharger(`/api/factures/${f2}/pieces/${pHeic?.id}/fichier?telecharger=1`, tok);
    check('5. photo HEIC, original à télécharger', t.status === 200 && t.buf.equals(HEIC) && t.h.get('content-type') === 'image/heic' && /^attachment;/.test(t.h.get('content-disposition') || ''));
    t = await telecharger(`/api/factures/${f2}/pieces/${pPdf?.id}/fichier`, gTok);
    check('5. gérant de l\'activité A : lit la pièce', t.status === 200 && t.buf.equals(PDF), String(t.status));

    // ── 6. Joindre : refus de type, plafond de 5, labo, transfert ───────────────────────────────────────────────────
    const nbFichiers = () => { let n = 0; const tour = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) tour(path.join(d, e.name)); else n += 1; } }; tour(path.join(DOSSIER, 'clients', String(clientId))); return n; };
    const avant6 = nbFichiers();
    r = await envoi('POST', `/api/factures/${f1}/pieces`, tok, {}, [{ octets: HTML, nom: 'facture.pdf', type: 'application/pdf' }]);
    check('6. une page HTML nommée .pdf → 400 TYPE_REFUSE, rien de stocké', r.status === 400 && r.body?.code === 'TYPE_REFUSE' && nbFichiers() === avant6, `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', `/api/factures/${f2}/pieces`, tok, {}, [1, 2, 3, 4].map((i) => ({ octets: remplir(Buffer.from([0xff, 0xd8, 0xff, 0xe1]), 512 + i), nom: `p${i}.jpg`, type: 'image/jpeg' })));
    check('6. 2 + 4 pièces → 409 TROP_DE_PIECES, rien de stocké', r.status === 409 && r.body?.code === 'TROP_DE_PIECES' && nbFichiers() === avant6, `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', `/api/factures/${f1}/pieces`, tok, {}, [{ octets: JPEG, nom: 'scan.jpg', type: 'image/jpeg' }, { octets: PNG, nom: 'scan2.png', type: 'image/png' }]);
    check('6. « Joindre la facture » à une facture sans pièce → 201, 2 pièces', r.status === 201 && r.body?.pieces?.length === 2 && r.body.pieces.map((p) => p.ordre).join() === '1,2', `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', `/api/factures/${f1}/pieces`, gTok, {}, [{ octets: PDF, nom: 'g.pdf', type: 'application/pdf' }]);
    check('6. le gérant joint une pièce sur son activité → 201', r.status === 201 && r.body?.pieces?.length === 3, `${r.status}`);
    r = await envoi('POST', '/api/appros/facture', tok, donnees({ refFacture: 'FA-L1', cible: { type: 'labo', id: labo.id }, lignes: [{ articleId: art2.id, quantite: 4, prixUnitaire: 2.5, tauxTva: 7 }] }), [{ octets: PNG, nom: 'labo.png', type: 'image/png' }]);
    const fL = r.body?.factureId;
    const lignesLabo = (await pool.query('SELECT * FROM stock_labo_daily WHERE facture_id = $1', [fL])).rows;
    check('6. facture d\'un labo → 201, ligne au labo, facture rattachée au labo', r.status === 201 && lignesLabo.length === 1 && (await facture(fL))?.labo_id === labo.id && approx(lignesLabo[0].prix_unitaire_tva, 2.675), `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('GET', `/api/factures/${fL}/pieces`, gTok);
    const r2 = await envoi('POST', `/api/factures/${fL}/pieces`, gTok, {}, [{ octets: PDF, nom: 'x.pdf', type: 'application/pdf' }]);
    check('6. gérant hors du labo : facture du labo introuvable (lecture et dépôt)', r.status === 404 && r2.status === 404, `${r.status} ${r2.status}`);
    const fT = (await pool.query(`INSERT INTO factures (client_id, ref_facture, date_facture, activite_id, type_source, montant_ht, montant_tva, montant_ttc) VALUES ($1, 'TR-F1', $2, $3, 'transfert', 0, 0, 0) RETURNING id`, [clientId, aujourdhui, actA.id])).rows[0].id;
    r = await envoi('POST', `/api/factures/${fT}/pieces`, tok, {}, [{ octets: PDF, nom: 't.pdf', type: 'application/pdf' }]);
    check('6. facture de transfert → 409 FACTURE_TRANSFERT', r.status === 409 && r.body?.code === 'FACTURE_TRANSFERT', `${r.status} ${JSON.stringify(r.body)}`);

    // ── 7. Liste des factures du gérant ─────────────────────────────────────────────────────────────────────────────
    const fB = (await envoi('POST', '/api/appros/facture', tok, donnees({ refFacture: 'FA-B1', cible: { type: 'activite', id: actB.id } }))).body?.factureId;
    r = await appel('GET', '/api/factures', gTok);
    const idsG = new Set((r.body || []).map((f) => f.id));
    check('7. gérant : GET /api/factures ne rend que ses factures (activité A), plus celles de l\'activité B ni du labo', r.status === 200 && idsG.has(f1) && idsG.has(fG) && !idsG.has(fB) && !idsG.has(fL), JSON.stringify([...idsG]));
    r = await appel('GET', `/api/factures/${fB}/lignes`, gTok);
    check('7. gérant : lignes d\'une facture de l\'activité B → 404', r.status === 404, String(r.status));
    r = await appel('GET', '/api/factures', tok);
    check('7. client : toutes ses factures', [f1, fG, fB, fL, f2].every((id) => (r.body || []).some((f) => f.id === id)));

    // ── 8. Remplacer, supprimer ─────────────────────────────────────────────────────────────────────────────────────
    P = await piecesDe(f2);
    const ancienne = P[0];
    r = await envoi('PUT', `/api/factures/${f2}/pieces/${ancienne.id}`, tok, {}, [{ octets: PNG, nom: 'nouvelle.png', type: 'image/png' }]);
    const apres = (await piecesDe(f2)).find((p) => p.id === ancienne.id);
    check('8. remplacer → 200, nouveau fichier, ancien effacé du stockage, même rang', r.status === 200 && apres?.type_mime === 'image/png' && apres.ordre === 1 && existe(apres.cle) && !existe(ancienne.cle),
      `${r.status} ${JSON.stringify(r.body)}`);
    check('8. journal : piece_remplacee', (await journal(f2, 'piece_remplacee')).length === 1);
    const heic = (await piecesDe(f2))[1];
    r = await appel('DELETE', `/api/factures/${f2}/pieces/${apres.id}`, tok);
    const reste = await piecesDe(f2);
    check('8. supprimer → 200, définitif (fichier effacé), la pièce suivante remonte au rang 1', r.status === 200 && reste.length === 1 && reste[0].id === heic.id && reste[0].ordre === 1 && !existe(apres.cle),
      `${r.status} ${JSON.stringify(reste.map((p) => [p.id, p.ordre]))}`);
    check('8. journal : piece_supprimee', (await journal(f2, 'piece_supprimee')).length === 1);

    // ── 9. Historique : facture recalculée, dernière ligne ──────────────────────────────────────────────────────────
    L = await lignesDe(f1);
    r = await appel('PUT', `/api/stock/historique/${L[0].id}`, tok, { quantite: 2.5, prixUnitaire: 5, fournisseurId: fo.id, refFacture: 'FA-001', isEntreprise: true });
    const l0 = (await pool.query('SELECT prix_unitaire_tva FROM stock_entreprise_daily WHERE id = $1', [L[0].id])).rows[0];
    F = await facture(f1);
    // Lignes : 2,5 × 5 (TVA 19) ; 1 × 0,75 ; 2,5 × 4 (TVA 19) ; 1 × 0,75 → HT 24,000 ; TTC 2,5 × 5,95 + 0,75 + 2,5 × 4,76 + 0,75 + 1
    check('9. modifier le prix HT d\'une ligne : TTC de la ligne recalculé (5,950), facture recalculée', r.status === 200 && approx(l0.prix_unitaire_tva, 5.95) && approx(F.montant_ht, 24) && approx(F.montant_ttc, 2.5 * 5.95 + 0.75 + 2.5 * 4.76 + 0.75 + 1),
      `${r.status} ${l0.prix_unitaire_tva} ${F.montant_ht} ${F.montant_ttc}`);
    r = await appel('DELETE', `/api/stock/historique/${L[1].id}?isEntreprise=true`, tok);
    F = await facture(f1);
    check('9. supprimer une ligne (pas la dernière) : facture recalculée, gardée', r.status === 200 && r.body?.factureSupprimee === false && approx(F.montant_ht, 23.25), `${r.status} ${JSON.stringify(r.body)} ${F?.montant_ht}`);
    const derniereF2 = (await lignesDe(f2))[0];
    const clesF2 = (await piecesDe(f2)).flatMap((p) => [p.cle, p.apercu_cle]).filter(Boolean);
    r = await appel('DELETE', `/api/stock/historique/${derniereF2.id}?isEntreprise=true`, tok);
    check('9. dernière ligne d\'une facture avec pièce → 409 DERNIERE_LIGNE_FACTURE, rien de supprimé', r.status === 409 && r.body?.code === 'DERNIERE_LIGNE_FACTURE' && r.body?.nbPieces === 1 && (await lignesDe(f2)).length === 1,
      `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('DELETE', `/api/stock/historique/${derniereF2.id}?isEntreprise=true&confirmerFacture=1`, tok);
    check('9. confirmé → 200, la facture et ses pièces sont supprimées, fichiers effacés', r.status === 200 && r.body?.factureSupprimee === true && !(await facture(f2)) && (await piecesDe(f2)).length === 0 && clesF2.length === 2 && clesF2.every((c) => !existe(c)),
      `${r.status} ${JSON.stringify(r.body)}`);
    check('9. journal : facture_supprimee (référence gardée)', (await journal(f2, 'facture_supprimee')).some((j) => j.details?.ref === 'FA-002'));
    const ligneL = (await pool.query('SELECT id FROM stock_labo_daily WHERE facture_id = $1', [fL])).rows[0];
    r = await appel('DELETE', `/api/labo/${labo.id}/historique/${ligneL.id}`, tok);
    check('9. labo : dernière ligne d\'une facture avec pièce → 409 aussi', r.status === 409 && r.body?.code === 'DERNIERE_LIGNE_FACTURE', `${r.status}`);
    const clesL = (await piecesDe(fL)).map((p) => p.cle);
    r = await appel('DELETE', `/api/labo/${labo.id}/historique/${ligneL.id}?confirmerFacture=1`, tok);
    check('9. labo, confirmé → facture et pièce supprimées', r.status === 200 && r.body?.factureSupprimee === true && !(await facture(fL)) && clesL.every((c) => !existe(c)), `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('PUT', `/api/stock/entreprise/${actA.id}/${art2.id}`, tok, { quantite: 1, prixUnitaire: 3, dateAppro: aujourdhui, fournisseurId: fo.id, refFacture: 'ANC-1', tauxTva: 19, timbreFiscal: false });
    const fAnc = (await pool.query(`SELECT id FROM factures WHERE client_id = $1 AND ref_facture = 'ANC-1'`, [clientId])).rows[0]?.id;
    const ligneAnc = (await lignesDe(fAnc))[0];
    r = await appel('DELETE', `/api/stock/historique/${ligneAnc.id}?isEntreprise=true`, tok);
    check('9. ancienne saisie (requête par article, sans pièce) : sa dernière ligne emporte la facture vide, sans confirmation', r.status === 200 && r.body?.factureSupprimee === true && !(await facture(fAnc)), `${r.status} ${JSON.stringify(r.body)}`);

    // ── 10. Compte en lecture seule : on consulte, on ne dépose rien ────────────────────────────────────────────────
    await pool.query(`UPDATE abonnements SET mode_compte = 'read_only' WHERE client_id = $1`, [clientId]);
    await pause(16000); // cache d'authentification : 15 s
    r = await envoi('POST', '/api/appros/facture', tok, donnees({ refFacture: 'FA-RO' }));
    const r10 = await envoi('POST', `/api/factures/${f1}/pieces`, tok, {}, [{ octets: PDF, nom: 'ro.pdf', type: 'application/pdf' }]);
    const p1 = (await piecesDe(f1))[0];
    t = await telecharger(`/api/factures/${f1}/pieces/${p1.id}/fichier`, tok);
    const r10d = await appel('DELETE', `/api/factures/${f1}/pieces/${p1.id}`, tok);
    check('10. lecture seule : enregistrer, joindre, supprimer → 403 READ_ONLY ; ouvrir une pièce → 200', r.status === 403 && r.body?.code === 'READ_ONLY' && r10.status === 403 && r10d.status === 403 && t.status === 200,
      `${r.status} ${r10.status} ${r10d.status} ${t.status}`);
    await pool.query(`UPDATE abonnements SET mode_compte = 'actif' WHERE client_id = $1`, [clientId]);

    // ── 11. Suppression du client : ses fichiers partent avec lui ───────────────────────────────────────────────────
    const toutes = (await pool.query('SELECT cle, apercu_cle FROM factures_pieces WHERE client_id = $1', [clientId])).rows.flatMap((p) => [p.cle, p.apercu_cle]).filter(Boolean);
    r = await appel('DELETE', `/admin/clients/${clientId}`, adminTok);
    check('11. DELETE /admin/clients/:id → 204, pièces et fichiers effacés', r.status === 204 && toutes.length >= 3 && toutes.every((c) => !existe(c))
      && (await pool.query('SELECT COUNT(*)::int AS n FROM factures_pieces WHERE client_id = $1', [clientId])).rows[0].n === 0, `${r.status} ${toutes.length}`);
    r = await fetch(`${BASE}/health`).then((x) => x.json());
    check('/health : stockage « local » sur le serveur d\'essai', r.status === 'ok' && r.stockage === 'local', JSON.stringify(r));
  } catch (err) {
    console.error(err);
    check('exécution sans exception', false, err.message);
  } finally {
    await supprimerComptes().catch((e) => console.error('nettoyage :', e.message));
    const ko = results.filter((x) => !x.ok).length;
    console.log(`\n${results.length - ko}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ko ? 1 : 0);
  }
})();
