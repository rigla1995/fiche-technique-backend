## 🗂️ Familles

Les familles regroupent vos catégories [[de:article:pl]] (ex. « Viandes », « Épicerie », « Boissons ») et portent deux propriétés qui déterminent la nature de [[tous:article:les]] [[acc:article:rattaché:rattachée:pl]] : **Consommable** et **Vendable**. Vous les gérez depuis le menu **[[Nom:referentiel]] → Familles**.

### Ce que vous voyez

- Un bandeau d'en-tête avec le **nombre total de familles**.
- Une barre de filtres : champ **Recherche**, compteur de résultats, bouton **Réinitialiser** et bouton **+ Nouvelle famille**.
- Un tableau à quatre colonnes : **Nom**, **Consommable** (interrupteur Oui/Non), **Vendable** (interrupteur Oui/Non) et **Actions** (✏️ Modifier, corbeille 🗑️).

Les interrupteurs Consommable et Vendable sont **cliquables directement dans le tableau** : un clic bascule la propriété immédiatement, sans passer par une fenêtre de modification.

### Le rôle des deux propriétés

| Consommable | Vendable | Nature [[du:article:pl]] de la famille |
|---|---|---|
| Oui | Oui ou Non | [[Nom:ingredient]] : [[acc:ingredient:suivi:suivie]] en [[nom:stock]], utilisable dans [[le:fiche_technique:pl]] |
| Non | Oui | [[Nom:article]] [[acc:article:valorisé:valorisée]] : [[acc:article:vendu:vendue]] [[acc:article:tel quel:telle quelle]], sans [[nom:recette]] |

:::regle
[[Un:article]] ne devient « [[acc:article:valorisé:valorisée]] » que si sa famille est **Vendable = Oui** et **Consommable = Non**. Voir [Articles Valorisés](#articles-valorises).
:::

### Actions pas à pas

Créer une ou plusieurs familles :

1. Cliquez sur **+ Nouvelle famille**.
2. Saisissez le nom (ex. Produits laitiers) et réglez les interrupteurs **Consommable** et **Vendable** de la ligne — tous deux activés par défaut.
3. Cliquez sur **+ Ajouter une ligne** pour en créer plusieurs d'un coup (la touche Entrée sur la dernière ligne fonctionne aussi), puis sur **Enregistrer**.

Modifier une famille :

1. Cliquez sur **✏️ Modifier**, ajustez le nom et/ou les deux interrupteurs, puis **Enregistrer**.

Supprimer une famille :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**.
2. Les catégories rattachées perdront leur famille : pensez à les reclasser depuis l'écran [Catégories](#referentiel-categories).

### Points d'attention

:::attention
La corbeille est **grisée** lorsque [[un:article:pl]] de la famille ont [[un:appro:pl]] [[acc:appro:enregistré:enregistrée:pl]] : la suppression est bloquée. Survolez le bouton pour afficher l'explication.
:::

:::attention
Basculer un interrupteur modifie la nature de **[[tous:article:les]]** [[acc:article:rattaché:rattachée:pl]] à la famille. Vérifiez l'impact avant de désactiver Consommable ou Vendable sur une famille déjà utilisée en [[nom:stock]] ou en [[nom:vente]].
:::

:::astuce
Définissez vos familles avant vos catégories et [[votre:article:pl]] : la hiérarchie [[du:referentiel]] va des familles vers les catégories, puis vers [[le:article:pl]].
:::

### Voir aussi

- [Catégories](#referentiel-categories) — chaque catégorie se rattache à une famille
- [Articles Valorisés](#articles-valorises) — issus des familles vendables non consommables
- [[[Nom:article:pl]]](#referentiel-articles)
- [Lexique](#lexique)