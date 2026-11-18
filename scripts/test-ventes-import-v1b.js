/* Test E2E local — V1b « Tout fichier de caisse, journées et documents » (labflow-reprise/ventes-cartes/
 * PLAN-VENTES-CARTES.md §5 bis).
 *   import d'un CSV dont les colonnes ont été désignées : le modèle du fichier est retenu ; liste des journées importées ;
 *   document d'origine conservé (même empreinte que le fichier lu, stockage privé, téléchargement) ; ventes saisies à la
 *   main le même jour signalées ; REMPLACER une journée (ventes de l'ancien import effacées, stock rendu, document sorti
 *   du stockage ; un remplacement refusé laisse l'ancien import entier) ; ANNULER un import (la journée redevient
 *   importable, ce qui a été appris est gardé) ; l'annulation d'une vente à la main suit le même service ; refus : sans
 *   connexion, autre compte, modèle incohérent ; migration 264 rejouable.
 * Crée un super_admin et un client temporaires (mot de passe tiré au hasard), puis nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué, stockage des
 * fichiers dans un dossier du poste — le même ici et dans le serveur, posé par scripts/lib/bouchons-test.js). */
require('./lib/bouchons-test').installer();
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
const DOSSIER = process.env.STOCKAGE_LOCAL;

(async () => {
  if (!DOSSIER) { console.error('STOCKAGE_LOCAL absent : lancer par bouchons-test'); process.exit(2); }
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-import-v1b@example.com';
  const CLIENT = 'test-client-import-v1b@example.com';
  let adminTok = null;
  let clientId = null;
  const prestasCrees = [];
  const wipe = async () => {
    const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
    if (client && !adminTok && (await pool.query('UPDATE utilisateurs SET mot_de_passe = $2 WHERE email = $1', [ADMIN, hash])).rowCount) adminTok = await login(ADMIN);
    if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    for (const id of prestasCrees) if (adminTok) await appel('DELETE', `/api/admin/prestataires/${id}`, adminTok);
    await pool.query(`DELETE FROM prestataires_livraison WHERE nom LIKE 'TEST Presta V1B%'`).catch(() => {});
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
       VALUES ('TEST Admin V1B', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    check('connexion admin', !!adminTok);
    const A = (m, p, b) => appel(m, p, adminTok, b);

    let r = await A('POST', '/admin/clients', { nom: 'TEST Client V1B', email: CLIENT, telephone: '20 555 264', nbActivites: 1, nbLabos: 0, nbGerants: 0, formuleActivites: 'premium', montantOnboarding: 0 });
    check('création du client LabFlow (formule Premium)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const tok = await login(CLIENT);
    check('connexion du client', !!tok);
    const C = (m, p, b) => appel(m, p, tok, b);

    let act = (await C('GET', '/api/entreprise/activites')).body?.[0];
    if (!act) act = (await C('POST', '/api/entreprise/activites', { nom: 'Restaurant V1B' })).body;
    for (const nom of ['TEST Presta V1B a', 'TEST Presta V1B b']) {
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
    const fam = await C('POST', '/api/familles', { name: 'TEST-Fam V1B' });
    const cat = await C('POST', '/api/categories', { name: 'TEST-Cat V1B', familleId: fam.body?.id });
    const article = async (name) => (await C('POST', '/api/articles', { name, unitId: kg.id, categorieId: cat.body?.id })).body;
    const farine = await article('Farine TEST V1B');
    const fromage = await article('Fromage TEST V1B');
    const boite = await article('Boîte TEST V1B');
    const cp = (await C('POST', '/api/categories-produit', { name: 'Pizzas TEST V1B', typeProduit: 'vendable' })).body;
    const creerProduit = async (nom, ingredients) => C('POST', '/api/produits', { nom, type: 'vendable', origine: 'activite', categorieProduitId: cp.id, activiteIds: [act.id], ingredients, subProducts: [] });
    r = await creerProduit('Pizza TEST V1B', [{ ingredientId: farine.id, portion: 0.2 }, { ingredientId: fromage.id, portion: 0.1 }]);
    const P = r.body;
    check('produit d\'origine créé avec sa recette', r.status === 201 && !!P?.id && !!P.refProduit, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    const P2 = (await creerProduit('Salade TEST V1B', [{ ingredientId: fromage.id, portion: 0.05 }])).body;

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

    const JOUR = (date) => C('GET', `/api/ventes/imports/jour?activiteId=${act.id}&date=${date}`);
    const LISTE = () => C('GET', `/api/ventes/imports?activiteId=${act.id}`);
    const octets = async (methode, chemin, jeton, corps) => {
      const rep = await fetch(`${BASE}${chemin}`, {
        method: methode,
        headers: { ...(corps ? { 'Content-Type': 'application/octet-stream' } : {}), ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
        body: corps,
      });
      const buf = Buffer.from(await rep.arrayBuffer());
      let body = null;
      try { body = JSON.parse(buf.toString('utf8')); } catch (_) { /* pas du JSON : un document */ }
      return { status: rep.status, body, buf, type: rep.headers.get('content-type'), disposition: rep.headers.get('content-disposition') };
    };
    const etatDe = async (id) => (await pool.query('SELECT statut, remplace_par, annule_par, (annule_le IS NOT NULL) AS annule, document_cle, document_taille FROM ventes_imports WHERE id = $1', [id])).rows[0];
    const nbVentes = async (importId) => (await pool.query('SELECT COUNT(*)::int AS n FROM ventes WHERE import_id = $1', [importId])).rows[0].n;
    const surDisque = (cle) => fs.existsSync(path.join(DOSSIER, ...cle.split('/')));
    const pres = (a, b) => Math.abs(a - b) < 1e-6;

    const J1 = jour(1);
    const csv = Buffer.from('Produit;Qte;Total\nPizza reine;10;200\nSalade verte;7;61,1\nPizza reine livraison;16;400\n', 'utf8');
    const modele = { signature: 'produit|qte|total', colonnes: { designation: 1, quantite: 2, montant: 3 } };
    const lignes1 = [
      { categorie: null, designation: 'Pizza reine', quantite: 10, montant: 200, article_type: 'produit', article_id: P.id, repartition: [{ canal: 'directe', quantite: 10 }] },
      { categorie: null, designation: 'Salade verte', quantite: 7, montant: 61.1, article_type: 'produit', article_id: P2.id, repartition: [{ canal: 'directe', quantite: 7 }] },
      { categorie: null, designation: 'Pizza reine livraison', quantite: 16, montant: 400, article_type: 'produit', article_id: P.id, repartition: [{ canal: lienA, quantite: 12 }, { canal: lienB, quantite: 4 }] },
    ];
    const fichierCsv = { date_vente: J1, source: 'csv', fichier_nom: 'caisse du jour é.csv', empreinte: crypto.createHash('sha256').update(csv).digest('hex'), modele: 'Colonnes désignées', colonnes: modele, categories: [], lignes: lignes1 };

    // ── 1. Avant tout import ──
    r = await JOUR(J1);
    check('journée vierge : ni import, ni vente saisie', r.status === 200 && r.body.import === null && r.body.saisies.nombre === 0 && r.body.saisies.total === 0, `${r.status} ${JSON.stringify(r.body)}`);
    r = await LISTE();
    check('liste des journées importées vide', r.status === 200 && Array.isArray(r.body.imports) && r.body.imports.length === 0, `${r.status} ${JSON.stringify(r.body)}`);
    r = await IMPORT({ ...fichierCsv, colonnes: { signature: 'x', colonnes: { designation: 1, quantite: 1, montant: 3 } } });
    check('modèle de colonnes incohérent (deux rôles sur la même colonne) → 400 MODELE_INVALIDE', r.status === 400 && r.body?.code === 'MODELE_INVALIDE', `${r.status} ${r.body?.code}`);
    r = await IMPORT({ ...fichierCsv, colonnes: { signature: 'x', colonnes: { designation: 1, quantite: 2 } } });
    check('modèle sans montant ni prix → 400 MODELE_INVALIDE', r.status === 400 && r.body?.code === 'MODELE_INVALIDE', `${r.status} ${r.body?.code}`);

    // ── 2. Import d'un CSV dont les colonnes ont été désignées ──
    r = await IMPORT(fichierCsv);
    const imp1 = r.body?.import;
    check('import d\'un CSV → 201 : trois ventes, rien de remplacé', r.status === 201 && r.body.ventes.length === 3 && imp1?.total_enregistre === 661.1 && r.body.remplace === null && !('documentsAEffacer' in r.body),
      `${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
    r = await CONTEXTE();
    check('modèle du fichier retenu pour l\'activité (ligne de titres et colonnes)', r.status === 200 && r.body.modeles.length === 1 && r.body.modeles[0].signature === 'produit|qte|total'
      && r.body.modeles[0].colonnes.designation === 1 && r.body.modeles[0].colonnes.quantite === 2 && r.body.modeles[0].colonnes.montant === 3 && Object.keys(r.body.modeles[0].colonnes).length === 3, JSON.stringify(r.body?.modeles));
    check('stock sorti : farine 26 × 0,2 ; fromage 26 × 0,1 + 7 × 0,05', pres(await sortie(farine.id, J1), -5.2) && pres(await sortie(fromage.id, J1), -2.95), `${await sortie(farine.id, J1)} ${await sortie(fromage.id, J1)}`);
    r = await LISTE();
    const vu = r.body?.imports?.[0];
    check('liste : la journée, son fichier, son chiffre, ses trois ventes, pas encore de document',
      r.status === 200 && r.body.imports.length === 1 && vu.id === imp1.id && vu.date_vente === J1 && vu.source === 'csv' && vu.fichier_nom === 'caisse du jour é.csv'
        && vu.total_enregistre === 661.1 && vu.nb_lignes === 3 && vu.ventes === 3 && vu.document === false && vu.auteur === 'TEST Client V1B', JSON.stringify(vu));

    // ── 3. Le document d'origine ──
    r = await octets('POST', `/api/ventes/imports/${imp1.id}/document`, tok, Buffer.from('Produit;Qte;Total\nAutre;1;1\n'));
    check('document différent du fichier lu → 400 DOCUMENT_DIFFERENT', r.status === 400 && r.body?.code === 'DOCUMENT_DIFFERENT', `${r.status} ${r.body?.code}`);
    r = await octets('POST', `/api/ventes/imports/${imp1.id}/document`, null, csv);
    check('document sans connexion → 401', r.status === 401, String(r.status));
    r = await octets('POST', '/api/ventes/imports/999999999/document', tok, csv);
    check('document d\'un import inconnu → 404', r.status === 404 && r.body?.code === 'IMPORT_INTROUVABLE', `${r.status} ${r.body?.code}`);
    r = await octets('GET', `/api/ventes/imports/${imp1.id}/document`, tok);
    check('aucun document encore → 404 DOCUMENT_ABSENT', r.status === 404 && r.body?.code === 'DOCUMENT_ABSENT', `${r.status} ${r.body?.code}`);
    r = await octets('POST', `/api/ventes/imports/${imp1.id}/document`, tok, csv);
    check('le fichier lu (même empreinte) → 201, conservé', r.status === 201 && r.body?.depose === true, `${r.status} ${JSON.stringify(r.body)}`);
    const doc1 = await etatDe(imp1.id);
    check('document dans le stockage privé, sous une clé fabriquée par le serveur', !!doc1.document_cle && /^clients\/\d+\/pieces\/\d{4}\/\d{2}\/[0-9a-f-]+-caisse\.csv$/.test(doc1.document_cle)
      && doc1.document_taille === csv.length && surDisque(doc1.document_cle), JSON.stringify(doc1));
    r = await octets('POST', `/api/ventes/imports/${imp1.id}/document`, tok, csv);
    check('second envoi → 200, rien de redéposé', r.status === 200 && r.body?.depose === false, `${r.status} ${JSON.stringify(r.body)}`);
    r = await octets('GET', `/api/ventes/imports/${imp1.id}/document`, tok);
    check('téléchargement : les mêmes octets, en pièce jointe, sous le nom du fichier',
      r.status === 200 && r.buf.equals(csv) && /^text\/csv/.test(r.type) && /^attachment; filename="caisse du jour _\.csv"; filename\*=UTF-8''caisse%20du%20jour%20%C3%A9\.csv$/.test(r.disposition), `${r.status} ${r.type} ${r.disposition}`);
    r = await octets('GET', `/api/ventes/imports/${imp1.id}/document`, adminTok);
    check('document demandé par un autre compte → refusé', r.status === 403, String(r.status));
    r = await LISTE();
    check('liste : le document est signalé', r.body?.imports?.[0]?.document === true, JSON.stringify(r.body?.imports?.[0]));

    // ── 4. Ventes saisies à la main le même jour ──
    r = await C('POST', '/api/ventes', { activite_id: act.id, date_vente: J1, type_vente: 'directe', prestataire_id: null, lignes: [{ article_type: 'produit', article_id: P.id, quantite: 1, prix_unitaire: 20 }] });
    const venteMain = r.body?.id;
    check('saisie à la main le même jour → 201', r.status === 201 && !!venteMain, `${r.status} ${r.body?.message || ''}`);
    r = await JOUR(J1);
    check('journée : son import (3 ventes) et la vente saisie à la main (1, 20,000)',
      r.status === 200 && r.body.import?.id === imp1.id && r.body.import.ventes === 3 && r.body.saisies.nombre === 1 && r.body.saisies.total === 20, JSON.stringify(r.body));
    r = await C('GET', `/api/ventes/imports/jour?activiteId=${act.id}&date=hier`);
    check('journée : date illisible → 400', r.status === 400 && r.body?.code === 'DATE_INVALIDE', `${r.status} ${r.body?.code}`);
    r = await C('GET', `/api/ventes/imports/jour?activiteId=999999999&date=${J1}`);
    check('journée d\'une activité d\'un autre compte → 403', r.status === 403, String(r.status));

    // ── 5. Remplacer la journée ──
    const fichierB = { date_vente: J1, fichier_nom: 'caisse-corrigee.xlsx', empreinte: empreinte('fichier B'), categories: [],
      lignes: [{ categorie: null, designation: 'Pizza reine', quantite: 5, montant: 100, article_type: 'produit', article_id: P.id, repartition: [{ canal: 'directe', quantite: 5 }] }] };
    r = await IMPORT(fichierB);
    check('sans « remplacer » → 409 JOUR_DEJA_IMPORTE (inchangé)', r.status === 409 && r.body?.code === 'JOUR_DEJA_IMPORTE', `${r.status} ${r.body?.code}`);
    r = await IMPORT({ ...fichierB, remplacer: true, lignes: [...fichierB.lignes, { categorie: null, designation: 'Salade verte', quantite: 2, montant: 18, article_type: 'produit', article_id: P2.id, repartition: [{ canal: lienA, quantite: 2 }] }] });
    check('remplacement refusé (produit hors canal) → 409 PAS_EN_VENTE', r.status === 409 && r.body?.code === 'PAS_EN_VENTE', `${r.status} ${r.body?.code}`);
    let e1 = await etatDe(imp1.id);
    check('remplacement refusé : l\'ancien import reste entier (ventes, stock, document)',
      e1.statut === 'enregistre' && e1.annule === false && await nbVentes(imp1.id) === 3 && pres(await sortie(farine.id, J1), -5.4) && surDisque(doc1.document_cle), `${JSON.stringify(e1)} ${await sortie(farine.id, J1)}`);
    r = await IMPORT({ ...fichierB, remplacer: true });
    const imp2 = r.body?.import;
    check('« remplacer » → 201 : l\'ancien import est annoncé remplacé (3 ventes effacées)',
      r.status === 201 && r.body.remplace?.id === imp1.id && r.body.remplace.ventes === 3 && r.body.ventes.length === 1 && imp2.total_enregistre === 100, `${r.status} ${JSON.stringify(r.body).slice(0, 400)}`);
    e1 = await etatDe(imp1.id);
    check('ancien import : annulé, relié au nouveau, ses ventes effacées, son document sorti du stockage',
      e1.statut === 'annule' && e1.annule === true && e1.remplace_par === imp2.id && e1.annule_par === clientId && e1.document_cle === null
        && await nbVentes(imp1.id) === 0 && !surDisque(doc1.document_cle), JSON.stringify(e1));
    check('stock : celui de l\'ancien import est rendu, il reste le nouvel import et la vente à la main (farine 6 × 0,2 ; fromage 6 × 0,1)',
      pres(await sortie(farine.id, J1), -1.2) && pres(await sortie(fromage.id, J1), -0.6), `${await sortie(farine.id, J1)} ${await sortie(fromage.id, J1)}`);
    const main = (await pool.query('SELECT import_id FROM ventes WHERE id = $1', [venteMain])).rows;
    check('la vente saisie à la main n\'est pas touchée', main.length === 1 && main[0].import_id === null, JSON.stringify(main));
    r = await LISTE();
    check('liste : une seule journée, le nouvel import', r.body?.imports?.length === 1 && r.body.imports[0].id === imp2.id && r.body.imports[0].ventes === 1, JSON.stringify(r.body?.imports));
    r = await octets('GET', `/api/ventes/imports/${imp1.id}/document`, tok);
    check('document de l\'import remplacé → 404', r.status === 404, String(r.status));

    // ── 6. Le même fichier ──
    r = await IMPORT(fichierB);
    check('le même fichier, sans « remplacer » → 409 FICHIER_DEJA_IMPORTE (inchangé)', r.status === 409 && r.body?.code === 'FICHIER_DEJA_IMPORTE', `${r.status} ${r.body?.code}`);
    r = await IMPORT({ ...fichierB, date_vente: jour(2), remplacer: true });
    check('le même fichier pour une AUTRE journée, même avec « remplacer » → 409 FICHIER_DEJA_IMPORTE', r.status === 409 && r.body?.code === 'FICHIER_DEJA_IMPORTE', `${r.status} ${r.body?.code}`);
    r = await IMPORT({ ...fichierB, remplacer: true });
    const imp3 = r.body?.import;
    check('le même fichier pour la même journée, avec « remplacer » → 201 (une correction des choix)', r.status === 201 && r.body.remplace?.id === imp2.id && pres(await sortie(farine.id, J1), -1.2),
      `${r.status} ${JSON.stringify(r.body).slice(0, 300)} ${await sortie(farine.id, J1)}`);
    r = await IMPORT({ ...fichierB, date_vente: jour(3), empreinte: empreinte('fichier C'), remplacer: true });
    const imp4 = r.body?.import;
    check('« remplacer » sur une journée vierge → 201, rien de remplacé', r.status === 201 && r.body.remplace === null, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

    // ── 7. Annuler un import ──
    r = await appel('DELETE', `/api/ventes/imports/${imp3.id}`, null);
    check('annulation sans connexion → 401', r.status === 401, String(r.status));
    r = await appel('DELETE', `/api/ventes/imports/${imp3.id}`, adminTok);
    check('annulation par un autre compte → refusée', r.status === 403 && await nbVentes(imp3.id) === 1, String(r.status));
    r = await C('DELETE', `/api/ventes/imports/${imp3.id}`);
    check('annulation → 200 : une vente effacée', r.status === 200 && r.body?.ventes === 1 && r.body.date_vente === J1, `${r.status} ${JSON.stringify(r.body)}`);
    check('stock rendu : il ne reste que la vente saisie à la main (farine 0,2 ; fromage 0,1)', pres(await sortie(farine.id, J1), -0.2) && pres(await sortie(fromage.id, J1), -0.1), `${await sortie(farine.id, J1)} ${await sortie(fromage.id, J1)}`);
    r = await C('DELETE', `/api/ventes/imports/${imp3.id}`);
    check('annuler deux fois → 404', r.status === 404 && r.body?.code === 'IMPORT_INTROUVABLE', `${r.status} ${r.body?.code}`);
    r = await JOUR(J1);
    check('la journée n\'a plus d\'import ; la vente à la main y est toujours', r.body?.import === null && r.body.saisies.nombre === 1, JSON.stringify(r.body));
    r = await CONTEXTE();
    check('contexte : la journée annulée redevient importable, ce qui a été appris est gardé',
      JSON.stringify(r.body?.jours) === JSON.stringify([jour(3)]) && r.body.correspondances.length === 3 && r.body.modeles.length === 1, JSON.stringify({ jours: r.body?.jours, c: r.body?.correspondances?.length }));
    r = await IMPORT(fichierCsv);
    const imp5 = r.body?.import;
    check('la journée annulée se réimporte sans « remplacer » (et le premier fichier aussi)', r.status === 201 && r.body.remplace === null && r.body.ventes.length === 3, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

    // ── 8. L'annulation d'une vente à la main suit le même chemin (service partagé) ──
    r = await C('DELETE', `/api/ventes/${venteMain}`);
    check('annulation de la vente saisie à la main → 200', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    check('stock : il reste exactement celui de l\'import (farine 5,2 ; fromage 2,95)', pres(await sortie(farine.id, J1), -5.2) && pres(await sortie(fromage.id, J1), -2.95), `${await sortie(farine.id, J1)} ${await sortie(fromage.id, J1)}`);
    r = await octets('POST', `/api/ventes/imports/${imp5.id}/document`, tok, csv);
    const doc5 = await etatDe(imp5.id);
    r = await C('DELETE', `/api/ventes/imports/${imp5.id}`);
    check('annuler un import avec document : stock entièrement rendu, document sorti du stockage',
      r.status === 200 && r.body.ventes === 3 && pres(await sortie(farine.id, J1), 0) && pres(await sortie(fromage.id, J1), 0) && !!doc5.document_cle && !surDisque(doc5.document_cle),
      `${r.status} ${await sortie(farine.id, J1)} ${JSON.stringify(doc5)}`);
    r = await C('DELETE', `/api/ventes/imports/${imp4.id}`);
    check('dernière journée annulée : plus aucune vente d\'import', r.status === 200 && (await pool.query('SELECT COUNT(*)::int AS n FROM ventes WHERE created_by = $1', [clientId])).rows[0].n === 0, String(r.status));

    // ── 9. Migration 264 ──
    try {
      await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '264_ventes_imports_v1b.sql'), 'utf8'));
      check('migration 264 rejouée sans erreur', true);
    } catch (e) { check('migration 264 rejouée sans erreur', false, e.message); }
    let refuse = false;
    try {
      await pool.query(`INSERT INTO ventes_imports (activite_id, date_vente, source, empreinte, total_enregistre, nb_lignes) VALUES ($1, $2, 'ods', $3, 1, 1)`, [act.id, jour(9), empreinte('fichier Z')]);
    } catch (e) { refuse = e.code === '23514'; }
    check('garde-fou de la base : source inconnue refusée (excel, pdf, csv seulement)', refuse);

    // ── 10. Supprimer le compte, imports annulés et remplacés compris ──
    r = await A('DELETE', `/admin/clients/${clientId}`);
    check('suppression du compte (avec des imports annulés et remplacés) → acceptée', r.status === 200 || r.status === 204, `${r.status} ${r.body?.message || ''}`);
  } catch (e) {
    check('déroulé sans exception', false, e.stack);
  } finally {
    await wipe();
    const reste = (await pool.query('SELECT COUNT(*)::int AS n FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT]])).rows[0].n;
    const prestaReste = (await pool.query(`SELECT COUNT(*)::int AS n FROM prestataires_livraison WHERE nom LIKE 'TEST Presta V1B%'`)).rows[0].n;
    check('nettoyage : comptes et prestataires d\'essai retirés', reste === 0 && prestaReste === 0, `${reste} ${prestaReste}`);
    const ok = results.filter((x) => x.ok).length;
    console.log(`\n${ok}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ok === results.length ? 0 : 1);
  }
})();
