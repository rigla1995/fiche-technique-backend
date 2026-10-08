// LabFlow Compta, étape S4a (labflow-reprise/achats-compta/PLAN-S4.md ; SPEC-SOCLE §3.2, D3, D4, D10, D17) : les
// dossiers du cabinet. Tests sans base : régime fiscal, exercice et identité contrôlés avant toute requête, périodes
// mensuelles, droits par niveau (réponse du client du 07/10), routes des dossiers, D10 côté admin, migration 208.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const dossiers = require('../src/compta/dossiers');

const reponse = () => {
  const res = { statut: 200, corps: null };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  res.send = () => res;
  return res;
};
const refuse = (fn, statut, motif) => assert.throws(fn, (e) => e.statusCode === statut, motif);

test('régime fiscal : listes fermées, oui / non, début d\'activité ; proposition d\'après la forme juridique', () => {
  assert.deepEqual(dossiers.lireRegime({ personne: 'morale', impot: 'IS', tva: 'reel' }),
    { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: false, debutActivite: null });
  assert.deepEqual(dossiers.lireRegime({ personne: 'physique', impot: 'IRPP', tva: 'forfaitaire', exportateurTotal: true, teledeclaration: true, debutActivite: '2024-03-01' }),
    { personne: 'physique', impot: 'IRPP', tva: 'forfaitaire', exportateurTotal: true, teledeclaration: true, debutActivite: '2024-03-01' });
  for (const corps of [
    {}, { personne: 'morale', impot: 'IS' }, { personne: 'autre', impot: 'IS', tva: 'reel' }, { personne: 'morale', impot: 'TVA', tva: 'reel' },
    { personne: 'morale', impot: 'IS', tva: 'simplifie' }, { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: 'oui' },
    { personne: 'morale', impot: 'IS', tva: 'reel', debutActivite: '2024-02-30' }, null, 'x',
  ]) refuse(() => dossiers.lireRegime(corps), 400, JSON.stringify(corps));
  assert.deepEqual(dossiers.lireRegime({ tva: 'non_assujetti', debutActivite: '' }, true), { tva: 'non_assujetti', debutActivite: null }, 'modification partielle');
  assert.deepEqual(dossiers.regimeParForme('EI'), { personne: 'physique', impot: 'IRPP' });
  assert.deepEqual(dossiers.regimeParForme('AUTO_ENTREPRENEUR'), { personne: 'physique', impot: 'IRPP' });
  assert.deepEqual(dossiers.regimeParForme('SARL'), { personne: 'morale', impot: 'IS' });
  assert.deepEqual(dossiers.regimeParForme(null), { personne: 'morale', impot: 'IS' });
  assert.deepEqual([dossiers.PERSONNES, dossiers.IMPOTS, dossiers.TVA], [['morale', 'physique'], ['IS', 'IRPP'], ['reel', 'forfaitaire', 'non_assujetti']]);
});

