## 💰 La valeur du stock actuel

La valeur de votre stock est calculée ligne par ligne : quantité actuelle × coût unitaire moyen TTC. La quantité actuelle repart toujours du **dernier inventaire** : on prend la quantité comptée ce jour-là, puis on ajoute et retranche tous les mouvements survenus depuis. S'il n'y a jamais eu d'inventaire, tous les mouvements depuis l'origine sont pris en compte.

### Les paramètres qui influencent le résultat

- **Le dernier inventaire** : quantité comptée et date (point de départ du calcul).
- **Les mouvements depuis cette date** : achats, transferts, consommations de production, ventes, pertes.
- **Les prix TTC des entrées**, qui déterminent le coût moyen (voir [Le prix moyen pondéré](#calc-pmp)).
- **La nature de la ligne** (article ou produit transformé) et **le lieu** (activité ou labo) :

| Où | Quantité actuelle |
|---|---|
| Article en activité | inventaire + achats + transferts reçus − consommations de production − ventes − pertes |
| Article au labo | inventaire + achats − consommations de production − transferts envoyés − pertes |
| Produit transformé en activité | inventaire + réceptions (transferts ou productions) − ventes − consommations en sous-produit − pertes |
| Produit transformé au labo | inventaire + productions − consommations en sous-produit − transferts envoyés − pertes |

Pour la valorisation :

- **Article** : valeur = quantité actuelle × PMP TTC. Le dernier prix reçu (achat ou transfert) est affiché à titre d'information, mais la valeur totale est bien calculée au coût moyen pondéré.
- **Produit transformé** : chaque entrée porte son coût — coût de recette pour une production, prix de cession TTC pour une réception de transfert ; la valeur = quantité actuelle × moyenne des coûts des entrées depuis le dernier inventaire. À défaut d'entrée valorisée depuis l'inventaire, la moyenne de toutes les entrées sert de base ; en dernier recours, le dernier coût de réception connu ou le coût de recette actuel.

:::formule Valeur du stock d'un article
Valeur = quantité actuelle × PMP TTC
note: quantité actuelle = quantité d'inventaire + entrées − sorties depuis le dernier inventaire ; sans inventaire, tous les mouvements depuis l'origine.
:::

:::exemple
Farine dans une activité, dernier inventaire le 30/06 : **12,000 kg comptés**. Depuis :

- achats : +25,000 kg à 2,400 DT TTC le kg
- consommations de production : −6,000 kg
- ventes : −4,500 kg
- pertes : −1,500 kg

Quantité actuelle = 12,000 + 25,000 − 6,000 − 4,500 − 1,500 = **25,000 kg**.

Aucun achat n'avait été enregistré avant cet inventaire : seul l'achat de 25 kg à 2,400 DT entre dans le coût moyen, donc PMP = 2,400 DT TTC.

**Valeur du stock = 25,000 kg × 2,400 DT = 60,000 DT TTC.**
:::

### Ce qui peut faire varier le résultat

- Un nouvel inventaire remplace la base de calcul : la quantité repart de la valeur comptée.
- La quantité comptée à l'inventaire est valorisée à son coût moyen d'avant l'inventaire quand il existe ; sinon elle compte dans la quantité mais pas dans le coût moyen.
- Si la quantité actuelle est nulle ou négative, la valeur affichée est 0.
- Modifier ou supprimer un mouvement passé (achat, transfert, perte) recalcule immédiatement quantité et valeur.
- Les quantités sont arrondies au millième (trois décimales).

### Voir aussi

- [Stock des activités](#stock-activites)
- [Stock du labo](#stock-labo)
- [Inventaire](#inventaire)
- [Le prix moyen pondéré](#calc-pmp)
- [Pertes](#pertes)