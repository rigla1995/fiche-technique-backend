## 📊 Le Tableau de bord

Le tableau de bord est votre poste de pilotage : [[nom:vente:pl]], [[nom:marge:pl]], achats, [[nom:stock:pl]], [[nom:perte:pl]] et [[nom:labo]], réunis sur une seule page. Tous les montants sont exprimés en **TTC**. Vous y accédez depuis le menu latéral, entrée **Tableau de bord**.

### Les cinq onglets

- **Vue d'ensemble** — les indicateurs clés de la période avec leur évolution par rapport à la période précédente, les alertes ([[nom:stock]] sous seuil, [[nom:food_cost]] [[acc:food_cost:élevé:élevée]] — au-delà du **seuil [[de:cout_matiere]] de votre domaine**, 40 % par défaut —, [[nom:inventaire]] [[acc:inventaire:ancien:ancienne]]) et la courbe d'évolution du CA et [[du:marge:pl]].
- **[[Nom:vente:pl]] & [[nom:marge:pl]]** — l'analyse fine de votre rentabilité : [[nom:marge:pl]] par canal de vente, par catégorie [[de:produit:pl]], par type ([[nom:produit:pl]], [[nom:supplement:pl]], valorisés), [[acc:marge:meilleurs:meilleures]] et plus faibles [[nom:marge:pl]], et le détail triable [[nom:produit]] par [[nom:produit]].
- **Achats & [[nom:stock]]** — vos achats par catégorie et par [[nom:fournisseur]], les réceptions en provenance [[du:labo]], la valeur [[du:stock]] par catégorie, les alertes de seuil détaillées et les [[acc:inventaire:derniers:dernières]] [[nom:inventaire:pl]].
- **[[Nom:perte:pl]]** — [[le:perte:pl]] **[[acc:perte:consolidé:consolidée:pl]] de [[votre:activite:pl]] et de [[votre:labo:pl]]** : par type (les types [[de:perte]] de votre domaine : avarie/déchet par défaut), par site, par catégorie, [[nom:article:pl]] les plus [[acc:article:perdu:perdue:pl]], et leur poids par rapport au CA.
- **[[Court:labo]]** — la production [[de:pt:pl]], [[le:transfert:pl]] [[acc:transfert:émis:émise:pl]] vers chaque [[nom:activite]], les cessions internes vers [[le:labo:pl]] [[acc:labo:rattaché:rattachée:pl]], [[le:stock]], [[le:perte:pl]] et [[le:vente:pl]] [[du:labo]]. (Cet onglet n'apparaît que si vous avez [[un:labo]].)

### Les filtres

Chaque filtre est **multi-sélection** : cochez une ou plusieurs valeurs ([[nom:activite:pl]], types de vente, [[nom:prestataire:pl]], catégories [[de:produit:pl]] ou [[de:article:pl]], familles, [[nom:fournisseur:pl]]…). Sans coche, tout est pris en compte. Les filtres proposés s'adaptent à l'onglet affiché.

1. Choisissez la **période** : mois en cours, 7 ou 30 jours, mois dernier, trimestre, année, ou des dates personnalisées.
2. Combinez les filtres, par exemple : *[[nom:marge:pl]] des catégories « Pâtisseries » et « Boissons » vendues via [[nom:prestataire]] sur le trimestre*.
3. Le bouton **✕ Réinitialiser** efface tous les filtres. Vos choix sont conservés (et l'adresse de la page peut être partagée telle quelle).

### [[Le:marge]] à trois étages

:::formule Du CA [[au:marge]] [[acc:marge:net:nette]]
[[Nom:marge]] [[acc:marge:brut:brute]] = CA − [[nom:cout_matiere]]
[[Nom:marge]] après commissions = [[nom:marge]] [[acc:marge:brut:brute]] − commissions [[nom:prestataire:pl]]
[[Nom:marge]] [[acc:marge:net estimé:nette estimée]] = [[nom:marge]] après commissions − prorata des charges fixes
note: commissions = taux configuré par [[nom:activite]] et [[nom:prestataire]] ; charges = charges fixes annuelles ramenées à la période.
:::

- [[Det:cout_matiere:le]]**[[nom:cout_matiere]]** de chaque [[nom:vente]] est [[acc:cout_matiere:figé:figée]] au moment [[du:vente]] (voir [Coût de revient d'[[un:recette]]](#calc-cout-recette)) ; le badge [[de:cout_matiere]] d'[[un:produit]] passe au vert, à l'orange puis au rouge selon le seuil de votre domaine (40 % par défaut : orange dès seuil − 10 points, rouge au-delà du seuil).
- La **cascade** de l'onglet [[Nom:vente:pl]] & [[nom:marge:pl]] visualise chaque étage, du CA jusqu'[[au:marge]] [[acc:marge:net:nette]].

:::astuce
Chaque indicateur affiche son évolution (▲/▼) par rapport à la période précédente de même durée. Le bouton **📥 Exporter (Excel)** télécharge les données de l'onglet affiché, filtres compris.
:::

:::attention
[[Le:marge]] [[acc:marge:net:nette]] est une **estimation** : [[acc:marge:il:elle]] répartit vos charges fixes annuelles au prorata de la période, indépendamment des filtres de catégories ou de canaux.
:::

### Voir aussi

- [Comprendre la valeur [[du:stock]]](#calc-valeur-stock)
- [Les prix et le PV](#calc-prix)
- [Saisie [[du:vente:pl]]](#saisie-ventes)