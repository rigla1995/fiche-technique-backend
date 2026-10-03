-- 196 — Lot 2c : brouillons des variantes du manuel (docs/lot-2c-spec.md §4.4).
-- Généré par scripts/manuel/generer-migrations.mjs — ne pas éditer à la main.
--
-- Un brouillon par fiche et par domaine (décision 1 du client), statut « brouillon » : jamais servi avant d'être validé
-- dans l'admin (I12). Inséré que le domaine existe ou non (§8.6). ON CONFLICT DO NOTHING : un brouillon déjà corrigé
-- n'est jamais écrasé ; idempotente (2e passage : 0 inséré). base_md5 = md5 du texte commun balisé (scripts/manuel/
-- balise/manuel/<slug>.md), égal au contenu servi après la 194 pour une fiche non modifiée (§4.4).
--
-- inventaire : {"variantes":["hotellerie/calc-cout-recette","hotellerie/compte-activites-labos","hotellerie/decouvrir-labflow","hotellerie/demarrage","hotellerie/lexique-pt","hotellerie/lexique","hotellerie/onboarding-configuration","hotellerie/roles","usine/calc-cout-recette","usine/compte-activites-labos","usine/decouvrir-labflow","usine/demarrage","usine/lexique-pt","usine/lexique","usine/onboarding-configuration","usine/roles"]}

DO $v196$
DECLARE
  n INTEGER;
  n_hotellerie INTEGER := 0;
  n_usine INTEGER := 0;
  absents TEXT[] := ARRAY[]::TEXT[];
  fiches_absentes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- ── hotellerie / calc-cout-recette ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'hotellerie', NULL, $v196_hotellerie_calc_cout_recette$## 🧮 Le coût de revient d'[[un:recette]]

Le coût de revient d'[[un:fiche_technique]] est la somme de ce que coûtent ses éléments : chaque [[nom:ingredient]] compte pour [[son:portion]] [[acc:portion:multiplié:multipliée]] par son prix unitaire TTC, et chaque sous-produit (par exemple [[un:produit_utilisable]] [[acc:produit_utilisable:préparé:préparée]] à part) compte pour [[son:portion]] [[acc:portion:multiplié:multipliée]] par son propre coût de revient, calculé de la même façon. Le calcul descend ainsi dans [[le:recette]] du sous-produit, puis de ses éventuels sous-produits, jusqu'[[acc:ingredient:au dernier:à la dernière]] [[nom:ingredient]].

### Les paramètres qui influencent le résultat

- **[[Le:portion:pl]] [[du:recette]]** : la quantité de chaque [[nom:ingredient]] et de chaque sous-produit nécessaire pour une unité produite (un verre, un plateau, une corbeille…).
- **Le prix unitaire de chaque [[nom:ingredient]]**, selon le mode choisi au moment de générer [[le:fiche_technique]] (carte *[[Court:fiche_technique]] [[Court:stock]]* avec ses méthodes *DP* / *PMP*, ou carte *[[Court:fiche_technique]] Manuel*) :
  - **Prix moyen pondéré (PMP)** — méthode *PMP* : la moyenne pondérée des prix TTC de vos achats (et [[nom:transfert:pl]] [[acc:transfert:reçu:reçue:pl]], côté [[nom:activite]]) depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] — voir [Le prix moyen pondéré](#calc-pmp). C'est ce prix qui sert à valoriser les productions.
  - **Dernier prix** — méthode *DP* : le dernier prix TTC enregistré pour [[le:article]].
  - **Prix manuel** — carte *[[Court:fiche_technique]] Manuel* : un prix que vous saisissez vous-même, mémorisé par base de prix, pour simuler un coût.
- **La base de prix choisie** : [[le:fiche_technique]] se génère pour une ou plusieurs bases ([[nom:activite:pl]] ou [[nom:labo:pl]] [[acc:labo:assigné:assignée:pl]] [[au:produit]]) — les prix proviennent [[du:stock]] de chaque base, avec repli sur les prix [[du:labo]] [[acc:labo:lié:liée]] quand [[un:article]] n'a pas encore de prix côté [[nom:activite]]. [[Un:produit]] [[acc:produit:fabriqué:fabriquée]] [[au:labo]] se calcule uniquement sur [[le:labo:pl]] [[acc:labo:assigné:assignée:pl]].
- **[[Le:portion:pl]] [[acc:portion:personnalisé:personnalisée:pl]]** : au moment d'une production, vous pouvez ajuster ponctuellement les quantités réellement consommées ; les déductions [[de:stock]] suivent ces quantités, sans modifier [[le:fiche_technique]] (l'entrée [[du:produit]] [[acc:produit:fini:finie]] reste valorisée au coût [[du:recette]] standard).

:::formule Coût de revient d'[[un:recette]]
Coût total = somme([[nom:portion]] [[nom:ingredient]] × prix unitaire TTC) + somme([[nom:portion]] sous-produit × coût de revient du sous-produit)
note: le coût de chaque sous-produit est calculé récursivement avec la même règle, aux mêmes prix.
:::

:::exemple
[[Nom:recette]] « Cocktail de bienvenue » (pour 1 verre), [[acc:recette:valorisé:valorisée]] au PMP TTC [[du:activite]] (le bar) :

- Jus d'orange : 0,100 L × 4,500 DT/L = 0,450 DT
- Jus d'ananas : 0,060 L × 6,000 DT/L = 0,360 DT
- Eau gazeuse : 0,050 L × 2,000 DT/L = 0,100 DT
- Purée de mangue maison (sous-produit) : 0,050 kg × 9,600 DT/kg = 0,480 DT

Le coût de la purée de mangue (9,600 DT le kg) est lui-même calculé à partir de [[acc:recette:son propre:sa propre]] [[nom:recette]], [[acc:recette:établi:établie]] pour 1 kg : mangues 1,200 kg × 7,000 DT = 8,400 DT ; citrons verts 0,100 kg × 9,000 DT = 0,900 DT ; menthe fraîche 0,050 kg × 6,000 DT = 0,300 DT.

**Coût de revient du cocktail = 0,450 + 0,360 + 0,100 + 0,480 = 1,390 DT TTC.**
:::

### Ce qui peut faire varier le résultat

- Chaque nouvel achat à un prix différent déplace le PMP, donc le coût de revient recalculé.
- [[Un:inventaire]] redémarre la période de calcul du PMP : le coût peut évoluer juste après.
- Si [[un:ingredient]] n'a encore aucun prix connu (jamais [[acc:ingredient:approvisionné:approvisionnée]]), sa part est comptée à zéro : le coût affiché est alors incomplet.
- La modification ou la suppression d'une ligne [[de:appro]] passée change le PMP, donc le coût, rétroactivement.
- [[Un:recette]] ne peut pas se contenir [[acc:recette:lui-même:elle-même]] (directement ou via ses sous-produits) : le calcul le refuse.

### Voir aussi

