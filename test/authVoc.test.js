// Middleware authenticate (lot 2a, spec §2.4) : domaine_id dans la requête unique et dans le
// cache, req.voc, et NOMBRE DE REQUÊTES SQL par appel authentifié — sans base de données
// (le pool est remplacé par un faux qui compte et répond).
//   node --test test/authVoc.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');

const RACINE = path.resolve(__dirname, '..');
process.env.JWT_SECRET = 'secret-de-test-authVoc-0123456789abcdef0123456789abcdef';

// ── Faux pool : enregistre chaque requête et répond d'après des tables en mémoire ─────────────
const requetes = [];
const UTILISATEURS = new Map();
const DOMAINES = new Map();
let panneDomaine = null; // id de domaine dont la lecture échoue
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push(texte);
    if (texte.includes('FROM utilisateurs u')) {
      const u = UTILISATEURS.get(params[0]);
      return { rows: u ? [{ ...u }] : [] };
    }
    if (texte.includes('FROM gerant_affectations')) return { rows: [{ activite_id: 11, labo_id: null }] };
    if (texte.includes('FROM domaines_activite WHERE id')) {
      if (params[0] === panneDomaine) throw new Error('base indisponible');
      const d = DOMAINES.get(params[0]);
      return { rows: d ? [{ ...d }] : [] };
    }
    if (texte.includes('FROM domaine_composants')) return { rows: [] };
    throw new Error(`requête inattendue : ${texte.slice(0, 120)}`);
  },
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };

const jwt = require('jsonwebtoken');
const { vocabDefaut } = require('../src/utils/vocab');
const profilService = require('../src/services/domaineProfilService');
const auth = require('../src/middleware/auth');

const ESSAIS = JSON.parse(fs.readFileSync(path.join(RACINE, 'test', 'vocab-lexiques-test.json'), 'utf8'));
DOMAINES.set(7, { id: 7, slug: 'hotellerie', nom: 'Hôtellerie', description: null, lexique: ESSAIS.hotellerie, regles: {} });
DOMAINES.set(8, { id: 8, slug: 'ceramique', nom: 'Céramique', description: null, lexique: ESSAIS.ceramique, regles: {} });
DOMAINES.set(9, { id: 9, slug: 'restauration', nom: 'Restauration', description: null, lexique: {}, regles: {} });

const ligne = (id, role, extra = {}) => ({
  id, nom: `U${id}`, email: `u${id}@example.com`, role, actif: true, password_changed_at: null,
  gerant_parent_id: null, gerant_activite_id: null, gerant_activite_type: null, gerant_acces_acheteurs: false,
  acheteur_id: null, acheteur_client_id: null, acheteur_actif: null, mode_compte: 'actif', domaine_id: null,
  ...extra,
});
UTILISATEURS.set(1, ligne(1, 'client', { domaine_id: 7 }));
UTILISATEURS.set(2, ligne(2, 'client', { domaine_id: 7 }));
UTILISATEURS.set(3, ligne(3, 'super_admin', { domaine_id: 7 }));
UTILISATEURS.set(4, ligne(4, 'boss', { domaine_id: 7 }));          // boss ex-client : garde un abonnement
UTILISATEURS.set(5, ligne(5, 'client', { domaine_id: null }));     // compte sans abonnement configuré
UTILISATEURS.set(6, ligne(6, 'acheteur', { acheteur_id: 60, acheteur_client_id: 1, acheteur_actif: true, domaine_id: 7 }));
UTILISATEURS.set(7, ligne(7, 'gerant', { gerant_parent_id: 1, domaine_id: 7 }));
UTILISATEURS.set(8, ligne(8, 'client', { domaine_id: 8 }));
UTILISATEURS.set(9, ligne(9, 'client', { domaine_id: 9 }));
UTILISATEURS.set(10, ligne(10, 'client', { domaine_id: 404 }));    // domaine supprimé entre-temps

