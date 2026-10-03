## 🧮 Le coût de revient d'[[un:recette]]

Le coût de revient d'[[un:fiche_technique]] est la somme de ce que coûtent ses éléments : chaque [[nom:ingredient]] compte pour [[son:portion]] [[acc:portion:multiplié:multipliée]] par son prix unitaire TTC, et chaque sous-produit (par exemple [[un:produit_utilisable]] [[acc:produit_utilisable:préparé:préparée]] à part) compte pour [[son:portion]] [[acc:portion:multiplié:multipliée]] par son propre coût de revient, calculé de la même façon. Le calcul descend ainsi dans [[le:recette]] du sous-produit, puis de ses éventuels sous-produits, jusqu'[[acc:ingredient:au dernier:à la dernière]] [[nom:ingredient]].

### Les paramètres qui influencent le résultat

- **[[Le:portion:pl]] [[du:recette]]** : la quantité de chaque [[nom:ingredient]] et de chaque sous-produit nécessaire pour une unité produite (un verre, un plateau, une corbeille…).
- **Le prix unitaire de chaque [[nom:ingredient]]**, selon le mode choisi au moment de générer [[le:fiche_technique]] (carte *[[Court:fiche_technique]] [[Court:stock]]* avec ses méthodes *DP* / *PMP*, ou carte *[[Court:fiche_technique]] Manuel*) :
  - **Prix moyen pondéré (PMP)** — méthode *PMP* : la moyenne pondérée des prix TTC de vos achats (et [[nom:transfert:pl]] [[acc:transfert:reçu:reçue:pl]], côté [[nom:activite]]) depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] — voir [Le prix moyen pondéré](#calc-pmp). C'est ce prix qui sert à valoriser les productions.
  - **Dernier prix** — méthode *DP* : le dernier prix TTC enregistré pour [[le:article]].
  - **Prix manuel** — carte *[[Court:fiche_technique]] Manuel* : un prix que vous saisissez vous-même, mémorisé par base de prix, pour simuler un coût.
- **La base de prix choisie** : [[le:fiche_technique]] se génère pour une ou plusieurs bases ([[nom:activite:pl]] ou [[nom:labo:pl]] [[acc:labo:assigné:assignée:pl]] [[au:produit]]) — les prix proviennent [[du:stock]] de chaque base, avec repli sur les prix [[du:labo]] [[acc:labo:lié:liée]] quand [[un:article]] n'a pas encore de prix côté [[nom:activite]]. [[Un:produit]] [[acc:produit:fabriqué:fabriquée]] [[au:labo]] se calcule uniquement sur [[le:labo:pl]] [[acc:labo:assigné:assignée:pl]].
- **[[Le:portion:pl]] [[acc:portion:personnalisé:personnalisée:pl]]** : au moment d'une production, vous pouvez ajuster ponctuellement les quantités réellement consommées ; les déductions [[de:stock]] suivent ces quantités, sans modifier [[le:fiche_technique]] (l'entrée [[du:produit]] [[acc:produit:fini:finie]] reste valorisée au coût [[du:recette]] standard).

:::formule Coût de revient d'[[un:recette]]
Coût total = somme([[nom:portion]] [[nom:ingredient]] × prix unitaire TTC) + somme([[nom:portion]] sous-produit × coût de revient du sous-produit)
note: le coût de chaque sous-produit est calculé récursivement avec la même règle, aux mêmes prix.
:::

:::exemple
[[Nom:recette]] « Cocktail de bienvenue » (pour 1 verre), [[acc:recette:valorisé:valorisée]] au PMP TTC [[du:activite]] (le bar) :

- Jus d'orange : 0,100 L × 4,500 DT/L = 0,450 DT
- Jus d'ananas : 0,060 L × 6,000 DT/L = 0,360 DT
- Eau gazeuse : 0,050 L × 2,000 DT/L = 0,100 DT
- Purée de mangue maison (sous-produit) : 0,050 kg × 9,600 DT/kg = 0,480 DT

Le coût de la purée de mangue (9,600 DT le kg) est lui-même calculé à partir de [[acc:recette:son propre:sa propre]] [[nom:recette]], [[acc:recette:établi:établie]] pour 1 kg : mangues 1,200 kg × 7,000 DT = 8,400 DT ; citrons verts 0,100 kg × 9,000 DT = 0,900 DT ; menthe fraîche 0,050 kg × 6,000 DT = 0,300 DT.

**Coût de revient du cocktail = 0,450 + 0,360 + 0,100 + 0,480 = 1,390 DT TTC.**
:::

### Ce qui peut faire varier le résultat

- Chaque nouvel achat à un prix différent déplace le PMP, donc le coût de revient recalculé.
- [[Un:inventaire]] redémarre la période de calcul du PMP : le coût peut évoluer juste après.
- Si [[un:ingredient]] n'a encore aucun prix connu (jamais [[acc:ingredient:approvisionné:approvisionnée]]), sa part est comptée à zéro : le coût affiché est alors incomplet.
- La modification ou la suppression d'une ligne [[de:appro]] passée change le PMP, donc le coût, rétroactivement.
- [[Un:recette]] ne peut pas se contenir [[acc:recette:lui-même:elle-même]] (directement ou via ses sous-produits) : le calcul le refuse.

### Voir aussi

- [[[Nom:fiche_technique:pl]]](#fiches-techniques)
- [Le prix moyen pondéré](#calc-pmp)
- [La production d'[[un:pt]]](#calc-production-pt)
- [HT et TTC](#calc-ht-ttc)
- [Lexique [[un:pt:pl]]](#lexique-pt)