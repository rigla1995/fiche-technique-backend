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
2. Facultatif : glissez dans la zone **📎 Facture [[du:fournisseur]]** le PDF, le scan ou la photo de la facture reçue (sur un téléphone, touchez la zone pour prendre la photo). Une vignette s'affiche ; la croix ✕ retire un fichier avant l'envoi. LabFlow lit aussitôt la facture et remplit les champs vides du bloc (voir « La facture lue »).
3. Saisissez quantité et prix HT (TVA facultative) sur chaque ligne concernée.
4. Cliquez sur **Enregistrer** : une fenêtre récapitule la facture, avec une case **Timbre Fiscal** (cochée par défaut, 1,000 DT — 1,500 ou 2,000 DT pour une facture de grande surface), le nombre de fichiers joints et, si la facture a été lue, la comparaison avec son total ; confirmez. Toutes les lignes et la facture jointe s'enregistrent ensemble ; une facture du même numéro déjà saisie chez [[ce:fournisseur]] est signalée avant l'enregistrement. Avec le module **LabFlow Compta** et une pièce jointe, la case **Envoyer à la comptabilité** (cochée) fait partir la facture dans votre comptabilité.

Produire [[un:pt:court]] ([[nom:labo:pl]] de production uniquement — [[un:labo]] [[acc:labo:configuré:configurée]] sans production, tel un économat, n'affiche pas [[de:pt:pl:court]]) :

1. Saisissez la **quantité produite** sur la ligne [[du:pt:court]] — aucun prix à saisir, son coût est calculé d'après les prix [[du:article:pl]] [[du:labo]].
2. Enregistrez : [[le:ingredient:pl]] [[du:recette]] **et les sous-PT** qu'[[acc:recette:il:elle]] contient sont déduits automatiquement [[du:stock]] [[du:labo]].
3. Au besoin, le bouton **⚙️ Personnaliser** permet d'ajuster [[le:portion:pl]] réellement [[acc:portion:utilisé:utilisée:pl]] pour cette production.

Déclarer [[un:perte]] : bouton **📉 [[Court:perte]]**, puis quantité, type (selon votre domaine : Avarie ou Déchet par défaut) et date ; la fenêtre affiche [[le:stock]] disponible, le prix unitaire retenu et le coût total [[du:perte]].

Définir un seuil : bouton **🔧 Seuil**. [[Le:stock]] s'affiche ensuite en 🔴 (au seuil ou en dessous), 🟠 (jusqu'à seuil + 10 %) ou 🟢 (au-dessus).

### La facture lue

Dès qu'une facture est déposée dans la zone **📎 Facture [[du:fournisseur]]**, LabFlow la **lit** : le panneau **🔎 Lu sur la facture** apparaît sous la zone. La lecture se fait sur cet appareil — rien n'est envoyé ailleurs — en quelques secondes pour un PDF, un peu plus pour un scan ou une photo. Elle donne :

- **[[Nom:fournisseur]]** : [[acc:fournisseur:reconnu:reconnue]] par son **matricule fiscal** (✓, [[acc:fournisseur:choisi:choisie]] d'office dans le bloc) ; à défaut, [[un:fournisseur]] au nom voisin est [[acc:fournisseur:proposé:proposée]] (**Oui, c'est [[acc:fournisseur:lui:elle]]** lui ajoute le matricule lu) ; si [[aucun:fournisseur]] ne correspond, **Créer [[le:fournisseur]]…** ouvre une fiche pré-remplie d'après la facture, à relire avant de la créer — ou à rattacher à [[un:fournisseur]] déjà [[acc:fournisseur:enregistré:enregistrée]] sous un autre nom ;
- le **n° de facture** et la **date**, recopiés dans les champs vides — une valeur saisie à la main n'est jamais remplacée ;
- les **totaux** (HT, TVA, timbre, TTC) : la fenêtre récapitulative compare le total de votre saisie au TTC lu et règle le timbre (1, 1,5 ou 2 DT).

Chaque champ rempli porte la pastille **lu — à relire** jusqu'à ce que vous le modifiiez. Rien n'est enregistré avant **Enregistrer**. Une facture écrite à la main, ou une photo trop floue, ne se lit pas : saisissez alors l'en-tête vous-même — la facture est jointe quand même.

