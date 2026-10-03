// Lot 2c, étape S0 — module src/utils/manuelRendu.js (spec docs/lot-2c-spec.md §5.1, §5.2, R5.4, R5.7, R5.8).
// Sans base de données : fonctions pures, requête commune lue comme texte, faux pool pour le démarrage.
//   node --test test/2c-manuelRendu.test.js
//
// 1. Rendu : par défaut, une fiche balisée rend exactement l'origine, une fiche sans balise passe intacte ;
//    Hôtellerie : titre, partie, contenu rendus ; entrée de la base.
// 2. Variantes (I12) : slugVariantes nul pour le défaut (admin, restauration, café), le slug du profil sinon ;
//    requête commune (colonnes de listPublic, jointure sur une variante « valide », ordre de lecture, gérant).
// 3. Mots-clés enrichis (R5.4) : rien par défaut même avec des composants ; formes et libellés en Hôtellerie,
//    sans doublon ; « pt » en minuscules ; libellé de moins de 4 lettres ; composants si entrée entière.
// 4. verifierBalises (I11), refuserBalises (R5.7.1), formesParDefaut.
// 5. champsSansBalises champ par champ, champs admis, règle « aucune balise en base » ; démarrage (R5.8).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');
const { vocabDefaut, vocabDuLexique, resoudreLexique, rendre } = require('../src/utils/vocab');
const M = require('../src/utils/manuelRendu');

const ESSAIS = JSON.parse(fs.readFileSync(path.join(__dirname, 'vocab-lexiques-test.json'), 'utf8'));
const vH = vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie));
const vC = vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.ceramique));
// Un domaine sans écart (café, boulangerie) : lexique vide, donc vocabulaire par défaut.
const vCafe = vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, {}));

// Composants d'Hôtellerie (brouillons de la migration 187, mapComposant).
const COMPOSANTS_H = [
  { libelle: 'Restaurant', libellePluriel: 'Restaurants', typeTechnique: 'activite', actif: true },
  { libelle: 'Bar', libellePluriel: 'Bars', typeTechnique: 'activite', actif: true },
  { libelle: 'Spa', libellePluriel: 'Spas', typeTechnique: 'activite', actif: true },
  { libelle: 'Room service', libellePluriel: 'Room services', typeTechnique: 'activite', actif: true },
  { libelle: 'Cuisine', libellePluriel: 'Cuisines', typeTechnique: 'labo', actif: true },
  { libelle: 'Économat', libellePluriel: 'Économats', typeTechnique: 'labo', actif: false },
  { libelle: 'Responsable de service', libellePluriel: 'Responsables de service', typeTechnique: 'gerant', actif: true },
];

// Fiche d'origine et sa forme balisée (exemples 1, 5, 6 et 8 du §7.7).
const ORIGINE = {
  id: 7, slug: 'stock-labo', titre: 'Stock Labo', icone: '🏭', partie: 'Stock & Appro', ordre: 3,
  contenu: 'Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités.\n\n'
    + '| Espace Labo | Stock du labo, production, transferts vers les activités |',
  mots_cles: 'stock labo, laboratoire, produit transformé, pt', ecran: '/client/stock-labo',
  visible_gerant: true, actif: true, updated_at: new Date('2026-07-01T10:00:00Z'),
};
const BALISEE = {
  ...ORIGINE,
  titre: '[[Nom:stock]] [[Court:labo]]',
  partie: '[[Nom:stock]] & [[Court:appro]]',
  contenu: 'Cet écran envoie [[le:article:pl]] et [[le:pt:pl]] ([[court:pt:pl]]) [[du:labo]] vers [[votre:activite:pl]].\n\n'
    + '| [[Nom:espace_labo]] | [[Nom:stock]] [[du:labo]], production, [[nom:transfert:pl]] vers [[le:activite:pl]] |',
};

