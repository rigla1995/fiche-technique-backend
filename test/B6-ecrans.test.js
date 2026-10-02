// Lot 2b, B6 — écrans (frontend) : le code des écrans est lu dans le dépôt frontend voisin, ses types effacés
// (node:module stripTypeScriptTypes), puis évalué avec le VRAI moteur (src/utils/vocab.js, généré depuis src/vocab).
//  - export Excel du tableau de bord : libelleCleExport rend EXACTEMENT human(clé) avec le vocabulaire par défaut,
//    sauf les 3 corrections de la spec §11.1.3 ; termes du domaine en Hôtellerie et Céramique ; catégories PT ;
//  - lignes de composants (Mon abonnement, Activités) : identiques par défaut, terme du domaine sinon (§4.2) ;
//  - profil de domaine (admin) : genre et élision toujours envoyés, 'auto' = null ; « < » et « > » retirés à la saisie.
// Sans le dépôt frontend à côté (fiche-technique-frontend), les tests sont sautés.
//   node --test test/B6-ecrans.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');

const { vocabDefaut, creerVocab, resoudreLexique, libelleComposant, libelleCategoriePt } = require('../src/utils/vocab');
const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');
const ESSAIS = require('./vocab-lexiques-test.json');

const FRONT = path.resolve(__dirname, '../../fiche-technique-frontend/src/components');
const sansFront = !fs.existsSync(FRONT) && 'dépôt frontend absent';
const hotellerie = creerVocab(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie));
const ceramique = creerVocab(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.ceramique));
const miroir = creerVocab(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.miroir));

// Morceau de code entre deux repères (le 1er inclus, le 2nd exclu), types effacés, évalué avec ses dépendances.
const charger = (fichier, debut, fin, noms, deps = {}) => {
  const texte = fs.readFileSync(path.join(FRONT, fichier), 'utf8').split('\r\n').join('\n');
  const i = texte.indexOf(debut);
  const j = texte.indexOf(fin, i + 1);
  assert.ok(i >= 0 && j > i, `${fichier} : repères introuvables (${debut} … ${fin})`);
  const js = stripTypeScriptTypes(texte.slice(i, j), { mode: 'strip' });
  const cles = Object.keys(deps);
  // eslint-disable-next-line no-new-func
  return new Function(...cles, `${js}\nreturn { ${noms.join(', ')} };`)(...cles.map((k) => deps[k]));
};

// Toutes les clés que GET /api/dashboard/v2 renvoie dans un export (KPI scalaires, listes, colonnes des listes),
// relevées dans dashboardV2Controller.js (I9 : elles ne changent pas).
const CLES_API = [
  // KPI (margesKpis, onglets achats, pertes, labo, acheteurs)
  'ca', 'cout_matiere', 'commissions', 'charges', 'marge_brute', 'marge_apres_com', 'marge_nette', 'food_cost_pct',
  'taux_marge_pct', 'taux_marge_nette_pct', 'nb_ventes', 'panier_moyen', 'pertes', 'pertes_pct_ca', 'valeur_stock',
  'ventes_acheteurs', 'nb_ventes_acheteurs', 'achats', 'nb_appros', 'receptions_transferts', 'nb_transferts',
  'stock_bas', 'total', 'pct_ca', 'appros', 'receptions_labo', 'nb_receptions_labo', 'production_pt',
  'nb_productions', 'transferts', 'cessions_labo', 'nb_cessions_labo', 'ventes_labo', 'nb_ventes_labo', 'nb_factures',
  'total_ht', 'total_tva', 'total_timbre', 'acheteurs_factures', 'commandes_en_attente', 'carnet_total', 'carnet_actifs',
  // listes
  'evolution', 'par_canal', 'par_categorie', 'par_type', 'top_marge', 'flop_marge', 'produits', 'achats_par_categorie',
  'achats_par_fournisseur', 'evolution_achats', 'stock_par_categorie', 'alertes_stock', 'inventaires', 'par_site',
  'top_articles', 'production_par_produit', 'pertes_par_type', 'top_transferts', 'transferts_par_activite',
  'top_acheteurs', 'par_statut',
  // colonnes
  'bucket', 'marge', 'canal', 'cout', 'qte', 'categorie', 'type', 'nom', 'part_ca_pct', 'fournisseur', 'valeur', 'nb',
  'article', 'quantite', 'seuil', 'activite', 'dernier', 'jours', 'site', 'acheteur', 'statut',
];
const CORRIGEES = { cout_matiere: 'Coût matière', activite: 'Activité', production_pt: 'Production PT' }; // spec §11.1.3

