## 🏢 Le modèle : compte, activités, labos

Toute l'organisation de LabFlow repose sur trois niveaux : le **compte**, les **activités** et les **labos**. Comprendre qui possède quoi est la clé de lecture de tous les autres écrans.

### Les trois niveaux

- **Le compte** : c'est votre entreprise dans LabFlow. Il porte l'abonnement, qui fixe vos quotas : nombre d'activités, de labos et de comptes gérants — et, si l'option Acheteurs est active, le palier d'acheteurs. Il porte aussi la **formule d'activités** (Basique ou Premium), qui détermine l'étendue de l'Espace Produit. Les compteurs d'activités et de labos s'affichent sur la page Mes Activités, celui des gérants sur la page Gérants. Il n'y a pas de distinction entre indépendant et entreprise : le même modèle s'adapte à toutes les tailles.
- **Les activités (0 à N)** : vos points de vente ou cuisines — boutique, restaurant, kiosque… Chaque activité vend, consomme et gère son propre stock.
- **Les labos (0 à N)** : vos sites de production. Un labo fabrique des produits transformés, approvisionne les activités qui lui sont rattachées **exclusivement par transfert** — et, avec l'option Acheteurs, vend directement aux professionnels.

### Qui possède quoi ?

| Élément | Niveau | En pratique |
|---|---|---|
| Référentiel (unités, familles, catégories, articles) | Compte | Défini une seule fois, partagé par tous les sites |
| Sélection d'articles | Activité / labo | Chaque site n'utilise que les articles qu'on lui a assignés |
| Stock, appros, inventaires, pertes | Activité / labo | Chaque site a les siens, suivis séparément |
| Produits et fiches techniques | Activité / labo | Un produit est affecté aux sites qui le fabriquent ou le vendent |
| Ventes et prix de vente | Activité / labo | Chaque point de vente a ses prix et ses ventes ; le labo peut aussi saisir ses ventes directes |
| Carnet d'acheteurs et tarifs B2B | Compte | Communs à tous les labos ; les ventes aux acheteurs partent du stock d'un labo |

### Le lien activité ↔ labo

Dès qu'un labo existe sur votre compte, la création ou la modification d'une activité vous propose deux options :

- **Avec labo** : l'activité est rattachée à un labo qui l'approvisionne par transfert — la production du labo arrive dans le stock de la boutique à chaque transfert.
- **Sans labo** : l'activité gère seule ses approvisionnements auprès de ses fournisseurs.

Une même entreprise peut mélanger les deux : des boutiques rattachées au labo et un point de vente autonome, par exemple.

### La base acheteurs et le compte dépôt

Avec l'**option Acheteurs**, le labo ne fait pas que produire pour vos boutiques : il vend aussi **directement aux professionnels** (épiceries, revendeurs, restaurants…). Le carnet d'acheteurs, les tarifs B2B, les commandes et le portail en ligne sont réunis dans l'[Espace Acheteurs](#acheteurs-module).

- L'option nécessite **au moins un labo** : les ventes aux acheteurs partent toujours du stock d'un labo.
- Elle est facturée **par palier** selon la taille du carnet : jusqu'à 10, 20, 50 ou 100 acheteurs.
- Un **compte dépôt** est un compte **sans activité** : un labo + la base acheteurs. C'est le modèle de l'atelier de production qui ne vend qu'aux professionnels. Son menu est allégé : sans activité, l'Espace Vente, les Transferts et les Produits Vendables sont masqués — ils réapparaissent automatiquement dès la première activité créée.

### Quatre exemples concrets

- **Pâtisserie avec labo central** : 1 labo + 3 boutiques. Le labo produit crèmes, entremets et viennoiseries ; chaque boutique reçoit sa production par transfert et saisit ses propres ventes. Le référentiel (farine, beurre, sucre…) est commun à tous.
- **Restaurant simple** : 1 activité, 0 labo. Le restaurant fait ses achats, ses fiches techniques et ses ventes ; le modèle reste le même, simplement sans Espace Labo.
- **Traiteur multi-sites** : 1 labo de production + 2 points de vente. Le labo prépare, les sites vendent, et les rapports donnent la vision d'ensemble du compte.
- **Atelier en dépôt** : 0 activité, 1 labo + base acheteurs. L'atelier produit et vend exclusivement à ses clients professionnels, via l'Espace Acheteurs et le portail de commande.

:::regle
Le référentiel est commun au compte ; les stocks sont locaux à chaque site. Un article se crée une seule fois, mais son stock et son prix moyen pondéré vivent séparément dans chaque activité et chaque labo.
:::

:::attention
Un produit transformé d'origine labo ne peut être approvisionné côté activité que par transfert : pas de saisie d'achat directe pour ces produits en boutique. Voir [les produits transformés](#lexique-pt).
:::

### Voir aussi

- [Parcours de démarrage](#demarrage)
- [Activités](#activites) — l'écran de gestion de vos sites
- [Le module Acheteurs](#acheteurs-module) — la vente aux professionnels
- [Transferts](#transferts)
- [Rôles & accès](#roles)
- [Calculs : les transferts](#calc-transferts)