## 🏗️ Charges

Cet écran vous permet de déclarer les **charges fixes annuelles** de chaque activité (loyer, personnel, énergie, eau…). Ces montants complètent le coût matière dans vos analyses de rentabilité, notamment le calcul du seuil de rentabilité. Vous y accédez par **Espace Vente → Config Charges**, ou par le raccourci 🏗️ Charges de la Configuration Vente.

### Ce que vous voyez

- Un **sélecteur d'activité** : les charges se déclarent activité par activité.
- Dans l'en-tête, le **total des charges annuelles** de l'activité sélectionnée, dès qu'un montant est saisi.
- Un bloc **Mode de saisie** avec deux options : **📊 Montant global** ou **📋 Détail par poste**.
- En mode détail, quatre postes de charge : **🏠 Loyer**, **👥 Charges personnel**, **⚡ Électricité / Gaz** et **💧 Eau**, tous exprimés en DT par an.
- Deux cartes de synthèse calculées automatiquement : **📅 Total annuel** et **📆 Mensuel (÷12)**.
- Le bouton **✓ Enregistrer** (ou **✓ Mettre à jour** si des charges existent déjà pour l'activité).

### Actions pas à pas

1. Sélectionnez l'activité concernée.
2. Choisissez le mode de saisie : **Montant global** si vous connaissez votre total annuel, **Détail par poste** pour ventiler loyer, personnel, énergie et eau.
3. Saisissez les montants en **DT par an**.
4. Vérifiez les cartes *Total annuel* et *Mensuel* qui se mettent à jour automatiquement.
5. Cliquez sur **✓ Enregistrer** ; un message vert confirme la sauvegarde.

:::formule Équivalent mensuel
Charges mensuelles = Total annuel ÷ 12
:::

:::exemple
Loyer 24 000 DT/an + charges personnel 36 000 DT/an + électricité/gaz 6 000 DT/an + eau 1 200 DT/an = **67 200 DT/an**, soit 5 600 DT de charges par mois.
:::

### Points d'attention

:::attention
Les montants se saisissent **à l'année**, pas au mois. Si vous saisissez un loyer mensuel, le total annuel — et toutes les analyses qui en découlent — seront fortement sous-estimés.
:::

:::attention
Le mode choisi détermine le calcul : en **Détail par poste**, le total est la somme des quatre postes ; en **Montant global**, seul le montant global compte. Après un changement de mode, vérifiez le total affiché dans l'en-tête avant d'enregistrer.
:::

:::astuce
Mettez ces montants à jour à chaque évolution notable (nouveau bail, embauche, hausse du prix de l'énergie) : vos indicateurs de rentabilité resteront fidèles à la réalité de votre exploitation.
:::

:::regle
Les charges fixes ne modifient pas le coût matière de vos recettes : elles s'ajoutent à celui-ci dans l'analyse de rentabilité globale de l'activité.
:::

### Voir aussi

- [Configuration Vente](#configuration-vente) — fixer les prix de vente
- [Rapports de vente](#rapports-vente) — suivre CA, marges et food cost
- [Tableau de bord](#dashboard) — vision globale de la performance
- [Coût d'une recette](#calc-cout-recette) — l'autre composante de votre marge