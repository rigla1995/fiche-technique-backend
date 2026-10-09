## 🧾 Factures [[de:appro]]

Ces écrans regroupent [[votre:appro:pl]] par **facture [[nom:fournisseur]]**, pour rapprocher vos achats des documents reçus et suivre vos décaissements. Il en existe deux, jumeaux : l'un pour [[det:activite:le:pl]]**[[nom:activite:pl]]** (menu [[Nom:stock]]) et l'autre pour [[det:labo:le]]**[[nom:labo]]** ([[nom:espace_labo]]), qui présente les mêmes informations à l'échelle [[du:labo_long]].

### Ce que vous voyez

En haut, des pastilles pour choisir [[le:activite]] 🏪 (ou [[le:labo]] 🏭). Puis la barre de filtres : période **Du / Au** (l'année en cours par défaut), **[[Nom:fournisseur]]** et **Réf. Facture** (recherche partielle) — l'écran [[compl:labo]] ajoute un filtre **Destination / Origine** pour isoler les factures liées à [[un:activite]] ou à [[un:labo]] ([[nom:transfert:pl]] [[acc:transfert:émis:émise:pl]] ou [[acc:transfert:reçu:reçue:pl]]).

Chaque facture est une carte repliée : [[nom:fournisseur]], référence, date, badge **[[acc:appro:Manuel:Manuelle]]**, **↗ [[Court:transfert]] [[acc:transfert:émis:émise]] → X** (cession vers [[un:activite]] ou [[un:labo]] [[acc:labo:rattaché:rattachée]]) ou **↙ [[Court:transfert]] [[acc:transfert:reçu:reçue]] ← X** (réception depuis [[le:labo]] qui vous alimente), et les montants **Total HT** et **Total TTC** en DT. À droite, le bouton de la facture [[du:fournisseur]] : **📎 Voir la facture** (avec le nombre de fichiers s'il y en a plusieurs) quand elle est jointe, **📎 Joindre la facture** (cadre orangé) sinon ; une facture interne [[de:transfert]] garde son document **📄 PDF** fabriqué par LabFlow. Un clic sur la carte déplie le détail ligne par ligne : [[nom:article]] (avec son unité), catégorie, quantité, prix HT à l'unité, taux de TVA, prix TTC à l'unité, totaux HT et TTC — suivi d'un sous-total par facture. Les colonnes TVA n'apparaissent que si la facture en comporte.

Les boutons **Tout ouvrir / Tout fermer** déplient ou replient toutes les cartes de la page. En bas : le compteur de factures avec la pagination, le bouton **Charger plus**, et un bandeau **Total général HT / TTC** cumulant les factures chargées.

### Actions pas à pas

1. Choisissez [[le:activite]] (ou [[le:labo]]), puis la période.
2. Filtrez par [[nom:fournisseur]], ou saisissez quelques caractères de la référence pour retrouver une livraison précise.
3. Cliquez sur une carte pour vérifier les lignes (quantités, prix, TVA) face au document papier.
4. Les factures se chargent par lots : utilisez **Charger plus** en bas de liste si la période est longue.

Gérer la facture [[du:fournisseur]] :

1. Cliquez sur **📎 Voir la facture** (ou **📎 Joindre la facture**) : une fenêtre liste les fichiers joints — nom, taille, date et auteur de l'ajout.
2. **Ouvrir** affiche le fichier dans un nouvel onglet ; pour une photo HEIC, c'est sa copie lisible partout, et **Original** télécharge la photo d'origine.
3. Pour ajouter un fichier, glissez-le dans la zone **📎 Facture [[du:fournisseur]]** (5 fichiers au plus par facture), puis **Joindre**.
4. **Remplacer** dépose un nouveau fichier à la place de l'ancien ; **Supprimer** retire un fichier. Dans les deux cas, l'ancien fichier est **effacé définitivement** (une confirmation le rappelle) ; les lignes de la facture ne changent pas.

### Points d'attention

:::regle
Les factures ne se saisissent pas ici : elles sont construites automatiquement à partir de [[votre:appro:pl]]. C'est le **n° de facture saisi au moment [[du:appro:court]]** qui relie les lignes entre elles — utilisez toujours la même référence pour une même livraison.
:::

:::attention
La pièce jointe est la vraie facture [[du:fournisseur]] : LabFlow ne fabrique plus de PDF pour [[votre:appro:pl]] [[acc:appro:saisi:saisie:pl]]. Une facture dont on supprime la **dernière ligne** (écran Historique) disparaît avec ses fichiers : LabFlow demande alors une confirmation. [[Un:gerant]] ne voit et ne gère que les factures [[du:activite:pl]] et [[du:labo:pl]] qui lui sont [[acc:labo:affecté:affectée:pl]] ; un compte en lecture seule consulte les fichiers sans pouvoir en ajouter ni en supprimer.
:::

:::formule Total facture TTC
Total TTC = Σ ( quantité × prix HT × ( 1 + TVA ÷ 100 ) )
note: Calculé ligne par ligne, selon le taux de TVA propre à chaque [[nom:article]].
:::

:::astuce
Les badges « ↗ [[Court:transfert]] [[acc:transfert:émis:émise]] » et « ↙ [[Court:transfert]] [[acc:transfert:reçu:reçue]] » signalent une facture interne issue d'[[un:transfert]] : côté destination ([[nom:activite]] ou [[nom:labo]]), [[le:fournisseur]] [[acc:fournisseur:affiché:affichée]] est alors [[det:labo:le]]**[[nom:labo]] source [[acc:labo:lui-même:elle-même]]**. Le filtre [[Nom:fournisseur]] de l'écran [[compl:activite:pl]] ne liste, lui, que [[votre:fournisseur:pl]] externes.
:::

### Voir aussi

- [HT et TTC dans LabFlow](#calc-ht-ttc) · [[[Nom:fournisseur:pl]]](#fournisseurs)
- [[[Nom:transfert:pl]] [[nom:labo]] → [[nom:activite:pl]]](#transferts) · [Historique [[du:appro:pl]]](#historique)
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) · [[[Nom:stock]] [[Court:labo]]](#stock-labo)