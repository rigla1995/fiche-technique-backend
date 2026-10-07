// LabFlow Compta, étape S4b (labflow-reprise/achats-compta/PLAN-S4.md §1, §4 ; réponses 3 et 4 du 07/10) : le dossier
// « Mon entreprise » du client LabFlow. Tests sans base : identité LabFlow copiée (replis, bornes), année civile à Tunis,
// création d'office à l'activation du module, route de reprise de l'identité, migration 209.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const dossiers = require('../src/compta/dossiers');
const dossierLabflow = require('../src/compta/dossierLabflow');

const reponse = () => {
  const res = { statut: 200, corps: null };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  res.send = () => res;
  return res;
};

test('identité LabFlow copiée : colonnes bornées, blancs réduits, raison sociale jamais vide (replis)', () => {
  const v = dossiers.identiteLabflow({
    contact: 'Ali Ben Salem', raison_sociale: '  Café  du Port ', nom_commercial: null, forme_juridique: 'SARL', matricule_fiscal: '1234567A/A/M/000',
    rne: 'B1', adresse: 'x'.repeat(400), ville: 'Tunis', representant_nom: 'Ali', representant_qualite: 'Gérant',
  });
  assert.equal(v.raison_sociale, 'Café du Port');
  assert.equal(v.nom_commercial, null);
  assert.equal(v.adresse.length, 300, 'adresse libre bornée à la colonne');
  assert.equal(v.forme_juridique, 'SARL');
  assert.deepEqual(Object.keys(v).sort(), ['adresse', 'forme_juridique', 'matricule_fiscal', 'nom_commercial', 'raison_sociale', 'representant_nom', 'representant_qualite', 'rne', 'ville']);
  assert.equal(dossiers.identiteLabflow({ contact: 'Ali Ben Salem' }).raison_sociale, 'Ali Ben Salem', 'sans fiche : le nom du contact');
  assert.equal(dossiers.identiteLabflow({ contact: ' ', nom_commercial: 'Chez Ali' }).raison_sociale, 'Chez Ali', 'nom commercial avant le contact');
  assert.equal(dossiers.identiteLabflow({}).raison_sociale, 'Mon entreprise', 'dernier repli');
  assert.equal(dossiers.identiteLabflow({ raison_sociale: '', matricule_fiscal: '' }).matricule_fiscal, null, 'vide → NULL');
  assert.ok(dossiers.SQL_IDENTITE_CLIENT.includes('LEFT JOIN profil_entreprise pe ON pe.client_id = u.id'), 'client sans fiche accepté');
});

test('année civile en cours, à l\'heure de Tunis', () => {
  const a = dossiers.anneeCivile();
  assert.match(a.debut, /^\d{4}-01-01$/);
  assert.equal(a.fin, `${a.debut.slice(0, 4)}-12-31`);
  // Le 31 décembre à 23 h 30 UTC, il est déjà le 1er janvier à Tunis (UTC+1) : l'année suivante.
  assert.equal(dossiers.anneeCivile(new Date('2026-12-31T23:30:00Z')).debut, '2027-01-01');
  assert.equal(dossiers.anneeCivile(new Date('2026-06-15T12:00:00Z')).fin, '2026-12-31');
});

test('activation du module (moduleClient.basculer) : le dossier « Mon entreprise » est créé d\'office, une seule fois', () => {
  const src = lire('src', 'compta', 'moduleClient.js');
  assert.ok(src.includes("const { assurerDossierLabflow } = require('./dossierLabflow');"));
  const appel = src.indexOf('if (actif) await assurerDossierLabflow(db, { espaceId, clientId, auteurId });');
  assert.ok(appel > 0, 'appelé à chaque activation (création ou réouverture de la comptabilité)');
  assert.ok(appel > src.indexOf("await journaliser(db, espaceId, auteurId, 'espace_cree'"), 'après la création de la comptabilité');
  assert.ok(appel < src.indexOf('// Activation : une demande du client encore en attente'), 'dans la même transaction, avant la suite');
  assert.equal(dossierLabflow.assurerDossierLabflow.constructor.name, 'AsyncFunction');
  const dl = lire('src', 'compta', 'dossierLabflow.js');
  assert.ok(dl.includes("WHERE espace_id = $1 AND source = 'labflow' LIMIT 1"), 'jamais deux dossiers « Mon entreprise »');
  assert.ok(dl.includes("'reel', 'labflow', $6"), 'TVA au réel, source labflow, client représenté');
  assert.ok(dl.includes("'dossier_cree', { dossier: d.id, nom: d.nom, matricule: d.matricule_fiscal, source: 'labflow', client: clientId }"), 'journal');
  // Aucun cycle de modules : dossiers.js ne dépend ni de dossierLabflow ni de moduleClient.
  const dj = lire('src', 'compta', 'dossiers.js');
  assert.ok(!/require\('\.\/(dossierLabflow|moduleClient)'\)/.test(dj));
});

