// D3 « Code des articles par catégorie » (labflow-reprise/PLAN-DOMAINES-ACHETEURS-CODES.md §2 ligne D3 ; réponses du client
// du 15/10 : par catégorie, attention à la confusion). Tests sans base : la règle (préfixes, codes), la migration 248, le
// câblage des contrôleurs (articles, catégories, produits, référentiel), le pont comptable (libellé des lignes au code,
// regroupement inchangé), la page Comptes d'achat, le manuel 249.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const C = require('../src/utils/codesArticles');
const P = require('../src/services/pontCompta');

test('préfixes : lettres sans accent, 3 lettres, candidats dans l\'ordre, réserves ART et PRD, jamais un préfixe pris', () => {
  assert.equal(C.lettresDe('Pâtes & riz'), 'PATESRIZ');
  assert.equal(C.prefixeDe('Farines'), 'FAR');
  assert.equal(C.prefixeDe('Œufs'), 'OEU');
  assert.equal(C.prefixeDe('A'), 'AX');
  assert.deepEqual([...C.candidatsPrefixe('Farines')].slice(0, 4), ['FAR', 'FARI', 'FAR2', 'FAR3']);
  assert.equal(C.prefixeLibre('Farines', []), 'FAR');
  assert.equal(C.prefixeLibre('Farines', ['far']), 'FARI');
  assert.equal(C.prefixeLibre('Farines', ['FAR', 'FARI']), 'FAR2');
  assert.equal(C.prefixeLibre('Far', ['FAR']), 'FAR2', 'nom de 3 lettres : pas de 4e lettre');
  assert.equal(C.prefixeLibre('Artisanal', []), 'ARTI', 'ART réservé');
  assert.equal(C.prefixeLibre('Produits', []), 'PRO');
  assert.equal(C.prefixeLibre('Prd', []), 'PRD2');
  assert.ok(C.PREFIXE_RE.test('FAR') && C.PREFIXE_RE.test('FA') && C.PREFIXE_RE.test('FAR2') && !C.PREFIXE_RE.test('F') && !C.PREFIXE_RE.test('FARIN') && !C.PREFIXE_RE.test('fa-r'));
  assert.equal(C.normaliserPrefixe(' fa r '), 'FAR');
});

test('codes : prochain numéro par préfixe (4 chiffres au moins), forme contrôlée, normalisation, libellé avec code', () => {
  assert.equal(C.prochainCode('FAR', []), 'FAR-0001');
  assert.equal(C.prochainCode('FAR', ['FAR-0001', 'far-0007', 'SUC-0100', 'FAR-X']), 'FAR-0008');
  assert.equal(C.prochainCode('FAR', ['FAR-9999']), 'FAR-10000');
  assert.equal(C.prochainCode('FAR2', ['FAR2-0003', 'FAR-0009']), 'FAR2-0004', 'préfixe à chiffre : regex échappée, FAR-0009 ignoré');
  assert.ok(C.CODE_RE.test('FAR-0001') && C.CODE_RE.test('AB') && C.CODE_RE.test('A1-B2-C3') && !C.CODE_RE.test('A') && !C.CODE_RE.test('-AB') && !C.CODE_RE.test('FAR 0001') && !C.CODE_RE.test('X'.repeat(21)));
  assert.equal(C.normaliserCode(' far 0001 '), 'FAR-0001');
  assert.equal(C.libelleAvecCode('FAR-0012', 'Farine'), 'FAR-0012 Farine');
  assert.equal(C.libelleAvecCode(null, 'Farine'), 'Farine');
  assert.deepEqual(C.PREFIXE_SANS_CATEGORIE, { article: 'ART', produit: 'PRD' });
});

test('migration 248 : colonnes, préfixes posés par compte, codes par catégorie après le plus grand numéro existant, références vides remplies, index uniques ; idempotente', () => {
  const sql = lire('migrations', '248_codes_articles.sql');
  assert.ok(!sql.includes('\r'));
  for (const attendu of [
    'ALTER TABLE categories         ADD COLUMN IF NOT EXISTS prefixe_code VARCHAR(4);',
    'ALTER TABLE categories_produit ADD COLUMN IF NOT EXISTS prefixe_code VARCHAR(4);',
    'ALTER TABLE articles           ADD COLUMN IF NOT EXISTS code         VARCHAR(20);',
    "pris := pris || ARRAY['ART', 'PRD'];",
    "WHERE prefixe_code IS NULL AND client_id IS NOT NULL",
    "row_number() OVER (PARTITION BY a.client_id, COALESCE(c.prefixe_code, 'ART') ORDER BY a.id) AS rn",
    'WHERE a.code IS NULL',
    "SET code = num.pre || '-' || lpad((num.rn + COALESCE(e.maxn, 0))::text, 4, '0')",
    "WHERE NULLIF(BTRIM(p.ref_produit), '') IS NULL",
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_articles_client_code ON articles (client_id, UPPER(code)) WHERE code IS NOT NULL;',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_client_prefixe ON categories (client_id, UPPER(prefixe_code))',
    'CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_produit_client_prefixe ON categories_produit (client_id, UPPER(prefixe_code))',
  ]) assert.ok(sql.includes(attendu), attendu);
  assert.ok(!/DROP TABLE|DELETE FROM/.test(sql));
});

