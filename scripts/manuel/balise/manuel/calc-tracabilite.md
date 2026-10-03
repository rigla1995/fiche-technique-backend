## 🧾 La traçabilité automatique

Chaque mouvement [[de:stock]] que LabFlow génère pour vous — production, consommation [[de:recette]], [[nom:transfert]], [[nom:vente]] — porte une référence et, dans la plupart des cas, [[un:fournisseur]], même quand ce n'est pas vous qui les avez saisis. Voici comment lire ces mentions dans les historiques.

### La règle

Trois mentions automatiques existent :

- **[[Nom:fournisseur]] AUTO** — [[acc:fournisseur:porté:portée]] par les mouvements générés par le système : la ligne de production d'[[un:pt]], les sorties [[de:article:pl]] et de sous-produits consommés par [[le:recette]], les sorties liées [[au:vente:pl]], ainsi que la sortie [[de:transfert]] d'[[un:pt]] côté [[nom:labo]]. Cette fiche est créée automatiquement et n'apparaît pas dans votre liste [[de:fournisseur:pl]].
- **Référence automatique** — construite à partir du nom [[du:produit]] et de l'année de l'opération (voir formule ci-dessous).
- **[[Nom:fournisseur]] « [[nom:labo]] »** — les réceptions [[de:transfert]] côté [[nom:activite]] portent le **nom de [[votre:labo]]** comme [[nom:fournisseur]]. Cette fiche [[nom:fournisseur]] est créée automatiquement avec [[le:labo]], suit son nom, et ne peut être ni modifiée ni supprimée depuis l'écran [[Pl:fournisseur]].

:::formule Référence automatique
RÉF = INITIALES DU NOM (ou 3 PREMIÈRES LETTRES si un seul mot) + « - » + ANNÉE SUR 2 CHIFFRES
note: en majuscules, sans accents ; l'année est celle de la date de l'opération. « Crème Pâtissière » en 2026 → CP-26 ; « Cookies » → COO-26.
:::

:::exemple
Production de 40 « Crème Pâtissière » [[au:labo]], le 15 mars 2026 :

- entrée de 40 unités : [[nom:fournisseur]] AUTO, référence **CP-26** (initiales de « Crème Pâtissière » + année) ;
- sortie de 10 kg de « Lait » consommé par [[le:recette]] : [[nom:fournisseur]] AUTO, référence **LAI-26** (un seul mot → 3 premières lettres) ;
- sortie de 2 kg de « Sucre Semoule » : [[nom:fournisseur]] AUTO, référence **SS-26**.

Une semaine plus tard, 20 unités partent en [[nom:transfert]] vers [[le:activite]] « Salon de thé » avec le bon de livraison BL-0187 : l'entrée côté [[nom:activite]] affiche le nom [[du:labo]] en [[nom:fournisseur]] et la référence BL-0187 ; la sortie côté [[nom:labo]] porte [[le:fournisseur]] AUTO et la même référence.
:::

### Comment lire les historiques

- Dans l'historique d'[[det:activite:un]]**[[nom:activite]]**, la mention AUTO apparaît sur les lignes de sortie (quantités négatives) générées par le système : consommations [[de:recette]] (badge 🔄 [[Court:pt]]) et sorties [[de:vente]] (badge 💰 [[Court:vente]]). Les entrées de production affichent la référence automatique [[du:produit]].
- Dans l'historique [[det:labo:du]]**[[nom:labo]]**, les lignes de production et les consommations qu'elles déclenchent portent [[le:fournisseur]] AUTO et leur référence automatique.
- Les réceptions [[de:transfert]] (badge *[[Court:transfert]]*) affichent le **nom [[du:labo]]** en [[nom:fournisseur]] et la référence saisie [[au:transfert]], dans la colonne Réf. Facture / BL.
- Le filtre **Type [[de:appro:court]]** des historiques ([[acc:appro:Manuel:Manuelle]], [[Court:transfert]], [[Court:vente]], [[Court:pt]]) permet d'isoler ces mouvements.

### Variations

- La référence automatique change chaque année : une production de janvier 2027 [[acc:produit:du même:de la même]] [[nom:produit]] portera CP-27.
- Deux [[nom:produit:pl]] partageant les mêmes initiales partagent la même référence : c'est le couple [[nom:produit]] + référence qui identifie le mouvement, pas la référence seule.

:::astuce
Si une ligne porte [[le:fournisseur]] AUTO, elle n'a pas été saisie à la main : inutile de chercher qui l'a créée, c'est une écriture système déclenchée par une production ou [[un:vente]].
:::

### Voir aussi

- [Production [[un:pt:pl]]](#calc-production-pt)
- [Valorisation [[un:transfert:pl]]](#calc-transferts)
- [Historique](#historique)
- [[[Nom:fournisseur:pl]]](#fournisseurs)