test('reprise de l\'identité LabFlow : route sous la garde, refusée avant toute requête sur un identifiant invalide', async () => {
  const src = lire('src', 'compta', 'routes.js');
  assert.ok(src.includes("router.post('/dossiers/:dossierId/reprendre-identite', authenticate, limiteDossiers, dossiers.reprendreIdentite);"));
  const res = reponse();
  await dossiers.reprendreIdentite({ user: { id: 1, role: 'client' }, params: { dossierId: 'x' }, body: {} }, res);
  assert.equal(res.statut, 404);
  const dj = lire('src', 'compta', 'dossiers.js');
  const debut = dj.indexOf('const reprendreIdentite = async (req, res) => {');
  const corps = dj.slice(debut, dj.indexOf('\n};\n', debut));
  assert.ok(corps.includes("if (d.source !== 'labflow' || !d.client_labflow_id || d.client_labflow_id !== acces.titulaire_id || acces.type !== 'client_labflow') {"), 'seulement le dossier « Mon entreprise » du client titulaire');
  assert.ok(corps.includes("if (!droits(acces).modifier) throw erreur(403, MSG_NIVEAU, 'NIVEAU_INSUFFISANT');"), 'mêmes droits que la modification');
  assert.ok(corps.includes("{ reprise: 'labflow' }"), 'journal : reprise marquée');
  assert.ok(corps.includes('.filter(([, v]) => v != null)'), 'un champ vide dans LabFlow n\'efface rien');
  // Le dossier « Mon entreprise » ne se supprime pas (il renaîtrait) : archivage seul.
  const ds = dj.indexOf('const supprimer = async (req, res) => {');
  assert.ok(dj.slice(ds, dj.indexOf('\n};\n', ds)).includes("if (d.source === 'labflow') throw erreur(409, 'Le dossier « Mon entreprise » ne se supprime pas : archivez-le', 'DOSSIER_LABFLOW');"));
  // Rien ne change : ni écriture ni journal.
  const dm = dj.indexOf('const mettreAJour = async');
  assert.ok(dj.slice(dm, dj.indexOf('\n};\n', dm)).includes('if (!Object.keys(changements).length) return changements;'));
});

test('migration 209 : dossiers des comptabilités ouvertes sans dossier, exercice civil et périodes, journal ; fiches gardées ; LF', () => {
  const sql = fs.readFileSync(path.join(RACINE, 'migrations', '209_compta_dossier_client.sql'), 'utf8');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  assert.ok(!/ALTER TABLE|CREATE TABLE/.test(sql), 'aucune table ne change (un index seulement)');
  assert.match(sql, /WHERE e\.type = 'client_labflow' AND e\.etat = 'actif'\n\s+AND NOT EXISTS \(SELECT 1 FROM compta\.dossiers d WHERE d\.espace_id = e\.id AND d\.source = 'labflow'\)/, 'comptabilités ouvertes sans dossier (idempotent)');
  assert.match(sql, /COALESCE\(NULLIF\(TRIM\(raison_sociale\), ''\), NULLIF\(TRIM\(nom_commercial\), ''\), NULLIF\(TRIM\(contact\), ''\), 'Mon entreprise'\)/, 'raison sociale jamais vide (mêmes replis que le code)');
  assert.match(sql, /CASE WHEN forme_juridique IN \('EI', 'AUTO_ENTREPRENEUR'\) THEN 'physique' ELSE 'morale' END/);
  assert.match(sql, /CASE WHEN forme_juridique IN \('EI', 'AUTO_ENTREPRENEUR'\) THEN 'IRPP' ELSE 'IS' END/);
  assert.match(sql, /'reel', 'labflow', titulaire_id/);
  assert.match(sql, /date_trunc\('year', \(NOW\(\) AT TIME ZONE 'Africa\/Tunis'\)\)::date, \(date_trunc\('year', \(NOW\(\) AT TIME ZONE 'Africa\/Tunis'\)\) \+ interval '1 year' - interval '1 day'\)::date/, 'année civile à Tunis');
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS compta_dossiers_labflow_unique ON compta\.dossiers \(espace_id\) WHERE source = 'labflow';/, 'un seul « Mon entreprise » par comptabilité');
  assert.match(sql, /generate_series\(x\.debut::timestamp, x\.fin::timestamp, interval '1 month'\)/, 'périodes mensuelles');
  assert.match(sql, /'source', 'labflow', 'migration', 209/, 'journal du dossier');
  assert.match(sql, /'exercice_cree', jsonb_build_object\('dossier', i\.id, 'exercice', x\.id, 'debut', x\.debut, 'fin', x\.fin, 'migration', 209\)/);
  assert.match(sql, /'compta-ma-comptabilite', 'db8c12b7116113d0d568d4307f28c689'/);
  assert.match(sql, /'compta-confiee', 'fb3299a7d9a6eb72b6098bcf6b6a57da'/);
  assert.match(sql, /'compta-dossier', 'ba7a6ecd18b7f210ca3d9a535ee0ab4e'/);
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.match(sql, /SET contenu = CASE WHEN contenu = contenu_defaut THEN f\.texte ELSE contenu END/);
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  assert.ok(!sql.includes('ils arriveront dans une prochaine version'), 'plus de « bientôt » pour les dossiers');
});
