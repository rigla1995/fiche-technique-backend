## 🏭 [[Nom:stock]] [[Court:labo]]

Cet écran gère [[le:stock]] de [[votre:labo_long]][[acc:labo_long: central:]] : [[le:article:pl]] que vous y achetez et [[det:pt:le:pl]][[avecCourt:pt:pl]] que vous y fabriquez. Vous y accédez depuis [[le:espace_labo]] ; si vous possédez plusieurs [[nom:labo:pl]], une rangée de pastilles en haut de page permet de passer de [[acc:labo:l'un:l'une]] à l'autre — le menu latéral suit alors [[le:labo]] [[acc:labo:affiché:affichée]].

### Ce que vous voyez

Un bandeau rappelle le nom [[du:labo]] et propose le bouton **↗ Transfert** vers l'écran d'envoi [[au:activite:pl]] et [[au:labo:pl]] rattachés. En dessous : une barre de filtres (Catégorie, [[Nom:article]], Nom, [[Nom:fournisseur]], Réf. Facture), puis le bloc **[[Nom:appro]]** avec la Date [[de:appro:court]], [[le:fournisseur:Nom]], la Réf Facture et les boutons **Enregistrer** (le nombre de lignes prêtes s'affiche entre parenthèses) et **Réinitialiser**. Sous ces champs, la zone **📎 Facture [[du:fournisseur]]** reçoit la vraie facture : PDF, scan ou photo (y compris la photo HEIC d'un iPhone), jusqu'à 5 fichiers de 15 Mo — facultatif.

[[Le:stock]] est [[acc:stock:présenté:présentée]] par catégories repliables :

| Colonne | Contenu |
|---|---|
| [[Nom:article]] | nom, unité, badge **[[Court:pt]]** (et « ◆ Composé valorisé » pour les composés fabriqués [[au:labo]]), bouton 📋 Historique — les 5 derniers mouvements avec leur type : [[acc:appro:Manuel:Manuelle]], [[Court:transfert]] (↗ [[acc:transfert:envoyé:envoyée]] ou ↙ [[acc:transfert:reçu:reçue]] [[du:labo]] qui vous alimente), [[Court:pt]], [[Court:perte]]… |
| [[Nom:stock]] [[acc:stock:Actuel:Actuelle]] | quantité restante et sa ventilation depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] : ↑ [[court:appro]] (achats et réceptions d'[[un:labo]] source), ⇄ [[nom:transfert:pl]], ↘ [[court:perte:pl]], consommation [[court:pt]] |
| Coût Total | valeur [[du:stock]] en DT (TTC, avec rappel du HT) |
| Quantité · Prix · TVA (%) | saisie d'[[acc:appro:un:une]] [[nouveau:appro:court]] — le prix d'[[un:pt:court]] est calculé automatiquement, il ne se saisit pas |
| Actions | 🔧 Seuil, 📉 [[Court:perte]], ⚙️ Personnaliser ([[court:pt:pl]] uniquement) |

Un panneau « Aperçu saisie » totalise en direct, en TTC, ce que vous êtes en train d'enregistrer.

### Actions pas à pas

Approvisionner [[un:article:pl]] :

1. Renseignez la date, [[le:fournisseur]] et le n° de facture dans le bloc [[Nom:appro]].
2. Facultatif : glissez dans la zone **📎 Facture [[du:fournisseur]]** le PDF, le scan ou la photo de la facture reçue (sur un téléphone, touchez la zone pour prendre la photo). Une vignette s'affiche ; la croix ✕ retire un fichier avant l'envoi.
3. Saisissez quantité et prix HT (TVA facultative) sur chaque ligne concernée.
4. Cliquez sur **Enregistrer** : une fenêtre récapitule la facture, avec une case **Timbre Fiscal** (+1,000 DT, cochée par défaut) et le nombre de fichiers joints ; confirmez. Toutes les lignes et la facture jointe s'enregistrent ensemble ; une facture du même numéro déjà saisie chez [[ce:fournisseur]] est signalée avant l'enregistrement.

Produire [[un:pt:court]] ([[nom:labo:pl]] de production uniquement — [[un:labo]] [[acc:labo:configuré:configurée]] sans production, tel un économat, n'affiche pas [[de:pt:pl:court]]) :

1. Saisissez la **quantité produite** sur la ligne [[du:pt:court]] — aucun prix à saisir, son coût est calculé d'après les prix [[du:article:pl]] [[du:labo]].
2. Enregistrez : [[le:ingredient:pl]] [[du:recette]] **et les sous-PT** qu'[[acc:recette:il:elle]] contient sont déduits automatiquement [[du:stock]] [[du:labo]].
3. Au besoin, le bouton **⚙️ Personnaliser** permet d'ajuster [[le:portion:pl]] réellement [[acc:portion:utilisé:utilisée:pl]] pour cette production.

Déclarer [[un:perte]] : bouton **📉 [[Court:perte]]**, puis quantité, type (selon votre domaine : Avarie ou Déchet par défaut) et date ; la fenêtre affiche [[le:stock]] disponible, le prix unitaire retenu et le coût total [[du:perte]].

Définir un seuil : bouton **🔧 Seuil**. [[Le:stock]] s'affiche ensuite en 🔴 (au seuil ou en dessous), 🟠 (jusqu'à seuil + 10 %) ou 🟢 (au-dessus).

### Points d'attention

:::astuce
La facture jointe se retrouve sur l'écran [Factures [[de:appro:court]]](#factures) : **📎 Voir la facture** l'ouvre. Une facture oubliée se joint plus tard, depuis le même écran, avec **📎 Joindre la facture**.
:::

:::attention
On ne mélange pas [[court:appro]] [[de:article:pl]] et production [[de:pt:pl:court]] dans un même enregistrement : dès qu'une quantité est saisie sur [[un:pt:court]], les champs [[Nom:fournisseur]] et Réf Facture se grisent (et inversement). Procédez en deux enregistrements séparés.
:::

:::attention
[[Un:perte]] ne peut pas dépasser [[le:stock]] disponible, ni porter une date antérieure [[acc:appro:au premier:à la première]] [[nom:appro]] [[du:article]].
:::

:::astuce
Si la date choisie correspond déjà à [[un:appro:court]] [[acc:appro:existant:existante]] pour [[un:article]], ses champs de saisie s'entourent d'orange : consultez l'historique 📋 avant d'enregistrer, car les quantités s'additionnent.
:::

L'affectation [[du:article:pl]] [[au:activite:pl]] (cases à cocher) se gère depuis la fiche [[du:article]] ([[[Nom:article:pl]]](#referentiel-articles)) ; elle est réservée au propriétaire du compte.

### Voir aussi

- [[[Le:pt:pl]]](#lexique-pt) · [Le calcul d'une production](#calc-production-pt)
- [Les seuils d'alerte](#calc-seuils) · [La valeur [[du:stock]]](#calc-valeur-stock)
- [[[Nom:transfert:pl]] vers [[le:activite:pl]] et [[nom:labo:pl]] rattachés](#transferts) · [Factures [[de:appro:court]]](#factures) · [[[Nom:perte:pl]]](#pertes)