// Un appel du middleware ; renvoie { req, res, suivant, sql } (sql = requêtes de CET appel).
const appeler = async (middleware, userId) => {
  const token = jwt.sign({ userId, role: UTILISATEURS.get(userId)?.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const req = { headers: { authorization: `Bearer ${token}` }, query: {} };
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  let suivant = false;
  const avant = requetes.length;
  await middleware(req, res, () => { suivant = true; });
  return { req, res, suivant, sql: requetes.slice(avant) };
};

test('requête unique : domaine_id par sous-requête scalaire (client, gérant → parent, acheteur → client vendeur)', async () => {
  const { sql, req, suivant } = await appeler(auth.authenticate, 1);
  assert.equal(suivant, true);
  const select = sql[0];
  assert.match(select, /FROM utilisateurs u/);
  assert.match(select, /\(SELECT ac\.domaine_id FROM abonnements a2 JOIN abonnement_config ac ON ac\.abonnement_id = a2\.id WHERE a2\.client_id = COALESCE\(u\.gerant_parent_id, ach\.client_id, u\.id\) ORDER BY a2\.id DESC LIMIT 1\) AS domaine_id/);
  assert.equal(req.user.domaine_id, 7, 'domaine_id porté par req.user');
  // 1 requête d'authentification + 2 de chargement du profil (domaine, composants), une fois par domaine et par minute
  assert.equal(sql.length, 3, sql.join('\n'));
  assert.equal(sql.filter((q) => q.includes('FROM utilisateurs u')).length, 1);
});

test('req.voc : vocabulaire du domaine du compte, mémoïsé ; régime permanent = 0 requête SQL', async () => {
  const premier = await appeler(auth.authenticate, 1);
  assert.equal(premier.sql.length, 0, 'cache d\'authentification (15 s) + cache de profil (60 s) : aucune requête');
  assert.equal(premier.req.voc.le('labo'), 'la cuisine centrale');
  assert.equal(premier.req.voc.Nom('espace_labo'), 'Espace Cuisine');
  assert.equal(premier.req.voc.Court('pt'), 'Prépa');
  for (let i = 0; i < 5; i += 1) {
    const r = await appeler(auth.authenticate, 1);
    assert.equal(r.sql.length, 0);
    assert.equal(r.req.voc, premier.req.voc, 'même objet vocabulaire d\'un appel à l\'autre');
    assert.equal(r.req.user.domaine_id, 7, 'domaine_id lu dans le cache');
  }
  // un autre compte du même domaine : 1 requête (authentification), profil et vocabulaire partagés
  const autre = await appeler(auth.authenticate, 2);
  assert.equal(autre.sql.length, 1);
  assert.match(autre.sql[0], /FROM utilisateurs u/);
  assert.equal(autre.req.voc, premier.req.voc);
});

test('req.voc : admin et boss d\'après le RÔLE, compte sans domaine → vocabulaire par défaut, sans requête de plus', async () => {
  for (const id of [3, 4, 5]) {
    const r = await appeler(auth.authenticate, id);
    assert.equal(r.suivant, true);
    assert.equal(r.req.voc, vocabDefaut, `utilisateur ${id} (${UTILISATEURS.get(id).role})`);
    assert.equal(r.sql.length, 1, 'seule la requête d\'authentification');
    assert.ok(!r.sql.some((q) => q.includes('FROM domaines_activite')), 'aucune lecture de domaine (ni repli sur « restauration »)');
    const encore = await appeler(auth.authenticate, id);
    assert.equal(encore.sql.length, 0);
    assert.equal(encore.req.voc, vocabDefaut);
  }
});

test('req.voc : domaine sans écart (Restauration) → vocabDefaut lui-même', async () => {
  const r = await appeler(auth.authenticate, 9);
  assert.equal(r.req.voc, vocabDefaut);
  assert.equal(r.req.voc.Nom('espace_labo'), 'Espace Labo');
});

test('req.voc : acheteur → domaine du client vendeur ; gérant → domaine du compte parent', async () => {
  const acheteur = await appeler(auth.authenticate, 6);
  assert.equal(acheteur.suivant, true);
  assert.equal(acheteur.req.user.acheteurClientId, 1);
  assert.equal(acheteur.req.voc.Nom('acheteur'), 'Client professionnel');
  assert.equal(acheteur.sql.length, 1, 'profil du domaine déjà en cache');
  const gerant = await appeler(auth.authenticate, 7);
  assert.equal(gerant.req.voc.Nom('gerant'), 'Responsable de service');
  assert.equal(gerant.sql.length, 2, 'authentification + affectations du gérant (comme avant)');
  assert.deepEqual(gerant.req.user.gerantActiviteIds, [11]);
  // acheteur désactivé : 401 avant la pose de req.voc
  UTILISATEURS.set(11, ligne(11, 'acheteur', { acheteur_id: 61, acheteur_client_id: 1, acheteur_actif: false, domaine_id: 7 }));
  const inactif = await appeler(auth.authenticate, 11);
  assert.equal(inactif.res.code, 401);
  assert.equal(inactif.req.voc, undefined);
});

test('req.voc : changement de lexique (invalidate) → nouveau vocabulaire, sans nouvelle requête d\'authentification', async () => {
  const avant = await appeler(auth.authenticate, 8);
  assert.equal(avant.req.voc.Court('labo'), 'Site');
  DOMAINES.set(8, { ...DOMAINES.get(8), lexique: { ...ESSAIS.ceramique, labo: { sg: 'Usine', pl: 'Usines', g: 'f', el: true } } });
  const sansInvalidation = await appeler(auth.authenticate, 8);
  assert.equal(sansInvalidation.req.voc, avant.req.voc, 'cache de profil encore vivant');
  profilService.invalidate(8);
  const apres = await appeler(auth.authenticate, 8);
  assert.notEqual(apres.req.voc, avant.req.voc);
  assert.equal(apres.req.voc.le('labo'), "l'usine");
  assert.equal(apres.sql.length, 2, 'rechargement du profil seulement (domaine + composants)');
  assert.ok(!apres.sql.some((q) => q.includes('FROM utilisateurs u')));
});

test('profil froid : des requêtes simultanées du même domaine ne font qu\'UN chargement du profil', async () => {
  DOMAINES.set(20, { id: 20, slug: 'test-20', nom: 'Test 20', description: null, lexique: { labo: { sg: 'Atelier', pl: 'Ateliers', g: 'm', el: true } }, regles: {} });
  const ids = [201, 202, 203, 204, 205, 206];
  for (const id of ids) UTILISATEURS.set(id, ligne(id, 'client', { domaine_id: 20 }));
  const avant = requetes.length;
  const appels = await Promise.all(ids.map((id) => appeler(auth.authenticate, id)));
  const sql = requetes.slice(avant);
  assert.equal(sql.filter((q) => q.includes('FROM utilisateurs u')).length, ids.length, '1 requête d\'authentification par compte');
  assert.equal(sql.filter((q) => q.includes('FROM domaines_activite WHERE id')).length, 1, 'un seul chargement du domaine');
  assert.equal(sql.filter((q) => q.includes('FROM domaine_composants')).length, 1);
  for (const a of appels) {
    assert.equal(a.suivant, true);
    assert.equal(a.req.voc, appels[0].req.voc, 'un seul vocabulaire pour tous');
    assert.equal(a.req.voc.le('labo'), "l'atelier");
  }
  // un chargement commencé avant un invalidate() ne remet pas en cache le profil périmé
  profilService.invalidate(20);
  const lent = profilService.getProfil(20);
  DOMAINES.set(20, { ...DOMAINES.get(20), lexique: { labo: { sg: 'Usine', pl: 'Usines', g: 'f', el: true } } });
  profilService.invalidate(20);
  await lent;
  assert.equal((await profilService.getProfil(20)).lexique.labo.sg, 'Usine');
});

test('req.voc : jamais bloquant — domaine introuvable ou base en panne → vocabulaire par défaut, pas de 401', async () => {
  const introuvable = await appeler(auth.authenticate, 10);
  assert.equal(introuvable.suivant, true);
  assert.equal(introuvable.req.voc, vocabDefaut);
  UTILISATEURS.set(12, ligne(12, 'client', { domaine_id: 500 }));
  panneDomaine = 500;
  const warn = console.warn;
  const avertis = [];
  console.warn = (...a) => avertis.push(a.join(' '));
  try {
    const panne = await appeler(auth.authenticate, 12);
    assert.equal(panne.suivant, true);
    assert.equal(panne.res.code, 200);
    assert.equal(panne.req.voc, vocabDefaut);
    assert.equal(avertis.length, 1);
    // Corrections après revues : l'échec est gardé quelques secondes — l'appel suivant du même domaine ne relit
    // pas le profil et n'avertit pas de nouveau (vocabulaire par défaut, pas de 401) ; un autre domaine, si.
    const suite = await appeler(auth.authenticate, 12);
    assert.equal(suite.suivant, true);
    assert.equal(suite.req.voc, vocabDefaut);
    assert.equal(suite.sql.filter((s) => s.includes('FROM domaines_activite')).length, 0, 'pas de nouvelle lecture du profil');
    assert.equal(avertis.length, 1, 'un seul avertissement');
    UTILISATEURS.set(13, ligne(13, 'client', { domaine_id: 501 }));
    panneDomaine = 501;
    const autre = await appeler(auth.authenticate, 13);
    assert.equal(autre.req.voc, vocabDefaut);
    assert.equal(avertis.length, 2, 'un avertissement par domaine');
    // le domaine 500 redevient lisible : après le délai, il est relu
    const { vocabDuDomaine } = require('../src/utils/vocabCompte');
    const vraiNow = Date.now;
    Date.now = () => vraiNow() + 11 * 1000;
    try {
      panneDomaine = null;
      DOMAINES.set(500, { id: 500, slug: 'hotellerie-bis', nom: 'Hôtellerie bis', description: null, lexique: ESSAIS.hotellerie, regles: {} });
      const revenu = await vocabDuDomaine(500);
      assert.equal(revenu.le('labo'), 'la cuisine centrale', 'profil relu après le délai');
      assert.equal(avertis.length, 2);
    } finally {
      Date.now = vraiNow;
      DOMAINES.delete(500);
      profilService.invalidate(500);
    }
  } finally {
    console.warn = warn;
    panneDomaine = null;
  }
});

test('vocabForClient / vocabDuDomaine (hors requête du compte)', async () => {
  const { vocabForClient, vocabDuDomaine } = require('../src/utils/vocabCompte');
  assert.equal(await vocabDuDomaine(null), vocabDefaut);
  assert.equal(await vocabDuDomaine(404), vocabDefaut);
  assert.equal((await vocabDuDomaine(7)).Nom('activite'), 'Service');
  assert.equal(await vocabDuDomaine(7), await vocabDuDomaine(7), 'mémoïsé par objet lexique');
  assert.equal(await vocabForClient(null), vocabDefaut);
  // vocabForClient lit le domaine du dernier abonnement du compte (gérant → parent)
  const origine = fauxPool.query;
  const vues = [];
  fauxPool.query = async (sql, params) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    if (texte.startsWith('SELECT ac.domaine_id FROM abonnements a JOIN abonnement_config ac')) {
      vues.push(params[0]);
      return { rows: params[0] === 1 ? [{ domaine_id: 7 }] : [] };
    }
    return origine(sql, params);
  };
  try {
    assert.equal((await vocabForClient(1)).le('labo'), 'la cuisine centrale');
    assert.equal(await vocabForClient(5), vocabDefaut, 'compte sans abonnement configuré');
    assert.deepEqual(vues, [1, 5]);
  } finally {
    fauxPool.query = origine;
  }
});

// Comparaison avec le middleware d'AVANT le lot 2 (commit de référence) : même nombre de requêtes
// d'authentification par appel, et aucune requête en régime permanent. Sautée sans historique git.
test('régime permanent : pas plus de requêtes SQL par appel authentifié qu\'avant le lot 2', async (t) => {
  const BASE_DEFAUT = '13d99d054b96eba7192d48d58b276fff756c4418';
  const fichierBase = path.join(RACINE, 'scripts', 'vocab-check.base');
  const BASE = fs.existsSync(fichierBase) ? fs.readFileSync(fichierBase, 'utf8').trim() || BASE_DEFAUT : BASE_DEFAUT;
  let source;
  try {
    source = execFileSync('git', ['-C', RACINE, 'show', `${BASE}:src/middleware/auth.js`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_) {
    t.skip(`git show ${BASE} indisponible`);
    return;
  }
  assert.ok(!source.includes('domaine_id AS') && !source.includes('req.voc'), 'la référence est bien le middleware d\'avant le lot 2');
  // Le middleware d'origine est compilé à l'emplacement de l'actuel (mêmes require relatifs, même faux pool).
  const chemin = path.join(RACINE, 'src', 'middleware', 'auth.reference.js');
  const mod = new Module(chemin, module);
  mod.filename = chemin;
  mod.paths = Module._nodeModulePaths(path.dirname(chemin));
  mod._compile(source, chemin);
  const reference = mod.exports;

  const compter = async (middleware, ids, tours) => {
    const parTour = [];
    for (let i = 0; i < tours; i += 1) {
      let n = 0;
      for (const id of ids) n += (await appeler(middleware, id)).sql.length;
      parTour.push(n);
    }
    return parTour;
  };
  // Comptes jamais vus par l'un ou l'autre middleware (caches d'authentification vides) ; le
  // profil du domaine 7 est déjà en cache (régime permanent du serveur).
  const ids = [101, 102, 103, 104];
  UTILISATEURS.set(101, ligne(101, 'client', { domaine_id: 7 }));
  UTILISATEURS.set(102, ligne(102, 'gerant', { gerant_parent_id: 101, domaine_id: 7 }));
  UTILISATEURS.set(103, ligne(103, 'acheteur', { acheteur_id: 70, acheteur_client_id: 101, acheteur_actif: true, domaine_id: 7 }));
  UTILISATEURS.set(104, ligne(104, 'super_admin'));
  const avant = await compter(reference.authenticate, ids, 4);
  const apres = await compter(auth.authenticate, ids, 4);
  // 1er tour : 1 requête par compte + 1 pour les affectations du gérant ; ensuite 0.
  assert.deepEqual(avant, [5, 0, 0, 0], 'référence');
  assert.deepEqual(apres, avant, 'après le lot 2 : identique');
});
