## 🧩 Les 3 catégories de produits transformés

Un **produit transformé (PT)** est un produit fabriqué à partir d'une recette et suivi en stock : quand vous en produisez, LabFlow déduit automatiquement du stock les articles et les sous-préparations consommés. Tous les PT ne jouent pas le même rôle : l'application les répartit en **trois catégories**, que vous retrouverez partout sous les libellés « Produits Transformés Utilisables », « Produits Transformés Vendables » et « Produits Composés Valorisés ».

### Vue d'ensemble

| Catégorie | Où on le produit | Où on le vend | Comment il arrive en stock |
|---|---|---|---|
| **Utilisable** (ex. crème pâtissière) | Dans l'activité ou au labo, selon les affectations du produit | Nulle part : il est consommé dans les recettes d'autres produits | Production sur place (saisie de la quantité produite) ou transfert depuis le labo ; certains sont limités au transfert |
| **Vendable** (ex. tarte au citron) | Dans l'activité | Par l'activité, lors de la saisie des ventes | Production dans l'activité, si le suivi de stock est activé pour ce produit (un labo peut aussi le gérer et l'envoyer par transfert) |
| **Composé valorisé** (ex. entremets fabriqué au labo) | Au labo uniquement | Par les activités, tel quel, comme un produit valorisé | Uniquement par transfert depuis le labo |

### 1. Les Utilisables — les intermédiaires de vos recettes

Un produit utilisable est une **préparation intermédiaire** : crème pâtissière, sauce de base, pâte, fond… Il n'est jamais vendu tel quel : il entre dans la composition des produits vendables, des composés valorisés, ou même d'autres produits utilisables (sous-préparations).

Son **mode d'approvisionnement** se choisit à la création du produit : soit chaque activité peut le produire librement sur place, soit il est fabriqué au labo et les activités le reçoivent **uniquement par transfert**. Dans ce second cas, la ligne du stock de l'activité porte l'indicateur « ⇄ Transfert uniquement » et la saisie directe de quantité y est bloquée.

### 2. Les Vendables — les produits finis de l'activité

Un PT vendable est un **produit fini vendu par l'activité** : tarte, plat cuisiné, dessert… Il est défini par une fiche technique et rattaché obligatoirement à une catégorie de produit. Le suivi en stock est **optionnel** : activé produit par produit, il permet de produire à l'avance (la production déduit les ingrédients de la recette) puis de suivre les quantités disponibles.

### 3. Les Composés Valorisés — fabriqués au labo, vendus tels quels

Un produit composé valorisé est **fabriqué au labo** à partir d'une recette (articles et produits utilisables du labo), puis **transféré** vers les activités qui le vendent **tel quel**, comme un produit valorisé. Il se gère depuis l'écran des [Produits valorisés](#articles-valorises), dans l'onglet « Composés », qui n'apparaît que si votre compte possède au moins un labo.

:::regle
Son coût se calcule sur les **prix d'achat du labo** et son prix de revient est **figé au moment de la production** : les variations ultérieures des prix du labo ne modifient pas la valeur des lots déjà produits. Côté activité, il n'arrive en stock **que par transfert** — jamais par saisie directe.
:::

Dans le stock du labo, ces produits sont repérables au badge « ◆ Composé valorisé ».

### Comment un PT arrive en stock

1. **Production** : dans l'écran de stock (activité ou labo), saisissez la quantité produite sur la ligne du PT. Aucun prix n'est demandé : le coût de la recette est calculé automatiquement (en TTC) et les ingrédients — y compris les sous-préparations — sont déduits du stock.
2. **Transfert** : pour les produits fabriqués au labo, le transfert diminue le stock du labo et augmente celui de l'activité, au coût du labo.

:::astuce
Chaque production reçoit une **référence automatique** construite à partir du nom du produit et de l'année : initiales de chaque mot pour un nom multi-mots (« Crème Pâtissière » produit en 2026 donne CP-26), trois premières lettres pour un nom d'un seul mot (« Cookies » donne COO-26). Vous la retrouverez dans les historiques pour tracer vos fabrications — voir [La traçabilité](#calc-tracabilite).
:::

:::attention
Vérifiez le stock de vos ingrédients avant de lancer une production : les quantités consommées par la recette sont déduites immédiatement. Dans la colonne du stock actuel, la ventilation détaille d'ailleurs les mouvements : appro, transferts, pertes et consommation PT.
:::

### Qui apparaît où

- **Dans les stocks** : les PT figurent aux côtés des articles, regroupés dans leur catégorie. Côté activité, les PT d'origine labo affichent « ⇄ Transfert uniquement » ; côté labo, les composés portent le badge « ◆ Composé valorisé ».
- **Dans les historiques et les exports** : les PT sont regroupés sous les trois catégories citées plus haut. Une catégorie n'apparaît que si elle contient au moins un produit.
- **Dans les filtres** : le filtre « Catégorie » des historiques d'approvisionnements (côté activité comme côté labo) et de l'historique des pertes du labo propose **trois options dédiées** — Produits Transformés Utilisables, Produits Transformés Vendables, Produits Composés Valorisés — en plus des catégories d'articles. En sélectionnant l'une d'elles, la liste « Article » affiche les produits transformés correspondants.

### Voir aussi

- [Lexique LabFlow de A à Z](#lexique) — les définitions de tous les termes
- [Produits Utilisables](#produits-utilisables) et [Produits Vendables](#produits-vendables) — créer et gérer vos PT
- [Produits valorisés](#articles-valorises) — dont l'onglet « Composés »
- [La production d'un PT](#calc-production-pt) et [Les transferts](#calc-transferts) — les calculs détaillés
- [Stock Labo](#stock-labo), [Transferts](#transferts) et [Historiques](#historique) — les écrans concernés