test('exercice (réponse du 07/10 : dates libres) : dates réelles, fin le dernier jour d\'un mois, 12 mois au plus ; périodes', () => {
  assert.deepEqual(dossiers.lireExercice({ debut: '2026-01-01', fin: '2026-12-31' }), { debut: '2026-01-01', fin: '2026-12-31' });
  assert.deepEqual(dossiers.lireExercice({ debut: '2026-07-15', fin: '2027-06-30' }), { debut: '2026-07-15', fin: '2027-06-30' }, 'exercice décalé, début en cours de mois');
  assert.deepEqual(dossiers.lireExercice({ debut: '2026-11-20', fin: '2026-12-31' }), { debut: '2026-11-20', fin: '2026-12-31' }, 'premier exercice court');
  for (const [corps, motif] of [
    [{}, 'vide'], [{ debut: '2026-01-01', fin: '2026-12-30' }, 'fin pas en fin de mois'], [{ debut: '2026-01-01', fin: '2027-01-31' }, '13 mois'],
    [{ debut: '2026-07-15', fin: '2027-07-31' }, '13 mois décalés'], [{ debut: '2026-03-01', fin: '2026-02-28' }, 'fin avant début'],
    [{ debut: '2026-02-30', fin: '2026-12-31' }, 'date inexistante'], [{ debut: '01/01/2026', fin: '2026-12-31' }, 'format'],
    [{ debut: 20260101, fin: '2026-12-31' }, 'nombre'], [null, 'nul'],
    // Relecture de S4a : une date mal formée ne doit jamais lever (RangeError → 500), elle est refusée (400).
    [{ debut: '2026-13-01', fin: '2026-12-31' }, '13e mois'], [{ debut: '2026-01-01', fin: '2026-02-32' }, '32 février'],
    [{ debut: '2026-00-10', fin: '2026-12-31' }, 'mois 0'], [{ debut: '2026-01-00', fin: '2026-12-31' }, 'jour 0'],
    [{ debut: '0000-01-01', fin: '0000-12-31' }, 'année 0 (refusée par PostgreSQL)'],
  ]) refuse(() => dossiers.lireExercice(corps), 400, motif);
  for (const s of ['2026-13-01', '2026-02-32', '2026-00-10', '2026-01-00', '0000-01-01', '2026-1-1', '', null, 20260101]) assert.equal(dossiers.dateValide(s), false, String(s));
  for (const s of ['2026-01-01', '2028-02-29', '0001-01-01', '9999-12-31']) assert.equal(dossiers.dateValide(s), true, s);
  refuse(() => dossiers.lireRegime({ personne: 'morale', impot: 'IS', tva: 'reel', debutActivite: '2026-13-01' }), 400, 'début d\'activité mal formé');
  const annee = dossiers.periodesDe({ debut: '2026-01-01', fin: '2026-12-31' });
  assert.equal(annee.length, 12);
  assert.deepEqual(annee[0], { debut: '2026-01-01', fin: '2026-01-31' });
  assert.deepEqual(annee[1], { debut: '2026-02-01', fin: '2026-02-28' });
  assert.deepEqual(annee[11], { debut: '2026-12-01', fin: '2026-12-31' });
  const decale = dossiers.periodesDe({ debut: '2026-07-15', fin: '2027-06-30' });
  assert.equal(decale.length, 12);
  assert.deepEqual(decale[0], { debut: '2026-07-15', fin: '2026-07-31' }, 'première période en cours de mois');
  assert.deepEqual(decale[5], { debut: '2026-12-01', fin: '2026-12-31' });
  assert.deepEqual(decale[6], { debut: '2027-01-01', fin: '2027-01-31' }, 'passage d\'année');
  assert.deepEqual(decale[11], { debut: '2027-06-01', fin: '2027-06-30' });
  assert.deepEqual(dossiers.periodesDe({ debut: '2028-02-10', fin: '2028-02-29' }), [{ debut: '2028-02-10', fin: '2028-02-29' }], 'un seul mois, bissextile');
  assert.equal(dossiers.nbMois('2026-07-15', '2027-06-30'), 12);
  assert.equal(dossiers.finDeMois('2026-02-03'), '2026-02-28');
  assert.equal(dossiers.finDeMois('2028-02-03'), '2028-02-29');
  assert.equal(dossiers.MOIS_MAX, 12);
});

test('identité d\'un dossier (D17) : raison sociale obligatoire, matricule contrôlé, caractères latins', () => {
  const ok = dossiers.lireIdentiteDossier({ raisonSociale: ' Café du Port ', formeJuridique: 'sarl', matriculeFiscal: '1234567 a/a/m/000' });
  assert.deepEqual(ok.valeurs, { raison_sociale: 'Café du Port', forme_juridique: 'SARL', matricule_fiscal: '1234567A/A/M/000' });
  assert.deepEqual(ok.avertissements, []);
  refuse(() => dossiers.lireIdentiteDossier({}), 400, 'sans raison sociale');
  refuse(() => dossiers.lireIdentiteDossier({ raisonSociale: '' }), 400, 'raison sociale vide');
  refuse(() => dossiers.lireIdentiteDossier({ raisonSociale: 'X', matriculeFiscal: '12345' }), 400, 'matricule invalide');
  refuse(() => dossiers.lireIdentiteDossier({ raisonSociale: 'شركة' }), 400, 'lettres arabes (factures)');
  refuse(() => dossiers.lireIdentiteDossier({ raisonSociale: 'X', ville: 12 }), 400, 'valeur non texte');
  refuse(() => dossiers.lireIdentiteDossier(null), 400, 'nul');
  assert.deepEqual(dossiers.lireIdentiteDossier({ ville: 'Sfax' }, true).valeurs, { ville: 'Sfax' }, 'modification partielle sans raison sociale');
  refuse(() => dossiers.lireIdentiteDossier({ raisonSociale: ' ' }, true), 400, 'la raison sociale ne se vide pas');
  assert.ok(dossiers.lireIdentiteDossier({ raisonSociale: 'X', matriculeFiscal: '1234567' }).avertissements[0].includes('sans lettre de clé'));
});

