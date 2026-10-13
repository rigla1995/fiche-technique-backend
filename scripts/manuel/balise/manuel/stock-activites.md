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
2. Facultatif : glissez dans la zone **📎 Facture [[du:fournisseur]]** le PDF, le scan ou la photo de la facture reçue (sur un téléphone, touchez la zone pour prendre la photo). Une vignette s'affiche ; la croix ✕ retire un fichier avant l'envoi. LabFlow lit aussitôt la facture et remplit les champs vides du bloc (voir « La facture lue »).
3. Ouvrez les catégories concernées et saisissez, ligne par ligne, la **quantité** et le **prix HT** unitaire (et le taux de TVA si vous le connaissez).
4. Contrôlez l'**Aperçu saisie** flottant en bas à droite : il cumule les lignes et le total TTC.
5. Cliquez sur **Enregistrer (N)** : une fenêtre récapitulative façon facture s'ouvre (lignes, Total HT, Total TTC, case **Timbre Fiscal** cochée par défaut, de 1,000 DT — 1,500 ou 2,000 DT pour une facture de grande surface —, le nombre de fichiers joints et, si la facture a été lue, la comparaison avec son total). Confirmez : toutes les lignes et la facture jointe s'enregistrent ensemble — si l'une est refusée, rien n'est enregistré et le message dit pourquoi. Avec le module **LabFlow Compta** et une pièce jointe, la case **Envoyer à la comptabilité** (cochée) fait partir la facture dans votre comptabilité.
6. Si une facture portant **le même numéro** existe déjà chez [[ce:fournisseur]], LabFlow l'affiche (date, lieu, montant) : vérifiez que vous ne la saisissez pas deux fois avant de choisir **Enregistrer quand même**.
7. Si [[un:appro:court]] existe déjà à cette date pour [[un:article]], une confirmation supplémentaire affiche le cumul avant validation.

Produire [[un:pt]] : saisissez la quantité sur sa ligne — l'indication **Max** montre le maximum réalisable avec [[le:stock]] [[de:ingredient:pl]], et le prix se calcule automatiquement depuis [[le:recette]] ([production [[de:pt:pl:court]]](#calc-production-pt)). Le bouton **⚙️ Personnaliser** permet d'ajuster les quantités [[de:ingredient:pl]] réellement consommées.

Configurer un seuil : bouton **🔧 Seuil**, saisissez la valeur minimale (laisser vide pour désactiver), puis Enregistrer. Le seuil d'[[un:pt]] se règle aussi [[nom:activite]] par [[nom:activite]].

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

:::attention
[[Un:pt]] [[acc:pt:fabriqué:fabriquée]] [[det:labo:au]]**[[nom:labo]]** porte le badge **⇄ [[Court:transfert]] uniquement** : sa quantité ne se saisit pas ici, [[acc:pt:il:elle]] n'entre en [[nom:stock]] [[de:activite]] que par [[[nom:transfert]]](#transferts). Par ailleurs, une même validation ne peut pas mélanger production [[de:pt:pl:court]] et [[court:appro]] [[de:article:pl]] : dès qu'une quantité [[de:pt:court]] est saisie, les champs [[Nom:fournisseur]] et Réf Facture se désactivent — enregistrez les deux séparément. Enfin, si le champ [[Nom:fournisseur]] affiche « ⚠ [[Aucun:fournisseur]] », créez d'abord [[det:fournisseur:votre:pl]][[[nom:fournisseur:pl]]](#fournisseurs) : le n° de facture est toujours exigé, et le choix d'[[un:fournisseur]] devient obligatoire dès qu'au moins [[un:fournisseur]] existe.
:::

:::regle
Une facture **validée** ne se modifie plus : ses lignes portent un 🔒 dans l'historique. Pour la corriger, supprimez-la en entier depuis l'écran [Factures [[de:appro:court]]](#factures), puis déposez-la de nouveau. Un même n° de facture ne s'enregistre jamais deux fois chez [[le:fournisseur]] qui l'a émise.
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