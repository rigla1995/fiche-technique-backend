## 📦 Stock Activités

L'écran **Stock Activités** (menu **Espace Activités → Stock Activités**) est le poste central de chaque point de vente : quantités disponibles, saisie des approvisionnements, seuils d'alerte et déclaration des pertes. Le stock se consulte **activité par activité** : sélectionnez le point de vente grâce aux pastilles 🏪 en haut de l'écran — il n'existe pas de vue globale « Toutes ». Un gérant ne voit que les activités qui lui sont affectées.

### Ce que vous voyez

Une barre de filtres cible les lignes affichées : **Catégorie**, **Article** (débloqué après le choix d'une catégorie), **Nom** (recherche libre), **Fournisseur** et **Réf. Facture**, avec un bouton **Réinitialiser**.

Le bloc bleu **Approvisionnement** regroupe les informations communes à la saisie : **Date d'appro** (obligatoire, entre le 1er janvier de l'année en cours et aujourd'hui), **Fournisseur**, **Réf Facture** (obligatoire), puis le bouton **Enregistrer (N)** — N compte les lignes prêtes.

Les articles sont groupés par **catégories repliables** (cliquez sur l'en-tête pour ouvrir). Les produits transformés apparaissent dans leurs propres catégories : **Produits Transformés Utilisables**, **Produits Transformés Vendables** et **Produits Composés Valorisés** (voir [le lexique des PT](#lexique-pt)).

| Colonne | Contenu |
|---|---|
| Article | nom, unité, lien 📋 Historique, date et quantité du dernier inventaire 📦 |
| Stock Actuel | quantité disponible + détail : ↑ appro, ⇄ transf, ↘ pertes, PT (consommé par vos productions), 💰 VENTE |
| Coût Total | valeur du stock en TTC (le montant HT s'affiche en dessous) |
| Quantité | saisie de la nouvelle quantité approvisionnée |
| Prix | prix d'achat HT unitaire (calculé automatiquement pour un produit transformé) |
| TVA (%) | taux de TVA, optionnel |
| Actions | 🔧 Seuil, 📉 Perte, ⚙️ Personnaliser (produits transformés) |

La couleur du stock reflète le **seuil minimum** : 🔴 stock inférieur ou égal au seuil, 🟠 juste au-dessus (jusqu'à seuil + 10 %), 🟢 au-delà.

:::formule Stock actuel
Stock = Approvisionnements + Transferts entrants − Consommations (ventes, productions) − Pertes ± Ajustements d'inventaire
:::

### Actions pas à pas

Enregistrer un approvisionnement :

1. Sélectionnez l'activité, puis renseignez le bloc Approvisionnement : date, fournisseur et n° de facture.
2. Ouvrez les catégories concernées et saisissez, ligne par ligne, la **quantité** et le **prix HT** unitaire (et le taux de TVA si vous le connaissez).
3. Contrôlez l'**Aperçu saisie** flottant en bas à droite : il cumule les lignes et le total TTC.
4. Cliquez sur **Enregistrer (N)** : une fenêtre récapitulative façon facture s'ouvre (lignes, Total HT, Total TTC, case **Timbre Fiscal** ajoutant 1,000 DT, cochée par défaut). Confirmez.
5. Si un appro existe déjà à cette date pour un article, une confirmation supplémentaire affiche le cumul avant validation.

Produire un produit transformé : saisissez la quantité sur sa ligne — l'indication **Max** montre le maximum réalisable avec le stock d'ingrédients, et le prix se calcule automatiquement depuis la recette ([production de PT](#calc-production-pt)). Le bouton **⚙️ Personnaliser** permet d'ajuster les quantités d'ingrédients réellement consommées.

Configurer un seuil : bouton **🔧 Seuil**, saisissez la valeur minimale (laisser vide pour désactiver), puis Enregistrer. Le seuil d'un produit transformé se règle aussi activité par activité.

### Points d'attention

:::attention
Un produit transformé fabriqué au **labo** porte le badge **⇄ Transfert uniquement** : sa quantité ne se saisit pas ici, il n'entre en stock d'activité que par [transfert](#transferts). Par ailleurs, une même validation ne peut pas mélanger production de PT et appro d'articles : dès qu'une quantité de PT est saisie, les champs Fournisseur et Réf Facture se désactivent — enregistrez les deux séparément. Enfin, si le champ Fournisseur affiche « ⚠ Aucun fournisseur », créez d'abord vos [fournisseurs](#fournisseurs) : le n° de facture est toujours exigé, et le choix d'un fournisseur devient obligatoire dès qu'au moins un fournisseur existe.
:::

:::formule Prix TTC
TTC = HT × ( 1 + TVA ÷ 100 )
note: Un article acheté 10 DT HT avec 19 % de TVA revient à 11,900 DT TTC.
:::

:::astuce
Le lien **📋 Historique** sous chaque article affiche ses derniers mouvements (date, type, quantité, prix HT et TTC, fournisseur, réf. facture) sans quitter l'écran, avec un bouton vers l'historique complet.
:::

### Voir aussi

- [Valeur du stock](#calc-valeur-stock) — comment le stock actuel est calculé
- [HT et TTC](#calc-ht-ttc) · [Seuils d'alerte](#calc-seuils)
- [Pertes](#pertes) · [Historiques](#historique) · [Transferts](#transferts) · [Factures d'appro](#factures)