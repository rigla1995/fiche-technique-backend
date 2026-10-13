// LabFlow Compta, étape X1 « L'exercice suivant » (labflow-reprise/achats-compta/PLAN-EXERCICES.md §2 ligne X1, §3 ;
// réponses du client du 13/10 — « ok pour les 5 »). Tests sans base : les règles pures (exercice suivant, ouverture
// automatique, millésime, exercice par défaut, fenêtre des écrans), les numéros définitifs au millésime, le journal
// d'à-nouveaux réservé au premier exercice, les refus « hors de l'exercice » expliqués, le report provisoire dans la
// balance (rangée, totaux, contrôles), le paquet (comptes du résultat), la migration 234, la route.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const XC = require('../src/compta/exercicesCalcul');
const X = require('../src/compta/exercices');
const ecritures = require('../src/compta/ecritures');
const validation = require('../src/compta/validation');
const livres = require('../src/compta/livres');
const paquets = require('../src/compta/paquets');

const E2026 = { id: 1, debut: '2026-01-01', fin: '2026-12-31', etat: 'ouvert', millesime: 2026 };
const E2027 = { id: 2, debut: '2027-01-01', fin: '2027-12-31', etat: 'ouvert', millesime: 2027 };

test('dates : lendemain, veille, fin de douze mois (fin de mois, années bissextiles)', () => {
  assert.equal(XC.lendemain('2026-12-31'), '2027-01-01');
  assert.equal(XC.lendemain('2028-02-28'), '2028-02-29');
  assert.equal(XC.veille('2027-01-01'), '2026-12-31');
  assert.equal(XC.finDouzeMois('2027-01-01'), '2027-12-31');
  assert.equal(XC.finDouzeMois('2026-04-01'), '2027-03-31', 'exercice décalé : d\'avril à mars');
  assert.equal(XC.finDouzeMois('2027-03-01'), '2028-02-29', 'fin en février bissextile');
  assert.equal(XC.finDouzeMois('2026-07-01'), '2027-06-30');
  assert.match(XC.aujourdhuiTunis(), /^\d{4}-\d{2}-\d{2}$/);
});

test('millésime : l\'année du début, sinon celle de la fin, sinon aucun', () => {
  assert.equal(XC.millesimeDe('2027-01-01', '2027-12-31', [2026]), 2027);
  assert.equal(XC.millesimeDe('2026-04-01', '2027-03-31', [2026]), 2027, 'premier exercice court de janvier à mars 2026');
  assert.equal(XC.millesimeDe('2027-04-01', '2028-03-31', [2026, 2027]), 2028);
  assert.equal(XC.millesimeDe('2026-04-01', '2026-12-31', [2026]), null, 'les deux années déjà prises');
});

test('exercice suivant : le lendemain du dernier, 12 mois ; deux exercices ouverts au plus', () => {
  assert.equal(XC.exerciceSuivant([]), null);
  assert.deepEqual(XC.exerciceSuivant([E2026]), { debut: '2027-01-01', fin: '2027-12-31', millesime: 2027, possible: true, bloquant: null });
  const deux = XC.exerciceSuivant([E2027, E2026]);
  assert.deepEqual([deux.debut, deux.possible, deux.bloquant?.id], ['2028-01-01', false, 1], '2026 encore ouvert : pas de 2028');
  const clos = XC.exerciceSuivant([{ ...E2026, etat: 'clos' }, E2027]);
  assert.deepEqual([clos.debut, clos.millesime, clos.possible], ['2028-01-01', 2028, true], '2026 clos : 2028 possible');
  const court = XC.exerciceSuivant([{ id: 3, debut: '2026-01-01', fin: '2026-03-31', etat: 'ouvert', millesime: 2026 }]);
  assert.deepEqual([court.debut, court.fin, court.millesime], ['2026-04-01', '2027-03-31', 2027]);
});

test('ouverture automatique : date passée, dans l\'exercice proposé, deux exercices au plus', () => {
  assert.equal(XC.ouvertureAutoPour([E2026], '2027-01-05', '2027-01-10').debut, '2027-01-01');
  assert.equal(XC.ouvertureAutoPour([E2026], '2027-01-10', '2027-01-10').millesime, 2027, 'datée du jour');
  assert.equal(XC.ouvertureAutoPour([E2026], '2027-01-15', '2027-01-10'), null, 'date à venir');
  assert.equal(XC.ouvertureAutoPour([E2026], '2027-01-05', '2026-10-13'), null, 'avant la fin de l\'exercice : rien');
  assert.equal(XC.ouvertureAutoPour([E2026], '2028-01-05', '2028-02-01'), null, 'faute de frappe sur l\'année : hors de l\'exercice proposé');
  assert.equal(XC.ouvertureAutoPour([E2026], '2026-06-01', '2027-01-10'), null, 'date dans un exercice existant');
  assert.equal(XC.ouvertureAutoPour([E2026, E2027], '2028-01-05', '2028-01-10'), null, 'deux exercices déjà ouverts');
});

