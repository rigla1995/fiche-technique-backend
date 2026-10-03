## 🏭 Ce que déclenche la production d'[[un:pt]]

Quand vous enregistrez la production d'[[un:pt]] — [[au:labo]] pour [[le:produit:pl]] d'origine [[nom:labo]], dans [[le:activite]] pour les autres — LabFlow écrit plusieurs mouvements [[de:stock]] en une seule opération, **tout ou rien** : si l'un échoue, rien n'est enregistré.

**Ce qui est créé** : une entrée en [[nom:stock]] [[du:produit]] [[acc:produit:fini:finie]], à la quantité produite, valorisée à son **coût [[de:recette]] du moment** ([[nom:ingredient:pl]] au PMP TTC, sous-produits inclus récursivement). Cette ligne porte [[le:fournisseur]] **AUTO** et une **référence automatique** : les initiales du nom [[du:produit]] suivies de l'année — « Crème Pâtissière » produite en 2026 donne **CP-26** ; pour un nom d'un seul mot, les trois premières lettres — « Cookies » donne **COO-26**. La TVA d'[[un:pt]] est de 0 %.

**Ce qui est déduit** :

- chaque **[[nom:ingredient]]** [[du:recette]] : sortie [[de:stock]] [[de:portion]] × quantité produite, valorisée à son PMP (HT et TTC), avec sa propre référence automatique ;
- chaque **sous-produit** [[du:recette]] : sortie [[de:stock]] du sous-produit, valorisée à son coût [[de:recette]]. [[Le:ingredient:pl]] des sous-produits, [[acc:ingredient:eux:elles]], ont déjà été [[acc:ingredient:déduit:déduite:pl]] au moment où ces sous-produits ont été fabriqués — [[acc:ingredient:ils:elles]] ne sont pas [[acc:ingredient:déduit:déduite:pl]] une seconde fois.

### Les paramètres qui influencent le résultat

- **La quantité produite.**
- **[[Le:portion:pl]] [[du:recette]]**, ou [[le:portion:pl]] [[acc:portion:personnalisé:personnalisée:pl]] [[acc:portion:saisi:saisie:pl]] pour cette production.
- **Le PMP TTC de chaque [[nom:ingredient]]** au moment de la production.
- **Le coût [[de:recette]] de chaque sous-produit** consommé.

:::formule Mouvements écrits à la production
Entrée [[nom:produit]] [[acc:produit:fini:finie]] = quantité produite, au coût [[de:recette]] (PMP TTC) ; sortie de chaque composant = [[nom:portion]] × quantité produite ([[nom:article]] au PMP, sous-produit au coût [[de:recette]])
note: écriture tout-ou-rien — [[le:stock]] [[du:produit]] [[acc:produit:fini:finie]] gagne la valeur que perdent [[le:stock:pl]] des composants.
:::

:::exemple
Production [[au:labo]] de 20 « Crème Pâtissière » le 15/07/2026. [[Nom:recette]] pour 1 unité : 0,500 L de lait (PMP 2,000 DT), 4 œufs (PMP 0,700 DT), 0,200 kg de sucre (PMP 3,200 DT). Coût [[de:recette]] = 1,000 + 2,800 + 0,640 = **4,440 DT** l'unité.

Mouvements écrits :

- Entrée « Crème Pâtissière » ([[nom:fournisseur]] AUTO, réf. CP-26) : +20 unités à 4,440 DT/unité
- Sortie lait : −10,000 L à 2,000 DT/L
- Sortie œufs : −80 pièces à 0,700 DT/pièce
- Sortie sucre : −4,000 kg à 3,200 DT/kg

[[Le:stock]] [[du:produit]] [[acc:produit:fini:finie]] gagne 20 × 4,440 = **88,800 DT** de valeur ; [[le:stock:pl]] [[de:ingredient:pl]] perdent 20,000 + 56,000 + 12,800 = **88,800 DT**. L'opération est neutre : la valeur a simplement changé de forme.
:::

### Ce qui peut faire varier le résultat

- [[Au:labo]], la production est **refusée** si [[le:stock]] disponible d'[[un:ingredient]] ou d'un sous-produit est [[acc:stock:insuffisant:insuffisante]].
- [[Un:produit]] d'origine [[nom:labo]] ne peut pas être [[acc:produit:produit:produite]] ni [[acc:produit:approvisionné:approvisionnée]] directement dans [[un:activite]] : [[acc:produit:il:elle]] n'y arrive que par [[nom:transfert]].
- [[Le:portion:pl]] [[acc:portion:personnalisé:personnalisée:pl]] modifient les quantités réellement déduites, sans toucher [[au:fiche_technique]] ; l'entrée [[du:produit]] [[acc:produit:fini:finie]] reste valorisée au coût [[du:recette]] standard.
- Si [[un:ingredient]] n'a pas encore de prix connu, le coût de la production est incomplet.
- Les sorties liées à une production sont identifiables dans les historiques ([[nom:fournisseur]] AUTO, référence automatique) ; elles n'entrent ni dans le PMP ni dans [[le:vente:pl]].

### Voir aussi

- [Le coût de revient d'[[un:recette]]](#calc-cout-recette)
- [La valeur [[du:stock]]](#calc-valeur-stock)
- [La traçabilité des mouvements](#calc-tracabilite)
- [[[Nom:stock]] [[du:labo]]](#stock-labo)
- [Lexique [[un:pt:pl]]](#lexique-pt)