## 🏢 Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]

Toute l'organisation de LabFlow repose sur trois niveaux : le **compte**, [[det:activite:le:pl]]**[[nom:activite:pl]]** et [[det:labo:le:pl]]**[[nom:labo:pl]]**. Comprendre qui possède quoi est la clé de lecture de tous les autres écrans.

### Les trois niveaux

- **Le compte** : c'est votre entreprise dans LabFlow. Il porte l'abonnement, qui fixe vos quotas : nombre [[de:activite:pl]], [[de:labo:pl]] et de comptes [[nom:gerant:pl]] — et, si le module [[Court:acheteur:pl]] est actif, le palier [[de:acheteur:pl]]. Il porte aussi la **formule d'activités** (Basique ou Premium), qui détermine l'étendue [[du:espace_produits:Nom]]. Les compteurs [[de:activite:pl]] et [[de:labo:pl]] s'affichent sur la page [[Mon:activite:pl]], celui [[du:gerant:pl]] sur la page du même nom. Il n'y a pas de distinction entre indépendant et entreprise : le même modèle s'adapte à toutes les tailles, du potier seul à l'usine de carreaux.
- **[[Le:activite:pl]] (0 à N)** : vos magasins — showroom en ville, magasin d'usine, stand de salon… Chaque [[nom:activite]] vend, consomme et gère [[acc:stock:son propre:sa propre]] [[nom:stock]].
- **[[Le:labo:pl]] (0 à N)** : vos usines et ateliers. [[Un:labo]] façonne et cuit [[un:pt:pl]], approvisionne [[le:activite:pl]] qui lui sont [[acc:activite:rattaché:rattachée:pl]] **exclusivement par [[nom:transfert]]** — et, avec le module [[Court:acheteur:pl]], vend directement aux professionnels.

### Qui possède quoi ?

| Élément | Niveau | En pratique |
|---|---|---|
| [[Nom:referentiel]] (unités, familles, catégories, [[nom:article:pl]]) | Compte | [[acc:referentiel:Défini:Définie]] une seule fois, [[acc:referentiel:partagé:partagée]] par tous vos établissements |
| Sélection [[de:article:pl]] | [[Nom:activite]] / [[nom:labo]] | Chaque établissement n'utilise que [[le:article:pl]] qu'on lui a [[acc:article:assigné:assignée:pl]] |
| [[Nom:stock]], [[court:appro:pl]], [[nom:inventaire:pl]], [[nom:perte:pl]] | [[Nom:activite]] / [[nom:labo]] | Chaque établissement a les siens, suivis séparément |
| [[Nom:produit:pl]] et [[nom:fiche_technique:pl]] | [[Nom:activite]] / [[nom:labo]] | [[Un:produit]] est [[acc:produit:affecté:affectée]] aux établissements qui [[acc:produit:le:la]] fabriquent ou [[acc:produit:le:la]] vendent |
| [[Nom:vente:pl]] et prix de vente | [[Nom:activite]] / [[nom:labo]] | Chaque [[nom:activite]] a ses prix et [[son:vente:pl]] ; [[le:labo]] peut aussi saisir [[son:vente:pl]] [[acc:vente:direct:directe:pl]] |
| Carnet [[de:acheteur:pl]] et tarifs B2B | Compte | Communs à [[tous:labo:les]] ; [[le:vente:pl]] [[au:acheteur:pl]] partent [[du:stock]] de [[acc:labo:l'un d'eux:l'une d'elles]] |

### Le lien [[nom:activite]] ↔ [[nom:labo]]

Dès qu'[[un:labo]] existe sur votre compte, la création ou la modification d'[[un:activite]] vous propose deux choix :

- **Avec [[nom:labo]]** : [[le:activite]] est [[acc:activite:rattaché:rattachée]] à [[un:labo]] qui l'approvisionne par [[nom:transfert]] — les pièces sorties du four arrivent dans [[le:stock]] du showroom à chaque [[nom:transfert]].
- **Sans [[nom:labo]]** : [[le:activite]] gère [[acc:activite:seul:seule]] [[son:appro:pl]] auprès de [[son:fournisseur:pl]].

