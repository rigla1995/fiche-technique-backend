## 🧮 Le coût de revient d'une recette

Le coût de revient d'une fiche technique est la somme de ce que coûtent ses composants : chaque ingrédient compte pour sa portion multipliée par son prix unitaire TTC, et chaque sous-produit transformé compte pour sa portion multipliée par son propre coût de revient, calculé de la même façon. Le calcul descend ainsi dans la recette du sous-produit, puis de ses éventuels sous-produits, jusqu'au dernier ingrédient.

### Les paramètres qui influencent le résultat

- **Les portions de la recette** : la quantité de chaque ingrédient et de chaque sous-produit nécessaire pour une unité produite.
- **Le prix unitaire de chaque ingrédient**, selon le mode choisi au moment de générer la fiche technique (carte *FT Stock* avec ses méthodes *DP* / *PMP*, ou carte *FT Manuel*) :
  - **Prix moyen pondéré (PMP)** — méthode *PMP* : la moyenne pondérée des prix TTC de vos achats (et transferts reçus, côté activité) depuis le dernier inventaire — voir [Le prix moyen pondéré](#calc-pmp). C'est ce prix qui sert à valoriser les productions.
  - **Dernier prix** — méthode *DP* : le dernier prix TTC enregistré pour l'article.
  - **Prix manuel** — carte *FT Manuel* : un prix que vous saisissez vous-même, mémorisé par base de prix, pour simuler un coût.
- **La base de prix choisie** : la fiche technique se génère pour une ou plusieurs bases (activités ou labos assignés au produit) — les prix proviennent du stock de chaque base, avec repli sur les prix du labo lié quand un article n'a pas encore de prix côté activité. Un produit fabriqué au labo se calcule uniquement sur ses bases labo.
- **Les portions personnalisées** : au moment d'une production, vous pouvez ajuster ponctuellement les quantités réellement consommées ; les déductions de stock suivent ces quantités, sans modifier la fiche technique (l'entrée du produit fini reste valorisée au coût de la recette standard).

:::formule Coût de revient d'une recette
Coût total = somme(portion ingrédient × prix unitaire TTC) + somme(portion sous-produit × coût de revient du sous-produit)
note: le coût de chaque sous-produit est calculé récursivement avec la même règle, aux mêmes prix.
:::

:::exemple
Recette « Tarte aux fraises » (pour 1 tarte), valorisée au PMP TTC de l'activité :

- Farine : 0,250 kg × 2,400 DT/kg = 0,600 DT
- Fraises : 0,300 kg × 8,000 DT/kg = 2,400 DT
- Sucre : 0,100 kg × 3,200 DT/kg = 0,320 DT
- Crème pâtissière (sous-produit) : 0,500 unité × 4,440 DT/unité = 2,220 DT

Le coût de la crème pâtissière (4,440 DT) est lui-même calculé à partir de sa propre recette : lait 0,500 L × 2,000 DT = 1,000 DT ; œufs 4 pièces × 0,700 DT = 2,800 DT ; sucre 0,200 kg × 3,200 DT = 0,640 DT.

**Coût de revient de la tarte = 0,600 + 2,400 + 0,320 + 2,220 = 5,540 DT TTC.**
:::

### Ce qui peut faire varier le résultat

- Chaque nouvel achat à un prix différent déplace le PMP, donc le coût de revient recalculé.
- Un inventaire redémarre la période de calcul du PMP : le coût peut évoluer juste après.
- Si un ingrédient n'a encore aucun prix connu (jamais approvisionné), sa part est comptée à zéro : le coût affiché est alors incomplet.
- La modification ou la suppression d'une ligne d'approvisionnement passée change le PMP, donc le coût, rétroactivement.
- Une recette ne peut pas se contenir elle-même (directement ou via ses sous-produits) : le calcul le refuse.

### Voir aussi

- [Fiches techniques](#fiches-techniques)
- [Le prix moyen pondéré](#calc-pmp)
- [La production d'un produit transformé](#calc-production-pt)
- [HT et TTC](#calc-ht-ttc)
- [Lexique des produits transformés](#lexique-pt)