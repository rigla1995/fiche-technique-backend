## 📋 Fiches Techniques & coût de revient

La fiche technique détaille la **composition d'un produit** et calcule son **coût de revient matière**. Vous y accédez par le bouton **Fiche tech.** présent sur chaque carte produit — Produits Vendables, Produits Utilisables et Produits Valorisés composés.

### Ce que vous voyez

La fenêtre Fiche Technique affiche :

1. **La composition du produit** : chaque ingrédient avec sa portion et son unité, et les sous-préparations (↳) avec leurs propres composants.
2. Le choix du mode : **📦 FT Stock** (prix issus de vos approvisionnements) ou **✏️ FT Manuel** (prix saisis à la main).
3. En FT Stock, la **base de prix** : cochez une ou plusieurs bases parmi les **activités et labos assignés** au produit, puis la ou les **méthodes** — **DP (Dernier Prix)** et/ou **PMP (Prix Moyen Pondéré)**.
4. Le **coût en temps réel, ligne par ligne** : une ligne par base et par méthode (ex. « 🏪 Boutique · PMP = 4.250 DT », « 🏭 Labo · DP = 3.980 DT »). Un ⚠ signale les bases où des articles n'ont pas encore d'approvisionnement (coût partiel).

### Les méthodes de valorisation

| Méthode | Principe |
|---|---|
| **DP** — Dernier Prix | Chaque article est valorisé au prix TTC de son **dernier approvisionnement** |
| **PMP** — Prix Moyen Pondéré | Chaque article est valorisé à la **moyenne pondérée des prix d'appro depuis le dernier inventaire** |
| ✏️ FT Manuel | Vous **saisissez les prix** vous-même ; ils sont mémorisés **par base de prix**, avec leur date de mise à jour |

DP et PMP sont cumulables : chaque fichier Excel généré contient alors **deux onglets**, un par méthode.

### Actions pas à pas

**Générer une fiche sur les prix du stock**

1. Choisissez **📦 FT Stock**, puis cochez la ou les **bases de prix** (activités / labos assignés au produit) et la ou les méthodes **DP / PMP**.
2. Contrôlez les coûts en temps réel, puis cliquez sur **Générer** : LabFlow produit **un fichier Excel par base sélectionnée** (deux bases = deux fichiers), chacun avec un onglet par méthode cochée, à la charte LabFlow.

**Générer une fiche en prix manuels**

1. Choisissez **✏️ FT Manuel** et sélectionnez la **base de prix** concernée — les prix manuels sont mémorisés séparément pour chaque base.
2. Cliquez **Saisir les prix manuels** : la fenêtre liste tous les articles de la recette, y compris ceux des sous-préparations (groupes indentés ↳), avec un champ de recherche. Tant qu'un prix est à 0, une alerte « Prix incomplets » bloque l'enregistrement et la génération.
3. Enregistrez puis cliquez sur **Générer** ; la date de dernière mise à jour des prix reste affichée.

### Formules de calcul

:::formule Coût d'une ligne d'ingrédient
Coût ligne = portion × prix unitaire
note: La portion est exprimée dans l'unité de l'article.
:::

:::formule Coût total du produit
Coût total = Σ ( coûts des articles ) + Σ ( portion sous-produit × coût unitaire du sous-produit )
note: Le calcul descend récursivement dans chaque sous-préparation — détail dans [Comprendre le coût d'une recette](#calc-cout-recette).
:::

### Points d'attention

:::regle
Un produit **fabriqué au labo** (composé valorisé) est limité aux transferts côté activité : seules ses **bases labo** sont proposées pour la fiche technique.
:::

:::attention
Une base dont certains articles n'ont **pas d'approvisionnement** est signalée par un ⚠ : son coût affiché et exporté est **partiel** (articles manquants comptés à 0). Complétez vos appros, ou utilisez le mode manuel.
:::

:::astuce
Comparez **DP et PMP** sur un même produit : un écart important signale des prix d'achat volatils, à surveiller avant de fixer vos prix de vente.
:::

### Voir aussi

- [Comprendre le coût d'une recette](#calc-cout-recette)
- [Prix moyen pondéré](#calc-pmp) et [HT / TTC](#calc-ht-ttc)
- [Fixation des prix de vente](#calc-prix)
- [Produits Vendables](#produits-vendables) et [Produits Utilisables](#produits-utilisables)
- [Stock des activités](#stock-activites)