test('droits (réponse du 07/10) : titulaire tout ; Complet crée et modifie ; Saisie et Consultation lisent', () => {
  // S5c : `tiers` (créer et modifier des tiers) = Complet ou Saisie (réponse 4 du client du 08/10) ; S6a : `saisir` (écritures
  // en brouillard) = Complet ou Saisie aussi.
  assert.deepEqual(dossiers.droits({ role: 'titulaire', niveau: 'complet' }), { creer: true, modifier: true, configurer: true, tiers: true, saisir: true, archiver: true, supprimer: true });
  assert.deepEqual(dossiers.droits({ role: 'gerant', niveau: 'complet' }), { creer: true, modifier: true, configurer: true, tiers: true, saisir: true, archiver: false, supprimer: false });
  for (const niveau of ['saisie', 'consultation']) {
    assert.deepEqual(dossiers.droits({ role: 'gerant', niveau }), { creer: false, modifier: false, configurer: false, tiers: niveau === 'saisie', saisir: niveau === 'saisie', archiver: false, supprimer: false }, niveau);
  }
  // D10 : un dossier mouvementé ne se supprime jamais ; aucune écriture n'existe avant l'étape de la saisie.
  assert.equal(dossiers.dossierMouvemente.constructor.name, 'AsyncFunction');
});

test('saisies refusées avant toute requête : création, modification, identifiants (404 sans requête)', async () => {
  const regime = { personne: 'morale', impot: 'IS', tva: 'reel' };
  const exercice = { debut: '2026-01-01', fin: '2026-12-31' };
  for (const [corps, motif] of [
    [{}, 'vide'], [{ identite: { raisonSociale: 'X' }, regime }, 'sans exercice'], [{ identite: {}, regime, exercice }, 'sans raison sociale'],
    [{ identite: { raisonSociale: 'X' }, regime: { ...regime, tva: 'x' }, exercice }, 'TVA inconnue'],
    [{ identite: { raisonSociale: 'X' }, regime, exercice: { debut: '2026-01-01', fin: '2026-12-30' } }, 'fin d\'exercice'],
  ]) {
    const res = reponse();
    await dossiers.creer({ user: { id: 1, role: 'comptable' }, params: { espaceId: '1' }, body: corps }, res);
    assert.equal(res.statut, 400, motif);
  }
  let res = reponse();
  await dossiers.modifier({ user: { id: 1, role: 'comptable' }, params: { dossierId: '1' }, body: {} }, res);
  assert.equal(res.statut, 400, 'rien à modifier');
  // Relecture de S4a : des parties vides ne valent rien (aucune écriture ni ligne de journal pour rien).
  res = reponse();
  await dossiers.modifier({ user: { id: 1, role: 'comptable' }, params: { dossierId: '1' }, body: { identite: {}, regime: {} } }, res);
  assert.equal(res.statut, 400, 'parties vides : rien à modifier');
  const complet = { identite: { raisonSociale: 'X' }, regime, exercice };
  for (const [gestionnaire, params, body] of [
    ['fiche', { dossierId: 'x' }, {}], ['modifier', { dossierId: '1; DROP' }, { regime: { tva: 'reel' } }], ['archiver', { dossierId: '-1' }, {}],
    ['desarchiver', { dossierId: '' }, {}], ['supprimer', { dossierId: '99999999999' }, {}], ['lister', { espaceId: 'abc' }, {}], ['creer', { espaceId: 'abc' }, complet],
  ]) {
    res = reponse();
    await dossiers[gestionnaire]({ user: { id: 1, role: 'comptable' }, params, body }, res);
    assert.equal(res.statut, 404, `${gestionnaire} ${JSON.stringify(params)}`);
  }
});

