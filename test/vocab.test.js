// Tests du vocabulaire côté serveur (lot 2a, spec §1.3, §1.4, §2.6) — sans base de données.
//   node --test test/vocab.test.js
//
// 1. Moteur GÉNÉRÉ (src/utils/vocab.js + src/config/lexiqueDefaut.js) : les MÊMES vecteurs que
//    le front (test/vocab-vecteurs.json = copie de frontend scripts/vocab-vecteurs.json).
// 2. resolveLexique / resolveProfil (domaineProfilService) : lexique entièrement résolu ;
//    PREUVE que rien ne change pour un domaine sans écart (Restauration, Boulangerie, Café) :
//    pour les 32 clés d'origine, sg / pl / g / el / icon avant (git show BASE) = après.
// 3. Validation à l'enregistrement (src/utils/lexiqueValidation.js, spec §1.4).
// 4. vocabDuProfil (src/utils/vocabCompte.js) : mémoïsation par objet lexique.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const RACINE = path.resolve(__dirname, '..');
const lireJson = (relatif) => JSON.parse(fs.readFileSync(path.join(RACINE, relatif), 'utf8'));
const lf = (s) => s.replace(/\r\n/g, '\n');

const { LEXIQUE_DEFAUT, LEXIQUE_CLES } = require('../src/config/lexiqueDefaut');
const moteur = require('../src/utils/vocab');
const { creerVocab, vocabDefaut, resoudreLexique, vocabDuLexique, rendre, rendreTout, balisesInvalides } = moteur;
const service = require('../src/services/domaineProfilService');
const { resolveLexique, resolveProfil, profilDefaut } = service;
const { validerLexique, nettoyerLexique, CODES_LEXIQUE, LEXIQUE_LONGUEUR_MAX } = require('../src/utils/lexiqueValidation');
const { vocabDuProfil } = require('../src/utils/vocabCompte');

// console.warn capturé pendant les tests (clés inconnues, balises invalides).
const avertissements = [];
const warnOrigine = console.warn;
test.before(() => { console.warn = (...a) => { avertissements.push(a.join(' ')); }; });
test.after(() => { console.warn = warnOrigine; });

