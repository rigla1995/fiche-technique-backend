// Lot 2b, socle S2 — composants : genre et élision (migration 192), spec docs/lot-2b-spec.md §5.4.
// Sans base de données : le pool est remplacé par un faux qui enregistre chaque requête.
//   node --test test/socle-composants.test.js
//
// 1. domainesController.validateComposant : genre, élision, caractères [ ] | refusés (400).
// 2. Upsert du PUT /api/domaines/:id : genre = COALESCE, élision par CASE sur « le champ est envoyé » ;
//    un payload sans ces champs ne remet rien à zéro, `null` / 'auto' reviennent à « déduite ».
// 3. configComposantsService.creerComposantIdentite : libellés, genre et élision tirés du TERME du domaine
//    (Hôtellerie : « mon service », « ma cuisine centrale ») ; domaine illisible → lève, rien n'est écrit ;
//    chemin virtuel (creer: false) identique ; listComposantsConfig et mapComposant lisent genre et élision.
// 4. Après le COMMIT d'une création à la volée, le profil du domaine en cache est oublié (applyComposants →
//    identitesCreees, invaliderProfilApresCommit) ; chaque appelant d'applyComposants l'appelle (lecture des sources).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.resolve(__dirname, '..');
const ESSAIS = JSON.parse(fs.readFileSync(path.join(RACINE, 'test/vocab-lexiques-test.json'), 'utf8'));

// ── Faux pool : domaines (lexiques d'essai) et composants ───────────────────────────────────────
const DOMAINES = new Map([
  [1, { id: 1, slug: 'restauration', nom: 'Restauration', description: null, lexique: {}, regles: {} }],
  [2, { id: 2, slug: 'hotellerie', nom: 'Hôtellerie', description: null, lexique: ESSAIS.hotellerie, regles: {} }],
  [3, { id: 3, slug: 'miroir', nom: 'Miroir', description: null, lexique: ESSAIS.miroir, regles: {} }],
  [4, { id: 4, slug: 'ceramique', nom: 'Céramique', description: null, lexique: ESSAIS.ceramique, regles: {} }],
]);
let composantsDomaine = []; // lignes renvoyées par « SELECT * FROM domaine_composants WHERE domaine_id = $1 »
let lignesConfig = [];      // lignes renvoyées à listComposantsConfig
let configAbo = null;       // ligne renvoyée à « SELECT * FROM abonnement_config WHERE abonnement_id = $1 FOR UPDATE »
const requetes = [];
const normal = (sql) => String(sql).replace(/\s+/g, ' ').trim();
const repondre = async (sql, params = []) => {
  const texte = normal(sql);
  requetes.push({ texte, params });
  if (texte.startsWith('SELECT * FROM domaines_activite WHERE id = $1')) {
    const d = DOMAINES.get(Number(params[0]));
    return { rows: d ? [d] : [] };
  }
  if (texte.startsWith('SELECT * FROM domaine_composants WHERE domaine_id = $1')) return { rows: composantsDomaine };
  if (texte.startsWith('SELECT acc.composant_id, acc.nb, dc.*')) return { rows: lignesConfig };
  if (texte.startsWith('SELECT * FROM abonnement_config WHERE abonnement_id = $1')) return { rows: configAbo ? [configAbo] : [] };
  if (texte.startsWith('INSERT INTO domaine_composants') && texte.includes('RETURNING *')) {
    // creerComposantIdentite : la ligne écrite, telle que PostgreSQL la renverrait
    const [domaineId, code, libelle, libellePluriel, icone, type, genre, elision] = params;
    return { rows: [{ id: 900, domaine_id: domaineId, code, libelle, libelle_pluriel: libellePluriel, icone, aide: null,
      type_technique: type, vente_active: true, production_active: true, nb_min: 0, nb_max: null, ordre: 9, actif: true,
      genre, elision }] };
  }
  if (texte.includes('COUNT(DISTINCT a.client_id)')) return { rows: [{ n: 0 }] };
  return { rows: [] };
};
const fauxPool = {
  query: repondre,
  connect: async () => ({ query: repondre, release: () => {} }),
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };
// domainesController importe buildTarifsPourDomaine d'abonnementController : remplacé (hors sujet ici).
const cheminAbo = require.resolve('../src/controllers/abonnementController');
require.cache[cheminAbo] = { id: cheminAbo, filename: cheminAbo, loaded: true, exports: { buildTarifsPourDomaine: async () => ({}) }, children: [], paths: [] };