test('routes des dossiers : la comptabilité dans l\'adresse (D3), accès jugé par le contrôleur, limite de débit', () => {
  const src = lire('src', 'compta', 'routes.js');
  for (const l of [
    "router.get('/espaces/:espaceId/dossiers', authenticate, dossiers.lister);",
    "router.post('/espaces/:espaceId/dossiers', authenticate, limiteDossiers, dossiers.creer);",
    "router.get('/dossiers/:dossierId', authenticate, dossiers.fiche);",
    "router.put('/dossiers/:dossierId', authenticate, limiteDossiers, dossiers.modifier);",
    "router.post('/dossiers/:dossierId/archiver', authenticate, limiteDossiers, dossiers.archiver);",
    "router.post('/dossiers/:dossierId/desarchiver', authenticate, limiteDossiers, dossiers.desarchiver);",
    "router.delete('/dossiers/:dossierId', authenticate, limiteDossiers, dossiers.supprimer);",
  ]) assert.ok(src.includes(l), l);
  assert.ok(!/exigerTitulaireCabinet, dossiers\./.test(src), 'jamais le titulaire seul : titulaire ou gérant, jugé par le contrôleur');
  const ctrl = lire('src', 'compta', 'dossiers.js');
  const code = ctrl.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/gerant_parent_id|requireClient|requireEntreprise/.test(code), 'règles du chantier');
  assert.ok(ctrl.includes('FOR UPDATE OF e'), 'comptabilité verrouillée pour une écriture');
  // Toute lecture passe par la liste de l'accès (tous_dossiers, sinon acces_dossiers — S4c) : une seule clause, partout.
  assert.ok(ctrl.includes('const SQL_VISIBLE = `($2::boolean OR EXISTS (SELECT 1 FROM compta.acces_dossiers ad WHERE ad.acces_id = $3 AND ad.dossier_id = d.id))`'));
  // Liste (page), comptes rendus de la liste (S4d), lecture d'un dossier, avertissement du matricule (relecture de S4a :
  // jamais le nom d'un dossier fermé à la personne) — et aucune autre lecture de compta.dossiers hors de la clause.
  assert.equal((ctrl.match(/\$\{SQL_VISIBLE\}/g) || []).length, 4, 'liste, comptes rendus, lecture d\'un dossier, avertissement du matricule');
  assert.equal((code.match(/FROM compta\.dossiers d\b/g) || []).length, 4, 'toute lecture de dossiers porte la clause');
  const cli = lire('src', 'controllers', 'clientsController.js');
  assert.ok(cli.includes('if (estRetenuParDossiers(err)) return res.status(409).json(refusClientAvecDossiers(null));'), 'course D10 : RESTRICT → 409');
  const d10 = require('../src/compta/d10');
  assert.equal(d10.estRetenuParDossiers({ code: '23503', schema: 'compta', table: 'dossiers', constraint: 'dossiers_espace_id_fkey' }), true, 'erreur telle que PostgreSQL la rend');
  assert.equal(d10.estRetenuParDossiers({ code: '23503', constraint: 'dossiers_espace_id_fkey' }), true);
  assert.equal(d10.estRetenuParDossiers({ code: '23503', schema: 'public', table: 'paiements' }), false);
  assert.equal(d10.estRetenuParDossiers({ code: '42P01', schema: 'compta' }), false);
  assert.equal(d10.estRetenuParDossiers(null), false);
  assert.match(d10.refusClientAvecDossiers(null).message, /^Ce client a des dossiers dans LabFlow Compta/);
  assert.ok(ctrl.includes("a.personne_id = $1 AND a.espace_id = $2 AND a.etat = 'actif' AND e.etat = 'actif'"), 'accès actif sur une comptabilité ouverte');
});

