## 🧾 Factures d'approvisionnement

Ces écrans regroupent vos approvisionnements par **facture fournisseur**, pour rapprocher vos achats des documents reçus et suivre vos décaissements. Il en existe deux, jumeaux : l'un pour les **activités** (menu Stock) et l'autre pour le **labo** (espace labo), qui présente les mêmes informations à l'échelle du laboratoire.

### Ce que vous voyez

En haut, des pastilles pour choisir l'activité 🏪 (ou le labo 🏭). Puis la barre de filtres : période **Du / Au** (l'année en cours par défaut), **Fournisseur** et **Réf. Facture** (recherche partielle) — l'écran labo ajoute un filtre **Destination / Origine** pour isoler les factures liées à une activité ou à un labo (transferts émis ou reçus).

Chaque facture est une carte repliée : fournisseur, référence, date, badge **Manuel**, **↗ Transfert émis → X** (cession vers une activité ou un labo rattaché) ou **↙ Transfert reçu ← X** (réception depuis le labo qui vous alimente), et les montants **Total HT** et **Total TTC** en DT. Un clic déplie le détail ligne par ligne : article (avec son unité), catégorie, quantité, prix HT à l'unité, taux de TVA, prix TTC à l'unité, totaux HT et TTC — suivi d'un sous-total par facture. Les colonnes TVA n'apparaissent que si la facture en comporte.

Les boutons **Tout ouvrir / Tout fermer** déplient ou replient toutes les cartes de la page. En bas : le compteur de factures avec la pagination, le bouton **Charger plus**, et un bandeau **Total général HT / TTC** cumulant les factures chargées.

### Actions pas à pas

1. Choisissez l'activité (ou le labo), puis la période.
2. Filtrez par fournisseur, ou saisissez quelques caractères de la référence pour retrouver une livraison précise.
3. Cliquez sur une carte pour vérifier les lignes (quantités, prix, TVA) face au document papier.
4. Les factures se chargent par lots : utilisez **Charger plus** en bas de liste si la période est longue.

### Points d'attention

:::regle
Les factures ne se saisissent pas ici : elles sont construites automatiquement à partir de vos approvisionnements. C'est le **n° de facture saisi au moment de l'appro** qui relie les lignes entre elles — utilisez toujours la même référence pour une même livraison.
:::

:::formule Total facture TTC
Total TTC = Σ ( quantité × prix HT × ( 1 + TVA ÷ 100 ) )
note: Calculé ligne par ligne, selon le taux de TVA propre à chaque article.
:::

:::astuce
Les badges « ↗ Transfert émis » et « ↙ Transfert reçu » signalent une facture interne issue d'un transfert : côté destination (activité ou labo), le fournisseur affiché est alors le **labo source lui-même**. Le filtre Fournisseur de l'écran activités ne liste, lui, que vos fournisseurs externes.
:::

### Voir aussi

- [HT et TTC dans LabFlow](#calc-ht-ttc) · [Fournisseurs](#fournisseurs)
- [Transferts labo → activités](#transferts) · [Historique des approvisionnements](#historique)
- [Stock des activités](#stock-activites) · [Stock Labo](#stock-labo)