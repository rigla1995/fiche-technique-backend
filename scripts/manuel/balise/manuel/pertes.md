## 📉 [[Nom:perte:pl]]

Déclarez [[le:produit:pl]] [[acc:produit:perdu:perdue:pl]] — casse, péremption, chutes de production — pour que [[le:stock]] et vos coûts reflètent la réalité. La **saisie** se fait directement depuis [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites) (bouton **📉 [[Court:perte]]** sur la ligne [[du:article]]) ; la **consultation** dans l'écran **Historique [[Court:perte:pl]]** du menu [[Nom:espace_activites]].

### Les types [[de:perte]]

| Type | Usage |
|---|---|
| **Avarie** | [[nom:produit]] [[acc:produit:abîmé:abîmée]], [[acc:produit:périmé:périmée]], impropre [[au:vente]] |
| **Déchet** | [[nom:perte:pl]] de production, parures, casse (domaine Restauration) |

Un autre domaine d'activité peut définir ses propres types [[de:perte]] (par exemple *casse* ou *rebut*) : ce sont alors ceux-là qui apparaissent dans la fenêtre de saisie, les filtres et les badges.

### Actions pas à pas

1. Dans **[[Nom:stock]] [[Court:activite:pl]]**, sélectionnez [[le:activite]] puis cliquez sur **📉 [[Court:perte]]** sur la ligne [[du:article]].
2. La fenêtre affiche [[det:stock:le]]**[[nom:stock]] disponible**. Saisissez la **quantité perdue** — elle ne peut pas dépasser [[ce:stock]] (un avertissement s'affiche sinon).
3. Choisissez le **type** (Avarie ou Déchet par défaut — selon votre domaine) et la **date [[du:perte]]** : elle doit se situer entre [[acc:appro:le premier:la première]] [[nom:appro]] [[du:article]] ([[acc:appro:rappelé:rappelée]] sous le champ) et aujourd'hui.
4. Le **prix unitaire** d'achat en vigueur à la date choisie est récupéré automatiquement, et le **coût total** [[du:perte]] s'affiche aussitôt.
5. Cliquez sur **Enregistrer [[le:perte]]** : [[le:stock]] diminue et [[le:perte]] est [[acc:perte:tracé:tracée]].

:::formule Valeur d'[[un:perte]]
Valeur = Quantité perdue × Prix unitaire d'achat à la date [[du:perte]]
note: L'écran [[Nom:perte:pl]] affiche le prix d'achat HT ; dans les rapports et tableaux de bord, [[le:perte:pl]] sont [[acc:perte:valorisé:valorisée:pl]] en TTC.
:::

### Où retrouver [[votre:perte:pl]]

- **Historique [[Court:perte:pl]]** : consultation **[[nom:activite]] par [[nom:activite]]** (pastilles 🏪), filtres **Du / Au**, **Catégorie**, **[[Nom:article]]** et **Type** (les types de votre domaine), bouton **Rechercher**. Le tableau affiche [[Nom:activite]], [[Nom:article]], Date, Type (badge coloré), Quantité, Prix Unit., Coût Total et Par (auteur de la saisie), avec les totaux **quantité** et **coût** affichés au-dessus et en pied de tableau. Export **Excel**, avec surbrillance des lignes cochées.
- Dans **[[Nom:stock]] [[Court:activite:pl]]** : la ligne **↘ [[court:perte:pl]]** de la colonne [[Nom:stock]] [[acc:stock:Actuel:Actuelle]] cumule les quantités perdues ; pour [[un:pt]], le lien 📋 Historique marque en plus chaque [[nom:perte]] d'un badge 🗑️.

Depuis l'historique, **✏️ Modifier** permet de corriger la quantité et le type — la date et le prix restent verrouillés, et un avertissement rappelle que changer la quantité impacte le calcul [[du:stock]] [[acc:stock:actuel:actuelle]]. **🗑️ Supprimer** recalcule [[le:stock]] ; l'action est **irréversible**. [[Un:gerant]] ne peut modifier ou supprimer que ses propres saisies.

### Points d'attention

:::attention
Impossible de déclarer [[un:perte]] sur [[un:article]] jamais [[acc:article:approvisionné:approvisionnée]] : l'application demande d'enregistrer d'abord [[un:appro:court]]. Pour [[un:pt]], il n'y a pas de prix d'achat : aucun coût ne s'affiche à la saisie, mais [[le:perte]] est [[acc:perte:valorisé:valorisée]] au coût [[de:recette]] [[du:produit]] (quand il est calculable) dans l'historique et les rapports.
:::

:::astuce
Saisissez [[le:perte:pl]] au fil de l'eau plutôt qu'en fin de mois : [[votre:stock]] reste juste, et [[det:inventaire:le]][[[nom:inventaire]]](#inventaire) ne sert plus qu'à confirmer. Un écart [[de:inventaire]] négatif récurrent signale [[un:perte:pl]] non [[acc:perte:déclaré:déclarée:pl]].
:::

### Voir aussi

- [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites) · [[[Nom:inventaire]]](#inventaire) · [Historiques](#historique)
- [Valeur [[du:stock]]](#calc-valeur-stock) · [HT et TTC](#calc-ht-ttc)