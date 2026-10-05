/* Test E2E local — lot 3, étape 8 (docs/lot-3-spec.md §1.3 et §6 ; décisions du client du 05/10/2026) :
 * factures à identité FIGÉE.
 *   POST /api/acheteurs/ventes, POST /api/acheteurs/commandes/:id/expedier   (copie de l'identité du vendeur)
 *   GET  /api/acheteurs/factures/:id/pdf, GET /api/portail/factures/:id/pdf  (lisent la copie)
 *   POST /api/abonnements/client/:id/paiements                               (copie de l'identité du client au passage à « payé »)
 *   GET  /api/abonnements/paiements/:id/facture, GET /api/abonnements/mon-abonnement/paiements/:id/facture
 *   GET  /api/portail/catalogue (vendeur = nom affiché), GET /api/entreprise (facturesNonFigees)
 *   POST /api/acheteurs, PUT /api/acheteurs/:id, POST /api/acheteurs/import  (matricule de l'acheteur remis au format)
 * Couvre : copie posée dans la transaction de l'émission (vente directe et expédition), PDF inchangé à l'octet après
 * modification de la fiche (client et admin), nouvelle identité sur la vente suivante, présentation du bloc ÉMETTEUR
 * (société, auto-entrepreneur, lignes omises ; rien n'est imprimé deux fois : forme déjà dans la raison sociale,
 * RNE égal au matricule aux séparateurs près, ville déjà dans l'adresse), copie sans mention = ancienne présentation
 * à l'octet, facture d'avant (sans copie) lue sur la fiche sans mention légale, côté acheteur vivant, facture
 * d'abonnement (première copie gardée, paiement d'avant jamais figé même repassé à « payé », téléchargements admin
 * et client identiques, PDF de l'email = PDF téléchargé), nom affiché au portail, nombre de factures non figées
 * (client et gérant), matricule des acheteurs (création par lot, modification, import Excel).
 * Crée un super_admin + 1 client (1 labo, 1 gérant, acheteurs) temporaires, puis nettoie (suppression par l'API
 * admin). Écritures SQL directes : activation des comptes d'essai, simulation « facture d'avant » et « paiement
 * d'avant » (copie remise à NULL) sur les lignes de ce compte, nettoyage. Toutes les données sont fictives. */
// ⚠️ Démarrer le backend de test par « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué) —
//    jamais par « npm start » avec le .env d'un poste de développement, qui contient de vraies clés.
// Les mêmes bouchons sont posés DANS ce processus (clés externes vidées, resend remplacé, réseau externe refusé,
// base locale exigée) : la section 9 appelle le contrôleur des paiements ici même, avec un service d'email
// remplacé, pour comparer le PDF joint à l'email et le PDF téléchargé. Aucun email ne peut partir.
require('./lib/bouchons-test').installer();
require('dotenv').config();
const path = require('path');
const zlib = require('zlib');
const Module = require('module');
const { execFileSync } = require('child_process');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const generate = require('../docuseal-templates/generate');

const BASE = `http://localhost:${process.env.PORT || 3000}`;
const MDP = 'TestFactId2026!';
const RACINE = path.resolve(__dirname, '..');
const REFERENCE = '5815e93'; // develop avant l'étape 8 : generate.js de l'ancienne présentation
const TVA = Number(process.env.FACTURE_TVA_RATE || 19);
const SEP = '  ·  ';

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
// Téléchargement d'un PDF : octets + en-têtes.
const pdf = async (chemin, jeton) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, type: r.headers.get('content-type') || '', buf, estPdf: r.status === 200 && buf.subarray(0, 5).toString() === '%PDF-' };
};

