// LabFlow Compta, étape S4d « Grands cabinets » (labflow-reprise/achats-compta/ETAPE-S5.md §2 ; remarque du client du
// 07/10 ; réponses : 25 par page, « Afficher plus », archivés présents et marqués). Tests sans base : paramètres de la
// liste paginée contrôlés avant toute requête, motif de recherche échappé, requêtes (tri, page, comptes rendus),
// premiers noms des dossiers d'un accès, catalogue retiré des réponses, migration 211 (index + manuel).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const dossiers = require('../src/compta/dossiers');
const comptables = require('../src/compta/comptablesClient');

const reponse = () => {
  const res = { statut: 200, corps: null };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  return res;
};

test('paramètres de la liste : défauts (page 1, 25 par page, actifs seuls), bornes, identifiants, matricule', () => {
  assert.deepEqual(dossiers.lireParametresListe({}), { q: '', archives: false, page: 1, limite: 25, ids: null, matricule: null });
  assert.deepEqual(dossiers.lireParametresListe(undefined), { q: '', archives: false, page: 1, limite: 25, ids: null, matricule: null });
  assert.deepEqual(dossiers.lireParametresListe({ q: '  Ali  ', archives: '1', page: '3', limite: '200', ids: ' 7, 3,7 ,', matricule: '1234567' }),
    { q: 'Ali', archives: true, page: 3, limite: 200, ids: [7, 3], matricule: '1234567' });
  assert.deepEqual(dossiers.lireParametresListe({ ids: '' }).ids, [], 'ids vide : aucun dossier (liste à cocher sans rien de coché)');
  assert.equal(dossiers.lireParametresListe({ q: 'x'.repeat(300) }).q.length, 100, 'recherche bornée');
  assert.equal(dossiers.lireParametresListe({ archives: 'non' }).archives, false);
  assert.equal(dossiers.lireParametresListe({ page: '', limite: '' }).limite, 25);
  for (const query of [{ page: '0' }, { page: '-1' }, { page: '1.5' }, { page: 'x' }, { page: '1e2' }, { page: '0x10' }, { page: '100001' }, { limite: '0' }, { limite: '201' }, { limite: 'abc' },
    { ids: 'a' }, { ids: '1;2' }, { ids: '0' }, { ids: Array.from({ length: 201 }, (_, i) => i + 1).join(',') }, { matricule: '123' }, { matricule: '1234567A' }, 'x', null]) {
    assert.throws(() => dossiers.lireParametresListe(query), (e) => e.statusCode === 400, JSON.stringify(query)?.slice(0, 40));
  }
  assert.equal(dossiers.lireParametresListe({ ids: Array.from({ length: 200 }, (_, i) => i + 1).join(',') }).ids.length, 200);
  assert.equal(dossiers.LIMITE_DEFAUT, 25, 'réponse du client du 07/10');
  assert.equal(dossiers.LIMITE_MAX, 200);
  assert.equal(dossiers.IDS_MAX, 200, 'relecture par identifiants : jamais plus qu\'une page (relecture de S4d)');
});

test('recherche : motif ILIKE avec % et _ pris au pied de la lettre', () => {
  assert.equal(dossiers.motifRecherche('Ali'), '%Ali%');
  assert.equal(dossiers.motifRecherche('50%'), '%50\\%%');
  assert.equal(dossiers.motifRecherche('a_b'), '%a\\_b%');
  assert.equal(dossiers.motifRecherche('c\\d'), '%c\\\\d%');
});

test('requêtes : visibilité partout, filtres aux rangs fixes, tri inchangé, page et comptes rendus en une requête', () => {
  assert.ok(dossiers.SQL_LISTE.includes('WHERE d.espace_id = $1 AND ($2::boolean OR EXISTS'), 'SQL_VISIBLE sur la page');
  assert.ok(dossiers.SQL_COMPTES.includes('WHERE d.espace_id = $1 AND ($2::boolean OR EXISTS'), 'SQL_VISIBLE sur les comptes');
  assert.ok(dossiers.SQL_LISTE.includes("($7::boolean OR d.etat = 'actif')") && dossiers.SQL_LISTE.includes('LIMIT $8 OFFSET $9'));
  assert.ok(dossiers.SQL_LISTE.includes('ORDER BY d.etat, LOWER(d.nom), d.id\n       LIMIT $8 OFFSET $9\n    ) d\n    LEFT JOIN LATERAL'), 'la page est découpée avant la jointure de l\'exercice (relecture)');
  assert.ok(dossiers.SQL_LISTE.trim().endsWith('ORDER BY d.etat, LOWER(d.nom), d.id'), 'actifs d\'abord, puis nom');
  for (const sql of [dossiers.SQL_LISTE, dossiers.SQL_COMPTES]) {
    assert.ok(sql.includes("($4::text = '' OR d.nom ILIKE $4 OR d.raison_sociale ILIKE $4 OR d.nom_commercial ILIKE $4 OR d.matricule_fiscal ILIKE $4)"));
    assert.ok(sql.includes('($5::int[] IS NULL OR d.id = ANY($5::int[]))'));
    assert.ok(sql.includes('($6::text IS NULL OR LEFT(d.matricule_fiscal, 7) = $6)'));
  }
  assert.ok(dossiers.SQL_COMPTES.includes("COUNT(*) FILTER (WHERE d.etat = 'actif')::int AS actifs") && dossiers.SQL_COMPTES.includes('AS resultats_actifs'));
  const src = lire('src', 'compta', 'dossiers.js');
  const debut = src.indexOf('const lister = async (req, res) => {');
  const corps = src.slice(debut, src.indexOf('\n};\n', debut));
  assert.ok(corps.indexOf('const filtres = lireParametresListe(req.query);') < corps.indexOf('await exigerAcces('), 'paramètres contrôlés avant toute requête');
  assert.ok(corps.includes('await etatListe(pool, acces, filtres)'));
  const liste = src.slice(src.indexOf('const etatListe = async'), src.indexOf('\n};\n', src.indexOf('const etatListe = async')));
  assert.ok(liste.includes('(filtres.page - 1) * filtres.limite') && liste.includes('total: filtres.archives ? comptes.resultats : comptes.resultats_actifs'));
  assert.ok(liste.includes('nbActifs: comptes.actifs,') && liste.includes('nbArchives: comptes.archives,'));
});

