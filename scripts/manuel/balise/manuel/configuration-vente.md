## 💲 Configuration [[Court:vente]]

Cet écran est le point de départ [[du:espace_vente:Nom]] : vous y choisissez, **canal par canal**, les articles proposés [[au:vente]] et leurs prix. [[Le:vente]] [[acc:vente:direct:directe]] au comptoir est un canal, chaque [[nom:prestataire]] de livraison en est un autre : chacun a sa propre liste et ses propres prix. Vous le trouvez dans le menu **[[Nom:espace_vente]] → Configuration [[Court:vente]]**.

### Activer le module [[Court:vente]]

[[Le:espace_vente:Nom]] est une option de votre abonnement. Tant qu'[[acc:espace_vente:il:elle]] n'est pas [[acc:espace_vente:activé:activée]], un écran « Module [[Court:vente]] non activé » s'affiche à la place :

1. Cliquez sur **🚀 Demander l'activation**.
2. Un message « Demande envoyée — en attente de validation » confirme l'envoi ; l'activation est réalisée par l'administrateur sous 24 h.
3. Suivez le statut de votre demande dans [Mon Abonnement](#abonnement).

### Ce que vous voyez

- Un **sélecteur [[de:activite]]** : chaque [[nom:activite]] a sa propre configuration de prix.
- Deux raccourcis dans l'en-tête : **🛵 [[Pl:prestataire]]** et **🏗️ Charges**.
- Quatre onglets : **🛍️ [[Nom:vente]] [[Court:produit:pl]]**, **🧂 [[Pl:vente]] [[Court:supplement:pl]]** et **💎 [[Pl:vente]] [[acc:vente:Valorisés:Valorisées]]** (chacun avec son compteur d'articles), plus **📋 Historique config**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie [[de:produit]]** avec la colonne *[[Nom:produit]]*, puis une colonne par **canal** : *🏪 [[Nom:vente]] [[acc:vente:direct:directe]]* et une colonne *🛵* par [[nom:prestataire]] [[acc:prestataire:actif:active]]. Chaque cellule porte une **case** (la ligne se vend sur ce canal) et un **prix** en DT.
- Sous le titre de chaque canal, **✓ Tout** coche toutes les lignes qui y ont un prix et **✕ Aucun** les décoche (les prix sont gardés).
- Une barre d'outils : recherche par nom, filtre par canal (ce qui s'y vend), bouton **✕ Réinitialiser**, compteur d'articles et bouton **💾 Enregistrer** affichant le nombre de modifications en attente.
- Le bouton **📋 Copier un canal**, dès qu'[[un:prestataire]] est [[acc:prestataire:actif:active]].

### Actions pas à pas

Vendre une ligne sur un canal et fixer son prix :

1. Saisissez son **prix** dans la colonne du canal : la case se coche d'elle-même au premier prix.
2. Pour retirer la ligne d'un canal sans perdre son prix, décochez la case ; recochez-la pour l'y remettre.
3. Cliquez sur **💾 Enregistrer** : toutes les cellules modifiées partent ensemble. Si l'une est refusée, rien n'est enregistré et un message en donne la raison.

Vendre une ligne chez [[un:prestataire]] seulement : laissez la colonne *🏪 [[Nom:vente]] [[acc:vente:direct:directe]]* vide ou décochée et renseignez le prix dans la colonne [[du:prestataire]]. Aucun prix direct n'est demandé.

Copier un canal vers un autre (bouton **📋 Copier un canal**) :

1. Choisissez le canal **Depuis** et le canal **Vers**.
2. Indiquez si besoin une **majoration** en % (par exemple pour couvrir la commission) et l'**arrondi** du prix : au centième, à 100 millimes, à 500 millimes ou au dinar.
3. La fenêtre annonce le nombre de lignes à copier et de prix remplacés ; validez avec **📋 Copier**.
4. L'option « Retirer du canal d'arrivée… » y décoche ce que le canal d'origine ne vend pas (les prix sont gardés).

Dès que vous activez [[un:prestataire]], LabFlow propose de copier vers lui ce qui se vend en direct.

Préparer [[un:produit]] autrement pour un canal (bouton **＋ [[Nom:recette]] par canal**, sur la ligne [[du:produit]]) :

1. Donnez un nom à la variante (« Livraison » est proposé) et cochez les canaux où elle remplace [[le:produit]] d'origine.
2. Cliquez sur **Créer la variante** : LabFlow copie [[le:produit]] et [[son:recette]], range la variante juste sous lui et la coche sur ces canaux, au même prix. [[Le:produit]] d'origine y est décoché, son prix gardé. Sur un canal où il n'avait pas de prix, saisissez celui de la variante.
3. Choisissez **Ajuster [[le:recette]]** : l'assistant [[du:produit:pl]] s'ouvre sur la variante, à l'étape [[du:article:pl]]. Changez les quantités, ajoutez un emballage, puis enregistrez.

La variante est [[un:produit]] à part entière : [[son:fiche_technique]], son coût, sa sortie [[de:stock]] et [[son:marge]] lui sont propres, et elle a sa ligne dans les rapports. Ce bouton est réservé au compte propriétaire.

Gérer les canaux [[nom:prestataire:pl]] (bouton **🛵 [[Pl:prestataire]]**) :

1. Sélectionnez [[le:activite]] [[acc:activite:concerné:concernée]].
2. Activez chaque [[nom:prestataire]] de livraison avec l'interrupteur : une fenêtre demande ses **conditions** — la **commission** (%), la **TVA** (%) sur cette commission et le **mode de paiement** (Espèces, Virement… liste tenue par l'administrateur). Un exemple sur 100 DT montre le net obtenu.
3. Les conditions s'affichent sous le nom [[du:prestataire]] ; **✏️ Modifier les conditions** les change pour [[le:vente:pl]] à venir. [[Le:vente:pl]] déjà [[acc:vente:enregistrés:enregistrées]] gardent les conditions du jour de leur saisie.
4. Désactiver [[un:prestataire]] **efface ses conditions et ses prix** pour [[le:activite]] : une confirmation le rappelle, avec le nombre de prix concernés. Ce qui ne se vendait que sur ce canal n'est alors plus proposé [[au:vente]].
5. La liste [[du:prestataire:pl]] disponibles et celle des modes de paiement sont gérées par l'administrateur : si elles sont vides, contactez le [support](#support).

