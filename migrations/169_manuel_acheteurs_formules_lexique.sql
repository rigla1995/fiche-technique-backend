-- 169 — Manuel : rattrapage des fiches GÉNÉRALES sur le module Acheteurs, les
-- formules d'activités (Basique/Premium) et le compte dépôt.
-- Les 5 fiches « Espace Acheteurs » (migr 157/161/167) existaient déjà, mais le
-- lexique, le modèle de compte, les rôles, l'abonnement, les demandes, la
-- découverte et l'onboarding ne mentionnaient ni acheteur, ni base acheteurs,
-- ni palier, ni formule, ni compte dépôt.
--
-- RÈGLE DE NON-DESTRUCTION : contenu_defaut est TOUJOURS rafraîchi (le bouton
-- « réinitialiser » de l'admin donne la nouvelle version) ; contenu n'est
-- remplacé QUE s'il n'a pas été édité (contenu identique à l'ancien défaut).

-- ── 1. Lexique de A à Z ───────────────────────────────────────────────────────
WITH v AS (SELECT $m169lex$## 📖 Lexique LabFlow de A à Z

Ce lexique rassemble tout le vocabulaire utilisé dans LabFlow et dans ce manuel. Chaque terme est défini en une ou deux phrases, avec un exemple concret quand cela aide. Les montants sont exprimés en DT (dinar tunisien).

:::astuce
Utilisez la recherche de votre navigateur (Ctrl+F) pour retrouver un terme rapidement. Les notions liées aux produits transformés sont approfondies dans [Les 3 catégories de produits transformés](#lexique-pt).
:::

| Terme | Définition |
|---|---|
| **Acheteur** | Client professionnel (B2B) enregistré dans votre carnet d'acheteurs : épicerie, revendeur, restaurant… Il peut être invité sur son portail pour commander en ligne. Les ventes aux acheteurs partent toujours du stock d'un labo et donnent lieu à une facture de vente. |
| **Activité** | Point de vente ou cuisine exploité par votre compte : restaurant, pâtisserie, kiosque… Un compte gère une ou plusieurs activités, chacune avec son stock, ses produits, ses prix et ses ventes. |
| **Appro (approvisionnement)** | Entrée de marchandise dans le stock : vous saisissez la quantité, le prix d'achat HT et le taux de TVA. Un appro peut provenir d'un achat auprès d'un fournisseur, d'un transfert depuis le labo ou d'une production de produit transformé. |
| **Article** | Élément de base du référentiel : ingrédient ou produit acheté (farine, beurre, boisson…), défini par un nom, une unité et une catégorie. Le stock, les recettes et les coûts s'appuient tous sur les articles. |
| **Avenant** | Modification de votre contrat d'abonnement : ajout d'activités, de labos ou de gérants, activation ou changement de palier de l'option Acheteurs… L'avenant vous est envoyé par e-mail pour signature électronique et le document signé reste téléchargeable. |
| **Base acheteurs (option Acheteurs)** | Option de l'abonnement qui active l'Espace Acheteurs. Elle est facturée par palier selon la taille de votre carnet : jusqu'à 10, 20, 50 ou 100 acheteurs. Le passage à un palier supérieur se demande depuis la page Demandes ; le nouveau palier remplace l'ancien. |
| **Catégorie** | Deux notions distinctes : la *catégorie d'articles* (référentiel) affine une famille (ex. « Volaille » dans la famille « Viandes ») ; la *catégorie de produits* (Espace Produit) classe ce qui se vend (ex. « Desserts ») et est typée vendable, supplément ou valorisé. |
| **Charge** | Dépense d'exploitation hors matière première : énergie, emballages, main-d'œuvre… Saisie dans l'Espace Vente, elle affine l'analyse de rentabilité au-delà du seul coût matière. |
| **Coefficient multiplicateur** | Rapport entre le prix de vente et le coût matière d'un produit. Un plat dont la matière coûte 4 DT et vendu 12 DT a un coefficient de 3. |
| **Commande acheteur** | Commande passée par un acheteur depuis son portail, ou saisie directement en vente manuelle. Elle suit quatre états : en attente → expédiée (le stock du labo est déduit et la facture émise) → livrée ; une commande peut être annulée, le stock est alors réintégré. |
| **Composé valorisé** | Produit transformé fabriqué au labo puis transféré vers les activités, où il se vend tel quel (ex. un entremets fabriqué au labo et revendu en boutique). Son prix de revient est figé au coût du labo au moment de la production. |
| **Compte dépôt** | Compte sans point de vente : un labo et la base acheteurs. Le labo produit et vend directement aux professionnels — c'est le modèle de l'atelier ou du dépôt de production. |
| **Domaine d'activité** | Secteur métier de votre compte (restauration, pâtisserie, café…). Il détermine le catalogue d'articles qui vous est proposé à la création du compte. |
| **Famille** | Regroupement de catégories d'articles (« Viandes », « Boissons »…) portant deux propriétés clés : *consommable* (utilisé en cuisine) et *vendable* (vendu tel quel). Ces propriétés déterminent où chaque article peut être utilisé. |
| **Fiche technique** | Recette chiffrée d'un produit : liste des articles et produits utilisables avec leurs portions, et calcul automatique du coût de revient matière. C'est l'outil central du chiffrage de votre carte. |
| **Food cost (coût matière)** | Coût des matières premières consommées pour produire un plat, souvent rapporté à son prix de vente. Un plat vendu 15 DT dont les ingrédients coûtent 4,500 DT a un food cost de 30 %. |
| **Formule d'activités** | Niveau d'abonnement de vos activités. *Activité Basique* : stock, approvisionnements et ventes d'articles valorisés, sans l'Espace Produit complet. *Activité Premium* : tout LabFlow, y compris produits composés, fiches techniques et production. Le passage en Premium se demande depuis Mon abonnement ou la page Demandes. |
| **Fournisseur** | Tiers auprès duquel vous achetez vos marchandises. Il est associé aux approvisionnements et aux factures pour tracer l'origine de chaque achat. |
| **Gérant** | Utilisateur délégué par le propriétaire du compte. Son accès est limité aux activités et aux labos qui lui sont affectés. |
| **HT / TTC** | Hors taxes / toutes taxes comprises. Dans LabFlow, les prix d'achat se saisissent en HT avec le taux de TVA ; l'affichage courant (stock, produits transformés, rapports, tableaux de bord) est en TTC. |
| **Inventaire** | Comptage physique du stock à une date donnée. La quantité réelle saisie devient la nouvelle référence du stock ; le stock théorique affiché pendant la saisie permet de repérer les écarts. |
| **Labo** | Laboratoire central de production rattaché au compte. Il achète et fabrique en gros, alimente les activités par transfert — et, si l'option Acheteurs est active, vend directement aux professionnels. Un compte peut avoir zéro, un ou plusieurs labos. |
| **Marge** | Différence entre le prix de vente et le coût matière. Un dessert vendu 8 DT avec 2 DT de matière dégage 6 DT de marge brute. |
| **Mode de compte** | État d'accès du compte selon la situation de l'abonnement : *actif* (toutes les fonctions), *lecture seule* (consultation sans modification) ou *bloqué / désactivé* (accès restreint). |
| **Perte (avarie / déchet)** | Marchandise sortie du stock sans être vendue : *avarie* (produit périmé, abîmé, impropre) ou *déchet* (parures, casse, ratés de production). Chaque perte est valorisée en TTC dans les rapports. |
| **PMP** | Prix moyen pondéré : prix unitaire moyen d'un article, pondéré par les quantités achetées. 10 kg achetés à 8 DT puis 5 kg à 11 DT donnent un PMP de 9 DT/kg ; il sert à valoriser le stock et les transferts. |
| **Portail acheteur** | Espace en ligne dédié à chaque acheteur invité : il y consulte le catalogue à ses tarifs, passe commande et télécharge ses factures. Il ne voit jamais vos quantités en stock — seulement une disponibilité (disponible / rupture). |
| **Prestataire** | Canal de vente tiers (plateforme de livraison, revendeur…) pour lequel vous définissez un prix de vente dédié, saisi manuellement dans la configuration de vente. |
| **Produit transformé (PT)** | Produit fabriqué à partir d'une recette et suivi en stock : sa production déduit automatiquement les ingrédients et sous-préparations consommés. Trois catégories existent : utilisables, vendables et composés valorisés. |
| **Produit utilisable** | Produit transformé intermédiaire, non vendu tel quel, réutilisé dans d'autres recettes : crème pâtissière, sauce de base, pâte… Son coût se répercute automatiquement dans tous les produits qui l'utilisent. |
| **Produit valorisé** | Produit vendu tel quel, sans décomposition de recette au moment de la vente : article de revente (ex. boisson en bouteille) ou produit composé fabriqué au labo. |
| **Produit vendable** | Produit fini défini par une fiche technique et vendu par une activité : plat, dessert, formule… Il est obligatoirement rattaché à une catégorie de produit. |
| **PV (prix de vente)** | Prix auquel un produit est vendu au client. LabFlow distingue le prix direct (vente au comptoir) et les prix propres à chaque prestataire. |
| **Recette** | Composition d'un produit : articles et produits utilisables avec leurs portions. Elle sert à la fois au calcul du coût de revient et à la déduction du stock. |
| **Référentiel** | Socle de données du compte : unités, familles, catégories et articles. Tout le reste (stock, recettes, ventes) s'appuie dessus. |
| **Seuil d'alerte** | Quantité minimale définie pour un article ou un produit transformé : lorsque le stock passe en dessous, la ligne est signalée pour réapprovisionnement. Pour les produits transformés, le seuil se règle par activité. |
| **Stock théorique** | Stock calculé par l'application : dernier inventaire + approvisionnements − pertes − transferts sortants − consommations (ventes, productions). L'inventaire le réconcilie avec le stock réel compté. |
| **Supplément** | Produit vendable complémentaire proposé en plus d'un produit principal : sauce, garniture, extra… Il a sa propre fiche technique et son propre prix de vente. |
| **Timbre fiscal** | Droit de timbre ajouté au total d'une facture de vente aux acheteurs (montant fixe en DT, désactivable à la vente). |
| **Transfert** | Mouvement de marchandise du labo vers une activité : le stock du labo diminue, celui de l'activité augmente, au coût du labo. C'est la seule voie d'entrée en stock, côté activité, des produits fabriqués au labo. |
| **TVA** | Taxe sur la valeur ajoutée. Le taux se saisit à l'approvisionnement, article par article, et sert au calcul des prix TTC. |
| **Unité** | Unité de mesure d'un article : kg, litre, gramme, pièce, portion… Utilisez la même unité à l'achat et en recette pour obtenir des coûts justes. |
| **Valorisation** | Expression en argent d'une quantité : valeur du stock, d'une perte ou d'une production, obtenue en multipliant la quantité par le prix unitaire (PMP ou coût de recette). |

### Voir aussi

- [Les 3 catégories de produits transformés](#lexique-pt) — le détail des PT utilisables, vendables et composés valorisés
- [Le module Acheteurs](#acheteurs-module) — la vente aux professionnels de A à Z
- [Un compte, des activités, des labos](#compte-activites-labos) et [Rôles & accès](#roles) — l'organisation de votre compte
- [Le coût d'une recette](#calc-cout-recette), [Le PMP](#calc-pmp) et [HT et TTC](#calc-ht-ttc) — les calculs expliqués pas à pas
- [Les seuils d'alerte](#calc-seuils) et [La valeur du stock](#calc-valeur-stock)$m169lex$::text AS c)
UPDATE manuel_sections m SET
  contenu = CASE WHEN m.contenu IS NOT DISTINCT FROM m.contenu_defaut THEN v.c ELSE m.contenu END,
  contenu_defaut = v.c,
  mots_cles = 'lexique, glossaire, définitions, vocabulaire, termes, dictionnaire, abréviations, pmp, food cost, coût matière, ht ttc, pt, acheteur, base acheteurs, palier, portail, compte dépôt, formule basique premium, timbre fiscal',
  updated_at = NOW()
FROM v WHERE m.slug = 'lexique';

-- ── 2. Le modèle : compte, activités, labos ──────────────────────────────────
WITH v AS (SELECT $m169cmp$## 🏢 Le modèle : compte, activités, labos

Toute l'organisation de LabFlow repose sur trois niveaux : le **compte**, les **activités** et les **labos**. Comprendre qui possède quoi est la clé de lecture de tous les autres écrans.

### Les trois niveaux

- **Le compte** : c'est votre entreprise dans LabFlow. Il porte l'abonnement, qui fixe vos quotas : nombre d'activités, de labos et de comptes gérants — et, si l'option Acheteurs est active, le palier d'acheteurs. Il porte aussi la **formule d'activités** (Basique ou Premium), qui détermine l'étendue de l'Espace Produit. Les compteurs d'activités et de labos s'affichent sur la page Mes Activités, celui des gérants sur la page Gérants. Il n'y a pas de distinction entre indépendant et entreprise : le même modèle s'adapte à toutes les tailles.
- **Les activités (0 à N)** : vos points de vente ou cuisines — boutique, restaurant, kiosque… Chaque activité vend, consomme et gère son propre stock.
- **Les labos (0 à N)** : vos sites de production. Un labo fabrique des produits transformés, approvisionne les activités qui lui sont rattachées **exclusivement par transfert** — et, avec l'option Acheteurs, vend directement aux professionnels.

### Qui possède quoi ?

| Élément | Niveau | En pratique |
|---|---|---|
| Référentiel (unités, familles, catégories, articles) | Compte | Défini une seule fois, partagé par tous les sites |
| Sélection d'articles | Activité / labo | Chaque site n'utilise que les articles qu'on lui a assignés |
| Stock, appros, inventaires, pertes | Activité / labo | Chaque site a les siens, suivis séparément |
| Produits et fiches techniques | Activité / labo | Un produit est affecté aux sites qui le fabriquent ou le vendent |
| Ventes et prix de vente | Activité / labo | Chaque point de vente a ses prix et ses ventes ; le labo peut aussi saisir ses ventes directes |
| Carnet d'acheteurs et tarifs B2B | Compte | Communs à tous les labos ; les ventes aux acheteurs partent du stock d'un labo |

### Le lien activité ↔ labo

Dès qu'un labo existe sur votre compte, la création ou la modification d'une activité vous propose deux options :

- **Avec labo** : l'activité est rattachée à un labo qui l'approvisionne par transfert — la production du labo arrive dans le stock de la boutique à chaque transfert.
- **Sans labo** : l'activité gère seule ses approvisionnements auprès de ses fournisseurs.

Une même entreprise peut mélanger les deux : des boutiques rattachées au labo et un point de vente autonome, par exemple.

### La base acheteurs et le compte dépôt

Avec l'**option Acheteurs**, le labo ne fait pas que produire pour vos boutiques : il vend aussi **directement aux professionnels** (épiceries, revendeurs, restaurants…). Le carnet d'acheteurs, les tarifs B2B, les commandes et le portail en ligne sont réunis dans l'[Espace Acheteurs](#acheteurs-module).

- L'option nécessite **au moins un labo** : les ventes aux acheteurs partent toujours du stock d'un labo.
- Elle est facturée **par palier** selon la taille du carnet : jusqu'à 10, 20, 50 ou 100 acheteurs.
- Un **compte dépôt** est un compte **sans activité** : un labo + la base acheteurs. C'est le modèle de l'atelier de production qui ne vend qu'aux professionnels.

### Quatre exemples concrets

- **Pâtisserie avec labo central** : 1 labo + 3 boutiques. Le labo produit crèmes, entremets et viennoiseries ; chaque boutique reçoit sa production par transfert et saisit ses propres ventes. Le référentiel (farine, beurre, sucre…) est commun à tous.
- **Restaurant simple** : 1 activité, 0 labo. Le restaurant fait ses achats, ses fiches techniques et ses ventes ; le modèle reste le même, simplement sans Espace Labo.
- **Traiteur multi-sites** : 1 labo de production + 2 points de vente. Le labo prépare, les sites vendent, et les rapports donnent la vision d'ensemble du compte.
- **Atelier en dépôt** : 0 activité, 1 labo + base acheteurs. L'atelier produit et vend exclusivement à ses clients professionnels, via l'Espace Acheteurs et le portail de commande.

:::regle
Le référentiel est commun au compte ; les stocks sont locaux à chaque site. Un article se crée une seule fois, mais son stock et son prix moyen pondéré vivent séparément dans chaque activité et chaque labo.
:::

:::attention
Un produit transformé d'origine labo ne peut être approvisionné côté activité que par transfert : pas de saisie d'achat directe pour ces produits en boutique. Voir [les produits transformés](#lexique-pt).
:::

### Voir aussi

- [Parcours de démarrage](#demarrage)
- [Activités](#activites) — l'écran de gestion de vos sites
- [Le module Acheteurs](#acheteurs-module) — la vente aux professionnels
- [Transferts](#transferts)
- [Rôles & accès](#roles)
- [Calculs : les transferts](#calc-transferts)$m169cmp$::text AS c)
UPDATE manuel_sections m SET
  contenu = CASE WHEN m.contenu IS NOT DISTINCT FROM m.contenu_defaut THEN v.c ELSE m.contenu END,
  contenu_defaut = v.c,
  mots_cles = 'compte, activité, labo, point de vente, laboratoire, modèle, organisation, multi-sites, transfert, référentiel commun, quotas, rattachement, acheteurs, compte dépôt, formule, palier',
  updated_at = NOW()
FROM v WHERE m.slug = 'compte-activites-labos';

-- ── 3. Rôles & accès ──────────────────────────────────────────────────────────
WITH v AS (SELECT $m169rol$## 👤 Rôles & accès

Un compte LabFlow distingue deux rôles internes : le **client**, propriétaire du compte, et le **gérant**, collaborateur invité sur un périmètre précis. S'y ajoutent l'**acheteur** — un client professionnel externe qui n'accède qu'à son portail de commande — et le **mode du compte** (actif, lecture seule, bloqué), qui dépend de la situation de votre abonnement.

### Le client (propriétaire)

Le client dispose de l'accès complet : activités et labos, référentiel, produits et fiches techniques, stocks, ventes, rapports, fournisseurs — ainsi que les pages réservées au propriétaire :

- **Mes Activités** : création et modification des sites ;
- **Gérants** : invitation et gestion des collaborateurs ;
- **Mon abonnement** et **Historique paiements** ;
- dans l'Espace Vente : **Config Charges** et **Rapport Vente**.

### Le gérant (collaborateur)

Le gérant est créé par le client depuis la page [Gérants](#gerants) : nom, téléphone, e-mail, et surtout **les activités et labos qui lui sont assignés** (au moins un est obligatoire). Il reçoit une invitation par e-mail et active lui-même son compte.

- Son périmètre est limité aux activités et labos affectés : il y travaille au quotidien (stocks, approvisionnements, inventaires, ventes…).
- Si l'option Acheteurs est active, il accède aussi à l'**Espace Acheteurs** (le carnet est commun au compte) ; ses ventes aux acheteurs sont limitées aux labos de son périmètre.
- Il ne voit pas les pages réservées au propriétaire listées ci-dessus ; sa page « Mon abonnement » est un résumé en lecture seule (statut du compte et configuration incluse).
- Dans les historiques (approvisionnements, pertes, inventaires), il ne peut modifier ou supprimer que les opérations qu'il a lui-même saisies.
- Le client peut à tout moment le **désactiver** (accès suspendu, sans suppression), le **réactiver**, renvoyer l'invitation ou le supprimer.

Jusqu'à 3 comptes gérants sont inclus ; au-delà, chaque gérant supplémentaire est facturé **80 DT/mois** et soumis à validation, dans la limite du quota de votre abonnement.

### L'acheteur (portail de commande)

Si l'option Acheteurs est active, chaque acheteur de votre carnet peut être **invité** à créer son compte portail. Ce rôle est externe et volontairement très limité :

- il accède uniquement au **portail acheteur** : catalogue à ses tarifs, passage de commande, suivi de ses commandes et téléchargement de ses factures ;
- il ne voit **rien de votre gestion** : ni vos quantités en stock (seulement une disponibilité disponible / rupture), ni vos prix d'achat, ni aucune autre page de LabFlow ;
- vous gérez ses accès depuis le [Carnet d'Acheteurs](#acheteurs-carnet) : invitation, renvoi de l'invitation, désactivation ou suppression.

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
Le mode du compte s'applique à tous ses utilisateurs : si le compte passe en lecture seule, les gérants sont eux aussi limités à la consultation.
:::

:::astuce
En lecture seule, vos données restent consultables : rien n'est perdu. Régularisez le paiement depuis Mon abonnement pour retrouver toutes les fonctions.
:::

### Voir aussi

- [Gérants](#gerants) — créer et gérer les collaborateurs
- [Le portail acheteur](#acheteurs-portail) — l'espace de vos clients professionnels
- [Tableau de bord gérant](#dashboard-gerant)
- [Abonnement](#abonnement)
- [Support](#support)
- [Le modèle : compte, activités, labos](#compte-activites-labos)$m169rol$::text AS c)
UPDATE manuel_sections m SET
  contenu = CASE WHEN m.contenu IS NOT DISTINCT FROM m.contenu_defaut THEN v.c ELSE m.contenu END,
  contenu_defaut = v.c,
  mots_cles = 'rôles, client, propriétaire, gérant, collaborateur, accès, permissions, périmètre, lecture seule, bloqué, invitation, abonnement, acheteur, portail',
  updated_at = NOW()
FROM v WHERE m.slug = 'roles';

-- ── 4. Mon abonnement ─────────────────────────────────────────────────────────
WITH v AS (SELECT $m169abo$## 💳 Mon abonnement

Cet écran récapitule votre formule LabFlow : configuration incluse, formule d'activités, option Acheteurs, tarifs, promotions actives, état du compte, contrat et module vente. Vous le trouvez en bas du menu latéral, entrée **Mon abonnement**.

### Ce que vous voyez

Le bandeau rappelle votre date de début d'abonnement et affiche l'**état du compte** :

| État | Signification |
|---|---|
| ✅ Actif | Compte pleinement opérationnel |
| ⚠️ Lecture seule | Paiement en attente — création et modification bloquées |
| 🚫 Suspendu | Compte suspendu, contactez l'administrateur |
| 📦 Archivé | Compte archivé suite à non-paiement |

- **⚙️ Votre configuration** : le nombre d'**activités**, de **labos** et de **gérants** inclus (mention *Non inclus* sinon), votre **formule d'activités** (badge 📦 *Activité Basique* ou 💎 *Activité Premium*, dès qu'une activité est incluse), une éventuelle **prolongation** accordée en jours, et le bouton **📄 Contrat actif** qui télécharge votre contrat signé au format PDF (avec sa date).
- **💰 Votre tarification** : le détail de la **tarification mensuelle** poste par poste (activités selon la formule, labos et gérants avec leur prix unitaire en DT, et — si elle est active — la ligne **🤝 Option Acheteurs** avec son palier « jusqu'à N acheteurs ») et le **Total mensuel**. Si une promotion s'applique, l'ancien prix apparaît barré avec la mention 🎉 *Promotion appliquée*. Le cas échéant, la section **Tarification onboarding** affiche les frais d'intégration (montant unique en DT) et leur statut (payé, en attente…).
- Des bandeaux **🏷️ Promotion — Supplément Activité / Labo / Gérant** apparaissent quand une promotion est active sur un supplément : gratuité, pourcentage de réduction ou prix fixe, avec sa date de fin ou la mention *Permanente*.
- **🛒 Module Vente** : son statut (✅ Actif / 🔒 Inactif). S'il est inactif, le bouton **🚀 Demander l'activation** envoie une demande à l'équipe LabFlow ; en attendant la validation, la mention ⏳ *Demande en attente* s'affiche.
- **⭐ Passage en formule Premium** : si votre compte est en formule *Activité Basique*, un bouton vous permet de demander le passage en *Premium* (Espace Produit complet : produits composés, fiches techniques, production). La demande est validée par l'équipe LabFlow ; en attendant, la mention ⏳ *Demande en attente* s'affiche.

### Actions pas à pas

1. **Télécharger votre contrat** : cliquez sur *📄 Contrat actif* dans la carte Configuration — le PDF signé s'enregistre sur votre appareil.
2. **Activer le module vente** : cliquez *🚀 Demander l'activation* ; l'équipe LabFlow valide la demande, puis l'Espace Vente apparaît dans votre menu.
3. **Passer en formule Premium** (comptes Basique) : cliquez sur le bouton de demande — dès validation, l'Espace Produit complet se déverrouille.
4. **Demander plus d'activités, de labos ou de gérants** : la demande de supplément se fait depuis l'écran [Activités](#activites) (bouton ⚡ quand le quota est atteint) ou via la page [Demandes](#support). Les promotions de supplément affichées ici s'appliqueront au tarif.
5. **Activer l'option Acheteurs ou changer de palier** : passez par la page [Demandes](#support) (Ajout de capacité) — un avenant à signer vous est envoyé, et le palier s'applique dès la signature.

### Points d'attention

:::attention
Un retard de paiement fait passer le compte en **lecture seule** (consultation possible, mais plus de saisie), puis peut mener à la suspension. Régularisez votre mensualité pour rétablir l'accès complet.
:::

:::astuce
Vérifiez les bandeaux de promotion avant de demander un supplément : une promotion active peut rendre l'ajout d'un labo ou d'un gérant temporairement gratuit ou remisé.
:::

### Voir aussi

- [Historique des paiements](#historique-paiements) — mensualités et factures
- [Le contrat d'onboarding](#onboarding-contrat) · [Avenants](#onboarding-avenants)
- [Le module Acheteurs](#acheteurs-module) — ce que couvre l'option
- [Activités & labos](#activites) · [Comptes gérants](#gerants) · [Support](#support)$m169abo$::text AS c)
UPDATE manuel_sections m SET
  contenu = CASE WHEN m.contenu IS NOT DISTINCT FROM m.contenu_defaut THEN v.c ELSE m.contenu END,
  contenu_defaut = v.c,
  mots_cles = 'abonnement, tarification, mensualité, configuration, contrat, promotion, module vente, lecture seule, suspendu, onboarding, supplément, formule, basique, premium, option acheteurs, palier',
  updated_at = NOW()
FROM v WHERE m.slug = 'abonnement';

-- ── 5. Demandes & support ─────────────────────────────────────────────────────
WITH v AS (SELECT $m169sup$## 💬 Demandes & support

L'écran **Demandes** vous met en relation avec l'équipe LabFlow : besoin d'aide, ingrédient absent du catalogue, ajout de capacité (activités, labos, gérants, option Acheteurs), passage en formule Premium. Vous le trouvez dans le menu latéral, entrée **Demandes**. L'équipe répond sous 24 h.

### Ce que vous voyez

- Un bandeau d'en-tête avec le bouton **+ Nouvelle demande** et, le cas échéant, le nombre de demandes **en attente**.
- Une barre de filtres : par statut (**Toutes**, **En attente**, **Validées**, **Refusées**, avec compteurs) et par plage de dates.
- La liste de vos demandes, 5 par page : type, date, statut coloré (jaune = en attente, vert = validée, rouge = refusée) et résumé du contenu.
- Sous une demande traitée, l'encart **Réponse de l'administration**, avec la date de traitement.
- Si une demande a été créée par l'un de vos gérants, un badge « par … » en indique l'auteur.

### Les types de demandes

| Type | Usage |
|---|---|
| 💬 Besoin d'aide | Décrire un problème, poser une question, suggérer une fonctionnalité ou demander l'ajout d'un ingrédient au catalogue |
| ➕ Ajout de capacité | Ajouter des activités, des labos ou des gérants — et activer l'option Acheteurs ou passer à un palier supérieur |
| ⭐ Passer en formule Premium | Proposé si votre compte est en formule *Activité Basique* : demande le déblocage de l'Espace Produit complet (validation par l'équipe LabFlow, sans avenant) |

Vos éventuelles anciennes demandes « 🥕 Ingrédient manquant » restent visibles dans le suivi, mais ce type n'est plus proposé à la création : pour un ingrédient absent du catalogue, passez désormais par une demande **Besoin d'aide**.

### Actions pas à pas

**Envoyer une demande d'aide**

1. Cliquez sur **+ Nouvelle demande**, puis choisissez **Besoin d'aide**.
2. Décrivez votre besoin dans la zone de texte, puis cliquez sur **Envoyer la demande**.
3. Suivez son statut dans la liste : la cloche de notifications vous avertit quand elle est traitée.

**Demander un ajout de capacité (propriétaire du compte uniquement)**

1. Choisissez **Ajout de capacité** — ou passez par les boutons **⚡ Ajouter activités** / **⚡ Ajouter labos** de l'écran [Mes activités](#activites), affichés lorsque la limite de votre abonnement est atteinte.
2. Votre configuration actuelle s'affiche ; réglez avec les compteurs le nombre d'activités, de labos et de gérants supplémentaires. Le prix par unité et par mois s'affiche en DT ; si une promotion est active, l'ancien prix apparaît barré et le prix remisé en vert.
3. **Option Acheteurs** : le bloc 🤝 vous propose d'activer l'option ou de passer à un palier supérieur (jusqu'à 20, 50 ou 100 acheteurs), avec le prix de chaque palier. Le nouveau palier **remplace** l'actuel — la différence de mensualité s'affiche. L'option nécessite au moins un labo, existant ou ajouté dans la même demande.
4. Avant l'envoi, le **nouveau total estimé** de votre mensualité s'affiche en DT/mois, promotion comprise le cas échéant.
5. Après l'envoi, un **avenant** à votre contrat est généré : vous recevez par e-mail un lien de signature. Dès la signature, la capacité (et le palier acheteurs demandé) est appliquée automatiquement à votre compte.
6. Une fois la demande validée, le bouton **Contrat avenant** vous permet de télécharger le document signé (PDF).

**Demander le passage en formule Premium (comptes Basique)**

1. Cliquez sur **+ Nouvelle demande**, puis sur la carte **⭐ Passer en formule Activité Premium** (également accessible depuis [Mon abonnement](#abonnement)).
2. La demande part immédiatement — une seule demande à la fois, l'équipe LabFlow la valide.
3. Dès validation, l'Espace Produit complet (produits composés, fiches techniques, production) se déverrouille.

**Demander un ingrédient absent du catalogue**

1. Vérifiez d'abord dans vos [Articles](#referentiel-articles) que l'ingrédient n'existe pas sous un autre nom ou une autre orthographe.
2. Envoyez une demande **Besoin d'aide** en précisant le **nom exact de l'ingrédient**, sa catégorie et son unité.
3. Une fois la demande traitée par l'administration, vous pouvez créer l'article dans votre [référentiel](#referentiel-articles) — chaque compte gère ses propres articles.

**Annuler une demande**

1. Tant qu'une demande est **En attente**, le bouton **Supprimer** apparaît sur sa ligne (une confirmation vous est demandée).
2. Une fois traitée — validée ou refusée — elle ne peut plus être supprimée et reste dans votre suivi.

### Points d'attention

:::attention
La demande d'ajout de capacité est réservée au propriétaire du compte : elle engage l'abonnement via un avenant à signer. Les gérants n'y ont pas accès et ne peuvent envoyer que des demandes d'aide.
:::

:::regle
Le palier acheteurs demandé **remplace** le palier actuel (les paliers ne s'additionnent pas), et l'option Acheteurs exige au moins un labo. À la signature de l'avenant, le module s'active tout seul : l'Espace Acheteurs apparaît dans votre menu.
:::

:::astuce
Pour une réponse rapide, décrivez précisément votre besoin : l'écran concerné, l'activité ou le labo, ce que vous avez fait, ce que vous attendiez et ce qui s'est produit. Faites une demande par sujet : le suivi n'en sera que plus clair.
:::

### Voir aussi

- [Abonnement](#abonnement) et [Avenants](#onboarding-avenants) — l'impact d'un ajout de capacité
- [Le module Acheteurs](#acheteurs-module) — ce que couvre l'option
- [Mes activités](#activites), [Gérants](#gerants)
- [Articles](#referentiel-articles) — votre référentiel d'articles
- [Assistant IA](#assistant-ia) et [Questions fréquentes](#faq) — pour une réponse immédiate$m169sup$::text AS c)
UPDATE manuel_sections m SET
  contenu = CASE WHEN m.contenu IS NOT DISTINCT FROM m.contenu_defaut THEN v.c ELSE m.contenu END,
  contenu_defaut = v.c,
  mots_cles = 'support, demandes, aide, assistance, ingrédient manquant, capacité, avenant, signature, statut, ticket, réclamation, contact, option acheteurs, palier, formule premium',
  updated_at = NOW()
FROM v WHERE m.slug = 'support';

-- ── 6. Onboarding : configuration initiale ────────────────────────────────────
WITH v AS (SELECT $m169cfg$## 🧭 Configuration initiale

À votre première connexion, LabFlow vous guide pas à pas pour mettre votre espace en ordre de marche. Le point de départ est la page **Mes activités** ; le menu latéral s'ouvre progressivement au fil de votre avancement.

### Ce que vous voyez

- au départ, une carte de bienvenue « Démarrez votre activité » rappelant ce que votre abonnement inclut (nombre d'activités et de labos), avec le bouton **✨ Créer mon business** si votre abonnement inclut un labo, ou **+ Ajouter mon activité** sinon — pour un **compte dépôt** (labo + base acheteurs, sans activité), la carte devient « Démarrez votre labo » avec le bouton **🏭 Créer mon labo** ;
- des compteurs indiquant l'utilisation de votre abonnement (par exemple 1 / 3 activités) ;
- dans le menu latéral, un bandeau qui vous indique la prochaine étape à accomplir, tant que la configuration n'est pas terminée.

### Actions pas à pas

1. **Créez votre labo et vos activités.** Le bouton « Créer mon business » ouvre un assistant en deux étapes : d'abord le **Laboratoire** (nom, référence unique, adresse — vous pouvez cocher « Passer cette étape » si vous n'en avez pas encore besoin), puis vos **Activités** (nom, adresse et, si vous créez un labo, le choix « Avec labo » ou « Sans labo » pour chacune). Ajoutez autant d'activités que votre abonnement le permet, puis validez avec **Enregistrer tout**.
2. **Constituez votre référentiel.** Dès votre première activité ou votre labo créé, le Référentiel se déverrouille dans le menu : créez vos unités, familles et catégories, puis vos articles (nom, unité, catégorie).
3. **Affectez vos articles.** Sélectionnez, pour chaque activité et pour le labo, les articles qui y sont utilisés. Les espaces Activités et Labo se déverrouillent dès qu'un article leur est affecté ; l'Espace Produits s'ouvre dès votre premier article créé.
4. **Saisissez vos premiers approvisionnements.** Rendez-vous dans le stock pour enregistrer vos premières entrées (prix d'achat saisis en HT avec leur taux de TVA) : vos quantités et la valeur de votre stock commencent à vivre.
5. **Consultez votre tableau de bord.** Il devient accessible dès la création de vos activités et se remplit au fil de vos saisies.

### Points d'attention

:::regle
**Compte dépôt** (labo + base acheteurs, sans activité) : l'assistant se résume à la création du labo. Constituez ensuite le référentiel, affectez vos articles au labo, puis configurez l'[Espace Acheteurs](#acheteurs-module) : articles commandables, carnet d'acheteurs et tarifs B2B — votre suivi de mise en route intègre cette étape.
:::

:::astuce
La progression est entièrement automatique : l'application détecte vos données réelles (activités créées, articles affectés) et ouvre les menus correspondants. Rien n'est à valider manuellement, et vous ne pouvez pas sauter une étape par erreur.
:::

:::attention
Le nombre d'activités et de labos est plafonné par votre abonnement (compteurs affichés en haut de la page). Une fois la limite atteinte, le bouton « ⚡ Ajouter activités » vous oriente vers une demande d'ajout de capacité — voir [Avenants & résiliation](#onboarding-avenants).
:::

### Voir aussi

- [Compte, activités et labos](#compte-activites-labos)
- [Le module Acheteurs](#acheteurs-module)
- [Unités](#referentiel-unites) · [Articles](#referentiel-articles)
- [Stock des activités](#stock-activites)
- [Tableau de bord](#dashboard)$m169cfg$::text AS c)
UPDATE manuel_sections m SET
  contenu = CASE WHEN m.contenu IS NOT DISTINCT FROM m.contenu_defaut THEN v.c ELSE m.contenu END,
  contenu_defaut = v.c,
  mots_cles = 'configuration, première connexion, activités, labo, assistant, articles, référentiel, approvisionnement, déverrouillage, menu, tableau de bord, parcours guidé, compte dépôt, acheteurs',
  updated_at = NOW()
FROM v WHERE m.slug = 'onboarding-configuration';

-- ── 7. Onboarding : avenants & résiliation ────────────────────────────────────
WITH v AS (SELECT $m169avn$## 📑 Avenants & résiliation

Votre abonnement évolue avec votre entreprise : vous pouvez à tout moment demander des activités, labos ou gérants supplémentaires — ou activer l'option Acheteurs et changer de palier — depuis la page **Demandes** du menu. Chaque ajout de capacité donne lieu à un avenant au contrat, signé électroniquement.

### Ce que vous voyez

- le bouton **+ Nouvelle demande** en haut de la page ;
- la liste de vos demandes avec leur statut — **En attente**, **Validée** ou **Refusée** — filtrable par statut et par période ;
- pour une demande d'ajout de capacité : un encart indiquant que le contrat avenant a été envoyé à votre adresse email, son état (en attente de signature ou signé), puis un bouton pour télécharger le contrat avenant signé.

### Demander de la capacité supplémentaire

1. Cliquez sur **+ Nouvelle demande**, puis choisissez **Ajout de capacité**.
2. Le formulaire rappelle votre configuration actuelle et affiche le prix de chaque supplément en DT, par unité et par mois (activité, labo, gérant), promotions éventuelles comprises.
3. Réglez les compteurs + / − et, si vous le souhaitez, choisissez un **palier de l'option Acheteurs** (activation ou passage à un palier supérieur — le prix du palier s'affiche) ; le bloc « Nouveau total estimé » calcule en direct votre future mensualité en DT.
4. Cliquez sur **Envoyer la demande** : votre avenant est généré et un email de signature vous est envoyé immédiatement.
5. Ouvrez l'email « Signature de votre avenant d'abonnement » et cliquez sur **Consulter et signer mon avenant**.
6. Dès la signature, la capacité supplémentaire est **appliquée automatiquement** à votre compte : la demande passe en « Validée », vous recevez une notification et pouvez utiliser vos nouvelles activités, labos, gérants — et, le cas échéant, votre nouveau palier acheteurs — sans autre démarche.
7. Le contrat avenant signé reste ensuite téléchargeable depuis la demande concernée.

### Résiliation

À la clôture de votre abonnement, vous recevez par email un **acte de résiliation** à signer électroniquement (bouton « Consulter et signer l'acte »). Ce document formalise la fin de votre abonnement ; la signature se fait entièrement en ligne, comme pour le contrat initial.

### Points d'attention

:::attention
Tant que l'avenant n'est pas signé, la demande reste « En attente » et la capacité n'est pas ajoutée. Une demande en attente peut être supprimée si vous changez d'avis (bouton « Supprimer »).
:::

:::regle
Le palier acheteurs demandé **remplace** le palier actuel (les paliers ne s'additionnent pas), et l'option nécessite au moins un labo — existant ou ajouté dans la même demande.
:::

:::astuce
Le total estimé tient compte des promotions actives : le prix de base apparaît barré et le prix remisé s'affiche à côté. C'est ce montant qui figure sur l'avenant.
:::

### Voir aussi

- [Mes activités](#activites) · [Gérants](#gerants)
- [Le module Acheteurs](#acheteurs-module)
- [Mon abonnement](#abonnement) · [Historique des paiements](#historique-paiements)
- [Support & demandes](#support)$m169avn$::text AS c)
UPDATE manuel_sections m SET
  contenu = CASE WHEN m.contenu IS NOT DISTINCT FROM m.contenu_defaut THEN v.c ELSE m.contenu END,
  contenu_defaut = v.c,
  mots_cles = 'avenant, capacité, activité supplémentaire, labo supplémentaire, gérant supplémentaire, demande, signature électronique, résiliation, mensualité, contrat, promotion, option acheteurs, palier',
  updated_at = NOW()
FROM v WHERE m.slug = 'onboarding-avenants';

-- ── 8. Découvrir LabFlow ──────────────────────────────────────────────────────
WITH v AS (SELECT $m169dec$## 🌟 LabFlow en un coup d'œil

LabFlow est une application de gestion dédiée aux métiers de bouche : restaurants, pâtisseries, traiteurs, cuisines centrales. Elle réunit dans un seul outil tout ce qui fait la rentabilité d'une cuisine professionnelle : le référentiel d'articles, les fiches techniques et le coût matière, les stocks de chaque site, la production en laboratoire, les transferts entre sites, les ventes — au comptoir comme aux professionnels — et les rapports.

### Ce que LabFlow vous apporte

- **La maîtrise du coût matière** : chaque recette est décrite dans une fiche technique dont le coût de revient se calcule automatiquement à partir de vos prix d'achat réels. Quand un prix fournisseur évolue, vos coûts suivent.
- **Des stocks multi-sites** : chaque point de vente et chaque labo dispose de son propre stock, avec approvisionnements, inventaires, pertes et valeur de stock suivis site par site.
- **La production en laboratoire** : le labo fabrique vos produits transformés (crèmes, pâtes, plats préparés…), les ingrédients sont déduits automatiquement, et les boutiques sont approvisionnées par transfert.
- **La vente aux professionnels (B2B)** : avec l'option Acheteurs, votre labo vend directement à un carnet de clients professionnels — tarifs dédiés, commandes en ligne via un portail, factures de vente.
- **La traçabilité** : chaque mouvement laisse une trace consultable — approvisionnements, pertes, transferts, inventaires, ventes — avec filtres et exports dans les pages d'historique.
- **Les ventes et les marges** : la saisie des ventes déduit le stock et alimente vos indicateurs : chiffre d'affaires, food cost, marge brute, valeur du stock, pertes, panier moyen.

Tous les montants sont exprimés en **DT**. Les prix d'achat se saisissent en HT avec leur taux de TVA, et l'application affiche les valeurs en TTC dans les rapports et tableaux de bord (voir [la règle HT/TTC](#calc-ht-ttc)).

### Pour qui ?

LabFlow s'adapte à la taille de votre organisation grâce à un modèle unique : un compte regroupe une ou plusieurs **activités** (points de vente, cuisines) et, si besoin, un ou plusieurs **labos** de production.

- Le **restaurant indépendant** : une seule activité, tout se gère au même endroit.
- La **pâtisserie avec laboratoire central** : le labo produit, les boutiques vendent, les transferts font le lien.
- Le **traiteur ou groupe multi-sites** : plusieurs activités, chacune avec son stock et ses prix de vente, et des rapports pour piloter l'ensemble.
- L'**atelier de production en dépôt** : pas de point de vente — un labo et un carnet d'acheteurs professionnels, avec commandes via le portail.

Le détail de ce modèle est expliqué dans [Le modèle : compte, activités, labos](#compte-activites-labos).

### Les grands modules

| Module | Ce qu'il couvre |
|---|---|
| Référentiel | Unités, familles, catégories et articles : la base commune de votre compte |
| Espace Produits | Produits vendables, utilisables et valorisés, avec leurs fiches techniques |
| Espace Activités | Stock, approvisionnements, factures, pertes et inventaires de chaque point de vente |
| Espace Labo | Stock du labo, production, transferts vers les activités |
| Espace Vente | Prix de vente, prestataires, charges, saisie des ventes et rapport de vente |
| Espace Acheteurs *(option)* | Carnet d'acheteurs B2B, tarifs dédiés, ventes et commandes, portail en ligne, factures de vente |
| Gestion | Tableau de bord, rapports, fournisseurs, gérants, abonnement |

:::astuce
Sur la plupart des écrans, un petit bouton « ? » ouvre ce manuel directement à la page concernée. Vous retrouvez aussi le lien Manuel d'utilisation en bas du menu latéral.
:::

### Voir aussi

- [Le modèle : compte, activités, labos](#compte-activites-labos)
- [Parcours de démarrage](#demarrage)
- [Le module Acheteurs](#acheteurs-module)
- [Lexique](#lexique)
- [Tableau de bord](#dashboard)
- [Fiches techniques](#fiches-techniques)$m169dec$::text AS c)
UPDATE manuel_sections m SET
  contenu = CASE WHEN m.contenu IS NOT DISTINCT FROM m.contenu_defaut THEN v.c ELSE m.contenu END,
  contenu_defaut = v.c,
  mots_cles = 'présentation, découverte, coût matière, food cost, stocks multi-sites, labo, production, traçabilité, ventes, marges, modules, cuisine professionnelle, acheteurs, b2b, portail',
  updated_at = NOW()
FROM v WHERE m.slug = 'decouvrir-labflow';

-- ── 9. Parcours de démarrage ──────────────────────────────────────────────────
WITH v AS (SELECT $m169dem$## 🚀 Parcours de démarrage

LabFlow se découvre dans l'ordre : le menu latéral se **déverrouille progressivement** à mesure que votre compte se construit. Les entrées non encore accessibles sont grisées avec un cadenas 🔒, et un bandeau en haut du menu vous indique à chaque instant la prochaine action attendue.

### Comment le menu se déverrouille

| Ce que vous faites | Ce qui s'ouvre |
|---|---|
| Première connexion : changement du mot de passe | Mes Activités |
| Création de la première activité ou du labo | Référentiel, Tableau de bord, Rapports, Fournisseurs, Gérants |
| Création du premier article au référentiel | Espace Produits |
| Premier article sélectionné pour une activité | Espace Activités |
| Premier article affecté au labo | Espace Labo |

L'Espace Vente apparaît quant à lui lorsque le module vente est activé sur votre compte et qu'un premier article existe au référentiel ; l'Espace Acheteurs, dès que l'option Acheteurs est active. Dès la création de votre première activité ou de votre labo, l'application vous emmène automatiquement vers le Référentiel, à la page Unités : c'est la suite logique du parcours.

### Actions pas à pas

1. **Créez vos sites** — Dans **Mes Activités**, utilisez le bouton « Créer mon business » (proposé si votre abonnement inclut un labo) pour créer votre labo puis vos activités en deux étapes, ou « + Ajouter mon activité » sinon — sur un **compte dépôt** (sans activité), le bouton devient « 🏭 Créer mon labo ». Pour chaque activité approvisionnée par le labo, choisissez l'option « Avec labo ». Voir [Activités](#activites).
2. **Construisez le référentiel** — Dans l'ordre : [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories), puis [Articles](#referentiel-articles) avec leur prix d'achat HT et leur taux de TVA. Le menu Ajout Dynamique accélère la création en masse ([import](#referentiel-import)).
3. **Assignez les articles** — Indiquez quels articles sont utilisés par chaque activité et par le labo : c'est cette affectation qui déverrouille les espaces correspondants. Voir les [Articles](#referentiel-articles).
4. **Mettez vos stocks à niveau** — Saisissez vos approvisionnements dans [Stock Activités](#stock-activites) et [Stock Labo](#stock-labo) : quantités, prix, fournisseur. C'est de là que viennent vos coûts réels.
5. **Créez vos produits et fiches techniques** — Dans l'Espace Produits, composez vos recettes : le coût de revient se calcule automatiquement. Voir [Fiches techniques](#fiches-techniques) et [le calcul du coût de recette](#calc-cout-recette).
6. **Passez à la vente** — Configurez vos prix de vente ([Configuration Vente](#configuration-vente)) puis enregistrez vos ventes ([Saisie des ventes](#saisie-ventes)). Si l'option Acheteurs est active, configurez aussi vos [tarifs B2B](#acheteurs-tarifs) et votre [carnet d'acheteurs](#acheteurs-carnet).

### Points d'attention

:::attention
Tant qu'aucun article n'est assigné à une activité ou au labo, les espaces correspondants restent verrouillés — même si vos articles existent déjà au référentiel. Le bandeau du menu vous le rappelle.
:::

:::astuce
Créez d'abord toutes vos unités et familles avant d'attaquer les articles : vous éviterez les allers-retours. Et à tout moment, le bouton « ? » présent sur les écrans ouvre ce manuel à la bonne page.
:::

### Voir aussi

- [Le modèle : compte, activités, labos](#compte-activites-labos)
- [Suivi de l'onboarding](#onboarding-suivi)
- [Le module Acheteurs](#acheteurs-module)
- [Rôles & accès](#roles)
- [FAQ](#faq)$m169dem$::text AS c)
UPDATE manuel_sections m SET
  contenu = CASE WHEN m.contenu IS NOT DISTINCT FROM m.contenu_defaut THEN v.c ELSE m.contenu END,
  contenu_defaut = v.c,
  mots_cles = 'démarrage, premiers pas, prise en main, parcours, déverrouillage, menu, cadenas, onboarding, référentiel, articles, assignation, guide, compte dépôt, acheteurs',
  updated_at = NOW()
FROM v WHERE m.slug = 'demarrage';