// Texte d'un PDF de pdfkit en police standard, lu dans ses OCTETS : flux décompressés, opérateurs « [<hex> …] TJ »
// (une ligne écrite = un opérateur), octets Windows-1252.
const cp1252 = new TextDecoder('windows-1252');
const textesDuPdf = (buf) => {
  const textes = [];
  const brut = buf.toString('latin1');
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(brut))) {
    const debut = m.index + m[0].length;
    const fin = brut.indexOf('endstream', debut);
    if (fin < 0) break;
    re.lastIndex = fin;
    let contenu;
    try { contenu = zlib.inflateSync(buf.subarray(debut, fin)).toString('latin1'); } catch (_) { continue; }
    for (const tj of contenu.matchAll(/\[((?:\s*<[0-9a-fA-F]*>\s*-?[0-9.]*)+)\s*\]\s*TJ/g)) {
      const hex = [...tj[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => x[1]).join('');
      textes.push(cp1252.decode(Buffer.from(hex, 'hex')));
    }
  }
  return textes;
};
// Lignes écrites entre deux étiquettes (« ÉMETTEUR » … « FACTURÉ À » … « DÉTAIL » / « OBJET »).
const bloc = (textes, debut, fin) => {
  const i = textes.indexOf(debut);
  const j = textes.indexOf(fin, i + 1);
  return i >= 0 && j > i ? textes.slice(i + 1, j) : null;
};
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Ancienne présentation : generate.js de develop avant l'étape 8, chargé par « git show » (comme
// test/B2-pdfTexte.test.js). Sans git, le générateur courant appelé avec les données d'avant (test/identiteFacture
// prouve que les deux donnent les mêmes octets).
const chargerReference = (relatif) => {
  let source;
  try {
    source = execFileSync('git', ['-C', RACINE, 'show', `${REFERENCE}:${relatif}`], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_) {
    return null;
  }
  const chemin = path.join(RACINE, path.dirname(relatif), `__reference_${path.basename(relatif)}`);
  const mod = new Module(chemin, module);
  mod.filename = chemin;
  mod.paths = Module._nodeModulePaths(path.dirname(chemin));
  mod._compile(source, chemin);
  return mod.exports;
};
const reference = chargerReference('docuseal-templates/generate.js');
const avant = reference || generate;

const aujourdhui = new Date().toISOString().slice(0, 10); // date UTC, comme le serveur (aujourdHui)
// Jour J - n, sans sortir de l'exercice en cours (la date d'une facture de vente doit y rester).
const jourMoins = (n) => {
  const d = new Date(`${aujourdhui}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  const iso = d.toISOString().slice(0, 10);
  return iso.slice(0, 4) === aujourdhui.slice(0, 4) ? iso : `${aujourdhui.slice(0, 4)}-01-01`;
};
// 1er jour du mois courant + n (mois UTC, comme le serveur).
const moisPlus = (n) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + n, 1)).toISOString().slice(0, 10);

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-factid@example.com';
  const CLIENTS = ['test-factid-1@example.com'];
  const GERANTS = ['test-factid-g1@example.com'];
  const ACHETEURS = ['test-factid-ach1@example.com', 'test-factid-ach2@example.com', 'test-factid-imp1@example.com'];
  const NOM_CONTACT = 'TEST-FactId Contact';
  const TEL = '20778801';
  const idsCrees = [];
  let adminTok = null;

  // Suppression des comptes d'essai : les clients par l'API admin (elle suit l'ordre des dépendances et purge les
  // comptes du portail), puis, en filet, les comptes rattachés et le super_admin.
  const supprimerComptes = async () => {
    const clients = (await pool.query(`SELECT id FROM utilisateurs WHERE email = ANY($1) AND role = 'client'`, [CLIENTS])).rows;
    for (const { id } of clients) {
      if (adminTok) await appel('DELETE', `/admin/clients/${id}`, adminTok);
    }
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [[...GERANTS, ...ACHETEURS]]);
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [CLIENTS]);
    await pool.query('DELETE FROM utilisateurs WHERE email = $1', [ADMIN]);
  };

  try {
    // ── 0. Préparation : super_admin, client (1 labo, 1 gérant, option Acheteurs), article en stock, offre ─────────
    // Un super_admin resté d'un passage interrompu est repris (mot de passe remis), pour supprimer par l'API le
    // client qui serait resté avec lui.
    const adminExistant = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [ADMIN])).rows[0];
    if (adminExistant) await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, actif = true WHERE id = $2', [hash, adminExistant.id]);
    else await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminFactId', $1, $2, 'super_admin', true)`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    check('login super_admin temporaire', !!adminTok);
    const adminId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [ADMIN])).rows[0].id;
    {
      const restes = (await pool.query(`SELECT id FROM utilisateurs WHERE email = ANY($1) AND role = 'client'`, [CLIENTS])).rows;
      for (const { id } of restes) await appel('DELETE', `/admin/clients/${id}`, adminTok);
      await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [[...GERANTS, ...ACHETEURS, ...CLIENTS]]);
    }

    let r = await appel('POST', '/admin/clients', adminTok, { nom: NOM_CONTACT, email: CLIENTS[0], telephone: TEL, nbActivites: 1, nbLabos: 1, nbGerants: 1, nbAcheteurs: 20, montantOnboarding: 0 });
    check('création du client (1 labo, 1 gérant, option Acheteurs), sans identité légale', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const c1 = { id: (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENTS[0]])).rows[0].id, email: CLIENTS[0] };
    idsCrees.push(c1.id);
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, c1.id]);
    c1.tok = await login(c1.email);
    check('login du client', !!c1.tok);

    r = await appel('GET', '/api/unites', c1.tok);
    let kg = (r.body || []).find((u) => (u.name || u.nom) === 'kg');
    if (!kg) kg = (await appel('POST', '/api/unites', c1.tok, { name: 'kg' })).body;
    const fam = (await appel('POST', '/api/familles', c1.tok, { name: 'Famille FactId', consommable: true, vendable: true })).body;
    const cat = (await appel('POST', '/api/categories', c1.tok, { name: 'Catégorie FactId', familleId: fam?.id })).body;
    const art = (await appel('POST', '/api/articles', c1.tok, { name: 'Semoule FactId', unitId: kg?.id, categorieId: cat?.id })).body;
    await appel('PUT', `/api/articles/${art?.id}`, c1.tok, { name: 'Semoule FactId', unitId: kg?.id, categorieId: cat?.id, commandable: true });
    const labo = (await appel('POST', '/api/labo', c1.tok, { nom: 'Dépôt FactId', refLabo: 'DFI' })).body;
    await appel('POST', `/api/labo/${labo?.id}/ingredients/${art?.id}/select`, c1.tok, {});
    r = await appel('PUT', `/api/labo/${labo?.id}/stock/${art?.id}`, c1.tok, { quantite: 500, prixUnitaire: 1.8, tauxTva: 7, dateAppro: jourMoins(5) });
    const offre = await appel('POST', '/api/acheteurs/offres', c1.tok, { articleType: 'ingredient', articleId: art?.id, prixUnitaireHt: 2.4, tauxTva: 7, actif: true });
    check('préparation : article en stock au labo et offre active', [200, 201].includes(r.status) && offre.status === 200 && !!labo?.id, `${r.status} ${offre.status}`);
    r = await appel('POST', '/api/abonnements/gerants', c1.tok, { nom: 'TEST-Gérant FactId', telephone: '20778802', email: GERANTS[0], laboIds: [labo.id], accesAcheteurs: true });
    check('préparation : gérant créé', r.status === 201 && !!r.body?.id, `${r.status} ${r.body?.message || ''}`);
    const gerantId = r.body?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, gerantId]);
    const gerantTok = await login(GERANTS[0]);
    check('login du gérant', !!gerantTok);

    const ficheVendeur = async () => (await pool.query(
      `SELECT nom, adresse, telephone, email, raison_sociale, nom_commercial, forme_juridique, matricule_fiscal, rne, ville
         FROM profil_entreprise WHERE client_id = $1`, [c1.id])).rows[0];
    const fiche0 = await ficheVendeur();
    const CONTACT = `${fiche0.email}${SEP}${fiche0.telephone}`; // dernière ligne du bloc ÉMETTEUR

    // ── 1. Matricule des acheteurs : création par lot (remis au format, jamais refusé) ─────────────────────────────
    r = await appel('POST', '/api/acheteurs', c1.tok, { acheteurs: [
      { nom: 'Sami Fictif', entreprise: 'Epicerie Essai', email: ACHETEURS[0], telephone: '+216 55 000 111', adresse: '3 rue des Tests, Sfax', matriculeFiscal: '1122334cam000', creerCompte: true },
      { nom: 'Acheteur Deux', email: ACHETEURS[1], matriculeFiscal: 'MF : 7654321 b' },
      { nom: 'Acheteur Trois', matriculeFiscal: '  B0123452024  ' },
      { nom: 'Acheteur Quatre', matriculeFiscal: '   ' },
      { nom: 'Acheteur Cinq' },
      { nom: 'Acheteur Six', matriculeFiscal: 0 },
      { nom: 'Acheteur Sept', matriculeFiscal: false },
    ] });
    const crees = r.body?.acheteurs || [];
    check('acheteurs : création par lot (7 fiches) → 201', r.status === 201 && crees.length === 7, `${r.status} ${r.body?.message || ''}`);
    const mfDe = (nom) => crees.find((a) => a.nom === nom)?.matriculeFiscal;
    check('création : « 1122334cam000 » → « 1122334C/A/M/000 »', mfDe('Sami Fictif') === '1122334C/A/M/000', JSON.stringify(mfDe('Sami Fictif')));
    check('création : « MF : 7654321 b » → « 7654321B » (libellé retiré)', mfDe('Acheteur Deux') === '7654321B', JSON.stringify(mfDe('Acheteur Deux')));
    check('création : saisie non reconnue gardée telle quelle, rognée (« B0123452024 »)', mfDe('Acheteur Trois') === 'B0123452024', JSON.stringify(mfDe('Acheteur Trois')));
    check('création : espaces seuls, champ absent, 0 et false → null', ['Acheteur Quatre', 'Acheteur Cinq', 'Acheteur Six', 'Acheteur Sept'].every((n) => mfDe(n) === null),
      JSON.stringify(['Acheteur Quatre', 'Acheteur Cinq', 'Acheteur Six', 'Acheteur Sept'].map(mfDe)));
    const enBase = (await pool.query('SELECT nom, matricule_fiscal FROM acheteurs WHERE client_id = $1 ORDER BY id', [c1.id])).rows;
    check('création : mêmes valeurs en base', egal(enBase.map((a) => a.matricule_fiscal), ['1122334C/A/M/000', '7654321B', 'B0123452024', null, null, null, null]), JSON.stringify(enBase.map((a) => a.matricule_fiscal)));
    const ach1 = crees.find((a) => a.nom === 'Sami Fictif');
    const ach3 = crees.find((a) => a.nom === 'Acheteur Trois');

    // Modification
    r = await appel('PUT', `/api/acheteurs/${ach3?.id}`, c1.tok, { matriculeFiscal: '1234567/a/a/m/000' });
    check('modification : « 1234567/a/a/m/000 » → « 1234567A/A/M/000 »', r.status === 200 && r.body?.matriculeFiscal === '1234567A/A/M/000', `${r.status} ${JSON.stringify(r.body?.matriculeFiscal)}`);
    r = await appel('PUT', `/api/acheteurs/${ach3?.id}`, c1.tok, { matriculeFiscal: '  en cours de création ' });
    check('modification : saisie non reconnue → 200, gardée telle quelle, rognée', r.status === 200 && r.body?.matriculeFiscal === 'en cours de création', `${r.status} ${JSON.stringify(r.body?.matriculeFiscal)}`);
    r = await appel('PUT', `/api/acheteurs/${ach3?.id}`, c1.tok, { notes: 'note d\'essai' });
    check('modification : champ absent → matricule non touché', r.status === 200 && r.body?.matriculeFiscal === 'en cours de création', JSON.stringify(r.body?.matriculeFiscal));
    r = await appel('PUT', `/api/acheteurs/${ach3?.id}`, c1.tok, { matriculeFiscal: '123456A/A/M/000' });
    check('modification : 6 chiffres (refusé pour un compte) → 200, gardé tel quel pour un acheteur', r.status === 200 && r.body?.matriculeFiscal === '123456A/A/M/000', `${r.status} ${JSON.stringify(r.body?.matriculeFiscal)}`);
    r = await appel('PUT', `/api/acheteurs/${ach3?.id}`, c1.tok, { matriculeFiscal: '' });
    const videChaine = r.body?.matriculeFiscal;
    r = await appel('PUT', `/api/acheteurs/${ach3?.id}`, c1.tok, { matriculeFiscal: null });
    check('modification : chaîne vide → null ; null → null', videChaine === null && r.status === 200 && r.body?.matriculeFiscal === null, JSON.stringify([videChaine, r.body?.matriculeFiscal]));

    // Import Excel
    const importer = async (lignes) => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Import');
      ws.addRow(['Nom', 'Entreprise', 'Email', 'Téléphone', 'Adresse', 'Matricule fiscal']);
      for (const l of lignes) ws.addRow(l);
      const fd = new FormData();
      fd.append('file', new Blob([await wb.xlsx.writeBuffer()]), 'acheteurs.xlsx');
      const rep = await fetch(`${BASE}/api/acheteurs/import`, { method: 'POST', headers: { Authorization: `Bearer ${c1.tok}` }, body: fd });
      let body = null;
      try { body = await rep.json(); } catch (_) { /* corps vide */ }
      return { status: rep.status, body };
    };
    r = await importer([
      ['Import Un', 'Société Import', ACHETEURS[2], '+216 55 000 222', '8 rue Importée', '1234567-A-A-M-001'],
      ['Import Deux', '', '', '', '', ' abc 123 '],
      ['Import Trois', '', '', '', '', ''],
      ['Import Quatre', '', '', '', '', 7654321],
    ]);
    const importes = (await pool.query(`SELECT nom, matricule_fiscal FROM acheteurs WHERE client_id = $1 AND nom LIKE 'Import %' ORDER BY nom`, [c1.id])).rows;
    check('import Excel : 4 lignes importées → 200', r.status === 200 && importes.length === 4, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const mfImport = Object.fromEntries(importes.map((a) => [a.nom, a.matricule_fiscal]));
    check('import : « 1234567-A-A-M-001 » → « 1234567A/A/M/001 »', mfImport['Import Un'] === '1234567A/A/M/001', JSON.stringify(mfImport['Import Un']));
    check('import : saisie non reconnue gardée, rognée (« abc 123 ») ; cellule vide → null ; cellule numérique 7654321 → « 7654321 »',
      mfImport['Import Deux'] === 'abc 123' && mfImport['Import Trois'] === null && mfImport['Import Quatre'] === '7654321', JSON.stringify(mfImport));

    // Saisie non reconnue de plus de 50 caractères (taille de la colonne) : « jamais refusé ».
    // ⚠ Ces 3 contrôles échouaient déjà avant l'étape 8 (même INSERT / UPDATE sur develop : erreur de base 22001 → 500).
    const LONG = `dossier en cours au bureau de contrôle des impôts n° ${'9'.repeat(12)}`; // 65 caractères
    r = await appel('POST', '/api/acheteurs', c1.tok, { acheteurs: [{ nom: 'Acheteur Long', matriculeFiscal: LONG }] });
    check('création : saisie non reconnue de 65 caractères → jamais refusée (pas de 500)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/acheteurs/${ach3?.id}`, c1.tok, { matriculeFiscal: LONG });
    check('modification : saisie non reconnue de 65 caractères → jamais refusée (pas de 500)', r.status === 200, `${r.status} ${r.body?.message || ''}`);
    r = await importer([['Import Long', '', '', '', '', LONG], ['Import Cinq', '', '', '', '', '7654321B']]);
    const apresLong = (await pool.query(`SELECT nom FROM acheteurs WHERE client_id = $1 AND nom IN ('Import Long', 'Import Cinq') ORDER BY nom`, [c1.id])).rows.map((a) => a.nom);
    check('import : une ligne au matricule de 65 caractères ne fait pas échouer le fichier (pas de 500, l\'autre ligne est importée)',
      r.status === 200 && apresLong.includes('Import Cinq'), `${r.status} ${r.body?.message || ''} — importées : ${JSON.stringify(apresLong)}`);

    // Compte du portail de l'acheteur 1 : activé à la main (comme l'acheteur le ferait par son invitation)
    const userAch1 = (await pool.query('SELECT user_id FROM acheteurs WHERE id = $1', [ach1.id])).rows[0].user_id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, userAch1]);
    const achTok = await login(ACHETEURS[0]);
    check('login de l\'acheteur (portail)', !!achTok);

    // Lectures de contrôle d'une facture de vente
    const copieDe = async (factureId) => (await pool.query(
      `SELECT vendeur_fige_le, created_at, vendeur_nom, vendeur_adresse, vendeur_telephone, vendeur_email, vendeur_raison_sociale,
              vendeur_nom_commercial, vendeur_forme, vendeur_matricule_fiscal, vendeur_rne, vendeur_ville, date_facture
         FROM factures_acheteur WHERE id = $1`, [factureId])).rows[0];
    const figee = (c) => JSON.stringify({ ...c, created_at: undefined, date_facture: undefined });
    // Données du générateur pour une facture : montants, lignes et acheteur (fiche vivante) lus en base ; vendeur attendu.
    const donneesVente = async (factureId, vendeur) => {
      const f = (await pool.query(
        `SELECT fa.numero, fa.date_facture, fa.remise_pct, fa.montant_ht, fa.montant_tva, fa.timbre_fiscal, fa.montant_timbre, fa.montant_ttc,
                fa.commande_id, ca.notes, ach.nom AS a_nom, ach.entreprise AS a_entreprise, ach.adresse AS a_adresse,
                ach.matricule_fiscal AS a_mf, ach.telephone AS a_tel, ach.email AS a_email
           FROM factures_acheteur fa JOIN commandes_acheteur ca ON ca.id = fa.commande_id JOIN acheteurs ach ON ach.id = fa.acheteur_id
          WHERE fa.id = $1`, [factureId])).rows[0];
      const lignes = (await pool.query('SELECT designation, quantite, prix_ht, taux_tva FROM commande_acheteur_lignes WHERE commande_id = $1 ORDER BY id', [f.commande_id])).rows;
      return {
        numero: f.numero, dateFacture: f.date_facture, vendeur,
        acheteur: { nom: f.a_nom || null, entreprise: f.a_entreprise || null, adresse: f.a_adresse || null, mf: f.a_mf || null, tel: f.a_tel || null, email: f.a_email || null },
        lignes: lignes.map((l) => ({ designation: l.designation, quantite: l.quantite, prixHt: l.prix_ht, tauxTva: l.taux_tva })),
        remisePct: Number(f.remise_pct || 0), montantHt: f.montant_ht, montantTva: f.montant_tva, timbreFiscal: !!f.timbre_fiscal,
        montantTimbre: f.montant_timbre, montantTtc: f.montant_ttc, notes: f.notes || null,
      };
    };
    // Ancienne présentation : vendeur = nom, adresse, téléphone, email (rien d'autre).
    const ancienRendu = async (factureId, v) => avant.buildFactureAcheteur(null, await donneesVente(factureId, { nom: v.nom || 'Vendeur', adresse: v.adresse || null, tel: v.telephone || null, email: v.email || null }));
    const vendre = async (dateCommande, quantite) => appel('POST', '/api/acheteurs/ventes', c1.tok, { acheteurId: ach1.id, laboId: labo.id, dateCommande, dateExpedition: dateCommande, lignes: [{ articleType: 'ingredient', articleId: art.id, quantite }] });
    const pdfClient = (factureId) => pdf(`/api/acheteurs/factures/${factureId}/pdf`, c1.tok);
    const pdfPortail = (factureId) => pdf(`/api/portail/factures/${factureId}/pdf`, achTok);
    const entreprise = async (jeton) => (await appel('GET', '/api/entreprise', jeton));
    const catalogue = async () => (await appel('GET', '/api/portail/catalogue', achTok));
    const ACHETEUR_BLOC = ['Epicerie Essai — Sami Fictif', 'MF 1122334C/A/M/000', ACHETEURS[0], '+216 55 000 111', '3 rue des Tests, Sfax'];

    // ── 2. Avant toute facture : nom affiché au portail, champ facturesNonFigees ──────────────────────────────────
    r = await catalogue();
    check('portail : vendeur = nom du contact tant que l\'identité est vide', r.status === 200 && r.body?.vendeur === NOM_CONTACT, `${r.status} ${JSON.stringify(r.body?.vendeur)}`);
    r = await entreprise(c1.tok);
    check('GET /api/entreprise : facturesNonFigees présent et 0 (aucune facture) ; plus de champ facturesNonFigeesJusquAu',
      r.status === 200 && r.body?.facturesNonFigees === 0 && !('facturesNonFigeesJusquAu' in r.body), JSON.stringify(r.body?.facturesNonFigees));
    r = await entreprise(gerantTok);
    check('… aussi pour le gérant (compte parent) : présent et 0', r.status === 200 && r.body?.clientId === c1.id && r.body.facturesNonFigees === 0, `${r.status} ${JSON.stringify(r.body?.facturesNonFigees)}`);

    // ── 3. Vente émise SANS identité légale : copie posée, présentation d'avant à l'octet ─────────────────────────
    r = await vendre(jourMoins(3), 2);
    check('vente directe n° 0 (identité vide) → 201 avec facture', r.status === 201 && !!r.body?.facture?.id, `${r.status} ${r.body?.message || ''}`);
    const F0 = r.body?.facture?.id;
    let c = await copieDe(F0);
    check('F0 : copie posée (vendeur_fige_le non NULL) dans la transaction de l\'émission (même horodatage que created_at)',
      !!c?.vendeur_fige_le && new Date(c.vendeur_fige_le).getTime() === new Date(c.created_at).getTime(), JSON.stringify([c?.vendeur_fige_le, c?.created_at]));
    check('F0 : copie = nom, téléphone, email de la fiche ; adresse et mentions légales NULL',
      c.vendeur_nom === fiche0.nom && c.vendeur_telephone === fiche0.telephone && c.vendeur_email === fiche0.email && c.vendeur_adresse === null
      && [c.vendeur_raison_sociale, c.vendeur_nom_commercial, c.vendeur_forme, c.vendeur_matricule_fiscal, c.vendeur_rne, c.vendeur_ville].every((v) => v === null), JSON.stringify(c));
    const f0Client = await pdfClient(F0);
    const f0Portail = await pdfPortail(F0);
    check('F0 : téléchargements client et portail → 200, PDF', f0Client.estPdf && f0Portail.estPdf && /pdf/.test(f0Client.type), `${f0Client.status} ${f0Portail.status}`);
    check('F0 : client et portail donnent les mêmes octets', f0Client.buf.equals(f0Portail.buf));
    check(`F0 : copie sans mention légale = EXACTEMENT les octets de l'ancienne présentation (${reference ? `generate.js de ${REFERENCE}` : 'git indisponible : générateur courant, données d\'avant'})`,
      f0Client.buf.equals(await ancienRendu(F0, fiche0)));
    let t = textesDuPdf(f0Client.buf);
    check('F0 : bloc ÉMETTEUR = nom du contact, email · téléphone (aucune mention)', egal(bloc(t, 'ÉMETTEUR', 'FACTURÉ À'), [NOM_CONTACT, CONTACT]), JSON.stringify(bloc(t, 'ÉMETTEUR', 'FACTURÉ À')));
    check('F0 : bloc FACTURÉ À = fiche de l\'acheteur, matricule au format', egal(bloc(t, 'FACTURÉ À', 'DÉTAIL'), ACHETEUR_BLOC), JSON.stringify(bloc(t, 'FACTURÉ À', 'DÉTAIL')));
    r = await entreprise(c1.tok);
    check('facturesNonFigees reste 0 (la facture émise porte une copie)', r.body?.facturesNonFigees === 0, JSON.stringify(r.body?.facturesNonFigees));

    // ── 4. Identité renseignée (admin + client) : F0 ne bouge pas, la vente suivante porte les mentions ───────────
    r = await appel('PUT', `/admin/clients/${c1.id}/identite`, adminTok, { raisonSociale: 'TEST FactId Dar', nomCommercial: 'Le Jasmin Fictif', formeJuridique: 'SARL', matriculeFiscal: '1234567aam000', rne: '7654321B' });
    const idAdmin = r.status;
    r = await appel('PUT', '/api/entreprise/identite', c1.tok, { adresse: '12 rue des Essais', ville: '1000 Tunis' });
    check('identité renseignée : admin (raison sociale, nom commercial, forme, matricule, RNE) et client (adresse, ville) → 200', idAdmin === 200 && r.status === 200 && r.body?.identiteComplete === true, `${idAdmin} ${r.status}`);
    r = await catalogue();
    check('portail : vendeur = nom commercial', r.body?.vendeur === 'Le Jasmin Fictif', JSON.stringify(r.body?.vendeur));
    check('F0 re-téléchargée (client, portail) : pas un octet de changé, aucune mention gagnée',
      (await pdfClient(F0)).buf.equals(f0Client.buf) && (await pdfPortail(F0)).buf.equals(f0Client.buf));

    r = await vendre(jourMoins(1), 3);
    check('vente directe n° 1 (identité complète) → 201', r.status === 201 && !!r.body?.facture?.id, `${r.status} ${r.body?.message || ''}`);
    const F1 = r.body?.facture?.id;
    const copieF1 = await copieDe(F1);
    check('F1 : copie = la fiche du jour (10 colonnes), horodatée dans la transaction',
      new Date(copieF1.vendeur_fige_le).getTime() === new Date(copieF1.created_at).getTime()
      && copieF1.vendeur_nom === NOM_CONTACT && copieF1.vendeur_adresse === '12 rue des Essais' && copieF1.vendeur_telephone === TEL && copieF1.vendeur_email === c1.email
      && copieF1.vendeur_raison_sociale === 'TEST FactId Dar' && copieF1.vendeur_nom_commercial === 'Le Jasmin Fictif' && copieF1.vendeur_forme === 'SARL'
      && copieF1.vendeur_matricule_fiscal === '1234567A/A/M/000' && copieF1.vendeur_rne === '7654321B' && copieF1.vendeur_ville === '1000 Tunis', JSON.stringify(copieF1));
    const f1Client = await pdfClient(F1);
    const f1Portail = await pdfPortail(F1);
    check('F1 : client et portail → 200, mêmes octets', f1Client.estPdf && f1Portail.estPdf && f1Client.buf.equals(f1Portail.buf), `${f1Client.status} ${f1Portail.status}`);
    t = textesDuPdf(f1Client.buf);
    const EMETTEUR_F1 = ['TEST FactId Dar', 'Nom commercial : Le Jasmin Fictif', `SARL${SEP}Matricule fiscal : 1234567A/A/M/000`, 'RNE : 7654321B', '12 rue des Essais, 1000 Tunis', CONTACT];
    check('F1 : bloc ÉMETTEUR = raison sociale, nom commercial, forme · matricule fiscal (forme hors du nom : imprimée), RNE, adresse + ville, email · téléphone', egal(bloc(t, 'ÉMETTEUR', 'FACTURÉ À'), EMETTEUR_F1), JSON.stringify(bloc(t, 'ÉMETTEUR', 'FACTURÉ À')));
    check('F1 : pied de page = raison sociale · MF · adresse, ville ; sous-titre à la raison sociale',
      t.includes(`TEST FactId Dar${SEP}MF 1234567A/A/M/000${SEP}12 rue des Essais, 1000 Tunis`) && t.includes('TEST FactId Dar — vente professionnelle, émise via la plateforme LabFlow'), JSON.stringify(t.slice(-3)));
    check('F1 : bloc FACTURÉ À inchangé (fiche de l\'acheteur)', egal(bloc(t, 'FACTURÉ À', 'DÉTAIL'), ACHETEUR_BLOC), JSON.stringify(bloc(t, 'FACTURÉ À', 'DÉTAIL')));
    const VENDEUR_F1 = { nom: 'TEST FactId Dar', adresse: '12 rue des Essais', tel: TEL, email: c1.email, nomCommercial: 'Le Jasmin Fictif', forme: 'SARL', matricule: '1234567A/A/M/000', autoEntrepreneur: false, rne: '7654321B', ville: '1000 Tunis' };
    check('F1 : octets = rendu des valeurs attendues par le générateur', f1Client.buf.equals(await generate.buildFactureAcheteur(null, await donneesVente(F1, VENDEUR_F1))));

    // Commande du portail passée MAINTENANT (identité SARL), expédiée plus bas, après la modification de la fiche
    r = await appel('POST', '/api/portail/commandes', achTok, { lignes: [{ articleType: 'ingredient', articleId: art.id, quantite: 4 }] });
    check('portail : commande passée (en attente, pas encore de facture)', r.status === 201 && !!r.body?.id, `${r.status} ${r.body?.message || ''}`);
    const commandePortail = r.body?.id;

    // Facture d'abonnement : un paiement en attente n'est pas figé ; son passage à « payé » copie l'identité
    const M = [1, 2, 3, 4, 5].map(moisPlus);
    const payer = (mois, statut, montant) => appel('POST', `/api/abonnements/client/${c1.id}/paiements`, adminTok, { mois, statut, montant });
    const paiementDe = async (id) => (await pool.query(
      `SELECT id, mois, montant_dt, statut, date_paiement, date_saisie, client_fige_le, client_nom, client_email, client_raison_sociale, client_forme,
              client_matricule_fiscal, client_rne, client_adresse, client_ville FROM paiements WHERE id = $1`, [id])).rows[0];
    const figeP = (p) => JSON.stringify([p.client_fige_le, p.client_nom, p.client_email, p.client_raison_sociale, p.client_forme, p.client_matricule_fiscal, p.client_rne, p.client_adresse, p.client_ville]);
    const factureAdmin = (id) => pdf(`/api/abonnements/paiements/${id}/facture`, adminTok);
    const factureClient = (id) => pdf(`/api/abonnements/mon-abonnement/paiements/${id}/facture`, c1.tok);
    // Données de la facture d'abonnement telles que le serveur les construisait AVANT l'étape 8 (nom + email du compte).
    const donneesAbonnementAvant = (p, compte) => {
      const moisDate = new Date(p.mois);
      const ttc = Math.round((Number(p.montant_dt) || 0) * 1000) / 1000;
      const ht = Math.round((ttc / (1 + TVA / 100)) * 1000) / 1000;
      return {
        numero: `LF-${moisDate.getFullYear()}-${String(p.id).padStart(5, '0')}`, dateFacture: p.date_paiement || p.mois,
        periodeLabel: moisDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
        clientNom: compte?.nom || 'Client', clientEmail: compte?.email || '',
        montantHt: ht, montantTva: Math.round((ttc - ht) * 1000) / 1000, montantTtc: ttc, tvaRate: TVA,
      };
    };

    r = await payer(M[0], 'en_attente', 120);
    const P1 = r.body?.id;
    let p = await paiementDe(P1);
    check('paiement P1 enregistré « en attente » → 200, aucune copie (client_fige_le NULL)', r.status === 200 && p?.statut === 'en_attente' && p.client_fige_le === null && p.client_nom === null, `${r.status} ${JSON.stringify(p)}`);
    check('P1 en attente : facture indisponible (400)', (await factureAdmin(P1)).status === 400);
    r = await payer(M[0], 'payé', 120);
    p = await paiementDe(P1);
    check('P1 passe à « payé » → copie posée dans la même transaction (client_fige_le = date_saisie)',
      r.status === 200 && p.statut === 'payé' && !!p.client_fige_le && new Date(p.client_fige_le).getTime() === new Date(p.date_saisie).getTime(), JSON.stringify([p.client_fige_le, p.date_saisie]));
    check('P1 : copie = nom et email du compte, raison sociale, forme, matricule, RNE, adresse, ville de la fiche',
      p.client_nom === NOM_CONTACT && p.client_email === c1.email && p.client_raison_sociale === 'TEST FactId Dar' && p.client_forme === 'SARL'
      && p.client_matricule_fiscal === '1234567A/A/M/000' && p.client_rne === '7654321B' && p.client_adresse === '12 rue des Essais' && p.client_ville === '1000 Tunis', JSON.stringify(p));
    const copieP1 = figeP(p);
    const p1Admin = await factureAdmin(P1);
    const p1Client = await factureClient(P1);
    check('P1 : téléchargements admin et client → 200, PDF, mêmes octets', p1Admin.estPdf && p1Client.estPdf && p1Admin.buf.equals(p1Client.buf), `${p1Admin.status} ${p1Client.status}`);
    t = textesDuPdf(p1Admin.buf);
    check('P1 : bloc FACTURÉ À = raison sociale, forme · matricule fiscal, RNE, email, adresse + ville',
      egal(bloc(t, 'FACTURÉ À', 'OBJET'), ['TEST FactId Dar', `SARL${SEP}Matricule fiscal : 1234567A/A/M/000`, 'RNE : 7654321B', c1.email, '12 rue des Essais, 1000 Tunis']), JSON.stringify(bloc(t, 'FACTURÉ À', 'OBJET')));
    check('P1 : octets = rendu des valeurs attendues par le générateur', p1Admin.buf.equals(await generate.buildFacture(null, {
      ...donneesAbonnementAvant(p, null), clientNom: 'TEST FactId Dar', clientEmail: c1.email,
      client: { forme: 'SARL', matricule: '1234567A/A/M/000', autoEntrepreneur: false, rne: '7654321B', ville: '1000 Tunis', adresse: '12 rue des Essais' },
    })));

    // Paiement d'avant : payé, puis sa copie est remise à NULL en base (simulation d'un paiement réglé avant la
    // migration 199 : il garde sa date de règlement, il n'a pas de copie)
    r = await payer(M[1], 'payé', 80);
    const P2 = r.body?.id;
    const simuleP = await pool.query(
      `UPDATE paiements SET client_fige_le = NULL, client_nom = NULL, client_email = NULL, client_raison_sociale = NULL, client_forme = NULL,
              client_matricule_fiscal = NULL, client_rne = NULL, client_adresse = NULL, client_ville = NULL WHERE id = $1`, [P2]);
    p = await paiementDe(P2);
    check('paiement P2 payé, puis ramené à l\'état « d\'avant » en base (simulation : date de règlement gardée, copie NULL)',
      r.status === 200 && simuleP.rowCount === 1 && p.statut === 'payé' && !!p.date_paiement && p.client_fige_le === null, `${r.status} ${JSON.stringify(p)}`);

    // ── 5. Fiche modifiée (client : adresse, ville ; admin : raison sociale, forme, matricule…) ───────────────────
    r = await appel('PUT', '/api/entreprise/identite', c1.tok, { adresse: '99 avenue Modifiée', ville: '4000 Sousse' });
    const modClient = r.status;
    r = await appel('PUT', `/admin/clients/${c1.id}/identite`, adminTok, { raisonSociale: 'TEST FactId Nouvelle SA', formeJuridique: 'SA', matriculeFiscal: '7654321B/A/M/000', nomCommercial: '', rne: '' });
    const modAdmin = r.status;
    r = await appel('PUT', `/admin/clients/${c1.id}`, adminTok, { name: 'TEST-FactId Renommé' });
    check('fiche modifiée : PUT /api/entreprise/identite, PUT /admin/clients/:id/identite, contact renommé → 200', modClient === 200 && modAdmin === 200 && r.status === 200, `${modClient} ${modAdmin} ${r.status}`);
    const fiche1 = await ficheVendeur();
    check('… la fiche porte bien les nouvelles valeurs', fiche1.raison_sociale === 'TEST FactId Nouvelle SA' && fiche1.forme_juridique === 'SA' && fiche1.matricule_fiscal === '7654321B/A/M/000'
      && fiche1.nom_commercial === null && fiche1.rne === null && fiche1.adresse === '99 avenue Modifiée' && fiche1.ville === '4000 Sousse', JSON.stringify(fiche1));

    check('F1 re-téléchargée par le client : pas un octet de changé', (await pdfClient(F1)).buf.equals(f1Client.buf));
    check('F1 re-téléchargée au portail : pas un octet de changé', (await pdfPortail(F1)).buf.equals(f1Client.buf));
    check('F0 re-téléchargée (client, portail) : pas un octet de changé', (await pdfClient(F0)).buf.equals(f0Client.buf) && (await pdfPortail(F0)).buf.equals(f0Client.buf));
    check('F1 : la copie en base n\'a pas changé (horodatage compris)', figee(await copieDe(F1)) === figee(copieF1));
    r = await catalogue();
    check('portail : vendeur = raison sociale quand il n\'y a plus de nom commercial', r.body?.vendeur === 'TEST FactId Nouvelle SA', JSON.stringify(r.body?.vendeur));

    r = await vendre(aujourdhui, 1);
    const F2 = r.body?.facture?.id;
    const f2Client = await pdfClient(F2);
    t = f2Client.estPdf ? textesDuPdf(f2Client.buf) : [];
    // La raison sociale se termine par « SA » : la forme n'est pas répétée devant le matricule
    const EMETTEUR_F2 = ['TEST FactId Nouvelle SA', 'Matricule fiscal : 7654321B/A/M/000', '99 avenue Modifiée, 4000 Sousse', CONTACT];
    check('vente n° 2 émise APRÈS la modification : nouvelle identité (ni « Nom commercial », ni « RNE » : lignes omises ; forme déjà dans le nom : non répétée)',
      r.status === 201 && egal(bloc(t, 'ÉMETTEUR', 'FACTURÉ À'), EMETTEUR_F2), `${r.status} ${JSON.stringify(bloc(t, 'ÉMETTEUR', 'FACTURÉ À'))}`);
    check('F2 : portail = client, à l\'octet', (await pdfPortail(F2)).buf.equals(f2Client.buf));

    // Expédition de la commande du portail : la facture naît à l'expédition, avec l'identité de CE moment
    r = await appel('POST', `/api/acheteurs/commandes/${commandePortail}/expedier`, c1.tok, { laboId: labo.id, dateExpedition: aujourdhui });
    check('expédition de la commande du portail → 200 avec facture', r.status === 200 && !!r.body?.facture?.id, `${r.status} ${r.body?.message || ''}`);
    const F3 = r.body?.facture?.id;
    c = await copieDe(F3);
    check('F3 (expédition) : copie posée dans la transaction, identité du jour de l\'expédition (pas celle du jour de la commande)',
      !!c?.vendeur_fige_le && new Date(c.vendeur_fige_le).getTime() === new Date(c.created_at).getTime() && c.vendeur_raison_sociale === 'TEST FactId Nouvelle SA'
      && c.vendeur_forme === 'SA' && c.vendeur_matricule_fiscal === '7654321B/A/M/000' && c.vendeur_nom_commercial === null && c.vendeur_rne === null
      && c.vendeur_adresse === '99 avenue Modifiée' && c.vendeur_ville === '4000 Sousse' && c.vendeur_nom === NOM_CONTACT, JSON.stringify(c));
    const f3Client = await pdfClient(F3);
    const f3Portail = await pdfPortail(F3);
    t = f3Client.estPdf ? textesDuPdf(f3Client.buf) : [];
    check('F3 : client et portail → mêmes octets ; bloc ÉMETTEUR à la nouvelle identité', f3Client.estPdf && f3Client.buf.equals(f3Portail.buf) && egal(bloc(t, 'ÉMETTEUR', 'FACTURÉ À'), EMETTEUR_F2), JSON.stringify(bloc(t, 'ÉMETTEUR', 'FACTURÉ À')));

    // Facture d'abonnement après la modification
    check('P1 re-téléchargée (admin, client) après la modification de la fiche et du contact : pas un octet de changé',
      (await factureAdmin(P1)).buf.equals(p1Admin.buf) && (await factureClient(P1)).buf.equals(p1Admin.buf));
    r = await payer(M[0], 'en_attente', 120);
    p = await paiementDe(P1);
    check('P1 repasse « en attente » : la copie reste en base, la facture n\'est plus servie (400)', r.status === 200 && p.statut === 'en_attente' && figeP(p) === copieP1 && (await factureAdmin(P1)).status === 400, `${r.status} ${p.statut}`);
    r = await payer(M[0], 'payé', 120);
    p = await paiementDe(P1);
    check('P1 payé → en attente → payé : la PREMIÈRE copie est gardée (horodatage et valeurs), malgré la fiche modifiée', r.status === 200 && p.statut === 'payé' && figeP(p) === copieP1, figeP(p));
    check('… et sa facture n\'a pas changé d\'un octet (admin, client)', (await factureAdmin(P1)).buf.equals(p1Admin.buf) && (await factureClient(P1)).buf.equals(p1Admin.buf));
    r = await payer(M[0], 'payé', 120);
    check('P1 réenregistré « payé » : copie et facture inchangées', r.status === 200 && figeP(await paiementDe(P1)) === copieP1 && (await factureAdmin(P1)).buf.equals(p1Admin.buf));

    r = await payer(M[1], 'payé', 80);
    p = await paiementDe(P2);
    check('P2 (d\'avant, déjà payé sans copie) réenregistré « payé » → reste SANS copie', r.status === 200 && p.statut === 'payé' && p.client_fige_le === null && p.client_nom === null && p.client_raison_sociale === null, JSON.stringify(p));
    const compte = (await pool.query('SELECT nom, email FROM utilisateurs WHERE id = $1', [c1.id])).rows[0];
    const p2Admin = await factureAdmin(P2);
    const p2Client = await factureClient(P2);
    t = p2Admin.estPdf ? textesDuPdf(p2Admin.buf) : [];
    check('P2 : s\'imprime comme avant — FACTURÉ À = nom + email du compte du jour, aucune mention', compte.nom === 'TEST-FactId Renommé' && egal(bloc(t, 'FACTURÉ À', 'OBJET'), [compte.nom, compte.email]), JSON.stringify(bloc(t, 'FACTURÉ À', 'OBJET')));
    check('P2 : octets = ancienne présentation ; admin et client identiques', p2Admin.estPdf && p2Admin.buf.equals(await avant.buildFacture(null, donneesAbonnementAvant(p, compte))) && p2Admin.buf.equals(p2Client.buf));
    // Un paiement déjà réglé une fois avant la copie figée, qu'on repasse à « payé » après un autre statut, n'est PAS figé
    r = await payer(M[1], 'en_attente', 80);
    const p2EnAttente = await paiementDe(P2);
    const p2Retour = await payer(M[1], 'payé', 80);
    p = await paiementDe(P2);
    check('P2 (d\'avant) : payé → en attente → payé → reste SANS copie (déjà réglé une fois avant la copie figée)',
      r.status === 200 && p2EnAttente.statut === 'en_attente' && !!p2EnAttente.date_paiement && p2Retour.status === 200 && p.statut === 'payé'
      && p.client_fige_le === null && p.client_nom === null && p.client_raison_sociale === null && p.client_matricule_fiscal === null, JSON.stringify(p));
    check('… et sa facture reste celle d\'avant, à l\'octet (admin et client) : nom + email du compte, aucune mention',
      (await factureAdmin(P2)).buf.equals(p2Admin.buf) && (await factureClient(P2)).buf.equals(p2Admin.buf));

    r = await payer(M[2], 'payé', 60);
    const P3 = r.body?.id;
    const p3Admin = await factureAdmin(P3);
    t = p3Admin.estPdf ? textesDuPdf(p3Admin.buf) : [];
    check('P3 payé APRÈS la modification : nouvelle identité (RNE omis, forme déjà dans le nom non répétée), nom du contact renommé copié',
      r.status === 200 && (await paiementDe(P3)).client_nom === 'TEST-FactId Renommé' && (await paiementDe(P3)).client_forme === 'SA'
      && egal(bloc(t, 'FACTURÉ À', 'OBJET'), ['TEST FactId Nouvelle SA', 'Matricule fiscal : 7654321B/A/M/000', c1.email, '99 avenue Modifiée, 4000 Sousse']), JSON.stringify(bloc(t, 'FACTURÉ À', 'OBJET')));

    // ── 6. Auto-entrepreneur : « Identifiant unique », RNE égal au matricule (aux séparateurs et à la casse près) omis ─
    r = await appel('PUT', `/admin/clients/${c1.id}/identite`, adminTok, { raisonSociale: 'TEST FactId Titulaire', formeJuridique: 'AUTO_ENTREPRENEUR', matriculeFiscal: '7654321B', rne: '7654321 b' });
    const aeStatus = r.status;
    r = await vendre(aujourdhui, 1);
    const F4 = r.body?.facture?.id;
    const f4Client = await pdfClient(F4);
    t = f4Client.estPdf ? textesDuPdf(f4Client.buf) : [];
    check('vente n° 4, auto-entrepreneur : forme · « Identifiant unique : … », pas de ligne RNE (« 7654321 b » = « 7654321B »)',
      aeStatus === 200 && r.status === 201 && egal(bloc(t, 'ÉMETTEUR', 'FACTURÉ À'), ['TEST FactId Titulaire', `Auto-entrepreneur${SEP}Identifiant unique : 7654321B`, '99 avenue Modifiée, 4000 Sousse', CONTACT]),
      `${aeStatus} ${r.status} ${JSON.stringify(bloc(t, 'ÉMETTEUR', 'FACTURÉ À'))}`);
    check('F4 : pied de page « ID 7654321B » ; ni « Matricule fiscal », ni « RNE » sur le document',
      t.includes(`TEST FactId Titulaire${SEP}ID 7654321B${SEP}99 avenue Modifiée, 4000 Sousse`) && !t.some((x) => /Matricule fiscal|RNE/.test(x)), JSON.stringify(t.slice(-3)));
    check('F4 : la copie garde le RNE tel qu\'il a été saisi (seule l\'impression l\'omet)', (await copieDe(F4)).vendeur_rne === '7654321 b', JSON.stringify((await copieDe(F4)).vendeur_rne));
    // Vente saisie par le gérant : la facture appartient au compte parent, la copie est celle de SA fiche
    r = await appel('POST', '/api/acheteurs/ventes', gerantTok, { acheteurId: ach1.id, laboId: labo.id, dateCommande: aujourdhui, dateExpedition: aujourdhui, lignes: [{ articleType: 'ingredient', articleId: art.id, quantite: 1 }] });
    const F5 = r.body?.facture?.id;
    c = F5 ? await copieDe(F5) : null;
    const f5Gerant = F5 ? await pdf(`/api/acheteurs/factures/${F5}/pdf`, gerantTok) : null;
    check('vente saisie par le GÉRANT → 201 : copie = fiche du compte parent ; son téléchargement = celui du client, à l\'octet',
      r.status === 201 && !!c?.vendeur_fige_le && c.vendeur_raison_sociale === 'TEST FactId Titulaire' && c.vendeur_forme === 'AUTO_ENTREPRENEUR' && c.vendeur_nom === NOM_CONTACT
      && !!f5Gerant?.estPdf && f5Gerant.buf.equals((await pdfClient(F5)).buf), `${r.status} ${r.body?.message || ''} ${JSON.stringify(c)}`);
    r = await payer(M[3], 'payé', 40);
    const P4 = r.body?.id;
    const p4Admin = await factureAdmin(P4);
    t = p4Admin.estPdf ? textesDuPdf(p4Admin.buf) : [];
    check('P4, auto-entrepreneur : FACTURÉ À = titulaire, forme · « Identifiant unique : … », email, adresse + ville',
      r.status === 200 && egal(bloc(t, 'FACTURÉ À', 'OBJET'), ['TEST FactId Titulaire', `Auto-entrepreneur${SEP}Identifiant unique : 7654321B`, c1.email, '99 avenue Modifiée, 4000 Sousse']), JSON.stringify(bloc(t, 'FACTURÉ À', 'OBJET')));
    check('après ce changement : F1, F2, F3, P1, P3 re-téléchargées sans un octet de changé',
      (await pdfClient(F1)).buf.equals(f1Client.buf) && (await pdfClient(F2)).buf.equals(f2Client.buf) && (await pdfPortail(F3)).buf.equals(f3Client.buf)
      && (await factureClient(P1)).buf.equals(p1Admin.buf) && (await factureAdmin(P3)).buf.equals(p3Admin.buf));

    // ── 7. Côté acheteur : inchangé (fiche vivante tant que l'acheteur existe) ───────────────────────────────────
    r = await appel('PUT', `/api/acheteurs/${ach1.id}`, c1.tok, { adresse: '77 rue Déplacée, Gabès' });
    const f1Apres = await pdfClient(F1);
    t = f1Apres.estPdf ? textesDuPdf(f1Apres.buf) : [];
    check('fiche de l\'acheteur modifiée : le bloc FACTURÉ À de F1 suit la fiche (comme avant l\'étape 8)',
      r.status === 200 && egal(bloc(t, 'FACTURÉ À', 'DÉTAIL'), [...ACHETEUR_BLOC.slice(0, 4), '77 rue Déplacée, Gabès']), JSON.stringify(bloc(t, 'FACTURÉ À', 'DÉTAIL')));
    check('… le bloc ÉMETTEUR de F1 reste celui de la copie', egal(bloc(t, 'ÉMETTEUR', 'FACTURÉ À'), EMETTEUR_F1), JSON.stringify(bloc(t, 'ÉMETTEUR', 'FACTURÉ À')));
    check('… octets = copie du vendeur + fiche du jour de l\'acheteur ; portail identique',
      f1Apres.buf.equals(await generate.buildFactureAcheteur(null, await donneesVente(F1, VENDEUR_F1))) && (await pdfPortail(F1)).buf.equals(f1Apres.buf));

    // ── 8. Factures d'avant (sans copie) : lues sur la fiche, sans mention légale ; facturesNonFigees ────────────
    const RAZ_VENDEUR = `UPDATE factures_acheteur SET vendeur_fige_le = NULL, vendeur_nom = NULL, vendeur_adresse = NULL, vendeur_telephone = NULL, vendeur_email = NULL,
              vendeur_raison_sociale = NULL, vendeur_nom_commercial = NULL, vendeur_forme = NULL, vendeur_matricule_fiscal = NULL, vendeur_rne = NULL, vendeur_ville = NULL
        WHERE id = $1 AND client_id = $2`;
    let sim = await pool.query(RAZ_VENDEUR, [F0, c1.id]);
    r = await entreprise(c1.tok);
    check('F0 ramenée à l\'état « d\'avant » (simulation) : facturesNonFigees = 1', sim.rowCount === 1 && r.body?.facturesNonFigees === 1, JSON.stringify(r.body?.facturesNonFigees));
    sim = await pool.query(RAZ_VENDEUR, [F1, c1.id]);
    r = await entreprise(c1.tok);
    check('F1 aussi : facturesNonFigees = 2 (nombre de factures de vente du compte sans copie, un entier)',
      sim.rowCount === 1 && r.body?.facturesNonFigees === 2 && Number.isInteger(r.body.facturesNonFigees), JSON.stringify(r.body?.facturesNonFigees));
    r = await entreprise(gerantTok);
    check('… même valeur pour le gérant (compte parent)', r.status === 200 && r.body?.facturesNonFigees === 2, JSON.stringify(r.body?.facturesNonFigees));

    const fiche2 = await ficheVendeur();
    let f1Avant = await pdfClient(F1);
    t = f1Avant.estPdf ? textesDuPdf(f1Avant.buf) : [];
    check('F1 d\'avant : bloc ÉMETTEUR = nom du contact, adresse, email · téléphone du jour — AUCUNE mention légale alors que la fiche en porte',
      !!fiche2.raison_sociale && !!fiche2.matricule_fiscal && !!fiche2.ville && egal(bloc(t, 'ÉMETTEUR', 'FACTURÉ À'), [fiche2.nom, '99 avenue Modifiée', CONTACT]), JSON.stringify(bloc(t, 'ÉMETTEUR', 'FACTURÉ À')));
    check('F1 d\'avant : octets = ancienne présentation avec la fiche du jour ; portail identique',
      f1Avant.buf.equals(await ancienRendu(F1, fiche2)) && (await pdfPortail(F1)).buf.equals(f1Avant.buf));
    // (le bloc FACTURÉ À de toutes ces factures suit la fiche de l'acheteur, modifiée à la section 7 : on repart donc
    //  de leurs octets d'après cette modification)
    const figeesAvant = [await pdfClient(F2), await pdfClient(F3), await pdfPortail(F4)];
    // Nouvelle adresse, saisie AVEC la ville (« …, 4000 SOUSSE »), alors que le champ Ville porte déjà « 4000 Sousse »
    r = await appel('PUT', '/api/entreprise/identite', c1.tok, { adresse: '5 rue du Jour, 4000 SOUSSE' });
    const fiche3 = await ficheVendeur();
    f1Avant = await pdfClient(F1);
    t = f1Avant.estPdf ? textesDuPdf(f1Avant.buf) : [];
    check('adresse de la fiche modifiée : la facture d\'avant SUIT la fiche (lue à chaque téléchargement, comme avant)',
      r.status === 200 && egal(bloc(t, 'ÉMETTEUR', 'FACTURÉ À'), [fiche3.nom, '5 rue du Jour, 4000 SOUSSE', CONTACT]) && f1Avant.buf.equals(await ancienRendu(F1, fiche3)) && (await pdfPortail(F1)).buf.equals(f1Avant.buf),
      JSON.stringify(bloc(t, 'ÉMETTEUR', 'FACTURÉ À')));
    const figeesApres = [await pdfClient(F2), await pdfClient(F3), await pdfPortail(F4)];
    check('… pendant que les factures figées (F2, F3, F4) ne changent pas d\'un octet et gardent leur bloc ÉMETTEUR',
      figeesAvant.every((x, i) => x.estPdf && x.buf.equals(figeesApres[i].buf)) && egal(bloc(textesDuPdf(figeesApres[0].buf), 'ÉMETTEUR', 'FACTURÉ À'), EMETTEUR_F2),
      JSON.stringify(bloc(textesDuPdf(figeesApres[0].buf), 'ÉMETTEUR', 'FACTURÉ À')));

    // Ville déjà dans l'adresse : une nouvelle vente ne l'imprime qu'une fois (bloc ÉMETTEUR et pied de page)
    r = await vendre(aujourdhui, 1);
    const F6 = r.body?.facture?.id;
    c = F6 ? await copieDe(F6) : null;
    const f6Client = F6 ? await pdfClient(F6) : null;
    t = f6Client?.estPdf ? textesDuPdf(f6Client.buf) : [];
    check('vente n° 6, adresse qui contient déjà la ville (sans tenir compte de la casse) : ville non accolée ; la copie garde les deux champs',
      r.status === 201 && c?.vendeur_adresse === '5 rue du Jour, 4000 SOUSSE' && c.vendeur_ville === '4000 Sousse'
      && egal(bloc(t, 'ÉMETTEUR', 'FACTURÉ À'), ['TEST FactId Titulaire', `Auto-entrepreneur${SEP}Identifiant unique : 7654321B`, '5 rue du Jour, 4000 SOUSSE', CONTACT])
      && t.includes(`TEST FactId Titulaire${SEP}ID 7654321B${SEP}5 rue du Jour, 4000 SOUSSE`), JSON.stringify([bloc(t, 'ÉMETTEUR', 'FACTURÉ À'), t.slice(-3)]));
    r = await entreprise(c1.tok);
    check('facturesNonFigees reste 2 après cette nouvelle vente (elle est figée à son émission)', r.body?.facturesNonFigees === 2, JSON.stringify(r.body?.facturesNonFigees));

    // ── 9. PDF joint à l'email du passage à « payé » = PDF téléchargé ────────────────────────────────────────────
    // Le backend de test n'expose pas l'email (clé vide : il journalise « [DEV] Facture email … » et s'arrête là). Le
    // même contrôleur est donc appelé ICI, sur la même base, avec un service d'email remplacé qui garde ses arguments.
    const emailService = require('../src/services/emailService');
    const courriels = [];
    emailService.sendFactureEmail = async (m) => { courriels.push(m); return { success: true, bouchon: true }; };
    const abonnementController = require('../src/controllers/abonnementController');
    const rep = await new Promise((resolve) => {
      const res = { code: 200, status(s) { this.code = s; return this; }, json(b) { resolve({ status: this.code, body: b }); } };
      abonnementController.upsertPaiement({ params: { clientId: String(c1.id) }, body: { mois: M[4], statut: 'payé', montant: 95.5 }, user: { id: adminId } }, res);
    });
    for (let i = 0; i < 100 && courriels.length === 0; i += 1) await new Promise((ok) => setTimeout(ok, 50));
    const P5 = rep.body?.id;
    check('passage à « payé » par le contrôleur (service d\'email remplacé) → 200, un email de facture avec PDF, adressé au compte',
      rep.status === 200 && !!P5 && courriels.length === 1 && courriels[0].to === c1.email && typeof courriels[0].pdfBase64 === 'string' && courriels[0].pdfBase64.length > 1000,
      `${rep.status} ${courriels.length} email(s)`);
    const joint = courriels[0] ? Buffer.from(courriels[0].pdfBase64, 'base64') : Buffer.alloc(0);
    const p5Admin = await factureAdmin(P5);
    const p5Client = await factureClient(P5);
    check('PDF joint à l\'email = PDF téléchargé par l\'admin = PDF téléchargé par le client (octets)', p5Admin.estPdf && joint.equals(p5Admin.buf) && joint.equals(p5Client.buf), `${joint.length} / ${p5Admin.buf.length} / ${p5Client.buf.length} octets`);
    t = p5Admin.estPdf ? textesDuPdf(p5Admin.buf) : [];
    check('… et il porte la copie (auto-entrepreneur, adresse du jour du paiement, ville déjà dans l\'adresse non accolée), numéro de l\'email = numéro du PDF',
      egal(bloc(t, 'FACTURÉ À', 'OBJET'), ['TEST FactId Titulaire', `Auto-entrepreneur${SEP}Identifiant unique : 7654321B`, c1.email, '5 rue du Jour, 4000 SOUSSE']) && t.includes(`Réf. ${courriels[0]?.numero}`),
      JSON.stringify(bloc(t, 'FACTURÉ À', 'OBJET')));
  } catch (e) {
    check('exécution', false, e.stack || e.message);
  } finally {
    // ── Nettoyage : comptes d'essai supprimés (API admin, puis filet SQL), rien ne reste ─────────────────────────
    try { await supprimerComptes(); } catch (e) { check('nettoyage', false, e.message); }
    const emails = [ADMIN, ...CLIENTS, ...GERANTS, ...ACHETEURS];
    const comptes = (await pool.query('SELECT COUNT(*)::int AS n FROM utilisateurs WHERE email = ANY($1)', [emails])).rows[0].n;
    const ids = idsCrees.filter(Boolean);
    const restes = ids.length ? (await pool.query(
      `SELECT (SELECT COUNT(*) FROM profil_entreprise WHERE client_id = ANY($1::int[]))::int AS fiches,
              (SELECT COUNT(*) FROM factures_acheteur WHERE client_id = ANY($1::int[]))::int AS factures,
              (SELECT COUNT(*) FROM acheteurs WHERE client_id = ANY($1::int[]))::int AS acheteurs,
              (SELECT COUNT(*) FROM paiements p JOIN abonnements a ON a.id = p.abonnement_id WHERE a.client_id = ANY($1::int[]))::int AS paiements`, [ids])).rows[0]
      : { fiches: 0, factures: 0, acheteurs: 0, paiements: 0 };
    check('nettoyage : aucun compte d\'essai, aucune fiche, facture, fiche d\'acheteur ni paiement ne reste',
      comptes === 0 && restes.fiches === 0 && restes.factures === 0 && restes.acheteurs === 0 && restes.paiements === 0, JSON.stringify({ comptes, ...restes }));
    await pool.end();
  }
  const ko = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - ko}/${results.length} contrôles verts`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
