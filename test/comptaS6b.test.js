// LabFlow Compta, étape S6b « La validation et les périodes » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6b, §2,
// §4 ; réponses du client du 08/10 — « ok pour les 8 »). Tests sans base : le numéro définitif (format, rang, série pleine),
// les lignes inverses d'une contre-passation, la lecture de son corps, la vraie date d'une écriture (lireEcriture), la
// migration 216 (colonnes des périodes, contrainte de la vraie date, index, manuel : gardes md5 des textes de la 215,
// fiche « Validation et périodes »), les routes (5 écritures sous leur limite, 3 lectures), les droits (configurer pour
// valider, contre-passer, clore ; archiver pour rouvrir), les présentations (auteur de la validation, lien de
// contre-passation), le journal général (texte sûr, libellé du mois), les refus avant toute requête.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const ecritures = require('../src/compta/ecritures');
const validation = require('../src/compta/validation');
const periodes = require('../src/compta/periodes');
const dossiers = require('../src/compta/dossiers');
const est400 = (e) => e.statusCode === 400;
const reponse = () => {
  const res = { statut: 200, corps: null };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  return res;
};

test('numéro définitif (réponse 2 du 08/10) : code du journal, année de début de l\'exercice, six chiffres ; rang lu en fin de numéro ; série bornée', () => {
  assert.equal(validation.numeroDefinitif('AC', '2026-01-01', 1), 'AC-2026-000001');
  assert.equal(validation.numeroDefinitif('BQ2', '2026-07-15', 43), 'BQ2-2026-000043', 'exercice décalé : l\'année de son début');
  assert.equal(validation.numeroDefinitif('OD', '2027-01-01', 999999), 'OD-2027-999999');
  assert.equal(validation.rangDe('AC-2026-000043'), 43);
  assert.equal(validation.rangDe('AC-2026-000001'), 1);
  assert.equal(validation.rangDe(null), 0, 'aucun numéro : le prochain rang sera 1');
  assert.equal(validation.rangDe(''), 0);
  assert.deepEqual([validation.NUMERO_CHIFFRES, validation.NUMERO_MAX], [6, 999999]);
  // L'ordre des textes est l'ordre des rangs (même préfixe, rang complété) : MAX(numero) donne le dernier.
  assert.ok(validation.numeroDefinitif('AC', '2026-01-01', 10) > validation.numeroDefinitif('AC', '2026-01-01', 9));
  assert.ok(validation.numeroDefinitif('AC', '2026-01-01', 100000) > validation.numeroDefinitif('AC', '2026-01-01', 99999));
});

test('contre-passation : corps (date, libellé, pièce facultatifs), libellé par défaut, lignes inverses (débits et crédits échangés, mêmes comptes, tiers, codes ; sans échéance)', () => {
  assert.deepEqual(validation.lireContrepassation({}), { date: null, libelle: null, reference: null });
  assert.deepEqual(validation.lireContrepassation({ date: '2026-04-02', libelle: ' Annulation ', reference: 'F-1' }), { date: '2026-04-02', libelle: 'Annulation', reference: 'F-1' });
  for (const corps of [{ date: '2026-02-30' }, { date: '02/04/2026' }, { libelle: 'x'.repeat(256) }, { reference: 'x'.repeat(81) }, { libelle: 'شركة' }, null, 'x']) assert.throws(() => validation.lireContrepassation(corps), est400, JSON.stringify(corps));
  assert.equal(validation.libelleContrepassation({ numero: 'AC-2026-000003', libelle: 'Facture STB' }), 'Contre-passation de AC-2026-000003 : Facture STB');
  assert.equal(validation.libelleContrepassation({ numero: 'AC-2026-000003', libelle: 'x'.repeat(300) }).length, 255, 'borné à 255');
  const inverses = validation.lignesInverses([
    { rang: 1, compte_id: 1, tiers_id: null, libelle: null, debit: '1000.000', credit: '0.000', taxe_id: 4, echeance: null },
    { rang: 2, compte_id: 7, tiers_id: 3, libelle: 'STB', debit: '0.000', credit: '1000.000', taxe_id: null, echeance: '2026-04-14' },
  ]);
  assert.deepEqual(inverses, [
    { rang: 1, compteId: 1, tiersId: null, libelle: null, debit: 0n, credit: 1000000n, taxeId: 4, echeance: null },
    { rang: 2, compteId: 7, tiersId: 3, libelle: 'STB', debit: 1000000n, credit: 0n, taxeId: null, echeance: null },
  ]);
  assert.equal(validation.MSG_VALIDER, 'Seul le titulaire ou un gérant de niveau Complet peut valider, contre-passer ou clore');
  assert.equal(validation.MSG_ROUVRIR, 'Seul le titulaire peut rouvrir une période');
});

