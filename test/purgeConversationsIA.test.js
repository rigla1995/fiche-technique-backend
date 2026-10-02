// Lot 2b, spec §5.6 — purge de l'assistant au changement de DOMAINE d'un compte.
//   oublierConversationsIA(clientId) (clientConfigService.js) : DELETE de toutes les conversations
//   du compte (web et Messenger), puis invalidate(clientId) ;
//   appelée après le COMMIT, au mieux (jamais un 500), et SEULEMENT si le domaine change :
//     - PUT /api/abonnements/client/:clientId/config (abonnementController.updateAbonnementConfig) ;
//     - PUT /api/clients/:id (clientsController.update).
//   Enregistrer une configuration sans changer de domaine garde ai_conversations.
// Sans base de données : le pool est un faux qui enregistre chaque requête ; les services de
// composition, de profil, de documents sont remplacés par des faux neutres.
//   node --test test/purgeConversationsIA.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const CLIENT = 42;
const ABO = 50;
const DOMAINE_ACTUEL = 3;
const DOMAINE_AUTRE = 7;

const requetes = [];
let purgeEnPanne = false;
const repondre = (texte, params) => {
  if (texte.startsWith('DELETE FROM ai_conversations')) {
    if (purgeEnPanne) throw new Error('purge en panne (test)');
    return { rows: [], rowCount: 2 };
  }
  if (texte.startsWith('SELECT id FROM abonnements WHERE client_id')) return { rows: [{ id: ABO }] };
  if (texte.startsWith('SELECT id FROM domaines_activite WHERE id')) return { rows: [{ id: Number(params[0]) }] };
  if (texte.includes('FROM abonnement_config WHERE abonnement_id = $1')) {
    return { rows: [{ abonnement_id: ABO, domaine_id: DOMAINE_ACTUEL, nb_activites: 1, nb_labos: 0, nb_gerants: 0, nb_acheteurs: 0 }] };
  }
  if (texte.startsWith('SELECT a.id, ac.domaine_id FROM abonnements a')) return { rows: [{ id: ABO, domaine_id: DOMAINE_ACTUEL }] };
  if (texte.startsWith('UPDATE utilisateurs') && texte.includes('RETURNING')) {
    return { rows: [{ id: CLIENT, nom: 'Compte', email: 'compte@test.invalid', telephone: null, role: 'client', onboarding_step: 0, actif: true, created_at: null }] };
  }
  return { rows: [], rowCount: 0 };
};
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push({ texte, params });
    return repondre(texte, params);
  },
  connect: async () => ({ query: fauxPool.query, release: () => {} }),
};

class CompositionError extends Error {}
const remplacer = (rel, exports) => {
  const chemin = require.resolve(rel);
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports, children: [], paths: [] };
};
remplacer('../src/config/database', fauxPool);
remplacer('../src/services/configComposantsService', {
  CompositionError,
  deriveCompteurs: () => ({}),
  validerComposition: () => [],
  normCompteurs: (k) => k || {},
  erreursIntroduites: () => [],
  resolveComposants: async () => [],
  composantsDepuisCompteurs: async () => [],
  composantsDelta: async () => [],
  applyComposants: async () => {},
  invaliderProfilApresCommit: () => {},
  listComposantsConfig: async () => [],
});
remplacer('../src/services/domaineProfilService', {
  getProfil: async (id) => ({ id, regles: {}, lexique: null, composants: [] }),
  getDomaineDefautId: async () => DOMAINE_ACTUEL,
  getDomaineIdForClient: async () => DOMAINE_ACTUEL,
  REGLES_DEFAUT: {},
});
remplacer('../src/services/docusealService', {});
remplacer('../src/services/pdfService', {});
remplacer('../src/services/contractPdfService', {});

const { oublierConversationsIA } = require('../src/services/clientConfigService');
const { updateAbonnementConfig } = require('../src/controllers/abonnementController');
const clientsController = require('../src/controllers/clientsController');

