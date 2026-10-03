## 🧾 HT et TTC dans LabFlow

Les prix d'achat se saisissent en **hors taxes (HT)**, accompagnés du **taux de TVA** en pourcentage. LabFlow calcule alors le prix TTC de la ligne et le conserve avec elle. Tout l'affichage courant — [[nom:stock:pl]], coûts [[de:recette]], productions, [[nom:transfert:pl]], [[nom:perte:pl]], rapports et tableaux de bord — est ensuite exprimé en **TTC** : c'est le coût réellement décaissé.

### Les paramètres qui influencent le résultat

- **Le prix unitaire HT** saisi [[au:appro]].
- **Le taux de TVA** choisi pour la ligne (en %).
- **La nature de la ligne** : [[le:pt:pl]] sont conventionnellement à TVA 0, donc pour [[acc:pt:eux:elles]] HT = TTC (leur coût est déjà composé de prix TTC [[de:ingredient:pl]]).

:::formule Passage du HT au TTC
Prix TTC = Prix HT × (1 + taux de TVA ÷ 100)
note: calculé et enregistré ligne par ligne, au moment de la saisie [[du:appro]].
:::

:::exemple
Vous recevez 10,000 kg de farine à 2,100 DT HT le kg, avec une TVA de 19 % :

- Prix unitaire TTC = 2,100 × (1 + 19 ÷ 100) = 2,100 × 1,19 = **2,499 DT le kg**
- Coût HT de la ligne = 10,000 × 2,100 = 21,000 DT
- Montant de TVA = 21,000 × 19 % = 3,990 DT
- Coût TTC de la ligne = 10,000 × 2,499 = **24,990 DT**

C'est ce prix de 2,499 DT TTC qui entrera dans le PMP de la farine, dans la valeur [[du:stock]] et dans les coûts [[de:recette]].
:::

### Où voit-on encore du HT ?

Le HT reste visible partout où il a une utilité comptable :

- **Les factures** : montant HT, montant de TVA, montant TTC (et timbre fiscal éventuel).
- **Les exports Excel détaillés de l'historique [[un:appro:pl]]** : colonnes prix unitaire HT, taux de TVA, prix unitaire TTC, coût HT et coût TTC.
- **Les historiques [[de:appro:pl]]** : chaque ligne affiche côte à côte le prix HT, le taux de TVA et le prix TTC.
- **La colonne valeur des pages [[de:stock]]** ([[nom:activite:pl]] et [[nom:labo]]) : la valeur TTC en évidence, la valeur HT rappelée en dessous.

### Ce qui peut faire varier le résultat

- Un taux de TVA à 0 % donne un TTC égal au HT.
- Pour les saisies anciennes où la TVA n'était pas renseignée, le TTC est considéré égal au HT.
- [[Le:pt:pl]] sont toujours à TVA 0 : leur prix affiché est le même en HT et en TTC.
- Deux achats au même prix HT mais à des taux différents donnent des TTC différents : le PMP TTC en tient compte.
- [[Le:transfert:pl]] vers [[un:activite]] sont [[acc:transfert:valorisé:valorisée:pl]] au prix de cession TTC saisi au moment [[du:transfert]], proposé par défaut au prix [[du:labo]].

### Voir aussi

- [Factures](#factures)
- [Historique [[un:appro:pl]]](#historique)
- [Rapports](#rapports)
- [Le prix moyen pondéré](#calc-pmp)
- [Lexique](#lexique)