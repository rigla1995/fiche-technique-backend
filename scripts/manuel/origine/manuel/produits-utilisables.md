## 🧪 Produits Utilisables (produits transformés)

Un **produit utilisable** (PU) est une préparation intermédiaire — sauce, pâte, fond, crème — qui n'est pas vendue telle quelle mais **réutilisée dans d'autres recettes**. Vous le trouvez dans le menu **Espace Produits → Produits Utilisables**. Chaque PU possède sa propre recette et peut être produit, stocké et transféré.

### Ce que vous voyez

- Une barre de filtres : **📍 Activité**, **🔍 Nom**, bouton **Réinitialiser**, **Exporter XLS** et **+ Produit utilisable**.
- Des **cartes produit** (9 par page) avec : le nom, le bouton **👁 Voir composition** (résumé « N articles · N sous-produits »), les actions (**Fiche tech.**, **Modifier**, **Supprimer**) et **deux blocs de pastilles** : les **Activités** et les **Labos** où le produit est géré.
- Un badge **⇄ Transfert uniquement** sur les produits fabriqués au labo : ils ne peuvent être approvisionnés en activité que par transfert.

### Les deux modes d'approvisionnement

À la première étape de l'assistant, vous choisissez le circuit du produit :

| Mode | Fonctionnement |
|---|---|
| 🆓 Appros libres | Le produit est géré directement dans les activités : approvisionnements manuels possibles. À l'ouverture, **toutes les activités et tous les labos sont pré-cochés** — décochez pour exclure. |
| 🔒 Appros limités aux transferts | Le produit est **fabriqué au(x) labo(s) choisi(s)**. Les activités rattachées à ces labos sont pré-cochées et le recevront **uniquement par transfert** ; aucun appro manuel en activité. |

En mode limité, si aucune activité n'est cochée, le produit reste au labo (non distribué). Les articles proposés pour la recette correspondent toujours au périmètre choisi.

### Actions pas à pas

**Créer un produit utilisable**

1. Cliquez sur **+ Produit utilisable** : le même assistant en 5 étapes que pour les vendables s'ouvre (Affectation, Identité, Articles, Produits Utilisables, Récap).
2. À l'étape Affectation, choisissez le mode d'approvisionnement (voir tableau ci-dessus).
3. À l'étape Identité, saisissez le nom et la référence éventuelle — **aucune catégorie n'est demandée** pour un PU.
4. Composez la recette : articles avec portions, et éventuellement d'autres produits utilisables comme sous-composants (au moins 2 composants au total).
5. Vérifiez le récapitulatif puis validez.

**Ajuster les affectations** : cliquez sur les pastilles **Activités** ou **Labos** sous la carte pour activer ou retirer le produit en un clic.

### À quoi servent-ils dans les recettes

Un PU s'ajoute comme **sous-composant** d'un produit vendable, d'un composé valorisé ou d'un autre PU. Son coût se répercute automatiquement partout où il est utilisé.

:::formule Coût unitaire d'un produit utilisable
Coût = Σ ( portion article × prix unitaire ) + Σ ( portion sous-produit × coût du sous-produit )
note: Calcul récursif — le coût de chaque sous-produit provient lui-même de sa recette.
:::

### Points d'attention

:::attention
La suppression d'un PU ayant un historique déclenche une **suppression en cascade** : la fenêtre de confirmation détaille le nombre d'approvisionnements supprimés, ainsi que le stock, les inventaires et les pertes concernés. L'action est irréversible.
:::

:::regle
Un PU d'origine labo ne peut **jamais** être approvisionné manuellement dans une activité : le stock des activités n'évolue que par [transfert](#transferts).
:::

:::astuce
Mutualisez vos préparations : une sauce définie une seule fois alimente toutes les recettes qui l'utilisent, et toute mise à jour se propage automatiquement.
:::

### Voir aussi

- [Lexique des produits transformés](#lexique-pt)
- [Produits Vendables](#produits-vendables) — pour intégrer vos PU aux recettes
- [Stock des activités](#stock-activites) et [Stock labo](#stock-labo)
- [Production d'un produit transformé](#calc-production-pt)
- [Transferts labo → activités](#calc-transferts)