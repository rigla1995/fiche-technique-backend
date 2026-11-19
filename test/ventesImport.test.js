// V1a « Importer un fichier de caisse » (labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis). Tests sans
// base : clés d'apprentissage, contrôle du corps envoyé par l'écran (répartition par canal, catégorie de livraison),
// prix d'une ligne importée, ventes par canal, migration 262 et câblage (service partagé avec la saisie, routes, règle).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const VI = require('../src/utils/ventesImport');

const LIEN_A = '11111111-1111-4111-8111-111111111111';
const LIEN_B = '22222222-2222-4222-8222-222222222222';
const EMPREINTE = 'a'.repeat(64);
const ligne = (plus = {}) => ({
  categorie: 'MENU PRINCIPAL', designation: 'PIZZA REINE', quantite: 10, montant: 200, article_type: 'produit', article_id: 7,
  repartition: [{ canal: 'directe', quantite: 10 }], ...plus,
});
const corps = (plus = {}) => ({
  date_vente: '2026-11-05', source: 'excel', empreinte: EMPREINTE, fichier_nom: 'caisse.xlsx',
  categories: [{ nom: 'MENU PRINCIPAL', livraison: false }, { nom: 'DELIVERY', livraison: true }], lignes: [ligne()], ...plus,
});
const refus = (fn, code) => assert.throws(fn, (e) => e instanceof VI.ErreurImport && e.status === 400 && e.code === code, code);
const lu = (plus) => VI.lireImport(corps(plus), '2026-11-18');

test('clés : la catégorie entre dans la clé d\'une ligne ; casse et accents ne comptent pas', () => {
  assert.equal(VI.cleCategorie(' Delivery '), 'delivery');
  assert.equal(VI.cleCategorie('MENU  PRINCIPAL'), 'menu principal');
  assert.equal(VI.cleCategorie(null), '');
  // Le même plat dans deux cartes du fichier : deux clés (la désignation seule les confondrait).
  assert.equal(VI.cleCorrespondance('DELIVERY', 'Tajine de bœuf'), 'delivery|tajine de boeuf');
  assert.equal(VI.cleCorrespondance('MENU PRINCIPAL', 'TAJINE DE BOEUF'), 'menu principal|tajine de boeuf');
  assert.equal(VI.cleCorrespondance(null, 'Soda 0,33L'), '|soda 0,33l');
  assert.ok(VI.cleCorrespondance('x'.repeat(200), 'y'.repeat(400)).length <= 330);
});

test('lireImport : un corps juste ; le total enregistré ne compte pas les lignes ignorées', () => {
  const d = lu({ total_lu: '663,1', lignes: [
    ligne(),
    ligne({ categorie: 'DELIVERY', designation: ' Pizza   reine ', quantite: 16, montant: 400, repartition: [{ canal: LIEN_A.toUpperCase(), quantite: 12 }, { canal: LIEN_B, quantite: 4 }] }),
    { categorie: 'MENU PRINCIPAL', designation: 'Service', quantite: 1, montant: 2, ignoree: true },
  ] });
  assert.equal(d.dateVente, '2026-11-05');
  assert.equal(d.totalLu, 663.1);
  assert.equal(d.totalEnregistre, 600);
  assert.equal(d.lignes.length, 3);
  assert.deepEqual(d.lignes[1], { rang: 2, categorie: 'DELIVERY', designation: 'Pizza reine', quantite: 16, montant: 400, ignoree: false, toujours: false, articleType: 'produit', articleId: 7,
    cibles: [{ articleType: 'produit', articleId: 7, quantite: 1, montant: 400 }], repartition: [{ canal: LIEN_A, quantite: 12 }, { canal: LIEN_B, quantite: 4 }] });
  assert.deepEqual(d.lignes[2], { rang: 3, categorie: 'MENU PRINCIPAL', designation: 'Service', quantite: 1, montant: 2, ignoree: true, toujours: false, articleType: null, articleId: null, cibles: [], repartition: [] });
  assert.deepEqual(d.categories, [{ cle: 'menu principal', nom: 'MENU PRINCIPAL', livraison: false }, { cle: 'delivery', nom: 'DELIVERY', livraison: true }]);
  // Sans catégorie, sans total lu : accepté (un fichier peut n'avoir ni l'un ni l'autre).
  const simple = lu({ categories: undefined, lignes: [ligne({ categorie: null })] });
  assert.equal(simple.totalLu, null);
  assert.deepEqual(simple.categories, []);
});

