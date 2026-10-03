## 💎 Produits Valorisés

Les produits valorisés sont **vendus tels quels**, sans décomposition en ingrédients à la vente. Vous les gérez depuis le menu **Espace Produits → Produits Valorisés**. Ils sont de deux natures : les **articles du référentiel** à catégoriser (boissons en bouteille, produits revendus en l'état) et les **produits composés fabriqués au labo** (cookie maison, pâtisserie…).

### Ce que vous voyez

- Un bandeau avec le compteur **« X/Y articles catégorisés »**.
- Deux onglets : **🏭 Composés** (visible uniquement si vous avez au moins un labo) et **💎 Référentiel**.
- Onglet **Référentiel** : filtres **🔍 Article**, **🗂️ Famille** et **🏷️ Statut** (Tous / Catégorisés / Non catégorisés) ; les articles sont **regroupés par catégorie d'article**, avec un tableau à deux colonnes — **Article** (et son unité) et **Catégorie produit** (liste déroulante). La liste est paginée par 10 catégories.
- Onglet **Composés** : filtres **🔍 Produit** (nom ou référence) et **🏷️ Catégorie**, bouton **+ Produit valorisé composé**, puis des cartes 💎 avec badge de catégorie, bouton **👁 Voir composition**, actions (**📄 Fiche technique (XLS)**, **✏️ Modifier**, **🗑**) et pastilles **Activités** / **Labos** (12 cartes par page).

### Actions pas à pas

**Catégoriser un article du référentiel**

1. Ouvrez l'onglet **Référentiel** et retrouvez l'article via les filtres.
2. Sélectionnez sa **catégorie produit** (de type « Article valorisé ») dans la liste déroulante : l'enregistrement est **immédiat**. Un liseré rouge signale les articles encore sans catégorie.

**Créer un produit valorisé composé**

1. Dans l'onglet **Composés**, cliquez sur **+ Produit valorisé composé** : un assistant en 5 étapes s'ouvre.
2. **Affectation** — choisissez le ou les **labos de fabrication** ; les activités rattachées sont pré-cochées et **recevront le produit par transfert** (décochez pour exclure).
3. **Identité** — nom (obligatoire), référence, **catégorie de type valorisé** (obligatoire).
4. **Articles** puis **Produits Utilisables** — composez la recette à partir des articles et PU du périmètre labo (au moins un composant avec portion).
5. **Récap** — vérifiez puis validez avec **Créer le produit ✓**.

**Générer la fiche technique d'un composé** : cliquez sur **📄 Fiche technique (XLS)**. Le coût est calculé sur les **prix d'approvisionnement du labo** de fabrication ; si le produit est fabriqué dans plusieurs labos, cochez directement les bases souhaitées dans la fenêtre — un fichier Excel est généré **par labo sélectionné** (voir [Fiches Techniques](#fiches-techniques)).

### Points d'attention

:::regle
Les articles valorisables proviennent des familles marquées **« vendable »** et **« non consommable »** dans votre [référentiel](#referentiel-familles). Un article sans catégorie produit n'apparaît pas dans la configuration de vente.
:::

:::attention
Si aucune catégorie de type « Article valorisé » n'existe, un avertissement s'affiche : créez-la d'abord dans [Catégories Produits](#categories-produits).
:::

:::regle
Un composé valorisé est fabriqué au labo et rejoint le stock des activités **uniquement par transfert**. Son prix est **figé au moment de chaque production** au labo (voir [Production d'un produit transformé](#calc-production-pt)).
:::

:::astuce
Cocher une pastille d'activité sur un composé l'inscrit directement au **stock de cette activité** en mode transfert : pensez-y avant votre premier transfert.
:::

### Voir aussi

- [Catégories Produits](#categories-produits)
- [Référentiel — familles](#referentiel-familles) et [articles](#referentiel-articles)
- [Stock labo](#stock-labo) et [Transferts](#transferts)
- [Production d'un produit transformé](#calc-production-pt)
- [Fiches Techniques](#fiches-techniques)