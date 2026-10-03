## 🍽️ [[Titre:produit_vendable:pl]] & [[Nom:supplement:pl]]

Cet écran regroupe [[det:produit:votre:pl]]**[[nom:produit:pl]] [[acc:produit:fini:finie:pl]] [[acc:produit:destiné:destinée:pl]] [[au:vente]]** (plats, pizzas, formules…) et [[det:supplement:votre:pl]]**[[nom:supplement:pl]]** (sauce, garniture vendue en plus). Vous le trouvez dans le menu **Espace [[Pl:produit]] → [[Titre:produit_vendable:pl]]**. Chaque [[nom:produit]] est [[acc:produit:défini:définie]] par [[son:recette]], qui sert au calcul de son coût de revient.

### Ce que vous voyez

- Deux onglets avec compteurs : **🍽️ [[Pl:produit_vendable]]** et **➕ [[Pl:supplement]] vendables**.
- Une barre de filtres : **📍 [[Nom:activite]]**, **🏷️ Catégorie**, **🔍 Nom**, bouton **Réinitialiser**, bouton **Exporter XLS** et bouton **+ [[Nom:produit_vendable]]** (ou **+ [[Nom:supplement]] vendable** selon l'onglet).
- Des **cartes [[nom:produit]]** (9 par page, avec pagination) affichant : le nom, la référence éventuelle, le badge de catégorie, le bouton **👁 Voir composition** (avec un résumé du type « 2 [[nom:article:pl]] · 1 [[court:produit_utilisable]] »), les actions (**Fiche tech.**, **Modifier**, **Supprimer**) et des **pastilles [[de:activite:pl]]** en bas de carte.

### L'assistant unique de création et de modification

Un **même assistant en 5 étapes** sert à créer ET à modifier [[un:produit]] (le bouton **Modifier** l'ouvre pré-rempli) :

1. **Affectation** — cochez [[acc:activite:le:la]] ou [[det:activite:le:pl]]**[[nom:activite:pl]]** qui vendront [[ce:produit]] (bouton « Tout sélectionner » disponible).
2. **Identité** — saisissez le **nom** (obligatoire), une **référence** (optionnelle) et la **catégorie [[de:produit]]** (obligatoire, du bon type). Pour [[un:produit_vendable]] (hors [[nom:supplement]]), une option **📦 « Gérer [[ce:produit]] en [[nom:stock]] ([[court:appro:pl]] libres) »** permet de [[acc:produit_vendable:le:la]] suivre dans [[le:stock]] [[du:activite:pl]] [[acc:activite:choisi:choisie:pl]] : [[nom:appro:pl]] [[acc:appro:manuel:manuelle:pl]], [[nom:transfert:pl]], [[nom:perte:pl]], seuil et [[nom:inventaire]]. Vous pouvez alors aussi cocher [[det:labo:le:pl]]**[[nom:labo:pl]]** où [[acc:produit_vendable:il:elle]] sera [[acc:produit_vendable:géré:gérée]].
3. **[[Pl:article]]** — recherchez [[votre:article_ingredient:pl]] (filtres par famille et catégorie [[de:article]]), cochez-les et saisissez [[det:portion:le]]**[[nom:portion]]** dans l'unité [[du:article]]. Seules les lignes avec [[un:portion]] [[acc:portion:supérieur:supérieure]] à 0 sont retenues.
4. **[[Titre:produit_utilisable:pl]]** — ajoutez d'éventuelles sous-préparations (avec leur [[nom:portion]]). [[Le:recette]] doit compter **au moins 2 composants** au total ; [[det:supplement:un]]**[[nom:supplement]]** en compte **exactement 1** ([[un:article]] OU [[un:produit_utilisable]]).
5. **Récap** — vérifiez l'identité, les composants et les affectations, puis validez avec **Créer [[le:produit]] ✓**. Un écran de confirmation propose **+ Ajouter un autre**.

### Actions pas à pas

**Consulter [[un:recette]]** : cliquez sur **👁 Voir composition** — l'arborescence affiche [[le:article:pl]] avec leurs [[nom:portion:pl]] et les sous-préparations, dépliables niveau par niveau.

**Affecter à [[un:activite]]** : cliquez sur une **pastille [[de:activite]]** sous la carte ; la coche ✓ indique que [[le:produit]] y est disponible.

**Exporter** : le bouton **Exporter XLS** génère la liste filtrée ; pour les vendables, une option permet d'inclure aussi l'autre onglet ([[nom:supplement:pl]] ou [[nom:produit:pl]]) dans une feuille séparée du même fichier.

**Supprimer** : bouton **Supprimer**, puis confirmation. L'action est **irréversible**.

### Points d'attention

:::regle
Le **prix de vente ne se définit pas ici** : il se configure par [[nom:activite]] dans la [Configuration [[Court:vente]]](#configuration-vente).
:::

:::attention
En tant que **[[nom:gerant]]**, vous consultez cet écran mais la création, la modification et la suppression [[du:produit:pl]] sont réservées au compte propriétaire.
:::

:::astuce
Servez-vous des filtres [[Nom:activite]] et Catégorie pour vérifier rapidement qu'[[aucun:produit]] de la carte d'[[un:activite_desc]] n'a été [[acc:produit:oublié:oubliée]].
:::

### Voir aussi

- [Catégories [[Court:produit:pl]]](#categories-produits) — à créer avant [[votre:produit:pl]]
- [[[Titre:produit_utilisable:pl]]](#produits-utilisables) — les sous-préparations de [[votre:recette:pl]]
- [[[Titre:fiche_technique:pl]]](#fiches-techniques) — coût de revient et export
- [Comprendre le coût d'[[un:recette]]](#calc-cout-recette)
- [Configuration [[Court:vente]]](#configuration-vente)