test('lister : paramètres invalides refusés en 400 avant toute requête', async () => {
  for (const query of [{ page: '0' }, { limite: '999' }, { ids: 'x' }, { matricule: 'abc' }]) {
    const res = reponse();
    await dossiers.lister({ user: { id: 1, role: 'comptable' }, params: { espaceId: '1' }, query }, res);
    assert.equal(res.statut, 400, JSON.stringify(query));
  }
});

test('accès : premiers noms des dossiers de la liste (3), vides pour « tous » ; catalogue retiré des réponses', () => {
  const base = { id: 7, obligatoire: false, niveau: 'saisie', personne_id: 9, nom: 'G', email: 'g@x.tn', personne_role: 'comptable', activated_at: new Date(), a_mot_de_passe: true, etat_acces: 'actif' };
  assert.deepEqual(comptables.presenterComptable({ ...base, tous_dossiers: false, dossier_ids: [4, 9], dossier_noms: ['Alpha', 'Bravo'] }).dossiersNoms, ['Alpha', 'Bravo']);
  assert.deepEqual(comptables.presenterComptable({ ...base, tous_dossiers: true, dossier_ids: [], dossier_noms: [] }).dossiersNoms, []);
  assert.deepEqual(comptables.presenterComptable(base).dossiersNoms, [], 'sans colonne : tous');
  assert.equal(comptables.NOMS_MAX, 3);
  assert.ok(comptables.SQL_COMPTABLES.includes('ORDER BY LOWER(d.nom), d.id LIMIT 3) x) AS dossier_noms'));
  assert.equal(typeof comptables.lireDossiersEspace, 'undefined', 'plus de lecture du catalogue complet');
  for (const f of ['gerantsCabinet.js', 'comptablesClient.js', 'accesController.js']) assert.ok(!lire('src', 'compta', f).includes('lireDossiersEspace'), f);
  assert.ok(!lire('src', 'compta', 'routes.js').includes('/catalogue'), 'aucune route nouvelle : la liste paginée sert la liste à cocher');
});

test('migration 211 : deux index, cinq fiches gardées par l\'empreinte EXACTE des textes des migrations 208 et 210, sans balise, en LF', () => {
  const crypto = require('crypto');
  const sql = fs.readFileSync(path.join(RACINE, 'migrations', '211_compta_grands_cabinets.sql'), 'utf8');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_compta_acces_dossiers_dossier ON compta\.acces_dossiers \(dossier_id\);/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_compta_dossiers_tri ON compta\.dossiers \(espace_id, etat, LOWER\(nom\), id\);/);
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  assert.ok(!/ALTER TABLE|CREATE TABLE|INSERT INTO|DELETE FROM/.test(sql), 'additive : des index et le manuel');
  // Les gardes sont les empreintes des textes posés par les migrations d'avant (relecture : une garde fausse rendrait la
  // migration silencieusement sans effet) ; le texte entre les marques, sans \r, comme la base le voit.
  const texteDe = (fichier, marque) => {
    const src = fs.readFileSync(path.join(RACINE, 'migrations', fichier), 'utf8').replace(/\r\n/g, '\n');
    const debut = src.indexOf(marque) + marque.length;
    return src.slice(debut, src.indexOf(marque, debut));
  };
  const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
  for (const [marque, slug, origine, marqueOrigine] of [
    ['$f211a$', 'compta-dossiers', '208_compta_dossiers.sql', '$f208c$'],
    ['$f211b$', 'compta-gerants', '210_compta_dossiers_collaborateurs.sql', '$f210a$'],
    ['$f211c$', 'compta-ma-comptabilite', '210_compta_dossiers_collaborateurs.sql', '$f210b$'],
    ['$f211d$', 'compta-confiee', '210_compta_dossiers_collaborateurs.sql', '$f210c$'],
    ['$f211e$', 'compta-cabinet-membre', '210_compta_dossiers_collaborateurs.sql', '$f210d$'],
  ]) {
    const garde = md5(texteDe(origine, marqueOrigine));
    assert.ok(sql.includes(`${marque}, '${slug}', '${garde}')`), `${slug} : garde ${garde}`);
    assert.ok(texteDe('211_compta_grands_cabinets.sql', marque).includes('Afficher plus'), marque);
  }
});
