// Lexique par DÉFAUT d'un domaine d'activité (lot 1a) = les termes ACTUELS de l'app
// (restauration). Le JSONB `domaines_activite.lexique` ne porte que les écarts ;
// domaineProfilService.resolveProfil fusionne (deep merge clé par clé).
//
// Format d'une entrée : { sg: singulier, pl: pluriel, g: 'm' | 'f' (genre),
//                         el: élision (« l'activité » vs « le labo »), icon: emoji porteur de sens }
// 30 clés — une clé = UN terme (le pluriel est porté par `pl`, jamais par une clé à part).

const LEXIQUE_DEFAUT = Object.freeze({
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
});

const LEXIQUE_CLES = Object.freeze(Object.keys(LEXIQUE_DEFAUT));

module.exports = { LEXIQUE_DEFAUT, LEXIQUE_CLES };