const { validateComposant, update } = require('../src/controllers/domainesController');
const profilService = require('../src/services/domaineProfilService');
const { COMPOSANTS_IDENTITE, mapComposant, invalidate, resolveLexique, getProfil } = profilService;
const { creerComposantIdentite, resolveComposants, listComposantsConfig, applyComposants, invaliderProfilApresCommit } = require('../src/services/configComposantsService');
const { vocabDefaut, entreeComposant, creerVocab } = require('../src/utils/vocab');

// Déterminant accordé au libellé du composant (voc.avec(entreeComposant(c)), spec §6.4).
const avecDet = (c, det = 'mon', n) => vocabDefaut.avec(entreeComposant(c))[det]('_', n);
const maxPlaceholder = (texte) => Math.max(...[...texte.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
const inserts = () => requetes.filter((r) => r.texte.startsWith('INSERT'));

// ═════════════════════════════════════════════════════════════════════════════
// 1. validateComposant
// ═════════════════════════════════════════════════════════════════════════════
const BASE = { code: 'cuisine', libelle: 'Cuisine', libellePluriel: 'Cuisines', typeTechnique: 'labo' };

test('validateComposant : composant sans genre ni élision accepté (ancien onglet admin)', () => {
  assert.equal(validateComposant(BASE, 0), null);
});

test('validateComposant : genre m, f ou null accepté ; toute autre valeur refusée', () => {
  for (const genre of ['m', 'f', null, undefined]) assert.equal(validateComposant({ ...BASE, genre }, 0), null, String(genre));
  for (const genre of ['x', 'F', 'masculin', '', 1, true]) {
    assert.match(validateComposant({ ...BASE, genre }, 0) ?? '', /genre invalide/, JSON.stringify(genre));
  }
});

test("validateComposant : élision true, false, null ou 'auto' acceptée ; toute autre valeur refusée", () => {
  for (const elision of [true, false, null, 'auto']) assert.equal(validateComposant({ ...BASE, elision }, 0), null, String(elision));
  for (const elision of ['oui', 'true', 0, 1, '', 'AUTO', undefined]) {
    assert.match(validateComposant({ ...BASE, elision }, 0) ?? '', /élision invalide/, String(elision));
  }
});

test('validateComposant : [ ] | refusés dans le libellé et le pluriel', () => {
  for (const libelle of ['Cuisine [A]', 'Cuisine ]', 'Cuisine | Bar', '[[Nom:labo]]']) {
    assert.match(validateComposant({ ...BASE, libelle }, 0) ?? '', /caractères \[ \] \| interdits/, libelle);
  }
  for (const libellePluriel of ['Cuisines [A]', 'Cuisines|Bars', 'Cuisines]']) {
    assert.match(validateComposant({ ...BASE, libellePluriel }, 0) ?? '', /caractères \[ \] \| interdits/, libellePluriel);
  }
  // Ce que les brouillons emploient reste admis : « / », « & », parenthèses, accents.
  for (const libelle of ['Économat / Logistique', 'Showroom / Boutique', 'Bar & Lounge', 'Spa (bien-être)']) {
    assert.equal(validateComposant({ ...BASE, libelle }, 0), null, libelle);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Upsert du PUT /api/domaines/:id
// ═════════════════════════════════════════════════════════════════════════════
const appelerUpdate = async (composant) => {
  requetes.length = 0;
  composantsDomaine = [{ id: 18, domaine_id: 2, code: 'cuisine', libelle: 'Cuisine', libelle_pluriel: 'Cuisines', icone: null, aide: null,
    type_technique: 'labo', vente_active: true, production_active: true, nb_min: 0, nb_max: null, ordre: 6, actif: true, genre: 'f', elision: true }];
  const req = { params: { id: '2' }, body: { composants: [composant] }, user: { role: 'super_admin' } };
  const res = {
    statusCode: 200,
    corps: null,
    status(code) { this.statusCode = code; return this; },
    json(corps) { this.corps = corps; return this; },
  };
  await update(req, res);
  const upsert = requetes.find((r) => r.texte.startsWith('INSERT INTO domaine_composants'));
  return { res, upsert };
};

test('upsert : SQL du §5.4 — genre COALESCE (insertion et mise à jour), élision CASE sur « champ envoyé »', async () => {
  const { res, upsert } = await appelerUpdate(BASE);
  assert.equal(res.statusCode, 200);
  assert.ok(upsert, 'upsert absent');
  assert.ok(upsert.texte.includes("COALESCE($14, 'm'), $15::boolean)"), "insertion : COALESCE($g, 'm') et $e::boolean");
  assert.ok(upsert.texte.includes('genre = COALESCE($14, domaine_composants.genre)'), 'mise à jour du genre');
  assert.ok(upsert.texte.includes('elision = CASE WHEN $16::boolean THEN $15::boolean ELSE domaine_composants.elision END'), "mise à jour de l'élision");
  // Chaque $n a sa valeur, aucune valeur en trop (sinon PostgreSQL refuse la requête).
  assert.equal(upsert.params.length, maxPlaceholder(upsert.texte));
});

test('upsert : un PUT sans genre ni élision garde les valeurs stockées', async () => {
  const { upsert } = await appelerUpdate(BASE);
  assert.deepEqual(upsert.params.slice(13), [null, null, false]); // $14 genre, $15 élision, $16 « élision envoyée »
});

test("upsert : élision null ou 'auto' → « déduite » (NULL écrit) ; true / false écrits tels quels", async () => {
  for (const [elision, attendu] of [[null, null], ['auto', null], [true, true], [false, false]]) {
    const { res, upsert } = await appelerUpdate({ ...BASE, elision });
    assert.equal(res.statusCode, 200, String(elision));
    assert.deepEqual(upsert.params.slice(14), [attendu, true], String(elision));
  }
});

test('upsert : genre envoyé écrit tel quel ; genre null = inchangé', async () => {
  assert.equal((await appelerUpdate({ ...BASE, genre: 'm' })).upsert.params[13], 'm');
  assert.equal((await appelerUpdate({ ...BASE, genre: 'f' })).upsert.params[13], 'f');
  assert.equal((await appelerUpdate({ ...BASE, genre: null })).upsert.params[13], null);
});

test('upsert : genre, élision ou libellé invalides → 400 avant toute requête', async () => {
  for (const c of [{ ...BASE, genre: 'x' }, { ...BASE, elision: 'oui' }, { ...BASE, libelle: 'Cuisine [1]' }]) {
    const { res, upsert } = await appelerUpdate(c);
    assert.equal(res.statusCode, 400, JSON.stringify(c));
    assert.equal(upsert, undefined);
    assert.equal(requetes.length, 0, 'aucune requête');
  }
});

test('réponse du PUT : composants[] portent genre et élision (mapComposant)', async () => {
  const { res } = await appelerUpdate(BASE);
  const cuisine = res.corps.composants.find((c) => c.code === 'cuisine');
  assert.equal(cuisine.genre, 'f');
  assert.equal(cuisine.elision, true);
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Composants identité créés à la volée, mapComposant, listComposantsConfig
// ═════════════════════════════════════════════════════════════════════════════
const creer = async (domaineId, type) => {
  invalidate();
  requetes.length = 0;
  composantsDomaine = [];
  const comp = await creerComposantIdentite(fauxPool, domaineId, type);
  const insert = requetes.find((r) => r.texte.startsWith('INSERT INTO domaine_composants'));
  return { comp, insert };
};

test('Hôtellerie : « mon service », « ma cuisine centrale » — libellés, genre et élision du TERME du domaine', async () => {
  const act = (await creer(2, 'activite')).comp;
  assert.deepEqual([act.libelle, act.libellePluriel, act.genre, act.elision], ['Service', 'Services', 'm', false]);
  assert.equal(avecDet(act), 'mon service');
  const labo = (await creer(2, 'labo')).comp;
  assert.deepEqual([labo.libelle, labo.libellePluriel, labo.genre, labo.elision], ['Cuisine centrale', 'Cuisines centrales', 'f', false]);
  assert.equal(avecDet(labo), 'ma cuisine centrale');
  assert.equal(avecDet(labo, 'mon', true), 'mes cuisines centrales');
  const ger = (await creer(2, 'gerant')).comp;
  assert.deepEqual([ger.libelle, ger.libellePluriel, ger.genre, ger.elision], ['Responsable de service', 'Responsables de service', 'm', false]);
  const ach = (await creer(2, 'acheteurs')).comp;
  assert.deepEqual([ach.libelle, ach.libellePluriel, ach.genre, ach.elision], ['Base clients professionnels', 'Base clients professionnels', 'f', null]);
  assert.equal(avecDet(ach), 'ma base clients professionnels');
});

test('Restauration : les 4 composants identité EXACTEMENT ceux de COMPOSANTS_IDENTITE', async () => {
  for (const type of ['activite', 'labo', 'gerant', 'acheteurs']) {
    const { comp, insert } = await creer(1, type);
    const idt = COMPOSANTS_IDENTITE[type];
    assert.deepEqual(
      [comp.code, comp.libelle, comp.libellePluriel, comp.genre, comp.icone, comp.typeTechnique],
      [idt.code, idt.libelle, idt.libellePluriel, idt.genre, idt.icone, type],
      type
    );
    assert.equal(insert.params[0], 1);
  }
  assert.equal((await creer(1, 'activite')).comp.elision, true); // « l'activité »
  assert.equal((await creer(1, 'labo')).comp.elision, false);
  assert.equal((await creer(1, 'gerant')).comp.elision, false);
  assert.equal((await creer(1, 'acheteurs')).comp.elision, null);
  assert.equal(avecDet((await creer(1, 'activite')).comp), 'mon activité');
  assert.equal(avecDet((await creer(1, 'activite')).comp, 'le'), "l'activité");
  assert.equal(avecDet((await creer(1, 'labo')).comp), 'mon labo');
});

test('Miroir : élision vraie du terme (« Usine », f) → « mon usine » ; Céramique : « mon site de production »', async () => {
  const labo = (await creer(3, 'labo')).comp;
  assert.deepEqual([labo.libelle, labo.genre, labo.elision], ['Usine', 'f', true]);
  assert.equal(avecDet(labo), 'mon usine');
  assert.equal(avecDet(labo, 'le'), "l'usine");
  assert.equal(avecDet((await creer(4, 'labo')).comp), 'mon site de production');
});

test('INSERT de creerComposantIdentite : genre et élision écrits ($7, $8), placeholders cohérents', async () => {
  const { insert } = await creer(2, 'labo');
  assert.ok(insert.texte.includes('(domaine_id, code, libelle, libelle_pluriel, icone, type_technique, ordre, genre, elision)'));
  assert.deepEqual(insert.params.slice(6), ['f', false]);
  assert.equal(insert.params.length, maxPlaceholder(insert.texte));
});

test("domaine illisible : creerComposantIdentite LÈVE et n'écrit rien (aucun libellé de repli en base)", async () => {
  invalidate();
  requetes.length = 0;
  await assert.rejects(() => creerComposantIdentite(fauxPool, 777, 'labo'), /domaine 777 illisible/);
  assert.equal(inserts().length, 0);
  // Par applyComposants → resolveComposants (creer: true) : l'erreur remonte, la transaction de l'appelant est annulée.
  invalidate();
  requetes.length = 0;
  composantsDomaine = [];
  await assert.rejects(() => resolveComposants(fauxPool, 777, [{ code: 'labo', nb: 1 }], { creer: true }), /illisible/);
  assert.equal(inserts().length, 0);
});

test('chemin virtuel (creer: false) : MÊMES libellé, genre et élision que la création, sans écriture', async () => {
  for (const domaineId of [1, 2, 3, 4]) {
    for (const type of ['activite', 'labo', 'gerant', 'acheteurs']) {
      invalidate();
      composantsDomaine = [];
      requetes.length = 0;
      const [virtuel] = await resolveComposants(fauxPool, domaineId, [{ code: type, nb: 1 }], { creer: false });
      assert.equal(inserts().length, 0);
      assert.equal(virtuel.virtuel, true);
      const { comp } = await creer(domaineId, type);
      for (const k of ['code', 'libelle', 'libellePluriel', 'genre', 'elision', 'icone', 'typeTechnique']) {
        assert.deepEqual(virtuel[k], comp[k], `${domaineId}/${type}/${k}`);
      }
    }
  }
});

test('mapComposant : genre (défaut m) et élision (true / false / null)', () => {
  const ligne = { id: 18, code: 'cuisine', libelle: 'Cuisine', libelle_pluriel: 'Cuisines', type_technique: 'labo' };
  assert.deepEqual([mapComposant(ligne).genre, mapComposant(ligne).elision], ['m', null]);
  const f = mapComposant({ ...ligne, genre: 'f', elision: false });
  assert.deepEqual([f.genre, f.elision], ['f', false]);
  // « ma cuisine » en Hôtellerie (spec §5.4, §12) : sans la colonne genre, le guide écrirait « mon cuisine » sans bruit.
  assert.equal(avecDet(mapComposant({ ...ligne, genre: 'f' })), 'ma cuisine');
  assert.equal(avecDet(mapComposant(ligne)), 'mon cuisine');
  const huilerie = { ...ligne, code: 'huilerie', libelle: 'Huilerie', libelle_pluriel: 'Huileries', genre: 'f' };
  assert.equal(avecDet(mapComposant(huilerie)), 'ma huilerie');
  assert.equal(avecDet(mapComposant({ ...huilerie, elision: true })), 'mon huilerie');
});

test("listComposantsConfig : genre et élision du composant (config.composants de l'abonnement)", async () => {
  lignesConfig = [
    { composant_id: 18, nb: 1, id: 18, code: 'cuisine', libelle: 'Cuisine', libelle_pluriel: 'Cuisines', icone: null, type_technique: 'labo', genre: 'f', elision: null },
    { composant_id: 13, nb: 2, id: 13, code: 'restaurant', libelle: 'Restaurant', libelle_pluriel: 'Restaurants', icone: null, type_technique: 'activite', genre: 'm', elision: null },
  ];
  const rows = await listComposantsConfig(5, fauxPool);
  assert.deepEqual(rows.map((r) => [r.code, r.genre, r.elision]), [['cuisine', 'f', null], ['restaurant', 'm', null]]);
  assert.equal(avecDet(rows[0]), 'ma cuisine');
  assert.equal(creerVocab(resolveLexique(ESSAIS.hotellerie)).avec(entreeComposant(rows[1])).mon('_', true), 'mes restaurants');
});

test('onboardingEtat : le SELECT des composants souscrits et son mapping portent genre et élision', () => {
  const src = fs.readFileSync(path.join(RACINE, 'src/services/onboardingEtat.js'), 'utf8');
  assert.match(src, /SELECT dc\.id, dc\.code, dc\.libelle, dc\.libelle_pluriel, dc\.genre, dc\.elision, dc\.type_technique, acc\.nb/);
  assert.match(src, /genre: c\.genre === 'f' \? 'f' : 'm', elision: typeof c\.elision === 'boolean' \? c\.elision : null/);
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Profil en cache après une création à la volée (spec §5.4)
// ═════════════════════════════════════════════════════════════════════════════
const CONFIG_MIROIR = { abonnement_id: 70, domaine_id: 3, nb_activites: 0, nb_labos: 0, nb_gerants: 0, nb_acheteurs: 0, formule_activites: null };

test('§5.4 : création à la volée → identitesCreees ; après le COMMIT, invaliderProfilApresCommit oublie le profil périmé', async () => {
  invalidate();
  requetes.length = 0;
  composantsDomaine = [];   // miroir : aucun composant de type gérant
  lignesConfig = [];
  configAbo = CONFIG_MIROIR;
  try {
    const avant = await getProfil(3);
    assert.ok(!avant.composants.some((c) => c.typeTechnique === 'gerant'));
    const r = await applyComposants(fauxPool, 70, { composants: [{ code: 'gerant', nb: 1 }], mode: 'add' });
    assert.equal(r.identitesCreees, true);
    assert.equal(r.domaineId, 3);
    // COMMIT simulé : la ligne écrite devient visible pour une nouvelle lecture
    const ins = requetes.find((q) => q.texte.startsWith('INSERT INTO domaine_composants'));
    assert.ok(ins, 'composant identité écrit');
    composantsDomaine = (await repondre(ins.texte, ins.params)).rows;
    // sans invalidation, le cache rend le profil lu AVANT l'INSERT (identiteDuDomaine l'y a mis) : le défaut corrigé
    assert.strictEqual(await getProfil(3), avant);
    invaliderProfilApresCommit(r);
    const apres = await getProfil(3);
    assert.notStrictEqual(apres, avant);
    const ger = apres.composants.find((c) => c.typeTechnique === 'gerant');
    assert.ok(ger, 'le profil relu porte le composant créé');
    assert.deepEqual([ger.libelle, ger.libellePluriel, ger.genre], ['Animatrice', 'Animatrices', 'f']);
  } finally {
    configAbo = null;
    composantsDomaine = [];
    invalidate();
  }
});

test('§5.4 : sans création, identitesCreees faux et le profil en cache est gardé ; résultat absent → rien, jamais d\'exception', async () => {
  invalidate();
  requetes.length = 0;
  composantsDomaine = [{ id: 31, domaine_id: 3, code: 'gerant', libelle: 'Animatrice', libelle_pluriel: 'Animatrices', icone: null, aide: null,
    type_technique: 'gerant', vente_active: true, production_active: true, nb_min: 0, nb_max: null, ordre: 1, actif: true, genre: 'f', elision: null }];
  lignesConfig = [];
  configAbo = CONFIG_MIROIR;
  try {
    const avant = await getProfil(3);
    const r = await applyComposants(fauxPool, 70, { composants: [{ code: 'gerant', nb: 1 }], mode: 'set' });
    assert.equal(r.identitesCreees, false);
    assert.equal(requetes.filter((q) => q.texte.startsWith('INSERT INTO domaine_composants')).length, 0);
    invaliderProfilApresCommit(r);
    assert.strictEqual(await getProfil(3), avant);
    for (const x of [null, undefined, {}, { identitesCreees: true }]) assert.doesNotThrow(() => invaliderProfilApresCommit(x));
  } finally {
    configAbo = null;
    composantsDomaine = [];
    invalidate();
  }
});

test('§5.4 : chaque fichier de src/ qui appelle applyComposants appelle invaliderProfilApresCommit après son COMMIT (lecture des sources)', () => {
  const fichiers = [];
  const parcourir = (dossier) => {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
      const p = path.join(dossier, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (e.name.endsWith('.js')) fichiers.push(p);
    }
  };
  parcourir(path.join(RACINE, 'src'));
  const code = (p) => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const appelants = [];
  for (const p of fichiers) {
    if (p.endsWith(path.join('services', 'configComposantsService.js'))) continue;
    const src = code(p);
    const appels = (src.match(/\bawait applyComposants\(/g) || []).length;
    if (!appels) continue;
    const invalidations = (src.match(/\binvaliderProfilApresCommit\(/g) || []).length;
    appelants.push(path.relative(RACINE, p).split(path.sep).join('/'));
    assert.ok(invalidations >= 1, `${path.relative(RACINE, p)} : ${appels} applyComposants, aucune invalidation`);
    // l'invalidation suit un COMMIT, jamais avant
    for (const m of src.matchAll(/\binvaliderProfilApresCommit\(/g)) {
      const avant = src.slice(Math.max(0, m.index - 400), m.index);
      assert.match(avant, /query\('COMMIT'\)/, `${path.relative(RACINE, p)} : invalidation sans COMMIT juste avant`);
    }
  }
  assert.deepEqual(appelants.sort(), [
    'src/controllers/abonnementController.js', 'src/controllers/clientsController.js',
    'src/controllers/supportController.js', 'src/controllers/webhookController.js',
  ]);
});