// Commit de référence (avant le lot 2). scripts/vocab-check.base, s'il existe, fait foi.
const BASE_DEFAUT = '13d99d054b96eba7192d48d58b276fff756c4418';
const fichierBase = path.join(RACINE, 'scripts', 'vocab-check.base');
const BASE = fs.existsSync(fichierBase) ? fs.readFileSync(fichierBase, 'utf8').trim() || BASE_DEFAUT : BASE_DEFAUT;
// null si git ou le commit de référence est indisponible (clone superficiel de la CI, image Docker).
const gitShow = (fichier) => {
  try {
    return execFileSync('git', ['-C', RACINE, 'show', `${BASE}:${fichier}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_) {
    return null;
  }
};

// ── Lexiques d'essai (écarts) : brouillons de la migration 187 corrigés par la 191 ───────────
const ESSAIS = lireJson('test/vocab-lexiques-test.json');
const LEXIQUES = {
  defaut: LEXIQUE_DEFAUT,
  hotellerie: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie),
  ceramique: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.ceramique),
  miroir: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.miroir),
};
const VOCS = Object.fromEntries(Object.entries(LEXIQUES).map(([nom, lex]) => [nom, creerVocab(lex)]));

// Les 32 entrées du lexique d'origine (src/config/lexiqueDefaut.js au commit 13d99d0), recopiées
// ici pour que la preuve tienne aussi sans historique git. Le test « avant / après » vérifie,
// quand git est disponible, que cette copie EST le fichier d'origine.
const ORIGINE_32 = {
  activite:           { sg: 'Activité',            pl: 'Activités',             g: 'f', el: true,  icon: '🏪' },
  labo:               { sg: 'Labo',                pl: 'Labos',                 g: 'm', el: false, icon: '🏭' },
  produit_vendable:   { sg: 'Produit vendable',    pl: 'Produits vendables',    g: 'm', el: false, icon: '🛒' },
  produit_utilisable: { sg: 'Produit utilisable',  pl: 'Produits utilisables',  g: 'm', el: false, icon: '🧂' },
  produit_valorise:   { sg: 'Produit valorisé',    pl: 'Produits valorisés',    g: 'm', el: false, icon: '💎' },
  article:            { sg: 'Article',             pl: 'Articles',              g: 'm', el: true,  icon: '📦' },
  ingredient:         { sg: 'Ingrédient',          pl: 'Ingrédients',           g: 'm', el: true,  icon: '🥕' },
  recette:            { sg: 'Recette',             pl: 'Recettes',              g: 'f', el: false, icon: '📖' },
  fiche_technique:    { sg: 'Fiche technique',     pl: 'Fiches techniques',     g: 'f', el: false, icon: '📋' },
  portion:            { sg: 'Portion',             pl: 'Portions',              g: 'f', el: false, icon: '🍽️' },
  food_cost:          { sg: 'Food cost',           pl: 'Food costs',            g: 'm', el: false, icon: '📊' },
  cout_matiere:       { sg: 'Coût matière',        pl: 'Coûts matière',         g: 'm', el: false, icon: '💰' },
  marge:              { sg: 'Marge',               pl: 'Marges',                g: 'f', el: false, icon: '📈' },
  transfert:          { sg: 'Transfert',           pl: 'Transferts',            g: 'm', el: false, icon: '🚚' },
  appro:              { sg: 'Approvisionnement',   pl: 'Approvisionnements',    g: 'm', el: true,  icon: '📥' },
  perte:              { sg: 'Perte',               pl: 'Pertes',                g: 'f', el: false, icon: '🗑️' },
  inventaire:         { sg: 'Inventaire',          pl: 'Inventaires',           g: 'm', el: true,  icon: '📝' },
  vente:              { sg: 'Vente',               pl: 'Ventes',                g: 'f', el: false, icon: '💵' },
  acheteur:           { sg: 'Acheteur',            pl: 'Acheteurs',             g: 'm', el: true,  icon: '🤝' },
  gerant:             { sg: 'Gérant',              pl: 'Gérants',               g: 'm', el: false, icon: '👤' },
  fournisseur:        { sg: 'Fournisseur',         pl: 'Fournisseurs',          g: 'm', el: false, icon: '🏬' },
  depot:              { sg: 'Dépôt',               pl: 'Dépôts',                g: 'm', el: false, icon: '🏗️' },
  pt:                 { sg: 'Produit transformé',  pl: 'Produits transformés',  g: 'm', el: false, icon: '🍲' },
  stock:              { sg: 'Stock',               pl: 'Stocks',                g: 'm', el: false, icon: '📦' },
  prestataire:        { sg: 'Prestataire',         pl: 'Prestataires',          g: 'm', el: false, icon: '🛵' },
  supplement:         { sg: 'Supplément',          pl: 'Suppléments',           g: 'm', el: false, icon: '➕' },
  espace_activites:   { sg: 'Espace Activités',    pl: 'Espaces Activités',     g: 'm', el: true,  icon: '🏪' },
  espace_labo:        { sg: 'Espace Labo',         pl: 'Espaces Labo',          g: 'm', el: true,  icon: '🏭' },
  espace_vente:       { sg: 'Espace Vente',        pl: 'Espaces Vente',         g: 'm', el: true,  icon: '💵' },
  espace_acheteurs:   { sg: 'Espace Acheteurs',    pl: 'Espaces Acheteurs',     g: 'm', el: true,  icon: '🤝' },
  espace_produits:    { sg: 'Espace Produit',      pl: 'Espaces Produit',       g: 'm', el: true,  icon: '💎' },
  referentiel:        { sg: 'Référentiel',         pl: 'Référentiels',          g: 'm', el: false, icon: '📚' },
};
const CHAMPS_ORIGINE = ['sg', 'pl', 'g', 'el', 'icon'];
const cinqChamps = (e) => Object.fromEntries(CHAMPS_ORIGINE.map((c) => [c, e == null ? undefined : e[c]]));

// Brouillons de la migration 187, tels quels (avant la migration 191).
const BROUILLON_187_HOTELLERIE = {
  activite:           { sg: 'Service',                pl: 'Services',                g: 'm', el: false },
  labo:               { sg: 'Cuisine centrale',       pl: 'Cuisines centrales',      g: 'f', el: false },
  produit_utilisable: { sg: 'Consommable',            pl: 'Consommables',            g: 'm', el: false },
  produit_vendable:   { sg: 'Prestation vendue',      pl: 'Prestations vendues',     g: 'f', el: false },
  produit_valorise:   { sg: 'Prestation catalogue',   pl: 'Prestations catalogue',   g: 'f', el: false },
  article:            { sg: 'Fourniture',             pl: 'Fournitures',             g: 'f', el: false },
  ingredient:         { sg: 'Composant',              pl: 'Composants',              g: 'm', el: false },
  recette:            { sg: 'Fiche de préparation',   pl: 'Fiches de préparation',   g: 'f', el: false },
  food_cost:          { sg: 'Coût matière',           pl: 'Coûts matière',           g: 'm', el: false },
  transfert:          { sg: 'Livraison interne',      pl: 'Livraisons internes',     g: 'f', el: false },
  gerant:             { sg: 'Responsable de service', pl: 'Responsables de service', g: 'm', el: false },
  acheteur:           { sg: 'Client professionnel',   pl: 'Clients professionnels',  g: 'm', el: false },
  pt:                 { sg: 'Préparation',            pl: 'Préparations',            g: 'f', el: false },
};

// ── 1. Moteur généré : mêmes vecteurs que le front ───────────────────────────
const VECTEURS = lireJson('test/vocab-vecteurs.json').cas;

const executer = ([lexique, methode, cle, args]) => {
  const voc = VOCS[lexique];
  assert.ok(voc, `lexique inconnu « ${lexique} »`);
  if (methode === 'rendre') return rendre(voc, args[0]);
  if (methode === 'avec') return voc.avec(args[0])[args[1]](cle, ...args.slice(2));
  assert.equal(typeof voc[methode], 'function', `méthode inconnue « ${methode} »`);
  return voc[methode](cle, ...args);
};

test(`moteur généré : ${VECTEURS.length} vecteurs du front (≥ 200), tous conformes`, () => {
  assert.ok(VECTEURS.length >= 200, `seulement ${VECTEURS.length} cas`);
  const echecs = [];
  for (const cas of VECTEURS) {
    const attendu = cas[4];
    let obtenu;
    try { obtenu = executer(cas); } catch (e) { obtenu = `EXCEPTION ${e.message}`; }
    if (obtenu !== attendu) echecs.push(`${JSON.stringify(cas.slice(0, 4))}\n      attendu : ${JSON.stringify(attendu)}\n      obtenu  : ${JSON.stringify(obtenu)}`);
  }
  assert.equal(echecs.length, 0, `${echecs.length} vecteur(s) en échec :\n  - ${echecs.join('\n  - ')}`);
});

test('moteur généré : couverture des vecteurs (4 lexiques, toutes les méthodes de l\'API §2.1)', () => {
  const lexiques = new Set(VECTEURS.map((c) => c[0]));
  assert.deepEqual([...lexiques].sort(), ['ceramique', 'defaut', 'hotellerie', 'miroir']);
  const methodes = new Set(VECTEURS.map((c) => c[1]));
  const absentes = Object.keys(vocabDefaut).filter((m) => !methodes.has(m));
  assert.deepEqual(absentes, [], `méthodes sans vecteur : ${absentes.join(', ')}`);
  assert.ok(methodes.has('rendre'));
});

test('moteur généré : en-tête « fichier généré », exports attendus, défaut gelé', () => {
  for (const f of ['src/config/lexiqueDefaut.js', 'src/utils/vocab.js']) {
    const tete = lf(fs.readFileSync(path.join(RACINE, f), 'utf8')).split('\n')[0];
    assert.match(tete, /^\/\/ FICHIER GÉNÉRÉ — ne pas éditer/, f);
  }
  for (const n of ['vocabDefaut', 'creerVocab', 'resoudreLexique', 'completerLexique', 'vocabDuLexique', 'rendre', 'rendreTout', 'balisesInvalides']) {
    assert.ok(n in moteur, `export « ${n} »`);
  }
  assert.ok(Object.isFrozen(LEXIQUE_DEFAUT) && Object.isFrozen(LEXIQUE_CLES));
  assert.deepEqual([...LEXIQUE_CLES], Object.keys(LEXIQUE_DEFAUT));
  assert.equal(service.LEXIQUE_DEFAUT, LEXIQUE_DEFAUT, 'le service ré-exporte le lexique généré');
  assert.equal(rendre(vocabDefaut, 'Espace [[Pl:activite]] — [[le:labo]]'), 'Espace Activités — le labo');
  assert.deepEqual(rendreTout({ a: ['[[Nom:labo]]'] }, VOCS.hotellerie), { a: ['Cuisine centrale'] });
  assert.deepEqual(balisesInvalides('[[nom:labo]] [[bidule:labo]]').map((b) => b.balise), ['[[bidule:labo]]']);
});

test('copies conformes : vecteurs et lexiques d\'essai identiques à ceux du dépôt frontend', (t) => {
  const front = path.resolve(RACINE, '..', 'fiche-technique-frontend', 'scripts');
  if (!fs.existsSync(path.join(front, 'vocab-vecteurs.json'))) {
    t.skip('dépôt frontend absent à côté du backend');
    return;
  }
  for (const f of ['vocab-vecteurs.json', 'vocab-lexiques-test.json']) {
    assert.equal(
      lf(fs.readFileSync(path.join(RACINE, 'test', f), 'utf8')),
      lf(fs.readFileSync(path.join(front, f), 'utf8')),
      `test/${f} diffère de frontend scripts/${f} — recopier le fichier du front`,
    );
  }
});

// ── 2. resolveLexique : lexique entièrement résolu ───────────────────────────
test('resolveLexique : sans écart, le lexique résolu EST le lexique par défaut', () => {
  const attendu = JSON.parse(JSON.stringify(LEXIQUE_DEFAUT));
  for (const ecarts of [undefined, null, {}, '', '{}', 'pas du json', [], 0]) {
    assert.deepEqual(resolveLexique(ecarts), attendu);
    assert.equal(JSON.stringify(resolveLexique(ecarts)), JSON.stringify(LEXIQUE_DEFAUT), 'même ordre de clés');
  }
  // aucune entrée partagée avec le défaut gelé
  const r = resolveLexique({});
  for (const k of LEXIQUE_CLES) assert.ok(r[k] !== LEXIQUE_DEFAUT[k] && !Object.isFrozen(r[k]), `${k} : copie`);
  assert.equal(LEXIQUE_CLES.length, 40);
  assert.deepEqual(LEXIQUE_CLES.slice(0, 32), Object.keys(ORIGINE_32), 'les 32 clés d\'origine en tête, dans leur ordre');
});

test('resolveLexique : PREUVE avant / après — domaine sans écart (Restauration, Boulangerie, Café) : les 32 clés d\'origine sont inchangées (sg, pl, g, el, icon)', (t) => {
  // Après : le lexique résolu d'un domaine sans écart, et le profil exposé (resolveProfil).
  const apres = resolveLexique({});
  const profil = resolveProfil({ id: 1, slug: 'restauration', nom: 'Restauration', lexique: {}, regles: {} }, []);
  assert.equal(Object.keys(ORIGINE_32).length, 32);
  for (const [k, o] of Object.entries(ORIGINE_32)) {
    assert.deepEqual(cinqChamps(apres[k]), o, `${k} : lexique résolu`);
    assert.deepEqual(cinqChamps(profil.lexique[k]), o, `${k} : profil exposé`);
    assert.deepEqual(cinqChamps(profilDefaut().lexique[k]), o, `${k} : profil par défaut`);
  }

  // Avant : src/config/lexiqueDefaut.js du commit de référence + l'ancienne résolution
  // (domaineProfilService d'origine : { ...LEXIQUE_DEFAUT[k], ...ecart[k] } clé par clé).
  const source = gitShow('src/config/lexiqueDefaut.js');
  if (source === null) {
    t.diagnostic(`git show ${BASE} indisponible : comparaison faite sur la copie figée ORIGINE_32 seulement`);
    return;
  }
  const mod = { exports: {} };
  vm.runInThisContext(`(function (module, exports) {\n${source}\n})`, { filename: 'lexiqueDefaut.origine.js' })(mod, mod.exports);
  const AVANT_DEFAUT = mod.exports.LEXIQUE_DEFAUT;
  const clesAvant = Object.keys(AVANT_DEFAUT);
  assert.equal(clesAvant.length, 32, 'le lexique d\'origine a 32 clés');
  const resolveLexiqueAvant = (ecarts) => {
    const out = {};
    for (const k of clesAvant) out[k] = { ...AVANT_DEFAUT[k], ...(ecarts[k] || {}) };
    return out;
  };
  const avant = resolveLexiqueAvant({});
  const ecarts = [];
  for (const k of clesAvant) {
    for (const c of CHAMPS_ORIGINE) {
      if (avant[k][c] !== apres[k]?.[c]) ecarts.push(`${k}.${c} : ${JSON.stringify(avant[k][c])} → ${JSON.stringify(apres[k]?.[c])}`);
    }
    assert.deepEqual(Object.keys(avant[k]).sort(), [...CHAMPS_ORIGINE].sort(), `${k} : l'entrée d'origine n'a que ces 5 champs`);
    assert.deepEqual(cinqChamps(avant[k]), ORIGINE_32[k], `${k} : la copie figée ORIGINE_32 est bien l'origine`);
  }
  assert.deepEqual(ecarts, [], `écarts avant → après :\n  ${ecarts.join('\n  ')}`);
  assert.deepEqual(Object.keys(apres).slice(0, 32), clesAvant, 'même ordre pour les 32 clés d\'origine');
  // Les rendus du moteur par défaut sont ceux des formes d'origine.
  for (const k of clesAvant) {
    assert.equal(vocabDefaut.Nom(k), AVANT_DEFAUT[k].sg);
    assert.equal(vocabDefaut.Pl(k), AVANT_DEFAUT[k].pl);
    assert.equal(vocabDefaut.g(k), AVANT_DEFAUT[k].g);
    assert.equal(vocabDefaut.icon(k), AVANT_DEFAUT[k].icon);
  }
});

test('resolveLexique : clés dérivées selon leur mode (gabarit, copie, pluriel_titre)', () => {
  const h = resolveLexique(ESSAIS.hotellerie);
  const c = resolveLexique(ESSAIS.ceramique);
  assert.deepEqual(Object.keys(h), [...LEXIQUE_CLES], 'toutes les clés du défaut, dans son ordre');
  // gabarit : rendu avec le lexique du domaine, genre 'm'
  assert.deepEqual([h.espace_labo.sg, h.espace_labo.pl, h.espace_labo.g], ['Espace Cuisine', 'Espaces Cuisine', 'm']);
  assert.equal(h.espace_activites.sg, 'Espace Services');
  assert.equal(h.espace_acheteurs.sg, 'Espace Clients professionnels');
  assert.equal(c.espace_activites.sg, 'Espace Points de vente');
  assert.equal(c.espace_labo.sg, 'Espace Site');
  // gabarit dont le parent n'est pas surchargé : défaut
  assert.deepEqual(h.espace_vente, { ...LEXIQUE_DEFAUT.espace_vente });
  assert.deepEqual(h.espace_produits, { ...LEXIQUE_DEFAUT.espace_produits });
  // copie : entrée ENTIÈRE du parent
  assert.deepEqual([h.labo_long.sg, h.labo_long.pl, h.labo_long.g, h.labo_long.el], ['Cuisine centrale', 'Cuisines centrales', 'f', false]);
  assert.deepEqual(h.labo_long.court, { sg: 'Cuisine', pl: 'Cuisines' });
  assert.equal(h.labo_desc.sg, 'Cuisine centrale');
  assert.deepEqual([h.activite_desc.sg, h.activite_desc.g], ['Service', 'm']);
  // pluriel_titre : sg = pl = Titre(P.pl), genre et élision du parent
  assert.deepEqual([h.cat_pt_vendable.sg, h.cat_pt_vendable.pl, h.cat_pt_vendable.g], ['Prestations Vendues', 'Prestations Vendues', 'f']);
  assert.equal(h.cat_pt_utilisable.sg, 'Consommables');
  assert.equal(c.cat_pt_valorise.sg, 'Produits Finis Catalogue');
  // métadonnées de dérivation : toujours celles du défaut
  for (const k of LEXIQUE_CLES.filter((x) => LEXIQUE_DEFAUT[x].derive_de)) {
    assert.equal(h[k].derive_de, LEXIQUE_DEFAUT[k].derive_de);
    assert.equal(h[k].mode, LEXIQUE_DEFAUT[k].mode);
    assert.equal(h[k].gabarit, LEXIQUE_DEFAUT[k].gabarit);
  }
  // Céramique après la migration 191 : perte n'est plus surchargée
  assert.deepEqual(c.perte, { ...LEXIQUE_DEFAUT.perte });
  // une clé dérivée surchargée par le domaine garde son entrée, même si le parent l'est aussi
  const r = resolveLexique({
    labo: { sg: 'Atelier', pl: 'Ateliers', g: 'm', el: true },
    espace_labo: { sg: 'Coin Atelier', pl: 'Coins Atelier', g: 'm', el: false },
  });
  assert.equal(r.espace_labo.sg, 'Coin Atelier');
  assert.equal(r.espace_labo.derive_de, 'labo');
  assert.equal(r.labo_long.sg, 'Atelier');
});

test('resolveLexique : brouillon 187 avant la migration 191 (sans forme courte) — sans 191, « Espace Cuisine centrale »', () => {
  const h = resolveLexique(BROUILLON_187_HOTELLERIE);
  assert.equal(h.espace_labo.sg, 'Espace Cuisine centrale');
  assert.equal(h.pt.court, undefined);
  assert.equal(creerVocab(h).Court('pt'), 'Préparation');
  assert.equal(h.food_cost.sg, h.cout_matiere.sg, 'défaut de contenu du brouillon 187 (corrigé par la 191)');
  // après la 191 (lexique d'essai = brouillon corrigé)
  const apres = resolveLexique(ESSAIS.hotellerie);
  assert.equal(apres.food_cost.sg, 'Ratio matière');
  assert.notEqual(apres.food_cost.sg, apres.cout_matiere.sg);
  assert.equal(creerVocab(apres).Court('pt'), 'Prépa');
  assert.equal(creerVocab(apres).Court('labo'), 'Cuisine');
});

test('resolveLexique : forme courte héritée seulement si sg n\'est pas surchargé ; clés inconnues conservées', () => {
  // sg surchargé sans forme courte : ni `court` ni `appo` du défaut
  const r1 = resolveLexique({ pt: { sg: 'Préparation', pl: 'Préparations', g: 'f', el: false }, labo: { sg: 'Atelier', pl: 'Ateliers', g: 'm', el: true } });
  assert.equal(r1.pt.court, undefined);
  assert.equal(r1.labo.appo, undefined);
  assert.equal(creerVocab(r1).avecCourt('pt', true), 'préparations');
  assert.equal(creerVocab(r1).compl('labo'), "de l'atelier");
  // sg non surchargé : forme courte et apposition du défaut conservées
  const r2 = resolveLexique({ pt: { icon: '🥣' }, appro: { pl: 'Approvisionnements divers' }, labo: { court: { sg: 'Lab', pl: 'Labs' } } });
  assert.deepEqual(r2.pt.court, { sg: 'PT', pl: 'PT' });
  assert.deepEqual([r2.pt.sg, r2.pt.icon], ['Produit transformé', '🥣']);
  assert.deepEqual(r2.appro.court, { sg: 'Appro', pl: 'Appros' });
  assert.equal(r2.appro.pl, 'Approvisionnements divers');
  assert.equal(r2.labo.appo, true);
  assert.equal(r2.espace_labo.sg, 'Espace Lab', 'le gabarit suit la forme courte du parent');
  assert.equal(r2.labo_long.sg, 'Laboratoire', 'copie : seulement si le sg du parent est surchargé');
  // clés inconnues du défaut : conservées telles quelles, après les clés du défaut
  const r3 = resolveLexique({ chantier: { sg: 'Chantier', pl: 'Chantiers', g: 'm', el: false } });
  assert.deepEqual(r3.chantier, { sg: 'Chantier', pl: 'Chantiers', g: 'm', el: false });
  assert.deepEqual(Object.keys(r3), [...LEXIQUE_CLES, 'chantier']);
  assert.equal(creerVocab(r3).le('chantier', 2), 'les chantiers');
  // derive_de / mode / gabarit venus d'un domaine : ignorés
  const r4 = resolveLexique({ labo: { sg: 'Site', pl: 'Sites', g: 'm', el: false, derive_de: 'vente', mode: 'copie', gabarit: 'x' } });
  assert.equal(r4.labo.derive_de, undefined);
  assert.equal(r4.labo.gabarit, undefined);
  // écarts stockés en texte JSON (colonne lue en texte) : acceptés
  assert.equal(resolveLexique(JSON.stringify({ labo: { sg: 'Site', pl: 'Sites', g: 'm', el: false } })).labo.sg, 'Site');
  // le défaut n'est jamais modifié
  assert.equal(LEXIQUE_DEFAUT.labo.sg, 'Labo');
});

test('resolveProfil / vocabDuProfil : profil exposé = lexique résolu ; vocabulaire mémoïsé par objet lexique', () => {
  const restauration = resolveProfil({ id: 1, slug: 'restauration', nom: 'Restauration', lexique: {}, regles: {} }, []);
  assert.equal(vocabDuProfil(restauration), vocabDefaut, 'domaine sans écart → vocabDefaut lui-même');
  assert.equal(vocabDuProfil(null), vocabDefaut);
  assert.equal(vocabDuProfil({}), vocabDefaut);

  const hotel = resolveProfil({ id: 2, slug: 'hotellerie', nom: 'Hôtellerie', lexique: ESSAIS.hotellerie, regles: {} }, []);
  assert.deepEqual(Object.keys(hotel.lexique), [...LEXIQUE_CLES]);
  const voc = vocabDuProfil(hotel);
  assert.notEqual(voc, vocabDefaut);
  assert.equal(vocabDuProfil(hotel), voc, 'même objet lexique → même vocabulaire (WeakMap)');
  assert.equal(voc.le('labo'), 'la cuisine centrale');
  assert.equal(voc.Nom('espace_labo'), 'Espace Cuisine');
  assert.equal(`Stock ${voc.Court('labo')}`, 'Stock Cuisine');
  // un profil rechargé (nouvel objet lexique) donne un nouveau vocabulaire, aux mêmes rendus
  const hotel2 = resolveProfil({ id: 2, slug: 'hotellerie', nom: 'Hôtellerie', lexique: ESSAIS.hotellerie, regles: {} }, []);
  assert.notEqual(vocabDuProfil(hotel2), voc);
  assert.equal(vocabDuProfil(hotel2).le('labo'), 'la cuisine centrale');
  // même fonction que le front : vocabDuLexique(lexique reçu)
  assert.equal(vocabDuLexique(hotel.lexique).Nom('espace_labo'), 'Espace Cuisine');
});

// ── 3. Validation à l'enregistrement (spec §1.4) ─────────────────────────────
const code = (lex) => validerLexique(lex)?.code ?? null;

test('validation : lexiques valides', () => {
  assert.equal(validerLexique(undefined), null);
  assert.equal(validerLexique(null), null);
  assert.equal(validerLexique({}), null);
  assert.equal(validerLexique(ESSAIS.hotellerie), null, 'brouillon Hôtellerie corrigé');
  assert.equal(validerLexique(ESSAIS.ceramique), null, 'brouillon Céramique corrigé');
  assert.equal(validerLexique(ESSAIS.miroir), null);
  assert.equal(validerLexique(BROUILLON_187_HOTELLERIE), null);
  // écarts partiels SANS sg : admis (fusion champ par champ avec le défaut)
  assert.equal(validerLexique({ pt: { icon: '🥣' }, labo: { court: { sg: 'Lab', pl: 'Labs' } }, activite: { g: 'f' }, appro: { pl: 'Appros divers' } }), null);
  assert.equal(validerLexique({ labo: { court: { sg: 'Lab' } } }), null, 'forme courte sans pluriel : pl = sg');
  assert.equal(validerLexique({ labo: null }), null, 'ligne vidée');
  assert.equal(validerLexique({ labo: { sg: '', pl: '' } }), null, 'champs vides = non surchargés');
  assert.equal(validerLexique({ labo: { sg: 'Site', pl: 'Sites', g: 'm', el: false, icon: '🏭', appo: true, court: { sg: 'S', pl: 'S', el: false } } }), null);
  // une clé dérivée peut être surchargée par le domaine
  assert.equal(validerLexique({ espace_labo: { sg: 'Coin Atelier', pl: 'Coins Atelier', g: 'm', el: false } }), null);
  // clé inconnue du défaut, complète
  assert.equal(validerLexique({ chantier: { sg: 'Chantier', pl: 'Chantiers', g: 'm', el: false } }), null);
  // tiret, barre oblique, parenthèses, apostrophe : admis
  assert.equal(validerLexique({ labo: { sg: "Semi-fini (l'usine) / Site", pl: 'Semi-finis', g: 'm', el: false } }), null);
});

test('validation : sg surchargé ⇒ pl, g, el obligatoires (400 LEXIQUE_ENTREE_INCOMPLETE)', () => {
  assert.equal(CODES_LEXIQUE.INCOMPLET, 'LEXIQUE_ENTREE_INCOMPLETE');
  for (const entree of [
    { sg: 'Atelier' },
    { sg: 'Atelier', pl: 'Ateliers' },
    { sg: 'Atelier', pl: 'Ateliers', g: 'm' },
    { sg: 'Atelier', pl: 'Ateliers', el: true },
    { sg: 'Atelier', g: 'm', el: true },
    { sg: 'Atelier', pl: '   ', g: 'm', el: true },
  ]) {
    const e = validerLexique({ labo: entree });
    assert.equal(e?.code, 'LEXIQUE_ENTREE_INCOMPLETE', JSON.stringify(entree));
    assert.equal(e.cle, 'labo');
    assert.match(e.message, /Lexique « labo » : le singulier est modifié/);
  }
  assert.match(validerLexique({ labo: { sg: 'Atelier' } }).message, /le pluriel, le genre, l'élision/);
  assert.match(validerLexique({ labo: { sg: 'Atelier', pl: 'Ateliers', g: 'm' } }).message, /renseigner l'élision\.$/);
  // clé inconnue du défaut : pas de défaut à compléter
  assert.equal(code({ chantier: { pl: 'Chantiers' } }), 'LEXIQUE_ENTREE_INCOMPLETE');
  assert.equal(code({ chantier: { icon: '🏗️' } }), 'LEXIQUE_ENTREE_INCOMPLETE');
  assert.equal(code({ chantier: {} }), null, 'entrée vide : retirée au nettoyage');
  // forme courte : pluriel sans singulier
  assert.equal(code({ labo: { court: { pl: 'Labs' } } }), 'LEXIQUE_ENTREE_INCOMPLETE');
});

test('validation : derive_de, mode, gabarit non surchargeables (400 LEXIQUE_CHAMP_NON_SURCHARGEABLE)', () => {
  for (const champ of ['derive_de', 'mode', 'gabarit']) {
    const e = validerLexique({ espace_labo: { sg: 'Coin', pl: 'Coins', g: 'm', el: false, [champ]: 'x' } });
    assert.equal(e?.code, 'LEXIQUE_CHAMP_NON_SURCHARGEABLE', champ);
    assert.equal(e.champ, champ);
    assert.match(e.message, new RegExp(`« ${champ} » n'est pas modifiable`));
    // même sur une clé simple, et même sans sg
    assert.equal(code({ labo: { [champ]: 'activite' } }), 'LEXIQUE_CHAMP_NON_SURCHARGEABLE');
  }
});

test('validation : caractères interdits [ ] | * \\ ` et retour à la ligne dans sg, pl, forme courte (400 LEXIQUE_CARACTERE_INTERDIT)', () => {
  assert.match(validerLexique({ labo: { sg: 'S[i', pl: 'S', g: 'm', el: false } }).message, /Caractères refusés : \[ \] \| \* \\ ` \{ \} \$, le retour à la ligne, la tabulation et les caractères de contrôle\.$/);
  const complet = (patch) => ({ labo: { sg: 'Site', pl: 'Sites', g: 'm', el: false, ...patch } });
  for (const c of ['[', ']', '|', '*', '\\', '`', '\n', '\r']) {
    assert.equal(code(complet({ sg: `Si${c}te` })), 'LEXIQUE_CARACTERE_INTERDIT', `sg ${JSON.stringify(c)}`);
    assert.equal(code(complet({ pl: `Sites${c}` })), 'LEXIQUE_CARACTERE_INTERDIT', `pl ${JSON.stringify(c)}`);
    assert.equal(code(complet({ court: { sg: `${c}S`, pl: 'S' } })), 'LEXIQUE_CARACTERE_INTERDIT', `court.sg ${JSON.stringify(c)}`);
    assert.equal(code(complet({ court: { sg: 'S', pl: `S${c}` } })), 'LEXIQUE_CARACTERE_INTERDIT', `court.pl ${JSON.stringify(c)}`);
    // pl seul (sg non surchargé) : contrôlé aussi
    assert.equal(code({ labo: { pl: `Labos${c}` } }), 'LEXIQUE_CARACTERE_INTERDIT');
  }
  const e = validerLexique(complet({ sg: '[[nom:vente]]' }));
  assert.equal(e.code, 'LEXIQUE_CARACTERE_INTERDIT');
  assert.deepEqual([e.cle, e.champ], ['labo', 'sg']);
  assert.match(e.message, /Lexique « labo » : le singulier contient un caractère interdit \(« \[ »\)/);
  assert.match(validerLexique(complet({ pl: 'Sites\nusines' })).message, /le pluriel contient un caractère interdit \(retour à la ligne\)/);
  assert.match(validerLexique(complet({ court: { sg: 'S*', pl: 'S' } })).message, /la forme courte \(singulier\) contient un caractère interdit \(« \* »\)/);
});

test('validation : { } $ (interpolation i18next), caractères de contrôle et séparateurs de ligne ; l\'icône est contrôlée comme un texte', () => {
  const complet = (patch) => ({ labo: { sg: 'Site', pl: 'Sites', g: 'm', el: false, ...patch } });
  const LS = String.fromCodePoint(0x2028);
  const PS = String.fromCodePoint(0x2029);
  const NEL = String.fromCodePoint(0x85);
  const DEL = String.fromCodePoint(0x7f);
  const NUL = String.fromCodePoint(0);
  for (const c of ['{', '}', '$', '\t', LS, PS, NEL, DEL, NUL, String.fromCodePoint(0x1b)]) {
    for (const patch of [{ sg: `Si${c}te` }, { pl: `Sites${c}` }, { court: { sg: `S${c}`, pl: 'S' } }, { icon: `🏭${c}` }]) {
      assert.equal(code(complet(patch)), 'LEXIQUE_CARACTERE_INTERDIT', `${JSON.stringify(patch)}`);
    }
  }
  // un terme ne peut plus être interprété par i18next (« Atelier $t(common.save) », « {{count}} »)
  assert.match(validerLexique(complet({ sg: 'Atelier $t(common.save)' })).message, /caractère interdit \(« \$ »\)/);
  assert.match(validerLexique(complet({ pl: 'Sites {{count}}' })).message, /caractère interdit \(« \{ »\)/);
  assert.match(validerLexique(complet({ sg: 'Si\tte' })).message, /\(tabulation\)/);
  assert.match(validerLexique(complet({ sg: `Si${LS}te` })).message, /\(retour à la ligne\)/);
  assert.match(validerLexique(complet({ sg: `Si${NUL}te` })).message, /\(caractère de contrôle U\+0000\)/);
  // icône : mêmes caractères refusés que sg / pl (elle sort dans les mêmes textes)
  const e = validerLexique(complet({ icon: '[[Nom:labo]]\n**x**' }));
  assert.deepEqual([e.code, e.cle, e.champ], ['LEXIQUE_CARACTERE_INTERDIT', 'labo', 'icon']);
  assert.match(e.message, /Lexique « labo » : l'icône contient un caractère interdit/);
  assert.equal(code({ labo: { icon: '`x`' } }), 'LEXIQUE_CARACTERE_INTERDIT', 'icône seule (sg non surchargé)');
  // admis : espace insécable, tiret, barre oblique, parenthèses, apostrophes, point, esperluette, < et >
  assert.equal(validerLexique(complet({ sg: `Hors${String.fromCodePoint(0xa0)}taxe`, pl: "L’atelier (n° 2) / Site & Co. <b>", icon: '🧑🏽‍🍳' })), null);
});

test('validation : longueurs — 60 (sg, pl), 20 (forme courte), 8 (icône) (400 LEXIQUE_TROP_LONG)', () => {
  assert.deepEqual({ ...LEXIQUE_LONGUEUR_MAX }, { sg: 60, pl: 60, 'court.sg': 20, 'court.pl': 20, icon: 8 });
  assert.equal(CODES_LEXIQUE.LONGUEUR, 'LEXIQUE_TROP_LONG');
  const complet = (patch) => ({ labo: { sg: 'Site', pl: 'Sites', g: 'm', el: false, ...patch } });
  const x = (n) => 'a'.repeat(n);
  assert.equal(validerLexique(complet({ sg: x(60), pl: x(60), court: { sg: x(20), pl: x(20) }, icon: x(8) })), null, 'aux limites : admis');
  assert.equal(validerLexique(complet({ sg: `  ${x(60)}  ` })), null, 'mesuré sans les blancs de bord (rognés au nettoyage)');
  for (const [patch, champ] of [[{ sg: x(61) }, 'sg'], [{ pl: x(61) }, 'pl'], [{ court: { sg: x(21), pl: 'a' } }, 'court.sg'], [{ court: { sg: 'a', pl: x(21) } }, 'court.pl'], [{ icon: x(9) }, 'icon'], [{ sg: x(5000) }, 'sg']]) {
    const e = validerLexique(complet(patch));
    assert.deepEqual([e?.code, e?.champ], ['LEXIQUE_TROP_LONG', champ], JSON.stringify(Object.keys(patch)));
  }
  assert.match(validerLexique(complet({ sg: x(61) })).message, /Lexique « labo » : le singulier dépasse 60 caractères \(61 saisis\)\./);
  assert.match(validerLexique(complet({ court: { sg: x(21), pl: 'a' } })).message, /la forme courte \(singulier\) dépasse 20 caractères \(21 saisis\)\./);
  // le lexique par défaut et les lexiques d'essai tiennent dans ces limites
  for (const lex of [LEXIQUE_DEFAUT, ESSAIS.hotellerie, ESSAIS.ceramique, ESSAIS.miroir]) {
    for (const [k, en] of Object.entries(lex)) {
      if (!en || typeof en !== 'object') continue;
      assert.ok(en.sg.length <= 60 && (en.pl ?? '').length <= 60 && (en.icon ?? '').length <= 8 && (en.court?.sg ?? '').length <= 20, k);
    }
  }
});

test('validation : clés réservées (constructor, __proto__, prototype) refusées, sans pollution de prototype', () => {
  const entree = { sg: 'X', pl: 'X', g: 'm', el: false };
  for (const cle of ['constructor', '__proto__', 'prototype']) {
    const lex = JSON.parse(`{ ${JSON.stringify(cle)}: ${JSON.stringify(entree)} }`); // comme le corps JSON d'un PUT
    const e = validerLexique(lex);
    assert.deepEqual([e?.code, e?.cle], ['LEXIQUE_INVALIDE', cle]);
    assert.match(e.message, new RegExp(`clé réservée « ${cle} »`));
    // même si la validation était contournée, le nettoyage ne garde pas la clé et ne touche aucun prototype
    assert.deepEqual(nettoyerLexique(lex), {});
  }
  assert.equal(({}).sg, undefined);
  assert.equal(Object.getPrototypeOf(nettoyerLexique(JSON.parse('{ "__proto__": { "sg": "X" } }'))), Object.prototype);
  // une clé ordinaire qui ressemble (souligné, chiffres) reste admise
  assert.equal(validerLexique({ proto_2: entree }), null);
});

test('validation : clé DÉRIVÉE sans singulier — seule l\'icône se change à part (400 LEXIQUE_ENTREE_INCOMPLETE)', () => {
  for (const entree of [{ pl: 'Grandes cuisines' }, { g: 'f' }, { el: true }, { appo: true }, { court: { sg: 'GC' } }, { pl: 'X', icon: '🔬' }]) {
    for (const cle of ['labo_long', 'espace_labo', 'cat_pt_vendable']) {
      const e = validerLexique({ [cle]: entree });
      assert.deepEqual([e?.code, e?.cle], ['LEXIQUE_ENTREE_INCOMPLETE', cle], `${cle} ${JSON.stringify(entree)}`);
      assert.match(e.message, new RegExp(`cette clé suit « ${LEXIQUE_DEFAUT[cle].derive_de} »`));
    }
  }
  // admis : icône seule, entrée vide, entrée complète ; et une clé SIMPLE garde ses écarts partiels
  assert.equal(validerLexique({ labo_long: { icon: '🔬' }, espace_labo: {}, labo_desc: { sg: '', pl: '' }, cat_pt_vendable: { sg: 'Finis', pl: 'Finis', g: 'm', el: false } }), null);
  assert.equal(validerLexique({ labo: { pl: 'Labz' }, activite: { g: 'm', el: false } }), null);
  // le cas trouvé en relecture : le pluriel saisi était perdu en silence dès que le parent était surchargé
  const perdu = resolveLexique({ labo: { sg: 'Cuisine centrale', pl: 'Cuisines centrales', g: 'f', el: false }, labo_long: { pl: 'Grandes cuisines' } });
  assert.equal(perdu.labo_long.pl, 'Cuisines centrales', 'le moteur ignore ce pluriel : la validation le refuse donc à l\'enregistrement');
});

test('nettoyage : une entrée redéclarée à l\'identique du défaut n\'est pas stockée (elle ferait perdre forme courte et apposition)', () => {
  const identiques = {
    pt: { sg: 'Produit transformé', pl: 'Produits transformés', g: 'm', el: false },
    labo: { sg: ' Labo ', pl: 'Labos', g: 'm', el: false, icon: '🏭', appo: true },
    appro: { sg: 'Approvisionnement', pl: 'Approvisionnements', g: 'm', el: true, court: { sg: 'Appro', pl: 'Appros' } },
    espace_labo: { sg: 'Espace Labo', pl: 'Espaces Labo', g: 'm', el: true },
  };
  assert.equal(validerLexique(identiques), null);
  assert.deepEqual(nettoyerLexique(identiques), {});
  assert.equal(JSON.stringify(resolveLexique(nettoyerLexique(identiques))), JSON.stringify(LEXIQUE_DEFAUT));
  // stockée telle quelle, l'entrée perdrait « PT » : c'est ce que le nettoyage évite
  assert.equal(resolveLexique({ pt: identiques.pt }).pt.court, undefined);
  // un seul champ différent : l'entrée est un vrai écart, gardée entière
  const ecarts = {
    pt: { sg: 'Produit transformé', pl: 'Produits transformés', g: 'f', el: false },
    labo: { sg: 'Labo', pl: 'Labos', g: 'm', el: false, appo: false },
    appro: { sg: 'Approvisionnement', pl: 'Approvisionnements', g: 'm', el: true, court: { sg: 'Appro', pl: 'Appro' } },
    stock: { sg: 'Stock', pl: 'Stocks', g: 'm', el: false, icon: '🗄️' },
    activite: { pl: 'Activités' },
    chantier: { sg: 'Chantier', pl: 'Chantiers', g: 'm', el: false },
  };
  assert.deepEqual(nettoyerLexique(ecarts), ecarts);
});

test('migration 191, étape 0 : la table des 32 clés est le lexique par défaut d\'avant le lot 2 ; les entrées de l\'ancienne interface gardent leur genre', () => {
  const sql = lf(fs.readFileSync(path.join(RACINE, 'migrations', '191_lexique_v2_brouillons.sql'), 'utf8'));
  const lignes = [...sql.matchAll(/^\s+\('([a-z_]+)',\s+'((?:[^']|'')*)',\s+'([mf])',\s+(true|false)\),?$/gm)]
    .map((m) => [m[1], { pl: m[2].replace(/''/g, "'"), g: m[3], el: m[4] === 'true' }]);
  assert.equal(lignes.length, 32, 'une ligne VALUES par clé d\'origine');
  assert.deepEqual(lignes.map(([k]) => k), Object.keys(ORIGINE_32), 'mêmes clés, même ordre');
  for (const [k, d] of lignes) assert.deepEqual(d, { pl: ORIGINE_32[k].pl, g: ORIGINE_32[k].g, el: ORIGINE_32[k].el }, k);
  // Ce que fait l'étape 0, rejoué en JS sur un lexique au format de l'ancienne interface (pl, g, el omis
  // quand ils valaient le défaut d'origine) : la résolution v2 retrouve EXACTEMENT celle d'avant le lot 2.
  const table = Object.fromEntries(lignes);
  const completer = (ecarts) => Object.fromEntries(Object.entries(ecarts).map(([k, e]) => {
    if (!e.sg || !table[k]) return [k, e];
    return [k, { ...e, pl: e.pl || table[k].pl, g: e.g === 'm' || e.g === 'f' ? e.g : table[k].g, el: typeof e.el === 'boolean' ? e.el : table[k].el }];
  }));
  const ancienFormat = {
    recette: { sg: 'Fiche de préparation', pl: 'Fiches de préparation' }, // f, sans élision : comme le défaut, donc omis
    labo: { sg: 'Cuisine centrale', pl: 'Cuisines centrales', g: 'f' },
    marge: { sg: 'Marge brute', pl: 'Marges brutes' },
    vente: { sg: 'Commande', pl: 'Commandes' },
    article: { sg: 'Fourniture', pl: 'Fournitures', g: 'f', el: false },
  };
  // sans l'étape 0, le lexique v2 lit l'entrée telle quelle : masculin, sans élision
  assert.equal(creerVocab(resolveLexique(ancienFormat)).le('recette'), 'le fiche de préparation');
  assert.equal(creerVocab(resolveLexique(ancienFormat)).le('vente'), 'le commande');
  const complete = completer(ancienFormat);
  assert.equal(validerLexique(complete), null, 'après l\'étape 0, chaque entrée est complète');
  const v = creerVocab(resolveLexique(complete));
  assert.equal(v.le('recette'), 'la fiche de préparation');
  assert.equal(v.le('vente'), 'la commande');
  assert.equal(v.un('marge'), 'une marge brute');
  assert.equal(v.le('labo'), 'la cuisine centrale');
  for (const [k, e] of Object.entries(ancienFormat)) {
    const avant = { ...ORIGINE_32[k], ...e }; // résolution d'avant le lot 2
    const apres = resolveLexique(complete)[k];
    assert.deepEqual([apres.sg, apres.pl, apres.g, apres.el], [avant.sg, avant.pl, avant.g, avant.el], k);
  }
});

test('validation : formes et types (400 LEXIQUE_INVALIDE)', () => {
  for (const lex of [
    [], 'texte', 12,
    { 'Clé invalide': { sg: 'x' } },
    { labo: 'Atelier' },
    { labo: ['Atelier'] },
    { labo: { sg: 12 } },
    { labo: { pl: {} } },
    { labo: { g: 'x' } },
    { labo: { el: 'oui' } },
    { labo: { icon: 1 } },
    { labo: { appo: 'oui' } },
    { labo: { inconnu: 1 } },
    { labo: { court: 'Lab' } },
    { labo: { court: { sg: 1 } } },
    { labo: { court: { sg: 'Lab', autre: 1 } } },
    { labo: { court: { sg: 'Lab', el: 'non' } } },
  ]) {
    assert.equal(code(lex), 'LEXIQUE_INVALIDE', JSON.stringify(lex));
    assert.equal(typeof validerLexique(lex).message, 'string');
  }
});

test('nettoyage : seuls les écarts non vides sont stockés, textes rognés', () => {
  assert.deepEqual(nettoyerLexique(null), {});
  assert.deepEqual(nettoyerLexique({ labo: null, activite: {}, vente: { sg: '', pl: '  ', icon: '' } }), {});
  assert.deepEqual(
    nettoyerLexique({
      labo: { sg: ' Site ', pl: 'Sites ', g: 'm', el: false, icon: ' 🏭 ', appo: true, court: { sg: ' S ', pl: '', el: false } },
      pt: { court: { sg: '', pl: '' }, icon: '🥣' },
      activite: { g: 'f' },
    }),
    {
      labo: { sg: 'Site', pl: 'Sites', icon: '🏭', g: 'm', el: false, court: { sg: 'S', el: false }, appo: true },
      pt: { icon: '🥣' },
      activite: { g: 'f' },
    },
  );
  // un lexique valide nettoyé reste valide et se résout à l'identique
  for (const nom of ['hotellerie', 'ceramique', 'miroir']) {
    const propre = nettoyerLexique(ESSAIS[nom]);
    assert.deepEqual(propre, ESSAIS[nom], nom);
    assert.equal(validerLexique(propre), null);
  }
});
