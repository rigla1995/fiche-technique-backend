// LabFlow Compta, étape S5a « Le paquet Tunisie et le plan de comptes » (labflow-reprise/achats-compta/PLAN-S5.md ;
// réponses du client du 07/10 : dossiers existants initialisés par la migration 212, comptes de 2 à 8 chiffres, Complet
// configure). Tests sans base : le paquet Tunisie (fichier relu : 604 comptes, parents, natures, corrections déclarées),
// la migration 212 (tables, VALUES identiques au fichier, initialisation des dossiers existants, gardes md5 du manuel),
// les lecteurs de saisie du plan, les routes et leurs limites, les branchements dans les dossiers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const paquets = require('../src/compta/paquets');
const plan = require('../src/compta/planComptes');
const planInit = require('../src/compta/planInit');
const dossiers = require('../src/compta/dossiers');

const TN = paquets.PAQUETS.TN;
const parNumero = new Map(TN.comptes.map((c) => [c.numero, c]));

test('paquet Tunisie : fichier relu, 604 comptes de la NC 01 (601 de la liste + 6031, 6032, 6037), sans défaut', () => {
  assert.deepEqual(paquets.controlerPaquet(TN), []);
  assert.equal(TN.pays, 'TN');
  assert.equal(TN.version, '2026.1');
  assert.equal(TN.comptes.length, 604);
  const parLongueur = TN.comptes.reduce((a, c) => { a[c.numero.length] = (a[c.numero.length] || 0) + 1; return a; }, {});
  assert.deepEqual(parLongueur, { 2: 62, 3: 256, 4: 238, 5: 46, 6: 2 });
  assert.equal(parNumero.get('704')?.libelle, 'Travaux', 'le compte coupé sur deux lignes du PDF');
  assert.equal(parNumero.get('603')?.libelle, 'Variation des stocks (approvisionnements et marchandises)', 'présent dans la seule liste de tête');
  for (const [n, l] of [['6031', 'Variation des stocks de matières premières et fournitures'], ['6032', 'Variation des stocks des autres approvisionnements'], ['6037', 'Variation des stocks de marchandises']]) {
    assert.equal(parNumero.get(n)?.libelle, l, n);
    assert.ok(TN.ajouts.some((a) => a.numero === n), `${n} déclaré dans « ajouts »`);
  }
  assert.deepEqual(parNumero.get('436711'), { numero: '436711', libelle: 'TVA collectée sur les débits', nature: 'tva_collectee' });
  assert.equal(parNumero.get('534')?.libelle, 'C.C.P.', 'abréviation gardée');
  assert.equal(parNumero.get('60')?.libelle, 'Achats (sauf 603)', 'appel de note retiré');
  assert.equal(parNumero.get('281')?.note, 'même ventilation que celle du compte 21');
  assert.equal(parNumero.get('39')?.note, 'à ventiler selon la nomenclature de cette classe');
  assert.ok(!('note' in parNumero.get('10')));
  // Les corrections déclarées sont appliquées (texte officiel sinon).
  assert.ok(TN.corrections.length >= 12);
  for (const c of TN.corrections) {
    assert.equal(parNumero.get(c.numero)?.libelle, c.apres, `correction ${c.numero}`);
    assert.notEqual(c.avant, c.apres);
  }
  assert.equal(parNumero.get('6495')?.libelle, 'Autres charges sociales');
  assert.equal(parNumero.get('171')?.libelle, 'Comptes de liaison des établissements');
  assert.ok(!TN.comptes.some((c) => /[’‘]|\.\s/.test(c.libelle)), 'apostrophes droites, aucun point en milieu de libellé');
});

test('paquet Tunisie : natures de la liste fermée, décisives pour les étapes suivantes', () => {
  assert.deepEqual(paquets.NATURES, Object.keys(paquets.NATURES_LIBELLES));
  assert.ok(paquets.NATURES.includes('general') && paquets.NATURES_LIBELLES.banque === 'Banque');
  for (const [n, nature] of [
    ['40', 'fournisseurs'], ['401', 'fournisseurs'], ['4011', 'fournisseurs'], ['404', 'fournisseurs'], ['41', 'clients'], ['4111', 'clients'], ['42', 'personnel'],
    ['432', 'retenues_operees'], ['4341', 'retenues_subies'], ['434', 'etat'], ['43651', 'tva_a_payer'], ['43662', 'tva_deductible'], ['43666', 'tva_deductible'],
    ['43667', 'etat'], ['43658', 'etat'], ['43668', 'etat'], ['43678', 'etat'], ['43671', 'tva_collectee'], ['436712', 'tva_collectee'],
    ['531', 'general'], ['532', 'banque'], ['5321', 'banque'], ['534', 'banque'], ['54', 'caisse'], ['5411', 'caisse'], ['55', 'caisse'],
    ['10', 'capitaux'], ['1685', 'capitaux'], ['21', 'immobilisations'], ['37', 'stocks'], ['601', 'charges'], ['6654', 'charges'], ['707', 'produits'], ['44', 'general'], ['491', 'general'],
  ]) assert.equal(parNumero.get(n)?.nature, nature, n);
});

