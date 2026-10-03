## ⚖️ Le prix moyen pondéré (PMP)

Le PMP d'[[un:article]] est son coût unitaire moyen réel, pondéré par les quantités reçues. Il est calculé sur les **entrées valorisées depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]]** : les achats saisis à la main et, côté [[nom:activite]], [[le:transfert:pl]] [[acc:transfert:reçu:reçue:pl]] [[du:labo]] (au prix de cession TTC [[du:transfert]], proposé par défaut au prix [[du:labo]]). Tous les prix sont pris en TTC.

Le PMP n'est **jamais figé** : il n'est stocké nulle part, il est recalculé en direct à partir des lignes [[de:appro]] à chaque affichage. C'est lui qui valorise [[le:stock]], les coûts [[de:recette]] et les déductions [[de:ingredient:pl]] à la production.

### Les paramètres qui influencent le résultat

- **Les achats depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]]** : quantité et prix TTC de chaque ligne.
- **[[Le:transfert:pl]] [[acc:transfert:reçu:reçue:pl]] [[du:labo]]** (côté [[nom:activite]] uniquement), [[acc:transfert:compté:comptée:pl]] au prix de cession TTC [[du:transfert]] — proposé par défaut au prix [[du:labo]], ajustable à l'envoi.
- **La date [[acc:inventaire:du dernier:de la dernière]] [[nom:inventaire]]**, qui borne la période de calcul.
- **Le repli [[compl:labo]]** : si [[le:activite]] n'a encore reçu [[aucun:appro]] d'[[un:article]], le coût [[de:recette]] utilise le PMP [[du:labo]] [[acc:labo:lié:liée]].

:::formule Prix moyen pondéré
PMP = somme(quantité × prix unitaire TTC) ÷ somme(quantités)
note: sur les achats et [[nom:transfert:pl]] reçus à quantité positive depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] ; [[au:labo]], sur les achats uniquement.
:::

:::exemple
Farine dans [[un:activite]], depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] :

- Achat du 02/07 : 10,000 kg × 2,300 DT/kg = 23,000 DT
- Achat du 10/07 : 15,000 kg × 2,500 DT/kg = 37,500 DT
- [[Nom:transfert]] [[acc:transfert:reçu:reçue]] [[du:labo]] le 12/07 : 5,000 kg × 2,400 DT/kg = 12,000 DT

PMP = (23,000 + 37,500 + 12,000) ÷ (10,000 + 15,000 + 5,000) = 72,500 ÷ 30 = **2,417 DT TTC le kg** (arrondi).

L'achat de 15 kg pèse davantage dans la moyenne que [[le:transfert]] de 5 kg : c'est le principe de la pondération.
:::

### Ce qui peut faire varier le résultat

- Chaque nouvel achat déplace la moyenne — un gros volume à prix différent la déplace beaucoup, un petit volume très peu.
- [[Un:inventaire]] redémarre le calcul : seules les entrées postérieures à sa date comptent. Pour la valeur [[du:stock]], la quantité comptée reste toutefois valorisée à son coût moyen d'avant [[nom:inventaire]] quand il existe.
- Ne comptent **pas** dans le PMP : les consommations de production, [[le:vente:pl]], [[le:perte:pl]] et les lignes sans prix.
- Modifier ou supprimer une ligne d'achat passée recalcule le PMP immédiatement, y compris pour les écrans déjà consultés.
- [[Au:labo]], seuls les achats saisis [[au:labo]] comptent : [[le:transfert:pl]] y sont des sorties, pas des entrées.

### Voir aussi

- [La valeur [[du:stock]]](#calc-valeur-stock)
- [Le coût de revient d'[[un:recette]]](#calc-cout-recette)
- [[[Nom:transfert:pl]]](#transferts)
- [[[Nom:inventaire]]](#inventaire)
- [HT et TTC](#calc-ht-ttc)