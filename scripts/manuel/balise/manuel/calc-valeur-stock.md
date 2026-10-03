## 💰 La valeur [[du:stock]] [[acc:stock:actuel:actuelle]]

La valeur de [[votre:stock]] est calculée ligne par ligne : quantité actuelle × coût unitaire moyen TTC. La quantité actuelle repart toujours [[acc:inventaire:du:de la]] **[[acc:inventaire:dernier:dernière]] [[nom:inventaire]]** : on prend la quantité comptée ce jour-là, puis on ajoute et retranche tous les mouvements survenus depuis. S'il n'y a jamais eu [[de:inventaire]], tous les mouvements depuis l'origine sont pris en compte.

### Les paramètres qui influencent le résultat

- **[[acc:inventaire:Le dernier:La dernière]] [[nom:inventaire]]** : quantité comptée et date (point de départ du calcul).
- **Les mouvements depuis cette date** : achats, [[nom:transfert:pl]], consommations de production, [[nom:vente:pl]], [[nom:perte:pl]].
- **Les prix TTC des entrées**, qui déterminent le coût moyen (voir [Le prix moyen pondéré](#calc-pmp)).
- **La nature de la ligne** ([[nom:article]] ou [[nom:pt]]) et **le lieu** ([[nom:activite]] ou [[nom:labo]]) :

| Où | Quantité actuelle |
|---|---|
| [[Nom:article]] en [[nom:activite]] | [[nom:inventaire]] + achats + [[nom:transfert:pl]] [[acc:transfert:reçu:reçue:pl]] − consommations de production − [[nom:vente:pl]] − [[nom:perte:pl]] |
| [[Nom:article]] [[au:labo]] | [[nom:inventaire]] + achats − consommations de production − [[nom:transfert:pl]] [[acc:transfert:envoyé:envoyée:pl]] − [[nom:perte:pl]] |
| [[Nom:pt]] en [[nom:activite]] | [[nom:inventaire]] + réceptions ([[nom:transfert:pl]] ou productions) − [[nom:vente:pl]] − consommations en sous-produit − [[nom:perte:pl]] |
| [[Nom:pt]] [[au:labo]] | [[nom:inventaire]] + productions − consommations en sous-produit − [[nom:transfert:pl]] [[acc:transfert:envoyé:envoyée:pl]] − [[nom:perte:pl]] |

Pour la valorisation :

- **[[Nom:article]]** : valeur = quantité actuelle × PMP TTC. Le dernier prix reçu (achat ou [[nom:transfert]]) est affiché à titre d'information, mais la valeur totale est bien calculée au coût moyen pondéré.
- **[[Nom:pt]]** : chaque entrée porte son coût — coût [[de:recette]] pour une production, prix de cession TTC pour une réception [[de:transfert]] ; la valeur = quantité actuelle × moyenne des coûts des entrées depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]]. À défaut d'entrée valorisée depuis [[le:inventaire]], la moyenne de toutes les entrées sert de base ; en dernier recours, le dernier coût de réception connu ou le coût [[de:recette]] actuel.

:::formule Valeur [[du:stock]] d'[[un:article]]
Valeur = quantité actuelle × PMP TTC
note: quantité actuelle = quantité [[de:inventaire]] + entrées − sorties depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] ; sans [[nom:inventaire]], tous les mouvements depuis l'origine.
:::

:::exemple
Farine dans [[un:activite]], [[acc:inventaire:dernier:dernière]] [[nom:inventaire]] le 30/06 : **12,000 kg comptés**. Depuis :

- achats : +25,000 kg à 2,400 DT TTC le kg
- consommations de production : −6,000 kg
- [[nom:vente:pl]] : −4,500 kg
- [[nom:perte:pl]] : −1,500 kg

Quantité actuelle = 12,000 + 25,000 − 6,000 − 4,500 − 1,500 = **25,000 kg**.

Aucun achat n'avait été enregistré avant [[ce:inventaire]] : seul l'achat de 25 kg à 2,400 DT entre dans le coût moyen, donc PMP = 2,400 DT TTC.

**Valeur [[du:stock]] = 25,000 kg × 2,400 DT = 60,000 DT TTC.**
:::

### Ce qui peut faire varier le résultat

- [[acc:inventaire:Un:Une]] [[nouveau:inventaire]] remplace la base de calcul : la quantité repart de la valeur comptée.
- La quantité comptée [[au:inventaire]] est valorisée à son coût moyen d'avant [[le:inventaire]] quand il existe ; sinon elle compte dans la quantité mais pas dans le coût moyen.
- Si la quantité actuelle est nulle ou négative, la valeur affichée est 0.
- Modifier ou supprimer un mouvement passé (achat, [[nom:transfert]], [[nom:perte]]) recalcule immédiatement quantité et valeur.
- Les quantités sont arrondies au millième (trois décimales).

### Voir aussi

- [[[Nom:stock]] [[un:activite:pl]]](#stock-activites)
- [[[Nom:stock]] [[du:labo]]](#stock-labo)
- [[[Nom:inventaire]]](#inventaire)
- [Le prix moyen pondéré](#calc-pmp)
- [[[Nom:perte:pl]]](#pertes)