-- 143 : Manuel v2 — contenu complet réécrit et enrichi (refonte manuel, lots 2-3)
-- Upsert par slug : met à jour les 31 sections v1 (nouvelles parties/ordres/contenus)
-- et ajoute les nouvelles fiches (lexique, onboarding, calculs, FAQ...).
-- contenu_defaut est aligné (rien n'a encore été modifié par l'admin en prod).

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('decouvrir-labflow', 'LabFlow en un coup d''œil', '🌟', 'Découvrir LabFlow', 1,
'## 🌟 LabFlow en un coup d''œil

LabFlow est une application de gestion dédiée aux métiers de bouche : restaurants, pâtisseries, traiteurs, cuisines centrales. Elle réunit dans un seul outil tout ce qui fait la rentabilité d''une cuisine professionnelle : le référentiel d''articles, les fiches techniques et le coût matière, les stocks de chaque site, la production en laboratoire, les transferts entre sites, les ventes et les rapports.

### Ce que LabFlow vous apporte

- **La maîtrise du coût matière** : chaque recette est décrite dans une fiche technique dont le coût de revient se calcule automatiquement à partir de vos prix d''achat réels. Quand un prix fournisseur évolue, vos coûts suivent.
- **Des stocks multi-sites** : chaque point de vente et chaque labo dispose de son propre stock, avec approvisionnements, inventaires, pertes et valeur de stock suivis site par site.
- **La production en laboratoire** : le labo fabrique vos produits transformés (crèmes, pâtes, plats préparés…), les ingrédients sont déduits automatiquement, et les boutiques sont approvisionnées par transfert.
- **La traçabilité** : chaque mouvement laisse une trace consultable — approvisionnements, pertes, transferts, inventaires, ventes — avec filtres et exports dans les pages d''historique.
- **Les ventes et les marges** : la saisie des ventes déduit le stock et alimente vos indicateurs : chiffre d''affaires, food cost, marge brute, valeur du stock, pertes, panier moyen.

Tous les montants sont exprimés en **DT**. Les prix d''achat se saisissent en HT avec leur taux de TVA, et l''application affiche les valeurs en TTC dans les rapports et tableaux de bord (voir [la règle HT/TTC](#calc-ht-ttc)).

### Pour qui ?

LabFlow s''adapte à la taille de votre organisation grâce à un modèle unique : un compte regroupe une ou plusieurs **activités** (points de vente, cuisines) et, si besoin, un ou plusieurs **labos** de production.

- Le **restaurant indépendant** : une seule activité, tout se gère au même endroit.
- La **pâtisserie avec laboratoire central** : le labo produit, les boutiques vendent, les transferts font le lien.
- Le **traiteur ou groupe multi-sites** : plusieurs activités, chacune avec son stock et ses prix de vente, et des rapports pour piloter l''ensemble.

Le détail de ce modèle est expliqué dans [Le modèle : compte, activités, labos](#compte-activites-labos).

### Les grands modules

| Module | Ce qu''il couvre |
|---|---|
| Référentiel | Unités, familles, catégories et articles : la base commune de votre compte |
| Espace Produits | Produits vendables, utilisables et valorisés, avec leurs fiches techniques |
| Espace Activités | Stock, approvisionnements, factures, pertes et inventaires de chaque point de vente |
| Espace Labo | Stock du labo, production, transferts vers les activités |
| Espace Vente | Prix de vente, prestataires, charges, saisie des ventes et rapport de vente |
| Gestion | Tableau de bord, rapports, fournisseurs, gérants, abonnement |

:::astuce
Sur la plupart des écrans, un petit bouton « ? » ouvre ce manuel directement à la page concernée. Vous retrouvez aussi le lien Manuel d''utilisation en bas du menu latéral.
:::

### Voir aussi

- [Le modèle : compte, activités, labos](#compte-activites-labos)
- [Parcours de démarrage](#demarrage)
- [Lexique](#lexique)
- [Tableau de bord](#dashboard)
- [Fiches techniques](#fiches-techniques)',
'## 🌟 LabFlow en un coup d''œil

LabFlow est une application de gestion dédiée aux métiers de bouche : restaurants, pâtisseries, traiteurs, cuisines centrales. Elle réunit dans un seul outil tout ce qui fait la rentabilité d''une cuisine professionnelle : le référentiel d''articles, les fiches techniques et le coût matière, les stocks de chaque site, la production en laboratoire, les transferts entre sites, les ventes et les rapports.

### Ce que LabFlow vous apporte

- **La maîtrise du coût matière** : chaque recette est décrite dans une fiche technique dont le coût de revient se calcule automatiquement à partir de vos prix d''achat réels. Quand un prix fournisseur évolue, vos coûts suivent.
- **Des stocks multi-sites** : chaque point de vente et chaque labo dispose de son propre stock, avec approvisionnements, inventaires, pertes et valeur de stock suivis site par site.
- **La production en laboratoire** : le labo fabrique vos produits transformés (crèmes, pâtes, plats préparés…), les ingrédients sont déduits automatiquement, et les boutiques sont approvisionnées par transfert.
- **La traçabilité** : chaque mouvement laisse une trace consultable — approvisionnements, pertes, transferts, inventaires, ventes — avec filtres et exports dans les pages d''historique.
- **Les ventes et les marges** : la saisie des ventes déduit le stock et alimente vos indicateurs : chiffre d''affaires, food cost, marge brute, valeur du stock, pertes, panier moyen.

Tous les montants sont exprimés en **DT**. Les prix d''achat se saisissent en HT avec leur taux de TVA, et l''application affiche les valeurs en TTC dans les rapports et tableaux de bord (voir [la règle HT/TTC](#calc-ht-ttc)).

### Pour qui ?

LabFlow s''adapte à la taille de votre organisation grâce à un modèle unique : un compte regroupe une ou plusieurs **activités** (points de vente, cuisines) et, si besoin, un ou plusieurs **labos** de production.

- Le **restaurant indépendant** : une seule activité, tout se gère au même endroit.
- La **pâtisserie avec laboratoire central** : le labo produit, les boutiques vendent, les transferts font le lien.
- Le **traiteur ou groupe multi-sites** : plusieurs activités, chacune avec son stock et ses prix de vente, et des rapports pour piloter l''ensemble.

Le détail de ce modèle est expliqué dans [Le modèle : compte, activités, labos](#compte-activites-labos).

### Les grands modules

| Module | Ce qu''il couvre |
|---|---|
| Référentiel | Unités, familles, catégories et articles : la base commune de votre compte |
| Espace Produits | Produits vendables, utilisables et valorisés, avec leurs fiches techniques |
| Espace Activités | Stock, approvisionnements, factures, pertes et inventaires de chaque point de vente |
| Espace Labo | Stock du labo, production, transferts vers les activités |
| Espace Vente | Prix de vente, prestataires, charges, saisie des ventes et rapport de vente |
| Gestion | Tableau de bord, rapports, fournisseurs, gérants, abonnement |

:::astuce
Sur la plupart des écrans, un petit bouton « ? » ouvre ce manuel directement à la page concernée. Vous retrouvez aussi le lien Manuel d''utilisation en bas du menu latéral.
:::

### Voir aussi

- [Le modèle : compte, activités, labos](#compte-activites-labos)
- [Parcours de démarrage](#demarrage)
- [Lexique](#lexique)
- [Tableau de bord](#dashboard)
- [Fiches techniques](#fiches-techniques)',
'présentation, découverte, coût matière, food cost, stocks multi-sites, labo, production, traçabilité, ventes, marges, modules, cuisine professionnelle', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('compte-activites-labos', 'Le modèle : compte, activités, labos', '🏢', 'Découvrir LabFlow', 2,
'## 🏢 Le modèle : compte, activités, labos

Toute l''organisation de LabFlow repose sur trois niveaux : le **compte**, les **activités** et les **labos**. Comprendre qui possède quoi est la clé de lecture de tous les autres écrans.

### Les trois niveaux

- **Le compte** : c''est votre entreprise dans LabFlow. Il porte l''abonnement, qui fixe vos quotas : nombre d''activités, de labos et de comptes gérants. Les compteurs d''activités et de labos s''affichent sur la page Mes Activités, celui des gérants sur la page Gérants. Il n''y a pas de distinction entre indépendant et entreprise : le même modèle s''adapte à toutes les tailles.
- **Les activités (1 à N)** : vos points de vente ou cuisines — boutique, restaurant, kiosque… Chaque activité vend, consomme et gère son propre stock.
- **Les labos (0 à N)** : vos sites de production. Un labo fabrique des produits transformés et approvisionne les activités qui lui sont rattachées **exclusivement par transfert**.

### Qui possède quoi ?

| Élément | Niveau | En pratique |
|---|---|---|
| Référentiel (unités, familles, catégories, articles) | Compte | Défini une seule fois, partagé par tous les sites |
| Sélection d''articles | Activité / labo | Chaque site n''utilise que les articles qu''on lui a assignés |
| Stock, appros, inventaires, pertes | Activité / labo | Chaque site a les siens, suivis séparément |
| Produits et fiches techniques | Activité / labo | Un produit est affecté aux sites qui le fabriquent ou le vendent |
| Ventes et prix de vente | Activité / labo | Chaque point de vente a ses prix et ses ventes ; le labo peut aussi saisir ses ventes directes |

### Le lien activité ↔ labo

Dès qu''un labo existe sur votre compte, la création ou la modification d''une activité vous propose deux options :

- **Avec labo** : l''activité est rattachée à un labo qui l''approvisionne par transfert — la production du labo arrive dans le stock de la boutique à chaque transfert.
- **Sans labo** : l''activité gère seule ses approvisionnements auprès de ses fournisseurs.

Une même entreprise peut mélanger les deux : des boutiques rattachées au labo et un point de vente autonome, par exemple.

### Trois exemples concrets

- **Pâtisserie avec labo central** : 1 labo + 3 boutiques. Le labo produit crèmes, entremets et viennoiseries ; chaque boutique reçoit sa production par transfert et saisit ses propres ventes. Le référentiel (farine, beurre, sucre…) est commun à tous.
- **Restaurant simple** : 1 activité, 0 labo. Le restaurant fait ses achats, ses fiches techniques et ses ventes ; le modèle reste le même, simplement sans Espace Labo.
- **Traiteur multi-sites** : 1 labo de production + 2 points de vente. Le labo prépare, les sites vendent, et les rapports donnent la vision d''ensemble du compte.

:::regle
Le référentiel est commun au compte ; les stocks sont locaux à chaque site. Un article se crée une seule fois, mais son stock et son prix moyen pondéré vivent séparément dans chaque activité et chaque labo.
:::

:::attention
Un produit transformé d''origine labo ne peut être approvisionné côté activité que par transfert : pas de saisie d''achat directe pour ces produits en boutique. Voir [les produits transformés](#lexique-pt).
:::

### Voir aussi

- [Parcours de démarrage](#demarrage)
- [Activités](#activites) — l''écran de gestion de vos sites
- [Transferts](#transferts)
- [Rôles & accès](#roles)
- [Calculs : les transferts](#calc-transferts)',
'## 🏢 Le modèle : compte, activités, labos

Toute l''organisation de LabFlow repose sur trois niveaux : le **compte**, les **activités** et les **labos**. Comprendre qui possède quoi est la clé de lecture de tous les autres écrans.

### Les trois niveaux

- **Le compte** : c''est votre entreprise dans LabFlow. Il porte l''abonnement, qui fixe vos quotas : nombre d''activités, de labos et de comptes gérants. Les compteurs d''activités et de labos s''affichent sur la page Mes Activités, celui des gérants sur la page Gérants. Il n''y a pas de distinction entre indépendant et entreprise : le même modèle s''adapte à toutes les tailles.
- **Les activités (1 à N)** : vos points de vente ou cuisines — boutique, restaurant, kiosque… Chaque activité vend, consomme et gère son propre stock.
- **Les labos (0 à N)** : vos sites de production. Un labo fabrique des produits transformés et approvisionne les activités qui lui sont rattachées **exclusivement par transfert**.

### Qui possède quoi ?

| Élément | Niveau | En pratique |
|---|---|---|
| Référentiel (unités, familles, catégories, articles) | Compte | Défini une seule fois, partagé par tous les sites |
| Sélection d''articles | Activité / labo | Chaque site n''utilise que les articles qu''on lui a assignés |
| Stock, appros, inventaires, pertes | Activité / labo | Chaque site a les siens, suivis séparément |
| Produits et fiches techniques | Activité / labo | Un produit est affecté aux sites qui le fabriquent ou le vendent |
| Ventes et prix de vente | Activité / labo | Chaque point de vente a ses prix et ses ventes ; le labo peut aussi saisir ses ventes directes |

### Le lien activité ↔ labo

Dès qu''un labo existe sur votre compte, la création ou la modification d''une activité vous propose deux options :

- **Avec labo** : l''activité est rattachée à un labo qui l''approvisionne par transfert — la production du labo arrive dans le stock de la boutique à chaque transfert.
- **Sans labo** : l''activité gère seule ses approvisionnements auprès de ses fournisseurs.

Une même entreprise peut mélanger les deux : des boutiques rattachées au labo et un point de vente autonome, par exemple.

### Trois exemples concrets

- **Pâtisserie avec labo central** : 1 labo + 3 boutiques. Le labo produit crèmes, entremets et viennoiseries ; chaque boutique reçoit sa production par transfert et saisit ses propres ventes. Le référentiel (farine, beurre, sucre…) est commun à tous.
- **Restaurant simple** : 1 activité, 0 labo. Le restaurant fait ses achats, ses fiches techniques et ses ventes ; le modèle reste le même, simplement sans Espace Labo.
- **Traiteur multi-sites** : 1 labo de production + 2 points de vente. Le labo prépare, les sites vendent, et les rapports donnent la vision d''ensemble du compte.

:::regle
Le référentiel est commun au compte ; les stocks sont locaux à chaque site. Un article se crée une seule fois, mais son stock et son prix moyen pondéré vivent séparément dans chaque activité et chaque labo.
:::

:::attention
Un produit transformé d''origine labo ne peut être approvisionné côté activité que par transfert : pas de saisie d''achat directe pour ces produits en boutique. Voir [les produits transformés](#lexique-pt).
:::

### Voir aussi

- [Parcours de démarrage](#demarrage)
- [Activités](#activites) — l''écran de gestion de vos sites
- [Transferts](#transferts)
- [Rôles & accès](#roles)
- [Calculs : les transferts](#calc-transferts)',
'compte, activité, labo, point de vente, laboratoire, modèle, organisation, multi-sites, transfert, référentiel commun, quotas, rattachement', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('demarrage', 'Parcours de démarrage', '🚀', 'Découvrir LabFlow', 3,
'## 🚀 Parcours de démarrage

LabFlow se découvre dans l''ordre : le menu latéral se **déverrouille progressivement** à mesure que votre compte se construit. Les entrées non encore accessibles sont grisées avec un cadenas 🔒, et un bandeau en haut du menu vous indique à chaque instant la prochaine action attendue.

### Comment le menu se déverrouille

| Ce que vous faites | Ce qui s''ouvre |
|---|---|
| Première connexion : changement du mot de passe | Mes Activités |
| Création de la première activité ou du labo | Référentiel, Tableau de bord, Rapports, Fournisseurs, Gérants |
| Création du premier article au référentiel | Espace Produits |
| Premier article sélectionné pour une activité | Espace Activités |
| Premier article affecté au labo | Espace Labo |

L''Espace Vente apparaît quant à lui lorsque le module vente est activé sur votre compte et qu''un premier article existe au référentiel. Dès la création de votre première activité ou de votre labo, l''application vous emmène automatiquement vers le Référentiel, à la page Unités : c''est la suite logique du parcours.

### Actions pas à pas

1. **Créez vos sites** — Dans **Mes Activités**, utilisez le bouton « Créer mon business » (proposé si votre abonnement inclut un labo) pour créer votre labo puis vos activités en deux étapes, ou « + Ajouter mon activité » sinon. Pour chaque activité approvisionnée par le labo, choisissez l''option « Avec labo ». Voir [Activités](#activites).
2. **Construisez le référentiel** — Dans l''ordre : [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories), puis [Articles](#referentiel-articles) avec leur prix d''achat HT et leur taux de TVA. Le menu Ajout Dynamique accélère la création en masse ([import](#referentiel-import)).
3. **Assignez les articles** — Indiquez quels articles sont utilisés par chaque activité et par le labo : c''est cette affectation qui déverrouille les espaces correspondants. Voir le [catalogue global](#catalogue-global).
4. **Mettez vos stocks à niveau** — Saisissez vos approvisionnements dans [Stock Activités](#stock-activites) et [Stock Labo](#stock-labo) : quantités, prix, fournisseur. C''est de là que viennent vos coûts réels.
5. **Créez vos produits et fiches techniques** — Dans l''Espace Produits, composez vos recettes : le coût de revient se calcule automatiquement. Voir [Fiches techniques](#fiches-techniques) et [le calcul du coût de recette](#calc-cout-recette).
6. **Passez à la vente** — Configurez vos prix de vente ([Configuration Vente](#configuration-vente)) puis enregistrez vos ventes ([Saisie des ventes](#saisie-ventes)).

### Points d''attention

:::attention
Tant qu''aucun article n''est assigné à une activité ou au labo, les espaces correspondants restent verrouillés — même si vos articles existent déjà au référentiel. Le bandeau du menu vous le rappelle.
:::

:::astuce
Créez d''abord toutes vos unités et familles avant d''attaquer les articles : vous éviterez les allers-retours. Et à tout moment, le bouton « ? » présent sur les écrans ouvre ce manuel à la bonne page.
:::

### Voir aussi

- [Le modèle : compte, activités, labos](#compte-activites-labos)
- [Suivi de l''onboarding](#onboarding-suivi)
- [Rôles & accès](#roles)
- [FAQ](#faq)',
'## 🚀 Parcours de démarrage

LabFlow se découvre dans l''ordre : le menu latéral se **déverrouille progressivement** à mesure que votre compte se construit. Les entrées non encore accessibles sont grisées avec un cadenas 🔒, et un bandeau en haut du menu vous indique à chaque instant la prochaine action attendue.

### Comment le menu se déverrouille

| Ce que vous faites | Ce qui s''ouvre |
|---|---|
| Première connexion : changement du mot de passe | Mes Activités |
| Création de la première activité ou du labo | Référentiel, Tableau de bord, Rapports, Fournisseurs, Gérants |
| Création du premier article au référentiel | Espace Produits |
| Premier article sélectionné pour une activité | Espace Activités |
| Premier article affecté au labo | Espace Labo |

L''Espace Vente apparaît quant à lui lorsque le module vente est activé sur votre compte et qu''un premier article existe au référentiel. Dès la création de votre première activité ou de votre labo, l''application vous emmène automatiquement vers le Référentiel, à la page Unités : c''est la suite logique du parcours.

### Actions pas à pas

1. **Créez vos sites** — Dans **Mes Activités**, utilisez le bouton « Créer mon business » (proposé si votre abonnement inclut un labo) pour créer votre labo puis vos activités en deux étapes, ou « + Ajouter mon activité » sinon. Pour chaque activité approvisionnée par le labo, choisissez l''option « Avec labo ». Voir [Activités](#activites).
2. **Construisez le référentiel** — Dans l''ordre : [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories), puis [Articles](#referentiel-articles) avec leur prix d''achat HT et leur taux de TVA. Le menu Ajout Dynamique accélère la création en masse ([import](#referentiel-import)).
3. **Assignez les articles** — Indiquez quels articles sont utilisés par chaque activité et par le labo : c''est cette affectation qui déverrouille les espaces correspondants. Voir le [catalogue global](#catalogue-global).
4. **Mettez vos stocks à niveau** — Saisissez vos approvisionnements dans [Stock Activités](#stock-activites) et [Stock Labo](#stock-labo) : quantités, prix, fournisseur. C''est de là que viennent vos coûts réels.
5. **Créez vos produits et fiches techniques** — Dans l''Espace Produits, composez vos recettes : le coût de revient se calcule automatiquement. Voir [Fiches techniques](#fiches-techniques) et [le calcul du coût de recette](#calc-cout-recette).
6. **Passez à la vente** — Configurez vos prix de vente ([Configuration Vente](#configuration-vente)) puis enregistrez vos ventes ([Saisie des ventes](#saisie-ventes)).

### Points d''attention

:::attention
Tant qu''aucun article n''est assigné à une activité ou au labo, les espaces correspondants restent verrouillés — même si vos articles existent déjà au référentiel. Le bandeau du menu vous le rappelle.
:::

:::astuce
Créez d''abord toutes vos unités et familles avant d''attaquer les articles : vous éviterez les allers-retours. Et à tout moment, le bouton « ? » présent sur les écrans ouvre ce manuel à la bonne page.
:::

### Voir aussi

- [Le modèle : compte, activités, labos](#compte-activites-labos)
- [Suivi de l''onboarding](#onboarding-suivi)
- [Rôles & accès](#roles)
- [FAQ](#faq)',
'démarrage, premiers pas, prise en main, parcours, déverrouillage, menu, cadenas, onboarding, référentiel, articles, assignation, guide', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('roles', 'Rôles & accès', '👤', 'Découvrir LabFlow', 4,
'## 👤 Rôles & accès

Un compte LabFlow distingue deux rôles : le **client**, propriétaire du compte, et le **gérant**, collaborateur invité sur un périmètre précis. S''y ajoute le **mode du compte** (actif, lecture seule, bloqué), qui dépend de la situation de votre abonnement.

### Le client (propriétaire)

Le client dispose de l''accès complet : activités et labos, référentiel, produits et fiches techniques, stocks, ventes, rapports, fournisseurs — ainsi que les pages réservées au propriétaire :

- **Mes Activités** : création et modification des sites ;
- **Gérants** : invitation et gestion des collaborateurs ;
- **Mon abonnement** et **Historique paiements** ;
- dans l''Espace Vente : **Config Charges** et **Rapport Vente**.

### Le gérant (collaborateur)

Le gérant est créé par le client depuis la page [Gérants](#gerants) : nom, téléphone, e-mail, et surtout **les activités et labos qui lui sont assignés** (au moins un est obligatoire). Il reçoit une invitation par e-mail et active lui-même son compte.

- Son périmètre est limité aux activités et labos affectés : il y travaille au quotidien (stocks, approvisionnements, inventaires, ventes…).
- Il ne voit pas les pages réservées au propriétaire listées ci-dessus ; sa page « Mon abonnement » est un résumé en lecture seule (statut du compte et configuration incluse).
- Dans les historiques (approvisionnements, pertes, inventaires), il ne peut modifier ou supprimer que les opérations qu''il a lui-même saisies.
- Le client peut à tout moment le **désactiver** (accès suspendu, sans suppression), le **réactiver**, renvoyer l''invitation ou le supprimer.

Jusqu''à 3 comptes gérants sont inclus ; au-delà, chaque gérant supplémentaire est facturé **80 DT/mois** et soumis à validation, dans la limite du quota de votre abonnement.

### Les modes du compte

| Mode | Effet |
|---|---|
| Actif | Compte opérationnel, toutes les fonctions disponibles |
| Lecture seule | Consultation possible, mais création et modification bloquées (abonnement impayé) |
| Bloqué / Désactivé | Accès suspendu |

- En **lecture seule**, un bandeau orange en haut de l''écran vous en informe, avec un bouton « Voir mon abonnement » pour régulariser.
- En **bloqué / désactivé**, un bandeau rouge vous invite à contacter l''administrateur.

### Points d''attention

:::attention
Le mode du compte s''applique à tous ses utilisateurs : si le compte passe en lecture seule, les gérants sont eux aussi limités à la consultation.
:::

:::astuce
En lecture seule, vos données restent consultables : rien n''est perdu. Régularisez le paiement depuis Mon abonnement pour retrouver toutes les fonctions.
:::

### Voir aussi

- [Gérants](#gerants) — créer et gérer les collaborateurs
- [Tableau de bord gérant](#dashboard-gerant)
- [Abonnement](#abonnement)
- [Support](#support)
- [Le modèle : compte, activités, labos](#compte-activites-labos)',
'## 👤 Rôles & accès

Un compte LabFlow distingue deux rôles : le **client**, propriétaire du compte, et le **gérant**, collaborateur invité sur un périmètre précis. S''y ajoute le **mode du compte** (actif, lecture seule, bloqué), qui dépend de la situation de votre abonnement.

### Le client (propriétaire)

Le client dispose de l''accès complet : activités et labos, référentiel, produits et fiches techniques, stocks, ventes, rapports, fournisseurs — ainsi que les pages réservées au propriétaire :

- **Mes Activités** : création et modification des sites ;
- **Gérants** : invitation et gestion des collaborateurs ;
- **Mon abonnement** et **Historique paiements** ;
- dans l''Espace Vente : **Config Charges** et **Rapport Vente**.

### Le gérant (collaborateur)

Le gérant est créé par le client depuis la page [Gérants](#gerants) : nom, téléphone, e-mail, et surtout **les activités et labos qui lui sont assignés** (au moins un est obligatoire). Il reçoit une invitation par e-mail et active lui-même son compte.

- Son périmètre est limité aux activités et labos affectés : il y travaille au quotidien (stocks, approvisionnements, inventaires, ventes…).
- Il ne voit pas les pages réservées au propriétaire listées ci-dessus ; sa page « Mon abonnement » est un résumé en lecture seule (statut du compte et configuration incluse).
- Dans les historiques (approvisionnements, pertes, inventaires), il ne peut modifier ou supprimer que les opérations qu''il a lui-même saisies.
- Le client peut à tout moment le **désactiver** (accès suspendu, sans suppression), le **réactiver**, renvoyer l''invitation ou le supprimer.

Jusqu''à 3 comptes gérants sont inclus ; au-delà, chaque gérant supplémentaire est facturé **80 DT/mois** et soumis à validation, dans la limite du quota de votre abonnement.

### Les modes du compte

| Mode | Effet |
|---|---|
| Actif | Compte opérationnel, toutes les fonctions disponibles |
| Lecture seule | Consultation possible, mais création et modification bloquées (abonnement impayé) |
| Bloqué / Désactivé | Accès suspendu |

- En **lecture seule**, un bandeau orange en haut de l''écran vous en informe, avec un bouton « Voir mon abonnement » pour régulariser.
- En **bloqué / désactivé**, un bandeau rouge vous invite à contacter l''administrateur.

### Points d''attention

:::attention
Le mode du compte s''applique à tous ses utilisateurs : si le compte passe en lecture seule, les gérants sont eux aussi limités à la consultation.
:::

:::astuce
En lecture seule, vos données restent consultables : rien n''est perdu. Régularisez le paiement depuis Mon abonnement pour retrouver toutes les fonctions.
:::

### Voir aussi

- [Gérants](#gerants) — créer et gérer les collaborateurs
- [Tableau de bord gérant](#dashboard-gerant)
- [Abonnement](#abonnement)
- [Support](#support)
- [Le modèle : compte, activités, labos](#compte-activites-labos)',
'rôles, client, propriétaire, gérant, collaborateur, accès, permissions, périmètre, lecture seule, bloqué, invitation, abonnement', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('lexique', 'Lexique de A à Z', '📖', 'Lexique', 10,
'## 📖 Lexique LabFlow de A à Z

Ce lexique rassemble tout le vocabulaire utilisé dans LabFlow et dans ce manuel. Chaque terme est défini en une ou deux phrases, avec un exemple concret quand cela aide. Les montants sont exprimés en DT (dinar tunisien).

:::astuce
Utilisez la recherche de votre navigateur (Ctrl+F) pour retrouver un terme rapidement. Les notions liées aux produits transformés sont approfondies dans [Les 3 catégories de produits transformés](#lexique-pt).
:::

| Terme | Définition |
|---|---|
| **Activité** | Point de vente ou cuisine exploité par votre compte : restaurant, pâtisserie, kiosque… Un compte gère une ou plusieurs activités, chacune avec son stock, ses produits, ses prix et ses ventes. |
| **Appro (approvisionnement)** | Entrée de marchandise dans le stock : vous saisissez la quantité, le prix d''achat HT et le taux de TVA. Un appro peut provenir d''un achat auprès d''un fournisseur, d''un transfert depuis le labo ou d''une production de produit transformé. |
| **Article** | Élément de base du référentiel : ingrédient ou produit acheté (farine, beurre, boisson…), défini par un nom, une unité et une catégorie. Le stock, les recettes et les coûts s''appuient tous sur les articles. |
| **Avenant** | Modification de votre contrat d''abonnement (ajout d''une activité, d''un labo, d''une option…). L''avenant vous est envoyé par e-mail pour signature électronique et le document signé reste téléchargeable. |
| **Catégorie** | Deux notions distinctes : la *catégorie d''articles* (référentiel) affine une famille (ex. « Volaille » dans la famille « Viandes ») ; la *catégorie de produits* (Espace Produit) classe ce qui se vend (ex. « Desserts ») et est typée vendable, supplément ou valorisé. |
| **Charge** | Dépense d''exploitation hors matière première : énergie, emballages, main-d''œuvre… Saisie dans l''Espace Vente, elle affine l''analyse de rentabilité au-delà du seul coût matière. |
| **Coefficient multiplicateur** | Rapport entre le prix de vente et le coût matière d''un produit. Un plat dont la matière coûte 4 DT et vendu 12 DT a un coefficient de 3. |
| **Composé valorisé** | Produit transformé fabriqué au labo puis transféré vers les activités, où il se vend tel quel (ex. un entremets fabriqué au labo et revendu en boutique). Son prix de revient est figé au coût du labo au moment de la production. |
| **Domaine d''activité** | Secteur métier de votre compte (restauration, pâtisserie, café…). Il détermine le catalogue d''articles qui vous est proposé à la création du compte. |
| **Famille** | Regroupement de catégories d''articles (« Viandes », « Boissons »…) portant deux propriétés clés : *consommable* (utilisé en cuisine) et *vendable* (vendu tel quel). Ces propriétés déterminent où chaque article peut être utilisé. |
| **Fiche technique** | Recette chiffrée d''un produit : liste des articles et produits utilisables avec leurs portions, et calcul automatique du coût de revient matière. C''est l''outil central du chiffrage de votre carte. |
| **Food cost (coût matière)** | Coût des matières premières consommées pour produire un plat, souvent rapporté à son prix de vente. Un plat vendu 15 DT dont les ingrédients coûtent 4,500 DT a un food cost de 30 %. |
| **Fournisseur** | Tiers auprès duquel vous achetez vos marchandises. Il est associé aux approvisionnements et aux factures pour tracer l''origine de chaque achat. |
| **Gérant** | Utilisateur délégué par le propriétaire du compte. Son accès est limité aux activités et aux labos qui lui sont affectés. |
| **HT / TTC** | Hors taxes / toutes taxes comprises. Dans LabFlow, les prix d''achat se saisissent en HT avec le taux de TVA ; l''affichage courant (stock, produits transformés, rapports, tableaux de bord) est en TTC. |
| **Inventaire** | Comptage physique du stock à une date donnée. La quantité réelle saisie devient la nouvelle référence du stock ; le stock théorique affiché pendant la saisie permet de repérer les écarts. |
| **Labo** | Laboratoire central de production rattaché au compte. Il achète et fabrique en gros, puis alimente les activités par transfert. Un compte peut avoir zéro, un ou plusieurs labos. |
| **Marge** | Différence entre le prix de vente et le coût matière. Un dessert vendu 8 DT avec 2 DT de matière dégage 6 DT de marge brute. |
| **Mode de compte** | État d''accès du compte selon la situation de l''abonnement : *actif* (toutes les fonctions), *lecture seule* (consultation sans modification) ou *bloqué / désactivé* (accès restreint). |
| **Perte (avarie / déchet)** | Marchandise sortie du stock sans être vendue : *avarie* (produit périmé, abîmé, impropre) ou *déchet* (parures, casse, ratés de production). Chaque perte est valorisée en TTC dans les rapports. |
| **PMP** | Prix moyen pondéré : prix unitaire moyen d''un article, pondéré par les quantités achetées. 10 kg achetés à 8 DT puis 5 kg à 11 DT donnent un PMP de 9 DT/kg ; il sert à valoriser le stock et les transferts. |
| **Prestataire** | Canal de vente tiers (plateforme de livraison, revendeur…) pour lequel vous définissez un prix de vente dédié, saisi manuellement dans la configuration de vente. |
| **Produit transformé (PT)** | Produit fabriqué à partir d''une recette et suivi en stock : sa production déduit automatiquement les ingrédients et sous-préparations consommés. Trois catégories existent : utilisables, vendables et composés valorisés. |
| **Produit utilisable** | Produit transformé intermédiaire, non vendu tel quel, réutilisé dans d''autres recettes : crème pâtissière, sauce de base, pâte… Son coût se répercute automatiquement dans tous les produits qui l''utilisent. |
| **Produit valorisé** | Produit vendu tel quel, sans décomposition de recette au moment de la vente : article de revente (ex. boisson en bouteille) ou produit composé fabriqué au labo. |
| **Produit vendable** | Produit fini défini par une fiche technique et vendu par une activité : plat, dessert, formule… Il est obligatoirement rattaché à une catégorie de produit. |
| **PV (prix de vente)** | Prix auquel un produit est vendu au client. LabFlow distingue le prix direct (vente au comptoir) et les prix propres à chaque prestataire. |
| **Recette** | Composition d''un produit : articles et produits utilisables avec leurs portions. Elle sert à la fois au calcul du coût de revient et à la déduction du stock. |
| **Référentiel** | Socle de données du compte : unités, familles, catégories et articles. Tout le reste (stock, recettes, ventes) s''appuie dessus. |
| **Seuil d''alerte** | Quantité minimale définie pour un article ou un produit transformé : lorsque le stock passe en dessous, la ligne est signalée pour réapprovisionnement. Pour les produits transformés, le seuil se règle par activité. |
| **Stock théorique** | Stock calculé par l''application : dernier inventaire + approvisionnements − pertes − transferts sortants − consommations (ventes, productions). L''inventaire le réconcilie avec le stock réel compté. |
| **Supplément** | Produit vendable complémentaire proposé en plus d''un produit principal : sauce, garniture, extra… Il a sa propre fiche technique et son propre prix de vente. |
| **Transfert** | Mouvement de marchandise du labo vers une activité : le stock du labo diminue, celui de l''activité augmente, au coût du labo. C''est la seule voie d''entrée en stock, côté activité, des produits fabriqués au labo. |
| **TVA** | Taxe sur la valeur ajoutée. Le taux se saisit à l''approvisionnement, article par article, et sert au calcul des prix TTC. |
| **Unité** | Unité de mesure d''un article : kg, litre, gramme, pièce, portion… Utilisez la même unité à l''achat et en recette pour obtenir des coûts justes. |
| **Valorisation** | Expression en argent d''une quantité : valeur du stock, d''une perte ou d''une production, obtenue en multipliant la quantité par le prix unitaire (PMP ou coût de recette). |

### Voir aussi

- [Les 3 catégories de produits transformés](#lexique-pt) — le détail des PT utilisables, vendables et composés valorisés
- [Un compte, des activités, des labos](#compte-activites-labos) et [Rôles & accès](#roles) — l''organisation de votre compte
- [Le coût d''une recette](#calc-cout-recette), [Le PMP](#calc-pmp) et [HT et TTC](#calc-ht-ttc) — les calculs expliqués pas à pas
- [Les seuils d''alerte](#calc-seuils) et [La valeur du stock](#calc-valeur-stock)',
'## 📖 Lexique LabFlow de A à Z

Ce lexique rassemble tout le vocabulaire utilisé dans LabFlow et dans ce manuel. Chaque terme est défini en une ou deux phrases, avec un exemple concret quand cela aide. Les montants sont exprimés en DT (dinar tunisien).

:::astuce
Utilisez la recherche de votre navigateur (Ctrl+F) pour retrouver un terme rapidement. Les notions liées aux produits transformés sont approfondies dans [Les 3 catégories de produits transformés](#lexique-pt).
:::

| Terme | Définition |
|---|---|
| **Activité** | Point de vente ou cuisine exploité par votre compte : restaurant, pâtisserie, kiosque… Un compte gère une ou plusieurs activités, chacune avec son stock, ses produits, ses prix et ses ventes. |
| **Appro (approvisionnement)** | Entrée de marchandise dans le stock : vous saisissez la quantité, le prix d''achat HT et le taux de TVA. Un appro peut provenir d''un achat auprès d''un fournisseur, d''un transfert depuis le labo ou d''une production de produit transformé. |
| **Article** | Élément de base du référentiel : ingrédient ou produit acheté (farine, beurre, boisson…), défini par un nom, une unité et une catégorie. Le stock, les recettes et les coûts s''appuient tous sur les articles. |
| **Avenant** | Modification de votre contrat d''abonnement (ajout d''une activité, d''un labo, d''une option…). L''avenant vous est envoyé par e-mail pour signature électronique et le document signé reste téléchargeable. |
| **Catégorie** | Deux notions distinctes : la *catégorie d''articles* (référentiel) affine une famille (ex. « Volaille » dans la famille « Viandes ») ; la *catégorie de produits* (Espace Produit) classe ce qui se vend (ex. « Desserts ») et est typée vendable, supplément ou valorisé. |
| **Charge** | Dépense d''exploitation hors matière première : énergie, emballages, main-d''œuvre… Saisie dans l''Espace Vente, elle affine l''analyse de rentabilité au-delà du seul coût matière. |
| **Coefficient multiplicateur** | Rapport entre le prix de vente et le coût matière d''un produit. Un plat dont la matière coûte 4 DT et vendu 12 DT a un coefficient de 3. |
| **Composé valorisé** | Produit transformé fabriqué au labo puis transféré vers les activités, où il se vend tel quel (ex. un entremets fabriqué au labo et revendu en boutique). Son prix de revient est figé au coût du labo au moment de la production. |
| **Domaine d''activité** | Secteur métier de votre compte (restauration, pâtisserie, café…). Il détermine le catalogue d''articles qui vous est proposé à la création du compte. |
| **Famille** | Regroupement de catégories d''articles (« Viandes », « Boissons »…) portant deux propriétés clés : *consommable* (utilisé en cuisine) et *vendable* (vendu tel quel). Ces propriétés déterminent où chaque article peut être utilisé. |
| **Fiche technique** | Recette chiffrée d''un produit : liste des articles et produits utilisables avec leurs portions, et calcul automatique du coût de revient matière. C''est l''outil central du chiffrage de votre carte. |
| **Food cost (coût matière)** | Coût des matières premières consommées pour produire un plat, souvent rapporté à son prix de vente. Un plat vendu 15 DT dont les ingrédients coûtent 4,500 DT a un food cost de 30 %. |
| **Fournisseur** | Tiers auprès duquel vous achetez vos marchandises. Il est associé aux approvisionnements et aux factures pour tracer l''origine de chaque achat. |
| **Gérant** | Utilisateur délégué par le propriétaire du compte. Son accès est limité aux activités et aux labos qui lui sont affectés. |
| **HT / TTC** | Hors taxes / toutes taxes comprises. Dans LabFlow, les prix d''achat se saisissent en HT avec le taux de TVA ; l''affichage courant (stock, produits transformés, rapports, tableaux de bord) est en TTC. |
| **Inventaire** | Comptage physique du stock à une date donnée. La quantité réelle saisie devient la nouvelle référence du stock ; le stock théorique affiché pendant la saisie permet de repérer les écarts. |
| **Labo** | Laboratoire central de production rattaché au compte. Il achète et fabrique en gros, puis alimente les activités par transfert. Un compte peut avoir zéro, un ou plusieurs labos. |
| **Marge** | Différence entre le prix de vente et le coût matière. Un dessert vendu 8 DT avec 2 DT de matière dégage 6 DT de marge brute. |
| **Mode de compte** | État d''accès du compte selon la situation de l''abonnement : *actif* (toutes les fonctions), *lecture seule* (consultation sans modification) ou *bloqué / désactivé* (accès restreint). |
| **Perte (avarie / déchet)** | Marchandise sortie du stock sans être vendue : *avarie* (produit périmé, abîmé, impropre) ou *déchet* (parures, casse, ratés de production). Chaque perte est valorisée en TTC dans les rapports. |
| **PMP** | Prix moyen pondéré : prix unitaire moyen d''un article, pondéré par les quantités achetées. 10 kg achetés à 8 DT puis 5 kg à 11 DT donnent un PMP de 9 DT/kg ; il sert à valoriser le stock et les transferts. |
| **Prestataire** | Canal de vente tiers (plateforme de livraison, revendeur…) pour lequel vous définissez un prix de vente dédié, saisi manuellement dans la configuration de vente. |
| **Produit transformé (PT)** | Produit fabriqué à partir d''une recette et suivi en stock : sa production déduit automatiquement les ingrédients et sous-préparations consommés. Trois catégories existent : utilisables, vendables et composés valorisés. |
| **Produit utilisable** | Produit transformé intermédiaire, non vendu tel quel, réutilisé dans d''autres recettes : crème pâtissière, sauce de base, pâte… Son coût se répercute automatiquement dans tous les produits qui l''utilisent. |
| **Produit valorisé** | Produit vendu tel quel, sans décomposition de recette au moment de la vente : article de revente (ex. boisson en bouteille) ou produit composé fabriqué au labo. |
| **Produit vendable** | Produit fini défini par une fiche technique et vendu par une activité : plat, dessert, formule… Il est obligatoirement rattaché à une catégorie de produit. |
| **PV (prix de vente)** | Prix auquel un produit est vendu au client. LabFlow distingue le prix direct (vente au comptoir) et les prix propres à chaque prestataire. |
| **Recette** | Composition d''un produit : articles et produits utilisables avec leurs portions. Elle sert à la fois au calcul du coût de revient et à la déduction du stock. |
| **Référentiel** | Socle de données du compte : unités, familles, catégories et articles. Tout le reste (stock, recettes, ventes) s''appuie dessus. |
| **Seuil d''alerte** | Quantité minimale définie pour un article ou un produit transformé : lorsque le stock passe en dessous, la ligne est signalée pour réapprovisionnement. Pour les produits transformés, le seuil se règle par activité. |
| **Stock théorique** | Stock calculé par l''application : dernier inventaire + approvisionnements − pertes − transferts sortants − consommations (ventes, productions). L''inventaire le réconcilie avec le stock réel compté. |
| **Supplément** | Produit vendable complémentaire proposé en plus d''un produit principal : sauce, garniture, extra… Il a sa propre fiche technique et son propre prix de vente. |
| **Transfert** | Mouvement de marchandise du labo vers une activité : le stock du labo diminue, celui de l''activité augmente, au coût du labo. C''est la seule voie d''entrée en stock, côté activité, des produits fabriqués au labo. |
| **TVA** | Taxe sur la valeur ajoutée. Le taux se saisit à l''approvisionnement, article par article, et sert au calcul des prix TTC. |
| **Unité** | Unité de mesure d''un article : kg, litre, gramme, pièce, portion… Utilisez la même unité à l''achat et en recette pour obtenir des coûts justes. |
| **Valorisation** | Expression en argent d''une quantité : valeur du stock, d''une perte ou d''une production, obtenue en multipliant la quantité par le prix unitaire (PMP ou coût de recette). |

### Voir aussi

- [Les 3 catégories de produits transformés](#lexique-pt) — le détail des PT utilisables, vendables et composés valorisés
- [Un compte, des activités, des labos](#compte-activites-labos) et [Rôles & accès](#roles) — l''organisation de votre compte
- [Le coût d''une recette](#calc-cout-recette), [Le PMP](#calc-pmp) et [HT et TTC](#calc-ht-ttc) — les calculs expliqués pas à pas
- [Les seuils d''alerte](#calc-seuils) et [La valeur du stock](#calc-valeur-stock)',
'lexique, glossaire, définitions, vocabulaire, termes, dictionnaire, abréviations, pmp, food cost, coût matière, ht ttc, pt', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('lexique-pt', 'Les 3 catégories de PT', '🧩', 'Lexique', 11,
'## 🧩 Les 3 catégories de produits transformés

Un **produit transformé (PT)** est un produit fabriqué à partir d''une recette et suivi en stock : quand vous en produisez, LabFlow déduit automatiquement du stock les articles et les sous-préparations consommés. Tous les PT ne jouent pas le même rôle : l''application les répartit en **trois catégories**, que vous retrouverez partout sous les libellés « Produits Transformés Utilisables », « Produits Transformés Vendables » et « Produits Composés Valorisés ».

### Vue d''ensemble

| Catégorie | Où on le produit | Où on le vend | Comment il arrive en stock |
|---|---|---|---|
| **Utilisable** (ex. crème pâtissière) | Dans l''activité ou au labo, selon les affectations du produit | Nulle part : il est consommé dans les recettes d''autres produits | Production sur place (saisie de la quantité produite) ou transfert depuis le labo ; certains sont limités au transfert |
| **Vendable** (ex. tarte au citron) | Dans l''activité | Par l''activité, lors de la saisie des ventes | Production dans l''activité, si le suivi de stock est activé pour ce produit (un labo peut aussi le gérer et l''envoyer par transfert) |
| **Composé valorisé** (ex. entremets fabriqué au labo) | Au labo uniquement | Par les activités, tel quel, comme un produit valorisé | Uniquement par transfert depuis le labo |

### 1. Les Utilisables — les intermédiaires de vos recettes

Un produit utilisable est une **préparation intermédiaire** : crème pâtissière, sauce de base, pâte, fond… Il n''est jamais vendu tel quel : il entre dans la composition des produits vendables, des composés valorisés, ou même d''autres produits utilisables (sous-préparations).

Son **mode d''approvisionnement** se choisit à la création du produit : soit chaque activité peut le produire librement sur place, soit il est fabriqué au labo et les activités le reçoivent **uniquement par transfert**. Dans ce second cas, la ligne du stock de l''activité porte l''indicateur « ⇄ Transfert uniquement » et la saisie directe de quantité y est bloquée.

### 2. Les Vendables — les produits finis de l''activité

Un PT vendable est un **produit fini vendu par l''activité** : tarte, plat cuisiné, dessert… Il est défini par une fiche technique et rattaché obligatoirement à une catégorie de produit. Le suivi en stock est **optionnel** : activé produit par produit, il permet de produire à l''avance (la production déduit les ingrédients de la recette) puis de suivre les quantités disponibles.

### 3. Les Composés Valorisés — fabriqués au labo, vendus tels quels

Un produit composé valorisé est **fabriqué au labo** à partir d''une recette (articles et produits utilisables du labo), puis **transféré** vers les activités qui le vendent **tel quel**, comme un produit valorisé. Il se gère depuis l''écran des [Produits valorisés](#articles-valorises), dans l''onglet « Composés », qui n''apparaît que si votre compte possède au moins un labo.

:::regle
Son coût se calcule sur les **prix d''achat du labo** et son prix de revient est **figé au moment de la production** : les variations ultérieures des prix du labo ne modifient pas la valeur des lots déjà produits. Côté activité, il n''arrive en stock **que par transfert** — jamais par saisie directe.
:::

Dans le stock du labo, ces produits sont repérables au badge « ◆ Composé valorisé ».

### Comment un PT arrive en stock

1. **Production** : dans l''écran de stock (activité ou labo), saisissez la quantité produite sur la ligne du PT. Aucun prix n''est demandé : le coût de la recette est calculé automatiquement (en TTC) et les ingrédients — y compris les sous-préparations — sont déduits du stock.
2. **Transfert** : pour les produits fabriqués au labo, le transfert diminue le stock du labo et augmente celui de l''activité, au coût du labo.

:::astuce
Chaque production reçoit une **référence automatique** construite à partir du nom du produit et de l''année : initiales de chaque mot pour un nom multi-mots (« Crème Pâtissière » produit en 2026 donne CP-26), trois premières lettres pour un nom d''un seul mot (« Cookies » donne COO-26). Vous la retrouverez dans les historiques pour tracer vos fabrications — voir [La traçabilité](#calc-tracabilite).
:::

:::attention
Vérifiez le stock de vos ingrédients avant de lancer une production : les quantités consommées par la recette sont déduites immédiatement. Dans la colonne du stock actuel, la ventilation détaille d''ailleurs les mouvements : appro, transferts, pertes et consommation PT.
:::

### Qui apparaît où

- **Dans les stocks** : les PT figurent aux côtés des articles, regroupés dans leur catégorie. Côté activité, les PT d''origine labo affichent « ⇄ Transfert uniquement » ; côté labo, les composés portent le badge « ◆ Composé valorisé ».
- **Dans les historiques et les exports** : les PT sont regroupés sous les trois catégories citées plus haut. Une catégorie n''apparaît que si elle contient au moins un produit.
- **Dans les filtres** : le filtre « Catégorie » des historiques d''approvisionnements (côté activité comme côté labo) et de l''historique des pertes du labo propose **trois options dédiées** — Produits Transformés Utilisables, Produits Transformés Vendables, Produits Composés Valorisés — en plus des catégories d''articles. En sélectionnant l''une d''elles, la liste « Article » affiche les produits transformés correspondants.

### Voir aussi

- [Lexique LabFlow de A à Z](#lexique) — les définitions de tous les termes
- [Produits Utilisables](#produits-utilisables) et [Produits Vendables](#produits-vendables) — créer et gérer vos PT
- [Produits valorisés](#articles-valorises) — dont l''onglet « Composés »
- [La production d''un PT](#calc-production-pt) et [Les transferts](#calc-transferts) — les calculs détaillés
- [Stock Labo](#stock-labo), [Transferts](#transferts) et [Historiques](#historique) — les écrans concernés',
'## 🧩 Les 3 catégories de produits transformés

Un **produit transformé (PT)** est un produit fabriqué à partir d''une recette et suivi en stock : quand vous en produisez, LabFlow déduit automatiquement du stock les articles et les sous-préparations consommés. Tous les PT ne jouent pas le même rôle : l''application les répartit en **trois catégories**, que vous retrouverez partout sous les libellés « Produits Transformés Utilisables », « Produits Transformés Vendables » et « Produits Composés Valorisés ».

### Vue d''ensemble

| Catégorie | Où on le produit | Où on le vend | Comment il arrive en stock |
|---|---|---|---|
| **Utilisable** (ex. crème pâtissière) | Dans l''activité ou au labo, selon les affectations du produit | Nulle part : il est consommé dans les recettes d''autres produits | Production sur place (saisie de la quantité produite) ou transfert depuis le labo ; certains sont limités au transfert |
| **Vendable** (ex. tarte au citron) | Dans l''activité | Par l''activité, lors de la saisie des ventes | Production dans l''activité, si le suivi de stock est activé pour ce produit (un labo peut aussi le gérer et l''envoyer par transfert) |
| **Composé valorisé** (ex. entremets fabriqué au labo) | Au labo uniquement | Par les activités, tel quel, comme un produit valorisé | Uniquement par transfert depuis le labo |

### 1. Les Utilisables — les intermédiaires de vos recettes

Un produit utilisable est une **préparation intermédiaire** : crème pâtissière, sauce de base, pâte, fond… Il n''est jamais vendu tel quel : il entre dans la composition des produits vendables, des composés valorisés, ou même d''autres produits utilisables (sous-préparations).

Son **mode d''approvisionnement** se choisit à la création du produit : soit chaque activité peut le produire librement sur place, soit il est fabriqué au labo et les activités le reçoivent **uniquement par transfert**. Dans ce second cas, la ligne du stock de l''activité porte l''indicateur « ⇄ Transfert uniquement » et la saisie directe de quantité y est bloquée.

### 2. Les Vendables — les produits finis de l''activité

Un PT vendable est un **produit fini vendu par l''activité** : tarte, plat cuisiné, dessert… Il est défini par une fiche technique et rattaché obligatoirement à une catégorie de produit. Le suivi en stock est **optionnel** : activé produit par produit, il permet de produire à l''avance (la production déduit les ingrédients de la recette) puis de suivre les quantités disponibles.

### 3. Les Composés Valorisés — fabriqués au labo, vendus tels quels

Un produit composé valorisé est **fabriqué au labo** à partir d''une recette (articles et produits utilisables du labo), puis **transféré** vers les activités qui le vendent **tel quel**, comme un produit valorisé. Il se gère depuis l''écran des [Produits valorisés](#articles-valorises), dans l''onglet « Composés », qui n''apparaît que si votre compte possède au moins un labo.

:::regle
Son coût se calcule sur les **prix d''achat du labo** et son prix de revient est **figé au moment de la production** : les variations ultérieures des prix du labo ne modifient pas la valeur des lots déjà produits. Côté activité, il n''arrive en stock **que par transfert** — jamais par saisie directe.
:::

Dans le stock du labo, ces produits sont repérables au badge « ◆ Composé valorisé ».

### Comment un PT arrive en stock

1. **Production** : dans l''écran de stock (activité ou labo), saisissez la quantité produite sur la ligne du PT. Aucun prix n''est demandé : le coût de la recette est calculé automatiquement (en TTC) et les ingrédients — y compris les sous-préparations — sont déduits du stock.
2. **Transfert** : pour les produits fabriqués au labo, le transfert diminue le stock du labo et augmente celui de l''activité, au coût du labo.

:::astuce
Chaque production reçoit une **référence automatique** construite à partir du nom du produit et de l''année : initiales de chaque mot pour un nom multi-mots (« Crème Pâtissière » produit en 2026 donne CP-26), trois premières lettres pour un nom d''un seul mot (« Cookies » donne COO-26). Vous la retrouverez dans les historiques pour tracer vos fabrications — voir [La traçabilité](#calc-tracabilite).
:::

:::attention
Vérifiez le stock de vos ingrédients avant de lancer une production : les quantités consommées par la recette sont déduites immédiatement. Dans la colonne du stock actuel, la ventilation détaille d''ailleurs les mouvements : appro, transferts, pertes et consommation PT.
:::

### Qui apparaît où

- **Dans les stocks** : les PT figurent aux côtés des articles, regroupés dans leur catégorie. Côté activité, les PT d''origine labo affichent « ⇄ Transfert uniquement » ; côté labo, les composés portent le badge « ◆ Composé valorisé ».
- **Dans les historiques et les exports** : les PT sont regroupés sous les trois catégories citées plus haut. Une catégorie n''apparaît que si elle contient au moins un produit.
- **Dans les filtres** : le filtre « Catégorie » des historiques d''approvisionnements (côté activité comme côté labo) et de l''historique des pertes du labo propose **trois options dédiées** — Produits Transformés Utilisables, Produits Transformés Vendables, Produits Composés Valorisés — en plus des catégories d''articles. En sélectionnant l''une d''elles, la liste « Article » affiche les produits transformés correspondants.

### Voir aussi

- [Lexique LabFlow de A à Z](#lexique) — les définitions de tous les termes
- [Produits Utilisables](#produits-utilisables) et [Produits Vendables](#produits-vendables) — créer et gérer vos PT
- [Produits valorisés](#articles-valorises) — dont l''onglet « Composés »
- [La production d''un PT](#calc-production-pt) et [Les transferts](#calc-transferts) — les calculs détaillés
- [Stock Labo](#stock-labo), [Transferts](#transferts) et [Historiques](#historique) — les écrans concernés',
'produit transformé, pt, utilisable, vendable, composé valorisé, catégories, production, transfert, stock, labo, recette, intermédiaire', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('onboarding-suivi', 'Suivi de votre mise en route', '🚀', 'Onboarding', 20,
'## 🚀 Suivi de votre mise en route

Bienvenue sur LabFlow ! Cette page vous accompagne pendant vos premiers pas : la liste de contrôle affichée au-dessus de ce texte reflète votre progression **d''après vos données réelles**. Chaque étape se coche automatiquement dès qu''elle est accomplie — vous n''avez rien à valider vous-même.

Votre mise en route se déroule en quatre temps, chacun détaillé dans une fiche dédiée :

1. [Création du compte & signature du contrat](#onboarding-contrat) — votre compte est créé par notre équipe et vous signez votre contrat d''abonnement entièrement en ligne.
2. [Activation de votre compte](#onboarding-activation) — vous définissez votre mot de passe grâce au lien reçu par email, puis vous vous connectez pour la première fois.
3. [Configuration initiale](#onboarding-configuration) — vous créez vos activités et votre labo, constituez votre référentiel d''articles et saisissez vos premiers approvisionnements.
4. [Avenants & résiliation](#onboarding-avenants) — pour faire évoluer votre abonnement par la suite (activités, labos ou gérants supplémentaires).

:::astuce
Revenez sur cette page à tout moment : la liste de contrôle vous indique toujours la prochaine action à réaliser, et se met à jour à chaque visite au fil de votre avancement.
:::

### Voir aussi

- [Démarrage](#demarrage)
- [Compte, activités et labos](#compte-activites-labos)',
'## 🚀 Suivi de votre mise en route

Bienvenue sur LabFlow ! Cette page vous accompagne pendant vos premiers pas : la liste de contrôle affichée au-dessus de ce texte reflète votre progression **d''après vos données réelles**. Chaque étape se coche automatiquement dès qu''elle est accomplie — vous n''avez rien à valider vous-même.

Votre mise en route se déroule en quatre temps, chacun détaillé dans une fiche dédiée :

1. [Création du compte & signature du contrat](#onboarding-contrat) — votre compte est créé par notre équipe et vous signez votre contrat d''abonnement entièrement en ligne.
2. [Activation de votre compte](#onboarding-activation) — vous définissez votre mot de passe grâce au lien reçu par email, puis vous vous connectez pour la première fois.
3. [Configuration initiale](#onboarding-configuration) — vous créez vos activités et votre labo, constituez votre référentiel d''articles et saisissez vos premiers approvisionnements.
4. [Avenants & résiliation](#onboarding-avenants) — pour faire évoluer votre abonnement par la suite (activités, labos ou gérants supplémentaires).

:::astuce
Revenez sur cette page à tout moment : la liste de contrôle vous indique toujours la prochaine action à réaliser, et se met à jour à chaque visite au fil de votre avancement.
:::

### Voir aussi

- [Démarrage](#demarrage)
- [Compte, activités et labos](#compte-activites-labos)',
'mise en route, onboarding, démarrage, progression, checklist, étapes, suivi, bienvenue, premiers pas, accompagnement', '/client/guide', false)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('onboarding-contrat', 'Création du compte & signature du contrat', '✍️', 'Onboarding', 21,
'## ✍️ Création du compte & signature du contrat

Votre parcours LabFlow commence avant même votre première connexion : l''administrateur crée votre compte, puis vous signez votre contrat d''abonnement entièrement en ligne, depuis un simple email.

### Comment se déroule cette étape

1. **Création du compte.** L''administrateur LabFlow enregistre vos informations (nom, email, téléphone, adresse) ainsi que la configuration de votre abonnement : nombre d''activités, de labos et de gérants inclus, frais d''activation et mensualité en DT, promotions éventuelles.
2. **Réception de l''email de signature.** Vous recevez un email intitulé « Signature de votre contrat d''abonnement », contenant le bouton **Consulter et signer mon contrat**.
3. **Signature en ligne.** Le lien ouvre votre contrat sur une plateforme de signature électronique sécurisée. Le document est déjà **pré-rempli** avec vos informations : identité, configuration et montants en DT. Vous n''avez qu''à le lire puis le signer directement en ligne — aucune impression ni scan n''est nécessaire.
4. **Suite automatique.** Dès que votre signature est enregistrée, l''email d''activation de votre compte vous est envoyé automatiquement (voir [Activation de votre compte](#onboarding-activation)).

### Ce que contient le contrat

- vos coordonnées ;
- la configuration de votre abonnement (activités, labos, gérants) ;
- les frais d''activation et la mensualité, exprimés en DT ;
- le cas échéant, le détail des promotions : montant remisé, durée, et date de reprise du tarif de base.

### Si l''email n''arrive pas

1. Vérifiez votre dossier **courrier indésirable (spam)** : les emails de signature y sont parfois classés.
2. L''email contient aussi le **lien direct** en toutes lettres, sous le bouton : vous pouvez le copier-coller dans votre navigateur.
3. Sinon, contactez l''administration LabFlow, qui vérifiera votre dossier et relancera l''envoi si nécessaire.

:::attention
Tant que le contrat n''est pas signé, votre compte ne peut pas être activé : l''email d''activation n''est envoyé qu''après la signature.
:::

:::astuce
Une fois votre compte activé, vous pourrez retélécharger votre contrat signé à tout moment depuis la page « Mon abonnement » (bouton « Contrat actif »).
:::

### Voir aussi

- [Activation de votre compte](#onboarding-activation)
- [Suivi de votre mise en route](#onboarding-suivi)
- [Mon abonnement](#abonnement)',
'## ✍️ Création du compte & signature du contrat

Votre parcours LabFlow commence avant même votre première connexion : l''administrateur crée votre compte, puis vous signez votre contrat d''abonnement entièrement en ligne, depuis un simple email.

### Comment se déroule cette étape

1. **Création du compte.** L''administrateur LabFlow enregistre vos informations (nom, email, téléphone, adresse) ainsi que la configuration de votre abonnement : nombre d''activités, de labos et de gérants inclus, frais d''activation et mensualité en DT, promotions éventuelles.
2. **Réception de l''email de signature.** Vous recevez un email intitulé « Signature de votre contrat d''abonnement », contenant le bouton **Consulter et signer mon contrat**.
3. **Signature en ligne.** Le lien ouvre votre contrat sur une plateforme de signature électronique sécurisée. Le document est déjà **pré-rempli** avec vos informations : identité, configuration et montants en DT. Vous n''avez qu''à le lire puis le signer directement en ligne — aucune impression ni scan n''est nécessaire.
4. **Suite automatique.** Dès que votre signature est enregistrée, l''email d''activation de votre compte vous est envoyé automatiquement (voir [Activation de votre compte](#onboarding-activation)).

### Ce que contient le contrat

- vos coordonnées ;
- la configuration de votre abonnement (activités, labos, gérants) ;
- les frais d''activation et la mensualité, exprimés en DT ;
- le cas échéant, le détail des promotions : montant remisé, durée, et date de reprise du tarif de base.

### Si l''email n''arrive pas

1. Vérifiez votre dossier **courrier indésirable (spam)** : les emails de signature y sont parfois classés.
2. L''email contient aussi le **lien direct** en toutes lettres, sous le bouton : vous pouvez le copier-coller dans votre navigateur.
3. Sinon, contactez l''administration LabFlow, qui vérifiera votre dossier et relancera l''envoi si nécessaire.

:::attention
Tant que le contrat n''est pas signé, votre compte ne peut pas être activé : l''email d''activation n''est envoyé qu''après la signature.
:::

:::astuce
Une fois votre compte activé, vous pourrez retélécharger votre contrat signé à tout moment depuis la page « Mon abonnement » (bouton « Contrat actif »).
:::

### Voir aussi

- [Activation de votre compte](#onboarding-activation)
- [Suivi de votre mise en route](#onboarding-suivi)
- [Mon abonnement](#abonnement)',
'contrat, signature, signature électronique, création de compte, email, abonnement, tarif, promotion, spam, courrier indésirable, administrateur', NULL, false)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('onboarding-activation', 'Activation de votre compte', '🔑', 'Onboarding', 22,
'## 🔑 Activation de votre compte

Une fois votre contrat signé, vous recevez automatiquement l''email « Bienvenue sur LabFlow — Activez votre compte ». Il contient le lien qui vous permet de définir votre mot de passe et d''accéder à votre espace.

### Ce que vous voyez

La page d''activation vous accueille par votre nom et rappelle l''adresse email de votre compte. Elle comporte :

- un champ **Mot de passe**, avec un bouton œil pour afficher ou masquer la saisie ;
- des pastilles de contrôle qui passent au vert au fur et à mesure de la frappe : « Au moins 8 caractères », « Une majuscule », « Une minuscule », « Un chiffre », « Un caractère spécial » ;
- un champ **Confirmer le mot de passe** ;
- le bouton **Activer mon compte**, qui ne devient actif que lorsque toutes les règles sont respectées et que les deux saisies correspondent.

### Actions pas à pas

1. Ouvrez l''email d''activation et cliquez sur le bouton **Activer mon compte** (le lien direct figure aussi en bas de l''email).
2. Choisissez votre mot de passe en respectant les règles affichées : au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial (par exemple @, !, ?, %, _, - ou #).
3. Répétez le mot de passe dans le champ de confirmation.
4. Cliquez sur **Activer mon compte** : vous êtes redirigé vers la page de connexion, avec votre adresse email déjà pré-remplie.
5. Saisissez votre nouveau mot de passe : vous voilà connecté pour la première fois.

### Points d''attention

:::attention
Le lien d''activation est valable **48 heures**. Passé ce délai, la page affiche « Lien invalide ou expiré » : contactez l''administration, qui vous renverra une nouvelle invitation valable 48 heures.
:::

:::regle
Règles du mot de passe : minimum 8 caractères, au moins une majuscule, une minuscule, un chiffre et un caractère spécial.
:::

:::astuce
Utilisez le bouton œil pour vérifier votre saisie avant de valider, et conservez votre mot de passe en lieu sûr : il vous sera demandé à chaque connexion.
:::

### Voir aussi

- [Configuration initiale](#onboarding-configuration)
- [Création du compte & signature du contrat](#onboarding-contrat)
- [Mon compte](#compte)',
'## 🔑 Activation de votre compte

Une fois votre contrat signé, vous recevez automatiquement l''email « Bienvenue sur LabFlow — Activez votre compte ». Il contient le lien qui vous permet de définir votre mot de passe et d''accéder à votre espace.

### Ce que vous voyez

La page d''activation vous accueille par votre nom et rappelle l''adresse email de votre compte. Elle comporte :

- un champ **Mot de passe**, avec un bouton œil pour afficher ou masquer la saisie ;
- des pastilles de contrôle qui passent au vert au fur et à mesure de la frappe : « Au moins 8 caractères », « Une majuscule », « Une minuscule », « Un chiffre », « Un caractère spécial » ;
- un champ **Confirmer le mot de passe** ;
- le bouton **Activer mon compte**, qui ne devient actif que lorsque toutes les règles sont respectées et que les deux saisies correspondent.

### Actions pas à pas

1. Ouvrez l''email d''activation et cliquez sur le bouton **Activer mon compte** (le lien direct figure aussi en bas de l''email).
2. Choisissez votre mot de passe en respectant les règles affichées : au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial (par exemple @, !, ?, %, _, - ou #).
3. Répétez le mot de passe dans le champ de confirmation.
4. Cliquez sur **Activer mon compte** : vous êtes redirigé vers la page de connexion, avec votre adresse email déjà pré-remplie.
5. Saisissez votre nouveau mot de passe : vous voilà connecté pour la première fois.

### Points d''attention

:::attention
Le lien d''activation est valable **48 heures**. Passé ce délai, la page affiche « Lien invalide ou expiré » : contactez l''administration, qui vous renverra une nouvelle invitation valable 48 heures.
:::

:::regle
Règles du mot de passe : minimum 8 caractères, au moins une majuscule, une minuscule, un chiffre et un caractère spécial.
:::

:::astuce
Utilisez le bouton œil pour vérifier votre saisie avant de valider, et conservez votre mot de passe en lieu sûr : il vous sera demandé à chaque connexion.
:::

### Voir aussi

- [Configuration initiale](#onboarding-configuration)
- [Création du compte & signature du contrat](#onboarding-contrat)
- [Mon compte](#compte)',
'activation, mot de passe, lien, 48 heures, email, invitation, première connexion, sécurité, règles, lien expiré, bienvenue', NULL, false)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('onboarding-configuration', 'Configuration initiale', '🧭', 'Onboarding', 23,
'## 🧭 Configuration initiale

À votre première connexion, LabFlow vous guide pas à pas pour mettre votre espace en ordre de marche. Le point de départ est la page **Mes activités** ; le menu latéral s''ouvre progressivement au fil de votre avancement.

### Ce que vous voyez

- au départ, une carte de bienvenue « Démarrez votre activité » rappelant ce que votre abonnement inclut (nombre d''activités et de labos), avec le bouton **✨ Créer mon business** si votre abonnement inclut un labo, ou **+ Ajouter mon activité** sinon ;
- des compteurs indiquant l''utilisation de votre abonnement (par exemple 1 / 3 activités) ;
- dans le menu latéral, un bandeau qui vous indique la prochaine étape à accomplir, tant que la configuration n''est pas terminée.

### Actions pas à pas

1. **Créez votre labo et vos activités.** Le bouton « Créer mon business » ouvre un assistant en deux étapes : d''abord le **Laboratoire** (nom, référence unique, adresse — vous pouvez cocher « Passer cette étape » si vous n''en avez pas encore besoin), puis vos **Activités** (nom, adresse et, si vous créez un labo, le choix « Avec labo » ou « Sans labo » pour chacune). Ajoutez autant d''activités que votre abonnement le permet, puis validez avec **Enregistrer tout**.
2. **Constituez votre référentiel.** Dès votre première activité ou votre labo créé, le Référentiel se déverrouille dans le menu : créez vos unités, familles et catégories, puis vos articles (nom, unité, catégorie).
3. **Affectez vos articles.** Sélectionnez, pour chaque activité et pour le labo, les articles qui y sont utilisés. Les espaces Activités et Labo se déverrouillent dès qu''un article leur est affecté ; l''Espace Produits s''ouvre dès votre premier article créé.
4. **Saisissez vos premiers approvisionnements.** Rendez-vous dans le stock pour enregistrer vos premières entrées (prix d''achat saisis en HT avec leur taux de TVA) : vos quantités et la valeur de votre stock commencent à vivre.
5. **Consultez votre tableau de bord.** Il devient accessible dès la création de vos activités et se remplit au fil de vos saisies.

### Points d''attention

:::astuce
La progression est entièrement automatique : l''application détecte vos données réelles (activités créées, articles affectés) et ouvre les menus correspondants. Rien n''est à valider manuellement, et vous ne pouvez pas sauter une étape par erreur.
:::

:::attention
Le nombre d''activités et de labos est plafonné par votre abonnement (compteurs affichés en haut de la page). Une fois la limite atteinte, le bouton « ⚡ Ajouter activités » vous oriente vers une demande d''ajout de capacité — voir [Avenants & résiliation](#onboarding-avenants).
:::

### Voir aussi

- [Compte, activités et labos](#compte-activites-labos)
- [Unités](#referentiel-unites) · [Articles](#referentiel-articles) · [Catalogue global](#catalogue-global)
- [Stock des activités](#stock-activites)
- [Tableau de bord](#dashboard)',
'## 🧭 Configuration initiale

À votre première connexion, LabFlow vous guide pas à pas pour mettre votre espace en ordre de marche. Le point de départ est la page **Mes activités** ; le menu latéral s''ouvre progressivement au fil de votre avancement.

### Ce que vous voyez

- au départ, une carte de bienvenue « Démarrez votre activité » rappelant ce que votre abonnement inclut (nombre d''activités et de labos), avec le bouton **✨ Créer mon business** si votre abonnement inclut un labo, ou **+ Ajouter mon activité** sinon ;
- des compteurs indiquant l''utilisation de votre abonnement (par exemple 1 / 3 activités) ;
- dans le menu latéral, un bandeau qui vous indique la prochaine étape à accomplir, tant que la configuration n''est pas terminée.

### Actions pas à pas

1. **Créez votre labo et vos activités.** Le bouton « Créer mon business » ouvre un assistant en deux étapes : d''abord le **Laboratoire** (nom, référence unique, adresse — vous pouvez cocher « Passer cette étape » si vous n''en avez pas encore besoin), puis vos **Activités** (nom, adresse et, si vous créez un labo, le choix « Avec labo » ou « Sans labo » pour chacune). Ajoutez autant d''activités que votre abonnement le permet, puis validez avec **Enregistrer tout**.
2. **Constituez votre référentiel.** Dès votre première activité ou votre labo créé, le Référentiel se déverrouille dans le menu : créez vos unités, familles et catégories, puis vos articles (nom, unité, catégorie).
3. **Affectez vos articles.** Sélectionnez, pour chaque activité et pour le labo, les articles qui y sont utilisés. Les espaces Activités et Labo se déverrouillent dès qu''un article leur est affecté ; l''Espace Produits s''ouvre dès votre premier article créé.
4. **Saisissez vos premiers approvisionnements.** Rendez-vous dans le stock pour enregistrer vos premières entrées (prix d''achat saisis en HT avec leur taux de TVA) : vos quantités et la valeur de votre stock commencent à vivre.
5. **Consultez votre tableau de bord.** Il devient accessible dès la création de vos activités et se remplit au fil de vos saisies.

### Points d''attention

:::astuce
La progression est entièrement automatique : l''application détecte vos données réelles (activités créées, articles affectés) et ouvre les menus correspondants. Rien n''est à valider manuellement, et vous ne pouvez pas sauter une étape par erreur.
:::

:::attention
Le nombre d''activités et de labos est plafonné par votre abonnement (compteurs affichés en haut de la page). Une fois la limite atteinte, le bouton « ⚡ Ajouter activités » vous oriente vers une demande d''ajout de capacité — voir [Avenants & résiliation](#onboarding-avenants).
:::

### Voir aussi

- [Compte, activités et labos](#compte-activites-labos)
- [Unités](#referentiel-unites) · [Articles](#referentiel-articles) · [Catalogue global](#catalogue-global)
- [Stock des activités](#stock-activites)
- [Tableau de bord](#dashboard)',
'configuration, première connexion, activités, labo, assistant, articles, référentiel, approvisionnement, déverrouillage, menu, tableau de bord, parcours guidé', '/client/activites', false)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('onboarding-avenants', 'Avenants & résiliation', '📑', 'Onboarding', 24,
'## 📑 Avenants & résiliation

Votre abonnement évolue avec votre entreprise : vous pouvez à tout moment demander des activités, labos ou gérants supplémentaires depuis la page **Demandes** du menu. Chaque ajout de capacité donne lieu à un avenant au contrat, signé électroniquement.

### Ce que vous voyez

- le bouton **+ Nouvelle demande** en haut de la page ;
- la liste de vos demandes avec leur statut — **En attente**, **Validée** ou **Refusée** — filtrable par statut et par période ;
- pour une demande d''ajout de capacité : un encart indiquant que le contrat avenant a été envoyé à votre adresse email, son état (en attente de signature ou signé), puis un bouton pour télécharger le contrat avenant signé.

### Demander des activités, labos ou gérants supplémentaires

1. Cliquez sur **+ Nouvelle demande**, puis choisissez **Ajout de capacité**.
2. Le formulaire rappelle votre configuration actuelle et affiche le prix de chaque supplément en DT, par unité et par mois (activité, labo, gérant), promotions éventuelles comprises.
3. Réglez les compteurs + / − ; le bloc « Nouveau total estimé » calcule en direct votre future mensualité en DT.
4. Cliquez sur **Envoyer la demande** : votre avenant est généré et un email de signature vous est envoyé immédiatement.
5. Ouvrez l''email « Signature de votre avenant d''abonnement » et cliquez sur **Consulter et signer mon avenant**.
6. Dès la signature, la capacité supplémentaire est **appliquée automatiquement** à votre compte : la demande passe en « Validée », vous recevez une notification et pouvez utiliser vos nouvelles activités, labos ou gérants sans autre démarche.
7. Le contrat avenant signé reste ensuite téléchargeable depuis la demande concernée.

### Résiliation

À la clôture de votre abonnement, vous recevez par email un **acte de résiliation** à signer électroniquement (bouton « Consulter et signer l''acte »). Ce document formalise la fin de votre abonnement ; la signature se fait entièrement en ligne, comme pour le contrat initial.

### Points d''attention

:::attention
Tant que l''avenant n''est pas signé, la demande reste « En attente » et la capacité n''est pas ajoutée. Une demande en attente peut être supprimée si vous changez d''avis (bouton « Supprimer »).
:::

:::astuce
Le total estimé tient compte des promotions actives : le prix de base apparaît barré et le prix remisé s''affiche à côté. C''est ce montant qui figure sur l''avenant.
:::

:::regle
La demande d''ajout de capacité est réservée au propriétaire du compte : les gérants n''y ont pas accès.
:::

### Voir aussi

- [Mes activités](#activites) · [Gérants](#gerants)
- [Mon abonnement](#abonnement) · [Historique des paiements](#historique-paiements)
- [Support & demandes](#support)',
'## 📑 Avenants & résiliation

Votre abonnement évolue avec votre entreprise : vous pouvez à tout moment demander des activités, labos ou gérants supplémentaires depuis la page **Demandes** du menu. Chaque ajout de capacité donne lieu à un avenant au contrat, signé électroniquement.

### Ce que vous voyez

- le bouton **+ Nouvelle demande** en haut de la page ;
- la liste de vos demandes avec leur statut — **En attente**, **Validée** ou **Refusée** — filtrable par statut et par période ;
- pour une demande d''ajout de capacité : un encart indiquant que le contrat avenant a été envoyé à votre adresse email, son état (en attente de signature ou signé), puis un bouton pour télécharger le contrat avenant signé.

### Demander des activités, labos ou gérants supplémentaires

1. Cliquez sur **+ Nouvelle demande**, puis choisissez **Ajout de capacité**.
2. Le formulaire rappelle votre configuration actuelle et affiche le prix de chaque supplément en DT, par unité et par mois (activité, labo, gérant), promotions éventuelles comprises.
3. Réglez les compteurs + / − ; le bloc « Nouveau total estimé » calcule en direct votre future mensualité en DT.
4. Cliquez sur **Envoyer la demande** : votre avenant est généré et un email de signature vous est envoyé immédiatement.
5. Ouvrez l''email « Signature de votre avenant d''abonnement » et cliquez sur **Consulter et signer mon avenant**.
6. Dès la signature, la capacité supplémentaire est **appliquée automatiquement** à votre compte : la demande passe en « Validée », vous recevez une notification et pouvez utiliser vos nouvelles activités, labos ou gérants sans autre démarche.
7. Le contrat avenant signé reste ensuite téléchargeable depuis la demande concernée.

### Résiliation

À la clôture de votre abonnement, vous recevez par email un **acte de résiliation** à signer électroniquement (bouton « Consulter et signer l''acte »). Ce document formalise la fin de votre abonnement ; la signature se fait entièrement en ligne, comme pour le contrat initial.

### Points d''attention

:::attention
Tant que l''avenant n''est pas signé, la demande reste « En attente » et la capacité n''est pas ajoutée. Une demande en attente peut être supprimée si vous changez d''avis (bouton « Supprimer »).
:::

:::astuce
Le total estimé tient compte des promotions actives : le prix de base apparaît barré et le prix remisé s''affiche à côté. C''est ce montant qui figure sur l''avenant.
:::

:::regle
La demande d''ajout de capacité est réservée au propriétaire du compte : les gérants n''y ont pas accès.
:::

### Voir aussi

- [Mes activités](#activites) · [Gérants](#gerants)
- [Mon abonnement](#abonnement) · [Historique des paiements](#historique-paiements)
- [Support & demandes](#support)',
'avenant, capacité, activité supplémentaire, labo supplémentaire, gérant supplémentaire, demande, signature électronique, résiliation, mensualité, contrat, promotion', '/client/support', false)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('referentiel-unites', 'Unités', '📏', 'Référentiel', 30,
'## 📏 Unités de mesure

Les unités de mesure constituent le premier niveau de votre référentiel : elles définissent comment vous quantifiez vos articles (kg, L, g, pièce, portion, boîte…). Vous les gérez depuis le menu **Référentiel → Unités**. Une unité est **obligatoire** pour créer un article.

### Ce que vous voyez

- Un bandeau d''en-tête avec le **nombre total d''unités** de votre référentiel.
- Une barre de filtres avec un champ **Recherche** (le tableau se filtre au fur et à mesure de la saisie), le compteur de résultats et un bouton **Réinitialiser** dès qu''une recherche est active.
- Le bouton **+ Nouvelle unité** dans la barre de filtres.
- Un tableau à deux colonnes : **Nom** et **Actions** (bouton **✏️ Modifier** et corbeille 🗑️).

Si aucune unité n''existe encore, l''écran propose directement **+ Créer la première unité**.

### Actions pas à pas

Créer une ou plusieurs unités :

1. Cliquez sur **+ Nouvelle unité**.
2. Saisissez le nom de la première unité (ex. kg, L, pièce).
3. Cliquez sur **+ Ajouter une ligne** pour en saisir d''autres — la touche Entrée sur la dernière ligne ajoute aussi une nouvelle ligne. La croix en bout de ligne retire une ligne inutile.
4. Cliquez sur **Enregistrer** — dès que plusieurs lignes sont remplies, le bouton affiche le nombre d''unités qui vont être créées.

Renommer une unité :

1. Cliquez sur **✏️ Modifier** sur la ligne concernée.
2. Corrigez le nom puis cliquez sur **Enregistrer**. Le nouveau nom s''applique partout où l''unité est utilisée.

Supprimer une unité :

1. Cliquez sur la corbeille 🗑️ de la ligne, puis confirmez avec **Supprimer** dans la fenêtre de confirmation.
2. Les articles encore rattachés à cette unité perdront leur unité : pensez à leur en réaffecter une depuis l''écran [Articles](#referentiel-articles).

### Points d''attention

:::attention
La corbeille est **grisée** lorsque l''unité est utilisée par des articles ayant des approvisionnements enregistrés : la suppression est alors bloquée pour protéger vos historiques et vos coûts. Survolez le bouton pour afficher l''explication.
:::

:::astuce
Restez cohérent : utilisez la même unité pour l''achat et pour la recette d''un même article (ex. tout en kg) afin que les coûts calculés restent justes. Créez dès le départ un petit jeu d''unités standard (kg, g, L, pièce, portion) plutôt que de multiplier les variantes proches.
:::

### Voir aussi

- [Articles](#referentiel-articles) — l''unité est choisie à la création de chaque article
- [Ajout dynamique](#referentiel-import) — les unités manquantes sont créées automatiquement à l''import
- [Lexique](#lexique)
- [Bien démarrer](#demarrage)',
'## 📏 Unités de mesure

Les unités de mesure constituent le premier niveau de votre référentiel : elles définissent comment vous quantifiez vos articles (kg, L, g, pièce, portion, boîte…). Vous les gérez depuis le menu **Référentiel → Unités**. Une unité est **obligatoire** pour créer un article.

### Ce que vous voyez

- Un bandeau d''en-tête avec le **nombre total d''unités** de votre référentiel.
- Une barre de filtres avec un champ **Recherche** (le tableau se filtre au fur et à mesure de la saisie), le compteur de résultats et un bouton **Réinitialiser** dès qu''une recherche est active.
- Le bouton **+ Nouvelle unité** dans la barre de filtres.
- Un tableau à deux colonnes : **Nom** et **Actions** (bouton **✏️ Modifier** et corbeille 🗑️).

Si aucune unité n''existe encore, l''écran propose directement **+ Créer la première unité**.

### Actions pas à pas

Créer une ou plusieurs unités :

1. Cliquez sur **+ Nouvelle unité**.
2. Saisissez le nom de la première unité (ex. kg, L, pièce).
3. Cliquez sur **+ Ajouter une ligne** pour en saisir d''autres — la touche Entrée sur la dernière ligne ajoute aussi une nouvelle ligne. La croix en bout de ligne retire une ligne inutile.
4. Cliquez sur **Enregistrer** — dès que plusieurs lignes sont remplies, le bouton affiche le nombre d''unités qui vont être créées.

Renommer une unité :

1. Cliquez sur **✏️ Modifier** sur la ligne concernée.
2. Corrigez le nom puis cliquez sur **Enregistrer**. Le nouveau nom s''applique partout où l''unité est utilisée.

Supprimer une unité :

1. Cliquez sur la corbeille 🗑️ de la ligne, puis confirmez avec **Supprimer** dans la fenêtre de confirmation.
2. Les articles encore rattachés à cette unité perdront leur unité : pensez à leur en réaffecter une depuis l''écran [Articles](#referentiel-articles).

### Points d''attention

:::attention
La corbeille est **grisée** lorsque l''unité est utilisée par des articles ayant des approvisionnements enregistrés : la suppression est alors bloquée pour protéger vos historiques et vos coûts. Survolez le bouton pour afficher l''explication.
:::

:::astuce
Restez cohérent : utilisez la même unité pour l''achat et pour la recette d''un même article (ex. tout en kg) afin que les coûts calculés restent justes. Créez dès le départ un petit jeu d''unités standard (kg, g, L, pièce, portion) plutôt que de multiplier les variantes proches.
:::

### Voir aussi

- [Articles](#referentiel-articles) — l''unité est choisie à la création de chaque article
- [Ajout dynamique](#referentiel-import) — les unités manquantes sont créées automatiquement à l''import
- [Lexique](#lexique)
- [Bien démarrer](#demarrage)',
'unités, unité de mesure, kg, litre, gramme, pièce, portion, quantité, mesure, référentiel, création, suppression', '/client/referentiel/unites', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('referentiel-familles', 'Familles', '🗂️', 'Référentiel', 31,
'## 🗂️ Familles

Les familles regroupent vos catégories d''articles (ex. « Viandes », « Épicerie », « Boissons ») et portent deux propriétés qui déterminent la nature de tous les articles rattachés : **Consommable** et **Vendable**. Vous les gérez depuis le menu **Référentiel → Familles**.

### Ce que vous voyez

- Un bandeau d''en-tête avec le **nombre total de familles**.
- Une barre de filtres : champ **Recherche**, compteur de résultats, bouton **Réinitialiser** et bouton **+ Nouvelle famille**.
- Un tableau à quatre colonnes : **Nom**, **Consommable** (interrupteur Oui/Non), **Vendable** (interrupteur Oui/Non) et **Actions** (✏️ Modifier, corbeille 🗑️).

Les interrupteurs Consommable et Vendable sont **cliquables directement dans le tableau** : un clic bascule la propriété immédiatement, sans passer par une fenêtre de modification.

### Le rôle des deux propriétés

| Consommable | Vendable | Nature des articles de la famille |
|---|---|---|
| Oui | Oui ou Non | Ingrédient : suivi en stock, utilisable dans les fiches techniques |
| Non | Oui | Article valorisé : vendu tel quel, sans recette |

:::regle
Un article ne devient « valorisé » que si sa famille est **Vendable = Oui** et **Consommable = Non**. Voir [Articles Valorisés](#articles-valorises).
:::

### Actions pas à pas

Créer une ou plusieurs familles :

1. Cliquez sur **+ Nouvelle famille**.
2. Saisissez le nom (ex. Produits laitiers) et réglez les interrupteurs **Consommable** et **Vendable** de la ligne — tous deux activés par défaut.
3. Cliquez sur **+ Ajouter une ligne** pour en créer plusieurs d''un coup (la touche Entrée sur la dernière ligne fonctionne aussi), puis sur **Enregistrer**.

Modifier une famille :

1. Cliquez sur **✏️ Modifier**, ajustez le nom et/ou les deux interrupteurs, puis **Enregistrer**.

Supprimer une famille :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**.
2. Les catégories rattachées perdront leur famille : pensez à les reclasser depuis l''écran [Catégories](#referentiel-categories).

### Points d''attention

:::attention
La corbeille est **grisée** lorsque des articles de la famille ont des approvisionnements enregistrés : la suppression est bloquée. Survolez le bouton pour afficher l''explication.
:::

:::attention
Basculer un interrupteur modifie la nature de **tous les articles** rattachés à la famille. Vérifiez l''impact avant de désactiver Consommable ou Vendable sur une famille déjà utilisée en stock ou en vente.
:::

:::astuce
Définissez vos familles avant vos catégories et vos articles : la hiérarchie du référentiel va des familles vers les catégories, puis vers les articles.
:::

### Voir aussi

- [Catégories](#referentiel-categories) — chaque catégorie se rattache à une famille
- [Articles Valorisés](#articles-valorises) — issus des familles vendables non consommables
- [Articles](#referentiel-articles)
- [Lexique](#lexique)',
'## 🗂️ Familles

Les familles regroupent vos catégories d''articles (ex. « Viandes », « Épicerie », « Boissons ») et portent deux propriétés qui déterminent la nature de tous les articles rattachés : **Consommable** et **Vendable**. Vous les gérez depuis le menu **Référentiel → Familles**.

### Ce que vous voyez

- Un bandeau d''en-tête avec le **nombre total de familles**.
- Une barre de filtres : champ **Recherche**, compteur de résultats, bouton **Réinitialiser** et bouton **+ Nouvelle famille**.
- Un tableau à quatre colonnes : **Nom**, **Consommable** (interrupteur Oui/Non), **Vendable** (interrupteur Oui/Non) et **Actions** (✏️ Modifier, corbeille 🗑️).

Les interrupteurs Consommable et Vendable sont **cliquables directement dans le tableau** : un clic bascule la propriété immédiatement, sans passer par une fenêtre de modification.

### Le rôle des deux propriétés

| Consommable | Vendable | Nature des articles de la famille |
|---|---|---|
| Oui | Oui ou Non | Ingrédient : suivi en stock, utilisable dans les fiches techniques |
| Non | Oui | Article valorisé : vendu tel quel, sans recette |

:::regle
Un article ne devient « valorisé » que si sa famille est **Vendable = Oui** et **Consommable = Non**. Voir [Articles Valorisés](#articles-valorises).
:::

### Actions pas à pas

Créer une ou plusieurs familles :

1. Cliquez sur **+ Nouvelle famille**.
2. Saisissez le nom (ex. Produits laitiers) et réglez les interrupteurs **Consommable** et **Vendable** de la ligne — tous deux activés par défaut.
3. Cliquez sur **+ Ajouter une ligne** pour en créer plusieurs d''un coup (la touche Entrée sur la dernière ligne fonctionne aussi), puis sur **Enregistrer**.

Modifier une famille :

1. Cliquez sur **✏️ Modifier**, ajustez le nom et/ou les deux interrupteurs, puis **Enregistrer**.

Supprimer une famille :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**.
2. Les catégories rattachées perdront leur famille : pensez à les reclasser depuis l''écran [Catégories](#referentiel-categories).

### Points d''attention

:::attention
La corbeille est **grisée** lorsque des articles de la famille ont des approvisionnements enregistrés : la suppression est bloquée. Survolez le bouton pour afficher l''explication.
:::

:::attention
Basculer un interrupteur modifie la nature de **tous les articles** rattachés à la famille. Vérifiez l''impact avant de désactiver Consommable ou Vendable sur une famille déjà utilisée en stock ou en vente.
:::

:::astuce
Définissez vos familles avant vos catégories et vos articles : la hiérarchie du référentiel va des familles vers les catégories, puis vers les articles.
:::

### Voir aussi

- [Catégories](#referentiel-categories) — chaque catégorie se rattache à une famille
- [Articles Valorisés](#articles-valorises) — issus des familles vendables non consommables
- [Articles](#referentiel-articles)
- [Lexique](#lexique)',
'familles, consommable, vendable, valorisé, classification, regroupement, propriétés, interrupteur, référentiel, ingrédient', '/client/referentiel/familles', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('referentiel-categories', 'Catégories', '🏷️', 'Référentiel', 32,
'## 🏷️ Catégories

Les catégories affinent les familles (ex. dans la famille « Viandes » : « Bœuf », « Volaille »…). Elles servent à organiser et filtrer vos articles dans tout LabFlow. Vous les gérez depuis le menu **Référentiel → Catégories**.

### Ce que vous voyez

- Un bandeau d''en-tête avec le **nombre total de catégories**.
- Une barre de filtres : champ **Recherche**, liste déroulante **Famille** (« Toutes les familles ») pour n''afficher que les catégories d''une famille, compteur de résultats, bouton **Réinitialiser** et bouton **+ Nouvelle catégorie**.
- Un tableau à trois colonnes : **Nom**, **Famille** (nom de la famille de rattachement, ou — si la catégorie n''en a pas) et **Actions** (✏️ Modifier, corbeille 🗑️).

### Actions pas à pas

Créer une ou plusieurs catégories :

1. Cliquez sur **+ Nouvelle catégorie**.
2. Sur chaque ligne, saisissez le **nom** (ex. Viandes) et choisissez la **famille** de rattachement dans la liste déroulante — la famille est obligatoire dès lors que des familles existent.
3. Cliquez sur **+ Ajouter une ligne** pour en créer plusieurs d''un coup, puis sur **Enregistrer** — dès que plusieurs lignes sont remplies, le bouton indique le nombre de catégories à créer.

Modifier ou reclasser une catégorie :

1. Cliquez sur **✏️ Modifier**.
2. Corrigez le nom et/ou changez la famille de rattachement, puis **Enregistrer**.

Supprimer une catégorie :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**.
2. Les articles rattachés perdront leur catégorie et apparaîtront en « Sans catégorie » dans l''écran [Articles](#referentiel-articles).

### Points d''attention

:::attention
La corbeille est **grisée** lorsque des articles de la catégorie ont des approvisionnements enregistrés : la suppression est bloquée pour protéger vos historiques.
:::

:::attention
Ne confondez pas les **catégories d''articles** (ce référentiel, pour vos matières premières) avec les [catégories de produits](#categories-produits) de l''Espace Produit, qui classent vos produits pour la vente.
:::

:::astuce
Créez d''abord vos [familles](#referentiel-familles) : le formulaire de création exige une famille pour chaque catégorie. Une arborescence claire (famille → catégorie) rend ensuite les filtres et les regroupements beaucoup plus efficaces dans tous les écrans.
:::

### Voir aussi

- [Familles](#referentiel-familles) — le niveau supérieur du référentiel
- [Articles](#referentiel-articles) — chaque article se classe dans une catégorie
- [Catégories de produits](#categories-produits) — à ne pas confondre
- [Lexique](#lexique)',
'## 🏷️ Catégories

Les catégories affinent les familles (ex. dans la famille « Viandes » : « Bœuf », « Volaille »…). Elles servent à organiser et filtrer vos articles dans tout LabFlow. Vous les gérez depuis le menu **Référentiel → Catégories**.

### Ce que vous voyez

- Un bandeau d''en-tête avec le **nombre total de catégories**.
- Une barre de filtres : champ **Recherche**, liste déroulante **Famille** (« Toutes les familles ») pour n''afficher que les catégories d''une famille, compteur de résultats, bouton **Réinitialiser** et bouton **+ Nouvelle catégorie**.
- Un tableau à trois colonnes : **Nom**, **Famille** (nom de la famille de rattachement, ou — si la catégorie n''en a pas) et **Actions** (✏️ Modifier, corbeille 🗑️).

### Actions pas à pas

Créer une ou plusieurs catégories :

1. Cliquez sur **+ Nouvelle catégorie**.
2. Sur chaque ligne, saisissez le **nom** (ex. Viandes) et choisissez la **famille** de rattachement dans la liste déroulante — la famille est obligatoire dès lors que des familles existent.
3. Cliquez sur **+ Ajouter une ligne** pour en créer plusieurs d''un coup, puis sur **Enregistrer** — dès que plusieurs lignes sont remplies, le bouton indique le nombre de catégories à créer.

Modifier ou reclasser une catégorie :

1. Cliquez sur **✏️ Modifier**.
2. Corrigez le nom et/ou changez la famille de rattachement, puis **Enregistrer**.

Supprimer une catégorie :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**.
2. Les articles rattachés perdront leur catégorie et apparaîtront en « Sans catégorie » dans l''écran [Articles](#referentiel-articles).

### Points d''attention

:::attention
La corbeille est **grisée** lorsque des articles de la catégorie ont des approvisionnements enregistrés : la suppression est bloquée pour protéger vos historiques.
:::

:::attention
Ne confondez pas les **catégories d''articles** (ce référentiel, pour vos matières premières) avec les [catégories de produits](#categories-produits) de l''Espace Produit, qui classent vos produits pour la vente.
:::

:::astuce
Créez d''abord vos [familles](#referentiel-familles) : le formulaire de création exige une famille pour chaque catégorie. Une arborescence claire (famille → catégorie) rend ensuite les filtres et les regroupements beaucoup plus efficaces dans tous les écrans.
:::

### Voir aussi

- [Familles](#referentiel-familles) — le niveau supérieur du référentiel
- [Articles](#referentiel-articles) — chaque article se classe dans une catégorie
- [Catégories de produits](#categories-produits) — à ne pas confondre
- [Lexique](#lexique)',
'catégories, famille, classement, articles, organisation, rattachement, filtre, référentiel, création, suppression', '/client/referentiel/categories', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('referentiel-articles', 'Articles', '🧂', 'Référentiel', 33,
'## 🧂 Articles

Les articles sont vos matières premières et ingrédients : c''est le cœur du référentiel, utilisé pour le stock, les approvisionnements et les fiches techniques. Vous les gérez depuis le menu **Référentiel → Articles**.

### Ce que vous voyez

- Un bandeau d''en-tête avec le **nombre total d''articles**.
- Une barre de filtres : champ **Recherche**, liste **Famille**, liste **Catégorie** (elle se limite aux catégories de la famille choisie), compteur de résultats (ex. « 12 articles sur 87 » quand un filtre est actif) et bouton **Réinitialiser**.
- Deux boutons d''action : **+ Ajout multiple** et **+ Nouvel article**.
- Une liste **groupée par famille puis par catégorie** : chaque famille forme une carte avec son nombre de catégories ; chaque catégorie se déplie d''un clic sur la flèche ▶ et affiche son nombre d''articles (les articles non classés apparaissent sous « Sans catégorie »). Chaque ligne d''article affiche son nom, un badge avec son **unité**, et les boutons **✏️ Modifier** et corbeille 🗑️.

### Actions pas à pas

Créer un article (assistant en deux étapes) :

1. Cliquez sur **+ Nouvel article**.
2. Étape **Informations** : saisissez le **nom**, choisissez l''**unité** et la **catégorie** (présentée sous la forme Famille › Catégorie). Si aucune catégorie n''existe, un message vous invite à en créer d''abord dans le référentiel. Cliquez sur **Suivant →**.
3. Étape **Affectation** : cochez les activités 📍 et/ou labos 🏭 où l''article sera utilisé — **au moins un est requis**. Le bouton **Tout sélectionner** coche tout d''un coup et un compteur suit votre sélection.
4. Cliquez sur **Créer l''article**. Le bouton **← Retour** permet de revenir à l''étape 1.

Créer plusieurs articles d''un coup :

1. Cliquez sur **+ Ajout multiple**.
2. Remplissez chaque ligne : **Nom**, **Unité**, **Catégorie**, puis cliquez sur **+ Affecter** pour cocher les activités 📍 et labos 🏭 de la ligne (le bouton affiche ensuite le nombre d''affectations).
3. Ajoutez des lignes avec **+ Ajouter une ligne**, puis cliquez sur **Créer**. Chaque ligne doit être complète (affectation comprise) pour valider.

Modifier un article et ses affectations :

1. Cliquez sur **✏️ Modifier** : ajustez le nom, l''unité, la catégorie (ou « Sans catégorie »), puis **Enregistrer**.
2. Dans la section **Affectations** de la même fenêtre, cliquez sur une activité ou un labo pour l''ajouter ou le retirer : chaque clic est **enregistré immédiatement**, sans passer par Enregistrer.

Supprimer un article :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**. Les stocks et historiques liés sont conservés.

### Points d''attention

:::attention
La corbeille est **grisée** si l''article a des approvisionnements enregistrés : la suppression est bloquée.
:::

:::attention
Un article non affecté à une activité ou un labo n''y apparaît ni en stock, ni en approvisionnement, ni dans les fiches techniques. L''affectation est la clé qui rend l''article utilisable sur le terrain.
:::

:::astuce
Pour un gros volume d''articles, préférez l''[Ajout dynamique](#referentiel-import) par fichier Excel, puis affinez les affectations dans le [Catalogue Global](#catalogue-global).
:::

### Voir aussi

- [Unités](#referentiel-unites) et [Catégories](#referentiel-categories) — à préparer avant de créer vos articles
- [Catalogue Global](#catalogue-global) — vue d''ensemble des affectations
- [Stock des activités](#stock-activites) et [Fiches techniques](#fiches-techniques) — où vos articles sont utilisés',
'## 🧂 Articles

Les articles sont vos matières premières et ingrédients : c''est le cœur du référentiel, utilisé pour le stock, les approvisionnements et les fiches techniques. Vous les gérez depuis le menu **Référentiel → Articles**.

### Ce que vous voyez

- Un bandeau d''en-tête avec le **nombre total d''articles**.
- Une barre de filtres : champ **Recherche**, liste **Famille**, liste **Catégorie** (elle se limite aux catégories de la famille choisie), compteur de résultats (ex. « 12 articles sur 87 » quand un filtre est actif) et bouton **Réinitialiser**.
- Deux boutons d''action : **+ Ajout multiple** et **+ Nouvel article**.
- Une liste **groupée par famille puis par catégorie** : chaque famille forme une carte avec son nombre de catégories ; chaque catégorie se déplie d''un clic sur la flèche ▶ et affiche son nombre d''articles (les articles non classés apparaissent sous « Sans catégorie »). Chaque ligne d''article affiche son nom, un badge avec son **unité**, et les boutons **✏️ Modifier** et corbeille 🗑️.

### Actions pas à pas

Créer un article (assistant en deux étapes) :

1. Cliquez sur **+ Nouvel article**.
2. Étape **Informations** : saisissez le **nom**, choisissez l''**unité** et la **catégorie** (présentée sous la forme Famille › Catégorie). Si aucune catégorie n''existe, un message vous invite à en créer d''abord dans le référentiel. Cliquez sur **Suivant →**.
3. Étape **Affectation** : cochez les activités 📍 et/ou labos 🏭 où l''article sera utilisé — **au moins un est requis**. Le bouton **Tout sélectionner** coche tout d''un coup et un compteur suit votre sélection.
4. Cliquez sur **Créer l''article**. Le bouton **← Retour** permet de revenir à l''étape 1.

Créer plusieurs articles d''un coup :

1. Cliquez sur **+ Ajout multiple**.
2. Remplissez chaque ligne : **Nom**, **Unité**, **Catégorie**, puis cliquez sur **+ Affecter** pour cocher les activités 📍 et labos 🏭 de la ligne (le bouton affiche ensuite le nombre d''affectations).
3. Ajoutez des lignes avec **+ Ajouter une ligne**, puis cliquez sur **Créer**. Chaque ligne doit être complète (affectation comprise) pour valider.

Modifier un article et ses affectations :

1. Cliquez sur **✏️ Modifier** : ajustez le nom, l''unité, la catégorie (ou « Sans catégorie »), puis **Enregistrer**.
2. Dans la section **Affectations** de la même fenêtre, cliquez sur une activité ou un labo pour l''ajouter ou le retirer : chaque clic est **enregistré immédiatement**, sans passer par Enregistrer.

Supprimer un article :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**. Les stocks et historiques liés sont conservés.

### Points d''attention

:::attention
La corbeille est **grisée** si l''article a des approvisionnements enregistrés : la suppression est bloquée.
:::

:::attention
Un article non affecté à une activité ou un labo n''y apparaît ni en stock, ni en approvisionnement, ni dans les fiches techniques. L''affectation est la clé qui rend l''article utilisable sur le terrain.
:::

:::astuce
Pour un gros volume d''articles, préférez l''[Ajout dynamique](#referentiel-import) par fichier Excel, puis affinez les affectations dans le [Catalogue Global](#catalogue-global).
:::

### Voir aussi

- [Unités](#referentiel-unites) et [Catégories](#referentiel-categories) — à préparer avant de créer vos articles
- [Catalogue Global](#catalogue-global) — vue d''ensemble des affectations
- [Stock des activités](#stock-activites) et [Fiches techniques](#fiches-techniques) — où vos articles sont utilisés',
'articles, ingrédients, matières premières, unité, catégorie, affectation, activités, labo, ajout multiple, assistant, référentiel', '/client/referentiel/articles', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('referentiel-import', 'Ajout dynamique', '📥', 'Référentiel', 34,
'## 📥 Ajout dynamique (import Excel)

L''Ajout Dynamique permet d''importer en masse vos articles — et en même temps leurs unités, catégories et familles — depuis un fichier Excel. Vous y accédez depuis le menu **Référentiel → Ajout Dynamique**. C''est le moyen le plus rapide de constituer votre référentiel au démarrage.

### Ce que vous voyez

L''écran se présente en étapes numérotées :

- **1️⃣ Téléchargez le modèle** : bouton **📄 Télécharger modele_referentiel.xlsx**, un fichier Excel avec les colonnes **Article / Unité / Catégorie / Famille**.
- **2️⃣ Uploadez votre fichier rempli** : une zone où **glisser-déposer** le fichier (ou cliquer pour le sélectionner), avec une limite de **1 000 lignes par fichier**. Une fois le fichier choisi, son nom et sa taille s''affichent, avec les boutons **Changer de fichier** et **🚀 Lancer l''import**.
- **Le bilan d''import** : un récapitulatif « Import terminé » avec le nombre de lignes traitées, des compteurs par type (**Articles**, **Auto-affectés**, **Catégories**, **Familles**, **Unités**, **Erreurs**) et un tableau détaillé ligne par ligne : **Ligne / Article / Créé / Existant / Affectation / Statut**.

### Actions pas à pas

1. Cliquez sur **📄 Télécharger modele_referentiel.xlsx** et ouvrez le fichier dans Excel.
2. Remplissez **une ligne par article** : nom de l''article, unité, catégorie et famille. Les unités, catégories et familles qui n''existent pas encore dans votre référentiel seront **créées automatiquement**.
3. Glissez le fichier rempli dans la zone d''import (format Excel .xlsx) puis cliquez sur **🚀 Lancer l''import**.
4. Lisez le bilan : la colonne **Créé** liste les éléments ajoutés par la ligne, la colonne **Existant** ceux qui ont été reconnus et réutilisés. Les lignes en erreur sont surlignées ; survolez le symbole ❌ pour lire la cause exacte.
5. Corrigez si besoin les lignes en erreur dans votre fichier, puis cliquez sur **Importer un autre fichier** pour relancer.

Les articles importés sont **automatiquement affectés** à vos activités et labos : ils sont immédiatement utilisables en stock et en approvisionnement. Si un article existait déjà mais n''était affecté nulle part, il est assigné automatiquement et signalé par le badge **🔗 auto** dans la colonne Affectation.

### Points d''attention

:::attention
Respectez l''orthographe des unités, familles et catégories déjà présentes dans votre référentiel : toute variante d''écriture (accent, pluriel…) peut créer un doublon. Seules les différences de majuscules/minuscules et les espaces en début ou fin de nom sont tolérées pour les articles, unités et familles.
:::

:::attention
Le fichier doit être au format Excel (.xlsx) et ne pas dépasser **1 000 lignes**. Au-delà, découpez votre catalogue en plusieurs fichiers.
:::

:::astuce
Après un import, passez par le [Catalogue Global](#catalogue-global) pour ajuster finement quelles activités et quels labos utilisent chaque article.
:::

### Voir aussi

- [Articles](#referentiel-articles) — création manuelle à l''unité ou en série
- [Catalogue Global](#catalogue-global) — ajuster les affectations après import
- [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories)
- [Bien démarrer](#demarrage)',
'## 📥 Ajout dynamique (import Excel)

L''Ajout Dynamique permet d''importer en masse vos articles — et en même temps leurs unités, catégories et familles — depuis un fichier Excel. Vous y accédez depuis le menu **Référentiel → Ajout Dynamique**. C''est le moyen le plus rapide de constituer votre référentiel au démarrage.

### Ce que vous voyez

L''écran se présente en étapes numérotées :

- **1️⃣ Téléchargez le modèle** : bouton **📄 Télécharger modele_referentiel.xlsx**, un fichier Excel avec les colonnes **Article / Unité / Catégorie / Famille**.
- **2️⃣ Uploadez votre fichier rempli** : une zone où **glisser-déposer** le fichier (ou cliquer pour le sélectionner), avec une limite de **1 000 lignes par fichier**. Une fois le fichier choisi, son nom et sa taille s''affichent, avec les boutons **Changer de fichier** et **🚀 Lancer l''import**.
- **Le bilan d''import** : un récapitulatif « Import terminé » avec le nombre de lignes traitées, des compteurs par type (**Articles**, **Auto-affectés**, **Catégories**, **Familles**, **Unités**, **Erreurs**) et un tableau détaillé ligne par ligne : **Ligne / Article / Créé / Existant / Affectation / Statut**.

### Actions pas à pas

1. Cliquez sur **📄 Télécharger modele_referentiel.xlsx** et ouvrez le fichier dans Excel.
2. Remplissez **une ligne par article** : nom de l''article, unité, catégorie et famille. Les unités, catégories et familles qui n''existent pas encore dans votre référentiel seront **créées automatiquement**.
3. Glissez le fichier rempli dans la zone d''import (format Excel .xlsx) puis cliquez sur **🚀 Lancer l''import**.
4. Lisez le bilan : la colonne **Créé** liste les éléments ajoutés par la ligne, la colonne **Existant** ceux qui ont été reconnus et réutilisés. Les lignes en erreur sont surlignées ; survolez le symbole ❌ pour lire la cause exacte.
5. Corrigez si besoin les lignes en erreur dans votre fichier, puis cliquez sur **Importer un autre fichier** pour relancer.

Les articles importés sont **automatiquement affectés** à vos activités et labos : ils sont immédiatement utilisables en stock et en approvisionnement. Si un article existait déjà mais n''était affecté nulle part, il est assigné automatiquement et signalé par le badge **🔗 auto** dans la colonne Affectation.

### Points d''attention

:::attention
Respectez l''orthographe des unités, familles et catégories déjà présentes dans votre référentiel : toute variante d''écriture (accent, pluriel…) peut créer un doublon. Seules les différences de majuscules/minuscules et les espaces en début ou fin de nom sont tolérées pour les articles, unités et familles.
:::

:::attention
Le fichier doit être au format Excel (.xlsx) et ne pas dépasser **1 000 lignes**. Au-delà, découpez votre catalogue en plusieurs fichiers.
:::

:::astuce
Après un import, passez par le [Catalogue Global](#catalogue-global) pour ajuster finement quelles activités et quels labos utilisent chaque article.
:::

### Voir aussi

- [Articles](#referentiel-articles) — création manuelle à l''unité ou en série
- [Catalogue Global](#catalogue-global) — ajuster les affectations après import
- [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories)
- [Bien démarrer](#demarrage)',
'import, excel, ajout dynamique, masse, modèle, fichier, xlsx, doublons, auto-affectation, erreurs, référentiel', '/client/referentiel/import', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('catalogue-global', 'Catalogue Global', '🏷', 'Référentiel', 35,
'## 🏷 Catalogue Global

Le Catalogue Global offre une vue d''ensemble de tous vos articles et de leurs affectations : pour chaque article, vous voyez d''un coup d''œil dans quelles activités et quels labos il est utilisable, et vous ajustez tout en un clic. L''écran n''apparaît pas dans le menu latéral : vous y accédez par l''adresse `/client/catalogue-global`, ou via le bouton **🌐 Aller au Catalogue Global →** proposé sur l''écran [Transferts](#transferts) quand aucun article n''est disponible au transfert.

### Ce que vous voyez

- Une barre de **Filtres** : liste **Catégorie**, liste **Article** (elle apparaît quand une catégorie est choisie), liste **Activité / Labo** (regroupée en Activités et Labos), champ **Nom** pour la recherche, et bouton **✕ Réinitialiser**.
- Un compteur global : « X / Y article(s) avec au moins une assignation ».
- La liste des articles **regroupée par catégorie**, en ordre alphabétique : chaque catégorie se déplie d''un clic et affiche son ratio d''articles assignés (ex. 4/9). Au-delà de dix catégories, une pagination ‹ › apparaît en bas de liste.
- Pour chaque article : son nom, son unité, puis une **pastille par activité 📍 et par labo 🏭**. Une pastille assignée est colorée et cochée ✔ ; une pastille non assignée est grise avec un +. Un article ayant au moins une assignation est marqué d''un liseré coloré.
- Quand un article peut être affecté à plusieurs activités/labos, un bouton **✓ Tout assigner** / **✕ Tout retirer** permet de basculer toutes ses pastilles d''un coup.

### Actions pas à pas

Assigner un article à une activité ou un labo :

1. Retrouvez l''article (filtres Catégorie, Article ou Nom).
2. Cliquez sur la pastille grise de l''activité 📍 ou du labo 🏭 visé : elle passe en couleur avec ✔. L''enregistrement est immédiat.

Retirer une assignation d''activité :

1. Cliquez sur la pastille assignée de l''activité.
2. Si l''article a un historique dans cette activité, une fenêtre **« Désassignation avec cascade »** détaille les conséquences : nombre d''**approvisionnements supprimés**, nombre d''**inventaires supprimés**, et recalcul du stock de l''activité.
3. Confirmez avec **Désassigner et supprimer** (ou **Désassigner** s''il n''y a aucun historique), ou cliquez sur **Annuler** pour renoncer.

Traiter un article sur tous les fronts :

1. Utilisez **✓ Tout assigner** pour le rendre disponible partout, ou **✕ Tout retirer** pour le désactiver partout.

### Points d''attention

:::attention
La désassignation avec cascade est **irréversible** : les approvisionnements et inventaires supprimés ne peuvent pas être restaurés, et le stock de l''activité est recalculé. Lisez bien le détail affiché avant de confirmer.
:::

:::attention
Si votre compte est en **lecture seule**, les pastilles restent visibles mais ne sont plus cliquables : vous consultez les affectations sans pouvoir les modifier.
:::

:::astuce
Pour auditer le catalogue d''une activité ou d''un labo précis, réduisez d''abord la liste avec les filtres **Catégorie** et **Nom**, puis balayez la colonne de pastilles de ce point de vente : ✔ colorée = assigné, grise avec + = non assigné. Vous repérez ainsi vite ce qui manque ou ce qui est en trop.
:::

### Voir aussi

- [Articles](#referentiel-articles) — créer et modifier les articles eux-mêmes
- [Ajout dynamique](#referentiel-import) — importer en masse avant d''affiner ici
- [Stock des activités](#stock-activites) — où les articles assignés deviennent gérables
- [Compte, activités et labos](#compte-activites-labos)',
'## 🏷 Catalogue Global

Le Catalogue Global offre une vue d''ensemble de tous vos articles et de leurs affectations : pour chaque article, vous voyez d''un coup d''œil dans quelles activités et quels labos il est utilisable, et vous ajustez tout en un clic. L''écran n''apparaît pas dans le menu latéral : vous y accédez par l''adresse `/client/catalogue-global`, ou via le bouton **🌐 Aller au Catalogue Global →** proposé sur l''écran [Transferts](#transferts) quand aucun article n''est disponible au transfert.

### Ce que vous voyez

- Une barre de **Filtres** : liste **Catégorie**, liste **Article** (elle apparaît quand une catégorie est choisie), liste **Activité / Labo** (regroupée en Activités et Labos), champ **Nom** pour la recherche, et bouton **✕ Réinitialiser**.
- Un compteur global : « X / Y article(s) avec au moins une assignation ».
- La liste des articles **regroupée par catégorie**, en ordre alphabétique : chaque catégorie se déplie d''un clic et affiche son ratio d''articles assignés (ex. 4/9). Au-delà de dix catégories, une pagination ‹ › apparaît en bas de liste.
- Pour chaque article : son nom, son unité, puis une **pastille par activité 📍 et par labo 🏭**. Une pastille assignée est colorée et cochée ✔ ; une pastille non assignée est grise avec un +. Un article ayant au moins une assignation est marqué d''un liseré coloré.
- Quand un article peut être affecté à plusieurs activités/labos, un bouton **✓ Tout assigner** / **✕ Tout retirer** permet de basculer toutes ses pastilles d''un coup.

### Actions pas à pas

Assigner un article à une activité ou un labo :

1. Retrouvez l''article (filtres Catégorie, Article ou Nom).
2. Cliquez sur la pastille grise de l''activité 📍 ou du labo 🏭 visé : elle passe en couleur avec ✔. L''enregistrement est immédiat.

Retirer une assignation d''activité :

1. Cliquez sur la pastille assignée de l''activité.
2. Si l''article a un historique dans cette activité, une fenêtre **« Désassignation avec cascade »** détaille les conséquences : nombre d''**approvisionnements supprimés**, nombre d''**inventaires supprimés**, et recalcul du stock de l''activité.
3. Confirmez avec **Désassigner et supprimer** (ou **Désassigner** s''il n''y a aucun historique), ou cliquez sur **Annuler** pour renoncer.

Traiter un article sur tous les fronts :

1. Utilisez **✓ Tout assigner** pour le rendre disponible partout, ou **✕ Tout retirer** pour le désactiver partout.

### Points d''attention

:::attention
La désassignation avec cascade est **irréversible** : les approvisionnements et inventaires supprimés ne peuvent pas être restaurés, et le stock de l''activité est recalculé. Lisez bien le détail affiché avant de confirmer.
:::

:::attention
Si votre compte est en **lecture seule**, les pastilles restent visibles mais ne sont plus cliquables : vous consultez les affectations sans pouvoir les modifier.
:::

:::astuce
Pour auditer le catalogue d''une activité ou d''un labo précis, réduisez d''abord la liste avec les filtres **Catégorie** et **Nom**, puis balayez la colonne de pastilles de ce point de vente : ✔ colorée = assigné, grise avec + = non assigné. Vous repérez ainsi vite ce qui manque ou ce qui est en trop.
:::

### Voir aussi

- [Articles](#referentiel-articles) — créer et modifier les articles eux-mêmes
- [Ajout dynamique](#referentiel-import) — importer en masse avant d''affiner ici
- [Stock des activités](#stock-activites) — où les articles assignés deviennent gérables
- [Compte, activités et labos](#compte-activites-labos)',
'catalogue, assignation, affectation, activités, labo, articles, désassignation, cascade, pastilles, sélection, retirer', '/client/catalogue-global', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('categories-produits', 'Catégories Produits', '🏷️', 'Espace Produit', 40,
'## 🏷️ Catégories de produit

Cet écran vous permet de classer vos produits de vente en catégories (par exemple « Entrées », « Boissons », « Desserts »). Vous le trouvez dans le menu **Espace Produits → Catégories Produits**. Ces catégories structurent ensuite la configuration des prix de vente et la saisie des ventes.

### Ce que vous voyez

- Un bandeau d''en-tête avec le **nombre total de catégories** créées.
- Une barre de filtres : champ **Recherche** (filtre sur le nom), liste **Type** (tous les types ou un seul), bouton **Réinitialiser** dès qu''un filtre est actif, et le bouton **+ Nouvelle catégorie**.
- Un tableau à quatre colonnes : **Nom**, **Type** (badge), **Produits** (nombre de produits rattachés à la catégorie) et **Actions** (✏️ Modifier, 🗑️ Supprimer).

Chaque catégorie appartient obligatoirement à **un type**, qui détermine où elle sera proposée :

| Type | Sert à classer |
|---|---|
| 🍽️ Produit vendable | Les produits finis vendus à la carte (plats, pizzas, formules…) |
| ➕ Supplément vendable | Les suppléments vendus en complément (sauce, garniture…) |
| 💎 Article valorisé | Les articles revendus tels quels (boissons en bouteille, produits négoce…) |

### Actions pas à pas

**Créer une ou plusieurs catégories**

1. Cliquez sur **+ Nouvelle catégorie**.
2. Choisissez le **Type** : il s''appliquera à tous les noms saisis dans cette fenêtre.
3. Saisissez un nom par ligne. Ajoutez des lignes avec **+ Ajouter une ligne** (la touche Entrée sur la dernière ligne en crée une nouvelle) ; le bouton × retire une ligne.
4. Cliquez sur **Enregistrer** : toutes les lignes remplies sont créées d''un coup.

**Modifier une catégorie**

1. Cliquez sur **✏️ Modifier** sur la ligne concernée.
2. Ajustez le type et/ou le nom, puis **Enregistrer**.

**Supprimer une catégorie**

1. Cliquez sur **🗑️**, puis confirmez dans la fenêtre d''avertissement.

### Points d''attention

:::regle
Lors de l''affectation d''une catégorie à un produit, seules les catégories du **bon type** sont proposées : une catégorie « Supplément vendable » n''apparaîtra jamais dans la liste d''un produit vendable, et inversement.
:::

:::attention
La suppression d''une catégorie ne supprime pas les produits : ils **perdent simplement leur catégorie** et devront être reclassés pour rester bien organisés dans la configuration de vente.
:::

:::astuce
Créez vos catégories **avant** vos produits : la catégorie est obligatoire à la création d''un produit vendable ou d''un supplément, et nécessaire pour qu''un article valorisé soit proposé à la vente.
:::

### Voir aussi

- [Produits Vendables](#produits-vendables) — la catégorie y est exigée à la création
- [Produits Valorisés](#articles-valorises) — assignez une catégorie de type « Article valorisé »
- [Configuration Vente](#configuration-vente) — les catégories y organisent vos prix
- [Saisie des ventes](#saisie-ventes) — les produits y sont regroupés par catégorie
- [Lexique](#lexique)',
'## 🏷️ Catégories de produit

Cet écran vous permet de classer vos produits de vente en catégories (par exemple « Entrées », « Boissons », « Desserts »). Vous le trouvez dans le menu **Espace Produits → Catégories Produits**. Ces catégories structurent ensuite la configuration des prix de vente et la saisie des ventes.

### Ce que vous voyez

- Un bandeau d''en-tête avec le **nombre total de catégories** créées.
- Une barre de filtres : champ **Recherche** (filtre sur le nom), liste **Type** (tous les types ou un seul), bouton **Réinitialiser** dès qu''un filtre est actif, et le bouton **+ Nouvelle catégorie**.
- Un tableau à quatre colonnes : **Nom**, **Type** (badge), **Produits** (nombre de produits rattachés à la catégorie) et **Actions** (✏️ Modifier, 🗑️ Supprimer).

Chaque catégorie appartient obligatoirement à **un type**, qui détermine où elle sera proposée :

| Type | Sert à classer |
|---|---|
| 🍽️ Produit vendable | Les produits finis vendus à la carte (plats, pizzas, formules…) |
| ➕ Supplément vendable | Les suppléments vendus en complément (sauce, garniture…) |
| 💎 Article valorisé | Les articles revendus tels quels (boissons en bouteille, produits négoce…) |

### Actions pas à pas

**Créer une ou plusieurs catégories**

1. Cliquez sur **+ Nouvelle catégorie**.
2. Choisissez le **Type** : il s''appliquera à tous les noms saisis dans cette fenêtre.
3. Saisissez un nom par ligne. Ajoutez des lignes avec **+ Ajouter une ligne** (la touche Entrée sur la dernière ligne en crée une nouvelle) ; le bouton × retire une ligne.
4. Cliquez sur **Enregistrer** : toutes les lignes remplies sont créées d''un coup.

**Modifier une catégorie**

1. Cliquez sur **✏️ Modifier** sur la ligne concernée.
2. Ajustez le type et/ou le nom, puis **Enregistrer**.

**Supprimer une catégorie**

1. Cliquez sur **🗑️**, puis confirmez dans la fenêtre d''avertissement.

### Points d''attention

:::regle
Lors de l''affectation d''une catégorie à un produit, seules les catégories du **bon type** sont proposées : une catégorie « Supplément vendable » n''apparaîtra jamais dans la liste d''un produit vendable, et inversement.
:::

:::attention
La suppression d''une catégorie ne supprime pas les produits : ils **perdent simplement leur catégorie** et devront être reclassés pour rester bien organisés dans la configuration de vente.
:::

:::astuce
Créez vos catégories **avant** vos produits : la catégorie est obligatoire à la création d''un produit vendable ou d''un supplément, et nécessaire pour qu''un article valorisé soit proposé à la vente.
:::

### Voir aussi

- [Produits Vendables](#produits-vendables) — la catégorie y est exigée à la création
- [Produits Valorisés](#articles-valorises) — assignez une catégorie de type « Article valorisé »
- [Configuration Vente](#configuration-vente) — les catégories y organisent vos prix
- [Saisie des ventes](#saisie-ventes) — les produits y sont regroupés par catégorie
- [Lexique](#lexique)',
'catégorie, catégories produit, classement, type, vendable, supplément, valorisé, carte, menu, boissons, desserts, organisation', '/client/products/categories', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('produits-vendables', 'Produits Vendables', '🍽️', 'Espace Produit', 41,
'## 🍽️ Produits Vendables & Suppléments

Cet écran regroupe vos **produits finis destinés à la vente** (plats, pizzas, formules…) et vos **suppléments** (sauce, garniture vendue en plus). Vous le trouvez dans le menu **Espace Produits → Produits Vendables**. Chaque produit est défini par sa recette, qui sert au calcul de son coût de revient.

### Ce que vous voyez

- Deux onglets avec compteurs : **🍽️ Produits vendables** et **➕ Suppléments vendables**.
- Une barre de filtres : **📍 Activité**, **🏷️ Catégorie**, **🔍 Nom**, bouton **Réinitialiser**, bouton **Exporter XLS** et bouton **+ Produit vendable** (ou **+ Supplément vendable** selon l''onglet).
- Des **cartes produit** (9 par page, avec pagination) affichant : le nom, la référence éventuelle, le badge de catégorie, le bouton **👁 Voir composition** (avec un résumé du type « 2 articles · 1 PU »), les actions (**Fiche tech.**, **Modifier**, **Supprimer**) et des **pastilles d''activités** en bas de carte.

### L''assistant unique de création et de modification

Un **même assistant en 5 étapes** sert à créer ET à modifier un produit (le bouton **Modifier** l''ouvre pré-rempli) :

1. **Affectation** — cochez la ou les **activités** qui vendront ce produit (bouton « Tout sélectionner » disponible).
2. **Identité** — saisissez le **nom** (obligatoire), une **référence** (optionnelle) et la **catégorie de produit** (obligatoire, du bon type). Pour un produit vendable (hors supplément), une option **📦 « Gérer ce produit en stock (appros libres) »** permet de le suivre dans le stock des activités choisies : approvisionnements manuels, transferts, pertes, seuil et inventaire. Vous pouvez alors aussi cocher les **labos** où il sera géré.
3. **Articles** — recherchez vos ingrédients (filtres par famille et catégorie d''article), cochez-les et saisissez la **portion** dans l''unité de l''article. Seules les lignes avec une portion supérieure à 0 sont retenues.
4. **Produits Utilisables** — ajoutez d''éventuelles sous-préparations (avec leur portion). La recette doit compter **au moins 2 composants** au total ; un **supplément** en compte **exactement 1** (un article OU un produit utilisable).
5. **Récap** — vérifiez l''identité, les composants et les affectations, puis validez avec **Créer le produit ✓**. Un écran de confirmation propose **+ Ajouter un autre**.

### Actions pas à pas

**Consulter une recette** : cliquez sur **👁 Voir composition** — l''arborescence affiche les articles avec leurs portions et les sous-préparations, dépliables niveau par niveau.

**Affecter à une activité** : cliquez sur une **pastille d''activité** sous la carte ; la coche ✓ indique que le produit y est disponible.

**Exporter** : le bouton **Exporter XLS** génère la liste filtrée ; pour les vendables, une option permet d''inclure aussi l''autre onglet (suppléments ou produits) dans une feuille séparée du même fichier.

**Supprimer** : bouton **Supprimer**, puis confirmation. L''action est **irréversible**.

### Points d''attention

:::regle
Le **prix de vente ne se définit pas ici** : il se configure par activité dans la [Configuration Vente](#configuration-vente).
:::

:::attention
En tant que **gérant**, vous consultez cet écran mais la création, la modification et la suppression des produits sont réservées au compte propriétaire.
:::

:::astuce
Servez-vous des filtres Activité et Catégorie pour vérifier rapidement qu''aucun produit de la carte d''un point de vente n''a été oublié.
:::

### Voir aussi

- [Catégories Produits](#categories-produits) — à créer avant vos produits
- [Produits Utilisables](#produits-utilisables) — les sous-préparations de vos recettes
- [Fiches Techniques](#fiches-techniques) — coût de revient et export
- [Comprendre le coût d''une recette](#calc-cout-recette)
- [Configuration Vente](#configuration-vente)',
'## 🍽️ Produits Vendables & Suppléments

Cet écran regroupe vos **produits finis destinés à la vente** (plats, pizzas, formules…) et vos **suppléments** (sauce, garniture vendue en plus). Vous le trouvez dans le menu **Espace Produits → Produits Vendables**. Chaque produit est défini par sa recette, qui sert au calcul de son coût de revient.

### Ce que vous voyez

- Deux onglets avec compteurs : **🍽️ Produits vendables** et **➕ Suppléments vendables**.
- Une barre de filtres : **📍 Activité**, **🏷️ Catégorie**, **🔍 Nom**, bouton **Réinitialiser**, bouton **Exporter XLS** et bouton **+ Produit vendable** (ou **+ Supplément vendable** selon l''onglet).
- Des **cartes produit** (9 par page, avec pagination) affichant : le nom, la référence éventuelle, le badge de catégorie, le bouton **👁 Voir composition** (avec un résumé du type « 2 articles · 1 PU »), les actions (**Fiche tech.**, **Modifier**, **Supprimer**) et des **pastilles d''activités** en bas de carte.

### L''assistant unique de création et de modification

Un **même assistant en 5 étapes** sert à créer ET à modifier un produit (le bouton **Modifier** l''ouvre pré-rempli) :

1. **Affectation** — cochez la ou les **activités** qui vendront ce produit (bouton « Tout sélectionner » disponible).
2. **Identité** — saisissez le **nom** (obligatoire), une **référence** (optionnelle) et la **catégorie de produit** (obligatoire, du bon type). Pour un produit vendable (hors supplément), une option **📦 « Gérer ce produit en stock (appros libres) »** permet de le suivre dans le stock des activités choisies : approvisionnements manuels, transferts, pertes, seuil et inventaire. Vous pouvez alors aussi cocher les **labos** où il sera géré.
3. **Articles** — recherchez vos ingrédients (filtres par famille et catégorie d''article), cochez-les et saisissez la **portion** dans l''unité de l''article. Seules les lignes avec une portion supérieure à 0 sont retenues.
4. **Produits Utilisables** — ajoutez d''éventuelles sous-préparations (avec leur portion). La recette doit compter **au moins 2 composants** au total ; un **supplément** en compte **exactement 1** (un article OU un produit utilisable).
5. **Récap** — vérifiez l''identité, les composants et les affectations, puis validez avec **Créer le produit ✓**. Un écran de confirmation propose **+ Ajouter un autre**.

### Actions pas à pas

**Consulter une recette** : cliquez sur **👁 Voir composition** — l''arborescence affiche les articles avec leurs portions et les sous-préparations, dépliables niveau par niveau.

**Affecter à une activité** : cliquez sur une **pastille d''activité** sous la carte ; la coche ✓ indique que le produit y est disponible.

**Exporter** : le bouton **Exporter XLS** génère la liste filtrée ; pour les vendables, une option permet d''inclure aussi l''autre onglet (suppléments ou produits) dans une feuille séparée du même fichier.

**Supprimer** : bouton **Supprimer**, puis confirmation. L''action est **irréversible**.

### Points d''attention

:::regle
Le **prix de vente ne se définit pas ici** : il se configure par activité dans la [Configuration Vente](#configuration-vente).
:::

:::attention
En tant que **gérant**, vous consultez cet écran mais la création, la modification et la suppression des produits sont réservées au compte propriétaire.
:::

:::astuce
Servez-vous des filtres Activité et Catégorie pour vérifier rapidement qu''aucun produit de la carte d''un point de vente n''a été oublié.
:::

### Voir aussi

- [Catégories Produits](#categories-produits) — à créer avant vos produits
- [Produits Utilisables](#produits-utilisables) — les sous-préparations de vos recettes
- [Fiches Techniques](#fiches-techniques) — coût de revient et export
- [Comprendre le coût d''une recette](#calc-cout-recette)
- [Configuration Vente](#configuration-vente)',
'produit vendable, supplément, recette, assistant, création, plat, carte, composition, portion, stock, affectation, fiche technique', '/client/products?tab=vendable', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('produits-utilisables', 'Produits Utilisables', '🧪', 'Espace Produit', 42,
'## 🧪 Produits Utilisables (produits transformés)

Un **produit utilisable** (PU) est une préparation intermédiaire — sauce, pâte, fond, crème — qui n''est pas vendue telle quelle mais **réutilisée dans d''autres recettes**. Vous le trouvez dans le menu **Espace Produits → Produits Utilisables**. Chaque PU possède sa propre recette et peut être produit, stocké et transféré.

### Ce que vous voyez

- Une barre de filtres : **📍 Activité**, **🔍 Nom**, bouton **Réinitialiser**, **Exporter XLS** et **+ Produit utilisable**.
- Des **cartes produit** (9 par page) avec : le nom, le bouton **👁 Voir composition** (résumé « N articles · N sous-produits »), les actions (**Fiche tech.**, **Modifier**, **Supprimer**) et **deux blocs de pastilles** : les **Activités** et les **Labos** où le produit est géré.
- Un badge **⇄ Transfert uniquement** sur les produits fabriqués au labo : ils ne peuvent être approvisionnés en activité que par transfert.

### Les deux modes d''approvisionnement

À la première étape de l''assistant, vous choisissez le circuit du produit :

| Mode | Fonctionnement |
|---|---|
| 🆓 Appros libres | Le produit est géré directement dans les activités : approvisionnements manuels possibles. À l''ouverture, **toutes les activités et tous les labos sont pré-cochés** — décochez pour exclure. |
| 🔒 Appros limités aux transferts | Le produit est **fabriqué au(x) labo(s) choisi(s)**. Les activités rattachées à ces labos sont pré-cochées et le recevront **uniquement par transfert** ; aucun appro manuel en activité. |

En mode limité, si aucune activité n''est cochée, le produit reste au labo (non distribué). Les articles proposés pour la recette correspondent toujours au périmètre choisi.

### Actions pas à pas

**Créer un produit utilisable**

1. Cliquez sur **+ Produit utilisable** : le même assistant en 5 étapes que pour les vendables s''ouvre (Affectation, Identité, Articles, Produits Utilisables, Récap).
2. À l''étape Affectation, choisissez le mode d''approvisionnement (voir tableau ci-dessus).
3. À l''étape Identité, saisissez le nom et la référence éventuelle — **aucune catégorie n''est demandée** pour un PU.
4. Composez la recette : articles avec portions, et éventuellement d''autres produits utilisables comme sous-composants (au moins 2 composants au total).
5. Vérifiez le récapitulatif puis validez.

**Ajuster les affectations** : cliquez sur les pastilles **Activités** ou **Labos** sous la carte pour activer ou retirer le produit en un clic.

### À quoi servent-ils dans les recettes

Un PU s''ajoute comme **sous-composant** d''un produit vendable, d''un composé valorisé ou d''un autre PU. Son coût se répercute automatiquement partout où il est utilisé.

:::formule Coût unitaire d''un produit utilisable
Coût = Σ ( portion article × prix unitaire ) + Σ ( portion sous-produit × coût du sous-produit )
note: Calcul récursif — le coût de chaque sous-produit provient lui-même de sa recette.
:::

### Points d''attention

:::attention
La suppression d''un PU ayant un historique déclenche une **suppression en cascade** : la fenêtre de confirmation détaille le nombre d''approvisionnements supprimés, ainsi que le stock, les inventaires et les pertes concernés. L''action est irréversible.
:::

:::regle
Un PU d''origine labo ne peut **jamais** être approvisionné manuellement dans une activité : le stock des activités n''évolue que par [transfert](#transferts).
:::

:::astuce
Mutualisez vos préparations : une sauce définie une seule fois alimente toutes les recettes qui l''utilisent, et toute mise à jour se propage automatiquement.
:::

### Voir aussi

- [Lexique des produits transformés](#lexique-pt)
- [Produits Vendables](#produits-vendables) — pour intégrer vos PU aux recettes
- [Stock des activités](#stock-activites) et [Stock labo](#stock-labo)
- [Production d''un produit transformé](#calc-production-pt)
- [Transferts labo → activités](#calc-transferts)',
'## 🧪 Produits Utilisables (produits transformés)

Un **produit utilisable** (PU) est une préparation intermédiaire — sauce, pâte, fond, crème — qui n''est pas vendue telle quelle mais **réutilisée dans d''autres recettes**. Vous le trouvez dans le menu **Espace Produits → Produits Utilisables**. Chaque PU possède sa propre recette et peut être produit, stocké et transféré.

### Ce que vous voyez

- Une barre de filtres : **📍 Activité**, **🔍 Nom**, bouton **Réinitialiser**, **Exporter XLS** et **+ Produit utilisable**.
- Des **cartes produit** (9 par page) avec : le nom, le bouton **👁 Voir composition** (résumé « N articles · N sous-produits »), les actions (**Fiche tech.**, **Modifier**, **Supprimer**) et **deux blocs de pastilles** : les **Activités** et les **Labos** où le produit est géré.
- Un badge **⇄ Transfert uniquement** sur les produits fabriqués au labo : ils ne peuvent être approvisionnés en activité que par transfert.

### Les deux modes d''approvisionnement

À la première étape de l''assistant, vous choisissez le circuit du produit :

| Mode | Fonctionnement |
|---|---|
| 🆓 Appros libres | Le produit est géré directement dans les activités : approvisionnements manuels possibles. À l''ouverture, **toutes les activités et tous les labos sont pré-cochés** — décochez pour exclure. |
| 🔒 Appros limités aux transferts | Le produit est **fabriqué au(x) labo(s) choisi(s)**. Les activités rattachées à ces labos sont pré-cochées et le recevront **uniquement par transfert** ; aucun appro manuel en activité. |

En mode limité, si aucune activité n''est cochée, le produit reste au labo (non distribué). Les articles proposés pour la recette correspondent toujours au périmètre choisi.

### Actions pas à pas

**Créer un produit utilisable**

1. Cliquez sur **+ Produit utilisable** : le même assistant en 5 étapes que pour les vendables s''ouvre (Affectation, Identité, Articles, Produits Utilisables, Récap).
2. À l''étape Affectation, choisissez le mode d''approvisionnement (voir tableau ci-dessus).
3. À l''étape Identité, saisissez le nom et la référence éventuelle — **aucune catégorie n''est demandée** pour un PU.
4. Composez la recette : articles avec portions, et éventuellement d''autres produits utilisables comme sous-composants (au moins 2 composants au total).
5. Vérifiez le récapitulatif puis validez.

**Ajuster les affectations** : cliquez sur les pastilles **Activités** ou **Labos** sous la carte pour activer ou retirer le produit en un clic.

### À quoi servent-ils dans les recettes

Un PU s''ajoute comme **sous-composant** d''un produit vendable, d''un composé valorisé ou d''un autre PU. Son coût se répercute automatiquement partout où il est utilisé.

:::formule Coût unitaire d''un produit utilisable
Coût = Σ ( portion article × prix unitaire ) + Σ ( portion sous-produit × coût du sous-produit )
note: Calcul récursif — le coût de chaque sous-produit provient lui-même de sa recette.
:::

### Points d''attention

:::attention
La suppression d''un PU ayant un historique déclenche une **suppression en cascade** : la fenêtre de confirmation détaille le nombre d''approvisionnements supprimés, ainsi que le stock, les inventaires et les pertes concernés. L''action est irréversible.
:::

:::regle
Un PU d''origine labo ne peut **jamais** être approvisionné manuellement dans une activité : le stock des activités n''évolue que par [transfert](#transferts).
:::

:::astuce
Mutualisez vos préparations : une sauce définie une seule fois alimente toutes les recettes qui l''utilisent, et toute mise à jour se propage automatiquement.
:::

### Voir aussi

- [Lexique des produits transformés](#lexique-pt)
- [Produits Vendables](#produits-vendables) — pour intégrer vos PU aux recettes
- [Stock des activités](#stock-activites) et [Stock labo](#stock-labo)
- [Production d''un produit transformé](#calc-production-pt)
- [Transferts labo → activités](#calc-transferts)',
'produit utilisable, produit transformé, pt, semi-fini, sauce, appros libres, appros limités, transfert, labo, sous-produit, recette, stock', '/client/products?tab=utilisable', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('articles-valorises', 'Produits Valorisés', '💎', 'Espace Produit', 43,
'## 💎 Produits Valorisés

Les produits valorisés sont **vendus tels quels**, sans décomposition en ingrédients à la vente. Vous les gérez depuis le menu **Espace Produits → Produits Valorisés**. Ils sont de deux natures : les **articles du référentiel** à catégoriser (boissons en bouteille, produits revendus en l''état) et les **produits composés fabriqués au labo** (cookie maison, pâtisserie…).

### Ce que vous voyez

- Un bandeau avec le compteur **« X/Y articles catégorisés »**.
- Deux onglets : **🏭 Composés** (visible uniquement si vous avez au moins un labo) et **💎 Référentiel**.
- Onglet **Référentiel** : filtres **🔍 Article**, **🗂️ Famille** et **🏷️ Statut** (Tous / Catégorisés / Non catégorisés) ; les articles sont **regroupés par catégorie d''article**, avec un tableau à deux colonnes — **Article** (et son unité) et **Catégorie produit** (liste déroulante). La liste est paginée par 10 catégories.
- Onglet **Composés** : filtres **🔍 Produit** (nom ou référence) et **🏷️ Catégorie**, bouton **+ Produit valorisé composé**, puis des cartes 💎 avec badge de catégorie, bouton **👁 Voir composition**, actions (**📄 Fiche technique (XLS)**, **✏️ Modifier**, **🗑**) et pastilles **Activités** / **Labos** (12 cartes par page).

### Actions pas à pas

**Catégoriser un article du référentiel**

1. Ouvrez l''onglet **Référentiel** et retrouvez l''article via les filtres.
2. Sélectionnez sa **catégorie produit** (de type « Article valorisé ») dans la liste déroulante : l''enregistrement est **immédiat**. Un liseré rouge signale les articles encore sans catégorie.

**Créer un produit valorisé composé**

1. Dans l''onglet **Composés**, cliquez sur **+ Produit valorisé composé** : un assistant en 5 étapes s''ouvre.
2. **Affectation** — choisissez le ou les **labos de fabrication** ; les activités rattachées sont pré-cochées et **recevront le produit par transfert** (décochez pour exclure).
3. **Identité** — nom (obligatoire), référence, **catégorie de type valorisé** (obligatoire).
4. **Articles** puis **Produits Utilisables** — composez la recette à partir des articles et PU du périmètre labo (au moins un composant avec portion).
5. **Récap** — vérifiez puis validez avec **Créer le produit ✓**.

**Générer la fiche technique d''un composé** : cliquez sur **📄 Fiche technique (XLS)**. Le coût est calculé sur les **prix d''approvisionnement du labo** de fabrication ; si le produit est fabriqué dans plusieurs labos, une fenêtre vous demande de choisir le labo de référence.

### Points d''attention

:::regle
Les articles valorisables proviennent des familles marquées **« vendable »** et **« non consommable »** dans votre [référentiel](#referentiel-familles). Un article sans catégorie produit n''apparaît pas dans la configuration de vente.
:::

:::attention
Si aucune catégorie de type « Article valorisé » n''existe, un avertissement s''affiche : créez-la d''abord dans [Catégories Produits](#categories-produits).
:::

:::regle
Un composé valorisé est fabriqué au labo et rejoint le stock des activités **uniquement par transfert**. Son prix est **figé au moment de chaque production** au labo (voir [Production d''un produit transformé](#calc-production-pt)).
:::

:::astuce
Cocher une pastille d''activité sur un composé l''inscrit directement au **stock de cette activité** en mode transfert : pensez-y avant votre premier transfert.
:::

### Voir aussi

- [Catégories Produits](#categories-produits)
- [Référentiel — familles](#referentiel-familles) et [articles](#referentiel-articles)
- [Stock labo](#stock-labo) et [Transferts](#transferts)
- [Production d''un produit transformé](#calc-production-pt)
- [Fiches Techniques](#fiches-techniques)',
'## 💎 Produits Valorisés

Les produits valorisés sont **vendus tels quels**, sans décomposition en ingrédients à la vente. Vous les gérez depuis le menu **Espace Produits → Produits Valorisés**. Ils sont de deux natures : les **articles du référentiel** à catégoriser (boissons en bouteille, produits revendus en l''état) et les **produits composés fabriqués au labo** (cookie maison, pâtisserie…).

### Ce que vous voyez

- Un bandeau avec le compteur **« X/Y articles catégorisés »**.
- Deux onglets : **🏭 Composés** (visible uniquement si vous avez au moins un labo) et **💎 Référentiel**.
- Onglet **Référentiel** : filtres **🔍 Article**, **🗂️ Famille** et **🏷️ Statut** (Tous / Catégorisés / Non catégorisés) ; les articles sont **regroupés par catégorie d''article**, avec un tableau à deux colonnes — **Article** (et son unité) et **Catégorie produit** (liste déroulante). La liste est paginée par 10 catégories.
- Onglet **Composés** : filtres **🔍 Produit** (nom ou référence) et **🏷️ Catégorie**, bouton **+ Produit valorisé composé**, puis des cartes 💎 avec badge de catégorie, bouton **👁 Voir composition**, actions (**📄 Fiche technique (XLS)**, **✏️ Modifier**, **🗑**) et pastilles **Activités** / **Labos** (12 cartes par page).

### Actions pas à pas

**Catégoriser un article du référentiel**

1. Ouvrez l''onglet **Référentiel** et retrouvez l''article via les filtres.
2. Sélectionnez sa **catégorie produit** (de type « Article valorisé ») dans la liste déroulante : l''enregistrement est **immédiat**. Un liseré rouge signale les articles encore sans catégorie.

**Créer un produit valorisé composé**

1. Dans l''onglet **Composés**, cliquez sur **+ Produit valorisé composé** : un assistant en 5 étapes s''ouvre.
2. **Affectation** — choisissez le ou les **labos de fabrication** ; les activités rattachées sont pré-cochées et **recevront le produit par transfert** (décochez pour exclure).
3. **Identité** — nom (obligatoire), référence, **catégorie de type valorisé** (obligatoire).
4. **Articles** puis **Produits Utilisables** — composez la recette à partir des articles et PU du périmètre labo (au moins un composant avec portion).
5. **Récap** — vérifiez puis validez avec **Créer le produit ✓**.

**Générer la fiche technique d''un composé** : cliquez sur **📄 Fiche technique (XLS)**. Le coût est calculé sur les **prix d''approvisionnement du labo** de fabrication ; si le produit est fabriqué dans plusieurs labos, une fenêtre vous demande de choisir le labo de référence.

### Points d''attention

:::regle
Les articles valorisables proviennent des familles marquées **« vendable »** et **« non consommable »** dans votre [référentiel](#referentiel-familles). Un article sans catégorie produit n''apparaît pas dans la configuration de vente.
:::

:::attention
Si aucune catégorie de type « Article valorisé » n''existe, un avertissement s''affiche : créez-la d''abord dans [Catégories Produits](#categories-produits).
:::

:::regle
Un composé valorisé est fabriqué au labo et rejoint le stock des activités **uniquement par transfert**. Son prix est **figé au moment de chaque production** au labo (voir [Production d''un produit transformé](#calc-production-pt)).
:::

:::astuce
Cocher une pastille d''activité sur un composé l''inscrit directement au **stock de cette activité** en mode transfert : pensez-y avant votre premier transfert.
:::

### Voir aussi

- [Catégories Produits](#categories-produits)
- [Référentiel — familles](#referentiel-familles) et [articles](#referentiel-articles)
- [Stock labo](#stock-labo) et [Transferts](#transferts)
- [Production d''un produit transformé](#calc-production-pt)
- [Fiches Techniques](#fiches-techniques)',
'article valorisé, produit valorisé, composé, labo, revente, boisson, catégorisation, référentiel, transfert, négoce, catégorie produit', '/client/products/valorises', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('fiches-techniques', 'Fiches Techniques', '📋', 'Espace Produit', 44,
'## 📋 Fiches Techniques & coût de revient

La fiche technique détaille la **composition d''un produit** et calcule son **coût de revient matière**. Vous y accédez de deux façons : le bouton **Fiche tech.** présent sur chaque carte produit, ou le **parcours guidé** de l''onglet Fiche Technique de l''Espace Produits.

### Ce que vous voyez

Le parcours guidé enchaîne des étapes numérotées :

1. **Activité** — choisissez le point de vente (sélection automatique si vous n''en avez qu''un).
2. **Type de produit** — 🍔 Vendables ou 🧪 Utilisables.
3. **Produit** — sélectionnez le produit dans la liste.
4. **Mode de tarification** — choisissez la méthode de valorisation des prix.

Une carte **💰 Coût en temps réel** affiche alors le coût matière en DT (3 décimales), et le bouton **Générer FT Excel** exporte la fiche complète en **Excel**.

### Les modes de valorisation du coût

| Mode | Principe |
|---|---|
| 📦 FP Stock — **DP** (Dernier Prix) | Chaque article est valorisé au prix de son **dernier approvisionnement** |
| 📦 FP Stock — **MP** (Moyenne des Prix) | Chaque article est valorisé à la **moyenne pondérée des prix d''appro depuis le dernier inventaire** |
| ✏️ FP Manuel | Vous **saisissez les prix** vous-même ; ils sont mémorisés avec leur date de mise à jour |

En mode FP Stock, les boutons **DP** et **MP** sont cumulables : les deux coûts s''affichent alors côte à côte, et l''export Excel reprend les deux valorisations.

### Actions pas à pas

**Générer une fiche sur les prix du stock**

1. Choisissez **📦 FP Stock**. L''application vérifie que chaque article de la recette a un approvisionnement : le badge **Approvisionnement trouvé ✓** s''affiche, sinon un avertissement indique le nombre d''articles sans appro.
2. Dans le parcours guidé, le bouton **Compléter le stock** ouvre une fenêtre pour saisir quantité, prix (DT) et date d''appro des articles manquants, pré-remplie avec les dernières valeurs connues.
3. Activez **DP** et/ou **MP**, contrôlez le coût en temps réel, puis cliquez sur **Générer FT Excel**.

**Générer une fiche en prix manuels**

1. Choisissez **✏️ FP Manuel**, puis **Saisir les prix manuels** : la fenêtre liste tous les articles de la recette, y compris ceux des sous-préparations (groupes indentés ↳) ; depuis le bouton **Fiche tech.** d''une carte produit, un champ de recherche facilite la saisie.
2. Saisissez un prix unitaire en DT pour **chaque** article : tant qu''un prix est à 0, une alerte « Prix incomplets » bloque l''enregistrement et la génération.
3. Enregistrez puis cliquez sur **Générer FT Excel** ; la date de dernière mise à jour des prix reste affichée.

### Formules de calcul

:::formule Coût d''une ligne d''ingrédient
Coût ligne = portion × prix unitaire
note: La portion est exprimée dans l''unité de l''article.
:::

:::formule Coût total du produit
Coût total = Σ ( coûts des articles ) + Σ ( portion sous-produit × coût unitaire du sous-produit )
note: Le calcul descend récursivement dans chaque sous-préparation — détail dans [Comprendre le coût d''une recette](#calc-cout-recette).
:::

### Points d''attention

:::regle
Pour un **composé valorisé**, le coût se calcule sur les prix d''approvisionnement du **labo de fabrication**, pas des activités.
:::

:::attention
La génération en mode FP Stock reste bloquée tant que **chaque article de la recette n''a pas d''approvisionnement** : commencez par saisir vos appros ou utilisez le mode manuel.
:::

:::astuce
Comparez **DP et MP** sur un même produit : un écart important signale des prix d''achat volatils, à surveiller avant de fixer vos prix de vente.
:::

### Voir aussi

- [Comprendre le coût d''une recette](#calc-cout-recette)
- [Prix moyen pondéré](#calc-pmp) et [HT / TTC](#calc-ht-ttc)
- [Fixation des prix de vente](#calc-prix)
- [Produits Vendables](#produits-vendables) et [Produits Utilisables](#produits-utilisables)
- [Stock des activités](#stock-activites)',
'## 📋 Fiches Techniques & coût de revient

La fiche technique détaille la **composition d''un produit** et calcule son **coût de revient matière**. Vous y accédez de deux façons : le bouton **Fiche tech.** présent sur chaque carte produit, ou le **parcours guidé** de l''onglet Fiche Technique de l''Espace Produits.

### Ce que vous voyez

Le parcours guidé enchaîne des étapes numérotées :

1. **Activité** — choisissez le point de vente (sélection automatique si vous n''en avez qu''un).
2. **Type de produit** — 🍔 Vendables ou 🧪 Utilisables.
3. **Produit** — sélectionnez le produit dans la liste.
4. **Mode de tarification** — choisissez la méthode de valorisation des prix.

Une carte **💰 Coût en temps réel** affiche alors le coût matière en DT (3 décimales), et le bouton **Générer FT Excel** exporte la fiche complète en **Excel**.

### Les modes de valorisation du coût

| Mode | Principe |
|---|---|
| 📦 FP Stock — **DP** (Dernier Prix) | Chaque article est valorisé au prix de son **dernier approvisionnement** |
| 📦 FP Stock — **MP** (Moyenne des Prix) | Chaque article est valorisé à la **moyenne pondérée des prix d''appro depuis le dernier inventaire** |
| ✏️ FP Manuel | Vous **saisissez les prix** vous-même ; ils sont mémorisés avec leur date de mise à jour |

En mode FP Stock, les boutons **DP** et **MP** sont cumulables : les deux coûts s''affichent alors côte à côte, et l''export Excel reprend les deux valorisations.

### Actions pas à pas

**Générer une fiche sur les prix du stock**

1. Choisissez **📦 FP Stock**. L''application vérifie que chaque article de la recette a un approvisionnement : le badge **Approvisionnement trouvé ✓** s''affiche, sinon un avertissement indique le nombre d''articles sans appro.
2. Dans le parcours guidé, le bouton **Compléter le stock** ouvre une fenêtre pour saisir quantité, prix (DT) et date d''appro des articles manquants, pré-remplie avec les dernières valeurs connues.
3. Activez **DP** et/ou **MP**, contrôlez le coût en temps réel, puis cliquez sur **Générer FT Excel**.

**Générer une fiche en prix manuels**

1. Choisissez **✏️ FP Manuel**, puis **Saisir les prix manuels** : la fenêtre liste tous les articles de la recette, y compris ceux des sous-préparations (groupes indentés ↳) ; depuis le bouton **Fiche tech.** d''une carte produit, un champ de recherche facilite la saisie.
2. Saisissez un prix unitaire en DT pour **chaque** article : tant qu''un prix est à 0, une alerte « Prix incomplets » bloque l''enregistrement et la génération.
3. Enregistrez puis cliquez sur **Générer FT Excel** ; la date de dernière mise à jour des prix reste affichée.

### Formules de calcul

:::formule Coût d''une ligne d''ingrédient
Coût ligne = portion × prix unitaire
note: La portion est exprimée dans l''unité de l''article.
:::

:::formule Coût total du produit
Coût total = Σ ( coûts des articles ) + Σ ( portion sous-produit × coût unitaire du sous-produit )
note: Le calcul descend récursivement dans chaque sous-préparation — détail dans [Comprendre le coût d''une recette](#calc-cout-recette).
:::

### Points d''attention

:::regle
Pour un **composé valorisé**, le coût se calcule sur les prix d''approvisionnement du **labo de fabrication**, pas des activités.
:::

:::attention
La génération en mode FP Stock reste bloquée tant que **chaque article de la recette n''a pas d''approvisionnement** : commencez par saisir vos appros ou utilisez le mode manuel.
:::

:::astuce
Comparez **DP et MP** sur un même produit : un écart important signale des prix d''achat volatils, à surveiller avant de fixer vos prix de vente.
:::

### Voir aussi

- [Comprendre le coût d''une recette](#calc-cout-recette)
- [Prix moyen pondéré](#calc-pmp) et [HT / TTC](#calc-ht-ttc)
- [Fixation des prix de vente](#calc-prix)
- [Produits Vendables](#produits-vendables) et [Produits Utilisables](#produits-utilisables)
- [Stock des activités](#stock-activites)',
'fiche technique, coût de revient, coût matière, dernier prix, moyenne des prix, prix manuel, export excel, recette, valorisation, chiffrage, dp, mp', '/client/products?tab=fiche-technique', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('stock-activites', 'Stock Activités', '📦', 'Stock & Appro', 50,
'## 📦 Stock Activités

L''écran **Stock Activités** (menu **Espace Activités → Stock Activités**) est le poste central de chaque point de vente : quantités disponibles, saisie des approvisionnements, seuils d''alerte et déclaration des pertes. Le stock se consulte **activité par activité** : sélectionnez le point de vente grâce aux pastilles 🏪 en haut de l''écran — il n''existe pas de vue globale « Toutes ». Un gérant ne voit que les activités qui lui sont affectées.

### Ce que vous voyez

Une barre de filtres cible les lignes affichées : **Catégorie**, **Article** (débloqué après le choix d''une catégorie), **Nom** (recherche libre), **Fournisseur** et **Réf. Facture**, avec un bouton **Réinitialiser**.

Le bloc bleu **Approvisionnement** regroupe les informations communes à la saisie : **Date d''appro** (obligatoire, entre le 1er janvier de l''année en cours et aujourd''hui), **Fournisseur**, **Réf Facture** (obligatoire), puis le bouton **Enregistrer (N)** — N compte les lignes prêtes.

Les articles sont groupés par **catégories repliables** (cliquez sur l''en-tête pour ouvrir). Les produits transformés apparaissent dans leurs propres catégories : **Produits Transformés Utilisables**, **Produits Transformés Vendables** et **Produits Composés Valorisés** (voir [le lexique des PT](#lexique-pt)).

| Colonne | Contenu |
|---|---|
| Article | nom, unité, lien 📋 Historique, date et quantité du dernier inventaire 📦 |
| Stock Actuel | quantité disponible + détail : ↑ appro, ⇄ transf, ↘ pertes, PT (consommé par vos productions), 💰 VENTE |
| Coût Total | valeur du stock en TTC (le montant HT s''affiche en dessous) |
| Quantité | saisie de la nouvelle quantité approvisionnée |
| Prix | prix d''achat HT unitaire (calculé automatiquement pour un produit transformé) |
| TVA (%) | taux de TVA, optionnel |
| Actions | 🔧 Seuil, 📉 Perte, ⚙️ Personnaliser (produits transformés) |

La couleur du stock reflète le **seuil minimum** : 🔴 stock inférieur ou égal au seuil, 🟠 juste au-dessus (jusqu''à seuil + 10 %), 🟢 au-delà.

:::formule Stock actuel
Stock = Approvisionnements + Transferts entrants − Consommations (ventes, productions) − Pertes ± Ajustements d''inventaire
:::

### Actions pas à pas

Enregistrer un approvisionnement :

1. Sélectionnez l''activité, puis renseignez le bloc Approvisionnement : date, fournisseur et n° de facture.
2. Ouvrez les catégories concernées et saisissez, ligne par ligne, la **quantité** et le **prix HT** unitaire (et le taux de TVA si vous le connaissez).
3. Contrôlez l''**Aperçu saisie** flottant en bas à droite : il cumule les lignes et le total TTC.
4. Cliquez sur **Enregistrer (N)** : une fenêtre récapitulative façon facture s''ouvre (lignes, Total HT, Total TTC, case **Timbre Fiscal** ajoutant 1,000 DT, cochée par défaut). Confirmez.
5. Si un appro existe déjà à cette date pour un article, une confirmation supplémentaire affiche le cumul avant validation.

Produire un produit transformé : saisissez la quantité sur sa ligne — l''indication **Max** montre le maximum réalisable avec le stock d''ingrédients, et le prix se calcule automatiquement depuis la recette ([production de PT](#calc-production-pt)). Le bouton **⚙️ Personnaliser** permet d''ajuster les quantités d''ingrédients réellement consommées.

Configurer un seuil : bouton **🔧 Seuil**, saisissez la valeur minimale (laisser vide pour désactiver), puis Enregistrer. Le seuil d''un produit transformé se règle aussi activité par activité.

### Points d''attention

:::attention
Un produit transformé fabriqué au **labo** porte le badge **⇄ Transfert uniquement** : sa quantité ne se saisit pas ici, il n''entre en stock d''activité que par [transfert](#transferts). Par ailleurs, une même validation ne peut pas mélanger production de PT et appro d''articles : dès qu''une quantité de PT est saisie, les champs Fournisseur et Réf Facture se désactivent — enregistrez les deux séparément. Enfin, si le champ Fournisseur affiche « ⚠ Aucun fournisseur », créez d''abord vos [fournisseurs](#fournisseurs) : le n° de facture est toujours exigé, et le choix d''un fournisseur devient obligatoire dès qu''au moins un fournisseur existe.
:::

:::formule Prix TTC
TTC = HT × ( 1 + TVA ÷ 100 )
note: Un article acheté 10 DT HT avec 19 % de TVA revient à 11,900 DT TTC.
:::

:::astuce
Le lien **📋 Historique** sous chaque article affiche ses derniers mouvements (date, type, quantité, prix HT et TTC, fournisseur, réf. facture) sans quitter l''écran, avec un bouton vers l''historique complet.
:::

### Voir aussi

- [Valeur du stock](#calc-valeur-stock) — comment le stock actuel est calculé
- [HT et TTC](#calc-ht-ttc) · [Seuils d''alerte](#calc-seuils)
- [Pertes](#pertes) · [Historiques](#historique) · [Transferts](#transferts) · [Factures d''appro](#factures)',
'## 📦 Stock Activités

L''écran **Stock Activités** (menu **Espace Activités → Stock Activités**) est le poste central de chaque point de vente : quantités disponibles, saisie des approvisionnements, seuils d''alerte et déclaration des pertes. Le stock se consulte **activité par activité** : sélectionnez le point de vente grâce aux pastilles 🏪 en haut de l''écran — il n''existe pas de vue globale « Toutes ». Un gérant ne voit que les activités qui lui sont affectées.

### Ce que vous voyez

Une barre de filtres cible les lignes affichées : **Catégorie**, **Article** (débloqué après le choix d''une catégorie), **Nom** (recherche libre), **Fournisseur** et **Réf. Facture**, avec un bouton **Réinitialiser**.

Le bloc bleu **Approvisionnement** regroupe les informations communes à la saisie : **Date d''appro** (obligatoire, entre le 1er janvier de l''année en cours et aujourd''hui), **Fournisseur**, **Réf Facture** (obligatoire), puis le bouton **Enregistrer (N)** — N compte les lignes prêtes.

Les articles sont groupés par **catégories repliables** (cliquez sur l''en-tête pour ouvrir). Les produits transformés apparaissent dans leurs propres catégories : **Produits Transformés Utilisables**, **Produits Transformés Vendables** et **Produits Composés Valorisés** (voir [le lexique des PT](#lexique-pt)).

| Colonne | Contenu |
|---|---|
| Article | nom, unité, lien 📋 Historique, date et quantité du dernier inventaire 📦 |
| Stock Actuel | quantité disponible + détail : ↑ appro, ⇄ transf, ↘ pertes, PT (consommé par vos productions), 💰 VENTE |
| Coût Total | valeur du stock en TTC (le montant HT s''affiche en dessous) |
| Quantité | saisie de la nouvelle quantité approvisionnée |
| Prix | prix d''achat HT unitaire (calculé automatiquement pour un produit transformé) |
| TVA (%) | taux de TVA, optionnel |
| Actions | 🔧 Seuil, 📉 Perte, ⚙️ Personnaliser (produits transformés) |

La couleur du stock reflète le **seuil minimum** : 🔴 stock inférieur ou égal au seuil, 🟠 juste au-dessus (jusqu''à seuil + 10 %), 🟢 au-delà.

:::formule Stock actuel
Stock = Approvisionnements + Transferts entrants − Consommations (ventes, productions) − Pertes ± Ajustements d''inventaire
:::

### Actions pas à pas

Enregistrer un approvisionnement :

1. Sélectionnez l''activité, puis renseignez le bloc Approvisionnement : date, fournisseur et n° de facture.
2. Ouvrez les catégories concernées et saisissez, ligne par ligne, la **quantité** et le **prix HT** unitaire (et le taux de TVA si vous le connaissez).
3. Contrôlez l''**Aperçu saisie** flottant en bas à droite : il cumule les lignes et le total TTC.
4. Cliquez sur **Enregistrer (N)** : une fenêtre récapitulative façon facture s''ouvre (lignes, Total HT, Total TTC, case **Timbre Fiscal** ajoutant 1,000 DT, cochée par défaut). Confirmez.
5. Si un appro existe déjà à cette date pour un article, une confirmation supplémentaire affiche le cumul avant validation.

Produire un produit transformé : saisissez la quantité sur sa ligne — l''indication **Max** montre le maximum réalisable avec le stock d''ingrédients, et le prix se calcule automatiquement depuis la recette ([production de PT](#calc-production-pt)). Le bouton **⚙️ Personnaliser** permet d''ajuster les quantités d''ingrédients réellement consommées.

Configurer un seuil : bouton **🔧 Seuil**, saisissez la valeur minimale (laisser vide pour désactiver), puis Enregistrer. Le seuil d''un produit transformé se règle aussi activité par activité.

### Points d''attention

:::attention
Un produit transformé fabriqué au **labo** porte le badge **⇄ Transfert uniquement** : sa quantité ne se saisit pas ici, il n''entre en stock d''activité que par [transfert](#transferts). Par ailleurs, une même validation ne peut pas mélanger production de PT et appro d''articles : dès qu''une quantité de PT est saisie, les champs Fournisseur et Réf Facture se désactivent — enregistrez les deux séparément. Enfin, si le champ Fournisseur affiche « ⚠ Aucun fournisseur », créez d''abord vos [fournisseurs](#fournisseurs) : le n° de facture est toujours exigé, et le choix d''un fournisseur devient obligatoire dès qu''au moins un fournisseur existe.
:::

:::formule Prix TTC
TTC = HT × ( 1 + TVA ÷ 100 )
note: Un article acheté 10 DT HT avec 19 % de TVA revient à 11,900 DT TTC.
:::

:::astuce
Le lien **📋 Historique** sous chaque article affiche ses derniers mouvements (date, type, quantité, prix HT et TTC, fournisseur, réf. facture) sans quitter l''écran, avec un bouton vers l''historique complet.
:::

### Voir aussi

- [Valeur du stock](#calc-valeur-stock) — comment le stock actuel est calculé
- [HT et TTC](#calc-ht-ttc) · [Seuils d''alerte](#calc-seuils)
- [Pertes](#pertes) · [Historiques](#historique) · [Transferts](#transferts) · [Factures d''appro](#factures)',
'stock, approvisionnement, appro, achat, prix ht, tva, ttc, seuil minimum, alerte, fournisseur, facture, produit transformé', '/client/stock?section=activite', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('inventaire', 'Inventaire', '🔢', 'Stock & Appro', 51,
'## 🔢 Inventaire

L''écran **Inventaire** sert à compter physiquement votre stock et à enregistrer les quantités réelles : elles remplacent le stock théorique calculé par l''application et deviennent la nouvelle référence. Vous y accédez depuis le menu **Espace Activités → Inventaire**, activité par activité (pastilles 🏪).

### Ce que vous voyez

- Un en-tête avec compteurs : nombre d''**Ingrédients**, lignes saisies (compteur **Saisis**), et alerte **⚠ Date existante** si un inventaire existe déjà à la date choisie.
- Une barre de filtres : **Catégorie**, **Ingrédient** (après choix d''une catégorie), **Date inventaire** (aujourd''hui par défaut, jamais dans le futur), et le bouton **Enregistrer (N)**.
- Un tableau groupé par catégories repliables (avec compteur d''ingrédients et de lignes saisies) :

| Colonne | Contenu |
|---|---|
| Ingrédient | nom (badge **PT** pour un produit transformé), unité, lien 📋 « 5 derniers inv. » |
| Stock actuel | stock théorique calculé par l''application |
| Qté réelle | saisie de la quantité réellement comptée |

- Un panneau flottant **Aperçu saisie** (en bas à droite) récapitule les lignes saisies avec l''écart par rapport au stock théorique (en vert si positif, en rouge si négatif).

### Actions pas à pas

1. Sélectionnez l''activité, puis la **date d''inventaire**.
2. Ouvrez les catégories et saisissez la **quantité réelle comptée** pour chaque ingrédient concerné — il n''est pas obligatoire de tout compter, seules les lignes saisies sont enregistrées.
3. Contrôlez les écarts dans l''aperçu flottant.
4. Cliquez sur **Enregistrer (N)** : une fenêtre de confirmation liste les lignes et rappelle que l''inventaire **ne peut pas être supprimé**, seulement modifié, et qu''il **recalcule le stock à partir de sa date**.
5. Confirmez : le message « Inventaire enregistré avec succès » s''affiche.

Si un inventaire existe déjà à la date choisie pour un ingrédient, sa ligne porte un badge **⚠ DATE** et la confirmation devient « 🚨 Remplacement détecté » : l''ancienne valeur, barrée, et la nouvelle sont affichées côte à côte avant que vous ne validiez le remplacement.

### L''impact sur vos calculs

:::formule Écart d''inventaire
Écart = Quantité réelle comptée − Stock théorique
note: Un écart négatif révèle des pertes ou consommations non saisies ; un écart positif, un surplus.
:::

:::regle
L''inventaire devient le **point de départ** des calculs : le stock repart de la quantité comptée, puis les mouvements postérieurs (appros, transferts, pertes, productions, ventes) s''y ajoutent ou s''en retranchent. Le détail est expliqué dans [la valeur du stock](#calc-valeur-stock). La date et la quantité du dernier inventaire s''affichent d''ailleurs sous chaque article dans [Stock Activités](#stock-activites).
:::

### Consulter et corriger les inventaires passés

L''écran **Historique Inventaire** liste tous les comptages : filtres **Du / Au**, **Catégorie** et **Article**, export **Excel** et **PDF** (éventuellement limité aux lignes cochées), colonnes Article (badge PT), Date, Qté réelle, Note et Par (auteur de la saisie). Le bouton **✏️ Modifier** permet de corriger la quantité et la note — la date, elle, ne peut pas être modifiée. Un gérant ne peut corriger que ses propres saisies.

### Points d''attention

:::attention
Un inventaire est définitif : il ne se supprime pas. En cas d''erreur, corrigez la quantité depuis l''historique, ou enregistrez un nouvel inventaire à une date plus récente.
:::

:::astuce
Réalisez des inventaires réguliers (hebdomadaires ou mensuels) : ils fiabilisent la valeur du stock et font apparaître les pertes oubliées. Le lien « 5 derniers inv. » sous chaque ingrédient aide à repérer les dérives d''un comptage à l''autre.
:::

### Voir aussi

- [Valeur du stock](#calc-valeur-stock) · [Stock Activités](#stock-activites) · [Pertes](#pertes) · [Historiques](#historique)',
'## 🔢 Inventaire

L''écran **Inventaire** sert à compter physiquement votre stock et à enregistrer les quantités réelles : elles remplacent le stock théorique calculé par l''application et deviennent la nouvelle référence. Vous y accédez depuis le menu **Espace Activités → Inventaire**, activité par activité (pastilles 🏪).

### Ce que vous voyez

- Un en-tête avec compteurs : nombre d''**Ingrédients**, lignes saisies (compteur **Saisis**), et alerte **⚠ Date existante** si un inventaire existe déjà à la date choisie.
- Une barre de filtres : **Catégorie**, **Ingrédient** (après choix d''une catégorie), **Date inventaire** (aujourd''hui par défaut, jamais dans le futur), et le bouton **Enregistrer (N)**.
- Un tableau groupé par catégories repliables (avec compteur d''ingrédients et de lignes saisies) :

| Colonne | Contenu |
|---|---|
| Ingrédient | nom (badge **PT** pour un produit transformé), unité, lien 📋 « 5 derniers inv. » |
| Stock actuel | stock théorique calculé par l''application |
| Qté réelle | saisie de la quantité réellement comptée |

- Un panneau flottant **Aperçu saisie** (en bas à droite) récapitule les lignes saisies avec l''écart par rapport au stock théorique (en vert si positif, en rouge si négatif).

### Actions pas à pas

1. Sélectionnez l''activité, puis la **date d''inventaire**.
2. Ouvrez les catégories et saisissez la **quantité réelle comptée** pour chaque ingrédient concerné — il n''est pas obligatoire de tout compter, seules les lignes saisies sont enregistrées.
3. Contrôlez les écarts dans l''aperçu flottant.
4. Cliquez sur **Enregistrer (N)** : une fenêtre de confirmation liste les lignes et rappelle que l''inventaire **ne peut pas être supprimé**, seulement modifié, et qu''il **recalcule le stock à partir de sa date**.
5. Confirmez : le message « Inventaire enregistré avec succès » s''affiche.

Si un inventaire existe déjà à la date choisie pour un ingrédient, sa ligne porte un badge **⚠ DATE** et la confirmation devient « 🚨 Remplacement détecté » : l''ancienne valeur, barrée, et la nouvelle sont affichées côte à côte avant que vous ne validiez le remplacement.

### L''impact sur vos calculs

:::formule Écart d''inventaire
Écart = Quantité réelle comptée − Stock théorique
note: Un écart négatif révèle des pertes ou consommations non saisies ; un écart positif, un surplus.
:::

:::regle
L''inventaire devient le **point de départ** des calculs : le stock repart de la quantité comptée, puis les mouvements postérieurs (appros, transferts, pertes, productions, ventes) s''y ajoutent ou s''en retranchent. Le détail est expliqué dans [la valeur du stock](#calc-valeur-stock). La date et la quantité du dernier inventaire s''affichent d''ailleurs sous chaque article dans [Stock Activités](#stock-activites).
:::

### Consulter et corriger les inventaires passés

L''écran **Historique Inventaire** liste tous les comptages : filtres **Du / Au**, **Catégorie** et **Article**, export **Excel** et **PDF** (éventuellement limité aux lignes cochées), colonnes Article (badge PT), Date, Qté réelle, Note et Par (auteur de la saisie). Le bouton **✏️ Modifier** permet de corriger la quantité et la note — la date, elle, ne peut pas être modifiée. Un gérant ne peut corriger que ses propres saisies.

### Points d''attention

:::attention
Un inventaire est définitif : il ne se supprime pas. En cas d''erreur, corrigez la quantité depuis l''historique, ou enregistrez un nouvel inventaire à une date plus récente.
:::

:::astuce
Réalisez des inventaires réguliers (hebdomadaires ou mensuels) : ils fiabilisent la valeur du stock et font apparaître les pertes oubliées. Le lien « 5 derniers inv. » sous chaque ingrédient aide à repérer les dérives d''un comptage à l''autre.
:::

### Voir aussi

- [Valeur du stock](#calc-valeur-stock) · [Stock Activités](#stock-activites) · [Pertes](#pertes) · [Historiques](#historique)',
'inventaire, comptage, quantité réelle, stock théorique, écart, ajustement, remplacement, référence, historique inventaire, démarque', '/client/inventaire?section=activite', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('pertes', 'Pertes', '📉', 'Stock & Appro', 52,
'## 📉 Pertes

Déclarez les produits perdus — casse, péremption, chutes de production — pour que le stock et vos coûts reflètent la réalité. La **saisie** se fait directement depuis [Stock Activités](#stock-activites) (bouton **📉 Perte** sur la ligne de l''article) ; la **consultation** dans l''écran **Historique Pertes** du menu Espace Activités.

### Les deux types de perte

| Type | Usage |
|---|---|
| **Avarie** | produit abîmé, périmé, impropre à la vente |
| **Déchet** | pertes de production, parures, casse |

### Actions pas à pas

1. Dans **Stock Activités**, sélectionnez l''activité puis cliquez sur **📉 Perte** sur la ligne de l''article.
2. La fenêtre affiche le **stock disponible**. Saisissez la **quantité perdue** — elle ne peut pas dépasser ce stock (un avertissement s''affiche sinon).
3. Choisissez le **type** (Avarie ou Déchet) et la **date de la perte** : elle doit se situer entre le premier approvisionnement de l''article (rappelé sous le champ) et aujourd''hui.
4. Le **prix unitaire** d''achat en vigueur à la date choisie est récupéré automatiquement, et le **coût total** de la perte s''affiche aussitôt.
5. Cliquez sur **Enregistrer la perte** : le stock diminue et la perte est tracée.

:::formule Valeur d''une perte
Valeur = Quantité perdue × Prix unitaire d''achat à la date de la perte
note: L''écran Pertes affiche le prix d''achat HT ; dans les rapports et tableaux de bord, les pertes sont valorisées en TTC.
:::

### Où retrouver vos pertes

- **Historique Pertes** : consultation **activité par activité** (pastilles 🏪), filtres **Du / Au**, **Catégorie**, **Article** et **Type** (Avarie / Déchet), bouton **Rechercher**. Le tableau affiche Activité, Article, Date, Type (badge coloré), Quantité, Prix Unit., Coût Total et Par (auteur de la saisie), avec les totaux **quantité** et **coût** affichés au-dessus et en pied de tableau. Export **Excel** et **PDF**, éventuellement limité aux lignes cochées.
- Dans **Stock Activités** : la ligne **↘ pertes** de la colonne Stock Actuel cumule les quantités perdues ; pour un produit transformé, le lien 📋 Historique marque en plus chaque perte d''un badge 🗑️.

Depuis l''historique, **✏️ Modifier** permet de corriger la quantité et le type — la date et le prix restent verrouillés, et un avertissement rappelle que changer la quantité impacte le calcul du stock actuel. **🗑️ Supprimer** recalcule le stock ; l''action est **irréversible**. Un gérant ne peut modifier ou supprimer que ses propres saisies.

### Points d''attention

:::attention
Impossible de déclarer une perte sur un article jamais approvisionné : l''application demande d''enregistrer d''abord un appro. Pour un produit transformé, il n''y a pas de prix d''achat : aucun coût ne s''affiche à la saisie, mais la perte est valorisée au coût de recette du produit (quand il est calculable) dans l''historique et les rapports.
:::

:::astuce
Saisissez les pertes au fil de l''eau plutôt qu''en fin de mois : votre stock reste juste, et l''[inventaire](#inventaire) ne sert plus qu''à confirmer. Un écart d''inventaire négatif récurrent signale des pertes non déclarées.
:::

### Voir aussi

- [Stock Activités](#stock-activites) · [Inventaire](#inventaire) · [Historiques](#historique)
- [Valeur du stock](#calc-valeur-stock) · [HT et TTC](#calc-ht-ttc)',
'## 📉 Pertes

Déclarez les produits perdus — casse, péremption, chutes de production — pour que le stock et vos coûts reflètent la réalité. La **saisie** se fait directement depuis [Stock Activités](#stock-activites) (bouton **📉 Perte** sur la ligne de l''article) ; la **consultation** dans l''écran **Historique Pertes** du menu Espace Activités.

### Les deux types de perte

| Type | Usage |
|---|---|
| **Avarie** | produit abîmé, périmé, impropre à la vente |
| **Déchet** | pertes de production, parures, casse |

### Actions pas à pas

1. Dans **Stock Activités**, sélectionnez l''activité puis cliquez sur **📉 Perte** sur la ligne de l''article.
2. La fenêtre affiche le **stock disponible**. Saisissez la **quantité perdue** — elle ne peut pas dépasser ce stock (un avertissement s''affiche sinon).
3. Choisissez le **type** (Avarie ou Déchet) et la **date de la perte** : elle doit se situer entre le premier approvisionnement de l''article (rappelé sous le champ) et aujourd''hui.
4. Le **prix unitaire** d''achat en vigueur à la date choisie est récupéré automatiquement, et le **coût total** de la perte s''affiche aussitôt.
5. Cliquez sur **Enregistrer la perte** : le stock diminue et la perte est tracée.

:::formule Valeur d''une perte
Valeur = Quantité perdue × Prix unitaire d''achat à la date de la perte
note: L''écran Pertes affiche le prix d''achat HT ; dans les rapports et tableaux de bord, les pertes sont valorisées en TTC.
:::

### Où retrouver vos pertes

- **Historique Pertes** : consultation **activité par activité** (pastilles 🏪), filtres **Du / Au**, **Catégorie**, **Article** et **Type** (Avarie / Déchet), bouton **Rechercher**. Le tableau affiche Activité, Article, Date, Type (badge coloré), Quantité, Prix Unit., Coût Total et Par (auteur de la saisie), avec les totaux **quantité** et **coût** affichés au-dessus et en pied de tableau. Export **Excel** et **PDF**, éventuellement limité aux lignes cochées.
- Dans **Stock Activités** : la ligne **↘ pertes** de la colonne Stock Actuel cumule les quantités perdues ; pour un produit transformé, le lien 📋 Historique marque en plus chaque perte d''un badge 🗑️.

Depuis l''historique, **✏️ Modifier** permet de corriger la quantité et le type — la date et le prix restent verrouillés, et un avertissement rappelle que changer la quantité impacte le calcul du stock actuel. **🗑️ Supprimer** recalcule le stock ; l''action est **irréversible**. Un gérant ne peut modifier ou supprimer que ses propres saisies.

### Points d''attention

:::attention
Impossible de déclarer une perte sur un article jamais approvisionné : l''application demande d''enregistrer d''abord un appro. Pour un produit transformé, il n''y a pas de prix d''achat : aucun coût ne s''affiche à la saisie, mais la perte est valorisée au coût de recette du produit (quand il est calculable) dans l''historique et les rapports.
:::

:::astuce
Saisissez les pertes au fil de l''eau plutôt qu''en fin de mois : votre stock reste juste, et l''[inventaire](#inventaire) ne sert plus qu''à confirmer. Un écart d''inventaire négatif récurrent signale des pertes non déclarées.
:::

### Voir aussi

- [Stock Activités](#stock-activites) · [Inventaire](#inventaire) · [Historiques](#historique)
- [Valeur du stock](#calc-valeur-stock) · [HT et TTC](#calc-ht-ttc)',
'pertes, perte, avarie, déchet, casse, périmé, démarque, coût, valorisation, historique pertes, stock', '/client/stock/historique-pertes', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('historique', 'Historiques', '🕑', 'Stock & Appro', 53,
'## 🕑 Historiques

Tous les mouvements de stock sont tracés et consultables : l''écran **Historique Appro** pour les approvisionnements et mouvements associés (achats, transferts, ventes, productions), l''écran **Historique Pertes** pour les avaries et déchets. Vous y accédez depuis le menu Espace Activités ; les [inventaires](#inventaire) et les [transferts](#transferts) disposent de leurs propres historiques.

### Un fonctionnement commun

- Consultation **activité par activité** : sélectionnez le point de vente via les pastilles 🏪 — pas de vue globale « Toutes ». Un gérant ne voit que ses activités affectées.
- Une même **barre de filtres** : période **Du / Au** (année en cours par défaut), listes en cascade **Catégorie** puis **Article**, bouton **Rechercher** (les résultats ne s''affichent qu''après), **Réinitialiser**, et les exports **Excel** (bouton « Exporter ») et **PDF**.
- Des **cases à cocher** sur chaque ligne : cochez quelques enregistrements pour limiter l''export à cette sélection — le bouton indique alors « Exporter (N) ».
- La colonne **Créé par / Par** identifie l''auteur de chaque saisie ([traçabilité](#calc-tracabilite)).

### Historique des approvisionnements

Filtres spécifiques : **Fournisseur** et **Type d''appro** (liste à cases multiples : Manuel, Transfert, Vente, PT). Le filtre Catégorie propose, en plus de vos catégories d''articles, les trois familles de produits transformés : **Produits Transformés Utilisables**, **Produits Transformés Vendables** et **Produits Composés Valorisés** (voir [le lexique](#lexique-pt)).

| Colonne | Contenu |
|---|---|
| Article | nom, unité · catégorie |
| Date | date + badge du type : Manuel, Transfert, 💰 Vente, ↩️ Annul. vente, 🔄 PT |
| Quantité | quantité et unité |
| Prix HT | montant total HT et prix unitaire |
| TVA | taux appliqué |
| Prix TTC | montant total TTC et prix unitaire |
| Fourn. / Réf | fournisseur et n° de facture |
| Créé par | auteur de la saisie |

Le pied de tableau cumule les **totaux HT et TTC en DT** des résultats affichés ; la liste est paginée par 10 lignes.

### Actions pas à pas : corriger ou supprimer un appro

1. Cliquez sur **✏️** : vous pouvez modifier la quantité, le prix unitaire, le fournisseur et la réf. facture — la **date reste verrouillée**.
2. Pour une ligne de type **Transfert**, le fournisseur (le labo) n''est pas modifiable, et un changement de quantité ajuste le stock du labo.
3. **🗑️ Supprimer** : le stock de l''article est recalculé ; pour un transfert, la quantité est restituée au stock du labo. L''action est **irréversible**.

### Historique des pertes

Filtre supplémentaire **Type** (Avarie / Déchet), badges colorés par type, totaux **quantité** et **coût total**, mêmes exports Excel et PDF. La modification et la suppression y suivent les mêmes garde-fous — le détail est décrit dans la fiche [Pertes](#pertes).

### Points d''attention

:::attention
Les lignes 💰 Vente et ↩️ Annul. vente sont générées automatiquement par vos ventes : elles ne peuvent être ni modifiées ni supprimées depuis l''historique. Un gérant ne peut corriger que les saisies qu''il a lui-même créées.
:::

:::astuce
Pour préparer une clôture mensuelle, réglez Du / Au sur le mois, lancez Rechercher, vérifiez les totaux HT/TTC puis exportez en Excel. Le filtre Type d''appro isole en un clic les seuls achats « Manuel », hors transferts et ventes.
:::

### Voir aussi

- [Stock Activités](#stock-activites) · [Pertes](#pertes) · [Inventaire](#inventaire) · [Transferts](#transferts)
- [HT et TTC](#calc-ht-ttc) · [Traçabilité des mouvements](#calc-tracabilite)',
'## 🕑 Historiques

Tous les mouvements de stock sont tracés et consultables : l''écran **Historique Appro** pour les approvisionnements et mouvements associés (achats, transferts, ventes, productions), l''écran **Historique Pertes** pour les avaries et déchets. Vous y accédez depuis le menu Espace Activités ; les [inventaires](#inventaire) et les [transferts](#transferts) disposent de leurs propres historiques.

### Un fonctionnement commun

- Consultation **activité par activité** : sélectionnez le point de vente via les pastilles 🏪 — pas de vue globale « Toutes ». Un gérant ne voit que ses activités affectées.
- Une même **barre de filtres** : période **Du / Au** (année en cours par défaut), listes en cascade **Catégorie** puis **Article**, bouton **Rechercher** (les résultats ne s''affichent qu''après), **Réinitialiser**, et les exports **Excel** (bouton « Exporter ») et **PDF**.
- Des **cases à cocher** sur chaque ligne : cochez quelques enregistrements pour limiter l''export à cette sélection — le bouton indique alors « Exporter (N) ».
- La colonne **Créé par / Par** identifie l''auteur de chaque saisie ([traçabilité](#calc-tracabilite)).

### Historique des approvisionnements

Filtres spécifiques : **Fournisseur** et **Type d''appro** (liste à cases multiples : Manuel, Transfert, Vente, PT). Le filtre Catégorie propose, en plus de vos catégories d''articles, les trois familles de produits transformés : **Produits Transformés Utilisables**, **Produits Transformés Vendables** et **Produits Composés Valorisés** (voir [le lexique](#lexique-pt)).

| Colonne | Contenu |
|---|---|
| Article | nom, unité · catégorie |
| Date | date + badge du type : Manuel, Transfert, 💰 Vente, ↩️ Annul. vente, 🔄 PT |
| Quantité | quantité et unité |
| Prix HT | montant total HT et prix unitaire |
| TVA | taux appliqué |
| Prix TTC | montant total TTC et prix unitaire |
| Fourn. / Réf | fournisseur et n° de facture |
| Créé par | auteur de la saisie |

Le pied de tableau cumule les **totaux HT et TTC en DT** des résultats affichés ; la liste est paginée par 10 lignes.

### Actions pas à pas : corriger ou supprimer un appro

1. Cliquez sur **✏️** : vous pouvez modifier la quantité, le prix unitaire, le fournisseur et la réf. facture — la **date reste verrouillée**.
2. Pour une ligne de type **Transfert**, le fournisseur (le labo) n''est pas modifiable, et un changement de quantité ajuste le stock du labo.
3. **🗑️ Supprimer** : le stock de l''article est recalculé ; pour un transfert, la quantité est restituée au stock du labo. L''action est **irréversible**.

### Historique des pertes

Filtre supplémentaire **Type** (Avarie / Déchet), badges colorés par type, totaux **quantité** et **coût total**, mêmes exports Excel et PDF. La modification et la suppression y suivent les mêmes garde-fous — le détail est décrit dans la fiche [Pertes](#pertes).

### Points d''attention

:::attention
Les lignes 💰 Vente et ↩️ Annul. vente sont générées automatiquement par vos ventes : elles ne peuvent être ni modifiées ni supprimées depuis l''historique. Un gérant ne peut corriger que les saisies qu''il a lui-même créées.
:::

:::astuce
Pour préparer une clôture mensuelle, réglez Du / Au sur le mois, lancez Rechercher, vérifiez les totaux HT/TTC puis exportez en Excel. Le filtre Type d''appro isole en un clic les seuls achats « Manuel », hors transferts et ventes.
:::

### Voir aussi

- [Stock Activités](#stock-activites) · [Pertes](#pertes) · [Inventaire](#inventaire) · [Transferts](#transferts)
- [HT et TTC](#calc-ht-ttc) · [Traçabilité des mouvements](#calc-tracabilite)',
'historique, approvisionnements, pertes, mouvements, filtres, export, excel, pdf, traçabilité, type appro, transfert, vente', '/client/stock/historique', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('stock-labo', 'Stock Labo', '🏭', 'Stock & Appro', 54,
'## 🏭 Stock Labo

Cet écran gère le stock de votre laboratoire central : les articles que vous y achetez et les produits transformés (PT) que vous y fabriquez. Vous y accédez depuis l''espace labo ; si vous possédez plusieurs labos, une rangée de pastilles en haut de page permet de passer de l''un à l''autre.

### Ce que vous voyez

Un bandeau rappelle le nom du labo et propose le bouton **↗ Transfert** vers l''écran d''envoi aux activités. En dessous : une barre de filtres (Catégorie, Article, Nom, Fournisseur, Réf. Facture), puis le bloc **Approvisionnement** avec la Date d''appro, le Fournisseur, la Réf Facture et les boutons **Enregistrer** (le nombre de lignes prêtes s''affiche entre parenthèses) et **Réinitialiser**.

Le stock est présenté par catégories repliables :

| Colonne | Contenu |
|---|---|
| Article | nom, unité, badge **PT** (et « ◆ Composé valorisé » pour les composés fabriqués au labo), bouton 📋 Historique — les 5 derniers mouvements avec leur type : Manuel, Transfert, PT, Perte… |
| Stock Actuel | quantité restante et sa ventilation depuis le dernier inventaire : ↑ appro, ⇄ transferts, ↘ pertes, consommation PT |
| Coût Total | valeur du stock en DT (TTC, avec rappel du HT) |
| Quantité · Prix · TVA (%) | saisie d''un nouvel appro — le prix d''un PT est calculé automatiquement, il ne se saisit pas |
| Actions | 🔧 Seuil, 📉 Perte, ⚙️ Personnaliser (PT uniquement) |

Un panneau « Aperçu saisie » totalise en direct, en TTC, ce que vous êtes en train d''enregistrer.

### Actions pas à pas

Approvisionner des articles :

1. Renseignez la date, le fournisseur et le n° de facture dans le bloc Approvisionnement.
2. Saisissez quantité et prix HT (TVA facultative) sur chaque ligne concernée.
3. Cliquez sur **Enregistrer** : une fenêtre récapitule la facture, avec une case **Timbre Fiscal** (+1,000 DT, cochée par défaut) ; confirmez.

Produire un PT :

1. Saisissez la **quantité produite** sur la ligne du PT — aucun prix à saisir, son coût est calculé d''après les prix des articles du labo.
2. Enregistrez : les ingrédients de la recette **et les sous-PT** qu''elle contient sont déduits automatiquement du stock du labo.
3. Au besoin, le bouton **⚙️ Personnaliser** permet d''ajuster les portions réellement utilisées pour cette production.

Déclarer une perte : bouton **📉 Perte**, puis quantité, type (Avarie ou Déchet) et date ; la fenêtre affiche le stock disponible, le prix unitaire retenu et le coût total de la perte.

Définir un seuil : bouton **🔧 Seuil**. Le stock s''affiche ensuite en 🔴 (au seuil ou en dessous), 🟠 (jusqu''à seuil + 10 %) ou 🟢 (au-dessus).

### Points d''attention

:::attention
On ne mélange pas appro d''articles et production de PT dans un même enregistrement : dès qu''une quantité est saisie sur un PT, les champs Fournisseur et Réf Facture se grisent (et inversement). Procédez en deux enregistrements séparés.
:::

:::attention
Une perte ne peut pas dépasser le stock disponible, ni porter une date antérieure au premier approvisionnement de l''article.
:::

:::astuce
Si la date choisie correspond déjà à un appro existant pour un article, ses champs de saisie s''entourent d''orange : consultez l''historique 📋 avant d''enregistrer, car les quantités s''additionnent.
:::

L''affectation des articles aux activités (cases à cocher) se gère depuis le [Catalogue Global](#catalogue-global) ; elle est réservée au propriétaire du compte.

### Voir aussi

- [Les produits transformés](#lexique-pt) · [Le calcul d''une production](#calc-production-pt)
- [Les seuils d''alerte](#calc-seuils) · [La valeur du stock](#calc-valeur-stock)
- [Transferts vers les activités](#transferts) · [Factures d''appro](#factures) · [Pertes](#pertes)',
'## 🏭 Stock Labo

Cet écran gère le stock de votre laboratoire central : les articles que vous y achetez et les produits transformés (PT) que vous y fabriquez. Vous y accédez depuis l''espace labo ; si vous possédez plusieurs labos, une rangée de pastilles en haut de page permet de passer de l''un à l''autre.

### Ce que vous voyez

Un bandeau rappelle le nom du labo et propose le bouton **↗ Transfert** vers l''écran d''envoi aux activités. En dessous : une barre de filtres (Catégorie, Article, Nom, Fournisseur, Réf. Facture), puis le bloc **Approvisionnement** avec la Date d''appro, le Fournisseur, la Réf Facture et les boutons **Enregistrer** (le nombre de lignes prêtes s''affiche entre parenthèses) et **Réinitialiser**.

Le stock est présenté par catégories repliables :

| Colonne | Contenu |
|---|---|
| Article | nom, unité, badge **PT** (et « ◆ Composé valorisé » pour les composés fabriqués au labo), bouton 📋 Historique — les 5 derniers mouvements avec leur type : Manuel, Transfert, PT, Perte… |
| Stock Actuel | quantité restante et sa ventilation depuis le dernier inventaire : ↑ appro, ⇄ transferts, ↘ pertes, consommation PT |
| Coût Total | valeur du stock en DT (TTC, avec rappel du HT) |
| Quantité · Prix · TVA (%) | saisie d''un nouvel appro — le prix d''un PT est calculé automatiquement, il ne se saisit pas |
| Actions | 🔧 Seuil, 📉 Perte, ⚙️ Personnaliser (PT uniquement) |

Un panneau « Aperçu saisie » totalise en direct, en TTC, ce que vous êtes en train d''enregistrer.

### Actions pas à pas

Approvisionner des articles :

1. Renseignez la date, le fournisseur et le n° de facture dans le bloc Approvisionnement.
2. Saisissez quantité et prix HT (TVA facultative) sur chaque ligne concernée.
3. Cliquez sur **Enregistrer** : une fenêtre récapitule la facture, avec une case **Timbre Fiscal** (+1,000 DT, cochée par défaut) ; confirmez.

Produire un PT :

1. Saisissez la **quantité produite** sur la ligne du PT — aucun prix à saisir, son coût est calculé d''après les prix des articles du labo.
2. Enregistrez : les ingrédients de la recette **et les sous-PT** qu''elle contient sont déduits automatiquement du stock du labo.
3. Au besoin, le bouton **⚙️ Personnaliser** permet d''ajuster les portions réellement utilisées pour cette production.

Déclarer une perte : bouton **📉 Perte**, puis quantité, type (Avarie ou Déchet) et date ; la fenêtre affiche le stock disponible, le prix unitaire retenu et le coût total de la perte.

Définir un seuil : bouton **🔧 Seuil**. Le stock s''affiche ensuite en 🔴 (au seuil ou en dessous), 🟠 (jusqu''à seuil + 10 %) ou 🟢 (au-dessus).

### Points d''attention

:::attention
On ne mélange pas appro d''articles et production de PT dans un même enregistrement : dès qu''une quantité est saisie sur un PT, les champs Fournisseur et Réf Facture se grisent (et inversement). Procédez en deux enregistrements séparés.
:::

:::attention
Une perte ne peut pas dépasser le stock disponible, ni porter une date antérieure au premier approvisionnement de l''article.
:::

:::astuce
Si la date choisie correspond déjà à un appro existant pour un article, ses champs de saisie s''entourent d''orange : consultez l''historique 📋 avant d''enregistrer, car les quantités s''additionnent.
:::

L''affectation des articles aux activités (cases à cocher) se gère depuis le [Catalogue Global](#catalogue-global) ; elle est réservée au propriétaire du compte.

### Voir aussi

- [Les produits transformés](#lexique-pt) · [Le calcul d''une production](#calc-production-pt)
- [Les seuils d''alerte](#calc-seuils) · [La valeur du stock](#calc-valeur-stock)
- [Transferts vers les activités](#transferts) · [Factures d''appro](#factures) · [Pertes](#pertes)',
'stock labo, laboratoire, labo central, production, produit transformé, pt, approvisionnement, perte, seuil, fournisseur, facture, inventaire', '/client/labo/stock', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('transferts', 'Transferts', '🔄', 'Stock & Appro', 55,
'## 🔄 Transferts

Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités : le stock du labo diminue, celui de chaque activité de destination augmente d''autant. Vous y accédez par le bouton **↗ Transfert** du Stock Labo ou depuis l''espace labo ; les pastilles en haut de page permettent de changer de labo.

### Ce que vous voyez

Le bandeau propose un retour vers le **Stock Labo** et le bouton **📋 Historique Transferts** (grisé tant qu''aucun transfert n''existe). Suivent la barre de filtres (Activité, Catégorie, Article, Nom) et le bloc **Transfert** : la Date Transfert et la **Réf. Facture / BL** (toutes deux obligatoires), puis les boutons **↗ Transférer** et **↺ Réinitialiser**.

Le tableau, par catégories repliables, affiche pour chaque article : le stock disponible au labo (vert, orange ou rouge selon le niveau), le **prix unitaire TTC** de cession, puis **une colonne de quantité par activité**. Le bouton 📋 Historique déplie les 5 derniers transferts de l''article (dates, quantités par activité, prix, référence). Un panneau « Aperçu saisie » totalise en direct, en TTC, les montants de votre saisie.

Le prix de cession est proposé automatiquement au coût du labo : coût de production TTC pour un PT, prix moyen pondéré converti en TTC pour un article. Vous pouvez l''ajuster, mais il reste obligatoire pour toute ligne transférée.

### Actions pas à pas

1. Sélectionnez le labo, choisissez la date du transfert et saisissez le n° de bon de livraison.
2. Saisissez les quantités dans les colonnes des activités de destination ; ajustez le prix de cession si nécessaire.
3. Cliquez sur **↗ Transférer** : la fenêtre « Confirmation de transfert » récapitule les lignes groupées par activité (quantités, prix HT/TTC, totaux).
4. Cliquez sur **Confirmer le transfert** : les stocks sont mis à jour immédiatement.

Pour corriger ou exporter : ouvrez l''**Historique Transferts** (filtres Du/Au, Activité, Catégorie), sélectionnez des lignes si besoin, exportez en Excel ou en PDF, modifiez une quantité (✏️) ou supprimez un transfert (🗑️ — les stocks du labo et de l''activité sont alors recalculés).

### Points d''attention

:::regle
Un article ou un PT ne peut être transféré que vers une activité où il est **affecté** : sinon la case de quantité est remplacée par « — ». Pour un PT fabriqué au labo, le transfert est le **seul** moyen d''approvisionner une activité. Si aucun article n''apparaît, affectez d''abord vos articles aux activités liées au labo depuis le [Catalogue Global](#catalogue-global).
:::

:::attention
Impossible de transférer plus que le stock du labo : la ligne passe en rouge avec l''excédent affiché, et l''enregistrement est bloqué avec le détail Disponible / Demandé / Excédent.
:::

:::attention
Si un transfert existe déjà le même jour vers la même activité, une fenêtre de vérification détaille « Déjà envoyé / Nouveau transfert / Total après ». Ne confirmez que s''il s''agit bien d''un envoi complémentaire : les quantités s''additionnent.
:::

:::astuce
Côté activité, la réception apparaît dans le stock comme un approvisionnement de type « Transfert », avec le **labo comme fournisseur**, au prix de cession saisi.
:::

### Voir aussi

- [Le calcul des transferts](#calc-transferts) · [Le prix moyen pondéré](#calc-pmp)
- [Stock Labo](#stock-labo) · [Stock des activités](#stock-activites)
- [Factures d''appro](#factures) · [Historique des mouvements](#historique)',
'## 🔄 Transferts

Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités : le stock du labo diminue, celui de chaque activité de destination augmente d''autant. Vous y accédez par le bouton **↗ Transfert** du Stock Labo ou depuis l''espace labo ; les pastilles en haut de page permettent de changer de labo.

### Ce que vous voyez

Le bandeau propose un retour vers le **Stock Labo** et le bouton **📋 Historique Transferts** (grisé tant qu''aucun transfert n''existe). Suivent la barre de filtres (Activité, Catégorie, Article, Nom) et le bloc **Transfert** : la Date Transfert et la **Réf. Facture / BL** (toutes deux obligatoires), puis les boutons **↗ Transférer** et **↺ Réinitialiser**.

Le tableau, par catégories repliables, affiche pour chaque article : le stock disponible au labo (vert, orange ou rouge selon le niveau), le **prix unitaire TTC** de cession, puis **une colonne de quantité par activité**. Le bouton 📋 Historique déplie les 5 derniers transferts de l''article (dates, quantités par activité, prix, référence). Un panneau « Aperçu saisie » totalise en direct, en TTC, les montants de votre saisie.

Le prix de cession est proposé automatiquement au coût du labo : coût de production TTC pour un PT, prix moyen pondéré converti en TTC pour un article. Vous pouvez l''ajuster, mais il reste obligatoire pour toute ligne transférée.

### Actions pas à pas

1. Sélectionnez le labo, choisissez la date du transfert et saisissez le n° de bon de livraison.
2. Saisissez les quantités dans les colonnes des activités de destination ; ajustez le prix de cession si nécessaire.
3. Cliquez sur **↗ Transférer** : la fenêtre « Confirmation de transfert » récapitule les lignes groupées par activité (quantités, prix HT/TTC, totaux).
4. Cliquez sur **Confirmer le transfert** : les stocks sont mis à jour immédiatement.

Pour corriger ou exporter : ouvrez l''**Historique Transferts** (filtres Du/Au, Activité, Catégorie), sélectionnez des lignes si besoin, exportez en Excel ou en PDF, modifiez une quantité (✏️) ou supprimez un transfert (🗑️ — les stocks du labo et de l''activité sont alors recalculés).

### Points d''attention

:::regle
Un article ou un PT ne peut être transféré que vers une activité où il est **affecté** : sinon la case de quantité est remplacée par « — ». Pour un PT fabriqué au labo, le transfert est le **seul** moyen d''approvisionner une activité. Si aucun article n''apparaît, affectez d''abord vos articles aux activités liées au labo depuis le [Catalogue Global](#catalogue-global).
:::

:::attention
Impossible de transférer plus que le stock du labo : la ligne passe en rouge avec l''excédent affiché, et l''enregistrement est bloqué avec le détail Disponible / Demandé / Excédent.
:::

:::attention
Si un transfert existe déjà le même jour vers la même activité, une fenêtre de vérification détaille « Déjà envoyé / Nouveau transfert / Total après ». Ne confirmez que s''il s''agit bien d''un envoi complémentaire : les quantités s''additionnent.
:::

:::astuce
Côté activité, la réception apparaît dans le stock comme un approvisionnement de type « Transfert », avec le **labo comme fournisseur**, au prix de cession saisi.
:::

### Voir aussi

- [Le calcul des transferts](#calc-transferts) · [Le prix moyen pondéré](#calc-pmp)
- [Stock Labo](#stock-labo) · [Stock des activités](#stock-activites)
- [Factures d''appro](#factures) · [Historique des mouvements](#historique)',
'transfert, labo, activité, bon de livraison, prix de cession, quantité, stock, historique, export, affectation, réception', '/client/labo/transfer', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('factures', 'Factures d''appro', '🧾', 'Stock & Appro', 56,
'## 🧾 Factures d''approvisionnement

Ces écrans regroupent vos approvisionnements par **facture fournisseur**, pour rapprocher vos achats des documents reçus et suivre vos décaissements. Il en existe deux, jumeaux : l''un pour les **activités** (menu Stock) et l''autre pour le **labo** (espace labo), qui présente les mêmes informations à l''échelle du laboratoire.

### Ce que vous voyez

En haut, des pastilles pour choisir l''activité 🏪 (ou le labo 🏭). Puis la barre de filtres : période **Du / Au** (l''année en cours par défaut), **Fournisseur** et **Réf. Facture** (recherche partielle) — l''écran labo ajoute un filtre **Activité** pour isoler les factures liées à une activité de destination.

Chaque facture est une carte repliée : fournisseur, référence, date, badge **Manuel** ou **↗ Transfert**, et les montants **Total HT** et **Total TTC** en DT. Un clic déplie le détail ligne par ligne : article (avec son unité), catégorie, quantité, prix HT à l''unité, taux de TVA, prix TTC à l''unité, totaux HT et TTC — suivi d''un sous-total par facture. Les colonnes TVA n''apparaissent que si la facture en comporte.

Les boutons **Tout ouvrir / Tout fermer** déplient ou replient toutes les cartes de la page. En bas : le compteur de factures avec la pagination, le bouton **Charger plus**, et un bandeau **Total général HT / TTC** cumulant les factures chargées.

### Actions pas à pas

1. Choisissez l''activité (ou le labo), puis la période.
2. Filtrez par fournisseur, ou saisissez quelques caractères de la référence pour retrouver une livraison précise.
3. Cliquez sur une carte pour vérifier les lignes (quantités, prix, TVA) face au document papier.
4. Les factures se chargent par lots : utilisez **Charger plus** en bas de liste si la période est longue.

### Points d''attention

:::regle
Les factures ne se saisissent pas ici : elles sont construites automatiquement à partir de vos approvisionnements. C''est le **n° de facture saisi au moment de l''appro** qui relie les lignes entre elles — utilisez toujours la même référence pour une même livraison.
:::

:::formule Total facture TTC
Total TTC = Σ ( quantité × prix HT × ( 1 + TVA ÷ 100 ) )
note: Calculé ligne par ligne, selon le taux de TVA propre à chaque article.
:::

:::astuce
Le badge « ↗ Transfert » signale une facture issue d''un transfert du labo : côté activité, le fournisseur affiché est alors le **labo lui-même**. Le filtre Fournisseur de l''écran activités ne liste, lui, que vos fournisseurs externes.
:::

### Voir aussi

- [HT et TTC dans LabFlow](#calc-ht-ttc) · [Fournisseurs](#fournisseurs)
- [Transferts labo → activités](#transferts) · [Historique des approvisionnements](#historique)
- [Stock des activités](#stock-activites) · [Stock Labo](#stock-labo)',
'## 🧾 Factures d''approvisionnement

Ces écrans regroupent vos approvisionnements par **facture fournisseur**, pour rapprocher vos achats des documents reçus et suivre vos décaissements. Il en existe deux, jumeaux : l''un pour les **activités** (menu Stock) et l''autre pour le **labo** (espace labo), qui présente les mêmes informations à l''échelle du laboratoire.

### Ce que vous voyez

En haut, des pastilles pour choisir l''activité 🏪 (ou le labo 🏭). Puis la barre de filtres : période **Du / Au** (l''année en cours par défaut), **Fournisseur** et **Réf. Facture** (recherche partielle) — l''écran labo ajoute un filtre **Activité** pour isoler les factures liées à une activité de destination.

Chaque facture est une carte repliée : fournisseur, référence, date, badge **Manuel** ou **↗ Transfert**, et les montants **Total HT** et **Total TTC** en DT. Un clic déplie le détail ligne par ligne : article (avec son unité), catégorie, quantité, prix HT à l''unité, taux de TVA, prix TTC à l''unité, totaux HT et TTC — suivi d''un sous-total par facture. Les colonnes TVA n''apparaissent que si la facture en comporte.

Les boutons **Tout ouvrir / Tout fermer** déplient ou replient toutes les cartes de la page. En bas : le compteur de factures avec la pagination, le bouton **Charger plus**, et un bandeau **Total général HT / TTC** cumulant les factures chargées.

### Actions pas à pas

1. Choisissez l''activité (ou le labo), puis la période.
2. Filtrez par fournisseur, ou saisissez quelques caractères de la référence pour retrouver une livraison précise.
3. Cliquez sur une carte pour vérifier les lignes (quantités, prix, TVA) face au document papier.
4. Les factures se chargent par lots : utilisez **Charger plus** en bas de liste si la période est longue.

### Points d''attention

:::regle
Les factures ne se saisissent pas ici : elles sont construites automatiquement à partir de vos approvisionnements. C''est le **n° de facture saisi au moment de l''appro** qui relie les lignes entre elles — utilisez toujours la même référence pour une même livraison.
:::

:::formule Total facture TTC
Total TTC = Σ ( quantité × prix HT × ( 1 + TVA ÷ 100 ) )
note: Calculé ligne par ligne, selon le taux de TVA propre à chaque article.
:::

:::astuce
Le badge « ↗ Transfert » signale une facture issue d''un transfert du labo : côté activité, le fournisseur affiché est alors le **labo lui-même**. Le filtre Fournisseur de l''écran activités ne liste, lui, que vos fournisseurs externes.
:::

### Voir aussi

- [HT et TTC dans LabFlow](#calc-ht-ttc) · [Fournisseurs](#fournisseurs)
- [Transferts labo → activités](#transferts) · [Historique des approvisionnements](#historique)
- [Stock des activités](#stock-activites) · [Stock Labo](#stock-labo)',
'factures, fournisseur, approvisionnement, achats, tva, ht, ttc, décaissement, rapprochement, transfert, référence, labo', '/client/stock/factures', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('rapports-labo', 'Rapport labo', '📊', 'Stock & Appro', 57,
'## 📊 Rapport labo

Ce rapport donne une lecture synthétique de l''activité de votre laboratoire sur une période : valeur du stock, approvisionnements, pertes et transferts vers les activités. Vous le trouvez dans le menu Espace Labo, entrée « Rapport labo ».

### Ce que vous voyez

En haut, la barre de filtres : le choix du **labo** (s''il y en a plusieurs) et la **période** — Mois en cours, 30 jours, Trimestre, ou Personnalisé avec les champs Du / Au.

Quatre indicateurs, exprimés en DT (TTC) :

| Indicateur | Lecture |
|---|---|
| Valeur du stock | valeur totale du stock du labo |
| Approvisionnements | montant des achats d''articles et des productions de PT de la période, avec le nombre d''entrées |
| Pertes | montant des pertes déclarées — pastille rouge dès qu''il y en a, verte sinon |
| Transferts émis | valeur envoyée vers les activités, avec le nombre de transferts |

Puis deux graphiques : **Top articles transférés** (barres horizontales — les six plus fortes valeurs de la période) et **Transferts par activité** (répartition en anneau, une couleur par activité). Un petit bouton d''aide accompagne chaque indicateur pour en rappeler la définition.

### Actions pas à pas

1. Sélectionnez le labo, puis une période prédéfinie — ou « Personnalisé » et saisissez les dates Du / Au.
2. Lisez les quatre indicateurs ; survolez les graphiques pour afficher les montants en DT.
3. Changez simplement de préréglage pour comparer le mois en cours, les 30 derniers jours ou le trimestre.

### Points d''attention

:::attention
Ce rapport est un écran de lecture : il ne comporte pas de bouton d''export. Pour obtenir le détail des transferts en Excel ou en PDF, passez par l''historique des transferts du labo (voir la fiche [Transferts](#transferts)).
:::

:::astuce
Un montant de pertes en rouge mérite une visite de l''écran [Stock Labo](#stock-labo) : l''historique de chaque article y détaille les pertes déclarées, et des seuils d''alerte bien réglés limitent les mauvaises surprises.
:::

:::regle
Tous les montants du rapport sont exprimés en TTC, comme dans l''ensemble des rapports et tableaux de bord LabFlow.
:::

### Voir aussi

- [La valeur du stock](#calc-valeur-stock) · [Les seuils d''alerte](#calc-seuils)
- [Stock Labo](#stock-labo) · [Transferts](#transferts) · [Pertes](#pertes)
- [Rapports d''ensemble](#rapports) · [Tableau de bord](#dashboard)',
'## 📊 Rapport labo

Ce rapport donne une lecture synthétique de l''activité de votre laboratoire sur une période : valeur du stock, approvisionnements, pertes et transferts vers les activités. Vous le trouvez dans le menu Espace Labo, entrée « Rapport labo ».

### Ce que vous voyez

En haut, la barre de filtres : le choix du **labo** (s''il y en a plusieurs) et la **période** — Mois en cours, 30 jours, Trimestre, ou Personnalisé avec les champs Du / Au.

Quatre indicateurs, exprimés en DT (TTC) :

| Indicateur | Lecture |
|---|---|
| Valeur du stock | valeur totale du stock du labo |
| Approvisionnements | montant des achats d''articles et des productions de PT de la période, avec le nombre d''entrées |
| Pertes | montant des pertes déclarées — pastille rouge dès qu''il y en a, verte sinon |
| Transferts émis | valeur envoyée vers les activités, avec le nombre de transferts |

Puis deux graphiques : **Top articles transférés** (barres horizontales — les six plus fortes valeurs de la période) et **Transferts par activité** (répartition en anneau, une couleur par activité). Un petit bouton d''aide accompagne chaque indicateur pour en rappeler la définition.

### Actions pas à pas

1. Sélectionnez le labo, puis une période prédéfinie — ou « Personnalisé » et saisissez les dates Du / Au.
2. Lisez les quatre indicateurs ; survolez les graphiques pour afficher les montants en DT.
3. Changez simplement de préréglage pour comparer le mois en cours, les 30 derniers jours ou le trimestre.

### Points d''attention

:::attention
Ce rapport est un écran de lecture : il ne comporte pas de bouton d''export. Pour obtenir le détail des transferts en Excel ou en PDF, passez par l''historique des transferts du labo (voir la fiche [Transferts](#transferts)).
:::

:::astuce
Un montant de pertes en rouge mérite une visite de l''écran [Stock Labo](#stock-labo) : l''historique de chaque article y détaille les pertes déclarées, et des seuils d''alerte bien réglés limitent les mauvaises surprises.
:::

:::regle
Tous les montants du rapport sont exprimés en TTC, comme dans l''ensemble des rapports et tableaux de bord LabFlow.
:::

### Voir aussi

- [La valeur du stock](#calc-valeur-stock) · [Les seuils d''alerte](#calc-seuils)
- [Stock Labo](#stock-labo) · [Transferts](#transferts) · [Pertes](#pertes)
- [Rapports d''ensemble](#rapports) · [Tableau de bord](#dashboard)',
'rapport, labo, indicateurs, kpi, valeur stock, approvisionnements, pertes, transferts, graphique, période, activité, laboratoire', '/client/rapports/labo', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('configuration-vente', 'Configuration Vente', '💲', 'Espace Vente', 60,
'## 💲 Configuration Vente

Cet écran est le point de départ de l''Espace Vente : vous y choisissez les articles proposés à la vente et fixez leurs prix, pour la vente directe au comptoir comme pour chaque prestataire de livraison. Vous le trouvez dans le menu **Espace Vente → Configuration Vente**.

### Activer le module Vente

L''Espace Vente est une option de votre abonnement. Tant qu''il n''est pas activé, un écran « Module Vente non activé » s''affiche à la place :

1. Cliquez sur **🚀 Demander l''activation**.
2. Un message « Demande envoyée — en attente de validation » confirme l''envoi ; l''activation est réalisée par l''administrateur sous 24 h.
3. Suivez le statut de votre demande dans [Mon Abonnement](#abonnement).

### Ce que vous voyez

- Un **sélecteur d''activité** : chaque activité a sa propre configuration de prix.
- Deux raccourcis dans l''en-tête : **🛵 Prestataires** et **🏗️ Charges**.
- Quatre onglets : **🛍️ Vente Produits**, **🧂 Ventes Suppléments** et **💎 Ventes Valorisées** (chacun avec son compteur d''articles), plus **📋 Historique config**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie de produit** avec les colonnes *Produit*, *Vendable* (case à cocher), *🏪 Prix direct*, puis une colonne *🛵* par prestataire actif.
- Une barre d''outils : recherche par nom, filtre par prestataire, bouton **✕ Réinitialiser**, compteur d''articles et bouton **💾 Enregistrer** affichant le nombre de modifications en attente.

### Actions pas à pas

Rendre un article vendable et fixer son prix :

1. Cochez la case **Vendable** : l''article entre au catalogue de vente, encore inactif.
2. Saisissez son **prix direct** en DT, puis cliquez sur **💾 Enregistrer**.
3. Cochez à nouveau **Vendable** pour l''activer : tant qu''aucun prix supérieur à 0 n''est enregistré, la case reste bloquée.
4. Une fois l''article actif, saisissez si besoin un **prix dédié par prestataire**, puis enregistrez.

Gérer les canaux prestataires (bouton **🛵 Prestataires**) :

1. Sélectionnez l''activité concernée.
2. Activez ou désactivez chaque prestataire de livraison avec l''interrupteur ; le nombre de prestataires actifs s''affiche dans l''en-tête.
3. La liste des prestataires disponibles est gérée par l''administrateur : si elle est vide, contactez le [support](#support).

Consulter l''onglet **📋 Historique config** : chaque enregistrement de prix y est tracé (produit, type, prix enregistré, date, auteur). Vous pouvez filtrer par nom, type et période, actualiser la liste, supprimer une entrée, et exporter en Excel avec **Exporter XLS** — en cochant des lignes au préalable, seules celles-ci sont exportées.

### Points d''attention

:::attention
Le prix de chaque prestataire est **saisi manuellement**, article par article : il n''y a ni commission ni calcul automatique. Un prix prestataire non renseigné empêche de valoriser correctement les ventes passées par ce canal.
:::

:::attention
Sans prestataire actif pour l''activité, les colonnes prestataires n''apparaissent pas : un bandeau vous propose alors de configurer les prestataires.
:::

:::astuce
Le bouton 💾 Enregistrer affiche le nombre de prix modifiés non sauvegardés : enregistrez avant de changer d''onglet ou d''activité pour ne rien perdre.
:::

### Voir aussi

- [Saisie des ventes](#saisie-ventes) — utiliser ces prix au quotidien
- [Produits vendables](#produits-vendables) et [Articles valorisés](#articles-valorises) — créer les articles à vendre
- [Charges](#charges) — compléter votre configuration de rentabilité
- [Comprendre les prix](#calc-prix) et [HT / TTC](#calc-ht-ttc)',
'## 💲 Configuration Vente

Cet écran est le point de départ de l''Espace Vente : vous y choisissez les articles proposés à la vente et fixez leurs prix, pour la vente directe au comptoir comme pour chaque prestataire de livraison. Vous le trouvez dans le menu **Espace Vente → Configuration Vente**.

### Activer le module Vente

L''Espace Vente est une option de votre abonnement. Tant qu''il n''est pas activé, un écran « Module Vente non activé » s''affiche à la place :

1. Cliquez sur **🚀 Demander l''activation**.
2. Un message « Demande envoyée — en attente de validation » confirme l''envoi ; l''activation est réalisée par l''administrateur sous 24 h.
3. Suivez le statut de votre demande dans [Mon Abonnement](#abonnement).

### Ce que vous voyez

- Un **sélecteur d''activité** : chaque activité a sa propre configuration de prix.
- Deux raccourcis dans l''en-tête : **🛵 Prestataires** et **🏗️ Charges**.
- Quatre onglets : **🛍️ Vente Produits**, **🧂 Ventes Suppléments** et **💎 Ventes Valorisées** (chacun avec son compteur d''articles), plus **📋 Historique config**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie de produit** avec les colonnes *Produit*, *Vendable* (case à cocher), *🏪 Prix direct*, puis une colonne *🛵* par prestataire actif.
- Une barre d''outils : recherche par nom, filtre par prestataire, bouton **✕ Réinitialiser**, compteur d''articles et bouton **💾 Enregistrer** affichant le nombre de modifications en attente.

### Actions pas à pas

Rendre un article vendable et fixer son prix :

1. Cochez la case **Vendable** : l''article entre au catalogue de vente, encore inactif.
2. Saisissez son **prix direct** en DT, puis cliquez sur **💾 Enregistrer**.
3. Cochez à nouveau **Vendable** pour l''activer : tant qu''aucun prix supérieur à 0 n''est enregistré, la case reste bloquée.
4. Une fois l''article actif, saisissez si besoin un **prix dédié par prestataire**, puis enregistrez.

Gérer les canaux prestataires (bouton **🛵 Prestataires**) :

1. Sélectionnez l''activité concernée.
2. Activez ou désactivez chaque prestataire de livraison avec l''interrupteur ; le nombre de prestataires actifs s''affiche dans l''en-tête.
3. La liste des prestataires disponibles est gérée par l''administrateur : si elle est vide, contactez le [support](#support).

Consulter l''onglet **📋 Historique config** : chaque enregistrement de prix y est tracé (produit, type, prix enregistré, date, auteur). Vous pouvez filtrer par nom, type et période, actualiser la liste, supprimer une entrée, et exporter en Excel avec **Exporter XLS** — en cochant des lignes au préalable, seules celles-ci sont exportées.

### Points d''attention

:::attention
Le prix de chaque prestataire est **saisi manuellement**, article par article : il n''y a ni commission ni calcul automatique. Un prix prestataire non renseigné empêche de valoriser correctement les ventes passées par ce canal.
:::

:::attention
Sans prestataire actif pour l''activité, les colonnes prestataires n''apparaissent pas : un bandeau vous propose alors de configurer les prestataires.
:::

:::astuce
Le bouton 💾 Enregistrer affiche le nombre de prix modifiés non sauvegardés : enregistrez avant de changer d''onglet ou d''activité pour ne rien perdre.
:::

### Voir aussi

- [Saisie des ventes](#saisie-ventes) — utiliser ces prix au quotidien
- [Produits vendables](#produits-vendables) et [Articles valorisés](#articles-valorises) — créer les articles à vendre
- [Charges](#charges) — compléter votre configuration de rentabilité
- [Comprendre les prix](#calc-prix) et [HT / TTC](#calc-ht-ttc)',
'configuration vente, prix de vente, prix direct, prestataire, livraison, vendable, activation module, canaux, tarifs, historique des prix, catalogue vente, supplément', '/client/ventes/configuration', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('charges', 'Charges', '🏗️', 'Espace Vente', 61,
'## 🏗️ Charges

Cet écran vous permet de déclarer les **charges fixes annuelles** de chaque activité (loyer, personnel, énergie, eau…). Ces montants complètent le coût matière dans vos analyses de rentabilité, notamment le calcul du seuil de rentabilité. Vous y accédez par **Espace Vente → Config Charges**, ou par le raccourci 🏗️ Charges de la Configuration Vente.

### Ce que vous voyez

- Un **sélecteur d''activité** : les charges se déclarent activité par activité.
- Dans l''en-tête, le **total des charges annuelles** de l''activité sélectionnée, dès qu''un montant est saisi.
- Un bloc **Mode de saisie** avec deux options : **📊 Montant global** ou **📋 Détail par poste**.
- En mode détail, quatre postes de charge : **🏠 Loyer**, **👥 Charges personnel**, **⚡ Électricité / Gaz** et **💧 Eau**, tous exprimés en DT par an.
- Deux cartes de synthèse calculées automatiquement : **📅 Total annuel** et **📆 Mensuel (÷12)**.
- Le bouton **✓ Enregistrer** (ou **✓ Mettre à jour** si des charges existent déjà pour l''activité).

### Actions pas à pas

1. Sélectionnez l''activité concernée.
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

### Points d''attention

:::attention
Les montants se saisissent **à l''année**, pas au mois. Si vous saisissez un loyer mensuel, le total annuel — et toutes les analyses qui en découlent — seront fortement sous-estimés.
:::

:::attention
Le mode choisi détermine le calcul : en **Détail par poste**, le total est la somme des quatre postes ; en **Montant global**, seul le montant global compte. Après un changement de mode, vérifiez le total affiché dans l''en-tête avant d''enregistrer.
:::

:::astuce
Mettez ces montants à jour à chaque évolution notable (nouveau bail, embauche, hausse du prix de l''énergie) : vos indicateurs de rentabilité resteront fidèles à la réalité de votre exploitation.
:::

:::regle
Les charges fixes ne modifient pas le coût matière de vos recettes : elles s''ajoutent à celui-ci dans l''analyse de rentabilité globale de l''activité.
:::

### Voir aussi

- [Configuration Vente](#configuration-vente) — fixer les prix de vente
- [Rapports de vente](#rapports-vente) — suivre CA, marges et food cost
- [Tableau de bord](#dashboard) — vision globale de la performance
- [Coût d''une recette](#calc-cout-recette) — l''autre composante de votre marge',
'## 🏗️ Charges

Cet écran vous permet de déclarer les **charges fixes annuelles** de chaque activité (loyer, personnel, énergie, eau…). Ces montants complètent le coût matière dans vos analyses de rentabilité, notamment le calcul du seuil de rentabilité. Vous y accédez par **Espace Vente → Config Charges**, ou par le raccourci 🏗️ Charges de la Configuration Vente.

### Ce que vous voyez

- Un **sélecteur d''activité** : les charges se déclarent activité par activité.
- Dans l''en-tête, le **total des charges annuelles** de l''activité sélectionnée, dès qu''un montant est saisi.
- Un bloc **Mode de saisie** avec deux options : **📊 Montant global** ou **📋 Détail par poste**.
- En mode détail, quatre postes de charge : **🏠 Loyer**, **👥 Charges personnel**, **⚡ Électricité / Gaz** et **💧 Eau**, tous exprimés en DT par an.
- Deux cartes de synthèse calculées automatiquement : **📅 Total annuel** et **📆 Mensuel (÷12)**.
- Le bouton **✓ Enregistrer** (ou **✓ Mettre à jour** si des charges existent déjà pour l''activité).

### Actions pas à pas

1. Sélectionnez l''activité concernée.
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

### Points d''attention

:::attention
Les montants se saisissent **à l''année**, pas au mois. Si vous saisissez un loyer mensuel, le total annuel — et toutes les analyses qui en découlent — seront fortement sous-estimés.
:::

:::attention
Le mode choisi détermine le calcul : en **Détail par poste**, le total est la somme des quatre postes ; en **Montant global**, seul le montant global compte. Après un changement de mode, vérifiez le total affiché dans l''en-tête avant d''enregistrer.
:::

:::astuce
Mettez ces montants à jour à chaque évolution notable (nouveau bail, embauche, hausse du prix de l''énergie) : vos indicateurs de rentabilité resteront fidèles à la réalité de votre exploitation.
:::

:::regle
Les charges fixes ne modifient pas le coût matière de vos recettes : elles s''ajoutent à celui-ci dans l''analyse de rentabilité globale de l''activité.
:::

### Voir aussi

- [Configuration Vente](#configuration-vente) — fixer les prix de vente
- [Rapports de vente](#rapports-vente) — suivre CA, marges et food cost
- [Tableau de bord](#dashboard) — vision globale de la performance
- [Coût d''une recette](#calc-cout-recette) — l''autre composante de votre marge',
'charges fixes, loyer, personnel, électricité, gaz, eau, rentabilité, seuil de rentabilité, charges annuelles, mensuel, exploitation, postes', '/client/ventes/charges', false)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('saisie-ventes', 'Saisie des ventes', '🛒', 'Espace Vente', 62,
'## 🛒 Saisie des ventes

Cet écran vous permet d''enregistrer les ventes quotidiennes de chaque activité — en vente directe au comptoir comme via vos prestataires de livraison — puis d''en consulter l''historique complet. Vous le trouvez dans le menu **Espace Vente → Ventes Activités**.

### Ce que vous voyez

- Un **sélecteur d''activité** et deux raccourcis : **⚙️ Configuration** et **📊 Rapport**.
- Quatre onglets : **📝 Saisie des ventes produits**, **🧂 Saisie des ventes suppléments**, **💎 Saisie des ventes valorisées** et **📋 Historique**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie** avec les colonnes *Article* (et son unité), *Prix vente*, *🏪 Qté directe*, puis une colonne *🛵* par prestataire actif.
- Une barre d''outils : recherche par nom, champ **Date de vente** et bouton **✓ Confirmer les ventes**.
- En bas du tableau, le **CA total** de votre saisie, mis à jour en direct.

### Actions pas à pas

Enregistrer les ventes d''une journée :

1. Choisissez l''activité, puis l''onglet correspondant au type d''article (produits, suppléments ou valorisés).
2. Vérifiez la **date de vente** : la date du jour est proposée par défaut, modifiable pour une saisie a posteriori.
3. Saisissez les quantités vendues dans la colonne **🏪 Qté directe** et/ou dans la colonne de chaque prestataire.
4. Contrôlez le **CA total** en bas de tableau.
5. Cliquez sur **✓ Confirmer les ventes** : une fenêtre rappelle que la vente déduira directement le stock de l''activité ; validez avec **✓ Confirmer**.

Consulter et gérer l''historique (onglet 📋) :

1. Filtrez par période (**Du / Au**), **type de vente** (directe ou prestataire), **type de produit** (produit, supplément, valorisé) et **prestataire**.
2. Chaque ligne détaille l''article, son badge de type, le canal (🏪 Directe ou 🛵 nom du prestataire), la quantité, le CA avec le prix unitaire appliqué, et l''auteur de la saisie.
3. Cliquez sur **Exporter XLS** pour télécharger l''historique en Excel ; cochez d''abord des lignes pour n''exporter que celles-ci.
4. Le bouton **Annuler** d''une ligne supprime la vente et **réintègre les quantités en stock** (une confirmation est demandée).

### Calculs

:::formule Chiffre d''affaires d''une ligne
CA = quantité vendue × prix de vente du canal
note: prix direct pour la vente au comptoir, prix prestataire configuré pour chaque prestataire.
:::

À la confirmation, les quantités vendues sont déduites du stock de l''activité : les articles valorisés directement, les produits et suppléments via la décomposition de leur fiche technique (articles et sous-produits transformés) ; un produit préparé au labo est, lui, déduit tel quel du stock de produits transformés de l''activité. La marge dégagée est ensuite analysée dans le [rapport de vente](#rapports-vente).

### Points d''attention

:::attention
Configurez le **prix prestataire** de chaque article avant de saisir des quantités sur ce canal : une quantité saisie sans prix configuré est valorisée à 0 DT dans le chiffre d''affaires.
:::

:::attention
La confirmation déduit immédiatement le stock. En cas d''erreur, utilisez le bouton **Annuler** dans l''historique : la vente est supprimée et le stock réintégré. Un gérant ne peut annuler que les ventes qu''il a lui-même saisies.
:::

:::astuce
Seuls les articles **activés** en Configuration Vente apparaissent dans les tableaux de saisie. Si un tableau est vide, un lien vous mène directement à l''écran de configuration des prix.
:::

### Voir aussi

- [Configuration Vente](#configuration-vente) — activer les articles et fixer les prix
- [Ventes Labo](#ventes-labo) — le pendant côté laboratoire
- [Rapports de vente](#rapports-vente) — analyser CA et marges
- [Stock des activités](#stock-activites) et [Fiches techniques](#fiches-techniques) — comprendre le déstockage',
'## 🛒 Saisie des ventes

Cet écran vous permet d''enregistrer les ventes quotidiennes de chaque activité — en vente directe au comptoir comme via vos prestataires de livraison — puis d''en consulter l''historique complet. Vous le trouvez dans le menu **Espace Vente → Ventes Activités**.

### Ce que vous voyez

- Un **sélecteur d''activité** et deux raccourcis : **⚙️ Configuration** et **📊 Rapport**.
- Quatre onglets : **📝 Saisie des ventes produits**, **🧂 Saisie des ventes suppléments**, **💎 Saisie des ventes valorisées** et **📋 Historique**.
- Dans chaque onglet de saisie, un tableau groupé par **catégorie** avec les colonnes *Article* (et son unité), *Prix vente*, *🏪 Qté directe*, puis une colonne *🛵* par prestataire actif.
- Une barre d''outils : recherche par nom, champ **Date de vente** et bouton **✓ Confirmer les ventes**.
- En bas du tableau, le **CA total** de votre saisie, mis à jour en direct.

### Actions pas à pas

Enregistrer les ventes d''une journée :

1. Choisissez l''activité, puis l''onglet correspondant au type d''article (produits, suppléments ou valorisés).
2. Vérifiez la **date de vente** : la date du jour est proposée par défaut, modifiable pour une saisie a posteriori.
3. Saisissez les quantités vendues dans la colonne **🏪 Qté directe** et/ou dans la colonne de chaque prestataire.
4. Contrôlez le **CA total** en bas de tableau.
5. Cliquez sur **✓ Confirmer les ventes** : une fenêtre rappelle que la vente déduira directement le stock de l''activité ; validez avec **✓ Confirmer**.

Consulter et gérer l''historique (onglet 📋) :

1. Filtrez par période (**Du / Au**), **type de vente** (directe ou prestataire), **type de produit** (produit, supplément, valorisé) et **prestataire**.
2. Chaque ligne détaille l''article, son badge de type, le canal (🏪 Directe ou 🛵 nom du prestataire), la quantité, le CA avec le prix unitaire appliqué, et l''auteur de la saisie.
3. Cliquez sur **Exporter XLS** pour télécharger l''historique en Excel ; cochez d''abord des lignes pour n''exporter que celles-ci.
4. Le bouton **Annuler** d''une ligne supprime la vente et **réintègre les quantités en stock** (une confirmation est demandée).

### Calculs

:::formule Chiffre d''affaires d''une ligne
CA = quantité vendue × prix de vente du canal
note: prix direct pour la vente au comptoir, prix prestataire configuré pour chaque prestataire.
:::

À la confirmation, les quantités vendues sont déduites du stock de l''activité : les articles valorisés directement, les produits et suppléments via la décomposition de leur fiche technique (articles et sous-produits transformés) ; un produit préparé au labo est, lui, déduit tel quel du stock de produits transformés de l''activité. La marge dégagée est ensuite analysée dans le [rapport de vente](#rapports-vente).

### Points d''attention

:::attention
Configurez le **prix prestataire** de chaque article avant de saisir des quantités sur ce canal : une quantité saisie sans prix configuré est valorisée à 0 DT dans le chiffre d''affaires.
:::

:::attention
La confirmation déduit immédiatement le stock. En cas d''erreur, utilisez le bouton **Annuler** dans l''historique : la vente est supprimée et le stock réintégré. Un gérant ne peut annuler que les ventes qu''il a lui-même saisies.
:::

:::astuce
Seuls les articles **activés** en Configuration Vente apparaissent dans les tableaux de saisie. Si un tableau est vide, un lien vous mène directement à l''écran de configuration des prix.
:::

### Voir aussi

- [Configuration Vente](#configuration-vente) — activer les articles et fixer les prix
- [Ventes Labo](#ventes-labo) — le pendant côté laboratoire
- [Rapports de vente](#rapports-vente) — analyser CA et marges
- [Stock des activités](#stock-activites) et [Fiches techniques](#fiches-techniques) — comprendre le déstockage',
'ventes, saisie, quantités, vente directe, prestataire, chiffre d affaires, déstockage, historique, annulation, export excel, suppléments, valorisés', '/client/ventes', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('ventes-labo', 'Ventes Labo', '🏭', 'Espace Vente', 63,
'## 🏭 Ventes Labo

Le laboratoire ne vend pas au comptoir : son « chiffre d''affaires » correspond aux **transferts valorisés** vers vos activités — articles comme produits transformés (dont les composés valorisés, comptés au prix labo). Cet écran présente cet historique avec une analyse prix / coût. Vous le trouvez dans le menu **Espace Vente → Ventes Labo**.

### Ce que vous voyez

- Un **sélecteur de labo** (🏭) pour choisir le laboratoire, et un raccourci **📊 Rapport**.
- Une barre de filtres : période **Du / Au** avec bouton **🔍 Filtrer dates**, puis **Catégorie**, **Article** (liste qui s''adapte à la catégorie choisie) et **Activité** destinataire ; bouton **✕ Réinitialiser** et **Exporter XLS**.
- Trois indicateurs calculés sur les lignes filtrées : **Valeur totale achat**, **Valeur totale transferts** et **Écart total** (affiché en vert s''il est positif, en rouge sinon).
- Un tableau avec les colonnes *Article* (unité et date), *Activité*, *Qté*, *Prix transfert* (total et prix unitaire), *Prix appro* (total et prix unitaire) et *Écart* (montant et pourcentage), avec une ligne de total en pied de tableau.

### Actions pas à pas

1. Sélectionnez le labo concerné.
2. Renseignez la période puis cliquez sur **🔍 Filtrer dates** ; les filtres catégorie, article et activité s''appliquent, eux, instantanément.
3. Lisez l''écart ligne par ligne : il compare la valeur du transfert au coût d''achat des matières, et le pied de tableau totalise l''ensemble.
4. Cliquez sur **Exporter XLS** pour télécharger l''historique ; cochez des lignes au préalable pour n''exporter que celles-ci.

:::formule Écart d''un transfert
Écart = (prix de transfert × quantité) − (prix moyen d''achat × quantité)
note: aussi affiché en pourcentage du coût d''achat ; un écart positif signifie que le labo valorise au-dessus de son coût.
:::

### Différences avec les ventes d''activité

| | Ventes d''activité | Ventes Labo |
|---|---|---|
| Alimentation | Saisie manuelle des quantités | Automatique, à partir des transferts |
| Prix appliqué | Prix direct ou prix prestataire | Prix de transfert (par exemple le prix labo d''un composé valorisé) |
| Client | Consommateur final | Vos propres activités |
| Modification | Bouton Annuler dans l''historique | Écran en consultation seule |

### Points d''attention

:::attention
Sur certaines lignes, le prix d''achat moyen peut être indisponible (affiché « — ») : l''écart n''est alors pas calculé pour cette ligne et la valeur d''achat totale s''en trouve minorée.
:::

:::attention
Les indicateurs portent uniquement sur les lignes filtrées : pensez à réinitialiser les filtres pour retrouver la vision complète.
:::

:::astuce
Un écart négatif récurrent sur un article signale un prix labo inférieur au coût réel d''achat : revoyez le prix de ce composé valorisé pour ne pas transférer à perte.
:::

### Voir aussi

- [Transferts](#transferts) — l''opération qui alimente cet écran
- [Calcul des transferts](#calc-transferts) et [PMP](#calc-pmp) — d''où viennent les valeurs
- [Lexique des produits transformés](#lexique-pt) — comprendre les composés valorisés
- [Stock labo](#stock-labo) et [Rapports labo](#rapports-labo)',
'## 🏭 Ventes Labo

Le laboratoire ne vend pas au comptoir : son « chiffre d''affaires » correspond aux **transferts valorisés** vers vos activités — articles comme produits transformés (dont les composés valorisés, comptés au prix labo). Cet écran présente cet historique avec une analyse prix / coût. Vous le trouvez dans le menu **Espace Vente → Ventes Labo**.

### Ce que vous voyez

- Un **sélecteur de labo** (🏭) pour choisir le laboratoire, et un raccourci **📊 Rapport**.
- Une barre de filtres : période **Du / Au** avec bouton **🔍 Filtrer dates**, puis **Catégorie**, **Article** (liste qui s''adapte à la catégorie choisie) et **Activité** destinataire ; bouton **✕ Réinitialiser** et **Exporter XLS**.
- Trois indicateurs calculés sur les lignes filtrées : **Valeur totale achat**, **Valeur totale transferts** et **Écart total** (affiché en vert s''il est positif, en rouge sinon).
- Un tableau avec les colonnes *Article* (unité et date), *Activité*, *Qté*, *Prix transfert* (total et prix unitaire), *Prix appro* (total et prix unitaire) et *Écart* (montant et pourcentage), avec une ligne de total en pied de tableau.

### Actions pas à pas

1. Sélectionnez le labo concerné.
2. Renseignez la période puis cliquez sur **🔍 Filtrer dates** ; les filtres catégorie, article et activité s''appliquent, eux, instantanément.
3. Lisez l''écart ligne par ligne : il compare la valeur du transfert au coût d''achat des matières, et le pied de tableau totalise l''ensemble.
4. Cliquez sur **Exporter XLS** pour télécharger l''historique ; cochez des lignes au préalable pour n''exporter que celles-ci.

:::formule Écart d''un transfert
Écart = (prix de transfert × quantité) − (prix moyen d''achat × quantité)
note: aussi affiché en pourcentage du coût d''achat ; un écart positif signifie que le labo valorise au-dessus de son coût.
:::

### Différences avec les ventes d''activité

| | Ventes d''activité | Ventes Labo |
|---|---|---|
| Alimentation | Saisie manuelle des quantités | Automatique, à partir des transferts |
| Prix appliqué | Prix direct ou prix prestataire | Prix de transfert (par exemple le prix labo d''un composé valorisé) |
| Client | Consommateur final | Vos propres activités |
| Modification | Bouton Annuler dans l''historique | Écran en consultation seule |

### Points d''attention

:::attention
Sur certaines lignes, le prix d''achat moyen peut être indisponible (affiché « — ») : l''écart n''est alors pas calculé pour cette ligne et la valeur d''achat totale s''en trouve minorée.
:::

:::attention
Les indicateurs portent uniquement sur les lignes filtrées : pensez à réinitialiser les filtres pour retrouver la vision complète.
:::

:::astuce
Un écart négatif récurrent sur un article signale un prix labo inférieur au coût réel d''achat : revoyez le prix de ce composé valorisé pour ne pas transférer à perte.
:::

### Voir aussi

- [Transferts](#transferts) — l''opération qui alimente cet écran
- [Calcul des transferts](#calc-transferts) et [PMP](#calc-pmp) — d''où viennent les valeurs
- [Lexique des produits transformés](#lexique-pt) — comprendre les composés valorisés
- [Stock labo](#stock-labo) et [Rapports labo](#rapports-labo)',
'ventes labo, transferts valorisés, prix de transfert, prix labo, écart, coût d achat, composés valorisés, laboratoire, marge labo, export excel', '/client/labo/ventes', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('rapports-vente', 'Rapport ventes', '📈', 'Espace Vente', 64,
'## 📈 Rapport ventes

Cet écran analyse vos performances commerciales : chiffre d''affaires, marge, food cost et panier moyen, avec le détail par produit et par canal. Vous le trouvez dans le menu **Espace Vente → Rapport Vente**, ou via le raccourci 📊 Rapport des écrans de vente.

### Ce que vous voyez

- Une barre de filtres : **📅 Période** (Mois en cours, 30 jours, Trimestre, ou Personnalisé avec deux dates), **🏪 Activité** (si vous en gérez plusieurs), **🏷️ Catégorie** et **🛒 Canal** (Direct ou Prestataires).
- Quatre indicateurs clés :

| Indicateur | Contenu |
|---|---|
| **CA total** | Chiffre d''affaires de la période, en DT |
| **Marge brute** | CA moins coût matière, avec le taux de marge en % |
| **Food cost moyen** | Part du coût matière dans le CA (cible < 30 %) |
| **Panier moyen** | CA moyen par vente, avec le nombre de ventes |

- Deux graphiques : **Top produits (CA)** (barres horizontales, les 6 premiers) et **CA par canal** (anneau de répartition).
- Un tableau **Détail par produit** : colonnes *Produit*, *Qté*, *CA*, *Marge* et *Food cost* (badge coloré), avec un filtre par type (Produits, Suppléments, Valorisés) et un tri au choix (CA, Marge, Food cost, Quantité).
- Le bouton **📊 Export Excel** dans l''en-tête.

### Actions pas à pas

1. Choisissez la période : un préréglage rapide, ou **Personnalisé** pour saisir vos propres dates.
2. Affinez avec les filtres activité, catégorie et canal ; le rapport se recharge automatiquement.
3. Lisez les quatre indicateurs : les pastilles de couleur signalent les zones de vigilance.
4. Dans le détail par produit, triez par **Food cost** pour repérer les produits dont le coût matière pèse trop lourd, ou par **Marge** pour identifier vos meilleurs contributeurs.
5. Cliquez sur **📊 Export Excel** pour exporter le détail des ventes de la période (sélectionnez d''abord une activité dans le filtre).

### Comprendre les indicateurs

:::formule Taux de marge
Taux de marge (%) = (CA − coût matière) ÷ CA × 100
:::

:::formule Food cost
Food cost (%) = coût matière ÷ CA × 100
note: vert < 30 %, orange 30–40 %, rouge > 40 %.
:::

:::formule Panier moyen
Panier moyen = CA total ÷ nombre de ventes enregistrées
:::

### Points d''attention

:::attention
Le rapport n''est fiable que si les ventes sont **saisies régulièrement** et si les prix d''achat de vos articles sont à jour : le coût matière provient des fiches techniques et des prix réels d''approvisionnement.
:::

:::attention
Tous les montants sont exprimés en DT TTC. Si la période ne contient aucune vente, le rapport affiche « Aucune vente sur cette période » : élargissez la période ou vérifiez vos filtres.
:::

:::astuce
Utilisez le filtre **Canal** pour comparer la rentabilité de la vente directe et de chaque famille de ventes prestataires : les prix dédiés aux prestataires peuvent changer sensiblement la marge.
:::

### Voir aussi

- [Saisie des ventes](#saisie-ventes) — la source des données
- [Configuration Vente](#configuration-vente) — ajuster les prix suite à l''analyse
- [Coût d''une recette](#calc-cout-recette) — comprendre le coût matière
- [Tableau de bord](#dashboard) et [FAQ chiffres](#faq-chiffres)',
'## 📈 Rapport ventes

Cet écran analyse vos performances commerciales : chiffre d''affaires, marge, food cost et panier moyen, avec le détail par produit et par canal. Vous le trouvez dans le menu **Espace Vente → Rapport Vente**, ou via le raccourci 📊 Rapport des écrans de vente.

### Ce que vous voyez

- Une barre de filtres : **📅 Période** (Mois en cours, 30 jours, Trimestre, ou Personnalisé avec deux dates), **🏪 Activité** (si vous en gérez plusieurs), **🏷️ Catégorie** et **🛒 Canal** (Direct ou Prestataires).
- Quatre indicateurs clés :

| Indicateur | Contenu |
|---|---|
| **CA total** | Chiffre d''affaires de la période, en DT |
| **Marge brute** | CA moins coût matière, avec le taux de marge en % |
| **Food cost moyen** | Part du coût matière dans le CA (cible < 30 %) |
| **Panier moyen** | CA moyen par vente, avec le nombre de ventes |

- Deux graphiques : **Top produits (CA)** (barres horizontales, les 6 premiers) et **CA par canal** (anneau de répartition).
- Un tableau **Détail par produit** : colonnes *Produit*, *Qté*, *CA*, *Marge* et *Food cost* (badge coloré), avec un filtre par type (Produits, Suppléments, Valorisés) et un tri au choix (CA, Marge, Food cost, Quantité).
- Le bouton **📊 Export Excel** dans l''en-tête.

### Actions pas à pas

1. Choisissez la période : un préréglage rapide, ou **Personnalisé** pour saisir vos propres dates.
2. Affinez avec les filtres activité, catégorie et canal ; le rapport se recharge automatiquement.
3. Lisez les quatre indicateurs : les pastilles de couleur signalent les zones de vigilance.
4. Dans le détail par produit, triez par **Food cost** pour repérer les produits dont le coût matière pèse trop lourd, ou par **Marge** pour identifier vos meilleurs contributeurs.
5. Cliquez sur **📊 Export Excel** pour exporter le détail des ventes de la période (sélectionnez d''abord une activité dans le filtre).

### Comprendre les indicateurs

:::formule Taux de marge
Taux de marge (%) = (CA − coût matière) ÷ CA × 100
:::

:::formule Food cost
Food cost (%) = coût matière ÷ CA × 100
note: vert < 30 %, orange 30–40 %, rouge > 40 %.
:::

:::formule Panier moyen
Panier moyen = CA total ÷ nombre de ventes enregistrées
:::

### Points d''attention

:::attention
Le rapport n''est fiable que si les ventes sont **saisies régulièrement** et si les prix d''achat de vos articles sont à jour : le coût matière provient des fiches techniques et des prix réels d''approvisionnement.
:::

:::attention
Tous les montants sont exprimés en DT TTC. Si la période ne contient aucune vente, le rapport affiche « Aucune vente sur cette période » : élargissez la période ou vérifiez vos filtres.
:::

:::astuce
Utilisez le filtre **Canal** pour comparer la rentabilité de la vente directe et de chaque famille de ventes prestataires : les prix dédiés aux prestataires peuvent changer sensiblement la marge.
:::

### Voir aussi

- [Saisie des ventes](#saisie-ventes) — la source des données
- [Configuration Vente](#configuration-vente) — ajuster les prix suite à l''analyse
- [Coût d''une recette](#calc-cout-recette) — comprendre le coût matière
- [Tableau de bord](#dashboard) et [FAQ chiffres](#faq-chiffres)',
'rapport ventes, chiffre d affaires, marge brute, taux de marge, food cost, panier moyen, canal, top produits, analyse, export excel, période, kpi', '/client/ventes/rapport', false)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('dashboard', 'Tableau de bord', '📊', 'Gestion', 70,
'## 📊 Tableau de bord

Le tableau de bord est votre vue d''ensemble chiffrée : il rassemble sur un seul écran vos ventes, vos coûts, votre stock et vos alertes, pour la période de votre choix. Vous le trouvez dans le menu latéral, entrée **Tableau de bord**.

### Ce que vous voyez

En haut, le bandeau rappelle la **période analysée** (date de début → date de fin). Juste en dessous, la barre de filtres propose :

- **Période** : *Mois en cours*, *30 jours*, *Trimestre* ou *Personnalisé* (deux dates au choix).
- **Activité** : si vous gérez plusieurs activités, un sélecteur permet d''analyser *Toutes activités* ou une seule.

Viennent ensuite six **indicateurs clés**, colorés selon leur état (vert = sain, orange = à surveiller, rouge = à corriger) :

| Indicateur | Ce qu''il montre |
|---|---|
| Chiffre d''affaires | Total des ventes en DT, avec l''évolution ▲/▼ par rapport à la période précédente |
| Food cost | Part du coût matière dans le CA : sain sous 30 %, à surveiller entre 30 et 40 %, élevé au-delà |
| Marge brute | Marge en DT et taux de marge en % |
| Valeur du stock | Valorisation de votre stock en DT |
| Pertes | Montant des pertes et leur poids en % du CA (vert sous 3 %, rouge au-delà de 5 %) |
| Panier moyen | Montant moyen par vente et nombre de ventes |

Le bloc **🔔 Alertes & actions** n''apparaît que s''il y a quelque chose à traiter : articles sous le seuil minimum (bouton *Réapprovisionner*), produits dont le food cost dépasse 40 % (*Voir le rapport*), inventaire absent ou datant de plus de 14 jours (*Lancer un inventaire*). Chaque alerte est cliquable et vous emmène directement sur l''écran concerné.

Quatre **graphiques** complètent la lecture : *CA & marge — évolution* (courbes par semaine), *Répartition du CA par catégorie*, *Top produits (CA)* (les 6 meilleurs) et *CA par canal*. En bas de page, trois raccourcis ouvrent les rapports détaillés : **Rapport activités**, **Rapport ventes** et **Rapport labo**.

### Actions pas à pas

1. Choisissez la **période** avec les boutons prédéfinis, ou *Personnalisé* puis les deux dates.
2. Si besoin, restreignez l''analyse à **une activité** avec le sélecteur 🏪.
3. Parcourez les indicateurs : une pastille de couleur signale ceux qui demandent votre attention.
4. Traitez les **alertes** en cliquant dessus : chacune ouvre l''écran d''action correspondant.
5. Approfondissez avec les raccourcis *Rapports détaillés* en bas de page.

### Points d''attention

:::attention
Les indicateurs liés aux ventes (CA, food cost, marge, panier moyen) reposent sur les ventes saisies dans l''Espace Vente. Sans vente saisie sur la période, ces indicateurs restent à zéro ou affichent « — ».
:::

:::astuce
Comparez régulièrement le mois en cours à la période précédente grâce au pourcentage d''évolution affiché sous le chiffre d''affaires : c''est le moyen le plus rapide de repérer une dérive.
:::

:::regle
Tous les montants sont exprimés en DT **TTC**.
:::

### Voir aussi

- [Saisie des ventes](#saisie-ventes) — d''où vient le chiffre d''affaires
- [Rapport activités](#rapports) et [Rapport ventes](#rapports-vente)
- [Pertes](#pertes) et [Inventaire](#inventaire)
- [Comprendre HT et TTC](#calc-ht-ttc) · [Seuils de stock](#calc-seuils)',
'## 📊 Tableau de bord

Le tableau de bord est votre vue d''ensemble chiffrée : il rassemble sur un seul écran vos ventes, vos coûts, votre stock et vos alertes, pour la période de votre choix. Vous le trouvez dans le menu latéral, entrée **Tableau de bord**.

### Ce que vous voyez

En haut, le bandeau rappelle la **période analysée** (date de début → date de fin). Juste en dessous, la barre de filtres propose :

- **Période** : *Mois en cours*, *30 jours*, *Trimestre* ou *Personnalisé* (deux dates au choix).
- **Activité** : si vous gérez plusieurs activités, un sélecteur permet d''analyser *Toutes activités* ou une seule.

Viennent ensuite six **indicateurs clés**, colorés selon leur état (vert = sain, orange = à surveiller, rouge = à corriger) :

| Indicateur | Ce qu''il montre |
|---|---|
| Chiffre d''affaires | Total des ventes en DT, avec l''évolution ▲/▼ par rapport à la période précédente |
| Food cost | Part du coût matière dans le CA : sain sous 30 %, à surveiller entre 30 et 40 %, élevé au-delà |
| Marge brute | Marge en DT et taux de marge en % |
| Valeur du stock | Valorisation de votre stock en DT |
| Pertes | Montant des pertes et leur poids en % du CA (vert sous 3 %, rouge au-delà de 5 %) |
| Panier moyen | Montant moyen par vente et nombre de ventes |

Le bloc **🔔 Alertes & actions** n''apparaît que s''il y a quelque chose à traiter : articles sous le seuil minimum (bouton *Réapprovisionner*), produits dont le food cost dépasse 40 % (*Voir le rapport*), inventaire absent ou datant de plus de 14 jours (*Lancer un inventaire*). Chaque alerte est cliquable et vous emmène directement sur l''écran concerné.

Quatre **graphiques** complètent la lecture : *CA & marge — évolution* (courbes par semaine), *Répartition du CA par catégorie*, *Top produits (CA)* (les 6 meilleurs) et *CA par canal*. En bas de page, trois raccourcis ouvrent les rapports détaillés : **Rapport activités**, **Rapport ventes** et **Rapport labo**.

### Actions pas à pas

1. Choisissez la **période** avec les boutons prédéfinis, ou *Personnalisé* puis les deux dates.
2. Si besoin, restreignez l''analyse à **une activité** avec le sélecteur 🏪.
3. Parcourez les indicateurs : une pastille de couleur signale ceux qui demandent votre attention.
4. Traitez les **alertes** en cliquant dessus : chacune ouvre l''écran d''action correspondant.
5. Approfondissez avec les raccourcis *Rapports détaillés* en bas de page.

### Points d''attention

:::attention
Les indicateurs liés aux ventes (CA, food cost, marge, panier moyen) reposent sur les ventes saisies dans l''Espace Vente. Sans vente saisie sur la période, ces indicateurs restent à zéro ou affichent « — ».
:::

:::astuce
Comparez régulièrement le mois en cours à la période précédente grâce au pourcentage d''évolution affiché sous le chiffre d''affaires : c''est le moyen le plus rapide de repérer une dérive.
:::

:::regle
Tous les montants sont exprimés en DT **TTC**.
:::

### Voir aussi

- [Saisie des ventes](#saisie-ventes) — d''où vient le chiffre d''affaires
- [Rapport activités](#rapports) et [Rapport ventes](#rapports-vente)
- [Pertes](#pertes) et [Inventaire](#inventaire)
- [Comprendre HT et TTC](#calc-ht-ttc) · [Seuils de stock](#calc-seuils)',
'tableau de bord, indicateurs, kpi, chiffre d''affaires, food cost, marge, valeur stock, pertes, panier moyen, alertes, période, graphiques', '/client/dashboard', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('dashboard-gerant', 'Tableau de bord gérant', '🏠', 'Gestion', 71,
'## 🏠 Tableau de bord gérant

C''est l''écran d''accueil du **gérant** : un résumé de l''activité (ou du labo) qui lui est affecté, avec ses chiffres de l''année ou du mois. Le périmètre est strictement limité aux activités et labos que le propriétaire du compte vous a attribués.

### Ce que vous voyez

Le bandeau d''accueil vous salue par votre prénom et rappelle **l''activité ou le labo** sur lequel vous travaillez, ainsi que la période affichée. La barre de filtres propose :

- **Année** : l''année en cours ou la précédente.
- **Mois** : *Toute l''année* ou un mois précis.
- **Type d''appro** : *Tous les types*, *Manuel*, *Transfert*, *Prod. Transformé* (uniquement côté labo) et *Vente* si le module vente est actif.

Un bouton de réinitialisation apparaît dès qu''un filtre est actif. Viennent ensuite des **cartes de synthèse**, chacune dotée d''un lien *Voir →* vers l''historique correspondant :

- **📦 Approvisionnements** : nombre d''entrées, valeur en DT, répartition par type (Manuel, Transfert…) et mini-graphique mois par mois.
- **🗑️ Pertes enregistrées** : nombre de pertes, valeur perdue en DT, mini-graphique mensuel.
- **📋 Inventaires** : nombre d''inventaires réalisés et date du dernier.
- **🏪 Articles en stock** : nombre de références approvisionnées.
- **🛒 Ventes** (si le module vente est actif) : ventes confirmées et chiffre d''affaires.

Quand vous affichez *Toute l''année*, un tableau **Évolution mensuelle** détaille mois par mois les appros (nombre et valeur), les pertes (et leur valeur le cas échéant) ainsi que les ventes et le CA si le module vente est actif. Le mois en cours est surligné avec la mention « ← actuel », et une ligne *Total* clôt le tableau.

### Actions pas à pas

1. Sélectionnez l''**année**, puis éventuellement un **mois** pour zoomer.
2. Filtrez par **type d''appro** pour isoler par exemple les transferts reçus du labo.
3. Cliquez sur **Voir →** dans une carte pour ouvrir l''historique détaillé (appros, pertes, inventaires, stock ou ventes).
4. Utilisez le bouton de réinitialisation pour revenir à la vue de l''année en cours.

### Points d''attention

:::attention
Si votre compte n''est pas encore rattaché à une activité ou un labo, l''écran affiche un message d''accueil vous invitant à contacter l''administrateur : demandez au propriétaire du compte de vous affecter depuis son écran Comptes gérants.
:::

:::astuce
Le tableau Évolution mensuelle est idéal pour repérer un mois anormal (pic de pertes, chute d''appros) avant d''ouvrir les historiques détaillés.
:::

### Voir aussi

- [Les rôles dans LabFlow](#roles) — ce qu''un gérant peut faire ou non
- [Historique des mouvements](#historique) · [Pertes](#pertes) · [Inventaire](#inventaire)
- [Stock des activités](#stock-activites) · [Stock du labo](#stock-labo)
- [Saisie des ventes](#saisie-ventes)',
'## 🏠 Tableau de bord gérant

C''est l''écran d''accueil du **gérant** : un résumé de l''activité (ou du labo) qui lui est affecté, avec ses chiffres de l''année ou du mois. Le périmètre est strictement limité aux activités et labos que le propriétaire du compte vous a attribués.

### Ce que vous voyez

Le bandeau d''accueil vous salue par votre prénom et rappelle **l''activité ou le labo** sur lequel vous travaillez, ainsi que la période affichée. La barre de filtres propose :

- **Année** : l''année en cours ou la précédente.
- **Mois** : *Toute l''année* ou un mois précis.
- **Type d''appro** : *Tous les types*, *Manuel*, *Transfert*, *Prod. Transformé* (uniquement côté labo) et *Vente* si le module vente est actif.

Un bouton de réinitialisation apparaît dès qu''un filtre est actif. Viennent ensuite des **cartes de synthèse**, chacune dotée d''un lien *Voir →* vers l''historique correspondant :

- **📦 Approvisionnements** : nombre d''entrées, valeur en DT, répartition par type (Manuel, Transfert…) et mini-graphique mois par mois.
- **🗑️ Pertes enregistrées** : nombre de pertes, valeur perdue en DT, mini-graphique mensuel.
- **📋 Inventaires** : nombre d''inventaires réalisés et date du dernier.
- **🏪 Articles en stock** : nombre de références approvisionnées.
- **🛒 Ventes** (si le module vente est actif) : ventes confirmées et chiffre d''affaires.

Quand vous affichez *Toute l''année*, un tableau **Évolution mensuelle** détaille mois par mois les appros (nombre et valeur), les pertes (et leur valeur le cas échéant) ainsi que les ventes et le CA si le module vente est actif. Le mois en cours est surligné avec la mention « ← actuel », et une ligne *Total* clôt le tableau.

### Actions pas à pas

1. Sélectionnez l''**année**, puis éventuellement un **mois** pour zoomer.
2. Filtrez par **type d''appro** pour isoler par exemple les transferts reçus du labo.
3. Cliquez sur **Voir →** dans une carte pour ouvrir l''historique détaillé (appros, pertes, inventaires, stock ou ventes).
4. Utilisez le bouton de réinitialisation pour revenir à la vue de l''année en cours.

### Points d''attention

:::attention
Si votre compte n''est pas encore rattaché à une activité ou un labo, l''écran affiche un message d''accueil vous invitant à contacter l''administrateur : demandez au propriétaire du compte de vous affecter depuis son écran Comptes gérants.
:::

:::astuce
Le tableau Évolution mensuelle est idéal pour repérer un mois anormal (pic de pertes, chute d''appros) avant d''ouvrir les historiques détaillés.
:::

### Voir aussi

- [Les rôles dans LabFlow](#roles) — ce qu''un gérant peut faire ou non
- [Historique des mouvements](#historique) · [Pertes](#pertes) · [Inventaire](#inventaire)
- [Stock des activités](#stock-activites) · [Stock du labo](#stock-labo)
- [Saisie des ventes](#saisie-ventes)',
'gérant, accueil, tableau de bord, approvisionnements, pertes, inventaires, articles, ventes, année, mois, périmètre, activité, labo', '/client/gerant-dashboard', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('activites', 'Activités & labos', '🏢', 'Gestion', 72,
'## 🏢 Activités & labos

Cet écran vous permet de créer et gérer vos **activités** (points de vente) et vos **labos** de production, dans la limite de votre abonnement. Vous le trouvez dans le menu latéral, entrée **Mes activités**. Un compte peut gérer une ou plusieurs activités, avec ou sans labo central.

### Ce que vous voyez

Le bandeau affiche vos **compteurs de quota** : activités utilisées / incluses, et labos utilisés / inclus si votre abonnement en prévoit. Une barre de recherche filtre activités et labos par nom.

- **Section Activités** : un tableau avec le *Nom*, l''*Adresse*, le *Labo* de rattachement (pastille 🏭 cliquable qui ouvre la fiche du labo) et les boutons ✏️ modifier / 🗑 supprimer. Le bouton **+ Nouvelle activité** est remplacé par **⚡ Ajouter activités** quand le quota est atteint : il ouvre alors une demande de supplément auprès du support.
- **Section Espace Labos** (si votre abonnement inclut au moins un labo) : tableau *Nom*, *Réf.*, *Adresse*, avec **+ Nouveau labo** ou **⚡ Ajouter labos** au quota atteint.

À la toute première visite, quand rien n''existe encore, un écran de démarrage propose **✨ Créer mon business** (si un labo est inclus) ou **+ Ajouter mon activité**.

### Actions pas à pas

1. **Premier démarrage avec le wizard « Créer mon business »** : à l''étape *Laboratoire*, saisissez le nom, la référence (unique) et l''adresse du labo — ou cochez *Passer cette étape*. À l''étape *Activités*, remplissez un bloc par activité (nom obligatoire, adresse, choix **Avec labo** / **Sans labo**), ajoutez des blocs avec *+ Ajouter une activité* dans la limite du quota, puis validez avec **✅ Enregistrer tout**.
2. **Créer une activité** : *+ Nouvelle activité* → nom (un doublon de nom est signalé immédiatement), adresse facultative. Si des labos existent, choisissez **Avec labo** (puis sélectionnez lequel) ou **Sans labo** (gestion autonome). Quand tous les emplacements prévus par votre abonnement sont créés, LabFlow vous emmène automatiquement vers le Référentiel (page Unités) pour créer vos articles.
3. **Créer un labo** : nom, **référence unique** (demandée uniquement à la création), adresse ; vous pouvez cocher directement les activités sans labo à lui rattacher.
4. **Modifier** une activité ou un labo avec ✏️ ; le rattachement au labo se change dans la même fenêtre.

### Points d''attention

:::attention
La suppression est bloquée (message 🔒) tant que des articles sont affectés à l''activité ou au labo : retirez d''abord ces articles. La suppression d''un labo fait passer ses activités en gestion séparée et met fin aux transferts depuis ce labo. Ces suppressions sont irréversibles.
:::

:::astuce
Rattacher une activité à un labo signifie que ses produits transformés d''origine labo arriveront uniquement par transfert — c''est le mode de fonctionnement recommandé quand vous produisez en central.
:::

### Voir aussi

- [Compte, activités et labos](#compte-activites-labos) — le modèle général
- [Transferts labo → activité](#transferts)
- [Articles du référentiel](#referentiel-articles) — l''affectation des articles par activité
- [Mon abonnement](#abonnement) · [Comptes gérants](#gerants)',
'## 🏢 Activités & labos

Cet écran vous permet de créer et gérer vos **activités** (points de vente) et vos **labos** de production, dans la limite de votre abonnement. Vous le trouvez dans le menu latéral, entrée **Mes activités**. Un compte peut gérer une ou plusieurs activités, avec ou sans labo central.

### Ce que vous voyez

Le bandeau affiche vos **compteurs de quota** : activités utilisées / incluses, et labos utilisés / inclus si votre abonnement en prévoit. Une barre de recherche filtre activités et labos par nom.

- **Section Activités** : un tableau avec le *Nom*, l''*Adresse*, le *Labo* de rattachement (pastille 🏭 cliquable qui ouvre la fiche du labo) et les boutons ✏️ modifier / 🗑 supprimer. Le bouton **+ Nouvelle activité** est remplacé par **⚡ Ajouter activités** quand le quota est atteint : il ouvre alors une demande de supplément auprès du support.
- **Section Espace Labos** (si votre abonnement inclut au moins un labo) : tableau *Nom*, *Réf.*, *Adresse*, avec **+ Nouveau labo** ou **⚡ Ajouter labos** au quota atteint.

À la toute première visite, quand rien n''existe encore, un écran de démarrage propose **✨ Créer mon business** (si un labo est inclus) ou **+ Ajouter mon activité**.

### Actions pas à pas

1. **Premier démarrage avec le wizard « Créer mon business »** : à l''étape *Laboratoire*, saisissez le nom, la référence (unique) et l''adresse du labo — ou cochez *Passer cette étape*. À l''étape *Activités*, remplissez un bloc par activité (nom obligatoire, adresse, choix **Avec labo** / **Sans labo**), ajoutez des blocs avec *+ Ajouter une activité* dans la limite du quota, puis validez avec **✅ Enregistrer tout**.
2. **Créer une activité** : *+ Nouvelle activité* → nom (un doublon de nom est signalé immédiatement), adresse facultative. Si des labos existent, choisissez **Avec labo** (puis sélectionnez lequel) ou **Sans labo** (gestion autonome). Quand tous les emplacements prévus par votre abonnement sont créés, LabFlow vous emmène automatiquement vers le Référentiel (page Unités) pour créer vos articles.
3. **Créer un labo** : nom, **référence unique** (demandée uniquement à la création), adresse ; vous pouvez cocher directement les activités sans labo à lui rattacher.
4. **Modifier** une activité ou un labo avec ✏️ ; le rattachement au labo se change dans la même fenêtre.

### Points d''attention

:::attention
La suppression est bloquée (message 🔒) tant que des articles sont affectés à l''activité ou au labo : retirez d''abord ces articles. La suppression d''un labo fait passer ses activités en gestion séparée et met fin aux transferts depuis ce labo. Ces suppressions sont irréversibles.
:::

:::astuce
Rattacher une activité à un labo signifie que ses produits transformés d''origine labo arriveront uniquement par transfert — c''est le mode de fonctionnement recommandé quand vous produisez en central.
:::

### Voir aussi

- [Compte, activités et labos](#compte-activites-labos) — le modèle général
- [Transferts labo → activité](#transferts)
- [Articles du référentiel](#referentiel-articles) — l''affectation des articles par activité
- [Mon abonnement](#abonnement) · [Comptes gérants](#gerants)',
'activités, point de vente, labo, laboratoire, création, wizard, créer mon business, quota, abonnement, rattachement, suppression, adresse', '/client/activites', false)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('fournisseurs', 'Fournisseurs', '🚚', 'Gestion', 73,
'## 🚚 Fournisseurs

Deux écrans complémentaires gèrent vos fournisseurs : **Fournisseurs** (menu latéral 🚚) pour le répertoire général et ses affectations, et l''écran dédié **Fournisseurs Labo** (accessible à l''adresse `/client/fournisseurs-labo`) pour organiser, labo par labo, les fournisseurs disponibles à l''approvisionnement du stock labo.

### Ce que vous voyez

**Écran Fournisseurs** : le bandeau affiche le nombre total de fournisseurs. La barre de filtres permet une recherche par nom, téléphone ou adresse, et porte le bouton **+ Nouveau fournisseur**. Le tableau principal présente :

| Colonne | Contenu |
|---|---|
| Nom | Nom du fournisseur |
| Téléphone | Numéro de téléphone |
| Adresse | Adresse du fournisseur |
| Activités liées | Pastilles des activités où il est proposé à l''appro |
| Labos liés | Pastilles 🏭 des labos où il est proposé |
| Appros | Nombre d''approvisionnements enregistrés, détaillé par activité |
| Actions | ✏️ modifier · 🗑️ supprimer (uniquement s''il n''a aucun appro) |

Le tableau est paginé par 10. Une section à part, **🏭 Fournisseurs Labo (auto-gérés)**, liste les fournisseurs créés automatiquement pour chaque labo — c''est sous ce nom que les livraisons du labo apparaissent dans les appros de vos activités. Ils affichent leurs activités liées mais ne se modifient pas ici.

**Écran Fournisseurs Labo** : une carte par labo, avec la liste de tous vos fournisseurs sous forme de cases à cocher, un compteur « X fournisseurs assignés », un formulaire rapide **+ Nouveau fournisseur** (nom, téléphone, adresse) directement rattaché au labo, et un bouton **Enregistrer** qui valide les affectations. Une recherche filtre les labos par nom ou référence.

### Actions pas à pas

1. **Créer un fournisseur** : *+ Nouveau fournisseur* → nom (obligatoire), téléphone, adresse. À la création, toutes vos activités sont cochées par défaut : décochez celles qui ne travaillent pas avec lui, et cochez les labos concernés.
2. **Modifier les affectations** : ✏️ sur la ligne, puis cochez/décochez activités et labos.
3. **Organiser les fournisseurs d''un labo** : ouvrez *Fournisseurs Labo*, cochez les fournisseurs voulus sur la carte du labo, puis cliquez **Enregistrer**.
4. **Supprimer** : le bouton 🗑️ n''apparaît que si le fournisseur n''a servi à aucun approvisionnement ; une confirmation est demandée.

### Points d''attention

:::attention
Un fournisseur n''est proposé à l''approvisionnement que s''il est affecté à l''activité ou au labo concerné. Si vous ne le voyez pas dans la liste au moment d''une saisie, vérifiez ses affectations ici.
:::

:::astuce
Renseignez le téléphone : il s''affiche dans les listes et facilite les commandes. La colonne Appros vous montre d''un coup d''œil quels fournisseurs sont réellement actifs.
:::

### Voir aussi

- [Stock des activités](#stock-activites) et [Stock du labo](#stock-labo) — où l''on choisit le fournisseur à l''appro
- [Factures d''approvisionnement](#factures)
- [Historique des mouvements](#historique) · [Transferts](#transferts)',
'## 🚚 Fournisseurs

Deux écrans complémentaires gèrent vos fournisseurs : **Fournisseurs** (menu latéral 🚚) pour le répertoire général et ses affectations, et l''écran dédié **Fournisseurs Labo** (accessible à l''adresse `/client/fournisseurs-labo`) pour organiser, labo par labo, les fournisseurs disponibles à l''approvisionnement du stock labo.

### Ce que vous voyez

**Écran Fournisseurs** : le bandeau affiche le nombre total de fournisseurs. La barre de filtres permet une recherche par nom, téléphone ou adresse, et porte le bouton **+ Nouveau fournisseur**. Le tableau principal présente :

| Colonne | Contenu |
|---|---|
| Nom | Nom du fournisseur |
| Téléphone | Numéro de téléphone |
| Adresse | Adresse du fournisseur |
| Activités liées | Pastilles des activités où il est proposé à l''appro |
| Labos liés | Pastilles 🏭 des labos où il est proposé |
| Appros | Nombre d''approvisionnements enregistrés, détaillé par activité |
| Actions | ✏️ modifier · 🗑️ supprimer (uniquement s''il n''a aucun appro) |

Le tableau est paginé par 10. Une section à part, **🏭 Fournisseurs Labo (auto-gérés)**, liste les fournisseurs créés automatiquement pour chaque labo — c''est sous ce nom que les livraisons du labo apparaissent dans les appros de vos activités. Ils affichent leurs activités liées mais ne se modifient pas ici.

**Écran Fournisseurs Labo** : une carte par labo, avec la liste de tous vos fournisseurs sous forme de cases à cocher, un compteur « X fournisseurs assignés », un formulaire rapide **+ Nouveau fournisseur** (nom, téléphone, adresse) directement rattaché au labo, et un bouton **Enregistrer** qui valide les affectations. Une recherche filtre les labos par nom ou référence.

### Actions pas à pas

1. **Créer un fournisseur** : *+ Nouveau fournisseur* → nom (obligatoire), téléphone, adresse. À la création, toutes vos activités sont cochées par défaut : décochez celles qui ne travaillent pas avec lui, et cochez les labos concernés.
2. **Modifier les affectations** : ✏️ sur la ligne, puis cochez/décochez activités et labos.
3. **Organiser les fournisseurs d''un labo** : ouvrez *Fournisseurs Labo*, cochez les fournisseurs voulus sur la carte du labo, puis cliquez **Enregistrer**.
4. **Supprimer** : le bouton 🗑️ n''apparaît que si le fournisseur n''a servi à aucun approvisionnement ; une confirmation est demandée.

### Points d''attention

:::attention
Un fournisseur n''est proposé à l''approvisionnement que s''il est affecté à l''activité ou au labo concerné. Si vous ne le voyez pas dans la liste au moment d''une saisie, vérifiez ses affectations ici.
:::

:::astuce
Renseignez le téléphone : il s''affiche dans les listes et facilite les commandes. La colonne Appros vous montre d''un coup d''œil quels fournisseurs sont réellement actifs.
:::

### Voir aussi

- [Stock des activités](#stock-activites) et [Stock du labo](#stock-labo) — où l''on choisit le fournisseur à l''appro
- [Factures d''approvisionnement](#factures)
- [Historique des mouvements](#historique) · [Transferts](#transferts)',
'fournisseurs, achats, approvisionnement, affectation, activités, labo, téléphone, adresse, traçabilité, appros, coordonnées', '/client/fournisseurs', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('gerants', 'Comptes gérants', '👥', 'Gestion', 74,
'## 👥 Comptes gérants

Cet écran vous permet de donner un accès LabFlow à vos collaborateurs : chaque **gérant** reçoit une invitation par email et ne voit que les activités et labos que vous lui affectez. Vous le trouvez dans le menu latéral, entrée **Gérants**.

### Ce que vous voyez

Le bandeau affiche le compteur **Gérants** (utilisés / inclus dans votre abonnement), le nombre de gérants **Actifs**, et le bouton **+ Nouveau gérant** — remplacé par la mention 🔒 *Limite atteinte* quand le quota est plein. Un bandeau jaune signale les **invitations en attente d''activation**.

Chaque gérant apparaît sous forme de carte avec :

- ses initiales, son nom, son email et son téléphone ;
- son statut : **● Actif** ou **○ Inactif**, plus **⏳ Invitation en attente** tant qu''il n''a pas activé son compte ;
- un badge **Gratuit** ou le montant facturé (en DT/mois) ;
- 📍 la liste de ses **affectations** (activités et labos) ;
- les actions : **✉️ Renvoyer** l''invitation (si non activée), **⏸ Désactiver** / **▶ Activer**, **🗑** supprimer.

### Actions pas à pas

1. Cliquez **+ Nouveau gérant** et renseignez le **nom**, le **téléphone** et l''**email** (tous obligatoires). La disponibilité de l''adresse email est vérifiée en direct : une adresse déjà utilisée est refusée.
2. Cochez les **activités et labos assignés** — au moins un est obligatoire. Le lien *✓ Tout* coche l''ensemble d''un clic.
3. Validez avec **✓ Créer et envoyer l''invitation** : le gérant reçoit un email et active son compte en cliquant sur le lien puis en définissant son mot de passe.
4. Tant que l''invitation n''est pas acceptée, le badge ⏳ reste affiché : utilisez **✉️ Renvoyer** si l''email s''est égaré.
5. Pour suspendre temporairement un accès, cliquez **⏸ Désactiver** (réversible à tout moment avec ▶ Activer). Pour retirer définitivement l''accès, utilisez 🗑 (une confirmation est demandée).

### Points d''attention

:::regle
Trois comptes gérants gratuits sont inclus. Au-delà, le formulaire vous prévient : chaque gérant supplémentaire est facturé 80 DT/mois et nécessite une validation de l''équipe LabFlow. Le nombre total reste plafonné par votre abonnement.
:::

:::attention
Le gérant ne voit que son périmètre : il travaille sur le stock, les appros, les pertes, les inventaires (et les ventes si le module est actif) de ses activités et labos affectés, mais n''a pas accès à la gestion des activités, des gérants, de l''abonnement ni des paiements.
:::

:::astuce
Créez un gérant par responsable de site plutôt qu''un compte partagé : les historiques gardent ainsi la trace de qui a fait quoi.
:::

### Voir aussi

- [Les rôles dans LabFlow](#roles) — client vs gérant en détail
- [Tableau de bord gérant](#dashboard-gerant) — ce que voit votre collaborateur
- [Activités & labos](#activites) · [Mon abonnement](#abonnement)',
'## 👥 Comptes gérants

Cet écran vous permet de donner un accès LabFlow à vos collaborateurs : chaque **gérant** reçoit une invitation par email et ne voit que les activités et labos que vous lui affectez. Vous le trouvez dans le menu latéral, entrée **Gérants**.

### Ce que vous voyez

Le bandeau affiche le compteur **Gérants** (utilisés / inclus dans votre abonnement), le nombre de gérants **Actifs**, et le bouton **+ Nouveau gérant** — remplacé par la mention 🔒 *Limite atteinte* quand le quota est plein. Un bandeau jaune signale les **invitations en attente d''activation**.

Chaque gérant apparaît sous forme de carte avec :

- ses initiales, son nom, son email et son téléphone ;
- son statut : **● Actif** ou **○ Inactif**, plus **⏳ Invitation en attente** tant qu''il n''a pas activé son compte ;
- un badge **Gratuit** ou le montant facturé (en DT/mois) ;
- 📍 la liste de ses **affectations** (activités et labos) ;
- les actions : **✉️ Renvoyer** l''invitation (si non activée), **⏸ Désactiver** / **▶ Activer**, **🗑** supprimer.

### Actions pas à pas

1. Cliquez **+ Nouveau gérant** et renseignez le **nom**, le **téléphone** et l''**email** (tous obligatoires). La disponibilité de l''adresse email est vérifiée en direct : une adresse déjà utilisée est refusée.
2. Cochez les **activités et labos assignés** — au moins un est obligatoire. Le lien *✓ Tout* coche l''ensemble d''un clic.
3. Validez avec **✓ Créer et envoyer l''invitation** : le gérant reçoit un email et active son compte en cliquant sur le lien puis en définissant son mot de passe.
4. Tant que l''invitation n''est pas acceptée, le badge ⏳ reste affiché : utilisez **✉️ Renvoyer** si l''email s''est égaré.
5. Pour suspendre temporairement un accès, cliquez **⏸ Désactiver** (réversible à tout moment avec ▶ Activer). Pour retirer définitivement l''accès, utilisez 🗑 (une confirmation est demandée).

### Points d''attention

:::regle
Trois comptes gérants gratuits sont inclus. Au-delà, le formulaire vous prévient : chaque gérant supplémentaire est facturé 80 DT/mois et nécessite une validation de l''équipe LabFlow. Le nombre total reste plafonné par votre abonnement.
:::

:::attention
Le gérant ne voit que son périmètre : il travaille sur le stock, les appros, les pertes, les inventaires (et les ventes si le module est actif) de ses activités et labos affectés, mais n''a pas accès à la gestion des activités, des gérants, de l''abonnement ni des paiements.
:::

:::astuce
Créez un gérant par responsable de site plutôt qu''un compte partagé : les historiques gardent ainsi la trace de qui a fait quoi.
:::

### Voir aussi

- [Les rôles dans LabFlow](#roles) — client vs gérant en détail
- [Tableau de bord gérant](#dashboard-gerant) — ce que voit votre collaborateur
- [Activités & labos](#activites) · [Mon abonnement](#abonnement)',
'gérants, collaborateurs, invitation, email, accès, affectation, activités, labos, désactiver, périmètre, délégation, mot de passe', '/client/gerants', false)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('abonnement', 'Mon abonnement', '💳', 'Gestion', 75,
'## 💳 Mon abonnement

Cet écran récapitule votre formule LabFlow : configuration incluse, tarifs, promotions actives, état du compte, contrat et module vente. Vous le trouvez en bas du menu latéral, entrée **Mon abonnement**.

### Ce que vous voyez

Le bandeau rappelle votre date de début d''abonnement et affiche l''**état du compte** :

| État | Signification |
|---|---|
| ✅ Actif | Compte pleinement opérationnel |
| ⚠️ Lecture seule | Paiement en attente — création et modification bloquées |
| 🚫 Suspendu | Compte suspendu, contactez l''administrateur |
| 📦 Archivé | Compte archivé suite à non-paiement |

- **⚙️ Votre configuration** : le nombre d''**activités**, de **labos** et de **gérants** inclus (mention *Non inclus* sinon), une éventuelle **prolongation** accordée en jours, et le bouton **📄 Contrat actif** qui télécharge votre contrat signé au format PDF (avec sa date).
- **💰 Votre tarification** : le détail de la **tarification mensuelle** poste par poste (activités, puis labos et gérants avec leur prix unitaire en DT) et le **Total mensuel**. Si une promotion s''applique, l''ancien prix apparaît barré avec la mention 🎉 *Promotion appliquée*. Le cas échéant, la section **Tarification onboarding** affiche les frais d''intégration (montant unique en DT) et leur statut (payé, en attente…).
- Des bandeaux **🏷️ Promotion — Supplément Activité / Labo / Gérant** apparaissent quand une promotion est active sur un supplément : gratuité, pourcentage de réduction ou prix fixe, avec sa date de fin ou la mention *Permanente*.
- **🛒 Module Vente** : son statut (✅ Actif / 🔒 Inactif). S''il est inactif, le bouton **🚀 Demander l''activation** envoie une demande à l''équipe LabFlow ; en attendant la validation, la mention ⏳ *Demande en attente* s''affiche.

### Actions pas à pas

1. **Télécharger votre contrat** : cliquez sur *📄 Contrat actif* dans la carte Configuration — le PDF signé s''enregistre sur votre appareil.
2. **Activer le module vente** : cliquez *🚀 Demander l''activation* ; l''équipe LabFlow valide la demande, puis l''Espace Vente apparaît dans votre menu.
3. **Demander plus d''activités, de labos ou de gérants** : la demande de supplément se fait depuis l''écran [Activités](#activites) (bouton ⚡ quand le quota est atteint) ou via le [support](#support). Les promotions de supplément affichées ici s''appliqueront au tarif.

### Points d''attention

:::attention
Un retard de paiement fait passer le compte en **lecture seule** (consultation possible, mais plus de saisie), puis peut mener à la suspension. Régularisez votre mensualité pour rétablir l''accès complet.
:::

:::astuce
Vérifiez les bandeaux de promotion avant de demander un supplément : une promotion active peut rendre l''ajout d''un labo ou d''un gérant temporairement gratuit ou remisé.
:::

### Voir aussi

- [Historique des paiements](#historique-paiements) — mensualités et factures
- [Le contrat d''onboarding](#onboarding-contrat) · [Avenants](#onboarding-avenants)
- [Activités & labos](#activites) · [Comptes gérants](#gerants) · [Support](#support)',
'## 💳 Mon abonnement

Cet écran récapitule votre formule LabFlow : configuration incluse, tarifs, promotions actives, état du compte, contrat et module vente. Vous le trouvez en bas du menu latéral, entrée **Mon abonnement**.

### Ce que vous voyez

Le bandeau rappelle votre date de début d''abonnement et affiche l''**état du compte** :

| État | Signification |
|---|---|
| ✅ Actif | Compte pleinement opérationnel |
| ⚠️ Lecture seule | Paiement en attente — création et modification bloquées |
| 🚫 Suspendu | Compte suspendu, contactez l''administrateur |
| 📦 Archivé | Compte archivé suite à non-paiement |

- **⚙️ Votre configuration** : le nombre d''**activités**, de **labos** et de **gérants** inclus (mention *Non inclus* sinon), une éventuelle **prolongation** accordée en jours, et le bouton **📄 Contrat actif** qui télécharge votre contrat signé au format PDF (avec sa date).
- **💰 Votre tarification** : le détail de la **tarification mensuelle** poste par poste (activités, puis labos et gérants avec leur prix unitaire en DT) et le **Total mensuel**. Si une promotion s''applique, l''ancien prix apparaît barré avec la mention 🎉 *Promotion appliquée*. Le cas échéant, la section **Tarification onboarding** affiche les frais d''intégration (montant unique en DT) et leur statut (payé, en attente…).
- Des bandeaux **🏷️ Promotion — Supplément Activité / Labo / Gérant** apparaissent quand une promotion est active sur un supplément : gratuité, pourcentage de réduction ou prix fixe, avec sa date de fin ou la mention *Permanente*.
- **🛒 Module Vente** : son statut (✅ Actif / 🔒 Inactif). S''il est inactif, le bouton **🚀 Demander l''activation** envoie une demande à l''équipe LabFlow ; en attendant la validation, la mention ⏳ *Demande en attente* s''affiche.

### Actions pas à pas

1. **Télécharger votre contrat** : cliquez sur *📄 Contrat actif* dans la carte Configuration — le PDF signé s''enregistre sur votre appareil.
2. **Activer le module vente** : cliquez *🚀 Demander l''activation* ; l''équipe LabFlow valide la demande, puis l''Espace Vente apparaît dans votre menu.
3. **Demander plus d''activités, de labos ou de gérants** : la demande de supplément se fait depuis l''écran [Activités](#activites) (bouton ⚡ quand le quota est atteint) ou via le [support](#support). Les promotions de supplément affichées ici s''appliqueront au tarif.

### Points d''attention

:::attention
Un retard de paiement fait passer le compte en **lecture seule** (consultation possible, mais plus de saisie), puis peut mener à la suspension. Régularisez votre mensualité pour rétablir l''accès complet.
:::

:::astuce
Vérifiez les bandeaux de promotion avant de demander un supplément : une promotion active peut rendre l''ajout d''un labo ou d''un gérant temporairement gratuit ou remisé.
:::

### Voir aussi

- [Historique des paiements](#historique-paiements) — mensualités et factures
- [Le contrat d''onboarding](#onboarding-contrat) · [Avenants](#onboarding-avenants)
- [Activités & labos](#activites) · [Comptes gérants](#gerants) · [Support](#support)',
'abonnement, tarification, mensualité, configuration, contrat, promotion, module vente, lecture seule, suspendu, onboarding, supplément, formule', '/client/abonnement', false)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('historique-paiements', 'Historique des paiements', '🧾', 'Gestion', 76,
'## 🧾 Historique des paiements

Cet écran retrace toutes les mensualités de votre abonnement : ce qui est payé, ce qui arrive, ce qui est en retard — avec vos factures téléchargeables. Vous le trouvez en bas du menu latéral, entrée **Historique paiements**.

### Ce que vous voyez

- **📅 Prochaines échéances** : un encadré liste jusqu''à trois mensualités à venir, avec le mois, le montant en DT et le badge *En attente*. Il n''apparaît que s''il y a des échéances futures.
- Une **barre de filtres** : *Mois / Année* (sélecteur de mois) et *Statut*, avec un compteur d''enregistrements et un bouton de réinitialisation.
- Le **tableau d''historique** :

| Colonne | Contenu |
|---|---|
| Mois | Le mois de la mensualité (ex. « janvier 2026 ») |
| Montant | Le montant en DT, ou la mention *Gratuit* |
| Statut | Payé · Impayé · En attente · Remisé · Gratuit |
| Date paiement | La date d''encaissement, quand elle existe |
| Facture | Bouton 🧾 *Facture* pour les mensualités payées |

Les statuts se lisent ainsi : **Payé** (réglé, avec sa date), **En attente** (mois courant ou à venir, pas encore réglé), **Impayé** (mois passé non réglé), **Remisé** (mensualité couverte par une remise) et **Gratuit** (mensualité offerte, dans le cadre d''une promotion par exemple).

### Actions pas à pas

1. **Télécharger une facture** : sur la ligne d''une mensualité *Payé*, cliquez le bouton **🧾 Facture** — le PDF s''enregistre sur votre appareil. Si la facture n''est pas disponible pour ce paiement, un message vous l''indique.
2. **Retrouver un mois précis** : utilisez le filtre *Mois / Année*, puis affinez avec le filtre *Statut* si besoin.
3. **Anticiper les échéances** : consultez l''encadré *Prochaines échéances* en haut de page pour connaître les montants attendus des prochains mois.
4. **Repartir de zéro** : le bouton de réinitialisation efface les filtres et réaffiche tout l''historique.

### Points d''attention

:::attention
Une mensualité passée non réglée bascule automatiquement en **Impayé**. Les impayés font passer votre compte en lecture seule puis peuvent mener à sa suspension : consultez l''écran [Mon abonnement](#abonnement) pour connaître l''état exact de votre compte.
:::

:::astuce
Le bouton Facture n''existe que pour les mensualités payées : téléchargez-les au fil de l''eau pour votre comptabilité plutôt que de les rechercher en fin d''exercice.
:::

### Voir aussi

- [Mon abonnement](#abonnement) — tarification, promotions et état du compte
- [Le contrat d''onboarding](#onboarding-contrat)
- [Support](#support) — en cas de désaccord sur une mensualité',
'## 🧾 Historique des paiements

Cet écran retrace toutes les mensualités de votre abonnement : ce qui est payé, ce qui arrive, ce qui est en retard — avec vos factures téléchargeables. Vous le trouvez en bas du menu latéral, entrée **Historique paiements**.

### Ce que vous voyez

- **📅 Prochaines échéances** : un encadré liste jusqu''à trois mensualités à venir, avec le mois, le montant en DT et le badge *En attente*. Il n''apparaît que s''il y a des échéances futures.
- Une **barre de filtres** : *Mois / Année* (sélecteur de mois) et *Statut*, avec un compteur d''enregistrements et un bouton de réinitialisation.
- Le **tableau d''historique** :

| Colonne | Contenu |
|---|---|
| Mois | Le mois de la mensualité (ex. « janvier 2026 ») |
| Montant | Le montant en DT, ou la mention *Gratuit* |
| Statut | Payé · Impayé · En attente · Remisé · Gratuit |
| Date paiement | La date d''encaissement, quand elle existe |
| Facture | Bouton 🧾 *Facture* pour les mensualités payées |

Les statuts se lisent ainsi : **Payé** (réglé, avec sa date), **En attente** (mois courant ou à venir, pas encore réglé), **Impayé** (mois passé non réglé), **Remisé** (mensualité couverte par une remise) et **Gratuit** (mensualité offerte, dans le cadre d''une promotion par exemple).

### Actions pas à pas

1. **Télécharger une facture** : sur la ligne d''une mensualité *Payé*, cliquez le bouton **🧾 Facture** — le PDF s''enregistre sur votre appareil. Si la facture n''est pas disponible pour ce paiement, un message vous l''indique.
2. **Retrouver un mois précis** : utilisez le filtre *Mois / Année*, puis affinez avec le filtre *Statut* si besoin.
3. **Anticiper les échéances** : consultez l''encadré *Prochaines échéances* en haut de page pour connaître les montants attendus des prochains mois.
4. **Repartir de zéro** : le bouton de réinitialisation efface les filtres et réaffiche tout l''historique.

### Points d''attention

:::attention
Une mensualité passée non réglée bascule automatiquement en **Impayé**. Les impayés font passer votre compte en lecture seule puis peuvent mener à sa suspension : consultez l''écran [Mon abonnement](#abonnement) pour connaître l''état exact de votre compte.
:::

:::astuce
Le bouton Facture n''existe que pour les mensualités payées : téléchargez-les au fil de l''eau pour votre comptabilité plutôt que de les rechercher en fin d''exercice.
:::

### Voir aussi

- [Mon abonnement](#abonnement) — tarification, promotions et état du compte
- [Le contrat d''onboarding](#onboarding-contrat)
- [Support](#support) — en cas de désaccord sur une mensualité',
'paiements, mensualités, échéances, facture, payé, impayé, en attente, remisé, gratuit, téléchargement, abonnement, historique', '/client/historique-paiement', false)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('rapports', 'Rapport activités', '📈', 'Gestion', 77,
'## 📈 Rapport activités

Le rapport activités consolide, sur la période de votre choix, le **stock**, les **achats** et les **pertes** de vos points de vente — toutes activités confondues ou une seule. Vous le trouvez dans le menu latéral, entrée **Rapports** (aussi proposé dans la section Espace Activités sous le nom *Rapport activités*).

### Ce que vous voyez

La barre de filtres propose :

- **Période** : *Mois en cours*, *30 jours*, *Trimestre* ou *Personnalisé* (deux dates libres).
- **Activité** : *Toutes activités* ou une activité précise (le sélecteur apparaît dès que vous en gérez plusieurs).
- **Catégorie** : toutes les catégories d''articles ou une seule, pour cibler l''analyse.

Quatre **indicateurs** résument la période :

| Indicateur | Lecture |
|---|---|
| Valeur du stock | Valorisation du stock en DT |
| Achats (appros) | Montant des approvisionnements et nombre d''entrées |
| Pertes | Montant perdu — signalé en rouge dès qu''il y en a |
| Articles en alerte | Nombre d''articles sous leur seuil minimum (orange dès 1, rouge au-delà de 5) |

Quatre **graphiques** détaillent la répartition : *Stock par catégorie*, *Pertes par catégorie*, *Achats par catégorie* et *Pertes par type* (Avarie / Déchet). Enfin, le tableau **⚠️ Articles sous le seuil minimum** liste les articles en alerte (les 15 plus critiques) avec leur catégorie, leur stock actuel et leur seuil.

### Actions pas à pas

1. Choisissez la **période** : commencez par *Mois en cours*, puis élargissez au *Trimestre* pour dégager les tendances.
2. Comparez vos points de vente en sélectionnant les **activités** une à une dans le filtre.
3. Zoomez sur une **catégorie** (viandes, laitages…) pour comprendre d''où viennent les achats ou les pertes.
4. Traitez le tableau des **articles sous le seuil** : c''est votre liste de réapprovisionnement prioritaire.

### Points d''attention

:::regle
Tous les montants du rapport sont exprimés en DT **TTC**. La valeur du stock correspond aux quantités en stock valorisées au dernier prix d''approvisionnement connu.
:::

:::attention
Ce rapport couvre les activités uniquement : pour le laboratoire, utilisez le [Rapport labo](#rapports-labo) ; pour l''analyse des ventes (CA, food cost, top produits), utilisez le [Rapport ventes](#rapports-vente).
:::

:::astuce
Un montant de pertes élevé dans une seule catégorie oriente immédiatement l''action : croisez le graphique *Pertes par catégorie* avec le détail de l''écran [Pertes](#pertes) pour identifier les articles en cause.
:::

### Voir aussi

- [Tableau de bord](#dashboard) — la vue d''ensemble quotidienne
- [Rapport labo](#rapports-labo) · [Rapport ventes](#rapports-vente)
- [Valeur de stock](#calc-valeur-stock) · [Prix moyen pondéré](#calc-pmp) · [Seuils de stock](#calc-seuils)
- [Pertes](#pertes) · [Historique des mouvements](#historique)',
'## 📈 Rapport activités

Le rapport activités consolide, sur la période de votre choix, le **stock**, les **achats** et les **pertes** de vos points de vente — toutes activités confondues ou une seule. Vous le trouvez dans le menu latéral, entrée **Rapports** (aussi proposé dans la section Espace Activités sous le nom *Rapport activités*).

### Ce que vous voyez

La barre de filtres propose :

- **Période** : *Mois en cours*, *30 jours*, *Trimestre* ou *Personnalisé* (deux dates libres).
- **Activité** : *Toutes activités* ou une activité précise (le sélecteur apparaît dès que vous en gérez plusieurs).
- **Catégorie** : toutes les catégories d''articles ou une seule, pour cibler l''analyse.

Quatre **indicateurs** résument la période :

| Indicateur | Lecture |
|---|---|
| Valeur du stock | Valorisation du stock en DT |
| Achats (appros) | Montant des approvisionnements et nombre d''entrées |
| Pertes | Montant perdu — signalé en rouge dès qu''il y en a |
| Articles en alerte | Nombre d''articles sous leur seuil minimum (orange dès 1, rouge au-delà de 5) |

Quatre **graphiques** détaillent la répartition : *Stock par catégorie*, *Pertes par catégorie*, *Achats par catégorie* et *Pertes par type* (Avarie / Déchet). Enfin, le tableau **⚠️ Articles sous le seuil minimum** liste les articles en alerte (les 15 plus critiques) avec leur catégorie, leur stock actuel et leur seuil.

### Actions pas à pas

1. Choisissez la **période** : commencez par *Mois en cours*, puis élargissez au *Trimestre* pour dégager les tendances.
2. Comparez vos points de vente en sélectionnant les **activités** une à une dans le filtre.
3. Zoomez sur une **catégorie** (viandes, laitages…) pour comprendre d''où viennent les achats ou les pertes.
4. Traitez le tableau des **articles sous le seuil** : c''est votre liste de réapprovisionnement prioritaire.

### Points d''attention

:::regle
Tous les montants du rapport sont exprimés en DT **TTC**. La valeur du stock correspond aux quantités en stock valorisées au dernier prix d''approvisionnement connu.
:::

:::attention
Ce rapport couvre les activités uniquement : pour le laboratoire, utilisez le [Rapport labo](#rapports-labo) ; pour l''analyse des ventes (CA, food cost, top produits), utilisez le [Rapport ventes](#rapports-vente).
:::

:::astuce
Un montant de pertes élevé dans une seule catégorie oriente immédiatement l''action : croisez le graphique *Pertes par catégorie* avec le détail de l''écran [Pertes](#pertes) pour identifier les articles en cause.
:::

### Voir aussi

- [Tableau de bord](#dashboard) — la vue d''ensemble quotidienne
- [Rapport labo](#rapports-labo) · [Rapport ventes](#rapports-vente)
- [Valeur de stock](#calc-valeur-stock) · [Prix moyen pondéré](#calc-pmp) · [Seuils de stock](#calc-seuils)
- [Pertes](#pertes) · [Historique des mouvements](#historique)',
'rapport, synthèse, stock, achats, approvisionnements, pertes, avarie, déchet, catégorie, seuil, période, valeur stock, consolidé', '/client/rapports', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('calc-cout-recette', 'Coût de revient d''une recette', '🧮', 'Comprendre les calculs', 80,
'## 🧮 Le coût de revient d''une recette

Le coût de revient d''une fiche technique est la somme de ce que coûtent ses composants : chaque ingrédient compte pour sa portion multipliée par son prix unitaire TTC, et chaque sous-produit transformé compte pour sa portion multipliée par son propre coût de revient, calculé de la même façon. Le calcul descend ainsi dans la recette du sous-produit, puis de ses éventuels sous-produits, jusqu''au dernier ingrédient.

### Les paramètres qui influencent le résultat

- **Les portions de la recette** : la quantité de chaque ingrédient et de chaque sous-produit nécessaire pour une unité produite.
- **Le prix unitaire de chaque ingrédient**, selon le mode choisi au moment de générer la fiche technique (carte *FP Stock* avec ses boutons *DP* / *MP*, ou carte *FP Manuel*) :
  - **Prix moyen pondéré (PMP)** — bouton *MP* : la moyenne pondérée des prix TTC de vos achats (et transferts reçus, côté activité) depuis le dernier inventaire — voir [Le prix moyen pondéré](#calc-pmp). C''est ce prix qui sert à valoriser les productions.
  - **Dernier prix** — bouton *DP* : le dernier prix TTC enregistré pour l''article.
  - **Prix manuel** — carte *FP Manuel* : un prix que vous saisissez vous-même sur la fiche technique, pour simuler un coût.
- **Le lieu de fabrication** : pour un produit fabriqué au labo, les prix proviennent du stock du labo ; pour un produit d''activité, ils proviennent du stock de l''activité, avec repli sur les prix du labo lié quand l''article n''a pas encore de prix côté activité.
- **Les portions personnalisées** : au moment d''une production, vous pouvez ajuster ponctuellement les quantités réellement consommées ; les déductions de stock suivent ces quantités, sans modifier la fiche technique (l''entrée du produit fini reste valorisée au coût de la recette standard).

:::formule Coût de revient d''une recette
Coût total = somme(portion ingrédient × prix unitaire TTC) + somme(portion sous-produit × coût de revient du sous-produit)
note: le coût de chaque sous-produit est calculé récursivement avec la même règle, aux mêmes prix.
:::

:::exemple
Recette « Tarte aux fraises » (pour 1 tarte), valorisée au PMP TTC de l''activité :

- Farine : 0,250 kg × 2,400 DT/kg = 0,600 DT
- Fraises : 0,300 kg × 8,000 DT/kg = 2,400 DT
- Sucre : 0,100 kg × 3,200 DT/kg = 0,320 DT
- Crème pâtissière (sous-produit) : 0,500 unité × 4,440 DT/unité = 2,220 DT

Le coût de la crème pâtissière (4,440 DT) est lui-même calculé à partir de sa propre recette : lait 0,500 L × 2,000 DT = 1,000 DT ; œufs 4 pièces × 0,700 DT = 2,800 DT ; sucre 0,200 kg × 3,200 DT = 0,640 DT.

**Coût de revient de la tarte = 0,600 + 2,400 + 0,320 + 2,220 = 5,540 DT TTC.**
:::

### Ce qui peut faire varier le résultat

- Chaque nouvel achat à un prix différent déplace le PMP, donc le coût de revient recalculé.
- Un inventaire redémarre la période de calcul du PMP : le coût peut évoluer juste après.
- Si un ingrédient n''a encore aucun prix connu (jamais approvisionné), sa part est comptée à zéro : le coût affiché est alors incomplet.
- La modification ou la suppression d''une ligne d''approvisionnement passée change le PMP, donc le coût, rétroactivement.
- Une recette ne peut pas se contenir elle-même (directement ou via ses sous-produits) : le calcul le refuse.

### Voir aussi

- [Fiches techniques](#fiches-techniques)
- [Le prix moyen pondéré](#calc-pmp)
- [La production d''un produit transformé](#calc-production-pt)
- [HT et TTC](#calc-ht-ttc)
- [Lexique des produits transformés](#lexique-pt)',
'## 🧮 Le coût de revient d''une recette

Le coût de revient d''une fiche technique est la somme de ce que coûtent ses composants : chaque ingrédient compte pour sa portion multipliée par son prix unitaire TTC, et chaque sous-produit transformé compte pour sa portion multipliée par son propre coût de revient, calculé de la même façon. Le calcul descend ainsi dans la recette du sous-produit, puis de ses éventuels sous-produits, jusqu''au dernier ingrédient.

### Les paramètres qui influencent le résultat

- **Les portions de la recette** : la quantité de chaque ingrédient et de chaque sous-produit nécessaire pour une unité produite.
- **Le prix unitaire de chaque ingrédient**, selon le mode choisi au moment de générer la fiche technique (carte *FP Stock* avec ses boutons *DP* / *MP*, ou carte *FP Manuel*) :
  - **Prix moyen pondéré (PMP)** — bouton *MP* : la moyenne pondérée des prix TTC de vos achats (et transferts reçus, côté activité) depuis le dernier inventaire — voir [Le prix moyen pondéré](#calc-pmp). C''est ce prix qui sert à valoriser les productions.
  - **Dernier prix** — bouton *DP* : le dernier prix TTC enregistré pour l''article.
  - **Prix manuel** — carte *FP Manuel* : un prix que vous saisissez vous-même sur la fiche technique, pour simuler un coût.
- **Le lieu de fabrication** : pour un produit fabriqué au labo, les prix proviennent du stock du labo ; pour un produit d''activité, ils proviennent du stock de l''activité, avec repli sur les prix du labo lié quand l''article n''a pas encore de prix côté activité.
- **Les portions personnalisées** : au moment d''une production, vous pouvez ajuster ponctuellement les quantités réellement consommées ; les déductions de stock suivent ces quantités, sans modifier la fiche technique (l''entrée du produit fini reste valorisée au coût de la recette standard).

:::formule Coût de revient d''une recette
Coût total = somme(portion ingrédient × prix unitaire TTC) + somme(portion sous-produit × coût de revient du sous-produit)
note: le coût de chaque sous-produit est calculé récursivement avec la même règle, aux mêmes prix.
:::

:::exemple
Recette « Tarte aux fraises » (pour 1 tarte), valorisée au PMP TTC de l''activité :

- Farine : 0,250 kg × 2,400 DT/kg = 0,600 DT
- Fraises : 0,300 kg × 8,000 DT/kg = 2,400 DT
- Sucre : 0,100 kg × 3,200 DT/kg = 0,320 DT
- Crème pâtissière (sous-produit) : 0,500 unité × 4,440 DT/unité = 2,220 DT

Le coût de la crème pâtissière (4,440 DT) est lui-même calculé à partir de sa propre recette : lait 0,500 L × 2,000 DT = 1,000 DT ; œufs 4 pièces × 0,700 DT = 2,800 DT ; sucre 0,200 kg × 3,200 DT = 0,640 DT.

**Coût de revient de la tarte = 0,600 + 2,400 + 0,320 + 2,220 = 5,540 DT TTC.**
:::

### Ce qui peut faire varier le résultat

- Chaque nouvel achat à un prix différent déplace le PMP, donc le coût de revient recalculé.
- Un inventaire redémarre la période de calcul du PMP : le coût peut évoluer juste après.
- Si un ingrédient n''a encore aucun prix connu (jamais approvisionné), sa part est comptée à zéro : le coût affiché est alors incomplet.
- La modification ou la suppression d''une ligne d''approvisionnement passée change le PMP, donc le coût, rétroactivement.
- Une recette ne peut pas se contenir elle-même (directement ou via ses sous-produits) : le calcul le refuse.

### Voir aussi

- [Fiches techniques](#fiches-techniques)
- [Le prix moyen pondéré](#calc-pmp)
- [La production d''un produit transformé](#calc-production-pt)
- [HT et TTC](#calc-ht-ttc)
- [Lexique des produits transformés](#lexique-pt)',
'coût de revient, recette, fiche technique, pmp, prix moyen, dernier prix, prix manuel, sous-produit, portion, ingrédient, coût matière, valorisation', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('calc-valeur-stock', 'Valeur du stock', '💰', 'Comprendre les calculs', 81,
'## 💰 La valeur du stock actuel

La valeur de votre stock est calculée ligne par ligne : quantité actuelle × coût unitaire moyen TTC. La quantité actuelle repart toujours du **dernier inventaire** : on prend la quantité comptée ce jour-là, puis on ajoute et retranche tous les mouvements survenus depuis. S''il n''y a jamais eu d''inventaire, tous les mouvements depuis l''origine sont pris en compte.

### Les paramètres qui influencent le résultat

- **Le dernier inventaire** : quantité comptée et date (point de départ du calcul).
- **Les mouvements depuis cette date** : achats, transferts, consommations de production, ventes, pertes.
- **Les prix TTC des entrées**, qui déterminent le coût moyen (voir [Le prix moyen pondéré](#calc-pmp)).
- **La nature de la ligne** (article ou produit transformé) et **le lieu** (activité ou labo) :

| Où | Quantité actuelle |
|---|---|
| Article en activité | inventaire + achats + transferts reçus − consommations de production − ventes − pertes |
| Article au labo | inventaire + achats − consommations de production − transferts envoyés − pertes |
| Produit transformé en activité | inventaire + réceptions (transferts ou productions) − ventes − consommations en sous-produit − pertes |
| Produit transformé au labo | inventaire + productions − consommations en sous-produit − transferts envoyés − pertes |

Pour la valorisation :

- **Article** : valeur = quantité actuelle × PMP TTC. Le dernier prix reçu (achat ou transfert) est affiché à titre d''information, mais la valeur totale est bien calculée au coût moyen pondéré.
- **Produit transformé** : chaque entrée porte son coût — coût de recette pour une production, prix de cession TTC pour une réception de transfert ; la valeur = quantité actuelle × moyenne des coûts des entrées depuis le dernier inventaire. À défaut d''entrée valorisée depuis l''inventaire, la moyenne de toutes les entrées sert de base ; en dernier recours, le dernier coût de réception connu ou le coût de recette actuel.

:::formule Valeur du stock d''un article
Valeur = quantité actuelle × PMP TTC
note: quantité actuelle = quantité d''inventaire + entrées − sorties depuis le dernier inventaire ; sans inventaire, tous les mouvements depuis l''origine.
:::

:::exemple
Farine dans une activité, dernier inventaire le 30/06 : **12,000 kg comptés**. Depuis :

- achats : +25,000 kg à 2,400 DT TTC le kg
- consommations de production : −6,000 kg
- ventes : −4,500 kg
- pertes : −1,500 kg

Quantité actuelle = 12,000 + 25,000 − 6,000 − 4,500 − 1,500 = **25,000 kg**.

Aucun achat n''avait été enregistré avant cet inventaire : seul l''achat de 25 kg à 2,400 DT entre dans le coût moyen, donc PMP = 2,400 DT TTC.

**Valeur du stock = 25,000 kg × 2,400 DT = 60,000 DT TTC.**
:::

### Ce qui peut faire varier le résultat

- Un nouvel inventaire remplace la base de calcul : la quantité repart de la valeur comptée.
- La quantité comptée à l''inventaire est valorisée à son coût moyen d''avant l''inventaire quand il existe ; sinon elle compte dans la quantité mais pas dans le coût moyen.
- Si la quantité actuelle est nulle ou négative, la valeur affichée est 0.
- Modifier ou supprimer un mouvement passé (achat, transfert, perte) recalcule immédiatement quantité et valeur.
- Les quantités sont arrondies au millième (trois décimales).

### Voir aussi

- [Stock des activités](#stock-activites)
- [Stock du labo](#stock-labo)
- [Inventaire](#inventaire)
- [Le prix moyen pondéré](#calc-pmp)
- [Pertes](#pertes)',
'## 💰 La valeur du stock actuel

La valeur de votre stock est calculée ligne par ligne : quantité actuelle × coût unitaire moyen TTC. La quantité actuelle repart toujours du **dernier inventaire** : on prend la quantité comptée ce jour-là, puis on ajoute et retranche tous les mouvements survenus depuis. S''il n''y a jamais eu d''inventaire, tous les mouvements depuis l''origine sont pris en compte.

### Les paramètres qui influencent le résultat

- **Le dernier inventaire** : quantité comptée et date (point de départ du calcul).
- **Les mouvements depuis cette date** : achats, transferts, consommations de production, ventes, pertes.
- **Les prix TTC des entrées**, qui déterminent le coût moyen (voir [Le prix moyen pondéré](#calc-pmp)).
- **La nature de la ligne** (article ou produit transformé) et **le lieu** (activité ou labo) :

| Où | Quantité actuelle |
|---|---|
| Article en activité | inventaire + achats + transferts reçus − consommations de production − ventes − pertes |
| Article au labo | inventaire + achats − consommations de production − transferts envoyés − pertes |
| Produit transformé en activité | inventaire + réceptions (transferts ou productions) − ventes − consommations en sous-produit − pertes |
| Produit transformé au labo | inventaire + productions − consommations en sous-produit − transferts envoyés − pertes |

Pour la valorisation :

- **Article** : valeur = quantité actuelle × PMP TTC. Le dernier prix reçu (achat ou transfert) est affiché à titre d''information, mais la valeur totale est bien calculée au coût moyen pondéré.
- **Produit transformé** : chaque entrée porte son coût — coût de recette pour une production, prix de cession TTC pour une réception de transfert ; la valeur = quantité actuelle × moyenne des coûts des entrées depuis le dernier inventaire. À défaut d''entrée valorisée depuis l''inventaire, la moyenne de toutes les entrées sert de base ; en dernier recours, le dernier coût de réception connu ou le coût de recette actuel.

:::formule Valeur du stock d''un article
Valeur = quantité actuelle × PMP TTC
note: quantité actuelle = quantité d''inventaire + entrées − sorties depuis le dernier inventaire ; sans inventaire, tous les mouvements depuis l''origine.
:::

:::exemple
Farine dans une activité, dernier inventaire le 30/06 : **12,000 kg comptés**. Depuis :

- achats : +25,000 kg à 2,400 DT TTC le kg
- consommations de production : −6,000 kg
- ventes : −4,500 kg
- pertes : −1,500 kg

Quantité actuelle = 12,000 + 25,000 − 6,000 − 4,500 − 1,500 = **25,000 kg**.

Aucun achat n''avait été enregistré avant cet inventaire : seul l''achat de 25 kg à 2,400 DT entre dans le coût moyen, donc PMP = 2,400 DT TTC.

**Valeur du stock = 25,000 kg × 2,400 DT = 60,000 DT TTC.**
:::

### Ce qui peut faire varier le résultat

- Un nouvel inventaire remplace la base de calcul : la quantité repart de la valeur comptée.
- La quantité comptée à l''inventaire est valorisée à son coût moyen d''avant l''inventaire quand il existe ; sinon elle compte dans la quantité mais pas dans le coût moyen.
- Si la quantité actuelle est nulle ou négative, la valeur affichée est 0.
- Modifier ou supprimer un mouvement passé (achat, transfert, perte) recalcule immédiatement quantité et valeur.
- Les quantités sont arrondies au millième (trois décimales).

### Voir aussi

- [Stock des activités](#stock-activites)
- [Stock du labo](#stock-labo)
- [Inventaire](#inventaire)
- [Le prix moyen pondéré](#calc-pmp)
- [Pertes](#pertes)',
'valeur du stock, quantité, inventaire, stock actuel, pmp, pertes, transferts, ventes, valorisation, coût moyen, article, produit transformé', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('calc-pmp', 'Prix moyen pondéré (PMP)', '⚖️', 'Comprendre les calculs', 82,
'## ⚖️ Le prix moyen pondéré (PMP)

Le PMP d''un article est son coût unitaire moyen réel, pondéré par les quantités reçues. Il est calculé sur les **entrées valorisées depuis le dernier inventaire** : les achats saisis à la main et, côté activité, les transferts reçus du labo (au prix de cession TTC du transfert, proposé par défaut au prix du labo). Tous les prix sont pris en TTC.

Le PMP n''est **jamais figé** : il n''est stocké nulle part, il est recalculé en direct à partir des lignes d''approvisionnement à chaque affichage. C''est lui qui valorise le stock, les coûts de recette et les déductions d''ingrédients à la production.

### Les paramètres qui influencent le résultat

- **Les achats depuis le dernier inventaire** : quantité et prix TTC de chaque ligne.
- **Les transferts reçus du labo** (côté activité uniquement), comptés au prix de cession TTC du transfert — proposé par défaut au prix du labo, ajustable à l''envoi.
- **La date du dernier inventaire**, qui borne la période de calcul.
- **Le repli labo** : si l''activité n''a encore reçu aucun approvisionnement d''un article, le coût de recette utilise le PMP du labo lié.

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

L''achat de 15 kg pèse davantage dans la moyenne que le transfert de 5 kg : c''est le principe de la pondération.
:::

### Ce qui peut faire varier le résultat

- Chaque nouvel achat déplace la moyenne — un gros volume à prix différent la déplace beaucoup, un petit volume très peu.
- Un inventaire redémarre le calcul : seules les entrées postérieures à sa date comptent. Pour la valeur du stock, la quantité comptée reste toutefois valorisée à son coût moyen d''avant inventaire quand il existe.
- Ne comptent **pas** dans le PMP : les consommations de production, les ventes, les pertes et les lignes sans prix.
- Modifier ou supprimer une ligne d''achat passée recalcule le PMP immédiatement, y compris pour les écrans déjà consultés.
- Au labo, seuls les achats saisis au labo comptent : les transferts y sont des sorties, pas des entrées.

### Voir aussi

- [La valeur du stock](#calc-valeur-stock)
- [Le coût de revient d''une recette](#calc-cout-recette)
- [Transferts](#transferts)
- [Inventaire](#inventaire)
- [HT et TTC](#calc-ht-ttc)',
'## ⚖️ Le prix moyen pondéré (PMP)

Le PMP d''un article est son coût unitaire moyen réel, pondéré par les quantités reçues. Il est calculé sur les **entrées valorisées depuis le dernier inventaire** : les achats saisis à la main et, côté activité, les transferts reçus du labo (au prix de cession TTC du transfert, proposé par défaut au prix du labo). Tous les prix sont pris en TTC.

Le PMP n''est **jamais figé** : il n''est stocké nulle part, il est recalculé en direct à partir des lignes d''approvisionnement à chaque affichage. C''est lui qui valorise le stock, les coûts de recette et les déductions d''ingrédients à la production.

### Les paramètres qui influencent le résultat

- **Les achats depuis le dernier inventaire** : quantité et prix TTC de chaque ligne.
- **Les transferts reçus du labo** (côté activité uniquement), comptés au prix de cession TTC du transfert — proposé par défaut au prix du labo, ajustable à l''envoi.
- **La date du dernier inventaire**, qui borne la période de calcul.
- **Le repli labo** : si l''activité n''a encore reçu aucun approvisionnement d''un article, le coût de recette utilise le PMP du labo lié.

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

L''achat de 15 kg pèse davantage dans la moyenne que le transfert de 5 kg : c''est le principe de la pondération.
:::

### Ce qui peut faire varier le résultat

- Chaque nouvel achat déplace la moyenne — un gros volume à prix différent la déplace beaucoup, un petit volume très peu.
- Un inventaire redémarre le calcul : seules les entrées postérieures à sa date comptent. Pour la valeur du stock, la quantité comptée reste toutefois valorisée à son coût moyen d''avant inventaire quand il existe.
- Ne comptent **pas** dans le PMP : les consommations de production, les ventes, les pertes et les lignes sans prix.
- Modifier ou supprimer une ligne d''achat passée recalcule le PMP immédiatement, y compris pour les écrans déjà consultés.
- Au labo, seuls les achats saisis au labo comptent : les transferts y sont des sorties, pas des entrées.

### Voir aussi

- [La valeur du stock](#calc-valeur-stock)
- [Le coût de revient d''une recette](#calc-cout-recette)
- [Transferts](#transferts)
- [Inventaire](#inventaire)
- [HT et TTC](#calc-ht-ttc)',
'pmp, prix moyen pondéré, coût moyen, valorisation, achats, transferts, inventaire, prix ttc, moyenne, approvisionnement, coût unitaire', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('calc-ht-ttc', 'HT et TTC', '🧾', 'Comprendre les calculs', 83,
'## 🧾 HT et TTC dans LabFlow

Les prix d''achat se saisissent en **hors taxes (HT)**, accompagnés du **taux de TVA** en pourcentage. LabFlow calcule alors le prix TTC de la ligne et le conserve avec elle. Tout l''affichage courant — stocks, coûts de recette, productions, transferts, pertes, rapports et tableaux de bord — est ensuite exprimé en **TTC** : c''est le coût réellement décaissé.

### Les paramètres qui influencent le résultat

- **Le prix unitaire HT** saisi à l''approvisionnement.
- **Le taux de TVA** choisi pour la ligne (en %).
- **La nature de la ligne** : les produits transformés sont conventionnellement à TVA 0, donc pour eux HT = TTC (leur coût est déjà composé de prix TTC d''ingrédients).

:::formule Passage du HT au TTC
Prix TTC = Prix HT × (1 + taux de TVA ÷ 100)
note: calculé et enregistré ligne par ligne, au moment de la saisie de l''approvisionnement.
:::

:::exemple
Vous recevez 10,000 kg de farine à 2,100 DT HT le kg, avec une TVA de 19 % :

- Prix unitaire TTC = 2,100 × (1 + 19 ÷ 100) = 2,100 × 1,19 = **2,499 DT le kg**
- Coût HT de la ligne = 10,000 × 2,100 = 21,000 DT
- Montant de TVA = 21,000 × 19 % = 3,990 DT
- Coût TTC de la ligne = 10,000 × 2,499 = **24,990 DT**

C''est ce prix de 2,499 DT TTC qui entrera dans le PMP de la farine, dans la valeur du stock et dans les coûts de recette.
:::

### Où voit-on encore du HT ?

Le HT reste visible partout où il a une utilité comptable :

- **Les factures** : montant HT, montant de TVA, montant TTC (et timbre fiscal éventuel).
- **Les exports détaillés de l''historique des approvisionnements** (Excel et PDF) : colonnes prix unitaire HT, taux de TVA, prix unitaire TTC, coût HT et coût TTC.
- **Les historiques d''approvisionnements** : chaque ligne affiche côte à côte le prix HT, le taux de TVA et le prix TTC.
- **La colonne valeur des pages de stock** (activités et labo) : la valeur TTC en évidence, la valeur HT rappelée en dessous.

### Ce qui peut faire varier le résultat

- Un taux de TVA à 0 % donne un TTC égal au HT.
- Pour les saisies anciennes où la TVA n''était pas renseignée, le TTC est considéré égal au HT.
- Les produits transformés sont toujours à TVA 0 : leur prix affiché est le même en HT et en TTC.
- Deux achats au même prix HT mais à des taux différents donnent des TTC différents : le PMP TTC en tient compte.
- Les transferts vers une activité sont valorisés au prix de cession TTC saisi au moment du transfert, proposé par défaut au prix du labo.

### Voir aussi

- [Factures](#factures)
- [Historique des approvisionnements](#historique)
- [Rapports](#rapports)
- [Le prix moyen pondéré](#calc-pmp)
- [Lexique](#lexique)',
'## 🧾 HT et TTC dans LabFlow

Les prix d''achat se saisissent en **hors taxes (HT)**, accompagnés du **taux de TVA** en pourcentage. LabFlow calcule alors le prix TTC de la ligne et le conserve avec elle. Tout l''affichage courant — stocks, coûts de recette, productions, transferts, pertes, rapports et tableaux de bord — est ensuite exprimé en **TTC** : c''est le coût réellement décaissé.

### Les paramètres qui influencent le résultat

- **Le prix unitaire HT** saisi à l''approvisionnement.
- **Le taux de TVA** choisi pour la ligne (en %).
- **La nature de la ligne** : les produits transformés sont conventionnellement à TVA 0, donc pour eux HT = TTC (leur coût est déjà composé de prix TTC d''ingrédients).

:::formule Passage du HT au TTC
Prix TTC = Prix HT × (1 + taux de TVA ÷ 100)
note: calculé et enregistré ligne par ligne, au moment de la saisie de l''approvisionnement.
:::

:::exemple
Vous recevez 10,000 kg de farine à 2,100 DT HT le kg, avec une TVA de 19 % :

- Prix unitaire TTC = 2,100 × (1 + 19 ÷ 100) = 2,100 × 1,19 = **2,499 DT le kg**
- Coût HT de la ligne = 10,000 × 2,100 = 21,000 DT
- Montant de TVA = 21,000 × 19 % = 3,990 DT
- Coût TTC de la ligne = 10,000 × 2,499 = **24,990 DT**

C''est ce prix de 2,499 DT TTC qui entrera dans le PMP de la farine, dans la valeur du stock et dans les coûts de recette.
:::

### Où voit-on encore du HT ?

Le HT reste visible partout où il a une utilité comptable :

- **Les factures** : montant HT, montant de TVA, montant TTC (et timbre fiscal éventuel).
- **Les exports détaillés de l''historique des approvisionnements** (Excel et PDF) : colonnes prix unitaire HT, taux de TVA, prix unitaire TTC, coût HT et coût TTC.
- **Les historiques d''approvisionnements** : chaque ligne affiche côte à côte le prix HT, le taux de TVA et le prix TTC.
- **La colonne valeur des pages de stock** (activités et labo) : la valeur TTC en évidence, la valeur HT rappelée en dessous.

### Ce qui peut faire varier le résultat

- Un taux de TVA à 0 % donne un TTC égal au HT.
- Pour les saisies anciennes où la TVA n''était pas renseignée, le TTC est considéré égal au HT.
- Les produits transformés sont toujours à TVA 0 : leur prix affiché est le même en HT et en TTC.
- Deux achats au même prix HT mais à des taux différents donnent des TTC différents : le PMP TTC en tient compte.
- Les transferts vers une activité sont valorisés au prix de cession TTC saisi au moment du transfert, proposé par défaut au prix du labo.

### Voir aussi

- [Factures](#factures)
- [Historique des approvisionnements](#historique)
- [Rapports](#rapports)
- [Le prix moyen pondéré](#calc-pmp)
- [Lexique](#lexique)',
'ht, ttc, tva, taxe, hors taxe, toutes taxes comprises, taux de tva, facture, conversion, montant, timbre fiscal, prix d''achat', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('calc-production-pt', 'Production d''un produit transformé', '🏭', 'Comprendre les calculs', 84,
'## 🏭 Ce que déclenche la production d''un produit transformé

Quand vous enregistrez la production d''un produit transformé — au labo pour les produits d''origine labo, dans l''activité pour les autres — LabFlow écrit plusieurs mouvements de stock en une seule opération, **tout ou rien** : si l''un échoue, rien n''est enregistré.

**Ce qui est créé** : une entrée en stock du produit fini, à la quantité produite, valorisée à son **coût de recette du moment** (ingrédients au PMP TTC, sous-produits inclus récursivement). Cette ligne porte le fournisseur **AUTO** et une **référence automatique** : les initiales du nom du produit suivies de l''année — « Crème Pâtissière » produite en 2026 donne **CP-26** ; pour un nom d''un seul mot, les trois premières lettres — « Cookies » donne **COO-26**. La TVA d''un produit transformé est de 0 %.

**Ce qui est déduit** :

- chaque **ingrédient** de la recette : sortie de stock de portion × quantité produite, valorisée à son PMP (HT et TTC), avec sa propre référence automatique ;
- chaque **sous-produit** de la recette : sortie de stock du sous-produit, valorisée à son coût de recette. Les ingrédients des sous-produits, eux, ont déjà été déduits au moment où ces sous-produits ont été fabriqués — ils ne sont pas déduits une seconde fois.

### Les paramètres qui influencent le résultat

- **La quantité produite.**
- **Les portions de la recette**, ou les portions personnalisées saisies pour cette production.
- **Le PMP TTC de chaque ingrédient** au moment de la production.
- **Le coût de recette de chaque sous-produit** consommé.

:::formule Mouvements écrits à la production
Entrée produit fini = quantité produite, au coût de recette (PMP TTC) ; sortie de chaque composant = portion × quantité produite (article au PMP, sous-produit au coût de recette)
note: écriture tout-ou-rien — le stock du produit fini gagne la valeur que perdent les stocks des composants.
:::

:::exemple
Production au labo de 20 « Crème Pâtissière » le 15/07/2026. Recette pour 1 unité : 0,500 L de lait (PMP 2,000 DT), 4 œufs (PMP 0,700 DT), 0,200 kg de sucre (PMP 3,200 DT). Coût de recette = 1,000 + 2,800 + 0,640 = **4,440 DT** l''unité.

Mouvements écrits :

- Entrée « Crème Pâtissière » (fournisseur AUTO, réf. CP-26) : +20 unités à 4,440 DT/unité
- Sortie lait : −10,000 L à 2,000 DT/L
- Sortie œufs : −80 pièces à 0,700 DT/pièce
- Sortie sucre : −4,000 kg à 3,200 DT/kg

Le stock du produit fini gagne 20 × 4,440 = **88,800 DT** de valeur ; les stocks d''ingrédients perdent 20,000 + 56,000 + 12,800 = **88,800 DT**. L''opération est neutre : la valeur a simplement changé de forme.
:::

### Ce qui peut faire varier le résultat

- Au labo, la production est **refusée** si le stock disponible d''un ingrédient ou d''un sous-produit est insuffisant.
- Un produit d''origine labo ne peut pas être produit ni approvisionné directement dans une activité : il n''y arrive que par transfert.
- Les portions personnalisées modifient les quantités réellement déduites, sans toucher à la fiche technique ; l''entrée du produit fini reste valorisée au coût de la recette standard.
- Si un ingrédient n''a pas encore de prix connu, le coût de la production est incomplet.
- Les sorties liées à une production sont identifiables dans les historiques (fournisseur AUTO, référence automatique) ; elles n''entrent ni dans le PMP ni dans les ventes.

### Voir aussi

- [Le coût de revient d''une recette](#calc-cout-recette)
- [La valeur du stock](#calc-valeur-stock)
- [La traçabilité des mouvements](#calc-tracabilite)
- [Stock du labo](#stock-labo)
- [Lexique des produits transformés](#lexique-pt)',
'## 🏭 Ce que déclenche la production d''un produit transformé

Quand vous enregistrez la production d''un produit transformé — au labo pour les produits d''origine labo, dans l''activité pour les autres — LabFlow écrit plusieurs mouvements de stock en une seule opération, **tout ou rien** : si l''un échoue, rien n''est enregistré.

**Ce qui est créé** : une entrée en stock du produit fini, à la quantité produite, valorisée à son **coût de recette du moment** (ingrédients au PMP TTC, sous-produits inclus récursivement). Cette ligne porte le fournisseur **AUTO** et une **référence automatique** : les initiales du nom du produit suivies de l''année — « Crème Pâtissière » produite en 2026 donne **CP-26** ; pour un nom d''un seul mot, les trois premières lettres — « Cookies » donne **COO-26**. La TVA d''un produit transformé est de 0 %.

**Ce qui est déduit** :

- chaque **ingrédient** de la recette : sortie de stock de portion × quantité produite, valorisée à son PMP (HT et TTC), avec sa propre référence automatique ;
- chaque **sous-produit** de la recette : sortie de stock du sous-produit, valorisée à son coût de recette. Les ingrédients des sous-produits, eux, ont déjà été déduits au moment où ces sous-produits ont été fabriqués — ils ne sont pas déduits une seconde fois.

### Les paramètres qui influencent le résultat

- **La quantité produite.**
- **Les portions de la recette**, ou les portions personnalisées saisies pour cette production.
- **Le PMP TTC de chaque ingrédient** au moment de la production.
- **Le coût de recette de chaque sous-produit** consommé.

:::formule Mouvements écrits à la production
Entrée produit fini = quantité produite, au coût de recette (PMP TTC) ; sortie de chaque composant = portion × quantité produite (article au PMP, sous-produit au coût de recette)
note: écriture tout-ou-rien — le stock du produit fini gagne la valeur que perdent les stocks des composants.
:::

:::exemple
Production au labo de 20 « Crème Pâtissière » le 15/07/2026. Recette pour 1 unité : 0,500 L de lait (PMP 2,000 DT), 4 œufs (PMP 0,700 DT), 0,200 kg de sucre (PMP 3,200 DT). Coût de recette = 1,000 + 2,800 + 0,640 = **4,440 DT** l''unité.

Mouvements écrits :

- Entrée « Crème Pâtissière » (fournisseur AUTO, réf. CP-26) : +20 unités à 4,440 DT/unité
- Sortie lait : −10,000 L à 2,000 DT/L
- Sortie œufs : −80 pièces à 0,700 DT/pièce
- Sortie sucre : −4,000 kg à 3,200 DT/kg

Le stock du produit fini gagne 20 × 4,440 = **88,800 DT** de valeur ; les stocks d''ingrédients perdent 20,000 + 56,000 + 12,800 = **88,800 DT**. L''opération est neutre : la valeur a simplement changé de forme.
:::

### Ce qui peut faire varier le résultat

- Au labo, la production est **refusée** si le stock disponible d''un ingrédient ou d''un sous-produit est insuffisant.
- Un produit d''origine labo ne peut pas être produit ni approvisionné directement dans une activité : il n''y arrive que par transfert.
- Les portions personnalisées modifient les quantités réellement déduites, sans toucher à la fiche technique ; l''entrée du produit fini reste valorisée au coût de la recette standard.
- Si un ingrédient n''a pas encore de prix connu, le coût de la production est incomplet.
- Les sorties liées à une production sont identifiables dans les historiques (fournisseur AUTO, référence automatique) ; elles n''entrent ni dans le PMP ni dans les ventes.

### Voir aussi

- [Le coût de revient d''une recette](#calc-cout-recette)
- [La valeur du stock](#calc-valeur-stock)
- [La traçabilité des mouvements](#calc-tracabilite)
- [Stock du labo](#stock-labo)
- [Lexique des produits transformés](#lexique-pt)',
'production, produit transformé, pt, déduction, ingrédients, sous-produit, auto, référence, coût de recette, fabrication, mouvement de stock, traçabilité', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('calc-transferts', 'Valorisation des transferts', '🚚', 'Comprendre les calculs', 85,
'## 🚚 Valorisation des transferts

Quand votre labo envoie des articles ou des produits transformés vers une activité, chaque ligne est valorisée à un **prix de cession**. Cette fiche explique comment ce prix est déterminé et ce qu''il devient de part et d''autre du transfert.

### La règle

- Chaque ligne transférée porte un prix de cession **TTC**, affiché et modifiable au moment du transfert.
- Pour un **article**, le prix est pré-rempli avec le coût moyen pondéré (PMP) du labo, TVA incluse ; le système enregistre la paire HT/TTC à partir du taux de TVA de l''article.
- Pour un **produit transformé**, le prix est pré-rempli avec le coût actuel de sa recette au labo — le même calcul que la fiche technique, articles au PMP TTC — (pas de TVA : HT = TTC) ; à défaut de prix saisi, c''est le dernier coût de fabrication au labo qui est retenu.
- Une **référence** (numéro de bon de livraison ou de facture) est obligatoire : elle accompagne le mouvement des deux côtés.

### Les paramètres

| Paramètre | Origine |
|---|---|
| Quantité | saisie, limitée au stock disponible du labo |
| Prix de cession TTC | saisi (pré-rempli : PMP TTC du labo pour un article, coût de recette au labo pour un produit transformé) |
| Taux de TVA | celui de l''article (produit transformé : TVA à 0) |
| Référence | numéro de BL / facture saisi au transfert |

:::formule Prix de cession HT
PRIX HT = PRIX TTC ÷ (1 + TVA ÷ 100)
note: pour un produit transformé, la TVA est nulle : HT = TTC.
:::

### Des deux côtés du transfert

- **Côté labo** : sortie de stock valorisée au prix de cession, visible dans les historiques avec le badge *Transfert*.
- **Côté activité** : entrée de stock au nom du **fournisseur-labo** (fiche fournisseur créée automatiquement avec le labo), avec la référence saisie. Pour un article, cette entrée alimente le **PMP de l''activité** exactement comme un achat fournisseur. Pour un produit transformé, le stock de l''activité est valorisé au prix de la **dernière réception**.

:::exemple
Le labo transfère 20 kg de farine à l''activité « Pâtisserie Centre ». PMP labo : 1,200 DT HT/kg, TVA 7 % → prix de cession pré-rempli : 1,284 DT TTC/kg.

- Côté labo : sortie de 20 kg valorisée 20 × 1,284 = 25,680 DT TTC.
- Côté activité : entrée de 20 kg, fournisseur = le labo, référence BL-0642.
- PMP de l''activité : elle détenait 30 kg à 1,400 DT TTC/kg → nouveau PMP = (30 × 1,400 + 20 × 1,284) ÷ 50 = 67,680 ÷ 50 ≈ 1,354 DT TTC/kg.

Le même jour, 15 crèmes pâtissières (coût de recette au labo : 3,500 DT) partent au prix proposé : l''activité les reçoit valorisées 3,500 DT pièce, soit 52,500 DT.
:::

### Variations

- Vous pouvez remplacer le prix pré-rempli (marge interne, prix négocié) : c''est le prix saisi qui fait foi côté activité.
- Un produit transformé ne peut être transféré que vers une activité à laquelle il est **affecté** ; sinon le transfert est refusé.
- Si le stock du labo est insuffisant, le transfert est bloqué et la quantité disponible vous est indiquée.
- Pour les articles transférés, la référence saisie alimente aussi les **factures** de l''activité (sans timbre fiscal).

:::attention
Le prix de cession devient le coût d''entrée définitif côté activité : un prix erroné fausse le PMP, donc la valeur de stock et le coût de vos recettes.
:::

### Voir aussi

- [Transferts](#transferts)
- [Le PMP](#calc-pmp)
- [Qui fixe quel prix](#calc-prix)
- [HT et TTC](#calc-ht-ttc)',
'## 🚚 Valorisation des transferts

Quand votre labo envoie des articles ou des produits transformés vers une activité, chaque ligne est valorisée à un **prix de cession**. Cette fiche explique comment ce prix est déterminé et ce qu''il devient de part et d''autre du transfert.

### La règle

- Chaque ligne transférée porte un prix de cession **TTC**, affiché et modifiable au moment du transfert.
- Pour un **article**, le prix est pré-rempli avec le coût moyen pondéré (PMP) du labo, TVA incluse ; le système enregistre la paire HT/TTC à partir du taux de TVA de l''article.
- Pour un **produit transformé**, le prix est pré-rempli avec le coût actuel de sa recette au labo — le même calcul que la fiche technique, articles au PMP TTC — (pas de TVA : HT = TTC) ; à défaut de prix saisi, c''est le dernier coût de fabrication au labo qui est retenu.
- Une **référence** (numéro de bon de livraison ou de facture) est obligatoire : elle accompagne le mouvement des deux côtés.

### Les paramètres

| Paramètre | Origine |
|---|---|
| Quantité | saisie, limitée au stock disponible du labo |
| Prix de cession TTC | saisi (pré-rempli : PMP TTC du labo pour un article, coût de recette au labo pour un produit transformé) |
| Taux de TVA | celui de l''article (produit transformé : TVA à 0) |
| Référence | numéro de BL / facture saisi au transfert |

:::formule Prix de cession HT
PRIX HT = PRIX TTC ÷ (1 + TVA ÷ 100)
note: pour un produit transformé, la TVA est nulle : HT = TTC.
:::

### Des deux côtés du transfert

- **Côté labo** : sortie de stock valorisée au prix de cession, visible dans les historiques avec le badge *Transfert*.
- **Côté activité** : entrée de stock au nom du **fournisseur-labo** (fiche fournisseur créée automatiquement avec le labo), avec la référence saisie. Pour un article, cette entrée alimente le **PMP de l''activité** exactement comme un achat fournisseur. Pour un produit transformé, le stock de l''activité est valorisé au prix de la **dernière réception**.

:::exemple
Le labo transfère 20 kg de farine à l''activité « Pâtisserie Centre ». PMP labo : 1,200 DT HT/kg, TVA 7 % → prix de cession pré-rempli : 1,284 DT TTC/kg.

- Côté labo : sortie de 20 kg valorisée 20 × 1,284 = 25,680 DT TTC.
- Côté activité : entrée de 20 kg, fournisseur = le labo, référence BL-0642.
- PMP de l''activité : elle détenait 30 kg à 1,400 DT TTC/kg → nouveau PMP = (30 × 1,400 + 20 × 1,284) ÷ 50 = 67,680 ÷ 50 ≈ 1,354 DT TTC/kg.

Le même jour, 15 crèmes pâtissières (coût de recette au labo : 3,500 DT) partent au prix proposé : l''activité les reçoit valorisées 3,500 DT pièce, soit 52,500 DT.
:::

### Variations

- Vous pouvez remplacer le prix pré-rempli (marge interne, prix négocié) : c''est le prix saisi qui fait foi côté activité.
- Un produit transformé ne peut être transféré que vers une activité à laquelle il est **affecté** ; sinon le transfert est refusé.
- Si le stock du labo est insuffisant, le transfert est bloqué et la quantité disponible vous est indiquée.
- Pour les articles transférés, la référence saisie alimente aussi les **factures** de l''activité (sans timbre fiscal).

:::attention
Le prix de cession devient le coût d''entrée définitif côté activité : un prix erroné fausse le PMP, donc la valeur de stock et le coût de vos recettes.
:::

### Voir aussi

- [Transferts](#transferts)
- [Le PMP](#calc-pmp)
- [Qui fixe quel prix](#calc-prix)
- [HT et TTC](#calc-ht-ttc)',
'transfert, prix de cession, labo, activité, valorisation, pmp, bon de livraison, fournisseur labo, réception, coût labo, tva, sortie de stock', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('calc-seuils', 'Seuils d''alerte', '🚨', 'Comprendre les calculs', 86,
'## 🚨 Les seuils d''alerte de stock

Les seuils minimums colorent vos lignes de stock et font remonter les produits à surveiller. Le calcul est volontairement simple : une comparaison directe entre le stock courant et le seuil que vous avez fixé.

### La règle

- Un seuil minimum se définit **par article ou par produit transformé**, et il est **indépendant** pour chaque activité et pour chaque labo : le même beurre peut avoir un seuil de 10 kg dans une activité et de 25 kg au labo.
- Pour un **produit transformé** dans une activité, le seuil se règle par activité ; si aucun seuil n''est défini pour l''activité, le **seuil global du produit** s''applique en repli.
- Aucun seuil n''est obligatoire : sans seuil, seule la **rupture** (stock épuisé) est signalée.

### Les paramètres

| Portée | Comparaison effectuée |
|---|---|
| Article dans une activité | stock courant de l''activité et seuil réglé sur la page Stock de l''activité |
| Article au labo | stock courant du labo et seuil réglé au labo |
| Produit transformé dans une activité | stock courant et seuil du produit pour cette activité (repli : seuil global du produit) |
| Produit transformé au labo | stock courant du labo et seuil réglé au labo |

:::formule État de l''alerte
ROUGE si STOCK ≤ SEUIL · ORANGE si STOCK ≤ SEUIL × 1,10 · VERT au-delà
note: sans seuil défini, seul un stock épuisé passe en rouge.
:::

La légende est rappelée dans la fenêtre de réglage du seuil : 🔴 ≤ seuil · 🟠 seuil + 10 % · 🟢 au-dessus.

:::exemple
Beurre, seuil fixé à 10 kg dans l''activité :

- stock 12 kg → 12 dépasse 11 (soit 10 + 10 %) : ligne verte ;
- stock 10,8 kg → entre 10 et 11 : orange, zone de vigilance ;
- stock 9 kg → 9 ≤ 10 : rouge, alerte ;
- stock 0 kg → rouge, même si aucun seuil n''avait été défini.

Au labo, le même beurre avec un seuil de 25 kg et un stock de 30 kg reste vert : les deux alertes vivent séparément.
:::

### Pourquoi un inventaire peut changer l''état d''une alerte

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
- [Tableau de bord](#dashboard)',
'## 🚨 Les seuils d''alerte de stock

Les seuils minimums colorent vos lignes de stock et font remonter les produits à surveiller. Le calcul est volontairement simple : une comparaison directe entre le stock courant et le seuil que vous avez fixé.

### La règle

- Un seuil minimum se définit **par article ou par produit transformé**, et il est **indépendant** pour chaque activité et pour chaque labo : le même beurre peut avoir un seuil de 10 kg dans une activité et de 25 kg au labo.
- Pour un **produit transformé** dans une activité, le seuil se règle par activité ; si aucun seuil n''est défini pour l''activité, le **seuil global du produit** s''applique en repli.
- Aucun seuil n''est obligatoire : sans seuil, seule la **rupture** (stock épuisé) est signalée.

### Les paramètres

| Portée | Comparaison effectuée |
|---|---|
| Article dans une activité | stock courant de l''activité et seuil réglé sur la page Stock de l''activité |
| Article au labo | stock courant du labo et seuil réglé au labo |
| Produit transformé dans une activité | stock courant et seuil du produit pour cette activité (repli : seuil global du produit) |
| Produit transformé au labo | stock courant du labo et seuil réglé au labo |

:::formule État de l''alerte
ROUGE si STOCK ≤ SEUIL · ORANGE si STOCK ≤ SEUIL × 1,10 · VERT au-delà
note: sans seuil défini, seul un stock épuisé passe en rouge.
:::

La légende est rappelée dans la fenêtre de réglage du seuil : 🔴 ≤ seuil · 🟠 seuil + 10 % · 🟢 au-dessus.

:::exemple
Beurre, seuil fixé à 10 kg dans l''activité :

- stock 12 kg → 12 dépasse 11 (soit 10 + 10 %) : ligne verte ;
- stock 10,8 kg → entre 10 et 11 : orange, zone de vigilance ;
- stock 9 kg → 9 ≤ 10 : rouge, alerte ;
- stock 0 kg → rouge, même si aucun seuil n''avait été défini.

Au labo, le même beurre avec un seuil de 25 kg et un stock de 30 kg reste vert : les deux alertes vivent séparément.
:::

### Pourquoi un inventaire peut changer l''état d''une alerte

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
- [Tableau de bord](#dashboard)',
'seuil, alerte, stock minimum, rupture, réapprovisionnement, rouge, orange, inventaire, produit transformé, activité, labo, vigilance', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('calc-prix', 'Qui fixe quel prix', '🏷️', 'Comprendre les calculs', 87,
'## 🏷️ Qui fixe quel prix

LabFlow manipule quatre prix différents, chacun saisi ou calculé à un moment précis. Comprendre qui fixe quoi évite bien des confusions à la lecture des stocks et des rapports.

### La règle

| Prix | Qui le fixe | Quand | À quoi il sert |
|---|---|---|---|
| Prix d''achat | vous (HT + taux de TVA) | à chaque approvisionnement | PMP, valeur de stock, coût des recettes |
| Prix de vente (PV) | vous, par produit et par activité | dans la configuration de la vente | chiffre d''affaires, marges |
| Prix de cession | vous (pré-rempli par le système) | à chaque transfert labo → activité | coût d''entrée côté activité |
| Prix d''un composé valorisé | calculé par LabFlow | à chaque production au labo | valeur du produit fini, transferts, rapports |

### Le prix d''achat : saisi HT, affiché TTC

À l''approvisionnement, vous saisissez le prix **hors taxes** et le **taux de TVA**. Le système calcule le TTC, et c''est lui qui est affiché dans les stocks, les rapports et les tableaux de bord.

:::formule Prix TTC
PRIX TTC = PRIX HT × (1 + TVA ÷ 100)
:::

### Le prix de vente (PV)

Le PV se définit pour chaque produit vendable, **activité par activité**, dans la configuration de la vente. Il doit être renseigné (supérieur à zéro) pour qu''un produit soit actif à la vente, et chaque modification est conservée dans un historique de prix.

### Le prix de cession

Au transfert, le prix proposé est le PMP TTC du labo pour un article, ou le coût de recette au labo pour un produit transformé ; vous pouvez l''ajuster avant de valider. Voir [Valorisation des transferts](#calc-transferts).

### Le prix figé des composés valorisés

Un **composé valorisé** est un produit vendable fabriqué au labo. « Valorisé » signifie que sa valeur ne provient pas d''un prix d''achat fournisseur : elle est **calculée** à partir du coût réel de sa recette — articles au PMP TTC, sous-produits compris — au moment précis de la production, puis **figée** sur cette production. Les variations de prix ultérieures ne touchent pas les unités déjà produites : la production suivante portera son propre coût.

:::exemple
- Achat : 100 kg de farine à 1,200 DT HT, TVA 7 % → 1,284 DT TTC le kg, soit 128,400 DT TTC.
- Production au labo : la recette du « Millefeuille » consomme 2,150 DT TTC d''articles au PMP du jour → chaque unité produite est figée à 2,150 DT.
- Transfert : les millefeuilles partent vers l''activité au prix de cession proposé de 2,150 DT (ajustable).
- Vente : dans la configuration de la vente de l''activité, le PV du millefeuille est fixé à 4,500 DT → marge brute de 2,350 DT par pièce.

Le lendemain, la farine augmente : les millefeuilles déjà produits restent valorisés 2,150 DT ; la production suivante sera figée à son nouveau coût.
:::

### Variations

- Les produits transformés fabriqués **dans une activité** suivent le même principe : coût de recette calculé et figé à chaque production.
- Un même produit peut avoir un **PV différent** dans chaque activité.

:::regle
Convention d''affichage : les prix d''achat se saisissent en HT + TVA, mais tous les écrans (stocks, produits transformés, rapports, tableaux de bord) affichent des montants TTC.
:::

### Voir aussi

- [HT et TTC](#calc-ht-ttc)
- [Coût d''une recette](#calc-cout-recette)
- [Production des produits transformés](#calc-production-pt)
- [Valorisation des transferts](#calc-transferts)
- [Configuration de la vente](#configuration-vente)
- [Articles valorisés](#articles-valorises)',
'## 🏷️ Qui fixe quel prix

LabFlow manipule quatre prix différents, chacun saisi ou calculé à un moment précis. Comprendre qui fixe quoi évite bien des confusions à la lecture des stocks et des rapports.

### La règle

| Prix | Qui le fixe | Quand | À quoi il sert |
|---|---|---|---|
| Prix d''achat | vous (HT + taux de TVA) | à chaque approvisionnement | PMP, valeur de stock, coût des recettes |
| Prix de vente (PV) | vous, par produit et par activité | dans la configuration de la vente | chiffre d''affaires, marges |
| Prix de cession | vous (pré-rempli par le système) | à chaque transfert labo → activité | coût d''entrée côté activité |
| Prix d''un composé valorisé | calculé par LabFlow | à chaque production au labo | valeur du produit fini, transferts, rapports |

### Le prix d''achat : saisi HT, affiché TTC

À l''approvisionnement, vous saisissez le prix **hors taxes** et le **taux de TVA**. Le système calcule le TTC, et c''est lui qui est affiché dans les stocks, les rapports et les tableaux de bord.

:::formule Prix TTC
PRIX TTC = PRIX HT × (1 + TVA ÷ 100)
:::

### Le prix de vente (PV)

Le PV se définit pour chaque produit vendable, **activité par activité**, dans la configuration de la vente. Il doit être renseigné (supérieur à zéro) pour qu''un produit soit actif à la vente, et chaque modification est conservée dans un historique de prix.

### Le prix de cession

Au transfert, le prix proposé est le PMP TTC du labo pour un article, ou le coût de recette au labo pour un produit transformé ; vous pouvez l''ajuster avant de valider. Voir [Valorisation des transferts](#calc-transferts).

### Le prix figé des composés valorisés

Un **composé valorisé** est un produit vendable fabriqué au labo. « Valorisé » signifie que sa valeur ne provient pas d''un prix d''achat fournisseur : elle est **calculée** à partir du coût réel de sa recette — articles au PMP TTC, sous-produits compris — au moment précis de la production, puis **figée** sur cette production. Les variations de prix ultérieures ne touchent pas les unités déjà produites : la production suivante portera son propre coût.

:::exemple
- Achat : 100 kg de farine à 1,200 DT HT, TVA 7 % → 1,284 DT TTC le kg, soit 128,400 DT TTC.
- Production au labo : la recette du « Millefeuille » consomme 2,150 DT TTC d''articles au PMP du jour → chaque unité produite est figée à 2,150 DT.
- Transfert : les millefeuilles partent vers l''activité au prix de cession proposé de 2,150 DT (ajustable).
- Vente : dans la configuration de la vente de l''activité, le PV du millefeuille est fixé à 4,500 DT → marge brute de 2,350 DT par pièce.

Le lendemain, la farine augmente : les millefeuilles déjà produits restent valorisés 2,150 DT ; la production suivante sera figée à son nouveau coût.
:::

### Variations

- Les produits transformés fabriqués **dans une activité** suivent le même principe : coût de recette calculé et figé à chaque production.
- Un même produit peut avoir un **PV différent** dans chaque activité.

:::regle
Convention d''affichage : les prix d''achat se saisissent en HT + TVA, mais tous les écrans (stocks, produits transformés, rapports, tableaux de bord) affichent des montants TTC.
:::

### Voir aussi

- [HT et TTC](#calc-ht-ttc)
- [Coût d''une recette](#calc-cout-recette)
- [Production des produits transformés](#calc-production-pt)
- [Valorisation des transferts](#calc-transferts)
- [Configuration de la vente](#configuration-vente)
- [Articles valorisés](#articles-valorises)',
'prix de vente, pv, prix d''achat, prix de cession, composé valorisé, prix figé, ht, ttc, tva, marge, valorisation, production', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('calc-tracabilite', 'Traçabilité automatique', '🧾', 'Comprendre les calculs', 88,
'## 🧾 La traçabilité automatique

Chaque mouvement de stock que LabFlow génère pour vous — production, consommation de recette, transfert, vente — porte une référence et, dans la plupart des cas, un fournisseur, même quand ce n''est pas vous qui les avez saisis. Voici comment lire ces mentions dans les historiques.

### La règle

Trois mentions automatiques existent :

- **Fournisseur AUTO** — porté par les mouvements générés par le système : la ligne de production d''un produit transformé, les sorties d''articles et de sous-produits consommés par la recette, les sorties liées aux ventes, ainsi que la sortie de transfert d''un produit transformé côté labo. Cette fiche est créée automatiquement et n''apparaît pas dans votre liste de fournisseurs.
- **Référence automatique** — construite à partir du nom du produit et de l''année de l''opération (voir formule ci-dessous).
- **Fournisseur « labo »** — les réceptions de transfert côté activité portent le **nom de votre labo** comme fournisseur. Cette fiche fournisseur est créée automatiquement avec le labo, suit son nom, et ne peut être ni modifiée ni supprimée depuis l''écran Fournisseurs.

:::formule Référence automatique
RÉF = INITIALES DU NOM (ou 3 PREMIÈRES LETTRES si un seul mot) + « - » + ANNÉE SUR 2 CHIFFRES
note: en majuscules, sans accents ; l''année est celle de la date de l''opération. « Crème Pâtissière » en 2026 → CP-26 ; « Cookies » → COO-26.
:::

:::exemple
Production de 40 « Crème Pâtissière » au labo, le 15 mars 2026 :

- entrée de 40 unités : fournisseur AUTO, référence **CP-26** (initiales de « Crème Pâtissière » + année) ;
- sortie de 10 kg de « Lait » consommé par la recette : fournisseur AUTO, référence **LAI-26** (un seul mot → 3 premières lettres) ;
- sortie de 2 kg de « Sucre Semoule » : fournisseur AUTO, référence **SS-26**.

Une semaine plus tard, 20 unités partent en transfert vers l''activité « Salon de thé » avec le bon de livraison BL-0187 : l''entrée côté activité affiche le nom du labo en fournisseur et la référence BL-0187 ; la sortie côté labo porte le fournisseur AUTO et la même référence.
:::

### Comment lire les historiques

- Dans l''historique d''une **activité**, la mention AUTO apparaît sur les lignes de sortie (quantités négatives) générées par le système : consommations de recette (badge 🔄 PT) et sorties de vente (badge 💰 Vente). Les entrées de production affichent la référence automatique du produit.
- Dans l''historique du **labo**, les lignes de production et les consommations qu''elles déclenchent portent le fournisseur AUTO et leur référence automatique.
- Les réceptions de transfert (badge *Transfert*) affichent le **nom du labo** en fournisseur et la référence saisie au transfert, dans la colonne Réf. Facture / BL.
- Le filtre **Type d''appro** des historiques (Manuel, Transfert, Vente, PT) permet d''isoler ces mouvements.

### Variations

- La référence automatique change chaque année : une production de janvier 2027 du même produit portera CP-27.
- Deux produits partageant les mêmes initiales partagent la même référence : c''est le couple produit + référence qui identifie le mouvement, pas la référence seule.

:::astuce
Si une ligne porte le fournisseur AUTO, elle n''a pas été saisie à la main : inutile de chercher qui l''a créée, c''est une écriture système déclenchée par une production ou une vente.
:::

### Voir aussi

- [Production des produits transformés](#calc-production-pt)
- [Valorisation des transferts](#calc-transferts)
- [Historique](#historique)
- [Fournisseurs](#fournisseurs)',
'## 🧾 La traçabilité automatique

Chaque mouvement de stock que LabFlow génère pour vous — production, consommation de recette, transfert, vente — porte une référence et, dans la plupart des cas, un fournisseur, même quand ce n''est pas vous qui les avez saisis. Voici comment lire ces mentions dans les historiques.

### La règle

Trois mentions automatiques existent :

- **Fournisseur AUTO** — porté par les mouvements générés par le système : la ligne de production d''un produit transformé, les sorties d''articles et de sous-produits consommés par la recette, les sorties liées aux ventes, ainsi que la sortie de transfert d''un produit transformé côté labo. Cette fiche est créée automatiquement et n''apparaît pas dans votre liste de fournisseurs.
- **Référence automatique** — construite à partir du nom du produit et de l''année de l''opération (voir formule ci-dessous).
- **Fournisseur « labo »** — les réceptions de transfert côté activité portent le **nom de votre labo** comme fournisseur. Cette fiche fournisseur est créée automatiquement avec le labo, suit son nom, et ne peut être ni modifiée ni supprimée depuis l''écran Fournisseurs.

:::formule Référence automatique
RÉF = INITIALES DU NOM (ou 3 PREMIÈRES LETTRES si un seul mot) + « - » + ANNÉE SUR 2 CHIFFRES
note: en majuscules, sans accents ; l''année est celle de la date de l''opération. « Crème Pâtissière » en 2026 → CP-26 ; « Cookies » → COO-26.
:::

:::exemple
Production de 40 « Crème Pâtissière » au labo, le 15 mars 2026 :

- entrée de 40 unités : fournisseur AUTO, référence **CP-26** (initiales de « Crème Pâtissière » + année) ;
- sortie de 10 kg de « Lait » consommé par la recette : fournisseur AUTO, référence **LAI-26** (un seul mot → 3 premières lettres) ;
- sortie de 2 kg de « Sucre Semoule » : fournisseur AUTO, référence **SS-26**.

Une semaine plus tard, 20 unités partent en transfert vers l''activité « Salon de thé » avec le bon de livraison BL-0187 : l''entrée côté activité affiche le nom du labo en fournisseur et la référence BL-0187 ; la sortie côté labo porte le fournisseur AUTO et la même référence.
:::

### Comment lire les historiques

- Dans l''historique d''une **activité**, la mention AUTO apparaît sur les lignes de sortie (quantités négatives) générées par le système : consommations de recette (badge 🔄 PT) et sorties de vente (badge 💰 Vente). Les entrées de production affichent la référence automatique du produit.
- Dans l''historique du **labo**, les lignes de production et les consommations qu''elles déclenchent portent le fournisseur AUTO et leur référence automatique.
- Les réceptions de transfert (badge *Transfert*) affichent le **nom du labo** en fournisseur et la référence saisie au transfert, dans la colonne Réf. Facture / BL.
- Le filtre **Type d''appro** des historiques (Manuel, Transfert, Vente, PT) permet d''isoler ces mouvements.

### Variations

- La référence automatique change chaque année : une production de janvier 2027 du même produit portera CP-27.
- Deux produits partageant les mêmes initiales partagent la même référence : c''est le couple produit + référence qui identifie le mouvement, pas la référence seule.

:::astuce
Si une ligne porte le fournisseur AUTO, elle n''a pas été saisie à la main : inutile de chercher qui l''a créée, c''est une écriture système déclenchée par une production ou une vente.
:::

### Voir aussi

- [Production des produits transformés](#calc-production-pt)
- [Valorisation des transferts](#calc-transferts)
- [Historique](#historique)
- [Fournisseurs](#fournisseurs)',
'traçabilité, fournisseur auto, référence automatique, historique, production, transfert, labo, mouvement système, bl, lot, année, badge', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('compte', 'Mon compte', '👤', 'Compte & Aide', 90,
'## 👤 Mon compte

Cet écran regroupe vos informations personnelles et la sécurité de votre accès. Vous y accédez par l''entrée **Mon profil**, en bas du menu latéral. Propriétaire ou gérant, chacun gère ici son propre profil.

### Ce que vous voyez

- Un bandeau d''en-tête avec vos initiales, votre nom et votre adresse e-mail.
- La carte **Informations personnelles** : nom (obligatoire), e-mail (obligatoire) et téléphone.
- La carte **Sécurité — Changer le mot de passe** : mot de passe actuel, nouveau mot de passe et confirmation.
- Le bouton **Enregistrer les modifications**, qui valide l''ensemble du formulaire en une fois.

Lorsque vous modifiez l''e-mail, une vérification s''effectue en direct : si l''adresse est déjà utilisée par un autre compte, le message « Cet email est déjà utilisé » s''affiche et l''enregistrement est refusé.

### Actions pas à pas

**Mettre à jour vos informations**

1. Modifiez le nom, l''e-mail ou le téléphone.
2. Cliquez sur **Enregistrer les modifications**.
3. Un message de confirmation vert apparaît en haut de la page.

**Changer votre mot de passe**

1. Saisissez votre **mot de passe actuel** — il est obligatoire pour tout changement de mot de passe.
2. Saisissez le **nouveau mot de passe** : la liste des critères se coche en vert au fur et à mesure — au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial (par exemple @, !, ?, - ou #).
3. Confirmez le mot de passe : la mention « Mots de passe identiques » s''affiche quand les deux saisies correspondent.
4. Cliquez sur **Enregistrer les modifications**. Après le succès de l''opération, les champs de mot de passe se vident automatiquement.

**Première connexion**

À votre toute première connexion, un bandeau vous invite à définir un nouveau mot de passe avant d''accéder au reste de votre espace. Une fois ce mot de passe enregistré, vous êtes dirigé automatiquement vers la configuration de vos activités pour poursuivre le démarrage.

### Points d''attention

:::attention
Votre e-mail est votre identifiant de connexion : c''est aussi l''adresse qui reçoit vos contrats, avenants et factures. Vérifiez-le soigneusement avant d''enregistrer un changement.
:::

:::attention
Le numéro de téléphone doit être un numéro tunisien valide : 8 chiffres commençant par 2, 5, 7 ou 9, précédés ou non de l''indicatif +216.
:::

:::astuce
Changez votre mot de passe régulièrement et ne le partagez jamais. Chaque gérant dispose de son propre accès avec son propre mot de passe : il n''y a aucune raison de communiquer le vôtre. Pour créer un accès à un collaborateur, passez par l''écran [Gérants](#gerants).
:::

### Voir aussi

- [Rôles et accès](#roles) — ce que voit un propriétaire, ce que voit un gérant
- [Bien démarrer](#demarrage) — les premières étapes après l''activation du compte
- [Gérants](#gerants) — créer et gérer les accès de vos équipes
- [Demandes et support](#support) — contacter l''assistance',
'## 👤 Mon compte

Cet écran regroupe vos informations personnelles et la sécurité de votre accès. Vous y accédez par l''entrée **Mon profil**, en bas du menu latéral. Propriétaire ou gérant, chacun gère ici son propre profil.

### Ce que vous voyez

- Un bandeau d''en-tête avec vos initiales, votre nom et votre adresse e-mail.
- La carte **Informations personnelles** : nom (obligatoire), e-mail (obligatoire) et téléphone.
- La carte **Sécurité — Changer le mot de passe** : mot de passe actuel, nouveau mot de passe et confirmation.
- Le bouton **Enregistrer les modifications**, qui valide l''ensemble du formulaire en une fois.

Lorsque vous modifiez l''e-mail, une vérification s''effectue en direct : si l''adresse est déjà utilisée par un autre compte, le message « Cet email est déjà utilisé » s''affiche et l''enregistrement est refusé.

### Actions pas à pas

**Mettre à jour vos informations**

1. Modifiez le nom, l''e-mail ou le téléphone.
2. Cliquez sur **Enregistrer les modifications**.
3. Un message de confirmation vert apparaît en haut de la page.

**Changer votre mot de passe**

1. Saisissez votre **mot de passe actuel** — il est obligatoire pour tout changement de mot de passe.
2. Saisissez le **nouveau mot de passe** : la liste des critères se coche en vert au fur et à mesure — au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial (par exemple @, !, ?, - ou #).
3. Confirmez le mot de passe : la mention « Mots de passe identiques » s''affiche quand les deux saisies correspondent.
4. Cliquez sur **Enregistrer les modifications**. Après le succès de l''opération, les champs de mot de passe se vident automatiquement.

**Première connexion**

À votre toute première connexion, un bandeau vous invite à définir un nouveau mot de passe avant d''accéder au reste de votre espace. Une fois ce mot de passe enregistré, vous êtes dirigé automatiquement vers la configuration de vos activités pour poursuivre le démarrage.

### Points d''attention

:::attention
Votre e-mail est votre identifiant de connexion : c''est aussi l''adresse qui reçoit vos contrats, avenants et factures. Vérifiez-le soigneusement avant d''enregistrer un changement.
:::

:::attention
Le numéro de téléphone doit être un numéro tunisien valide : 8 chiffres commençant par 2, 5, 7 ou 9, précédés ou non de l''indicatif +216.
:::

:::astuce
Changez votre mot de passe régulièrement et ne le partagez jamais. Chaque gérant dispose de son propre accès avec son propre mot de passe : il n''y a aucune raison de communiquer le vôtre. Pour créer un accès à un collaborateur, passez par l''écran [Gérants](#gerants).
:::

### Voir aussi

- [Rôles et accès](#roles) — ce que voit un propriétaire, ce que voit un gérant
- [Bien démarrer](#demarrage) — les premières étapes après l''activation du compte
- [Gérants](#gerants) — créer et gérer les accès de vos équipes
- [Demandes et support](#support) — contacter l''assistance',
'profil, compte, mot de passe, sécurité, e-mail, téléphone, identifiant, connexion, informations personnelles, première connexion', '/client/profile', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('assistant-ia', 'Assistant IA', '🤖', 'Compte & Aide', 91,
'## 🤖 Assistant IA

L''assistant IA de LabFlow répond en langage naturel à vos questions sur **vos données** (stock, pertes, inventaires, ventes, coûts) et sur **le fonctionnement de LabFlow** : il connaît ce manuel et peut vous guider pas à pas. Vous y accédez depuis la page Assistant IA de votre espace.

### Ce que vous voyez

- Un en-tête « Assistant IA LabFlow » qui rappelle sa mission : analyser vos données (stock, ventes, pertes…) et répondre à vos questions sur le fonctionnement de LabFlow.
- La conversation sous forme de bulles : vos messages d''un côté, les réponses de l''assistant de l''autre.
- À la première visite, des suggestions cliquables pour démarrer : « Quel est mon stock critique actuellement ? », « Comment réduire mes pertes ? », « Comment fonctionnent les transferts labo → activités ? », « Comment la valeur de mon stock est-elle calculée ? ».
- Une zone de saisie en bas de page, avec un bouton d''envoi.
- Un bouton **Effacer**, en haut de la conversation dès qu''elle contient des messages, pour repartir de zéro.

Votre conversation est conservée : si vous quittez la page et revenez plus tard, vous retrouvez l''historique de vos échanges.

### Actions pas à pas

**Poser une question**

1. Tapez votre question dans la zone de saisie, comme vous la poseriez à un collaborateur.
2. Appuyez sur **Entrée** pour envoyer — utilisez **Maj+Entrée** pour aller à la ligne sans envoyer.
3. L''assistant analyse vos données et répond directement dans la conversation.

**Exemples de questions utiles**

- Sur vos données : « Quel est mon stock critique actuellement ? », « Quelles ont été mes plus grosses pertes ce mois-ci ? », « Analyse mes inventaires récents », « Quels articles devrais-je réapprovisionner en priorité ? »
- Sur LabFlow : « Comment déclarer une perte ? », « Comment fonctionne un transfert entre labo et activité ? », « Où retrouver mes factures ? » — l''assistant s''appuie sur ce manuel pour vous répondre.

**Effacer la conversation**

1. Cliquez sur **Effacer** en haut de la conversation.
2. L''historique est supprimé et une nouvelle conversation démarre.

### Points d''attention

:::attention
Si la page affiche « Assistant IA non activé », l''assistant n''est pas encore ouvert pour votre compte : contactez l''administration, par exemple via une [demande d''aide](#support), pour l''activer.
:::

:::astuce
Selon la configuration de votre compte, l''assistant peut aussi être joignable depuis une messagerie instantanée (Telegram ou Messenger) : pratique pour l''interroger en cuisine, sans ouvrir LabFlow. Ce raccordement est mis en place par l''administration.
:::

:::regle
L''assistant n''analyse que les données de votre propre compte LabFlow. Ses réponses sont une aide à la décision : les chiffres de référence restent ceux de vos écrans et de vos [rapports](#rapports).
:::

### Voir aussi

- [Demandes et support](#support) — pour les demandes qui nécessitent une action de l''équipe LabFlow
- [Questions fréquentes](#faq) — les réponses aux questions les plus courantes
- [Stock des activités](#stock-activites), [Pertes](#pertes), [Rapports](#rapports)',
'## 🤖 Assistant IA

L''assistant IA de LabFlow répond en langage naturel à vos questions sur **vos données** (stock, pertes, inventaires, ventes, coûts) et sur **le fonctionnement de LabFlow** : il connaît ce manuel et peut vous guider pas à pas. Vous y accédez depuis la page Assistant IA de votre espace.

### Ce que vous voyez

- Un en-tête « Assistant IA LabFlow » qui rappelle sa mission : analyser vos données (stock, ventes, pertes…) et répondre à vos questions sur le fonctionnement de LabFlow.
- La conversation sous forme de bulles : vos messages d''un côté, les réponses de l''assistant de l''autre.
- À la première visite, des suggestions cliquables pour démarrer : « Quel est mon stock critique actuellement ? », « Comment réduire mes pertes ? », « Comment fonctionnent les transferts labo → activités ? », « Comment la valeur de mon stock est-elle calculée ? ».
- Une zone de saisie en bas de page, avec un bouton d''envoi.
- Un bouton **Effacer**, en haut de la conversation dès qu''elle contient des messages, pour repartir de zéro.

Votre conversation est conservée : si vous quittez la page et revenez plus tard, vous retrouvez l''historique de vos échanges.

### Actions pas à pas

**Poser une question**

1. Tapez votre question dans la zone de saisie, comme vous la poseriez à un collaborateur.
2. Appuyez sur **Entrée** pour envoyer — utilisez **Maj+Entrée** pour aller à la ligne sans envoyer.
3. L''assistant analyse vos données et répond directement dans la conversation.

**Exemples de questions utiles**

- Sur vos données : « Quel est mon stock critique actuellement ? », « Quelles ont été mes plus grosses pertes ce mois-ci ? », « Analyse mes inventaires récents », « Quels articles devrais-je réapprovisionner en priorité ? »
- Sur LabFlow : « Comment déclarer une perte ? », « Comment fonctionne un transfert entre labo et activité ? », « Où retrouver mes factures ? » — l''assistant s''appuie sur ce manuel pour vous répondre.

**Effacer la conversation**

1. Cliquez sur **Effacer** en haut de la conversation.
2. L''historique est supprimé et une nouvelle conversation démarre.

### Points d''attention

:::attention
Si la page affiche « Assistant IA non activé », l''assistant n''est pas encore ouvert pour votre compte : contactez l''administration, par exemple via une [demande d''aide](#support), pour l''activer.
:::

:::astuce
Selon la configuration de votre compte, l''assistant peut aussi être joignable depuis une messagerie instantanée (Telegram ou Messenger) : pratique pour l''interroger en cuisine, sans ouvrir LabFlow. Ce raccordement est mis en place par l''administration.
:::

:::regle
L''assistant n''analyse que les données de votre propre compte LabFlow. Ses réponses sont une aide à la décision : les chiffres de référence restent ceux de vos écrans et de vos [rapports](#rapports).
:::

### Voir aussi

- [Demandes et support](#support) — pour les demandes qui nécessitent une action de l''équipe LabFlow
- [Questions fréquentes](#faq) — les réponses aux questions les plus courantes
- [Stock des activités](#stock-activites), [Pertes](#pertes), [Rapports](#rapports)',
'assistant, ia, intelligence artificielle, chat, questions, langage naturel, analyse, stock critique, pertes, messagerie, telegram, messenger', '/client/ai-assistant', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('support', 'Demandes & support', '💬', 'Compte & Aide', 92,
'## 💬 Demandes & support

L''écran **Demandes** vous met en relation avec l''équipe LabFlow : besoin d''aide, ingrédient absent du catalogue, ajout de capacité (activités, labos, gérants). Vous le trouvez dans le menu latéral, entrée **Demandes**. L''équipe répond sous 24 h.

### Ce que vous voyez

- Un bandeau d''en-tête avec le bouton **+ Nouvelle demande** et, le cas échéant, le nombre de demandes **en attente**.
- Une barre de filtres : par statut (**Toutes**, **En attente**, **Validées**, **Refusées**, avec compteurs) et par plage de dates.
- La liste de vos demandes, 5 par page : type, date, statut coloré (jaune = en attente, vert = validée, rouge = refusée) et résumé du contenu.
- Sous une demande traitée, l''encart **Réponse de l''administration**, avec la date de traitement.
- Si une demande a été créée par l''un de vos gérants, un badge « par … » en indique l''auteur.

### Les types de demandes

| Type | Usage |
|---|---|
| 💬 Besoin d''aide | Décrire un problème, poser une question, suggérer une fonctionnalité ou demander l''ajout d''un ingrédient au catalogue |
| ➕ Ajout de capacité | Ajouter des activités, des labos ou des gérants à votre abonnement |

Vos éventuelles anciennes demandes « 🥕 Ingrédient manquant » restent visibles dans le suivi, mais ce type n''est plus proposé à la création : pour un ingrédient absent du catalogue, passez désormais par une demande **Besoin d''aide**.

### Actions pas à pas

**Envoyer une demande d''aide**

1. Cliquez sur **+ Nouvelle demande**, puis choisissez **Besoin d''aide**.
2. Décrivez votre besoin dans la zone de texte, puis cliquez sur **Envoyer la demande**.
3. Suivez son statut dans la liste : la cloche de notifications vous avertit quand elle est traitée.

**Demander un ajout de capacité (propriétaire du compte uniquement)**

1. Choisissez **Ajout de capacité** — ou passez par les boutons **⚡ Ajouter activités** / **⚡ Ajouter labos** de l''écran [Mes activités](#activites), affichés lorsque la limite de votre abonnement est atteinte.
2. Votre configuration actuelle s''affiche ; réglez avec les compteurs le nombre d''activités, de labos et de gérants supplémentaires. Le prix par unité et par mois s''affiche en DT ; si une promotion est active, l''ancien prix apparaît barré et le prix remisé en vert.
3. Avant l''envoi, le **nouveau total estimé** de votre mensualité s''affiche en DT/mois, promotion comprise le cas échéant.
4. Après l''envoi, un **avenant** à votre contrat est généré : vous recevez par e-mail un lien de signature. Dès la signature, la capacité est ajoutée automatiquement à votre compte.
5. Une fois la demande validée, le bouton **Contrat avenant** vous permet de télécharger le document signé (PDF).

**Demander un ingrédient absent du catalogue**

1. Vérifiez d''abord dans le [catalogue global](#catalogue-global) que l''ingrédient n''existe pas sous un autre nom ou une autre orthographe.
2. Envoyez une demande **Besoin d''aide** en précisant le **nom exact de l''ingrédient**, sa catégorie et son unité.
3. Une fois la demande traitée par l''administration, l''ingrédient est ajouté au [catalogue global](#catalogue-global) et vous pouvez l''ajouter à votre [référentiel](#referentiel-articles).

**Annuler une demande**

1. Tant qu''une demande est **En attente**, le bouton **Supprimer** apparaît sur sa ligne (une confirmation vous est demandée).
2. Une fois traitée — validée ou refusée — elle ne peut plus être supprimée et reste dans votre suivi.

### Points d''attention

:::attention
La demande d''ajout de capacité est réservée au propriétaire du compte : elle engage l''abonnement via un avenant à signer. Les gérants n''y ont pas accès et ne peuvent envoyer que des demandes d''aide.
:::

:::astuce
Pour une réponse rapide, décrivez précisément votre besoin : l''écran concerné, l''activité ou le labo, ce que vous avez fait, ce que vous attendiez et ce qui s''est produit. Faites une demande par sujet : le suivi n''en sera que plus clair.
:::

:::astuce
Avant de demander l''ajout d''un ingrédient, vérifiez dans le [catalogue global](#catalogue-global) qu''il n''existe pas déjà sous un autre nom ou une autre orthographe.
:::

### Voir aussi

- [Abonnement](#abonnement) et [Avenants](#onboarding-avenants) — l''impact d''un ajout de capacité
- [Mes activités](#activites), [Gérants](#gerants)
- [Catalogue global](#catalogue-global) — le catalogue d''ingrédients LabFlow
- [Assistant IA](#assistant-ia) et [Questions fréquentes](#faq) — pour une réponse immédiate',
'## 💬 Demandes & support

L''écran **Demandes** vous met en relation avec l''équipe LabFlow : besoin d''aide, ingrédient absent du catalogue, ajout de capacité (activités, labos, gérants). Vous le trouvez dans le menu latéral, entrée **Demandes**. L''équipe répond sous 24 h.

### Ce que vous voyez

- Un bandeau d''en-tête avec le bouton **+ Nouvelle demande** et, le cas échéant, le nombre de demandes **en attente**.
- Une barre de filtres : par statut (**Toutes**, **En attente**, **Validées**, **Refusées**, avec compteurs) et par plage de dates.
- La liste de vos demandes, 5 par page : type, date, statut coloré (jaune = en attente, vert = validée, rouge = refusée) et résumé du contenu.
- Sous une demande traitée, l''encart **Réponse de l''administration**, avec la date de traitement.
- Si une demande a été créée par l''un de vos gérants, un badge « par … » en indique l''auteur.

### Les types de demandes

| Type | Usage |
|---|---|
| 💬 Besoin d''aide | Décrire un problème, poser une question, suggérer une fonctionnalité ou demander l''ajout d''un ingrédient au catalogue |
| ➕ Ajout de capacité | Ajouter des activités, des labos ou des gérants à votre abonnement |

Vos éventuelles anciennes demandes « 🥕 Ingrédient manquant » restent visibles dans le suivi, mais ce type n''est plus proposé à la création : pour un ingrédient absent du catalogue, passez désormais par une demande **Besoin d''aide**.

### Actions pas à pas

**Envoyer une demande d''aide**

1. Cliquez sur **+ Nouvelle demande**, puis choisissez **Besoin d''aide**.
2. Décrivez votre besoin dans la zone de texte, puis cliquez sur **Envoyer la demande**.
3. Suivez son statut dans la liste : la cloche de notifications vous avertit quand elle est traitée.

**Demander un ajout de capacité (propriétaire du compte uniquement)**

1. Choisissez **Ajout de capacité** — ou passez par les boutons **⚡ Ajouter activités** / **⚡ Ajouter labos** de l''écran [Mes activités](#activites), affichés lorsque la limite de votre abonnement est atteinte.
2. Votre configuration actuelle s''affiche ; réglez avec les compteurs le nombre d''activités, de labos et de gérants supplémentaires. Le prix par unité et par mois s''affiche en DT ; si une promotion est active, l''ancien prix apparaît barré et le prix remisé en vert.
3. Avant l''envoi, le **nouveau total estimé** de votre mensualité s''affiche en DT/mois, promotion comprise le cas échéant.
4. Après l''envoi, un **avenant** à votre contrat est généré : vous recevez par e-mail un lien de signature. Dès la signature, la capacité est ajoutée automatiquement à votre compte.
5. Une fois la demande validée, le bouton **Contrat avenant** vous permet de télécharger le document signé (PDF).

**Demander un ingrédient absent du catalogue**

1. Vérifiez d''abord dans le [catalogue global](#catalogue-global) que l''ingrédient n''existe pas sous un autre nom ou une autre orthographe.
2. Envoyez une demande **Besoin d''aide** en précisant le **nom exact de l''ingrédient**, sa catégorie et son unité.
3. Une fois la demande traitée par l''administration, l''ingrédient est ajouté au [catalogue global](#catalogue-global) et vous pouvez l''ajouter à votre [référentiel](#referentiel-articles).

**Annuler une demande**

1. Tant qu''une demande est **En attente**, le bouton **Supprimer** apparaît sur sa ligne (une confirmation vous est demandée).
2. Une fois traitée — validée ou refusée — elle ne peut plus être supprimée et reste dans votre suivi.

### Points d''attention

:::attention
La demande d''ajout de capacité est réservée au propriétaire du compte : elle engage l''abonnement via un avenant à signer. Les gérants n''y ont pas accès et ne peuvent envoyer que des demandes d''aide.
:::

:::astuce
Pour une réponse rapide, décrivez précisément votre besoin : l''écran concerné, l''activité ou le labo, ce que vous avez fait, ce que vous attendiez et ce qui s''est produit. Faites une demande par sujet : le suivi n''en sera que plus clair.
:::

:::astuce
Avant de demander l''ajout d''un ingrédient, vérifiez dans le [catalogue global](#catalogue-global) qu''il n''existe pas déjà sous un autre nom ou une autre orthographe.
:::

### Voir aussi

- [Abonnement](#abonnement) et [Avenants](#onboarding-avenants) — l''impact d''un ajout de capacité
- [Mes activités](#activites), [Gérants](#gerants)
- [Catalogue global](#catalogue-global) — le catalogue d''ingrédients LabFlow
- [Assistant IA](#assistant-ia) et [Questions fréquentes](#faq) — pour une réponse immédiate',
'support, demandes, aide, assistance, ingrédient manquant, capacité, avenant, signature, statut, ticket, réclamation, contact', '/client/support', true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('faq', 'Questions fréquentes', '❓', 'FAQ', 97,
'## ❓ Questions fréquentes

Les réponses courtes aux questions les plus posées. Pour le détail, suivez les liens vers les fiches concernées.

### Puis-je modifier un approvisionnement déjà saisi ?

Oui, dans la plupart des cas : ouvrez l''[historique des approvisionnements](#historique) de l''activité ou du [labo](#stock-labo) concerné et corrigez la ligne. Attention : la correction recalcule le [prix moyen pondéré](#calc-pmp) de l''article, donc la valeur de votre stock et les coûts qui en découlent peuvent évoluer — c''est normal (voir [Pourquoi mes chiffres ont changé ?](#faq-chiffres)).

### Pourquoi je ne peux pas supprimer cet article ?

Un article déjà utilisé — présent dans une [fiche technique](#fiches-techniques) ou dans vos historiques d''approvisionnements, de stocks ou de ventes — ne peut pas être supprimé : sa suppression casserait la traçabilité de vos coûts et de vos stocks. Retirez-le plutôt de vos recettes actives ; il restera visible dans les historiques.

### Comment ajouter une activité ou un labo ?

Si votre abonnement dispose encore de capacité, créez-les directement dans [Mes activités](#activites). Sinon, envoyez une demande d''**Ajout de capacité** depuis l''écran [Demandes](#support) : un avenant vous est envoyé par e-mail pour signature, et la capacité est ajoutée automatiquement dès la signature (voir [Avenants](#onboarding-avenants)).

### Pourquoi ce produit n''est-il pas approvisionnable directement dans mon activité ?

C''est un produit fabriqué par votre **labo** (produit utilisable d''origine labo ou composé valorisé) : côté activité, il n''entre en stock que par **transfert** depuis le labo, jamais par saisie directe d''approvisionnement. Voir [Transferts](#transferts) et [le lexique des produits transformés](#lexique-pt).

### Que se passe-t-il si mon compte passe en lecture seule ?

Vous continuez à consulter tous vos écrans, historiques et rapports, mais toute saisie (approvisionnements, ventes, inventaires, productions…) est bloquée jusqu''à régularisation. Consultez votre [abonnement](#abonnement) et votre [historique de paiements](#historique-paiements), ou contactez l''équipe via [Demandes](#support).

### Comment retrouver une facture ?

Les **factures d''approvisionnement** se trouvent dans l''écran [Factures](#factures) de chaque activité ou labo : elles sont générées à la validation et re-téléchargeables à tout moment. Les **paiements d''abonnement** se consultent dans l''[historique des paiements](#historique-paiements). Vos **avenants signés** se téléchargent depuis l''écran [Demandes](#support).

### Pourquoi les montants sont-ils affichés en TTC alors que je saisis mes prix en HT ?

Vous saisissez les prix d''achat en HT avec leur taux de TVA ; LabFlow affiche ensuite les montants en TTC dans les stocks, les produits transformés, les rapports et les tableaux de bord, pour refléter ce que vous décaissez réellement. Détail dans [HT et TTC](#calc-ht-ttc).

### Le stock affiché ne correspond pas à mon stock réel, que faire ?

Faites un [inventaire](#inventaire) : comptez physiquement, saisissez les quantités constatées et validez. La validation enregistre les écarts et fait de votre comptage la **nouvelle référence** du stock. Voir aussi [Pourquoi mes chiffres ont changé ?](#faq-chiffres).

### Un gérant peut-il voir toutes mes activités ?

Non. Un gérant n''accède qu''aux activités et labos que vous lui avez affectés, avec un périmètre d''écrans limité. Le propriétaire du compte garde seul la main sur l''abonnement, les gérants et la capacité. Voir [Rôles et accès](#roles) et [Gérants](#gerants).

### Un ingrédient n''existe pas dans le catalogue, que faire ?

Vérifiez d''abord dans le [catalogue global](#catalogue-global) qu''il n''existe pas sous un autre nom ou une autre orthographe. S''il manque réellement, envoyez une demande **Besoin d''aide** depuis l''écran [Demandes](#support), en précisant le nom exact, la catégorie et l''unité souhaitées : une fois la demande traitée, l''ingrédient est ajouté au catalogue.

### Quelle est la différence entre un article et un produit ?

L''**article** est une matière première de votre [référentiel](#referentiel-articles) : il s''achète, se stocke et possède un prix d''achat et un PMP. Le **produit** est ce que vous fabriquez ou vendez : il possède une [fiche technique](#fiches-techniques) qui consomme des articles — et parfois d''autres produits. Voir le [lexique](#lexique).

### Comment fonctionnent les alertes de stock ?

Chaque article peut avoir un seuil : en dessous, il apparaît en stock critique. Les produits transformés disposent d''un seuil propre à chaque activité. Détail dans [Seuils et alertes](#calc-seuils).

### L''assistant IA a-t-il accès à mes données ?

Oui, mais uniquement à celles de **votre** compte : il s''en sert pour répondre à vos questions sur le stock, les pertes, les inventaires… Il doit d''abord être activé pour votre compte. Voir [Assistant IA](#assistant-ia).

### Comment déclarer une perte ?

Depuis l''écran de stock de l''activité ([Stock des activités](#stock-activites)) ou du labo ([Stock du labo](#stock-labo)) : l''action **Enregistrer une perte** sur la ligne de l''article ou du produit vous demande la quantité, le type de perte (avarie ou déchet) et la date. La perte est déduite du stock et valorisée en TTC dans vos rapports — détail dans [Pertes](#pertes).',
'## ❓ Questions fréquentes

Les réponses courtes aux questions les plus posées. Pour le détail, suivez les liens vers les fiches concernées.

### Puis-je modifier un approvisionnement déjà saisi ?

Oui, dans la plupart des cas : ouvrez l''[historique des approvisionnements](#historique) de l''activité ou du [labo](#stock-labo) concerné et corrigez la ligne. Attention : la correction recalcule le [prix moyen pondéré](#calc-pmp) de l''article, donc la valeur de votre stock et les coûts qui en découlent peuvent évoluer — c''est normal (voir [Pourquoi mes chiffres ont changé ?](#faq-chiffres)).

### Pourquoi je ne peux pas supprimer cet article ?

Un article déjà utilisé — présent dans une [fiche technique](#fiches-techniques) ou dans vos historiques d''approvisionnements, de stocks ou de ventes — ne peut pas être supprimé : sa suppression casserait la traçabilité de vos coûts et de vos stocks. Retirez-le plutôt de vos recettes actives ; il restera visible dans les historiques.

### Comment ajouter une activité ou un labo ?

Si votre abonnement dispose encore de capacité, créez-les directement dans [Mes activités](#activites). Sinon, envoyez une demande d''**Ajout de capacité** depuis l''écran [Demandes](#support) : un avenant vous est envoyé par e-mail pour signature, et la capacité est ajoutée automatiquement dès la signature (voir [Avenants](#onboarding-avenants)).

### Pourquoi ce produit n''est-il pas approvisionnable directement dans mon activité ?

C''est un produit fabriqué par votre **labo** (produit utilisable d''origine labo ou composé valorisé) : côté activité, il n''entre en stock que par **transfert** depuis le labo, jamais par saisie directe d''approvisionnement. Voir [Transferts](#transferts) et [le lexique des produits transformés](#lexique-pt).

### Que se passe-t-il si mon compte passe en lecture seule ?

Vous continuez à consulter tous vos écrans, historiques et rapports, mais toute saisie (approvisionnements, ventes, inventaires, productions…) est bloquée jusqu''à régularisation. Consultez votre [abonnement](#abonnement) et votre [historique de paiements](#historique-paiements), ou contactez l''équipe via [Demandes](#support).

### Comment retrouver une facture ?

Les **factures d''approvisionnement** se trouvent dans l''écran [Factures](#factures) de chaque activité ou labo : elles sont générées à la validation et re-téléchargeables à tout moment. Les **paiements d''abonnement** se consultent dans l''[historique des paiements](#historique-paiements). Vos **avenants signés** se téléchargent depuis l''écran [Demandes](#support).

### Pourquoi les montants sont-ils affichés en TTC alors que je saisis mes prix en HT ?

Vous saisissez les prix d''achat en HT avec leur taux de TVA ; LabFlow affiche ensuite les montants en TTC dans les stocks, les produits transformés, les rapports et les tableaux de bord, pour refléter ce que vous décaissez réellement. Détail dans [HT et TTC](#calc-ht-ttc).

### Le stock affiché ne correspond pas à mon stock réel, que faire ?

Faites un [inventaire](#inventaire) : comptez physiquement, saisissez les quantités constatées et validez. La validation enregistre les écarts et fait de votre comptage la **nouvelle référence** du stock. Voir aussi [Pourquoi mes chiffres ont changé ?](#faq-chiffres).

### Un gérant peut-il voir toutes mes activités ?

Non. Un gérant n''accède qu''aux activités et labos que vous lui avez affectés, avec un périmètre d''écrans limité. Le propriétaire du compte garde seul la main sur l''abonnement, les gérants et la capacité. Voir [Rôles et accès](#roles) et [Gérants](#gerants).

### Un ingrédient n''existe pas dans le catalogue, que faire ?

Vérifiez d''abord dans le [catalogue global](#catalogue-global) qu''il n''existe pas sous un autre nom ou une autre orthographe. S''il manque réellement, envoyez une demande **Besoin d''aide** depuis l''écran [Demandes](#support), en précisant le nom exact, la catégorie et l''unité souhaitées : une fois la demande traitée, l''ingrédient est ajouté au catalogue.

### Quelle est la différence entre un article et un produit ?

L''**article** est une matière première de votre [référentiel](#referentiel-articles) : il s''achète, se stocke et possède un prix d''achat et un PMP. Le **produit** est ce que vous fabriquez ou vendez : il possède une [fiche technique](#fiches-techniques) qui consomme des articles — et parfois d''autres produits. Voir le [lexique](#lexique).

### Comment fonctionnent les alertes de stock ?

Chaque article peut avoir un seuil : en dessous, il apparaît en stock critique. Les produits transformés disposent d''un seuil propre à chaque activité. Détail dans [Seuils et alertes](#calc-seuils).

### L''assistant IA a-t-il accès à mes données ?

Oui, mais uniquement à celles de **votre** compte : il s''en sert pour répondre à vos questions sur le stock, les pertes, les inventaires… Il doit d''abord être activé pour votre compte. Voir [Assistant IA](#assistant-ia).

### Comment déclarer une perte ?

Depuis l''écran de stock de l''activité ([Stock des activités](#stock-activites)) ou du labo ([Stock du labo](#stock-labo)) : l''action **Enregistrer une perte** sur la ligne de l''article ou du produit vous demande la quantité, le type de perte (avarie ou déchet) et la date. La perte est déduite du stock et valorisée en TTC dans vos rapports — détail dans [Pertes](#pertes).',
'faq, questions, réponses, aide, modifier appro, supprimer article, lecture seule, facture, activité, transfert, gérant, seuil', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant)
VALUES ('faq-chiffres', 'Pourquoi mes chiffres ont changé ?', '📊', 'FAQ', 98,
'## 📊 Pourquoi mes chiffres ont changé ?

Une valeur de stock, un coût de recette ou un montant de rapport n''est plus le même qu''hier ? Dans la grande majorité des cas, ce n''est pas une anomalie : voici les situations où les montants évoluent **légitimement**, et où regarder pour comprendre.

### 1. Vous avez validé un inventaire

La validation d''un [inventaire](#inventaire) remplace le stock théorique par vos quantités comptées : c''est la **nouvelle référence**. Les écarts, positifs ou négatifs, sont enregistrés, et la [valeur de stock](#calc-valeur-stock) est ajustée en conséquence. Les chiffres d''avant l''inventaire ne sont pas perdus : ils restent consultables dans l''historique.

### 2. Une appro passée a été modifiée

Corriger le prix ou la quantité d''un approvisionnement déjà saisi recalcule le [prix moyen pondéré](#calc-pmp) de l''article. Comme le PMP alimente la valeur de stock et le [coût des recettes](#calc-cout-recette), une correction sur une appro d''il y a trois semaines peut faire bouger vos coûts d''aujourd''hui. C''est le comportement attendu : le PMP reflète toujours la réalité corrigée de vos achats.

:::exemple
Vous aviez saisi 10 kg de beurre à 30 DT au lieu de 33 DT. Après correction, le PMP du beurre remonte légèrement — et le coût de toutes les recettes qui utilisent du beurre suit.
:::

### 3. Un transfert a été valorisé au prix de cession

Quand le labo transfère un produit à une activité, l''activité le reçoit **au prix de cession**, pas au coût matière du labo. Le même produit peut donc « valoir » un montant au labo et un autre dans l''activité : c''est le principe de la [valorisation des transferts](#calc-transferts), qui matérialise la valeur ajoutée du labo.

### 4. Vous comparez du HT et du TTC

Les prix d''achat se saisissent en HT avec leur taux de TVA, mais les stocks, produits transformés, rapports et tableaux de bord s''affichent en **TTC**. Si vous rapprochez un montant à l''écran d''une facture fournisseur en HT, l''écart correspond simplement à la TVA. Détail dans [HT et TTC](#calc-ht-ttc).

### 5. Le prix figé des composés valorisés

Un composé valorisé — produit vendable fabriqué par le labo — est valorisé à son **prix labo défini**, volontairement figé : il ne suit pas le coût matière au jour le jour. Si ce prix est modifié, seules les opérations **postérieures** utilisent le nouveau montant ; les mouvements passés conservent le prix en vigueur à leur date. Voir [Composés valorisés](#articles-valorises) et [Prix et valorisation](#calc-prix).

### 6. Deux productions identiques, deux coûts différents

Le coût d''une production de produit transformé est calculé avec le PMP des ingrédients **au moment de la production**. Si le PMP a bougé entre deux fabrications — nouvelles appros, corrections —, deux lots identiques n''auront pas le même coût, sans qu''aucune recette n''ait changé. Voir [Production des produits transformés](#calc-production-pt).

:::regle
Un montant vous semble toujours inexpliqué après ces vérifications ? Consultez la [traçabilité](#calc-tracabilite) et les [historiques](#historique) pour retrouver l''opération à l''origine du changement, puis contactez le [support](#support) si le doute persiste.
:::

### Voir aussi

- [PMP](#calc-pmp) · [Valeur de stock](#calc-valeur-stock) · [Coût de recette](#calc-cout-recette)
- [Transferts](#calc-transferts) · [HT / TTC](#calc-ht-ttc) · [Production PT](#calc-production-pt)
- [Inventaire](#inventaire) · [Questions fréquentes](#faq)',
'## 📊 Pourquoi mes chiffres ont changé ?

Une valeur de stock, un coût de recette ou un montant de rapport n''est plus le même qu''hier ? Dans la grande majorité des cas, ce n''est pas une anomalie : voici les situations où les montants évoluent **légitimement**, et où regarder pour comprendre.

### 1. Vous avez validé un inventaire

La validation d''un [inventaire](#inventaire) remplace le stock théorique par vos quantités comptées : c''est la **nouvelle référence**. Les écarts, positifs ou négatifs, sont enregistrés, et la [valeur de stock](#calc-valeur-stock) est ajustée en conséquence. Les chiffres d''avant l''inventaire ne sont pas perdus : ils restent consultables dans l''historique.

### 2. Une appro passée a été modifiée

Corriger le prix ou la quantité d''un approvisionnement déjà saisi recalcule le [prix moyen pondéré](#calc-pmp) de l''article. Comme le PMP alimente la valeur de stock et le [coût des recettes](#calc-cout-recette), une correction sur une appro d''il y a trois semaines peut faire bouger vos coûts d''aujourd''hui. C''est le comportement attendu : le PMP reflète toujours la réalité corrigée de vos achats.

:::exemple
Vous aviez saisi 10 kg de beurre à 30 DT au lieu de 33 DT. Après correction, le PMP du beurre remonte légèrement — et le coût de toutes les recettes qui utilisent du beurre suit.
:::

### 3. Un transfert a été valorisé au prix de cession

Quand le labo transfère un produit à une activité, l''activité le reçoit **au prix de cession**, pas au coût matière du labo. Le même produit peut donc « valoir » un montant au labo et un autre dans l''activité : c''est le principe de la [valorisation des transferts](#calc-transferts), qui matérialise la valeur ajoutée du labo.

### 4. Vous comparez du HT et du TTC

Les prix d''achat se saisissent en HT avec leur taux de TVA, mais les stocks, produits transformés, rapports et tableaux de bord s''affichent en **TTC**. Si vous rapprochez un montant à l''écran d''une facture fournisseur en HT, l''écart correspond simplement à la TVA. Détail dans [HT et TTC](#calc-ht-ttc).

### 5. Le prix figé des composés valorisés

Un composé valorisé — produit vendable fabriqué par le labo — est valorisé à son **prix labo défini**, volontairement figé : il ne suit pas le coût matière au jour le jour. Si ce prix est modifié, seules les opérations **postérieures** utilisent le nouveau montant ; les mouvements passés conservent le prix en vigueur à leur date. Voir [Composés valorisés](#articles-valorises) et [Prix et valorisation](#calc-prix).

### 6. Deux productions identiques, deux coûts différents

Le coût d''une production de produit transformé est calculé avec le PMP des ingrédients **au moment de la production**. Si le PMP a bougé entre deux fabrications — nouvelles appros, corrections —, deux lots identiques n''auront pas le même coût, sans qu''aucune recette n''ait changé. Voir [Production des produits transformés](#calc-production-pt).

:::regle
Un montant vous semble toujours inexpliqué après ces vérifications ? Consultez la [traçabilité](#calc-tracabilite) et les [historiques](#historique) pour retrouver l''opération à l''origine du changement, puis contactez le [support](#support) si le doute persiste.
:::

### Voir aussi

- [PMP](#calc-pmp) · [Valeur de stock](#calc-valeur-stock) · [Coût de recette](#calc-cout-recette)
- [Transferts](#calc-transferts) · [HT / TTC](#calc-ht-ttc) · [Production PT](#calc-production-pt)
- [Inventaire](#inventaire) · [Questions fréquentes](#faq)',
'chiffres, montants, changement, pmp, inventaire, valorisation, transfert, ttc, ht, prix figé, coût, recalcul', NULL, true)
ON CONFLICT (slug) DO UPDATE SET
  titre = EXCLUDED.titre,
  icone = EXCLUDED.icone,
  partie = EXCLUDED.partie,
  ordre = EXCLUDED.ordre,
  contenu = EXCLUDED.contenu,
  contenu_defaut = EXCLUDED.contenu_defaut,
  mots_cles = EXCLUDED.mots_cles,
  ecran = EXCLUDED.ecran,
  visible_gerant = EXCLUDED.visible_gerant,
  updated_at = NOW();
