## 🕑 Historiques

Tous les mouvements de stock sont tracés et consultables : l'écran **Historique Appro** pour les approvisionnements et mouvements associés (achats, transferts, ventes, productions), l'écran **Historique Pertes** pour les avaries et déchets. Vous y accédez depuis le menu Espace Activités ; les [inventaires](#inventaire) et les [transferts](#transferts) disposent de leurs propres historiques.

### Un fonctionnement commun

- Consultation **activité par activité** : sélectionnez le point de vente via les pastilles 🏪 — pas de vue globale « Toutes ». Un gérant ne voit que ses activités affectées.
- Une même **barre de filtres** : période **Du / Au** (année en cours par défaut), listes en cascade **Catégorie** puis **Article**, bouton **Rechercher** (les résultats ne s'affichent qu'après), **Réinitialiser**, et l'export **Excel** (bouton « Exporter »), à la charte LabFlow (logo et mise en forme unifiés).
- Des **cases à cocher** sur chaque ligne : cochez des enregistrements pour les **surligner** (ambre) dans le fichier exporté — l'export garde toutes les lignes filtrées et le bouton indique alors « Exporter (N) ».
- La colonne **Créé par / Par** identifie l'auteur de chaque saisie ([traçabilité](#calc-tracabilite)).

### Historique des approvisionnements

Filtres spécifiques : **Fournisseur** et **Type d'appro** (liste à cases multiples : Manuel, Transfert, Vente, PT). Le filtre Catégorie propose, en plus de vos catégories d'articles, les trois familles de produits transformés : **Produits Transformés Utilisables**, **Produits Transformés Vendables** et **Produits Composés Valorisés** (voir [le lexique](#lexique-pt)).

| Colonne | Contenu |
|---|---|
| Article | nom, unité · catégorie |
| Date | date + badge du type : Manuel, Transfert (côté labo : « ↗ Transf. → X » pour un envoi, « ↙ Reçu ← X » pour une réception depuis le labo qui vous alimente), 💰 Vente, ↩️ Annul. vente, 🔄 PT |
| Quantité | quantité et unité |
| Prix HT | montant total HT et prix unitaire |
| TVA | taux appliqué |
| Prix TTC | montant total TTC et prix unitaire |
| Fourn. / Réf | fournisseur et n° de facture (pour un transfert : la destination ou le labo source) |
| Créé par | auteur de la saisie |

Le pied de tableau cumule les **totaux HT et TTC en DT** des résultats affichés ; la liste est paginée par 10 lignes.

### Actions pas à pas : corriger ou supprimer un appro

1. Cliquez sur **✏️** : vous pouvez modifier la quantité, le prix unitaire, le fournisseur et la réf. facture — la **date reste verrouillée**.
2. Une ligne de type **Transfert** (envoi ou réception) ne se modifie ni ne se supprime ici : passez par l'**Historique Transferts** du labo émetteur ([Transferts](#transferts)), qui ajuste les deux stocks.
3. **🗑️ Supprimer** : le stock de l'article est recalculé. L'action est **irréversible**.

### Historique des pertes

Filtre supplémentaire **Type** (les types de perte de votre domaine : Avarie / Déchet par défaut), badges colorés par type, totaux **quantité** et **coût total**, même export Excel. La modification et la suppression y suivent les mêmes garde-fous — le détail est décrit dans la fiche [Pertes](#pertes).

### Points d'attention

:::attention
Les lignes 💰 Vente et ↩️ Annul. vente sont générées automatiquement par vos ventes : elles ne peuvent être ni modifiées ni supprimées depuis l'historique. Un gérant ne peut corriger que les saisies qu'il a lui-même créées.
:::

:::astuce
Pour préparer une clôture mensuelle, réglez Du / Au sur le mois, lancez Rechercher, vérifiez les totaux HT/TTC puis exportez en Excel. Le filtre Type d'appro isole en un clic les seuls achats « Manuel », hors transferts et ventes.
:::

### Voir aussi

- [Stock Activités](#stock-activites) · [Pertes](#pertes) · [Inventaire](#inventaire) · [Transferts](#transferts)
- [HT et TTC](#calc-ht-ttc) · [Traçabilité des mouvements](#calc-tracabilite)