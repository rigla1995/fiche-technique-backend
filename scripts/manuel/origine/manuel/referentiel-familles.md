## 🗂️ Familles

Les familles regroupent vos catégories d'articles (ex. « Viandes », « Épicerie », « Boissons ») et portent deux propriétés qui déterminent la nature de tous les articles rattachés : **Consommable** et **Vendable**. Vous les gérez depuis le menu **Référentiel → Familles**.

### Ce que vous voyez

- Un bandeau d'en-tête avec le **nombre total de familles**.
- Une barre de filtres : champ **Recherche**, compteur de résultats, bouton **Réinitialiser** et bouton **+ Nouvelle famille**.
- Un tableau à quatre colonnes : **Nom**, **Consommable** (interrupteur Oui/Non), **Vendable** (interrupteur Oui/Non) et **Actions** (✏️ Modifier, corbeille 🗑️).

Les interrupteurs Consommable et Vendable sont **cliquables directement dans le tableau** : un clic bascule la propriété immédiatement, sans passer par une fenêtre de modification.

### Le rôle des deux propriétés

| Consommable | Vendable | Nature des articles de la famille |
|---|---|---|
| Oui | Oui ou Non | Ingrédient : suivi en stock, utilisable dans les fiches techniques |
| Non | Oui | Article valorisé : vendu tel quel, sans recette |

:::regle
Un article ne devient « valorisé » que si sa famille est **Vendable = Oui** et **Consommable = Non**. Voir [Articles Valorisés](#articles-valorises).
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
La corbeille est **grisée** lorsque des articles de la famille ont des approvisionnements enregistrés : la suppression est bloquée. Survolez le bouton pour afficher l'explication.
:::

:::attention
Basculer un interrupteur modifie la nature de **tous les articles** rattachés à la famille. Vérifiez l'impact avant de désactiver Consommable ou Vendable sur une famille déjà utilisée en stock ou en vente.
:::

:::astuce
Définissez vos familles avant vos catégories et vos articles : la hiérarchie du référentiel va des familles vers les catégories, puis vers les articles.
:::

### Voir aussi

- [Catégories](#referentiel-categories) — chaque catégorie se rattache à une famille
- [Articles Valorisés](#articles-valorises) — issus des familles vendables non consommables
- [Articles](#referentiel-articles)
- [Lexique](#lexique)