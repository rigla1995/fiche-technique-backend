## 🛒 Saisie [[du:vente:pl]]

Cet écran vous permet d'enregistrer [[le:vente:pl]] [[acc:vente:quotidien:quotidienne:pl]] de chaque [[nom:activite]] — en [[nom:vente]] [[acc:vente:direct:directe]] au comptoir comme via [[votre:prestataire:pl]] de livraison — puis d'en consulter l'historique complet. Vous le trouvez dans le menu **[[Nom:espace_vente]] → [[Pl:vente]] [[Court:activite:pl]]**.

### Ce que vous voyez

- Un **sélecteur [[de:activite]]** et deux raccourcis : **⚙️ Configuration** et **📊 Rapport**.
- Le bouton **📥 Importer la caisse** : il crée [[le:vente:pl]] d'une journée depuis le fichier exporté de la caisse (Excel ou PDF).
- Quatre onglets : **📝 Saisie [[du:vente:pl]] [[court:produit:pl]]**, **🧂 Saisie [[du:vente:pl]] [[court:supplement:pl]]**, **💎 Saisie [[du:vente:pl]] [[acc:vente:valorisés:valorisées]]** et **📋 Historique**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie** avec les colonnes *Article* (et son unité), *🏪 Qté directe*, puis une colonne *🛵* par [[nom:prestataire]] [[acc:prestataire:actif:active]]. Sous chaque case de quantité s'affiche le **prix du canal** : le prix direct, ou le prix [[du:prestataire]]. Une case n'est ouverte que sur les canaux où la ligne se vend ; ailleurs un tiret la remplace.
- Une barre d'outils : recherche par nom, champ **Date [[de:vente]]** et bouton **✓ Confirmer [[le:vente:pl]]**.
- En bas du tableau, le **CA total** de votre saisie, mis à jour en direct.

### Actions pas à pas

Enregistrer [[le:vente:pl]] d'une journée :

1. Choisissez [[le:activite]], puis l'onglet correspondant au type d'article ([[nom:produit:pl]], [[nom:supplement:pl]] ou valorisés).
2. Vérifiez la **date [[de:vente]]** : la date du jour est proposée par défaut, modifiable pour une saisie a posteriori.
3. Saisissez les quantités vendues dans la colonne **🏪 Qté directe** et/ou dans la colonne de chaque [[nom:prestataire]], là où la case est ouverte.
4. Contrôlez le **CA total** en bas de tableau.
5. Cliquez sur **✓ Confirmer [[le:vente:pl]]** : une fenêtre rappelle que [[le:vente]] déduira directement [[le:stock]] [[du:activite]] ; validez avec **✓ Confirmer**.

Importer [[le:vente:pl]] d'une journée depuis la caisse (bouton **📥 Importer la caisse**) :

