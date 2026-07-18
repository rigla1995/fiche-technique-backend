-- 172 — Manuel : alignement sur les chantiers du 18/07.
--  1. Exports PDF d'historiques supprimés (Excel seul, charte LabFlow) ; la
--     sélection de lignes SURLIGNE dans le fichier, elle ne filtre pas.
--  2. Fiche Technique refondue : FT Stock multi-bases (activités/labos assignés)
--     × DP/PMP (un Excel par base, un onglet par méthode), FT Manuel par base,
--     produits fabriqués au labo limités aux bases labo.
--  3. Mon abonnement : bloc Module Vente supprimé, ligne Base acheteurs,
--     période de la promotion mensuelle.
--  4. Compte sans activité : Espace Vente / Transferts / Produits Vendables
--     masqués (réapparition à la première activité).
-- Pattern migr 167/170 : REPLACE ciblés sur contenu ET contenu_defaut
-- (idempotents, n'écrasent pas les éditions admin) ; la fiche
-- fiches-techniques est réécrite entièrement (pattern migr 169 : contenu
-- seulement si non édité, contenu_defaut toujours).

-- ── 1a. historique : export Excel seul + sélection = surbrillance ────────────
-- (la mention « mêmes exports Excel et PDF » de sa section Historique des
-- pertes est corrigée ici aussi — elle vit dans CETTE fiche, pas dans `pertes`)
UPDATE manuel_sections SET
  contenu = REPLACE(REPLACE(REPLACE(contenu,
    $o$et les exports **Excel** (bouton « Exporter ») et **PDF**.$o$,
    $n$et l'export **Excel** (bouton « Exporter »), à la charte LabFlow (logo et mise en forme unifiés).$n$),
    $o$cochez quelques enregistrements pour limiter l'export à cette sélection — le bouton indique alors « Exporter (N) ».$o$,
    $n$cochez des enregistrements pour les **surligner** (ambre) dans le fichier exporté — l'export garde toutes les lignes filtrées et le bouton indique alors « Exporter (N) ».$n$),
    $o$mêmes exports Excel et PDF.$o$,
    $n$même export Excel.$n$),
  contenu_defaut = REPLACE(REPLACE(REPLACE(contenu_defaut,
    $o$et les exports **Excel** (bouton « Exporter ») et **PDF**.$o$,
    $n$et l'export **Excel** (bouton « Exporter »), à la charte LabFlow (logo et mise en forme unifiés).$n$),
    $o$cochez quelques enregistrements pour limiter l'export à cette sélection — le bouton indique alors « Exporter (N) ».$o$,
    $n$cochez des enregistrements pour les **surligner** (ambre) dans le fichier exporté — l'export garde toutes les lignes filtrées et le bouton indique alors « Exporter (N) ».$n$),
    $o$mêmes exports Excel et PDF.$o$,
    $n$même export Excel.$n$),
  updated_at = NOW()
WHERE slug = 'historique';

-- ── 1b. inventaire ───────────────────────────────────────────────────────────
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    $o$export **Excel** et **PDF** (éventuellement limité aux lignes cochées)$o$,
    $n$export **Excel** (les lignes cochées y sont surlignées)$n$),
  contenu_defaut = REPLACE(contenu_defaut,
    $o$export **Excel** et **PDF** (éventuellement limité aux lignes cochées)$o$,
    $n$export **Excel** (les lignes cochées y sont surlignées)$n$),
  updated_at = NOW()
WHERE slug = 'inventaire';

-- ── 1c. pertes ───────────────────────────────────────────────────────────────
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    $o$Export **Excel** et **PDF**, éventuellement limité aux lignes cochées.$o$,
    $n$Export **Excel**, avec surbrillance des lignes cochées.$n$),
  contenu_defaut = REPLACE(contenu_defaut,
    $o$Export **Excel** et **PDF**, éventuellement limité aux lignes cochées.$o$,
    $n$Export **Excel**, avec surbrillance des lignes cochées.$n$),
  updated_at = NOW()
WHERE slug = 'pertes';

-- ── 1d. transferts ───────────────────────────────────────────────────────────
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    $o$sélectionnez des lignes si besoin, exportez en Excel ou en PDF, modifiez$o$,
    $n$sélectionnez des lignes si besoin (elles seront surlignées dans le fichier), exportez en Excel, modifiez$n$),
  contenu_defaut = REPLACE(contenu_defaut,
    $o$sélectionnez des lignes si besoin, exportez en Excel ou en PDF, modifiez$o$,
    $n$sélectionnez des lignes si besoin (elles seront surlignées dans le fichier), exportez en Excel, modifiez$n$),
  updated_at = NOW()
WHERE slug = 'transferts';

-- ── 1e. calc-ht-ttc ──────────────────────────────────────────────────────────
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    $o$**Les exports détaillés de l'historique des approvisionnements** (Excel et PDF) : colonnes$o$,
    $n$**Les exports Excel détaillés de l'historique des approvisionnements** : colonnes$n$),
  contenu_defaut = REPLACE(contenu_defaut,
    $o$**Les exports détaillés de l'historique des approvisionnements** (Excel et PDF) : colonnes$o$,
    $n$**Les exports Excel détaillés de l'historique des approvisionnements** : colonnes$n$),
  updated_at = NOW()
WHERE slug = 'calc-ht-ttc';

-- ── 2a. fiches-techniques : réécriture complète (flux multi-bases) ───────────
WITH v AS (SELECT $m172ft$## 📋 Fiches Techniques & coût de revient

La fiche technique détaille la **composition d'un produit** et calcule son **coût de revient matière**. Vous y accédez par le bouton **Fiche tech.** présent sur chaque carte produit — Produits Vendables, Produits Utilisables et Produits Valorisés composés.

### Ce que vous voyez

La fenêtre Fiche Technique affiche :

1. **La composition du produit** : chaque ingrédient avec sa portion et son unité, et les sous-préparations (↳) avec leurs propres composants.
2. Le choix du mode : **📦 FT Stock** (prix issus de vos approvisionnements) ou **✏️ FT Manuel** (prix saisis à la main).
3. En FT Stock, la **base de prix** : cochez une ou plusieurs bases parmi les **activités et labos assignés** au produit, puis la ou les **méthodes** — **DP (Dernier Prix)** et/ou **PMP (Prix Moyen Pondéré)**.
4. Le **coût en temps réel, ligne par ligne** : une ligne par base et par méthode (ex. « 🏪 Boutique · PMP = 4.250 DT », « 🏭 Labo · DP = 3.980 DT »). Un ⚠ signale les bases où des articles n'ont pas encore d'approvisionnement (coût partiel).

### Les méthodes de valorisation

| Méthode | Principe |
|---|---|
| **DP** — Dernier Prix | Chaque article est valorisé au prix TTC de son **dernier approvisionnement** |
| **PMP** — Prix Moyen Pondéré | Chaque article est valorisé à la **moyenne pondérée des prix d'appro depuis le dernier inventaire** |
| ✏️ FT Manuel | Vous **saisissez les prix** vous-même ; ils sont mémorisés **par base de prix**, avec leur date de mise à jour |

DP et PMP sont cumulables : chaque fichier Excel généré contient alors **deux onglets**, un par méthode.

### Actions pas à pas

**Générer une fiche sur les prix du stock**

1. Choisissez **📦 FT Stock**, puis cochez la ou les **bases de prix** (activités / labos assignés au produit) et la ou les méthodes **DP / PMP**.
2. Contrôlez les coûts en temps réel, puis cliquez sur **Générer** : LabFlow produit **un fichier Excel par base sélectionnée** (deux bases = deux fichiers), chacun avec un onglet par méthode cochée, à la charte LabFlow.

**Générer une fiche en prix manuels**

1. Choisissez **✏️ FT Manuel** et sélectionnez la **base de prix** concernée — les prix manuels sont mémorisés séparément pour chaque base.
2. Cliquez **Saisir les prix manuels** : la fenêtre liste tous les articles de la recette, y compris ceux des sous-préparations (groupes indentés ↳), avec un champ de recherche. Tant qu'un prix est à 0, une alerte « Prix incomplets » bloque l'enregistrement et la génération.
3. Enregistrez puis cliquez sur **Générer** ; la date de dernière mise à jour des prix reste affichée.

### Formules de calcul

:::formule Coût d'une ligne d'ingrédient
Coût ligne = portion × prix unitaire
note: La portion est exprimée dans l'unité de l'article.
:::

:::formule Coût total du produit
Coût total = Σ ( coûts des articles ) + Σ ( portion sous-produit × coût unitaire du sous-produit )
note: Le calcul descend récursivement dans chaque sous-préparation — détail dans [Comprendre le coût d'une recette](#calc-cout-recette).
:::

### Points d'attention

:::regle
Un produit **fabriqué au labo** (composé valorisé) est limité aux transferts côté activité : seules ses **bases labo** sont proposées pour la fiche technique.
:::

:::attention
Une base dont certains articles n'ont **pas d'approvisionnement** est signalée par un ⚠ : son coût affiché et exporté est **partiel** (articles manquants comptés à 0). Complétez vos appros, ou utilisez le mode manuel.
:::

:::astuce
Comparez **DP et PMP** sur un même produit : un écart important signale des prix d'achat volatils, à surveiller avant de fixer vos prix de vente.
:::

### Voir aussi

- [Comprendre le coût d'une recette](#calc-cout-recette)
- [Prix moyen pondéré](#calc-pmp) et [HT / TTC](#calc-ht-ttc)
- [Fixation des prix de vente](#calc-prix)
- [Produits Vendables](#produits-vendables) et [Produits Utilisables](#produits-utilisables)
- [Stock des activités](#stock-activites)$m172ft$::text AS c)
UPDATE manuel_sections m SET
  contenu = CASE WHEN m.contenu IS NOT DISTINCT FROM m.contenu_defaut THEN v.c ELSE m.contenu END,
  contenu_defaut = v.c,
  updated_at = NOW()
FROM v WHERE m.slug = 'fiches-techniques';

-- ── 2b. calc-cout-recette : vocabulaire FT Stock / DP / PMP + base choisie ───
UPDATE manuel_sections SET
  contenu = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(contenu,
    $o$selon le mode choisi au moment de générer la fiche technique (carte *FP Stock* avec ses boutons *DP* / *MP*, ou carte *FP Manuel*) :$o$,
    $n$selon le mode choisi au moment de générer la fiche technique (carte *FT Stock* avec ses méthodes *DP* / *PMP*, ou carte *FT Manuel*) :$n$),
    $o$**Prix moyen pondéré (PMP)** — bouton *MP* :$o$,
    $n$**Prix moyen pondéré (PMP)** — méthode *PMP* :$n$),
    $o$**Dernier prix** — bouton *DP* :$o$,
    $n$**Dernier prix** — méthode *DP* :$n$),
    $o$**Prix manuel** — carte *FP Manuel* : un prix que vous saisissez vous-même sur la fiche technique, pour simuler un coût.$o$,
    $n$**Prix manuel** — carte *FT Manuel* : un prix que vous saisissez vous-même, mémorisé par base de prix, pour simuler un coût.$n$),
    $o$- **Le lieu de fabrication** : pour un produit fabriqué au labo, les prix proviennent du stock du labo ; pour un produit d'activité, ils proviennent du stock de l'activité, avec repli sur les prix du labo lié quand l'article n'a pas encore de prix côté activité.$o$,
    $n$- **La base de prix choisie** : la fiche technique se génère pour une ou plusieurs bases (activités ou labos assignés au produit) — les prix proviennent du stock de chaque base, avec repli sur les prix du labo lié quand un article n'a pas encore de prix côté activité. Un produit fabriqué au labo se calcule uniquement sur ses bases labo.$n$),
  contenu_defaut = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(contenu_defaut,
    $o$selon le mode choisi au moment de générer la fiche technique (carte *FP Stock* avec ses boutons *DP* / *MP*, ou carte *FP Manuel*) :$o$,
    $n$selon le mode choisi au moment de générer la fiche technique (carte *FT Stock* avec ses méthodes *DP* / *PMP*, ou carte *FT Manuel*) :$n$),
    $o$**Prix moyen pondéré (PMP)** — bouton *MP* :$o$,
    $n$**Prix moyen pondéré (PMP)** — méthode *PMP* :$n$),
    $o$**Dernier prix** — bouton *DP* :$o$,
    $n$**Dernier prix** — méthode *DP* :$n$),
    $o$**Prix manuel** — carte *FP Manuel* : un prix que vous saisissez vous-même sur la fiche technique, pour simuler un coût.$o$,
    $n$**Prix manuel** — carte *FT Manuel* : un prix que vous saisissez vous-même, mémorisé par base de prix, pour simuler un coût.$n$),
    $o$- **Le lieu de fabrication** : pour un produit fabriqué au labo, les prix proviennent du stock du labo ; pour un produit d'activité, ils proviennent du stock de l'activité, avec repli sur les prix du labo lié quand l'article n'a pas encore de prix côté activité.$o$,
    $n$- **La base de prix choisie** : la fiche technique se génère pour une ou plusieurs bases (activités ou labos assignés au produit) — les prix proviennent du stock de chaque base, avec repli sur les prix du labo lié quand un article n'a pas encore de prix côté activité. Un produit fabriqué au labo se calcule uniquement sur ses bases labo.$n$),
  updated_at = NOW()
WHERE slug = 'calc-cout-recette';

-- ── 2c. articles-valorises : plus de fenêtre de choix du labo ────────────────
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    $o$si le produit est fabriqué dans plusieurs labos, une fenêtre vous demande de choisir le labo de référence.$o$,
    $n$si le produit est fabriqué dans plusieurs labos, cochez directement les bases souhaitées dans la fenêtre — un fichier Excel est généré **par labo sélectionné** (voir [Fiches Techniques](#fiches-techniques)).$n$),
  contenu_defaut = REPLACE(contenu_defaut,
    $o$si le produit est fabriqué dans plusieurs labos, une fenêtre vous demande de choisir le labo de référence.$o$,
    $n$si le produit est fabriqué dans plusieurs labos, cochez directement les bases souhaitées dans la fenêtre — un fichier Excel est généré **par labo sélectionné** (voir [Fiches Techniques](#fiches-techniques)).$n$),
  updated_at = NOW()
WHERE slug = 'articles-valorises';

-- ── 3. abonnement : bloc Module Vente retiré, base acheteurs, période promo ──
UPDATE manuel_sections SET
  contenu = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(contenu,
    $o$, état du compte, contrat et module vente.$o$,
    $n$, état du compte et contrat.$n$),
    $o$de **gérants** inclus (mention *Non inclus* sinon), votre **formule d'activités**$o$,
    $n$de **gérants** inclus (mention *Non inclus* sinon), la **base acheteurs** avec son palier (« jusqu'à N acheteurs ») quand l'option est active, votre **formule d'activités**$n$),
    $o$l'ancien prix apparaît barré avec la mention 🎉 *Promotion appliquée*.$o$,
    $n$l'ancien prix apparaît barré avec la mention 🎉 *Promotion appliquée* et la **période de la promotion** : « Du … au … à ce prix — à partir du lendemain, tarif normal », ou la mention *promotion permanente*.$n$),
    $o$- **🛒 Module Vente** : son statut (✅ Actif / 🔒 Inactif). S'il est inactif, le bouton **🚀 Demander l'activation** envoie une demande à l'équipe LabFlow ; en attendant la validation, la mention ⏳ *Demande en attente* s'affiche.
$o$,
    $n$$n$),
    $o$2. **Activer le module vente** : cliquez *🚀 Demander l'activation* ; l'équipe LabFlow valide la demande, puis l'Espace Vente apparaît dans votre menu.
3. **Passer en formule Premium**$o$,
    $n$2. **Passer en formule Premium**$n$),
    $o$4. **Demander plus d'activités, de labos ou de gérants**$o$,
    $n$3. **Demander plus d'activités, de labos ou de gérants**$n$),
    $o$5. **Activer l'option Acheteurs ou changer de palier**$o$,
    $n$4. **Activer l'option Acheteurs ou changer de palier**$n$),
  contenu_defaut = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(contenu_defaut,
    $o$, état du compte, contrat et module vente.$o$,
    $n$, état du compte et contrat.$n$),
    $o$de **gérants** inclus (mention *Non inclus* sinon), votre **formule d'activités**$o$,
    $n$de **gérants** inclus (mention *Non inclus* sinon), la **base acheteurs** avec son palier (« jusqu'à N acheteurs ») quand l'option est active, votre **formule d'activités**$n$),
    $o$l'ancien prix apparaît barré avec la mention 🎉 *Promotion appliquée*.$o$,
    $n$l'ancien prix apparaît barré avec la mention 🎉 *Promotion appliquée* et la **période de la promotion** : « Du … au … à ce prix — à partir du lendemain, tarif normal », ou la mention *promotion permanente*.$n$),
    $o$- **🛒 Module Vente** : son statut (✅ Actif / 🔒 Inactif). S'il est inactif, le bouton **🚀 Demander l'activation** envoie une demande à l'équipe LabFlow ; en attendant la validation, la mention ⏳ *Demande en attente* s'affiche.
$o$,
    $n$$n$),
    $o$2. **Activer le module vente** : cliquez *🚀 Demander l'activation* ; l'équipe LabFlow valide la demande, puis l'Espace Vente apparaît dans votre menu.
3. **Passer en formule Premium**$o$,
    $n$2. **Passer en formule Premium**$n$),
    $o$4. **Demander plus d'activités, de labos ou de gérants**$o$,
    $n$3. **Demander plus d'activités, de labos ou de gérants**$n$),
    $o$5. **Activer l'option Acheteurs ou changer de palier**$o$,
    $n$4. **Activer l'option Acheteurs ou changer de palier**$n$),
  updated_at = NOW()
WHERE slug = 'abonnement';

-- ── 4a. demarrage : Espace Vente = vente des activités ───────────────────────
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    $o$L'Espace Vente apparaît quant à lui lorsque le module vente est activé sur votre compte et qu'un premier article existe au référentiel ;$o$,
    $n$L'Espace Vente apparaît quant à lui lorsque le module vente est activé sur votre compte, qu'un premier article existe au référentiel **et qu'au moins une activité est créée** — il concerne la vente des activités : un compte sans activité ne le voit pas, tout comme les liens Transferts et Produits Vendables ;$n$),
  contenu_defaut = REPLACE(contenu_defaut,
    $o$L'Espace Vente apparaît quant à lui lorsque le module vente est activé sur votre compte et qu'un premier article existe au référentiel ;$o$,
    $n$L'Espace Vente apparaît quant à lui lorsque le module vente est activé sur votre compte, qu'un premier article existe au référentiel **et qu'au moins une activité est créée** — il concerne la vente des activités : un compte sans activité ne le voit pas, tout comme les liens Transferts et Produits Vendables ;$n$),
  updated_at = NOW()
WHERE slug = 'demarrage';

-- ── 4b. compte-activites-labos : menu allégé du compte dépôt ─────────────────
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    $o$C'est le modèle de l'atelier de production qui ne vend qu'aux professionnels.$o$,
    $n$C'est le modèle de l'atelier de production qui ne vend qu'aux professionnels. Son menu est allégé : sans activité, l'Espace Vente, les Transferts et les Produits Vendables sont masqués — ils réapparaissent automatiquement dès la première activité créée.$n$),
  contenu_defaut = REPLACE(contenu_defaut,
    $o$C'est le modèle de l'atelier de production qui ne vend qu'aux professionnels.$o$,
    $n$C'est le modèle de l'atelier de production qui ne vend qu'aux professionnels. Son menu est allégé : sans activité, l'Espace Vente, les Transferts et les Produits Vendables sont masqués — ils réapparaissent automatiquement dès la première activité créée.$n$),
  updated_at = NOW()
WHERE slug = 'compte-activites-labos';
