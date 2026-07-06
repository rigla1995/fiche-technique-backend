-- 146 : Manuel — refonte du tableau de bord v2 (onglets, filtres multi-sélection,
-- marge à 3 étages) ; les pages Rapports sont intégrées au dashboard (redirections).
-- Fiches réécrites : dashboard, dashboard-gerant ; fiches rapports* converties en renvois.

UPDATE manuel_sections
   SET titre = 'Tableau de bord',
       contenu = '## 📊 Le Tableau de bord

Le tableau de bord est votre poste de pilotage : ventes, marges, achats, stocks, pertes et labo, réunis sur une seule page. Tous les montants sont exprimés en **TTC**. Vous y accédez depuis le menu latéral, entrée **Tableau de bord**.

### Les cinq onglets

- **Vue d''ensemble** — les indicateurs clés de la période avec leur évolution par rapport à la période précédente, les alertes (stock sous seuil, food cost élevé, inventaire ancien) et la courbe d''évolution du CA et des marges.
- **Ventes & marges** — l''analyse fine de votre rentabilité : marges par canal de vente, par catégorie de produits, par type (produits, suppléments, valorisés), meilleures et plus faibles marges, et le détail triable produit par produit.
- **Achats & stock** — vos achats par catégorie et par fournisseur, les réceptions en provenance du labo, la valeur du stock par catégorie, les alertes de seuil détaillées et les derniers inventaires.
- **Pertes** — les pertes **consolidées de vos activités et de vos labos** : par type (avarie/déchet), par site, par catégorie, articles les plus perdus, et leur poids par rapport au CA.
- **Labo** — la production de produits transformés, les transferts émis vers chaque activité, le stock, les pertes et les ventes du labo. (Cet onglet n''apparaît que si vous avez un labo.)

### Les filtres

Chaque filtre est **multi-sélection** : cochez une ou plusieurs valeurs (activités, types de vente, prestataires, catégories de produits ou d''articles, familles, fournisseurs…). Sans coche, tout est pris en compte. Les filtres proposés s''adaptent à l''onglet affiché.

1. Choisissez la **période** : mois en cours, 7 ou 30 jours, mois dernier, trimestre, année, ou des dates personnalisées.
2. Combinez les filtres, par exemple : *marges des catégories « Pâtisseries » et « Boissons » vendues via prestataire sur le trimestre*.
3. Le bouton **✕ Réinitialiser** efface tous les filtres. Vos choix sont conservés (et l''adresse de la page peut être partagée telle quelle).

### La marge à trois étages

:::formule Du CA à la marge nette
Marge brute = CA − coût matière
Marge après commissions = marge brute − commissions prestataires
Marge nette estimée = marge après commissions − prorata des charges fixes
note: commissions = taux configuré par activité et prestataire ; charges = charges fixes annuelles ramenées à la période.
:::