- [[[Nom:fiche_technique:pl]]](#fiches-techniques)
- [Le prix moyen pondéré](#calc-pmp)
- [La production d'[[un:pt]]](#calc-production-pt)
- [HT et TTC](#calc-ht-ttc)
- [Lexique [[un:pt:pl]]](#lexique-pt)$v196_hotellerie_calc_cout_recette$, NULL, 'brouillon', '9550800d9be7121890531fd0b30b1349'
    FROM manuel_sections s WHERE s.slug = 'calc-cout-recette'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_hotellerie := n_hotellerie + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-cout-recette') THEN fiches_absentes := fiches_absentes || 'calc-cout-recette'::TEXT; END IF;
  -- ── hotellerie / compte-activites-labos ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'hotellerie', NULL, $v196_hotellerie_compte_activites_labos$## 🏢 Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]

Toute l'organisation de LabFlow repose sur trois niveaux : le **compte**, [[det:activite:le:pl]]**[[nom:activite:pl]]** et [[det:labo:le:pl]]**[[nom:labo:pl]]**. Comprendre qui possède quoi est la clé de lecture de tous les autres écrans.

### Les trois niveaux

- **Le compte** : c'est votre hôtel, votre résidence ou votre groupe dans LabFlow. Il porte l'abonnement, qui fixe vos quotas : nombre [[de:activite:pl]], [[de:labo:pl]] et de comptes [[nom:gerant:pl]] — et, si l'option [[Court:acheteur:pl]] est active, le palier de cette option. Il porte aussi la **formule d'activités** (Basique ou Premium), qui détermine l'étendue [[du:espace_produits:Nom]]. Les compteurs [[de:activite:pl]] et [[de:labo:pl]] s'affichent sur la page [[Mon:activite:pl:Nom]], celui des collaborateurs sur la page [[Nom:gerant:pl]]. Il n'y a pas de distinction entre indépendant et entreprise : le même modèle s'adapte à toutes les tailles.
- **[[Le:activite:pl]] (0 à N)** : vos lieux d'exploitation — restaurant, bar, spa, housekeeping… Chaque [[nom:activite]] vend, consomme et gère [[acc:stock:son propre:sa propre]] [[nom:stock]].
- **[[Le:labo:pl]] (0 à N)** : vos sites de production. [[Un:labo]] fabrique [[un:pt:pl]], approvisionne [[le:activite:pl]] qui lui sont [[acc:activite:rattaché:rattachée:pl]] **exclusivement par [[nom:transfert]]** — et, avec l'option [[Court:acheteur:pl]], vend directement aux professionnels.

### Qui possède quoi ?

| Élément | Niveau | En pratique |
|---|---|---|
| [[Nom:referentiel]] (unités, familles, catégories, [[nom:article:pl]]) | Compte | [[acc:referentiel:Défini:Définie]] une seule fois, [[acc:referentiel:partagé:partagée]] par tous les sites |
| Sélection [[de:article:pl]] | [[Nom:activite]] / [[nom:labo]] | Chaque site n'utilise que [[le:article:pl]] qu'on lui a [[acc:article:assigné:assignée:pl]] : les huiles de massage au spa, les denrées au restaurant |
| [[Nom:stock]], [[court:appro:pl]], [[nom:inventaire:pl]], [[nom:perte:pl]] | [[Nom:activite]] / [[nom:labo]] | Chaque site a les siens, suivis séparément |
| [[Nom:produit:pl]] et [[nom:fiche_technique:pl]] | [[Nom:activite]] / [[nom:labo]] | [[Un:produit]] est [[acc:produit:affecté:affectée]] aux sites qui [[acc:produit:le:la]] fabriquent ou [[acc:produit:le:la]] vendent |
| [[Nom:vente:pl]] et prix de vente | [[Nom:activite]] / [[nom:labo]] | Chaque [[nom:activite]] a ses prix et [[son:vente:pl]] ; [[le:labo]] peut aussi saisir [[son:vente:pl]] [[acc:vente:direct:directe:pl]] |
| Carnet [[de:acheteur:pl]] et tarifs B2B | Compte | Communs à [[tous:labo:les]] ; [[le:vente:pl]] [[au:acheteur:pl]] partent [[du:stock]] d'[[un:labo]] |

### Le lien [[nom:activite]] ↔ [[nom:labo]]

Dès qu'[[un:labo]] existe sur votre compte, la création ou la modification d'[[un:activite]] vous propose deux options :

- **Avec [[nom:labo]]** : [[le:activite]] est [[acc:activite:rattaché:rattachée]] à [[un:labo]] qui l'approvisionne par [[nom:transfert]] — [[son:pt:pl]] arrivent dans [[le:stock]] du restaurant ou du bar à chaque [[nom:transfert]].
- **Sans [[nom:labo]]** : [[le:activite]] gère [[acc:activite:seul:seule]] [[son:appro:pl]] auprès de [[son:fournisseur:pl]].

Un même hôtel peut mélanger les deux : le restaurant et le bar rattachés [[au:labo]], et le spa autonome, par exemple.

### La base [[court:acheteur:pl]] et le compte [[nom:depot]]

Avec l'**option [[Court:acheteur:pl]]**, [[le:labo]] ne fait pas que produire pour [[votre:activite:pl]] : [[acc:labo:il:elle]] vend aussi **directement aux professionnels** (résidences seniors, cliniques, cantines d'entreprise, hôtels partenaires…). Le carnet [[de:acheteur:pl]], les tarifs B2B, les commandes et le portail en ligne sont réunis dans [[det:espace_acheteurs:le]][[[Nom:espace_acheteurs]]](#acheteurs-module).

- L'option nécessite **au moins [[un:labo]]** : c'est de [[son:stock]] que partent toujours [[le:vente:pl]] [[au:acheteur:pl]].
- Elle est facturée **par palier** selon la taille du carnet : jusqu'à 10, 20, 50 ou 100 [[nom:acheteur:pl]].
- Un **compte [[nom:depot]]** est un compte **sans [[nom:activite]]** : [[un:labo]] + la base [[court:acheteur:pl]]. C'est le modèle de l'unité de production qui ne vend qu'aux professionnels. Son menu est allégé : sans [[nom:activite]], [[le:espace_vente:Nom]], [[le:transfert:pl:Nom]] et [[le:produit_vendable:pl:Titre]] sont masqués — ils réapparaissent automatiquement dès [[acc:activite:le premier:la première]] [[nom:activite]] [[acc:activite:créé:créée]].

### Quatre exemples concrets

- **Hôtel avec production centralisée** : 1 [[nom:labo]] + 3 [[nom:activite:pl]] (restaurant, bar, spa). [[Le:labo]] prépare les viennoiseries du petit-déjeuner, les mignardises et les sirops maison du bar ; le restaurant et le bar reçoivent leur production par [[nom:transfert]] et saisissent leurs propres [[nom:vente:pl]]. [[Le:referentiel]] (denrées, vins et spiritueux, savons et gels douche…) est [[acc:referentiel:commun:commune]] à tous.
- **Petit hôtel** : 1 [[nom:activite]], 0 [[nom:labo]]. Le restaurant de l'hôtel fait ses achats, [[son:fiche_technique:pl]] et [[son:vente:pl]] ; le modèle reste le même, simplement sans [[Nom:espace_labo]].
- **Groupe de résidences** : 1 [[nom:labo]] + 2 [[nom:activite:pl]] (un restaurant dans chaque résidence). [[Le:labo]] prépare, les résidences servent, et les rapports donnent la vision d'ensemble du compte.
- **Unité de production en [[nom:depot]]** : 0 [[nom:activite]], 1 [[nom:labo]] + base [[court:acheteur:pl]]. [[Le:labo]] vend exclusivement à des établissements extérieurs (cliniques, cantines d'entreprise, hôtels partenaires…), via [[le:espace_acheteurs:Nom]] et le portail de commande.

:::regle
[[Le:referentiel]] est [[acc:referentiel:commun:commune]] au compte ; [[le:stock:pl]] sont [[acc:stock:locaux:locales]] à chaque site. [[Un:article]] — une bouteille d'eau minérale, par exemple — se crée une seule fois, mais [[son:stock]] et son prix moyen pondéré vivent séparément dans chaque [[nom:activite]] et chaque [[nom:labo]].
:::

:::attention
[[Un:pt]] d'origine [[nom:labo]] ne peut être [[acc:pt:approvisionné:approvisionnée]] côté [[nom:activite]] que par [[nom:transfert]] : pas de saisie d'achat directe pour [[ce:produit:pl]] au restaurant ou au bar. Voir [[[le:pt:pl]]](#lexique-pt).
:::

### Voir aussi

- [Parcours de démarrage](#demarrage)
- [[[Nom:activite:pl]]](#activites) — l'écran de gestion de vos sites
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module) — [[le:vente]] aux professionnels
- [[[Nom:transfert:pl]]](#transferts)
- [Rôles & accès](#roles)
- [Calculs : [[le:transfert:pl]]](#calc-transferts)$v196_hotellerie_compte_activites_labos$, NULL, 'brouillon', '4c32347fe4b89ff00361265b939826de'
    FROM manuel_sections s WHERE s.slug = 'compte-activites-labos'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_hotellerie := n_hotellerie + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'compte-activites-labos') THEN fiches_absentes := fiches_absentes || 'compte-activites-labos'::TEXT; END IF;
  -- ── hotellerie / decouvrir-labflow ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'hotellerie', NULL, $v196_hotellerie_decouvrir_labflow$## 🌟 LabFlow en un coup d'œil

LabFlow est une application de gestion pensée pour l'hôtellerie : hôtels, résidences, clubs. Elle réunit dans un seul outil tout ce qui fait la rentabilité de [[votre:activite:pl]] — restaurant, bar, spa, housekeeping — et de [[votre:labo]] : [[le:referentiel]] [[de:article:pl]], [[le:fiche_technique:pl]] et [[le:cout_matiere]], [[le:stock:pl]] de chaque site, la production centralisée, [[le:transfert:pl]] entre sites, [[le:vente:pl]] — au comptoir comme aux professionnels — et les rapports.

### Ce que LabFlow vous apporte

- **La maîtrise [[du:cout_matiere]]** : chaque cocktail ou formule de petit-déjeuner a [[son:recette]], [[acc:recette:décrit:décrite]] dans [[un:fiche_technique]] dont le coût de revient se calcule automatiquement à partir de vos prix d'achat réels. Quand un prix [[nom:fournisseur]] évolue, vos coûts suivent.
- **[[Un:stock:pl]] multi-sites** : chaque [[nom:activite]] (bar, spa, housekeeping…) et chaque [[nom:labo]] dispose de [[acc:stock:son propre:sa propre]] [[nom:stock]], avec [[nom:appro:pl]], [[nom:inventaire:pl]], [[nom:perte:pl]] et valeur [[de:stock]] suivis site par site.
- **La production centralisée** : [[le:labo]] réalise [[votre:pt:pl]] (viennoiseries du petit-déjeuner, mignardises, sirops maison du bar…), [[le:ingredient:pl]] sont [[acc:ingredient:déduit:déduite:pl]] automatiquement, et [[votre:activite:pl]] sont [[acc:activite:approvisionné:approvisionnée:pl]] par [[nom:transfert]].
- **[[Le:vente]] aux professionnels (B2B)** : avec l'option [[Court:acheteur:pl]], [[votre:labo]] vend directement à des établissements extérieurs (résidences seniors, cliniques, cantines d'entreprise…) — tarifs dédiés, commandes en ligne via un portail, factures [[de:vente]].
- **La traçabilité** : chaque mouvement laisse une trace consultable — [[nom:appro:pl]], [[nom:perte:pl]], [[nom:transfert:pl]], [[nom:inventaire:pl]], [[nom:vente:pl]] — avec filtres et exports dans les pages d'historique.
- **[[Le:vente:pl]] et [[le:marge:pl]]** : la saisie [[du:vente:pl]] déduit [[le:stock]] et alimente vos indicateurs : chiffre d'affaires, [[nom:food_cost]], [[nom:marge]] [[acc:marge:brut:brute]], valeur [[du:stock]], [[nom:perte:pl]], panier moyen.

Tous les montants sont exprimés en **DT**. Les prix d'achat se saisissent en HT avec leur taux de TVA, et l'application affiche les valeurs en TTC dans les rapports et tableaux de bord (voir [la règle HT/TTC](#calc-ht-ttc)).

### Pour qui ?

LabFlow s'adapte à la taille de votre établissement grâce à un modèle unique : un compte regroupe [[acc:activite:un:une]] ou plusieurs **[[nom:activite:pl]]** (restaurant, bar, spa, housekeeping…) et, si besoin, [[acc:labo:un:une]] ou plusieurs **[[nom:labo:pl]]** pour la production.

- Le **petit hôtel** : [[acc:activite:un seul:une seule]] [[nom:activite]] (son restaurant), tout se gère au même endroit.
- L'**hôtel avec [[nom:labo]][[acc:labo: central:]]** : [[acc:labo:il:elle]] prépare, le restaurant et le bar servent, [[le:transfert:pl]] font le lien.
- Le **groupe hôtelier ou club multi-sites** : plusieurs [[nom:activite:pl]], [[acc:activite:chacun:chacune]] avec [[son:stock]] et ses prix de vente, et des rapports pour piloter l'ensemble.
- L'**unité de production en [[nom:depot]]** : pas [[de:activite]] — [[un:labo]] et un carnet [[de:acheteur:pl]] (cliniques, cantines d'entreprise, hôtels partenaires…), avec commandes via le portail.

Le détail de ce modèle est expliqué dans [Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]](#compte-activites-labos).

### Les grands modules

| Module | Ce qu'il couvre |
|---|---|
| [[Nom:referentiel]] | Unités, familles, catégories et [[nom:article:pl]] (denrées, vins et spiritueux, savons et gels douche…) : la base commune de votre compte |
| Espace [[Nom:produit:pl]] | [[Pl:produit_vendable]], [[pl:produit_utilisable]] et [[pl:produit_valorise]], avec leurs [[nom:fiche_technique:pl]] |
| [[Nom:espace_activites]] | [[Nom:stock]], [[nom:appro:pl]], factures, [[nom:perte:pl]] et [[nom:inventaire:pl]] de chaque [[nom:activite]] |
| [[Nom:espace_labo]] | [[Nom:stock]] [[du:labo]], production, [[nom:transfert:pl]] vers [[le:activite:pl]] |
| [[Nom:espace_vente]] | Prix de vente, [[nom:prestataire:pl]], charges, saisie [[du:vente:pl]] et rapport [[de:vente]] |
| [[Nom:espace_acheteurs]] *(option)* | Carnet [[de:acheteur:pl]], tarifs dédiés, [[nom:vente:pl]] et commandes, portail en ligne, factures [[de:vente]] |
| Gestion | Tableau de bord, rapports, [[nom:fournisseur:pl]], [[nom:gerant:pl]], abonnement |

:::astuce
Sur la plupart des écrans, un petit bouton « ? » ouvre ce manuel directement à la page concernée. Vous retrouvez aussi le lien Manuel d'utilisation en bas du menu latéral.
:::

### Voir aussi

- [Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]](#compte-activites-labos)
- [Parcours de démarrage](#demarrage)
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module)
- [Lexique](#lexique)
- [Tableau de bord](#dashboard)
- [[[Nom:fiche_technique:pl]]](#fiches-techniques)$v196_hotellerie_decouvrir_labflow$, NULL, 'brouillon', '22019ceed9ce2d099a257e537e064070'
    FROM manuel_sections s WHERE s.slug = 'decouvrir-labflow'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_hotellerie := n_hotellerie + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'decouvrir-labflow') THEN fiches_absentes := fiches_absentes || 'decouvrir-labflow'::TEXT; END IF;
  -- ── hotellerie / demarrage ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'hotellerie', NULL, $v196_hotellerie_demarrage$## 🚀 Parcours de démarrage

LabFlow se découvre dans l'ordre : le menu latéral se **déverrouille progressivement** à mesure que votre compte se construit. Les entrées non encore accessibles sont grisées avec un cadenas 🔒, et un bandeau en haut du menu vous indique à chaque instant la prochaine action attendue.

### Comment le menu se déverrouille

| Ce que vous faites | Ce qui s'ouvre |
|---|---|
| Première connexion : changement du mot de passe | [[Mon:activite:pl:Nom]] |
| Création [[acc:activite:du premier:de la première]] [[nom:activite]] ou [[du:labo]] | [[Nom:referentiel]], Tableau de bord, Rapports, [[Nom:fournisseur:pl]], [[Nom:gerant:pl]] |
| Création [[acc:article:du premier:de la première]] [[nom:article]] [[au:referentiel]] | Espace [[Nom:produit:pl]] |
| [[acc:article:Premier:Première]] [[nom:article]] [[acc:article:sélectionné:sélectionnée]] pour [[un:activite]] | [[Nom:espace_activites]] |
| [[acc:article:Premier:Première]] [[nom:article]] [[acc:article:affecté:affectée]] [[au:labo]] | [[Nom:espace_labo]] |

[[Le:espace_vente:Nom]] apparaît quant à [[acc:espace_vente:lui:elle]] lorsque le module [[nom:vente]] est activé sur votre compte, qu'[[acc:article:un premier:une première]] [[nom:article]] existe [[au:referentiel]] **et qu'au moins [[un:activite]] est [[acc:activite:créé:créée]]** — [[acc:espace_vente:il:elle]] concerne [[le:vente]] [[du:activite:pl]] : un compte sans [[nom:activite]] ne [[acc:espace_vente:le:la]] voit pas, tout comme les liens [[Nom:transfert:pl]] et [[Titre:produit_vendable:pl]] ; [[le:espace_acheteurs:Nom]], dès que l'option [[Court:acheteur:pl]] est active. Dès la création de [[acc:activite:votre premier:votre première]] [[nom:activite]] ou de [[votre:labo]], l'application vous emmène automatiquement vers [[le:referentiel:Nom]], à la page Unités : c'est la suite logique du parcours.

### Actions pas à pas

1. **Créez vos sites** — Dans **[[Mon:activite:pl:Nom]]**, utilisez le bouton « Créer mon business » (proposé si votre abonnement inclut [[un:labo]]) pour créer [[votre:labo]] puis [[votre:activite:pl]] (restaurant, bar, spa, housekeeping…) en deux étapes, ou « + Ajouter [[mon:activite]] » sinon — sur un **compte [[nom:depot]]** (sans [[nom:activite]]), le bouton devient « 🏭 Créer [[mon:labo]] ». Choisissez l'option « Avec [[nom:labo]] » pour chaque [[nom:activite]] qu'[[acc:labo:il:elle]] approvisionne. Voir [[[Nom:activite:pl]]](#activites).
2. **Construisez [[le:referentiel]]** — Dans l'ordre : [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories), puis [[[Nom:article:pl]]](#referentiel-articles) (denrées, vins et spiritueux, savons et gels douche…) avec leur prix d'achat HT et leur taux de TVA. Le menu Ajout Dynamique accélère la création en masse ([import](#referentiel-import)).
3. **Assignez [[le:article:pl]]** — Indiquez [[acc:article:quels:quelles]] [[nom:article:pl]] sont [[acc:article:utilisé:utilisée:pl]] par chaque [[nom:activite]] (les spiritueux au bar, les gels douche au housekeeping) et par [[le:labo]] : c'est cette affectation qui déverrouille les espaces correspondants. Voir [[det:article:le:pl]][[[Nom:article:pl]]](#referentiel-articles).
4. **Mettez [[votre:stock:pl]] à niveau** — Saisissez [[votre:appro:pl]] dans [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites) et [[[Nom:stock]] [[Court:labo]]](#stock-labo) : quantités, prix, [[nom:fournisseur]]. C'est de là que viennent vos coûts réels.
5. **Créez [[votre:produit:pl]] et [[nom:fiche_technique:pl]]** — Dans l'Espace [[Nom:produit:pl]], composez [[votre:recette:pl]] (cocktails du bar, formules du petit-déjeuner, buffets…) : le coût de revient se calcule automatiquement. Voir [[[Nom:fiche_technique:pl]]](#fiches-techniques) et [le calcul du coût d'[[un:recette]]](#calc-cout-recette).
6. **Passez [[au:vente]]** — Configurez vos prix de vente ([Configuration [[Court:vente]]](#configuration-vente)) puis enregistrez [[votre:vente:pl]] ([Saisie [[du:vente:pl]]](#saisie-ventes)). Si l'option [[Court:acheteur:pl]] est active, configurez aussi vos [tarifs B2B](#acheteurs-tarifs) et votre [carnet [[de:acheteur:pl]]](#acheteurs-carnet).

### Points d'attention

:::attention
Tant qu'[[aucun:article]] n'est [[acc:article:assigné:assignée]] à [[un:activite]] ou [[au:labo]], les espaces correspondants restent verrouillés — même si [[votre:article:pl]] existent déjà [[au:referentiel]]. Le bandeau du menu vous le rappelle.
:::

:::astuce
Créez d'abord toutes vos unités (kg, litre, bouteille, flacon…) et familles avant d'attaquer [[le:article:pl]] : vous éviterez les allers-retours. Et à tout moment, le bouton « ? » présent sur les écrans ouvre ce manuel à la bonne page.
:::

### Voir aussi

- [Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]](#compte-activites-labos)
- [Suivi de l'onboarding](#onboarding-suivi)
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module)
- [Rôles & accès](#roles)
- [FAQ](#faq)$v196_hotellerie_demarrage$, NULL, 'brouillon', '2adc4119a69fe998011a4ac3ae326898'
    FROM manuel_sections s WHERE s.slug = 'demarrage'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_hotellerie := n_hotellerie + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'demarrage') THEN fiches_absentes := fiches_absentes || 'demarrage'::TEXT; END IF;
  -- ── hotellerie / lexique-pt ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'hotellerie', NULL, $v196_hotellerie_lexique_pt$## 🧩 Les 3 catégories [[de:pt:pl]]

[[Det:pt:un]]**[[nom:pt]] ([[court:pt]])** est [[un:produit]] [[acc:produit:fabriqué:fabriquée]] à partir d'[[un:recette]] et [[acc:produit:suivi:suivie]] en [[nom:stock]] : quand vous en produisez, LabFlow déduit automatiquement [[du:stock]] ce que [[le:recette]] utilise, [[le:article:pl]] comme [[le:produit_utilisable:pl]]. [[Tous:pt:les:court]] ne jouent pas le même rôle : l'application les répartit en **trois catégories** (utilisable, vendable, composé valorisé), que vous retrouverez partout sous les libellés « [[Nom:cat_pt_utilisable]] », « [[Nom:cat_pt_vendable]] » et « [[Nom:cat_pt_valorise]] ».

### Vue d'ensemble

| Catégorie | Où on le fabrique | Où on le vend | Comment il arrive en [[nom:stock]] |
|---|---|---|---|
| **Utilisable** (ex. sirop maison du bar) | Dans [[le:activite]] ou [[au:labo]], selon les affectations [[du:produit]] | Nulle part : [[acc:produit:il:elle]] est [[acc:produit:consommé:consommée]] dans [[le:recette:pl]] d'autres [[nom:produit:pl]] | Production sur place (saisie de la quantité produite) ou [[nom:transfert]] depuis [[le:labo]] ; [[acc:produit:certains:certaines]] n'arrivent que par cette voie |
| **Vendable** (ex. cocktail maison du bar) | Dans [[le:activite]] | Par [[le:activite]], lors de la saisie [[un:vente:pl]] | Production dans [[le:activite]], si le suivi [[de:stock]] est activé pour [[ce:produit]] ([[un:labo]] peut aussi [[acc:produit:le:la]] gérer et l'envoyer par [[nom:transfert]]) |
| **Composé valorisé** (ex. coffret de biscuits maison) | [[Au:labo]] uniquement | Par [[le:activite:pl]], tel quel, comme [[un:produit_valorise]] | Uniquement par [[nom:transfert]] depuis [[le:labo]] |

### 1. Les Utilisables — les intermédiaires de [[votre:recette:pl]]

[[Un:produit_utilisable]] est [[det:pt:un]]**[[nom:pt]] intermédiaire** : sirop maison du bar, confiture et granola du petit-déjeuner, vinaigrette… [[acc:produit_utilisable:Il:Elle]] n'est jamais [[acc:produit_utilisable:vendu:vendue]] [[acc:produit_utilisable:tel quel:telle quelle]] : [[acc:produit_utilisable:il:elle]] entre dans la composition [[un:produit_vendable:pl]], des composés valorisés, ou même d'autres [[nom:produit_utilisable:pl]].

Son **mode [[de:appro]]** se choisit à la création [[du:produit]] : soit chaque [[nom:activite]] peut [[acc:produit:le:la]] produire librement sur place (le sirop du bar), soit [[acc:produit:il:elle]] est [[acc:produit:fabriqué:fabriquée]] [[au:labo]] et [[le:activite:pl]] [[acc:produit:le:la]] reçoivent **uniquement par [[nom:transfert]]** (la confiture du petit-déjeuner). Dans ce second cas, la ligne [[du:stock]] [[du:activite]] porte l'indicateur « ⇄ [[Court:transfert]] uniquement » et la saisie directe de quantité y est bloquée.

### 2. Les Vendables — [[le:produit:pl]] [[acc:produit:fini:finie:pl]] [[du:activite]]

[[Un:pt]] vendable est [[det:produit:un]]**[[nom:produit]] [[acc:produit:fini:finie]] [[acc:produit:vendu:vendue]] par [[le:activite]]** : cocktail, petit-déjeuner continental, club sandwich… [[acc:pt:Il:Elle]] est [[acc:pt:défini:définie]] par [[un:fiche_technique]] et [[acc:pt:rattaché:rattachée]] obligatoirement à une catégorie [[de:produit]]. Le suivi en [[nom:stock]] est **optionnel** : activé [[nom:produit]] par [[nom:produit]], il permet de produire à l'avance (la production déduit [[le:ingredient:pl]] [[du:recette]]) puis de suivre les quantités disponibles.

### 3. Les Composés Valorisés — fabriqués [[au:labo]], vendus tels quels

[[Un:produit_compose]] [[acc:produit_compose:valorisé:valorisée]] est **[[acc:produit_compose:fabriqué:fabriquée]] [[au:labo]]** à partir d'[[un:recette]] ([[nom:article:pl]] et [[nom:produit_utilisable:pl]] [[du:labo]]), puis **[[acc:produit_compose:envoyé:envoyée]] par [[nom:transfert]]** vers [[le:activite:pl]] qui [[acc:produit_compose:le:la]] vendent **[[acc:produit_compose:tel quel:telle quelle]]**, comme [[un:produit_valorise]] (ex. le coffret de biscuits maison vendu au minibar). [[acc:produit_compose:Il:Elle]] se gère depuis l'écran [[det:produit_valorise:un:pl]][[[Nom:produit_valorise:pl]]](#articles-valorises), dans l'onglet « Composés », qui n'apparaît que si votre compte possède au moins [[un:labo]].

:::regle
Son coût se calcule sur les **prix d'achat [[du:labo]]** et son prix de revient est **figé au moment de la production** : les variations ultérieures des prix [[du:labo]] ne modifient pas la valeur des lots déjà fabriqués. Côté [[nom:activite]], [[acc:produit_compose:il:elle]] n'arrive en [[nom:stock]] **que par [[nom:transfert]]** — jamais par saisie directe.
:::

Dans [[le:stock]] [[du:labo]], [[ce:produit:pl]] sont repérables au badge « ◆ Composé valorisé ».

### Comment [[un:pt:court]] arrive en [[nom:stock]]

1. **Production** : dans l'écran [[de:stock]] ([[nom:activite]] ou [[nom:labo]]), saisissez la quantité produite sur la ligne [[du:pt:court]]. Aucun prix n'est demandé : le coût [[du:recette]] est calculé automatiquement (en TTC) et [[le:ingredient:pl]] — y compris [[le:produit_utilisable:pl]] — sont [[acc:ingredient:déduit:déduite:pl]] [[du:stock]].
2. **[[Nom:transfert]]** : pour [[le:produit:pl]] [[acc:produit:fabriqué:fabriquée:pl]] [[au:labo]], l'envoi vers [[le:activite]] fait baisser [[le:stock]] de départ et monter [[acc:stock:celui:celle]] [[du:activite]]. Cet envoi se fait au coût [[du:labo]].

:::astuce
Chaque production reçoit une **référence automatique** construite à partir du nom [[du:produit]] et de l'année : initiales de chaque mot pour un nom multi-mots (« Sirop Grenadine », fabriqué en 2026, donne SG-26), trois premières lettres pour un nom d'un seul mot (« Granola » donne GRA-26). Vous la retrouverez dans les historiques pour tracer vos fabrications — voir [La traçabilité](#calc-tracabilite).
:::

:::attention
Vérifiez [[le:stock]] de [[votre:ingredient:pl]] avant de lancer une production : les quantités consommées par [[le:recette]] sont déduites immédiatement. Dans la colonne [[du:stock]] [[acc:stock:actuel:actuelle]], la ventilation détaille d'ailleurs les mouvements : [[court:appro]], [[nom:transfert:pl]], [[nom:perte:pl]] et consommation [[court:pt]].
:::

### Qui apparaît où

- **Dans [[le:stock:pl]]** : [[le:pt:pl:court]] figurent aux côtés [[un:article:pl]], [[acc:pt:regroupé:regroupée:pl]] dans leur catégorie. Côté [[nom:labo]], les composés portent le badge « ◆ Composé valorisé » ; côté [[nom:activite]], [[le:pt:pl:court]] d'origine [[nom:labo]] affichent « ⇄ [[Court:transfert]] uniquement ».
- **Dans les historiques et les exports** : [[le:pt:pl:court]] sont [[acc:pt:regroupé:regroupée:pl]] sous les trois catégories citées plus haut. Une catégorie n'apparaît que si elle contient au moins [[un:produit]].
- **Dans les filtres** : le filtre « Catégorie » des historiques [[de:appro:pl]] (dans [[le:activite:pl]] comme dans [[le:labo:pl]]) et de l'historique [[un:perte:pl]] [[du:labo]] propose **trois options dédiées** — [[Nom:cat_pt_utilisable]], [[Nom:cat_pt_vendable]], [[Nom:cat_pt_valorise]] — en plus des catégories [[de:article:pl]]. En sélectionnant l'une d'elles, la liste « [[Nom:article]] » affiche [[le:pt:pl]] [[acc:pt:correspondant:correspondante:pl]].

### Voir aussi

- [Lexique LabFlow de A à Z](#lexique) — les définitions de tous les termes
- [[[Titre:produit_utilisable:pl]]](#produits-utilisables) et [[[Titre:produit_vendable:pl]]](#produits-vendables) — créer et gérer [[votre:pt:pl:court]]
- [[[Nom:produit_valorise:pl]]](#articles-valorises) — dont l'onglet « Composés »
- [La production d'[[un:pt:court]]](#calc-production-pt) et [[[Le:transfert:pl]]](#calc-transferts) — les calculs détaillés
- [[[Nom:stock]] [[Court:labo]]](#stock-labo), [[[Nom:transfert:pl]]](#transferts) et [Historiques](#historique) — les écrans concernés$v196_hotellerie_lexique_pt$, NULL, 'brouillon', '8cfa18e17485e91567ac4fa01fe9610f'
    FROM manuel_sections s WHERE s.slug = 'lexique-pt'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_hotellerie := n_hotellerie + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'lexique-pt') THEN fiches_absentes := fiches_absentes || 'lexique-pt'::TEXT; END IF;
  -- ── hotellerie / lexique ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'hotellerie', NULL, $v196_hotellerie_lexique$## 📖 Lexique LabFlow de A à Z

Ce lexique rassemble tout le vocabulaire utilisé dans LabFlow et dans ce manuel. Chaque terme est défini en une ou deux phrases, avec un exemple concret quand cela aide. Les montants sont exprimés en DT (dinar tunisien).

:::astuce
Utilisez la recherche de votre navigateur (Ctrl+F) pour retrouver un terme rapidement. Les notions liées [[au:pt:pl]] sont approfondies dans [Les 3 catégories [[de:pt:pl]]](#lexique-pt).
:::

| Terme | Définition |
|---|---|
| **[[Court:appro]] (approvisionnement)** | Entrée de marchandise dans [[le:stock]] : vous saisissez la quantité, le prix d'achat HT et le taux de TVA. [[Un:appro:court]] peut provenir d'un achat auprès d'[[un:fournisseur]], d'[[un:transfert]] depuis [[le:labo]] ou d'une production [[de:pt]]. |
| **Avenant** | Modification de votre contrat d'abonnement : ajout [[de:activite:pl]], [[de:labo:pl]] ou [[de:gerant:pl]], activation ou changement de palier de l'option [[Court:acheteur:pl]]… L'avenant vous est envoyé par e-mail pour signature électronique et le document signé reste téléchargeable. |
| **Base [[court:acheteur:pl]]** | Option de l'abonnement, facturée par palier selon la taille de votre carnet : jusqu'à 10, 20, 50 ou 100 [[nom:acheteur:pl]]. Elle active [[le:espace_acheteurs:Nom]]. Le passage à un palier supérieur se demande depuis la page Demandes ; le nouveau palier remplace l'ancien. On l'appelle aussi l'option [[Court:acheteur:pl]]. |
| **Catégorie** | Deux notions distinctes : la *catégorie [[de:article:pl]]* ([[nom:referentiel]]) affine une famille (ex. « Jus de fruits » dans la famille « Petit-déjeuner ») ; la *catégorie [[de:produit:pl]]* ([[Nom:espace_produits]]) classe ce qui se vend (ex. « Cocktails ») et est typée vendable, [[nom:supplement]] ou valorisé. |
| **Charge** | Dépense d'exploitation hors matière première : énergie, blanchisserie, main-d'œuvre… Saisie dans [[le:espace_vente:Nom]], elle affine l'analyse de rentabilité au-delà [[acc:cout_matiere:du seul:de la seule]] [[nom:cout_matiere]]. |
| **[[Nom:acheteur]]** | Entreprise ou établissement (B2B) enregistré dans votre carnet [[de:acheteur:pl]] : société voisine, organisateur de séminaires, autre hôtel du groupe… [[acc:acheteur:Il:Elle]] peut être [[acc:acheteur:invité:invitée]] sur son portail pour commander en ligne. [[Le:vente:pl]] [[au:acheteur:pl]] partent toujours [[du:stock]] d'[[un:labo]] et donnent lieu à une facture [[de:vente]]. |
| **Coefficient multiplicateur** | Rapport entre le prix de vente et [[le:cout_matiere]] d'[[un:produit]]. Un club sandwich dont la matière coûte 4 DT et vendu 12 DT a un coefficient de 3. |
| **Commande [[compl:acheteur]]** | Commande passée en ligne par le client sur son portail, ou saisie directement en [[nom:vente]] [[acc:vente:manuel:manuelle]]. Elle suit quatre états : en attente → expédiée ([[le:stock]] [[du:labo]] est [[acc:stock:déduit:déduite]] et la facture émise) → livrée ; une commande peut être annulée, [[le:stock]] est alors [[acc:stock:réintégré:réintégrée]]. |
| **Composé valorisé** | [[Nom:pt]] [[acc:pt:fabriqué:fabriquée]] [[au:labo]] puis [[acc:pt:envoyé:envoyée]] par [[nom:transfert]] vers [[le:activite:pl]], où [[acc:pt:il:elle]] se vend [[acc:pt:tel quel:telle quelle]] (ex. un coffret de biscuits maison, revendu au minibar des chambres). Son prix de revient est figé au coût [[du:labo]] au moment de la production. |
| **Compte [[nom:depot]]** | Type de compte sans [[nom:activite]] : [[un:labo]] et la base [[court:acheteur:pl]]. [[Le:labo]] fabrique et vend directement aux professionnels — par exemple pour fournir les hôtels d'un groupe ou des entreprises voisines. |
| **[[Nom:produit_utilisable]]** | [[Nom:pt]] intermédiaire, non [[acc:pt:vendu:vendue]] [[acc:pt:tel quel:telle quelle]], [[acc:pt:réutilisé:réutilisée]] dans d'autres [[nom:recette:pl]] : sirop maison du bar, confiture du petit-déjeuner, granola… Son coût se répercute automatiquement dans [[tous:produit:les]] qui l'utilisent. |
| **[[Nom:labo]]** | Lieu de production et de stockage commun à [[votre:activite:pl]], rattaché au compte, qui regroupe par exemple la production des repas et l'économat. [[acc:labo:Il:Elle]] achète et fabrique en gros, alimente [[le:activite:pl]] par [[nom:transfert]] — et, si l'option [[Court:acheteur:pl]] est active, vend directement aux professionnels. Un compte peut avoir zéro, [[acc:labo:un:une]] ou plusieurs [[nom:labo:pl]]. |
| **Domaine d'activité** | Secteur métier de votre compte (pour vous, l'hôtellerie). Il détermine le catalogue [[de:article:pl]] qui vous est proposé à la création du compte. |
| **Famille** | Regroupement de catégories [[de:article:pl]] (« Petit-déjeuner », « Hygiène et accueil »…) portant deux propriétés clés : *consommable* (nom de la colonne à l'écran : [[son:article:pl]] peuvent entrer dans [[le:recette:pl]] ; à ne pas confondre avec [[le:produit_utilisable:pl]]) et *vendable* ([[nom:vente]] en l'état). Ces propriétés déterminent où chaque [[nom:article]] peut être [[acc:article:utilisé:utilisée]]. |
| **[[Nom:recette]]** | Composition d'[[un:produit]] : [[nom:article:pl]] et [[nom:produit_utilisable:pl]] avec leurs [[nom:portion:pl]]. [[acc:recette:Il:Elle]] sert à la fois au calcul du coût de revient et à la déduction [[du:stock]]. |
| **[[Nom:fiche_technique]]** | Version chiffrée d'[[un:recette]] : liste [[un:article:pl]] et [[nom:produit_utilisable:pl]] avec leurs [[nom:portion:pl]], et calcul automatique du coût de revient matière. C'est l'outil central du chiffrage de ce que vendent [[votre:activite:pl]]. |
| **Formule d'activités** | Niveau d'abonnement de [[votre:activite:pl]]. *Activité Basique* : [[nom:stock]], [[nom:appro:pl]] et [[nom:vente:pl]] [[de:article:pl]] [[acc:article:valorisé:valorisée:pl]], sans [[le:espace_produits:Nom]] [[acc:espace_produits:complet:complète]]. *Activité Premium* : tout LabFlow, y compris [[nom:produit_compose:pl]], [[nom:fiche_technique:pl]] et production. Le passage en Premium se demande depuis Mon abonnement ou la page Demandes. |
| **[[Nom:fournisseur]]** | Tiers auprès duquel vous achetez vos marchandises : grossiste, torréfacteur, distributeur d'eaux minérales… Il est associé [[au:appro:pl]] et aux factures pour tracer l'origine de chaque achat. |
| **[[Nom:article]]** | Élément de base [[du:referentiel]] : [[nom:ingredient]] ou [[nom:produit]] [[acc:produit:acheté:achetée]] (café, jus de fruits, eau minérale, savonnettes…), défini par un nom, une unité et une catégorie. [[Le:stock]], [[le:recette:pl]] et les coûts s'appuient tous sur [[le:article:pl]]. |
| **HT / TTC** | Hors taxes / toutes taxes comprises. Dans LabFlow, les prix d'achat se saisissent en HT avec le taux de TVA ; l'affichage courant ([[nom:stock]], [[nom:pt:pl]], rapports, tableaux de bord) est en TTC. |
| **[[Nom:inventaire]]** | Comptage physique [[du:stock]] à une date donnée. La quantité réelle saisie devient la nouvelle référence [[du:stock]] ; [[le:stock]] théorique [[acc:stock:affiché:affichée]] pendant la saisie permet de repérer les écarts. |
| **[[Nom:transfert]]** | Mouvement de marchandise [[du:labo]] vers [[un:activite]] : [[le:stock]] de départ diminue, [[acc:stock:celui:celle]] [[du:activite]] augmente. Ce mouvement se fait au coût [[du:labo]]. C'est la seule voie d'entrée en [[nom:stock]], côté [[nom:activite]], [[un:produit:pl]] [[acc:produit:fabriqué:fabriquée:pl]] [[au:labo]]. |
| **[[Nom:marge]]** | Différence entre le prix de vente et [[le:cout_matiere]]. Un jus pressé vendu 8 DT avec 2 DT de matière dégage 6 DT [[de:marge]] [[acc:marge:brut:brute]]. |
| **Mode de compte** | État d'accès du compte selon la situation de l'abonnement : *actif* (toutes les fonctions), *lecture seule* (consultation sans modification) ou *bloqué / désactivé* (accès restreint). |
| **[[Nom:perte]] (avarie / déchet)** | Marchandise sortie [[du:stock]] sans être vendue : *avarie* ([[nom:produit]] [[acc:produit:périmé:périmée]], [[acc:produit:abîmé:abîmée]], impropre) ou *déchet* (casse, restes du buffet, ratés de production). Chaque [[nom:perte]] est [[acc:perte:valorisé:valorisée]] en TTC dans les rapports. |
| **PMP** | Prix moyen pondéré : prix unitaire moyen d'[[un:article]], pondéré par les quantités achetées. 10 kg achetés à 8 DT puis 5 kg à 11 DT donnent un PMP de 9 DT/kg ; il sert à valoriser [[le:stock]] et [[le:transfert:pl]]. |
| **Portail [[court:acheteur]]** | Espace en ligne ouvert à chacun de vos clients B2B invités : il y consulte le catalogue à ses tarifs, passe commande et télécharge ses factures. Il ne voit jamais vos quantités en [[nom:stock]] ; le vendeur ajuste les quantités, ou retire des lignes, à l'expédition. |
| **[[Nom:pt]] ([[court:pt]])** | [[Nom:produit]] [[acc:produit:fabriqué:fabriquée]] à partir d'[[un:recette]] et [[acc:produit:suivi:suivie]] en [[nom:stock]] : sa production déduit automatiquement [[le:ingredient:pl]] [[acc:ingredient:consommés:consommées]], y compris [[le:produit_utilisable:pl]] qu'[[acc:recette:il:elle]] contient. Trois catégories existent : utilisables, vendables et composés valorisés. |
| **[[Nom:prestataire]]** | Canal de vente tiers (plateforme de livraison de repas…) pour lequel vous définissez un prix de vente dédié, saisi manuellement dans la configuration [[de:vente]]. |
| **[[Nom:produit_valorise]]** | [[Nom:produit]] [[acc:produit:vendu:vendue]] [[acc:produit:tel quel:telle quelle]], sans décomposition [[de:recette]] au moment [[du:vente]] : [[nom:article]] de revente (ex. eau minérale du minibar) ou [[nom:produit_compose]] [[acc:produit_compose:fabriqué:fabriquée]] [[au:labo]]. |
| **[[Nom:produit_vendable]]** | [[Nom:produit]] [[acc:produit:fini:finie]] [[acc:produit:défini:définie]] par [[un:fiche_technique]] et [[acc:produit:vendu:vendue]] par [[un:activite]] : petit-déjeuner, cocktail, club sandwich, formule séminaire… [[acc:produit:Il:Elle]] est obligatoirement [[acc:produit:rattaché:rattachée]] à une catégorie [[de:produit]]. |
| **PV (prix de vente)** | Prix auquel [[un:produit]] est [[acc:produit:vendu:vendue]] au client. LabFlow distingue le prix direct ([[nom:vente]] sur place, à la clientèle de l'hôtel) et les prix propres à chaque [[nom:prestataire]]. |
| **[[Nom:food_cost]]** | Part [[du:cout_matiere]] (matières premières consommées) dans le prix de vente d'un petit-déjeuner, d'un cocktail ou d'un plateau. Un petit-déjeuner continental vendu 15 DT dont [[le:ingredient:pl]] coûtent 4,500 DT a [[un:food_cost]] de 30 %. |
| **[[Nom:referentiel]]** | Socle de données du compte : unités, familles, catégories et [[nom:article:pl]]. Tout le reste ([[nom:stock]], [[nom:recette:pl]], [[nom:vente:pl]]) s'appuie dessus. |
| **[[Nom:gerant]]** | Utilisateur délégué par le propriétaire du compte, par exemple la gouvernante générale ou le responsable du bar. Son accès est limité [[au:activite:pl]] et [[au:labo:pl]] qui lui sont affectés. |
| **[[Nom:activite]]** | Département de l'hôtel exploité par votre compte : restaurant, bar, spa, housekeeping… Un compte gère [[acc:activite:un:une]] ou plusieurs [[nom:activite:pl]], [[acc:activite:chacun:chacune]] avec [[son:stock]], [[son:produit:pl]], ses prix et [[son:vente:pl]]. |
| **Seuil d'alerte** | Quantité minimale définie pour [[un:article]] ou [[un:pt]] : lorsque [[le:stock]] passe en dessous, la ligne est signalée pour réapprovisionnement. Pour [[le:pt:pl]], le seuil se règle par [[nom:activite]]. |
| **[[Nom:stock]] théorique** | Quantité calculée par l'application : [[acc:inventaire:dernier:dernière]] [[nom:inventaire]] + [[nom:appro:pl]] − [[nom:perte:pl]] − [[nom:transfert:pl]] [[acc:transfert:sortant:sortante:pl]] − consommations ([[nom:vente:pl]], productions). [[Le:inventaire]] [[acc:stock:le:la]] réconcilie avec [[le:stock]] [[acc:stock:réel:réelle]] [[acc:stock:compté:comptée]]. |
| **[[Nom:supplement]]** | [[Nom:produit_vendable]] complémentaire [[acc:produit_vendable:proposé:proposée]] en plus d'[[un:produit]] [[acc:produit:principal:principale]] : jus pressé ajouté au petit-déjeuner, sirop dans un café, extra… [[acc:produit_vendable:Il:Elle]] a [[acc:fiche_technique:son propre:sa propre]] [[nom:fiche_technique]] et son propre prix de vente. |
| **Timbre fiscal** | Droit de timbre ajouté au total d'une facture [[de:vente]] [[au:acheteur:pl]] (montant fixe en DT, désactivable [[au:vente]]). |
| **TVA** | Taxe sur la valeur ajoutée. Le taux se saisit [[au:appro]], [[nom:article]] par [[nom:article]], et sert au calcul des prix TTC. |
| **Unité** | Mesure dans laquelle se compte [[un:article]] : kg, litre, gramme, pièce, bouteille… Utilisez la même unité à l'achat et en [[nom:recette]] pour obtenir des coûts justes. |
| **Valorisation** | Expression en argent d'une quantité : valeur [[du:stock]], d'[[un:perte]] ou d'une production, obtenue en multipliant la quantité par le prix unitaire (PMP ou coût [[de:recette]]). |

### Voir aussi

- [Les 3 catégories [[de:pt:pl]]](#lexique-pt) — le détail [[un:pt:pl:court]] utilisables, vendables et [[acc:pt:composés valorisés:composées valorisées]]
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module) — [[le:vente]] aux professionnels de A à Z
- [Un compte, [[un:activite:pl]], [[un:labo:pl]]](#compte-activites-labos) et [Rôles & accès](#roles) — l'organisation de votre compte
- [Le coût d'[[un:recette]]](#calc-cout-recette), [Le PMP](#calc-pmp) et [HT et TTC](#calc-ht-ttc) — les calculs expliqués pas à pas
- [Les seuils d'alerte](#calc-seuils) et [La valeur [[du:stock]]](#calc-valeur-stock)$v196_hotellerie_lexique$, NULL, 'brouillon', 'abe5dd9e375046d8e59f783b5c8a46c5'
    FROM manuel_sections s WHERE s.slug = 'lexique'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_hotellerie := n_hotellerie + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'lexique') THEN fiches_absentes := fiches_absentes || 'lexique'::TEXT; END IF;
  -- ── hotellerie / onboarding-configuration ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'hotellerie', NULL, $v196_hotellerie_onboarding_configuration$## 🧭 Configuration initiale

À votre première connexion, LabFlow vous guide pas à pas pour mettre votre espace en ordre de marche. Le point de départ est la page **[[Mon:activite:pl]]** ; le menu latéral s'ouvre progressivement au fil de votre avancement.

### Ce que vous voyez

- au départ, une carte de bienvenue « Démarrez [[votre:activite]] » rappelant ce que votre abonnement inclut (nombre [[de:activite:pl]] et [[de:labo:pl]]), avec le bouton **✨ Créer mon business** si votre abonnement inclut [[un:labo]], ou **+ Ajouter [[mon:activite]]** sinon — pour un **compte [[nom:depot]]**, sans [[nom:activite]], la carte devient « Démarrez [[votre:labo]] » avec le bouton **🏭 Créer [[mon:labo]]** ;
- des compteurs indiquant l'utilisation de votre abonnement (par exemple 1 / 3 [[nom:activite:pl]]) ;
- dans le menu latéral, un bandeau qui vous indique la prochaine étape à accomplir, tant que la configuration n'est pas terminée.

### Actions pas à pas

1. **Créez [[votre:labo]] et [[votre:activite:pl]].** Le bouton « Créer mon business » ouvre un assistant en deux étapes : d'abord [[det:labo_long:le]]**[[Nom:labo_long]]** (nom, référence unique, adresse — vous pouvez cocher « Passer cette étape » si vous n'en avez pas encore besoin), puis [[det:activite:votre:pl]]**[[Nom:activite:pl]]** (nom, adresse et, si vous en créez [[acc:labo:un:une]], le choix « Avec [[nom:labo]] » ou « Sans [[nom:labo]] » pour [[acc:activite:chacun:chacune]]). Ajoutez autant [[de:activite:pl]] (restaurant, bar, spa, housekeeping…) que votre abonnement le permet, puis validez avec **Enregistrer tout**.
2. **Constituez [[votre:referentiel]].** Dès [[acc:activite:votre premier:votre première]] [[nom:activite]] ou [[votre:labo]] [[acc:labo:créé:créée]], [[le:referentiel:Nom]] se déverrouille dans le menu : créez vos unités, familles et catégories, puis [[votre:article:pl]] (nom, unité, catégorie) — denrées, vins et spiritueux, savons et gels douche…
3. **Affectez [[votre:article:pl]].** Sélectionnez, pour chaque [[nom:activite]] et pour [[le:labo]], [[le:article:pl]] qui y sont [[acc:article:utilisé:utilisée:pl]] : les spiritueux au bar, les gels douche au housekeeping. Les espaces [[Pl:activite]] et [[Court:labo]] se déverrouillent dès qu'[[un:article]] leur est [[acc:article:affecté:affectée]] ; l'Espace [[Nom:produit:pl]] s'ouvre dès [[acc:article:votre premier:votre première]] [[nom:article]] [[acc:article:créé:créée]].
4. **Saisissez vos [[acc:appro:premier:première:pl]] [[nom:appro:pl]].** Rendez-vous dans [[le:stock]] pour enregistrer vos premières entrées (prix d'achat saisis en HT avec leur taux de TVA) : vos quantités et la valeur de [[votre:stock]] commencent à vivre.
5. **Consultez votre tableau de bord.** Il devient accessible dès la création de [[votre:activite:pl]] et se remplit au fil de vos saisies.

### Points d'attention

:::regle
**Compte [[nom:depot]]** (sans [[nom:activite]], avec la base [[court:acheteur:pl]]) : l'assistant se résume à la création [[du:labo]]. Constituez ensuite [[le:referentiel]], affectez [[votre:article:pl]] [[au:labo]], puis configurez [[det:espace_acheteurs:le]][[[Nom:espace_acheteurs]]](#acheteurs-module) : [[nom:article:pl]] commandables, carnet [[de:acheteur:pl]] et tarifs B2B — votre suivi de mise en route intègre cette étape.
:::

:::astuce
La progression est entièrement automatique : l'application détecte vos données réelles ([[nom:activite:pl]] [[acc:activite:créé:créée:pl]], [[nom:article:pl]] [[acc:article:affecté:affectée:pl]]) et ouvre les menus correspondants. Rien n'est à valider manuellement, et vous ne pouvez pas sauter une étape par erreur.
:::

:::attention
Le nombre [[de:activite:pl]] et [[de:labo:pl]] est plafonné par votre abonnement (compteurs affichés en haut de la page). Une fois la limite atteinte, le bouton « ⚡ Ajouter [[nom:activite:pl]] » vous oriente vers une demande d'ajout de capacité — voir [Avenants & résiliation](#onboarding-avenants).
:::

### Voir aussi

- [Compte, [[nom:activite:pl]] et [[nom:labo:pl]]](#compte-activites-labos)
- [Le module [[Court:acheteur:pl]]](#acheteurs-module)
- [Unités](#referentiel-unites) · [[[Nom:article:pl]]](#referentiel-articles)
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites)
- [Tableau de bord](#dashboard)$v196_hotellerie_onboarding_configuration$, NULL, 'brouillon', '794a5b32a2476bbe4e0088e07744f3b0'
    FROM manuel_sections s WHERE s.slug = 'onboarding-configuration'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_hotellerie := n_hotellerie + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-configuration') THEN fiches_absentes := fiches_absentes || 'onboarding-configuration'::TEXT; END IF;
  -- ── hotellerie / roles ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'hotellerie', NULL, $v196_hotellerie_roles$## 👤 Rôles & accès

Un compte LabFlow distingue deux rôles internes : le **client**, propriétaire du compte (la direction de l'hôtel ou du groupe), et [[det:gerant:le]]**[[nom:gerant]]**, collaborateur invité sur un périmètre précis (le bar, le spa, [[le:labo]]…). S'y ajoutent [[det:acheteur:le]]**[[nom:acheteur]]** — un établissement extérieur (résidence, clinique, cantine d'entreprise…) qui n'accède qu'à son portail de commande — et le **mode du compte** (actif, lecture seule, bloqué), qui dépend de la situation de votre abonnement.

### Le client (propriétaire)

Le client dispose de l'accès complet : [[nom:activite:pl]] et [[nom:labo:pl]], [[nom:referentiel]], [[nom:produit:pl]] et [[nom:fiche_technique:pl]], [[nom:stock:pl]], [[nom:vente:pl]], rapports, [[nom:fournisseur:pl]] — ainsi que les pages réservées au propriétaire :

- **[[Mon:activite:pl:Nom]]** : création et modification des sites ;
- **[[Nom:gerant:pl]]** : invitation et gestion des collaborateurs ;
- **Mon abonnement** et **Historique paiements** ;
- dans [[le:espace_vente:Nom]] : **Config Charges** et **Rapport [[Nom:vente]]**.

### [[Le:gerant]] (collaborateur)

[[Le:gerant]] est [[acc:gerant:créé:créée]] par le client depuis la page [[[Nom:gerant:pl]]](#gerants) : nom, téléphone, e-mail, et surtout **[[le:activite:pl]] et [[nom:labo:pl]] qui lui sont assignés** (au moins un est obligatoire) — par exemple le bar pour le premier barman, le housekeeping pour la gouvernante générale. [[acc:gerant:Il:Elle]] reçoit une invitation par e-mail et active [[acc:gerant:lui-même:elle-même]] son compte.

- Son périmètre est limité [[au:activite:pl]] et [[nom:labo:pl]] affectés : [[acc:gerant:il:elle]] y travaille au quotidien ([[nom:stock:pl]], [[nom:appro:pl]], [[nom:inventaire:pl]], [[nom:vente:pl]]…).
- [[acc:gerant:Il:Elle]] accède aussi [[det:espace_acheteurs:au]]**[[Nom:espace_acheteurs]]** si l'option correspondante est active (le carnet est commun au compte) ; [[son:vente:pl]] [[au:acheteur:pl]] sont [[acc:vente:limité:limitée:pl]] [[au:labo:pl]] de son périmètre.
- [[acc:gerant:Il:Elle]] ne voit pas les pages réservées au propriétaire listées ci-dessus ; sa page « Mon abonnement » est un résumé en lecture seule (statut du compte et configuration incluse).
- Dans les historiques ([[nom:appro:pl]], [[nom:perte:pl]], [[nom:inventaire:pl]]), [[acc:gerant:il:elle]] ne peut modifier ou supprimer que les opérations qu'[[acc:gerant:il:elle]] a [[acc:gerant:lui-même:elle-même]] saisies.
- Le client peut à tout moment [[acc:gerant:le:la]] **désactiver** (accès suspendu, sans suppression), [[acc:gerant:le:la]] **réactiver**, renvoyer l'invitation ou [[acc:gerant:le:la]] supprimer.

Jusqu'à 3 comptes [[nom:gerant:pl]] sont inclus ; au-delà, chaque [[nom:gerant]] supplémentaire est [[acc:gerant:facturé:facturée]] **80 DT/mois** et [[acc:gerant:soumis:soumise]] à validation, dans la limite du quota de votre abonnement.

### [[Le:acheteur]] (portail de commande)

Si l'option [[Court:acheteur:pl]] est active, chaque [[nom:acheteur]] de votre carnet (une résidence, une clinique…) peut être **[[acc:acheteur:invité:invitée]]** à créer son compte portail. Ce rôle est externe et volontairement très limité :

- [[acc:acheteur:il:elle]] accède uniquement au **portail [[court:acheteur]]** : catalogue à ses tarifs, passage de commande, suivi de ses commandes et téléchargement de ses factures ;
- [[acc:acheteur:il:elle]] ne voit **rien de votre gestion** : ni vos quantités en [[nom:stock]], ni vos prix d'achat, ni aucune autre page de LabFlow ;
- vous gérez ses accès depuis le [Carnet [[de:acheteur:pl:Nom]]](#acheteurs-carnet) : invitation, renvoi de l'invitation, désactivation ou suppression.

### Les modes du compte

| Mode | Effet |
|---|---|
| Actif | Compte opérationnel, toutes les fonctions disponibles |
| Lecture seule | Consultation possible, mais création et modification bloquées (abonnement impayé) |
| Bloqué / Désactivé | Accès suspendu |

- En **lecture seule**, un bandeau orange en haut de l'écran vous en informe, avec un bouton « Voir mon abonnement » pour régulariser.
- En **bloqué / désactivé**, un bandeau rouge vous invite à contacter l'administrateur.

### Points d'attention

:::attention
Le mode du compte s'applique à tous ses utilisateurs : si le compte passe en lecture seule, [[le:gerant:pl]] sont [[acc:gerant:eux:elles]] aussi [[acc:gerant:limité:limitée:pl]] à la consultation.
:::

:::astuce
En lecture seule, vos données restent consultables : rien n'est perdu. Régularisez le paiement depuis Mon abonnement pour retrouver toutes les fonctions.
:::

### Voir aussi

- [[[Nom:gerant:pl]]](#gerants) — créer et gérer les collaborateurs
- [Le portail [[court:acheteur]]](#acheteurs-portail) — l'espace de commande de vos clients extérieurs
- [Tableau de bord [[nom:gerant]]](#dashboard-gerant)
- [Abonnement](#abonnement)
- [Support](#support)
- [Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]](#compte-activites-labos)$v196_hotellerie_roles$, NULL, 'brouillon', 'd4c7e9e042403593214fc4bdf068a034'
    FROM manuel_sections s WHERE s.slug = 'roles'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_hotellerie := n_hotellerie + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'roles') THEN fiches_absentes := fiches_absentes || 'roles'::TEXT; END IF;
  -- ── usine / calc-cout-recette ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'usine', NULL, $v196_usine_calc_cout_recette$## 🧮 Le coût de revient d'[[un:recette]]

[[Le:fiche_technique]] additionne ce que coûtent les lignes [[du:recette]] : chaque [[nom:ingredient]] compte pour [[son:portion]] [[acc:portion:multiplié:multipliée]] par son prix unitaire TTC, et chaque sous-produit compte pour [[son:portion]] [[acc:portion:multiplié:multipliée]] par son propre coût de revient, calculé de la même façon. Le calcul descend ainsi dans [[le:recette]] du sous-produit, puis de ses éventuels sous-produits, jusqu'[[acc:ingredient:au dernier:à la dernière]] [[nom:ingredient]].

### Les paramètres qui influencent le résultat

- **[[Le:portion:pl]] [[du:recette]]** : la quantité de chaque [[nom:ingredient]] et de chaque sous-produit nécessaire pour une unité produite (une assiette, un kilo d'émail…).
- **Le prix unitaire de chaque [[nom:ingredient]]**, selon le mode choisi au moment de générer [[le:fiche_technique]] (carte *[[Court:fiche_technique]] [[Court:stock]]* avec ses méthodes *DP* / *PMP*, ou carte *[[Court:fiche_technique]] Manuel*) :
  - **Prix moyen pondéré (PMP)** — méthode *PMP* : la moyenne pondérée des prix TTC de vos achats (et [[nom:transfert:pl]] [[acc:transfert:reçu:reçue:pl]], côté [[nom:activite]]) depuis [[acc:inventaire:le dernier:la dernière]] [[nom:inventaire]] — voir [Le prix moyen pondéré](#calc-pmp). C'est ce prix qui sert à valoriser les productions.
  - **Dernier prix** — méthode *DP* : le dernier prix TTC enregistré pour [[le:article]].
  - **Prix manuel** — carte *[[Court:fiche_technique]] Manuel* : un prix que vous saisissez vous-même, mémorisé par base de prix, pour simuler un coût (une nouvelle argile avant de la commander, par exemple).
- **La base de prix choisie** : [[le:fiche_technique]] se génère pour une ou plusieurs bases ([[nom:activite:pl]] ou [[nom:labo:pl]] [[acc:labo:assigné:assignée:pl]] [[au:produit]]) — les prix proviennent [[du:stock]] de chaque base, avec repli sur les prix [[du:labo]] [[acc:labo:lié:liée]] quand [[un:article]] n'a pas encore de prix côté [[nom:activite]]. [[Un:produit]] [[acc:produit:fabriqué:fabriquée]] [[au:labo]] se calcule uniquement sur celles de ses bases qui sont [[un:labo:pl]].
- **[[Le:portion:pl]] [[acc:portion:personnalisé:personnalisée:pl]]** : au moment d'une production, vous pouvez ajuster ponctuellement les quantités réellement consommées (un émaillage plus épais, par exemple) ; les déductions [[de:stock]] suivent ces quantités, sans modifier [[le:fiche_technique]] (la production entre en [[nom:stock]] au coût standard [[du:recette]]).

:::formule Coût de revient d'[[un:recette]]
Coût total = somme([[nom:portion]] [[nom:ingredient]] × prix unitaire TTC) + somme([[nom:portion]] sous-produit × coût de revient du sous-produit)
note: le coût de chaque sous-produit est calculé récursivement avec la même règle, aux mêmes prix.
:::

:::exemple
[[Nom:recette]] « Assiette plate Ø 27 cm » (pour 1 assiette), [[acc:recette:valorisé:valorisée]] au PMP TTC [[du:labo]] :

- Argile de grès : 1,200 kg × 0,500 DT/kg = 0,600 DT
- Engobe coloré : 0,050 kg × 4,000 DT/kg = 0,200 DT
- Décalcomanie (décor) : 1 pièce × 0,450 DT/pièce = 0,450 DT
- Émail blanc (sous-produit) : 0,060 kg × 6,550 DT/kg = 0,393 DT

Le coût de l'émail blanc (6,550 DT/kg) est lui-même calculé à partir de [[acc:recette:son propre:sa propre]] [[nom:recette]], pour 1 kg d'émail : fritte 0,700 kg × 6,000 DT = 4,200 DT ; kaolin 0,200 kg × 1,500 DT = 0,300 DT ; oxyde de zirconium 0,100 kg × 20,500 DT = 2,050 DT.

**Coût de revient de l'assiette = 0,600 + 0,200 + 0,450 + 0,393 = 1,643 DT TTC.**
:::

### Ce qui peut faire varier le résultat

- Chaque nouvel achat à un prix différent déplace le PMP, donc le coût de revient recalculé.
- [[Un:inventaire]] redémarre la période de calcul du PMP : le coût peut évoluer juste après.
- Si [[un:ingredient]] n'a encore aucun prix connu (jamais [[acc:ingredient:reçu:reçue]]), sa part est comptée à zéro : le coût affiché est alors incomplet.
- La modification ou la suppression d'une ligne [[de:appro]] passée change le PMP, donc le coût, rétroactivement.
- [[Un:recette]] ne peut pas se contenir [[acc:recette:lui-même:elle-même]] (directement ou via ses sous-produits) : le calcul le refuse.

### Voir aussi

- [[[Nom:fiche_technique:pl]]](#fiches-techniques)
- [Le prix moyen pondéré](#calc-pmp)
- [La production d'[[un:pt]]](#calc-production-pt)
- [HT et TTC](#calc-ht-ttc)
- [Lexique [[un:pt:pl]]](#lexique-pt)$v196_usine_calc_cout_recette$, NULL, 'brouillon', '9550800d9be7121890531fd0b30b1349'
    FROM manuel_sections s WHERE s.slug = 'calc-cout-recette'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_usine := n_usine + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'calc-cout-recette') THEN fiches_absentes := fiches_absentes || 'calc-cout-recette'::TEXT; END IF;
  -- ── usine / compte-activites-labos ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'usine', NULL, $v196_usine_compte_activites_labos$## 🏢 Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]

Toute l'organisation de LabFlow repose sur trois niveaux : le **compte**, [[det:activite:le:pl]]**[[nom:activite:pl]]** et [[det:labo:le:pl]]**[[nom:labo:pl]]**. Comprendre qui possède quoi est la clé de lecture de tous les autres écrans.

### Les trois niveaux

- **Le compte** : c'est votre entreprise dans LabFlow. Il porte l'abonnement, qui fixe vos quotas : nombre [[de:activite:pl]], [[de:labo:pl]] et de comptes [[nom:gerant:pl]] — et, si le module [[Court:acheteur:pl]] est actif, le palier [[de:acheteur:pl]]. Il porte aussi la **formule d'activités** (Basique ou Premium), qui détermine l'étendue [[du:espace_produits:Nom]]. Les compteurs [[de:activite:pl]] et [[de:labo:pl]] s'affichent sur la page [[Mon:activite:pl]], celui [[du:gerant:pl]] sur la page du même nom. Il n'y a pas de distinction entre indépendant et entreprise : le même modèle s'adapte à toutes les tailles, du potier seul à l'usine de carreaux.
- **[[Le:activite:pl]] (0 à N)** : vos magasins — showroom en ville, magasin d'usine, stand de salon… Chaque [[nom:activite]] vend, consomme et gère [[acc:stock:son propre:sa propre]] [[nom:stock]].
- **[[Le:labo:pl]] (0 à N)** : vos usines et ateliers. [[Un:labo]] façonne et cuit [[un:pt:pl]], approvisionne [[le:activite:pl]] qui lui sont [[acc:activite:rattaché:rattachée:pl]] **exclusivement par [[nom:transfert]]** — et, avec le module [[Court:acheteur:pl]], vend directement aux professionnels.

### Qui possède quoi ?

| Élément | Niveau | En pratique |
|---|---|---|
| [[Nom:referentiel]] (unités, familles, catégories, [[nom:article:pl]]) | Compte | [[acc:referentiel:Défini:Définie]] une seule fois, [[acc:referentiel:partagé:partagée]] par tous vos établissements |
| Sélection [[de:article:pl]] | [[Nom:activite]] / [[nom:labo]] | Chaque établissement n'utilise que [[le:article:pl]] qu'on lui a [[acc:article:assigné:assignée:pl]] |
| [[Nom:stock]], [[court:appro:pl]], [[nom:inventaire:pl]], [[nom:perte:pl]] | [[Nom:activite]] / [[nom:labo]] | Chaque établissement a les siens, suivis séparément |
| [[Nom:produit:pl]] et [[nom:fiche_technique:pl]] | [[Nom:activite]] / [[nom:labo]] | [[Un:produit]] est [[acc:produit:affecté:affectée]] aux établissements qui [[acc:produit:le:la]] fabriquent ou [[acc:produit:le:la]] vendent |
| [[Nom:vente:pl]] et prix de vente | [[Nom:activite]] / [[nom:labo]] | Chaque [[nom:activite]] a ses prix et [[son:vente:pl]] ; [[le:labo]] peut aussi saisir [[son:vente:pl]] [[acc:vente:direct:directe:pl]] |
| Carnet [[de:acheteur:pl]] et tarifs B2B | Compte | Communs à [[tous:labo:les]] ; [[le:vente:pl]] [[au:acheteur:pl]] partent [[du:stock]] de [[acc:labo:l'un d'eux:l'une d'elles]] |

### Le lien [[nom:activite]] ↔ [[nom:labo]]

Dès qu'[[un:labo]] existe sur votre compte, la création ou la modification d'[[un:activite]] vous propose deux choix :

- **Avec [[nom:labo]]** : [[le:activite]] est [[acc:activite:rattaché:rattachée]] à [[un:labo]] qui l'approvisionne par [[nom:transfert]] — les pièces sorties du four arrivent dans [[le:stock]] du showroom à chaque [[nom:transfert]].
- **Sans [[nom:labo]]** : [[le:activite]] gère [[acc:activite:seul:seule]] [[son:appro:pl]] auprès de [[son:fournisseur:pl]].

Une même entreprise peut mélanger les deux : des showrooms rattachés [[au:labo]] et un magasin autonome qui s'approvisionne chez d'autres fabricants, par exemple.

### La base [[court:acheteur:pl]] et le compte [[nom:depot]]

Avec le **module [[Court:acheteur:pl]]**, [[le:labo]] ne fait pas que fabriquer pour vos showrooms : [[acc:labo:il:elle]] vend aussi **directement aux professionnels** (négociants en matériaux, magasins de carrelage, décorateurs…). Le carnet [[de:acheteur:pl]], les tarifs B2B, les commandes et le portail en ligne sont réunis dans [[det:espace_acheteurs:le]][[[Nom:espace_acheteurs]]](#acheteurs-module).

- Le module nécessite **au moins [[un:labo]]** : [[le:vente:pl]] [[au:acheteur:pl]] partent toujours de [[son:stock]].
- Il est facturé **par palier** selon la taille du carnet : jusqu'à 10, 20, 50 ou 100 [[nom:acheteur:pl]].
- Un **compte [[nom:depot]]** est un compte **sans [[nom:activite]]** : [[un:labo]] + la base [[court:acheteur:pl]]. C'est le modèle de l'usine qui ne vend qu'aux professionnels. Son menu est allégé : sans [[nom:activite]], [[le:espace_vente:Nom]], [[le:transfert:pl:Nom]] et [[le:produit_vendable:pl:Titre]] sont masqués — ils réapparaissent automatiquement dès [[acc:activite:le premier:la première]] [[nom:activite]] [[acc:activite:créé:créée]].

### Quatre exemples concrets

- **Fabrique de vaisselle** : 1 [[nom:labo]] + 3 showrooms. L'usine façonne, émaille et cuit assiettes, bols et tasses ; chaque showroom reçoit sa production par [[nom:transfert]] et saisit ses propres [[nom:vente:pl]]. [[Le:referentiel]] (argile, kaolin, émaux, cartons…) est [[acc:referentiel:commun:commune]] à tous.
- **Potier indépendant** : 1 [[nom:activite]], 0 [[nom:labo]]. Le potier fait ses achats, [[son:fiche_technique:pl]] et [[son:vente:pl]] ; le modèle reste le même, simplement sans [[Nom:espace_labo]].
- **Fabricant de carreaux** : 1 [[nom:labo]] + 2 [[nom:activite:pl]] (un showroom en ville, un magasin d'usine). L'usine presse, émaille et cuit les carreaux, [[le:activite:pl]] vendent, et les rapports donnent la vision d'ensemble du compte.
- **Usine en compte [[nom:depot]]** : 0 [[nom:activite]], 1 [[nom:labo]] + base [[court:acheteur:pl]]. L'usine fabrique et vend exclusivement à ses clients professionnels (négociants, grandes surfaces de bricolage), via [[le:espace_acheteurs:Nom]] et le portail de commande.

:::regle
[[Le:referentiel]] est [[acc:referentiel:commun:commune]] au compte ; [[le:stock:pl]] sont [[acc:stock:locaux:locales]] à chaque établissement. [[Un:article]] se crée une seule fois, mais [[son:stock]] et son prix moyen pondéré vivent séparément dans chaque [[nom:activite]] et chaque [[nom:labo]].
:::

:::attention
[[Un:pt]] d'origine [[nom:labo]] ne peut être [[acc:pt:approvisionné:approvisionnée]] côté [[nom:activite]] que par [[nom:transfert]] : pas de saisie d'achat directe pour [[ce:produit:pl]] en showroom. Voir [[[le:pt:pl]]](#lexique-pt).
:::

### Voir aussi

- [Parcours de démarrage](#demarrage)
- [[[Nom:activite:pl]]](#activites) — l'écran de gestion de vos établissements
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module) — [[le:vente]] aux professionnels
- [[[Nom:transfert:pl]]](#transferts)
- [Rôles & accès](#roles)
- [Calculs : [[le:transfert:pl]]](#calc-transferts)$v196_usine_compte_activites_labos$, NULL, 'brouillon', '4c32347fe4b89ff00361265b939826de'
    FROM manuel_sections s WHERE s.slug = 'compte-activites-labos'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_usine := n_usine + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'compte-activites-labos') THEN fiches_absentes := fiches_absentes || 'compte-activites-labos'::TEXT; END IF;
  -- ── usine / decouvrir-labflow ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'usine', NULL, $v196_usine_decouvrir_labflow$## 🌟 LabFlow en un coup d'œil

LabFlow est une application de gestion pour les usines et ateliers de céramique : carreaux, sanitaires, vaisselle, poterie décorative. Elle réunit dans un seul outil tout ce qui fait la rentabilité d'une production céramique : [[le:referentiel]] [[de:article:pl]], [[le:fiche_technique:pl]] et [[le:cout_matiere]], [[le:stock:pl]] de chaque établissement, la fabrication dans [[votre:labo:pl]], [[le:transfert:pl]] entre établissements, [[le:vente:pl]] — au showroom comme aux professionnels — et les rapports.

### Ce que LabFlow vous apporte

- **La maîtrise [[du:cout_matiere]]** : chaque [[nom:recette]] (pour un carreau : argile, émail, engobe, emballage…) est [[acc:recette:décrit:décrite]] dans [[un:fiche_technique]], [[acc:fiche_technique:calculé:calculée]] automatiquement à partir de vos prix d'achat réels. Quand le prix de l'argile ou de l'émail évolue chez [[votre:fournisseur]], vos coûts suivent.
- **[[Un:stock:pl]] par établissement** : chaque [[nom:activite]] et chaque [[nom:labo]] dispose de [[acc:stock:son propre:sa propre]] [[nom:stock]], avec [[nom:appro:pl]], [[nom:inventaire:pl]], [[nom:perte:pl]] (pièces fêlées ou ratées à la cuisson) et valeur [[de:stock]] suivis séparément.
- **La fabrication** : [[le:labo]] transforme [[votre:article:pl]] en [[nom:pt:pl]] (barbotine, émaux préparés, carreaux, vaisselle…), [[le:ingredient:pl]] sont [[acc:ingredient:déduit:déduite:pl]] automatiquement, et [[votre:activite:pl]] sont [[acc:activite:approvisionné:approvisionnée:pl]] par [[nom:transfert]].
- **[[Le:vente]] aux professionnels (B2B)** : avec le module [[Court:acheteur:pl]], [[votre:labo]] vend directement à un carnet de professionnels (négociants en matériaux, magasins de carrelage et de décoration) — tarifs dédiés, commandes en ligne via un portail, factures [[de:vente]].
- **La traçabilité** : chaque mouvement laisse une trace consultable — [[nom:appro:pl]], [[nom:perte:pl]], [[nom:transfert:pl]], [[nom:inventaire:pl]], [[nom:vente:pl]] — avec filtres et exports dans les pages d'historique.
- **[[Le:vente:pl]] et [[le:marge:pl]]** : la saisie [[du:vente:pl]] déduit [[le:stock]] et alimente vos indicateurs : chiffre d'affaires, [[nom:food_cost]], [[nom:marge]] [[acc:marge:brut:brute]], valeur [[du:stock]], [[nom:perte:pl]], panier moyen.

Tous les montants sont exprimés en **DT**. Les prix d'achat se saisissent en HT avec leur taux de TVA, et l'application affiche les valeurs en TTC dans les rapports et tableaux de bord (voir [la règle HT/TTC](#calc-ht-ttc)).

### Pour qui ?

LabFlow s'adapte à la taille de votre organisation grâce à un modèle unique : un compte regroupe [[acc:activite:un:une]] ou plusieurs **[[nom:activite:pl]]** (showroom, magasin d'usine…) et, si besoin, [[acc:labo:un:une]] ou plusieurs **[[nom:labo:pl]]** (usine, atelier, entrepôt).

- Le **potier indépendant** : [[acc:activite:un seul:une seule]] [[nom:activite]], où il façonne et vend ses pièces, tout se gère au même endroit.
- La **fabrique de carreaux avec usine centrale** : [[le:labo]] presse, émaille et cuit, les showrooms vendent, [[le:transfert:pl]] font le lien.
- Le **réseau de showrooms** : plusieurs [[nom:activite:pl]], [[acc:activite:chacun:chacune]] avec [[son:stock]] et ses prix, et des rapports pour piloter l'ensemble.
- L'**usine en compte [[nom:depot]]** : pas [[de:activite]] — [[un:labo]] et un carnet [[de:acheteur:pl]] (négociants, grandes surfaces de bricolage), avec commandes via le portail.

Le détail de ce modèle est expliqué dans [Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]](#compte-activites-labos).

### Les grands modules

| Module | Ce qu'il couvre |
|---|---|
| [[Nom:referentiel]] | Unités, familles, catégories et [[nom:article:pl]] (argiles, émaux, emballages…) : la base commune de votre compte |
| Espace [[Nom:produit:pl]] | [[Nom:produit_vendable:pl]], [[nom:produit_utilisable:pl]] et [[nom:produit_valorise:pl]], avec leurs [[nom:fiche_technique:pl]] |
| [[Nom:espace_activites]] | [[Nom:stock]], [[nom:appro:pl]], factures, [[nom:perte:pl]] et [[nom:inventaire:pl]] de chaque [[nom:activite]] |
| [[Nom:espace_labo]] | [[Nom:stock]] [[du:labo]], fabrication, [[nom:transfert:pl]] vers [[le:activite:pl]] |
| [[Nom:espace_vente]] | Prix de vente, [[nom:prestataire:pl]], charges, saisie [[du:vente:pl]] et rapport [[de:vente]] |
| [[Nom:espace_acheteurs]] *(facultatif)* | Carnet [[de:acheteur:pl]] B2B, tarifs dédiés, [[nom:vente:pl]] et commandes, portail en ligne, factures [[de:vente]] |
| Gestion | Tableau de bord, rapports, [[nom:fournisseur:pl]], [[nom:gerant:pl]], abonnement |

:::astuce
Sur la plupart des écrans, un petit bouton « ? » ouvre ce manuel directement à la page concernée. Vous retrouvez aussi le lien Manuel d'utilisation en bas du menu latéral.
:::

### Voir aussi

- [Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]](#compte-activites-labos)
- [Parcours de démarrage](#demarrage)
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module)
- [Lexique](#lexique)
- [Tableau de bord](#dashboard)
- [[[Nom:fiche_technique:pl]]](#fiches-techniques)$v196_usine_decouvrir_labflow$, NULL, 'brouillon', '22019ceed9ce2d099a257e537e064070'
    FROM manuel_sections s WHERE s.slug = 'decouvrir-labflow'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_usine := n_usine + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'decouvrir-labflow') THEN fiches_absentes := fiches_absentes || 'decouvrir-labflow'::TEXT; END IF;
  -- ── usine / demarrage ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'usine', NULL, $v196_usine_demarrage$## 🚀 Parcours de démarrage

LabFlow se découvre dans l'ordre : le menu latéral se **déverrouille progressivement** à mesure que votre compte se construit. Les entrées non encore accessibles sont grisées avec un cadenas 🔒, et un bandeau en haut du menu vous indique à chaque instant la prochaine action attendue.

### Comment le menu se déverrouille

| Ce que vous faites | Ce qui s'ouvre |
|---|---|
| Première connexion : changement du mot de passe | [[Mon:activite:pl]] |
| Création [[acc:activite:du premier:de la première]] [[nom:activite]] ou [[du:labo]] | [[Nom:referentiel]], Tableau de bord, Rapports, [[Nom:fournisseur:pl]], [[Nom:gerant:pl]] |
| Création [[acc:article:du premier:de la première]] [[nom:article]] [[au:referentiel]] | Espace [[Nom:produit:pl]] |
| [[acc:article:Premier:Première]] [[nom:article]] [[acc:article:sélectionné:sélectionnée]] pour [[un:activite]] | [[Nom:espace_activites]] |
| [[acc:article:Premier:Première]] [[nom:article]] [[acc:article:affecté:affectée]] [[au:labo]] | [[Nom:espace_labo]] |

[[Le:espace_vente:Nom]] apparaît quant à [[acc:espace_vente:lui:elle]] lorsque le module [[nom:vente]] est activé sur votre compte, qu'[[acc:article:un premier:une première]] [[nom:article]] existe [[au:referentiel]] **et qu'au moins [[un:activite]] est [[acc:activite:créé:créée]]** — [[acc:espace_vente:il:elle]] concerne [[le:vente:pl]] [[du:activite:pl]] : un compte sans [[nom:activite]] ne [[acc:espace_vente:le:la]] voit pas, tout comme les liens [[Nom:transfert:pl]] et [[Titre:produit_vendable:pl]] ; [[le:espace_acheteurs:Nom]], dès que le module [[Court:acheteur:pl]] est actif. Dès la création de [[acc:activite:votre premier:votre première]] [[nom:activite]] ou de [[votre:labo]], l'application vous emmène automatiquement vers [[le:referentiel:Nom]], à la page Unités : c'est la suite logique du parcours.

### Actions pas à pas

1. **Créez vos établissements** — Dans **[[Mon:activite:pl]]**, utilisez le bouton « Créer mon business » (proposé si votre abonnement inclut [[un:labo]]) pour [[acc:labo:le:la]] créer, puis [[votre:activite:pl]], en deux étapes, ou « + Ajouter [[mon:activite]] » sinon — sur un **compte [[nom:depot]]** (sans [[nom:activite]]), le bouton devient « 🏭 Créer [[mon:labo]] ». Pour chaque [[nom:activite]] [[acc:activite:approvisionné:approvisionnée]] par [[le:labo]], choisissez « Avec [[nom:labo]] ». Voir [[[Nom:activite:pl]]](#activites).
2. **Construisez [[le:referentiel]]** — Dans l'ordre : [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories), puis [[[Nom:article:pl]]](#referentiel-articles) (argiles, émaux, emballages…) avec leur prix d'achat HT et leur taux de TVA. Le menu Ajout Dynamique accélère la création en masse ([import](#referentiel-import)).
3. **Assignez [[le:article:pl]]** — Indiquez [[acc:article:lesquels:lesquelles]] sont [[acc:article:utilisé:utilisée:pl]] par chaque [[nom:activite]] et par [[le:labo]] : c'est cette affectation qui déverrouille les espaces correspondants. Voir [[det:article:le:pl]][[[Nom:article:pl]]](#referentiel-articles).
4. **Mettez [[votre:stock:pl]] à niveau** — Saisissez [[votre:appro:pl]] dans [[[Nom:stock]] [[Court:activite:pl]]](#stock-activites) et [[[Nom:stock]] [[Court:labo]]](#stock-labo) : quantités, prix, [[nom:fournisseur]]. C'est de là que viennent vos coûts réels.
5. **Créez [[votre:produit:pl]] et [[nom:fiche_technique:pl]]** — Dans l'Espace [[Nom:produit:pl]], composez [[votre:recette:pl]] (pour un carreau : argile, émail, carton d'emballage…) : les coûts se calculent automatiquement. Voir [[[Nom:fiche_technique:pl]]](#fiches-techniques) et [le calcul du coût [[de:recette]]](#calc-cout-recette).
6. **Passez [[au:vente]]** — Configurez vos prix ([Configuration [[Court:vente]]](#configuration-vente)) puis enregistrez [[votre:vente:pl]] ([Saisie [[du:vente:pl]]](#saisie-ventes)). Si le module [[Court:acheteur:pl]] est actif, configurez aussi vos [tarifs B2B](#acheteurs-tarifs) et votre [carnet [[de:acheteur:pl]]](#acheteurs-carnet).

### Points d'attention

:::attention
Tant qu'[[aucun:article]] n'est [[acc:article:assigné:assignée]] à [[un:activite]] ou [[au:labo]], les espaces correspondants restent verrouillés — même si [[votre:article:pl]] existent déjà [[au:referentiel]]. Le bandeau du menu vous le rappelle.
:::

:::astuce
Créez d'abord toutes vos unités et familles avant d'attaquer [[le:article:pl]] : vous éviterez les allers-retours. Et à tout moment, le bouton « ? » présent sur les écrans ouvre ce manuel à la bonne page.
:::

### Voir aussi

- [Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]](#compte-activites-labos)
- [Suivi de l'onboarding](#onboarding-suivi)
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module)
- [Rôles & accès](#roles)
- [FAQ](#faq)$v196_usine_demarrage$, NULL, 'brouillon', '2adc4119a69fe998011a4ac3ae326898'
    FROM manuel_sections s WHERE s.slug = 'demarrage'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_usine := n_usine + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'demarrage') THEN fiches_absentes := fiches_absentes || 'demarrage'::TEXT; END IF;
  -- ── usine / lexique-pt ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'usine', NULL, $v196_usine_lexique_pt$## 🧩 Les 3 catégories [[de:pt:pl]]

[[Det:pt:un]]**[[avecCourt:pt]]** est une pièce ou une préparation réalisée à partir d'[[un:recette]] et suivie en [[nom:stock]] : émail préparé, bol, coffret… Quand vous en produisez, LabFlow déduit automatiquement [[du:stock]] [[le:article:pl]] et [[le:produit_utilisable:pl]] consommés. [[Tous:pt:les:court]] ne jouent pas le même rôle : l'application les répartit en **trois catégories**, que vous retrouverez partout sous les libellés « [[Nom:cat_pt_utilisable]] », « [[Nom:cat_pt_vendable]] » et « [[Nom:cat_pt_valorise]] ».

### Vue d'ensemble

| Catégorie | Où on le fabrique | Où on le vend | Comment il arrive en [[nom:stock]] |
|---|---|---|---|
| **Utilisable** (ex. émail préparé, barbotine) | Dans [[le:activite]] ou [[au:labo]], selon les affectations [[du:produit]] | Nulle part : [[acc:produit:il:elle]] est [[acc:produit:consommé:consommée]] dans [[le:recette:pl]] d'autres [[nom:produit:pl]] | Production sur place (saisie de la quantité produite) ou [[nom:transfert]] depuis [[le:labo]] ; [[acc:produit:certains:certaines]] n'arrivent que par cette voie |
| **Vendable** (ex. bol tourné et émaillé en atelier-boutique) | Dans [[le:activite]] | Au même endroit, lors de la saisie [[un:vente:pl]] | Production sur place, si le suivi [[de:stock]] est activé pour [[ce:produit]] ([[un:labo]] peut aussi [[acc:produit:le:la]] gérer et l'envoyer par [[nom:transfert]]) |
| **Composé valorisé** (ex. coffret de six tasses) | [[Au:labo]] uniquement | Par [[le:activite:pl]], tel quel, comme [[un:produit_valorise]] | Uniquement par [[nom:transfert]] |

### 1. Les Utilisables — [[le:produit_utilisable:pl]] de [[votre:recette:pl]]

[[Un:produit_utilisable]] est une **préparation ou une pièce en cours de fabrication** : barbotine, émail préparé, engobe, pièce crue, biscuit… [[acc:produit_utilisable:Il:Elle]] n'est jamais [[acc:produit_utilisable:vendu:vendue]] [[acc:produit_utilisable:tel quel:telle quelle]] : [[acc:produit_utilisable:il:elle]] entre dans la composition [[un:produit_vendable:pl]], des composés valorisés, ou même d'autres [[nom:produit_utilisable:pl]] (une barbotine qui entre dans un engobe, par exemple).

Son **mode [[de:appro]]** se choisit à la création [[du:produit]] : soit chaque [[nom:activite]] peut [[acc:produit:le:la]] produire librement sur place, soit [[acc:produit:il:elle]] est [[acc:produit:fabriqué:fabriquée]] [[au:labo]] et [[le:activite:pl]] [[acc:produit:le:la]] reçoivent **uniquement par [[nom:transfert]]**. Dans ce second cas, la ligne [[du:stock]] [[du:activite]] porte l'indicateur « ⇄ [[Court:transfert]] uniquement » et la saisie directe de quantité y est bloquée.

### 2. Les Vendables — [[le:produit_vendable:pl]] [[du:activite]]

[[Un:pt:court]] vendable est **[[un:produit_vendable]] [[acc:produit_vendable:vendu:vendue]] par [[le:activite]]** : bol, tasse ou assiette faits en atelier-boutique… [[acc:pt:Il:Elle]] est [[acc:pt:défini:définie]] par [[un:fiche_technique]] et [[acc:pt:rattaché:rattachée]] obligatoirement à une catégorie [[de:produit]]. Le suivi en [[nom:stock]] est **optionnel** : activé [[nom:produit]] par [[nom:produit]], il permet de produire à l'avance (la production déduit [[le:ingredient:pl]] [[du:recette]]) puis de suivre les quantités disponibles.

### 3. Les Composés Valorisés — fabriqués [[au:labo]], vendus tels quels

[[Un:produit_compose]] [[acc:produit_compose:valorisé:valorisée]] est **[[acc:produit_compose:fabriqué:fabriquée]] [[au:labo]]** à partir d'[[un:recette]] ([[nom:article:pl]] et [[nom:produit_utilisable:pl]] pris sur place), puis **[[acc:produit_compose:envoyé:envoyée]] par [[nom:transfert]]** vers [[le:activite:pl]] qui [[acc:produit_compose:le:la]] vendent **[[acc:produit_compose:tel quel:telle quelle]]**, comme [[un:produit_valorise]]. [[acc:produit_compose:Il:Elle]] se gère depuis l'écran [[det:produit_valorise:un:pl]][[[Nom:produit_valorise:pl]]](#articles-valorises), dans l'onglet « Composés », qui n'apparaît que si votre compte possède au moins [[un:labo]].

:::regle
Son coût se calcule sur les **prix d'achat [[du:labo]]** et son prix de revient est **figé au moment de la production** : les variations ultérieures de ces prix d'achat ne modifient pas la valeur des lots déjà fabriqués. Côté [[nom:activite]], [[acc:produit_compose:il:elle]] n'arrive en [[nom:stock]] **que par [[nom:transfert]]** — jamais par saisie directe.
:::

Dans [[le:stock]] [[du:labo]], [[ce:produit:pl]] sont repérables au badge « ◆ Composé valorisé ».

### Comment [[un:pt:court]] arrive en [[nom:stock]]

1. **Production** : dans l'écran [[de:stock]] ([[nom:activite]] ou [[nom:labo]]), saisissez la quantité produite sur la ligne [[du:pt:court]]. Aucun prix n'est demandé : le coût [[du:recette]] est calculé automatiquement (en TTC) et [[le:ingredient:pl]] — y compris [[le:produit_utilisable:pl]] — sont [[acc:ingredient:déduit:déduite:pl]] [[du:stock]].
2. **[[Nom:transfert]]** : pour [[le:produit:pl]] [[acc:produit:fabriqué:fabriquée:pl]] [[au:labo]], l'envoi diminue [[le:stock]] de départ et augmente [[acc:stock:celui:celle]] [[du:activite]], au coût [[du:labo]].

:::astuce
Chaque production reçoit une **référence automatique** construite à partir du nom [[du:produit]] et de l'année : initiales de chaque mot pour un nom multi-mots (« Bol Rustique » fabriqué en 2026 donne BR-26), trois premières lettres pour un nom d'un seul mot (« Barbotine » donne BAR-26). Vous la retrouverez dans les historiques pour tracer vos fabrications — voir [La traçabilité](#calc-tracabilite).
:::

:::attention
Vérifiez [[le:stock]] de [[votre:ingredient:pl]] (argile, fritte, oxydes…) avant de lancer une production : les quantités consommées par [[le:recette]] sont déduites immédiatement. Dans la colonne [[du:stock]] [[acc:stock:actuel:actuelle]], la ventilation détaille d'ailleurs les mouvements : [[court:appro]], [[nom:transfert:pl]], [[nom:perte:pl]] et consommation [[court:pt]].
:::

### Qui apparaît où

- **Dans [[le:stock:pl]]** : [[le:pt:pl:court]] figurent aux côtés [[un:article:pl]], [[acc:pt:regroupé:regroupée:pl]] dans leur catégorie. Côté [[nom:activite]], [[le:pt:pl:court]] venus [[du:labo]] affichent « ⇄ [[Court:transfert]] uniquement ». Côté [[nom:labo]], les composés portent le badge « ◆ Composé valorisé ».
- **Dans les historiques et les exports** : [[le:pt:pl:court]] sont [[acc:pt:regroupé:regroupée:pl]] sous les trois catégories citées plus haut. Une catégorie n'apparaît que si elle contient au moins [[un:produit]].
- **Dans les filtres** : le filtre « Catégorie » des historiques [[de:appro:pl]] (dans [[le:activite:pl]] comme dans [[le:labo:pl]]) et de l'historique [[un:perte:pl]] [[du:labo]] propose **trois choix dédiés** — [[Nom:cat_pt_utilisable]], [[Nom:cat_pt_vendable]], [[Nom:cat_pt_valorise]] — en plus des catégories [[de:article:pl]]. En sélectionnant l'un d'eux, la liste « [[Nom:article]] » affiche [[le:pt:pl]] [[acc:pt:correspondant:correspondante:pl]].

### Voir aussi

- [Lexique LabFlow de A à Z](#lexique) — les définitions de tous les termes
- [[[Titre:produit_utilisable:pl]]](#produits-utilisables) et [[[Titre:produit_vendable:pl]]](#produits-vendables) — créer et gérer [[votre:pt:pl:court]]
- [[[Nom:produit_valorise:pl]]](#articles-valorises) — dont l'onglet « Composés »
- [La production d'[[un:pt:court]]](#calc-production-pt) et [[[Le:transfert:pl]]](#calc-transferts) — les calculs détaillés
- [[[Nom:stock]] [[Court:labo]]](#stock-labo), [[[Nom:transfert:pl]]](#transferts) et [Historiques](#historique) — les écrans concernés$v196_usine_lexique_pt$, NULL, 'brouillon', '8cfa18e17485e91567ac4fa01fe9610f'
    FROM manuel_sections s WHERE s.slug = 'lexique-pt'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_usine := n_usine + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'lexique-pt') THEN fiches_absentes := fiches_absentes || 'lexique-pt'::TEXT; END IF;
  -- ── usine / lexique ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'usine', NULL, $v196_usine_lexique$## 📖 Lexique LabFlow de A à Z

Ce lexique rassemble tout le vocabulaire utilisé dans LabFlow et dans ce manuel. Chaque terme est défini en une ou deux phrases, avec un exemple concret quand cela aide. Les montants sont exprimés en DT (dinar tunisien).

:::astuce
Utilisez la recherche de votre navigateur (Ctrl+F) pour retrouver un terme rapidement. Les notions liées [[au:pt:pl]] sont approfondies dans [Les 3 catégories [[de:pt:pl]]](#lexique-pt).
:::

| Terme | Définition |
|---|---|
| **Avenant** | Modification de votre contrat d'abonnement : ajout [[de:activite:pl]], [[de:labo:pl]] ou [[de:gerant:pl]], activation ou changement de palier de la base [[court:acheteur:pl]]… L'avenant vous est envoyé par e-mail pour signature électronique et le document signé reste téléchargeable. |
| **Base [[court:acheteur:pl]]** | Extension de l'abonnement qui active [[le:espace_acheteurs:Nom]]. Elle est facturée par palier selon la taille de votre carnet : jusqu'à 10, 20, 50 ou 100 [[nom:acheteur:pl]]. Le passage à un palier supérieur se demande depuis la page Demandes ; le nouveau palier remplace l'ancien. |
| **Catégorie** | Deux notions distinctes : la *catégorie [[de:article:pl]]* ([[nom:referentiel]]) affine une famille (ex. « Oxydes colorants » dans la famille « Émaux et décors ») ; la *catégorie [[de:produit:pl]]* ([[Nom:espace_produits]]) classe ce qui se vend (ex. « Arts de la table ») et est typée vendable, [[nom:supplement]] ou valorisé. |
| **Charge** | Dépense d'exploitation hors [[nom:article]] : énergie des fours, emballages, main-d'œuvre… Saisie dans [[le:espace_vente:Nom]], elle affine l'analyse de rentabilité au-delà [[acc:cout_matiere:du seul:de la seule]] [[nom:cout_matiere]]. |
| **Coefficient multiplicateur** | Rapport entre le prix de vente et [[le:cout_matiere]] d'[[un:produit]]. Un vase dont la matière coûte 4 DT et qui est vendu 12 DT a un coefficient de 3. |
| **Commande [[compl:acheteur]]** | Demande d'achat passée par [[un:acheteur]] depuis son portail, ou saisie directement en [[nom:vente]] [[acc:vente:manuel:manuelle]]. Elle suit quatre états : en attente → expédiée ([[le:stock]] [[du:labo]] est [[acc:stock:déduit:déduite]] et la facture émise) → livrée ; une commande peut être annulée, [[le:stock]] est alors [[acc:stock:réintégré:réintégrée]]. |
| **Composé valorisé** | [[Nom:pt]] [[acc:pt:réalisé:réalisée]] [[au:labo]] puis [[acc:pt:envoyé:envoyée]] par [[nom:transfert]] vers [[le:activite:pl]], où [[acc:pt:il:elle]] se vend [[acc:pt:tel quel:telle quelle]] (ex. un coffret de six tasses, revendu en showroom). Son prix de revient est figé au coût [[du:labo]] au moment de la production. |
| **Compte [[nom:depot]]** | Type de compte sans [[nom:activite]] : [[un:labo]] et la base [[court:acheteur:pl]]. [[Le:labo]] fabrique et vend directement aux professionnels — c'est le modèle de l'usine qui vend en gros, sans showroom. |
| **Domaine d'activité** | Secteur métier de votre compte (pour vous, l'industrie). Il détermine le catalogue [[de:article:pl]] qui vous est proposé à la création du compte. |
| **Famille** | Regroupement de catégories [[de:article:pl]] (« Argiles », « Émaux et décors »…) portant deux propriétés clés : *consommable* (utilisé en fabrication) et *vendable* (vendu tel quel). Ces propriétés déterminent où chaque [[nom:article]] peut être [[acc:article:utilisé:utilisée]]. |
| **[[Nom:fiche_technique]]** | [[Nom:recette]] [[acc:recette:chiffré:chiffrée]] d'[[un:produit]] : liste [[un:article:pl]] et [[nom:produit_utilisable:pl]] avec leurs [[nom:portion:pl]], et calcul automatique [[du:cout_matiere]]. C'est l'outil central du chiffrage de votre catalogue. |
| **Formule d'activités** | Niveau d'abonnement de [[votre:activite:pl]]. *Activité Basique* : [[nom:stock]], [[nom:appro:pl]] et [[nom:vente:pl]] de marchandises revendues telles quelles, sans [[le:espace_produits:Nom]] [[acc:espace_produits:complet:complète]]. *Activité Premium* : tout LabFlow, y compris [[nom:produit_compose:pl]], [[nom:fiche_technique:pl]] et production. Le passage en Premium se demande depuis Mon abonnement ou la page Demandes. |
| **[[Nom:fournisseur]]** | Tiers auprès duquel vous achetez vos marchandises : argile, émaux, emballages… Il est associé [[au:appro:pl]] et aux factures pour tracer l'origine de chaque achat. |
| **HT / TTC** | Hors taxes / toutes taxes comprises. Dans LabFlow, les prix d'achat se saisissent en HT avec le taux de TVA ; l'affichage courant ([[nom:stock]], [[nom:pt:pl]], rapports, tableaux de bord) est en TTC. |
| **[[Nom:prestataire]]** | Canal de vente tiers (marketplace en ligne, centrale d'achat…) pour lequel vous définissez un prix de vente dédié, saisi manuellement dans la configuration [[de:vente]]. |
| **[[Nom:inventaire]]** | Comptage physique [[du:stock]] à une date donnée (pièces en rayon, palettes de carreaux, sacs d'argile…). La quantité réelle saisie devient la nouvelle référence [[du:stock]] ; [[le:stock]] théorique [[acc:stock:affiché:affichée]] pendant la saisie permet de repérer les écarts. |
| **[[Nom:transfert]]** | Mouvement de marchandise [[du:labo]] vers [[un:activite]] (de l'usine au showroom, par exemple) : [[le:stock]] de départ diminue, [[acc:stock:celui:celle]] d'arrivée augmente, au coût [[du:labo]]. C'est la seule voie d'entrée en [[nom:stock]], côté [[nom:activite]], [[un:produit:pl]] [[acc:produit:fabriqué:fabriquée:pl]] [[au:labo]]. |
| **[[Nom:marge]]** | Différence entre le prix de vente et [[le:cout_matiere]]. Un bol vendu 8 DT avec 2 DT de matière dégage 6 DT [[de:marge]] [[acc:marge:brut:brute]]. |
| **[[Nom:article]]** | Élément de base [[du:referentiel]] : [[nom:ingredient]] ou [[nom:produit]] [[acc:produit:acheté:achetée]] (argile, kaolin, fritte, oxydes colorants…), défini par un nom, une unité et une catégorie. [[Le:stock]], [[le:recette:pl]] et les coûts s'appuient tous sur [[le:article:pl]]. |
| **Mode de compte** | État d'accès du compte selon la situation de l'abonnement : *actif* (toutes les fonctions), *lecture seule* (consultation sans modification) ou *bloqué / désactivé* (accès restreint). |
| **[[Nom:recette]]** | Composition d'[[un:produit]] : [[nom:article:pl]] et [[nom:produit_utilisable:pl]] avec leurs [[nom:portion:pl]] (ex. l'argile, l'engobe et l'émail d'une assiette). Elle sert à la fois au calcul du coût de revient et à la déduction [[du:stock]]. |
| **[[Nom:supplement]]** | [[Nom:produit_vendable]] complémentaire [[acc:produit_vendable:proposé:proposée]] en plus d'[[un:produit]] [[acc:produit:principal:principale]] : personnalisation (prénom, logo), décor peint à la main, coffret cadeau… [[acc:produit_vendable:Il:Elle]] a [[acc:fiche_technique:son propre:sa propre]] [[nom:fiche_technique]] et son propre prix de vente. |
| **[[Nom:perte]] (avarie / déchet)** | Marchandise sortie [[du:stock]] sans être vendue : *avarie* ([[nom:produit]] [[acc:produit:fêlé:fêlée]], [[acc:produit:ébréché:ébréchée]] ou présentant un défaut d'émail) ou *déchet* (casse, rebuts de cuisson, chutes d'argile). Chaque [[nom:perte]] est [[acc:perte:valorisé:valorisée]] en TTC dans les rapports. |
| **PMP** | Prix moyen pondéré : prix unitaire moyen d'[[un:article]], pondéré par les quantités achetées. 1 000 kg d'argile achetés à 0,400 DT puis 500 kg à 0,550 DT donnent un PMP de 0,450 DT/kg ; il sert à valoriser [[le:stock]] et [[le:transfert:pl]]. |
| **[[Nom:activite]]** | Showroom, boutique, atelier-boutique ou magasin d'usine exploité par votre compte. Un compte gère [[acc:activite:un:une]] ou plusieurs [[nom:activite:pl]], [[acc:activite:chacun:chacune]] avec [[son:stock]], [[son:produit:pl]], ses prix et [[son:vente:pl]]. |
| **Portail [[court:acheteur]]** | Espace en ligne dédié à chaque [[nom:acheteur]] [[acc:acheteur:invité:invitée]] : [[acc:acheteur:il:elle]] y consulte le catalogue à ses tarifs, passe commande et télécharge ses factures. [[acc:acheteur:Il:Elle]] ne voit jamais vos quantités en [[nom:stock]] ; le vendeur ajuste les quantités, ou retire des lignes, à l'expédition. |
| **[[Nom:pt]]** | Pièce ou préparation réalisée à partir d'[[un:recette]] et suivie en [[nom:stock]] : sa production déduit automatiquement [[le:ingredient:pl]] et [[le:produit_utilisable:pl]] consommés. Trois catégories existent : [[nom:produit_utilisable:pl]], [[nom:produit_vendable:pl]] et composés valorisés. |
| **[[Nom:produit_vendable]]** | Pièce terminée, définie par [[un:fiche_technique]] et vendue par [[un:activite]] : assiette, bol, vase, carreau émaillé… [[acc:produit_vendable:Il:Elle]] est obligatoirement [[acc:produit_vendable:rattaché:rattachée]] à une catégorie [[de:produit]]. |
| **[[Nom:produit_valorise]]** | Élément vendu tel quel, sans décomposition [[de:recette]] au moment [[du:vente]] : marchandise achetée pour être revendue (ex. bougie parfumée, linge de table) ou [[nom:produit_compose]] [[acc:produit_compose:fabriqué:fabriquée]] [[au:labo]] (ex. coffret de six tasses). |
| **PV (prix de vente)** | Prix auquel [[un:produit]] est [[acc:produit:vendu:vendue]] au client. LabFlow distingue le prix direct ([[nom:vente]] en showroom) et les prix propres à chaque [[nom:prestataire]]. |
| **[[Nom:appro]]** | Entrée de marchandise dans [[le:stock]] : vous saisissez la quantité, le prix d'achat HT et le taux de TVA. [[Un:appro]] peut provenir d'un achat auprès d'[[un:fournisseur]] (un arrivage d'argile, par exemple), d'[[un:transfert]] depuis [[le:labo]] ou d'une production [[de:pt]]. |
| **[[Nom:referentiel]]** | Socle de données du compte : unités, familles, catégories et [[nom:article:pl]]. Tout le reste ([[nom:stock]], [[nom:recette:pl]], [[nom:vente:pl]]) s'appuie dessus. |
| **[[Nom:gerant]]** | Utilisateur délégué par le propriétaire du compte (par exemple, la personne qui dirige un atelier ou un showroom). Son accès est limité [[au:activite:pl]] et [[au:labo:pl]] qui lui sont affectés. |
| **[[Nom:acheteur]]** | Client professionnel (B2B) enregistré dans votre carnet [[de:acheteur:pl]] : magasin de décoration, négociant en carrelage, concept-store… Il peut être invité sur son portail pour commander en ligne. [[Le:vente:pl]] [[au:acheteur:pl]] partent toujours [[du:stock]] d'[[un:labo]] et donnent lieu à une facture [[de:vente]]. |
| **[[Nom:produit_utilisable]]** | [[Nom:pt]] qui n'est jamais [[acc:pt:vendu:vendue]] [[acc:pt:tel quel:telle quelle]] mais [[acc:pt:réutilisé:réutilisée]] dans d'autres [[nom:recette:pl]] : barbotine, émail préparé, engobe, pièce crue ou biscuit… Son coût se répercute automatiquement dans [[tous:produit:les]] qui l'utilisent. |
| **Seuil d'alerte** | Quantité minimale définie pour [[un:article]] ou [[un:pt]] (ex. 500 kg d'argile) : lorsque [[le:stock]] passe en dessous, la ligne est signalée pour réapprovisionnement. Pour [[le:pt:pl]], le seuil se règle par [[nom:activite]]. |
| **[[Nom:labo]]** | Usine ou atelier de fabrication rattaché au compte. [[acc:labo:Il:Elle]] achète et fabrique en gros, alimente [[le:activite:pl]] par [[nom:transfert]] — et, si la base [[court:acheteur:pl]] est active, vend directement aux professionnels. Un compte peut avoir zéro, [[acc:labo:un:une]] ou plusieurs [[nom:labo:pl]]. |
| **[[Nom:stock]] théorique** | Quantité calculée par l'application : [[acc:inventaire:dernier:dernière]] [[nom:inventaire]] + [[nom:appro:pl]] − [[nom:perte:pl]] − [[nom:transfert:pl]] [[acc:transfert:sortant:sortante:pl]] − consommations ([[nom:vente:pl]], productions). [[Le:inventaire]] [[acc:stock:le:la]] réconcilie avec [[le:stock]] [[acc:stock:réel:réelle]] [[acc:stock:compté:comptée]]. |
| **[[Nom:food_cost]]** | Ce que coûtent [[le:article:pl]] [[acc:article:consommé:consommée:pl]] pour produire une pièce, le plus souvent rapporté à son prix de vente. Un vase vendu 15 DT dont [[le:ingredient:pl]] coûtent 4,500 DT a [[un:food_cost]] de 30 %. |
| **Timbre fiscal** | Droit de timbre ajouté au total d'une facture [[de:vente]] [[au:acheteur:pl]] (montant fixe en DT, désactivable [[au:vente]]). |
| **TVA** | Taxe sur la valeur ajoutée. Le taux se saisit [[au:appro]], pour chaque [[nom:article]], et sert au calcul des prix TTC. |
| **Unité** | Mesure dans laquelle on compte [[un:article]] : kg, litre, pièce, m²… Utilisez la même unité à l'achat et en [[nom:recette]] pour obtenir des coûts justes. |
| **Valorisation** | Expression en argent d'une quantité : valeur [[du:stock]], d'[[un:perte]] ou d'une production (une fournée de bols, par exemple), obtenue en multipliant la quantité par le prix unitaire (PMP ou coût [[de:recette]]). |

### Voir aussi

- [Les 3 catégories [[de:pt:pl]]](#lexique-pt) — [[le:produit_utilisable:pl]], [[le:produit_vendable:pl]] et les composés valorisés en détail
- [Le module [[Nom:acheteur:pl]]](#acheteurs-module) — [[le:vente]] aux professionnels de A à Z
- [Un compte, [[un:activite:pl]], [[un:labo:pl]]](#compte-activites-labos) et [Rôles & accès](#roles) — l'organisation de votre compte
- [Le coût d'[[un:recette]]](#calc-cout-recette), [Le PMP](#calc-pmp) et [HT et TTC](#calc-ht-ttc) — les calculs expliqués pas à pas
- [Les seuils d'alerte](#calc-seuils) et [La valeur [[du:stock]]](#calc-valeur-stock)$v196_usine_lexique$, NULL, 'brouillon', 'abe5dd9e375046d8e59f783b5c8a46c5'
    FROM manuel_sections s WHERE s.slug = 'lexique'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_usine := n_usine + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'lexique') THEN fiches_absentes := fiches_absentes || 'lexique'::TEXT; END IF;
  -- ── usine / onboarding-configuration ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'usine', NULL, $v196_usine_onboarding_configuration$## 🧭 Configuration initiale

À votre première connexion, LabFlow vous guide pas à pas pour mettre votre espace en ordre de marche. Le point de départ est la page **[[Mon:activite:pl]]** ; le menu latéral s'ouvre progressivement au fil de votre avancement.

### Ce que vous voyez

- au départ, un encadré de bienvenue « Démarrez [[votre:activite]] » rappelant ce que votre abonnement inclut (nombre [[de:activite:pl]] et [[de:labo:pl]]), avec le bouton **✨ Créer mon business** si votre abonnement inclut [[un:labo]], ou **+ Ajouter [[mon:activite]]** sinon — pour un **compte [[nom:depot]]** ([[nom:labo]] + base [[court:acheteur:pl]], sans [[nom:activite]]), l'encadré devient « Démarrez [[votre:labo]] » avec le bouton **🏭 Créer [[mon:labo]]** ;
- des compteurs indiquant l'utilisation de votre abonnement (par exemple 1 / 3 [[nom:activite:pl]]) ;
- dans le menu latéral, un bandeau qui vous indique la prochaine étape à accomplir, tant que la configuration n'est pas terminée.

### Actions pas à pas

1. **Créez [[votre:labo]] et [[votre:activite:pl]].** Le bouton « Créer mon business » ouvre un assistant en deux étapes : d'abord [[det:labo_long:le]]**[[Nom:labo_long]]** (nom, référence unique, adresse — vous pouvez cocher « Passer cette étape » si vous n'en avez pas encore besoin), puis [[det:activite:votre:pl]]**[[Nom:activite:pl]]** (nom, adresse et, si vous créez [[un:labo]], le choix « Avec [[nom:labo]] » ou « Sans [[nom:labo]] » pour [[acc:activite:chacun:chacune]]). Ajoutez autant [[de:activite:pl]] que votre abonnement le permet, puis validez avec **Enregistrer tout**.
2. **Constituez [[votre:referentiel]].** Dès [[acc:activite:votre premier:votre première]] [[nom:activite]] ou [[votre:labo]] [[acc:labo:créé:créée]], [[le:referentiel:Nom]] se déverrouille dans le menu : créez vos unités, familles et catégories, puis [[votre:article:pl]] (nom, unité, catégorie : l'argile en kg, par exemple).
3. **Affectez [[votre:article:pl]].** Sélectionnez, pour chaque [[nom:activite]] et pour [[le:labo]], [[le:article:pl]] qui y sont [[acc:article:utilisé:utilisée:pl]]. Les espaces [[Pl:activite]] et [[Court:labo]] se déverrouillent dès qu'[[un:article]] leur est [[acc:article:affecté:affectée]]. L'Espace [[Nom:produit:pl]] s'ouvre dès [[acc:article:votre premier:votre première]] [[nom:article]] [[acc:article:créé:créée]].
4. **Saisissez vos [[acc:appro:premier:première:pl]] [[nom:appro:pl]].** Rendez-vous dans [[le:stock]] pour enregistrer vos premières entrées (prix d'achat saisis en HT avec leur taux de TVA) : vos quantités et la valeur de [[votre:stock]] commencent à vivre.
5. **Consultez votre tableau de bord.** Il devient accessible dès la création de [[votre:activite:pl]] et se remplit au fil de vos saisies.

### Points d'attention

:::regle
**Compte [[nom:depot]]** ([[nom:labo]] + base [[court:acheteur:pl]], sans [[nom:activite]]) : l'assistant se résume à la création [[du:labo]]. Constituez ensuite [[le:referentiel]] et affectez [[votre:article:pl]] [[au:labo]]. Configurez enfin [[det:espace_acheteurs:le]][[[Nom:espace_acheteurs]]](#acheteurs-module) : [[nom:article:pl]] commandables, carnet [[de:acheteur:pl]] et tarifs B2B — votre suivi de mise en route intègre cette étape.
:::

:::astuce
La progression est entièrement automatique : l'application détecte vos données réelles ([[nom:activite:pl]] [[acc:activite:créé:créée:pl]], [[nom:article:pl]] [[acc:article:affecté:affectée:pl]]) et ouvre les menus correspondants. Rien n'est à valider manuellement, et vous ne pouvez pas sauter une étape par erreur.
:::

:::attention
Le nombre [[de:activite:pl]] et [[de:labo:pl]] est plafonné par votre abonnement (compteurs affichés en haut de la page). Une fois la limite atteinte, le bouton « ⚡ Ajouter [[nom:activite:pl]] » vous oriente vers une demande d'ajout de capacité — voir [Avenants & résiliation](#onboarding-avenants).
:::

### Voir aussi

- [Compte, [[nom:activite:pl]] et [[nom:labo:pl]]](#compte-activites-labos)
- [Le module [[Court:acheteur:pl]]](#acheteurs-module)
- [Unités](#referentiel-unites) · [[[Nom:article:pl]]](#referentiel-articles)
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites)
- [Tableau de bord](#dashboard)$v196_usine_onboarding_configuration$, NULL, 'brouillon', '794a5b32a2476bbe4e0088e07744f3b0'
    FROM manuel_sections s WHERE s.slug = 'onboarding-configuration'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_usine := n_usine + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'onboarding-configuration') THEN fiches_absentes := fiches_absentes || 'onboarding-configuration'::TEXT; END IF;
  -- ── usine / roles ──
  INSERT INTO manuel_sections_domaine (section_id, domaine_slug, titre, contenu, mots_cles, statut, base_md5)
  SELECT s.id, 'usine', NULL, $v196_usine_roles$## 👤 Rôles & accès

Un compte LabFlow distingue deux rôles internes : le **client**, propriétaire du compte, et [[det:gerant:le]]**[[nom:gerant]]**, collaborateur invité sur un périmètre précis (une usine, un showroom…). S'y ajoutent [[det:acheteur:le]]**[[nom:acheteur]]** — un client professionnel externe, négociant ou magasin de carrelage, qui n'accède qu'à son portail de commande — et le **mode du compte** (actif, lecture seule, bloqué), qui dépend de la situation de votre abonnement.

### Le client (propriétaire)

Le client dispose de l'accès complet : [[nom:activite:pl]] et [[nom:labo:pl]], [[nom:referentiel]], [[nom:produit:pl]] et [[nom:fiche_technique:pl]], [[nom:stock:pl]], [[nom:vente:pl]], rapports, [[nom:fournisseur:pl]] — ainsi que les pages réservées au propriétaire :

- **[[Mon:activite:pl]]** : création et modification de vos établissements ;
- **[[Nom:gerant:pl]]** : invitation et gestion des collaborateurs ;
- **Mon abonnement** et **Historique paiements** ;
- dans [[le:espace_vente:Nom]] : **Config Charges** et **Rapport [[Nom:vente]]**.

### [[Le:gerant]] (collaborateur)

[[Le:gerant]] est [[acc:gerant:créé:créée]] par le client depuis la page [[[Nom:gerant:pl]]](#gerants) : nom, téléphone, e-mail, et surtout **[[le:activite:pl]] et [[nom:labo:pl]] qui lui sont assignés** (au moins un est obligatoire). [[acc:gerant:Il:Elle]] reçoit une invitation par e-mail et active [[acc:gerant:lui-même:elle-même]] son compte.

- Son périmètre est limité [[au:activite:pl]] et [[nom:labo:pl]] affectés : [[acc:gerant:il:elle]] y travaille au quotidien ([[nom:stock:pl]], [[nom:appro:pl]], [[nom:inventaire:pl]], [[nom:vente:pl]]…).
- Si le module [[Court:acheteur:pl]] est actif, [[acc:gerant:il:elle]] accède aussi [[det:espace_acheteurs:au]]**[[Nom:espace_acheteurs]]** (le carnet est commun au compte) ; [[son:vente:pl]] [[au:acheteur:pl]] sont [[acc:vente:limité:limitée:pl]] [[au:labo:pl]] de son périmètre.
- [[acc:gerant:Il:Elle]] ne voit pas les pages réservées au propriétaire listées ci-dessus ; sa page « Mon abonnement » est un résumé en lecture seule (statut du compte et configuration incluse).
- Dans les historiques ([[nom:appro:pl]], [[nom:perte:pl]], [[nom:inventaire:pl]]), [[acc:gerant:il:elle]] ne peut modifier ou supprimer que les opérations qu'[[acc:gerant:il:elle]] a [[acc:gerant:lui-même:elle-même]] saisies.
- Le client peut à tout moment [[acc:gerant:le:la]] **désactiver** (accès suspendu, sans suppression), [[acc:gerant:le:la]] **réactiver**, renvoyer l'invitation ou [[acc:gerant:le:la]] supprimer.

Jusqu'à 3 comptes [[nom:gerant:pl]] sont inclus ; au-delà, chaque [[nom:gerant]] supplémentaire est [[acc:gerant:facturé:facturée]] **80 DT/mois** et [[acc:gerant:soumis:soumise]] à validation, dans la limite du quota de votre abonnement.

### [[Le:acheteur]] (portail de commande)

Si le module [[Court:acheteur:pl]] est actif, chaque [[nom:acheteur]] de votre carnet peut être **[[acc:acheteur:invité:invitée]]** à créer son compte portail. Ce rôle est externe et volontairement très limité :

- [[acc:acheteur:il:elle]] accède uniquement au **portail [[court:acheteur]]** : catalogue à ses tarifs, passage de commande, suivi de ses commandes et téléchargement de ses factures ;
- [[acc:acheteur:il:elle]] ne voit **rien de votre gestion** : ni vos quantités en [[nom:stock]], ni vos prix d'achat, ni aucune autre page de LabFlow ;
- vous gérez ses accès depuis le [Carnet [[de:acheteur:pl:Nom]]](#acheteurs-carnet) : invitation, renvoi de l'invitation, désactivation ou suppression.

### Les modes du compte

| Mode | Effet |
|---|---|
| Actif | Compte opérationnel, toutes les fonctions disponibles |
| Lecture seule | Consultation possible, mais création et modification bloquées (abonnement impayé) |
| Bloqué / Désactivé | Accès suspendu |

- En **lecture seule**, un bandeau orange en haut de l'écran vous en informe, avec un bouton « Voir mon abonnement » pour régulariser.
- En **bloqué / désactivé**, un bandeau rouge vous invite à contacter l'administrateur.

### Points d'attention

:::attention
Le mode du compte s'applique à tous ses utilisateurs : si le compte passe en lecture seule, [[le:gerant:pl]] sont [[acc:gerant:eux:elles]] aussi [[acc:gerant:limité:limitée:pl]] à la consultation.
:::

:::astuce
En lecture seule, vos données restent consultables : rien n'est perdu. Régularisez le paiement depuis Mon abonnement pour retrouver toutes les fonctions.
:::

### Voir aussi

- [[[Nom:gerant:pl]]](#gerants) — créer et gérer les collaborateurs
- [Le portail [[court:acheteur]]](#acheteurs-portail) — l'espace de vos clients professionnels
- [Tableau de bord [[nom:gerant]]](#dashboard-gerant)
- [Abonnement](#abonnement)
- [Support](#support)
- [Le modèle : compte, [[nom:activite:pl]], [[nom:labo:pl]]](#compte-activites-labos)$v196_usine_roles$, NULL, 'brouillon', 'd4c7e9e042403593214fc4bdf068a034'
    FROM manuel_sections s WHERE s.slug = 'roles'
  ON CONFLICT (section_id, domaine_slug) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  n_usine := n_usine + n;
  IF n = 0 AND NOT EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'roles') THEN fiches_absentes := fiches_absentes || 'roles'::TEXT; END IF;
  IF NOT EXISTS (SELECT 1 FROM domaines_activite WHERE slug = 'hotellerie') THEN absents := absents || 'hotellerie'::TEXT; END IF;
  IF NOT EXISTS (SELECT 1 FROM domaines_activite WHERE slug = 'usine') THEN absents := absents || 'usine'::TEXT; END IF;
  RAISE NOTICE '%', '196 : ' || (n_hotellerie + n_usine) || ' brouillon(s) inséré(s) (hotellerie ' || n_hotellerie || ', usine ' || n_usine || ') ; domaines absents : '
    || COALESCE(NULLIF(array_to_string(absents, ', '), ''), 'aucun')
    || ' ; fiches absentes : ' || COALESCE(NULLIF(array_to_string(fiches_absentes, ', '), ''), 'aucune');
END
$v196$;