test('lireImport : date, source, empreinte, lignes', () => {
  refus(() => lu({ date_vente: '05/11/2026' }), 'DATE_INVALIDE');
  refus(() => lu({ date_vente: '2026-02-30' }), 'DATE_INVALIDE');
  refus(() => lu({ date_vente: '2026-11-20' }), 'DATE_FUTURE');
  assert.equal(lu({ date_vente: '2026-11-19' }).dateVente, '2026-11-19'); // un jour d'avance toléré (fuseau)
  refus(() => lu({ source: 'photo' }), 'SOURCE_INVALIDE');
  refus(() => lu({ empreinte: 'abc' }), 'EMPREINTE_INVALIDE');
  refus(() => lu({ lignes: [] }), 'LIGNES_REQUISES');
  refus(() => lu({ lignes: [{ designation: 'Service', quantite: 1, montant: 2, ignoree: true }] }), 'LIGNES_REQUISES');
  refus(() => lu({ lignes: new Array(VI.LIGNES_MAX + 1).fill(ligne()) }), 'LIGNES_TROP');
  refus(() => lu({ lignes: [ligne({ designation: '  ' })] }), 'LIGNE_INVALIDE');
  refus(() => lu({ lignes: [ligne({ quantite: 0 })] }), 'LIGNE_INVALIDE');
  refus(() => lu({ lignes: [ligne({ montant: -1 })] }), 'LIGNE_INVALIDE');
  refus(() => lu({ lignes: [ligne({ article_id: undefined })] }), 'PRODUIT_REQUIS');
  refus(() => lu({ lignes: [ligne({ article_type: 'vente' })] }), 'PRODUIT_REQUIS');
  refus(() => lu({ total_lu: 'beaucoup' }), 'TOTAL_INVALIDE');
});

test('lireImport : la répartition par canal égale la quantité du fichier ; livraison = prestataires seulement', () => {
  refus(() => lu({ lignes: [ligne({ repartition: [] })] }), 'REPARTITION_INVALIDE');
  refus(() => lu({ lignes: [ligne({ repartition: [{ canal: 'directe', quantite: 9 }] })] }), 'REPARTITION_INVALIDE');
  refus(() => lu({ lignes: [ligne({ repartition: [{ canal: 'directe', quantite: 6 }, { canal: 'directe', quantite: 4 }] })] }), 'REPARTITION_INVALIDE');
  refus(() => lu({ lignes: [ligne({ repartition: [{ canal: 'directe', quantite: 10 }, { canal: LIEN_A, quantite: 0 }] })] }), 'REPARTITION_INVALIDE');
  refus(() => lu({ lignes: [ligne({ repartition: [{ canal: 'glovo', quantite: 10 }] })] }), 'CANAL_INVALIDE');
  // Le reste en vente directe : 100 vendus, 36 chez un prestataire, 14 chez l'autre, 50 en direct (exemple du client).
  const d = lu({ lignes: [ligne({ quantite: 100, montant: 2000, repartition: [{ canal: LIEN_A, quantite: 36 }, { canal: LIEN_B, quantite: 14 }, { canal: 'directe', quantite: 50 }] })] });
  assert.equal(d.lignes[0].repartition.length, 3);
  // Catégorie de livraison : rien en vente directe (la casse du nom ne compte pas).
  refus(() => lu({ lignes: [ligne({ categorie: 'Delivery', repartition: [{ canal: 'directe', quantite: 1 }, { canal: LIEN_A, quantite: 9 }] })] }), 'LIVRAISON_SANS_DIRECTE');
  assert.equal(lu({ lignes: [ligne({ categorie: 'Delivery', repartition: [{ canal: LIEN_A, quantite: 10 }] })] }).lignes[0].repartition[0].canal, LIEN_A);
  // Une ligne ignorée d'une catégorie de livraison n'a pas à être répartie.
  assert.equal(lu({ lignes: [ligne(), { categorie: 'DELIVERY', designation: 'Frais', quantite: 1, montant: 3, ignoree: true }] }).lignes[1].ignoree, true);
  // Quantités décimales (au millime).
  assert.equal(lu({ lignes: [ligne({ quantite: 2.5, repartition: [{ canal: 'directe', quantite: 1.25 }, { canal: LIEN_A, quantite: 1.25 }] })] }).lignes[0].quantite, 2.5);
});

