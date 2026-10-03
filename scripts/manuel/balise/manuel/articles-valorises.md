## 💎 [[Titre:produit_valorise:pl]]

[[Le:produit_valorise:pl]] sont **[[acc:produit_valorise:vendus tels quels:vendues telles quelles]]**, sans décomposition en [[nom:ingredient:pl]] [[au:vente]]. Vous les gérez depuis le menu **Espace [[Pl:produit]] → [[Titre:produit_valorise:pl]]**. [[acc:produit_valorise:Ils:Elles]] sont de deux natures : [[det:article:le:pl]]**[[nom:article:pl]] [[du:referentiel]]** à catégoriser (boissons en bouteille, [[nom:produit:pl]] [[acc:produit:revendu:revendue:pl]] en l'état) et [[det:produit_compose:le:pl]]**[[nom:produit_compose:pl]] [[acc:produit_compose:fabriqué:fabriquée:pl]] [[au:labo]]** (cookie maison, pâtisserie…).

### Ce que vous voyez

- Un bandeau avec le compteur **« X/Y [[nom:article:pl]] [[acc:article:catégorisé:catégorisée:pl]] »**.
- Deux onglets : **🏭 Composés** (visible uniquement si vous avez au moins [[un:labo]]) et **💎 [[Nom:referentiel]]**.
- Onglet **[[Nom:referentiel]]** : filtres **🔍 [[Nom:article]]**, **🗂️ Famille** et **🏷️ Statut** (Tous / [[acc:article:Catégorisé:Catégorisée:pl]] / Non [[acc:article:catégorisé:catégorisée:pl]]) ; [[le:article:pl]] sont **[[acc:article:regroupé:regroupée:pl]] par catégorie [[de:article]]**, avec un tableau à deux colonnes — **[[Nom:article]]** (et son unité) et **Catégorie [[court:produit]]** (liste déroulante). La liste est paginée par 10 catégories.
- Onglet **Composés** : filtres **🔍 [[Nom:produit]]** (nom ou référence) et **🏷️ Catégorie**, bouton **+ [[Nom:produit_valorise]] [[acc:produit_valorise:composé:composée]]**, puis des cartes 💎 avec badge de catégorie, bouton **👁 Voir composition**, actions (**📄 Fiche technique (XLS)**, **✏️ Modifier**, **🗑**) et pastilles **[[Pl:activite]]** / **[[Pl:labo]]** (12 cartes par page).

### Actions pas à pas

**Catégoriser [[un:article]] [[du:referentiel]]**

1. Ouvrez l'onglet **[[Nom:referentiel]]** et retrouvez [[le:article]] via les filtres.
2. Sélectionnez sa **catégorie [[court:produit]]** (de type « [[Nom:article]] [[acc:article:valorisé:valorisée]] ») dans la liste déroulante : l'enregistrement est **immédiat**. Un liseré rouge signale [[le:article:pl]] encore sans catégorie.

**Créer [[un:produit_valorise]] [[acc:produit_valorise:composé:composée]]**

1. Dans l'onglet **Composés**, cliquez sur **+ [[Nom:produit_valorise]] [[acc:produit_valorise:composé:composée]]** : un assistant en 5 étapes s'ouvre.
2. **Affectation** — choisissez [[acc:labo:le:la]] ou [[det:labo:le:pl]]**[[court:labo:pl]] de fabrication** ; [[le:activite:pl]] [[acc:activite:rattaché:rattachée:pl]] sont [[acc:activite:pré-coché:pré-cochée:pl]] et **recevront [[le:produit]] par [[nom:transfert]]** (décochez pour exclure).
3. **Identité** — nom (obligatoire), référence, **catégorie de type valorisé** (obligatoire).
4. **[[Pl:article]]** puis **[[Titre:produit_utilisable:pl]]** — composez [[le:recette]] à partir [[du:article:pl]] et [[court:produit_utilisable:pl]] du périmètre [[compl:labo]] (au moins un composant avec [[nom:portion]]).
5. **Récap** — vérifiez puis validez avec **Créer [[le:produit]] ✓**.

**Générer [[le:fiche_technique]] d'un composé** : cliquez sur **📄 Fiche technique (XLS)**. Le coût est calculé sur les **prix [[de:appro]] [[du:labo]]** de fabrication ; si [[le:produit]] est [[acc:produit:fabriqué:fabriquée]] dans plusieurs [[nom:labo:pl]], cochez directement les bases souhaitées dans la fenêtre — un fichier Excel est généré **par [[nom:labo]] [[acc:labo:sélectionné:sélectionnée]]** (voir [[[Titre:fiche_technique:pl]]](#fiches-techniques)).

### Points d'attention

:::regle
[[Le:article:pl]] valorisables proviennent des familles marquées **« vendable »** et **« non consommable »** dans [[det:referentiel:votre]][[[nom:referentiel]]](#referentiel-familles). [[Un:article]] sans catégorie [[court:produit]] n'apparaît pas dans la configuration [[de:vente]].
:::

:::attention
Si aucune catégorie de type « [[Nom:article]] [[acc:article:valorisé:valorisée]] » n'existe, un avertissement s'affiche : créez-la d'abord dans [Catégories [[Court:produit:pl]]](#categories-produits).
:::

:::regle
Un composé valorisé est fabriqué [[au:labo]] et rejoint [[le:stock]] [[du:activite:pl]] **uniquement par [[nom:transfert]]**. Son prix est **figé au moment de chaque production** [[au:labo]] (voir [Production d'[[un:pt]]](#calc-production-pt)).
:::

:::astuce
Cocher une pastille [[de:activite]] sur un composé l'inscrit directement [[det:stock:au]]**[[nom:stock]] de [[ce:activite]]** en mode [[nom:transfert]] : pensez-y avant [[acc:transfert:votre premier:votre première]] [[nom:transfert]].
:::

### Voir aussi

- [Catégories [[Court:produit:pl]]](#categories-produits)
- [[[Nom:referentiel]] — familles](#referentiel-familles) et [[[nom:article:pl]]](#referentiel-articles)
- [[[Nom:stock]] [[court:labo]]](#stock-labo) et [[[Nom:transfert:pl]]](#transferts)
- [Production d'[[un:pt]]](#calc-production-pt)
- [[[Titre:fiche_technique:pl]]](#fiches-techniques)