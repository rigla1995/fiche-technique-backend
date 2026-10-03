## 🚨 Les seuils d'alerte de stock

Les seuils minimums colorent vos lignes de stock et font remonter les produits à surveiller. Le calcul est volontairement simple : une comparaison directe entre le stock courant et le seuil que vous avez fixé.

### La règle

- Un seuil minimum se définit **par article ou par produit transformé**, et il est **indépendant** pour chaque activité et pour chaque labo : le même beurre peut avoir un seuil de 10 kg dans une activité et de 25 kg au labo.
- Pour un **produit transformé** dans une activité, le seuil se règle par activité ; si aucun seuil n'est défini pour l'activité, le **seuil global du produit** s'applique en repli.
- Aucun seuil n'est obligatoire : sans seuil, seule la **rupture** (stock épuisé) est signalée.

### Les paramètres

| Portée | Comparaison effectuée |
|---|---|
| Article dans une activité | stock courant de l'activité et seuil réglé sur la page Stock de l'activité |
| Article au labo | stock courant du labo et seuil réglé au labo |
| Produit transformé dans une activité | stock courant et seuil du produit pour cette activité (repli : seuil global du produit) |
| Produit transformé au labo | stock courant du labo et seuil réglé au labo |

:::formule État de l'alerte
ROUGE si STOCK ≤ SEUIL · ORANGE si STOCK ≤ SEUIL × 1,10 · VERT au-delà
note: sans seuil défini, seul un stock épuisé passe en rouge.
:::

La légende est rappelée dans la fenêtre de réglage du seuil : 🔴 ≤ seuil · 🟠 seuil + 10 % · 🟢 au-dessus.

:::exemple
Beurre, seuil fixé à 10 kg dans l'activité :

- stock 12 kg → 12 dépasse 11 (soit 10 + 10 %) : ligne verte ;
- stock 10,8 kg → entre 10 et 11 : orange, zone de vigilance ;
- stock 9 kg → 9 ≤ 10 : rouge, alerte ;
- stock 0 kg → rouge, même si aucun seuil n'avait été défini.

Au labo, le même beurre avec un seuil de 25 kg et un stock de 30 kg reste vert : les deux alertes vivent séparément.
:::

### Pourquoi un inventaire peut changer l'état d'une alerte

Le stock courant repart toujours du **dernier inventaire validé** : quantité réellement comptée, plus les entrées et moins les sorties enregistrées depuis. Valider un inventaire remplace donc le stock théorique par le stock compté. Si le comptage révèle plus de marchandise que prévu, une ligne rouge peut repasser au vert immédiatement — et inversement si le comptage révèle un manque.

### Variations

- Les articles sous leur seuil remontent dans les **alertes du tableau de bord**.
- Le seuil est un déclencheur **visuel** : il ne bloque ni les ventes, ni la production, ni les transferts.

:::astuce
Fixez le seuil au niveau de votre consommation pendant le délai de réapprovisionnement : la zone orange (marge de 10 %) vous laisse le temps de commander avant la rupture.
:::

### Voir aussi

- [Stock des activités](#stock-activites)
- [Stock du labo](#stock-labo)
- [Inventaire](#inventaire)
- [Valeur de stock](#calc-valeur-stock)
- [Tableau de bord](#dashboard)