// ── 1. Rendu ──────────────────────────────────────────────────────────────────────────────────────────────────
test('rendreFiche par défaut : une fiche balisée rend exactement l\'origine (octet pour octet, même ordre des clés)', () => {
  const r = M.rendreFiche(vocabDefaut, BALISEE, COMPOSANTS_H);
  assert.deepEqual(Object.keys(r), Object.keys(ORIGINE));
  for (const k of ['titre', 'partie', 'contenu', 'mots_cles']) {
    assert.ok(Buffer.from(r[k]).equals(Buffer.from(ORIGINE[k])), k);
  }
  assert.deepEqual(r, ORIGINE);
  assert.notEqual(r, BALISEE, 'une copie, jamais la ligne reçue');
  assert.equal(BALISEE.titre, '[[Nom:stock]] [[Court:labo]]', 'la ligne reçue n\'est pas modifiée');
});

test('rendreFiche : une fiche sans balise passe intacte, par défaut et dans un autre domaine (hors mots-clés)', () => {
  assert.deepEqual(M.rendreFiche(vocabDefaut, ORIGINE, COMPOSANTS_H), ORIGINE);
  assert.deepEqual(M.rendreFiche(vocabDefaut, ORIGINE), ORIGINE);
  const h = M.rendreFiche(vH, ORIGINE, COMPOSANTS_H);
  for (const k of ['id', 'slug', 'titre', 'icone', 'partie', 'ordre', 'contenu', 'ecran', 'visible_gerant', 'actif', 'updated_at']) {
    assert.equal(h[k], ORIGINE[k], k);
  }
  // Une ligne réduite (colonnes de la recherche) ne reçoit aucun champ de plus.
  const reduite = { slug: 's', titre: 'T', contenu: 'C' };
  assert.deepEqual(Object.keys(M.rendreFiche(vH, reduite)), ['slug', 'titre', 'contenu']);
});

test('rendreFiche en Hôtellerie et en Céramique : titre, partie et contenu dans les mots du domaine', () => {
  const h = M.rendreFiche(vH, BALISEE, COMPOSANTS_H);
  assert.equal(h.titre, 'Stock Cuisine');
  assert.equal(h.partie, 'Stock & Appro');
  assert.equal(h.contenu, 'Cet écran envoie les fournitures et les préparations (prépas) de la cuisine centrale vers vos services.\n\n'
    + '| Espace Cuisine | Stock de la cuisine centrale, production, livraisons internes vers les services |');
  const c = M.rendreFiche(vC, BALISEE);
  assert.equal(c.titre, 'Stock Site');
  assert.equal(c.partie, 'Stock & Réception');
  assert.match(c.contenu, /les produits fabriqués \(PF\) du site de production vers vos points de vente/);
});

test('rendreEntreeBase : titre et contenu rendus, mots-clés enrichis, autres champs intacts', () => {
  const origine = { id: 16, titre: 'Labo central', contenu: 'Le labo central produit pour les activités.', mots_cles: 'labo, production', categorie: 'concept', actif: true };
  const balisee = { ...origine, titre: '[[Nom:labo]][[acc:labo: central:]]', contenu: '[[Le:labo]][[acc:labo: central:]] produit pour [[le:activite:pl]].' };
  assert.deepEqual(M.rendreEntreeBase(vocabDefaut, balisee, COMPOSANTS_H), origine);
  const h = M.rendreEntreeBase(vH, balisee, COMPOSANTS_H);
  assert.equal(h.titre, 'Cuisine centrale');
  assert.equal(h.contenu, 'La cuisine centrale produit pour les services.');
  assert.equal(h.categorie, 'concept');
  assert.match(h.mots_cles, /^labo, production, cuisine centrale, /);
});

// ── 2. Variantes (I12) et requête commune ─────────────────────────────────────────────────────────────────────
test('slugVariantes : null pour tout vocabulaire par défaut (admin, restauration, café), le slug du profil sinon', () => {
  assert.equal(vCafe.estDefaut, true);
  assert.equal(M.slugVariantes(vocabDefaut, null), null, 'admin');
  assert.equal(M.slugVariantes(vocabDefaut, { slug: 'restauration' }), null, 'restauration');
  assert.equal(M.slugVariantes(vCafe, { slug: 'cafe' }), null, 'café : une variante « cafe » validée n\'est jamais lue');
  assert.equal(M.slugVariantes(undefined, { slug: 'hotellerie' }), null, 'sans vocabulaire');
  assert.equal(M.slugVariantes(vH, { slug: 'hotellerie' }), 'hotellerie');
  assert.equal(M.slugVariantes(vH, null), null, 'profil illisible : texte commun');
  assert.equal(M.slugVariantes(vH, {}), null);
});