const fauxRes = () => ({
  statusCode: 200,
  corps: undefined,
  status(code) { this.statusCode = code; return this; },
  json(corps) { this.corps = corps; return this; },
});

const indexDe = (prefixe) => requetes.findIndex((r) => r.texte.startsWith(prefixe));
const purges = () => requetes.filter((r) => r.texte.startsWith('DELETE FROM ai_conversations'));

test('oublierConversationsIA : toutes les conversations du compte (web et Messenger), puis invalidate', async () => {
  requetes.length = 0;
  assert.equal(await oublierConversationsIA(String(CLIENT)), 2);
  assert.equal(requetes.length, 2);
  assert.equal(requetes[0].texte, 'DELETE FROM ai_conversations WHERE client_id = $1');
  assert.deepEqual(requetes[0].params, [CLIENT], 'id numérique (clé du cache mémoire)');
  assert.equal(requetes[1].texte, 'UPDATE ai_assistant_config SET context_updated_at = NULL WHERE client_id = $1');
  assert.deepEqual(requetes[1].params, [CLIENT]);
});

test('config abonnement : domaine inchangé → aucune purge', async () => {
  for (const body of [{ formuleActivites: 'premium' }, { domaineId: DOMAINE_ACTUEL }]) {
    requetes.length = 0;
    const res = fauxRes();
    await updateAbonnementConfig({ params: { clientId: String(CLIENT) }, body }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(body));
    assert.ok(indexDe('COMMIT') >= 0, 'la configuration est bien enregistrée');
    assert.equal(purges().length, 0, `purge inattendue pour ${JSON.stringify(body)}`);
  }
});

test('config abonnement : domaine changé → purge du compte, après le COMMIT', async () => {
  requetes.length = 0;
  const res = fauxRes();
  await updateAbonnementConfig({ params: { clientId: String(CLIENT) }, body: { domaineId: DOMAINE_AUTRE } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(purges().length, 1);
  assert.deepEqual(purges()[0].params, [CLIENT]);
  assert.ok(indexDe('COMMIT') < indexDe('DELETE FROM ai_conversations'), 'purge après le COMMIT');
});

test('config abonnement : purge en panne → jamais un 500', async (t) => {
  t.mock.method(console, 'error', () => {});
  purgeEnPanne = true;
  try {
    requetes.length = 0;
    const res = fauxRes();
    await updateAbonnementConfig({ params: { clientId: String(CLIENT) }, body: { domaineId: DOMAINE_AUTRE } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(purges().length, 1);
  } finally {
    purgeEnPanne = false;
  }
});

test('fiche client : domaine inchangé ou absent → aucune purge', async () => {
  for (const body of [{ nom: 'Compte' }, { domaineId: DOMAINE_ACTUEL }]) {
    requetes.length = 0;
    const res = fauxRes();
    await clientsController.update({ params: { id: String(CLIENT) }, body }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(body));
    assert.ok(indexDe('COMMIT') >= 0);
    assert.equal(purges().length, 0, `purge inattendue pour ${JSON.stringify(body)}`);
  }
});

test('fiche client : domaine changé → purge du compte, après le COMMIT', async () => {
  requetes.length = 0;
  const res = fauxRes();
  await clientsController.update({ params: { id: String(CLIENT) }, body: { domaineId: DOMAINE_AUTRE } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(purges().length, 1);
  assert.deepEqual(purges()[0].params, [CLIENT]);
  assert.ok(indexDe('COMMIT') < indexDe('DELETE FROM ai_conversations'), 'purge après le COMMIT');
});

test('fiche client : purge en panne → jamais un 500', async (t) => {
  t.mock.method(console, 'error', () => {});
  purgeEnPanne = true;
  try {
    requetes.length = 0;
    const res = fauxRes();
    await clientsController.update({ params: { id: String(CLIENT) }, body: { domaineId: DOMAINE_AUTRE } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(purges().length, 1);
  } finally {
    purgeEnPanne = false;
  }
});
