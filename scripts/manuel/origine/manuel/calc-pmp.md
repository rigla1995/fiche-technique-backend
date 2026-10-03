## ⚖️ Le prix moyen pondéré (PMP)

Le PMP d'un article est son coût unitaire moyen réel, pondéré par les quantités reçues. Il est calculé sur les **entrées valorisées depuis le dernier inventaire** : les achats saisis à la main et, côté activité, les transferts reçus du labo (au prix de cession TTC du transfert, proposé par défaut au prix du labo). Tous les prix sont pris en TTC.

Le PMP n'est **jamais figé** : il n'est stocké nulle part, il est recalculé en direct à partir des lignes d'approvisionnement à chaque affichage. C'est lui qui valorise le stock, les coûts de recette et les déductions d'ingrédients à la production.

### Les paramètres qui influencent le résultat

- **Les achats depuis le dernier inventaire** : quantité et prix TTC de chaque ligne.
- **Les transferts reçus du labo** (côté activité uniquement), comptés au prix de cession TTC du transfert — proposé par défaut au prix du labo, ajustable à l'envoi.
- **La date du dernier inventaire**, qui borne la période de calcul.
- **Le repli labo** : si l'activité n'a encore reçu aucun approvisionnement d'un article, le coût de recette utilise le PMP du labo lié.

:::formule Prix moyen pondéré
PMP = somme(quantité × prix unitaire TTC) ÷ somme(quantités)
note: sur les achats et transferts reçus à quantité positive depuis le dernier inventaire ; au labo, sur les achats uniquement.
:::

:::exemple
Farine dans une activité, depuis le dernier inventaire :

- Achat du 02/07 : 10,000 kg × 2,300 DT/kg = 23,000 DT
- Achat du 10/07 : 15,000 kg × 2,500 DT/kg = 37,500 DT
- Transfert reçu du labo le 12/07 : 5,000 kg × 2,400 DT/kg = 12,000 DT

PMP = (23,000 + 37,500 + 12,000) ÷ (10,000 + 15,000 + 5,000) = 72,500 ÷ 30 = **2,417 DT TTC le kg** (arrondi).

L'achat de 15 kg pèse davantage dans la moyenne que le transfert de 5 kg : c'est le principe de la pondération.
:::

### Ce qui peut faire varier le résultat

- Chaque nouvel achat déplace la moyenne — un gros volume à prix différent la déplace beaucoup, un petit volume très peu.
- Un inventaire redémarre le calcul : seules les entrées postérieures à sa date comptent. Pour la valeur du stock, la quantité comptée reste toutefois valorisée à son coût moyen d'avant inventaire quand il existe.
- Ne comptent **pas** dans le PMP : les consommations de production, les ventes, les pertes et les lignes sans prix.
- Modifier ou supprimer une ligne d'achat passée recalcule le PMP immédiatement, y compris pour les écrans déjà consultés.
- Au labo, seuls les achats saisis au labo comptent : les transferts y sont des sorties, pas des entrées.

### Voir aussi

- [La valeur du stock](#calc-valeur-stock)
- [Le coût de revient d'une recette](#calc-cout-recette)
- [Transferts](#transferts)
- [Inventaire](#inventaire)
- [HT et TTC](#calc-ht-ttc)