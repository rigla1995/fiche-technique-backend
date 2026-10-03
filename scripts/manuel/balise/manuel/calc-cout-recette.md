## 🧮 Le coût de revient d'[[un:recette]]

Le coût de revient d'[[un:fiche_technique]] est la somme de ce que coûtent ses composants : chaque [[nom:ingredient]] compte pour [[son:portion]] [[acc:portion:multiplié:multipliée]] par son prix unitaire TTC, et chaque sous-produit transformé compte pour [[son:portion]] [[acc:portion:multiplié:multipliée]] par son propre coût de revient, calculé de la même façon. Le calcul descend ainsi dans [[le:recette]] du sous-produit, puis de ses éventuels sous-produits, jusqu'[[acc:ingredient:au dernier:à la dernière]] [[nom:ingredient]].

### Les paramètres qui influencent le résultat

- **[[Le:portion:pl]] [[du:recette]]** : la quantité de chaque [[nom:ingredient]] et de chaque sous-produit nécessaire pour une unité produite.
- **Le prix unitaire de chaque [[nom:ingredient]]**, selon le mode choisi au moment de générer [[le:fiche_technique]] (carte *[[Court:fiche_technique]] [[Court:stock]]* avec ses méthodes *DP* / *PMP*, ou carte *[[Court:fiche_technique]] Manuel*) :
  - **Prix moyen pondéré (PMP)** — méthode *PMP* : la moyenne pondérée des prix TTC de vos achats (et [[nom:transfert:pl]] [[acc:transfert:reçu:reçue:pl]], côté [[nom:activite]]) depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] — voir [Le prix moyen pondéré](#calc-pmp). C'est ce prix qui sert à valoriser les productions.
  - **Dernier prix** — méthode *DP* : le dernier prix TTC enregistré pour [[le:article]].
  - **Prix manuel** — carte *[[Court:fiche_technique]] Manuel* : un prix que vous saisissez vous-même, mémorisé par base de prix, pour simuler un coût.
- **La base de prix choisie** : [[le:fiche_technique]] se génère pour une ou plusieurs bases ([[nom:activite:pl]] ou [[nom:labo:pl]] [[acc:labo:assigné:assignée:pl]] [[au:produit]]) — les prix proviennent [[du:stock]] de chaque base, avec repli sur les prix [[du:labo]] [[acc:labo:lié:liée]] quand [[un:article]] n'a pas encore de prix côté [[nom:activite]]. [[Un:produit]] [[acc:produit:fabriqué:fabriquée]] [[au:labo]] se calcule uniquement sur ses bases [[nom:labo]].
- **[[Le:portion:pl]] [[acc:portion:personnalisé:personnalisée:pl]]** : au moment d'une production, vous pouvez ajuster ponctuellement les quantités réellement consommées ; les déductions [[de:stock]] suivent ces quantités, sans modifier [[le:fiche_technique]] (l'entrée [[du:produit]] [[acc:produit:fini:finie]] reste valorisée au coût [[du:recette]] standard).

:::formule Coût de revient d'[[un:recette]]
Coût total = somme([[nom:portion]] [[nom:ingredient]] × prix unitaire TTC) + somme([[nom:portion]] sous-produit × coût de revient du sous-produit)
note: le coût de chaque sous-produit est calculé récursivement avec la même règle, aux mêmes prix.
:::

:::exemple
[[Nom:recette]] « Tarte aux fraises » (pour 1 tarte), [[acc:recette:valorisé:valorisée]] au PMP TTC [[du:activite]] :

- Farine : 0,250 kg × 2,400 DT/kg = 0,600 DT
- Fraises : 0,300 kg × 8,000 DT/kg = 2,400 DT
- Sucre : 0,100 kg × 3,200 DT/kg = 0,320 DT
- Crème pâtissière (sous-produit) : 0,500 unité × 4,440 DT/unité = 2,220 DT

Le coût de la crème pâtissière (4,440 DT) est lui-même calculé à partir de [[acc:recette:son propre:sa propre]] [[nom:recette]] : lait 0,500 L × 2,000 DT = 1,000 DT ; œufs 4 pièces × 0,700 DT = 2,800 DT ; sucre 0,200 kg × 3,200 DT = 0,640 DT.

**Coût de revient de la tarte = 0,600 + 2,400 + 0,320 + 2,220 = 5,540 DT TTC.**
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