Une **photo** est préparée avant d'être lue : la feuille est repérée sur la table et remise d'équerre, une photo couchée est tournée, l'ombre est effacée. Plusieurs photos — ou les pages d'un PDF scanné, 5 au plus — se lisent comme les pages d'une même facture ; une page déposée deux fois est signalée.

### Vérifier la facture et enregistrer

Quand la facture est lue, le panneau annonce **📋 N lignes lues** et propose **Vérifier la facture et enregistrer →** (il faut d'abord [[le:fournisseur]] et le n° de facture dans le bloc). La fenêtre **Vérifier la facture** s'ouvre : à gauche la facture (pages, zoom ; cliquer une ligne l'encadre sur la page), à droite ses lignes.

- Sur une photo : **✂️ Recadrer** — placez les quatre coins sur les bords de la facture, puis **✓ Relire ce cadre** ; **↻ Pivoter** tourne la page d'un quart de tour et la relit. Les lignes sont alors relues (les choix déjà faits sur les lignes sont perdus : LabFlow le demande avant).
- **📐 mise en page connue** : après une première facture lue et validée de [[ce:fournisseur]] (son matricule fiscal sur sa fiche), LabFlow connaît la place de ses colonnes et s'en sert pour lire une photo difficile. Cette mise en page — la place des colonnes, rien de vos montants — sert aussi aux autres comptes LabFlow, dès que deux comptes au moins ont vu la même.

- Chaque ligne reprend ce qui est imprimé : désignation, **code [[nom:fournisseur]]** (colonne « Réf. » ou « Code » de sa facture, par exemple P310 : ce code reconnaît la ligne la fois suivante), quantité, unité, prix HT, remise, TVA et montant HT, avec ✓ quand quantité × prix − remise = montant (⚠ sinon : relisez la ligne). Tout se corrige à la main.
- LabFlow propose [[le:article]] et la **conversion** (« 1 sac = 25 kg », « 1 pack = 6 bouteilles ») : ligne **reconnue** (déjà validée chez [[ce:fournisseur]]), **proposée, à confirmer**, ou **à choisir**. Une ligne peut aussi rester **hors [[nom:stock]]** : transport, frais de livraison, consigne, prestation, autre frais — elle reste sur la facture sans entrer en [[nom:stock]].
- Le champ **[[Nom:article]] LabFlow** est une recherche : au clic, des suggestions — [[le:article:pl]] déjà [[acc:article:acheté:achetée:pl]] chez [[ce:fournisseur]], puis les plus proches de la désignation ; tapez quelques lettres (« far t45 ») pour retrouver [[un:article]] parmi des centaines ; **Entrée** choisit, **Échap** referme la liste. Les natures hors [[nom:stock]] sont en bas de la même liste. **+ Créer [[le:article]]** [[acc:article:le:la]] crée depuis la ligne (nom, unité, catégorie). [[Un:article]] [[acc:article:choisi:choisie]] qui n'était pas encore dans la grille y est [[acc:article:ajouté:ajoutée]].
- Sous chaque ligne : la quantité qui entre en [[nom:stock]] et son prix par unité ; ⚠ si ce prix s'écarte de plus de 30 % du dernier achat.
- En pied : remise globale, FODEC et timbre, puis les totaux **lus** et **recalculés** (✓ ou ⚠). Un écart n'empêche pas d'enregistrer.

**Valider et enregistrer** reste fermé tant qu'une ligne est à choisir ou qu'une proposition n'est pas confirmée (**✓ Confirmer**, ou **Confirmer les N propositions**). La validation enregistre tout d'un coup : [[le:appro:court]] (quantité × conversion, coût net de la remise globale, FODEC compris), la facture et sa pièce — et LabFlow **apprend** chaque ligne : la prochaine facture de [[ce:fournisseur]] se reconnaîtra seule (page [Correspondances](#fournisseurs)). **Fermer** abandonne tout : rien n'est enregistré. Avec le module **LabFlow Compta**, la case **Envoyer à la comptabilité** (cochée) fait partir la facture validée dans votre comptabilité : l'écriture d'achat y est préparée en brouillard, votre comptable la valide (page [Factures](#factures)).

### Points d'attention

:::regle
Une facture **validée** ne se modifie plus : ses lignes portent un 🔒 dans l'historique. Pour la corriger, supprimez-la en entier depuis l'écran [Factures [[de:appro:court]]](#factures), puis déposez-la de nouveau. Un même n° de facture ne s'enregistre jamais deux fois chez [[le:fournisseur]] qui l'a émise.
:::

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