1. Exportez de la caisse le fichier de la journée, détaillé par [[nom:produit]] (désignation, quantité, chiffre), en **Excel (.xlsx)** ou en **PDF**. Un fichier vaut **une journée**.
2. Cliquez sur **📥 Importer la caisse** et choisissez le fichier : LabFlow le lit sur votre poste, retrouve la journée et vérifie les sommes imprimées dans le fichier.
3. Pour chaque ligne, vérifiez [[le:produit]] de la carte : **✓ Reconnue** (déjà apprise), **≈ Proposée** (d'après le nom, à vérifier) ou **? À choisir**. Cochez **Ignorer** pour une ligne qui n'est pas à importer (un pourboire, des frais).
4. Répartissez la quantité par canal : saisissez la part de chaque [[nom:prestataire]] ; **le reste est [[du:vente]] [[acc:vente:direct:directe]]**. Sans rien saisir, toute la ligne est en [[nom:vente]] [[acc:vente:direct:directe]].
5. Pour une catégorie du fichier qui n'est que de la livraison (« DELIVERY »), cochez **Livraison** : sa quantité se répartit entre [[le:prestataire:pl]] seulement. LabFlow le propose d'après le nom de la catégorie, puis s'en souvient. [[Le:prestataire]] [[acc:prestataire:laissé:laissée]] vide reçoit le reste.
6. Cliquez sur **💾 Enregistrer [[le:vente:pl]]** : LabFlow crée [[un:vente]] par canal, avec les règles de la saisie ([[nom:stock]], coût, commission [[du:prestataire]]), et retient vos choix. La fois suivante, les mêmes lignes arrivent reconnues.

Consulter et gérer l'historique (onglet 📋) :

1. Filtrez par période (**Du / Au**), **type de vente** (directe ou [[nom:prestataire]]), **type [[de:produit]]** ([[nom:produit]], [[nom:supplement]], valorisé) et **[[nom:prestataire]]**.
2. Chaque ligne détaille l'article, son badge de type, le canal (🏪 Directe ou 🛵 nom [[du:prestataire]], avec la commission, la TVA et le mode de paiement figés le jour de la saisie), la quantité, le CA avec le prix unitaire appliqué, et l'auteur de la saisie.
3. Cliquez sur **Exporter XLS** pour télécharger l'historique en Excel (CA, commission, TVA sur la commission, net, mode de paiement) ; cochez d'abord des lignes pour n'exporter que celles-ci.
4. Le bouton **Annuler** d'une ligne supprime [[le:vente]] et **réintègre les quantités en [[nom:stock]]** (une confirmation est demandée).

### Calculs

:::formule Chiffre d'affaires d'une ligne
CA = quantité vendue × prix de vente du canal
note: prix direct pour [[le:vente]] au comptoir, prix [[nom:prestataire]] configuré pour chaque [[nom:prestataire]].
:::

:::formule Chiffre net d'[[un:vente]] par [[nom:prestataire]]
Net = CA − commission − TVA sur la commission
note: aux taux [[du:prestataire]] le jour de la saisie (30 DT à 25 % et TVA 19 % : commission 7,500, TVA 1,425, net 21,075). Changer les conditions ensuite ne touche pas [[le:vente:pl]] [[acc:vente:passé:passée:pl]].
:::

À la confirmation, les quantités vendues sont déduites [[du:stock]] [[du:activite]] : [[le:article:pl]] [[acc:article:valorisé:valorisée:pl]] directement, [[le:produit:pl]] et [[nom:supplement:pl]] via la décomposition de leur [[nom:fiche_technique]] ([[nom:article:pl]] et sous-produits transformés) ; [[un:produit]] [[acc:produit:préparé:préparée]] [[au:labo]] est, [[acc:produit:lui:elle]], [[acc:produit:déduit:déduite]] [[acc:produit:tel quel:telle quelle]] [[du:stock]] [[de:pt:pl]] [[du:activite]]. [[Le:marge]] [[acc:marge:dégagé:dégagée]] est ensuite [[acc:marge:analysé:analysée]] dans le [rapport [[de:vente]]](#rapports-vente).

### Points d'attention

:::attention
Une ligne ne se saisit que sur les canaux où elle se vend : dans Configuration [[Court:vente]], cochez sa case sur le canal voulu, avec un prix. Un tiret à la place de la case signifie que la ligne n'est pas proposée sur ce canal ; [[le:vente]] y est [[acc:vente:refusé:refusée]]. [[Un:prestataire]] dont les **conditions** (commission, TVA, mode de paiement) ne sont pas renseignées refuse la saisie : renseignez-les d'abord dans Config [[Court:prestataire:pl]].
:::

:::attention
La confirmation déduit immédiatement [[le:stock]]. En cas d'erreur, utilisez le bouton **Annuler** dans l'historique : [[le:vente]] est [[acc:vente:supprimé:supprimée]] et [[le:stock]] [[acc:stock:réintégré:réintégrée]]. [[Un:gerant]] ne peut annuler que [[le:vente:pl]] qu'[[acc:gerant:il:elle]] a [[acc:gerant:lui-même:elle-même]] [[acc:vente:saisi:saisie:pl]].
:::

:::regle
Une journée ne s'importe **qu'une fois** par [[nom:activite]], et un fichier aussi. Un fichier qui porte du chiffre sur plusieurs jours est refusé : exportez un fichier par jour. Le prix [[du:vente]] [[acc:vente:importé:importée]] est le montant de la ligne divisé par sa quantité : le chiffre de LabFlow égale celui de la caisse, remises comprises.
:::

:::astuce
Seuls les articles qui se vendent sur **au moins un canal** en Configuration [[Court:vente]] apparaissent dans les tableaux de saisie. Si un tableau est vide, un lien vous mène directement à l'écran de configuration des prix.
:::

### Voir aussi

- [Configuration [[Court:vente]]](#configuration-vente) — choisir ce qui se vend sur chaque canal et fixer les prix
- [[[Pl:vente]] [[Court:labo]]](#ventes-labo) — le pendant côté [[nom:labo_long]]
- [Rapports [[de:vente]]](#rapports-vente) — analyser CA et [[nom:marge:pl]]
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) et [[[Nom:fiche_technique:pl]]](#fiches-techniques) — comprendre le déstockage