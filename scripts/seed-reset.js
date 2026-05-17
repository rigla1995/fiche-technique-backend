/**
 * seed-reset.js
 *
 * 1. Supprime TOUS les clients (CASCADE → toutes leurs données)
 * 2. Vide les tables du catalogue global (ingredients, categories, domaines)
 * 3. Re-seed : 3 domaines | toutes les unités | toutes les catégories | ~180 ingrédients (Tunisie)
 *
 * Run : node scripts/seed-reset.js
 */

require('dotenv').config();
const pool = require('../src/config/database');

// ─── 1. RESET ────────────────────────────────────────────────────────────────

async function resetDatabase(c) {
  console.log('\n🗑  Reset base de données…');

  // Supprimer tous les clients (CASCADE supprime abonnements, labos, activités, stock…)
  await c.query(`DELETE FROM utilisateurs WHERE role = 'client'`);
  console.log('   ✓ Clients supprimés');

  // Vider le catalogue global (ordre important pour les FK)
  await c.query(`DELETE FROM ingredient_domaines`);
  await c.query(`DELETE FROM ingredients WHERE client_id IS NULL`);
  await c.query(`DELETE FROM categories`);
  await c.query(`DELETE FROM domaines_activite`);
  await c.query(`DELETE FROM unites WHERE client_id IS NULL`);
  console.log('   ✓ Catalogue global vidé');
}

// ─── 2. SEED DOMAINES ─────────────────────────────────────────────────────────

async function seedDomaines(c) {
  console.log('\n🏢 Domaines d\'activité…');
  const { rows } = await c.query(`
    INSERT INTO domaines_activite (nom, slug, description) VALUES
      ('Restauration', 'restauration', 'Restaurants, traiteurs, cafétérias, food court'),
      ('Boulangerie',  'boulangerie',  'Boulangeries, pâtisseries, viennoiseries'),
      ('Café',         'cafe',         'Cafés, salons de thé, espresso bars')
    RETURNING id, slug
  `);
  const domaines = Object.fromEntries(rows.map(r => [r.slug, r.id]));
  console.log(`   ✓ ${rows.length} domaines créés`);
  return domaines;
}

// ─── 3. SEED UNITÉS ──────────────────────────────────────────────────────────

async function seedUnites(c) {
  console.log('\n⚖  Unités…');
  const unites = [
    // Poids
    'g', 'kg', 'quintal',
    // Volume
    'ml', 'cl', 'dl', 'L',
    // Conditionnement
    'pièce', 'douzaine', 'lot', 'plateau',
    // Portions & découpes
    'portion', 'tranche', 'bouquet', 'botte', 'feuille',
    // Emballages
    'sachet', 'boîte', 'bouteille', 'bidon', 'baril', 'sac', 'carton',
    'barquette', 'rouleau', 'canette', 'tube', 'pot',
    // Mesures cuisine
    'cuillère à café', 'cuillère à soupe', 'tasse', 'verre', 'filet',
    // Boulangerie
    'plaque', 'moule',
  ];

  for (const nom of unites) {
    await c.query(
      `INSERT INTO unites (nom, client_id) SELECT $1, NULL
       WHERE NOT EXISTS (SELECT 1 FROM unites WHERE nom = $1 AND client_id IS NULL)`,
      [nom]
    );
  }
  console.log(`   ✓ ${unites.length} unités créées`);
}

// ─── 4. SEED CATÉGORIES ───────────────────────────────────────────────────────

async function seedCategories(c, domaines) {
  console.log('\n🗂  Catégories…');

  const restauration = [
    'Viandes & Volailles',
    'Abats & Triperie',
    'Poissons & Fruits de mer',
    'Légumes frais',
    'Fruits frais',
    'Légumineuses',
    'Farines & Féculents',
    'Riz, Pâtes & Céréales',
    'Épices & Aromates',
    'Corps gras & Huiles',
    'Produits laitiers & Œufs',
    'Sauces, Condiments & Conserves',
    'Pain & Galettes',
    'Emballages restauration',
    'Boissons restauration',
  ];

  const boulangerie = [
    'Farines & Semoules',
    'Sucres & Confiseries',
    'Corps gras boulangerie',
    'Produits laitiers & Œufs boulangerie',
    'Levures & Agents levants',
    'Épices & Arômes boulangerie',
    'Chocolat & Cacao',
    'Fruits secs & Oléagineux',
    'Emballages boulangerie',
    'Divers boulangerie',
  ];

  const cafe = [
    'Cafés & Thés',
    'Sirops & Arômes café',
    'Produits laitiers café',
    'Sucres & Édulcorants',
    'Snacking & Viennoiseries',
    'Jus & Boissons froides',
    'Emballages café',
    'Consommables café',
  ];

  const catMap = {};

  for (const [slug, noms] of [
    ['restauration', restauration],
    ['boulangerie', boulangerie],
    ['cafe', cafe],
  ]) {
    for (const nom of noms) {
      const { rows: [cat] } = await c.query(
        `INSERT INTO categories (nom, domaine_id) VALUES ($1, $2)
         ON CONFLICT (nom) DO UPDATE SET domaine_id = EXCLUDED.domaine_id
         RETURNING id`,
        [nom, domaines[slug]]
      );
      catMap[nom] = cat.id;
    }
  }

  const total = restauration.length + boulangerie.length + cafe.length;
  console.log(`   ✓ ${total} catégories créées`);
  return catMap;
}

