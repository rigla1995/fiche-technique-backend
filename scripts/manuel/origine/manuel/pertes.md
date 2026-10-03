## 📉 Pertes

Déclarez les produits perdus — casse, péremption, chutes de production — pour que le stock et vos coûts reflètent la réalité. La **saisie** se fait directement depuis [Stock Activités](#stock-activites) (bouton **📉 Perte** sur la ligne de l'article) ; la **consultation** dans l'écran **Historique Pertes** du menu Espace Activités.

### Les types de perte

| Type | Usage |
|---|---|
| **Avarie** | produit abîmé, périmé, impropre à la vente |
| **Déchet** | pertes de production, parures, casse (domaine Restauration) |

Un autre domaine d'activité peut définir ses propres types de perte (par exemple *casse* ou *rebut*) : ce sont alors ceux-là qui apparaissent dans la fenêtre de saisie, les filtres et les badges.

### Actions pas à pas

1. Dans **Stock Activités**, sélectionnez l'activité puis cliquez sur **📉 Perte** sur la ligne de l'article.
2. La fenêtre affiche le **stock disponible**. Saisissez la **quantité perdue** — elle ne peut pas dépasser ce stock (un avertissement s'affiche sinon).
3. Choisissez le **type** (Avarie ou Déchet par défaut — selon votre domaine) et la **date de la perte** : elle doit se situer entre le premier approvisionnement de l'article (rappelé sous le champ) et aujourd'hui.
4. Le **prix unitaire** d'achat en vigueur à la date choisie est récupéré automatiquement, et le **coût total** de la perte s'affiche aussitôt.
5. Cliquez sur **Enregistrer la perte** : le stock diminue et la perte est tracée.

:::formule Valeur d'une perte
Valeur = Quantité perdue × Prix unitaire d'achat à la date de la perte
note: L'écran Pertes affiche le prix d'achat HT ; dans les rapports et tableaux de bord, les pertes sont valorisées en TTC.
:::

### Où retrouver vos pertes

- **Historique Pertes** : consultation **activité par activité** (pastilles 🏪), filtres **Du / Au**, **Catégorie**, **Article** et **Type** (les types de votre domaine), bouton **Rechercher**. Le tableau affiche Activité, Article, Date, Type (badge coloré), Quantité, Prix Unit., Coût Total et Par (auteur de la saisie), avec les totaux **quantité** et **coût** affichés au-dessus et en pied de tableau. Export **Excel**, avec surbrillance des lignes cochées.
- Dans **Stock Activités** : la ligne **↘ pertes** de la colonne Stock Actuel cumule les quantités perdues ; pour un produit transformé, le lien 📋 Historique marque en plus chaque perte d'un badge 🗑️.

Depuis l'historique, **✏️ Modifier** permet de corriger la quantité et le type — la date et le prix restent verrouillés, et un avertissement rappelle que changer la quantité impacte le calcul du stock actuel. **🗑️ Supprimer** recalcule le stock ; l'action est **irréversible**. Un gérant ne peut modifier ou supprimer que ses propres saisies.

### Points d'attention

:::attention
Impossible de déclarer une perte sur un article jamais approvisionné : l'application demande d'enregistrer d'abord un appro. Pour un produit transformé, il n'y a pas de prix d'achat : aucun coût ne s'affiche à la saisie, mais la perte est valorisée au coût de recette du produit (quand il est calculable) dans l'historique et les rapports.
:::

:::astuce
Saisissez les pertes au fil de l'eau plutôt qu'en fin de mois : votre stock reste juste, et l'[inventaire](#inventaire) ne sert plus qu'à confirmer. Un écart d'inventaire négatif récurrent signale des pertes non déclarées.
:::

### Voir aussi

- [Stock Activités](#stock-activites) · [Inventaire](#inventaire) · [Historiques](#historique)
- [Valeur du stock](#calc-valeur-stock) · [HT et TTC](#calc-ht-ttc)