- Le **coût matière** de chaque vente est figé au moment de la vente (voir [Coût de revient d''une recette](#calc-cout-recette)).
- La **cascade** de l''onglet Ventes & marges visualise chaque étage, du CA jusqu''à la marge nette.

:::astuce
Chaque indicateur affiche son évolution (▲/▼) par rapport à la période précédente de même durée. Le bouton **📥 Exporter (Excel)** télécharge les données de l''onglet affiché, filtres compris.
:::

:::attention
La marge nette est une **estimation** : elle répartit vos charges fixes annuelles au prorata de la période, indépendamment des filtres de catégories ou de canaux.
:::

### Voir aussi

- [Comprendre la valeur du stock](#calc-valeur-stock)
- [Les prix et le PV](#calc-prix)
- [Saisie des ventes](#saisie-ventes)',
       contenu_defaut = '## 📊 Le Tableau de bord

Le tableau de bord est votre poste de pilotage : ventes, marges, achats, stocks, pertes et labo, réunis sur une seule page. Tous les montants sont exprimés en **TTC**. Vous y accédez depuis le menu latéral, entrée **Tableau de bord**.

### Les cinq onglets

- **Vue d''ensemble** — les indicateurs clés de la période avec leur évolution par rapport à la période précédente, les alertes (stock sous seuil, food cost élevé, inventaire ancien) et la courbe d''évolution du CA et des marges.
- **Ventes & marges** — l''analyse fine de votre rentabilité : marges par canal de vente, par catégorie de produits, par type (produits, suppléments, valorisés), meilleures et plus faibles marges, et le détail triable produit par produit.
- **Achats & stock** — vos achats par catégorie et par fournisseur, les réceptions en provenance du labo, la valeur du stock par catégorie, les alertes de seuil détaillées et les derniers inventaires.
- **Pertes** — les pertes **consolidées de vos activités et de vos labos** : par type (avarie/déchet), par site, par catégorie, articles les plus perdus, et leur poids par rapport au CA.
- **Labo** — la production de produits transformés, les transferts émis vers chaque activité, le stock, les pertes et les ventes du labo. (Cet onglet n''apparaît que si vous avez un labo.)

### Les filtres

Chaque filtre est **multi-sélection** : cochez une ou plusieurs valeurs (activités, types de vente, prestataires, catégories de produits ou d''articles, familles, fournisseurs…). Sans coche, tout est pris en compte. Les filtres proposés s''adaptent à l''onglet affiché.

1. Choisissez la **période** : mois en cours, 7 ou 30 jours, mois dernier, trimestre, année, ou des dates personnalisées.
2. Combinez les filtres, par exemple : *marges des catégories « Pâtisseries » et « Boissons » vendues via prestataire sur le trimestre*.
3. Le bouton **✕ Réinitialiser** efface tous les filtres. Vos choix sont conservés (et l''adresse de la page peut être partagée telle quelle).

### La marge à trois étages

:::formule Du CA à la marge nette
Marge brute = CA − coût matière
Marge après commissions = marge brute − commissions prestataires
Marge nette estimée = marge après commissions − prorata des charges fixes
note: commissions = taux configuré par activité et prestataire ; charges = charges fixes annuelles ramenées à la période.
:::

- Le **coût matière** de chaque vente est figé au moment de la vente (voir [Coût de revient d''une recette](#calc-cout-recette)).
- La **cascade** de l''onglet Ventes & marges visualise chaque étage, du CA jusqu''à la marge nette.

:::astuce
Chaque indicateur affiche son évolution (▲/▼) par rapport à la période précédente de même durée. Le bouton **📥 Exporter (Excel)** télécharge les données de l''onglet affiché, filtres compris.
:::

:::attention
La marge nette est une **estimation** : elle répartit vos charges fixes annuelles au prorata de la période, indépendamment des filtres de catégories ou de canaux.
:::

### Voir aussi

- [Comprendre la valeur du stock](#calc-valeur-stock)
- [Les prix et le PV](#calc-prix)
- [Saisie des ventes](#saisie-ventes)',
       mots_cles = 'tableau de bord, dashboard, kpi, filtres, marge, marge nette, commissions, charges, food cost, export excel, comparaison, cascade, onglets',
       updated_at = NOW()
 WHERE slug = 'dashboard';

UPDATE manuel_sections
   SET titre = 'Rapports (intégrés au tableau de bord)',
       contenu = '## 📈 Les rapports ont rejoint le Tableau de bord

Les anciennes pages « Rapports » ont été intégrées au [Tableau de bord](#dashboard), plus complet et entièrement filtrable :

- Le **rapport d''activités** (stock, achats, pertes, alertes de seuil) correspond à l''onglet **Achats & stock**, complété par l''onglet **Pertes**.
- Chaque onglet dispose d''un **export Excel** reprenant les données filtrées.

:::astuce
Vos anciens liens continuent de fonctionner : ils ouvrent automatiquement le bon onglet du tableau de bord.
:::',
       contenu_defaut = '## 📈 Les rapports ont rejoint le Tableau de bord

Les anciennes pages « Rapports » ont été intégrées au [Tableau de bord](#dashboard), plus complet et entièrement filtrable :

- Le **rapport d''activités** (stock, achats, pertes, alertes de seuil) correspond à l''onglet **Achats & stock**, complété par l''onglet **Pertes**.
- Chaque onglet dispose d''un **export Excel** reprenant les données filtrées.

:::astuce
Vos anciens liens continuent de fonctionner : ils ouvrent automatiquement le bon onglet du tableau de bord.
:::',
       mots_cles = 'rapports, tableau de bord, achats, stock, pertes, export',
       updated_at = NOW()
 WHERE slug = 'rapports';

UPDATE manuel_sections
   SET titre = 'Rapport labo (intégré au tableau de bord)',
       contenu = '## 🧪 Le rapport labo a rejoint le Tableau de bord

Le suivi du labo se fait désormais dans l''onglet **Labo** du [Tableau de bord](#dashboard) : valeur du stock, achats, **production de produits transformés**, transferts émis par activité destinataire, pertes et ventes du labo — avec la période et les labos de votre choix, et un export Excel.',
       contenu_defaut = '## 🧪 Le rapport labo a rejoint le Tableau de bord

Le suivi du labo se fait désormais dans l''onglet **Labo** du [Tableau de bord](#dashboard) : valeur du stock, achats, **production de produits transformés**, transferts émis par activité destinataire, pertes et ventes du labo — avec la période et les labos de votre choix, et un export Excel.',
       mots_cles = 'rapport labo, tableau de bord, production, transferts, stock labo',
       updated_at = NOW()
 WHERE slug = 'rapports-labo';

UPDATE manuel_sections
   SET titre = 'Rapport de ventes (intégré au tableau de bord)',
       contenu = '## 💰 Le rapport de ventes a rejoint le Tableau de bord

L''analyse des ventes se fait désormais dans l''onglet **Ventes & marges** du [Tableau de bord](#dashboard), en mieux :

- marges par **canal** (vente directe, chaque prestataire) avec les **commissions déduites** ;
- marges par **catégorie de produits** et par **type** (produits, suppléments, valorisés) ;
- **cascade** du CA à la marge nette estimée (commissions et charges fixes comprises) ;
- détail par produit triable (CA, marge, food cost, part du CA) et export Excel.

Filtrez par activités, types de vente, prestataires et catégories — en multi-sélection.',
       contenu_defaut = '## 💰 Le rapport de ventes a rejoint le Tableau de bord

L''analyse des ventes se fait désormais dans l''onglet **Ventes & marges** du [Tableau de bord](#dashboard), en mieux :

- marges par **canal** (vente directe, chaque prestataire) avec les **commissions déduites** ;
- marges par **catégorie de produits** et par **type** (produits, suppléments, valorisés) ;
- **cascade** du CA à la marge nette estimée (commissions et charges fixes comprises) ;
- détail par produit triable (CA, marge, food cost, part du CA) et export Excel.

Filtrez par activités, types de vente, prestataires et catégories — en multi-sélection.',
       mots_cles = 'rapport ventes, tableau de bord, marges, canal, categories, food cost',
       updated_at = NOW()
 WHERE slug = 'rapports-vente';

UPDATE manuel_sections
   SET titre = 'Tableau de bord du gérant',
       contenu = '## 🧑‍💼 Le tableau de bord côté gérant

En tant que gérant, vous utilisez le **même tableau de bord** que le propriétaire du compte — voir [Tableau de bord](#dashboard) — automatiquement **limité à votre périmètre** : seules vos activités et labos affectés apparaissent dans les filtres et dans les chiffres.

:::regle
Les indicateurs, marges et alertes que vous voyez ne concernent que les activités et labos qui vous sont affectés.
:::',
       contenu_defaut = '## 🧑‍💼 Le tableau de bord côté gérant

En tant que gérant, vous utilisez le **même tableau de bord** que le propriétaire du compte — voir [Tableau de bord](#dashboard) — automatiquement **limité à votre périmètre** : seules vos activités et labos affectés apparaissent dans les filtres et dans les chiffres.

:::regle
Les indicateurs, marges et alertes que vous voyez ne concernent que les activités et labos qui vous sont affectés.
:::',
       mots_cles = 'gerant, tableau de bord, perimetre, activites affectees',
       updated_at = NOW()
 WHERE slug = 'dashboard-gerant';
