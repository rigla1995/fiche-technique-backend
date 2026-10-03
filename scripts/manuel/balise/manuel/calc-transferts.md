## 🚚 Valorisation [[du:transfert:pl]]

Quand [[votre:labo]] envoie [[un:article:pl]] ou [[un:pt:pl]] vers [[un:activite]] ou vers [[un:labo]] qu'[[acc:labo:il:elle]] alimente, chaque ligne est valorisée à un **prix de cession**. Cette fiche explique comment ce prix est déterminé et ce qu'il devient de part et d'autre [[du:transfert]].

### La règle

- Chaque ligne transférée porte un prix de cession **TTC**, affiché et modifiable au moment [[du:transfert]].
- Pour [[det:article:un]]**[[nom:article]]**, le prix est pré-rempli avec le coût moyen pondéré (PMP) [[du:labo]], TVA incluse ; le système enregistre la paire HT/TTC à partir du taux de TVA [[du:article]].
- Pour [[det:pt:un]]**[[nom:pt]]**, le prix est pré-rempli avec le coût actuel de [[son:recette]] [[au:labo]] — le même calcul que [[le:fiche_technique]], [[nom:article:pl]] au PMP TTC — (pas de TVA : HT = TTC) ; à défaut de prix saisi, c'est le dernier coût de fabrication [[au:labo]] qui est retenu.
- Une **référence** (numéro de bon de livraison ou de facture) est obligatoire : elle accompagne le mouvement des deux côtés.

### Les paramètres

| Paramètre | Origine |
|---|---|
| Quantité | saisie, limitée [[au:stock]] disponible [[du:labo]] |
| Prix de cession TTC | saisi (pré-rempli : PMP TTC [[du:labo]] pour [[un:article]], coût [[de:recette]] [[au:labo]] pour [[un:pt]]) |
| Taux de TVA | celui [[du:article]] ([[nom:pt]] : TVA à 0) |
| Référence | numéro de BL / facture saisi [[au:transfert]] |

:::formule Prix de cession HT
PRIX HT = PRIX TTC ÷ (1 + TVA ÷ 100)
note: pour [[un:pt]], la TVA est nulle : HT = TTC.
:::

### Des deux côtés [[du:transfert]]

- **Côté [[nom:labo]]** : sortie [[de:stock]] valorisée au prix de cession, visible dans les historiques avec le badge *[[Court:transfert]]*.
- **Côté destination** ([[nom:activite]] ou [[nom:labo]] [[acc:labo:rattaché:rattachée]]) : entrée [[de:stock]] au nom du **fournisseur-labo** (fiche [[nom:fournisseur]] créée automatiquement avec [[le:labo]]), avec la référence saisie. Pour [[un:article]], cette entrée alimente le **PMP de la destination** exactement comme un achat [[nom:fournisseur]] — [[un:labo]] [[acc:labo:alimenté:alimentée]] par [[acc:labo:un autre:une autre]] [[nom:labo]] fabrique donc [[son:pt:pl]] au coût réel des matières reçues. Pour [[un:pt]], [[le:stock]] [[du:activite]] est [[acc:stock:valorisé:valorisée]] au prix de la **dernière réception**.

:::exemple
[[Le:labo]] transfère 20 kg de farine [[au:activite]] « Pâtisserie Centre ». PMP [[compl:labo]] : 1,200 DT HT/kg, TVA 7 % → prix de cession pré-rempli : 1,284 DT TTC/kg.

- Côté [[nom:labo]] : sortie de 20 kg valorisée 20 × 1,284 = 25,680 DT TTC.
- Côté [[nom:activite]] : entrée de 20 kg, [[nom:fournisseur]] = [[le:labo]], référence BL-0642.
- PMP [[du:activite]] : [[acc:activite:il:elle]] détenait 30 kg à 1,400 DT TTC/kg → nouveau PMP = (30 × 1,400 + 20 × 1,284) ÷ 50 = 67,680 ÷ 50 ≈ 1,354 DT TTC/kg.

Le même jour, 15 crèmes pâtissières (coût [[de:recette]] [[au:labo]] : 3,500 DT) partent au prix proposé : [[le:activite]] les reçoit valorisées 3,500 DT pièce, soit 52,500 DT.
:::

### Variations

- Vous pouvez remplacer le prix pré-rempli ([[nom:marge]] interne, prix négocié) : c'est le prix saisi qui fait foi côté [[nom:activite]].
- [[Un:pt]] ne peut être [[acc:pt:transféré:transférée]] que vers [[un:activite]] ou [[un:labo]] [[acc:labo:rattaché:rattachée]] [[acc:labo:auquel:à laquelle]] [[acc:pt:il:elle]] est **[[acc:pt:affecté:affectée]]** ; sinon [[le:transfert]] est [[acc:transfert:refusé:refusée]].
- Si [[le:stock]] [[du:labo]] est [[acc:stock:insuffisant:insuffisante]], [[le:transfert]] est [[acc:transfert:bloqué:bloquée]] et la quantité disponible vous est indiquée.
- Pour [[le:article:pl]] [[acc:article:transféré:transférée:pl]], la référence saisie alimente aussi les **factures** [[du:activite]] (sans timbre fiscal).

:::attention
Le prix de cession devient le coût d'entrée définitif côté destination ([[nom:activite]] ou [[nom:labo]]) : un prix erroné fausse le PMP, donc la valeur [[de:stock]] et le coût de [[votre:recette:pl]].
:::

### Voir aussi

- [[[Nom:transfert:pl]]](#transferts)
- [Le PMP](#calc-pmp)
- [Qui fixe quel prix](#calc-prix)
- [HT et TTC](#calc-ht-ttc)