test('vraie date d\'une opération (NC 01 §61) : facultative, précède la date d\'enregistrement, sert au contrôle des échéances', () => {
  const base = { journalId: 7, date: '2026-04-01', reference: 'P', libelle: 'L', lignes: [{ compteId: 1, debit: '100' }, { compteId: 2, credit: '100', echeance: '2026-03-25' }] };
  assert.throws(() => ecritures.lireEcriture(base), (e) => est400(e) && /précède la date/.test(e.message), 'sans vraie date : l\'échéance du 25/03 précède le 01/04');
  const e = ecritures.lireEcriture({ ...base, dateReelle: '2026-03-15' });
  assert.equal(e.dateReelle, '2026-03-15');
  assert.equal(e.date, '2026-04-01');
  assert.equal(ecritures.lireEcriture({ ...base, dateReelle: '', lignes: [{ compteId: 1, debit: '100' }, { compteId: 2, credit: '100' }] }).dateReelle, null, 'vide = absente');
  assert.throws(() => ecritures.lireEcriture({ ...base, dateReelle: '2026-04-01' }), (x) => est400(x) && x.code === 'DATE_REELLE', 'égale à la date : refusée');
  assert.throws(() => ecritures.lireEcriture({ ...base, dateReelle: '2026-04-15' }), (x) => est400(x) && x.code === 'DATE_REELLE', 'après la date : refusée');
  assert.throws(() => ecritures.lireEcriture({ ...base, dateReelle: '15/03/2026' }), est400, 'mal formée');
  const ctrl = lire('src', 'compta', 'ecritures.js');
  assert.ok(ctrl.includes('date, date_reelle, numero_provisoire, reference, libelle, total_debit, total_credit, origine, cree_par)') && ctrl.includes('date_reelle = $9'), 'la vraie date est écrite à la création et à la modification');
  assert.ok(ctrl.includes("dateReelle: e.dateReelle ?? null") && ctrl.includes("dateReelle: e.date_reelle ?? null"), 'et journalisée (avant / après, contenu supprimé)');
});

