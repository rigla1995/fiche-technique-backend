## 🔢 [[Nom:inventaire]]

L'écran **[[Nom:inventaire]]** sert à compter physiquement [[votre:stock]] et à enregistrer les quantités réelles : elles remplacent [[le:stock]] théorique [[acc:stock:calculé:calculée]] par l'application et deviennent la nouvelle référence. Vous y accédez depuis le menu **[[Nom:espace_activites]] → [[Nom:inventaire]]**, [[nom:activite]] par [[nom:activite]] (pastilles 🏪).

### Ce que vous voyez

- Un en-tête avec compteurs : nombre [[det:article_ingredient:de:pl]]**[[Nom:article_ingredient:pl]]**, lignes saisies (compteur **[[acc:article_ingredient:Saisis:Saisies]]**), et alerte **⚠ Date existante** si [[un:inventaire]] existe déjà à la date choisie.
- Une barre de filtres : **Catégorie**, **[[Nom:article_ingredient]]** (après choix d'une catégorie), **Date [[court:inventaire]]** (aujourd'hui par défaut, jamais dans le futur), et le bouton **Enregistrer (N)**.
- Un tableau groupé par catégories repliables (avec compteur [[de:article_ingredient:pl]] et de lignes saisies) :

| Colonne | Contenu |
|---|---|
| [[Nom:article_ingredient]] | nom (badge **[[Court:pt]]** pour [[un:pt]]), unité, lien 📋 « 5 derniers inv. » |
| [[Nom:stock]] [[acc:stock:actuel:actuelle]] | [[nom:stock]] théorique [[acc:stock:calculé:calculée]] par l'application |
| Qté réelle | saisie de la quantité réellement comptée |

- Un panneau flottant **Aperçu saisie** (en bas à droite) récapitule les lignes saisies avec l'écart par rapport [[au:stock]] théorique (en vert si positif, en rouge si négatif).

### Actions pas à pas

1. Sélectionnez [[le:activite]], puis la **date [[de:inventaire]]**.
2. Ouvrez les catégories et saisissez la **quantité réelle comptée** pour chaque [[nom:article_ingredient]] [[acc:article_ingredient:concerné:concernée]] — il n'est pas obligatoire de tout compter, seules les lignes saisies sont enregistrées.
3. Contrôlez les écarts dans l'aperçu flottant.
4. Cliquez sur **Enregistrer (N)** : une fenêtre de confirmation liste les lignes et rappelle que [[le:inventaire]] **ne peut pas être [[acc:inventaire:supprimé:supprimée]]**, seulement [[acc:inventaire:modifié:modifiée]], et qu'[[acc:inventaire:il:elle]] **recalcule [[le:stock]] à partir de sa date**.
5. Confirmez : le message « [[Nom:inventaire]] [[acc:inventaire:enregistré:enregistrée]] avec succès » s'affiche.

Si [[un:inventaire]] existe déjà à la date choisie pour [[un:article_ingredient]], sa ligne porte un badge **⚠ DATE** et la confirmation devient « 🚨 Remplacement détecté » : l'ancienne valeur, barrée, et la nouvelle sont affichées côte à côte avant que vous ne validiez le remplacement.

### L'impact sur vos calculs

:::formule Écart [[de:inventaire]]
Écart = Quantité réelle comptée − [[Nom:stock]] théorique
note: Un écart négatif révèle [[un:perte:pl]] ou consommations non saisies ; un écart positif, un surplus.
:::

:::regle
[[Le:inventaire]] devient le **point de départ** des calculs : [[le:stock]] repart de la quantité comptée, puis les mouvements postérieurs ([[court:appro:pl]], [[nom:transfert:pl]], [[nom:perte:pl]], productions, [[nom:vente:pl]]) s'y ajoutent ou s'en retranchent. Le détail est expliqué dans [la valeur [[du:stock]]](#calc-valeur-stock). La date et la quantité [[acc:inventaire:du dernier:de la dernière]] [[nom:inventaire]] s'affichent d'ailleurs sous chaque [[nom:article]] dans [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites).
:::

### Consulter et corriger [[le:inventaire:pl]] [[acc:inventaire:passé:passée:pl]]

L'écran **Historique [[Court:inventaire]]** liste tous les comptages : filtres **Du / Au**, **Catégorie** et **[[Nom:article]]**, export **Excel** (les lignes cochées y sont surlignées), colonnes [[Nom:article]] (badge [[Court:pt]]), Date, Qté réelle, Note et Par (auteur de la saisie). Le bouton **✏️ Modifier** permet de corriger la quantité et la note — la date, elle, ne peut pas être modifiée. [[Un:gerant]] ne peut corriger que ses propres saisies.

### Points d'attention

:::attention
[[Un:inventaire]] est [[acc:inventaire:définitif:définitive]] : [[acc:inventaire:il:elle]] ne se supprime pas. En cas d'erreur, corrigez la quantité depuis l'historique, ou enregistrez [[acc:inventaire:un:une]] [[nouveau:inventaire]] à une date plus récente.
:::

:::astuce
Réalisez [[un:inventaire:pl]] [[acc:inventaire:régulier:régulière:pl]] (hebdomadaires ou [[acc:inventaire:mensuel:mensuelle:pl]]) : [[acc:inventaire:il:elle:pl]] fiabilisent la valeur [[du:stock]] et font apparaître [[le:perte:pl]] [[acc:perte:oublié:oubliée:pl]]. Le lien « 5 derniers inv. » sous chaque [[nom:article_ingredient]] aide à repérer les dérives d'un comptage à l'autre.
:::

### Voir aussi

- [Valeur [[du:stock]]](#calc-valeur-stock) · [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites) · [[[Nom:perte:pl]]](#pertes) · [Historiques](#historique)