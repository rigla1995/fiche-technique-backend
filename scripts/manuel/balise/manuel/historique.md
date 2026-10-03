## 🕑 Historiques

Tous les mouvements [[de:stock]] sont tracés et consultables : l'écran **Historique [[Court:appro]]** pour [[le:appro:pl]] et mouvements associés (achats, [[nom:transfert:pl]], [[nom:vente:pl]], productions), l'écran **Historique [[Court:perte:pl]]** pour les avaries et déchets. Vous y accédez depuis le menu [[Nom:espace_activites]] ; [[det:inventaire:le:pl]][[[nom:inventaire:pl]]](#inventaire) et [[det:transfert:le:pl]][[[nom:transfert:pl]]](#transferts) disposent de leurs propres historiques.

### Un fonctionnement commun

- Consultation **[[nom:activite]] par [[nom:activite]]** : sélectionnez [[le:activite_desc]] via les pastilles 🏪 — pas de vue globale « [[acc:activite:Tous:Toutes]] ». [[Un:gerant]] ne voit que [[son:activite:pl]] [[acc:activite:affecté:affectée:pl]].
- Une même **barre de filtres** : période **Du / Au** (année en cours par défaut), listes en cascade **Catégorie** puis **[[Nom:article]]**, bouton **Rechercher** (les résultats ne s'affichent qu'après), **Réinitialiser**, et l'export **Excel** (bouton « Exporter »), à la charte LabFlow (logo et mise en forme unifiés).
- Des **cases à cocher** sur chaque ligne : cochez des enregistrements pour les **surligner** (ambre) dans le fichier exporté — l'export garde toutes les lignes filtrées et le bouton indique alors « Exporter (N) ».
- La colonne **Créé par / Par** identifie l'auteur de chaque saisie ([traçabilité](#calc-tracabilite)).

### Historique [[du:appro:pl]]

Filtres spécifiques : **[[Nom:fournisseur]]** et **Type [[de:appro:court]]** (liste à cases multiples : [[acc:appro:Manuel:Manuelle]], [[Court:transfert]], [[Court:vente]], [[Court:pt]]). Le filtre Catégorie propose, en plus de vos catégories [[de:article:pl]], les trois familles [[de:pt:pl]] : **[[Nom:cat_pt_utilisable]]**, **[[Nom:cat_pt_vendable]]** et **[[Nom:cat_pt_valorise]]** (voir [le lexique](#lexique-pt)).

| Colonne | Contenu |
|---|---|
| [[Nom:article]] | nom, unité · catégorie |
| Date | date + badge du type : [[acc:appro:Manuel:Manuelle]], [[Court:transfert]] (côté [[nom:labo]] : « ↗ [[Nom:transfert_abr]] → X » pour un envoi, « ↙ [[acc:transfert:Reçu:Reçue]] ← X » pour une réception depuis [[le:labo]] qui vous alimente), 💰 [[Court:vente]], ↩️ Annul. [[court:vente]], 🔄 [[Court:pt]] |
| Quantité | quantité et unité |
| Prix HT | montant total HT et prix unitaire |
| TVA | taux appliqué |
| Prix TTC | montant total TTC et prix unitaire |
| Fourn. / Réf | [[nom:fournisseur]] et n° de facture (pour [[un:transfert]] : la destination ou [[le:labo]] source) |
| Créé par | auteur de la saisie |

Le pied de tableau cumule les **totaux HT et TTC en DT** des résultats affichés ; la liste est paginée par 10 lignes.

### Actions pas à pas : corriger ou supprimer [[un:appro:court]]

1. Cliquez sur **✏️** : vous pouvez modifier la quantité, le prix unitaire, [[le:fournisseur]] et la réf. facture — la **date reste verrouillée**.
2. Une ligne de type **[[Nom:transfert]]** (envoi ou réception) ne se modifie ni ne se supprime ici : passez par l'**Historique [[Court:transfert:pl]]** [[du:labo]] [[acc:labo:émetteur:émettrice]] ([[[Nom:transfert:pl]]](#transferts)), qui ajuste les deux [[nom:stock:pl]].
3. **🗑️ Supprimer** : [[le:stock]] [[du:article]] est [[acc:stock:recalculé:recalculée]]. L'action est **irréversible**.

### Historique [[du:perte:pl]]

Filtre supplémentaire **Type** (les types [[de:perte]] de votre domaine : Avarie / Déchet par défaut), badges colorés par type, totaux **quantité** et **coût total**, même export Excel. La modification et la suppression y suivent les mêmes garde-fous — le détail est décrit dans la fiche [[[Nom:perte:pl]]](#pertes).

### Points d'attention

:::attention
Les lignes 💰 [[Court:vente]] et ↩️ Annul. [[court:vente]] sont générées automatiquement par [[votre:vente:pl]] : elles ne peuvent être ni modifiées ni supprimées depuis l'historique. [[Un:gerant]] ne peut corriger que les saisies qu'[[acc:gerant:il:elle]] a [[acc:gerant:lui-même:elle-même]] créées.
:::

:::astuce
Pour préparer une clôture mensuelle, réglez Du / Au sur le mois, lancez Rechercher, vérifiez les totaux HT/TTC puis exportez en Excel. Le filtre Type [[de:appro:court]] isole en un clic les seuls achats « [[acc:appro:Manuel:Manuelle]] », hors [[nom:transfert:pl]] et [[nom:vente:pl]].
:::

### Voir aussi

- [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites) · [[[Nom:perte:pl]]](#pertes) · [[[Nom:inventaire]]](#inventaire) · [[[Nom:transfert:pl]]](#transferts)
- [HT et TTC](#calc-ht-ttc) · [Traçabilité des mouvements](#calc-tracabilite)