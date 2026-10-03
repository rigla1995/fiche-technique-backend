## 📊 Pourquoi mes chiffres ont changé ?

Une valeur [[de:stock]], un coût [[de:recette]] ou un montant de rapport n'est plus le même qu'hier ? Dans la grande majorité des cas, ce n'est pas une anomalie : voici les situations où les montants évoluent **légitimement**, et où regarder pour comprendre.

### 1. Vous avez validé [[un:inventaire]]

La validation d'[[det:inventaire:un]][[[nom:inventaire]]](#inventaire) remplace [[le:stock]] théorique par vos quantités comptées : c'est la **nouvelle référence**. Les écarts, positifs ou négatifs, sont enregistrés, et la [valeur [[de:stock]]](#calc-valeur-stock) est ajustée en conséquence. Les chiffres d'avant [[le:inventaire]] ne sont pas perdus : ils restent consultables dans l'historique.

### 2. Une [[court:appro]] passée a été modifiée

Corriger le prix ou la quantité d'[[un:appro]] déjà [[acc:appro:saisi:saisie]] recalcule le [prix moyen pondéré](#calc-pmp) [[du:article]]. Comme le PMP alimente la valeur [[de:stock]] et le [coût [[du:recette:pl]]](#calc-cout-recette), une correction sur une [[court:appro]] d'il y a trois semaines peut faire bouger vos coûts d'aujourd'hui. C'est le comportement attendu : le PMP reflète toujours la réalité corrigée de vos achats.

:::exemple
Vous aviez saisi 10 kg de beurre à 30 DT au lieu de 33 DT. Après correction, le PMP du beurre remonte légèrement — et le coût de [[tous:recette:les]] qui utilisent du beurre suit.
:::

### 3. [[Un:transfert]] a été [[acc:transfert:valorisé:valorisée]] au prix de cession

Quand [[le:labo]] transfère [[un:produit]] à [[un:activite]], [[le:activite]] [[acc:produit:le:la]] reçoit **au prix de cession**, pas [[au:cout_matiere]] [[du:labo]]. [[acc:produit:Le même:La même]] [[nom:produit]] peut donc « valoir » un montant [[au:labo]] et un autre dans [[le:activite]] : c'est le principe de la [valorisation [[du:transfert:pl]]](#calc-transferts), qui matérialise la valeur ajoutée [[du:labo]].

### 4. Vous comparez du HT et du TTC

Les prix d'achat se saisissent en HT avec leur taux de TVA, mais [[le:stock:pl]], [[nom:pt:pl]], rapports et tableaux de bord s'affichent en **TTC**. Si vous rapprochez un montant à l'écran d'une facture [[nom:fournisseur]] en HT, l'écart correspond simplement à la TVA. Détail dans [HT et TTC](#calc-ht-ttc).

### 5. Le prix figé des composés valorisés

Un composé valorisé — [[nom:produit_vendable]] [[acc:produit_vendable:fabriqué:fabriquée]] par [[le:labo]] — est valorisé à son **prix [[compl:labo]] défini**, volontairement figé : il ne suit pas [[le:cout_matiere]] au jour le jour. Si ce prix est modifié, seules les opérations **postérieures** utilisent le nouveau montant ; les mouvements passés conservent le prix en vigueur à leur date. Voir [Composés valorisés](#articles-valorises) et [Prix et valorisation](#calc-prix).

### 6. Deux productions identiques, deux coûts différents

Le coût d'une production [[de:pt]] est calculé avec le PMP [[du:ingredient:pl]] **au moment de la production**. Si le PMP a bougé entre deux fabrications — nouvelles [[court:appro:pl]], corrections —, deux lots identiques n'auront pas le même coût, sans qu'[[aucun:recette]] n'ait changé. Voir [Production [[du:pt:pl]]](#calc-production-pt).

:::regle
Un montant vous semble toujours inexpliqué après ces vérifications ? Consultez la [traçabilité](#calc-tracabilite) et les [historiques](#historique) pour retrouver l'opération à l'origine du changement, puis contactez le [support](#support) si le doute persiste.
:::

### Voir aussi

- [PMP](#calc-pmp) · [Valeur [[de:stock]]](#calc-valeur-stock) · [Coût [[de:recette]]](#calc-cout-recette)
- [[[Nom:transfert:pl]]](#calc-transferts) · [HT / TTC](#calc-ht-ttc) · [Production [[Court:pt]]](#calc-production-pt)
- [[[Nom:inventaire]]](#inventaire) · [Questions fréquentes](#faq)