// Lot 2b, spec §5.6 — vocabPourUtilisateur(userId) (src/utils/vocabCompte.js) : vocabulaire du
// compte d'un utilisateur désigné par son id (renvoi d'une invitation par un super_admin).
//   client ou gérant → vocabForClient(id) (gérant ramené à son compte parent) ;
//   acheteur → vocabForClient(acheteurs.client_id) ; autre rôle, inconnu, erreur → défaut.
// Sans base de données : le pool et domaineProfilService sont remplacés par des faux qui
// reproduisent leurs requêtes sur des tables en mémoire.
//   node --test test/vocabPourUtilisateur.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');
const { resoudreLexique } = require('../src/utils/vocab');
const ESSAIS = require('./vocab-lexiques-test.json');

// ── Données ──────────────────────────────────────────────────────────────────────────────────
const D_HOTEL = 7;
const D_CERAMIQUE = 8;
const UTILISATEURS = new Map([
  [1, { role: 'client', parent: null }],
  [2, { role: 'gerant', parent: 1 }],
  [3, { role: 'acheteur', parent: null }],   // acheteur du compte 1
  [4, { role: 'acheteur', parent: null }],   // compte portail sans fiche acheteur
  [5, { role: 'super_admin', parent: null }],
  [6, { role: 'boss', parent: null }],       // ex-client : garde un abonnement
  [9, { role: 'client', parent: null }],     // autre compte, autre domaine
  [10, { role: 'client', parent: null }],    // compte sans abonnement configuré
]);
const ACHETEURS = new Map([[3, 1]]);          // user_id → client_id (vendeur)
const ABONNEMENTS = new Map([[1, D_HOTEL], [6, D_HOTEL], [9, D_CERAMIQUE]]); // compte → domaine
const PROFILS = new Map([
  [D_HOTEL, { id: D_HOTEL, lexique: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie) }],
  [D_CERAMIQUE, { id: D_CERAMIQUE, lexique: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.ceramique) }],
]);

// ── Faux modules ─────────────────────────────────────────────────────────────────────────────
const requetes = [];
let panne = false;
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push({ texte, params });
    if (panne) throw new Error('base indisponible (test)');
    if (texte.startsWith('SELECT u.role, COALESCE((SELECT a.client_id FROM acheteurs a WHERE a.user_id = u.id LIMIT 1), u.id) AS compte_id FROM utilisateurs u WHERE u.id = $1')) {
      const id = Number(params[0]);
      const u = UTILISATEURS.get(id);
      return { rows: u ? [{ role: u.role, compte_id: ACHETEURS.get(id) ?? id }] : [] };
    }
    throw new Error(`requête inattendue : ${texte.slice(0, 120)}`);
  },
};
const fauxProfils = {
  // Même règle que la requête réelle : COALESCE(gerant_parent_id, id), puis dernier abonnement.
  getDomaineIdForClient: async (clientId) => {
    const u = UTILISATEURS.get(Number(clientId));
    const compte = u && u.parent != null ? u.parent : Number(clientId);
    return ABONNEMENTS.get(compte) ?? null;
  },
  getProfil: async (domaineId) => PROFILS.get(domaineId) || null,
};
const remplacer = (rel, exports) => {
  const chemin = require.resolve(rel);
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports, children: [], paths: [] };
};
remplacer('../src/config/database', fauxPool);
remplacer('../src/services/domaineProfilService', fauxProfils);

const { vocabPourUtilisateur, vocabDuProfil, vocabDefaut } = require('../src/utils/vocabCompte');

const HOTEL = vocabDuProfil(PROFILS.get(D_HOTEL));
const CERAMIQUE = vocabDuProfil(PROFILS.get(D_CERAMIQUE));

test('les lexiques d\'essai rendent bien autre chose que le défaut', () => {
  assert.notEqual(HOTEL, vocabDefaut);
  assert.notEqual(HOTEL.Nom('gerant'), vocabDefaut.Nom('gerant'));
  assert.notEqual(CERAMIQUE.Nom('gerant'), HOTEL.Nom('gerant'));
});

test('client → vocabulaire de son domaine', async () => {
  assert.equal(await vocabPourUtilisateur(1), HOTEL);
  assert.equal(await vocabPourUtilisateur('9'), CERAMIQUE); // id de route : chaîne
});

test('gérant → vocabulaire du compte parent', async () => {
  assert.equal(await vocabPourUtilisateur(2), HOTEL);
});

test('acheteur → vocabulaire de son vendeur (acheteurs.client_id)', async () => {
  assert.equal(await vocabPourUtilisateur(3), HOTEL);
});

test('défaut : acheteur sans fiche, super_admin, boss (par le rôle), compte sans abonnement, inconnu, id nul', async () => {
  for (const id of [4, 5, 6, 10, 99]) assert.equal(await vocabPourUtilisateur(id), vocabDefaut, `utilisateur ${id}`);
  requetes.length = 0;
  assert.equal(await vocabPourUtilisateur(null), vocabDefaut);
  assert.equal(await vocabPourUtilisateur(undefined), vocabDefaut);
  assert.equal(requetes.length, 0, 'id nul : aucune requête');
});

test('erreur de lecture → défaut, jamais bloquant', async (t) => {
  const avert = t.mock.method(console, 'warn', () => {});
  panne = true;
  try {
    assert.equal(await vocabPourUtilisateur(1), vocabDefaut);
  } finally {
    panne = false;
  }
  assert.equal(avert.mock.calls.length, 1);
});

test('une seule requête paramétrée, sans littéral', async () => {
  requetes.length = 0;
  await vocabPourUtilisateur(3);
  assert.equal(requetes.length, 1);
  assert.deepEqual(requetes[0].params, [3]);
  assert.ok(!/'/.test(requetes[0].texte), 'aucune constante dans le SQL');
});
