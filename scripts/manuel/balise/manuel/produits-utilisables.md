## 🧪 [[Titre:produit_utilisable:pl]] ([[nom:pt:pl]])

[[Det:produit_utilisable:un]]**[[nom:produit_utilisable]]** ([[court:produit_utilisable]]) est une préparation intermédiaire — sauce, pâte, fond, crème — qui n'est pas vendue telle quelle mais **réutilisée dans d'autres [[nom:recette:pl]]**. Vous [[acc:produit_utilisable:le:la]] trouvez dans le menu **Espace [[Pl:produit]] → [[Titre:produit_utilisable:pl]]**. Chaque [[court:produit_utilisable]] possède [[acc:recette:son propre:sa propre]] [[nom:recette]] et peut être [[acc:produit_utilisable:produit:produite]], [[acc:produit_utilisable:stocké:stockée]] et [[acc:produit_utilisable:transféré:transférée]].

### Ce que vous voyez

- Une barre de filtres : **📍 [[Nom:activite]]**, **🔍 Nom**, bouton **Réinitialiser**, **Exporter XLS** et **+ [[Nom:produit_utilisable]]**.
- Des **cartes [[nom:produit]]** (9 par page) avec : le nom, le bouton **👁 Voir composition** (résumé « N [[nom:article:pl]] · N sous-produits »), les actions (**Fiche tech.**, **Modifier**, **Supprimer**) et **deux blocs de pastilles** : [[det:activite:le:pl]]**[[Pl:activite]]** et [[det:labo:le:pl]]**[[Pl:labo]]** où [[le:produit]] est [[acc:produit:géré:gérée]].
- Un badge **⇄ [[Nom:transfert]] uniquement** sur [[le:produit:pl]] [[acc:produit:fabriqué:fabriquée:pl]] [[au:labo]] : [[acc:produit:il:elle:pl]] ne peuvent être [[acc:produit:approvisionné:approvisionnée:pl]] en [[nom:activite]] que par [[nom:transfert]].

### Les deux modes [[de:appro]]

À la première étape de l'assistant, vous choisissez le circuit [[du:produit]] :

| Mode | Fonctionnement |
|---|---|
| 🆓 [[Court:appro:pl]] libres | [[Le:produit]] est [[acc:produit:géré:gérée]] directement dans [[le:activite:pl]] : [[nom:appro:pl]] [[acc:appro:manuel:manuelle:pl]] possibles. À l'ouverture, **[[tous:activite:les]] et [[tous:labo:les]] sont pré-cochés** — décochez pour exclure. |
| 🔒 [[Court:appro:pl]] [[acc:appro:limité:limitée:pl]] [[au:transfert:pl]] | [[Le:produit]] est **[[acc:produit:fabriqué:fabriquée]] [[acc:labo:au(x):à la/aux]] [[nomS:labo]] [[acc:labo:choisi(s):choisie(s)]]**. [[Le:activite:pl]] [[acc:activite:rattaché:rattachée:pl]] à [[ce:labo:pl]] sont [[acc:activite:pré-coché:pré-cochée:pl]] et [[acc:produit:le:la]] recevront **uniquement par [[nom:transfert]]** ; [[aucun:appro:court]] [[acc:appro:manuel:manuelle]] en [[nom:activite]]. |

En mode limité, si [[aucun:activite]] n'est [[acc:activite:coché:cochée]], [[le:produit]] reste [[au:labo]] (non [[acc:produit:distribué:distribuée]]). [[Le:article:pl]] [[acc:article:proposé:proposée:pl]] pour [[le:recette]] correspondent toujours au périmètre choisi.

### Actions pas à pas

**Créer [[un:produit_utilisable]]**

1. Cliquez sur **+ [[Nom:produit_utilisable]]** : le même assistant en 5 étapes que pour les vendables s'ouvre (Affectation, Identité, [[Pl:article]], [[Titre:produit_utilisable:pl]], Récap).
2. À l'étape Affectation, choisissez le mode [[de:appro]] (voir tableau ci-dessus).
3. À l'étape Identité, saisissez le nom et la référence éventuelle — **aucune catégorie n'est demandée** pour [[un:produit_utilisable:court]].
4. Composez [[le:recette]] : [[nom:article:pl]] avec [[nom:portion:pl]], et éventuellement d'autres [[nom:produit_utilisable:pl]] comme sous-composants (au moins 2 composants au total).
5. Vérifiez le récapitulatif puis validez.

**Ajuster les affectations** : cliquez sur les pastilles **[[Pl:activite]]** ou **[[Pl:labo]]** sous la carte pour activer ou retirer [[le:produit]] en un clic.

### À quoi servent-[[acc:produit_utilisable:ils:elles]] dans [[le:recette:pl]]

[[Un:produit_utilisable:court]] s'ajoute comme **sous-composant** d'[[un:produit_vendable]], d'un composé valorisé ou d'[[acc:produit_utilisable:un autre:une autre]] [[court:produit_utilisable]]. Son coût se répercute automatiquement partout où [[acc:produit_utilisable:il:elle]] est [[acc:produit_utilisable:utilisé:utilisée]].

:::formule Coût unitaire d'[[un:produit_utilisable]]
Coût = Σ ( [[nom:portion]] [[nom:article]] × prix unitaire ) + Σ ( [[nom:portion]] sous-produit × coût du sous-produit )
note: Calcul récursif — le coût de chaque sous-produit provient lui-même de [[son:recette]].
:::

### Points d'attention

:::attention
La suppression d'[[un:produit_utilisable:court]] ayant un historique déclenche une **suppression en cascade** : la fenêtre de confirmation détaille le nombre [[de:appro:pl]] [[acc:appro:supprimé:supprimée:pl]], ainsi que [[le:stock]], [[le:inventaire:pl]] et [[le:perte:pl]] concernés. L'action est irréversible.
:::

:::regle
[[Un:produit_utilisable:court]] d'origine [[nom:labo]] ne peut **jamais** être [[acc:produit_utilisable:approvisionné:approvisionnée]] manuellement dans [[un:activite]] : [[le:stock]] [[du:activite:pl]] n'évolue que par [[[nom:transfert]]](#transferts).
:::

:::astuce
Mutualisez vos préparations : une sauce définie une seule fois alimente [[tous:recette:les]] qui l'utilisent, et toute mise à jour se propage automatiquement.
:::

### Voir aussi

- [Lexique [[du:pt:pl]]](#lexique-pt)
- [[[Titre:produit_vendable:pl]]](#produits-vendables) — pour intégrer [[votre:produit_utilisable:pl:court]] [[au:recette:pl]]
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) et [[[Nom:stock]] [[court:labo]]](#stock-labo)
- [Production d'[[un:pt]]](#calc-production-pt)
- [[[Nom:transfert:pl]] [[compl:labo]] → [[nom:activite:pl]]](#calc-transferts)