test('présentations S6b : auteur de la validation, numéro d\'origine d\'une contre-passation, contre-passation d\'une écriture ; période filtrée', () => {
  const e = ecritures.presenterEcriture({
    id: 9, journal_id: 2, journal_code: 'AC', journal_libelle: 'Achats', journal_type: 'achats', date: '2026-04-02', date_reelle: '2026-03-15', numero_provisoire: 14, numero: 'AC-2026-000004', reference: 'F-1', libelle: 'Contre-passation de AC-2026-000003 : Facture', etat: 'validee',
    total_debit: '1191.000', total_credit: '1191.000', origine: 'contrepassation', origine_id: 5, origine_numero: 'AC-2026-000003', cree_par: 3, cree_par_nom: 'Karim', created_at: 'c', updated_at: 'u', valide_par: 3, valide_par_nom: 'Karim', valide_le: 'v', nb_lignes: 5,
    contrepassee_par_id: null, contrepassee_par_numero: null,
  });
  assert.deepEqual([e.numero, e.dateReelle, e.etat, e.etatLibelle, e.origine, e.origineId, e.origineNumero, e.contrepasseePar, e.validePar, e.valideLe], ['AC-2026-000004', '2026-03-15', 'validee', 'Validée', 'contrepassation', 5, 'AC-2026-000003', null, 'Karim', 'v']);
  const o = ecritures.presenterEcriture({ id: 5, numero_provisoire: 3, journal_id: 2, etat: 'validee', numero: 'AC-2026-000003', total_debit: '1191.000', contrepassee_par_id: 9, contrepassee_par_numero: 'AC-2026-000004' });
  assert.deepEqual(o.contrepasseePar, { id: 9, numero: 'AC-2026-000004' });
  assert.ok(ecritures.SQL_ECRITURES.includes('LEFT JOIN utilisateurs v ON v.id = e.valide_par') && ecritures.SQL_ECRITURES.includes("c.origine_id = e.id AND c.dossier_id = e.dossier_id AND c.origine = 'contrepassation'") && ecritures.SQL_ECRITURES.includes('o.id = e.origine_id AND o.dossier_id = e.dossier_id') && ecritures.SQL_ECRITURES.includes('o.numero AS origine_numero'), 'origine et contre-passation du même dossier');
  assert.equal(typeof ecritures.resumePeriode, 'function');
  const ctrl = lire('src', 'compta', 'ecritures.js');
  assert.ok(ctrl.includes('resumePeriode(db, d.id, f.periodeId),') && ctrl.includes('    periode,\n    filtres:'), 'la page des écritures rend la période filtrée (brouillard restant)');
  assert.deepEqual(periodes.presenterPeriode({ id: 1, debut: '2026-03-01', fin: '2026-03-31', etat: 'close', nb_brouillard: 0, nb_validees: 12, total_validees: '15000.000', clos_le: 'x', clos_par_nom: 'Samia', rouvert_le: null, rouvert_par_nom: null }),
    { id: 1, debut: '2026-03-01', fin: '2026-03-31', etat: 'close', nbBrouillard: 0, nbValidees: 12, totalValidees: '15000.000', closPar: 'Samia', closLe: 'x', rouvertPar: null, rouvertLe: null });
});