test('articles : code proposé ou contrôlé à la création, modifiable (vide = inchangé), gardé au changement de catégorie, lu, proposition exposée', () => {
  const c = lire('src', 'controllers', 'articlesController.js');
  assert.ok(c.includes("code = await CS.codePourFiche(client, clientId, { code: req.body.code, categorieId: categorie_id, genre: 'article' });"));
  assert.ok(c.includes('INSERT INTO articles (nom, unite_id, client_id, categorie_id, created_by, code)'));
  assert.ok(c.includes('code = COALESCE($9, code),'), 'modification : vide = inchangé ; catégorie changée = code gardé');
  assert.ok(c.includes("code = await CS.verifierCode(client, clientId, req.body.code, { exclureArticleId: Number(req.params.id) });"));
  assert.ok(c.includes('code: row.code || null,'));
  assert.ok(c.includes('const codePropose = async (req, res) => {'));
  assert.ok(lire('src', 'routes', 'articles.js').includes("router.get('/code-propose', authenticate, requireClient, codePropose);"));
  const r = lire('src', 'routes', 'articles.js');
  assert.ok(r.indexOf("'/code-propose'") < r.indexOf("router.get('/:id'"), 'avant la route /:id');
});

test('catégories (articles et produits) : préfixe proposé ou contrôlé, modifiable, unique entre les deux tables, proposition exposée', () => {
  for (const [fichier, table, route] of [['categoriesController.js', 'categories', 'categories.js'], ['categoriesProduitController.js', 'categories_produit', 'categoriesProduit.js']]) {
    const c = lire('src', 'controllers', fichier);
    assert.ok(c.includes('prefixe = await CS.prefixePourCategorie(pool, clientId, { prefixe: req.body.prefixeCode, nom });'), fichier);
    assert.ok(c.includes(`prefixe = await CS.verifierPrefixe(pool, clientId, req.body.prefixeCode, { table: '${table}', id: req.params.id });`), fichier);
    assert.ok(c.includes('prefixeCode: row.prefixe_code || null,'), fichier);
    assert.ok(c.includes('prefixe_code = COALESCE('), fichier);
    assert.ok(c.includes('const prefixePropose = async (req, res) => {'), fichier);
    const r = lire('src', 'routes', route);
    assert.ok(r.includes("router.get('/prefixe-propose', authenticate, requireClient, prefixePropose);") && r.indexOf("'/prefixe-propose'") < r.indexOf("router.get('/:id'"), route);
  }
  const s = lire('src', 'services', 'codesArticlesService.js');
  assert.ok(s.includes("SELECT 'categories' AS t, id, prefixe_code AS p FROM categories WHERE client_id = $1") && s.includes("SELECT 'categories_produit' AS t, id, prefixe_code AS p FROM categories_produit WHERE client_id = $1"), 'préfixes pris : les deux tables');
  assert.ok(s.includes('SELECT 1 FROM articles WHERE client_id = $1 AND UPPER(code) = $2') && s.includes('SELECT 1 FROM produits WHERE client_id = $1 AND UPPER(BTRIM(ref_produit)) = $2'), 'codes pris : articles et produits');
});

test('produits : référence proposée ou contrôlée à la création, contrôlée à la modification, proposition exposée', () => {
  const c = lire('src', 'controllers', 'produitsController.js');
  assert.ok(c.includes("refFinale = await CS.codePourFiche(client, clientId, { code: refProduit, categorieId: catId, genre: 'produit' });"));
  assert.ok(c.includes('[nom, description || null, refFinale, type,'));
  assert.ok(c.includes('refProduit = await CS.verifierCode(pool, req.user.gerant_parent_id || req.user.id, refProduit, { exclureProduitId: Number(id) });'));
  assert.ok(c.includes('const refProposee = async (req, res) => {') && /\n  refProposee,\n\};\n/.test(c));
  const r = lire('src', 'routes', 'produits.js');
  assert.ok(r.includes("router.get('/ref-proposee', authenticate, requireClient, refProposee);") && r.indexOf("'/ref-proposee'") < r.indexOf("router.get('/:id'"));
});

test('référentiel : modèle, export et import à 5 colonnes (Code), ancien modèle à 4 colonnes encore lu, code refusé = ligne en erreur', () => {
  const c = lire('src', 'controllers', 'referentielController.js');
  assert.ok(c.includes("const enTetes = (voc) => [...enTetesAvant(voc), 'Code'];"));
  assert.ok(c.includes('const suite = HEADERS_AVANT.slice(1).map((h) => h.toLowerCase());'));
  assert.ok(c.includes('findHeaderRow(ws, enTetesAvant(voc)) ?? findHeaderRow(ws, HEADERS_AVANT) ?? ligneEnTetesLibre(ws) ?? 1'));
  assert.ok(c.includes("const code     = String(row.getCell(5).value || '').trim();"));
  assert.ok(c.includes('lignes: r.rows.map((x) => [x.nom, x.unite, x.categorie, x.famille, x.code || \'\']),'));
  assert.ok(c.includes("code = await CS.codePourFiche(client, clientId, { code: r.code, categorieId, genre: 'article' });"));
  assert.ok(c.includes("INSERT INTO categories (nom, client_id, famille_id, prefixe_code)"), 'catégorie créée par l\'import : préfixe');
});

