// D2 « Acheteurs professionnels (B2B) et particuliers (B2C) » (labflow-reprise/PLAN-DOMAINES-ACHETEURS-CODES.md §2 ligne D2 ;
// réponses du client du 15/10). Tests sans base : la règle métier (src/utils/acheteurType.js), la migration 246, le
// câblage des contrôleurs (type obligatoire, champs obligatoires, refus de facture, copie et lecture snapshot-aware), le
// PDF de la facture de vente (B2B : raison sociale, MF, RNE ; B2C : « Particulier », téléphone ; sans type : inchangé),
// le modèle d'import (8 colonnes).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { textesDuPdf } = require('../scripts/lib/pdf-textes');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const AT = require('../src/utils/acheteurType');
const generate = require('../docuseal-templates/generate');

test('typeDe : saisies reconnues, vide → null, inconnue → undefined', () => {
  for (const v of ['b2b', 'B2B', ' Professionnel ', 'pro', 'entreprise', 'Société']) assert.equal(AT.typeDe(v), 'b2b', v);
  for (const v of ['b2c', 'Particulier', 'particulière', 'personne']) assert.equal(AT.typeDe(v), 'b2c', v);
  for (const v of ['', '   ', null, undefined]) assert.equal(AT.typeDe(v), null);
  for (const v of ['autre', 'a_preciser', 'x']) assert.equal(AT.typeDe(v), undefined, v);
  assert.equal(AT.typeDe('constructor'), undefined, 'pas de prototype');
});