[[Un:prestataire]] [[acc:prestataire:activé:activée]] avant l'arrivée des conditions porte la mention **⚠ Conditions à renseigner** : tant qu'elles manquent, la saisie [[du:vente:pl]] sur ce canal est refusée.

Consulter l'onglet **📋 Historique config** : chaque enregistrement de prix y est tracé ([[nom:produit]], type, prix enregistré, date, auteur). Vous pouvez filtrer par nom, type et période, actualiser la liste, supprimer une entrée, et exporter en Excel avec **Exporter XLS** — en cochant des lignes au préalable, seules celles-ci sont exportées.

### Points d'attention

:::attention
Le prix de chaque [[nom:prestataire]] est **saisi par vous**, article par article ou d'un coup avec **📋 Copier un canal** : la commission ne calcule aucun prix. Elle sert, avec la TVA, au **chiffre net** [[du:prestataire]] dans le [tableau de bord](#dashboard) : net = prix [[de:vente]] − commission − TVA sur la commission.
:::

:::attention
Une case ne se coche qu'avec un **prix supérieur à 0** ; effacer le prix d'une case cochée la décoche. Une ligne sans case cochée sur un canal ne s'y vend pas : dans la [saisie [[du:vente:pl]]](#saisie-ventes), sa case de quantité est fermée et [[le:vente]] est [[acc:vente:refusé:refusée]].
:::

:::attention
Sans [[nom:prestataire]] [[acc:prestataire:actif:active]] pour [[le:activite]], les colonnes [[nom:prestataire:pl]] n'apparaissent pas : un bandeau vous propose alors de configurer [[le:prestataire:pl]].
:::

:::regle
Une variante ne peut pas avoir de variante, et [[un:produit]] qui en a ne se supprime qu'après elles. [[Le:article:pl]] [[acc:article:valorisé:valorisée:pl]] n'ont pas [[de:recette]] : pour eux, seuls la case et le prix changent d'un canal à l'autre.
:::

:::astuce
Le bouton 💾 Enregistrer affiche le nombre de cellules modifiées non sauvegardées : enregistrez avant de changer [[de:activite]] ou de copier un canal pour ne rien perdre.
:::

### Voir aussi

- [Saisie [[du:vente:pl]]](#saisie-ventes) — utiliser ces prix au quotidien
- [[[Nom:produit_vendable:pl]]](#produits-vendables) et [[[Nom:article:pl]] [[acc:article:valorisé:valorisée:pl]]](#articles-valorises) — créer les articles à vendre
- [Charges](#charges) — compléter votre configuration de rentabilité
- [Comprendre les prix](#calc-prix) et [HT / TTC](#calc-ht-ttc)