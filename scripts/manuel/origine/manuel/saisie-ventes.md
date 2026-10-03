## 🛒 Saisie des ventes

Cet écran vous permet d'enregistrer les ventes quotidiennes de chaque activité — en vente directe au comptoir comme via vos prestataires de livraison — puis d'en consulter l'historique complet. Vous le trouvez dans le menu **Espace Vente → Ventes Activités**.

### Ce que vous voyez

- Un **sélecteur d'activité** et deux raccourcis : **⚙️ Configuration** et **📊 Rapport**.
- Quatre onglets : **📝 Saisie des ventes produits**, **🧂 Saisie des ventes suppléments**, **💎 Saisie des ventes valorisées** et **📋 Historique**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie** avec les colonnes *Article* (et son unité), *Prix vente*, *🏪 Qté directe*, puis une colonne *🛵* par prestataire actif.
- Une barre d'outils : recherche par nom, champ **Date de vente** et bouton **✓ Confirmer les ventes**.
- En bas du tableau, le **CA total** de votre saisie, mis à jour en direct.

### Actions pas à pas

Enregistrer les ventes d'une journée :

1. Choisissez l'activité, puis l'onglet correspondant au type d'article (produits, suppléments ou valorisés).
2. Vérifiez la **date de vente** : la date du jour est proposée par défaut, modifiable pour une saisie a posteriori.
3. Saisissez les quantités vendues dans la colonne **🏪 Qté directe** et/ou dans la colonne de chaque prestataire.
4. Contrôlez le **CA total** en bas de tableau.
5. Cliquez sur **✓ Confirmer les ventes** : une fenêtre rappelle que la vente déduira directement le stock de l'activité ; validez avec **✓ Confirmer**.

Consulter et gérer l'historique (onglet 📋) :

1. Filtrez par période (**Du / Au**), **type de vente** (directe ou prestataire), **type de produit** (produit, supplément, valorisé) et **prestataire**.
2. Chaque ligne détaille l'article, son badge de type, le canal (🏪 Directe ou 🛵 nom du prestataire), la quantité, le CA avec le prix unitaire appliqué, et l'auteur de la saisie.
3. Cliquez sur **Exporter XLS** pour télécharger l'historique en Excel ; cochez d'abord des lignes pour n'exporter que celles-ci.
4. Le bouton **Annuler** d'une ligne supprime la vente et **réintègre les quantités en stock** (une confirmation est demandée).

### Calculs

:::formule Chiffre d'affaires d'une ligne
CA = quantité vendue × prix de vente du canal
note: prix direct pour la vente au comptoir, prix prestataire configuré pour chaque prestataire.
:::

À la confirmation, les quantités vendues sont déduites du stock de l'activité : les articles valorisés directement, les produits et suppléments via la décomposition de leur fiche technique (articles et sous-produits transformés) ; un produit préparé au labo est, lui, déduit tel quel du stock de produits transformés de l'activité. La marge dégagée est ensuite analysée dans le [rapport de vente](#rapports-vente).

### Points d'attention

:::attention
Configurez le **prix prestataire** de chaque article avant de saisir des quantités sur ce canal : une quantité saisie sans prix configuré est valorisée à 0 DT dans le chiffre d'affaires.
:::

:::attention
La confirmation déduit immédiatement le stock. En cas d'erreur, utilisez le bouton **Annuler** dans l'historique : la vente est supprimée et le stock réintégré. Un gérant ne peut annuler que les ventes qu'il a lui-même saisies.
:::

:::astuce
Seuls les articles **activés** en Configuration Vente apparaissent dans les tableaux de saisie. Si un tableau est vide, un lien vous mène directement à l'écran de configuration des prix.
:::

### Voir aussi

- [Configuration Vente](#configuration-vente) — activer les articles et fixer les prix
- [Ventes Labo](#ventes-labo) — le pendant côté laboratoire
- [Rapports de vente](#rapports-vente) — analyser CA et marges
- [Stock des activités](#stock-activites) et [Fiches techniques](#fiches-techniques) — comprendre le déstockage