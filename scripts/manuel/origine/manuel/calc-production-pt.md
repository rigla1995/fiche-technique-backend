## 🏭 Ce que déclenche la production d'un produit transformé

Quand vous enregistrez la production d'un produit transformé — au labo pour les produits d'origine labo, dans l'activité pour les autres — LabFlow écrit plusieurs mouvements de stock en une seule opération, **tout ou rien** : si l'un échoue, rien n'est enregistré.

**Ce qui est créé** : une entrée en stock du produit fini, à la quantité produite, valorisée à son **coût de recette du moment** (ingrédients au PMP TTC, sous-produits inclus récursivement). Cette ligne porte le fournisseur **AUTO** et une **référence automatique** : les initiales du nom du produit suivies de l'année — « Crème Pâtissière » produite en 2026 donne **CP-26** ; pour un nom d'un seul mot, les trois premières lettres — « Cookies » donne **COO-26**. La TVA d'un produit transformé est de 0 %.

**Ce qui est déduit** :

- chaque **ingrédient** de la recette : sortie de stock de portion × quantité produite, valorisée à son PMP (HT et TTC), avec sa propre référence automatique ;
- chaque **sous-produit** de la recette : sortie de stock du sous-produit, valorisée à son coût de recette. Les ingrédients des sous-produits, eux, ont déjà été déduits au moment où ces sous-produits ont été fabriqués — ils ne sont pas déduits une seconde fois.

### Les paramètres qui influencent le résultat

- **La quantité produite.**
- **Les portions de la recette**, ou les portions personnalisées saisies pour cette production.
- **Le PMP TTC de chaque ingrédient** au moment de la production.
- **Le coût de recette de chaque sous-produit** consommé.

:::formule Mouvements écrits à la production
Entrée produit fini = quantité produite, au coût de recette (PMP TTC) ; sortie de chaque composant = portion × quantité produite (article au PMP, sous-produit au coût de recette)
note: écriture tout-ou-rien — le stock du produit fini gagne la valeur que perdent les stocks des composants.
:::

:::exemple
Production au labo de 20 « Crème Pâtissière » le 15/07/2026. Recette pour 1 unité : 0,500 L de lait (PMP 2,000 DT), 4 œufs (PMP 0,700 DT), 0,200 kg de sucre (PMP 3,200 DT). Coût de recette = 1,000 + 2,800 + 0,640 = **4,440 DT** l'unité.

Mouvements écrits :

- Entrée « Crème Pâtissière » (fournisseur AUTO, réf. CP-26) : +20 unités à 4,440 DT/unité
- Sortie lait : −10,000 L à 2,000 DT/L
- Sortie œufs : −80 pièces à 0,700 DT/pièce
- Sortie sucre : −4,000 kg à 3,200 DT/kg

Le stock du produit fini gagne 20 × 4,440 = **88,800 DT** de valeur ; les stocks d'ingrédients perdent 20,000 + 56,000 + 12,800 = **88,800 DT**. L'opération est neutre : la valeur a simplement changé de forme.
:::

### Ce qui peut faire varier le résultat

- Au labo, la production est **refusée** si le stock disponible d'un ingrédient ou d'un sous-produit est insuffisant.
- Un produit d'origine labo ne peut pas être produit ni approvisionné directement dans une activité : il n'y arrive que par transfert.
- Les portions personnalisées modifient les quantités réellement déduites, sans toucher à la fiche technique ; l'entrée du produit fini reste valorisée au coût de la recette standard.
- Si un ingrédient n'a pas encore de prix connu, le coût de la production est incomplet.
- Les sorties liées à une production sont identifiables dans les historiques (fournisseur AUTO, référence automatique) ; elles n'entrent ni dans le PMP ni dans les ventes.

### Voir aussi

- [Le coût de revient d'une recette](#calc-cout-recette)
- [La valeur du stock](#calc-valeur-stock)
- [La traçabilité des mouvements](#calc-tracabilite)
- [Stock du labo](#stock-labo)
- [Lexique des produits transformés](#lexique-pt)