const normaliser = (s) => s.replace(/\s+/g, ' ').trim();
test('requeteManuel : colonnes et ordre de listPublic (I9), variante « valide » du slug donné, ordre de lecture', () => {
  const { text, values } = M.requeteManuel('hotellerie');
  const t = normaliser(text);
  assert.deepEqual(values, ['hotellerie']);
  assert.match(t, /^SELECT s\.id, s\.slug, COALESCE\(d\.titre, s\.titre\) AS titre, s\.icone, s\.partie, s\.ordre, COALESCE\(d\.contenu, s\.contenu\) AS contenu, COALESCE\(d\.mots_cles, s\.mots_cles\) AS mots_cles, s\.ecran, s\.visible_gerant, s\.actif, s\.updated_at FROM manuel_sections s /);
  assert.match(t, /LEFT JOIN manuel_sections_domaine d ON d\.section_id = s\.id AND d\.domaine_slug = \$1 AND d\.statut = 'valide'/);
  assert.match(t, /WHERE s\.actif = true ORDER BY s\.ordre, s\.id$/);
  assert.doesNotMatch(t, /visible_gerant = true/);
  // Noms de sortie = colonnes de manuelController.listPublic, dans le même ordre.
  const sortie = t.slice(7, t.indexOf(' FROM ')).split(/,(?![^(]*\))/).map((c) => c.trim().split(/\s+AS\s+|\./).pop());
  assert.deepEqual(sortie, ['id', 'slug', 'titre', 'icone', 'partie', 'ordre', 'contenu', 'mots_cles', 'ecran', 'visible_gerant', 'actif', 'updated_at']);
  // Le slug est un paramètre (I8) : jamais écrit dans le texte.
  assert.doesNotMatch(t, /hotellerie/);
});

test('requeteManuel : slug nul ou vide → paramètre NULL (aucune jointure ne répond) ; gérant ; recherche', () => {
  assert.deepEqual(M.requeteManuel(null).values, [null]);
  assert.deepEqual(M.requeteManuel(undefined).values, [null]);
  assert.deepEqual(M.requeteManuel('').values, [null]);
  assert.match(normaliser(M.requeteManuel(null, { gerant: true }).text), /WHERE s\.actif = true AND s\.visible_gerant = true ORDER BY s\.ordre, s\.id$/);
  const r = normaliser(M.requeteManuel('hotellerie', { recherche: true }).text);
  assert.match(r, /^SELECT s\.slug, COALESCE\(d\.titre, s\.titre\) AS titre, s\.partie, COALESCE\(d\.contenu, s\.contenu\) AS contenu, COALESCE\(d\.mots_cles, s\.mots_cles\) AS mots_cles FROM manuel_sections s LEFT JOIN/);
  assert.match(r, /ORDER BY s\.ordre, s\.id$/);
});

test('requeteManuel : chaque colonne lue de la table des variantes existe dans la migration 193', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '193_manuel_sections_domaine.sql'), 'utf8');
  const colonnes = new Set([...sql.matchAll(/^\s{2}([a-z0-9_]+)\s+[A-Z]/gm)].map((m) => m[1]));
  for (const opts of [{}, { recherche: true }, { gerant: true }]) {
    for (const [, c] of M.requeteManuel('x', opts).text.matchAll(/\bd\.([a-z0-9_]+)/g)) assert.ok(colonnes.has(c), c);
  }
});

