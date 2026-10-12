/* Test E2E local — factures fournisseur, étape F3 (labflow-reprise/achats-compta/PLAN-FACTURES.md) : les lignes lues et
 * la correspondance apprise.
 *   POST   /api/appros/facture/validee             facture validée : lignes, stock (conversion, coût), pièce, apprentissage
 *   GET    /api/correspondances/contexte           ce que la fenêtre « Vérifier la facture » propose
 *   GET|PATCH|DELETE /api/correspondances[/:id]    la page « Correspondances »
 *   GET    /api/factures/:id/lignes-validees       lignes telles que validées
 *   DELETE /api/factures/:id                       facture validée supprimée en entier
 *   verrous : historiques (activité, labo), pièces, saisie à la main du même numéro, désélection d'un article
 * Crée un super_admin + 1 client (2 activités, 1 labo, 1 gérant sur une seule activité) temporaires, puis nettoie (API
 * admin). SQL direct : activation des comptes d'essai, article et fournisseur d'un AUTRE compte, contrôles en base.
 * Données fictives.
 * ⚠️ Serveur d'essai : « node scripts/start-test-backend.js » (PORT=3100 par défaut ici : BASE_URL pour changer). */
require('./lib/bouchons-test').installer();
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
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
const envoi = async (methode, chemin, jeton, donnees, fichiers = []) => {
  const fd = new FormData();
  if (donnees !== undefined) fd.append('donnees', JSON.stringify(donnees));
  for (const f of fichiers) fd.append(f.champ || 'pieces', new Blob([f.octets], { type: f.type || 'application/octet-stream' }), f.nom);
  const r = await fetch(`${BASE}${chemin}`, { method: methode, headers: { Authorization: `Bearer ${jeton}` }, body: fd });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const login = async (email) => (await appel('POST', '/auth/login', null, { email, password: MDP })).body?.token;
const PDF = () => Buffer.concat([Buffer.from('%PDF-1.4\n% facture fictive F3\n'), crypto.randomBytes(1500), Buffer.from('\n%%EOF\n')]);
const piece = () => [{ octets: PDF(), nom: 'facture.pdf', type: 'application/pdf' }];
const fichierStocke = (cle) => path.join(DOSSIER, ...cle.split('/'));
const existe = (cle) => !!cle && fs.existsSync(fichierStocke(cle));

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-f3@example.com';
  const CLIENT = 'test-f3-client@example.com';
  const GERANT = 'test-f3-gerant@example.com';
  let adminTok = null;
  let adminId = null;
  const etrangers = { fournisseur: null, article: null };
  const supprimerComptes = async () => {
    const restes = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows;
    for (const { id } of restes) if (adminTok) await appel('DELETE', `/admin/clients/${id}`, adminTok);
    if (etrangers.article) await pool.query('DELETE FROM articles WHERE id = $1', [etrangers.article]);
    if (etrangers.fournisseur) await pool.query('DELETE FROM fournisseurs WHERE id = $1', [etrangers.fournisseur]);
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [[GERANT, CLIENT, ADMIN]]);
  };
  if (!DOSSIER) { console.error('STOCKAGE_LOCAL absent : lancer par bouchons-test'); process.exit(2); }

  try {
    // ── 0. Préparation ─────────────────────────────────────────────────────────────────────────────────────────────
    const adminExistant = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [ADMIN])).rows[0];
    if (adminExistant) await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, actif = true WHERE id = $2', [hash, adminExistant.id]);
    else await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminF3', $1, $2, 'super_admin', true)`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    adminId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [ADMIN])).rows[0].id;
    check('login super_admin temporaire', !!adminTok);
    {
      const restes = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows;
      for (const { id } of restes) await appel('DELETE', `/admin/clients/${id}`, adminTok);
      await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [[GERANT, CLIENT]]);
    }
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST-F3 Contact', email: CLIENT, telephone: '20778861', nbActivites: 2, nbLabos: 1, nbGerants: 1, montantOnboarding: 0 });
    check('création du client (2 activités, 1 labo, 1 gérant)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0].id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const tok = await login(CLIENT);
    const unites = (await appel('GET', '/api/unites', tok)).body || [];
    const unite = async (nom) => unites.find((u) => (u.name || u.nom) === nom) || (await appel('POST', '/api/unites', tok, { name: nom })).body;
    const kg = await unite('kg');
    const bouteille = await unite('bouteille');
    const litre = await unite('L');
    const gramme = await unite('g');
    const fam = (await appel('POST', '/api/familles', tok, { name: 'Famille F3' })).body;
    const cat = (await appel('POST', '/api/categories', tok, { name: 'Catégorie F3', familleId: fam?.id })).body;
    const farine = (await appel('POST', '/api/articles', tok, { name: 'Farine F3', unitId: kg?.id, categorieId: cat?.id })).body;
    const eau = (await appel('POST', '/api/articles', tok, { name: 'Eau F3', unitId: bouteille?.id, categorieId: cat?.id })).body;
    const lait = (await appel('POST', '/api/articles', tok, { name: 'Lait F3', unitId: litre?.id, categorieId: cat?.id })).body;
    const actA = (await appel('POST', '/api/entreprise/activites', tok, { nom: 'Restaurant F3' })).body;
    const actB = (await appel('POST', '/api/entreprise/activites', tok, { nom: 'Snack F3' })).body;
    const labo = (await appel('POST', '/api/labo', tok, { nom: 'Cuisine F3', refLabo: 'CF3' })).body;
    for (const a of [farine, lait]) await appel('POST', `/api/entreprise/activites/${actA?.id}/ingredients/${a?.id}/select`, tok, {});
    await appel('POST', `/api/labo/${labo?.id}/ingredients/${farine?.id}/select`, tok, {});
    r = await appel('POST', '/api/abonnements/gerants', tok, { nom: 'TEST-Gérant F3', telephone: '20778862', email: GERANT, activiteIds: [actA.id] });
    const gerantId = r.body?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, gerantId]);
    const gTok = await login(GERANT);
    const f1 = (await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'SMDA F3', activiteIds: [actA.id, actB.id], laboIds: [labo.id] })).body?.id;
    const f2 = (await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'Ben Salem F3', activiteIds: [actB.id] })).body?.id;
    check('préparation : 3 articles, 2 activités, 1 labo, gérant de A, 2 fournisseurs', !!(farine?.id && eau?.id && lait?.id && actA?.id && actB?.id && labo?.id && gTok && f1 && f2));
    etrangers.fournisseur = (await pool.query(`INSERT INTO fournisseurs (nom, client_id) VALUES ('Fournisseur d''un autre compte F3', $1) RETURNING id`, [adminId])).rows[0].id;
    etrangers.article = (await pool.query(`INSERT INTO articles (nom, unite_id, client_id) VALUES ('Article d''un autre compte F3', $1, $2) RETURNING id`, [kg.id, adminId])).rows[0].id;

    // Une appro saisie à la main chez f1 (lait) : elle nourrit « déjà acheté chez ce fournisseur ».
    r = await envoi('POST', '/api/appros/facture', tok, {
      cible: { type: 'activite', id: actA.id }, dateAppro: aujourdhui, fournisseurId: f1, refFacture: 'MAIN-1', timbreFiscal: true,
      lignes: [{ articleId: lait.id, quantite: 6, prixUnitaire: 1.45, tauxTva: 7 }],
    });
    check('0. appro saisie à la main chez SMDA (lait)', r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);

    // ── 1. Contexte de la fenêtre ───────────────────────────────────────────────────────────────────────────────────
    r = await appel('GET', `/api/correspondances/contexte?fournisseurId=${f1}&type=activite&id=${actA.id}`, tok);
    const artEau = (r.body?.articles || []).find((a) => a.id === eau.id);
    const artFarine = (r.body?.articles || []).find((a) => a.id === farine.id);
    const achatLait = (r.body?.achats || []).find((a) => a.articleId === lait.id);
    check('1. contexte : tous les articles du compte (sélectionnés ou non), unités ; aucune correspondance encore',
      r.status === 200 && artFarine?.selectionne === true && artEau?.selectionne === false && artEau?.unite === 'bouteille' && r.body.correspondances.length === 0,
      `${r.status} ${JSON.stringify(r.body)}`);
    check('1. contexte : le lait déjà acheté chez SMDA à 1,450 (saisie à la main)', approx(achatLait?.dernierPrix, 1.45) && achatLait?.nbAchats === 1, JSON.stringify(r.body?.achats));
    r = await appel('GET', `/api/correspondances/contexte?fournisseurId=${f1}&type=activite&id=${actB.id}`, gTok);
    const r1b = await appel('GET', `/api/correspondances/contexte?fournisseurId=${f1}&type=labo&id=${labo.id}`, gTok);
    check('1. gérant de A : contexte de B ou du labo → 403', r.status === 403 && r1b.status === 403, `${r.status} ${r1b.status}`);
    r = await appel('GET', `/api/correspondances/contexte?fournisseurId=${etrangers.fournisseur}&type=activite&id=${actA.id}`, tok);
    check('1. fournisseur d\'un autre compte : ignoré (aucune correspondance ni achat)', r.status === 200 && r.body.fournisseurId === null && r.body.achats.length === 0, `${r.status} ${JSON.stringify(r.body?.fournisseurId)}`);

    // ── 2. Validation ──────────────────────────────────────────────────────────────────────────────────────────────
    const validation = (m = {}) => ({
      cible: { type: 'activite', id: actA.id }, dateAppro: aujourdhui, fournisseurId: f1, refFacture: 'FV-2026-00437', timbreFiscal: true, timbreMontant: 1,
      lecture: { source: 'pdf', numero: 'FV-2026-00437', totaux: { ht: 103.8, tva: 8.466, timbre: 1, ttc: 113.266 } },
      lignes: [
        { designation: 'Farine pâtissière T45 sac 25 kg', unite: 'sac', quantite: 2, prixUnitaire: 41.5, tauxTva: 7, montant: 83, articleId: farine.id, conversion: 25 },
        { designation: 'Eau minérale 1,5 L (pack 6)', reference: 'EAU-15', unite: 'pack', quantite: 3, prixUnitaire: 3.6, tauxTva: 7, montant: 10.8, articleId: eau.id, conversion: 6 },
        { designation: 'Frais de transport', quantite: 1, prixUnitaire: 10, tauxTva: 19, montant: 10, horsStock: 'transport' },
      ],
      ...m,
    });
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation(), piece());
    const fac1 = r.body?.factureId;
    check('2. facture validée → 201 (3 lignes, 2 en stock, 1 pièce, 3 correspondances apprises)',
      r.status === 201 && r.body.nbLignes === 3 && r.body.nbStock === 2 && r.body.nbPieces === 1 && r.body.appris === 3 && approx(r.body.montantTTC, 113.266),
      `${r.status} ${JSON.stringify(r.body)}`);
    const F1 = (await pool.query('SELECT * FROM factures WHERE id = $1', [fac1])).rows[0];
    check('2. facture : validée, montants des lignes validées (HT 103,8 ; TVA 8,466 ; TTC 113,266 timbre compris), lecture gardée',
      F1?.validee_le && F1.validee_par === clientId && approx(F1.montant_ht, 103.8) && approx(F1.montant_tva, 8.466) && approx(F1.montant_ttc, 113.266) && F1.timbre_fiscal && approx(F1.montant_timbre, 1) && F1.lecture?.numero === 'FV-2026-00437',
      JSON.stringify(F1));
    const S1 = (await pool.query('SELECT ingredient_id, quantite, prix_unitaire, taux_tva, prix_unitaire_tva, fournisseur_id, ref_facture FROM stock_entreprise_daily WHERE facture_id = $1 ORDER BY ingredient_id', [fac1])).rows;
    const sFarine = S1.find((s) => s.ingredient_id === farine.id);
    const sEau = S1.find((s) => s.ingredient_id === eau.id);
    check('2. stock : farine 50 kg à 1,660 (2 sacs × 25) ; eau 18 bouteilles à 0,600 (3 packs × 6) ; TTC de la ligne au taux',
      S1.length === 2 && approx(sFarine?.quantite, 50) && approx(sFarine?.prix_unitaire, 1.66) && approx(sFarine?.prix_unitaire_tva, 1.776)
      && approx(sEau?.quantite, 18) && approx(sEau?.prix_unitaire, 0.6) && sEau?.fournisseur_id === f1 && sEau?.ref_facture === 'FV-2026-00437',
      JSON.stringify(S1));
    const L1 = (await pool.query('SELECT * FROM factures_lignes WHERE facture_id = $1 ORDER BY rang', [fac1])).rows;
    check('2. lignes validées : montants exacts, conversion, hors stock gardé sans stock',
      L1.length === 3 && L1[0].article_id === farine.id && approx(L1[0].conversion, 25) && approx(L1[0].quantite_stock, 50) && L1[0].stock_entreprise_id
      && L1[2].nature_hors_stock === 'transport' && L1[2].article_id === null && L1[2].stock_entreprise_id === null && approx(L1[2].montant_ht, 10),
      JSON.stringify(L1.map((l) => [l.designation, l.article_id, l.nature_hors_stock, l.conversion])));
    const selEau = (await pool.query('SELECT 1 FROM activite_ingredient_selections WHERE activite_id = $1 AND ingredient_id = $2', [actA.id, eau.id])).rows.length;
    check('2. l\'eau, non sélectionnée dans A, y est ajoutée', selEau === 1);
    const C1 = (await pool.query('SELECT cle, article_id, nature_hors_stock, conversion, emplois FROM correspondances WHERE client_id = $1 AND fournisseur_id = $2 ORDER BY cle', [clientId, f1])).rows;
    check('2. correspondances apprises : clé = réf. produit sinon désignation normalisée',
      C1.length === 3 && C1.some((c) => c.cle === 'ref:EAU15' && c.article_id === eau.id && approx(c.conversion, 6))
      && C1.some((c) => c.cle === 'des:farine patissiere t45 sac 25 kg' && c.article_id === farine.id && approx(c.conversion, 25))
      && C1.some((c) => c.cle === 'des:frais de transport' && c.nature_hors_stock === 'transport'),
      JSON.stringify(C1));
    const P1 = (await pool.query('SELECT cle FROM factures_pieces WHERE facture_id = $1', [fac1])).rows;
    const J1 = (await pool.query(`SELECT details FROM factures_journal WHERE facture_id = $1 AND action = 'facture_validee'`, [fac1])).rows;
    check('2. pièce déposée dans le stockage ; journal « facture_validee »', P1.length === 1 && existe(P1[0].cle) && J1.length === 1 && J1[0].details.appris === 3, JSON.stringify(J1));

    // ── 3. Doublons ────────────────────────────────────────────────────────────────────────────────────────────────
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: ' fv-2026-0 0437 ', confirmerDoublon: true }), piece());
    check('3. même numéro (espaces et casse près) chez le même fournisseur, même confirmé → 409 FACTURE_VALIDEE_EXISTANTE', r.status === 409 && r.body?.code === 'FACTURE_VALIDEE_EXISTANTE', `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', '/api/appros/facture', tok, {
      cible: { type: 'activite', id: actA.id }, dateAppro: aujourdhui, fournisseurId: f1, refFacture: 'FV-2026-00437', confirmerDoublon: true,
      lignes: [{ articleId: farine.id, quantite: 1, prixUnitaire: 1, tauxTva: 0 }],
    });
    check('3. saisie à la main du numéro d\'une facture validée, même confirmée → 409 FACTURE_VALIDEE_EXISTANTE', r.status === 409 && r.body?.code === 'FACTURE_VALIDEE_EXISTANTE', `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ fournisseurId: f2, refFacture: 'FV-2026-00437', cible: { type: 'activite', id: actB.id } }), piece());
    check('3. même numéro chez un AUTRE fournisseur → 201', r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);
    const facAutre = r.body?.factureId;
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'MAIN-1' }), piece());
    const r3b = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'MAIN-1', confirmerDoublon: true }), piece());
    const facMainValidee = r3b.body?.factureId;
    const nMain = (await pool.query(`SELECT COUNT(*)::int AS n FROM factures WHERE client_id = $1 AND ref_facture = 'MAIN-1'`, [clientId])).rows[0].n;
    check('3. numéro d\'une facture saisie à la main → 409 FACTURE_EXISTANTE, puis 201 confirmé (facture à part, jamais fusionnée)',
      r.status === 409 && r.body?.code === 'FACTURE_EXISTANTE' && r3b.status === 201 && nMain === 2, `${r.status} ${r3b.status} n=${nMain}`);
    {
      const [x, y] = await Promise.all([1, 2].map(() => envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'CONC-1' }), piece())));
      const statuts = [x.status, y.status].sort().join(',');
      const n = (await pool.query(`SELECT COUNT(*)::int AS n FROM factures WHERE client_id = $1 AND ref_facture = 'CONC-1'`, [clientId])).rows[0].n;
      const orphelins = (await pool.query(`SELECT COUNT(*)::int AS n FROM factures_pieces p JOIN factures f ON f.id = p.facture_id WHERE f.client_id = $1 AND f.ref_facture = 'CONC-1'`, [clientId])).rows[0].n;
      check('3. deux validations simultanées du même numéro : un 201, un 409, une seule facture', statuts === '201,409' && n === 1 && orphelins === 1, `${statuts} n=${n}`);
    }

    // ── 4. Verrous ─────────────────────────────────────────────────────────────────────────────────────────────────
    const ligneStock = (await pool.query('SELECT id FROM stock_entreprise_daily WHERE facture_id = $1 AND ingredient_id = $2', [fac1, farine.id])).rows[0].id;
    r = await appel('PUT', `/api/stock/historique/${ligneStock}`, tok, { quantite: 1, prixUnitaire: 1, fournisseurId: f1, refFacture: 'X', isEntreprise: true });
    const r4b = await appel('DELETE', `/api/stock/historique/${ligneStock}?isEntreprise=true&confirmerFacture=1`, tok);
    check('4. historique : modifier ou supprimer une ligne d\'une facture validée → 409 FACTURE_VALIDEE', r.status === 409 && r.body?.code === 'FACTURE_VALIDEE' && r4b.status === 409 && r4b.body?.code === 'FACTURE_VALIDEE', `${r.status} ${r4b.status}`);
    r = await appel('GET', `/api/stock/historique?activiteId=${actA.id}`, tok);
    const histo = (r.body || []).filter((h) => h.refFacture === 'FV-2026-00437');
    const histoMain = (r.body || []).find((h) => h.refFacture === 'MAIN-1' && h.ingredientId === lait.id && !h.factureValidee);
    check('4. historique : les lignes de la facture validée portent factureValidee, pas celles saisies à la main', histo.length === 2 && histo.every((h) => h.factureValidee === true) && !!histoMain, JSON.stringify(histo));
    r = await envoi('POST', `/api/factures/${fac1}/pieces`, tok, {}, piece());
    const pId = (await pool.query('SELECT id FROM factures_pieces WHERE facture_id = $1', [fac1])).rows[0].id;
    const r4c = await envoi('PUT', `/api/factures/${fac1}/pieces/${pId}`, tok, {}, piece());
    const r4d = await appel('DELETE', `/api/factures/${fac1}/pieces/${pId}`, tok);
    check('4. pièces d\'une facture validée : joindre, remplacer, supprimer → 409 FACTURE_VALIDEE', [r, r4c, r4d].every((x) => x.status === 409 && x.body?.code === 'FACTURE_VALIDEE'), `${r.status} ${r4c.status} ${r4d.status}`);
    r = await appel('DELETE', `/api/stock/entreprise/${actA.id}/${farine.id}/all-history`, tok);
    const encore = (await pool.query('SELECT COUNT(*)::int AS n FROM stock_entreprise_daily WHERE facture_id = $1', [fac1])).rows[0].n;
    check('4. effacer tout l\'historique d\'un article : refusé (409 FACTURE_VALIDEE), lignes de la facture validée intactes', encore === 2 && r.status === 409 && r.body?.code === 'FACTURE_VALIDEE', `${r.status} n=${encore}`);
    r = await appel('GET', `/api/factures?activiteId=${actA.id}`, tok);
    const vue = (r.body || []).find((f) => f.id === fac1);
    const main = (r.body || []).find((f) => f.refFacture === 'MAIN-1' && !f.validee);
    check('4. liste des factures : validee, valideeLe ; une facture saisie à la main ne l\'est pas', vue?.validee === true && !!vue.valideeLe && !!main, JSON.stringify(vue));
    r = await appel('GET', `/api/factures/${fac1}/lignes-validees`, tok);
    check('4. lignes validées : article et unité de stock, conversion, hors stock',
      r.status === 200 && r.body.length === 3 && r.body[0].articleNom === 'Farine F3' && r.body[0].uniteStock === 'kg' && r.body[0].conversion === 25 && r.body[2].horsStock === 'transport',
      `${r.status} ${JSON.stringify(r.body)}`);

    // ── 5. Deuxième facture : ce qui est appris ; la dernière décision l'emporte ────────────────────────────────────────
    r = await appel('GET', `/api/correspondances/contexte?fournisseurId=${f1}&type=activite&id=${actA.id}`, tok);
    const coEau = (r.body?.correspondances || []).find((c) => c.cle === 'ref:EAU15');
    check('5. contexte : correspondances de SMDA (article, nom, unité de stock, conversion)', coEau?.articleId === eau.id && coEau.articleNom === 'Eau F3' && coEau.uniteStock === 'bouteille' && coEau.conversion === 6, JSON.stringify(coEau));
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({
      refFacture: 'FV-2026-00474',
      lignes: [{ designation: 'Eau minérale 1,5L pack', reference: 'eau 15', quantite: 2, tauxTva: 7, montant: 7.2, articleId: eau.id, conversion: 12 }],
    }), piece());
    const coEau2 = (await pool.query(`SELECT conversion, emplois, designation FROM correspondances WHERE client_id = $1 AND fournisseur_id = $2 AND cle = 'ref:EAU15'`, [clientId, f1])).rows[0];
    check('5. même référence lue autrement (« eau 15 ») : même correspondance, décision changée (conversion 12) ⇒ compteur repart à 1, désignation à jour',
      r.status === 201 && coEau2?.emplois === 1 && approx(coEau2.conversion, 12) && coEau2.designation === 'Eau minérale 1,5L pack', `${r.status} ${JSON.stringify(coEau2)} avant ${coEau?.emplois}`);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({
      refFacture: 'FV-2026-00475',
      lignes: [{ designation: 'Eau minérale 1,5L pack', reference: 'EAU15', quantite: 1, tauxTva: 7, montant: 3.6, articleId: eau.id, conversion: 12 }],
    }), piece());
    const coEau3 = (await pool.query(`SELECT emplois FROM correspondances WHERE client_id = $1 AND fournisseur_id = $2 AND cle = 'ref:EAU15'`, [clientId, f1])).rows[0];
    check('5. même décision confirmée par une autre facture ⇒ 2', r.status === 201 && coEau3?.emplois === 2, `${r.status} ${JSON.stringify(coEau3)}`);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({
      refFacture: 'FV-2026-00476',
      lignes: [{ designation: 'Farine corrigée à la main', designationLue: 'FARlNE PATISSIERE LUE', quantite: 1, tauxTva: 7, montant: 41.5, articleId: farine.id, conversion: 25 }],
    }), piece());
    const coLue = (await pool.query(`SELECT designation FROM correspondances WHERE client_id = $1 AND fournisseur_id = $2 AND cle = 'des:farlne patissiere lue'`, [clientId, f1])).rows[0];
    check('5. clé apprise sur le texte LU (la désignation corrigée est seulement affichée)', r.status === 201 && coLue?.designation === 'Farine corrigée à la main', `${r.status} ${JSON.stringify(coLue)}`);

    // ── 6. Gérant ──────────────────────────────────────────────────────────────────────────────────────────────────
    r = await envoi('POST', '/api/appros/facture/validee', gTok, validation({ refFacture: 'G-1' }), piece());
    const facG = r.body?.factureId;
    const r6b = await envoi('POST', '/api/appros/facture/validee', gTok, validation({ refFacture: 'G-2', cible: { type: 'activite', id: actB.id } }), piece());
    check('6. gérant de A : valide sur A → 201 ; sur B → 403', r.status === 201 && r6b.status === 403, `${r.status} ${r6b.status}`);
    r = await envoi('POST', '/api/appros/facture/validee', gTok, validation({ refFacture: 'G-3', fournisseurId: f2 }), piece());
    check('6. gérant de A : fournisseur non rattaché à A (Ben Salem) → 403 FOURNISSEUR_HORS_PERIMETRE (il n\'apprend pas pour lui)', r.status === 403 && r.body?.code === 'FOURNISSEUR_HORS_PERIMETRE', `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('GET', '/api/correspondances', gTok);
    const fournisseursVus = new Set((r.body || []).map((c) => c.fournisseurId));
    check('6. gérant : correspondances des fournisseurs de ses lieux seulement (SMDA oui, Ben Salem non)', r.status === 200 && fournisseursVus.has(f1) && !fournisseursVus.has(f2), JSON.stringify([...fournisseursVus]));
    const coF2 = (await pool.query('SELECT id FROM correspondances WHERE fournisseur_id = $1 LIMIT 1', [f2])).rows[0]?.id;
    r = await appel('PATCH', `/api/correspondances/${coF2}`, gTok, { horsStock: 'autre' });
    const r6d = await appel('DELETE', `/api/correspondances/${coF2}`, gTok);
    check('6. gérant : corriger ou oublier une correspondance de Ben Salem → 404', r.status === 404 && r6d.status === 404, `${r.status} ${r6d.status}`);
    r = await appel('DELETE', `/api/factures/${facAutre}`, gTok);
    check('6. gérant : supprimer une facture de B → 404', r.status === 404, `${r.status}`);

    // ── 7. Refus ───────────────────────────────────────────────────────────────────────────────────────────────────
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'R-1' }));
    check('7. sans la pièce → 400 PIECE_REQUISE', r.status === 400 && r.body?.code === 'PIECE_REQUISE', `${r.status}`);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'R-2', lignes: [{ designation: 'X', quantite: 1, montant: 1, articleId: etrangers.article }] }), piece());
    check('7. article d\'un autre compte → 400 ARTICLE_INCONNU', r.status === 400 && r.body?.code === 'ARTICLE_INCONNU', `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'R-5', lignes: [
      { designation: 'Transport', quantite: 1, montant: 5, horsStock: 'transport' },
      { designation: 'X', quantite: 1, montant: 1, articleId: etrangers.article },
    ] }), piece());
    check('7. n° de ligne du refus = rang dans la facture (ligne 2, pas 1)', r.status === 400 && r.body?.ligne === 2 && /^Ligne 2/.test(r.body.message), `${r.status} ${JSON.stringify(r.body)}`);
    const sel = (await appel('POST', '/api/articles', tok, { name: 'Sel F3', unitId: gramme?.id })).body;
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'R-6', lignes: [{ designation: 'Sel fin 1 kg', quantite: 1, montant: 0.45, articleId: sel.id, conversion: 1000 }] }), piece());
    check('7. prix par g arrondi au millime (0,00045) → 400 PRIX_TROP_PETIT (la valeur du stock serait faussée)', r.status === 400 && r.body?.code === 'PRIX_TROP_PETIT', `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'R-7', lignes: [{ designation: 'X', quantite: 0.001, montant: 9000, tauxTva: 19, articleId: farine.id, conversion: 1 }] }), piece());
    check('7. prix TTC hors des limites de la colonne → 400 (avant : erreur serveur)', r.status === 400, `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'R-3', fournisseurId: etrangers.fournisseur }), piece());
    check('7. fournisseur d\'un autre compte → 400 FOURNISSEUR_INCONNU', r.status === 400 && r.body?.code === 'FOURNISSEUR_INCONNU', `${r.status}`);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'R-4', fournisseurId: null }), piece());
    check('7. sans fournisseur → 400 FOURNISSEUR_REQUIS', r.status === 400 && r.body?.code === 'FOURNISSEUR_REQUIS', `${r.status}`);
    const restes = (await pool.query(`SELECT COUNT(*)::int AS n FROM factures WHERE client_id = $1 AND ref_facture LIKE 'R-%'`, [clientId])).rows[0].n;
    check('7. aucun refus n\'a laissé de facture', restes === 0, `n=${restes}`);

    // ── 8. Labo ────────────────────────────────────────────────────────────────────────────────────────────────────
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'L-1', cible: { type: 'labo', id: labo.id }, remiseGlobale: 9.38, fodec: 0.844 }), piece());
    const facL = r.body?.factureId;
    const SL = (await pool.query('SELECT ingredient_id, quantite, prix_unitaire FROM stock_labo_daily WHERE facture_id = $1 ORDER BY ingredient_id', [facL])).rows;
    const FL = (await pool.query('SELECT montant_ht, montant_fodec, remise_globale, labo_id FROM factures WHERE id = $1', [facL])).rows[0];
    const selL = (await pool.query('SELECT 1 FROM labo_ingredient_selections WHERE labo_id = $1 AND ingredient_id = $2', [labo.id, eau.id])).rows.length;
    // brut 103,8 ; remise 9,38 → nets × (94,42 / 103,8) ; FODEC 0,844 au prorata du net
    const coutFarine = (83 - 9.38 * 83 / 103.8) * (1 + 0.844 / 94.42);
    check('8. labo : lignes de stock du labo, remise globale et FODEC répartis dans le coût, eau sélectionnée dans le labo',
      r.status === 201 && SL.length === 2 && approx(SL.find((s) => s.ingredient_id === farine.id)?.prix_unitaire, Math.round(coutFarine / 50 * 1000) / 1000)
      && approx(FL.montant_ht, 94.42) && approx(FL.montant_fodec, 0.844) && approx(FL.remise_globale, 9.38) && FL.labo_id === labo.id && selL === 1,
      `${r.status} ${JSON.stringify(SL)} ${JSON.stringify(FL)}`);
    const ligneLabo = (await pool.query('SELECT id FROM stock_labo_daily WHERE facture_id = $1 LIMIT 1', [facL])).rows[0].id;
    r = await appel('PUT', `/api/labo/${labo.id}/historique/${ligneLabo}`, tok, { quantite: 1, prixUnitaire: 1, fournisseurId: f1, refFacture: 'L-1' });
    const r8b = await appel('DELETE', `/api/labo/${labo.id}/historique/${ligneLabo}?confirmerFacture=1`, tok);
    const r8c = await appel('GET', `/api/labo/${labo.id}/historique`, tok);
    check('8. historique du labo : 409 FACTURE_VALIDEE en modification et suppression ; factureValidee à la lecture',
      r.status === 409 && r.body?.code === 'FACTURE_VALIDEE' && r8b.status === 409 && (r8c.body || []).filter((h) => h.refFacture === 'L-1').every((h) => h.factureValidee === true),
      `${r.status} ${r8b.status}`);

    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'D-1', timbreFiscal: false, lignes: [
      { designation: 'Eau minérale pack', quantite: 2, montant: 7.2, tauxTva: 0, articleId: eau.id, conversion: 6 },
      { designation: 'Déconsigne casier', quantite: 4, prixUnitaire: -6, montant: -24, tauxTva: 0, horsStock: 'consigne' },
      { designation: 'Consigne casier', quantite: 5, prixUnitaire: 6, montant: 30, tauxTva: 0, horsStock: 'consigne' },
    ] }), piece());
    const FD = r.body?.factureId ? (await pool.query('SELECT montant_ht, montant_ttc FROM factures WHERE id = $1', [r.body.factureId])).rows[0] : null;
    check('8. déconsigne (ligne hors stock négative) admise : HT 13,2', r.status === 201 && approx(FD?.montant_ht, 13.2) && approx(FD?.montant_ttc, 13.2), `${r.status} ${JSON.stringify(r.body)} ${JSON.stringify(FD)}`);

    // ── 8 bis. Anciennes routes, PDF, année, suppression d'un lieu ──────────────────────────────────────────────────
    r = await appel('PUT', `/api/stock/entreprise/${actA.id}/${farine.id}`, tok, { quantite: 1, prixUnitaire: 1, dateAppro: aujourdhui, fournisseurId: f1, refFacture: 'fv-2026-00437', tauxTva: 0 });
    check('8. ancienne route article par article : n° d\'une facture validée → 409 FACTURE_VALIDEE_EXISTANTE', r.status === 409 && r.body?.code === 'FACTURE_VALIDEE_EXISTANTE', `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('GET', `/api/factures/${fac1}/pdf`, tok);
    check('8. PDF fabriqué d\'une facture validée → 409 (sa pièce fait foi)', r.status === 409 && r.body?.code === 'FACTURE_VALIDEE', `${r.status}`);
    const anDernier = `${Number(aujourdhui.slice(0, 4)) - 1}-12-15`;
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'FV-2026-00437', dateAppro: anDernier }), piece());
    const rAnnee = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'FV-2026-00437', dateAppro: anDernier, confirmerDoublon: true }), piece());
    check('8. même n° l\'année précédente : avertissement (409 FACTURE_EXISTANTE) puis 201 confirmé', r.status === 409 && r.body?.code === 'FACTURE_EXISTANTE' && rAnnee.status === 201, `${r.status} ${rAnnee.status}`);
    for (const a of [farine, eau]) await appel('POST', `/api/entreprise/activites/${actB.id}/ingredients/${a.id}/select`, tok, {});
    const selB = (await pool.query('SELECT COUNT(*)::int AS n FROM activite_ingredient_selections WHERE activite_id = $1', [actB.id])).rows[0].n;
    r = await appel('DELETE', `/api/entreprise/activites/${actB.id}`, tok);
    check('8. supprimer une activité qui porte une facture validée → 409 FACTURE_VALIDEE (ses lignes partiraient en cascade)', selB === 0 && r.status === 409 && r.body?.code === 'FACTURE_VALIDEE', `sel=${selB} ${r.status} ${JSON.stringify(r.body)}`);

    // ── 9. Suppression d'une facture validée ───────────────────────────────────────────────────────────────────────
    const coAvant = (await pool.query('SELECT COUNT(*)::int AS n FROM correspondances WHERE client_id = $1 AND fournisseur_id = $2', [clientId, f1])).rows[0].n;
    const clesG = (await pool.query('SELECT cle FROM factures_pieces WHERE facture_id = $1', [facG])).rows.map((p) => p.cle);
    r = await appel('DELETE', `/api/factures/${facG}`, gTok);
    const resteG = (await pool.query('SELECT (SELECT COUNT(*)::int FROM factures WHERE id = $1) AS f, (SELECT COUNT(*)::int FROM stock_entreprise_daily WHERE facture_id = $1) AS s, (SELECT COUNT(*)::int FROM factures_lignes WHERE facture_id = $1) AS l', [facG])).rows[0];
    const journalG = (await pool.query(`SELECT details FROM factures_journal WHERE client_id = $1 AND action = 'facture_supprimee' AND details->>'factureId' = $2`, [clientId, String(facG)])).rows[0];
    check('9. gérant de A : supprime sa facture validée en entier (stock, lignes, pièce effacée, journal)',
      r.status === 200 && resteG.f === 0 && resteG.s === 0 && resteG.l === 0 && clesG.length === 1 && !existe(clesG[0]) && journalG?.details?.motif === 'facture_validee_supprimee',
      `${r.status} ${JSON.stringify(resteG)}`);
    const coApres = (await pool.query('SELECT COUNT(*)::int AS n FROM correspondances WHERE client_id = $1 AND fournisseur_id = $2', [clientId, f1])).rows[0].n;
    check('9. les correspondances apprises restent', coApres === coAvant && coAvant >= 4, `n=${coApres} avant ${coAvant}`);
    r = await envoi('POST', '/api/appros/facture/validee', gTok, validation({ refFacture: 'G-1' }), piece());
    check('9. la facture supprimée se dépose de nouveau → 201', r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);
    const facMain = (await pool.query(`SELECT id FROM factures WHERE client_id = $1 AND ref_facture = 'MAIN-1' AND validee_le IS NULL`, [clientId])).rows[0].id;
    r = await appel('DELETE', `/api/factures/${facMain}`, tok);
    check('9. une facture saisie à la main ne se supprime pas d\'un bloc → 409 FACTURE_NON_VALIDEE', r.status === 409 && r.body?.code === 'FACTURE_NON_VALIDEE', `${r.status}`);
    r = await appel('DELETE', `/api/factures/${facL}`, tok);
    const resteL = (await pool.query('SELECT COUNT(*)::int AS n FROM stock_labo_daily WHERE facture_id = $1', [facL])).rows[0].n;
    check('9. facture validée du labo supprimée : ses lignes de stock du labo aussi', r.status === 200 && resteL === 0, `${r.status} n=${resteL}`);
    r = await appel('DELETE', `/api/factures/${facMainValidee}`, tok);
    check('9. client : supprime une facture validée de A', r.status === 200, `${r.status}`);

    // ── 10. Page « Correspondances » ───────────────────────────────────────────────────────────────────────────────
    r = await appel('GET', `/api/correspondances?fournisseurId=${f1}`, tok);
    const coTransport = (r.body || []).find((c) => c.cle === 'des:frais de transport');
    check('10. liste filtrée par fournisseur : nom du fournisseur, auteur', r.status === 200 && r.body.length >= 4 && r.body.every((c) => c.fournisseurNom === 'SMDA F3') && !!coTransport?.auteurNom, `${r.status} ${JSON.stringify(r.body?.[0])}`);
    r = await appel('PATCH', `/api/correspondances/${coTransport.id}`, tok, { articleId: lait.id, conversion: 1 });
    const r10b = await appel('PATCH', `/api/correspondances/${coTransport.id}`, tok, { articleId: lait.id, conversion: 0 });
    const r10c = await appel('PATCH', `/api/correspondances/${coTransport.id}`, tok, { articleId: etrangers.article });
    const r10d = await appel('PATCH', `/api/correspondances/${coTransport.id}`, tok, {});
    check('10. corriger : article → 200 (nom et unité de l\'article rendus, compteur à 0) ; conversion 0, article d\'un autre compte, rien → 400',
      r.status === 200 && r.body.articleId === lait.id && r.body.articleNom === 'Lait F3' && r.body.uniteStock === 'L' && r.body.emplois === 0 && r.body.horsStock === null && r10b.status === 400 && r10c.status === 400 && r10d.status === 400,
      `${r.status} ${r10b.status} ${r10c.status} ${r10d.status}`);
    r = await appel('PATCH', `/api/correspondances/${coTransport.id}`, tok, { horsStock: 'livraison' });
    check('10. corriger : hors stock « livraison » → 200, article retiré', r.status === 200 && r.body.horsStock === 'livraison' && r.body.articleId === null, JSON.stringify(r.body));
    r = await appel('DELETE', `/api/correspondances/${coTransport.id}`, tok);
    const parti = (await pool.query('SELECT COUNT(*)::int AS n FROM correspondances WHERE id = $1', [coTransport.id])).rows[0].n;
    check('10. oublier → 200, supprimée', r.status === 200 && parti === 0, `${r.status}`);
    r = await appel('PATCH', '/api/correspondances/abc', tok, { horsStock: 'autre' });
    check('10. identifiant non numérique → 404', r.status === 404, `${r.status}`);
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