Une même entreprise peut mélanger les deux : des showrooms rattachés [[au:labo]] et un magasin autonome qui s'approvisionne chez d'autres fabricants, par exemple.

### La base [[court:acheteur:pl]] et le compte [[nom:depot]]

Avec le **module [[Court:acheteur:pl]]**, [[le:labo]] ne fait pas que fabriquer pour vos showrooms : [[acc:labo:il:elle]] vend aussi **directement aux professionnels** (négociants en matériaux, magasins de carrelage, décorateurs…). Le carnet [[de:acheteur:pl]], les tarifs B2B, les commandes et le portail en ligne sont réunis dans [[det:espace_acheteurs:le]][[[Nom:espace_acheteurs]]](#acheteurs-module).

- Le module nécessite **au moins [[un:labo]]** : [[le:vente:pl]] [[au:acheteur:pl]] partent toujours de [[son:stock]].
- Il est facturé **par palier** selon la taille du carnet : jusqu'à 10, 20, 50 ou 100 [[nom:acheteur:pl]].
- Un **compte [[nom:depot]]** est un compte **sans [[nom:activite]]** : [[un:labo]] + la base [[court:acheteur:pl]]. C'est le modèle de l'usine qui ne vend qu'aux professionnels. Son menu est allégé : sans [[nom:activite]], [[le:espace_vente:Nom]], [[le:transfert:pl:Nom]] et [[le:produit_vendable:pl:Titre]] sont masqués — ils réapparaissent automatiquement dès [[acc:activite:le premier:la première]] [[nom:activite]] [[acc:activite:créé:créée]].

### Quatre exemples concrets

- **Fabrique de vaisselle** : 1 [[nom:labo]] + 3 showrooms. L'usine façonne, émaille et cuit assiettes, bols et tasses ; chaque showroom reçoit sa production par [[nom:transfert]] et saisit ses propres [[nom:vente:pl]]. [[Le:referentiel]] (argile, kaolin, émaux, cartons…) est [[acc:referentiel:commun:commune]] à tous.
- **Potier indépendant** : 1 [[nom:activite]], 0 [[nom:labo]]. Le potier fait ses achats, [[son:fiche_technique:pl]] et [[son:vente:pl]] ; le modèle reste le même, simplement sans [[Nom:espace_labo]].
- **Fabricant de carreaux** : 1 [[nom:labo]] + 2 [[nom:activite:pl]] (un showroom en ville, un magasin d'usine). L'usine presse, émaille et cuit les carreaux, [[le:activite:pl]] vendent, et les rapports donnent la vision d'ensemble du compte.
- **Usine en compte [[nom:depot]]** : 0 [[nom:activite]], 1 [[nom:labo]] + base [[court:acheteur:pl]]. L'usine fabrique et vend exclusivement à ses clients professionnels (négociants, grandes surfaces de bricolage), via [[le:espace_acheteurs:Nom]] et le portail de commande.

:::regle
[[Le:referentiel]] est [[acc:referentiel:commun:commune]] au compte ; [[le:stock:pl]] sont [[acc:stock:locaux:locales]] à chaque établissement. [[Un:article]] se crée une seule fois, mais [[son:stock]] et son prix moyen pondéré vivent séparément dans chaque [[nom:activite]] et chaque [[nom:labo]].
:::

:::attention
[[Un:pt]] d'origine [[nom:labo]] ne peut être [[acc:pt:approvisionné:approvisionnée]] côté [[nom:activite]] que par [[nom:transfert]] : pas de saisie d'achat directe pour [[ce:produit:pl]] en showroom. Voir [[[le:pt:pl]]](#lexique-pt).
:::

### Voir aussi

- [Parcours de démarrage](#demarrage)
- [[[Nom:activite:pl]]](#activites) — l'écran de gestion de vos établissements
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module) — [[le:vente]] aux professionnels
- [[[Nom:transfert:pl]]](#transferts)
- [Rôles & accès](#roles)
- [Calculs : [[le:transfert:pl]]](#calc-transferts)