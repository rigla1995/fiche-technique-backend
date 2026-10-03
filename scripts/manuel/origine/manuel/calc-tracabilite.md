## 🧾 La traçabilité automatique

Chaque mouvement de stock que LabFlow génère pour vous — production, consommation de recette, transfert, vente — porte une référence et, dans la plupart des cas, un fournisseur, même quand ce n'est pas vous qui les avez saisis. Voici comment lire ces mentions dans les historiques.

### La règle

Trois mentions automatiques existent :

- **Fournisseur AUTO** — porté par les mouvements générés par le système : la ligne de production d'un produit transformé, les sorties d'articles et de sous-produits consommés par la recette, les sorties liées aux ventes, ainsi que la sortie de transfert d'un produit transformé côté labo. Cette fiche est créée automatiquement et n'apparaît pas dans votre liste de fournisseurs.
- **Référence automatique** — construite à partir du nom du produit et de l'année de l'opération (voir formule ci-dessous).
- **Fournisseur « labo »** — les réceptions de transfert côté activité portent le **nom de votre labo** comme fournisseur. Cette fiche fournisseur est créée automatiquement avec le labo, suit son nom, et ne peut être ni modifiée ni supprimée depuis l'écran Fournisseurs.

:::formule Référence automatique
RÉF = INITIALES DU NOM (ou 3 PREMIÈRES LETTRES si un seul mot) + « - » + ANNÉE SUR 2 CHIFFRES
note: en majuscules, sans accents ; l'année est celle de la date de l'opération. « Crème Pâtissière » en 2026 → CP-26 ; « Cookies » → COO-26.
:::

:::exemple
Production de 40 « Crème Pâtissière » au labo, le 15 mars 2026 :

- entrée de 40 unités : fournisseur AUTO, référence **CP-26** (initiales de « Crème Pâtissière » + année) ;
- sortie de 10 kg de « Lait » consommé par la recette : fournisseur AUTO, référence **LAI-26** (un seul mot → 3 premières lettres) ;
- sortie de 2 kg de « Sucre Semoule » : fournisseur AUTO, référence **SS-26**.

Une semaine plus tard, 20 unités partent en transfert vers l'activité « Salon de thé » avec le bon de livraison BL-0187 : l'entrée côté activité affiche le nom du labo en fournisseur et la référence BL-0187 ; la sortie côté labo porte le fournisseur AUTO et la même référence.
:::

### Comment lire les historiques

- Dans l'historique d'une **activité**, la mention AUTO apparaît sur les lignes de sortie (quantités négatives) générées par le système : consommations de recette (badge 🔄 PT) et sorties de vente (badge 💰 Vente). Les entrées de production affichent la référence automatique du produit.
- Dans l'historique du **labo**, les lignes de production et les consommations qu'elles déclenchent portent le fournisseur AUTO et leur référence automatique.
- Les réceptions de transfert (badge *Transfert*) affichent le **nom du labo** en fournisseur et la référence saisie au transfert, dans la colonne Réf. Facture / BL.
- Le filtre **Type d'appro** des historiques (Manuel, Transfert, Vente, PT) permet d'isoler ces mouvements.

### Variations

- La référence automatique change chaque année : une production de janvier 2027 du même produit portera CP-27.
- Deux produits partageant les mêmes initiales partagent la même référence : c'est le couple produit + référence qui identifie le mouvement, pas la référence seule.

:::astuce
Si une ligne porte le fournisseur AUTO, elle n'a pas été saisie à la main : inutile de chercher qui l'a créée, c'est une écriture système déclenchée par une production ou une vente.
:::

### Voir aussi

- [Production des produits transformés](#calc-production-pt)
- [Valorisation des transferts](#calc-transferts)
- [Historique](#historique)
- [Fournisseurs](#fournisseurs)