## 🏭 Ventes Labo

Le laboratoire ne vend pas au comptoir : son « chiffre d'affaires » correspond aux **transferts valorisés** vers vos activités et vers les labos qu'il alimente — articles comme produits transformés (dont les composés valorisés, comptés au prix labo). Cet écran présente cet historique avec une analyse prix / coût. Vous le trouvez dans le menu **Espace Vente → Ventes Labo**.

### Ce que vous voyez

- Un **sélecteur de labo** (🏭) pour choisir le laboratoire, et un raccourci **📊 Rapport**.
- Une barre de filtres : période **Du / Au** avec bouton **🔍 Filtrer dates**, puis **Catégorie**, **Article** (liste qui s'adapte à la catégorie choisie) et **Destination** (activité 🏪 ou labo rattaché 🏭) ; bouton **✕ Réinitialiser** et **Exporter XLS**.
- Trois indicateurs calculés sur les lignes filtrées : **Valeur totale achat**, **Valeur totale transferts** et **Écart total** (affiché en vert s'il est positif, en rouge sinon).
- Un tableau avec les colonnes *Article* (unité et date), *Destination*, *Qté*, *Prix transfert* (total et prix unitaire), *Prix appro* (total et prix unitaire) et *Écart* (montant et pourcentage), avec une ligne de total en pied de tableau.

### Actions pas à pas

1. Sélectionnez le labo concerné.
2. Renseignez la période puis cliquez sur **🔍 Filtrer dates** ; les filtres catégorie, article et destination s'appliquent, eux, instantanément.
3. Lisez l'écart ligne par ligne : il compare la valeur du transfert au coût d'achat des matières, et le pied de tableau totalise l'ensemble.
4. Cliquez sur **Exporter XLS** pour télécharger l'historique ; cochez des lignes au préalable pour n'exporter que celles-ci.

:::formule Écart d'un transfert
Écart = (prix de transfert × quantité) − (prix moyen d'achat × quantité)
note: aussi affiché en pourcentage du coût d'achat ; un écart positif signifie que le labo valorise au-dessus de son coût.
:::

### Différences avec les ventes d'activité

| | Ventes d'activité | Ventes Labo |
|---|---|---|
| Alimentation | Saisie manuelle des quantités | Automatique, à partir des transferts |
| Prix appliqué | Prix direct ou prix prestataire | Prix de transfert (par exemple le prix labo d'un composé valorisé) |
| Client | Consommateur final | Vos propres activités et labos rattachés |
| Modification | Bouton Annuler dans l'historique | Écran en consultation seule |

### Points d'attention

:::attention
Sur certaines lignes, le prix d'achat moyen peut être indisponible (affiché « — ») : l'écart n'est alors pas calculé pour cette ligne et la valeur d'achat totale s'en trouve minorée.
:::

:::attention
Les indicateurs portent uniquement sur les lignes filtrées : pensez à réinitialiser les filtres pour retrouver la vision complète.
:::

:::astuce
Un écart négatif récurrent sur un article signale un prix labo inférieur au coût réel d'achat : revoyez le prix de ce composé valorisé pour ne pas transférer à perte.
:::

### Voir aussi

- [Transferts](#transferts) — l'opération qui alimente cet écran
- [Calcul des transferts](#calc-transferts) et [PMP](#calc-pmp) — d'où viennent les valeurs
- [Lexique des produits transformés](#lexique-pt) — comprendre les composés valorisés
- [Stock labo](#stock-labo) et [Rapports labo](#rapports-labo)