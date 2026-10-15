// D1 « Prestataires de livraison par domaine et par compte » (labflow-reprise/PLAN-DOMAINES-ACHETEURS-CODES.md §2 ligne
// D1 ; réponses du client du 15/10). Tests sans base : la règle du domaine (défaut vrai, booléen contrôlé, résolue), la
// migration 245, ce que les écrans reçoivent (domaine.prestataires au login, à /auth/me et sur GET /api/entreprise), les
// gardes du serveur (activer un prestataire, saisir une vente via prestataire : 409), l'interrupteur du compte côté admin
// (création, config, lecture).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const P = require('../src/services/domaineProfilService');

test('règle du domaine « prestataires » : vraie par défaut, clé connue, résolue depuis les écarts', () => {
  assert.equal(P.REGLES_DEFAUT.prestataires, true);
  assert.ok(P.REGLES_CLES.includes('prestataires'));
  assert.equal(P.resolveRegles({}).prestataires, true);
  assert.equal(P.resolveRegles({ prestataires: false }).prestataires, false);
  assert.equal(P.resolveRegles(null).prestataires, true);
  assert.equal(typeof P.prestatairesActifsPourClient, 'function');
  const ctrl = lire('src', 'controllers', 'domainesController.js');
  assert.ok(ctrl.includes("'b2b_depuis_activite', 'prestataires'].includes(k) && typeof v !== 'boolean'"), 'booléen contrôlé par la page Domaines');
});

test('migration 245 : interrupteur du compte (vrai par défaut), règle à faux pour l\'hôtellerie et l\'industrie, idempotente', () => {
  const sql = lire('migrations', '245_prestataires_par_domaine.sql');
  assert.ok(!sql.includes('\r'));
  assert.ok(sql.includes('ALTER TABLE abonnement_config ADD COLUMN IF NOT EXISTS prestataires_actifs BOOLEAN NOT NULL DEFAULT true;'));
  assert.ok(sql.includes(`'{"prestataires": false}'::jsonb`));
  assert.ok(sql.includes("WHERE slug IN ('hotellerie', 'ceramique', 'usine')"));
  assert.ok(sql.includes("AND NOT (COALESCE(regles, '{}'::jsonb) ? 'prestataires')"), 'une règle déjà réglée n\'est pas écrasée');
  assert.ok(!/DROP|DELETE/.test(sql));
});

test('les écrans reçoivent domaine.prestataires : login et /auth/me (même fonction), GET /api/entreprise', () => {
  const auth = lire('src', 'controllers', 'authController.js');
  assert.ok(auth.includes("const { getProfilForClient, prestatairesActifsPourClient } = require('../services/domaineProfilService');"));
  assert.ok(auth.includes('regles: p.regles, prestataires: await prestatairesActifsPourClient(utilisateur.id) }'));
  const ent = lire('src', 'controllers', 'entrepriseController.js');
  assert.ok(ent.includes('regles: p.regles, prestataires: await prestatairesActifsPourClient(clientId) }'));
});

test('gardes du serveur : activer un prestataire et saisir une vente via prestataire répondent 409 PRESTATAIRES_DESACTIVES', () => {
  const v = lire('src', 'controllers', 'ventesController.js');
  assert.ok(v.includes("const { prestatairesActifsPourClient } = require('../services/domaineProfilService');"));
  assert.equal((v.match(/code: .PRESTATAIRES_DESACTIVES./g) || []).length, 2, 'deux gardes (activation, vente)');
  const activation = v.slice(v.indexOf('const addActivitePrestataire = async'), v.indexOf('const addActivitePrestataire = async') + 900);
  assert.ok(activation.includes("if (!(await prestatairesActifsPourClient(cid))) return res.status(409).json({ code: 'PRESTATAIRES_DESACTIVES'"));
  const vente = v.slice(v.indexOf('const createVente = async'), v.indexOf('const createVente = async') + 1800);
  assert.ok(vente.includes("if (type_vente === 'prestataire') {\n      if (!(await prestatairesActifsPourClient(cid)))"), 'la garde avant le contrôle du prestataire');
  assert.ok(v.includes('[[pl:prestataire]] de livraison ne sont pas proposés à ce compte'), 'message au vocabulaire du compte');
});

test('admin : interrupteur du compte à la création, dans la config (lecture et réglage, booléen contrôlé)', () => {
  const c = lire('src', 'controllers', 'clientsController.js');
  assert.ok(c.includes("if (req.body.prestatairesActifs === false) await pool.query('UPDATE abonnement_config SET prestataires_actifs = false WHERE abonnement_id = $1', [aboId]);"));
  const a = lire('src', 'controllers', 'abonnementController.js');
  assert.ok(a.includes('prestatairesActifs: row.prestataires_actifs !== false,'), 'lu dans la config');
  assert.ok(a.includes('prestatairesActifs: config.prestataires_actifs !== false,'), 'lu dans le détail tarifaire');
  assert.ok(a.includes("if (req.body.prestatairesActifs !== undefined && typeof req.body.prestatairesActifs !== 'boolean')"));
  assert.ok(a.includes("UPDATE abonnement_config SET prestataires_actifs = $2, updated_at = NOW() WHERE abonnement_id = $1"));
});
