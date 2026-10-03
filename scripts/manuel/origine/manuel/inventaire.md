## 🔢 Inventaire

L'écran **Inventaire** sert à compter physiquement votre stock et à enregistrer les quantités réelles : elles remplacent le stock théorique calculé par l'application et deviennent la nouvelle référence. Vous y accédez depuis le menu **Espace Activités → Inventaire**, activité par activité (pastilles 🏪).

### Ce que vous voyez

- Un en-tête avec compteurs : nombre d'**Ingrédients**, lignes saisies (compteur **Saisis**), et alerte **⚠ Date existante** si un inventaire existe déjà à la date choisie.
- Une barre de filtres : **Catégorie**, **Ingrédient** (après choix d'une catégorie), **Date inventaire** (aujourd'hui par défaut, jamais dans le futur), et le bouton **Enregistrer (N)**.
- Un tableau groupé par catégories repliables (avec compteur d'ingrédients et de lignes saisies) :

| Colonne | Contenu |
|---|---|
| Ingrédient | nom (badge **PT** pour un produit transformé), unité, lien 📋 « 5 derniers inv. » |
| Stock actuel | stock théorique calculé par l'application |
| Qté réelle | saisie de la quantité réellement comptée |

- Un panneau flottant **Aperçu saisie** (en bas à droite) récapitule les lignes saisies avec l'écart par rapport au stock théorique (en vert si positif, en rouge si négatif).

### Actions pas à pas

1. Sélectionnez l'activité, puis la **date d'inventaire**.
2. Ouvrez les catégories et saisissez la **quantité réelle comptée** pour chaque ingrédient concerné — il n'est pas obligatoire de tout compter, seules les lignes saisies sont enregistrées.
3. Contrôlez les écarts dans l'aperçu flottant.
4. Cliquez sur **Enregistrer (N)** : une fenêtre de confirmation liste les lignes et rappelle que l'inventaire **ne peut pas être supprimé**, seulement modifié, et qu'il **recalcule le stock à partir de sa date**.
5. Confirmez : le message « Inventaire enregistré avec succès » s'affiche.

Si un inventaire existe déjà à la date choisie pour un ingrédient, sa ligne porte un badge **⚠ DATE** et la confirmation devient « 🚨 Remplacement détecté » : l'ancienne valeur, barrée, et la nouvelle sont affichées côte à côte avant que vous ne validiez le remplacement.

### L'impact sur vos calculs

:::formule Écart d'inventaire
Écart = Quantité réelle comptée − Stock théorique
note: Un écart négatif révèle des pertes ou consommations non saisies ; un écart positif, un surplus.
:::

:::regle
L'inventaire devient le **point de départ** des calculs : le stock repart de la quantité comptée, puis les mouvements postérieurs (appros, transferts, pertes, productions, ventes) s'y ajoutent ou s'en retranchent. Le détail est expliqué dans [la valeur du stock](#calc-valeur-stock). La date et la quantité du dernier inventaire s'affichent d'ailleurs sous chaque article dans [Stock Activités](#stock-activites).
:::

### Consulter et corriger les inventaires passés

L'écran **Historique Inventaire** liste tous les comptages : filtres **Du / Au**, **Catégorie** et **Article**, export **Excel** (les lignes cochées y sont surlignées), colonnes Article (badge PT), Date, Qté réelle, Note et Par (auteur de la saisie). Le bouton **✏️ Modifier** permet de corriger la quantité et la note — la date, elle, ne peut pas être modifiée. Un gérant ne peut corriger que ses propres saisies.

### Points d'attention

:::attention
Un inventaire est définitif : il ne se supprime pas. En cas d'erreur, corrigez la quantité depuis l'historique, ou enregistrez un nouvel inventaire à une date plus récente.
:::

:::astuce
Réalisez des inventaires réguliers (hebdomadaires ou mensuels) : ils fiabilisent la valeur du stock et font apparaître les pertes oubliées. Le lien « 5 derniers inv. » sous chaque ingrédient aide à repérer les dérives d'un comptage à l'autre.
:::

### Voir aussi

- [Valeur du stock](#calc-valeur-stock) · [Stock Activités](#stock-activites) · [Pertes](#pertes) · [Historiques](#historique)