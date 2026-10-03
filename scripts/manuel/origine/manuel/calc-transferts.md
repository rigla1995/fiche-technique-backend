## 🚚 Valorisation des transferts

Quand votre labo envoie des articles ou des produits transformés vers une activité ou vers un labo qu'il alimente, chaque ligne est valorisée à un **prix de cession**. Cette fiche explique comment ce prix est déterminé et ce qu'il devient de part et d'autre du transfert.

### La règle

- Chaque ligne transférée porte un prix de cession **TTC**, affiché et modifiable au moment du transfert.
- Pour un **article**, le prix est pré-rempli avec le coût moyen pondéré (PMP) du labo, TVA incluse ; le système enregistre la paire HT/TTC à partir du taux de TVA de l'article.
- Pour un **produit transformé**, le prix est pré-rempli avec le coût actuel de sa recette au labo — le même calcul que la fiche technique, articles au PMP TTC — (pas de TVA : HT = TTC) ; à défaut de prix saisi, c'est le dernier coût de fabrication au labo qui est retenu.
- Une **référence** (numéro de bon de livraison ou de facture) est obligatoire : elle accompagne le mouvement des deux côtés.

### Les paramètres

| Paramètre | Origine |
|---|---|
| Quantité | saisie, limitée au stock disponible du labo |
| Prix de cession TTC | saisi (pré-rempli : PMP TTC du labo pour un article, coût de recette au labo pour un produit transformé) |
| Taux de TVA | celui de l'article (produit transformé : TVA à 0) |
| Référence | numéro de BL / facture saisi au transfert |

:::formule Prix de cession HT
PRIX HT = PRIX TTC ÷ (1 + TVA ÷ 100)
note: pour un produit transformé, la TVA est nulle : HT = TTC.
:::

### Des deux côtés du transfert

- **Côté labo** : sortie de stock valorisée au prix de cession, visible dans les historiques avec le badge *Transfert*.
- **Côté destination** (activité ou labo rattaché) : entrée de stock au nom du **fournisseur-labo** (fiche fournisseur créée automatiquement avec le labo), avec la référence saisie. Pour un article, cette entrée alimente le **PMP de la destination** exactement comme un achat fournisseur — un labo alimenté par un autre labo fabrique donc ses produits transformés au coût réel des matières reçues. Pour un produit transformé, le stock de l'activité est valorisé au prix de la **dernière réception**.

:::exemple
Le labo transfère 20 kg de farine à l'activité « Pâtisserie Centre ». PMP labo : 1,200 DT HT/kg, TVA 7 % → prix de cession pré-rempli : 1,284 DT TTC/kg.

- Côté labo : sortie de 20 kg valorisée 20 × 1,284 = 25,680 DT TTC.
- Côté activité : entrée de 20 kg, fournisseur = le labo, référence BL-0642.
- PMP de l'activité : elle détenait 30 kg à 1,400 DT TTC/kg → nouveau PMP = (30 × 1,400 + 20 × 1,284) ÷ 50 = 67,680 ÷ 50 ≈ 1,354 DT TTC/kg.

Le même jour, 15 crèmes pâtissières (coût de recette au labo : 3,500 DT) partent au prix proposé : l'activité les reçoit valorisées 3,500 DT pièce, soit 52,500 DT.
:::

### Variations

- Vous pouvez remplacer le prix pré-rempli (marge interne, prix négocié) : c'est le prix saisi qui fait foi côté activité.
- Un produit transformé ne peut être transféré que vers une activité ou un labo rattaché auquel il est **affecté** ; sinon le transfert est refusé.
- Si le stock du labo est insuffisant, le transfert est bloqué et la quantité disponible vous est indiquée.
- Pour les articles transférés, la référence saisie alimente aussi les **factures** de l'activité (sans timbre fiscal).

:::attention
Le prix de cession devient le coût d'entrée définitif côté destination (activité ou labo) : un prix erroné fausse le PMP, donc la valeur de stock et le coût de vos recettes.
:::

### Voir aussi

- [Transferts](#transferts)
- [Le PMP](#calc-pmp)
- [Qui fixe quel prix](#calc-prix)
- [HT et TTC](#calc-ht-ttc)