## 🏭 Stock Labo

Cet écran gère le stock de votre laboratoire central : les articles que vous y achetez et les produits transformés (PT) que vous y fabriquez. Vous y accédez depuis l'espace labo ; si vous possédez plusieurs labos, une rangée de pastilles en haut de page permet de passer de l'un à l'autre — le menu latéral suit alors le labo affiché.

### Ce que vous voyez

Un bandeau rappelle le nom du labo et propose le bouton **↗ Transfert** vers l'écran d'envoi aux activités et aux labos rattachés. En dessous : une barre de filtres (Catégorie, Article, Nom, Fournisseur, Réf. Facture), puis le bloc **Approvisionnement** avec la Date d'appro, le Fournisseur, la Réf Facture et les boutons **Enregistrer** (le nombre de lignes prêtes s'affiche entre parenthèses) et **Réinitialiser**.

Le stock est présenté par catégories repliables :

| Colonne | Contenu |
|---|---|
| Article | nom, unité, badge **PT** (et « ◆ Composé valorisé » pour les composés fabriqués au labo), bouton 📋 Historique — les 5 derniers mouvements avec leur type : Manuel, Transfert (↗ envoyé ou ↙ reçu du labo qui vous alimente), PT, Perte… |
| Stock Actuel | quantité restante et sa ventilation depuis le dernier inventaire : ↑ appro (achats et réceptions d'un labo source), ⇄ transferts, ↘ pertes, consommation PT |
| Coût Total | valeur du stock en DT (TTC, avec rappel du HT) |
| Quantité · Prix · TVA (%) | saisie d'un nouvel appro — le prix d'un PT est calculé automatiquement, il ne se saisit pas |
| Actions | 🔧 Seuil, 📉 Perte, ⚙️ Personnaliser (PT uniquement) |

Un panneau « Aperçu saisie » totalise en direct, en TTC, ce que vous êtes en train d'enregistrer.

### Actions pas à pas

Approvisionner des articles :

1. Renseignez la date, le fournisseur et le n° de facture dans le bloc Approvisionnement.
2. Saisissez quantité et prix HT (TVA facultative) sur chaque ligne concernée.
3. Cliquez sur **Enregistrer** : une fenêtre récapitule la facture, avec une case **Timbre Fiscal** (+1,000 DT, cochée par défaut) ; confirmez.

Produire un PT (labos de production uniquement — un labo configuré sans production, tel un économat, n'affiche pas de PT) :

1. Saisissez la **quantité produite** sur la ligne du PT — aucun prix à saisir, son coût est calculé d'après les prix des articles du labo.
2. Enregistrez : les ingrédients de la recette **et les sous-PT** qu'elle contient sont déduits automatiquement du stock du labo.
3. Au besoin, le bouton **⚙️ Personnaliser** permet d'ajuster les portions réellement utilisées pour cette production.

Déclarer une perte : bouton **📉 Perte**, puis quantité, type (selon votre domaine : Avarie ou Déchet par défaut) et date ; la fenêtre affiche le stock disponible, le prix unitaire retenu et le coût total de la perte.

Définir un seuil : bouton **🔧 Seuil**. Le stock s'affiche ensuite en 🔴 (au seuil ou en dessous), 🟠 (jusqu'à seuil + 10 %) ou 🟢 (au-dessus).

### Points d'attention

:::attention
On ne mélange pas appro d'articles et production de PT dans un même enregistrement : dès qu'une quantité est saisie sur un PT, les champs Fournisseur et Réf Facture se grisent (et inversement). Procédez en deux enregistrements séparés.
:::

:::attention
Une perte ne peut pas dépasser le stock disponible, ni porter une date antérieure au premier approvisionnement de l'article.
:::

:::astuce
Si la date choisie correspond déjà à un appro existant pour un article, ses champs de saisie s'entourent d'orange : consultez l'historique 📋 avant d'enregistrer, car les quantités s'additionnent.
:::

L'affectation des articles aux activités (cases à cocher) se gère depuis la fiche de l'article ([Articles](#referentiel-articles)) ; elle est réservée au propriétaire du compte.

### Voir aussi

- [Les produits transformés](#lexique-pt) · [Le calcul d'une production](#calc-production-pt)
- [Les seuils d'alerte](#calc-seuils) · [La valeur du stock](#calc-valeur-stock)
- [Transferts vers les activités et labos rattachés](#transferts) · [Factures d'appro](#factures) · [Pertes](#pertes)