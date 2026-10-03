## 📊 Pourquoi mes chiffres ont changé ?

Une valeur de stock, un coût de recette ou un montant de rapport n'est plus le même qu'hier ? Dans la grande majorité des cas, ce n'est pas une anomalie : voici les situations où les montants évoluent **légitimement**, et où regarder pour comprendre.

### 1. Vous avez validé un inventaire

La validation d'un [inventaire](#inventaire) remplace le stock théorique par vos quantités comptées : c'est la **nouvelle référence**. Les écarts, positifs ou négatifs, sont enregistrés, et la [valeur de stock](#calc-valeur-stock) est ajustée en conséquence. Les chiffres d'avant l'inventaire ne sont pas perdus : ils restent consultables dans l'historique.

### 2. Une appro passée a été modifiée

Corriger le prix ou la quantité d'un approvisionnement déjà saisi recalcule le [prix moyen pondéré](#calc-pmp) de l'article. Comme le PMP alimente la valeur de stock et le [coût des recettes](#calc-cout-recette), une correction sur une appro d'il y a trois semaines peut faire bouger vos coûts d'aujourd'hui. C'est le comportement attendu : le PMP reflète toujours la réalité corrigée de vos achats.

:::exemple
Vous aviez saisi 10 kg de beurre à 30 DT au lieu de 33 DT. Après correction, le PMP du beurre remonte légèrement — et le coût de toutes les recettes qui utilisent du beurre suit.
:::

### 3. Un transfert a été valorisé au prix de cession

Quand le labo transfère un produit à une activité, l'activité le reçoit **au prix de cession**, pas au coût matière du labo. Le même produit peut donc « valoir » un montant au labo et un autre dans l'activité : c'est le principe de la [valorisation des transferts](#calc-transferts), qui matérialise la valeur ajoutée du labo.

### 4. Vous comparez du HT et du TTC

Les prix d'achat se saisissent en HT avec leur taux de TVA, mais les stocks, produits transformés, rapports et tableaux de bord s'affichent en **TTC**. Si vous rapprochez un montant à l'écran d'une facture fournisseur en HT, l'écart correspond simplement à la TVA. Détail dans [HT et TTC](#calc-ht-ttc).

### 5. Le prix figé des composés valorisés

Un composé valorisé — produit vendable fabriqué par le labo — est valorisé à son **prix labo défini**, volontairement figé : il ne suit pas le coût matière au jour le jour. Si ce prix est modifié, seules les opérations **postérieures** utilisent le nouveau montant ; les mouvements passés conservent le prix en vigueur à leur date. Voir [Composés valorisés](#articles-valorises) et [Prix et valorisation](#calc-prix).

### 6. Deux productions identiques, deux coûts différents

Le coût d'une production de produit transformé est calculé avec le PMP des ingrédients **au moment de la production**. Si le PMP a bougé entre deux fabrications — nouvelles appros, corrections —, deux lots identiques n'auront pas le même coût, sans qu'aucune recette n'ait changé. Voir [Production des produits transformés](#calc-production-pt).

:::regle
Un montant vous semble toujours inexpliqué après ces vérifications ? Consultez la [traçabilité](#calc-tracabilite) et les [historiques](#historique) pour retrouver l'opération à l'origine du changement, puis contactez le [support](#support) si le doute persiste.
:::

### Voir aussi

- [PMP](#calc-pmp) · [Valeur de stock](#calc-valeur-stock) · [Coût de recette](#calc-cout-recette)
- [Transferts](#calc-transferts) · [HT / TTC](#calc-ht-ttc) · [Production PT](#calc-production-pt)
- [Inventaire](#inventaire) · [Questions fréquentes](#faq)