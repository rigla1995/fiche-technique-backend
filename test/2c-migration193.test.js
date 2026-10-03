// Lot 2c, étape S0 — structure de la migration 193 (spec docs/lot-2c-spec.md §4.1, I5, I12). Sans base de données :
// le fichier est lu comme texte. L'essai réel (transaction annulée) est fait hors des tests, sur la base locale.
//   node --test test/2c-migration193.test.js
//
// 1. Nom, place dans l'ordre des migrations, aucune transaction ni écriture de données dans le fichier.
// 2. Table créée « si absente » (idempotente), colonnes et types de la spec, clé étrangère en cascade.
// 3. Contraintes : statut (brouillon | valide), slug [a-z0-9-]{1,50} hors « restauration », unicité fiche + domaine ;
//    le motif du slug admet ce que produit slugify (domainesController.js) et refuse le reste.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOSSIER = path.join(__dirname, '..', 'migrations');
const NOM = '193_manuel_sections_domaine.sql';
// Fins de ligne normalisées à la lecture : la copie de travail peut être en CRLF (core.autocrlf = true, et
// .gitattributes n'arrive qu'à l'étape M0, spec §3.8) ; « . » ne prend pas « \r », le retrait des commentaires
// laisserait sinon leurs « ; » dans le texte.
const SQL = fs.readFileSync(path.join(DOSSIER, NOM), 'utf8').replace(/\r/g, '');
// Le SQL sans les commentaires de ligne (« -- … ») : les vérifications portent sur ce qui s'exécute.
const CODE = SQL.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
const PLAT = CODE.replace(/\s+/g, ' ');

// domainesController sans base ni contrôleur d'abonnement (même méthode que test/socle-composants.test.js) : le pool
// est remplacé par un faux qui refuse toute requête (slugify n'en fait aucune), buildTarifsPourDomaine par un bouchon.
function chargerDomainesController() {
  const remplacer = (module, exports) => {
    const chemin = require.resolve(module);
    if (!require.cache[chemin]) {
      require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports, children: [], paths: [] };
    }
  };
  const refus = async () => { throw new Error('aucune requête attendue'); };
  remplacer('../src/config/database', { query: refus, connect: refus });
  remplacer('../src/controllers/abonnementController', { buildTarifsPourDomaine: async () => ({}) });
  return require('../src/controllers/domainesController');
}

test('193 : seul fichier de son numéro, juste après la 192, appliqué après elle (ordre des noms)', () => {
  const fichiers = fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.sql')).sort();
  assert.deepEqual(fichiers.filter((f) => f.startsWith('193_')), [NOM]);
  const i = fichiers.indexOf(NOM);
  assert.ok(fichiers[i - 1].startsWith('192_'), fichiers[i - 1]);
});

test('193 : aucune transaction (migrate.js l\'enveloppe), aucune donnée écrite, aucune table existante touchée', () => {
  assert.doesNotMatch(CODE, /\b(BEGIN|COMMIT|ROLLBACK|START TRANSACTION)\b/i);
  assert.doesNotMatch(CODE, /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE|DROP)\b/i);
  assert.doesNotMatch(CODE, /\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(CODE, /\$\w*\$/, 'aucun bloc à dollars');
  const instructions = CODE.split(';').map((s) => s.trim()).filter(Boolean);
  assert.equal(instructions.length, 2, 'CREATE TABLE et COMMENT ON TABLE');
  assert.match(instructions[0], /^CREATE TABLE IF NOT EXISTS manuel_sections_domaine \(/);
  assert.match(instructions[1], /^COMMENT ON TABLE manuel_sections_domaine IS\s+'/);
});

test('193 : colonnes et types de la spec §4.1', () => {
  const attendues = [
    ['id', 'SERIAL PRIMARY KEY'],
    ['section_id', 'INTEGER NOT NULL REFERENCES manuel_sections(id) ON DELETE CASCADE'],
    ['domaine_slug', 'VARCHAR(50) NOT NULL'],
    ['titre', 'VARCHAR(200)'],
    ['contenu', 'TEXT NOT NULL'],
    ['mots_cles', 'TEXT'],
    ['statut', "VARCHAR(10) NOT NULL DEFAULT 'brouillon'"],
    ['base_md5', 'CHAR(32)'],
    ['created_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()'],
    ['updated_at', 'TIMESTAMPTZ NOT NULL DEFAULT NOW()'],
  ];
  const lues = [...CODE.matchAll(/^\s{2}([a-z0-9_]+)\s+([A-Z][^,\n]*?),?\s*$/gm)].map((m) => [m[1], m[2].trim()]);
  assert.deepEqual(lues, attendues);
  // Pas de colonne partie (la partie reste commune), pas de clé étrangère vers les domaines (ciblage par slug).
  assert.doesNotMatch(PLAT, /\bpartie\b/);
  assert.doesNotMatch(PLAT, /REFERENCES domaines_activite/);
});

test('193 : contraintes nommées (statut, slug hors restauration, unicité fiche + domaine)', () => {
  assert.match(PLAT, /CONSTRAINT manuel_sections_domaine_statut_chk CHECK \(statut IN \('brouillon', 'valide'\)\)/);
  assert.match(PLAT, /CONSTRAINT manuel_sections_domaine_slug_chk CHECK \(domaine_slug ~ '\^\[a-z0-9-\]\{1,50\}\$' AND domaine_slug <> 'restauration'\)/);
  assert.match(PLAT, /CONSTRAINT manuel_sections_domaine_uq UNIQUE \(section_id, domaine_slug\)/);
});

test('193 : le motif du slug admet ce que produit slugify et refuse le reste', () => {
  const motif = new RegExp(/domaine_slug ~ '([^']+)'/.exec(PLAT)[1]);
  const admis = (s) => motif.test(s) && s !== 'restauration';
  // slugify du contrôleur lui-même (domainesController.js:37-40, exporté) : si sa longueur ou son motif changent,
  // ce test voit tout de suite que le motif de la 193 ne couvre plus les slugs produits (R5.9).
  const { slugify } = chargerDomainesController();
  for (const nom of ['Hôtellerie', 'Industrie — Céramique', 'Café', 'Boulangerie & Pâtisserie', 'A', 'x'.repeat(80),
    'é', '—', 'Ünïté — Spéciale']) {
    const s = slugify(nom);
    if (s) assert.ok(admis(s), s); // slugify('—') = '' : le contrôleur refuse un slug vide (400) avant la base
  }
  assert.equal(slugify('x'.repeat(80)).length <= 50, true, 'slugify ne dépasse jamais les 50 caractères du motif');
  for (const nom of ['Hôtellerie', 'Industrie — Céramique', 'Café', 'Boulangerie & Pâtisserie', 'A', 'x'.repeat(80)]) {
    assert.ok(admis(slugify(nom)), slugify(nom));
  }
  for (const s of ['hotellerie', 'ceramique', 'industrie-ceramique', 'a', '1', 'b'.repeat(50)]) assert.ok(admis(s), s);
  for (const s of ['restauration', '', 'Ceramique', 'céramique', 'mon_domaine', 'deux mots', 'b'.repeat(51)]) assert.ok(!admis(s), s);
});