test('export du tableau de bord : par défaut, exactement human(clé) hors les 3 corrections du §11.1.3', { skip: sansFront }, () => {
  const { human, libellesClesExport, libelleCleExport } = charger('client/ClientDashboard.tsx',
    'const human = ', 'export default function ClientDashboard', ['human', 'libellesClesExport', 'libelleCleExport']);
  const table = Object.keys(libellesClesExport(vocabDefaut));
  for (const k of table) assert.ok(CLES_API.includes(k), `clé hors API : ${k}`);
  for (const k of CLES_API) {
    const attendu = CORRIGEES[k] ?? human(k);
    assert.equal(libelleCleExport(vocabDefaut, k), attendu, k);
  }
  assert.equal(human('cout_matiere'), 'Cout matiere');
  assert.equal(human('production_pt'), 'Production pt');
});

test('export du tableau de bord : aucun terme de la restauration en Hôtellerie, Céramique ni miroir', { skip: sansFront }, () => {
  const { libelleCleExport } = charger('client/ClientDashboard.tsx',
    'const human = ', 'export default function ClientDashboard', ['libelleCleExport']);
  // Formes que chacun des 3 lexiques d'essai remplace (rendu différent du défaut) : jamais dans un libellé.
  const cles = ['labo', 'activite', 'acheteur', 'article', 'transfert', 'food_cost', 'cout_matiere', 'marge', 'vente', 'perte', 'stock', 'inventaire', 'produit', 'fournisseur', 'appro', 'pt'];
  for (const [nom, voc] of [['hotellerie', hotellerie], ['ceramique', ceramique], ['miroir', miroir]]) {
    const changees = cles.filter((k) => voc.Nom(k) !== vocabDefaut.Nom(k));
    for (const k of CLES_API) {
      const rendu = libelleCleExport(voc, k);
      for (const c of changees) {
        for (const forme of [vocabDefaut.nom(c), vocabDefaut.pl(c)]) {
          const re = new RegExp(`(^|[^\\p{L}])${forme.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu');
          // « activite » sans accent (Transferts par activite) compte aussi
          const sansAccent = forme.normalize('NFD').replace(/[̀-ͯ]/g, '');
          const re2 = new RegExp(`(^|[^\\p{L}])${sansAccent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu');
          assert.ok(!re.test(rendu) && !re2.test(rendu), `${nom} : « ${rendu} » (clé ${k}) garde « ${forme} »`);
        }
      }
    }
  }
  assert.equal(libelleCleExport(hotellerie, 'transferts_par_activite'), `${hotellerie.Pl('transfert')} par ${hotellerie.nom('activite')}`);
  assert.equal(libelleCleExport(hotellerie, 'marge_nette'), `${hotellerie.Nom('marge')} ${hotellerie.acc('marge', 'net', 'nette')}`);
});

test('export du tableau de bord : catégories PT traduites à l’écriture de la cellule, rien d’autre', { skip: sansFront }, () => {
  const texte = fs.readFileSync(path.join(FRONT, 'client/ClientDashboard.tsx'), 'utf8');
  assert.match(texte, /cellValue\(k === 'categorie' && typeof v === 'string' \? libelleCategoriePt\(voc, v\) : v\)/);
  assert.equal(libelleCategoriePt(vocabDefaut, 'Produits Transformés Utilisables'), 'Produits Transformés Utilisables');
  assert.equal(libelleCategoriePt(hotellerie, 'Produits Transformés Utilisables'), hotellerie.Nom('cat_pt_utilisable'));
  assert.equal(libelleCategoriePt(hotellerie, 'Légumes'), 'Légumes');
  // Préfixes du filtre de catégories : clés *_abr, identiques par défaut.
  assert.match(texte, /vendable: voc\.Nom\('produit_vendable_abr'\), supplement: voc\.Nom\('supplement'\), valorise: voc\.Nom\('produit_valorise_abr'\)/);
  assert.equal(vocabDefaut.Nom('produit_vendable_abr'), 'P. Vendable');
  assert.equal(vocabDefaut.Nom('produit_valorise_abr'), 'P. Valorisé');
});

// Composants identité tels que la migration 192 les laisse, et deux composants de domaine.
const ACTIVITE = { id: 1, code: 'activite', libelle: 'Activité', libellePluriel: 'Activités', typeTechnique: 'activite', genre: 'f', elision: null, icone: '🏪', ordre: 1, actif: true };
const LABO = { id: 2, code: 'labo', libelle: 'Labo', libellePluriel: 'Labos', typeTechnique: 'labo', genre: 'm', elision: null, icone: '🏭', ordre: 2, actif: true };
const GERANT = { id: 3, code: 'gerant', libelle: 'Gérant', libellePluriel: 'Gérants', typeTechnique: 'gerant', genre: 'm', elision: null, icone: '👤', ordre: 3, actif: true };
const BASE = { id: 4, code: 'acheteurs', libelle: 'Base acheteurs', libellePluriel: 'Base acheteurs', typeTechnique: 'acheteurs', genre: 'f', elision: null, icone: '🤝', ordre: 4, actif: true };
const RESTAURANT = { id: 5, code: 'restaurant', libelle: 'Restaurant', libellePluriel: 'Restaurants', typeTechnique: 'activite', ordre: 5, actif: true };
const CUISINE = { id: 6, code: 'cuisine', libelle: 'Cuisine', libellePluriel: null, typeTechnique: 'labo', genre: 'f', ordre: 6, actif: true };

test('Mon abonnement : lignes de composants identiques par défaut, terme du domaine sinon', { skip: sansFront }, () => {
  const { lignesCapacite } = charger('client/MonAbonnementPage.tsx',
    'const iconeType = ', 'const MODE_INFO', ['lignesCapacite'], { libelleComposant });
  const config = { nbActivites: 2, nbLabos: 1, nbGerants: 3, nbAcheteurs: 20, composants: [
    { code: 'activite', libelle: 'Activité', libellePluriel: 'Activités', typeTechnique: 'activite', nb: 2 },
    { code: 'labo', libelle: 'Labo', libellePluriel: 'Labos', typeTechnique: 'labo', nb: 1 },
    { code: 'gerant', libelle: 'Gérant', libellePluriel: 'Gérants', typeTechnique: 'gerant', nb: 3 },
    { code: 'acheteurs', libelle: 'Base acheteurs', libellePluriel: 'Base acheteurs', typeTechnique: 'acheteurs', nb: 20 },
    { code: 'restaurant', libelle: 'Restaurant', libellePluriel: 'Restaurants', typeTechnique: 'activite', nb: 2 },
    { code: 'cuisine', libelle: 'Cuisine', libellePluriel: null, typeTechnique: 'labo', nb: 2 },
  ] };
  const domaine = { composants: [ACTIVITE, LABO, GERANT, BASE, RESTAURANT, CUISINE] };
  // Avant : c.nb > 1 ? (c.libellePluriel || c.libelle) : c.libelle
  const avant = (c) => (c.nb > 1 ? (c.libellePluriel || c.libelle) : c.libelle);
  const lignes = lignesCapacite(config, domaine, vocabDefaut);
  assert.deepEqual(lignes.map((l) => l.label), config.composants.map(avant));
  assert.deepEqual(lignes.map((l) => l.label), ['Activités', 'Labo', 'Gérants', 'Base acheteurs', 'Restaurants', 'Cuisine']);
  // Sans menu de domaine (repli sur les composants souscrits) : même rendu.
  assert.deepEqual(lignesCapacite(config, null, vocabDefaut).map((l) => l.label), config.composants.map(avant));
  const h = lignesCapacite(config, domaine, hotellerie).map((l) => l.label);
  assert.deepEqual(h, [hotellerie.Pl('activite'), hotellerie.Nom('labo'), hotellerie.Pl('gerant'), `Base ${hotellerie.court('acheteur', true)}`, 'Restaurants', 'Cuisine']);
  // Composant identité renommé par l'admin : son libellé, quel que soit le lexique.
  const renomme = { ...config, composants: [{ code: 'activite', libelle: 'Salle', libellePluriel: 'Salles', typeTechnique: 'activite', nb: 2 }] };
  assert.equal(lignesCapacite(renomme, null, hotellerie)[0].label, 'Salles');
});

test('Activités : badge, options et répartition des composants identiques par défaut', { skip: sansFront }, () => {
  const { composantLabel, repartitionComposants } = charger('client/ActivitesPage.tsx',
    'const composantLabel = ', 'interface Props', ['composantLabel', 'repartitionComposants'], { libelleComposant });
  const comps = [ACTIVITE, RESTAURANT];
  const unites = [{ composant: { id: 1 } }, { composant: { id: 1 } }, { composant: { id: 5 } }, { composant: null }];
  // Avant : `${icone} ${libelle}` et `${n} ${n > 1 ? (libellePluriel || libelle) : libelle}`
  assert.equal(composantLabel(vocabDefaut, ACTIVITE), '🏪 Activité');
  assert.equal(composantLabel(vocabDefaut, RESTAURANT), 'Restaurant');
  assert.equal(repartitionComposants(unites, comps, vocabDefaut), '3 Activités · 1 Restaurant');
  assert.equal(repartitionComposants([{ composant: { id: 6 } }, { composant: { id: 6 } }], [CUISINE], vocabDefaut), '2 Cuisine');
  assert.equal(composantLabel(hotellerie, ACTIVITE), `🏪 ${hotellerie.Nom('activite')}`);
  assert.equal(repartitionComposants(unites, comps, ceramique), `3 ${ceramique.Pl('activite')} · 1 Restaurant`);
});

test('Profil de domaine (admin) : genre et élision toujours envoyés, auto = null', { skip: sansFront }, () => {
  let seq = 0;
  const { toRows, rowsToPayload } = charger('admin/AdminDomaineEditPage.tsx',
    'function toRows(', 'function toLexiqueState(', ['toRows', 'rowsToPayload'], { nextKey: () => `k${++seq}` });
  const lus = toRows([
    { ...ACTIVITE },
    { ...CUISINE, elision: 'auto' },
    { ...RESTAURANT },
    { code: 'huilerie', libelle: 'Huilerie', typeTechnique: 'labo', genre: 'f', elision: true, ordre: 7, actif: true },
    { code: 'housekeeping', libelle: 'Housekeeping', typeTechnique: 'labo', genre: 'm', elision: false, ordre: 8, actif: true },
  ]);
  // triés par ordre, comme le serveur : Activité (1), Restaurant (5), Cuisine (6), Huilerie (7), Housekeeping (8)
  assert.deepEqual(lus.map((r) => [r.code, r.genre, r.elision]), [['activite', 'f', null], ['restaurant', 'm', null], ['cuisine', 'f', null], ['huilerie', 'f', true], ['housekeeping', 'm', false]]);
  const envoyes = rowsToPayload(lus);
  for (const c of envoyes) {
    assert.ok('genre' in c && 'elision' in c, `${c.code} : genre et élision envoyés`);
    assert.ok(c.genre === 'm' || c.genre === 'f');
    assert.ok(c.elision === true || c.elision === false || c.elision === null);
  }
  assert.deepEqual(envoyes.map((c) => c.elision), [null, null, null, true, false]);
  const { sansChevrons: retirer } = charger('admin/AdminDomaineEditPage.tsx',
    'const sansChevrons = ', '// Le domaine par défaut', ['sansChevrons']);
  assert.equal(retirer('<b>Cuisine</b> > Bar'), 'bCuisine/b  Bar');
  assert.equal(retirer('Cuisine & "chaud"'), 'Cuisine & "chaud"');
});
