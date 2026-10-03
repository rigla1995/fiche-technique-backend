## 🏢 Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]

Toute l'organisation de LabFlow repose sur trois niveaux : le **compte**, [[det:activite:le:pl]]**[[nom:activite:pl]]** et [[det:labo:le:pl]]**[[nom:labo:pl]]**. Comprendre qui possède quoi est la clé de lecture de tous les autres écrans.

### Les trois niveaux

- **Le compte** : c'est votre entreprise dans LabFlow. Il porte l'abonnement, qui fixe vos quotas : nombre [[de:activite:pl]], [[de:labo:pl]] et de comptes [[nom:gerant:pl]] — et, si l'option [[Court:acheteur:pl]] est active, le palier [[de:acheteur:pl]]. Il porte aussi la **formule d'activités** (Basique ou Premium), qui détermine l'étendue [[du:espace_produits:Nom]]. Les compteurs [[de:activite:pl]] et [[de:labo:pl]] s'affichent sur la page [[Mon:activite:pl:Nom]], celui [[du:gerant:pl]] sur la page [[Nom:gerant:pl]]. Il n'y a pas de distinction entre indépendant et entreprise : le même modèle s'adapte à toutes les tailles.
- **[[Le:activite:pl]] (0 à N)** : vos points de vente ou cuisines — boutique, restaurant, kiosque… Chaque [[nom:activite]] vend, consomme et gère [[acc:stock:son propre:sa propre]] [[nom:stock]].
- **[[Le:labo:pl]] (0 à N)** : vos sites de production. [[Un:labo]] fabrique [[un:pt:pl]], approvisionne [[le:activite:pl]] qui lui sont [[acc:activite:rattaché:rattachée:pl]] **exclusivement par [[nom:transfert]]** — et, avec l'option [[Court:acheteur:pl]], vend directement aux professionnels.

### Qui possède quoi ?

| Élément | Niveau | En pratique |
|---|---|---|
| [[Nom:referentiel]] (unités, familles, catégories, [[nom:article:pl]]) | Compte | [[acc:referentiel:Défini:Définie]] une seule fois, [[acc:referentiel:partagé:partagée]] par tous les sites |
| Sélection [[de:article:pl]] | [[Nom:activite]] / [[nom:labo]] | Chaque site n'utilise que [[le:article:pl]] qu'on lui a [[acc:article:assigné:assignée:pl]] |
| [[Nom:stock]], [[court:appro:pl]], [[nom:inventaire:pl]], [[nom:perte:pl]] | [[Nom:activite]] / [[nom:labo]] | Chaque site a les siens, suivis séparément |
| [[Nom:produit:pl]] et [[nom:fiche_technique:pl]] | [[Nom:activite]] / [[nom:labo]] | [[Un:produit]] est [[acc:produit:affecté:affectée]] aux sites qui [[acc:produit:le:la]] fabriquent ou [[acc:produit:le:la]] vendent |
| [[Nom:vente:pl]] et prix de vente | [[Nom:activite]] / [[nom:labo]] | Chaque [[nom:activite_desc]] a ses prix et [[son:vente:pl]] ; [[le:labo]] peut aussi saisir [[son:vente:pl]] [[acc:vente:direct:directe:pl]] |
| Carnet [[de:acheteur:pl]] et tarifs B2B | Compte | Communs à [[tous:labo:les]] ; [[le:vente:pl]] [[au:acheteur:pl]] partent [[du:stock]] d'[[un:labo]] |

### Le lien [[nom:activite]] ↔ [[nom:labo]]

Dès qu'[[un:labo]] existe sur votre compte, la création ou la modification d'[[un:activite]] vous propose deux options :

- **Avec [[nom:labo]]** : [[le:activite]] est [[acc:activite:rattaché:rattachée]] à [[un:labo]] qui l'approvisionne par [[nom:transfert]] — la production [[du:labo]] arrive dans [[le:stock]] de la boutique à chaque [[nom:transfert]].
- **Sans [[nom:labo]]** : [[le:activite]] gère [[acc:activite:seul:seule]] [[son:appro:pl]] auprès de [[son:fournisseur:pl]].

