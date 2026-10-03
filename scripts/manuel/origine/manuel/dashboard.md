## 📊 Le Tableau de bord

Le tableau de bord est votre poste de pilotage : ventes, marges, achats, stocks, pertes et labo, réunis sur une seule page. Tous les montants sont exprimés en **TTC**. Vous y accédez depuis le menu latéral, entrée **Tableau de bord**.

### Les cinq onglets

- **Vue d'ensemble** — les indicateurs clés de la période avec leur évolution par rapport à la période précédente, les alertes (stock sous seuil, food cost élevé — au-delà du **seuil de coût matière de votre domaine**, 40 % par défaut —, inventaire ancien) et la courbe d'évolution du CA et des marges.
- **Ventes & marges** — l'analyse fine de votre rentabilité : marges par canal de vente, par catégorie de produits, par type (produits, suppléments, valorisés), meilleures et plus faibles marges, et le détail triable produit par produit.
- **Achats & stock** — vos achats par catégorie et par fournisseur, les réceptions en provenance du labo, la valeur du stock par catégorie, les alertes de seuil détaillées et les derniers inventaires.
- **Pertes** — les pertes **consolidées de vos activités et de vos labos** : par type (les types de perte de votre domaine : avarie/déchet par défaut), par site, par catégorie, articles les plus perdus, et leur poids par rapport au CA.
- **Labo** — la production de produits transformés, les transferts émis vers chaque activité, les cessions internes vers les labos rattachés, le stock, les pertes et les ventes du labo. (Cet onglet n'apparaît que si vous avez un labo.)

### Les filtres

Chaque filtre est **multi-sélection** : cochez une ou plusieurs valeurs (activités, types de vente, prestataires, catégories de produits ou d'articles, familles, fournisseurs…). Sans coche, tout est pris en compte. Les filtres proposés s'adaptent à l'onglet affiché.

1. Choisissez la **période** : mois en cours, 7 ou 30 jours, mois dernier, trimestre, année, ou des dates personnalisées.
2. Combinez les filtres, par exemple : *marges des catégories « Pâtisseries » et « Boissons » vendues via prestataire sur le trimestre*.
3. Le bouton **✕ Réinitialiser** efface tous les filtres. Vos choix sont conservés (et l'adresse de la page peut être partagée telle quelle).

### La marge à trois étages

:::formule Du CA à la marge nette
Marge brute = CA − coût matière
Marge après commissions = marge brute − commissions prestataires
Marge nette estimée = marge après commissions − prorata des charges fixes
note: commissions = taux configuré par activité et prestataire ; charges = charges fixes annuelles ramenées à la période.
:::

- Le **coût matière** de chaque vente est figé au moment de la vente (voir [Coût de revient d'une recette](#calc-cout-recette)) ; le badge de coût matière d'un produit passe au vert, à l'orange puis au rouge selon le seuil de votre domaine (40 % par défaut : orange dès seuil − 10 points, rouge au-delà du seuil).
- La **cascade** de l'onglet Ventes & marges visualise chaque étage, du CA jusqu'à la marge nette.

:::astuce
Chaque indicateur affiche son évolution (▲/▼) par rapport à la période précédente de même durée. Le bouton **📥 Exporter (Excel)** télécharge les données de l'onglet affiché, filtres compris.
:::

:::attention
La marge nette est une **estimation** : elle répartit vos charges fixes annuelles au prorata de la période, indépendamment des filtres de catégories ou de canaux.
:::

### Voir aussi

- [Comprendre la valeur du stock](#calc-valeur-stock)
- [Les prix et le PV](#calc-prix)
- [Saisie des ventes](#saisie-ventes)