test('paquet : parent = plus long préfixe existant ; transcription SQL une ligne par compte, apostrophes doublées', () => {
  const numeros = new Set(TN.comptes.map((c) => c.numero));
  assert.equal(paquets.parentParmi('53211', numeros), '5321');
  assert.equal(paquets.parentParmi('5321', numeros), '532');
  assert.equal(paquets.parentParmi('6031', numeros), '603');
  assert.equal(paquets.parentParmi('10', numeros), null);
  assert.equal(paquets.parentParmi('99', numeros), null);
  for (const c of TN.comptes) {
    if (c.numero.length > 2) assert.equal(paquets.parentParmi(c.numero, numeros), c.numero.slice(0, -1), `${c.numero} : parent immédiat`);
  }
  const sql = paquets.sqlValeursPlan(TN);
  const lignes = sql.split('\n');
  assert.equal(lignes.length, TN.comptes.length);
  assert.equal(lignes[0], "  ('10', 'Capital', 'capitaux', NULL, NULL),");
  assert.ok(lignes.includes("  ('5321', 'Comptes en dinars', 'banque', '532', NULL),"));
  assert.ok(lignes.includes("  ('55', 'Régies d''avances et accréditifs', 'caisse', NULL, NULL),"));
  assert.ok(lignes.includes("  ('281', 'Amortissements des immobilisations incorporelles', 'immobilisations', '28', 'même ventilation que celle du compte 21'),"));
  assert.ok(!lignes[lignes.length - 1].endsWith(','), 'dernière ligne sans virgule');
  assert.equal(paquets.sqlTexte("l'eau"), "'l''eau'");
  assert.equal(paquets.sqlTexte(null), 'NULL');
  assert.equal(paquets.paquetDe('tn'), TN);
  assert.equal(paquets.paquetDe('FR'), null);
  assert.deepEqual([paquets.NUMERO_MIN, paquets.NUMERO_MAX], [2, 8], 'réponse 3 du client du 07/10');
  // Le contrôle refuse un paquet défectueux.
  assert.ok(paquets.controlerPaquet({ ...TN, comptes: [...TN.comptes, { numero: '10', libelle: 'Doublon', nature: 'capitaux' }] }).some((d) => /en double|trier/.test(d)));
  assert.ok(paquets.controlerPaquet({ ...TN, comptes: [{ numero: '1', libelle: 'x', nature: 'general' }] }).length > 0);
  assert.ok(paquets.controlerPaquet({ ...TN, comptes: [{ numero: '10', libelle: 'Capital.', nature: 'capitaux' }] }).some((d) => /point/.test(d)));
  assert.ok(paquets.controlerPaquet({ ...TN, comptes: [{ numero: '10', libelle: 'Capital', nature: 'x' }] }).some((d) => /nature/.test(d)));
  assert.ok(paquets.controlerPaquet({ ...TN, comptes: [{ numero: '10', libelle: 'Capital', nature: 'capitaux' }, { numero: '201', libelle: 'Sans parent', nature: 'immobilisations' }] }).some((d) => /parent/.test(d)));
});