// ── 3. Mots-clés enrichis (R5.4) ──────────────────────────────────────────────────────────────────────────────
test('enrichirMotsCles : rien par défaut ni pour un domaine sans écart, même avec des composants ; vide tel quel', () => {
  const mc = 'stock labo, laboratoire, labo, activité, pt, transfert';
  assert.equal(M.enrichirMotsCles(vocabDefaut, mc, COMPOSANTS_H), mc);
  assert.equal(M.enrichirMotsCles(vCafe, mc, COMPOSANTS_H), mc);
  assert.equal(M.enrichirMotsCles(vH, '', COMPOSANTS_H), '');
  assert.equal(M.enrichirMotsCles(vH, null, COMPOSANTS_H), null);
  assert.equal(M.enrichirMotsCles(vH, undefined), undefined);
  // Aucune forme d'une clé que le domaine change : rien.
  assert.equal(M.enrichirMotsCles(vH, 'facture, tva, paiement', COMPOSANTS_H), 'facture, tva, paiement');
});

test('enrichirMotsCles en Hôtellerie : formes du domaine et libellés des composants, sans doublon', () => {
  const r = M.enrichirMotsCles(vH, 'transfert, labo, activité, bon de livraison', COMPOSANTS_H);
  assert.ok(r.startsWith('transfert, labo, activité, bon de livraison, '));
  const ajouts = r.split(', ').slice(4);
  assert.equal(new Set(ajouts.map((x) => x.toLowerCase())).size, ajouts.length, 'sans doublon');
  for (const a of ['service', 'services', 'cuisine centrale', 'cuisines centrales', 'cuisine', 'cuisines', 'livraison interne', 'livraisons internes',
    'restaurant', 'restaurants', 'room service', 'room services']) assert.ok(ajouts.includes(a), a);
  // Ordre : formes des clés (ordre du lexique), puis composants.
  assert.ok(ajouts.indexOf('service') < ajouts.indexOf('cuisine centrale'));
  assert.ok(ajouts.indexOf('livraisons internes') < ajouts.indexOf('restaurant'));
  // Libellé de moins de 4 lettres : « Bar », « Spa » (et leur pluriel) jamais ajoutés ; composant inactif ignoré.
  for (const a of ['bar', 'bars', 'spa', 'spas', 'économat', 'économats']) assert.ok(!ajouts.includes(a), a);
  // « cuisine » (composant labo) déjà ajouté par la forme courte : pas repris.
  assert.equal(ajouts.filter((x) => x === 'cuisine').length, 1);
});

test('enrichirMotsCles : « pt » en minuscules reconnu (sigle sans casse) ; mot déjà présent non repris', () => {
  const r = M.enrichirMotsCles(vH, 'production, pt', COMPOSANTS_H);
  assert.equal(r, 'production, pt, préparation, préparations, prépa, prépas');
  assert.equal(M.enrichirMotsCles(vH, 'pt, Préparation', []), 'pt, Préparation, préparations, prépa, prépas');
  // Mot entier seulement : « ptolémée » ne porte pas « pt ».
  assert.equal(M.enrichirMotsCles(vH, 'ptolémée', []), 'ptolémée');
});

test('enrichirMotsCles : libellés des composants seulement si une forme de la clé est une ENTRÉE entière', () => {
  // « stock labo » porte « labo » en mot entier (formes ajoutées) mais pas comme entrée : aucun libellé de composant.
  const r = M.enrichirMotsCles(vH, 'stock labo, inventaire', COMPOSANTS_H);
  assert.equal(r, 'stock labo, inventaire, cuisine centrale, cuisines centrales, cuisine, cuisines');
  // « labos » comme entrée : les libellés des composants de type labo actifs sont ajoutés (« Cuisine » déjà là).
  const r2 = M.enrichirMotsCles(vH, 'labos', [{ libelle: 'Pâtisserie', libellePluriel: 'Pâtisseries', typeTechnique: 'labo', actif: true }]);
  assert.equal(r2, 'labos, cuisine centrale, cuisines centrales, cuisine, cuisines, pâtisserie, pâtisseries');
  // Composant d'un type dont la clé n'est pas dans les mots-clés : rien.
  assert.equal(M.enrichirMotsCles(vH, 'labos', [{ libelle: 'Restaurant', libellePluriel: 'Restaurants', typeTechnique: 'activite', actif: true }]),
    'labos, cuisine centrale, cuisines centrales, cuisine, cuisines');
  // Type technique « acheteurs » → clé « acheteur ».
  const ach = M.enrichirMotsCles(vH, 'acheteurs', [{ libelle: 'Partenaire', libellePluriel: 'Partenaires', typeTechnique: 'acheteurs', actif: true }]);
  assert.ok(ach.startsWith(`acheteurs, ${vH.nom('acheteur')}, `), ach);
  assert.ok(ach.endsWith(', partenaire, partenaires'), ach);
  // Pluriel absent : le libellé seul.
  assert.equal(M.enrichirMotsCles(vH, 'gérant', [{ libelle: 'Chef de rang', libellePluriel: null, typeTechnique: 'gerant', actif: true }]),
    `gérant, ${[vH.nom('gerant'), vH.nom('gerant', true), vH.court('gerant'), vH.court('gerant', true)].filter((x, i, a) => a.indexOf(x) === i).join(', ')}, chef de rang`);
});

