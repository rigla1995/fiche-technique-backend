## 🏷️ Qui fixe quel prix

LabFlow manipule quatre prix différents, chacun saisi ou calculé à un moment précis. Comprendre qui fixe quoi évite bien des confusions à la lecture [[un:stock:pl]] et des rapports.

### La règle

| Prix | Qui le fixe | Quand | À quoi il sert |
|---|---|---|---|
| Prix d'achat | vous (HT + taux de TVA) | à chaque [[nom:appro]] | PMP, valeur [[de:stock]], coût [[un:recette:pl]] |
| Prix de vente (PV) | vous, par [[nom:produit]] et par [[nom:activite]] | dans la configuration [[du:vente]] | chiffre d'affaires, [[nom:marge:pl]] |
| Prix de cession | vous (pré-rempli par le système) | à chaque [[nom:transfert]] [[compl:labo]] → [[nom:activite]] | coût d'entrée côté [[nom:activite]] |
| Prix d'un composé valorisé | calculé par LabFlow | à chaque production [[au:labo]] | valeur [[du:produit]] [[acc:produit:fini:finie]], [[nom:transfert:pl]], rapports |

### Le prix d'achat : saisi HT, affiché TTC

[[Au:appro]], vous saisissez le prix **hors taxes** et le **taux de TVA**. Le système calcule le TTC, et c'est lui qui est affiché dans [[le:stock:pl]], les rapports et les tableaux de bord.

:::formule Prix TTC
PRIX TTC = PRIX HT × (1 + TVA ÷ 100)
:::

### Le prix de vente (PV)

Le PV se définit pour chaque [[nom:produit_vendable]], **[[nom:activite]] par [[nom:activite]]**, dans la configuration [[du:vente]]. Il doit être renseigné (supérieur à zéro) pour qu'[[un:produit]] soit [[acc:produit:actif:active]] [[au:vente]], et chaque modification est conservée dans un historique de prix.

### Le prix de cession

[[Au:transfert]], le prix proposé est le PMP TTC [[du:labo]] pour [[un:article]], ou le coût [[de:recette]] [[au:labo]] pour [[un:pt]] ; vous pouvez l'ajuster avant de valider. Voir [Valorisation [[un:transfert:pl]]](#calc-transferts).

### Le prix figé des composés valorisés

Un **composé valorisé** est [[un:produit_vendable]] [[acc:produit_vendable:fabriqué:fabriquée]] [[au:labo]]. « Valorisé » signifie que sa valeur ne provient pas d'un prix d'achat [[nom:fournisseur]] : elle est **calculée** à partir du coût réel de [[son:recette]] — [[nom:article:pl]] au PMP TTC, sous-produits compris — au moment précis de la production, puis **figée** sur cette production. Les variations de prix ultérieures ne touchent pas les unités déjà produites : la production suivante portera son propre coût.

:::exemple
- Achat : 100 kg de farine à 1,200 DT HT, TVA 7 % → 1,284 DT TTC le kg, soit 128,400 DT TTC.
- Production [[au:labo]] : [[le:recette]] du « Millefeuille » consomme 2,150 DT TTC [[de:article:pl]] au PMP du jour → chaque unité produite est figée à 2,150 DT.
- [[Nom:transfert]] : les millefeuilles partent vers [[le:activite]] au prix de cession proposé de 2,150 DT (ajustable).
- [[Nom:vente]] : dans la configuration [[du:vente]] [[du:activite]], le PV du millefeuille est fixé à 4,500 DT → [[nom:marge]] [[acc:marge:brut:brute]] de 2,350 DT par pièce.

Le lendemain, la farine augmente : les millefeuilles déjà produits restent valorisés 2,150 DT ; la production suivante sera figée à son nouveau coût.
:::

### Variations

- [[Le:pt:pl]] [[acc:pt:fabriqué:fabriquée:pl]] **dans [[un:activite]]** suivent le même principe : coût [[de:recette]] calculé et figé à chaque production.
- [[acc:produit:Un même:Une même]] [[nom:produit]] peut avoir un **PV différent** dans chaque [[nom:activite]].

:::regle
Convention d'affichage : les prix d'achat se saisissent en HT + TVA, mais tous les écrans ([[nom:stock:pl]], [[nom:pt:pl]], rapports, tableaux de bord) affichent des montants TTC.
:::

### Voir aussi

- [HT et TTC](#calc-ht-ttc)
- [Coût d'[[un:recette]]](#calc-cout-recette)
- [Production [[un:pt:pl]]](#calc-production-pt)
- [Valorisation [[un:transfert:pl]]](#calc-transferts)
- [Configuration [[du:vente]]](#configuration-vente)
- [[[Nom:article:pl]] [[acc:article:valorisé:valorisée:pl]]](#articles-valorises)