test('prix d\'une ligne importée : montant ÷ quantité, le chiffre retombe sur celui du fichier au millime', () => {
  assert.equal(VI.prixUnitaire(400, 16), 25);
  assert.equal(VI.prixUnitaire(145.62, 7), 20.802857);
  assert.equal(VI.millime(7 * VI.prixUnitaire(145.62, 7)), 145.62);
  assert.equal(VI.millime(5 * VI.prixUnitaire(94.38, 5)), 94.38);
  // Répartie entre trois canaux, la ligne garde son chiffre.
  const p = VI.prixUnitaire(61.1, 7);
  assert.equal(VI.millime(3 * p + 2 * p + 2 * p), 61.1);
  for (const [montant, quantite] of [[999.999, 997], [0.001, 3], [12345.678, 13]]) {
    assert.ok(Math.abs(quantite * VI.prixUnitaire(montant, quantite) - montant) < 0.0005, `${montant} ÷ ${quantite}`);
  }
});

test('ventesParCanal : une vente par canal, la vente directe d\'abord, les lignes ignorées écartées', () => {
  const d = lu({ lignes: [
    ligne({ quantite: 100, montant: 2000, repartition: [{ canal: LIEN_B, quantite: 14 }, { canal: 'directe', quantite: 50 }, { canal: LIEN_A, quantite: 36 }] }),
    ligne({ designation: 'SALADE', article_id: 8, quantite: 7, montant: 61.1, repartition: [{ canal: 'directe', quantite: 7 }] }),
    { designation: 'Service', quantite: 1, montant: 2, ignoree: true },
  ] });
  const v = VI.ventesParCanal(d.lignes);
  assert.deepEqual([...v.keys()], ['directe', LIEN_A, LIEN_B]);
  assert.deepEqual(v.get('directe'), [
    { article_type: 'produit', article_id: 7, quantite: 50, prix_unitaire: 20 },
    { article_type: 'produit', article_id: 8, quantite: 7, prix_unitaire: 8.728571 },
  ]);
  assert.deepEqual(v.get(LIEN_A), [{ article_type: 'produit', article_id: 7, quantite: 36, prix_unitaire: 20 }]);
  assert.deepEqual(v.get(LIEN_B), [{ article_type: 'produit', article_id: 7, quantite: 14, prix_unitaire: 20 }]);
});