test('migration 216 : périodes (clos / rouvert par et le), vraie date avant la date, index du numéro et de l\'origine, manuel (gardes md5 de la 215, fiche « Validation et périodes »)', () => {
  const sql = lire('migrations', '216_compta_validation_periodes.sql');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  for (const t of [
    'ALTER TABLE compta.periodes ADD COLUMN IF NOT EXISTS clos_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;',
    'ALTER TABLE compta.periodes ADD COLUMN IF NOT EXISTS clos_le TIMESTAMPTZ;',
    'ALTER TABLE compta.periodes ADD COLUMN IF NOT EXISTS rouvert_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;',
    'ALTER TABLE compta.periodes ADD COLUMN IF NOT EXISTS rouvert_le TIMESTAMPTZ;',
    "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_compta_ecritures_date_reelle') THEN",
    'ALTER TABLE compta.ecritures ADD CONSTRAINT ck_compta_ecritures_date_reelle CHECK (date_reelle IS NULL OR date_reelle < date);',
    'CREATE INDEX IF NOT EXISTS idx_compta_ecritures_numero_journal ON compta.ecritures (dossier_id, journal_id, exercice_id, numero) WHERE numero IS NOT NULL;',
    'CREATE INDEX IF NOT EXISTS idx_compta_ecritures_origine ON compta.ecritures (origine_id) WHERE origine_id IS NOT NULL;',
  ]) assert.ok(sql.includes(t), t);
  assert.ok(!/DROP |DELETE FROM|TRUNCATE|UPDATE compta\./.test(sql), 'additive : aucune écriture, période ni dossier ne change');
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.match(sql, /SET contenu = CASE WHEN contenu = contenu_defaut THEN f\.texte ELSE contenu END/, 'une fiche retouchée garde sa retouche');
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  const texteDe = (fichier, marque) => {
    const src = lire('migrations', fichier);
    const debut = src.indexOf(marque) + marque.length;
    return src.slice(debut, src.indexOf(marque, debut));
  };
  const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
  for (const [marque, slug, marqueOrigine, attendus, disparus] of [
    ['$f216a$', 'compta-ecritures', '$f215f$', ['**Valider** une écriture', '**Valider la période**', '**Contre-passer** une écriture validée', 'AC-2026-000002', 'premier jour de la période ouverte suivante', 'Validé = définitif', 'validez par période', 'page **Périodes**'], ['arrivent à l\'étape suivante', 'à l\'étape suivante, avec']],
    ['$f216b$', 'compta-dossier', '$f215a$', ['page **Périodes**', 'ses **périodes** (ouvertes, closes)'], ['toutes ouvertes jusqu\'à l\'étape de la clôture', 'arrivent aux étapes suivantes']],
  ]) {
    const garde = md5(texteDe('215_compta_ecritures.sql', marqueOrigine));
    assert.ok(sql.includes(`${marque}, '${slug}', '${garde}')`), `${slug} : garde ${garde}`);
    const texte = texteDe('216_compta_validation_periodes.sql', marque);
    for (const a of attendus) assert.ok(texte.includes(a), `${slug} : ${a}`);
    for (const d of disparus) assert.ok(!texte.includes(d), `${slug} : plus « ${d} »`);
  }
  assert.ok(sql.includes("('compta-periodes', 'Validation et périodes', '🔏', 1071, $f216c$## 🔏 Validation et périodes"));
  assert.ok(sql.includes("'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'") && sql.includes('ON CONFLICT (slug) DO NOTHING'));
  assert.ok(sql.includes("'/periodes')"), 'écran de la fiche');
  const fiche = texteDe('216_compta_validation_periodes.sql', '$f216c$');
  for (const mot of ['Valider tout', 'Clore', 'Rouvrir', 'titulaire seul', 'Journal général (PDF)', 'centralisation', 'pages numérotées', 'premier jour de la période ouverte suivante', 'NC 01', 'piste d\'audit', 'Saisie', 'Consultation', 'ne clôt pas l\'exercice']) assert.ok(fiche.includes(mot), mot);
  assert.ok(!/étape suivante/.test(sql), 'les fiches ne renvoient plus la validation à une étape suivante');
});