test('exercice par défaut : l\'ouvert du jour, sinon le plus récent des ouverts, sinon le plus récent', () => {
  assert.equal(XC.exerciceParDefaut([E2026, E2027], '2026-10-13').id, 1, '2027 ouvert d\'avance : on reste sur 2026');
  assert.equal(XC.exerciceParDefaut([E2026, E2027], '2027-02-01').id, 2);
  assert.equal(XC.exerciceParDefaut([E2026], '2027-02-01').id, 1, '2027 pas encore ouvert');
  assert.equal(XC.exerciceParDefaut([{ ...E2026, etat: 'clos' }, E2027], '2026-10-13').id, 2, 'exercice du jour clos : le plus récent des ouverts');
  assert.equal(XC.exerciceParDefaut([{ ...E2026, etat: 'clos' }], '2027-02-01').id, 1);
  assert.equal(XC.exerciceParDefaut([], '2027-02-01'), null);
  assert.equal(livres.exerciceParDefaut([E2026, E2027], '2027-03-01').id, 2, 'les livres suivent la même règle');
  assert.equal(XC.precedentDe([E2026, E2027], E2027).id, 1);
  assert.equal(XC.precedentDe([E2026, E2027], E2026), null);
});

test('écrans : l\'exercice suivant, s\'il peut s\'ouvrir, et la fenêtre de son ouverture automatique', () => {
  assert.deepEqual(XC.presenterSuivant([E2026], '2026-10-13'), { debut: '2027-01-01', fin: '2027-12-31', millesime: 2027, possible: true, bloquant: null, auto: false, jusqua: null });
  assert.deepEqual(XC.presenterSuivant([E2026], '2027-01-20'), { debut: '2027-01-01', fin: '2027-12-31', millesime: 2027, possible: true, bloquant: null, auto: true, jusqua: '2027-01-20' });
  const bloque = XC.presenterSuivant([E2026, E2027], '2028-01-20');
  assert.deepEqual([bloque.possible, bloque.auto, bloque.bloquant], [false, false, { id: 1, debut: '2026-01-01', fin: '2026-12-31', millesime: 2026 }]);
  assert.equal(XC.presenterSuivant([]), null);
});