// ─── 5. SEED INGRÉDIENTS ──────────────────────────────────────────────────────

// Helper: insert global ingredient + link domaine
async function addIng(c, nom, uniteNom, catNom, domaineId, unitMap, catMap) {
  const uniteId = unitMap[uniteNom];
  const catId   = catMap[catNom];
  if (!uniteId) { console.warn(`   ⚠ unité inconnue: "${uniteNom}" pour "${nom}"`); return; }
  if (!catId)   { console.warn(`   ⚠ catégorie inconnue: "${catNom}" pour "${nom}"`); return; }

  const { rows } = await c.query(
    `INSERT INTO ingredients (nom, unite_id, categorie_id)
     SELECT $1, $2, $3
     WHERE NOT EXISTS (SELECT 1 FROM ingredients WHERE nom = $1 AND client_id IS NULL)
     RETURNING id`,
    [nom, uniteId, catId]
  );
  if (rows.length > 0 && domaineId) {
    await c.query(
      `INSERT INTO ingredient_domaines (ingredient_id, domaine_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [rows[0].id, domaineId]
    );
  }
}

async function seedIngredients(c, domaines, catMap, unitMap) {
  console.log('\n🥬 Ingrédients…');
  let count = 0;

  const rest = domaines['restauration'];
  const boul = domaines['boulangerie'];
  const cafe = domaines['cafe'];

  // ── RESTAURATION ──────────────────────────────────────────────────────────

  // Viandes & Volailles
  const viandes = [
    ['Poulet entier',                     'kg'],
    ['Escalopes de poulet',               'kg'],
    ['Cuisse de poulet',                  'kg'],
    ['Ailes de poulet',                   'kg'],
    ['Blanc de poulet (filet)',            'kg'],
    ['Poulet haché',                      'kg'],
    ['Foie de poulet',                    'kg'],
    ['Gésiers de poulet',                 'kg'],
    ['Bœuf haché (façon kefta)',          'kg'],
    ['Jarret de bœuf',                    'kg'],
    ['Côtes de bœuf',                     'kg'],
    ['Escalopes de veau',                 'kg'],
    ['Foie de veau',                      'kg'],
    ['Côtelettes d\'agneau',              'kg'],
    ['Gigot d\'agneau',                   'kg'],
    ['Épaule d\'agneau',                  'kg'],
    ['Agneau haché',                      'kg'],
    ['Merguez fraîche',                   'kg'],
    ['Kefta (boulettes épicées)',         'kg'],
    ['Saucisson tunisien (Osbane sec)',   'kg'],
    ['Dinde (escalopes)',                 'kg'],
    ['Lapin entier',                      'kg'],
  ];
  for (const [n, u] of viandes) { await addIng(c, n, u, 'Viandes & Volailles', rest, unitMap, catMap); count++; }

  // Abats
  const abats = [
    ['Tripes d\'agneau (Karcha)',     'kg'],
    ['Tête d\'agneau',               'kg'],
    ['Langue de bœuf',               'kg'],
    ['Cœur de bœuf',                 'kg'],
    ['Rognons d\'agneau',            'kg'],
    ['Cervelle d\'agneau',           'kg'],
  ];
  for (const [n, u] of abats) { await addIng(c, n, u, 'Abats & Triperie', rest, unitMap, catMap); count++; }

  // Poissons & Fruits de mer
  const poissons = [
    ['Sardines fraîches',            'kg'],
    ['Maquereau frais',              'kg'],
    ['Loup de mer (bar)',            'kg'],
    ['Daurade royale',               'kg'],
    ['Mulet frais',                  'kg'],
    ['Rouget barbet',                'kg'],
    ['Sole fraîche',                 'kg'],
    ['Thon frais (bonite)',          'kg'],
    ['Mérou (Méroua)',               'kg'],
    ['Bream (Pageot)',               'kg'],
    ['Crevettes fraîches',           'kg'],
    ['Calamars frais',               'kg'],
    ['Poulpe frais',                 'kg'],
    ['Moules fraîches',              'kg'],
    ['Palourdes (Clams)',            'kg'],
    ['Langoustines fraîches',        'kg'],
    ['Homard entier',                'kg'],
    ['Thon en conserve',             'boîte'],
    ['Sardines en conserve',         'boîte'],
    ['Anchois à l\'huile',           'boîte'],
    ['Maquereau en conserve',        'boîte'],
  ];
  for (const [n, u] of poissons) { await addIng(c, n, u, 'Poissons & Fruits de mer', rest, unitMap, catMap); count++; }

  // Légumes frais
  const legumes = [
    ['Pommes de terre',              'kg'],
    ['Tomates fraîches',             'kg'],
    ['Oignons',                      'kg'],
    ['Carottes',                     'kg'],
    ['Courgettes',                   'kg'],
    ['Poivrons rouges',              'kg'],
    ['Poivrons verts',               'kg'],
    ['Aubergines',                   'kg'],
    ['Ail (têtes)',                   'kg'],
    ['Piment rouge frais',           'kg'],
    ['Piment vert frais',            'kg'],
    ['Navets',                       'kg'],
    ['Chou blanc',                   'kg'],
    ['Chou-fleur',                   'kg'],
    ['Céleri branche',               'botte'],
    ['Fenouil',                      'kg'],
    ['Épinards frais',               'kg'],
    ['Blettes',                      'kg'],
    ['Artichauds',                   'kg'],
    ['Brocolis',                     'kg'],
    ['Concombres',                   'kg'],
    ['Salade verte (Romaine)',       'kg'],
    ['Salade iceberg',               'kg'],
    ['Persil frais',                 'botte'],
    ['Coriandre fraîche',            'botte'],
    ['Menthe fraîche',               'botte'],
    ['Basilic frais',                'botte'],
    ['Potiron (Courge)',             'kg'],
    ['Haricots verts',               'kg'],
    ['Petits pois (surgelés)',       'kg'],
    ['Maïs en grains (conserve)',    'boîte'],
  ];
  for (const [n, u] of legumes) { await addIng(c, n, u, 'Légumes frais', rest, unitMap, catMap); count++; }

  // Fruits frais
  const fruits = [
    ['Citrons',                      'kg'],
    ['Oranges',                      'kg'],
    ['Pommes',                       'kg'],
    ['Poires',                       'kg'],
    ['Bananes',                      'kg'],
    ['Raisins (blanc ou noir)',      'kg'],
    ['Figues fraîches',              'kg'],
    ['Dattes (Deglet Nour)',         'kg'],
    ['Grenades',                     'kg'],
    ['Pastèque',                     'kg'],
    ['Melon',                        'kg'],
    ['Pêches',                       'kg'],
    ['Abricots frais',               'kg'],
    ['Fraises',                      'kg'],
    ['Framboises',                   'kg'],
  ];
  for (const [n, u] of fruits) { await addIng(c, n, u, 'Fruits frais', rest, unitMap, catMap); count++; }

  // Légumineuses
  const legumineuses = [
    ['Pois chiches secs',            'kg'],
    ['Lentilles corail',             'kg'],
    ['Lentilles vertes',             'kg'],
    ['Haricots blancs secs',         'kg'],
    ['Fèves sèches',                 'kg'],
    ['Fèves fraîches',               'kg'],
    ['Pois cassés',                  'kg'],
    ['Haricots rouges secs',         'kg'],
  ];
  for (const [n, u] of legumineuses) { await addIng(c, n, u, 'Légumineuses', rest, unitMap, catMap); count++; }

  // Farines & Féculents (restauration)
  const farinesRest = [
    ['Farine blanche T55',           'kg'],
    ['Semoule fine',                 'kg'],
    ['Semoule grosse',               'kg'],
    ['Semoule extra-fine',           'kg'],
    ['Fécule de maïs (Maïzena)',     'kg'],
    ['Farine de blé complet',        'kg'],
    ['Farine de pois chiche',        'kg'],
  ];
  for (const [n, u] of farinesRest) { await addIng(c, n, u, 'Farines & Féculents', rest, unitMap, catMap); count++; }

  // Riz, Pâtes & Céréales
  const cereales = [
    ['Riz long grain',               'kg'],
    ['Riz basmati',                  'kg'],
    ['Riz rond (Calrose)',           'kg'],
    ['Pâtes (spaghetti)',            'kg'],
    ['Pâtes (vermicelles fins)',     'kg'],
    ['Pâtes (macaroni)',             'kg'],
    ['Pâtes (tagliatelles)',         'kg'],
    ['M\'hamsa (pâtes à main tunisiennes)', 'kg'],
    ['Couscous moyen',               'kg'],
    ['Couscous fin',                 'kg'],
    ['Couscous gros',                'kg'],
    ['Borghol (blé concassé)',       'kg'],
    ['Orge perlée',                  'kg'],
  ];
  for (const [n, u] of cereales) { await addIng(c, n, u, 'Riz, Pâtes & Céréales', rest, unitMap, catMap); count++; }

  // Épices & Aromates
  const epices = [
    ['Sel fin',                      'kg'],
    ['Sel de mer gros',              'kg'],
    ['Cumin moulu',                  'kg'],
    ['Coriandre moulue',             'kg'],
    ['Paprika doux',                 'kg'],
    ['Paprika fort',                 'kg'],
    ['Piment de Cayenne',            'kg'],
    ['Curcuma',                      'kg'],
    ['Poivre noir moulu',            'kg'],
    ['Poivre blanc moulu',           'kg'],
    ['Cannelle moulue',              'kg'],
    ['Gingembre moulu',              'kg'],
    ['Tabel (mélange épices tunisien)', 'kg'],
    ['Ras el hanout',                'kg'],
    ['Za\'atar',                     'kg'],
    ['Safran (filaments)',           'g'],
    ['Clous de girofle',             'g'],
    ['Noix de muscade',              'g'],
    ['Anis vert (Habba Hlawa)',      'kg'],
    ['Carvi (Kamoun)',               'kg'],
    ['Fenugrec (Helba)',             'kg'],
    ['Harissa sèche (poudre)',       'kg'],
    ['Laurier (feuilles)',           'g'],
    ['Thym séché',                   'kg'],
    ['Romarin séché',                'kg'],
    ['Piment biber (doux)',          'kg'],
  ];
  for (const [n, u] of epices) { await addIng(c, n, u, 'Épices & Aromates', rest, unitMap, catMap); count++; }

  // Corps gras & Huiles
  const huiles = [
    ['Huile végétale (tournesol)',   'L'],
    ['Huile d\'olive extra vierge',  'L'],
    ['Huile d\'olive vierge',        'L'],
    ['Beurre doux',                  'kg'],
    ['Beurre salé',                  'kg'],
    ['Margarine (plaque)',           'kg'],
    ['Graisse végétale (Végétaline)','kg'],
    ['Beurre clarifié (Smen)',       'kg'],
    ['Huile d\'argan (cuisine)',     'L'],
    ['Huile de sésame',              'L'],
  ];
  for (const [n, u] of huiles) { await addIng(c, n, u, 'Corps gras & Huiles', rest, unitMap, catMap); count++; }

  // Produits laitiers & Œufs
  const laitiers = [
    ['Lait entier (frais)',          'L'],
    ['Lait demi-écrémé',            'L'],
    ['Lait écrémé en poudre',       'kg'],
    ['Crème fraîche (35%)',          'L'],
    ['Yaourt nature',                'kg'],
    ['Fromage fondu (Kiri)',         'boîte'],
    ['Fromage blanc (frais)',        'kg'],
    ['Ricotta',                      'kg'],
    ['Mozzarella',                   'kg'],
    ['Gruyère râpé',                 'kg'],
    ['Parmesan râpé',                'kg'],
    ['Jben (fromage frais tunisien)','kg'],
    ['Œufs frais (boîte 30)',       'boîte'],
    ['Lben (lait caillé)',           'L'],
  ];
  for (const [n, u] of laitiers) { await addIng(c, n, u, 'Produits laitiers & Œufs', rest, unitMap, catMap); count++; }

  // Sauces, Condiments & Conserves
  const sauces = [
    ['Concentré de tomate',          'kg'],
    ['Double concentré de tomate',   'boîte'],
    ['Sauce tomate (coulis)',         'boîte'],
    ['Harissa (conserve)',           'boîte'],
    ['Harissa maison (fraîche)',     'kg'],
    ['Olives noires (conserve)',     'boîte'],
    ['Olives vertes (conserve)',     'boîte'],
    ['Câpres (conserve)',            'boîte'],
    ['Cornichons (conserve)',        'boîte'],
    ['Piments marinés (Felfel)',     'boîte'],
    ['Vinaigre blanc',              'L'],
    ['Vinaigre de cidre',           'L'],
    ['Mayonnaise',                  'kg'],
    ['Moutarde',                    'kg'],
    ['Ketchup',                     'kg'],
    ['Sauce soja',                  'L'],
    ['Sauce Worcestershire',        'L'],
    ['Fond de veau (cube)',         'boîte'],
    ['Bouillon de volaille (cube)', 'boîte'],
    ['Bouillon de poisson (cube)',  'boîte'],
  ];
  for (const [n, u] of sauces) { await addIng(c, n, u, 'Sauces, Condiments & Conserves', rest, unitMap, catMap); count++; }

  // Pain & Galettes
  const pain = [
    ['Pain baguette',               'pièce'],
    ['Pain de mie (miche)',         'pièce'],
    ['Khobz Tabouna (pain traditionnel)', 'pièce'],
    ['Khobz Arabe (pain plat)',     'pièce'],
    ['Pain complet',                'pièce'],
    ['M\'lawi (galette feuilletée)','pièce'],
    ['M\'semen (galette carrée)',   'pièce'],
    ['Chapati (pain indien plat)',  'pièce'],
  ];
  for (const [n, u] of pain) { await addIng(c, n, u, 'Pain & Galettes', rest, unitMap, catMap); count++; }

  // Emballages restauration
  const embRest = [
    ['Boîtes à emporter (small 750ml)', 'pièce'],
    ['Boîtes à emporter (large 1L)',    'pièce'],
    ['Boîtes à emporter (XL 1.5L)',     'pièce'],
    ['Barquettes aluminium (moyenne)', 'pièce'],
    ['Barquettes aluminium (grande)',  'pièce'],
    ['Assiettes jetables (compartiments)', 'lot'],
    ['Couverts jetables (set fourchette-couteau-cuillère)', 'lot'],
    ['Gobelets jetables 33cl',         'lot'],
    ['Sacs kraft (emporter, petit)',   'lot'],
    ['Sacs kraft (emporter, grand)',   'lot'],
    ['Papier aluminium (rouleau)',     'rouleau'],
    ['Film alimentaire (rouleau)',     'rouleau'],
    ['Serviettes en papier (paquet)',  'lot'],
    ['Pailles (paquet)',               'lot'],
    ['Cure-dents (boîte)',             'boîte'],
    ['Sacs plastique (100 pcs)',       'lot'],
  ];
  for (const [n, u] of embRest) { await addIng(c, n, u, 'Emballages restauration', rest, unitMap, catMap); count++; }

  // Boissons restauration
  const boissonRest = [
    ['Eau minérale 0.5L',           'bouteille'],
    ['Eau minérale 1.5L',           'bouteille'],
    ['Eau gazeuse 0.5L',            'bouteille'],
    ['Jus d\'orange pur (brique)',  'bouteille'],
    ['Jus de pomme (brique)',       'bouteille'],
    ['Sirop de grenadine',          'L'],
    ['Sirop de menthe',             'L'],
    ['Lben (lait caillé, emballé)', 'bouteille'],
    ['Coca-Cola (canette)',         'canette'],
    ['Pepsi (canette)',             'canette'],
    ['Boga (soda tunisien, canette)', 'canette'],
    ['Bière sans alcool (canette)', 'canette'],
  ];
  for (const [n, u] of boissonRest) { await addIng(c, n, u, 'Boissons restauration', rest, unitMap, catMap); count++; }

  // ── BOULANGERIE ──────────────────────────────────────────────────────────

  const farineBoul = [
    ['Farine T45 (pâtisserie fine)',   'kg'],
    ['Farine T55 (boulangerie)',       'kg'],
    ['Farine T65 (tradition)',         'kg'],
    ['Farine T80 (semi-complète)',     'kg'],
    ['Farine T150 (intégrale)',        'kg'],
    ['Semoule fine (boulangerie)',     'kg'],
    ['Semoule grosse (couscous)',      'kg'],
    ['Semoule extra-fine (brik)',      'kg'],
    ['Fécule de maïs',                'kg'],
    ['Farine de maïs',                'kg'],
    ['Farine de riz',                 'kg'],
    ['Farine d\'épeautre',            'kg'],
    ['Farine d\'avoine',              'kg'],
    ['Fécule de pomme de terre',      'kg'],
  ];
  for (const [n, u] of farineBoul) { await addIng(c, n, u, 'Farines & Semoules', boul, unitMap, catMap); count++; }

  const sucreBoul = [
    ['Sucre blanc semoule',           'kg'],
    ['Sucre glace',                   'kg'],
    ['Sucre roux (cassonade)',        'kg'],
    ['Sucre perlé',                   'kg'],
    ['Sucre inverti (trimoline)',      'kg'],
    ['Miel (boulangerie)',            'kg'],
    ['Glucose (sirop)',               'kg'],
    ['Fructose',                      'kg'],
    ['Fondant pâtissier',             'kg'],
    ['Pâte d\'amande (50% amandes)', 'kg'],
  ];
  for (const [n, u] of sucreBoul) { await addIng(c, n, u, 'Sucres & Confiseries', boul, unitMap, catMap); count++; }

  const corpsBoul = [
    ['Beurre doux (82%)',             'kg'],
    ['Beurre sec de tourage (84%)',   'kg'],
    ['Margarine feuilletage',         'kg'],
    ['Margarine brioche',             'kg'],
    ['Huile de tournesol (boul.)',    'L'],
    ['Shortening végétal (Crisco)',   'kg'],
    ['Huile d\'olive (boul.)',        'L'],
  ];
  for (const [n, u] of corpsBoul) { await addIng(c, n, u, 'Corps gras boulangerie', boul, unitMap, catMap); count++; }

  const laitierBoul = [
    ['Lait entier (boul.)',           'L'],
    ['Lait écrémé en poudre (boul.)', 'kg'],
    ['Crème fraîche 35% (boul.)',     'L'],
    ['Yaourt nature (boul.)',         'kg'],
    ['Œufs frais extra-frais',       'boîte'],
    ['Jaunes d\'œufs pasteurisés',   'kg'],
    ['Blancs d\'œufs pasteurisés',   'kg'],
    ['Fromage frais (boul.)',         'kg'],
  ];
  for (const [n, u] of laitierBoul) { await addIng(c, n, u, 'Produits laitiers & Œufs boulangerie', boul, unitMap, catMap); count++; }

  const levures = [
    ['Levure fraîche de boulanger',   'kg'],
    ['Levure sèche instantanée',      'kg'],
    ['Levure chimique (baking powder)', 'kg'],
    ['Bicarbonate de soude',          'kg'],
    ['Ammoniac (carbonate d\'ammonium)', 'kg'],
    ['Pectine',                       'kg'],
    ['Crème de tartre',               'kg'],
  ];
  for (const [n, u] of levures) { await addIng(c, n, u, 'Levures & Agents levants', boul, unitMap, catMap); count++; }

  const aromBoul = [
    ['Extrait de vanille pur',        'L'],
    ['Vanilline (poudre)',             'kg'],
    ['Arôme fleur d\'oranger',        'L'],
    ['Eau de fleur d\'oranger (Mazhar)', 'L'],
    ['Eau de rose',                   'L'],
    ['Arôme amande amère',            'L'],
    ['Cannelle moulue (boul.)',       'kg'],
    ['Cardamome moulue',              'kg'],
    ['Anis étoilé moulu',             'kg'],
    ['Zeste de citron (poudre)',      'kg'],
    ['Zeste d\'orange (poudre)',      'kg'],
    ['Café soluble (pour recettes)',  'kg'],
  ];
  for (const [n, u] of aromBoul) { await addIng(c, n, u, 'Épices & Arômes boulangerie', boul, unitMap, catMap); count++; }

  const choco = [
    ['Chocolat noir 70%',             'kg'],
    ['Chocolat noir 55% (couverture)', 'kg'],
    ['Chocolat au lait (couverture)', 'kg'],
    ['Chocolat blanc (couverture)',   'kg'],
    ['Poudre de cacao non sucré',     'kg'],
    ['Pâte de cacao',                 'kg'],
    ['Beurre de cacao',               'kg'],
    ['Pralinoise (pâte pralinée)',    'kg'],
    ['Pépites de chocolat noir',      'kg'],
    ['Vermicelles chocolat',          'kg'],
    ['Feuillantine (brisures crêpes dentelles)', 'kg'],
  ];
  for (const [n, u] of choco) { await addIng(c, n, u, 'Chocolat & Cacao', boul, unitMap, catMap); count++; }

  const fruitsecs = [
    ['Amandes entières blanchies',    'kg'],
    ['Amandes effilées',              'kg'],
    ['Amandes moulues (poudre)',      'kg'],
    ['Noisettes entières',            'kg'],
    ['Noisettes hachées',             'kg'],
    ['Pistaches mondées',             'kg'],
    ['Noix de cajou',                 'kg'],
    ['Cerneaux de noix',              'kg'],
    ['Pignons de pin',                'kg'],
    ['Arachides grillées',            'kg'],
    ['Raisins secs (sultanines)',     'kg'],
    ['Raisins secs dorés',            'kg'],
    ['Figues séchées',                'kg'],
    ['Dattes Deglet Nour (boul.)',    'kg'],
    ['Abricots secs',                 'kg'],
    ['Pruneaux dénoyautés',           'kg'],
    ['Graines de sésame blanche',     'kg'],
    ['Graines de sésame noire',       'kg'],
    ['Graines de lin',                'kg'],
    ['Graines de tournesol',          'kg'],
    ['Noix de coco râpée',            'kg'],
  ];
  for (const [n, u] of fruitsecs) { await addIng(c, n, u, 'Fruits secs & Oléagineux', boul, unitMap, catMap); count++; }

  const embBoul = [
    ['Boîtes à gâteaux (petites)',    'pièce'],
    ['Boîtes à gâteaux (grandes)',    'pièce'],
    ['Sachets kraft (pains)',         'lot'],
    ['Sachets plastique transparents (pâtisseries)', 'lot'],
    ['Papier cuisson (rouleau)',      'rouleau'],
    ['Film alimentaire boul. (rouleau)', 'rouleau'],
    ['Ficelle alimentaire',           'rouleau'],
    ['Étiquettes prix (rouleau)',     'rouleau'],
    ['Boîtes transport gâteaux (grandes)', 'pièce'],
  ];
  for (const [n, u] of embBoul) { await addIng(c, n, u, 'Emballages boulangerie', boul, unitMap, catMap); count++; }

  const diversBoul = [
    ['Gélatine en feuilles',          'kg'],
    ['Gélatine en poudre',            'kg'],
    ['Agar-agar',                     'kg'],
    ['Nappage neutre',                'kg'],
    ['Nappage miroir chocolat',       'kg'],
    ['Colorant alimentaire rouge',    'g'],
    ['Colorant alimentaire jaune',    'g'],
    ['Colorant alimentaire vert',     'g'],
    ['Colorant alimentaire noir',     'g'],
    ['Sel fin (boulangerie)',         'kg'],
    ['Sucre décor (nonpareilles)',    'kg'],
    ['Paillettes dorées comestibles', 'g'],
    ['Papier de riz comestible',      'lot'],
  ];
  for (const [n, u] of diversBoul) { await addIng(c, n, u, 'Divers boulangerie', boul, unitMap, catMap); count++; }

  // ── CAFÉ ─────────────────────────────────────────────────────────────────

  const cafes = [
    ['Café en grains Arabica (100%)',  'kg'],
    ['Café en grains Robusta',         'kg'],
    ['Café en grains blend (Arabica/Robusta)', 'kg'],
    ['Café moulu espresso',            'kg'],
    ['Café moulu filtre',              'kg'],
    ['Café soluble (Nescafé)',         'kg'],
    ['Café turc moulu fin (Kahwa)',    'kg'],
    ['Thé noir Ceylon (vrac)',         'kg'],
    ['Thé vert (vrac)',                'kg'],
    ['Thé à la menthe (sachets)',      'boîte'],
    ['Thé Earl Grey (sachets)',        'boîte'],
    ['Thé Oolong (sachets)',           'boîte'],
    ['Thé blanc (sachets)',            'boîte'],
    ['Tisane verveine (sachets)',      'boîte'],
    ['Tisane camomille (sachets)',     'boîte'],
    ['Tisane cannelle-gingembre (sachets)', 'boîte'],
    ['Infusion hibiscus (Karkadé)',    'kg'],
    ['Café au lait mix (sachet)',      'boîte'],
    ['Cappuccino instantané (sachet)', 'boîte'],
  ];
  for (const [n, u] of cafes) { await addIng(c, n, u, 'Cafés & Thés', cafe, unitMap, catMap); count++; }

  const siropsCafe = [
    ['Sirop de vanille',               'L'],
    ['Sirop de caramel',               'L'],
    ['Sirop de noisette',              'L'],
    ['Sirop de menthe (café)',         'L'],
    ['Sirop de fraise',                'L'],
    ['Sirop de lavande',               'L'],
    ['Sirop de citron',                'L'],
    ['Sirop de chocolat',              'L'],
    ['Sirop d\'amande (Orgeat)',       'L'],
    ['Sirop de coco',                  'L'],
    ['Sauce caramel (topping)',        'L'],
    ['Sauce chocolat (topping)',       'L'],
    ['Essence de vanille (café)',      'L'],
  ];
  for (const [n, u] of siropsCafe) { await addIng(c, n, u, 'Sirops & Arômes café', cafe, unitMap, catMap); count++; }

  const laitierCafe = [
    ['Lait entier (café)',             'L'],
    ['Lait demi-écrémé (café)',        'L'],
    ['Lait écrémé (café)',             'L'],
    ['Crème liquide UHT (35%)',        'L'],
    ['Crème fouettée en bombe',        'bouteille'],
    ['Lait concentré sucré',           'boîte'],
    ['Lait végétal (avoine)',          'L'],
    ['Lait végétal (soja)',            'L'],
    ['Lait végétal (amande)',          'L'],
  ];
  for (const [n, u] of laitierCafe) { await addIng(c, n, u, 'Produits laitiers café', cafe, unitMap, catMap); count++; }

  const sucresCafe = [
    ['Sucre blanc (café)',             'kg'],
    ['Sucre roux (café)',              'kg'],
    ['Sucre de canne brut',           'kg'],
    ['Miel (café)',                   'kg'],
    ['Sirop d\'agave',                'L'],
    ['Stevia (poudre)',                'kg'],
    ['Sucre glace (café)',             'kg'],
    ['Dosettes sucre individuelles',  'lot'],
  ];
  for (const [n, u] of sucresCafe) { await addIng(c, n, u, 'Sucres & Édulcorants', cafe, unitMap, catMap); count++; }

  const snackCafe = [
    ['Croissant (frais)',              'pièce'],
    ['Pain au chocolat (frais)',       'pièce'],
    ['Madeleine individuelle',         'pièce'],
    ['Sablé tunisien (Ghraiba)',       'pièce'],
    ['Biscuit sablé (Makroudh)',       'pièce'],
    ['Cake nature (tranche)',          'tranche'],
    ['M\'semen (café)',                'pièce'],
    ['Mlawi (café)',                   'pièce'],
    ['Pain de mie grillé (toast)',     'tranche'],
    ['Croissant aux amandes',          'pièce'],
    ['Financier (pâtisserie)',         'pièce'],
    ['Brownie (portion)',              'portion'],
  ];
  for (const [n, u] of snackCafe) { await addIng(c, n, u, 'Snacking & Viennoiseries', cafe, unitMap, catMap); count++; }

  const jusCafe = [
    ['Jus d\'orange frais pressé',    'L'],
    ['Jus de citron frais',           'L'],
    ['Jus de pastèque (frais)',       'L'],
    ['Jus de grenade (frais)',        'L'],
    ['Jus de mangue (brique)',        'L'],
    ['Nectar tropical (brique)',      'L'],
    ['Eau de rose (boisson)',         'L'],
    ['Eau de fleur d\'oranger (boisson)', 'L'],
    ['Smoothie fruits rouges (base)', 'L'],
    ['Limonade artisanale (sirop)',   'L'],
    ['Eau minérale (café)',           'bouteille'],
    ['Eau gazeuse (café)',            'bouteille'],
  ];
  for (const [n, u] of jusCafe) { await addIng(c, n, u, 'Jus & Boissons froides', cafe, unitMap, catMap); count++; }

  const embCafe = [
    ['Gobelets carton café (S 10cl)',  'lot'],
    ['Gobelets carton café (M 20cl)',  'lot'],
    ['Gobelets carton café (L 30cl)',  'lot'],
    ['Couvercles gobelets café',       'lot'],
    ['Manchons isolants gobelets',     'lot'],
    ['Sachets kraft (à emporter café)', 'lot'],
    ['Serviettes café (paquet)',       'lot'],
    ['Pailles compostables (paquet)', 'lot'],
    ['Bâtonnets mélangeurs (paquet)', 'lot'],
    ['Dosettes sucre kraft (boîte)',  'boîte'],
    ['Pochettes sucre individuel',    'lot'],
  ];
  for (const [n, u] of embCafe) { await addIng(c, n, u, 'Emballages café', cafe, unitMap, catMap); count++; }

  const consoCafe = [
    ['Filtres à café (paquet)',        'boîte'],
    ['Capsules café compatible Nespresso', 'boîte'],
    ['Capsules café compatible Dolce Gusto', 'boîte'],
    ['Détartrant machine espresso',    'L'],
    ['Graisse lubrifiante machine café', 'boîte'],
    ['Chiffons microfibre (lot)',      'lot'],
    ['Sucre en stick kraft (boîte)',   'boîte'],
  ];
  for (const [n, u] of consoCafe) { await addIng(c, n, u, 'Consommables café', cafe, unitMap, catMap); count++; }

  console.log(`   ✓ ${count} ingrédients créés`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  LabFlow — Seed Reset + Catalogue Global (Tunisie)');
  console.log('═══════════════════════════════════════════════════');

  // Apply pending migrations first
  const migrate = require('../src/config/migrate');
  await migrate();

  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    await resetDatabase(c);

    const domaines = await seedDomaines(c);
    await seedUnites(c);

    // Build unit lookup map
    const { rows: uniteRows } = await c.query('SELECT id, nom FROM unites WHERE client_id IS NULL');
    const unitMap = Object.fromEntries(uniteRows.map(r => [r.nom, r.id]));

    const catMap = await seedCategories(c, domaines);
    await seedIngredients(c, domaines, catMap, unitMap);

    await c.query('COMMIT');

    console.log('\n✅ Seed terminé avec succès !');
    console.log('   Super admin conservé, catalogue global prêt.');
    console.log('   Connectez-vous à l\'interface admin pour créer des clients.');

  } catch (err) {
    await c.query('ROLLBACK');
    console.error('\n❌ Erreur seed :', err.message);
    throw err;
  } finally {
    c.release();
  }
}

main()
  .then(() => pool.end())
  .catch(() => process.exit(1));