test('routes S6b : cinq écritures sous la limite de la saisie, trois lectures, adresses, transaction et droits', () => {
  const src = lire('src', 'compta', 'routes.js');
  for (const r of [
    "router.post('/dossiers/:dossierId/ecritures/:ecritureId/valider', authenticate, limiteEcritures, validation.valider);",
    "router.post('/dossiers/:dossierId/ecritures/:ecritureId/contrepasser', authenticate, limiteEcritures, validation.contrepasser);",
    "router.get('/dossiers/:dossierId/periodes', authenticate, periodes.lire);",
    "router.get('/dossiers/:dossierId/periodes/:periodeId', authenticate, periodes.une);",
    "router.get('/dossiers/:dossierId/periodes/:periodeId/journal-general.pdf', authenticate, limitePdf, periodes.journalGeneral);",
    "router.post('/dossiers/:dossierId/periodes/:periodeId/valider', authenticate, limiteEcritures, validation.validerPeriode);",
    "router.post('/dossiers/:dossierId/periodes/:periodeId/clore', authenticate, limiteEcritures, periodes.clore);",
    "router.post('/dossiers/:dossierId/periodes/:periodeId/rouvrir', authenticate, limiteEcritures, periodes.rouvrir);",
  ]) assert.ok(src.includes(r), r);
  for (const f of ['valider', 'validerPeriode', 'contrepasser']) assert.equal(typeof validation[f], 'function', `validation.${f}`);
  for (const f of ['lire', 'une', 'clore', 'rouvrir', 'journalGeneral']) assert.equal(typeof periodes[f], 'function', `periodes.${f}`);
  const v = lire('src', 'compta', 'validation.js');
  assert.ok(v.includes("const ecritureValidation = (req, travail, droit = 'configurer') => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {\n  if (!droits(acces)[droit]) throw erreur(403, MSG_PAR_DROIT[droit] || MSG_VALIDER, 'NIVEAU_INSUFFISANT');\n  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\\'abord', 'DOSSIER_ARCHIVE');"));
  assert.equal((v.match(/await ecritureValidation\(req, async \(db, acces, d\) => /g) || []).length, 3, 'valider, valider la période, contre-passer dans la transaction du dossier');
  assert.ok(v.includes('exigerBrouillard(e);'), 'valider exige le brouillard');
  assert.ok(v.includes("SELECT MAX(numero) AS dernier FROM compta.ecritures WHERE dossier_id = $1 AND journal_id = $2 AND exercice_id = $3 AND numero IS NOT NULL"), 'numéro suivant : MAX par journal et exercice, sous le verrou du dossier');
  assert.ok(v.includes("SET etat = 'validee', numero = $2, valide_par = $3, valide_le = NOW(), updated_at = NOW()"), 'validation : état, numéro, auteur, heure du serveur');
  assert.ok(v.includes("ORDER BY e.date, e.numero_provisoire"), 'valider la période : ordre des dates puis des numéros provisoires');
  assert.ok(v.includes("FROM unnest($1::int[], $2::text[]) AS v(id, numero)") && v.includes("if (maj.rowCount !== numeros.length) throw erreur(409"), 'valider la période : un seul UPDATE pour toute la période (relecture)');
  const ctrl = lire('src', 'compta', 'ecritures.js');
  assert.equal((ctrl.match(/await controlerDateReelle\(db, d\.id, e\.dateReelle\);/g) || []).length, 2, 'vraie date d\'une période ouverte refusée à la création et à la modification (relecture)');
  assert.ok(ctrl.includes("'DATE_REELLE_OUVERTE'"));
  assert.ok(src.includes("router.get('/dossiers/:dossierId/periodes/:periodeId/journal-general.pdf', authenticate, limitePdf, periodes.journalGeneral);") && src.includes('max: 30,\n  keyGenerator: (req) => `pdf:${req.user.id}`'), 'journal général : 30 PDF par quart d\'heure et par personne (relecture)');
  assert.ok(v.includes("if (e.etat !== 'validee') throw erreur(409") && v.includes("'ECRITURE_BROUILLARD'") && v.includes("'DEJA_CONTREPASSEE'") && v.includes("'DATE_AVANT_ORIGINE'"), 'contre-passation : validée seulement, une seule fois, jamais avant l\'origine');
  assert.ok(v.includes("'validee', $10, $10, 'contrepassation', $11, $12, $12, NOW()"), 'l\'écriture inverse naît validée, liée à l\'origine');
  for (const code of ["'ecriture_validee'", "'periode_validee'", "'ecriture_contrepassee'"]) assert.ok(v.includes(code), `journal D16 ${code}`);
  const p = lire('src', 'compta', 'periodes.js');
  assert.equal((p.match(/await ecritureValidation\(req, async \(db, acces, d\) => /g) || []).length, 2, 'clore et rouvrir dans la transaction du dossier');
  assert.ok(p.includes("}, 'archiver');"), 'rouvrir : titulaire seul (droit archiver)');
  assert.ok(p.includes("'BROUILLARD_RESTANT'") && p.includes("SET etat = 'close', clos_par = $2, clos_le = NOW(), rouvert_par = NULL, rouvert_le = NULL") && p.includes("SET etat = 'ouverte', rouvert_par = $2, rouvert_le = NOW()"));
  for (const code of ["'periode_close'", "'periode_rouverte'"]) assert.ok(p.includes(code), `journal D16 ${code}`);
  assert.ok(p.includes("e.etat = 'validee'\n   GROUP BY j.id") && p.includes('bufferPages: true') && p.includes('Page ${i + 1} / ${pages.count}'), 'journal général : écritures validées, centralisation, pages numérotées');
  for (const f of [v, p]) {
    const code = f.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.ok(!/parseFloat|Number\(.*(debit|credit|montant|taux)/.test(code), 'jamais de flottant sur un montant');
    assert.ok(!/gerant_parent_id|requireClient|requireEntreprise/.test(code), 'règles du chantier');
  }
  // Droits (réponses 4 et 5 du 08/10) : configurer = titulaire, Complet ; archiver = titulaire.
  assert.equal(dossiers.droits({ role: 'gerant', niveau: 'saisie' }).configurer, false, 'Saisie ne valide pas');
  assert.equal(dossiers.droits({ role: 'gerant', niveau: 'complet' }).configurer, true);
  assert.equal(dossiers.droits({ role: 'gerant', niveau: 'complet' }).archiver, false, 'Complet ne rouvre pas');
  assert.equal(dossiers.droits({ role: 'titulaire', niveau: 'complet' }).archiver, true);
});

test('journal général : texte sûr pour Helvetica (Windows-1252), libellé du mois, centralisation en millimes entiers', () => {
  assert.equal(periodes.sur('Hôtel Les Jasmins — 1 190,500 D'), 'Hôtel Les Jasmins — 1 190,500 D');
  assert.equal(periodes.sur('Société شركة 😀'), 'Société ???? ?', 'arabe et émoji : « ? »');
  assert.equal(periodes.sur('a b c'), 'a b c', 'espaces insécables → espaces');
  assert.equal(periodes.sur(null), '');
  assert.equal(periodes.libelleMois('2026-03-01'), 'mars 2026');
  assert.equal(periodes.libelleMois('2026-07-15'), 'juillet 2026', 'une période partielle garde son mois');
  assert.ok(periodes.SQL_CENTRALISATION.includes('COUNT(DISTINCT e.id)::int AS nb_ecritures') && periodes.SQL_CENTRALISATION.includes('COALESCE(SUM(l.debit), 0)::text AS debit'));
  assert.ok(periodes.SQL_PERIODES.includes('SUM(e.total_debit) FILTER (WHERE e.etat = \'validee\') AS total_validees'));
  assert.equal(typeof periodes.construireJournalGeneral, 'function');
});

test('saisies refusées avant toute requête : contre-passation (400), identifiants (404 sans requête)', async () => {
  const user = { id: 1, role: 'comptable' };
  let res = reponse();
  await validation.contrepasser({ user, params: { dossierId: '1', ecritureId: '1' }, body: { date: 'x' }, query: {} }, res);
  assert.equal(res.statut, 400, 'date mal formée');
  for (const [module_, gestionnaire, params] of [
    [validation, 'valider', { dossierId: 'abc', ecritureId: '1' }], [validation, 'validerPeriode', { dossierId: '-1', periodeId: '1' }], [validation, 'contrepasser', { dossierId: '1; DROP', ecritureId: '1' }],
    [periodes, 'lire', { dossierId: 'x' }], [periodes, 'une', { dossierId: '-1', periodeId: '1' }], [periodes, 'clore', { dossierId: 'abc', periodeId: '1' }], [periodes, 'rouvrir', { dossierId: 'abc', periodeId: '1' }], [periodes, 'journalGeneral', { dossierId: 'abc', periodeId: '1' }],
  ]) {
    res = reponse();
    await module_[gestionnaire]({ user, params, body: {}, query: {} }, res);
    assert.equal(res.statut, 404, `${gestionnaire} ${JSON.stringify(params)}`);
  }
});
