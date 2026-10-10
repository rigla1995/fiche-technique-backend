## 📦 [[Nom:stock]] [[Court:activite:pl]]

L'écran **[[Nom:stock]] [[Court:activite:pl]]** (menu **[[Nom:espace_activites]] → [[Nom:stock]] [[Court:activite:pl]]**) est le poste central de chaque [[nom:activite_desc]] : quantités disponibles, saisie [[du:appro:pl]], seuils d'alerte et déclaration [[du:perte:pl]]. [[Le:stock]] se consulte **[[nom:activite]] par [[nom:activite]]** : sélectionnez [[le:activite_desc]] grâce aux pastilles 🏪 en haut de l'écran — il n'existe pas de vue globale « [[acc:activite:Tous:Toutes]] ». [[Un:gerant]] ne voit que [[le:activite:pl]] qui lui sont [[acc:activite:affecté:affectée:pl]].

### Ce que vous voyez

Une barre de filtres cible les lignes affichées : **Catégorie**, **[[Nom:article]]** ([[acc:article:débloqué:débloquée]] après le choix d'une catégorie), **Nom** (recherche libre), **[[Nom:fournisseur]]** et **Réf. Facture**, avec un bouton **Réinitialiser**.

Le bloc bleu **[[Nom:appro]]** regroupe les informations communes à la saisie : **Date [[de:appro:court]]** (obligatoire, entre le 1er janvier de l'année en cours et aujourd'hui), **[[Nom:fournisseur]]**, **Réf Facture** (obligatoire), puis le bouton **Enregistrer (N)** — N compte les lignes prêtes. Sous ces champs, la zone **📎 Facture [[du:fournisseur]]** reçoit la vraie facture : PDF, scan ou photo (y compris la photo HEIC d'un iPhone), jusqu'à 5 fichiers de 15 Mo — facultatif.

[[Le:article:pl]] sont [[acc:article:groupé:groupée:pl]] par **catégories repliables** (cliquez sur l'en-tête pour ouvrir). [[Le:pt:pl]] apparaissent dans leurs propres catégories : **[[Nom:cat_pt_utilisable]]**, **[[Nom:cat_pt_vendable]]** et **[[Nom:cat_pt_valorise]]** (voir [le lexique [[du:pt:pl:court]]](#lexique-pt)).

| Colonne | Contenu |
|---|---|
| [[Nom:article]] | nom, unité, lien 📋 Historique, date et quantité [[acc:inventaire:du dernier:de la dernière]] [[nom:inventaire]] 📦 |
| [[Nom:stock]] [[acc:stock:Actuel:Actuelle]] | quantité disponible + détail : ↑ [[court:appro]], ⇄ transf, ↘ [[court:perte:pl]], [[Court:pt]] (consommé par vos productions), 💰 [[MAJ:vente]] |
| Coût Total | valeur [[du:stock]] en TTC (le montant HT s'affiche en dessous) |
| Quantité | saisie de la nouvelle quantité approvisionnée |
| Prix | prix d'achat HT unitaire (calculé automatiquement pour [[un:pt]]) |
| TVA (%) | taux de TVA, optionnel |
| Actions | 🔧 Seuil, 📉 [[Court:perte]], ⚙️ Personnaliser ([[nom:pt:pl]]) |

La couleur [[du:stock]] reflète le **seuil minimum** : 🔴 [[nom:stock]] [[acc:stock:inférieur:inférieure]] ou [[acc:stock:égal:égale]] au seuil, 🟠 juste au-dessus (jusqu'à seuil + 10 %), 🟢 au-delà.

:::formule [[Nom:stock]] [[acc:stock:actuel:actuelle]]
[[Nom:stock]] = [[Nom:appro:pl]] + [[Nom:transfert:pl]] [[acc:transfert:entrant:entrante:pl]] − Consommations ([[nom:vente:pl]], productions) − [[Nom:perte:pl]] ± Ajustements [[de:inventaire]]
:::

### Actions pas à pas

Enregistrer [[un:appro]] :

1. Sélectionnez [[le:activite]], puis renseignez le bloc [[Nom:appro]] : date, [[nom:fournisseur]] et n° de facture.
2. Facultatif : glissez dans la zone **📎 Facture [[du:fournisseur]]** le PDF, le scan ou la photo de la facture reçue (sur un téléphone, touchez la zone pour prendre la photo). Une vignette s'affiche ; la croix ✕ retire un fichier avant l'envoi.
3. Ouvrez les catégories concernées et saisissez, ligne par ligne, la **quantité** et le **prix HT** unitaire (et le taux de TVA si vous le connaissez).
4. Contrôlez l'**Aperçu saisie** flottant en bas à droite : il cumule les lignes et le total TTC.
5. Cliquez sur **Enregistrer (N)** : une fenêtre récapitulative façon facture s'ouvre (lignes, Total HT, Total TTC, case **Timbre Fiscal** ajoutant 1,000 DT, cochée par défaut, et le nombre de fichiers joints). Confirmez : toutes les lignes et la facture jointe s'enregistrent ensemble — si l'une est refusée, rien n'est enregistré et le message dit pourquoi.
6. Si une facture portant **le même numéro** existe déjà chez [[ce:fournisseur]], LabFlow l'affiche (date, lieu, montant) : vérifiez que vous ne la saisissez pas deux fois avant de choisir **Enregistrer quand même**.
7. Si [[un:appro:court]] existe déjà à cette date pour [[un:article]], une confirmation supplémentaire affiche le cumul avant validation.

Produire [[un:pt]] : saisissez la quantité sur sa ligne — l'indication **Max** montre le maximum réalisable avec [[le:stock]] [[de:ingredient:pl]], et le prix se calcule automatiquement depuis [[le:recette]] ([production [[de:pt:pl:court]]](#calc-production-pt)). Le bouton **⚙️ Personnaliser** permet d'ajuster les quantités [[de:ingredient:pl]] réellement consommées.

Configurer un seuil : bouton **🔧 Seuil**, saisissez la valeur minimale (laisser vide pour désactiver), puis Enregistrer. Le seuil d'[[un:pt]] se règle aussi [[nom:activite]] par [[nom:activite]].

### Points d'attention

:::attention
[[Un:pt]] [[acc:pt:fabriqué:fabriquée]] [[det:labo:au]]**[[nom:labo]]** porte le badge **⇄ [[Court:transfert]] uniquement** : sa quantité ne se saisit pas ici, [[acc:pt:il:elle]] n'entre en [[nom:stock]] [[de:activite]] que par [[[nom:transfert]]](#transferts). Par ailleurs, une même validation ne peut pas mélanger production [[de:pt:pl:court]] et [[court:appro]] [[de:article:pl]] : dès qu'une quantité [[de:pt:court]] est saisie, les champs [[Nom:fournisseur]] et Réf Facture se désactivent — enregistrez les deux séparément. Enfin, si le champ [[Nom:fournisseur]] affiche « ⚠ [[Aucun:fournisseur]] », créez d'abord [[det:fournisseur:votre:pl]][[[nom:fournisseur:pl]]](#fournisseurs) : le n° de facture est toujours exigé, et le choix d'[[un:fournisseur]] devient obligatoire dès qu'au moins [[un:fournisseur]] existe.
:::

:::formule Prix TTC
TTC = HT × ( 1 + TVA ÷ 100 )
note: [[Un:article]] [[acc:article:acheté:achetée]] 10 DT HT avec 19 % de TVA revient à 11,900 DT TTC.
:::

:::astuce
La facture jointe se retrouve sur l'écran [Factures [[de:appro:court]]](#factures) : **📎 Voir la facture** l'ouvre. Une facture oubliée se joint plus tard, depuis le même écran, avec **📎 Joindre la facture**.
:::

:::astuce
Le lien **📋 Historique** sous chaque [[nom:article]] affiche ses derniers mouvements (date, type, quantité, prix HT et TTC, [[nom:fournisseur]], réf. facture) sans quitter l'écran, avec un bouton vers l'historique complet.
:::

### Voir aussi

- [Valeur [[du:stock]]](#calc-valeur-stock) — comment [[le:stock]] [[acc:stock:actuel:actuelle]] est [[acc:stock:calculé:calculée]]
- [HT et TTC](#calc-ht-ttc) · [Seuils d'alerte](#calc-seuils)
- [[[Nom:perte:pl]]](#pertes) · [Historiques](#historique) · [[[Nom:transfert:pl]]](#transferts) · [Factures [[de:appro:court]]](#factures)