test('migration 212 : tables, paquet TN en VALUES identiques au fichier, dossiers existants initialisés, journal', () => {
  const sql = lire('migrations', '212_compta_plan_comptes.sql');
  for (const t of ['CREATE TABLE IF NOT EXISTS compta.ref_paquets', 'CREATE TABLE IF NOT EXISTS compta.ref_plans', 'CREATE TABLE IF NOT EXISTS compta.comptes',
    'ALTER TABLE compta.dossiers ADD COLUMN IF NOT EXISTS paquet_id INTEGER REFERENCES compta.ref_paquets(id) ON DELETE RESTRICT',
    'UNIQUE (dossier_id, numero)', 'UNIQUE (paquet_id, numero)', 'UNIQUE (pays, version)', "numero ~ '^[0-9]{2,8}$'",
    'dossier_id     INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE', 'parent_id      INTEGER REFERENCES compta.comptes(id),',
    "origine IN ('paquet', 'ajout')", 'CREATE INDEX IF NOT EXISTS idx_compta_comptes_parent ON compta.comptes (parent_id)']) {
    assert.ok(sql.includes(t), t);
  }
  assert.ok(sql.includes("VALUES ('TN', '2026.1', 'Tunisie — nomenclature des comptes de la norme comptable générale NC 01'"));
  assert.ok(sql.includes('ON CONFLICT (pays, version) DO NOTHING') && sql.includes('ON CONFLICT (paquet_id, numero) DO NOTHING'), 'idempotente');
  // Le fichier et la migration disent la même chose : les VALUES sont la transcription du paquet.
  const valeurs = paquets.sqlValeursPlan(TN);
  assert.ok(sql.includes(`       (VALUES\n${valeurs}\n       ) AS v(numero, libelle, nature, parent, note)`), 'VALUES du paquet');
  assert.equal((sql.match(/^  \('\d{2,8}', /gm) || []).length, TN.comptes.length, 'une ligne par compte, aucune autre');
  // Dossiers déjà créés : copie du paquet, parents résolus, journal (réponse 2 du client du 07/10).
  assert.ok(sql.includes("WHERE d.pays = 'TN' AND NOT EXISTS (SELECT 1 FROM compta.comptes c WHERE c.dossier_id = d.id)"), 'seulement les dossiers sans compte');
  assert.ok(sql.includes("SELECT c.id, r.numero, r.libelle, LEFT(r.numero, 1)::smallint, r.nature, 'paquet', r.libelle, r.note"));
  assert.ok(sql.includes("'plan_initialise'") && sql.includes("'migration', 212"));
  assert.ok(sql.includes('SET parent_id = p.id') && sql.includes('p.dossier_id = c.dossier_id'), 'parents par numéro, dans le même dossier');
  assert.ok(sql.includes('UPDATE compta.dossiers d SET paquet_id = p.id'));
  assert.ok(!/DROP |DELETE FROM|TRUNCATE/.test(sql), 'additive');
});

test('migration 212 : manuel — gardes md5 des textes des migrations 209 et 211, nouvelle fiche « Plan de comptes »', () => {
  const sql = lire('migrations', '212_compta_plan_comptes.sql');
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  const texteDe = (fichier, marque) => {
    const src = lire('migrations', fichier);
    const debut = src.indexOf(marque) + marque.length;
    return src.slice(debut, src.indexOf(marque, debut));
  };
  const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
  for (const [marque, slug, origine, marqueOrigine, attendu] of [
    ['$f212a$', 'compta-dossier', '209_compta_dossier_client.sql', '$f209c$', 'Configuration'],
    ['$f212b$', 'compta-dossiers', '211_compta_grands_cabinets.sql', '$f211a$', 'Plan de comptes'],
  ]) {
    const garde = md5(texteDe(origine, marqueOrigine));
    assert.ok(sql.includes(`${marque}, '${slug}', '${garde}')`), `${slug} : garde ${garde}`);
    assert.ok(texteDe('212_compta_plan_comptes.sql', marque).includes(attendu), marque);
  }
  assert.ok(sql.includes("('compta-plan-comptes', 'Plan de comptes', '📑', 1060, $f212c$## 📑 Plan de comptes"));
  assert.ok(sql.includes("'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'") && sql.includes('ON CONFLICT (slug) DO NOTHING'));
  const fiche = texteDe('212_compta_plan_comptes.sql', '$f212c$');
  for (const mot of ['Subdiviser', 'Rétablir', 'Désactiver', 'Réactiver', 'Supprimer', 'Exporter (Excel)', 'Afficher les désactivés', '2 à 8 chiffres', 'feuilles']) assert.ok(fiche.includes(mot), mot);
});

test('plan : lecteurs de saisie — numéro de 2 à 8 chiffres, libellé imprimable, nature de la liste, explication facultative', () => {
  assert.equal(plan.lireNumero(' 5321 '), '5321');
  assert.equal(plan.lireNumero(53211), '53211');
  assert.equal(plan.lireNumero('12345678'), '12345678');
  for (const v of ['1', '123456789', '53a1', '', null, undefined, '53 21x', '53 211', {}, []]) assert.throws(() => plan.lireNumero(v), (e) => e.statusCode === 400, JSON.stringify(v));
  assert.equal(plan.lireLibelle('  Banque   BIAT  '), 'Banque BIAT');
  assert.equal(plan.lireLibelle('Caisse « siège » — œuvres'), 'Caisse « siège » — œuvres');
  for (const v of ['', '   ', null, 'x'.repeat(256), 'بنك', 'Caisse 😀', 12]) assert.throws(() => plan.lireLibelle(v), (e) => e.statusCode === 400, JSON.stringify(v));
  assert.equal(plan.lireNature('banque'), 'banque');
  for (const v of ['x', '', null, 'Banque']) assert.throws(() => plan.lireNature(v), (e) => e.statusCode === 400);
  assert.equal(plan.lireExplication(null), null);
  assert.equal(plan.lireExplication(''), null);
  assert.equal(plan.lireExplication('  Compte  bancaire de la BIAT '), 'Compte bancaire de la BIAT');
  for (const v of ['x'.repeat(501), 12, 'شرح']) assert.throws(() => plan.lireExplication(v), (e) => e.statusCode === 400);
  assert.equal(plan.compteMouvemente.constructor.name, 'AsyncFunction', 'seul endroit à compléter à la saisie');
  assert.equal(plan.compteUtilise.constructor.name, 'AsyncFunction', 'seul endroit à compléter avec les journaux, les taxes et les tiers');
  assert.equal(plan.MSG_CONFIGURER, 'Seul le titulaire ou un gérant de niveau Complet peut modifier le plan de comptes');
  assert.deepEqual(plan.COLONNES_EXPORT, ['Numéro', 'Libellé', 'Libellé de la norme', 'Nature', 'Origine', 'État', 'Explication']);
  // Relecture : un changement réel de nature ou d'explication est refusé sur un compte de la norme ; renvoyer la nature
  // actuelle ne l'est pas (le formulaire peut renommer ou rétablir).
  const ctrl = lire('src', 'compta', 'planComptes.js');
  assert.ok(ctrl.includes("if (c.origine !== 'ajout' && (changements.nature || changements.explication)) throw erreur(409"), 'refus sur changement réel seulement');
  assert.ok(ctrl.includes("if (await compteUtilise(db, c.id)) throw erreur(409") && (ctrl.match(/await compteUtilise\(db, c\.id\)/g) || []).length === 3, 'point d\'accroche journal / taxe / tiers sur désactiver, supprimer et (S5c) la nature');
});

test('plan : arbre lu en une requête (sous-comptes comptés), présentation (feuille, renommé)', () => {
  assert.ok(plan.SQL_COMPTES.includes('WHERE c.dossier_id = $1') && plan.SQL_COMPTES.trim().endsWith('ORDER BY c.numero'));
  assert.ok(plan.SQL_COMPTES.includes('COUNT(*) FILTER (WHERE actif)::int AS nb_actifs'));
  const base = { id: 7, numero: '5321', libelle: 'Comptes en dinars', classe: 5, parent_id: 3, nature: 'banque', origine: 'paquet', libelle_paquet: 'Comptes en dinars', note: null, explication: null, actif: true, nb_enfants: 2, nb_enfants_actifs: 0 };
  const c = plan.presenterCompte(base);
  assert.deepEqual(c, { id: 7, numero: '5321', libelle: 'Comptes en dinars', classe: 5, parentId: 3, nature: 'banque', origine: 'paquet', libellePaquet: 'Comptes en dinars', note: null, explication: null, actif: true, nbEnfants: 2, nbEnfantsActifs: 0, feuille: true, renomme: false });
  assert.equal(plan.presenterCompte({ ...base, nb_enfants_actifs: 1 }).feuille, false);
  assert.equal(plan.presenterCompte({ ...base, libelle: 'Banques en dinars' }).renomme, true);
  assert.equal(plan.presenterCompte({ ...base, origine: 'ajout', libelle_paquet: null, libelle: 'BIAT' }).renomme, false, 'un ajout n\'est jamais « renommé »');
});

test('routes S5a : lecture et export pour tout accès, cinq écritures sous limite de débit, droits « configurer »', () => {
  const src = lire('src', 'compta', 'routes.js');
  assert.ok(src.includes("router.get('/dossiers/:dossierId/plan', authenticate, plan.lire);"));
  assert.ok(src.includes("router.get('/dossiers/:dossierId/plan/export', authenticate, plan.exporter);"));
  for (const r of [
    "router.post('/dossiers/:dossierId/plan/comptes', authenticate, limitePlan, plan.ajouter);",
    "router.put('/dossiers/:dossierId/plan/comptes/:compteId', authenticate, limitePlan, plan.modifier);",
    "router.post('/dossiers/:dossierId/plan/comptes/:compteId/desactiver', authenticate, limitePlan, plan.desactiver);",
    "router.post('/dossiers/:dossierId/plan/comptes/:compteId/reactiver', authenticate, limitePlan, plan.reactiver);",
    "router.delete('/dossiers/:dossierId/plan/comptes/:compteId', authenticate, limitePlan, plan.supprimer);",
  ]) assert.ok(src.includes(r), r);
  assert.ok(src.includes('max: 300,\n  keyGenerator: (req) => `plan:${req.user.id}`'), '300 écritures par quart d\'heure et par personne');
  for (const f of ['lire', 'exporter', 'ajouter', 'modifier', 'desactiver', 'reactiver', 'supprimer']) assert.equal(typeof plan[f], 'function', f);
  assert.deepEqual(dossiers.droits({ role: 'titulaire', niveau: 'complet' }).configurer, true);
  assert.deepEqual(dossiers.droits({ role: 'gerant', niveau: 'complet' }).configurer, true);
  for (const niveau of ['saisie', 'consultation']) assert.equal(dossiers.droits({ role: 'gerant', niveau }).configurer, false, niveau);
  // Chaque écriture du plan : droits puis dossier non archivé, dans la transaction du dossier ; toutes rendent l'état du plan.
  const ctrl = lire('src', 'compta', 'planComptes.js');
  assert.ok(ctrl.includes("if (!droits(acces).configurer) throw erreur(403, MSG_CONFIGURER, 'NIVEAU_INSUFFISANT');\n  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\\'abord', 'DOSSIER_ARCHIVE');"));
  assert.equal((ctrl.match(/await ecriturePlan\(req, async \(db, acces, d\) => \{/g) || []).length, 6, 'cinq écritures S5a, plus l\'import du plan (S5c)');
  assert.ok(ctrl.includes("const compteDe = async (db, dossierId, compteId) => {") && ctrl.includes('FOR UPDATE'), 'compte relu sous verrou');
});

test('branchements : le plan naît avec le dossier (assistant, « Mon entreprise »), la fiche résume la configuration', () => {
  assert.equal(typeof planInit.initialiserPlan, 'function');
  assert.equal(typeof planInit.resumePlan, 'function');
  const init = lire('src', 'compta', 'planInit.js');
  assert.ok(init.includes("SELECT 1 FROM compta.comptes WHERE dossier_id = $1 LIMIT 1"), 'idempotente');
  assert.ok(init.includes("'plan_initialise'") && init.includes("origine, libelle_paquet, note)") && init.includes("'paquet', r.libelle, r.note"));
  assert.ok(init.includes('UPDATE compta.dossiers SET paquet_id = $2 WHERE id = $1'));
  const d = lire('src', 'compta', 'dossiers.js');
  const creer = d.slice(d.indexOf('const creer = async (req, res) => {'), d.indexOf('\n};\n', d.indexOf('const creer = async (req, res) => {')));
  assert.ok(creer.includes('await initialiserPlan(db, { dossierId: d.id, espaceId: acces.espace_id, pays: d.pays, auteurId: req.user.id, nom: d.nom });'), 'assistant');
  const fiche = d.slice(d.indexOf('const presenterFiche = async (db, acces, d) => {'), d.indexOf('\n};\n', d.indexOf('const presenterFiche = async')));
  assert.ok(fiche.includes('resumePlan(db, d.id),') && fiche.includes('\n    plan,\n'), 'résumé dans la fiche');
  const lab = lire('src', 'compta', 'dossierLabflow.js');
  assert.ok(lab.includes('await initialiserPlan(db, { dossierId: d.id, espaceId, pays: d.pays, auteurId, nom: d.nom });') && lab.includes('RETURNING id, nom, matricule_fiscal, pays'), '« Mon entreprise »');
  assert.ok(!d.includes("require('./planComptes')"), 'aucun cycle : dossiers.js ne dépend pas des routes du plan');
});
