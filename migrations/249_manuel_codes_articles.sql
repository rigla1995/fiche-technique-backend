-- 249 — Code des articles par catégorie (D3) : préfixe des catégories (articles et produits), code unique proposé et modifiable, affiché sous le nom, colonne Code du modèle d’import, lignes du pont comptable au code.
-- Généré par scripts/manuel/generer-maintenance.mjs depuis scripts/manuel/revisions.json — ne pas éditer à la main.
--
-- Migration de maintenance du manuel balisé (modèle de la 194, scripts/VOCAB-GUIDE-SERVEUR.md §9). Fiche : texte balisé
-- entier, gardé par le md5 (sans \r) du texte précédent ; contenu remplacé seulement s'il égale encore contenu_defaut
-- (une fiche retouchée dans l'admin garde sa retouche) ; titre gardé par égalité exacte ; updated_at, mots_cles et icone
-- ne sont pas écrits. Base de connaissances : clé lower(titre), garde = md5 du contenu. Variantes : seuls les brouillons
-- jamais retouchés sont mis à jour (et base_md5 avec eux) ; une variante validée ou retouchée passe « à revoir ».
-- Idempotente : au 2e passage, tout est « déjà fait ».
--
-- inventaire : {"fiches":["referentiel-articles","referentiel-categories","referentiel-import","categories-produits"],"titres":[],"entrees":[],"variantes":[]}

DO $m249$
DECLARE
  t TEXT;
  n INTEGER;
  faites INTEGER := 0;
  deja INTEGER := 0;
  gardees TEXT[] := ARRAY[]::TEXT[];
  titres_gardes TEXT[] := ARRAY[]::TEXT[];
  retouchees TEXT[] := ARRAY[]::TEXT[];
  b_faites INTEGER := 0;
  b_deja INTEGER := 0;
  b_gardees TEXT[] := ARRAY[]::TEXT[];
  v_faites INTEGER := 0;
  v_deja INTEGER := 0;
  v_gardees TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- ── referentiel-articles ──
  t := $m249_referentiel_articles$## 🧂 [[Nom:article:pl]]

[[Le:article:pl]] sont vos matières premières et [[nom:ingredient:pl]] : c'est le cœur [[du:referentiel]], utilisé pour [[le:stock]], [[le:appro:pl]] et [[le:fiche_technique:pl]]. Vous les gérez depuis le menu **[[Nom:referentiel]] → [[Nom:article:pl]]**.

### Ce que vous voyez

- Un bandeau d'en-tête avec le **nombre total [[de:article:pl]]**.
- Une barre de filtres : champ **Recherche** (sur le nom ou le code), liste **Famille**, liste **Catégorie** (elle se limite aux catégories de la famille choisie), compteur de résultats (ex. « 12 [[nom:article:pl]] sur 87 » quand un filtre est actif) et bouton **Réinitialiser**.
- Deux boutons d'action : **+ Ajout multiple** et **+ [[Nouveau:article]]**, et le bouton **Exporter (modèle Excel)** : tout [[votre:referentiel]], codes, unités, catégories et familles compris, dans le fichier du modèle d'import — les filtres ne s'y appliquent pas.
- Une liste **groupée par famille puis par catégorie** : chaque famille forme une carte avec son nombre de catégories ; chaque catégorie se déplie d'un clic sur la flèche ▶ et affiche son nombre [[de:article:pl]] ([[le:article:pl]] non [[acc:article:classé:classée:pl]] apparaissent sous « Sans catégorie »). Chaque ligne [[de:article]] affiche son nom, son **code** en dessous (ex. FAR-0012), un badge avec son **unité**, et les boutons **✏️ Modifier** et corbeille 🗑️.

### Le code [[de:article:pl]]

Chaque [[nom:article]] porte un **code unique** dans votre compte, bâti sur le **préfixe de sa catégorie** (voir [Catégories](#referentiel-categories)) suivi d'un numéro : FAR-0001, FAR-0002… pour « Farines », SUC-0001 pour « Sucres ». Il est **proposé** à la création — gardez-le ou saisissez le vôtre (2 à 20 caractères : lettres, chiffres, tirets) — et se modifie dans la fiche. [[Un:article]] qui change de catégorie **garde son code**. Le code accompagne le nom partout où [[le:article]] paraît ([[nom:stock]], [[nom:transfert:pl]], inventaires, historiques, factures fournisseur, exports) et sert à la comptabilité : les lignes envoyées à LabFlow Compta le portent (« FAR-0012 Farine ») et la page Comptes d'achat l'affiche. [[Le:article:pl]] créés avant cette version ont reçu leur code automatiquement, dans l'ordre de création de chaque catégorie.

### Actions pas à pas

Créer [[un:article]] (assistant en deux étapes) :

1. Cliquez sur **+ [[Nouveau:article]]**.
2. Étape **Informations** : saisissez le **nom**, choisissez l'**unité** et la **catégorie** (présentée sous la forme Famille › Catégorie) ; le **code** proposé s'affiche, modifiable. Si aucune catégorie n'existe, un message vous invite à en créer d'abord dans [[le:referentiel]]. Cliquez sur **Suivant →**.
3. Étape **Affectation** : cochez [[le:activite:pl]] 📍 et/ou [[nom:labo:pl]] 🏭 où [[le:article]] sera [[acc:article:utilisé:utilisée]] — **au moins un est requis**. Le bouton **Tout sélectionner** coche tout d'un coup et un compteur suit votre sélection.
4. Cliquez sur **Créer [[le:article]]**. Le bouton **← Retour** permet de revenir à l'étape 1.

Créer plusieurs [[nom:article:pl]] d'un coup :

1. Cliquez sur **+ Ajout multiple**.
2. Remplissez chaque ligne : **Nom**, **Unité**, **Catégorie** (le code de chaque ligne est proposé à la création), puis cliquez sur **+ Affecter** pour cocher [[le:activite:pl]] 📍 et [[nom:labo:pl]] 🏭 de la ligne (le bouton affiche ensuite le nombre d'affectations).
3. Ajoutez des lignes avec **+ Ajouter une ligne**, puis cliquez sur **Créer**. Chaque ligne doit être complète (affectation comprise) pour valider.

Modifier [[un:article]] et ses affectations :

1. Cliquez sur **✏️ Modifier** : ajustez le nom, le **code**, l'unité, la catégorie (ou « Sans catégorie »), puis **Enregistrer**. Un code déjà pris par [[un:article]] ou [[un:produit]] est refusé.
2. Dans la section **Affectations** de la même fenêtre, cliquez sur [[un:activite]] ou [[un:labo]] pour l'ajouter ou [[acc:labo:le:la]] retirer : chaque clic est **enregistré immédiatement**, sans passer par Enregistrer.

Supprimer [[un:article]] :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**. [[Le:stock:pl]] et historiques liés sont conservés.

### Points d'attention

:::attention
La corbeille est **grisée** si [[le:article]] a [[un:appro:pl]] [[acc:appro:enregistré:enregistrée:pl]] : la suppression est bloquée.
:::

:::attention
[[Un:article]] non [[acc:article:affecté:affectée]] à [[un:activite]] ou [[un:labo]] n'y apparaît ni en [[nom:stock]], ni en [[nom:appro]], ni dans [[le:fiche_technique:pl]]. L'affectation est la clé qui rend [[le:article]] utilisable sur le terrain.
:::

:::astuce
Pour un gros volume [[de:article:pl]], préférez l'[Ajout dynamique](#referentiel-import) par fichier Excel, puis affinez les affectations depuis la fiche de chaque [[nom:article]]. Le fichier exporté se réimporte tel quel par l'Ajout dynamique, par exemple dans un autre compte.
:::

### Voir aussi

- [Unités](#referentiel-unites) et [Catégories](#referentiel-categories) — à préparer avant de créer [[votre:article:pl]]
- [[[Nom:stock]] [[du:activite:pl]]](#stock-activites) et [[[Nom:fiche_technique:pl]]](#fiches-techniques) — où [[votre:article:pl]] sont [[acc:article:utilisé:utilisée:pl]]
$m249_referentiel_articles$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'referentiel-articles'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '2cb236df04fdacb85f68a5656a5b2cae';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-articles'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'referentiel-articles'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-articles' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'referentiel-articles'::TEXT; END IF;
  -- ── referentiel-categories ──
  t := $m249_referentiel_categories$## 🏷️ Catégories

Les catégories affinent les familles (ex. dans la famille « Viandes » : « Bœuf », « Volaille »…). Elles servent à organiser et filtrer [[votre:article:pl]] dans tout LabFlow, et chacune porte le **préfixe** des codes de ses [[nom:article:pl]]. Vous les gérez depuis le menu **[[Nom:referentiel]] → Catégories**.

### Ce que vous voyez

- Un bandeau d'en-tête avec le **nombre total de catégories**.
- Une barre de filtres : champ **Recherche**, liste déroulante **Famille** (« Toutes les familles ») pour n'afficher que les catégories d'une famille, compteur de résultats, bouton **Réinitialiser** et bouton **+ Nouvelle catégorie**.
- Un tableau à quatre colonnes : **Nom**, **Préfixe** (2 à 4 lettres ou chiffres, ex. FAR : la tête des codes de ses [[nom:article:pl]], FAR-0001, FAR-0002…), **Famille** (nom de la famille de rattachement, ou — si la catégorie n'en a pas) et **Actions** (✏️ Modifier, corbeille 🗑️).

### Actions pas à pas

Créer une ou plusieurs catégories :

1. Cliquez sur **+ Nouvelle catégorie**.
2. Sur chaque ligne, saisissez le **nom** (ex. Viandes) et choisissez la **famille** de rattachement dans la liste déroulante — la famille est obligatoire dès lors que des familles existent. Le **préfixe** se propose d'après le nom (VIA) ; vous pouvez le changer.
3. Cliquez sur **+ Ajouter une ligne** pour en créer plusieurs d'un coup, puis sur **Enregistrer** — dès que plusieurs lignes sont remplies, le bouton indique le nombre de catégories à créer.

Modifier ou reclasser une catégorie :

1. Cliquez sur **✏️ Modifier**.
2. Corrigez le nom, le préfixe et/ou changez la famille de rattachement, puis **Enregistrer**. Un nouveau préfixe ne renumérote pas [[le:article:pl]] déjà [[acc:article:codé:codée:pl]] : leur code reste, les prochains prendront le nouveau préfixe.

Supprimer une catégorie :

1. Cliquez sur la corbeille 🗑️ puis confirmez avec **Supprimer**.
2. [[Le:article:pl]] [[acc:article:rattaché:rattachée:pl]] perdront leur catégorie et apparaîtront en « Sans catégorie » dans l'écran [[[Nom:article:pl]]](#referentiel-articles).

### Points d'attention

:::regle
Le préfixe est **unique dans votre compte**, catégories [[de:article:pl]] et [catégories [[de:produit:pl]]](#categories-produits) confondues : deux catégories ne peuvent pas partager le même, pour qu'aucun code ne prête à confusion. ART et PRD sont réservés aux [[nom:article:pl]] et [[nom:produit:pl]] sans catégorie.
:::

:::attention
La corbeille est **grisée** lorsque [[un:article:pl]] de la catégorie ont [[un:appro:pl]] [[acc:appro:enregistré:enregistrée:pl]] : la suppression est bloquée pour protéger vos historiques.
:::

:::attention
Ne confondez pas les **catégories [[de:article:pl]]** ([[ce:referentiel]], pour vos matières premières) avec les [catégories [[de:produit:pl]]](#categories-produits) [[du:espace_produits:Nom]], qui classent [[votre:produit:pl]] pour [[le:vente]].
:::

:::astuce
Créez d'abord vos [familles](#referentiel-familles) : le formulaire de création exige une famille pour chaque catégorie. Une arborescence claire (famille → catégorie) rend ensuite les filtres et les regroupements beaucoup plus efficaces dans tous les écrans.
:::

### Voir aussi

- [Familles](#referentiel-familles) — le niveau supérieur [[du:referentiel]]
- [[[Nom:article:pl]]](#referentiel-articles) — chaque [[nom:article]] se classe dans une catégorie et en tire son code
- [Catégories [[de:produit:pl]]](#categories-produits) — à ne pas confondre
- [Lexique](#lexique)
$m249_referentiel_categories$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'referentiel-categories'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '8d1862a1e81229e5aa1c9aca63ddc63c';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-categories'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'referentiel-categories'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-categories' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'referentiel-categories'::TEXT; END IF;
  -- ── referentiel-import ──
  t := $m249_referentiel_import$## 📥 Ajout dynamique (import Excel)

L'Ajout Dynamique permet d'importer en masse [[votre:article:pl]] — et en même temps leurs unités, catégories et familles — depuis un fichier Excel. Vous y accédez depuis le menu **[[Nom:referentiel]] → Ajout Dynamique**. C'est le moyen le plus rapide de constituer [[votre:referentiel]] au démarrage.

### Ce que vous voyez

L'écran se présente en étapes numérotées :

- **1️⃣ Téléchargez le modèle** : bouton **📄 Télécharger modele_referentiel.xlsx**, un fichier Excel avec les colonnes **[[Nom:article]] / Unité / Catégorie / Famille / Code**.
- **2️⃣ Uploadez votre fichier rempli** : une zone où **glisser-déposer** le fichier (ou cliquer pour le sélectionner), avec une limite de **1 000 lignes par fichier**. Une fois le fichier choisi, son nom et sa taille s'affichent, avec les boutons **Changer de fichier** et **🚀 Lancer l'import**.
- **Le bilan d'import** : un récapitulatif « Import terminé » avec le nombre de lignes traitées, des compteurs par type (**[[Nom:article:pl]]**, **Auto-[[acc:article:affecté:affectée:pl]]**, **Catégories**, **Familles**, **Unités**, **Erreurs**) et un tableau détaillé ligne par ligne : **Ligne / [[Nom:article]] / Créé / Existant / Affectation / Statut**.

### Actions pas à pas

1. Cliquez sur **📄 Télécharger modele_referentiel.xlsx** et ouvrez le fichier dans Excel.
2. Remplissez **une ligne par [[nom:article]]** : nom [[du:article]], unité, catégorie et famille ; la colonne **Code** est facultative — vide, le code est proposé d'après la catégorie (FAR-0001, FAR-0002…) ; un code déjà pris met la ligne en erreur. Les unités, catégories et familles qui n'existent pas encore dans [[votre:referentiel]] seront **créées automatiquement** (une catégorie créée reçoit son préfixe).
3. Glissez le fichier rempli dans la zone d'import (format Excel .xlsx) puis cliquez sur **🚀 Lancer l'import**.
4. Lisez le bilan : la colonne **Créé** liste les éléments ajoutés par la ligne, la colonne **Existant** ceux qui ont été reconnus et réutilisés. Les lignes en erreur sont surlignées ; survolez le symbole ❌ pour lire la cause exacte.
5. Corrigez si besoin les lignes en erreur dans votre fichier, puis cliquez sur **Importer un autre fichier** pour relancer.

[[Le:article:pl]] [[acc:article:importé:importée:pl]] sont **automatiquement [[acc:article:affecté:affectée:pl]]** à [[votre:activite:pl]] et [[nom:labo:pl]] : [[acc:article:il:elle:pl]] sont immédiatement utilisables en [[nom:stock]] et en [[nom:appro]]. Si [[un:article]] existait déjà mais n'était [[acc:article:affecté:affectée]] nulle part, [[acc:article:il:elle]] est [[acc:article:assigné:assignée]] automatiquement et [[acc:article:signalé:signalée]] par le badge **🔗 auto** dans la colonne Affectation.

### Points d'attention

:::attention
Respectez l'orthographe des unités, familles et catégories déjà présentes dans [[votre:referentiel]] : toute variante d'écriture (accent, pluriel…) peut créer un doublon. Seules les différences de majuscules/minuscules et les espaces en début ou fin de nom sont tolérées pour [[le:article:pl]], unités et familles.
:::

:::attention
Le fichier doit être au format Excel (.xlsx) et ne pas dépasser **1 000 lignes**. Au-delà, découpez votre catalogue en plusieurs fichiers. Un ancien modèle à quatre colonnes (sans Code) reste accepté.

Le fichier obtenu par **Exporter (modèle Excel)** (écran [[[Nom:article:pl]]](#referentiel-articles)) est déjà au format du modèle, codes compris : il se réimporte tel quel. Ce qui manque est créé ; [[un:article]] déjà [[acc:article:présent:présente]] n'est pas [[acc:article:modifié:modifiée]] (ni son code, ni son unité, ni sa catégorie).
:::

:::astuce
Après un import, ajustez finement [[acc:activite:quel:quelle:pl]] [[nom:activite:pl]] et [[acc:labo:quel:quelle:pl]] [[nom:labo:pl]] utilisent chaque [[nom:article]] depuis sa fiche ([[[Nom:article:pl]]](#referentiel-articles)).
:::

### Voir aussi

- [[[Nom:article:pl]]](#referentiel-articles) — création manuelle à l'unité ou en série
- [[[Nom:article:pl]]](#referentiel-articles) — ajuster les affectations après import
- [Unités](#referentiel-unites), [Familles](#referentiel-familles), [Catégories](#referentiel-categories)
- [Bien démarrer](#demarrage)
$m249_referentiel_import$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'referentiel-import'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = '9ce5d9905270675b509286b18ea2f207';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-import'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'referentiel-import'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'referentiel-import' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'referentiel-import'::TEXT; END IF;
  -- ── categories-produits ──
  t := $m249_categories_produits$## 🏷️ Catégories [[de:produit]]

Cet écran vous permet de classer [[votre:produit:pl]] [[de:vente]] en catégories (par exemple « Entrées », « Boissons », « Desserts »). Vous le trouvez dans le menu **Espace [[Pl:produit]] → Catégories [[Court:produit:pl]]**. Ces catégories structurent ensuite la configuration des prix de vente et la saisie [[du:vente:pl]], et chacune porte le **préfixe** des références de ses [[nom:produit:pl]].

### Ce que vous voyez

- Un bandeau d'en-tête avec le **nombre total de catégories** créées.
- Une barre de filtres : champ **Recherche** (filtre sur le nom), liste **Type** (tous les types ou un seul), bouton **Réinitialiser** dès qu'un filtre est actif, et le bouton **+ Nouvelle catégorie**.
- Un tableau à cinq colonnes : **Nom**, **Préfixe** (2 à 4 lettres ou chiffres, ex. DES : la tête des références de ses [[nom:produit:pl]], DES-0001, DES-0002…), **Type** (badge), **[[Pl:produit]]** (nombre [[de:produit:pl]] [[acc:produit:rattaché:rattachée:pl]] à la catégorie) et **Actions** (✏️ Modifier, 🗑️ Supprimer).

Chaque catégorie appartient obligatoirement à **un type**, qui détermine où elle sera proposée :

| Type | Sert à classer |
|---|---|
| 🍽️ [[Nom:produit_vendable]] | [[Le:produit:pl]] [[acc:produit:fini:finie:pl]] [[acc:produit:vendu:vendue:pl]] à la carte (plats, pizzas, formules…) |
| ➕ [[Nom:supplement]] vendable | [[Le:supplement:pl]] [[acc:supplement:vendu:vendue:pl]] en complément (sauce, garniture…) |
| 💎 [[Nom:article]] [[acc:article:valorisé:valorisée]] | [[Le:article:pl]] [[acc:article:revendu:revendue:pl]] [[acc:article:tels quels:telles quelles]] (boissons en bouteille, [[nom:produit:pl]] négoce…) |

### Actions pas à pas

**Créer une ou plusieurs catégories**

1. Cliquez sur **+ Nouvelle catégorie**.
2. Choisissez le **Type** : il s'appliquera à tous les noms saisis dans cette fenêtre.
3. Saisissez un nom par ligne ; le **préfixe** se propose d'après le nom, modifiable. Ajoutez des lignes avec **+ Ajouter une ligne** (la touche Entrée sur la dernière ligne en crée une nouvelle) ; le bouton × retire une ligne.
4. Cliquez sur **Enregistrer** : toutes les lignes remplies sont créées d'un coup.

**Modifier une catégorie**

1. Cliquez sur **✏️ Modifier** sur la ligne concernée.
2. Ajustez le type, le nom et/ou le préfixe, puis **Enregistrer**. Un nouveau préfixe ne change pas les références déjà posées : les prochains [[nom:produit:pl]] le prendront.

**Supprimer une catégorie**

1. Cliquez sur **🗑️**, puis confirmez dans la fenêtre d'avertissement.

### Points d'attention

:::regle
Lors de l'affectation d'une catégorie à [[un:produit]], seules les catégories du **bon type** sont proposées : une catégorie « [[Nom:supplement]] vendable » n'apparaîtra jamais dans la liste d'[[un:produit_vendable]], et inversement.
:::

:::regle
Le préfixe est **unique dans votre compte**, catégories [[de:produit:pl]] et [catégories [[de:article:pl]]](#referentiel-categories) confondues : la référence d'[[un:produit]] (DES-0001) ne peut jamais se confondre avec le code d'[[un:article]]. Sans catégorie, la référence proposée commence par PRD.
:::

:::attention
La suppression d'une catégorie ne supprime pas [[le:produit:pl]] : [[acc:produit:il:elle:pl]] **perdent simplement leur catégorie** et devront être [[acc:produit:reclassé:reclassée:pl]] pour rester bien [[acc:produit:organisé:organisée:pl]] dans la configuration [[de:vente]].
:::

:::astuce
Créez vos catégories **avant** [[votre:produit:pl]] : la catégorie est obligatoire à la création d'[[un:produit_vendable]] ou d'[[un:supplement]], et nécessaire pour qu'[[un:article]] [[acc:article:valorisé:valorisée]] soit [[acc:article:proposé:proposée]] [[au:vente]].
:::

### Voir aussi

- [[[Titre:produit_vendable:pl]]](#produits-vendables) — la catégorie y est exigée à la création
- [[[Titre:produit_valorise:pl]]](#articles-valorises) — assignez une catégorie de type « [[Nom:article]] [[acc:article:valorisé:valorisée]] »
- [Configuration [[Court:vente]]](#configuration-vente) — les catégories y organisent vos prix
- [Saisie [[du:vente:pl]]](#saisie-ventes) — [[le:produit:pl]] y sont [[acc:produit:regroupé:regroupée:pl]] par catégorie
- [Lexique](#lexique)
$m249_categories_produits$;
  UPDATE manuel_sections m SET
    contenu = CASE WHEN replace(m.contenu, E'\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')
                   THEN t ELSE m.contenu END,
    contenu_defaut = t
  WHERE m.slug = 'categories-produits'
    AND md5(replace(COALESCE(m.contenu_defaut, m.contenu), E'\r', '')) = 'd3069122412727e0ccf65884c1a56e32';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 1 THEN faites := faites + 1;
  ELSIF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'categories-produits'
                  AND md5(replace(COALESCE(contenu_defaut, contenu), E'\r', '')) = md5(t)) THEN deja := deja + 1;
  ELSE gardees := gardees || 'categories-produits'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM manuel_sections WHERE slug = 'categories-produits' AND contenu_defaut = t AND replace(contenu, E'\r', '') <> t) THEN retouchees := retouchees || 'categories-produits'::TEXT; END IF;
  RAISE NOTICE '249 : % fiche(s) réécrite(s), % déjà faite(s), % gardée(s) : % ; titres gardés : % ; retouchées dans l''admin (texte servi inchangé, à corriger dans l''admin) : % ; base : % réécrite(s), % déjà faite(s), gardée(s) : % ; variantes (brouillons) : % mise(s) à jour, % déjà faite(s), non touchée(s) (validée, retouchée ou absente : à revoir dans l''admin) : %',
    faites, deja, cardinality(gardees),
    COALESCE(NULLIF(array_to_string(gardees, ', '), ''), 'aucune'),
    COALESCE(NULLIF(array_to_string(titres_gardes, ', '), ''), 'aucun'),
    COALESCE(NULLIF(array_to_string(retouchees, ', '), ''), 'aucune'),
    b_faites, b_deja,
    COALESCE(NULLIF(array_to_string(b_gardees, ', '), ''), 'aucune'),
    v_faites, v_deja,
    COALESCE(NULLIF(array_to_string(v_gardees, ', '), ''), 'aucune');
END
$m249$;