// ── 4. Balises ────────────────────────────────────────────────────────────────────────────────────────────────
test('verifierBalises : clé inconnue et argument refusés, balises valides admises (I11)', () => {
  assert.deepEqual(M.verifierBalises('[[nom:labbo]]'), [{ balise: '[[nom:labbo]]', raison: 'clé inconnue « labbo »' }]);
  const r = M.verifierBalises('[[nom:labo:xx]]');
  assert.equal(r.length, 1);
  assert.equal(r[0].balise, '[[nom:labo:xx]]');
  assert.deepEqual(M.verifierBalises('[[Nom:labo]]'), []);
  assert.deepEqual(M.verifierBalises(BALISEE.contenu), []);
  assert.deepEqual(M.verifierBalises('- [[[Pl:activite]] & [[pl:labo]]](#activites) [[acc:labo: central:]] [[det:labo:du]][[MAJ:labo]]'), []);
  assert.deepEqual(M.verifierBalises('[[ex:article:Ex. Farine]]'), []);
  assert.deepEqual(M.verifierBalises('[[ex:labbo:Ex. Farine]]').map((x) => x.raison), ['clé inconnue « labbo »']);
  assert.deepEqual(M.verifierBalises('[[Labo]] et [[foo:labo]]').map((x) => x.balise), ['[[Labo]]', '[[foo:labo]]']);
  assert.deepEqual(M.verifierBalises('sans balise'), []);
  assert.deepEqual(M.verifierBalises(null), []);
  // Ordre du texte, toutes les fautives.
  assert.deepEqual(M.verifierBalises('[[nom:zz]] [[Nom:labo]] [[nom:labo:xx]]').map((x) => x.balise), ['[[nom:zz]]', '[[nom:labo:xx]]']);
});

const fauxRes = () => {
  const r = { locals: {}, statut: null, corps: null };
  r.status = (s) => { r.statut = s; return r; };
  r.json = (c) => { r.corps = c; return r; };
  return r;
};
test('refuserBalises : 400 BALISE_INVALIDE avec vocabBrut posé et balises citées ; 400 BALISE_INTERDITE', () => {
  const res = fauxRes();
  const erreurs = M.verifierBalises('[[nom:labbo]]').map((e) => ({ champ: 'contenu', ...e }));
  M.refuserBalises(res, erreurs);
  assert.equal(res.statut, 400);
  assert.equal(res.locals.vocabBrut, true);
  assert.equal(res.corps.code, 'BALISE_INVALIDE');
  assert.deepEqual(res.corps.balises, [{ champ: 'contenu', balise: '[[nom:labbo]]', raison: 'clé inconnue « labbo »' }]);
  assert.match(res.corps.message, /\[\[nom:labbo\]\]/);
  const res2 = fauxRes();
  M.refuserBalises(res2, [{ champ: 'mots_cles', interdite: true }]);
  assert.equal(res2.statut, 400);
  assert.equal(res2.locals.vocabBrut, true);
  assert.equal(res2.corps.code, 'BALISE_INTERDITE');
  assert.match(res2.corps.message, /mots_cles/);
  const res3 = { status: (s) => { res3.s = s; return res3; }, json: (c) => c };
  M.refuserBalises(res3, []);
  assert.equal(res3.locals.vocabBrut, true, 'res.locals créé au besoin');
});