test('refus « hors de l\'exercice » expliqué : à venir, trop loin, deux exercices ouverts', () => {
  assert.match(X.raisonSansOuverture([E2026], '2027-01-15', '2027-01-10'), /s'ouvrira de lui-même à la première écriture datée d'un jour passé, ou depuis la fiche du dossier/);
  assert.match(X.raisonSansOuverture([E2026], '2028-03-01', '2028-03-10'), /ne la contient pas/);
  assert.match(X.raisonSansOuverture([E2026, E2027], '2028-01-05', '2028-01-10'), /ne s'ouvre pas tant que l'exercice du 01\/01\/2026 au 31\/12\/2026 n'est pas clos/);
  assert.equal(X.raisonSansOuverture([E2026], '2025-06-01', '2026-10-13'), '', 'avant le premier exercice : rien à expliquer');
  assert.deepEqual(X.lireOuverture({}), { fin: null });
  assert.deepEqual(X.lireOuverture({ fin: '2027-06-30' }), { fin: '2027-06-30' });
  assert.throws(() => X.lireOuverture({ fin: 12 }), (e) => e.statusCode === 400);
});

test('numéros définitifs : la série porte le millésime de l\'exercice', () => {
  assert.equal(validation.numeroDefinitif('AC', 2027, 1), 'AC-2027-000001');
  assert.equal(validation.numeroDefinitif('VT', 2027, 12), 'VT-2027-000012', 'exercice d\'avril 2026 à mars 2027 : millésime 2027');
  const src = lire('src', 'compta', 'validation.js');
  assert.ok(src.includes('x.millesime AS exercice_millesime') && src.includes('numeroDefinitif(e.journal_code, p.exercice_millesime, rang)') && src.includes('numeroDefinitif(journal.code, exercice.millesime, rang)'), 'validation, période et contre-passation au millésime');
  assert.ok(!src.includes('p.exercice_debut, rang'), 'plus jamais l\'année du début');
});

test('journal d\'à-nouveaux : premier exercice seulement, au premier jour', () => {
  const an = { type: 'an', code: 'AN' };
  assert.doesNotThrow(() => ecritures.exigerDateAN(an, { debut: '2026-01-01', premier: true, millesime: 2026 }, '2026-01-01'));
  assert.throws(() => ecritures.exigerDateAN(an, { debut: '2027-01-01', premier: false, millesime: 2027 }, '2027-01-01'), (e) => e.statusCode === 409 && e.code === 'AN_EXERCICE_SUIVANT' && /viendront de la clôture/.test(e.message));
  assert.throws(() => ecritures.exigerDateAN(an, { debut: '2026-01-01', premier: true }, '2026-01-02'), (e) => e.code === 'AN_DATE');
  assert.doesNotThrow(() => ecritures.exigerDateAN({ type: 'od', code: 'OD' }, { debut: '2027-01-01', premier: false }, '2027-03-01'));
  assert.ok(ecritures.SQL_OUVERTS.includes('AS premier') && ecritures.SQL_OUVERTS.includes('x.millesime'));
});

test('saisie, import, contre-passation, facture de LabFlow : la date de la nouvelle année ouvre l\'exercice suivant', () => {
  const e = lire('src', 'compta', 'ecritures.js');
  assert.equal((e.match(/periodeDe\(db, d\.id, e\.date, \{ espaceId: acces\.espace_id, auteurId: req\.user\.id, origine: 'saisie' \}\)/g) || []).length, 2, 'créer et modifier');
  assert.ok(e.includes('if (!x) x = await X.ouvrirSiBesoin(db, dossierId, date, ouverture);'));
  assert.ok(lire('src', 'compta', 'validation.js').includes("origine: 'contrepassation' }"));
  assert.ok(lire('src', 'compta', 'importEcritures.js').includes("origine: 'import' }"));
  const pont = lire('src', 'services', 'pontCompta.js');
  assert.ok(pont.includes("if (await X.ouvrirSiBesoin(db, d.id, dateFacture, ouverture)) return { date: dateFacture, dateReelle: null };") && pont.includes("origine: 'labflow' }"));
  // La liquidation de la TVA se date dans l'exercice de sa période : jamais d'ouverture.
  assert.ok(lire('src', 'compta', 'declarations.js').includes('await periodeDe(db, d.id, l.date);'));
  // La balance d'ouverture importée va dans le premier exercice.
  const imp = lire('src', 'compta', 'importEcritures.js');
  assert.ok(imp.includes('const x = await premierExercice(db, d.id);') && imp.includes('const x = await premierExercice(pool, d.id);') && !imp.includes('exerciceOuvert('));
});

test('report provisoire : rangée de balance (ouverture + report), totaux sans le report dans le total des lignes', () => {
  const vide = { ouverture_debit: '0.000', ouverture_credit: '0.000', debit: '0.000', credit: '0.000', nb_lignes: 0, nb_brouillard: 0, nb_brouillard_mouvements: 0 };
  const banque = livres.rangeeBalance({ ...vide, debit: '500.000', nb_lignes: 1 }, livres.reportDe(10000000n));
  assert.deepEqual(banque.ouverture, { debit: '10000.000', credit: '0.000', solde: '10000.000', soldeDebit: '10000.000', soldeCredit: '0.000', provisoire: '10000.000' });
  assert.equal(banque.solde, '10500.000');
  const capital = livres.rangeeBalance(vide, livres.reportDe(-8000000n));
  assert.deepEqual([capital.ouverture.credit, capital.ouverture.provisoire, capital.soldeCredit], ['8000.000', '-8000.000', '8000.000']);
  const resultat = livres.rangeeBalance(vide, livres.reportDe(-2000000n));
  const vente = livres.rangeeBalance({ ...vide, credit: '500.000', nb_lignes: 1 });
  assert.equal(vente.ouverture.provisoire, undefined, 'sans report : rien de dit');
  const t = livres.totauxBalance([banque, capital, resultat, vente]);
  assert.deepEqual(t.lignes, { debit: '500.000', credit: '500.000' }, 'le total des lignes ignore le report (aucune ligne ne le porte)');
  assert.deepEqual(t.provisoire, { debit: '10000.000', credit: '10000.000' }, 'report équilibré');
  assert.deepEqual([t.ouverture.debit, t.ouverture.credit], ['10000.000', '10000.000']);
  assert.equal(livres.totauxBalance([vente]).provisoire, undefined);
  assert.deepEqual(livres.NATURES_GESTION, ['charges', 'produits']);
  assert.ok(livres.SQL_SOLDE_FIN_CIBLE.includes('k.nature <> ALL($6::text[])'), 'grand livre d\'un tiers : hors comptes de gestion');
});

test('paquet tunisien : comptes du résultat 131 et 135 (capitaux), contrôlés', () => {
  assert.deepEqual(paquets.clotureDe('TN') && { b: paquets.clotureDe('TN').beneficiaire, d: paquets.clotureDe('TN').deficitaire }, { b: '131', d: '135' });
  assert.equal(paquets.clotureDe('FR'), null);
  assert.deepEqual(paquets.controlerPaquet(paquets.paquetDe('TN')), []);
  const faux = { ...paquets.paquetDe('TN'), cloture: { beneficiaire: '607', deficitaire: '999' } };
  const d = paquets.controlerPaquet(faux);
  assert.ok(d.some((x) => /compte 607 de nature charges, capitaux attendue/.test(x)) && d.some((x) => /résultat deficitaire absent/.test(x)), d.join(' | '));
});

test('migration 234 : millésime unique par dossier rempli pour l\'existant, origine de l\'exercice ; LF, rejouable', () => {
  const brut = fs.readFileSync(path.join(RACINE, 'migrations', '234_compta_exercice_suivant.sql'), 'utf8');
  assert.ok(!brut.includes('\r'), 'fins de ligne LF');
  assert.ok(brut.includes('ADD COLUMN IF NOT EXISTS millesime SMALLINT') && brut.includes('ALTER COLUMN millesime SET NOT NULL'));
  assert.ok(brut.includes('CREATE UNIQUE INDEX IF NOT EXISTS uq_compta_exercices_millesime ON compta.exercices (dossier_id, millesime)'));
  assert.ok(brut.includes("CHECK (ouverture IN ('creation', 'manuelle', 'auto'))") && brut.includes('ouvert_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL'));
  assert.equal((brut.match(/EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;/g) || []).length, 2, 'contraintes rejouables');
  assert.ok(brut.includes('WHERE x.millesime IS NULL'), 'seuls les exercices sans millésime sont remplis');
});

test('migration 235 : manuel seul, cinq fiches gardées par empreinte (textes de la 230 et d\'avant), sans balise, en LF', () => {
  const sql = fs.readFileSync(path.join(RACINE, 'migrations', '235_manuel_compta_exercice_suivant.sql'), 'utf8');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  for (const [slug, garde] of [['compta-dossier', '8ce4632f8aabd99db49759e6de7b1d59'], ['compta-ecritures', '9ee3e4e7b7d01a8d75398d03d4f06ab9'], ['compta-periodes', '1dd2198d5761607d9b9f899d84369ff7'], ['compta-livres', '4f04a519c83e0f50ef83906f7d40593b'], ['compta-taxes-mois', '5ba81687cdd87a423f4b7871912e2658']]) {
    assert.match(sql, new RegExp(`'${slug}', '${garde}'\\)`), slug);
  }
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.ok(!/\[\[|\{\{/.test(sql), 'vocabulaire comptable fixe : aucune balise');
  for (const a of ['**Ouvrir l\'exercice suivant**', '**deux exercices ouverts au plus**', '**millésime**', '**La nouvelle année**', '**premier exercice** du dossier', '**Soldes d\'ouverture provisoires**', 'compte **131** (bénéfice) ou **135** (perte)', 'son solde de fin, **provisoire**']) assert.ok(sql.includes(a), a);
});

test('route X1 : ouvrir l\'exercice suivant (droit « configurer », dossier non archivé, transaction du dossier)', () => {
  const routes = lire('src', 'compta', 'routes.js');
  assert.ok(routes.includes("router.post('/dossiers/:dossierId/exercices/suivant', authenticate, limiteDossiers, exercices.ouvrir);"));
  const src = lire('src', 'compta', 'exercices.js');
  const corps = src.slice(src.indexOf('const ouvrir = async (req, res) => {'));
  assert.ok(corps.includes('if (!droits(acces).configurer) throw erreur(403, MSG_OUVRIR, \'NIVEAU_INSUFFISANT\');') && corps.includes("if (d.etat === 'archive')") && corps.includes('res.status(201).json(f);'));
  assert.ok(src.includes("'exercice_ouvert'") && src.includes("throw erreur(409, `L'exercice ${C.libelleExercice(s.bloquant)} n'est pas clos"));
  // Seul le premier exercice change de dates (fiche du dossier).
  assert.ok(lire('src', 'compta', 'dossiers.js').includes("'PLUSIEURS_EXERCICES'"));
});