Une même entreprise peut mélanger les deux : des boutiques rattachées [[au:labo]] et [[un:activite_desc]] autonome, par exemple.

### La base [[court:acheteur:pl]] et le compte [[nom:depot]]

Avec l'**option [[Court:acheteur:pl]]**, [[le:labo]] ne fait pas que produire pour vos boutiques : [[acc:labo:il:elle]] vend aussi **directement aux professionnels** (épiceries, revendeurs, restaurants…). Le carnet [[de:acheteur:pl]], les tarifs B2B, les commandes et le portail en ligne sont réunis dans [[det:espace_acheteurs:le]][[[Nom:espace_acheteurs]]](#acheteurs-module).

- L'option nécessite **au moins [[un:labo]]** : [[le:vente:pl]] [[au:acheteur:pl]] partent toujours [[du:stock]] d'[[un:labo]].
- Elle est facturée **par palier** selon la taille du carnet : jusqu'à 10, 20, 50 ou 100 [[nom:acheteur:pl]].
- Un **compte [[nom:depot]]** est un compte **sans [[nom:activite]]** : [[un:labo]] + la base [[court:acheteur:pl]]. C'est le modèle de l'atelier de production qui ne vend qu'aux professionnels. Son menu est allégé : sans [[nom:activite]], [[le:espace_vente:Nom]], [[le:transfert:pl:Nom]] et [[le:produit_vendable:pl:Titre]] sont masqués — ils réapparaissent automatiquement dès [[acc:activite:le premier:la première]] [[nom:activite]] [[acc:activite:créé:créée]].

### Quatre exemples concrets

- **Pâtisserie avec [[nom:labo]][[acc:labo: central:]]** : 1 [[nom:labo]] + 3 boutiques. [[Le:labo]] produit crèmes, entremets et viennoiseries ; chaque boutique reçoit sa production par [[nom:transfert]] et saisit ses propres [[nom:vente:pl]]. [[Le:referentiel]] (farine, beurre, sucre…) est [[acc:referentiel:commun:commune]] à tous.
- **Restaurant simple** : 1 [[nom:activite]], 0 [[nom:labo]]. Le restaurant fait ses achats, [[son:fiche_technique:pl]] et [[son:vente:pl]] ; le modèle reste le même, simplement sans [[Nom:espace_labo]].
- **Traiteur multi-sites** : 1 [[nom:labo]] de production + 2 [[nom:activite_desc:pl]]. [[Le:labo]] prépare, les sites vendent, et les rapports donnent la vision d'ensemble du compte.
- **Atelier en [[nom:depot]]** : 0 [[nom:activite]], 1 [[nom:labo]] + base [[court:acheteur:pl]]. L'atelier produit et vend exclusivement à ses clients professionnels, via [[le:espace_acheteurs:Nom]] et le portail de commande.

:::regle
[[Le:referentiel]] est [[acc:referentiel:commun:commune]] au compte ; [[le:stock:pl]] sont [[acc:stock:locaux:locales]] à chaque site. [[Un:article]] se crée une seule fois, mais [[son:stock]] et son prix moyen pondéré vivent séparément dans chaque [[nom:activite]] et chaque [[nom:labo]].
:::

:::attention
[[Un:pt]] d'origine [[nom:labo]] ne peut être [[acc:pt:approvisionné:approvisionnée]] côté [[nom:activite]] que par [[nom:transfert]] : pas de saisie d'achat directe pour [[ce:produit:pl]] en boutique. Voir [[[le:pt:pl]]](#lexique-pt).
:::

### Voir aussi

- [Parcours de démarrage](#demarrage)
- [[[Nom:activite:pl]]](#activites) — l'écran de gestion de vos sites
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module) — [[le:vente]] aux professionnels
- [[[Nom:transfert:pl]]](#transferts)
- [Rôles & accès](#roles)
- [Calculs : [[le:transfert:pl]]](#calc-transferts)