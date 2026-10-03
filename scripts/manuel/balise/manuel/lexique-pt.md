## 🧩 Les 3 catégories [[de:pt:pl]]

[[Det:pt:un]]**[[avecCourt:pt]]** est [[un:produit]] [[acc:produit:fabriqué:fabriquée]] à partir d'[[un:recette]] et [[acc:produit:suivi:suivie]] en [[nom:stock]] : quand vous en produisez, LabFlow déduit automatiquement [[du:stock]] [[le:article:pl]] et les sous-préparations [[acc:article:consommé:consommée:pl]]. [[Tous:pt:les:court]] ne jouent pas le même rôle : l'application les répartit en **trois catégories**, que vous retrouverez partout sous les libellés « [[Nom:cat_pt_utilisable]] », « [[Nom:cat_pt_vendable]] » et « [[Nom:cat_pt_valorise]] ».

### Vue d'ensemble

| Catégorie | Où on le produit | Où on le vend | Comment il arrive en [[nom:stock]] |
|---|---|---|---|
| **Utilisable** (ex. crème pâtissière) | Dans [[le:activite]] ou [[au:labo]], selon les affectations [[du:produit]] | Nulle part : [[acc:produit:il:elle]] est [[acc:produit:consommé:consommée]] dans [[le:recette:pl]] d'autres [[nom:produit:pl]] | Production sur place (saisie de la quantité produite) ou [[nom:transfert]] depuis [[le:labo]] ; [[acc:produit:certains:certaines]] sont [[acc:produit:limités:limitées]] [[au:transfert]] |
| **Vendable** (ex. tarte au citron) | Dans [[le:activite]] | Par [[le:activite]], lors de la saisie [[un:vente:pl]] | Production dans [[le:activite]], si le suivi [[de:stock]] est activé pour [[ce:produit]] ([[un:labo]] peut aussi [[acc:produit:le:la]] gérer et l'envoyer par [[nom:transfert]]) |
| **Composé valorisé** (ex. entremets fabriqué [[au:labo]]) | [[Au:labo]] uniquement | Par [[le:activite:pl]], tel quel, comme [[un:produit_valorise]] | Uniquement par [[nom:transfert]] depuis [[le:labo]] |

### 1. Les Utilisables — les intermédiaires de [[votre:recette:pl]]

[[Un:produit_utilisable]] est une **préparation intermédiaire** : crème pâtissière, sauce de base, pâte, fond… [[acc:produit_utilisable:Il:Elle]] n'est jamais [[acc:produit_utilisable:vendu:vendue]] [[acc:produit_utilisable:tel quel:telle quelle]] : [[acc:produit_utilisable:il:elle]] entre dans la composition [[un:produit_vendable:pl]], des composés valorisés, ou même d'autres [[nom:produit_utilisable:pl]] (sous-préparations).

Son **mode [[de:appro]]** se choisit à la création [[du:produit]] : soit chaque [[nom:activite]] peut [[acc:produit:le:la]] produire librement sur place, soit [[acc:produit:il:elle]] est [[acc:produit:fabriqué:fabriquée]] [[au:labo]] et [[le:activite:pl]] [[acc:produit:le:la]] reçoivent **uniquement par [[nom:transfert]]**. Dans ce second cas, la ligne [[du:stock]] [[du:activite]] porte l'indicateur « ⇄ [[Court:transfert]] uniquement » et la saisie directe de quantité y est bloquée.

### 2. Les Vendables — [[le:produit:pl]] [[acc:produit:fini:finie:pl]] [[du:activite]]

[[Un:pt:court]] vendable est [[det:produit:un]]**[[nom:produit]] [[acc:produit:fini:finie]] [[acc:produit:vendu:vendue]] par [[le:activite]]** : tarte, plat cuisiné, dessert… [[acc:pt:Il:Elle]] est [[acc:pt:défini:définie]] par [[un:fiche_technique]] et [[acc:pt:rattaché:rattachée]] obligatoirement à une catégorie [[de:produit]]. Le suivi en [[nom:stock]] est **optionnel** : activé [[nom:produit]] par [[nom:produit]], il permet de produire à l'avance (la production déduit [[le:ingredient:pl]] [[du:recette]]) puis de suivre les quantités disponibles.

### 3. Les Composés Valorisés — fabriqués [[au:labo]], vendus tels quels

[[Un:produit_compose]] [[acc:produit_compose:valorisé:valorisée]] est **[[acc:produit_compose:fabriqué:fabriquée]] [[au:labo]]** à partir d'[[un:recette]] ([[nom:article:pl]] et [[nom:produit_utilisable:pl]] [[du:labo]]), puis **[[acc:produit_compose:transféré:transférée]]** vers [[le:activite:pl]] qui [[acc:produit_compose:le:la]] vendent **[[acc:produit_compose:tel quel:telle quelle]]**, comme [[un:produit_valorise]]. [[acc:produit_compose:Il:Elle]] se gère depuis l'écran [[det:produit_valorise:un:pl]][[[Nom:produit_valorise:pl]]](#articles-valorises), dans l'onglet « Composés », qui n'apparaît que si votre compte possède au moins [[un:labo]].

:::regle
Son coût se calcule sur les **prix d'achat [[du:labo]]** et son prix de revient est **figé au moment de la production** : les variations ultérieures des prix [[du:labo]] ne modifient pas la valeur des lots déjà produits. Côté [[nom:activite]], [[acc:produit_compose:il:elle]] n'arrive en [[nom:stock]] **que par [[nom:transfert]]** — jamais par saisie directe.
:::

Dans [[le:stock]] [[du:labo]], [[ce:produit:pl]] sont repérables au badge « ◆ Composé valorisé ».

### Comment [[un:pt:court]] arrive en [[nom:stock]]

1. **Production** : dans l'écran [[de:stock]] ([[nom:activite]] ou [[nom:labo]]), saisissez la quantité produite sur la ligne [[du:pt:court]]. Aucun prix n'est demandé : le coût [[du:recette]] est calculé automatiquement (en TTC) et [[le:ingredient:pl]] — y compris les sous-préparations — sont [[acc:ingredient:déduit:déduite:pl]] [[du:stock]].
2. **[[Nom:transfert]]** : pour [[le:produit:pl]] [[acc:produit:fabriqué:fabriquée:pl]] [[au:labo]], [[le:transfert]] diminue [[le:stock]] [[du:labo]] et augmente [[acc:stock:celui:celle]] [[du:activite]], au coût [[du:labo]].

:::astuce
Chaque production reçoit une **référence automatique** construite à partir du nom [[du:produit]] et de l'année : initiales de chaque mot pour un nom multi-mots (« Crème Pâtissière » produit en 2026 donne CP-26), trois premières lettres pour un nom d'un seul mot (« Cookies » donne COO-26). Vous la retrouverez dans les historiques pour tracer vos fabrications — voir [La traçabilité](#calc-tracabilite).
:::

:::attention
Vérifiez [[le:stock]] de [[votre:ingredient:pl]] avant de lancer une production : les quantités consommées par [[le:recette]] sont déduites immédiatement. Dans la colonne [[du:stock]] [[acc:stock:actuel:actuelle]], la ventilation détaille d'ailleurs les mouvements : [[court:appro]], [[nom:transfert:pl]], [[nom:perte:pl]] et consommation [[court:pt]].
:::

### Qui apparaît où

- **Dans [[le:stock:pl]]** : [[le:pt:pl:court]] figurent aux côtés [[un:article:pl]], [[acc:pt:regroupé:regroupée:pl]] dans leur catégorie. Côté [[nom:activite]], [[le:pt:pl:court]] d'origine [[nom:labo]] affichent « ⇄ [[Court:transfert]] uniquement » ; côté [[nom:labo]], les composés portent le badge « ◆ Composé valorisé ».
- **Dans les historiques et les exports** : [[le:pt:pl:court]] sont [[acc:pt:regroupé:regroupée:pl]] sous les trois catégories citées plus haut. Une catégorie n'apparaît que si elle contient au moins [[un:produit]].
- **Dans les filtres** : le filtre « Catégorie » des historiques [[de:appro:pl]] (côté [[nom:activite]] comme côté [[nom:labo]]) et de l'historique [[un:perte:pl]] [[du:labo]] propose **trois options dédiées** — [[Nom:cat_pt_utilisable]], [[Nom:cat_pt_vendable]], [[Nom:cat_pt_valorise]] — en plus des catégories [[de:article:pl]]. En sélectionnant l'une d'elles, la liste « [[Nom:article]] » affiche [[le:pt:pl]] [[acc:pt:correspondant:correspondante:pl]].

### Voir aussi

- [Lexique LabFlow de A à Z](#lexique) — les définitions de tous les termes
- [[[Titre:produit_utilisable:pl]]](#produits-utilisables) et [[[Titre:produit_vendable:pl]]](#produits-vendables) — créer et gérer [[votre:pt:pl:court]]
- [[[Nom:produit_valorise:pl]]](#articles-valorises) — dont l'onglet « Composés »
- [La production d'[[un:pt:court]]](#calc-production-pt) et [[[Le:transfert:pl]]](#calc-transferts) — les calculs détaillés
- [[[Nom:stock]] [[Court:labo]]](#stock-labo), [[[Nom:transfert:pl]]](#transferts) et [Historiques](#historique) — les écrans concernés