test('champsManquants : B2B = raison sociale, matricule, adresse ; B2C = téléphone ; à préciser = rien', () => {
  assert.deepEqual(AT.champsManquants('b2b', {}), ['la raison sociale', 'le matricule fiscal', 'l\'adresse']);
  assert.deepEqual(AT.champsManquants('b2b', { entreprise: 'X', matriculeFiscal: '  ', adresse: 'rue' }), ['le matricule fiscal']);
  assert.deepEqual(AT.champsManquants('b2b', { entreprise: 'X', matriculeFiscal: '1234567A', adresse: 'rue' }), []);
  assert.deepEqual(AT.champsManquants('b2c', { nom: 'N' }), ['le téléphone']);
  assert.deepEqual(AT.champsManquants('b2c', { telephone: '20 000 000' }), []);
  assert.deepEqual(AT.champsManquants('a_preciser', {}), []);
  assert.match(AT.messageManquants('b2b', ['l\'adresse']), /obligatoires \(manque : l'adresse\)$/);
  assert.match(AT.messageManquants('b2c', ['le téléphone']), /le téléphone est obligatoire$/);
  assert.equal(AT.Maj(AT.MESSAGE_TYPE_REQUIS).slice(0, 8), 'Précisez');
  assert.match(AT.messageTypeInconnu(' abc '), /^type « abc » inconnu/);
});

test('refusFacture : « à préciser » et B2B sans matricule refusés, B2C et B2B au matricule acceptés, fiche supprimée acceptée', () => {
  assert.equal(AT.refusFacture({ type: 'a_preciser', matricule_fiscal: '1234567A' })?.code, 'ACHETEUR_TYPE_A_PRECISER');
  assert.equal(AT.refusFacture({ type: 'b2b', matricule_fiscal: null })?.code, 'ACHETEUR_MATRICULE_REQUIS');
  assert.equal(AT.refusFacture({ type: 'b2b', matricule_fiscal: '  ' })?.code, 'ACHETEUR_MATRICULE_REQUIS');
  assert.equal(AT.refusFacture({ type: 'b2b', matricule_fiscal: '1234567A' }), null);
  assert.equal(AT.refusFacture({ type: 'b2c', matricule_fiscal: null }), null);
  assert.equal(AT.refusFacture(null), null);
  assert.ok(AT.refusFacture({ type: 'a_preciser' }).message.includes('[[ce:acheteur]]'), 'message au vocabulaire du compte');
  assert.equal(AT.rneDe(' b012 345 2024 '), 'B0123452024');
  assert.equal(AT.rneDe(''), null);
  assert.equal(AT.rneDe('x'.repeat(60)).length, 50);
});

test('migration 246 : colonnes, reprise des fiches d\'avant, contrainte, copie sur la facture ; idempotente', () => {
  const sql = lire('migrations', '246_acheteurs_type_b2b_b2c.sql');
  assert.ok(!sql.includes('\r'));
  assert.ok(sql.includes('ALTER TABLE acheteurs ADD COLUMN IF NOT EXISTS type VARCHAR(12);'));
  assert.ok(sql.includes('ALTER TABLE acheteurs ADD COLUMN IF NOT EXISTS rne  VARCHAR(50);'));
  assert.ok(sql.includes("SET type = CASE WHEN NULLIF(BTRIM(matricule_fiscal), '') IS NOT NULL THEN 'b2b' ELSE 'a_preciser' END"));
  assert.ok(sql.includes(' WHERE type IS NULL;'), 'reprise sur les lignes sans type seulement');
  assert.ok(sql.includes("CHECK (type IN ('b2b', 'b2c', 'a_preciser'))"));
  assert.ok(sql.includes('DROP CONSTRAINT IF EXISTS acheteurs_type_check;'));
  assert.ok(sql.includes('ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS acheteur_type VARCHAR(12);'));
  assert.ok(sql.includes('ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS acheteur_rne  VARCHAR(50);'));
  assert.ok(!/DROP TABLE|DELETE/.test(sql));
});

test('carnet : type obligatoire à la création, champs du type, modification contrôlée seulement si l\'identité est touchée, import à 8 colonnes', () => {
  const c = lire('src', 'controllers', 'acheteursController.js');
  assert.ok(c.includes("const HEADERS = [...HEADERS_AVANT, 'Type', 'RNE'];"));
  assert.ok(c.includes("if (type === null) return res.status(400).json({ code: 'TYPE_REQUIS'"));
  assert.ok(c.includes("if (!type) return res.status(400).json({ code: 'TYPE_INCONNU'"));
  assert.equal((c.match(/code: 'CHAMPS_REQUIS'/g) || []).length, 2, 'création et modification');
  assert.ok(c.includes('INSERT INTO acheteurs (client_id, nom, entreprise, email, telephone, adresse, matricule_fiscal, notes, created_by, type, rne)'));
  assert.ok(c.includes('INSERT INTO acheteurs (client_id, nom, entreprise, email, telephone, adresse, matricule_fiscal, created_by, type, rne)'), 'import');
  assert.ok(c.includes("const toucheIdentite = req.body.type !== undefined || ['entreprise', 'telephone', 'adresse', 'matriculeFiscal', 'rne'].some((k) => req.body[k] !== undefined);"));
  assert.ok(c.includes('matricule_fiscal=$6, notes=$7, actif=$8, type=$9, rne=$10, updated_at=NOW()'));
  assert.ok(c.includes("type: row.type || 'a_preciser',") && c.includes('rne: row.rne ?? null,'), 'lecture');
  assert.ok(c.includes('findHeaderRow(ws, HEADERS) ?? findHeaderRow(ws, HEADERS_AVANT) ?? 1'), 'ancien modèle encore lu');
  assert.ok(c.includes("error: 'Type requis : Professionnel ou Particulier'"));
  assert.ok(c.includes("'Professionnel', 'B0123452024']"), 'ligne d\'exemple du modèle');
});

test('factures de vente : refus 409 à la vente directe et à l\'expédition, copie du type et du RNE, lecture snapshot-aware (client et portail)', () => {
  const v = lire('src', 'controllers', 'acheteurVentesController.js');
  assert.ok(v.includes("const { refusFacture } = require('../utils/acheteurType');"));
  assert.ok(v.includes('const refus = refusFacture(ach.rows[0]);\n    if (refus) return res.status(409).json(refus);'), 'vente directe');
  assert.ok(v.includes("if (refus) { await db.query('ROLLBACK'); return res.status(409).json(refus); }"), 'expédition (dans la transaction)');
  assert.ok(v.includes('ach.type AS acheteur_type, ach.rne AS acheteur_rne, ach.id AS acheteur_existant'));
  assert.equal((v.match(/acheteur_type, acheteur_rne,\n/g) || []).length, 2, 'les deux INSERT copient le type et le RNE');
  assert.equal((v.match(/\$19, \$20, \$21\)/g) || []).length, 2);
  const lecture = 'CASE WHEN ach.id IS NULL THEN fa.acheteur_type ELSE ach.type END AS acheteur_type,\n              CASE WHEN ach.id IS NULL THEN fa.acheteur_rne ELSE ach.rne END AS acheteur_rne,';
  assert.ok(v.includes(lecture), 'téléchargement côté vendeur');
  assert.ok(lire('src', 'controllers', 'portailController.js').includes(lecture), 'téléchargement côté portail');
  const s = lire('src', 'services', 'factureAcheteurPdf.js');
  assert.ok(s.includes('type: f.acheteur_type || null,') && s.includes('rne: f.acheteur_rne || null,'));
});

const bloc = (textes, debut, fin) => {
  const i = textes.indexOf(debut);
  const j = textes.indexOf(fin, i + 1);
  assert.ok(i >= 0 && j > i, `bloc « ${debut} » … « ${fin} » introuvable`);
  return textes.slice(i + 1, j);
};
const DONNEES = {
  numero: 'FA-2026-0042', dateFacture: '2026-10-15',
  vendeur: { nom: 'Vendeur Essai', adresse: '12 rue des Essais', tel: '+216 20 000 001', email: 'vendeur@example.com' },
  lignes: [{ designation: 'Semoule fine', quantite: 20, prixHt: 2.4, tauxTva: 7 }],
  remisePct: 0, montantHt: 48, montantTva: 3.36, timbreFiscal: true, montantTimbre: 1, montantTtc: 52.36, notes: null,
};
const SEP = '  ·  ';

test('PDF : professionnel (B2B) = raison sociale — contact, MF, RNE (omis s\'il égale le matricule), email, téléphone, adresse', async () => {
  const b2b = { nom: 'Sami Fictif', entreprise: 'Epicerie des Essais', adresse: '3 rue des Tests, Sfax', mf: '1122334C/A/M/000', tel: '+216 55 000 111', email: 'acheteur@example.com', type: 'b2b', rne: 'B0123452024' };
  let t = textesDuPdf(await generate.buildFactureAcheteur(null, { ...DONNEES, acheteur: b2b }));
  assert.deepEqual(bloc(t, 'FACTURÉ À', 'DÉTAIL'), ['Epicerie des Essais — Sami Fictif', 'MF 1122334C/A/M/000', 'RNE : B0123452024', 'acheteur@example.com', '+216 55 000 111', '3 rue des Tests, Sfax']);
  t = textesDuPdf(await generate.buildFactureAcheteur(null, { ...DONNEES, acheteur: { ...b2b, rne: '1122334 C/A/M/000' } }));
  assert.deepEqual(bloc(t, 'FACTURÉ À', 'DÉTAIL'), ['Epicerie des Essais — Sami Fictif', 'MF 1122334C/A/M/000', 'acheteur@example.com', '+216 55 000 111', '3 rue des Tests, Sfax'], 'RNE égal au matricule : non répété');
});

test('PDF : particulier (B2C) = nom, « Particulier », téléphone — jamais de matricule ni d\'entreprise ; sans type : présentation d\'avant', async () => {
  const b2c = { nom: 'Leïla Fictive', entreprise: 'Ancienne Entreprise', adresse: null, mf: '7654321B', tel: '+216 55 000 222', email: null, type: 'b2c', rne: null };
  let t = textesDuPdf(await generate.buildFactureAcheteur(null, { ...DONNEES, acheteur: b2c }));
  assert.deepEqual(bloc(t, 'FACTURÉ À', 'DÉTAIL'), ['Leïla Fictive', 'Particulier', '+216 55 000 222']);
  t = textesDuPdf(await generate.buildFactureAcheteur(null, { ...DONNEES, acheteur: { ...b2c, adresse: 'Cité Fictive, Nabeul', email: 'leila@example.com' } }));
  assert.deepEqual(bloc(t, 'FACTURÉ À', 'DÉTAIL'), ['Leïla Fictive', 'Particulier', 'leila@example.com', '+216 55 000 222', 'Cité Fictive, Nabeul']);
  // Sans type (facture d'avant la migration 246) : mêmes octets qu'avec les seuls champs d'avant.
  const avant = { nom: 'Sami Fictif', entreprise: 'Epicerie des Essais', adresse: '3 rue des Tests, Sfax', mf: '1122334C/A/M/000', tel: '+216 55 000 111', email: 'acheteur@example.com' };
  const a = await generate.buildFactureAcheteur(null, { ...DONNEES, acheteur: avant });
  const b = await generate.buildFactureAcheteur(null, { ...DONNEES, acheteur: { ...avant, type: null, rne: null } });
  assert.ok(a.equals(b));
  assert.deepEqual(bloc(textesDuPdf(a), 'FACTURÉ À', 'DÉTAIL'), ['Epicerie des Essais — Sami Fictif', 'MF 1122334C/A/M/000', 'acheteur@example.com', '+216 55 000 111', '3 rue des Tests, Sfax']);
  assert.equal(SEP, '  ·  ');
});

test('manuel 247 : révision des fiches du carnet et des ventes (type, patente, champs obligatoires, facture selon le type)', () => {
  const r = require('../scripts/manuel/revisions.json');
  const m = r.migrations.find((x) => x.numero === 247);
  assert.ok(m, 'entrée 247 dans revisions.json');
  assert.deepEqual(m.manuel.map((f) => f.slug).sort(), ['acheteurs-carnet', 'acheteurs-ventes']);
  assert.ok(fs.existsSync(path.join(RACINE, 'migrations', m.nom)), `migrations/${m.nom} générée`);
  const carnet = lire('scripts', 'manuel', 'balise', 'manuel', 'acheteurs-carnet.md');
  assert.ok(carnet.includes('**Professionnel (B2B)** ou **Particulier (B2C)**') && carnet.includes('### Fiches « à préciser »') && carnet.includes('**📄 Lire la patente**'));
  const ventes = lire('scripts', 'manuel', 'balise', 'manuel', 'acheteurs-ventes.md');
  assert.ok(ventes.includes('Le bloc **« Facturé à »**') && ventes.includes('Aucune facture n\'est émise à une fiche **« à préciser »**'));
});