test('migration 262 : prix à 6 décimales, une journée et un fichier une seule fois, règle « caisse » hors restauration', () => {
  const sql = lire('migrations', '262_ventes_imports.sql');
  assert.ok(!sql.includes('\r'));
  assert.match(sql, /ALTER TABLE vente_lignes ALTER COLUMN prix_unitaire TYPE NUMERIC\(14,6\);/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ux_ventes_imports_jour ON ventes_imports \(activite_id, date_vente\) WHERE statut = 'enregistre';/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS ux_ventes_imports_fichier ON ventes_imports \(activite_id, empreinte\) WHERE statut = 'enregistre';/);
  assert.match(sql, /ALTER TABLE ventes ADD COLUMN IF NOT EXISTS import_id INTEGER REFERENCES ventes_imports\(id\) ON DELETE SET NULL;/);
  for (const table of ['ventes_imports', 'ventes_imports_lignes', 'correspondances_ventes', 'correspondances_ventes_cibles', 'caisse_categories']) {
    assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS ${table} (`), table);
  }
  assert.match(sql, /'\{"caisse": false\}'::jsonb\s+WHERE slug IN \('hotellerie', 'ceramique', 'usine'\)\s+AND NOT \(COALESCE\(regles, '\{\}'::jsonb\) \? 'caisse'\);/);
});

test('câblage : l\'import crée ses ventes par le service de la saisie ; routes avant /ventes/:id ; règle de domaine', () => {
  const service = lire('src', 'services', 'ventesImport.js');
  assert.match(service, /const \{ verifierVente, ecrireVente, effacerVente \} = require\('\.\/ventesEcriture'\);/);
  assert.match(service, /const \{ conditions, moduleVenteActif \} = await verifierVente\(db, vente\);\s+const ecrite = await ecrireVente\(db, \{ \.\.\.vente, userId, conditions, moduleVenteActif, importId: importe\.id \}\);/);
  for (const code of ['FICHIER_DEJA_IMPORTE', 'JOUR_DEJA_IMPORTE', 'ARTICLE_INTROUVABLE', 'CANAL_INTROUVABLE']) assert.ok(service.includes(`'${code}'`), code);
  const ecriture = lire('src', 'services', 'ventesEcriture.js');
  assert.match(ecriture, /async function ecrireVente\(client, \{ [^}]*importId = null \}\)/);
  assert.ok(!/\breq\.|\bres\./.test(ecriture), 'le service ne connaît ni la requête ni la réponse');

  const routes = lire('src', 'routes', 'ventes.js');
  const contexte = routes.indexOf("router.get('/ventes/imports/contexte', authenticate, requireEntreprise, vi.contexte);");
  const creer = routes.indexOf("router.post('/ventes/imports', authenticate, requireEntreprise, vi.creer);");
  assert.ok(contexte > 0 && creer > contexte && creer < routes.indexOf("router.get('/ventes/:id'"));

  const ctrl = lire('src', 'controllers', 'ventesImportController.js');
  assert.match(ctrl, /if \(regles\.caisse === false\) \{\s+throw new VI\.ErreurImport\(403, 'CAISSE_DESACTIVEE'/);
  assert.match(ctrl, /await db\.query\('BEGIN'\);\s+const \{ documentsAEffacer, \.\.\.resultat \} = await ventesImport\.enregistrer\(db, \{ clientId, user: userOf\(req\), activiteId, donnees \}\);\s+await db\.query\('COMMIT'\);/);
  const P = require('../src/services/domaineProfilService');
  assert.equal(P.REGLES_DEFAUT.caisse, true);
  assert.ok(P.REGLES_CLES.includes('caisse'));
  assert.equal(P.resolveRegles({ caisse: false }).caisse, false);
  assert.ok(lire('src', 'controllers', 'domainesController.js').includes("'prestataires', 'caisse'].includes(k) && typeof v !== 'boolean'"));
});

// ── V1b : tout fichier, journées et documents ────────────────────────────────────────────────────────────────────────

test('V1b — corps : la source CSV, le remplacement et le modèle de colonnes', () => {
  const d = VI.lireImport(corps({ source: 'csv' }), '2026-11-18');
  assert.equal(d.source, 'csv');
  assert.equal(d.remplacer, false, 'sans « remplacer », une journée déjà importée reste refusée');
  assert.equal(d.modeleColonnes, null);
  assert.equal(VI.lireImport(corps({ remplacer: true }), '2026-11-18').remplacer, true);
  assert.equal(VI.lireImport(corps({ remplacer: 'oui' }), '2026-11-18').remplacer, false, 'seul le booléen vrai remplace');
  assert.throws(() => VI.lireImport(corps({ source: 'ods' }), '2026-11-18'), (e) => e.code === 'SOURCE_INVALIDE' && e.status === 400);

  const m = VI.lireImport(corps({ colonnes: { signature: '  produit |  qte | total ', colonnes: { designation: 1, quantite: 2, montant: 3, categorie: 5, inconnue: 9 } } }), '2026-11-18').modeleColonnes;
  assert.deepEqual(m, { signature: 'produit | qte | total', colonnes: { designation: 1, quantite: 2, montant: 3, categorie: 5 } });
  assert.deepEqual(VI.lireModeleColonnes({ signature: 's', colonnes: { designation: 2, quantite: 3, prixUnitaire: 4 } }).colonnes, { designation: 2, quantite: 3, prixUnitaire: 4 },
    'le prix unitaire suffit quand le fichier ne donne pas le montant de la ligne');
  const refuse = (v) => assert.throws(() => VI.lireModeleColonnes(v), (e) => e.code === 'MODELE_INVALIDE' && e.status === 400, JSON.stringify(v));
  refuse({ signature: '', colonnes: { designation: 1, quantite: 2, montant: 3 } });
  refuse({ signature: 's', colonnes: { designation: 1, quantite: 2 } });
  refuse({ signature: 's', colonnes: { designation: 1, quantite: 1, montant: 3 } });
  refuse({ signature: 's', colonnes: { designation: 0, quantite: 2, montant: 3 } });
  refuse({ signature: 's', colonnes: { designation: 1.5, quantite: 2, montant: 3 } });
  refuse({ signature: 's', colonnes: { quantite: 2, montant: 3 } });
  refuse([]);
  refuse('modele');
  assert.ok(VI.SOURCES.includes('csv'));
});

test('V1b — annuler un import : un gérant n\'annule que ses imports ; les ventes passent par effacerVente', async () => {
  const VS = require('../src/services/ventesImport');
  const requetes = [];
  const base = (lignes) => ({
    query: async (sql, params) => {
      requetes.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/FROM ventes_imports/.test(sql) && /FOR UPDATE/.test(sql)) return { rows: lignes };
      if (/^\s*SELECT \* FROM ventes WHERE import_id/.test(sql)) return { rows: [] };
      return { rows: [], rowCount: 1 };
    },
  });
  const imp = { id: 41, created_by: 7, document_cle: 'clients/7/pieces/2026/11/x-caisse.csv', date_vente: '2026-11-05' };

  await assert.rejects(() => VS.annuler(base([imp]), { activiteId: 3, user: { id: 9, role: 'gerant' }, importId: 41 }),
    (e) => e.code === 'IMPORT_D_UN_AUTRE' && e.status === 403 && /05\/11\/2026/.test(e.message));
  assert.ok(!requetes.some((q) => /^UPDATE ventes_imports/.test(q.sql)), 'rien n\'est écrit quand l\'annulation est refusée');

  requetes.length = 0;
  const fait = await VS.annuler(base([imp]), { activiteId: 3, user: { id: 7, role: 'gerant' }, importId: 41 });
  assert.deepEqual(fait, { id: 41, date_vente: '2026-11-05', ventes: 0, documentCle: imp.document_cle });
  assert.match(requetes[0].sql, /WHERE activite_id = \$1 AND statut = 'enregistre' AND id = \$2 FOR UPDATE$/);
  const maj = requetes.find((q) => /^UPDATE ventes_imports/.test(q.sql));
  assert.match(maj.sql, /SET statut = 'annule', annule_le = NOW\(\), annule_par = \$2, remplace_par = \$3, document_cle = NULL/);
  assert.deepEqual(maj.params, [41, 7, null]);

  requetes.length = 0;
  const parDate = await VS.annuler(base([imp]), { activiteId: 3, user: { id: 1, role: 'client' }, date: '2026-11-05' });
  assert.equal(parDate.id, 41, 'le compte annule l\'import d\'un gérant');
  assert.match(requetes[0].sql, /AND date_vente = \$2::date FOR UPDATE$/);
  assert.equal(await VS.annuler(base([]), { activiteId: 3, user: { id: 1, role: 'client' }, date: '2026-11-06' }), null, 'rien à annuler');
});

test('V1b — câblage : migration 264, service partagé de l\'annulation, routes, document', () => {
  const sql = lire('migrations', '264_ventes_imports_v1b.sql');
  assert.match(sql, /DROP CONSTRAINT IF EXISTS ventes_imports_source_check;\s+ALTER TABLE ventes_imports ADD CONSTRAINT ventes_imports_source_check CHECK \(source IN \('excel', 'pdf', 'csv'\)\);/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS caisse_modeles \([\s\S]*UNIQUE \(activite_id, signature\)/);
  for (const colonne of ['annule_le', 'annule_par', 'remplace_par', 'document_cle', 'document_type', 'document_taille']) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${colonne}\\s`), colonne);
  // Une seconde clé « ON DELETE SET NULL » sur ventes_imports fait échouer la suppression d'un compte.
  assert.match(sql, /ADD COLUMN IF NOT EXISTS annule_par\s+INTEGER,\s+ADD COLUMN IF NOT EXISTS remplace_par\s+INTEGER,/);
  assert.ok(!/(annule_par|remplace_par)\s+INTEGER REFERENCES/.test(sql));

  const ecriture = lire('src', 'services', 'ventesEcriture.js');
  assert.match(ecriture, /async function effacerVente\(client, vente\) \{/);
  assert.match(ecriture, /module\.exports = \{ verifierVente, ecrireVente, effacerVente, MSG_PRESTATAIRES_DESACTIVES \};/);
  const corpsEffacer = ecriture.slice(ecriture.indexOf('async function effacerVente'));
  assert.ok(!/\bpool\./.test(corpsEffacer), 'tout se fait dans la transaction de l\'appelant');
  const ventes = lire('src', 'controllers', 'ventesController.js');
  assert.match(ventes, /await client\.query\('BEGIN'\);\s+await effacerVente\(client, vente\);\s+await client\.query\('COMMIT'\);/);
  assert.ok(!ventes.includes('DELETE FROM vente_lignes'), 'le contrôleur ne porte plus de copie de l\'annulation');

  const service = lire('src', 'services', 'ventesImport.js');
  assert.match(service, /const remplace = donnees\.remplacer \? await annuler\(db, \{ activiteId, user, date: donnees\.dateVente \}\) : null;\s+await exigerNouveau\(db, activiteId, donnees\);/);
  assert.match(service, /for \(const v of ventes\.rows\) await effacerVente\(db, v\);/);
  assert.match(service, /if \(empreinte !== String\(imp\.empreinte\)\.trim\(\) \|\| !contenuConforme\(imp\.source, octets\)\) \{\s+throw new VI\.ErreurImport\(400, 'DOCUMENT_DIFFERENT'/);
  assert.match(service, /const cle = stockage\.nouvelleCle\(clientId, ext, '-caisse'\);/);
  assert.match(service, /INSERT INTO caisse_modeles \(activite_id, signature, colonnes, updated_at\)/);

  const routes = lire('src', 'routes', 'ventes.js');
  const avantId = routes.indexOf("router.get('/ventes/:id'");
  for (const route of [
    "router.get('/ventes/imports/jour', authenticate, requireEntreprise, vi.jour);",
    "router.get('/ventes/imports', authenticate, requireEntreprise, vi.lister);",
    "router.delete('/ventes/imports/:id', authenticate, requireEntreprise, vi.annuler);",
    "router.post('/ventes/imports/:id/document', authenticate, requireEntreprise, vi.corpsDocument, vi.deposerDocument);",
    "router.get('/ventes/imports/:id/document', authenticate, requireEntreprise, vi.document);",
  ]) assert.ok(routes.indexOf(route) > 0 && routes.indexOf(route) < avantId, route);

  const ctrl = lire('src', 'controllers', 'ventesImportController.js');
  // Le document de l'import remplacé ou annulé ne sort du stockage qu'APRÈS la validation de la transaction.
  assert.match(ctrl, /await db\.query\('COMMIT'\);\s+\/\/[^\n]*\n\s+await ventesImport\.effacerDocuments\(documentsAEffacer\);/);
  assert.match(ctrl, /await db\.query\('COMMIT'\);\s+await ventesImport\.effacerDocuments\(\[fait\.documentCle\]\);/);
  assert.match(ctrl, /res\.setHeader\('Content-Disposition', `attachment; filename=/);
  assert.match(ctrl, /res\.setHeader\('X-Content-Type-Options', 'nosniff'\);/);
});

// ── V1c : menus, formules et lots ────────────────────────────────────────────────────────────────────────────────────

test('V1c — menus et lots : une ligne vaut plusieurs produits, chacun avec sa quantité et sa part du montant', () => {
  const cible = (id, quantite, montant) => ({ article_type: 'produit', article_id: id, quantite, montant });
  const d = VI.lireImport(corps({ categories: [], lignes: [
    { designation: 'MENU DUO', quantite: 10, montant: 150, cibles: [cible(7, 1, 120), cible(8, 1, 30)], repartition: [{ canal: 'directe', quantite: 6 }, { canal: LIEN_A, quantite: 4 }] },
    { designation: 'LOT 6 BRIKS', quantite: 2, montant: 20, cibles: [cible(9, 6, 20)], repartition: [{ canal: 'directe', quantite: 2 }] },
    { designation: 'DEMI', quantite: 3, montant: 9, cibles: [cible(7, 0.5, 9)], repartition: [{ canal: 'directe', quantite: 3 }] },
    ligne({ designation: 'SIMPLE', quantite: 7, montant: 61.1, repartition: [{ canal: 'directe', quantite: 7 }] }),
  ] }), '2026-11-18');
  assert.deepEqual(d.lignes[0].cibles, [{ articleType: 'produit', articleId: 7, quantite: 1, montant: 120 }, { articleType: 'produit', articleId: 8, quantite: 1, montant: 30 }]);
  assert.deepEqual([d.lignes[0].articleType, d.lignes[0].articleId], [null, null], 'plusieurs produits : aucun n\'est porté par la ligne');
  assert.deepEqual([d.lignes[1].articleType, d.lignes[1].articleId], ['produit', 9], 'un lot reste rattaché à son produit');
  assert.deepEqual(d.lignes[3].cibles, [{ articleType: 'produit', articleId: 7, quantite: 1, montant: 61.1 }], 'une ligne simple = un produit, une unité, tout le montant');
  assert.equal(d.totalEnregistre, 240.1);

  const parCanal = VI.ventesParCanal(d.lignes);
  assert.deepEqual([...parCanal.keys()], ['directe', LIEN_A]);
  assert.deepEqual(parCanal.get('directe'), [
    { article_type: 'produit', article_id: 7, quantite: 6, prix_unitaire: 12 },
    { article_type: 'produit', article_id: 8, quantite: 6, prix_unitaire: 3 },
    { article_type: 'produit', article_id: 9, quantite: 12, prix_unitaire: 1.666667 },
    { article_type: 'produit', article_id: 7, quantite: 1.5, prix_unitaire: 6 },
    { article_type: 'produit', article_id: 7, quantite: 7, prix_unitaire: 8.728571 },
  ]);
  assert.deepEqual(parCanal.get(LIEN_A), [{ article_type: 'produit', article_id: 7, quantite: 4, prix_unitaire: 12 }, { article_type: 'produit', article_id: 8, quantite: 4, prix_unitaire: 3 }]);
  // Le chiffre de tous les canaux retombe sur celui du fichier.
  const chiffre = [...parCanal.values()].flat().reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
  assert.ok(Math.abs(chiffre - 240.1) < 0.001, String(chiffre));

  const refuse = (l, code) => assert.throws(() => VI.lireImport(corps({ categories: [], lignes: [{ designation: 'MENU', quantite: 2, montant: 50, repartition: [{ canal: 'directe', quantite: 2 }], ...l }] }), '2026-11-18'),
    (e) => e.code === code && e.status === 400, `${code} ${JSON.stringify(l)}`);
  refuse({ cibles: [] }, 'PRODUIT_REQUIS');
  refuse({ cibles: 'pizza' }, 'PRODUIT_REQUIS');
  refuse({ cibles: [cible(7, 1, 40), { article_type: 'menu', article_id: 8, quantite: 1, montant: 10 }] }, 'PRODUIT_REQUIS');
  refuse({ cibles: [cible(7, 1, 40), cible(7, 2, 10)] }, 'CIBLES_INVALIDES');
  refuse({ cibles: [cible(7, 1, 40), cible(8, 1, 9)] }, 'CIBLES_INVALIDES');
  refuse({ cibles: [cible(7, 0, 40), cible(8, 1, 10)] }, 'CIBLES_INVALIDES');
  refuse({ cibles: [cible(7, 1, 60), cible(8, 1, -10)] }, 'CIBLES_INVALIDES');
  refuse({ cibles: Array.from({ length: VI.CIBLES_MAX + 1 }, (_, i) => cible(7 + i, 1, i === 0 ? 50 : 0)) }, 'CIBLES_INVALIDES');
  refuse({ quantite: 0.002, repartition: [{ canal: 'directe', quantite: 0.002 }], cibles: [cible(7, 0.1, 50)] }, 'CIBLES_INVALIDES');
  assert.equal(VI.lireImport(corps({ categories: [], lignes: [{ designation: 'MENU', quantite: 2, montant: 50, repartition: [{ canal: 'directe', quantite: 2 }],
    cibles: Array.from({ length: VI.CIBLES_MAX }, (_, i) => cible(7 + i, 1, i === 0 ? 50 : 0)) }] }), '2026-11-18').lignes[0].cibles.length, 8);
});

test('V1c — « ignorer toujours » ne vaut que pour une ligne ignorée ; câblage de ce qui est appris', () => {
  const d = VI.lireImport(corps({ lignes: [ligne(), ligne({ designation: 'Pourboire', quantite: 1, montant: 2, ignoree: true, toujours: true }),
    ligne({ designation: 'Divers', quantite: 1, montant: 1, ignoree: true }), ligne({ designation: 'Autre', toujours: true })] }), '2026-11-18');
  assert.deepEqual(d.lignes.map((l) => [l.ignoree, l.toujours]), [[false, false], [true, true], [true, false], [false, false]]);

  const sql = lire('migrations', '266_ventes_imports_v1c.sql');
  assert.match(sql, /ALTER TABLE ventes_imports_lignes ADD COLUMN IF NOT EXISTS cibles JSONB;/);
  const service = lire('src', 'services', 'ventesImport.js');
  assert.match(service, /const cibles = lignes\.flatMap\(\(l\) => l\.cibles\);/);
  assert.match(service, /INSERT INTO correspondances_ventes_cibles \(correspondance_id, article_type, article_id, quantite\) VALUES \(\$1, \$2, \$3, \$4\)',\s+\[c\.rows\[0\]\.id, cible\.articleType, cible\.articleId, cible\.quantite\]/);
  assert.match(service, /VALUES \(\$1, \$2, \$3, \$4, true, \$5, NOW\(\)\)/, 'une ligne ignorée « toujours » est apprise');
  assert.match(service, /DELETE FROM correspondances_ventes WHERE activite_id = \$1 AND cle = \$2 AND ignoree = true/, 'ignorée sans « toujours » : l\'ancien « toujours » est oublié');
  assert.match(service, /l\.ignoree \? null : JSON\.stringify\(l\.cibles\.map\(/);
});
