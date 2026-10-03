## 🏷️ Qui fixe quel prix

LabFlow manipule quatre prix différents, chacun saisi ou calculé à un moment précis. Comprendre qui fixe quoi évite bien des confusions à la lecture des stocks et des rapports.

### La règle

| Prix | Qui le fixe | Quand | À quoi il sert |
|---|---|---|---|
| Prix d'achat | vous (HT + taux de TVA) | à chaque approvisionnement | PMP, valeur de stock, coût des recettes |
| Prix de vente (PV) | vous, par produit et par activité | dans la configuration de la vente | chiffre d'affaires, marges |
| Prix de cession | vous (pré-rempli par le système) | à chaque transfert labo → activité | coût d'entrée côté activité |
| Prix d'un composé valorisé | calculé par LabFlow | à chaque production au labo | valeur du produit fini, transferts, rapports |

### Le prix d'achat : saisi HT, affiché TTC

À l'approvisionnement, vous saisissez le prix **hors taxes** et le **taux de TVA**. Le système calcule le TTC, et c'est lui qui est affiché dans les stocks, les rapports et les tableaux de bord.

:::formule Prix TTC
PRIX TTC = PRIX HT × (1 + TVA ÷ 100)
:::

### Le prix de vente (PV)

Le PV se définit pour chaque produit vendable, **activité par activité**, dans la configuration de la vente. Il doit être renseigné (supérieur à zéro) pour qu'un produit soit actif à la vente, et chaque modification est conservée dans un historique de prix.

### Le prix de cession

Au transfert, le prix proposé est le PMP TTC du labo pour un article, ou le coût de recette au labo pour un produit transformé ; vous pouvez l'ajuster avant de valider. Voir [Valorisation des transferts](#calc-transferts).

### Le prix figé des composés valorisés

Un **composé valorisé** est un produit vendable fabriqué au labo. « Valorisé » signifie que sa valeur ne provient pas d'un prix d'achat fournisseur : elle est **calculée** à partir du coût réel de sa recette — articles au PMP TTC, sous-produits compris — au moment précis de la production, puis **figée** sur cette production. Les variations de prix ultérieures ne touchent pas les unités déjà produites : la production suivante portera son propre coût.

:::exemple
- Achat : 100 kg de farine à 1,200 DT HT, TVA 7 % → 1,284 DT TTC le kg, soit 128,400 DT TTC.
- Production au labo : la recette du « Millefeuille » consomme 2,150 DT TTC d'articles au PMP du jour → chaque unité produite est figée à 2,150 DT.
- Transfert : les millefeuilles partent vers l'activité au prix de cession proposé de 2,150 DT (ajustable).
- Vente : dans la configuration de la vente de l'activité, le PV du millefeuille est fixé à 4,500 DT → marge brute de 2,350 DT par pièce.

Le lendemain, la farine augmente : les millefeuilles déjà produits restent valorisés 2,150 DT ; la production suivante sera figée à son nouveau coût.
:::

### Variations

- Les produits transformés fabriqués **dans une activité** suivent le même principe : coût de recette calculé et figé à chaque production.
- Un même produit peut avoir un **PV différent** dans chaque activité.

:::regle
Convention d'affichage : les prix d'achat se saisissent en HT + TVA, mais tous les écrans (stocks, produits transformés, rapports, tableaux de bord) affichent des montants TTC.
:::

### Voir aussi

- [HT et TTC](#calc-ht-ttc)
- [Coût d'une recette](#calc-cout-recette)
- [Production des produits transformés](#calc-production-pt)
- [Valorisation des transferts](#calc-transferts)
- [Configuration de la vente](#configuration-vente)
- [Articles valorisés](#articles-valorises)