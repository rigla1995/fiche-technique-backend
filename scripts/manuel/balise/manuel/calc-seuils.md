## 🚨 Les seuils d'alerte [[de:stock]]

Les seuils minimums colorent vos lignes [[de:stock]] et font remonter [[le:produit:pl]] à surveiller. Le calcul est volontairement simple : une comparaison directe entre [[le:stock]] [[acc:stock:courant:courante]] et le seuil que vous avez fixé.

### La règle

- Un seuil minimum se définit **par [[nom:article]] ou par [[nom:pt]]**, et il est **indépendant** pour chaque [[nom:activite]] et pour chaque [[nom:labo]] : le même beurre peut avoir un seuil de 10 kg dans [[un:activite]] et de 25 kg [[au:labo]].
- Pour [[det:pt:un]]**[[nom:pt]]** dans [[un:activite]], le seuil se règle par [[nom:activite]] ; si aucun seuil n'est défini pour [[le:activite]], le **seuil global [[du:produit]]** s'applique en repli.
- Aucun seuil n'est obligatoire : sans seuil, seule la **rupture** ([[nom:stock]] [[acc:stock:épuisé:épuisée]]) est signalée.

### Les paramètres

| Portée | Comparaison effectuée |
|---|---|
| [[Nom:article]] dans [[un:activite]] | [[nom:stock]] [[acc:stock:courant:courante]] [[du:activite]] et seuil réglé sur la page [[Nom:stock]] [[du:activite]] |
| [[Nom:article]] [[au:labo]] | [[nom:stock]] [[acc:stock:courant:courante]] [[du:labo]] et seuil réglé [[au:labo]] |
| [[Nom:pt]] dans [[un:activite]] | [[nom:stock]] [[acc:stock:courant:courante]] et seuil [[du:produit]] pour [[ce:activite]] (repli : seuil global [[du:produit]]) |
| [[Nom:pt]] [[au:labo]] | [[nom:stock]] [[acc:stock:courant:courante]] [[du:labo]] et seuil réglé [[au:labo]] |

:::formule État de l'alerte
ROUGE si [[MAJ:stock]] ≤ SEUIL · ORANGE si [[MAJ:stock]] ≤ SEUIL × 1,10 · VERT au-delà
note: sans seuil défini, [[acc:stock:seul:seule]] [[un:stock]] [[acc:stock:épuisé:épuisée]] passe en rouge.
:::

La légende est rappelée dans la fenêtre de réglage du seuil : 🔴 ≤ seuil · 🟠 seuil + 10 % · 🟢 au-dessus.

:::exemple
Beurre, seuil fixé à 10 kg dans [[le:activite]] :

- [[nom:stock]] 12 kg → 12 dépasse 11 (soit 10 + 10 %) : ligne verte ;
- [[nom:stock]] 10,8 kg → entre 10 et 11 : orange, zone de vigilance ;
- [[nom:stock]] 9 kg → 9 ≤ 10 : rouge, alerte ;
- [[nom:stock]] 0 kg → rouge, même si aucun seuil n'avait été défini.

[[Au:labo]], le même beurre avec un seuil de 25 kg et [[un:stock]] de 30 kg reste vert : les deux alertes vivent séparément.
:::

### Pourquoi [[un:inventaire]] peut changer l'état d'une alerte

[[Le:stock]] [[acc:stock:courant:courante]] repart toujours [[acc:inventaire:du:de la]] **[[acc:inventaire:dernier:dernière]] [[nom:inventaire]] [[acc:inventaire:validé:validée]]** : quantité réellement comptée, plus les entrées et moins les sorties enregistrées depuis. Valider [[un:inventaire]] remplace donc [[le:stock]] théorique par [[le:stock]] [[acc:stock:compté:comptée]]. Si le comptage révèle plus de marchandise que prévu, une ligne rouge peut repasser au vert immédiatement — et inversement si le comptage révèle un manque.

### Variations

- [[Le:article:pl]] sous leur seuil remontent dans les **alertes du tableau de bord**.
- Le seuil est un déclencheur **visuel** : il ne bloque ni [[le:vente:pl]], ni la production, ni [[le:transfert:pl]].

:::astuce
Fixez le seuil au niveau de votre consommation pendant le délai de réapprovisionnement : la zone orange (marge de 10 %) vous laisse le temps de commander avant la rupture.
:::

### Voir aussi

- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites)
- [[[Nom:stock]] [[du:labo]]](#stock-labo)
- [[[Nom:inventaire]]](#inventaire)
- [Valeur [[de:stock]]](#calc-valeur-stock)
- [Tableau de bord](#dashboard)