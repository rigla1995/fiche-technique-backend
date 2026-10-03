## 🍽️ Produits Vendables & Suppléments

Cet écran regroupe vos **produits finis destinés à la vente** (plats, pizzas, formules…) et vos **suppléments** (sauce, garniture vendue en plus). Vous le trouvez dans le menu **Espace Produits → Produits Vendables**. Chaque produit est défini par sa recette, qui sert au calcul de son coût de revient.

### Ce que vous voyez

- Deux onglets avec compteurs : **🍽️ Produits vendables** et **➕ Suppléments vendables**.
- Une barre de filtres : **📍 Activité**, **🏷️ Catégorie**, **🔍 Nom**, bouton **Réinitialiser**, bouton **Exporter XLS** et bouton **+ Produit vendable** (ou **+ Supplément vendable** selon l'onglet).
- Des **cartes produit** (9 par page, avec pagination) affichant : le nom, la référence éventuelle, le badge de catégorie, le bouton **👁 Voir composition** (avec un résumé du type « 2 articles · 1 PU »), les actions (**Fiche tech.**, **Modifier**, **Supprimer**) et des **pastilles d'activités** en bas de carte.

### L'assistant unique de création et de modification

Un **même assistant en 5 étapes** sert à créer ET à modifier un produit (le bouton **Modifier** l'ouvre pré-rempli) :

1. **Affectation** — cochez la ou les **activités** qui vendront ce produit (bouton « Tout sélectionner » disponible).
2. **Identité** — saisissez le **nom** (obligatoire), une **référence** (optionnelle) et la **catégorie de produit** (obligatoire, du bon type). Pour un produit vendable (hors supplément), une option **📦 « Gérer ce produit en stock (appros libres) »** permet de le suivre dans le stock des activités choisies : approvisionnements manuels, transferts, pertes, seuil et inventaire. Vous pouvez alors aussi cocher les **labos** où il sera géré.
3. **Articles** — recherchez vos ingrédients (filtres par famille et catégorie d'article), cochez-les et saisissez la **portion** dans l'unité de l'article. Seules les lignes avec une portion supérieure à 0 sont retenues.
4. **Produits Utilisables** — ajoutez d'éventuelles sous-préparations (avec leur portion). La recette doit compter **au moins 2 composants** au total ; un **supplément** en compte **exactement 1** (un article OU un produit utilisable).
5. **Récap** — vérifiez l'identité, les composants et les affectations, puis validez avec **Créer le produit ✓**. Un écran de confirmation propose **+ Ajouter un autre**.

### Actions pas à pas

**Consulter une recette** : cliquez sur **👁 Voir composition** — l'arborescence affiche les articles avec leurs portions et les sous-préparations, dépliables niveau par niveau.

**Affecter à une activité** : cliquez sur une **pastille d'activité** sous la carte ; la coche ✓ indique que le produit y est disponible.

**Exporter** : le bouton **Exporter XLS** génère la liste filtrée ; pour les vendables, une option permet d'inclure aussi l'autre onglet (suppléments ou produits) dans une feuille séparée du même fichier.

**Supprimer** : bouton **Supprimer**, puis confirmation. L'action est **irréversible**.

### Points d'attention

:::regle
Le **prix de vente ne se définit pas ici** : il se configure par activité dans la [Configuration Vente](#configuration-vente).
:::

:::attention
En tant que **gérant**, vous consultez cet écran mais la création, la modification et la suppression des produits sont réservées au compte propriétaire.
:::

:::astuce
Servez-vous des filtres Activité et Catégorie pour vérifier rapidement qu'aucun produit de la carte d'un point de vente n'a été oublié.
:::

### Voir aussi

- [Catégories Produits](#categories-produits) — à créer avant vos produits
- [Produits Utilisables](#produits-utilisables) — les sous-préparations de vos recettes
- [Fiches Techniques](#fiches-techniques) — coût de revient et export
- [Comprendre le coût d'une recette](#calc-cout-recette)
- [Configuration Vente](#configuration-vente)