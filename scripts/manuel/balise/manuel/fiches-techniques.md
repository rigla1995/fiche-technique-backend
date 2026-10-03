## 📋 [[Titre:fiche_technique:pl]] & coût de revient

[[Le:fiche_technique]] détaille la **composition d'[[un:produit]]** et calcule son **coût de revient matière**. Vous y accédez par le bouton **Fiche tech.** présent sur chaque carte [[nom:produit]] — [[Titre:produit_vendable:pl]], [[Titre:produit_utilisable:pl]] et [[Titre:produit_valorise:pl]] [[acc:produit_valorise:composé:composée:pl]].

### Ce que vous voyez

La fenêtre [[Titre:fiche_technique]] affiche :

1. **La composition [[du:produit]]** : chaque [[nom:ingredient]] avec [[son:portion]] et son unité, et les sous-préparations (↳) avec leurs propres composants.
2. Le choix du mode : **📦 [[Court:fiche_technique]] [[Court:stock]]** (prix issus de [[votre:appro:pl]]) ou **✏️ [[Court:fiche_technique]] Manuel** (prix saisis à la main).
3. En [[Court:fiche_technique]] [[Court:stock]], la **base de prix** : cochez une ou plusieurs bases parmi [[det:activite:le:pl]]**[[nom:activite:pl]] et [[nom:labo:pl]] assignés** [[au:produit]], puis la ou les **méthodes** — **DP (Dernier Prix)** et/ou **PMP (Prix Moyen Pondéré)**.
4. Le **coût en temps réel, ligne par ligne** : une ligne par base et par méthode (ex. « 🏪 Boutique · PMP = 4.250 DT », « 🏭 [[Nom:labo]] · DP = 3.980 DT »). Un ⚠ signale les bases où [[un:article:pl]] n'ont pas encore [[de:appro]] (coût partiel).

### Les méthodes de valorisation

| Méthode | Principe |
|---|---|
| **DP** — Dernier Prix | Chaque [[nom:article]] est [[acc:article:valorisé:valorisée]] au prix TTC de [[acc:appro:son:sa]] **[[acc:appro:dernier:dernière]] [[nom:appro]]** |
| **PMP** — Prix Moyen Pondéré | Chaque [[nom:article]] est [[acc:article:valorisé:valorisée]] à la **moyenne pondérée des prix [[de:appro:court]] depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]]** |
| ✏️ [[Court:fiche_technique]] Manuel | Vous **saisissez les prix** vous-même ; ils sont mémorisés **par base de prix**, avec leur date de mise à jour |

DP et PMP sont cumulables : chaque fichier Excel généré contient alors **deux onglets**, un par méthode.

### Actions pas à pas

**Générer une fiche sur les prix [[du:stock]]**

1. Choisissez **📦 [[Court:fiche_technique]] [[Court:stock]]**, puis cochez la ou les **bases de prix** ([[nom:activite:pl]] / [[nom:labo:pl]] assignés [[au:produit]]) et la ou les méthodes **DP / PMP**.
2. Contrôlez les coûts en temps réel, puis cliquez sur **Générer** : LabFlow produit **un fichier Excel par base sélectionnée** (deux bases = deux fichiers), chacun avec un onglet par méthode cochée, à la charte LabFlow.

**Générer une fiche en prix manuels**

1. Choisissez **✏️ [[Court:fiche_technique]] Manuel** et sélectionnez la **base de prix** concernée — les prix manuels sont mémorisés séparément pour chaque base.
2. Cliquez **Saisir les prix manuels** : la fenêtre liste [[tous:article:les]] [[du:recette]], y compris [[acc:article:ceux:celles]] des sous-préparations (groupes indentés ↳), avec un champ de recherche. Tant qu'un prix est à 0, une alerte « Prix incomplets » bloque l'enregistrement et la génération.
3. Enregistrez puis cliquez sur **Générer** ; la date de dernière mise à jour des prix reste affichée.

### Formules de calcul

:::formule Coût d'une ligne [[de:ingredient]]
Coût ligne = [[nom:portion]] × prix unitaire
note: [[Le:portion]] est [[acc:portion:exprimé:exprimée]] dans l'unité [[du:article]].
:::

:::formule Coût total [[du:produit]]
Coût total = Σ ( coûts [[du:article:pl]] ) + Σ ( [[nom:portion]] sous-produit × coût unitaire du sous-produit )
note: Le calcul descend récursivement dans chaque sous-préparation — détail dans [Comprendre le coût d'[[un:recette]]](#calc-cout-recette).
:::

### Points d'attention

:::regle
[[Un:produit]] **[[acc:produit:fabriqué:fabriquée]] [[au:labo]]** (composé valorisé) est [[acc:produit:limité:limitée]] [[au:transfert:pl]] côté [[nom:activite]] : seules ses **bases [[compl:labo]]** sont proposées pour [[le:fiche_technique]].
:::

:::attention
Une base dont [[acc:article:certain:certaine:pl]] [[nom:article:pl]] n'ont **pas [[de:appro]]** est signalée par un ⚠ : son coût affiché et exporté est **partiel** ([[nom:article:pl]] [[acc:article:manquant:manquante:pl]] [[acc:article:compté:comptée:pl]] à 0). Complétez [[votre:appro:pl:court]], ou utilisez le mode manuel.
:::

:::astuce
Comparez **DP et PMP** sur [[acc:produit:un même:une même]] [[nom:produit]] : un écart important signale des prix d'achat volatils, à surveiller avant de fixer vos prix de vente.
:::

### Voir aussi

- [Comprendre le coût d'[[un:recette]]](#calc-cout-recette)
- [Prix moyen pondéré](#calc-pmp) et [HT / TTC](#calc-ht-ttc)
- [Fixation des prix de vente](#calc-prix)
- [[[Titre:produit_vendable:pl]]](#produits-vendables) et [[[Titre:produit_utilisable:pl]]](#produits-utilisables)
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites)