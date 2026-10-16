## 🧂 [[Nom:article:pl]]

[[Le:article:pl]] sont vos matières premières et [[nom:ingredient:pl]] : c'est le cœur [[du:referentiel]], utilisé pour [[le:stock]], [[le:appro:pl]] et [[le:fiche_technique:pl]]. Vous les gérez depuis le menu **[[Nom:referentiel]] → [[Nom:article:pl]]**.

### Ce que vous voyez

- Un bandeau d'en-tête avec le **nombre total [[de:article:pl]]**.
- Une barre de filtres : champ **Recherche** (sur le nom ou le code), liste **Famille**, liste **Catégorie** (elle se limite aux catégories de la famille choisie), compteur de résultats (ex. « 12 [[nom:article:pl]] sur 87 » quand un filtre est actif) et bouton **Réinitialiser**.
- Deux boutons d'action : **+ Ajout multiple** et **+ [[Nouveau:article]]**, et le bouton **Exporter (modèle Excel)** : tout [[votre:referentiel]], codes, unités, catégories et familles compris, dans le fichier du modèle d'import — les filtres ne s'y appliquent pas.
- Une liste **groupée par famille puis par catégorie** : chaque famille forme une carte avec son nombre de catégories ; chaque catégorie se déplie d'un clic sur la flèche ▶ et affiche son nombre [[de:article:pl]] ([[le:article:pl]] non [[acc:article:classé:classée:pl]] apparaissent sous « Sans catégorie »). Chaque ligne [[de:article]] affiche son nom, son **code** en dessous (ex. FAR-0012), un badge avec son **unité**, et les boutons **✏️ Modifier** et corbeille 🗑️.

### Le code [[de:article:pl]]

Chaque [[nom:article]] porte un **code unique** dans votre compte, bâti sur le **préfixe de sa catégorie** (voir [Catégories](#referentiel-categories)) suivi d'un numéro : FAR-0001, FAR-0002… pour « Farines », SUC-0001 pour « Sucres ». Il est **proposé** à la création — gardez-le ou saisissez le vôtre (2 à 20 caractères : lettres, chiffres, tirets) — et se modifie dans la fiche. [[Un:article]] qui change de catégorie **garde son code**. Le code accompagne le nom partout où [[le:article]] paraît ([[nom:stock]], [[nom:transfert:pl]], inventaires, historiques, factures fournisseur, exports) et sert à la comptabilité : les lignes envoyées à LabFlow Compta le portent (« FAR-0012 Farine ») et la page Comptes d'achat l'affiche. [[Le:article:pl]] créés avant cette version ont reçu leur code automatiquement, dans l'ordre de création de chaque catégorie.

### Actions pas à pas

Créer [[un:article]] (assistant en deux étapes) :

1. Cliquez sur **+ [[Nouveau:article]]**.
2. Étape **Informations** : saisissez le **nom**, choisissez l'**unité** et la **catégorie** (présentée sous la forme Famille › Catégorie) ; le **code** proposé s'affiche, modifiable. Si aucune catégorie n'existe, un message vous invite à en créer d'abord dans [[le:referentiel]]. Cliquez sur **Suivant →**.
3. Étape **Affectation** : cochez [[le:activite:pl]] 📍 et/ou [[nom:labo:pl]] 🏭 où [[le:article]] sera [[acc:article:utilisé:utilisée]] — **au moins un est requis**. Le bouton **Tout sélectionner** coche tout d'un coup et un compteur suit votre sélection.
4. Cliquez sur **Créer [[le:article]]**. Le bouton **← Retour** permet de revenir à l'étape 1.

Créer plusieurs [[nom:article:pl]] d'un coup :

1. Cliquez sur **+ Ajout multiple**.
2. Remplissez chaque ligne : **Nom**, **Unité**, **Catégorie** (le code de chaque ligne est proposé à la création), puis cliquez sur **+ Affecter** pour cocher [[le:activite:pl]] 📍 et [[nom:labo:pl]] 🏭 de la ligne (le bouton affiche ensuite le nombre d'affectations).
3. Ajoutez des lignes avec **+ Ajouter une ligne**, puis cliquez sur **Créer**. Chaque ligne doit être complète (affectation comprise) pour valider.

Modifier [[un:article]] et ses affectations :

1. Cliquez sur **✏️ Modifier** : ajustez le nom, le **code**, l'unité, la catégorie (ou « Sans catégorie »), puis **Enregistrer**. Un code déjà pris par [[un:article]] ou [[un:produit]] est refusé.
2. Dans la section **Affectations** de la même fenêtre, cliquez sur [[un:activite]] ou [[un:labo]] pour l'ajouter ou [[acc:labo:le:la]] retirer : chaque clic est **enregistré immédiatement**, sans passer par Enregistrer.

Supprimer [[un:article]] :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**. [[Le:stock:pl]] et historiques liés sont conservés.

### Points d'attention

:::attention
La corbeille est **grisée** si [[le:article]] a [[un:appro:pl]] [[acc:appro:enregistré:enregistrée:pl]] : la suppression est bloquée.
:::

:::attention
[[Un:article]] non [[acc:article:affecté:affectée]] à [[un:activite]] ou [[un:labo]] n'y apparaît ni en [[nom:stock]], ni en [[nom:appro]], ni dans [[le:fiche_technique:pl]]. L'affectation est la clé qui rend [[le:article]] utilisable sur le terrain.
:::

:::astuce
Pour un gros volume [[de:article:pl]], préférez l'[Ajout dynamique](#referentiel-import) par fichier Excel, puis affinez les affectations depuis la fiche de chaque [[nom:article]]. Le fichier exporté se réimporte tel quel par l'Ajout dynamique, par exemple dans un autre compte.
:::

### Voir aussi

- [Unités](#referentiel-unites) et [Catégories](#referentiel-categories) — à préparer avant de créer [[votre:article:pl]]
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) et [[[Nom:fiche_technique:pl]]](#fiches-techniques) — où [[votre:article:pl]] sont [[acc:article:utilisé:utilisée:pl]]