test('formesParDefaut : mot entier, plus longue forme d\'abord, sigle avec sa casse, balises masquées', () => {
  const o = M.formesParDefaut('Le Produit transformé (PT) du labo ; pt ; Labos et [[nom:labo]] ; laboratoire');
  assert.deepEqual(o.map((x) => [x.forme, x.cle, x.texte]), [
    ['Produit transformé', 'pt', 'Produit transformé'], ['PT', 'pt', 'PT'], ['Labo', 'labo', 'labo'],
    ['Labos', 'labo', 'Labos'], ['Laboratoire', 'labo_long', 'laboratoire'],
  ]);
  assert.equal(o[1].index, 'Le Produit transformé ('.length);
  // Forme portée par deux clés : la première du lexique (ingredient avant article_ingredient).
  assert.equal(M.formesParDefaut('un ingrédient')[0].cle, 'ingredient');
  assert.deepEqual(M.formesParDefaut('élaboration, collaborateur'), []);
  assert.deepEqual(M.formesParDefaut(''), []);
  assert.deepEqual(M.formesParDefaut(undefined), []);
});

// ── 5. Champs sans balises (R5.7.2, R5.8) ─────────────────────────────────────────────────────────────────────
const md5 = (s) => require('node:crypto').createHash('md5').update(s, 'utf8').digest('hex');
test('champsSansBalises : champ par champ (titre brut à côté d\'un contenu balisé), champ admis, champ sans terme', () => {
  const titreBrut = { ...BALISEE, titre: 'Stock Labo' };
  assert.deepEqual(M.champsSansBalises(titreBrut, 'manuel_sections', []), ['titre']);
  assert.deepEqual(M.champsSansBalises({ ...BALISEE, partie: 'Stock & Appro' }, 'manuel_sections', []), ['partie']);
  assert.deepEqual(M.champsSansBalises(BALISEE, 'manuel_sections', []), []);
  assert.deepEqual(M.champsSansBalises(ORIGINE, 'manuel_sections', []), ['titre', 'partie', 'contenu']);
  // Champ admis : même table, même champ, même md5.
  const admis = [{ table: 'manuel_sections', champ: 'titre', md5: md5('Stock Labo'), cle: 'stock-labo' }];
  assert.deepEqual(M.champsSansBalises(titreBrut, 'manuel_sections', admis), []);
  assert.deepEqual(M.champsSansBalises(titreBrut, 'ai_knowledge_base', admis), ['titre'], 'autre table : non admis');
  assert.deepEqual(M.champsSansBalises({ ...titreBrut, titre: 'Stock Labo ' }, 'manuel_sections', admis), ['titre'], 'autre md5');
  // Sans terme : rien à signaler.
  assert.deepEqual(M.champsSansBalises({ titre: 'Paiements', partie: 'Compte', contenu: 'Historique des paiements.' }, 'manuel_sections', []), []);
  // Base : titre et contenu seulement.
  assert.deepEqual(M.champsSansBalises({ titre: 'Transfert', contenu: 'Un [[nom:transfert]].', mots_cles: 'transfert', categorie: 'stock' }, 'ai_knowledge_base', []), ['titre']);
  assert.deepEqual(M.champsSansBalises(ORIGINE, 'inconnue', []), []);
  // Par défaut : la liste du dépôt (src/config/manuelSansBaliseAdmis.json, [] ou absente avant l'étape C).
  assert.deepEqual(M.champsSansBalises({ titre: 'Paiements', contenu: 'x' }, 'ai_knowledge_base'), []);
});

