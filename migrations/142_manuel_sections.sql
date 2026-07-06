-- 142 : Centre d'aide — manuel d'utilisation éditable (refonte manuel, lot 1)
-- Le contenu (markdown) est servi par GET /api/manuel et édité depuis l'admin.
-- contenu_defaut = version d'origine (bouton « restaurer » côté admin).

CREATE TABLE IF NOT EXISTS manuel_sections (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  titre VARCHAR(200) NOT NULL,
  icone VARCHAR(16),
  partie VARCHAR(60) NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0,
  contenu TEXT NOT NULL,
  contenu_defaut TEXT,
  mots_cles TEXT,
  ecran VARCHAR(120),
  visible_gerant BOOLEAN NOT NULL DEFAULT true,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed : reprise du manuel v1 (GuidePage) converti en markdown.

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('demarrage', 'Bienvenue', '🚀', 'Prise en main', 1,
'## 🚀 Bienvenue sur LabFlow

LabFlow est votre outil de gestion complète de cuisine professionnelle : référentiel d''articles, fiches techniques et calcul de coûts, gestion des stocks et approvisionnements, transferts, inventaires, pertes, et module de vente.

L''application suit une **logique en cascade** : chaque étape débloque la suivante. Voici le parcours recommandé pour bien démarrer.

### Parcours de démarrage conseillé

1. **Référentiel** — Créez vos unités, familles, catégories puis vos articles (ingrédients et produits).
2. **Activités** — Déclarez vos points de vente / cuisines (et vos labos si vous êtes en mode entreprise).
3. **Sélection des articles** — Indiquez quels articles sont utilisés par chaque activité.
4. **Stock** — Saisissez vos approvisionnements (prix d''achat, TVA, quantités).
5. **Produits & Fiches techniques** — Composez vos recettes pour calculer leur coût de revient.
6. **Espace Vente** (optionnel) — Configurez les prix de vente puis enregistrez vos ventes.

### Repères dans l''interface

- Le **menu latéral** regroupe les espaces : Référentiel, Espace Produit, Stock/Appro, Espace Vente, Gestion.
- Un bouton **?** est présent sur la plupart des pages : il ouvre ce manuel directement à la bonne section.
- Les montants sont exprimés en **DT** (dinar tunisien).

:::astuce
Vous pouvez à tout moment revenir à ce manuel via le lien **Manuel d''utilisation** en bas du menu latéral.
:::',
'## 🚀 Bienvenue sur LabFlow

LabFlow est votre outil de gestion complète de cuisine professionnelle : référentiel d''articles, fiches techniques et calcul de coûts, gestion des stocks et approvisionnements, transferts, inventaires, pertes, et module de vente.

L''application suit une **logique en cascade** : chaque étape débloque la suivante. Voici le parcours recommandé pour bien démarrer.

### Parcours de démarrage conseillé

1. **Référentiel** — Créez vos unités, familles, catégories puis vos articles (ingrédients et produits).
2. **Activités** — Déclarez vos points de vente / cuisines (et vos labos si vous êtes en mode entreprise).
3. **Sélection des articles** — Indiquez quels articles sont utilisés par chaque activité.
4. **Stock** — Saisissez vos approvisionnements (prix d''achat, TVA, quantités).
5. **Produits & Fiches techniques** — Composez vos recettes pour calculer leur coût de revient.
6. **Espace Vente** (optionnel) — Configurez les prix de vente puis enregistrez vos ventes.

### Repères dans l''interface

- Le **menu latéral** regroupe les espaces : Référentiel, Espace Produit, Stock/Appro, Espace Vente, Gestion.
- Un bouton **?** est présent sur la plupart des pages : il ouvre ce manuel directement à la bonne section.
- Les montants sont exprimés en **DT** (dinar tunisien).

:::astuce
Vous pouvez à tout moment revenir à ce manuel via le lien **Manuel d''utilisation** en bas du menu latéral.
:::',
'démarrage, bienvenue, prise en main, parcours, premiers pas, guide, menu latéral, cascade, dinar', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('roles', 'Rôles & accès', '👤', 'Prise en main', 2,
'## 👤 Rôles, comptes et accès

Un compte LabFlow gère une ou plusieurs **activités** (points de vente, cuisines) et, si besoin, un ou plusieurs **labos centraux** qui les approvisionnent par transfert.

### Les rôles

- **Client** Propriétaire du compte. Accès complet à ses données.
- **Gérant** Utilisateur délégué, rattaché à une activité ou à un labo précis. Son accès est limité à son périmètre.

### État du compte (mode)

Selon votre abonnement et vos paiements, votre compte peut être en :

- **Actif** Toutes les fonctions sont disponibles.
- **Lecture seule** Vous pouvez consulter mais pas modifier (paiement en attente). Un bandeau vous en informe.
- **Bloqué / Désactivé** Accès restreint. Régularisez via la page Abonnement ou contactez le support.

:::attention
En mode lecture seule, les boutons d''enregistrement sont désactivés. Vous pouvez toujours créer une demande d''assistance pour débloquer votre compte.
:::',
'## 👤 Rôles, comptes et accès

Un compte LabFlow gère une ou plusieurs **activités** (points de vente, cuisines) et, si besoin, un ou plusieurs **labos centraux** qui les approvisionnent par transfert.

### Les rôles

- **Client** Propriétaire du compte. Accès complet à ses données.
- **Gérant** Utilisateur délégué, rattaché à une activité ou à un labo précis. Son accès est limité à son périmètre.

### État du compte (mode)

Selon votre abonnement et vos paiements, votre compte peut être en :

- **Actif** Toutes les fonctions sont disponibles.
- **Lecture seule** Vous pouvez consulter mais pas modifier (paiement en attente). Un bandeau vous en informe.
- **Bloqué / Désactivé** Accès restreint. Régularisez via la page Abonnement ou contactez le support.

:::attention
En mode lecture seule, les boutons d''enregistrement sont désactivés. Vous pouvez toujours créer une demande d''assistance pour débloquer votre compte.
:::',
'rôles, compte, client, gérant, accès, permissions, lecture seule, bloqué, activité, labo', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('referentiel-unites', 'Unités', '📏', 'Référentiel', 3,
'## 📏 Référentiel — Unités de mesure

Les unités définissent comment vous quantifiez vos articles : kilogramme (kg), litre (L), gramme (g), pièce, portion, boîte… Elles sont **obligatoires** pour créer un article.

### Créer une ou plusieurs unités

1. Allez dans **Référentiel → Unités**.
2. Cliquez sur **"Ajouter des unités"**.
3. Saisissez le nom de l''unité (ex. kg).
4. Utilisez **"+ Ajouter une ligne"** pour en saisir plusieurs d''un coup, puis **Enregistrer**.

### Modifier / Supprimer

L''icône ✏️ permet de renommer. La suppression est **bloquée** si l''unité est utilisée par un article ayant des approvisionnements.

:::astuce
Restez cohérent : utilisez la même unité pour l''achat et pour la recette d''un même article (ex. tout en kg) afin que les coûts soient justes.
:::',
'## 📏 Référentiel — Unités de mesure

Les unités définissent comment vous quantifiez vos articles : kilogramme (kg), litre (L), gramme (g), pièce, portion, boîte… Elles sont **obligatoires** pour créer un article.

### Créer une ou plusieurs unités

1. Allez dans **Référentiel → Unités**.
2. Cliquez sur **"Ajouter des unités"**.
3. Saisissez le nom de l''unité (ex. kg).
4. Utilisez **"+ Ajouter une ligne"** pour en saisir plusieurs d''un coup, puis **Enregistrer**.

### Modifier / Supprimer

L''icône ✏️ permet de renommer. La suppression est **bloquée** si l''unité est utilisée par un article ayant des approvisionnements.

:::astuce
Restez cohérent : utilisez la même unité pour l''achat et pour la recette d''un même article (ex. tout en kg) afin que les coûts soient justes.
:::',
'unités, mesure, kg, litre, gramme, pièce, portion, unité de mesure, référentiel', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('referentiel-familles', 'Familles', '🗂️', 'Référentiel', 4,
'## 🗂️ Référentiel — Familles

Une famille regroupe des catégories d''articles (ex. « Viandes », « Boissons », « Épicerie »). Chaque famille porte **deux propriétés déterminantes** :

- **Consommable** — L''article est consommé/transformé en cuisine (un ingrédient).
- **Vendable** — L''article peut être vendu tel quel au client.

### Pourquoi c''est important

Le croisement de ces deux propriétés détermine la nature des articles :

- **Consommable = Oui** → l''article apparaît dans le stock et peut entrer dans les fiches techniques.
- **Consommable = Non & Vendable = Oui** → l''article est **valorisé** : il se vend directement sans recette (voir « Articles Valorisés »).

:::regle
Un article ne devient « valorisé » que si sa famille est **Vendable = Oui** et **Consommable = Non**.
:::

### Créer / modifier une famille

1. Allez dans **Référentiel → Familles**.
2. Cliquez sur **"Nouvelle famille"**, saisissez le nom et cochez Consommable / Vendable selon le cas.
3. Enregistrez. Vous pourrez modifier ces propriétés tant que cela reste cohérent avec vos articles.',
'## 🗂️ Référentiel — Familles

Une famille regroupe des catégories d''articles (ex. « Viandes », « Boissons », « Épicerie »). Chaque famille porte **deux propriétés déterminantes** :

- **Consommable** — L''article est consommé/transformé en cuisine (un ingrédient).
- **Vendable** — L''article peut être vendu tel quel au client.

### Pourquoi c''est important

Le croisement de ces deux propriétés détermine la nature des articles :

- **Consommable = Oui** → l''article apparaît dans le stock et peut entrer dans les fiches techniques.
- **Consommable = Non & Vendable = Oui** → l''article est **valorisé** : il se vend directement sans recette (voir « Articles Valorisés »).

:::regle
Un article ne devient « valorisé » que si sa famille est **Vendable = Oui** et **Consommable = Non**.
:::

### Créer / modifier une famille

1. Allez dans **Référentiel → Familles**.
2. Cliquez sur **"Nouvelle famille"**, saisissez le nom et cochez Consommable / Vendable selon le cas.
3. Enregistrez. Vous pourrez modifier ces propriétés tant que cela reste cohérent avec vos articles.',
'familles, consommable, vendable, valorisé, classification, propriétés, référentiel, ingrédient', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('referentiel-categories', 'Catégories', '🏷️', 'Référentiel', 5,
'## 🏷️ Référentiel — Catégories d''articles

Les catégories affinent les familles (ex. dans la famille « Viandes » : « Bœuf », « Volaille »…). Elles servent à organiser et filtrer vos articles, et à les regrouper dans les fiches techniques et écrans de stock.

:::attention
Ne confondez pas les **catégories d''articles** (ce référentiel) avec les **catégories de produits** (Espace Produit), qui classent les articles vendables pour la vente.
:::

### Créer une catégorie

1. Allez dans **Référentiel → Catégories**.
2. Cliquez sur **"Nouvelle catégorie"**, choisissez la **famille** de rattachement et saisissez le nom.
3. Vous pouvez créer plusieurs catégories en une fois (bouton "+ Ajouter une ligne").

La suppression est bloquée si la catégorie contient des articles avec des approvisionnements.',
'## 🏷️ Référentiel — Catégories d''articles

Les catégories affinent les familles (ex. dans la famille « Viandes » : « Bœuf », « Volaille »…). Elles servent à organiser et filtrer vos articles, et à les regrouper dans les fiches techniques et écrans de stock.

:::attention
Ne confondez pas les **catégories d''articles** (ce référentiel) avec les **catégories de produits** (Espace Produit), qui classent les articles vendables pour la vente.
:::

### Créer une catégorie

1. Allez dans **Référentiel → Catégories**.
2. Cliquez sur **"Nouvelle catégorie"**, choisissez la **famille** de rattachement et saisissez le nom.
3. Vous pouvez créer plusieurs catégories en une fois (bouton "+ Ajouter une ligne").

La suppression est bloquée si la catégorie contient des articles avec des approvisionnements.',
'catégories, articles, familles, classement, filtrer, organisation, référentiel', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('referentiel-articles', 'Articles', '🧂', 'Référentiel', 6,
'## 🧂 Référentiel — Articles

Les articles sont la matière première de votre gestion : ingrédients, matières, et produits achetés. Chaque article possède un nom, une unité, et (recommandé) une catégorie/famille.

### Créer un article

1. Allez dans **Référentiel → Articles**.
2. Cliquez sur **"Nouvel article"**.
3. Saisissez le nom, choisissez l''**unité** et la **catégorie** (qui détermine la famille).
4. Enregistrez. L''article est alors disponible pour le stock et les fiches techniques.

:::astuce
Si l''unité ou la catégorie manque, vous pouvez la créer à la volée depuis les listes déroulantes, sans quitter la page.
:::

### Affecter les articles aux activités

Un article doit être **sélectionné** pour une activité (ou un labo) afin d''y être approvisionné et utilisé. Cette sélection se fait depuis l''activité ou lors de la saisie du stock.',
'## 🧂 Référentiel — Articles

Les articles sont la matière première de votre gestion : ingrédients, matières, et produits achetés. Chaque article possède un nom, une unité, et (recommandé) une catégorie/famille.

### Créer un article

1. Allez dans **Référentiel → Articles**.
2. Cliquez sur **"Nouvel article"**.
3. Saisissez le nom, choisissez l''**unité** et la **catégorie** (qui détermine la famille).
4. Enregistrez. L''article est alors disponible pour le stock et les fiches techniques.

:::astuce
Si l''unité ou la catégorie manque, vous pouvez la créer à la volée depuis les listes déroulantes, sans quitter la page.
:::

### Affecter les articles aux activités

Un article doit être **sélectionné** pour une activité (ou un labo) afin d''y être approvisionné et utilisé. Cette sélection se fait depuis l''activité ou lors de la saisie du stock.',
'articles, ingrédients, matières premières, création, unité, catégorie, sélection, activités, référentiel', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('referentiel-import', 'Import Excel', '📥', 'Référentiel', 7,
'## 📥 Référentiel — Ajout dynamique / Import Excel

Pour gagner du temps, importez votre catalogue d''articles en masse via un fichier Excel.

1. Allez dans **Référentiel → Ajout Dynamique**.
2. Téléchargez le **modèle Excel** fourni.
3. Remplissez une ligne par article (nom, unité, famille, catégorie).
4. Importez le fichier : les unités, familles et catégories manquantes sont créées automatiquement.
5. Vérifiez l''aperçu puis validez.

:::attention
Respectez l''orthographe exacte des unités/familles/catégories existantes pour éviter les doublons.
:::',
'## 📥 Référentiel — Ajout dynamique / Import Excel

Pour gagner du temps, importez votre catalogue d''articles en masse via un fichier Excel.

1. Allez dans **Référentiel → Ajout Dynamique**.
2. Téléchargez le **modèle Excel** fourni.
3. Remplissez une ligne par article (nom, unité, famille, catégorie).
4. Importez le fichier : les unités, familles et catégories manquantes sont créées automatiquement.
5. Vérifiez l''aperçu puis validez.

:::attention
Respectez l''orthographe exacte des unités/familles/catégories existantes pour éviter les doublons.
:::',
'import, excel, ajout dynamique, masse, modèle, catalogue, fichier, doublons', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('categories-produits', 'Catégories Produits', '🏷️', 'Espace Produit', 8,
'## 🏷️ Catégories Produits

Les catégories de produits classent vos articles vendables pour la vente (ex. « Entrées », « Boissons », « Desserts »). Elles servent à organiser et regrouper les écrans de Configuration Vente et de saisie des ventes.

### Le typage des catégories

Chaque catégorie est rattachée à **un type** obligatoire :

- **🍽️ Produit vendable** pour les produits vendus directement.
- **➕ Supplément vendable** pour les suppléments.
- **💎 Article valorisé** pour les articles valorisés.

:::regle
Lors de l''assignation d''une catégorie à un produit, seules les catégories du **bon type** sont proposées.
:::

### Créer une catégorie

1. Allez dans **Espace Produit → Catégories Produits**.
2. Cliquez sur **"Nouvelle catégorie"**, choisissez le **type** puis saisissez le ou les noms.
3. Enregistrez. La colonne « Type » et le filtre vous aident à vous y retrouver.

:::astuce
Un même nom peut exister pour deux types différents (ex. « Boissons » en vendable et en valorisé).
:::',
'## 🏷️ Catégories Produits

Les catégories de produits classent vos articles vendables pour la vente (ex. « Entrées », « Boissons », « Desserts »). Elles servent à organiser et regrouper les écrans de Configuration Vente et de saisie des ventes.

### Le typage des catégories

Chaque catégorie est rattachée à **un type** obligatoire :

- **🍽️ Produit vendable** pour les produits vendus directement.
- **➕ Supplément vendable** pour les suppléments.
- **💎 Article valorisé** pour les articles valorisés.

:::regle
Lors de l''assignation d''une catégorie à un produit, seules les catégories du **bon type** sont proposées.
:::

### Créer une catégorie

1. Allez dans **Espace Produit → Catégories Produits**.
2. Cliquez sur **"Nouvelle catégorie"**, choisissez le **type** puis saisissez le ou les noms.
3. Enregistrez. La colonne « Type » et le filtre vous aident à vous y retrouver.

:::astuce
Un même nom peut exister pour deux types différents (ex. « Boissons » en vendable et en valorisé).
:::',
'catégories produits, type, vendable, supplément, valorisé, vente, classement, espace produit', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('produits-vendables', 'Produits Vendables', '🍔', 'Espace Produit', 9,
'## 🍔 Produits Vendables & Suppléments

Un **produit vendable** est un produit fini destiné à la vente (plat, formule…). Un **supplément** est un produit vendable complémentaire (sauce, accompagnement…). Tous deux sont définis par une fiche technique.

### Créer un produit vendable

1. Allez dans **Espace Produit → Produits Vendables** (onglet Produit ou Supplément).
2. Cliquez sur **"+ Produit vendable"** (ou "+ Supplément").
3. Saisissez le nom, une référence (optionnel) et choisissez la **catégorie de produit** (obligatoire).
4. Composez la recette : ajoutez les **articles** et leurs portions, et éventuellement des **produits utilisables** (sous-produits).
5. Affectez le produit à une ou plusieurs **activités**.

:::regle
La **catégorie de produit est obligatoire** pour tout produit vendable ou supplément (mais pas pour un produit utilisable).
:::

### Assigner les activités depuis la carte

Sous chaque carte produit, des pastilles d''activités permettent d''**assigner / désassigner** le produit en un clic. Une pastille ✓ verte indique que le produit est disponible dans cette activité.

### Compteurs de la carte

- 🧂 **Articles** — nombre d''ingrédients de la recette.
- 📦 **Util.** — nombre de produits utilisables (sous-produits) intégrés.

:::astuce
Le coût de revient du produit est calculé automatiquement à partir de sa fiche technique (voir « Fiches Techniques & Formules »).
:::',
'## 🍔 Produits Vendables & Suppléments

Un **produit vendable** est un produit fini destiné à la vente (plat, formule…). Un **supplément** est un produit vendable complémentaire (sauce, accompagnement…). Tous deux sont définis par une fiche technique.

### Créer un produit vendable

1. Allez dans **Espace Produit → Produits Vendables** (onglet Produit ou Supplément).
2. Cliquez sur **"+ Produit vendable"** (ou "+ Supplément").
3. Saisissez le nom, une référence (optionnel) et choisissez la **catégorie de produit** (obligatoire).
4. Composez la recette : ajoutez les **articles** et leurs portions, et éventuellement des **produits utilisables** (sous-produits).
5. Affectez le produit à une ou plusieurs **activités**.

:::regle
La **catégorie de produit est obligatoire** pour tout produit vendable ou supplément (mais pas pour un produit utilisable).
:::

### Assigner les activités depuis la carte

Sous chaque carte produit, des pastilles d''activités permettent d''**assigner / désassigner** le produit en un clic. Une pastille ✓ verte indique que le produit est disponible dans cette activité.

### Compteurs de la carte

- 🧂 **Articles** — nombre d''ingrédients de la recette.
- 📦 **Util.** — nombre de produits utilisables (sous-produits) intégrés.

:::astuce
Le coût de revient du produit est calculé automatiquement à partir de sa fiche technique (voir « Fiches Techniques & Formules »).
:::',
'produits vendables, suppléments, recette, fiche technique, plat, formule, assignation, activités, carte', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('produits-utilisables', 'Produits Utilisables', '🧪', 'Espace Produit', 10,
'## 🧪 Produits Utilisables (produits transformés)

Un **produit utilisable** (ou produit transformé, PT) est une préparation intermédiaire qui n''est pas vendue telle quelle mais **réutilisée** dans d''autres recettes (ex. une sauce, une pâte, un fond). Il possède sa propre fiche technique.

### Créer un produit utilisable

1. Allez dans **Espace Produit → Produits Utilisables**.
2. Cliquez sur **"+ Produit utilisable"**, saisissez le nom et composez sa recette (articles + éventuels sous-produits).
3. Assignez-le aux activités concernées via les pastilles.

### Mise en stock

Un produit utilisable peut être **activé dans le stock** (bouton bascule sur la carte). Il est alors géré comme un article : on peut le produire, en suivre le stock, et le transférer.

:::formule Coût unitaire d''un produit utilisable
Coût = Σ ( portion_article × prix_unitaire ) + Σ ( portion_sous_produit × coût_sous_produit )
note: Calcul récursif : le coût d''un sous-produit est lui-même calculé à partir de sa recette.
:::

:::astuce
Les produits utilisables permettent de mutualiser une préparation : son coût se répercute automatiquement dans tous les produits qui l''utilisent.
:::',
'## 🧪 Produits Utilisables (produits transformés)

Un **produit utilisable** (ou produit transformé, PT) est une préparation intermédiaire qui n''est pas vendue telle quelle mais **réutilisée** dans d''autres recettes (ex. une sauce, une pâte, un fond). Il possède sa propre fiche technique.

### Créer un produit utilisable

1. Allez dans **Espace Produit → Produits Utilisables**.
2. Cliquez sur **"+ Produit utilisable"**, saisissez le nom et composez sa recette (articles + éventuels sous-produits).
3. Assignez-le aux activités concernées via les pastilles.

### Mise en stock

Un produit utilisable peut être **activé dans le stock** (bouton bascule sur la carte). Il est alors géré comme un article : on peut le produire, en suivre le stock, et le transférer.

:::formule Coût unitaire d''un produit utilisable
Coût = Σ ( portion_article × prix_unitaire ) + Σ ( portion_sous_produit × coût_sous_produit )
note: Calcul récursif : le coût d''un sous-produit est lui-même calculé à partir de sa recette.
:::

:::astuce
Les produits utilisables permettent de mutualiser une préparation : son coût se répercute automatiquement dans tous les produits qui l''utilisent.
:::',
'produits utilisables, produits transformés, pt, sous-produits, préparation, mise en stock, coût, recette', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('articles-valorises', 'Articles Valorisés', '💎', 'Espace Produit', 11,
'## 💎 Articles Valorisés

Un **article valorisé** est un article vendu directement, sans recette : il provient d''une famille marquée **Vendable = Oui** et **Consommable = Non** (ex. une boisson en bouteille, un produit revendu en l''état).

### Le rôle de cette page

Cette interface liste tous vos articles valorisables, **regroupés par catégorie d''article**. Vous y assignez à chacun sa **catégorie de produit** (de type « Article valorisé »).

1. Allez dans **Espace Produit → Articles Valorisés**.
2. Utilisez les filtres (famille, statut, recherche) pour retrouver vos articles. La liste est paginée par 10 catégories.
3. Pour chaque article, sélectionnez sa **catégorie produit** dans la liste déroulante. L''enregistrement est immédiat.

:::regle
Seuls les articles valorisés **ayant une catégorie** apparaissent ensuite dans la Configuration Vente et la saisie des ventes.
:::

:::attention
Si aucune catégorie de type « Article valorisé » n''existe encore, créez-la d''abord dans **Catégories Produits**.
:::

### Vente d''un article valorisé

À la vente, l''article valorisé est **déduit directement du stock** de l''article (pas de décomposition en ingrédients).',
'## 💎 Articles Valorisés

Un **article valorisé** est un article vendu directement, sans recette : il provient d''une famille marquée **Vendable = Oui** et **Consommable = Non** (ex. une boisson en bouteille, un produit revendu en l''état).

### Le rôle de cette page

Cette interface liste tous vos articles valorisables, **regroupés par catégorie d''article**. Vous y assignez à chacun sa **catégorie de produit** (de type « Article valorisé »).

1. Allez dans **Espace Produit → Articles Valorisés**.
2. Utilisez les filtres (famille, statut, recherche) pour retrouver vos articles. La liste est paginée par 10 catégories.
3. Pour chaque article, sélectionnez sa **catégorie produit** dans la liste déroulante. L''enregistrement est immédiat.

:::regle
Seuls les articles valorisés **ayant une catégorie** apparaissent ensuite dans la Configuration Vente et la saisie des ventes.
:::

:::attention
Si aucune catégorie de type « Article valorisé » n''existe encore, créez-la d''abord dans **Catégories Produits**.
:::

### Vente d''un article valorisé

À la vente, l''article valorisé est **déduit directement du stock** de l''article (pas de décomposition en ingrédients).',
'articles valorisés, revente, boisson, catégorie produit, vente directe, sans recette, stock, valorisation', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('fiches-techniques', 'Fiches Techniques & Formules', '📋', 'Espace Produit', 12,
'## 📋 Fiches Techniques & Calcul des coûts

La fiche technique décrit la composition d''un produit et calcule son **coût de revient matière**. C''est le cœur du chiffrage de votre carte.

### Les modes de valorisation du coût

Le prix unitaire d''un article dans la recette peut être déterminé selon plusieurs modes :

- **Stock à date** Prix issu du stock à une date choisie (coût réel constaté).
- **Manuel** Prix saisi manuellement, utile pour simuler ou figer un coût.
- **Historique** Dernier prix d''approvisionnement connu.
- **Mixte** Stock par défaut, complété par un prix manuel pour les articles sans stock.

### Formules de calcul

:::formule Coût d''une ligne d''ingrédient
Coût ligne = portion × prix unitaire
note: La portion est exprimée dans l''unité de l''article.
:::

:::formule Coût total d''un produit
Coût total = Σ ( coût des articles ) + Σ ( portion_SP × coût_unitaire_SP )
note: SP = sous-produit (produit utilisable). Le calcul descend récursivement dans chaque sous-produit.
:::

:::formule Coût d''une portion vendue
Coût portion = Coût total de la recette ÷ nombre de portions
note: Si la fiche est définie pour un rendement de N portions.
:::

:::exemple
Une sauce (produit utilisable) coûte 8 DT/kg. Un plat utilise 0,15 kg de cette sauce + 0,2 kg de viande à 30 DT/kg. Coût = (0,15 × 8) + (0,2 × 30) = 1,2 + 6 = **7,2 DT**.
:::

### Marge et prix de vente

:::formule Marge brute
Marge = Prix de vente HT − Coût matière
:::

:::formule Taux de marge
Taux de marge (%) = ( Marge ÷ Prix de vente HT ) × 100
:::

:::formule Coefficient multiplicateur
Coefficient = Prix de vente ÷ Coût matière
note: Un coefficient de 3 signifie un prix de vente égal à 3× le coût matière.
:::

### Export

Chaque fiche technique peut être **exportée en Excel** avec le détail des ingrédients, portions et coûts, pour archivage ou impression.',
'## 📋 Fiches Techniques & Calcul des coûts

La fiche technique décrit la composition d''un produit et calcule son **coût de revient matière**. C''est le cœur du chiffrage de votre carte.

### Les modes de valorisation du coût

Le prix unitaire d''un article dans la recette peut être déterminé selon plusieurs modes :

- **Stock à date** Prix issu du stock à une date choisie (coût réel constaté).
- **Manuel** Prix saisi manuellement, utile pour simuler ou figer un coût.
- **Historique** Dernier prix d''approvisionnement connu.
- **Mixte** Stock par défaut, complété par un prix manuel pour les articles sans stock.

### Formules de calcul

:::formule Coût d''une ligne d''ingrédient
Coût ligne = portion × prix unitaire
note: La portion est exprimée dans l''unité de l''article.
:::

:::formule Coût total d''un produit
Coût total = Σ ( coût des articles ) + Σ ( portion_SP × coût_unitaire_SP )
note: SP = sous-produit (produit utilisable). Le calcul descend récursivement dans chaque sous-produit.
:::

:::formule Coût d''une portion vendue
Coût portion = Coût total de la recette ÷ nombre de portions
note: Si la fiche est définie pour un rendement de N portions.
:::

:::exemple
Une sauce (produit utilisable) coûte 8 DT/kg. Un plat utilise 0,15 kg de cette sauce + 0,2 kg de viande à 30 DT/kg. Coût = (0,15 × 8) + (0,2 × 30) = 1,2 + 6 = **7,2 DT**.
:::

### Marge et prix de vente

:::formule Marge brute
Marge = Prix de vente HT − Coût matière
:::

:::formule Taux de marge
Taux de marge (%) = ( Marge ÷ Prix de vente HT ) × 100
:::

:::formule Coefficient multiplicateur
Coefficient = Prix de vente ÷ Coût matière
note: Un coefficient de 3 signifie un prix de vente égal à 3× le coût matière.
:::

### Export

Chaque fiche technique peut être **exportée en Excel** avec le détail des ingrédients, portions et coûts, pour archivage ou impression.',
'fiches techniques, coût de revient, coût matière, marge, coefficient, formules, valorisation, recette, prix de vente, export', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('stock-activites', 'Stock Activités', '📦', 'Stock & Appro', 13,
'## 📦 Stock & Approvisionnements (Activités)

Cet écran suit, pour chaque article d''une activité : la quantité en stock, le prix d''achat, la TVA et le seuil minimum. C''est ici que vous enregistrez vos **approvisionnements** (achats / entrées).

### Enregistrer un approvisionnement

1. Allez dans **Stock → Stock Activités** et sélectionnez l''activité.
2. Sur la ligne de l''article, saisissez la **quantité**, le **prix HT unitaire**, la **TVA (%)**, et le fournisseur / n° de facture (optionnel).
3. Validez : le stock et le coût moyen sont mis à jour, et l''entrée est tracée dans l''historique.

### HT, TVA et TTC

:::formule Prix TTC
TTC = HT × ( 1 + TVA ÷ 100 )
:::

:::formule Prix HT depuis le TTC
HT = TTC ÷ ( 1 + TVA ÷ 100 )
:::

:::formule Montant de TVA
TVA = HT × ( TVA% ÷ 100 )
:::

:::exemple
Un article acheté 10 DT HT avec 19 % de TVA coûte 10 × 1,19 = **11,90 DT TTC**.
:::

:::astuce
Le coût matière des fiches techniques se base sur le prix **HT** (hors taxe récupérable). Le TTC sert au suivi des décaissements.
:::

### Stock actuel et seuil minimum

:::formule Stock actuel
Stock = Appro + Transferts entrants − Consommation (ventes / recettes) − Pertes ± Ajustements d''inventaire
:::

Définissez un **seuil minimum** par article : lorsqu''il est atteint, l''article est signalé pour réapprovisionnement.',
'## 📦 Stock & Approvisionnements (Activités)

Cet écran suit, pour chaque article d''une activité : la quantité en stock, le prix d''achat, la TVA et le seuil minimum. C''est ici que vous enregistrez vos **approvisionnements** (achats / entrées).

### Enregistrer un approvisionnement

1. Allez dans **Stock → Stock Activités** et sélectionnez l''activité.
2. Sur la ligne de l''article, saisissez la **quantité**, le **prix HT unitaire**, la **TVA (%)**, et le fournisseur / n° de facture (optionnel).
3. Validez : le stock et le coût moyen sont mis à jour, et l''entrée est tracée dans l''historique.

### HT, TVA et TTC

:::formule Prix TTC
TTC = HT × ( 1 + TVA ÷ 100 )
:::

:::formule Prix HT depuis le TTC
HT = TTC ÷ ( 1 + TVA ÷ 100 )
:::

:::formule Montant de TVA
TVA = HT × ( TVA% ÷ 100 )
:::

:::exemple
Un article acheté 10 DT HT avec 19 % de TVA coûte 10 × 1,19 = **11,90 DT TTC**.
:::

:::astuce
Le coût matière des fiches techniques se base sur le prix **HT** (hors taxe récupérable). Le TTC sert au suivi des décaissements.
:::

### Stock actuel et seuil minimum

:::formule Stock actuel
Stock = Appro + Transferts entrants − Consommation (ventes / recettes) − Pertes ± Ajustements d''inventaire
:::

Définissez un **seuil minimum** par article : lorsqu''il est atteint, l''article est signalé pour réapprovisionnement.',
'stock, approvisionnement, appro, achat, ht, tva, ttc, seuil minimum, quantité, coût moyen', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('stock-labo', 'Stock Labo', '🏭', 'Stock & Appro', 14,
'## 🏭 Stock Labo (mode Entreprise)

Le labo central reçoit les approvisionnements en gros et **alimente les activités par transfert**. Son écran de stock fonctionne comme celui des activités (appro, HT/TVA, seuils), mais à l''échelle du labo.

- Approvisionnez les **articles** du labo.
- Gérez le stock des **produits transformés** (PT) fabriqués au labo.
- Suivez les seuils et l''historique propres au labo.

:::astuce
Le labo est utile pour mutualiser les achats et préparations entre plusieurs activités d''une même entreprise.
:::',
'## 🏭 Stock Labo (mode Entreprise)

Le labo central reçoit les approvisionnements en gros et **alimente les activités par transfert**. Son écran de stock fonctionne comme celui des activités (appro, HT/TVA, seuils), mais à l''échelle du labo.

- Approvisionnez les **articles** du labo.
- Gérez le stock des **produits transformés** (PT) fabriqués au labo.
- Suivez les seuils et l''historique propres au labo.

:::astuce
Le labo est utile pour mutualiser les achats et préparations entre plusieurs activités d''une même entreprise.
:::',
'stock labo, laboratoire, labo central, entreprise, produits transformés, pt, transfert, approvisionnement', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('transferts', 'Transferts', '🔄', 'Stock & Appro', 15,
'## 🔄 Transferts Labo → Activité

Le transfert déplace des articles (ou produits transformés) du **labo** vers une **activité**. Il diminue le stock du labo et augmente celui de l''activité, au coût du labo.

### Effectuer un transfert

1. Allez dans **Stock → Transferts** et choisissez le labo source.
2. Sélectionnez l''activité de destination et la date.
3. Pour chaque article, saisissez la quantité à transférer.
4. Un **aperçu** récapitule les mouvements ; confirmez pour valider.

:::attention
En cas de conflit (transfert déjà existant pour la même date/activité), une confirmation détaillée vous est demandée avant d''écraser ou compléter.
:::

Tous les transferts sont consultables dans l''**historique des transferts**.',
'## 🔄 Transferts Labo → Activité

Le transfert déplace des articles (ou produits transformés) du **labo** vers une **activité**. Il diminue le stock du labo et augmente celui de l''activité, au coût du labo.

### Effectuer un transfert

1. Allez dans **Stock → Transferts** et choisissez le labo source.
2. Sélectionnez l''activité de destination et la date.
3. Pour chaque article, saisissez la quantité à transférer.
4. Un **aperçu** récapitule les mouvements ; confirmez pour valider.

:::attention
En cas de conflit (transfert déjà existant pour la même date/activité), une confirmation détaillée vous est demandée avant d''écraser ou compléter.
:::

Tous les transferts sont consultables dans l''**historique des transferts**.',
'transferts, labo, activité, mouvement, stock, conflit, historique, approvisionnement', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('inventaire', 'Inventaire', '📋', 'Stock & Appro', 16,
'## 📋 Inventaire

L''inventaire réconcilie le **stock théorique** (calculé par l''application) avec le **stock physique réel** que vous comptez. L''écart est enregistré comme ajustement.

### Réaliser un inventaire

1. Allez dans **Stock → Inventaire** et sélectionnez l''activité (ou le labo).
2. Pour chaque article, saisissez la **quantité réelle comptée**.
3. Validez : le stock est ajusté à la valeur réelle et l''écart est tracé.

:::formule Écart d''inventaire
Écart = Quantité réelle comptée − Stock théorique
note: Un écart négatif correspond à une perte/démarque ; positif à un surplus.
:::

:::astuce
Réalisez des inventaires réguliers pour fiabiliser vos coûts et détecter les pertes non saisies.
:::',
'## 📋 Inventaire

L''inventaire réconcilie le **stock théorique** (calculé par l''application) avec le **stock physique réel** que vous comptez. L''écart est enregistré comme ajustement.

### Réaliser un inventaire

1. Allez dans **Stock → Inventaire** et sélectionnez l''activité (ou le labo).
2. Pour chaque article, saisissez la **quantité réelle comptée**.
3. Validez : le stock est ajusté à la valeur réelle et l''écart est tracé.

:::formule Écart d''inventaire
Écart = Quantité réelle comptée − Stock théorique
note: Un écart négatif correspond à une perte/démarque ; positif à un surplus.
:::

:::astuce
Réalisez des inventaires réguliers pour fiabiliser vos coûts et détecter les pertes non saisies.
:::',
'inventaire, comptage, écart, stock théorique, stock réel, ajustement, démarque, surplus', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('pertes', 'Pertes', '🗑️', 'Stock & Appro', 17,
'## 🗑️ Pertes

Enregistrez les pertes pour qu''elles soient déduites du stock et valorisées dans vos rapports de coût.

### Types de perte

- **Avarie** Produit abîmé, périmé, impropre.
- **Déchet** Pertes de production, parures, casse.

### Enregistrer une perte

1. Depuis le stock de l''activité (ou du labo), ouvrez la saisie de perte de l''article.
2. Indiquez la **quantité**, le **type** (avarie / déchet) et la date.
3. Validez : le stock diminue et la perte est valorisée au prix unitaire courant.

:::formule Valeur d''une perte
Valeur = quantité perdue × prix unitaire de l''article
:::

Les pertes sont consultables et exportables (Excel / PDF) dans l''**historique des pertes**.',
'## 🗑️ Pertes

Enregistrez les pertes pour qu''elles soient déduites du stock et valorisées dans vos rapports de coût.

### Types de perte

- **Avarie** Produit abîmé, périmé, impropre.
- **Déchet** Pertes de production, parures, casse.

### Enregistrer une perte

1. Depuis le stock de l''activité (ou du labo), ouvrez la saisie de perte de l''article.
2. Indiquez la **quantité**, le **type** (avarie / déchet) et la date.
3. Validez : le stock diminue et la perte est valorisée au prix unitaire courant.

:::formule Valeur d''une perte
Valeur = quantité perdue × prix unitaire de l''article
:::

Les pertes sont consultables et exportables (Excel / PDF) dans l''**historique des pertes**.',
'pertes, avarie, déchet, casse, périmé, démarque, valorisation, stock, historique', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('factures', 'Factures', '🧾', 'Stock & Appro', 18,
'## 🧾 Factures d''approvisionnement

Regroupe les approvisionnements par **facture fournisseur**, pour rapprocher vos achats et suivre vos décaissements.

- Consultez les factures par activité (ou labo) et par période.
- Chaque facture liste les articles, quantités, prix HT, TVA et totaux.
- Le n° de facture saisi à l''approvisionnement relie automatiquement les lignes.

:::formule Total facture TTC
Total TTC = Σ ( quantité × prix HT ) × ( 1 + TVA ÷ 100 )
note: Calculé ligne par ligne selon la TVA de chaque article.
:::',
'## 🧾 Factures d''approvisionnement

Regroupe les approvisionnements par **facture fournisseur**, pour rapprocher vos achats et suivre vos décaissements.

- Consultez les factures par activité (ou labo) et par période.
- Chaque facture liste les articles, quantités, prix HT, TVA et totaux.
- Le n° de facture saisi à l''approvisionnement relie automatiquement les lignes.

:::formule Total facture TTC
Total TTC = Σ ( quantité × prix HT ) × ( 1 + TVA ÷ 100 )
note: Calculé ligne par ligne selon la TVA de chaque article.
:::',
'factures, fournisseur, approvisionnement, achats, tva, décaissements, total ttc, rapprochement', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('historique', 'Historiques', '🕑', 'Stock & Appro', 19,
'## 🕑 Historiques

Toutes vos opérations sont tracées et consultables, avec filtres par date, article et activité :

- **Historique des approvisionnements** — toutes les entrées de stock (manuel, transfert, recette).
- **Historique des pertes** — avaries et déchets valorisés.
- **Historique des inventaires** — comptages et écarts.
- **Historique des transferts** — mouvements labo → activité.

Le type d''entrée est étiqueté (Manuel, Transfert, Recette…) pour comprendre l''origine de chaque mouvement. Plusieurs historiques s''exportent en Excel/PDF.

:::astuce
Utilisez les filtres de période pour préparer vos clôtures mensuelles et vos rapports.
:::',
'## 🕑 Historiques

Toutes vos opérations sont tracées et consultables, avec filtres par date, article et activité :

- **Historique des approvisionnements** — toutes les entrées de stock (manuel, transfert, recette).
- **Historique des pertes** — avaries et déchets valorisés.
- **Historique des inventaires** — comptages et écarts.
- **Historique des transferts** — mouvements labo → activité.

Le type d''entrée est étiqueté (Manuel, Transfert, Recette…) pour comprendre l''origine de chaque mouvement. Plusieurs historiques s''exportent en Excel/PDF.

:::astuce
Utilisez les filtres de période pour préparer vos clôtures mensuelles et vos rapports.
:::',
'historique, approvisionnements, pertes, inventaires, transferts, traçabilité, filtres, export, mouvements', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('configuration-vente', 'Configuration Vente', '💲', 'Espace Vente', 20,
'## 💲 Configuration Vente

Avant de vendre, définissez les **prix de vente** de vos articles. La page est organisée en onglets et les lignes sont **regroupées par catégorie de produit**.

### Les onglets

- **Produits** Produits vendables (hors suppléments).
- **Suppléments** Produits suppléments.
- **Valorisés** Articles valorisés **ayant une catégorie** (assignée dans « Articles Valorisés »).
- **Historique** Suivi des changements de prix.

### Définir un prix

1. Activez l''article via la case **Vendable**.
2. Saisissez le **prix direct** (vente au comptoir).
3. Pour chaque prestataire activé, saisissez son **prix de vente dédié** (saisie manuelle).
4. Cliquez sur **Enregistrer** pour valider les modifications.

:::regle
Les prix prestataires sont **saisis manuellement**, prix par prix. Il n''y a pas de commission ni de prix calculé automatiquement.
:::

:::attention
Dans l''onglet Valorisés, la catégorie ne s''assigne plus ici : elle se gère dans **Espace Produit → Articles Valorisés**.
:::',
'## 💲 Configuration Vente

Avant de vendre, définissez les **prix de vente** de vos articles. La page est organisée en onglets et les lignes sont **regroupées par catégorie de produit**.

### Les onglets

- **Produits** Produits vendables (hors suppléments).
- **Suppléments** Produits suppléments.
- **Valorisés** Articles valorisés **ayant une catégorie** (assignée dans « Articles Valorisés »).
- **Historique** Suivi des changements de prix.

### Définir un prix

1. Activez l''article via la case **Vendable**.
2. Saisissez le **prix direct** (vente au comptoir).
3. Pour chaque prestataire activé, saisissez son **prix de vente dédié** (saisie manuelle).
4. Cliquez sur **Enregistrer** pour valider les modifications.

:::regle
Les prix prestataires sont **saisis manuellement**, prix par prix. Il n''y a pas de commission ni de prix calculé automatiquement.
:::

:::attention
Dans l''onglet Valorisés, la catégorie ne s''assigne plus ici : elle se gère dans **Espace Produit → Articles Valorisés**.
:::',
'configuration vente, prix de vente, prestataire, vendable, valorisés, tarifs, prix direct, onglets', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('charges', 'Charges', '⚡', 'Espace Vente', 21,
'## ⚡ Charges d''exploitation

Renseignez vos charges (énergie, eau, emballages, main d''œuvre…) pour affiner l''analyse de rentabilité au-delà du seul coût matière.

1. Allez dans **Espace Vente → Charges**.
2. Ajoutez chaque charge avec son libellé et son montant.
3. Les charges sont prises en compte dans les rapports de marge et de rentabilité.

:::formule Marge nette (indicative)
Marge nette = Prix de vente − Coût matière − Charges réparties
:::',
'## ⚡ Charges d''exploitation

Renseignez vos charges (énergie, eau, emballages, main d''œuvre…) pour affiner l''analyse de rentabilité au-delà du seul coût matière.

1. Allez dans **Espace Vente → Charges**.
2. Ajoutez chaque charge avec son libellé et son montant.
3. Les charges sont prises en compte dans les rapports de marge et de rentabilité.

:::formule Marge nette (indicative)
Marge nette = Prix de vente − Coût matière − Charges réparties
:::',
'charges, exploitation, énergie, eau, emballages, main d''œuvre, rentabilité, marge nette', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('saisie-ventes', 'Saisie des Ventes', '🛒', 'Espace Vente', 22,
'## 🛒 Saisie des Ventes (Vente activités)

Enregistrez vos ventes par activité. Les articles sont présentés **par catégorie** et répartis en onglets : Produits, Suppléments, Valorisés.

### Enregistrer des ventes

1. Allez dans **Espace Vente → Vente activités** et choisissez la date.
2. Pour chaque article, saisissez les quantités vendues en **vente directe** et/ou via chaque **prestataire**.
3. Le prix appliqué est celui défini en Configuration Vente (le prix prestataire est le prix manuel configuré).
4. Cliquez sur **"Confirmer les ventes"** ; un récapitulatif vous est présenté avant validation.

:::regle
Le prix prestataire affiché provient de la **saisie manuelle** en Configuration Vente. S''il n''est pas configuré, la mention « non configuré » apparaît — définissez-le d''abord.
:::

### Calculs

:::formule Chiffre d''affaires d''une ligne
CA = quantité vendue × prix de vente
:::

:::formule Marge d''une vente
Marge = CA − ( quantité × coût matière unitaire )
:::

À la confirmation, les quantités vendues **déduisent le stock** : les articles valorisés directement, les produits via la décomposition de leur fiche technique.

:::astuce
Le total du CA se met à jour en direct en bas du tableau au fur et à mesure de la saisie.
:::',
'## 🛒 Saisie des Ventes (Vente activités)

Enregistrez vos ventes par activité. Les articles sont présentés **par catégorie** et répartis en onglets : Produits, Suppléments, Valorisés.

### Enregistrer des ventes

1. Allez dans **Espace Vente → Vente activités** et choisissez la date.
2. Pour chaque article, saisissez les quantités vendues en **vente directe** et/ou via chaque **prestataire**.
3. Le prix appliqué est celui défini en Configuration Vente (le prix prestataire est le prix manuel configuré).
4. Cliquez sur **"Confirmer les ventes"** ; un récapitulatif vous est présenté avant validation.

:::regle
Le prix prestataire affiché provient de la **saisie manuelle** en Configuration Vente. S''il n''est pas configuré, la mention « non configuré » apparaît — définissez-le d''abord.
:::

### Calculs

:::formule Chiffre d''affaires d''une ligne
CA = quantité vendue × prix de vente
:::

:::formule Marge d''une vente
Marge = CA − ( quantité × coût matière unitaire )
:::

À la confirmation, les quantités vendues **déduisent le stock** : les articles valorisés directement, les produits via la décomposition de leur fiche technique.

:::astuce
Le total du CA se met à jour en direct en bas du tableau au fur et à mesure de la saisie.
:::',
'ventes, saisie, quantités, prestataire, vente directe, chiffre d''affaires, déstockage, confirmation', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('rapports-vente', 'Rapports Vente', '📈', 'Espace Vente', 23,
'## 📈 Rapports de Vente

Analysez vos performances commerciales : chiffre d''affaires, marges et quantités, par période, par produit et par canal (direct / prestataire).

- Filtrez par **période**, **activité** et **type** (produit / supplément / valorisé).
- Visualisez le CA, le coût matière et la marge par produit.
- Exportez les données pour vos analyses.

:::formule Taux de marge global
Taux (%) = ( ( CA − Coût matière total ) ÷ CA ) × 100
:::',
'## 📈 Rapports de Vente

Analysez vos performances commerciales : chiffre d''affaires, marges et quantités, par période, par produit et par canal (direct / prestataire).

- Filtrez par **période**, **activité** et **type** (produit / supplément / valorisé).
- Visualisez le CA, le coût matière et la marge par produit.
- Exportez les données pour vos analyses.

:::formule Taux de marge global
Taux (%) = ( ( CA − Coût matière total ) ÷ CA ) × 100
:::',
'rapports, ventes, chiffre d''affaires, marge, taux de marge, canal, prestataire, export, analyse', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('activites', 'Activités', '📍', 'Gestion', 24,
'## 📍 Activités

Une activité représente un point de vente / une cuisine. Selon votre formule, vous pouvez en gérer une (indépendant) ou plusieurs (entreprise).

### Gérer vos activités

1. Allez dans **Gestion → Activités**.
2. Créez une activité (nom, type, et labo de rattachement si applicable).
3. Sélectionnez les **articles** utilisés par l''activité et, au besoin, ajustez les prix par activité.
4. Vous pouvez **dupliquer** une activité pour réutiliser sa configuration.

:::attention
Le nombre d''activités dépend de votre abonnement. Une demande d''ajout peut être nécessaire au-delà de votre quota.
:::',
'## 📍 Activités

Une activité représente un point de vente / une cuisine. Selon votre formule, vous pouvez en gérer une (indépendant) ou plusieurs (entreprise).

### Gérer vos activités

1. Allez dans **Gestion → Activités**.
2. Créez une activité (nom, type, et labo de rattachement si applicable).
3. Sélectionnez les **articles** utilisés par l''activité et, au besoin, ajustez les prix par activité.
4. Vous pouvez **dupliquer** une activité pour réutiliser sa configuration.

:::attention
Le nombre d''activités dépend de votre abonnement. Une demande d''ajout peut être nécessaire au-delà de votre quota.
:::',
'activités, point de vente, cuisine, création, duplication, articles, quota, abonnement', false)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('fournisseurs', 'Fournisseurs', '🚚', 'Gestion', 25,
'## 🚚 Fournisseurs

Gérez vos fournisseurs pour les associer à vos approvisionnements et factures. Les fournisseurs peuvent être propres à une activité ou au labo.

1. Allez dans **Gestion → Fournisseurs** (ou Fournisseurs Labo).
2. Ajoutez un fournisseur (nom, coordonnées).
3. À l''approvisionnement, sélectionnez le fournisseur pour tracer l''origine de l''achat.',
'## 🚚 Fournisseurs

Gérez vos fournisseurs pour les associer à vos approvisionnements et factures. Les fournisseurs peuvent être propres à une activité ou au labo.

1. Allez dans **Gestion → Fournisseurs** (ou Fournisseurs Labo).
2. Ajoutez un fournisseur (nom, coordonnées).
3. À l''approvisionnement, sélectionnez le fournisseur pour tracer l''origine de l''achat.',
'fournisseurs, achats, approvisionnement, coordonnées, traçabilité, labo, factures', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('gerants', 'Gérants', '🧑‍💼', 'Gestion', 26,
'## 🧑‍💼 Gérants

Déléguez la gestion d''une activité ou d''un labo à un **gérant**. Son accès est limité à son périmètre.

1. Allez dans **Gestion → Gérants**.
2. Ajoutez un gérant (nom, e-mail) et rattachez-le à une activité ou à un labo.
3. Le gérant reçoit une **invitation** par e-mail pour activer son compte et définir son mot de passe.

:::attention
L''ajout de gérants peut être soumis à votre abonnement (option payante). Une demande peut être requise.
:::',
'## 🧑‍💼 Gérants

Déléguez la gestion d''une activité ou d''un labo à un **gérant**. Son accès est limité à son périmètre.

1. Allez dans **Gestion → Gérants**.
2. Ajoutez un gérant (nom, e-mail) et rattachez-le à une activité ou à un labo.
3. Le gérant reçoit une **invitation** par e-mail pour activer son compte et définir son mot de passe.

:::attention
L''ajout de gérants peut être soumis à votre abonnement (option payante). Une demande peut être requise.
:::',
'gérants, délégation, invitation, e-mail, accès, périmètre, activité, labo, utilisateur', false)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('abonnement', 'Abonnement & Paiements', '💳', 'Gestion', 27,
'## 💳 Abonnement & Paiements

Consultez votre formule, vos options (activités, labos, gérants, module vente) et votre historique de paiements.

- Visualisez votre **plan** et son contenu.
- Suivez l''**historique des paiements** (payé, en attente, remisé).
- Demandez des **options supplémentaires** (gérant, labo, module vente) — la demande est validée par le support.

:::attention
Un retard de paiement peut faire passer le compte en **lecture seule** puis le bloquer. Régularisez pour rétablir l''accès complet.
:::',
'## 💳 Abonnement & Paiements

Consultez votre formule, vos options (activités, labos, gérants, module vente) et votre historique de paiements.

- Visualisez votre **plan** et son contenu.
- Suivez l''**historique des paiements** (payé, en attente, remisé).
- Demandez des **options supplémentaires** (gérant, labo, module vente) — la demande est validée par le support.

:::attention
Un retard de paiement peut faire passer le compte en **lecture seule** puis le bloquer. Régularisez pour rétablir l''accès complet.
:::',
'abonnement, paiements, plan, options, facturation, lecture seule, blocage, formule', false)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('rapports', 'Rapports', '📊', 'Gestion', 28,
'## 📊 Rapports de synthèse

Les rapports consolident votre activité : pertes, coûts matière, approvisionnements et états de stock, sur la période de votre choix.

- **Pertes** — montant et détail des avaries/déchets.
- **Coût matière** — valorisation des consommations.
- **Approvisionnements** — achats par fournisseur / période.
- **Stock** — quantités et valeur du stock.

Filtres disponibles : période, activité, article. Exports Excel/PDF pour vos clôtures.',
'## 📊 Rapports de synthèse

Les rapports consolident votre activité : pertes, coûts matière, approvisionnements et états de stock, sur la période de votre choix.

- **Pertes** — montant et détail des avaries/déchets.
- **Coût matière** — valorisation des consommations.
- **Approvisionnements** — achats par fournisseur / période.
- **Stock** — quantités et valeur du stock.

Filtres disponibles : période, activité, article. Exports Excel/PDF pour vos clôtures.',
'rapports, synthèse, pertes, coût matière, approvisionnements, stock, export, clôture', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('compte', 'Profil & Compte', '⚙️', 'Compte & Aide', 29,
'## ⚙️ Profil & Compte

Gérez vos informations personnelles et la sécurité de votre compte.

1. Allez dans **Profil** (menu en haut à droite ou bas du menu).
2. Mettez à jour votre nom, e-mail et téléphone.
3. Changez votre **mot de passe** régulièrement.

:::astuce
À la première connexion, un assistant d''onboarding vous guide pour définir votre mot de passe et configurer vos premières activités.
:::',
'## ⚙️ Profil & Compte

Gérez vos informations personnelles et la sécurité de votre compte.

1. Allez dans **Profil** (menu en haut à droite ou bas du menu).
2. Mettez à jour votre nom, e-mail et téléphone.
3. Changez votre **mot de passe** régulièrement.

:::astuce
À la première connexion, un assistant d''onboarding vous guide pour définir votre mot de passe et configurer vos premières activités.
:::',
'profil, compte, mot de passe, e-mail, téléphone, sécurité, informations personnelles, onboarding', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('assistant-ia', 'Assistant IA', '🤖', 'Compte & Aide', 30,
'## 🤖 Assistant IA

Un assistant intelligent peut répondre à vos questions sur vos données (stock, ventes, coûts…) et vous aider au quotidien.

- Posez vos questions en langage naturel depuis la page Assistant.
- Selon la configuration, l''assistant peut aussi être disponible via messagerie (Telegram / WhatsApp).
- Il interroge vos données pour vous fournir des réponses contextualisées.

:::astuce
Exemples de questions : « Quel est mon stock de poulet ? », « Quelles ont été mes ventes cette semaine ? ».
:::',
'## 🤖 Assistant IA

Un assistant intelligent peut répondre à vos questions sur vos données (stock, ventes, coûts…) et vous aider au quotidien.

- Posez vos questions en langage naturel depuis la page Assistant.
- Selon la configuration, l''assistant peut aussi être disponible via messagerie (Telegram / WhatsApp).
- Il interroge vos données pour vous fournir des réponses contextualisées.

:::astuce
Exemples de questions : « Quel est mon stock de poulet ? », « Quelles ont été mes ventes cette semaine ? ».
:::',
'assistant, ia, intelligence artificielle, questions, telegram, whatsapp, chatbot, langage naturel', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, visible_gerant)
VALUES ('support', 'Support', '🆘', 'Compte & Aide', 31,
'## 🆘 Support & Aide

Besoin d''aide ou d''un article/ingrédient manquant au référentiel ? Adressez une demande au support.

1. Allez dans **Support**.
2. Choisissez le type de demande (aide, article manquant, option supplémentaire…).
3. Décrivez votre besoin avec un maximum de détails et validez.

Vous pouvez suivre le statut de vos demandes. Pour les questions d''abonnement, passez par la page **Abonnement**.

:::astuce
Ce manuel reste votre première ressource : la plupart des réponses s''y trouvent, section par section.
:::',
'## 🆘 Support & Aide

Besoin d''aide ou d''un article/ingrédient manquant au référentiel ? Adressez une demande au support.

1. Allez dans **Support**.
2. Choisissez le type de demande (aide, article manquant, option supplémentaire…).
3. Décrivez votre besoin avec un maximum de détails et validez.

Vous pouvez suivre le statut de vos demandes. Pour les questions d''abonnement, passez par la page **Abonnement**.

:::astuce
Ce manuel reste votre première ressource : la plupart des réponses s''y trouvent, section par section.
:::',
'support, aide, assistance, demande, article manquant, ticket, abonnement, réclamation', true)
ON CONFLICT (slug) DO NOTHING;