test('écrans de stock, transferts, inventaires, historiques, exports : le code accompagne le nom', () => {
  const st = lire('src', 'controllers', 'stockController.js');
  assert.ok(st.includes('SELECT i.id as ingredient_id, i.nom, i.code, u.nom as unite_nom,') && st.includes('code: row.code ?? null,'));
  assert.ok(st.includes('ingredientCode: r.ingredient_code ?? null,') && st.includes('libelleAvecCode(r.ingredient_code, r.ingredient_nom),'));
  const la = lire('src', 'controllers', 'laboController.js');
  assert.ok(la.includes('SELECT i.id, i.nom, i.code, u.nom as unite,') && la.includes('SELECT sub.ingredient_id, sub.nom, sub.code, sub.unite_nom, sub.categorie,'));
  assert.equal((la.match(/ingredientCode: r\.ingredient_code \?\? null,/g) || []).length, 2, 'historique des deux onglets');
  assert.equal((la.match(/libelleAvecCode\(r\.ingredient_code, r\.ingredient_nom\)/g) || []).length, 2, 'exports historique et transferts');
  const en = lire('src', 'controllers', 'entrepriseController.js');
  assert.ok(en.includes('SELECT a.id, a.nom, a.code, u.nom as unite,') && en.includes('code: r.code ?? null,'));
  const inv = lire('src', 'controllers', 'inventaireController.js');
  assert.equal((inv.match(/SELECT i\.id as ingredient_id, i\.nom, i\.code, u\.nom as unite_nom,/g) || []).length, 2);
});

test('pont comptable : les lignes gardent leur regroupement par compte, taux et tiers ; leur libellé nomme les articles par leur code', () => {
  const codes = { tva: new Map([['19', { compteId: 43, taxeId: 7 }]]), fodec: { compteId: null, taxeId: null }, timbre: { compteId: null, taxeId: null } };
  const base = { codes, fournisseur: { compteId: 401, tiersId: 5 }, libelle: 'Facture F-12 — SMDA', reference: 'F-12' };
  const { lignes } = P.ecritureDeFacture({
    ...base,
    lignes: [
      { montant: 10000n, tauxTva: '19', compteId: 601, article: { code: 'FAR-0012', nom: 'Farine' } },
      { montant: 5000n, tauxTva: '19', compteId: 601, article: { code: 'SUC-0003', nom: 'Sucre' } },
      { montant: 2000n, tauxTva: '19', compteId: 607, article: { code: null, nom: 'Boisson revendue' } },
      { montant: 1000n, tauxTva: '19', compteId: 604 },
    ],
  });
  assert.deepEqual(lignes.map((l) => [l.compteId, l.libelle]), [
    [601, 'FAR-0012 Farine, SUC-0003 Sucre — facture F-12'],
    [607, 'Boisson revendue — facture F-12'],
    [604, 'Facture F-12 — SMDA'],
    [43, 'TVA 19 % — facture F-12'],
    [401, 'Facture F-12 — SMDA'],
  ]);
  // Sans article (appel d'avant D3) : libellés inchangés.
  const avant = P.ecritureDeFacture({ ...base, lignes: [{ montant: 10000n, tauxTva: '19', compteId: 601 }] });
  assert.deepEqual(avant.lignes.map((l) => l.libelle), ['Facture F-12 — SMDA', 'TVA 19 % — facture F-12', 'Facture F-12 — SMDA']);
  const pont = lire('src', 'services', 'pontCompta.js');
  assert.ok(pont.includes("article: a ? { code: a.code || null, nom: a.nom } : null"));
  assert.ok(pont.includes('return { id: k.id, article: c.article || null };'));
  assert.ok(pont.includes('compteId: comptes[i].id, article: comptes[i].article,'));
  assert.ok(lire('src', 'compta', 'comptesAchat.js').includes('code: a.code || null,'), 'page Comptes d\'achat');
});

test('manuel 249 : fiches du référentiel (articles, catégories, import) et des catégories de produits révisées', () => {
  const r = require('../scripts/manuel/revisions.json');
  const m = r.migrations.find((x) => x.numero === 249);
  assert.ok(m, 'entrée 249');
  assert.deepEqual(m.manuel.map((f) => f.slug).sort(), ['categories-produits', 'referentiel-articles', 'referentiel-categories', 'referentiel-import']);
  assert.ok(fs.existsSync(path.join(RACINE, 'migrations', m.nom)));
  assert.ok(lire('scripts', 'manuel', 'balise', 'manuel', 'referentiel-articles.md').includes('### Le code [[de:article:pl]]'));
  assert.ok(lire('scripts', 'manuel', 'balise', 'manuel', 'referentiel-categories.md').includes('**Préfixe**'));
  assert.ok(lire('scripts', 'manuel', 'balise', 'manuel', 'referentiel-import.md').includes('Famille / Code'));
});