test('sansBalisesDesLignes : aucune balise dans la table → rien de signalé ; sinon champ par champ', () => {
  const brutes = [ORIGINE, { ...ORIGINE, slug: 'b' }];
  assert.deepEqual(M.sansBalisesDesLignes(brutes, 'manuel_sections', []), [[], []]);
  assert.deepEqual(M.sansBalisesDesLignes([BALISEE, ORIGINE], 'manuel_sections', []), [[], ['titre', 'partie', 'contenu']]);
  // Une balise dans contenu_defaut seulement (fiche modifiée dans l'admin) suffit à dire « manuel balisé ».
  const modifiee = { ...ORIGINE, contenu_defaut: BALISEE.contenu };
  assert.deepEqual(M.sansBalisesDesLignes([modifiee], 'manuel_sections', []), [['titre', 'partie', 'contenu']]);
  assert.deepEqual(M.sansBalisesDesLignes([], 'manuel_sections', []), []);
});

const fauxPool = (fiches, entrees, erreur) => ({
  query: async (sql) => {
    if (erreur) throw new Error(erreur);
    return { rows: /FROM manuel_sections/.test(sql) ? fiches : entrees };
  },
});
const capter = async (fn) => {
  const warn = console.warn; const lignes = [];
  console.warn = (...a) => lignes.push(a.join(' '));
  try { return { retour: await fn(), lignes }; } finally { console.warn = warn; }
};
test('controlerBalisesAuDemarrage : manuel non balisé, fiches et entrées sans balises, tout balisé, erreur avalée', async () => {
  const eBrute = { id: 1, titre: 'Transferts', contenu: 'Un transfert déplace du stock.' };
  const eBalisee = { id: 2, titre: '[[Nom:transfert:pl]]', contenu: '[[Un:transfert]] déplace [[du:stock]].' };
  // 1. Aucune balise en base : une seule ligne.
  let r = await capter(() => M.controlerBalisesAuDemarrage(fauxPool([ORIGINE], [eBrute]), []));
  assert.deepEqual(r.lignes, ['[manuel] manuel non balisé (aucune balise en base)']);
  assert.equal(r.retour, 1, 'nombre de lignes écrites');
  // 2. Balisé avec des restes : champ par champ, fiches et entrées.
  r = await capter(() => M.controlerBalisesAuDemarrage(fauxPool([BALISEE, { ...BALISEE, slug: 'transferts', titre: 'Transferts' }], [eBalisee, eBrute]), []));
  assert.deepEqual(r.lignes, [
    '[manuel] 1 fiche(s) sans balises : transferts (titre)',
    '[manuel] base de connaissances : 1 entrée(s) sans balises : Transferts (titre, contenu)',
  ]);
  // 3. Tout balisé : rien.
  r = await capter(() => M.controlerBalisesAuDemarrage(fauxPool([BALISEE], [eBalisee]), []));
  assert.deepEqual(r.lignes, []);
  // Jamais d'exception : une lecture impossible est écrite.
  r = await capter(() => M.controlerBalisesAuDemarrage(fauxPool([], [], 'connexion refusée'), []));
  assert.equal(r.lignes.length, 1);
  assert.match(r.lignes[0], /^\[manuel\] contrôle des balises impossible : connexion refusée$/);
  // Titre de la base cité rendu par défaut (une entrée au titre balisé mais au contenu brut).
  r = await capter(() => M.controlerBalisesAuDemarrage(fauxPool([BALISEE], [{ id: 3, titre: '[[Nom:transfert:pl]]', contenu: 'Le transfert.' }]), []));
  assert.deepEqual(r.lignes, [`[manuel] base de connaissances : 1 entrée(s) sans balises : ${rendre(vocabDefaut, '[[Nom:transfert:pl]]')} (contenu)`]);
});

test('module : exports de la spec §5.1', () => {
  for (const f of ['formesParDefaut', 'verifierBalises', 'refuserBalises', 'slugVariantes', 'enrichirMotsCles', 'rendreFiche',
    'rendreEntreeBase', 'champsSansBalises', 'requeteManuel', 'controlerBalisesAuDemarrage']) assert.equal(typeof M[f], 'function', f);
  assert.deepEqual(M.CHAMPS_BALISES, { manuel_sections: ['titre', 'partie', 'contenu'], ai_knowledge_base: ['titre', 'contenu'] });
});