test('D10 : la suppression d\'un cabinet ou d\'un client qui a un dossier est refusée (409), avant toute suppression', () => {
  const d10 = require('../src/compta/d10');
  assert.equal(d10.refusCabinetAvecDossiers(1).code, 'DOSSIERS_EN_PLACE');
  assert.match(d10.refusCabinetAvecDossiers(1).message, /^Ce cabinet a 1 dossier : /);
  assert.match(d10.refusClientAvecDossiers(3).message, /^Ce client a 3 dossiers dans LabFlow Compta/);
  const cab = lire('src', 'compta', 'cabinetsController.js');
  const debut = cab.indexOf('const remove = async (req, res) => {');
  const corps = cab.slice(debut, cab.indexOf('\n};\n', debut));
  assert.ok(corps.indexOf('await nbDossiersDuTitulaire(db, c.id)') > 0 && corps.indexOf('await nbDossiersDuTitulaire(db, c.id)') < corps.indexOf("await db.query('BEGIN')"), 'cabinet : dossiers comptés avant la transaction');
  assert.ok(corps.includes('refusCabinetAvecDossiers(nbDossiers)'));
  const cli = lire('src', 'controllers', 'clientsController.js');
  const d2 = cli.indexOf('const remove = async (req, res) => {');
  const c2 = cli.slice(d2, cli.indexOf('\n};\n', d2));
  assert.ok(c2.indexOf('await nbDossiersDuTitulaire(dbClient, id)') > 0 && c2.indexOf('await nbDossiersDuTitulaire(dbClient, id)') < c2.indexOf('UPDATE ${t} SET created_by = NULL'), 'client : dossiers comptés avant la moindre écriture');
  assert.ok(c2.indexOf("await dbClient.query('ROLLBACK');\n      return res.status(409).json(refusClientAvecDossiers(nbDossiers));") > 0, 'client : transaction défaite avant le refus');
  const acces = lire('src', 'compta', 'accesController.js');
  assert.ok(acces.includes('AS nb_dossiers') && acces.includes('nbDossiers: x.nb_dossiers || 0'), '« Mon cabinet » compte les dossiers');
  assert.ok(cab.includes('AS nb_dossiers') && cab.includes('nbDossiers: row.nb_dossiers || 0'), 'fiche admin du cabinet');
});

test('migration 208 : dossiers (RESTRICT), exercices, périodes, acces_dossiers ; fiches gardées par empreinte ; LF', () => {
  const sql = fs.readFileSync(path.join(RACINE, 'migrations', '208_compta_dossiers.sql'), 'utf8');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS compta\.dossiers \(/);
  assert.match(sql, /espace_id\s+INTEGER NOT NULL REFERENCES compta\.espaces\(id\) ON DELETE RESTRICT/);
  for (const c of ['raison_sociale', 'nom_commercial', 'forme_juridique', 'matricule_fiscal', 'rne', 'adresse', 'ville', 'representant_nom', 'representant_qualite']) {
    assert.ok(new RegExp(`\\n  ${c}\\s`).test(sql), c);
  }
  assert.match(sql, /CHECK \(personne IN \('morale', 'physique'\)\)/);
  assert.match(sql, /CHECK \(impot IN \('IS', 'IRPP'\)\)/);
  assert.match(sql, /CHECK \(tva IN \('reel', 'forfaitaire', 'non_assujetti'\)\)/);
  assert.match(sql, /CHECK \(source IN \('saisi', 'labflow'\)\)/);
  assert.match(sql, /CHECK \(etat IN \('actif', 'archive'\)\)/);
  assert.match(sql, /pays\s+CHAR\(2\) NOT NULL DEFAULT 'TN'/);
  assert.match(sql, /devise\s+CHAR\(3\) NOT NULL DEFAULT 'TND'/);
  assert.match(sql, /decimales\s+SMALLINT NOT NULL DEFAULT 3/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS compta\.exercices \([\s\S]*?dossier_id INTEGER NOT NULL REFERENCES compta\.dossiers\(id\) ON DELETE CASCADE/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS compta\.periodes \([\s\S]*?exercice_id INTEGER NOT NULL REFERENCES compta\.exercices\(id\) ON DELETE CASCADE/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS compta\.acces_dossiers \(\n  acces_id\s+INTEGER NOT NULL REFERENCES compta\.acces\(id\) ON DELETE CASCADE,\n  dossier_id INTEGER NOT NULL REFERENCES compta\.dossiers\(id\) ON DELETE CASCADE,\n  PRIMARY KEY \(acces_id, dossier_id\)/);
  assert.ok(!/ALTER TABLE/.test(sql), 'aucune table existante ne change');
  assert.match(sql, /'compta-cabinet', 'd7d853b0bfd1a3caef7966542ba2dc2b'/);
  assert.match(sql, /'compta-cabinet-membre', 'a3eabaa69ee7889ba93bfcab8d0ff670'/);
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.match(sql, /SET contenu = CASE WHEN contenu = contenu_defaut THEN f\.texte ELSE contenu END/, 'une fiche retouchée garde sa retouche');
  assert.match(sql, /\('compta-dossiers', 'Dossiers', '📁', 1012,/);
  assert.match(sql, /\('compta-dossier', 'Fiche du dossier', '🗂️', 1013,/);
  assert.match(sql, /ON CONFLICT \(slug\) DO NOTHING;/);
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
});
